"""
TimescaleDB client for time-series market data storage.

Replaces CSV files with a proper time-series database.
Provides:
- Candle storage with hypertables
- Trade/fill history
- Signal history
- Backtest results
- Automatic retention policies

Usage:
    from src.data_collection.timescaledb_client import TimescaleDBClient

    db = TimescaleDBClient(host="localhost", port=5432)
    await db.initialize()
    await db.insert_candles("BTC/USDT", "1m", candles)
    candles = await db.get_candles("BTC/USDT", "1m", limit=500)
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class CandleRecord:
    symbol: str
    interval: str
    time: int  # unix seconds
    open: float
    high: float
    low: float
    close: float
    volume: float
    exchange: str = "simulator"


@dataclass
class TradeRecord:
    symbol: str
    exchange: str
    side: str  # buy / sell
    price: float
    qty: float
    timestamp: int
    order_id: str = ""
    strategy: str = ""


@dataclass
class SignalRecord:
    symbol: str
    strategy: str
    signal_type: str  # buy / sell / hold
    confidence: float
    price: float
    timestamp: int
    explanation: str = ""


@dataclass
class BacktestRecord:
    backtest_id: str
    symbol: str
    strategy: str
    start_time: int
    end_time: int
    total_return_pct: float
    total_trades: int
    win_rate: float
    profit_factor: float
    max_drawdown_pct: float
    sharpe_ratio: float
    final_balance: float
    config_json: str = ""


class TimescaleDBClient:
    """
    Async TimescaleDB client using asyncpg.

    Schema:
        - candles (hypertable, partitioned by time)
        - trades (hypertable)
        - signals (hypertable)
        - backtest_results (regular table)
    """

    SCHEMA_SQL = """
    -- Candles hypertable
    CREATE TABLE IF NOT EXISTS candles (
        symbol TEXT NOT NULL,
        interval TEXT NOT NULL,
        time BIGINT NOT NULL,
        open DOUBLE PRECISION NOT NULL,
        high DOUBLE PRECISION NOT NULL,
        low DOUBLE PRECISION NOT NULL,
        close DOUBLE PRECISION NOT NULL,
        volume DOUBLE PRECISION NOT NULL,
        exchange TEXT DEFAULT 'simulator',
        PRIMARY KEY (symbol, interval, time, exchange)
    );
    SELECT create_hypertable('candles', 'time', if_not_exists => TRUE,
        chunk_time_interval => INTERVAL '1 day');

    -- Trades hypertable
    CREATE TABLE IF NOT EXISTS trades (
        symbol TEXT NOT NULL,
        exchange TEXT NOT NULL,
        side TEXT NOT NULL,
        price DOUBLE PRECISION NOT NULL,
        qty DOUBLE PRECISION NOT NULL,
        timestamp BIGINT NOT NULL,
        order_id TEXT DEFAULT '',
        strategy TEXT DEFAULT ''
    );
    SELECT create_hypertable('trades', 'timestamp', if_not_exists => TRUE,
        chunk_time_interval => INTERVAL '1 hour');

    -- Signals hypertable
    CREATE TABLE IF NOT EXISTS signals (
        symbol TEXT NOT NULL,
        strategy TEXT NOT NULL,
        signal_type TEXT NOT NULL,
        confidence DOUBLE PRECISION NOT NULL,
        price DOUBLE PRECISION NOT NULL,
        timestamp BIGINT NOT NULL,
        explanation TEXT DEFAULT ''
    );
    SELECT create_hypertable('signals', 'timestamp', if_not_exists => TRUE,
        chunk_time_interval => INTERVAL '6 hours');

    -- Backtest results
    CREATE TABLE IF NOT EXISTS backtest_results (
        backtest_id TEXT PRIMARY KEY,
        symbol TEXT NOT NULL,
        strategy TEXT NOT NULL,
        start_time BIGINT NOT NULL,
        end_time BIGINT NOT NULL,
        total_return_pct DOUBLE PRECISION,
        total_trades INTEGER,
        win_rate DOUBLE PRECISION,
        profit_factor DOUBLE PRECISION,
        max_drawdown_pct DOUBLE PRECISION,
        sharpe_ratio DOUBLE PRECISION,
        final_balance DOUBLE PRECISION,
        config_json TEXT DEFAULT '',
        created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_candles_symbol_interval ON candles (symbol, interval, time DESC);
    CREATE INDEX IF NOT EXISTS idx_trades_symbol_ts ON trades (symbol, timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_signals_symbol_ts ON signals (symbol, timestamp DESC);

    -- Retention policy: keep 90 days of trades, 1 year of candles
    SELECT add_retention_policy('trades', INTERVAL '90 days', if_not_exists => TRUE);
    SELECT add_retention_policy('candles', INTERVAL '365 days', if_not_exists => TRUE);
    SELECT add_retention_policy('signals', INTERVAL '180 days', if_not_exists => TRUE);

    -- Compression
    ALTER TABLE candles SET (timescaledb.compress, timescaledb.compress_segmentby = 'symbol,interval');
    SELECT add_compression_policy('candles', INTERVAL '7 days', if_not_exists => TRUE);
    """

    def __init__(
        self,
        host: str = "localhost",
        port: int = 5432,
        username: str = "hft",
        password: str = "",
        database: str = "hft_trading",
    ):
        self.host = host
        self.port = port
        self.username = username
        self.password = password
        self.database = database
        self._pool = None

    async def initialize(self) -> None:
        try:
            import asyncpg
        except ImportError:
            logger.error("asyncpg not installed — run: pip install asyncpg")
            return

        self._pool = await asyncpg.create_pool(
            host=self.host,
            port=self.port,
            user=self.username,
            password=self.password,
            database=self.database,
            min_size=2,
            max_size=10,
        )

        async with self._pool.acquire() as conn:
            await conn.execute("CREATE EXTENSION IF NOT EXISTS timescaledb")
            await conn.execute(self.SCHEMA_SQL)

        logger.info(f"[TimescaleDB] Connected to {self.host}:{self.port}/{self.database}")

    async def close(self) -> None:
        if self._pool:
            await self._pool.close()

    async def insert_candles(self, symbol: str, interval: str, candles: list[dict]) -> int:
        if not self._pool:
            return 0

        rows = []
        for c in candles:
            rows.append((
                symbol, interval, int(c.get("time", c.get("timestamp", 0))),
                float(c["open"]), float(c["high"]), float(c["low"]),
                float(c["close"]), float(c["volume"]),
                c.get("exchange", "simulator"),
            ))

        async with self._pool.acquire() as conn:
            await conn.executemany(
                """INSERT INTO candles (symbol, interval, time, open, high, low, close, volume, exchange)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                   ON CONFLICT (symbol, interval, time, exchange) DO NOTHING""",
                rows,
            )
        return len(rows)

    async def get_candles(
        self, symbol: str, interval: str, limit: int = 500,
        start_time: int | None = None, end_time: int | None = None,
    ) -> list[dict]:
        if not self._pool:
            return []

        query = """SELECT time, open, high, low, close, volume, exchange
                   FROM candles WHERE symbol = $1 AND interval = $2"""
        params: list = [symbol, interval]

        if start_time is not None:
            query += " AND time >= $3"
            params.append(start_time)
        if end_time is not None:
            idx = len(params) + 1
            query += f" AND time <= ${idx}"
            params.append(end_time)

        query += f" ORDER BY time DESC LIMIT ${len(params) + 1}"
        params.append(limit)

        async with self._pool.acquire() as conn:
            rows = await conn.fetch(query, *params)
            return [
                {"time": r["time"], "open": r["open"], "high": r["high"],
                 "low": r["low"], "close": r["close"], "volume": r["volume"],
                 "exchange": r["exchange"]}
                for r in reversed(rows)
            ]

    async def insert_trade(self, trade: TradeRecord) -> None:
        if not self._pool:
            return
        async with self._pool.acquire() as conn:
            await conn.execute(
                """INSERT INTO trades (symbol, exchange, side, price, qty, timestamp, order_id, strategy)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8)""",
                trade.symbol, trade.exchange, trade.side, trade.price,
                trade.qty, trade.timestamp, trade.order_id, trade.strategy,
            )

    async def insert_trades_batch(self, trades: list[TradeRecord]) -> int:
        if not self._pool or not trades:
            return 0
        rows = [(t.symbol, t.exchange, t.side, t.price, t.qty, t.timestamp, t.order_id, t.strategy) for t in trades]
        async with self._pool.acquire() as conn:
            await conn.executemany(
                """INSERT INTO trades (symbol, exchange, side, price, qty, timestamp, order_id, strategy)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8)""",
                rows,
            )
        return len(rows)

    async def insert_signal(self, signal: SignalRecord) -> None:
        if not self._pool:
            return
        async with self._pool.acquire() as conn:
            await conn.execute(
                """INSERT INTO signals (symbol, strategy, signal_type, confidence, price, timestamp, explanation)
                   VALUES ($1, $2, $3, $4, $5, $6, $7)""",
                signal.symbol, signal.strategy, signal.signal_type,
                signal.confidence, signal.price, signal.timestamp, signal.explanation,
            )

    async def insert_backtest_result(self, record: BacktestRecord) -> None:
        if not self._pool:
            return
        async with self._pool.acquire() as conn:
            await conn.execute(
                """INSERT INTO backtest_results
                   (backtest_id, symbol, strategy, start_time, end_time,
                    total_return_pct, total_trades, win_rate, profit_factor,
                    max_drawdown_pct, sharpe_ratio, final_balance, config_json)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                   ON CONFLICT (backtest_id) DO UPDATE SET
                    total_return_pct = EXCLUDED.total_return_pct,
                    total_trades = EXCLUDED.total_trades,
                    win_rate = EXCLUDED.win_rate,
                    profit_factor = EXCLUDED.profit_factor,
                    max_drawdown_pct = EXCLUDED.max_drawdown_pct,
                    sharpe_ratio = EXCLUDED.sharpe_ratio,
                    final_balance = EXCLUDED.final_balance""",
                record.backtest_id, record.symbol, record.strategy,
                record.start_time, record.end_time,
                record.total_return_pct, record.total_trades,
                record.win_rate, record.profit_factor,
                record.max_drawdown_pct, record.sharpe_ratio,
                record.final_balance, record.config_json,
            )

    async def get_recent_trades(self, symbol: str, limit: int = 100) -> list[dict]:
        if not self._pool:
            return []
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(
                """SELECT * FROM trades WHERE symbol = $1
                   ORDER BY timestamp DESC LIMIT $2""",
                symbol, limit,
            )
            return [dict(r) for r in rows]

    async def get_recent_signals(self, symbol: str, limit: int = 50) -> list[dict]:
        if not self._pool:
            return []
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(
                """SELECT * FROM signals WHERE symbol = $1
                   ORDER BY timestamp DESC LIMIT $2""",
                symbol, limit,
            )
            return [dict(r) for r in rows]

    async def get_health(self) -> dict:
        if not self._pool:
            return {"connected": False}
        try:
            async with self._pool.acquire() as conn:
                val = await conn.fetchval("SELECT 1")
                return {"connected": val == 1, "host": self.host, "database": self.database}
        except Exception as e:
            return {"connected": False, "error": str(e)}
