-- 142: Phase C — extend `lead_id_orphan_audit` view to cover the 4
-- consumer tables now that they're backfilled + NOT NULL.
--
-- Phase B's view (migration 137) covered only the 4 Phase B tables
-- (lead_trades, lead_parcels, lifecycle_transitions, lifecycle_status_history).
-- Phase C adds cost_estimates, trade_forecasts, tracked_projects, and
-- lead_analytics — now that migrations 138-141 have promoted their
-- lead_id columns, an orphan check on them is meaningful.
--
-- Each branch LEFT JOINs both `permits` and `coa_applications` on
-- lead_id; emits the row only when BOTH parents are NULL. CREATE OR
-- REPLACE is re-runnable.
--
-- Phase G/H may drop legacy tables; this view body would then need
-- the corresponding UNION branches removed. Tracked in the orphan-audit
-- maintenance lifecycle (see Spec 42 §6.6.A.1).

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
WHERE p.lead_id IS NULL AND c.lead_id IS NULL

UNION ALL

-- Phase C consumer tables — added once their lead_id is NOT NULL.
SELECT 'cost_estimates', ce.lead_id, ce.permit_num || ':' || ce.revision_num::TEXT AS source_row_id
FROM cost_estimates ce
LEFT JOIN permits p ON ce.lead_id = p.lead_id
LEFT JOIN coa_applications c ON ce.lead_id = c.lead_id
WHERE p.lead_id IS NULL AND c.lead_id IS NULL

UNION ALL

SELECT 'trade_forecasts', tf.lead_id, tf.permit_num || ':' || tf.revision_num::TEXT || ':' || tf.trade_slug
FROM trade_forecasts tf
LEFT JOIN permits p ON tf.lead_id = p.lead_id
LEFT JOIN coa_applications c ON tf.lead_id = c.lead_id
WHERE p.lead_id IS NULL AND c.lead_id IS NULL

UNION ALL

SELECT 'tracked_projects', tp.lead_id, tp.id::TEXT
FROM tracked_projects tp
LEFT JOIN permits p ON tp.lead_id = p.lead_id
LEFT JOIN coa_applications c ON tp.lead_id = c.lead_id
WHERE tp.lead_id IS NOT NULL AND p.lead_id IS NULL AND c.lead_id IS NULL
-- tracked_projects.lead_id can legitimately be NULL during the Phase C→F
-- window for CoA-side rows; the orphan check only fires on non-NULL.

UNION ALL

SELECT 'lead_analytics', la.lead_id, la.lead_key
FROM lead_analytics la
LEFT JOIN permits p ON la.lead_id = p.lead_id
LEFT JOIN coa_applications c ON la.lead_id = c.lead_id
WHERE p.lead_id IS NULL AND c.lead_id IS NULL;

-- ═══════════════════════════════════════════════════════════════════
-- DOWN — manual rollback only, intentionally not transactional
-- (Rule 6 / commit 8b1c10b)
-- ═══════════════════════════════════════════════════════════════════
-- Reverting restores the Phase B view (migration 137 body — 4-branch
-- UNION ALL across the Phase B tables only). The 4 Phase C consumer
-- branches are dropped.
--
-- To roll back manually, re-apply migration 137's view body:
-- see migrations/137_lead_id_integrity_constraints.sql.
