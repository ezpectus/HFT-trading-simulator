"""Tests for portfolio rebalancing."""
import numpy as np
import pytest
from src.portfolio.rebalancing import (
    RebalanceTrigger, RebalanceOrder, RebalanceResult, RebalancingStrategy,
)


class TestRebalancing:
    def test_rebalance_trigger_enum(self):
        assert RebalanceTrigger.TIME_BASED.value == "time_based"
        assert RebalanceTrigger.DRIFT_BASED.value == "drift_based"
        assert RebalanceTrigger.VOLATILITY_BASED.value == "volatility_based"

    def test_rebalance_order_dataclass(self):
        order = RebalanceOrder(
            asset_index=0, current_weight=0.3, target_weight=0.5,
            trade_amount=1000, side="BUY",
        )
        assert order.asset_index == 0
        assert order.side == "BUY"

    def test_rebalancing_strategy_creation(self):
        strategy = RebalancingStrategy()
        assert strategy is not None

    def test_rebalance_drift_based(self):
        strategy = RebalancingStrategy()
        current = np.array([0.4, 0.3, 0.3])
        target = np.array([0.5, 0.25, 0.25])
        result = strategy.rebalance(current, target, total_value=10000)
        assert isinstance(result, RebalanceResult)
        assert len(result.orders) > 0
