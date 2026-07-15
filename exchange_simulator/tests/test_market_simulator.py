"""Tests for MarketSimulator — GBM price generation, news events, funding, weekend mode."""
import pytest

from exchange_simulator.market_simulator import MarketSimulator


@pytest.fixture
def market():
    return MarketSimulator(
        symbols=["BTC/USDT", "ETH/USDT"],
        exchanges=["binance", "bybit", "okx"],
        initial_prices={"BTC/USDT": 65000, "ETH/USDT": 3500},
        volatility={"BTC/USDT": 0.75, "ETH/USDT": 1.2},
        seed=42,
        warmup_candles=50,
        order_book_depth=10,
    )


class TestMarketSimulator:
    def test_initialization(self, market):
        assert len(market.symbols) == 2
        assert len(market.exchanges) == 3
        assert market.timeframe_seconds == 300

    def test_initial_prices_set(self, market):
        assert market.get_price("BTC/USDT", "binance") > 0
        assert market.get_price("ETH/USDT", "binance") > 0

    def test_warmup_generates_history(self, market):
        # After 50 warmup candles, history should exist
        for ex in ["binance", "bybit", "okx"]:
            for sym in ["BTC/USDT", "ETH/USDT"]:
                history = market.get_history(ex, sym, n=10)
                assert len(history) > 0

    def test_next_candle_returns_candles(self, market):
        candles = market.next_candle()
        assert len(candles) == 6  # 3 exchanges * 2 symbols
        for c in candles:
            assert c.open > 0
            assert c.high >= c.open
            assert c.low <= c.open
            assert c.close > 0
            assert c.volume > 0

    def test_candle_ohlc_consistency(self, market):
        candles = market.next_candle()
        for c in candles:
            assert c.high >= max(c.open, c.close)
            assert c.low <= min(c.open, c.close)

    def test_get_latest_candles(self, market):
        candles = market.get_latest_candles()
        assert len(candles) == 6  # 3 exchanges * 2 symbols

    def test_get_history_n(self, market):
        history = market.get_history("binance", "BTC/USDT", n=20)
        assert len(history) <= 20
        assert len(history) > 0

    def test_get_all_prices(self, market):
        prices = market.get_all_prices()
        assert "binance" in prices
        assert "bybit" in prices
        assert "okx" in prices
        assert "BTC/USDT" in prices["binance"]
        assert prices["binance"]["BTC/USDT"] > 0

    def test_exchange_offsets_create_price_differences(self, market):
        # Different exchanges should have slightly different prices
        prices = market.get_all_prices()
        binance_btc = prices["binance"]["BTC/USDT"]
        okx_btc = prices["okx"]["BTC/USDT"]
        assert binance_btc != okx_btc

    def test_generate_order_book(self, market):
        ob = market.generate_order_book("binance", "BTC/USDT")
        assert ob.symbol == "BTC/USDT"
        assert ob.exchange == "binance"
        assert len(ob.bids) == 10
        assert len(ob.asks) == 10
        # Bids should be below asks
        assert ob.best_bid < ob.best_ask
        # Bid levels should be descending
        for i in range(len(ob.bids) - 1):
            assert ob.bids[i].price > ob.bids[i + 1].price
        # Ask levels should be ascending
        for i in range(len(ob.asks) - 1):
            assert ob.asks[i].price < ob.asks[i + 1].price

    def test_order_book_quantities_decay(self, market):
        ob = market.generate_order_book("binance", "BTC/USDT")
        # First level should generally have more quantity than last
        # (exponential decay, but with random factor — check on average)
        total_first = ob.bids[0].quantity + ob.asks[0].quantity
        total_last = ob.bids[-1].quantity + ob.asks[-1].quantity
        # With decay factor 0.15, last level should be much smaller
        assert total_first > total_last

    def test_current_timestamp_advances(self, market):
        ts_before = market.current_timestamp
        market.next_candle()
        ts_after = market.current_timestamp
        assert ts_after == ts_before + 300  # 5 minute timeframe

    def test_funding_rates(self, market):
        rates = market.get_funding_rates()
        assert isinstance(rates, dict)
        for ex in ["binance", "bybit", "okx"]:
            assert ex in rates

    def test_candles_to_next_funding(self, market):
        remaining = market.candles_to_next_funding
        assert remaining > 0
        assert remaining <= 96  # funding interval

    def test_weekend_mode(self, market):
        assert market.is_weekend_mode is False  # default
        market.set_weekend_mode(True)
        assert market.is_weekend_mode is True
        market.set_weekend_mode(False)
        assert market.is_weekend_mode is False

    def test_auto_check_weekend(self, market):
        result = market.auto_check_weekend()
        assert isinstance(result, bool)

    def test_news_event_initially_none(self, market):
        news = market.get_news_event()
        assert news is None

    def test_get_replay_candles(self, market):
        # Get latest candle (offset=0)
        candles = market.get_replay_candles(0)
        assert len(candles) == 6
        # Get previous candle (offset=1)
        candles_prev = market.get_replay_candles(1)
        assert len(candles_prev) == 6

    def test_get_replay_range(self, market):
        candles = market.get_replay_range(0, 5)
        assert len(candles) > 0

    def test_deterministic_with_same_seed(self):
        m1 = MarketSimulator(
            symbols=["BTC/USDT"], exchanges=["binance"],
            initial_prices={"BTC/USDT": 65000}, volatility={"BTC/USDT": 0.75},
            seed=123, warmup_candles=10,
        )
        m2 = MarketSimulator(
            symbols=["BTC/USDT"], exchanges=["binance"],
            initial_prices={"BTC/USDT": 65000}, volatility={"BTC/USDT": 0.75},
            seed=123, warmup_candles=10,
        )
        p1 = m1.get_price("BTC/USDT", "binance")
        p2 = m2.get_price("BTC/USDT", "binance")
        assert p1 == p2  # Same seed = same prices

    def test_different_seeds_different_prices(self):
        m1 = MarketSimulator(
            symbols=["BTC/USDT"], exchanges=["binance"],
            initial_prices={"BTC/USDT": 65000}, volatility={"BTC/USDT": 0.75},
            seed=111, warmup_candles=50,
        )
        m2 = MarketSimulator(
            symbols=["BTC/USDT"], exchanges=["binance"],
            initial_prices={"BTC/USDT": 65000}, volatility={"BTC/USDT": 0.75},
            seed=222, warmup_candles=50,
        )
        p1 = m1.get_price("BTC/USDT", "binance")
        p2 = m2.get_price("BTC/USDT", "binance")
        assert p1 != p2  # Different seeds = different prices
