"""
PostgreSQL persistence layer — async connection pool, prepared statements,
time-series partitioning for candles.

Tables: trades, signals, positions, candles, backtests
Uses asyncpg for non-blocking async database access.
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)

try:
    import asyncpg
    HAS_ASYNCPG = True
except ImportError:
    HAS_ASYNCPG = False
    logger.warning("asyncpg not installed — database persistence disabled")


# ─────────────────────────────────────────────────────────────────────────────
# Schema DDL
# ─────────────────────────────────────────────────────────────────────────────

SCHEMA_SQL = """
-- Trades table — closed positions
CREATE TABLE IF NOT EXISTS trades (
    id              BIGSERIAL PRIMARY KEY,
    exchange        VARCHAR(16) NOT NULL,
    symbol          VARCHAR(32) NOT NULL,
    side            VARCHAR(8)  NOT NULL,  -- LONG / SHORT
    entry_price     DOUBLE PRECISION NOT NULL,
    exit_price      DOUBLE PRECISION NOT NULL,
    quantity        DOUBLE PRECISION NOT NULL,
    pnl             DOUBLE PRECISION NOT NULL,
    fee             DOUBLE PRECISION DEFAULT 0,
    reason          VARCHAR(32),           -- TAKE_PROFIT, STOP_LOSS, MANUAL, LIQUIDATION
    leverage        INT DEFAULT 1,
    opened_at       TIMESTAMPTZ NOT NULL,
    closed_at       TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(symbol);
CREATE INDEX IF NOT EXISTS idx_trades_closed_at ON trades(closed_at DESC);
CREATE INDEX IF NOT EXISTS idx_trades_exchange ON trades(exchange);

-- Signals table — AI signals generated
CREATE TABLE IF NOT EXISTS signals (
    id              BIGSERIAL PRIMARY KEY,
    symbol          VARCHAR(32) NOT NULL,
    direction       VARCHAR(8)  NOT NULL,  -- LONG / SHORT / NEUTRAL
    confidence      REAL NOT NULL,
    entry_price     DOUBLE PRECISION,
    stop_loss       DOUBLE PRECISION,
    take_profit     DOUBLE PRECISION,
    leverage        INT DEFAULT 1,
    reason          TEXT,
    composite_score REAL,
    ema_score       REAL,
    rsi_score       REAL,
    obi_score       REAL,
    vwap_score      REAL,
    adx_score       REAL,
    pressure_score  REAL,
    timestamp       TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_signals_symbol ON signals(symbol);
CREATE INDEX IF NOT EXISTS idx_signals_timestamp ON signals(timestamp DESC);

-- Positions table — current open positions (upserted)
CREATE TABLE IF NOT EXISTS positions (
    id              BIGSERIAL PRIMARY KEY,
    exchange        VARCHAR(16) NOT NULL,
    symbol          VARCHAR(32) NOT NULL,
    side            VARCHAR(8)  NOT NULL,
    size            DOUBLE PRECISION NOT NULL,
    entry_price     DOUBLE PRECISION NOT NULL,
    mark_price      DOUBLE PRECISION NOT NULL,
    unrealized_pnl  DOUBLE PRECISION NOT NULL,
    leverage        INT DEFAULT 1,
    margin          DOUBLE PRECISION DEFAULT 0,
    liq_price       DOUBLE PRECISION DEFAULT 0,
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(exchange, symbol)
);

-- Candles table — time-series market data (partitioned by month)
CREATE TABLE IF NOT EXISTS candles (
    id              BIGSERIAL,
    exchange        VARCHAR(16) NOT NULL,
    symbol          VARCHAR(32) NOT NULL,
    interval        VARCHAR(8)  NOT NULL,  -- 1m, 5m, 15m, 1h, 4h, 1d
    open            DOUBLE PRECISION NOT NULL,
    high            DOUBLE PRECISION NOT NULL,
    low             DOUBLE PRECISION NOT NULL,
    close           DOUBLE PRECISION NOT NULL,
    volume          DOUBLE PRECISION NOT NULL,
    time            TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (id, time)
) PARTITION BY RANGE (time);

-- Create default partition (catches all dates not covered by specific partitions)
CREATE TABLE IF NOT EXISTS candles_default PARTITION OF candles DEFAULT;

-- Create default partitions for current and next month
-- (In production, use pg_partman for automatic partition management)

-- Backtests table — backtest results
CREATE TABLE IF NOT EXISTS backtests (
    id              BIGSERIAL PRIMARY KEY,
    strategy_name   VARCHAR(64) NOT NULL,
    symbol          VARCHAR(32) NOT NULL,
    start_date      TIMESTAMPTZ NOT NULL,
    end_date        TIMESTAMPTZ NOT NULL,
    initial_balance DOUBLE PRECISION NOT NULL,
    final_balance   DOUBLE PRECISION NOT NULL,
    total_return    DOUBLE PRECISION NOT NULL,
    max_drawdown    DOUBLE PRECISION NOT NULL,
    sharpe_ratio    DOUBLE PRECISION,
    total_trades    INT NOT NULL,
    win_rate        REAL NOT NULL,
    config_json     JSONB,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
"""


class Database:
    """PostgreSQL persistence layer with async connection pool."""

    def __init__(self, dsn: str = "postgresql://trader:trader@localhost:5432/trading",
                 min_pool: int = 2, max_pool: int = 10):
        self.dsn = dsn
        self.min_pool = min_pool
        self.max_pool = max_pool
        self._pool: Any | None = None  # asyncpg.Pool

    async def connect(self) -> bool:
        """Initialize connection pool and create schema."""
        if not HAS_ASYNCPG:
            logger.warning("asyncpg not available — skipping database connection")
            return False

        try:
            self._pool = await asyncpg.create_pool(
                dsn=self.dsn,
                min_size=self.min_pool,
                max_size=self.max_pool,
                command_timeout=30,
            )

            # Create schema
            async with self._pool.acquire() as conn:
                await conn.execute(SCHEMA_SQL)

            logger.info(f"Database connected: {self.dsn}")
            return True

        except Exception as e:
            logger.error(f"Database connection failed: {e}")
            return False

    async def disconnect(self):
        """Close connection pool."""
        if self._pool:
            await self._pool.close()
            self._pool = None
            logger.info("Database disconnected")

    async def insert_trade(self, trade: dict) -> int | None:
        """Insert a closed trade."""
        if not self._pool:
            return None
        try:
            async with self._pool.acquire() as conn:
                trade_id = await conn.fetchrow(
                    """INSERT INTO trades (exchange, symbol, side, entry_price, exit_price,
                       quantity, pnl, fee, reason, leverage, opened_at, closed_at)
                       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                       RETURNING id""",
                    trade.get("exchange", ""),
                    trade.get("symbol", ""),
                    trade.get("side", ""),
                    float(trade.get("entry_price", 0)),
                    float(trade.get("exit_price", 0)),
                    float(trade.get("quantity", 0)),
                    float(trade.get("pnl", 0)),
                    float(trade.get("fee", 0)),
                    trade.get("reason", ""),
                    int(trade.get("leverage", 1)),
                    trade.get("opened_at"),
                    trade.get("closed_at"),
                )
                return trade_id["id"] if trade_id else None
        except Exception as e:
            logger.error(f"Failed to insert trade: {e}")
            return None

    async def insert_signal(self, signal: dict) -> int | None:
        """Insert an AI signal."""
        if not self._pool:
            return None
        try:
            async with self._pool.acquire() as conn:
                signal_id = await conn.fetchrow(
                    """INSERT INTO signals (symbol, direction, confidence, entry_price,
                       stop_loss, take_profit, leverage, reason, composite_score,
                       ema_score, rsi_score, obi_score, vwap_score, adx_score,
                       pressure_score, timestamp)
                       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
                       RETURNING id""",
                    signal.get("symbol", ""),
                    signal.get("direction", ""),
                    float(signal.get("confidence", 0)),
                    float(signal.get("entry_price", 0)),
                    float(signal.get("stop_loss", 0)),
                    float(signal.get("take_profit", 0)),
                    int(signal.get("leverage", 1)),
                    signal.get("reason", ""),
                    float(signal.get("composite_score", 0)),
                    float(signal.get("ema_score", 0)),
                    float(signal.get("rsi_score", 0)),
                    float(signal.get("obi_score", 0)),
                    float(signal.get("vwap_score", 0)),
                    float(signal.get("adx_score", 0)),
                    float(signal.get("pressure_score", 0)),
                    signal.get("timestamp"),
                )
                return signal_id["id"] if signal_id else None
        except Exception as e:
            logger.error(f"Failed to insert signal: {e}")
            return None

    async def upsert_position(self, position: dict):
        """Upsert current position state."""
        if not self._pool:
            return
        try:
            async with self._pool.acquire() as conn:
                await conn.execute(
                    """INSERT INTO positions (exchange, symbol, side, size, entry_price,
                       mark_price, unrealized_pnl, leverage, margin, liq_price, updated_at)
                       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
                       ON CONFLICT (exchange, symbol)
                       DO UPDATE SET side=$3, size=$4, mark_price=$6,
                       unrealized_pnl=$7, margin=$9, liq_price=$10, updated_at=NOW()""",
                    position.get("exchange", ""),
                    position.get("symbol", ""),
                    position.get("side", ""),
                    float(position.get("size", 0)),
                    float(position.get("entry_price", 0)),
                    float(position.get("mark_price", 0)),
                    float(position.get("unrealized_pnl", 0)),
                    int(position.get("leverage", 1)),
                    float(position.get("margin", 0)),
                    float(position.get("liq_price", 0)),
                )
        except Exception as e:
            logger.error(f"Failed to upsert position: {e}")

    async def delete_position(self, exchange: str, symbol: str):
        """Delete a closed position."""
        if not self._pool:
            return
        try:
            async with self._pool.acquire() as conn:
                await conn.execute(
                    "DELETE FROM positions WHERE exchange=$1 AND symbol=$2",
                    exchange, symbol
                )
        except Exception as e:
            logger.error(f"Failed to delete position: {e}")

    async def insert_candle(self, candle: dict):
        """Insert a market candle."""
        if not self._pool:
            return
        try:
            async with self._pool.acquire() as conn:
                await conn.execute(
                    """INSERT INTO candles (exchange, symbol, interval, open, high, low, close, volume, time)
                       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                       ON CONFLICT DO NOTHING""",
                    candle.get("exchange", ""),
                    candle.get("symbol", ""),
                    candle.get("interval", "1m"),
                    float(candle.get("open", 0)),
                    float(candle.get("high", 0)),
                    float(candle.get("low", 0)),
                    float(candle.get("close", 0)),
                    float(candle.get("volume", 0)),
                    candle.get("time"),
                )
        except Exception as e:
            logger.error(f"Failed to insert candle: {e}")

    async def insert_candles_batch(self, candles: list[dict]):
        """Batch insert candles for efficiency."""
        if not self._pool or not candles:
            return
        try:
            async with self._pool.acquire() as conn:
                records = [
                    (c.get("exchange", ""), c.get("symbol", ""), c.get("interval", "1m"),
                     float(c.get("open", 0)), float(c.get("high", 0)),
                     float(c.get("low", 0)), float(c.get("close", 0)),
                     float(c.get("volume", 0)), c.get("time"))
                    for c in candles
                ]
                await conn.executemany(
                    """INSERT INTO candles (exchange, symbol, interval, open, high, low, close, volume, time)
                       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                       ON CONFLICT DO NOTHING""",
                    records
                )
        except Exception as e:
            logger.error(f"Failed to batch insert candles: {e}")

    async def get_trades(self, limit: int = 100, offset: int = 0) -> list[dict]:
        """Query recent trades."""
        if not self._pool:
            return []
        try:
            async with self._pool.acquire() as conn:
                rows = await conn.fetch(
                    "SELECT * FROM trades ORDER BY closed_at DESC LIMIT $1 OFFSET $2",
                    limit, offset
                )
                return [dict(r) for r in rows]
        except Exception as e:
            logger.error(f"Failed to query trades: {e}")
            return []

    async def get_daily_pnl(self) -> dict:
        """Get daily PnL summary."""
        if not self._pool:
            return {}
        try:
            async with self._pool.acquire() as conn:
                rows = await conn.fetch(
                    """SELECT DATE(closed_at) as date,
                              SUM(pnl) as total_pnl,
                              COUNT(*) as trade_count,
                              SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as wins
                       FROM trades
                       WHERE closed_at > NOW() - INTERVAL '30 days'
                       GROUP BY DATE(closed_at)
                       ORDER BY date DESC"""
                )
                return {str(r["date"]): {
                    "pnl": float(r["total_pnl"]),
                    "trades": int(r["trade_count"]),
                    "wins": int(r["wins"]),
                } for r in rows}
        except Exception as e:
            logger.error(f"Failed to get daily PnL: {e}")
            return {}

    async def insert_backtest(self, bt: dict) -> int | None:
        """Insert backtest results."""
        if not self._pool:
            return None
        try:
            import json
            async with self._pool.acquire() as conn:
                bt_id = await conn.fetchrow(
                    """INSERT INTO backtests (strategy_name, symbol, start_date, end_date,
                       initial_balance, final_balance, total_return, max_drawdown,
                       sharpe_ratio, total_trades, win_rate, config_json)
                       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                       RETURNING id""",
                    bt.get("strategy_name", ""),
                    bt.get("symbol", ""),
                    bt.get("start_date"),
                    bt.get("end_date"),
                    float(bt.get("initial_balance", 0)),
                    float(bt.get("final_balance", 0)),
                    float(bt.get("total_return", 0)),
                    float(bt.get("max_drawdown", 0)),
                    float(bt.get("sharpe_ratio", 0)),
                    int(bt.get("total_trades", 0)),
                    float(bt.get("win_rate", 0)),
                    json.dumps(bt.get("config", {})),
                )
                return bt_id["id"] if bt_id else None
        except Exception as e:
            logger.error(f"Failed to insert backtest: {e}")
            return None
