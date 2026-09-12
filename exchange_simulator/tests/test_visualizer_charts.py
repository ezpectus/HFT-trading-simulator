"""Tests for ChartMixin indicator helpers — EMA series, MACD decomposition."""
from exchange_simulator.visualizer_charts import ChartMixin


class TestEmaSeries:
    def test_short_input_zeros(self):
        assert ChartMixin._ema_series([1.0, 2.0], 5) == [0, 0]

    def test_seeded_with_sma(self):
        values = [float(i) for i in range(10)]
        out = ChartMixin._ema_series(values, 5)
        # First EMA value = SMA of first `period` values
        assert out[4] == sum(values[:5]) / 5
        # Earlier slots are zero-padded
        assert out[:4] == [0.0] * 4

    def test_constant_series_stays_constant(self):
        out = ChartMixin._ema_series([7.0] * 20, 5)
        assert all(v == 7.0 for v in out[4:])


class TestMacdCalc:
    def test_insufficient_data_returns_zeros(self):
        mixin = ChartMixin()
        assert mixin._macd_calc([1.0] * 30) == (0, 0, 0)

    def test_uptrend_positive_macd(self):
        mixin = ChartMixin()
        values = [100.0 + i for i in range(60)]
        macd, _sig, _hist = mixin._macd_calc(values)
        assert macd > 0  # fast EMA above slow EMA on a steady ramp

    def test_downtrend_negative_macd(self):
        mixin = ChartMixin()
        values = [200.0 - i for i in range(60)]
        macd, _sig, _hist = mixin._macd_calc(values)
        assert macd < 0
