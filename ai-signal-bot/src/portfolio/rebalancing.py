# Portfolio Rebalancing
#
# Implements portfolio rebalancing strategies including time-based, drift-based,
# and volatility-based rebalancing triggers.

from dataclasses import dataclass
from enum import Enum

import numpy as np


class RebalanceTrigger(Enum):
    """Types of rebalancing triggers."""
    TIME_BASED = "time_based"
    DRIFT_BASED = "drift_based"
    VOLATILITY_BASED = "volatility_based"


@dataclass
class RebalanceOrder:
    """Order for portfolio rebalancing."""
    asset_index: int
    current_weight: float
    target_weight: float
    trade_amount: float
    side: str  # "BUY" or "SELL"


@dataclass
class RebalanceResult:
    """Result of portfolio rebalancing."""
    orders: list[RebalanceOrder]
    new_weights: np.ndarray
    turnover: float
    estimated_cost: float


class RebalancingStrategy:
    """Portfolio rebalancing strategy."""

    def __init__(self, transaction_cost: float = 0.001):
        self.transaction_cost = transaction_cost

    def calculate_drift(self, current_weights: np.ndarray, target_weights: np.ndarray) -> np.ndarray:
        return current_weights - target_weights

    def calculate_turnover(self, current_weights: np.ndarray, target_weights: np.ndarray) -> float:
        return 0.5 * np.sum(np.abs(target_weights - current_weights))

    def should_rebalance_time_based(self, last_rebalance_time: float, rebalance_interval: float,
                                   current_time: float) -> bool:
        return (current_time - last_rebalance_time) >= rebalance_interval

    def should_rebalance_drift_based(self, current_weights: np.ndarray, target_weights: np.ndarray,
                                    max_drift: float = 0.05) -> bool:
        drift = self.calculate_drift(current_weights, target_weights)
        max_absolute_drift = np.max(np.abs(drift))
        return bool(max_absolute_drift > max_drift)

    def should_rebalance_volatility_based(self, current_volatility: float,
                                         target_volatility: float,
                                         max_volatility_drift: float = 0.1) -> bool:
        if target_volatility == 0:
            return current_volatility > max_volatility_drift
        volatility_drift = abs(current_volatility - target_volatility) / target_volatility
        return volatility_drift > max_volatility_drift

    def generate_rebalance_orders(self, current_weights: np.ndarray, target_weights: np.ndarray,
                                 portfolio_value: float) -> list[RebalanceOrder]:
        orders = []

        for i in range(len(current_weights)):
            current_weight = current_weights[i]
            target_weight = target_weights[i]

            # Skip if weights are close
            if abs(current_weight - target_weight) < 0.01:
                continue

            trade_amount = (target_weight - current_weight) * portfolio_value

            if trade_amount > 0:
                side = "BUY"
            else:
                side = "SELL"
                trade_amount = abs(trade_amount)

            orders.append(RebalanceOrder(
                asset_index=i,
                current_weight=current_weight,
                target_weight=target_weight,
                trade_amount=trade_amount,
                side=side
            ))

        return orders

    def execute_rebalance(self, current_weights: np.ndarray, target_weights: np.ndarray,
                        portfolio_value: float) -> RebalanceResult:
        orders = self.generate_rebalance_orders(current_weights, target_weights, portfolio_value)

        # Calculate turnover
        turnover = self.calculate_turnover(current_weights, target_weights)

        # Calculate estimated cost
        total_trade_value = sum(order.trade_amount for order in orders)
        estimated_cost = total_trade_value * self.transaction_cost

        # Calculate new weights (assuming perfect execution)
        new_weights = target_weights.copy()

        return RebalanceResult(
            orders=orders,
            new_weights=new_weights,
            turnover=turnover,
            estimated_cost=estimated_cost
        )

    def should_rebalance(self, current_weights: np.ndarray, target_weights: np.ndarray,
                       trigger_type: RebalanceTrigger,
                       last_rebalance_time: float | None = None,
                       rebalance_interval: float | None = None,
                       current_time: float | None = None,
                       current_volatility: float | None = None,
                       target_volatility: float | None = None,
                       max_drift: float = 0.05,
                       max_volatility_drift: float = 0.1) -> bool:
        """Check if rebalancing should occur based on trigger type."""
        if trigger_type == RebalanceTrigger.TIME_BASED:
            if last_rebalance_time is None or rebalance_interval is None or current_time is None:
                return False
            return self.should_rebalance_time_based(last_rebalance_time, rebalance_interval, current_time)

        elif trigger_type == RebalanceTrigger.DRIFT_BASED:
            return self.should_rebalance_drift_based(current_weights, target_weights, max_drift)

        elif trigger_type == RebalanceTrigger.VOLATILITY_BASED:
            if current_volatility is None or target_volatility is None:
                return False
            return self.should_rebalance_volatility_based(
                current_volatility, target_volatility, max_volatility_drift
            )

        return False
