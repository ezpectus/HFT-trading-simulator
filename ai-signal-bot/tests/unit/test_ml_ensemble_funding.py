"""Tests for strategies/ml_ensemble.py and strategies/funding_arb_detector.py."""
import numpy as np
import pytest

from src.strategies.funding_arb_detector import (
    ArbitrageOpportunity,
    ArbType,
    FundingRate,
    FundingRateArbitrageDetector,
)
from src.strategies.ml_ensemble import (
    FeatureEngineer,
    HMMRegimeDetector,
    MLConfig,
    MLEnsembleStrategy,
)
from src.strategies.strategies import Signal, SignalDirection

# ─── Fixtures ───


@pytest.fixture
def candles():
    np.random.seed(42)
    n = 250
    prices = np.cumsum(np.random.randn(n) * 0.5) + 100
    return [
        {
            "open": float(p),
            "high": float(p + abs(np.random.randn()) * 0.3),
            "low": float(p - abs(np.random.randn()) * 0.3),
            "close": float(p),
            "volume": float(abs(np.random.randn()) * 1000 + 500),
        }
        for p in prices
    ]


# ─── MLConfig ───


class TestMLConfig:
    def test_defaults(self):
        cfg = MLConfig()
        assert cfg.lookback == 200
        assert cfg.feature_window == 20
        assert cfg.confidence_threshold == 60.0
        assert cfg.n_hmm_states == 3

    def test_custom(self):
        cfg = MLConfig(lookback=100, feature_window=10)
        assert cfg.lookback == 100
        assert cfg.feature_window == 10


# ─── FeatureEngineer ───


class TestFeatureEngineer:
    def test_extract_features_short_data(self):
        candles = [{"close": 100, "high": 101, "low": 99, "volume": 10}] * 5
        features = FeatureEngineer.extract_features(candles, window=20)
        assert features.shape == (0, 0)

    def test_extract_features(self, candles):
        features = FeatureEngineer.extract_features(candles, window=20)
        assert features.ndim == 2
        assert features.shape[0] > 0
        assert features.shape[1] == 50

    def test_extract_features_custom_window(self, candles):
        features = FeatureEngineer.extract_features(candles, window=10)
        assert features.shape[0] > 0
        assert features.shape[1] == 50

    def test_ema(self):
        data = np.array([1, 2, 3, 4, 5], dtype=float)
        ema = FeatureEngineer._ema(data, 3)
        assert isinstance(ema, float)
        assert ema > 0

    def test_ema_short_data(self):
        data = np.array([1.0])
        ema = FeatureEngineer._ema(data, 5)
        assert ema == 1.0

    def test_rsi(self):
        closes = np.arange(20, dtype=float)
        rsi = FeatureEngineer._rsi(closes, 14)
        assert 0 <= rsi <= 100

    def test_rsi_short_data(self):
        closes = np.array([100.0, 101.0])
        rsi = FeatureEngineer._rsi(closes, 14)
        assert rsi == 50.0

    def test_rsi_all_gains(self):
        closes = np.arange(20, dtype=float)
        rsi = FeatureEngineer._rsi(closes, 14)
        assert rsi == 100.0

    def test_atr(self):
        highs = np.array([105, 106, 107], dtype=float)
        lows = np.array([100, 101, 102], dtype=float)
        closes = np.array([103, 104, 105], dtype=float)
        atr = FeatureEngineer._atr(highs, lows, closes, 2)
        assert atr > 0

    def test_bollinger_pos(self):
        closes = np.arange(30, dtype=float)
        pos = FeatureEngineer._bollinger_pos(closes, 20)
        assert isinstance(pos, float)

    def test_momentum(self):
        closes = np.array([100, 105, 110], dtype=float)
        mom = FeatureEngineer._momentum(closes, 2)
        assert mom == 10.0

    def test_roc(self):
        closes = np.array([100, 110], dtype=float)
        roc = FeatureEngineer._roc(closes, 1)
        assert roc == pytest.approx(10.0)

    def test_williams_r(self):
        highs = np.array([105, 106, 107], dtype=float)
        lows = np.array([100, 101, 102], dtype=float)
        wr = FeatureEngineer._williams_r(highs, lows, 103, 3)
        assert -100 <= wr <= 0

    def test_cci(self):
        highs = np.array([105, 106, 107], dtype=float)
        lows = np.array([100, 101, 102], dtype=float)
        closes = np.array([103, 104, 105], dtype=float)
        cci = FeatureEngineer._cci(highs, lows, closes, 3)
        assert isinstance(cci, float)

    def test_mfi(self):
        highs = np.array([105] * 20, dtype=float)
        lows = np.array([100] * 20, dtype=float)
        closes = np.arange(20, dtype=float) + 100
        volumes = np.ones(20, dtype=float) * 100
        mfi = FeatureEngineer._mfi(highs, lows, closes, volumes, 14)
        assert 0 <= mfi <= 100


# ─── HMMRegimeDetector ───


class TestHMMRegimeDetector:
    def test_init(self):
        hmm = HMMRegimeDetector(n_states=3)
        assert hmm.n_states == 3
        assert hmm.current_state == 0
        assert hmm._fitted is False

    def test_update_before_fit(self):
        hmm = HMMRegimeDetector(n_states=3)
        state = hmm.update(0.01)
        assert state == 0

    def test_fit_after_enough_data(self):
        hmm = HMMRegimeDetector(n_states=3)
        np.random.seed(42)
        for _ in range(150):
            hmm.update(np.random.randn() * 0.01)
        assert hmm._fitted is True

    def test_get_regime(self):
        hmm = HMMRegimeDetector(n_states=3)
        assert hmm.get_regime() == "calm"

    def test_get_regime_after_fit(self):
        hmm = HMMRegimeDetector(n_states=3)
        np.random.seed(42)
        for _ in range(150):
            hmm.update(np.random.randn() * 0.02)
        regime = hmm.get_regime()
        assert regime in ("calm", "trending", "volatile")


# ─── MLEnsembleStrategy ───


class TestMLEnsembleStrategy:
    def test_init(self):
        strategy = MLEnsembleStrategy()
        assert strategy.name == "ml_ensemble"
        assert strategy.is_trained is False

    def test_init_with_config(self):
        cfg = MLConfig(lookback=100)
        strategy = MLEnsembleStrategy(cfg)
        assert strategy.config.lookback == 100

    def test_analyze_untrained(self):
        strategy = MLEnsembleStrategy()
        candles = [{"close": 100, "high": 101, "low": 99, "volume": 10}] * 50
        signal = strategy.analyze("BTC/USDT", candles)
        assert signal.direction == SignalDirection.NEUTRAL
        assert "not trained" in signal.reason.lower()

    def test_train_insufficient_data(self):
        strategy = MLEnsembleStrategy()
        candles = [{"close": 100, "high": 101, "low": 99, "volume": 10}] * 50
        result = strategy.train(candles)
        assert result["trained"] is False

    def test_get_feature_importance_empty(self):
        strategy = MLEnsembleStrategy()
        assert strategy.get_feature_importance() == {}


# ─── FundingRate ───


class TestFundingRate:
    def test_creation(self):
        fr = FundingRate(
            exchange="binance",
            symbol="BTC/USDT",
            rate=0.0005,
            next_funding_time=1700000000,
        )
        assert fr.exchange == "binance"
        assert fr.rate == 0.0005
        assert fr.timestamp > 0

    def test_annualized(self):
        fr = FundingRate("binance", "BTC/USDT", 0.0001, 1700000000)
        assert fr.annualized == pytest.approx(0.0001 * 3 * 365)

    def test_daily(self):
        fr = FundingRate("binance", "BTC/USDT", 0.0001, 1700000000)
        assert fr.daily == pytest.approx(0.0003)


# ─── ArbitrageOpportunity ───


class TestArbitrageOpportunity:
    def test_creation(self):
        opp = ArbitrageOpportunity(
            type=ArbType.SPOT_PERP,
            symbol="BTC/USDT",
            exchanges=["binance"],
            funding_rate=0.0005,
            expected_daily_return=0.0015,
            cost_estimate=0.001,
            net_expected_return=0.0005,
            confidence=75.0,
        )
        assert opp.type == ArbType.SPOT_PERP
        assert opp.confidence == 75.0
        assert opp.timestamp > 0


# ─── FundingRateArbitrageDetector ───


class TestFundingRateArbitrageDetector:
    def test_init(self):
        detector = FundingRateArbitrageDetector()
        assert detector.min_funding_rate == 0.0003
        assert detector.max_spread == 0.001

    def test_init_custom(self):
        detector = FundingRateArbitrageDetector(
            min_funding_rate=0.0005,
            max_spread=0.002,
            min_confidence=70,
            cost_per_trade=0.001,
        )
        assert detector.min_funding_rate == 0.0005

    def test_update_funding_rate(self):
        detector = FundingRateArbitrageDetector()
        detector.update_funding_rate("binance", "BTC/USDT", 0.0005, 1700000000)
        assert "binance" in detector._funding_rates
        assert "BTC/USDT" in detector._funding_rates["binance"]

    def test_update_spot_price(self):
        detector = FundingRateArbitrageDetector()
        detector.update_spot_price("binance", "BTC/USDT", 50000)
        assert detector._spot_prices["binance"]["BTC/USDT"] == 50000

    def test_update_perp_price(self):
        detector = FundingRateArbitrageDetector()
        detector.update_perp_price("binance", "BTC/USDT", 50100)
        assert detector._perp_prices["binance"]["BTC/USDT"] == 50100

    def test_detect_empty(self):
        detector = FundingRateArbitrageDetector()
        opps = detector.detect()
        assert len(opps) == 0

    def test_detect_spot_perp(self):
        detector = FundingRateArbitrageDetector()
        detector.update_funding_rate("binance", "BTC/USDT", 0.0005, 1700000000)
        detector.update_spot_price("binance", "BTC/USDT", 50000)
        detector.update_perp_price("binance", "BTC/USDT", 50050)
        opps = detector.detect()
        spot_perp = [o for o in opps if o.type == ArbType.SPOT_PERP]
        assert len(spot_perp) >= 1
        assert spot_perp[0].funding_rate == 0.0005

    def test_detect_spot_perp_high_spread(self):
        detector = FundingRateArbitrageDetector()
        detector.update_funding_rate("binance", "BTC/USDT", 0.0005, 1700000000)
        detector.update_spot_price("binance", "BTC/USDT", 50000)
        detector.update_perp_price("binance", "BTC/USDT", 51000)
        opps = detector.detect()
        spot_perp = [o for o in opps if o.type == ArbType.SPOT_PERP]
        assert len(spot_perp) == 0

    def test_detect_cross_exchange(self):
        detector = FundingRateArbitrageDetector()
        detector.update_funding_rate("binance", "BTC/USDT", 0.0008, 1700000000)
        detector.update_funding_rate("okx", "BTC/USDT", 0.0001, 1700000000)
        opps = detector.detect()
        cross = [o for o in opps if o.type == ArbType.CROSS_EXCHANGE]
        assert len(cross) >= 1
        assert "binance" in cross[0].exchanges
        assert "okx" in cross[0].exchanges

    def test_detect_low_funding_filtered(self):
        detector = FundingRateArbitrageDetector()
        detector.update_funding_rate("binance", "BTC/USDT", 0.0001, 1700000000)
        detector.update_spot_price("binance", "BTC/USDT", 50000)
        detector.update_perp_price("binance", "BTC/USDT", 50010)
        opps = detector.detect()
        assert len(opps) == 0

    def test_active_opportunities_tracking(self):
        detector = FundingRateArbitrageDetector()
        detector.update_funding_rate("binance", "BTC/USDT", 0.0005, 1700000000)
        detector.update_spot_price("binance", "BTC/USDT", 50000)
        detector.update_perp_price("binance", "BTC/USDT", 50050)
        detector.detect()
        assert len(detector._active_opportunities) >= 1

    def test_active_opportunities_stale_removal(self):
        detector = FundingRateArbitrageDetector()
        detector.update_funding_rate("binance", "BTC/USDT", 0.0005, 1700000000)
        detector.update_spot_price("binance", "BTC/USDT", 50000)
        detector.update_perp_price("binance", "BTC/USDT", 50050)
        detector.detect()
        assert len(detector._active_opportunities) >= 1
        detector._funding_rates["binance"]["BTC/USDT"].rate = 0.00001
        detector.detect()
        assert len(detector._active_opportunities) == 0
