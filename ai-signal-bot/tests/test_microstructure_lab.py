"""Tests for microstructure lab."""
import pytest
from src.research.microstructure_lab import MicrostructureLab


class TestMicrostructureLab:
    def test_creation(self):
        lab = MicrostructureLab()
        assert lab is not None
