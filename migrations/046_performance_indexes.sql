-- Migration 046: Performance indexes for cost/date filter queries
-- Addresses sequential scan bottlenecks on 237K+ permit rows

CREATE INDEX IF NOT EXISTS idx_permits_est_const_cost
  ON permits (est_const_cost);

CREATE INDEX IF NOT EXISTS idx_permits_application_date
  ON permits (application_date);

CREATE INDEX IF NOT EXISTS idx_coa_hearing_date
  ON coa_applications (hearing_date);
