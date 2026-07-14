"""Tests for the options simulator — Black-Scholes pricing and Greeks."""
import math
import pytest
from exchange_simulator.options_simulator import OptionsSimulator, OptionQuote


@pytest.fixture
def sim():
    return OptionsSimulator(risk_free_rate=0.05)


class TestBlackScholes:
    """Test Black-Scholes option pricing."""

    def test_call_price_positive(self, sim):
        q = sim.price_option(S=100, K=100, T=1.0, sigma=0.2, option_type="call")
        assert q.price > 0

    def test_put_price_positive(self, sim):
        q = sim.price_option(S=100, K=100, T=1.0, sigma=0.2, option_type="put")
        assert q.price > 0

    def test_call_itm_higher_than_otm(self, sim):
        itm = sim.price_option(S=120, K=100, T=1.0, sigma=0.2, option_type="call")
        otm = sim.price_option(S=80, K=100, T=1.0, sigma=0.2, option_type="call")
        assert itm.price > otm.price

    def test_put_itm_higher_than_otm(self, sim):
        itm = sim.price_option(S=80, K=100, T=1.0, sigma=0.2, option_type="put")
        otm = sim.price_option(S=120, K=100, T=1.0, sigma=0.2, option_type="put")
        assert itm.price > otm.price

    def test_at_expiry_intrinsic_only(self, sim):
        call = sim.price_option(S=105, K=100, T=0, sigma=0.2, option_type="call")
        assert call.price == 5.0  # intrinsic value
        put = sim.price_option(S=95, K=100, T=0, sigma=0.2, option_type="put")
        assert put.price == 5.0

    def test_zero_volatility(self, sim):
        q = sim.price_option(S=100, K=100, T=1.0, sigma=0, option_type="call")
        assert q.price == 0


class TestGreeks:
    """Test Greeks calculations."""

    def test_call_delta_in_range(self, sim):
        q = sim.price_option(S=100, K=100, T=1.0, sigma=0.2, option_type="call")
        assert 0 < q.delta < 1

    def test_put_delta_in_range(self, sim):
        q = sim.price_option(S=100, K=100, T=1.0, sigma=0.2, option_type="put")
        assert -1 < q.delta < 0

    def test_gamma_positive(self, sim):
        q = sim.price_option(S=100, K=100, T=1.0, sigma=0.2, option_type="call")
        assert q.gamma > 0

    def test_vega_positive(self, sim):
        q = sim.price_option(S=100, K=100, T=1.0, sigma=0.2, option_type="call")
        assert q.vega > 0

    def test_call_theta_negative(self, sim):
        q = sim.price_option(S=100, K=100, T=1.0, sigma=0.2, option_type="call")
        assert q.theta < 0  # options lose value over time

    def test_call_rho_positive(self, sim):
        q = sim.price_option(S=100, K=100, T=1.0, sigma=0.2, option_type="call")
        assert q.rho > 0  # calls benefit from higher rates

    def test_put_rho_negative(self, sim):
        q = sim.price_option(S=100, K=100, T=1.0, sigma=0.2, option_type="put")
        assert q.rho < 0  # puts suffer from higher rates

    def test_atm_gamma_highest(self, sim):
        atm = sim.price_option(S=100, K=100, T=1.0, sigma=0.2, option_type="call")
        otm = sim.price_option(S=100, K=150, T=1.0, sigma=0.2, option_type="call")
        assert atm.gamma > otm.gamma


class TestPutCallParity:
    """Test put-call parity."""

    def test_parity_holds(self, sim):
        result = sim.put_call_parity(S=100, K=100, T=1.0, sigma=0.2)
        assert result["parity_ok"] is True
        assert abs(result["parity_diff"]) < 0.01

    def test_parity_holds_otm(self, sim):
        result = sim.put_call_parity(S=80, K=100, T=0.5, sigma=0.3)
        assert result["parity_ok"] is True


class TestImpliedVol:
    """Test implied volatility calculation."""

    def test_roundtrip(self, sim):
        true_sigma = 0.5
        q = sim.price_option(S=100, K=100, T=1.0, sigma=true_sigma, option_type="call")
        iv = sim.implied_vol(S=100, K=100, T=1.0, market_price=q.price, option_type="call")
        assert abs(iv - true_sigma) < 0.01

    def test_roundtrip_put(self, sim):
        true_sigma = 0.8
        q = sim.price_option(S=65000, K=70000, T=0.25, sigma=true_sigma, option_type="put")
        iv = sim.implied_vol(S=65000, K=70000, T=0.25, market_price=q.price, option_type="put")
        assert abs(iv - true_sigma) < 0.01


class TestOptionChain:
    """Test option chain generation."""

    def test_chain_length(self, sim):
        chain = sim.generate_chain(
            S=100, expiries=[0.25, 0.5], strikes=[90, 100, 110], sigma=0.2
        )
        assert len(chain) == 2 * 3 * 2  # expiries * strikes * types

    def test_chain_contains_both_types(self, sim):
        chain = sim.generate_chain(
            S=100, expiries=[0.25], strikes=[100], sigma=0.2
        )
        types = {q.option_type for q in chain}
        assert types == {"call", "put"}

    def test_chain_custom_types(self, sim):
        chain = sim.generate_chain(
            S=100, expiries=[0.25], strikes=[100], sigma=0.2, option_types=["call"]
        )
        assert all(q.option_type == "call" for q in chain)
