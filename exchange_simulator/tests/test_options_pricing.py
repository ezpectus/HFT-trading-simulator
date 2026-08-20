# Tests for Options Pricing Module
# Tests Black-Scholes pricing, Greeks calculation, Binomial Tree, and options strategies

import math

import pytest

from exchange_simulator.options_pricing import BinomialTree, BlackScholes, Greeks, OptionType
from exchange_simulator.options_strategies import OptionsStrategies, StrategyType


class TestBlackScholes:
    """Test Black-Scholes pricing model."""

    def test_call_pricing(self):
        """Test European call option pricing."""
        bs = BlackScholes(risk_free_rate=0.05)

        # ATM call
        price = bs.calculate_call_price(S=100, K=100, T=0.25, sigma=0.2)
        assert price > 0
        assert price < 100  # Price should be less than stock price

        # ITM call
        price_itm = bs.calculate_call_price(S=110, K=100, T=0.25, sigma=0.2)
        assert price_itm > price

        # OTM call
        price_otm = bs.calculate_call_price(S=90, K=100, T=0.25, sigma=0.2)
        assert price_otm < price

    def test_put_pricing(self):
        """Test European put option pricing."""
        bs = BlackScholes(risk_free_rate=0.05)

        # ATM put
        price = bs.calculate_put_price(S=100, K=100, T=0.25, sigma=0.2)
        assert price > 0

        # ITM put
        price_itm = bs.calculate_put_price(S=90, K=100, T=0.25, sigma=0.2)
        assert price_itm > price

        # OTM put
        price_otm = bs.calculate_put_price(S=110, K=100, T=0.25, sigma=0.2)
        assert price_otm < price

    def test_put_call_parity(self):
        """Test put-call parity relationship."""
        bs = BlackScholes(risk_free_rate=0.05)

        S = 100
        K = 100
        T = 0.25
        sigma = 0.2
        r = 0.05

        call_price = bs.calculate_call_price(S, K, T, sigma)
        put_price = bs.calculate_put_price(S, K, T, sigma)

        # Put-call parity: C - P = S - K * e^(-rT)
        lhs = call_price - put_price
        rhs = S - K * math.exp(-r * T)

        assert abs(lhs - rhs) < 0.01  # Should be approximately equal

    def test_delta_calculation(self):
        """Test delta calculation."""
        bs = BlackScholes(risk_free_rate=0.05)

        # Call delta should be between 0 and 1
        call_delta = bs.calculate_delta(S=100, K=100, T=0.25, sigma=0.2, option_type=OptionType.CALL)
        assert 0 <= call_delta <= 1

        # Put delta should be between -1 and 0
        put_delta = bs.calculate_delta(S=100, K=100, T=0.25, sigma=0.2, option_type=OptionType.PUT)
        assert -1 <= put_delta <= 0

        # Deep ITM call delta should approach 1
        deep_itm_call_delta = bs.calculate_delta(S=150, K=100, T=0.25, sigma=0.2, option_type=OptionType.CALL)
        assert deep_itm_call_delta > 0.9

        # Deep OTM call delta should approach 0
        deep_otm_call_delta = bs.calculate_delta(S=50, K=100, T=0.25, sigma=0.2, option_type=OptionType.CALL)
        assert deep_otm_call_delta < 0.1

    def test_gamma_calculation(self):
        """Test gamma calculation."""
        bs = BlackScholes(risk_free_rate=0.05)

        gamma = bs.calculate_gamma(S=100, K=100, T=0.25, sigma=0.2)
        assert gamma > 0  # Gamma should always be positive

    def test_theta_calculation(self):
        """Test theta calculation."""
        bs = BlackScholes(risk_free_rate=0.05)

        # Theta should be negative for both calls and puts (time decay)
        call_theta = bs.calculate_theta(S=100, K=100, T=0.25, sigma=0.2, option_type=OptionType.CALL)
        put_theta = bs.calculate_theta(S=100, K=100, T=0.25, sigma=0.2, option_type=OptionType.PUT)

        assert call_theta < 0
        assert put_theta < 0

    def test_vega_calculation(self):
        """Test vega calculation."""
        bs = BlackScholes(risk_free_rate=0.05)

        vega = bs.calculate_vega(S=100, K=100, T=0.25, sigma=0.2)
        assert vega > 0  # Vega should always be positive

    def test_rho_calculation(self):
        """Test rho calculation."""
        bs = BlackScholes(risk_free_rate=0.05)

        call_rho = bs.calculate_rho(S=100, K=100, T=0.25, sigma=0.2, option_type=OptionType.CALL)
        put_rho = bs.calculate_rho(S=100, K=100, T=0.25, sigma=0.2, option_type=OptionType.PUT)

        # Call rho should be positive
        assert call_rho > 0
        # Put rho should be negative
        assert put_rho < 0

    def test_greeks_object(self):
        """Test Greeks object creation."""
        bs = BlackScholes(risk_free_rate=0.05)

        greeks = bs.calculate_greeks(S=100, K=100, T=0.25, sigma=0.2, option_type=OptionType.CALL)

        assert isinstance(greeks, Greeks)
        assert hasattr(greeks, 'delta')
        assert hasattr(greeks, 'gamma')
        assert hasattr(greeks, 'theta')
        assert hasattr(greeks, 'vega')
        assert hasattr(greeks, 'rho')

    def test_implied_volatility(self):
        """Test implied volatility calculation."""
        bs = BlackScholes(risk_free_rate=0.05)

        # Calculate option price with known volatility
        sigma = 0.2
        call_price = bs.calculate_call_price(S=100, K=100, T=0.25, sigma=sigma)

        # Recover implied volatility from price
        implied_sigma = bs.calculate_implied_volatility(
            S=100, K=100, T=0.25, market_price=call_price,
            option_type=OptionType.CALL
        )

        assert implied_sigma is not None
        assert abs(implied_sigma - sigma) < 0.01  # Should be close to original


class TestBinomialTree:
    """Test Binomial Tree pricing model."""

    def test_european_call_pricing(self):
        """Test European call option pricing with Binomial Tree."""
        bt = BinomialTree(risk_free_rate=0.05, steps=100)

        price = bt.calculate_european_call(S=100, K=100, T=0.25, sigma=0.2)
        assert price > 0
        assert price < 100

    def test_european_put_pricing(self):
        """Test European put option pricing with Binomial Tree."""
        bt = BinomialTree(risk_free_rate=0.05, steps=100)

        price = bt.calculate_european_put(S=100, K=100, T=0.25, sigma=0.2)
        assert price > 0

    def test_american_call_pricing(self):
        """Test American call option pricing with early exercise."""
        bt = BinomialTree(risk_free_rate=0.05, steps=100)

        price = bt.calculate_american_call(S=100, K=100, T=0.25, sigma=0.2)
        assert price > 0

    def test_american_put_pricing(self):
        """Test American put option pricing with early exercise."""
        bt = BinomialTree(risk_free_rate=0.05, steps=100)

        price = bt.calculate_american_put(S=100, K=100, T=0.25, sigma=0.2)
        assert price > 0

    def test_american_vs_european_put(self):
        """Test that American put should be >= European put (early exercise value)."""
        bt = BinomialTree(risk_free_rate=0.05, steps=100)

        european_price = bt.calculate_european_put(S=100, K=100, T=0.25, sigma=0.2)
        american_price = bt.calculate_american_put(S=100, K=100, T=0.25, sigma=0.2)

        # American put should be >= European put due to early exercise option
        assert american_price >= european_price

    def test_binomial_vs_black_scholes(self):
        """Test that Binomial Tree converges to Black-Scholes for European options."""
        bt = BinomialTree(risk_free_rate=0.05, steps=200)
        bs = BlackScholes(risk_free_rate=0.05)

        S = 100
        K = 100
        T = 0.25
        sigma = 0.2

        binomial_call = bt.calculate_european_call(S, K, T, sigma)
        bs_call = bs.calculate_call_price(S, K, T, sigma)

        # Should be close (within 1%)
        assert abs(binomial_call - bs_call) / bs_call < 0.01


class TestOptionsStrategies:
    """Test options strategies."""

    def test_straddle_long(self):
        """Test long straddle strategy."""
        os = OptionsStrategies(risk_free_rate=0.05)

        result = os.calculate_straddle(S=100, K=100, T=0.25, sigma=0.2, long=True)

        assert result.max_loss < 0  # Limited loss
        assert result.max_loss == pytest.approx(result.max_loss * -1)  # Loss equals premium
        assert result.max_profit == float('inf')  # Unlimited profit
        assert len(result.break_evens) == 2

    def test_straddle_short(self):
        """Test short straddle strategy."""
        os = OptionsStrategies(risk_free_rate=0.05)

        result = os.calculate_straddle(S=100, K=100, T=0.25, sigma=0.2, long=False)

        assert result.max_profit > 0  # Limited profit
        assert result.max_loss == float('inf')  # Unlimited loss
        assert len(result.break_evens) == 2

    def test_strangle_long(self):
        """Test long strangle strategy."""
        os = OptionsStrategies(risk_free_rate=0.05)

        result = os.calculate_strangle(S=100, K_call=105, K_put=95, T=0.25, sigma=0.2, long=True)

        assert result.max_loss < 0
        assert result.max_profit == float('inf')
        assert len(result.break_evens) == 2

    def test_iron_condor(self):
        """Test iron condor strategy."""
        os = OptionsStrategies(risk_free_rate=0.05)

        result = os.calculate_iron_condor(
            S=100, K_call_high=110, K_call_low=105,
            K_put_high=95, K_put_low=90, T=0.25, sigma=0.2
        )

        assert result.max_profit > 0  # Limited profit
        assert result.max_loss < 0  # Limited loss
        assert len(result.break_evens) == 2

    def test_butterfly_long(self):
        """Test long butterfly strategy."""
        os = OptionsStrategies(risk_free_rate=0.05)

        result = os.calculate_butterfly(
            S=100, K_low=90, K_middle=100, K_high=110,
            T=0.25, sigma=0.2, long=True
        )

        assert result.max_profit > 0  # Limited profit
        assert result.max_loss < 0  # Limited loss
        assert len(result.break_evens) == 2

    def test_payoff_at_expiry(self):
        """Test payoff calculation at expiry."""
        os = OptionsStrategies(risk_free_rate=0.05)

        result = os.calculate_straddle(S=100, K=100, T=0.25, sigma=0.2, long=True)

        assert len(result.payoff_at_expiry) > 0
        assert all(price >= 0 for price, payoff in result.payoff_at_expiry)
