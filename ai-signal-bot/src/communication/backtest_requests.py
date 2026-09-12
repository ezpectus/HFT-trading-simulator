"""Backtest request handling for the signal WebSocket server.

Extracted from signal_publisher.py (S014): run_backtest / compare_backtests
request handling is a separate concern from client management + broadcast.
Functions take explicit params — no publisher state except the metrics
callback the caller supplies.
"""
import asyncio
import math
import random
from typing import TYPE_CHECKING

from src.observability.logging import get_logger

if TYPE_CHECKING:
    from src.risk.risk_manager import RiskConfig

logger = get_logger("ai_signal_bot.signal_publisher")


class _EnsembleAdapter:
    """Adapter that makes EnsembleVoter compatible with Backtester's .analyze() interface."""

    def __init__(self, voter, sub_strategies: list):
        self.voter = voter
        self.sub_strategies = sub_strategies
        self.name = "ensemble"

    def analyze(self, symbol: str, candles: list):
        signals = [s.analyze(symbol, candles) for s in self.sub_strategies]
        return self.voter.vote(signals)


async def run_backtest_request(params: dict) -> dict:
    """Run a backtest and return results as JSON payload."""
    from src.backtesting import Backtester

    bt_params = parse_backtest_params(params)
    client_candles = parse_client_candles(params)
    candles = client_candles if client_candles is not None else generate_synthetic_candles(
        bt_params["candles"], bt_params["initial_price"], bt_params["volatility"]
    )
    data_source = "client" if client_candles is not None else "synthetic"
    risk_config = build_risk_config(bt_params)
    bt = Backtester(
        initial_balance=bt_params["balance"],
        fee_pct=0.075, slippage_bps=2.0, risk_config=risk_config,
    )
    strategies = build_strategies(bt_params["strategy"])
    if not strategies:
        return {"type": "backtest_result", "error": f"Unknown strategy: {bt_params['strategy']}"}

    results = {}
    for name, strat in strategies.items():
        result = await asyncio.to_thread(bt.run, candles, strat, symbol=bt_params["symbol"], warmup=50)
        results[name] = result.to_dict()

    logger.info("Backtest completed: %s, %s candles, %s strategies", bt_params['strategy'], bt_params['candles'], len(results))

    return {
        "type": "backtest_result",
        "strategy": bt_params["strategy"],
        "symbol": bt_params["symbol"],
        "candles": len(candles),
        "data_source": data_source,
        "results": results,
    }


def parse_backtest_params(params: dict) -> dict:
    """Parse and validate backtest parameters."""
    return {
        "candles": max(10, min(int(params.get("candles", 500)), 10000)),
        "balance": max(1.0, float(params.get("balance", 10000))),
        "symbol": str(params.get("symbol", "BTC/USDT"))[:32],
        "initial_price": max(0.01, float(params.get("initial_price", 65000))),
        "volatility": max(0.0, min(float(params.get("volatility", 0.75)), 5.0)),
        "strategy": str(params.get("strategy", "all"))[:32],
        "trailing_stop": bool(params.get("trailing_stop", False)),
        "breakeven": bool(params.get("breakeven", False)),
    }


def parse_client_candles(params: dict) -> "list[dict] | None":
    """Parse optional caller-supplied candles — real market data instead of
    the synthetic GBM series. Returns None to fall back to synthetic."""
    raw = params.get("candles_data")
    if not isinstance(raw, list) or not raw:
        return None
    candles = []
    for c in raw[:10000]:
        try:
            candles.append({
                "timestamp": float(c.get("timestamp", c.get("time"))),
                "open": float(c["open"]),
                "high": float(c["high"]),
                "low": float(c["low"]),
                "close": float(c["close"]),
                "volume": float(c.get("volume", 0.0)),
            })
        except (TypeError, ValueError, KeyError):
            return None  # malformed payload — fall back to synthetic
    return candles or None


def build_risk_config(bt_params: dict) -> "RiskConfig | None":
    """Build RiskConfig from backtest params if trailing/breakeven enabled."""
    from src.risk.risk_manager import RiskConfig
    if not (bt_params["trailing_stop"] or bt_params["breakeven"]):
        return None
    return RiskConfig(
        trailing_stop_enabled=bt_params["trailing_stop"],
        trailing_distance_pct=2.0,
        breakeven_enabled=bt_params["breakeven"],
        breakeven_trigger_pct=1.0,
    )


def generate_synthetic_candles(n_candles: int, initial_price: float, volatility: float) -> list[dict]:
    """Generate synthetic OHLCV candles using GBM."""
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
    return candles


def build_strategies(strategy_name: str) -> dict:
    """Build strategy instances based on name selection."""
    from src.strategies import (
        EnsembleVoter,
        FFTCycleStrategy,
        MeanReversionStrategy,
        TrendFollowingStrategy,
    )

    strategies = {}
    if strategy_name in ("trend", "all", "ensemble"):
        strategies["Trend Following"] = TrendFollowingStrategy(ema_fast=9, ema_slow=21, adx_threshold=25)
    if strategy_name in ("mean_reversion", "all", "ensemble"):
        strategies["Mean Reversion"] = MeanReversionStrategy(rsi_oversold=30, rsi_overbought=70, bb_period=20, bb_std=2.0)
    if strategy_name in ("fft", "all", "ensemble"):
        strategies["FFT Cycle"] = FFTCycleStrategy(min_data=64)
    if strategy_name in ("ensemble", "all"):
        sub_strategies = [
            TrendFollowingStrategy(ema_fast=9, ema_slow=21, adx_threshold=25),
            MeanReversionStrategy(rsi_oversold=30, rsi_overbought=70, bb_period=20, bb_std=2.0),
            FFTCycleStrategy(min_data=64),
        ]
        strategies["Ensemble"] = _EnsembleAdapter(
            EnsembleVoter(mode="weighted", min_votes=2),
            sub_strategies,
        )
    return strategies


def compare_backtests_request(data: dict) -> dict:
    """Compare multiple saved backtests side-by-side."""
    from src.backtesting.backtest_comparison import BacktestComparison
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
