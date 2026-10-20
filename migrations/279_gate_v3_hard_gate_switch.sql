-- 279: the V3 hard gate switch — Spec 124 R-EY E3 (McDonald's Airtight V3, operator y 2026-10-20).
--
-- Operator 2026-10-20 (verbatim): "the label should reflect and enforce the approach" -> "y" to enforcement gates
-- 1-3; "y to all" -> (b) "a closed exception for refresh_snapshot in the hard gate". E3 (every converted step must
-- read standard=V3 in step-validate) is BUILT OFF behind one registered switch, Externalized per R-DF:
--   gate_v3_hard_gate_enabled   0  (0 = off: step-validate prints the converted steps that would fail; 1 = on)
-- PINNED (min = max = default, the R-CV form) in scripts/seeds/logic_variables.json: read file-only by
-- scripts/analysis/gates/variables.mjs gateVariable() (pre-commit stays DB-free, R-DJ (2)); admin.hidden internal.
-- Turning it on is a reviewed seed + migration commit (a new migration updating this row), never an admin edit.
--
-- Idempotent: ON CONFLICT (variable_key) DO NOTHING preserves any operator-set value.
--
-- SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (R-EY; R-CV; R-DF EXTERNALIZED)

-- UP
INSERT INTO logic_variables (variable_key, variable_value, description) VALUES
  ('gate_v3_hard_gate_enabled', 0,
   'McDonald''s Airtight V3 (operator y 2026-10-20; Spec 124 R-EY E3): the V3 hard gate switch. 1 = every converted step must read standard=V3 in step-validate (a closed exception list in scripts/analysis/gates/v3-label.mjs HARD_GATE_EXCEPTIONS holds exactly refresh_snapshot, expiring when permits reaches ③); 0 = off, the gate only prints the converted steps that would fail. Built OFF; the operator turns it on once the backfill lanes land. Pinned min = max = default (R-CV form): read file-only by scripts/analysis/gates/variables.mjs gateVariable(), never tunable from admin; turning it on is a reviewed seed + migration commit. CONSUMED by scripts/analysis/gates/v3-label.mjs.')
ON CONFLICT (variable_key) DO NOTHING;

-- DOWN — manual rollback only, intentionally not transactional (matches mig 159).
-- DELETE FROM logic_variables WHERE variable_key = 'gate_v3_hard_gate_enabled';
