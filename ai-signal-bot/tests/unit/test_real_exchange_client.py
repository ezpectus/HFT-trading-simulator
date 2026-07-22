"""Tests for RealExchangeClient — signing, URL defaults, dataclasses, dispatch."""
import base64
import hashlib
import hmac

import pytest

from src.data_collection.real_exchange_client import (
    AccountBalance,
    Position,
    RealExchangeClient,
)


# ─────────────────────────────────────────────────────────────────────────────
# Dataclass construction
# ─────────────────────────────────────────────────────────────────────────────
class TestAccountBalance:
    def test_construction(self):
        ab = AccountBalance(
            exchange="binance",
            total_balance=10000.0,
            available_balance=8000.0,
            unrealized_pnl=500.0,
            margin_used=2000.0,
            currency="USDT",
        )
        assert ab.exchange == "binance"
        assert ab.total_balance == 10000.0
        assert ab.available_balance == 8000.0
        assert ab.unrealized_pnl == 500.0
        assert ab.margin_used == 2000.0
        assert ab.currency == "USDT"

    def test_negative_pnl(self):
        ab = AccountBalance(
            exchange="okx", total_balance=5000, available_balance=3000,
            unrealized_pnl=-200, margin_used=2000, currency="USDT",
        )
        assert ab.unrealized_pnl == -200

    def test_zero_balance(self):
        ab = AccountBalance(
            exchange="bybit", total_balance=0, available_balance=0,
            unrealized_pnl=0, margin_used=0, currency="USDT",
        )
        assert ab.total_balance == 0


class TestPosition:
    def test_long_position(self):
        pos = Position(
            exchange="binance", symbol="BTCUSDT", side="LONG",
            size=1.5, entry_price=50000, mark_price=51000,
            unrealized_pnl=1500, leverage=10, margin=5000, liq_price=45000,
        )
        assert pos.side == "LONG"
        assert pos.size == 1.5
        assert pos.leverage == 10

    def test_short_position(self):
        pos = Position(
            exchange="okx", symbol="ETHUSDT", side="SHORT",
            size=10, entry_price=3000, mark_price=2900,
            unrealized_pnl=1000, leverage=5, margin=6000, liq_price=3500,
        )
        assert pos.side == "SHORT"
        assert pos.unrealized_pnl == 1000

    def test_zero_pnl(self):
        pos = Position(
            exchange="bybit", symbol="BTCUSDT", side="LONG",
            size=1, entry_price=50000, mark_price=50000,
            unrealized_pnl=0, leverage=1, margin=50000, liq_price=0,
        )
        assert pos.unrealized_pnl == 0


# ─────────────────────────────────────────────────────────────────────────────
# Constructor — exchange-specific default URLs
# ─────────────────────────────────────────────────────────────────────────────
class TestConstructorDefaults:
    def test_binance_default_url(self):
        c = RealExchangeClient("binance", "key", "secret")
        assert c.base_url == "https://fapi.binance.com"

    def test_okx_default_url(self):
        c = RealExchangeClient("okx", "key", "secret")
        assert c.base_url == "https://www.okx.com"

    def test_bybit_default_url(self):
        c = RealExchangeClient("bybit", "key", "secret")
        assert c.base_url == "https://api.bybit.com"

    def test_unknown_exchange_empty_url(self):
        c = RealExchangeClient("unknown", "key", "secret")
        assert c.base_url == ""

    def test_custom_url_overrides_default(self):
        c = RealExchangeClient("binance", "key", "secret", base_url="https://testnet.binancefuture.com")
        assert c.base_url == "https://testnet.binancefuture.com"

    def test_passphrase_stored(self):
        c = RealExchangeClient("okx", "key", "secret", passphrase="mypass")
        assert c.passphrase == "mypass"

    def test_default_passphrase_empty(self):
        c = RealExchangeClient("binance", "key", "secret")
        assert c.passphrase == ""

    def test_credentials_stored(self):
        c = RealExchangeClient("binance", "mykey", "mysecret")
        assert c.api_key == "mykey"
        assert c.api_secret == "mysecret"


# ─────────────────────────────────────────────────────────────────────────────
# Signing — Binance (HMAC-SHA256 hex)
# ─────────────────────────────────────────────────────────────────────────────
class TestSignBinance:
    def test_sign_known_value(self):
        c = RealExchangeClient("binance", "testkey", "testsecret")
        query = "timestamp=1234567890&recvWindow=5000"
        expected = hmac.new(
            b"testsecret", query.encode(), hashlib.sha256
        ).hexdigest()
        assert c._sign_binance(query) == expected

    def test_sign_different_secrets_differ(self):
        c1 = RealExchangeClient("binance", "key", "secret1")
        c2 = RealExchangeClient("binance", "key", "secret2")
        query = "timestamp=123"
        assert c1._sign_binance(query) != c2._sign_binance(query)

    def test_sign_different_queries_differ(self):
        c = RealExchangeClient("binance", "key", "secret")
        assert c._sign_binance("timestamp=1") != c._sign_binance("timestamp=2")

    def test_sign_returns_hex_string(self):
        c = RealExchangeClient("binance", "key", "secret")
        sig = c._sign_binance("test=1")
        assert isinstance(sig, str)
        assert len(sig) == 64  # SHA256 hex = 64 chars
        int(sig, 16)  # valid hex


# ─────────────────────────────────────────────────────────────────────────────
# Signing — OKX (HMAC-SHA256 base64)
# ─────────────────────────────────────────────────────────────────────────────
class TestSignOKX:
    def test_sign_known_value(self):
        c = RealExchangeClient("okx", "key", "secret", passphrase="pass")
        ts = "2024-01-01T00:00:00.000Z"
        method = "GET"
        path = "/api/v5/account/balance"
        msg = f"{ts}{method}{path}"
        expected = base64.b64encode(
            hmac.new(b"secret", msg.encode(), hashlib.sha256).digest()
        ).decode()
        assert c._sign_okx(ts, method, path) == expected

    def test_sign_with_body(self):
        c = RealExchangeClient("okx", "key", "secret")
        ts = "2024-01-01T00:00:00.000Z"
        method = "POST"
        path = "/api/v5/order"
        body = '{"instId":"BTC-USDT"}'
        msg = f"{ts}{method}{path}{body}"
        expected = base64.b64encode(
            hmac.new(b"secret", msg.encode(), hashlib.sha256).digest()
        ).decode()
        assert c._sign_okx(ts, method, path, body) == expected

    def test_sign_method_case_insensitive_input(self):
        c = RealExchangeClient("okx", "key", "secret")
        ts = "2024-01-01T00:00:00.000Z"
        path = "/api/v5/account/balance"
        # Method is uppercased internally
        sig_lower = c._sign_okx(ts, "get", path)
        sig_upper = c._sign_okx(ts, "GET", path)
        assert sig_lower == sig_upper

    def test_sign_returns_base64(self):
        c = RealExchangeClient("okx", "key", "secret")
        sig = c._sign_okx("ts", "GET", "/path")
        assert isinstance(sig, str)
        base64.b64decode(sig)  # valid base64


# ─────────────────────────────────────────────────────────────────────────────
# Signing — Bybit (HMAC-SHA256 hex)
# ─────────────────────────────────────────────────────────────────────────────
class TestSignBybit:
    def test_sign_known_value(self):
        c = RealExchangeClient("bybit", "mykey", "mysecret")
        ts = "1234567890000"
        recv_window = 5000
        param_str = "accountType=UNIFIED"
        msg = f"{ts}mykey{recv_window}{param_str}"
        expected = hmac.new(
            b"mysecret", msg.encode(), hashlib.sha256
        ).hexdigest()
        assert c._sign_bybit(ts, recv_window, param_str) == expected

    def test_sign_different_keys_differ(self):
        c1 = RealExchangeClient("bybit", "key1", "secret")
        c2 = RealExchangeClient("bybit", "key2", "secret")
        sig1 = c1._sign_bybit("ts", 5000, "param=1")
        sig2 = c2._sign_bybit("ts", 5000, "param=1")
        assert sig1 != sig2

    def test_sign_returns_hex_string(self):
        c = RealExchangeClient("bybit", "key", "secret")
        sig = c._sign_bybit("ts", 5000, "param=1")
        assert isinstance(sig, str)
        assert len(sig) == 64
        int(sig, 16)


# ─────────────────────────────────────────────────────────────────────────────
# Dispatch — get_balance / get_positions route to correct exchange
# ─────────────────────────────────────────────────────────────────────────────
class TestDispatch:
    def test_get_balance_unknown_exchange_returns_none(self):
        import asyncio
        c = RealExchangeClient("unknown", "key", "secret")
        result = asyncio.run(c.get_balance())
        assert result is None

    def test_get_positions_unknown_exchange_returns_empty(self):
        import asyncio
        c = RealExchangeClient("unknown", "key", "secret")
        result = asyncio.run(c.get_positions())
        assert result == []
