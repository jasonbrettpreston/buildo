-- 256: coa_notice_variances.parse_status gains 'target_unit_mismatch' (load_coa_notices, Spec 129 §5/§10).
--
-- WHY THIS EXISTS
-- Operator ruling 2026-10-09 (Path 2, option A): a variance item whose required/proposed pair is in one
-- unit family but whose keyword-mapped target is in another (e.g. a floor space index stated as an area,
-- "0.8 m." typos, a detached m² superscript) is NOT claimed as a pair. It gets the closed status
-- 'target_unit_mismatch': its values are not claimed, its mapped target stays recorded, and the step
-- counts it in a WARN check every run (Spec 124 Rule 1, nothing hidden). C13 (unit_target_mismatch, FAIL
-- viol <= 0) is unchanged and remains the backstop. Measured over the 70 pinned 2017 PDFs after the WF3
-- target-map none-phrase fix: 9 items.
--
-- Additive: one value appended to an existing CHECK. The table was created empty by 252 and every run so
-- far aborted at the pre_write gate before any write, so no row can violate the rebuilt constraint.

-- UP
ALTER TABLE coa_notice_variances DROP CONSTRAINT IF EXISTS chk_cnv_parse_status;
ALTER TABLE coa_notice_variances ADD CONSTRAINT chk_cnv_parse_status CHECK (
  parse_status IN (
    'pair',
    'no_required_value',
    'no_proposed_value',
    'unit_family_mismatch',
    'multi_value_ambiguous',
    'side_ambiguous',
    'no_split',
    'target_unit_mismatch'
  )
);

-- DOWN — comments-only per project convention (migrate.js runs the whole file in one transaction and does
-- NOT honour -- UP / -- DOWN markers; see tasks/lessons.md). Manual rollback, only while no row carries
-- 'target_unit_mismatch':
--   ALTER TABLE coa_notice_variances DROP CONSTRAINT IF EXISTS chk_cnv_parse_status;
--   ALTER TABLE coa_notice_variances ADD CONSTRAINT chk_cnv_parse_status CHECK (parse_status IN
--     ('pair','no_required_value','no_proposed_value','unit_family_mismatch','multi_value_ambiguous',
--      'side_ambiguous','no_split'));
