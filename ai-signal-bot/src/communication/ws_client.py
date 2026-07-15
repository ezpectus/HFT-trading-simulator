"""WebSocket client — connects to the exchange simulator and receives market data.

Also sends trading signals to the HFT Trade Bot via a separate WebSocket connection.
"""
import asyncio
import json
import logging
from typing import Callable, Optional

import websockets

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

logger = logging.getLogger("ai_signal_bot.ws_client")


class ExchangeClient:
    """WebSocket client for the exchange simulator.

    Receives candle data and order book snapshots.
    Sends orders when paper trading is disabled.
    """

    def __init__(self, url: str = "ws://localhost:8765", encoding: str = "json"):
        self.url = url
        self._encoding = encoding if (encoding == "msgpack" and _HAS_MSGPACK) else "json"
        self._ws: Optional[websockets.WebSocketClientProtocol] = None
        self._connected = False
        self._trading_active = True
        self._on_message: Optional[Callable] = None
        self._latest_candles: dict[str, dict] = {}  # {symbol: latest_candle_dict}
        self._candle_history: dict[str, list[dict]] = {}  # {symbol: [candle_dicts]}
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
    def candle_history(self) -> dict[str, list[dict]]:
        return self._candle_history

    @property
    def latest_prices(self) -> dict[str, dict[str, float]]:
        return self._latest_prices

    @property
    def accounts(self) -> dict[str, dict]:
        return self._accounts

    def set_message_handler(self, handler: Callable) -> None:
        self._on_message = handler

    async def connect(self) -> bool:
        """Connect to the exchange simulator WebSocket."""
        try:
            self._ws = await websockets.connect(self.url, ping_interval=10)
            self._connected = True
            logger.info(f"Connected to exchange simulator: {self.url}")
            await self._ws.send(json.dumps({"type": "subscribe", "protocol_version": 2, "encoding": self._encoding}, separators=(',', ':')))
            return True
        except Exception as e:
            logger.error(f"Failed to connect: {e}")
            self._connected = False
            return False

    async def disconnect(self) -> None:
        if self._ws:
            await self._ws.close()
            self._ws = None
        self._connected = False
        logger.info("Disconnected from exchange simulator")

    async def listen(self) -> None:
        """Listen for incoming messages from the exchange simulator."""
        if not self._ws:
            logger.error("Not connected")
            return

        try:
            async for message in self._ws:
                try:
                    if isinstance(message, bytes) and _HAS_MSGPACK:
                        data = msgpack.unpackb(message, raw=False)
                    else:
                        data = json.loads(message)
                    self._process_message(data)
                    if self._on_message:
                        await self._on_message(data)
                except (json.JSONDecodeError, ValueError) as e:
                    logger.warning(f"Invalid message: {e}")
        except websockets.ConnectionClosed:
            logger.warning("Connection closed by server")
            self._connected = False

    def _process_message(self, data: dict) -> None:
        """Process incoming market data."""
        msg_type = data.get("type")

        if msg_type in ("candles", "snapshot"):
            for candle in data.get("candles", []):
                sym = candle["symbol"]
                self._latest_candles[sym] = candle
                # Accumulate candle history (BUG#3: previously only latest candle was kept)
                if sym not in self._candle_history:
                    self._candle_history[sym] = []
                self._candle_history[sym].append(candle)
                if len(self._candle_history[sym]) > 200:
                    self._candle_history[sym] = self._candle_history[sym][-200:]
            self._latest_prices = data.get("prices", {})
            self._accounts = data.get("accounts", {})
            if "trading_active" in data:
                self._trading_active = data["trading_active"]
        elif msg_type == "trading_state":
            self._trading_active = data.get("trading_active", True)
            state = "ACTIVE" if self._trading_active else "STOPPED"
            logger.info(f"Trading state: {state}")
        elif msg_type == "error":
            logger.warning(f"Exchange error: {data.get('message', 'unknown')}")
        elif msg_type == "welcome":
            ver = data.get("protocol_version", 1)
            self._trading_active = data.get("trading_active", True)
            logger.info(f"Server welcome: protocol v{ver}, trading={'ACTIVE' if self._trading_active else 'STOPPED'}")

    async def submit_order(
        self,
        symbol: str,
        side: str,
        quantity: float,
        exchange: str = "binance",
        stop_loss: Optional[float] = None,
        take_profit: Optional[float] = None,
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
        }
        if _HAS_ORJSON:
            await self._ws.send(orjson.dumps(order_msg))
        else:
            await self._ws.send(json.dumps(order_msg, separators=(',', ':')))
        logger.info(f"Order sent: {side} {quantity} {symbol} on {exchange}")

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
        logger.info(f"Close position request: {symbol} on {exchange}")

    async def reconnect(self) -> bool:
        """Attempt to reconnect."""
        await self.disconnect()
        await asyncio.sleep(2)
        return await self.connect()
