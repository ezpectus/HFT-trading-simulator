"""Normalized market data types — shared feed/manager contracts."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class NormalizedTicker:
    """Normalized ticker data across all exchanges."""
    exchange: str
    symbol: str
    bid: float
    ask: float
    last: float
    volume: float
    timestamp: int  # ms


@dataclass
class NormalizedCandle:
    """Normalized candle/OHLCV data."""
    exchange: str
    symbol: str
    interval: str
    open: float
    high: float
    low: float
    close: float
    volume: float
    time: int  # ms


@dataclass
class NormalizedOrderBook:
    """Normalized L2 order book snapshot."""
    exchange: str
    symbol: str
    bids: list[tuple[float, float]]  # [(price, qty), ...]
    asks: list[tuple[float, float]]
    timestamp: int
