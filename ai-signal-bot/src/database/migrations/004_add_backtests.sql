-- 004_add_backtests.sql — Backtest results table

CREATE TABLE IF NOT EXISTS backtests (
    id          BIGSERIAL PRIMARY KEY,
    strategy    VARCHAR(64) NOT NULL,
    params      JSONB DEFAULT '{}'::jsonb,
    start_time  DOUBLE PRECISION NOT NULL,
    end_time    DOUBLE PRECISION NOT NULL,
    results     JSONB DEFAULT '{}'::jsonb,
    created_at  DOUBLE PRECISION NOT NULL DEFAULT EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_backtests_strategy ON backtests (strategy);
CREATE INDEX IF NOT EXISTS idx_backtests_created ON backtests (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_backtests_strategy_created ON backtests (strategy, created_at DESC);
