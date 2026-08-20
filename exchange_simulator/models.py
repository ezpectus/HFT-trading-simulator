"""Data models — Candle, OrderBook, Order, Position, Account."""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from enum import Enum


class Side(Enum):
    BUY = "BUY"
    SELL = "SELL"


class OrderType(Enum):
    MARKET = "MARKET"
    LIMIT = "LIMIT"
    STOP_LIMIT = "STOP_LIMIT"
    TRAILING_STOP = "TRAILING_STOP"
    OCO = "OCO"
    ICEBERG = "ICEBERG"


class AuditEventType(Enum):
    ORDER_SUBMITTED = "ORDER_SUBMITTED"
    ORDER_FILLED = "ORDER_FILLED"
    ORDER_CANCELLED = "ORDER_CANCELLED"
    ORDER_REJECTED = "ORDER_REJECTED"
    POSITION_OPENED = "POSITION_OPENED"
    POSITION_CLOSED = "POSITION_CLOSED"
    POSITION_MODIFIED = "POSITION_MODIFIED"
    ACCOUNT_BALANCE_CHANGE = "ACCOUNT_BALANCE_CHANGE"
    CONFIG_CHANGE = "CONFIG_CHANGE"
    SYSTEM_START = "SYSTEM_START"
    SYSTEM_STOP = "SYSTEM_STOP"
    ERROR = "ERROR"
    WARNING = "WARNING"


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
            "bids": [[lvl.price, lvl.quantity] for lvl in self.bids[:10]],
            "asks": [[lvl.price, lvl.quantity] for lvl in self.asks[:10]],
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
    price: float | None = None  # None for market orders
    status: OrderStatus = OrderStatus.PENDING
    filled_price: float = 0.0
    filled_quantity: float = 0.0
    fee: float = 0.0
    slippage: float = 0.0
    rejection_reason: str | None = None
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
class StopLimitOrder(Order):
    """Stop-limit order with trigger price and limit price."""
    stop_price: float = 0.0  # Price at which order becomes active
    limit_price: float = 0.0  # Limit price for execution
    triggered: bool = False  # Whether stop price has been hit

    def check_trigger(self, current_price: float) -> bool:
        """Check if stop price should trigger the order."""
        if self.triggered:
            return True

        if self.side == Side.BUY:
            # Buy stop: trigger when price >= stop_price
            self.triggered = current_price >= self.stop_price
        else:
            # Sell stop: trigger when price <= stop_price
            self.triggered = current_price <= self.stop_price

        return self.triggered

    def to_dict(self) -> dict:
        base_dict = super().to_dict()
        base_dict.update({
            "stop_price": self.stop_price,
            "limit_price": self.limit_price,
            "triggered": self.triggered,
        })
        return base_dict


@dataclass
class TrailingStopOrder(Order):
    """Trailing stop order with dynamic stop price adjustment."""
    trail_amount: float = 0.0  # Trailing amount (absolute or percentage)
    trail_percentage: bool = True  # If True, trail_amount is percentage
    stop_price: float = 0.0  # Current stop price (updates dynamically)
    highest_price: float = 0.0  # Highest price seen (for long positions)
    lowest_price: float = 0.0  # Lowest price seen (for short positions)
    activated: bool = False  # Whether trailing has started

    def update_stop_price(self, current_price: float) -> None:
        """Update stop price based on current price movement."""
        if not self.activated:
            # First price sets the activation point
            self.activated = True
            self.highest_price = current_price
            self.lowest_price = current_price
            if self.side == Side.BUY:
                self.stop_price = current_price * (1 + self.trail_amount / 100 if self.trail_percentage else (1 + self.trail_amount / current_price))
            else:
                self.stop_price = current_price * (1 - self.trail_amount / 100 if self.trail_percentage else (1 - self.trail_amount / current_price))
            return

        if self.side == Side.BUY:
            # For buy trailing stop (short position), track lowest price
            if current_price < self.lowest_price:
                self.lowest_price = current_price
                if self.trail_percentage:
                    self.stop_price = current_price * (1 + self.trail_amount / 100)
                else:
                    self.stop_price = current_price + self.trail_amount
        else:
            # For sell trailing stop (long position), track highest price
            if current_price > self.highest_price:
                self.highest_price = current_price
                if self.trail_percentage:
                    self.stop_price = current_price * (1 - self.trail_amount / 100)
                else:
                    self.stop_price = current_price - self.trail_amount

    def check_trigger(self, current_price: float) -> bool:
        """Check if current price triggers the trailing stop."""
        if not self.activated:
            return False

        if self.side == Side.BUY:
            # Buy stop triggers when price >= stop_price
            return current_price >= self.stop_price
        else:
            # Sell stop triggers when price <= stop_price
            return current_price <= self.stop_price

    def to_dict(self) -> dict:
        base_dict = super().to_dict()
        base_dict.update({
            "trail_amount": self.trail_amount,
            "trail_percentage": self.trail_percentage,
            "stop_price": self.stop_price,
            "highest_price": self.highest_price,
            "lowest_price": self.lowest_price,
            "activated": self.activated,
        })
        return base_dict


@dataclass
class OCOGroup:
    """One-Cancels-the-Other order group with linked orders."""
    id: str
    orders: list[Order] = field(default_factory=list)
    filled_order_id: str | None = None  # Which order was filled
    cancelled_order_ids: list[str] = field(default_factory=list)
    timestamp: int = field(default_factory=lambda: int(time.time()))

    def add_order(self, order: Order) -> None:
        """Add an order to the OCO group."""
        self.orders.append(order)

    def on_fill(self, filled_order_id: str) -> list[Order]:
        """Handle order fill - cancel all other orders in group."""
        self.filled_order_id = filled_order_id
        to_cancel = []
        for order in self.orders:
            if order.id != filled_order_id and order.status == OrderStatus.PENDING:
                order.status = OrderStatus.CANCELLED
                self.cancelled_order_ids.append(order.id)
                to_cancel.append(order)
        return to_cancel

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "orders": [o.to_dict() for o in self.orders],
            "filled_order_id": self.filled_order_id,
            "cancelled_order_ids": self.cancelled_order_ids,
            "timestamp": self.timestamp,
        }


@dataclass
class IcebergOrder(Order):
    """Iceberg order with hidden/visible quantity logic."""
    visible_quantity: float = 0.0  # Quantity visible in order book
    hidden_quantity: float = 0.0  # Hidden quantity
    slice_size: float = 0.0  # Size of each slice
    slices_remaining: int = 0  # Number of slices left to fill
    current_slice_filled: float = 0.0  # Amount filled in current slice
    replenished: int = 0  # Number of times hidden quantity has been replenished

    def __post_init__(self):
        """Initialize iceberg order parameters."""
        if self.slice_size > 0:
            self.slices_remaining = int((self.hidden_quantity / self.slice_size) + 0.5)
        else:
            self.slices_remaining = 0

    def get_visible_quantity(self) -> float:
        """Get current visible quantity in order book."""
        if self.slices_remaining > 0:
            return min(self.visible_quantity, self.slice_size)
        return self.visible_quantity

    def on_fill(self, fill_quantity: float) -> tuple[float, bool]:
        """Handle fill - return (remaining_to_fill, should_replenish)."""
        self.current_slice_filled += fill_quantity
        remaining = self.slice_size - self.current_slice_filled

        # If current slice is filled, replenish from hidden quantity
        if self.current_slice_filled >= self.slice_size and self.slices_remaining > 0:
            self.slices_remaining -= 1
            self.current_slice_filled = 0
            return max(0, remaining), True

        return max(0, remaining), False

    def to_dict(self) -> dict:
        base_dict = super().to_dict()
        base_dict.update({
            "visible_quantity": self.visible_quantity,
            "hidden_quantity": self.hidden_quantity,
            "slice_size": self.slice_size,
            "slices_remaining": self.slices_remaining,
            "current_slice_filled": self.current_slice_filled,
            "replenished": self.replenished,
        })
        return base_dict


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


@dataclass
class AuditLog:
    """Comprehensive audit log entry for system events."""
    id: str
    event_type: AuditEventType
    timestamp: int = field(default_factory=lambda: int(time.time()))
    exchange: str = ""
    symbol: str = ""
    user_id: str = "system"
    session_id: str = ""

    # Event-specific data
    order_id: str = ""
    position_id: str = ""
    old_value: float = 0.0
    new_value: float = 0.0
    reason: str = ""

    # Additional metadata
    metadata: dict = field(default_factory=dict)
    ip_address: str = ""
    user_agent: str = ""

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "event_type": self.event_type.value,
            "timestamp": self.timestamp,
            "exchange": self.exchange,
            "symbol": self.symbol,
            "user_id": self.user_id,
            "session_id": self.session_id,
            "order_id": self.order_id,
            "position_id": self.position_id,
            "old_value": self.old_value,
            "new_value": self.new_value,
            "reason": self.reason,
            "metadata": self.metadata,
            "ip_address": self.ip_address,
            "user_agent": self.user_agent,
        }
