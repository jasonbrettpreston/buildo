-- 002_permit_history.sql
-- Change tracking: one row per field that changed between sync runs.

CREATE TABLE IF NOT EXISTS permit_history (
    id              SERIAL          PRIMARY KEY,
    permit_num      VARCHAR(30)     NOT NULL,
    revision_num    VARCHAR(10)     NOT NULL,
    sync_run_id     INTEGER,
    field_name      VARCHAR(100)    NOT NULL,
    old_value       TEXT,
    new_value       TEXT,
    changed_at      TIMESTAMP       NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_permit_history_permit
    ON permit_history (permit_num, revision_num);

CREATE INDEX IF NOT EXISTS idx_permit_history_sync_run
    ON permit_history (sync_run_id);
