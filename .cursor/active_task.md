# Active Task: WF1 #lifecycle-phase-engine-migration-E.4 — per-seq distribution bands + `assert-lifecycle-phase-distribution.js` extension

**Status:** Implementation — v4 complete + 2 diff-review folds applied; correcting pre-commit hook TS error (missing `beforeAll` import) before WF6 commit.
**Workflow:** WF1 (script extension — quality CQA gate granularity upgrade; migration 148 adds per-seq band keys to `logic_variables`; no business-table schema changes)
**Domain Mode:** Backend/Pipeline (`scripts/quality/`, `scripts/seeds/`, `migrations/`, `src/tests/`, `docs/specs/`)
**Rollback Anchor:** `9902860` (Phase E.3 SHIP — CoA-side granular cohort calibration)
**Parent WF:** Phase E — Lifecycle engine migration + bug 84-W12 fix + cohort-key extension (Spec 42 §6.11)
**Sub-deliverable position:** E.1 (substrate `7003683`) → E.2 (consumer wiring `ad0c178`) → E.3 (CoA-side granular cohorts `9902860`) → **E.4 (per-seq bands — THIS task)** → E.5 (band recalibration operational gate)
**Adversarial review:** USER-REQUESTED — 4 reviewers (Gemini + DeepSeek + Independent + Observability) at BOTH plan + diff stages.
**Standards adherence (user-mandated):** `00_engineering_standards.md` §2 (try-catch), §3 (database), §6 (logError), §9 (pipeline safety); Spec 47 §R1-R12; Spec 48 (observer) §3.1 (audit_table) + §3.2 (records_meta distributions); TDD cadence per WF1 Red Light/Green Light gate.

## v3 → v4 Revision Summary

v3 plan-review (4 reviewers) surfaced 9 actionable findings (2 CRITs, 1 HIGH, 6 MEDs). All folded in v4. Per user authorization: v4 PLAN LOCKs directly without another plan-review round; diff-stage 4-reviewer round runs AFTER implementation. Convergence trajectory: v1=14 → v2=8 → v3=9 (slight uptick due to v3 introducing more surface area, but each round caught real defects).

| # | Finding | Reviewer(s) | Severity | v4 Resolution |
|---|---|---|---|---|
| v3-DS-CRIT | Catalog `SELECT` query (Part 3) is executed unconditionally even when `catalogExists === false` — defeats the Part 6 startup guard. Script crashes with `relation "universal_stream_catalog" does not exist`. | DeepSeek CRIT | CRITICAL | **FOLD** — wrap the catalog `SELECT` in `if (catalogExists) { ... }`. Fallback to `catalogRows = []` produces graceful degradation (no per-seq assertion; phase-keyed assertions continue). |
| v3-G-CRIT | Formula inconsistency — v3's mig 148 SQL uses the new 2-branch continuous formula `[FLOOR(rows_count*0.7), CEIL(rows_count*1.3)+20]`, but Part 2 seed-JSON examples + Test #4 parity test spec still reference the OLD 3-branch formula (`1-29 → max*5`; `>=30 → ±30%`). Parity test would falsely PASS/FAIL with conflicting computations. | Gemini CRIT + Independent + Observability (convergent 3/4) | CRITICAL | **FOLD** — corrected all 3 locations to the 2-branch continuous formula. Seq 1 example now [7, 33] (was [0, 50]); seq 19 now [632, 1196] (was [632, 1176]); parity test spec uses `Math.floor(rows_count*0.7)` + `Math.ceil(rows_count*1.3) + 20` JS formula matching SQL. Added edge-case test asserting continuity at the former rows_count=30 boundary. |
| v3-G-HIGH | Stage 2 dynamic Zod validation (Part 7) checks `!Number.isFinite(Number(min/max))` but NOT `< 0`. A negative band value (e.g., `min=-10` from operator tampering or DB drift) would pass validation, silently making `actual >= -10` always true, disabling the lower-bound check. Parity gap with static schema's `.nonnegative()`. | Gemini HIGH | HIGH | **FOLD** — added explicit `Number(min/max) < 0` checks in Stage 2 throws. Parity restored with the `.nonnegative()` enforcement on phase-keyed bands. |
| v3-G-NIT + v3-DS-MED (convergent) | `catalogNullCountSeqs` declared (Part 3 catalog query block) but never used — dead code from v2 holdover. | Gemini NIT + DeepSeek MED (convergent 2/4) | MED | **FOLD** — repurposed (per Gemini LOW alt) to identify INFO-only seqs by the CATALOG (source of truth) rather than `band.max === null` (which depends on mutable logic_variables). Used in Part 3's classification loop for robustness against operator-tampered null-max values. |
| v3-Indep-MED + v3-Obs-MED | `expected_data_missing` rendering "possible data deletion" is too alarming for the common first-deploy case (often the cause is classifier-never-wrote, source-coverage gap, or catalog vs production data drift — not actual deletion). | Independent + Observability (convergent 2/4) | MED | **FOLD** — neutral rendering: `"seq N: 0 rows observed (band expects min=X) — verify classifier coverage, source freshness, or catalog vs production data drift"`. Operator-triage decision now requires checking all four hypotheses rather than jumping to "data deletion" assumption. |
| v3-Indep-MED-C | Orphan-key throw error message says "Fix the orphan keys or re-seed via mig 148." Re-seeding does NOT fix orphans (`ON CONFLICT DO NOTHING` preserves them). Operator follows the bad advice → throw persists → confusion. | Independent MED | MED | **FOLD** — error message rewritten with explicit recovery path: (a) Spec 86 Control Panel delete, OR (b) `DELETE FROM logic_variables WHERE variable_key IN (...)` with the offending keys quoted. Removed misleading "re-seed via mig 148" guidance. |
| v3-Indep-MED-D | rows_count=1 boundary behavior — band = [0, 22], so actual=0 is always in-band. INTENTIONAL per the continuous formula design (rows_count=1 baseline is statistically equivalent to zero), but UNDOCUMENTED. Operator seeing seq with rows_count=1 actual=0 and zero WARN would be confused. | Independent MED | MED-doc | **FOLD as doc** — added explicit comment block in mig 148 header explaining the rows_count=1 behavior + flagging it as an E.5 revisit point for regulatory-critical low-volume seqs. |
| v3-Indep-MED-A | Mig 149 failure-mode description imprecise — plan said "each statement runs in its own implicit transaction" but the `recordApplied` call after the CONCURRENTLY statements is a SEPARATE pool.query that can fail independently. If it fails, the migration re-runs (idempotent via IF NOT EXISTS). | Independent MED (Concern A) | MED-doc | **FOLD as doc** — Part 1.5 description clarified: explicitly documents the `recordApplied` separate-pool.query failure mode + the automatic re-run recovery via IF NOT EXISTS idempotency. |
| v3-DS-MED-threshold | Empty-catalog `seq_bands_total` threshold message renders as `"== 0 expected"` — technically true but misleading (looks like harmless empty state, not missing-migration). | DeepSeek MED | MED | **FOLD** — bifurcated threshold string per status: empty-catalog case renders `'0 rows in universal_stream_catalog — verify mig 129 seed applied (expected ~110)'`; partial-mig case keeps the dynamic `${catalogSeqs.length}` form. Operators see the right diagnostic for each scenario. |

**v4 load-bearing changes on top of v3:**
1. Catalog `SELECT` guarded by `if (catalogExists)` (CRIT) — no more crash on missing catalog table.
2. All formula references aligned to 2-branch continuous formula (CRIT) — mig 148 SQL, seed examples (Part 2), parity test spec (Test #4), revision summary.
3. Stage 2 Zod validation gains `< 0` checks (HIGH) — parity with static schema's `.nonnegative()`.
4. `catalogNullCountSeqs` repurposed (MED) — INFO-only identification routes through catalog (source of truth), not mutable logic_variables.
5. `expected_data_missing` neutral rendering (MED) — operator-triage UX.
6. Orphan-key error explicit recovery path (MED) — no more misleading "re-seed via mig 148."
7. rows_count=1 always-PASS behavior documented (MED-doc).
8. Mig 149 recordApplied failure-mode clarified (MED-doc).
9. Empty-catalog threshold message bifurcated (MED) — distinct from partial-mig case.

## v2 → v3 Revision Summary

v2 plan-review (4 reviewers) surfaced 8 actionable findings (1 CRIT, 6 HIGHs, 1 MED). All folded in v3. Convergence trajectory: v1=14 → v2=8 — tightening but each round catches real defects.

| # | Finding | Reviewer(s) | Severity | v3 Resolution |
|---|---|---|---|---|
| v2-G-CRIT | Zod `.passthrough()` silently accepts typo'd band keys (e.g. `lifecycle_seq_band_42_mx` instead of `_max`). The static schema doesn't catch the typo; runtime band-loading reads `undefined`; `?? null` converts undefined → null → INFO-only band. The assertion is silently disabled for that seq. | Gemini CRIT | CRITICAL | **FOLD** — explicit orphan-key detection after Stage 1 Zod parsing: iterate `Object.keys(logicVars)` matching `/^lifecycle_seq_band_(\d+)_(min\|max)$/` and assert each `<N>` is in `catalogSeqs`. Throw at startup on any orphan. The typo + missing-min case both fail the same check. |
| v2-conv-HIGH | UNION ALL aggregate query risks full table scan on `permits` and `coa_applications` if `lifecycle_seq` is not indexed (mig 132/133 added the column but no index). At ~250K + 33K rows, the query could take tens of seconds and block the pipeline. | Gemini HIGH + DeepSeek HIGH (convergent 2/4) | HIGH | **FOLD** — mig 148 adds `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_permits_lifecycle_seq ON permits(lifecycle_seq) WHERE lifecycle_seq IS NOT NULL` + same for `coa_applications`. Partial indices (filtered on non-NULL) keep size small. CONCURRENTLY required per Engineering Standards §3.1 for tables > 100K rows. |
| v2-G-HIGH-2 | Tolerance formula discontinuous at `rows_count = 30` boundary: 29 → max=145 (low-volume), 30 → max=39 (±30%). Tiny data growth triggers spurious WARN cascade. | Gemini HIGH | HIGH | **FOLD** — replace the 3-branch CASE with a 2-branch continuous formula: `[FLOOR(rows_count * 0.7), CEIL(rows_count * 1.3) + 20]` for `rows_count >= 1`; `[0, NULL]` for `rows_count IS NULL OR 0`. Additive +20 buffer absorbs low-volume statistical noise. At rows_count=29: [20, 58]; at 30: [21, 59] — continuous. At 100: [70, 150]; at 1000: [700, 1320]. |
| v2-G-HIGH-3 | Symmetric-difference asymmetric — checks "seqs in data but not in bands" (catches NEW unexpected seqs) but NOT "seqs in bands but not in data" (data deletion / classifier-skip bugs invisible — if `band.min > 0` and `actual = 0`, expected data has disappeared but the gate cannot detect it since the seq isn't in the aggregate result). | Gemini HIGH | HIGH | **FOLD** — second loop after the first symmetric-difference check: iterate `bandSeqs`; if seq not in `distributionSeqs` AND `band.min > 0` AND `band.max !== null` (excluding INFO-only NULL-catalog bands), emit `kind: 'expected_data_missing'` violation + increment `seqBandsWarn`. Distinguishes "missing data" from "null-catalog informational" via the existing kind discriminator. |
| v2-I-HIGH-F | Truncation math error in warnings preview suffix: uses `seqViolations.length - previewCount` but `seqViolations` is the UNCAPPED full array. With 200 violations: message says "+190 more in records_meta.seq_violations" but records_meta only has 40 more (50 cap - 10 preview). Misleads operator triage. | Independent HIGH (Concern F) | HIGH | **FOLD** — change preview suffix to `seqViolationsCapped.length - previewCount` for "in records_meta" count; separately surface `seqViolationsTruncatedCount` (already in records_meta) with explicit message: "+N more in records_meta.seq_violations" + "(M additional truncated — see seq_violations_truncated_count)". |
| v2-O-HIGH-1 | Stale "28 rows / 5 new" references in 2 plan sections (line 70 Goal point 4, line 635 Spec 48 Adherence) — v2 added `seq_bands_null_catalog_count` (6th new row → 29 total) but didn't update these locations. An infra test author reading line 70 might write the assertion for 5 new rows, missing the 6th. | Observability HIGH (FINDING-1) | HIGH | **FOLD** — both locations corrected to "29 rows / 6 new aggregates". |
| v2-O-HIGH-2 | `seq_bands_total` WARN lacks the `[E.4 WARN-ONLY POSTURE]` prefix that all other E.4 WARNs carry. Co-firing scenario: mig 148 partially applied + first deploy → `seq_bands_total: 95/110 WARN` appears alarming without context, while `seq_bands_warn: 47` is correctly prefixed. Operator triage inconsistency → unnecessary WF3s. | Observability HIGH (FINDING-2) | HIGH | **FOLD** — when `seqBandKeysLoaded < catalogSeqs.length`, push a `warnings[]` entry alongside the audit row WARN: `[E.4 WARN-ONLY POSTURE — partial mig 148 apply expected during ramp-up] seq_bands_total ${loaded}/${expected} — verify mig 148 applied cleanly. Per-seq assertion will be partial until next migration apply.` |
| v2-I-MED-A | Empty catalog edge case: `catalogExists && catalogRows.length === 0` (mig 128 applied but mig 129 seed not run) → `catalogSeqs = []`, `seqBands = {}`, `seq_bands_total` evaluates `0 === 0 → PASS`. Hides the misapplied-migration state. | Independent MED (Concern A) | MED | **FOLD** — add explicit guard after catalog query: if `catalogExists && catalogRows.length === 0`, emit `pipeline.log.warn` AND override `seq_bands_total` status to WARN (independent of the loaded vs expected comparison) AND push to `warnings[]` with `[E.4 STARTUP STATE]` prefix: "universal_stream_catalog table exists but is empty (mig 129 seed not yet applied) — per-seq assertion DISABLED for this run." |

**v3 load-bearing changes on top of v2:**
1. Orphan-key detection (CRIT) — typo prevention.
2. Partial indices on `lifecycle_seq` columns (HIGH-perf) — full-table-scan prevention.
3. Continuous 2-branch tolerance formula (HIGH-correctness) — no boundary discontinuity.
4. Bidirectional symmetric-difference (HIGH-coverage) — data-deletion detection.
5. Truncation math fix (HIGH-correctness) — accurate operator triage info.
6. Doc consistency (HIGH-test-author-safety) — 29/6 throughout.
7. `[E.4 WARN-ONLY POSTURE]` prefix on `seq_bands_total` WARN (HIGH-UX).
8. Empty-catalog state explicit handling (MED-correctness).

## v1 → v2 Revision Summary

v1 plan-review (4 reviewers — Gemini + DeepSeek + Independent worktree + Observability worktree) surfaced 14 actionable findings (2 CRITs, 7 HIGHs, 5 MEDs). All folded in v2.

| # | Finding | Reviewer(s) | Severity | v2 Resolution |
|---|---|---|---|---|
| v1-G-CRIT | `999999` magic-number sentinel for "no upper bound" defeats the assertion gate — a true regression sending >999,999 rows to a single seq would silently PASS. Plan's `[0, NULL]` description contradicted the actual `999999` SQL. | Gemini CRIT | CRITICAL | **FOLD** — mig 148 INSERTs NULL for the max bound (not `999999`); assertion logic uses null-aware comparison `band.max === null || actual <= band.max`. Seed JSON entries use `null` for `max` in the low-volume/NULL-rows_count branches. |
| v1-O-CRIT | `seq_violations_preview` placed in `records_meta` is INVISIBLE to the Spec 48 followup file consumer — the observer's `extractIssues()` only reads `audit_table.rows` for the DeepSeek narrative. Operators seeing `seq_bands_warn: 47` cannot triage from the followup. | Observability CRIT-1 + CRIT-2 | CRITICAL | **FOLD** — primary surfacing is via `warnings[]` array (which IS captured in `pipeline.log.warn` and visible to operators). Cap top 10 violations in the warning message with structured `{seq, actual, min, max}` summary; full structured array (capped at 50) lives in `records_meta.seq_violations` for DB-side inspection only — documented as DB-only, not observer-surfaced. |
| v1-conv-HIGH | Hardcoded `expectedSeqCount = 110` brittle — future catalog expansion (seq 111+) silently ignored; seq removal causes misleading partial-load WARN. | Gemini MED + DeepSeek HIGH + Independent (convergent 3/4) | HIGH | **FOLD** — query `SELECT seq FROM universal_stream_catalog ORDER BY seq` at startup to build the list of expected seqs dynamically. `seq_bands_total` audit row reports actual catalog count. Zod schema extension iterates loaded keys, not 1..110. |
| v1-DS-HIGH-2 | Unseen seqs — seqs present in data but NOT in loaded bands are silently ignored. A seq that exists in production but has no band key (partial migration apply, future catalog addition pre-bands) contributes nothing to passing/warn/failing. | DeepSeek HIGH | HIGH | **FOLD** — symmetric difference detection: after loading bands and computing `seqDistribution`, compute `Set(distribution_seqs) − Set(band_seqs)`. Each orphan emits a WARN entry `"seq N: row count NNN observed but no band key configured"` + adds to `seq_bands_warn` counter. |
| v1-G-HIGH | Mig-vs-seed-JSON parity drift risk — the `_tmp_phase_e4_seed_bands.mjs` helper generates JSON; no automated parity test ensures values match mig 148's SQL output. A future tolerance-formula tweak in one place but not the other creates env-specific divergence. | Gemini HIGH | HIGH | **FOLD** — new infra test reads `migrations/129_seed_universal_stream_catalog.sql` for catalog `rows_count` values, applies the tolerance formula in JS, and asserts equality with `scripts/seeds/logic_variables.json` entries for all 220 keys. Programmatic enforcement of parity; tweaking the formula in either side fails the test. |
| v1-I-HIGH-3 | `linked_permit_num IS NULL` filter in `seqUnclassifiedCoa` silently excludes 99.4% of CoA rows from the gate — E.1 removed Rule 0 (the original justification), so linked CoAs now ALSO receive `lifecycle_seq` writes. Without this fix, large-scale classification failures on linked CoAs are invisible. | Independent HIGH-3 | HIGH | **FOLD** — remove the `linked_permit_num IS NULL` filter from `seqUnclassifiedCoa` query. Matches post-E.1 reality (`classifyCoaPhase()` writes phase + seq to ALL CoAs). Existing `unclassified_count` (phase-keyed) is documented as legacy-shape and untouched to preserve baseline continuity; the new `seq_unclassified_count` IS the correct shape. |
| v1-I-MED-3 | `lifecycle_seq_unclassified_max` not seeded by mig 148 (only in JSON seed file). If assert script runs between migration apply and `seed-logic-variables.js` run, the Zod schema (non-optional key) throws and breaks the pipeline health check. | Independent MED-3 (consequential — promoted to HIGH for fold purpose) | HIGH | **FOLD** — add a single `INSERT INTO logic_variables ('lifecycle_seq_unclassified_max', 5000, '...') ON CONFLICT DO NOTHING` statement to mig 148. Ensures DB-side default exists immediately after migration apply, before any seed-script run. |
| v1-O-HIGH-2 | `records_total` (phase-keyed sum) vs `sum(seq_distribution.values())` divergence during Phase D ramp-up not documented. Future scripts comparing the two will see a gap that looks like a pipeline integrity failure. | Observability HIGH-2 | HIGH | **FOLD as doc** — Spec 84 §3.4 amendment adds: "During Phase D/E.2 ramp-up, `sum(records_meta.seq_distribution.values()) < records_total` because many rows have `lifecycle_phase` set but not yet `lifecycle_seq`. Expected; not a pipeline integrity failure. Convergence is the operational gate for E.5 promotion." |
| v1-I-HIGH-1 | NULL-derived `[0, NULL]` bands inflate the PASS count (~40-50 of 110 seqs) — operator seeing `seq_bands_passing: 95` cannot distinguish first-run-noise PASSes from real PASSes. The `seq_bands_warn: 47` flood on first deploy looks alarming without context. | Independent HIGH-1 | HIGH | **FOLD** — new `seq_bands_null_catalog_count` INFO metric tracks how many of the 110 bands had `rows_count IS NULL` (informational only — always PASS by construction). Operators decompose total via: `passing = real_passing + null_catalog`. Improves first-deploy operator narrative. |
| v1-G-MED-1 | Hardcoded `1..110` loop range in Zod schema generation (Part 7). | Gemini MED | MED | **FOLD (cascade)** — same dynamic catalog query as v1-conv-HIGH; Zod schema iterates `seqs_in_catalog` array, not a hardcoded range. |
| v1-DS-MED-3 | `seqUnclassifiedMax` extraction missing from plan code snippet — reader cannot tell where the variable comes from. | DeepSeek MED-3 | MED | **FOLD** — code snippet in Part 3 shows explicit `const seqUnclassifiedMax = logicVars.lifecycle_seq_unclassified_max;` extraction. |
| v1-DS-MED-4 | Large `seqViolations` array in `records_meta` can exceed tens of KB in catastrophic-failure scenarios → observer DeepSeek prompt bloat. | DeepSeek MED-4 | MED | **FOLD** — cap `seq_violations` array at 50 structured entries; beyond that, emit only `seq_violations_truncated_count` scalar (also in records_meta) for triage awareness. |
| v1-O-MED-2 | `seq_violations` shape brittleness — string format requires regex parsing for any future structured consumer (E.5 promotion logic). | Observability MED-2 | MED | **FOLD** — emit structured `{seq: N, actual: NNN, band_min: M, band_max: K}` objects (not strings). Warning-message human-readable rendering happens at display time, not in the data shape. |
| v1-I-MED-2 | Plan's illustrative seed example for seq 1 (rows_count=10) shows ±30% values (7, 13) — wrong; should show [0, 50] from the low-volume branch. | Independent MED-2 | MED (doc-only) | **FOLD as doc** — corrected example with inline note explaining the branch. |
| v1-O-MED-1 | `seq_unclassified_count` vs `unclassified_count` relationship not documented in plan or code comments. | Observability MED-1 | MED (doc-only) | **FOLD as doc** — explicit doc note added: "In steady state, `seq_unclassified_count >= unclassified_count` (seq is finer-grained; a row can have `lifecycle_phase NOT NULL` but `lifecycle_seq IS NULL` during E.2 ramp-up). Phase D/E.2 first-run state will reflect this; convergence is the E.5 operational gate." |

**v2 load-bearing changes:**
1. NULL upper-bound (not `999999`); assertion logic null-aware (CRIT).
2. Violations surfaced via `warnings[]` (not `records_meta.seq_violations_preview` alone); structured object shape; capped at 50 (CRIT + 3 HIGHs/MEDs cascade).
3. Dynamic catalog seq list (no hardcoded 110); Zod schema iterates loaded keys (HIGH + cascade).
4. Symmetric-difference detection for data-seqs-not-in-bands (HIGH).
5. Mig-vs-seed parity test (HIGH).
6. `linked_permit_num IS NULL` filter removed from `seqUnclassifiedCoa` (HIGH — post-E.1 correctness).
7. `lifecycle_seq_unclassified_max` ALSO seeded by mig 148 (HIGH — startup safety).
8. `seq_bands_null_catalog_count` INFO metric added (HIGH — operator UX).
9. Spec 84 §3.4 amendment documents `records_total` vs `seq_distribution` sum gap (HIGH-doc).
10. Total audit_table.rows: 23 (existing) + 6 (NEW — 5 from v1 + `seq_bands_null_catalog_count`) = 29 rows.

## Why this task exists

Spec 42 §6.11 Phase E.4: *"phase distribution bands recalibrated in `scripts/seeds/logic_variables.json` via iterative band-tuning on staging."*

Pre-E.4 state (post-E.3 SHIP):

- `scripts/quality/assert-lifecycle-phase-distribution.js` asserts 19 **phase**-keyed bands (P3–P8, P7a–d, P18–P20, P9–P17 aggregate, O1–O3, CoA P1/P2) against row counts in `permits.lifecycle_phase` + `coa_applications.lifecycle_phase`.
- Coverage gap: the 19 phase keys collapse 110 distinct Universal Stream catalog sequences (`universal_stream_catalog.seq` 1-110) into ≤19 buckets. The granular **seq**-level distribution (now persisted via Phase E.2 in `permits.lifecycle_seq` + `coa_applications.lifecycle_seq` per migrations 132+133) is observable but not asserted.
- Operational consequence: a regression that shifts row counts WITHIN a phase but maintains the phase total (e.g., classifier silently re-routes seq 8 'Postponed' rows to seq 9 'Deferred' rows — both `P2`) is invisible to the existing phase-keyed assertion. This is the exact failure-class that bug 84-W12 was for status-level routing; the granular gate is the structural complement.

Phase E.4 closes the gap by extending the assertion to per-seq bands (Universal Stream seq 1-110) while preserving the existing phase-keyed bands as the coarse safety net. Bands are seeded from `universal_stream_catalog.rows_count` (the production snapshot baseline embedded in mig 129; provenance: `docs/reports/spec_84_universal_stream_v10.csv`) with ±30% tolerance, and remain operator-tunable via Spec 86 Control Panel. Bands begin life as **WARN-only gates** (not FAIL) on first deploy; E.5 (separate WF) is the operational gate that tightens them to FAIL after 7 consecutive PASS runs on staging.

This task does NOT add new business-table schema, does NOT modify the classifier, does NOT modify `compute-phase-calibration.js`. It's a CQA gate granularity upgrade with one new migration adding logic_variable keys.

## Context

### Goal

1. **Per-seq distribution assertion** — extend `assert-lifecycle-phase-distribution.js` to compute the union distribution of `lifecycle_seq` across `permits` + `coa_applications` and assert each seq's row count against per-seq bands loaded from `logic_variables`.

2. **Migration 148 — derive per-seq bands from `universal_stream_catalog.rows_count`** — INSERT...SELECT pattern reads the catalog (the seeded production snapshot from mig 129) and computes `lifecycle_seq_band_<N>_min/_max` keys with ±30% tolerance for seqs with `rows_count >= 30`; wider `[0, max*5]` bands for low-volume seqs (`rows_count` between 1 and 29); `[0, NULL]` INFO-only entries for `rows_count IS NULL` or 0 (no upper bound — informational tracking only).

3. **WARN-only first-deploy posture** — per-seq band violations emit `WARN` (not `FAIL`) on first deploy. Phase D + E.2 may have shifted the distribution since the 2026-05-12 catalog snapshot; E.5 tightens to FAIL after stability.

4. **records_meta-side observability per Spec 48 §3.2** — the full 110-row per-seq distribution map ships in `records_meta.seq_distribution` (NOT in `audit_table.rows`, which would balloon to ~130 rows and degrade the DeepSeek observer narrative). `audit_table.rows` gets 6 NEW aggregate counters: `seq_bands_total`, `seq_bands_passing`, `seq_bands_null_catalog_count` (v2 addition per v1-I-HIGH-1), `seq_bands_warn`, `seq_bands_failing`, `seq_unclassified_count`. Total `audit_table.rows` count: 23 (existing) + 6 (NEW) = 29.

5. **Spec 42 §6.11 Phase E.4 anchor + Spec 84 §3.4 band-design extension** — 2 spec amendments post-commit.

### Target Specs

- `docs/specs/00_engineering_standards.md` §2 (try-catch boundary), §3 (database — mig pattern), §6 (logError), §9 (pipeline safety — transaction boundaries, parameter limits, idempotent)
- `docs/specs/01-pipeline/47_pipeline_script_protocol.md` §R1-R12 (script is pre-compliant; E.4 extends within envelope)
- `docs/specs/01-pipeline/48_pipeline_observability.md` §3.1 (audit_table.rows), §3.2 (records_meta distributions NOT passed to DeepSeek)
- `docs/specs/01-pipeline/42_chain_coa.md` §6.11 Phase E.4 (anchor fill post-commit)
- `docs/specs/01-pipeline/84_lifecycle_phase_engine.md` §3.4 (band design — extend)

### Key Files

**Targets:**
- `scripts/quality/assert-lifecycle-phase-distribution.js` (EXTEND — add per-seq SELECT + band assertion loop + 5 new audit rows + `seq_distribution` records_meta map)
- `scripts/seeds/logic_variables.json` (ADD — per-seq band key defaults matching mig 148 inserts)
- `migrations/148_lifecycle_seq_bands_logic_variables.sql` (NEW — INSERT...SELECT from `universal_stream_catalog` populates `lifecycle_seq_band_<N>_min/_max` keys for all 110 seqs)
- `src/tests/assert-lifecycle-phase-distribution.infra.test.ts` (EXTEND — shape regression for per-seq logic)
- `src/tests/migration-148-lifecycle-seq-bands.infra.test.ts` (NEW — mig 148 shape regression)
- `docs/specs/01-pipeline/42_chain_coa.md` §6.11 anchor resolution (post-commit)
- `docs/specs/01-pipeline/84_lifecycle_phase_engine.md` §3.4 band-design extension (post-commit)
- `docs/reports/review_followups.md` (E.4 close-out note)

**Out-of-Scope:**
- `scripts/classify-lifecycle-phase.js` (E.2 consumer — UNCHANGED; reads + writes `lifecycle_seq` already)
- `scripts/lib/lifecycle-phase.js` (E.1 substrate — UNCHANGED)
- `scripts/compute-phase-calibration.js` (E.3 reader — UNCHANGED)
- `universal_stream_catalog` schema (mig 128 — UNCHANGED; mig 129 seed UNCHANGED — read by mig 148 INSERT...SELECT)
- `permits` / `coa_applications` schema (already has `lifecycle_seq` from migs 132+133 — UNCHANGED)
- `permit_phase_transitions` / `lifecycle_transitions` schemas (UNCHANGED — Phase H concern)
- Permit-side seq-keyed cohort calibration (deferred to Phase H per E.3 v2 reframe)

### Operating Boundaries

**Cross-Spec Dependencies:**
- Spec 42 §6.6.B `coa_applications.lifecycle_seq` (mig 133 writer) + `permits.lifecycle_seq` (mig 132 writer) populated by `classify-lifecycle-phase.js` (E.2 consumer)
- Spec 84 §3.4 (band design — extended with per-seq pattern)
- Spec 47 §R5 (startup guards — table-exists check for `universal_stream_catalog` since mig 148's INSERT...SELECT depends on its presence)
- Spec 48 §3.1-§3.2 (audit_table.rows for automated WARN/FAIL gates; records_meta distributions NOT passed to DeepSeek)
- Phase D dependency: `coa_applications.lifecycle_seq` populated by E.2; first-run state may have low `lifecycle_seq` coverage (most rows NULL) → reflected in `seq_unclassified_count` audit metric.

## Technical Implementation

### Part 1 — Migration 148 (per-seq band keys; INSERT...SELECT derivation from catalog)

```sql
-- migrations/148_lifecycle_seq_bands_logic_variables.sql
-- Phase E.4 — per-seq distribution band keys for assert-lifecycle-phase-distribution.js.
--
-- Derives lifecycle_seq_band_<N>_min/_max keys from
-- universal_stream_catalog.rows_count (the production snapshot baseline
-- embedded in mig 129 via docs/reports/spec_84_universal_stream_v10.csv).
--
-- Tolerance schedule (per band) — v3 fold v2-G-HIGH-2: continuous 2-branch formula
-- (no boundary discontinuity); v2 fold v1-G-CRIT: NULL (not 999999) for "no upper bound":
--   rows_count IS NULL OR 0:  band = (0, NULL)                                            — INFO-only
--   rows_count >= 1:          band = (FLOOR(rows_count * 0.7), CEIL(rows_count * 1.3) + 20) — ±30% + additive buffer
--
-- Continuity property: at rows_count=N, max - min ≈ N * 0.6 + 20 (always positive,
-- monotonically increasing). At N=1: [0, 22]. At N=29: [20, 58]. At N=30: [21, 59].
-- At N=100: [70, 150]. At N=1000: [700, 1320]. No cliffs; tiny data growth never
-- triggers spurious WARN cascade. The +20 additive buffer absorbs low-volume
-- statistical noise (Poisson sqrt-N variance dominates ±30% below ~50 rows).
--
-- v4 fold v3-Indep-MED: explicit note on rows_count=1 behavior. FLOOR(1*0.7)=0,
-- so a seq with rows_count=1 baseline has band [0, 22]. Actual=0 is in-band
-- (PASS). This is INTENTIONAL — rows_count=1 means the snapshot baseline saw
-- a single occurrence, which is statistically equivalent to zero (Poisson
-- variance dominates). Treating actual=0 as a WARN here would generate noise.
-- E.5 calibration may revisit this for regulatory-critical low-volume seqs.
--
-- Assertion logic on the JS side (v2 fold v1-G-CRIT):
--   const inBand = actual >= band.min && (band.max === null || actual <= band.max);
-- A NULL max means "no upper bound" — INFO-only tracking. A real regression sending
-- 999,999+ rows to such a seq will still surface via `seq_bands_null_catalog_count`
-- + `seq_distribution` records_meta inspection, but is NOT a WARN/FAIL gate (no
-- baseline to compare against; that's what E.5 calibration produces).
--
-- WARN-only on first deploy. E.5 (separate WF) tightens to FAIL after
-- 7 consecutive PASS runs on staging.
--
-- v2 fold v1-I-MED-3: ALSO seeds lifecycle_seq_unclassified_max in this migration
-- (not just the JSON seed file) so the assert script's Zod validation doesn't
-- throw if the script runs between migration apply and seed-script run.
--
-- v3 fold v2-conv-HIGH: ALSO creates partial indices on lifecycle_seq columns
-- to prevent full-table scans in the UNION ALL aggregate query at scale.
-- Partial indices (filtered on non-NULL) keep size small (~30% of permits +
-- ~100% of post-E.2 coa_applications).
--
-- SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.11 Phase E.4
-- SPEC LINK: docs/specs/01-pipeline/84_lifecycle_phase_engine.md §3.4
-- SPEC LINK: docs/specs/01-pipeline/48_pipeline_observability.md §3.2
--
-- v4 fold (recurring across phases): NO explicit BEGIN/COMMIT (mig 135 R8 hotfix
-- convention — runner provides outer transaction).

-- UP

-- v3 fold v2-G-HIGH-2: 2-branch continuous formula (no discontinuity).
INSERT INTO logic_variables (variable_key, variable_value, description)
SELECT
  'lifecycle_seq_band_' || seq || '_min' AS variable_key,
  CASE
    WHEN rows_count IS NULL OR rows_count = 0 THEN 0
    ELSE GREATEST(0, FLOOR(rows_count * 0.7)::INTEGER)
  END AS variable_value,
  'Min row count for lifecycle_seq=' || seq || ' (' || COALESCE(stage_label, source || ':' || status) || '). E.4 default from universal_stream_catalog snapshot; recalibrated in E.5.' AS description
FROM universal_stream_catalog
ON CONFLICT (variable_key) DO NOTHING;

INSERT INTO logic_variables (variable_key, variable_value, description)
SELECT
  'lifecycle_seq_band_' || seq || '_max' AS variable_key,
  CASE
    WHEN rows_count IS NULL OR rows_count = 0 THEN NULL  -- v2 fold v1-G-CRIT: NULL == "no upper bound"
    ELSE (CEIL(rows_count * 1.3)::INTEGER + 20)          -- v3 fold v2-G-HIGH-2: +20 additive buffer for continuity
  END AS variable_value,
  'Max row count for lifecycle_seq=' || seq || ' (' || COALESCE(stage_label, source || ':' || status) || '). E.4 default from universal_stream_catalog snapshot; recalibrated in E.5. NULL=no upper bound (INFO-only).' AS description
FROM universal_stream_catalog
ON CONFLICT (variable_key) DO NOTHING;

-- v2 fold v1-I-MED-3: seed lifecycle_seq_unclassified_max in the migration too,
-- so the assert script's Zod validation has a DB-side default immediately after
-- migration apply (independent of `seed-logic-variables.js` run order).
INSERT INTO logic_variables (variable_key, variable_value, description) VALUES
  ('lifecycle_seq_unclassified_max', 5000,
   'Max row count where lifecycle_seq IS NULL on permits or coa_applications. WARN threshold (E.4); Phase D + E.2 first-run state expected to violate. Tighten via E.5 after ramp-up.')
ON CONFLICT (variable_key) DO NOTHING;

-- v3 fold v2-conv-HIGH: partial indices on lifecycle_seq columns are added
-- by a SEPARATE migration (mig 149 — non-transactional CONCURRENTLY) per
-- the failure-mode-isolation reasoning in Part 1.5. Mig 148 stays purely
-- transactional + atomic; mig 149 handles the index builds non-transactionally.

-- DOWN — manual rollback only, intentionally not transactional
-- (Rule 6 / commit 8b1c10b; matches mig 119 convention — a transactional
-- DOWN would destroy operator-tuned values applied via admin Control Panel
-- after deployment).
--
-- To roll back manually:
--   DELETE FROM logic_variables
--    WHERE variable_key LIKE 'lifecycle_seq_band_%_min'
--       OR variable_key LIKE 'lifecycle_seq_band_%_max';
--
-- Then revert the assert-lifecycle-phase-distribution.js extension + the
-- scripts/seeds/logic_variables.json additions in one commit.
```

### Part 1.5 — Migration 149 (partial indices on `lifecycle_seq` columns; non-transactional)

```sql
-- migrations/149_lifecycle_seq_indices.sql
-- Phase E.4 — partial indices on permits.lifecycle_seq + coa_applications.lifecycle_seq
-- to support assert-lifecycle-phase-distribution.js's UNION ALL aggregate query
-- without triggering full table scans at scale.
--
-- v3 fold v2-conv-HIGH (Gemini + DeepSeek convergent): added per Engineering
-- Standards §3.1 "CREATE INDEX on tables >100K rows should use CONCURRENTLY".
--
-- Partial filter on `WHERE lifecycle_seq IS NOT NULL` keeps the index small.
-- For permits (~247K rows), only the post-E.2-classified subset is indexed
-- (gradually growing to ~70%+ as Phase D+E.2 ramps up). For coa_applications
-- (~33K rows), classifier coverage is higher (~99%+ post-E.1).
--
-- migrate.js detects CONCURRENTLY and routes this file through the non-
-- transactional path (line 195 of scripts/migrate.js). The runner does NOT
-- wrap CONCURRENTLY migrations in BEGIN/COMMIT; each statement runs in its
-- own implicit transaction. Idempotent via IF NOT EXISTS.
--
-- SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.11 Phase E.4
-- SPEC LINK: docs/specs/00_engineering_standards.md §3.1

-- UP

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_permits_lifecycle_seq
  ON permits (lifecycle_seq)
  WHERE lifecycle_seq IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_coa_applications_lifecycle_seq
  ON coa_applications (lifecycle_seq)
  WHERE lifecycle_seq IS NOT NULL;

-- DOWN — manual rollback only, intentionally not transactional (Rule 6).
-- To roll back manually:
--   DROP INDEX CONCURRENTLY IF EXISTS idx_coa_applications_lifecycle_seq;
--   DROP INDEX CONCURRENTLY IF EXISTS idx_permits_lifecycle_seq;
```

**Why split into two migrations:** the runner's `CONCURRENTLY` detection (line 195 of scripts/migrate.js) routes the ENTIRE file through the non-transactional path. If mig 148's INSERTs and the CREATE INDEX CONCURRENTLY shared one file, the INSERT failure mode would lose atomicity (partial INSERTs not rolled back). Splitting preserves: mig 148 transactional + atomic INSERTs; mig 149 non-transactional CONCURRENTLY + idempotent via IF NOT EXISTS.

**Mig 149 failure-mode (v4 fold v3-Indep-MED-A clarification):** the non-transactional path runs each statement via separate `pool.query` calls (`scripts/migrate.js` lines 196-198), THEN issues `recordApplied()` as a separate pool.query (line 200). If the second `CREATE INDEX CONCURRENTLY` succeeds but `recordApplied` fails (pool exhaustion, network drop, schema_migrations table lock), the migration is NOT recorded in `schema_migrations` and WILL re-run on the next deploy. Both index statements use `IF NOT EXISTS`, so the re-run is idempotent (no-ops both creates). This failure mode is well-defined and benign — there is no "stronger atomicity" than this; the recovery is automatic via the next run.

**Migration safety:** 221 row inserts in mig 148 (110 seqs × 2 bounds + 1 unclassified-max key). Pure logic_variables INSERTs. Idempotent via `ON CONFLICT (variable_key) DO NOTHING` — operator-tuned values applied via admin Control Panel after deployment are preserved on re-apply. No business-table writes. Expected runtime < 100ms. Mig 149: two CONCURRENTLY index builds, expected runtime ~5-30s on permits (~70K post-E.2 rows) + ~1s on coa_applications (~33K rows). Both idempotent via IF NOT EXISTS.

**Startup guard requirement:** the migration assumes `universal_stream_catalog` exists with 110 rows (created by mig 128 + seeded by mig 129). If those didn't run, mig 148 produces 0 INSERTs into the per-seq band keys but DOES insert `lifecycle_seq_unclassified_max` (the catalog dependency is only in the SELECT, not the VALUES clause). The assert script's startup guard (Part 6) catches the catalog absence.

**Dynamic seq count (v2 fold v1-conv-HIGH):** the migration does NOT hardcode a seq count anywhere. It iterates the catalog via `FROM universal_stream_catalog`. If the catalog grows to 111 or shrinks to 90 rows in a future migration, mig 148 re-apply will insert/skip rows accordingly. The assert script likewise queries the catalog at startup for the expected seq list (Part 3).

### Part 2 — `scripts/seeds/logic_variables.json` extension

Add 221 new entries matching mig 148 outputs (220 band keys + 1 unclassified-max key). Each entry follows the existing seed format. v4 fold v3-G-CRIT-formula: examples updated to the v3 2-branch continuous formula `[FLOOR(rows_count*0.7), CEIL(rows_count*1.3) + 20]` for `rows_count >= 1`:

```json
"lifecycle_seq_band_1_min": {
  "default": 0,
  "type": "number",
  "min": 0,
  "max": 99999,
  "description": "Min row count for lifecycle_seq=1 (Received). rows_count=10 → 2-branch continuous formula: FLOOR(10*0.7)=7, CEIL(10*1.3)+20=33 → [7, 33]. Recalibrated in E.5."
},
"lifecycle_seq_band_1_max": {
  "default": 33,
  "type": "number",
  "min": 0,
  "max": 999999,
  "description": "Max row count for lifecycle_seq=1 (Received). Continuous formula upper bound; recalibrated in E.5."
},
```

For high-volume seqs (e.g., seq 19 'Application Withdrawn' with `rows_count=904`), the formula yields `[FLOOR(904*0.7), CEIL(904*1.3) + 20] = [632, 1196]`:

```json
"lifecycle_seq_band_19_min": { "default": 632,  ... },
"lifecycle_seq_band_19_max": { "default": 1196, ... },
```

For NULL `rows_count` seqs (e.g., seq 22 'Closed', many inspection-stage seqs), the max is `null` (v2 fold v1-G-CRIT — NULL means "no upper bound", INFO-only tracking):

```json
"lifecycle_seq_band_22_min": { "default": 0, ... },
"lifecycle_seq_band_22_max": { "default": null, ... },
```

The defaults are deterministically derived from mig 129's `rows_count` column using the same tolerance formula as mig 148. The seeds file serves as the canonical authoritative source for fresh-database setup (read by `scripts/seed-logic-variables.js` which uses `INSERT ... ON CONFLICT DO UPDATE` semantics to apply seeds onto live DB).

**Implementation note:** the seed JSON additions are generated by a one-shot helper (`_tmp_phase_e4_seed_bands.mjs`) that reads `migrations/129_seed_universal_stream_catalog.sql`, extracts the 110-row tuples, applies the tolerance formula, and emits JSON. The helper is NOT committed to `scripts/` — it's a `_tmp_*.mjs` scratch file per project convention.

**Parity test (v2 fold v1-G-HIGH):** a NEW infra test reads `migrations/129_seed_universal_stream_catalog.sql`, applies the tolerance formula in JS (mirroring mig 148's SQL CASE), and asserts equality with `scripts/seeds/logic_variables.json` entries for all 220 band keys. Programmatic parity gate — tweaking the formula in only one place fails the test. See Test Plan #4 for spec.

### Part 3 — Aggregate counter logic + per-seq band assertion (in `assert-lifecycle-phase-distribution.js`)

```js
// ─── Per-seq band logic (Phase E.4 v3) ───────────────────────────────

// v2 fold v1-conv-HIGH: query catalog dynamically for expected seq list
// (no hardcoded 1..110). Future catalog grow/shrink is automatically tracked.
//
// v4 fold v3-DS-CRIT: conditional execution — Part 6 startup guard logs WARN
// if catalogExists=false but does NOT throw; the catalog SELECT below would
// crash with `relation does not exist` if we ran it unconditionally. Guard it.
let catalogRows = [];
if (catalogExists) {
  const res = await pool.query(
    `SELECT seq, rows_count FROM universal_stream_catalog ORDER BY seq`
  );
  catalogRows = res.rows;
}
const catalogSeqs = catalogRows.map((r) => r.seq);
// v4 fold v3-G-LOW: identifies INFO-only seqs via the catalog (source of truth)
// rather than via band.max === null (which depends on mutable logic_variables).
// Used in Part 3's classification loop to avoid operator-tampered null-max
// values incorrectly classifying real bands as INFO-only.
const catalogNullCountSeqs = new Set(
  catalogRows.filter((r) => r.rows_count == null || r.rows_count === 0).map((r) => r.seq)
);

// v3 fold v2-I-MED-A: explicit empty-catalog guard. If the catalog table exists
// (Part 6 startup check passed) but is empty (mig 128 applied, mig 129 seed not
// applied — a misapplied-migration state), force seq_bands_total to WARN AND
// emit a posture-prefixed warning. Without this, `catalogSeqs.length === 0`
// makes `seq_bands_total: 0 === 0 → PASS` and silently hides the bug.
const catalogEmptyButPresent = catalogExists && catalogRows.length === 0;
if (catalogEmptyButPresent) {
  pipeline.log.warn('[assert-lifecycle-phase-distribution]',
    'universal_stream_catalog table exists but is empty (mig 129 seed not applied) — ' +
    'per-seq assertion DISABLED for this run.');
}

// Load per-seq bands from logicVars. v2 fold v1-G-CRIT: band.max may be NULL
// (== "no upper bound" — INFO-only tracking; not a WARN/FAIL gate).
const seqBands = {};
let seqBandKeysLoaded = 0;
for (const seq of catalogSeqs) {
  const minKey = `lifecycle_seq_band_${seq}_min`;
  const maxKey = `lifecycle_seq_band_${seq}_max`;
  if (logicVars[minKey] != null) {
    // max can legitimately be null (NULL-rows_count branch). min must exist.
    seqBands[seq] = {
      min: logicVars[minKey],
      max: logicVars[maxKey] ?? null,  // null = no upper bound
    };
    seqBandKeysLoaded++;
  }
}
if (seqBandKeysLoaded < catalogSeqs.length) {
  pipeline.log.warn('[assert-lifecycle-phase-distribution]',
    `Only ${seqBandKeysLoaded}/${catalogSeqs.length} per-seq band keys loaded — ` +
    `mig 148 may not have applied. Per-seq assertion will be partial.`);
}

// v3 fold v2-G-CRIT: orphan-key detection. Catches the typo silent-failure
// mode (e.g. `lifecycle_seq_band_42_mx` instead of `_max`) that `.passthrough()`
// would otherwise allow. Any key matching the band pattern whose `<N>` is NOT
// in catalogSeqs is a typo OR a stale band for a removed seq — fail-fast at
// startup rather than silently degrade an assertion.
const BAND_KEY_PATTERN = /^lifecycle_seq_band_(\d+)_(min|max)$/;
const catalogSeqSet = new Set(catalogSeqs);
const orphanKeys = [];
for (const key of Object.keys(logicVars)) {
  const m = key.match(BAND_KEY_PATTERN);
  if (m) {
    const seqNum = Number(m[1]);
    if (!catalogSeqSet.has(seqNum)) {
      orphanKeys.push(key);
    }
  }
}
if (orphanKeys.length > 0) {
  // v4 fold v3-Indep-MED: explicit recovery path. "Re-seed via mig 148" is
  // INCORRECT — `ON CONFLICT DO NOTHING` does not delete or rename the
  // orphan key. Operators must explicitly DELETE the bad row.
  throw new Error(
    `[assert-lifecycle-phase-distribution] Orphan band keys in logic_variables ` +
    `(no matching seq in universal_stream_catalog): ${orphanKeys.slice(0, 10).join(', ')}` +
    (orphanKeys.length > 10 ? ` ... (+${orphanKeys.length - 10} more)` : '') +
    `. Likely cause: typo in operator-edited key (e.g. _mx instead of _max), ` +
    `or stale band for a seq removed from a future catalog migration. ` +
    `RECOVERY: delete the orphan key directly — either (a) via Spec 86 ` +
    `Control Panel (/admin/control-panel → marketplace constants → delete), ` +
    `or (b) DELETE FROM logic_variables WHERE variable_key IN (${orphanKeys.slice(0, 3).map((k) => `'${k}'`).join(', ')}${orphanKeys.length > 3 ? ', ...' : ''}). ` +
    `Re-seeding via mig 148 does NOT fix orphan keys — ON CONFLICT DO NOTHING ` +
    `preserves them. After deletion, re-run this script to confirm recovery.`
  );
}

// v2 fold v1-DS-MED-3: explicit extraction of unclassified threshold.
const seqUnclassifiedMax = logicVars.lifecycle_seq_unclassified_max;

// Per-seq distribution: UNION ALL of permits + coa_applications.
const { rows: seqRows } = await pool.query(`
  SELECT lifecycle_seq, COUNT(*)::int AS n
    FROM (
      SELECT lifecycle_seq FROM permits          WHERE lifecycle_seq IS NOT NULL
      UNION ALL
      SELECT lifecycle_seq FROM coa_applications WHERE lifecycle_seq IS NOT NULL
    ) u
   GROUP BY lifecycle_seq
   ORDER BY lifecycle_seq
`);

const seqDistribution = {};
for (const r of seqRows) {
  seqDistribution[r.lifecycle_seq] = r.n;
}

// Aggregate counter classification per seq.
// v2 fold v1-O-MED-2: structured violation objects (not strings) — Phase F /
// E.5 consumers can parse without regex; warning-message rendering is at
// display time, not in the data shape.
let seqBandsPassing          = 0;
let seqBandsWarn             = 0;
let seqBandsFailing          = 0;
let seqBandsNullCatalogCount = 0;  // v2 fold v1-I-HIGH-1: track INFO-only bands
const seqViolations          = [];  // structured: { seq, actual, band_min, band_max, kind }

for (const seq of catalogSeqs) {
  const band = seqBands[seq];
  if (!band) continue;  // partial-migration case — skip unloaded seqs

  const actual = seqDistribution[seq] || 0;

  // v2 fold v1-G-CRIT: null-aware upper-bound comparison.
  const inBand = actual >= band.min && (band.max === null || actual <= band.max);

  if (band.max === null) {
    // NULL-rows_count catalog branch — INFO-only band; always PASS by construction.
    seqBandsNullCatalogCount++;
    seqBandsPassing++;
  } else if (inBand) {
    seqBandsPassing++;
  } else {
    // Phase E.4 v1 posture — WARN, not FAIL. E.5 (operational gate) promotes
    // by routing increments to `seqBandsFailing` instead of `seqBandsWarn`.
    seqBandsWarn++;
    seqViolations.push({
      seq,
      actual,
      band_min: band.min,
      band_max: band.max,
      kind: 'band_violation',
    });
  }
  // seqBandsFailing stays 0 in v1; reserved for E.5 promotion path.
}

// v2 fold v1-DS-HIGH-2: symmetric difference — seqs present in DATA but NOT in
// loaded bands. Without this, a seq observed in production but missing a band
// key (partial migration, future catalog addition pre-bands, dropped seq with
// orphan rows) is invisible to all aggregate counters.
//
// v3 fold v2-G-HIGH-3: BIDIRECTIONAL — also catch "seqs in bands but not in
// data" with band.min > 0. This detects data-deletion bugs (classifier started
// skipping a seq, upstream source dropped a status, etc.) that would otherwise
// surface as `actual = 0` which is in-band for any [0, N] low-volume band.
const distributionSeqs = new Set(Object.keys(seqDistribution).map(Number));
const bandSeqs = new Set(Object.keys(seqBands).map(Number));

// Direction 1: seqs in data but not in bands → no_band_configured WARN.
for (const seq of distributionSeqs) {
  if (!bandSeqs.has(seq)) {
    seqBandsWarn++;
    seqViolations.push({
      seq,
      actual: seqDistribution[seq],
      band_min: null,
      band_max: null,
      kind: 'no_band_configured',
    });
  }
}

// Direction 2 (v3 fold v2-G-HIGH-3): seqs in bands but not in data, with
// band.min > 0 (expecting data) → expected_data_missing WARN.
// Skip NULL-bound bands (band.max === null) since they are INFO-only.
for (const seq of bandSeqs) {
  if (!distributionSeqs.has(seq)) {
    const band = seqBands[seq];
    if (band.max !== null && band.min > 0) {
      seqBandsWarn++;
      seqViolations.push({
        seq,
        actual: 0,
        band_min: band.min,
        band_max: band.max,
        kind: 'expected_data_missing',
      });
    }
  }
}

// v2 fold v1-DS-MED-4: cap violations at 50 to prevent records_meta payload bloat.
const SEQ_VIOLATIONS_CAP = 50;
const seqViolationsTruncatedCount = Math.max(0, seqViolations.length - SEQ_VIOLATIONS_CAP);
const seqViolationsCapped = seqViolations.slice(0, SEQ_VIOLATIONS_CAP);

// v2 fold v1-I-HIGH-3: REMOVED `linked_permit_num IS NULL` filter from coa
// unclassified query. E.1 removed Rule 0; linked CoAs now receive lifecycle_seq
// writes too. Keeping the filter would silently exclude 99.4% of CoAs from the
// gate. Phase-keyed `unclassified_count` (existing) keeps its legacy filter
// for baseline continuity; seq_unclassified is the corrected shape.
const { rows: [{ n: seqUnclassifiedPermits }] } = await pool.query(
  `SELECT COUNT(*)::int AS n FROM permits
    WHERE lifecycle_seq IS NULL
      AND status <> ALL($1::text[])
      AND status IS NOT NULL
      AND TRIM(status) <> ''`,
  [DEAD_STATUS_ARRAY],
);
const { rows: [{ n: seqUnclassifiedCoa }] } = await pool.query(
  `SELECT COUNT(*)::int AS n FROM coa_applications
    WHERE lifecycle_seq IS NULL
      -- v2 fold v1-I-HIGH-3: linked_permit_num IS NULL filter REMOVED
      -- (E.1 fold v1-1 removed Rule 0; classifier now writes lifecycle_seq
      -- to ALL CoA rows regardless of link state).
      AND lower(trim(regexp_replace(COALESCE(decision,''), '\\s+', ' ', 'g')))
          <> ALL($1::text[])
      AND decision IS NOT NULL
      AND TRIM(decision) <> ''`,
  [NORMALIZED_DEAD_DECISIONS_ARRAY],
);
const seqUnclassifiedCount = seqUnclassifiedPermits + seqUnclassifiedCoa;
```

**v2 fold v1-O-MED-1 (relationship doc):** In steady state, `seq_unclassified_count >= unclassified_count` is expected — the seq column is finer-grained (every row with a non-NULL phase MIGHT still have NULL seq during E.2 ramp-up). The two metrics measure different ramp-up windows: `unclassified_count` is the phase-keyed legacy CQA gate (FAIL on threshold); `seq_unclassified_count` is the seq-keyed observability signal (WARN-only in E.4 v1; E.5 promotes after stability). Convergence of the two counters is the E.5 operational gate.

### Part 4 — 6 new audit_table.rows entries (v2 fold v1-I-HIGH-1 adds `seq_bands_null_catalog_count`)

Appended to the existing 23-row audit_table (totals 29 rows):

```js
// v3 fold v2-I-MED-A: empty-catalog state forces WARN regardless of loaded
// count equality (0 === 0 would otherwise incorrectly pass).
// v3 fold v2-O-HIGH-2: when this row WARNs, ALSO push a posture-prefixed entry
// to warnings[] so the followup file carries the "[E.4 WARN-ONLY POSTURE]"
// signal consistent with other E.4 WARNs.
const seqBandsTotalStatus =
  catalogEmptyButPresent ? 'WARN' :
  Object.keys(seqBands).length === catalogSeqs.length ? 'PASS' : 'WARN';
// v4 fold v3-DS-MED-threshold: empty-catalog case uses a distinct threshold
// message so the audit row doesn't render as a misleading "0/0 expected — WARN."
const seqBandsTotalThreshold = catalogEmptyButPresent
  ? '0 rows in universal_stream_catalog — verify mig 129 seed applied (expected ~110)'
  : `== ${catalogSeqs.length} expected (dynamic from universal_stream_catalog; WARN on partial mig 148 apply)`;
auditRows.push({
  metric: 'seq_bands_total',
  value: Object.keys(seqBands).length,
  threshold: seqBandsTotalThreshold,
  status: seqBandsTotalStatus,
});
if (seqBandsTotalStatus === 'WARN') {
  if (catalogEmptyButPresent) {
    warnings.push(
      `[E.4 STARTUP STATE] universal_stream_catalog table exists but is empty ` +
      `(mig 129 seed not applied) — per-seq assertion DISABLED for this run. ` +
      `Apply mig 129 to enable per-seq gating.`
    );
  } else {
    warnings.push(
      `[E.4 WARN-ONLY POSTURE — partial mig 148 apply expected during ramp-up] ` +
      `seq_bands_total ${Object.keys(seqBands).length}/${catalogSeqs.length} band keys loaded — ` +
      `verify mig 148 applied cleanly. Per-seq assertion will be partial until next migration apply.`
    );
  }
}
auditRows.push({
  metric: 'seq_bands_passing',
  value: seqBandsPassing,
  threshold: null,
  status: 'INFO',
});
// v2 fold v1-I-HIGH-1: operator-decomposition signal — distinguishes "real PASS"
// (band matched non-NULL rows_count) from "INFO-only PASS" (NULL rows_count
// catalog branch, always PASS by construction; not a meaningful gate signal).
// passing = real_passing + null_catalog. Operators reading `seq_bands_passing:
// 95` can now subtract `seq_bands_null_catalog_count: 42` → 53 real PASSes.
auditRows.push({
  metric: 'seq_bands_null_catalog_count',
  value: seqBandsNullCatalogCount,
  threshold: null,
  status: 'INFO',
});
auditRows.push({
  metric: 'seq_bands_warn',
  value: seqBandsWarn,
  threshold: '== 0 PASS, > 0 WARN (E.4 first-deploy posture; E.5 tightens to FAIL)',
  status: seqBandsWarn === 0 ? 'PASS' : 'WARN',
});
auditRows.push({
  metric: 'seq_bands_failing',
  value: seqBandsFailing,
  threshold: '== 0 PASS, > 0 FAIL (E.5 promotion hook; always 0 in E.4 v1)',
  status: seqBandsFailing === 0 ? 'PASS' : 'FAIL',
});
auditRows.push({
  metric: 'seq_unclassified_count',
  value: seqUnclassifiedCount,
  threshold: `<= ${seqUnclassifiedMax} (WARN above)`,
  status: seqUnclassifiedCount <= seqUnclassifiedMax ? 'PASS' : 'WARN',
});

// v2 fold v1-O-CRIT: surface top 10 violations DIRECTLY in the warnings[] array
// (which IS captured by pipeline.log.warn → followup file). Structured objects
// are rendered to human-readable strings at this display layer; the underlying
// data lives in records_meta.seq_violations for DB-side programmatic inspection.
//
// v3 fold v2-I-HIGH-F: corrected truncation math. The "more in records_meta"
// count must reference seqViolationsCapped.length (what's actually IN records_meta)
// not seqViolations.length (the full uncapped array). Separately surface the
// truncated overflow count.
if (seqBandsWarn > 0) {
  const previewCount = Math.min(10, seqViolationsCapped.length);
  const renderViolation = (v) => {
    if (v.kind === 'no_band_configured') {
      return `seq ${v.seq}: ${v.actual} rows but NO BAND configured`;
    }
    if (v.kind === 'expected_data_missing') {
      // v4 fold v3-Indep-Obs-MED: neutral rendering — "possible data deletion"
      // was alarming for first-deploy state where the cause is more often
      // (a) classifier hasn't yet written this seq, (b) upstream source hasn't
      // produced this status, or (c) catalog adds preceded data — not actual
      // data loss. Operator triage decision needs all four hypotheses.
      return `seq ${v.seq}: 0 rows observed (band expects min=${v.band_min}) — verify classifier coverage, source freshness, or catalog vs production data drift`;
    }
    return `seq ${v.seq}: ${v.actual} outside [${v.band_min}, ${v.band_max ?? '∞'}]`;
  };
  const preview = seqViolationsCapped.slice(0, previewCount).map(renderViolation).join('; ');
  const remainderInRecordsMeta = seqViolationsCapped.length - previewCount;
  const truncatedSuffix = seqViolationsTruncatedCount > 0
    ? ` (${seqViolationsTruncatedCount} additional violations TRUNCATED — see records_meta.seq_violations_truncated_count)`
    : '';
  warnings.push(
    `[E.4 WARN-ONLY POSTURE — expected during first-deploy / Phase D ramp-up] ` +
    `${seqBandsWarn} per-seq bands outside expected range — first ${previewCount}: ${preview}` +
    (remainderInRecordsMeta > 0 ? ` ... (+${remainderInRecordsMeta} more in records_meta.seq_violations)` : '') +
    truncatedSuffix
  );
}
if (seqUnclassifiedCount > seqUnclassifiedMax) {
  warnings.push(
    `[E.4 WARN-ONLY POSTURE] seq_unclassified_count ${seqUnclassifiedCount} exceeds ${seqUnclassifiedMax} — Phase D/E.2 first-run state likely; verify classifier coverage. ` +
    `(In steady state seq_unclassified_count >= unclassified_count; the two converge as E.5 ramps up.)`
  );
}
```

`verdict` cascade is unchanged: `FAIL` if any row has `status==='FAIL'`, else `WARN` if any has `status==='WARN'`, else `'PASS'`. Per the v1 posture, only `total_buckets`-style FAIL gates can produce FAIL; `seq_bands_failing` exists as a future-promotion hook but starts at 0 in E.4 v1. The "[E.4 WARN-ONLY POSTURE — expected during first-deploy / Phase D ramp-up]" prefix on the warning string makes the operator-facing followup report immediately readable as expected first-run noise rather than alarming WARN cascade.

### Part 5 — `records_meta.seq_distribution` + structured violations (v2 fold v1-O-CRIT + v1-DS-MED-4 + v1-O-MED-2)

```js
pipeline.emitSummary({
  records_total: ...,  // existing — phase-keyed sum; preserved
  records_new: 0,
  records_updated: 0,
  records_meta: {
    phase_distribution: allCounts,           // existing
    unclassified_count: unclassifiedCount,    // existing
    // E.4 NEW — per Spec 48 §3.2: distributions in records_meta, NOT in
    // audit_table.rows (DeepSeek observer doesn't ingest these fields).
    seq_distribution: seqDistribution,
    // v2 fold v1-O-MED-2: STRUCTURED violation objects (not strings).
    // Phase F / E.5 can parse without regex. Display rendering happens at
    // operator-narrative time in the warnings[] array (Part 4).
    // v2 fold v1-DS-MED-4: capped at 50 entries; overflow tracked via
    // seq_violations_truncated_count to prevent records_meta JSONB bloat.
    seq_violations: seqViolationsCapped,                        // up to 50 structured objects
    seq_violations_truncated_count: seqViolationsTruncatedCount, // 0 in normal cases
    // v2 fold v1-O-CRIT documentation: these records_meta fields are DB-side
    // only — the Spec 48 observer's extractIssues() reads ONLY audit_table.rows.
    // Operator-facing followup-file violations come from the warnings[] array
    // (Part 4). For full violation inspection: query pipeline_runs.records_meta.
    audit_table: {
      phase: 22,
      name: 'Assert Lifecycle Phase Distribution',
      verdict,
      rows: auditRows,
    },
  },
});
```

**v2 fold v1-O-HIGH-2 (records_total vs seq_distribution sum gap):** the existing `records_total` calculation continues to sum phase-keyed `allCounts` (excluding the synthetic `P9-P17` aggregate). The new `seq_distribution` map sums to a SMALLER number during Phase D/E.2 ramp-up because rows with `lifecycle_phase NOT NULL` may still have `lifecycle_seq IS NULL`. This gap is EXPECTED, not a pipeline integrity failure. Spec 84 §3.4 amendment (Spec Amendments Part 9) documents this for future consumers comparing the two.

### Part 6 — Startup guards

```js
// Existing — DEAD_STATUS_ARRAY + NORMALIZED_DEAD_DECISIONS_ARRAY guards (preserved)

// E.4 NEW — universal_stream_catalog table-exists check.
// Defensive: if the catalog migration (128/129) hasn't run, mig 148 would
// have produced 0 inserts and seqBandKeysLoaded === 0 (handled gracefully in
// Part 3). But it's clearer to detect the upstream migration gap explicitly.
const { rows: [{ exists: catalogExists }] } = await pool.query(
  `SELECT EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_schema = 'public' AND table_name = 'universal_stream_catalog') AS exists`
);
if (!catalogExists) {
  pipeline.log.warn('[assert-lifecycle-phase-distribution]',
    'universal_stream_catalog table missing — Phase B migrations 128/129 not applied. ' +
    'Per-seq bands will be empty (seqBandKeysLoaded=0); only phase-keyed assertions will run.');
}
```

### Part 7 — Zod schema extension (v2 fold v1-G-MED-1: dynamic iteration via passthrough discovery)

The Zod schema cannot generate per-seq keys at module-load time because the catalog query (which returns the list of seqs) happens at runtime inside the `withAdvisoryLock` block. Two-stage validation pattern:

**Stage 1 — module-level static schema** (validates known fixed keys):

```js
const LOGIC_VARS_SCHEMA = z.object({
  lifecycle_unclassified_max: z.coerce.number().finite().nonnegative().int(),
  // v2 fold v1-I-MED-3: required key (also seeded by mig 148, so always present).
  lifecycle_seq_unclassified_max: z.coerce.number().finite().nonnegative().int(),
  lifecycle_cross_stalled_threshold: z.coerce.number().finite().nonnegative().int(),
  lifecycle_cross_active_inspection_threshold: z.coerce.number().finite().nonnegative().int(),
  lifecycle_cross_issued_threshold: z.coerce.number().finite().nonnegative().int(),
  ..._bandShape,  // existing phase-keyed bands
}).passthrough().superRefine((data, ctx) => {
  // Existing min>max guard for phase bands (preserved unchanged).
  for (const suffix of Object.values(PHASE_TO_LOGIC_VAR_SUFFIX)) {
    const min = data[`lifecycle_band_${suffix}_min`];
    const max = data[`lifecycle_band_${suffix}_max`];
    if (Number.isFinite(min) && Number.isFinite(max) && min > max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `lifecycle_band_${suffix}: min (${min}) > max (${max}) — band would never match`,
      });
    }
  }
});
```

The `.passthrough()` modifier means the 220 per-seq band keys pass through validation silently (they are not part of the static schema). Stage 2 validates them dynamically.

**Stage 2 — runtime per-seq validation** (inside `withAdvisoryLock`, after catalog query):

```js
// After catalogSeqs is loaded (Part 3), validate per-seq band shape.
// v4 fold v3-G-HIGH: explicit nonnegative checks — parity with the static
// Zod schema's `.nonnegative()` modifier on phase-keyed bands. Without this,
// an operator-edited band with `min=-10` would pass shape validation but
// silently disable the lower-bound check (`actual >= -10` is always true).
for (const seq of catalogSeqs) {
  const min = logicVars[`lifecycle_seq_band_${seq}_min`];
  const max = logicVars[`lifecycle_seq_band_${seq}_max`];
  // min must be present (cannot be null — bands without min are unusable).
  if (min != null && (!Number.isFinite(Number(min)) || Number(min) < 0)) {
    throw new Error(`lifecycle_seq_band_${seq}_min: invalid value '${min}' — expected non-negative integer`);
  }
  // max may be NULL (v2 fold v1-G-CRIT: NULL == no upper bound). If non-null, must be finite + non-negative.
  if (max != null && (!Number.isFinite(Number(max)) || Number(max) < 0)) {
    throw new Error(`lifecycle_seq_band_${seq}_max: invalid value '${max}' — expected non-negative integer or NULL`);
  }
  if (min != null && max != null && Number(min) > Number(max)) {
    throw new Error(`lifecycle_seq_band_${seq}: min (${min}) > max (${max}) — band would never match`);
  }
}
```

This pattern (passthrough at module level + dynamic runtime validation against the catalog query) avoids the "schema knows about 110 keys but reality has 111" failure mode that hardcoded ranges would produce.

### Part 8 — `lifecycle_seq_unclassified_max` seed default (mirror of mig 148 INSERT)

```json
"lifecycle_seq_unclassified_max": {
  "default": 5000,
  "type": "number",
  "min": 0,
  "max": 100000,
  "description": "Max row count where lifecycle_seq IS NULL on permits or coa_applications. WARN threshold (E.4); Phase D + E.2 first-run state expected to violate. Tighten via E.5 after ramp-up."
}
```

Default deliberately wide (5000 ≈ ~2% of total permit row count) — Phase D + E.2 first-run state expected to have substantial NULL-seq backlog. v2 fold v1-I-MED-3: this key is ALSO inserted by mig 148 SQL (Part 1) so the DB-side default exists immediately after migration apply, before `seed-logic-variables.js` runs.

### Database Impact

**YES — migration 148 ships in E.4.**

- `logic_variables` table: 220 new band keys + 1 unclassified-max key = 221 new rows.
- No business-table schema changes.
- No data backfill needed (catalog already populated by mig 129).
- All keys are ON CONFLICT DO NOTHING — idempotent.
- Backfill strategy: the migration IS the backfill (INSERT...SELECT from catalog).

### Standards Compliance (`00_engineering_standards.md`)

- **§2.1 Unhappy Path Tests:** new tests cover (a) mig 148 against missing universal_stream_catalog (gracefully no-ops); (b) script behavior when seqBandKeysLoaded < 110 (partial assertion + WARN log); (c) script behavior when min > max for a band (Zod throws at startup).
- **§2.2 Try-Catch Boundary:** N/A — pipeline script, not an API route. Existing `pipeline.run` envelope provides top-level error capture.
- **§3.1 Add-Backfill-Drop:** N/A — no business-table column adds. logic_variables additions are ON CONFLICT DO NOTHING, idempotent.
- **§3.2 Pagination:** N/A — assert script reads aggregate queries (bounded ≤220 rows), not raw business-table scans.
- **§6.1 logError Mandate:** existing `pipeline.log.warn` + `pipeline.log.error` paths preserved. New code uses the same helpers.
- **§7 Dual Code Path:** N/A — assert script is pure backend; no TS twin.
- **§9.1 Transaction Boundaries:** N/A — assert script is read-only; no mutating transactions to wrap.
- **§9.2 Parameter Limit:** N/A — no batch INSERTs in the script. Mig 148's INSERT...SELECT generates ~220 rows via the catalog source; PG runs this in a single statement without parameter-limit concerns.
- **§9.3 Idempotency:** mig 148 is `ON CONFLICT DO NOTHING`. Re-runs are no-ops. Assert script is read-only — fully idempotent by construction.

### Spec 47 §R1-R12 Compliance (existing — extension preserves envelope)

- **§R1 SDK imports:** unchanged.
- **§R2 Advisory lock ID:** unchanged (109; quality-script sequential per §A.5 Bundle G).
- **§R3 Batch size:** N/A — read-only script.
- **§R3.5 RUN_AT:** existing path preserved (not strictly required for read-only script, but harmless).
- **§R4 Zod config validation:** extended with 220 new band keys (all `.optional()`) + 1 new threshold key.
- **§R5 Startup guards:** existing DEAD_STATUS_ARRAY + NORMALIZED_DEAD_DECISIONS_ARRAY guards preserved + NEW universal_stream_catalog EXISTS check.
- **§R6 Advisory lock:** existing `pipeline.withAdvisoryLock(pool, 109, ...)` preserved.
- **§R7 Data read:** existing `pool.query` aggregate pattern preserved + new UNION ALL aggregate query.
- **§R8 Pure-function computation:** band classification logic is inline-pure (no shared lib extraction needed — single consumer).
- **§R9 Atomic write:** N/A — read-only.
- **§R10 PIPELINE_SUMMARY with audit_table:** extended with 5 new aggregate rows (verdict cascade unchanged — derives from `auditRows.some(r => r.status === 'FAIL' || 'WARN')`).
- **§R11 emitMeta:** extended to include `universal_stream_catalog` read.
- **§R12 CQA gate:** existing `failures.length > 0 → throw` gate preserved. Per-seq WARNs do NOT throw (E.4 v1 posture; E.5 promotion path reserved).

### Spec 48 Pipeline Observability Adherence

- **§3.1 audit_table.rows enumeration:** 29 total rows after E.4 (existing 23 + 6 new aggregates including `seq_bands_null_catalog_count`). Within reasonable Spec 48 observer narrative budget (DeepSeek context includes all audit rows; 29 is well below the established ceiling of ~138 rows in `assert-global-coverage.js`).
- **§3.2 distributions in records_meta:** the 110-row `seq_distribution` map ships in `records_meta`, NOT in `audit_table.rows`. Preserves observer narrative focus on aggregates.
- **§3.3 observer report file routing:** `assert-lifecycle-phase-distribution` runs in BOTH permits + coa chains; observer writes audit_table to BOTH `permits-followup.md` AND `coa-followup.md`. Existing routing — no change.
- **§3.4 records_total accuracy:** existing `records_total` calculation preserved (sums phase counts excluding the synthetic P9-P17 aggregate).

### Tests (TDD cadence per WF1 Red Light/Green Light)

1. **`src/tests/migration-148-lifecycle-seq-bands.infra.test.ts`** (NEW) — mig 148 shape regression:
   - Two INSERT...SELECT statements both reference `universal_stream_catalog` source.
   - Generates `lifecycle_seq_band_<N>_min/_max` keys per seq.
   - Tolerance formula (v2 fold v1-G-CRIT): `rows_count >= 30 → ±30%`; `1-29 → [0, max*5]`; `NULL/0 → [0, NULL]` (NULL = no upper bound).
   - Separate VALUES insert for `lifecycle_seq_unclassified_max` with default 5000 (v2 fold v1-I-MED-3).
   - `ON CONFLICT DO NOTHING` semantics on all 3 INSERT statements (operator-tuned values preserved).
   - No explicit BEGIN/COMMIT (mig 135 R8 convention).
   - Comment-only DOWN block (Rule 6).

2. **`src/tests/assert-lifecycle-phase-distribution.infra.test.ts`** (EXTEND) — Phase E.4 v2 shape regression assertions:
   - Dynamic catalog query (`SELECT seq, rows_count FROM universal_stream_catalog`) present — no hardcoded 1..110 loop range.
   - UNION ALL aggregate query against `permits` + `coa_applications`.
   - 6 new audit_table.rows entries present (`seq_bands_total`, `_passing`, `_null_catalog_count`, `_warn`, `_failing`, `seq_unclassified_count`).
   - `records_meta.seq_distribution` map emitted.
   - `records_meta.seq_violations` is an ARRAY OF STRUCTURED OBJECTS (not strings) with shape `{seq, actual, band_min, band_max, kind}` — v2 fold v1-O-MED-2.
   - `records_meta.seq_violations_truncated_count` scalar present — v2 fold v1-DS-MED-4.
   - `lifecycle_seq_unclassified_max` validated via LOGIC_VARS_SCHEMA.
   - `universal_stream_catalog` EXISTS guard present.
   - Per-seq min>max validation runs at the catalog-query stage (Part 7 Stage 2), not in module-level Zod schema.
   - `seq_bands_warn` status logic uses WARN (NOT FAIL) per v1 posture.
   - `linked_permit_num IS NULL` filter ABSENT from `seqUnclassifiedCoa` query (v2 fold v1-I-HIGH-3).
   - Symmetric-difference detection logic present — seqs in distribution but not in bands emit a `kind: 'no_band_configured'` violation (v2 fold v1-DS-HIGH-2).
   - Null-aware band classification: `band.max === null || actual <= band.max` (v2 fold v1-G-CRIT).
   - Warnings preview includes the `[E.4 WARN-ONLY POSTURE — expected during first-deploy / Phase D ramp-up]` prefix.

3. **`scripts/seeds/logic_variables.json`** completeness — extend existing seed test to assert presence of all 220 band keys + `lifecycle_seq_unclassified_max`. Allow `null` value for `_max` keys (v2 fold v1-G-CRIT — NULL == no upper bound).

4. **`src/tests/lifecycle-seq-bands-parity.infra.test.ts`** (NEW — v2 fold v1-G-HIGH; v4 fold v3-G-CRIT-formula corrects to 2-branch) — mig-vs-seed parity test:
   - Read `migrations/129_seed_universal_stream_catalog.sql` and extract each seq's `rows_count` value via regex on the INSERT...VALUES tuples. Regex robustness: anchor on `^\s*\((\d+),` for seq + use tuple-position offset (rows_count is the 20th column per mig 129's column list) — document the column-offset in a test-internal constant so future mig 129 column re-orderings are explicit.
   - Apply the v3 2-branch continuous tolerance formula in JS (identical to mig 148's SQL CASE post-v3 fold v2-G-HIGH-2):
     - `rows_count IS NULL OR 0 → min=0, max=null`  (INFO-only branch)
     - `rows_count >= 1 → min=Math.max(0, Math.floor(rows_count * 0.7)), max=Math.ceil(rows_count * 1.3) + 20`  (continuous +20 buffer)
   - Read `scripts/seeds/logic_variables.json` and assert every `lifecycle_seq_band_<N>_min/_max` entry's `default` value equals the JS-computed value. NULL `max` in the seed JSON must equal `null` (not the string "null" — explicit type assertion).
   - Programmatic parity gate — tweaking the formula in either side without the other fails the test.
   - Edge-case test: rows_count=1 → band=[0, 22]; rows_count=29 → band=[20, 58]; rows_count=30 → band=[21, 59] (verify continuity at the former boundary); rows_count=904 → band=[632, 1196] (verify +20 additive buffer in high-volume).

### Pre-Review Self-Checklist (16 items — v2)

- (a) Scope is per-seq band assertion + 1 unclassified-seq counter; NO classifier changes, NO business-table schema, NO `compute-phase-calibration.js` changes.
- (b) Bands derived deterministically from `universal_stream_catalog.rows_count` via mig 148 INSERT...SELECT — no manual seed maintenance.
- (c) WARN-only posture on first deploy (E.5 promotion path reserved via `seq_bands_failing` audit row).
- (d) Per-seq distribution map in `records_meta` (Spec 48 §3.2); 6 aggregate counters in `audit_table.rows` (§3.1).
- (e) `universal_stream_catalog` EXISTS guard added per Spec 47 §R5.
- (f) Module-level Zod schema is static (existing keys + 1 new threshold); per-seq band keys pass through `.passthrough()` and are validated dynamically against `catalogSeqs` (v2 fold v1-G-MED-1 + v1-conv-HIGH).
- (g) Min>max guard preserved for phase bands + extended to per-seq bands via Stage 2 runtime validation (v2 fold v1-L: explicit `Number.isFinite` checks).
- (h) Mig 148 has no explicit BEGIN/COMMIT (mig 135 R8 convention).
- (i) Mig 148 DOWN block is comment-only (Rule 6).
- (j) Mig 148 ALSO seeds `lifecycle_seq_unclassified_max` (v2 fold v1-I-MED-3) — assert script's Zod validation doesn't throw on first apply.
- (k) v2 fold v1-G-CRIT: NULL upper-bound (not magic `999999`) for catalog rows with `rows_count IS NULL OR 0`. Null-aware classification logic.
- (l) v2 fold v1-O-CRIT: violations surfaced via `warnings[]` array (visible to followup file); `records_meta.seq_violations` is DB-only (capped at 50 structured objects).
- (m) v2 fold v1-I-HIGH-3: `linked_permit_num IS NULL` filter REMOVED from `seqUnclassifiedCoa` query (post-E.1 correctness — Rule 0 removed).
- (n) v2 fold v1-DS-HIGH-2: symmetric-difference detection — seqs in data but not in bands emit `kind: 'no_band_configured'` violations.
- (o) v2 fold v1-I-HIGH-1: new `seq_bands_null_catalog_count` INFO metric distinguishes first-run noise from real PASSes.
- (p) Tests: mig 148 shape, script extension shape, seed completeness, mig-vs-seed parity (v2 fold v1-G-HIGH).
- (q) Spec amendments: §6.11 Phase E.4 anchor + §3.4 band-design extension (incl. records_total/seq_distribution gap doc per v2 fold v1-O-HIGH-2) + 84-W4 entry note + spec lock on records_meta DB-only fields.

### Execution Plan (per WF1 in `.claude/workflows.md`)

- [ ] **Contract Definition:** mig 148 INSERT...SELECT shape; 5 new audit_table.rows; records_meta.seq_distribution map; lifecycle_seq_unclassified_max threshold key.
- [ ] **Spec & Registry Sync:** apply 2 spec amendments post-commit. `npm run system-map`.
- [ ] **Schema Evolution:** migration 148 (logic_variables-only; no business-table schema change).
- [ ] **Test Scaffolding (TDD Red Light):** scaffold mig 148 shape test + assert script extension tests + seed completeness test. All new tests fail; existing tests green.
- [ ] **Red Light:** confirm failing.
- [ ] **Implementation:**
  - Migration 148 INSERT...SELECT (Part 1) ~65 lines (incl. 3rd INSERT for `lifecycle_seq_unclassified_max` + NULL upper-bound + continuous +20 buffer formula).
  - Migration 149 (Part 1.5) — NEW — CREATE INDEX CONCURRENTLY on `permits.lifecycle_seq` + `coa_applications.lifecycle_seq` (~30 lines, non-transactional file).
  - Seed JSON additions (Part 2) ~221 entries (helper-generated; NULL `max` for INFO-only bands; +20 buffer formula in helper, NOT committed `_tmp_*.mjs`).
  - Script extension — dynamic catalog query + empty-catalog guard + per-seq band loading + orphan-key detection + UNION ALL distribution + bidirectional symmetric-difference + structured violations (Part 3) ~160 lines.
  - 6 new audit_table.rows entries (incl. `seq_bands_null_catalog_count`) + empty-catalog WARN override + structured-warnings preview with truncation math fix (Part 4) ~80 lines.
  - records_meta.seq_distribution + structured `seq_violations` + truncated count (Part 5) ~10 lines.
  - Startup guard for universal_stream_catalog (Part 6) ~15 lines.
  - Zod schema extension — static module-level + dynamic Stage 2 runtime validation (Part 7) ~40 lines.
  - lifecycle_seq_unclassified_max seed entry (Part 8) ~10 lines.
- [ ] **Auth Boundary & Secrets:** N/A.
- [ ] **Pre-Review Self-Checklist (16 items):** walk against diff.
- [ ] **Multi-Agent Review (4 reviewers parallel — diff stage):**
  - Gemini: `npm run review:gemini -- review scripts/quality/assert-lifecycle-phase-distribution.js --context docs/specs/01-pipeline/47_pipeline_script_protocol.md`
  - DeepSeek: `npm run review:deepseek -- review scripts/quality/assert-lifecycle-phase-distribution.js --context docs/specs/01-pipeline/48_pipeline_observability.md`
  - Independent worktree: Spec 47 §R1-R12 + Spec 84 §3.4 band-design verification + Engineering Standards §9 walkthrough + mig-vs-seed parity verification.
  - Observability worktree: Spec 48 lens + 29-row audit_table + structured `seq_violations` shape + WARN-only posture + warnings-array operator-narrative verification.
- [ ] **Green Light:** `npm run typecheck && npm run lint && npm run test`; mig 148 apply verification; parity test green.
- [ ] **Operator pre-ack:** commit message includes WARN-only posture note + Phase D/E.2 first-run state acknowledgement + `[E.4 WARN-ONLY POSTURE — expected during first-deploy / Phase D ramp-up]` annotation guidance.
- [ ] **WF6 commit:** Single commit. Message: `feat(84_lifecycle_phase_engine): WF1 Phase E.4 — per-seq distribution bands + assert-lifecycle-phase-distribution.js extension + mig 148 lifecycle_seq_band keys (220 + 1 unclassified-max) + 6 new audit rows + records_meta.seq_distribution + 2 spec amendments`.
- [ ] **Followups append:** `docs/reports/review_followups.md`.

### Spec Amendments (2)

1. **Spec 42 §6.11 Phase E.4 row** — fill `[E.4-COMMIT]` post-commit. Append note: "Per-seq bands derived from `universal_stream_catalog.rows_count` via mig 148 INSERT...SELECT (220 band keys + 1 unclassified-max key = 221 inserts total). Catalog `rows_count IS NULL` (~40-50 of 110 seqs — inspection-stage + low-volume permit-status) maps to band `[0, NULL]` (INFO-only, no upper bound). Dynamic catalog query at script startup (no hardcoded seq count). WARN-only posture on first deploy; E.5 (separate WF) tightens to FAIL after 7 consecutive PASS runs on staging. Violations surfaced via `warnings[]` for followup-file visibility; full structured violation array in `records_meta.seq_violations` (DB-only, capped at 50)."

2. **Spec 84 §3.4 band design** — extend with per-seq band pattern documentation: "Per-seq bands (E.4 commit `[E.4-COMMIT]`) cover Universal Stream catalog seq 1-110 with ±30% tolerance from snapshot baseline (`rows_count >= 30`), wide `[0, max*5]` for low-volume (`1-29`), and INFO-only `[0, NULL]` for `rows_count IS NULL OR 0`. Bands are operator-tunable via Spec 86 Control Panel. Phase-keyed bands (existing 19) coexist as the coarse safety net. Per-seq distribution map shipped in `records_meta.seq_distribution` (Spec 48 §3.2) — not in `audit_table.rows` (avoids observer narrative balloon). **`records_total` vs `sum(seq_distribution.values())` divergence (v2 fold v1-O-HIGH-2):** during Phase D/E.2 ramp-up, `sum(seq_distribution.values()) < records_total` because many rows have `lifecycle_phase` set but not yet `lifecycle_seq`. Expected; not a pipeline integrity failure. Convergence is the E.5 operational gate. **`linked_permit_num` post-E.1 (v2 fold v1-I-HIGH-3):** E.1 removed Rule 0; `classifyCoaPhase()` now writes `lifecycle_seq` to ALL CoA rows regardless of `linked_permit_num`. The `seq_unclassified_count` gate correctly does NOT filter on `linked_permit_num IS NULL` (matches post-E.1 reality). The legacy phase-keyed `unclassified_count` keeps its filter unchanged for baseline continuity (legacy shape)."

---

> **PLAN LOCKED (v4) — authorized for implementation per user authorization.**
>
> v3 plan-review surfaced 2 CRITs + 1 HIGH + 6 MEDs (9 actionable). v4 folds all 9. Per user authorization: v4 PLAN LOCKs DIRECTLY without another plan-review round; diff-stage 4-reviewer round runs AFTER implementation to catch any new bugs introduced by the folds. Convergence trajectory: v1=14 → v2=8 → v3=9 → v4 ships.
>
> §10 note: v4 load-bearing changes on top of v3:
> (a) Catalog `SELECT` query guarded by `if (catalogExists)` (CRIT — DeepSeek) — prevents crash on missing catalog table; restores Part 6 guard's effectiveness.
> (b) All formula references aligned to 2-branch continuous formula (CRIT — Gemini + 3-way convergent) — mig 148 SQL, seed examples in Part 2, parity test spec in Test #4. Seq 1 example corrected to [7, 33]; seq 19 to [632, 1196].
> (c) Stage 2 Zod validation gains `Number(min/max) < 0` checks (HIGH — Gemini) — parity with `.nonnegative()` modifier on phase-keyed bands.
> (d) `catalogNullCountSeqs` repurposed (2/4 convergent MED) — INFO-only identification routes through catalog instead of mutable logic_variables.
> (e) `expected_data_missing` neutral rendering (Indep+Obs convergent MED) — replaces alarming "possible data deletion" with 4-hypothesis prompt for operator triage.
> (f) Orphan-key recovery path explicit (Indep MED) — DELETE command in error message; no more misleading "re-seed via mig 148."
> (g) rows_count=1 always-PASS behavior documented (Indep MED-doc).
> (h) Mig 149 `recordApplied` failure-mode clarified (Indep MED-doc).
> (i) Empty-catalog threshold message bifurcated (DeepSeek MED) — distinct from partial-mig case.
>
> v3 (legacy) load-bearing changes preserved:
> (1) Orphan band-key detection (CRIT) — catches typos like `_mx` instead of `_max` that `.passthrough()` would otherwise allow to silently disable the assertion. Throws at startup with diagnostic list.
> (2) Partial indices on `lifecycle_seq` columns (HIGH-perf) — new migration 149 (non-transactional `CREATE INDEX CONCURRENTLY`). Prevents full-table scans on ~250K + 33K rows.
> (3) Continuous 2-branch tolerance formula (HIGH-correctness) — `[FLOOR(rows_count*0.7), CEIL(rows_count*1.3) + 20]`. No discontinuity at the previous `rows_count=30` boundary. Tiny growth never triggers spurious WARN cascade.
> (4) Bidirectional symmetric-difference (HIGH-coverage) — second loop catches "seqs in bands but not in data" with `band.min > 0`, emitting `kind: 'expected_data_missing'` WARNs. Detects classifier-skip and data-deletion bugs that the unidirectional check missed.
> (5) Truncation math fix (HIGH-correctness) — preview suffix now correctly uses `seqViolationsCapped.length - previewCount` (not the uncapped array length); separate truncation note when `seqViolationsTruncatedCount > 0`. Operator triage info now accurate.
> (6) Doc consistency (HIGH-test-author-safety) — 2 stale "28/5" references corrected to "29/6" throughout.
> (7) `[E.4 WARN-ONLY POSTURE]` prefix on `seq_bands_total` WARN (HIGH-UX) — paired `warnings.push` ensures consistency with other E.4 WARNs in the followup file.
> (8) Empty-catalog state explicit handling (MED-correctness) — `catalogExists && catalogRows.length === 0` forces `seq_bands_total` to WARN with `[E.4 STARTUP STATE]` prefix instead of `0 === 0 → PASS` silently hiding the misapplied-migration state.
>
> v3 total audit_table.rows: 29 (existing 23 + 6 new). Migration files now 2 (mig 148 transactional INSERTs + mig 149 non-transactional CONCURRENTLY indices).
>
> DO NOT generate code. DO NOT modify scripts. TERMINATE RESPONSE until v3 4-reviewer plan-review round completes + user authorization.

> **PLAN LOCKED (v4) — AUTHORIZED.**
> Proceed to Implementation: scaffold tests (TDD Red Light), confirm failing, then implement mig 148 + mig 149 + script extension + seed JSON + spec amendments. Diff-stage 4-reviewer round runs after Green Light, before WF6 commit.
