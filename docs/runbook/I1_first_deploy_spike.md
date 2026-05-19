# Phase I.1 — `lifecycle_status_history` First-Deploy Spike Runbook

**Owning spec:** `docs/specs/01-pipeline/42_chain_coa.md` §6.11 Phase I + `48_pipeline_observability.md` §3.7
**Active task:** `.cursor/active_task.md` (Phase I.1.1a v2 PLAN LOCKED 2026-05-18); ships closure docs for Phase I.1 (commit `d579bc0`)
**Owner:** Operator on shift during first 7 days post-deploy

---

## Why this runbook exists

Phase I.1 (commit `d579bc0`) ships `lifecycle_status_history` ledger writes from three pipeline scripts:

- `scripts/load-permits.js` — emits a ledger row when `permits.status` changes between CKAN syncs
- `scripts/load-coa.js` — emits a ledger row when `coa_applications.status` changes between syncs (decision-only changes do NOT fire — see Q1 in commit `d579bc0`)
- `scripts/classify-lifecycle-phase.js` — CoA-side ACTIVE: emits a ledger row when `coa_applications.matched_status` changes from the prior classifier run. Permit-side DORMANT (filter `r.matched_status != null` excludes every row because the permit classifier returns only `{phase, stalled}` — algorithm extension deferred to Phase I.1.1b).

The **first chain run after deploy** produces a one-time spike in `lifecycle_status_history_inserted` from each of the three writers because none have written a ledger row before. observe-chain.js's 7-day DeepSeek narrative baseline does not yet contain the metric, so the narrative may flag the spike as `CRITICAL` or `HIGH`.

This runbook is the operator's pre-ack instrument so the spike doesn't get conflated with a real ledger-pathway anomaly.

## Metrics emitted by Phase I.1

The three writers populate ONE pair of audit counters per script
(`lifecycle_status_history_inserted` INFO + `lifecycle_status_history_errors` WARN-gated).
`classify-lifecycle-phase.js` runs both CoA-side and permit-side flush paths inside the
same script, so its counters cover both streams combined.

| detected_by | Script | First 7 days expected behavior | Steady state |
|---|---|---|---|
| `load-permits.js` | load-permits.js | First run: rows emitted only when CKAN `status` differs from persisted `permits.status`. NEW permits (no prior row) also emit (`from_status=NULL`). Most rows on a healthy DB are already in-sync, so the actual delta is much smaller than the conservative ceiling below. | Daily delta tracks Toronto open-data CKAN status churn; calibrate from Day 7 observation. |
| `load-coa.js` | load-coa.js | Same shape as load-permits — fires on `coa_applications.status` change. Decision-only changes do NOT fire (Q1 commit `d579bc0`). | Calibrate from Day 7. |
| `classify-lifecycle-phase.js` (CoA-side) | classify-lifecycle-phase.js | **ACTIVE.** Emits when `coa_applications.matched_status` changes between classifier runs. Post-E.2 most CoAs already have matched_status populated, so first-run delta is small unless E.2 hasn't run yet. | Calibrate from Day 7. |
| `classify-lifecycle-phase.js` (permit-side) | classify-lifecycle-phase.js | **DORMANT.** Filter `r.matched_status != null && r.matched_status !== r.old_matched_status` excludes every permit row because `classifyLifecyclePhase` returns only `{phase, stalled}` — no `matchedStatus` key. Phase I.1.1b (future WF) extends Spec 84 to produce `matchedStatus`; until then this row count stays at 0. | 0 until Phase I.1.1b. |
| `lifecycle_status_history_errors` | All three scripts | Should be `0` always | `0`. Non-zero indicates SAVEPOINT WARN path fired — ledger INSERT failed, primary UPSERT survived (Spec 47 §7.8). Operators MUST investigate. |

## Pre-deploy capacity query (NOT a behavioral estimate)

The query below returns an **absolute ceiling** for capacity planning of the WAL spike on
the first chain run after deploy. It is NOT a realistic count of rows that will emit —
load-permits.js and load-coa.js only emit when the CKAN status differs from the persisted
status, and that delta is impossible to know pre-deploy without executing the CKAN fetch.

```sql
-- WAL CAPACITY CEILING — the maximum possible number of lifecycle_status_history
-- inserts on first run. Real number will be 1-3 orders of magnitude smaller.
-- Use this only to verify the DB has room for the spike under worst-case load.
SELECT (SELECT COUNT(*) FROM permits           WHERE status IS NOT NULL)
     + (SELECT COUNT(*) FROM coa_applications  WHERE status IS NOT NULL)
  AS wal_capacity_ceiling;
```

**Why no "realistic" estimate query:** a pre-deploy SQL query cannot predict the
status-delta the CKAN fetch will surface. The operationally meaningful number is
**measured on Day 1** by reading the actual `audit_table.rows[lifecycle_status_history_inserted].value`
from `pipeline_runs` after the first chain run completes. Record that as the steady-state
baseline.

## Operator annotation protocol

For the first 7 days post-Phase-I.1 deploy, append the following block to the daily
observe-chain narrative entries (`docs/reports/pipeline-observability/permits-followup.md`
and `coa-followup.md`):

```markdown
> **[Phase I.1 first-deploy spike — Day X of 7]**
> Phase I.1 deployed YYYY-MM-DD. lifecycle_status_history_inserted from
> load-permits.js, load-coa.js, and classify-lifecycle-phase.js (CoA-side)
> may show values up to wal_capacity_ceiling=N (recorded Day 0). Expected
> first-deploy behavior — within pre-deploy bound — no investigation needed.
> Spec 48 §3.7 7-day baseline math will produce stable signal from Day 8 onward.
```

**Annotation visibility (diff-stage Observability HIGH fold):** these annotations are for
**human readers** of the followup markdown files. They do NOT suppress DeepSeek's narrative
generation in `observe-chain.js` — the script writes to but does not read the followup
files. Until/unless `observe-chain.js` is extended to pass operator annotations into its
system prompt, DeepSeek will continue to flag the spike as anomalous for 7 days regardless.
Operators reading the daily report use the annotation block to identify expected
first-deploy noise; on-call escalation should reference this runbook by name.

If `lifecycle_status_history_errors` is **non-zero** on any day, this is NOT the spike —
that's a SAVEPOINT-path fault. Do not suppress; investigate per the standard pipeline
observability triage flow.

## Convergence verification query

On day 7 post-deploy, operator runs:

```sql
SELECT detected_by, COUNT(*) AS rows_last_7_days
  FROM lifecycle_status_history
 WHERE transitioned_at > NOW() - INTERVAL '7 days'
 GROUP BY detected_by
 ORDER BY detected_by;
```

Expected output: three `detected_by` values (`load-permits.js`, `load-coa.js`,
`classify-lifecycle-phase.js`). The classifier's row count reflects CoA-side writes only;
permit-side rows expected ≈ 0 until Phase I.1.1b ships. Use Day 7 row counts as the
steady-state baseline going forward (no pre-deploy estimate is operationally meaningful
— see "Pre-deploy capacity query" above).

## Exit criteria

Operator removes the annotation block from daily Observer reports once **all** of these hold:

1. observe-chain's DeepSeek narrative no longer flags `lifecycle_status_history` first-deploy in 7 consecutive runs.
2. Per-writer 7-day row counts in the convergence query align with the steady-state column in the metrics table.
3. `lifecycle_status_history_errors` has been `0` for every run during the quiet period (SAVEPOINT path never fired).

After exit, retain this runbook for Phase I.1.1b deploy — same first-deploy-spike protocol applies when the permit-side classifier writer activates.
