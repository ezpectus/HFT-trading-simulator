"""WebSocket client — connects to the exchange simulator and receives market data.

Also sends trading signals to the HFT Trade Bot via a separate WebSocket connection.
"""
import asyncio
import json
import os
import random
from collections import deque
from collections.abc import Callable

import websockets

from src.observability.logging import get_logger

try:
    import msgpack
    _HAS_MSGPACK = True
except ImportError:
    _HAS_MSGPACK = False

try:
    import orjson
    _HAS_ORJSON = True
except ImportError:
    _HAS_ORJSON = False

logger = get_logger("ai_signal_bot.ws_client")


class ExchangeClient:
    """WebSocket client for the exchange simulator.

    Receives candle data and order book snapshots.
    Sends orders when paper trading is disabled.
    """

    def __init__(self, url: str | None = None, encoding: str = "json", ssl: bool | object = None):
        self.url = url or os.environ.get("WS_URL", "ws://localhost:8765")
        self._ssl = ssl
        self._encoding = encoding if (encoding == "msgpack" and _HAS_MSGPACK) else "json"
        self._ws: websockets.WebSocketClientProtocol | None = None
        self._connected = False
        self._trading_active = True
        self._on_message: Callable | None = None
        self._on_reconnect: Callable | None = None
        self._reconnect_count: int = 0
        self._latest_candles: dict[str, dict] = {}  # {symbol: latest_candle_dict}
        self._candle_history: dict[str, deque] = {}  # {symbol: deque(candle_dicts)}
        self._latest_prices: dict[str, dict[str, float]] = {}  # {exchange: {symbol: price}}
        self._accounts: dict[str, dict] = {}

    @property
    def connected(self) -> bool:
        return self._connected

    @property
    def is_trading_active(self) -> bool:
        return self._trading_active

    @property
    def latest_candles(self) -> dict[str, dict]:
        return self._latest_candles

    @property
    def candle_history(self) -> dict[str, deque]:
        return self._candle_history

    @property
    def latest_prices(self) -> dict[str, dict[str, float]]:
        return self._latest_prices

    @property
    def accounts(self) -> dict[str, dict]:
        return self._accounts

    def set_message_handler(self, handler: Callable) -> None:
        self._on_message = handler

    def set_reconnect_handler(self, handler: Callable) -> None:
        self._on_reconnect = handler

    async def connect(self) -> bool:
        """Connect to the exchange simulator WebSocket with compression and optional TLS."""
        try:
            connect_kwargs = dict(
                ping_interval=10,
                ping_timeout=10,
                compression="deflate",
                max_size=2**20,
            )
            if self._ssl is not None:
                connect_kwargs["ssl"] = self._ssl
            self._ws = await websockets.connect(
                self.url,
                **connect_kwargs,
            )
            self._connected = True
            logger.info("Connected to exchange simulator: %s", self.url)
            await self._ws.send(json.dumps({"type": "subscribe", "protocol_version": 2, "encoding": self._encoding}, separators=(',', ':')))
            return True
        except (OSError, websockets.WebSocketException) as e:
            logger.error("Failed to connect: %s", e)
            self._connected = False
            return False

    async def disconnect(self) -> None:
        if self._ws:
            await self._ws.close()
            self._ws = None
        self._connected = False
        logger.info("Disconnected from exchange simulator")

    async def listen(self) -> None:
        """Listen for incoming messages from the exchange simulator with auto-reconnect."""
        reconnect_delay = 1.0
        max_reconnect_delay = 60.0

        while True:
            if not self._ws or not self._connected:
                jitter = reconnect_delay * (0.75 + random.random() * 0.5)
                logger.info("Reconnecting to exchange simulator (delay=%.1fs)...", jitter)
                await asyncio.sleep(jitter)
                success = await self.connect()
                if not success:
                    reconnect_delay = min(reconnect_delay * 2, max_reconnect_delay)
                    continue
                reconnect_delay = 1.0
                self._reconnect_count += 1
                if self._on_reconnect:
                    try:
                        self._on_reconnect()
                    except (TypeError, RuntimeError) as e:
                        logger.warning("Reconnect handler error: %s", e)

            try:
                async for message in self._ws:
                    try:
                        if isinstance(message, bytes) and _HAS_MSGPACK:
                            data = msgpack.unpackb(message, raw=False)
                        elif _HAS_ORJSON:
                            data = orjson.loads(message)
                        else:
                            data = json.loads(message)
                        self._process_message(data)
                        if self._on_message:
                            await self._on_message(data)
                    except (json.JSONDecodeError, ValueError) as e:
                        logger.warning("Invalid message: %s", e)
            except websockets.ConnectionClosed:
                logger.warning("Connection closed by server")
                self._connected = False
                self._ws = None
                reconnect_delay = min(reconnect_delay * 2, max_reconnect_delay)
            except (OSError, asyncio.TimeoutError) as e:
                logger.warning("Connection error: %s", e)
                self._connected = False
                self._ws = None
                reconnect_delay = min(reconnect_delay * 2, max_reconnect_delay)

    def _process_message(self, data: dict) -> None:
        """Process incoming market data."""
        msg_type = data.get("type")

        if msg_type in ("candles", "snapshot"):
            candles = data.get("candles")
            if candles:
                for candle in candles:
                    sym = candle["symbol"]
                    self._latest_candles[sym] = candle
                    # Accumulate candle history — use deque for O(1) trim
                    hist = self._candle_history.get(sym)
                    if hist is None:
                        hist = deque(maxlen=200)
                        self._candle_history[sym] = hist
                    hist.append(candle)
            self._latest_prices = data.get("prices", {})
            self._accounts = data.get("accounts", {})
            if "trading_active" in data:
                self._trading_active = data["trading_active"]
        elif msg_type == "trading_state":
            self._trading_active = data.get("trading_active", True)
            state = "ACTIVE" if self._trading_active else "STOPPED"
            logger.info("Trading state: %s", state)
        elif msg_type == "error":
            logger.warning("Exchange error: %s", data.get('message', 'unknown'))
        elif msg_type == "welcome":
            ver = data.get("protocol_version", 1)
            self._trading_active = data.get("trading_active", True)
            logger.info("Server welcome: protocol v%s, trading=%s", ver, 'ACTIVE' if self._trading_active else 'STOPPED')

    async def submit_order(
        self,
        symbol: str,
        side: str,
        quantity: float,
        exchange: str = "binance",
        stop_loss: float | None = None,
        take_profit: float | None = None,
        client_order_id: str | None = None,
    ) -> None:
        """Submit an order to the exchange simulator."""
        if not self._ws:
            logger.error("Not connected — cannot submit order")
            return
        if not self._trading_active:
            logger.warning("Trading is stopped — order not submitted")
            return

        order_msg = {
            "type": "order",
            "exchange": exchange,
            "symbol": symbol,
            "side": side,
            "quantity": quantity,
            "order_type": "MARKET",
            "stop_loss": stop_loss,
            "take_profit": take_profit,
            "client_order_id": client_order_id,
        }
        if _HAS_ORJSON:
            await self._ws.send(orjson.dumps(order_msg))
        else:
            await self._ws.send(json.dumps(order_msg, separators=(',', ':')))
        logger.info("Order sent: %s %s %s on %s", side, quantity, symbol, exchange)

    async def close_position(self, symbol: str, exchange: str = "binance") -> None:
        """Close an open position."""
        if not self._ws:
            return
        msg = {
            "type": "close_position",
            "exchange": exchange,
            "symbol": symbol,
        }
        if _HAS_ORJSON:
            await self._ws.send(orjson.dumps(msg))
        else:
            await self._ws.send(json.dumps(msg, separators=(',', ':')))
        logger.info("Close position request: %s on %s", symbol, exchange)

    async def reconnect(self) -> bool:
        """Attempt to reconnect with exponential backoff."""
        await self.disconnect()
        delay = 1.0
        max_delay = 60.0
        for attempt in range(5):
            logger.info("Reconnect attempt %d/5 (delay=%.1fs)", attempt + 1, delay)
            await asyncio.sleep(delay)
            if await self.connect():
                self._reconnect_count += 1
                if self._on_reconnect:
                    try:
                        self._on_reconnect()
                    except (TypeError, RuntimeError) as e:
                        logger.warning("Reconnect handler error: %s", e)
                return True
            delay = min(delay * 2, max_delay)
        logger.error("All reconnection attempts failed")
        return False
