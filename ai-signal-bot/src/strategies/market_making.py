"""Market making — Avellaneda-Stoikov optimal quotes with inventory management.

Features:
- Avellaneda-Stoikov reservation price and optimal spread
- Inventory-skewed quotes
- Adverse selection protection
- Spread optimization (max fill rate × profit per fill)
"""

from __future__ import annotations

import logging
import math
from collections import deque
from dataclasses import dataclass

import numpy as np

from src.strategies.signal import Signal, SignalDirection

logger = logging.getLogger(__name__)


@dataclass
class MarketMakingConfig:
    gamma: float = 0.1             # Risk aversion coefficient
    sigma: float = 0.3             # Volatility (annualized)
    T: float = 1.0                 # Time horizon (normalized)
    k: float = 1.5                 # Order arrival intensity
    max_inventory: float = 5.0     # Max position size
    min_spread: float = 0.0001     # Minimum spread (fractional)
    max_spread: float = 0.005      # Maximum spread (fractional)
    inventory_skew: float = 1.0    # How aggressively to skew
    toxicity_threshold: float = 0.7  # Cancel if toxicity > this
    vol_lookback: int = 60         # Volatility estimation window
    fill_rate_target: float = 0.3  # Target fill rate for spread optimization


@dataclass
class Quote:
    bid_price: float
    ask_price: float
    bid_size: float
    ask_size: float
    mid_price: float
    reservation_price: float
    spread: float
    should_cancel: bool = False
    confidence: float = 0.0
    reason: str = ""


class MarketMakingStrategy:
    """Avellaneda-Stoikov market making with inventory skew."""

    def __init__(self, config: MarketMakingConfig | None = None):
        self.config = config or MarketMakingConfig()
        self.name = "market_making"
        self.inventory: float = 0.0
        self.returns_history: deque[float] = deque(maxlen=self.config.vol_lookback)
        self.toxicity_score: float = 0.0
        self.fill_count: int = 0
        self.order_count: int = 0
        self.total_pnl: float = 0.0
        self._prev_price: float = 0.0
        self._last_sigma: float = self.config.sigma
        self._avg_entry_price: float = 0.0

    def update_inventory(self, delta: float) -> None:
        """Update inventory after a fill."""
        self.inventory += delta

    def update_toxicity(self, toxicity: float) -> None:
        """Update toxicity score from order book analysis."""
        self.toxicity_score = toxicity

    def _estimate_volatility(self, price: float) -> float:
        """Estimate realized volatility from recent returns."""
        if self._prev_price > 0 and price > 0:
            ret = math.log(price / self._prev_price)
            self.returns_history.append(ret)
        self._prev_price = price

        if len(self.returns_history) < 10:
            return self.config.sigma

        arr = np.array(self.returns_history)
        return max(arr.std() * math.sqrt(365 * 24 * 60), 0.001)  # Per-minute vol annualized, crypto 24/7

    def _reservation_price(self, mid: float, t: float) -> float:
        """Avellaneda-Stoikov reservation price."""
        self._last_sigma = self._estimate_volatility(mid)
        q = self.inventory
        gamma = self.config.gamma
        # r = s - q * gamma * sigma^2 * (T - t)
        return mid - q * gamma * self._last_sigma * self._last_sigma * (self.config.T - t)

    def _optimal_spread(self, sigma: float, t: float) -> float:
        """Avellaneda-Stoikov optimal spread."""
        gamma = self.config.gamma
        k = self.config.k
        T_t = self.config.T - t
        # Optimal spread = gamma * sigma^2 * T + (2/gamma) * ln(1 + gamma/k)
        spread = gamma * sigma * sigma * T_t + (2.0 / gamma) * math.log(1.0 + gamma / k)
        return max(spread, self.config.min_spread)

    def generate_quotes(self, mid_price: float, t: float = 0.5) -> Quote:
        """Generate optimal bid/ask quotes."""
        if self.toxicity_score > self.config.toxicity_threshold:
            return Quote(
                bid_price=0, ask_price=0, bid_size=0, ask_size=0,
                mid_price=mid_price, reservation_price=mid_price,
                spread=0, should_cancel=True, confidence=0.0,
                reason=f"Toxicity {self.toxicity_score:.2f} > threshold"
            )

        if self.inventory >= self.config.max_inventory:
            return self._inventory_limited_quote(mid_price, t, ask_only=True)
        if self.inventory <= -self.config.max_inventory:
            return self._inventory_limited_quote(mid_price, t, ask_only=False)

        return self._normal_quote(mid_price, t)

    def _inventory_limited_quote(self, mid_price: float, t: float, ask_only: bool) -> Quote:
        """Generate one-sided quote when at max inventory."""
        r = self._reservation_price(mid_price, t)
        spread = self._optimal_spread(self._last_sigma, t)
        if ask_only:
            ask = r + spread / 2
            return Quote(0, ask, 0, 1.0, mid_price, r, spread, confidence=50, reason="Max long inventory, ask only")
        bid = r - spread / 2
        return Quote(bid, 0, 1.0, 0, mid_price, r, spread, confidence=50, reason="Max short inventory, bid only")

    def _normal_quote(self, mid_price: float, t: float) -> Quote:
        """Generate normal two-sided quote with inventory skew."""
        r = self._reservation_price(mid_price, t)
        spread = min(max(self._optimal_spread(self._last_sigma, t), self.config.min_spread), self.config.max_spread)
        bid = r - spread / 2
        ask = r + spread / 2
        bid_size, ask_size = self._compute_inventory_sizes()
        self.order_count += 1
        confidence = max(0, 100 - (spread / self.config.max_spread) * 50 - self.toxicity_score * 30)
        return Quote(
            bid_price=bid, ask_price=ask, bid_size=bid_size, ask_size=ask_size,
            mid_price=mid_price, reservation_price=r, spread=spread,
            confidence=confidence,
            reason=f"Inv={self.inventory:.2f} spread={spread:.6f} toxic={self.toxicity_score:.2f}"
        )

    def _compute_inventory_sizes(self) -> tuple[float, float]:
        """Compute inventory-skewed bid/ask sizes."""
        inv_ratio = abs(self.inventory) / self.config.max_inventory if self.config.max_inventory > 0 else 0
        base_size = 1.0
        if self.inventory > 0:
            return base_size * (1.0 - inv_ratio * self.config.inventory_skew), base_size * (1.0 + inv_ratio * self.config.inventory_skew)
        if self.inventory < 0:
            return base_size * (1.0 + inv_ratio * self.config.inventory_skew), base_size * (1.0 - inv_ratio * self.config.inventory_skew)
        return base_size, base_size

    def on_fill(self, side: str, qty: float, price: float) -> None:
        """Record a fill and update realized PnL using average cost basis.

        Handles position direction changes (inventory crossing zero) by
        splitting the fill into a closing portion (realizes PnL) and an
        opening portion (updates avg_entry_price for the new direction).
        """
        if side == "BUY":
            if self.inventory < 0:
                self._close_short(qty, price)
            else:
                self._open_long(qty, price)
        else:
            if self.inventory > 0:
                self._close_long(qty, price)
            else:
                self._open_short(qty, price)
        self.fill_count += 1

    def _close_short(self, qty: float, price: float) -> None:
        """Close short position (BUY fills against negative inventory)."""
        close_qty = min(qty, -self.inventory)
        self.total_pnl += close_qty * (self._avg_entry_price - price)
        self.inventory += close_qty
        remaining = qty - close_qty
        if remaining > 0:
            self.inventory += remaining
            self._avg_entry_price = price
        elif abs(self.inventory) < 1e-12:
            self._avg_entry_price = 0.0

    def _open_long(self, qty: float, price: float) -> None:
        """Open or add to long position (BUY fills with non-negative inventory)."""
        total_cost = self._avg_entry_price * self.inventory + price * qty
        self.inventory += qty
        if self.inventory != 0:
            self._avg_entry_price = total_cost / self.inventory

    def _close_long(self, qty: float, price: float) -> None:
        """Close long position (SELL fills against positive inventory)."""
        close_qty = min(qty, self.inventory)
        self.total_pnl += close_qty * (price - self._avg_entry_price)
        self.inventory -= close_qty
        remaining = qty - close_qty
        if remaining > 0:
            self.inventory -= remaining
            self._avg_entry_price = price
        elif abs(self.inventory) < 1e-12:
            self._avg_entry_price = 0.0

    def _open_short(self, qty: float, price: float) -> None:
        """Open or add to short position (SELL fills with non-positive inventory)."""
        prev_short = abs(self.inventory)
        total_cost = self._avg_entry_price * prev_short + price * qty
        self.inventory -= qty
        if self.inventory != 0:
            self._avg_entry_price = total_cost / abs(self.inventory)

    def analyze(self, symbol: str, candles: list[dict]) -> Signal:
        """Convert market making state to a signal (for monitoring)."""
        if not candles:
            return Signal(
                symbol=symbol, direction=SignalDirection.NEUTRAL,
                confidence=0, strategy=self.name, entry_price=0,
                stop_loss=0, take_profit=0, reason="No data",
            )

        price = candles[-1]["close"] if isinstance(candles[-1], dict) else candles[-1].close
        quote = self.generate_quotes(price)

        if quote.should_cancel:
            return Signal(
                symbol=symbol, direction=SignalDirection.NEUTRAL,
                confidence=0, strategy=self.name, entry_price=price,
                stop_loss=0, take_profit=0, reason=quote.reason,
            )

        # Signal direction based on inventory
        if self.inventory > self.config.max_inventory * 0.5:
            direction = SignalDirection.SHORT
            confidence = 30
            reason = f"Reducing long inventory ({self.inventory:.2f})"
        elif self.inventory < -self.config.max_inventory * 0.5:
            direction = SignalDirection.LONG
            confidence = 30
            reason = f"Reducing short inventory ({self.inventory:.2f})"
        else:
            direction = SignalDirection.NEUTRAL
            confidence = int(quote.confidence)
            reason = f"Quoting bid={quote.bid_price:.2f} ask={quote.ask_price:.2f}"

        return Signal(
            symbol=symbol, direction=direction,
            confidence=confidence, strategy=self.name,
            entry_price=price, stop_loss=0, take_profit=0,
            reason=reason,
        )

    def get_stats(self) -> dict:
        fill_rate = self.fill_count / max(self.order_count, 1)
        return {
            "inventory": self.inventory,
            "fill_count": self.fill_count,
            "order_count": self.order_count,
            "fill_rate": fill_rate,
            "toxicity": self.toxicity_score,
            "total_pnl": self.total_pnl,
        }
