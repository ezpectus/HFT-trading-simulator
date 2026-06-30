# Web UI Dashboard

Browser-based trading dashboard for the crypto trading simulator. Binance-inspired dark/light theme with TradingView-style candle charts and 90+ analytical panels.

## Features

### Core Trading
- **Candle Charts** — TradingView Lightweight Charts with volume histogram and trade execution markers
- **Chart Indicators** — EMA 9/21/50, Bollinger Bands, RSI 14, VWAP (toggle on/off)
- **Multi-timeframe** — 5m/15m/1h/4h toggle (frontend aggregation)
- **Alternative Chart Modes** — Heikin-Ashi, Renko, Point & Figure, Kagi, Three-Line Break, Tick, Volume Clock
- **Order Book** — Real WebSocket data with cumulative depth bars, heatmap, and spread display
- **Order Form** — Market/limit, SL/TP, quick-trade buttons (25/50/75/100%), per-exchange fee breakdown
- **Account Panel** — Balance, equity, PnL, fees, win rate per exchange, PnL leaderboard, mini PnL bars
- **Positions Panel** — Open positions with unrealized PnL, liquidation price, leverage badge, SL/TP progress bar
- **Trade History** — Closed trades with PnL, SL/TP reason, summary stats, CSV export

### AI & Signals
- **AI Signal Feed** — Real-time signals with confidence, R:R, market regime, confidence distribution histogram
- **Arbitrage Panel** — Active cross-exchange opportunities with spread/profit
- **Bot Status** — AI + HFT bot status cards, portfolio overview, activity feed
- **Signal Performance** — Signal hit rate tracking
- **Market Regime** — Trending/ranging/volatile auto-detection

### Analytics (90+ panels in 7 categories)
- **Order Flow** — CVD, tape, depth chart, spoofing detector, dark order flow, order flow imbalance, liquidity heatmap
- **Technical Analysis** — Fibonacci, FVG, pattern detector/scanner, support/resistance, order blocks, candle patterns
- **Risk & Analytics** — Monte Carlo, drawdown analysis, VaR/CVaR/beta, Kelly calculator, Greeks, volatility surface, hedging suggestions, correlation matrix, position correlation, P&L attribution
- **Portfolio** — Markowitz optimizer, auto-rebalance, multi-account view, session stats, heatmap calendar, time-of-day performance, trade clustering
- **Strategy** — Visual strategy builder, TWAP/VWAP execution bot, walk-forward analysis, alert webhooks, watchlist
- **Export** — Session JSON, trade stats CSV, trade journal with tags
- **Config** — Hot-reload simulator parameters, custom indicator builder

### UX Features
- **Performance Dashboard** — Aggregate metrics, per-exchange breakdown, equity curve, drawdown chart, Sharpe/Sortino ratios, win/loss streaks
- **Backtest Runner** — Configure and run backtests, compare strategy equity curves, trailing/breakeven risk options
- **Price Alerts** — User-set threshold prices with toast + sound notifications
- **Smart Order Router** — Best price across exchanges
- **Multi-monitor** — Detachable panels via popup windows with live data
- **Onboarding Tutorial** — First-run guide
- **Keyboard Shortcuts** — 1/2/3 exchange, Q/W/E symbol, Space pause, ? help
- **Simulation Speed Control** — Pause/1x/2x/5x buttons, spacebar toggle
- **Toast Notifications** — Connection changes, fills, strong signals, news events
- **Sound Alerts** — Fills, SL/TP hits, connection changes (Web Audio API)
- **Dark/Light Theme** — Toggle, persisted in localStorage
- **Mobile-responsive** — Panel toggle, responsive header/footer
- **Live Status** — WebSocket connection indicators with exponential backoff auto-reconnect

## Quick Start

### Development

```bash
cd web-ui
npm install
npm run dev
```

Open http://localhost:3000

### Production (Docker)

```bash
docker-compose up
```

Open http://localhost:3000

## Architecture

```
Browser (React 18 + Vite 5)
  ├── WebSocket → Exchange Simulator (ws://localhost:8765)
  │     ├── subscribe → snapshot, candles, fills, arbitrage_scan
  │     └── order, close_position, set_speed → fill
  └── WebSocket → AI Signal Bot (ws://localhost:8766)
        ├── subscribe → signal_history, signal, market_regime
        └── run_backtest → backtest_result

Panel Registry (src/panels/registry.js)
  ├── Category: Order Flow      (CVD, tape, depth, spoofing, dark flow, imbalance, liquidity)
  ├── Category: Technical        (Fibonacci, FVG, patterns, S/R, order blocks)
  ├── Category: Risk & Analytics (Monte Carlo, drawdown, VaR, Kelly, Greeks, volatility, hedging)
  ├── Category: Portfolio        (Markowitz, rebalance, multi-account, session, heatmap, clustering)
  ├── Category: Strategy         (builder, execution bot, walk-forward, webhook, watchlist)
  ├── Category: Export           (session JSON, trade stats CSV, trade journal)
  └── Category: Config           (hot-reload, indicator builder)
```

## Configuration

WebSocket URLs are configured via environment variables (`.env` file, see `.env.example`):

```
VITE_WS_EXCHANGE=ws://localhost:8765
VITE_WS_SIGNALS=ws://localhost:8766
```

Both variables are optional — defaults use localhost. For Docker, ports are mapped to host. For remote deployment, replace localhost with your server address.

## Tech Stack

| Technology | Purpose |
|-----------|---------|
| React 18 | UI framework |
| Vite 5 | Build tool / dev server |
| TailwindCSS 3 | Styling (dark/light theme) |
| lightweight-charts 4 | TradingView candle charts |
| lucide-react | Icons |

## Layout

```
┌───────────────────────────────────────────────────────────┐
│ Header: Exchange | Symbol | Price | Speed | Status | Theme│
├────────────────────────────────────┬──────────────────────┤
│                                    │  Order Book          │
│  Candle Chart                      │  (bids/asks/heatmap) │
│  (TradingView + indicators)        │                      │
│                                    ├──────────────────────┤
│                                    │  Tabbed Panels:      │
├────────────────────────────────────┤  - Account           │
│  Order Form                        │  - Bots              │
│  (BUY/SELL, SL/TP, quick-trade)   │  - Signals           │
│                                    │  - Arbitrage         │
├────────────────────────────────────┤  - Fills             │
│  Sidebar: Panel Registry (90+)    │  - History           │
│  (collapsible categories)          │  - Performance       │
│                                    │  - Backtest          │
├────────────────────────────────────┴──────────────────────┤
│ StatusBar: sim time | candles | bots | funding | connections│
└───────────────────────────────────────────────────────────┘
```

## Core Components (App.jsx layout)

| Component | File | Description |
|-----------|------|-------------|
| Header | `Header.jsx` | Exchange/symbol selector, price ticker, speed control, theme toggle, connection status |
| CandleChart | `CandleChart.jsx` | TradingView candlestick + volume + indicators + trade markers |
| OrderBook | `OrderBook.jsx` | Bid/ask depth with heatmap, cumulative bars, spread display |
| OrderForm | `OrderForm.jsx` | Market/limit order with SL/TP, quick-trade, fee breakdown |
| AccountPanel | `AccountPanel.jsx` | Per-exchange balance/equity/PnL, leaderboard, mini bars |
| PositionsPanel | `PositionsPanel.jsx` | Open positions with liquidation, leverage, SL/TP progress |
| SignalFeed | `SignalFeed.jsx` | AI signals with confidence histogram |
| ArbitragePanel | `ArbitragePanel.jsx` | Active arb opportunities |
| FillsPanel | `FillsPanel.jsx` | Recent fills with statistics |
| PerformanceDashboard | `PerformanceDashboard.jsx` | Metrics, equity curve, drawdown, Sharpe/Sortino |
| BacktestRunner | `BacktestRunner.jsx` | Backtest config and results |
| TradeHistory | `TradeHistory.jsx` | Closed trades with PnL, CSV export |
| BotStatus | `BotStatus.jsx` | AI + HFT bot status |
| StatusBar | `StatusBar.jsx` | Sim time, candle count, bot activity, funding rates |
| Toast | `Toast.jsx` | Toast notification system |
| OnboardingTutorial | `OnboardingTutorial.jsx` | First-run guide |
| KeyboardHelp | `KeyboardHelp.jsx` | Keyboard shortcut overlay |

## Panel Registry Components (90+)

All sidebar panels are registered in `src/panels/registry.js` and rendered by `PanelContainer.jsx`. See [Architecture](ARCHITECTURE.md) for the full component list.

### Hooks

| Hook | File | Description |
|------|------|-------------|
| useWebSocket | `useWebSocket.js` | Generic WebSocket with exponential backoff |
| useExchangeData | `useExchangeData.js` | Candles, prices, orderbooks, accounts, fills, arbitrage |
| useDetachablePanels | `useDetachablePanels.js` | Multi-monitor popup panel support |
| useSoundAlerts | `useSoundAlerts.js` | Web Audio API sound notifications |
| useTheme | `useTheme.js` | Dark/light theme toggle |
| useMediaQuery | `useMediaQuery.js` | Mobile responsive detection |
| useTradeJournal | `useTradeJournal.js` | Trade notes with localStorage |

### Utils

| Utility | File | Description |
|---------|------|-------------|
| indicators | `indicators.js` | EMA, RSI, SMA, BB, VWAP, ATR, ADX, OBV, MFI, Williams %R, Stochastic, CCI, AO, SAR |
| performance | `performance.js` | Aggregate metrics, equity curve, drawdown, Sharpe/Sortino |
| format | `format.js` | Number/price formatting |
| timeframes | `timeframes.js` | Multi-timeframe candle aggregation |
| patterns | `patterns.js` | Candle pattern detection (doji, hammer, engulfing) |

## Building

```bash
npm run build    # Output to dist/
npm run preview  # Preview production build
```
