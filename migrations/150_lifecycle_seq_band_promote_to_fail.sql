-- 150: Phase E.5 — band recalibration operational gate (per-kind posture flags).
--
-- Adds 3 per-kind integer logic_variables that the assert script reads at
-- startup to gate WARN→FAIL routing per violation kind. Each flag is integer
-- 0 or 1; Zod validates the range at script startup via .int().min(0).max(1).
--
-- Per-kind keys:
--   lifecycle_seq_band_promote_to_fail_band_violation
--     — gates `band_violation` kind (data shifted within configured band).
--       The canonical regression-detection gate.
--   lifecycle_seq_band_promote_to_fail_no_band_configured
--     — gates `no_band_configured` kind (seq present in data but no band loaded).
--       Operator config-gap signal; usually kept at WARN through Phase F.
--   lifecycle_seq_band_promote_to_fail_expected_data_missing
--     — gates `expected_data_missing` kind (band has min > 0 but zero observed rows).
--       Data deletion / classifier-skip suggestion; promote after structural
--       absence resolution path per Spec 84 §3.4.
--
-- All 3 default to 0 (E.4 WARN-only posture preserved). Operators promote
-- each flag independently per the pre-promotion checklist in Spec 84 §3.4.
-- Operator-driven gate matches Spec 48 Improvement C "pinned baseline"
-- manual-mitigation precedent; auto-promotion via consecutive-PASS tracker
-- is deferred to a follow-up.
--
-- Why integer 0/1 (not string enum, not boolean):
-- - logic_variables.variable_value is DECIMAL NOT NULL (mig 092). A string
--   posture flag would require the variable_value_json (mig 097) JSONB path —
--   added complexity for a single-bit decision.
-- - Existing Zod patterns (mig 119, mig 148) use z.coerce.number().int().
--   Integer is the project convention for tunable logic variables.
-- - Spec 86 Control Panel renders the keys as editable marketplace constants —
--   single-click promotion without DB-direct edit.
--
-- Why no DB CHECK constraint:
-- - PostgreSQL CHECK constraints on logic_variables.variable_value can't be
--   scoped to specific variable_keys without per-row triggers (added
--   complexity not warranted). Operator typo crashes pipeline at Zod startup
--   with a clear error message; recovery is the UPDATE statement in the
--   pre-promotion checklist's rollback path (Spec 84 §3.4 Step 6).
--
-- Idempotent: ON CONFLICT (variable_key) DO NOTHING preserves operator-tuned
-- values applied via admin Control Panel after deployment.
--
-- v4 fold (recurring across phases): NO explicit BEGIN/COMMIT (mig 135 R8
-- hotfix convention — migrate.js runner provides outer transaction).
--
-- SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.11 Phase E.5
-- SPEC LINK: docs/specs/01-pipeline/84_lifecycle_phase_engine.md §3.4
-- SPEC LINK: docs/specs/01-pipeline/48_pipeline_observability.md §3.1

-- ═══════════════════════════════════════════════════════════════════
-- UP
-- ═══════════════════════════════════════════════════════════════════

INSERT INTO logic_variables (variable_key, variable_value, description) VALUES
  ('lifecycle_seq_band_promote_to_fail_band_violation', 0,
   'Phase E.5 gate for "band_violation" kind. 0=WARN routing (E.4 default; seqBandsWarn++); 1=FAIL routing (E.5 promotion; seqBandsFailing++ → verdict FAIL → pipeline halt). Canonical regression-detection gate. Operator-driven per Spec 84 §3.4 pre-promotion checklist.'),
  ('lifecycle_seq_band_promote_to_fail_no_band_configured', 0,
   'Phase E.5 gate for "no_band_configured" kind (seq present in data but no band loaded — operator config gap). 0=WARN (default; operator config-gap signal); 1=FAIL (rare; reserved for ops teams that treat unconfigured seqs as halt-worthy). Operator-driven per Spec 84 §3.4 pre-promotion checklist.'),
  ('lifecycle_seq_band_promote_to_fail_expected_data_missing', 0,
   'Phase E.5 gate for "expected_data_missing" kind (band has min > 0 but zero observed rows — possible data deletion or classifier-skip). 0=WARN (default; operator investigates); 1=FAIL (after verifying no structurally-absent seqs remain; see Spec 84 §3.4 structural-absence resolution path). Operator-driven per Spec 84 §3.4 pre-promotion checklist.')
ON CONFLICT (variable_key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════
-- DOWN — manual rollback only, intentionally not transactional
-- (Rule 6 / commit 8b1c10b convention; matches mig 119/148 pattern —
-- a transactional DOWN would destroy operator-tuned values applied via
-- admin Control Panel after deployment).
-- ═══════════════════════════════════════════════════════════════════
--
-- To roll back manually (per Spec 84 §3.4 rollback path):
--   DELETE FROM logic_variables WHERE variable_key IN (
--     'lifecycle_seq_band_promote_to_fail_band_violation',
--     'lifecycle_seq_band_promote_to_fail_no_band_configured',
--     'lifecycle_seq_band_promote_to_fail_expected_data_missing'
--   );
--
-- Then revert the assert-lifecycle-phase-distribution.js extension +
-- the 3 scripts/seeds/logic_variables.json additions + the 3
-- EXPECTED_LOGIC_VAR_KEYS entries in src/tests/control-panel.logic.test.ts
-- in one commit (the seed JSON additions and EXPECTED_LOGIC_VAR_KEYS
-- extensions are atomic per v3 fold v2-conv-CRIT-body commit-sequencing
-- constraint — the existing bidirectional parity test would otherwise fail
-- on a partial rollback).
