"""Unit tests for previously untested modules.

Covers:
- pricing/volatility_surface.py (SVIParams, SABRParams, VolatilitySurface)
- risk/var_stress_test.py (RiskAnalyzer, RiskMetrics, StressTestResult, STRESS_SCENARIOS)
- strategies/market_making.py (MarketMakingConfig, Quote, MarketMakingStrategy)
- strategies/sentiment.py (EventType, NewsEvent, SentimentConfig, SentimentStrategy)
- strategies/statistical_arbitrage.py (KalmanFilterHedge, PairConfig, StatisticalArbitrage, CorrelationMatrix)
- backtesting/order_book_replay.py (ReplayOrderBookLevel, ReplayOrderBook, OrderBookReplay, OrderBookBacktester)
- backtesting/plotter.py (BacktestPlotter)
- backtesting/optimizer.py (OptimizationResult, StrategyOptimizer)
"""
import math
import os
import tempfile

import numpy as np
import pytest

from src.strategies.strategies import Signal, SignalDirection


# ─── Fixtures ───


@pytest.fixture
def sample_candles() -> list[dict]:
    """Generate 100 sample candles for testing."""
    candles = []
    base = 50000.0
    for i in range(100):
        vol = 100.0 + i * 0.5
        candles.append({
            "open": base + i * 10,
            "high": base + i * 10 + 200,
            "low": base + i * 10 - 150,
            "close": base + i * 10 + 50,
            "volume": vol,
            "timestamp": 1700000000 + i * 300,
        })
    return candles


@pytest.fixture
def sample_candle() -> dict:
    return {
        "open": 50000.0,
        "high": 50200.0,
        "low": 49800.0,
        "close": 50100.0,
        "volume": 150.0,
        "timestamp": 1700000000,
    }


# ─── pricing/volatility_surface.py ───


class TestSVIParams:
    def test_svi_params_creation(self):
        from src.pricing.volatility_surface import SVIParams
        p = SVIParams(a=0.04, b=0.1, rho=0.0, m=0.0, sigma=0.1)
        assert p.a == 0.04
        assert p.b == 0.1
        assert p.rho == 0.0
        assert p.m == 0.0
        assert p.sigma == 0.1


class TestSABRParams:
    def test_sabr_params_creation(self):
        from src.pricing.volatility_surface import SABRParams
        p = SABRParams(alpha=0.3, beta=0.5, rho=0.0, nu=0.3)
        assert p.alpha == 0.3
        assert p.beta == 0.5
        assert p.rho == 0.0
        assert p.nu == 0.3


class TestVolatilitySurface:
    def test_init_default_svi(self):
        from src.pricing.volatility_surface import VolatilitySurface
        vs = VolatilitySurface(model="svi")
        assert vs.model == "svi"
        assert vs.svi_params is None
        assert vs.sabr_params is None
        assert vs._calibrated is False

    def test_init_sabr(self):
        from src.pricing.volatility_surface import VolatilitySurface
        vs = VolatilitySurface(model="sabr")
        assert vs.model == "sabr"

    def test_svi_variance_at_center(self):
        from src.pricing.volatility_surface import SVIParams, VolatilitySurface
        vs = VolatilitySurface()
        p = SVIParams(a=0.04, b=0.1, rho=0.0, m=0.0, sigma=0.1)
        var = vs.svi_variance(0.0, p)
        expected = 0.04 + 0.1 * (0.0 + math.sqrt(0.0 + 0.01))
        assert abs(var - expected) < 1e-10

    def test_svi_variance_symmetric(self):
        from src.pricing.volatility_surface import SVIParams, VolatilitySurface
        vs = VolatilitySurface()
        p = SVIParams(a=0.04, b=0.1, rho=0.0, m=0.0, sigma=0.1)
        var_pos = vs.svi_variance(0.1, p)
        var_neg = vs.svi_variance(-0.1, p)
        assert abs(var_pos - var_neg) < 1e-10

    def test_implied_vol_svi_no_params_returns_fallback(self):
        from src.pricing.volatility_surface import VolatilitySurface
        vs = VolatilitySurface()
        iv = vs.implied_vol_svi(0.0, 1.0)
        assert iv == 0.5

    def test_implied_vol_svi_negative_variance_returns_fallback(self):
        from src.pricing.volatility_surface import SVIParams, VolatilitySurface
        vs = VolatilitySurface()
        vs.svi_params = SVIParams(a=-0.5, b=0.1, rho=0.0, m=0.0, sigma=0.1)
        iv = vs.implied_vol_svi(0.0, 1.0)
        assert iv == 0.5

    def test_implied_vol_svi_valid(self):
        from src.pricing.volatility_surface import SVIParams, VolatilitySurface
        vs = VolatilitySurface()
        vs.svi_params = SVIParams(a=0.04, b=0.1, rho=0.0, m=0.0, sigma=0.1)
        iv = vs.implied_vol_svi(0.0, 0.25)
        expected = math.sqrt(0.04 + 0.1 * 0.1) / math.sqrt(0.25)
        assert abs(iv - expected) < 1e-6

    def test_sabr_implied_vol_atm(self):
        from src.pricing.volatility_surface import SABRParams, VolatilitySurface
        vs = VolatilitySurface()
        p = SABRParams(alpha=0.3, beta=0.5, rho=0.0, nu=0.3)
        iv = vs.sabr_implied_vol(100.0, 100.0, 1.0, p)
        assert iv > 0

    def test_sabr_implied_vol_otm(self):
        from src.pricing.volatility_surface import SABRParams, VolatilitySurface
        vs = VolatilitySurface()
        p = SABRParams(alpha=0.3, beta=0.5, rho=0.0, nu=0.3)
        iv = vs.sabr_implied_vol(100.0, 110.0, 1.0, p)
        assert iv > 0

    def test_sabr_implied_vol_zero_forward_returns_fallback(self):
        from src.pricing.volatility_surface import SABRParams, VolatilitySurface
        vs = VolatilitySurface()
        p = SABRParams(alpha=0.3, beta=0.5, rho=0.0, nu=0.3)
        iv = vs.sabr_implied_vol(0.0, 100.0, 1.0, p)
        assert iv == 0.5

    def test_implied_vol_no_model_returns_fallback(self):
        from src.pricing.volatility_surface import VolatilitySurface
        vs = VolatilitySurface(model="svi")
        iv = vs.implied_vol(strike=100.0, maturity_days=30, forward=100.0)
        assert iv == 0.5

    def test_implied_vol_zero_maturity_returns_fallback(self):
        from src.pricing.volatility_surface import VolatilitySurface
        vs = VolatilitySurface()
        iv = vs.implied_vol(strike=100.0, maturity_days=0, forward=100.0)
        assert iv == 0.5

    def test_generate_surface(self):
        from src.pricing.volatility_surface import SVIParams, VolatilitySurface
        vs = VolatilitySurface(model="svi")
        vs.svi_params = SVIParams(a=0.04, b=0.1, rho=0.0, m=0.0, sigma=0.1)
        maturities = np.array([7, 30, 90])
        strikes = np.array([48000, 50000, 52000])
        surface = vs.generate_surface(50000.0, maturities, strikes)
        assert surface.shape == (3, 3)
        assert np.all(surface > 0)

    def test_calibrate_svi_returns_params(self):
        from src.pricing.volatility_surface import SVIParams, VolatilitySurface
        vs = VolatilitySurface()
        log_m = np.array([-0.1, -0.05, 0.0, 0.05, 0.1])
        var = np.array([0.06, 0.05, 0.04, 0.05, 0.06])
        params = vs.calibrate_svi(log_m, var)
        assert isinstance(params, SVIParams)
        assert params.a > 0


# ─── risk/var_stress_test.py ───


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


# ─── strategies/market_making.py ───


class TestMarketMakingConfig:
    def test_defaults(self):
        from src.strategies.market_making import MarketMakingConfig
        cfg = MarketMakingConfig()
        assert cfg.gamma == 0.1
        assert cfg.sigma == 0.3
        assert cfg.max_inventory == 5.0
        assert cfg.min_spread == 0.0001

    def test_custom(self):
        from src.strategies.market_making import MarketMakingConfig
        cfg = MarketMakingConfig(gamma=0.2, sigma=0.5, max_inventory=10.0)
        assert cfg.gamma == 0.2
        assert cfg.sigma == 0.5
        assert cfg.max_inventory == 10.0


class TestMarketMakingStrategy:
    @pytest.fixture
    def mm(self):
        from src.strategies.market_making import MarketMakingConfig, MarketMakingStrategy
        return MarketMakingStrategy(MarketMakingConfig())

    def test_init(self, mm):
        assert mm.name == "market_making"
        assert mm.inventory == 0.0
        assert mm.fill_count == 0
        assert mm.order_count == 0
        assert mm.total_pnl == 0.0

    def test_update_inventory(self, mm):
        mm.update_inventory(1.5)
        assert mm.inventory == 1.5
        mm.update_inventory(-0.5)
        assert mm.inventory == 1.0

    def test_update_toxicity(self, mm):
        mm.update_toxicity(0.5)
        assert mm.toxicity_score == 0.5

    def test_generate_quotes_normal(self, mm):
        q = mm.generate_quotes(50000.0)
        assert not q.should_cancel
        assert q.bid_price < q.ask_price
        assert q.mid_price == 50000.0
        assert q.bid_size > 0
        assert q.ask_size > 0
        assert mm.order_count == 1

    def test_generate_quotes_toxic_cancel(self, mm):
        mm.update_toxicity(0.8)
        q = mm.generate_quotes(50000.0)
        assert q.should_cancel
        assert q.bid_price == 0
        assert q.ask_price == 0

    def test_generate_quotes_max_long_inventory(self, mm):
        from src.strategies.market_making import MarketMakingConfig, MarketMakingStrategy
        cfg = MarketMakingConfig(max_inventory=2.0)
        strategy = MarketMakingStrategy(cfg)
        strategy.update_inventory(2.0)
        q = strategy.generate_quotes(50000.0)
        assert q.bid_price == 0
        assert q.ask_price > 0
        assert "ask only" in q.reason

    def test_generate_quotes_max_short_inventory(self, mm):
        from src.strategies.market_making import MarketMakingConfig, MarketMakingStrategy
        cfg = MarketMakingConfig(max_inventory=2.0)
        strategy = MarketMakingStrategy(cfg)
        strategy.update_inventory(-2.0)
        q = strategy.generate_quotes(50000.0)
        assert q.bid_price > 0
        assert q.ask_price == 0
        assert "bid only" in q.reason

    def test_on_fill_buy_increases_inventory(self, mm):
        mm.on_fill("BUY", 1.0, 50000.0)
        assert mm.inventory == 1.0
        assert mm.fill_count == 1

    def test_on_fill_sell_decreases_inventory(self, mm):
        mm.on_fill("BUY", 2.0, 50000.0)
        mm.on_fill("SELL", 1.0, 51000.0)
        assert mm.inventory == 1.0
        assert mm.fill_count == 2
        assert mm.total_pnl > 0

    def test_on_fill_direction_change(self, mm):
        mm.on_fill("BUY", 2.0, 50000.0)
        mm.on_fill("SELL", 3.0, 49000.0)
        assert mm.inventory == -1.0
        assert mm.fill_count == 2

    def test_analyze_no_candles(self, mm):
        sig = mm.analyze("BTC/USDT", [])
        assert sig.direction == SignalDirection.NEUTRAL
        assert "No data" in sig.reason

    def test_analyze_with_candles(self, mm, sample_candles):
        sig = mm.analyze("BTC/USDT", sample_candles)
        assert sig.strategy == "market_making"
        assert sig.entry_price > 0

    def test_analyze_reduce_long_inventory(self, mm):
        from src.strategies.market_making import MarketMakingConfig, MarketMakingStrategy
        cfg = MarketMakingConfig(max_inventory=2.0)
        strategy = MarketMakingStrategy(cfg)
        strategy.update_inventory(1.5)
        sig = strategy.analyze("BTC/USDT", sample_candles)
        assert sig.direction == SignalDirection.SHORT
        assert "Reducing" in sig.reason

    def test_get_stats(self, mm):
        mm.on_fill("BUY", 1.0, 50000.0)
        stats = mm.get_stats()
        assert stats["inventory"] == 1.0
        assert stats["fill_count"] == 1
        assert "fill_rate" in stats
        assert "toxicity" in stats


# ─── strategies/sentiment.py ───


class TestEventType:
    def test_all_event_types(self):
        from src.strategies.sentiment import EventType
        assert EventType.FOMC.value == "fomc"
        assert EventType.HACK.value == "hack"
        assert EventType.LISTING.value == "listing"

    def test_sentiment_map(self):
        from src.strategies.sentiment import EVENT_SENTIMENT_MAP, EventType
        assert EVENT_SENTIMENT_MAP[EventType.HACK] == -0.9
        assert EVENT_SENTIMENT_MAP[EventType.LISTING] == 0.7
        assert EVENT_SENTIMENT_MAP[EventType.FOMC] == 0.0

    def test_volatility_map(self):
        from src.strategies.sentiment import EVENT_VOLATILITY_MAP, EventType
        assert EVENT_VOLATILITY_MAP[EventType.HACK] == 4.0
        assert EVENT_VOLATILITY_MAP[EventType.FOMC] == 3.0


class TestNewsEvent:
    def test_creation(self):
        from src.strategies.sentiment import EventType, NewsEvent
        ev = NewsEvent(
            event_type=EventType.FOMC,
            symbol="BTC/USDT",
            timestamp=1700000000.0,
            magnitude=0.8,
        )
        assert ev.event_type == EventType.FOMC
        assert ev.symbol == "BTC/USDT"
        assert ev.sentiment == 0.0
        assert ev.expected is True


class TestSentimentStrategy:
    @pytest.fixture
    def strategy(self):
        from src.strategies.sentiment import SentimentConfig, SentimentStrategy
        return SentimentStrategy(SentimentConfig())

    def test_init(self, strategy):
        assert strategy.name == "sentiment"
        assert strategy.event_count == 0
        assert strategy.current_sentiment == 0.0

    def test_on_news_event_low_magnitude_ignored(self, strategy):
        from src.strategies.sentiment import EventType, NewsEvent
        ev = NewsEvent(
            event_type=EventType.HACK,
            symbol="BTC/USDT",
            timestamp=1700000000.0,
            magnitude=0.1,
        )
        strategy.on_news_event(ev)
        assert strategy.event_count == 0

    def test_on_news_event_hack_negative_sentiment(self, strategy):
        from src.strategies.sentiment import EventType, NewsEvent
        ev = NewsEvent(
            event_type=EventType.HACK,
            symbol="BTC/USDT",
            timestamp=1700000000.0,
            magnitude=0.8,
        )
        strategy.on_news_event(ev)
        assert strategy.event_count == 1
        assert strategy.current_sentiment < 0

    def test_on_news_event_listing_positive_sentiment(self, strategy):
        from src.strategies.sentiment import EventType, NewsEvent
        ev = NewsEvent(
            event_type=EventType.LISTING,
            symbol="BTC/USDT",
            timestamp=1700000000.0,
            magnitude=0.8,
        )
        strategy.on_news_event(ev)
        assert strategy.event_count == 1
        assert strategy.current_sentiment > 0

    def test_analyze_no_candles(self, strategy):
        sig = strategy.analyze("BTC/USDT", [])
        assert sig.direction == SignalDirection.NEUTRAL
        assert "No data" in sig.reason

    def test_analyze_no_events_neutral(self, strategy, sample_candles):
        sig = strategy.analyze("BTC/USDT", sample_candles)
        assert sig.direction == SignalDirection.NEUTRAL

    def test_analyze_fade_extreme_positive(self, strategy, sample_candles):
        from src.strategies.sentiment import EventType, NewsEvent
        ev = NewsEvent(
            event_type=EventType.LISTING,
            symbol="BTC/USDT",
            timestamp=1700000000.0,
            magnitude=1.0,
        )
        strategy.on_news_event(ev)
        sig = strategy.analyze("BTC/USDT", sample_candles)
        assert sig.direction == SignalDirection.SHORT
        assert "Fade" in sig.reason

    def test_analyze_fade_extreme_negative(self, strategy, sample_candles):
        from src.strategies.sentiment import EventType, NewsEvent
        ev = NewsEvent(
            event_type=EventType.HACK,
            symbol="BTC/USDT",
            timestamp=1700000000.0,
            magnitude=1.0,
        )
        strategy.on_news_event(ev)
        sig = strategy.analyze("BTC/USDT", sample_candles)
        assert sig.direction == SignalDirection.LONG
        assert "Fade" in sig.reason

    def test_get_stats(self, strategy):
        from src.strategies.sentiment import EventType, NewsEvent
        ev = NewsEvent(
            event_type=EventType.LISTING,
            symbol="BTC/USDT",
            timestamp=1700000000.0,
            magnitude=0.8,
        )
        strategy.on_news_event(ev)
        stats = strategy.get_stats()
        assert stats["event_count"] == 1
        assert "current_sentiment" in stats
        assert "sentiment_by_symbol" in stats


# ─── strategies/statistical_arbitrage.py ───


class TestKalmanFilterHedge:
    def test_init_defaults(self):
        from src.strategies.statistical_arbitrage import KalmanFilterHedge
        kf = KalmanFilterHedge()
        assert kf.hedge_ratio == 1.0
        assert kf.intercept == 0.0
        assert kf._initialized is False

    def test_init_method(self):
        from src.strategies.statistical_arbitrage import KalmanFilterHedge
        kf = KalmanFilterHedge()
        kf.init(1.5, 0.2)
        assert kf.hedge_ratio == 1.5
        assert kf.intercept == 0.2
        assert kf._initialized is True

    def test_update_changes_ratio(self):
        from src.strategies.statistical_arbitrage import KalmanFilterHedge
        kf = KalmanFilterHedge()
        kf.init(1.0, 0.0)
        ratio1, _ = kf.update(101.0, 100.0)
        ratio2, _ = kf.update(102.0, 101.0)
        assert ratio1 != 1.0 or ratio2 != 1.0


class TestStatisticalArbitrage:
    @pytest.fixture
    def statarb(self):
        from src.strategies.statistical_arbitrage import PairConfig, StatisticalArbitrage
        return StatisticalArbitrage(PairConfig(lookback=50))

    def test_init(self, statarb):
        assert statarb.name == "statistical_arbitrage"
        assert statarb.is_cointegrated is False
        assert statarb.spread_mean == 0.0

    def test_check_cointegration_short_data(self, statarb):
        result = statarb.check_cointegration(
            np.array([1, 2, 3]), np.array([1, 2, 3])
        )
        assert result["cointegrated"] is False

    def test_check_cointegration_cointegrated_pair(self, statarb):
        np.random.seed(42)
        n = 200
        base = np.cumsum(np.random.normal(0, 1, n)) + 100
        prices_a = base + np.random.normal(0, 0.1, n)
        prices_b = 2.0 * base + np.random.normal(0, 0.1, n)
        result = statarb.check_cointegration(prices_a, prices_b)
        assert "cointegrated" in result
        assert "adf" in result
        assert "hedge_ratio" in result
        assert "half_life" in result

    def test_compute_spread(self, statarb):
        statarb.current_hedge_ratio = 2.0
        statarb.current_intercept = 1.0
        spread = statarb.compute_spread(105.0, 50.0)
        assert abs(spread - (105.0 - 2.0 * 50.0 - 1.0)) < 1e-10

    def test_z_score_no_history(self, statarb):
        assert statarb.z_score() == 0.0

    def test_analyze_insufficient_data(self, statarb):
        sig = statarb.analyze("BTC", "ETH", [], [])
        assert sig.direction == SignalDirection.NEUTRAL
        assert "Insufficient" in sig.reason

    def test_analyze_not_cointegrated(self, statarb):
        candles_a = [{"close": 100 + i, "high": 105 + i, "low": 95 + i, "open": 100 + i, "volume": 100, "timestamp": i} for i in range(50)]
        candles_b = [{"close": 200 - i, "high": 205 - i, "low": 195 - i, "open": 200 - i, "volume": 100, "timestamp": i} for i in range(50)]
        sig = statarb.analyze("BTC", "ETH", candles_a, candles_b)
        assert sig.direction == SignalDirection.NEUTRAL


class TestCorrelationMatrix:
    def test_init(self):
        from src.strategies.statistical_arbitrage import CorrelationMatrix
        cm = CorrelationMatrix(["BTC", "ETH", "SOL"])
        assert len(cm.symbols) == 3
        assert cm.matrix is None

    def test_update(self):
        from src.strategies.statistical_arbitrage import CorrelationMatrix
        cm = CorrelationMatrix(["BTC", "ETH"])
        cm.update("BTC", 50000.0)
        assert len(cm.price_history["BTC"]) == 1

    def test_compute_insufficient_data(self):
        from src.strategies.statistical_arbitrage import CorrelationMatrix
        cm = CorrelationMatrix(["BTC", "ETH"])
        assert cm.compute() is None

    def test_compute_valid(self):
        from src.strategies.statistical_arbitrage import CorrelationMatrix
        cm = CorrelationMatrix(["BTC", "ETH"])
        for i in range(20):
            cm.update("BTC", 50000 + i * 10)
            cm.update("ETH", 3000 + i * 1)
        mat = cm.compute()
        assert mat is not None
        assert mat.shape == (2, 2)
        assert mat[0, 0] == 1.0
        assert mat[1, 1] == 1.0

    def test_find_pairs(self):
        from src.strategies.statistical_arbitrage import CorrelationMatrix
        cm = CorrelationMatrix(["BTC", "ETH"])
        for i in range(20):
            cm.update("BTC", 50000 + i * 10)
            cm.update("ETH", 3000 + i * 1)
        cm.compute()
        pairs = cm.find_pairs(min_corr=0.5)
        assert len(pairs) >= 1
        assert pairs[0][0] == "BTC"
        assert pairs[0][1] == "ETH"

    def test_find_pairs_no_matrix(self):
        from src.strategies.statistical_arbitrage import CorrelationMatrix
        cm = CorrelationMatrix(["BTC", "ETH"])
        assert cm.find_pairs() == []


# ─── backtesting/order_book_replay.py ───


class TestReplayOrderBook:
    def test_empty_book_properties(self):
        from src.backtesting.order_book_replay import ReplayOrderBook
        ob = ReplayOrderBook(symbol="BTC/USDT", exchange="binance", timestamp=0)
        assert ob.mid_price == 0.0
        assert ob.spread == 0.0
        assert ob.spread_bps == 0.0
        assert ob.bid_volume == 0.0
        assert ob.ask_volume == 0.0
        assert ob.obi == 0.0

    def test_with_levels(self):
        from src.backtesting.order_book_replay import ReplayOrderBook, ReplayOrderBookLevel
        ob = ReplayOrderBook(
            symbol="BTC/USDT", exchange="binance", timestamp=0,
            bids=[ReplayOrderBookLevel(49999, 1.0), ReplayOrderBookLevel(49998, 0.5)],
            asks=[ReplayOrderBookLevel(50001, 0.8), ReplayOrderBookLevel(50002, 0.3)],
        )
        assert ob.mid_price == 50000.0
        assert ob.spread == 2.0
        assert ob.bid_volume == 1.5
        assert ob.ask_volume == 1.1
        assert ob.obi > 0

    def test_to_dict(self):
        from src.backtesting.order_book_replay import ReplayOrderBook, ReplayOrderBookLevel
        ob = ReplayOrderBook(
            symbol="BTC/USDT", exchange="binance", timestamp=123,
            bids=[ReplayOrderBookLevel(49999, 1.0)],
            asks=[ReplayOrderBookLevel(50001, 0.8)],
        )
        d = ob.to_dict()
        assert d["symbol"] == "BTC/USDT"
        assert d["mid_price"] == 50000.0
        assert len(d["bids"]) == 1
        assert len(d["asks"]) == 1


class TestOrderBookReplay:
    def test_init(self):
        from src.backtesting.order_book_replay import OrderBookReplay
        replay = OrderBookReplay(depth=10, seed=42)
        assert replay.depth == 10
        assert replay.base_spread_bps == 2.0

    def test_from_candle(self, sample_candle):
        from src.backtesting.order_book_replay import OrderBookReplay
        replay = OrderBookReplay(depth=20, seed=42)
        ob = replay.from_candle(sample_candle, "BTC/USDT", "binance")
        assert ob.symbol == "BTC/USDT"
        assert ob.exchange == "binance"
        assert len(ob.bids) == 20
        assert len(ob.asks) == 20
        assert ob.mid_price > 0
        assert ob.spread > 0
        assert ob.bid_volume > 0
        assert ob.ask_volume > 0

    def test_from_candle_deterministic(self, sample_candle):
        from src.backtesting.order_book_replay import OrderBookReplay
        r1 = OrderBookReplay(depth=10, seed=42)
        r2 = OrderBookReplay(depth=10, seed=42)
        ob1 = r1.from_candle(sample_candle)
        ob2 = r2.from_candle(sample_candle)
        assert ob1.bids[0].price == ob2.bids[0].price
        assert ob1.asks[0].price == ob2.asks[0].price

    def test_replay_series(self, sample_candles):
        from src.backtesting.order_book_replay import OrderBookReplay
        replay = OrderBookReplay(depth=10, seed=42)
        books = replay.replay_series(sample_candles[:10], "BTC/USDT", "binance")
        assert len(books) == 10
        for ob in books:
            assert len(ob.bids) == 10
            assert len(ob.asks) == 10

    def test_replay_with_imbalance_injection(self, sample_candles):
        from src.backtesting.order_book_replay import OrderBookReplay
        replay = OrderBookReplay(depth=10, seed=42)
        books = replay.replay_with_imbalance_injection(
            sample_candles[:40], "BTC/USDT", "binance",
            inject_interval=20, inject_strength=0.4,
        )
        assert len(books) == 40
        # At injection point (i=20), OBI should differ from normal
        assert books[20].obi != books[19].obi


class TestOrderBookBacktester:
    def test_init(self):
        from src.backtesting.order_book_replay import OrderBookBacktester, OrderBookReplay
        replay = OrderBookReplay(depth=10)
        bt = OrderBookBacktester(backtester=None, replay=replay)
        assert bt.order_books == []
        assert bt.replay is replay


# ─── backtesting/plotter.py ───


class TestBacktestPlotter:
    @pytest.fixture
    def plotter(self):
        from src.backtesting.plotter import BacktestPlotter
        return BacktestPlotter()

    @pytest.fixture
    def mock_result(self):
        from src.backtesting.backtester import BacktestResult
        from src.strategies.strategies import Signal, SignalDirection

        trades = []
        for i in range(5):
            trades.append(type("Trade", (), {
                "entry_bar": i, "exit_bar": i + 2,
                "entry_price": 50000, "exit_price": 50000 + (i - 2) * 100,
                "pnl": (i - 2) * 100, "direction": SignalDirection.LONG,
                "bars_held": 2,
            })())
        return BacktestResult(
            initial_balance=10000.0,
            final_balance=10500.0,
            total_return_pct=5.0,
            total_trades=5,
            winning_trades=3,
            losing_trades=2,
            win_rate=60.0,
            profit_factor=1.5,
            max_drawdown_pct=3.0,
            sharpe_ratio=1.2,
            sortino_ratio=1.5,
            calmar_ratio=2.0,
            recovery_factor=1.67,
            equity_curve=[10000, 10100, 10200, 10150, 10300, 10400, 10350, 10500],
            trades=trades,
        )

    def test_init(self, plotter):
        assert plotter.figsize == (12, 7)
        assert plotter.dpi == 100

    def test_plot_equity_curve(self, plotter, mock_result):
        import matplotlib
        matplotlib.use("Agg")
        fig = plotter.plot_equity_curve(mock_result, "Test Equity")
        assert fig is not None

    def test_plot_trade_pnl(self, plotter, mock_result):
        import matplotlib
        matplotlib.use("Agg")
        fig = plotter.plot_trade_pnl(mock_result, "Test PnL")
        assert fig is not None

    def test_plot_trade_pnl_no_trades(self, plotter):
        import matplotlib
        matplotlib.use("Agg")
        from src.backtesting.backtester import BacktestResult
        result = BacktestResult(
            initial_balance=10000.0, final_balance=10000.0,
            total_return_pct=0.0, total_trades=0, winning_trades=0,
            losing_trades=0, win_rate=0.0, profit_factor=0.0,
            max_drawdown_pct=0.0, sharpe_ratio=0.0, sortino_ratio=0.0,
            calmar_ratio=0.0, recovery_factor=0.0,
            equity_curve=[10000], trades=[],
        )
        fig = plotter.plot_trade_pnl(result)
        assert fig is not None

    def test_plot_comparison(self, plotter, mock_result):
        import matplotlib
        matplotlib.use("Agg")
        results = {"Strategy A": mock_result}
        fig = plotter.plot_comparison(results)
        assert fig is not None

    def test_plot_metrics_radar(self, plotter, mock_result):
        import matplotlib
        matplotlib.use("Agg")
        results = {"Strategy A": mock_result}
        fig = plotter.plot_metrics_radar(results)
        assert fig is not None

    def test_save_all(self, plotter, mock_result):
        import matplotlib
        matplotlib.use("Agg")
        with tempfile.TemporaryDirectory() as tmpdir:
            results = {"Strategy A": mock_result}
            plotter.save_all(results, tmpdir)
            files = os.listdir(tmpdir)
            assert len(files) > 0
            assert any(f.endswith(".png") for f in files)


# ─── backtesting/optimizer.py ───


class TestOptimizationResult:
    def test_creation(self):
        from src.backtesting.optimizer import OptimizationResult
        from src.backtesting.backtester import BacktestResult
        result = BacktestResult(
            initial_balance=10000.0, final_balance=10500.0,
            total_return_pct=5.0, total_trades=10, winning_trades=6,
            losing_trades=4, win_rate=60.0, profit_factor=1.5,
            max_drawdown_pct=3.0, sharpe_ratio=1.2, sortino_ratio=1.5,
            calmar_ratio=2.0, recovery_factor=1.67,
            equity_curve=[10000, 10500], trades=[],
        )
        opt = OptimizationResult(params={"ema_fast": 9}, result=result, fitness=10.5)
        assert opt.params == {"ema_fast": 9}
        assert opt.fitness == 10.5


class TestStrategyOptimizer:
    @pytest.fixture
    def optimizer(self):
        from src.backtesting.optimizer import StrategyOptimizer
        from src.backtesting.backtester import Backtester

        class MockBacktester:
            def run(self, candles, strategy, symbol, warmup=50):
                from src.backtesting.backtester import BacktestResult
                return BacktestResult(
                    initial_balance=10000.0, final_balance=10500.0,
                    total_return_pct=5.0, total_trades=10, winning_trades=6,
                    losing_trades=4, win_rate=60.0, profit_factor=1.5,
                    max_drawdown_pct=3.0, sharpe_ratio=1.2, sortino_ratio=1.5,
                    calmar_ratio=2.0, recovery_factor=1.67,
                    equity_curve=[10000, 10500], trades=[],
                )

        return StrategyOptimizer(MockBacktester())

    def test_init_default_fitness(self, optimizer):
        assert optimizer.fitness_fn is not None

    def test_default_fitness_no_trades(self):
        from src.backtesting.optimizer import StrategyOptimizer
        from src.backtesting.backtester import BacktestResult
        result = BacktestResult(
            initial_balance=10000.0, final_balance=10000.0,
            total_return_pct=0.0, total_trades=0, winning_trades=0,
            losing_trades=0, win_rate=0.0, profit_factor=0.0,
            max_drawdown_pct=0.0, sharpe_ratio=0.0, sortino_ratio=0.0,
            calmar_ratio=0.0, recovery_factor=0.0,
            equity_curve=[10000], trades=[],
        )
        assert StrategyOptimizer.default_fitness(result) == -999.0

    def test_default_fitness_with_trades(self):
        from src.backtesting.optimizer import StrategyOptimizer
        from src.backtesting.backtester import BacktestResult
        result = BacktestResult(
            initial_balance=10000.0, final_balance=10500.0,
            total_return_pct=5.0, total_trades=10, winning_trades=6,
            losing_trades=4, win_rate=60.0, profit_factor=1.5,
            max_drawdown_pct=3.0, sharpe_ratio=1.2, sortino_ratio=1.5,
            calmar_ratio=2.0, recovery_factor=1.67,
            equity_curve=[10000, 10500], trades=[],
        )
        fitness = StrategyOptimizer.default_fitness(result)
        assert fitness > 0

    def test_sharpe_fitness(self):
        from src.backtesting.optimizer import StrategyOptimizer
        from src.backtesting.backtester import BacktestResult
        result = BacktestResult(
            initial_balance=10000.0, final_balance=10500.0,
            total_return_pct=5.0, total_trades=10, winning_trades=6,
            losing_trades=4, win_rate=60.0, profit_factor=1.5,
            max_drawdown_pct=3.0, sharpe_ratio=1.2, sortino_ratio=1.5,
            calmar_ratio=2.0, recovery_factor=1.67,
            equity_curve=[10000, 10500], trades=[],
        )
        assert StrategyOptimizer.sharpe_fitness(result) == 1.2

    def test_sharpe_fitness_insufficient_trades(self):
        from src.backtesting.optimizer import StrategyOptimizer
        from src.backtesting.backtester import BacktestResult
        result = BacktestResult(
            initial_balance=10000.0, final_balance=10000.0,
            total_return_pct=0.0, total_trades=2, winning_trades=1,
            losing_trades=1, win_rate=50.0, profit_factor=1.0,
            max_drawdown_pct=0.0, sharpe_ratio=0.0, sortino_ratio=0.0,
            calmar_ratio=0.0, recovery_factor=0.0,
            equity_curve=[10000], trades=[],
        )
        assert StrategyOptimizer.sharpe_fitness(result) == -999.0

    def test_calmar_fitness(self):
        from src.backtesting.optimizer import StrategyOptimizer
        from src.backtesting.backtester import BacktestResult
        result = BacktestResult(
            initial_balance=10000.0, final_balance=10500.0,
            total_return_pct=5.0, total_trades=10, winning_trades=6,
            losing_trades=4, win_rate=60.0, profit_factor=1.5,
            max_drawdown_pct=3.0, sharpe_ratio=1.2, sortino_ratio=1.5,
            calmar_ratio=2.0, recovery_factor=1.67,
            equity_curve=[10000, 10500], trades=[],
        )
        assert StrategyOptimizer.calmar_fitness(result) == 2.0

    def test_calmar_fitness_no_drawdown(self):
        from src.backtesting.optimizer import StrategyOptimizer
        from src.backtesting.backtester import BacktestResult
        result = BacktestResult(
            initial_balance=10000.0, final_balance=10000.0,
            total_return_pct=0.0, total_trades=0, winning_trades=0,
            losing_trades=0, win_rate=0.0, profit_factor=0.0,
            max_drawdown_pct=0.0, sharpe_ratio=0.0, sortino_ratio=0.0,
            calmar_ratio=0.0, recovery_factor=0.0,
            equity_curve=[10000], trades=[],
        )
        assert StrategyOptimizer.calmar_fitness(result) == -999.0

    def test_profit_factor_fitness(self):
        from src.backtesting.optimizer import StrategyOptimizer
        from src.backtesting.backtester import BacktestResult
        result = BacktestResult(
            initial_balance=10000.0, final_balance=10500.0,
            total_return_pct=5.0, total_trades=10, winning_trades=6,
            losing_trades=4, win_rate=60.0, profit_factor=1.5,
            max_drawdown_pct=3.0, sharpe_ratio=1.2, sortino_ratio=1.5,
            calmar_ratio=2.0, recovery_factor=1.67,
            equity_curve=[10000, 10500], trades=[],
        )
        assert StrategyOptimizer.profit_factor_fitness(result) == 1.5

    def test_grid_search(self, optimizer, sample_candles):
        class FakeStrategy:
            def __init__(self, **kwargs):
                self.params = kwargs
            def analyze(self, symbol, candles):
                return Signal(
                    symbol=symbol, direction=SignalDirection.NEUTRAL,
                    confidence=0, strategy="fake", entry_price=0,
                    stop_loss=0, take_profit=0,
                )

        results = optimizer.grid_search(
            strategy_class=FakeStrategy,
            param_grid={"x": [1, 2, 3]},
            candles=sample_candles,
            symbol="BTC/USDT",
        )
        assert len(results) == 3
        assert results[0].fitness >= results[-1].fitness

    def test_grid_search_max_combinations(self, optimizer, sample_candles):
        class FakeStrategy:
            def __init__(self, **kwargs):
                pass
            def analyze(self, symbol, candles):
                return Signal(
                    symbol=symbol, direction=SignalDirection.NEUTRAL,
                    confidence=0, strategy="fake", entry_price=0,
                    stop_loss=0, take_profit=0,
                )

        results = optimizer.grid_search(
            strategy_class=FakeStrategy,
            param_grid={"x": list(range(5))},
            candles=sample_candles,
            max_combinations=3,
        )
        assert len(results) <= 3

    def test_best_params_empty(self, optimizer):
        assert optimizer.best_params([]) is None

    def test_best_params_with_results(self, optimizer, sample_candles):
        class FakeStrategy:
            def __init__(self, **kwargs):
                pass
            def analyze(self, symbol, candles):
                return Signal(
                    symbol=symbol, direction=SignalDirection.NEUTRAL,
                    confidence=0, strategy="fake", entry_price=0,
                    stop_loss=0, take_profit=0,
                )

        results = optimizer.grid_search(
            strategy_class=FakeStrategy,
            param_grid={"x": [1, 2]},
            candles=sample_candles,
        )
        best = optimizer.best_params(results)
        assert best is not None
        assert "x" in best

    def test_print_results(self, optimizer, sample_candles):
        class FakeStrategy:
            def __init__(self, **kwargs):
                pass
            def analyze(self, symbol, candles):
                return Signal(
                    symbol=symbol, direction=SignalDirection.NEUTRAL,
                    confidence=0, strategy="fake", entry_price=0,
                    stop_loss=0, take_profit=0,
                )

        results = optimizer.grid_search(
            strategy_class=FakeStrategy,
            param_grid={"x": [1, 2]},
            candles=sample_candles,
        )
        optimizer.print_results(results, top_n=2)

    def test_walk_forward(self, optimizer, sample_candles):
        class FakeStrategy:
            def __init__(self, **kwargs):
                pass
            def analyze(self, symbol, candles):
                return Signal(
                    symbol=symbol, direction=SignalDirection.NEUTRAL,
                    confidence=0, strategy="fake", entry_price=0,
                    stop_loss=0, take_profit=0,
                )

        results = optimizer.walk_forward(
            strategy_class=FakeStrategy,
            params={"x": 1},
            candles=sample_candles,
            train_size=20,
            test_size=10,
            warmup=5,
        )
        assert len(results) > 0
