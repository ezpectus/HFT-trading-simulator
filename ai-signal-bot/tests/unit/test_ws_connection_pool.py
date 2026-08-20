"""Tests for WebSocketConnectionPool — acquire, release, health checks, eviction."""
import asyncio
import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from ai_signal_bot.src.communication.ws_connection_pool import (
    PooledConnection,
    WebSocketConnectionPool,
)


@pytest.fixture
def mock_ws():
    ws = AsyncMock()
    ws.closed = False
    return ws


@pytest.fixture
def pool():
    return WebSocketConnectionPool(max_size=5, timeout=5.0, health_check_interval=1.0)


class TestPooledConnection:
    def test_init(self, mock_ws):
        conn = PooledConnection(mock_ws, "ws://localhost:8765")
        assert conn.ws is mock_ws
        assert conn.url == "ws://localhost:8765"
        assert conn.healthy is True
        assert conn.last_used > 0

    def test_is_stale_false(self, mock_ws):
        conn = PooledConnection(mock_ws, "ws://localhost:8765")
        assert conn.is_stale(timeout=30.0) is False

    def test_is_stale_true(self, mock_ws):
        conn = PooledConnection(mock_ws, "ws://localhost:8765")
        conn.last_used = time.monotonic() - 40.0
        assert conn.is_stale(timeout=30.0) is True

    @pytest.mark.asyncio
    async def test_close(self, mock_ws):
        conn = PooledConnection(mock_ws, "ws://localhost:8765")
        await conn.close()
        assert conn.healthy is False
        mock_ws.close.assert_called_once()


class TestConnectionPoolAcquire:
    @pytest.mark.asyncio
    async def test_acquire_creates_new(self, pool):
        mock_ws = AsyncMock()
        with patch(
            "ai_signal_bot.src.communication.ws_connection_pool.websockets.connect",
            return_value=mock_ws,
        ):
            conn = await pool.acquire("ws://localhost:8765")
            assert conn is not None
            assert conn.url == "ws://localhost:8765"
            assert conn.healthy is True

    @pytest.mark.asyncio
    async def test_acquire_reuses_existing(self, pool):
        mock_ws = AsyncMock()
        with patch(
            "ai_signal_bot.src.communication.ws_connection_pool.websockets.connect",
            return_value=mock_ws,
        ):
            conn1 = await pool.acquire("ws://localhost:8765")
            await pool.release(conn1)

            conn2 = await pool.acquire("ws://localhost:8765")
            assert conn2 is conn1

    @pytest.mark.asyncio
    async def test_acquire_returns_none_on_failure(self, pool):
        with patch(
            "ai_signal_bot.src.communication.ws_connection_pool.websockets.connect",
            side_effect=OSError("Connection refused"),
        ):
            conn = await pool.acquire("ws://localhost:9999")
            assert conn is None


class TestConnectionPoolRelease:
    @pytest.mark.asyncio
    async def test_release_unhealthy_closes(self, pool, mock_ws):
        conn = PooledConnection(mock_ws, "ws://localhost:8765")
        conn.healthy = False
        await pool.release(conn)
        mock_ws.close.assert_called_once()

    @pytest.mark.asyncio
    async def test_release_healthy_returns_to_pool(self, pool, mock_ws):
        conn = PooledConnection(mock_ws, "ws://localhost:8765")
        await pool.release(conn)
        stats = pool.pool_stats()
        assert "ws://localhost:8765" in stats
        assert stats["ws://localhost:8765"] == 1


class TestConnectionPoolEviction:
    @pytest.mark.asyncio
    async def test_evict_stale(self, pool, mock_ws):
        conn = PooledConnection(mock_ws, "ws://localhost:8765")
        conn.last_used = time.monotonic() - 100.0
        await pool.release(conn)

        pool._evict_stale()
        stats = pool.pool_stats()
        assert stats.get("ws://localhost:8765", 0) == 0


class TestConnectionPoolHealthCheck:
    @pytest.mark.asyncio
    async def test_health_check_marks_unhealthy(self, pool, mock_ws):
        mock_ws.ping = AsyncMock(side_effect=OSError("Network error"))
        conn = PooledConnection(mock_ws, "ws://localhost:8765")
        await pool.release(conn)

        await pool.health_check()
        assert conn.healthy is False

    @pytest.mark.asyncio
    async def test_health_check_healthy_stays(self, pool, mock_ws):
        mock_ws.ping = AsyncMock(return_value=asyncio.Future())
        mock_ws.ping.return_value.set_result(None)
        conn = PooledConnection(mock_ws, "ws://localhost:8765")
        await pool.release(conn)

        with patch("asyncio.wait_for", return_value=None):
            await pool.health_check()
        assert conn.healthy is True


class TestConnectionPoolClose:
    @pytest.mark.asyncio
    async def test_close_all(self, pool, mock_ws):
        conn1 = PooledConnection(mock_ws, "ws://localhost:8765")
        conn2 = PooledConnection(mock_ws, "ws://localhost:9999")
        await pool.release(conn1)
        await pool.release(conn2)

        await pool.close_all()
        assert pool.pool_stats() == {}
        assert mock_ws.close.call_count == 2


class TestConnectionPoolStats:
    @pytest.mark.asyncio
    async def test_pool_stats_empty(self, pool):
        assert pool.pool_stats() == {}

    @pytest.mark.asyncio
    async def test_pool_stats_multiple(self, pool, mock_ws):
        conn1 = PooledConnection(mock_ws, "ws://localhost:8765")
        conn2 = PooledConnection(mock_ws, "ws://localhost:8765")
        conn3 = PooledConnection(mock_ws, "ws://localhost:9999")
        await pool.release(conn1)
        await pool.release(conn2)
        await pool.release(conn3)

        stats = pool.pool_stats()
        assert stats["ws://localhost:8765"] == 2
        assert stats["ws://localhost:9999"] == 1
