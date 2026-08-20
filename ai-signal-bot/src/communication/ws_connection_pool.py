"""WebSocket connection pool for managing multiple exchange connections.

Reuses active connections, performs health checks, and automatically
reconnects stale connections. Reduces overhead from repeated handshakes.
"""
import asyncio
import logging
import time

import websockets

logger = logging.getLogger("ai_signal_bot.ws_pool")

MAX_POOL_SIZE = 10
POOL_TIMEOUT = 30.0
HEALTH_CHECK_INTERVAL = 15.0


class PooledConnection:
    """Wrapper around a WebSocket connection with metadata."""

    def __init__(self, ws: websockets.WebSocketClientProtocol, url: str):
        self.ws = ws
        self.url = url
        self.last_used: float = time.monotonic()
        self.healthy: bool = True

    async def close(self) -> None:
        """Close the underlying WebSocket connection."""
        self.healthy = False
        try:
            await self.ws.close()
        except (OSError, websockets.WebSocketException):
            pass

    def is_stale(self, timeout: float = POOL_TIMEOUT) -> bool:
        """Check if connection has been idle beyond timeout."""
        return (time.monotonic() - self.last_used) > timeout


class WebSocketConnectionPool:
    """Pool of reusable WebSocket connections with health checks."""

    def __init__(
        self,
        max_size: int = MAX_POOL_SIZE,
        timeout: float = POOL_TIMEOUT,
        health_check_interval: float = HEALTH_CHECK_INTERVAL,
    ):
        self._max_size = max_size
        self._timeout = timeout
        self._health_check_interval = health_check_interval
        self._pool: dict[str, list[PooledConnection]] = {}
        self._lock = asyncio.Lock()
        self._health_task: asyncio.Task | None = None

    async def acquire(self, url: str) -> PooledConnection | None:
        """Acquire a connection from the pool or create a new one."""
        async with self._lock:
            conns = self._pool.get(url, [])
            while conns:
                conn = conns.pop()
                if conn.healthy and not conn.is_stale(self._timeout):
                    conn.last_used = time.monotonic()
                    logger.debug(f"Reusing pooled connection to {url}")
                    return conn
                await conn.close()

            if sum(len(c) for c in self._pool.values()) >= self._max_size:
                logger.warning("Connection pool full — evicting stale entries")
                self._evict_stale()

            conn = await self._create_connection(url)
            return conn

    async def release(self, conn: PooledConnection) -> None:
        """Return a connection to the pool for reuse."""
        if not conn.healthy:
            await conn.close()
            return
        conn.last_used = time.monotonic()
        async with self._lock:
            self._pool.setdefault(conn.url, []).append(conn)

    async def _create_connection(self, url: str) -> PooledConnection | None:
        """Create a new WebSocket connection with compression."""
        try:
            ws = await websockets.connect(
                url,
                ping_interval=10,
                compression="deflate",
                max_size=2**20,
            )
            logger.info(f"New pooled connection to {url}")
            return PooledConnection(ws, url)
        except (OSError, websockets.WebSocketException) as e:
            logger.error(f"Failed to create connection to {url}: {e}")
            return None

    def _evict_stale(self) -> None:
        """Remove stale connections from the pool."""
        for url, conns in self._pool.items():
            kept = []
            for conn in conns:
                if conn.is_stale(self._timeout):
                    asyncio.create_task(conn.close())
                else:
                    kept.append(conn)
            self._pool[url] = kept

    async def health_check(self) -> None:
        """Ping all pooled connections to verify health."""
        async with self._lock:
            for url, conns in self._pool.items():
                for conn in conns:
                    if not conn.healthy:
                        continue
                    try:
                        pong_waiter = await conn.ws.ping()
                        await asyncio.wait_for(pong_waiter, timeout=5.0)
                    except (OSError, asyncio.TimeoutError, websockets.WebSocketException):
                        conn.healthy = False
                        logger.warning(f"Health check failed for {url}")

    async def start_health_checks(self) -> None:
        """Start periodic health check background task."""
        self._health_task = asyncio.create_task(self._health_loop())

    async def _health_loop(self) -> None:
        """Run health checks at regular intervals."""
        while True:
            await asyncio.sleep(self._health_check_interval)
            await self.health_check()

    async def close_all(self) -> None:
        """Close all connections and stop health checks."""
        if self._health_task:
            self._health_task.cancel()
            self._health_task = None
        async with self._lock:
            for conns in self._pool.values():
                for conn in conns:
                    await conn.close()
            self._pool.clear()
        logger.info("Connection pool closed")

    def pool_stats(self) -> dict[str, int]:
        """Return pool statistics."""
        return {
            url: len(conns) for url, conns in self._pool.items() if conns
        }
