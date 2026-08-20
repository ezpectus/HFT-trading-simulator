"""Core signal types — Signal and SignalDirection.

All strategies produce Signal objects with direction, confidence, and SL/TP levels.
"""
from dataclasses import dataclass
from enum import Enum


class SignalDirection(Enum):
    LONG = "LONG"
    SHORT = "SHORT"
    NEUTRAL = "NEUTRAL"


@dataclass
class Signal:
    """Trading signal from a strategy."""

    symbol: str
    direction: SignalDirection
    confidence: float          # 0-100
    strategy: str              # strategy name
    entry_price: float
    stop_loss: float
    take_profit: float
    reason: str = ""
    timestamp: int = 0

    @property
    def is_actionable(self) -> bool:
        return self.direction != SignalDirection.NEUTRAL

    @property
    def rr_ratio(self) -> float:
        if self.direction == SignalDirection.LONG:
            risk = self.entry_price - self.stop_loss
            reward = self.take_profit - self.entry_price
        elif self.direction == SignalDirection.SHORT:
            risk = self.stop_loss - self.entry_price
            reward = self.entry_price - self.take_profit
        else:
            return 0.0
        return reward / risk if risk > 0 else 0.0

    def to_dict(self) -> dict:
        return {
            "symbol": self.symbol,
            "direction": self.direction.value,
            "confidence": self.confidence,
            "strategy": self.strategy,
            "entry_price": self.entry_price,
            "stop_loss": self.stop_loss,
            "take_profit": self.take_profit,
            "reason": self.reason,
            "timestamp": self.timestamp,
            "rr_ratio": self.rr_ratio,
        }
