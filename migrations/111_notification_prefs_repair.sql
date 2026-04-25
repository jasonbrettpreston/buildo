-- Migration 111 — notification_prefs_repair
-- SPEC LINK: docs/specs/03-mobile/92_mobile_engagement_hardware.md §2.3
--
-- Migration 108 (notification_prefs) shows as applied in schema_migrations but
-- the column is absent from user_profiles in the running DB. This repair migration
-- re-adds it idempotently using ADD COLUMN IF NOT EXISTS so it is safe to run
-- regardless of whether the column is already present.

-- UP
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS notification_prefs JSONB NOT NULL DEFAULT '{
    "new_lead_min_cost_tier": "medium",
    "phase_changed": true,
    "lifecycle_stalled": true,
    "start_date_urgent": true,
    "notification_schedule": "anytime"
  }'::jsonb;

-- DOWN
-- ALLOW-DESTRUCTIVE
ALTER TABLE user_profiles DROP COLUMN IF EXISTS notification_prefs;
