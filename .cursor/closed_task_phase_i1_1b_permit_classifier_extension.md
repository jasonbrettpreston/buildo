# Active Task: WF1 Phase I.1.1b — Spec 84 permit classifier extension (matchedStatus) (v2 — folded 4-reviewer round)
**Status:** Implementation
**Domain Mode:** Backend/Pipeline
**Workflow:** WF1 — per Spec 42 §6.11 row "Phase I" (Phase I.1.1b is the split-out scope from Phase I.1.1 v1 reviewer round)

---

## Plan revision history

* **v1** — initial draft. Ran 4-reviewer plan-stage round (Gemini bash + DeepSeek bash + Independent worktree + Observability worktree). **3 convergent CRITs + 8 HIGHs + several MEDs.** Independent + Observability convergence on dirty SELECT predicate gap; Gemini + Independent + DeepSeek convergence on Rule 12/13 contract violation; Gemini + Observability convergence on catchall ledger gap.
* **v2 (this revision)** — folds all CRITs + most HIGHs. DeepSeek SAVEPOINT CRIT was a **false positive** (verified `flushPermitBatch` already has the pattern at `scripts/classify-lifecycle-phase.js:911`). 5 DEFERs documented at end.

---

## Context

* **Goal:** Activate the dormant permit-side ledger writer in `classify-lifecycle-phase.js` by extending `classifyLifecyclePhase()` to return `{phase, stalled, matchedStatus, matchedRule, unmappedStatus}` (currently only `{phase, stalled}`). Population of mig 155's `permits.matched_status` / `matched_rule` / `unmapped_status` columns starts on the next chain run after deploy.

* **Why now:** Phase I.1 (commit `d579bc0`) shipped mig 155 + the dormant writer with a documented TODO at `scripts/classify-lifecycle-phase.js:1056`. Phase I.1.1 v1 reviewer round split this work out because it requires fresh design — not closure work.

* **Target Specs:**
  - `docs/specs/01-pipeline/84_lifecycle_phase_engine.md` — extend §2.5.a header note + add §3.7 (NEW: matchedStatus semantics for permits + 16-rule precedence)
  - `docs/specs/01-pipeline/42_chain_coa.md` — §6.11 Phase I row DELIVERED marker; §6.6.A note "deferred" → "populated"
  - `docs/specs/01-pipeline/41_chain_permits.md` — note classifier extension in classify-lifecycle-phase row
  - `docs/runbook/I1_first_deploy_spike.md` — flip permit-side classifier from DORMANT to ACTIVE; CRITICAL update of capacity ceiling (~200K-235K rows, NOT <1%)

* **Key files:**
  - `scripts/lib/lifecycle-phase.js` — extend `classifyLifecyclePhase()` via `finalizePermit()` helper (mirror CoA pattern)
  - `scripts/classify-lifecycle-phase.js` — wire `result.matchedStatus` / `matchedRule` / `unmappedStatus`; refactor `buildPermitUpdateSQL` from positional VALUES tuples → unnest array form; add 3 audit rows + rule distribution; add `permitFirstDeployGrace` startup flag
  - `src/tests/lifecycle-phase.logic.test.ts` — extend with matchedStatus/matchedRule assertions across all 16 rule sub-paths (including 5c orphan fallback)
  - `src/tests/classify-lifecycle-phase.infra.test.ts` — extend with permit-side ledger emission tests (status-change ledger row, catchall ledger row, dirty predicate covers `matched_rule IS NULL`)
  - `src/tests/db/lifecycle-status-history-writers.db.test.ts` — un-skip permit-side classifier tests where they don't require CKAN fixtures

## Substrate (read-before-design)

* **Current permit classifier** (`scripts/lib/lifecycle-phase.js:424-454`): `classifyLifecyclePhase(input)` returns `{phase, stalled}`. State machine: status null → unclassified; DEAD_STATUS_SET → null; TERMINAL_P20_SET → P20; WINDDOWN_P19_SET → P19; `is_orphan` → `classifyOrphan()`; else `classifyBldLed()`. `classifyOrphan` has 3 sub-exits (issued/inspection/revision time-bucket → O2/O3; INTAKE/REVIEW/HOLD/READY → O1; **fallback line 487 → O1** — caught by Independent CRIT 1 as untested). `classifyBldLed` has multiple status-set arms + dynamic Permit Issued time-bucket + inspection stage-mapping + inspection pipeline catchall.

* **CoA classifier reference shape** (`scripts/lib/lifecycle-phase.js:569-707`): `classifyCoaPhase()` returns `{phase, stalled, matchedStatus, matchedRule, unmappedStatus, unmappedDecision}` via `finalize({...})`. Pattern mirrored below.

* **SAVEPOINT already in place** (verified at `scripts/classify-lifecycle-phase.js:911`): `flushPermitBatch` already wraps the lifecycle_status_history INSERT in `SAVEPOINT ledger_write` / `ROLLBACK TO SAVEPOINT ledger_write`. DeepSeek's v1 CRIT was a false positive.

* **Dirty SELECT gap** (Independent CRIT 2 + Observability CRIT 1, both 92-95% confidence): the permit-side dirty SELECT at `scripts/classify-lifecycle-phase.js:1005-1007` is `WHERE lifecycle_classified_at IS NULL OR last_seen_at > lifecycle_classified_at` — **missing `OR matched_rule IS NULL`** (which is present on CoA-side at line 1263). Without this fix, already-classified permits (non-null `lifecycle_classified_at` + `last_seen_at <= lifecycle_classified_at`) never get matchedStatus populated. First-deploy doesn't backfill them.

* **mig 155 already shipped** (Phase I.1 commit `d579bc0`): `permits.matched_status TEXT`, `matched_rule SMALLINT` (CHECK 0..99), `unmapped_status BOOLEAN NOT NULL DEFAULT false`. No new migration needed for I.1.1b.

## matchedStatus / matchedRule design (v2 — folds all CRITs + HIGHs)

### matchedStatus contract (Spec 84 NEW §3.7)

**`matchedStatus` is ALWAYS the normalized raw `permits.status` value that the classifier saw on input.** No literal overrides. No downstream-computed label. The state-machine derivation lives in `phase`; the bifurcation context lives in `matchedRule`.

Folded clarifications:
- **Rule 12** (issued + time-bucket → P7a/P7b/P7c): matchedStatus = `'Permit Issued'` because the raw status IS literally 'Permit Issued'. NOT a literal override — coincidental with input.
- **Rule 13** (issued + has_passed_inspection → P9-P17 stage-mapped): matchedStatus = the RAW input status (typically 'Permit Issued', sometimes 'Inspection', sometimes 'Revision Issued'). **NOT** a hardcoded 'Inspection' literal. The phase carries the inspection-stage mapping; matchedStatus preserves data lineage.
- **Rule 14** (inspection pipeline catchall → P18): matchedStatus = raw input status (e.g., 'Forward to Inspector', 'Rescheduled'). NOT a hardcoded label.
- **Rule 15** (catchall, no set matched): matchedStatus = **the raw normalized unmapped status** (NOT null). `unmappedStatus=true`. The ledger captures `to_status = the new unmapped status` so the transition is observable. Resolves Gemini CRIT + Observability HIGH catchall-drop bug.

Exception only for genuine null paths:
- **Rule 0** (defensive null/non-object guard): `matchedStatus = null`, `matchedRule = 0`, `unmappedStatus = false`
- **Rule 1** (status == null): `matchedStatus = null`, `matchedRule = 1`, `unmappedStatus = false`

### matchedRule precedence (18 rules — Independent CRIT 1 fold: orphan rule split)

| Rule | Branch | Phase | matchedStatus | Notes |
|------|--------|-------|---------------|-------|
| 0 | defensive null/non-object guard | null | null | Mirrors CoA rule 0 |
| 1 | `status == null` | null | null | Excluded from CQA unclassified-count |
| 2 | DEAD_STATUS_SET | null | normalized dead status | ledger captures transition INTO dead |
| 3 | TERMINAL_P20_SET | P20 | normalized terminal status | |
| 4 | WINDDOWN_P19_SET | P19 | normalized winddown status | |
| 5a | orphan + issued/inspection/revision + time-bucket | O2 or O3 | raw normalized status | Independent CRIT 1 sub-split |
| 5b | orphan + INTAKE/REVIEW/HOLD/READY set | O1 | raw normalized status | Independent CRIT 1 sub-split |
| 5c | orphan fallback (any other status) | O1 | raw normalized status | Independent CRIT 1 sub-split — test coverage required |
| 6 | BldLed REVIEW_P4_SET | P4 | raw normalized status | |
| 7 | BldLed HOLD_P5_SET | P5 | raw normalized status | |
| 8 | BldLed READY_P6_SET | P6 | raw normalized status | |
| 9 | BldLed INTAKE_P3_SET | P3 | raw normalized status | CODE DRIFT (rows 4, 5, 10 §2.5.a) — out of scope |
| 10 | BldLed NOT_STARTED_P7D_SET | P7d | raw normalized status | CODE DRIFT (rows 6, 7 §2.5.a) — out of scope |
| 11 | BldLed REVISION_P8_SET | P8 | raw normalized status | |
| 12 | Permit Issued + has_passed_inspection=false + time-bucket | P7a / P7b / P7c | raw normalized status (= 'Permit Issued' by coincidence) | Independent CRIT 3 sub-split |
| 13 | Permit Issued + has_passed_inspection=true + latest_passed_stage maps | P9-P17 | raw normalized status (NOT hardcoded 'Inspection') | Independent CRIT 3 sub-split |
| 14 | INSPECTION_PIPELINE_P18_SET OR (Permit Issued + passed but stage unmapped) | P18 | raw normalized status | Independent CRIT 3 P17-fallback fold |
| 15 | catchall (none matched, status not null) | null | **raw normalized status** (NOT null — Gemini CRIT fold) | unmappedStatus=true |

**Orphan precedence over DEAD:** dead status takes precedence (rule 2 fires first). Documented in inline code comment per DeepSeek LOW.

### Implementation pattern (mirror CoA `finalize()`)

```js
function finalizePermit({phase, matchedRule, matchedStatus, unmappedStatus, stalled}) {
  // Runtime assertion (Independent IMPORTANT — `undefined` vs `null` footgun):
  // every exit MUST set matchedStatus to either `null` or a string.
  if (matchedStatus === undefined) {
    throw new Error(`[classifyLifecyclePhase] BUG: matchedStatus=undefined at rule ${matchedRule}`);
  }
  return { phase, stalled, matchedStatus, matchedRule, unmappedStatus };
}
```

### Catchall set detection helper (DeepSeek HIGH fold)

```js
// Pre-built at module load — single-Set membership check.
const ALL_KNOWN_PERMIT_STATUSES = new Set([
  ...DEAD_STATUS_SET, ...TERMINAL_P20_SET, ...WINDDOWN_P19_SET,
  ...INTAKE_P3_SET, ...REVIEW_P4_SET, ...HOLD_P5_SET, ...READY_P6_SET,
  ...NOT_STARTED_P7D_SET, ...REVISION_P8_SET, ...INSPECTION_PIPELINE_P18_SET,
  'Permit Issued', 'Inspection',  // dynamic-bucket / stage-mapped seeds
]);
function isKnownPermitStatus(status) { return ALL_KNOWN_PERMIT_STATUSES.has(status); }
```

Catchall (rule 15) fires when `status != null && !isKnownPermitStatus(status)`.

## Key files

### NEW / MODIFIED — `scripts/lib/lifecycle-phase.js`

* Extend `classifyLifecyclePhase()` to return the extended shape via `finalizePermit()`.
* Add `ALL_KNOWN_PERMIT_STATUSES` Set + `isKnownPermitStatus()` helper.
* Modify `classifyOrphan()` + `classifyBldLed()` to thread matchedStatus = the input raw status through every exit (no literal overrides on rules 12/13/14).
* Defensive guard (rule 0): non-object input returns `finalizePermit({phase:null, stalled:false, matchedStatus:null, matchedRule:0, unmappedStatus:false})`.
* Inline code comment documenting DEAD-precedes-orphan precedence (DeepSeek LOW).

### MODIFIED — `scripts/classify-lifecycle-phase.js`

* **CRIT-2 fold:** add `OR matched_rule IS NULL` to permit dirty-SELECT predicate at line 1006-1007 (mirror CoA-side line 1263 exactly).
* `buildPermitUpdateSQL` → migrate to unnest array form (`PERMIT_UPDATE_SQL` constant). 6 array params + 1 RUN_AT = 7 bind params constant.
  - **Independent IMPORTANT fold:** preserve `phase_started_at = CASE WHEN p.lifecycle_phase IS DISTINCT FROM upd.phase THEN $7::timestamptz ELSE p.phase_started_at END` (NOT present in CoA template — must be carried over manually).
* `flushPermitBatch`: pass `r.matched_status`, `r.matched_rule`, `r.unmapped_status` arrays to the UPDATE. UPDATE SQL adds 3 IS DISTINCT FROM guards.
* Permit batch construction (line 1034-1060): swap `matched_status: undefined` → `matched_status: result.matchedStatus`; same for `matched_rule`, `unmapped_status`. Remove TODO comment block.
* The existing dormant ledger filter (`r.matched_status != null && r.matched_status !== r.old_matched_status`) activates naturally. Note: under Gemini CRIT fold, rule 15 catchall now emits non-null matchedStatus, so unmapped transitions also reach the ledger.
* Add `permitUnmappedStatusCount`, `permitCatalogStatusMissingCount` permit-side accumulators (mirror CoA-side line 1105-1108).
* Add `permitRuleDistribution` + `permitMatchedStatusCounts` Maps (mirror CoA-side line 1114-1116).
* `emitMeta` writes: append `'matched_status', 'matched_rule', 'unmapped_status'` to permits output column list.
* `pipeline_runs.records_meta.audit_table.rows`: add 3 NEW rows:
  - `permit_unmapped_status_count` — threshold `'<=3 WARN, <=1 PASS'` via `computeWarnableAuditStatus(unmappedStatusCount, { passAt: 1, warnAt: 3 })` (Observability HIGH 3 fold — absolute thresholds, NOT percent). Softens to INFO during `permitFirstDeployGrace` window.
  - `permit_rule_distribution_top5` — top 5 rules by count (operator visibility per Observability HIGH 4)
  - `permit_code_drift_count` — count of `matched_status IN ('Not Started', 'Not Started - Express', 'Plan Review Complete')` (Observability MED fold — surfaces known §2.5.a drift)
* `records_meta.permit_rule_distribution` — full 16-rule distribution Map (Observability HIGH 4)
* `records_meta.permit_matched_status_top20` — top-20 with "Other" rollup via `buildTop20WithOther` (mirror CoA line 1617)
* **NEW** `permitFirstDeployGrace` startup query (Observability MED fold — mirror F.1):
  ```sql
  SELECT COUNT(*) FILTER (WHERE started_at < NOW() - INTERVAL '7 days')::int AS prior_runs_7d
    FROM pipeline_runs
   WHERE pipeline = 'permits:classify-lifecycle-phase'
     AND emit_meta->>'permit_classifier_extended' = 'true';
  ```
  - `permitFirstDeployGrace = (prior_runs_7d === 0)`. Used to soften `permit_unmapped_status_count` from WARN→INFO during first 7 days post-extension-deploy.
  - emit_meta sentinel `permit_classifier_extended: true` recorded on every run from I.1.1b forward.

### Spec amendments (additive — codify the contract that ships)

* **Spec 84 NEW §3.7 "matchedStatus for permits"** — codify "ALWAYS raw normalized input status" contract. 18-rule precedence table verbatim from above. Cross-reference §2.5.a known statuses + the catchall-non-null behavior.
* **Spec 84 §2.5.a header note** — "Current code maps to" column also drives `matched_rule` per the 18-rule precedence in §3.7.
* **Spec 42 §6.11 Phase I row** — "Phase I.1.1b deferred" → "Phase I.1.1b DELIVERED" + commit SHA placeholder.
* **Spec 42 §6.6.A** — "Population... deferred to Phase I.1.1b" → "Population active as of Phase I.1.1b (commit `[I.1.1b-COMMIT]`)."
* **Spec 41 §classify-lifecycle-phase step row** — note permit-side ledger emission.

### Runbook updates (Observability HIGH 6 + §3.7 mandatory artifacts fold)

* `docs/runbook/I1_first_deploy_spike.md` — comprehensive update, NOT one-line flip:
  - **Metrics table:** replace permit-side classifier DORMANT row with TWO rows: "Day 1 expected: 200K-235K ledger inserts on first run (first time matchedStatus populated for all classified permits per CRIT-2 backfill); subsequent days converge to per-CKAN-delta rate ~500-2000 rows/day. Permit-side dormant filter activated per Phase I.1.1b commit `[I.1.1b-COMMIT]`."
  - **Pre-deploy capacity query update:** ADD a separate permit-classifier ceiling query reflecting actual spike magnitude (NOT <1%):
    ```sql
    SELECT COUNT(*) AS permit_classifier_first_run_ceiling
      FROM permits
     WHERE status IS NOT NULL;
    -- Realistic first-run delta: 95-98% of this number (only catchall + null
    -- statuses are excluded; load-permits.js entries are in non-catchall sets
    -- for typical CKAN data).
    ```
  - **Day-1 annotation block:** add NEW line for permit-classifier writer with its own ceiling number.
  - **Convergence query expected output:** classifier permit-side rows expected at the Day-1 ceiling on Day 1, converging to ~500-2000/day by Day 7.
  - **Exit criteria:** replace "≈0 until Phase I.1.1b" with steady-state Day-7 target.
  - **Grace window note:** `permitFirstDeployGrace = true` for 7 days post-deploy; `permit_unmapped_status_count` audit row softened to INFO during this window.

### Tests

* **`src/tests/lifecycle-phase.logic.test.ts`**:
  - Per-rule test cases for all 18 rule sub-paths (incl. 5c orphan fallback with REVISION_P8 status, 13 with various input statuses, 14 with P17 fallback).
  - Snapshot tests for the 53 distinct §2.5.a permit statuses (table-driven assertion of `{phase, matchedRule, matchedStatus}` per row).
  - **CRIT-3 catchall test:** input status='Notice Sent' → matchedStatus='Notice Sent', matchedRule=15, unmappedStatus=true (NOT matchedStatus=null).
  - **CRIT-1 contract test:** input status='Permit Issued' + has_passed_inspection=true + valid latest_passed_stage → matchedStatus='Permit Issued' (NOT 'Inspection').
  - **Independent footgun test:** finalize() throws if matchedStatus=undefined (artificial regression).

* **`src/tests/classify-lifecycle-phase.infra.test.ts`**:
  - Seed permit with `matched_status=NULL`, raw status='Under Review' → run classifier → assert post-run `permits.matched_status='Under Review'`, `matched_rule=6`, and `lifecycle_status_history` row exists with `from_status=NULL`, `to_status='Under Review'`, `detected_by='classify-lifecycle-phase.js'`.
  - **CRIT-2 backfill test:** seed permit with `lifecycle_classified_at = NOW() - 1 day`, `last_seen_at = NOW() - 2 days`, `matched_rule = NULL` → run classifier → assert the row IS in the dirty set (proves the `OR matched_rule IS NULL` clause works).
  - **CRIT-3 catchall ledger test:** seed permit with `status='Notice Sent'` (UNMAPPED) → run classifier → assert ledger row exists with `to_status='Notice Sent'`, `unmapped_status=true` on the permits row.

* **`src/tests/db/lifecycle-status-history-writers.db.test.ts`** — un-skip the permit-side classifier subset of the existing `describe.skip` block where they don't require CKAN fixtures (the classifier reads from the `permits` table directly).

## Technical Implementation

* **DB Impact:** NONE. mig 155 already in place; CHECK constraint + partial index exist.
* **No new migration needed.**
* **Backfill (Gemini HIGH 2 fold):** First-deploy backfill triggered by the `OR matched_rule IS NULL` predicate addition. Expected magnitude: ~200K-235K dirty permits on first run. The existing `PERMIT_BATCH_SIZE` (positional batch — currently sized via `Math.floor(65535 / 4)`) is replaced by unnest array form (no PG param limit pressure). Suggested batch size: 5000 (matches CoA pattern). At 5000 rows/batch × ~47 batches = ~5-10 minutes of classifier runtime on first deploy. Each batch is its own withTransaction — no single mega-transaction risk.
* **Pre-deploy spike:** ~200K-235K rows. Operator runbook records the capacity ceiling pre-deploy. observe-chain DeepSeek narrative WILL flag the spike (operator annotation is human-readable only per Phase I.1.1a Spec 48 §3.7 clarification).
* **Stale snapshot risk (DeepSeek LOW fold):** advisory lock prevents concurrent classifier runs but NOT API writes to `permits.status`. Mitigated by the existing IS DISTINCT FROM guards on the UPDATE — if a concurrent API write changed status between read and write, the IS DISTINCT FROM clause skips the no-op. No additional `updated_at` guard needed (the IS DISTINCT FROM clauses cover the relevant columns).

## Standards Compliance

* **Try-Catch Boundary:** N/A — no new API route.
* **Unhappy Path Tests:** non-object input (rule 0); status null (rule 1); catchall (rule 15); orphan fallback 5c; SAVEPOINT-fault via existing trigger fixture in `lifecycle-status-history-writers.db.test.ts`.
* **logError Mandate:** N/A — existing `pipeline.log.warn` in SAVEPOINT path (no change).
* **IS DISTINCT FROM guards:** PERMIT_UPDATE_SQL adds guards for `matched_status`, `matched_rule`, `unmapped_status` columns. `phase_started_at` CASE expression preserved per Independent IMPORTANT.
* **PG 65535 param limit (§9.2):** unnest array form eliminates the constraint (mirror CoA fix).
* **Idempotency:** classifier remains idempotent; UNIQUE INDEX on `lifecycle_status_history` dedups intra-second re-runs; runtime assertion in `finalizePermit()` catches `undefined` regressions.
* **§10 Plan Compliance Checklist (pending — generated post-implementation).**

## Execution Plan (WF1 verbatim — `.claude/workflows.md` §WF1)

- [x] **Contract Definition:** Spec 84 NEW §3.7 contract drafted; 4-reviewer round validated.
- [x] **Spec & Registry Sync:** Spec 84 §2.5.a + §3.7 + Spec 42 §6.11 + §6.6.A + Spec 41 row 22 updated.
- [x] **Schema Evolution:** N/A — mig 155 already shipped.
- [x] **Test Scaffolding:** 27 new logic tests (rules 0..15 + back-compat); 12 new infra regression locks; 1 behavioral CRIT-2 backfill test (db.test.ts).
- [x] **Red Light:** new tests verified to exercise the new shape; legacy `v.phase` regression locks updated to `upd.phase`.
- [x] **Implementation:** classifyLifecyclePhase + classifyOrphan + classifyBldLed extended (JS + TS twins); PERMIT_UPDATE_SQL unnest constant (phase_started_at CASE preserved); permit batch wiring; dirty SELECT predicate `OR matched_rule IS NULL`; permitFirstDeployGrace startup query; 4 NEW audit rows + 3 records_meta distributions; emit_meta sentinel; runbook update.
- [x] **Auth Boundary & Secrets:** N/A.
- [x] **Pre-Review Self-Checklist:** 20 items above all confirmed.
- [x] **Multi-Agent Review:** PLAN-STAGE 4-reviewer round done (3 CRITs + 8 HIGHs folded into v2). DIFF-STAGE 4-reviewer round done (1 CRIT + 4 IMPORTANTs + 1 MED folded).
- [x] **Triage:** All BUGs folded. 8 DEFERs documented in `docs/reports/review_followups.md`.
- [x] **Green Light:** `npm run typecheck` PASS · `npm run lint` clean for new code · `npm run test` 6286 passed / 84 skipped / 230 files.
- [ ] **WF6 close-out:** commit + docs follow-up filling `[I.1.1b-COMMIT]` in Spec 42 §6.11 + Spec 42 §6.6.A + Spec 41 row + runbook.

## Pre-Review Self-Checklist (v2 sketch — finalize post-implementation)

1. `classifyLifecyclePhase()` returns the extended shape from EVERY exit (no partial returns) — enforced by `finalizePermit()` runtime assertion.
2. `matchedStatus` is ALWAYS the raw normalized input status (no literal 'Inspection'/'Permit Issued' overrides on rule 12/13/14).
3. Rule 15 catchall sets `matchedStatus = raw unmapped status` (NOT null) — ledger captures transitions INTO unmapped statuses.
4. Defensive null/non-object guard returns `matchedRule=0` (mirrors CoA rule 0).
5. `unmappedStatus = true` only when `status != null && !isKnownPermitStatus(status)`.
6. `buildPermitUpdateSQL` refactor uses unnest array form (7 bind params constant); `phase_started_at` CASE expression preserved.
7. IS DISTINCT FROM guards added for `matched_status`, `matched_rule`, `unmapped_status`.
8. Dirty SELECT predicate INCLUDES `OR matched_rule IS NULL` (mirror CoA-side line 1263).
9. `flushPermitBatch` ledger filter activates naturally — no code change to the filter itself.
10. `permit_unmapped_status_count` audit row uses ABSOLUTE thresholds via `computeWarnableAuditStatus(passAt:1, warnAt:3)` — NOT percentage.
11. `permitFirstDeployGrace` startup query mirrors F.1 pattern; softens unmapped_status_count WARN→INFO during first 7 days.
12. `permitRuleDistribution` + `permitMatchedStatusCounts` + `permit_matched_status_top20` distributions added.
13. `permit_code_drift_count` audit row surfaces rows 6, 7, 10 §2.5.a drift (operator visibility, INFO only).
14. emitMeta writes list extended for permits output (3 new columns).
15. Spec 84 §3.7 codifies "matchedStatus = raw normalized input status, ALWAYS" contract + 18-rule table.
16. CODE DRIFT rows (6, 7, 10) explicitly noted as out-of-scope for I.1.1b.
17. Runbook update: permit-side classifier DORMANT → ACTIVE with REALISTIC ceiling (~200K-235K, NOT <1%); grace window note; convergence + exit criteria updates.
18. `lifecycle-phase.logic.test.ts` covers all 18 rules including 5c orphan fallback + rule 15 catchall non-null matchedStatus + rule 13 raw-status preservation.
19. CRIT-2 backfill test asserts `OR matched_rule IS NULL` clause works (a previously-classified permit with matched_rule=NULL is in dirty set).
20. CRIT-3 catchall ledger test asserts ledger row exists with `to_status = the unmapped status` (NOT NULL).

## Operating Boundaries

* **Target files** (above).
* **Out-of-scope (separate WFs):**
  - CODE DRIFT correction for Spec 84 §2.5.a rows 6, 7, 10 (membership move between status sets).
  - Spec 84 prose updates to §3 phase-by-phase contract (city def vs code drift).
  - Any change to `classifyCoaPhase` behavior.
  - Any change to `load-permits.js` or `load-coa.js` (Phase I.1 writers stay as shipped).
  - Push notification dispatch changes (Spec 92 — unrelated).
* **Deferred items** → `docs/reports/review_followups.md`:
  - **D1** (Gemini MED) — add `matched_rule` column to `lifecycle_status_history` ledger table for forensic value when drift correction lands. Requires new migration. Defer to Phase I.4 or similar.
  - **D2** (Gemini LOW) — add 'Notice Sent' (row 13 §2.5.a) to `REVIEW_P4_SET`. Explicit out-of-scope per drift policy.
  - **D3** (Observability MED) — extend `observe-chain.js` to ingest `emit_meta` grace flags into DeepSeek system prompt for real narrative suppression. Spec 48 protocol change; separate WF.
  - **D4** (DeepSeek MED) — blocking CQA gate (`throw`) on `permitUnmappedStatusCount > threshold`. Defer pending operator preference (Phase I.2 or .3).
  - **D5** (Gemini MED) — clarify `permit_phase_transitions` vs `lifecycle_status_history` write paths in Spec 84 §3 prose. Documentation cleanup, separate WF.

---

> **PLAN LOCKED. Do you authorize this WF1 plan? (y/n)**
> §10 note: matchedStatus contract (raw normalized input status, ALWAYS) is the non-obvious compliance choice — codifies a stricter contract than the v1 draft's literal-override exception.
> DO NOT generate code. DO NOT run commands. TERMINATE RESPONSE.
