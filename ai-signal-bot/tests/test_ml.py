# Tests for Machine Learning Module
# Tests LSTM model, Transformer model, RL agent, and feature store

import numpy as np
import pytest
from src.ml.environment import Action, TradingEnv
from src.ml.feature_store import FeatureStore
from src.ml.lstm_model import LSTMConfig, LSTMModel
from src.ml.rl_agent import DQNAgent, PPOAgent, RLConfig
from src.ml.transformer_model import TransformerConfig, TransformerModel


class TestLSTMModel:
    """Test LSTM price prediction model."""

    def test_lstm_initialization(self):
        """Test LSTM model initialization."""
        config = LSTMConfig(input_size=1, hidden_size=64, sequence_length=60)
        model = LSTMModel(config)

        assert model.config == config
        assert model.is_trained == False

    def test_sequence_creation(self):
        """Test sequence generation for training."""
        config = LSTMConfig(sequence_length=10)
        model = LSTMModel(config)

        data = np.random.randn(100)
        X, y = model._create_sequences(data, config.sequence_length)

        assert X.shape[0] == 90  # 100 - 10
        assert X.shape[1] == 10
        assert y.shape[0] == 90

    def test_normalization(self):
        """Test data normalization."""
        config = LSTMConfig()
        model = LSTMModel(config)

        data = np.array([100, 105, 110, 95, 90])
        model.fit_scaler(data)

        normalized = model._normalize(data)
        denormalized = model._denormalize(normalized)

        assert np.allclose(data, denormalized, atol=1e-5)

    def test_lstm_training(self):
        """Test LSTM model training."""
        config = LSTMConfig(sequence_length=10)
        model = LSTMModel(config)

        data = np.random.randn(200) * 10 + 100
        history = model.train(data, epochs=10, batch_size=16)

        assert model.is_trained == True
        assert 'loss' in history
        assert 'epochs' in history

    def test_lstm_prediction(self):
        """Test LSTM model prediction."""
        config = LSTMConfig(sequence_length=10)
        model = LSTMModel(config)

        data = np.random.randn(200) * 10 + 100
        model.train(data, epochs=10)

        prediction = model.predict(data)

        assert isinstance(prediction, (float, np.floating))
        assert prediction > 0

    def test_lstm_save_load(self):
        """Test model save and load."""
        config = LSTMConfig(sequence_length=10)
        model = LSTMModel(config)

        data = np.random.randn(200) * 10 + 100
        model.train(data, epochs=5)

        # Save
        model.save_model('/tmp/test_lstm_model.pkl')

        # Load
        new_model = LSTMModel(config)
        new_model.load_model('/tmp/test_lstm_model.pkl')

        assert new_model.is_trained == True
        assert new_model.config == config


class TestTransformerModel:
    """Test Transformer signal generation model."""

    def test_transformer_initialization(self):
        """Test Transformer model initialization."""
        config = TransformerConfig(input_size=10, d_model=64)
        model = TransformerModel(config)

        assert model.config == config
        assert model.is_trained == False

    def test_positional_encoding(self):
        """Test positional encoding generation."""
        config = TransformerConfig()
        model = TransformerModel(config)

        pe = model._positional_encoding(seq_length=100, d_model=64)

        assert pe.shape == (100, 64)

    def test_transformer_training(self):
        """Test Transformer model training."""
        config = TransformerConfig(input_size=10)
        model = TransformerModel(config)

        features = np.random.randn(100, 10)
        signals = np.random.randint(0, 3, size=(100, 3))  # One-hot encoded

        history = model.train(features, signals, epochs=10)

        assert model.is_trained == True
        assert 'loss' in history
        assert 'accuracy' in history

    def test_signal_generation(self):
        """Test signal generation."""
        config = TransformerConfig(input_size=10)
        model = TransformerModel(config)

        features = np.random.randn(100, 10)
        signals = np.random.randint(0, 3, size=(100, 3))
        model.train(features, signals, epochs=10)

        test_features = np.random.randn(10)
        signal, confidence = model.generate_signal(test_features)

        assert signal in ['LONG', 'SHORT', 'HOLD']
        assert 0 <= confidence <= 1

    def test_batch_signal_generation(self):
        """Test batch signal generation."""
        config = TransformerConfig(input_size=10)
        model = TransformerModel(config)

        features = np.random.randn(100, 10)
        signals = np.random.randint(0, 3, size=(100, 3))
        model.train(features, signals, epochs=10)

        test_features = np.random.randn(5, 10)
        signals = model.generate_signals_batch(test_features)

        assert len(signals) == 5
        assert all(s[0] in ['LONG', 'SHORT', 'HOLD'] for s in signals)


class TestTradingEnvironment:
    """Test trading environment for RL."""

    def test_environment_initialization(self):
        """Test environment initialization."""
        env = TradingEnv(initial_cash=100000, transaction_cost=0.001)

        assert env.initial_cash == 100000
        assert env.transaction_cost == 0.001
        assert env.action_space_n == 3

    def test_environment_reset(self):
        """Test environment reset."""
        env = TradingEnv()
        prices = np.random.randn(200) * 10 + 100

        observation = env.reset(prices)

        assert len(observation) > 0
        assert env.current_step == 0
        assert env.cash == env.initial_cash

    def test_environment_step(self):
        """Test environment step."""
        env = TradingEnv()
        prices = np.random.randn(200) * 10 + 100

        env.reset(prices)
        observation, reward, done, info = env.step(Action.HOLD.value)

        assert len(observation) > 0
        assert isinstance(reward, (float, np.floating))
        assert isinstance(done, bool)
        assert 'portfolio_value' in info

    def test_buy_action(self):
        """Test buy action."""
        env = TradingEnv(initial_cash=100000)
        prices = np.array([100, 101, 102, 103, 104])

        env.reset(prices)
        observation, reward, done, info = env.step(Action.BUY.value)

        assert env.position > 0
        assert env.cash == 0

    def test_sell_action(self):
        """Test sell action."""
        env = TradingEnv(initial_cash=100000)
        prices = np.array([100, 101, 102, 103, 104])

        env.reset(prices)
        env.step(Action.BUY.value)  # Buy first
        observation, reward, done, info = env.step(Action.SELL.value)

        assert env.position == 0
        assert env.cash > 0


class TestDQNAgent:
    """Test DQN agent."""

    def test_dqn_initialization(self):
        """Test DQN agent initialization."""
        config = RLConfig(state_size=100, action_size=3)
        agent = DQNAgent(config)

        assert agent.config == config
        assert agent.epsilon == config.epsilon

    def test_dqn_act(self):
        """Test DQN action selection."""
        config = RLConfig(state_size=100, action_size=3)
        agent = DQNAgent(config)

        state = np.random.randn(100)
        action = agent.act(state, training=True)

        assert 0 <= action < 3

    def test_dqn_remember(self):
        """Test experience storage."""
        config = RLConfig()
        agent = DQNAgent(config)

        state = np.random.randn(100)
        next_state = np.random.randn(100)

        agent.remember(state, 1, 0.5, next_state, False)

        assert len(agent.memory) == 1

    def test_dqn_training(self):
        """Test DQN training."""
        config = RLConfig(state_size=63, action_size=3)
        agent = DQNAgent(config)
        env = TradingEnv()

        prices = np.random.randn(200) * 10 + 100
        history = agent.train(env, episodes=5)

        assert agent.is_trained == True
        assert 'episode_rewards' in history
        assert len(history['episode_rewards']) == 5


class TestPPOAgent:
    """Test PPO agent."""

    def test_ppo_initialization(self):
        """Test PPO agent initialization."""
        config = RLConfig(state_size=100, action_size=3)
        agent = PPOAgent(config)

        assert agent.config == config

    def test_ppo_get_action(self):
        """Test PPO action selection."""
        config = RLConfig(state_size=100, action_size=3)
        agent = PPOAgent(config)

        state = np.random.randn(100)
        action, log_prob = agent.get_action(state)

        assert 0 <= action < 3
        assert isinstance(log_prob, (float, np.floating))

    def test_ppo_get_value(self):
        """Test PPO value estimation."""
        config = RLConfig(state_size=100)
        agent = PPOAgent(config)

        state = np.random.randn(100)
        value = agent.get_value(state)

        assert isinstance(value, (float, np.floating))

    def test_ppo_training(self):
        """Test PPO training."""
        config = RLConfig(state_size=63, action_size=3)
        agent = PPOAgent(config)
        env = TradingEnv()

        prices = np.random.randn(200) * 10 + 100
        history = agent.train(env, episodes=5)

        assert agent.is_trained == True
        assert 'episode_rewards' in history


class TestFeatureStore:
    """Test feature store."""

    def test_feature_store_initialization(self):
        """Test feature store initialization."""
        fs = FeatureStore()

        assert fs is not None

    def test_update_features(self):
        """Test feature update."""
        fs = FeatureStore()

        features = {
            'rsi_14': 65.3,
            'ema_fast': 65100.5,
            'atr_14': 120.0
        }

        count = fs.update_features('BTC/USDT', features)

        assert count == 3

    def test_get_features(self):
        """Test feature retrieval."""
        fs = FeatureStore()

        features = {
            'rsi_14': 65.3,
            'ema_fast': 65100.5
        }

        fs.update_features('BTC/USDT', features)
        retrieved = fs.get_features('BTC/USDT', ['rsi_14'])

        assert 'rsi_14' in retrieved
        assert retrieved['rsi_14'] == 65.3

    def test_get_features_batch(self):
        """Test batch feature retrieval."""
        fs = FeatureStore()

        fs.update_features('BTC/USDT', {'rsi_14': 65.3})
        fs.update_features('ETH/USDT', {'rsi_14': 55.2})

        batch = fs.get_features_batch(['BTC/USDT', 'ETH/USDT'], ['rsi_14'])

        assert 'BTC/USDT' in batch
        assert 'ETH/USDT' in batch

    def test_get_feature_vector(self):
        """Test feature vector retrieval."""
        fs = FeatureStore()

        features = {'rsi_14': 65.3, 'ema_fast': 65100.5}
        fs.update_features('BTC/USDT', features)

        vector = fs.get_feature_vector('BTC/USDT', ['rsi_14', 'ema_fast'])

        assert len(vector) == 2
        assert all(isinstance(v, float) for v in vector)

    def test_list_features(self):
        """Test feature listing."""
        fs = FeatureStore()

        fs.update_features('BTC/USDT', {'rsi_14': 65.3, 'ema_fast': 65100.5})

        features = fs.list_features()

        assert 'rsi_14' in features
        assert 'ema_fast' in features

    def test_list_symbols(self):
        """Test symbol listing."""
        fs = FeatureStore()

        fs.update_features('BTC/USDT', {'rsi_14': 65.3})
        fs.update_features('ETH/USDT', {'rsi_14': 55.2})

        symbols = fs.list_symbols()

        assert 'BTC/USDT' in symbols
        assert 'ETH/USDT' in symbols

    def test_delete_features(self):
        """Test feature deletion."""
        fs = FeatureStore()

        fs.update_features('BTC/USDT', {'rsi_14': 65.3})
        fs.delete_features('BTC/USDT')

        retrieved = fs.get_features('BTC/USDT')

        assert len(retrieved) == 0

    def test_is_healthy(self):
        """Test health check."""
        fs = FeatureStore()

        healthy = fs.is_healthy()

        assert isinstance(healthy, bool)
