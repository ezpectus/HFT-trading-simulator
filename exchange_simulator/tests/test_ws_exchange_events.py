"""Tests for per-tick exchange events — SL/TP drain, funding, arbitrage execution."""
from unittest.mock import AsyncMock, MagicMock

import pytest

from exchange_simulator.websocket_server import ExchangeWebSocketServer


@pytest.fixture
def mock_market():
    market = MagicMock()
    market.symbols = ["BTC/USDT"]
    market.get_funding_rates.return_value = {"binance": 0.0001}
    market.candles_to_next_funding = 50
    market._funding_interval = 50
    return market


@pytest.fixture
def mock_exchange():
    ex = MagicMock()
    ex.check_stop_loss_take_profit.return_value = []
    ex.check_advanced_orders.return_value = []
    ex.charge_funding.return_value = []
    ex.account.trade_history = []
    return ex


@pytest.fixture
def server(mock_market, mock_exchange):
    exchanges = {"binance": mock_exchange, "bybit": mock_exchange}
    srv = ExchangeWebSocketServer(
        exchanges=exchanges, market=mock_market,
        host="localhost", port=8765,
    )
    srv._broadcast_fills_batch = AsyncMock()
    return srv


def make_opp(spread_bps=25.0, max_quantity=0.5):
    opp = MagicMock()
    opp.symbol = "BTC/USDT"
    opp.buy_exchange = "binance"
    opp.sell_exchange = "bybit"
    opp.spread_bps = spread_bps
    opp.max_quantity = max_quantity
    opp.buy_price = 50000.0
    opp.sell_price = 50020.0
    opp.net_spread = 20.0
    return opp


class TestProcessExchangeEvents:
    @pytest.mark.asyncio
    async def test_drains_each_exchange_and_batches_fills(self, server, mock_exchange):
        order = MagicMock()
        order.status.value = "FILLED"
        order.symbol = "BTC/USDT"
        order.filled_price = 50100.0
        order.filled_quantity = 0.1
        order.side.value = "SELL"
        order.order_type.value = "MARKET"
        order.fee = 0.5
        order.id = "x1"
        order.to_dict.return_value = {"id": "x1"}
        mock_exchange.check_stop_loss_take_profit.return_value = [order]

        await server._process_exchange_events()

        mock_exchange.check_stop_loss_take_profit.assert_called()
        mock_exchange.check_advanced_orders.assert_called()
        mock_exchange.update_positions_pnl.assert_called()
        server._broadcast_fills_batch.assert_awaited()
        batch = server._broadcast_fills_batch.await_args.args[0]
        assert batch == [{"id": "x1"}]

    @pytest.mark.asyncio
    async def test_no_fills_means_no_broadcast(self, server):
        await server._process_exchange_events()
        server._broadcast_fills_batch.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_funding_charged_on_interval_boundary(self, server, mock_exchange):
        # mock_market fixture: candles_to_next_funding == _funding_interval (50)
        await server._process_exchange_events()
        mock_exchange.charge_funding.assert_called_with(0.0001)


class TestProcessArbitrage:
    @pytest.mark.asyncio
    async def test_no_detector_returns_none(self, server):
        server.arb_detector = None
        assert await server._process_arbitrage() is None

    @pytest.mark.asyncio
    async def test_small_spread_not_executed(self, server):
        server.arb_detector = MagicMock()
        server.arb_detector.scan.return_value = [make_opp(spread_bps=5.0)]
        server.arb_detector.to_dict.return_value = {"opportunities": 1}
        server._execute_arbitrage = AsyncMock()

        result = await server._process_arbitrage()

        server._execute_arbitrage.assert_not_awaited()
        assert result == {"opportunities": 1}

    @pytest.mark.asyncio
    async def test_wide_spread_executes_when_trading_active(self, server):
        server.arb_detector = MagicMock()
        opp = make_opp(spread_bps=25.0)
        server.arb_detector.scan.return_value = [opp]
        server.arb_detector.to_dict.return_value = {"opportunities": 1}
        server._execute_arbitrage = AsyncMock()
        server._trading_active = True

        await server._process_arbitrage()
        server._execute_arbitrage.assert_awaited_once_with(opp)

    @pytest.mark.asyncio
    async def test_wide_spread_skipped_when_trading_halted(self, server):
        server.arb_detector = MagicMock()
        server.arb_detector.scan.return_value = [make_opp(spread_bps=25.0)]
        server.arb_detector.to_dict.return_value = {"opportunities": 1}
        server._execute_arbitrage = AsyncMock()
        server._trading_active = False

        await server._process_arbitrage()
        server._execute_arbitrage.assert_not_awaited()


class TestExecuteArbitrage:
    @pytest.mark.asyncio
    async def test_paired_market_orders_and_close_opportunity(self, server, mock_exchange):
        filled = MagicMock()
        filled.status.value = "FILLED"
        filled.filled_price = 50000.0
        filled.filled_quantity = 0.5
        filled.fee = 1.0
        filled.id = "o1"
        filled.to_dict.return_value = {"id": "o1"}
        mock_exchange.submit_order.return_value = filled
        server.arb_detector = MagicMock()
        server._trading_active = True

        await server._execute_arbitrage(make_opp())

        # paired orders on both venues
        calls = mock_exchange.submit_order.call_args_list
        assert len(calls) == 2
        sides = {c.kwargs["side"] for c in calls}
        assert len(sides) == 2  # one BUY, one SELL
        server.arb_detector.close_opportunity.assert_called_once_with(
            "BTC/USDT", "binance", "bybit", "AUTO_EXECUTED"
        )

    @pytest.mark.asyncio
    async def test_failed_leg_marks_opportunity_failed(self, server, mock_exchange):
        rejected = MagicMock()
        rejected.status.value = "REJECTED"
        rejected.rejection_reason = "INSUFFICIENT_MARGIN"
        mock_exchange.submit_order.return_value = rejected
        server.arb_detector = MagicMock()

        await server._execute_arbitrage(make_opp())

        server.arb_detector.close_opportunity.assert_called_once_with(
            "BTC/USDT", "binance", "bybit", "FAILED"
        )
        server._broadcast_fills_batch.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_unknown_venue_returns_early(self, server):
        opp = make_opp()
        opp.buy_exchange = "kraken"  # not in server.exchanges
        server.arb_detector = MagicMock()
        await server._execute_arbitrage(opp)
        server.arb_detector.close_opportunity.assert_not_called()
