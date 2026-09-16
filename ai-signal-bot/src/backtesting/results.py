"""Backtest result types — the domain objects produced by Backtester.

Separated from backtester.py these dataclasses are the public
contract consumed by comparison/optimizer/plotter/WS payloads — they
don't belong inside the simulation loop file.
"""
from dataclasses import dataclass, field


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
    sortino_ratio: float = 0.0           # like Sharpe but only downside deviation

    @property
    def final_equity(self) -> float:
        """Alias for final_balance — comparison/report consumers read final_equity."""
        return self.final_balance

    def to_dict(self) -> dict:
        """Serialize to JSON-compatible dict."""
        return {
            "total_return_pct": round(self.total_return_pct, 2),
            "total_trades": self.total_trades,
            "winning_trades": self.winning_trades,
            "losing_trades": self.losing_trades,
            "win_rate": round(self.win_rate, 2),
            "avg_win": round(self.avg_win, 2),
            "avg_loss": round(self.avg_loss, 2),
            "profit_factor": round(self.profit_factor, 2) if self.profit_factor != float('inf') else 999.99,
            "max_drawdown_pct": round(self.max_drawdown_pct, 2),
            "sharpe_ratio": round(self.sharpe_ratio, 2),
            "final_balance": round(self.final_balance, 2),
            "equity_curve": self.equity_curve,
            "signals_generated": self.signals_generated,
            "signals_valid": self.signals_valid,
        }
