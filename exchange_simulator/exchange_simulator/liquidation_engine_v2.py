"""
Enhanced liquidation engine — cascade liquidations, partial liquidation,
real-time liq price estimation, insurance fund, auto-deleveraging (ADL).

Features:
- Cascade liquidations (one liquidation triggers others)
- Partial liquidation (reduce to safe margin, not full close)
- Real-time liquidation price estimation per position
- Insurance fund tracking
- Auto-deleveraging (ADL) when insurance fund depleted
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Optional
from enum import Enum
from collections import deque
import numpy as np

import logging
logger = logging.getLogger(__name__)


class LiquidationType(Enum):
    FULL = 0
    PARTIAL = 1
    ADL = 2           # Auto-deleveraging
    CASCADE = 3       # Triggered by another liquidation


@dataclass
class Position:
    symbol: str
    side: str               # "long" or "short"
    qty: float
    entry_price: float
    leverage: int
    margin: float
    liq_price: float = 0.0
    mark_price: float = 0.0
    is_isolated: bool = True


@dataclass
class LiquidationEvent:
    timestamp: float
    symbol: str
    side: str
    qty_liquidated: float
    liq_price: float
    mark_price: float
    remaining_qty: float
    liq_type: LiquidationType
    loss: float               # Loss to insurance fund
    cascade_triggered: bool = False


class LiquidationEngineV2:
    """Enhanced liquidation engine with cascades and insurance fund."""

    def __init__(self, maintenance_margin_rate: float = 0.005,
                 partial_liq_ratio: float = 0.5,
                 insurance_fund_initial: float = 100000.0):
        self.maintenance_margin_rate = maintenance_margin_rate
        self.partial_liq_ratio = partial_liq_ratio    # Fraction to close in partial liq
        self.insurance_fund = insurance_fund_initial
        self.insurance_fund_history: deque[float] = deque(maxlen=10000)
        self.events: deque[LiquidationEvent] = deque(maxlen=10000)
        self._cascade_depth = 0
        self._max_cascade_depth = 10
        self._rng = np.random.default_rng(seed=42)

    def compute_liq_price(self, pos: Position) -> float:
        """Compute liquidation price for a position."""
        if pos.leverage <= 0:
            return 0.0
        mmr = self.maintenance_margin_rate
        if pos.side == "long":
            # Liq price = entry * (1 - 1/leverage + mmr)
            liq = pos.entry_price * (1.0 - 1.0 / pos.leverage + mmr)
        else:
            # Liq price = entry * (1 + 1/leverage - mmr)
            liq = pos.entry_price * (1.0 + 1.0 / pos.leverage - mmr)
        return max(liq, 0.0)

    def update_position_mark(self, pos: Position, mark_price: float) -> None:
        """Update mark price and liquidation price for a position."""
        pos.mark_price = mark_price
        pos.liq_price = self.compute_liq_price(pos)

    def check_liquidation(self, pos: Position, mark_price: float) -> bool:
        """Check if a position should be liquidated."""
        self.update_position_mark(pos, mark_price)
        if pos.side == "long":
            return mark_price <= pos.liq_price
        else:
            return mark_price >= pos.liq_price

    def compute_unrealized_pnl(self, pos: Position, mark_price: float) -> float:
        if pos.side == "long":
            return (mark_price - pos.entry_price) * pos.qty
        else:
            return (pos.entry_price - mark_price) * pos.qty

    def compute_margin_ratio(self, pos: Position, mark_price: float) -> float:
        pnl = self.compute_unrealized_pnl(pos, mark_price)
        equity = pos.margin + pnl
        notional = pos.qty * mark_price
        if notional <= 0:
            return 0.0
        return equity / notional

    def liquidate(self, pos: Position, mark_price: float,
                  force_full: bool = False) -> Optional[LiquidationEvent]:
        """Liquidate a position. Returns liquidation event or None."""
        if pos.qty <= 0:
            return None

        pnl = self.compute_unrealized_pnl(pos, mark_price)
        loss = abs(min(pnl, 0))  # Loss to insurance fund

        # Determine liquidation type
        if force_full or self._cascade_depth > 0:
            liq_type = LiquidationType.FULL if force_full else LiquidationType.CASCADE
            qty_to_close = pos.qty
        else:
            # Try partial liquidation first
            liq_type = LiquidationType.PARTIAL
            qty_to_close = pos.qty * self.partial_liq_ratio

        # Execute liquidation
        original_qty = pos.qty  # Capture before reduction
        pos.qty -= qty_to_close
        margin_ratio = qty_to_close / original_qty if original_qty > 0 else 0.0
        pos.margin = max(pos.margin + pnl * margin_ratio, 0)

        # Update insurance fund
        if pnl < 0:
            self.insurance_fund -= loss
        else:
            # Profit from liquidated position goes to insurance fund
            self.insurance_fund += pnl * margin_ratio

        self.insurance_fund_history.append(self.insurance_fund)

        event = LiquidationEvent(
            timestamp=time.time(),
            symbol=pos.symbol,
            side=pos.side,
            qty_liquidated=qty_to_close,
            liq_price=pos.liq_price,
            mark_price=mark_price,
            remaining_qty=pos.qty,
            liq_type=liq_type,
            loss=loss,
            cascade_triggered=False,
        )
        self.events.append(event)

        logger.warning(
            f"[LiqEngine] {pos.symbol} {pos.side} liquidated: "
            f"qty={qty_to_close:.4f} type={liq_type.name} loss={loss:.2f} "
            f"remaining={pos.qty:.4f} insurance_fund={self.insurance_fund:.2f}"
        )

        # Check for ADL
        if self.insurance_fund < 0:
            self._auto_deleverage(pos, mark_price)

        return event

    def process_cascade(self, positions: list[Position], mark_price: float,
                        symbol: str) -> list[LiquidationEvent]:
        """Process cascade liquidations across all positions for a symbol."""
        events = []
        self._cascade_depth = 0

        while self._cascade_depth < self._max_cascade_depth:
            triggered = False
            for pos in positions:
                if pos.symbol != symbol or pos.qty <= 0:
                    continue
                if self.check_liquidation(pos, mark_price):
                    event = self.liquidate(pos, mark_price, force_full=False)
                    if event:
                        event.cascade_triggered = self._cascade_depth > 0
                        events.append(event)
                        triggered = True

            if not triggered:
                break
            self._cascade_depth += 1

            # Price moves further during cascade (market impact)
            impact = self._rng.normal(0, 0.001) * self._cascade_depth
            mark_price *= (1.0 + impact)

        self._cascade_depth = 0
        return events

    def _auto_deleverage(self, pos: Position, mark_price: float) -> None:
        """Auto-deleveraging: reduce profitable opposing positions."""
        logger.critical(
            f"[LiqEngine] Insurance fund depleted! Triggering ADL. "
            f"Fund={self.insurance_fund:.2f}"
        )
        # In real exchange, this would reduce profitable counterparty positions
        # For simulation, we log and reset insurance fund
        self.insurance_fund = abs(self.insurance_fund) * 0.1  # Small recovery
        event = LiquidationEvent(
            timestamp=time.time(),
            symbol=pos.symbol,
            side="adl",
            qty_liquidated=0,
            liq_price=0,
            mark_price=mark_price,
            remaining_qty=0,
            liq_type=LiquidationType.ADL,
            loss=0,
            cascade_triggered=True,
        )
        self.events.append(event)

    def get_insurance_fund(self) -> float:
        return self.insurance_fund

    def get_stats(self) -> dict:
        total_liqs = len(self.events)
        full_liqs = sum(1 for e in self.events if e.liq_type == LiquidationType.FULL)
        partial_liqs = sum(1 for e in self.events if e.liq_type == LiquidationType.PARTIAL)
        cascade_liqs = sum(1 for e in self.events if e.liq_type == LiquidationType.CASCADE)
        adl_count = sum(1 for e in self.events if e.liq_type == LiquidationType.ADL)
        total_loss = sum(e.loss for e in self.events)
        return {
            "insurance_fund": self.insurance_fund,
            "total_liquidations": total_liqs,
            "full": full_liqs,
            "partial": partial_liqs,
            "cascade": cascade_liqs,
            "adl": adl_count,
            "total_loss": total_loss,
        }
