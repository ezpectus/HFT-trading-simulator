# Tutorials and User Guides

This document provides step-by-step tutorials for using the HFT Trading System educational platform.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Basic Trading Tutorial](#basic-trading-tutorial)
3. [Advanced Order Types](#advanced-order-types)
4. [Exchange UI Switching](#exchange-ui-switching)
5. [Price Feed Configuration](#price-feed-configuration)
6. [Audit Log Usage](#audit-log-usage)
7. [Backtesting Strategies](#backtesting-strategies)
8. [Signal Engine Usage](#signal-engine-usage)
9. [Multi-Exchange Arbitrage](#multi-exchange-arbitrage)
10. [Performance Monitoring](#performance-monitoring)

---

## Getting Started

### Prerequisites

- Python 3.12+
- Node.js 18+
- C++ compiler (GCC/Clang/MSVC)
- Docker (optional)

### Installation

#### Windows

```bat
git clone https://github.com/ezpectus/HFT-TradeBot--Lite-version.git
cd HFT-TradeBot--Lite-version
install-deps.bat
no-docker.bat
```

#### Linux/macOS

```bash
git clone https://github.com/ezpectus/HFT-TradeBot--Lite-version.git
cd HFT-TradeBot--Lite-version
./no-docker.sh install
./no-docker.sh start
```

#### Docker

```bash
git clone https://github.com/ezpectus/HFT-TradeBot--Lite-version.git
cd HFT-TradeBot--Lite-version
docker-compose up
```

### First Steps

1. Open **http://localhost:3000** in your browser
2. You'll see the main dashboard with market data panels
3. The system starts with 3 exchanges (Binance, Bybit, OKX) and 50+ cryptocurrency symbols
4. Use the symbol selector to choose which cryptocurrency to trade
5. Use the exchange selector to switch between exchange UI themes

---

## Basic Trading Tutorial

### Placing a Market Order

1. **Select a Symbol**: Click on the symbol selector (e.g., BTC/USDT)
2. **Choose Order Type**: Select "Market" from the order type dropdown
3. **Select Side**: Choose "Buy" or "Sell"
4. **Enter Quantity**: Input the amount you want to trade
5. **Submit Order**: Click the "Submit Order" button
6. **View Results**: Your order will appear in the Fills panel and Positions panel

### Placing a Limit Order

1. **Select a Symbol**: Click on the symbol selector
2. **Choose Order Type**: Select "Limit" from the order type dropdown
3. **Select Side**: Choose "Buy" or "Sell"
4. **Enter Price**: Set your desired price
5. **Enter Quantity**: Input the amount you want to trade
6. **Submit Order**: Click the "Submit Order" button
7. **Monitor**: Your order will appear in the Order Book panel until filled

### Setting Stop Loss and Take Profit

1. **Place an Order**: Follow the steps above to place a market or limit order
2. **Enable Stop Loss**: Check the "Stop Loss" checkbox
3. **Set Stop Price**: Enter the price at which to trigger the stop loss
4. **Enable Take Profit**: Check the "Take Profit" checkbox
5. **Set Target Price**: Enter your target profit price
6. **Submit**: The order will be placed with SL/TP attached

---

## Advanced Order Types

### Stop-Limit Orders

A stop-limit order combines a stop order and a limit order. When the stop price is reached, the order becomes a limit order.

**When to Use**: When you want to control the price at which you enter or exit a position.

**Steps**:
1. Select "Stop-Limit" from the order type dropdown
2. Enter the **Stop Price** - the price that triggers the order
3. Enter the **Limit Price** - the maximum/minimum price you're willing to accept
4. Enter quantity and submit

**Example**: You want to buy BTC if it drops to $49,000, but you don't want to pay more than $49,100.
- Stop Price: $49,000
- Limit Price: $49,100

### Trailing Stop Orders

A trailing stop order adjusts the stop price as the market moves in your favor, locking in profits while allowing for upside.

**When to Use**: When you want to protect profits while letting winning trades run.

**Steps**:
1. Select "Trailing Stop" from the order type dropdown
2. Choose between **Trail Amount** (fixed dollar amount) or **Trail Percentage** (percentage)
3. Enter the trail value
4. Enter quantity and submit

**Example**: You bought BTC at $50,000 and want to trail it by 5%.
- Trail Percentage: 5%
- If BTC rises to $55,000, your stop becomes $52,250 (5% below current price)
- If BTC rises to $60,000, your stop becomes $57,000

### OCO (One-Cancels-the-Other) Orders

An OCO order consists of two orders: a stop-loss order and a take-profit order. When one is filled, the other is automatically cancelled.

**When to Use**: When you want to set both a profit target and a stop loss simultaneously.

**Steps**:
1. Select "OCO" from the order type dropdown
2. Enter the **Take Profit Price**
3. Enter the **Stop Loss Price**
4. Enter quantity and submit

**Example**: You bought BTC at $50,000 and want to either take profit at $55,000 or cut losses at $48,000.
- Take Profit: $55,000
- Stop Loss: $48,000

### Iceberg Orders

An iceberg order displays only a small portion of your total order quantity, hiding the rest from the market. As the visible portion is filled, more is automatically revealed.

**When to Use**: When trading large quantities without revealing your full position to the market.

**Steps**:
1. Select "Iceberg" from the order type dropdown
2. Enter the **Total Quantity** - your full order size
3. Enter the **Visible Quantity** - the amount shown to the market
4. Submit the order

**Example**: You want to buy 10 BTC but only show 0.5 BTC at a time.
- Total Quantity: 10 BTC
- Visible Quantity: 0.5 BTC
- The system will automatically replenish the visible portion as it gets filled

---

## Exchange UI Switching

The system provides three exchange-themed UIs: Binance, Bybit, and Coinbase. Each has its own color scheme, layout, and order form design.

### Switching Between Exchanges

1. Locate the **Exchange Selector** in the top navigation bar
2. Click on the dropdown menu
3. Select your preferred exchange (Binance, Bybit, or Coinbase)
4. The UI will immediately update to match the exchange's theme

### Exchange-Specific Features

**Binance UI**:
- Yellow and black color scheme
- Compact order book layout
- Quick order buttons (25%, 50%, 75%, 100%)

**Bybit UI**:
- Blue and white color scheme
- Side-by-side order book
- Advanced charting tools

**Coinbase UI**:
- Green and white color scheme
- Clean, minimalist design
- Focus on simplicity

### Customizing Exchange Settings

Each exchange UI maintains its own settings:
- Default order type
- Default quantity
- Preferred chart type
- Theme preferences

Settings are persisted in your browser's localStorage.

---

## Price Feed Configuration

The system supports real-time price feeds from multiple APIs with automatic failover.

### Supported APIs

1. **Binance API** (Primary)
   - WebSocket: `wss://stream.binance.com:9443/ws/!ticker@arr`
   - REST: `https://api.binance.com/api/v3/ticker/price`
   - Rate limit: 1200 requests/minute

2. **Coinbase API** (Secondary)
   - REST: `https://api.exchange.coinbase.com`
   - Rate limit: 1000 requests/minute

### Configuring Price Feeds

Edit `exchange_simulator/price_feed_manager.py` to configure API settings:

```python
# Configure Binance API
binance_api = BinanceAPI()
binance_api.rate_limit = 1200  # requests per minute

# Configure Coinbase API
coinbase_api = CoinbaseAPI()
coinbase_api.rate_limit = 1000  # requests per minute
```

### Failover Behavior

The system automatically switches to the secondary API if:
- The primary API is down
- Rate limits are exceeded
- Connection errors occur

Failover is transparent to the user and logged in the audit trail.

### Symbol Normalization

Each API uses different symbol formats:
- Binance: `BTCUSDT`
- Coinbase: `BTC-USDT`
- Internal: `BTC/USDT`

The system automatically normalizes symbols between formats.

---

## Audit Log Usage

The audit logger provides a comprehensive trail of all system events for security and compliance.

### Viewing Audit Logs

1. Navigate to the **Audit Log** panel in the dashboard
2. You'll see a real-time stream of system events
3. Events include:
   - Order submissions
   - Order fills
   - Position changes
   - Account balance updates
   - System events

### Filtering Audit Logs

Use the filter controls to narrow down events:
- **Event Type**: Filter by event type (ORDER, POSITION, ACCOUNT, SYSTEM)
- **Exchange**: Filter by exchange (Binance, Bybit, OKX)
- **Symbol**: Filter by trading symbol
- **Time Range**: Filter by date/time
- **User ID**: Filter by specific user

### Exporting Audit Logs

Export audit logs for analysis or compliance:

1. Click the **Export** button in the Audit Log panel
2. Choose format: **JSON** or **CSV**
3. Select your preferred time range
4. Click **Download**

### Audit Log Fields

Each audit log entry contains:
- **Timestamp**: When the event occurred
- **Event Type**: Type of event
- **Exchange**: Which exchange
- **Symbol**: Trading symbol
- **User ID**: User who performed the action
- **Order ID**: Related order (if applicable)
- **Old Value**: Previous value (for changes)
- **New Value**: New value (for changes)
- **Reason**: Why the change occurred
- **Metadata**: Additional information

---

## Backtesting Strategies

### Running a Backtest

1. Navigate to the **Backtest** panel
2. Select a strategy from the dropdown
3. Configure parameters:
   - Time range
   - Initial capital
   - Risk parameters
   - Strategy-specific settings
4. Click **Run Backtest**
5. View results in the Results panel

### Available Strategies

- **Trend Following**: EMA crossover with ADX filter
- **Mean Reversion**: RSI extremes with Bollinger Bands
- **FFT Cycle**: Spectral analysis cycle detection
- **Statistical Arbitrage**: Cointegration-based pairs trading
- **Market Making**: Avellaneda-Stoikov inventory skew
- **ML Ensemble**: Machine learning combined signals

### Interpreting Backtest Results

The backtest results show:
- **Total Return**: Overall profit/loss
- **Sharpe Ratio**: Risk-adjusted return
- **Max Drawdown**: Largest peak-to-trough decline
- **Win Rate**: Percentage of winning trades
- **Profit Factor**: Gross profit / gross loss
- **Average Trade**: Average profit/loss per trade
- **Equity Curve**: Visual representation of account growth

### Comparing Strategies

1. Run multiple backtests with different strategies
2. Use the **Backtest Comparison** panel
3. Compare metrics side-by-side
4. Export comparison to CSV for further analysis

---

## Signal Engine Usage

The system includes two signal engines: V2 (weighted composite) and V3 (HMM regime detection).

### Signal Engine V2

V2 uses a 6-indicator weighted composite:
- EMA (21/50)
- RSI (14)
- ADX (14)
- VWAP
- Order Book Imbalance
- Trade Flow

**Usage**:
1. Navigate to the **Signal Engine** panel
2. View real-time signals for each symbol
3. Signals range from -100 (strong sell) to +100 (strong buy)
4. Filter by direction: All, Long, Short

### Signal Engine V3

V3 uses HMM (Hidden Markov Model) regime detection:
- 4 regimes: TRENDING_UP, TRENDING_DOWN, RANGING, VOLATILE
- Online Baum-Welch adaptation
- Viterbi decoding
- Regime-gated signal boosting/dampening

**Usage**:
1. Navigate to the **Signal Engine V3** panel
2. View current regime for each symbol
3. Regime affects signal strength
4. Sub-millisecond regime switching

### Signal-Based Trading

1. Enable **Auto-Trade** in the Signal Engine panel
2. Set your risk parameters
3. The system will automatically execute trades based on signals
4. Monitor positions in the Positions panel

---

## Multi-Exchange Arbitrage

The system automatically detects arbitrage opportunities across exchanges.

### How Arbitrage Detection Works

1. The system monitors prices across all exchanges
2. When the price difference exceeds the threshold, an opportunity is detected
3. The system calculates:
   - Net spread after fees
   - Slippage impact
   - Available liquidity
4. If profitable, the opportunity is logged

### Viewing Arbitrage Opportunities

1. Navigate to the **Arbitrage** panel
2. View real-time arbitrage opportunities
3. Each opportunity shows:
   - Buy exchange and price
   - Sell exchange and price
   - Net spread
   - Available quantity
   - Estimated profit

### Auto-Executing Arbitrage

1. Enable **Auto-Execute** in the Arbitrage panel
2. Set your minimum spread threshold
3. The system will automatically execute profitable arbitrage
4. Monitor fills in the Fills panel

### Arbitrage Risks

- **Execution Risk**: Prices may change before execution
- **Slippage**: Large orders may move the market
- **Transfer Delays**: Fund transfers between exchanges take time
- **Fee Impact**: Trading fees reduce profits

---

## Performance Monitoring

### System Metrics

The system exposes Prometheus metrics for monitoring:

- **Price Feed Latency**: Time to fetch prices from APIs
- **Order Execution Latency**: Time to process orders
- **WebSocket Throughput**: Messages per second
- **Memory Usage**: RAM consumption
- **CPU Usage**: Processor utilization

### Viewing Metrics

1. Navigate to **http://localhost:9090** (Prometheus)
2. Query metrics using PromQL
3. Example queries:
   - `rate(price_feed_latency_seconds[1m])`
   - `histogram_quantile(0.95, order_execution_latency_seconds)`
   - `websocket_messages_per_second`

### Grafana Dashboards

1. Navigate to **http://localhost:3001** (Grafana)
2. View pre-configured dashboards:
   - Price Feed Dashboard
   - Order Execution Dashboard
   - System Performance Dashboard
3. Create custom dashboards as needed

### Performance Targets

- Price update latency: < 100ms
- Order execution latency: < 50ms
- UI render time: < 16ms (60fps)
- Memory usage: < 2GB
- CPU usage: < 50%

---

## Troubleshooting

### Common Issues

**Issue**: WebSocket connection fails
- **Solution**: Check that the exchange simulator is running on port 8765

**Issue**: Price feeds not updating
- **Solution**: Check API rate limits, verify network connectivity

**Issue**: Orders not executing
- **Solution**: Check that trading is enabled, verify account balance

**Issue**: UI not loading
- **Solution**: Clear browser cache, check console for errors

### Getting Help

- Check the [Documentation](docs/) for detailed guides
- Review [GitHub Issues](https://github.com/ezpectus/HFT-TradeBot--Lite-version/issues)
- Consult the [Architecture](docs/ARCHITECTURE.md) for system design

---

## Next Steps

After completing these tutorials, you can:

1. **Develop Custom Strategies**: Create your own trading strategies
2. **Contribute**: Submit pull requests to improve the system
3. **Learn More**: Study the mathematical models in [MATH_MODELS.md](docs/MATH_MODELS.md)
4. **Experiment**: Try different parameter combinations
5. **Share**: Share your backtest results and strategies with the community

---

## Disclaimer

This is an educational simulator. No real money is involved. All trading is simulated. Do not use this system for actual trading decisions.
