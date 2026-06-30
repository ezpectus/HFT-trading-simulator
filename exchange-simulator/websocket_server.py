"""WebSocket server — streams simulated market data to connected bots.

Broadcasts candle updates, order book snapshots, and account status
to all connected WebSocket clients (AI Signal Bot, HFT Trade Bot).
"""
import asyncio
import json
import logging
from typing import Set

import websockets

from exchange_simulator.exchange import SimulatedExchange
from exchange_simulator.market_simulator import MarketSimulator
from exchange_simulator.arbitrage import ArbitrageDetector

logger = logging.getLogger("exchange_simulator.ws")


class ExchangeWebSocketServer:
    """WebSocket server that streams simulated market data.

    Message types:
    - "candles":  Latest OHLCV candles for all symbols
    - "orderbook": Order book snapshot
    - "account":  Account status (positions, balance)
    - "fill":     Order fill notification
    """

    def __init__(
        self,
        exchanges: dict[str, SimulatedExchange],
        market: MarketSimulator,
        host: str = "localhost",
        port: int = 8765,
        arb_detector: ArbitrageDetector = None,
    ):
        self.exchanges = exchanges
        self.market = market
        self.host = host
        self.port = port
        self.arb_detector = arb_detector
        self.clients: Set[websockets.WebSocketServerProtocol] = set()
        self._running = False
        self._tick_interval = 1.0  # seconds between candles (adjustable via set_speed)
        self._replay_paused = False
        self._replay_offset = 0

    async def start(self) -> None:
        """Start the WebSocket server."""
        self._running = True
        logger.info(f"WebSocket server starting on {self.host}:{self.port}")

        # Start Prometheus metrics HTTP server on port+1
        metrics_port = self.port + 1
        metrics_task = asyncio.create_task(self._run_metrics_server(metrics_port))

        async with websockets.serve(
            self._handle_client, self.host, self.port,
            ping_interval=10,
            compression="deflate",
            max_size=2**20,  # 1MB max message
        ):
            # Start market data broadcast loop
            broadcast_task = asyncio.create_task(self._broadcast_loop())
            await asyncio.Future()  # Run forever
            broadcast_task.cancel()
            metrics_task.cancel()

    async def _run_metrics_server(self, port: int) -> None:
        """Run a simple HTTP server for Prometheus metrics scraping."""
        from aiohttp import web

        async def metrics_handler(request):
            return web.Response(
                text=self._get_prometheus_metrics(),
                content_type="text/plain; version=0.0.4",
            )

        app = web.Application()
        app.router.add_get("/metrics", metrics_handler)
        runner = web.AppRunner(app)
        await runner.setup()
        site = web.TCPSite(runner, self.host, port)
        await site.start()
        logger.info(f"Prometheus metrics endpoint on http://{self.host}:{port}/metrics")
        await asyncio.Future()  # Run forever

    async def stop(self) -> None:
        self._running = False
        for client in self.clients:
            await client.close()
        logger.info("WebSocket server stopped")

    async def _handle_client(
        self, websocket: websockets.WebSocketServerProtocol
    ) -> None:
        """Handle a connected client — receive orders, send market data."""
        self.clients.add(websocket)
        remote = websocket.remote_address
        logger.info(f"Client connected: {remote}")

        try:
            # Send initial snapshot
            await self._send_market_snapshot(websocket)

            # Listen for incoming messages (orders from bots)
            async for message in websocket:
                try:
                    data = json.loads(message)
                    await self._handle_message(websocket, data)
                except json.JSONDecodeError:
                    logger.warning(f"Invalid JSON from {remote}: {message}")
                except Exception as e:
                    logger.error(f"Error handling message: {e}")

        except websockets.ConnectionClosed:
            pass
        finally:
            self.clients.discard(websocket)
            logger.info(f"Client disconnected: {remote}")

    async def _handle_message(
        self, websocket: websockets.WebSocketServerProtocol, data: dict
    ) -> None:
        """Handle incoming message from a bot."""
        msg_type = data.get("type")

        if msg_type == "order":
            # Bot wants to submit an order
            exchange_id = data.get("exchange", "binance")
            exchange = self.exchanges.get(exchange_id)
            if not exchange:
                await websocket.send(json.dumps({
                    "type": "error",
                    "message": f"Unknown exchange: {exchange_id}",
                }))
                return

            from exchange_simulator.models import OrderType, Side

            order = exchange.submit_order(
                symbol=data["symbol"],
                side=Side(data["side"]),
                quantity=float(data["quantity"]),
                order_type=OrderType(data.get("order_type", "MARKET")),
                price=data.get("price"),
                stop_loss=data.get("stop_loss"),
                take_profit=data.get("take_profit"),
            )

            # Log bot trades to CLI
            if order.status.value == "FILLED":
                logger.info(
                    f"  ORDER FILLED: {data['side']} {float(data['quantity']):.4f} "
                    f"{data['symbol']} @ {order.filled_price:.2f} "
                    f"fee={order.fee:.4f} | {exchange_id}"
                )
            elif order.status.value == "REJECTED":
                reason = order.rejection_reason or "UNKNOWN"
                logger.info(
                    f"  ORDER REJECTED: {data['side']} {data['symbol']} "
                    f"qty={data['quantity']} | {exchange_id} | {reason}"
                )

            # Send fill notification back
            fill_msg = json.dumps({
                "type": "fill",
                "order": order.to_dict(),
            })
            await websocket.send(fill_msg)
            # Broadcast fill to ALL clients so Web UI sees bot trades
            disconnected = set()
            for client in self.clients:
                if client != websocket:
                    try:
                        await client.send(fill_msg)
                    except websockets.ConnectionClosed:
                        disconnected.add(client)
            self.clients -= disconnected

        elif msg_type == "subscribe":
            # Client subscribes — send snapshot
            await self._send_market_snapshot(websocket)

        elif msg_type == "ping":
            await websocket.send(json.dumps({"type": "pong"}))

        elif msg_type == "sync_state":
            # Client requests historical state after reconnection
            last_ts = data.get("last_timestamp", 0)
            await self._send_sync_state(websocket, last_ts)

        elif msg_type == "set_speed":
            speed = data.get("speed", 1)
            self._tick_interval = {0: 999999, 1: 1.0, 2: 0.5, 5: 0.2}.get(speed, 1.0)
            logger.info(f"  Simulation speed set to {speed}x (interval={self._tick_interval}s)")
            await websocket.send(json.dumps({"type": "speed_set", "speed": speed}))

        elif msg_type == "replay":
            action = data.get("action", "toggle")
            if action == "pause":
                self._replay_paused = True
                logger.info("  Simulation PAUSED (replay mode)")
                await websocket.send(json.dumps({"type": "replay_state", "paused": True}))
            elif action == "resume":
                self._replay_paused = False
                self._replay_offset = 0
                logger.info("  Simulation RESUMED")
                await websocket.send(json.dumps({"type": "replay_state", "paused": False}))
            elif action == "scrub":
                offset = data.get("offset", 0)
                self._replay_offset = offset
                # Send historical candles at this offset
                candles = self.market.get_replay_candles(offset)
                await websocket.send(json.dumps({
                    "type": "replay_candles",
                    "candles": [c.to_dict() for c in candles],
                    "offset": offset,
                    "timestamp": self.market.current_timestamp,
                }))

        elif msg_type == "close_position":
            exchange_id = data.get("exchange", "binance")
            exchange = self.exchanges.get(exchange_id)
            if exchange:
                symbol = data["symbol"]
                for pos in exchange.account.positions:
                    if pos.symbol == symbol:
                        close_side = Side.SELL if pos.is_long else Side.BUY
                        exchange.submit_order(
                            symbol=symbol,
                            side=close_side,
                            quantity=pos.quantity,
                        )
                        break

        elif msg_type == "update_config":
            # Hot-reload config: volatility, fees, slippage
            updates = data.get("updates", {})
            if "volatility" in updates:
                for symbol, vol in updates["volatility"].items():
                    if symbol in self.market._volatility:
                        old = self.market._volatility[symbol]
                        self.market._volatility[symbol] = vol
                        logger.info(f"  Config hot-reload: {symbol} volatility {old} → {vol}")
            if "fees" in updates:
                for ex_id, fee in updates["fees"].items():
                    if ex_id in self.exchanges:
                        old = self.exchanges[ex_id].fee_pct
                        self.exchanges[ex_id].fee_pct = fee
                        logger.info(f"  Config hot-reload: {ex_id} fee {old}% → {fee}%")
            if "slippage" in updates:
                for ex_id, slip in updates["slippage"].items():
                    if ex_id in self.exchanges:
                        old = self.exchanges[ex_id].slippage_bps
                        self.exchanges[ex_id].slippage_bps = slip
                        logger.info(f"  Config hot-reload: {ex_id} slippage {old}bps → {slip}bps")
            if "leverage" in updates:
                for ex_id, lev in updates["leverage"].items():
                    if ex_id in self.exchanges:
                        self.exchanges[ex_id].account.leverage = lev
                        logger.info(f"  Config hot-reload: {ex_id} leverage → {lev}x")
            await websocket.send(json.dumps({"type": "config_updated", "updates": updates}))

    async def _send_market_snapshot(
        self, websocket: websockets.WebSocketServerProtocol
    ) -> None:
        """Send current market state to a client."""
        candles = self.market.get_latest_candles()

        # Build order book snapshots for all exchange+symbol pairs
        orderbooks = {}
        for ex_id in self.exchanges:
            for symbol in self.market.symbols:
                ob = self.market.generate_order_book(ex_id, symbol)
                orderbooks[f"{ex_id}|{symbol}"] = {
                    "exchange": ex_id,
                    "symbol": symbol,
                    "bids": [{"price": l.price, "quantity": l.quantity} for l in ob.bids],
                    "asks": [{"price": l.price, "quantity": l.quantity} for l in ob.asks],
                }

        message = {
            "type": "snapshot",
            "timestamp": self.market.current_timestamp,
            "candles": [c.to_dict() for c in candles],
            "prices": self.market.get_all_prices(),
            "orderbooks": orderbooks,
            "accounts": {
                ex_id: ex.get_account_status()
                for ex_id, ex in self.exchanges.items()
            },
        }
        await websocket.send(json.dumps(message))

    async def _send_sync_state(
        self, websocket: websockets.WebSocketServerProtocol, last_ts: int
    ) -> None:
        """Send historical candles since last_ts for reconnection sync."""
        all_candles = []
        for ex_id in self.exchanges:
            for symbol in self.market.symbols:
                history = self.market.get_history(ex_id, symbol, 200)
                for c in history:
                    if c.timestamp > last_ts:
                        all_candles.append(c.to_dict())

        # Build current state
        orderbooks = {}
        for ex_id in self.exchanges:
            for symbol in self.market.symbols:
                ob = self.market.generate_order_book(ex_id, symbol)
                orderbooks[f"{ex_id}|{symbol}"] = {
                    "exchange": ex_id,
                    "symbol": symbol,
                    "bids": [{"price": l.price, "quantity": l.quantity} for l in ob.bids],
                    "asks": [{"price": l.price, "quantity": l.quantity} for l in ob.asks],
                }

        message = {
            "type": "sync_state",
            "timestamp": self.market.current_timestamp,
            "candles": all_candles,
            "prices": self.market.get_all_prices(),
            "orderbooks": orderbooks,
            "accounts": {
                ex_id: ex.get_account_status()
                for ex_id, ex in self.exchanges.items()
            },
            "funding_rates": self.market.get_funding_rates(),
            "candles_to_funding": self.market.candles_to_next_funding,
            "news_event": self.market.get_news_event(),
            "weekend_mode": self.market.is_weekend_mode,
            "missed_candles": len(all_candles),
        }
        await websocket.send(json.dumps(message))
        logger.info(f"  Sync state sent: {len(all_candles)} candles since ts={last_ts}")

    async def _broadcast_loop(self) -> None:
        """Continuously generate new candles and broadcast to all clients."""
        while self._running:
            await asyncio.sleep(self._tick_interval)

            if not self.clients:
                continue

            # Skip candle generation when paused (replay mode)
            if self._replay_paused:
                continue

            # Generate next candle
            candles = self.market.next_candle()
            self.market.auto_check_weekend()

            # Check SL/TP for all exchanges
            for ex_id, exchange in self.exchanges.items():
                closed_orders = exchange.check_stop_loss_take_profit()
                exchange.update_positions_pnl()

                # Charge funding when funding rates update
                funding_rates = self.market.get_funding_rates()
                if self.market.candles_to_next_funding == self.market._funding_interval:
                    # Funding just updated — charge all positions
                    rate = funding_rates.get(ex_id, 0)
                    if rate != 0:
                        notifications = exchange.charge_funding(rate)
                        for note in notifications:
                            logger.info(f"  FUNDING: {ex_id} rate={rate:.6f} | {note}")

                # Broadcast SL/TP/Liquidation fills to all clients
                for order in closed_orders:
                    if order.status.value == "FILLED":
                        reason = ""
                        if exchange.account.trade_history:
                            reason = exchange.account.trade_history[-1].reason
                        logger.info(
                            f"  {reason or 'SL/TP'} CLOSED: {order.symbol} @ {order.filled_price:.2f} "
                            f"qty={order.filled_quantity:.4f} | {ex_id}"
                        )
                        fill_msg = json.dumps({
                            "type": "fill",
                            "order": order.to_dict(),
                        })
                        disconnected = set()
                        for client in self.clients:
                            try:
                                await client.send(fill_msg)
                            except websockets.ConnectionClosed:
                                disconnected.add(client)
                        self.clients -= disconnected

            # Scan for arbitrage opportunities
            arb_data = None
            if self.arb_detector:
                new_arbs = self.arb_detector.scan()
                if new_arbs:
                    arb_data = json.dumps(self.arb_detector.to_dict())

                    # Auto-execute arbitrage if spread > threshold
                    for opp in new_arbs:
                        if opp.spread_bps > 20.0 and opp.max_quantity > 0.01:
                            # Execute: buy on buy_exchange, sell on sell_exchange
                            buy_ex = self.exchanges.get(opp.buy_exchange)
                            sell_ex = self.exchanges.get(opp.sell_exchange)
                            if buy_ex and sell_ex:
                                exec_qty = min(opp.max_quantity, 1.0)
                                buy_order = buy_ex.submit_order(
                                    symbol=opp.symbol, side=Side.BUY,
                                    quantity=exec_qty, order_type=OrderType.MARKET,
                                )
                                sell_order = sell_ex.submit_order(
                                    symbol=opp.symbol, side=Side.SELL,
                                    quantity=exec_qty, order_type=OrderType.MARKET,
                                )
                                self.arb_detector.close_opportunity(
                                    opp.symbol, opp.buy_exchange, opp.sell_exchange, "AUTO_EXECUTED"
                                )
                                logger.info(
                                    f"  ARB AUTO-EXEC: {opp.symbol} "
                                    f"buy={opp.buy_exchange}@{opp.buy_price:.2f} "
                                    f"sell={opp.sell_exchange}@{opp.sell_price:.2f} "
                                    f"qty={exec_qty:.4f} profit~${opp.net_spread * exec_qty:.2f}"
                                )

            # Build order book snapshots
            orderbooks = {}
            for ex_id in self.exchanges:
                for symbol in self.market.symbols:
                    ob = self.market.generate_order_book(ex_id, symbol)
                    orderbooks[f"{ex_id}|{symbol}"] = {
                        "exchange": ex_id,
                        "symbol": symbol,
                        "bids": [{"price": l.price, "quantity": l.quantity} for l in ob.bids[:10]],
                        "asks": [{"price": l.price, "quantity": l.quantity} for l in ob.asks[:10]],
                    }

            # Broadcast to all connected clients
            message = {
                "type": "candles",
                "timestamp": self.market.current_timestamp,
                "candles": [c.to_dict() for c in candles],
                "prices": self.market.get_all_prices(),
                "orderbooks": orderbooks,
                "accounts": {
                    ex_id: ex.get_account_status()
                    for ex_id, ex in self.exchanges.items()
                },
                "funding_rates": self.market.get_funding_rates(),
                "candles_to_funding": self.market.candles_to_next_funding,
                "news_event": self.market.get_news_event(),
                "weekend_mode": self.market.is_weekend_mode,
            }
            data = json.dumps(message)

            # Send to all clients
            disconnected = set()
            for client in self.clients:
                try:
                    await client.send(data)
                    if arb_data:
                        await client.send(arb_data)
                except websockets.ConnectionClosed:
                    disconnected.add(client)

            self.clients -= disconnected

    def _get_prometheus_metrics(self) -> str:
        """Generate Prometheus-format metrics string."""
        lines = []
        lines.append("# HELP exchange_connected_clients Number of connected WebSocket clients")
        lines.append("# TYPE exchange_connected_clients gauge")
        lines.append(f"exchange_connected_clients {len(self.clients)}")

        lines.append("# HELP exchange_candle_count Total candles generated")
        lines.append("# TYPE exchange_candle_count counter")
        lines.append(f"exchange_candle_count {self.market._candle_count}")

        lines.append("# HELP exchange_weekend_mode Weekend mode active (1=yes, 0=no)")
        lines.append("# TYPE exchange_weekend_mode gauge")
        lines.append(f"exchange_weekend_mode {1 if self.market.is_weekend_mode else 0}")

        lines.append("# HELP exchange_news_event_active News event active (1=yes, 0=no)")
        lines.append("# TYPE exchange_news_event_active gauge")
        lines.append(f"exchange_news_event_active {1 if self.market.get_news_event() else 0}")

        for ex_id, ex in self.exchanges.items():
            acc = ex.account
            labels = f'exchange="{ex_id}"'
            lines.append(f'exchange_balance{{{labels}}} {acc.balance:.2f}')
            lines.append(f'exchange_equity{{{labels}}} {acc.equity:.2f}')
            lines.append(f'exchange_total_pnl{{{labels}}} {acc.total_pnl:.2f}')
            lines.append(f'exchange_total_trades{{{labels}}} {acc.total_trades}')
            lines.append(f'exchange_winning_trades{{{labels}}} {acc.winning_trades}')
            lines.append(f'exchange_open_positions{{{labels}}} {len(acc.positions)}')
            lines.append(f'exchange_total_fees{{{labels}}} {acc.total_fees:.4f}')
            lines.append(f'exchange_leverage{{{labels}}} {acc.leverage}')

            for pos in acc.positions:
                pos_labels = f'exchange="{ex_id}",symbol="{pos.symbol}",side="{pos.side.value}"'
                lines.append(f'exchange_position_unrealized_pnl{{{pos_labels}}} {pos.unrealized_pnl:.2f}')
                lines.append(f'exchange_position_quantity{{{pos_labels}}} {pos.quantity:.4f}')

        for symbol in self.market.symbols:
            price = self.market.get_price(symbol, self.market.exchanges[0])
            lines.append(f'exchange_price{{symbol="{symbol}"}} {price:.2f}')

        lines.append(f'exchange_tick_interval_seconds {self._tick_interval}')

        return "\n".join(lines) + "\n"
