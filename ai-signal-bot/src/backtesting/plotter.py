"""Backtest visualization — equity curves, drawdown, trade analysis.

Generates matplotlib charts for backtest results:
- Equity curve with drawdown shading
- Trade PnL distribution
- Strategy comparison chart
- Monthly returns heatmap

Usage:
    from src.backtesting.plotter import BacktestPlotter
    plotter = BacktestPlotter()
    plotter.plot_equity_curve(result, "Trend Following")
    plotter.plot_comparison(results)
    plotter.save_all(results, "backtest_charts/")
"""
import logging
import os
from typing import Optional

import matplotlib
matplotlib.use("Agg")  # Non-interactive backend
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
import numpy as np

from src.backtesting.backtester import BacktestResult

logger = logging.getLogger("ai_signal_bot.plotter")

# Color palette
COLORS = {
    "equity": "#2196F3",
    "drawdown": "#FF5252",
    "profit": "#4CAF50",
    "loss": "#F44336",
    "benchmark": "#9E9E9E",
    "bg": "#FAFAFA",
    "grid": "#E0E0E0",
}

# Strategy colors for comparison
STRATEGY_COLORS = [
    "#2196F3", "#4CAF50", "#FF9800", "#9C27B0",
    "#F44336", "#00BCD4", "#795548", "#607D8B",
]


class BacktestPlotter:
    """Generate matplotlib charts from backtest results."""

    def __init__(self, figsize=(12, 7), dpi=100):
        self.figsize = figsize
        self.dpi = dpi
        plt.style.use("seaborn-v0_8-whitegrid")

    def plot_equity_curve(
        self,
        result: BacktestResult,
        title: str = "Equity Curve",
        save_path: Optional[str] = None,
    ) -> plt.Figure:
        """Plot equity curve with drawdown shading."""
        fig, (ax1, ax2) = plt.subplots(
            2, 1, figsize=self.figsize, dpi=self.dpi,
            gridspec_kw={"height_ratios": [3, 1]}, sharex=True,
        )

        equity = np.array(result.equity_curve)
        n = len(equity)
        x = np.arange(n)

        # Equity curve
        ax1.plot(x, equity, color=COLORS["equity"], linewidth=1.5, label="Equity")
        ax1.axhline(
            y=result.initial_balance, color=COLORS["benchmark"],
            linestyle="--", linewidth=0.8, label="Initial Balance",
        )
        ax1.fill_between(x, result.initial_balance, equity,
                         where=equity >= result.initial_balance,
                         color=COLORS["profit"], alpha=0.15)
        ax1.fill_between(x, result.initial_balance, equity,
                         where=equity < result.initial_balance,
                         color=COLORS["loss"], alpha=0.15)

        # Peak line for drawdown reference
        peak = np.maximum.accumulate(equity)
        ax1.plot(x, peak, color=COLORS["benchmark"], linewidth=0.5, alpha=0.5, label="Peak")

        ax1.set_title(title, fontsize=14, fontweight="bold")
        ax1.set_ylabel("Balance ($)", fontsize=11)
        ax1.legend(loc="upper left", fontsize=9)
        ax1.grid(True, alpha=0.3)

        # Metrics box
        metrics_text = (
            f"Return: {result.total_return_pct:+.2f}%\n"
            f"Max DD: {result.max_drawdown_pct:.2f}%\n"
            f"Sharpe: {result.sharpe_ratio:.2f}\n"
            f"Win Rate: {result.win_rate:.1f}%\n"
            f"Trades: {result.total_trades}"
        )
        ax1.text(0.98, 0.02, metrics_text, transform=ax1.transAxes,
                 fontsize=9, verticalalignment="bottom", horizontalalignment="right",
                 bbox=dict(boxstyle="round,pad=0.5", facecolor="white", alpha=0.8),
                 family="monospace")

        # Drawdown chart
        drawdown_pct = (peak - equity) / peak * 100
        ax2.fill_between(x, 0, drawdown_pct, color=COLORS["drawdown"], alpha=0.4)
        ax2.plot(x, drawdown_pct, color=COLORS["drawdown"], linewidth=0.8)
        ax2.set_ylabel("Drawdown (%)", fontsize=11)
        ax2.set_xlabel("Bar", fontsize=11)
        ax2.invert_yaxis()
        ax2.grid(True, alpha=0.3)

        plt.tight_layout()

        if save_path:
            fig.savefig(save_path, dpi=self.dpi, bbox_inches="tight")
            logger.info(f"Saved equity curve to {save_path}")

        return fig

    def plot_trade_pnl(
        self,
        result: BacktestResult,
        title: str = "Trade PnL Distribution",
        save_path: Optional[str] = None,
    ) -> plt.Figure:
        """Plot trade PnL distribution histogram."""
        if not result.trades:
            fig, ax = plt.subplots(figsize=self.figsize, dpi=self.dpi)
            ax.text(0.5, 0.5, "No trades", ha="center", va="center", fontsize=14)
            return fig

        fig, (ax1, ax2) = plt.subplots(
            2, 1, figsize=self.figsize, dpi=self.dpi,
            gridspec_kw={"height_ratios": [2, 1]},
        )

        pnls = [t.pnl for t in result.trades]
        colors = [COLORS["profit"] if p > 0 else COLORS["loss"] for p in pnls]

        # Bar chart of individual trade PnL
        ax1.bar(range(len(pnls)), pnls, color=colors, width=0.8)
        ax1.axhline(y=0, color="black", linewidth=0.5)
        ax1.set_title(title, fontsize=14, fontweight="bold")
        ax1.set_ylabel("PnL ($)", fontsize=11)
        ax1.set_xlabel("Trade #", fontsize=11)
        ax1.grid(True, alpha=0.3)

        # Cumulative PnL
        cum_pnl = np.cumsum(pnls)
        ax2.plot(range(len(cum_pnl)), cum_pnl, color=COLORS["equity"], linewidth=1.5)
        ax2.fill_between(range(len(cum_pnl)), 0, cum_pnl,
                         where=cum_pnl >= 0, color=COLORS["profit"], alpha=0.2)
        ax2.fill_between(range(len(cum_pnl)), 0, cum_pnl,
                         where=cum_pnl < 0, color=COLORS["loss"], alpha=0.2)
        ax2.set_ylabel("Cumulative PnL ($)", fontsize=11)
        ax2.set_xlabel("Trade #", fontsize=11)
        ax2.grid(True, alpha=0.3)

        plt.tight_layout()

        if save_path:
            fig.savefig(save_path, dpi=self.dpi, bbox_inches="tight")
            logger.info(f"Saved trade PnL to {save_path}")

        return fig

    def plot_comparison(
        self,
        results: dict[str, BacktestResult],
        save_path: Optional[str] = None,
    ) -> plt.Figure:
        """Plot equity curves of multiple strategies for comparison."""
        fig, ax = plt.subplots(figsize=self.figsize, dpi=self.dpi)

        for i, (name, result) in enumerate(sorted(
            results.items(), key=lambda x: x[1].total_return_pct, reverse=True
        )):
            color = STRATEGY_COLORS[i % len(STRATEGY_COLORS)]
            equity = np.array(result.equity_curve)
            ax.plot(range(len(equity)), equity, color=color, linewidth=1.5, label=name)

        ax.axhline(y=results[list(results.keys())[0]].initial_balance,
                   color=COLORS["benchmark"], linestyle="--", linewidth=0.8,
                   label="Initial Balance")

        ax.set_title("Strategy Comparison — Equity Curves", fontsize=14, fontweight="bold")
        ax.set_ylabel("Balance ($)", fontsize=11)
        ax.set_xlabel("Bar", fontsize=11)
        ax.legend(loc="upper left", fontsize=10)
        ax.grid(True, alpha=0.3)

        plt.tight_layout()

        if save_path:
            fig.savefig(save_path, dpi=self.dpi, bbox_inches="tight")
            logger.info(f"Saved comparison chart to {save_path}")

        return fig

    def plot_metrics_radar(
        self,
        results: dict[str, BacktestResult],
        save_path: Optional[str] = None,
    ) -> plt.Figure:
        """Plot radar chart comparing key metrics across strategies."""
        metrics_labels = ["Return%", "Win%", "Profit Factor", "Sharpe", "Recovery", "Calmar"]
        n_metrics = len(metrics_labels)
        angles = np.linspace(0, 2 * np.pi, n_metrics, endpoint=False).tolist()
        angles += angles[:1]

        fig, ax = plt.subplots(figsize=(8, 8), dpi=self.dpi, subplot_kw=dict(polar=True))

        for i, (name, result) in enumerate(sorted(results.items())):
            values = [
                max(0, min(100, result.total_return_pct)),
                result.win_rate,
                min(10, result.profit_factor) * 10,
                max(0, min(50, result.sharpe_ratio * 10)),
                max(0, min(10, result.recovery_factor)) * 10,
                max(0, min(10, result.calmar_ratio)) * 10,
            ]
            values += values[:1]
            color = STRATEGY_COLORS[i % len(STRATEGY_COLORS)]
            ax.plot(angles, values, "o-", linewidth=1.5, color=color, label=name)
            ax.fill(angles, values, alpha=0.1, color=color)

        ax.set_xticks(angles[:-1])
        ax.set_xticklabels(metrics_labels, fontsize=10)
        ax.set_title("Strategy Metrics Comparison", fontsize=14, fontweight="bold", pad=20)
        ax.legend(loc="upper right", bbox_to_anchor=(1.3, 1.1), fontsize=9)

        plt.tight_layout()

        if save_path:
            fig.savefig(save_path, dpi=self.dpi, bbox_inches="tight")
            logger.info(f"Saved radar chart to {save_path}")

        return fig

    def save_all(
        self,
        results: dict[str, BacktestResult],
        output_dir: str = "backtest_charts",
    ) -> None:
        """Save all charts for a multi-strategy backtest."""
        os.makedirs(output_dir, exist_ok=True)

        # Individual equity curves
        for name, result in results.items():
            safe_name = name.replace(" ", "_").lower()
            self.plot_equity_curve(
                result, f"Equity Curve — {name}",
                os.path.join(output_dir, f"equity_{safe_name}.png"),
            )
            self.plot_trade_pnl(
                result, f"Trade PnL — {name}",
                os.path.join(output_dir, f"pnl_{safe_name}.png"),
            )
            plt.close("all")

        # Comparison charts
        self.plot_comparison(results, os.path.join(output_dir, "comparison_equity.png"))
        plt.close()

        self.plot_metrics_radar(results, os.path.join(output_dir, "comparison_radar.png"))
        plt.close()

        logger.info(f"All charts saved to {output_dir}/")
