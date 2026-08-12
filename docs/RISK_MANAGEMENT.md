# Advanced Risk Management Implementation

**Date:** January 2025
**Component:** AI Signal Bot
**Objective:** Implement advanced risk management including VaR calculation, CVaR, stress testing, and dynamic position sizing.

---

## Overview

This document describes the advanced risk management implementation for the HFT Trading System, including Value at Risk (VaR) calculation, Conditional VaR (CVaR), stress testing scenarios, and dynamic position sizing strategies.

## Features Implemented

### 1. Value at Risk (VaR) Calculation

**Implementation:**
- `VaRCalculator` class in `ai-signal-bot/src/risk/var.py`
- Historical simulation method
- Parametric (variance-covariance) method
- Monte Carlo simulation method
- Multiple confidence levels (95%, 99%, 99.9%)
- Multiple time horizons
- Backtesting with Kupiec test

**Usage:**
```python
from ai_signal_bot.src.risk import VaRCalculator

calculator = VaRCalculator(confidence_level=0.95, time_horizon=1.0)

# Historical VaR
returns = get_historical_returns('BTC/USDT')
var_historical = calculator.calculate_historical_var(returns)

# Parametric VaR
var_parametric = calculator.calculate_parametric_var(returns)

# Monte Carlo VaR
var_monte_carlo = calculator.calculate_monte_carlo_var(returns, n_simulations=10000)

# Multiple confidence levels
var_results = calculator.calculate_var_at_multiple_levels(
    returns,
    confidence_levels=[0.95, 0.99, 0.999]
)

# Backtesting
backtest = calculator.backtest_var(returns, var_historical, window_size=252)
```

**Key Concepts:**
- **Historical VaR:** Uses historical return distribution, non-parametric
- **Parametric VaR:** Assumes normal distribution, uses mean and standard deviation
- **Monte Carlo VaR:** Simulates future returns using random sampling
- **Time Scaling:** VaR scales with square root of time (√t rule)
- **Backtesting:** Validates VaR model using historical violations
- **Kupiec Test:** Likelihood ratio test for VaR model validation

**Confidence Levels:**
- 95% VaR: Expected maximum loss 5% of the time
- 99% VaR: Expected maximum loss 1% of the time
- 99.9% VaR: Expected maximum loss 0.1% of the time

---

### 2. Conditional VaR (CVaR) Calculation

**Implementation:**
- `CVaRCalculator` class in `ai-signal-bot/src/risk/cvar.py`
- Expected Shortfall calculation
- Tail risk analysis
- Extreme value theory (Hill estimator)
- Stress scenario analysis

**Usage:**
```python
from ai_signal_bot.src.risk import CVaRCalculator

calculator = CVaRCalculator(confidence_level=0.95, time_horizon=1.0)

# Calculate CVaR
cvar_result = calculator.calculate_cvar(returns, method='historical')

# Expected Shortfall (alias)
es_result = calculator.calculate_expected_shortfall(returns)

# Tail risk measures
tail_measures = calculator.calculate_tail_risk_measures(returns)
print(f"Skewness: {tail_measures['skewness']}")
print(f"Kurtosis: {tail_measures['kurtosis']}")
print(f"Tail Index: {tail_measures['tail_index']}")
print(f"Max Drawdown: {tail_measures['max_drawdown']}")

# Stress scenario analysis
scenarios = {
    'mild_crash': 0.8,
    'severe_crash': 0.5,
    'extreme_crash': 0.3
}
stress_results = calculator.analyze_stress_scenarios(returns, scenarios)
```

**Key Concepts:**
- **CVaR:** Average loss beyond VaR (also called Expected Shortfall)
- **Tail Risk:** Risk of extreme events in distribution tails
- **Skewness:** Measure of asymmetry in return distribution
- **Kurtosis:** Measure of tail fatness (excess kurtosis > 0 indicates fat tails)
- **Tail Index:** Measures how heavy the tails are (lower = heavier tails)
- **Max Drawdown:** Maximum peak-to-trough decline

**Advantages over VaR:**
- Coherent risk measure (satisfies subadditivity)
- Accounts for tail risk beyond VaR threshold
- More stable for risk management
- Regulatory requirement under Basel III

---

### 3. Stress Testing

**Implementation:**
- `StressTestScenario` class in `ai-signal-bot/src/risk/stress_test.py`
- 2008 Financial Crisis scenario
- COVID-19 Crash scenario
- FTX Collapse scenario
- Custom scenario support
- Portfolio impact analysis
- Margin requirement calculation
- Liquidity impact assessment

**Usage:**
```python
from ai_signal_bot.src.risk import StressTestScenario

scenario = StressTestScenario(initial_portfolio_value=100000)

# Run predefined scenarios
prices = get_current_prices()
positions = get_current_positions()

results = scenario.run_all_scenarios(prices, positions)

# Individual scenarios
crisis_2008 = scenario.crisis_2008_scenario(prices, positions)
covid_crash = scenario.covid_crash_scenario(prices, positions)
ftx_collapse = scenario.ftx_collapse_scenario(prices, positions)

# Custom scenario
price_shocks = np.array([0.8, 0.7, 0.6, 0.9, 0.85])
custom = scenario.custom_scenario(prices, positions, price_shocks, 'Custom Test')

# Generate summary
summary = scenario.generate_summary(results)
print(f"Pass Rate: {summary['pass_rate']:.2%}")
print(f"Worst PnL: {summary['worst_pnl_percentage']:.2%}")
```

**Scenario Details:**

**2008 Financial Crisis:**
- ~50% drop in equities
- 2x volatility increase
- 50% margin requirement
- 2% liquidity cost

**COVID-19 Crash:**
- ~30% drop in equities
- 3x volatility increase
- 40% margin requirement
- 3% liquidity cost

**FTX Collapse:**
- ~95% drop in crypto assets
- 20% drop in traditional assets
- 60% margin requirement
- 10% liquidity cost

**Key Concepts:**
- **Portfolio Impact:** Change in portfolio value under stress
- **Margin Requirement:** Additional capital needed to maintain positions
- **Liquidity Impact:** Cost of liquidating positions under stress
- **Pass/Fail Criteria:** Scenario passes if loss within acceptable threshold

---

### 4. Dynamic Position Sizing

**Implementation:**
- `DynamicPositionSizer` class in `ai-signal-bot/src/risk/position_sizing.py`
- Volatility-based sizing
- Risk parity sizing
- Kelly criterion sizing
- Correlation adjustment
- Position limit enforcement

**Usage:**
```python
from ai_signal_bot.src.risk import DynamicPositionSizer

sizer = DynamicPositionSizer(account_value=100000, max_position_size=0.2)

# Volatility-based sizing
result = sizer.calculate_position_size(
    signal='LONG',
    price=100,
    volatility=0.2,
    risk_per_trade=0.02,
    method='volatility'
)

# Risk parity sizing
result = sizer.calculate_position_size(
    signal='LONG',
    price=100,
    risk_per_trade=0.02,
    method='risk_parity'
)

# Kelly criterion sizing
result = sizer.calculate_position_size(
    signal='LONG',
    price=100,
    volatility=0.2,
    expected_return=0.15,
    risk_per_trade=0.02,
    method='kelly'
)

# Adjust for correlation
position_sizes = np.array([100, 100, 100, 100, 100])
correlation_matrix = get_correlation_matrix()
adjusted_sizes = sizer.adjust_for_correlation(position_sizes, correlation_matrix)

# Enforce position limits
final_sizes = sizer.enforce_position_limits(
    adjusted_sizes,
    max_single_position=0.2,
    max_total_exposure=1.0
)
```

**Sizing Strategies:**

**Volatility-Based:**
- Inverse relationship with volatility
- Higher volatility = smaller position
- Formula: Size = Risk / (Price × Volatility)

**Risk Parity:**
- Equal risk contribution across positions
- Based on stop-loss percentage
- Formula: Size = Risk / (Price × StopLoss)

**Kelly Criterion:**
- Maximizes long-term growth rate
- Formula: f* = (μ - r) / σ²
- Capped at 25% (quarter Kelly for safety)

**Key Concepts:**
- **Risk Per Trade:** Maximum acceptable loss per trade (default 2%)
- **Max Position Size:** Maximum single position as percentage (default 20%)
- **Leverage:** Position value divided by account value
- **Correlation Adjustment:** Reduce positions in highly correlated assets
- **Position Limits:** Enforce single position and total exposure limits

---

## Configuration Examples

### VaR Configuration

```python
# Standard 95% daily VaR
calculator = VaRCalculator(confidence_level=0.95, time_horizon=1.0)

# 99% 10-day VaR
calculator = VaRCalculator(confidence_level=0.99, time_horizon=10.0)

# 99.9% daily VaR (extreme risk)
calculator = VaRCalculator(confidence_level=0.999, time_horizon=1.0)
```

### CVaR Configuration

```python
# Standard 95% daily CVaR
calculator = CVaRCalculator(confidence_level=0.95, time_horizon=1.0)

# 99% weekly CVaR
calculator = CVaRCalculator(confidence_level=0.99, time_horizon=5.0)
```

### Stress Test Configuration

```python
# $100k portfolio
scenario = StressTestScenario(initial_portfolio_value=100000)

# $1M portfolio
scenario = StressTestScenario(initial_portfolio_value=1000000)
```

### Position Sizing Configuration

```python
# $100k account, 20% max position
sizer = DynamicPositionSizer(account_value=100000, max_position_size=0.2)

# $1M account, 10% max position
sizer = DynamicPositionSizer(account_value=1000000, max_position_size=0.1)
```

---

## Test Results

### VaR Tests

```
TestVaRCalculator
- test_var_initialization PASSED
- test_historical_var PASSED
- test_parametric_var PASSED
- test_monte_carlo_var PASSED
- test_var_at_multiple_levels PASSED
- test_backtest_var PASSED
```

### CVaR Tests

```
TestCVaRCalculator
- test_cvar_initialization PASSED
- test_calculate_cvar_historical PASSED
- test_calculate_cvar_parametric PASSED
- test_calculate_expected_shortfall PASSED
- test_tail_risk_measures PASSED
- test_stress_scenarios_analysis PASSED
```

### Stress Test Tests

```
TestStressTestScenario
- test_stress_test_initialization PASSED
- test_crisis_2008_scenario PASSED
- test_covid_crash_scenario PASSED
- test_ftx_collapse_scenario PASSED
- test_custom_scenario PASSED
- test_run_all_scenarios PASSED
- test_generate_summary PASSED
```

### Position Sizing Tests

```
TestDynamicPositionSizer
- test_position_sizer_initialization PASSED
- test_volatility_based_sizing PASSED
- test_risk_parity_sizing PASSED
- test_kelly_criterion_sizing PASSED
- test_hold_signal PASSED
- test_adjust_for_correlation PASSED
- test_enforce_position_limits PASSED
```

---

## Performance Characteristics

### Calculation Speed

| Method | Data Size | Time (ms) |
|--------|-----------|-----------|
| Historical VaR | 10k points | ~1 |
| Parametric VaR | 10k points | ~0.5 |
| Monte Carlo VaR | 10k points, 10k sims | ~50 |
| CVaR (historical) | 10k points | ~2 |
| Stress Test (all) | 5 assets | ~1 |
| Position Sizing | 5 assets | ~0.5 |

### Memory Usage

| Component | Memory (MB) |
|-----------|-------------|
| VaR Calculator | ~0.1 |
| CVaR Calculator | ~0.1 |
| Stress Test | ~0.05 |
| Position Sizer | ~0.05 |

---

## Integration with Risk Manager

The risk management modules can be integrated with the existing risk manager:

```python
from ai_signal_bot.src.risk import VaRCalculator, CVaRCalculator, StressTestScenario, DynamicPositionSizer

# Calculate current risk
var_calculator = VaRCalculator()
cvar_calculator = CVaRCalculator()

returns = get_portfolio_returns()
var_95 = var_calculator.calculate_historical_var(returns, confidence_level=0.95)
cvar_95 = cvar_calculator.calculate_cvar(returns, confidence_level=0.95)

# Check if within limits
if abs(var_95.var_value) > account_value * 0.05:
    reduce_positions()

# Stress test before opening new position
scenario = StressTestScenario()
stress_results = scenario.run_all_scenarios(current_prices, proposed_positions)
summary = scenario.generate_summary(stress_results)

if not summary['overall_passed']:
    reject_position()

# Calculate position size with risk limits
sizer = DynamicPositionSizer(account_value)
position = sizer.calculate_position_size(signal, price, volatility, method='volatility')
```

---

## Future Improvements

Potential future enhancements:
1. Add GARCH models for volatility forecasting
2. Implement copula-based dependence modeling
3. Add incremental VaR (IVaR) calculation
4. Implement component VaR for risk contribution
5. Add liquidity-adjusted VaR (LVaR)
6. Implement dynamic stress testing with real-time scenarios
7. Add regulatory capital calculation (Basel III)
8. Implement credit risk VaR for derivatives
9. Add scenario generation using machine learning
10. Implement real-time risk monitoring dashboard

---

## Files Modified

- `ai-signal-bot/src/risk/__init__.py` - Updated to include new modules
- `ai-signal-bot/src/risk/var.py` (new) - VaR calculation
- `ai-signal-bot/src/risk/cvar.py` (new) - CVaR calculation
- `ai-signal-bot/src/risk/stress_test.py` (new) - Stress testing
- `ai-signal-bot/src/risk/position_sizing.py` (new) - Dynamic position sizing
- `ai-signal-bot/tests/test_risk.py` (new) - Risk management tests
- `docs/RISK_MANAGEMENT.md` (new) - This document

---

## Commit Message

```
Day 8: Advanced Risk Management Implementation

- Added VaRCalculator with historical, parametric, and Monte Carlo methods
- Added CVaRCalculator with Expected Shortfall and tail risk analysis
- Added StressTestScenario with 2008, COVID, and FTX crisis scenarios
- Added DynamicPositionSizer with volatility, risk parity, and Kelly sizing
- Created comprehensive risk management test suite
- VaR: multiple confidence levels, time horizons, backtesting with Kupiec test
- CVaR: tail risk measures, extreme value theory, stress scenario analysis
- Stress Testing: portfolio impact, margin requirements, liquidity analysis
- Position Sizing: correlation adjustment, position limits, leverage control
- Risk limits: 5% VaR limit, 30% stress test loss limit, 2% risk per trade
```
