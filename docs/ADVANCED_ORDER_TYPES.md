# Advanced Order Types

This document describes the advanced order types implemented in the HFT Trading System.

## Overview

The system supports the following advanced order types beyond basic Market and Limit orders:

- **Stop-Limit Orders** - Trigger at a stop price, execute at a limit price
- **Trailing Stop Orders** - Dynamic stop price that follows favorable price movements
- **OCO (One-Cancels-the-Other) Orders** - Linked orders where one cancels the other
- **Iceberg Orders** - Large orders split into visible and hidden portions

## Stop-Limit Orders

### Description

A stop-limit order combines a stop order with a limit order. It becomes a limit order only when a specified stop price is reached. This provides more control over the execution price compared to a stop-market order.

### How It Works

1. **Stop Price**: The price at which the order becomes active
2. **Limit Price**: The maximum (for buy) or minimum (for sell) price at which the order will execute
3. **Trigger Logic**:
   - Buy stop: Triggers when market price >= stop price
   - Sell stop: Triggers when market price <= stop price

### Use Cases

- **Stop Loss**: Limit losses by selling when price drops below a threshold
- **Take Profit**: Lock in gains by selling when price rises above a threshold
- **Breakout Trading**: Enter a position when price breaks through a key level

### Example

```python
from exchange_simulator.models import StopLimitOrder, Side, OrderType

# Buy stop-limit: Buy when price reaches $50,000, but no higher than $50,100
order = StopLimitOrder(
    id="order_001",
    symbol="BTC/USDT",
    exchange="binance",
    side=Side.BUY,
    order_type=OrderType.STOP_LIMIT,
    quantity=0.1,
    stop_price=50000.0,
    limit_price=50100.0,
)
```

### API

```python
class StopLimitOrder(Order):
    stop_price: float = 0.0      # Trigger price
    limit_price: float = 0.0     # Execution limit price
    triggered: bool = False      # Whether stop price has been hit
    
    def check_trigger(self, current_price: float) -> bool:
        """Check if stop price should trigger the order."""
```

## Trailing Stop Orders

### Description

A trailing stop order automatically adjusts the stop price as the market price moves in a favorable direction. This allows you to lock in profits while giving the trade room to grow.

### How It Works

1. **Trail Amount**: The distance the stop price trails behind the market price
2. **Trail Mode**: Can be percentage-based or absolute value
3. **Activation**: The stop price is set when the order is first activated
4. **Adjustment**: The stop price moves only in the favorable direction
5. **Trigger**: Order executes when market price crosses the trailing stop price

### Use Cases

- **Profit Protection**: Lock in gains as price moves favorably
- **Trend Following**: Ride trends while protecting against reversals
- **Volatility Management**: Adjust stop distance based on market conditions

### Example

```python
from exchange_simulator.models import TrailingStopOrder, Side, OrderType

# Sell trailing stop: 5% below current price, follows price up
order = TrailingStopOrder(
    id="order_002",
    symbol="BTC/USDT",
    exchange="binance",
    side=Side.SELL,
    order_type=OrderType.TRAILING_STOP,
    quantity=0.1,
    trail_amount=5.0,           # 5% trail
    trail_percentage=True,     # Use percentage mode
)
```

### API

```python
class TrailingStopOrder(Order):
    trail_amount: float = 0.0          # Trailing distance
    trail_percentage: bool = True      # True = %, False = absolute
    stop_price: float = 0.0            # Current stop price
    highest_price: float = 0.0         # Highest price seen (long)
    lowest_price: float = 0.0          # Lowest price seen (short)
    activated: bool = False            # Whether trailing has started
    
    def update_stop_price(self, current_price: float) -> None:
        """Update stop price based on current price movement."""
        
    def check_trigger(self, current_price: float) -> bool:
        """Check if current price triggers the trailing stop."""
```

## OCO (One-Cancels-the-Other) Orders

### Description

An OCO order consists of two linked orders where the execution of one automatically cancels the other. This is commonly used for take-profit and stop-loss orders on the same position.

### How It Works

1. **Order Group**: Two orders are linked together in an OCO group
2. **Execution**: When one order fills, the other is automatically cancelled
3. **Tracking**: The system tracks which order filled and which was cancelled
4. **Idempotency**: Ensures only one order from the group can execute

### Use Cases

- **Take Profit + Stop Loss**: Set both exit conditions simultaneously
- **Dual Entry Points**: Enter at either of two price levels
- **Risk Management**: Automatically remove opposite order when one executes

### Example

```python
from exchange_simulator.models import OCOGroup, Order, Side, OrderType

# Create OCO group for take-profit and stop-loss
oco_group = OCOGroup(id="oco_001")

# Take profit order at $55,000
tp_order = Order(
    id="tp_001",
    symbol="BTC/USDT",
    exchange="binance",
    side=Side.SELL,
    order_type=OrderType.LIMIT,
    quantity=0.1,
    price=55000.0,
)

# Stop loss order at $45,000
sl_order = Order(
    id="sl_001",
    symbol="BTC/USDT",
    exchange="binance",
    side=Side.SELL,
    order_type=OrderType.STOP_LIMIT,
    quantity=0.1,
    stop_price=45000.0,
    limit_price=44900.0,
)

oco_group.add_order(tp_order)
oco_group.add_order(sl_order)
```

### API

```python
class OCOGroup:
    id: str
    orders: list[Order] = []
    filled_order_id: str | None = None
    cancelled_order_ids: list[str] = []
    
    def add_order(self, order: Order) -> None:
        """Add an order to the OCO group."""
        
    def on_fill(self, filled_order_id: str) -> list[Order]:
        """Handle order fill - cancel all other orders in group."""
```

## Iceberg Orders

### Description

An iceberg order displays only a small portion of the total order quantity in the order book, hiding the remaining quantity. This prevents market impact from large orders while maintaining execution priority.

### How It Works

1. **Visible Quantity**: The amount shown in the order book
2. **Hidden Quantity**: The amount hidden from the market
3. **Slice Size**: The size of each visible slice
4. **Replenishment**: When a slice is filled, a new slice becomes visible
5. **Priority**: Maintains time priority across all slices

### Use Cases

- **Large Order Execution**: Execute large orders without revealing full size
- **Market Impact Reduction**: Minimize price impact from large trades
- **Stealth Trading**: Hide true trading intentions from competitors

### Example

```python
from exchange_simulator.models import IcebergOrder, Side, OrderType

# Buy 10 BTC, but only show 0.1 BTC at a time
order = IcebergOrder(
    id="order_003",
    symbol="BTC/USDT",
    exchange="binance",
    side=Side.BUY,
    order_type=OrderType.ICEBERG,
    quantity=10.0,
    price=50000.0,
    visible_quantity=0.1,      # Show 0.1 BTC
    hidden_quantity=9.9,        # Hide 9.9 BTC
    slice_size=0.1,             # Replenish in 0.1 BTC slices
)
```

### API

```python
class IcebergOrder(Order):
    visible_quantity: float = 0.0      # Quantity visible in order book
    hidden_quantity: float = 0.0       # Hidden quantity
    slice_size: float = 0.0            # Size of each slice
    slices_remaining: int = 0          # Number of slices left
    current_slice_filled: float = 0.0  # Amount filled in current slice
    
    def get_visible_quantity(self) -> float:
        """Get current visible quantity in order book."""
        
    def on_fill(self, fill_quantity: float) -> tuple[float, bool]:
        """Handle fill - return (remaining_to_fill, should_replenish)."""
```

## Order Type Comparison

| Order Type | Trigger Condition | Execution Price | Use Case |
|------------|------------------|-----------------|----------|
| Market | Immediate | Best available | Quick entry/exit |
| Limit | Price level | Specified or better | Precise entry/exit |
| Stop-Limit | Stop price reached | Limit price or better | Stop loss with price control |
| Trailing Stop | Price crosses trailing stop | Market price | Profit protection |
| OCO | Linked order fills | Varies | Take profit + stop loss |
| Iceberg | Continuous | Limit price | Large order execution |

## Implementation Notes

### Order Type Enum

```python
class OrderType(Enum):
    MARKET = "MARKET"
    LIMIT = "LIMIT"
    STOP_LIMIT = "STOP_LIMIT"
    TRAILING_STOP = "TRAILING_STOP"
    OCO = "OCO"
    ICEBERG = "ICEBERG"
```

### Execution Flow

1. **Order Submission**: Order is created and validated
2. **Trigger Check**: For conditional orders, check trigger conditions
3. **Order Matching**: Match against order book
4. **Fill Execution**: Execute at specified price
5. **Position Update**: Update positions and account balance
6. **Audit Logging**: Log all order events

### Risk Considerations

- **Stop-Limit**: May not execute if price gaps past limit price
- **Trailing Stop**: Can be stopped out by normal volatility
- **OCO**: Only one order executes, the other is cancelled
- **Iceberg**: May take longer to fill full quantity

## Testing

Each order type includes comprehensive unit tests:

```bash
# Run order type tests
pytest exchange_simulator/tests/test_order_types.py -v
```

## References

- [Binance Order Types](https://www.binance.com/en/support/faq/how-to-use-oco-order-360033636391)
- [Bybit Order Types](https://help.bybit.com/hc/en-us/articles/360038029093-Order-Types)
- [Coinbase Order Types](https://help.coinbase.com/en/pro/trading-and-funding/orders)
