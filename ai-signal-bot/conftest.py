import os
import sys

# Add bot root to sys.path so `from src.` imports work
_bot_root = os.path.dirname(os.path.abspath(__file__))
if _bot_root not in sys.path:
    sys.path.insert(0, _bot_root)

# Add exchange_simulator paths so tests can import exchange_simulator.models etc.
# Order matters: _proj_root must be at sys.path[0] so the outer exchange_simulator/
# package is found first (it registers models, exchange, etc.). The nested
# exchange_simulator/exchange_simulator/ would shadow it otherwise.
_proj_root = os.path.dirname(_bot_root)
_exsim_root = os.path.join(_proj_root, "exchange_simulator")
for _p in (_exsim_root, _proj_root):
    if os.path.isdir(_p) and _p not in sys.path:
        sys.path.insert(0, _p)
