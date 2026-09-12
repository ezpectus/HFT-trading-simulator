"""Real exchange market data — re-export shim.

Normalized* types live in market_data_types.py, the feed in
market_data_feed.py, the pull-based manager in market_data_manager.py.
"""

from src.data_collection.market_data_feed import RealMarketDataFeed
from src.data_collection.market_data_manager import RealMarketDataManager
from src.data_collection.market_data_types import (
    NormalizedCandle,
    NormalizedOrderBook,
    NormalizedTicker,
)

__all__ = [
    "NormalizedCandle",
    "NormalizedOrderBook",
    "NormalizedTicker",
    "RealMarketDataFeed",
    "RealMarketDataManager",
]
