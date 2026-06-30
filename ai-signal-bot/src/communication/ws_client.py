"""WebSocket client — connects to the exchange simulator and receives market data.

Also sends trading signals to the HFT Trade Bot via a separate WebSocket connection.
"""
import asyncio
import json
import logging
from typing import Callable, Optional

import websockets

logger = logging.getLogger("ai_signal_bot.ws_client")


class ExchangeClient:
    """WebSocket client for the exchange simulator.

    Receives candle data and order book snapshots.
    Sends orders when paper trading is disabled.
    """

    def __init__(self, url: str = "ws://localhost:8765"):
        self.url = url
        self._ws: Optional[websockets.WebSocketClientProtocol] = None
        self._connected = False
        self._on_message: Optional[Callable] = None
        self._latest_candles: dict[str, dict] = {}  # {symbol: candle_dict}
        self._latest_prices: dict[str, dict[str, float]] = {}  # {exchange: {symbol: price}}
        self._accounts: dict[str, dict] = {}

    @property
    def connected(self) -> bool:
        return self._connected

    @property
    def latest_candles(self) -> dict[str, dict]:
        return self._latest_candles

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
            await self._ws.send(json.dumps({"type": "subscribe"}))
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
                    data = json.loads(message)
                    self._process_message(data)
                    if self._on_message:
                        await self._on_message(data)
                except json.JSONDecodeError:
                    logger.warning(f"Invalid JSON: {message}")
        except websockets.ConnectionClosed:
            logger.warning("Connection closed by server")
            self._connected = False

    def _process_message(self, data: dict) -> None:
        """Process incoming market data."""
        msg_type = data.get("type")

        if msg_type in ("candles", "snapshot"):
            for candle in data.get("candles", []):
                self._latest_candles[candle["symbol"]] = candle
            self._latest_prices = data.get("prices", {})
            self._accounts = data.get("accounts", {})

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
        await self._ws.send(json.dumps(order_msg))
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
        await self._ws.send(json.dumps(msg))
        logger.info(f"Close position request: {symbol} on {exchange}")

    async def reconnect(self) -> bool:
        """Attempt to reconnect."""
        await self.disconnect()
        await asyncio.sleep(2)
        return await self.connect()
