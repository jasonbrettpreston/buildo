# Phase F.1 — Baseline Quiet-Period Operator Runbook

**Owning spec:** `docs/specs/01-pipeline/85_trade_forecast_engine.md` §3 + `48_pipeline_observability.md` §3.4
**Active task:** `.cursor/active_task.md` (F.1 v4 PLAN LOCKED 2026-05-16) — Risk Register #7
**Owner:** Operator on shift during first 30 days post-deploy

---

## Why this runbook exists

Phase F.1 ships **13 new audit_table.rows metrics** plus **4 new `records_meta` distributions** to `pipeline_runs`. The Spec 48 Observer's 7-day rolling baseline math expects ≥7 days of stable history per metric before its anomaly detection produces meaningful signal. On day 0 of F.1, those baselines are empty; for the next 7 days they're noisy; for `coa_anchor_fallback_pct` and `coa_anchor_stale_lifecycle_transition_count` specifically, the **30-day** quiet period applies (Phase E.2 `lifecycle_transitions` writer is still ramping, so fallback rates start at ~100% and decline as E.2 backfill catches up).

Without operator annotations the Observer's daily `permits-followup.md` / `coa-followup.md` reports surface a flood of expected anomalies that mask real signal.

## The 14 new audit_table.rows metrics (7-day quiet)

| metric | First 7 days expected behavior | Stable steady state |
|---|---|---|
| `stale_purged_permit` | Drops to ~existing combined `stale_purged` value | Stable |
| `stale_purged_coa` | Rises from 0 as CoA forecasts age into stale-purge | Small daily delta |
| `skipped_no_anchor_coa` | Variable while E.2 catches up | Small per-day |
| `skipped_too_old_coa` | Variable | Small per-day |
| `snowplow_applied_coa` | Elevated (years-stale `first_seen_at` CKAN seeds) | Tapers as E.2 fills in |
| `coa_forecasts_computed` | Climbs from 0 | Steady volume |
| `coa_skipped_audit_blocked` | 0 if gate is healthy | 0 |
| `coa_audit_gate_status` | `'no_prior_run'` (INFO) until first `compute_phase_calibration` permits-chain run, then `'pass'` | `'pass'` |
| `coa_anchor_fallback_pct` | ~100% (E.2 ramp); INFO status during 30-day quiet | Tracks lifecycle_transitions coverage |
| `coa_anchor_fallback_pct_quiet_period` | `1` (active) | `0` (inactive) |
| `coa_anchor_stale_lifecycle_transition_count` | Variable; INFO status during 30-day quiet | < 50% of totalRowsCoa |
| `lead_id_format_failed_count` | `0` (no format drift expected) | `0`; WARN if any rows fail format pre-validation |
| `coa_null_lifecycle_seq_count` | Variable while E.2 ramps (INFO); flips to WARN after quiet if > 0 | `0` post-quiet (E.2 writer healthy) |

## The 4 new `records_meta` distributions (7-day quiet)

- `forecasts_computed_permit` / `forecasts_computed_coa`
- `total_rows_permit` / `total_rows_coa`
- `anchor_sources_coa` (lifecycle_transition / decision_date / hearing_date / first_seen_at breakdown)
- `skipped_distribution_by_lifecycle_group` (C1 / C2 / C3 per-cohort breakdown)

## Operator annotation protocol

For the first 7 days post-F.1 deploy, append the following block to **both** `docs/reports/pipeline-observability/permits-followup.md` and `coa-followup.md` daily Observer narrative entries:

```markdown
> **[F.1 baseline-quiet-period — Day X of 7]**
> Phase F.1 deployed YYYY-MM-DD. Anomaly signals from these metrics are EXPECTED during baseline warmup and do not require action: stale_purged_permit/_coa, skipped_no_anchor_coa, skipped_too_old_coa, snowplow_applied_coa, coa_forecasts_computed, coa_audit_gate_status, coa_skipped_audit_blocked, forecasts_computed_permit/_coa, total_rows_permit/_coa, anchor_sources_coa, skipped_distribution_by_lifecycle_group.
> Spec 48 §3.4 7-day baseline math will produce stable signal from Day 8 onward.
```

For days 8–30, the **30-day extended quiet** applies to two metrics specifically. Annotate:

```markdown
> **[F.1 30-day quiet-period — Day X of 30]**
> coa_anchor_fallback_pct and coa_anchor_stale_lifecycle_transition_count remain in INFO classification (regardless of value) until Day 31 post-deploy. This is gated automatically by the in-script `inQuietPeriod` flag; operators do not need to suppress these manually. After Day 30, threshold-based WARN at ≥95% (fallback_pct) and >50% (stale_lifecycle_transition_count) activates.
```

## How `coaFirstDeployGrace` + `inQuietPeriod` decisions are made

Both flags are computed at script startup from a SINGLE query against `pipeline_runs`:

```sql
SELECT
  COUNT(*) FILTER (WHERE started_at < NOW() - INTERVAL '7 days')::int  AS prior_runs_7d,
  COUNT(*) FILTER (WHERE started_at < NOW() - INTERVAL '30 days')::int AS prior_runs_30d
FROM pipeline_runs
WHERE pipeline = 'permits:compute_trade_forecasts';
```

- `coaFirstDeployGrace = (prior_runs_7d === 0)` — TRUE during first 7 days post-deploy. Used to classify `coa_audit_gate_status = 'no_prior_run'` as INFO (cold-start) vs WARN (broken cron).
- `inQuietPeriod = (prior_runs_30d === 0)` — TRUE during first 30 days post-deploy. Used to suppress threshold-based WARN on `coa_anchor_fallback_pct` and `coa_anchor_stale_lifecycle_transition_count`.

If you set `OBSERVABILITY_ENABLED=0` or skip cron ticks during the quiet period, the counts above won't increment and the quiet period extends accordingly. This is intentional.

## Exit criteria

Operator removes the annotation block from daily Observer reports once **all** of these hold:

1. `prior_runs_7d > 0` (script has run for at least 7 days) — quiet period for the 9 short-window metrics ends naturally.
2. `prior_runs_30d > 0` (script has run for at least 30 days) — extended quiet for `coa_anchor_fallback_pct` + `coa_anchor_stale_lifecycle_transition_count` ends naturally; threshold-based WARN activates.
3. Spec 48 Observer's day-7 baseline math has produced at least one DeepSeek narrative entry for each of the 11 new metrics that reads as PASS or INFO (not a flagged anomaly).

After exit, retain this runbook for future F.2 / F.3 / F.4 deploys — the same annotation protocol applies to any subsequent phase that adds audit rows.

---

## Phase F.2 additions (v4 HIGH-M fold — `update-tracked-projects.js` CoA branch)

Phase F.2 (commit `66884af`) added the CoA branch to `update-tracked-projects.js`, introducing **7 new audit_table.rows metrics + 5 new records_meta distributions**. Same baseline-quiet-period protocol applies; runbook entries follow.

### The 7 new audit_table.rows metrics (7-day quiet, except as noted)

| metric | First 7 days expected behavior | Stable steady state |
|---|---|---|
| `coa_stall_alerts` | 0 (grace-suppression — `!coaFirstDeployGrace` gate blocks all 4 CoA alert pushes for the first 7 days) | Small daily delta as CoAs exceed status-keyed thresholds |
| `coa_recovery_alerts` | 0 (grace-suppressed) | Even smaller delta (recovery from stall is rarer than entering stall) |
| `coa_imminent_alerts` | 0 (grace-suppressed) | Daily volume scales with hearing pipeline (hearing 7 days out → fires once per (user, CoA, trade)) |
| `coa_decision_alerts` | 0 (grace-suppressed) | One-shot per (CoA, user, trade) on Approved decision; volume tracks variance approval rate |
| `coa_archived` | Threshold WARN if 100% of `totalRowsCoa` archived (kill-switch detector). On day 0 with small CoA backlog of all-terminal-decision CoAs, the WARN can fire legitimately — **check `records_meta.total_rows_coa`**: < 50 with all terminal-decision rows is data-driven correct, not a fault. | PASS when not 100% (typical: 0–20% per run, terminal-decision tail) |
| `coa_orphaned_lead_ids` | 0 expected; WARN if > 0 means `tracked_projects` row points to a missing `coa_applications` row (data-integrity issue, not a script fault) | 0 (clean steady state). Operator investigation: `SELECT tp.lead_id FROM tracked_projects tp LEFT JOIN coa_applications ca ON ca.lead_id = tp.lead_id WHERE tp.lead_id LIKE 'coa:%' AND ca.lead_id IS NULL;` |
| `in_quiet_period` | `1` (active — first 30 days) | `0` (inactive — day 31 onward) |

### The 5 new records_meta distributions

- `total_rows_permit` / `total_rows_coa` — per-branch breakdown of `records_total`
- `coa_first_deploy_grace` (boolean) + `in_quiet_period` (boolean) — operator visibility into both quiet-period gates
- `coa_alert_distribution_by_lifecycle_group` — `{C1, C2, C3, C4, unknown}` each with 5-field shape `{imminent, stalled, recovery, decision, archived}`. Any group's `archived` increments when a CoA in that group hits a terminal state (post-v3 CRIT-2 simplification, C4 is no longer the exclusive archive path). C2 archive on Refused decision is the most common pattern. **Orphan rows** (those counted in `coa_orphaned_lead_ids`) are excluded from this distribution — they hit `continue` before any cohort increment. The `unknown` slot (diff-stage fold) captures legitimate rows where `lifecycle_group IS NULL` (pre-Phase E.2 classification or data-quality outlier).
- `coa_notified_decision_rendered_count` — count of CoA rows where `notified_decision_rendered === true` AND decision is still in approved set. Used as the dedup-health audit. Monotonically non-decreasing after Day 30 in steady state; a sudden drop signals decision reversal (Approved → Refused on appeal) or a data correction.
- `coa_orphaned_lead_ids_sample_capped` (boolean) — `true` if `coa_orphaned_lead_ids > 20` (the `failed_sample` cap). Pairs with the audit row to tell the operator whether `failed_sample` is exhaustive or truncated.

### F.2-specific operator annotation protocol

Days 0–7: append to **both** `permits-followup.md` and `coa-followup.md`:

```markdown
> **[F.2 baseline-quiet-period — Day X of 7]**
> Phase F.2 deployed YYYY-MM-DD. Days 0–7: all 4 CoA alert counters (`coa_stall_alerts`, `coa_recovery_alerts`, `coa_imminent_alerts`, `coa_decision_alerts`) show 0 by design (grace-suppression via `!coaFirstDeployGrace` gate). Verify by checking `records_meta.coa_first_deploy_grace = true`. Day 8 onward, alert counts ramp.
```

Days 8–30 (30-day extended quiet-period for in_quiet_period only):

```markdown
> **[F.2 30-day quiet-period — Day X of 30]**
> `in_quiet_period: 1` flag is active. Operator-tunable threshold metrics (`coa_archived` WARN, `coa_orphaned_lead_ids` WARN) remain in WARN classification but the WARN is expected during initial CoA backlog characterization. Day 31 onward, persistent WARN signals are actionable.
```

### CoA-specific exit criteria additions

In addition to the F.1 exit criteria, an F.2-clean state also requires:

- `coa_orphaned_lead_ids` PASS for 7 consecutive runs (no data-integrity drift).
- `coa_archived` PASS for 7 consecutive runs (not stuck at 100% archive rate).
- `coa_alert_distribution_by_lifecycle_group` shows non-zero values in at least 2 cohort×metric cells (C1.imminent, C2.stalled, etc.) — proves the F.2 dispatch is exercising multiple code paths in production.

## Phase F.3 additions (v4 — `compute-opportunity-scores.js` lead_id rekey + CoA consumer)

Phase F.3 (commit `[F.3-COMMIT]`) re-keyed `compute-opportunity-scores.js` end-to-end on `lead_id` per Spec 81 §2.1, introducing **10 new audit_table.rows metrics + 16 new records_meta entries** in the F.3-pipeline scope. Same baseline-quiet-period protocol applies; runbook entries follow.

### The 10 new audit_table.rows metrics

| metric | First 7 days expected behavior | Stable steady state |
|---|---|---|
| `forecasts_in_scope_permit` | Daily count of permit-side forecasts processed (typically ~32 × distinct_permits) | Steady at production volume |
| `forecasts_in_scope_coa` | Day 0: may be 0 if F.1 hasn't classified CoA leads yet. Days 1-30: ramps as F.1 fills the table | Steady at production CoA volume |
| `total_rows_coa` | INFO (quiet-period). Day 31+: WARN if `=== 0` (signals F.1 didn't reach CoA scoring — wiring fault) | INFO with non-zero value |
| `coa_orphaned_cost_count` | INFO (quiet-period — R5.5 cohort ramp expected). Day 31+: WARN if `> 0` | PASS (0) |
| `permit_orphaned_cost_count` | INFO (quiet-period). Day 31+: WARN if `> 0` | PASS (0) |
| `lead_analytics_unmatched_permit_count` | INFO (quiet-period). Day 31+: WARN if `> 0` — possible F.2 / mig 132 trigger drift | PASS (0) |
| `lead_analytics_unmatched_coa_count` | INFO (quiet-period). Day 31+: WARN if `> 0` — symmetric defense-in-depth | PASS (0) |
| `coa_first_deploy_grace` | `1` (active — first 7 days) | `0` (inactive — day 8 onward) |
| `in_quiet_period` | `1` (active — first 30 days) | `0` (inactive — day 31 onward) |
| `malformed_lead_ids` | Should be 0; WARN immediately if `> 0` (corruption-class — mig-134 CHECK makes unreachable). NOT quiet-gated. | PASS (0) |

Plus 7 preserved audit rows (`records_scored`, `permits_in_scope_legacy_distinct_count` [renamed from `permits_in_scope` per CRIT-B dual-emit], `records_unchanged`, `null_input_rate`, `null_scores`, `null_input_scores`, `out_of_range`). **Total: 17 audit rows.**

### The 16 new records_meta entries

- `total_rows_permit` / `total_rows_coa` / `total_rows_other` — per-branch streamed-row tallies (records_total sums all three per Spec 47 §11.1).
- `records_updated_permit` / `records_updated_coa` — per-branch UPDATE rowCounts (accumulated AFTER `withTransaction` resolves for retry-safety).
- `null_input_scores_permit` / `_coa` — per-branch missing-cost-data counters.
- `integrity_flags_permit` / `_coa` — per-branch geometric-integrity audit counters.
- `score_distribution_permit` / `_coa` / `_other` — per-branch 5-tier maps. `_other` is defensive (mig-134 CHECK makes unreachable).
- `coa_orphaned_cost_sample_capped` / `permit_orphaned_cost_sample_capped` — booleans (true iff > 20 orphans).
- `lead_analytics_unmatched_permit_sample_capped` / `_coa_sample_capped` — booleans (true iff probe hit `LIMIT 50` cap).

Plus **4 preserved records_meta entries** carried forward from the existing skeleton: `coa_first_deploy_grace`, `in_quiet_period`, `run_at`, and aggregate `score_distribution` (back-compat with pre-F.3 consumers). **Total records_meta data keys: 20** (excluding the `audit_table` wrapper key, per F.1/F.2 convention). The regression-lock test `F.3-31` asserts this count.

### F.3-specific operator annotation protocol

Days 0–7: append to **`permits-followup.md`** (F.3 runs in permits chain step 26):

```markdown
> **[F.3 baseline-quiet-period — Day X of 7]**
> Phase F.3 deployed YYYY-MM-DD. `coa_first_deploy_grace: 1` is expected. WARN-gated metrics
> (`coa_orphaned_cost_count`, `permit_orphaned_cost_count`, both `lead_analytics_unmatched_*_count`,
> `total_rows_coa`) emit at INFO status; resume WARN classification on Day 31.
```

Days 8–30 (30-day quiet for `inQuietPeriod`):

```markdown
> **[F.3 30-day quiet-period — Day X of 30]**
> `in_quiet_period: 1` active. WARN-gated metrics remain INFO; R5.5 cohort-incremental
> cost-coverage ramp explains any `coa_orphaned_cost_count > 0`. Day 31 onward, persistent
> non-zero values are actionable.
```

### Operator FAQ

- **Q1: Why does `permits_in_scope_legacy_distinct_count` value not match `forecasts_in_scope_permit`?** Different semantics. Legacy = `COUNT(DISTINCT permit_num)` (distinct permits in scope). New = `COUNT(*) WHERE lead_id LIKE 'permit:%'` (forecast rows; typically ~32× larger — one row per (permit, trade) tuple). Both retained for one cycle (CRIT-v2-B dual-emit).
- **Q2: Day-0 `total_rows_coa = 0` — pathology?** Likely not. F.1's `compute_trade_forecasts` must have populated CoA `trade_forecasts` rows for F.3 to find them. If F.1 ran without CoA classifier output, zero is expected. By day 8, a sustained zero is a wiring fault — file WF3.
- **Q3: Quiet-period `coa_orphaned_cost_count > 0` — alert?** No. The status is INFO during the 30-day `inQuietPeriod`. R5.5's cohort-incremental cost-coverage ramp is the cause. Day 31 onward, the same value flips to WARN — file WF3 if it persists.
- **Q4: Day 31, five WARN-gated metrics activated simultaneously — incident?** No. The 30-day `inQuietPeriod` gate flipped from `true` to `false`; status reclassification (INFO → WARN) is by-design for exactly **5 metrics**: `coa_orphaned_cost_count`, `permit_orphaned_cost_count`, `lead_analytics_unmatched_permit_count`, `lead_analytics_unmatched_coa_count`, and `total_rows_coa`. Underlying values may have been steady-state for days; only the threshold-classification changed. Investigate only if values change in subsequent days.
- **Q5: `records_total ≠ total_rows_permit + total_rows_coa` — bug?** No. `records_total` includes `total_rows_other` (malformed-prefix rows). The 2-term sum is off by `total_rows_other` (expected to be 0 post-mig-134 CHECK; if non-zero, also check `malformed_lead_ids` audit row).
- **Q6: `total_rows_coa` (audit row, stream-time counter) differs from `forecasts_in_scope_coa` (SQL post-UPDATE count) — bug?** No. The audit row uses the stream-time counter (rows processed at scoring time); `forecasts_in_scope_coa` is the post-UPDATE table snapshot. Mid-run inserts/expires can produce a small divergence — normal under concurrent chain operations.

### CoA-specific exit criteria additions

In addition to F.1/F.2 exit criteria, an F.3-clean state also requires:

- `coa_orphaned_cost_count` PASS for 7 consecutive runs post-Day-31 (no R5.5 ramp regressions).
- `lead_analytics_unmatched_permit_count` + `lead_analytics_unmatched_coa_count` PASS for 7 consecutive runs (mig 132 trigger + F.2 UNION integrity intact).
- `total_rows_coa > 0` for 7 consecutive runs (proves F.1 CoA forecasts flow into F.3 scoring).
- `score_distribution_coa` shows non-zero counts in at least 2 tiers (CoA leads are scoring across the dynamic range, not bunched at `no_cost_data`).
- `malformed_lead_ids === 0` ALWAYS (mig-134 CHECK invariant; any non-zero is data-corruption — immediate WF3).

