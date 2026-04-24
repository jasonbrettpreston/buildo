-- Migration 046: Performance indexes for cost/date filter queries
-- Addresses sequential scan bottlenecks on 237K+ permit rows
-- CONCURRENTLY-EXEMPT: indexes created before CONCURRENTLY was required; ran during initial data load window.

-- UP
CREATE INDEX IF NOT EXISTS idx_permits_est_const_cost
  ON permits (est_const_cost);

CREATE INDEX IF NOT EXISTS idx_permits_application_date
  ON permits (application_date);

CREATE INDEX IF NOT EXISTS idx_coa_hearing_date
  ON coa_applications (hearing_date);

-- DOWN
DROP INDEX IF EXISTS idx_coa_hearing_date;
DROP INDEX IF EXISTS idx_permits_application_date;
DROP INDEX IF EXISTS idx_permits_est_const_cost;
