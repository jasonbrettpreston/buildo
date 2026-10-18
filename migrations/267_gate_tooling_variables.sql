-- 267: EXT-1 gate and tooling variables — the numbers the standard gates decide with become pinned logic variables.
--
-- Operator y 2026-10-18 (runner lane, ruling 9; Spec 124 R-EB, McDonald's Airtight V3 EXTERNALIZED): gate E's
-- estate arm bans a tunable literal in scripts/analysis/gates/** and admits no ledger. Each variable carries the
-- former literal as its default, so behaviour is byte-identical at these defaults, and each is PINNED
-- (min = max = default, the R-CV form) in scripts/seeds/logic_variables.json: gates read it file-only through
-- scripts/analysis/gates/variables.mjs gateVariable(), so pre-commit stays DB-free (R-DJ (2)); admin.hidden internal.
--   gate_f_score_floor                14  (was SCORE_FLOOR, score-floor.mjs)
--   gate_notes_cap                    12  (was NOTES_CAP, notes-cap.mjs)
--   gate_why_min_chars                20  (was MIN_WHY_LEN, captures.mjs, and the copied RECAPTURE_MIN_WHY,
--                                          capture-step-golden.js — one variable now)
--   gate_na_reason_min_chars          20  (was NA_REASON_MIN, owner-spec-diff.mjs)
--   gate_red_evidence_min_name_chars   3  (was MIN_NAME_LEN, red-evidence.mjs)
--   tooling_spawn_max_buffer_mb      256  (was four spawn maxBuffer literals 256/32/64/32 MiB; one value)
-- R-EC (EXT-1 part c, the R-DJ (2) pre-commit budget, registered and observed by fast invariant #52):
--   tooling_precommit_budget_docs_only_s  25.3  (R-DJ (2): 23.0 s x 1.10)
--   tooling_precommit_budget_registry_s   27.5  (R-DJ (2): 25.0 s x 1.10)
-- The cloud:pre seed_rows_present check (R-DJ (4)) finds every seed key in the DB once this is applied.
--
-- Idempotent: ON CONFLICT (variable_key) DO NOTHING preserves any operator-set value.
--
-- SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (R-EB; R-CV; R-DF EXTERNALIZED)

-- UP
INSERT INTO logic_variables (variable_key, variable_value, description) VALUES
  ('gate_f_score_floor', 14,
   'McDonald''s Airtight V3 EXT-1 (operator y 2026-10-18; Spec 124 R-EB): gate F (fast invariant #37): the hard-stop score floor; a step scoring below it of 17 hard-stops. Formerly the SCORE_FLOOR = 14 literal. Pinned min = max = 14 (R-CV form): read file-only by scripts/analysis/gates/variables.mjs gateVariable(), never tunable from admin; a change is a reviewed seed + migration commit. CONSUMED by scripts/analysis/gates/score-floor.mjs.'),
  ('gate_notes_cap', 12,
   'McDonald''s Airtight V3 EXT-1 (operator y 2026-10-18; Spec 124 R-EB): the most prose entries a step notes file may carry across its prose blocks before the excess must be promoted to a check or deleted. Formerly the NOTES_CAP = 12 literal. Pinned min = max = 12 (R-CV form): read file-only by scripts/analysis/gates/variables.mjs gateVariable(), never tunable from admin; a change is a reviewed seed + migration commit. CONSUMED by scripts/analysis/gates/notes-cap.mjs.'),
  ('gate_why_min_chars', 20,
   'McDonald''s Airtight V3 EXT-1 (operator y 2026-10-18; Spec 124 R-EB): the minimum length of a written why: a gate G explained-diffs.json entry (R-DA) and a recapture.json entry. Formerly MIN_WHY_LEN = 20 in captures.mjs and the copied RECAPTURE_MIN_WHY = 20 in capture-step-golden.js; both now read this one variable. Pinned min = max = 20 (R-CV form): read file-only by scripts/analysis/gates/variables.mjs gateVariable(), never tunable from admin; a change is a reviewed seed + migration commit. CONSUMED by scripts/analysis/gates/captures.mjs, scripts/analysis/capture-step-golden.js.'),
  ('gate_na_reason_min_chars', 20,
   'McDonald''s Airtight V3 EXT-1 (operator y 2026-10-18; Spec 124 R-EB): the minimum length of a census spec_diff_reason when an owner-spec diff is declared N-A (fast invariant #43). Formerly the NA_REASON_MIN = 20 literal. Pinned min = max = 20 (R-CV form): read file-only by scripts/analysis/gates/variables.mjs gateVariable(), never tunable from admin; a change is a reviewed seed + migration commit. CONSUMED by scripts/analysis/gates/owner-spec-diff.mjs.'),
  ('gate_red_evidence_min_name_chars', 3,
   'McDonald''s Airtight V3 EXT-1 (operator y 2026-10-18; Spec 124 R-EB): gate K: the minimum length of a backticked test name cited beside a red-evidence artifact. Formerly the MIN_NAME_LEN = 3 literal. Pinned min = max = 3 (R-CV form): read file-only by scripts/analysis/gates/variables.mjs gateVariable(), never tunable from admin; a change is a reviewed seed + migration commit. CONSUMED by scripts/analysis/gates/red-evidence.mjs.'),
  ('tooling_spawn_max_buffer_mb', 256,
   'McDonald''s Airtight V3 EXT-1 (operator y 2026-10-18; Spec 124 R-EB): the stdout buffer (MiB) a gate allows a spawned git / ast-grep child before it fails. One value for every caller (the largest former literal, so no limit shrinks): formerly 256 (net-new), 32 (score-floor), 64 (owner-spec-diff) and 32 (compute-literals). Pinned min = max = 256 (R-CV form): read file-only by scripts/analysis/gates/variables.mjs gateVariable(), never tunable from admin; a change is a reviewed seed + migration commit. CONSUMED by scripts/analysis/gates/net-new.mjs, score-floor.mjs, owner-spec-diff.mjs, compute-literals.mjs.'),
  ('tooling_precommit_budget_docs_only_s', 25.3,
   'McDonald''s Airtight V3 EXT-1 part c (operator y 2026-10-18; Spec 124 R-EC, R-DJ (2)): the time budget (seconds) for the file-only stages of .husky/pre-commit on a docs-only commit, measured per stage on the Mac mini (23.0 s x 1.10). Fast invariant #52 compares docs/reports/generated/precommit-budget.json against it. Pinned min = max = 25.3 (R-CV form): read file-only by scripts/analysis/gates/variables.mjs gateVariable(), never tunable from admin; a change is a reviewed seed + migration commit. CONSUMED by scripts/analysis/precommit-budget.mjs.'),
  ('tooling_precommit_budget_registry_s', 27.5,
   'McDonald''s Airtight V3 EXT-1 part c (operator y 2026-10-18; Spec 124 R-EC, R-DJ (2)): the time budget (seconds) for the file-only stages of .husky/pre-commit on a registry-input commit (step-validate selects the whole registry), measured per stage on the Mac mini (25.0 s x 1.10). Fast invariant #52 compares docs/reports/generated/precommit-budget.json against it. Pinned min = max = 27.5 (R-CV form): read file-only by scripts/analysis/gates/variables.mjs gateVariable(), never tunable from admin; a change is a reviewed seed + migration commit. CONSUMED by scripts/analysis/precommit-budget.mjs.')
ON CONFLICT (variable_key) DO NOTHING;

-- DOWN — manual rollback only, intentionally not transactional (matches mig 159).
-- DELETE FROM logic_variables WHERE variable_key IN ('gate_f_score_floor', 'gate_notes_cap', 'gate_why_min_chars', 'gate_na_reason_min_chars', 'gate_red_evidence_min_name_chars', 'tooling_spawn_max_buffer_mb', 'tooling_precommit_budget_docs_only_s', 'tooling_precommit_budget_registry_s');
