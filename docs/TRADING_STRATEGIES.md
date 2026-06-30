# Trading Strategies

## Overview

The system uses a multi-strategy ensemble approach with two signal generation paths:

1. **AI Signal Bot (Python)** — Slower, comprehensive analysis with multiple indicators, risk management, and backtesting
2. **HFT Trade Bot (C++20 v2.0)** — Sub-millisecond signals from order book microstructure with latency-optimized V2 engine

## AI Signal Bot Strategies

### Trend Following

**Indicators:** EMA (fast/slow), ADX, ATR
**Entry conditions:**
- EMA fast crosses above EMA slow -> LONG
- EMA fast crosses below EMA slow -> SHORT
- ADX must be above threshold (default: 25) — confirms trending market

**Confidence calculation:**
```
confidence = min(95, 50 + ADX_value)
```

**Stop Loss / Take Profit:**
- SL = entry_price - 2 x ATR (long) / entry_price + 2 x ATR (short)
- TP = entry_price + 3 x ATR (long) / entry_price - 3 x ATR (short)

**Parameters:**
| Parameter | Default | Description |
|-----------|---------|-------------|
| ema_fast | 9 | Fast EMA period |
| ema_slow | 21 | Slow EMA period |
| adx_threshold | 25.0 | Minimum ADX for trend confirmation |

### Mean Reversion

**Indicators:** RSI, Bollinger Bands, ATR
**Entry conditions:**
- RSI <= oversold (30) AND price <= lower BB -> LONG
- RSI >= overbought (70) AND price >= upper BB -> SHORT

**Confidence calculation:**
```
confidence = min(90, 50 + |RSI - threshold| x 2)
```

**Stop Loss / Take Profit:**
- SL = entry_price - 1.5 x ATR (long) / entry_price + 1.5 x ATR (short)
- TP = Bollinger Band middle line (mean reversion target)

**Parameters:**
| Parameter | Default | Description |
|-----------|---------|-------------|
| rsi_oversold | 30 | RSI level for oversold condition |
| rsi_overbought | 70 | RSI level for overbought condition |
| bb_period | 20 | Bollinger Band period |
| bb_std | 2.0 | Bollinger Band standard deviations |

### FFT Cycle Strategy

**Indicators:** FFT power spectrum, spectral trend score, FFT low-pass filter, ATR

**Regime detection:**
- Computes FFT on price series (minimum 64 candles)
- Classifies market into three regimes:
  - **TRENDING** — Low-frequency energy dominates (trend_score > 0.3)
  - **RANGING** — High-frequency energy dominates (trend_score < -0.2)
  - **MIXED** — Balanced spectrum

**Signal generation by regime:**
- **TRENDING:** Follow smoothed price direction (FFT low-pass filtered slope)
  - LONG if smoothed slope > 0, SHORT if < 0
  - Confidence: 50 + |trend_score| x 50 (max 85)
  - SL = 2.5 x ATR, TP = 4 x ATR
- **RANGING:** Mean-revert at cycle extremes
  - Compare current price to FFT smoothed midpoint (in ATR units)
  - LONG if deviation < -1.5 sigma, SHORT if > +1.5 sigma
  - TP = smoothed midpoint (cycle target)
  - Confidence: 45 + cycle_strength x 40 (max 80)
- **MIXED:** Use trend score as directional bias
  - Requires |trend_score| > 0.15 AND smoothed slope agreement
  - Confidence: 35 + |trend_score| x 30 (max 60)

**Parameters:**
| Parameter | Default | Description |
|-----------|---------|-------------|
| min_data | 64 | Minimum candles for FFT analysis |

### Ensemble Voter

Combines signals from all enabled strategies (Trend Following, Mean Reversion, FFT Cycle) using two modes:

**Majority mode:**
- Direction with most votes wins
- Minimum votes required (default: 2)

**Weighted mode:**
- Sum confidence scores for each direction
- Direction with highest total confidence wins
- Minimum votes still required

## HFT Trade Bot Strategies

### V1 Signal Engine (C++)

Fast signal generation from market microstructure:

**Indicators:**
1. **EMA Crossover** — Fast/slow EMA trend detection
2. **Order Book Imbalance (OBI)** — `(bid_vol - ask_vol) / (bid_vol + ask_vol)`
3. **VWAP** — Volume Weighted Average Price (cumulative)
4. **Price Pressure Model** — Buy vs sell pressure from candle bodies x volume
5. **FFT Spectral Trend Score** — Low-freq vs high-freq energy ratio (requires >=64 candles)
6. **FFT Smoothed Price Direction** — Low-pass filtered price slope (requires >=64 candles)

**Voting system:**
- Each indicator votes LONG or SHORT
- 6 total votes possible (EMA, OBI, Pressure, VWAP, FFT Trend, FFT Slope)
- Minimum 3 votes required in winning direction

**Confidence:**
```
confidence = min(95, 35 + winning_votes x 12)
```

### V2 Signal Engine (C++20, Phase 25)

The V2 engine is a complete rewrite optimized for sub-millisecond latency with no heap allocations in the hot path. All inline indicators use O(1) per-update algorithms with stack-allocated state.

**6-Indicator Weighted Composite:**

| Indicator | Weight | Implementation |
|-----------|--------|----------------|
| InlineEMA(21/50) | 0.25 | O(1) per update, crossover detection |
| InlineRSI(14) | 0.15 | Wilder's smoothing, O(1) per update |
| OBI (5/10/20 levels) | 0.20 | Multi-level + distance-weighted (linear decay) |
| VWAP Deviation | 0.10 | Running cumulative VWAP, deviation in sigma |
| InlineADX(14) | 0.10 | Wilder's smoothing, trend strength 0-100 |
| Pressure Model | 0.20 | Multi-factor composite (see below) |

**Signal generation:**
```
weighted_score = sum(indicator_vote x weight)
direction = LONG if weighted_score > 0, SHORT if < 0
confidence = min(95, 40 + |weighted_score| x 55)
```

**Configurable cooldown:** Default 5000ms between signals per symbol.

**Dynamic leverage:**
- confidence >= 85 AND ADX > 30 -> 5x leverage
- confidence >= 75 -> 3x leverage
- else -> 1x leverage

### Pressure Model (V2)

Multi-factor order book microstructure model:

| Component | Description |
|-----------|-------------|
| Multi-level OBI | 5/10/20 level OBI + distance-weighted OBI (linear decay) |
| Trade flow imbalance | Buyer vs seller initiated volume ratio |
| Toxicity detection | Large aggressive orders -> toxic score [0, 1] |
| Queue position | Estimated queue position at best bid/ask |
| Spread regime | TIGHT (<1bp) / NORMAL (1-5bp) / WIDE (>5bp) |
| Price impact | Predicted price impact in bps |
| Microprice | Deviation from mid price in bps |

### Smart Order Router V2

Routes orders across exchanges using the `IExchange` interface (DIP/SOLID):

| Strategy | Description |
|----------|-------------|
| BestPrice | Route to exchange with best quoted price |
| LowestLatency | Route to exchange with lowest EMA latency |
| LowestFees | Route to exchange with lowest fee structure |
| BestEffective | Best price after fees + slippage |
| DepthAware | Penalize exchanges with insufficient depth |

**Anti-toxic backoff:** Exchanges with >= 5 toxic events are skipped until count decays.
**Per-exchange latency tracking:** Running EMA in microseconds.

### Adaptive Order Type Selector V2

Dynamically selects order type based on market conditions:

| Condition | Order Type |
|-----------|------------|
| Emergency (conf >= 95) | FOK (Fill or Kill) |
| Toxic (score >= 0.5) | IOC (Immediate or Cancel) |
| High confidence + tight spread | IOC |
| Large order vs thin depth | GTD (Good Till Date) |
| Low confidence + wide spread | PostOnly |

Exchange-specific mappings configured for Binance, OKX, and Bybit.

### V1 Order Type Selector (legacy)

Chooses between market and limit orders based on:
- Signal confidence (high -> market for urgency)
- Bid-ask spread (tight -> market, wide -> limit)
- Default: market order for fast execution

### Latency Optimization Infrastructure

| Component | Description |
|-----------|-------------|
| Spinlock | `_mm_pause` spinlock for sub-microsecond critical sections |
| SPSCQueue | Lock-free single-producer single-consumer ring buffer |
| ObjectPool | Pre-allocated object pool, no heap allocations in hot path |
| LatencyHistogram | 35 microsecond-buckets, P50/P95/P99/P99.9 tracking |
| ScopedLatency | RAII timer with microsecond precision |
| ThreadAffinity | Pin thread to CPU core, set real-time priority |
| CircuitBreaker | 5 errors -> 30s cooldown -> half-open probe recovery |
| RetryPolicy | Exponential backoff (3 attempts, 500ms x 2^n, 0-30% jitter) |

**Cache-line alignment:** All hot-path structs use `alignas(64)` to prevent false sharing: `AlignedOrderBookLevel`, `FastSignal`, `FastOrder`, `PressureResult`, `RoutingDecision`.

**Compiler flags:** `-O3`, `-flto` (LTO), `-msse4.2`, `-ffast-math`, `-finline-functions`

## Risk Management

### Pre-Trade Checks (both bots)

| Check | Rule |
|-------|------|
| Minimum confidence | Signal confidence >= 65% |
| Minimum R:R ratio | Reward/Risk >= 1.5 |
| Max daily drawdown | Daily loss < 8% of balance |
| Max open positions | <= 3 simultaneous positions |
| Duplicate prevention | 5-minute cooldown per symbol |

### Position Sizing

**Standard:**
```
risk_amount = balance x max_risk_per_trade_pct / 100
quantity = risk_amount / |entry_price - stop_loss|
```
Capped at `max_position_size_pct` of balance.

**Kelly Criterion (AI Signal Bot):**
```
f* = (p x b - q) / b
where:
  p = win probability (from historical win rate)
  b = win/loss ratio (avg win / avg loss)
  q = 1 - p
  f_actual = f* x kelly_fraction (default: 0.5 for half-Kelly)
```
Confidence-scaled: `position_size = kelly_size x (confidence / 100)`

### Risk Manager (AI Signal Bot)

Advanced risk management with multiple exit strategies:

| Feature | Description |
|---------|-------------|
| Trailing Stop | Moves SL as price moves favorably. Fixed % or ATR-based (ATR multiplier configurable) |
| Breakeven Move | Moves SL to entry price after price reaches configured profit threshold |
| Partial Take Profit | Closes a configurable portion of position at first TP level, lets rest run |
| Max Hold Time | Auto-closes position after configurable time limit (prevents stuck positions) |

### Stop Loss / Take Profit

Automatically monitored on every price update:
- Long: SL if price <= stop_loss, TP if price >= take_profit
- Short: SL if price >= stop_loss, TP if price <= take_profit

## Backtesting

### Backtest Engine (AI Signal Bot)

Run historical strategy backtests with realistic modeling:

| Feature | Description |
|---------|-------------|
| Fee modeling | Per-exchange maker/taker fees |
| Slippage modeling | Configurable slippage per order |
| Position simulation | Full position lifecycle with SL/TP |
| Performance metrics | Return, win rate, profit factor, Sharpe, max drawdown, Calmar ratio |
| Drawdown analysis | Longest duration, average, recovery factor |
| Equity curve | Full equity curve tracking |
| Order book replay | Synthetic order book generation from OHLCV for OBI/pressure backtesting |

### Strategy Optimization

| Feature | Description |
|---------|-------------|
| Grid search | Exhaustive parameter search across configurable ranges |
| Fitness functions | 4 options: total return, Sharpe ratio, Calmar ratio, profit factor |
| Walk-forward validation | Out-of-sample validation with rolling window |
| Kelly sizing | Backtest with Kelly Criterion position sizing |

### Backtest WebSocket Endpoint

Backtests can be triggered from the Web UI via WebSocket :8766:
- Send `run_backtest` message with strategy config
- Receive `backtest_result` with equity curves and metrics
- Compare multiple strategy equity curves side-by-side

## Technical Indicators Reference

| Indicator | Period | Purpose |
|-----------|--------|---------|
| RSI | 14 | Momentum / overbought-oversold |
| EMA | 9/21/50 | Trend direction |
| SMA | 20/50 | Trend direction / support |
| MACD | 12/26/9 | Trend momentum |
| Bollinger Bands | 20 (2 sigma) | Volatility / mean reversion |
| ATR | 14 | Volatility-based SL/TP |
| ADX | 14 | Trend strength filter |
| VWAP | cumulative | Fair price reference |
| OBI | 5/10/20 levels | Order book imbalance |
| FFT Spectrum | 64+ bars | Cycle detection / regime classification |
| FFT Low-pass | 15% freq | Price smoothing / noise removal |
| OBV | - | On-balance volume |
| MFI | 14 | Money flow index |
| Williams %R | 14 | Overbought-oversold |
| Stochastic | 14/3 | Momentum oscillator |
| CCI | 20 | Commodity Channel Index |
| Ichimoku | 9/26/52 | Cloud-based trend system |
| Parabolic SAR | 0.02/0.2 | Trend reversal detection |
| Awesome Oscillator | 5/34 | Momentum |

## V2 Configuration

The V2 engine is configured in `config/config.yaml` under these sections:

| Section | Description |
|---------|-------------|
| `signal_engine_v2` | V2 engine enable, weights, cooldown, leverage thresholds |
| `pressure_model` | OBI levels, toxicity thresholds, spread regime bounds |
| `smart_order_router` | Routing strategy, latency tracking, anti-toxic backoff |
| `adaptive_order_selector` | Order type thresholds, exchange-specific mappings |
| `latency_optimization` | Thread affinity, real-time priority, histogram buckets |

**V1 fallback:** Set `signal_engine_v2_enabled: false` to use the V1 engine.
