"""
Realistic order book simulation — depth profiles, spoofing, icebergs,
queue positions, and adverse selection.

Features:
- Power-law volume decay from mid price
- Spoofing: fake large orders that cancel before execution
- Iceberg orders: hidden quantity with partial reveal
- Queue position tracking (FIFO fill priority)
- Adverse selection: toxic flow moves price post-fill
"""

from __future__ import annotations

import numpy as np
import time
from dataclasses import dataclass, field
from typing import Optional
from collections import deque
from enum import Enum

import logging
logger = logging.getLogger(__name__)


class OrderType(Enum):
    NORMAL = 0
    SPOOF = 1
    ICEBERG = 2
    MARKET = 3


@dataclass
class BookOrder:
    """Single order in the order book."""
    order_id: int
    price: float
    quantity: float
    visible_qty: float           # For icebergs, visible portion
    hidden_qty: float            # Hidden portion
    order_type: OrderType
    timestamp: float
    queue_position: int          # FIFO position at this price level
    is_bid: bool
    cancel_prob: float = 0.0     # Probability of cancellation (spoof orders have high prob)


@dataclass
class PriceLevel:
    """Aggregated price level in the book."""
    price: float
    total_visible_qty: float = 0.0
    orders: deque = field(default_factory=deque)
    next_queue_pos: int = 0

    def add_order(self, order: BookOrder) -> None:
        order.queue_position = self.next_queue_pos
        self.next_queue_pos += 1
        self.orders.append(order)
        self.total_visible_qty += order.visible_qty

    def remove_order(self, order_id: int) -> Optional[BookOrder]:
        for i, o in enumerate(self.orders):
            if o.order_id == order_id:
                self.total_visible_qty -= o.visible_qty
                self.orders.rotate(-i)
                removed = self.orders.popleft()
                self.orders.rotate(i)
                return removed
        return None

    def fill_from_front(self, qty: float) -> list[tuple[BookOrder, float]]:
        """Fill orders from front of queue (FIFO). Returns list of (order, filled_qty) tuples."""
        filled = []
        remaining = qty
        while remaining > 0 and self.orders:
            front = self.orders[0]
            available = front.visible_qty
            fill_qty = min(remaining, available)

            front.visible_qty -= fill_qty
            self.total_visible_qty -= fill_qty
            remaining -= fill_qty
            filled.append((front, fill_qty))

            # Reveal hidden quantity for iceberg orders
            if front.order_type == OrderType.ICEBERG and front.visible_qty <= 0 and front.hidden_qty > 0:
                reveal = min(front.hidden_qty, front.quantity * 0.1)
                front.visible_qty = reveal
                front.hidden_qty -= reveal
                self.total_visible_qty += reveal
            elif front.visible_qty <= 0:
                self.orders.popleft()
        return filled


class OrderBookRealism:
    """Realistic L2 order book with spoofing, icebergs, and adverse selection."""

    def __init__(self, symbol: str = "BTCUSDT", tick_size: float = 0.5,
                 num_levels: int = 20, base_qty: float = 1.0):
        self.symbol = symbol
        self.tick_size = tick_size
        self.num_levels = num_levels
        self.base_qty = base_qty
        self._rng = np.random.default_rng(seed=42)
        self._next_order_id = 1

        self.bids: dict[float, PriceLevel] = {}
        self.asks: dict[float, PriceLevel] = {}

        self.mid_price: float = 50000.0
        self.spread: float = tick_size * 2

        # Adverse selection tracking
        self.recent_fills: list[dict] = []
        self.toxic_flow_score: float = 0.0

        # Spoofing stats
        self.spoof_orders_active: int = 0
        self.spoof_orders_cancelled: int = 0

    def _next_id(self) -> int:
        oid = self._next_order_id
        self._next_order_id += 1
        return oid

    def update_mid_price(self, new_mid: float) -> None:
        self.mid_price = new_mid

    def generate_depth_profile(self) -> None:
        """Generate realistic order book depth using power-law decay."""
        self.bids.clear()
        self.asks.clear()

        for i in range(self.num_levels):
            # Power-law: volume decays as 1/(1 + alpha * level)
            alpha = 0.15
            base_vol = self.base_qty / (1.0 + alpha * i)

            # Add noise
            bid_vol = base_vol * self._rng.lognormal(0, 0.3)
            ask_vol = base_vol * self._rng.lognormal(0, 0.3)

            bid_price = self.mid_price - self.spread / 2 - i * self.tick_size
            ask_price = self.mid_price + self.spread / 2 + i * self.tick_size

            # Create levels
            self.bids[bid_price] = PriceLevel(price=bid_price)
            self.asks[ask_price] = PriceLevel(price=ask_price)

            # Add normal orders
            bid_order = BookOrder(
                order_id=self._next_id(), price=bid_price, quantity=bid_vol,
                visible_qty=bid_vol, hidden_qty=0, order_type=OrderType.NORMAL,
                timestamp=time.time(), queue_position=0, is_bid=True
            )
            ask_order = BookOrder(
                order_id=self._next_id(), price=ask_price, quantity=ask_vol,
                visible_qty=ask_vol, hidden_qty=0, order_type=OrderType.NORMAL,
                timestamp=time.time(), queue_position=0, is_bid=False
            )
            self.bids[bid_price].add_order(bid_order)
            self.asks[ask_price].add_order(ask_order)

        # Occasionally add spoof orders
        if self._rng.random() < 0.15:
            self._add_spoof_order()

        # Occasionally add iceberg orders
        if self._rng.random() < 0.10:
            self._add_iceberg_order()

    def _add_spoof_order(self) -> None:
        """Add a fake large order that will likely cancel."""
        is_bid = self._rng.random() < 0.5
        level_idx = self._rng.integers(0, min(5, self.num_levels))
        side_book = self.bids if is_bid else self.asks

        if is_bid:
            price = self.mid_price - self.spread / 2 - level_idx * self.tick_size
        else:
            price = self.mid_price + self.spread / 2 + level_idx * self.tick_size

        if price not in side_book:
            side_book[price] = PriceLevel(price=price)

        spoof_qty = self.base_qty * self._rng.uniform(5, 20)
        spoof_order = BookOrder(
            order_id=self._next_id(), price=price, quantity=spoof_qty,
            visible_qty=spoof_qty, hidden_qty=0, order_type=OrderType.SPOOF,
            timestamp=time.time(), queue_position=0, is_bid=is_bid,
            cancel_prob=self._rng.uniform(0.7, 0.95)
        )
        side_book[price].add_order(spoof_order)
        self.spoof_orders_active += 1

    def _add_iceberg_order(self) -> None:
        """Add an iceberg order with hidden quantity."""
        is_bid = self._rng.random() < 0.5
        level_idx = self._rng.integers(0, min(3, self.num_levels))
        side_book = self.bids if is_bid else self.asks

        if is_bid:
            price = self.mid_price - self.spread / 2 - level_idx * self.tick_size
        else:
            price = self.mid_price + self.spread / 2 + level_idx * self.tick_size

        if price not in side_book:
            side_book[price] = PriceLevel(price=price)

        total_qty = self.base_qty * self._rng.uniform(3, 10)
        visible = total_qty * self._rng.uniform(0.1, 0.3)
        hidden = total_qty - visible

        iceberg = BookOrder(
            order_id=self._next_id(), price=price, quantity=total_qty,
            visible_qty=visible, hidden_qty=hidden, order_type=OrderType.ICEBERG,
            timestamp=time.time(), queue_position=0, is_bid=is_bid
        )
        side_book[price].add_order(iceberg)

    def process_spoof_cancellations(self) -> int:
        """Cancel spoof orders based on their cancel probability."""
        cancelled = 0
        for side_book in [self.bids, self.asks]:
            to_remove = []
            for price, level in side_book.items():
                for order in list(level.orders):
                    if order.order_type == OrderType.SPOOF and self._rng.random() < order.cancel_prob:
                        level.remove_order(order.order_id)
                        cancelled += 1
                        self.spoof_orders_cancelled += 1
                if level.total_visible_qty <= 0:
                    to_remove.append(price)
            for p in to_remove:
                del side_book[p]
        self.spoof_orders_active -= cancelled
        return cancelled

    def match_market_order(self, side: str, qty: float) -> list[dict]:
        """Match a market order against the book. Returns list of fills."""
        fills = []
        remaining = qty
        side_book = self.asks if side == "BUY" else self.bids  # BUY takes from asks

        prices = sorted(side_book.keys())
        for price in prices:
            if remaining <= 0:
                break
            level = side_book[price]
            filled_orders = level.fill_from_front(remaining)
            for o, fill_qty in filled_orders:
                if fill_qty > 0:
                    fills.append({
                        "price": price, "qty": fill_qty, "order_id": o.order_id,
                        "timestamp": time.time(), "is_bid": o.is_bid
                    })
                    remaining -= fill_qty
                    # Track actual fill qty for adverse selection
                    self.recent_fills.append({"price": price, "qty": fill_qty, "side": side, "time": time.time()})
                    # Decrement spoof count when a spoof order is fully consumed
                    if o.order_type == OrderType.SPOOF and o.visible_qty <= 0 and o.hidden_qty <= 0:
                        self.spoof_orders_active = max(0, self.spoof_orders_active - 1)

            if level.total_visible_qty <= 0:
                del side_book[price]

        self._update_toxicity()
        return fills

    def _update_toxicity(self) -> None:
        """Compute toxic flow score from recent fills."""
        now = time.time()
        self.recent_fills = [f for f in self.recent_fills if now - f["time"] < 5.0]
        if not self.recent_fills:
            self.toxic_flow_score = 0.0
            return
        buy_vol = sum(f["qty"] for f in self.recent_fills if f["side"] == "BUY")
        sell_vol = sum(f["qty"] for f in self.recent_fills if f["side"] == "SELL")
        total = buy_vol + sell_vol
        if total > 0:
            imbalance = abs(buy_vol - sell_vol) / total
            self.toxic_flow_score = imbalance
        else:
            self.toxic_flow_score = 0.0

    def get_l2_snapshot(self, depth: int = 10) -> dict:
        """Get L2 order book snapshot."""
        bid_levels = sorted(self.bids.keys(), reverse=True)[:depth]
        ask_levels = sorted(self.asks.keys())[:depth]
        return {
            "symbol": self.symbol,
            "bids": [[p, self.bids[p].total_visible_qty] for p in bid_levels],
            "asks": [[p, self.asks[p].total_visible_qty] for p in ask_levels],
            "mid_price": self.mid_price,
            "spread": self.spread,
            "timestamp": time.time(),
            "toxicity": self.toxic_flow_score,
        }

    def best_bid(self) -> float:
        return max(self.bids.keys()) if self.bids else 0.0

    def best_ask(self) -> float:
        return min(self.asks.keys()) if self.asks else 0.0

    def get_stats(self) -> dict:
        return {
            "spoof_active": self.spoof_orders_active,
            "spoof_cancelled": self.spoof_orders_cancelled,
            "toxicity": self.toxic_flow_score,
            "bid_levels": len(self.bids),
            "ask_levels": len(self.asks),
        }
