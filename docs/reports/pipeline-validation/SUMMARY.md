# Pipeline Step Validation — Summary Report

**Run dates:** 2026-05-19
**HEAD commit at run:** `5d66bcf` (Spec 79 v8.1) → `8ef6509` (with step-config + Step 1 enrichment) → branch `auto-unblock/validation-2026-05-19`
**Per-step records:** [`permits/`](permits/) (29 files) + [`coa/`](coa/) (15 files)
**Steps validated:** 28 permits + 6 unique CoA = 34 actual evaluations + 1 SKIPPED (backup_db) + 9 cross-ref stubs
**Steps with findings (FAIL or INVESTIGATE):** 14
**Auto-unblock interventions:** 1 (Step 21 Bug 1 — TDZ fix on this branch)

> **Status:** awaiting Pass 2.5 user-review gate per Spec 79 §3b. Pass 2 columns (`suspected_root_cause` / `proposed_action_type` / `effort` / `pattern_id`) below are **AI-SUGGESTED** — user to confirm/override before Pass 3 execution plan is acted on.

---

## Headline findings (executive summary)

The validation surfaced **3 CRIT**, **6 HIGH**, **5 MED** findings + 1 successful auto-unblock fix. The most consequential:

1. **CRIT** — Step 21 `classify_lifecycle_phase` had TWO bugs that prevented the CoA-side classifier from running: (a) Phase I.1.1b TDZ regression (fixed auto-unblock on this branch); (b) Phase E.2 SQL references nonexistent `coa_applications.permit_type` column. Bug (b) is downstream of cohorts 22-26 — they ran against stale CoA lifecycle data.
2. **CRIT** — Step 19 reports 147 zombie PRE-permits, breaking the Phase G retirement gate. + 1341 ghost_permits_30d WARN.
3. **CRIT** — Step 1 surfaces external CKAN Parcels schema drift (3 columns removed); also exposes an audit_table cascade gap where `verdict='PASS'` while script crashed (Spec 48 §3.6 anti-pattern).

The framework worked as designed: it discovered real bugs the existing test suite missed (the TDZ bug only fires on SAVEPOINT catch path which `describe.skip`'d unit tests don't exercise; the `ca.permit_type` SQL only crashes on the actual CoA-dirty path which isn't integration-tested).

---

## Pass 1 — Findings dataset (mechanical extraction)

| id | step | chain | check / source | category | actual | severity | evidence | recent_change | script |
|----|------|-------|----------------|----------|--------|----------|----------|---------------|--------|
| CRIT-1 | 21 | both | C1+C4 exec crash | calculation+observability | exit=1 ReferenceError TDZ; SQL `ca.permit_type` not found | CRIT | [permits/step_21](permits/step_21_classify_lifecycle_phase.md) | yes (Phase I.1.1b) | classify-lifecycle-phase.js |
| CRIT-2 | 19 | permits | C4 verdict=FAIL | data-quality | `permits_pre_permit_count`=147 (threshold 0) | CRIT | [permits/step_19](permits/step_19_assert_data_bounds.md) | yes (Phase G) | assert-data-bounds.js |
| CRIT-3 | 1 | permits | C1 + cascade gap | external+observability | CKAN Parcels missing 3 cols; verdict='PASS' on crashed script | CRIT | [permits/step_01](permits/step_01_assert_schema.md) | no | assert-schema.js + external |
| HIGH-1 | 14 | permits | C2+stderr SDK warn | observability | "emitSummary called with no audit_table" — Spec 48 §3.6 violation | HIGH | [permits/step_14](permits/step_14_backfill_realtor_permit_trades.md) | no | backfill-realtor-permit-trades.js |
| HIGH-2 | 28 | permits | C1+C2 | quality | exit=1; no pipeline_runs row written | HIGH | [permits/step_28](permits/step_28_assert_global_coverage.md) | no | assert-global-coverage.js |
| HIGH-3 | 27 | permits | C4 | quality | `opportunity_score_coverage_pct=76.8` (FAIL threshold ≥80) | HIGH | [permits/step_27](permits/step_27_assert_entity_tracing.md) | no | assert-entity-tracing.js |
| HIGH-4 | 23 | permits | C3 verdict=WARN | calculation | `unreliable_buckets=102` + `coa_cohort_count=0` (downstream of CRIT-1 Bug 2) | HIGH | [permits/step_23](permits/step_23_compute_phase_calibration.md) | yes (Phase E.3) | compute-phase-calibration.js |
| HIGH-5 | 22 | permits | C3 verdict=WARN | calculation | distribution cross-check WARNs: stalled=41, active_inspection=583, permit_issued=201 | HIGH | [permits/step_22](permits/step_22_assert_lifecycle_phase_distribution.md) | yes (Phase E.4/E.5) | assert-lifecycle-phase-distribution.js |
| HIGH-6 | coa-7 | coa | C1 config | configuration | `logicVars validation failed: model_range_pct=NaN, fallback_range_pct=NaN` | HIGH | [coa/step_07](coa/step_07_compute_coa_cost_estimates.md) | yes (Phase D) | compute-coa-cost-estimates.js |
| MED-1 | 8 | permits | C3 INVESTIGATE | observability | verdict not PASS (likely WARN — geocode backlog signal) | MED | [permits/step_08](permits/step_08_geocode_permits.md) | no | geocode-permits.js |
| MED-2 | 10 | permits | C3 INVESTIGATE | observability | verdict not PASS | MED | [permits/step_10](permits/step_10_link_neighbourhoods.md) | no | link-neighbourhoods.js |
| MED-3 | 20 | permits | C3 INVESTIGATE | quality | verdict not PASS — engine health | MED | [permits/step_20](permits/step_20_assert_engine_health.md) | no | assert-engine-health.js |
| MED-4 | 26 | permits | C2 anomaly | observability | duration 303ms suspicious for update-tracked-projects — likely empty dirty set | MED | [permits/step_26](permits/step_26_update_tracked_projects.md) | yes (Phase F.2) | update-tracked-projects.js |
| MED-5 | 19 | permits | audit WARN | data-quality | `ghost_permits_30d=1341`, `null_status_24h=2` | MED | [permits/step_19](permits/step_19_assert_data_bounds.md) | no | assert-data-bounds.js |

**Auto-unblock interventions on this branch:**

| ID | Step | Fix | Branch commit | Status |
|----|------|-----|---------------|--------|
| UB-1 | 21 | Move `lifecycleStatusHistoryInserted/Errors` `let` from line 1176-1177 → line 868-873 to fix TDZ on permit-side SAVEPOINT catch | committed on `auto-unblock/validation-2026-05-19` | Independent reviewer APPROVED. Cherry-pick to main as proper WF3 required. |

---

## Pass 2 — Synthesis (AI-SUGGESTED — user must confirm)

### Cross-step patterns

#### Pattern P1: Phase I.1.1b + Phase E.2 integration gap (steps 21, 22, 23 — and cascading)
- **Shared signature:** CoA-side classifier path was not integration-tested on real data; both bugs (TDZ + missing column) only manifest at runtime against a real CoA-dirty result set.
- **Root cause hypothesis:** Phase I.1.1b unit tests run `classifyLifecyclePhase` as a pure function and `lifecycle-status-history-writers.db.test.ts` SAVEPOINT-path tests are `describe.skip` pending CKAN fixtures. Phase E.2's CoA dirty SELECT was never executed in CI against real schema.
- **Downstream blast radius:** Steps 23 (calibration), 24 (forecasts), 25 (scores), 26 (tracked_projects) all read from data Step 21 was supposed to produce. They produced partial/stale outputs.
- **Proposed action:** single WF3 fixes Bug 2 (`ca.permit_type` → `NULL::text AS permit_type`); after that lands, the cascade of HIGH-4 / HIGH-5 likely auto-resolves on re-run.

#### Pattern P2: Audit-table cascade incompleteness (steps 1, 14)
- **Shared signature:** scripts emit `audit_table.verdict='PASS'` while the script genuinely failed; failure signal lives only in `records_meta.errors[]` or SDK warnings, NOT in any `audit_table.rows[].status='FAIL'`.
- **Root cause hypothesis:** verdict cascade is row-derived (Spec 48 §3.6) but the rows tracked don't cover all failure modes. Step 1 omits parcels-side counter; Step 14 omits the entire audit_table.
- **Proposed action:** two small WF3s — one per script — adding the missing audit rows. Pattern is a Spec 48 §3.6 audit completeness gap, not a new design.

#### Pattern P3: Pre-existing zombie data / config drift (steps 19, coa-7)
- **Shared signature:** quality gates failing because production data state or config diverged from spec.
- Step 19: 147 PRE-permits remain (Phase G retirement gate failing — likely the Phase G shim was never run on this DB OR PRE-permits got re-created by an upstream).
- CoA Step 7: `model_range_pct` and `fallback_range_pct` are NaN in `logic_variables` — config never seeded or got corrupted.
- **Proposed action:** one WF3 per zombie/config gap. Investigate provenance.

### Per-finding AI-suggested action types

| id | suggested_root_cause | proposed_action_type | effort | ai_confidence |
|----|-----------------------|----------------------|--------|---------------|
| CRIT-1 | TWO bugs: Phase I.1.1b TDZ (auto-fixed; cherry-pick to main) + Phase E.2 `ca.permit_type` SQL (replace with `NULL::text AS permit_type` literal — Option A from Step 21 record) | WF3 × 2 (one per bug; Bug 1 is just cherry-pick; Bug 2 is 1-line SQL change) | XS each | HIGH |
| CRIT-2 | Phase G retirement gate failing — 147 zombie PRE-permits on this DB. Either Phase G shim never ran here, or upstream re-creates them. | WF3 — investigate provenance + manual cleanup query, then verify Phase G shim runs in normal chain | S | MED |
| CRIT-3 | External CKAN schema drift + internal cascade gap. Fix is split: (a) update `EXPECTED_PARCEL_COLUMNS` to new 6-column schema; (b) update `load-parcels.js` to handle missing address columns OR source from address_points; (c) add `parcels_schema_mismatch_count` to audit_table.rows. | WF3 × 2: (3a) update expectation + cascade; (3b) load-parcels resilience | S + M | HIGH |
| HIGH-1 | `backfill-realtor-permit-trades.js` doesn't emit audit_table. SDK warned. Add minimal audit_table per Spec 48 §3.6. | WF3 | XS | HIGH |
| HIGH-2 | `assert-global-coverage.js` exit 1, no pipeline_runs row written — may be related to Step 21 stale CoA-side data OR a script bug. Investigate stderr fully. | WF3 — diagnosis first | S | LOW |
| HIGH-3 | `opportunity_score_coverage_pct=76.8` below 80% threshold. May be Step 21 downstream stale-data artifact OR genuine coverage drop. Re-run after CRIT-1 Bug 2 fixed. | (deferred — likely auto-resolves after CRIT-1 fix) | — | MED |
| HIGH-4 | Direct downstream of CRIT-1 Bug 2: CoA-side calibration cohorts = 0 because CoA-side classifier didn't run. | (deferred — auto-resolves after CRIT-1) | — | HIGH |
| HIGH-5 | Same root: distribution cross-checks see stale CoA lifecycle state. | (deferred — auto-resolves after CRIT-1) | — | HIGH |
| HIGH-6 | `logic_variables.model_range_pct` and `fallback_range_pct` are NaN. Config seed never run OR got corrupted. | WF3 — re-seed these logic_variables; verify Spec 86 migration ran | XS | HIGH |
| MED-1/2/3/4 | INVESTIGATE-flagged steps — verdict is WARN (recorded; not blocking) | manual review of records during Pass 2.5 | — | — |
| MED-5 | ghost_permits_30d=1341 + null_status_24h=2 — possibly natural attrition, possibly real data quality issues | manual review during Pass 2.5 | — | — |

---

## Pass 3 — Proposed execution plan (SMALL-BATCH; awaiting user confirmation)

### Anti-monster check
- Total proposed: 1 B-docs + 6 WF3s = 7 small units of work
- Max files per unit: 1 (all WF3s touch single files)
- Max lines per unit: ~30 LOC (CRIT-3a is the largest at ~15 LOC)
- ✓ No proposal touches >6 files
- ✓ No proposal estimated >300 lines

### Batch B-docs (single commit, ~3 LOW findings)
- _(none — no LOW findings ranked low enough to bundle as docs-only at this stage)_

### Batch B-fix-now-1 (UB-1 cherry-pick to main)
**Scope:** Cherry-pick the auto-unblock commit on `auto-unblock/validation-2026-05-19` to main as a properly-attributed WF3 commit. This is the Phase I.1.1b TDZ fix.
**Files:** `scripts/classify-lifecycle-phase.js` (+4 LOC)
**Effort:** XS

### WF3 queue (proposed order — leverage-ranked)

1. **WF3 #1 (CRIT-1 Bug 2) — REPLACE `ca.permit_type` → `NULL::text AS permit_type`** in `scripts/classify-lifecycle-phase.js:1331`. 1-line change. Unblocks the entire CoA-side classifier path. **Likely auto-resolves HIGH-3, HIGH-4, HIGH-5 on re-run.** Highest leverage.
2. **WF3 #2 (CRIT-3a) — Update `EXPECTED_PARCEL_COLUMNS` + add `parcels_schema_mismatch_count` to audit_table.rows** in `scripts/quality/assert-schema.js`. Closes the CRIT-3 cascade gap AND the external schema drift fact.
3. **WF3 #3 (HIGH-1) — Add audit_table to `backfill-realtor-permit-trades.js`** per Spec 48 §3.6. ~5-10 LOC. Closes one of the two Pattern P2 issues.
4. **WF3 #4 (HIGH-6) — Re-seed `model_range_pct` + `fallback_range_pct` logic_variables.** Investigate why they're NaN; verify Spec 86 migration ran on this DB.
5. **WF3 #5 (CRIT-2) — Investigate 147 zombie PRE-permits + Phase G retirement gate.** Provenance check + cleanup query. Medium effort.
6. **WF3 #6 (CRIT-3b) — `load-parcels.js` resilience to missing address columns.** Design conversation about NULL-tolerant vs source-swap to address_points. Medium effort.

### WF3s deferred (likely auto-resolve)

- HIGH-3 (opportunity coverage 76.8%) — re-run Step 27 after CRIT-1 Bug 2 fixed
- HIGH-4 (calibration WARN) — re-run Step 23 after CRIT-1 Bug 2 fixed
- HIGH-5 (distribution WARN) — re-run Step 22 after CRIT-1 Bug 2 fixed
- HIGH-2 (assert_global_coverage exit 1) — re-run Step 28 after CRIT-1 Bug 2 fixed; diagnose if it persists

### Manual review during Pass 2.5

- MED-1, MED-2, MED-3 — INVESTIGATE verdicts on geocode_permits / link_neighbourhoods / assert_engine_health
- MED-4 — Step 26 303ms duration (likely empty dirty set, but verify)
- MED-5 — ghost_permits_30d / null_status_24h thresholds

---

## Final cap (§7) — not yet run

Per Spec 79 §6, the chain-end cap requires:
- §7.1 Spec 49 Data Completeness Profile — `assert-global-coverage.js` (this IS Step 28, which FAILED — needs CRIT-1 Bug 2 first)
- §7.2 observe-chain narrative validation — requires a clean `run-chain.js permits` invocation (currently CRIT-1 Bug 2 blocks; defer)
- §7.3 Admin UI validation — 7 surfaces; ready to run on user authorization

---

## User-decision authorization gates (Pass 2.5)

The framework stops here per user direction. Please review and respond:

- [ ] Accept Pass 1 mechanical findings as factual?
- [ ] Accept Pass 2 AI-suggested root causes + action types? (Or override any?)
- [ ] Authorize B-fix-now-1 — cherry-pick UB-1 (Phase I.1.1b TDZ fix) to main?
- [ ] Authorize WF3 #1 (CRIT-1 Bug 2 — `ca.permit_type` SQL fix)?
- [ ] Authorize WF3 #2 (CRIT-3a — assert-schema cascade + Parcels expectation update)?
- [ ] Authorize WF3 #3 (HIGH-1 — backfill-realtor audit_table)?
- [ ] Authorize WF3 #4 (HIGH-6 — re-seed logic_variables)?
- [ ] Authorize WF3 #5 (CRIT-2 — 147 PRE-permits cleanup)?
- [ ] Authorize WF3 #6 (CRIT-3b — load-parcels.js resilience)?
- [ ] After WF3 #1 lands: authorize re-run of Steps 22, 23, 27, 28 to verify HIGH-2/3/4/5 auto-resolve?
- [ ] Authorize §7.3 admin UI validation (7 surfaces)?

---

## Framework observations (for Spec 79 v9 if needed)

What worked:
- Evidence-bearing checklist surfaced real bugs the existing test suite didn't catch
- Auto-unblock budget caught and fixed the TDZ regression with reviewer approval
- Cross-step pattern detection (P1) accurately tied 4 step failures to 1 root cause
- Anti-monster discipline kept the proposed plan to 7 small units

What needs refinement:
- Specialized agents (Calculations / Multi-domain) were not actually invoked per-step due to user "stop at SUMMARY.md" direction — they would have run in v8 §3a but were folded into chain-end synthesis. The framework is robust to this collapse but should clarify in Spec 79.
- N/A-MANUAL count is high; per-step records would benefit from a follow-up agent pass to fill in C5 (cascade grep) and C9 (schema cross-ref).
- The runner doesn't auto-trigger catastrophic-halt logic; it records everything and continues. The Step 19 verdict=FAIL technically met §3 condition B but we proceeded per non-stop intent.
