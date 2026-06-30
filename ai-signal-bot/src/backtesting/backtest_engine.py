"""Backtesting engine — full framework for strategy backtesting.

Historical data loading, strategy interface, position simulator,
performance metrics, equity curve, trade-by-trade log.
"""

from __future__ import annotations

import math
import time
import json
from dataclasses import dataclass, field
from typing import Optional, Callable, Any
from collections import defaultdict
import numpy as np

import logging
logger = logging.getLogger(__name__)


@dataclass
class BacktestConfig:
    initial_capital: float = 100000.0
    fee_rate: float = 0.0004         # 0.04% per side
    slippage_bps: float = 1.0        # 1 bp slippage
    funding_rate: float = 0.0001     # 8h funding
    leverage: int = 1
    position_size_pct: float = 0.1   # 10% of capital per trade


@dataclass
class BacktestTrade:
    timestamp: float
    symbol: str
    side: str
    qty: float
    entry_price: float
    exit_price: float
    pnl: float
    fee: float
    funding: float
    hold_time_s: float
    reason: str = ""


@dataclass
class BacktestResult:
    total_return: float = 0.0
    total_return_pct: float = 0.0
    sharpe_ratio: float = 0.0
    sortino_ratio: float = 0.0
    calmar_ratio: float = 0.0
    max_drawdown: float = 0.0
    max_drawdown_pct: float = 0.0
    win_rate: float = 0.0
    profit_factor: float = 0.0
    total_trades: int = 0
    winning_trades: int = 0
    losing_trades: int = 0
    avg_win: float = 0.0
    avg_loss: float = 0.0
    avg_hold_time: float = 0.0
    equity_curve: list[float] = field(default_factory=list)
    underwater_curve: list[float] = field(default_factory=list)
    trades: list[BacktestTrade] = field(default_factory=list)
    final_equity: float = 0.0

    def to_dict(self) -> dict:
        return {
            "total_return": self.total_return,
            "total_return_pct": self.total_return_pct,
            "sharpe_ratio": self.sharpe_ratio,
            "sortino_ratio": self.sortino_ratio,
            "calmar_ratio": self.calmar_ratio,
            "max_drawdown": self.max_drawdown,
            "max_drawdown_pct": self.max_drawdown_pct,
            "win_rate": self.win_rate,
            "profit_factor": self.profit_factor,
            "total_trades": self.total_trades,
            "winning_trades": self.winning_trades,
            "losing_trades": self.losing_trades,
            "avg_win": self.avg_win,
            "avg_loss": self.avg_loss,
            "avg_hold_time": self.avg_hold_time,
            "final_equity": self.final_equity,
        }


class BacktestEngine:
    """Full backtesting framework."""

    def __init__(self, config: BacktestConfig = None):
        self.config = config or BacktestConfig()
        self.equity: float = self.config.initial_capital
        self.position: Optional[dict] = None  # {side, qty, entry_price, entry_time}
        self.trades: list[BacktestTrade] = []
        self.equity_curve: list[float] = []
        self.peak_equity: float = self.config.initial_capital

    def run(
        self, candles: list[dict],
        strategy_analyze: Callable[[str, list[dict]], dict],
        symbol: str = "BTCUSDT"
    ) -> BacktestResult:
        """Run backtest on candle data using strategy callback.

        strategy_analyze(symbol, candles_slice) -> {
            "direction": "LONG"/"SHORT"/"NEUTRAL",
            "confidence": float,
            "entry_price": float,
            "stop_loss": float,
            "take_profit": float,
        }
        """
        self.equity = self.config.initial_capital
        self.position = None
        self.trades = []
        self.equity_curve = []
        self.peak_equity = self.config.initial_capital

        lookback = 50  # Minimum candles for strategy

        for i in range(lookback, len(candles)):
            candle = candles[i]
            current_price = candle["close"] if isinstance(candle, dict) else candle.close
            timestamp = candle.get("timestamp", i * 60) if isinstance(candle, dict) else i * 60

            # Update unrealized PnL and check SL/TP
            if self.position:
                self._check_exit(current_price, timestamp, candle)

            # If no position, check for entry
            if not self.position:
                signal = strategy_analyze(symbol, candles[:i + 1])
                if signal and signal.get("direction") in ("LONG", "SHORT"):
                    self._enter_position(signal, current_price, timestamp)

            # Update equity curve
            mark_equity = self._mark_to_market(current_price)
            self.equity_curve.append(mark_equity)
            if mark_equity > self.peak_equity:
                self.peak_equity = mark_equity

        # Close any remaining position at last price
        if self.position:
            last_candle = candles[-1]
            last_price = last_candle["close"] if isinstance(last_candle, dict) else last_candle.close
            last_ts = last_candle.get("timestamp", len(candles) * 60) if isinstance(last_candle, dict) else len(candles) * 60
            self._exit_position(last_price, last_ts, "End of backtest")

        return self._compute_results()

    def _enter_position(self, signal: dict, price: float, timestamp: float) -> None:
        """Enter a position based on signal."""
        direction = signal["direction"]
        confidence = signal.get("confidence", 50)
        size_mult = min(confidence / 50.0, 2.0)

        position_value = self.equity * self.config.position_size_pct * size_mult
        qty = position_value / price

        # Apply slippage
        if direction == "LONG":
            entry_price = price * (1 + self.config.slippage_bps / 10000)
        else:
            entry_price = price * (1 - self.config.slippage_bps / 10000)

        fee = qty * entry_price * self.config.fee_rate
        self.equity -= fee

        self.position = {
            "side": direction,
            "qty": qty,
            "entry_price": entry_price,
            "entry_time": timestamp,
            "stop_loss": signal.get("stop_loss", 0),
            "take_profit": signal.get("take_profit", 0),
        }

    def _check_exit(self, current_price: float, timestamp: float, candle: dict) -> None:
        """Check if current position should be exited (SL/TP)."""
        if not self.position:
            return

        high = candle.get("high", current_price) if isinstance(candle, dict) else current_price
        low = candle.get("low", current_price) if isinstance(candle, dict) else current_price

        if self.position["side"] == "LONG":
            # Check stop loss
            if self.position["stop_loss"] > 0 and low <= self.position["stop_loss"]:
                self._exit_position(self.position["stop_loss"], timestamp, "Stop loss")
            # Check take profit
            elif self.position["take_profit"] > 0 and high >= self.position["take_profit"]:
                self._exit_position(self.position["take_profit"], timestamp, "Take profit")
        else:
            if self.position["stop_loss"] > 0 and high >= self.position["stop_loss"]:
                self._exit_position(self.position["stop_loss"], timestamp, "Stop loss")
            elif self.position["take_profit"] > 0 and low <= self.position["take_profit"]:
                self._exit_position(self.position["take_profit"], timestamp, "Take profit")

    def _exit_position(self, exit_price: float, timestamp: float, reason: str) -> None:
        """Exit current position."""
        if not self.position:
            return

        # Apply slippage
        if self.position["side"] == "LONG":
            fill_price = exit_price * (1 - self.config.slippage_bps / 10000)
            pnl = (fill_price - self.position["entry_price"]) * self.position["qty"]
        else:
            fill_price = exit_price * (1 + self.config.slippage_bps / 10000)
            pnl = (self.position["entry_price"] - fill_price) * self.position["qty"]

        fee = self.position["qty"] * fill_price * self.config.fee_rate
        hold_time = timestamp - self.position["entry_time"]

        # Funding cost (simplified: 8h intervals)
        funding_periods = hold_time / (8 * 3600)
        funding = self.position["qty"] * fill_price * self.config.funding_rate * funding_periods

        net_pnl = pnl - fee - funding
        self.equity += net_pnl

        trade = BacktestTrade(
            timestamp=timestamp,
            symbol="",
            side=self.position["side"],
            qty=self.position["qty"],
            entry_price=self.position["entry_price"],
            exit_price=fill_price,
            pnl=net_pnl,
            fee=fee,
            funding=funding,
            hold_time_s=hold_time,
            reason=reason,
        )
        self.trades.append(trade)
        self.position = None

    def _mark_to_market(self, current_price: float) -> float:
        """Compute current equity including unrealized PnL."""
        if not self.position:
            return self.equity
        if self.position["side"] == "LONG":
            unrealized = (current_price - self.position["entry_price"]) * self.position["qty"]
        else:
            unrealized = (self.position["entry_price"] - current_price) * self.position["qty"]
        return self.equity + unrealized

    def _compute_results(self) -> BacktestResult:
        """Compute performance metrics."""
        result = BacktestResult()
        result.final_equity = self.equity
        result.total_return = self.equity - self.config.initial_capital
        result.total_return_pct = (self.equity / self.config.initial_capital - 1) * 100
        result.equity_curve = self.equity_curve[:]
        result.trades = self.trades[:]

        # Underwater curve
        peak = self.config.initial_capital
        underwater = []
        for eq in self.equity_curve:
            if eq > peak:
                peak = eq
            underwater.append((peak - eq) / max(peak, 1e-10))
        result.underwater_curve = underwater

        # Max drawdown
        if underwater:
            result.max_drawdown_pct = max(underwater) * 100
            result.max_drawdown = max(underwater) * self.config.initial_capital

        # Trade statistics
        result.total_trades = len(self.trades)
        wins = [t for t in self.trades if t.pnl > 0]
        losses = [t for t in self.trades if t.pnl <= 0]
        result.winning_trades = len(wins)
        result.losing_trades = len(losses)
        result.win_rate = len(wins) / max(result.total_trades, 1) * 100
        result.avg_win = sum(t.pnl for t in wins) / max(len(wins), 1)
        result.avg_loss = sum(t.pnl for t in losses) / max(len(losses), 1)
        result.avg_hold_time = sum(t.hold_time_s for t in self.trades) / max(result.total_trades, 1)

        # Profit factor
        gross_profit = sum(t.pnl for t in wins)
        gross_loss = abs(sum(t.pnl for t in losses))
        result.profit_factor = gross_profit / max(gross_loss, 1e-10)

        # Sharpe ratio (per-bar returns)
        if len(self.equity_curve) > 1:
            returns = np.diff(self.equity_curve) / np.array(self.equity_curve[:-1])
            returns = returns[returns != 0]
            if len(returns) > 0:
                mean_ret = returns.mean()
                std_ret = returns.std()
                if std_ret > 1e-10:
                    # Annualize (assume 1m bars)
                    bars_per_year = 252 * 24 * 60
                    result.sharpe_ratio = mean_ret / std_ret * math.sqrt(bars_per_year)

                # Sortino ratio
                downside_returns = returns[returns < 0]
                if len(downside_returns) > 0:
                    downside_std = downside_returns.std()
                    if downside_std > 1e-10:
                        result.sortino_ratio = mean_ret / downside_std * math.sqrt(bars_per_year)

        # Calmar ratio
        if result.max_drawdown_pct > 0:
            annual_return = result.total_return_pct  # Simplified
            result.calmar_ratio = annual_return / result.max_drawdown_pct

        return result
