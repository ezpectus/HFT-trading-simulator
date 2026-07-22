"""Tests for RealAccountManager — initialization, balance, positions, orders, health."""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.data_collection.real_account import (
    AccountBalance,
    AccountPosition,
    OpenOrder,
    RealAccountManager,
)


class TestAccountBalance:
    def test_dataclass(self):
        b = AccountBalance(asset="USDT", free=50000, used=10000, total=60000)
        assert b.asset == "USDT"
        assert b.free == 50000
        assert b.used == 10000
        assert b.total == 60000

    def test_to_dict(self):
        b = AccountBalance(asset="BTC", free=0.5, used=0.1, total=0.6)
        d = b.to_dict()
        assert d["asset"] == "BTC"
        assert d["free"] == 0.5
        assert d["total"] == 0.6


class TestAccountPosition:
    def test_dataclass(self):
        p = AccountPosition(
            symbol="BTC/USDT", side="long", contracts=0.5,
            entry_price=65000, mark_price=65500, unrealized_pnl=250,
            liquidation_price=50000, leverage=10, margin=3250,
            margin_ratio=5.0,
        )
        assert p.symbol == "BTC/USDT"
        assert p.side == "long"
        assert p.unrealized_pnl == 250
        assert p.leverage == 10

    def test_to_dict(self):
        p = AccountPosition(
            symbol="ETH/USDT", side="short", contracts=2.0,
            entry_price=3500, mark_price=3400, unrealized_pnl=200,
            liquidation_price=4000, leverage=5, margin=1400,
            margin_ratio=4.0,
        )
        d = p.to_dict()
        assert d["symbol"] == "ETH/USDT"
        assert d["side"] == "short"
        assert d["leverage"] == 5


class TestOpenOrder:
    def test_dataclass(self):
        o = OpenOrder(
            order_id="123", symbol="BTC/USDT", side="buy", type="limit",
            quantity=0.5, price=64000, filled=0.2, remaining=0.3,
            status="open", timestamp=1700000000.0,
        )
        assert o.order_id == "123"
        assert o.remaining == 0.3

    def test_to_dict(self):
        o = OpenOrder(
            order_id="456", symbol="ETH/USDT", side="sell", type="market",
            quantity=1.0, price=3500, filled=1.0, remaining=0,
            status="closed", timestamp=1700001000.0,
        )
        d = o.to_dict()
        assert d["order_id"] == "456"
        assert d["status"] == "closed"


class TestRealAccountManagerInit:
    def test_defaults(self):
        mgr = RealAccountManager()
        assert mgr.exchange_name == "binance"
        assert mgr.api_key == ""
        assert mgr.api_secret == ""
        assert mgr.testnet is False
        assert mgr._exchange is None

    def test_custom(self):
        mgr = RealAccountManager(exchange="okx", api_key="key", api_secret="secret", testnet=True)
        assert mgr.exchange_name == "okx"
        assert mgr.api_key == "key"
        assert mgr.testnet is True


class TestRealAccountManagerNotInitialized:
    @pytest.mark.asyncio
    async def test_get_balance_empty(self):
        mgr = RealAccountManager()
        result = await mgr.get_balance()
        assert result == []

    @pytest.mark.asyncio
    async def test_get_positions_empty(self):
        mgr = RealAccountManager()
        result = await mgr.get_positions()
        assert result == []

    @pytest.mark.asyncio
    async def test_get_open_orders_empty(self):
        mgr = RealAccountManager()
        result = await mgr.get_open_orders()
        assert result == []

    @pytest.mark.asyncio
    async def test_get_trade_history_empty(self):
        mgr = RealAccountManager()
        result = await mgr.get_trade_history()
        assert result == []

    @pytest.mark.asyncio
    async def test_set_leverage_false(self):
        mgr = RealAccountManager()
        result = await mgr.set_leverage("BTC/USDT", 10)
        assert result is False

    @pytest.mark.asyncio
    async def test_set_margin_mode_false(self):
        mgr = RealAccountManager()
        result = await mgr.set_margin_mode("BTC/USDT", "isolated")
        assert result is False

    @pytest.mark.asyncio
    async def test_place_order_none(self):
        mgr = RealAccountManager()
        result = await mgr.place_order("BTC/USDT", "buy", 0.5)
        assert result is None

    @pytest.mark.asyncio
    async def test_cancel_order_false(self):
        mgr = RealAccountManager()
        result = await mgr.cancel_order("123", "BTC/USDT")
        assert result is False

    @pytest.mark.asyncio
    async def test_cancel_all_orders_zero(self):
        mgr = RealAccountManager()
        result = await mgr.cancel_all_orders()
        assert result == 0

    @pytest.mark.asyncio
    async def test_get_health_not_initialized(self):
        mgr = RealAccountManager()
        health = await mgr.get_health()
        assert health["connected"] is False

    @pytest.mark.asyncio
    async def test_close_no_error(self):
        mgr = RealAccountManager()
        await mgr.close()  # Should not raise


class TestRealAccountManagerCallbacks:
    def test_set_fill_callback(self):
        mgr = RealAccountManager()
        def cb(x):
            return None
        mgr.set_fill_callback(cb)
        assert mgr._on_fill_callback is cb

    def test_set_margin_warning_callback(self):
        mgr = RealAccountManager()
        def cb(x):
            return None
        mgr.set_margin_warning_callback(cb)
        assert mgr._on_margin_warning_callback is cb


class TestRealAccountManagerWithMockExchange:
    @pytest.mark.asyncio
    async def test_get_balance_with_mock(self):
        mgr = RealAccountManager()
        mock_ex = MagicMock()
        mock_ex.fetch_balance = AsyncMock(return_value={
            "total": {"USDT": 50000, "BTC": 0.5},
            "free": {"USDT": 45000, "BTC": 0.5},
            "used": {"USDT": 5000, "BTC": 0},
        })
        mgr._exchange = mock_ex
        balances = await mgr.get_balance()
        assert len(balances) == 2
        usdt = [b for b in balances if b.asset == "USDT"][0]
        assert usdt.total == 50000
        assert usdt.free == 45000

    @pytest.mark.asyncio
    async def test_get_positions_with_mock(self):
        mgr = RealAccountManager()
        mock_ex = MagicMock()
        mock_ex.fetch_positions = AsyncMock(return_value=[
            {"symbol": "BTC/USDT", "side": "long", "contracts": 0.5,
             "entryPrice": 65000, "markPrice": 65500, "unrealizedPnl": 250,
             "liquidationPrice": 50000, "leverage": 10, "initialMargin": 3250,
             "initialMarginPercentage": 5.0},
            {"symbol": "ETH/USDT", "side": "short", "contracts": 0,
             "entryPrice": 3500, "markPrice": 3400, "unrealizedPnl": 0,
             "liquidationPrice": 4000, "leverage": 5, "initialMargin": 0,
             "initialMarginPercentage": 0},
        ])
        mgr._exchange = mock_ex
        positions = await mgr.get_positions()
        # Only non-zero contracts should be returned
        assert len(positions) == 1
        assert positions[0].symbol == "BTC/USDT"
        assert positions[0].contracts == 0.5

    @pytest.mark.asyncio
    async def test_place_order_with_mock(self):
        mgr = RealAccountManager()
        mock_ex = MagicMock()
        mock_ex.set_leverage = AsyncMock()
        mock_ex.create_order = AsyncMock(return_value={
            "id": "order123", "status": "open",
        })
        mgr._exchange = mock_ex
        result = await mgr.place_order("BTC/USDT", "buy", 0.5, "limit", 64000, leverage=10)
        assert result is not None
        assert result["order_id"] == "order123"
        assert result["side"] == "buy"

    @pytest.mark.asyncio
    async def test_cancel_order_with_mock(self):
        mgr = RealAccountManager()
        mock_ex = MagicMock()
        mock_ex.cancel_order = AsyncMock()
        mgr._exchange = mock_ex
        result = await mgr.cancel_order("order123", "BTC/USDT")
        assert result is True

    @pytest.mark.asyncio
    async def test_get_health_connected(self):
        mgr = RealAccountManager()
        mock_ex = MagicMock()
        mock_ex.fetch_balance = AsyncMock(return_value={"total": {"USDT": 1000}})
        mgr._exchange = mock_ex
        health = await mgr.get_health()
        assert health["connected"] is True
        assert health["exchange"] == "binance"

    @pytest.mark.asyncio
    async def test_get_health_error(self):
        mgr = RealAccountManager()
        mock_ex = MagicMock()
        mock_ex.fetch_balance = AsyncMock(side_effect=Exception("API error"))
        mgr._exchange = mock_ex
        health = await mgr.get_health()
        assert health["connected"] is False
        assert "error" in health

    @pytest.mark.asyncio
    async def test_get_balance_error_returns_empty(self):
        mgr = RealAccountManager()
        mock_ex = MagicMock()
        mock_ex.fetch_balance = AsyncMock(side_effect=Exception("Network error"))
        mgr._exchange = mock_ex
        result = await mgr.get_balance()
        assert result == []

    @pytest.mark.asyncio
    async def test_set_leverage_success(self):
        mgr = RealAccountManager()
        mock_ex = MagicMock()
        mock_ex.set_leverage = AsyncMock()
        mgr._exchange = mock_ex
        result = await mgr.set_leverage("BTC/USDT", 20)
        assert result is True

    @pytest.mark.asyncio
    async def test_set_leverage_error(self):
        mgr = RealAccountManager()
        mock_ex = MagicMock()
        mock_ex.set_leverage = AsyncMock(side_effect=Exception("Not supported"))
        mgr._exchange = mock_ex
        result = await mgr.set_leverage("BTC/USDT", 20)
        assert result is False
