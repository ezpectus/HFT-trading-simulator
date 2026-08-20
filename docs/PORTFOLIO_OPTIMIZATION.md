# Portfolio Optimization

Guide to portfolio optimization models in the HFT Trading System: Markowitz, Black-Litterman, risk parity, and rebalancing.

---

## Overview

The system implements four portfolio optimization approaches, each with different assumptions and use cases. All models operate on historical returns data and produce optimal weight allocations.

**Source directory:** `ai-signal-bot/src/portfolio/`

---

## Markowitz Mean-Variance Optimization

**Source:** `ai-signal-bot/src/portfolio/markowitz.py`

The classical Markowitz model finds optimal portfolio weights by either minimizing variance or maximizing the Sharpe ratio.

### Minimum Variance Portfolio

```
min  w' * Σ * w
s.t. sum(w) = 1, w >= 0
```

### Maximum Sharpe Portfolio

```
max  (w' * μ - r_f) / sqrt(w' * Σ * w)
s.t. sum(w) = 1, w >= 0
```

### Efficient Frontier

Generates the full efficient frontier by solving the optimization for a range of target returns.

```python
from src.portfolio.markowitz import MarkowitzOptimizer

opt = MarkowitzOptimizer(risk_free_rate=0.02)
result = opt.min_variance(returns, n_assets=5)
# result.weights, result.expected_return, result.volatility, result.sharpe_ratio

frontier = opt.efficient_frontier(returns, n_points=50)
# List[EfficientFrontierPoint] — each has weights, expected_return, volatility
```

**Constraints supported:** Long-only, weight bounds, sector constraints, turnover limits.

---

## Black-Litterman Model

**Source:** `ai-signal-bot/src/portfolio/black_litterman.py`

Combines market equilibrium returns with investor views to produce posterior expected returns:

```
E[R] = [(τΣ)^-1 + P'Ω^-1P]^-1 * [(τΣ)^-1*Π + P'Ω^-1*Q]
```

Where:
- `Π` = equilibrium returns (from market cap weights)
- `P` = picking matrix (which assets each view relates to)
- `Q` = view returns
- `Ω` = view confidence matrix
- `τ` = uncertainty scaling (default 0.05)

```python
from src.portfolio.black_litterman import BlackLittermanModel, View

bl = BlackLittermanModel(risk_free_rate=0.02, tau=0.05)
views = [
    View(assets=[0, 1], weights=[1, -1], expected_return=0.03, confidence=0.8),
    View(assets=[2], weights=[1], expected_return=0.05, confidence=0.6),
]
result = bl.optimize(returns, views, n_assets=3)
```

---

## Risk Parity

**Source:** `ai-signal-bot/src/portfolio/risk_parity.py`

Allocates weights so that each asset contributes equally to total portfolio risk:

```
RC_i = w_i * (Σw)_i / sqrt(w'Σw)
target: RC_i = RC_j for all i, j
```

Supports risk budgeting (unequal risk targets) and leverage limits.

```python
from src.portfolio.risk_parity import RiskParityOptimizer

rp = RiskParityOptimizer(risk_free_rate=0.02)
result = rp.optimize(returns, n_assets=5)
# result.weights — equal risk contribution weights
```

---

## Portfolio Rebalancing

**Source:** `ai-signal-bot/src/portfolio/rebalancing.py`

Three rebalancing trigger strategies:

| Trigger | Description |
|---------|-------------|
| **Time-based** | Rebalance at fixed intervals (daily, weekly, monthly) |
| **Drift-based** | Rebalance when weights deviate from target by threshold |
| **Volatility-based** | Rebalance when portfolio volatility exceeds threshold |

```python
from src.portfolio.rebalancing import PortfolioRebalancer, RebalanceTrigger

rebalancer = PortfolioRebalancer(
    trigger=RebalanceTrigger.DRIFT_BASED,
    drift_threshold=0.05,  # 5% weight drift
)
orders = rebalancer.rebalance(current_weights, target_weights, portfolio_value=100000)
# List[RebalanceOrder] — each has asset_index, current_weight, target_weight, trade_amount, side
```

---

## PortfolioOptimizer (Combined)

**Source:** `ai-signal-bot/src/risk/portfolio_optimizer.py`

Unified interface combining all four models with strategy integration:

```python
from src.risk.portfolio_optimizer import PortfolioOptimizer

optimizer = PortfolioOptimizer(method="markowitz")
result = optimizer.optimize(returns, risk_free_rate=0.02)
```

Methods: `markowitz`, `black_litterman`, `risk_parity`, `kelly`.

---

## Web UI

The Web UI provides portfolio visualization panels:
- **Efficient Frontier** — interactive frontier chart with Sharpe-optimal point
- **Black-Litterman** — view input and posterior returns visualization
- **Risk Parity** — risk contribution waterfall chart
- **Portfolio Weights** — pie/donut chart of current allocations

Access via the "Portfolio" tab.

---

## Testing

| Test File | Coverage |
|-----------|----------|
| `ai-signal-bot/tests/unit/test_portfolio.py` | Markowitz, Black-Litterman, risk parity, rebalancing |
| `ai-signal-bot/tests/unit/test_risk_modules.py` | PortfolioOptimizer combined interface |

Edge cases covered: single asset, two assets, correlation = ±1, NaN in returns, empty arrays.

---

## See Also

- [Math Models](MATH_MODELS.md) — Markowitz, Black-Litterman, risk parity formulas
- [Risk Management](RISK_MANAGEMENT.md) — VaR, Kelly criterion, stress testing
- [Architecture](ARCHITECTURE.md) — Portfolio module in system architecture
