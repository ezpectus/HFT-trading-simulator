"""Backtest report rendering — pure presentation over BacktestResult.

Separated from backtester.py (S014): printing is a presentation concern
independent of the simulation engine.
"""
from src.backtesting.results import BacktestResult


def print_backtest_report(result: BacktestResult) -> None:
    """Log a formatted backtest report."""
    lines = [
        "",
        "=" * 60,
        "  BACKTEST REPORT",
        "=" * 60,
        f"  Initial Balance:    ${result.initial_balance:>12,.2f}",
        f"  Final Balance:      ${result.final_balance:>12,.2f}",
        f"  Total Return:       {result.total_return_pct:>+11.2f}%",
        f"  Max Drawdown:       {result.max_drawdown_pct:>11.2f}%",
        f"  Longest DD Period:  {result.longest_drawdown_duration:>11d} bars",
        f"  Avg Drawdown:       {result.avg_drawdown:>11.2f}%",
        f"  Recovery Factor:    {result.recovery_factor:>11.2f}",
        f"  Calmar Ratio:       {result.calmar_ratio:>11.2f}",
        f"  Sharpe Ratio:       {result.sharpe_ratio:>11.2f}",
        "-" * 60,
        f"  Total Trades:       {result.total_trades:>12d}",
        f"  Winning Trades:     {result.winning_trades:>12d}",
        f"  Losing Trades:      {result.losing_trades:>12d}",
        f"  Win Rate:           {result.win_rate:>11.1f}%",
        f"  Avg Win:            ${result.avg_win:>12,.2f}",
        f"  Avg Loss:           ${result.avg_loss:>12,.2f}",
        f"  Profit Factor:      {result.profit_factor:>11.2f}",
        f"  Avg Trade Duration: {result.avg_trade_duration:>11.1f} bars",
        "-" * 60,
        f"  Signals Generated:  {result.signals_generated:>12d}",
        f"  Signals Valid:      {result.signals_valid:>12d}",
        "=" * 60,
        "",
    ]
    print("\n".join(lines))


def print_comparison_report(results: dict[str, BacktestResult]) -> None:
    """Log comparison table of multiple strategy backtests."""
    lines = [
        "",
        "=" * 90,
        "  STRATEGY COMPARISON",
        "=" * 90,
        f"  {'Strategy':<20} {'Return%':>9} {'Trades':>7} {'Win%':>7} "
        f"{'PF':>7} {'MaxDD%':>8} {'Recovery':>9} {'Calmar':>7} {'Sharpe':>7}",
        "-" * 90,
    ]
    for name, r in sorted(results.items(), key=lambda x: x[1].total_return_pct, reverse=True):
        lines.append(
            f"  {name:<20} {r.total_return_pct:>+8.2f}% {r.total_trades:>7d} "
            f"{r.win_rate:>6.1f}% {r.profit_factor:>7.2f} "
            f"{r.max_drawdown_pct:>7.2f}% {r.recovery_factor:>9.2f} "
            f"{r.calmar_ratio:>7.2f} {r.sharpe_ratio:>7.2f}"
        )
    lines.append("=" * 90)
    print("\n".join(lines))
