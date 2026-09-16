"""Tests for run_backtest.py helpers ( — fit/validation split)."""
import pytest

from run_backtest import split_fit_validation


class TestSplitFitValidation:
    def test_chronological_disjoint_split(self):
        candles = [{"close": i} for i in range(100)]
        fit, oos = split_fit_validation(candles)
        assert fit == candles[:60]
        assert oos == candles[60:]
        assert not set(map(id, fit)) & set(map(id, oos))

    def test_default_fraction_is_60_40(self):
        fit, oos = split_fit_validation([{}] * 500)
        assert len(fit) == 300
        assert len(oos) == 200

    def test_custom_fraction(self):
        fit, oos = split_fit_validation([{}] * 100, fit_fraction=0.8)
        assert len(fit) == 80
        assert len(oos) == 20

    def test_oos_tail_is_newer_data(self):
        candles = [{"ts": i} for i in range(50)]
        fit, oos = split_fit_validation(candles)
        assert fit[-1]["ts"] < oos[0]["ts"]

    def test_empty_input(self):
        fit, oos = split_fit_validation([])
        assert fit == [] and oos == []
