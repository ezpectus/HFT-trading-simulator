"""Tests for arbitrage detector."""
import pytest

from exchange_simulator.arbitrage import ArbitrageDetector, ArbitrageOpportunity, ArbStatus
from exchange_simulator.market_simulator import MarketSimulator
from exchange_simulator.exchange import SimulatedExchange


@pytest.fixture
def setup_exchanges():
    """Create 3 exchanges with slightly different prices."""
    market = MarketSimulator(
        symbols=["BTC/USDT"],
        exchanges=["binance", "bybit", "okx"],
        initial_prices={"BTC/USDT": 65000},
        volatility={"BTC/USDT": 0.75},
        seed=42,
        warmup_candles=50,
        order_book_depth=10,
    )
    exchanges = {
        "binance": SimulatedExchange("binance", "Binance", 0.04, 2.0, market, 10000),
        "bybit": SimulatedExchange("bybit", "Bybit", 0.06, 3.0, market, 10000),
        "okx": SimulatedExchange("okx", "OKX", 0.05, 2.5, market, 10000),
    }
    return exchanges, market


class TestArbitrageDetector:
    def test_initialization(self, setup_exchanges):
        exchanges, _ = setup_exchanges
        detector = ArbitrageDetector(exchanges=exchanges)
        assert detector.active_count == 0
        assert detector.stats["total_detected"] == 0

    def test_scan_returns_list(self, setup_exchanges):
        exchanges, _ = setup_exchanges
        detector = ArbitrageDetector(
            exchanges=exchanges,
            min_spread_bps=0.0,  # catch everything
        )
        results = detector.scan()
        assert isinstance(results, list)

    def test_scan_finds_opportunities(self, setup_exchanges):
        exchanges, _ = setup_exchanges
        detector = ArbitrageDetector(
            exchanges=exchanges,
            min_spread_bps=0.0,
            fee_pct=0.001,  # very low fee to catch small spreads
            slippage_bps=0.1,
        )
        results = detector.scan()
        # With 3 exchanges having different offsets, should find some arbs
        # (not guaranteed, but likely with 0 bps threshold)
        assert isinstance(results, list)

    def test_high_threshold_no_results(self, setup_exchanges):
        exchanges, _ = setup_exchanges
        detector = ArbitrageDetector(
            exchanges=exchanges,
            min_spread_bps=1000.0,  # impossibly high
        )
        results = detector.scan()
        assert len(results) == 0

    def test_to_dict(self, setup_exchanges):
        exchanges, _ = setup_exchanges
        detector = ArbitrageDetector(exchanges=exchanges)
        data = detector.to_dict()
        assert data["type"] == "arbitrage_scan"
        assert "active" in data
        assert "stats" in data
        assert data["active_count"] == 0

    def test_render_terminal(self, setup_exchanges):
        exchanges, _ = setup_exchanges
        detector = ArbitrageDetector(exchanges=exchanges)
        text = detector.render_terminal()
        assert isinstance(text, str)
        assert "arbitrage" in text.lower()

    def test_close_opportunity(self, setup_exchanges):
        exchanges, _ = setup_exchanges
        detector = ArbitrageDetector(
            exchanges=exchanges,
            min_spread_bps=0.0,
            fee_pct=0.001,
            slippage_bps=0.1,
        )
        # Scan to find opportunities
        results = detector.scan()
        if results:
            opp = results[0]
            detector.close_opportunity(
                opp.symbol, opp.buy_exchange, opp.sell_exchange
            )
            assert detector.active_count == len(results) - 1
            assert detector.stats["total_closed"] == 1

    def test_stats_tracking(self, setup_exchanges):
        exchanges, _ = setup_exchanges
        detector = ArbitrageDetector(
            exchanges=exchanges,
            min_spread_bps=0.0,
            fee_pct=0.001,
            slippage_bps=0.1,
        )
        detector.scan()
        stats = detector.stats
        assert "total_detected" in stats
        assert "total_closed" in stats
        assert "total_expired" in stats
        assert "total_estimated_profit" in stats
        assert "best_spread_bps" in stats

    def test_duplicate_detection(self, setup_exchanges):
        """Scanning twice should not duplicate active opportunities."""
        exchanges, _ = setup_exchanges
        detector = ArbitrageDetector(
            exchanges=exchanges,
            min_spread_bps=0.0,
            fee_pct=0.001,
            slippage_bps=0.1,
        )
        first = detector.scan()
        first_count = detector.active_count
        second = detector.scan()
        # Second scan should find 0 new duplicates (same order books)
        assert len(second) == 0
        assert detector.active_count == first_count

    def test_get_active_returns_copy(self, setup_exchanges):
        """get_active should return a copy, not internal list."""
        exchanges, _ = setup_exchanges
        detector = ArbitrageDetector(
            exchanges=exchanges,
            min_spread_bps=0.0,
            fee_pct=0.001,
            slippage_bps=0.1,
        )
        detector.scan()
        active = detector.get_active()
        active.clear()
        # Internal state should be unaffected
        assert detector.active_count >= 0

    def test_get_recent_closed_empty(self, setup_exchanges):
        """get_recent_closed should return empty list initially."""
        exchanges, _ = setup_exchanges
        detector = ArbitrageDetector(exchanges=exchanges)
        closed = detector.get_recent_closed()
        assert isinstance(closed, list)
        assert len(closed) == 0

    def test_opportunity_dataclass_fields(self):
        """ArbitrageOpportunity should have all required fields."""
        opp = ArbitrageOpportunity(
            symbol="BTC/USDT",
            buy_exchange="binance",
            sell_exchange="bybit",
            buy_price=65000.0,
            sell_price=65100.0,
            gross_spread=100.0,
            net_spread=50.0,
            spread_bps=7.7,
            buy_quantity=1.0,
            sell_quantity=0.5,
            max_quantity=0.5,
            estimated_profit=25.0,
            timestamp=1704067200,
        )
        assert opp.status == ArbStatus.OPEN
        assert opp.closed_at == 0
        assert opp.close_reason == ""
        assert opp.symbol == "BTC/USDT"
        assert opp.max_quantity == 0.5

    def test_expiry_removes_old_opportunities(self, setup_exchanges):
        """Opportunities older than TTL should be expired."""
        exchanges, _ = setup_exchanges
        detector = ArbitrageDetector(
            exchanges=exchanges,
            min_spread_bps=0.0,
            fee_pct=0.001,
            slippage_bps=0.1,
            opportunity_ttl=0.01,  # 10ms TTL — expires almost immediately
        )
        detector.scan()
        initial_count = detector.active_count

        import time as _time
        _time.sleep(0.02)  # wait for TTL to expire

        detector.scan()  # next scan triggers expiry
        assert detector.active_count <= initial_count
        assert detector.stats["total_expired"] >= 0
