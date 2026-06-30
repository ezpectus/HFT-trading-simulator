"""Data models — Candle, OrderBook, Order, Position, Account."""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class Side(Enum):
    BUY = "BUY"
    SELL = "SELL"


class OrderType(Enum):
    MARKET = "MARKET"
    LIMIT = "LIMIT"


class OrderStatus(Enum):
    PENDING = "PENDING"
    FILLED = "FILLED"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"


@dataclass
class Candle:
    """OHLCV candle."""
    timestamp: int
    open: float
    high: float
    low: float
    close: float
    volume: float
    symbol: str = ""
    exchange: str = ""

    def to_dict(self) -> dict:
        return {
            "timestamp": self.timestamp,
            "open": self.open,
            "high": self.high,
            "low": self.low,
            "close": self.close,
            "volume": self.volume,
            "symbol": self.symbol,
            "exchange": self.exchange,
        }


@dataclass
class OrderBookLevel:
    """Single level in the order book."""
    price: float
    quantity: float


@dataclass
class OrderBook:
    """Simulated order book with bid/ask levels."""
    symbol: str
    exchange: str
    bids: list[OrderBookLevel] = field(default_factory=list)
    asks: list[OrderBookLevel] = field(default_factory=list)
    timestamp: int = 0

    @property
    def best_bid(self) -> float:
        return self.bids[0].price if self.bids else 0.0

    @property
    def best_ask(self) -> float:
        return self.asks[0].price if self.asks else 0.0

    @property
    def spread(self) -> float:
        return self.best_ask - self.best_bid

    @property
    def mid_price(self) -> float:
        return (self.best_bid + self.best_ask) / 2 if self.bids and self.asks else 0.0

    def to_dict(self) -> dict:
        return {
            "symbol": self.symbol,
            "exchange": self.exchange,
            "bids": [[l.price, l.quantity] for l in self.bids[:10]],
            "asks": [[l.price, l.quantity] for l in self.asks[:10]],
            "timestamp": self.timestamp,
        }


@dataclass
class Order:
    """Trade order."""
    id: str
    symbol: str
    exchange: str
    side: Side
    order_type: OrderType
    quantity: float
    price: Optional[float] = None  # None for market orders
    status: OrderStatus = OrderStatus.PENDING
    filled_price: float = 0.0
    filled_quantity: float = 0.0
    fee: float = 0.0
    slippage: float = 0.0
    rejection_reason: Optional[str] = None
    timestamp: int = field(default_factory=lambda: int(time.time()))

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "symbol": self.symbol,
            "exchange": self.exchange,
            "side": self.side.value,
            "order_type": self.order_type.value,
            "quantity": self.quantity,
            "price": self.price,
            "status": self.status.value,
            "filled_price": self.filled_price,
            "filled_quantity": self.filled_quantity,
            "fee": self.fee,
            "slippage": self.slippage,
            "rejection_reason": self.rejection_reason,
            "timestamp": self.timestamp,
        }


@dataclass
class Position:
    """Open position."""
    symbol: str
    exchange: str
    side: Side
    quantity: float
    entry_price: float
    stop_loss: float
    take_profit: float
    opened_at: int = field(default_factory=lambda: int(time.time()))
    unrealized_pnl: float = 0.0

    @property
    def is_long(self) -> bool:
        return self.side == Side.BUY

    def update_pnl(self, current_price: float) -> None:
        if self.is_long:
            self.unrealized_pnl = (current_price - self.entry_price) * self.quantity
        else:
            self.unrealized_pnl = (self.entry_price - current_price) * self.quantity

    def to_dict(self) -> dict:
        return {
            "symbol": self.symbol,
            "exchange": self.exchange,
            "side": self.side.value,
            "quantity": self.quantity,
            "entry_price": self.entry_price,
            "stop_loss": self.stop_loss,
            "take_profit": self.take_profit,
            "opened_at": self.opened_at,
            "unrealized_pnl": self.unrealized_pnl,
        }


@dataclass
class ClosedTrade:
    """Record of a closed position."""
    symbol: str
    exchange: str
    side: str
    quantity: float
    entry_price: float
    exit_price: float
    pnl: float
    fee: float
    reason: str  # "STOP_LOSS" | "TAKE_PROFIT" | "MANUAL"
    opened_at: int
    closed_at: int = field(default_factory=lambda: int(time.time()))

    def to_dict(self) -> dict:
        return {
            "symbol": self.symbol,
            "exchange": self.exchange,
            "side": self.side,
            "quantity": self.quantity,
            "entry_price": self.entry_price,
            "exit_price": self.exit_price,
            "pnl": self.pnl,
            "fee": self.fee,
            "reason": self.reason,
            "opened_at": self.opened_at,
            "closed_at": self.closed_at,
        }


@dataclass
class Account:
    """Simulated trading account."""
    exchange: str
    balance: float
    currency: str = "USDT"
    leverage: int = 10
    positions: list[Position] = field(default_factory=list)
    trade_history: list[ClosedTrade] = field(default_factory=list)
    total_pnl: float = 0.0
    total_fees: float = 0.0
    total_trades: int = 0
    winning_trades: int = 0

    @property
    def equity(self) -> float:
        return self.balance + sum(p.unrealized_pnl for p in self.positions)

    @property
    def win_rate(self) -> float:
        return (self.winning_trades / self.total_trades * 100) if self.total_trades > 0 else 0.0

    def to_dict(self) -> dict:
        return {
            "exchange": self.exchange,
            "balance": self.balance,
            "equity": self.equity,
            "currency": self.currency,
            "leverage": self.leverage,
            "positions": [p.to_dict() for p in self.positions],
            "trade_history": [t.to_dict() for t in self.trade_history[-20:]],
            "total_pnl": self.total_pnl,
            "total_fees": self.total_fees,
            "total_trades": self.total_trades,
            "winning_trades": self.winning_trades,
            "win_rate": self.win_rate,
        }
