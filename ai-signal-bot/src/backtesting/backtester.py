"""Backtesting engine — replay historical candle data through strategies.

Loads candle data from SQLite database or CSV files, runs strategies
on historical data, and computes performance metrics.

Usage:
    from src.backtesting.backtester import Backtester
    bt = Backtester(initial_balance=10000)
    results = bt.run(candles, strategy)
    bt.print_report(results)
"""
from src.backtesting.backtest_metrics import (
    calculate_drawdown_metrics,
    calculate_trade_metrics,
    track_equity,
    update_drawdown,
)
from src.backtesting.backtest_report import (
    print_backtest_report,
    print_comparison_report,
)
from src.backtesting.results import BacktestResult, Trade  # noqa: F401 — re-exported
from src.observability.logging import get_logger
from src.risk.risk_manager import PositionRiskState, RiskConfig, RiskManager
from src.strategies.signal import Signal, SignalDirection

logger = get_logger("ai_signal_bot.backtester")


class Backtester:
    """Historical replay backtesting engine.

    Runs a strategy on historical candle data, simulating:
    - Position entry/exit based on signals
    - Stop loss / take profit execution
    - Fee calculation
    - Equity curve tracking
    - Performance metrics
    """

    def __init__(
        self,
        initial_balance: float = 10000.0,
        # Defaults match the simulator's binance venue (config.yaml
        # fee_pct=0.04, slippage_bps=2.0) so backtests price the same fills
        # the system actually trades. Raise for real-venue estimates.
        fee_pct: float = 0.04,
        slippage_bps: float = 2.0,
        leverage: int = 1,
        max_position_pct: float = 10.0,
        risk_per_trade_pct: float = 2.0,
        risk_config: RiskConfig | None = None,
        candle_interval_minutes: int = 5,
    ):
        self.initial_balance = initial_balance
        self.fee_pct = fee_pct
        self.slippage_bps = slippage_bps
        self.leverage = leverage
        self.max_position_pct = max_position_pct
        self.risk_per_trade_pct = risk_per_trade_pct
        self.risk_manager = RiskManager(risk_config) if risk_config else None
        self.candle_interval_minutes = candle_interval_minutes

    def _process_risk_update(self, current_position, risk_state, current_price,
                              current_candle, balance, result, equity_curve, peak_equity):
        """Update risk management; returns (position, risk_state, balance, skip_rest)."""
        if not (current_position and self.risk_manager and risk_state):
            return current_position, risk_state, balance, peak_equity, False
        actions = self.risk_manager.update(risk_state, current_price, current_candle)
        if "new_stop_loss" in actions:
            current_position["stop_loss"] = actions["new_stop_loss"]
        if not actions.get("close_position"):
            return current_position, risk_state, balance, peak_equity, False
        balance = self._close_position(
            current_position, current_price, actions["close_reason"], balance, result,
            timestamp=current_candle.get("timestamp", 0),
        )
        equity = balance
        equity_curve.append(equity)
        peak_equity = self._update_drawdown(equity, peak_equity, result)
        return None, None, balance, peak_equity, True

    def _manage_position_or_entry(self, current_position, risk_state, balance, strategy,
                                   symbol, window, current_price, current_candle, result):
        """Manage existing position (SL/TP, reversal) or check for new entry."""
        if current_position:
            exit_reason, exit_price = self._check_sl_tp(current_position, current_candle)
            if exit_reason:
                balance = self._close_position(
                    current_position, exit_price, exit_reason, balance, result,
                    timestamp=current_candle.get("timestamp", 0),
                )
                return None, None, balance
            return self._handle_signal_reversal(
                current_position, risk_state, balance, strategy, symbol,
                window, current_price, current_candle, result,
            )
        return self._check_entry(
            strategy, symbol, window, current_price, current_candle, balance, result,
        ) + (balance,)

    def _track_equity_and_drawdown(self, current_position, balance, current_price,
                                    equity_curve, peak_equity, result):
        """Append equity to curve and update max drawdown."""
        equity = track_equity(current_position, balance, current_price)
        equity_curve.append(equity)
        peak_equity = update_drawdown(equity, peak_equity, result)
        return peak_equity

    def run(
        self,
        candles: list[dict],
        strategy,
        symbol: str = "BTC/USDT",
        warmup: int = 50,
    ) -> BacktestResult:
        """Run backtest on historical candle data."""
        result = BacktestResult(initial_balance=self.initial_balance)
        balance = self.initial_balance
        equity_curve = [balance]
        current_position: dict | None = None
        risk_state: PositionRiskState | None = None
        peak_equity = balance

        # Rolling window: cap at 2× warmup to avoid O(N²) growing slices
        max_window = max(warmup * 2, 200)

        for i in range(warmup, len(candles)):
            start = max(0, i - max_window)
            # Signal sees only bars CLOSED before bar i; the fill happens at
            # bar i's close — decide-then-fill-on-same-bar would be lookahead.
            window = candles[start:i]
            current_candle = candles[i]
            current_price = current_candle["close"]

            current_position, risk_state, balance, peak_equity, skip = self._process_risk_update(
                current_position, risk_state, current_price, current_candle,
                balance, result, equity_curve, peak_equity,
            )
            if skip:
                continue

            current_position, risk_state, balance = self._manage_position_or_entry(
                current_position, risk_state, balance, strategy, symbol,
                window, current_price, current_candle, result,
            )
            peak_equity = self._track_equity_and_drawdown(
                current_position, balance, current_price, equity_curve, peak_equity, result,
            )

        return self._finalize_backtest(result, balance, equity_curve, current_position, candles)

    def _finalize_backtest(
        self, result: BacktestResult, balance: float, equity_curve: list,
        current_position: dict | None, candles: list[dict],
    ) -> BacktestResult:
        """Close any open position and compute final metrics."""
        if current_position:
            balance = self._close_position(
                current_position, candles[-1]["close"], "END", balance, result,
                timestamp=candles[-1].get("timestamp", 0),
            )
        result.final_balance = balance
        result.equity_curve = equity_curve
        result.total_return_pct = (balance - self.initial_balance) / self.initial_balance * 100 if self.initial_balance > 0 else 0
        calculate_trade_metrics(result)
        calculate_drawdown_metrics(
            result, equity_curve, balance,
            self.initial_balance, self.candle_interval_minutes,
        )
        return result

    def _check_sl_tp(self, pos: dict, candle: dict) -> tuple[str | None, float]:
        """Check stop-loss and take-profit conditions. Returns (exit_reason, exit_price)."""
        exit_reason = None
        exit_price = candle["close"]

        if pos["side"] == "LONG":
            if pos["stop_loss"] > 0 and candle["low"] <= pos["stop_loss"]:
                exit_price = pos["stop_loss"]
                exit_reason = "STOP_LOSS"
            elif pos["take_profit"] > 0 and candle["high"] >= pos["take_profit"]:
                exit_price = pos["take_profit"]
                exit_reason = "TAKE_PROFIT"
        else:
            if pos["stop_loss"] > 0 and candle["high"] >= pos["stop_loss"]:
                exit_price = pos["stop_loss"]
                exit_reason = "STOP_LOSS"
            elif pos["take_profit"] > 0 and candle["low"] <= pos["take_profit"]:
                exit_price = pos["take_profit"]
                exit_reason = "TAKE_PROFIT"

        return exit_reason, exit_price

    def _init_risk_state(self, current_position: dict | None) -> object | None:
        """Initialize risk state for a new position if risk manager is active."""
        if current_position and self.risk_manager:
            return self.risk_manager.init_position(
                entry_price=current_position["entry_price"],
                side=current_position["side"],
                stop_loss=current_position["stop_loss"],
                take_profit=current_position["take_profit"],
                quantity=current_position["quantity"],
            )
        return None


    def _handle_signal_reversal(
        self, current_position: dict, risk_state, balance: float,
        strategy, symbol: str, window: list, current_price: float,
        current_candle: dict, result: BacktestResult,
    ) -> tuple[dict | None, object, float]:
        """Check for signal reversal and open new position if needed."""
        signal = strategy.analyze(symbol, window)
        result.signals_generated += 1

        if signal.is_actionable:
            result.signals_valid += 1
            new_dir = signal.direction
            if (current_position["side"] == "LONG" and new_dir == SignalDirection.SHORT) or \
               (current_position["side"] == "SHORT" and new_dir == SignalDirection.LONG):
                balance = self._close_position(
                    current_position, current_price, "SIGNAL_EXIT", balance, result,
                    timestamp=current_candle.get("timestamp", 0),
                )
                current_position = self._open_position(signal, current_price, balance, result,
                    timestamp=current_candle.get("timestamp", 0), symbol=symbol)
                risk_state = self._init_risk_state(current_position)
        return current_position, risk_state, balance

    def _check_entry(
        self, strategy, symbol: str, window: list, current_price: float,
        current_candle: dict, balance: float, result: BacktestResult,
    ) -> tuple[dict | None, object]:
        """Check for entry signal when no position is open."""
        signal = strategy.analyze(symbol, window)
        result.signals_generated += 1

        if signal.is_actionable:
            result.signals_valid += 1
            current_position = self._open_position(signal, current_price, balance, result,
                timestamp=current_candle.get("timestamp", 0), symbol=symbol)
            risk_state = self._init_risk_state(current_position)
            if current_position:
                return current_position, risk_state
        return None, None


    def _open_position(self, signal: Signal, price: float, balance: float, result: BacktestResult,
                        timestamp: int = 0, symbol: str = "") -> dict:
        """Open a new position from a signal."""
        # Apply slippage
        if signal.direction == SignalDirection.LONG:
            fill_price = price * (1 + self.slippage_bps / 10000)
        else:
            fill_price = price * (1 - self.slippage_bps / 10000)

        # Position sizing
        risk_amount = balance * self.risk_per_trade_pct / 100
        risk_per_unit = abs(fill_price - signal.stop_loss)
        if risk_per_unit <= 0:
            return None

        quantity = risk_amount / risk_per_unit
        max_notional = balance * self.leverage * self.max_position_pct / 100
        max_qty = max_notional / fill_price if fill_price > 0 else 0
        quantity = min(quantity, max_qty)

        if quantity <= 0:
            return None

        # Calculate fee
        notional = fill_price * quantity
        fee = notional * self.fee_pct / 100

        return {
            "symbol": symbol,
            "side": signal.direction.value,
            "entry_price": fill_price,
            "quantity": quantity,
            "stop_loss": signal.stop_loss,
            "take_profit": signal.take_profit,
            "entry_time": timestamp,
            "fee": fee,
        }

    def _close_position(self, pos: dict, exit_price: float, reason: str,
                        balance: float, result: BacktestResult,
                        timestamp: int = 0) -> float:
        """Close a position and record the trade."""
        # Apply slippage
        if pos["side"] == "LONG":
            fill_exit = exit_price * (1 - self.slippage_bps / 10000)
            pnl = (fill_exit - pos["entry_price"]) * pos["quantity"]
        else:
            fill_exit = exit_price * (1 + self.slippage_bps / 10000)
            pnl = (pos["entry_price"] - fill_exit) * pos["quantity"]

        # Exit fee
        exit_fee = fill_exit * pos["quantity"] * self.fee_pct / 100
        total_fees = pos["fee"] + exit_fee
        pnl -= total_fees

        entry_notional = pos["entry_price"] * pos["quantity"]
        pnl_pct = pnl / entry_notional * 100 if entry_notional > 0 else 0

        trade = Trade(
            symbol=pos.get("symbol", ""),
            side=pos["side"],
            entry_price=pos["entry_price"],
            exit_price=fill_exit,
            quantity=pos["quantity"],
            entry_time=pos.get("entry_time", 0),
            exit_time=timestamp,
            pnl=pnl,
            pnl_pct=pnl_pct,
            exit_reason=reason,
            fee=total_fees,
        )
        result.trades.append(trade)

        return balance + pnl

    def print_report(self, result: BacktestResult) -> None:
        """Log a formatted backtest report."""
        print_backtest_report(result)


    def run_multi_strategy(
        self,
        candles: list[dict],
        strategies: list,
        symbol: str = "BTC/USDT",
        warmup: int = 50,
    ) -> dict[str, BacktestResult]:
        """Run backtest for multiple strategies and compare.

        Returns:
            {strategy_name: BacktestResult}
        """
        results = {}
        for i, strategy in enumerate(strategies):
            name = strategy.name if hasattr(strategy, 'name') else strategy.__class__.__name__
            unique_name = f"{name}_{i + 1}" if name in results else name
            logger.info("Backtesting %s...", unique_name)
            result = self.run(candles, strategy, symbol, warmup)
            results[unique_name] = result
        return results

    def print_comparison(self, results: dict[str, BacktestResult]) -> None:
        """Log comparison table of multiple strategy backtests."""
        print_comparison_report(results)
