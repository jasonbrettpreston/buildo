-- 137: lead_id_orphan_audit view — Phase B's substitute for a cross-table
-- foreign key on lead_id.
--
-- Spec 42 §6.6.A.1 documents why a conventional FK is impossible: lead_id
-- may point to EITHER permits.lead_id OR coa_applications.lead_id (Option C
-- polymorphic key). PostgreSQL requires a single FK target. Compensating
-- mitigations per the spec:
--   1. CHECK constraints on every lead_id column enforce format validity
--      (`'^(permit|coa):.+$'`) — already in place via migrations 124-127.
--   2. Application-layer guarantee: every writer derives lead_id via
--      `scripts/lib/leads/lead-id.js` (Spec 84 §7 dual-path).
--   3. Audit view (THIS migration): exposes every row whose lead_id
--      references no source-of-truth parent row.
--   4. CQA gate (Phase C extension to assert-data-bounds.js): fails on
--      `SELECT COUNT(*) FROM lead_id_orphan_audit > 0`.
--
-- Phase B coverage: the 4 new Phase B tables. Phase C extends the view
-- to add the 4 consumer tables (cost_estimates, trade_forecasts,
-- tracked_projects, lead_analytics) AFTER their lead_id columns are
-- backfilled by migrate-to-lead-id.js. Adding them here would produce
-- false positives — every Phase B-state NULL lead_id would orphan-flag.
--
-- Each branch LEFT JOINs both parent tables and emits the row only when
-- BOTH parents are absent (i.e., this lead_id has no source-of-truth).
-- View body is CREATE OR REPLACE so re-running the migration is a no-op
-- when the view already matches; idempotent in non-transactional mode.

-- ═══════════════════════════════════════════════════════════════════
-- UP
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW lead_id_orphan_audit AS
SELECT 'lead_trades' AS source_table, lt.lead_id, lt.id::TEXT AS source_row_id
FROM lead_trades lt
LEFT JOIN permits p ON lt.lead_id = p.lead_id
LEFT JOIN coa_applications c ON lt.lead_id = c.lead_id
WHERE p.lead_id IS NULL AND c.lead_id IS NULL

UNION ALL

SELECT 'lead_parcels', lp.lead_id, lp.lead_id || '|' || lp.parcel_id::TEXT
FROM lead_parcels lp
LEFT JOIN permits p ON lp.lead_id = p.lead_id
LEFT JOIN coa_applications c ON lp.lead_id = c.lead_id
WHERE p.lead_id IS NULL AND c.lead_id IS NULL

UNION ALL

SELECT 'lifecycle_transitions', lt.lead_id, lt.id::TEXT
FROM lifecycle_transitions lt
LEFT JOIN permits p ON lt.lead_id = p.lead_id
LEFT JOIN coa_applications c ON lt.lead_id = c.lead_id
WHERE p.lead_id IS NULL AND c.lead_id IS NULL

UNION ALL

SELECT 'lifecycle_status_history', lsh.lead_id, lsh.id::TEXT
FROM lifecycle_status_history lsh
LEFT JOIN permits p ON lsh.lead_id = p.lead_id
LEFT JOIN coa_applications c ON lsh.lead_id = c.lead_id
WHERE p.lead_id IS NULL AND c.lead_id IS NULL;
-- Phase C follow-up: extend this view to include cost_estimates,
-- trade_forecasts, tracked_projects, lead_analytics after their lead_id
-- columns are backfilled by migrate-to-lead-id.js. Adding them in Phase B
-- would produce false positives — every unpopulated lead_id would
-- orphan-flag.

-- ═══════════════════════════════════════════════════════════════════
-- DOWN — manual rollback only, intentionally not transactional
-- (Rule 6 / commit 8b1c10b)
-- ═══════════════════════════════════════════════════════════════════
-- Reverting this migration drops the orphan-audit view. The CQA gate
-- in Phase C cannot detect lead_id orphans; the audit becomes a
-- per-script ad-hoc query instead of a uniform check.
--
-- To roll back manually:
--
--   DROP VIEW IF EXISTS lead_id_orphan_audit;
