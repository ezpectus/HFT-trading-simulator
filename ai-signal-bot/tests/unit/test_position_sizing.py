"""Unit tests for risk/position_sizing.py — DynamicPositionSizer with volatility, risk parity, Kelly."""

import numpy as np
import pytest

from src.risk.position_sizing import DynamicPositionSizer, PositionSizingResult


# ─── Fixtures ───


@pytest.fixture
def sizer() -> DynamicPositionSizer:
    return DynamicPositionSizer(account_value=100000, max_position_size=0.2)


# ─── HOLD Signal ───


def test_hold_signal_returns_zero(sizer: DynamicPositionSizer) -> None:
    """HOLD signal should return zero position."""
    result = sizer.calculate_position_size("HOLD", 50000)
    assert result.position_size == 0
    assert result.position_value == 0
    assert result.risk_amount == 0


# ─── Volatility-Based Sizing ───


def test_volatility_sizing_returns_positive(sizer: DynamicPositionSizer) -> None:
    """Volatility-based sizing for LONG should return positive position."""
    result = sizer.calculate_position_size("LONG", 50000, volatility=0.3, method="volatility")
    assert result.position_size > 0
    assert result.position_value > 0
    assert result.method == "volatility"


def test_volatility_sizing_respects_max_position(sizer: DynamicPositionSizer) -> None:
    """Position should not exceed max_position_size limit."""
    result = sizer.calculate_position_size("LONG", 50000, volatility=0.01, method="volatility")
    max_value = 100000 * 0.2
    assert result.position_value <= max_value + 1e-6


def test_volatility_sizing_zero_volatility_returns_zero(sizer: DynamicPositionSizer) -> None:
    """Zero volatility should return zero position (guard)."""
    result = sizer.calculate_position_size("LONG", 50000, volatility=0, method="volatility")
    assert result.position_size == 0


def test_volatility_sizing_zero_price_returns_zero(sizer: DynamicPositionSizer) -> None:
    """Zero price should return zero position (guard)."""
    result = sizer.calculate_position_size("LONG", 0, volatility=0.3, method="volatility")
    assert result.position_size == 0


# ─── Risk Parity Sizing ───


def test_risk_parity_sizing_returns_positive(sizer: DynamicPositionSizer) -> None:
    """Risk parity sizing for LONG should return positive position."""
    result = sizer.calculate_position_size("LONG", 50000, method="risk_parity")
    assert result.position_size > 0
    assert result.method == "risk_parity"


def test_risk_parity_sizing_zero_price_returns_zero(sizer: DynamicPositionSizer) -> None:
    """Zero price should return zero position (guard)."""
    result = sizer.calculate_position_size("LONG", 0, method="risk_parity")
    assert result.position_size == 0


def test_risk_parity_sizing_respects_max_position(sizer: DynamicPositionSizer) -> None:
    """Risk parity position should not exceed max_position_size."""
    result = sizer.calculate_position_size("LONG", 100, method="risk_parity")
    max_value = 100000 * 0.2
    assert result.position_value <= max_value + 1e-6


# ─── Kelly Criterion Sizing ───


def test_kelly_sizing_returns_positive(sizer: DynamicPositionSizer) -> None:
    """Kelly criterion sizing with positive edge should return positive position."""
    result = sizer.calculate_position_size("LONG", 50000, volatility=0.3, method="kelly")
    assert result.position_size > 0
    assert result.method == "kelly"


def test_kelly_sizing_zero_volatility_returns_zero(sizer: DynamicPositionSizer) -> None:
    """Zero volatility should return zero position (guard)."""
    result = sizer.calculate_position_size("LONG", 50000, volatility=0, method="kelly")
    assert result.position_size == 0


def test_kelly_sizing_caps_at_quarter_kelly(sizer: DynamicPositionSizer) -> None:
    """Kelly fraction should be capped at 0.25 (quarter Kelly)."""
    result = sizer.calculate_position_size(
        "LONG", 50000, volatility=0.01, method="kelly", risk_per_trade=0.02)
    max_value = 100000 * 0.25
    assert result.position_value <= max_value + 1e-6


def test_kelly_sizing_negative_edge_returns_zero(sizer: DynamicPositionSizer) -> None:
    """Negative edge (expected_return < risk_free_rate) should floor kelly_fraction at 0."""
    result = sizer.kelly_criterion_sizing("LONG", 50000, volatility=0.3, expected_return=0.01)
    assert result.position_size == 0


# ─── Invalid Method ───


def test_invalid_method_raises_valueerror(sizer: DynamicPositionSizer) -> None:
    """Unknown method should raise ValueError."""
    with pytest.raises(ValueError, match="Unknown method"):
        sizer.calculate_position_size("LONG", 50000, method="invalid")


# ─── Correlation Adjustment ───


def test_adjust_for_correlation_reduces_correlated_positions(sizer: DynamicPositionSizer) -> None:
    """Highly correlated positions should be reduced."""
    sizes = np.array([0.2, 0.2])
    corr = np.array([[1.0, 0.9], [0.9, 1.0]])
    adjusted = sizer.adjust_for_correlation(sizes, corr)
    assert adjusted[0] < sizes[0]
    assert adjusted[1] < sizes[1]


def test_adjust_for_correlation_keeps_uncorrelated(sizer: DynamicPositionSizer) -> None:
    """Low correlation should not reduce positions."""
    sizes = np.array([0.2, 0.2])
    corr = np.array([[1.0, 0.1], [0.1, 1.0]])
    adjusted = sizer.adjust_for_correlation(sizes, corr)
    assert adjusted[0] == pytest.approx(sizes[0])
    assert adjusted[1] == pytest.approx(sizes[1])


def test_adjust_for_correlation_excludes_self(sizer: DynamicPositionSizer) -> None:
    """Self-correlation (diagonal) should be excluded from average."""
    sizes = np.array([0.2])
    corr = np.array([[1.0]])
    adjusted = sizer.adjust_for_correlation(sizes, corr)
    assert adjusted[0] == pytest.approx(sizes[0])


# ─── Position Limits ───


def test_enforce_position_limits_single_cap(sizer: DynamicPositionSizer) -> None:
    """Single position should be capped at max_single_position."""
    sizes = np.array([0.5, 0.1])
    adjusted = sizer.enforce_position_limits(sizes, max_single_position=0.2, max_total_exposure=1.0)
    assert adjusted[0] <= 0.2 + 1e-6


def test_enforce_position_limits_total_exposure(sizer: DynamicPositionSizer) -> None:
    """Total exposure should be capped at max_total_exposure."""
    sizes = np.array([0.3, 0.3, 0.3])
    adjusted = sizer.enforce_position_limits(sizes, max_single_position=0.5, max_total_exposure=0.5)
    total = np.sum(adjusted)
    assert total <= 0.5 + 1e-6


def test_enforce_position_limits_zero_account(sizer: DynamicPositionSizer) -> None:
    """Zero account value should return all zeros."""
    sizer.account_value = 0
    sizes = np.array([0.3, 0.3])
    adjusted = sizer.enforce_position_limits(sizes)
    assert np.all(adjusted == 0)
