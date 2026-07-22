"""Tests for ShmFillConsumer — init, try_pop, bulk_pop, pending, polling, close.

Tests cover: init success/failure, try_pop with/without buffer, bulk_pop with
max_count, pending count, async polling loop with callback, stop, close,
and context manager usage.
"""
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.communication.shm_fill_consumer import ShmFillConsumer


@pytest.fixture
def consumer():
    """Create a ShmFillConsumer with mocked buffer."""
    c = ShmFillConsumer(name="/test_fills", capacity=64)
    c._buffer = MagicMock()
    c._buffer.try_pop.return_value = None
    c._buffer.bulk_pop.return_value = []
    c._buffer.size.return_value = 0
    return c


class TestInit:
    def test_init_success(self):
        c = ShmFillConsumer(name="/test_fills", capacity=128)
        with patch("src.communication.shm_fill_consumer.ShmRingBuffer") as mock_rb:
            mock_instance = MagicMock()
            mock_rb.return_value = mock_instance
            result = c.init()
            assert result is True
            assert c._buffer is mock_instance

    def test_init_failure(self):
        c = ShmFillConsumer(name="/test_fills", capacity=128)
        with patch("src.communication.shm_fill_consumer.ShmRingBuffer",
                   side_effect=Exception("SHM open failed")):
            result = c.init()
            assert result is False
            assert c._buffer is None

    def test_default_values(self):
        c = ShmFillConsumer()
        assert c.name == "/hft_fills"
        assert c.capacity == 4096
        assert c._buffer is None
        assert c._running is False


class TestTryPop:
    def test_try_pop_without_buffer(self):
        c = ShmFillConsumer()
        assert c.try_pop() is None

    def test_try_pop_empty(self, consumer):
        consumer._buffer.try_pop.return_value = None
        assert consumer.try_pop() is None

    def test_try_pop_returns_fill(self, consumer):
        fill = (1000, 0, 0, 1.0, 50000.0, 2.0, 0)
        consumer._buffer.try_pop.return_value = fill
        result = consumer.try_pop()
        assert result == fill
        consumer._buffer.try_pop.assert_called_once()


class TestBulkPop:
    def test_bulk_pop_without_buffer(self):
        c = ShmFillConsumer()
        assert c.bulk_pop() == []

    def test_bulk_pop_empty(self, consumer):
        consumer._buffer.bulk_pop.return_value = []
        assert consumer.bulk_pop() == []

    def test_bulk_pop_returns_fills(self, consumer):
        fills = [
            (1000, 0, 0, 1.0, 50000.0, 2.0, 0),
            (1001, 1, 1, 0.5, 51000.0, 1.0, 1),
        ]
        consumer._buffer.bulk_pop.return_value = fills
        result = consumer.bulk_pop(128)
        assert result == fills
        consumer._buffer.bulk_pop.assert_called_once_with(128)

    def test_bulk_pop_default_max_count(self, consumer):
        consumer._buffer.bulk_pop.return_value = []
        consumer.bulk_pop()
        consumer._buffer.bulk_pop.assert_called_once_with(256)


class TestPending:
    def test_pending_with_buffer(self, consumer):
        consumer._buffer.size.return_value = 5
        assert consumer.pending() == 5

    def test_pending_without_buffer(self):
        c = ShmFillConsumer()
        assert consumer_pending(c) == 0

    def test_pending_zero_when_empty(self, consumer):
        consumer._buffer.size.return_value = 0
        assert consumer.pending() == 0


def consumer_pending(c):
    return c.pending()


class TestClose:
    def test_close_closes_buffer(self, consumer):
        buf = consumer._buffer
        consumer.close()
        buf.close.assert_called_once()
        assert consumer._buffer is None

    def test_close_without_buffer(self):
        c = ShmFillConsumer()
        c.close()  # Should not crash
        assert c._buffer is None

    def test_close_idempotent(self, consumer):
        consumer.close()
        consumer.close()  # Second close should not crash
        assert consumer._buffer is None


class TestContextManager:
    def test_context_manager_calls_init_and_close(self):
        c = ShmFillConsumer(name="/test_fills", capacity=64)
        with patch("src.communication.shm_fill_consumer.ShmRingBuffer") as mock_rb:
            mock_instance = MagicMock()
            mock_rb.return_value = mock_instance
            with c as ctx:
                assert ctx is c
                assert c._buffer is mock_instance
            # After exit, buffer should be closed
            mock_instance.close.assert_called_once()
            assert c._buffer is None


class TestPolling:
    def test_stop_sets_running_false(self, consumer):
        consumer._running = True
        consumer.stop()
        assert consumer._running is False

    @pytest.mark.asyncio
    async def test_run_polling_invokes_callback_with_fills(self, consumer):
        fills = [(1000, 0, 0, 1.0, 50000.0, 2.0, 0)]
        consumer._buffer.bulk_pop.return_value = fills

        callback = MagicMock()
        consumer._running = True

        # Start polling, then stop after a brief moment
        async def stop_after_delay():
            await asyncio.sleep(0.01)
            consumer.stop()

        stop_task = asyncio.create_task(stop_after_delay())
        await consumer.run_polling(callback, poll_interval=0.001, batch_size=128)
        await stop_task

        callback.assert_called_with(fills)

    @pytest.mark.asyncio
    async def test_run_polling_no_callback_when_empty(self, consumer):
        consumer._buffer.bulk_pop.return_value = []

        callback = MagicMock()
        consumer._running = True

        async def stop_after_delay():
            await asyncio.sleep(0.01)
            consumer.stop()

        stop_task = asyncio.create_task(stop_after_delay())
        await consumer.run_polling(callback, poll_interval=0.001)
        await stop_task

        callback.assert_not_called()

    @pytest.mark.asyncio
    async def test_run_polling_stops_on_stop(self, consumer):
        consumer._buffer.bulk_pop.return_value = []
        callback = MagicMock()

        consumer._running = True
        async def stop_after_delay():
            await asyncio.sleep(0.01)
            consumer.stop()

        stop_task = asyncio.create_task(stop_after_delay())
        await consumer.run_polling(callback, poll_interval=0.001)
        await stop_task

        assert consumer._running is False
