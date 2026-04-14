# Active Task: Audit-table emission in 81, 82, 85, 86 (umbrella)
**Status:** Planning (umbrella — 4 sub-WF3s)
**Domain Mode:** Backend/Pipeline
**Finding:** H-W18 · 81-D1, 82-D4, 85-W11, 86-W7, RC-W3

**Umbrella note:** Each of the four scripts gets its own focused WF3 sub-task. They're sequenced here as one task for scoping/commitment purposes, but SHOULD ship as four separate PRs so each can be reviewed in isolation. Sub-IDs: WF3-09a (81), WF3-09b (82), WF3-09c (85), WF3-09d (86).

## Context
* **Goal:** Each of the four scripts currently omits a structured `audit_table` block in `PIPELINE_SUMMARY.records_meta`. The SDK auto-injects a stub `{verdict: 'PASS', rows: []}` when missing, so run-chain's verdict aggregation (L358–360) reports `completed` regardless of actual data quality. This makes the admin FreshnessTimeline fabricate green status for 67% of the marketplace tail. Each script needs 4-6 domain-specific audit rows with thresholds and PASS/WARN/FAIL verdicts.
* **Target Spec:** `docs/specs/pipeline/40_pipeline_system.md` §5 declares audit_table ownership for quality scripts — extend to require emission from compute/classify scripts too per H-S9. Plus per-script spec updates (81-S, 85-S11, 86-S12 etc.).
* **Reference pattern:** `scripts/compute-cost-estimates.js` L494–519 is the gold-standard audit_table already in production. Mimic shape.

## Per-script audit row design

### WF3-09a — 81 compute-opportunity-scores
Required rows (per 81-D1, 81-D2, 81-W6, Claude-obs F1):
- `scores_computed` (count) INFO
- `median_score` (int) INFO
- `score_dist_elite` / `strong` / `moderate` / `low` (counts) INFO — compute from JS loop, not the full-scan SQL
- `integrity_flag_pct` (%) threshold `< 5%` PASS/WARN
- `actual_rows_written` (from result.rowCount — covers 81-W5 concurrently) INFO
Verdict: WARN if integrity_flag_pct > 5%, else PASS.

### WF3-09b — 82 update-tracked-projects
Required rows (per 82-D4, 82-D6, 82-D7, Claude-obs F6):
- `active_tracked` (count) INFO
- `stall_alerts` / `recovery_alerts` / `imminent_alerts` INFO
- `archived` INFO
- `users_affected` (distinct user_id count) INFO — catches "one user drowning" pathology
- `max_alerts_per_user` threshold `< 20` WARN
- `alerts_delivered_to_notifications` (after WF3-10 lands) threshold `== total_alerts` FAIL if drift
- `predicted_start_null_count` INFO — signals upstream forecast gaps
Verdict: WARN if max_alerts_per_user > 20 OR predicted_start_null_count / alerts_total > 30%.

### WF3-09c — 85 compute-trade-forecasts
Required rows (per 85-W11, 85-W12, 85-D1, 85-D2, Claude-obs F5/F6/F7):
- `forecasts_computed` INFO
- `unmapped_trades` threshold `== 0` WARN if > 0 (catches trade_configurations drift)
- `calibration_method_exact_pct` INFO
- `calibration_method_default_pct` threshold `< 5%` WARN if > 5 (catches 86 failure silent fallback)
- `stall_recalibrated_count` INFO (detects stall rate spikes)
- `bid_routed` / `work_routed` split INFO
- `stale_forecasts_purged` INFO
Verdict: WARN if unmapped_trades > 0 OR default_pct > 5%.

### WF3-09d — 86 compute-timing-calibration-v2
Required rows (per 86-W7, 86-W13, Claude-obs F3):
- `phase_pairs_by_type` / `all_types` / `issued_by_type` / `issued_all_types` INFO
- `pairs_above_threshold` (= all 4 above summed) threshold `>= 50` WARN if lower (indicates data sparsity)
- `min_sample_size` INFO (lowest sample_size emitted this run)
- `median_of_medians` INFO (sanity — should be similar run-to-run)
- `negative_gap_count` threshold `== 0` WARN (data-quality signal — covers 86-W13)
Verdict: WARN if negative_gap_count > 0 OR pairs_above_threshold < 50.

## Technical Implementation
* **New/Modified Components:** Four `emitSummary` calls get their `records_meta.audit_table` populated with the rows above. All metrics must be accumulated during the existing JS loop (avoid new full-table scans).
* **Data Hooks/Libs:** `pipeline.emitSummary` already accepts `audit_table` structure (reference `compute-cost-estimates.js`).
* **Database Impact:** NO.

## Standards Compliance
* **Try-Catch Boundary:** N/A.
* **Unhappy Path Tests (per script):** Assert `records_meta.audit_table.verdict` is not the SDK auto-stub (i.e., rows contains domain metrics, not just `sys_*`). Assert verdict downgrades to WARN when threshold breach fixture fires.
* **logError Mandate:** N/A.
* **Mobile-First:** N/A.

## Execution Plan — per sub-task (template, apply to each of 4 scripts)

- [ ] **Rollback Anchor:** Record Git SHA per sub-task.
- [ ] **State Verification:** Review existing `emitSummary` call in target script + sibling `compute-cost-estimates.js` reference pattern. Identify every metric from the WF3-09 audit-row list that requires computation change (e.g., accumulate `distBuckets` in the scoring loop).
- [ ] **Spec Review:** Spec 40 audit_table contract + per-spec rows list. Await H-S9 spec update (can land in parallel).
- [ ] **Reproduction:** Each script's infra test adds an assertion on `records_meta.audit_table.rows.length >= N` AND `records_meta.audit_table.verdict === 'PASS'` for happy path; separate test injects threshold breach, assert WARN.
- [ ] **Red Light:** Tests fail because audit_table is absent today.
- [ ] **Fix:** Refactor emitSummary call to pass `audit_table: { phase, name, verdict, rows }`. Compute verdict from row statuses. Accumulate metrics during existing loops — DO NOT add new full-table scans.
- [ ] **Pre-Review Self-Checklist:**
  1. Does the audit_table shape match the FreshnessTimeline consumer contract? (Check `src/components/admin/FreshnessTimeline.tsx` or equivalent.)
  2. Are row names consistent with sibling scripts (snake_case)?
  3. Does each threshold have a documented SQL/JS formula and units?
  4. Are `sys_*` SDK-injected rows still present alongside domain rows? (Should be.)
  5. Does run-chain.js now pick up the verdict correctly (`recordsMeta?.audit_table?.verdict`)? Run chain end-to-end test.
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. ✅/⬜ summary. → WF6.

**PLAN COMPLIANCE GATE (per sub-task):**
- ✅ DB: None
- ⬜ API: N/A
- ⬜ UI: Front-end out of scope; front-end will render the new audit_table structure once available
- ✅ Shared Logic: Four scripts must adopt consistent audit_table shape
- ✅ Pipeline: §9 N/A · telemetry is the PRIMARY target

**PLAN LOCKED (umbrella). Each sub-task is a separate authorization: 09a (81), 09b (82), 09c (85), 09d (86). (y/n per sub-task)**
