-- Migration 075 — user_profiles
-- 🔗 SPEC LINK: docs/specs/product/future/70_lead_feed.md §API Endpoints
--
-- Maps Firebase UIDs to a tradesperson's selected trade. Required for the
-- spec 70 server-side trade_slug authorization check ("server compares
-- trade_slug against the authenticated user's profile trade — mismatch
-- returns 403"). Phase 2 leads routes call src/lib/auth/get-user-context.ts
-- which queries this table on every request.
--
-- - user_id is a Firebase UID, not a FK to anything (same convention as
--   lead_views.user_id from migration 070).
-- - trade_slug is NOT a FK to a trades lookup table per the codebase pattern
--   (slugs are referenced by string everywhere). The CHECK on length > 0
--   prevents empty-string drift.
-- - display_name is optional metadata so the future onboarding UI can
--   populate it without another migration.
-- - No email column — Firebase already owns identity.

-- UP
CREATE TABLE user_profiles (
  user_id      VARCHAR(100) PRIMARY KEY,
  trade_slug   VARCHAR(50)  NOT NULL,
  display_name VARCHAR(200),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT user_profiles_trade_slug_not_empty CHECK (length(trade_slug) > 0)
);

CREATE INDEX idx_user_profiles_trade_slug ON user_profiles (trade_slug);

-- DOWN
-- ALLOW-DESTRUCTIVE
-- DROP INDEX IF EXISTS idx_user_profiles_trade_slug;
-- DROP TABLE IF EXISTS user_profiles;
