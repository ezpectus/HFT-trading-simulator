"""Kelly Criterion position sizing — optimal bet size for long-term growth.

The Kelly Criterion calculates the optimal fraction of capital to risk
on each trade based on historical win rate and payoff ratio.

Kelly fraction: f* = (p * b - q) / b
where:
    p = probability of winning
    q = 1 - p (probability of losing)
    b = win/loss ratio (avg win / avg loss)

In practice, a "half-Kelly" or "quarter-Kelly" is used to reduce variance
and protect against estimation errors.

Usage:
    from src.risk.kelly import KellyPositionSizer

    sizer = KellyPositionSizer(
        win_rate=0.55,
        avg_win=100,
        avg_loss=80,
        kelly_fraction=0.5,  # Half-Kelly
        max_risk_pct=5.0,
    )
    size = sizer.calculate(balance=10000, entry=65000, stop_loss=63000)
"""
import logging
from dataclasses import dataclass

logger = logging.getLogger("ai_signal_bot.kelly")


@dataclass
class KellyResult:
    """Result of Kelly position sizing."""
    quantity: float
    risk_amount: float
    kelly_fraction: float
    raw_kelly: float
    adjusted_kelly: float
    reason: str


class KellyPositionSizer:
    """Kelly Criterion-based position sizing.

    Calculates optimal position size using the Kelly Criterion,
    with configurable safety adjustments.
    """

    def __init__(
        self,
        win_rate: float = 0.5,
        avg_win: float = 100.0,
        avg_loss: float = 100.0,
        kelly_fraction: float = 0.5,    # 0.5 = half-Kelly
        max_risk_pct: float = 5.0,      # max % of balance to risk per trade
        min_risk_pct: float = 0.5,      # minimum risk per trade
        max_position_pct: float = 100.0, # max % of balance for position notional
    ):
        self.win_rate = win_rate
        self.avg_win = avg_win
        self.avg_loss = avg_loss
        self.kelly_fraction = kelly_fraction
        self.max_risk_pct = max_risk_pct
        self.min_risk_pct = min_risk_pct
        self.max_position_pct = max_position_pct

    def update_stats(self, win_rate: float, avg_win: float, avg_loss: float) -> None:
        """Update win/loss statistics from recent trade history."""
        self.win_rate = win_rate
        self.avg_win = avg_win
        self.avg_loss = avg_loss
        logger.debug(f"Kelly stats updated: win_rate={win_rate:.2f}, avg_win={avg_win:.2f}, avg_loss={avg_loss:.2f}")

    def compute_kelly(self) -> float:
        """Compute raw Kelly fraction.

        Returns:
            Kelly fraction (0 to 1). Negative means no edge — don't trade.
        """
        p = self.win_rate
        q = 1.0 - p
        b = self.avg_win / self.avg_loss if self.avg_loss > 0 else 0

        if b <= 0:
            return 0.0

        kelly = (p * b - q) / b
        return max(0.0, kelly)

    def calculate(
        self,
        balance: float,
        entry_price: float,
        stop_loss: float,
        confidence: float = 1.0,
    ) -> KellyResult:
        """Calculate position size using Kelly Criterion."""
        raw_kelly = self.compute_kelly()

        if raw_kelly <= 0:
            return KellyResult(0.0, 0.0, self.kelly_fraction, raw_kelly, 0.0, "No edge (Kelly <= 0)")

        adjusted, confidence_factor = self._adjust_kelly(raw_kelly, confidence)
        risk_amount = self._compute_risk_amount(balance, adjusted, confidence_factor)
        risk_per_unit = abs(entry_price - stop_loss)

        if risk_per_unit <= 0:
            return KellyResult(0.0, 0.0, self.kelly_fraction, raw_kelly, adjusted, "Invalid stop loss distance")

        quantity, risk_amount, reason = self._cap_position(
            risk_amount, risk_per_unit, entry_price, balance,
            confidence_factor, raw_kelly, adjusted,
        )

        logger.debug(f"Kelly sizing: raw={raw_kelly:.3f} adj={adjusted:.3f} risk=${risk_amount:.2f} qty={quantity:.4f}")

        return KellyResult(quantity, risk_amount, self.kelly_fraction, raw_kelly, adjusted, reason)

    def _adjust_kelly(self, raw_kelly: float, confidence: float) -> tuple[float, float]:
        """Apply Kelly fraction and confidence scaling. Returns (adjusted, confidence_factor)."""
        adjusted = raw_kelly * self.kelly_fraction
        confidence_factor = max(0.1, min(1.0, confidence / 100.0)) if confidence > 1.0 else confidence
        adjusted *= confidence_factor
        return adjusted, confidence_factor

    def _compute_risk_amount(
        self, balance: float, adjusted: float, confidence_factor: float,
    ) -> float:
        """Compute risk amount from adjusted Kelly."""
        risk_pct = min(adjusted * 100, self.max_risk_pct)
        if adjusted > 0 and confidence_factor >= 0.5:
            risk_pct = max(risk_pct, self.min_risk_pct)
        return balance * risk_pct / 100.0

    def _cap_position(
        self, risk_amount: float, risk_per_unit: float, entry_price: float,
        balance: float, confidence_factor: float, raw_kelly: float, adjusted: float,
    ) -> tuple[float, float, str]:
        """Cap position at max notional. Returns (quantity, risk_amount, reason)."""
        quantity = risk_amount / risk_per_unit
        effective_max_position_pct = self.max_position_pct * confidence_factor
        max_notional = balance * effective_max_position_pct / 100.0
        max_qty = max_notional / entry_price if entry_price > 0 else 0
        if quantity > max_qty:
            quantity = max_qty
            risk_amount = quantity * risk_per_unit
            reason = (
                f"Kelly: {raw_kelly:.3f} → {adjusted:.3f} "
                f"(Capped at max position {effective_max_position_pct:.1f}%)"
            )
        else:
            reason = f"Kelly: {raw_kelly:.3f} → {adjusted:.3f} (fraction={self.kelly_fraction})"
        return quantity, risk_amount, reason

    @staticmethod
    def from_trade_history(
        trades: list,
        kelly_fraction: float = 0.5,
        max_risk_pct: float = 5.0,
        min_trades: int = 10,
    ) -> "KellyPositionSizer":
        """Create a KellyPositionSizer from trade history."""
        if len(trades) < min_trades:
            logger.info(f"Insufficient trades ({len(trades)} < {min_trades}), using defaults")
            return KellyPositionSizer(kelly_fraction=kelly_fraction, max_risk_pct=max_risk_pct)

        wins = [t for t in trades if (t.get("pnl", 0) if isinstance(t, dict) else getattr(t, "pnl", 0)) > 0]
        losses = [t for t in trades if (t.get("pnl", 0) if isinstance(t, dict) else getattr(t, "pnl", 0)) < 0]

        win_rate = len(wins) / len(trades) if trades else 0.5
        _pnl = lambda t: t.get("pnl", 0) if isinstance(t, dict) else getattr(t, "pnl", 0)
        avg_win = sum(_pnl(t) for t in wins) / len(wins) if wins else 0
        avg_loss = abs(sum(_pnl(t) for t in losses) / len(losses)) if losses else 1

        return KellyPositionSizer(
            win_rate=win_rate,
            avg_win=avg_win,
            avg_loss=avg_loss,
            kelly_fraction=kelly_fraction,
            max_risk_pct=max_risk_pct,
        )
