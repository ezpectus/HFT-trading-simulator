# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added — Post-v1.0.0 (Phases 2–13)

#### Exchange Simulator Backend
- Per-exchange funding rate charging (every 8h equivalent)
- Partial fill simulation (large orders split across order book levels)
- Order rejection reasons (insufficient margin, max position size, no price data)
- Market impact model (large orders move price)
- Holiday/weekend mode (reduced volatility, auto-detect)
- News event simulation (sudden volatility spikes with directional bias)
- Liquidation engine (auto-close when margin < maintenance)
- Config hot-reload (change volatility/fees without restart)
- Simulation speed control (Pause/1x/2x/5x via WebSocket command)
- Per-exchange volatility multiplier (binance baseline, bybit +5%, okx -5%)
- WebSocket message compression (per-message deflate)
- Reconnection with state sync (resume from last candle)

#### Web UI — Core Trading
- Multi-timeframe chart toggle (5m/15m/1h/4h, frontend aggregation)
- Alternative chart modes: Heikin-Ashi, Renko, Point & Figure, Kagi, Three-Line Break, Tick, Volume Clock
- Trade execution markers on candle chart (green ↑B / red ↓S arrows, toggleable)
- Quick-trade buttons in OrderForm (25%/50%/75%/100% of balance)
- Per-exchange fee + slippage breakdown in OrderForm
- Liquidation price, leverage badge, margin, SL/TP progress bar in PositionsPanel
- Trade history with SL/TP reason (STOP_LOSS / TAKE_PROFIT / MANUAL)
- Trade history CSV export
- Trade history summary stats (total, win rate, PnL, W/L, best/worst trade)
- Price change % indicator in header (green/red with arrow)
- Market regime badge on chart header (TRENDING/RANGING/VOLATILE)
- Ticker tape in header (all 9 prices, clickable)
- Price comparison panel (cross-exchange prices with spread + arb badge)
- Simulation speed control buttons (Pause/1x/2x/5x, spacebar toggle)
- Smart order router (best price across exchanges)

#### Web UI — Order Flow Panels
- Cumulative Volume Delta (CVD) indicator
- Real-time order flow tape (print stream)
- Depth chart (cumulative depth visualization)
- Order book heatmap (color intensity by volume)
- Order book depth imbalance bar, per-level qty bars, spread $ display
- Spoofing detector (order book spoofing detection)
- Dark order flow detection (large hidden orders via volume analysis)
- Order flow imbalance indicator (bid/ask volume ratio)
- Liquidity heatmap (pool levels over time)

#### Web UI — Technical Analysis Panels
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

#### Web UI — Risk & Analytics Panels
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

#### Web UI — Portfolio Panels
- Portfolio optimizer (Markowitz efficient frontier)
- Auto-rebalance portfolio to target weights
- Multi-account aggregated view
- Session stats card (PnL since session start, best/worst trade, win rate)
- Time-of-day performance analysis
- Trade clustering detection (overtrading warning)
- PerformanceDashboard: win/loss streak tracking, Sharpe + Sortino ratios
- AccountPanel: exchange PnL leaderboard with medal colors
- AccountPanel: mini PnL bars (recent 10 trades)
- SignalFeed: confidence distribution histogram (5 buckets)

#### Web UI — Strategy Panels
- Strategy builder (visual rule-based strategy creator, if-then conditions)
- TWAP/VWAP execution bot strategy (sliced order execution with progress)
- Walk-forward analysis for backtest validation
- Alert webhook (send notifications to Discord/Telegram)
- Custom watchlist with price tracking
- Signal performance tracking (match signals to subsequent fills, hit rate)
- Trade journal with tags and filtering (localStorage persistence)
- Custom indicator builder (SMA, EMA, RSI, Bollinger with custom params)

#### Web UI — Export Panels
- Session export (full session data as JSON)
- Trade statistics export to CSV with custom fields
- Export performance report as PDF (print-to-PDF with styled report)

#### Web UI — Additional Indicators
- On-balance volume (OBV)
- Money flow index (MFI)
- Williams %R
- Ichimoku cloud visualization
- Stochastic oscillator
- Average True Range (ATR) indicator panel
- Parabolic SAR
- ADX/DI indicator (trend strength)
- Commodity Channel Index (CCI)
- Awesome Oscillator
- Volume-weighted MACD
- Heikin-Ashi candle mode
- Point & Figure chart
- Kagi chart mode
- Three-Line Break chart
- Tick chart mode
- Volume clock chart (constant volume bars)

#### Web UI — UX Features
- Dark/light theme toggle (CSS variables, persist in localStorage)
- Price alert system (user sets threshold, toast + sound when crossed)
- Sound alerts for fills and SL/TP hits (Web Audio API)
- Mobile-responsive layout (panel toggle, responsive header/footer)
- Multi-monitor support (detachable panels via popup windows with live data)
- Onboarding tutorial / first-run guide
- Keyboard shortcut help overlay (?)
- Keyboard shortcuts (1/2/3 exchange, Q/W/E symbol, Space pause)
- Toast notification system (connection changes, fills, strong signals, news events)
- BotStatus panel (AI + HFT bot status cards, portfolio overview, activity feed)
- StatusBar (bottom bar with sim time, candle count, bot activity, funding rates, connections)
- FillsPanel: fill statistics (volume, notional, fees, buy/sell ratio bar)
- Funding rate display in StatusBar
- Connection latency indicator in StatusBar (ping/pong round-trip)
- ConfigPanel (hot-reload simulator parameters)
- ReplayControls + TradeReplay (pause sim, scrub through historical candles)
- TradeTimeline (visual fill sequence with timeline dots)
- DetachablePanel wrapper for popup windows
- Sentiment indicator from news events
- Market regime indicator with auto-detection
- Multi-leg options strategies (straddle, strangle, iron condor)

#### Architecture
- Panel registry system (90+ panels, 7 categories, replaces hardcoded imports)
- PanelContainer with collapsible categories + localStorage visibility
- ARCHITECTURE_ROADMAP.md (5-20 year sustainability plan)
- Kleppmann audit: data corruption fix, exponential backoff, error logging (AUDIT_2025.md)
- WebSocket exponential backoff (1s → 2s → 4s → 8s → 16s → 30s cap)
- ClosedTrade model (tracks entry/exit/PnL/reason for each closed position)
- Account snapshot included in initial WebSocket connection
- Fills broadcast to ALL clients (Web UI sees bot trades)
- SL/TP fills broadcast to ALL clients (Web UI sees auto-closes)

### Changed — Post-v1.0.0
- AI Signal Bot pipeline updated from 7-stage to 8-stage
- WebSocket reconnect changed from fixed 3s to exponential backoff
- Web UI Dockerfile improved to multi-stage (node builder + nginx alpine)
- OrderBook component uses real WebSocket data with synthetic fallback
- CONTRIBUTING.md updated with sidebar panel registry instructions
- All silent `catch {}` blocks now log to console with component prefix

### Fixed — Post-v1.0.0
- localStorage key collision between TradeJournal and useTradeJournal (data corruption)
- useMemo with side effects in StrategyBuilder, SessionStats, TradeReplay (React anti-patterns)
- Interval leak in TradeReplay (useMemo → useEffect for setInterval)
- Dead `customIndicators` state in App.jsx (never consumed)
- Null safety in registry.js `ob()` helper (added optional chaining)
- BacktestResult.total_trades not being set in `run()`
- EnsembleVoter created with empty strategies list when only "ensemble" selected
- web-ui/.gitignore missing .env (would commit secrets)
- BacktestRunner no timeout — added 30s safety timeout

## [1.0.0] - 2025-06-29

### Added

#### Exchange Simulator
- Geometric Brownian Motion price generation with per-symbol volatility
- 3 simulated exchanges (Binance, Bybit, OKX) with different fee structures
- 3 trading pairs: BTC/USDT, ETH/USDT, SOL/USDT
- Simulated order book with 20 depth levels
- Market and limit order matching engine
- Account simulation with balance, positions, PnL, win rate
- Multi-exchange arbitrage detection with WebSocket broadcast
- Terminal visualizer with ASCII candle charts, RSI, MACD, Bollinger Bands
- WebSocket server streaming market data (port 8765)
- Order book snapshots broadcast to all WebSocket clients
- Config validation module with comprehensive error checking
- Reproducible mode (configurable random seed)

#### AI Signal Bot
- 7-stage signal generation pipeline
- Technical indicators: RSI, EMA, MACD, Bollinger Bands, ATR, ADX, VWAP
- Trend Following strategy (EMA crossover + ADX filter)
- Mean Reversion strategy (RSI extremes + Bollinger Bands)
- FFT Cycle strategy (spectral analysis, cycle detection, regime classification)
- Ensemble Voter (majority or confidence-weighted)
- Signal validation with risk checks (confidence, R:R, drawdown, position limits)
- Signal Publisher WebSocket server (port 8766)
- SQLite database for signals, trades, and equity curve
- CSV logging for signals and trades
- Terminal dashboard with performance metrics
- Backtesting engine with fee/slippage modeling, drawdown analysis, Calmar ratio
- Equity curve plotting (matplotlib)
- Strategy parameter optimization with grid search and walk-forward validation
- Kelly Criterion position sizing
- Order book replay for backtesting OBI/pressure strategies
- Risk manager: trailing stop loss (fixed % or ATR-based), breakeven moves, partial take profit, max hold time
- Backtest WebSocket endpoint: run backtests from Web UI

#### HFT Trade Bot
- C++20 with low-latency signal generation
- HFT Signal Engine (6 indicators): EMA crossover, OBI, VWAP deviation, Price Pressure, FFT spectral trend, FFT smoothed direction
- Smart order type selector (market vs limit based on spread and confidence)
- Thread-safe position manager with automatic SL/TP monitoring
- Pre-trade risk manager with position sizing
- WebSocket client for market data and order execution
- spdlog for high-performance logging

#### Web UI Dashboard
- React 18 + Vite + TailwindCSS
- TradingView-style candle charts (lightweight-charts) with volume histogram
- Chart indicators: EMA 9/21/50, Bollinger Bands, RSI 14 (toggle on/off)
- Binance-style order book with real WebSocket data and depth visualization
- Order form: market/limit, SL/TP, live notional calculation
- Account panel: balance, equity, PnL, fees, win rate per exchange
- Positions panel: open positions with unrealized PnL, close button
- AI signal feed: real-time signals with confidence, R:R, regime
- Arbitrage panel: active opportunities with spread, estimated profit
- Fills panel: recent order fill history
- Performance dashboard: aggregate metrics, per-exchange breakdown, equity curve, drawdown chart, signal stats
- Backtest runner: configure and run backtests, compare strategy equity curves, trailing/breakeven risk options
- WebSocket auto-reconnect with live status indicators
- Dark theme (Binance-inspired)
- Docker support (port 3000)

#### Infrastructure
- Docker Compose orchestration with healthchecks
- CI/CD with GitHub Actions: Python tests, C++ build, Web UI build, Docker image verification
- Ruff linting with per-file ignores
- GitHub issue templates (bug report, feature request)
- GitHub pull request template
- MIT License
- Comprehensive documentation: ARCHITECTURE.md, PROGRESS.md, WEB_UI.md, WEBSOCKET_PROTOCOL.md

### Changed
- N/A (initial release)

### Deprecated
- N/A (initial release)

### Removed
- N/A (initial release)

### Fixed
- N/A (initial release)

### Security
- No secrets or API keys committed
- Only localhost WebSocket URLs in configuration
- .gitignore covers all sensitive paths (env files, databases, build artifacts)
