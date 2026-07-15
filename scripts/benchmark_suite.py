#!/usr/bin/env python3
"""
Benchmark Suite — Latency measurement for all HFT components.
Measures p50/p95/p99/p999 for each pipeline stage and writes JSON report.

Usage:
    python scripts/benchmark_suite.py [--iterations 10000] [--output logs/benchmark.json]
"""
import argparse
import json
import os
import sys
import time
import statistics
from datetime import datetime

def percentile(sorted_data, p):
    """Calculate percentile from sorted list."""
    if not sorted_data:
        return 0.0
    k = (len(sorted_data) - 1) * (p / 100.0)
    f = int(k)
    c = min(f + 1, len(sorted_data) - 1)
    if f == c:
        return sorted_data[f]
    return sorted_data[f] + (sorted_data[c] - sorted_data[f]) * (k - f)

def measure_stage(name, fn, iterations):
    """Run fn iterations times and collect latency in microseconds."""
    latencies = []
    for _ in range(iterations):
        t0 = time.perf_counter_ns()
        fn()
        t1 = time.perf_counter_ns()
        latencies.append((t1 - t0) / 1000.0)  # convert to microseconds
    latencies.sort()
    return {
        'name': name,
        'iterations': iterations,
        'p50_us': round(percentile(latencies, 50), 3),
        'p95_us': round(percentile(latencies, 95), 3),
        'p99_us': round(percentile(latencies, 99), 3),
        'p999_us': round(percentile(latencies, 99.9), 3),
        'min_us': round(latencies[0], 3),
        'max_us': round(latencies[-1], 3),
        'mean_us': round(statistics.mean(latencies), 3),
        'stddev_us': round(statistics.stdev(latencies) if len(latencies) > 1 else 0, 3),
    }

def bench_signal_parsing(iterations):
    """Benchmark JSON signal parsing (simulates WebSocket message handling)."""
    import json as _json
    msg = _json.dumps({
        "type": "signal", "symbol": "BTC/USDT", "direction": "long",
        "confidence": 0.85, "entry": 65000.0, "sl": 64500.0, "tp": 66000.0,
        "qty": 0.1, "timestamp": time.time(),
    })
    def parse():
        _json.loads(msg)
    return measure_stage('signal_json_parse', parse, iterations)

def bench_order_book_update(iterations):
    """Benchmark order book update (simulates L2 book processing)."""
    book = {'bids': [[65000.5 - i * 0.1, 1.5 + i * 0.3] for i in range(20)],
            'asks': [[65000.5 + i * 0.1, 1.2 + i * 0.2] for i in range(20)]}
    def update():
        new_bids = [[65000.5 - i * 0.1, 1.5 + i * 0.3 + 0.01] for i in range(20)]
        new_asks = [[65000.5 + i * 0.1, 1.2 + i * 0.2 + 0.01] for i in range(20)]
        book['bids'] = new_bids
        book['asks'] = new_asks
        spread = book['asks'][0][0] - book['bids'][0][0]
        _ = spread
    return measure_stage('order_book_update', update, iterations)

def bench_candle_aggregation(iterations):
    """Benchmark OHLC candle aggregation."""
    candles = []
    def aggregate():
        price = 65000.0 + (time.perf_counter_ns() % 100) * 0.01
        vol = 1.5
        if candles:
            c = candles[-1]
            c['high'] = max(c['high'], price)
            c['low'] = min(c['low'], price)
            c['close'] = price
            c['volume'] += vol
        else:
            candles.append({'open': price, 'high': price, 'low': price, 'close': price, 'volume': vol})
    return measure_stage('candle_aggregation', aggregate, iterations)

def bench_position_pnl(iterations):
    """Benchmark unrealized PnL calculation."""
    positions = [
        {'side': 'buy', 'qty': 0.5, 'entry': 65000.0, 'symbol': 'BTC/USDT'},
        {'side': 'sell', 'qty': 0.3, 'entry': 3500.0, 'symbol': 'ETH/USDT'},
        {'side': 'buy', 'qty': 1.0, 'entry': 150.0, 'symbol': 'SOL/USDT'},
    ]
    prices = {'BTC/USDT': 65100.0, 'ETH/USDT': 3490.0, 'SOL/USDT': 152.0}
    def calc():
        total = 0.0
        for p in positions:
            if p['side'] == 'buy':
                total += (prices[p['symbol']] - p['entry']) * p['qty']
            else:
                total += (p['entry'] - prices[p['symbol']]) * p['qty']
        _ = total
    return measure_stage('position_pnl_calc', calc, iterations)

def bench_rsi_calculation(iterations):
    """Benchmark RSI indicator calculation."""
    import random
    random.seed(42)
    prices = [65000.0 + random.gauss(0, 50) for _ in range(100)]
    def calc():
        period = 14
        gains = []
        losses = []
        for i in range(1, len(prices)):
            change = prices[i] - prices[i-1]
            gains.append(max(0, change))
            losses.append(max(0, -change))
        avg_gain = sum(gains[:period]) / period
        avg_loss = sum(losses[:period]) / period
        for i in range(period, len(gains)):
            avg_gain = (avg_gain * (period - 1) + gains[i]) / period
            avg_loss = (avg_loss * (period - 1) + losses[i]) / period
        rs = avg_gain / avg_loss if avg_loss > 0 else 100
        rsi = 100 - 100 / (1 + rs)
        _ = rsi
    return measure_stage('rsi_calculation', calc, iterations)

def bench_signal_validation(iterations):
    """Benchmark signal validation logic."""
    def validate():
        signal = {
            'confidence': 0.85, 'rr_ratio': 2.5, 'direction': 'long',
            'entry': 65000.0, 'sl': 64500.0, 'tp': 66000.0, 'qty': 0.1,
        }
        checks = [
            signal['confidence'] >= 0.6,
            signal['rr_ratio'] >= 1.5,
            signal['qty'] > 0,
            signal['sl'] < signal['entry'] if signal['direction'] == 'long' else signal['sl'] > signal['entry'],
            signal['tp'] > signal['entry'] if signal['direction'] == 'long' else signal['tp'] < signal['entry'],
        ]
        _ = all(checks)
    return measure_stage('signal_validation', validate, iterations)

def main():
    parser = argparse.ArgumentParser(description='HFT Benchmark Suite')
    parser.add_argument('--iterations', type=int, default=10000, help='Iterations per benchmark')
    parser.add_argument('--output', type=str, default='logs/benchmark.json', help='Output JSON path')
    args = parser.parse_args()

    benchmarks = [
        bench_signal_parsing,
        bench_order_book_update,
        bench_candle_aggregation,
        bench_position_pnl,
        bench_rsi_calculation,
        bench_signal_validation,
    ]

    results = []
    for bench_fn in benchmarks:
        print(f"  Running {bench_fn.__name__}...", end=' ', flush=True)
        result = bench_fn(args.iterations)
        results.append(result)
        print(f"p50={result['p50_us']:.1f}us p99={result['p99_us']:.1f}us")

    report = {
        'timestamp': datetime.now().isoformat(),
        'iterations': args.iterations,
        'platform': {
            'python': sys.version,
            'os': sys.platform,
        },
        'benchmarks': results,
        'summary': {
            'total_benchmarks': len(results),
            'fastest_p50': min(r['p50_us'] for r in results),
            'slowest_p50': max(r['p50_us'] for r in results),
            'max_p99': max(r['p99_us'] for r in results),
            'max_p999': max(r['p999_us'] for r in results),
        },
    }

    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    with open(args.output, 'w') as f:
        json.dump(report, f, indent=2)

    print(f"\n{'='*70}")
    print(f"  Benchmark Suite Report")
    print(f"  {report['timestamp']}")
    print(f"  Iterations: {args.iterations}")
    print(f"{'='*70}")
    print(f"  {'Stage':<25} {'p50':>8} {'p95':>8} {'p99':>8} {'p999':>8} {'max':>8}")
    print(f"  {'-'*70}")
    for r in results:
        print(f"  {r['name']:<25} {r['p50_us']:>7.1f} {r['p95_us']:>7.1f} {r['p99_us']:>7.1f} {r['p999_us']:>7.1f} {r['max_us']:>7.1f} us")
    print(f"{'='*70}")
    print(f"  Report saved to: {args.output}")
    print(f"{'='*70}\n")

if __name__ == '__main__':
    main()
