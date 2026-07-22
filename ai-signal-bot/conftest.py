import os
import sys

# Add bot root to sys.path so `from src.` imports work
_bot_root = os.path.dirname(os.path.abspath(__file__))
if _bot_root not in sys.path:
    sys.path.insert(0, _bot_root)

# Add project root to sys.path so the outer exchange_simulator/ package is
# importable. Its __init__.py registers nested modules automatically.
_proj_root = os.path.dirname(_bot_root)
if _proj_root not in sys.path:
    sys.path.insert(0, _proj_root)
