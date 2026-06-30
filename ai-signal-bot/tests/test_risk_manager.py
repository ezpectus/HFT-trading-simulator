"""Tests for risk manager module."""
import pytest

from src.risk.risk_manager import RiskManager, RiskConfig, PositionRiskState


def make_state(entry=100, side="LONG", sl=95, tp=110, qty=1.0, atr=0.0):
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


class TestBreakeven:
    def test_breakeven_long_triggered(self):
        rm = RiskManager(RiskConfig(breakeven_enabled=True, breakeven_trigger_pct=1.0, breakeven_buffer_pct=0.1))
        state = make_state(entry=100, side="LONG", sl=95)
        actions = rm.update(state, current_price=102)  # 2% move
        assert "new_stop_loss" in actions
        assert abs(actions["new_stop_loss"] - 100.1) < 0.01  # 100 * 1.001
        assert state.breakeven_moved is True

    def test_breakeven_long_not_triggered(self):
        rm = RiskManager(RiskConfig(breakeven_enabled=True, breakeven_trigger_pct=1.0))
        state = make_state(entry=100, side="LONG", sl=95)
        actions = rm.update(state, current_price=100.5)  # 0.5% move
        assert "new_stop_loss" not in actions
        assert state.breakeven_moved is False

    def test_breakeven_short_triggered(self):
        rm = RiskManager(RiskConfig(breakeven_enabled=True, breakeven_trigger_pct=1.0, breakeven_buffer_pct=0.1))
        state = make_state(entry=100, side="SHORT", sl=105)
        actions = rm.update(state, current_price=98)  # 2% move in favor
        assert "new_stop_loss" in actions
        assert abs(actions["new_stop_loss"] - 99.9) < 0.01  # 100 * 0.999
        assert state.breakeven_moved is True

    def test_breakeven_only_moves_once(self):
        rm = RiskManager(RiskConfig(breakeven_enabled=True, breakeven_trigger_pct=1.0))
        state = make_state(entry=100, side="LONG", sl=95)
        rm.update(state, current_price=102)
        assert state.breakeven_moved is True
        # Second update should not trigger breakeven again
        actions = rm.update(state, current_price=103)
        # Trailing may update SL, but breakeven should not fire again
        # The SL should only go up from trailing
        if "new_stop_loss" in actions:
            assert actions["new_stop_loss"] >= state.current_stop_loss

    def test_breakeven_never_moves_sl_wrong_direction(self):
        rm = RiskManager(RiskConfig(breakeven_enabled=True, breakeven_trigger_pct=1.0, breakeven_buffer_pct=0.0))
        state = make_state(entry=100, side="LONG", sl=101)  # SL already above entry
        actions = rm.update(state, current_price=102)
        # Breakeven would be 100, but SL is already 101 — should not move down
        # Trailing might move it up though
        if "new_stop_loss" in actions:
            assert actions["new_stop_loss"] >= 101


class TestTrailingStop:
    def test_trailing_long_moves_up(self):
        rm = RiskManager(RiskConfig(trailing_stop_enabled=True, trailing_distance_pct=2.0))
        state = make_state(entry=100, side="LONG", sl=95)
        actions = rm.update(state, current_price=110)
        # Trailing SL = 110 - 2% = 110 - 2.2 = 107.8
        assert "new_stop_loss" in actions
        assert abs(actions["new_stop_loss"] - 107.8) < 0.01

    def test_trailing_long_does_not_move_down(self):
        rm = RiskManager(RiskConfig(trailing_stop_enabled=True, trailing_distance_pct=2.0))
        state = make_state(entry=100, side="LONG", sl=98)
        actions = rm.update(state, current_price=99)
        # Trailing SL = 99 - 1.98 = 97.02 < 98, should not move
        assert "new_stop_loss" not in actions

    def test_trailing_short_moves_down(self):
        rm = RiskManager(RiskConfig(trailing_stop_enabled=True, trailing_distance_pct=2.0))
        state = make_state(entry=100, side="SHORT", sl=105)
        actions = rm.update(state, current_price=90)
        # Trailing SL = 90 + 1.8 = 91.8 < 105, should move
        assert "new_stop_loss" in actions
        assert abs(actions["new_stop_loss"] - 91.8) < 0.01

    def test_trailing_short_does_not_move_up(self):
        rm = RiskManager(RiskConfig(trailing_stop_enabled=True, trailing_distance_pct=2.0))
        state = make_state(entry=100, side="SHORT", sl=102)
        actions = rm.update(state, current_price=101)
        # Trailing SL = 101 + 2.02 = 103.02 > 102, should not move
        assert "new_stop_loss" not in actions

    def test_trailing_atr_based(self):
        config = RiskConfig(
            trailing_stop_enabled=True,
            trailing_distance_pct=0,
            trailing_atr_multiplier=2.0,
        )
        rm = RiskManager(config)
        state = make_state(entry=100, side="LONG", sl=95, atr=3.0)
        candle = {"high": 103, "low": 97, "close": 101, "prev_close": 100}
        actions = rm.update(state, current_price=101, candle=candle)
        # ATR from candle = max(103-97, |103-100|, |97-100|) = 6
        # Trailing SL = 101 - 6*2 = 101 - 12 = 89 < 95, should not move
        # Actually let's recalculate: TR = max(6, 3, 3) = 6, SL = 101 - 12 = 89
        # 89 < 95, so SL should not move down
        assert "new_stop_loss" not in actions or actions["new_stop_loss"] >= 95


class TestPartialTakeProfit:
    def test_partial_tp_triggered(self):
        rm = RiskManager(RiskConfig(
            partial_tp_enabled=True,
            partial_tp_trigger_pct=2.0,
            partial_tp_pct=50.0,
        ))
        state = make_state(entry=100, side="LONG", sl=95)
        actions = rm.update(state, current_price=103)  # 3% profit
        assert "partial_close_pct" in actions
        assert actions["partial_close_pct"] == 50.0

    def test_partial_tp_not_triggered(self):
        rm = RiskManager(RiskConfig(
            partial_tp_enabled=True,
            partial_tp_trigger_pct=2.0,
            partial_tp_pct=50.0,
        ))
        state = make_state(entry=100, side="LONG", sl=95)
        actions = rm.update(state, current_price=101)  # 1% profit
        assert "partial_close_pct" not in actions

    def test_partial_tp_only_once(self):
        rm = RiskManager(RiskConfig(
            partial_tp_enabled=True,
            partial_tp_trigger_pct=2.0,
            partial_tp_pct=50.0,
        ))
        state = make_state(entry=100, side="LONG", sl=95)
        rm.update(state, current_price=103)
        assert state.partial_tp_executed is True
        actions = rm.update(state, current_price=104)
        assert "partial_close_pct" not in actions


class TestMaxHoldTime:
    def test_max_hold_triggers_close(self):
        rm = RiskManager(RiskConfig(max_hold_candles=5))
        state = make_state(entry=100, side="LONG", sl=95)
        for i in range(4):
            actions = rm.update(state, current_price=100)
            assert "close_position" not in actions
        actions = rm.update(state, current_price=100)
        assert actions["close_position"] is True
        assert actions["close_reason"] == "MAX_HOLD_TIME"

    def test_max_hold_disabled(self):
        rm = RiskManager(RiskConfig(max_hold_candles=0))
        state = make_state(entry=100, side="LONG", sl=95)
        for i in range(100):
            actions = rm.update(state, current_price=100)
            assert "close_position" not in actions


class TestCombined:
    def test_breakeven_then_trailing(self):
        """Breakeven fires first, then trailing continues from new SL."""
        rm = RiskManager(RiskConfig(
            breakeven_enabled=True,
            breakeven_trigger_pct=1.0,
            breakeven_buffer_pct=0.0,
            trailing_stop_enabled=True,
            trailing_distance_pct=2.0,
        ))
        state = make_state(entry=100, side="LONG", sl=95)

        # First: price moves 2% — breakeven + trailing
        actions = rm.update(state, current_price=102)
        assert state.breakeven_moved is True
        # Breakeven: SL = 100, Trailing: SL = 102 - 2.04 = 99.96
        # Breakeven fires first (SL=100), then trailing (SL=99.96 < 100, no move)
        # OR trailing fires (99.96), then breakeven (100 > 99.96, moves to 100)
        # Either way, final SL should be >= 100
        assert state.current_stop_loss >= 100

        # Price continues up
        actions = rm.update(state, current_price=105)
        # Trailing: 105 - 2.1 = 102.9 > 100, should move
        assert "new_stop_loss" in actions
        assert abs(actions["new_stop_loss"] - 102.9) < 0.01
