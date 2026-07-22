"""Tests for Kelly Criterion position sizing — compute, calculate, edge cases, from_trade_history."""
from dataclasses import dataclass

import pytest

from src.risk.kelly import KellyPositionSizer, KellyResult


@dataclass
class MockTrade:
    pnl: float


@pytest.fixture
def sizer():
    return KellyPositionSizer(
        win_rate=0.55,
        avg_win=100.0,
        avg_loss=80.0,
        kelly_fraction=0.5,
        max_risk_pct=5.0,
        min_risk_pct=0.5,
        max_position_pct=20.0,
    )


class TestComputeKelly:
    def test_positive_edge(self, sizer):
        # p=0.55, b=100/80=1.25, kelly = (0.55*1.25 - 0.45) / 1.25 = (0.6875 - 0.45) / 1.25 = 0.19
        kelly = sizer.compute_kelly()
        assert kelly > 0
        assert kelly == pytest.approx(0.19, rel=0.01)

    def test_no_edge(self):
        sizer = KellyPositionSizer(win_rate=0.50, avg_win=100, avg_loss=100)
        # kelly = (0.5*1 - 0.5) / 1 = 0
        kelly = sizer.compute_kelly()
        assert kelly == pytest.approx(0.0, abs=1e-10)

    def test_negative_edge_returns_zero(self):
        sizer = KellyPositionSizer(win_rate=0.30, avg_win=100, avg_loss=100)
        # kelly = (0.3*1 - 0.7) / 1 = -0.4 → clamped to 0
        kelly = sizer.compute_kelly()
        assert kelly == 0.0

    def test_zero_avg_loss(self):
        sizer = KellyPositionSizer(win_rate=0.60, avg_win=100, avg_loss=0)
        kelly = sizer.compute_kelly()
        assert kelly == 0.0

    def test_high_win_rate(self):
        sizer = KellyPositionSizer(win_rate=0.80, avg_win=100, avg_loss=100)
        # kelly = (0.8*1 - 0.2) / 1 = 0.6
        kelly = sizer.compute_kelly()
        assert kelly == pytest.approx(0.6, rel=1e-3)


class TestCalculate:
    def test_basic_position(self, sizer):
        result = sizer.calculate(
            balance=10000, entry_price=65000, stop_loss=63000
        )
        assert isinstance(result, KellyResult)
        assert result.quantity > 0
        assert result.risk_amount > 0
        assert result.raw_kelly > 0
        assert result.adjusted_kelly > 0
        assert "Kelly" in result.reason

    def test_no_edge_returns_zero(self):
        sizer = KellyPositionSizer(win_rate=0.30, avg_win=100, avg_loss=100)
        result = sizer.calculate(balance=10000, entry_price=100, stop_loss=98)
        assert result.quantity == 0
        assert result.risk_amount == 0
        assert "No edge" in result.reason

    def test_zero_stop_distance(self, sizer):
        result = sizer.calculate(balance=10000, entry_price=100, stop_loss=100)
        assert result.quantity == 0
        assert "Invalid stop loss" in result.reason

    def test_position_capped_at_max(self):
        sizer = KellyPositionSizer(
            win_rate=0.90, avg_win=200, avg_loss=50,
            kelly_fraction=1.0, max_risk_pct=50.0,
            max_position_pct=10.0,
        )
        result = sizer.calculate(balance=10000, entry_price=100, stop_loss=99)
        # Should be capped at max_position_pct
        max_notional = 10000 * 0.10  # 10% of balance
        max_qty = max_notional / 100
        assert result.quantity <= max_qty * 1.01  # small tolerance
        assert "Capped" in result.reason

    def test_confidence_scaling(self, sizer):
        full = sizer.calculate(balance=10000, entry_price=100, stop_loss=98, confidence=1.0)
        half = sizer.calculate(balance=10000, entry_price=100, stop_loss=98, confidence=0.5)
        # Lower confidence → smaller position
        assert half.quantity < full.quantity

    def test_confidence_above_100_normalized(self, sizer):
        result = sizer.calculate(balance=10000, entry_price=100, stop_loss=98, confidence=80)
        # confidence=80 → scaled to 0.8
        assert result.quantity > 0

    def test_min_risk_enforced(self):
        sizer = KellyPositionSizer(
            win_rate=0.51, avg_win=100, avg_loss=100,
            kelly_fraction=0.01, max_risk_pct=5.0,
            min_risk_pct=2.0,
        )
        result = sizer.calculate(balance=10000, entry_price=100, stop_loss=99)
        # Even tiny Kelly should be bumped to min_risk_pct
        min_risk_amount = 10000 * 0.02
        expected_qty = min_risk_amount / 1.0  # risk_per_unit = 1
        assert result.quantity == pytest.approx(expected_qty, rel=0.1)

    def test_short_stop_loss(self, sizer):
        # Stop loss above entry (short position)
        result = sizer.calculate(balance=10000, entry_price=100, stop_loss=102)
        assert result.quantity > 0
        # risk_per_unit = |100 - 102| = 2


class TestUpdateStats:
    def test_update(self, sizer):
        sizer.update_stats(win_rate=0.65, avg_win=120, avg_loss=60)
        assert sizer.win_rate == 0.65
        assert sizer.avg_win == 120
        assert sizer.avg_loss == 60


class TestFromTradeHistory:
    def test_sufficient_trades(self):
        trades = [
            MockTrade(pnl=100), MockTrade(pnl=-50), MockTrade(pnl=80),
            MockTrade(pnl=-40), MockTrade(pnl=120), MockTrade(pnl=-60),
            MockTrade(pnl=90), MockTrade(pnl=-30), MockTrade(pnl=110),
            MockTrade(pnl=-45),
        ]
        sizer = KellyPositionSizer.from_trade_history(trades, min_trades=10)
        assert sizer.win_rate == 0.5  # 5 wins / 10 trades
        assert sizer.avg_win > 0
        assert sizer.avg_loss > 0

    def test_insufficient_trades_uses_defaults(self):
        trades = [MockTrade(pnl=100), MockTrade(pnl=-50)]
        sizer = KellyPositionSizer.from_trade_history(trades, min_trades=10)
        # Should use defaults
        assert sizer.win_rate == 0.5
        assert sizer.avg_win == 100.0
        assert sizer.avg_loss == 100.0

    def test_all_wins(self):
        trades = [MockTrade(pnl=100) for _ in range(15)]
        sizer = KellyPositionSizer.from_trade_history(trades, min_trades=10)
        assert sizer.win_rate == 1.0
        assert sizer.avg_loss == 1  # Default when no losses

    def test_all_losses(self):
        trades = [MockTrade(pnl=-50) for _ in range(15)]
        sizer = KellyPositionSizer.from_trade_history(trades, min_trades=10)
        assert sizer.win_rate == 0.0
        assert sizer.avg_win == 0  # No wins

    def test_empty_trades(self):
        sizer = KellyPositionSizer.from_trade_history([], min_trades=10)
        assert sizer.win_rate == 0.5  # Default


class TestKellyResult:
    def test_dataclass_fields(self):
        result = KellyResult(
            quantity=1.5, risk_amount=200,
            kelly_fraction=0.5, raw_kelly=0.19,
            adjusted_kelly=0.095, reason="test",
        )
        assert result.quantity == 1.5
        assert result.risk_amount == 200
        assert result.kelly_fraction == 0.5
        assert result.raw_kelly == 0.19
        assert result.adjusted_kelly == 0.095
        assert result.reason == "test"
