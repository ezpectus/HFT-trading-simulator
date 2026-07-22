"""Entry point for `python -m exchange_simulator`."""
import os
import sys

# Ensure parent directory is on sys.path
_parent = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _parent not in sys.path:
    sys.path.insert(0, _parent)

# Run the root-level __main__.py
from runpy import run_path  # noqa: E402

_main_path = os.path.join(_parent, "__main__.py")
run_path(_main_path, run_name="__main__")
