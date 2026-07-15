import sys
import os

# Add simulator root and project root to sys.path
_sim_root = os.path.dirname(os.path.abspath(__file__))
_proj_root = os.path.dirname(_sim_root)
for _p in (_sim_root, _proj_root):
    if _p not in sys.path:
        sys.path.insert(0, _p)
