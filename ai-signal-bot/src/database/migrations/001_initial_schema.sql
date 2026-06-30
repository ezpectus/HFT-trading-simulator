-- 001_initial_schema.sql — Initial database schema
-- Tables: trades, signals, positions, candles

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Trades table ───
CREATE TABLE IF NOT EXISTS trades (
    id          BIGSERIAL PRIMARY KEY,
    timestamp   DOUBLE PRECISION NOT NULL,
    symbol      VARCHAR(32) NOT NULL,
    exchange    VARCHAR(32) NOT NULL DEFAULT '',
    side        VARCHAR(8) NOT NULL,
    qty         DOUBLE PRECISION NOT NULL,
    price       DOUBLE PRECISION NOT NULL,
    fee         DOUBLE PRECISION DEFAULT 0,
    pnl         DOUBLE PRECISION DEFAULT 0,
    strategy    VARCHAR(64) DEFAULT '',
    order_id    VARCHAR(64) DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_trades_timestamp ON trades (timestamp);
CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades (symbol);
CREATE INDEX IF NOT EXISTS idx_trades_strategy ON trades (strategy);
CREATE INDEX IF NOT EXISTS idx_trades_symbol_ts ON trades (symbol, timestamp DESC);

-- ─── Signals table ───
CREATE TABLE IF NOT EXISTS signals (
    id          BIGSERIAL PRIMARY KEY,
    timestamp   DOUBLE PRECISION NOT NULL,
    symbol      VARCHAR(32) NOT NULL,
    strategy    VARCHAR(64) NOT NULL,
    action      VARCHAR(16) NOT NULL,
    confidence  DOUBLE PRECISION DEFAULT 0,
    price       DOUBLE PRECISION DEFAULT 0,
    sl          DOUBLE PRECISION DEFAULT 0,
    tp          DOUBLE PRECISION DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_signals_timestamp ON signals (timestamp);
CREATE INDEX IF NOT EXISTS idx_signals_symbol ON signals (symbol);
CREATE INDEX IF NOT EXISTS idx_signals_strategy ON signals (strategy);

-- ─── Positions table ───
CREATE TABLE IF NOT EXISTS positions (
    id              BIGSERIAL PRIMARY KEY,
    timestamp       DOUBLE PRECISION NOT NULL,
    symbol          VARCHAR(32) NOT NULL,
    exchange        VARCHAR(32) DEFAULT '',
    side            VARCHAR(8) NOT NULL,
    qty             DOUBLE PRECISION NOT NULL,
    entry_price     DOUBLE PRECISION NOT NULL,
    current_price   DOUBLE PRECISION DEFAULT 0,
    unrealized_pnl  DOUBLE PRECISION DEFAULT 0,
    margin          DOUBLE PRECISION DEFAULT 0,
    leverage        INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_positions_timestamp ON positions (timestamp);
CREATE INDEX IF NOT EXISTS idx_positions_symbol ON positions (symbol);

-- ─── Candles table (base — partitioned in 002) ───
CREATE TABLE IF NOT EXISTS candles (
    timestamp   DOUBLE PRECISION NOT NULL,
    symbol      VARCHAR(32) NOT NULL,
    exchange    VARCHAR(32) NOT NULL DEFAULT '',
    timeframe   VARCHAR(8) NOT NULL DEFAULT '1m',
    open        DOUBLE PRECISION NOT NULL,
    high        DOUBLE PRECISION NOT NULL,
    low         DOUBLE PRECISION NOT NULL,
    close       DOUBLE PRECISION NOT NULL,
    volume      DOUBLE PRECISION NOT NULL DEFAULT 0,
    PRIMARY KEY (timestamp, symbol, exchange, timeframe)
);

CREATE INDEX IF NOT EXISTS idx_candles_symbol_ts ON candles (symbol, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_candles_timeframe ON candles (timeframe);
