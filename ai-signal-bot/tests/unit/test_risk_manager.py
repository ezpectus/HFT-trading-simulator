"""Tests for RiskManager — trailing stop, breakeven, partial TP, max hold."""
import pytest

from src.risk.risk_manager import PositionRiskState, RiskConfig, RiskManager


@pytest.fixture
def rm():
    return RiskManager(RiskConfig(
        trailing_stop_enabled=True,
        trailing_distance_pct=2.0,
        breakeven_enabled=True,
        breakeven_trigger_pct=1.0,
        breakeven_buffer_pct=0.1,
        partial_tp_enabled=True,
        partial_tp_pct=50.0,
        partial_tp_trigger_pct=2.0,
        max_hold_candles=0,
    ))


@pytest.fixture
def long_state(rm):
    return rm.init_position(
        entry_price=100.0, side="LONG",
        stop_loss=98.0, take_profit=104.0,
        quantity=1.0, atr=1.0,
    )


@pytest.fixture
def short_state(rm):
    return rm.init_position(
        entry_price=100.0, side="SHORT",
        stop_loss=102.0, take_profit=96.0,
        quantity=1.0, atr=1.0,
    )


class TestInitPosition:
    def test_long_init(self, rm):
        state = rm.init_position(100, "long", 98, 104, 1.0)
        assert state.side == "LONG"
        assert state.entry_price == 100
        assert state.current_stop_loss == 98
        assert state.peak_price == 100
        assert state.trough_price == 100
        assert state.breakeven_moved is False

    def test_short_init(self, rm):
        state = rm.init_position(100, "short", 102, 96, 1.0)
        assert state.side == "SHORT"
        assert state.current_stop_loss == 102

    def test_uppercase_side(self, rm):
        state = rm.init_position(100, "Long", 98, 104, 1.0)
        assert state.side == "LONG"


class TestTrailingStop:
    def test_long_trailing_moves_up(self, rm, long_state):
        # Price moves up to 102 → trailing SL = 102 * (1 - 0.02) = 99.96
        actions = rm.update(long_state, 102.0)
        assert "new_stop_loss" in actions
        assert actions["new_stop_loss"] > 98.0  # moved up from original

    def test_long_trailing_does_not_move_down(self, rm, long_state):
        # Price drops below entry — trailing SL should not move below current
        actions = rm.update(long_state, 97.0)
        # Trailing SL = 97 * 0.98 = 95.06 < 98, so no move
        # Breakeven also not triggered
        assert "new_stop_loss" not in actions or actions["new_stop_loss"] >= 98.0

    def test_short_trailing_moves_down(self, rm, short_state):
        # Price moves down to 98 → trailing SL = 98 * (1 + 0.02) = 99.96
        actions = rm.update(short_state, 98.0)
        assert "new_stop_loss" in actions
        assert actions["new_stop_loss"] < 102.0  # moved down from original

    def test_short_trailing_does_not_move_up(self, rm, short_state):
        # Price rises — trailing SL should not move above current
        actions = rm.update(short_state, 103.0)
        assert "new_stop_loss" not in actions or actions["new_stop_loss"] <= 102.0


class TestBreakeven:
    def test_long_breakeven_triggered(self, rm):
        rm.config.trailing_stop_enabled = False  # isolate breakeven
        state = rm.init_position(100, "LONG", 98, 104, 1.0)
        # Price moves 1% in favor → trigger breakeven
        actions = rm.update(state, 101.0)
        assert "new_stop_loss" in actions
        # BE SL = 100 * (1 + 0.001) = 100.1
        assert actions["new_stop_loss"] == pytest.approx(100.1, rel=1e-3)
        assert state.breakeven_moved is True

    def test_long_breakeven_not_triggered_below_threshold(self, rm):
        rm.config.trailing_stop_enabled = False
        state = rm.init_position(100, "LONG", 98, 104, 1.0)
        # Price moves only 0.5% — below 1% trigger
        actions = rm.update(state, 100.5)
        assert "new_stop_loss" not in actions
        assert state.breakeven_moved is False

    def test_short_breakeven_triggered(self, rm):
        rm.config.trailing_stop_enabled = False
        state = rm.init_position(100, "SHORT", 102, 96, 1.0)
        # Price moves 1% in favor (down) → trigger breakeven
        actions = rm.update(state, 99.0)
        assert "new_stop_loss" in actions
        # BE SL = 100 * (1 - 0.001) = 99.9
        assert actions["new_stop_loss"] == pytest.approx(99.9, rel=1e-3)

    def test_breakeven_only_once(self, rm):
        rm.config.trailing_stop_enabled = False
        state = rm.init_position(100, "LONG", 98, 104, 1.0)
        rm.update(state, 101.0)
        assert state.breakeven_moved is True
        # Second update should not trigger breakeven again
        rm.update(state, 102.0)
        # breakeven_moved is True, so _check_breakeven won't be called
        assert state.breakeven_moved is True


class TestPartialTakeProfit:
    def test_long_partial_tp_triggered(self, rm):
        rm.config.trailing_stop_enabled = False
        rm.config.breakeven_enabled = False
        state = rm.init_position(100, "LONG", 98, 104, 1.0)
        # Price moves 2% → trigger partial TP
        actions = rm.update(state, 102.0)
        assert "partial_close_pct" in actions
        assert actions["partial_close_pct"] == 50.0
        assert state.partial_tp_executed is True

    def test_partial_tp_not_triggered_below_threshold(self, rm):
        rm.config.trailing_stop_enabled = False
        rm.config.breakeven_enabled = False
        state = rm.init_position(100, "LONG", 98, 104, 1.0)
        actions = rm.update(state, 101.5)  # 1.5% < 2% trigger
        assert "partial_close_pct" not in actions

    def test_partial_tp_only_once(self, rm):
        rm.config.trailing_stop_enabled = False
        rm.config.breakeven_enabled = False
        state = rm.init_position(100, "LONG", 98, 104, 1.0)
        rm.update(state, 102.0)
        assert state.partial_tp_executed is True
        actions = rm.update(state, 103.0)
        assert "partial_close_pct" not in actions


class TestMaxHoldTime:
    def test_max_hold_triggers_close(self):
        rm = RiskManager(RiskConfig(
            trailing_stop_enabled=False,
            breakeven_enabled=False,
            partial_tp_enabled=False,
            max_hold_candles=3,
        ))
        state = rm.init_position(100, "LONG", 98, 104, 1.0)
        rm.update(state, 100.0)  # candle 1
        rm.update(state, 100.0)  # candle 2
        actions = rm.update(state, 100.0)  # candle 3 = max
        assert actions.get("close_position") is True
        assert actions.get("close_reason") == "MAX_HOLD_TIME"

    def test_max_hold_disabled_by_default(self, rm, long_state):
        actions = rm.update(long_state, 100.0)
        assert "close_position" not in actions


class TestATRTrailing:
    def test_atr_based_trailing_long(self):
        rm = RiskManager(RiskConfig(
            trailing_stop_enabled=True,
            trailing_atr_multiplier=2.0,
            trailing_distance_pct=0,  # disabled
            breakeven_enabled=False,
            partial_tp_enabled=False,
        ))
        state = rm.init_position(100, "LONG", 95, 110, 1.0, atr=2.0)
        # Trailing SL = 102 - (2.0 * 2.0) = 98
        actions = rm.update(state, 102.0)
        assert "new_stop_loss" in actions
        assert actions["new_stop_loss"] == pytest.approx(98.0, rel=1e-3)

    def test_atr_updated_from_candle(self):
        rm = RiskManager(RiskConfig(
            trailing_stop_enabled=True,
            trailing_atr_multiplier=1.5,
            breakeven_enabled=False,
            partial_tp_enabled=False,
        ))
        state = rm.init_position(100, "LONG", 95, 110, 1.0, atr=1.0)
        candle = {"high": 103, "low": 99, "close": 102, "prev_close": 100}
        rm.update(state, 102.0, candle)
        # ATR should be updated: TR = max(103-99, |103-100|, |99-100|) = 4
        assert state.atr == 4.0


class TestUpdateActions:
    def test_empty_actions_when_nothing_triggers(self):
        rm = RiskManager(RiskConfig(
            trailing_stop_enabled=False,
            breakeven_enabled=False,
            partial_tp_enabled=False,
            max_hold_candles=0,
        ))
        state = rm.init_position(100, "LONG", 98, 104, 1.0)
        actions = rm.update(state, 100.0)
        assert actions == {}

    def test_candles_held_increments(self, rm, long_state):
        assert long_state.candles_held == 0
        rm.update(long_state, 100.0)
        assert long_state.candles_held == 1
        rm.update(long_state, 100.0)
        assert long_state.candles_held == 2

    def test_peak_price_tracking_long(self, rm, long_state):
        rm.update(long_state, 101.0)
        assert long_state.peak_price == 101.0
        rm.update(long_state, 99.0)
        assert long_state.peak_price == 101.0  # peak doesn't decrease


def _make_state(entry=100, side="LONG", sl=95, tp=110, qty=1.0, atr=0.0):
    """Direct PositionRiskState construction — complements the rm.init_position fixtures."""
    return PositionRiskState(
        entry_price=entry,
        side=side,
        original_stop_loss=sl,
        current_stop_loss=sl,
        take_profit=tp,
        quantity=qty,
        peak_price=entry,
        trough_price=entry,
        atr=atr,
    )


class TestBreakevenTrailingInteraction:
    """Ported from legacy tests/test_risk_manager.py (S268) — the only file
    that exercised breakeven+trailing together and the wrong-direction guard."""

    def test_breakeven_never_moves_sl_wrong_direction(self):
        rm = RiskManager(RiskConfig(breakeven_enabled=True, breakeven_trigger_pct=1.0,
                                    breakeven_buffer_pct=0.0))
        state = _make_state(entry=100, side="LONG", sl=101)  # SL already above entry
        actions = rm.update(state, current_price=102)
        if "new_stop_loss" in actions:
            assert actions["new_stop_loss"] >= 101

    def test_breakeven_then_trailing(self):
        """Breakeven fires first, then trailing continues from new SL."""
        rm = RiskManager(RiskConfig(
            breakeven_enabled=True,
            breakeven_trigger_pct=1.0,
            breakeven_buffer_pct=0.0,
            trailing_stop_enabled=True,
            trailing_distance_pct=2.0,
        ))
        state = _make_state(entry=100, side="LONG", sl=95)
        rm.update(state, current_price=102)
        assert state.breakeven_moved is True
        assert state.current_stop_loss >= 100
        actions = rm.update(state, current_price=105)
        assert "new_stop_loss" in actions
        assert abs(actions["new_stop_loss"] - 102.9) < 0.01


class TestPeakTroughTracking:
    """Ported from legacy tests/test_risk_manager.py (S268) — SHORT-side and
    trough tracking that the rewrite only covered for LONG peaks."""

    def test_long_trough_tracks_lowest(self):
        rm = RiskManager(RiskConfig(trailing_stop_enabled=False, breakeven_enabled=False))
        state = _make_state(entry=100, side="LONG", sl=95)
        rm.update(state, current_price=98)
        rm.update(state, current_price=96)
        rm.update(state, current_price=99)
        assert state.trough_price == 96

    def test_short_peak_tracks_lowest(self):
        """For SHORT, peak = best (lowest) price."""
        rm = RiskManager(RiskConfig(trailing_stop_enabled=False, breakeven_enabled=False))
        state = _make_state(entry=100, side="SHORT", sl=105)
        rm.update(state, current_price=95)
        rm.update(state, current_price=97)
        rm.update(state, current_price=92)
        assert state.peak_price == 92

    def test_short_trough_tracks_highest(self):
        """Regression: For SHORT, trough = worst (highest) price, not lowest."""
        rm = RiskManager(RiskConfig(trailing_stop_enabled=False, breakeven_enabled=False))
        state = _make_state(entry=100, side="SHORT", sl=105)
        rm.update(state, current_price=103)
        rm.update(state, current_price=106)
        rm.update(state, current_price=101)
        assert state.trough_price == 106


class TestCalcAtrFromCandle:
    """Ported from legacy tests/test_risk_manager.py (S268) — TR edge cases."""

    def test_atr_with_gap(self):
        candle = {"high": 110, "low": 105, "close": 108, "prev_close": 95}
        atr = RiskManager._calc_atr_from_candle(candle)
        # TR = max(110-105, |110-95|, |105-95|) = max(5, 15, 10) = 15
        assert atr == 15

    def test_atr_missing_prev_close(self):
        candle = {"high": 105, "low": 98, "close": 102}
        atr = RiskManager._calc_atr_from_candle(candle)
        # prev_close defaults to close=102; TR = max(7, 3, 4) = 7
        assert atr == 7
