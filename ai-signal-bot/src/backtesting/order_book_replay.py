"""Order book replay for backtesting — synthetic order book generation from candles.

Reconstructs realistic order book snapshots from historical OHLCV candle data
using volatility-based spread estimation and volume-weighted level distribution.
This enables backtesting strategies that rely on order book features (OBI, VWAP,
pressure) without requiring stored L2 tick data.

Usage:
    from src.backtesting.order_book_replay import OrderBookReplay

    replay = OrderBookReplay(depth=20, seed=42)
    ob = replay.from_candle(candle, symbol="BTC/USDT", exchange="binance")
    # ob.bids, ob.asks, ob.mid_price, ob.spread_bps, ob.obi
"""
import logging
import math
import random
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger("ai_signal_bot.order_book_replay")


@dataclass
class ReplayOrderBookLevel:
    """Single level in a replayed order book."""
    price: float
    quantity: float


@dataclass
class ReplayOrderBook:
    """Reconstructed order book snapshot."""
    symbol: str
    exchange: str
    timestamp: int
    bids: list[ReplayOrderBookLevel] = field(default_factory=list)
    asks: list[ReplayOrderBookLevel] = field(default_factory=list)

    @property
    def mid_price(self) -> float:
        if not self.bids or not self.asks:
            return 0.0
        return (self.bids[0].price + self.asks[0].price) / 2

    @property
    def spread(self) -> float:
        if not self.bids or not self.asks:
            return 0.0
        return self.asks[0].price - self.bids[0].price

    @property
    def spread_bps(self) -> float:
        mid = self.mid_price
        if mid == 0:
            return 0.0
        return self.spread / mid * 10000

    @property
    def bid_volume(self) -> float:
        return sum(l.quantity for l in self.bids)

    @property
    def ask_volume(self) -> float:
        return sum(l.quantity for l in self.asks)

    @property
    def obi(self) -> float:
        """Order Book Imbalance: (bid_vol - ask_vol) / (bid_vol + ask_vol)."""
        total = self.bid_volume + self.ask_volume
        if total == 0:
            return 0.0
        return (self.bid_volume - self.ask_volume) / total

    @property
    def vwap_bid(self) -> float:
        if not self.bid_volume:
            return 0.0
        return sum(l.price * l.quantity for l in self.bids) / self.bid_volume

    @property
    def vwap_ask(self) -> float:
        if not self.ask_volume:
            return 0.0
        return sum(l.price * l.quantity for l in self.asks) / self.ask_volume

    def to_dict(self) -> dict:
        return {
            "symbol": self.symbol,
            "exchange": self.exchange,
            "timestamp": self.timestamp,
            "mid_price": self.mid_price,
            "spread_bps": self.spread_bps,
            "obi": self.obi,
            "bid_volume": self.bid_volume,
            "ask_volume": self.ask_volume,
            "bids": [{"price": l.price, "quantity": l.quantity} for l in self.bids],
            "asks": [{"price": l.price, "quantity": l.quantity} for l in self.asks],
        }


class OrderBookReplay:
    """Generate synthetic order book snapshots from candle data.

    Uses candle high/low/close/volume to estimate:
    - Spread: based on candle range relative to close
    - Depth: volume-weighted distribution across levels
    - Imbalance: derived from candle body direction (bullish → more bids)
    """

    def __init__(
        self,
        depth: int = 20,
        seed: Optional[int] = 42,
        base_spread_bps: float = 2.0,
        volume_decay: float = 0.92,
    ):
        self.depth = depth
        self.rng = random.Random(seed)
        self.base_spread_bps = base_spread_bps
        self.volume_decay = volume_decay

    def from_candle(
        self,
        candle: dict,
        symbol: str = "BTC/USDT",
        exchange: str = "backtest",
    ) -> ReplayOrderBook:
        """Generate an order book snapshot from a single candle.

        Args:
            candle: Dict with open, high, low, close, volume, timestamp
            symbol: Trading symbol
            exchange: Exchange identifier

        Returns:
            ReplayOrderBook with bid/ask levels
        """
        close = candle["close"]
        high = candle["high"]
        low = candle["low"]
        volume = candle.get("volume", 100.0)
        ts = candle.get("timestamp", 0)

        # Estimate volatility from candle range
        candle_range = high - low
        range_pct = candle_range / close if close > 0 else 0.01

        # Spread: base + proportional to candle range
        spread_bps = self.base_spread_bps + range_pct * 5000  # scale range to bps
        spread_bps = max(1.0, min(50.0, spread_bps))
        half_spread = close * spread_bps / 10000

        # Imbalance: bullish candle (close > open) → more bid volume
        open_p = candle.get("open", close)
        body = close - open_p
        body_pct = body / close if close > 0 else 0
        # Map body_pct to imbalance shift [-0.3, 0.3]
        imbalance_shift = max(-0.3, min(0.3, body_pct * 20))

        # Base quantity per level
        base_qty = volume / self.depth if volume > 0 else 10.0

        bids: list[ReplayOrderBookLevel] = []
        asks: list[ReplayOrderBookLevel] = []

        for i in range(self.depth):
            # Price levels with increasing distance
            bid_price = close - half_spread * (1 + i * (1 + self.rng.random() * 0.3))
            ask_price = close + half_spread * (1 + i * (1 + self.rng.random() * 0.3))

            # Volume decays with depth, with random noise
            decay = self.volume_decay ** i
            bid_qty = base_qty * decay * (0.5 + self.rng.random()) * (1 + imbalance_shift)
            ask_qty = base_qty * decay * (0.5 + self.rng.random()) * (1 - imbalance_shift)

            # Ensure positive quantities
            bid_qty = max(0.001, bid_qty)
            ask_qty = max(0.001, ask_qty)

            bids.append(ReplayOrderBookLevel(
                price=round(bid_price, 2),
                quantity=round(bid_qty, 4),
            ))
            asks.append(ReplayOrderBookLevel(
                price=round(ask_price, 2),
                quantity=round(ask_qty, 4),
            ))

        return ReplayOrderBook(
            symbol=symbol,
            exchange=exchange,
            timestamp=ts,
            bids=bids,
            asks=asks,
        )

    def replay_series(
        self,
        candles: list[dict],
        symbol: str = "BTC/USDT",
        exchange: str = "backtest",
    ) -> list[ReplayOrderBook]:
        """Generate order book snapshots for an entire candle series.

        Args:
            candles: List of candle dicts
            symbol: Trading symbol
            exchange: Exchange identifier

        Returns:
            List of ReplayOrderBook, one per candle
        """
        return [self.from_candle(c, symbol, exchange) for c in candles]

    def replay_with_imbalance_injection(
        self,
        candles: list[dict],
        symbol: str = "BTC/USDT",
        exchange: str = "backtest",
        inject_interval: int = 20,
        inject_strength: float = 0.4,
    ) -> list[ReplayOrderBook]:
        """Generate order books with periodic imbalance injections.

        Simulates institutional order flow that creates temporary
        order book imbalances, useful for testing OBI-based strategies.

        Args:
            candles: List of candle dicts
            symbol: Trading symbol
            exchange: Exchange identifier
            inject_interval: Every N candles, inject an imbalance
            inject_strength: Strength of injection [0, 1]

        Returns:
            List of ReplayOrderBook with periodic imbalance shocks
        """
        books = []
        for i, candle in enumerate(candles):
            ob = self.from_candle(candle, symbol, exchange)

            # Inject imbalance every N candles
            if i > 0 and i % inject_interval == 0:
                direction = 1 if self.rng.random() > 0.5 else -1
                for level in ob.bids:
                    level.quantity *= (1 + inject_strength * direction)
                for level in ob.asks:
                    level.quantity *= (1 - inject_strength * direction)

            books.append(ob)

        return books


class OrderBookBacktester:
    """Backtester with order book replay support.

    Extends the standard backtester by providing order book snapshots
    to strategies that can use them (OBI, VWAP, pressure analysis).
    """

    def __init__(
        self,
        backtester,
        replay: Optional[OrderBookReplay] = None,
    ):
        self.backtester = backtester
        self.replay = replay or OrderBookReplay()
        self.order_books: list[ReplayOrderBook] = []

    def run_with_order_books(
        self,
        candles: list[dict],
        strategy,
        symbol: str = "BTC/USDT",
        warmup: int = 50,
    ) -> tuple:
        """Run backtest with order book data available.

        Args:
            candles: Historical candle data
            strategy: Strategy with optional .analyze_with_order_book() method
            symbol: Trading symbol
            warmup: Warmup period

        Returns:
            (BacktestResult, list[ReplayOrderBook])
        """
        # Generate order books for all candles
        self.order_books = self.replay.replay_series(candles, symbol)

        # If strategy supports order book analysis, monkey-patch the analyze call
        has_ob_method = hasattr(strategy, "analyze_with_order_book")

        if has_ob_method:
            # Wrap strategy to inject order book data
            original_analyze = strategy.analyze

            def analyze_with_ob(sym, window_candles):
                idx = len(window_candles) - 1
                ob = self.order_books[idx] if idx < len(self.order_books) else None
                return strategy.analyze_with_order_book(sym, window_candles, ob)

            strategy.analyze = analyze_with_ob

        result = self.backtester.run(candles, strategy, symbol, warmup)

        # Restore original method
        if has_ob_method:
            strategy.analyze = original_analyze

        return result, self.order_books
