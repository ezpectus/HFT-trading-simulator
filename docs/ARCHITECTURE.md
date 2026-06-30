# Architecture

## Overview

The system is a full-stack crypto HFT trading simulation platform consisting of four independent components communicating over WebSocket. It has evolved through 40 development phases to include a C++20 sub-millisecond signal engine, 201+ React components, 191+ registered UI panels, 75+ advanced mathematical models, and production-grade infrastructure.

```mermaid
graph TB
    subgraph "Exchange Simulator (Python)"
        ES[Exchange Simulator<br/>GBM + Fat-Tail + Jump Diffusion<br/>3 Exchanges | 3 Symbols<br/>Order Book | Funding | Liquidation]
        WS8765[WebSocket :8765]
        WS8765 --- ES
    end

    subgraph "AI Signal Bot (Python)"
        AI[AI Signal Bot<br/>8-Stage Pipeline<br/>Trend + MeanRev + FFT + Ensemble<br/>Risk Manager | Backtest Engine<br/>SQLite | Kelly Sizing]
        WS8766[Signal Publisher :8766]
        WS8766 --- AI
    end

    subgraph "HFT Trade Bot (C++20 v2.0)"
        HFT[HFT Trade Bot v2.0<br/>Signal Engine V2 (6 indicators)<br/>Pressure Model | Smart Order Router V2<br/>Adaptive Order Selector V2<br/>Latency Histograms | Circuit Breaker<br/>SHM IPC | FIX 4.4 Protocol]
        HFT --- WS8765
        HFT --- WS8766
        HFT -->|Orders| WS8765
    end

    subgraph "Web UI (React 18)"
        UI[Web UI Dashboard<br/>201+ Components | 191+ Panels<br/>75+ Math Models | 7 Categories<br/>VirtualList | ErrorBoundary<br/>Mock Mode | PWA-Ready]
        UI --- WS8765
        UI --- WS8766
        UI -->|Orders| WS8765
        UI -->|Backtest| WS8766
    end

    ES -->|Candles + OrderBook| AI
    ES -->|Candles + OrderBook| HFT
    ES -->|Candles + Prices + Accounts| UI
    AI -->|Signals + Regime| HFT
    AI -->|Signals + Backtest Results| UI
```

## Components

### 1. Exchange Simulator (`exchange-simulator/`)

**Language:** Python 3.12+
**Role:** Simulates 3 crypto exchanges with realistic market microstructure

| Feature | Implementation |
|---------|---------------|
| Price generation | GBM with per-symbol volatility, fat-tail jumps, news event spikes |
| Exchanges | Binance, Bybit, OKX (different fees, slippage, volatility multipliers) |
| Symbols | BTC/USDT, ETH/USDT, SOL/USDT |
| Order book | 20 levels per side, decay-based liquidity, real-time depth |
| Order matching | Market and limit orders with slippage, partial fills, market impact |
| Account | Balance, positions, PnL, win rate, margin, leverage |
| Arbitrage | Multi-exchange spread detection, auto-execution, WebSocket broadcast |
| Funding rates | Per-exchange, charged every 8h equivalent (96 candles) |
| Liquidation | Auto-close when margin < maintenance level |
| News events | Sudden volatility spikes with directional bias |
| Config hot-reload | Change volatility/fees without restart |
| Simulation speed | Pause / 1x / 2x / 5x via WebSocket command |
| Data export | CSV and Parquet formats (candles, orders, accounts, positions) |
| CSV trade logging | Every fill, SL/TP close, arbitrage execution logged to timestamped CSV |
| Timestamped logging | Per-run log files in `logs/` with `_latest.log` symlink |
| Visualizer | Terminal-based candle charts, RSI, MACD, BB, FFT regime, equity sparkline |
| Data feed | WebSocket server streaming candles, order books, accounts, fills |

**Key files:**
- `market_simulator.py` — GBM price engine with volatility multipliers
- `exchange.py` — Order matching, account management, slippage, market impact
- `visualizer.py` — Terminal dashboard with ASCII charts and sparklines
- `websocket_server.py` — WebSocket data feed, arbitrage auto-execution, CSV trade logging
- `models.py` — Data structures (Candle, Order, Position, Account, ClosedTrade)
- `arbitrage.py` — Multi-exchange arbitrage detection
- `config_validator.py` — Config validation with comprehensive error checking
- `data_export.py` — CSV/Parquet data export
- `__main__.py` — Entry point with timestamped logging via `run_logger.py`

### 2. AI Signal Bot (`ai-signal-bot/`)

**Language:** Python 3.12+
**Role:** Analyzes market data and generates trading signals with risk management

**Pipeline (8 stages):**

1. **Data Collection** — Receives candle + order book data via WebSocket
2. **Technical Analysis** — Computes RSI, EMA, SMA, MACD, Bollinger Bands, ATR, ADX, VWAP
3. **Trend Following** — EMA crossover + ADX strength filter
4. **Mean Reversion** — RSI extremes + Bollinger Band touches
5. **FFT Cycle Strategy** — Spectral analysis, cycle detection, regime classification (TRENDING/RANGING/MIXED)
6. **Ensemble Voter** — Majority or confidence-weighted voting (3 strategies)
7. **Signal Validation** — Confidence, R:R ratio, drawdown, position limits
8. **Order Execution** — Sends orders to exchange simulator

**Additional features:**
- Risk Manager: trailing stop (fixed % or ATR-based), breakeven moves, partial take profit, max hold time
- Backtesting engine with fee/slippage modeling, drawdown analysis, Calmar ratio
- Strategy parameter optimization with grid search and walk-forward validation
- Kelly Criterion position sizing (half-Kelly default, confidence-scaled)
- Order book replay for backtesting OBI/pressure strategies
- Backtest WebSocket endpoint (run backtests from Web UI)
- CSV logging for signals and trades
- Timestamped file logging via `run_logger.py`
- CLI monitor script (`monitor.py`) for live signal feed

**Key files:**
- `src/technical_analysis/indicators.py` — All TA indicators
- `src/strategies/strategies.py` — Trend following, mean reversion, ensemble
- `src/strategies/fft_strategy.py` — FFT cycle detection and regime classification
- `src/signal_validation/validator.py` — Risk-based signal filtering
- `src/communication/ws_client.py` — WebSocket client for exchange
- `src/communication/signal_publisher.py` — WebSocket server for signals + backtest endpoint
- `src/database/db.py` — SQLite storage (WAL mode)
- `src/monitoring/tracker.py` — Performance tracking and dashboard
- `src/risk/risk_manager.py` — Trailing stop, breakeven, partial TP, max hold time
- `src/risk/kelly.py` — Kelly Criterion position sizing
- `src/backtesting/backtester.py` — Backtesting engine with fee/slippage modeling
- `src/backtesting/order_book_replay.py` — Order book replay for OBI backtesting
- `src/backtesting/optimizer.py` — Strategy parameter optimization with grid search
- `src/backtesting/plotter.py` — Matplotlib equity curve plotting
- `run.py` — Main entry point with timestamped logging
- `run_backtest.py` — CLI backtest runner with plotting and optimization
- `monitor.py` — CLI monitor for live signal feed

### 3. HFT Trade Bot (`hft-trade-bot/`)

**Language:** C++20 (GCC 13+ / Clang 17+)
**Role:** Sub-millisecond execution engine with native signal generation

**V2 Architecture (Phase 25):**

The HFT bot was upgraded to v2.0.0 with a complete latency optimization overhaul and native C++ signal engine. The V1 engine is preserved as a configurable fallback.

**Dual signal path:**
- **Fast path (< 1ms):** Signal Engine V2 (6 inline indicators, stack-allocated, no heap allocations)
- **Slow path:** Receives AI signals from Python bot via WebSocket :8766

**V2 Subsystems:**

| Subsystem | Description |
|-----------|-------------|
| Signal Engine V2 | 6-indicator weighted composite: InlineEMA(21/50) 0.25, InlineRSI(14) 0.15, OBI(5/10/20) 0.20, VWAP deviation 0.10, InlineADX(14) 0.10, Pressure 0.20 |
| Pressure Model | Multi-level OBI, trade flow imbalance, toxicity detection, microprice, queue position, spread regime, price impact prediction |
| Smart Order Router V2 | IExchange interface (DIP/SOLID), 5 strategies: BestPrice, LowestLatency, LowestFees, BestEffective, DepthAware. Anti-toxic backoff, per-exchange latency tracking |
| Adaptive Order Selector V2 | Dynamic IOC/FOK/GTD/PostOnly based on confidence, spread, OBI, toxicity. Exchange-specific mappings for Binance, OKX, Bybit |
| Latency Infrastructure | Spinlock, SPSCQueue (lock-free), ObjectPool (no heap alloc), LatencyHistogram (P50/P95/P99/P99.9), ScopedLatency (RAII), ThreadAffinity, CircuitBreaker, RetryPolicy |
| Cache-Line Alignment | All hot-path structs `alignas(64)`: AlignedOrderBookLevel, FastSignal, FastOrder, PressureResult, RoutingDecision |
| Dynamic Leverage | Confidence >= 85 + ADX > 30 -> 5x, >= 75 -> 3x, else 1x |
| Graceful Shutdown | Cancel all open positions before exit, latency report logging |
| V1 Fallback | Configurable via `signal_engine_v2_enabled` flag |

**Compiler flags:** `-O3`, `-flto` (LTO), `-msse4.2`, `-ffast-math`, `-finline-functions`

**Key files:**
- `src/core/main.cpp` — Main entry point, V2 integration, latency histograms, graceful shutdown
- `src/core/config.h` / `config.cpp` — YAML config loader with 20+ V2 parameters
- `src/core/logger.h` — spdlog logger with timestamped filenames and `_latest.log` pointer
- `src/strategies/signal_engine.h` — V1 HFT signal engine (6 indicators, FFT)
- `src/strategies/signal_engine_v2.h` — V2 SignalEngineV2, InlineEMA, InlineRSI, InlineADX, InlineVWAP
- `src/strategies/pressure_model.h` — Multi-level OBI, toxicity, microprice, queue position
- `src/execution/smart_order_router_v2.h` — IExchange, ExchangeBase, SmartOrderRouterV2
- `src/execution/adaptive_order_selector_v2.h` — Dynamic order type selection with exchange mappings
- `src/execution/order_executor.h` — Order submission and arbitrage execution
- `src/execution/order_type_selector.h` — V1 smart order type selection
- `src/communication/signal_receiver.h` — WebSocket client (dual: 8765 + 8766)
- `src/risk/risk_manager.h` — Pre-trade risk checks, position sizing
- `src/position/position_manager.h` — Thread-safe position tracking and SL/TP
- `src/utils/low_latency.h` — Spinlock, SPSCQueue, ObjectPool, LatencyHistogram, ScopedLatency, ThreadAffinity, CircuitBreaker, RetryPolicy
- `src/data/aligned_types.h` — Cache-line aligned structs for hot path
- `tests/test_signal_engine_v2.cpp` — 30+ V2 unit tests
- `tests/test_signal_engine.cpp` — 25 V1 unit tests
- `CMakeLists.txt` — v2.0.0, LTO, O3, simdjson optional, V1 + V2 test targets
- `config/config.yaml` — Full V2 configuration sections

### 4. Web UI Dashboard (`web-ui/`)

**Language:** JavaScript (React 18 + Vite 5)
**Role:** Browser-based trading dashboard with 201+ components and 191+ registered panels

| Feature | Implementation |
|---------|---------------|
| Candle charts | lightweight-charts (TradingView) with volume histogram |
| Chart indicators | EMA 9/21/50, Bollinger Bands, RSI 14, VWAP (toggle on/off) |
| Multi-timeframe | 5m/15m/1h/4h toggle (frontend aggregation) |
| Alt chart modes | Heikin-Ashi, Renko, Point & Figure, Kagi, Three-Line Break, Tick, Volume Clock |
| Order book | Real WebSocket data, depth bars, heatmap, cumulative totals |
| Order form | Market/limit, SL/TP, quick-trade buttons, per-exchange fee breakdown |
| Account panel | Per-exchange balance, equity, PnL, fees, win rate, PnL leaderboard |
| Positions | Open positions with unrealized PnL, liquidation price, SL/TP progress bar |
| Signal feed | AI signals with confidence, R:R, regime, confidence histogram |
| Arbitrage | Active cross-exchange opportunities |
| Fills | Recent order fill history with statistics, VirtualList rendering |
| Performance | Aggregate metrics, equity curve, drawdown, Sharpe/Sortino, win/loss streaks |
| Backtest | Configure and run backtests, compare strategy equity curves, risk options |
| Trade history | Closed trades with PnL, SL/TP reason, CSV export |
| Bot status | AI + HFT bot status cards, portfolio overview, activity feed |
| Order flow | CVD, tape, depth chart, spoofing detector, dark order flow, imbalance |
| Technical analysis | Fibonacci, FVG, pattern detector/scanner, support/resistance, order blocks |
| Risk and analytics | Monte Carlo, drawdown, VaR/CVaR/beta, Kelly, Greeks, volatility surface, hedging |
| Portfolio | Markowitz optimizer, auto-rebalance, multi-account, session stats, heatmap calendar |
| Strategy | Visual strategy builder, TWAP/VWAP execution bot, walk-forward, alert webhooks |
| Export | Session JSON, trade stats CSV, trade journal with tags |
| Advanced math models | 75+ components: GARCH, HMM, PCA, LSTM, Kalman, Wavelet, Copula, VAE, HMC, OT, TDA, and more |
| Price alerts | User-set threshold prices with toast + sound |
| Smart order router | Best price across exchanges |
| Multi-monitor | Detachable panels via popup windows |
| Theme | Dark/light toggle, persisted in localStorage |
| Sound alerts | Fills, SL/TP, connection changes (Web Audio API) |
| Mobile | Responsive layout with panel toggle |
| Mock mode | `VITE_MOCK_MODE=true` for standalone demo without backend |
| Connection | WebSocket auto-reconnect with exponential backoff (1s -> 30s cap) |
| Performance | React.lazy + Suspense, VirtualList, ErrorBoundary per panel |
| Testing | Vitest test framework |
| Linting | ESLint with React plugin |
| Deployment | Netlify configuration (`netlify.toml`) |

**Key files:**
- `src/App.jsx` — Main layout with tabbed panels, keyboard shortcuts, toast notifications, sound alerts
- `src/panels/registry.js` — Panel registry (191+ panels, 7 categories, 201+ component imports)
- `src/panels/PanelContainer.jsx` — ErrorBoundary + Suspense per panel, collapsible categories, localStorage visibility
- `src/components/VirtualList.jsx` — Generic windowed list renderer with overscan
- `src/hooks/useWebSocket.js` — Generic WebSocket hook with exponential backoff auto-reconnect
- `src/hooks/useExchangeData.js` — Exchange data hook (candles, prices, orderbooks, accounts, fills, arbitrage)
- `src/hooks/useSignalData.js` — AI signal data hook (signals, regime, backtest results)
- `src/hooks/useDetachablePanels.js` — Multi-monitor popup panel support
- `src/hooks/useSoundAlerts.js` — Web Audio API sound notifications
- `src/hooks/useTheme.js` — Dark/light theme toggle
- `src/hooks/useMediaQuery.js` — Mobile responsive detection
- `src/hooks/useTradeJournal.js` — Trade notes with localStorage persistence
- `src/utils/indicators.js` — EMA, RSI, SMA, Bollinger Bands, VWAP, ATR, ADX, OBV, MFI, Williams %R, Stochastic, CCI, Awesome Oscillator, Parabolic SAR, MACD, ADX
- `src/utils/performance.js` — Aggregate metrics, equity curve, drawdown, Sharpe/Sortino
- `src/utils/format.js` — Number/price formatting helpers
- `src/utils/timeframes.js` — Multi-timeframe candle aggregation
- `src/utils/patterns.js` — Candle pattern detection (doji, hammer, engulfing)

**Advanced Math Model components (75+):**

Phases 24-39 added 75+ advanced mathematical model components across 15 batches (V1-V15), covering:
- GARCH, Cointegration, Markov chains, Fractal analysis, Kalman filter, Spectral analysis
- Ehlers SuperSmoother, Bayesian prediction, Almgren-Chriss, Wavelet decomposition, K-Means, Copula
- HMM, PCA, Optimal Stopping, Isolation Forest, VMD
- EMD/HHT, SVM, Black-Litterman, Hawkes process, DTW
- LSTM, Kelly portfolio, Gaussian Process, Markov-Switching GARCH, EDM
- Autoencoder, Optimal Transport, Rough Volatility, Transfer Entropy, Graph Theory
- CVaR, Non-Stationary Spectral, Random Matrix Theory, Bayesian STS, Topological Data Analysis
- SDEs, GMM, Wavelet Packet, Information Bottleneck, Affine Arithmetic
- Renormalization Group, Free Energy Principle, Tensor Decomposition, Compressed Sensing, Malliavin
- HMC, RKHS, VAE, Schrodinger Bridge, Lie Group Symmetries
- KS Entropy, Persistent Homology Landscape, Fokker-Planck, Hopf Bifurcation, Cramer-Rao
- Wasserstein Barycenters, Koopman Operator, Stochastic Optimal Control, Renyi Entropy, Pontryagin
- Burgers Equation, Sobolev Regularization, Ito Calculus, Banach Fixed-Point, Cesaro/Fejer
- Girsanov, Stone-Cech, Malliavin-Stein, Prokhorov Metric, Radon-Nikodym
- Hahn Decomposition, Cameron-Martin, Arzela-Ascoli, Riesz Representation, Lax-Milgram

### Panel Registry System

All sidebar analytic/strategy panels are registered in `src/panels/registry.js` instead of being hardcoded in `App.jsx`. This enables:

- **Zero-touch extensibility** — Adding a panel = 1 entry in registry.js, 0 changes to App.jsx
- **Categorized rendering** — 7 categories: Order Flow, Technical Analysis, Risk and Analytics, Portfolio, Strategy, Export, Config
- **191+ registered panels** — 201+ component files across all categories
- **User-toggleable visibility** — Each panel can be shown/hidden, persisted in localStorage
- **Collapsible categories** — Users can collapse entire sections
- **ErrorBoundary + Suspense** — Each panel wrapped in ErrorBoundary and Suspense (triple protection)
- **React.lazy ready** — Suspense wrapper in place for future lazy import conversion
- **VirtualList** — FillsPanel and SignalFeed use windowed rendering for performance
- **Detachable panels** — Panels can be popped out to separate windows for multi-monitor setups

See `docs/ARCHITECTURE_ROADMAP.md` for long-term sustainability plan.

## Data Flow

```
Exchange Simulator (:8765)
    |
    |-->> WebSocket broadcast (1s interval)
    |       |-->> AI Signal Bot (receives candles, orderbooks)
    |       |-->> HFT Trade Bot (receives candles, orderbooks)
    |       |-->> Web UI Dashboard (receives candles, prices, orderbooks, accounts, fills)
    |
    |--<< AI Signal Bot (submits orders)
    |--<< HFT Trade Bot (submits orders, arbitrage execution)
    |--<< Web UI Dashboard (submits orders, closes positions)

AI Signal Bot (:8766)
    |
    |-->> WebSocket signal publisher
    |       |-->> HFT Trade Bot (receives AI signals, regime, arbitrage scans)
    |       |-->> Web UI Dashboard (receives AI signals, regime, backtest results)

Web UI Dashboard
    |
    |-->> WebSocket :8766 (backtest requests)
    |       |-->> AI Signal Bot (runs backtest, returns equity curves + metrics)

Logging
    |
    |-->> Exchange Simulator -> logs/exchange_simulator_YYYYMMDD_HHMMSS.log
    |-->> AI Signal Bot -> logs/ai_signal_bot_YYYYMMDD_HHMMSS.log
    |-->> HFT Trade Bot -> logs/hft_trade_bot_YYYYMMDD_HHMMSS.log
    |-->> Trade CSV -> logs/trades_YYYYMMDD_HHMMSS.csv (fills, SL/TP, arbitrage)
```

## Technology Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Exchange Simulator | Python 3.12, asyncio, websockets | v2.1.0 |
| AI Signal Bot | Python 3.12, asyncio, SQLite (WAL), matplotlib | v2.1.0 |
| HFT Trade Bot | C++20, Boost, websocketpp, spdlog, yaml-cpp | v2.0.0 |
| Web UI | React 18, Vite 5, TailwindCSS 3, lightweight-charts 4 | v2.1.0 |
| Communication | WebSocket (JSON), per-message deflate compression | - |
| Database | SQLite (WAL mode) | - |
| Containerization | Docker, docker-compose | - |
| Build System | CMake 3.16+ (C++), pip (Python), npm/Vite (JS) | - |
| CI/CD | GitHub Actions (Python lint+test, C++ build+test, JS lint+test, Docker) | - |
| Linting | ruff (Python), clang-format (C++), ESLint (JS) | - |
| Testing | pytest + pytest-asyncio, CTest, Vitest | - |
| Logging | run_logger.py (Python), spdlog (C++), timestamped per-run files | - |
| Deployment | Netlify (Web UI), Docker Hub (images) | - |

## Design Principles

1. **No real exchange API** — All market data is simulated using GBM with fat-tail jumps
2. **Paper trading only** — No real money is at risk (educational purpose)
3. **Modular architecture** — Each component runs independently, communicates via WebSocket
4. **Low-latency design** — C++20 engine with cache-line alignment, lock-free queues, no heap allocations in hot path
5. **Configurable** — All parameters in YAML config files with validation
6. **Reproducible** — Random seed for deterministic simulation
7. **Registry over monolith** — Extensible features use registry pattern (191+ panels, 7 categories)
8. **Protocol-first** — Message schemas are versioned and backward-compatible
9. **Reversibility** — All architectural decisions must be reversible (V1 fallback preserved)
10. **Error resilience** — ErrorBoundary + Suspense per panel, CircuitBreaker for exchange failures, exponential backoff for reconnections
11. **Sustainability** — See `docs/ARCHITECTURE_ROADMAP.md` for long-term plan
12. **Observability** — Timestamped per-run logging, CSV trade logs, CLI monitor scripts, latency histograms
