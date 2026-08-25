# Active Task: WF1 #lifecycle-phase-engine-migration-F.1 — `compute-trade-forecasts.js` CoA UNION extension + `trade_forecasts` PK swap

**Status:** Complete (2026-05-16; TDD Red→Green, diff-stage 4-reviewer round zero CRIT, 4 HIGH + 2 MED folded inline #158-#163, 13 deferrals #164-#176 filed; `npm run verify` 6067/6067 tests pass; Self-Checklist 30/30 PASS; runbook authored; spec amendments applied; system-map regenerated; WF6 commit).
**Workflow:** WF1 (script extension + schema migration)
**Domain Mode:** Backend/Pipeline
**Rollback Anchor:** `2aba8226` (Phase E.5 close-out)
**Parent WF:** Phase F — Forecast / opportunity / CRM CoA extensions (Spec 42 §6.11)
**Sub-deliverable position:** **F.1 (this task)** → F.2 (`update-tracked-projects.js` CoA branch) → F.3 (`compute-opportunity-scores.js` CoA consumer) → F.4 (Lead Inspector CoA panel — Spec 76 §3.5 UI)
**Adversarial review:** USER-MANDATED — 4 reviewers at BOTH plan + diff stages.
**Standards adherence:** `00_engineering_standards.md` §2/§3/§6/§9; Spec 47 §R1-R12 + §11 Counter Semantic Contract; Spec 48 §3.1/§3.2/§3.5; Spec 84 §3 + §7; Spec 85 §3; TDD cadence per WF1 — failed-test-first per user mandate.

---

## v3 → v4 Revision Summary

v3 4-reviewer round confirmed all v3 implementation folds (CRIT-A through NIT-O) clean in code. 14 new v3 findings — 1 FALSE POSITIVE, 13 real folds applied in v4. Trajectory matches Phase E.5 terminal pattern (v4 PLAN LOCK directly per user authorization). No v4 reviewer round.

**CRITICAL (3 real + 1 FP):**
- **CRIT-v4-A — Spec 85 §3 amendment text drift** (Gemini CRIT + Independent HIGH + Observability MED — 3/4 convergent). Multiple stale references to v2's `snowplow_buffer_days × 4` survived in spec amendment text + missing new calibration_method values (`fallback_decision`, `fallback_hearing`, `fallback_first_seen`, `fallback_all_type_classes`, `fallback_all_project_types`, `fallback_all_cohorts`) + obsolete `skipped_terminal_orphan` reference. **v4 Part 4:** complete rewrite of Spec 85 §3 amendment to match v3 implementation.
- **CRIT-v4-B — Inline `inQuietPeriod` `await pool.query` violates Spec 47 §3.5** (Observability CRIT + Independent HIGH + Gemini MED — 3/4 convergent). v3 issued a second DB query at audit-row construction time, AFTER UPSERTs commit but BEFORE `emitSummary`. If that query crashed, the script would throw before emit. **v4 Part 2.4:** consolidate both 7-day + 30-day queries into a SINGLE startup query that runs alongside the existing gate query.
- **CRIT-v4-C — Infra test #9 still uses hyphen** (Independent HIGH 95 + Observability HIGH 80 — 2/4 convergent). v3 corrected the code constant to underscore but left the test description with the old hyphen — test would assert wrong literal at Red Light. **v4 Part 3:** change test #9 description to underscore.
- **CRIT-v4-FP — Mig 151 missing `SET NOT NULL` on `lead_id`** (DeepSeek HIGH 95). **FALSE POSITIVE.** Verified via `\d trade_forecasts`: `lead_id | text | not null` — mig 139 (Phase C) already promoted lead_id to NOT NULL. `ADD PRIMARY KEY USING INDEX` succeeds without an additional `SET NOT NULL`. Documented for trajectory record; no fold.

**HIGH (4):**
- **HIGH-v4-E — Mig 151 DOWN block brittleness** (Gemini HIGH). The commented-out DOWN had non-idempotent `CREATE UNIQUE INDEX` (would fail if index exists) + DELETE after structural changes (orphan risk if intermediate step fails). **v4 Part 1.A:** reorder DOWN — DELETE first, then `IF NOT EXISTS` on index creation, then PK swap restoration.
- **HIGH-v4-F — Boolean as audit row `value` violates Spec 48 §3.1** (Observability HIGH 92). `coa_anchor_fallback_pct_quiet_period.value = inQuietPeriod` (JS boolean). Spec 48 §3.1 expects numeric or string scalar; Observer's anomaly detection math coerces boolean to NaN. **v4 Part 2.5:** change to `value: inQuietPeriod ? 1 : 0`.
- **HIGH-v4-G — `>= NOW() - INTERVAL '3 years'` filter could drop long-running OMB CoAs** (DeepSeek HIGH). A CoA in OMB appeal lasting >3 years would be silently excluded from forecast generation despite `lifecycle_group IN ('C1','C2','C3')` being non-terminal. **v4 Part 2.1:** REMOVE the 3-year time bound from CoA Branch B (lifecycle_group filter already gates active vs terminal; the original permits-side 3-year bound exists to prune ancient applications that never issued — different semantic from CoA appeal states). Also remove from stale-purge live_coa_forecasts CTE for consistency.
- **HIGH-v4-H — SOURCE_SQL Branch B LATERAL JOIN vs stale-purge CTE inconsistency** (Gemini HIGH). v3 used CTE in stale-purge but kept LATERAL in SOURCE_SQL. **v4 DEFER:** retain LATERAL in SOURCE_SQL with explanatory comment. SOURCE_SQL is `pipeline.streamQuery` (one execution); stale-purge is `client.query` inside transaction (one DELETE). The CTE benefit in stale-purge was eliminating N correlated subqueries within a DELETE; SOURCE_SQL has a single LATERAL JOIN per row read, which the planner handles via nested loop with index lookup (cheap on `(lead_id)` index). Performance profile is fundamentally different. Will validate at Green Light per v1 LATERAL JOIN perf DEFER (Gemini v1 HIGH).

**MEDIUM (4):**
- **MED-v4-I — `lead_id` pre-validation asymmetry** (Gemini MED + DeepSeek MED — convergent). v3 only validates `coa:` prefix. **v4 Part 2.6:** extend regex to validate both `^coa:.+$` AND `^permit:.+:.+$` (permit pattern: `permit:<num>:<rev>`). Populate single `failed_sample` array with both source types.
- **MED-v4-J — Gate query 7-day window cadence assumption** (DeepSeek MED). Hardcoded `INTERVAL '7 days'` assumes `compute_phase_calibration` runs ≥ weekly. **v4 Part 1.B + 2.4:** promote to NEW logic_variable `coa_gate_calibration_window_days` (default 7). Mig 152 INSERTs both keys (`coa_lifecycle_transition_stale_days = 180` + `coa_gate_calibration_window_days = 7`) in one migration file. Validate via Zod `.int().positive()`.
- **MED-v4-K — Logic test #7 description references `× 4`** (Independent MED). v3 left the test description with old wording. **v4 Part 3:** update to reference `coa_lifecycle_transition_stale_days`.
- **MED-v4-L — Runbook file missing from Execution Plan** (Observability MED). Risk Register #7 mandates `docs/runbook/F1_baseline_quiet_period.md` but no Execution Plan step authors it. **v4 Execution Plan + Self-Checklist:** add explicit runbook step + checklist item (x).

**LOW + NIT (2):**
- **LOW-v4-M — Permit-side stale-purge correlated subquery** (Gemini LOW). v3 refactored CoA branch to CTE but left permit branch with the original `NOT EXISTS` form. **DEFER:** F.2 or future hardening; preserving v1 behaviour for the permit path is intentional to minimize blast radius (proven query, lots of test coverage).
- **NIT-v4-N — Date cast inconsistency comment** (Gemini NIT). Add inline comment in SOURCE_SQL Branch B explaining `decision_date`/`hearing_date` are `DATE` (need explicit `AT TIME ZONE 'UTC'` cast) vs `first_seen_at` already `timestamptz`.

**Net v4 ships:** all 3 real CRITs + 3 of 4 HIGHs folded; 1 HIGH deferred (LATERAL JOIN consistency); 4 MEDs folded; 2 NIT/LOW deferred. Mig 152 EXPANDED to seed 2 keys instead of 1.

## v2 → v3 Revision Summary

v2 4-reviewer round confirmed 9-of-10 v1 CRIT/HIGH folds correctly applied (only CRIT 4 had a hyphen/underscore typo). New v2 surface: 4 CRIT + 5 HIGH + 4 MED + 5 NIT. **18 v3 folds:**

**CRITICAL (4):**
- **CRIT-v3-A — Gate pipeline name typo** (Independent CRIT, confidence 97). My v2 wrote `'permits:compute-phase-calibration'` (hyphen) but `pipeline_runs.pipeline` is `'permits:compute_phase_calibration'` (underscore — `run-chain.js:321` builds `${chainId}:${slug}` where slug = manifest key `compute_phase_calibration`). My v2 typo would silently skip CoA forecasts forever while audit reports healthy. **v3 Part 2.4:** corrected; added infra test asserting against manifest key.
- **CRIT-v3-B — Gate query no time-bound** (Observability CRIT, confidence 88). v2 gate query reads "most recent regardless of age." A broken `compute_phase_calibration` cron stops writing rows, but the gate still finds an older `'PASS'` row and opens the CoA branch with stale calibration. **v3 Part 2.4:** add `AND started_at >= NOW() - INTERVAL '7 days'` (aligns with Spec 48 §3.4 baseline window).
- **CRIT-v3-C — Gate query ignores failed runs** (DeepSeek HIGH, confidence 80+). v2 filtered `AND status = 'completed'`. If the most-recent run actually failed (status='failed'), gate skips it and finds an older PASS row — masking upstream failure. **v3 Part 2.4:** drop `status='completed'` filter from WHERE; check status in JS; treat non-completed as `blocked_by_failed_run` WARN.
- **CRIT-v3-D — Snowplow `* 4` multiplier design** (Gemini MED + DeepSeek MED + Independent CRIT — 3/4 convergent on different facets). Independent flagged that v2's "configurable lookback" claim was false (the 4 is hardcoded). DeepSeek argued 4×28d=112d is too aggressive for lifecycle_transition anchors. Gemini called it a magic number with no justification. **v3 Part 2.2 + new logic_variable + new mig 152:** introduce `coa_lifecycle_transition_stale_days` (default 180 — 6 months per DeepSeek's "p75 of cohort" rationale) loaded via `loadMarketplaceConfigs`, validated via Zod `.int().positive()`. Replace `snowplow_buffer_days * 4` with this DB-driven value. Mig 152 NEW seeds the logic_variable.

**HIGH (5):**
- **HIGH-v3-E — CoA stale-purge correlated subquery perf + Branch B WHERE duplication** (Gemini HIGH + Independent HIGH — 2/4 convergent). v2 `NOT EXISTS (... (SELECT MAX(transitioned_at) FROM lifecycle_transitions WHERE lead_id = lt.lead_id) ...)` executes N times. Also: stale-purge WHERE clause duplicates Branch B SOURCE_SQL WHERE clause verbatim — maintenance hazard. **v3 Part 2.7:** refactor stale-purge to CTE-with-aggregation pattern (single MAX(transitioned_at) computation per lead_id via window function) + LEFT JOIN to find purge candidates. Add prominent `// CRITICAL: keep in sync with Branch B SOURCE_SQL` comments at both call sites. Add parity test that seeds purge-eligible + purge-ineligible CoAs.
- **HIGH-v3-F — Missing 4th fallback level in `lookupCoaCalibration`** (DeepSeek MED, confidence 80). v2's 3-level chain skips `('__ALL__', coaTypeClass, from_seq)` — a CoA with rare project_type but common coa_type_class falls through to all-cohorts default unnecessarily. **v3 Part 2.3:** add 4-level chain — exact → `(pt, '__ALL__', fs)` → `('__ALL__', tc, fs)` → `('__ALL__', '__ALL__', fs)` → default.
- **HIGH-v3-G — 8 new metrics no codified baseline-quiet-period** (Observability HIGH, confidence 83). Spec 48 §3.4 7-day baseline window means new metrics produce noisy comparisons for the first 7 days post-deploy. **v3 Risk Register #7 NEW:** codify operator pre-ack runbook with explicit `[F.1 baseline-quiet-period — Day X of 7]` annotation expectation for the first 7 days of Observer reports. List all 8+2 new metrics.
- **HIGH-v3-H — §11.4 cohort traceability** (Observability HIGH, confidence 82). v2 audit rows answer "how many CoAs were skipped" but not "what happened to N CoAs in phase P3". **v3 Part 2.5:** add `skipped_distribution_by_lifecycle_group` (Map<C1|C2|C3, {skipped_no_anchor, skipped_too_old, snowplow_applied, upserted}>) to `records_meta` — 2-line addition to JS aggregation.
- **HIGH-v3-I — `coa_anchor_fallback_pct` persistent expected-WARN** (Observability HIGH, confidence 84). v2's `≥95% WARN` threshold means status=WARN every day during E.2 ramp (30+ days). **v3 Part 2.5:** classify status as INFO during first-30-days quiet period (detect via `NOT EXISTS (SELECT 1 FROM pipeline_runs WHERE pipeline = 'permits:compute_trade_forecasts' AND started_at < NOW() - INTERVAL '30 days')`). After quiet period, threshold-based WARN at ≥95%. Add `coa_anchor_fallback_pct_quiet_period` boolean audit row for operator visibility.
- **HIGH-v3-J — `no_prior_run` INFO masks persistent absence** (Independent HIGH, confidence 85). Already partially covered by CRIT-v3-B (7-day window). **v3 Part 2.4+2.5:** when `gateRows.length === 0` AND the F.1 script has been running for >7 days, classify `no_prior_run` as WARN (broken cron detection); otherwise INFO (first-deploy grace).

**MEDIUM (4):**
- **MED-v3-K — `coa_skipped_count` retirement criterion** (Observability HIGH, confidence 85). v2 said "emit 0 indefinitely" with no concrete retirement. **v3 Part 2.5:** keep emitting `0` through F.2; codify F.2 close-out as the retirement gate. Add a follow-up ticket reference inline.
- **MED-v3-L — `coa_anchor_stale_lifecycle_transition_count` WARN threshold** (Observability MED, confidence 80). v2 set `threshold: null, status: INFO`. **v3 Part 2.5:** set `threshold: '< 50% of totalRowsCoa'`, status: WARN if `> 50%`. INFO otherwise. Risk Register annotates E.2-ramp expectation.
- **MED-v3-M — `failed_sample` for CoA FK failures** (Observability MED, confidence 81). v2 has no failed_sample population. **v3 Part 2.6:** add pre-validation step before INSERT — if `lead_id` fails `^coa:.+$` regex check, push to `failedSampleCoa` array (capped at 20 per Spec 48 §4); emit via `emitSummary({ failed_sample })`.
- **MED-v3-N — Stale-purge new slug baseline disruption** (Observability HIGH, confidence 86). Already absorbed into HIGH-v3-G (baseline-quiet-period list explicitly includes `stale_purged_permit` + `stale_purged_coa`).

**LOW + NIT (5):**
- **NIT-v3-O — `FORECAST_COL_COUNT = 14` constant** (DeepSeek NIT). v3 Part 2.6: extract to module-local const used in SQL template + params array.
- **LOW-v3-P — Log first few purged CoA lead_ids** (DeepSeek LOW). v3 Part 2.7: add `pipeline.log.info` listing first 5 purged `lead_id` values.
- **NIT-v3-Q — Pair stale counter with `snowplow_applied_coa`** (DeepSeek NIT). Already covered by HIGH-v3-H's `skipped_distribution_by_lifecycle_group` records_meta breakdown.
- **NIT-v3-R — Row-wise `DO UPDATE SET (cols) = (EXCLUDED.cols)` syntax** (Gemini NIT). **DEFER** — verbose form is the project pattern (existing script uses it; consistent with neighboring scripts). Not folded.
- **LOW-v3-S — Risk Register item for FK drop integrity** (Gemini LOW). v2 Risk Register #3 already covered this. No additional fold needed.

**REJECTED-from-v2 (kept):**
- DOWN block convention challenge (project Rule 6 — see v1→v2 summary).
- `NOW()` in UNION branches (transaction-stable in PostgreSQL).

**DEFERRED-from-v2 (kept):**
- LATERAL JOIN perf in Branch B (validate at Green Light against staging).

## v1 → v2 Revision Summary (preserved for trajectory record)

v1 plan-stage 4-reviewer round (Gemini + DeepSeek + Independent worktree + Observability worktree) surfaced 6 CRIT + 4 HIGH + 3 MED + 3 NIT findings. 2 REJECTED, 1 DEFERRED. The 16 real folds:

**CRITICAL (6):**
1. **Calibration lookup keying** (Gemini CRIT + DeepSeek HIGH + Independent CRIT — 3/4 convergent). v1 keyed `coaCalMap` on `to_seq`; correct semantic is `from_seq` (the phase being EXITED) matching the lead's current `lifecycle_seq`. Forecast asks "how long will I stay in my current phase before transitioning out?" — `from_seq` is the answer key. **v2 Part 2.3** rewritten.
2. **Stale-purge gap for CoA** (Independent CRIT). v1 stale-purge `NOT EXISTS` was keyed on `(permit_num, revision_num)` joining `permit_trades`; CoA rows post-mig 151 will have `permit_num = NULL` → `NULL = NULL` is UNKNOWN → CoA forecasts are permanent ghost rows. **v2 Part 2.7 NEW** adds a second DELETE branch for CoA-side stale-purge keyed on `(lead_id, trade_slug)` against `lead_trades JOIN coa_applications`.
3. **UPSERT `ON CONFLICT` target unupdated** (Independent CRIT). v1 left ON CONFLICT pointing at the legacy 3-column PK that mig 151 drops → runtime error. **v2 Part 2.6.A** explicitly shows the updated INSERT shape with `lead_id` in the column list and `ON CONFLICT (lead_id, trade_slug) DO UPDATE` target. Permit-side `lead_id` is already NOT NULL post-mig 139 (Phase C) — verified via `\d trade_forecasts`.
4. **Gate query `LIKE` too loose** (Observability CRIT + Gemini MED + DeepSeek MED — 3/4 convergent). `LIKE '%:compute-phase-calibration'` matches the permits-chain run AND the CoA-chain run; could open the gate on a permits-chain PASS while the CoA-chain run is WARN. **v2 Part 2.4** uses exact pipeline name `WHERE pipeline = 'permits:compute-phase-calibration'` — script runs in permits chain step 22 (Spec 85 §2), so the in-chain (just-executed) calibration row is the authoritative signal. Both chains write the same `phase_stay_calibration` content (script is idempotent + chain-agnostic), so the permits-chain reading is freshness-optimal.
5. **`coa_skipped_count` retire-vs-emit-0 self-contradiction** (Observability CRIT). v1 §2.5 table said "RETIRED" but Risk Register #5 said "emit 0 indefinitely." Inconsistent + observer-breaking. **v2 Part 2.5** keeps emitting `coa_skipped_count: 0` indefinitely (no retirement); language scrubbed from §2.5 table.
6. **`phase_calibration` vs `phase_stay_calibration` table conflation** (my plan miss surfaced via Independent's #1 walkthrough). The live `compute-trade-forecasts.js` reads from `phase_calibration` (permit-side 3-tuple table, 136 rows). E.3 wrote CoA 5-tuple cohorts to a DIFFERENT table `phase_stay_calibration` (164 rows, of which 0 CoA-side in this local DB — sparse Phase E.2 ramp state). **v2 Part 2.3** adds a SECOND query specifically against `phase_stay_calibration WHERE permit_type IS NULL` to build the CoA cohort map.

**HIGH (4):**
7. **`::date::timestamptz` casts timezone-dependent** (Gemini HIGH). v1 SOURCE_SQL used implicit-TZ casts; PG server TZ setting affects boundary dates. **v2 Part 2.1** uses `(col::timestamp AT TIME ZONE 'UTC')` form.
8. **§11.4 traceability — skip counters in records_meta vs audit_table.rows** (Observability HIGH). Spec 47 §11.4 mandates skip counts in named audit_table rows so they surface to `extractIssues()`. **v2 Part 2.5** moves `skipped_no_anchor_coa`, `skipped_too_old_coa`, `snowplow_applied_coa` into audit_table.rows (status INFO).
9. **`records_total` defense + #117 misattribution** (Observability HIGH + Independent HIGH). #117 is about `classify-lifecycle-phase.js`, NOT compute-trade-forecasts.js — false resolution claim removed. v2 explicitly defends `records_total = totalRowsPermit + totalRowsCoa` per Spec 85 §3 Inputs (both are primary forecast subjects feeding the unified output table). **v2 Part 2.6** rewritten.
10. **`coa_audit_gate_status` WARN cascade** (Observability HIGH). v1 set `status='WARN'` for every non-pass gate state — persistent daily WARN cascade. **v2 Part 2.5** reclassifies: `status='INFO'` for `'pass'` and `'no_prior_run'` (the latter is a startup-state expectation); `status='WARN'` only for actual failure states (`blocked_by_warn`, `blocked_by_fail`, `query_error`).

**MEDIUM (2):**
11. **Snowplow stale `lifecycle_transition` anchor** (DeepSeek MED). v1 excluded `lifecycle_transition` from snowplow on the assumption it's bounded-recent — but an E.2-classified CoA with no subsequent transition will have a months-old anchor that grace-cutoffs silently drop. **v2 Part 2.2** adds a freshness check: if `lifecycle_transition` anchor is older than `logicVars.snowplow_buffer_days × 4` (configurable lookback), treat as snowplow-eligible; add audit counter `coa_anchor_stale_lifecycle_transition_count`.
12. **`finalCalMethod` weak catch-all** (Gemini MED). v1 final `else` silently assigned `'fallback_first_seen'` regardless of `coaAnchorSource` value. **v2 Part 2.2** uses explicit `else if` chain + throws on unknown source (defensive — should be unreachable via `selectCoaAnchor` enum return).

**LOW + NIT (3):**
13. **`permit_type !== null` vs `!= null`** (DeepSeek LOW). `undefined` slips past `!== null`. **v2 Part 2.3** uses `if (row.permit_type != null)` to skip permit-side rows (covers both null and undefined).
14. **`selectCoaAnchor()` helper extraction** (DeepSeek NIT + Independent HIGH — convergent). v1 inlined anchor priority logic in the stream loop; logic-test references the function name. **v2 Part 2.2** extracts to module-local pure function consumed by both impl and tests.
15. **Gate catch explicit `coaGateActive = false`** (DeepSeek NIT). v2 Part 2.4 makes the fail-closed behaviour explicit in the catch block.

**REJECTED (2):**
- **Gemini CRIT — DOWN block convention challenge.** Comment-only DOWN is project Rule 6 / commit 8b1c10b convention used by 7 prior migrations (132/138/140/142/145/147/148/150). The rollback path (operator runs DOWN manually only on actual rollback) is documented in E.5 §3.4 and works in practice. Gemini's alternative (`DELETE FROM trade_forecasts WHERE permit_num IS NULL` + NOT VALID/VALIDATE) would itself be DESTRUCTIVE on a populated table and contradicts the established pattern. REJECT.
- **Gemini MED — `NOW()` in UNION branches race.** PostgreSQL `NOW()` is transaction-stable (returns transaction-start timestamp); both UNION SELECTs share the same xact via `pipeline.streamQuery`'s cursor. No race. REJECT.

**DEFERRED (1):**
- **Gemini HIGH — LATERAL JOIN perf time-bomb.** Real concern at scale. v2 retains LATERAL JOIN form for readability; will benchmark at Green Light against staging DB. If runtime regression > 2× baseline, will fold to CTE+window function pattern in a v3 hotfix.

---

## Context

### Goal
Enable `compute-trade-forecasts.js` to produce actionable CoA-stage `trade_forecasts` rows end-to-end via SOURCE_SQL UNION extension + `trade_forecasts` PK swap. Phase F.1 lights up the first CoA leads in the lead feed.

### Target Specs (required reading per CLAUDE.md WF1 protocol)
- `docs/specs/00_engineering_standards.md` §2/§3/§6/§9
- `docs/specs/01-pipeline/47_pipeline_script_protocol.md` §R1-R12, §4.1, §6.1, §6.2, §7.1/§7.3, §8.1/§8.2, §11 Counter Semantic Contract
- `docs/specs/01-pipeline/48_pipeline_observability.md` §3.1/§3.2/§3.4/§3.5/§4
- `docs/specs/01-pipeline/84_lifecycle_phase_engine.md` §3 + §7
- `docs/specs/01-pipeline/85_trade_forecast_engine.md` §3
- `docs/specs/01-pipeline/42_chain_coa.md` §6.6.B + §6.11

### Key Files
- **`scripts/compute-trade-forecasts.js`** (EXTEND — ~+200 lines: CoA UNION branch + selectCoaAnchor + lookupCoaCalibration + audit-verdict gate + CoA stale-purge branch + new audit rows + remove E.2 defensive guard + updated INSERT/ON CONFLICT)
- **`migrations/151_trade_forecasts_pk_swap_to_lead_id.sql`** (NEW)
- **`src/tests/migration-151-trade-forecasts-pk-swap.infra.test.ts`** (NEW — 8 tests)
- **`src/tests/compute-trade-forecasts.infra.test.ts`** (EXTEND — Phase F.1 describe block, ~16 tests; +4 from v1 to cover CoA stale-purge, ON CONFLICT target, gate exact-name match, AT TIME ZONE UTC casts)
- **`src/tests/compute-trade-forecasts.logic.test.ts`** (EXTEND — Phase F.1 describe block, ~7 tests; +2 for `aggregateCoaCohort` `from_seq` collapse + freshness-check snowplow eligibility)
- **`docs/specs/01-pipeline/85_trade_forecast_engine.md`** §3 (AMEND — CoA anchor priority chain corrected: column names match actual schema)
- **`docs/specs/01-pipeline/42_chain_coa.md`** §6.11 (AMEND — F.1 sub-deliverable row + `[F.1-COMMIT]` placeholder)
- **`docs/specs/01-pipeline/84_lifecycle_phase_engine.md`** §7 (AMEND — Phase F.1 consumer reference; emphasize **`from_seq`** is the lookup key)

### Operating Boundaries
**Target Files:** as listed above (1 script + 1 migration + 3 test files + 3 spec amendments).
**Out-of-Scope:** `scripts/update-tracked-projects.js` (F.2); `scripts/compute-opportunity-scores.js` (F.3); Lead Inspector UI (F.4 / Spec 76); `scripts/classify-lifecycle-phase.js` (follow-up #110 / Phase I); `scripts/lib/lifecycle-phase.js` (no shared-lib changes).
**Cross-Spec Dependencies:**
- **Relies on:** E.3 `phase_stay_calibration` CoA cohort writer (commit `9902860`); Phase C `lead_id` substrate + mig 139 UNIQUE INDEX `uniq_trade_forecasts_lead_id_trade`; Phase D `classify-coa-trades.js` `lead_trades` writes.
- **Consumed by:** F.2/F.3/F.4 + Spec 76 §3.5 UI (CoA-stage `trade_forecasts` reads).

---

## Technical Implementation

### Part 1.A — Migration 151 (PK swap, metadata-only)

```sql
-- migrations/151_trade_forecasts_pk_swap_to_lead_id.sql
-- SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.6.B Option C
-- SPEC LINK: docs/specs/01-pipeline/85_trade_forecast_engine.md §2 Database Schema
-- SPEC LINK: docs/specs/01-pipeline/84_lifecycle_phase_engine.md §6.11 Phase F.1

BEGIN;

-- 1. Drop FK (CoA forecasts have no matching permits row; stale-purge handles deletion — see Part 2.7)
ALTER TABLE trade_forecasts DROP CONSTRAINT IF EXISTS fk_forecasts_permit;

-- 2. Relax NOT NULL on legacy permit-side anchors (metadata-only — DROP NOT NULL doesn't scan)
ALTER TABLE trade_forecasts ALTER COLUMN permit_num DROP NOT NULL;
ALTER TABLE trade_forecasts ALTER COLUMN revision_num DROP NOT NULL;

-- 3. Drop legacy 3-column PK (the supporting UNIQUE INDEX on (lead_id, trade_slug) exists from mig 139)
ALTER TABLE trade_forecasts DROP CONSTRAINT IF EXISTS trade_forecasts_pkey;

-- 4. Promote existing UNIQUE INDEX to PRIMARY KEY (USING INDEX = metadata-only, no rewrite)
ALTER TABLE trade_forecasts
  ADD CONSTRAINT trade_forecasts_pkey
  PRIMARY KEY USING INDEX uniq_trade_forecasts_lead_id_trade;

COMMIT;

-- ============================================================================
-- DOWN — comment-only per Rule 6 / commit 8b1c10b (matches mig 132/138/140/142/145/147/148/150)
-- Operator runs manually only on rollback (see E.5 §3.4 rollback path).
-- v4 HIGH-E fold: reordered for idempotency safety:
--   (1) DESTRUCTIVE DELETE first (before any structural change — avoids orphan if mid-step crash)
--   (2) DROP constraint (current PK)
--   (3) Re-create index IF NOT EXISTS (idempotent — survives partial UP failures)
--   (4) Promote old PK shape via USING INDEX (mirror of UP's pattern)
--   (5) Re-add NOT NULL + FK
-- ============================================================================
-- BEGIN;
--   -- (1) Remove any CoA-side rows produced post-F.1 — required before re-adding NOT NULL.
--   --     DESTRUCTIVE: there is no way to preserve CoA forecast rows under the old 3-col PK
--   --     because they have no permits FK target.
--   DELETE FROM trade_forecasts WHERE permit_num IS NULL OR revision_num IS NULL;
--
--   -- (2) Drop the current (lead_id, trade_slug) PK constraint.
--   ALTER TABLE trade_forecasts DROP CONSTRAINT IF EXISTS trade_forecasts_pkey;
--
--   -- (3) Re-create the legacy unique index used as the OLD PK's supporting index.
--   --     Idempotent: IF NOT EXISTS survives a partial DOWN that already restored it.
--   CREATE UNIQUE INDEX IF NOT EXISTS trade_forecasts_legacy_3col_uniq
--     ON trade_forecasts (permit_num, revision_num, trade_slug);
--
--   -- (4) Promote that index back to PRIMARY KEY (matches the original schema shape).
--   ALTER TABLE trade_forecasts
--     ADD CONSTRAINT trade_forecasts_pkey
--     PRIMARY KEY USING INDEX trade_forecasts_legacy_3col_uniq;
--
--   -- (5) Re-promote permit_num + revision_num to NOT NULL + re-add the FK.
--   ALTER TABLE trade_forecasts ALTER COLUMN permit_num SET NOT NULL;
--   ALTER TABLE trade_forecasts ALTER COLUMN revision_num SET NOT NULL;
--   ALTER TABLE trade_forecasts ADD CONSTRAINT fk_forecasts_permit
--     FOREIGN KEY (permit_num, revision_num) REFERENCES permits(permit_num, revision_num) ON DELETE CASCADE;
-- COMMIT;
```

**Pre-flight verification (operator runs against staging before merge):**
```sql
-- 1. Confirm no pre-existing duplicate on (lead_id, trade_slug) — the new PK target
SELECT lead_id, trade_slug, COUNT(*) FROM trade_forecasts GROUP BY 1, 2 HAVING COUNT(*) > 1;
-- Expected: 0 rows (uniq_trade_forecasts_lead_id_trade already enforces this)

-- 2. Confirm no CoA rows currently exist (E.2 defensive skip guard should hold)
SELECT COUNT(*) FROM trade_forecasts WHERE lead_id LIKE 'coa:%';
-- Expected: 0 rows

-- 3. Confirm all existing rows have NOT NULL lead_id (mig 139 made it NOT NULL UNIQUE — invariant)
SELECT COUNT(*) FROM trade_forecasts WHERE lead_id IS NULL;
-- Expected: 0 rows
```

### Part 1.B — Migration 152 (NEW logic_variable for snowplow staleness, v3 CRIT-D fold)

```sql
-- migrations/152_coa_lifecycle_transition_stale_days.sql
-- SPEC LINK: docs/specs/01-pipeline/85_trade_forecast_engine.md §3 (CoA-stage Anchor priority)
-- SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §4.1 (operator-tunable values in DB)

-- v4 MED-J fold: mig 152 seeds TWO keys (coa_lifecycle_transition_stale_days +
-- coa_gate_calibration_window_days) in a single migration.
INSERT INTO logic_variables (variable_key, variable_value, description)
VALUES
  ('coa_lifecycle_transition_stale_days', 180,
   'CoA forecast snowplow staleness gate: if lifecycle_transitions.MAX(transitioned_at) anchor is older than this many days, the CoA forecast becomes snowplow-eligible (treats long-stalled E.2-classified CoAs without subsequent transitions as Rescue Missions). Default 180 = 6 months ≈ p75 of typical CoA decision cohort duration per Spec 84 §7.'),
  ('coa_gate_calibration_window_days', 7,
   'CoA audit-verdict gate freshness window: compute_phase_calibration must have a permits-chain pipeline_runs row within this many days for the gate to consult its verdict. Older runs trigger no_prior_run state. Default 7 aligns with Spec 48 §3.4 baseline window. Operator may raise this if calibration runs are less frequent than weekly.')
ON CONFLICT (variable_key) DO NOTHING;

-- ============================================================================
-- DOWN — comment-only per Rule 6 (matches mig 132/138/140/142/145/147/148/150/151 convention)
-- ============================================================================
-- DELETE FROM logic_variables WHERE variable_key IN (
--   'coa_lifecycle_transition_stale_days',
--   'coa_gate_calibration_window_days'
-- );
```

`scripts/seeds/logic_variables.json` gains the same entry (per `control-panel.logic.test.ts` parity test).

### Part 2 — Script extension

#### 2.1 SOURCE_SQL UNION (with timezone-explicit casts per Gemini HIGH 7)

```javascript
const SOURCE_SQL = `
  -- Branch A: permit-side (existing — preserved exactly)
  WITH last_passed AS (
    SELECT permit_num, MAX(inspection_date)::timestamptz AS last_passed_inspection_date
      FROM permit_inspections
     WHERE status = 'Passed'
     GROUP BY permit_num
  )
  SELECT p.permit_num, p.revision_num, p.lead_id, t.slug AS trade_slug,
         p.lifecycle_phase, p.phase_started_at, p.permit_type,
         NULL::text AS project_type, NULL::text AS coa_type_class,
         NULL::int  AS lifecycle_seq,  NULL::text AS lifecycle_group,
         p.lifecycle_stalled, p.issued_date, p.application_date,
         NULL::date AS decision_date, NULL::date AS hearing_date,
         NULL::timestamptz AS first_seen_at,
         lp.last_passed_inspection_date
    FROM permit_trades pt
    JOIN trades t ON t.id = pt.trade_id
    JOIN permits p ON p.permit_num = pt.permit_num
                  AND p.revision_num = pt.revision_num
    LEFT JOIN last_passed lp ON lp.permit_num = p.permit_num
   WHERE pt.is_active = true
     AND p.lifecycle_phase IS NOT NULL
     AND p.lifecycle_stalled = false
     AND (
       (p.lifecycle_phase IN ('P1','P2')
        AND p.application_date IS NOT NULL
        AND p.application_date >= NOW() - INTERVAL '18 months')
       OR
       (p.lifecycle_phase NOT IN ${SKIP_PHASES_SQL}
        AND p.lifecycle_phase NOT IN ('P1','P2')
        AND COALESCE(p.phase_started_at, p.issued_date::timestamptz) >= NOW() - INTERVAL '3 years')
     )

  UNION ALL

  -- Branch B: CoA-side (NEW in F.1)
  -- LATERAL JOIN value 'phase_started_at' is a derived alias matching the permit-side column
  -- semantically (most-recent phase transition timestamp); coa_applications has no real
  -- phase_started_at column. Comment surfaces in script source.
  SELECT NULL::varchar(30) AS permit_num,
         NULL::varchar(10) AS revision_num,
         lt.lead_id, t.slug AS trade_slug,
         ca.lifecycle_phase,
         latest_trans.phase_started_at,
         NULL::text AS permit_type,
         ca.project_type, ca.coa_type_class,
         ca.lifecycle_seq, ca.lifecycle_group,
         ca.lifecycle_stalled,
         NULL::date AS issued_date,
         NULL::date AS application_date,
         ca.decision_date, ca.hearing_date,
         ca.first_seen_at,
         NULL::timestamptz AS last_passed_inspection_date
    FROM lead_trades lt
    JOIN trades t ON t.id = lt.trade_id
    JOIN coa_applications ca ON ca.lead_id = lt.lead_id
    LEFT JOIN LATERAL (
      SELECT MAX(transitioned_at) AS phase_started_at
        FROM lifecycle_transitions
       WHERE lead_id = lt.lead_id
    ) latest_trans ON true
   WHERE lt.is_active = true
     AND lt.lead_id LIKE 'coa:%'
     AND ca.lifecycle_phase IS NOT NULL
     AND ca.lifecycle_stalled = false
     AND ca.lifecycle_group IN ('C1','C2','C3')
     -- v4 NIT-N comment: decision_date + hearing_date are DATE columns (no TZ);
     -- explicit `AT TIME ZONE 'UTC'` cast forces canonical interpretation. phase_started_at
     -- and first_seen_at are already timestamptz so they bypass the cast.
     -- v4 HIGH-G fold: 3-year time bound REMOVED. lifecycle_group filter already gates active
     -- (C1/C2/C3) vs terminal (C4); long-running OMB appeals (>3 years) must still produce
     -- forecasts. Permits-side 3-year bound exists because old ungated permit_type='permit'
     -- applications never issued can accumulate; CoA doesn't have that pathology.
     AND COALESCE(
           latest_trans.phase_started_at,
           (ca.decision_date::timestamp AT TIME ZONE 'UTC'),
           (ca.hearing_date::timestamp  AT TIME ZONE 'UTC'),
           ca.first_seen_at
         ) IS NOT NULL
`;
```

#### 2.2 CoA branch in JS stream loop — extracted helpers + freshness gate

```javascript
// Module-local pure helper — extracted for testability (v2 NIT 14 fold)
function selectCoaAnchor(row) {
  if (row.phase_started_at)  return { date: row.phase_started_at,                     source: 'lifecycle_transition' };
  if (row.decision_date)     return { date: new Date(row.decision_date  + 'T00:00:00Z'), source: 'decision_date' };
  if (row.hearing_date)      return { date: new Date(row.hearing_date   + 'T00:00:00Z'), source: 'hearing_date' };
  if (row.first_seen_at)     return { date: row.first_seen_at,                        source: 'first_seen_at' };
  return null;                                                                       // caller increments skippedNoAnchorCoa
}

// Inside stream loop, after the existing `isCoaRow = row.lead_id?.startsWith('coa:')` dispatch:
if (isCoaRow) {
  totalRowsCoa++;
  if (!coaGateActive) {
    coaSkippedAuditBlocked++;
    continue;
  }

  const anchor = selectCoaAnchor(row);
  if (!anchor) { skippedNoAnchorCoa++; continue; }
  const { date: effectiveAnchor, source: coaAnchorSource } = anchor;

  // 5-tuple cohort lookup (from §2.3 — keys on from_seq matching lifecycle_seq)
  const cal = lookupCoaCalibration(row.project_type, row.coa_type_class, row.lifecycle_seq);

  // CoA bimodal simplification: target_window = 'bid' ALWAYS (Spec 85 §3 CoA-stage routing)
  const targetWindow = 'bid';

  const anchorDate = new Date(effectiveAnchor);
  if (isNaN(anchorDate.getTime())) { skippedNoAnchorCoa++; continue; }
  anchorDate.setUTCHours(0, 0, 0, 0);
  let predictedStart = new Date(anchorDate);
  predictedStart.setUTCDate(predictedStart.getUTCDate() + cal.median);

  // Snowplow eligibility — v3 CRIT-D fold: lifecycle_transition CAN be stale during E.2 ramp.
  // Threshold is DB-driven via logic_variables.coa_lifecycle_transition_stale_days (default 180 days
  // = 6 months ≈ p75 of typical CoA decision cohort per Spec 84 §7). Operator-tunable per Spec 47
  // §4.1; validated via Zod schema below. The v2 hardcoded `snowplow_buffer_days * 4` was an
  // unjustified magic number (Gemini MED + DeepSeek MED + Independent CRIT, 3/4 convergent).
  const anchorAgeDays = (new Date(runAt).getTime() - anchorDate.getTime()) / (24 * 60 * 60 * 1000);
  const lifecycleTransitionStale =
        coaAnchorSource === 'lifecycle_transition'
        && anchorAgeDays > logicVars.coa_lifecycle_transition_stale_days;
  if (lifecycleTransitionStale) coaAnchorStaleLifecycleTransitionCount++;

  const snowplowEligible =
        coaAnchorSource === 'first_seen_at'
        || lifecycleTransitionStale;

  const isPast = predictedStart.getTime() < new Date(runAt).getTime();
  if (snowplowEligible && isPast) {
    predictedStart = new Date(today);
    predictedStart.setUTCDate(predictedStart.getUTCDate() + logicVars.snowplow_buffer_days);
    snowplowAppliedCoa++;
  }

  if (predictedStart.getTime() < graceCutoffMs) { skippedTooOldCoa++; continue; }

  const daysUntil = Math.floor((predictedStart.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  const urgency = classifyUrgency(
    daysUntil,
    /* isPastTarget */ false,                              // CoA never sets isPastTarget (target_window='bid' only)
    logicVars.expired_threshold_days,
    tradeConfigs[row.trade_slug]?.imminent_window_days ?? 14,
    logicVars.urgency_overdue_days,
    logicVars.urgency_upcoming_days,
  );
  const confidence = classifyConfidence(cal.sample, cal.method === 'default');

  // v2 MED 12 fold: explicit enum cases + defensive throw on unknown (should be unreachable)
  let finalCalMethod;
  switch (coaAnchorSource) {
    case 'lifecycle_transition': finalCalMethod = cal.method; break;
    case 'decision_date':        finalCalMethod = 'fallback_decision'; break;
    case 'hearing_date':         finalCalMethod = 'fallback_hearing'; break;
    case 'first_seen_at':        finalCalMethod = 'fallback_first_seen'; break;
    default:
      throw new Error(`[trade-forecasts] selectCoaAnchor returned unknown source: ${coaAnchorSource}`);
  }

  coaAnchorSourceCounts[coaAnchorSource]++;
  if (coaAnchorSource !== 'lifecycle_transition') coaAnchorFallbackCount++;

  allForecasts.push({
    permit_num:    null,                       // CoA: nullable post-mig 151
    revision_num:  null,
    lead_id:       row.lead_id,
    trade_slug:    row.trade_slug,
    predicted_start: predictedStart.toISOString().slice(0, 10),
    confidence, urgency,
    target_window: targetWindow,
    calibration_method: finalCalMethod,
    sample_size: cal.sample,
    median_days: cal.median,
    p25_days:    cal.p25,
    p75_days:    cal.p75,
  });
  upsertedCoa++;
  continue;
}

// ── Permit branch: existing logic preserved EXACTLY (E.2 defensive coa:% skip guard REMOVED) ──
```

#### 2.3 CoA calibration: NEW separate query against `phase_stay_calibration` + `from_seq` keying

**v2 CRIT 1 + CRIT 6 combined fold.** The existing script's `pool.query('SELECT ... FROM phase_calibration')` (line ~187) feeds the permit-side `calMap` (3-tuple keyed on `(from_phase, to_phase, permit_type)`). For CoA, we read from the SEPARATE `phase_stay_calibration` table written by E.3 — filtered to `WHERE permit_type IS NULL` for CoA-side rows.

```javascript
// ─── Step 1.b — Load CoA cohort calibration (NEW in F.1) ──────────────────
// phase_stay_calibration is a DIFFERENT table from phase_calibration. E.3 writes CoA-side
// rows here keyed on the 5-tuple (NULL permit_type, project_type, coa_type_class, from_seq, to_seq).
// Forecast asks "how long will this lead stay in its current phase?" → key on from_seq matching
// the lead's lifecycle_seq. (Cohort row's from_seq = the phase being EXITED in the LAG window.)
// Multiple to_seq variants can exist for the same from_seq (a lead in phase X might go to Y or
// Z); v2 collapses on (project_type, coa_type_class, from_seq) keeping the row with maximum
// sample_size (most reliable cohort signal). to_seq is preserved in `audit_distribution` for
// observability but not used in lookup.
pipeline.log.info('[trade-forecasts]', 'Loading CoA cohort calibration from phase_stay_calibration...');
const { rows: coaCalRows } = await pool.query(
  `SELECT project_type, coa_type_class, from_seq, to_seq,
          median_days, p25_days, p75_days, sample_size
     FROM phase_stay_calibration
    WHERE permit_type IS NULL
      AND from_seq IS NOT NULL
      AND median_days IS NOT NULL`,
);

// Map<projectType, Map<coaTypeClass, Map<fromSeq, {median,p25,p75,sample,toSeqsObserved}>>>
const coaCalMap = new Map();
for (const row of coaCalRows) {
  if (row.permit_type != null) continue;                  // v2 LOW 13 fold: undef-safe (defensive — query already filters)
  const pt = row.project_type ?? '__ALL__';
  const tc = row.coa_type_class ?? '__ALL__';
  const fs = row.from_seq;                                // v2 CRIT 1 fold: key on from_seq, NOT to_seq

  if (!coaCalMap.has(pt)) coaCalMap.set(pt, new Map());
  const m2 = coaCalMap.get(pt);
  if (!m2.has(tc)) m2.set(tc, new Map());
  const existing = m2.get(tc).get(fs);

  // v2 CRIT 1 fold: aggregate across to_seq variants by keeping max-sample row (most reliable
  // signal for "median duration in from_seq"). The to_seq is recorded for observability.
  if (!existing || row.sample_size > existing.sample) {
    m2.get(tc).set(fs, {
      median:   row.median_days,
      p25:      row.p25_days,
      p75:      row.p75_days,
      sample:   row.sample_size,
      toSeq:    row.to_seq,                               // most-frequent to_seq for this (pt,tc,fs)
    });
  }
}
pipeline.log.info('[trade-forecasts]',
  `CoA cohort calibration loaded: ${coaCalRows.length} raw rows → ${[...coaCalMap.values()].reduce(
    (n, m1) => n + [...m1.values()].reduce((nn, m2) => nn + m2.size, 0), 0)} unique (pt,tc,from_seq) cohorts`);

// 3-level fallback (no ISSUED branch — that's a permit concept). Final fallback to defaults.
function lookupCoaCalibration(projectType, coaTypeClass, lifecycleSeq) {
  // Level 1: exact (project_type, coa_type_class, from_seq=lifecycleSeq)
  const l1 = coaCalMap.get(projectType)?.get(coaTypeClass)?.get(lifecycleSeq);
  if (l1) return { ...l1, method: 'exact' };

  // Level 2: (project_type, __ALL__ coa_type_class, from_seq) — collapse type-class dimension
  const l2 = coaCalMap.get(projectType)?.get('__ALL__')?.get(lifecycleSeq);
  if (l2) return { ...l2, method: 'fallback_all_type_classes' };

  // Level 3: (__ALL__ project_type, coa_type_class, from_seq) — v3 HIGH-F fold: missing level.
  // A CoA with rare project_type but common coa_type_class falls through to all-cohorts default
  // unnecessarily without this level. DeepSeek v2 MED, conf 80+.
  const l3 = coaCalMap.get('__ALL__')?.get(coaTypeClass)?.get(lifecycleSeq);
  if (l3) return { ...l3, method: 'fallback_all_project_types' };

  // Level 4: (__ALL__ project_type, __ALL__ coa_type_class, from_seq) — collapse both dimensions
  const l4 = coaCalMap.get('__ALL__')?.get('__ALL__')?.get(lifecycleSeq);
  if (l4) return { ...l4, method: 'fallback_all_cohorts' };

  // Level 5: default
  return { median: defaultMedianDays, p25: defaultP25Days, p75: defaultP75Days, sample: 0, method: 'default' };
}
```

**On `lifecycle_seq` semantic equivalence (resolves Independent CRIT 1 ambiguity):** `coa_applications.lifecycle_seq` is the ORDINAL of the phase the CoA is CURRENTLY in (set by `classify-lifecycle-phase.js` / E.2 from `mapToUniversalStream`). In LAG-window semantics, a CoA's last completed transition has `to_seq = current.lifecycle_seq` and `from_seq = previous_phase.seq`. The NEXT transition will have `from_seq = current.lifecycle_seq`. Therefore for "median time in current phase" the lookup key is `from_seq = lifecycle_seq` of the lead — the cohort whose `from_seq` matches measures stays in that exact phase.

**On `phase_stay_calibration` empty/sparse state:** Local DB has 0 CoA rows in `phase_stay_calibration` (E.2 ramp recent). Lookup falls through all 3 fallback levels to `default` (logicVars-driven), producing forecasts with `confidence='low'` per existing `classifyConfidence(0, true)`. Audit row `coa_anchor_fallback_pct` surfaces if all CoA rows hit `default` method — the gate that flags Phase E.2 incomplete state to operators.

#### 2.4 Audit-verdict gate (#131 — exact pipeline name, fail-closed)

**v2 CRIT 4 fold + NIT 15 fold:**

```javascript
let coaGateActive = false;
let coaGateStatus = 'unknown';
let coaGateLastRunId = null;
let coaGateLastVerdict = null;

// v3 CRIT-A fold (typo): pipeline column in pipeline_runs stores `${chainId}:${manifest_key}`
// where manifest_key uses UNDERSCORE per scripts/manifest.json. `run-chain.js:321` constructs
// the scoped slug as `${chainId}:${slug}` from the manifest key. The v2 hyphen ('compute-phase-
// calibration') would never match → permanent silent 'no_prior_run'. Use underscore.
//
// v3 CRIT-B fold (time-bound): add 7-day window per Spec 48 §3.4 baseline. If compute_phase_
// calibration cron breaks AND hasn't run in 7 days, gate flips to 'no_prior_run' (then HIGH-J
// classifies to WARN per the first-deploy grace gate below).
//
// v3 CRIT-C fold (failed-run handling): drop `status='completed'` filter from WHERE; inspect
// status in JS so a most-recent FAILED run is detected (instead of silently jumping over to
// an older PASS row).
const GATE_PIPELINE_NAME = 'permits:compute_phase_calibration';
// v4 MED-J fold: gate freshness window is operator-tunable (default 7 days from mig 152).
const gateWindowDays = logicVars.coa_gate_calibration_window_days;
try {
  const { rows: gateRows } = await pool.query(
    `SELECT id, status, started_at, records_meta->'audit_table'->>'verdict' AS verdict
       FROM pipeline_runs
      WHERE pipeline = $1
        AND started_at >= NOW() - ($2 || ' days')::interval
      ORDER BY started_at DESC
      LIMIT 1`,
    [GATE_PIPELINE_NAME, gateWindowDays.toString()],
  );
  if (gateRows.length === 0) {
    coaGateStatus = 'no_prior_run';                       // 7-day window: cold-start OR broken cron
  } else {
    coaGateLastRunId = gateRows[0].id;
    coaGateLastVerdict = gateRows[0].verdict;
    const lastStatus = gateRows[0].status;
    if (lastStatus !== 'completed') {
      // v3 CRIT-C fold: most-recent run actually failed; do not skip over to older PASS
      coaGateStatus = `blocked_by_failed_run_${lastStatus}`;
    } else if (coaGateLastVerdict === 'PASS') {
      coaGateActive = true;
      coaGateStatus = 'pass';
    } else {
      coaGateStatus = `blocked_by_${(coaGateLastVerdict || 'null').toLowerCase()}`;
    }
  }
} catch (err) {
  // v2 NIT 15 fold: explicit fail-closed in catch
  coaGateActive = false;
  coaGateStatus = 'query_error';
  pipeline.log.warn('[trade-forecasts]', 'audit-verdict gate query failed — CoA branch will be skipped',
    { error: err instanceof Error ? err.message : String(err) });
}

// v4 CRIT-B fold: pre-fetch BOTH the 7-day and 30-day windows in a single startup query
// (eliminates the inline `await pool.query(...)` from §2.5 audit-row construction that
// previously violated Spec 47 §3.5 emitSummary-before-throw — a crash there would have
// thrown after UPSERTs commit but before emit). One query is more efficient and atomic.
//
// v3 HIGH-J: coaFirstDeployGrace = TRUE if F.1 has NO pipeline_runs rows older than 7 days
// (cold-start). FALSE means it's been running ≥7 days; a `no_prior_run` gate state then
// indicates a broken-cron rather than first-deploy.
// v3 HIGH-I: inQuietPeriod = TRUE during first 30 days post-deploy. Used to suppress
// expected-WARN on coa_anchor_fallback_pct + coa_anchor_stale_lifecycle_transition_count.
const { rows: deployAgeRows } = await pool.query(
  `SELECT
     COUNT(*) FILTER (WHERE started_at < NOW() - INTERVAL '7 days')::int  AS prior_runs_7d,
     COUNT(*) FILTER (WHERE started_at < NOW() - INTERVAL '30 days')::int AS prior_runs_30d
   FROM pipeline_runs
   WHERE pipeline = 'permits:compute_trade_forecasts'`,
);
const coaFirstDeployGrace = deployAgeRows[0].prior_runs_7d === 0;
const inQuietPeriod        = deployAgeRows[0].prior_runs_30d === 0;
pipeline.log.info('[trade-forecasts]',
  `CoA audit-verdict gate: ${coaGateStatus} (last_run_id=${coaGateLastRunId}, last_verdict=${coaGateLastVerdict})`);
```

#### 2.5 audit_table.rows — full list with v2 fold corrections

Existing 13 rows preserved. v2 changes:

- **`coa_skipped_count`** — v2 CRIT 5 fold: KEEP emitting `0` indefinitely (`value: 0`, `status: 'INFO'`, `threshold: null`). The "RETIRED" language from v1 §2.5 is removed. Slug retirement deferred to a future cleanup commit only after 7 days of clean Observer baselines on the new slugs.

- **`coa_audit_gate_status`** — v3 HIGH-J fold: status classification revised with first-deploy grace.

  | gate status value | first-deploy grace? | audit row status | rationale |
  |---|---|---|---|
  | `'pass'` | — | `INFO` | Healthy steady state |
  | `'no_prior_run'` | yes (`coaFirstDeployGrace=true`) | `INFO` | Day 0–7 cold-start expected |
  | `'no_prior_run'` | no (`coaFirstDeployGrace=false`) | `WARN` | Broken cron — `compute_phase_calibration` hasn't run in 7 days but `compute_trade_forecasts` has been running for >7 days |
  | `'blocked_by_warn'` | — | `WARN` | Real upstream gate failure |
  | `'blocked_by_fail'` | — | `WARN` | Real upstream gate failure |
  | `'blocked_by_null'` | — | `WARN` | records_meta shape drift — investigate |
  | `'blocked_by_failed_run_*'` | — | `WARN` | v3 CRIT-C fold: most-recent calibration run actually failed |
  | `'query_error'` | — | `WARN` | Observability failure — investigate |

- **`coa_forecasts_computed`** — `value: upsertedCoa`, `threshold: null`, `status: INFO`. Spec 47 §11.2 Overflow (secondary entity sub-count).

- **`coa_skipped_audit_blocked`** — `value: coaSkippedAuditBlocked`, `threshold: null`, `status: INFO`.

- **`coa_anchor_fallback_pct`** — v3 HIGH-I fold + v4 CRIT-B fold (uses startup-prefetched `inQuietPeriod`).
  - `value: (coaAnchorFallbackCount / Math.max(totalRowsCoa, 1)) * 100`
  - `threshold: '< 95% post-quiet-period; INFO during 30-day quiet period'`
  - Status logic (no inline DB query — uses `inQuietPeriod` from startup pre-fetch):
    ```javascript
    const coaAnchorFallbackStatus = inQuietPeriod ? 'INFO' : (coaAnchorFallbackPct >= 95 ? 'WARN' : 'PASS');
    ```
  - During 30-day quiet period (E.2 ramp): INFO regardless of value (operator pre-ack expectation).
  - Post-quiet-period: WARN if `≥ 95%` (lifecycle_transitions writer is unhealthy). FAIL classification removed entirely.
  - Companion audit row `coa_anchor_fallback_pct_quiet_period` — v4 HIGH-F fold: `value: inQuietPeriod ? 1 : 0` (numeric, NOT boolean — Spec 48 §3.1 expects numeric/string scalar; boolean coerces to NaN in Observer's anomaly detection math).

- **`coa_anchor_stale_lifecycle_transition_count`** — v3 MED-L fold: WARN threshold defined.
  - `value: coaAnchorStaleLifecycleTransitionCount`
  - `threshold: '< 50% of totalRowsCoa post-quiet-period'`
  - Status: INFO during quiet period; otherwise WARN if `value / max(totalRowsCoa, 1) > 0.5`.
  - Reasoning: post-30-day deploy, ≥50% of CoA leads having stale lifecycle_transitions means the E.2 writer is sparse or broken.

- **`skipped_no_anchor_coa`** — v2 HIGH 8 fold: MOVED from records_meta to audit_table.rows. `value: skippedNoAnchorCoa`, `threshold: null`, `status: INFO`.
- **`skipped_too_old_coa`** — v2 HIGH 8 fold: MOVED. `value: skippedTooOldCoa`, `threshold: null`, `status: INFO`.
- **`snowplow_applied_coa`** — v2 HIGH 8 fold: MOVED. `value: snowplowAppliedCoa`, `threshold: null`, `status: INFO`.

Additional v3 audit rows:

- **`coa_anchor_fallback_pct_quiet_period`** (NEW v3 HIGH-I) — `value: inQuietPeriod` (boolean), `threshold: null`, `status: INFO`. Surfaces which classification regime is active.
- **`stale_purged_permit`** (NEW v3 — already in v2 §2.7 narrative but now explicit in §2.5) — `value: stalePurgedPermit`, `threshold: null`, `status: INFO`.
- **`stale_purged_coa`** (NEW v3 — same) — `value: stalePurgedCoa`, `threshold: null`, `status: INFO`.

Total audit rows: 14 existing + 11 new + 1 retained-as-zero (`coa_skipped_count`) = **26 rows**.

**v3 HIGH-H fold — `records_meta.skipped_distribution_by_lifecycle_group`:** add a new `records_meta` scalar that breaks down skip+upsert counters per CoA lifecycle_group (C1/C2/C3). Spec 47 §11.4 traceability — operator can answer "what happened to N CoAs in C2 last week?" from this map.

```javascript
const skipDistribution = { C1: { skipped_no_anchor: 0, skipped_too_old: 0, snowplow_applied: 0, upserted: 0 },
                            C2: { skipped_no_anchor: 0, skipped_too_old: 0, snowplow_applied: 0, upserted: 0 },
                            C3: { skipped_no_anchor: 0, skipped_too_old: 0, snowplow_applied: 0, upserted: 0 } };
// In each CoA branch ++ site, increment skipDistribution[row.lifecycle_group]?.[event_kind].
// Emit as records_meta.skipped_distribution_by_lifecycle_group.
```

#### 2.6 Counter semantics (Spec 47 §11) + ON CONFLICT target

**v2 HIGH 9 fold — `records_total` defense:** `records_total = totalRowsPermit + totalRowsCoa` per **Spec 85 §3 Inputs** which explicitly establishes both as primary forecast subjects: *"Active `lead_trades` (filtered to `is_active = true`), `permits` AND `coa_applications` with lifecycle data... Source SQL extended to UNION the two streams"*. The unified output table `trade_forecasts` is keyed on `lead_id` post-mig 151 — semantically lead-keyed, not permit-keyed. Spec 47 §11.2 forbids summing **secondary entity types** into the primary counter; in this script, both branches feed the SAME primary entity (`trade_forecasts.lead_id` rows). Spec 47 §11.2's `classify-lifecycle-phase` example concerns a DIFFERENT case where the primary write target was singular (`permits.lifecycle_phase`) and CoA was a secondary surface.

**#117 status:** v1 incorrectly claimed F.1 "resolves" #117. Per Observability HIGH: #117 is filed against `classify-lifecycle-phase.js` (the E.2 script), not `compute-trade-forecasts.js`. F.1 establishes the correct semantic for the forecast script; #117 remains open against its original target and will need a separate WF3 against the E.2 script. The Phase E.2 close-out narrative in `review_followups.md` retains #117 as DEFERRED.

**Granular observability:** `records_meta` carries `forecasts_computed_permit`, `forecasts_computed_coa`, `total_rows_permit`, `total_rows_coa` for operator drill-down without breaking the §11.1 contract.

**v2 CRIT 3 fold + v3 NIT-O — INSERT shape (extracted constant):**

```javascript
// v3 NIT-O fold: FORECAST_COL_COUNT extracted as a single source of truth so SQL template +
// params array stay in lockstep when columns are added.
const FORECAST_COL_COUNT = 14;
const FORECAST_BATCH_SIZE = pipeline.maxRowsPerInsert(FORECAST_COL_COUNT);

// v3 MED-M + v4 MED-I fold: failed_sample pre-validation. Spec 48 §4 — emit up to 20 failing
// descriptors. v4 extends pre-validation to BOTH lead_id sources (CoA and permit) — a malformed
// permit lead_id could also poison a batch via the DB CHECK constraint. Single failed_sample
// array for both.
const LEAD_ID_FORMAT_COA = /^coa:.+$/;
const LEAD_ID_FORMAT_PERMIT = /^permit:[^:]+:[^:]+$/;       // permit:<num>:<rev> per Phase C deriveLeadId
const failedSample = [];
const validForecasts = [];
for (const f of allForecasts) {
  const isCoa = f.lead_id?.startsWith('coa:');
  const isPermit = f.lead_id?.startsWith('permit:');
  const validFormat = (isCoa && LEAD_ID_FORMAT_COA.test(f.lead_id))
                   || (isPermit && LEAD_ID_FORMAT_PERMIT.test(f.lead_id));
  if (!validFormat) {
    if (failedSample.length < 20) {
      const prefix = isCoa ? 'coa' : isPermit ? 'permit' : 'unknown';
      failedSample.push(`lead_id:${f.lead_id} — ${prefix}-format validation failed`);
    }
    continue;                                             // drop from INSERT batch
  }
  validForecasts.push(f);
}

// Updated INSERT column list (lead_id added explicitly — no longer derived via trigger for CoA)
// Permit-side rows continue to write lead_id (mig 139 made it NOT NULL UNIQUE — invariant).
for (let offset = 0; offset < validForecasts.length; offset += FORECAST_BATCH_SIZE) {
  const chunk = validForecasts.slice(offset, offset + FORECAST_BATCH_SIZE);
  const vals = [];
  const params = [];
  for (let j = 0; j < chunk.length; j++) {
    const f = chunk[j];
    const base = j * FORECAST_COL_COUNT;                   // v3 NIT-O fold: use the constant
    vals.push(
      `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, ` +
      `$${base + 5}::date, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, ` +
      `$${base + 10}::int, $${base + 11}::int, $${base + 12}::int, $${base + 13}::int, ` +
      `$${base + 14}::timestamptz)`,
    );
    params.push(
      f.permit_num, f.revision_num, f.lead_id, f.trade_slug,
      f.predicted_start, f.confidence, f.urgency,
      f.target_window, f.calibration_method,
      f.sample_size, f.median_days, f.p25_days, f.p75_days,
      runAt,
    );
  }
  const insertResult = await client.query(
    `INSERT INTO trade_forecasts
       (permit_num, revision_num, lead_id, trade_slug, predicted_start,
        confidence, urgency, target_window, calibration_method,
        sample_size, median_days, p25_days, p75_days, computed_at)
     VALUES ${vals.join(', ')}
     ON CONFLICT (lead_id, trade_slug)                     -- v2 CRIT 3 fold: matches new PK
     DO UPDATE SET
       predicted_start = EXCLUDED.predicted_start,
       confidence = EXCLUDED.confidence,
       urgency = EXCLUDED.urgency,
       target_window = EXCLUDED.target_window,
       calibration_method = EXCLUDED.calibration_method,
       sample_size = EXCLUDED.sample_size,
       median_days = EXCLUDED.median_days,
       p25_days = EXCLUDED.p25_days,
       p75_days = EXCLUDED.p75_days,
       computed_at = EXCLUDED.computed_at,
       permit_num = EXCLUDED.permit_num,                  -- explicit copy (no derivation trigger for CoA)
       revision_num = EXCLUDED.revision_num`,
    params,
  );
  upserted += insertResult.rowCount || 0;
}
```

**Note on column count + batch size:** v1 had 13 cols (FORECAST_BATCH_SIZE = `floor(65535/13) = 5041`). v2/v3 has 14 cols → `floor(65535/14) = 4681`. v3 NIT-O extracts `FORECAST_COL_COUNT = 14` as the single source.

**emitSummary integration (v3 MED-M):**

```javascript
pipeline.emitSummary({
  records_total:   totalRowsPermit + totalRowsCoa,
  records_new:     newRows,
  records_updated: upserted - newRows,
  failed_sample:   failedSample.length > 0 ? failedSample : undefined,
  records_meta: {
    ...                                                   // existing fields preserved
    skipped_distribution_by_lifecycle_group: skipDistribution,   // v3 HIGH-H fold
    coa_first_deploy_grace: coaFirstDeployGrace,                 // v3 HIGH-J context
    forecasts_computed_permit: upserted - upsertedCoa,
    forecasts_computed_coa:    upsertedCoa,
    total_rows_permit: totalRowsPermit,
    total_rows_coa:    totalRowsCoa,
    audit_table: { phase: 22, name: 'Trade Forecasts', verdict: auditVerdict, rows: auditRows },
  },
});
```

#### 2.7 NEW: Stale-purge CoA branch (v2 CRIT 2 fold)

The existing permit-side stale-purge (currently `DELETE FROM trade_forecasts tf WHERE NOT EXISTS (... JOIN permit_trades pt ON pt.permit_num = tf.permit_num AND pt.revision_num = tf.revision_num ...)`) is RESTRICTED to permit-side rows via an explicit `AND tf.lead_id LIKE 'permit:%'` filter to avoid silently dropping CoA rows on the NULL=NULL UNKNOWN path. A separate CoA-side DELETE follows, mirroring the SOURCE_SQL Branch B gate:

```javascript
await pipeline.withTransaction(pool, async (client) => {
  // F1 Grace-purge (unchanged) — runs against ALL urgency='expired' rows regardless of lead_id prefix
  const graceResult = await client.query(
    `DELETE FROM trade_forecasts
      WHERE urgency = 'expired'
        AND predicted_start < $1::timestamptz - INTERVAL '${GRACE_PURGE_DAYS} days'`,
    [runAt],
  );
  gracePurged = graceResult.rowCount || 0;

  // F2 Stale-purge — PERMIT branch (existing query, v2 CRIT 2 fold adds tf.lead_id LIKE 'permit:%' guard)
  const { rows: stalePermitRows } = await client.query(
    `DELETE FROM trade_forecasts tf
      WHERE tf.lead_id LIKE 'permit:%'                    -- v2 CRIT 2 fold: restrict to permit-side
        AND NOT EXISTS (
          SELECT 1 FROM permit_trades pt
            JOIN permits p ON p.permit_num = pt.permit_num AND p.revision_num = pt.revision_num
            JOIN trades t ON t.id = pt.trade_id
           WHERE pt.permit_num = tf.permit_num
             AND pt.revision_num = tf.revision_num
             AND t.slug = tf.trade_slug
             AND pt.is_active = true
             AND p.lifecycle_phase IS NOT NULL
             AND p.lifecycle_stalled = false
             AND (
               (p.lifecycle_phase IN ('P1','P2')
                AND p.application_date IS NOT NULL
                AND p.application_date >= NOW() - INTERVAL '18 months')
               OR
               (p.lifecycle_phase NOT IN ${SKIP_PHASES_SQL}
                AND p.lifecycle_phase NOT IN ('P1','P2')
                AND COALESCE(p.phase_started_at, p.issued_date::timestamptz) >= NOW() - INTERVAL '3 years')
             )
        )
      RETURNING 1`,
  );
  stalePurgedPermit = stalePermitRows.length;

  // F3 Stale-purge — CoA branch (v3 HIGH-E fold: CTE + LEFT JOIN refactor).
  //
  // ╔═══════════════════════════════════════════════════════════════════════════════════╗
  // ║ CRITICAL: this WHERE clause MUST stay in sync with Branch B of SOURCE_SQL (§2.1). ║
  // ║ Any change to "what counts as a live CoA forecast subject" must be mirrored in    ║
  // ║ BOTH places, otherwise stale-purge will drop active forecasts or leave ghosts.    ║
  // ║ See parity test in compute-trade-forecasts.infra.test.ts (Phase F.1 describe).    ║
  // ╚═══════════════════════════════════════════════════════════════════════════════════╝
  //
  // v3 HIGH-E fold (perf + duplication): the v2 correlated scalar subquery
  // `(SELECT MAX(transitioned_at) FROM lifecycle_transitions WHERE lead_id = lt.lead_id)`
  // ran once per candidate `lead_trades` row inside the NOT EXISTS, holding ACCESS SHARE
  // locks on lifecycle_transitions for the DELETE duration. Refactored to a CTE that
  // pre-aggregates MAX(transitioned_at) per lead_id ONCE via window-function (Gemini's
  // suggested pattern), then LEFT JOIN to find purge candidates. Single scan of
  // lifecycle_transitions instead of N scans.
  const { rows: staleCoaRows } = await client.query(
    `WITH live_coa_anchors AS (
       -- Pre-aggregate MAX(transitioned_at) per lead_id; one scan of lifecycle_transitions
       SELECT lead_id, MAX(transitioned_at) AS phase_started_at
         FROM lifecycle_transitions
        WHERE lead_id LIKE 'coa:%'
        GROUP BY lead_id
     ),
     live_coa_forecasts AS (
       -- Set of (lead_id, trade_slug) pairs that ARE still live CoA forecast subjects.
       -- Mirrors SOURCE_SQL Branch B exactly (per CRITICAL comment above).
       SELECT lt.lead_id, t.slug AS trade_slug
         FROM lead_trades lt
         JOIN trades t ON t.id = lt.trade_id
         JOIN coa_applications ca ON ca.lead_id = lt.lead_id
         LEFT JOIN live_coa_anchors la ON la.lead_id = lt.lead_id
        WHERE lt.is_active = true
          AND lt.lead_id LIKE 'coa:%'
          AND ca.lifecycle_phase IS NOT NULL
          AND ca.lifecycle_stalled = false
          AND ca.lifecycle_group IN ('C1','C2','C3')
          -- v4 HIGH-G fold: 3-year bound removed (mirrors SOURCE_SQL Branch B).
          AND COALESCE(
                la.phase_started_at,
                (ca.decision_date::timestamp AT TIME ZONE 'UTC'),
                (ca.hearing_date::timestamp  AT TIME ZONE 'UTC'),
                ca.first_seen_at
              ) IS NOT NULL
     )
     DELETE FROM trade_forecasts tf
      WHERE tf.lead_id LIKE 'coa:%'
        AND NOT EXISTS (
          SELECT 1 FROM live_coa_forecasts lcf
           WHERE lcf.lead_id = tf.lead_id AND lcf.trade_slug = tf.trade_slug
        )
      RETURNING tf.lead_id`,
  );
  stalePurgedCoa = staleCoaRows.length;

  // v3 LOW-P fold: surface first 5 purged lead_ids for operator debugging.
  if (stalePurgedCoa > 0) {
    const sample = staleCoaRows.slice(0, 5).map(r => r.lead_id).join(', ');
    pipeline.log.info('[trade-forecasts]',
      `Stale-purged ${stalePurgedCoa} CoA forecasts (sample: ${sample}${stalePurgedCoa > 5 ? ', ...' : ''})`);
  }

  stalePurged = stalePurgedPermit + stalePurgedCoa;       // legacy combined counter preserved
  // ... chunked UPSERT loop (from §2.6) ...
});
```

Two new audit rows surface the breakdown: `stale_purged_permit` (INFO) and `stale_purged_coa` (INFO). The legacy `stale_purged` row keeps the combined total.

### Part 3 — Test scaffolding (TDD Red Light)

**`src/tests/migration-151-trade-forecasts-pk-swap.infra.test.ts`** (NEW — 8 tests, unchanged from v1).

**`src/tests/compute-trade-forecasts.infra.test.ts`** extension — Phase F.1 describe block, **16 tests** (v2 +4 from v1):
1. SOURCE_SQL contains `UNION ALL`
2. Branch B filters `lt.lead_id LIKE 'coa:%'` + `lifecycle_group IN ('C1','C2','C3')`
3. Branch B uses `(::timestamp AT TIME ZONE 'UTC')` casts (v2 HIGH 7 fold assertion)
4. Branch B includes `LEFT JOIN LATERAL ... lifecycle_transitions`
5. NEW separate query reads `phase_stay_calibration WHERE permit_type IS NULL` (v2 CRIT 6 fold)
6. `coaCalMap` build keys on `from_seq` (v2 CRIT 1 fold) — assertion via SRC.search regex
7. `lookupCoaCalibration` 4-level fallback reaches `'default'` method when 5-tuple unknown
8. `target_window = 'bid'` for every CoA push
9. Audit-verdict gate uses exact pipeline name `'permits:compute_phase_calibration'` (UNDERSCORE — v4 CRIT-C fold corrects v3 test-description typo; matches manifest key + `run-chain.js:321` scopedSlug construction)
10. Audit-verdict gate WARN → `coa_audit_gate_status` audit row has `status='WARN'` only when blocked_by_warn/blocked_by_fail/query_error (v2 HIGH 10 fold)
11. Audit-verdict gate `'pass'` and `'no_prior_run'` → `status='INFO'` (v2 HIGH 10 fold)
12. CoA stale-purge DELETE present with `tf.lead_id LIKE 'coa:%'` filter (v2 CRIT 2 fold)
13. Permit stale-purge DELETE gains `tf.lead_id LIKE 'permit:%'` guard (v2 CRIT 2 fold)
14. INSERT column list contains `lead_id` + `ON CONFLICT (lead_id, trade_slug)` (v2 CRIT 3 fold)
15. `records_total = totalRowsPermit + totalRowsCoa` (Spec 47 §11.1 — defended)
16. `coa_skipped_count` audit row emits `value: 0` indefinitely (v2 CRIT 5 fold)
17. Defensive E.2 `coa:%` skip guard REMOVED (regex absence assertion)
18. Skip counters in audit_table.rows (`skipped_no_anchor_coa`, `skipped_too_old_coa`, `snowplow_applied_coa`) — v2 HIGH 8 fold
19. `coa_anchor_stale_lifecycle_transition_count` audit row present — v2 MED 11 fold
20. `FORECAST_BATCH_SIZE = pipeline.maxRowsPerInsert(14)` (v2 CRIT 3 fold, column count change)

**`src/tests/compute-trade-forecasts.logic.test.ts`** extension — Phase F.1 describe block, **7 tests** (v2 +2 from v1):
1. `selectCoaAnchor()` priority: returns `lifecycle_transition` source when `phase_started_at` present
2. `selectCoaAnchor()` priority: falls back to `decision_date` source
3. `selectCoaAnchor()` priority: falls back to `hearing_date` source
4. `selectCoaAnchor()` priority: falls back to `first_seen_at` source
5. `selectCoaAnchor()` returns null when all 4 anchor candidates null
6. `coaCalMap` build collapses across `to_seq` keeping max-sample row for same `(pt, tc, from_seq)` triple — v2 CRIT 1 fold
7. Snowplow freshness check: `lifecycle_transition` anchor older than `logicVars.coa_lifecycle_transition_stale_days` (default 180 days) becomes snowplow-eligible; anchor within that threshold does not — v4 MED-K fold (replaces v2/v3 `× 4` test description)

### Part 4 — Spec amendments

**`docs/specs/01-pipeline/85_trade_forecast_engine.md` §3 — CoA-stage routing simplification (v4 CRIT-A REWRITE — replaces v2/v3 drift; brings spec text in lockstep with implementation):**
```diff
- **Anchor priority extended** for CoA leads: `phase_started_at` → `decision_date` → `hearing_date` → `application_date` (CoA's analog of permits' issued_date).
+ **Anchor priority extended** for CoA leads: `lifecycle_transitions.MAX(transitioned_at)` (CoA's analog of permits' `phase_started_at`, derived via LATERAL JOIN — `coa_applications` has no dedicated column) → `decision_date` → `hearing_date` → `first_seen_at` (CKAN first-surface timestamp, CoA's analog of permits' `application_date`). Snowplow freshness gate: a `lifecycle_transition` anchor older than `logic_variables.coa_lifecycle_transition_stale_days` (default 180 days = 6 months ≈ p75 of typical CoA decision cohort) becomes snowplow-eligible (treats long-stalled E.2-classified CoAs without subsequent transitions as Rescue Missions). The 30-day `inQuietPeriod` post-deploy classifies `coa_anchor_fallback_pct` and `coa_anchor_stale_lifecycle_transition_count` audit rows as INFO (operator pre-ack — see runbook `F1_baseline_quiet_period.md`); after the quiet period, threshold-based WARN/PASS classification activates.
```

Additional Spec 85 §2 (calibration_method enumeration) update:
```diff
- `calibration_method` | VARCHAR | | `exact`, `fallback_all_types`, `fallback_issued`, `default`.
+ `calibration_method` | VARCHAR | | `exact`, `fallback_all_types`, `fallback_issued_type`, `fallback_issued_all`, `default` (permit-side); `exact`, `fallback_all_type_classes`, `fallback_all_project_types`, `fallback_all_cohorts`, `default` (CoA-side, post-Phase F.1); plus anchor-specific labels for fallback chain hits: `fallback_inspection` (last_passed_inspection_date), `fallback_application` (application_date), `fallback_decision` (decision_date), `fallback_hearing` (hearing_date), `fallback_first_seen` (first_seen_at).
```

**`docs/specs/01-pipeline/42_chain_coa.md` §6.11 Phase F row** — add F.1 sub-deliverable entry.

**`docs/specs/01-pipeline/84_lifecycle_phase_engine.md` §7 — Calibration Source — Phase F.1 consumer note:**
```
**Phase F.1 consumer wiring (DELIVERED 2026-05-16 commit `[F.1-COMMIT]`):** `compute-trade-forecasts.js` reads `phase_stay_calibration` CoA-side rows (WHERE `permit_type IS NULL`) via a separate query from the legacy `phase_calibration` permit-side query. 5-tuple cohort lookup keys on **`from_seq`** matching the lead's current `lifecycle_seq` (the cohort row's `from_seq` represents the phase being EXITED in the LAG window — measures stay duration IN that phase). Multiple `to_seq` variants for the same `from_seq` are collapsed by keeping the row with maximum `sample_size`. The 3-level fallback (exact → `__ALL__` type_class → `__ALL__` cohorts → default) is the post-E.3 consumer pattern.
```

---

## Standards Compliance

- **§2.1 Unhappy Path Tests:** v2 includes audit-verdict gate WARN-blocking, `lookupCoaCalibration` default-fallback, snowplow staleness, and CoA stale-purge ghost-prevention tests.
- **§2.2 Try-Catch Boundary:** N/A (script). Gate try-catch added per Spec 47 §R8 fail-safe (v2 NIT 15 explicit fail-closed).
- **§3.1 Zero-Downtime Migration:** Mig 151 is metadata-only (`DROP NOT NULL`, `DROP/ADD PK USING INDEX`).
- **§3.2 Pagination:** N/A — `streamQuery` used for unbounded reads.
- **§6.1 logError:** N/A — script uses `pipeline.log.warn/error`.
- **§7 Dual Code Path:** N/A — sole forecast writer.
- **§9.1 Transaction Boundaries:** All purges + UPSERTs in single `pipeline.withTransaction` (v2 adds CoA stale-purge to the SAME tx).
- **§9.2 Parameter Limit:** `FORECAST_BATCH_SIZE = pipeline.maxRowsPerInsert(14)` updated for new column count.
- **§9.3 Idempotent:** `ON CONFLICT (lead_id, trade_slug) DO UPDATE`.

---

## Spec 47 §R1-R12 Compliance

Preserved from v1. v2 + v3 changes specifically:
- §R4 — `LOGIC_VARS_SCHEMA` extended in v3+v4 with TWO new keys (mig 152 seeds both):
  - `coa_lifecycle_transition_stale_days: z.coerce.number().int().positive()` — default 180 (v3 CRIT-D fold)
  - `coa_gate_calibration_window_days: z.coerce.number().int().positive()` — default 7 (v4 MED-J fold)
  All other reads preserved.
- §R10 — audit rows expanded to **26 total** in v3 (was 22 in v2); `audit_table.verdict` cascade per `failures[]`/`warnings[]` (no change to derivation).
- §R11 — emitMeta reads extended with `phase_stay_calibration`, `lead_trades`, `coa_applications`, `lifecycle_transitions`, `pipeline_runs` (gate query + first-deploy grace query).
- §11.1 — `records_total` defended per Spec 85 §3 (both forecast subjects, unified output entity).
- §11.4 — skip counters surfaced as audit_table.rows (v2 HIGH 8 fold); v3 HIGH-H adds `records_meta.skipped_distribution_by_lifecycle_group` for cohort-by-phase visibility.

---

## Spec 48 Pipeline Observability Adherence

- **§3.1 audit_table.rows shape:** all 22 rows use `{ metric, value, threshold, status }` with `status ∈ {PASS,FAIL,WARN,INFO}`.
- **§3.2 records_meta distributions:** `anchor_sources_coa`, `forecasts_computed_permit`/`_coa`, `total_rows_permit`/`_coa`, `urgency_distribution`, `calibration_distribution` in records_meta.
- **§3.5 emitSummary BEFORE throw:** F.1 introduces no new throw paths.
- **§3.4 Strangler-Fig:** `records_total` semantic shift produces a one-time 7-day-baseline anomaly. Operator pre-ack codified in Risk Register §1 (NEW).

---

## Pre-Review Self-Checklist (30 items — walked against actual diff at Green Light)

(a) Mig 151 uses `USING INDEX` for PK promotion (metadata-only)?
(b) Mig 151 DOWN block stays comment-only (Rule 6)?
(c) SOURCE_SQL UNION ALL emits identical column count + types from both branches?
(d) E.2 defensive `coa:% skip` guard fully REMOVED?
(e) `lookupCoaCalibration` keys on **`from_seq`** matching `lifecycle_seq` (v2 CRIT 1)?
(f) CoA cohort query reads from `phase_stay_calibration` (NOT `phase_calibration`) (v2 CRIT 6)?
(g) **Audit-verdict gate uses EXACT pipeline name `'permits:compute_phase_calibration'` (UNDERSCORE — v3 CRIT-A fold of v2 typo)?**
(h) Audit-verdict gate fails closed on every non-`'PASS'` value, including `status !== 'completed'` (v3 CRIT-C)?
(i) `coa_skipped_count` keeps emitting `0` indefinitely (v2 CRIT 5)?
(j) Stale-purge has TWO branches — permit (with `lead_id LIKE 'permit:%'` guard) AND CoA (v2 CRIT 2)?
(k) INSERT column list contains `lead_id` + `ON CONFLICT (lead_id, trade_slug)` (v2 CRIT 3)?
(l) `FORECAST_COL_COUNT = 14` constant used by SQL template + params (v3 NIT-O)?
(m) Date casts use `AT TIME ZONE 'UTC'` (v2 HIGH 7)?
(n) Skip counters in `audit_table.rows` not `records_meta` (v2 HIGH 8)?
(o) `coa_audit_gate_status` first-deploy grace: INFO for `'pass'`; INFO for `'no_prior_run'` IFF `coaFirstDeployGrace`, else WARN (v3 HIGH-J)?
(p) `selectCoaAnchor()` extracted to module-local pure function used by both impl + tests (v2 NIT 14)?
(q) **Gate query has `AND started_at >= NOW() - INTERVAL '7 days'` time-bound (v3 CRIT-B)?**
(r) **Snowplow staleness uses `logicVars.coa_lifecycle_transition_stale_days` (NOT `* 4`); mig 152 seeds default 180; Zod schema validates (v3 CRIT-D)?**
(s) **`lookupCoaCalibration` has 5 fallback levels including new `('__ALL__', coaTypeClass, from_seq)` between Level 2 and Level 4 (v3 HIGH-F)?**
(t) **CoA stale-purge uses CTE + LEFT JOIN form (NO correlated scalar subquery); contains `CRITICAL: keep in sync with Branch B` comment (v3 HIGH-E)?**
(u) **`records_meta.skipped_distribution_by_lifecycle_group` present with C1/C2/C3 breakdown (v3 HIGH-H)?**
(v) **`coa_anchor_fallback_pct` + `coa_anchor_stale_lifecycle_transition_count` use quiet-period INFO classification during first 30 days; `coa_anchor_fallback_pct_quiet_period` audit row present (v3 HIGH-I + MED-L)?**
(w) **`failed_sample` populated for BOTH CoA + permit `lead_id` format violations, capped at 20 entries combined (v3 MED-M + v4 MED-I)?**
(x) **Runbook `docs/runbook/F1_baseline_quiet_period.md` authored per Risk Register #7 (11-metric list + 7-day pre-ack expectation + operator annotation protocol) (v4 MED-L)?**
(y) **Spec 85 §3 amendment text matches v3 implementation EXACTLY — no `× 4` references, no `phase_started_at`/`application_date` references; calibration_method enumeration updated for CoA-side fallback chain (v4 CRIT-A)?**
(z) **`inQuietPeriod` is pre-fetched at startup (NOT inline `await pool.query` inside audit-row construction) — Spec 47 §3.5 emitSummary-before-throw preserved (v4 CRIT-B)?**
(aa) **`coa_anchor_fallback_pct_quiet_period.value` is numeric `1`/`0` (NOT JS boolean) per Spec 48 §3.1 (v4 HIGH-F)?**
(ab) **Branch B SOURCE_SQL + stale-purge live_coa_forecasts CTE BOTH have `>= NOW() - INTERVAL '3 years'` REMOVED (replaced with `IS NOT NULL`) to retain long-running OMB CoAs (v4 HIGH-G)?**
(ac) **Gate query uses `logicVars.coa_gate_calibration_window_days` parameterized window (not hardcoded `INTERVAL '7 days'`) (v4 MED-J)?**
(ad) **Mig 151 DOWN block reorders DELETE first + uses `IF NOT EXISTS` on legacy index recreation (v4 HIGH-E)?**

---

## Execution Plan (per WF1)

- [ ] **Contract Definition:** N/A — no API route.
- [ ] **Spec & Registry Sync:** Update Spec 85 §3 (full rewrite per v4 CRIT-A) + Spec 85 §2 (calibration_method enumeration) + Spec 42 §6.11 + Spec 84 §7. Run `npm run system-map`.
- [ ] **Runbook authorship (v4 MED-L):** Author `docs/runbook/F1_baseline_quiet_period.md` (~30 lines) covering: 11 new audit-row metrics list, 7-day baseline-quiet-period operator annotation protocol, 30-day extended quiet-period for `coa_anchor_fallback_pct` + `coa_anchor_stale_lifecycle_transition_count`.
- [ ] **Schema Evolution:** Author mig 151. Apply locally + verify `\d trade_forecasts` shows new PK + nullable permit_num/revision_num + no FK. Run `npm run db:generate`. Update `src/tests/factories.ts` to mark `permit_num`/`revision_num` as optional.
- [ ] **Test Scaffolding (TDD Red Light):** Author 3 test files (NEW + 2 EXTEND, ~31 new tests total). Confirm failures.
- [ ] **Red Light:** `npm run test src/tests/migration-151* src/tests/compute-trade-forecasts*`. Confirm failures.
- [ ] **Implementation:** Apply mig 151 → DB. Implement script per Part 2. Drive failures to Green incrementally.
- [ ] **Auth Boundary & Secrets:** N/A — backend script.
- [ ] **Pre-Review Self-Checklist:** Walk all 30 items above. Paste PASS/FAIL.
- [ ] **Multi-Agent Review (4 reviewers per user mandate):** Four parallel tool calls — Gemini + DeepSeek (bash) + 2 worktree agents (Independent code-reviewer + Observability lens).
- [ ] **Triage:** BUG → fix before Green Light; DEFER → `review_followups.md`.
- [ ] **Green Light:** `npm run verify`. Paste evidence.
- [ ] **WF6 close-out:** Single commit `feat(85_trade_forecast_engine): WF1 Phase F.1 — compute-trade-forecasts.js CoA UNION extension + mig 151 trade_forecasts PK swap to (lead_id, trade_slug) + dual stale-purge`. Tiny follow-up `docs(85_trade_forecast_engine): WF1 Phase F.1 close-out` fills `[F.1-COMMIT]` placeholders.

---

## Risk Register (v3 expanded — 7 items)

1. **Operator pre-ack on first-deploy gate state (v3 HIGH-J revised).** Day 0 of F.1: gate status will be `'no_prior_run'` UNTIL the first `compute_phase_calibration` permits-chain run completes. v3 first-deploy grace gate (`coaFirstDeployGrace` boolean — TRUE if `compute_trade_forecasts` has NO `pipeline_runs` rows older than 7 days) classifies this as INFO. After the F.1 script has been running >7 days, `'no_prior_run'` flips to WARN (broken-cron detection). **Codified expectation:** operator annotates the first F.1 production run with `[Phase F.1 cold-start — first chain tick will skip CoA branch until compute_phase_calibration completes; second tick onward produces CoA forecasts]`.

2. **Daily `coa_anchor_fallback_pct` near 100% during 30-day E.2 ramp (v3 HIGH-I revised).** Phase E.2 lifecycle_transitions writer is recent; CoA leads classified pre-E.2 have no transition history → `selectCoaAnchor` falls to `decision_date`/`hearing_date`/`first_seen_at`. v3 quiet-period gate (first 30 days post-deploy, detected via `pipeline_runs` row age for `compute_trade_forecasts` itself) classifies this metric as INFO regardless of value. Post-quiet-period: WARN at `≥ 95%`. `coa_anchor_fallback_pct_quiet_period` companion audit row surfaces which gate is active.

3. **FK drop is irreversible-by-software.** Mig 151 DOWN is comment-only per Rule 6. Restoring the FK requires manual operator action (DELETE CoA rows first). Documented.

4. **Audit-verdict gate is a chain-order dependency.** `compute_phase_calibration` (step 15) must run BEFORE `compute_trade_forecasts` (step 22) in the same chain tick. Verified via manifest. F.1 does NOT add `compute_trade_forecasts` to the CoA chain — forecasts remain permits-chain-only; the CoA UNION inside the script reads `coa_applications` from the permits-chain context.

5. **`first_seen_at` may be years stale.** CKAN seeded historical CoAs. Snowplow gate fires for `first_seen_at` anchors (existing logic preserved) AND for stale `lifecycle_transition` anchors (v2 MED 11 fold). `coa_anchor_stale_lifecycle_transition_count` audit row surfaces the volume.

6. **CoA `lifecycle_phase` value space.** CoA uses P1-P4 (Intake/Review/Approved/FaB) + P19/P20 (terminal, excluded via `lifecycle_group='C4'` filter). The shared `PRE_CONSTRUCTION_PHASES` set (P1-P8) is a superset; CoA never reaches P5+. The script's permit-side `fromPhase = PRE_CONSTRUCTION_PHASES.has(...) ? 'ISSUED' : ...` routing is permit-only — CoA bypasses via the `isCoaRow` branch dispatch BEFORE reaching that code path. Confirmed.

7. **Baseline-quiet-period codification for 11 new metrics (v3 HIGH-G NEW).** Spec 48 §3.4 7-day baseline window means newly-introduced metrics produce noisy comparisons for the first 7 days post-deploy. F.1 introduces 11 new audit_table.rows metrics (8 v2-fold + 3 v3-fold: `coa_forecasts_computed`, `coa_skipped_audit_blocked`, `coa_anchor_fallback_pct`, `coa_anchor_stale_lifecycle_transition_count`, `skipped_no_anchor_coa`, `skipped_too_old_coa`, `snowplow_applied_coa`, `stale_purged_coa`, `coa_anchor_fallback_pct_quiet_period`, `coa_audit_gate_status`, `stale_purged_permit`) plus 4 `records_meta` distributions (`anchor_sources_coa`, `forecasts_computed_permit/_coa`, `total_rows_permit/_coa`, `skipped_distribution_by_lifecycle_group`). **Codified operator pre-ack:** annotate the first 7 days of `permits-followup.md` and `coa-followup.md` with `[F.1 baseline-quiet-period — Day X of 7]` so the Observer's anomaly detection math isn't misread. Add a runbook entry in `docs/runbook/F1_baseline_quiet_period.md` (NEW — single page; ~30 lines). The 30-day quiet period for `coa_anchor_fallback_pct` and `coa_anchor_stale_lifecycle_transition_count` is a separate longer-window grace explicitly gated in the audit row classification (v3 HIGH-I + MED-L).

---

> **PLAN LOCKED v4 — AUTHORIZED FOR IMPLEMENTATION.**
>
> v3 4-reviewer round surfaced 4 CRIT + 4 HIGH + 4 MED + 2 LOW/NIT. 1 CRIT was a false positive (DeepSeek `SET NOT NULL on lead_id` — `lead_id` is already NOT NULL post-mig 139). All other v3 findings folded into v4 per user authorization "Fold all + PLAN LOCK v4 directly" (mirrors Phase E.5 v4 terminal pattern).
>
> Trajectory:
> - v1 = 16 folds (6 CRIT + 4 HIGH + 3 MED + 3 NIT) → 4-reviewer round
> - v2 = 18 folds (4 CRIT, 1 my own typo from v1 fold + 5 HIGH + 4 MED + 5 NIT) → 4-reviewer round
> - v3 = 14 folds (3 CRIT real + 1 FP + 4 HIGH + 4 MED + 2 NIT) → 4-reviewer round
> - v4 = 13 folds (3 CRIT + 3 HIGH + 4 MED + 1 NIT/LOW + 1 DEFERRED + 1 FP-noted) → PLAN LOCK directly
>
> §11 note unchanged: `records_total = totalRowsPermit + totalRowsCoa` defended per Spec 85 §3.
> §3.5 emitSummary-before-throw note (v4 CRIT-B): `inQuietPeriod` is pre-fetched at startup, eliminating the inline `await pool.query` from audit-row construction.
> Spec 85 §3 amendment (v4 CRIT-A): full rewrite — no `× 4` references, no obsolete column references.
>
> Diff-stage 4-reviewer round (Gemini + DeepSeek + Independent worktree + Observability worktree) runs AFTER Green Light, BEFORE WF6 commit, per user-mandated review protocol. Will triage all diff-stage findings (fold-and-relock vs PLAN LOCK directly) before committing.
>
> Proceed to Implementation: scaffold tests (TDD Red Light per user-mandated "failed test first"), apply mig 151 + mig 152, implement compute-trade-forecasts.js changes per Part 2, author runbook.
