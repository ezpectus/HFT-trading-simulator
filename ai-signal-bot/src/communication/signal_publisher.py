"""Signal publisher — WebSocket server that broadcasts AI signals to HFT Trade Bot.

Runs on port 8766. The HFT Trade Bot connects as a client and receives
validated trading signals in real-time. Also supports backtest execution
requests from the Web UI.

Protocol:
  → {"type": "signal", "symbol": "BTC/USDT", "direction": "LONG", ...}
  → {"type": "signal_history", "signals": [...]}
  → {"type": "backtest_result", "results": {...}}
  ← {"type": "subscribe", "client": "hft_trade_bot"}
  ← {"type": "run_backtest", "strategy": "trend", "candles": 500, ...}
"""
import asyncio
import json
import logging
import math
import random
import time
from typing import Optional

import websockets

logger = logging.getLogger("ai_signal_bot.signal_publisher")


class SignalPublisher:
    """WebSocket server broadcasting AI signals to connected HFT clients."""

    def __init__(self, host: str = "0.0.0.0", port: int = 8766):
        self.host = host
        self.port = port
        self._clients: set = set()
        self._signal_history: list[dict] = []
        self._max_history = 100
        self._server: Optional[websockets.WebSocketServer] = None
        self._running = False

    @property
    def client_count(self) -> int:
        return len(self._clients)

    @property
    def signals_sent(self) -> int:
        return len(self._signal_history)

    async def start(self) -> None:
        """Start the WebSocket server."""
        self._server = await websockets.serve(
            self._handle_client,
            self.host,
            self.port,
            ping_interval=10,
            ping_timeout=30,
        )
        self._running = True
        logger.info(f"Signal publisher started on ws://{self.host}:{self.port}")

    async def stop(self) -> None:
        """Stop the server."""
        self._running = False
        if self._server:
            self._server.close()
            await self._server.wait_closed()
        logger.info("Signal publisher stopped")

    async def _handle_client(self, websocket, path=None) -> None:
        """Handle a connected HFT client."""
        self._clients.add(websocket)
        remote = websocket.remote_address if hasattr(websocket, "remote_address") else "unknown"
        logger.info(f"HFT client connected: {remote} (total: {len(self._clients)})")

        # Send signal history on connect
        if self._signal_history:
            try:
                await websocket.send(json.dumps({
                    "type": "signal_history",
                    "signals": self._signal_history[-20:],
                    "count": len(self._signal_history),
                }))
            except Exception:
                pass

        try:
            async for message in websocket:
                try:
                    data = json.loads(message)
                    msg_type = data.get("type")
                    if msg_type == "subscribe":
                        logger.info(f"Client subscribed: {data.get('client', 'unknown')}")
                    elif msg_type == "run_backtest":
                        result = await self._run_backtest(data)
                        await websocket.send(json.dumps(result))
                except json.JSONDecodeError:
                    pass
        except websockets.ConnectionClosed:
            pass
        finally:
            self._clients.discard(websocket)
            logger.info(f"HFT client disconnected (total: {len(self._clients)})")

    async def broadcast_signal(self, signal: dict) -> None:
        """Broadcast a trading signal to all connected HFT clients.

        Args:
            signal: Signal dict with keys:
                - symbol, direction, confidence, strategy
                - entry_price, stop_loss, take_profit
                - reason, timestamp
        """
        signal["timestamp"] = int(time.time())
        self._signal_history.append(signal)
        if len(self._signal_history) > self._max_history:
            self._signal_history = self._signal_history[-self._max_history:]

        if not self._clients:
            return

        msg = json.dumps({"type": "signal", **signal})
        disconnected = set()
        for ws in self._clients:
            try:
                await ws.send(msg)
            except Exception:
                disconnected.add(ws)

        self._clients -= disconnected
        logger.info(
            f"Signal broadcast: {signal.get('direction', '?')} "
            f"{signal.get('symbol', '?')} "
            f"conf={signal.get('confidence', 0):.0f} "
            f"→ {len(self._clients)} clients"
        )

    async def broadcast_market_regime(self, symbol: str, regime: str, 
                                       trend_score: float, cycle_strength: float) -> None:
        """Broadcast market regime update (from FFT analysis)."""
        if not self._clients:
            return

        msg = json.dumps({
            "type": "market_regime",
            "symbol": symbol,
            "regime": regime,
            "trend_score": round(trend_score, 3),
            "cycle_strength": round(cycle_strength, 3),
            "timestamp": int(time.time()),
        })

        disconnected = set()
        for ws in self._clients:
            try:
                await ws.send(msg)
            except Exception:
                disconnected.add(ws)
        self._clients -= disconnected

    async def _run_backtest(self, params: dict) -> dict:
        """Run a backtest and return results as JSON.

        Args:
            params: Dict with keys:
                - strategy: "trend" | "mean_reversion" | "fft" | "ensemble" | "all"
                - candles: number of synthetic candles (default 500)
                - balance: initial balance (default 10000)
                - symbol: trading symbol (default "BTC/USDT")
                - initial_price: starting price (default 65000)
                - volatility: price volatility (default 0.75)
                - trailing_stop: bool
                - breakeven: bool

        Returns:
            Dict with type "backtest_result" and results data.
        """
        import sys
        import os

        sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

        from src.backtesting import Backtester
        from src.strategies import (
            EnsembleVoter, FFTCycleStrategy, MeanReversionStrategy,
            TrendFollowingStrategy,
        )
        from src.risk.risk_manager import RiskConfig

        n_candles = params.get("candles", 500)
        balance = params.get("balance", 10000)
        symbol = params.get("symbol", "BTC/USDT")
        initial_price = params.get("initial_price", 65000)
        volatility = params.get("volatility", 0.75)
        strategy_name = params.get("strategy", "all")
        use_trailing = params.get("trailing_stop", False)
        use_breakeven = params.get("breakeven", False)

        # Generate synthetic candles
        rng = random.Random(42)
        candles = []
        price = initial_price
        tf = 300
        base_ts = 1704067200
        candles_per_year = 365 * 24 * 3600 / tf
        sigma = volatility / math.sqrt(candles_per_year)
        drift = 0.0001

        for i in range(n_candles):
            z = rng.gauss(0, 1)
            ret = drift + sigma * z
            new_price = price * math.exp(ret)
            open_p = price
            close_p = new_price
            wick = abs(close_p - open_p) * (0.5 + rng.random() * 0.5)
            high_p = max(open_p, close_p) + wick * rng.random()
            low_p = min(open_p, close_p) - wick * rng.random()
            volume = rng.uniform(50, 2000) * (1 + abs(ret) * 100)
            candles.append({
                "timestamp": base_ts + i * tf,
                "open": round(open_p, 2),
                "high": round(high_p, 2),
                "low": round(low_p, 2),
                "close": round(close_p, 2),
                "volume": round(volume, 2),
            })
            price = new_price

        # Build risk config
        risk_config = None
        if use_trailing or use_breakeven:
            risk_config = RiskConfig(
                trailing_stop_enabled=use_trailing,
                trailing_distance_pct=2.0,
                breakeven_enabled=use_breakeven,
                breakeven_trigger_pct=1.0,
            )

        bt = Backtester(
            initial_balance=balance,
            fee_pct=0.075,
            slippage_bps=2.0,
            risk_config=risk_config,
        )

        # Strategy selection
        strategies = {}
        if strategy_name in ("trend", "all", "ensemble"):
            strategies["Trend Following"] = TrendFollowingStrategy(ema_fast=9, ema_slow=21, adx_threshold=25)
        if strategy_name in ("mean_reversion", "all", "ensemble"):
            strategies["Mean Reversion"] = MeanReversionStrategy(rsi_oversold=30, rsi_overbought=70, bb_period=20, bb_std=2.0)
        if strategy_name in ("fft", "all", "ensemble"):
            strategies["FFT Cycle"] = FFTCycleStrategy(min_data=64)
        if strategy_name in ("ensemble", "all"):
            sub_strategies = [s for n, s in strategies.items() if n != "Ensemble"]
            strategies["Ensemble"] = EnsembleVoter(
                strategies=sub_strategies,
                voting_mode="confidence_weighted",
            )

        if not strategies:
            return {"type": "backtest_result", "error": f"Unknown strategy: {strategy_name}"}

        results = {}
        for name, strat in strategies.items():
            result = bt.run(candles, strat, symbol=symbol, warmup=50)
            results[name] = {
                "total_return_pct": round(result.total_return_pct, 2),
                "total_trades": result.total_trades,
                "winning_trades": result.winning_trades,
                "losing_trades": result.losing_trades,
                "win_rate": round(result.win_rate, 2),
                "avg_win": round(result.avg_win, 2),
                "avg_loss": round(result.avg_loss, 2),
                "profit_factor": round(result.profit_factor, 2) if result.profit_factor != float('inf') else 999.99,
                "max_drawdown_pct": round(result.max_drawdown_pct, 2),
                "sharpe_ratio": round(result.sharpe_ratio, 2),
                "final_balance": round(result.final_balance, 2),
                "equity_curve": result.equity_curve,
                "signals_generated": result.signals_generated,
                "signals_valid": result.signals_valid,
            }

        logger.info(f"Backtest completed: {strategy_name}, {n_candles} candles, {len(results)} strategies")

        return {
            "type": "backtest_result",
            "strategy": strategy_name,
            "symbol": symbol,
            "candles": n_candles,
            "results": results,
        }
