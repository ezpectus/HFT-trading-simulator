"""
Market microstructure research lab.

Tools for analyzing market microstructure phenomena:
  - Order flow imbalance (OFI) and price impact
  - Spread dynamics and adverse selection
  - Trade arrival intensity (Hawkes process)
  - Order book resilience
  - Price discovery metrics (VPIN, Kyle's lambda)
  - Market quality metrics (effective spread, realized spread)

Usage:
    from src.research.microstructure_lab import MicrostructureLab

    lab = MicrostructureLab(orders=order_data, trades=trade_data, book=book_snapshots)
    results = lab.analyze_all()
    lab.plot_order_flow_imbalance()
"""

from __future__ import annotations

import logging
import numpy as np
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class MicrostructureMetrics:
    # Order flow
    ofi_mean: float = 0.0  # Order Flow Imbalance
    ofi_std: float = 0.0
    ofi_price_impact: float = 0.0  # OFI → price change coefficient

    # Spread
    effective_spread_bps: float = 0.0
    realized_spread_bps: float = 0.0
    adverse_selection_component: float = 0.0  # fraction of spread due to informed trading

    # Price discovery
    vpin: float = 0.0  # Volume-Synchronized PIN
    kyle_lambda: float = 0.0  # Price impact coefficient
    amihud_illiquidity: float = 0.0

    # Trade intensity
    trade_arrival_rate: float = 0.0  # trades per second
    hawkes_alpha: float = 0.0  # self-excitation parameter
    hawkes_beta: float = 0.0  # decay rate

    # Book resilience
    book_resilience: float = 0.0  # how fast book recovers after trades
    spread_autocorrelation: float = 0.0


class MicrostructureLab:
    """Market microstructure analysis toolkit."""

    def __init__(
        self,
        trades: Optional[List[Dict]] = None,
        book_snapshots: Optional[List[Dict]] = None,
        price_history: Optional[np.ndarray] = None,
    ):
        self.trades = trades or []
        self.book_snapshots = book_snapshots or []
        self.price_history = price_history
        self.metrics = MicrostructureMetrics()

    def compute_ofi(self) -> Tuple[np.ndarray, np.ndarray]:
        """Compute Order Flow Imbalance time series."""
        if not self.book_snapshots:
            return np.array([]), np.array([])

        ofi_series = []
        timestamps = []

        for i in range(1, len(self.book_snapshots)):
            prev = self.book_snapshots[i - 1]
            curr = self.book_snapshots[i]

            # OFI = change in bid volume - change in ask volume
            bid_vol_change = sum(b.get("qty", 0) for b in curr.get("bids", [])) - \
                             sum(b.get("qty", 0) for b in prev.get("bids", []))
            ask_vol_change = sum(a.get("qty", 0) for a in curr.get("asks", [])) - \
                             sum(a.get("qty", 0) for a in prev.get("asks", []))

            ofi = bid_vol_change - ask_vol_change
            ofi_series.append(ofi)
            timestamps.append(curr.get("timestamp", i))

        ofi_arr = np.array(ofi_series)
        self.metrics.ofi_mean = float(np.mean(ofi_arr))
        self.metrics.ofi_std = float(np.std(ofi_arr))

        return np.array(timestamps), ofi_arr

    def compute_price_impact(self, ofi: np.ndarray, returns: np.ndarray) -> float:
        """Estimate Kyle's lambda (price impact of order flow)."""
        if len(ofi) < 2 or len(returns) < 2:
            return 0.0

        min_len = min(len(ofi), len(returns))
        ofi_norm = ofi[:min_len] / (np.std(ofi[:min_len]) + 1e-10)
        ret_norm = returns[:min_len]

        # Linear regression: return = lambda * OFI + epsilon
        lambda_coef = np.polyfit(ofi_norm, ret_norm, 1)[0]
        self.metrics.kyle_lambda = float(lambda_coef)
        self.metrics.ofi_price_impact = float(lambda_coef)
        return float(lambda_coef)

    def compute_vpin(self, bucket_volume: float = 100.0) -> float:
        """Compute Volume-Synchronized Probability of Informed Trading."""
        if not self.trades:
            return 0.0

        # Group trades into volume buckets
        buckets = []
        current_bucket = {"buy_vol": 0, "sell_vol": 0}

        for trade in self.trades:
            vol = trade.get("qty", 0)
            side = trade.get("side", "buy")

            if side == "buy":
                current_bucket["buy_vol"] += vol
            else:
                current_bucket["sell_vol"] += vol

            total = current_bucket["buy_vol"] + current_bucket["sell_vol"]
            if total >= bucket_volume:
                buckets.append(current_bucket)
                current_bucket = {"buy_vol": 0, "sell_vol": 0}

        if not buckets:
            return 0.0

        # VPIN = sum(|buy_frac - sell_frac|) / n_buckets
        vpin_values = []
        for b in buckets:
            total = b["buy_vol"] + b["sell_vol"]
            if total > 0:
                vpin_values.append(abs(b["buy_vol"] - b["sell_vol"]) / total)

        self.metrics.vpin = float(np.mean(vpin_values))
        return self.metrics.vpin

    def compute_spread_metrics(self) -> Dict[str, float]:
        """Compute effective and realized spread."""
        if not self.book_snapshots:
            return {}

        spreads = []
        for snap in self.book_snapshots:
            bids = snap.get("bids", [])
            asks = snap.get("asks", [])
            if bids and asks:
                best_bid = bids[0].get("price", 0)
                best_ask = asks[0].get("price", 0)
                mid = (best_bid + best_ask) / 2
                if mid > 0:
                    spreads.append((best_ask - best_bid) / mid * 10000)  # bps

        if not spreads:
            return {}

        self.metrics.effective_spread_bps = float(np.mean(spreads))

        # Spread autocorrelation (proxy for adverse selection)
        if len(spreads) > 10:
            spread_arr = np.array(spreads)
            ac1 = np.corrcoef(spread_arr[:-1], spread_arr[1:])[0, 1]
            self.metrics.spread_autocorrelation = float(ac1)
            self.metrics.adverse_selection_component = float(max(0, ac1))

        return {
            "effective_spread_bps": self.metrics.effective_spread_bps,
            "spread_autocorrelation": self.metrics.spread_autocorrelation,
        }

    def compute_trade_intensity(self) -> Dict[str, float]:
        """Estimate trade arrival rate and Hawkes process parameters."""
        if not self.trades:
            return {}

        timestamps = [t.get("timestamp", 0) for t in self.trades]
        if len(timestamps) < 2:
            return {}

        # Simple arrival rate
        duration = max(timestamps[-1] - timestamps[1], 1)
        rate = len(timestamps) / duration
        self.metrics.trade_arrival_rate = float(rate)

        # Hawkes process parameters (simplified MLE)
        inter_arrivals = np.diff(sorted(timestamps))
        if len(inter_arrivals) > 10:
            # Branching ratio (alpha/beta) — simplified estimation
            mean_inter = np.mean(inter_arrivals)
            var_inter = np.var(inter_arrivals)
            # Method of moments for Hawkes
            if var_inter > mean_inter and mean_inter > 0:
                branching = 1 - mean_inter / np.sqrt(var_inter)
                self.metrics.hawkes_alpha = float(max(0, min(branching, 0.95)))
                self.metrics.hawkes_beta = float(1.0 / mean_inter)

        return {
            "trade_arrival_rate": self.metrics.trade_arrival_rate,
            "hawkes_alpha": self.metrics.hawkes_alpha,
            "hawkes_beta": self.metrics.hawkes_beta,
        }

    def compute_amihud_illiquidity(self, returns: np.ndarray, volumes: np.ndarray) -> float:
        """Amihud illiquidity measure = mean(|return| / volume)."""
        if len(returns) == 0 or len(volumes) == 0:
            return 0.0
        min_len = min(len(returns), len(volumes))
        illiq = np.mean(np.abs(returns[:min_len]) / (volumes[:min_len] + 1e-10))
        self.metrics.amihud_illiquidity = float(illiq)
        return float(illiq)

    def analyze_all(self) -> MicrostructureMetrics:
        """Run all microstructure analyses."""
        ts, ofi = self.compute_ofi()

        if self.price_history is not None and len(ofi) > 0:
            returns = np.diff(np.log(self.price_history + 1e-10))
            self.compute_price_impact(ofi, returns)

        self.compute_vpin()
        self.compute_spread_metrics()
        self.compute_trade_intensity()

        logger.info(f"[Microstructure] Analysis complete — "
                    f"OFI={self.metrics.ofi_mean:.2f}, "
                    f"VPIN={self.metrics.vpin:.3f}, "
                    f"spread={self.metrics.effective_spread_bps:.1f}bps, "
                    f"lambda={self.metrics.kyle_lambda:.4f}")

        return self.metrics
