"""Exchange Simulator — Simulated crypto exchange with realistic price generation.

Generates OHLCV candles using Geometric Brownian Motion with per-symbol
volatility and drift. Simulates 3 exchanges (Binance, Bybit, OKX) with
different fee structures and slippage models.

No real exchange API is used — this is a fully self-contained simulation
designed for paper trading and strategy testing.
"""
# Import nested package to trigger submodule registration (arbitrage, config_validator, etc.)
# The nested __init__.py registers modules via importlib into sys.modules.
try:
    from . import exchange_simulator as _nested  # noqa: F401
except ImportError:
    pass

__version__ = "1.0.0"
