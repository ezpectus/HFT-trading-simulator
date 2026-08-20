# Trading Guide

**Last Updated:** August 20, 2026

Learn how to use the HFT Trading System dashboard for paper trading and strategy evaluation.

## Dashboard Overview

The web UI provides a real-time trading dashboard with:

- **Chart Panel** — Candlestick chart with EMA, Bollinger Bands, VWAP, RSI indicators
- **Order Book** — Live bid/ask depth with heatmap visualization
- **Order Form** — Submit market, limit, stop-limit, trailing-stop, and iceberg orders
- **Tabbed Panels** — Account, Bots, Signals, Arbitrage, Prices, Fills, History, Performance, Backtest

## Placing Orders

### Market Order

1. Select exchange and symbol from the header dropdown
2. In the Order Form panel, choose **Market** order type
3. Select **Buy** or **Sell**
4. Enter quantity
5. Click **Submit**

### Limit Order

1. Choose **Limit** order type
2. Enter limit price and quantity
3. Click **Submit**

### Advanced Order Types

- **Stop-Limit** — Triggers a limit order when price reaches stop level
- **Trailing Stop** — Follows price by a trailing offset
- **Iceberg** — Splits large orders into smaller visible slices

## Managing Positions

1. Navigate to the **Account** tab
2. View open positions with unrealized PnL
3. Click **Close** to close a position at market price

## Monitoring Signals

1. Navigate to the **Signals** tab
2. View AI-generated trading signals with:
   - Direction (LONG/SHORT/NEUTRAL)
   - Confidence percentage
   - Strategy name and reason
   - Suggested SL/TP levels
3. Signal Performance panel shows historical accuracy

## Arbitrage Detection

1. Navigate to the **Arb** tab
2. View cross-exchange arbitrage opportunities
3. Each opportunity shows:
   - Buy exchange and price
   - Sell exchange and price
   - Spread in basis points
   - Maximum quantity

## Price Comparison

1. Navigate to the **Prices** tab
2. Compare prices across all three exchanges
3. Highlighted cells show best bid/ask

## Backtesting

1. Navigate to the **BT** (Backtest) tab
2. Select a strategy and date range
3. Click **Run Backtest**
4. View results:
   - Total return
   - Sharpe ratio
   - Sortino ratio
   - Max drawdown
   - Win rate
   - Equity curve

## Performance Dashboard

1. Navigate to the **Perf** tab
2. View system performance metrics:
   - Account equity and balance
   - Total trades and win rate
   - PnL breakdown
   - Latency metrics

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

## Detachable Panels

Click the detach icon on any panel to open it in a separate window:
- Chart
- Order Book
- Account
- Signals
- Arbitrage

## Tips

- Use **mock mode** to explore the UI without backend services
- Adjust **simulation speed** in the header (0x = paused, 1x = normal, 10x = fast)
- Enable **sound alerts** for fills and strong signals
- Toggle **dark/light theme** in the header
