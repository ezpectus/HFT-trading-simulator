# Trading Guide

Learn how to use the HFT Trading System dashboard for paper trading and
strategy evaluation.

## Theory: How to use the trading dashboard effectively

### Paper trading — why and how

**Paper trading** = simulated trading. Real strategies, real data,
simulated execution. Zero financial risk. Purpose:
- Test strategies in real-time (not backtest)
- Learn platform without risk
- Validate backtest results (forward testing)
- Debug signal generation, risk management, order execution

### Reading the dashboard — theory

**Candlestick chart:** Each candle = OHLCV (Open, High, Low, Close,
Volume) for one timeframe (5m default). Green = close > open (bullish).
Red = close < open (bearish). Wicks = high/low range.

**Order book:** 20 levels bid/ask. Heatmap = volume intensity.
Bid > Ask = buying pressure. Ask > Bid = selling pressure.
OBI (Order Book Imbalance) = directional bias indicator.

**Signals:** AI-generated. Direction (LONG/SHORT/NEUTRAL),
confidence (0-100%), SL/TP levels, R:R ratio, strategy name.
Confidence > 65% = actionable (config threshold).

**Backtest:** Historical strategy performance. Equity curve =
portfolio value over time. Sharpe = risk-adjusted return.
Max drawdown = worst peak-to-trough. Walk-forward = overfitting check.

### Risk management while trading — theory

- **Position size:** 2% risk per trade (Half-Kelly). Don't override.
- **Daily drawdown:** 8% limit. System auto-stops. Respect it.
- **Diversification:** Don't concentrate in one symbol. 50 symbols
  available for a reason.
- **Stop loss:** Always set. No "hoping it comes back."
- **R:R ratio:** Minimum 1.5. If R:R < 1.5, skip the trade.

---

## Dashboard Overview

The web UI provides a real-time trading dashboard with 200+ panels:

### Main Panels

| Panel | Description |
|-------|-------------|
| **Chart** | Candlestick chart with EMA, Bollinger Bands, VWAP, RSI overlays |
| **Order Book** | Live bid/ask depth (20 levels) with heatmap visualization |
| **Order Form** | Submit market, limit, stop-limit, trailing-stop, iceberg orders |
| **Account** | Balance, positions, unrealized PnL, margin, leverage |
| **Signals** | AI-generated trading signals with direction, confidence, SL/TP |
| **Arbitrage** | Cross-exchange price discrepancy detection |
| **Prices** | Price comparison across Binance, Bybit, OKX |
| **Fills** | Order fill history with timestamps and prices |
| **History** | Complete trade history with PnL |
| **Performance** | Account equity, win rate, PnL breakdown, latency metrics |
| **Backtest** | Strategy backtesting with equity curve and metrics |

### Tabbed Panels

Navigate using the tab bar or keyboard shortcuts:

| Tab | Key | Content |
|-----|-----|---------|
| Account | `a` | Open positions, balance, PnL |
| Bots | `b` | AI Signal Bot and HFT Bot status, active strategies |
| Signals | `s` | Live trading signals from all strategies |
| Arb | `r` | Cross-exchange arbitrage opportunities |
| Prices | `p` | Multi-exchange price comparison |
| Fills | `f` | Recent order fills |
| History | `h` | Complete trade history |
| Perf | `t` | Performance metrics and equity curve |
| BT | — | Backtesting interface |

---

## Placing Orders

### Market Order

1. Select exchange and symbol from the header dropdown
2. In the Order Form panel, choose **Market** order type
3. Select **Buy** or **Sell**
4. Enter quantity
5. Click **Submit**

Market orders execute immediately at the best available price, with slippage
applied based on the exchange's slippage model.

### Limit Order

1. Choose **Limit** order type
2. Enter limit price and quantity
3. Click **Submit**

Limit orders rest in the order book until filled or cancelled.

### Advanced Order Types

| Type | How it works | Use case |
|------|-------------|----------|
| **Stop-Limit** | Triggers a limit order when price reaches stop level | Limiting downside risk |
| **Trailing Stop** | Stop follows price by a trailing offset | Locking in profits while letting winners run |
| **Iceberg** | Splits large orders into smaller visible slices | Minimizing market impact for large orders |
| **OCO** | One-Cancels-the-Other: linked orders | Setting SL and TP simultaneously |

---

## Managing Positions

1. Navigate to the **Account** tab
2. View open positions with unrealized PnL
3. Click **Close** to close a position at market price

### Position Details

Each position shows:
- Symbol and direction (LONG/SHORT)
- Entry price and current price
- Quantity and notional value
- Unrealized PnL (green = profit, red = loss)
- Margin used and leverage

---

## Monitoring Signals

### Signal Display

Navigate to the **Signals** tab to see AI-generated trading signals:

| Field | Description |
|-------|-------------|
| **Symbol** | Trading pair (e.g. BTC/USDT) |
| **Direction** | LONG, SHORT, or NEUTRAL |
| **Confidence** | 0-100, higher = stronger signal |
| **Strategy** | Which strategy generated the signal |
| **Reason** | Human-readable explanation |
| **Entry** | Suggested entry price |
| **SL** | Stop loss level |
| **TP** | Take profit level |
| **R:R** | Risk:Reward ratio |

### How Signals Are Generated

The system uses a **multi-strategy ensemble** approach:

1. Each enabled strategy analyzes the market independently
2. **EnsembleVoter** combines signals — majority mode requires ≥2 strategies to agree
3. **SignalValidator** filters by confidence (min 65%), R:R ratio (min 1.5), and cooldown
4. Validated signals are broadcast to HFT Trade Bot and Web UI

### Available Strategies

| Strategy | What it does | Best in |
|----------|-------------|---------|
| TrendFollowing | EMA crossover + ADX filter | Strong trends (ADX > 25) |
| MeanReversion | RSI + Bollinger Bands | Ranging markets |
| FFTCycle | FFT spectral analysis | Cyclical markets |
| StatisticalArbitrage | Cointegration + Kalman filter | Correlated pairs |
| MarketMaking | Avellaneda-Stoikov | Any market (needs inventory mgmt) |
| Sentiment | News event analysis | Event-driven moves |
| MLEnsemble | LightGBM + HMM regime | When trained on sufficient data |

---

## Arbitrage Detection

1. Navigate to the **Arb** tab
2. View cross-exchange arbitrage opportunities
3. Each opportunity shows:

| Field | Description |
|-------|-------------|
| **Symbol** | Trading pair |
| **Buy exchange** | Exchange with lowest ask |
| **Buy price** | Best ask price |
| **Sell exchange** | Exchange with highest bid |
| **Sell price** | Best bid price |
| **Spread (bps)** | Profit margin in basis points |
| **Max quantity** | Maximum size before spread closes |

---

## Price Comparison

1. Navigate to the **Prices** tab
2. Compare prices across all three exchanges (Binance, Bybit, OKX)
3. Highlighted cells show best bid/ask
4. Useful for identifying arbitrage and execution quality

---

## Backtesting

### Running a Backtest

1. Navigate to the **BT** (Backtest) tab
2. Select a strategy from the dropdown
3. Choose a date range
4. Click **Run Backtest**

### Backtest Results

| Metric | Description |
|--------|-------------|
| **Total return** | Overall P&L for the period |
| **Sharpe ratio** | Risk-adjusted return (higher = better) |
| **Sortino ratio** | Downside-adjusted return |
| **Calmar ratio** | Return / max drawdown |
| **Max drawdown** | Largest peak-to-trough decline |
| **Win rate** | Percentage of profitable trades |
| **Total trades** | Number of completed trades |
| **Equity curve** | Visual chart of account balance over time |

### Walk-Forward Optimization

The backtesting engine supports walk-forward optimization:
1. **In-sample** — Optimize parameters on a training window
2. **Out-of-sample** — Test on the next window (unseen data)
3. If results are consistent → strategy is not overfitted

---

## Performance Dashboard

Navigate to the **Perf** tab to view:

- **Account equity** — Current total balance
- **Total trades** — Lifetime trade count
- **Win rate** — Percentage of profitable trades
- **PnL breakdown** — By symbol, by strategy, by exchange
- **Latency metrics** — Signal generation and order execution times

---

## Simulation Controls

| Control | Description |
|---------|-------------|
| **Speed** | 0x (paused), 1x (normal), 10x (fast) |
| **Pause** | Space bar or header button |
| **Exchange selector** | Binance, Bybit, OKX |
| **Symbol selector** | 50 trading pairs |

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `1` | Select Binance |
| `2` | Select Bybit |
| `3` | Select OKX |
| `q/w/e` | Select first/second/third symbol |
| `Space` | Pause/resume simulation |
| `a` | Account tab |
| `b` | Bots tab |
| `s` | Signals tab |
| `r` | Arbitrage tab |
| `p` | Prices tab |
| `f` | Fills tab |
| `h` | History tab |
| `t` | Performance tab |
| `Shift+\` | Toggle sidebar |

---

## Detachable Panels

Click the detach icon on any panel to open it in a separate window:

- Chart
- Order Book
- Account
- Signals
- Arbitrage

Detached panels remain synchronized with the main dashboard.

---

## Tips

- **Mock mode** — Explore the UI without backend services: `VITE_MOCK_MODE=true npm run dev`
- **Simulation speed** — Use 10x to generate data faster for testing
- **Sound alerts** — Enable for fills and strong signals in settings
- **Dark/light theme** — Toggle in the header
- **Multiple symbols** — Monitor multiple pairs by detaching chart panels
- **Paper trading** — All trades are simulated — no real money is at risk

---

## See Also

- [Quick Start Guide](./QUICK_START.md)
- [Configuration Guide](./CONFIGURATION_GUIDE.md)
- [Development Guide](./DEVELOPMENT_GUIDE.md)
- [Trading Strategies](../TRADING_STRATEGIES.md)
- [Risk Management](../RISK_MANAGEMENT.md)
