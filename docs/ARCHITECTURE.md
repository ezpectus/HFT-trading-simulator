# Architecture

## Overview

The system consists of four independent components communicating over WebSocket:

```
┌──────────────────────────┐     WebSocket (JSON)
│  Exchange Simulator      │ ─────────────────────────┐
│  (Python asyncio)        │                          │
│                          │     Market Data Stream    │
│  • GBM price generation  │     (candles, orderbook)  │
│  • 3 exchanges           │                          ▼
│  • 3 symbols (BTC/ETH/   │           ┌──────────────────────────┐
│    SOL)                  │           │  AI Signal Bot (Python)   │
│  • Order book simulation │           │                           │
│  • Order matching engine │           │  Pipeline:                │
│  • Terminal visualizer   │           │  1. Data Collection       │
│  • Account simulation    │           │  2. Technical Analysis    │
│  • Arbitrage detection   │           │  3. Trend Following       │
│                          │           │  4. Mean Reversion        │
│  WebSocket :8765         │           │  5. FFT Cycle Strategy    │
└──────────────────────────┘           │  6. Ensemble Voter        │
        ▲                              │  7. Signal Validation     │
        │     Orders (WebSocket)       │  8. Order Execution       │
        │                              │                           │
        │                              │  Risk Manager             │
        │                              │  Backtest Engine          │
        │                              │  SQLite (trading.db)      │
        │                              │  Signal Publisher :8766   │
        │                              └──────────────┬───────────┘
        │                                             │
        │     Orders (WebSocket)                      │ AI Signals (WebSocket :8766)
        │                                             │
        │              ┌──────────────────────────────┘
        └──────────────│  HFT Trade Bot (C++20)
                       │
                       │  • Signal Receiver (WS :8765)
                       │  • AI Signal Receiver (WS :8766)
                       │  • HFT Signal Engine (6 indicators)
                       │    - EMA crossover
                       │    - Order Book Imbalance
                       │    - VWAP
                       │    - Price Pressure Model
                       │    - FFT Spectral Trend Score
                       │    - FFT Smoothed Price Direction
                       │  • Risk Manager
                       │  • Position Manager
                       │  • Order Type Selector
                       │  • Order Executor (WS)
                       │  • Arbitrage Execution
                       │
                       └──────────────────────────

┌──────────────────────────┐
│  Web UI Dashboard        │
│  (React + Vite)          │
│                          │
│  • Candle Charts (TV)    │
│  • Order Book            │     WebSocket :8765 (exchange)
│  • Order Form            │ ◄── WebSocket :8766 (signals)
│  • Account / Positions   │
│  • AI Signal Feed        │
│  • Arbitrage Panel       │
│  • Fills History         │
│  • Performance Dashboard │
│  • Backtest Runner       │
│                          │
│  HTTP :3000              │
└──────────────────────────┘
```

## Components

### 1. Exchange Simulator (`exchange-simulator/`)

**Language:** Python 3.12+  
**Role:** Simulates 3 crypto exchanges with realistic price data

| Feature | Implementation |
|---------|---------------|
| Price generation | Geometric Brownian Motion (GBM) with per-symbol volatility |
| Exchanges | Binance, Bybit, OKX (different fees & slippage) |
| Symbols | BTC/USDT, ETH/USDT, SOL/USDT |
| Order book | 20 levels per side, decay-based liquidity |
| Order matching | Market & limit orders with slippage simulation |
| Account | Balance, positions, PnL, win rate tracking |
| Arbitrage | Multi-exchange spread detection, WebSocket broadcast |
| Funding rates | Per-exchange, charged every 8h equivalent |
| Partial fills | Large orders split across order book levels |
| Market impact | Large orders move price |
| News events | Sudden volatility spikes with directional bias |
| Liquidation | Auto-close when margin < maintenance |
| Config hot-reload | Change volatility/fees without restart |
| Data export | CSV and Parquet formats |
| Visualizer | Terminal-based candle charts, RSI, MACD, BB, FFT regime |
| Data feed | WebSocket server streaming candles + order books to bots |

**Key files:**
- `market_simulator.py` — GBM price engine
- `exchange.py` — Order matching & account management
- `visualizer.py` — Terminal dashboard with ASCII charts
- `websocket_server.py` — WebSocket data feed
- `models.py` — Data structures (Candle, Order, Position, Account)
- `arbitrage.py` — Multi-exchange arbitrage detection
- `config_validator.py` — Config validation with error checking
- `data_export.py` — CSV/Parquet data export

### 2. AI Signal Bot (`ai-signal-bot/`)

**Language:** Python 3.12+  
**Role:** Analyzes market data and generates trading signals

**Pipeline (8 stages):**

1. **Data Collection** — Receives candle + order book data via WebSocket
2. **Technical Analysis** — Computes RSI, EMA, SMA, MACD, Bollinger Bands, ATR, ADX, VWAP
3. **Trend Following** — EMA crossover + ADX strength filter
4. **Mean Reversion** — RSI extremes + Bollinger Band touches
5. **FFT Cycle Strategy** — Spectral analysis, cycle detection, regime classification (TRENDING/RANGING/MIXED)
6. **Ensemble Voter** — Majority or confidence-weighted voting (3 strategies)
7. **Signal Validation** — Confidence, R:R ratio, drawdown, position limits
8. **Order Execution** — Sends orders to exchange simulator

**Key files:**
- `src/technical_analysis/indicators.py` — All TA indicators
- `src/strategies/strategies.py` — Trend following, mean reversion, ensemble
- `src/strategies/fft_strategy.py` — FFT cycle detection & regime classification
- `src/signal_validation/validator.py` — Risk-based signal filtering
- `src/communication/ws_client.py` — WebSocket client for exchange
- `src/communication/signal_publisher.py` — WebSocket server for signals + backtest endpoint
- `src/database/db.py` — SQLite storage
- `src/monitoring/tracker.py` — Performance tracking & dashboard
- `src/risk/risk_manager.py` — Trailing stop, breakeven, partial TP, max hold time
- `src/risk/kelly.py` — Kelly Criterion position sizing
- `src/backtesting/backtester.py` — Backtesting engine with fee/slippage modeling
- `src/backtesting/order_book_replay.py` — Order book replay for OBI backtesting
- `run.py` — Main entry point
- `run_backtest.py` — CLI backtest runner

### 3. HFT Trade Bot (`hft-trade-bot/`)

**Language:** C++20  
**Role:** Fast execution engine with low-latency signal generation

**Dual signal path:**
- **Fast path (< 1ms):** C++ Signal Engine (EMA, OBI, VWAP, Pressure Model)
- **Slow path:** Receives AI signals from Python bot via WebSocket

**Key files:**
- `src/strategies/signal_engine.h` — HFT signal engine (fast indicators)
- `src/communication/signal_receiver.h` — WebSocket client
- `src/execution/order_executor.h` — Order submission
- `src/execution/order_type_selector.h` — Smart order type selection
- `src/risk/risk_manager.h` — Pre-trade risk checks
- `src/position/position_manager.h` — Position tracking & SL/TP
- `src/core/main.cpp` — Main entry point
- `src/core/config.cpp` — YAML config loader

### 4. Web UI Dashboard (`web-ui/`)

**Language:** JavaScript (React 18)  
**Role:** Browser-based trading dashboard with TradingView-style charts

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
| Fills | Recent order fill history with statistics |
| Performance | Aggregate metrics, equity curve, drawdown, Sharpe/Sortino, win/loss streaks |
| Backtest | Configure and run backtests, compare strategy equity curves, risk options |
| Trade history | Closed trades with PnL, SL/TP reason, CSV export |
| Bot status | AI + HFT bot status cards, portfolio overview, activity feed |
| Order flow | CVD, tape, depth chart, spoofing detector, dark order flow, imbalance |
| Technical analysis | Fibonacci, FVG, pattern detector/scanner, support/resistance, order blocks |
| Risk & analytics | Monte Carlo, drawdown, VaR/CVaR/beta, Kelly, Greeks, volatility surface, hedging |
| Portfolio | Markowitz optimizer, auto-rebalance, multi-account, session stats, heatmap calendar |
| Strategy | Visual strategy builder, TWAP/VWAP execution bot, walk-forward, alert webhooks |
| Export | Session JSON, trade stats CSV, trade journal with tags |
| Price alerts | User-set threshold prices with toast + sound |
| Smart order router | Best price across exchanges |
| Multi-monitor | Detachable panels via popup windows |
| Theme | Dark/light toggle, persisted in localStorage |
| Sound alerts | Fills, SL/TP, connection changes (Web Audio API) |
| Mobile | Responsive layout with panel toggle |
| Connection | WebSocket auto-reconnect with exponential backoff |

**Key files:**
- `src/App.jsx` — Main layout with tabbed panels, keyboard shortcuts, toast notifications, sound alerts
- `src/panels/registry.js` — Component panel registry (90+ panels, 7 categories)
- `src/panels/PanelContainer.jsx` — Renders panels by category with collapsible sections + localStorage visibility
- `src/hooks/useWebSocket.js` — Generic WebSocket hook with exponential backoff auto-reconnect
- `src/hooks/useExchangeData.js` — Exchange data hook (candles, prices, orderbooks, accounts, fills, arbitrage)
- `src/hooks/useDetachablePanels.js` — Multi-monitor popup panel support
- `src/hooks/useSoundAlerts.js` — Web Audio API sound notifications
- `src/hooks/useTheme.js` — Dark/light theme toggle
- `src/hooks/useMediaQuery.js` — Mobile responsive detection
- `src/hooks/useTradeJournal.js` — Trade notes with localStorage persistence
- `src/utils/indicators.js` — EMA, RSI, SMA, Bollinger Bands, VWAP, ATR, ADX, OBV, MFI, Williams %R, Stochastic, CCI, Awesome Oscillator, Parabolic SAR calculations
- `src/utils/performance.js` — Aggregate metrics, equity curve, drawdown, Sharpe/Sortino
- `src/utils/format.js` — Number/price formatting helpers
- `src/utils/timeframes.js` — Multi-timeframe candle aggregation
- `src/utils/patterns.js` — Candle pattern detection (doji, hammer, engulfing)
- `src/components/CandleChart.jsx` — TradingView candlestick chart with indicators + trade markers
- `src/components/OrderBook.jsx` — Bid/ask depth with heatmap and cumulative bars
- `src/components/OrderForm.jsx` — Order submission with quick-trade and fee breakdown
- `src/components/AccountPanel.jsx` — Account metrics with PnL leaderboard
- `src/components/PositionsPanel.jsx` — Positions with liquidation price, leverage badge
- `src/components/SignalFeed.jsx` — AI signal feed with confidence histogram
- `src/components/ArbitragePanel.jsx` — Arbitrage opportunities
- `src/components/PerformanceDashboard.jsx` — Performance metrics, equity curve, drawdown, risk metrics
- `src/components/BacktestRunner.jsx` — Backtest configuration and results display
- `src/components/TradeHistory.jsx` — Closed trades with PnL, summary stats, CSV export
- `src/components/BotStatus.jsx` — AI + HFT bot status cards
- `src/components/StatusBar.jsx` — Bottom bar with sim time, bot activity, funding rates
- `src/components/Header.jsx` — Exchange/symbol selector, price ticker, speed control
- `src/components/PriceAlerts.jsx` — User-set threshold price alerts
- `src/components/StrategyBuilder.jsx` — Visual rule-based strategy creator
- `src/components/ExecutionBot.jsx` — TWAP/VWAP sliced order execution
- `src/components/RiskDashboard.jsx` — VaR, CVaR, beta risk metrics
- `src/components/MonteCarlo.jsx` — Monte Carlo simulation
- `src/components/GreeksCalculator.jsx` — Black-Scholes Greeks
- `src/components/PortfolioOptimizer.jsx` — Markowitz efficient frontier
- `src/components/VolumeProfile.jsx` — Volume profile + POC
- `src/components/MarketProfile.jsx` — TPO (time price opportunity)
- `src/components/WalkForward.jsx` — Walk-forward analysis
- `src/components/OnboardingTutorial.jsx` — First-run guide
- `src/components/KeyboardHelp.jsx` — Keyboard shortcut overlay
- `src/components/Toast.jsx` — Toast notification system
- `src/components/DepthChart.jsx` — Cumulative depth visualization
- `src/components/CumulativeVolumeDelta.jsx` — CVD indicator
- `src/components/OrderFlowTape.jsx` — Real-time order flow tape
- `src/components/SpoofingDetector.jsx` — Order book spoofing detection
- `src/components/FibonacciLevels.jsx` — Fibonacci retracement
- `src/components/FairValueGap.jsx` — FVG detection
- `src/components/PatternScanner.jsx` — Multi-symbol pattern scanner
- `src/components/PatternDetector.jsx` — Candle pattern detection
- `src/components/SupportResistance.jsx` — Auto S/R detection
- `src/components/OrderBlocks.jsx` — Institutional order block zones
- `src/components/CorrelationMatrix.jsx` — Cross-symbol correlation
- `src/components/HedgingSuggestions.jsx` — Correlation-based hedging
- `src/components/VolatilitySurface.jsx` — Volatility surface visualization
- `src/components/KellyCalculator.jsx` — Kelly Criterion sizing
- `src/components/RiskParityCalculator.jsx` — Risk parity sizing
- `src/components/MultiLegOptions.jsx` — Options strategies (straddle, strangle, iron condor)
- `src/components/PnLAttribution.jsx` — P&L attribution by position
- `src/components/PnLAttributionChart.jsx` — P&L attribution over time
- `src/components/DrawdownAnalysis.jsx` — Drawdown analysis
- `src/components/RiskAdjustedComparison.jsx` — Sharpe/Sortino/Calmar comparison
- `src/components/AutoRebalance.jsx` — Portfolio auto-rebalance
- `src/components/MultiAccountView.jsx` — Aggregated multi-account view
- `src/components/SessionStats.jsx` — Session PnL stats
- `src/components/HeatmapCalendar.jsx` — Daily PnL heatmap
- `src/components/TimeOfDayPerformance.jsx` — Performance by hour
- `src/components/TradeClustering.jsx` — Overtrading detection
- `src/components/PositionCorrelation.jsx` — Cross-position risk
- `src/components/SignalPerformance.jsx` — Signal hit rate tracking
- `src/components/AlertWebhook.jsx` — Discord/Telegram notifications
- `src/components/Watchlist.jsx` — Custom price tracking
- `src/components/SmartOrderRouter.jsx` — Best price across exchanges
- `src/components/SessionExport.jsx` — Session JSON export
- `src/components/TradeStatsExport.jsx` — Custom CSV export
- `src/components/TradeJournal.jsx` — Tagged trade journal
- `src/components/TradeReplay.jsx` — Trade replay with timeline scrubber
- `src/components/TradeTimeline.jsx` — Visual fill sequence
- `src/components/ReplayControls.jsx` — Replay playback controls
- `src/components/ConfigPanel.jsx` — Hot-reload simulator config
- `src/components/IndicatorBuilder.jsx` — Custom indicator builder
- `src/components/DetachablePanel.jsx` — Popup panel wrapper
- `src/components/PriceComparison.jsx` — Cross-exchange price comparison
- `src/components/MarketRegime.jsx` — Regime indicator
- `src/components/SentimentIndicator.jsx` — News sentiment gauge
- `src/components/VolatilityRegime.jsx` — GARCH-like regime
- `src/components/PairTradingSignals.jsx` — Correlation-based pair signals
- `src/components/OrderFlowImbalance.jsx` — Bid/ask volume ratio
- `src/components/DarkOrderFlow.jsx` — Hidden order detection
- `src/components/LiquidityHeatmap.jsx` — Pool levels over time
- `src/components/OrderBookHeatmap.jsx` — Depth color intensity
- `src/components/SessionVolumeProfile.jsx` — London/NY/Asia volume
- `src/components/MultiTimeframeComparison.jsx` — Side-by-side timeframes
- `src/components/HeikinAshi.jsx` — Heikin-Ashi chart mode
- `src/components/RenkoChart.jsx` — Renko chart mode
- `src/components/PointAndFigure.jsx` — Point & Figure chart
- `src/components/KagiChart.jsx` — Kagi chart mode
- `src/components/ThreeLineBreak.jsx` — Three-Line Break chart
- `src/components/TickChart.jsx` — Tick-based chart
- `src/components/VolumeClockChart.jsx` — Constant volume bars
- `src/components/VWAPMACD.jsx` — Volume-weighted MACD
- `src/components/OBVIndicator.jsx` — On-balance volume
- `src/components/MFIIndicator.jsx` — Money flow index
- `src/components/WilliamsRIndicator.jsx` — Williams %R
- `src/components/IchimokuCloud.jsx` — Ichimoku cloud
- `src/components/StochasticOscillator.jsx` — Stochastic oscillator
- `src/components/ADXIndicator.jsx` — ADX/DI trend strength
- `src/components/ATRIndicator.jsx` — ATR indicator panel
- `src/components/ParabolicSAR.jsx` — Parabolic SAR
- `src/components/CCIIndicator.jsx` — Commodity Channel Index
- `src/components/AwesomeOscillator.jsx` — Awesome Oscillator

### Panel Registry System

All sidebar analytic/strategy panels are registered in `src/panels/registry.js` instead of being hardcoded in `App.jsx`. This enables:

- **Zero-touch extensibility** — Adding a panel = 1 entry in registry.js, 0 changes to App.jsx
- **Categorized rendering** — 7 categories: Order Flow, Technical Analysis, Risk & Analytics, Portfolio, Strategy, Export, Config
- **90+ registered panels** — Depth chart, CVD, tape, spoofing, dark flow, Fibonacci, FVG, patterns, S/R, order blocks, Monte Carlo, drawdown, VaR, Kelly, Greeks, volatility surface, hedging, correlation, Markowitz, auto-rebalance, multi-account, session stats, heatmap calendar, time-of-day, trade clustering, strategy builder, execution bot, walk-forward, alert webhook, watchlist, signal performance, session export, trade stats, trade journal, config panel, indicator builder, and more
- **User-toggleable visibility** — Each panel can be shown/hidden, persisted in localStorage
- **Collapsible categories** — Users can collapse entire sections
- **Detachable panels** — Panels can be popped out to separate windows for multi-monitor setups
- **Future-ready** — Designed for lazy loading, plugin architecture, dynamic imports

See `docs/ARCHITECTURE_ROADMAP.md` for 5-20 year sustainability plan.

## Data Flow

```
Exchange Simulator
    │
    ├──► WebSocket broadcast (1s interval)
    │    ├──► AI Signal Bot (receives candles, orderbooks)
    │    ├──► HFT Trade Bot (receives candles, orderbooks)
    │    └──► Web UI Dashboard (receives candles, prices, orderbooks, accounts)
    │
    ├──◄ AI Signal Bot (submits orders)
    ├──◄ HFT Trade Bot (submits orders)
    └──◄ Web UI Dashboard (submits orders, closes positions)

AI Signal Bot
    │
    └──► WebSocket :8766 (signal publisher)
         ├──► HFT Trade Bot (receives AI signals)
         └──► Web UI Dashboard (receives AI signals, regime, backtest results)

Web UI Dashboard
    │
    └──► WebSocket :8766 (backtest requests)
         └──► AI Signal Bot (runs backtest, returns equity curves + metrics)
```

## Technology Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Exchange Simulator | Python 3.12, asyncio, websockets | v1.0.0 |
| AI Signal Bot | Python 3.12, asyncio, SQLite | v1.0.0 |
| HFT Trade Bot | C++20, Boost, websocketpp, spdlog | v1.0.0 |
| Web UI | React 18, Vite, TailwindCSS, lightweight-charts | v1.0.0 |
| Communication | WebSocket (JSON) | - |
| Database | SQLite (WAL mode) | - |
| Containerization | Docker, docker-compose | - |
| Build System | CMake 3.16+ (C++), pip (Python) | - |

## Design Principles

1. **No real exchange API** — All market data is simulated using GBM
2. **Paper trading only** — No real money is at risk
3. **Modular architecture** — Each component runs independently
4. **WebSocket communication** — Low-latency JSON messaging
5. **Configurable** — All parameters in YAML config files
6. **Reproducible** — Random seed for deterministic simulation
7. **Registry over monolith** — Extensible features use registry pattern (panels, future: strategies, indicators)
8. **Protocol-first** — Message schemas are versioned and backward-compatible
9. **Reversibility** — All architectural decisions must be reversible
10. **Sustainability** — See `docs/ARCHITECTURE_ROADMAP.md` for 5-20 year plan
