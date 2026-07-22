"""Exchange Simulator — Simulated crypto exchange with realistic price generation.

Generates OHLCV candles using Geometric Brownian Motion with per-symbol
volatility and drift. Simulates 3 exchanges (Binance, Bybit, OKX) with
different fee structures and slippage models.

No real exchange API is used — this is a fully self-contained simulation
designed for paper trading and strategy testing.
"""
import importlib
import logging
import os
import sys

_logger = logging.getLogger("exchange_simulator")

# Ensure this directory is on sys.path so root-level modules are importable by short name.
_this_dir = os.path.dirname(os.path.abspath(__file__))
if _this_dir not in sys.path:
    sys.path.insert(0, _this_dir)

# Nested subdirectory containing additional modules.
_nested_dir = os.path.join(_this_dir, "exchange_simulator")
if _nested_dir not in sys.path:
    sys.path.insert(0, _nested_dir)

# Root-level modules (live in this directory).
_root_modules = [
    "models",
    "market_simulator",
    "exchange",
    "websocket_server",
    "visualizer",
]

# Nested modules (live in exchange_simulator/exchange_simulator/).
_nested_modules = [
    "arbitrage",
    "config_validator",
    "data_export",
    "spread_analytics",
    "order_book_realism",
    "market_microstructure",
    "liquidation_engine_v2",
    "latency_simulation",
    "funding_rate",
    "options_simulator",
]

for _name in _root_modules + _nested_modules:
    _full = __name__ + "." + _name
    if _full not in sys.modules:
        try:
            _mod = importlib.import_module(_name)
            sys.modules[_full] = _mod
        except ImportError as _e:
            _logger.debug("Could not register %s: %s", _full, _e)

__version__ = "1.0.0"
