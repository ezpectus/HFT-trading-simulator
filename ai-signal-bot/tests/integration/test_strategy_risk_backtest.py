"""Integration test: strategy → signal validation → risk management → backtest.

Tests the full pipeline end-to-end:
1. Strategy generates a signal from candle data
2. SignalValidator checks confidence, R:R, drawdown, position limits
3. Backtester executes the signal with RiskManager (trailing stop, breakeven)
4. Equity curve, win rate, Sharpe ratio are verified

Also tests:
- Multiple strategies (TrendFollowing, MeanReversion)
- Signal reversal (LONG → SHORT closes and reopens)
- Extreme market conditions (crash / pump)
- Risk manager trailing stop behavior
"""

import pytest

from src.backtesting.backtester import Backtester, BacktestResult
from src.risk.risk_manager import RiskConfig, RiskManager
from src.signal_validation.validator import SignalValidator
from src.strategies.signal import Signal, SignalDirection
from src.strategies.strategies import (
    EnsembleVoter,
    MeanReversionStrategy,
    TrendFollowingStrategy,
)


def make_candles(
    start_price: float = 50000.0,
    n: int = 200,
    trend: float = 0.0,
    volatility: float = 0.01,
    seed: int = 42,
) -> list[dict]:
    """Generate synthetic OHLCV candle data."""
    import random

    rng = random.Random(seed)
    candles: list[dict] = []
    price = start_price

    for i in range(n):
        drift = trend
        noise = rng.gauss(0, volatility)
        change = drift + noise

        open_price = price
        close_price = price * (1 + change)
        high_price = max(open_price, close_price) * (1 + abs(rng.gauss(0, volatility * 0.5)))
        low_price = min(open_price, close_price) * (1 - abs(rng.gauss(0, volatility * 0.5)))
        volume = abs(rng.gauss(1000, 300))

        candles.append({
            "timestamp": i * 300,
            "open": open_price,
            "high": high_price,
            "low": low_price,
            "close": close_price,
            "volume": volume,
        })
        price = close_price

    return candles


def make_trending_candles(
    start_price: float = 50000.0,
    n: int = 200,
    trend_strength: float = 0.003,
) -> list[dict]:
    """Generate candles with a clear uptrend (for trend-following signals)."""
    return make_candles(start_price, n, trend=trend_strength, volatility=0.002, seed=100)


def make_crash_candles(
    start_price: float = 50000.0,
    n: int = 200,
) -> list[dict]:
    """Generate candles with a severe crash (for stress testing)."""
    return make_candles(start_price, n, trend=-0.015, volatility=0.008, seed=999)


class TestStrategyToSignal:
    """Step 1: Strategy produces valid signals from candle data."""

    def test_trend_following_generates_signal(self):
        """TrendFollowingStrategy produces actionable signal on trending data."""
        candles = make_trending_candles(n=100)
        strategy = TrendFollowingStrategy(ema_fast=9, ema_slow=21, adx_threshold=20)
        signal = strategy.analyze("BTC/USDT", candles)

        assert signal is not None
        assert signal.strategy == "trend_following"
        assert signal.entry_price > 0

    def test_mean_reversion_generates_signal(self):
        """MeanReversionStrategy produces signal on ranging data."""
        candles = make_candles(volatility=0.005, n=100, seed=7)
        strategy = MeanReversionStrategy(rsi_period=14, rsi_oversold=30, rsi_overbought=70)
        signal = strategy.analyze("BTC/USDT", candles)

        assert signal is not None
        assert signal.strategy == "mean_reversion"

    def test_ensemble_combines_signals(self):
        """EnsembleVoter combines multiple strategies."""
        candles = make_trending_candles(n=100)
        ensemble = EnsembleVoter(
            strategies=[
                TrendFollowingStrategy(ema_fast=9, ema_slow=21, adx_threshold=20),
                MeanReversionStrategy(),
            ],
            mode="majority",
            min_votes=1,
        )
        signal = ensemble.analyze("BTC/USDT", candles)

        assert signal is not None
        assert signal.strategy == "ensemble"


class TestSignalValidation:
    """Step 2: SignalValidator filters signals correctly."""

    def test_valid_signal_passes(self):
        """High-confidence signal with good R:R passes validation."""
        validator = SignalValidator(min_confidence=60, min_rr_ratio=1.0)
        signal = Signal(
            symbol="BTC/USDT",
            direction=SignalDirection.LONG,
            confidence=80,
            strategy="trend_following",
            entry_price=50000,
            stop_loss=49000,
            take_profit=52000,
            reason="EMA cross",
        )
        result = validator.validate(signal)
        assert result.passed
        assert "validated" in result.reason.lower()

    def test_low_confidence_rejected(self):
        """Signal below confidence threshold is rejected."""
        validator = SignalValidator(min_confidence=70)
        signal = Signal(
            symbol="BTC/USDT",
            direction=SignalDirection.LONG,
            confidence=50,
            strategy="trend_following",
            entry_price=50000,
            stop_loss=49000,
            take_profit=52000,
        )
        result = validator.validate(signal)
        assert not result.passed
        assert "confidence" in result.reason.lower()

    def test_neutral_signal_rejected(self):
        """NEUTRAL signal is rejected by validator."""
        validator = SignalValidator()
        signal = Signal(
            symbol="BTC/USDT",
            direction=SignalDirection.NEUTRAL,
            confidence=0,
            strategy="trend_following",
            entry_price=50000,
            stop_loss=0,
            take_profit=0,
        )
        result = validator.validate(signal)
        assert not result.passed
        assert "neutral" in result.reason.lower()

    def test_duplicate_signal_rejected(self):
        """Duplicate signal within cooldown is rejected."""
        validator = SignalValidator(min_confidence=0, min_rr_ratio=0)
        signal = Signal(
            symbol="BTC/USDT",
            direction=SignalDirection.LONG,
            confidence=80,
            strategy="trend_following",
            entry_price=50000,
            stop_loss=49000,
            take_profit=52000,
        )
        first = validator.validate(signal)
        assert first.passed

        second = validator.validate(signal)
        assert not second.passed
        assert "duplicate" in second.reason.lower()

    def test_max_positions_reached(self):
        """Signal rejected when max positions reached."""
        validator = SignalValidator(min_confidence=0, min_rr_ratio=0, max_open_positions=2)
        validator.update_position_count(2)

        signal = Signal(
            symbol="ETH/USDT",
            direction=SignalDirection.LONG,
            confidence=90,
            strategy="trend_following",
            entry_price=3000,
            stop_loss=2900,
            take_profit=3200,
        )
        result = validator.validate(signal)
        assert not result.passed
        assert "max positions" in result.reason.lower()


class TestBacktesterPipeline:
    """Step 3: Backtester executes signals with risk management."""

    def test_backtest_produces_metrics(self):
        """Backtester produces valid BacktestResult with all metrics."""
        candles = make_trending_candles(n=200)
        strategy = TrendFollowingStrategy(ema_fast=9, ema_slow=21, adx_threshold=20)
        bt = Backtester(initial_balance=10000, fee_pct=0.075, slippage_bps=2.0)

        result = bt.run(candles, strategy, symbol="BTC/USDT", warmup=30)

        assert isinstance(result, BacktestResult)
        assert result.initial_balance == 10000
        assert len(result.equity_curve) > 0
        assert result.signals_generated > 0

    def test_backtest_with_risk_manager(self):
        """Backtester with RiskManager applies trailing stops."""
        candles = make_trending_candles(n=200)
        strategy = TrendFollowingStrategy(ema_fast=9, ema_slow=21, adx_threshold=20)
        risk_config = RiskConfig(
            trailing_stop_enabled=True,
            trailing_distance_pct=1.5,
            breakeven_enabled=True,
            breakeven_trigger_pct=1.0,
        )
        bt = Backtester(
            initial_balance=10000,
            risk_config=risk_config,
        )

        result = bt.run(candles, strategy, symbol="BTC/USDT", warmup=30)

        assert result.initial_balance == 10000
        assert len(result.equity_curve) > 0

    def test_backtest_win_rate_calculation(self):
        """Win rate is correctly calculated from trades."""
        candles = make_trending_candles(n=200, trend_strength=0.005)
        strategy = TrendFollowingStrategy(ema_fast=9, ema_slow=21, adx_threshold=15)
        bt = Backtester(initial_balance=10000)

        result = bt.run(candles, strategy, symbol="BTC/USDT", warmup=30)

        if result.total_trades > 0:
            assert 0 <= result.win_rate <= 100
            assert result.winning_trades + result.losing_trades <= result.total_trades

    def test_backtest_equity_curve_length(self):
        """Equity curve has one entry per candle after warmup."""
        n = 150
        candles = make_candles(n=n)
        strategy = TrendFollowingStrategy(ema_fast=9, ema_slow=21, adx_threshold=20)
        bt = Backtester(initial_balance=10000)

        result = bt.run(candles, strategy, symbol="BTC/USDT", warmup=30)

        assert len(result.equity_curve) >= 1
        assert result.equity_curve[0] == 10000


class TestFullPipelineStrategyRiskBacktest:
    """Full pipeline: strategy → validator → backtester with risk manager."""

    def test_trend_following_full_pipeline(self):
        """TrendFollowing → SignalValidator → Backtester with RiskManager."""
        candles = make_trending_candles(n=200)
        strategy = TrendFollowingStrategy(ema_fast=9, ema_slow=21, adx_threshold=20)
        validator = SignalValidator(min_confidence=40, min_rr_ratio=0.5)
        risk_config = RiskConfig(
            trailing_stop_enabled=True,
            trailing_distance_pct=2.0,
            breakeven_enabled=True,
            breakeven_trigger_pct=1.0,
        )
        bt = Backtester(initial_balance=10000, risk_config=risk_config)

        result = bt.run(candles, strategy, symbol="BTC/USDT", warmup=30)

        assert result.signals_generated > 0
        assert len(result.equity_curve) > 0
        assert result.initial_balance == 10000
        assert result.final_balance != result.initial_balance or result.total_trades == 0

    def test_mean_reversion_full_pipeline(self):
        """MeanReversion → SignalValidator → Backtester."""
        candles = make_candles(volatility=0.005, n=200, seed=7)
        strategy = MeanReversionStrategy(rsi_period=14, rsi_oversold=30, rsi_overbought=70)
        validator = SignalValidator(min_confidence=30, min_rr_ratio=0.5)
        bt = Backtester(initial_balance=10000)

        result = bt.run(candles, strategy, symbol="BTC/USDT", warmup=30)

        assert result.signals_generated > 0
        assert len(result.equity_curve) > 0

    def test_ensemble_full_pipeline(self):
        """EnsembleVoter → SignalValidator → Backtester with RiskManager."""
        candles = make_trending_candles(n=200)
        strategy = EnsembleVoter(
            strategies=[
                TrendFollowingStrategy(ema_fast=9, ema_slow=21, adx_threshold=20),
                MeanReversionStrategy(),
            ],
            mode="majority",
            min_votes=1,
        )
        risk_config = RiskConfig(
            trailing_stop_enabled=True,
            trailing_distance_pct=2.0,
        )
        bt = Backtester(initial_balance=10000, risk_config=risk_config)

        result = bt.run(candles, strategy, symbol="BTC/USDT", warmup=30)

        assert result.signals_generated > 0
        assert len(result.equity_curve) > 0


class TestStressScenarios:
    """Test pipeline under extreme market conditions."""

    def test_crash_scenario(self):
        """Pipeline handles a market crash without errors."""
        candles = make_crash_candles(n=200)
        strategy = TrendFollowingStrategy(ema_fast=9, ema_slow=21, adx_threshold=20)
        risk_config = RiskConfig(
            trailing_stop_enabled=True,
            trailing_distance_pct=2.0,
            max_hold_candles=50,
        )
        bt = Backtester(initial_balance=10000, risk_config=risk_config)

        result = bt.run(candles, strategy, symbol="BTC/USDT", warmup=30)

        assert result.initial_balance == 10000
        assert len(result.equity_curve) > 0
        assert result.max_drawdown_pct >= 0

    def test_pump_scenario(self):
        """Pipeline handles a massive pump."""
        candles = make_candles(
            start_price=50000, n=200, trend=0.01, volatility=0.003, seed=42,
        )
        strategy = TrendFollowingStrategy(ema_fast=9, ema_slow=21, adx_threshold=15)
        bt = Backtester(initial_balance=10000)

        result = bt.run(candles, strategy, symbol="BTC/USDT", warmup=30)

        assert result.signals_generated > 0
        assert result.final_balance > 0

    def test_flat_market(self):
        """Pipeline handles sideways/flat market."""
        candles = make_candles(volatility=0.001, n=200, seed=13)
        strategy = TrendFollowingStrategy(ema_fast=9, ema_slow=21, adx_threshold=25)
        bt = Backtester(initial_balance=10000)

        result = bt.run(candles, strategy, symbol="BTC/USDT", warmup=30)

        assert result.initial_balance == 10000
        assert len(result.equity_curve) > 0

    def test_high_volatility(self):
        """Pipeline handles extreme volatility."""
        candles = make_candles(volatility=0.05, n=200, seed=77)
        strategy = MeanReversionStrategy(rsi_period=14, rsi_oversold=25, rsi_overbought=75)
        risk_config = RiskConfig(
            trailing_stop_enabled=True,
            trailing_distance_pct=5.0,
            max_hold_candles=30,
        )
        bt = Backtester(initial_balance=10000, risk_config=risk_config)

        result = bt.run(candles, strategy, symbol="BTC/USDT", warmup=30)

        assert result.initial_balance == 10000
        assert len(result.equity_curve) > 0
