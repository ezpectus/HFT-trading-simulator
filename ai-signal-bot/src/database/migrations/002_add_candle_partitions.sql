-- 002_add_candle_partitions.sql — Time-series partitioning for candles
-- Converts candles to partitioned table by day

-- Drop the base candles table and recreate as partitioned
DROP TABLE IF EXISTS candles CASCADE;

CREATE TABLE candles (
    timestamp   DOUBLE PRECISION NOT NULL,
    symbol      VARCHAR(32) NOT NULL,
    exchange    VARCHAR(32) NOT NULL DEFAULT '',
    timeframe   VARCHAR(8) NOT NULL DEFAULT '1m',
    open        DOUBLE PRECISION NOT NULL,
    high        DOUBLE PRECISION NOT NULL,
    low         DOUBLE PRECISION NOT NULL,
    close       DOUBLE PRECISION NOT NULL,
    volume      DOUBLE PRECISION NOT NULL DEFAULT 0
) PARTITION BY RANGE (timestamp);

-- Create initial partitions for the next 30 days
-- Each partition covers one day (86400 seconds)
DO $$
DECLARE
    base_ts DOUBLE PRECISION;
    day_start DOUBLE PRECISION;
    day_end DOUBLE PRECISION;
    partition_name TEXT;
    i INTEGER;
BEGIN
    -- Start from current Unix timestamp, floored to day
    base_ts := FLOOR(EXTRACT(EPOCH FROM CURRENT_TIMESTAMP) / 86400) * 86400;

    FOR i IN 0..30 LOOP
        day_start := base_ts + (i * 86400);
        day_end := day_start + 86400;
        partition_name := 'candles_' || TO_CHAR(TO_TIMESTAMP(day_start), 'YYYYMMDD');

        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS %I PARTITION OF candles FOR VALUES FROM (%s) TO (%s)',
            partition_name, day_start, day_end
        );
    END LOOP;
END $$;

-- Create indexes on the partitioned table
CREATE INDEX idx_candles_symbol_ts ON candles (symbol, timestamp DESC);
CREATE INDEX idx_candles_timeframe ON candles (timeframe);

-- Retention policy function: drop partitions older than 30 days
CREATE OR REPLACE FUNCTION drop_old_candle_partitions(days_to_keep INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
    cutoff_ts DOUBLE PRECISION;
    dropped_count INTEGER := 0;
    partition_record RECORD;
BEGIN
    cutoff_ts := FLOOR(EXTRACT(EPOCH FROM CURRENT_TIMESTAMP) / 86400) * 86400 - (days_to_keep * 86400);

    FOR partition_record IN
        SELECT tablename FROM pg_tables
        WHERE tablename LIKE 'candles_%'
        AND tablename != 'candles'
    LOOP
        -- Extract date from partition name and compare
        BEGIN
            IF partition_record.tablename < 'candles_' || TO_CHAR(TO_TIMESTAMP(cutoff_ts), 'YYYYMMDD') THEN
                EXECUTE format('DROP TABLE IF EXISTS %I', partition_record.tablename);
                dropped_count := dropped_count + 1;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            -- Skip partitions with non-standard names
            CONTINUE;
        END;
    END LOOP;

    RETURN dropped_count;
END;
$$ LANGUAGE plpgsql;

-- Create a function to automatically create new partitions
CREATE OR REPLACE FUNCTION create_candle_partition_for_date(target_date TIMESTAMP)
RETURNS VOID AS $$
DECLARE
    day_start DOUBLE PRECISION;
    day_end DOUBLE PRECISION;
    partition_name TEXT;
BEGIN
    day_start := FLOOR(EXTRACT(EPOCH FROM target_date) / 86400) * 86400;
    day_end := day_start + 86400;
    partition_name := 'candles_' || TO_CHAR(TO_TIMESTAMP(day_start), 'YYYYMMDD');

    EXECUTE format(
        'CREATE TABLE IF NOT EXISTS %I PARTITION OF candles FOR VALUES FROM (%s) TO (%s)',
        partition_name, day_start, day_end
    );
END;
$$ LANGUAGE plpgsql;
