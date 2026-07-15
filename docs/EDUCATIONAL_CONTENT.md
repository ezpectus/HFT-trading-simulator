# Educational Content — HFT Trading Simulator

## Table of Contents

1. [Introduction to High-Frequency Trading](#1-introduction-to-high-frequency-trading)
2. [Market Microstructure](#2-market-microstructure)
3. [Order Types and Execution](#3-order-types-and-execution)
4. [Technical Indicators](#4-technical-indicators)
5. [Signal Generation](#5-signal-generation)
6. [Risk Management](#6-risk-management)
7. [Backtesting](#7-backtesting)
8. [Machine Learning in Trading](#8-machine-learning-in-trading)
9. [Options and Greeks](#9-options-and-greeks)
10. [Portfolio Theory](#10-portfolio-theory)
11. [Glossary](#11-glossary)

---

## 1. Introduction to High-Frequency Trading

### What is HFT?

High-Frequency Trading (HFT) is a subset of algorithmic trading that uses
powerful computers to transact a large number of orders at extremely high
speeds (microseconds to milliseconds). HFT firms compete on speed, not on
directional views.

### Key Characteristics

- **Speed**: Orders submitted in microseconds (μs)
- **Quantity**: Thousands of orders per second
- **Holding period**: Seconds to minutes (rarely hours)
- **Profit per trade**: Small (cents or fractions), but high volume
- **Technology-driven**: Co-location, FPGA, kernel bypass

### This Simulator

This is an **educational** simulator — no real money is at risk. It teaches:
- How order books work
- How signals are generated
- How risk is managed
- How strategies are backtested

---

## 2. Market Microstructure

### Order Book

The order book is a real-time list of all buy (bid) and sell (ask) orders:

```
BIDS (buyers)          ASKS (sellers)
Price   Quantity       Price   Quantity
65100.50  2.5          65100.55  1.8
65100.45  5.0          65100.60  3.2
65100.40  8.0          65100.65  6.0
```

- **Best bid**: 65100.50 (highest buy price)
- **Best ask**: 65100.55 (lowest sell price)
- **Spread**: 0.05 (difference between best ask and best bid)
- **Mid price**: 65100.525 (average of best bid and best ask)

### Order Book Imbalance (OBI)

OBI measures the ratio of buy vs sell volume in the order book:

```
OBI = (bid_volume - ask_volume) / (bid_volume + ask_volume)
```

- OBI > 0: More buyers → price likely to rise
- OBI < 0: More sellers → price likely to fall

### Price Impact

Large orders move the market. Kyle's lambda measures this:

```
ΔPrice = λ × OrderSize
```

A high lambda means the market is illiquid — large orders cause big price moves.

---

## 3. Order Types and Execution

### Market Order
Executes immediately at the best available price. Guaranteed fill, but
you may get a worse price than expected (slippage).

### Limit Order
Specifies a maximum (buy) or minimum (sell) price. You control the price,
but the order may not fill.

### IOC (Immediate or Cancel)
A limit order that cancels any unfilled portion immediately. Popular in HFT
because it avoids queue position risk.

### FOK (Fill or Kill)
Either fills the entire order immediately, or cancels completely.

### Post-Only
A limit order that is never placed if it would execute against the book.
Ensures you always provide liquidity (and earn rebates).

---

## 4. Technical Indicators

### RSI (Relative Strength Index)
```
RSI = 100 - 100/(1 + RS)
RS = Average Gain / Average Loss (over N periods)
```
- RSI < 30: Oversold (potential buy)
- RSI > 70: Overbought (potential sell)

> **Implementation note:** Our C++ `InlineRSI` uses Wilder's smoothing with a precomputed
> complement (`inv_period_complement_ = 1.0 - 1.0/period`). Each update is O(1):
> `avg_gain = avg_gain * complement + gain * inv_period`. No division in the hot path.
> See [PERFORMANCE.md](PERFORMANCE.md) Example 22 for details.

### EMA (Exponential Moving Average)
```
EMA = α × Price + (1-α) × Previous_EMA
α = 2/(N+1)
```
Gives more weight to recent prices. EMA crossovers (fast EMA crosses slow EMA)
are common trend signals.

### MACD (Moving Average Convergence Divergence)
```
MACD = EMA(12) - EMA(26)
Signal = EMA(9) of MACD
Histogram = MACD - Signal
```

### ATR (Average True Range)
Measures volatility. Used for stop-loss placement:
```
Stop-loss = Entry - 2 × ATR (for longs)
```

### Bollinger Bands
```
Upper = SMA(20) + 2σ
Lower = SMA(20) - 2σ
```
Price touching lower band = potential oversold.

---

## 5. Signal Generation

### What is a Signal?

A signal is a rule that tells you when to buy, sell, or hold. A good signal
has **positive expectancy** — it wins more than it loses over many trades.

### Signal Confidence

Each signal has a confidence score (0-1):
- 0.0-0.3: Weak signal (ignore)
- 0.3-0.6: Moderate signal (small position)
- 0.6-0.8: Strong signal (normal position)
- 0.8-1.0: Very strong (but check for overfitting)

### Ensemble Signals

Combine multiple signals for better accuracy:
```
Composite = 0.3 × RSI_signal + 0.3 × EMA_signal + 0.2 × OBI_signal + 0.2 × MACD_signal
```

---

## 6. Risk Management

### Position Sizing (Kelly Criterion)
```
Kelly = W - (1-W)/R
W = win rate, R = win/loss ratio
```
Use **half-Kelly** for safety: `position = capital × Kelly × 0.5`

### Stop-Loss and Take-Profit
- **Stop-loss**: Automatic close at a loss threshold
- **Take-profit**: Automatic close at a profit target
- **Risk:Reward**: Always aim for at least 1:2 (risk $1 to make $2)

### Maximum Drawdown
The largest peak-to-trough decline. A good strategy has max drawdown < 15%.

### VaR (Value at Risk)
```
VaR_95 = portfolio_value × |percentile_5(returns)|
```
"There is a 5% chance of losing more than $X in one day."

---

## 7. Backtesting

### What is Backtesting?

Running your strategy on historical data to see how it would have performed.

### Key Metrics
- **Sharpe ratio**: Risk-adjusted return (> 1.0 is good, > 2.0 is excellent)
- **Sortino ratio**: Like Sharpe but only penalizes downside volatility
- **Max drawdown**: Worst peak-to-trough decline
- **Win rate**: Percentage of profitable trades
- **Profit factor**: Gross profit / gross loss (> 1.5 is good)

### Walk-Forward Analysis
Split data into segments. Optimize on segment 1, test on segment 2,
then roll forward. Prevents overfitting.

### Common Pitfalls
1. **Overfitting**: Too many parameters → works on past, fails in future
2. **Look-ahead bias**: Using data that wasn't available at the time
3. **Survivorship bias**: Only testing on stocks that survived
4. **Ignoring costs**: Transaction costs can turn a winning strategy into a loser

---

## 8. Machine Learning in Trading

### LSTM (Long Short-Term Memory)
A neural network that remembers patterns over time. Good for:
- Price direction prediction
- Volatility forecasting
- Pattern recognition

### Transformer
Self-attention mechanism — can weigh the importance of each historical
data point. Outperforms LSTM on long sequences.

### Reinforcement Learning (RL)
An agent learns by trial and error:
- **State**: Current market conditions
- **Action**: Buy, sell, hold
- **Reward**: Profit/loss

PPO (Proximal Policy Optimization) is the most stable RL algorithm for trading.

### ONNX Runtime
ML models trained in Python (PyTorch) are exported to ONNX format and
loaded in C++ for sub-microsecond inference — no Python overhead.

---

## 9. Options and Greeks

### Black-Scholes Model
```
Call = S × N(d1) - K × e^(-rT) × N(d2)
d1 = [ln(S/K) + (r + σ²/2)T] / (σ√T)
d2 = d1 - σ√T
```

### Greeks
- **Delta**: Price change per $1 move in underlying (0-1 for calls)
- **Gamma**: Rate of delta change (curvature)
- **Theta**: Time decay per day (negative for long options)
- **Vega**: Price change per 1% volatility change
- **Rho**: Price change per 1% interest rate change

### Delta Hedging
Maintain a delta-neutral position by buying/selling the underlying:
```
hedge = -delta × option_quantity
```
Rebalance when delta changes beyond a threshold.

---

## 10. Portfolio Theory

### Markowitz (Mean-Variance)
Maximize Sharpe ratio:
```
Sharpe = (Expected Return - Risk-Free Rate) / Volatility
```

### Risk Parity
Equalize risk contribution across all assets. More stable than Markowitz
because it doesn't depend on return estimates.

### Black-Litterman
Combine market equilibrium with your own views:
```
Posterior = Equilibrium + Views × Confidence
```

### Efficient Frontier
The set of optimal portfolios that offer the highest expected return
for a given level of risk.

---

## 11. Glossary

| Term | Definition |
|------|-----------|
| Alpha | Excess return above benchmark |
| Beta | Sensitivity to market movements |
| Bid-Ask Spread | Difference between best bid and best ask |
| Co-location | Placing servers in the exchange's data center |
| Drawdown | Peak-to-trough decline |
| Fill | Order execution confirmation |
| Latency | Time from signal to order execution |
| Leverage | Borrowed capital for trading |
| Liquidity | Ease of buying/selling without price impact |
| Maker | Order that provides liquidity (limit order) |
| Taker | Order that removes liquidity (market order) |
| Slippage | Difference between expected and actual fill price |
| Tick | Smallest price increment |
| Volatility | Standard deviation of returns |
| VPIN | Volume-Synchronized Probability of Informed Trading |
