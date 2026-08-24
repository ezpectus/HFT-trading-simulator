# Tests for Risk Management Module
# Tests VaR calculation, CVaR calculation, stress testing, and dynamic position sizing

import numpy as np
import pytest

from src.risk.cvar import CVaRCalculator, CVaRResult
from src.risk.position_sizing import DynamicPositionSizer, PositionSizingResult
from src.risk.stress_test import StressTestResult, StressTestScenario
from src.risk.var import VaRCalculator, VaRResult


class TestVaRCalculator:
    """Test VaR calculation."""

    def test_var_initialization(self):
        """Test VaR calculator initialization."""
        calculator = VaRCalculator(confidence_level=0.95, time_horizon=1.0)

        assert calculator.confidence_level == 0.95
        assert calculator.time_horizon == 1.0

    def test_historical_var(self):
        """Test historical VaR calculation."""
        calculator = VaRCalculator()

        returns = np.random.randn(1000) * 0.01
        result = calculator.calculate_historical_var(returns)

        assert isinstance(result, VaRResult)
        assert result.method == 'historical'
        assert result.confidence_level == 0.95
        assert result.var_value < 0  # VaR should be negative (loss)

    def test_parametric_var(self):
        """Test parametric VaR calculation."""
        calculator = VaRCalculator()

        returns = np.random.randn(1000) * 0.01
        result = calculator.calculate_parametric_var(returns)

        assert isinstance(result, VaRResult)
        assert result.method == 'parametric'
        assert result.var_value < 0

    def test_monte_carlo_var(self):
        """Test Monte Carlo VaR calculation."""
        calculator = VaRCalculator()

        returns = np.random.randn(1000) * 0.01
        result = calculator.calculate_monte_carlo_var(returns, n_simulations=1000)

        assert isinstance(result, VaRResult)
        assert result.method == 'monte_carlo'
        assert result.var_value < 0

    def test_var_at_multiple_levels(self):
        """Test VaR at multiple confidence levels."""
        calculator = VaRCalculator()

        returns = np.random.randn(1000) * 0.01
        results = calculator.calculate_var_at_multiple_levels(
            returns,
            confidence_levels=[0.95, 0.99, 0.999]
        )

        assert 0.95 in results
        assert 0.99 in results
        assert 0.999 in results
        assert results[0.999].var_value < results[0.99].var_value  # Higher confidence = more negative

    def test_backtest_var(self):
        """Test VaR backtesting."""
        calculator = VaRCalculator()

        returns = np.random.randn(500) * 0.01
        var_result = calculator.calculate_historical_var(returns)

        backtest = calculator.backtest_var(returns, var_result, window_size=252)

        assert 'violations' in backtest
        assert 'total_observations' in backtest
        assert 'violation_rate' in backtest
        assert 'kupiec_stat' in backtest
        assert 'passed' in backtest


class TestCVaRCalculator:
    """Test CVaR calculation."""

    def test_cvar_initialization(self):
        """Test CVaR calculator initialization."""
        calculator = CVaRCalculator(confidence_level=0.95, time_horizon=1.0)

        assert calculator.confidence_level == 0.95
        assert calculator.time_horizon == 1.0

    def test_calculate_cvar_historical(self):
        """Test CVaR calculation with historical method."""
        calculator = CVaRCalculator()

        returns = np.random.randn(1000) * 0.01
        result = calculator.calculate_cvar(returns, method='historical')

        assert isinstance(result, CVaRResult)
        assert result.method == 'historical'
        assert result.cvar_value < 0
        assert result.var_value < 0
        assert result.cvar_value <= result.var_value  # CVaR should be worse than VaR

    def test_calculate_cvar_parametric(self):
        """Test CVaR calculation with parametric method."""
        calculator = CVaRCalculator()

        returns = np.random.randn(1000) * 0.01
        result = calculator.calculate_cvar(returns, method='parametric')

        assert isinstance(result, CVaRResult)
        assert result.method == 'parametric'
        assert result.cvar_value < 0

    def test_calculate_expected_shortfall(self):
        """Test Expected Shortfall calculation."""
        calculator = CVaRCalculator()

        returns = np.random.randn(1000) * 0.01
        result = calculator.calculate_expected_shortfall(returns)

        assert isinstance(result, CVaRResult)
        assert result.cvar_value < 0

    def test_tail_risk_measures(self):
        """Test tail risk measures calculation."""
        calculator = CVaRCalculator()

        returns = np.random.randn(1000) * 0.01
        measures = calculator.calculate_tail_risk_measures(returns)

        assert 'cvar' in measures
        assert 'var' in measures
        assert 'skewness' in measures
        assert 'kurtosis' in measures
        assert 'tail_index' in measures
        assert 'max_drawdown' in measures
        assert 'tail_ratio' in measures

    def test_stress_scenarios_analysis(self):
        """Test stress scenario analysis."""
        calculator = CVaRCalculator()

        returns = np.random.randn(1000) * 0.01
        scenarios = {
            'mild_crash': 0.8,
            'severe_crash': 0.5,
            'extreme_crash': 0.3
        }

        results = calculator.analyze_stress_scenarios(returns, scenarios)

        assert 'mild_crash' in results
        assert 'severe_crash' in results
        assert 'extreme_crash' in results


class TestStressTestScenario:
    """Test stress testing scenarios."""

    def test_stress_test_initialization(self):
        """Test stress test scenario initialization."""
        scenario = StressTestScenario(initial_portfolio_value=100000)

        assert scenario.initial_portfolio_value == 100000

    def test_crisis_2008_scenario(self):
        """Test 2008 financial crisis scenario."""
        scenario = StressTestScenario()

        prices = np.array([100, 105, 110, 95, 90])
        positions = np.array([10, 10, 10, 10, 10])

        result = scenario.crisis_2008_scenario(prices, positions)

        assert isinstance(result, StressTestResult)
        assert result.scenario_name == '2008 Financial Crisis'
        assert result.pnl < 0  # Should be a loss
        assert result.pnl_percentage < 0

    def test_covid_crash_scenario(self):
        """Test COVID-19 crash scenario."""
        scenario = StressTestScenario()

        prices = np.array([100, 105, 110, 95, 90])
        positions = np.array([10, 10, 10, 10, 10])

        result = scenario.covid_crash_scenario(prices, positions)

        assert isinstance(result, StressTestResult)
        assert result.scenario_name == 'COVID-19 Crash'
        assert result.pnl < 0

    def test_ftx_collapse_scenario(self):
        """Test FTX collapse scenario."""
        scenario = StressTestScenario()

        prices = np.array([100, 105, 110, 95, 90])
        positions = np.array([10, 10, 10, 10, 10])

        result = scenario.ftx_collapse_scenario(prices, positions, crypto_exposure=0.5)

        assert isinstance(result, StressTestResult)
        assert result.scenario_name == 'FTX Collapse'
        assert result.pnl < 0

    def test_custom_scenario(self):
        """Test custom stress scenario."""
        scenario = StressTestScenario()

        prices = np.array([100, 105, 110, 95, 90])
        positions = np.array([10, 10, 10, 10, 10])
        price_shocks = np.array([0.8, 0.7, 0.6, 0.9, 0.85])

        result = scenario.custom_scenario(prices, positions, price_shocks, 'Custom Test')

        assert isinstance(result, StressTestResult)
        assert result.scenario_name == 'Custom Test'

    def test_run_all_scenarios(self):
        """Test running all predefined scenarios."""
        scenario = StressTestScenario()

        prices = np.array([100, 105, 110, 95, 90])
        positions = np.array([10, 10, 10, 10, 10])

        results = scenario.run_all_scenarios(prices, positions)

        assert len(results) == 3
        assert all(isinstance(r, StressTestResult) for r in results)

    def test_generate_summary(self):
        """Test stress test summary generation."""
        scenario = StressTestScenario()

        prices = np.array([100, 105, 110, 95, 90])
        positions = np.array([10, 10, 10, 10, 10])

        results = scenario.run_all_scenarios(prices, positions)
        summary = scenario.generate_summary(results)

        assert 'total_scenarios' in summary
        assert 'passed_scenarios' in summary
        assert 'pass_rate' in summary
        assert 'worst_pnl_percentage' in summary
        assert 'overall_passed' in summary


class TestDynamicPositionSizer:
    """Test dynamic position sizing."""

    def test_position_sizer_initialization(self):
        """Test position sizer initialization."""
        sizer = DynamicPositionSizer(account_value=100000, max_position_size=0.2)

        assert sizer.account_value == 100000
        assert sizer.max_position_size == 0.2

    def test_volatility_based_sizing(self):
        """Test volatility-based position sizing."""
        sizer = DynamicPositionSizer()

        result = sizer.volatility_based_sizing(
            signal='LONG',
            price=100,
            volatility=0.2,
            risk_per_trade=0.02
        )

        assert isinstance(result, PositionSizingResult)
        assert result.method == 'volatility'
        assert result.position_size > 0
        assert result.position_value > 0

    def test_risk_parity_sizing(self):
        """Test risk parity position sizing."""
        sizer = DynamicPositionSizer()

        result = sizer.risk_parity_sizing(
            signal='LONG',
            price=100,
            risk_per_trade=0.02
        )

        assert isinstance(result, PositionSizingResult)
        assert result.method == 'risk_parity'
        assert result.position_size > 0

    def test_kelly_criterion_sizing(self):
        """Test Kelly criterion position sizing."""
        sizer = DynamicPositionSizer()

        result = sizer.kelly_criterion_sizing(
            signal='LONG',
            price=100,
            volatility=0.2,
            expected_return=0.15,
            risk_per_trade=0.02
        )

        assert isinstance(result, PositionSizingResult)
        assert result.method == 'kelly'
        assert result.position_size > 0

    def test_hold_signal(self):
        """Test HOLD signal returns zero position."""
        sizer = DynamicPositionSizer()

        result = sizer.calculate_position_size(
            signal='HOLD',
            price=100,
            volatility=0.2,
            method='volatility'
        )

        assert result.position_size == 0
        assert result.position_value == 0
        assert result.risk_amount == 0

    def test_adjust_for_correlation(self):
        """Test position adjustment for correlation."""
        sizer = DynamicPositionSizer()

        position_sizes = np.array([100, 100, 100, 100, 100])
        correlation_matrix = np.array([
            [1.0, 0.9, 0.8, 0.85, 0.75],
            [0.9, 1.0, 0.8, 0.75, 0.8],
            [0.8, 0.8, 1.0, 0.5, 0.3],
            [0.85, 0.75, 0.5, 1.0, 0.4],
            [0.75, 0.8, 0.3, 0.4, 1.0]
        ])

        adjusted = sizer.adjust_for_correlation(position_sizes, correlation_matrix)

        assert len(adjusted) == len(position_sizes)
        # Highly correlated positions should be reduced
        assert adjusted[0] < position_sizes[0]
        assert adjusted[1] < position_sizes[1]

    def test_enforce_position_limits(self):
        """Test position limit enforcement."""
        sizer = DynamicPositionSizer(account_value=100000)

        position_sizes = np.array([0.3, 0.3, 0.3, 0.3, 0.3])  # 30% each, exceeds 20% limit

        adjusted = sizer.enforce_position_limits(
            position_sizes,
            max_single_position=0.2,
            max_total_exposure=1.0
        )

        assert all(adjusted <= 0.2)
        assert np.sum(adjusted) <= 1.0
