import sys
import os

# Add bot root to sys.path so `from src.` imports work
_bot_root = os.path.dirname(os.path.abspath(__file__))
if _bot_root not in sys.path:
    sys.path.insert(0, _bot_root)
