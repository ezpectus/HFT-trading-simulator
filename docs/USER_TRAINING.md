# User Training Guide

This guide provides comprehensive training for users of the HFT Trading System, covering all features from basic to advanced.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Basic Operations](#basic-operations)
3. [Advanced Order Types](#advanced-order-types)
4. [Exchange UI Clones](#exchange-ui-clones)
5. [Audit Logging](#audit-logging)
6. [Risk Management](#risk-management)
7. [Trading Strategies](#trading-strategies)
8. [Troubleshooting](#troubleshooting)

## Getting Started

### System Overview

The HFT Trading System is an educational platform for learning high-frequency trading concepts. It includes:

- **Exchange Simulator** - Simulated cryptocurrency exchange with 50+ trading pairs
- **AI Signal Bot** - AI-powered trading signal generation
- **HFT Trade Bot** - High-frequency trading execution engine
- **Web UI** - Browser-based trading dashboard

### Prerequisites

- Basic understanding of cryptocurrency trading
- Familiarity with trading concepts (orders, positions, PnL)
- Web browser (Chrome, Firefox, Safari, Edge)
- Internet connection (for Web UI)

### First-Time Setup

1. **Start the System**
   ```bash
   # Docker deployment (recommended)
   docker-compose up -d
   
   # Or native deployment
   ./scripts/deploy.sh deploy
   ```

2. **Access the Web UI**
   - Open browser to `http://localhost:3000`
   - You should see the trading dashboard

3. **Explore the Interface**
   - Left panel: Navigation and symbol selection
   - Center: Charts and order book
   - Right: Order form and positions
   - Bottom: Trade history and audit logs

## Basic Operations

### Placing Orders

#### Market Orders

Market orders execute immediately at the current market price.

**Steps:**
1. Select a symbol from the symbol list
2. Choose "Market" as order type
3. Select Buy or Sell
4. Enter quantity
5. Click "Place Order"

**Example:**
- Symbol: BTC/USDT
- Order Type: Market
- Side: Buy
- Quantity: 0.1
- Result: Order fills immediately at current price

#### Limit Orders

Limit orders execute only at a specified price or better.

**Steps:**
1. Select a symbol
2. Choose "Limit" as order type
3. Select Buy or Sell
4. Enter quantity
5. Enter limit price
6. Click "Place Order"

**Example:**
- Symbol: BTC/USDT
- Order Type: Limit
- Side: Buy
- Quantity: 0.1
- Price: 49,000
- Result: Order waits for price to reach 49,000 or lower

### Managing Positions

#### Viewing Positions

Open positions are displayed in the Positions panel:
- Symbol
- Side (Long/Short)
- Entry price
- Current price
- Quantity
- Unrealized PnL
- Liquidation price
- Stop Loss / Take Profit

#### Closing Positions

**Method 1: Market Close**
1. Click "Close" button on position
2. Confirm close
3. Position closes at current market price

**Method 2: Limit Close**
1. Click "Close" button
2. Select "Limit" close
3. Enter target price
4. Position closes when price reaches target

### Stop Loss and Take Profit

Set automatic exit points for positions:

**Stop Loss:**
- Limits potential losses
- Triggers when price moves against position
- Example: Buy at 50,000, SL at 48,000 (2% risk)

**Take Profit:**
- Locks in profits
- Triggers when price moves in favor
- Example: Buy at 50,000, TP at 52,000 (4% profit)

**Setting SL/TP:**
1. Open position or place order
2. In order form, expand "Advanced Options"
3. Enter Stop Loss price
4. Enter Take Profit price
5. Place order

## Advanced Order Types

### Stop-Limit Orders

Stop-limit orders combine stop orders with limit orders. They trigger when price reaches a stop price, then execute as a limit order.

**When to Use:**
- You want to enter a position when price breaks a level
- You want to control the execution price
- You want to avoid slippage

**Example:**
- Symbol: BTC/USDT
- Side: Buy
- Stop Price: 51,000 (triggers when price hits 51,000)
- Limit Price: 51,100 (executes at 51,100 or better)
- Quantity: 0.1

**Steps:**
1. Select "Stop-Limit" from order type dropdown
2. Enter stop price
3. Enter limit price
4. Enter quantity
5. Click "Place Order"

### Trailing Stop Orders

Trailing stop orders automatically adjust the stop price as the price moves in your favor.

**When to Use:**
- You want to lock in profits as price moves favorably
- You want to let winners run while limiting downside
- Trend-following strategies

**Example:**
- Symbol: BTC/USDT
- Side: Sell (short position)
- Trail Amount: 5% (or 2,500 USDT)
- Initial price: 50,000
- Stop price adjusts as price drops

**Steps:**
1. Select "Trailing Stop" from order type dropdown
2. Enter trail amount
3. Choose percentage or absolute value
4. Enter quantity
5. Click "Place Order"

### OCO (One-Cancels-the-Other) Orders

OCO orders consist of two linked orders. When one fills, the other is automatically cancelled.

**When to Use:**
- You want to set both stop loss and take profit
- You want to exit at either target
- Risk management

**Example:**
- Order 1: Limit Sell at 52,000 (take profit)
- Order 2: Stop-Limit Sell at 48,000 (stop loss)
- Quantity: 0.1 BTC
- When either fills, the other cancels

**Steps:**
1. Select "OCO" from order type dropdown
2. Enter first order details (TP)
3. Enter second order details (SL)
4. Enter quantity
5. Click "Place Order"

### Iceberg Orders

Iceberg orders hide the full order quantity, showing only a small portion (the "tip of the iceberg").

**When to Use:**
- You want to trade large quantities without revealing full size
- You want to minimize market impact
- Institutional trading

**Example:**
- Total Quantity: 10 BTC
- Visible Quantity: 0.1 BTC
- Slice Size: 0.1 BTC
- Only 0.1 BTC visible at a time, automatically replenished

**Steps:**
1. Select "Iceberg" from order type dropdown
2. Enter total quantity
3. Enter visible quantity
4. Enter slice size
5. Click "Place Order"

## Exchange UI Clones

The system includes three exchange-themed UI clones that replicate popular cryptocurrency exchanges.

### Switching Between Exchanges

**Method 1: Exchange Selector**
1. Click exchange selector in top navigation
2. Select desired exchange (Binance, Bybit, Coinbase)
3. UI theme and layout change automatically

**Method 2: Keyboard Shortcut**
- Press `1` for Binance
- Press `2` for Bybit
- Press `3` for Coinbase

### Binance UI

**Theme:** Dark with yellow accents
**Layout:** Compact, information-dense
**Features:**
- Yellow buy buttons, red sell buttons
- Compact order book with depth bars
- Quick-trade percentage buttons (25%, 50%, 75%, 100%)
- Per-exchange fee breakdown

### Bybit UI

**Theme:** Dark with blue/yellow accents
**Layout:** Minimal, clean
**Features:**
- Minimalist design
- Compact input fields
- Simplified order book
- Clear spread information

### Coinbase UI

**Theme:** Light/dark with blue accents
**Layout:** Clean, spacious
**Features:**
- Large, clear input fields
- Prominent buy/sell buttons
- Detailed order summary
- Clean typography

### Customizing Exchange UI

Each exchange UI clone supports the same underlying functionality:
- All order types (Market, Limit, Stop-Limit, Trailing Stop, OCO, Iceberg)
- All 50+ symbols
- Audit logging
- Advanced features

Choose the UI that best fits your preference - all are functionally equivalent.

## Audit Logging

The system maintains comprehensive audit logs of all trading activities.

### Viewing Audit Logs

1. Navigate to "Audit Logs" panel
2. Logs display in reverse chronological order
3. Each log shows:
   - Timestamp
   - Event type
   - Exchange
   - Symbol
   - Details

### Filtering Audit Logs

**By Event Type:**
- Order lifecycle (submitted, filled, cancelled, rejected)
- Position lifecycle (opened, closed, modified)
- Account changes (balance, fees, PnL)
- System events (start, stop, errors)

**By Exchange:**
- Binance
- Bybit
- OKX

**By Symbol:**
- Select specific symbol from dropdown

**By Time Range:**
- Set start and end dates
- Click "Apply Filter"

### Exporting Audit Logs

**Export to JSON:**
1. Click "Export" button
2. Select "JSON"
3. File downloads with all filtered logs

**Export to CSV:**
1. Click "Export" button
2. Select "CSV"
3. File downloads with all filtered logs
- Compatible with Excel, Google Sheets

### Audit Log Statistics

View audit log statistics:
- Total events
- Event counts by type
- Events by exchange
- Events by symbol
- Time range
- Unique users/sessions

### Audit Log Details

Click on any audit log entry to expand and view:
- Full metadata
- Related order/position IDs
- Execution details
- Error messages (if applicable)

## Risk Management

### Position Sizing

**Fixed Amount:**
- Trade fixed quantity per trade
- Example: Always trade 0.1 BTC

**Percentage of Balance:**
- Trade percentage of account balance
- Example: 10% of balance per trade
- Automatically adjusts as balance changes

**Kelly Criterion:**
- Optimal position sizing based on win rate and risk/reward
- Formula: f* = (bp - q) / b
- Where: b = win/loss ratio, p = win probability, q = loss probability

### Risk Limits

**Daily Loss Limit:**
- Stop trading if daily loss exceeds threshold
- Default: 8% of account balance
- Configurable in settings

**Maximum Drawdown:**
- Stop trading if total drawdown exceeds threshold
- Default: 20% of account balance
- Configurable in settings

**Maximum Position Size:**
- Limit size of individual positions
- Default: 10% of account balance
- Configurable in settings

### Risk:Reward Ratio

**Minimum R:R:**
- Only take trades with favorable risk/reward
- Default: 1.5 (reward 1.5x risk)
- Example: Risk 2%, Reward 3% (R:R = 1.5)

**Calculating R:R:**
- Entry: 50,000
- Stop Loss: 49,000 (Risk: 1,000)
- Take Profit: 52,000 (Reward: 2,000)
- R:R = 2,000 / 1,000 = 2.0

### Portfolio Risk

**Correlation:**
- Avoid highly correlated positions
- Diversify across different symbols
- Monitor portfolio exposure

**Leverage:**
- Use leverage cautiously
- Higher leverage = higher risk
- Default: 10x (configurable)

**Margin Requirements:**
- Maintain sufficient margin
- Monitor margin levels
- Avoid margin calls

## Trading Strategies

### Trend Following

**Concept:** Follow the trend until it reverses

**Indicators:**
- EMA (Exponential Moving Average)
- ADX (Average Directional Index)
- MACD (Moving Average Convergence Divergence)

**Setup:**
1. Wait for EMA crossover (fast above slow = uptrend)
2. Confirm with ADX > 25 (strong trend)
3. Enter on pullback to EMA
4. Set stop loss below recent low
5. Take profit at next resistance level

**Example:**
- BTC/USDT
- EMA 9 crosses above EMA 21
- ADX at 30
- Enter at 50,000
- SL at 48,000
- TP at 55,000

### Mean Reversion

**Concept:** Price tends to return to mean

**Indicators:**
- RSI (Relative Strength Index)
- Bollinger Bands
- VWAP (Volume Weighted Average Price)

**Setup:**
1. Wait for RSI oversold (< 30) or overbought (> 70)
2. Confirm with Bollinger Bands
3. Enter when price reverts
4. Set tight stop loss
5. Take profit at mean

**Example:**
- BTC/USDT
- RSI at 25 (oversold)
- Price at lower Bollinger Band
- Enter at 48,000
- SL at 47,000
- TP at 50,000

### Statistical Arbitrage

**Concept:** Exploit price relationships between correlated assets

**Indicators:**
- Cointegration
- Z-score
- Correlation matrix

**Setup:**
1. Identify cointegrated pairs
2. Calculate z-score of spread
3. Enter when z-score > 2 (overextended)
4. Exit when z-score reverts to 0
5. Pairs trade (long one, short other)

**Example:**
- BTC/USDT and ETH/USDT
- Cointegrated
- Spread z-score at 2.5
- Long BTC, Short ETH
- Exit when z-score returns to 0

### Market Making

**Concept:** Provide liquidity by placing limit orders

**Indicators:**
- Order book depth
- Spread
- Volatility

**Setup:**
1. Analyze order book
2. Place buy order below current price
3. Place sell order above current price
4. Capture spread
5. Adjust based on inventory

**Example:**
- BTC/USDT
- Current price: 50,000
- Buy at 49,990
- Sell at 50,010
- Capture 20 point spread

## Troubleshooting

### Common Issues

**Order Not Filling:**
- Check if order is still pending
- Verify price hasn't moved away
- Check if sufficient margin
- Review order type (limit orders may not fill immediately)

**Position Not Showing:**
- Refresh the page
- Check positions panel
- Verify order was filled
- Check symbol filter

**WebSocket Disconnected:**
- Check internet connection
- Refresh the page
- Check if backend services are running
- Review browser console for errors

**Audit Logs Not Updating:**
- Check if audit logging is enabled
- Verify filter settings
- Refresh the page
- Check backend logs

### Getting Help

**Documentation:**
- Review this guide
- Check API documentation
- Read configuration reference

**Logs:**
- Check browser console
- Review backend logs
- Examine audit logs

**Community:**
- GitHub issues
- Discussion forums
- Support channels

### Performance Issues

**Slow Performance:**
- Reduce number of active symbols
- Close unused panels
- Check system resources
- Disable animations

**High Latency:**
- Check internet connection
- Verify backend performance
- Reduce symbol count
- Check for network congestion

## Best Practices

### Trading

1. **Start Small:** Begin with small position sizes
2. **Use Stop Losses:** Always set stop losses
3. **Diversify:** Don't put all capital in one position
4. **Keep Records:** Review trade history regularly
5. **Stay Disciplined:** Follow your trading plan

### Risk Management

1. **Never Risk More Than You Can Afford to Lose**
2. **Use Proper Position Sizing**
3. **Set Realistic Targets**
4. **Monitor Your Positions**
5. **Review Your Performance**

### System Usage

1. **Keep Software Updated**
2. **Regular Backups**
3. **Monitor System Health**
4. **Review Audit Logs**
5. **Report Issues Promptly**

## Next Steps

After completing this training guide:

1. **Practice in Paper Trading Mode**
   - Use paper trading to practice
   - Test different strategies
   - Build confidence

2. **Explore Advanced Features**
   - Try advanced order types
   - Experiment with different UI themes
   - Use audit logging for analysis

3. **Develop Your Strategy**
   - Backtest your ideas
   - Paper trade your strategy
   - Refine based on results

4. **Continue Learning**
   - Read additional documentation
   - Explore trading strategies
   - Stay updated on market trends

## Resources

- [Architecture Documentation](ARCHITECTURE.md)
- [Configuration Reference](CONFIGURATION_REFERENCE.md)
- [Deployment Guide](DEPLOYMENT.md)
- [Advanced Order Types](ADVANCED_ORDER_TYPES.md)
- [Audit Logging](AUDIT_LOGGING.md)
- [Exchange UI Clones](EXCHANGE_UI_CLONES.md)
