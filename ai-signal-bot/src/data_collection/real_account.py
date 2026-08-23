"""Real account/position management via exchange REST + WebSocket APIs.

Features:
- REST API: balance, positions, open orders, trade history
- WebSocket: user data stream (fills, position updates, margin warnings)
- Normalize to internal format
- Margin/leverage management
"""

from __future__ import annotations

import asyncio
import importlib.util
import logging
import time
from dataclasses import dataclass
from typing import Any  # Any: ccxt/aiohttp objects lack type stubs

logger = logging.getLogger(__name__)

AIOHTTP_AVAILABLE = importlib.util.find_spec("aiohttp") is not None

try:
    import ccxt.async_support as ccxt
    CCXT_AVAILABLE = True
except ImportError:
    CCXT_AVAILABLE = False


@dataclass
class AssetBalance:
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
        self._exchange: Any | None = None  # ccxt.Exchange — ccxt has no type stubs
        self._ws_session: Any | None = None  # aiohttp.ClientSession — duck-typed
        self._user_data_stream_key: str | None = None
        self._listen_task: asyncio.Task | None = None
        self._on_fill_callback = None
        self._on_margin_warning_callback = None
        self._leverage_cache: dict[str, int] = {}

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
            logger.info("[RealAccount] Connected to %s (testnet=%s)", self.exchange_name, self.testnet)
        except (OSError, RuntimeError, ValueError) as e:
            logger.error("[RealAccount] Failed to connect: %s", e)
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
            try:
                await self._ws_session.close()
            except (OSError, RuntimeError) as e:
                logger.debug("[RealAccount] WS session close error: %s", e)

    async def get_balance(self) -> list[AssetBalance]:
        """Fetch account balances."""
        if not self._exchange:
            return []
        try:
            balance = await self._exchange.fetch_balance()
            result = []
            for asset, amounts in balance.get("total", {}).items():
                if amounts and amounts > 0:
                    result.append(AssetBalance(
                        asset=asset,
                        free=balance.get("free", {}).get(asset, 0),
                        used=balance.get("used", {}).get(asset, 0),
                        total=amounts,
                    ))
            return result
        except (OSError, RuntimeError, KeyError, ValueError) as e:
            logger.error("[RealAccount] Failed to fetch balance: %s", e)
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
        except (OSError, RuntimeError, KeyError, ValueError) as e:
            logger.error("[RealAccount] Failed to fetch positions: %s", e)
            return []

    async def get_open_orders(self, symbol: str | None = None) -> list[OpenOrder]:
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
        except (OSError, RuntimeError, KeyError, ValueError) as e:
            logger.error("[RealAccount] Failed to fetch open orders: %s", e)
            return []

    async def get_trade_history(self, symbol: str | None = None, limit: int = 100) -> list[dict]:
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
        except (OSError, RuntimeError, KeyError, ValueError) as e:
            logger.error("[RealAccount] Failed to fetch trade history: %s", e)
            return []

    async def set_leverage(self, symbol: str, leverage: int) -> bool:
        """Set leverage for a symbol."""
        if not self._exchange:
            return False
        try:
            await self._exchange.set_leverage(leverage, symbol)
            logger.info("[RealAccount] Set %s leverage to %sx", symbol, leverage)
            return True
        except (OSError, RuntimeError, KeyError, ValueError) as e:
            logger.error("[RealAccount] Failed to set leverage: %s", e)
            return False

    async def set_margin_mode(self, symbol: str, mode: str = "isolated") -> bool:
        """Set margin mode (isolated or cross)."""
        if not self._exchange:
            return False
        try:
            await self._exchange.set_margin_mode(mode, symbol)
            logger.info("[RealAccount] Set %s margin mode to %s", symbol, mode)
            return True
        except (OSError, RuntimeError, ValueError) as e:
            logger.error("[RealAccount] Failed to set margin mode: %s", e)
            return False

    async def place_order(
        self, symbol: str, side: str, quantity: float,
        order_type: str = "market", price: float | None = None,
        leverage: int = 1, stop_loss: float | None = None,
        take_profit: float | None = None,
        max_retries: int = 3,
    ) -> dict | None:
        """Place an order on the exchange with retry on transient errors."""
        if not self._exchange:
            return None
        if quantity <= 0:
            logger.error("[RealAccount] Invalid quantity: %s", quantity)
            return None

        if self._leverage_cache.get(symbol) != leverage:
            await self.set_leverage(symbol, leverage)
            self._leverage_cache[symbol] = leverage
        params = {}
        if stop_loss:
            params["stopLossPrice"] = stop_loss
        if take_profit:
            params["takeProfitPrice"] = take_profit

        for attempt in range(max_retries):
            try:
                order = await self._exchange.create_order(
                    symbol=symbol,
                    type=order_type,
                    side=side,
                    amount=quantity,
                    price=price,
                    params=params,
                )
                logger.info("[RealAccount] Order placed: %s %s %s @ %s", side, quantity, symbol, order_type)
                return {
                    "order_id": str(order.get("id", "")),
                    "symbol": symbol,
                    "side": side,
                    "type": order_type,
                    "quantity": quantity,
                    "price": price or 0,
                    "status": order.get("status", ""),
                }
            except (OSError, RuntimeError, KeyError, ValueError) as e:
                if attempt < max_retries - 1:
                    delay = 0.5 * (2 ** attempt)  # 0.5s, 1s, 2s
                    logger.warning(
                        "[RealAccount] Order attempt %d/%d failed: %s — retrying in %ss", attempt+1, max_retries, e, delay
                    )
                    await asyncio.sleep(delay)
                else:
                    logger.error("[RealAccount] Failed to place order after %s attempts: %s", max_retries, e)
                    return None

    async def cancel_order(self, order_id: str, symbol: str) -> bool:
        """Cancel an open order."""
        if not self._exchange:
            return False
        try:
            await self._exchange.cancel_order(order_id, symbol)
            logger.info("[RealAccount] Order %s cancelled", order_id)
            return True
        except (OSError, RuntimeError, ValueError) as e:
            logger.error("[RealAccount] Failed to cancel order: %s", e)
            return False

    async def cancel_all_orders(self, symbol: str | None = None) -> int:
        """Cancel all open orders."""
        if not self._exchange:
            return 0
        try:
            result = await self._exchange.cancel_all_orders(symbol)
            count = len(result) if isinstance(result, list) else 0
            logger.info("[RealAccount] Cancelled %s orders", count)
            return count
        except (OSError, RuntimeError, ValueError) as e:
            logger.error("[RealAccount] Failed to cancel all orders: %s", e)
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
            except (OSError, RuntimeError, KeyError, ValueError) as e:
                logger.error("[RealAccount] User data stream error: %s", e)
                await asyncio.sleep(5)

    async def get_health(self) -> dict:
        """Check exchange account connectivity."""
        if not self._exchange:
            return {"connected": False, "reason": "Not initialized"}
        try:
            await self._exchange.fetch_balance()
            return {"connected": True, "exchange": self.exchange_name, "testnet": self.testnet}
        except (OSError, RuntimeError, KeyError, ValueError) as e:
            return {"connected": False, "error": str(e)}
