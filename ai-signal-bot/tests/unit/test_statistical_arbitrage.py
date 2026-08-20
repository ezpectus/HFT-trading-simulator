"""Unit tests for strategies/statistical_arbitrage.py.

Covers: KalmanFilterHedge, PairConfig, StatisticalArbitrage, CorrelationMatrix.
"""
import numpy as np
import pytest

from src.strategies.strategies import SignalDirection


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
