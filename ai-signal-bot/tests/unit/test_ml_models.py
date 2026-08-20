"""Tests for ml/ modules — environment, lstm_model, transformer_model, rl_agent.

Modules price_predictor.py and rl_trader.py require torch and are skipped if unavailable.
"""
import os
import tempfile

import numpy as np
import pytest

from src.ml.environment import Action, TradingEnv, TradingState
from src.ml.lstm_model import LSTMConfig, LSTMModel
from src.ml.transformer_model import TransformerConfig, TransformerModel
from src.ml.rl_agent import RLConfig, DQNAgent


# ─── TradingEnv ───


@pytest.fixture
def env():
    return TradingEnv(initial_cash=100000, transaction_cost=0.001)


@pytest.fixture
def prices():
    np.random.seed(42)
    return np.cumsum(np.random.randn(100)) + 100


class TestAction:
    def test_values(self):
        assert Action.HOLD.value == 0
        assert Action.BUY.value == 1
        assert Action.SELL.value == 2


class TestTradingState:
    def test_creation(self):
        ts = TradingState(
            prices=np.array([100, 101]),
            portfolio_value=10000,
            position=5.0,
            cash=5000,
            features=np.array([1.0]),
        )
        assert ts.portfolio_value == 10000
        assert ts.position == 5.0


class TestTradingEnv:
    def test_init_defaults(self, env):
        assert env.initial_cash == 100000
        assert env.transaction_cost == 0.001
        assert env.action_space_n == 3
        assert env.observation_space_n == 63
        assert env.current_step == 0
        assert env.cash == 100000

    def test_init_custom(self):
        env = TradingEnv(initial_cash=50000, transaction_cost=0.002)
        assert env.initial_cash == 50000
        assert env.transaction_cost == 0.002

    def test_reset(self, env, prices):
        obs = env.reset(prices)
        assert obs.shape == (63,)
        assert env.current_step == 0
        assert env.cash == 100000
        assert env.position == 0.0

    def test_reset_with_features(self, env, prices):
        features = np.random.randn(100, 5)
        obs = env.reset(prices, features)
        assert obs.shape == (63,)
        assert env.features is not None

    def test_step_hold(self, env, prices):
        env.reset(prices)
        obs, reward, done, info = env.step(Action.HOLD.value)
        assert obs.shape == (63,)
        assert isinstance(reward, float)
        assert isinstance(done, bool)
        assert isinstance(info, dict)
        assert env.current_step == 1

    def test_step_buy(self, env, prices):
        env.reset(prices)
        obs, reward, done, info = env.step(Action.BUY.value)
        assert env.position > 0
        assert env.cash == 0
        assert env.trade_count == 1

    def test_step_sell_no_position(self, env, prices):
        env.reset(prices)
        obs, reward, done, info = env.step(Action.SELL.value)
        assert env.position == 0
        assert env.trade_count == 0

    def test_step_buy_then_sell(self, env, prices):
        env.reset(prices)
        env.step(Action.BUY.value)
        env.step(Action.HOLD.value)
        obs, reward, done, info = env.step(Action.SELL.value)
        assert env.position == 0
        assert env.cash > 0
        assert env.trade_count == 2

    def test_step_done_at_end(self, env, prices):
        env.reset(prices)
        for _ in range(len(prices) - 1):
            _, _, done, _ = env.step(Action.HOLD.value)
        assert done is True

    def test_step_past_end(self, env, prices):
        env.reset(prices)
        for _ in range(len(prices)):
            env.step(Action.HOLD.value)
        obs, reward, done, info = env.step(Action.HOLD.value)
        assert done is True
        assert reward == 0.0

    def test_render_no_crash(self, env, prices):
        env.reset(prices)
        env.render()

    def test_close(self, env, prices):
        env.reset(prices)
        env.close()
        assert env.current_step == 0
        assert env.position == 0.0
        assert env.cash == 0.0

    def test_observation_normalization(self, env, prices):
        env.reset(prices)
        obs = env._get_observation()
        assert obs.shape == (63,)
        assert np.isfinite(obs).all()


# ─── LSTMModel ───


@pytest.fixture
def lstm():
    config = LSTMConfig(input_size=1, hidden_size=32, num_layers=1, sequence_length=10)
    return LSTMModel(config)


class TestLSTMConfig:
    def test_defaults(self):
        cfg = LSTMConfig()
        assert cfg.input_size == 1
        assert cfg.hidden_size == 64
        assert cfg.num_layers == 2
        assert cfg.output_size == 1
        assert cfg.dropout == 0.2
        assert cfg.sequence_length == 60


class TestLSTMModel:
    def test_init(self, lstm):
        assert lstm.is_trained is False
        assert lstm.scaler_mean == 0.0
        assert lstm.scaler_std == 1.0
        assert lstm.weights is None

    def test_fit_scaler(self, lstm):
        data = np.array([1, 2, 3, 4, 5], dtype=float)
        lstm.fit_scaler(data)
        assert lstm.scaler_mean == pytest.approx(3.0)
        assert lstm.scaler_std > 0

    def test_fit_scaler_constant(self, lstm):
        data = np.array([5, 5, 5, 5], dtype=float)
        lstm.fit_scaler(data)
        assert lstm.scaler_std == 1.0

    def test_normalize(self, lstm):
        lstm.scaler_mean = 10
        lstm.scaler_std = 2
        result = lstm._normalize(np.array([12]))
        assert result[0] == pytest.approx(1.0)

    def test_denormalize(self, lstm):
        lstm.scaler_mean = 10
        lstm.scaler_std = 2
        result = lstm._denormalize(np.array([1.0]))
        assert result[0] == pytest.approx(12.0)

    def test_create_sequences(self, lstm):
        data = np.arange(20, dtype=float)
        X, y = lstm._create_sequences(data, 5)
        assert X.shape == (15, 5)
        assert y.shape == (15,)
        assert y[0] == 5

    def test_train(self, lstm):
        data = np.cumsum(np.random.randn(50)) + 100
        history = lstm.train(data, epochs=3, batch_size=8)
        assert lstm.is_trained is True
        assert "loss" in history
        assert "epochs" in history
        assert history["epochs"] == 3

    def test_predict_untrained(self, lstm):
        data = np.arange(20, dtype=float)
        with pytest.raises(ValueError, match="trained"):
            lstm.predict(data)

    def test_predict_short_data(self, lstm):
        lstm.is_trained = True
        lstm.weights = np.random.randn(10, 1) * 0.01
        lstm.bias = np.zeros(1)
        data = np.arange(5, dtype=float)
        with pytest.raises(ValueError, match="at least"):
            lstm.predict(data)

    def test_predict(self, lstm):
        data = np.cumsum(np.random.randn(50)) + 100
        lstm.train(data, epochs=2, batch_size=8)
        pred = lstm.predict(data)
        assert isinstance(pred, float) or isinstance(pred, np.floating)

    def test_predict_sequence(self, lstm):
        data = np.cumsum(np.random.randn(50)) + 100
        lstm.train(data, epochs=2, batch_size=8)
        preds = lstm.predict_sequence(data, 3)
        assert len(preds) == 3

    def test_save_load_model(self, lstm, tmp_path):
        data = np.cumsum(np.random.randn(50)) + 100
        lstm.train(data, epochs=2, batch_size=8)
        path = str(tmp_path / "lstm.pkl")
        lstm.save_model(path)
        assert os.path.exists(path)

        lstm2 = LSTMModel(lstm.config)
        lstm2.load_model(path)
        assert lstm2.is_trained is True
        assert lstm2.weights is not None

    def test_export_to_onnx_stub(self, lstm, tmp_path):
        path = str(tmp_path / "model.onnx")
        lstm.export_to_onnx(path)


# ─── TransformerModel ───


@pytest.fixture
def transformer():
    config = TransformerConfig(input_size=5, d_model=32, n_heads=2, n_layers=1, d_ff=64)
    return TransformerModel(config)


class TestTransformerConfig:
    def test_defaults(self):
        cfg = TransformerConfig()
        assert cfg.input_size == 10
        assert cfg.d_model == 64
        assert cfg.n_heads == 4
        assert cfg.output_size == 3


class TestTransformerModel:
    def test_init(self, transformer):
        assert transformer.is_trained is False
        assert transformer.attention_weights is None

    def test_positional_encoding(self, transformer):
        pe = transformer._positional_encoding(10, 32)
        assert pe.shape == (10, 32)
        assert np.isfinite(pe).all()

    def test_train(self, transformer):
        features = np.random.randn(50, 5)
        signals = np.zeros((50, 3))
        signals[:20, 0] = 1  # LONG
        signals[20:35, 1] = 1  # SHORT
        signals[35:, 2] = 1  # HOLD
        history = transformer.train(features, signals, epochs=3, batch_size=8)
        assert transformer.is_trained is True
        assert "loss" in history
        assert history["epochs"] == 3

    def test_generate_signal_untrained(self, transformer):
        features = np.random.randn(5, 5)
        with pytest.raises(ValueError, match="trained"):
            transformer.generate_signal(features[0])

    def test_generate_signal(self, transformer):
        features = np.random.randn(50, 5)
        signals = np.zeros((50, 3))
        signals[:20, 0] = 1
        signals[20:, 1] = 1
        transformer.train(features, signals, epochs=2, batch_size=8)
        signal, confidence = transformer.generate_signal(features[0])
        assert signal in ("LONG", "SHORT", "HOLD")
        assert 0 <= confidence <= 1

    def test_generate_signals_batch(self, transformer):
        features = np.random.randn(50, 5)
        signals = np.zeros((50, 3))
        signals[:25, 0] = 1
        signals[25:, 1] = 1
        transformer.train(features, signals, epochs=2, batch_size=8)
        results = transformer.generate_signals_batch(features[:5])
        assert len(results) == 5
        for sig, conf in results:
            assert sig in ("LONG", "SHORT", "HOLD")

    def test_save_load_model(self, transformer, tmp_path):
        features = np.random.randn(20, 5)
        signals = np.zeros((20, 3))
        signals[:10, 0] = 1
        signals[10:, 1] = 1
        transformer.train(features, signals, epochs=1, batch_size=8)
        path = str(tmp_path / "transformer.pkl")
        transformer.save_model(path)
        assert os.path.exists(path)

        t2 = TransformerModel(transformer.config)
        t2.load_model(path)
        assert t2.is_trained is True


# ─── DQNAgent ───


@pytest.fixture
def dqn():
    config = RLConfig(state_size=63, action_size=3, memory_size=100, batch_size=4)
    return DQNAgent(config)


class TestRLConfig:
    def test_defaults(self):
        cfg = RLConfig()
        assert cfg.state_size == 63
        assert cfg.action_size == 3
        assert cfg.gamma == 0.99
        assert cfg.epsilon == 1.0
        assert cfg.epsilon_min == 0.01


class TestDQNAgent:
    def test_init(self, dqn):
        assert dqn.epsilon == 1.0
        assert dqn.is_trained is False
        assert dqn.q_network_weights is None
        assert len(dqn.memory) == 0

    def test_remember(self, dqn):
        state = np.random.randn(63)
        next_state = np.random.randn(63)
        dqn.remember(state, 1, 0.5, next_state, False)
        assert len(dqn.memory) == 1

    def test_act_training_random(self, dqn):
        state = np.random.randn(63)
        action = dqn.act(state, training=True)
        assert 0 <= action < 3

    def test_act_inference(self, dqn):
        state = np.random.randn(63)
        action = dqn.act(state, training=False)
        assert 0 <= action < 3

    def test_replay_insufficient_memory(self, dqn):
        state = np.random.randn(63)
        dqn.remember(state, 0, 0.1, state, False)
        dqn.replay()
        assert dqn.q_network_weights is not None

    def test_replay(self, dqn):
        for _ in range(10):
            state = np.random.randn(63)
            next_state = np.random.randn(63)
            dqn.remember(state, 1, 0.5, next_state, False)
        initial_epsilon = dqn.epsilon
        dqn.replay(batch_size=4)
        assert dqn.epsilon <= initial_epsilon

    def test_update_target_network(self, dqn):
        dqn._build_network()
        dqn.update_target_network()
        assert np.array_equal(dqn.q_network_weights, dqn.target_network_weights)

    def test_train(self, dqn, prices):
        env = TradingEnv()
        history = dqn.train(env, episodes=2, prices=prices)
        assert dqn.is_trained is True
        assert len(history["episode_rewards"]) == 2
        assert len(history["episode_lengths"]) == 2

    def test_save_load_model(self, dqn, prices, tmp_path):
        env = TradingEnv()
        dqn.train(env, episodes=1, prices=prices)
        path = str(tmp_path / "dqn.pkl")
        dqn.save_model(path)
        assert os.path.exists(path)

        dqn2 = DQNAgent(dqn.config)
        dqn2.load_model(path)
        assert dqn2.is_trained is True
        assert dqn2.q_network_weights is not None


# ─── price_predictor.py (requires torch) ───


def test_price_predictor_import():
    """Test price_predictor module imports (skipped if torch unavailable)."""
    pytest.importorskip("torch")
    from src.ml.price_predictor import ModelConfig, LSTMPredictor
    cfg = ModelConfig(model_type="lstm", input_dim=11, hidden_dim=64, num_layers=1)
    model = LSTMPredictor(cfg)
    assert model is not None


# ─── rl_trader.py (requires torch) ───


def test_rl_trader_import():
    """Test rl_trader module imports (skipped if torch unavailable)."""
    pytest.importorskip("torch")
    from src.ml.rl_trader import RLConfig as RLTraderConfig
    cfg = RLTraderConfig()
    assert cfg.state_dim == 63
