"""Tests for Greeks hedging module."""
import pytest
from src.research.greeks_hedging import GreeksCalculator


class TestGreeksHedging:
    def test_creation(self):
        calc = GreeksCalculator()
        assert calc is not None
