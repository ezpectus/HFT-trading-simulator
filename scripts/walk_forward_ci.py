#!/usr/bin/env python3
"""
Walk-forward backtest for CI.

Runs the real Backtester over rolling windows of candles and, optionally,
compares the aggregated metrics against a baseline report (--baseline +
--threshold) to detect strategy degradation.

Usage:
    python scripts/walk_forward_ci.py --csv ai-signal-bot/data/exports/btc_usdt_1m.csv \
        --output logs/walk_forward_report.json

    # No CSV → generates the same seeded synthetic fixture the nightly uses
    python scripts/walk_forward_ci.py --output logs/walk_forward_report.json
"""

import argparse
import csv
import json
import math
import os
import random
import sys
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "ai-signal-bot"))

from src.backtesting.backtester import Backtester
from src.strategies.strategies import MeanReversionStrategy, TrendFollowingStrategy

STRATEGIES = [TrendFollowingStrategy, MeanReversionStrategy]


def generate_synthetic_candles(days: int = 365) -> list[dict]:
    """Seeded GBM 1m candles — the same fixture nightly-backtest.yml writes."""
    random.seed(42)
    candles = []
    price = 65000.0
    start_time = 1704067200  # 2024-01-01
    for i in range(days * 24 * 60):
        ret = random.gauss(0, 0.0003)
        trend = math.sin(i / 10000) * 0.0001
        price *= 1 + ret + trend
        candles.append({
            "time": start_time + i * 60,
            "open": price,
            "high": price * (1 + abs(random.gauss(0, 0.0001))),
            "low": price * (1 - abs(random.gauss(0, 0.0001))),
            "close": price * (1 + ret),
            "volume": random.uniform(0.5, 5.0) * (1 + abs(ret) * 100),
        })
    return candles


def load_candles_csv(path: Path) -> list[dict]:
    candles = []
    with open(path, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            candles.append({
                "time": int(row["time"]),
                "open": float(row["open"]),
                "high": float(row["high"]),
                "low": float(row["low"]),
                "close": float(row["close"]),
                "volume": float(row["volume"]),
            })
    return candles


def run_walk_forward(candles: list[dict], window_days: int, step_days: int) -> list[dict]:
    """Rolling-window backtest: window_days of candles per window, stepped by step_days."""
    results = []
    window_secs = window_days * 86400
    step_secs = step_days * 86400
    first_ts = candles[0]["time"]
    last_ts = candles[-1]["time"]

    start_ts = first_ts
    while start_ts + window_secs <= last_ts:
        end_ts = start_ts + window_secs
        window = [c for c in candles if start_ts <= c["time"] < end_ts]
        window_idx = (start_ts - first_ts) // 86400
        if len(window) < 100:
            print(f"  Window day {window_idx}-{window_idx + window_days}: too few candles ({len(window)}), skipping")
            start_ts += step_secs
            continue

        for StrategyClass in STRATEGIES:
            try:
                strategy = StrategyClass()
                bt = Backtester(initial_balance=10000, fee_pct=0.075, slippage_bps=2.0)
                r = bt.run(window, strategy, symbol="BTC/USDT", warmup=50)
                results.append({
                    "strategy": strategy.__class__.__name__,
                    "window_start_day": window_idx,
                    "window_end_day": window_idx + window_days,
                    "total_return_pct": r.total_return_pct,
                    "total_trades": r.total_trades,
                    "win_rate": r.win_rate,
                    "sharpe_ratio": r.sharpe_ratio,
                    "max_drawdown_pct": r.max_drawdown_pct,
                    "profit_factor": r.profit_factor,
                    "final_balance": r.final_balance,
                })
            except Exception as e:  # noqa: BLE001 — one bad window must not kill the run
                print(f"  Window day {window_idx}-{window_idx + window_days} {StrategyClass.__name__}: ERROR ({e})")
                results.append({
                    "strategy": StrategyClass.__name__,
                    "window_start_day": window_idx,
                    "window_end_day": window_idx + window_days,
                    "error": str(e),
                })
        start_ts += step_secs
    return results


def aggregate(results: list[dict]) -> dict:
    """Per-strategy aggregates used for the degradation check."""
    agg = {}
    for name in {r["strategy"] for r in results}:
        ok = [r for r in results if r["strategy"] == name and "error" not in r]
        if not ok:
            continue
        agg[name] = {
            "windows": len(ok),
            "avg_return_pct": round(sum(r["total_return_pct"] for r in ok) / len(ok), 4),
            "avg_sharpe": round(sum(r["sharpe_ratio"] for r in ok) / len(ok), 4),
            "total_trades": sum(r["total_trades"] for r in ok),
        }
    return agg


def check_degradation(current: dict, baseline: dict, threshold: float) -> dict:
    """Compare aggregated metrics vs baseline; alert when avg_sharpe drops > threshold."""
    alerts = []
    for name, cur in current.items():
        base = baseline.get(name)
        if not base or base.get("avg_sharpe", 0) == 0:
            continue
        degradation = (base["avg_sharpe"] - cur["avg_sharpe"]) / abs(base["avg_sharpe"])
        if degradation > threshold:
            alerts.append({
                "strategy": name,
                "current_sharpe": cur["avg_sharpe"],
                "baseline_sharpe": base["avg_sharpe"],
                "degradation_pct": round(degradation * 100, 2),
            })
    return {"alerts": alerts, "degraded": bool(alerts)}


def main() -> int:
    parser = argparse.ArgumentParser(description="Walk-forward backtest CI")
    parser.add_argument("--csv", type=str, help="Candle CSV (time,open,high,low,close,volume). Absent → seeded synthetic fixture")
    parser.add_argument("--baseline", type=str, help="Prior report JSON for degradation check")
    parser.add_argument("--threshold", type=float, default=0.15, help="Sharpe degradation threshold (default 0.15)")
    parser.add_argument("--output", type=str, default="logs/walk_forward_report.json")
    parser.add_argument("--window-days", type=int, default=30)
    parser.add_argument("--step-days", type=int, default=7)
    parser.add_argument("--days", type=int, default=365, help="Synthetic fixture length when --csv absent")
    args = parser.parse_args()

    if args.csv:
        candles = load_candles_csv(Path(args.csv))
        data_source = str(args.csv)
    else:
        candles = generate_synthetic_candles(args.days)
        data_source = "synthetic-gbm-seed42"
    print(f"Candles: {len(candles)} ({data_source})")

    results = run_walk_forward(candles, args.window_days, args.step_days)
    current = aggregate(results)

    baseline = {}
    if args.baseline and os.path.exists(args.baseline):
        with open(args.baseline, encoding="utf-8") as f:
            baseline = json.load(f).get("aggregate", {})

    degradation = check_degradation(current, baseline, args.threshold)

    report = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "data_source": data_source,
        "window_days": args.window_days,
        "step_days": args.step_days,
        "aggregate": current,
        "degradation": degradation,
        "windows": results,
    }
    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print("\n=== Walk-Forward Summary ===")
    for name, a in current.items():
        print(f"  {name}: {a['windows']} windows, avg return {a['avg_return_pct']}%, avg Sharpe {a['avg_sharpe']}, {a['total_trades']} trades")
    if degradation["alerts"]:
        for a in degradation["alerts"]:
            print(f"  ALERT {a['strategy']}: Sharpe degraded {a['degradation_pct']}% vs baseline")
    print(f"Report: {out}")
    return 1 if degradation["degraded"] else 0


if __name__ == "__main__":
    sys.exit(main())
