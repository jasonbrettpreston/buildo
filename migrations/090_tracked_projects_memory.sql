-- Migration 090: CRM Memory Columns + Expanded Status
--
-- Adds "memory" columns to tracked_projects so the nightly CRM script
-- (update-tracked-projects.js) can detect state changes and avoid
-- duplicate notifications. Also expands the status CHECK to include
-- 'saved', 'claimed', and 'archived' for the two-path routing model.
--
-- SPEC LINK: docs/reports/lifecycle_phase_implementation.md

-- ═══════════════════════════════════════════════════════════════════
-- UP
-- ═══════════════════════════════════════════════════════════════════

-- Memory columns — nullable so existing rows don't need backfill.
-- last_notified_urgency: the urgency tier we last alerted on (NULL = never alerted)
-- last_notified_stalled: whether we last told the user the site is stalled
ALTER TABLE tracked_projects
  ADD COLUMN last_notified_urgency VARCHAR(50),
  ADD COLUMN last_notified_stalled BOOLEAN DEFAULT false;

-- Expand status CHECK: add 'saved', 'claimed', 'archived' for the
-- two-path routing model (saves = passive, claims = active).
-- Existing values kept for backward compatibility.
UPDATE tracked_projects SET status = 'claimed_unverified' WHERE status NOT IN (
  'saved', 'claimed_unverified', 'claimed', 'verified', 'archived', 'expired'
);

ALTER TABLE tracked_projects
  DROP CONSTRAINT chk_tracked_status,
  ADD CONSTRAINT chk_tracked_status
    CHECK (status IN (
      'saved',              -- passive watchlist (no alerts)
      'claimed_unverified', -- claimed but not verified
      'claimed',            -- actively claimed
      'verified',           -- verified claim
      'archived',           -- window closed or expired
      'expired'             -- TTL expired
    ));

-- ═══════════════════════════════════════════════════════════════════
-- DOWN
-- ═══════════════════════════════════════════════════════════════════
-- UPDATE tracked_projects SET status = 'claimed_unverified' WHERE status IN ('saved', 'claimed', 'archived');
-- ALTER TABLE tracked_projects
--   DROP CONSTRAINT chk_tracked_status,
--   ADD CONSTRAINT chk_tracked_status
--     CHECK (status IN ('claimed_unverified', 'verified', 'expired'));
-- ALTER TABLE tracked_projects DROP COLUMN IF EXISTS last_notified_stalled;
-- ALTER TABLE tracked_projects DROP COLUMN IF EXISTS last_notified_urgency;
