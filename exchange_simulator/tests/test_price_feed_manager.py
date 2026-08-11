"""Unit tests for Price Feed Manager.

Tests for Binance and Coinbase API implementations including
rate limiting, data normalization, health tracking, and error handling.
"""
import pytest
import asyncio
from unittest.mock import Mock, AsyncMock, patch
from exchange_simulator.price_feed_manager import (
    BinanceAPI,
    CoinbaseAPI,
    APIStatus,
    PriceTick,
)


class TestPriceTick:
    """Test PriceTick dataclass."""
    
    def test_price_tick_creation(self):
        """Test creating a price tick."""
        tick = PriceTick(
            symbol="BTC/USDT",
            price=50000.0,
            timestamp=1234567890,
            exchange="binance",
            volume=100.0,
        )
        assert tick.symbol == "BTC/USDT"
        assert tick.price == 50000.0
        assert tick.volume == 100.0
        assert tick.timestamp == 1234567890
        assert tick.exchange == "binance"


class TestBinanceAPI:
    """Test Binance API implementation."""
    
    @pytest.fixture
    def binance_api(self):
        """Create a BinanceAPI instance for testing."""
        return BinanceAPI()
    
    def test_binance_api_creation(self, binance_api):
        """Test creating a BinanceAPI instance."""
        assert binance_api.name == "binance"
        assert binance_api.rate_limit == 1200
        assert binance_api.health.status == APIStatus.HEALTHY
    
    def test_binance_normalize_symbol(self, binance_api):
        """Test symbol normalization for Binance."""
        assert binance_api._normalize_symbol("BTC/USDT") == "btcusdt"
        assert binance_api._normalize_symbol("ETH/USDT") == "ethusdt"
    
    def test_binance_denormalize_symbol(self, binance_api):
        """Test symbol denormalization for Binance."""
        assert binance_api._denormalize_symbol("btcusdt") == "BTC/USDT"
        assert binance_api._denormalize_symbol("ethusdt") == "ETH/USDT"
    
    def test_rate_limit_check(self, binance_api):
        """Test rate limiting check."""
        # Initially should pass
        assert binance_api._check_rate_limit() is True
        
        # Record requests up to limit
        for _ in range(1200):
            binance_api._record_request()
        
        # Should now be rate limited
        assert binance_api._check_rate_limit() is False
    
    def test_rate_limit_reset(self, binance_api):
        """Test rate limit resets after window expires."""
        import time
        binance_api._request_count = 1200
        binance_api._window_start = time.time() - 70  # 70 seconds ago
        
        # Should allow requests (window expired)
        assert binance_api._check_rate_limit() is True
        assert binance_api._request_count == 0  # Reset
    
    def test_record_success(self, binance_api):
        """Test recording successful request."""
        binance_api._record_success()
        assert binance_api.health.status == APIStatus.HEALTHY
        assert binance_api.health.consecutive_failures == 0
    
    def test_record_error(self, binance_api):
        """Test recording error."""
        binance_api._record_error("Test error")
        assert binance_api.health.status == APIStatus.DEGRADED
        assert binance_api.health.consecutive_failures == 1
        assert binance_api.health.last_error == "Test error"
    
    def test_record_error_multiple(self, binance_api):
        """Test recording multiple errors marks API as down."""
        for _ in range(3):
            binance_api._record_error("Test error")
        
        assert binance_api.health.status == APIStatus.DOWN
        assert binance_api.health.consecutive_failures == 3


class TestCoinbaseAPI:
    """Test Coinbase API implementation."""
    
    @pytest.fixture
    def coinbase_api(self):
        """Create a CoinbaseAPI instance for testing."""
        return CoinbaseAPI()
    
    def test_coinbase_api_creation(self, coinbase_api):
        """Test creating a CoinbaseAPI instance."""
        assert coinbase_api.name == "coinbase"
        assert coinbase_api.rate_limit == 1000
        assert coinbase_api.health.status == APIStatus.HEALTHY
    
    def test_coinbase_normalize_symbol(self, coinbase_api):
        """Test symbol normalization for Coinbase."""
        assert coinbase_api._normalize_symbol("BTC/USDT") == "BTC-USDT"
        assert coinbase_api._normalize_symbol("ETH/USDT") == "ETH-USDT"
    
    def test_coinbase_denormalize_symbol(self, coinbase_api):
        """Test symbol denormalization for Coinbase."""
        assert coinbase_api._denormalize_symbol("BTC-USDT") == "BTC/USDT"
        assert coinbase_api._denormalize_symbol("ETH-USDT") == "ETH/USDT"
    
    def test_coinbase_rate_limit_check(self, coinbase_api):
        """Test rate limiting check for Coinbase."""
        # Initially should pass
        assert coinbase_api._check_rate_limit() is True
        
        # Record requests up to limit
        for _ in range(1000):
            coinbase_api._record_request()
        
        # Should now be rate limited
        assert coinbase_api._check_rate_limit() is False
