# Web UI Dashboard

Browser-based trading dashboard for the HFT trading simulator. Binance-inspired dark/light theme with TradingView-style candle charts, **201+ React components**, **191+ registered panels** across 7 categories, **75+ advanced mathematical model components**, **PWA support**, **WCAG AA accessibility**, and **Vitest test suite**.

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

### AI and Signals
- **AI Signal Feed** — Real-time signals with confidence, R:R, market regime, confidence distribution histogram
- **Arbitrage Panel** — Active cross-exchange opportunities with spread/profit
- **Bot Status** — AI + HFT bot status cards, portfolio overview, activity feed
- **Signal Performance** — Signal hit rate tracking
- **Market Regime** — Trending/ranging/volatile auto-detection
- **Sentiment Indicator** — News sentiment gauge

### Analytics (191+ panels in 7 categories)

#### Order Flow
- Cumulative Volume Delta (CVD)
- Real-time order flow tape
- Depth chart (cumulative depth visualization)
- Order book heatmap (color intensity by volume)
- Spoofing detector
- Dark order flow detection
- Order flow imbalance indicator
- Liquidity heatmap (pool levels over time)
- Slippage simulator (4 models: linear, square-root, constant, volume-based)
- Order flow heatmap (aggregated per-candle, absorption/momentum detection)
- Tick speed anomaly detector
- Put/Call ratio simulator
- MIT order simulator
- Market depth replay (L2 orderbook reconstruction, timeline scrubber)

#### Technical Analysis
- Fibonacci retracement levels
- Fair Value Gap (FVG) detection
- Candle pattern detection (doji, hammer, engulfing) with visual overlay
- Candle pattern scanner (scan all symbols for patterns)
- Support/resistance auto-detection with touch count
- Order block detection (institutional zones)
- Session-based volume profile (London/NY/Asia)
- Volume profile + POC (Point of Control)
- Market profile (TPO: time price opportunity)
- Multi-timeframe comparison (side-by-side)
- Composite Signal Dashboard (10 indicators, strength-weighted scoring)
- Signal Confidence Scorer (8-factor confidence model)
- Regime Adaptive Strategy (5 regimes, position sizing guidance)
- Cross-Market Divergence (BTC dominance, ETH/BTC ratio, pair divergence)
- Price Action Score (10 candlestick pattern scores, composite 0-100)
- Correlation Heatmap (visual SVG matrix)
- Signal Matrix Heatmap (8 indicators x N symbols)
- Indicator Formula Parser (tokenizer + AST evaluator)

#### Risk and Analytics
- Monte Carlo simulation for strategy robustness
- Drawdown recovery analysis
- Risk dashboard (VaR, CVaR, beta)
- Kelly criterion position sizing calculator
- Risk parity position sizing calculator
- Greeks calculator (Black-Scholes: delta, gamma, theta, vega, rho)
- Volatility surface visualization
- Volatility regime indicator (GARCH-like)
- Correlation matrix between symbols
- Position correlation matrix (cross-position risk)
- Correlation-based hedging suggestions
- Correlation-based pair trading signals
- P&L attribution (which position contributes most)
- P&L attribution chart (equity contribution over time)
- Risk-adjusted return comparison (Sharpe/Sortino/Calmar side-by-side)
- Drawdown analysis panel
- Heatmap calendar (daily PnL heatmap by date)
- Performance Attribution (P&L by side/symbol/strategy/hour/day)

#### Portfolio
- Portfolio optimizer (Markowitz efficient frontier)
- Auto-rebalance portfolio to target weights
- Multi-account aggregated view
- Session stats card (PnL since session start, best/worst trade, win rate)
- Time-of-day performance analysis
- Trade clustering detection (overtrading warning)

#### Strategy
- Strategy builder (visual rule-based strategy creator, if-then conditions)
- TWAP/VWAP execution bot strategy (sliced order execution with progress)
- Walk-forward analysis for backtest validation
- Alert webhook (send notifications to Discord/Telegram)
- Custom watchlist with price tracking
- Custom indicator builder (SMA, EMA, RSI, Bollinger with custom params)

#### Export
- Session export (full session data as JSON)
- Trade statistics export to CSV with custom fields
- Trade journal with tags and filtering (localStorage persistence)

#### Config
- Hot-reload simulator parameters
- Custom indicator builder

### Advanced Mathematical Models (75+ components)

75+ advanced mathematical model components were added across 15 batches:

| Batch | Components |
|-------|------------|
| V1 | GARCH Volatility, Cointegration Scanner, Markov Regime Predictor, Fractal Analyzer, Kalman Filter Price, Spectral Analysis |
| V2 | Ehlers SuperSmoother, Bayesian Price Predictor, Almgren-Chriss, Wavelet Decomposition, K-Means Clustering, Copula Dependency |
| V3 | Hidden Markov Model, PCA, Optimal Stopping, Isolation Forest, Variational Mode Decomposition |
| V4 | EMD + Hilbert-Huang Transform, SVM, Black-Litterman, Hawkes Process, Dynamic Time Warping |
| V5 | LSTM Neural Network, Kelly Portfolio Sizing, Gaussian Process Regression, Markov-Switching GARCH, Empirical Dynamic Modeling |
| V6 | Autoencoder, Optimal Transport, Rough Volatility, Transfer Entropy, Graph Theory Network |
| V7 | Conditional VaR, Non-Stationary Spectral Analysis, Random Matrix Theory, Bayesian Structural Time Series, Topological Data Analysis |
| V8 | Stochastic Differential Equations, Gaussian Mixture Model, Wavelet Packet Decomposition, Information Bottleneck, Affine Arithmetic |
| V9 | Renormalization Group, Free Energy Principle, Tensor Decomposition, Compressed Sensing, Malliavin Calculus |
| V10 | Hamiltonian Monte Carlo, RKHS, Variational Autoencoder, Schrodinger Bridge, Lie Group Symmetries |
| V11 | Kolmogorov-Sinai Entropy, Persistent Homology Landscape, Fokker-Planck Equation, Hopf Bifurcation, Cramer-Rao Lower Bound |
| V12 | Wasserstein Barycenters, Koopman Operator Theory, Stochastic Optimal Control, Renyi Entropy Dynamics, Pontryagin Maximum Principle |
| V13 | Burgers Equation, Sobolev Space Regularization, Ito Calculus Generator, Banach Fixed-Point, Cesaro/Fejer Kernel |
| V14 | Girsanov Theorem, Stone-Cech Compactification, Malliavin-Stein Sensitivity, Prokhorov Metric, Radon-Nikodym Derivative |
| V15 | Hahn Decomposition, Cameron-Martin Formula, Arzela-Ascoli Theorem, Riesz Representation, Lax-Milgram Theorem |

### Additional Indicators
- On-balance volume (OBV), Money flow index (MFI), Williams %R, Ichimoku cloud
- Stochastic oscillator, Average True Range (ATR), Parabolic SAR
- ADX/DI indicator (trend strength), Commodity Channel Index (CCI)
- Awesome Oscillator, Volume-weighted MACD

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
- **Live Status** — WebSocket connection indicators with exponential backoff auto-reconnect (1s -> 30s cap)
- **Price Comparison** — Cross-exchange prices with spread + arb badge
- **Ticker Tape** — All 9 prices in header, clickable
- **Multi-leg Options** — Options strategies (straddle, strangle, iron condor)
- **Trade Replay** — Trade replay with timeline scrubber
- **Trade Timeline** — Visual fill sequence with timeline dots
- **Config Panel** — Hot-reload simulator config from UI

## Quick Start

### Development

```bash
cd web-ui
npm install
npm run dev
```

Open http://localhost:3000

### Mock Mode (Standalone Demo)

Run the Web UI without any backend services using mock data:

```bash
cd web-ui
VITE_MOCK_MODE=true npm run dev
```

Or set it in `.env`:
```
VITE_MOCK_MODE=true
```

This generates synthetic candle, orderbook, and signal data so the UI is fully interactive without the Exchange Simulator, AI Signal Bot, or HFT Trade Bot running.

### Production (Docker)

```bash
docker-compose up
```

Open http://localhost:3000

### Production (Netlify)

The `netlify.toml` file is pre-configured with redirects and security headers:

```bash
cd web-ui
npm run build
# Deploy dist/ to Netlify
```

## Architecture

```
Browser (React 18 + Vite 5)
  |
  |-- WebSocket -> Exchange Simulator (ws://localhost:8765)
  |     |-- subscribe -> snapshot, candles, fills, arbitrage_scan
  |     |-- order, close_position, set_speed -> fill
  |
  |-- WebSocket -> AI Signal Bot (ws://localhost:8766)
  |     |-- subscribe -> signal_history, signal, market_regime
  |     |-- run_backtest -> backtest_result
  |
  Panel Registry (src/panels/registry.js)
  |-- Category: Order Flow         (14 panels)
  |-- Category: Technical Analysis  (18 panels)
  |-- Category: Risk and Analytics  (20 panels)
  |-- Category: Portfolio            (7 panels)
  |-- Category: Strategy             (6 panels)
  |-- Category: Export               (3 panels)
  |-- Category: Config               (2 panels)
  |-- Advanced Math Models           (75+ panels, V1-V15)
  +-- Total: 191+ registered panels, 201+ component files
```

## Configuration

WebSocket URLs and mock mode are configured via environment variables (`.env` file, see `.env.example`):

```
VITE_WS_EXCHANGE=ws://localhost:8765
VITE_WS_SIGNALS=ws://localhost:8766
VITE_MOCK_MODE=false
```

All variables are optional — defaults use localhost. For Docker, ports are mapped to host. For remote deployment, replace localhost with your server address.

## Tech Stack

| Technology | Purpose |
|-----------|---------|
| React 18 | UI framework |
| Vite 5 | Build tool / dev server |
| TailwindCSS 3 | Styling (dark/light theme via CSS variables) |
| lightweight-charts 4 | TradingView candle charts |
| lucide-react | Icons |
| Vitest | Unit testing framework |
| @testing-library/react | React component testing utilities |
| @testing-library/jest-dom | Custom DOM matchers for Jest/Vitest |
| jsdom | DOM environment for tests |
| vite-plugin-pwa | PWA support with Workbox caching |
| vite-bundle-visualizer | Bundle size visualization |
| ESLint | Linting with React plugin |

## Performance Optimizations

| Optimization | Implementation |
|-------------|----------------|
| React.lazy code splitting | All 191+ panels lazy-loaded with `React.lazy()` + Suspense fallbacks |
| ChunkRetryBoundary | Automatic retry on chunk load failure (3 retries with exponential backoff) |
| Preload-on-hover | Hovering a category preloads all panels in that category |
| List Virtualization | `VirtualList.jsx` — generic windowed list renderer with overscan, applied to FillsPanel and SignalFeed |
| Error Boundaries | `PanelErrorBoundary` — class component with retry button, wraps every panel |
| Suspense | React.Suspense wrapper in `PanelContainer.jsx` for lazy-loaded panels |
| Panel isolation | ErrorBoundary + Suspense per panel (triple protection: error catch + loading state + graceful fallback) |
| Web Worker | `compute.worker.js` — heavy indicator calculations offloaded to background thread |
| Manual chunks | Vendor code split in `vite.config.js`: `react-vendor`, `charts-vendor`, `icons-vendor` |
| Performance hooks | `useDebouncedValue`, `useThrottledCallback`, `useBatchedUpdates`, `useIntersectionObserver` |
| Connection resilience | Exponential backoff (1s -> 2s -> 4s -> 8s -> 16s -> 30s cap) with auto-reconnect |
| localStorage persistence | Panel visibility, theme, trade journal — survives page reloads |

## PWA (Progressive Web App)

The Web UI is a fully installable PWA powered by `vite-plugin-pwa` with Workbox caching:

| Feature | Implementation |
|---------|----------------|
| Installable | Browser "Install App" prompt, standalone display mode |
| Offline-capable | Workbox precaches all `js, css, html, svg, png, woff2` assets |
| Auto-update | `registerType: 'autoUpdate'` — service worker updates automatically |
| Manifest | App name, icons (192px + 512px + maskable), theme color, landscape orientation |
| Runtime caching | Google Fonts cached with CacheFirst strategy (1 year expiry) |
| Build | `npm run build` generates service worker + manifest |

## Accessibility (WCAG AA)

| Feature | Implementation |
|---------|----------------|
| ARIA roles | Semantic roles on interactive elements |
| Keyboard navigation | Full keyboard support, 1/2/3 exchange, Q/W/E symbol, Space pause, ? help |
| Skip-to-content | Skip link for screen reader users |
| Focus-visible | Visible focus rings on all interactive elements |
| Reduced-motion | `prefers-reduced-motion` media query support |
| aria-pressed | Toggle buttons announce pressed state |
| aria-live | Connection status changes announced to screen readers |

## Testing

```bash
cd web-ui
npm test              # Run Vitest tests (watch mode)
npm run test:coverage  # Run tests with coverage report
npm run test:ui        # Vitest UI mode
npm run lint           # Run ESLint
npm run build          # Production build verification
npm run analyze        # Bundle visualization (vite-bundle-visualizer)
```

### Test Files (9 files, 60+ tests)

| Test File | Coverage |
|-----------|----------|
| `indicators.test.js` | EMA, RSI, SMA, MACD, BB, ATR, ADX, VWAP, OBV, MFI, Williams %R, Stochastic, CCI, AO, SAR |
| `utils.test.js` | Number/price formatting helpers |
| `garch.test.js` | GARCH(1,1) volatility model |
| `kalman.test.js` | 1D/2D Kalman filter |
| `hmm.test.js` | Hidden Markov Model (Baum-Welch, Viterbi) |
| `cointegration.test.js` | Engle-Granger cointegration, ADF test |
| `kmeans.test.js` | K-Means++ clustering, silhouette score |
| `registry.test.js` | Panel registry integrity, category counts |
| `virtualList.test.js` | VirtualList windowed rendering |

CI/CD runs JS lint + test as a dedicated job in GitHub Actions.

## Layout

```
+---------------------------------------------------------------+
| Header: Exchange | Symbol | Price | Speed | Status | Theme    |
+------------------------------------+--------------------------+
|                                    |  Order Book              |
|  Candle Chart                      |  (bids/asks/heatmap)     |
|  (TradingView + indicators)        |                          |
|                                    +--------------------------+
|                                    |  Tabbed Panels:          |
+------------------------------------+  - Account               |
|  Order Form                        |  - Bots                  |
|  (BUY/SELL, SL/TP, quick-trade)   |  - Signals               |
|                                    |  - Arbitrage             |
+------------------------------------+  - Fills                 |
|  Sidebar: Panel Registry (191+)   |  - History               |
|  (collapsible categories)          |  - Performance           |
|                                    |  - Backtest              |
+------------------------------------+--------------------------+
| StatusBar: sim time | candles | bots | funding | connections   |
+---------------------------------------------------------------+
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
| SignalFeed | `SignalFeed.jsx` | AI signals with confidence histogram, VirtualList rendering |
| ArbitragePanel | `ArbitragePanel.jsx` | Active arb opportunities |
| FillsPanel | `FillsPanel.jsx` | Recent fills with statistics, VirtualList rendering |
| PerformanceDashboard | `PerformanceDashboard.jsx` | Metrics, equity curve, drawdown, Sharpe/Sortino |
| BacktestRunner | `BacktestRunner.jsx` | Backtest config and results |
| TradeHistory | `TradeHistory.jsx` | Closed trades with PnL, CSV export |
| BotStatus | `BotStatus.jsx` | AI + HFT bot status |
| StatusBar | `StatusBar.jsx` | Sim time, candle count, bot activity, funding rates, latency |
| Toast | `Toast.jsx` | Toast notification system |
| OnboardingTutorial | `OnboardingTutorial.jsx` | First-run guide |
| KeyboardHelp | `KeyboardHelp.jsx` | Keyboard shortcut overlay |

## Panel Registry System

All sidebar panels are registered in `src/panels/registry.js` (191+ panels, 201+ component imports) and rendered by `PanelContainer.jsx` with ErrorBoundary + Suspense per panel.

### Key Infrastructure Components

| Component | File | Description |
|-----------|------|-------------|
| PanelContainer | `PanelContainer.jsx` | Renders panels by category, ErrorBoundary + Suspense per panel, collapsible sections, localStorage visibility |
| VirtualList | `VirtualList.jsx` | Generic windowed list renderer with overscan for performance |
| DetachablePanel | `DetachablePanel.jsx` | Popup panel wrapper for multi-monitor support |
| PanelErrorBoundary | (in PanelContainer) | Class component error boundary with retry button |

### Hooks

| Hook | File | Description |
|------|------|-------------|
| useWebSocket | `useWebSocket.js` | Generic WebSocket with exponential backoff (1s-30s cap) |
| useExchangeData | `useExchangeData.js` | Candles, prices, orderbooks, accounts, fills, arbitrage |
| useSignalData | `useSignalData.js` | AI signals, regime, backtest results, send backtest requests |
| useDetachablePanels | `useDetachablePanels.js` | Multi-monitor popup panel support |
| useSoundAlerts | `useSoundAlerts.js` | Web Audio API sound notifications |
| useTheme | `useTheme.js` | Dark/light theme toggle |
| useMediaQuery | `useMediaQuery.js` | Mobile responsive detection |
| useTradeJournal | `useTradeJournal.js` | Trade notes with localStorage |

### Utils

| Utility | File | Description |
|---------|------|-------------|
| indicators | `indicators.js` | EMA, RSI, SMA, BB, VWAP, ATR, ADX, OBV, MFI, Williams %R, Stochastic, CCI, AO, SAR, MACD |
| performance | `performance.js` | Aggregate metrics, equity curve, drawdown, Sharpe/Sortino |
| format | `format.js` | Number/price formatting |
| timeframes | `timeframes.js` | Multi-timeframe candle aggregation |
| patterns | `patterns.js` | Candle pattern detection (doji, hammer, engulfing) |

## Building

```bash
npm run build    # Output to dist/
npm run preview  # Preview production build
```

## CLI Monitor Scripts

Four CLI monitor scripts provide terminal-based monitoring alongside the Web UI:

| Script | Location | Description |
|--------|----------|-------------|
| `monitor.py` | `ai-signal-bot/` | Live signal feed, bot log tail, signal history |
| `monitor.py` | `hft-trade-bot/` | C++ process status, color-coded log tail |
| `error_monitor.py` | root | Unified error+warning viewer across all services |
| `price_monitor.py` | root | Dual WS connection, live prices + signals + fills |

Use `start.bat` (Windows) or `start.sh` (Linux/Mac) to launch all 4 services + 4 monitors in 8 terminal windows.
