"""Market simulator — Geometric Brownian Motion price generation.

Generates realistic OHLCV candles for multiple symbols across multiple
exchanges. Each exchange gets slightly different prices (correlated but
not identical) to simulate real market conditions.
"""
import math
import random
from typing import Optional

from exchange_simulator.models import Candle, OrderBook, OrderBookLevel


class MarketSimulator:
    """Core market simulation engine.

    Generates price data using GBM with configurable volatility and drift.
    Each exchange receives correlated prices with small spread differences.
    """

    def __init__(
        self,
        symbols: list[str],
        exchanges: list[str],
        initial_prices: dict[str, float],
        volatility: dict[str, float],
        timeframe_seconds: int = 300,
        drift: float = 0.0001,
        seed: Optional[int] = 42,
        warmup_candles: int = 200,
        order_book_depth: int = 20,
        correlations: Optional[dict[tuple[str, str], float]] = None,
    ):
        self.symbols = symbols
        self.exchanges = exchanges
        self.timeframe_seconds = timeframe_seconds
        self.drift = drift
        self.order_book_depth = order_book_depth
        self.rng = random.Random(seed)

        # Per-symbol state
        self._prices: dict[str, float] = {}
        self._volatility: dict[str, float] = {}
        self._candle_history: dict[tuple[str, str], list[Candle]] = {}

        for symbol in symbols:
            self._prices[symbol] = initial_prices.get(symbol, 100.0)
            self._volatility[symbol] = volatility.get(symbol, 0.8)
            for exchange in exchanges:
                self._candle_history[(exchange, symbol)] = []

        # Start timestamp: 2024-01-01 00:00:00 UTC
        self._current_ts = 1704067200

        # Per-exchange price offset (small spread between exchanges)
        self._exchange_offset: dict[str, float] = {}
        for i, exchange in enumerate(exchanges):
            self._exchange_offset[exchange] = 1.0 + (i * 0.0002)  # 2bps per exchange

        # Cached order books for incremental updates (avoids full regen every tick)
        self._ob_cache: dict[tuple[str, str], OrderBook] = {}

        # Per-exchange volatility multiplier — different exchanges have slightly different vol
        self._exchange_vol_mult: dict[str, float] = {}
        for i, exchange in enumerate(exchanges):
            # binance: 1.0 (baseline), bybit: 1.05, okx: 0.95
            self._exchange_vol_mult[exchange] = 1.0 + (i - 1) * 0.05

        # Funding rate state (perp-like funding every 8h = 96 candles at 5m TF)
        self._funding_interval = 96
        self._candle_count = 0
        self._funding_rates: dict[str, float] = {}  # per exchange
        self._funding_history: list[dict] = []  # [{timestamp, exchange, rate}]
        self._max_funding_history = 500
        self._max_candle_history = 1000  # Cap per exchange+symbol pair

        # Inter-symbol correlation matrix
        # Default: BTC/ETH correlation = 0.85, others = 0.3
        self._correlations: dict[tuple[str, str], float] = {}
        if correlations:
            self._correlations = dict(correlations)
        else:
            for i, s1 in enumerate(symbols):
                for s2 in symbols[i+1:]:
                    if "BTC" in s1 and "ETH" in s2 or "ETH" in s1 and "BTC" in s2:
                        self._correlations[(s1, s2)] = 0.85
                    else:
                        self._correlations[(s1, s2)] = 0.3

        # Pre-build per-symbol correlation lookup for O(1) access
        self._symbol_corr: dict[str, float] = {}
        for symbol in symbols:
            corr = 0.5  # default correlation to market
            for (s1, s2), c in self._correlations.items():
                if symbol in (s1, s2):
                    corr = c
                    break
            self._symbol_corr[symbol] = corr

        # News event state
        self._news_event: Optional[dict] = None  # {symbol, intensity, remaining}
        self._news_interval = 200  # ~every 200 candles a random news event
        self._last_news_candle = 0

        # Weekend/holiday mode — reduced volatility
        self._weekend_mode = False
        self._weekend_vol_mult = 0.3  # 30% of normal vol on weekends

        # Warm up history
        self._warmup(warmup_candles)

    def _warmup(self, n: int) -> None:
        for _ in range(n):
            self._generate_candles()

    def _generate_candles(self) -> None:
        """Generate one candle per symbol per exchange."""
        tf = self.timeframe_seconds

        # Check for news event trigger
        if self._candle_count - self._last_news_candle >= self._news_interval and self.rng.random() < 0.02:
            news_symbol = self.rng.choice(self.symbols)
            intensity = self.rng.uniform(3, 8)  # 3x-8x volatility spike
            duration = self.rng.randint(5, 15)  # lasts 5-15 candles
            self._news_event = {
                "symbol": news_symbol,
                "intensity": intensity,
                "remaining": duration,
                "direction": self.rng.choice([-1, 1]),  # random direction
            }
            self._last_news_candle = self._candle_count

        # Decay news event
        if self._news_event:
            self._news_event["remaining"] -= 1
            if self._news_event["remaining"] <= 0:
                self._news_event = None

        # Shared random component for correlation — drawn once per candle tick
        z_shared = self.rng.gauss(0, 1)

        # Hoist invariant computation outside symbol loop
        candles_per_year = 365 * 24 * 3600 / tf
        sqrt_cpy = math.sqrt(candles_per_year)

        for symbol in self.symbols:
            base_price = self._prices[symbol]
            vol = self._volatility[symbol]

            # Per-candle volatility from annualized vol
            sigma = vol / sqrt_cpy

            # Apply weekend/holiday mode — reduced volatility
            if self._weekend_mode:
                sigma *= self._weekend_vol_mult

            # Correlated random draw: base z + per-symbol idiosyncratic component
            z_idio = self.rng.gauss(0, 1)
            corr = self._symbol_corr.get(symbol, 0.5)
            z = corr * z_shared + math.sqrt(1.0 - corr * corr) * z_idio
            
            # Apply news event volatility spike
            news_mult = 1.0
            news_drift = 0.0
            if self._news_event and self._news_event["symbol"] == symbol:
                news_mult = self._news_event["intensity"]
                news_drift = self._news_event["direction"] * 0.002  # directional bias during news
            
            ret = self.drift + news_drift + sigma * news_mult * z
            new_base_price = base_price * math.exp(ret)

            for exchange in self.exchanges:
                # Apply exchange-specific offset and volatility
                vol_mult = self._exchange_vol_mult.get(exchange, 1.0)
                price = new_base_price * self._exchange_offset[exchange]
                open_p = base_price * self._exchange_offset[exchange]

                # Candle OHLC with exchange-specific wick range
                close_p = price
                wick_range = abs(close_p - open_p) * (0.5 + self.rng.random() * 0.5) * vol_mult
                high_p = max(open_p, close_p) + wick_range * self.rng.random()
                low_p = min(open_p, close_p) - wick_range * self.rng.random()
                volume = self.rng.uniform(50, 2000) * (1 + abs(ret) * 100) * vol_mult
                if self._news_event and self._news_event["symbol"] == symbol:
                    volume *= self._news_event["intensity"]  # volume spike during news

                candle = Candle(
                    timestamp=self._current_ts,
                    open=round(open_p, 2),
                    high=round(high_p, 2),
                    low=round(low_p, 2),
                    close=round(close_p, 2),
                    volume=round(volume, 2),
                    symbol=symbol,
                    exchange=exchange,
                )
                self._candle_history[(exchange, symbol)].append(candle)

            self._prices[symbol] = new_base_price

        self._current_ts += tf
        self._candle_count += 1

        # Trim candle history to prevent unbounded memory growth
        for key in self._candle_history:
            if len(self._candle_history[key]) > self._max_candle_history:
                self._candle_history[key] = self._candle_history[key][-self._max_candle_history:]

        # Update funding rates every funding_interval candles
        if self._candle_count % self._funding_interval == 0:
            for exchange in self.exchanges:
                # Funding rate: small random rate, typically -0.03% to +0.03%
                base_rate = self.rng.gauss(0, 0.0002)
                rate = round(base_rate, 6)
                self._funding_rates[exchange] = rate
                self._funding_history.append({
                    "timestamp": self._current_ts,
                    "exchange": exchange,
                    "rate": rate,
                })
            if len(self._funding_history) > self._max_funding_history:
                self._funding_history = self._funding_history[-self._max_funding_history:]

    def next_candle(self) -> list[Candle]:
        """Advance one timeframe and return all new candles."""
        self._generate_candles()
        return self.get_latest_candles()

    def get_replay_candles(self, offset: int = 0) -> list[Candle]:
        """Return candles from N steps ago for replay mode (0=latest, 1=previous, etc)."""
        candles = []
        for exchange in self.exchanges:
            for symbol in self.symbols:
                history = self._candle_history.get((exchange, symbol), [])
                idx = len(history) - 1 - offset
                if 0 <= idx < len(history):
                    candles.append(history[idx])
        return candles

    def get_replay_range(self, start_offset: int, end_offset: int) -> list[Candle]:
        """Return a range of historical candles for replay scrubbing.
        start_offset and end_offset are offsets from latest (0=newest)."""
        candles = []
        for exchange in self.exchanges:
            for symbol in self.symbols:
                history = self._candle_history.get((exchange, symbol), [])
                total = len(history)
                idx_a = max(0, total - 1 - start_offset)
                idx_b = max(0, total - 1 - end_offset)
                if end_offset == 0:
                    idx_b = total
                lo, hi = min(idx_a, idx_b), max(idx_a, idx_b)
                candles.extend(history[lo:hi])
        return candles

    def get_latest_candles(self) -> list[Candle]:
        """Return the most recent candle for each exchange+symbol pair."""
        candles = []
        for exchange in self.exchanges:
            for symbol in self.symbols:
                history = self._candle_history.get((exchange, symbol), [])
                if history:
                    candles.append(history[-1])
        return candles

    def get_history(self, exchange: str, symbol: str, n: int = 100) -> list[Candle]:
        """Return the last n candles for a specific exchange+symbol."""
        history = self._candle_history.get((exchange, symbol), [])
        return history[-n:] if len(history) >= n else history[:]

    def get_price(self, symbol: str, exchange: str = "binance") -> float:
        """Current mid-price for a symbol on a given exchange."""
        history = self._candle_history.get((exchange, symbol), [])
        return history[-1].close if history else 0.0

    def get_all_prices(self) -> dict[str, dict[str, float]]:
        """Return current prices {exchange: {symbol: price}}."""
        result = {}
        for exchange in self.exchanges:
            result[exchange] = {}
            for symbol in self.symbols:
                result[exchange][symbol] = self.get_price(symbol, exchange)
        return result

    def generate_order_book(self, exchange: str, symbol: str) -> OrderBook:
        """Generate a realistic order book around the current price.
        
        Uses cached order book when available — only scales prices by the
        price change ratio and perturbs quantities slightly, avoiding
        order_book_depth * 4 random calls per tick.
        """
        mid_price = self.get_price(symbol, exchange)
        if mid_price == 0:
            return OrderBook(symbol=symbol, exchange=exchange)

        cache_key = (exchange, symbol)
        cached = self._ob_cache.get(cache_key)

        if cached is not None and cached.bids and cached.asks:
            # Incremental update: scale prices by ratio, perturb quantities
            old_mid = (cached.bids[0].price + cached.asks[0].price) / 2.0
            if old_mid > 0:
                ratio = mid_price / old_mid
                cached.timestamp = self._current_ts
                # Iterate bid+ask pairs together — one rng call per pair instead of two
                for bid_level, ask_level in zip(cached.bids, cached.asks):
                    bid_level.price = round(bid_level.price * ratio, 2)
                    ask_level.price = round(ask_level.price * ratio, 2)
                    perturb = 0.9 + self.rng.random() * 0.2
                    bid_level.quantity = round(bid_level.quantity * perturb, 4)
                    ask_level.quantity = round(ask_level.quantity * perturb, 4)
                return cached

        # Full generation (first call or after cache miss)
        vol = self._volatility.get(symbol, 0.8)
        spread_bps = max(1.0, vol * 10)  # basis points
        half_spread = mid_price * spread_bps / 10000

        bids: list[OrderBookLevel] = []
        asks: list[OrderBookLevel] = []

        for i in range(self.order_book_depth):
            # Price levels with increasing distance from mid
            bid_price = mid_price - half_spread * (1 + i * (1 + self.rng.random() * 0.3))
            ask_price = mid_price + half_spread * (1 + i * (1 + self.rng.random() * 0.3))

            # Quantity decreases with distance (more liquidity near mid)
            base_qty = self.rng.uniform(0.1, 5.0)
            decay = math.exp(-i * 0.15)
            bid_qty = base_qty * decay * (0.5 + self.rng.random())
            ask_qty = base_qty * decay * (0.5 + self.rng.random())

            bids.append(OrderBookLevel(price=round(bid_price, 2), quantity=round(bid_qty, 4)))
            asks.append(OrderBookLevel(price=round(ask_price, 2), quantity=round(ask_qty, 4)))

        bids.sort(key=lambda l: l.price, reverse=True)
        asks.sort(key=lambda l: l.price)

        ob = OrderBook(
            symbol=symbol,
            exchange=exchange,
            bids=bids,
            asks=asks,
            timestamp=self._current_ts,
        )
        self._ob_cache[cache_key] = ob
        return ob

    @property
    def current_timestamp(self) -> int:
        return self._current_ts

    def get_funding_rates(self) -> dict[str, float]:
        """Return current funding rate per exchange."""
        return dict(self._funding_rates) if self._funding_rates else {
            ex: 0.0 for ex in self.exchanges
        }

    def get_funding_history(self, exchange: Optional[str] = None, n: int = 100) -> list[dict]:
        """Return funding rate history. Optionally filter by exchange."""
        history = self._funding_history
        if exchange:
            history = [h for h in history if h["exchange"] == exchange]
        return history[-n:] if len(history) >= n else history[:]

    def get_correlation(self, symbol1: str, symbol2: str) -> float:
        """Return correlation between two symbols."""
        if symbol1 == symbol2:
            return 1.0
        for (s1, s2), c in self._correlations.items():
            if (s1 == symbol1 and s2 == symbol2) or (s1 == symbol2 and s2 == symbol1):
                return c
        return 0.0

    @property
    def candles_to_next_funding(self) -> int:
        """Candles remaining until next funding update."""
        return self._funding_interval - (self._candle_count % self._funding_interval)

    def get_news_event(self) -> Optional[dict]:
        """Return current active news event or None."""
        if self._news_event:
            return {
                "symbol": self._news_event["symbol"],
                "intensity": round(self._news_event["intensity"], 2),
                "remaining": self._news_event["remaining"],
                "direction": "up" if self._news_event["direction"] > 0 else "down",
            }
        return None

    def set_weekend_mode(self, enabled: bool) -> None:
        """Enable/disable weekend/holiday reduced volatility."""
        self._weekend_mode = enabled

    @property
    def is_weekend_mode(self) -> bool:
        return self._weekend_mode

    def auto_check_weekend(self) -> bool:
        """Auto-detect weekend from current timestamp (Sat=5, Sun=6)."""
        import datetime
        dt = datetime.datetime.fromtimestamp(self._current_ts, tz=datetime.timezone.utc)
        is_weekend = dt.weekday() >= 5
        self._weekend_mode = is_weekend
        return is_weekend
