# Stress Testing Module
#
# Implements stress testing scenarios including 2008 financial crisis, COVID-19 crash,
# FTX collapse, and custom scenarios with portfolio impact analysis.

from dataclasses import dataclass

import numpy as np


@dataclass
class StressTestResult:
    """Result of stress test scenario."""
    scenario_name: str
    portfolio_value_before: float
    portfolio_value_after: float
    pnl: float
    pnl_percentage: float
    margin_requirement: float
    liquidity_impact: float
    passed: bool


class StressTestScenario:
    """Stress testing scenario generator."""

    def __init__(self, initial_portfolio_value: float = 100000):
        self.initial_portfolio_value = initial_portfolio_value

    def _evaluate(self, scenario_name: str, current_prices: np.ndarray,
                  positions: np.ndarray, shocked_prices: np.ndarray,
                  margin_factor: float, liquidity_impact: float,
                  pass_threshold: float) -> StressTestResult:
        """Shared evaluation tail: value the book pre/post shock and build the result."""
        portfolio_value_before = np.sum(current_prices * positions)
        portfolio_value_after = np.sum(shocked_prices * positions)

        pnl = portfolio_value_after - portfolio_value_before
        pnl_percentage = pnl / portfolio_value_before if portfolio_value_before != 0 else 0.0

        return StressTestResult(
            scenario_name=scenario_name,
            portfolio_value_before=portfolio_value_before,
            portfolio_value_after=portfolio_value_after,
            pnl=pnl,
            pnl_percentage=pnl_percentage,
            margin_requirement=abs(pnl) * margin_factor,
            liquidity_impact=liquidity_impact,
            passed=abs(pnl_percentage) < pass_threshold,
        )

    def crisis_2008_scenario(self, current_prices: np.ndarray,
                             positions: np.ndarray) -> StressTestResult:
        """Simulate 2008 financial crisis scenario."""
        shocked_prices = current_prices * 0.5

        return self._evaluate(
            '2008 Financial Crisis', current_prices, positions, shocked_prices,
            margin_factor=0.5,       # 50% of loss as margin
            liquidity_impact=0.02,   # 2% liquidity cost (spread widening)
            pass_threshold=0.3,      # Pass if loss < 30%
        )

    def covid_crash_scenario(self, current_prices: np.ndarray,
                             positions: np.ndarray) -> StressTestResult:
        """Simulate COVID-19 crash scenario (March 2020)."""
        shocked_prices = current_prices * 0.7

        return self._evaluate(
            'COVID-19 Crash', current_prices, positions, shocked_prices,
            margin_factor=0.4,
            liquidity_impact=0.03,   # 3% liquidity cost
            pass_threshold=0.25,
        )

    def ftx_collapse_scenario(self, current_prices: np.ndarray,
                             positions: np.ndarray,
                             crypto_exposure: float = 0.5) -> StressTestResult:
        """Simulate FTX collapse scenario (November 2022)."""
        crypto_shock = 0.75       # 25% drop (BTC dropped ~20-25% during FTX collapse)
        traditional_shock = 0.8   # 20% drop in traditional assets

        # Apply different shocks based on asset type
        shocked_prices = np.array(current_prices, dtype=float)
        n_crypto = int(len(current_prices) * crypto_exposure)

        shocked_prices[:n_crypto] *= crypto_shock
        shocked_prices[n_crypto:] *= traditional_shock

        return self._evaluate(
            'FTX Collapse', current_prices, positions, shocked_prices,
            margin_factor=0.6,       # Higher margin for crypto
            liquidity_impact=0.10,   # 10% liquidity cost (crypto illiquidity)
            pass_threshold=0.4,
        )

    def custom_scenario(self, current_prices: np.ndarray,
                       positions: np.ndarray,
                       price_shocks: np.ndarray,
                       scenario_name: str = 'Custom') -> StressTestResult:
        """Simulate custom stress scenario."""
        shocked_prices = current_prices * price_shocks

        return self._evaluate(
            scenario_name, current_prices, positions, shocked_prices,
            margin_factor=0.5,
            liquidity_impact=np.std(price_shocks) * 0.05,  # Liquidity based on volatility
            pass_threshold=0.3,
        )

    def run_all_scenarios(self, current_prices: np.ndarray,
                          positions: np.ndarray) -> list[StressTestResult]:
        """Run all predefined stress test scenarios."""
        results = []

        results.append(self.crisis_2008_scenario(current_prices, positions))
        results.append(self.covid_crash_scenario(current_prices, positions))
        results.append(self.ftx_collapse_scenario(current_prices, positions))

        return results

    def generate_summary(self, results: list[StressTestResult]) -> dict:
        """Generate summary of stress test results."""
        total_scenarios = len(results)
        passed_scenarios = sum(1 for r in results if r.passed)

        if not results:
            return {
                "total_scenarios": 0,
                "passed_scenarios": 0,
                "pass_rate": 0.0,
                "worst_pnl_percentage": 0.0,
                "best_pnl_percentage": 0.0,
                "average_pnl_percentage": 0.0,
                "max_margin_requirement": 0.0,
                "max_liquidity_impact": 0.0,
                "overall_passed": True,
            }
        worst_pnl = min(r.pnl_percentage for r in results)
        best_pnl = max(r.pnl_percentage for r in results)
        avg_pnl = np.mean([r.pnl_percentage for r in results])

        max_margin = max(r.margin_requirement for r in results)
        max_liquidity = max(r.liquidity_impact for r in results)

        return {
            'total_scenarios': total_scenarios,
            'passed_scenarios': passed_scenarios,
            'pass_rate': passed_scenarios / total_scenarios if total_scenarios > 0 else 0,
            'worst_pnl_percentage': worst_pnl,
            'best_pnl_percentage': best_pnl,
            'average_pnl_percentage': avg_pnl,
            'max_margin_requirement': max_margin,
            'max_liquidity_impact': max_liquidity,
            'overall_passed': passed_scenarios == total_scenarios
        }
