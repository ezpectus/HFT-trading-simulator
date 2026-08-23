"""Unit tests for risk/var_stress_test.py.

Covers: RiskAnalyzer, RiskMetrics, StressTestResult, STRESS_SCENARIOS.
"""
import numpy as np
import pytest

pytestmark = pytest.mark.filterwarnings("ignore::DeprecationWarning")


class TestDeprecation:
    def test_module_emits_deprecation_warning(self):
        import importlib
        import src.risk.var_stress_test as mod
        importlib.reload(mod)
        import warnings
        with warnings.catch_warnings(record=True) as w:
            warnings.simplefilter("always")
            importlib.reload(mod)
            assert any(issubclass(x.category, DeprecationWarning) for x in w)


class TestStressScenarios:
    def test_all_scenarios_have_required_keys(self):
        from src.risk.var_stress_test import STRESS_SCENARIOS
        for name, config in STRESS_SCENARIOS.items():
            assert "shock_pct" in config, f"{name} missing shock_pct"
            assert "duration_days" in config, f"{name} missing duration_days"
            assert "description" in config, f"{name} missing description"
            assert config["shock_pct"] < 0, f"{name} shock should be negative"

    def test_known_scenarios_exist(self):
        from src.risk.var_stress_test import STRESS_SCENARIOS
        expected = {"covid_crash", "ftx_collapse", "flash_crash_2021", "luna_collapse", "china_ban_2021", "2008_financial", "extreme_tail"}
        assert expected.issubset(set(STRESS_SCENARIOS.keys()))


class TestRiskAnalyzer:
    @pytest.fixture
    def analyzer(self):
        from src.risk.var_stress_test import RiskAnalyzer
        np.random.seed(42)
        returns = np.random.normal(0.001, 0.02, 500)
        return RiskAnalyzer(returns, portfolio_value=100000.0)

    @pytest.fixture
    def multi_asset_analyzer(self):
        from src.risk.var_stress_test import RiskAnalyzer
        np.random.seed(42)
        returns = np.random.normal(0.001, 0.02, (500, 3))
        return RiskAnalyzer(returns, portfolio_value=100000.0)

    def test_init_single_asset(self, analyzer):
        assert analyzer.portfolio_value == 100000.0
        assert analyzer.n_assets == 1
        assert len(analyzer.port_returns) == 500

    def test_init_multi_asset(self, multi_asset_analyzer):
        assert multi_asset_analyzer.n_assets == 3
        assert len(multi_asset_analyzer.port_returns) == 500

    def test_historical_var_positive(self, analyzer):
        var_95 = analyzer.historical_var(0.95)
        assert var_95 > 0

    def test_historical_var_99_greater_than_95(self, analyzer):
        var_95 = analyzer.historical_var(0.95)
        var_99 = analyzer.historical_var(0.99)
        assert var_99 >= var_95

    def test_historical_cvar_greater_than_var(self, analyzer):
        var_95 = analyzer.historical_var(0.95)
        cvar_95 = analyzer.historical_cvar(0.95)
        assert cvar_95 >= var_95

    def test_parametric_var_positive(self, analyzer):
        var = analyzer.parametric_var(0.95)
        assert var > 0

    def test_monte_carlo_var_positive(self, analyzer):
        var = analyzer.monte_carlo_var(0.95, n_sims=1000)
        assert var > 0

    def test_monte_carlo_cvar_positive(self, analyzer):
        cvar = analyzer.monte_carlo_cvar(0.95, n_sims=1000)
        assert cvar > 0

    def test_stress_test_valid_scenario(self, analyzer):
        result = analyzer.stress_test("covid_crash")
        assert result.scenario == "covid_crash"
        assert result.portfolio_loss_usd > 0
        assert result.portfolio_loss_pct > 0
        assert result.recovery_time_days > 0
        assert "COVID" in result.description

    def test_stress_test_invalid_scenario_raises(self, analyzer):
        with pytest.raises(ValueError, match="Unknown scenario"):
            analyzer.stress_test("nonexistent")

    def test_stress_test_all(self, analyzer):
        results = analyzer.stress_test_all()
        assert len(results) == 7
        for r in results:
            assert r.portfolio_loss_usd > 0

    def test_compute_all_metrics(self, analyzer):
        metrics = analyzer.compute_all_metrics()
        assert metrics.var_95 > 0
        assert metrics.var_99 > 0
        assert metrics.cvar_95 > 0
        assert metrics.cvar_99 > 0
        assert metrics.max_drawdown <= 0
        assert metrics.volatility_annual > 0

    def test_multi_asset_stress_test(self, multi_asset_analyzer):
        result = multi_asset_analyzer.stress_test("covid_crash")
        assert result.worst_asset.startswith("Asset_")
