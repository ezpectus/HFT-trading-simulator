"""Shared fixtures for unit tests."""
import pytest


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
