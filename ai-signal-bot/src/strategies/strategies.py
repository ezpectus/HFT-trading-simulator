"""Strategy implementations — re-export shim.

Classes live in their own modules:
  trend_following.py — TrendFollowingStrategy
  mean_reversion.py  — MeanReversionStrategy
  ensemble.py        — EnsembleVoter
  fft_cycle.py       — FFTCycleStrategy

Signal/SignalDirection live in signal.py — re-exported here for backward
compatibility.
"""

from src.strategies.ensemble import EnsembleVoter
from src.strategies.fft_cycle import FFTCycleStrategy
from src.strategies.mean_reversion import MeanReversionStrategy
from src.strategies.signal import Signal, SignalDirection
from src.strategies.trend_following import TrendFollowingStrategy

__all__ = [
    "EnsembleVoter",
    "FFTCycleStrategy",
    "MeanReversionStrategy",
    "Signal",
    "SignalDirection",
    "TrendFollowingStrategy",
]
