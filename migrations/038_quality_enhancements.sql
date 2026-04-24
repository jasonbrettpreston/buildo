-- Migration 038: Data Quality Dashboard Enhancements
-- Adds null tracking, violation counts, schema drift, SLA metrics to snapshots
-- Creates pipeline_schedules table for editable cadence management

-- ============================================================
-- 1. Extend data_quality_snapshots with null counts
-- ============================================================
-- UP
ALTER TABLE data_quality_snapshots
  ADD COLUMN IF NOT EXISTS null_description_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS null_builder_name_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS null_est_const_cost_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS null_street_num_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS null_street_name_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS null_geo_id_count INTEGER DEFAULT 0;

-- ============================================================
-- 2. Extend data_quality_snapshots with violation counts
-- ============================================================
ALTER TABLE data_quality_snapshots
  ADD COLUMN IF NOT EXISTS violation_cost_out_of_range INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS violation_future_issued_date INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS violation_missing_status INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS violations_total INTEGER DEFAULT 0;

-- ============================================================
-- 3. Schema drift tracking + SLA metrics
-- ============================================================
ALTER TABLE data_quality_snapshots
  ADD COLUMN IF NOT EXISTS schema_column_counts JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS sla_permits_ingestion_hours NUMERIC(8,2) DEFAULT NULL;

-- ============================================================
-- 4. pipeline_schedules table
-- ============================================================
CREATE TABLE IF NOT EXISTS pipeline_schedules (
  pipeline TEXT PRIMARY KEY,
  cadence TEXT NOT NULL DEFAULT 'Daily',
  cron_expression TEXT DEFAULT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed 21 pipeline schedule rows (idempotent via ON CONFLICT)
INSERT INTO pipeline_schedules (pipeline, cadence) VALUES
  ('permits',              'Daily'),
  ('coa',                  'Daily'),
  ('builders',             'Daily'),
  ('address_points',       'Quarterly'),
  ('parcels',              'Quarterly'),
  ('massing',              'Quarterly'),
  ('neighbourhoods',       'Annual'),
  ('geocode_permits',      'Daily'),
  ('link_parcels',         'Quarterly'),
  ('link_neighbourhoods',  'Annual'),
  ('link_massing',         'Quarterly'),
  ('link_coa',             'Daily'),
  ('enrich_google',        'Daily'),
  ('enrich_wsib',          'Daily'),
  ('classify_scope_class', 'Daily'),
  ('classify_scope_tags',  'Daily'),
  ('classify_permits',     'Daily'),
  ('compute_centroids',    'Quarterly'),
  ('link_similar',         'Daily'),
  ('create_pre_permits',   'Daily'),
  ('refresh_snapshot',     'Daily')
ON CONFLICT (pipeline) DO NOTHING;

-- DOWN
-- DROP TABLE IF EXISTS pipeline_schedules;
-- ALTER TABLE data_quality_snapshots
--   DROP COLUMN IF EXISTS sla_permits_ingestion_hours,
--   DROP COLUMN IF EXISTS schema_column_counts,
--   DROP COLUMN IF EXISTS violations_total,
--   DROP COLUMN IF EXISTS violation_missing_status,
--   DROP COLUMN IF EXISTS violation_future_issued_date,
--   DROP COLUMN IF EXISTS violation_cost_out_of_range,
--   DROP COLUMN IF EXISTS null_geo_id_count,
--   DROP COLUMN IF EXISTS null_street_name_count,
--   DROP COLUMN IF EXISTS null_street_num_count,
--   DROP COLUMN IF EXISTS null_est_const_cost_count,
--   DROP COLUMN IF EXISTS null_builder_name_count,
--   DROP COLUMN IF EXISTS null_description_count;
