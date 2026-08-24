# Tests for Machine Learning Module
# Tests trading environment and feature store.
# LSTM/Transformer/RL tests are in test_ml_models.py (requires torch).

import numpy as np
import pytest

from src.ml.environment import Action, TradingEnv
from src.ml.feature_store import FeatureStore


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
