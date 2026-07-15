"""Spread and slippage analytics — track effective trading costs across exchanges.

Monitors bid-ask spreads and effective slippage over time, providing
percentile-based statistics for cost analysis and strategy optimization.

Usage:
    from exchange_simulator.spread_analytics import SpreadAnalytics

    analytics = SpreadAnalytics()
    analytics.record_spread("binance", "BTC/USDT", 0.5, 50000.0)
    stats = analytics.get_stats("binance", "BTC/USDT")
    summary = analytics.get_summary()
"""
import logging
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Optional

import numpy as np

logger = logging.getLogger("exchange_simulator.spread_analytics")


@dataclass
class SpreadRecord:
    """A single spread observation."""
    exchange: str
    symbol: str
    spread: float           # absolute spread (best_ask - best_bid)
    mid_price: float
    spread_bps: float       # spread in basis points
    timestamp: float


@dataclass
class SpreadStats:
    """Aggregated spread statistics for an exchange/symbol pair."""
    exchange: str
    symbol: str
    count: int = 0
    mean_spread: float = 0.0
    mean_spread_bps: float = 0.0
    p50_spread: float = 0.0
    p90_spread: float = 0.0
    p99_spread: float = 0.0
    max_spread: float = 0.0
    min_spread: float = 0.0
    mean_slippage_bps: float = 0.0
    slippage_count: int = 0


class SpreadAnalytics:
    """Track and analyze bid-ask spreads and slippage across exchanges.

    Maintains rolling windows of spread observations and effective slippage
    measurements, providing percentile-based statistics for cost analysis.
    """

    def __init__(self, window_size: int = 1000):
        self.window_size = window_size
        self._spreads: dict[str, deque[SpreadRecord]] = {}
        self._slippages: dict[str, deque[float]] = {}
        self._last_mid: dict[str, float] = {}

    def _key(self, exchange: str, symbol: str) -> str:
        return f"{exchange}:{symbol}"

    def record_spread(
        self,
        exchange: str,
        symbol: str,
        spread: float,
        mid_price: float,
        timestamp: Optional[float] = None,
    ) -> None:
        """Record a spread observation."""
        if mid_price <= 0:
            return
        ts = timestamp if timestamp is not None else time.time()
        spread_bps = spread / mid_price * 10000
        record = SpreadRecord(
            exchange=exchange,
            symbol=symbol,
            spread=spread,
            mid_price=mid_price,
            spread_bps=spread_bps,
            timestamp=ts,
        )
        key = self._key(exchange, symbol)
        if key not in self._spreads:
            self._spreads[key] = deque(maxlen=self.window_size)
        self._spreads[key].append(record)
        self._last_mid[key] = mid_price

    def record_slippage(
        self,
        exchange: str,
        symbol: str,
        expected_price: float,
        actual_fill_price: float,
        side: str = "BUY",
    ) -> None:
        """Record effective slippage for a fill.

        Slippage is the difference between expected and actual fill price,
        expressed in basis points relative to the expected price.
        """
        if expected_price <= 0:
            return
        # For BUY: slippage = (actual - expected) / expected (positive = worse)
        # For SELL: slippage = (expected - actual) / expected (positive = worse)
        if side.upper() == "SELL":
            slip_bps = (expected_price - actual_fill_price) / expected_price * 10000
        else:
            slip_bps = (actual_fill_price - expected_price) / expected_price * 10000
        key = self._key(exchange, symbol)
        if key not in self._slippages:
            self._slippages[key] = deque(maxlen=self.window_size)
        self._slippages[key].append(slip_bps)

    def get_stats(self, exchange: str, symbol: str) -> Optional[SpreadStats]:
        """Get aggregated spread statistics for an exchange/symbol pair."""
        key = self._key(exchange, symbol)
        if key not in self._spreads or not self._spreads[key]:
            return None

        records = list(self._spreads[key])
        spreads = np.array([r.spread for r in records])
        spread_bps = np.array([r.spread_bps for r in records])

        stats = SpreadStats(
            exchange=exchange,
            symbol=symbol,
            count=len(records),
            mean_spread=float(np.mean(spreads)),
            mean_spread_bps=float(np.mean(spread_bps)),
            p50_spread=float(np.percentile(spreads, 50)),
            p90_spread=float(np.percentile(spreads, 90)),
            p99_spread=float(np.percentile(spreads, 99)),
            max_spread=float(np.max(spreads)),
            min_spread=float(np.min(spreads)),
        )

        if key in self._slippages and self._slippages[key]:
            slips = np.array(list(self._slippages[key]))
            stats.mean_slippage_bps = float(np.mean(slips))
            stats.slippage_count = len(slips)

        return stats

    def get_summary(self) -> dict:
        """Get a summary of all tracked exchange/symbol pairs."""
        pairs = set(self._spreads.keys()) | set(self._slippages.keys())
        return {
            "tracked_pairs": len(pairs),
            "pairs": sorted(pairs),
            "total_observations": sum(len(d) for d in self._spreads.values()),
            "total_slippage_records": sum(len(d) for d in self._slippages.values()),
        }

    def get_all_stats(self) -> list[SpreadStats]:
        """Get stats for all tracked exchange/symbol pairs."""
        results = []
        for key in sorted(self._spreads.keys()):
            if self._spreads[key]:
                ex, sym = key.split(":", 1)
                stats = self.get_stats(ex, sym)
                if stats:
                    results.append(stats)
        return results

    def render_terminal(self) -> str:
        """Render spread analytics for terminal visualizer."""
        all_stats = self.get_all_stats()
        if not all_stats:
            return "  No spread data collected"

        lines = [f"  Spread Analytics ({len(all_stats)} pairs):"]
        for s in all_stats:
            lines.append(
                f"    {s.exchange:>8} {s.symbol:<12} "
                f"Mean: {s.mean_spread_bps:>6.1f}bps  "
                f"P50: {s.p50_spread:>10.4f}  "
                f"P99: {s.p99_spread:>10.4f}  "
                f"Slip: {s.mean_slippage_bps:>6.1f}bps ({s.slippage_count} fills)"
            )
        return "\n".join(lines)
