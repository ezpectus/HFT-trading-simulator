"""Signal publisher — WebSocket server that broadcasts AI signals to HFT Trade Bot.

Runs on port 8766. The HFT Trade Bot connects as a client and receives
validated trading signals in real-time. Also supports backtest execution
requests from the Web UI.

Protocol:
  → {"type": "signal", "symbol": "BTC/USDT", "direction": "LONG", ...}
  → {"type": "signal_history", "signals": [...]}
  → {"type": "market_regime", "symbol": ..., "regime": ...}
  → {"type": "circuit_breaker_status", "state": "CLOSED", "consecutive_failures": 0, ...}
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
from collections import deque
from typing import Optional

import websockets

try:
    import orjson
    _HAS_ORJSON = True
except ImportError:
    _HAS_ORJSON = False

from src.communication.circuit_breaker import CircuitBreaker, CircuitBreakerConfig
from src.communication.metrics_server import MetricsCollector

logger = logging.getLogger("ai_signal_bot.signal_publisher")


class SignalPublisher:
    """WebSocket server broadcasting AI signals to connected HFT clients."""

    def __init__(self, host: str = "0.0.0.0", port: int = 8766):
        self.host = host
        self.port = port
        self._clients: set = set()
        self._signal_history: deque = deque(maxlen=100)
        self._max_history = 100
        self._server: Optional[websockets.WebSocketServer] = None
        self._running = False
        self.circuit_breaker = CircuitBreaker()
        self.metrics = MetricsCollector()

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

        asyncio.create_task(self._broadcast_circuit_breaker_status())

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
        self.metrics.set_ws_clients(len(self._clients))
        remote = websocket.remote_address if hasattr(websocket, "remote_address") else "unknown"
        logger.info(f"HFT client connected: {remote} (total: {len(self._clients)})")

        # Send signal history on connect
        if self._signal_history:
            try:
                hist_data = {
                    "type": "signal_history",
                    "signals": list(self._signal_history)[-20:],
                    "count": len(self._signal_history),
                }
                msg = orjson.dumps(hist_data) if _HAS_ORJSON else json.dumps(hist_data, separators=(',', ':'))
                await websocket.send(msg)
            except Exception as e:
                logger.warning(f"Failed to send signal history: {e}")

        # Send current circuit breaker status on connect
        try:
            cb_data = {
                "type": "circuit_breaker_status",
                **self.circuit_breaker.get_status(),
                "timestamp": int(time.time()),
            }
            msg = orjson.dumps(cb_data) if _HAS_ORJSON else json.dumps(cb_data, separators=(',', ':'))
            await websocket.send(msg)
        except Exception as e:
            logger.warning(f"Failed to send circuit breaker status: {e}")

        try:
            async for message in websocket:
                try:
                    data = json.loads(message)
                    msg_type = data.get("type")
                    if msg_type == "subscribe":
                        logger.info(f"Client subscribed: {data.get('client', 'unknown')}")
                    elif msg_type == "run_backtest":
                        result = await self._run_backtest(data)
                        await websocket.send(json.dumps(result, separators=(',', ':')))
                    elif msg_type == "compare_backtests":
                        result = self._compare_backtests(data)
                        await websocket.send(json.dumps(result, separators=(',', ':')))
                except json.JSONDecodeError:
                    logger.warning(f"Invalid JSON from {remote}: {message[:100]}")
        except websockets.ConnectionClosed:
            pass
        finally:
            self._clients.discard(websocket)
            self.metrics.set_ws_clients(len(self._clients))
            logger.info(f"HFT client disconnected (total: {len(self._clients)})")

    async def broadcast_signal(self, signal: dict) -> None:
        """Broadcast a trading signal to all connected HFT clients.

        Args:
            signal: Signal dict with keys:
                - symbol, direction, confidence, strategy
                - entry_price, stop_loss, take_profit
                - reason, timestamp
        """
        if not self.circuit_breaker.allow_signal():
            logger.warning(
                f"Signal blocked by circuit breaker: {signal.get('direction', '?')} "
                f"{signal.get('symbol', '?')} (state={self.circuit_breaker.state.value})"
            )
            self.metrics.record_signal_blocked()
            return

        signal = dict(signal)  # copy to avoid mutating caller's dict
        signal["timestamp"] = int(time.time())
        self._signal_history.append(signal)
        self.metrics.record_signal_sent()

        if not self._clients:
            return

        if _HAS_ORJSON:
            msg = orjson.dumps({"type": "signal", **signal})
        else:
            msg = json.dumps({"type": "signal", **signal}, separators=(',', ':'))
        disconnected = set()
        async def _send(ws):
            try:
                await ws.send(msg)
            except Exception:
                disconnected.add(ws)
        await asyncio.gather(*[_send(ws) for ws in self._clients], return_exceptions=True)

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

        if _HAS_ORJSON:
            msg = orjson.dumps({
                "type": "market_regime",
                "symbol": symbol,
                "regime": regime,
                "trend_score": round(trend_score, 3),
                "cycle_strength": round(cycle_strength, 3),
                "timestamp": int(time.time()),
            })
        else:
            msg = json.dumps({
                "type": "market_regime",
                "symbol": symbol,
                "regime": regime,
                "trend_score": round(trend_score, 3),
                "cycle_strength": round(cycle_strength, 3),
                "timestamp": int(time.time()),
            }, separators=(',', ':'))

        disconnected = set()
        async def _send_regime(ws):
            try:
                await ws.send(msg)
            except Exception:
                disconnected.add(ws)
        await asyncio.gather(*[_send_regime(ws) for ws in self._clients], return_exceptions=True)
        self._clients -= disconnected

    async def _broadcast_circuit_breaker_status(self) -> None:
        """Periodically broadcast circuit breaker status to all connected clients."""
        state_map = {"CLOSED": 0, "OPEN": 1, "HALF_OPEN": 2}
        while self._running:
            await asyncio.sleep(5)
            if not self._clients:
                continue

            status = self.circuit_breaker.get_status()
            state_val = state_map.get(status["state"], 0)
            self.metrics.set_circuit_breaker_state(state_val)

            if _HAS_ORJSON:
                msg = orjson.dumps({
                    "type": "circuit_breaker_status",
                    **status,
                    "timestamp": int(time.time()),
                })
            else:
                msg = json.dumps({
                    "type": "circuit_breaker_status",
                    **status,
                    "timestamp": int(time.time()),
                }, separators=(',', ':'))

            disconnected = set()
            async def _send_cb(ws):
                try:
                    await ws.send(msg)
                except Exception:
                    disconnected.add(ws)
            await asyncio.gather(*[_send_cb(ws) for ws in self._clients], return_exceptions=True)
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
        from src.backtesting import Backtester
        from src.strategies import (
            EnsembleVoter, FFTCycleStrategy, MeanReversionStrategy,
            TrendFollowingStrategy,
        )
        from src.risk.risk_manager import RiskConfig

        n_candles = max(10, min(int(params.get("candles", 500)), 10000))
        balance = max(1.0, float(params.get("balance", 10000)))
        symbol = str(params.get("symbol", "BTC/USDT"))[:32]
        initial_price = max(0.01, float(params.get("initial_price", 65000)))
        volatility = max(0.0, min(float(params.get("volatility", 0.75)), 5.0))
        strategy_name = str(params.get("strategy", "all"))[:32]
        use_trailing = bool(params.get("trailing_stop", False))
        use_breakeven = bool(params.get("breakeven", False))

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
        self.metrics.record_backtest()

        return {
            "type": "backtest_result",
            "strategy": strategy_name,
            "symbol": symbol,
            "candles": n_candles,
            "results": results,
        }

    def _compare_backtests(self, data: dict) -> dict:
        """Compare multiple saved backtests side-by-side.

        Args:
            data: Dict with key "backtests" — list of {name, results} dicts.
                  Each results dict is the per-strategy output from run_backtest.

        Returns:
            Dict with type "comparison_result" containing comparison metrics.
        """
        from src.backtesting.backtest_comparison import BacktestComparison, ComparisonResult
        from src.backtesting.backtest_engine import BacktestResult

        backtests = data.get("backtests", [])
        if len(backtests) < 2:
            return {"type": "comparison_result", "error": "Need at least 2 backtests to compare"}

        comparison = BacktestComparison()
        for bt in backtests:
            name = bt.get("name", bt.get("label", "unknown"))
            results = bt.get("results", {})
            # Use the best strategy from each backtest for comparison
            if not results:
                continue
            best_name = max(results, key=lambda k: results[k].get("total_return_pct", -999))
            r = results[best_name]
            bt_result = BacktestResult(
                total_return_pct=r.get("total_return_pct", 0),
                sharpe_ratio=r.get("sharpe_ratio", 0),
                sortino_ratio=r.get("sortino_ratio", 0),
                calmar_ratio=r.get("calmar_ratio", 0),
                max_drawdown_pct=r.get("max_drawdown_pct", 0),
                win_rate=r.get("win_rate", 0),
                profit_factor=r.get("profit_factor", 0),
                total_trades=r.get("total_trades", 0),
                final_equity=r.get("final_balance", 0),
                equity_curve=r.get("equity_curve", []),
            )
            comparison.add(name, bt_result)

        if len(comparison.results) < 2:
            return {"type": "comparison_result", "error": "Need at least 2 valid backtests"}

        comp_result = comparison.compare()
        result_dict = comp_result.to_dict()
        result_dict["type"] = "comparison_result"
        result_dict["equity_curves"] = comp_result.equity_curves
        return result_dict
