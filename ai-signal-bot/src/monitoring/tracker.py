"""Monitoring — performance tracking, logging, and CLI dashboard."""
import logging
import os
import time
from dataclasses import dataclass, field
from datetime import datetime

from tabulate import tabulate

logger = logging.getLogger("ai_signal_bot.monitoring")


@dataclass
class PerformanceTracker:
    """Tracks trading performance metrics."""
    signals_generated: int = 0
    signals_validated: int = 0
    signals_rejected: int = 0
    orders_sent: int = 0
    trades_closed: int = 0
    winning_trades: int = 0
    total_pnl: float = 0.0
    total_fees: float = 0.0
    start_time: float = field(default_factory=time.time)

    @property
    def uptime_seconds(self) -> float:
        return time.time() - self.start_time

    @property
    def win_rate(self) -> float:
        return (self.winning_trades / self.trades_closed * 100) if self.trades_closed > 0 else 0

    @property
    def signals_per_hour(self) -> float:
        hours = self.uptime_seconds / 3600
        return self.signals_generated / hours if hours > 0 else 0

    def record_signal(self, validated: bool) -> None:
        self.signals_generated += 1
        if validated:
            self.signals_validated += 1
        else:
            self.signals_rejected += 1

    def record_trade(self, pnl: float, fee: float = 0, winning: bool = False) -> None:
        self.trades_closed += 1
        self.total_pnl += pnl
        self.total_fees += fee
        if winning:
            self.winning_trades += 1

    def summary(self) -> dict:
        return {
            "uptime_seconds": round(self.uptime_seconds, 0),
            "signals_generated": self.signals_generated,
            "signals_validated": self.signals_validated,
            "signals_rejected": self.signals_rejected,
            "orders_sent": self.orders_sent,
            "trades_closed": self.trades_closed,
            "winning_trades": self.winning_trades,
            "win_rate": round(self.win_rate, 1),
            "total_pnl": round(self.total_pnl, 2),
            "total_fees": round(self.total_fees, 2),
            "signals_per_hour": round(self.signals_per_hour, 1),
        }


class SignalLogger:
    """Logs signals to CSV file."""

    def __init__(self, path: str = "logs/signals.csv"):
        self.path = path
        os.makedirs(os.path.dirname(path), exist_ok=True)
        if not os.path.exists(path):
            with open(path, "w", encoding="utf-8") as f:
                f.write("timestamp,symbol,direction,confidence,strategy,entry,sl,tp,rr,reason\n")

    def log(self, signal_dict: dict) -> None:
        with open(self.path, "a", encoding="utf-8") as f:
            f.write(
                f"{signal_dict.get('timestamp', '')},"
                f"{signal_dict['symbol']},"
                f"{signal_dict['direction']},"
                f"{signal_dict['confidence']},"
                f"{signal_dict['strategy']},"
                f"{signal_dict['entry_price']},"
                f"{signal_dict['stop_loss']},"
                f"{signal_dict['take_profit']},"
                f"{signal_dict.get('rr_ratio', 0):.2f},"
                f"{signal_dict.get('reason', '')}\n"
            )


class TradeLogger:
    """Logs trades to CSV file."""

    def __init__(self, path: str = "logs/trades.csv"):
        self.path = path
        os.makedirs(os.path.dirname(path), exist_ok=True)
        if not os.path.exists(path):
            with open(path, "w", encoding="utf-8") as f:
                f.write("timestamp,symbol,exchange,side,qty,entry,exit,pnl,fee,status\n")

    def log(self, trade_dict: dict) -> None:
        with open(self.path, "a", encoding="utf-8") as f:
            f.write(
                f"{trade_dict.get('timestamp', '')},"
                f"{trade_dict['symbol']},"
                f"{trade_dict.get('exchange', '')},"
                f"{trade_dict['side']},"
                f"{trade_dict['quantity']},"
                f"{trade_dict['entry_price']},"
                f"{trade_dict.get('exit_price', '')},"
                f"{trade_dict.get('pnl', '')},"
                f"{trade_dict.get('fee', 0)},"
                f"{trade_dict.get('status', 'OPEN')}\n"
            )


def print_dashboard(tracker: PerformanceTracker, positions: list[dict], prices: dict) -> None:
    """Print a summary dashboard to the terminal."""
    print(f"\n{'=' * 60}")
    print(f"  AI SIGNAL BOT — Performance Dashboard")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'=' * 60}\n")

    # Performance stats
    stats = tracker.summary()
    print(f"  Uptime:          {stats['uptime_seconds']:.0f}s")
    print(f"  Signals:         {stats['signals_generated']} (validated: {stats['signals_validated']}, rejected: {stats['signals_rejected']})")
    print(f"  Trades closed:   {stats['trades_closed']} (win rate: {stats['win_rate']}%)")
    print(f"  Total PnL:       ${stats['total_pnl']:+.2f}")
    print(f"  Total Fees:      ${stats['total_fees']:.2f}")
    print(f"  Signals/hr:      {stats['signals_per_hour']}\n")

    # Current prices
    if prices:
        print("  Current Prices:")
        rows = [(symbol, f"${price:.2f}") for symbol, price in prices.items()]
        print(tabulate(rows, headers=["Symbol", "Price"], tablefmt="  simple"))
        print()

    # Open positions
    if positions:
        print("  Open Positions:")
        rows = []
        for p in positions:
            rows.append([
                p.get("symbol", ""),
                p.get("side", ""),
                f"{p.get('quantity', 0):.4f}",
                f"${p.get('entry_price', 0):.2f}",
                f"${p.get('unrealized_pnl', 0):+.2f}",
            ])
        print(tabulate(rows, headers=["Symbol", "Side", "Qty", "Entry", "uPnL"], tablefmt="  simple"))
    else:
        print("  No open positions")

    print(f"\n{'=' * 60}\n")
