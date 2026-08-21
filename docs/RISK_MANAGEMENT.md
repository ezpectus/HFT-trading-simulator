# Risk Management

Guide to risk management models in the HFT Trading System: VaR, CVaR, Kelly criterion, position sizing, stress testing, and the position risk manager.

---

## Theory: Why risk management is 90% of trading success

### Risk-adjusted returns, not absolute returns

"I made 100% in a year" is meaningless without context. 100% with 50%
drawdown = gambling. 20% with 2% drawdown = professional. What matters
is not return, but **return per unit of risk** (Sharpe, Sortino, Calmar).

### Coherent risk measures (Artzner et al., 1999)

A risk measure must satisfy 4 axioms:
1. **Monotonicity:** If Portfolio A always loses less than B →
   Risk(A) ≤ Risk(B)
2. **Subadditivity:** Risk(A+B) ≤ Risk(A) + Risk(B) — diversification
   reduces risk
3. **Positive homogeneity:** Risk(λA) = λ·Risk(A) — scaling
4. **Translation invariance:** Risk(A + cash) = Risk(A) - cash

**VaR violates subadditivity** (it's possible that Risk(A+B) > Risk(A) + Risk(B))
— this is a problem. **CVaR is a coherent risk measure** — it satisfies
all 4 axioms. This is why CVaR is preferred over VaR for risk management.

### Risk of Ruin — why position sizing is critical

Risk of ruin = probability of losing all capital. With fixed
fractional betting (fraction f):
```
R = ((1 - edge) / (1 + edge))^(units)
```
- f = 2% (Half-Kelly): R ≈ 0.1% — practically impossible
- f = 5%: R ≈ 5% — noticeable risk
- f = 10%: R ≈ 30% — dangerous
- f = 25%: R ≈ 80% — almost guaranteed ruin

**Conclusion:** Position sizing matters more than signal quality. 2% per trade =
Half-Kelly = optimal balance between growth and safety.

### Why each risk module exists

| Module | Why it exists | Theoretical basis |
|--------|--------------|-------------------|
| **VaR** | Maximum loss at a given confidence level. Industry standard (Basel III). | Quantile estimation: historical, parametric (Gaussian), Monte Carlo |
| **CVaR** | Average loss in the worst case. Coherent risk measure (unlike VaR). | E[L \| L > VaR] — conditional expectation |
| **Kelly** | Optimal bet size for maximum long-term growth. | f* = (p·b - q) / b — maximizes E[log(wealth)] |
| **Dynamic Sizing** | Adaptation to changing volatility. | Vol-targeting: size ∝ 1/σ |
| **Stress Tests** | Survival in extreme events. Fat tails are not captured by VaR. | Historical replay: 2008, COVID, FTX, LUNA |
| **RiskManager** | Active position management. Stop loss is not set-and-forget. | Trailing stop, breakeven, partial TP — lock profits dynamically |

**Source directory:** `ai-signal-bot/src/risk/`

---

## Value at Risk (VaR)

**Why this is needed:** You need to know the maximum expected loss at a given
confidence level. VaR answers: "What's the most I can lose with 95% confidence?"
It's the industry standard risk metric used by banks, hedge funds, and regulators.

**What problem it solves:** Without VaR, you have no quantitative measure of downside
risk. You might feel a strategy is "safe" but have no number to prove it. VaR provides
a single, interpretable number: "With 95% confidence, we won't lose more than $X
in one day."

**Source:** `ai-signal-bot/src/risk/var.py`

### Historical VaR

Empirical quantile of historical returns:

```
VaR_α = -quantile(returns, 1 - α)
```

### Parametric VaR

Gaussian assumption:

```
VaR_α = -(μ - z_α * σ * sqrt(T))
```

### Monte Carlo VaR

Simulated paths using GBM:

```
S(t+dt) = S(t) * exp((μ - 0.5σ²)dt + σ√dt·Z),  Z ~ N(0,1)
```

### Kupiec Backtesting

Proportion-of-failures (POF) test validates VaR model accuracy:

```
LR = -2 * [ln((1-p)^(N-x) * p^x) - ln((1-x/N)^(N-x) * (x/N)^x)]
```

Where `N` = total observations, `x` = violations, `p` = expected violation rate.

```python
from src.risk.var import VaRCalculator

var_calc = VaRCalculator(confidence_level=0.95, time_horizon=1.0)
result = var_calc.calculate_historical_var(returns)
# result.var_value, result.confidence_level, result.time_horizon, result.method
```

---

## Conditional VaR (CVaR)

**Why this is needed:** VaR tells you the maximum loss at the 95th percentile, but
says nothing about what happens in the worst 5% of cases. CVaR (also called Expected
Shortfall) answers: "If things go bad, how bad on average?"

**What problem it solves:** VaR is blind to tail risk. Two portfolios with identical
VaR can have very different tail losses. CVaR captures the average loss beyond VaR,
giving a true picture of tail risk. This is critical for crypto, where fat tails
are common.

**Source:** `ai-signal-bot/src/risk/cvar.py`

Expected shortfall — average loss conditional on exceeding VaR:

```
CVaR_α = E[L | L > VaR_α] = -E[returns | returns < -VaR_α]
```

```python
from src.risk.cvar import CVaRCalculator

cvar_calc = CVaRCalculator(confidence_level=0.95)
result = cvar_calc.calculate_historical_cvar(returns)
# result.cvar_value, result.var_value
```

---

## Kelly Criterion

**Why this is needed:** Position sizing is more important than signal quality.
A great strategy with wrong position sizing will lose money. Kelly Criterion
provides the mathematically optimal bet size for long-term capital growth.

**What problem it solves:** Without Kelly, position sizing is guesswork. Too small
= leaving money on the table. Too large = risk of ruin. Kelly calculates the exact
fraction that maximizes long-term growth rate. Half-Kelly (used here) reduces
variance while preserving most of the growth.

**Source:** `ai-signal-bot/src/risk/kelly.py`

Optimal bet size for long-term capital growth:

```
f* = (p * b - q) / b
```

Where `p` = win probability, `q = 1-p`, `b` = win/loss ratio.

Practice: Half-Kelly (`f = f*/2`) reduces variance while preserving most growth.

```python
from src.risk.kelly import KellyPositionSizer

sizer = KellyPositionSizer(
    win_rate=0.55, avg_win=100, avg_loss=80,
    kelly_fraction=0.5,  # Half-Kelly
    max_risk_pct=5.0,
)
size = sizer.calculate(balance=10000, entry=65000, stop_loss=63000)
```

---

## Dynamic Position Sizing

**Why this is needed:** Fixed position sizing doesn't adapt to changing market
conditions. A 2% risk is too much in high volatility, too little in low volatility.
Dynamic sizing adjusts position size based on current market conditions.

**What problem it solves:** Ensures consistent risk exposure regardless of
volatility regime. In calm markets, positions are larger (volatility is low, so
risk per unit is small). In turbulent markets, positions shrink automatically.
This prevents overexposure during volatile periods and underutilization during
quiet periods.

**Source:** `ai-signal-bot/src/risk/position_sizing.py`

Multiple sizing strategies:

| Method | Formula |
|--------|---------|
| **Volatility-based** | `size = (target_risk / (ATR% * price)) * balance` |
| **Risk parity** | Equal risk contribution across positions |
| **Kelly** | Kelly fraction with caps |
| **Fixed fractional** | Fixed % of balance per trade |

```python
from src.risk.position_sizing import DynamicPositionSizer

sizer = DynamicPositionSizer(account_value=100000, max_position_size=0.2)
result = sizer.size_by_volatility(entry=65000, atr=1500, risk_per_trade=0.02)
```

---

## Stress Testing

**Why this is needed:** VaR and CVaR are based on historical data, but the worst
crashes are often unprecedented. Stress testing simulates specific catastrophic
scenarios to see if the portfolio would survive.

**What problem it solves:** Answers "What if 2008 happens again? What if FTX
collapses? What if LUNA goes to zero?" by replaying historical crash scenarios
against the current portfolio. This reveals hidden vulnerabilities that normal
risk metrics miss — like contagion effects and liquidity spirals.

**Source:** `ai-signal-bot/src/risk/stress_test.py`

Predefined crash scenarios:

| Scenario | Drawdown | Duration | Key Feature |
|----------|----------|----------|-------------|
| **2008 Financial Crisis** | ~50% | 6 months | Systemic banking failure |
| **COVID-19 Crash** | ~35% | 1 month | Fast recovery, V-shape |
| **FTX Collapse** | ~25% | 1 week | Exchange-specific contagion |
| **LUNA Collapse** | ~99% | 3 days | Algorithmic stablecoin death spiral |

Each scenario simulates portfolio impact including margin requirements and liquidity effects.

```python
from src.risk.stress_test import StressTestScenario

scenario = StressTestScenario(initial_portfolio_value=100000)
result = scenario.run_covid_crash(returns, weights)
# result.pnl, result.pnl_percentage, result.margin_requirement, result.passed
```

### RiskAnalyzer (Combined)

**Source:** `ai-signal-bot/src/risk/var_stress_test.py`

Unified interface for VaR, CVaR, and stress testing:

```python
from src.risk.var_stress_test import RiskAnalyzer

analyzer = RiskAnalyzer(returns, portfolio_value=100000)
var_95 = analyzer.historical_var(confidence=0.95)
cvar_95 = analyzer.historical_cvar(confidence=0.95)
mc_var = analyzer.monte_carlo_var(confidence=0.95, n_sims=10000)
stress = analyzer.stress_test(scenario="covid_crash")
```

---

## Position Risk Manager

**Why this is needed:** Setting a stop loss once and hoping for the best is
insufficient. Markets move, volatility changes, and positions need active
management to maximize gains and minimize losses.

**What problem it solves:** Automates the complex decisions of position management:
- **Trailing stop** locks in profits as price moves favorably
- **Breakeven move** eliminates risk after sufficient profit
- **Partial TP** secures some gains while letting the rest run
- **Max hold time** prevents capital from being tied up in stale positions

Without these, traders manually manage positions — which is slow, emotional,
and error-prone. The risk manager does it automatically on every price update.

**Source:** `ai-signal-bot/src/risk/risk_manager.py`

Manages open positions with dynamic stop-loss adjustment:

| Feature | Description |
|---------|-------------|
| **Trailing stop** | Moves SL as price moves favorably, maintaining fixed distance |
| **Breakeven move** | Moves SL to entry after price reaches threshold |
| **ATR-based trailing** | Uses candle volatility for adaptive SL distance |
| **Partial take-profit** | Closes portion of position at TP1, moves SL to breakeven |
| **Max hold time** | Forces exit after configurable holding period |

```python
from src.risk.risk_manager import RiskManager, RiskConfig

rm = RiskManager(RiskConfig(
    trailing_stop_enabled=True,
    trailing_distance_pct=2.0,
    breakeven_enabled=True,
    breakeven_trigger_pct=1.0,
    partial_tp_enabled=True,
    partial_tp_pct=50.0,
    partial_tp_trigger_pct=2.0,
))
new_sl = rm.update_stop_loss(position, current_price, candle)
```

### C++ Pre-Trade Risk

**Source:** `hft-trade-bot/src/risk/risk_manager.h`

8 pre-trade checks: blacklist, max leverage, position size, total exposure, daily loss, max drawdown, order rate throttle, margin.

---

## Configuration

Risk parameters in `ai-signal-bot/config/settings.yaml`:

```yaml
risk:
  max_risk_per_trade: 0.02      # 2% per trade
  max_daily_drawdown: 0.08      # 8% daily drawdown limit
  min_confidence: 0.65          # 65% minimum signal confidence
  min_rr_ratio: 1.5             # 1.5 minimum risk:reward
  stop_loss_pct: 0.02           # 2% stop-loss
  take_profit_pct: 0.04         # 4% take-profit
  max_position_size: 0.10       # 10% max position
```

---

## Web UI

Risk visualization panels:
- **VaR/CVaR Panel** — historical and parametric VaR with confidence intervals
- **Kelly Criterion Panel** — growth curves and optimal fraction visualization
- **Stress Test Panel** — portfolio impact under crash scenarios
- **Risk Metrics Panel** — real-time drawdown, Sharpe, Sortino, Calmar

Access via the "Risk" tab.

---

## Testing

| Test File | Coverage |
|-----------|----------|
| `ai-signal-bot/tests/unit/test_risk_modules.py` | VaR (historical, parametric, MC), Kupiec test |
| `ai-signal-bot/tests/unit/test_risk_modules.py` | CVaR, Kelly, position sizing, stress tests |
| `ai-signal-bot/tests/unit/test_risk_manager.py` | Trailing stop, breakeven, partial TP, max hold |

Edge cases: empty returns, NaN, inf, single element, all-zero returns, extreme confidence levels.

---

## See Also

- [Trading Strategies](TRADING_STRATEGIES.md) — How risk limits integrate with strategies
