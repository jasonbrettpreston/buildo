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
