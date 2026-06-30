"""Backtesting engine — replay historical candle data through strategies.

Loads candle data from SQLite database or CSV files, runs strategies
on historical data, and computes performance metrics.

Usage:
    from src.backtesting.backtester import Backtester
    bt = Backtester(initial_balance=10000)
    results = bt.run(candles, strategy)
    bt.print_report(results)
"""
import logging
import math
from dataclasses import dataclass, field
from typing import Optional

from src.strategies.strategies import (
    EnsembleVoter, Signal, SignalDirection, TrendFollowingStrategy,
    MeanReversionStrategy, FFTCycleStrategy,
)
from src.technical_analysis.indicators import atr
from src.risk.risk_manager import RiskManager, RiskConfig, PositionRiskState

logger = logging.getLogger("ai_signal_bot.backtester")


@dataclass
class Trade:
    """A completed backtest trade."""
    symbol: str
    side: str  # "LONG" or "SHORT"
    entry_price: float
    exit_price: float
    quantity: float
    entry_time: int
    exit_time: int
    pnl: float
    pnl_pct: float
    exit_reason: str  # "TAKE_PROFIT", "STOP_LOSS", "SIGNAL_EXIT", "END"
    fee: float = 0.0


@dataclass
class BacktestResult:
    """Backtest performance metrics."""
    initial_balance: float = 10000.0
    final_balance: float = 10000.0
    total_return_pct: float = 0.0
    total_trades: int = 0
    winning_trades: int = 0
    losing_trades: int = 0
    win_rate: float = 0.0
    avg_win: float = 0.0
    avg_loss: float = 0.0
    profit_factor: float = 0.0
    max_drawdown_pct: float = 0.0
    sharpe_ratio: float = 0.0
    avg_trade_duration: float = 0.0
    equity_curve: list[float] = field(default_factory=list)
    trades: list[Trade] = field(default_factory=list)
    signals_generated: int = 0
    signals_valid: int = 0
    max_drawdown_duration: int = 0       # bars in drawdown
    recovery_factor: float = 0.0         # net profit / max drawdown
    longest_drawdown_duration: int = 0   # longest drawdown period
    avg_drawdown: float = 0.0            # average drawdown during drawdown periods
    calmar_ratio: float = 0.0            # annualized return / max drawdown


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
        fee_pct: float = 0.075,  # Binance taker fee
        slippage_bps: float = 2.0,
        leverage: int = 10,
        max_position_pct: float = 10.0,
        risk_per_trade_pct: float = 2.0,
        risk_config: RiskConfig | None = None,
    ):
        self.initial_balance = initial_balance
        self.fee_pct = fee_pct
        self.slippage_bps = slippage_bps
        self.leverage = leverage
        self.max_position_pct = max_position_pct
        self.risk_per_trade_pct = risk_per_trade_pct
        self.risk_manager = RiskManager(risk_config) if risk_config else None

    def run(
        self,
        candles: list[dict],
        strategy,
        symbol: str = "BTC/USDT",
        warmup: int = 50,
    ) -> BacktestResult:
        """Run backtest on historical candle data.

        Args:
            candles: List of candle dicts (timestamp, open, high, low, close, volume)
            strategy: Strategy instance with .analyze(symbol, candles) -> Signal
            symbol: Trading symbol
            warmup: Number of candles to skip before generating signals

        Returns:
            BacktestResult with performance metrics
        """
        result = BacktestResult(initial_balance=self.initial_balance)
        balance = self.initial_balance
        equity_curve = [balance]

        current_position: Optional[dict] = None
        risk_state: Optional[PositionRiskState] = None
        peak_equity = balance

        for i in range(warmup, len(candles)):
            # Get candle window up to current point
            window = candles[:i + 1]
            current_candle = candles[i]
            current_price = current_candle["close"]

            # Update risk management (trailing stop, breakeven)
            if current_position and self.risk_manager and risk_state:
                actions = self.risk_manager.update(risk_state, current_price, current_candle)
                if "new_stop_loss" in actions:
                    current_position["stop_loss"] = actions["new_stop_loss"]
                if actions.get("close_position"):
                    balance = self._close_position(
                        current_position, current_price, actions["close_reason"], balance, result
                    )
                    current_position = None
                    risk_state = None
                    # Skip to next candle after forced close
                    equity = balance
                    equity_curve.append(equity)
                    peak_equity = max(peak_equity, equity)
                    drawdown = (peak_equity - equity) / peak_equity * 100 if peak_equity > 0 else 0
                    result.max_drawdown_pct = max(result.max_drawdown_pct, drawdown)
                    continue

            # Update existing position PnL
            if current_position:
                if current_position["side"] == "LONG":
                    unrealized = (current_price - current_position["entry_price"]) * current_position["quantity"]
                else:
                    unrealized = (current_position["entry_price"] - current_price) * current_position["quantity"]

                # Check SL/TP
                exit_reason = None
                exit_price = current_price

                if current_position["side"] == "LONG":
                    if current_candle["low"] <= current_position["stop_loss"]:
                        exit_price = current_position["stop_loss"]
                        exit_reason = "STOP_LOSS"
                    elif current_candle["high"] >= current_position["take_profit"]:
                        exit_price = current_position["take_profit"]
                        exit_reason = "TAKE_PROFIT"
                else:
                    if current_candle["high"] >= current_position["stop_loss"]:
                        exit_price = current_position["stop_loss"]
                        exit_reason = "STOP_LOSS"
                    elif current_candle["low"] <= current_position["take_profit"]:
                        exit_price = current_position["take_profit"]
                        exit_reason = "TAKE_PROFIT"

                # Close position if SL/TP hit or signal reversal
                if exit_reason:
                    balance = self._close_position(
                        current_position, exit_price, exit_reason, balance, result
                    )
                    current_position = None
                    risk_state = None
                else:
                    # Check for signal reversal
                    signal = strategy.analyze(symbol, window)
                    result.signals_generated += 1

                    if signal.is_actionable:
                        result.signals_valid += 1
                        new_dir = signal.direction
                        if (current_position["side"] == "LONG" and new_dir == SignalDirection.SHORT) or \
                           (current_position["side"] == "SHORT" and new_dir == SignalDirection.LONG):
                            balance = self._close_position(
                                current_position, current_price, "SIGNAL_EXIT", balance, result
                            )
                            current_position = None
                            risk_state = None
                            # Open new position
                            current_position = self._open_position(signal, current_price, balance, result)
                            if current_position and self.risk_manager:
                                risk_state = self.risk_manager.init_position(
                                    entry_price=current_position["entry_price"],
                                    side=current_position["side"],
                                    stop_loss=current_position["stop_loss"],
                                    take_profit=current_position["take_profit"],
                                    quantity=current_position["quantity"],
                                )
            else:
                # No position — check for entry signal
                signal = strategy.analyze(symbol, window)
                result.signals_generated += 1

                if signal.is_actionable:
                    result.signals_valid += 1
                    current_position = self._open_position(signal, current_price, balance, result)
                    if current_position and self.risk_manager:
                        risk_state = self.risk_manager.init_position(
                            entry_price=current_position["entry_price"],
                            side=current_position["side"],
                            stop_loss=current_position["stop_loss"],
                            take_profit=current_position["take_profit"],
                            quantity=current_position["quantity"],
                        )

            # Track equity
            if current_position:
                if current_position["side"] == "LONG":
                    unrealized = (current_price - current_position["entry_price"]) * current_position["quantity"]
                else:
                    unrealized = (current_position["entry_price"] - current_price) * current_position["quantity"]
                equity = balance + unrealized
            else:
                equity = balance

            equity_curve.append(equity)
            peak_equity = max(peak_equity, equity)
            drawdown = (peak_equity - equity) / peak_equity * 100 if peak_equity > 0 else 0
            result.max_drawdown_pct = max(result.max_drawdown_pct, drawdown)

        # Close any remaining position at last price
        if current_position:
            balance = self._close_position(
                current_position, candles[-1]["close"], "END", balance, result
            )
            current_position = None
            risk_state = None

        # Calculate metrics
        result.final_balance = balance
        result.equity_curve = equity_curve
        result.total_return_pct = (balance - self.initial_balance) / self.initial_balance * 100

        if result.trades:
            result.total_trades = len(result.trades)
            wins = [t for t in result.trades if t.pnl > 0]
            losses = [t for t in result.trades if t.pnl <= 0]
            result.winning_trades = len(wins)
            result.losing_trades = len(losses)
            result.win_rate = len(wins) / len(result.trades) * 100 if result.trades else 0
            result.avg_win = sum(t.pnl for t in wins) / len(wins) if wins else 0
            result.avg_loss = sum(t.pnl for t in losses) / len(losses) if losses else 0

            gross_profit = sum(t.pnl for t in wins)
            gross_loss = abs(sum(t.pnl for t in losses))
            result.profit_factor = gross_profit / gross_loss if gross_loss > 0 else float('inf') if gross_profit > 0 else 0

            # Sharpe ratio (simplified — per-trade returns)
            returns = [t.pnl_pct for t in result.trades]
            if len(returns) > 1:
                mean_ret = sum(returns) / len(returns)
                std_ret = (sum((r - mean_ret) ** 2 for r in returns) / (len(returns) - 1)) ** 0.5
                result.sharpe_ratio = (mean_ret / std_ret * (252 ** 0.5)) if std_ret > 0 else 0

            # Average trade duration (in candles)
            durations = [t.exit_time - t.entry_time for t in result.trades]
            result.avg_trade_duration = sum(durations) / len(durations) if durations else 0

        # Drawdown analysis
        if len(equity_curve) > 1:
            peak = equity_curve[0]
            dd_start = 0
            current_dd_duration = 0
            longest_dd = 0
            dd_amounts = []

            for i, eq in enumerate(equity_curve):
                if eq >= peak:
                    if current_dd_duration > 0:
                        longest_dd = max(longest_dd, current_dd_duration)
                        current_dd_duration = 0
                    peak = eq
                    dd_start = i
                else:
                    current_dd_duration += 1
                    dd_pct = (peak - eq) / peak * 100 if peak > 0 else 0
                    dd_amounts.append(dd_pct)

            result.longest_drawdown_duration = max(longest_dd, current_dd_duration)
            result.avg_drawdown = sum(dd_amounts) / len(dd_amounts) if dd_amounts else 0

            # Recovery factor: net profit / max drawdown amount
            net_profit = balance - self.initial_balance
            max_dd_amount = result.max_drawdown_pct / 100 * max(equity_curve) if equity_curve else 0
            result.recovery_factor = net_profit / max_dd_amount if max_dd_amount > 0 else 0

            # Calmar ratio: annualized return / max drawdown
            total_bars = len(equity_curve)
            if total_bars > 0 and result.max_drawdown_pct > 0:
                annualized_return = result.total_return_pct * (252 * 24 * 12 / total_bars)  # ~5min bars
                result.calmar_ratio = annualized_return / result.max_drawdown_pct

        return result

    def _open_position(self, signal: Signal, price: float, balance: float, result: BacktestResult) -> dict:
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
        max_notional = balance * self.max_position_pct / 100
        max_qty = max_notional / fill_price
        quantity = min(quantity, max_qty)

        if quantity <= 0:
            return None

        # Calculate fee
        notional = fill_price * quantity
        fee = notional * self.fee_pct / 100

        return {
            "side": signal.direction.value,
            "entry_price": fill_price,
            "quantity": quantity,
            "stop_loss": signal.stop_loss,
            "take_profit": signal.take_profit,
            "entry_time": signal.entry_price,  # Will be overwritten by caller
            "fee": fee,
        }

    def _close_position(self, pos: dict, exit_price: float, reason: str,
                        balance: float, result: BacktestResult) -> float:
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

        pnl_pct = pnl / (pos["entry_price"] * pos["quantity"]) * 100 if pos["quantity"] > 0 else 0

        trade = Trade(
            symbol="",
            side=pos["side"],
            entry_price=pos["entry_price"],
            exit_price=fill_exit,
            quantity=pos["quantity"],
            entry_time=0,
            exit_time=0,
            pnl=pnl,
            pnl_pct=pnl_pct,
            exit_reason=reason,
            fee=total_fees,
        )
        result.trades.append(trade)

        return balance + pnl

    def print_report(self, result: BacktestResult) -> None:
        """Print a formatted backtest report."""
        print("\n" + "=" * 60)
        print("  BACKTEST REPORT")
        print("=" * 60)
        print(f"  Initial Balance:    ${result.initial_balance:>12,.2f}")
        print(f"  Final Balance:      ${result.final_balance:>12,.2f}")
        print(f"  Total Return:       {result.total_return_pct:>+11.2f}%")
        print(f"  Max Drawdown:       {result.max_drawdown_pct:>11.2f}%")
        print(f"  Longest DD Period:  {result.longest_drawdown_duration:>11d} bars")
        print(f"  Avg Drawdown:       {result.avg_drawdown:>11.2f}%")
        print(f"  Recovery Factor:    {result.recovery_factor:>11.2f}")
        print(f"  Calmar Ratio:       {result.calmar_ratio:>11.2f}")
        print(f"  Sharpe Ratio:       {result.sharpe_ratio:>11.2f}")
        print("-" * 60)
        print(f"  Total Trades:       {result.total_trades:>12d}")
        print(f"  Winning Trades:     {result.winning_trades:>12d}")
        print(f"  Losing Trades:      {result.losing_trades:>12d}")
        print(f"  Win Rate:           {result.win_rate:>11.1f}%")
        print(f"  Avg Win:            ${result.avg_win:>12,.2f}")
        print(f"  Avg Loss:           ${result.avg_loss:>12,.2f}")
        print(f"  Profit Factor:      {result.profit_factor:>11.2f}")
        print(f"  Avg Trade Duration: {result.avg_trade_duration:>11.1f} bars")
        print("-" * 60)
        print(f"  Signals Generated:  {result.signals_generated:>12d}")
        print(f"  Signals Valid:      {result.signals_valid:>12d}")
        print("=" * 60 + "\n")

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
        for strategy in strategies:
            name = strategy.name if hasattr(strategy, 'name') else strategy.__class__.__name__
            logger.info(f"Backtesting {name}...")
            result = self.run(candles, strategy, symbol, warmup)
            results[name] = result
        return results

    def print_comparison(self, results: dict[str, BacktestResult]) -> None:
        """Print comparison table of multiple strategy backtests."""
        print("\n" + "=" * 90)
        print("  STRATEGY COMPARISON")
        print("=" * 90)
        print(f"  {'Strategy':<20} {'Return%':>9} {'Trades':>7} {'Win%':>7} "
              f"{'PF':>7} {'MaxDD%':>8} {'Recovery':>9} {'Calmar':>7} {'Sharpe':>7}")
        print("-" * 90)

        for name, r in sorted(results.items(), key=lambda x: x[1].total_return_pct, reverse=True):
            print(f"  {name:<20} {r.total_return_pct:>+8.2f}% {r.total_trades:>7d} "
                  f"{r.win_rate:>6.1f}% {r.profit_factor:>7.2f} "
                  f"{r.max_drawdown_pct:>7.2f}% {r.recovery_factor:>9.2f} "
                  f"{r.calmar_ratio:>7.2f} {r.sharpe_ratio:>7.2f}")

        print("=" * 90 + "\n")
