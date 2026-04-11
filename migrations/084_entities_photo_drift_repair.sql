-- Migration 084 — entities photo_url drift repair
-- 🔗 SPEC LINK: docs/specs/product/future/73_builder_leads.md §Migration needed
-- 🔗 SIBLING: migrations/083_postgis_drift_repair.sql (PostGIS drift repair)
--
-- DRIFT BACKGROUND:
-- Migration 074 is marked applied in `schema_migrations` but its
-- content never ran against the local database — same class of
-- historical drift as the PostGIS migrations (039/067/078) that
-- migration 083 just repaired. Unlike 067/078, migration 074 has NO
-- defensive guard that would explain a silent no-op; the drift was
-- introduced either by a historical DB restore that predated 074, or
-- by manual tampering with schema_migrations.
--
-- Discovered during live verification of migration 083 when
-- `/api/leads/feed` began failing with `column e.photo_url does not
-- exist` (pg code 42703) — LEAD_FEED_SQL in get-lead-feed.ts
-- references `e.photo_url` from the entities table via the builder
-- CTE, but the column didn't exist.
--
-- State before this migration:
--   entities.photo_url          — MISSING (migration 074 ADD COLUMN)
--   entities.photo_validated_at — MISSING (migration 074 ADD COLUMN)
--   entities_photo_url_https    — MISSING (migration 074 CHECK constraint)
--
-- This migration replays 074's content idempotently. 077's tighter
-- regex-based CHECK constraint (which REPLACED 074's simple LIKE
-- constraint) is ALSO missing and would need a separate sibling
-- repair — tracked in review_followups.md, out of scope here because
-- the 074 LIKE constraint is sufficient to unblock the lead feed.
--
-- PRODUCTION SAFETY:
-- On Cloud SQL (074 already applied correctly), this migration is a
-- near-no-op:
--   - ADD COLUMN IF NOT EXISTS → no-op (columns exist)
--   - CHECK constraint ADD → wrapped in a DO block that checks
--     pg_constraint for the constraint name before adding, so it's
--     idempotent (bare ALTER TABLE ADD CONSTRAINT would fail on a
--     re-run because pg doesn't support IF NOT EXISTS for constraints)
-- Net prod impact: zero. Safe.

-- UP

-- ---------------------------------------------------------------------------
-- 1. Columns (idempotent via IF NOT EXISTS)
-- ---------------------------------------------------------------------------

ALTER TABLE entities ADD COLUMN IF NOT EXISTS photo_url VARCHAR(500);
ALTER TABLE entities ADD COLUMN IF NOT EXISTS photo_validated_at TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- 2. CHECK constraint (idempotent via pg_constraint lookup)
-- ---------------------------------------------------------------------------
-- PostgreSQL does NOT support `ALTER TABLE ADD CONSTRAINT IF NOT EXISTS`,
-- so we wrap the ADD in a DO block that first checks pg_constraint for
-- the existing constraint name. Matches the pattern used in 039's FK
-- adds. Migration 074's original body added the constraint
-- unconditionally which would have failed if it ever ran twice.
DO $constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'entities_photo_url_https'
  ) THEN
    ALTER TABLE entities ADD CONSTRAINT entities_photo_url_https
      CHECK (photo_url IS NULL OR photo_url LIKE 'https://%');
  END IF;
END
$constraint$;

-- DOWN
-- ALLOW-DESTRUCTIVE
-- ALTER TABLE entities DROP CONSTRAINT IF EXISTS entities_photo_url_https;
-- ALTER TABLE entities DROP COLUMN IF EXISTS photo_validated_at;
-- ALTER TABLE entities DROP COLUMN IF EXISTS photo_url;
