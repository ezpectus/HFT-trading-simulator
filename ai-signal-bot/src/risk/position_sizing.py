# Dynamic Position Sizing
#
# Implements dynamic position sizing based on volatility, risk parity, and Kelly criterion
# with support for position limits and risk-based adjustments.

from dataclasses import dataclass

import numpy as np

from src.risk.kelly import KellyPositionSizer


@dataclass
class PositionSizingResult:
    """Result of position sizing calculation."""
    position_size: float
    position_value: float
    risk_amount: float
    leverage: float
    method: str


class DynamicPositionSizer:
    """Dynamic position sizer with multiple strategies."""

    def __init__(self, account_value: float = 100000, max_position_size: float = 0.2):
        self.account_value = account_value
        self.max_position_size = max_position_size

    def calculate_position_size(self, signal: str, price: float,
                                volatility: float | None = None,
                                risk_per_trade: float = 0.02,
                                method: str = 'volatility') -> PositionSizingResult:
        """Calculate position size based on specified method."""
        if signal == 'HOLD':
            return PositionSizingResult(
                position_size=0,
                position_value=0,
                risk_amount=0,
                leverage=0,
                method=method
            )

        if method == 'volatility':
            return self.volatility_based_sizing(signal, price, volatility, risk_per_trade)
        elif method == 'risk_parity':
            return self.risk_parity_sizing(signal, price, risk_per_trade)
        elif method == 'kelly':
            return self.kelly_criterion_sizing(signal, price, volatility, risk_per_trade=risk_per_trade)
        else:
            raise ValueError(f"Unknown method: {method}")

    def volatility_based_sizing(self, signal: str, price: float,
                                volatility: float,
                                risk_per_trade: float = 0.02) -> PositionSizingResult:
        """Calculate position size based on volatility scaling."""
        if price <= 0 or self.account_value <= 0 or volatility is None or volatility <= 0:
            return PositionSizingResult(
                position_size=0, position_value=0,
                risk_amount=0, leverage=0, method='volatility'
            )

        # Convert annual volatility to daily
        daily_volatility = volatility / np.sqrt(365)

        # Risk amount
        risk_amount = self.account_value * risk_per_trade

        # Position size based on volatility (inverse relationship)
        if daily_volatility > 0:
            position_size = risk_amount / (price * daily_volatility)
        else:
            position_size = risk_amount / price

        # Apply max position limit
        max_size = (self.account_value * self.max_position_size) / price
        position_size = min(position_size, max_size)

        position_value = position_size * price
        leverage = position_value / self.account_value if self.account_value > 0 else 0.0

        return PositionSizingResult(
            position_size=position_size,
            position_value=position_value,
            risk_amount=risk_amount,
            leverage=leverage,
            method='volatility'
        )

    def risk_parity_sizing(self, signal: str, price: float,
                          risk_per_trade: float = 0.02) -> PositionSizingResult:
        """Calculate position size based on risk parity (equal risk contribution)."""
        if price <= 0 or self.account_value <= 0:
            return PositionSizingResult(
                position_size=0, position_value=0,
                risk_amount=0, leverage=0, method='risk_parity'
            )

        # Equal risk allocation
        risk_amount = self.account_value * risk_per_trade

        # Assume 2% stop loss for risk parity
        stop_loss_percentage = 0.02

        # Position size = risk / (price * stop_loss)
        position_size = risk_amount / (price * stop_loss_percentage)

        # Apply max position limit
        max_size = (self.account_value * self.max_position_size) / price
        position_size = min(position_size, max_size)

        position_value = position_size * price
        leverage = position_value / self.account_value if self.account_value > 0 else 0.0

        return PositionSizingResult(
            position_size=position_size,
            position_value=position_value,
            risk_amount=risk_amount,
            leverage=leverage,
            method='risk_parity'
        )

    def kelly_criterion_sizing(self, signal: str, price: float,
                              volatility: float,
                              expected_return: float = 0.15,
                              risk_per_trade: float = 0.02) -> PositionSizingResult:
        """Calculate position size using Kelly criterion via KellyPositionSizer."""
        if price <= 0 or self.account_value <= 0 or volatility is None or volatility <= 0:
            return PositionSizingResult(
                position_size=0, position_value=0,
                risk_amount=0, leverage=0, method='kelly'
            )

        kelly = KellyPositionSizer(
            max_risk_pct=risk_per_trade * 100,
            max_position_pct=self.max_position_size * 100,
        )
        risk_free_rate = 0.02
        kelly_fraction = max(0.0, min(
            (expected_return - risk_free_rate) / (volatility ** 2), 0.25
        ))
        stop_loss = price * (1 - volatility / np.sqrt(365) * 2)
        result = kelly.calculate(
            balance=self.account_value,
            entry_price=price,
            stop_loss=stop_loss,
            confidence=kelly_fraction * 100,
        )

        position_size = result.quantity
        position_value = position_size * price
        leverage = position_value / self.account_value if self.account_value > 0 else 0.0

        return PositionSizingResult(
            position_size=position_size, position_value=position_value,
            risk_amount=result.risk_amount, leverage=leverage, method='kelly'
        )

    def adjust_for_correlation(self, position_sizes: np.ndarray,
                             correlation_matrix: np.ndarray) -> np.ndarray:
        """Adjust position sizes based on correlation (reduce correlated exposure)."""
        n_assets = len(position_sizes)
        adjusted_sizes = position_sizes.copy()

        for i in range(n_assets):
            # Calculate average correlation with other positions (exclude self-correlation)
            correlations = np.delete(correlation_matrix[i, :], i)
            avg_correlation = np.mean(np.abs(correlations)) if len(correlations) > 0 else 0.0

            # Reduce position size if highly correlated
            if avg_correlation > 0.7:
                adjustment_factor = 1 - (avg_correlation - 0.7) * 2
                adjustment_factor = max(adjustment_factor, 0.5)
                adjusted_sizes[i] *= adjustment_factor

        return np.array(adjusted_sizes)

    def enforce_position_limits(self, position_sizes: np.ndarray,
                                max_single_position: float = 0.2,
                                max_total_exposure: float = 1.0) -> np.ndarray:
        """Enforce position limits."""
        position_values = position_sizes * self.account_value

        # Enforce single position limit
        max_single_value = self.account_value * max_single_position
        position_values = np.minimum(position_values, max_single_value)

        # Enforce total exposure limit
        total_exposure = np.sum(position_values)
        if total_exposure > self.account_value * max_total_exposure:
            scale_factor = (self.account_value * max_total_exposure) / total_exposure if total_exposure > 0 else 0.0
            position_values *= scale_factor

        return position_values / self.account_value if self.account_value > 0 else position_values * 0
