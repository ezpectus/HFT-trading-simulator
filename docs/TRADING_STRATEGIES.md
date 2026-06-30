# Trading Strategies

## Overview

The system uses a multi-strategy ensemble approach with two signal generation paths:

1. **AI Signal Bot (Python)** — Slower, comprehensive analysis with multiple indicators
2. **HFT Trade Bot (C++)** — Fast, low-latency signals from order book microstructure

## AI Signal Bot Strategies

### Trend Following

**Indicators:** EMA (fast/slow), ADX, ATR  
**Entry conditions:**
- EMA fast crosses above EMA slow → LONG
- EMA fast crosses below EMA slow → SHORT
- ADX must be above threshold (default: 25) — confirms trending market

**Confidence calculation:**
```
confidence = min(95, 50 + ADX_value)
```

**Stop Loss / Take Profit:**
- SL = entry_price - 2 × ATR (long) / entry_price + 2 × ATR (short)
- TP = entry_price + 3 × ATR (long) / entry_price - 3 × ATR (short)

**Parameters:**
| Parameter | Default | Description |
|-----------|---------|-------------|
| ema_fast | 9 | Fast EMA period |
| ema_slow | 21 | Slow EMA period |
| adx_threshold | 25.0 | Minimum ADX for trend confirmation |

### Mean Reversion

**Indicators:** RSI, Bollinger Bands, ATR  
**Entry conditions:**
- RSI ≤ oversold (30) AND price ≤ lower BB → LONG
- RSI ≥ overbought (70) AND price ≥ upper BB → SHORT

**Confidence calculation:**
```
confidence = min(90, 50 + |RSI - threshold| × 2)
```

**Stop Loss / Take Profit:**
- SL = entry_price - 1.5 × ATR (long) / entry_price + 1.5 × ATR (short)
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
  - Confidence: 50 + |trend_score| × 50 (max 85)
  - SL = 2.5 × ATR, TP = 4 × ATR
- **RANGING:** Mean-revert at cycle extremes
  - Compare current price to FFT smoothed midpoint (in ATR units)
  - LONG if deviation < -1.5σ, SHORT if > +1.5σ
  - TP = smoothed midpoint (cycle target)
  - Confidence: 45 + cycle_strength × 40 (max 80)
- **MIXED:** Use trend score as directional bias
  - Requires |trend_score| > 0.15 AND smoothed slope agreement
  - Confidence: 35 + |trend_score| × 30 (max 60)

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

### HFT Signal Engine (C++)

Fast signal generation from market microstructure:

**Indicators:**
1. **EMA Crossover** — Fast/slow EMA trend detection
2. **Order Book Imbalance (OBI)** — `(bid_vol - ask_vol) / (bid_vol + ask_vol)`
3. **VWAP** — Volume Weighted Average Price (cumulative)
4. **Price Pressure Model** — Buy vs sell pressure from candle bodies × volume
5. **FFT Spectral Trend Score** — Low-freq vs high-freq energy ratio (requires ≥64 candles)
6. **FFT Smoothed Price Direction** — Low-pass filtered price slope (requires ≥64 candles)

**Voting system:**
- Each indicator votes LONG or SHORT
- 6 total votes possible (EMA, OBI, Pressure, VWAP, FFT Trend, FFT Slope)
- Minimum 3 votes required in winning direction

**Confidence:**
```
confidence = min(95, 35 + winning_votes × 12)
```

### Order Type Selector

Chooses between market and limit orders based on:
- Signal confidence (high → market for urgency)
- Bid-ask spread (tight → market, wide → limit)
- Default: market order for fast execution

## Risk Management

### Pre-Trade Checks (both bots)

| Check | Rule |
|-------|------|
| Minimum confidence | Signal confidence ≥ 65% |
| Minimum R:R ratio | Reward/Risk ≥ 1.5 |
| Max daily drawdown | Daily loss < 8% of balance |
| Max open positions | ≤ 3 simultaneous positions |
| Duplicate prevention | 5-minute cooldown per symbol |

### Position Sizing

```
risk_amount = balance × max_risk_per_trade_pct / 100
quantity = risk_amount / |entry_price - stop_loss|
```

Capped at `max_position_size_pct` of balance.

### Stop Loss / Take Profit

Automatically monitored on every price update:
- Long: SL if price ≤ stop_loss, TP if price ≥ take_profit
- Short: SL if price ≥ stop_loss, TP if price ≤ take_profit

## Technical Indicators Reference

| Indicator | Period | Purpose |
|-----------|--------|---------|
| RSI | 14 | Momentum / overbought-oversold |
| EMA | 9/21 | Trend direction |
| MACD | 12/26/9 | Trend momentum |
| Bollinger Bands | 20 (2σ) | Volatility / mean reversion |
| ATR | 14 | Volatility-based SL/TP |
| ADX | 14 | Trend strength filter |
| VWAP | cumulative | Fair price reference |
| OBI | 10 levels | Order book imbalance |
| FFT Spectrum | 64+ bars | Cycle detection / regime classification |
| FFT Low-pass | 15% freq | Price smoothing / noise removal |
