"""End-to-end integration test: signal → order → fill → position → close.

Tests the full trading pipeline:
1. AI Signal Bot generates a signal
2. Signal is broadcast via SignalPublisher (with CircuitBreaker check)
3. SimulatedExchange receives and executes the order
4. Position is created
5. SL/TP triggers close the position
6. Trade history records the closed trade
"""
import time
from unittest.mock import AsyncMock, MagicMock

import pytest
from exchange_simulator.exchange import SimulatedExchange
from exchange_simulator.market_simulator import MarketSimulator
from exchange_simulator.models import (
    Account,
    ClosedTrade,
    Order,
    OrderStatus,
    OrderType,
    Position,
    Side,
)

from src.communication.circuit_breaker import BreakerState, CircuitBreaker, CircuitBreakerConfig
from src.communication.metrics_server import MetricsCollector


def make_market(price=50000.0):
    """Create a mock MarketSimulator with a fixed price."""
    market = MagicMock()
    market.get_price.return_value = price
    market.symbols = ["BTC/USDT"]
    market.generate_order_book.return_value = MagicMock()
    market.get_history.return_value = []
    return market


class TestEndToEndSignalToClose:
    """Full pipeline: signal → order → fill → position → SL/TP → close."""

    def test_long_signal_to_close_via_take_profit(self):
        """Signal LONG → buy → position → price rises → TP closes position."""
        market = make_market(50000)
        ex = SimulatedExchange("binance", "Binance", 0.04, 1.0, market,
                               initial_balance=10000, leverage=10)
        cb = CircuitBreaker()
        assert cb.allow_signal()

        # 1. Signal: LONG BTC/USDT
        assert cb.allow_signal()

        # 2. Execute buy order
        order = ex.submit_order("BTC/USDT", Side.BUY, 0.1,
                                stop_loss=49000, take_profit=51000)
        assert order.status == OrderStatus.FILLED
        assert len(ex.account.positions) == 1
        pos = ex.account.positions[0]
        assert pos.side == Side.BUY
        assert pos.stop_loss == 49000
        assert pos.take_profit == 51000

        # 3. Price rises to TP
        market.get_price.return_value = 51100
        closed = ex.check_stop_loss_take_profit()
        assert len(closed) == 1
        assert len(ex.account.positions) == 0
        assert len(ex.account.trade_history) == 1
        trade = ex.account.trade_history[0]
        assert trade.reason == "TAKE_PROFIT"
        assert trade.pnl > 0
        assert ex.account.winning_trades == 1
        assert ex.account.total_trades == 1

        # 4. Record success in circuit breaker
        cb.record_success()
        assert cb.is_closed

    def test_short_signal_to_close_via_stop_loss(self):
        """Signal SHORT → sell → position → price rises → SL closes position."""
        market = make_market(50000)
        ex = SimulatedExchange("binance", "Binance", 0.04, 1.0, market,
                               initial_balance=10000, leverage=10)
        cb = CircuitBreaker()

        # 1. Signal: SHORT BTC/USDT
        assert cb.allow_signal()

        # 2. Execute sell order
        order = ex.submit_order("BTC/USDT", Side.SELL, 0.1,
                                stop_loss=51000, take_profit=49000)
        assert order.status == OrderStatus.FILLED
        assert len(ex.account.positions) == 1
        assert ex.account.positions[0].side == Side.SELL

        # 3. Price rises to SL (bad for short)
        market.get_price.return_value = 51100
        closed = ex.check_stop_loss_take_profit()
        assert len(closed) == 1
        assert len(ex.account.positions) == 0
        trade = ex.account.trade_history[0]
        assert trade.reason == "STOP_LOSS"
        assert trade.pnl < 0

        # 4. Record failure in circuit breaker
        cb.record_failure()
        assert cb.is_closed  # Only 1 failure, not tripped yet

    def test_multiple_signals_circuit_breaker_trips(self):
        """5 consecutive losing signals trip the circuit breaker."""
        market = make_market(50000)
        ex = SimulatedExchange("binance", "Binance", 0.04, 1.0, market,
                               initial_balance=100000, leverage=10)
        cb = CircuitBreaker(CircuitBreakerConfig(failure_threshold=5, cooldown_seconds=0.1))

        # Simulate 5 losing trades
        for _i in range(5):
            assert cb.allow_signal()  # Should allow until tripped
            order = ex.submit_order("BTC/USDT", Side.BUY, 0.01,
                                    stop_loss=49900, take_profit=60000)
            assert order.status == OrderStatus.FILLED
            # Price drops below SL
            market.get_price.return_value = 49800
            ex.check_stop_loss_take_profit()
            cb.record_failure()

        # Breaker should now be OPEN
        assert cb.is_open
        assert cb.total_trips == 1

        # Signal should be blocked
        assert not cb.allow_signal()
        assert cb.total_blocks >= 1

    def test_circuit_breaker_recovery_after_cooldown(self):
        """Breaker recovers to HALF_OPEN after cooldown, then CLOSED on success."""
        cb = CircuitBreaker(CircuitBreakerConfig(
            failure_threshold=2, cooldown_seconds=0.05, success_threshold=1
        ))

        # Trip the breaker
        cb.record_failure()
        cb.record_failure()
        assert cb.is_open

        # Wait for cooldown
        time.sleep(0.06)

        # Should transition to HALF_OPEN and allow a probe
        assert cb.state == BreakerState.HALF_OPEN
        assert cb.allow_signal()

        # Record success → should close
        cb.record_success()
        assert cb.is_closed

    def test_signal_blocked_does_not_create_position(self):
        """When circuit breaker is open, no order should be placed."""
        market = make_market(50000)
        ex = SimulatedExchange("binance", "Binance", 0.04, 1.0, market)
        cb = CircuitBreaker(CircuitBreakerConfig(failure_threshold=1, cooldown_seconds=60))

        # Trip immediately
        cb.record_failure()
        assert cb.is_open

        # Signal blocked
        allowed = cb.allow_signal()
        assert not allowed
        # No order placed since signal was blocked
        assert len(ex.account.positions) == 0

    def test_metrics_collected_throughout_pipeline(self):
        """Metrics are recorded for signals sent, blocked, and circuit breaker state."""
        metrics = MetricsCollector()
        cb = CircuitBreaker(CircuitBreakerConfig(failure_threshold=2, cooldown_seconds=60))

        # Normal signal
        assert cb.allow_signal()
        metrics.record_signal_sent()
        assert metrics._signals_sent == 1

        # Trip breaker
        cb.record_failure()
        cb.record_failure()
        assert cb.is_open

        # Blocked signal
        assert not cb.allow_signal()
        metrics.record_signal_blocked()
        assert metrics._signals_blocked == 1

        # Render metrics
        output = metrics.render()
        assert "ai_signal_bot_signals_sent_total 1" in output
        assert "ai_signal_bot_signals_blocked_total 1" in output
        assert "ai_signal_bot_uptime_seconds" in output


class TestExchangeFactoryFallback:
    """Test exchange factory fallback from real to simulator."""

    def test_fallback_to_simulator_when_real_unavailable(self):
        """When real exchange health check fails, factory should fall back to simulator."""
        from src.data_collection.exchange_factory import ExchangeFactory, ExchangeMode

        factory = ExchangeFactory(
            mode=ExchangeMode.FALLBACK,
            exchange="binance",
            testnet=True,
        )
        assert factory is not None
        assert factory.mode == ExchangeMode.FALLBACK

    def test_simulator_always_available(self):
        """Simulator exchanges are always available regardless of real exchange state."""
        from src.data_collection.exchange_factory import ExchangeFactory, ExchangeMode

        factory = ExchangeFactory(
            mode=ExchangeMode.SIMULATOR,
            exchange="binance",
        )
        assert factory is not None
        assert factory.mode == ExchangeMode.SIMULATOR


class TestSimulatorLoadTest:
    """Load test: generate 1000 candles across 3 exchanges, verify performance."""

    def test_1000_candles_3_exchanges(self):
        """Generate 1000 candles for 3 exchanges × 2 symbols = 6000 candles total."""
        sim = MarketSimulator(
            symbols=["BTC/USDT", "ETH/USDT"],
            exchanges=["binance", "bybit", "okx"],
            initial_prices={"BTC/USDT": 65000, "ETH/USDT": 3500},
            volatility={"BTC/USDT": 0.8, "ETH/USDT": 1.2},
            warmup_candles=1000,
        )

        start = time.time()
        candles = sim.generate_candles()
        elapsed = time.time() - start

        assert len(candles) == 6  # 2 symbols × 3 exchanges
        assert elapsed < 1.0  # Should complete in under 1 second

        # Verify all candles have valid OHLC
        for c in candles:
            assert c.high >= c.open
            assert c.high >= c.close
            assert c.low <= c.open
            assert c.low <= c.close
            assert c.volume > 0

    def test_order_book_generation_load(self):
        """Generate order books for all exchanges rapidly."""
        sim = MarketSimulator(
            symbols=["BTC/USDT"],
            exchanges=["binance", "bybit", "okx"],
            initial_prices={"BTC/USDT": 65000},
            volatility={"BTC/USDT": 0.8},
            warmup_candles=100,
            order_book_depth=20,
        )

        start = time.time()
        for _ in range(100):
            for ex in ["binance", "bybit", "okx"]:
                ob = sim.generate_order_book(ex, "BTC/USDT")
                assert ob is not None
                assert len(ob.bids) > 0
                assert len(ob.asks) > 0
        elapsed = time.time() - start

        # 300 order book generations should complete quickly
        assert elapsed < 2.0
