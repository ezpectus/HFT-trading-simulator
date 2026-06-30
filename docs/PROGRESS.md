# Implementation Progress & Roadmap
# ===================================
# This file tracks all development steps, completed and planned.

## Project: Crypto Trading Simulator v1.0.0

---

## Phase 1: Core Architecture [DONE]

### 1.1 Exchange Simulator (Python)
- [x] Data models (Candle, OrderBook, Order, Position, Account)
- [x] Market simulator — GBM price generation with per-symbol volatility
- [x] Simulated exchange — order matching with fees and slippage
- [x] 3 exchanges (Binance, Bybit, OKX) with different fee structures
- [x] 3 symbols (BTC/USDT, ETH/USDT, SOL/USDT)
- [x] Order book simulation (20 levels, decay-based liquidity)
- [x] Account simulation (balance, positions, PnL, win rate)
- [x] WebSocket server — streams market data to bots
- [x] Terminal visualizer — candle charts, order book, account dashboard
- [x] Config loader (YAML)
- [x] Dockerfile

### 1.2 AI Signal Bot (Python)
- [x] Config loader (SignalBotConfig)
- [x] Technical indicators (RSI, EMA, SMA, MACD, Bollinger Bands, ATR, ADX, VWAP)
- [x] Trend Following strategy (EMA crossover + ADX filter)
- [x] Mean Reversion strategy (RSI extremes + Bollinger Bands)
- [x] Ensemble Voter (majority / weighted modes)
- [x] Signal validator (confidence, R:R, drawdown, position limits)
- [x] WebSocket client (connects to exchange simulator)
- [x] SQLite database (signals, trades, equity curve)
- [x] Performance tracker + CSV loggers
- [x] Terminal dashboard
- [x] Main entry point (run.py) with 7-stage pipeline
- [x] Dockerfile

### 1.3 HFT Trade Bot (C++20)
- [x] Data types (Candle, Order, Position, Signal)
- [x] Config manager (YAML loader)
- [x] Logger (spdlog)
- [x] Signal receiver (WebSocket client)
- [x] HFT Signal Engine (EMA, OBI, VWAP, Price Pressure Model)
- [x] Order type selector (market vs limit)
- [x] Order executor (WebSocket)
- [x] Risk manager (pre-trade checks, position sizing)
- [x] Position manager (thread-safe, SL/TP monitoring)
- [x] Main entry point (main.cpp)
- [x] CMakeLists.txt
- [x] Dockerfile

### 1.4 Infrastructure
- [x] docker-compose.yml (3 services)
- [x] shared_config.yaml
- [x] .gitignore
- [x] LICENSE (MIT)
- [x] README.md
- [x] docs/ARCHITECTURE.md
- [x] docs/TRADING_STRATEGIES.md
- [x] docs/EXCHANGE_SIMULATOR.md
- [x] docs/SETUP.md

---

## Phase 2: Enhanced Visualizer [DONE]

### 2.1 Tabbed Terminal Interface
- [x] Tab switching: BTC/USDT | ETH/USDT | SOL/USDT (1-2-3 keys)
- [x] Per-tab candle chart with ASCII art (color-coded bullish/bearish)
- [x] Per-tab order book depth visualization (10 levels bid/ask)
- [x] Per-tab indicators panel (EMA9, EMA21, RSI, ATR)
- [x] Volume bars below candle chart
- [x] Animated price ticker in footer
- [x] Arrow key navigation (left/right to cycle tabs)
- [x] Cross-platform input (Windows msvcrt + Unix termios)

### 2.2 Account Dashboard Tab
- [x] Balance / equity / PnL display per exchange
- [x] Open positions table with live unrealized PnL + percentage
- [x] Recent orders history (last 10)
- [x] Win rate and performance metrics
- [x] Multi-exchange view (Binance, Bybit, OKX)

---

## Phase 3: Tests & CI [DONE]

### 3.1 Tests
- [x] Unit tests for indicators (SMA, EMA, RSI, MACD, BB, ATR, VWAP)
- [x] Unit tests for strategies (Trend Following, Mean Reversion, Ensemble)
- [x] Unit tests for signal validator (confidence, R:R, drawdown, positions)
- [x] Unit tests for exchange simulator (models, market simulator, order book)

### 3.2 CI/CD
- [x] GitHub Actions workflow (Python lint + test, C++ build)
- [x] .dockerignore files for all components
- [x] .gitkeep files for empty directories
- [x] CONTRIBUTING.md

---

## Phase 4: FFT Analysis & TradingView-style Visualizer [DONE]

### 4.1 FFT Cycle Analysis (Python)
- [x] Cooley-Tukey FFT implementation (radix-2, zero-padded)
- [x] Power spectrum computation with Hann window
- [x] Dominant cycle detection (top-N peaks)
- [x] Cycle strength metric (spectral entropy)
- [x] Spectral trend score (low-freq vs high-freq energy)
- [x] FFT low-pass filter (price smoothing)
- [x] FFT Cycle Indicator (complete analysis dict)
- [x] FFT Cycle Strategy (regime-based: TRENDING/RANGING/MIXED)
- [x] Unit tests for all FFT functions

### 4.2 FFT in C++ HFT Engine
- [x] Cooley-Tukey FFT (std::valarray<std::complex>)
- [x] Spectral trend score function
- [x] FFT low-pass filter function
- [x] Integrated into SignalEngine (2 additional votes: FFT trend + FFT slope)
- [x] Updated voting: 6 total votes, threshold 3

### 4.3 Enhanced Visualizer (TradingView-style)
- [x] RSI mini-chart with overbought/oversold zones (70/30 lines)
- [x] MACD mini-chart with histogram bars (green/red)
- [x] Bollinger Bands position indicator
- [x] FFT regime detection in indicator panel
- [x] Volume bars with color-coded direction

### 4.4 Tests & CI
- [x] FFT unit tests (power spectrum, cycles, trend score, filter, indicator)
- [x] All existing tests preserved

---

## Phase 5: Signal Broadcasting, Equity Sparkline, Backtesting [DONE]

### 5.1 WebSocket Signal Broadcasting (AI → HFT)
- [x] SignalPublisher WebSocket server (port 8766) in AI bot
- [x] Broadcast validated signals to connected HFT clients
- [x] Signal history on client connect
- [x] Market regime broadcasting (FFT regime updates)
- [x] C++ SignalReceiver handles "signal", "signal_history", "market_regime" messages
- [x] HFT main.cpp: dual WebSocket connections (8765 + 8766)
- [x] AI signal processing in HFT main loop (slow path, higher confidence)
- [x] docker-compose: port 8766 exposed, hft depends on ai-signal-bot

### 5.2 Equity Curve Sparkline
- [x] Equity history tracking in visualizer (per exchange, 80 points)
- [x] ASCII sparkline with 5-row height, color-coded trend
- [x] Min/max/current equity labels
- [x] Trend indicator (▲/▼)

### 5.3 Backtesting Module
- [x] Backtester engine with position simulation
- [x] Stop loss / take profit execution on historical candle highs/lows
- [x] Fee and slippage modeling
- [x] Performance metrics: return, win rate, profit factor, Sharpe, max drawdown
- [x] Multi-strategy comparison
- [x] Synthetic candle generator for testing
- [x] SQLite historical data support
- [x] run_backtest.py CLI runner
- [x] Unit tests (8 test cases)

---

## Phase 6: Arbitrage Detection & Drawdown Analysis [DONE]

### 6.1 Multi-Exchange Arbitrage Detection
- [x] ArbitrageDetector class scanning all exchange order books
- [x] Net spread calculation (after fees + slippage)
- [x] Opportunity lifecycle: OPEN → CLOSED/EXPIRED (TTL-based)
- [x] WebSocket broadcast of arbitrage opportunities to bots
- [x] C++ SignalReceiver handles "arbitrage_scan" messages
- [x] Config section in config.yaml
- [x] Unit tests (8 test cases)

### 6.2 Drawdown Analysis
- [x] Longest drawdown duration (bars)
- [x] Average drawdown during drawdown periods
- [x] Recovery factor (net profit / max drawdown)
- [x] Calmar ratio (annualized return / max drawdown)
- [x] Updated backtest report and comparison table

---

## Phase 7: C++ Tests & Integration Tests [DONE]

### 7.1 C++ Signal Engine Unit Tests
- [x] 25 test cases covering all engine components:
  - FFT (basic, power-of-2)
  - spectral_trend_score (uptrend, oscillating, short data)
  - fft_lowpass (smoothing, short data)
  - EMA (basic, short data)
  - RSI (uptrend, downtrend, short data)
  - OBI (balanced, bid-heavy, ask-heavy, empty)
  - VWAP (basic, empty)
  - Pressure (bullish, bearish, short data)
  - SignalEngine::analyze (insufficient data, uptrend, downtrend, confidence range, reason)
  - Signal struct (rr_ratio long/short, is_actionable)
- [x] CMake test target with `enable_testing()` and `ctest`
- [x] CI: C++ unit tests run in GitHub Actions

### 7.2 Integration Tests (Python)
- [x] Exchange WebSocket connection tests
- [x] Candle/price data reception tests
- [x] ExchangeClient connect/order submission tests
- [x] Strategy pipeline test with live data
- [x] SignalPublisher start/stop/broadcast/stats tests
- [x] SignalValidator tests (valid, low confidence, max positions)
- [x] Auto-skip when simulator not running

---

## Phase 8: Arbitrage Execution & Protocol Docs [DONE]

### 8.1 Arbitrage Execution in HFT Bot
- [x] `execute_arbitrage()` method in OrderExecutor (buy + sell simultaneously)
- [x] `ArbitrageCallback` in SignalReceiver (triggers on spread > 10 bps)
- [x] Arbitrage processing in main loop (highest priority, before AI signals)
- [x] Quantity capped at 0.5 to avoid market impact
- [x] Thread-safe with mutex + atomic flag

### 8.2 WebSocket Protocol Documentation
- [x] Full protocol spec: all message types on ports 8765 and 8766
- [x] Data type definitions (Candle, Account, Position, Signal)
- [x] Message flow diagrams and connection table
- [x] Linked from README

---

## Phase 9: Visualization, Optimization & Kelly Sizing [DONE]

### 9.1 Backtest Equity Curve Plotting (matplotlib)
- [x] `BacktestPlotter` with 4 chart types:
  - Equity curve with drawdown shading + metrics box
  - Trade PnL distribution (bar chart + cumulative)
  - Multi-strategy equity comparison
  - Radar chart for strategy metrics comparison
- [x] `save_all()` generates all charts to directory
- [x] `--plot` flag in run_backtest.py

### 9.2 Strategy Parameter Optimization
- [x] `StrategyOptimizer` with grid search over parameter combinations
- [x] 4 fitness functions: default (risk-adjusted), Sharpe, Calmar, profit factor
- [x] Walk-forward optimization (train/test windows)
- [x] `print_results()` with ranked parameter table
- [x] `best_params()` extraction
- [x] `--optimize` flag in run_backtest.py
- [x] Unit tests (9 test cases)

### 9.3 Kelly Criterion Position Sizing
- [x] `KellyPositionSizer` with configurable Kelly fraction (half-Kelly default)
- [x] Win rate, avg win/loss based Kelly fraction computation
- [x] Confidence-scaled position size
- [x] Max risk % and max position % caps
- [x] `from_trade_history()` factory method
- [x] Unit tests (12 test cases)

---

## Phase 10: Data Export, Config Validation & Docs [DONE]

### 10.1 Historical Data Export (CSV/Parquet)
- [x] `DataExporter` module in exchange-simulator
- [x] Export candles (OHLCV) per symbol/exchange
- [x] Export order history
- [x] Export account status snapshots
- [x] Export open positions
- [x] Export summary statistics
- [x] CSV format (built-in) + Parquet format (pyarrow)
- [x] CLI flags: `--export`, `--export-dir`, `--export-format`
- [x] 9 unit tests

### 10.2 Config Validation & Error Handling
- [x] Python `config_validator.py` — validates all config sections:
  - Required sections, exchange params, symbol cross-references
  - Market params (timeframe, warmup, drift, order book depth)
  - Account params (balance, leverage), WebSocket port range
  - Arbitrage params, visualizer refresh rate
  - Returns (errors, warnings) tuple
  - `validate_or_exit()` helper for CLI
- [x] C++ `validate_config()` in config.cpp — range checks for all params
  - Risk params, trading params, EMA periods, WebSocket URL format
  - AI Signal Bot connection config support
- [x] 19 Python validator unit tests
- [x] CI: removed `|| true` — tests and lint now fail the build

### 10.3 Contributing Guide
- [x] Full CONTRIBUTING.md with prerequisites, setup, testing
- [x] Backtesting & optimization usage
- [x] Data export usage
- [x] Code style guidelines (Python + C++)
- [x] Project structure tree
- [x] Guide for adding new features (strategies, indicators, message types)
- [x] CI pipeline documentation

---

## Phase 11: Order Book Replay & Linting [DONE]

### 11.1 Order Book Replay for Backtesting
- [x] `OrderBookReplay` — synthetic order book generation from OHLCV candles
  - Volatility-based spread estimation from candle range
  - Volume-weighted level distribution with decay
  - Bullish/bearish candle body → OBI imbalance injection
  - Reproducible with seed
- [x] `ReplayOrderBook` with computed properties: mid_price, spread, spread_bps, OBI, VWAP
- [x] `replay_with_imbalance_injection()` — periodic institutional order flow simulation
- [x] `OrderBookBacktester` — wraps standard Backtester with order book data
  - Supports strategies with `analyze_with_order_book()` method
- [x] 22 unit tests (order book properties, replay generation, backtester integration)

### 11.2 Ruff Linting Configuration
- [x] `pyproject.toml` for both exchange-simulator and ai-signal-bot
- [x] Rules: E, W, F, I (isort), UP (pyupgrade), B (bugbear)
- [x] Line length 120, Python 3.12 target
- [x] CI enforces linting (no `|| true`)

### 11.3 Dockerfile Updates
- [x] AI Signal Bot Dockerfile: system deps for matplotlib/numpy

---

## Phase 12: Web UI Dashboard [DONE]

### 12.1 Web UI Project Setup
- [x] React 18 + Vite 5 + TailwindCSS 3 (dark theme)
- [x] lightweight-charts 4 (TradingView) for candlestick charts
- [x] lucide-react icons
- [x] Dockerfile + docker-compose integration (port 3000)
- [x] `.env` for WebSocket URL configuration

### 12.2 WebSocket Data Layer
- [x] `useWebSocket` hook — auto-reconnect, send, connection status
- [x] `useExchangeData` hook — candles, prices, accounts, arbitrage, fills
- [x] `useSignalData` hook — AI signals, market regime, signal history
- [x] Candle deduplication via Map (exchange|symbol|timestamp key)
- [x] Memory-bounded (last 500 candles)

### 12.3 TradingView-Style Candle Chart
- [x] Candlestick series (green/red) with volume histogram overlay
- [x] Crosshair, price scale, time scale with time labels
- [x] ResizeObserver for responsive sizing
- [x] Dark theme matching Binance style

### 12.4 Binance-Style Order Book + Order Form
- [x] Order book: 15 levels bid/ask, cumulative totals, depth bars
- [x] Spread display in basis points
- [x] Order form: BUY/SELL toggle, MARKET/LIMIT, quantity, SL/TP
- [x] Live notional calculation, submit confirmation

### 12.5 Account, Positions, Signals, Arbitrage, Fills
- [x] Account panel: per-exchange balance, equity, PnL, fees, win rate
- [x] Positions panel: open positions with unrealized PnL, close button
- [x] Signal feed: AI signals with direction, confidence, R:R, regime
- [x] Arbitrage panel: active opportunities with spread, profit, stats
- [x] Fills panel: recent order fill history with status

### 12.6 Documentation Updates
- [x] `docs/WEB_UI.md` — full guide with features, layout, components
- [x] `docs/ARCHITECTURE.md` — Web UI component, data flow, tech stack
- [x] `README.md` — Web UI features, tech stack, project structure
- [x] `docker-compose.yml` — web-ui service (port 3000)

---

## Phase 13: GitHub-Ready Release [DONE]

### 13.1 CI/CD Pipeline
- [x] 4 CI jobs: Python tests + lint, C++ build + tests, Web UI build, Docker build
- [x] pip caching for Python jobs
- [x] npm caching for Web UI job
- [x] Strict tests (no `|| true`) — failures block merge
- [x] ruff linting with `pyproject.toml` config (per-file ignores for tests)
- [x] Docker build verification for all 3 images

### 13.2 Test Infrastructure
- [x] `conftest.py` for both Python components (sys.path setup)
- [x] pytest in exchange-simulator requirements
- [x] Per-file ruff ignores for test fixtures

### 13.3 GitHub Templates
- [x] Bug report template (`.github/ISSUE_TEMPLATE/bug_report.md`)
- [x] Feature request template (`.github/ISSUE_TEMPLATE/feature_request.md`)
- [x] Pull request template (`.github/PULL_REQUEST_TEMPLATE.md`)

### 13.4 README Polish
- [x] Badges: CI, License, Python, C++, React, Docker
- [x] 4-component description (exchange, AI, HFT, Web UI)
- [x] Docker quick start (recommended) + manual setup
- [x] Web UI in project structure

### 13.5 Security & Cleanup
- [x] No secrets/API keys in any config or code
- [x] `.gitignore` updated: web-ui/node_modules, dist, .vite
- [x] LICENSE (MIT) present
- [x] No sensitive data in `.env` (only localhost WebSocket URLs)

### 13.6 Docker Healthchecks
- [x] Exchange simulator: WebSocket port 8765 check
- [x] AI Signal Bot: WebSocket port 8766 check

---

## Phase 14: Indicators, Risk Manager & Real Order Books [DONE]

### 14.1 Web UI Chart Indicators
- [x] `utils/indicators.js` — EMA, RSI, SMA, Bollinger Bands calculations
- [x] CandleChart: EMA 9/21/50 overlays (toggle on/off)
- [x] CandleChart: Bollinger Bands overlay (dashed lines)
- [x] CandleChart: RSI 14 panel (separate chart, synced time scale)
- [x] Indicator toggle buttons with color-coded active state

### 14.2 Risk Manager (Trailing Stop + Breakeven)
- [x] `src/risk/risk_manager.py` — `RiskManager`, `RiskConfig`, `PositionRiskState`
- [x] Trailing stop: fixed % or ATR-based distance, SL only moves favorably
- [x] Breakeven move: SL → entry price + buffer after threshold reached
- [x] Partial take profit: close % of position at trigger level
- [x] Max hold time: auto-close after N candles
- [x] Integrated into `Backtester` via `risk_config` parameter
- [x] 20 unit tests (breakeven, trailing, partial TP, max hold, combined)

### 14.3 Real Order Book Broadcast
- [x] Exchange simulator: order book snapshots in broadcast + initial snapshot
- [x] WebSocket message includes `orderbooks` dict (exchange|symbol → bids/asks)
- [x] Web UI: `useExchangeData` hook stores orderbooks
- [x] OrderBook component: uses real data when available, synthetic fallback

---

## Phase 15: Performance Dashboard [DONE]

### 15.1 Performance Dashboard Component
- [x] `utils/performance.js` — aggregate metrics, equity curve builder, drawdown calculator
- [x] `PerformanceDashboard.jsx` — summary cards (balance, equity, PnL, win rate, trades, positions)
- [x] Per-exchange breakdown panel (balance, PnL, win rate per exchange)
- [x] Equity curve chart (lightweight-charts area series, blue gradient)
- [x] Drawdown chart (red area series, inverted)
- [x] Signal statistics (total, long, short counts)
- [x] Added "Perf" tab to App.jsx tabbed panels

---

## Phase 16: Backtest Runner [DONE]

### 16.1 AI Signal Bot: Backtest WebSocket Endpoint
- [x] `signal_publisher.py` — `_run_backtest()` method handles `run_backtest` messages
- [x] Generates synthetic candles with configurable params (candles, price, volatility)
- [x] Runs all strategies (Trend, Mean Reversion, FFT, Ensemble) or individual
- [x] Optional trailing stop and breakeven via `RiskConfig`
- [x] Returns `backtest_result` JSON with equity curves, metrics per strategy
- [x] Fixed `BacktestResult.total_trades` not being set in `run()`

### 16.2 Web UI: BacktestRunner Component
- [x] `BacktestRunner.jsx` — config form (strategy, candles, balance, volatility, risk options)
- [x] Equity curve chart with multi-strategy colored lines (lightweight-charts)
- [x] Strategy comparison table (return, trades, win%, PF, maxDD, Sharpe)
- [x] Detailed per-strategy metrics cards
- [x] `useSignalData` hook updated: handles `backtest_result`, exposes `sendSignalMessage`
- [x] Added "BT" tab to App.jsx (FlaskConical icon)

---

## Phase 17: Tests, CI & Release Prep [DONE]

### 17.1 Tests
- [x] `test_signal_publisher.py` — 8 async tests for backtest WebSocket endpoint
- [x] `pytest-asyncio` added to requirements and CI
- [x] `asyncio_mode = "auto"` in pyproject.toml

### 17.2 CI & Infrastructure
- [x] CI: `pytest-asyncio` added to install step
- [x] `BacktestResult.total_trades` bugfix (was never set in `run()`)
- [x] Removed unused `LineStyle` import in PerformanceDashboard.jsx

### 17.3 Documentation
- [x] CONTRIBUTING.md: new sections for chart indicators, risk manager features, updated CI
- [x] CHANGELOG.md: comprehensive v1.0.0 release notes
- [x] WEBSOCKET_PROTOCOL.md: orderbook data in snapshot/candles, backtest messages, Web UI connections
- [x] OrderBook and BacktestResult data types documented

### 17.4 Exchange Simulator Tests
- [x] `test_websocket_orderbook.py` — 3 async tests for orderbook broadcast
- [x] `pytest-asyncio` added to exchange-simulator requirements
- [x] `asyncio_mode = "auto"` in exchange-simulator pyproject.toml

### 17.5 Infrastructure & Polish
- [x] All 3 Dockerfiles verified (exchange-sim, ai-signal-bot, web-ui)
- [x] docker-compose.yml includes all 4 services with healthchecks
- [x] `web-ui/.env.example` created with WebSocket URL vars
- [x] `.gitignore` updated: build_log.txt, _final_cleanup.py added
- [x] `Makefile` created: install, dev, test, lint, build, docker-up/down, clean
- [x] Ruff lint passes on both Python components (0 errors)
- [x] All `.dockerignore` files present (exchange-sim, ai-signal-bot, hft-trade-bot, web-ui)
- [x] LICENSE (MIT), GitHub issue templates, PR template verified
- [x] No TODO/FIXME/HACK comments in production code
- [x] Temp cleanup scripts excluded from git via .gitignore
- [x] All web-ui imports verified (11 components, 2 hooks, 3 utils — all exist)
- [x] Web UI infrastructure verified: index.html, main.jsx, index.css, postcss.config.js, tailwind.config.js, vite.config.js
- [x] HFT Trade Bot: CMakeLists.txt, Dockerfile, 12 source files, 1 test file — all verified
- [x] `shared_config.yaml` updated with both WebSocket endpoints (8765 + 8766)
- [x] All `__init__.py` files present in ai-signal-bot (9 packages)
- [x] Config files verified: `ai-signal-bot/config/settings.yaml`, `exchange-simulator/config.yaml`
- [x] Web UI Dockerfile improved: multi-stage build (node builder + nginx alpine), smaller image
- [x] `nginx.conf` added for SPA routing and static asset caching
- [x] `.editorconfig` added for consistent coding style across IDEs
- [x] ARCHITECTURE.md updated: 8-stage pipeline, risk manager, backtest engine, backtest data flow
- [x] `exchange_simulator/__init__.py` + `__main__.py` created for proper package imports
- [x] README.md: Troubleshooting section added (WebSocket, Web UI, npm, C++, Docker, Python tests)
- [x] Bugfix: EnsembleVoter created with empty strategies list when only "ensemble" selected
- [x] Bugfix: web-ui/.gitignore missing .env (would commit secrets)
- [x] Bugfix: BacktestRunner no timeout — added 30s safety timeout
- [x] exchange_simulator/__init__.py: added arbitrage, config_validator, data_export modules, error handling
- [x] UI: symbol selector upgraded from dropdown to button group (BTC/ETH/SOL)
- [x] UI: price change % indicator added to header (green/red with arrow icon)
- [x] `start.bat` + `start.sh` — opens 3 CLI windows + Web UI automatically
- [x] CLI logging verified in all 3 components (exchange-sim, ai-signal-bot, hft-trade-bot)
- [x] Full trading simulation: fills broadcast to ALL clients (Web UI sees bot trades)
- [x] Account snapshot included in initial WebSocket connection
- [x] ClosedTrade model added — tracks entry/exit/PnL/reason for each closed position
- [x] TradeHistory.jsx component — new "History" tab showing closed trades with PnL
- [x] SL/TP reason recorded in trade history (STOP_LOSS / TAKE_PROFIT / MANUAL)
- [x] UI: Quick-trade buttons in OrderForm (25%/50%/75%/100% of balance)
- [x] UI: Market regime badge on chart header (TRENDING/RANGING/VOLATILE)
- [x] UI: Mini PnL bars in AccountPanel (recent 10 trades, green/red)
- [x] UI: PnL % indicator in AccountPanel header
- [x] UI: Risk Metrics section in PerformanceDashboard (Max DD, PF, Avg Win/Loss, Fees)
- [x] UI: Ticker tape in Header — all 9 prices (3 exchanges × 3 symbols), clickable
- [x] UI: PriceComparison panel — cross-exchange prices with spread + arb opportunity badge
- [x] Exchange Simulator CLI: logs all bot orders (FILLED/REJECTED) with details
- [x] Exchange Simulator: SL/TP fills broadcast to ALL clients (Web UI sees auto-closes)
- [x] Toast notification system — connection changes, fills, strong signals
- [x] Per-exchange volatility multiplier (binance baseline, bybit +5%, okx -5%)
- [x] UI: slide-in animation for toasts, thin scrollbar for ticker tape
- [x] BotStatus panel — AI bot + HFT bot status cards, portfolio overview, combined activity feed
- [x] Keyboard shortcuts — 1/2/3 switch exchange, Q/W/E switch symbol
- [x] PositionsPanel: liquidation price, leverage badge, margin, SL/TP progress bar, danger warning
- [x] OrderForm: per-exchange fee + slippage breakdown with total cost calculation
- [x] StatusBar — bottom bar with sim time, candle count, bot activity, portfolio summary, connection dots
- [x] OrderBook: depth imbalance bar, per-level qty bars, spread $ display
- [x] FillsPanel: fill statistics (volume, notional, fees, buy/sell ratio bar)
- [x] Funding rate simulation — per-exchange rates updated every 96 candles (8h equiv), shown in StatusBar
- [x] CandleChart: trade execution markers (green ↑B / red ↓S arrows), toggleable
- [x] CandleChart: volume histogram (green/red bars at bottom, already existed, confirmed)
- [x] PerformanceDashboard: win/loss streak tracking (current, max win, max loss)
- [x] TradeHistory: summary stats (total, win rate, PnL, W/L), best/worst trade highlight with ring
- [x] Simulation speed control — Pause/1x/2x/5x buttons in Header, spacebar toggle, backend set_speed command
- [x] AccountPanel: exchange PnL leaderboard with medal colors, sorted by PnL
- [x] SignalFeed: confidence distribution histogram (5 buckets, color-coded)
- [x] TradeHistory: CSV export button (downloads all trades as .csv)
- [x] PerformanceDashboard: Sharpe ratio + Sortino ratio (annualized, risk-adjusted returns)

---

## Phase 17: Advanced Composite Indicators [DONE]

### 17.1 Composite Signal Dashboard
- [x] Aggregates 10 indicators (RSI, MACD, EMA cross, SMA, ATR, Volume, Momentum, BB, Signals, Fills)
- [x] Strength-weighted bull/bear/neutral scoring
- [x] Consensus label (Strong Buy → Strong Sell)

### 17.2 Signal Confidence Scorer
- [x] 8-factor confidence model (trend, RSI, volume, volatility, consensus, price, body, contradiction)
- [x] Confidence level (Very High → Very Low) with entry recommendation

### 17.3 Regime Adaptive Strategy
- [x] Detects 5 regimes (Trending Up/Down, Ranging, Volatile, Calm)
- [x] Strategy recommendations per regime with entry/stop/target levels
- [x] Position sizing guidance

### 17.4 Cross-Market Divergence
- [x] BTC dominance vs alts
- [x] ETH/BTC ratio tracking
- [x] Pair divergence detection across all symbols

### 17.5 Performance Attribution
- [x] P&L by side, symbol, strategy, hour, day of week
- [x] Hour heatmap visualization
- [x] Best/worst analysis

### 17.6 Price Action Score
- [x] 10 candlestick pattern scores (engulfing, pin bar, inside/outside, streaks, HH/HL, body efficiency, RSI, trend, rejection, momentum)
- [x] Composite 0-100 score with bullish/bearish label

### 17.7 Code Quality Audit
- [x] Added missing calcMACD to indicators.js
- [x] Removed dead code in calcADX (empty loop) and calcVWAPMACD (overwritten result)
- [x] Fixed division-by-zero guards in VolatilitySurface, RiskParityCalculator, TrailingStopCalculator
- [x] Fixed hook order anti-pattern in App.jsx (TDZ: chartCandles/currentPrice used before definition)
- [x] Removed unused imports across 5 components
- [x] Kleppmann audit: WS backoff, JSON try/catch, state sync, candle dedup, memory cap, localStorage safety

---

## Phase 18: New Indicators + Audit [DONE]

### 18.1 New Components
- [x] Tick Speed Anomaly Detector — detects burst/block tick patterns with volume confirmation, gap z-score sparkline, fill speed bars
- [x] Put/Call Ratio Simulator — simulated P/C from fill directions, rolling ratio, smart money vs retail divergence, volume-weighted
- [x] Correlation Heatmap — visual SVG matrix with color-coded Pearson correlations, diversification score, strongest pairs
- [x] Signal Matrix Heatmap — 8 indicators × N symbols grid with bull/bear/neutral cells, aggregate score per symbol
- [x] MIT Order Simulator — Market-if-Touched order planner with ATR-based touch price, probability estimation, R:R, stop/target

### 18.2 Code Quality Audit (Round 2)
- [x] No console.log debug statements found anywhere
- [x] No var declarations (all const/let)
- [x] `== null` checks are intentional (catches both null and undefined)
- [x] All localStorage operations wrapped in try/catch
- [x] All indicator imports verified against exports in indicators.js
- [x] No dead/unused components found (all 51 .jsx files imported somewhere)

---

## Phase 19: Execution Analytics + Audit Round 3 [DONE]

### 19.1 New Components
- [x] Slippage Simulator — 4 slippage models (linear, square-root, constant, volume-based), fee tiers, cost breakdown, TWAP savings comparison, liquidity zone detection
- [x] Order Flow Heatmap — aggregated per-candle heatmap (volume, delta, imbalance, body efficiency, fills), absorption/momentum detection, cumulative delta chart

### 19.2 Code Quality Audit (Round 3)
- [x] Removed unused formatPrice imports from CumulativeTickIndex, CumulativeVolumeDelta, ConfigPanel
- [x] All 7 hooks verified: useWebSocket (exponential backoff, JSON try/catch), useExchangeData (candle dedup, memory cap), useTheme (localStorage try/catch), useSoundAlerts (AudioContext try/catch), useTradeJournal (localStorage try/catch, CSV escaping), useDetachablePanels (popup null check), useMediaQuery (cleanup)
- [x] No Kleppmann violations: all error paths handled, no unbounded memory growth, all async operations have cleanup

---

## Phase 20: Advanced Features + Lazy Loading [DONE]

### 20.1 New Components
- [x] Market Depth Replay — reconstructs L2 orderbook from candle OHLC, timeline scrubber, play/pause/step, speed control, imbalance bar, fill overlay
- [x] Indicator Formula Parser — custom expression parser (tokenizer + AST evaluator), supports SMA/EMA/RSI/ATR/BB/MACD/MAX/MIN/ABS/CROSS, variables (closes/highs/lows/volumes/open), signal detection, sparkline

### 20.2 Infrastructure
- [x] React.lazy + Suspense wrapper in PanelContainer — each panel wrapped in Suspense with loading fallback, ready for lazy import conversion

---

## Phase 21: Error Boundaries + Audit Round 4 [DONE]

### 21.1 Infrastructure
- [x] PanelErrorBoundary — class component with getDerivedStateFromError, retry button, error message display, onError callback
- [x] Integrated into PanelContainer — each panel wrapped in ErrorBoundary + Suspense (triple protection: error boundary → suspense → component)

### 21.2 Code Quality Audit (Round 4)
- [x] App.jsx: all hooks in correct order, useEffects have proper deps + cleanup, keyboard listener cleaned up, no TDZ issues
- [x] All Math.max/min(...spread) calls verified — all guarded by length checks before spread
- [x] All reduce()/length divisions verified — all guarded by early returns or length checks
- [x] useMediaQuery: SSR guard, proper event listener cleanup
- [x] No new issues found — codebase is clean across 4 audit rounds

---

## Phase 22: List Virtualization + Audit Round 5 [DONE]

### 22.1 Performance
- [x] VirtualList component — generic windowed list renderer with overscan, absolute positioning, scroll-based virtualization
- [x] Applied to FillsPanel — renders only visible fills (64px items) instead of all fills in DOM
- [x] Applied to SignalFeed — renders only visible signals (72px items) instead of all signals in DOM

### 22.2 Code Quality Audit (Round 5 — Final)
- [x] 12 console.warn statements found in 6 components — ALL are in catch blocks for localStorage/sound errors (correct Kleppmann error handling, not debug statements)
- [x] No var declarations (false positives were `variance`, `varPct` variable names)
- [x] `== null` in SessionStats is intentional (catches null + undefined)
- [x] All 125 component files verified as imported somewhere (registry.js or App.jsx) — no dead components
- [x] Codebase is clean after 5 audit rounds

---

## Phase 23: CLI Monitor Windows [DONE]

### 23.1 New Monitor Scripts
- [x] `ai-signal-bot/monitor.py` — connects to signal WS (8766), displays live signal feed (direction, confidence, entry, SL, TP, R:R), bot log tail, signal CSV history, auto-reconnect with exponential backoff
- [x] `hft-trade-bot/monitor.py` — checks C++ process status, tails HFT log file with color-coded output (red=error, yellow=warn, cyan=trade), counts signals/trades/warnings/errors
- [x] `error_monitor.py` — tails all 3 service logs (exchange, AI bot, HFT bot), filters for errors+warnings only, unified display with source labels, color-coded by severity
- [x] `price_monitor.py` — dual WebSocket connection (exchange 8765 + signals 8766), live price table with 24h high/low, color-coded by price position, signal feed with direction arrows, recent fills display

### 23.2 Infrastructure
- [x] `start.bat` updated — 8 windows (4 services + 4 monitors), 5s delay before monitors start
- [x] `start.sh` updated — 8 terminal tabs (4 services + 4 monitors), 5s delay before monitors start
- [x] README updated with CLI Monitor Windows section (tables for service + monitor windows)

---

## Phase 24: Advanced Mathematical Models [DONE]

### 24.1 New Components (5)
- [x] GARCHVolatility — GARCH(1,1) with MLE gradient descent, EWMA (λ=0.94), Parkinson H/L vol, regime classification (LOW/MEDIUM/HIGH), trend forecast (RISING/FALLING/STABLE), persistence + half-life, unconditional variance, SVG comparison chart
- [x] CointegrationScanner — Engle-Granger 2-step cointegration test (OLS regression → ADF test on residuals), half-life of mean reversion, z-score entry/exit signals (long A/short B, short A/long B, watch), correlation + R², multi-pair ranking by cointegration significance
- [x] MarkovRegimePredictor — 6-state Markov chain (CALM, RANGING, TRENDING_UP, TRENDING_DOWN, VOLATILE, TRENDING_VOL), transition matrix estimation, stationary distribution via power iteration, next-regime probability forecast, skewness + kurtosis, heatmap visualization
- [x] FractalAnalyzer — Hurst exponent via R/S analysis (log-log regression), fractal dimension (2-H), DFA (detrended fluctuation analysis), autocorrelation function with 95% CI, behavior classification (persistent/anti-persistent/random walk)
- [x] KalmanFilterPrice — 1D and 2D Kalman filter models, adaptive Kalman gain tracking, residual analysis, velocity estimation (2D), interactive Q/R parameter tuning, trend detection
- [x] SpectralAnalysis — Welch's PSD estimation (Hann window, 50% overlap), dominant cycle detection, spectral entropy (normalized), noise color classification (white/pink/brown/blue), frequency power concentration

### 24.2 Mathematical Techniques Used
- GARCH(1,1) MLE with gradient descent and stationarity constraints (α+β < 1)
- Engle-Granger 2-step cointegration test with ADF critical values
- Markov chain transition matrix + stationary distribution (power iteration)
- Rescaled Range (R/S) analysis for Hurst exponent
- Detrended Fluctuation Analysis (DFA) with linear detrending
- Discrete Fourier Transform (DFT) with Hann window
- Welch's method for PSD estimation with overlapping segments
- Kalman filter (1D and 2D state-space models) with adaptive gain
- Autocorrelation function with confidence intervals

---

## Phase 25: HFT Bot Optimization + Native Signal Engine V2 [DONE]

### 25.1 Latency Optimization Infrastructure (TASK 1)
- [x] `Spinlock` with `_mm_pause` — for < 1μs critical sections (replaces `std::mutex`)
- [x] `SpinlockGuard` — RAII wrapper for spinlock
- [x] `SPSCQueue<T, Capacity>` — lock-free single-producer single-consumer ring buffer (power-of-2 capacity, cache-line padded head/tail)
- [x] `ObjectPool<T, PoolSize>` — pre-allocated object pool, no heap alloc in hot path
- [x] `LatencyHistogram` — 35 μs-buckets, P50/P95/P99/P99.9 tracking, thread-safe atomics
- [x] `ScopedLatency` — RAII timer with microsecond precision (`steady_clock`)
- [x] `ThreadAffinity` — pin thread to core (Win32 `SetThreadAffinityMask` / Linux `pthread_setaffinity_np`), set priority (`THREAD_PRIORITY_TIME_CRITICAL` / `SCHED_FIFO`)
- [x] `CircuitBreaker` — 5 errors → 30s cooldown → half-open probe
- [x] `RetryPolicy` — exponential backoff (3 attempts, 500ms×2^n, 0-30% jitter)
- [x] Cache-line aligned structs: `AlignedOrderBookLevel` (64B), `FastSignal` (192B), `FastOrder` (128B), `PressureResult` (64B), `RoutingDecision` (128B)
- [x] CMake: `-O3`, `-flto` (LTO), `-msse4.2 -march=native`, `-ffast-math`, `-finline-functions`

### 25.2 Native Signal Engine V2 (TASK 2)
- [x] `InlineEMA` — O(1) per update, no vector allocation
- [x] `InlineRSI` — Wilder's smoothing, O(1) per update
- [x] `InlineADX` — trend strength (0-100), Wilder's smoothing
- [x] `InlineVWAP` — running cumulative VWAP with deviation calculation
- [x] `SignalEngineV2` — weighted composite score with 6 indicators:
  - EMA(21/50) crossover — weight 0.25
  - RSI(14) — weight 0.15
  - OBI(5/10/20 levels weighted) — weight 0.20
  - VWAP deviation — weight 0.10
  - ADX(14) trend strength × direction — weight 0.10
  - Pressure model — weight 0.20
- [x] Composite score → BUY/SELL/HOLD + confidence (0-100) + SL/TP (ATR-based)
- [x] Configurable cooldown between signals (default 5000ms)
- [x] Dynamic leverage: confidence ≥85 + ADX >30 → 5x, ≥75 → 3x, else 1x
- [x] No heap allocations in signal generation path (stack-allocated arrays, max 256 candles)
- [x] All calculations inlined with `[[likely]]`/`[[unlikely]]` hints

### 25.3 Order Book Pressure Model (TASK 3)
- [x] Multi-level OBI: 5/10/20 levels + distance-weighted OBI (linear decay)
- [x] Trade flow imbalance: buyer vs seller initiated volume ratio
- [x] Toxicity detection: large aggressive orders → toxic score [0,1] (count_ratio × 0.5 + volume_ratio × 0.5)
- [x] Queue position estimation at best bid/ask (ratio of best level to total depth)
- [x] Spread regime: TIGHT (<1bp) / NORMAL (1-5bp) / WIDE (>5bp)
- [x] Price impact prediction: `obi*2 + trade_imbalance*1.5 + microprice_dev*0.5` (bps)
- [x] Microprice deviation from mid: `(microprice - mid) / mid × 10000` (bps)

### 25.4 Smart Order Router V2 (TASK 4)
- [x] `IExchange` interface (DIP/SOLID — no concrete exchange in core)
- [x] `ExchangeBase` — base implementation with EMA latency tracking + toxic event counting
- [x] 5 routing strategies: BestPrice, LowestLatency, LowestFees, BestEffective, DepthAware
- [x] Per-exchange latency tracking (running EMA, μs)
- [x] Fee schedule (maker/taker per exchange)
- [x] Anti-toxic backoff: skip exchanges with ≥5 toxic events
- [x] Depth-aware routing: penalize exchanges with insufficient depth
- [x] Output: `RoutingDecision {exchange, effective_price, fee, latency, is_maker, reason}`

### 25.5 Adaptive Order Type Selection V2 (TASK 5)
- [x] Dynamic IOC/FOK/GTD/PostOnly based on: confidence, spread, OBI, toxicity
- [x] Emergency (conf ≥95) → FOK (urgent fill)
- [x] Toxic (score ≥0.5) → IOC (avoid adverse selection)
- [x] High confidence + tight spread → IOC (fast execution)
- [x] High confidence + strong OBI → IOC (momentum)
- [x] Large order vs thin depth → GTD (passive split)
- [x] Low confidence + wide spread → PostOnly (maker rebate)
- [x] Binance mapping: IOC, FOK, GTX (post-only), GTC+expire (GTD)
- [x] OKX mapping: market, ioc, fok, gtc, post_only
- [x] Bybit mapping: Market, Limit + GoodTillCancel/ImmediateOrCancel/FillOrKill/PostOnly

### 25.6 Integration & Config
- [x] `config.h` / `config.cpp` — 20+ new config parameters for v2 systems
- [x] `config.yaml` — full v2 configuration sections
- [x] `main.cpp` — v2.0.0 with integrated SignalEngineV2, PressureModel, SmartOrderRouterV2, AdaptiveOrderSelectorV2
- [x] Latency histograms for signal/risk/exec/loop phases
- [x] Graceful shutdown: cancel all open positions before exit
- [x] V1 fallback engine preserved (configurable via `signal_engine_v2_enabled`)
- [x] `CMakeLists.txt` — v2.0.0, LTO, -O3, simdjson optional, v2 test target

### 25.7 Test Suite
- [x] `test_signal_engine_v2.cpp` — 30+ tests covering:
  - Spinlock, SPSCQueue (basic/full/wraparound), ObjectPool (basic/exhaustion)
  - LatencyHistogram, ScopedLatency, CircuitBreaker
  - InlineEMA, InlineRSI, InlineVWAP
  - SignalEngineV2 (trending up/down, ranging, cooldown, insufficient data)
  - FastSignal/FastOrder struct validation
  - PressureModel (OBI, spread regime, microprice, trade imbalance, toxicity, impact)
  - SmartOrderRouterV2 (best price, lowest latency, lowest fees, best effective, toxic backoff, no available)
  - AdaptiveOrderSelectorV2 (emergency FOK, toxic IOC, high-conf IOC, low-conf PostOnly, large GTD, exchange mappings)
  - ThreadAffinity

### 25.8 New Files
- `src/utils/low_latency.h` — Spinlock, SPSCQueue, ObjectPool, LatencyHistogram, ScopedLatency, ThreadAffinity, CircuitBreaker, RetryPolicy
- `src/data/aligned_types.h` — AlignedOrderBookLevel, FastSignal, FastOrder, PressureResult, RoutingDecision
- `src/strategies/signal_engine_v2.h` — InlineEMA, InlineRSI, InlineADX, InlineVWAP, SignalEngineV2
- `src/strategies/pressure_model.h` — PressureModel with multi-level OBI, toxicity, microprice, queue position
- `src/execution/smart_order_router_v2.h` — IExchange, ExchangeBase, SmartOrderRouterV2
- `src/execution/adaptive_order_selector_v2.h` — AdaptiveOrderSelectorV2 with Binance/OKX/Bybit mappings
- `tests/test_signal_engine_v2.cpp` — 30+ unit tests

---

## Phase 26: Advanced Mathematical Models V2 [DONE]

### 26.1 Ehlers SuperSmoother Filter (DSP)
- 2-pole super smoother: `a1 = exp(-π√2/period)`, zero-lag smoothing
- Roofing Filter: high-pass (removes trend) + super smoother (removes noise)
- MESA Adaptive Moving Average (MAMA/FAMA): Hilbert Transform phase detection
  - Smooth → Detrender → Q/I → JI/JQ → I2/Q2 → Re/Im → Period → Phase → Alpha
  - MAMA crossover above FAMA = BUY, below = SELL
- SNR calculation: `10·log10(varPrice/varResidual)` in dB
- Lag analysis: cross-correlation between price and filter returns

### 26.2 Bayesian Price Predictor
- Beta-Binomial model: P(up tomorrow) with conjugate Beta prior
  - Posterior: Beta(α₀/2 + ups, β₀/2 + downs)
  - 95% credible interval via inverse CDF (bisection)
- Normal-Inverse-Gamma: posterior distribution of mean return
  - Conjugate updating: μ_N, κ_N, a_N, b_N
- BOCPD (Bayesian Online Changepoint Detection)
  - Hazard function H = 1/hazardRate
  - Predictive probability vs changepoint probability
- Bayesian Ridge Regression (EM-based)
  - Features: [intercept, lag1, lag2, RSI proxy, volatility]
  - Posterior: Σ = (αI + βXᵀX)⁻¹, μ = βΣXᵀy
  - EM updates for α (weight precision) and β (noise precision)
  - In-sample R² and 95% prediction interval

### 26.3 Almgren-Chriss Optimal Execution
- Implementation shortfall model: E[cost] + λ·Var[cost]
- Optimal trajectory: x(t) = X·sinh(κ(T-t))/sinh(κT)
  - κ = √(λσ²/η)
- Temporary impact: η·v²·dt (per-trade cost)
- Permanent impact: ½γX² (affects all future prices)
- Efficient frontier: vary λ → (stdDev, expectedCost) curve
- TWAP comparison: linear trajectory baseline
- Savings: AC vs TWAP cost reduction (%)

### 26.4 Wavelet Decomposition (MRA)
- Haar wavelet (D2): simple 2-coefficient scaling/wavelet
- Daubechies D4: 4-coefficient wavelet with compact support
- Multi-level DWT: cascading approximation/detail decomposition
- IDWT reconstruction: perfect reconstruction from coefficients
- MRA: separate trend + detail components at each scale
- Wavelet variance: energy distribution across scales
- Soft-thresholding denoising: `v' = v·(1 - T/|v|)` if |v| > T
- SNR-based signal: trend direction × noise level

### 26.5 K-Means Market Clustering
- K-Means++ initialization: weighted random centroid seeding
- Lloyd's algorithm: assignment + update iterations
- 8-dimensional feature space:
  - Mean return, volatility, skewness, kurtosis
  - Mean absolute return, lag-1 autocorrelation
  - Trend strength (R²), volume ratio
- Silhouette score: (b-a)/max(a,b) for optimal K selection
- Regime labels: Calm Trend, Calm Range, Volatile Trend, Volatile Range, Extreme Vol, Strong Trend, Skewed, Normal
- Regime transition tracking: detect shifts between clusters

### 26.6 Copula Dependency Model
- Sklar's theorem: F(x,y) = C(F_X(x), F_Y(y))
- Empirical copula: rank-based uniform margins
- Clayton copula: C(u,v) = (u^(-θ) + v^(-θ) - 1)^(-1/θ)
  - Lower tail dependence: λ_L = 2^(-1/θ)
- Gumbel copula: C(u,v) = exp(-[(-ln u)^θ + (-ln v)^θ]^(1/θ))
  - Upper tail dependence: λ_U = 2 - 2^(1/θ)
- Gaussian copula: Φ_ρ(Φ⁻¹(u), Φ⁻¹(v))
  - Drezner-Priestley bivariate normal CDF
- Student-t copula: symmetric tail dependence
- Kendall's τ → copula parameter fitting
- Conditional crash probability: P(V < q | U < q)
- Log-likelihood goodness-of-fit comparison
- Contour visualization in [0,1]² copula space

### 26.7 New Files
- `web-ui/src/components/EhlersSuperSmoother.jsx` — SuperSmoother, Roofing Filter, MAMA/FAMA
- `web-ui/src/components/BayesianPricePredictor.jsx` — Beta-Binomial, NIG, BOCPD, Bayesian Ridge
- `web-ui/src/components/AlmgrenChriss.jsx` — Optimal execution trajectory + frontier
- `web-ui/src/components/WaveletDecomposition.jsx` — Haar/Daubechies DWT, MRA, denoising
- `web-ui/src/components/KMeansClustering.jsx` — K-Means++, silhouette, regime detection
- `web-ui/src/components/CopulaModel.jsx` — Clayton/Gumbel/Gaussian/Student-t copulas

### 26.8 Registry
- 6 new panels registered in `registry.js`
- Total: 136 component files, ~126 registered panels across 7 categories

---

## Phase 27: Advanced Mathematical Models V3 [DONE]

### 27.1 Hidden Markov Model (HMM)
- Baum-Welch (EM) training: forward-backward + parameter re-estimation
  - Forward: α_t(j) = [Σ_i α_{t-1}(i)·a_ij]·b_j(o_t) with scaling
  - Backward: β_t(i) = Σ_j a_ij·b_j(o_{t+1})·β_{t+1}(j)
  - γ_t(i) = α_t(i)·β_t(i) / P(O|λ)
  - ξ_t(i,j) = α_t(i)·a_ij·b_j(o_{t+1})·β_{t+1}(j) / P(O|λ)
- Viterbi decoding: δ_t(j) = max_i [δ_{t-1}(i)·a_ij]·b_j(o_t) (log space)
- Return quantization into M discrete observation symbols
- State labeling: Calm Bull, Volatile Bull, Calm Bear, Volatile Bear, Sideways, High Vol
- Next-state prediction via transition matrix

### 27.2 Principal Component Analysis (PCA)
- Jacobi eigenvalue algorithm for symmetric matrices
  - Iterative rotation to zero off-diagonal elements
  - Convergence: max off-diagonal < tolerance
- Covariance-based PCA: Σ = (1/n)·X_cᵀ·X_c
- Explained variance ratio + cumulative
- Eigenportfolio construction: weights ∝ eigenvector / σ
- Factor interpretation: Market Factor (PC1), Slope Factor (PC2), Curvature Factor (PC3)
- Scree plot + cumulative variance visualization

### 27.3 Optimal Stopping (Snell Envelope)
- Binomial tree (Cox-Ross-Rubinstein): u = e^(σ√dt), d = 1/u, p = (e^(r·dt) - d)/(u - d)
- Snell envelope: V(t) = max(g(t, S_t), E[V(t+1)|F_t])
- Exercise boundary: critical stock price at each time step
- Longstaff-Schwartz Monte Carlo:
  - Path generation via geometric Brownian motion
  - Cross-sectional regression: [1, S, S²] → continuation value
  - Exercise decision: intrinsic ≥ continuation → exercise
- Early exercise premium = American - European price
- Exercise probability distribution by time

### 27.4 Isolation Forest
- Anomaly score: s(x, n) = 2^(-E[h(x)] / c(n))
  - c(n) = 2H(n-1) - 2(n-1)/n (Euler-Mascheroni constant)
- Random isolation trees: random feature + random split
- Path length = depth + c(leaf_size) adjustment
- 7-dimensional features: return, volatility, volume Z-score, range, RSI, skewness, price deviation
- Feature importance via split frequency across all trees
- Configurable anomaly threshold (default 0.65)

### 27.5 Variational Mode Decomposition (VMD)
- ADMM-based non-recursive decomposition
- Mode update: û_k(ω) = (f̂(ω) - Σ_{i≠k} û_i + λ̂/2) / (1 + 2α(ω - ω_k)²)
- Center frequency: ω_k = ∫₀∞ ω|û_k(ω)|² dω / ∫₀∞ |û_k(ω)|² dω
- Lagrange multiplier: λ̂^{n+1} = λ̂ + τ(f̂ - Σ_k û_k)
- FFT (Cooley-Tukey radix-2) + IFFT
- Mirror extension for boundary effects
- Energy distribution per mode
- Center frequency convergence tracking
- Dominant mode + trend mode signal generation

### 27.6 New Files
- `web-ui/src/components/HiddenMarkovModel.jsx` — Baum-Welch, Viterbi, forward-backward
- `web-ui/src/components/PrincipalComponentAnalysis.jsx` — Jacobi eigendecomposition, eigenportfolios
- `web-ui/src/components/OptimalStopping.jsx` — Snell envelope, Longstaff-Schwartz MC
- `web-ui/src/components/IsolationForest.jsx` — Isolation trees, anomaly scoring
- `web-ui/src/components/VariationalModeDecomposition.jsx` — ADMM VMD, FFT/IFFT

### 27.7 Registry
- 5 new panels registered in `registry.js`
- Total: 141 component files, ~131 registered panels across 7 categories

---

## Phase 28: Advanced Mathematical Models V4 [DONE]

### 28.1 Empirical Mode Decomposition (EMD) + Hilbert-Huang Transform
- Sifting process: find extrema → cubic spline envelopes → subtract mean → repeat
  - IMF criteria: #extrema = #zero-crossings (±1), mean envelope = 0
  - Sifting criterion: SD < threshold (default 0.05)
  - Max 30 iterations per IMF, max 8 IMFs
- Cubic spline interpolation (natural boundary conditions)
- Hilbert Transform (FFT-based analytic signal)
  - z(t) = x(t) + j·H[x(t)] = a(t)·e^(jφ(t))
  - Instantaneous amplitude: a(t) = |z(t)|
  - Instantaneous frequency: ω(t) = dφ/dt (unwrapped)
- Energy distribution per IMF
- Dominant mode + trend (residue) signal generation

### 28.2 Support Vector Machine (SVM)
- Linear SVM: SGD with hinge loss
  - Objective: minimize ½||w||² + C·Σ max(0, 1 - y_i·(w·x_i + b))
  - Sub-gradient: ∂L/∂w = w/(nC) - y·x (if margin < 1)
  - Learning rate decay: η = lr/(1 + epoch·0.01)
- RBF kernel SVM: SMO (Sequential Minimal Optimization)
  - Kernel: K(x,x') = exp(-γ||x-x'||²)
  - 2-variable analytic subproblem
  - KKT condition check for convergence
- 8 features: mean return, volatility, skewness, kurtosis, last return, momentum, RSI, AC1
- Standardization (z-score normalization)
- 80/20 train/test split, confusion matrix, feature importance

### 28.3 Black-Litterman Portfolio Allocation
- Equilibrium returns: π = δ·Σ·w_mkt (reverse optimization)
- Investor views: P·E[r] = Q + ε, ε ~ N(0, Ω)
- Posterior returns: E[r] = π + τΣPᵀ(PτΣPᵀ + Ω)⁻¹(Q - Pπ)
- Posterior covariance: Σ_post = Σ + τΣ - τΣPᵀ(PτΣPᵀ + Ω)⁻¹PτΣ
- Optimal weights: w = (δ·Σ_post)⁻¹·E[r]
- Ω = diag(P·τΣ·Pᵀ) × confidence (Idzorek's method)
- Matrix operations: Jacobi eigendecomposition for inverse
- Interactive view editor (add/remove views, adjust confidence)
- Sharpe ratio per asset

### 28.4 Hawkes Process
- Conditional intensity: λ(t) = μ + Σ_{t_i<t} α·e^(-β(t-t_i))
- Recursive computation: R(i) = e^(-β·Δt)·(1 + R(i-1))
- Log-likelihood: L = Σ log λ(t_i) - μT - (α/β)·Σ(1 - e^(-β(T-t_i)))
- MLE via grid search + fine-tuning (coarse → fine)
- Branching ratio: n = α/β (stationarity: n < 1)
- Ogata's thinning simulation
- Inter-arrival distribution comparison (observed vs simulated)
- Trade clustering detection (burst analysis)
- Signal: n > 0.7 → TREND, n > 0.4 → MOMENTUM, else → MEAN_REVERT

### 28.5 Dynamic Time Warping (DTW)
- Recurrence: D[i,j] = d(x_i,y_j) + min(D[i-1,j], D[i,j-1], D[i-1,j-1])
- Sakoe-Chiba band: |i - j| ≤ r (computational efficiency)
- Warping path backtracking (boundary, monotonicity, continuity)
- 8 template patterns: double bottom, head & shoulders, ascending/descending triangle, cup & handle, V-reversal, flag, channel
- Z-score normalization for scale invariance
- Two modes: scan all patterns (current vs templates) or scan history (template vs all windows)
- Similarity score: 1/(1 + DTW distance)
- Forward projection from best historical match

### 28.6 New Files
- `web-ui/src/components/EmpiricalModeDecomposition.jsx` — EMD sifting, cubic spline, HHT
- `web-ui/src/components/SupportVectorMachine.jsx` — Linear SVM (SGD), RBF SVM (SMO)
- `web-ui/src/components/BlackLitterman.jsx` — BL allocation, view editor, matrix ops
- `web-ui/src/components/HawkesProcess.jsx` — Self-exciting process, MLE, simulation
- `web-ui/src/components/DynamicTimeWarping.jsx` — DTW, pattern matching, warping path

### 28.7 Registry
- 5 new panels registered in `registry.js`
- Total: 146 component files, ~136 registered panels across 7 categories

---

## Phase 29: Advanced Mathematical Models V5 [DONE]

### 29.1 LSTM Recurrent Neural Network
- LSTM cell: forget gate f_t = σ(W_f·[x_t, h_{t-1}] + b_f)
- Input gate i_t = σ(W_i·[x_t, h_{t-1}] + b_i), candidate g_t = tanh(W_g·[x_t, h_{t-1}] + b_g)
- Cell state: c_t = f_t ⊙ c_{t-1} + i_t ⊙ g_t
- Output gate: o_t = σ(W_o·[x_t, h_{t-1}] + b_o), h_t = o_t ⊙ tanh(c_t)
- BPTT with 5-step truncation (gradient through last 5 timesteps)
- Xavier weight initialization
- MSE loss, learning rate decay: η = lr/(1 + epoch·0.01)
- 80/20 train/test split, direction prediction accuracy

### 29.2 Kelly Criterion Portfolio Sizing
- Single-asset: f* = (p·b - q)/b (binary outcome Kelly)
- Continuous: f* = μ/σ² (mean/variance approximation)
- Multi-asset: f* = Σ⁻¹·μ (optimal growth portfolio)
- Fractional Kelly: f = fraction · f* (volatility reduction)
- Growth rate: g = fᵀμ - ½·fᵀΣf
- Optimal growth: g* = μ²/(2σ²)
- Monte Carlo simulation: 500 paths × 252 trading days
- Drawdown analysis from simulated paths
- Growth-vs-fraction curve visualization

### 29.3 Gaussian Process Regression
- Kernels: RBF k(x,x') = σ_f²·exp(-||x-x'||²/(2l²)), Matérn 5/2, Periodic
- Cholesky decomposition: K + σ_n²I = L·Lᵀ
- Posterior mean: μ(x*) = k(x*,X)·(K+σ_n²I)⁻¹·y = k(x*,X)·L⁻ᵀ·L⁻¹·y
- Posterior variance: σ²(x*) = k(x*,x*) - k(x*,X)·(K+σ_n²I)⁻¹·k(X,x*)
- Log marginal likelihood: -½yᵀ(K+σ_n²I)⁻¹y - ½log|K+σ_n²I| - (n/2)log(2π)
- Hyperparameter optimization: grid search + fine-tune (σ_f, l, σ_n)
- 2σ (95%) confidence bands
- Forward/backward substitution for triangular solves

### 29.4 Markov-Switching GARCH
- Hidden Markov chain: P(s_t=j|s_{t-1}=i) = p_ij
- Per-regime GARCH(1,1): h_t = ω_k + α_k·ε_{t-1}² + β_k·h_{t-1}
- Hamilton filter: predicted + filtered regime probabilities
- Kim's smoothing: backward pass for smoothed probabilities
- Combined volatility: Σ_k P(s_t=k)·√h_k(t)
- Expected regime duration: 1/(1-p_kk)
- 3 candidate parameter sets, MLE selection
- Transition matrix visualization

### 29.5 Empirical Dynamic Modeling (EDM)
- Takens' embedding: x(t) → [x(t), x(t-τ), ..., x(t-(E-1)τ)]
- Optimal τ: first minimum of mutual information
- Optimal E: false nearest neighbors < 5% threshold
- Simplex projection: E+1 nearest neighbors, exponential weighting w_i = exp(-d_i/d_min)
- Convergent Cross Mapping (CCM):
  - Embed Y → shadow manifold M_Y
  - Find neighbors in M_Y → estimate X from same indices
  - ρ(X_est, X_actual) increases with library size if X→Y causality
  - Sugihara's theorem: causation implies convergent cross mapping

### 29.6 New Files
- `web-ui/src/components/RecurrentNeuralNetwork.jsx` — LSTM, BPTT, sequence prediction
- `web-ui/src/components/KellyCriterion.jsx` — Multi-asset Kelly, Monte Carlo, growth curves
- `web-ui/src/components/GaussianProcessRegression.jsx` — GP posterior, Cholesky, kernels
- `web-ui/src/components/MarkovSwitchingGARCH.jsx` — Hamilton filter, Kim smoothing, regime GARCH
- `web-ui/src/components/EmpiricalDynamicModeling.jsx` — Takens, simplex, CCM

### 29.7 Registry
- 5 new panels registered in `registry.js`
- Total: 151 component files, ~141 registered panels across 7 categories

---

## Phase 30: Advanced Mathematical Models V6 [DONE]

### 30.1 Autoencoder (Deep Learning)
- Encoder: h = σ(W_e·x + b_e), Decoder: x̂ = σ(W_d·h + b_d)
- Loss: L = Σ(x_i - x̂_i)² + λ·||W||² (MSE + L2 regularization)
- Backpropagation: ∂L/∂W_d = (x-x̂)⊙σ'(x̂)·hᵀ, ∂L/∂W_e = [(x-x̂)⊙σ'(x̂)·W_d]⊙σ'(h)·xᵀ
- Xavier weight initialization
- 12 features: return, vol, range, skew, kurt, RSI, volZ, momentum, priceDev, AC1, std/mean, (price-mean)/std
- Anomaly score: ||x - x̂||² (reconstruction error)
- Threshold: μ + kσ (configurable k)
- Latent space visualization (first 2 dimensions)

### 30.2 Optimal Transport (Wasserstein Distance)
- 1-Wasserstein (EMD): W₁ = Σ|F_P(x) - F_Q(x)|dx (via sorted samples)
- 2-Wasserstein: W₂² = ∫₀¹(F_P⁻¹(u) - F_Q⁻¹(u))²du (quantile matching)
- Sinkhorn algorithm: K = exp(-C/ε), u←p/(K·v), v←q/(Kᵀ·u)
- Gaussian W₂: √((μ_P-μ_Q)² + (σ_P-σ_Q)²)
- Kolmogorov-Smirnov statistic (empirical CDF comparison)
- Rolling W₁ for regime shift detection (z-score based)
- Distribution histogram comparison (recent vs historical)

### 30.3 Rough Volatility (rBergomi Model)
- Fractional Brownian motion: W^H(t) via Cholesky decomposition
- Covariance: C(i,j) = ½(|i-j+1|^{2H} + |i-j-1|^{2H} - 2|i-j|^{2H})
- Volatility: v(t) = ξ₀·exp(η·W^H(t) - ½η²·t^{2H})
- Price: dS = S·√v·dW (correlated Brownian motions, ρ)
- Hurst estimation: linear regression on log(RV) vs log(scale)
- Implied vol skew: ψ(τ) ~ τ^{H-1/2}
- Rough (H < ½, anti-persistent) vs Smooth (H > ½, persistent)
- Monte Carlo: 50 paths, P5/P95 percentiles

### 30.4 Transfer Entropy (Information-Theoretic Causality)
- TE_{X→Y} = Σ p(y_{t+1}, y_t^k, x_t^l)·log₂[p(y_{t+1}|y_t^k, x_t^l) / p(y_{t+1}|y_t^k)]
- = H(Y_{t+1}|Y_t^k) - H(Y_{t+1}|Y_t^k, X_t^l)
- k/l history orders (configurable), n-bin quantization
- Surrogate TE: shuffle X to destroy causality, average over 5 shuffles
- Effective TE: ETE = TE - TE_surrogate
- Bidirectional: TE_{X→Y} and TE_{Y→X}, net TE = TE_{X→Y} - TE_{Y→X}
- Non-linear causality (vs linear Granger causality)

### 30.5 Graph Theory Network
- Correlation distance: d_{ij} = √(2(1 - ρ_{ij}))
- Kruskal's MST: sort edges by weight, union-find, select n-1 edges
- Eigenvector centrality: power iteration on adjacency matrix
- Betweenness centrality: BFS shortest path counting
- Clustering coefficient: C_i = 2e_i / (k_i(k_i-1))
- Degree centrality: C_D(i) = deg(i) / (n-1)
- Hub detection: node with highest degree
- Circular layout visualization with color-coded correlations
- Correlation matrix heatmap

### 30.6 New Files
- `web-ui/src/components/Autoencoder.jsx` — AE, backprop, anomaly detection
- `web-ui/src/components/OptimalTransport.jsx` — W₁/W₂, Sinkhorn, regime shift
- `web-ui/src/components/RoughVolatility.jsx` — fBm, rBergomi, Hurst estimation
- `web-ui/src/components/TransferEntropy.jsx` — TE, surrogate, ETE, causality
- `web-ui/src/components/GraphTheoryNetwork.jsx` — MST, centrality, heatmap

### 30.7 Registry
- 5 new panels registered in `registry.js`
- Total: 156 component files, ~146 registered panels across 7 categories

---

## Phase 31: Advanced Mathematical Models V7 [DONE]

### 31.1 Conditional Value at Risk (CVaR)
- Historical VaR: α-quantile of loss distribution
- Historical CVaR: E[L | L ≥ VaR_α]
- Cornish-Fisher VaR: z_CF = z + (1/6)(z²-1)S + (1/24)(z³-3z)K - (1/36)(2z³-5z)S²
- Entropic VaR: EVaR = inf_{z>0} (1/z)·log(E[exp(z·L)]/(1-α))
- Rockafellar-Uryasev: min ζ + (1/(1-α))·Σ max(0, -r·w - ζ)/T
- Gradient descent optimization, long-only constraint
- CVaR/VaR tail ratio (fat tail indicator)

### 31.2 Non-Stationary Spectral Analysis
- STFT: X(t,f) = ∫ x(τ)·w(τ-t)·e^(-2πifτ) dτ (Hann window)
- Spectrogram: |X(t,f)|² (time-frequency heatmap)
- CWT: W(t,s) = (1/√s)·∫ x(τ)·ψ*((τ-t)/s) dτ (Morlet wavelet)
- Morlet: ψ(t) = e^(iω₀t)·e^(-t²/2), ω₀ = 6
- Scale → frequency: f = ω₀/(2π·s)
- Dominant frequency tracking over time
- Spectral entropy: H = -Σ p·log₂(p)
- Heisenberg uncertainty: Δt·Δf ≥ 1/(4π)

### 31.3 Random Matrix Theory
- Marchenko-Pastur law: ρ(λ) = (Q/2π)·√((λ₊-λ)(λ-λ₋))/λ
- Q = T/N, λ± = (1/√Q ± 1)²
- Jacobi eigendecomposition of correlation matrix
- Noise eigenvalues: λ ∈ [λ₋, λ₊]
- Signal eigenvalues: λ > λ₊ (genuine correlations)
- Cleaning: replace noise eigenvalues with average, renormalize
- Market mode: largest eigenvector (common factor)

### 31.4 Bayesian Structural Time Series
- State-space: x_t = T·x_{t-1} + R·η_t, y_t = Z·x_t + ε_t
- Local linear trend: μ_t = μ_{t-1} + δ_{t-1} + η^μ, δ_t = δ_{t-1} + η^δ
- Seasonal: dummy seasonal with period p
- Kalman filter: prediction → update cycle
- K_t = P_{t|t-1}·Zᵀ / (Z·P_{t|t-1}·Zᵀ + H)
- Log-likelihood optimization (grid search)
- 10-step ahead forecast
- Trend/seasonal/residual decomposition

### 31.5 Topological Data Analysis
- Takens embedding: returns → point cloud in R^E
- Vietoris-Rips complex: VR_ε = {σ : diam(σ) ≤ ε}
- Filtration: increasing ε → nested simplicial complexes
- H₀ persistence: connected components (Union-Find)
- H₁ persistence: loops (cycle detection via BFS)
- Persistence diagram: (birth, death) scatter
- Persistence barcode: horizontal bars
- Betti numbers at various ε thresholds
- Topological complexity: simple/moderate/complex/cyclic

### 31.6 New Files
- `web-ui/src/components/ConditionalValueAtRisk.jsx` — VaR, CVaR, EVaR, R-U optimization
- `web-ui/src/components/NonStationarySpectral.jsx` — STFT, CWT, spectrogram, scalogram
- `web-ui/src/components/RandomMatrixTheory.jsx` — MP law, eigenvalue filtering, cleaning
- `web-ui/src/components/BayesianStructuralTimeSeries.jsx` — state-space, Kalman, decomposition
- `web-ui/src/components/TopologicalDataAnalysis.jsx` — persistence homology, Betti, diagrams

### 31.7 Registry
- 5 new panels registered in `registry.js`
- Total: 161 component files, ~151 registered panels across 7 categories

---

## Phase 32: Advanced Mathematical Models V8 [DONE]

### 32.1 Stochastic Differential Equations
- Euler-Maruyama: X_{n+1} = X_n + μ·Δt + σ·√Δt·Z_n
- Milstein (strong order 1.0): + ½·σ·σ'·(Z_n² - 1)·Δt
- GBM: dS = μS dt + σS dW
- Ornstein-Uhlenbeck: dX = θ(μ - X) dt + σ dW (mean-reverting)
- CIR: dX = κ(θ - X) dt + σ√X dW (positive, Milstein scheme)
- Heston: dS = μS dt + √v S dW₁, dv = κ(θ-v) dt + ξ√v dW₂ (ρ correlation)
- Merton Jump-Diffusion: dS = μS dt + σS dW + S·J·dN (Poisson jumps)
- Parameter estimation: μ, σ from returns; OU: φ from AR(1)
- Percentile bands: P5, P25, P50, P75, P95

### 32.2 Gaussian Mixture Model (EM)
- GMM: p(x) = Σ_k π_k · N(x | μ_k, σ_k²)
- EM: E-step γ(z_k) = π_k·N/Σ_j, M-step: μ_k, σ_k², π_k updates
- K-means initialization
- BIC = -2L + k·log(N), AIC = -2L + 2k (model selection)
- Regime labels: Bull-Calm, Bull-Volatile, Bear-Calm, Bear-Volatile, Sideways
- Component density visualization + histogram overlay

### 32.3 Wavelet Packet Decomposition
- Full binary tree: W(j, 2k) = low-pass, W(j, 2k+1) = high-pass
- Daubechies-4: h = [0.483, 0.837, 0.224, -0.129]
- Best basis: Coifman-Wickerhauser (Shannon entropy minimization)
- Thresholding: soft/hard (VisuShrink: σ·√(2·log(N)), MAD estimator)
- Energy heatmap across all nodes and levels
- Detail vs approximation energy distribution

### 32.4 Information Bottleneck
- Objective: L = I(X;T) - β·I(T;Y)
- Blahut-Arimoto: p(t|x) = p(t)·exp(-β·D_KL[p(y|x)||p(y|t)])/Z
- Self-consistent: p(y|t) = Σ p(y|x)·p(x|t), p(t) = Σ p(x)·p(t|x)
- Rate-distortion curve: I(X;T) vs I(T;Y) for varying β
- Optimal signal compression: nBins → nClusters
- Cluster-based future return prediction

### 32.5 Affine Arithmetic
- Affine form: â = a₀ + Σ a_i·ε_i, ε_i ∈ [-1, 1]
- Operations: add, mul (with new noise symbol for quadratic terms)
- exp(â): Chebyshev min-max linear approximation
- Correlation tracking (avoids interval arithmetic dependency problem)
- Robust Black-Scholes: uncertain σ → option price bounds
- Uncertainty propagation chain: price × quantity × return

### 32.6 New Files
- `web-ui/src/components/StochasticDifferentialEquations.jsx` — SDE simulation, 5 models
- `web-ui/src/components/GaussianMixtureModel.jsx` — GMM, EM, BIC/AIC, regime clustering
- `web-ui/src/components/WaveletPacketDecomposition.jsx` — WPD, best basis, denoising
- `web-ui/src/components/InformationBottleneck.jsx` — IB, Blahut-Arimoto, rate-distortion
- `web-ui/src/components/AffineArithmetic.jsx` — AA, robust pricing, uncertainty propagation

### 32.7 Registry
- 5 new panels registered in `registry.js`
- Total: 166 component files, ~156 registered panels across 7 categories

---

## Phase 33: Advanced Mathematical Models V9 [DONE]

### 33.1 Renormalization Group (Multi-Scale)
- Coarse-graining: aggregate n consecutive returns → super-tick
- Scaling hypothesis: σ(λ) = λ^κ · σ(1)
- Vol scaling exponent κ: <0.5 sub-diffusive, >0.5 super-diffusive, ≈0.5 diffusive
- RG flow: g(n) = σ_n/√n (normalized coupling)
- Fixed points: β(g*) = 0 → scale-invariant behavior
- Correlation length: ξ = lag where |ACF| < 0.1
- Phase transition: large Δκurt at scale n
- Log-log regression for scaling exponent

### 33.2 Free Energy Principle (Active Inference)
- Variational free energy: F = KL[q(x)||p(x|o)] - log p(o)
- F = ½Σ(μ-o)²/σ² + ½Σlog(σ²) (Gaussian form)
- Perception: minimize F via gradient descent on μ
- Action selection: minimize G(π) = risk (KL) + ambiguity (entropy)
- Precision: 1/σ² weights prediction errors
- Policies: HOLD, BUY, SELL with expected free energy

### 33.3 Tensor Decomposition (CP/ALS)
- CP: T ≈ Σ_r λ_r · a_r ∘ b_r ∘ c_r (rank-R approximation)
- ALS: fix 2 factors, solve least squares for 3rd, iterate
- Tensor: assets × time × features (multi-way financial data)
- Factor matrices: A (asset loadings), B (time dynamics), C (feature loadings)
- Reconstruction quality: 1 - ||T - T̂||² / ||T||²
- Dominant factor per asset for clustering

### 33.4 Compressed Sensing (Sparse Recovery)
- Measurement: y = Φx, m < n (undersampled)
- OMP: greedy support selection + least squares on support
- ISTA: gradient step + soft thresholding (L1 minimization)
- DFT sparsifying basis: signal → sparse coefficients
- SNR: 10·log₁₀(signal_power / noise_power)
- Anomaly detection: large sparse coefficients = frequency anomalies
- RIP: m ≥ C·k·log(n/k) for guaranteed recovery

### 33.5 Malliavin Calculus (Greeks)
- Integration by parts: E[φ(F)·G] = E[φ'(F)·H]
- Delta weight: π^Δ = W_T/(S₀σT) · 1_{S_T>K}
- Vega weight: π^ν = (W_T²-T)/(2σT) - W_T/σ
- Gamma weight: second-order Malliavin derivative
- Advantage: unbiased pathwise sensitivities (no finite difference bumping)
- Convergence: MC estimate vs analytical Black-Scholes
- Standard error: √(Var[π]/n)

### 33.6 New Files
- `web-ui/src/components/RenormalizationGroup.jsx` — multi-scale RG, scaling exponents, fixed points
- `web-ui/src/components/FreeEnergyPrinciple.jsx` — variational FEP, active inference, policy selection
- `web-ui/src/components/TensorDecomposition.jsx` — CP/ALS, multi-way factor analysis
- `web-ui/src/components/CompressedSensing.jsx` — OMP/ISTA, sparse recovery, anomaly detection
- `web-ui/src/components/MalliavinCalculus.jsx` — Malliavin Greeks, MC sensitivity estimation

### 33.7 Registry
- 5 new panels registered in `registry.js`
- Total: 171 component files, ~161 registered panels across 7 categories

---

## Phase 34: Advanced Mathematical Models V10 [DONE]

### 34.1 Hamiltonian Monte Carlo (HMC)
- Hamiltonian: H(q,p) = U(q) + K(p), U = -log p(q|D)
- Leapfrog: p_{½} = p - (ε/2)∇U, q' = q + εM⁻¹p_{½}, p' = p_{½} - (ε/2)∇U
- Metropolis: α = min(1, exp(H(q,p) - H(q',p')))
- Bayesian GARCH(1,1): posterior for [ω, α, β]
- Trace plots, posterior CIs (95%), persistence α+β
- Acceptance rate targeting ~60-80%

### 34.2 Reproducing Kernel Hilbert Space (RKHS)
- Kernels: RBF k(x,y)=exp(-||x-y||²/2σ²), Laplacian k(x,y)=exp(-||x-y||/σ)
- Kernel PCA: eigendecomposition of centered kernel matrix K_c = HKH
- MMD: ||μ_P - μ_Q||_H (distribution comparison, regime shift)
- Kernel Ridge Regression: f(x) = Σα_i·k(x_i,x), α = (K+λI)⁻¹y
- Non-linear feature space without explicit mapping

### 34.3 Variational Autoencoder (VAE)
- Encoder: q_φ(z|x) → N(μ_φ, σ²_φ)
- Decoder: p_θ(x|z) → N(μ_θ, σ²_θ)
- ELBO: E[log p(x|z)] - β·KL[q(z|x)||N(0,I)]
- Reparameterization: z = μ + σ·ε (enables backprop)
- β-VAE: disentanglement via KL weighting
- Anomaly detection: reconstruction error > μ + 2σ
- Synthetic return generation from latent space

### 34.4 Schrödinger Bridge (Entropy-Regularized OT)
- π* = argmin KL(π||π₀) s.t. marginals = p₀, p₁
- Sinkhorn: u = p/(Kv), v = q/(Kᵀu), K = exp(-C/ε)
- Transport plan heatmap, barycentric mapping
- Wasserstein W₂ = √(Σ π_ij·C_ij)
- Sliding window: distribution evolution over time
- ε controls sharpness (low ε → deterministic OT)

### 34.5 Lie Group Symmetries
- Symmetries: translation T_a, scaling D_λ, time τ_s, Galilean
- Noether's theorem: symmetry → conserved quantity
- Translation → momentum (mean), scaling → normalized variance
- Time → autocorrelation, Galilean → detrended variance
- Symmetry breaking: variance of conserved quantities across windows
- Lie algebra generators: e₁=mean, e₂=std, e₃=mean/std
- Regime change detection via symmetry breaking

### 34.6 New Files
- `web-ui/src/components/HamiltonianMonteCarlo.jsx` — HMC, leapfrog, Bayesian GARCH
- `web-ui/src/components/ReproducingKernelHilbertSpace.jsx` — KPCA, MMD, KRR
- `web-ui/src/components/VariationalAutoencoder.jsx` — VAE, ELBO, anomaly detection
- `web-ui/src/components/SchrodingerBridge.jsx` — Sinkhorn, entropy-regularized OT
- `web-ui/src/components/LieGroupSymmetries.jsx` — Noether, symmetry breaking, Lie algebra

### 34.7 Registry
- 5 new panels registered in `registry.js`
- Total: 176 component files, ~166 registered panels across 7 categories

---

## Phase 35: Advanced Mathematical Models V11 [DONE]

### 35.1 Kolmogorov-Sinai Entropy (Chaos)
- Symbolic dynamics: n-symbol partition of returns
- Block entropy: H_n = -Σ p(s_0...s_{n-1})·log₂ p
- KS entropy: h_KS = lim(H_n - H_{n-1}) (entropy production rate)
- Permutation entropy: ordinal pattern analysis
- Sample entropy: complexity measure (m=2, r=0.2σ)
- Largest Lyapunov exponent: Rosenstein's nearest-neighbor method
- Predictability horizon: 1/h_KS
- Classification: chaotic (λ₁>0), periodic (h_KS≈0), stochastic

### 35.2 Persistent Homology Landscape
- Persistence diagram → landscape: λ_k(t) = max(min(t-b, d-t), 0)
- Piecewise linear, vectorized representation
- Lp norm: ||λ||_p = (Σ_k ∫|λ_k|^p dt)^(1/p)
- H₀ persistence via Union-Find algorithm
- Sliding window L2 norm: topological change detection
- Takens embedding for point cloud construction
- Topological shift: L2 > μ + 2σ

### 35.3 Fokker-Planck Equation (Density Evolution)
- PDE: ∂p/∂t = -∂/∂x[μ·p] + (1/2)·∂²/∂x²[σ²·p]
- Finite difference explicit scheme (nSteps, Δt)
- OU model: dX = κ(θ-X)dt + σdW
- GBM model: dX = μXdt + σXdW
- Stationary distribution: N(θ, σ²/(2κ))
- Density evolution heatmap (time × space)
- VaR from forecast CDF, KL divergence p_T vs p_0

### 35.4 Hopf Bifurcation Analysis
- Normal form: ż = (μ + iω)z - β|z|²z
- AR(2) fit: x_t = a₁x_{t-1} + a₂x_{t-2} + ε
- Eigenvalues: λ² - a₁λ - a₂ = 0
- Bifurcation parameter: μ = |λ|_max - 1
- Complex plane eigenvalue trajectory with unit circle
- Regime classification: stable (μ<0), bifurcation (μ≈0), limit cycle (μ>0)
- Oscillation frequency: ω = arg(λ), amplitude: A ∝ √μ

### 35.5 Cramér-Rao Lower Bound
- CRLB: Var(θ̂) ≥ 1/I(θ)
- Fisher information: I(θ) = -E[∂²/∂θ² log L]
- Gaussian: I(μ) = n/σ², I(σ²) = n/(2σ⁴)
- GARCH(1,1) Fisher matrix: numerical Hessian (3×3)
- CRLB = I(θ)⁻¹ diagonal (minimum variance bounds)
- Estimator efficiency: eff = CRLB/Var(θ̂)
- Confidence intervals: θ̂ ± 1.96·√CRLB
- Sample size planning: CRLB ∝ 1/n

### 35.6 New Files
- `web-ui/src/components/KolmogorovSinaiEntropy.jsx` — KS entropy, Lyapunov, chaos detection
- `web-ui/src/components/PersistentHomologyLandscape.jsx` — landscape, L2 norm, topological change
- `web-ui/src/components/FokkerPlanckEquation.jsx` — PDE solver, density evolution, VaR
- `web-ui/src/components/HopfBifurcation.jsx` — AR(2) eigenvalues, cycle detection, regime
- `web-ui/src/components/CramerRaoBound.jsx` — Fisher info, CRLB, efficiency, CI

### 35.7 Registry
- 5 new panels registered in `registry.js`
- Total: 181 component files, ~171 registered panels across 7 categories

---

## Phase 36: Advanced Mathematical Models V12 [DONE]

### 36.1 Wasserstein Barycenters (OT Fréchet Mean)
- Barycenter: μ* = argmin Σ λ_i·W₂²(μ, μ_i)
- 1D solution: Q*(u) = Σ λ_i·Q_i(u) (quantile averaging)
- W₂ distance: ∫₀¹(Q_μ(u) - Q_ν(u))² du
- Fréchet variance: Σ λ_i·W₂²(μ*, μ_i)
- Multi-window distribution consensus
- Multi-asset cross-asset barycenter
- Tail structure preservation vs Euclidean mean

### 36.2 Koopman Operator Theory (EDMD)
- Koopman operator: K:g(x_t) → g(x_{t+1}) (linear in feature space)
- EDMD: K ≈ A·G⁻¹ (Extended Dynamic Mode Decomposition)
- Dictionary: Ψ(x) = [1, x, x², sin(ωx), cos(ωx), ...]
- Eigenvalues via power iteration + deflation
- |λ| ≤ 1: stable, |λ| ≈ 1: persistent, |λ| < 0.5: fast decay
- k-step forecast: Ψ(x_{t+k}) ≈ K^k·Ψ(x_t)
- Reconstruction MSE for model quality

### 36.3 Stochastic Optimal Control (HJB)
- HJB: -V_t + ρV = max_u[L + μ·V_x + (1/2)σ²·V_xx]
- State: dX = u·(μdt + σdW)
- Terminal utility: G(x) = log(x)
- Running cost: L = u·μ·x - (γ/2)·u²·σ²·x²
- Optimal policy: u* = μ·x·(1+V_x) / (σ²x²(γ-V_xx))
- Backward Euler finite differences
- Value function V(x,t) and policy u*(x) visualization

### 36.4 Rényi Entropy Dynamics
- H_α = (1/(1-α))·log₂ Σ p_i^α
- α→0: Hartley, α=1: Shannon, α=2: collision, α→∞: min-entropy
- Tsallis entropy: S_q = (1-Σp_i^q)/(q-1)
- Generalized dimensions D_α (multifractal spectrum)
- D_0 = box-counting, D_1 = information, D_2 = correlation
- Concentration ratio H_∞/H_0 (tail risk indicator)
- Sliding window tracking of all entropy orders

### 36.5 Pontryagin Maximum Principle
- Hamiltonian: H = ½κu² + λu²x + ηx² + p·u (Almgren-Chriss)
- Optimal control: u* = -p/(κ + 2λx)
- State: x' = u (inventory), Costate: p' = -λu² - 2ηx
- Boundary: x(0) = X₀, x(T) = 0, p(T) = 0
- Shooting method: bisection on p(0)
- TWAP comparison, immediate execution cost
- Cost savings %, shadow price p(t) trajectory

### 36.6 New Files
- `web-ui/src/components/WassersteinBarycenters.jsx` — OT barycenter, quantile averaging, multi-asset
- `web-ui/src/components/KoopmanOperatorTheory.jsx` — EDMD, eigenvalues, forecasting
- `web-ui/src/components/StochasticOptimalControl.jsx` — HJB solver, optimal policy, value function
- `web-ui/src/components/RenyiEntropyDynamics.jsx` — Rényi spectrum, Tsallis, fractal dimensions
- `web-ui/src/components/PontryaginMaximumPrinciple.jsx` — optimal execution, shooting method, TWAP

### 36.7 Registry
- 5 new panels registered in `registry.js` (3 risk, 2 portfolio)
- Total: 186 component files, ~176 registered panels across 7 categories

---

## Phase 37: Advanced Mathematical Models V13 [DONE]

### 37.1 Burgers Equation (Shock Formation)
- Viscous Burgers PDE: du/dt + u*du/dx = v*d^2u/dx^2
- Hopf-Cole transform: u = -2v*d/dx log(phi) -> heat equation
- Finite difference scheme (advection + diffusion)
- Shock detection: large negative gradient points
- Spacetime diagram (time x space heatmap)
- Energy dissipation: E = (1/2)*integral(u^2)dx, dE/dt <= 0
- Inviscid limit: v=0 -> characteristics cross -> shock formation

### 37.2 Sobolev Space Regularization
- Sobolev space W^{k,p}: k weak derivatives in Lp
- Tikhonov: min ||y-f||^2 + lambda*||f||^2_{H^s}
- Matern kernel: s=1 (3/2), s=2 (5/2) - representer theorem
- L-curve: log(residual) vs log(smoothness), corner = optimal lambda
- H1 seminorm: |f|_{H1} = integral|f'|^2 dx (smoothness penalty)
- Bias-variance trade-off visualization
- Noise removal from rolling volatility estimates

### 37.3 Ito Calculus Generator
- Infinitesimal generator: A*f = mu*f'(x) + (1/2)*sigma^2(x)*f''(x)
- Dynkin's formula: E[f(X_t)] = f(x) + E[integral A*f ds]
- Expected hitting time: A*T = -1, T(target) = 0
- Stationary distribution: A*pi = 0 (invariant measure)
- Feynman-Kac connection: du/dt = A*u - r*u
- Models: OU, GBM, constant drift-diffusion
- Test functions: identity, square, exp, log, cosh

### 37.4 Banach Fixed-Point Iteration
- Contraction mapping: q < 1 implies unique fixed point
- Best-response operator: T_i(x) = argmax J_i(u_i, x_{-i})
- Nash equilibrium: x* = T(x*) (fixed point of best response)
- Contraction constant: spectral radius of Jacobian
- Geometric convergence: ||e_n|| <= q^n/(1-q) * ||e_0||
- Phase space trajectory (momentum vs mean-reversion game)
- Error decay: log(||error||) vs iteration (linear = geometric)

### 37.5 Cesaro Summability & Fejer Kernel
- Cesaro mean: sigma_N = (1/(N+1)) * sum S_n (averaged partial sums)
- Fejer kernel: F_N = (1/(N+1)) * (sin((N+1)x/2)/sin(x/2))^2 >= 0
- No Gibbs phenomenon (unlike partial Fourier sums)
- Fejer's theorem: sigma_N -> f uniformly
- Triangular weights: (1 - k/(N+1)) reduces high-frequency noise
- Cycle detection via dominant Fourier coefficient
- Detrended residual for cycle analysis

### 37.6 New Files
- `web-ui/src/components/BurgersEquation.jsx` — nonlinear PDE, shock formation, spacetime diagram
- `web-ui/src/components/SobolevSpaceRegularization.jsx` — Tikhonov, Matern kernel, L-curve
- `web-ui/src/components/ItoCalculusGenerator.jsx` — infinitesimal generator, Dynkin, hitting time
- `web-ui/src/components/BanachFixedPoint.jsx` — contraction mapping, Nash equilibrium, convergence
- `web-ui/src/components/CesaroFejerKernel.jsx` — Cesaro mean, Fejer kernel, trend extraction

### 37.7 Registry
- 5 new panels registered in `registry.js` (3 risk, 1 strategy, 1 technical)
- Total: 191 component files, ~181 registered panels across 7 categories

---

## Phase 38: Advanced Mathematical Models V14 [DONE]

### 38.1 Girsanov Theorem (Measure Change)
- Radon-Nikodym derivative: dQ/dP = exp(-int theta dW - 1/2 int theta^2 dt)
- Market price of risk: theta = (mu_P - mu_Q) / sigma
- Sliding window drift estimation with LLR test
- Log-likelihood ratio ~ chi^2(1) under H0 (no drift change)
- Cumulative measure change trajectory
- Regime classification: bullish/bearish/neutral

### 38.2 Stone-Cech Compactification
- Universal embedding: e:X -> [0,1]^C(X,R) (maximal compactification)
- Sigmoid feature maps for bounded continuous functions
- K-means limit point detection in compactified regime space
- Boundary proximity = regime transition signal
- Cluster occupation probabilities (regime distribution)

### 38.3 Malliavin-Stein Sensitivity
- Integration by parts on Wiener space: E[phi(F) * D_tF/||DF||^2] = E[phi'(F)]
- Delta weight = Z / (S0 * sigma * sqrt(T)) (no finite-difference bias)
- Gamma weight = (Z^2-1) / (S0^2 * sigma^2 * T)
- Variance efficiency comparison vs finite difference
- Black-Scholes analytical validation, strike sweep

### 38.4 Prokhorov Metric (Weak Convergence)
- d_P(mu, nu) = inf{eps : mu(A) <= nu(A^eps) + eps}
- Metrizes weak convergence: mu_n -> mu iff d_P -> 0
- Prokhorov tube visualization (CDF +- eps)
- Comparison with Wasserstein-1 and Kolmogorov-Smirnov
- Distribution shift detection and trend monitoring

### 38.5 Radon-Nikodym Derivative
- dQ/dP = exp(sum log(f_Q(x)/f_P(x))) (Gaussian likelihood ratio)
- KL divergence: D_KL(P||Q) = E_P[log(dP/dQ)]
- LR test: -2*log(L) ~ chi^2(k) under H0 (Neyman-Pearson)
- Cumulative log-RN trajectory for regime tracking
- Per-point RN derivative density visualization

### 38.6 New Files
- `web-ui/src/components/GirsanovTheorem.jsx` — measure change, drift detection, LLR test
- `web-ui/src/components/StoneCechCompactification.jsx` — universal embedding, regime limit points
- `web-ui/src/components/MalliavinSteinSensitivity.jsx` — IBP Greeks, variance efficiency
- `web-ui/src/components/ProkhorovMetric.jsx` — weak convergence, distribution shift detection
- `web-ui/src/components/RadonNikodymDerivative.jsx` — likelihood ratio, KL divergence, regime change

### 38.7 Registry
- 5 new panels registered in `registry.js` (5 risk)
- Total: 196 component files, ~186 registered panels across 7 categories

---

## Phase 39: Advanced Mathematical Models V15 [DONE]

### 39.1 Hahn Decomposition (Signal/Noise)
- Signed measure split: X = P union N, mu(P) >= 0, mu(N) <= 0
- Jordan decomposition: mu = mu+ - mu-, |mu| = mu+ + mu-
- Histogram bins colored by signed measure (green=signal, red=noise)
- SNR = mu+ / mu- (signal-to-noise ratio)
- Rolling Hahn decomposition over time

### 39.2 Cameron-Martin Formula
- Gaussian shift theorem: d(mu_h)/d(mu) = exp(<h,x> - 1/2||h||^2)
- Inner product: <h,x> = sum h_t * x_t / sigma^2
- Shift modes: constant, linear, sinusoidal, mixed
- Cumulative log-RN trajectory for drift alignment detection
- Cameron-Martin space: H_mu = {h : mu_h << mu}

### 39.3 Arzela-Ascoli Theorem
- Relative compactness: bounded + equicontinuous
- Modulus of continuity: omega_f(delta) = sup|f(x)-f(y)| for |x-y|<delta
- Family modulus: omega_F(delta) = sup_f omega_f(delta)
- Equicontinuity check: omega -> 0 as delta -> 0
- Overfitting detection via non-equicontinuous indicator outliers

### 39.4 Riesz Representation
- L(f) = <f, u> for unique u in H, ||L|| = ||u||
- Representer: u = (K + lambda*I)^{-1} * L (regularized)
- Feature importance via |u_i| (Riesz weights)
- Momentum (u > 0) vs reversal (u < 0) classification
- Correlation with actual returns, dominant lag detection

### 39.5 Lax-Milgram Theorem
- a(u,v) = L(v) has unique solution iff a is bounded + coercive
- Bounded: |a(u,v)| <= C ||u|| ||v||
- Coercive: a(u,u) >= alpha ||u||^2 (alpha > 0)
- FEM with linear hat functions, tridiagonal system (Thomas algorithm)
- Bilinear form: a(u,v) = eps*int(u'v') + b*int(u'v) + c*int(uv)
- Epsilon sweep showing regularization effect

### 39.6 New Files
- `web-ui/src/components/HahnDecomposition.jsx` — signed measure, Jordan decomposition, SNR
- `web-ui/src/components/CameronMartinFormula.jsx` — Gaussian shift, drift alignment, RN derivative
- `web-ui/src/components/ArzelaAscoli.jsx` — equicontinuity, modulus of continuity, overfitting detection
- `web-ui/src/components/RieszRepresentation.jsx` — linear functional, representer theorem, feature importance
- `web-ui/src/components/LaxMilgram.jsx` — variational PDE, FEM, coercivity/boundedness

### 39.7 Registry
- 5 new panels registered in `registry.js` (5 risk)
- Total: 201 component files, ~191 registered panels across 7 categories

---

## Phase 40: Future Enhancements [PLANNED]

### 25.1 Additional Features
- [ ] Real-time strategy parameter tuning
- [ ] Multi-asset portfolio optimization
- [ ] Machine learning signal enhancement
- [ ] Order book depth replay from real L2 data
- [ ] Release v1.0.0 with git tag

---

## Technical Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Price model | GBM | Standard financial model, configurable volatility |
| Communication | WebSocket (JSON) | Simple, language-agnostic, real-time |
| Database | SQLite (WAL) | Zero-config, concurrent reads, sufficient for paper trading |
| C++ standard | C++20 | Modern features, good library support |
| Python version | 3.12+ | Current stable, match-style syntax |
| Visualizer | Pure Python (ANSI) | No external GUI deps, works in any terminal |
| Web UI | React + lightweight-charts | TradingView-style charts, Binance-inspired dark theme |
| Config format | YAML | Human-readable, supports comments |
| Container | Docker | Reproducible deployment |
| Linting | ruff | Fast, modern Python linter with isort + bugbear |
| CI/CD | GitHub Actions | 4 jobs: Python, C++, Web UI, Docker |
