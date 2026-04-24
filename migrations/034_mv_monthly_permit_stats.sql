-- Migration 034: Materialized view for monthly permit statistics
-- Pre-aggregates permit counts and construction value by month and permit_type
-- for the Market Metrics dashboard. Refresh nightly or on demand.

-- UP
DROP MATERIALIZED VIEW IF EXISTS mv_monthly_permit_stats;

CREATE MATERIALIZED VIEW mv_monthly_permit_stats AS
SELECT
  date_trunc('month', issued_date)::date AS month,
  permit_type,
  COUNT(*)::int AS permit_count,
  COALESCE(SUM(est_const_cost), 0)::bigint AS total_value
FROM permits
WHERE issued_date IS NOT NULL
GROUP BY date_trunc('month', issued_date), permit_type;

CREATE UNIQUE INDEX idx_mv_monthly_month_type
  ON mv_monthly_permit_stats (month, permit_type);

-- DOWN
-- DROP MATERIALIZED VIEW IF EXISTS mv_monthly_permit_stats;
