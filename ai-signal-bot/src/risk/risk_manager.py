"""Risk manager with trailing stop loss and breakeven move logic.

Manages open positions by dynamically adjusting stop loss:
- Trailing stop: moves SL as price moves favorably, maintaining a fixed distance
- Breakeven move: moves SL to entry price after price reaches a threshold
- ATR-based trailing: uses candle volatility for adaptive SL distance

Usage:
    from src.risk.risk_manager import RiskManager, RiskConfig

    rm = RiskManager(RiskConfig(
        trailing_stop_enabled=True,
        trailing_distance_pct=2.0,
        breakeven_enabled=True,
        breakeven_trigger_pct=1.0,
    ))

    # On each candle update:
    new_sl = rm.update_stop_loss(position, current_price, candle)
"""
import logging
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger("ai_signal_bot.risk_manager")


@dataclass
class RiskConfig:
    """Configuration for risk manager."""
    # Trailing stop
    trailing_stop_enabled: bool = True
    trailing_distance_pct: float = 2.0  # distance from current price as %
    trailing_atr_multiplier: float = 0.0  # if > 0, use ATR-based distance instead of fixed %

    # Breakeven move
    breakeven_enabled: bool = True
    breakeven_trigger_pct: float = 1.0  # move SL to entry when price moves this % in favor
    breakeven_buffer_pct: float = 0.1  # small buffer above entry for LONG (below for SHORT)

    # Partial take profit
    partial_tp_enabled: bool = False
    partial_tp_pct: float = 50.0  # close 50% of position at first TP level
    partial_tp_trigger_pct: float = 2.0  # trigger partial TP at this % profit

    # Max hold time (in candles)
    max_hold_candles: int = 0  # 0 = disabled


@dataclass
class PositionRiskState:
    """Tracks risk management state for a position."""
    entry_price: float
    side: str  # "LONG" or "SHORT"
    original_stop_loss: float
    current_stop_loss: float
    take_profit: float
    quantity: float
    peak_price: float = 0.0  # best price seen since entry
    trough_price: float = 0.0  # worst price seen since entry
    breakeven_moved: bool = False
    partial_tp_executed: bool = False
    candles_held: int = 0
    atr: float = 0.0


class RiskManager:
    """Manages position risk with trailing stops and breakeven moves.

    Called on each candle update to potentially adjust the stop loss
    of an open position.
    """

    def __init__(self, config: RiskConfig | None = None):
        self.config = config or RiskConfig()

    def init_position(
        self,
        entry_price: float,
        side: str,
        stop_loss: float,
        take_profit: float,
        quantity: float,
        atr: float = 0.0,
    ) -> PositionRiskState:
        """Initialize risk tracking state for a new position."""
        state = PositionRiskState(
            entry_price=entry_price,
            side=side.upper(),
            original_stop_loss=stop_loss,
            current_stop_loss=stop_loss,
            take_profit=take_profit,
            quantity=quantity,
            peak_price=entry_price,
            trough_price=entry_price,
            atr=atr,
        )
        logger.debug(
            f"RiskManager: init {side} pos entry={entry_price} "
            f"SL={stop_loss} TP={take_profit} qty={quantity}"
        )
        return state

    def update(
        self,
        state: PositionRiskState,
        current_price: float,
        candle: dict | None = None,
    ) -> dict:
        """Update risk state and return actions.

        Args:
            state: Position risk state
            current_price: Current market price
            candle: Current candle dict (for ATR, high/low)

        Returns:
            Dict with possible keys:
                - new_stop_loss: float (if SL was adjusted)
                - close_position: bool (if position should be closed)
                - close_reason: str
                - partial_close_pct: float (if partial TP triggered)
        """
        actions = {}
        state.candles_held += 1

        # Track peak/trough
        if state.side == "LONG":
            state.peak_price = max(state.peak_price, current_price)
            state.trough_price = min(state.trough_price, current_price) if state.trough_price > 0 else current_price
        else:
            # For SHORT: peak = best (lowest) price, trough = worst (highest) price
            state.peak_price = min(state.peak_price, current_price) if state.peak_price > 0 else current_price
            state.trough_price = max(state.trough_price, current_price)

        # Recalculate ATR if candle provided
        if candle and self.config.trailing_atr_multiplier > 0:
            state.atr = self._calc_atr_from_candle(candle)

        # Breakeven move
        if self.config.breakeven_enabled and not state.breakeven_moved:
            new_sl = self._check_breakeven(state, current_price)
            if new_sl is not None:
                state.current_stop_loss = new_sl
                state.breakeven_moved = True
                actions["new_stop_loss"] = new_sl
                logger.info(
                    f"RiskManager: breakeven moved to {new_sl} "
                    f"({state.side} entry={state.entry_price})"
                )

        # Trailing stop
        if self.config.trailing_stop_enabled:
            new_sl = self._check_trailing(state, current_price)
            if new_sl is not None:
                state.current_stop_loss = new_sl
                actions["new_stop_loss"] = new_sl
                logger.debug(
                    f"RiskManager: trailing SL -> {new_sl} "
                    f"({state.side} price={current_price})"
                )

        # Partial take profit
        if self.config.partial_tp_enabled and not state.partial_tp_executed:
            pct = self._check_partial_tp(state, current_price)
            if pct > 0:
                state.partial_tp_executed = True
                actions["partial_close_pct"] = pct
                logger.info(
                    f"RiskManager: partial TP {pct}% "
                    f"({state.side} price={current_price})"
                )

        # Max hold time
        if self.config.max_hold_candles > 0 and state.candles_held >= self.config.max_hold_candles:
            actions["close_position"] = True
            actions["close_reason"] = "MAX_HOLD_TIME"
            logger.info(f"RiskManager: max hold time reached ({state.candles_held} candles)")

        return actions

    def _check_breakeven(
        self, state: PositionRiskState, current_price: float
    ) -> Optional[float]:
        """Check if stop loss should be moved to breakeven."""
        if state.entry_price <= 0:
            return None
        trigger = self.config.breakeven_trigger_pct
        buffer = self.config.breakeven_buffer_pct

        if state.side == "LONG":
            price_move_pct = (current_price - state.entry_price) / state.entry_price * 100
            if price_move_pct >= trigger:
                be_sl = state.entry_price * (1 + buffer / 100)
                # Only move SL up, never down
                if be_sl > state.current_stop_loss:
                    return be_sl
        else:
            price_move_pct = (state.entry_price - current_price) / state.entry_price * 100
            if price_move_pct >= trigger:
                be_sl = state.entry_price * (1 - buffer / 100)
                # Only move SL down, never up
                if be_sl < state.current_stop_loss:
                    return be_sl

        return None

    def _check_trailing(
        self, state: PositionRiskState, current_price: float
    ) -> Optional[float]:
        """Check if trailing stop should be updated."""
        if self.config.trailing_atr_multiplier > 0 and state.atr > 0:
            distance = state.atr * self.config.trailing_atr_multiplier
        else:
            distance = current_price * self.config.trailing_distance_pct / 100

        if state.side == "LONG":
            new_sl = current_price - distance
            # Only move SL up
            if new_sl > state.current_stop_loss:
                return new_sl
        else:
            new_sl = current_price + distance
            # Only move SL down
            if new_sl < state.current_stop_loss:
                return new_sl

        return None

    def _check_partial_tp(
        self, state: PositionRiskState, current_price: float
    ) -> float:
        """Check if partial take profit should be triggered. Returns % to close."""
        if state.entry_price <= 0:
            return 0.0
        trigger = self.config.partial_tp_trigger_pct

        if state.side == "LONG":
            price_move_pct = (current_price - state.entry_price) / state.entry_price * 100
        else:
            price_move_pct = (state.entry_price - current_price) / state.entry_price * 100

        if price_move_pct >= trigger:
            return self.config.partial_tp_pct

        return 0.0

    @staticmethod
    def _calc_atr_from_candle(candle: dict) -> float:
        """Estimate ATR from a single candle (simplified)."""
        high = candle.get("high", 0)
        low = candle.get("low", 0)
        close = candle.get("close", 0)
        prev_close = candle.get("prev_close", close)

        tr = max(
            high - low,
            abs(high - prev_close),
            abs(low - prev_close),
        )
        return tr
