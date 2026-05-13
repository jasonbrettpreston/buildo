-- 136: Phase B logic_variables seed — 5 standalone CoA + retention +
-- orphan-audit + preflight keys.
--
-- The original draft also tried to seed 330 seq-level distribution band
-- keys (110 × 3: _min, _max, _sample_size_threshold) with NULL values.
-- Removed during R6 CI hotfix for two reasons:
--   1. logic_variables.variable_value is DECIMAL NOT NULL (migration 092);
--      NULL inserts fail at the column constraint.
--   2. _sample_size_threshold values are enum strings ('tight'|'moderate'
--      |'loose'|'info_only') — DECIMAL can't store them at all.
--
-- The 330 band keys are now Phase E's responsibility. The recalibration
-- script in Phase E uses INSERT … ON CONFLICT DO UPDATE to populate each
-- key with the actual calibrated value once observed on staging-shape
-- data. Until then, assert-lifecycle-phase-distribution.js falls through
-- on missing keys (skips the gate for that seq).
--
-- The sample_size_threshold tier-selector encoding is also deferred to
-- Phase E — likely a separate small table mapping seq → tier, since the
-- DECIMAL constraint on logic_variables can't carry the enum.
--
-- Consumed by:
--   * Phase F update-tracked-projects.js — CoA stall + imminent thresholds
--   * Phase B preflight (lead-id-schema-parity.infra.test.ts) — revision_num max length
--   * Phase C assert-data-bounds.js — orphan-audit warn threshold
--   * Phase F (lifecycle history retention sweep) — retention days
--
-- ON CONFLICT (variable_key) DO NOTHING: re-runs are no-ops; operator-
-- tuned values already present in the DB are preserved (consistent with
-- migration 119 + 121 pattern).

-- ═══════════════════════════════════════════════════════════════════
-- UP
-- ═══════════════════════════════════════════════════════════════════

INSERT INTO logic_variables (variable_key, variable_value, description) VALUES
  ('lifecycle_status_history_retention_days', 1825, 'Default 5 years per Spec 86 §1; lifecycle_status_history rows older than this can be archived'),
  ('coa_stall_threshold_p2_days', 90, 'Per Spec 82 — CoA at Hearing Scheduled status this many days fires a stall alert'),
  ('coa_imminent_window_days', 7, 'Per Spec 82 — CoA hearing_date within this many days fires imminent-alert'),
  ('coa_orphan_lead_id_warn_threshold', 0, 'Spec 42 §6.6.A.1 CQA gate — lead_id_orphan_audit row count must be 0; >0 = FAIL'),
  ('phase_b_revision_num_max_length', 2, 'Phase B preflight — MAX(LENGTH(revision_num)) on permits; surface for review if exceeded')
ON CONFLICT (variable_key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════
-- DOWN — manual rollback only, intentionally not transactional
-- (Rule 6 / commit 8b1c10b)
-- ═══════════════════════════════════════════════════════════════════
-- Reverting this migration removes the 5 standalone keys. Phase F CoA
-- alerts lose their stall + imminent thresholds; the orphan-audit CQA
-- gate loses its threshold.
--
-- To roll back manually, enumerate each key explicitly:
--
--   DELETE FROM logic_variables WHERE variable_key IN (
--     'lifecycle_status_history_retention_days',
--     'coa_stall_threshold_p2_days',
--     'coa_imminent_window_days',
--     'coa_orphan_lead_id_warn_threshold',
--     'phase_b_revision_num_max_length'
--   );
