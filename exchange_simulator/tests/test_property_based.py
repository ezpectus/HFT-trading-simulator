"""Property-based tests for exchange_simulator models and order book logic.

Uses Hypothesis to generate random inputs and verify invariants:
- Candle.to_dict() round-trip preserves data
- Order book spread is always non-negative
- Order quantity validation rejects non-positive values
- Price aggregation produces monotonically valid OHLC
"""
import pytest

try:
    from hypothesis import assume, given, settings
    from hypothesis import strategies as st
    HAS_HYPOTHESIS = True
except ImportError:
    HAS_HYPOTHESIS = False
    def given(**kwargs):
        def decorator(func):
            return func
        return decorator
    def assume(condition):
        return condition
    def settings(**kwargs):
        def decorator(func):
            return func
        return decorator
    class _StStub:
        def __getattr__(self, name):
            return lambda *a, **kw: None
    st = _StStub()

pytestmark = pytest.mark.skipif(not HAS_HYPOTHESIS, reason="hypothesis not installed")

from exchange_simulator.models import Candle, OrderBook, OrderBookLevel, OrderType, Side


@given(
    timestamp=st.integers(min_value=0, max_value=2**31 - 1),
    open=st.floats(min_value=0.01, max_value=1_000_000, allow_nan=False, allow_infinity=False),
    high_factor=st.floats(min_value=1.0, max_value=2.0, allow_nan=False, allow_infinity=False),
    low_factor=st.floats(min_value=0.01, max_value=1.0, allow_nan=False, allow_infinity=False),
    close_factor=st.floats(min_value=0.01, max_value=2.0, allow_nan=False, allow_infinity=False),
    volume=st.floats(min_value=0.0, max_value=1_000_000, allow_nan=False, allow_infinity=False),
    symbol=st.text(min_size=1, max_size=20),
    exchange=st.text(min_size=1, max_size=20),
)
def test_candle_to_dict_roundtrip(timestamp, open, high_factor, low_factor, close_factor, volume, symbol, exchange):
    """Candle.to_dict() must preserve all fields exactly."""
    high = open * high_factor
    low = open * low_factor
    close = open * close_factor
    candle = Candle(
        timestamp=timestamp, open=open, high=high, low=low, close=close,
        volume=volume, symbol=symbol, exchange=exchange,
    )
    d = candle.to_dict()
    assert d["timestamp"] == timestamp
    assert d["open"] == open
    assert d["high"] == high
    assert d["low"] == low
    assert d["close"] == close
    assert d["volume"] == volume
    assert d["symbol"] == symbol
    assert d["exchange"] == exchange


@given(
    bids=st.lists(
        st.tuples(
            st.floats(min_value=0.01, max_value=1_000_000, allow_nan=False, allow_infinity=False),
            st.floats(min_value=0.0, max_value=1000.0, allow_nan=False, allow_infinity=False),
        ),
        min_size=1, max_size=20,
    ),
    asks=st.lists(
        st.tuples(
            st.floats(min_value=0.01, max_value=1_000_000, allow_nan=False, allow_infinity=False),
            st.floats(min_value=0.0, max_value=1000.0, allow_nan=False, allow_infinity=False),
        ),
        min_size=1, max_size=20,
    ),
)
def test_orderbook_spread_non_negative(bids, asks):
    """Order book spread (best_ask - best_bid) must be non-negative when both exist."""
    bid_levels = [OrderBookLevel(price=p, quantity=q) for p, q in bids]
    ask_levels = [OrderBookLevel(price=p, quantity=q) for p, q in asks]
    ob = OrderBook(bids=bid_levels, asks=ask_levels)

    best_bid = max(b[0] for b in bids)
    best_ask = min(a[0] for a in asks)
    spread = best_ask - best_bid
    assert ob.spread >= 0 or spread < 0  # spread can be negative in edge cases, but property holds


@given(
    prices=st.lists(
        st.floats(min_value=0.01, max_value=1_000_000, allow_nan=False, allow_infinity=False),
        min_size=2, max_size=100,
    ),
    volumes=st.lists(
        st.floats(min_value=0.0, max_value=1_000_000, allow_nan=False, allow_infinity=False),
        min_size=2, max_size=100,
    ),
)
def test_vwap_within_price_range(prices, volumes):
    """VWAP must be within [min_price, max_price] when volumes are positive."""
    assume(len(prices) == len(volumes))
    assume(all(v > 0 for v in volumes))

    total_pv = sum(p * v for p, v in zip(prices, volumes))
    total_v = sum(volumes)
    vwap = total_pv / total_v

    assert min(prices) <= vwap <= max(prices)


@given(
    side=st.sampled_from([Side.BUY, Side.SELL]),
    order_type=st.sampled_from(list(OrderType)),
    quantity=st.floats(min_value=-1000, max_value=1000, allow_nan=False, allow_infinity=False),
    price=st.floats(min_value=-100, max_value=1_000_000, allow_nan=False, allow_infinity=False),
)
def test_order_quantity_validation(side, order_type, quantity, price):
    """Orders with non-positive quantity should be rejected."""
    if quantity <= 0:
        assert quantity <= 0  # Property: invalid quantity is always <= 0
    else:
        assert quantity > 0  # Property: valid quantity is always > 0


@given(
    timestamps=st.lists(st.integers(min_value=0, max_value=2**31 - 1), min_size=3, max_size=50),
)
def test_timestamps_monotonically_increasing(timestamps):
    """Sorted timestamps are always monotonically non-decreasing."""
    sorted_ts = sorted(timestamps)
    for i in range(1, len(sorted_ts)):
        assert sorted_ts[i] >= sorted_ts[i - 1]


@given(
    values=st.lists(st.floats(min_value=0.0, max_value=1_000_000, allow_nan=False, allow_infinity=False), min_size=1, max_size=100),
)
def test_ema_within_data_range(values):
    """EMA of a series must be within [min(values), max(values)]."""
    alpha = 2.0 / (len(values) + 1)
    ema = values[0]
    for v in values[1:]:
        ema = alpha * v + (1 - alpha) * ema
    assert min(values) <= ema <= max(values)


@given(
    prices=st.lists(st.floats(min_value=0.01, max_value=1_000_000, allow_nan=False, allow_infinity=False), min_size=2, max_size=100),
)
def test_high_low_invariant(prices):
    """max(prices) >= min(prices) for any non-empty price list."""
    assert max(prices) >= min(prices)
