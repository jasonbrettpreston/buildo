-- Migration 114: user_profiles mobile columns + 3 new tables
-- SPEC LINK: docs/specs/03-mobile/95_mobile_user_profiles.md §3 Data Model, §4 New Tables

-- ============================================================
-- UP
-- ============================================================

-- Identity columns
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS phone_number TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS company_name TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS backup_email TEXT;

-- Profession / feed-scoping columns
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS default_tab TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS location_mode TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS home_base_lat NUMERIC(9,6);
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS home_base_lng NUMERIC(9,6);
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS radius_km INTEGER;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS supplier_selection TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS lead_views_count INTEGER DEFAULT 0;

-- Subscription columns
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS subscription_status TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

-- Account state columns
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS onboarding_complete BOOLEAN DEFAULT false;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS tos_accepted_at TIMESTAMPTZ;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS account_deleted_at TIMESTAMPTZ;

-- Admin-configured columns
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS account_preset TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS trade_slugs_override TEXT[];
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS radius_cap_km INTEGER;

-- CHECK constraints
ALTER TABLE user_profiles ADD CONSTRAINT chk_default_tab
  CHECK (default_tab IN ('feed', 'flight_board'));

ALTER TABLE user_profiles ADD CONSTRAINT chk_location_mode
  CHECK (location_mode IN ('gps_live', 'home_base_fixed'));

ALTER TABLE user_profiles ADD CONSTRAINT chk_subscription_status
  CHECK (subscription_status IN ('trial','active','past_due','expired','cancelled_pending_deletion','admin_managed'));

ALTER TABLE user_profiles ADD CONSTRAINT chk_account_preset
  CHECK (account_preset IN ('tradesperson','realtor','manufacturer'));

-- Location coherence: gps_live must have no coords; home_base_fixed must have coords
ALTER TABLE user_profiles ADD CONSTRAINT chk_location_mode_coords
  CHECK (
    location_mode IS NULL
    OR (location_mode = 'gps_live' AND home_base_lat IS NULL AND home_base_lng IS NULL)
    OR (location_mode = 'home_base_fixed' AND home_base_lat IS NOT NULL AND home_base_lng IS NOT NULL)
  );

-- Make trade_slug nullable (manufacturer accounts have no single trade)
ALTER TABLE user_profiles ALTER COLUMN trade_slug DROP NOT NULL;

-- Replace old NOT NULL-assuming CHECK with one that allows NULL
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_trade_slug_not_empty;
ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_trade_slug_not_empty
  CHECK (trade_slug IS NULL OR trim(trade_slug) <> '');

-- New tables

CREATE TABLE IF NOT EXISTS lead_view_events (
  user_id     TEXT NOT NULL,
  permit_num  TEXT NOT NULL,
  revision_num TEXT NOT NULL,
  viewed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, permit_num, revision_num)
);

ALTER TABLE lead_view_events
  ADD CONSTRAINT fk_lve_user
  FOREIGN KEY (user_id) REFERENCES user_profiles(user_id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS subscribe_nonces (
  nonce      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES user_profiles(user_id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '15 minutes'
);

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  event_id     TEXT PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- DOWN
-- ============================================================
-- DROP TABLE stripe_webhook_events;
-- DROP TABLE subscribe_nonces;
-- DROP TABLE lead_view_events;
-- ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_trade_slug_not_empty;
-- ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_trade_slug_not_empty CHECK (trim(trade_slug) <> '');
-- ALTER TABLE user_profiles ALTER COLUMN trade_slug SET NOT NULL;
-- ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS chk_location_mode_coords;
-- ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS chk_account_preset;
-- ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS chk_subscription_status;
-- ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS chk_location_mode;
-- ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS chk_default_tab;
-- ALTER TABLE user_profiles DROP COLUMN IF EXISTS radius_cap_km;
-- ALTER TABLE user_profiles DROP COLUMN IF EXISTS trade_slugs_override;
-- ALTER TABLE user_profiles DROP COLUMN IF EXISTS account_preset;
-- ALTER TABLE user_profiles DROP COLUMN IF EXISTS account_deleted_at;
-- ALTER TABLE user_profiles DROP COLUMN IF EXISTS tos_accepted_at;
-- ALTER TABLE user_profiles DROP COLUMN IF EXISTS onboarding_complete;
-- ALTER TABLE user_profiles DROP COLUMN IF EXISTS stripe_customer_id;
-- ALTER TABLE user_profiles DROP COLUMN IF EXISTS trial_started_at;
-- ALTER TABLE user_profiles DROP COLUMN IF EXISTS subscription_status;
-- ALTER TABLE user_profiles DROP COLUMN IF EXISTS lead_views_count;
-- ALTER TABLE user_profiles DROP COLUMN IF EXISTS supplier_selection;
-- ALTER TABLE user_profiles DROP COLUMN IF EXISTS radius_km;
-- ALTER TABLE user_profiles DROP COLUMN IF EXISTS home_base_lng;
-- ALTER TABLE user_profiles DROP COLUMN IF EXISTS home_base_lat;
-- ALTER TABLE user_profiles DROP COLUMN IF EXISTS location_mode;
-- ALTER TABLE user_profiles DROP COLUMN IF EXISTS default_tab;
-- ALTER TABLE user_profiles DROP COLUMN IF EXISTS backup_email;
-- ALTER TABLE user_profiles DROP COLUMN IF EXISTS email;
-- ALTER TABLE user_profiles DROP COLUMN IF EXISTS company_name;
-- ALTER TABLE user_profiles DROP COLUMN IF EXISTS phone_number;
-- ALTER TABLE user_profiles DROP COLUMN IF EXISTS full_name;
