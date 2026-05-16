-- migrations/153_tracked_projects_relax_for_coa.sql
-- SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.6.B Option C
-- SPEC LINK: docs/specs/01-pipeline/82_crm_assistant_alerts.md §4 CoA Lead Handling
-- SPEC LINK: docs/specs/01-pipeline/84_lifecycle_phase_engine.md §6.11 Phase F.2
--
-- Relaxes tracked_projects schema so CoA-only leads can be inserted:
--   1. Drop FK fk_tracked_projects_permits (CoA leads have no permits row)
--   2. Make permit_num + revision_num nullable (metadata-only)
--   3. Add partial UNIQUE INDEX uq_tracked_user_coa_trade (Gemini CRIT + DeepSeek MED convergent)
--   4. Add notified_decision_rendered BOOLEAN column (Gemini + DeepSeek + Independent HIGH convergent —
--      dedicated dedup flag for COA_DECISION_RENDERED, replaces v1 overload of last_notified_urgency)
-- Mirrors mig 151 pattern; all changes metadata-only — no table rewrite.

-- ============================================================================
-- UP
-- ============================================================================
BEGIN;

-- 1. Drop FK (CoA leads have no permits row to reference; the chk_tracked_projects_lead_id_format
--    CHECK still enforces lead_id format; tracked_projects.lead_id is the canonical anchor).
ALTER TABLE tracked_projects DROP CONSTRAINT IF EXISTS fk_tracked_projects_permits;

-- 2. Relax NOT NULL on legacy permit-side anchors (metadata-only — DROP NOT NULL doesn't scan).
ALTER TABLE tracked_projects ALTER COLUMN permit_num DROP NOT NULL;
ALTER TABLE tracked_projects ALTER COLUMN revision_num DROP NOT NULL;

-- 3. CoA partial UNIQUE (v2 CRIT-B convergent fix). The existing uq_tracked_user_permit_trade
--    on (user_id, permit_num, revision_num, trade_slug) does NOT dedup CoA rows because
--    PostgreSQL treats two NULLs in the key as NOT equal — a user could claim the same CoA
--    lead multiple times for the same trade.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tracked_user_coa_trade
  ON tracked_projects (user_id, lead_id, trade_slug)
  WHERE lead_id LIKE 'coa:%';

-- 4. notified_decision_rendered column (v2 CRIT-G convergent fix). Dedicated BOOLEAN dedup flag
--    for COA_DECISION_RENDERED, prevents the v1 state-machine bug where setting
--    last_notified_urgency='decision_rendered' froze the urgency column permanently.
ALTER TABLE tracked_projects
  ADD COLUMN IF NOT EXISTS notified_decision_rendered BOOLEAN NOT NULL DEFAULT FALSE;

COMMIT;

-- ============================================================================
-- DOWN — comment-only per Rule 6 (matches mig 132/138/140/142/145/147/148/150/151/152 convention).
-- Operator runs manually only on rollback. v4 HIGH-HH fold: broad DELETE covers any CoA row,
-- not just NULL-keyed ones.
-- ============================================================================
-- BEGIN;
--   -- (1) Drop the v3-CoA partial UNIQUE.
--   DROP INDEX IF EXISTS uq_tracked_user_coa_trade;
--
--   -- (2) Drop the v2 BOOLEAN column.
--   ALTER TABLE tracked_projects DROP COLUMN IF EXISTS notified_decision_rendered;
--
--   -- (3) DESTRUCTIVE: drop ALL CoA-only rows produced post-F.2 (v4 HIGH-HH fold — broad DELETE
--   --     covers any CoA-typed lead, not just NULL-keyed ones).
--   DELETE FROM tracked_projects WHERE lead_id LIKE 'coa:%';
--
--   -- (4) Re-promote permit_num + revision_num to NOT NULL.
--   ALTER TABLE tracked_projects ALTER COLUMN permit_num SET NOT NULL;
--   ALTER TABLE tracked_projects ALTER COLUMN revision_num SET NOT NULL;
--
--   -- (5) Re-add the FK.
--   ALTER TABLE tracked_projects ADD CONSTRAINT fk_tracked_projects_permits
--     FOREIGN KEY (permit_num, revision_num) REFERENCES permits(permit_num, revision_num) ON DELETE CASCADE;
-- COMMIT;
