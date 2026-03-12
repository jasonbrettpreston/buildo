-- UP
CREATE TABLE IF NOT EXISTS engine_health_snapshots (
  id            SERIAL PRIMARY KEY,
  table_name    TEXT NOT NULL,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  n_live_tup    BIGINT NOT NULL DEFAULT 0,
  n_dead_tup    BIGINT NOT NULL DEFAULT 0,
  dead_ratio    NUMERIC(6,4) NOT NULL DEFAULT 0,
  seq_scan      BIGINT NOT NULL DEFAULT 0,
  idx_scan      BIGINT NOT NULL DEFAULT 0,
  seq_ratio     NUMERIC(6,4) NOT NULL DEFAULT 0,
  captured_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_engine_health_table_date
  ON engine_health_snapshots (table_name, snapshot_date);

-- DOWN
DROP TABLE IF EXISTS engine_health_snapshots;
