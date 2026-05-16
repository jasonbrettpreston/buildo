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

Phase F.2 (commit `[F.2-COMMIT]`) added the CoA branch to `update-tracked-projects.js`, introducing **7 new audit_table.rows metrics + 5 new records_meta distributions**. Same baseline-quiet-period protocol applies; runbook entries follow.

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

