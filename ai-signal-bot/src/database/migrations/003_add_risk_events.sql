-- 003_add_risk_events.sql — Risk events table

CREATE TABLE IF NOT EXISTS risk_events (
    id          BIGSERIAL PRIMARY KEY,
    timestamp   DOUBLE PRECISION NOT NULL,
    type        VARCHAR(64) NOT NULL,
    severity    VARCHAR(16) NOT NULL DEFAULT 'INFO',
    details     JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_risk_events_timestamp ON risk_events (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_risk_events_type ON risk_events (type);
CREATE INDEX IF NOT EXISTS idx_risk_events_severity ON risk_events (severity);
CREATE INDEX IF NOT EXISTS idx_risk_events_ts_severity ON risk_events (timestamp DESC, severity);
