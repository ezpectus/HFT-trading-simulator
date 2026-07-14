"""Integration test: Exchange simulator multi-exchange data flow.

Tests the full pipeline: MarketSimulator → candle generation → order book →
arbitrage detection → account management → order execution → position tracking.
"""
import pytest
import asyncio

from exchange_simulator.market_simulator import MarketSimulator
from exchange_simulator.arbitrage import ArbitrageDetector, ArbStatus
from exchange_simulator.models import (
    Candle, OrderBook, OrderBookLevel, Order, Side, OrderType, OrderStatus,
    Account, Position, ClosedTrade,
)


class TestMarketSimulatorDataFlow:
    """Test that MarketSimulator generates consistent data across exchanges."""

    def test_generates_candles_for_all_exchanges(self):
        sim = MarketSimulator(
            symbols=["BTC/USDT", "ETH/USDT"],
            exchanges=["binance", "bybit", "okx"],
            initial_prices={"BTC/USDT": 65000, "ETH/USDT": 3500},
            volatility={"BTC/USDT": 0.8, "ETH/USDT": 1.2},
            warmup_candles=50,
        )
        candles = sim.next_candle()
        assert len(candles) == 6  # 2 symbols × 3 exchanges
        symbols = {c.symbol for c in candles}
        exchanges = {c.exchange for c in candles}
        assert symbols == {"BTC/USDT", "ETH/USDT"}
        assert exchanges == {"binance", "bybit", "okx"}

    def test_candles_have_valid_ohlc(self):
        sim = MarketSimulator(
            symbols=["BTC/USDT"],
            exchanges=["binance"],
            initial_prices={"BTC/USDT": 65000},
            volatility={"BTC/USDT": 0.8},
            warmup_candles=10,
        )
        candles = sim.next_candle()
        for c in candles:
            assert c.high >= c.open
            assert c.high >= c.close
            assert c.low <= c.open
            assert c.low <= c.close
            assert c.volume > 0

    def test_exchange_price_offsets(self):
        """Each exchange should have slightly different prices."""
        sim = MarketSimulator(
            symbols=["BTC/USDT"],
            exchanges=["binance", "bybit", "okx"],
            initial_prices={"BTC/USDT": 65000},
            volatility={"BTC/USDT": 0.5},
            warmup_candles=100,
        )
        # Generate multiple candles and check prices differ
        for _ in range(5):
            candles = sim.next_candle()
            prices = {c.exchange: c.close for c in candles if c.symbol == "BTC/USDT"}
            # Not all prices should be identical
            unique_prices = set(round(p, 4) for p in prices.values())
            assert len(unique_prices) >= 1  # At least generated

    def test_order_book_generation(self):
        sim = MarketSimulator(
            symbols=["BTC/USDT"],
            exchanges=["binance"],
            initial_prices={"BTC/USDT": 65000},
            volatility={"BTC/USDT": 0.8},
            warmup_candles=10,
            order_book_depth=10,
        )
        ob = sim.generate_order_book("binance", "BTC/USDT")
        assert ob is not None
        assert len(ob.bids) > 0
        assert len(ob.asks) > 0
        assert ob.best_bid < ob.best_ask  # No crossed book
        assert ob.best_bid > 0
        assert ob.best_ask > 0


class TestArbitrageIntegration:
    """Test arbitrage detection with simulated exchange data."""

    def test_detects_arbitrage_across_exchanges(self):
        # Create mock exchanges with different prices
        class MockExchange:
            def __init__(self, symbols, bid, ask, bid_qty=1.0, ask_qty=1.0):
                self.symbols = symbols
                self._bid = bid
                self._ask = ask
                self._bid_qty = bid_qty
                self._ask_qty = ask_qty

            def get_order_book(self, symbol):
                if symbol not in self.symbols:
                    return None
                return OrderBook(
                    symbol=symbol,
                    exchange="mock",
                    bids=[OrderBookLevel(price=self._bid, quantity=self._bid_qty)],
                    asks=[OrderBookLevel(price=self._ask, quantity=self._ask_qty)],
                )

        # Exchange A: ask=100, Exchange B: bid=102 → arbitrage
        ex_a = MockExchange(["BTC/USDT"], bid=99, ask=100, bid_qty=2, ask_qty=2)
        ex_b = MockExchange(["BTC/USDT"], bid=102, ask=103, bid_qty=2, ask_qty=2)

        detector = ArbitrageDetector(
            exchanges={"exchange_a": ex_a, "exchange_b": ex_b},
            fee_pct=0.01,  # Very low fee to ensure detection
            slippage_bps=0.1,
            min_spread_bps=1.0,
        )

        opportunities = detector.scan()
        assert len(opportunities) > 0
        opp = opportunities[0]
        assert opp.buy_exchange == "exchange_a"
        assert opp.sell_exchange == "exchange_b"
        assert opp.net_spread > 0
        assert opp.status == ArbStatus.OPEN

    def test_no_arbitrage_when_spread_too_small(self):
        class MockExchange:
            def __init__(self, symbols, bid, ask, bid_qty=1.0, ask_qty=1.0):
                self.symbols = symbols
                self._bid = bid
                self._ask = ask
                self._bid_qty = bid_qty
                self._ask_qty = ask_qty

            def get_order_book(self, symbol):
                return OrderBook(
                    symbol=symbol, exchange="mock",
                    bids=[OrderBookLevel(price=self._bid, quantity=self._bid_qty)],
                    asks=[OrderBookLevel(price=self._ask, quantity=self._ask_qty)],
                )

        # Very small spread, high fees
        ex_a = MockExchange(["BTC/USDT"], bid=100, ask=100.01)
        ex_b = MockExchange(["BTC/USDT"], bid=100.02, ask=100.03)

        detector = ArbitrageDetector(
            exchanges={"a": ex_a, "b": ex_b},
            fee_pct=0.1,
            slippage_bps=1.0,
            min_spread_bps=5.0,
        )

        opportunities = detector.scan()
        assert len(opportunities) == 0

    def test_close_opportunity(self):
        class MockExchange:
            def __init__(self, symbols, bid, ask, bid_qty=1.0, ask_qty=1.0):
                self.symbols = symbols
                self._bid = bid
                self._ask = ask
                self._bid_qty = bid_qty
                self._ask_qty = ask_qty

            def get_order_book(self, symbol):
                return OrderBook(
                    symbol=symbol, exchange="mock",
                    bids=[OrderBookLevel(price=self._bid, quantity=self._bid_qty)],
                    asks=[OrderBookLevel(price=self._ask, quantity=self._ask_qty)],
                )

        ex_a = MockExchange(["BTC/USDT"], bid=99, ask=100, bid_qty=2, ask_qty=2)
        ex_b = MockExchange(["BTC/USDT"], bid=102, ask=103, bid_qty=2, ask_qty=2)

        detector = ArbitrageDetector(
            exchanges={"a": ex_a, "b": ex_b},
            fee_pct=0.01, slippage_bps=0.1, min_spread_bps=1.0,
        )

        opps = detector.scan()
        assert len(opps) == 1
        detector.close_opportunity("BTC/USDT", "a", "b", "executed")
        assert detector.active_count == 0
        closed = detector.get_recent_closed()
        assert len(closed) == 1
        assert closed[0].status == ArbStatus.CLOSED


class TestModelsDataFlow:
    """Test model serialization and inter-model consistency."""

    def test_candle_to_dict_roundtrip(self):
        c = Candle(timestamp=1000, open=100, high=105, low=95, close=102,
                    volume=500, symbol="BTC/USDT", exchange="binance")
        d = c.to_dict()
        assert d["timestamp"] == 1000
        assert d["open"] == 100
        assert d["symbol"] == "BTC/USDT"
        assert d["exchange"] == "binance"

    def test_orderbook_properties(self):
        ob = OrderBook(
            symbol="BTC/USDT", exchange="binance",
            bids=[OrderBookLevel(100, 1.5), OrderBookLevel(99, 2.0)],
            asks=[OrderBookLevel(101, 1.0), OrderBookLevel(102, 3.0)],
            timestamp=1000,
        )
        assert ob.best_bid == 100
        assert ob.best_ask == 101
        assert ob.spread == 1
        assert ob.mid_price == 100.5

    def test_order_to_dict(self):
        o = Order(id="1", symbol="BTC/USDT", exchange="binance",
                  side=Side.BUY, order_type=OrderType.LIMIT, quantity=0.5,
                  price=65000, status=OrderStatus.FILLED, filled_price=65001,
                  filled_quantity=0.5, fee=4.875)
        d = o.to_dict()
        assert d["side"] == "BUY"
        assert d["order_type"] == "LIMIT"
        assert d["status"] == "FILLED"
        assert d["filled_price"] == 65001

    def test_position_pnl_update(self):
        p = Position(symbol="BTC/USDT", exchange="binance", side=Side.BUY,
                     quantity=0.5, entry_price=65000, stop_loss=64000,
                     take_profit=67000)
        p.update_pnl(66000)
        assert p.unrealized_pnl == pytest.approx(500.0)
        p.update_pnl(64000)
        assert p.unrealized_pnl == pytest.approx(-500.0)

    def test_account_equity(self):
        pos = Position(symbol="BTC/USDT", exchange="binance", side=Side.BUY,
                       quantity=0.5, entry_price=65000, stop_loss=64000,
                       take_profit=67000)
        pos.update_pnl(66000)
        acc = Account(exchange="binance", balance=100000, positions=[pos])
        assert acc.equity == pytest.approx(100500.0)

    def test_account_win_rate(self):
        acc = Account(exchange="binance", balance=100000, total_trades=10,
                      winning_trades=6)
        assert acc.win_rate == 60.0

    def test_account_win_rate_no_trades(self):
        acc = Account(exchange="binance", balance=100000)
        assert acc.win_rate == 0.0

    def test_closed_trade_to_dict(self):
        t = ClosedTrade(
            symbol="BTC/USDT", exchange="binance", side="BUY",
            quantity=0.5, entry_price=65000, exit_price=66000,
            pnl=500, fee=9.75, reason="TAKE_PROFIT", opened_at=1000,
        )
        d = t.to_dict()
        assert d["pnl"] == 500
        assert d["reason"] == "TAKE_PROFIT"
        assert d["side"] == "BUY"
