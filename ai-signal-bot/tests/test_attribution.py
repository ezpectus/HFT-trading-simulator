"""Tests for research attribution."""
import pytest
from src.research.attribution import PerformanceAttribution


class TestPerformanceAttribution:
    def test_creation(self):
        attr = PerformanceAttribution()
        assert attr is not None
