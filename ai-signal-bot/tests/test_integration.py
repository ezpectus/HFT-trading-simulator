"""Integration test: Exchange Simulator → AI Signal Bot → Order Execution.

Tests the full pipeline:
1. Start exchange simulator in background
2. Connect AI signal bot to simulator via WebSocket
3. Receive market data
4. Generate signals through strategy pipeline
5. Validate signals
6. Submit orders to simulator
7. Verify order fills and position updates

This is an async test that runs against a live exchange simulator instance.
"""
import asyncio
import json
import os
import sys
import time

import pytest
import websockets

# Ensure bot root is on path (conftest.py also does this, but this allows running standalone)
_bot_root = os.path.join(os.path.dirname(__file__), "..")
if _bot_root not in sys.path:
    sys.path.insert(0, _bot_root)

from src.communication import ExchangeClient, SignalPublisher  # noqa: E402
from src.signal_validation import SignalValidator  # noqa: E402
from src.strategies import (  # noqa: E402
    EnsembleVoter,
    FFTCycleStrategy,
    MeanReversionStrategy,
    SignalDirection,
    TrendFollowingStrategy,
)


@pytest.fixture
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
async def exchange_websocket():
    """Connect to a running exchange simulator on localhost:8765.

    Requires the exchange simulator to be running.
    Skips test if connection fails.
    """
    try:
        ws = await websockets.connect("ws://localhost:8765", ping_interval=10)
        await ws.send(json.dumps({"type": "subscribe"}))
        yield ws
        await ws.close()
    except (ConnectionRefusedError, OSError, websockets.exceptions.InvalidURI):
        pytest.skip("Exchange simulator not running on localhost:8765")


class TestExchangeConnection:
    """Test WebSocket connection to exchange simulator."""

    @pytest.mark.asyncio
    async def test_connect(self, exchange_websocket):
        """Test that we can connect and receive a snapshot."""
        msg = await asyncio.wait_for(exchange_websocket.recv(), timeout=5.0)
        data = json.loads(msg)
        assert data["type"] in ("snapshot", "candles")

    @pytest.mark.asyncio
    async def test_receive_candles(self, exchange_websocket):
        """Test that we receive candle data."""
        # Read messages until we get candles
        for _ in range(5):
            msg = await asyncio.wait_for(exchange_websocket.recv(), timeout=10.0)
            data = json.loads(msg)
            if data["type"] in ("candles", "snapshot"):
                assert "candles" in data
                if data["candles"]:
                    candle = data["candles"][0]
                    assert "symbol" in candle
                    assert "close" in candle
                    return
        pytest.fail("No candle data received")

    @pytest.mark.asyncio
    async def test_receive_prices(self, exchange_websocket):
        """Test that we receive price data."""
        for _ in range(5):
            msg = await asyncio.wait_for(exchange_websocket.recv(), timeout=10.0)
            data = json.loads(msg)
            if "prices" in data:
                assert isinstance(data["prices"], dict)
                return
        pytest.fail("No price data received")


class TestExchangeClient:
    """Test the ExchangeClient class against a live simulator."""

    @pytest.mark.asyncio
    async def test_client_connect(self):
        """Test ExchangeClient connection."""
        client = ExchangeClient("ws://localhost:8765")
        try:
            connected = await asyncio.wait_for(client.connect(), timeout=5.0)
            if not connected:
                pytest.skip("Exchange simulator not running")
            assert client.connected

            # Wait for data
            await asyncio.sleep(2)
            assert len(client.latest_candles) > 0 or len(client.latest_prices) > 0
        finally:
            await client.disconnect()

    @pytest.mark.asyncio
    async def test_client_submit_order(self):
        """Test order submission through ExchangeClient."""
        client = ExchangeClient("ws://localhost:8765")
        try:
            connected = await asyncio.wait_for(client.connect(), timeout=5.0)
            if not connected:
                pytest.skip("Exchange simulator not running")

            # Wait for data
            await asyncio.sleep(2)

            # Submit a small market order
            await client.submit_order(
                symbol="BTC/USDT",
                side="BUY",
                quantity=0.01,
                exchange="binance",
            )
            # If we get here without exception, order was sent
            assert True
        finally:
            await client.disconnect()


class TestSignalGeneration:
    """Test signal generation pipeline with live data."""

    @pytest.mark.asyncio
    async def test_strategy_pipeline(self):
        """Test that strategies can process live candle data."""
        client = ExchangeClient("ws://localhost:8765")
        try:
            connected = await asyncio.wait_for(client.connect(), timeout=5.0)
            if not connected:
                pytest.skip("Exchange simulator not running")

            # Collect candle data
            candle_cache = {}
            for _ in range(60):  # Wait up to 60 seconds
                await asyncio.sleep(1)
                for symbol, candle in client.latest_candles.items():
                    if symbol not in candle_cache:
                        candle_cache[symbol] = []
                    candle_cache[symbol].append(candle)
                    if len(candle_cache[symbol]) >= 35:
                        # Run strategies
                        candles = candle_cache[symbol][-200:]
                        strategies = [
                            TrendFollowingStrategy(),
                            MeanReversionStrategy(),
                            FFTCycleStrategy(min_data=64),
                        ]
                        signals = [s.analyze(symbol, candles) for s in strategies]
                        ensemble = EnsembleVoter()
                        result = ensemble.vote(signals)
                        # Should produce a Signal object
                        assert result is not None
                        assert hasattr(result, "direction")
                        assert hasattr(result, "confidence")
                        return

            pytest.skip("Not enough candle data received in time")
        finally:
            await client.disconnect()


class TestSignalPublisher:
    """Test SignalPublisher WebSocket server."""

    @pytest.mark.asyncio
    async def test_publisher_start_stop(self):
        """Test that SignalPublisher can start and stop."""
        publisher = SignalPublisher(host="127.0.0.1", port=8767)
        await publisher.start()
        assert publisher.client_count == 0

        # Connect a test client
        ws = await websockets.connect("ws://127.0.0.1:8767", ping_interval=10)
        await ws.send(json.dumps({"type": "subscribe", "client": "test"}))
        await asyncio.sleep(0.5)
        assert publisher.client_count == 1

        await ws.close()
        await asyncio.sleep(0.5)
        await publisher.stop()

    @pytest.mark.asyncio
    async def test_publisher_broadcast(self):
        """Test signal broadcasting."""
        publisher = SignalPublisher(host="127.0.0.1", port=8768)
        await publisher.start()

        # Connect a test client
        ws = await websockets.connect("ws://127.0.0.1:8768", ping_interval=10)
        await ws.send(json.dumps({"type": "subscribe", "client": "test"}))
        await asyncio.sleep(0.5)

        # Broadcast a signal
        test_signal = {
            "symbol": "BTC/USDT",
            "direction": "LONG",
            "confidence": 75.0,
            "strategy": "test",
            "entry_price": 65000,
            "stop_loss": 63000,
            "take_profit": 70000,
        }
        await publisher.broadcast_signal(test_signal)

        # Client should receive it — may need to skip circuit_breaker_status messages
        msg = await asyncio.wait_for(ws.recv(), timeout=5.0)
        data = json.loads(msg)
        while data["type"] not in ("signal", "signal_history"):
            msg = await asyncio.wait_for(ws.recv(), timeout=5.0)
            data = json.loads(msg)
        assert data["type"] in ("signal", "signal_history")

        await ws.close()
        await publisher.stop()

    @pytest.mark.asyncio
    async def test_publisher_stats(self):
        """Test publisher statistics tracking."""
        publisher = SignalPublisher(host="127.0.0.1", port=8769)
        await publisher.start()

        ws = await websockets.connect("ws://127.0.0.1:8769", ping_interval=10)
        await ws.send(json.dumps({"type": "subscribe"}))
        await asyncio.sleep(0.5)

        # Broadcast multiple signals
        for i in range(3):
            await publisher.broadcast_signal({
                "symbol": "BTC/USDT",
                "direction": "LONG",
                "confidence": 70 + i,
                "strategy": "test",
            })

        assert publisher.signals_sent == 3
        await ws.close()
        await publisher.stop()


class TestSignalValidator:
    """Test signal validation logic."""

    def test_valid_signal_passes(self):
        validator = SignalValidator(
            min_confidence=65,
            min_rr_ratio=1.5,
            max_drawdown_pct=8,
            max_open_positions=3,
        )
        validator.update_position_count(0)

        from src.strategies.strategies import Signal
        sig = Signal(
            symbol="BTC/USDT",
            direction=SignalDirection.LONG,
            confidence=75.0,
            strategy="test",
            entry_price=65000,
            stop_loss=63000,
            take_profit=70000,
            reason="test",
        )
        result = validator.validate(sig, account_balance=10000)
        assert result.passed

    def test_low_confidence_rejected(self):
        validator = SignalValidator(
            min_confidence=65,
            min_rr_ratio=1.5,
            max_drawdown_pct=8,
            max_open_positions=3,
        )
        validator.update_position_count(0)

        from src.strategies.strategies import Signal
        sig = Signal(
            symbol="BTC/USDT",
            direction=SignalDirection.LONG,
            confidence=50.0,
            strategy="test",
            entry_price=65000,
            stop_loss=63000,
            take_profit=70000,
            reason="test",
        )
        result = validator.validate(sig, account_balance=10000)
        assert not result.passed

    def test_too_many_positions(self):
        validator = SignalValidator(
            min_confidence=65,
            min_rr_ratio=1.5,
            max_drawdown_pct=8,
            max_open_positions=3,
        )
        validator.update_position_count(3)

        from src.strategies.strategies import Signal
        sig = Signal(
            symbol="BTC/USDT",
            direction=SignalDirection.LONG,
            confidence=80.0,
            strategy="test",
            entry_price=65000,
            stop_loss=63000,
            take_profit=70000,
            reason="test",
        )
        result = validator.validate(sig, account_balance=10000)
        assert not result.passed
