"""Unit tests for backtesting/order_book_replay.py.

Covers: ReplayOrderBookLevel, ReplayOrderBook, OrderBookReplay, OrderBookBacktester.
"""
import pytest


class TestReplayOrderBook:
    def test_empty_book_properties(self):
        from src.backtesting.order_book_replay import ReplayOrderBook
        ob = ReplayOrderBook(symbol="BTC/USDT", exchange="binance", timestamp=0)
        assert ob.mid_price == 0.0
        assert ob.spread == 0.0
        assert ob.spread_bps == 0.0
        assert ob.bid_volume == 0.0
        assert ob.ask_volume == 0.0
        assert ob.obi == 0.0

    def test_with_levels(self):
        from src.backtesting.order_book_replay import ReplayOrderBook, ReplayOrderBookLevel
        ob = ReplayOrderBook(
            symbol="BTC/USDT", exchange="binance", timestamp=0,
            bids=[ReplayOrderBookLevel(49999, 1.0), ReplayOrderBookLevel(49998, 0.5)],
            asks=[ReplayOrderBookLevel(50001, 0.8), ReplayOrderBookLevel(50002, 0.3)],
        )
        assert ob.mid_price == 50000.0
        assert ob.spread == 2.0
        assert ob.bid_volume == 1.5
        assert ob.ask_volume == 1.1
        assert ob.obi > 0

    def test_to_dict(self):
        from src.backtesting.order_book_replay import ReplayOrderBook, ReplayOrderBookLevel
        ob = ReplayOrderBook(
            symbol="BTC/USDT", exchange="binance", timestamp=123,
            bids=[ReplayOrderBookLevel(49999, 1.0)],
            asks=[ReplayOrderBookLevel(50001, 0.8)],
        )
        d = ob.to_dict()
        assert d["symbol"] == "BTC/USDT"
        assert d["mid_price"] == 50000.0
        assert len(d["bids"]) == 1
        assert len(d["asks"]) == 1


class TestOrderBookReplay:
    def test_init(self):
        from src.backtesting.order_book_replay import OrderBookReplay
        replay = OrderBookReplay(depth=10, seed=42)
        assert replay.depth == 10
        assert replay.base_spread_bps == 2.0

    def test_from_candle(self, sample_candle):
        from src.backtesting.order_book_replay import OrderBookReplay
        replay = OrderBookReplay(depth=20, seed=42)
        ob = replay.from_candle(sample_candle, "BTC/USDT", "binance")
        assert ob.symbol == "BTC/USDT"
        assert ob.exchange == "binance"
        assert len(ob.bids) == 20
        assert len(ob.asks) == 20
        assert ob.mid_price > 0
        assert ob.spread > 0
        assert ob.bid_volume > 0
        assert ob.ask_volume > 0

    def test_from_candle_deterministic(self, sample_candle):
        from src.backtesting.order_book_replay import OrderBookReplay
        r1 = OrderBookReplay(depth=10, seed=42)
        r2 = OrderBookReplay(depth=10, seed=42)
        ob1 = r1.from_candle(sample_candle)
        ob2 = r2.from_candle(sample_candle)
        assert ob1.bids[0].price == ob2.bids[0].price
        assert ob1.asks[0].price == ob2.asks[0].price

    def test_replay_series(self, sample_candles):
        from src.backtesting.order_book_replay import OrderBookReplay
        replay = OrderBookReplay(depth=10, seed=42)
        books = replay.replay_series(sample_candles[:10], "BTC/USDT", "binance")
        assert len(books) == 10
        for ob in books:
            assert len(ob.bids) == 10
            assert len(ob.asks) == 10

    def test_replay_with_imbalance_injection(self, sample_candles):
        from src.backtesting.order_book_replay import OrderBookReplay
        replay = OrderBookReplay(depth=10, seed=42)
        books = replay.replay_with_imbalance_injection(
            sample_candles[:40], "BTC/USDT", "binance",
            inject_interval=20, inject_strength=0.4,
        )
        assert len(books) == 40
        # At injection point (i=20), OBI should differ from normal
        assert books[20].obi != books[19].obi


class TestOrderBookBacktester:
    def test_init(self):
        from src.backtesting.order_book_replay import OrderBookBacktester, OrderBookReplay
        replay = OrderBookReplay(depth=10)
        bt = OrderBookBacktester(backtester=None, replay=replay)
        assert bt.order_books == []
        assert bt.replay is replay
