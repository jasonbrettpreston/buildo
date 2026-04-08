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
-- VARCHAR(128) matches Firebase Authentication's documented max UID length
-- (28 chars typical, up to 128). lead_views.user_id is VARCHAR(100) — that's
-- a pre-existing inconsistency tracked in followups; this column uses the
-- correct width.
CREATE TABLE user_profiles (
  user_id      VARCHAR(128) PRIMARY KEY,
  trade_slug   VARCHAR(50)  NOT NULL,
  display_name VARCHAR(200),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  -- trim() <> '' rejects whitespace-only slugs in addition to the empty string
  CONSTRAINT user_profiles_trade_slug_not_empty CHECK (trim(trade_slug) <> '')
);

-- No secondary indexes — the only Phase 2 query path is `WHERE user_id = $1`
-- which uses the primary key. A trade_slug index was considered but no
-- query needs it yet; can be added in a future migration if a "list users
-- by trade" feature ships.

-- DOWN
-- ALLOW-DESTRUCTIVE
-- DROP TABLE IF EXISTS user_profiles;
