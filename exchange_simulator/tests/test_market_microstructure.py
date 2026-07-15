"""Tests for MarketMicrostructure — regime switching, Heston vol, fat tails, jumps."""
import pytest
import numpy as np

from exchange_simulator.market_microstructure import (
    MarketMicrostructure, MicrostructureConfig, MarketRegime,
    REGIME_TRANSITIONS, REGIME_PARAMS,
)


class TestMicrostructureConfig:
    def test_default_config(self):
        cfg = MicrostructureConfig()
        assert cfg.base_volatility == 0.02
        assert cfg.student_t_df == 4.0
        assert cfg.heston_kappa == 2.0
        assert cfg.heston_theta == 0.04
        assert cfg.heston_sigma == 0.3
        assert cfg.heston_rho == -0.7
        assert cfg.intraday_pattern is True
        assert cfg.regime_switching is True

    def test_custom_config(self):
        cfg = MicrostructureConfig(base_volatility=0.05, student_t_df=10.0)
        assert cfg.base_volatility == 0.05
        assert cfg.student_t_df == 10.0


class TestRegimeTransitions:
    def test_transition_matrix_rows_sum_to_one(self):
        for i in range(4):
            assert REGIME_TRANSITIONS[i].sum() == pytest.approx(1.0)

    def test_calm_is_most_persistent(self):
        assert REGIME_TRANSITIONS[MarketRegime.CALM.value][MarketRegime.CALM.value] > 0.98

    def test_crash_can_lead_to_recovery(self):
        crash_to_recovery = REGIME_TRANSITIONS[MarketRegime.CRASH.value][MarketRegime.RECOVERY.value]
        assert crash_to_recovery > 0.0

    def test_regime_params_exist_for_all(self):
        for regime in MarketRegime:
            assert regime in REGIME_PARAMS
            params = REGIME_PARAMS[regime]
            assert "drift" in params
            assert "vol_scale" in params
            assert "jump_prob" in params
            assert "jump_size" in params

    def test_crash_has_highest_vol_scale(self):
        crash_vol = REGIME_PARAMS[MarketRegime.CRASH]["vol_scale"]
        calm_vol = REGIME_PARAMS[MarketRegime.CALM]["vol_scale"]
        assert crash_vol > calm_vol

    def test_crash_has_negative_drift(self):
        assert REGIME_PARAMS[MarketRegime.CRASH]["drift"] < 0


class TestMarketMicrostructureInit:
    def test_initial_state(self):
        ms = MarketMicrostructure()
        assert ms.regime == MarketRegime.CALM
        assert ms.variance == pytest.approx(0.04)  # heston_theta
        assert ms.step_count == 0

    def test_custom_config(self):
        cfg = MicrostructureConfig(heston_theta=0.09)
        ms = MarketMicrostructure(cfg)
        assert ms.variance == pytest.approx(0.09)

    def test_reset(self):
        ms = MarketMicrostructure()
        ms.step_count = 100
        ms.regime = MarketRegime.CRASH
        ms.variance = 1.0
        ms.reset(seed=123)
        assert ms.regime == MarketRegime.CALM
        assert ms.variance == pytest.approx(0.04)
        assert ms.step_count == 0


class TestIntradayVolMultiplier:
    def test_midday_low_volatility(self):
        ms = MarketMicrostructure()
        mult = ms._intraday_vol_multiplier(12, 0)
        # At t=12: 0.7 + 0.8 * (0) = 0.7
        assert mult == pytest.approx(0.7)

    def test_open_high_volatility(self):
        ms = MarketMicrostructure()
        mult = ms._intraday_vol_multiplier(0, 0)
        # At t=0: 0.7 + 0.8 * (0/12 - 1)^2 = 0.7 + 0.8 = 1.5
        assert mult == pytest.approx(1.5)

    def test_disabled_returns_one(self):
        cfg = MicrostructureConfig(intraday_pattern=False)
        ms = MarketMicrostructure(cfg)
        mult = ms._intraday_vol_multiplier(12, 0)
        assert mult == pytest.approx(1.0)


class TestHestonVariance:
    def test_variance_has_floor(self):
        cfg = MicrostructureConfig(heston_theta=0.04, heston_kappa=5.0, heston_sigma=1.0)
        ms = MarketMicrostructure(cfg)
        for _ in range(100):
            ms._update_heston_variance(cfg.dt)
            assert ms.variance >= 0.001

    def test_variance_reverts_to_theta(self):
        cfg = MicrostructureConfig(heston_theta=0.04, heston_kappa=10.0, heston_sigma=0.01)
        ms = MarketMicrostructure(cfg)
        ms.variance = 0.5  # Start far from theta
        for _ in range(10000):
            ms._update_heston_variance(cfg.dt)
        assert ms.variance < 0.1  # Should have reverted significantly


class TestGenerateReturn:
    def test_return_is_finite(self):
        ms = MarketMicrostructure()
        ret = ms.generate_return()
        assert np.isfinite(ret)

    def test_step_count_increments(self):
        ms = MarketMicrostructure()
        assert ms.step_count == 0
        ms.generate_return()
        assert ms.step_count == 1
        ms.generate_return()
        assert ms.step_count == 2

    def test_returns_have_variance(self):
        ms = MarketMicrostructure()
        returns = [ms.generate_return() for _ in range(500)]
        assert np.std(returns) > 0.0

    def test_returns_with_no_jumps_no_regime(self):
        """With regime switching off and low jump prob, returns should be small."""
        cfg = MicrostructureConfig(regime_switching=False)
        cfg.jump_lambda = 0.0
        ms = MarketMicrostructure(cfg)
        returns = [ms.generate_return() for _ in range(100)]
        # Most returns should be small (no jumps)
        assert np.median(np.abs(returns)) < 0.01


class TestGeneratePrice:
    def test_price_positive(self):
        ms = MarketMicrostructure()
        price = ms.generate_price(50000.0)
        assert price > 0.0

    def test_price_is_geometric(self):
        """Price = S * exp(r), so always positive."""
        ms = MarketMicrostructure()
        for _ in range(100):
            price = ms.generate_price(50000.0)
            assert price > 0.0


class TestGenerateVolume:
    def test_volume_positive(self):
        ms = MarketMicrostructure()
        vol = ms.generate_volume()
        assert vol > 0.0

    def test_volume_scales_with_regime(self):
        """Crash regime should produce higher volume."""
        ms = MarketMicrostructure()

        ms.regime = MarketRegime.CRASH
        crash_vols = [ms.generate_volume(base_volume=100.0) for _ in range(100)]

        ms.regime = MarketRegime.CALM
        calm_vols = [ms.generate_volume(base_volume=100.0) for _ in range(100)]

        assert np.mean(crash_vols) > np.mean(calm_vols)

    def test_volume_has_noise(self):
        ms = MarketMicrostructure()
        vols = [ms.generate_volume() for _ in range(100)]
        assert len(set(vols)) > 10  # Not all the same


class TestGetState:
    def test_state_structure(self):
        ms = MarketMicrostructure()
        state = ms.get_state()
        assert "regime" in state
        assert "variance" in state
        assert "step_count" in state
        assert "effective_vol" in state

    def test_state_reflects_changes(self):
        ms = MarketMicrostructure()
        ms.generate_return()
        ms.generate_return()
        state = ms.get_state()
        assert state["step_count"] == 2
        assert state["regime"] in ["CALM", "VOLATILE", "CRASH", "RECOVERY"]


class TestRegimeSwitching:
    def test_disabled_regime_stays_calm(self):
        cfg = MicrostructureConfig(regime_switching=False)
        ms = MarketMicrostructure(cfg)
        for _ in range(1000):
            ms.generate_return()
        assert ms.regime == MarketRegime.CALM

    def test_enabled_regime_can_change(self):
        """With enough steps, regime should eventually change from CALM."""
        ms = MarketMicrostructure()
        changed = False
        for _ in range(10000):
            ms.generate_return()
            if ms.regime != MarketRegime.CALM:
                changed = True
                break
        assert changed is True


class TestSampleStudentT:
    def test_returns_finite(self):
        ms = MarketMicrostructure()
        for _ in range(100):
            val = ms._sample_student_t(4.0)
            assert np.isfinite(val)

    def test_fat_tails_produce_extreme_values(self):
        ms = MarketMicrostructure()
        samples = [ms._sample_student_t(4.0) for _ in range(10000)]
        # Student-t(4) should produce some values > 3 sigma
        assert max(abs(s) for s in samples) > 3.0


class TestSampleJump:
    def test_no_jump_when_prob_zero(self):
        ms = MarketMicrostructure()
        params = {"jump_prob": 0.0, "jump_mu": -0.01, "jump_sigma": 0.03}
        assert ms._sample_jump(params) == 0.0

    def test_jump_occurs_when_prob_one(self):
        ms = MarketMicrostructure()
        params = {"jump_prob": 1.0, "jump_mu": -0.05, "jump_sigma": 0.01}
        jump = ms._sample_jump(params)
        assert jump != 0.0


class TestReproducibility:
    def test_same_seed_produces_same_returns(self):
        ms1 = MarketMicrostructure()
        ms1.reset(seed=42)
        r1 = [ms1.generate_return() for _ in range(20)]

        ms2 = MarketMicrostructure()
        ms2.reset(seed=42)
        r2 = [ms2.generate_return() for _ in range(20)]

        assert r1 == pytest.approx(r2)
