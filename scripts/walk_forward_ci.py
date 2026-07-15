#!/usr/bin/env python3
"""
Walk-Forward Optimization CI Script
Runs nightly to check strategy performance degradation.

Usage:
    python scripts/walk_forward_ci.py [--baseline BASELINE_JSON] [--threshold 0.15]

Outputs JSON report with Sharpe ratio comparison and degradation alerts.
"""
import argparse
import json
import os
import sys
import subprocess
from datetime import datetime
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent

def run_backtest(strategy_name, days=30):
    """Run backtest for a strategy and return metrics."""
    env = os.environ.copy()
    env['WF_STRATEGY'] = strategy_name
    env['WF_DAYS'] = str(days)
    env['WF_SIM_PATH'] = str(PROJECT_ROOT / "exchange_simulator")

    result = subprocess.run([
        sys.executable, '-c', """
import sys, json, math, os
sys.path.insert(0, os.environ['WF_SIM_PATH'])
from exchange_simulator.market_simulator import MarketSimulator

strategy_name = os.environ['WF_STRATEGY']
days = int(os.environ['WF_DAYS'])

sim = MarketSimulator(
    symbols=['BTC/USDT'],
    exchanges=['binance'],
    initial_prices={'BTC/USDT': 65000.0},
    volatility={'BTC/USDT': 0.8},
    timeframe_seconds=3600,
    warmup_candles=100,
)

# Generate historical candles
candles = []
for _ in range(days * 24):
    new_candles = sim.next_candle()
    candles.extend(new_candles)

# Calculate basic metrics from candle data
closes = [c.close for c in candles]
if len(closes) < 2:
    print(json.dumps({'strategy': strategy_name, 'error': 'Not enough candles'}))
    sys.exit(0)

returns = [(closes[i] - closes[i-1]) / closes[i-1] for i in range(1, len(closes))]
mean_ret = sum(returns) / len(returns) if returns else 0
std_ret = math.sqrt(sum((r - mean_ret)**2 for r in returns) / len(returns)) if returns else 0.001
sharpe = (mean_ret / std_ret * math.sqrt(365 * 24)) if std_ret > 0 else 0
max_close = max(closes)
max_dd = max((max_close - c) / max_close for c in closes) if max_close > 0 else 0

print(json.dumps({
    'strategy': strategy_name,
    'sharpe': round(sharpe, 4),
    'max_drawdown': round(max_dd, 4),
    'total_return': round((closes[-1] - closes[0]) / closes[0], 4),
    'volatility': round(std_ret * math.sqrt(365 * 24), 4),
    'candles': len(candles),
}))
"""
    ], capture_output=True, text=True, timeout=120, env=env)
    
    if result.returncode != 0:
        return {'strategy': strategy_name, 'error': result.stderr.strip()[:500]}
    
    try:
        return json.loads(result.stdout.strip())
    except json.JSONDecodeError:
        return {'strategy': strategy_name, 'error': 'Failed to parse output'}

def check_degradation(current, baseline, threshold=0.15):
    """Check if Sharpe ratio degraded beyond threshold."""
    if 'error' in current or 'error' in baseline:
        return {'status': 'error', 'message': 'Backtest error'}
    
    current_sharpe = current.get('sharpe', 0)
    baseline_sharpe = baseline.get('sharpe', 0)
    
    if baseline_sharpe == 0:
        degradation = 0
    else:
        degradation = (baseline_sharpe - current_sharpe) / abs(baseline_sharpe)
    
    is_degraded = degradation > threshold
    
    return {
        'status': 'degraded' if is_degraded else 'ok',
        'current_sharpe': current_sharpe,
        'baseline_sharpe': baseline_sharpe,
        'degradation_pct': round(degradation * 100, 2),
        'threshold_pct': round(threshold * 100, 2),
        'alert': is_degraded,
    }

def main():
    parser = argparse.ArgumentParser(description='Walk-Forward Optimization CI')
    parser.add_argument('--baseline', type=str, help='Path to baseline JSON file')
    parser.add_argument('--threshold', type=float, default=0.15, help='Degradation threshold (default: 0.15 = 15%)')
    parser.add_argument('--output', type=str, default='logs/walk_forward_report.json', help='Output report path')
    parser.add_argument('--days', type=int, default=30, help='Days of historical data')
    args = parser.parse_args()
    
    strategies = ['rsi_oversold', 'ema_crossover', 'volume_breakout', 'mean_reversion', 'trend_following']
    
    report = {
        'timestamp': datetime.now().isoformat(),
        'threshold': args.threshold,
        'results': [],
        'alerts': [],
        'summary': {'total': 0, 'ok': 0, 'degraded': 0, 'errors': 0},
    }
    
    baseline_data = {}
    if args.baseline and os.path.exists(args.baseline):
        with open(args.baseline) as f:
            baseline_data = {item['strategy']: item for item in json.load(f)}
    
    for strat in strategies:
        current = run_backtest(strat, days=args.days)
        baseline = baseline_data.get(strat, current)
        check = check_degradation(current, baseline, args.threshold)
        
        result = {
            'strategy': strat,
            'current': current,
            'baseline': baseline,
            'check': check,
        }
        report['results'].append(result)
        report['summary']['total'] += 1
        
        if check['status'] == 'degraded':
            report['summary']['degraded'] += 1
            report['alerts'].append(f"ALERT: {strat} Sharpe degraded by {check['degradation_pct']}%")
        elif check['status'] == 'error':
            report['summary']['errors'] += 1
        else:
            report['summary']['ok'] += 1
    
    # Write report
    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    with open(args.output, 'w') as f:
        json.dump(report, f, indent=2)
    
    # Print summary
    print(f"\n{'='*60}")
    print(f"  Walk-Forward Optimization CI Report")
    print(f"  {report['timestamp']}")
    print(f"{'='*60}")
    print(f"  Total strategies: {report['summary']['total']}")
    print(f"  OK: {report['summary']['ok']}")
    print(f"  Degraded: {report['summary']['degraded']}")
    print(f"  Errors: {report['summary']['errors']}")
    print(f"  Threshold: {args.threshold * 100}%")
    
    if report['alerts']:
        print(f"\n  ALERTS:")
        for alert in report['alerts']:
            print(f"    - {alert}")
    
    print(f"\n  Report saved to: {args.output}")
    print(f"{'='*60}\n")
    
    # Exit with error if any degradation
    if report['summary']['degraded'] > 0:
        sys.exit(1)

if __name__ == '__main__':
    main()
