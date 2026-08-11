# User Guide

Complete user manual for the HFT Trading System educational platform.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Basic Operations](#basic-operations)
3. [Advanced Order Types](#advanced-order-types)
4. [Exchange UI Clones](#exchange-ui-clones)
5. [Audit Logging](#audit-logging)
6. [Risk Management](#risk-management)
7. [Trading Strategies](#trading-strategies)

---

## Getting Started

### Prerequisites

- Python 3.12+
- Node.js 18+
- Docker (optional but recommended)
- 8GB RAM minimum (16GB recommended)

### Quick Start

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd trading-system-lite
   ```

2. **Install dependencies:**
   ```bash
   make install
   ```

3. **Start the system:**
   ```bash
   make dev
   ```

4. **Open the Web UI:**
   Navigate to `http://localhost:3000`

### First Steps

1. **Connect to the Exchange:**
   - The Web UI automatically connects to the exchange simulator
   - Check the WebSocket status indicator (green = connected)

2. **View Available Symbols:**
   - The system supports 50+ cryptocurrency symbols
   - View them in the symbol list panel

3. **Place Your First Order:**
   - Select a symbol (e.g., BTC/USDT)
   - Choose order type (Market or Limit)
   - Enter quantity and price
   - Click "Buy" or "Sell"

---

## Basic Operations

### Placing Orders

#### Market Orders
Market orders execute immediately at the current best available price.

1. Select the symbol
2. Choose "Market" as order type
3. Enter quantity
4. Click "Buy" or "Sell"

#### Limit Orders
Limit orders execute only at a specified price or better.

1. Select the symbol
2. Choose "Limit" as order type
3. Enter quantity and price
4. Click "Buy" or "Sell"

### Managing Positions

#### View Open Positions
- Open positions are displayed in the positions panel
- Shows entry price, current price, unrealized PnL, and leverage

#### Close a Position
- Click the "Close" button next to the position
- Or place an opposing order (sell to close long, buy to close short)

#### View Trade History
- Closed trades appear in the Trade History panel
- Shows entry/exit prices, PnL, and close reason (TP, SL, Manual)

### Account Information

#### Check Balance
- Your account balance is displayed in the header
- Shows available USDT for trading

#### View Margin
- Margin requirements are shown per position
- Based on position size and leverage

---

## Advanced Order Types

### Stop-Limit Orders

A stop-limit order becomes a limit order when a specified price (stop price) is reached.

**When to use:**
- Limit losses while controlling execution price
- Enter positions when price breaks a key level

**How to place:**
1. Select "Stop-Limit" as order type
2. Enter stop price (trigger price)
3. Enter limit price (execution price)
4. Enter quantity
5. Click "Buy" or "Sell"

**Example:**
- Stop price: $65,000
- Limit price: $65,100
- When BTC reaches $65,000, a limit order at $65,100 is placed

### Trailing Stop Orders

A trailing stop order adjusts the stop price as the price moves favorably.

**When to use:**
- Lock in profits while allowing upside
- Protect gains without setting a fixed price

**How to place:**
1. Select "Trailing Stop" as order type
2. Enter trailing percentage (e.g., 5%)
3. Enter quantity
4. Click "Buy" or "Sell"

**Example:**
- Trailing %: 5%
- If you're long at $65,000 and price rises to $70,000
- Stop price adjusts to $66,500 (5% below current price)

### OCO (One-Cancels-the-Other) Orders

Two orders linked together: if one fills, the other is automatically cancelled.

**When to use:**
- Set both take profit and stop loss simultaneously
- Ensure only one order executes

**How to place:**
1. Select "OCO" as order type
2. Enter take profit price and quantity
3. Enter stop loss price and quantity
4. Click "Place OCO"

**Example:**
- Take profit: $68,000
- Stop loss: $63,000
- If price hits $68,000, TP executes and SL is cancelled
- If price hits $63,000, SL executes and TP is cancelled

### Iceberg Orders

A large order split into smaller visible portions to hide full size.

**When to use:**
- Execute large orders without revealing full size
- Reduce market impact

**How to place:**
1. Select "Iceberg" as order type
2. Enter total quantity
3. Enter visible quantity (per slice)
4. Click "Buy" or "Sell"

**Example:**
- Total quantity: 10 BTC
- Visible quantity: 0.5 BTC
- System places 0.5 BTC orders until 10 BTC is filled

---

## Exchange UI Clones

The system includes three exchange UI clones for educational purposes:

### Binance UI

**Features:**
- Dark theme with yellow accents
- 20-level order book depth
- Advanced order form with conditional orders
- Leverage slider and margin mode selection

**How to switch:**
- Click the exchange selector in the header
- Select "Binance"

### Bybit UI

**Features:**
- Dark theme with purple accents
- Conditional orders with price triggers
- 20-level order book with volume bars
- Leverage up to 100x

**How to switch:**
- Click the exchange selector in the header
- Select "Bybit"

### Coinbase UI

**Features:**
- Clean, minimal design
- Simple limit/market orders
- USD amount input
- 10-level order book
- Order confirmation modal

**How to switch:**
- Click the exchange selector in the header
- Select "Coinbase"

---

## Audit Logging

### Viewing Audit Logs

The system maintains comprehensive audit logs of all system events.

**Access:**
- Navigate to the "Audit Logs" panel
- Logs are categorized by level (INFO, WARNING, ERROR, CRITICAL)

### Filtering Logs

**By Event Type:**
- ORDER_SUBMITTED
- ORDER_FILLED
- ORDER_CANCELLED
- POSITION_OPENED
- POSITION_CLOSED
- ERROR
- WARNING

**By Exchange:**
- Filter logs by specific exchange

**By Symbol:**
- Filter logs by trading symbol

**By Date Range:**
- Set start and end dates to filter

### Exporting Logs

**Export as JSON:**
- Click the export button
- Select "Export JSON"

**Export as CSV:**
- Click the export button
- Select "Export CSV"

### Log Details

Each log entry includes:
- Timestamp
- Event type
- User ID
- Session ID
- Exchange
- Symbol
- Order ID
- Message
- Additional metadata

---

## Risk Management

### Position Sizing

**Risk per Trade:**
- Recommended: 1-2% of account balance per trade
- Maximum: 5% of account balance per trade

**Example:**
- Account balance: $10,000
- Risk per trade (2%): $200
- If stop loss is 5% away, position size = $200 / 0.05 = $4,000

### Leverage

**Recommended Leverage:**
- Beginners: 1-5x
- Intermediate: 5-10x
- Advanced: 10-20x (with strict risk management)

**Warning:**
- Higher leverage = higher risk
- Leverage amplifies both gains AND losses

### Stop Loss

**Always use stop loss:**
- Set stop loss before entering position
- Place stop loss at logical price levels (support/resistance)
- Risk/reward ratio should be at least 1:2

**Example:**
- Entry: $65,000
- Stop loss: $64,000 (risk $1,000)
- Take profit: $67,000 (reward $2,000)
- Risk/reward: 1:2

### Take Profit

**Set realistic targets:**
- Based on technical analysis
- Consider average true range (ATR)
- Don't be greedy - lock in profits

### Daily Loss Limits

**Set a daily loss limit:**
- Recommended: 5% of account balance
- Stop trading if limit is reached
- Review what went wrong

---

## Trading Strategies

### Trend Following

**Concept:**
- Trade in the direction of the trend
- "The trend is your friend"

**Indicators:**
- Moving averages (EMA, SMA)
- MACD
- ADX (trend strength)

**How to use:**
1. Identify trend using moving averages
2. Enter on pullbacks in trend direction
3. Set stop loss below recent swing low
4. Take profit at next resistance level

### Mean Reversion

**Concept:**
- Price tends to return to mean
- Trade overbought/oversold conditions

**Indicators:**
- RSI (Relative Strength Index)
- Bollinger Bands
- Stochastic

**How to use:**
1. Wait for RSI > 70 (overbought) or RSI < 30 (oversold)
2. Enter opposite direction
3. Set tight stop loss
4. Take profit at mean price

### Arbitrage

**Concept:**
- Profit from price differences between exchanges
- Risk-free if executed simultaneously

**Types:**
- Spatial arbitrage (different exchanges)
- Statistical arbitrage (correlated assets)

**How to use:**
1. Monitor prices across exchanges
2. Identify price discrepancies
3. Buy on lower-priced exchange
4. Sell on higher-priced exchange
5. Execute simultaneously

### Market Making

**Concept:**
- Provide liquidity by placing both bid and ask orders
- Profit from bid-ask spread

**Risks:**
- Inventory risk (adverse price movement)
- Spread compression

**How to use:**
1. Place limit orders on both sides
2. Keep orders near current price
3. Manage inventory size
4. Adjust spread based on volatility

---

## Tips and Best Practices

1. **Start Small:**
   - Begin with small position sizes
   - Increase size as you gain experience

2. **Keep a Trading Journal:**
   - Record all trades
   - Note reasons for entry/exit
   - Review and learn from mistakes

3. **Don't Overtrade:**
   - Quality over quantity
   - Wait for high-probability setups

4. **Manage Emotions:**
   - Don't trade when emotional
   - Stick to your plan
   - Accept losses as part of trading

5. **Stay Informed:**
   - Follow market news
   - Understand market drivers
   - Be aware of scheduled events

6. **Use the Educational Resources:**
   - Read the mathematical models documentation
   - Study the trading strategies guide
   - Review the architecture documentation

---

## Getting Help

### Documentation

- [Architecture Guide](ARCHITECTURE.md)
- [Trading Strategies](TRADING_STRATEGIES.md)
- [Mathematical Models](MATH_MODELS.md)
- [WebSocket Protocol](WEBSOCKET_PROTOCOL.md)
- [REST API Reference](REST_API.md)

### Troubleshooting

See [Troubleshooting Guide](TROUBLESHOOTING.md) for common issues and solutions.

### Community

- Check the [FAQ](FAQ.md) for common questions
- Review [Educational Content](EDUCATIONAL_CONTENT.md)

---

## Disclaimer

This is a **simulated trading environment** for educational purposes only. No real money is involved, and no financial advice is provided. Always practice responsible risk management in real trading.
