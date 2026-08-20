# Stress Testing Module
#
# Implements stress testing scenarios including 2008 financial crisis, COVID-19 crash,
# FTX collapse, and custom scenarios with portfolio impact analysis.

import numpy as np
from dataclasses import dataclass


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
        """
        Initialize stress test scenario.
        
        Args:
            initial_portfolio_value: Initial portfolio value (default $100k)
        """
        self.initial_portfolio_value = initial_portfolio_value
    
    def crisis_2008_scenario(self, current_prices: np.ndarray,
                             positions: np.ndarray) -> StressTestResult:
        """
        Simulate 2008 financial crisis scenario.
        
        Args:
            current_prices: Current asset prices
            positions: Current positions (units)
        
        Returns:
            StressTestResult with crisis impact
        """
        # 2008 crisis: ~50% drop in equities, increased volatility
        shock_multiplier = 0.5  # 50% drop
        volatility_multiplier = 2.0  # 2x volatility
        
        shocked_prices = current_prices * shock_multiplier
        
        # Calculate portfolio value after shock
        portfolio_value_before = np.sum(current_prices * positions)
        portfolio_value_after = np.sum(shocked_prices * positions)
        
        pnl = portfolio_value_after - portfolio_value_before
        pnl_percentage = pnl / portfolio_value_before if portfolio_value_before != 0 else 0.0
        
        # Margin requirement increases during crisis
        margin_requirement = abs(pnl) * 0.5  # 50% of loss as margin
        
        # Liquidity impact (spread widening)
        liquidity_impact = 0.02  # 2% liquidity cost
        
        result = StressTestResult(
            scenario_name='2008 Financial Crisis',
            portfolio_value_before=portfolio_value_before,
            portfolio_value_after=portfolio_value_after,
            pnl=pnl,
            pnl_percentage=pnl_percentage,
            margin_requirement=margin_requirement,
            liquidity_impact=liquidity_impact,
            passed=abs(pnl_percentage) < 0.3  # Pass if loss < 30%
        )
        
        return result
    
    def covid_crash_scenario(self, current_prices: np.ndarray,
                             positions: np.ndarray) -> StressTestResult:
        """
        Simulate COVID-19 crash scenario (March 2020).
        
        Args:
            current_prices: Current asset prices
            positions: Current positions (units)
        
        Returns:
            StressTestResult with COVID crash impact
        """
        # COVID crash: ~30% drop in equities, extreme volatility
        shock_multiplier = 0.7  # 30% drop
        volatility_multiplier = 3.0  # 3x volatility
        
        shocked_prices = current_prices * shock_multiplier
        
        portfolio_value_before = np.sum(current_prices * positions)
        portfolio_value_after = np.sum(shocked_prices * positions)
        
        pnl = portfolio_value_after - portfolio_value_before
        pnl_percentage = pnl / portfolio_value_before if portfolio_value_before != 0 else 0.0
        
        margin_requirement = abs(pnl) * 0.4
        liquidity_impact = 0.03  # 3% liquidity cost
        
        result = StressTestResult(
            scenario_name='COVID-19 Crash',
            portfolio_value_before=portfolio_value_before,
            portfolio_value_after=portfolio_value_after,
            pnl=pnl,
            pnl_percentage=pnl_percentage,
            margin_requirement=margin_requirement,
            liquidity_impact=liquidity_impact,
            passed=abs(pnl_percentage) < 0.25
        )
        
        return result
    
    def ftx_collapse_scenario(self, current_prices: np.ndarray,
                             positions: np.ndarray,
                             crypto_exposure: float = 0.5) -> StressTestResult:
        """
        Simulate FTX collapse scenario (November 2022).
        
        Args:
            current_prices: Current asset prices
            positions: Current positions (units)
            crypto_exposure: Percentage of portfolio in crypto (default 50%)
        
        Returns:
            StressTestResult with FTX collapse impact
        """
        # FTX collapse: ~95% drop in FTT, contagion to other crypto
        crypto_shock = 0.05  # 95% drop
        traditional_shock = 0.8  # 20% drop in traditional assets
        
        # Apply different shocks based on asset type
        shocked_prices = current_prices.copy()
        n_crypto = int(len(current_prices) * crypto_exposure)
        
        shocked_prices[:n_crypto] *= crypto_shock
        shocked_prices[n_crypto:] *= traditional_shock
        
        portfolio_value_before = np.sum(current_prices * positions)
        portfolio_value_after = np.sum(shocked_prices * positions)
        
        pnl = portfolio_value_after - portfolio_value_before
        pnl_percentage = pnl / portfolio_value_before if portfolio_value_before != 0 else 0.0
        
        margin_requirement = abs(pnl) * 0.6  # Higher margin for crypto
        liquidity_impact = 0.10  # 10% liquidity cost (crypto illiquidity)
        
        result = StressTestResult(
            scenario_name='FTX Collapse',
            portfolio_value_before=portfolio_value_before,
            portfolio_value_after=portfolio_value_after,
            pnl=pnl,
            pnl_percentage=pnl_percentage,
            margin_requirement=margin_requirement,
            liquidity_impact=liquidity_impact,
            passed=abs(pnl_percentage) < 0.4
        )
        
        return result
    
    def custom_scenario(self, current_prices: np.ndarray,
                       positions: np.ndarray,
                       price_shocks: np.ndarray,
                       scenario_name: str = 'Custom') -> StressTestResult:
        """
        Simulate custom stress scenario.
        
        Args:
            current_prices: Current asset prices
            positions: Current positions (units)
            price_shocks: Price shock multipliers for each asset
            scenario_name: Name of the scenario
        
        Returns:
            StressTestResult with custom scenario impact
        """
        shocked_prices = current_prices * price_shocks
        
        portfolio_value_before = np.sum(current_prices * positions)
        portfolio_value_after = np.sum(shocked_prices * positions)
        
        pnl = portfolio_value_after - portfolio_value_before
        pnl_percentage = pnl / portfolio_value_before if portfolio_value_before != 0 else 0.0
        
        margin_requirement = abs(pnl) * 0.5
        liquidity_impact = np.std(price_shocks) * 0.05  # Liquidity based on volatility
        
        result = StressTestResult(
            scenario_name=scenario_name,
            portfolio_value_before=portfolio_value_before,
            portfolio_value_after=portfolio_value_after,
            pnl=pnl,
            pnl_percentage=pnl_percentage,
            margin_requirement=margin_requirement,
            liquidity_impact=liquidity_impact,
            passed=abs(pnl_percentage) < 0.3
        )
        
        return result
    
    def run_all_scenarios(self, current_prices: np.ndarray,
                          positions: np.ndarray) -> list[StressTestResult]:
        """
        Run all predefined stress test scenarios.
        
        Args:
            current_prices: Current asset prices
            positions: Current positions (units)
        
        Returns:
            List of StressTestResult objects
        """
        results = []
        
        results.append(self.crisis_2008_scenario(current_prices, positions))
        results.append(self.covid_crash_scenario(current_prices, positions))
        results.append(self.ftx_collapse_scenario(current_prices, positions))
        
        return results
    
    def generate_summary(self, results: list[StressTestResult]) -> dict:
        """
        Generate summary of stress test results.
        
        Args:
            results: List of StressTestResult objects
        
        Returns:
            Dictionary with summary statistics
        """
        total_scenarios = len(results)
        passed_scenarios = sum(1 for r in results if r.passed)
        
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
