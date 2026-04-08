-- Migration 076 — widen lead_views.user_id from VARCHAR(100) to VARCHAR(128)
-- 🔗 SPEC LINK: docs/specs/product/future/70_lead_feed.md §Database Schema
--
-- Fixes a latent data-integrity bug introduced by migration 070. Firebase
-- Authentication documents UIDs up to 128 characters; migration 070 declared
-- `user_id VARCHAR(100)` which silently truncates the upper range. Any user
-- with a UID > 100 chars could authenticate + create a user_profiles row
-- (migration 075 was correctly VARCHAR(128)) but every INSERT into
-- lead_views would fail — blocking view tracking and competition_count for
-- the affected users.
--
-- Caught by the Phase 2 holistic review (Gemini HIGH + DeepSeek MED +
-- Independent L2). The previous Phase 2-i triage acknowledged the gap and
-- tracked it in docs/reports/review_followups.md line 164 — this migration
-- closes that followup.
--
-- Safe: ALTER COLUMN TYPE VARCHAR(100) → VARCHAR(128) is a metadata-only
-- change on PostgreSQL (no full table rewrite) because VARCHAR length is a
-- CHECK constraint, not a storage decision.

-- UP
ALTER TABLE lead_views
  ALTER COLUMN user_id TYPE VARCHAR(128);

-- DOWN
-- ALTER TABLE lead_views
--   ALTER COLUMN user_id TYPE VARCHAR(100);
--
-- Not executed automatically — narrowing the column would truncate any
-- rows inserted with UIDs > 100 chars between the UP and a hypothetical
-- rollback, causing silent data loss. Operator must manually verify no
-- affected rows exist before narrowing.
