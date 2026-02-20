-- 003_sync_runs.sql
-- Audit log for every data-sync execution against Toronto Open Data.

CREATE TABLE IF NOT EXISTS sync_runs (
    id                  SERIAL          PRIMARY KEY,
    started_at          TIMESTAMP       NOT NULL DEFAULT NOW(),
    completed_at        TIMESTAMP,
    status              VARCHAR(20)     NOT NULL DEFAULT 'running',
    records_total       INTEGER         NOT NULL DEFAULT 0,
    records_new         INTEGER         NOT NULL DEFAULT 0,
    records_updated     INTEGER         NOT NULL DEFAULT 0,
    records_unchanged   INTEGER         NOT NULL DEFAULT 0,
    records_errors      INTEGER         NOT NULL DEFAULT 0,
    error_message       TEXT,
    snapshot_path       VARCHAR(500),
    duration_ms         INTEGER
);
