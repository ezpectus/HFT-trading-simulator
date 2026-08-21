# Risk Management

Guide to risk management models in the HFT Trading System: VaR, CVaR, Kelly criterion, position sizing, stress testing, and the position risk manager.

---

## Overview

The risk module provides comprehensive risk measurement and management:

- **Value at Risk (VaR)** — historical, parametric, Monte Carlo methods
- **Conditional VaR (CVaR)** — expected shortfall beyond VaR
- **Kelly Criterion** — optimal position sizing for long-term growth
- **Dynamic Position Sizing** — volatility/risk-parity/Kelly-based sizing
- **Stress Testing** — 2008, COVID, FTX, LUNA crash scenarios
- **Position Risk Manager** — trailing stop, breakeven, partial take-profit

**Source directory:** `ai-signal-bot/src/risk/`

---

## Value at Risk (VaR)

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
