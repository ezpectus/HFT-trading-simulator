"""Exchange Simulator package — re-exports root-level modules.

The source files (models.py, market_simulator.py, etc.) live at the package
root. This __init__.py sets up sys.path so that `from exchange_simulator.models
import ...` works correctly by registering root-level modules as submodules.
"""
import importlib
import os
import sys

# Ensure the parent directory (exchange-simulator/) is on sys.path
# so root-level modules (models.py, exchange.py, etc.) are importable.
_parent = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _parent not in sys.path:
    sys.path.insert(0, _parent)

# Also add this directory itself so nested modules (arbitrage.py, etc.) are importable.
_self_dir = os.path.dirname(os.path.abspath(__file__))
if _self_dir not in sys.path:
    sys.path.insert(0, _self_dir)

# Modules to register as submodules of exchange_simulator.
# Some live at the package root (models.py, exchange.py, etc.) and others
# in this subdirectory (arbitrage.py, config_validator.py, etc.).
_module_names = [
    "models",
    "market_simulator",
    "exchange",
    "arbitrage",
    "config_validator",
    "data_export",
    "websocket_server",
    "visualizer",
    "spread_analytics",
    "order_book_realism",
    "market_microstructure",
    "liquidation_engine_v2",
    "latency_simulation",
    "funding_rate",
    "options_simulator",
]

for _name in _module_names:
    _full_name = __name__ + "." + _name
    if _full_name not in sys.modules:
        try:
            _mod = importlib.import_module(_name)
            sys.modules[_full_name] = _mod
        except ImportError as _e:
            import logging
            logging.getLogger("exchange_simulator").debug(
                "Could not register %s as submodule: %s", _full_name, _e
            )

__version__ = "1.0.0"
