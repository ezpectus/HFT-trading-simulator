# Options Trading

Comprehensive guide to options pricing, Greeks, strategies, and volatility surface modeling in the HFT Trading System.

---

## Overview

The system implements European-style options pricing using the Black-Scholes model, binomial tree pricing, Greeks calculation, implied volatility estimation, and volatility surface modeling (SVI/SABR). Options strategies (straddle, strangle, iron condor, butterfly) are available for educational exploration.

**Key principle:** All options are priced on simulated market data. No real money is at risk.

---

## Pricing Models

### Black-Scholes

**Source:** `exchange_simulator/options_pricing.py`

The Black-Scholes model prices European call and put options:

```
Call = S * N(d1) - K * e^(-rT) * N(d2)
Put  = K * e^(-rT) * N(-d2) - S * N(-d1)

d1 = (ln(S/K) + (r + 0.5*sigma^2)*T) / (sigma * sqrt(T))
d2 = d1 - sigma * sqrt(T)
```

Where:
- `S` = spot price
- `K` = strike price
- `T` = time to expiry (years)
- `sigma` = implied volatility
- `r` = risk-free rate (default 5%)
- `N(x)` = standard normal CDF

```python
from exchange_simulator.options_pricing import BlackScholes

bs = BlackScholes(risk_free_rate=0.05)
call = bs.calculate_call_price(S=65000, K=70000, T=0.25, sigma=0.8)
put = bs.calculate_put_price(S=65000, K=70000, T=0.25, sigma=0.8)
```

### Binomial Tree

**Source:** `exchange_simulator/options_pricing.py`

Cox-Ross-Rubinstein binomial tree with configurable steps. Useful for American-style options and dividend handling.

### Options Simulator

**Source:** `exchange_simulator/exchange_simulator/options_simulator.py`

High-level interface combining Black-Scholes pricing with Greeks, implied volatility (Newton-Raphson), option chain generation, and put-call parity verification.

```python
from exchange_simulator.options_simulator import OptionsSimulator

sim = OptionsSimulator(risk_free_rate=0.05)
quote = sim.price_option(S=65000, K=70000, T=0.25, sigma=0.8, option_type="call")
# quote.price, quote.delta, quote.gamma, quote.theta, quote.vega, quote.rho
```

---

## Greeks

### Definition

| Greek | Formula | Measures |
|-------|---------|----------|
| Delta | `dC/dS = N(d1)` | Price sensitivity to underlying |
| Gamma | `d²C/dS² = N'(d1)/(S*sigma*sqrt(T))` | Rate of delta change |
| Theta | `dC/dT` | Time decay (per day) |
| Vega | `dC/dsigma = S*sqrt(T)*N'(d1)` | Volatility sensitivity (per 1% vol) |
| Rho | `dC/dr = K*T*e^(-rT)*N(d2)` | Interest rate sensitivity (per 1% rate) |

### Greeks Hedging Simulator

**Source:** `ai-signal-bot/src/research/greeks_hedging.py`

Simulates delta hedging of options positions with:
- Daily rebalancing vs threshold-based rebalancing
- Transaction cost impact analysis
- P&L decomposition (delta P&L, gamma P&L, theta P&L, vega P&L)
- Gamma scalping simulation
- Portfolio Greeks aggregation

```python
from src.research.greeks_hedging import GreeksHedgingSimulator

sim = GreeksHedgingSimulator(s0=65000, sigma=0.6, r=0.0, t=30/365)
result = sim.simulate_delta_hedge(option_type='call', strike=65000, n_days=30)
```

---

## Volatility Surface

### SVI (Stochastic Volatility Inspired)

**Source:** `ai-signal-bot/src/pricing/volatility_surface.py`

```
w(k) = a + b * (rho*(k-m) + sqrt((k-m)^2 + sigma^2))
```

Where `k = log(K/F)` is log-moneyness, `w` is total implied variance.

Parameters:
- `a` — asymptotic variance level
- `b` — slope (asymptotic variance increase)
- `rho` — skew (-1 to 1, correlation between spot and vol)
- `m` — center (log-moneyness at minimum variance)
- `sigma` — curvature (smoothness of the wing)

### SABR (Stochastic Alpha Beta Rho)

Hagan's asymptotic implied volatility formula:

```
sigma_impl(K,F) = alpha/(F^(1-beta)) * [1 + ...]
```

Parameters: `alpha` (ATM vol), `beta` (CEV exponent), `rho` (spot-vol correlation), `nu` (vol-of-vol).

### Calibration

Both models support calibration from market data using `scipy.optimize.least_squares` (with numpy fallback if scipy unavailable).

```python
from src.pricing.volatility_surface import VolatilitySurface

vs = VolatilitySurface(model="svi")
params = vs.calibrate(strikes, maturities, implied_vols, forward_price)
iv = vs.implied_vol(strike=65000, maturity_days=30, forward=64000)
```

---

## Options Strategies

**Source:** `exchange_simulator/options_strategies.py`

| Strategy | Structure | Max Profit | Max Loss |
|----------|-----------|------------|----------|
| **Straddle** | Long call + long put (same strike) | Unlimited | Premium paid |
| **Strangle** | Long call + long put (different strikes) | Unlimited | Premium paid |
| **Iron Condor** | Bull put spread + bear call spread | Net premium | Strike width - premium |
| **Butterfly** | Long call (K1) + 2 short calls (K2) + long call (K3) | K2 - K1 - premium | Premium paid |

Each strategy calculates payoff at expiry, max profit/loss, and break-even points.

```python
from exchange_simulator.options_strategies import OptionsStrategies

strat = OptionsStrategies()
result = strat.straddle(S=65000, K=65000, T=0.25, sigma=0.8, r=0.05)
# result.max_profit, result.max_loss, result.break_evens, result.payoff_at_expiry
```

---

## Web UI

The Web UI provides options-related panels:
- **Options Pricing Panel** — interactive Black-Scholes pricing with adjustable parameters
- **Greeks Panel** — real-time Greeks display with visual charts
- **Volatility Surface Panel** — 3D surface visualization (SVI/SABR)
- **Options Strategies Panel** — payoff diagrams for straddle, strangle, iron condor, butterfly

Access via the "Options" tab in the dashboard.

---

## Testing

| Test File | Coverage |
|-----------|----------|
| `exchange_simulator/tests/test_options_pricing.py` | Black-Scholes, binomial tree, Greeks, edge cases (T=0, sigma=0) |
| `exchange_simulator/tests/test_options_simulator.py` | Option chain, implied vol, put-call parity |
| `ai-signal-bot/tests/unit/test_research_modules.py` | Greeks hedging simulator |

---

## See Also

- [Math Models](MATH_MODELS.md) — SVI/SABR formulas, Black-Scholes derivation
- [Architecture](ARCHITECTURE.md) — System component overview
- [Trading Strategies](TRADING_STRATEGIES.md) — How options integrate with trading pipeline
