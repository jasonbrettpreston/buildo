-- Migration 079 — lead_views covering index with INCLUDE (user_id)
-- 🔗 SPEC LINK: docs/specs/product/future/70_lead_feed.md §Database Schema
--
-- BACKGROUND:
-- Migration 070 created `idx_lead_views_lead_trade_viewed` on
-- `(lead_key, trade_slug, viewed_at)` to serve the competition-count
-- query in `record-lead-view.ts`:
--
--   SELECT COUNT(DISTINCT user_id)::text AS count
--     FROM lead_views
--    WHERE lead_key = $1
--      AND trade_slug = $2
--      AND viewed_at > NOW() - INTERVAL '30 days'
--
-- The 3-column key serves the WHERE filter as a bitmap index scan, but
-- `user_id` is NOT in the index. Postgres must then do a heap lookup
-- for each matched row to read `user_id` for the COUNT DISTINCT.
-- Caught by the Gemini deep-dive review on 2026-04-09.
--
-- THE FIX: Re-create the index with `INCLUDE (user_id)`. This is a
-- "covering index" — the user_id column is stored in the index leaf
-- pages but NOT part of the B-tree key (it doesn't affect ordering or
-- uniqueness). When the visibility map is clean (recent VACUUM),
-- Postgres can serve the query as an "Index Only Scan" — reading only
-- the index, never touching the heap.
--
-- OPERATOR RUNBOOK (per ADR 004):
--
--   CREATE INDEX CONCURRENTLY idx_lead_views_lead_trade_viewed_new
--     ON lead_views (lead_key, trade_slug, viewed_at)
--     INCLUDE (user_id);
--   DROP INDEX CONCURRENTLY idx_lead_views_lead_trade_viewed;
--   ALTER INDEX idx_lead_views_lead_trade_viewed_new
--     RENAME TO idx_lead_views_lead_trade_viewed;
--
-- The in-migration commands below use the simpler non-CONCURRENT form
-- because the table is small enough on dev to tolerate the brief lock.
-- `IF NOT EXISTS` / `IF EXISTS` make the migration a no-op once the
-- operator has done the CONCURRENT version in production.

-- UP
DROP INDEX IF EXISTS idx_lead_views_lead_trade_viewed;
CREATE INDEX IF NOT EXISTS idx_lead_views_lead_trade_viewed
  ON lead_views (lead_key, trade_slug, viewed_at)
  INCLUDE (user_id);

-- DOWN
-- DROP INDEX IF EXISTS idx_lead_views_lead_trade_viewed;
-- CREATE INDEX idx_lead_views_lead_trade_viewed
--   ON lead_views (lead_key, trade_slug, viewed_at);
