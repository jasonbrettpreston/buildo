-- 215_admin_watchlist.sql
-- SPEC LINK: docs/specs/02-web-admin/36_flight_center_tool.md §2
-- FK-EXEMPT
--
-- P15 (15B) — the standalone Flight Center dedicated per-admin watchlist.
-- Deliberately DECOUPLED from lead_views (Spec 36 §4): admin identity is
-- verifyAdminAuth (no single-trade user_profiles fiction), NO auto-archive
-- eviction, coa is first-class, and it never materializes a tracked_projects
-- / competition row (self-feed isolation, Spec 36 §4a).
--
-- FK-EXEMPT rationale: admin_watchlist carries permit_num/revision_num for
-- the permit arm but intentionally has NO FK to permits — it is a loose
-- curation table whose identity is lead_key, and address_snapshot preserves
-- the display even if the underlying permit/coa row is later pruned. Coa
-- rows carry NULL permit_num (second XOR arm), so a composite FK would be
-- half-applicable at best.
--
-- NOTE (validator hygiene): comments in this file avoid apostrophes — the
-- validate-migration.js string-literal blanking treats a lone apostrophe in
-- a comment as an opened string and blanks the marker comments after it.
--
-- The permits trigram index uses CREATE INDEX CONCURRENTLY (Rule 2 —
-- permits is a LARGE_TABLE); scripts/migrate.js detects CONCURRENTLY and
-- runs this file statement-by-statement (non-transactional). Every
-- statement is IF NOT EXISTS so a mid-file failure re-runs cleanly.
--
-- UP
CREATE TABLE IF NOT EXISTS admin_watchlist (
  id                     SERIAL PRIMARY KEY,
  admin_uid              VARCHAR(128) NOT NULL,
  lead_type              TEXT NOT NULL,
  lead_key               TEXT NOT NULL,
  permit_num             TEXT,
  revision_num           TEXT,
  coa_application_number TEXT,
  address_snapshot       TEXT,
  saved_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT admin_watchlist_lead_type_check
    CHECK (lead_type IN ('permit', 'coa')),
  -- XOR shape mirroring lead_views (mig 212): a permit row carries
  -- permit_num+revision_num and NULL coa; a coa row carries
  -- coa_application_number and NULL permit fields. Identity is lead_key.
  CONSTRAINT admin_watchlist_shape_check CHECK (
    (lead_type = 'permit'
       AND permit_num IS NOT NULL AND revision_num IS NOT NULL
       AND coa_application_number IS NULL)
    OR
    (lead_type = 'coa'
       AND coa_application_number IS NOT NULL
       AND permit_num IS NULL AND revision_num IS NULL)
  ),
  CONSTRAINT admin_watchlist_uid_key_uniq UNIQUE (admin_uid, lead_key)
);

-- Per-admin list read (the flight board) orders by saved_at DESC.
CREATE INDEX IF NOT EXISTS idx_admin_watchlist_uid_saved
  ON admin_watchlist (admin_uid, saved_at DESC);

-- [PF2] pg_trgm GIN indexes on the searched address expressions. The b-tree
-- does not accelerate leading-wildcard ILIKE; pg_trgm was installed in mig 053.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_permits_address_trgm
  ON permits USING gin (
    (TRIM(COALESCE(street_num, '') || ' ' || COALESCE(street_name, ''))) gin_trgm_ops
  );

CREATE INDEX IF NOT EXISTS idx_coa_applications_address_trgm
  ON coa_applications USING gin (address gin_trgm_ops);

-- DOWN
-- ALLOW-DESTRUCTIVE (rollback drops the watchlist table + its indexes)
-- DROP INDEX IF EXISTS idx_coa_applications_address_trgm;
-- DROP INDEX IF EXISTS idx_permits_address_trgm;
-- DROP INDEX IF EXISTS idx_admin_watchlist_uid_saved;
-- DROP TABLE IF EXISTS admin_watchlist;
