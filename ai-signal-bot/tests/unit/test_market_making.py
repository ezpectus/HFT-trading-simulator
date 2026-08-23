"""Unit tests for strategies/market_making.py.

Covers: MarketMakingConfig, Quote, MarketMakingStrategy.
"""
import pytest

from src.strategies.signal import SignalDirection


class TestMarketMakingConfig:
    def test_defaults(self):
        from src.strategies.market_making import MarketMakingConfig
        cfg = MarketMakingConfig()
        assert cfg.gamma == 0.1
        assert cfg.sigma == 0.3
        assert cfg.max_inventory == 5.0
        assert cfg.min_spread == 0.0001

    def test_custom(self):
        from src.strategies.market_making import MarketMakingConfig
        cfg = MarketMakingConfig(gamma=0.2, sigma=0.5, max_inventory=10.0)
        assert cfg.gamma == 0.2
        assert cfg.sigma == 0.5
        assert cfg.max_inventory == 10.0


class TestMarketMakingStrategy:
    @pytest.fixture
    def mm(self):
        from src.strategies.market_making import MarketMakingConfig, MarketMakingStrategy
        return MarketMakingStrategy(MarketMakingConfig())

    def test_init(self, mm):
        assert mm.name == "market_making"
        assert mm.inventory == 0.0
        assert mm.fill_count == 0
        assert mm.order_count == 0
        assert mm.total_pnl == 0.0

    def test_update_inventory(self, mm):
        mm.update_inventory(1.5)
        assert mm.inventory == 1.5
        mm.update_inventory(-0.5)
        assert mm.inventory == 1.0

    def test_update_toxicity(self, mm):
        mm.update_toxicity(0.5)
        assert mm.toxicity_score == 0.5

    def test_generate_quotes_normal(self, mm):
        q = mm.generate_quotes(50000.0)
        assert not q.should_cancel
        assert q.bid_price < q.ask_price
        assert q.mid_price == 50000.0
        assert q.bid_size > 0
        assert q.ask_size > 0
        assert mm.order_count == 1

    def test_generate_quotes_toxic_cancel(self, mm):
        mm.update_toxicity(0.8)
        q = mm.generate_quotes(50000.0)
        assert q.should_cancel
        assert q.bid_price == 0
        assert q.ask_price == 0

    def test_generate_quotes_max_long_inventory(self, mm):
        from src.strategies.market_making import MarketMakingConfig, MarketMakingStrategy
        cfg = MarketMakingConfig(max_inventory=2.0)
        strategy = MarketMakingStrategy(cfg)
        strategy.update_inventory(2.0)
        q = strategy.generate_quotes(50000.0)
        assert q.bid_price == 0
        assert q.ask_price > 0
        assert "ask only" in q.reason

    def test_generate_quotes_max_short_inventory(self, mm):
        from src.strategies.market_making import MarketMakingConfig, MarketMakingStrategy
        cfg = MarketMakingConfig(max_inventory=2.0)
        strategy = MarketMakingStrategy(cfg)
        strategy.update_inventory(-2.0)
        q = strategy.generate_quotes(50000.0)
        assert q.bid_price > 0
        assert q.ask_price == 0
        assert "bid only" in q.reason

    def test_on_fill_buy_increases_inventory(self, mm):
        mm.on_fill("BUY", 1.0, 50000.0)
        assert mm.inventory == 1.0
        assert mm.fill_count == 1

    def test_on_fill_sell_decreases_inventory(self, mm):
        mm.on_fill("BUY", 2.0, 50000.0)
        mm.on_fill("SELL", 1.0, 51000.0)
        assert mm.inventory == 1.0
        assert mm.fill_count == 2
        assert mm.total_pnl > 0

    def test_on_fill_direction_change(self, mm):
        mm.on_fill("BUY", 2.0, 50000.0)
        mm.on_fill("SELL", 3.0, 49000.0)
        assert mm.inventory == -1.0
        assert mm.fill_count == 2

    def test_analyze_no_candles(self, mm):
        sig = mm.analyze("BTC/USDT", [])
        assert sig.direction == SignalDirection.NEUTRAL
        assert "No data" in sig.reason

    def test_analyze_with_candles(self, mm, sample_candles):
        sig = mm.analyze("BTC/USDT", sample_candles)
        assert sig.strategy == "market_making"
        assert sig.entry_price > 0

    def test_analyze_reduce_long_inventory(self, mm, sample_candles):
        from src.strategies.market_making import MarketMakingConfig, MarketMakingStrategy
        cfg = MarketMakingConfig(max_inventory=2.0)
        strategy = MarketMakingStrategy(cfg)
        strategy.update_inventory(1.5)
        sig = strategy.analyze("BTC/USDT", sample_candles)
        assert sig.direction == SignalDirection.SHORT
        assert "Reducing" in sig.reason

    def test_get_stats(self, mm):
        mm.on_fill("BUY", 1.0, 50000.0)
        stats = mm.get_stats()
        assert stats["inventory"] == 1.0
        assert stats["fill_count"] == 1
        assert "fill_rate" in stats
        assert "toxicity" in stats
