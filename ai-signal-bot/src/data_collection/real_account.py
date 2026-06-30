"""Real account/position management via exchange REST + WebSocket APIs.

Features:
- REST API: balance, positions, open orders, trade history
- WebSocket: user data stream (fills, position updates, margin warnings)
- Normalize to internal format
- Margin/leverage management
"""

from __future__ import annotations

import asyncio
import time
import hmac
import hashlib
import json
from dataclasses import dataclass, field
from typing import Optional, Any
from collections import defaultdict

import logging
logger = logging.getLogger(__name__)

try:
    import aiohttp
    AIOHTTP_AVAILABLE = True
except ImportError:
    AIOHTTP_AVAILABLE = False

try:
    import ccxt.async_support as ccxt
    CCXT_AVAILABLE = True
except ImportError:
    CCXT_AVAILABLE = False


@dataclass
class AccountBalance:
    asset: str
    free: float
    used: float
    total: float

    def to_dict(self) -> dict:
        return {"asset": self.asset, "free": self.free, "used": self.used, "total": self.total}


@dataclass
class AccountPosition:
    symbol: str
    side: str           # "long" or "short"
    contracts: float
    entry_price: float
    mark_price: float
    unrealized_pnl: float
    liquidation_price: float
    leverage: int
    margin: float
    margin_ratio: float

    def to_dict(self) -> dict:
        return {
            "symbol": self.symbol, "side": self.side, "contracts": self.contracts,
            "entry_price": self.entry_price, "mark_price": self.mark_price,
            "unrealized_pnl": self.unrealized_pnl,
            "liquidation_price": self.liquidation_price,
            "leverage": self.leverage, "margin": self.margin,
            "margin_ratio": self.margin_ratio,
        }


@dataclass
class OpenOrder:
    order_id: str
    symbol: str
    side: str
    type: str
    quantity: float
    price: float
    filled: float
    remaining: float
    status: str
    timestamp: float

    def to_dict(self) -> dict:
        return {
            "order_id": self.order_id, "symbol": self.symbol, "side": self.side,
            "type": self.type, "quantity": self.quantity, "price": self.price,
            "filled": self.filled, "remaining": self.remaining,
            "status": self.status, "timestamp": self.timestamp,
        }


class RealAccountManager:
    """Real exchange account management via ccxt or direct REST."""

    def __init__(self, exchange: str = "binance",
                 api_key: str = "", api_secret: str = "",
                 testnet: bool = False):
        self.exchange_name = exchange
        self.api_key = api_key
        self.api_secret = api_secret
        self.testnet = testnet
        self._exchange: Optional[Any] = None
        self._ws_session: Optional[Any] = None
        self._user_data_stream_key: Optional[str] = None
        self._listen_task: Optional[asyncio.Task] = None
        self._on_fill_callback = None
        self._on_margin_warning_callback = None

    async def initialize(self) -> None:
        """Initialize exchange connection."""
        if not CCXT_AVAILABLE:
            raise RuntimeError("ccxt not available. Install with: pip install ccxt")

        exchange_class = getattr(ccxt, self.exchange_name, None)
        if exchange_class is None:
            raise ValueError(f"Unsupported exchange: {self.exchange_name}")

        self._exchange = exchange_class({
            "apiKey": self.api_key,
            "secret": self.api_secret,
            "enableRateLimit": True,
        })

        if self.testnet:
            if hasattr(self._exchange, "set_sandbox_mode"):
                self._exchange.set_sandbox_mode(True)

        try:
            await self._exchange.load_markets()
            logger.info(f"[RealAccount] Connected to {self.exchange_name} (testnet={self.testnet})")
        except Exception as e:
            logger.error(f"[RealAccount] Failed to connect: {e}")
            raise

    async def close(self) -> None:
        """Close exchange connection."""
        if self._listen_task:
            self._listen_task.cancel()
            try:
                await self._listen_task
            except asyncio.CancelledError:
                pass
        if self._exchange:
            await self._exchange.close()
        if self._ws_session:
            await self._ws_session.close()

    async def get_balance(self) -> list[AccountBalance]:
        """Fetch account balances."""
        if not self._exchange:
            return []
        try:
            balance = await self._exchange.fetch_balance()
            result = []
            for asset, amounts in balance.get("total", {}).items():
                if amounts and amounts > 0:
                    result.append(AccountBalance(
                        asset=asset,
                        free=balance.get("free", {}).get(asset, 0),
                        used=balance.get("used", {}).get(asset, 0),
                        total=amounts,
                    ))
            return result
        except Exception as e:
            logger.error(f"[RealAccount] Failed to fetch balance: {e}")
            return []

    async def get_positions(self) -> list[AccountPosition]:
        """Fetch open positions (futures)."""
        if not self._exchange:
            return []
        try:
            positions = await self._exchange.fetch_positions()
            result = []
            for pos in positions:
                contracts = float(pos.get("contracts", 0) or 0)
                if contracts == 0:
                    continue
                result.append(AccountPosition(
                    symbol=pos.get("symbol", ""),
                    side=pos.get("side", "long"),
                    contracts=contracts,
                    entry_price=float(pos.get("entryPrice", 0) or 0),
                    mark_price=float(pos.get("markPrice", 0) or 0),
                    unrealized_pnl=float(pos.get("unrealizedPnl", 0) or 0),
                    liquidation_price=float(pos.get("liquidationPrice", 0) or 0),
                    leverage=int(pos.get("leverage", 1) or 1),
                    margin=float(pos.get("initialMargin", 0) or 0),
                    margin_ratio=float(pos.get("initialMarginPercentage", 0) or 0),
                ))
            return result
        except Exception as e:
            logger.error(f"[RealAccount] Failed to fetch positions: {e}")
            return []

    async def get_open_orders(self, symbol: Optional[str] = None) -> list[OpenOrder]:
        """Fetch open orders."""
        if not self._exchange:
            return []
        try:
            orders = await self._exchange.fetch_open_orders(symbol)
            result = []
            for o in orders:
                result.append(OpenOrder(
                    order_id=str(o.get("id", "")),
                    symbol=o.get("symbol", ""),
                    side=o.get("side", ""),
                    type=o.get("type", ""),
                    quantity=float(o.get("amount", 0) or 0),
                    price=float(o.get("price", 0) or 0),
                    filled=float(o.get("filled", 0) or 0),
                    remaining=float(o.get("remaining", 0) or 0),
                    status=o.get("status", ""),
                    timestamp=float(o.get("timestamp", 0) or 0) / 1000,
                ))
            return result
        except Exception as e:
            logger.error(f"[RealAccount] Failed to fetch open orders: {e}")
            return []

    async def get_trade_history(self, symbol: Optional[str] = None, limit: int = 100) -> list[dict]:
        """Fetch recent trade history."""
        if not self._exchange:
            return []
        try:
            trades = await self._exchange.fetch_my_trades(symbol, limit=limit)
            return [{
                "order_id": str(t.get("order", "")),
                "symbol": t.get("symbol", ""),
                "side": t.get("side", ""),
                "qty": float(t.get("amount", 0) or 0),
                "price": float(t.get("price", 0) or 0),
                "fee": float(t.get("fee", {}).get("cost", 0) or 0),
                "timestamp": float(t.get("timestamp", 0) or 0) / 1000,
            } for t in trades]
        except Exception as e:
            logger.error(f"[RealAccount] Failed to fetch trade history: {e}")
            return []

    async def set_leverage(self, symbol: str, leverage: int) -> bool:
        """Set leverage for a symbol."""
        if not self._exchange:
            return False
        try:
            await self._exchange.set_leverage(leverage, symbol)
            logger.info(f"[RealAccount] Set {symbol} leverage to {leverage}x")
            return True
        except Exception as e:
            logger.error(f"[RealAccount] Failed to set leverage: {e}")
            return False

    async def set_margin_mode(self, symbol: str, mode: str = "isolated") -> bool:
        """Set margin mode (isolated or cross)."""
        if not self._exchange:
            return False
        try:
            await self._exchange.set_margin_mode(mode, symbol)
            logger.info(f"[RealAccount] Set {symbol} margin mode to {mode}")
            return True
        except Exception as e:
            logger.error(f"[RealAccount] Failed to set margin mode: {e}")
            return False

    async def place_order(
        self, symbol: str, side: str, quantity: float,
        order_type: str = "market", price: Optional[float] = None,
        leverage: int = 1, stop_loss: Optional[float] = None,
        take_profit: Optional[float] = None
    ) -> Optional[dict]:
        """Place an order on the exchange."""
        if not self._exchange:
            return None
        try:
            await self.set_leverage(symbol, leverage)
            params = {}
            if stop_loss:
                params["stopLossPrice"] = stop_loss
            if take_profit:
                params["takeProfitPrice"] = take_profit

            order = await self._exchange.create_order(
                symbol=symbol,
                type=order_type,
                side=side,
                amount=quantity,
                price=price,
                params=params,
            )
            logger.info(f"[RealAccount] Order placed: {side} {quantity} {symbol} @ {order_type}")
            return {
                "order_id": str(order.get("id", "")),
                "symbol": symbol,
                "side": side,
                "type": order_type,
                "quantity": quantity,
                "price": price or 0,
                "status": order.get("status", ""),
            }
        except Exception as e:
            logger.error(f"[RealAccount] Failed to place order: {e}")
            return None

    async def cancel_order(self, order_id: str, symbol: str) -> bool:
        """Cancel an open order."""
        if not self._exchange:
            return False
        try:
            await self._exchange.cancel_order(order_id, symbol)
            logger.info(f"[RealAccount] Order {order_id} cancelled")
            return True
        except Exception as e:
            logger.error(f"[RealAccount] Failed to cancel order: {e}")
            return False

    async def cancel_all_orders(self, symbol: Optional[str] = None) -> int:
        """Cancel all open orders."""
        if not self._exchange:
            return 0
        try:
            result = await self._exchange.cancel_all_orders(symbol)
            count = len(result) if isinstance(result, list) else 0
            logger.info(f"[RealAccount] Cancelled {count} orders")
            return count
        except Exception as e:
            logger.error(f"[RealAccount] Failed to cancel all orders: {e}")
            return 0

    def set_fill_callback(self, callback) -> None:
        """Set callback for fill events from user data stream."""
        self._on_fill_callback = callback

    def set_margin_warning_callback(self, callback) -> None:
        """Set callback for margin warning events."""
        self._on_margin_warning_callback = callback

    async def start_user_data_stream(self) -> None:
        """Start WebSocket user data stream for real-time updates."""
        if not self._exchange or not hasattr(self._exchange, "watch_orders"):
            logger.warning("[RealAccount] User data stream not supported by this exchange")
            return

        self._listen_task = asyncio.create_task(self._listen_user_data())

    async def _listen_user_data(self) -> None:
        """Listen to user data stream for fills and margin warnings."""
        while True:
            try:
                if hasattr(self._exchange, "watch_orders"):
                    orders = await self._exchange.watch_orders()
                    for o in orders:
                        if o.get("status") == "closed" and self._on_fill_callback:
                            await self._on_fill_callback({
                                "order_id": str(o.get("id", "")),
                                "symbol": o.get("symbol", ""),
                                "side": o.get("side", ""),
                                "qty": float(o.get("filled", 0) or 0),
                                "price": float(o.get("average", 0) or 0),
                                "fee": float(o.get("fee", {}).get("cost", 0) or 0),
                                "timestamp": time.time(),
                            })
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"[RealAccount] User data stream error: {e}")
                await asyncio.sleep(5)

    async def get_health(self) -> dict:
        """Check exchange account connectivity."""
        if not self._exchange:
            return {"connected": False, "reason": "Not initialized"}
        try:
            await self._exchange.fetch_balance()
            return {"connected": True, "exchange": self.exchange_name, "testnet": self.testnet}
        except Exception as e:
            return {"connected": False, "error": str(e)}
