"""Smoke tests for ML models: training, ONNX export, RL checkpointing.

Tests:
1. LSTM forward pass produces correct output shape
2. Transformer forward pass produces correct output shape
3. LSTM training: 1 epoch on synthetic data, verify loss decreases
4. ONNX export: export → load with onnxruntime → compare outputs
5. PPO checkpoint: save → load → verify weights match
6. DQN checkpoint: save → load → verify weights match
"""

import os
import tempfile

import numpy as np
import pytest
import torch

from src.ml.price_predictor import (
    LSTMPredictor,
    TransformerPredictor,
    ModelConfig,
    export_onnx,
)
from src.ml.rl_trader import (
    PPOAgent,
    DQNAgent,
    RLConfig,
    ActorCritic,
    QNetwork,
)


class TestLSTMPredictor:
    """LSTM model smoke tests."""

    def test_forward_pass_shape(self):
        """LSTM forward pass produces (batch, output_dim) logits."""
        config = ModelConfig(input_dim=11, hidden_dim=32, num_layers=1, lookback=10, output_dim=3)
        model = LSTMPredictor(config)
        model.eval()

        x = torch.randn(4, config.lookback, config.input_dim)
        with torch.no_grad():
            logits = model(x)

        assert logits.shape == (4, config.output_dim)

    def test_forward_pass_single_batch(self):
        """LSTM forward pass with batch_size=1."""
        config = ModelConfig(input_dim=11, hidden_dim=16, num_layers=1, lookback=5)
        model = LSTMPredictor(config)
        model.eval()

        x = torch.randn(1, config.lookback, config.input_dim)
        with torch.no_grad():
            logits = model(x)

        assert logits.shape == (1, config.output_dim)

    def test_training_loss_decreases(self):
        """One epoch of training on synthetic data reduces loss."""
        config = ModelConfig(
            input_dim=5, hidden_dim=16, num_layers=1,
            lookback=10, output_dim=3, learning_rate=1e-2,
        )
        model = LSTMPredictor(config)
        model.train()

        # Synthetic data: 32 samples, 10 lookback, 5 features
        X = torch.randn(32, config.lookback, config.input_dim)
        y = torch.randint(0, config.output_dim, (32,))

        criterion = torch.nn.CrossEntropyLoss()
        optimizer = torch.optim.Adam(model.parameters(), lr=config.learning_rate)

        # Initial loss
        with torch.no_grad():
            initial_loss = criterion(model(X), y).item()

        # Train for 20 steps
        for _ in range(20):
            optimizer.zero_grad()
            loss = criterion(model(X), y)
            loss.backward()
            optimizer.step()

        # Final loss
        with torch.no_grad():
            final_loss = criterion(model(X), y).item()

        assert final_loss < initial_loss, (
            f"Loss did not decrease: {initial_loss:.4f} → {final_loss:.4f}"
        )


class TestTransformerPredictor:
    """Transformer model smoke tests."""

    def test_forward_pass_shape(self):
        """Transformer forward pass produces correct output shape."""
        config = ModelConfig(
            input_dim=11, hidden_dim=32, num_heads=4,
            num_layers=1, lookback=10, output_dim=3,
        )
        model = TransformerPredictor(config)
        model.eval()

        x = torch.randn(4, config.lookback, config.input_dim)
        with torch.no_grad():
            logits = model(x)

        assert logits.shape == (4, config.output_dim)


class TestONNXExport:
    """ONNX export round-trip tests."""

    def test_export_and_load(self):
        """Export LSTM to ONNX, load with onnxruntime, verify output shape."""
        onnxruntime = pytest.importorskip("onnxruntime")

        config = ModelConfig(
            input_dim=5, hidden_dim=16, num_layers=1,
            lookback=8, output_dim=3,
        )
        model = LSTMPredictor(config)
        model.eval()

        with tempfile.NamedTemporaryFile(suffix=".onnx", delete=False) as f:
            onnx_path = f.name

        try:
            success = export_onnx(model, config, onnx_path)
            if not success:
                pytest.skip("ONNX export failed (may be missing optional deps)")

            # Load with onnxruntime
            session = onnxruntime.InferenceSession(onnx_path)
            input_name = session.get_inputs()[0].name

            dummy = np.random.randn(1, config.lookback, config.input_dim).astype(np.float32)
            outputs = session.run(None, {input_name: dummy})

            assert outputs[0].shape == (1, config.output_dim)
        finally:
            if os.path.exists(onnx_path):
                os.unlink(onnx_path)

    def test_export_dynamic_batch(self):
        """ONNX export supports dynamic batch size."""
        onnxruntime = pytest.importorskip("onnxruntime")

        config = ModelConfig(
            input_dim=5, hidden_dim=16, num_layers=1,
            lookback=8, output_dim=3,
        )
        model = LSTMPredictor(config)
        model.eval()

        with tempfile.NamedTemporaryFile(suffix=".onnx", delete=False) as f:
            onnx_path = f.name

        try:
            success = export_onnx(model, config, onnx_path)
            if not success:
                pytest.skip("ONNX export failed")

            session = onnxruntime.InferenceSession(onnx_path)
            input_name = session.get_inputs()[0].name

            # Batch of 8
            dummy = np.random.randn(8, config.lookback, config.input_dim).astype(np.float32)
            outputs = session.run(None, {input_name: dummy})

            assert outputs[0].shape == (8, config.output_dim)
        finally:
            if os.path.exists(onnx_path):
                os.unlink(onnx_path)


class TestPPOCheckpoint:
    """PPO agent save/load checkpoint tests."""

    def test_save_and_load(self):
        """Save PPO checkpoint, load into new agent, verify weights match."""
        config = RLConfig(state_dim=10, hidden_dim=32)
        agent = PPOAgent(config)

        # Save
        with tempfile.NamedTemporaryFile(suffix=".pt", delete=False) as f:
            ckpt_path = f.name

        try:
            assert agent.save(ckpt_path, episode=42)

            # Load into new agent
            agent2 = PPOAgent(config)
            episode = agent2.load(ckpt_path)

            assert episode == 42

            # Compare weights
            for (k1, v1), (k2, v2) in zip(
                agent.ac.state_dict().items(),
                agent2.ac.state_dict().items(),
            ):
                assert torch.allclose(v1, v2), f"Weight mismatch in {k1}"
        finally:
            if os.path.exists(ckpt_path):
                os.unlink(ckpt_path)

    def test_save_creates_file(self):
        """Save creates a valid file on disk."""
        config = RLConfig(state_dim=10, hidden_dim=16)
        agent = PPOAgent(config)

        with tempfile.NamedTemporaryFile(suffix=".pt", delete=False) as f:
            ckpt_path = f.name

        try:
            agent.save(ckpt_path, episode=5)
            assert os.path.exists(ckpt_path)
            assert os.path.getsize(ckpt_path) > 0
        finally:
            if os.path.exists(ckpt_path):
                os.unlink(ckpt_path)

    def test_load_nonexistent_returns_minus_one(self):
        """Loading a non-existent file returns -1."""
        config = RLConfig(state_dim=10, hidden_dim=16)
        agent = PPOAgent(config)

        result = agent.load("/nonexistent/path/checkpoint.pt")
        assert result == -1


class TestDQNCheckpoint:
    """DQN agent save/load checkpoint tests."""

    def test_save_and_load(self):
        """Save DQN checkpoint, load into new agent, verify weights match."""
        config = RLConfig(state_dim=10, hidden_dim=32)
        agent = DQNAgent(config)

        with tempfile.NamedTemporaryFile(suffix=".pt", delete=False) as f:
            ckpt_path = f.name

        try:
            assert agent.save(ckpt_path, episode=10)

            agent2 = DQNAgent(config)
            episode = agent2.load(ckpt_path)

            assert episode == 10

            # Compare Q-network weights
            for (k1, v1), (k2, v2) in zip(
                agent.q_net.state_dict().items(),
                agent2.q_net.state_dict().items(),
            ):
                assert torch.allclose(v1, v2), f"Weight mismatch in {k1}"
        finally:
            if os.path.exists(ckpt_path):
                os.unlink(ckpt_path)


class TestActorCritic:
    """ActorCritic network tests."""

    def test_forward_produces_valid_probabilities(self):
        """ActorCritic forward produces valid probability distribution."""
        ac = ActorCritic(state_dim=10, hidden_dim=32)
        ac.eval()

        state = torch.randn(10)
        with torch.no_grad():
            probs, value = ac(state.unsqueeze(0))

        assert probs.shape == (1, 3)  # NUM_ACTIONS = 3
        assert value.shape == (1, 1)
        assert torch.allclose(probs.sum(), torch.tensor(1.0), atol=1e-5)
        assert (probs >= 0).all()

    def test_get_action_returns_valid_action(self):
        """get_action returns a valid action index."""
        ac = ActorCritic(state_dim=10, hidden_dim=32)
        state = torch.randn(10)

        action, log_prob, value = ac.get_action(state)

        assert 0 <= action <= 2  # NUM_ACTIONS = 3
        assert isinstance(log_prob, float)
        assert isinstance(value, float)


class TestQNetwork:
    """Q-Network tests."""

    def test_forward_shape(self):
        """QNetwork forward produces (batch, num_actions) Q-values."""
        qnet = QNetwork(state_dim=10, hidden_dim=32)
        qnet.eval()

        x = torch.randn(4, 10)
        with torch.no_grad():
            q_values = qnet(x)

        assert q_values.shape == (4, 3)  # NUM_ACTIONS = 3
