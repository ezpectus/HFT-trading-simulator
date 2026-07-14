"""DEPRECATED: Root shim package — will be deleted in future cleanup.

The real package is at exchange-simulator/exchange_simulator/.
This shim only exists for backwards compatibility when running from project root.

To properly fix: rename exchange-simulator/ to exchange_simulator/ and delete this directory.
"""
import os
import sys

# Add exchange-simulator/ to sys.path so the nested exchange_simulator package is found
_real_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "exchange-simulator")
if _real_dir not in sys.path:
    sys.path.insert(0, _real_dir)

# Re-export version from the real package
try:
    import importlib.util
    _spec = importlib.util.spec_from_file_location(
        "_es_real", os.path.join(_real_dir, "exchange_simulator", "__init__.py"),
    )
    _real = importlib.util.module_from_spec(_spec)
    _spec.loader.exec_module(_real)
    __version__ = getattr(_real, "__version__", "1.0.0")
except Exception:
    __version__ = "1.0.0"
