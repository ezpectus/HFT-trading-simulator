"""Tests for LiquidationEngineV2 — liquidation price, partial/full liquidation,
insurance fund, cascade, ADL, margin calculation correctness.

Includes regression tests for margin calculation bug (original_qty) and
insurance fund profit logic (min(x,0) → direct addition).
"""
import pytest
import time

from exchange_simulator.liquidation_engine_v2 import (
    LiquidationEngineV2, Position, LiquidationType,
)


def make_long_position(qty=1.0, entry=50000, leverage=10, margin=None):
    return Position(
        symbol="BTC/USDT", side="long", qty=qty, entry_price=entry,
        leverage=leverage, margin=margin or (entry * qty / leverage),
    )


def make_short_position(qty=1.0, entry=50000, leverage=10, margin=None):
    return Position(
        symbol="BTC/USDT", side="short", qty=qty, entry_price=entry,
        leverage=leverage, margin=margin or (entry * qty / leverage),
    )


class TestComputeLiqPrice:
    def test_long_liquidation_price(self):
        engine = LiquidationEngineV2(maintenance_margin_rate=0.005)
        pos = make_long_position(entry=50000, leverage=10)
        liq = engine.compute_liq_price(pos)
        # 50000 * (1 - 1/10 + 0.005) = 50000 * 0.905 = 45250
        assert liq == pytest.approx(45250.0)

    def test_short_liquidation_price(self):
        engine = LiquidationEngineV2(maintenance_margin_rate=0.005)
        pos = make_short_position(entry=50000, leverage=10)
        liq = engine.compute_liq_price(pos)
        # 50000 * (1 + 1/10 - 0.005) = 50000 * 1.095 = 54750
        assert liq == pytest.approx(54750.0)

    def test_zero_leverage_returns_zero(self):
        engine = LiquidationEngineV2()
        pos = Position(symbol="X", side="long", qty=1, entry_price=100, leverage=0, margin=100)
        assert engine.compute_liq_price(pos) == 0.0

    def test_liquidation_price_never_negative(self):
        engine = LiquidationEngineV2()
        pos = make_long_position(entry=10, leverage=100)
        liq = engine.compute_liq_price(pos)
        assert liq >= 0.0


class TestCheckLiquidation:
    def test_long_liquidated_when_price_below_liq(self):
        engine = LiquidationEngineV2()
        pos = make_long_position(entry=50000, leverage=10)
        assert engine.check_liquidation(pos, 45000) is True

    def test_long_not_liquidated_when_price_above_liq(self):
        engine = LiquidationEngineV2()
        pos = make_long_position(entry=50000, leverage=10)
        assert engine.check_liquidation(pos, 46000) is False

    def test_short_liquidated_when_price_above_liq(self):
        engine = LiquidationEngineV2()
        pos = make_short_position(entry=50000, leverage=10)
        assert engine.check_liquidation(pos, 55000) is True

    def test_short_not_liquidated_when_price_below_liq(self):
        engine = LiquidationEngineV2()
        pos = make_short_position(entry=50000, leverage=10)
        assert engine.check_liquidation(pos, 54000) is False


class TestUnrealizedPnL:
    def test_long_profit(self):
        engine = LiquidationEngineV2()
        pos = make_long_position(qty=1.0, entry=50000)
        pnl = engine.compute_unrealized_pnl(pos, 51000)
        assert pnl == pytest.approx(1000.0)

    def test_long_loss(self):
        engine = LiquidationEngineV2()
        pos = make_long_position(qty=1.0, entry=50000)
        pnl = engine.compute_unrealized_pnl(pos, 49000)
        assert pnl == pytest.approx(-1000.0)

    def test_short_profit(self):
        engine = LiquidationEngineV2()
        pos = make_short_position(qty=1.0, entry=50000)
        pnl = engine.compute_unrealized_pnl(pos, 49000)
        assert pnl == pytest.approx(1000.0)


class TestMarginRatio:
    def test_healthy_position(self):
        engine = LiquidationEngineV2()
        pos = make_long_position(qty=1.0, entry=50000, leverage=10, margin=5000)
        ratio = engine.compute_margin_ratio(pos, 50000)
        # equity = 5000 + 0 = 5000, notional = 50000
        assert ratio == pytest.approx(0.1)

    def test_zero_notional_returns_zero(self):
        engine = LiquidationEngineV2()
        pos = make_long_position(qty=0, entry=50000, leverage=10, margin=5000)
        ratio = engine.compute_margin_ratio(pos, 50000)
        assert ratio == 0.0


class TestPartialLiquidation:
    def test_partial_reduces_qty(self):
        engine = LiquidationEngineV2(partial_liq_ratio=0.5)
        pos = make_long_position(qty=1.0, entry=50000, leverage=10, margin=5000)
        original_qty = pos.qty
        event = engine.liquidate(pos, 45000)
        assert event is not None
        assert event.liq_type == LiquidationType.PARTIAL
        assert pos.qty < original_qty
        assert pos.qty == pytest.approx(0.5)

    def test_partial_margin_calculation_correct(self):
        """Regression test: margin should use original_qty, not reduced qty."""
        engine = LiquidationEngineV2(partial_liq_ratio=0.5)
        pos = make_long_position(qty=1.0, entry=50000, leverage=10, margin=5000)
        engine.liquidate(pos, 45000)
        # pnl = (45000 - 50000) * 1.0 = -5000
        # margin_ratio = 0.5 / 1.0 = 0.5
        # new_margin = max(5000 + (-5000) * 0.5, 0) = max(2500, 0) = 2500
        assert pos.margin == pytest.approx(2500.0)

    def test_full_liquidation_closes_all(self):
        engine = LiquidationEngineV2()
        pos = make_long_position(qty=1.0, entry=50000, leverage=10, margin=5000)
        event = engine.liquidate(pos, 45000, force_full=True)
        assert event.liq_type == LiquidationType.FULL
        assert pos.qty == pytest.approx(0.0)

    def test_zero_qty_returns_none(self):
        engine = LiquidationEngineV2()
        pos = make_long_position(qty=0, entry=50000, leverage=10, margin=0)
        assert engine.liquidate(pos, 45000) is None


class TestInsuranceFund:
    def test_insurance_fund_decreases_on_loss(self):
        engine = LiquidationEngineV2(insurance_fund_initial=100000)
        pos = make_long_position(qty=1.0, entry=50000, leverage=10, margin=5000)
        initial_fund = engine.get_insurance_fund()
        engine.liquidate(pos, 45000, force_full=True)
        assert engine.get_insurance_fund() < initial_fund

    def test_insurance_fund_increases_on_profit(self):
        """Regression test: profitable liquidation should add to insurance fund."""
        engine = LiquidationEngineV2(insurance_fund_initial=100000)
        pos = make_short_position(qty=1.0, entry=50000, leverage=10, margin=5000)
        initial_fund = engine.get_insurance_fund()
        # Short position at 45000 → pnl = (50000 - 45000) * 1 = +5000 (profit)
        engine.liquidate(pos, 45000, force_full=True)
        assert engine.get_insurance_fund() > initial_fund

    def test_insurance_fund_history_tracked(self):
        engine = LiquidationEngineV2(insurance_fund_initial=100000)
        pos = make_long_position(qty=1.0, entry=50000, leverage=10, margin=5000)
        engine.liquidate(pos, 45000, force_full=True)
        assert len(engine.insurance_fund_history) > 0


class TestCascade:
    def test_cascade_processes_multiple_positions(self):
        engine = LiquidationEngineV2()
        positions = [
            make_long_position(qty=1.0, entry=50000, leverage=10, margin=5000),
            make_long_position(qty=0.5, entry=50000, leverage=10, margin=2500),
        ]
        events = engine.process_cascade(positions, 45000, "BTC/USDT")
        assert len(events) > 0

    def test_cascade_ignores_other_symbols(self):
        engine = LiquidationEngineV2()
        positions = [
            make_long_position(qty=1.0, entry=50000, leverage=10, margin=5000),
            Position(symbol="ETH/USDT", side="long", qty=1.0, entry=3000,
                     leverage=10, margin=300),
        ]
        events = engine.process_cascade(positions, 45000, "BTC/USDT")
        for e in events:
            assert e.symbol == "BTC/USDT"

    def test_cascade_depth_capped(self):
        engine = LiquidationEngineV2()
        engine._max_cascade_depth = 2
        positions = [make_long_position(qty=1.0, entry=50000, leverage=10, margin=5000)]
        events = engine.process_cascade(positions, 45000, "BTC/USDT")
        # Should not loop forever
        assert len(events) <= 10


class TestStats:
    def test_stats_structure(self):
        engine = LiquidationEngineV2()
        stats = engine.get_stats()
        assert "insurance_fund" in stats
        assert "total_liquidations" in stats
        assert "full" in stats
        assert "partial" in stats
        assert "cascade" in stats
        assert "adl" in stats
        assert "total_loss" in stats

    def test_stats_after_liquidation(self):
        engine = LiquidationEngineV2()
        pos = make_long_position(qty=1.0, entry=50000, leverage=10, margin=5000)
        engine.liquidate(pos, 45000, force_full=True)
        stats = engine.get_stats()
        assert stats["total_liquidations"] == 1
        assert stats["full"] == 1


class TestMarginRatioCorrectness:
    """Regression tests for original_qty bug: margin_ratio was computed
    with qty_to_close + pos.qty instead of just pos.qty."""

    def test_full_liquidation_margin_ratio_is_1(self):
        """Full liquidation: margin_ratio should be 1.0 (100% of position closed)."""
        engine = LiquidationEngineV2(insurance_fund_initial=100000)
        pos = make_long_position(qty=1.0, entry=50000, leverage=10, margin=5000)
        engine.liquidate(pos, 45000, force_full=True)
        # pnl = (45000 - 50000) * 1.0 = -5000
        # margin_ratio = 1.0 (full close)
        # new_margin = max(5000 + (-5000) * 1.0, 0) = max(0, 0) = 0
        assert pos.margin == pytest.approx(0.0)

    def test_partial_liquidation_margin_ratio_is_half(self):
        """Partial (50%) liquidation: margin_ratio should be 0.5."""
        engine = LiquidationEngineV2(partial_liq_ratio=0.5, insurance_fund_initial=100000)
        pos = make_long_position(qty=2.0, entry=50000, leverage=10, margin=10000)
        engine.liquidate(pos, 45000)
        # pnl = (45000 - 50000) * 2.0 = -10000
        # margin_ratio = 1.0 / 2.0 = 0.5
        # new_margin = max(10000 + (-10000) * 0.5, 0) = max(5000, 0) = 5000
        assert pos.margin == pytest.approx(5000.0)

    def test_full_liquidation_insurance_fund_correct(self):
        """Full liquidation profit: insurance fund gets full pnl * 1.0."""
        engine = LiquidationEngineV2(insurance_fund_initial=100000)
        pos = make_short_position(qty=1.0, entry=50000, leverage=10, margin=5000)
        initial = engine.get_insurance_fund()
        # Short at 45000 → pnl = (50000 - 45000) * 1 = +5000
        # margin_ratio = 1.0 (full)
        # insurance_fund += 5000 * 1.0 = 5000
        engine.liquidate(pos, 45000, force_full=True)
        assert engine.get_insurance_fund() == pytest.approx(initial + 5000.0)

    def test_partial_liquidation_insurance_fund_correct(self):
        """Partial liquidation profit: insurance fund gets pnl * 0.5."""
        engine = LiquidationEngineV2(partial_liq_ratio=0.5, insurance_fund_initial=100000)
        pos = make_short_position(qty=2.0, entry=50000, leverage=10, margin=10000)
        initial = engine.get_insurance_fund()
        # Short at 45000 → pnl = (50000 - 45000) * 2 = +10000
        # margin_ratio = 1.0 / 2.0 = 0.5
        # insurance_fund += 10000 * 0.5 = 5000
        engine.liquidate(pos, 45000)
        assert engine.get_insurance_fund() == pytest.approx(initial + 5000.0)
