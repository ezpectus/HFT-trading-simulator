"""Backtest performance metrics — pure math over BacktestResult.

Separated from backtester.py (S014): these functions mutate only the
result object they're given — no simulation state. Keeping them pure
makes them unit-testable without running a backtest.
"""
from src.backtesting.results import BacktestResult


def track_equity(current_position: dict | None, balance: float, current_price: float) -> float:
    """Calculate current equity including unrealized PnL."""
    if current_position:
        if current_position["side"] == "LONG":
            unrealized = (current_price - current_position["entry_price"]) * current_position["quantity"]
        else:
            unrealized = (current_position["entry_price"] - current_price) * current_position["quantity"]
        return balance + unrealized
    return balance


def update_drawdown(equity: float, peak_equity: float, result: BacktestResult) -> float:
    """Update peak equity and max drawdown from current equity value."""
    peak_equity = max(peak_equity, equity)
    drawdown = (peak_equity - equity) / peak_equity * 100 if peak_equity > 0 else 0
    result.max_drawdown_pct = max(result.max_drawdown_pct, drawdown)
    return peak_equity


def calculate_trade_metrics(result: BacktestResult, candle_interval_minutes: int) -> None:
    """Calculate trade-level performance metrics."""
    if not result.trades:
        return

    result.total_trades = len(result.trades)
    wins = [t for t in result.trades if t.pnl > 0]
    losses = [t for t in result.trades if t.pnl < 0]
    result.winning_trades = len(wins)
    result.losing_trades = len(losses)
    result.win_rate = len(wins) / len(result.trades) * 100 if result.trades else 0
    result.avg_win = sum(t.pnl for t in wins) / len(wins) if wins else 0
    result.avg_loss = sum(t.pnl for t in losses) / len(losses) if losses else 0

    gross_profit = sum(t.pnl for t in wins)
    gross_loss = abs(sum(t.pnl for t in losses))
    result.profit_factor = gross_profit / gross_loss if gross_loss > 0 else float('inf') if gross_profit > 0 else 0

    returns = [t.pnl_pct for t in result.trades]
    if len(returns) > 1:
        mean_ret = sum(returns) / len(returns)
        std_ret = (sum((r - mean_ret) ** 2 for r in returns) / (len(returns) - 1)) ** 0.5
        periods_per_year = 365 * 24 * 60 / candle_interval_minutes
        result.sharpe_ratio = (mean_ret / std_ret * (periods_per_year ** 0.5)) if std_ret > 0 else 0
        downside_returns = [r for r in returns if r < 0]
        if len(downside_returns) > 0:
            downside_std = (sum(r ** 2 for r in downside_returns) / len(returns)) ** 0.5
            result.sortino_ratio = (mean_ret / downside_std * (periods_per_year ** 0.5)) if downside_std > 0 else 0

    durations = [t.exit_time - t.entry_time for t in result.trades]
    result.avg_trade_duration = sum(durations) / len(durations) if durations else 0


def calculate_drawdown_metrics(
    result: BacktestResult,
    equity_curve: list,
    balance: float,
    initial_balance: float,
    candle_interval_minutes: int,
) -> None:
    """Calculate drawdown-related performance metrics."""
    if len(equity_curve) <= 1:
        return

    peak = equity_curve[0]
    current_dd_duration = 0
    longest_dd = 0
    dd_amounts = []

    for eq in equity_curve:
        if eq >= peak:
            if current_dd_duration > 0:
                longest_dd = max(longest_dd, current_dd_duration)
                current_dd_duration = 0
            peak = eq
        else:
            current_dd_duration += 1
            dd_pct = (peak - eq) / peak * 100 if peak > 0 else 0
            dd_amounts.append(dd_pct)

    result.longest_drawdown_duration = max(longest_dd, current_dd_duration)
    result.avg_drawdown = sum(dd_amounts) / len(dd_amounts) if dd_amounts else 0

    net_profit = balance - initial_balance
    max_dd_amount = result.max_drawdown_pct / 100 * max(equity_curve) if equity_curve else 0
    result.recovery_factor = float(net_profit / max_dd_amount) if max_dd_amount > 0 else 0.0

    total_bars = len(equity_curve)
    if total_bars > 0 and result.max_drawdown_pct > 0:
        annualized_return = result.total_return_pct * (365 * 24 * 60 / candle_interval_minutes / total_bars)
        result.calmar_ratio = annualized_return / result.max_drawdown_pct
