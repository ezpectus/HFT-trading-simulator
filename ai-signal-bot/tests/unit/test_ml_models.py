"""Tests for ml/ modules — environment, price_predictor, rl_trader.

price_predictor.py and rl_trader.py require torch and are skipped if unavailable.
"""
import numpy as np
import pytest

from src.ml.environment import Action, TradingEnv, TradingState

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


# ─── price_predictor.py (requires torch) ───


def test_price_predictor_import():
    """Test price_predictor module imports (skipped if torch unavailable)."""
    pytest.importorskip("torch")
    from src.ml.price_predictor import LSTMPredictor, ModelConfig
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
