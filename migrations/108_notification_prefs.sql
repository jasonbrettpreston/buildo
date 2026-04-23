-- Migration 108 — notification_prefs
-- SPEC LINK: docs/specs/03-mobile/92_mobile_engagement_hardware.md §2.3
--
-- Adds notification_prefs JSONB column to user_profiles.
-- Default enables all alert types with "anytime" schedule — safe for
-- existing users who haven't visited settings yet.

-- UP
ALTER TABLE user_profiles
  ADD COLUMN notification_prefs JSONB NOT NULL DEFAULT '{
    "new_lead_min_cost_tier": "medium",
    "phase_changed": true,
    "lifecycle_stalled": true,
    "start_date_urgent": true,
    "notification_schedule": "anytime"
  }'::jsonb;

-- DOWN
-- ALLOW-DESTRUCTIVE
ALTER TABLE user_profiles DROP COLUMN IF EXISTS notification_prefs;
