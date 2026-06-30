# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.1.0] — Phase 40: Documentation & Infrastructure Update

### Added
- Comprehensive README.md rewrite as portfolio showcase with badges, Mermaid architecture diagram, categorized features, benchmarks table, and updated project structure
- `run_logger.py` — shared timestamped Python logging module with `_latest.log` symlink
- `trade_csv_logger.py` — shared CSV trade logging module with `_latest.csv` symlink
- Timestamped log files for all services: `logs/<service>_YYYYMMDD_HHMMSS.log`
- CSV trade logging: every fill, SL/TP close, and arbitrage execution logged to `logs/trades_YYYYMMDD_HHMMSS.csv`
- `web-ui/netlify.toml` — Netlify deployment configuration with redirects and security headers
- `VITE_MOCK_MODE` environment variable for standalone Web UI demo without backend
- CI/CD log artifacts: GitHub Actions uploads log files as artifacts after each run
- Makefile `logs` target to view latest log files for all services
- Makefile `test-js` target for JS tests with coverage
- ESLint configuration for web-ui (`.eslintrc.json`)
- CI dependency audit job

### Changed
- HFT logger updated to generate timestamped filenames with `_latest.log` pointer
- CI workflow: excluded `fix/` from clang-format, added log artifact uploads, added lint to test-js job
- Makefile: added `test-js`, `logs`, JS lint, coverage cleanup
- `.gitignore`: added CSV files, logs directory, trade logs, coverage, reorganize scripts
- `web-ui/.env.example`: added `VITE_MOCK_MODE` documentation
- LICENSE changed from MIT to Apache 2.0 (educational purpose, attribution required)

### Fixed
- CI: clang-format failure on `fix/` directory (now excluded)
- CI: missing log artifact uploads for Python and C++ test runs

---

## [2.0.0] — Phase 25: HFT Trade Bot v2.0.0

### Added — C++20 HFT Engine V2

#### Latency Optimization Infrastructure
- `Spinlock` with `_mm_pause` for sub-microsecond critical sections
- `SPSCQueue<T, Capacity>` — lock-free single-producer single-consumer ring buffer
- `ObjectPool<T, PoolSize>` — pre-allocated object pool, no heap allocations in hot path
- `LatencyHistogram` — 35 microsecond-buckets, P50/P95/P99/P99.9 tracking
- `ScopedLatency` — RAII timer with microsecond precision
- `ThreadAffinity` — pin thread to CPU core, set real-time priority
- `CircuitBreaker` — 5 errors triggers 30s cooldown, half-open probe recovery
- `RetryPolicy` — exponential backoff (3 attempts, 500ms x 2^n, 0-30% jitter)
- Cache-line aligned structs (`alignas(64)`): `AlignedOrderBookLevel`, `FastSignal`, `FastOrder`, `PressureResult`, `RoutingDecision`
- CMake flags: `-O3`, `-flto` (LTO), `-msse4.2`, `-ffast-math`, `-finline-functions`

#### Signal Engine V2
- `InlineEMA` — O(1) per update, no vector allocation
- `InlineRSI` — Wilder's smoothing, O(1) per update
- `InlineADX` — trend strength (0-100), Wilder's smoothing
- `InlineVWAP` — running cumulative VWAP with deviation calculation
- `SignalEngineV2` — 6-indicator weighted composite: EMA(21/50) 0.25, RSI(14) 0.15, OBI 0.20, VWAP deviation 0.10, ADX(14) 0.10, Pressure 0.20
- Dynamic leverage: confidence >= 85 + ADX > 30 -> 5x, >= 75 -> 3x, else 1x
- Configurable cooldown between signals (default 5000ms)
- No heap allocations in signal generation path

#### Pressure Model
- Multi-level OBI: 5/10/20 levels + distance-weighted OBI (linear decay)
- Trade flow imbalance: buyer vs seller initiated volume ratio
- Toxicity detection: large aggressive orders -> toxic score [0,1]
- Queue position estimation at best bid/ask
- Spread regime: TIGHT (<1bp) / NORMAL (1-5bp) / WIDE (>5bp)
- Price impact prediction (bps)
- Microprice deviation from mid (bps)

#### Smart Order Router V2
- `IExchange` interface (DIP/SOLID)
- `ExchangeBase` with EMA latency tracking + toxic event counting
- 5 routing strategies: BestPrice, LowestLatency, LowestFees, BestEffective, DepthAware
- Per-exchange latency tracking (running EMA, microseconds)
- Anti-toxic backoff: skip exchanges with >= 5 toxic events
- Depth-aware routing: penalize exchanges with insufficient depth

#### Adaptive Order Type Selector V2
- Dynamic IOC/FOK/GTD/PostOnly based on confidence, spread, OBI, toxicity
- Emergency (conf >= 95) -> FOK
- Toxic (score >= 0.5) -> IOC
- High confidence + tight spread -> IOC
- Large order vs thin depth -> GTD
- Low confidence + wide spread -> PostOnly
- Exchange-specific mappings: Binance, OKX, Bybit

#### Test Suite
- `test_signal_engine_v2.cpp` — 30+ tests covering all V2 components

#### New Files
- `src/utils/low_latency.h`
- `src/data/aligned_types.h`
- `src/strategies/signal_engine_v2.h`
- `src/strategies/pressure_model.h`
- `src/execution/smart_order_router_v2.h`
- `src/execution/adaptive_order_selector_v2.h`
- `tests/test_signal_engine_v2.cpp`

### Changed
- `config.h` / `config.cpp` — 20+ new V2 config parameters
- `config.yaml` — full V2 configuration sections
- `main.cpp` — V2.0.0 with integrated SignalEngineV2, PressureModel, SmartOrderRouterV2, AdaptiveOrderSelectorV2
- Latency histograms for signal/risk/exec/loop phases
- Graceful shutdown: cancel all open positions before exit
- V1 fallback engine preserved (configurable via `signal_engine_v2_enabled`)
- `CMakeLists.txt` — v2.0.0, LTO, -O3, simdjson optional, V2 test target

---

## [1.9.0] — Phases 26-39: Advanced Mathematical Models V2-V15

### Added — 65+ Advanced Math Model Components

#### Phase 26 (V2) — 6 components
- Ehlers SuperSmoother (2-pole super smoother, Roofing Filter, MAMA/FAMA via Hilbert Transform)
- Bayesian Price Predictor (Beta-Binomial, Normal-Inverse-Gamma, BOCPD, Bayesian Ridge)
- Almgren-Chriss Optimal Execution (implementation shortfall, efficient frontier)
- Wavelet Decomposition (Haar/Daubechies DWT, MRA, soft-thresholding denoising)
- K-Means Market Clustering (K-Means++, Lloyd's algorithm, silhouette score)
- Copula Dependency Model (Clayton, Gumbel, Gaussian, Student-t)

#### Phase 27 (V3) — 5 components
- Hidden Markov Model (Baum-Welch EM, Viterbi decoding, forward-backward)
- Principal Component Analysis (Jacobi eigenvalue, eigenportfolios, scree plot)
- Optimal Stopping (Snell envelope, Longstaff-Schwartz Monte Carlo)
- Isolation Forest (anomaly scoring, random isolation trees, feature importance)
- Variational Mode Decomposition (ADMM-based, FFT/IFFT, center frequency convergence)

#### Phase 28 (V4) — 5 components
- Empirical Mode Decomposition + Hilbert-Huang Transform (sifting, cubic spline, instantaneous frequency)
- Support Vector Machine (Linear SVM via SGD, RBF SVM via SMO)
- Black-Litterman Portfolio Allocation (equilibrium returns, investor views, posterior)
- Hawkes Process (self-exciting conditional intensity, MLE, Ogata's thinning)
- Dynamic Time Warping (Sakoe-Chiba band, 8 template patterns, warping path)

#### Phase 29 (V5) — 5 components
- LSTM Recurrent Neural Network (BPTT with 5-step truncation, Xavier init)
- Kelly Criterion Portfolio Sizing (multi-asset, Monte Carlo, growth curves)
- Gaussian Process Regression (RBF/Matern/Periodic kernels, Cholesky, hyperparameter optimization)
- Markov-Switching GARCH (Hamilton filter, Kim's smoothing, per-regime GARCH)
- Empirical Dynamic Modeling (Takens' embedding, simplex projection, CCM causality)

#### Phase 30 (V6) — 5 components
- Autoencoder (encoder/decoder, backprop, L2 regularization, anomaly detection)
- Optimal Transport (W1/W2 Wasserstein, Sinkhorn algorithm, KS statistic)
- Rough Volatility (fBm via Cholesky, rBergomi model, Hurst estimation)
- Transfer Entropy (information-theoretic causality, surrogate TE, effective TE)
- Graph Theory Network (Kruskal's MST, eigenvector/betweenness centrality, clustering coefficient)

#### Phase 31 (V7) — 5 components
- Conditional Value at Risk (historical VaR, Cornish-Fisher, entropic VaR, Rockafellar-Uryasev)
- Non-Stationary Spectral Analysis (STFT, CWT, spectrogram, Morlet wavelet)
- Random Matrix Theory (Marchenko-Pastur law, eigenvalue cleaning, market mode)
- Bayesian Structural Time Series (state-space, Kalman filter, trend/seasonal decomposition)
- Topological Data Analysis (Vietoris-Rips, persistence homology, Betti numbers, diagrams)

#### Phase 32 (V8) — 5 components
- Stochastic Differential Equations (Euler-Maruyama, Milstein, GBM/OU/CIR/Heston/Merton)
- Gaussian Mixture Model (EM, BIC/AIC, regime clustering)
- Wavelet Packet Decomposition (Daubechies-4, Coifman-Wickerhauser best basis, thresholding)
- Information Bottleneck (Blahut-Arimoto, rate-distortion curve)
- Affine Arithmetic (Chebyshev approximation, robust Black-Scholes, uncertainty propagation)

#### Phase 33 (V9) — 5 components
- Renormalization Group (multi-scale coarse-graining, scaling exponents, fixed points)
- Free Energy Principle (variational free energy, active inference, policy selection)
- Tensor Decomposition (CP/ALS, multi-way factor analysis)
- Compressed Sensing (OMP, ISTA, sparse recovery, anomaly detection)
- Malliavin Calculus (integration by parts Greeks, unbiased pathwise sensitivities)

#### Phase 34 (V10) — 5 components
- Hamiltonian Monte Carlo (leapfrog, Metropolis, Bayesian GARCH posterior)
- Reproducing Kernel Hilbert Space (RBF/Laplacian kernels, KPCA, MMD, KRR)
- Variational Autoencoder (encoder/decoder, ELBO, reparameterization, beta-VAE)
- Schrodinger Bridge (entropy-regularized OT, Sinkhorn, barycentric mapping)
- Lie Group Symmetries (Noether's theorem, symmetry breaking, Lie algebra generators)

#### Phase 35 (V11) — 5 components
- Kolmogorov-Sinai Entropy (symbolic dynamics, permutation entropy, Lyapunov exponent)
- Persistent Homology Landscape (landscape functions, L2 norm, topological change detection)
- Fokker-Planck Equation (finite difference PDE solver, density evolution, VaR from forecast)
- Hopf Bifurcation Analysis (AR(2) eigenvalues, complex plane, limit cycle detection)
- Cramer-Rao Lower Bound (Fisher information, CRLB, estimator efficiency, sample size planning)

#### Phase 36 (V12) — 5 components
- Wasserstein Barycenters (OT Frechet mean, quantile averaging, multi-asset consensus)
- Koopman Operator Theory (EDMD, eigenvalues, k-step forecast)
- Stochastic Optimal Control (HJB equation, backward Euler, optimal policy)
- Renyi Entropy Dynamics (Renyi spectrum, Tsallis entropy, multifractal dimensions)
- Pontryagin Maximum Principle (optimal execution, shooting method, TWAP comparison)

#### Phase 37 (V13) — 5 components
- Burgers Equation (viscous Burgers PDE, Hopf-Cole transform, shock formation)
- Sobolev Space Regularization (Tikhonov, Matern kernel, L-curve)
- Ito Calculus Generator (infinitesimal generator, Dynkin's formula, hitting time)
- Banach Fixed-Point Iteration (contraction mapping, Nash equilibrium, convergence)
- Cesaro/Fejer Kernel (Cesaro mean, Fejer kernel, no Gibbs phenomenon)

#### Phase 38 (V14) — 5 components
- Girsanov Theorem (measure change, Radon-Nikodym derivative, drift detection)
- Stone-Cech Compactification (universal embedding, regime limit points)
- Malliavin-Stein Sensitivity (IBP Greeks, variance efficiency vs finite difference)
- Prokhorov Metric (weak convergence, distribution shift detection)
- Radon-Nikodym Derivative (likelihood ratio, KL divergence, regime change)

#### Phase 39 (V15) — 5 components
- Hahn Decomposition (signed measure, Jordan decomposition, SNR)
- Cameron-Martin Formula (Gaussian shift theorem, drift alignment)
- Arzela-Ascoli Theorem (equicontinuity, modulus of continuity, overfitting detection)
- Riesz Representation (linear functional, representer theorem, feature importance)
- Lax-Milgram Theorem (variational PDE, FEM, coercivity/boundedness)

### Registry Growth
- Phase 26: 136 component files, ~126 registered panels
- Phase 27: 141 component files, ~131 registered panels
- Phase 28: 146 component files, ~136 registered panels
- Phase 29: 151 component files, ~141 registered panels
- Phase 30: 156 component files, ~146 registered panels
- Phase 31: 161 component files, ~151 registered panels
- Phase 32: 166 component files, ~156 registered panels
- Phase 33: 171 component files, ~161 registered panels
- Phase 34: 176 component files, ~166 registered panels
- Phase 35: 181 component files, ~171 registered panels
- Phase 36: 186 component files, ~176 registered panels
- Phase 37: 191 component files, ~181 registered panels
- Phase 38: 196 component files, ~186 registered panels
- Phase 39: 201 component files, ~191 registered panels

---

## [1.3.0] — Phases 17-24: Composite Indicators, Audits, CLI Monitors, Math Models V1

### Added — Phase 17: Advanced Composite Indicators
- Composite Signal Dashboard (10 indicators, strength-weighted scoring)
- Signal Confidence Scorer (8-factor confidence model)
- Regime Adaptive Strategy (5 regimes, position sizing guidance)
- Cross-Market Divergence (BTC dominance, ETH/BTC ratio, pair divergence)
- Performance Attribution (P&L by side/symbol/strategy/hour/day)
- Price Action Score (10 candlestick pattern scores, composite 0-100)

### Added — Phase 18: New Indicators + Audit Round 2
- Tick Speed Anomaly Detector
- Put/Call Ratio Simulator
- Correlation Heatmap (visual SVG matrix)
- Signal Matrix Heatmap (8 indicators x N symbols)
- MIT Order Simulator

### Added — Phase 19: Execution Analytics + Audit Round 3
- Slippage Simulator (4 models: linear, square-root, constant, volume-based)
- Order Flow Heatmap (aggregated per-candle, absorption/momentum detection)

### Added — Phase 20: Advanced Features + Lazy Loading
- Market Depth Replay (L2 orderbook reconstruction, timeline scrubber)
- Indicator Formula Parser (tokenizer + AST evaluator)
- React.lazy + Suspense wrapper in PanelContainer

### Added — Phase 21: Error Boundaries + Audit Round 4
- PanelErrorBoundary (class component with retry button)
- Integrated into PanelContainer (ErrorBoundary + Suspense per panel)

### Added — Phase 22: List Virtualization + Audit Round 5
- VirtualList component (generic windowed list renderer with overscan)
- Applied to FillsPanel and SignalFeed

### Added — Phase 23: CLI Monitor Windows
- `ai-signal-bot/monitor.py` — live signal feed, bot log tail, signal history
- `hft-trade-bot/monitor.py` — C++ process status, color-coded log tail
- `error_monitor.py` — unified error+warning viewer across all services
- `price_monitor.py` — dual WS connection, live prices + signals + fills
- `start.bat` / `start.sh` updated to 8 windows (4 services + 4 monitors)

### Added — Phase 24: Advanced Mathematical Models V1 (6 components)
- GARCHVolatility (GARCH(1,1) MLE, EWMA, Parkinson, regime classification)
- CointegrationScanner (Engle-Granger 2-step, ADF test, z-score signals)
- MarkovRegimePredictor (6-state Markov chain, stationary distribution)
- FractalAnalyzer (Hurst exponent R/S, DFA, fractal dimension, ACF)
- KalmanFilterPrice (1D/2D Kalman filter, adaptive gain, velocity)
- SpectralAnalysis (Welch PSD, DFT, spectral entropy, noise classification)

### Fixed — Phases 17-22
- Missing `calcMACD` in indicators.js
- Dead code in `calcADX` (empty loop) and `calcVWAPMACD` (overwritten result)
- Division-by-zero guards in VolatilitySurface, RiskParityCalculator, TrailingStopCalculator
- Hook order anti-pattern in App.jsx (TDZ: chartCandles/currentPrice used before definition)
- Unused imports across 5 components
- `useMemo` with side effects in StrategyBuilder, SessionStats, TradeReplay
- Interval leak in TradeReplay (useMemo -> useEffect for setInterval)
- Dead `customIndicators` state in App.jsx
- Null safety in registry.js `ob()` helper

---

## [1.2.0] — Phases 13-16: GitHub-Ready Release, Indicators, Risk Manager, Backtest Runner

### Added — Phase 13: GitHub-Ready Release
- 4 CI jobs: Python tests + lint, C++ build + tests, Web UI build, Docker build
- pip caching for Python jobs, npm caching for Web UI job
- Strict tests (no `|| true`) — failures block merge
- GitHub issue templates (bug report, feature request)
- GitHub pull request template
- Docker healthchecks for exchange simulator and AI signal bot
- README badges, 4-component description, Docker quick start

### Added — Phase 14: Indicators, Risk Manager, Real Order Books
- Chart indicators: EMA 9/21/50, Bollinger Bands, RSI 14 (toggle on/off)
- `src/risk/risk_manager.py` — RiskManager with trailing stop, breakeven, partial TP, max hold time
- Real order book snapshots broadcast via WebSocket
- OrderBook component uses real data with synthetic fallback
- 20 risk manager unit tests

### Added — Phase 15: Performance Dashboard
- `utils/performance.js` — aggregate metrics, equity curve, drawdown calculator
- `PerformanceDashboard.jsx` — summary cards, per-exchange breakdown, equity curve, drawdown chart
- Signal statistics (total, long, short counts)

### Added — Phase 16: Backtest Runner
- AI Signal Bot: backtest WebSocket endpoint (`run_backtest` messages)
- `BacktestRunner.jsx` — config form, equity curve chart, strategy comparison table
- `useSignalData` hook updated: handles `backtest_result`, exposes `sendSignalMessage`

### Fixed — Phase 13
- EnsembleVoter created with empty strategies list when only "ensemble" selected
- web-ui/.gitignore missing .env (would commit secrets)
- BacktestRunner no timeout — added 30s safety timeout
- `BacktestResult.total_trades` not being set in `run()`

---

## [1.1.0] — Phases 5-12: Broadcasting, Arbitrage, Tests, Backtesting, Web UI

### Added — Phase 5: Signal Broadcasting, Equity Sparkline, Backtesting
- SignalPublisher WebSocket server (port 8766) in AI bot
- Broadcast validated signals to connected HFT clients
- C++ SignalReceiver handles signal, signal_history, market_regime messages
- HFT main.cpp: dual WebSocket connections (8765 + 8766)
- Equity curve sparkline in visualizer (per exchange, 80 points)
- Backtester engine with position simulation, SL/TP, fee/slippage modeling
- Performance metrics: return, win rate, profit factor, Sharpe, max drawdown
- `run_backtest.py` CLI runner

### Added — Phase 6: Arbitrage Detection & Drawdown Analysis
- ArbitrageDetector class scanning all exchange order books
- Net spread calculation (after fees + slippage)
- WebSocket broadcast of arbitrage opportunities
- C++ SignalReceiver handles `arbitrage_scan` messages
- Drawdown analysis: longest duration, average, recovery factor, Calmar ratio

### Added — Phase 7: C++ Tests & Integration Tests
- 25 C++ signal engine unit tests (FFT, EMA, RSI, OBI, VWAP, Pressure, SignalEngine)
- CMake test target with `enable_testing()` and `ctest`
- Python integration tests (WebSocket, candle data, strategy pipeline, SignalPublisher)

### Added — Phase 8: Arbitrage Execution & Protocol Docs
- `execute_arbitrage()` in OrderExecutor (buy + sell simultaneously)
- ArbitrageCallback in SignalReceiver (triggers on spread > 10 bps)
- WebSocket Protocol documentation (full message spec for ports 8765 and 8766)

### Added — Phase 9: Visualization, Optimization & Kelly Sizing
- BacktestPlotter with 4 chart types (equity curve, PnL distribution, comparison, radar)
- StrategyOptimizer with grid search, 4 fitness functions, walk-forward optimization
- KellyPositionSizer with configurable Kelly fraction, confidence-scaled sizing

### Added — Phase 10: Data Export, Config Validation & Docs
- DataExporter module (CSV/Parquet: candles, orders, accounts, positions)
- Python `config_validator.py` with comprehensive validation
- C++ `validate_config()` with range checks for all parameters
- Full CONTRIBUTING.md

### Added — Phase 11: Order Book Replay & Linting
- OrderBookReplay — synthetic order book generation from OHLCV candles
- OrderBookBacktester — wraps standard Backtester with order book data
- Ruff linting configuration for both Python components
- 22 unit tests for order book replay

### Added — Phase 12: Web UI Dashboard
- React 18 + Vite 5 + TailwindCSS 3 (dark theme)
- TradingView-style candle charts (lightweight-charts 4)
- Binance-style order book with depth visualization
- Order form: market/limit, SL/TP, live notional
- Account, positions, signal feed, arbitrage, fills panels
- WebSocket auto-reconnect with live status indicators
- Docker support (port 3000, multi-stage build with nginx)

### Changed — Phase 5
- AI Signal Bot pipeline updated from 7-stage to 8-stage
- docker-compose: port 8766 exposed, hft depends on ai-signal-bot

---

## [1.0.0] — Phases 1-4: Core Architecture

### Added — Phase 1: Core Architecture

#### Exchange Simulator (Python)
- Geometric Brownian Motion price generation with per-symbol volatility
- 3 simulated exchanges (Binance, Bybit, OKX) with different fee structures
- 3 trading pairs: BTC/USDT, ETH/USDT, SOL/USDT
- Simulated order book with 20 depth levels, decay-based liquidity
- Market and limit order matching engine with slippage simulation
- Account simulation with balance, positions, PnL, win rate
- Multi-exchange arbitrage detection with WebSocket broadcast
- Terminal visualizer with ASCII candle charts, RSI, MACD, Bollinger Bands
- WebSocket server streaming market data (port 8765)
- Config validation module with comprehensive error checking
- Reproducible mode (configurable random seed)

#### AI Signal Bot (Python)
- 7-stage signal generation pipeline
- Technical indicators: RSI, EMA, SMA, MACD, Bollinger Bands, ATR, ADX, VWAP
- Trend Following strategy (EMA crossover + ADX filter)
- Mean Reversion strategy (RSI extremes + Bollinger Bands)
- Ensemble Voter (majority or confidence-weighted)
- Signal validation with risk checks (confidence, R:R, drawdown, position limits)
- SQLite database for signals, trades, and equity curve
- CSV logging for signals and trades
- Terminal dashboard with performance metrics

#### HFT Trade Bot (C++20)
- HFT Signal Engine (6 indicators): EMA crossover, OBI, VWAP deviation, Price Pressure, FFT spectral trend, FFT smoothed direction
- Smart order type selector (market vs limit based on spread and confidence)
- Thread-safe position manager with automatic SL/TP monitoring
- Pre-trade risk manager with position sizing
- WebSocket client for market data and order execution
- spdlog for high-performance logging

#### Infrastructure
- Docker Compose orchestration (3 services)
- shared_config.yaml
- .gitignore, LICENSE (MIT)
- README.md, docs/ARCHITECTURE.md, docs/TRADING_STRATEGIES.md, docs/EXCHANGE_SIMULATOR.md, docs/SETUP.md

### Added — Phase 2: Enhanced Visualizer
- Tabbed terminal interface (BTC/ETH/SOL tabs, 1-2-3 keys)
- Per-tab candle chart with ASCII art (color-coded bullish/bearish)
- Per-tab order book depth visualization (10 levels bid/ask)
- Account dashboard tab (balance, equity, PnL, positions, win rate)
- Arrow key navigation, cross-platform input (Windows msvcrt + Unix termios)

### Added — Phase 3: Tests & CI
- Unit tests for indicators (SMA, EMA, RSI, MACD, BB, ATR, VWAP)
- Unit tests for strategies (Trend Following, Mean Reversion, Ensemble)
- Unit tests for signal validator and exchange simulator
- GitHub Actions workflow (Python lint + test, C++ build)
- .dockerignore files for all components
- CONTRIBUTING.md

### Added — Phase 4: FFT Analysis & TradingView-style Visualizer
- Cooley-Tukey FFT implementation (radix-2, zero-padded)
- Power spectrum computation with Hann window
- Dominant cycle detection, spectral entropy, spectral trend score
- FFT low-pass filter for price smoothing
- FFT Cycle Strategy (regime-based: TRENDING/RANGING/MIXED)
- C++ FFT integration (2 additional votes in SignalEngine, 6 total, threshold 3)
- Enhanced visualizer: RSI mini-chart, MACD histogram, Bollinger Bands position, FFT regime detection

### Security
- No secrets or API keys committed
- Only localhost WebSocket URLs in configuration
- .gitignore covers all sensitive paths (env files, databases, build artifacts)
