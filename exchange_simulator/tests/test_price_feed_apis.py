"""Unit tests for exchange_simulator/price_feed_apis.py — BinanceAPI, CoinbaseAPI, BasePriceAPI."""

import pytest

from exchange_simulator.price_feed_apis import BinanceAPI, CoinbaseAPI
from exchange_simulator.price_feed_models import APIStatus


# ─── BinanceAPI ───


@pytest.fixture
def binance_api() -> BinanceAPI:
    return BinanceAPI()


# ─── CoinbaseAPI ───


@pytest.fixture
def coinbase_api() -> CoinbaseAPI:
    return CoinbaseAPI()


# ─── Symbol Normalization ───


def test_binance_normalize_symbol(binance_api: BinanceAPI) -> None:
    """Binance should convert BTC/USDT to btcusdt."""
    assert binance_api._normalize_symbol("BTC/USDT") == "btcusdt"
    assert binance_api._normalize_symbol("ETH/USDT") == "ethusdt"


def test_binance_denormalize_symbol(binance_api: BinanceAPI) -> None:
    """Binance should convert btcusdt to BTC/USDT."""
    assert binance_api._denormalize_symbol("BTCUSDT") == "BTC/USDT"
    assert binance_api._denormalize_symbol("ETHUSDT") == "ETH/USDT"


def test_binance_denormalize_btc_quote(binance_api: BinanceAPI) -> None:
    """Binance should handle BTC as quote currency."""
    result = binance_api._denormalize_symbol("ETHBTC")
    assert result == "ETH/BTC"


def test_coinbase_normalize_symbol(coinbase_api: CoinbaseAPI) -> None:
    """Coinbase should convert BTC/USDT to BTC-USDT."""
    assert coinbase_api._normalize_symbol("BTC/USDT") == "BTC-USDT"
    assert coinbase_api._normalize_symbol("ETH/USDT") == "ETH-USDT"


def test_coinbase_denormalize_symbol(coinbase_api: CoinbaseAPI) -> None:
    """Coinbase should convert BTC-USDT to BTC/USDT."""
    assert coinbase_api._denormalize_symbol("BTC-USDT") == "BTC/USDT"
    assert coinbase_api._denormalize_symbol("ETH-USDT") == "ETH/USDT"


# ─── Rate Limiting ───


def test_binance_rate_limit_within_limit(binance_api: BinanceAPI) -> None:
    """Rate limit check should return True when under limit."""
    assert binance_api._check_rate_limit() is True


def test_binance_rate_limit_exceeded(binance_api: BinanceAPI) -> None:
    """Rate limit check should return False when over limit."""
    binance_api.rate_limit = 2
    binance_api._record_request()
    binance_api._record_request()
    assert binance_api._check_rate_limit() is False


def test_coinbase_rate_limit_within_limit(coinbase_api: CoinbaseAPI) -> None:
    """Rate limit check should return True when under limit."""
    assert coinbase_api._check_rate_limit() is True


# ─── Health Tracking ───


def test_binance_record_success(binance_api: BinanceAPI) -> None:
    """record_success should set HEALTHY status."""
    binance_api._record_success()
    assert binance_api.health.status == APIStatus.HEALTHY
    assert binance_api.health.consecutive_failures == 0


def test_binance_record_error_degraded(binance_api: BinanceAPI) -> None:
    """First error should set DEGRADED status."""
    binance_api._record_error("timeout")
    assert binance_api.health.status == APIStatus.DEGRADED
    assert binance_api.health.consecutive_failures == 1
    assert binance_api.health.last_error == "timeout"


def test_binance_record_error_down(binance_api: BinanceAPI) -> None:
    """3 consecutive errors should set DOWN status."""
    binance_api._record_error("error1")
    binance_api._record_error("error2")
    binance_api._record_error("error3")
    assert binance_api.health.status == APIStatus.DOWN
    assert binance_api.health.consecutive_failures == 3
    assert binance_api.health.error_count == 3


def test_binance_record_success_resets_failures(binance_api: BinanceAPI) -> None:
    """Success should reset consecutive failures."""
    binance_api._record_error("error1")
    binance_api._record_error("error2")
    binance_api._record_success()
    assert binance_api.health.consecutive_failures == 0
    assert binance_api.health.status == APIStatus.HEALTHY


def test_coinbase_record_error_degraded(coinbase_api: CoinbaseAPI) -> None:
    """First error should set DEGRADED status."""
    coinbase_api._record_error("timeout")
    assert coinbase_api.health.status == APIStatus.DEGRADED


# ─── Parse Tick ───


def test_binance_parse_tick(binance_api: BinanceAPI) -> None:
    """_parse_binance_tick should parse a valid Binance ticker message."""
    data = {
        "s": "BTCUSDT",
        "c": "50000.00",
        "E": 1234567890000,
        "v": "100.5",
        "b": "49999.00",
        "a": "50001.00",
    }
    tick = binance_api._parse_binance_tick(data)
    assert tick is not None
    assert tick.symbol == "BTC/USDT"
    assert tick.price == 50000.0
    assert tick.exchange == "binance"
    assert tick.volume == 100.5
    assert tick.bid == 49999.0
    assert tick.ask == 50001.0


def test_binance_parse_tick_missing_symbol(binance_api: BinanceAPI) -> None:
    """_parse_binance_tick should return None when 's' is missing."""
    tick = binance_api._parse_binance_tick({"c": "50000"})
    assert tick is None


def test_coinbase_parse_tick(coinbase_api: CoinbaseAPI) -> None:
    """_parse_coinbase_tick should parse a valid Coinbase ticker message."""
    data = {
        "type": "ticker",
        "product_id": "BTC-USDT",
        "price": "50000.00",
        "volume_24h": "100.5",
        "best_bid": "49999.00",
        "best_ask": "50001.00",
    }
    tick = coinbase_api._parse_coinbase_tick(data)
    assert tick is not None
    assert tick.symbol == "BTC/USDT"
    assert tick.price == 50000.0
    assert tick.exchange == "coinbase"
    assert tick.volume == 100.5


def test_coinbase_parse_tick_non_ticker(coinbase_api: CoinbaseAPI) -> None:
    """_parse_coinbase_tick should return None for non-ticker messages."""
    tick = coinbase_api._parse_coinbase_tick({"type": "subscriptions"})
    assert tick is None


# ─── API Names ───


def test_binance_api_name(binance_api: BinanceAPI) -> None:
    """BinanceAPI name should be 'binance'."""
    assert binance_api.name == "binance"


def test_coinbase_api_name(coinbase_api: CoinbaseAPI) -> None:
    """CoinbaseAPI name should be 'coinbase'."""
    assert coinbase_api.name == "coinbase"


def test_binance_rate_limit_default(binance_api: BinanceAPI) -> None:
    """BinanceAPI default rate limit should be 1200."""
    assert binance_api.rate_limit == 1200


def test_coinbase_rate_limit_default(coinbase_api: CoinbaseAPI) -> None:
    """CoinbaseAPI default rate limit should be 1000."""
    assert coinbase_api.rate_limit == 1000
