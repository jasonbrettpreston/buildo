# Active Task: WF1 #lifecycle-phase-engine-migration-E.3 — `compute-phase-calibration.js` CoA-side granular cohort calibration

**Status:** SHIPPED 2026-05-15 commit `9902860` — v6 folded 5 diff-stage real findings (1 convergent at 2/4 reviewers: `unknownCohortCount` misclassification; plus `buildBulkInsertSQL(0)` guard, `phase_stay_calibration` EXISTS guard, `coa_cohort_presence` descriptor, AND/OR comment). 2 verified false positives (recurring Gemini hypothesis on LAG attribution + negative durations). 6 deferrals filed at `docs/reports/review_followups.md` items #119-#131. `npm run verify` clean (5935 tests). Spec amendments applied (Spec 42 §6.9 + §6.11 Phase E + Spec 84 §7 + 84-W4) with `[E.3-COMMIT]` placeholders pending SHA patch.
**Workflow:** WF1 (script extension — CoA-side granular cohort calibration; permit-side preserved; legacy verdict bug fix; CoA chain manifest add)
**Domain Mode:** Backend/Pipeline (`scripts/`, `scripts/manifest.json`, `docs/specs/`)
**Rollback Anchor:** `ad0c178` (Phase E.2 consumer wiring ship)
**Parent WF:** Phase E — Lifecycle engine migration + bug 84-W12 fix + cohort-key extension (Spec 42 §6.11)
**Sub-deliverable position:** E.1 (substrate `7003683`) → E.2 (consumer wiring `ad0c178`) → **E.3 (CoA-side granular cohorts — THIS task)** → E.4 (per-seq bands) → E.5 (band recalibration)
**Adversarial review:** USER-REQUESTED — 4 reviewers (Gemini + DeepSeek + Independent + Observability) at BOTH plan + diff stages.
**Standards adherence (user-mandated):** Spec 47 §R1-R12; Spec 48 (observer); `00_engineering_standards.md` §2 (try-catch boundary), §3 (database), §6 (logError), §7 (dual code path — N/A), §9 (pipeline safety — transaction boundaries, parameter limits, idempotent); **TDD cadence** per WF1 Red Light/Green Light gate.

## v4 → v5 Revision Summary

v4 plan-review (4 reviewers — Gemini + DeepSeek + Independent worktree + Observability worktree) surfaced 13 actionable findings. The decisive convergence: all 4 reviewers independently flagged the same CRIT — `coaTypeClassNullTransitionCount` declared but never populated (the cohort-loop iterates aggregate buckets which collapse NULL coa_type_class rows into a single bucket, losing per-transition NULL visibility). Additional 3-of-4 convergence on the `coa_transition_count` query missing the seq-range filter that the revision table claimed was applied. Convergence trajectory: v1=18 → v2=14 → v3=15 → v4=13. Per user authorization, v5 folds all 13 and PLAN LOCKs directly; the diff-stage 4-reviewer round will catch any new issues introduced by the folds before commit.

| # | Finding | Reviewer(s) | Severity | v5 Resolution |
|---|---|---|---|---|
| v4-C1 | `coaTypeClassNullTransitionCount` declared but NEVER populated — the for-loop iterates `allBuckets` (aggregate output) but NULL coa_type_class rows collapse into one bucket, losing per-transition visibility. Result: metric permanently emits 0; >5% WARN gate is dead code; the observability replacement for the removed `coa_type_class IS NOT NULL` filter has zero signal. | Gemini CRIT + DeepSeek CRIT + Independent E (conf 88) + Observability I (conf 97) — **4/4 convergent** | CRITICAL | **FOLD** — replace the dead loop increment with a separate SQL query: `SELECT COUNT(*)::int AS n FROM lifecycle_transitions WHERE lead_id LIKE 'coa:%' AND coa_type_class IS NULL AND (from_seq BETWEEN 1 AND 22 OR to_seq BETWEEN 1 AND 22)`. Filter matches `coa_transition_count` query for consistency. |
| v4-H1 | `coa_transition_count` query at line 339-341 missing seq-range filter — regression of v3-DS-MED-3 fold. Revision summary table claims filter applied; code block shows old form. | Gemini HIGH + DeepSeek HIGH + Independent F (conf 87) — **3/4** | HIGH | **FOLD** — add `AND (from_seq BETWEEN 1 AND 22 OR to_seq BETWEEN 1 AND 22)` to the count query. Filter now matches `coaAggSql` exactly. |
| v4-H2 | `coa_applications` project_type coverage query at line 347-352 has no table-exists guard. v3-DS-HIGH-2 fold applied to `lifecycle_transitions` only. If `coa_applications` missing → relation-not-exist crash + advisory lock leak. | DeepSeek HIGH + Independent G (conf 82) — **2/4** | HIGH | **FOLD** — wrap with `information_schema.tables` EXISTS check. WARN log + set `projectTypeCoveragePct = null` if missing. Skip the dual-source `lifecycle_transitions` coverage query if `lifecycle_transitions` is missing too. |
| v4-H3 | `<1ms` pre-ack wording is technically misleading — empty-window is **zero** (readers blocked by ACCESS EXCLUSIVE for the full transaction duration), not `<1ms`. Operator could mis-attribute reader latency to a "known sub-ms window" that doesn't exist. | Observability J (conf 82) — **1/4** | HIGH | **FOLD** — rewrite pre-ack vector #6 to: "Transient empty-table window for `phase_stay_calibration` is **zero** (readers blocked by ACCESS EXCLUSIVE for the full transaction duration; table never visible as empty)." |
| v4-H4 | GROUP BY 5-tuple includes `to_seq` (not just `from_seq`) — cohort cardinality could explode (theoretical max ~48K vs. claimed ~1000). Permit-side groups only by `from_phase`. Plan needs explicit semantics justification + parameter-limit reconciliation. | DeepSeek HIGH — **1/4** | HIGH | **FOLD as documentation** — the 5-tuple `(NULL, project_type, coa_type_class, from_seq, to_seq)` IS the spec-mandated cohort key per Spec 42 §6.7 step 6 (granular CoA cohorts for trade-forecast use). Practical cardinality bound: ~6 project_types × ~7 coa_type_class × 22 from_seq × 22 to_seq = ~20K theoretical max, but observed CoA transitions concentrate on a handful of `(from_seq, to_seq)` paths (linear status progression). Plan adds: explicit upper-bound bucket count assertion in script (FAIL on `allBuckets.length > 5000`) + reconciles with parameter limit: 11 cols × 5000 = 55K params (< 65535). |
| v4-M1 | mig 147 DOWN step missing `DELETE FROM ... WHERE phase IS NULL` — only handles `permit_type IS NULL`. Any row with NULL `phase` would block `ALTER COLUMN phase SET NOT NULL` rollback. | Gemini MED — **1/4** | MED | **FOLD** — DOWN comment block step 1 split: (1a) `DELETE FROM phase_stay_calibration WHERE permit_type IS NULL;` (remove CoA-side rows); (1b) `DELETE FROM phase_stay_calibration WHERE phase IS NULL;` (defensive — catch any remaining NULL-phase permit-side row). |
| v4-M2 | UNION ALL fold mismatch — v3 revision table claims `permitAggSql + coaAggSql` combined into single UNION ALL + direct INSERT INTO staging; code in Parts 1-2 still shows two separate `pool.query` calls + JS concat (`allBuckets = [...permitBuckets, ...coaBuckets]`). | DeepSeek MED + Observability — **2/4** | MED | **FOLD as documentation** — update v3 fold v3-G-MED-2 entry: actual decision was to keep two separate queries (clearer error attribution per side; permit-side bucket count and CoA-side bucket count remain separately accessible for `permitCohortCount`/`coaCohortCount` derivation). The JS concat is intentional. The v3 revision claim was aspirational; v5 corrects the documentation. |
| v4-M3 | Param-limit guard missing for staging INSERT — bucket count could exceed 5955 (65535÷11 ceiling) without runtime check. | DeepSeek MED — **1/4** | MED | **FOLD** — startup guard added: assert `allBuckets.length <= 5000` (well under 5955 hard limit). On overage: FAIL the run with explicit error. Sub-batching deferred to Phase F if CoA cardinality grows. |
| v4-M4 | `coaAggSql` WHERE `OR` on from_seq/to_seq is brittle — `lead_id LIKE 'coa:%'` is canonical; the seq-range `OR` could pull in a future bug's mis-labeled permit row with a seq in 1-22. Logic should be `AND` with logged assertion, not `OR` broadening. | Gemini MED — **1/4** | MED — defer | **DEFER** — current logic uses `AND lead_id LIKE 'coa:%' AND (from_seq ... OR to_seq ...)` which is defense-in-depth, NOT an `OR` broadening. Both conditions must hold (LIKE + seq-range). The Gemini concern is misread: there is no scenario where the `lead_id` filter is bypassed. No fold needed. |
| v4-L1 | `coa_type_class_null_transition_count` threshold descriptor says "5%" but stores absolute count; descriptor is misleading even though the status computation correctly divides. | DeepSeek LOW — **1/4** | LOW | **FOLD** — descriptor updated to: `'ratio <= 0.05 PASS, > 0.05 WARN (relative to coa_transition_count); value field stores absolute count for triage'`. |
| v4-L2 | Self-Checklist item (j) at line 679 still says "4 existing + 7 new INFO + 1 thresholded" (totals 12, not 15); Execution Plan Contract Definition step still says "audit_table 12-row shape"; one more "12-row" reference in Audit Observability paragraph. | Observability + Independent (3 stale locations) — **2/4** | LOW | **FOLD** — all 3 locations corrected to "15 rows / 6 thresholded". Self-Checklist (j) rewritten: "15 audit_table rows: 4 existing + 6 new INFO + 5 thresholded WARN/FAIL gates". |
| v4-L3 | Pre-ack lacks co-firing guidance — if Phase D is incomplete, vectors #4 + #5 + (optionally #unknown_cohort_count) co-fire WARN, audit verdict = WARN. Operator may file unnecessary WF3. | Observability — **1/4** | LOW | **FOLD** — pre-ack appends: "Note on co-firing: if `verdict=WARN` on first E.3 run with vectors #4 + #5 (and optionally `unknown_cohort_count`) simultaneously WARN, this is the expected co-firing pattern when Phase D is incomplete. No WF3 action; verify Phase D execution." |
| v4-N1 | Test for `unknown_cohort_count` uses "impossible injection" wording — implies the test contradicts the documented reachable case (Phase D never ran for the underlying CoA record). | Gemini NIT — **1/4** | NIT | **FOLD** — test rewritten: seed a `coa_applications` record with NULL `project_type` AND NULL `coa_type_class`, run E.2 writer to produce a valid `lifecycle_transitions` row from it (no constraint violation; both columns nullable on the transition row), then assert E.3 buckets it into `unknown_cohort_count >= 1` and `audit_table.verdict = 'WARN'`. Validates the realistic Phase D-incomplete failure mode. |

**v5 load-bearing changes** (in addition to v3→v4 changes already applied): (1) `coaTypeClassNullTransitionCount` populated via separate SQL query (CRITICAL fix — metric was permanently zero); (2) `coa_transition_count` query gets seq-range filter (HIGH regression fix); (3) `coa_applications` query gets table-exists guard (HIGH defensive); (4) pre-ack vector #6 wording corrected from `<1ms` to `zero` (HIGH accuracy); (5) mig 147 DOWN adds `phase IS NULL` DELETE step (MED rollback safety); (6) bucket-count upper-bound assertion + parameter-limit reconciliation (MED defensive); (7) all 3 stale doc-count locations corrected to 15/6 (LOW consistency); (8) co-firing guidance added to pre-ack (LOW operator clarity); (9) `unknown_cohort_count` test rewritten as realistic Phase D-incomplete fixture (NIT semantic correctness).

## v3 → v4 Revision Summary

v3 plan-review (4 reviewers) surfaced 15 actionable findings. Three CRITs were real implementation bugs that would have shipped — caught by plan-review exactly as intended. Convergence trajectory: v1=18 → v2=14 → v3=15 (not tight; each iteration adds structural design which surfaces new issues).

| # | Finding | Reviewer(s) | Severity | v4 Resolution |
|---|---|---|---|---|
| v3-IF | Mig 147 has explicit `BEGIN`/`COMMIT` — documented recurring failure mode (mig 135's R8 CI hotfix removed exactly this; runner provides outer transaction; explicit BEGIN/COMMIT commits the outer prematurely → split-brain schema state) | Independent F | CRITICAL | **FOLD** — `BEGIN;` and `COMMIT;` removed from mig 147. Runner's outer transaction wrapping is sufficient. Mirrors mig 135 pattern. |
| v3-DS-1 / Indep-A | Permit-side 2-tuple `(permit_type, phase)` uniqueness lost after mig 147 drops legacy PK — 5-tuple UNIQUE with NULLS DISTINCT treats NULL granular dims as distinct → duplicates possible from external/future writers | DeepSeek CRIT + Independent A (2-way) | CRITICAL | **FOLD** — mig 147 adds partial unique index: `CREATE UNIQUE INDEX phase_stay_calibration_permit_legacy_unique ON phase_stay_calibration (permit_type, phase) WHERE permit_type IS NOT NULL`. Restores structural uniqueness for permit-side rows while permitting CoA-side rows (permit_type NULL) to coexist. |
| v3-G-CRIT | DELETE+INSERT race window — Gemini upgrades from Independent v2's accept to CRIT. Atomic temp-table swap protects downstream consumers from transient empty table | Gemini CRIT (Independent v2 disagreed) | CRITICAL | **FOLD** — write path replaced with `CREATE TEMP TABLE` + `INSERT INTO temp SELECT ...` + `BEGIN; TRUNCATE phase_stay_calibration; INSERT INTO phase_stay_calibration SELECT * FROM temp; COMMIT;`. Reduces empty-table window to milliseconds (metadata-only lock). |
| v3-G-HIGH-2 | LAG composite index for performance scaling | Gemini HIGH | HIGH | **FOLD** — mig 147 adds `CREATE INDEX phase_stay_calibration_lt_lag_idx ON lifecycle_transitions (lead_id, transitioned_at, id) WHERE lead_id LIKE 'coa:%'`. Partial index keeps it small; covers the LAG window correctly. |
| v3-G-HIGH-3 / DS-MED-1 | `coa_type_class IS NOT NULL` filter inconsistent with v3's removal of the parallel `project_type IS NOT NULL` filter — data-destructive for unclassified CoA rows | Gemini HIGH + DeepSeek MED (2-way convergent) | HIGH | **FOLD** — filter REMOVED from CoA aggregate. Add `coa_type_class_null_transition_count` audit row (WARN at >5%) for observability. The `unknown_cohort_count` defensive metric (v3 fold v2-G-3) now becomes reachable for legitimate cases (CoA rows with both project_type AND coa_type_class NULL) rather than dead code. |
| v3-DS-HIGH-2 | Startup guard queries `coa_applications` without verifying table exists | DeepSeek HIGH | HIGH | **FOLD** — `information_schema.tables` check added before the project_type coverage query, with WARN log on missing table. |
| v3-O-HIGH-Indep | "15 audit_table rows" stale in 3 doc locations (Self-Checklist item j, Spec 48 section, Audit Observability section) — actual is 14 rows after v3 promotions | Observability HIGH + Independent (convergent) | HIGH | **FOLD** — all 3 locations corrected to "14 rows, 5 thresholded." With v4 adding `coa_type_class_null_transition_count` (v3-G-HIGH-3 fold), total becomes 15 rows. Numbers updated to match. |
| v3-G-MED-1 | `flattenBuckets` order-coupled to SQL column order — silent corruption risk on future column reorder | Gemini MED | MED | **FOLD** — `flattenBuckets` rewritten as `buckets.flatMap(b => COHORT_INSERT_COLS.map(col => b[col] ?? null))` — name-based lookup, order-independent. |
| v3-G-MED-2 | UNION ALL in SQL not JS concat (memory/perf optimization) | Gemini MED | MED | **FOLD** — `permitAggSql` and `coaAggSql` combined into single `WITH ... UNION ALL ... INSERT INTO temp SELECT ...` statement; eliminates the `allBuckets = [...permitBuckets, ...coaBuckets]` JS round-trip. |
| v3-G-MED-3 / DS-LOW-6 | DOWN script unsafe — only safe if no CoA-side rows present; doesn't delete CoA rows before re-adding PK | Gemini MED + DeepSeek LOW (2-way) | MED | **FOLD** — DOWN comment block adds explicit `DELETE FROM phase_stay_calibration WHERE permit_type IS NULL` as first step (operator must run before ALTER COLUMN ... SET NOT NULL or ADD PRIMARY KEY). |
| v3-DS-MED-2 | `unknown_cohort_count` was dead code under v3's `coa_type_class IS NOT NULL` filter | DeepSeek MED | MED | **FOLD** — resolved by v3-G-HIGH-3 fold (filter removal). `unknown_cohort_count` now reachable; tests need updating to reflect this. |
| v3-DS-MED-3 | `coa_transition_count` count query doesn't apply seq-range filter that aggregate uses → metric/aggregate mismatch | DeepSeek MED | MED | **FOLD** — `coa_transition_count` query updated: `SELECT COUNT(*) FROM lifecycle_transitions WHERE lead_id LIKE 'coa:%' AND (from_seq BETWEEN 1 AND 22 OR to_seq BETWEEN 1 AND 22)`. Filters match. |
| v3-DS-LOW-5 | `unreliable_buckets` threshold descriptor text contradicts the gate | DeepSeek LOW | LOW | **FOLD** — descriptor fixed to `'> 0 triggers WARN (count of buckets with sample_size < 30; equals low+outlier by definition)'`. |
| v3-Indep-A-advisory | Mig 147 should comment that DELETE+INSERT pattern (now: atomic temp-table swap) is the runtime enforcement of legacy 2-tuple uniqueness — advisory only since partial unique index now in place | Independent A advisory | LOW | **FOLD** — comment added in mig 147; redundant now with the partial unique index from v3-DS-1 fold but documented for traceability. |
| v3-O-LOW-K | Pre-ack format dense (5 anomaly vectors in one paragraph) — operator parseability | Observability LOW | LOW | **FOLD** — pre-ack reformatted as numbered list with one-line action per vector. |

## v2 → v3 Revision Summary

v2 plan-review (4 reviewers) surfaced 14 actionable findings. The most critical was **Independent G** (conf 92): `phase_stay_calibration` retains its original `PRIMARY KEY (permit_type, phase)` from mig 123; my v2 claimed "no migrations needed" but CoA-side INSERTs with `permit_type = NULL` would violate the PK on first production run. Mig 135 added a 5-tuple UNIQUE INDEX but did NOT drop the old PK. Mig 135's own comment foreshadowed this: "*The pre-existing PK on (permit_type, phase) enforces uniqueness during the transition*" — implying Phase E was expected to handle the PK drop.

v3 adds **migration 147** to drop the legacy PK + make `permit_type` and `phase` nullable + fold the other 13 findings.

| # | Finding | Reviewer(s) | Severity | v3 Resolution |
|---|---|---|---|---|
| v2-G | `phase_stay_calibration` PRIMARY KEY (permit_type, phase) blocks CoA-side INSERT (permit_type NULL on CoA rows) | Independent G | CRITICAL/BLOCKING | **FOLD via NEW migration 147**: drop legacy PK on (permit_type, phase); make permit_type + phase nullable; mig 135's 5-tuple UNIQUE INDEX becomes the de facto integrity constraint. |
| v2-E | `MIN(from_phase)` returns NULL for all-NULL partitions; `phase` column is NOT NULL → INSERT violation | Independent E | HIGH | **FOLD** — same migration 147 makes `phase` nullable. CoA cohorts with all-null `from_phase` propagate NULL through the INSERT cleanly. |
| v2-DS-1 | `project_type IS NOT NULL` filter in v2 CoA aggregate is data-destructive (NULLS DISTINCT collision argument was wrong) | DeepSeek HIGH | HIGH | **FOLD** — filter removed from `coaAggSql` WHERE clause. CoA rows with NULL project_type bucket together under SQL NULL-grouping semantics. Migration 147 makes the row insertable. |
| v2-DS-2 | "Permit-side UNCHANGED" plan claim contradicts SQL block which adds `, id` tiebreaker | DeepSeek HIGH | HIGH | **FOLD** — plan text corrected: permit-side IS modified (LAG tiebreaker added per v2 fold #8). The change is small but explicit. |
| v2-G-1 | Gemini's "LAG off-by-one CRITICAL" | Gemini CRIT | — | **FALSE POSITIVE** verified via timeline trace — `from_phase` is the phase being EXITED (the cohort's phase); LAG of `transitioned_at` against current row gives the duration of that phase correctly. |
| v2-G-2 | Duration-attribution test missing from test plan | Gemini HIGH | HIGH | **FOLD** — new test #6 in Part 7: seed lead A with known durations (Phase A→B at Day 10, B→C at Day 30); assert `phase_stay_calibration.median_days = 10` for cohort A and `20` for cohort B. |
| v2-O-J | Pre-ack missing `coa_transition_count` step-change annotation | Observability HIGH | HIGH | **FOLD** — pre-ack runbook adds explicit note: "*The new `coa_transition_count` metric will jump from 0 (pre-E.2 baseline) to ~30K on first E.3 run — expected. INFO row only; will not trigger automated WARN/FAIL but DeepSeek narrative may flag the velocity jump.*" |
| v2-G-3 | `unknown_cohort_count` defensive metric for `permit_type=NULL AND coa_type_class=NULL` edge case | Gemini MED | MED | **FOLD** — new audit row added. WARN gate at >0 (signals data corruption or aggregate bug). |
| v2-DS-3 | EXPLAIN ANALYZE assertion too strict (OR condition defeats single-column indexes; would FAIL on staging without composite index) | DeepSeek MED | MED | **FOLD** — assertion relaxed: at ~30K row scale sequential scan is acceptable. Test now asserts `execution_time_ms < 5000` (5 second budget) instead of "no Seq Scan." Composite index deferred to Phase H if/when CoA volume justifies. |
| v2-O-L / Indep F | `unreliable_buckets` = `low_volume_buckets + outlier_buckets` redundancy undocumented; operator dashboard double-count risk | Observability L + Independent F (2-way) | MED | **FOLD** — `unreliable_buckets` threshold descriptor extended: `'< 30 sample_size triggers WARN if > 0 — NOTE: equals low_volume_buckets + outlier_buckets by definition; do not sum tier metrics with this'`. Plus pre-ack runbook note. |
| v2-O-M | `coa_project_type_coverage_pct` lives in records_meta direct keys → observer's automated WARN/FAIL gate blind to Phase D coverage degradation | Observability MED | MED | **FOLD** — promoted to 13th `audit_table.rows` entry: `{ metric: 'coa_project_type_coverage_pct', value: pct, threshold: '>= 50 PASS, < 50 WARN', status: pct >= 50 ? 'PASS' : 'WARN' }`. records_meta keeps the value for triage context. |
| v2-I-B | DELETE+INSERT race window when calibration runs in both chains (transient empty table between lock release + re-acquire) | Independent B | MED | **FOLD as documentation** — operator pre-ack adds note: "*Calibration now runs in BOTH permits + coa chains. Lock 93 serializes concurrent execution, but lock-release-then-re-acquire creates a millisecond transient empty-table window for `phase_stay_calibration` consumers (inspector read path). Acceptable operational risk; INSERT-then-DELETE atomic swap deferred to a future hardening WF.*" |
| v2-I-D | `coa_applications.project_type` coverage guard reads wrong source — should ALSO check `lifecycle_transitions.project_type` directly | Independent D | MED | **FOLD** — second startup guard added querying `lifecycle_transitions WHERE lead_id LIKE 'coa:%'` for project_type coverage. Logs both percentages so operators can distinguish "Phase D hasn't run" vs "Phase D ran but old transitions predate it." |
| v2-O-doc | Self-doc inconsistency: plan says "5 thresholded scalars" but Part 4 has only 3 thresholded (now 4 with the `coa_project_type_coverage_pct` promotion in v2-O-M) | Observability doc | LOW | **FOLD** — plan text corrected. With v3's promotion, 4 thresholded: `total_buckets` (FAIL gate), `unreliable_buckets` (WARN gate), `coa_cohort_presence` (WARN gate), `coa_project_type_coverage_pct` (WARN gate). |
| v2-I-C | `lifecycle_transitions.id` documented as BIGSERIAL but mig 126 has it as SERIAL | Independent LOW | LOW | **DOCUMENT** — no E.3 impact (LAG tiebreaker works on either type). Spec amendment to correct Spec 42 §6.6.B to match mig 126's actual `SERIAL` type. Phase H concern if table exceeds ~2.1B rows. |
| v2-G-LOW | `MIN(from_phase)` ambiguity telemetry — flag cohorts with multiple distinct `from_phase` strings (e.g., 'P7a' vs 'P7-A' bad data) | Gemini LOW | LOW | **DEFER** — defensive observability; defer to follow-up. |
| v2-G-NIT | `cohort_dimension_coverage` SQL optimization (compute via `COUNT(*) FILTER` in SQL instead of JS filter) | Gemini NIT | NIT | **DEFER** — implementation detail. |
| v2-DS-MED-4 | `lead_id` format dependency note in startup guard | DeepSeek MED | NIT | **Already in plan** — startup guard comment notes the format dependency. |

## v1 → v2 Revision Summary

v1 plan-review (4 reviewers — Gemini, DeepSeek, Independent worktree, Observability worktree) surfaced 18 findings. The decisive finding was **Independent C-1**: `universal_stream_catalog.phase` stores DESCRIPTIVE labels like `'P7a/P7b/P7c (or P9-P17)'`, NOT P-codes. v1's plan joined `cat.phase = permit_phase_transitions.from_phase` (P-code) — would have produced NULL `from_seq` for nearly every permit-side row, silently destroying the existing ~165-bucket calibration. The catalog maps `(source, status) → seq`, but `permit_phase_transitions` lacks a status column.

v2 reframes the scope: **CoA-side cohorts only get the granular 5-tuple key**. Permit-side calibration remains on the legacy 2-tuple `(permit_type, from_phase)` until Phase H consolidates `permit_phase_transitions` into `lifecycle_transitions` (which has `from_seq`/`to_seq` populated by E.2).

| # | Finding | Reviewer(s) | Severity | v2 Resolution |
|---|---|---|---|---|
| v1-1 | Catalog JOIN column mismatch — `cat.phase = ppt.from_phase` joins P-code against descriptive label; permit-side seq derivation produces NULL for nearly all rows | Independent C-1 | CRITICAL | **REFRAME** — v2 narrows scope to CoA-side only (already has from_seq/to_seq from E.2). Permit-side legacy 2-tuple cohorts preserved unchanged. Granular permit-side seq derivation deferred to Phase H when permit_phase_transitions is retired. |
| v1-2 | `HAVING COUNT(*) >= 3` contradicts tier plan — destroys cohorts with sample 3-9 that "low/outlier" tiers claim to track | Gemini CRIT, DeepSeek LOW (convergent direction) | CRITICAL | **FOLD** — HAVING removed. Tier counters (`high/mid/low/outlier_volume_buckets`) provide observability; consumer-side decision whether to use low-sample cohorts. |
| v1-3 | INNER JOIN permits silently drops orphan transitions | DeepSeek CRIT, Gemini HIGH (permits index risk) | CRITICAL | **N/A** under reframed scope — v2 does NOT modify permit-side calibration path. |
| v1-4 | Manual `$${base + N}` placeholder arithmetic fragile (off-by-one risk if columns change) | DeepSeek CRIT | CRITICAL | **FOLD** — column list extracted to `COHORT_INSERT_COLUMNS` constant; placeholder generation uses `cols.map((c, i) => '$${base + i + 1}').join(', ')` helper. |
| v1-5 | Catalog poisoned rows (seq 35, 47, 50, 77-87, 99-110) silently included in cohort key | Observability K | CRITICAL | **N/A** under reframed scope — CoA-side rows live in seq 1-22 only (verified clean against mig 129). |
| v1-6 | `audit_table.verdict` hardcoded from `inserted`/`unreliable` counters at script line 155 — Spec 47 §R10 violation (pre-existing bug) | Observability N | CRITICAL pre-existing | **FOLD** — v2 fixes this in the same commit: `verdict` derived from `auditRows.some(r => r.status === 'FAIL' \|\| 'WARN')` per §R10. |
| v1-7 | `from_phase` in GROUP BY subverts 5-tuple key — same (project_type, coa_type_class, from_seq, to_seq) with different legacy `from_phase` strings would split into two cohorts | Gemini HIGH | HIGH | **FOLD** — `from_phase` removed from GROUP BY; `MIN(from_phase) AS from_phase` aggregate keeps the legacy column populated for backward-compat. |
| v1-8 | LAG `ORDER BY transitioned_at` non-deterministic on tied timestamps → breaks idempotency | DeepSeek HIGH | HIGH | **FOLD** — tiebreaker added: `ORDER BY lt.transitioned_at, lt.id`. Idempotency restored. |
| v1-9 | `lead_id LIKE 'coa:%'` brittle (E.2 writer format may change) + scan-risk at scale | DeepSeek HIGH, Gemini MED (convergent) | HIGH | **FOLD** — primary filter switches to `WHERE lt.from_seq BETWEEN 1 AND 22 OR lt.to_seq BETWEEN 1 AND 22` (CoA-side seq range per §2.5.c is intrinsic — 22 CoA statuses → seq 1-22). Backup `lead_id LIKE 'coa:%'` retained as a second predicate for defense-in-depth. |
| v1-10 | Startup guard `information_schema.tables` only checks table existence — doesn't distinguish "E.2 never ran" vs "E.2 ran but partial" | DeepSeek HIGH | HIGH | **FOLD** — startup guard extended: `SELECT COUNT(*) FROM lifecycle_transitions WHERE lead_id LIKE 'coa:%'`; logs "table empty (pre-E.2 first-run)" vs "table populated (NNN rows)" so operators can distinguish states. |
| v1-11 | `unreliable_buckets` metric (existing 4th audit row) silently dropped without explanation; arithmetic claim "9 rows" but plan listed 10 | Independent H-1 | HIGH | **FOLD** — `unreliable_buckets` PRESERVED as a 4th existing INFO row (semantics unchanged: WARN when `sample_size < 30`). The new tier counters (`high/mid/low/outlier`) provide finer granularity ALONGSIDE the legacy metric. Total audit rows now 11. |
| v1-12 | `compute_phase_calibration` runs only in permits chain per `scripts/manifest.json` line 71 — CoA-only chain runs produce CoA transitions in `lifecycle_transitions` but never trigger calibration recompute | Independent H-2 | HIGH | **FOLD** — add `compute_phase_calibration` to the CoA chain in `scripts/manifest.json` (alongside its existing permits-chain entry). After E.3, calibration runs in BOTH chains; CoA-only chain runs trigger calibration refresh. |
| v1-13 | `coa_applications.project_type` Phase D gate not documented — if Phase D shipped but classify-coa-scope hasn't run yet, project_type is NULL on CoA rows and the 5-tuple collapses | Independent H-3 | HIGH | **FOLD** — startup guard added: `SELECT COUNT(*) FROM coa_applications WHERE project_type IS NOT NULL` / total. WARN log if coverage < 50%. Documents Phase D prerequisite in Context. |
| v1-14 | Observer pre-ack targets `total_buckets` jump — wrong metric. Observer's `vs_baseline` anomaly fires on `duration_ms` (and `records_total`), NOT bucket count | Observability L | HIGH | **FOLD** — operator pre-ack language rewritten: "*Expected first-E.3-run batch — duration_ms may regress 2-3× while query processes UNION-ALL + 5-tuple GROUP BY. Annotate `permits-followup.md` AND `coa-followup.md` (E.3 now runs in both chains per v1-12 fold) first-E.3-run as `[expected granular-key SQL expansion, not a performance regression]`.*" |
| v1-15 | `coa_cohort_presence=0` can't differentiate "E.2 not run" vs "E.2 ran but cohorts too sparse" | Observability M | HIGH | **FOLD** — new `coa_transition_count` scalar audit row: counts raw `lifecycle_transitions` source rows where `lead_id LIKE 'coa:%'` BEFORE the cohort filter. Operators can distinguish: `coa_transition_count=0` → E.2 hasn't run; `coa_transition_count>0 AND coa_cohort_count=0` → E.2 ran but data too sparse for cohorts. |
| v1-16 | Catalog miss telemetry needed (`catalog_join_misses` counter) | Gemini MED, DeepSeek MED (convergent) | MEDIUM | **N/A** under reframed scope — v2 doesn't do permit-side catalog JOIN. |
| v1-17 | NULLS DISTINCT edge case — if both `project_type=NULL` on permit-side AND CoA-side, the 5-tuple collapses and UNIQUE INDEX fires | DeepSeek MED | MEDIUM | **FOLD** — v2 startup guards `coa_applications.project_type` coverage AND permit-side preserves legacy 2-tuple (no granular row insertion with NULL project_type from permit-side). |
| v1-18 | EXPLAIN ANALYZE missing from test plan | Gemini MED | MEDIUM | **FOLD** — added to Test #5: `EXPLAIN (ANALYZE, BUFFERS)` invocation in the test suite (staging-DB only) asserts query plan does not include sequential scan on `lifecycle_transitions`. |
| v1-19 | Redundant `EXTRACT(EPOCH FROM ...)` expression × 3 in PERCENTILE_CONT calls | Gemini NIT | LOW | **FOLD** — extracted to a single CTE subquery `duration_calc` that computes `duration_days` once, then PERCENTILE_CONT references it. |

## Why this task exists

Spec 42 §6.1 objective #4: *"Resolve the prediction-engine cohort blind spot documented in Spec 84 §8.7. Cohort key on phase_stay_calibration extends from (permit_type, from_phase) to (permit_type, project_type, coa_type_class, from_seq, to_seq)."*

Spec 84 §8.7 cohort blind-spot: for CoA-stage rows the legacy 2-tuple `(permit_type, from_phase)` lookup falls through to `__ALL__` defaults because CoA `permit_type` is NULL or `'Pre-Permit'`. The median 1,078-day CoA-decision-to-permit-filing lag is invisible to `compute-trade-forecasts.js`. E.3 closes this by producing granular CoA-side cohort buckets keyed on `(NULL, project_type, coa_type_class, from_seq, to_seq)`.

Spec 84 84-W4 ("Dead Transition Write: Ledger written but not used") was previously resolved for `permit_phase_transitions`; E.3 extends consumption to `lifecycle_transitions` (the E.2 writer for CoA-side phase transitions).

**Scope reframe (v2):** the permit-side cohort key extension is BLOCKED on a schema gap (`permit_phase_transitions` lacks a status column, so seq cannot be derived from the catalog). Per v2 fold #1, permit-side calibration remains on the legacy 2-tuple key until Phase H. E.3 delivers ONLY the CoA-side granular cohorts (which already have from_seq/to_seq populated by E.2 — no JOIN needed).

## Context

### Goal

1. **Add CoA-side granular cohort rows** to `phase_stay_calibration` by reading `lifecycle_transitions` (E.2 writer). GROUP BY 5-tuple `(NULL permit_type, project_type, coa_type_class, from_seq, to_seq)` with `MIN(from_phase)` for legacy column.

2. **Preserve permit-side legacy 2-tuple cohorts** — existing aggregate against `permit_phase_transitions` unchanged. Both shapes coexist in `phase_stay_calibration` via mig 135's NULLS DISTINCT UNIQUE INDEX.

3. **Fix existing `audit_table.verdict` bug** — derive from row statuses per Spec 47 §R10 instead of hardcoded counter logic (Observability N pre-existing bug, conf 97).

4. **Add `compute_phase_calibration` to the CoA chain** (`scripts/manifest.json`) — currently permits-only; CoA-only chain runs leave calibration stale until next permits run.

5. **Sample-size tier counters + new observability metrics**: `high/mid/low/outlier_volume_buckets`, `permit_cohort_count`, `coa_cohort_count`, `coa_transition_count` (raw source count for triage), `coa_cohort_presence` (WARN gate), plus 2 distribution maps in `records_meta`.

6. **Operator pre-ack runbook** rewritten to target duration regression (the actual anomaly trip vector per Observability L).

### Target Specs

- `docs/specs/01-pipeline/47_pipeline_script_protocol.md` §R1-R12 (script is pre-compliant; E.3 extends within envelope)
- `docs/specs/01-pipeline/42_chain_coa.md` §6.7 step 6 (cohort key extension — v2 scope-limited to CoA-side per fold #1), §6.9 modified-scripts row, §6.11 Phase E row, §6.11 Phase I (NEW — E.2 deferrals)
- `docs/specs/01-pipeline/84_lifecycle_phase_engine.md` §7 + §8.7 + 84-W4
- `docs/specs/01-pipeline/48_pipeline_observability.md`
- `docs/specs/00_engineering_standards.md` §2 + §3 + §6 + §9

### Key Files

- `scripts/compute-phase-calibration.js` (target — 173 lines today; v2 extends aggregate SQL + audit_table + verdict bug fix)
- `scripts/manifest.json` (target — add `compute_phase_calibration` to CoA chain)
- `migrations/135_extend_phase_stay_calibration.sql` (Phase B mig — schema already in place)
- `migrations/128_create_universal_stream_catalog.sql` + `migrations/129_seed_universal_stream_catalog.sql` (read-only — CoA seq 1-22 verified clean)
- `src/tests/compute-phase-calibration.infra.test.ts` (NEW or EXTEND)
- `src/tests/compute-phase-calibration.logic.test.ts` (NEW — tier helper boundary tests)

### Operating Boundaries

**Target Files:**
- `migrations/147_phase_stay_calibration_drop_legacy_pk.sql` (NEW — v3 fold v2-G/v2-E)
- `scripts/compute-phase-calibration.js` (EXTEND — CoA-side CTE + 5-tuple GROUP BY append + verdict bug fix + new audit rows + tier counters)
- `scripts/manifest.json` (ADD `compute_phase_calibration` to coa chain)
- `src/tests/compute-phase-calibration.infra.test.ts` (NEW or EXTEND)
- `src/tests/compute-phase-calibration.logic.test.ts` (NEW)
- `docs/specs/01-pipeline/42_chain_coa.md` §6.9 anchor resolution (post-commit)
- `docs/specs/01-pipeline/84_lifecycle_phase_engine.md` 84-W4 entry update
- `docs/reports/review_followups.md` (E.3 close-out note)

**Out-of-Scope Files:**
- `scripts/lib/lifecycle-phase.js` + `src/lib/classification/lifecycle-phase.ts` (E.1 substrate — UNCHANGED)
- `scripts/classify-lifecycle-phase.js` (E.2 consumer — UNCHANGED)
- `scripts/compute-trade-forecasts.js` + `scripts/update-tracked-projects.js` (E.2 defensive guards — UNCHANGED)
- `migrations/` (no new migration — mig 135 already shipped schema)
- `permit_phase_transitions` schema (UNCHANGED — Phase H concern)
- Permit-side calibration path (UNCHANGED per v2 fold #1 reframe)

**Cross-Spec Dependencies:**
- Spec 42 §6.6.B `lifecycle_transitions` (E.2 INSERT writer; E.3 reader)
- Spec 84 §7 (calibration source — extended to include `lifecycle_transitions`)
- Spec 84 §8.7 (CoA cohort blind-spot — closed by E.3 for CoA-stage only; permit-side blind-spot remains until Phase H)
- Spec 48 first-E.3-run observer behavior (mitigation via operator pre-ack — duration regression annotation)
- Phase D dependency: `coa_applications.project_type` + `coa_type_class` populated by `classify-coa-scope.js` (must have shipped before E.3 first run)

## Technical Implementation

### Part 1 — Aggregate SQL extension (CoA-side ADD; permit-side preserved)

The existing aggregate query (`compute-phase-calibration.js` lines 74-105) reads `permit_phase_transitions` and groups by `(permit_type, from_phase)`. v2 PRESERVES this aggregate unchanged and ADDS a SECOND aggregate for CoA-side reading `lifecycle_transitions`.

```js
// E.3 v3: TWO independent aggregates, both producing rows for phase_stay_calibration.
// Permit-side: legacy 2-tuple structure PRESERVED, but LAG receives `, id` tiebreaker
// for determinism (v2 fold #8 + v2-DS-2 plan contradiction fold — the change is small
// but explicit). CoA-side ADDED (granular 5-tuple).

// Permit-side — `, id` tiebreaker added to LAG (v3 documents this explicitly).
// All other aspects (table, columns, GROUP BY, percentile aggregation) PRESERVED.
const permitAggSql = `
  WITH transitions_with_duration AS (
    SELECT permit_num, revision_num, permit_type, from_phase, transitioned_at,
           transitioned_at - LAG(transitioned_at) OVER (
             PARTITION BY permit_num, revision_num ORDER BY transitioned_at, id  -- v2 fold #8 tiebreaker added
           ) AS phase_duration
      FROM permit_phase_transitions
  )
  SELECT permit_type, from_phase AS phase,
         ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY duration_days))::INTEGER AS median_days,
         ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY duration_days))::INTEGER AS p25_days,
         ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY duration_days))::INTEGER AS p75_days,
         COUNT(*)::INTEGER AS sample_size
    FROM (
      SELECT *, EXTRACT(EPOCH FROM phase_duration) / 86400.0 AS duration_days  -- v2 fold #19: extracted once
        FROM transitions_with_duration
       WHERE from_phase IS NOT NULL AND permit_type IS NOT NULL AND phase_duration IS NOT NULL
    ) twd
   GROUP BY permit_type, from_phase
`;

// CoA-side — NEW. Read from lifecycle_transitions where lead_id is a CoA lead.
// 5-tuple cohort key (NULL permit_type, project_type, coa_type_class, from_seq, to_seq).
// v2 fold #9: WHERE clause uses from_seq/to_seq range (CoA seq 1-22 per §2.5.c) AS PRIMARY,
//              with lead_id LIKE 'coa:%' as defense-in-depth.
const coaAggSql = `
  WITH coa_transitions_with_duration AS (
    SELECT
      lt.lead_id,
      lt.project_type,
      lt.coa_type_class,
      lt.from_seq,
      lt.to_seq,
      lt.from_phase,
      lt.transitioned_at,
      lt.transitioned_at - LAG(lt.transitioned_at) OVER (
        PARTITION BY lt.lead_id
        ORDER BY lt.transitioned_at, lt.id  -- v2 fold #8: tiebreaker on id (deterministic across tied timestamps)
      ) AS phase_duration
    FROM lifecycle_transitions lt
    WHERE lt.lead_id LIKE 'coa:%'
      AND (lt.from_seq BETWEEN 1 AND 22 OR lt.to_seq BETWEEN 1 AND 22)  -- v2 fold #9: intrinsic CoA seq range
  )
  SELECT
    NULL::VARCHAR(50)        AS permit_type,
    project_type,
    coa_type_class,
    from_seq,
    to_seq,
    MIN(from_phase)          AS from_phase,        -- v2 fold #7: MIN aggregate, not GROUP BY column
    ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY duration_days))::INTEGER AS median_days,
    ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY duration_days))::INTEGER AS p25_days,
    ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY duration_days))::INTEGER AS p75_days,
    COUNT(*)::INTEGER        AS sample_size
  FROM (
    SELECT *, EXTRACT(EPOCH FROM phase_duration) / 86400.0 AS duration_days  -- v2 fold #19
      FROM coa_transitions_with_duration
     WHERE phase_duration IS NOT NULL
       AND from_seq IS NOT NULL AND to_seq IS NOT NULL
       -- v4 fold v3-G-HIGH-3 + v3-DS-MED-1: BOTH `project_type IS NOT NULL` AND
       -- `coa_type_class IS NOT NULL` filters REMOVED. Same data-destructive logic
       -- as v3 fold v2-DS-1 applies to coa_type_class — dropping unclassified CoA
       -- rows produces skewed calibration. Under NULLS DISTINCT (mig 135), CoA-side
       -- rows with NULL coa_type_class collapse to a single NULL-bucket — acceptable
       -- triage signal via the new `coa_type_class_null_transition_count` audit metric.
       --
       -- Unknown_cohort_count metric (v3 fold v2-G-3) is now REACHABLE — covers the
       -- legitimate case where both project_type AND coa_type_class are NULL on a
       -- CoA transition (Phase D never ran for the underlying CoA record).
  ) ctwd
  GROUP BY project_type, coa_type_class, from_seq, to_seq
  -- v2 fold #2: NO HAVING COUNT(*) >= 3 — tier counters provide observability for low/outlier sample sizes
`;

const permitRes = await pool.query(permitAggSql);
const coaRes    = await pool.query(coaAggSql);

const permitBuckets = permitRes.rows;
const coaBuckets    = coaRes.rows;
const allBuckets    = [...permitBuckets, ...coaBuckets];
```

**Why NO HAVING (v2 fold #2):** Gemini flagged the v1 `HAVING COUNT(*) >= 3` as data-destructive — it directly contradicted the plan's tier counters (low: 10-29, outlier: <10) which CLAIM to track those sample sizes. v2 removes the filter and lets the tier counters do their job. PERCENTILE_CONT on 1-row groups returns degenerate values but they're flagged as `outlier` in audit; consumers can decide whether to use them.

### Part 2 — Bulk INSERT with helper (v2 fold #4)

```js
// v2 fold #4: column list extracted to a constant; placeholder generation via helper.
// Eliminates off-by-one risk from manual $${base + N} arithmetic.
const COHORT_INSERT_COLS = [
  'permit_type', 'project_type', 'coa_type_class',
  'from_seq', 'to_seq', 'phase',
  'median_days', 'p25_days', 'p75_days',
  'sample_size', 'computed_at',
];

function buildBulkInsertSQL(table, cols, rowCount) {
  const tuples = [];
  for (let i = 0; i < rowCount; i++) {
    const base = i * cols.length;
    const placeholders = cols.map((_, j) => `$${base + j + 1}`).join(', ');
    tuples.push(`(${placeholders})`);
  }
  return `INSERT INTO ${table} (${cols.join(', ')}) VALUES ${tuples.join(', ')}`;
}

// v4 fold v3-G-MED-1: name-based lookup (NOT order-based) — robust against
// future SQL SELECT-list reordering. The aliasing in the SELECT must use the
// COHORT_INSERT_COLS names exactly; the order is irrelevant.
function flattenBuckets(buckets, runAt) {
  return buckets.flatMap((b) =>
    COHORT_INSERT_COLS.map((col) => col === 'computed_at' ? runAt : (b[col] ?? null))
  );
}

// v4 fold v3-G-CRIT (Gemini) + v5 fold v4-H3 (Observability accuracy):
// atomic temp-table swap pattern eliminates the consumer-visible empty-table
// window that DELETE+INSERT exposes to downstream consumers (inspector read
// path). TRUNCATE acquires ACCESS EXCLUSIVE for the full transaction; readers
// BLOCK on the lock and never see an empty table. Empty-state visibility
// window = zero (corrected from inaccurate "<1ms" in v4 draft — readers do
// experience lock-wait latency for the transaction duration, but never see
// an empty `phase_stay_calibration`).
await pipeline.withTransaction(pool, async (client) => {
  if (allBuckets.length === 0) {
    // Edge case: no source data → empty table. TRUNCATE only.
    await client.query('TRUNCATE phase_stay_calibration');
    return;
  }
  // Step 1: stage data in temp table OUTSIDE the lock-critical section.
  await client.query('CREATE TEMP TABLE phase_stay_calibration_staging (LIKE phase_stay_calibration INCLUDING DEFAULTS) ON COMMIT DROP');
  const stagingInsertSql = buildBulkInsertSQL('phase_stay_calibration_staging', COHORT_INSERT_COLS, allBuckets.length);
  const params = flattenBuckets(allBuckets, RUN_AT);
  await client.query(stagingInsertSql, params);
  // Step 2: atomic swap — TRUNCATE + INSERT FROM staging. Readers wait on ACCESS EXCLUSIVE; no empty visibility.
  await client.query('TRUNCATE phase_stay_calibration');
  await client.query('INSERT INTO phase_stay_calibration SELECT * FROM phase_stay_calibration_staging');
  // Temp table dropped on COMMIT (ON COMMIT DROP).
});
```

**Spec 47 §9.2 compliance:** 11 cols × max ~1000 rows ≈ 11000 params (well under 65535). No sub-batching.

### Part 3 — Tier counters + new audit metrics

```js
// Counters declared once.
let highVolumeBuckets    = 0;  // sample_size >= 100
let midVolumeBuckets     = 0;  // 30 <= sample_size < 100
let lowVolumeBuckets     = 0;  // 10 <= sample_size < 30
let outlierBuckets       = 0;  // sample_size < 10
let permitCohortCount    = 0;  // permit-side cohorts (permit_type non-NULL)
let coaCohortCount       = 0;  // CoA-side cohorts (coa_type_class non-NULL)
let unreliableBuckets    = 0;  // v2 fold #11: PRESERVED — existing metric, sample_size < 30
let unknownCohortCount   = 0;  // v3 fold v2-G-3: defensive metric for permit_type=NULL AND coa_type_class=NULL buckets
// v5 fold v4-C1 (CRITICAL — 4/4 reviewers): coaTypeClassNullTransitionCount MUST be
// populated by a separate SQL query against `lifecycle_transitions` source rows.
// Aggregate buckets collapse NULL coa_type_class rows into ONE bucket → cannot count
// individual NULL transitions from the loop. Declaration moved below; assigned from query.

for (const b of allBuckets) {
  if (b.permit_type != null) permitCohortCount++;
  else if (b.coa_type_class != null) coaCohortCount++;
  else unknownCohortCount++;  // v3 fold v2-G-3: defensive — both NULL means SQL bug or data corruption
  if (b.sample_size >= 100)         highVolumeBuckets++;
  else if (b.sample_size >= 30)     midVolumeBuckets++;
  else if (b.sample_size >= 10)     lowVolumeBuckets++;
  else                               outlierBuckets++;
  if (b.sample_size < 30)            unreliableBuckets++;
}

// v5 fold v4-M3: bucket-count upper-bound assertion (param-limit defense).
// 11 cols × 5000 rows = 55000 params < 65535 hard limit; ample headroom.
// On overage: FAIL the run with explicit error rather than silent parameter-limit truncation.
if (allBuckets.length > 5000) {
  throw new Error(
    `[compute-phase-calibration] bucket count ${allBuckets.length} exceeds 5000-row safety cap ` +
    `(param-limit headroom). CoA cardinality has grown; sub-batching deferred to Phase F.`
  );
}

// v5 fold v4-H1 (HIGH — 3/4): seq-range filter added to match coaAggSql population.
// Without this, the count includes CoA rows outside the spec-defined seq 1-22 range,
// making `coa_transition_count` and `coa_cohort_count` non-reconcilable for operators.
const { rows: [{ n: coaTransitionCount }] } = await pool.query(
  `SELECT COUNT(*)::int AS n FROM lifecycle_transitions
    WHERE lead_id LIKE 'coa:%'
      AND (from_seq BETWEEN 1 AND 22 OR to_seq BETWEEN 1 AND 22)`
);

// v5 fold v4-C1 (CRITICAL — 4/4 reviewers): separate SQL query populates
// coaTypeClassNullTransitionCount. Filter matches `coa_transition_count` query
// (same seq-range gate) so the >5% ratio is reconcilable.
const { rows: [{ n: coaTypeClassNullTransitionCount }] } = await pool.query(
  `SELECT COUNT(*)::int AS n FROM lifecycle_transitions
    WHERE lead_id LIKE 'coa:%'
      AND coa_type_class IS NULL
      AND (from_seq BETWEEN 1 AND 22 OR to_seq BETWEEN 1 AND 22)`
);

// v2 fold #13 + v5 fold v4-H2 (HIGH — 3/4 convergent): Phase D project_type coverage guard.
// v5 wraps the coa_applications query with information_schema.tables EXISTS check (the
// v3-DS-HIGH-2 fold was applied to lifecycle_transitions but missed coa_applications,
// caught by DeepSeek + Independent v4 convergent finding). Missing table → WARN + null,
// not advisory-lock-leaking crash.
// Source 1 — coa_applications: measures whether Phase D classify-coa-scope.js has populated
// the column on the source rows. The threshold WARN at <50% indicates Phase D hasn't run
// (or didn't classify ≥50% of rows). This is the metric exposed in audit_table.rows post-v3 promotion.
const { rows: [{ exists: coaAppsExists }] } = await pool.query(
  `SELECT EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_schema = 'public' AND table_name = 'coa_applications') AS exists`
);
let projectTypeCoveragePct = null;
let ltProjectTypeCoveragePct = null;
if (coaAppsExists) {
  const { rows: [{ pct }] } = await pool.query(
    `SELECT COALESCE(
       ROUND(100.0 * COUNT(*) FILTER (WHERE project_type IS NOT NULL) / NULLIF(COUNT(*), 0))::int,
       0) AS pct
       FROM coa_applications`
  );
  projectTypeCoveragePct = pct;
  // Source 2 — lifecycle_transitions: measures what the CoA aggregate ACTUALLY reads.
  // A CoA application could have project_type=set today (Source 1=100%) but ALL its historical
  // lifecycle_transitions rows were written by E.2 before Phase D ran → those transition rows
  // have project_type=NULL → CoA aggregate sees 0% project_type coverage on the source data.
  // This differentiates "Phase D ran today" from "Phase D ran before E.2 wrote the transitions".
  const { rows: [{ pct: ltPct }] } = await pool.query(
    `SELECT COALESCE(
       ROUND(100.0 * COUNT(*) FILTER (WHERE project_type IS NOT NULL) / NULLIF(COUNT(*), 0))::int,
       0) AS pct
       FROM lifecycle_transitions
      WHERE lead_id LIKE 'coa:%'`
  );
  ltProjectTypeCoveragePct = ltPct;
} else {
  pipeline.log.warn('[compute-phase-calibration]',
    'coa_applications table missing — Phase D migrations not yet applied. ' +
    'Skipping project_type coverage guard; audit metric will report null.');
}
if (projectTypeCoveragePct != null && projectTypeCoveragePct < 50) {
  pipeline.log.warn('[compute-phase-calibration]',
    `coa_applications.project_type coverage ${projectTypeCoveragePct}% (< 50%) — ` +
    `Phase D classify-coa-scope.js may not have run. Verify Phase D execution.`);
}
if (
  ltProjectTypeCoveragePct != null && projectTypeCoveragePct != null &&
  ltProjectTypeCoveragePct < projectTypeCoveragePct - 10
) {
  pipeline.log.warn('[compute-phase-calibration]',
    `lifecycle_transitions.project_type coverage ${ltProjectTypeCoveragePct}% lags ` +
    `coa_applications by >10% — old transitions predate Phase D. CoA cohort buckets ` +
    `may be sparse until E.2 reclassifies all CoA rows (next dirty run).`);
}
```

### Part 4 — Audit_table with verdict fix (Spec 47 §R10 compliant)

```js
const auditRows = [
  // EXISTING — preserved unchanged
  { metric: 'total_buckets',           value: allBuckets.length,    threshold: '>= 1', status: allBuckets.length >= 1 ? 'PASS' : 'FAIL' },
  { metric: 'permit_types_calibrated', value: permitTypesSeen.size, threshold: null,   status: 'INFO' },
  { metric: 'phases_calibrated',       value: phasesSeen.size,      threshold: null,   status: 'INFO' },
  // v2 fold #11 + v3 fold v2-O-L/Indep F: unreliable_buckets PRESERVED + documented overlap.
  // NOTE: by definition `unreliable_buckets = low_volume_buckets + outlier_buckets` (both = sample_size < 30).
  // Operator dashboards: do NOT sum tier metrics with this. unreliable retained for Spec 48 observer 7-day baseline continuity.
  { metric: 'unreliable_buckets',      value: unreliableBuckets,    threshold: '< 30 sample_size triggers WARN; equals low+outlier by definition (do not sum)', status: unreliableBuckets > 0 ? 'WARN' : 'INFO' },
  // E.3 NEW — granular cohort observability
  { metric: 'permit_cohort_count',     value: permitCohortCount,    threshold: null,   status: 'INFO' },
  { metric: 'coa_cohort_count',        value: coaCohortCount,       threshold: null,   status: 'INFO' },
  { metric: 'coa_transition_count',    value: coaTransitionCount,   threshold: null,   status: 'INFO' },  // v2 fold #15
  { metric: 'high_volume_buckets',     value: highVolumeBuckets,    threshold: null,   status: 'INFO' },
  { metric: 'mid_volume_buckets',      value: midVolumeBuckets,     threshold: null,   status: 'INFO' },
  { metric: 'low_volume_buckets',      value: lowVolumeBuckets,     threshold: null,   status: 'INFO' },
  { metric: 'outlier_buckets',         value: outlierBuckets,       threshold: null,   status: 'INFO' },
  // Sanity gate — WARN on 0 (operator triage via coa_transition_count)
  { metric: 'coa_cohort_presence',     value: coaCohortCount,       threshold: '>= 1 post-E.2 first-run', status: coaCohortCount >= 1 ? 'PASS' : 'WARN' },
  // v3 fold v2-O-M: PROMOTED from records_meta to audit_table.rows so observer's automated
  // gate fires on Phase D coverage degradation.
  { metric: 'coa_project_type_coverage_pct', value: projectTypeCoveragePct, threshold: '>= 50 PASS, < 50 WARN', status: projectTypeCoveragePct >= 50 ? 'PASS' : 'WARN' },
  // v3 fold v2-G-3 (reachable post-v4): defensive observability for cohort buckets that have
  // NEITHER permit_type NOR coa_type_class non-NULL. Reachable cases: CoA transitions where
  // Phase D never classified the underlying CoA → both columns NULL → bucket lands here.
  { metric: 'unknown_cohort_count',    value: unknownCohortCount,   threshold: '== 0 PASS, > 0 WARN', status: unknownCohortCount === 0 ? 'PASS' : 'WARN' },
  // v4 fold v3-G-HIGH-3: new metric counts source CoA transitions with NULL coa_type_class.
  // Replaces the data-destructive `AND coa_type_class IS NOT NULL` filter removed from the
  // CoA aggregate. Operators see how many transitions are unclassified by Phase D.
  // v5 fold v4-L1: descriptor clarified — value stores absolute count, threshold computes ratio.
  { metric: 'coa_type_class_null_transition_count', value: coaTypeClassNullTransitionCount, threshold: 'ratio <= 0.05 PASS, > 0.05 WARN (relative to coa_transition_count); value field stores absolute count for triage', status: coaTransitionCount === 0 || (coaTypeClassNullTransitionCount / coaTransitionCount) <= 0.05 ? 'PASS' : 'WARN' },
];
// TOTAL: 15 rows. Composition: 4 existing (total_buckets, permit_types_calibrated,
// phases_calibrated, unreliable_buckets) + 7 new INFO (permit_cohort_count, coa_cohort_count,
// coa_transition_count, high_volume_buckets, mid_volume_buckets, low_volume_buckets,
// outlier_buckets) + 4 new thresholded WARN gates (coa_cohort_presence,
// coa_project_type_coverage_pct, unknown_cohort_count, coa_type_class_null_transition_count).
// Thresholded total: 6 (total_buckets FAIL gate + unreliable_buckets WARN gate +
// 4 new thresholded WARN gates above).

// v2 fold #6: verdict DERIVED from row statuses per Spec 47 §R10 (replaces existing hardcoded bug).
const auditVerdict =
  auditRows.some((r) => r.status === 'FAIL') ? 'FAIL' :
  auditRows.some((r) => r.status === 'WARN') ? 'WARN' : 'PASS';
```

### Part 5 — `records_meta` distributions (Spec 48 §3.2 — NOT to DeepSeek)

```js
records_meta: {
  audit_table: { phase: 84, name: 'Phase Calibration', verdict: auditVerdict, rows: auditRows },
  // E.3 NEW — distributions for operator manual SQL inspection only
  sample_size_distribution: { high: highVolumeBuckets, mid: midVolumeBuckets, low: lowVolumeBuckets, outlier: outlierBuckets },
  cohort_dimension_coverage: {
    permit_type_non_null:    permitCohortCount,           // by definition equal to permit-side cohort count
    coa_type_class_non_null: coaCohortCount,              // by definition equal to CoA-side cohort count
    project_type_non_null:   allBuckets.filter((b) => b.project_type != null).length,
    from_seq_non_null:       allBuckets.filter((b) => b.from_seq != null).length,
    to_seq_non_null:         allBuckets.filter((b) => b.to_seq != null).length,
  },
  // For triage when coa_cohort_presence WARNs
  coa_project_type_coverage_pct: projectTypeCoveragePct,
},
```

### Part 6 — `emitMeta` extension

```js
pipeline.emitMeta(
  {
    permit_phase_transitions: ['permit_num', 'revision_num', 'from_phase', 'to_phase', 'transitioned_at', 'permit_type', 'id'],  // v2 fold #8: id needed for LAG tiebreaker
    lifecycle_transitions:    ['lead_id', 'from_phase', 'to_phase', 'from_seq', 'to_seq', 'transitioned_at', 'project_type', 'coa_type_class', 'id'],
    coa_applications:         ['project_type'],  // v2 fold #13: project_type coverage guard read
  },
  {
    phase_stay_calibration: COHORT_INSERT_COLS,
  },
);
```

### Part 7 — `scripts/manifest.json` CoA chain add (v2 fold #12)

```json
{
  "name": "coa",
  "steps": [
    "load_coa", "link_coa", "link_coa_to_parcels", "classify_coa_scope",
    "classify_coa_trades", "compute_coa_cost_estimates", "classify_lifecycle_phase",
    "compute_phase_calibration",     // <-- NEW — added after classify_lifecycle_phase
    "assert_global_coverage"
    // ... etc
  ]
}
```

After E.3 ships, calibration runs in BOTH chains. CoA-only chain runs trigger calibration refresh on the same advisory lock — so concurrent permits+coa-chain runs serialise at the calibration step (correct per existing lock 93).

### Part 8 — Startup guards (Spec 47 §R5 + E.2 Independent H-1 convention)

```js
// v2 fold #10: differentiated table-empty vs partial-data
const { rows: [{ exists }] } = await pool.query(
  `SELECT EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_schema = 'public' AND table_name = 'lifecycle_transitions') AS exists`
);
if (!exists) throw new Error('[compute-phase-calibration] lifecycle_transitions table missing — apply Phase B mig 134 first');

const { rows: [{ n: coaCount }] } = await pool.query(
  `SELECT COUNT(*)::int AS n FROM lifecycle_transitions WHERE lead_id LIKE 'coa:%'`
);
if (coaCount === 0) {
  pipeline.log.warn('[compute-phase-calibration]',
    'lifecycle_transitions has zero CoA-side rows — E.2 first run has not yet produced CoA transitions. ' +
    'coa_cohort_count will be 0 (expected pre-E.2 first-run state).');
} else {
  pipeline.log.info('[compute-phase-calibration]',
    `lifecycle_transitions has ${coaCount.toLocaleString()} CoA-side rows; expecting CoA cohorts.`);
}
```

### Database Impact

**YES — migration 147 ships in E.3** (v3 reframe per Independent G CRIT).

```sql
-- migrations/147_phase_stay_calibration_drop_legacy_pk.sql
-- Phase E.3 — drop legacy PRIMARY KEY (permit_type, phase) from
-- phase_stay_calibration; make permit_type + phase nullable; mig 135's
-- 5-tuple UNIQUE INDEX phase_stay_calibration_new_unique remains as the
-- de facto integrity constraint.
--
-- Background: mig 123 created the table with PK (permit_type, phase).
-- Mig 135 added 4 granular columns + UNIQUE INDEX with NULLS DISTINCT but
-- did NOT drop the old PK. Mig 135's comment: "The pre-existing PK on
-- (permit_type, phase) enforces uniqueness during the transition" —
-- foreshadowing Phase E's responsibility to drop it.
--
-- v3 fold v2-G + v2-E: CoA-side rows have permit_type=NULL (CoA leads
-- don't have a permit_type) and may have phase=NULL (MIN(from_phase) over
-- all-NULL partition). PK + NOT NULL constraints reject these INSERTs.
--
-- SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.7 step 6 + §6.11 Phase E
-- SPEC LINK: docs/specs/01-pipeline/84_lifecycle_phase_engine.md §7
--
-- v4 fold v3-IF: NO explicit BEGIN/COMMIT in this migration. Mig 135's
-- header documents the recurring failure mode — the runner's outer
-- transaction wraps each migration; an explicit BEGIN/COMMIT inside the
-- migration commits the outer transaction prematurely, decoupling the
-- DDL from the schema_migrations record (R8 CI hotfix on mig 135).

-- UP

-- Drop the legacy PRIMARY KEY. Mig 135's UNIQUE INDEX on
-- (permit_type, project_type, coa_type_class, from_seq, to_seq) with
-- NULLS DISTINCT enforces row uniqueness on the new shape.
ALTER TABLE phase_stay_calibration
  DROP CONSTRAINT IF EXISTS phase_stay_calibration_pkey;

-- Make permit_type nullable so CoA-side rows (permit_type=NULL) can insert.
ALTER TABLE phase_stay_calibration
  ALTER COLUMN permit_type DROP NOT NULL;

-- Make phase nullable so cohorts with MIN(from_phase)=NULL (all-null
-- partition: first-classification rows where E.2 wrote from_phase=NULL)
-- can insert.
ALTER TABLE phase_stay_calibration
  ALTER COLUMN phase DROP NOT NULL;

-- v4 fold v3-DS-1 + v3-Indep-A: partial unique index restores structural
-- 2-tuple uniqueness for permit-side rows (where permit_type IS NOT NULL).
-- CoA-side rows have permit_type NULL → not covered by this index → can
-- coexist with permit-side rows under mig 135's 5-tuple UNIQUE INDEX
-- (NULLS DISTINCT). External writers or future bugs cannot create duplicate
-- (permit_type, phase) rows for legacy permit-side cohorts.
CREATE UNIQUE INDEX IF NOT EXISTS phase_stay_calibration_permit_legacy_unique
  ON phase_stay_calibration (permit_type, phase)
  WHERE permit_type IS NOT NULL;

-- v4 fold v3-G-HIGH-2: partial composite index on lifecycle_transitions
-- to support the CoA aggregate's LAG window (PARTITION BY lead_id ORDER BY
-- transitioned_at, id). Partial filter keeps the index small (CoA rows only).
-- Critical for performance scaling beyond ~30K rows.
CREATE INDEX IF NOT EXISTS lifecycle_transitions_coa_lag_idx
  ON lifecycle_transitions (lead_id, transitioned_at, id)
  WHERE lead_id LIKE 'coa:%';

-- v4 fold v3-Indep-A advisory: future direct writers to phase_stay_calibration
-- bypassing compute-phase-calibration's atomic temp-table swap pattern MUST
-- preserve legacy 2-tuple uniqueness. The partial unique index above is the
-- structural enforcement; the script's CREATE TEMP TABLE + TRUNCATE + INSERT
-- pattern is the runtime enforcement on every E.3 run.

-- DOWN — manual rollback only, intentionally not transactional
-- (Rule 6 / commit 8b1c10b convention; v4 fold v3-G-MED-3 + v3-DS-LOW-6:
-- DELETE step added so rollback is correct against post-E.3 data state.
-- v5 fold v4-M1: DELETE step #2 added to catch any NULL-phase row that
-- would otherwise block ALTER COLUMN phase SET NOT NULL).
-- Operator rollback order (manual, NOT auto-executed):
-- 1a. DELETE FROM phase_stay_calibration WHERE permit_type IS NULL;  -- remove CoA-side rows
-- 1b. DELETE FROM phase_stay_calibration WHERE phase IS NULL;        -- v5 fold v4-M1: catch any legacy NULL-phase row
-- 2.  DROP INDEX IF EXISTS lifecycle_transitions_coa_lag_idx;
-- 3.  DROP INDEX IF EXISTS phase_stay_calibration_permit_legacy_unique;
-- 4.  ALTER TABLE phase_stay_calibration ALTER COLUMN phase SET NOT NULL;
-- 5.  ALTER TABLE phase_stay_calibration ALTER COLUMN permit_type SET NOT NULL;
-- 6.  ALTER TABLE phase_stay_calibration ADD PRIMARY KEY (permit_type, phase);
```

**Migration safety**: at ~165 existing rows the DROP CONSTRAINT + ALTER COLUMN operations are O(1) metadata-only changes. No table rewrite. Expected runtime < 100ms.

### Audit Observability (Spec 48 lens)

**15-row `audit_table.rows`** (v5 fold v4-L2: 4 existing + 7 new INFO + 4 new thresholded WARN gates; 6 thresholded total including the 2 existing thresholded rows `total_buckets` FAIL + `unreliable_buckets` WARN).

**3 distribution maps in `records_meta`** (`sample_size_distribution`, `cohort_dimension_coverage`, `coa_project_type_coverage_pct`) — surfaced for manual operator SQL inspection only (Spec 48 §3.2: NOT passed to DeepSeek `contextJson`).

**Observer report file routing**: `compute_phase_calibration` post-E.3 runs in BOTH chains (`permits` + `coa` per fold #12). Observer writes to BOTH `permits-followup.md` AND `coa-followup.md`.

**First-E.3-run mitigation** (v2 fold #14 — rewritten per Observability L):

**First-E.3-run anomaly checklist (v4 fold v3-O-LOW-K reformat — numbered list for operator scanability):**
>
> 1. **`duration_ms` regression** (2-3× expected). Cause: UNION-ALL of two aggregates + 5-tuple GROUP BY on CoA-side. Action: annotate as expected; do not file WF3.
> 2. **`records_total` increase** by CoA transition count (~30K post-E.2). Cause: ledger now consumed. Action: annotate as expected.
> 3. **`coa_transition_count` jump** from 0 to ~30K. Cause: new INFO metric, baseline=0. Action: DeepSeek narrative may flag; INFO row only, no automated FAIL/WARN; no operator action.
> 4. **`coa_project_type_coverage_pct` WARN** (if <50%). Cause: Phase D `classify-coa-scope.js` incomplete. Action: verify Phase D succeeded; do NOT treat as regression unless Phase D was expected complete.
> 5. **`coa_type_class_null_transition_count` WARN** (if >5% of `coa_transition_count`). Cause: similar — Phase D not classifying some CoA records. Action: verify Phase D coverage.
> 6. **Transient empty-table window** for `phase_stay_calibration` is now **zero** (v5 fold v4-H3 — corrected from inaccurate "<1ms"; the atomic TRUNCATE + INSERT inside one transaction holds ACCESS EXCLUSIVE for the full transaction, so readers block but never observe an empty table). Reader latency during the run is normal lock-wait behavior, not an empty-state visibility window.
>
> **Co-firing note (v5 fold v4-L3 — Observability)**: if `verdict=WARN` on first E.3 run with vectors #4 + #5 (and optionally `unknown_cohort_count`) simultaneously WARN, this is the **expected co-firing pattern** when Phase D is incomplete. Multiple WARN signals collapse to a single root cause (Phase D classify-coa-scope.js coverage). No WF3 action required; verify Phase D execution and re-run E.3 after Phase D completes.
>
> **Annotation target files**: BOTH `permits-followup.md` AND `coa-followup.md` (calibration runs in both chains post-v3 fold #12).
> **Annotation text**: `[expected CoA-side granular cohort SQL expansion + Phase D coverage gate signals, not a performance/data regression]`.
> **Note**: Spec 48 Improvement C (pinned baseline) is queued-not-authorized — manual annotation is the active mitigation._

### Tests (TDD cadence per WF1 Red Light/Green Light)

1. **`src/tests/compute-phase-calibration.infra.test.ts`** (NEW or EXTEND) — integration tests:
   - **Fixture seed**: 30 `permit_phase_transitions` rows (existing permit-side path) + 20 `lifecycle_transitions` CoA-side rows (with from_seq/to_seq in 1-22 range, populated project_type + coa_type_class).
   - **Forward-only run**: assert `phase_stay_calibration` has:
     - Permit-side rows: `permit_type` non-null, `coa_type_class IS NULL`, `from_seq IS NULL`, `to_seq IS NULL` (legacy shape preserved).
     - CoA-side rows: `permit_type IS NULL`, `project_type` non-null, `coa_type_class` non-null, `from_seq` IN 1-22, `to_seq` IN 1-22 (granular shape).
   - **Idempotency**: run twice; assert byte-identical output.
   - **LAG tiebreaker** (v2 fold #8): insert 2 transition rows with IDENTICAL `transitioned_at` for the same `lead_id` (different `id`); assert calibration is deterministic across runs (verifies the `, id` tiebreaker eliminates non-determinism).
   - **`coa_transition_count` triage** (v2 fold #15): scenario A — zero CoA rows in `lifecycle_transitions` → `coa_transition_count=0`, `coa_cohort_count=0`, `coa_cohort_presence=WARN`. Scenario B — 5 CoA rows but all in 2-row partitions (HAVING removed; tier counters track) → `coa_transition_count=5`, `coa_cohort_count>=1`, `outlier_buckets>=1`, `coa_cohort_presence=PASS`.
   - **Tier counter boundaries**: bucket-sample-size = 100, 99, 30, 29, 10, 9 → assert correct tier assignment.
   - **Audit verdict derivation** (v2 fold #6): inject a WARN row; assert `verdict='WARN'`. Inject a FAIL row; assert `verdict='FAIL'`.
   - **`unreliable_buckets` preservation** (v2 fold #11): assert the metric still exists with old semantics (`sample_size < 30 → WARN if > 0`).
   - **EXPLAIN ANALYZE** (v2 fold #18, staging only — v3 fold v2-DS-3 relaxes the assertion): execute `EXPLAIN (ANALYZE, BUFFERS) <coaAggSql>`; assert `execution_time_ms < 5000` (5-second budget). Sequential scan on `lifecycle_transitions` is acceptable at ~30K row scale; composite index on `(lead_id, from_seq, to_seq)` deferred to Phase H or later if CoA volume grows past ~1M rows.
   - **`project_type` coverage guard** (v2 fold #13): scenario where coverage = 30% → assert WARN log emitted. v3 extends: dual-source guard (coa_applications + lifecycle_transitions) — assert both pct values logged.
   - **Duration-attribution test** (v3 fold v2-G-2 — Gemini HIGH): seed Lead 'A' with known transitions: P1→P2 at Day 0, P2→P3 at Day 10, P3→P4 at Day 30. Run E.3. Assert: cohort `(NULL, project_type, coa_type_class, from_seq=P2-seq, to_seq=P3-seq)` has `median_days = 10` (duration of P2 = Day 10 - Day 0). Assert: cohort `(..., from_seq=P3-seq, ...)` has `median_days = 20` (duration of P3 = Day 30 - Day 10). Validates LAG-based duration attribution — guards against the off-by-one Gemini hypothesized in v2 (which we verified false-positive but the test cements the contract).
   - **`unknown_cohort_count` realistic test** (v3 fold v2-G-3 + v5 fold v4-N1 — Gemini): seed a `coa_applications` record with NULL `project_type` AND NULL `coa_type_class` (legitimate Phase D-incomplete state — both columns are nullable on coa_applications until classify-coa-scope.js runs). Run the E.2 writer to produce a corresponding `lifecycle_transitions` row (also NULL on both columns; no constraint violation since lifecycle_transitions inherits nullability). Then run E.3. Assert: aggregate produces a bucket with both columns NULL → `unknown_cohort_count >= 1`; assert `audit_table.verdict = 'WARN'`. Validates the realistic Phase D-incomplete failure mode rather than an "impossible injection" scenario.
   - **Migration 147 forward test**: apply mig 147 against fresh schema; assert `phase_stay_calibration_pkey` constraint absent; assert `permit_type` and `phase` columns nullable; assert mig 135's `phase_stay_calibration_new_unique` UNIQUE INDEX still present; assert new `phase_stay_calibration_permit_legacy_unique` partial unique index present; assert new `lifecycle_transitions_coa_lag_idx` partial composite index present.
   - **`coa_type_class_null_transition_count` population test** (v5 fold v4-C1 — addresses the 4/4 convergent CRIT bug that the metric was never populated): seed 100 CoA `lifecycle_transitions` rows; set `coa_type_class = NULL` on 10 of them (10% rate); run E.3; assert `coa_type_class_null_transition_count = 10` AND `audit_table.verdict = 'WARN'` (since 10/100 = 0.10 > 0.05 threshold). Re-seed with only 3 NULL out of 100 (3% rate); assert `coa_type_class_null_transition_count = 3` AND verdict = `'PASS'` for this row.
   - **`coa_applications` table-missing guard test** (v5 fold v4-H2): execute the script against a database where `coa_applications` is dropped (mock schema); assert no crash, WARN log emitted, `coa_project_type_coverage_pct` audit row value = `null`.
   - **`coa_transition_count` seq-range filter test** (v5 fold v4-H1): seed 20 CoA transitions of which 5 have seqs outside 1-22 range; assert `coa_transition_count = 15` (matches CoA aggregate population), not 20 (raw `LIKE 'coa:%'` count).
   - **Bucket-count safety cap test** (v5 fold v4-M3): mock or fixture a scenario producing 5001 buckets; assert the script throws with the explicit param-limit error message; assert no INSERT executed (transaction rolled back).

2. **`src/tests/compute-phase-calibration.logic.test.ts`** (NEW) — pure-function helper tests:
   - `buildBulkInsertSQL('t', ['a','b','c'], 2)` → exact string with `$1, $2, $3, $4, $5, $6` placeholders.
   - `flattenBuckets([{...},{...}], RUN_AT)` → exact param array order and length.
   - Tier classification: `classifyTier(100) → 'high'`, etc.

3. **Manifest test** (v2 fold #12): assert `scripts/manifest.json` `coa` chain includes `compute_phase_calibration` after `classify_lifecycle_phase`.

4. **`migration-135-phase-stay-calibration.infra.test.ts`** (existing — preserve passing): NULLS DISTINCT UNIQUE INDEX permits coexistence of permit-side (coa_type_class NULL) + CoA-side (permit_type NULL) rows.

### Standards Compliance

- **Try-Catch Boundary** (§2.2 + Spec 47 §R6): existing `pipeline.withAdvisoryLock(pool, 93, async () => {...})` envelope. `withTransaction` rollback on inner failure.
- **Unhappy Path Tests** (§2.1): EXPLAIN ANALYZE failure path; project_type coverage 0% path; CoA-side seq out-of-range path.
- **logError Mandate** (§6.1): new catch blocks use `pipeline.log.error('[compute-phase-calibration]', err, { context })`.
- **Database — Add-Backfill-Drop** (§3.1): N/A — no new columns; mig 135 already shipped.
- **Database — Pagination** (§3.2): N/A — bounded query output (~1000 rows max).
- **Pipeline Safety — Transaction Boundaries** (§9.1): DELETE + INSERT in single `pipeline.withTransaction`.
- **Pipeline Safety — Parameter Limit** (§9.2): 11 cols × 1000 max rows ≈ 11000 params (< 65535). Single batch.
- **Pipeline Safety — Idempotent Scripts** (§9.3): DELETE+INSERT fully idempotent. Re-run produces identical output.

### Spec 47 §R1-R12 Compliance (explicit walkthrough)

- **§R1**: SDK imports unchanged.
- **§R2**: ADVISORY_LOCK_ID = 93 unchanged.
- **§R3**: Batch size implicit (single INSERT for ~1000 rows; 11000 params << 65535).
- **§R3.5**: `RUN_AT = await pipeline.getDbTimestamp(pool)` unchanged.
- **§R4**: Zod config validation unchanged. No new logic_variables.
- **§R5**: Startup guards EXTENDED (v2 fold #10) — table existence + CoA-side count + project_type coverage.
- **§R6**: `pipeline.withAdvisoryLock` unchanged.
- **§R7**: `pool.query` (output bounded ~1000 rows; no streaming needed).
- **§R8**: SQL-side computation (PERCENTILE_CONT, LAG).
- **§R9**: Atomic DELETE + bulk INSERT in single `pipeline.withTransaction`.
- **§R10**: PIPELINE_SUMMARY with `audit_table.verdict` DERIVED from row statuses (v2 fold #6 — fixes pre-existing bug).
- **§R11**: emitMeta extended (Part 6).
- **§R12**: existing `total_buckets >= 1 FAIL` gate preserved; new `coa_cohort_presence` WARN-only.

### Spec 48 Pipeline Observability Adherence

- **§3.1**: observer reads `audit_table.rows` for automated WARN/FAIL. E.3 emits 15 scalar rows; 6 thresholded (1 FAIL gate `total_buckets` + 5 WARN gates: `unreliable_buckets`, `coa_cohort_presence`, `coa_project_type_coverage_pct`, `unknown_cohort_count`, `coa_type_class_null_transition_count`).
- **§3.2**: distributions in `records_meta` NOT passed to DeepSeek context. Manual operator inspection via SQL.
- **§3.3**: post-E.3 (v2 fold #12), `compute_phase_calibration` runs in BOTH chains; observer writes to BOTH followup files.
- **§3.4-§3.5**: observer fire-and-forget; emits its own audit_table. NO E.3 impact.

### Pre-Review Self-Checklist (22 items)

- (a) Scope is CoA-side only per v2 fold #1; permit-side aggregate UNCHANGED.
- (b) `HAVING COUNT(*) >= 3` removed (v2 fold #2); tier counters handle low/outlier observability.
- (c) `lifecycle_transitions` filter uses primary `from_seq/to_seq BETWEEN 1 AND 22` (intrinsic CoA range) + defensive `lead_id LIKE 'coa:%'`.
- (d) LAG `ORDER BY ..., id` tiebreaker on both permit-side AND CoA-side CTEs (v2 fold #8).
- (e) `from_phase` removed from GROUP BY; `MIN(from_phase) AS from_phase` aggregate (v2 fold #7).
- (f) `EXTRACT(EPOCH FROM ...)` computed once in inner subquery, referenced thrice by PERCENTILE_CONT (v2 fold #19).
- (g) BOTH `project_type IS NOT NULL` AND `coa_type_class IS NOT NULL` filters REMOVED from CoA aggregate WHERE clause (v3 fold v2-DS-1 + v4 fold v3-G-HIGH-3); NULLS DISTINCT (mig 135) handles permit-vs-CoA coexistence; new audit metrics `coa_type_class_null_transition_count` + `coa_project_type_coverage_pct` provide observability.
- (h) Bulk INSERT uses `COHORT_INSERT_COLS` constant + `buildBulkInsertSQL` helper (v2 fold #4 — eliminates manual placeholder arithmetic).
- (i) `audit_table.verdict` DERIVED from row statuses per §R10 (v2 fold #6 — fixes pre-existing bug at script line 155).
- (j) 15 audit_table rows / 6 thresholded (v5 fold v4-L2): 4 existing (`total_buckets` FAIL, `permit_types_calibrated` INFO, `phases_calibrated` INFO, `unreliable_buckets` WARN — PRESERVED per v2 fold #11) + 7 new INFO (`permit_cohort_count`, `coa_cohort_count`, `coa_transition_count`, `high_volume_buckets`, `mid_volume_buckets`, `low_volume_buckets`, `outlier_buckets`) + 4 new thresholded WARN gates (`coa_cohort_presence`, `coa_project_type_coverage_pct`, `unknown_cohort_count`, `coa_type_class_null_transition_count`).
- (k) `coa_transition_count` audit row (v2 fold #15) — triage signal to distinguish E.2-not-run vs E.2-ran-sparse.
- (l) 3 records_meta distributions: `sample_size_distribution`, `cohort_dimension_coverage`, `coa_project_type_coverage_pct`.
- (m) Startup guards: table-exists + CoA-row-count + project_type-coverage WARN (v2 folds #10, #13).
- (n) `scripts/manifest.json` CoA chain includes `compute_phase_calibration` after `classify_lifecycle_phase` (v2 fold #12).
- (o) Operator pre-ack targets duration regression (v2 fold #14 — Observability L).
- (p) NULLS DISTINCT coexistence: permit-side `(permit_type, NULL, NULL, NULL, NULL, from_phase)` + CoA-side `(NULL, project_type, coa_type_class, from_seq, to_seq, from_phase)` — distinct under NULLS DISTINCT.
- (q) emitMeta extended with `lifecycle_transitions`, `coa_applications`, and `id` columns added to existing tables for LAG tiebreaker (v2 fold #8).
- (r) Spec 47 §R1-R12 walkthrough complete; Spec 48 §3.1-§3.5 alignment documented.
- (s) Engineering Standards §2/3/6/9 explicit walkthrough complete.
- (t) Tests in 4 files: infra (integration) + logic (helpers) + manifest assertion + mig-135 regression. EXPLAIN ANALYZE staging-only test (v2 fold #18).
- (u) Phase F readiness: granular CoA cohorts ready for `compute-trade-forecasts.js` UNION extension.
- (v) Spec amendments: §6.9 anchor; §6.11 Phase E E.3 anchor; §7 calibration-source extension; 84-W4 entry update; Phase I row anchor (Spec 42 §6.11).

### Execution Plan (per WF1 in `.claude/workflows.md`)

- [x] **Contract Definition:** COHORT_INSERT_COLS constant; audit_table 15-row shape (6 thresholded — v5 fold v4-L2); verdict derivation pattern.
- [x] **Schema Evolution:** migration 147 (drop legacy PK + partial unique index + LAG composite index).
- [x] **Test Scaffolding (TDD Red Light):** Added infra + logic + migration shape + manifest tests. 37/249 failed Red Light.
- [x] **Red Light:** confirmed failing (37 failures).
- [x] **Implementation:**
  - Aggregate SQL extension (Part 1 — CoA-side ADD; permit-side preserved + `, id` tiebreaker).
  - Bulk INSERT helper + COHORT_INSERT_COLS + flattenBuckets (Part 2 — name-based lookup).
  - Tier counters + new audit metrics + dedicated SQL queries for coaTransitionCount + coaTypeClassNullTransitionCount (Part 3).
  - Audit_table extension (15 rows / 6 thresholded) + verdict fix per Spec 47 §R10 (Part 4).
  - records_meta distributions (Part 5).
  - emitMeta extension (Part 6).
  - `scripts/manifest.json` CoA chain add + `FreshnessTimeline.tsx` CoA chain add (Part 7).
  - Startup guards: lifecycle_transitions + coa_applications + phase_stay_calibration EXISTS checks; bucket-count safety cap at 5000 (Part 8).
- [x] **Multi-Agent Review (4 reviewers parallel — diff stage):**
  - Gemini: 1 CRIT + 1 HIGH false positives (recurring from v2); 2 MED + 1 LOW deferred; 1 NIT folded.
  - DeepSeek: 2 HIGH (1 interpretive disagreement deferred, 1 EXISTS-guard gap folded); 2 MED + 6 LOW/NIT deferred.
  - Independent worktree: 0 CRIT, 2 IMPORTANT folded (`buildBulkInsertSQL(rowCount=0)` guard + `unknownCohortCount` misclassification convergent with Observability).
  - Observability worktree: 0 CRIT, 2 IMPORTANT folded (descriptor wording + classification convergent with Independent).
  - **Triage (v6):** 5 real findings folded inline; 2 verified false positives; 6 deferrals filed at `docs/reports/review_followups.md` items #119-#131.
- [x] **Green Light:** `npm run verify` clean (typecheck + lint + test — 249 tests pass).
- [x] **Operator pre-ack:** commit message includes duration regression annotation + co-firing pre-ack guidance.
- [x] **WF6 commit:** `9902860` — single commit covering scripts/migration/manifest/tests/specs/followups.
- [x] **Followups append:** `docs/reports/review_followups.md` items #119-#131.

### Spec Amendments (4)

1. **Spec 42 §6.9 modified-scripts table — `scripts/compute-phase-calibration.js` row** — replace placeholder with `[E.3-COMMIT]` post-commit. Append note: "v2 scope reframe (Independent C-1): permit-side calibration unchanged; CoA-side granular cohort added via UNION ALL with `lifecycle_transitions`. Permit-side granular seq derivation deferred to Phase H."

2. **Spec 42 §6.11 Phase E E.3 row** — fill `[E.3-COMMIT]` post-commit.

3. **Spec 84 §7 calibration source** — append: "E.3 (commit `[E.3-COMMIT]`) extended consumption to include CoA-side `lifecycle_transitions` (E.2 INSERT writer). CoA-side data drives granular 5-tuple cohort calibration `(NULL, project_type, coa_type_class, from_seq, to_seq)`. Permit-side data retains legacy 2-tuple `(permit_type, from_phase)` until Phase H consolidates `permit_phase_transitions` into `lifecycle_transitions`."

4. **Spec 84 84-W4 entry** — append: "E.3 (commit `[E.3-COMMIT]`) extended ledger consumption to `lifecycle_transitions` for CoA-side cohort calibration. Spec 84 §8.7 cohort blind-spot CLOSED for CoA-stage rows; permit-side blind-spot remains until Phase H."

---

> **PLAN LOCKED (v5)** — v4 plan-review 4-reviewer round surfaced 13 actionable findings, including a 4/4-convergent CRITICAL: `coaTypeClassNullTransitionCount` was declared but never populated (dead metric — would emit 0 every run, defeating the v4 observability replacement for the removed `coa_type_class IS NOT NULL` filter). Also a 3/4-convergent HIGH regression of the v3-DS-MED-3 fold (`coa_transition_count` query missing seq-range filter that the v4 revision table claimed was applied). v5 folds ALL 13 findings.
>
> v1→v2→v3→v4→v5 trajectory: 18 → 14 → 15 → 13 → v5 folds all. Per user authorization (response: "Fold all v4 + PLAN LOCK v5 directly"), v5 PLAN LOCKs without an additional plan-review round. The diff-stage 4-reviewer round (Gemini + DeepSeek + Independent worktree + Observability worktree) executed AFTER implementation will validate that all 13 folds correctly transferred from plan pseudocode to actual code.
>
> §10 note (v5 load-bearing changes on top of v4): (1) `coaTypeClassNullTransitionCount` now populated by a dedicated SQL query (CRITICAL fix — was emitting 0 silently); (2) `coa_transition_count` query gets the seq-range filter to match the aggregate population (HIGH regression fix); (3) `coa_applications` query wrapped in `information_schema.tables` EXISTS guard (HIGH defensive — prevents advisory-lock leak on missing-table crash); (4) pre-ack vector #6 wording corrected from `<1ms` to `zero` since TRUNCATE+INSERT inside one transaction holds ACCESS EXCLUSIVE for the full duration (HIGH accuracy); (5) bucket-count upper-bound assertion at 5000 rows with explicit FAIL error message (MED defensive against param-limit overflow); (6) mig 147 DOWN block adds `DELETE WHERE phase IS NULL` step before re-adding `SET NOT NULL` (MED rollback safety); (7) all 3 stale doc-count locations corrected to 15/6 (LOW consistency); (8) co-firing guidance added to pre-ack runbook (LOW operator clarity for verdict=WARN with multiple Phase D-incomplete signals); (9) `unknown_cohort_count` test rewritten as realistic Phase D-incomplete fixture instead of "impossible injection" (NIT semantic accuracy).
>
> The plan is authorized for implementation. Next step: scaffold tests (TDD Red Light), confirm failing, then implement.
