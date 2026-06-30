# Future TODO — Trading System Lite

## High Priority
- [x] Price alert system: user sets threshold price for symbol, toast when crossed
- [x] Connection latency indicator in StatusBar (ping/pong round-trip)
- [x] Dark/light theme toggle (CSS variables, persist in localStorage)
- [x] Order book depth heatmap visualization (color intensity by volume, toggle)
- [x] Multi-timeframe chart toggle (5m/15m/1h/4h) — frontend aggregation

## Medium Priority
- [x] Replay mode: pause sim, scrub through historical candles
- [x] Position risk calculator: input qty + leverage → show liquidation + margin + risk
- [x] Cross-exchange arbitrage simulator: auto-execute when spread > threshold
- [x] Signal performance tracking: match signals to subsequent fills, track hit rate
- [x] Candle pattern detection (doji, hammer, engulfing) with visual overlay
- [x] VWAP indicator on chart
- [x] Trade journal: add notes to closed trades (localStorage persistence)
- [x] Export performance report as PDF (print-to-PDF with styled report)

## Low Priority
- [x] Sound alerts for fills and SL/TP hits (Web Audio API)
- [x] Mobile-responsive layout (panel toggle, responsive header/footer)
- [x] Multi-monitor support (detachable panels via popup windows with live data)
- [x] Custom indicator builder (SMA, EMA, RSI, Bollinger with custom params)
- [x] Backtest comparison: run multiple backtests, compare results side-by-side (localStorage, CSV export)
- [ ] Market depth replay from recorded L2 data
- [x] Onboarding tutorial / first-run guide

## New Features — Phase 2
- [x] Order book depth chart (cumulative depth visualization)
- [x] Trade execution timeline (visual fill sequence with timeline dots)
- [x] Risk parity position sizing calculator
- [x] Correlation matrix between symbols
- [x] Session stats card (PnL since session start, best/worst trade, win rate)
- [x] Keyboard shortcut help overlay (?)
- [x] Export trade journal to CSV
- [x] Dark order flow detection (large hidden orders via volume analysis)
- [x] TWAP/VWAP execution bot strategy (sliced order execution with progress)
- [x] Greeks calculator for options simulation (Black-Scholes: delta, gamma, theta, vega, rho)

## Backend / Simulator
- [x] Per-exchange funding rate actually charged to positions
- [x] Partial fill simulation (large orders split across levels)
- [x] Order rejection reasons (insufficient margin, max position size, no price data)
- [x] Market impact model (large orders move price)
- [x] Holiday/weekend mode (reduced volatility, auto-detect)
- [x] News event simulation (sudden volatility spikes)
- [x] Liquidation engine: auto-close when margin < maintenance

## Architecture
- [x] WebSocket message compression (per-message deflate)
- [x] Reconnection with state sync (resume from last candle)
- [x] Config hot-reload (change volatility/fees without restart)
- [x] Prometheus metrics endpoint for monitoring
- [x] Docker compose for one-command startup

## New Features — Phase 3
- [x] Heatmap calendar (daily PnL heatmap by date)
- [x] Monte Carlo simulation for strategy robustness
- [ ] Multi-leg options strategies (straddle, strangle, iron condor)
- [x] Volume profile + POC (Point of Control) on chart
- [x] Market regime indicator with auto-detection (trending/ranging/volatile)
- [x] Kelly criterion position sizing
- [x] Drawdown recovery analysis
- [x] Trade clustering detection (overtrading warning)
- [x] Sentiment indicator from news events
- [x] Portfolio optimization (Markowitz efficient frontier)

## New Features — Phase 4
- [x] Strategy builder: visual rule-based strategy creator (if-then conditions)
- [ ] Walk-forward analysis for backtest validation
- [x] Order flow imbalance indicator (bid/ask volume ratio)
- [x] Fibonacci retracement levels on chart
- [x] Support/resistance auto-detection with touch count
- [x] Risk-adjusted return comparison (Sharpe/Sortino/Calmar side-by-side)
- [ ] Trade simulation replay with step-through
- [x] Alert webhook (send notifications to Discord/Telegram)
- [x] Custom watchlist with price tracking
- [x] Export full session data as JSON

## New Features — Phase 5
- [x] Walk-forward analysis for backtest validation
- [x] Multi-leg options strategies (straddle, strangle, iron condor)
- [x] Trade simulation replay with step-through
- [ ] Market depth replay from recorded L2 data
- [x] Heatmap of order book changes over time
- [ ] Strategy backtesting with custom rules from Strategy Builder
- [x] Real-time P&L attribution (which position contributes most)
- [x] Correlation-based hedging suggestions
- [x] Volatility surface visualization
- [x] Order book spoofing detection

## New Features — Phase 6
- [ ] Market depth replay from recorded L2 data
- [ ] Strategy backtesting with custom rules from Strategy Builder
- [x] Real-time order flow tape (print stream)
- [x] Cumulative volume delta (CVD) indicator
- [x] Fair value gap (FVG) detection on chart
- [ ] Liquidity heatmap (pool levels over time)
- [ ] Position correlation matrix (cross-position risk)
- [x] Auto-rebalance portfolio to target weights
- [x] Trade performance by time of day
- [ ] Export backtest results as shareable link

## New Features — Phase 7
- [ ] Market depth replay from recorded L2 data
- [ ] Strategy backtesting with custom rules from Strategy Builder
- [ ] Liquidity heatmap (pool levels over time)
- [x] Position correlation matrix (cross-position risk)
- [ ] Export backtest results as shareable link
- [ ] Real-time P&L attribution chart (equity contribution over time)
- [x] Smart order routing (best price across exchanges)
- [x] Candle pattern scanner (scan all symbols for patterns)
- [x] Risk metric dashboard (VaR, CVaR, beta)
- [x] Trade journal with tags and filtering

## New Features — Phase 8
- [ ] Market depth replay from recorded L2 data
- [ ] Strategy backtesting with custom rules from Strategy Builder
- [x] Liquidity heatmap (pool levels over time)
- [ ] Export backtest results as shareable link
- [x] Real-time P&L attribution chart (equity contribution over time)
- [ ] Options strategy P&L simulator with Greeks overlay
- [x] Market profile (TPO: time price opportunity)
- [ ] Volume-weighted TWAP execution
- [x] Multi-account aggregated view
- [x] Trade statistics export to CSV with custom fields

## New Features — Phase 9
- [ ] Market depth replay from recorded L2 data
- [ ] Strategy backtesting with custom rules from Strategy Builder
- [ ] Export backtest results as shareable link
- [ ] Options strategy P&L simulator with Greeks overlay
- [ ] Volume-weighted TWAP execution
- [x] On-balance volume (OBV) indicator
- [x] Money flow index (MFI)
- [x] Williams %R indicator
- [x] Ichimoku cloud visualization
- [x] Renko candle chart mode

## New Features — Phase 10
- [ ] Market depth replay from recorded L2 data (carried over)
- [ ] Strategy backtesting with custom rules from Strategy Builder (carried over)
- [ ] Export backtest results as shareable link (carried over)
- [ ] Options strategy P&L simulator with Greeks overlay (carried over)
- [ ] Volume-weighted TWAP execution (carried over)
- [x] Stochastic oscillator
- [x] Average True Range (ATR) indicator panel
- [x] Parabolic SAR
- [x] ADX/DI indicator (trend strength)
- [x] Commodity Channel Index (CCI)
- [x] Awesome Oscillator
- [x] Volume-weighted MACD
- [x] Heikin-Ashi candle mode
- [x] Point & Figure chart
- [x] Kagi chart mode

## New Features — Phase 11
- [ ] Market depth replay from recorded L2 data (carried over)
- [ ] Strategy backtesting with custom rules from Strategy Builder (carried over)
- [ ] Export backtest results as shareable link (carried over)
- [ ] Options strategy P&L simulator with Greeks overlay (carried over)
- [ ] Volume-weighted TWAP execution (carried over)
- [x] Point & Figure chart (carried over)
- [x] Kagi chart mode (carried over)
- [ ] Dark/light theme toggle in settings
- [x] Multi-timeframe charts (side-by-side comparison)
- [x] Price alert system with sound + visual notification
- [ ] Order book depth replay (historical L2 scrubbing)
- [x] Trade replay with timeline scrubber (bug fix: useMemo→useEffect)
- [x] Export session as replayable JSON
- [ ] Custom indicator plugin system (user-defined formulas)
- [ ] Backtest comparison (side-by-side results)
- [ ] Mobile-responsive layout optimization

## New Features — Phase 12
- [ ] Market depth replay from recorded L2 data (carried over)
- [ ] Strategy backtesting with custom rules from Strategy Builder (carried over)
- [ ] Export backtest results as shareable link (carried over)
- [ ] Options strategy P&L simulator with Greeks overlay (carried over)
- [ ] Volume-weighted TWAP execution (carried over)
- [ ] Dark/light theme toggle in settings (carried over)
- [ ] Order book depth replay (historical L2 scrubbing) (carried over)
- [ ] Custom indicator plugin system (user-defined formulas) (carried over)
- [ ] Backtest comparison (side-by-side results) (carried over)
- [ ] Mobile-responsive layout optimization (carried over)
- [x] Three-Line Break chart
- [ ] Market Profile (TPO) with volume nodes
- [x] Order Block detection (institutional zones)
- [ ] Fair Value Gap heatmap (multi-timeframe)
- [x] Session-based volume profile (London/NY/Asia)
- [x] Volatility regime indicator (GARCH-like)
- [x] Correlation-based pair trading signals
- [ ] Market sentiment gauge (multi-source aggregation)
- [x] Tick chart mode (tick-based instead of time-based)
- [x] Volume clock chart (constant volume bars)

## New Features — Phase 13
- [ ] Market depth replay from recorded L2 data (carried over)
- [ ] Strategy backtesting with custom rules from Strategy Builder (carried over)
- [ ] Export backtest results as shareable link (carried over)
- [ ] Options strategy P&L simulator with Greeks overlay (carried over)
- [ ] Volume-weighted TWAP execution (carried over)
- [ ] Dark/light theme toggle in settings (carried over)
- [ ] Order book depth replay (historical L2 scrubbing) (carried over)
- [ ] Custom indicator plugin system (user-defined formulas) (carried over)
- [ ] Backtest comparison (side-by-side results) (carried over)
- [ ] Mobile-responsive layout optimization (carried over)
- [x] Market Profile (TPO) with volume nodes (carried over)
- [x] Fair Value Gap heatmap (multi-timeframe) (carried over)
- [x] Market sentiment gauge (multi-source aggregation) (carried over)
- [ ] Dark/light theme toggle with CSS variables
- [ ] Component subfolder organization (order-flow, technical, risk, etc.)
- [ ] React.lazy + Suspense for panel lazy loading
- [ ] Custom indicator formula parser (user-defined expressions)
- [ ] Backtest comparison (side-by-side strategy results)
- [x] Liquidation map (estimated liquidation levels)
- [x] Funding rate history chart
- [x] Open interest tracker
- [x] Whale alert simulation (large order detection)

## New Features — Phase 14
- [ ] Market depth replay from recorded L2 data (carried over)
- [ ] Strategy backtesting with custom rules from Strategy Builder (carried over)
- [ ] Export backtest results as shareable link (carried over)
- [ ] Options strategy P&L simulator with Greeks overlay (carried over)
- [ ] Volume-weighted TWAP execution (carried over)
- [ ] Dark/light theme toggle with CSS variables (carried over)
- [ ] Order book depth replay (historical L2 scrubbing) (carried over)
- [ ] Custom indicator formula parser (user-defined expressions) (carried over)
- [ ] Backtest comparison (side-by-side strategy results) (carried over)
- [ ] Mobile-responsive layout optimization (carried over)
- [ ] Component subfolder organization (order-flow, technical, risk, etc.)
- [ ] React.lazy + Suspense for panel lazy loading
- [ ] Dark/light theme toggle with CSS variables + localStorage persistence
- [ ] Component subfolder organization (technical/, risk/, portfolio/, etc.)
- [ ] React.lazy + Suspense for panel lazy loading (reduce initial bundle)
- [ ] Custom indicator formula parser (user-defined expressions)
- [ ] Backtest comparison (side-by-side strategy results)
- [ ] Order book depth replay (historical L2 scrubbing)
- [x] Market depth heatmap (L2 price level intensity) — already existed (OrderBookHeatmap)
- [x] Cumulative Tick Index (NYSE TICK equivalent)
- [ ] Put/Call ratio simulation
- [x] Fear & Greed index (multi-signal composite)
- [x] Inter-exchange spread tracker
- [x] Liquidation cascade simulator
- [x] Position size optimizer (risk-based)
- [ ] Trade simulator with custom slippage model

## New Features — Phase 15
- [ ] Market depth replay from recorded L2 data (carried over)
- [ ] Strategy backtesting with custom rules from Strategy Builder (carried over)
- [ ] Export backtest results as shareable link (carried over)
- [ ] Options strategy P&L simulator with Greeks overlay (carried over)
- [ ] Volume-weighted TWAP execution (carried over)
- [ ] Dark/light theme toggle with CSS variables + localStorage persistence
- [ ] Order book depth replay (historical L2 scrubbing) (carried over)
- [ ] Custom indicator formula parser (user-defined expressions) (carried over)
- [ ] Backtest comparison (side-by-side strategy results) (carried over)
- [ ] Mobile-responsive layout optimization (carried over)
- [ ] Component subfolder organization (technical/, risk/, portfolio/, etc.)
- [ ] React.lazy + Suspense for panel lazy loading (reduce initial bundle)
- [ ] Put/Call ratio simulation
- [ ] Trade simulator with custom slippage model
- [ ] Dark/light theme toggle with CSS variables + localStorage
- [ ] Component subfolder organization (technical/, risk/, portfolio/, etc.)
- [ ] React.lazy + Suspense for panel lazy loading (reduce initial bundle)
- [ ] Vitest unit test setup
- [ ] Playwright E2E tests
- [ ] Put/Call ratio simulation
- [ ] Trade simulator with custom slippage model
- [ ] Market profile with value area + POC (enhanced)
- [x] Footprint chart (volume inside candles)
- [x] Delta divergence detector
- [ ] Volume-weighted average price by session
- [ ] Market-if-touched (MIT) order simulator
- [x] Trailing stop calculator with ATR
- [x] Risk of ruin calculator
- [x] Expected value (EV) calculator per strategy
- [ ] Multi-symbol correlation heatmap
- [x] Regime-switching detection (HMM-like)

## New Features — Phase 16
- [ ] Market depth replay from recorded L2 data (carried over)
- [ ] Strategy backtesting with custom rules from Strategy Builder (carried over)
- [ ] Export backtest results as shareable link (carried over)
- [ ] Options strategy P&L simulator with Greeks overlay (carried over)
- [ ] Volume-weighted TWAP execution (carried over)
- [ ] Dark/light theme toggle with CSS variables + localStorage persistence
- [ ] Order book depth replay (historical L2 scrubbing) (carried over)
- [ ] Custom indicator formula parser (user-defined expressions) (carried over)
- [ ] Backtest comparison (side-by-side strategy results) (carried over)
- [ ] Mobile-responsive layout optimization (carried over)
- [ ] Component subfolder organization (technical/, risk/, portfolio/, etc.)
- [ ] React.lazy + Suspense for panel lazy loading (reduce initial bundle)
- [ ] Vitest unit test setup
- [ ] Playwright E2E tests
- [ ] Put/Call ratio simulation
- [ ] Trade simulator with custom slippage model
- [ ] Volume-weighted average price by session
- [ ] Market-if-touched (MIT) order simulator
- [ ] Multi-symbol correlation heatmap
- [ ] Dark/light theme toggle with CSS variables + localStorage
- [ ] Component subfolder organization (technical/, risk/, portfolio/, etc.)
- [ ] React.lazy + Suspense for panel lazy loading (reduce initial bundle)
- [ ] Put/Call ratio simulation
- [ ] Trade simulator with custom slippage model
- [x] VWAP by session (London/NY/Asia/Off)
- [ ] MIT (Market-if-Touched) order simulator
- [ ] Multi-symbol correlation heatmap (visual matrix)
- [ ] Order flow imbalance heatmap (aggregated)
- [ ] Volume profile + POC enhancement (value area)
- [x] Smart money concept detector (BOS/CHoCH)
- [x] Liquidity grab detector (stop hunts)
- [x] Order flow absorption detector
- [ ] Tick speed anomaly detector
- [x] Volume anomaly detector (unexpected volume spikes)
- [ ] Price action pattern score (composite)
- [x] Multi-timeframe confluence score

## New Features — Phase 17
- [ ] Market depth replay from recorded L2 data (carried over)
- [ ] Strategy backtesting with custom rules from Strategy Builder (carried over)
- [ ] Export backtest results as shareable link (carried over)
- [ ] Options strategy P&L simulator with Greeks overlay (carried over)
- [ ] Volume-weighted TWAP execution (carried over)
- [ ] Dark/light theme toggle with CSS variables + localStorage persistence
- [ ] Order book depth replay (historical L2 scrubbing) (carried over)
- [ ] Custom indicator formula parser (user-defined expressions) (carried over)
- [ ] Backtest comparison (side-by-side strategy results) (carried over)
- [ ] Mobile-responsive layout optimization (carried over)
- [ ] Component subfolder organization (technical/, risk/, portfolio/, etc.)
- [ ] React.lazy + Suspense for panel lazy loading (reduce initial bundle)
- [ ] Vitest unit test setup
- [ ] Playwright E2E tests
- [ ] Put/Call ratio simulation
- [ ] Trade simulator with custom slippage model
- [ ] MIT (Market-if-Touched) order simulator
- [ ] Multi-symbol correlation heatmap (visual matrix)
- [ ] Order flow imbalance heatmap (aggregated)
- [ ] Volume profile + POC enhancement (value area)
- [ ] Tick speed anomaly detector
- [x] Price action pattern score (composite)
- [ ] Dark/light theme toggle with CSS variables + localStorage
- [ ] Component subfolder organization (technical/, risk/, portfolio/, etc.)
- [ ] React.lazy + Suspense for panel lazy loading (reduce initial bundle)
- [ ] Put/Call ratio simulation
- [ ] Trade simulator with custom slippage model
- [ ] Tick speed anomaly detector
- [ ] MIT order simulator
- [ ] Multi-symbol correlation heatmap (visual matrix)
- [ ] Order flow imbalance heatmap (aggregated)
- [ ] Volume profile + POC enhancement (value area)
- [x] Composite signal dashboard (all indicators aggregated)
- [x] Trade performance attribution by indicator
- [x] Market regime adaptive strategy selector
- [x] Real-time signal confidence scorer
- [x] Cross-market divergence (crypto vs DXY vs SPX proxy)

## New Features — Phase 18
- [ ] Market depth replay from recorded L2 data (carried over)
- [ ] Strategy backtesting with custom rules from Strategy Builder (carried over)
- [ ] Export backtest results as shareable link (carried over)
- [ ] Options strategy P&L simulator with Greeks overlay (carried over)
- [ ] Volume-weighted TWAP execution (carried over)
- [ ] Order book depth replay (historical L2 scrubbing) (carried over)
- [ ] Custom indicator formula parser (user-defined expressions) (carried over)
- [ ] Backtest comparison (side-by-side strategy results) (carried over)
- [ ] Mobile-responsive layout optimization (carried over)
- [ ] Dark/light theme toggle with CSS variables + localStorage persistence
- [ ] Component subfolder organization (technical/, risk/, portfolio/, etc.)
- [ ] React.lazy + Suspense for panel lazy loading (reduce initial bundle)
- [ ] Vitest unit test setup
- [ ] Playwright E2E tests
- [x] Put/Call ratio simulation
- [x] Trade simulator with custom slippage model (SlippageSimulator)
- [x] Tick speed anomaly detector
- [x] MIT order simulator
- [x] Multi-symbol correlation heatmap (visual matrix)
- [x] Order flow imbalance heatmap (aggregated) (OrderFlowHeatmap)
- [x] Volume profile + POC enhancement (value area) (already existed)
- [x] Heatmap of all indicators (unified signal matrix)
- [x] Alert system with Web Audio + visual flash (PriceAlerts already exists)
- [x] Trade journal with notes + tags (TradeJournal already exists)
- [x] Export trade log as CSV/JSON (TradeStatsExport + SessionExport already exist)
- [ ] Strategy backtest engine (historical replay)

## Phase 19 — Done + Next
- [x] Trade simulator with custom slippage model (SlippageSimulator)
- [x] Order flow imbalance heatmap (aggregated) (OrderFlowHeatmap)
- [x] Volume profile + POC enhancement (already had VA/POC)
- [ ] Market depth replay from recorded L2 data
- [ ] Strategy backtesting with custom rules
- [ ] Custom indicator formula parser
- [ ] Backtest comparison (side-by-side results)
- [ ] Component subfolder organization (technical/, risk/, portfolio/)
- [ ] React.lazy + Suspense for panel lazy loading
- [ ] Vitest unit test setup
- [ ] Playwright E2E tests
- [ ] TypeScript migration (incremental)
- [ ] Zustand global state store
- [ ] CI/CD pipeline (GitHub Actions)

## Phase 20 — Done + Next
- [x] Market depth replay from recorded L2 data (MarketDepthReplay)
- [x] Custom indicator formula parser (IndicatorFormulaParser)
- [x] React.lazy + Suspense for panel lazy loading (Suspense wrapper in PanelContainer)
- [ ] Strategy backtesting with custom rules from Strategy Builder
- [ ] Backtest comparison (side-by-side strategy results)
- [ ] Component subfolder organization (technical/, risk/, portfolio/)
- [ ] Vitest unit test setup
- [ ] Playwright E2E tests
- [ ] TypeScript migration (incremental, file-by-file)
- [ ] Zustand global state store
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Consolidate duplicate journal systems (useTradeJournal + TradeJournal)
- [ ] Refactor useDetachablePanels (replace inline HTML popup)

## Phase 21 — Done + Next
- [x] Error boundary per panel (PanelErrorBoundary in PanelContainer)
- [ ] Strategy backtesting with custom rules from Strategy Builder
- [ ] Backtest comparison (side-by-side strategy results)
- [ ] Component subfolder organization (technical/, risk/, portfolio/)
- [ ] Convert registry.js imports to React.lazy (full code splitting)
- [ ] Vitest unit test setup
- [ ] Playwright E2E tests
- [ ] TypeScript migration (incremental, file-by-file)
- [ ] Zustand global state store
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Consolidate duplicate journal systems
- [ ] Refactor useDetachablePanels (replace inline HTML popup)
- [ ] WebSocket message queue for offline resilience

## Phase 22 — Done + Next
- [x] Performance: virtualize long lists (VirtualList component, applied to FillsPanel + SignalFeed)
- [ ] Strategy backtesting with custom rules from Strategy Builder
- [ ] Backtest comparison (side-by-side strategy results)
- [ ] Component subfolder organization (technical/, risk/, portfolio/)
- [ ] Convert registry.js imports to React.lazy (full code splitting)
- [ ] Vitest unit test setup
- [ ] Playwright E2E tests
- [ ] TypeScript migration (incremental, file-by-file)
- [ ] Zustand global state store
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Consolidate duplicate journal systems
- [ ] Refactor useDetachablePanels (replace inline HTML popup)
- [ ] WebSocket message queue for offline resilience
- [ ] Accessibility: ARIA labels, keyboard nav for all panels
- [ ] i18n: extract strings, add locale support

## Phase 23 — Done + Next
- [x] CLI Monitor: AI Signal Bot monitor (monitor.py — live WS signal feed, log tail, auto-reconnect)
- [x] CLI Monitor: HFT Trade Bot monitor (monitor.py — process status, log tail, color-coded errors)
- [x] CLI Monitor: Unified Error Monitor (error_monitor.py — all 3 service logs, error/warning filter)
- [x] CLI Monitor: Price & Signal Monitor (price_monitor.py — live prices + signals + fills via dual WS)
- [x] Updated start.bat + start.sh to open 8 windows (4 services + 4 monitors)
- [x] README updated with CLI Monitor Windows documentation
- [ ] Strategy backtesting with custom rules from Strategy Builder
- [ ] Backtest comparison (side-by-side strategy results)
- [ ] Component subfolder organization (technical/, risk/, portfolio/)
- [ ] Convert registry.js imports to React.lazy (full code splitting)
- [ ] Vitest unit test setup
- [ ] Playwright E2E tests
- [ ] TypeScript migration (incremental, file-by-file)
- [ ] Zustand global state store
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Consolidate duplicate journal systems
- [ ] Refactor useDetachablePanels (replace inline HTML popup)
- [ ] WebSocket message queue for offline resilience
- [ ] Accessibility: ARIA labels, keyboard nav for all panels
- [ ] i18n: extract strings, add locale support
- [ ] PWA: service worker, offline mode, install prompt
- [ ] Theme: user-customizable color schemes

## Phase 24 — Advanced Mathematical Models [DONE]
- [x] GARCH(1,1) Volatility Forecaster — MLE parameter estimation (ω, α, β), volatility forecast, persistence, half-life, EWMA + Parkinson comparison, regime classification
- [x] Cointegration Scanner — Engle-Granger 2-step (OLS → ADF test), half-life estimation, z-score signals, correlation, R², multi-pair ranking
- [x] Markov Chain Regime Predictor — 6-state transition matrix, power iteration for stationary distribution, next-regime probability forecast, skewness/kurtosis
- [x] Hurst Exponent + Fractal Dimension — R/S analysis (log-log regression), DFA (detrended fluctuation analysis), autocorrelation function, behavior classification (persistent/anti-persistent/random)
- [x] Kalman Filter Price Estimator — 1D (price only) and 2D (price + velocity) models, adaptive Kalman gain, residual analysis, interactive Q/R tuning
- [x] Spectral Analysis (Welch PSD) — DFT, Welch's method with Hann window + 50% overlap, dominant cycle detection, spectral entropy, noise color classification (white/pink/brown/blue)

## Phase 25 — HFT Bot Optimization + Native Signal Engine V2 [DONE]
- [x] TASK 1: Latency optimization — Spinlock (_mm_pause), SPSCQueue (lock-free), ObjectPool, LatencyHistogram (P50/P95/P99/P99.9), ScopedLatency, ThreadAffinity (pin to core + max priority), CircuitBreaker (5 errors → 30s cooldown → half-open), RetryPolicy (exponential backoff + jitter), cache-line aligned structs (alignas(64)), CMake LTO + -O3 + -msse4.2 + -ffast-math
- [x] TASK 2: Native signal engine v2 — InlineEMA(21/50), InlineRSI(14), InlineADX(14), InlineVWAP, weighted composite score (6 indicators), BUY/SELL/HOLD + confidence + SL/TP (ATR-based), configurable cooldown, dynamic leverage, no heap allocations, all inlined
- [x] TASK 3: Order book pressure model — multi-level OBI (5/10/20 + distance-weighted), trade flow imbalance, toxicity detection (large aggressive orders → score [0,1]), queue position estimation, spread regime (TIGHT/NORMAL/WIDE), price impact prediction (obi×2 + trade_imbalance×1.5 + microprice_dev×0.5)
- [x] TASK 4: Smart order router v2 — IExchange interface (DIP/SOLID), 5 strategies (BestPrice, LowestLatency, LowestFees, BestEffective, DepthAware), per-exchange EMA latency tracking, fee schedule, anti-toxic backoff (≥5 toxic events → skip), depth-aware penalty
- [x] TASK 5: Adaptive order type selection — dynamic IOC/FOK/GTD/PostOnly based on confidence/spread/OBI/toxicity, emergency→FOK, toxic→IOC, high-conf+tight→IOC, low-conf+wide→PostOnly, large-vs-thin→GTD, Binance/OKX/Bybit exchange mappings
- [x] Integration: config.h/cpp (20+ new params), config.yaml (v2 sections), main.cpp v2.0.0, graceful shutdown (cancel all positions), V1 fallback, 30+ unit tests

## Phase 26 — Advanced Mathematical Models V2 [DONE]
- [x] Ehlers SuperSmoother Filter — 2-pole super smoother (zero-lag DSP), Roofing Filter (high-pass + super smoother), MESA Adaptive Moving Average (MAMA/FAMA) with Hilbert Transform phase detection, SNR calculation, lag analysis
- [x] Bayesian Price Predictor — Beta-Binomial model (P(up) with conjugate prior), Normal-Inverse-Gamma posterior (mean return), BOCPD (Bayesian Online Changepoint Detection with hazard function), Bayesian Ridge regression (EM-based weight optimization), 95% credible intervals
- [x] Almgren-Chriss Optimal Execution — implementation shortfall model, optimal trajectory x(t) = X·sinh(κ(T-t))/sinh(κT), temporary + permanent impact, efficient frontier (cost vs risk), TWAP comparison, savings calculation
- [x] Wavelet Decomposition (MRA) — Haar and Daubechies D4 wavelets, multi-level DWT/IDWT, MRA component reconstruction, wavelet variance (energy by scale), soft-thresholding denoising, SNR-based signal generation
- [x] K-Means Market Clustering — K-Means++ initialization, Lloyd's algorithm, 8-dimensional features (mean, vol, skew, kurt, MAR, AC1, R², vol ratio), silhouette score for optimal K, regime labeling (Calm Trend, Volatile Range, etc.), regime transition tracking
- [x] Copula Dependency Model — empirical copula (rank-based), Clayton (lower tail dependence), Gumbel (upper tail), Gaussian (no tail), Student-t (symmetric tail), Kendall's τ / Spearman's ρ fitting, tail dependence coefficients, conditional crash probability, contour visualization

## Phase 27 — Advanced Mathematical Models V3 [DONE]
- [x] Hidden Markov Model — Baum-Welch (EM) training with forward-backward algorithm, Viterbi decoding (most likely state sequence), scaled forward algorithm (log-likelihood), posterior marginal probabilities (γ), state labeling (Calm Bull/Bear, Volatile Bull/Bear, Sideways, High Vol), next-state prediction, transition matrix visualization
- [x] Principal Component Analysis — Jacobi eigendecomposition for symmetric matrices, covariance-based PCA, explained variance ratio + cumulative, eigenportfolio construction (weights ∝ eigenvector/σ), factor interpretation (Market/Slope/Curvature), factor scores over time, scree plot
- [x] Optimal Stopping (Snell Envelope) — binomial tree American option pricing (Cox-Ross-Rubinstein), Snell envelope backward recursion V(t) = max(g(t), E[V(t+1)]), exercise boundary visualization, Longstaff-Schwartz Monte Carlo (regression-based continuation value), early exercise premium, exercise probability distribution
- [x] Isolation Forest — unsupervised anomaly detection, random feature + random split isolation, path length → anomaly score s(x,n) = 2^(-E[h(x)]/c(n)), 7-dimensional features (return, vol, volume Z, range, RSI, skew, price dev), feature importance via split frequency, configurable threshold
- [x] Variational Mode Decomposition — non-recursive signal decomposition via ADMM, mode update û_k(ω) = (f̂ - Σû_i + λ/2) / (1 + 2α(ω-ω_k)²), center frequency update ω_k = ∫ω|û_k|²/∫|û_k|², FFT/IFFT, mirror extension, energy distribution per mode, convergence tracking

## Phase 28 — Advanced Mathematical Models V4 [DONE]
- [x] Empirical Mode Decomposition (EMD) + Hilbert-Huang Transform — sifting process with cubic spline envelopes, IMF extraction (extrema = zero crossings ±1, mean envelope = 0), Hilbert Transform (analytic signal z = x + jH[x]), instantaneous amplitude/frequency/phase, energy distribution per IMF
- [x] Support Vector Machine (SVM) — linear SVM via SGD with hinge loss (sub-gradient descent), RBF kernel SVM via SMO (Sequential Minimal Optimization), 8-dimensional features (mean, vol, skew, kurt, lastRet, momentum, RSI, AC1), feature importance (|w|), confusion matrix, train/test accuracy
- [x] Black-Litterman Portfolio Allocation — equilibrium returns π = δΣw_mkt (reverse optimization), investor views (P·E[r] = Q + ε), posterior returns E[r] = π + τΣPᵀ(PτΣPᵀ + Ω)⁻¹(Q - Pπ), posterior covariance, optimal weights w = (δΣ_post)⁻¹E[r], Sharpe ratios, interactive view editor
- [x] Hawkes Process — self-exciting point process λ(t) = μ + Σ α·e^(-β(t-t_i)), MLE via grid search + fine-tuning, branching ratio n = α/β (stationarity: n < 1), Ogata's thinning simulation, conditional intensity visualization, inter-arrival distribution comparison, trade clustering detection
- [x] Dynamic Time Warping (DTW) — D[i,j] = d(x_i,y_j) + min(D[i-1,j], D[i,j-1], D[i-1,j-1]), Sakoe-Chiba band constraint, warping path backtracking, 8 template patterns (double bottom, head & shoulders, ascending/descending triangle, cup & handle, V-reversal, flag, channel), historical window scanning, similarity scoring

## Phase 29 — Advanced Mathematical Models V5 [DONE]
- [x] LSTM Recurrent Neural Network — Elman RNN with LSTM gating (input/forget/output gates), cell state c_t = f_t⊙c_{t-1} + i_t⊙g_t, BPTT (Backpropagation Through Time) with 5-step truncation, Xavier initialization, MSE loss, learning rate decay, train/test direction accuracy, loss curve visualization
- [x] Kelly Criterion Portfolio Sizing — single-asset Kelly f* = (p·b - q)/b, continuous Kelly f* = μ/σ², multi-asset Kelly f* = Σ⁻¹·μ (matrix form), fractional Kelly (configurable), leverage clamping, growth rate g = fᵀμ - ½fᵀΣf, Monte Carlo simulation (500 paths × 252 steps), drawdown analysis, growth-vs-fraction curve
- [x] Gaussian Process Regression — RBF/Matérn 5/2/Periodic kernels, Cholesky decomposition for O(n³) inversion, posterior mean μ(x*) = k(x*,X)·(K+σ_n²I)⁻¹·y, posterior variance σ²(x*) = k(x*,x*) - k(x*,X)·(K+σ_n²I)⁻¹·k(X,x*), hyperparameter optimization (grid search + fine-tune), log marginal likelihood, 2σ confidence bands, future prediction
- [x] Markov-Switching GARCH — Hamilton filter for regime probabilities, Kim's smoothing approximation, per-regime GARCH(1,1) parameters, combined volatility (regime-weighted), transition matrix, expected regime duration, regime probability visualization, 3 candidate parameter sets with MLE selection
- [x] Empirical Dynamic Modeling (EDM) — Takens' embedding theorem, mutual information for optimal time delay τ, false nearest neighbors for optimal embedding dimension E, simplex projection forecast (E+1 nearest neighbors, exponential weighting), Convergent Cross Mapping (CCM) for causality detection (Sugihara), library size convergence

## Phase 30 — Advanced Mathematical Models V6 [DONE]
- [x] Autoencoder (Deep Learning) — shallow AE with sigmoid activation, encoder h=σ(W_e·x+b_e), decoder x̂=σ(W_d·h+b_d), MSE+L2 loss, backpropagation, reconstruction error anomaly detection (μ+kσ threshold), latent space visualization, 12-dimensional features, compression ratio
- [x] Optimal Transport (Wasserstein) — 1-Wasserstein via sorted samples (EMD), 2-Wasserstein via quantile matching, Sinkhorn algorithm (entropic regularization, u←p/(K·v), v←q/(Kᵀ·u)), Gaussian W₂ approximation, Kolmogorov-Smirnov statistic, rolling W₁ for regime shift detection, distribution histogram comparison
- [x] Rough Volatility (rBergomi) — fractional Brownian motion via Cholesky (covariance C(i,j)=½(|i+1|^{2H}+|i-1|^{2H}-2|i|^{2H})), volatility v(t)=ξ₀·exp(η·W^H-½η²t^{2H}), Hurst exponent estimation from realized vol scaling, Monte Carlo simulation (50 paths), implied vol skew ψ(τ)~τ^{H-½}, rough (H<½) vs smooth (H>½)
- [x] Transfer Entropy — TE_{X→Y}=Σ p(y_{t+1},y_t^k,x_t^l)·log₂[p(y_{t+1}|y_t^k,x_t^l)/p(y_{t+1}|y_t^k)], non-linear Granger causality, k/l history orders, n-bin quantization, surrogate TE (shuffle test), effective TE (ETE=TE-TE_surrogate), directional vs net TE, multi-asset causality network
- [x] Graph Theory Network — correlation distance d=√(2(1-ρ)), Kruskal's MST (Mantegna's filtered tree), eigenvector centrality (power iteration), betweenness centrality (BFS shortest paths), clustering coefficient, degree centrality, correlation matrix heatmap, hub detection, circular layout visualization

## Phase 31 — Advanced Mathematical Models V7 [DONE]
- [x] Conditional Value at Risk (CVaR) — Historical VaR/CVaR, Cornish-Fisher VaR (skew+kurtosis adjusted), Entropic VaR (inf over z of (1/z)·log(E[exp(z·L)]/(1-α))), Rockafellar-Uryasev portfolio optimization (gradient descent, long-only), CVaR/VaR tail ratio, equal-weight vs optimized comparison
- [x] Non-Stationary Spectral Analysis — STFT with Hann window (X(t,f)=∫x(τ)w(τ-t)e^(-2πifτ)dτ), spectrogram |X(t,f)|², Morlet CWT (W(t,s)=(1/√s)∫x(τ)ψ*((τ-t)/s)dτ, ψ(t)=e^(iω₀t)e^(-t²/2)), scale→frequency mapping, dominant frequency over time, spectral entropy, Heisenberg uncertainty Δt·Δf≥1/(4π)
- [x] Random Matrix Theory — Marchenko-Pastur law (ρ(λ)=(Q/2π)√((λ₊-λ)(λ-λ₋))/λ, Q=T/N, λ±=(1/√Q±1)²), Jacobi eigendecomposition, noise eigenvalue filtering (λ∈[λ₋,λ₊]), cleaned correlation matrix (replace noise eigenvalues with average, renormalize), market mode (largest eigenvector), MP density curve
- [x] Bayesian Structural Time Series — state-space model (x_t=T·x_{t-1}+R·η_t, y_t=Z·x_t+ε_t), local linear trend (μ_t=μ_{t-1}+δ_{t-1}+η^μ, δ_t=δ_{t-1}+η^δ), seasonal component (dummy seasonal), Kalman filter (prediction→update cycle), log-likelihood optimization, 10-step forecast, trend/seasonal/residual decomposition
- [x] Topological Data Analysis — Takens embedding for point cloud, Vietoris-Rips complex filtration, persistence homology H₀ (connected components via Union-Find) and H₁ (loops via cycle detection), persistence diagrams (birth/death scatter), persistence barcodes, Betti numbers vs ε, topological complexity signal (simple/moderate/complex/cyclic)

## Phase 32 — Advanced Mathematical Models V8 [DONE]
- [x] Stochastic Differential Equations — Euler-Maruyama (X_{n+1}=X_n+μΔt+σ√Δt·Z) and Milstein (strong order 1.0, +½σσ'(Z²-1)Δt) schemes, GBM (dS=μSdt+σSdW), Ornstein-Uhlenbeck (dX=θ(μ-X)dt+σdW, mean-reverting), CIR (dX=κ(θ-X)dt+σ√X dW, positive), Heston (stochastic volatility, correlated Brownian motions), Merton Jump-Diffusion (Poisson jumps), parameter estimation from returns, percentile bands (P5/P25/P50/P75/P95)
- [x] Gaussian Mixture Model (EM) — p(x)=Σπ_k·N(x|μ_k,σ_k²), EM algorithm (E-step: γ(z_k)=π_k·N/Σ, M-step: update μ,σ²,π), K-means initialization, BIC/AIC model selection (BIC=-2L+k·log(N)), Shannon entropy convergence, regime clustering (Bull-Calm/Bull-Volatile/Bear-Calm/Bear-Volatile/Sideways), component density visualization
- [x] Wavelet Packet Decomposition — full binary tree DWT (W(j,2k)=low-pass, W(j,2k+1)=high-pass), Daubechies-4 wavelet (4-tap), best basis selection (Coifman-Wickerhauser, Shannon entropy minimization), energy heatmap, soft/hard thresholding (VisuShrink: σ·√(2·log(N))), detail vs approximation energy by level
- [x] Information Bottleneck — L=I(X;T)-β·I(T;Y) (rate-distortion trade-off), Blahut-Arimoto algorithm (self-consistent equations: p(t|x)=p(t)·exp(-β·D_KL)/Z, p(y|t)=Σp(y|x)p(x|t), p(t)=Σp(x)p(t|x)), rate-distortion curve (varying β), optimal signal compression, cluster-based prediction
- [x] Affine Arithmetic — affine form â=a₀+Σa_i·ε_i (ε_i∈[-1,1]), operations (add/mul/exp with Chebyshev min-max), correlation tracking (vs interval arithmetic dependency problem), robust Black-Scholes with uncertain volatility, uncertainty propagation chain, noise symbol tracking

## Phase 33 — Advanced Mathematical Models V9 [DONE]
- [x] Renormalization Group (Multi-Scale) — coarse-graining (n-tick aggregation), scaling hypothesis σ(λ)=λ^κ·σ(1), vol scaling exponent κ (κ<0.5 sub-diffusive, κ>0.5 super-diffusive, κ≈0.5 diffusive), RG flow g(n)=σ_n/√n, fixed point detection (β(g*)=0), correlation length ξ estimation, phase transition detection (kurtosis change), scale-invariant regime identification
- [x] Free Energy Principle (Active Inference) — variational free energy F=KL[q||p]-log p(o) (evidence bound), perception (minimize F via gradient descent on μ), policy selection (minimize expected free energy G=risk+ambiguity), precision weighting (1/σ² controls prediction error), HOLD/BUY/SELL action selection, prediction error visualization
- [x] Tensor Decomposition (CP/ALS) — CP decomposition T≈Σ_r λ_r·a_r∘b_r∘c_r, Alternating Least Squares (fix 2 factors, solve LS for 3rd), multi-way data (assets×time×features), factor matrices A (assets), B (time), C (features), reconstruction quality, latent factor analysis, dominant factor per asset
- [x] Compressed Sensing (Sparse Recovery) — measurement model y=Φx (m<n), OMP (Orthogonal Matching Pursuit: greedy support selection + LS), ISTA (Iterative Shrinkage-Thresholding: soft-threshold + gradient), DFT sparsifying basis, SNR computation, anomaly detection via large sparse coefficients, RIP condition m≥C·k·log(n/k)
- [x] Malliavin Calculus (Greeks) — integration by parts E[φ(F)·G]=E[φ'(F)·H], Malliavin weights for Delta (π^Δ=W_T/(S₀σT)·1_{S_T>K}), Vega (π^ν=(W_T²-T)/(2σT)-W_T/σ), Gamma, unbiased pathwise sensitivities (no bumping), convergence vs analytical Black-Scholes Greeks, standard error estimation

## Phase 34 — Advanced Mathematical Models V10 [DONE]
- [x] Hamiltonian Monte Carlo (HMC) — Hamiltonian H(q,p)=U(q)+K(p), U=-log posterior, leapfrog symplectic integrator (p_{½}=p-ε/2·∇U, q'=q+ε·M⁻¹·p_{½}, p'=p_{½}-ε/2·∇U), Metropolis acceptance α=min(1,exp(H-H')), Bayesian GARCH(1,1) posterior, trace plots, posterior CIs, persistence α+β analysis, acceptance rate optimization (~60-80%)
- [x] Reproducing Kernel Hilbert Space (RKHS) — kernel functions k(x,y)=<φ(x),φ(y)>_H (RBF, Laplacian), kernel PCA (eigendecomposition of centered kernel matrix), Maximum Mean Discrepancy MMD=||μ_P-μ_Q||_H (distribution comparison), Kernel Ridge Regression f(x)=Σα_i·k(x_i,x), α=(K+λI)⁻¹y, regime shift detection, non-linear feature space
- [x] Variational Autoencoder (VAE) — encoder q_φ(z|x)→N(μ,σ²), decoder p_θ(x|z)→N(μ_θ,σ²_θ), ELBO=E[log p(x|z)]-β·KL[q(z|x)||N(0,I)], reparameterization trick z=μ+σ·ε, KL closed form for Gaussians, β-VAE disentanglement, anomaly detection via reconstruction error, synthetic return generation
- [x] Schrödinger Bridge (Entropy-Regularized OT) — π*=argmin KL(π||π₀) s.t. marginals=p₀,p₁, Sinkhorn iterations (u=p/(Kv), v=q/(Kᵀu), K=exp(-C/ε)), transport plan heatmap, barycentric mapping, Wasserstein distance, entropy-regularized cost, sliding window distribution evolution, regime transition paths
- [x] Lie Group Symmetries — continuous symmetry groups (translation T_a, scaling D_λ, time τ_s, Galilean), Noether's theorem (symmetry→conserved quantity), symmetry breaking detection (variance of conserved quantities), Lie algebra generators (e₁=mean, e₂=std, e₃=Sharpe), regime change via symmetry breaking, conserved quantity tracking

## Phase 35 — Advanced Mathematical Models V11 [DONE]
- [x] Kolmogorov-Sinai Entropy (Chaos) — symbolic dynamics (n-symbol partition), block entropy H_n=-Σp(s_0...s_{n-1})·log₂p, KS entropy h_KS=lim(H_n-H_{n-1}), permutation entropy (ordinal patterns), sample entropy (complexity), largest Lyapunov exponent (Rosenstein's method, nearest-neighbor divergence), predictability horizon 1/h_KS, chaos vs noise classification
- [x] Persistent Homology Landscape — persistence diagram→landscape λ_k(t)=max(min(t-b,d-t),0) (piecewise linear), Lp norm ||λ||_p=(Σ_k∫|λ_k|^p dt)^(1/p), sliding window L2 norm for topological change detection, H₀ persistence via Union-Find, Takens embedding, topological shift detection (L2 > μ+2σ)
- [x] Fokker-Planck Equation (Density Evolution) — PDE ∂p/∂t=-∂/∂x[μ·p]+(1/2)·∂²/∂x²[σ²·p], finite difference explicit scheme, OU model dX=κ(θ-X)dt+σdW, GBM dX=μXdt+σXdW, stationary distribution N(θ,σ²/(2κ)), density evolution heatmap, VaR from forecast density, KL divergence between initial and forecast
- [x] Hopf Bifurcation Analysis — normal form ż=(μ+iω)z-β|z|²z, AR(2) fit x_t=a₁x_{t-1}+a₂x_{t-2}+ε, eigenvalues λ²-a₁λ-a₂=0, bifurcation parameter μ=|λ|_max-1, complex plane eigenvalue trajectory, unit circle crossing detection, regime classification (stable/bifurcation/limit cycle), oscillation frequency ω=arg(λ), amplitude A∝√μ
- [x] Cramér-Rao Lower Bound — Var(θ̂)≥1/I(θ), Fisher information I(θ)=-E[∂²/∂θ² log L], Gaussian: I(μ)=n/σ², I(σ²)=n/(2σ⁴), GARCH(1,1) Fisher matrix (numerical Hessian), 3×3 matrix inversion for CRLB, estimator efficiency eff=CRLB/Var, confidence intervals from CRLB, sample size planning, information content assessment

## Phase 36 — Advanced Mathematical Models V12 [DONE]
- [x] Wasserstein Barycenters (OT Fréchet Mean) — μ*=argmin Σ λ_i·W₂²(μ,μ_i), 1D barycenter via quantile averaging Q*(u)=Σ λ_i·Q_i(u), W₂ distance via quantile integral, Fréchet variance decomposition, multi-window distribution consensus, multi-asset cross-asset barycenter, comparison with Euclidean mean (tail preservation), pairwise W₂ distance matrix
- [x] Koopman Operator Theory (EDMD) — K:g(x_t)→g(x_{t+1}) (linear lifting of nonlinear dynamics), Extended DMD: K≈A·G⁻¹ with dictionary Ψ(x)=[1,x,x²,sin,cos], power iteration + deflation for eigenvalues, eigenvalue spectrum |λ|≤1 (stability), mode amplitudes, k-step forecast via K^k·Ψ(x_t), reconstruction MSE, persistent vs mean-reverting dynamics classification
- [x] Stochastic Optimal Control (HJB) — HJB: -V_t+ρV=max_u[L+μ·V_x+(1/2)σ²·V_xx], state dX=u·(μdt+σdW), utility G(x)=log(x), risk penalty L=u·μ·x-(γ/2)·u²·σ²·x², optimal policy u*=μ·x·(1+V_x)/(σ²x²(γ-V_xx)), backward Euler finite differences, value function V(x,t), policy function u*(x), position trajectory, Sharpe ratio
- [x] Rényi Entropy Dynamics — H_α=(1/(1-α))·log₂ Σ p_i^α, α→0: Hartley (support), α=1: Shannon, α=2: collision, α→∞: min-entropy, Tsallis entropy S_q=(1-Σp_i^q)/(q-1), generalized fractal dimensions D_α (multifractal spectrum), sliding window H_0/H_1/H_2/H_∞ tracking, concentration ratio H_∞/H_0, market efficiency
- [x] Pontryagin Maximum Principle — H=½κu²+λu²x+ηx²+p·u (Almgren-Chriss), optimal u*=-p/(κ+2λx), state x'=u (inventory), costate p'=-λu²-2ηx, BC: x(0)=X₀, x(T)=0, p(T)=0, shooting method (bisection on p(0)), TWAP comparison, immediate execution cost, savings %, shadow price trajectory

## Phase 37 — Advanced Mathematical Models V13 [DONE]
- [x] Burgers Equation (Shock Formation) — viscous Burgers PDE: du/dt + u·du/dx = v·d²u/dx², Hopf-Cole transform to heat equation, Lax-Friedrichs finite differences, shock detection (large negative gradients), spacetime diagram, energy dissipation E=(1/2)∫u²dx, inviscid limit v=0 (characteristics crossing), order flow shock prediction
- [x] Sobolev Space Regularization — W^{k,p} norm (k weak derivatives in Lp), Tikhonov in H^s: min ||y-f||² + λ||f||²_{H^s}, Matern kernel (s=1: 3/2, s=2: 5/2), representer theorem, L-curve (log residual vs log smoothness), corner = optimal λ, bias-variance trade-off, H¹ seminorm |f|_{H¹}=∫|f'|²dx, noise removal from volatility estimates
- [x] Ito Calculus Generator — infinitesimal generator A·f = μ·f'(x) + (1/2)σ²(x)·f''(x), Dynkin's formula E[f(X_t)]=f(x)+E[∫A·f ds], expected hitting time (A·T=-1, T(target)=0), stationary distribution (A·π=0), Feynman-Kac connection, OU/GBM/constant models, test functions (identity, square, exp, log, cosh)
- [x] Banach Fixed-Point Iteration — contraction mapping theorem (q<1 implies unique fixed point), best-response operator T_i(x)=argmax J_i(u_i,x_{-i}), Nash equilibrium x*=T(x*), spectral radius of Jacobian = contraction constant, geometric convergence ||e_n||≤q^n/(1-q)·||e_0||, phase space trajectory, momentum vs mean-reversion game
- [x] Cesaro Summability & Fejer Kernel — Cesaro mean σ_N=(1/(N+1))ΣS_n, Fejer kernel F_N=(1/(N+1))·(sin((N+1)x/2)/sin(x/2))²≥0, no Gibbs phenomenon (unlike partial sums), Fejer's theorem (σ_N→f uniformly), triangular weights (1-k/(N+1)), convolution smoothing, cycle detection via dominant frequency, detrended residual analysis

## Phase 38 — Advanced Mathematical Models V14 [DONE]
- [x] Girsanov Theorem (Measure Change) — dQ/dP=exp(-∫θdW-½∫θ²dt), θ=(μ_P-μ_Q)/σ (market price of risk), sliding window drift estimation, log-likelihood ratio test (LLR~χ²(1) under H0), cumulative measure change trajectory, regime classification (bullish/bearish/neutral), drift change detection (p<0.05)
- [x] Stone-Cech Compactification — β(X)=maximal compactification, e:X→[0,1]^C(X,R) (universal embedding), sigmoid feature maps (bounded continuous), k-means limit point detection, boundary proximity=regime transition, cluster occupation probabilities, feature trajectory over time
- [x] Malliavin-Stein Sensitivity — integration by parts on Wiener space, E[φ(F)·D_tF/||DF||²]=E[φ'(F)], Delta weight=Z/(S₀σ√T), Gamma weight=(Z²-1)/(S₀²σ²T), no finite-difference bias, variance efficiency comparison vs FD, Black-Scholes validation, strike sweep
- [x] Prokhorov Metric (Weak Convergence) — d_P(μ,ν)=inf{ε:μ(A)≤ν(A^ε)+ε}, metrizes weak convergence (μ_n→μ iff d_P→0), Prokhorov tube visualization, comparison with Wasserstein-1 and KS statistic, distribution shift detection, trend monitoring
- [x] Radon-Nikodym Derivative — dQ/dP=exp(Σlog(f_Q/f_P)) (likelihood ratio), Gaussian log-RN per point, KL divergence D_KL(P||Q)=E_P[log(dP/dQ)], LR test -2log(L)~χ²(k), Neyman-Pearson optimality, cumulative log-RN trajectory, regime change detection

## Phase 39 — Advanced Mathematical Models V15 [DONE]
- [x] Hahn Decomposition (Signal/Noise) — X=P∪N, μ(P)≥0, μ(N)≤0 (signed measure split), Jordan decomposition μ=μ⁺-μ⁻, total variation |μ|=μ⁺+μ⁻, histogram bins colored by signed measure, SNR=μ⁺/μ⁻ (signal-to-noise), rolling decomposition, overfitting outlier detection
- [x] Cameron-Martin Formula — d(μ_h)/d(μ)=exp(⟨h,x⟩-½||h||²) (Gaussian shift theorem), inner product ⟨h,x⟩=Σh_t·x_t/σ², Cameron-Martin space H_μ={h: μ_h≪μ}, shift modes (constant/linear/sinusoidal/mixed), cumulative log-RN trajectory, drift alignment detection
- [x] Arzelà-Ascoli Theorem — F relatively compact iff pointwise bounded + equicontinuous, modulus of continuity ω_f(δ)=sup|f(x)-f(y)| for |x-y|<δ, family modulus ω_F(δ)=sup_f ω_f(δ), equicontinuity check (ω→0), overfitting detection via non-equicontinuous indicator outliers
- [x] Riesz Representation — L(f)=⟨f,u⟩ for unique u∈H, ||L||=||u|| (norm equality), representer u=(K+λI)⁻¹·L (regularized), feature importance via |u_i| (Riesz weights), momentum (u>0) vs reversal (u<0), correlation with actual returns, dominant lag detection
- [x] Lax-Milgram Theorem — a(u,v)=L(v) has unique solution iff a is bounded (|a(u,v)|≤C||u||||v||) + coercive (a(u,u)≥α||u||²), FEM with linear hat functions, tridiagonal system (Thomas algorithm), bilinear form a(u,v)=ε∫u'v'+b∫u'v+c∫uv, epsilon sweep, coercivity/boundedness verification

## Code Quality Audit — Completed
- [x] Added missing calcMACD function to indicators.js (was imported but undefined)
- [x] Removed dead code in calcADX (empty loop body doing nothing)
- [x] Fixed calcVWAPMACD vwEMA logic (dead code overwritten immediately)
- [x] Fixed division-by-zero guards in VolatilitySurface, RiskParityCalculator, TrailingStopCalculator
- [x] Fixed hook order anti-pattern in App.jsx (chartCandles/currentPrice used before definition — TDZ)
- [x] Removed unused imports across 5 new components (Activity, formatPrice, Shuffle, TrendingUp, TrendingDown)
- [x] Kleppmann audit passed: WebSocket exponential backoff, JSON parse try/catch, state sync on reconnect, candle dedup via Map, 500-candle memory cap, localStorage try/catch everywhere

## Architecture Milestones
- [x] Panel registry system (191+ panels, replaces manual imports in App.jsx)
- [x] PanelContainer with collapsible categories + localStorage visibility
- [x] ErrorBoundary + Suspense per panel (triple protection)
- [x] VirtualList for long lists (FillsPanel, SignalFeed)
- [x] ARCHITECTURE_ROADMAP.md (5-20 year sustainability plan)
- [x] Kleppmann audit: data corruption fix, exponential backoff, error logging (see AUDIT_2025.md)
- [x] V2 C++ signal engine with sub-millisecond latency (Phase 25)
- [x] 75+ advanced math model components (Phases 24-39)
- [x] CI/CD pipeline (GitHub Actions: 4 jobs)
- [x] WebSocket compression (per-message deflate)
- [x] Config hot-reload
- [x] Timestamped logging + CSV trade logs with symlinks
- [x] Mock mode for standalone Web UI demo
- [x] ESLint + Vitest setup
- [x] Netlify deployment configuration
- [ ] Component subfolder organization (order-flow, technical, risk, etc.)
- [ ] TypeScript migration (incremental, file-by-file)
- [ ] React.lazy + Suspense for all 191+ panels (full code splitting)
- [ ] Playwright E2E tests
- [ ] Zustand global state store
- [ ] Message schema versioning (WS protocol v2)
- [ ] PostgreSQL migration for persistent data
- [ ] Prometheus + Grafana monitoring
- [ ] Consolidate duplicate journal systems (useTradeJournal + TradeJournal)
- [ ] Refactor useDetachablePanels (replace inline HTML popup)
