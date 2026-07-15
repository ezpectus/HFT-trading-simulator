# Architecture Diagrams

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          HFT TRADING SYSTEM                                      │
│                          Educational Simulator                                   │
└─────────────────────────────────────────────────────────────────────────────────┘
                                    │
            ┌───────────────────────┼───────────────────────┐
            │                       │                       │
            ▼                       ▼                       ▼
  ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
  │   EXCHANGE      │   │   AI SIGNAL     │   │   HFT TRADE     │
  │   SIMULATOR     │   │   BOT           │   │   BOT           │
  │   (Python)      │   │   (Python)      │   │   (C++20)       │
  │                 │   │                 │   │                 │
  │  • 3 Exchanges  │   │  • 8-Stage      │   │  • Signal V2/V3 │
  │  • 3 Symbols    │   │    Pipeline     │   │  • Smart Router │
  │  • GBM + Jumps  │   │  • 34+ Models   │   │  • Pressure Mod │
  │  • Order Book   │   │  • Backtesting  │   │  • Adaptive Ord │
  │  • Funding      │   │  • LLM Explain  │   │  • FIX 4.4      │
  │  • Liquidation  │   │  • Risk Mgr     │   │  • SHM IPC      │
  │  • Options      │   │                 │   │                 │
  └────────┬────────┘   └────────┬────────┘   └────────┬────────┘
           │                     │                     │
           │   WS :8765          │  WS :8766           │
           │◄────────────────────┤◄────────────────────┤
           │                     │                     │
           │    Orders ──────────►│    Signals ────────►│
           │                     │                     │
           │                     │  SHM IPC            │  SHM IPC
           │                     │  (signals)          │  (fills)
           │                     │◄───────────────────►│
           │                     │                     │
           ▼                     ▼                     ▼
  ┌─────────────────────────────────────────────────────────────┐
  │                      WEB UI (React 18)                       │
  │                                                              │
  │  • 191+ Panels    • PWA    • WCAG AA    • Mock Data Mode     │
  │  • TradingView-style charts    • Real-time WebSocket         │
  │  • Backtest Runner    • Options Calculator    • Greeks       │
  └─────────────────────────────────────────────────────────────┘
```

## Data Flow — Market Data Path

```
Exchange Simulator                    AI Signal Bot                    HFT Trade Bot
     │                                     │                               │
     │  ┌──────────────┐                   │                               │
     │  │ Market       │                   │                               │
     │  │ Simulator    │                   │                               │
     │  │ (GBM+Jumps)  │                   │                               │
     │  └──────┬───────┘                   │                               │
     │         │                           │                               │
     │  ┌──────▼───────┐                   │                               │
     │  │ Order Book   │                   │                               │
     │  │ Manager      │                   │                               │
     │  └──────┬───────┘                   │                               │
     │         │                           │                               │
     │  ┌──────▼───────┐    WS :8765       │                               │
     │  │ WebSocket    │──────────────────►│  WS Client                    │
     │  │ Server       │──────────────────────────────────────────────────►│  WS Client
     │  └──────┬───────┘                   │                               │
     │         │                           │  ┌──────────────────┐         │
     │         │                           │  │ 8-Stage Pipeline │         │
     │         │                           │  │                  │         │
     │         │                           │  │ 1. Trend         │         │
     │         │                           │  │ 2. MeanRev       │         │
     │         │                           │  │ 3. FFT           │         │
     │         │                           │  │ 4. Sentiment     │         │
     │         │                           │  │ 5. StatArb       │         │
     │         │                           │  │ 6. ML Ensemble   │         │
     │         │                           │  │ 7. Ensemble Vote │         │
     │         │                           │  │ 8. Risk Manager  │         │
     │         │                           │  └────────┬─────────┘         │
     │         │                           │           │                   │
     │         │                           │  ┌────────▼─────────┐         │
     │         │                           │  │ Signal Publisher │         │
     │         │                           │  │ WS :8766         │         │
     │         │                           │  └────────┬─────────┘         │
     │         │                           │           │                   │
     │         │                           │           │  ┌────────────────▼──┐
     │         │                           │           │  │ Signal Engine V2  │
     │         │                           │           │  │ + V3 (HMM)        │
     │         │                           │           │  │                   │
     │         │                           │           │  │ EMA/RSI/ADX/VWAP  │
     │         │                           │           │  │ OBI/Pressure      │
     │         │                           │           │  │ HMM Regime Gate   │
     │         │                           │           │  └────────┬──────────┘
     │         │                           │           │           │
     │         │                           │           │  ┌────────▼──────────┐
     │         │                           │           │  │ Smart Order       │
     │         │                           │           │  │ Router V2         │
     │         │                           │           │  │                   │
     │         │                           │           │  │ BestPrice/Latency │
     │         │                           │           │  │ Fees/Effective    │
     │         │                           │           │  │ DepthAware        │
     │         │                           │           │  └────────┬──────────┘
     │         │                           │           │           │
     │  ┌──────▼───────┐                   │           │           │
     │  │ Order        │◄──────────────────┤◄──────────┤◄──────────┤
     │  │ Processor    │   Orders          │  Orders   │  Orders   │
     │  └──────┬───────┘                   │           │           │
     │         │                           │           │           │
     │  ┌──────▼───────┐                   │           │           │
     │  │ Fill         │──────────────────►│           │           │
     │  │ Generator    │──────────────────────────────────────────►│
     │  └──────────────┘   Fills          │  Fills    │  Fills    │
```

## C++ HFT Trade Bot — Internal Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  HFT TRADE BOT — Internal Architecture                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌────────────────────┐  │
│  │  Signal Receiver    │  │  Order Executor      │  │  Fill Producer     │  │
│  │  (WebSocket Client) │  │  (WebSocket Client)  │  │  (SHM IPC)         │  │
│  │                     │  │                     │  │                    │  │
│  │  • Parse candles    │  │  • Send orders      │  │  • Push fills      │  │
│  │  • Parse orderbook  │  │  • FIX 4.4 encode   │  │  • To AI Signal    │  │
│  │  • Parse fills      │  │  • Reconnect w/     │  │    Bot via SHM     │  │
│  │  • Reconnect w/     │  │    exponential      │  │                    │  │
│  │    exponential      │  │    backoff          │  │                    │  │
│  │    backoff          │  │                     │  │                    │  │
│  │  • Spinlock + CV    │  │                     │  │                    │  │
│  │  • Pre-alloc bufs   │  │                     │  │                    │  │
│  └────────┬────────────┘  └─────────────────────┘  └────────────────────┘  │
│           │                                                                │
│           │  SPSC Queue<Signal, 16>                                        │
│           ▼                                                                │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌────────────────────┐  │
│  │  Signal Engine V2   │  │  Pressure Model     │  │  Signal Engine V3  │  │
│  │                     │  │                     │  │  (optional)        │  │
│  │  InlineEMA(21/50)   │  │  Multi-level OBI    │  │                    │  │
│  │  InlineRSI(14)      │  │  Toxicity detect    │  │  Online HMM        │  │
│  │  InlineADX(14)      │  │  Microprice         │  │  4-state regime    │  │
│  │  InlineVWAP         │  │  Queue position     │  │  TREND_UP/DOWN     │  │
│  │  OBI (5/10/20)      │  │  Spread regime      │  │  RANGING/VOLATILE  │  │
│  │  Pressure           │  │  Price impact       │  │  Viterbi decode    │  │
│  │                     │  │                     │  │  Online Baum-Welch │  │
│  │  Composite score    │  │                     │  │  Regime gating     │  │
│  │  → BUY/SELL/HOLD    │  │                     │  │  → Boost/dampen    │  │
│  │  → Confidence 0-100 │  │                     │  │  → Widen stops     │  │
│  │  → SL/TP (ATR)      │  │                     │  │                    │  │
│  │  → Leverage         │  │                     │  │                    │  │
│  └────────┬────────────┘  └─────────────────────┘  └────────────────────┘  │
│           │                                                                │
│           ▼                                                                │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌────────────────────┐  │
│  │  Risk Manager       │  │  Kill Switch        │  │  Position Manager  │  │
│  │                     │  │                     │  │  V2                │  │
│  │  • Max risk %       │  │  • File trigger     │  │  • Track positions │  │
│  │  • Max positions    │  │  • SHM notify       │  │  • SL/TP monitor   │  │
│  │  • Daily loss limit │  │  • Atomic flag      │  │  • PnL calc        │  │
│  │  • Margin check     │  │                     │  │                    │  │
│  └────────┬────────────┘  └─────────────────────┘  └────────────────────┘  │
│           │                                                                │
│           ▼                                                                │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌────────────────────┐  │
│  │  Smart Order        │  │  Adaptive Order     │  │  System Monitor    │  │
│  │  Router V2          │  │  Selector V2        │  │                    │  │  │
│  │                     │  │                     │  │  • Atomic counters │  │
│  │  5 strategies:      │  │  IOC/FOK/GTD/Post   │  │  • Orders/Signals  │  │
│  │  BestPrice          │  │  Decision matrix:   │  │  • Errors/Uptime   │  │
│  │  LowestLatency      │  │  confidence×spread  │  │  • Health server   │  │
│  │  LowestFees         │  │  ×OBI×toxicity      │  │  • JSON endpoint   │  │
│  │  BestEffective      │  │  Exchange-specific  │  │                    │  │
│  │  DepthAware         │  │  mappings           │  │                    │  │
│  └─────────────────────┘  └─────────────────────┘  └────────────────────┘  │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  MAIN LOOP — Event-driven (condition_variable)                      │   │
│  │  • Thread pinned to core 2                                           │   │
│  │  • Zero heap allocations in hot path                                 │   │
│  │  • Pre-allocated candle/orderbook buffers                            │   │
│  │  • SPSC queue for AI signals (lock-free)                             │   │
│  │  • Latency: sub-millisecond signal generation                        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## AI Signal Bot — 8-Stage Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  AI SIGNAL BOT — 8-Stage Signal Pipeline                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Market Data (WS :8765)                                                     │
│       │                                                                     │
│       ▼                                                                     │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │ 1. Trend         │  │ 2. Mean         │  │ 3. FFT          │             │
│  │    Following     │  │    Reversion    │  │    Cycle        │             │
│  │                  │  │                 │  │    Detection    │             │
│  │  • EMA crossover │  │  • Bollinger    │  │  • FFT spectrum │             │
│  │  • MACD          │  │  • Z-score      │  │  • Dominant     │             │
│  │  • ADX filter    │  │  • RSI extreme  │  │    cycle        │             │
│  │  • Momentum      │  │  • Revert target│  │  • Phase align  │             │
│  └────────┬─────────┘  └────────┬────────┘  └────────┬────────┘             │
│           │                     │                     │                     │
│           ▼                     ▼                     ▼                     │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │ 4. Sentiment     │  │ 5. Statistical  │  │ 6. ML Ensemble  │             │
│  │    Strategy      │  │    Arbitrage    │  │                  │             │
│  │                  │  │                 │  │  • LightGBM      │             │
│  │  • News events   │  │  • Pairs trading│  │  • HMM regime    │             │
│  │  • Event impact  │  │  • Cointegration│  │  • Feature eng   │             │
│  │  • Sentiment     │  │  • Kalman filter│  │  • Walk-forward  │             │
│  │    score         │  │  • Spread       │  │                  │             │
│  └────────┬─────────┘  └────────┬────────┘  └────────┬────────┘             │
│           │                     │                     │                     │
│           └──────────┬──────────┘                     │                     │
│                      │                                │                     │
│                      ▼                                ▼                     │
│           ┌──────────────────────────────────────────────┐                  │
│           │  7. Ensemble Vote                             │                  │
│           │                                               │                  │
│           │  • Weighted voting across all strategies      │                  │
│           │  • Confidence = weighted average              │                  │
│           │  • Direction = majority vote                  │                  │
│           └──────────────────────┬────────────────────────┘                  │
│                                  │                                           │
│                                  ▼                                           │
│           ┌──────────────────────────────────────────────┐                  │
│           │  8. Risk Manager                              │                  │
│           │                                               │                  │
│           │  • Position size limits                       │                  │
│           │  • Max concurrent positions                   │                  │
│           │  • Daily loss limits                          │                  │
│           │  • Kill switch check                          │                  │
│           └──────────────────────┬────────────────────────┘                  │
│                                  │                                           │
│                                  ▼                                           │
│           ┌──────────────────────────────────────────────┐                  │
│           │  LLM Engine (optional)                        │                  │
│           │                                               │                  │
│           │  • GPT explanation for each signal            │                  │
│           │  • Rule-based fallback if no API key          │                  │
│           └──────────────────────┬────────────────────────┘                  │
│                                  │                                           │
│                                  ▼                                           │
│           Signal Publisher (WS :8766)                                        │
│           → Broadcast to HFT Trade Bot + Web UI                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Deployment Topology

```
┌─────────────────────────────────────────────────────────────────────┐
│  Docker Compose / Kubernetes (Helm)                                 │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ exchange-sim │  │ ai-signal-bot│  │ hft-trade-bot│              │
│  │  Port 8765   │  │  Port 8766   │  │              │              │
│  │  Port 8775   │  │  Port 8080   │  │              │              │
│  │  (metrics)   │  │  Port 9090   │  │              │              │
│  │              │  │  (metrics)   │  │              │              │
│  │  Health: WS  │  │  Health: WS  │  │  Health: PID │              │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘              │
│         │                 │                 │                       │
│         │    trading-net (bridge)           │                       │
│         │◄────────────────┤◄────────────────┤                       │
│         │                 │                 │                       │
│  ┌──────┴─────────────────┴─────────────────┴──────┐               │
│  │              web-ui                              │               │
│  │              Port 3000                           │               │
│  │              (Nginx + React static)              │               │
│  └──────────────────────────────────────────────────┘               │
│                                                                     │
│  ┌──────────────────────────────────────────────────────┐           │
│  │  Monitoring (staging/prod)                           │           │
│  │                                                      │           │
│  │  ┌──────────────┐    ┌──────────────┐               │           │
│  │  │ Prometheus   │───►│ Grafana      │               │           │
│  │  │ Port 9090    │    │ Port 3000    │               │           │
│  │  │ (scrape)     │    │ (dashboard)  │               │           │
│  │  └──────────────┘    └──────────────┘               │           │
│  └──────────────────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────────────┘
```

## WebSocket Message Flow

```
Client                          Server
  │                               │
  │── subscribe ─────────────────►│
  │◄── welcome ──────────────────│
  │                               │
  │◄── snapshot ─────────────────│  (initial state)
  │◄── candle ───────────────────│  (OHLCV updates)
  │◄── orderbook ────────────────│  (order book deltas)
  │◄── fill ─────────────────────│  (order fills)
  │◄── fills_batch ──────────────│  (batched fills)
  │◄── position ─────────────────│  (position updates)
  │◄── trading_state ────────────│  (trading active/stopped)
  │                               │
  │── submit_order ──────────────►│
  │◄── fill ─────────────────────│
  │                               │
  │── ping ──────────────────────►│
  │◄── pong ─────────────────────│
  │                               │
  │  (disconnection)              │
  │── subscribe ─────────────────►│
  │── sync_state (last_ts) ──────►│
  │◄── sync_state (missed data) ─│  (historical recovery)
  │◄── candle (latest) ──────────│
  │◄── orderbook (current) ──────│
```
