-- Migration 078 — expression GIST index on (location::geography)
-- 🔗 SPEC LINK: docs/specs/product/future/70_lead_feed.md §Database Schema
-- 🔗 ADR: docs/adr/004-manual-create-index-concurrently.md
--
-- BACKGROUND:
-- Migration 067 created `permits.location` as `geometry(Point, 4326)` and
-- built `idx_permits_location_gist` on the geometry-typed column. Every
-- feed query (`get-lead-feed.ts`, `builder-query.ts`) casts to geography
-- at runtime: `ST_DWithin(p.location::geography, ..., $radius_m)`. This
-- cast is REQUIRED for correctness (the radius arg is meters per spec 70;
-- geometry-typed ST_DWithin would interpret it as degrees ≈ 111 km).
--
-- THE BUG: PostGIS's geometry GIST operator class and geography GIST
-- operator class are DIFFERENT. A geometry GIST index cannot serve an
-- ST_DWithin with geography arguments. The planner falls back to a
-- sequential scan of all 237K+ permit rows on every feed query — caught
-- by the Gemini deep-dive review on 2026-04-09.
--
-- THE FIX: An EXPRESSION INDEX on `(location::geography)`. Postgres can
-- match the query's cast expression to the index expression and use the
-- geography GIST operator class. No table rewrite, no data change —
-- just a new index that the planner can consume.
--
-- ALTERNATIVE (rejected): ALTER TABLE permits ALTER COLUMN location TYPE
-- geography(Point, 4326). Equivalent query-plan outcome but triggers a
-- full table rewrite on 237K rows, locking the table for minutes.
--
-- OPERATOR RUNBOOK (per ADR 004): CREATE INDEX CONCURRENTLY must be run
-- OUT-OF-BAND before this migration deploys. The IF NOT EXISTS makes the
-- in-migration CREATE a no-op once the operator has done their job:
--
--   CREATE INDEX CONCURRENTLY idx_permits_location_geography_gist
--     ON permits USING GIST ((location::geography));
--
-- NOTE: The double parentheses around `(location::geography)` are
-- REQUIRED by PostgreSQL's expression-index parser. A single set of
-- parens would be interpreted as a column-name, not an expression.
-- The old idx_permits_location_gist (geometry-typed) stays in place
-- because other queries may still use it for non-distance operations
-- (ST_Intersects, ST_Contains, etc.) — keeping both costs only the
-- index storage.

-- UP
-- The CREATE INDEX is wrapped in EXECUTE inside a DO block because
-- scripts/migrate.js executes each migration file as a single
-- multi-statement query, which prevents bare `CREATE INDEX
-- CONCURRENTLY` from running. The pattern mirrors migration 067:
-- operators run the CONCURRENTLY variant out-of-band in production
-- (see OPERATOR RUNBOOK above) so the IF NOT EXISTS here becomes a
-- no-op; dev environments on fresh schemas take the brief lock.
DO $mig$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
    RAISE NOTICE 'PostGIS not installed — skipping geography expression index';
    RETURN;
  END IF;
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_permits_location_geography_gist
           ON permits USING GIST ((location::geography))';
END
$mig$;

-- DOWN
-- DROP INDEX IF EXISTS idx_permits_location_geography_gist;
