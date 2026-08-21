# Trading Strategies

## Overview

The system uses a multi-strategy ensemble approach with two signal generation paths:

1. **AI Signal Bot (Python)** — Slower, comprehensive analysis with multiple indicators, risk management, and backtesting
2. **HFT Trade Bot (C++20 v2.0)** — Sub-millisecond signals from order book microstructure with latency-optimized V2 engine

### Why Multiple Strategies?

No single strategy works in all market conditions. Trends persist for a while, then
break down into ranges. Some periods are calm, others are volatile. By running multiple
strategies simultaneously and combining their signals through an ensemble voter, the
system adapts to changing market regimes:

- **Trend strategies** capture directional moves but lose in ranges
- **Mean reversion strategies** profit in ranges but get stopped out in trends
- **FFT cycle strategies** detect periodicity that neither trend nor MR can see
- **Arbitrage strategies** exploit structural inefficiencies independent of direction
- **Sentiment strategies** react to news events that technical analysis cannot predict

The ensemble voter requires at least 2 strategies to agree before emitting a signal,
filtering out noise from any single strategy.

---

## AI Signal Bot Strategies

### Trend Following

**Why this strategy exists:** Markets trend — prices move directionally for extended
periods due to momentum, news flow, and herd behavior. Trend following captures these
moves with defined risk.

**What problem it solves:** Without trend following, the system would miss sustained
directional moves. A pure mean-reversion approach would keep fighting a strong trend
and accumulate losses. Trend following identifies when a trend is strong enough to
trade and rides it until it reverses.

**Theory:** Trend following is based on the **momentum effect** — assets
that performed well in the past tend to continue performing well
(Jegadeesh & Titman, 1993). This is a behavioral bias: herding,
underreaction to news, slow information diffusion.

**EMA crossover:** Fast EMA (9) crosses slow EMA (21) — momentum shift
signal. EMA uses exponential weighting: recent prices matter more than
old ones. α = 2/(N+1). EMA reacts faster than SMA.

**ADX filter:** ADX > 25 = market is in a strong trend. ADX < 20 = ranging.
Without the ADX filter, EMA crossover generates many false signals in
sideways markets (whipsaw). ADX is a filter, not a direction indicator.

**ATR for SL/TP:** ATR = Average True Range = volatility measure.
SL = 2×ATR (volatility-adaptive). TP = 3×ATR (R:R = 1.5).
High volatility → wider SL (avoid noise stop-out).
Low volatility → tighter SL (less risk).

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

**Why this strategy exists:** Markets spend ~70% of the time in ranges, not trends.
Prices oscillate around a mean due to equilibrium-seeking behavior of buyers and sellers.
Mean reversion exploits this by betting that extreme prices will revert to the average.

**What problem it solves:** Trend following loses money in ranging markets (whipsaw).
Mean reversion complements trend following by profiting exactly when trends fail.
The RSI + Bollinger Bands combination identifies statistically extreme prices that
have a high probability of reverting.

**Theory:** Mean reversion is based on the **overreaction hypothesis**
(De Bondt & Thaler, 1985) — markets overreact to news, price deviates
from fundamental value, then reverts. RSI < 30 = oversold (overreaction
to bad news), RSI > 70 = overbought.

**Bollinger Bands confirmation:** BB = SMA ± 2σ. Price outside 2σ =
statistical anomaly (95% of normal distribution within 2σ).
Price below lower BB + RSI < 30 = double confirmation oversold.

**TP = BB middle line:** Target = reversion to the mean (SMA).
Not a trend target — a mean reversion target. SL = 1.5×ATR (tighter
than trend following, because ranging markets have lower volatility).

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

**Why this strategy exists:** Financial markets contain cyclical components — regular
oscillations caused by trading sessions, funding intervals, settlement cycles, and
behavioral patterns. FFT (Fast Fourier Transform) decomposes price series into its
frequency components, revealing hidden cycles that are invisible to time-domain indicators.

**What problem it solves:** Trend following and mean reversion are time-domain strategies
— they look at price over time. But markets also have frequency-domain structure. FFT
detects dominant cycles and classifies the market regime (trending vs ranging vs mixed)
based on spectral energy distribution. This allows the system to switch between
trend-following and mean-reversion behavior automatically, adapting to the current
cycle structure.

**Theory:** FFT (Fast Fourier Transform) transforms a price series
from the time domain to the frequency domain. Any signal can be
decomposed into a sum of sinusoids of different frequencies.

**Spectral analysis for trading:**
- **Low frequencies** (long periods) = trend component
- **High frequencies** (short periods) = noise
- **Dominant frequency** = primary cycle

**trend_score = low_freq_energy / total_energy:**
- > 0.3: low-frequency dominates → TRENDING
- < -0.2: high-frequency dominates → RANGING
- between: MIXED

**FFT low-pass filter:** Removes high-frequency noise. Keeps the
trend. Smoothed price slope > 0 → LONG, < 0 → SHORT.

**Why FFT is unique:** Does not use standard indicators (RSI, EMA).
Analyzes frequency structure — an orthogonal approach to trend/mean-reversion.
Diversifies the ensemble (independence for the Condorcet theorem).

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

**Why this strategy exists:** Individual strategies generate false signals. No single
indicator or approach is reliable enough to trade alone. The ensemble voter combines
multiple independent strategies to filter noise and improve signal quality.

**What problem it solves:** Reduces false positives by requiring agreement across
strategies. If Trend Following says LONG but Mean Reversion says SHORT, the signal is
suppressed. Only when multiple strategies converge does the system act — this dramatically
reduces whipsaw losses and improves win rate.

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

**Why this exists:** Python is too slow for microstructure trading. The C++ engine
processes order book data in microseconds, enabling signals based on real-time order
book imbalance and trade flow that Python cannot react to fast enough.

**What problem it solves:** Provides a fast signal path that complements the slow
Python AI bot. While Python analyzes trends and complex models over seconds, the C++
engine reacts to order book changes in microseconds — capturing microstructure
opportunities that disappear in milliseconds.

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

### V2 Signal Engine (C++20)

**Why this exists:** V1 used a simple voting system with equal weights. V2 introduces
a weighted composite score, O(1) incremental indicator updates, and zero heap allocation
on the hot path — achieving sub-millisecond latency with higher signal quality.

**What problem it solves:** V1's equal-weight voting treated all indicators the same,
but some indicators (like OBI and pressure) are more predictive than others (like VWAP
deviation). V2's weighted composite assigns importance proportional to each indicator's
predictive power. The O(1) incremental updates eliminate the need to recompute indicators
from scratch on each tick, reducing latency from milliseconds to microseconds.

**Theory: Why V2 is not just "more indicators" but an architectural redesign**

V1: voting system (3/6 votes wins). Problem: binary votes lose
magnitude information. A strong EMA signal = 1 vote. A weak EMA
signal = also 1 vote.

V2: weighted composite score. Each indicator is normalized to [-1, 1]
and weighted. Strong signal → larger contribution. Weak signal →
smaller. This is **continuous scoring** instead of **binary voting**.

**O(1) incremental updates — theory:**
Each indicator updates in constant time, regardless of history length:
- EMA: `EMA_new = α·price + (1-α)·EMA_old` — 1 multiply, 1 add
- RSI: running avg_gain / avg_loss — Wilder's smoothing
- ADX: running DX smoothing — same as EMA
- VWAP: running cumulative (price×volume) / volume
- OBI: snapshot from order book — O(levels), levels fixed at 20
- Pressure: composite from order book — O(levels)

Total: 6 × O(1) = O(1). ~15-25μs per analyze() call.

**No heap allocation in hot path:**
Stack allocation = L1 cache (~1ns). Heap = malloc (~100ns).
All indicator state is stack-allocated, pre-sized at construction.
No `new`, no `malloc`, no `vector::push_back` in analyze().

**Cache-line alignment (alignas(64)):**
CPU loads data in 64-byte cache lines. If two atomics share a
cache line, writer invalidates reader's cache (false sharing).
`alignas(64)` separates them — each on its own cache line.

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

**Why this exists:** Order book imbalance alone doesn't capture the full picture of
market microstructure. Large aggressive orders, toxic flow, and queue dynamics all
affect short-term price direction. The pressure model combines these factors into a
single composite score.

**What problem it solves:** Prevents the system from trading into toxic order flow
(where large institutional orders are likely to move price against us). By detecting
toxicity and spread regime, the system avoids executing during adverse conditions
and waits for better entry points.

**Theory: Market microstructure — why the order book matters more than price**

Price = lagging indicator. Order book = leading indicator. Price shows
what happened. Order book shows what might happen next.

**Multi-level OBI:** OBI = (bid_vol - ask_vol) / (bid_vol + ask_vol).
5 levels = top of book. 10 levels = deeper. 20 levels = full depth.
Distance-weighted: levels closer to mid price matter more (linear decay).

**Trade flow imbalance:** Buyer-initiated vs seller-initiated volume.
If 80% of trades are buyer-initiated → buying pressure → price likely up.

**Toxicity detection:** Large aggressive orders (market orders that
sweep multiple levels) = toxic flow. Institutional execution =
informed flow. Price likely to move against retail traders.

**Microprice:** Weighted mid price: (bid_price × ask_vol + ask_price
× bid_vol) / (bid_vol + ask_vol). Better fair value than mid price
when order book is imbalanced.

**Spread regime:** TIGHT (<1bp) = liquid, NORMAL (1-5bp) = normal,
WIDE (>5bp) = illiquid or volatile. Determines order type selection.

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

**Why this exists:** With 3 simulated exchanges, the same symbol can have different
prices, fees, and latency. Routing all orders to one exchange leaves money on the table.

**What problem it solves:** Minimizes execution cost by selecting the best exchange
for each order based on price, fees, latency, and depth. The anti-toxic backoff
prevents routing to exchanges experiencing adverse conditions.

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

**Why this exists:** Different market conditions require different order types. A
high-confidence signal in a tight spread should execute immediately (IOC), while a
low-confidence signal in a wide spread should post passively (PostOnly) to avoid
paying the spread.

**What problem it solves:** Eliminates the need for manual order type selection.
The system automatically chooses the optimal order type based on confidence, spread,
toxicity, and depth — reducing execution costs and improving fill quality.

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

### Why Risk Management?

Even the best strategies lose money without risk management. A single oversized trade
can wipe out months of gains. The risk management system ensures:

- **No single trade can destroy the account** — position sizing limits per-trade risk
- **Drawdowns are bounded** — daily loss limits stop trading before catastrophic losses
- **Positions are managed actively** — trailing stops, breakeven moves, partial TP
- **Stuck positions are prevented** — max hold time auto-closes stale positions

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

### Why Backtesting?

Before risking capital on a strategy, you need to know how it would have performed
historically. Backtesting simulates a strategy on past data to estimate its
profitability, risk, and robustness. Without backtesting, trading is gambling.

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
