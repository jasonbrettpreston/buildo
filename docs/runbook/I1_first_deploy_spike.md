# Phase I.1 — `lifecycle_status_history` First-Deploy Spike Runbook

**Owning spec:** `docs/specs/01-pipeline/42_chain_coa.md` §6.11 Phase I + `48_pipeline_observability.md` §3.7
**Active task:** `.cursor/active_task.md` (Phase I.1.1a v2 PLAN LOCKED 2026-05-18); ships closure docs for Phase I.1 (commit `d579bc0`)
**Owner:** Operator on shift during first 7 days post-deploy

---

## Why this runbook exists

Phase I.1 (commit `d579bc0`) ships `lifecycle_status_history` ledger writes from three pipeline scripts:

- `scripts/load-permits.js` — emits a ledger row when `permits.status` changes between CKAN syncs
- `scripts/load-coa.js` — emits a ledger row when `coa_applications.status` changes between syncs (decision-only changes do NOT fire — see Q1 in commit `d579bc0`)
- `scripts/classify-lifecycle-phase.js` — CoA-side ACTIVE: emits a ledger row when `coa_applications.matched_status` changes from the prior classifier run. **Permit-side ACTIVE as of Phase I.1.1b (commit `[I.1.1b-COMMIT]`):** `classifyLifecyclePhase()` extended to return `matchedStatus` per Spec 84 §3.7 18-rule contract; dirty SELECT predicate adds `OR matched_rule IS NULL` so existing classified permits backfill on first I.1.1b run.

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
| `classify-lifecycle-phase.js` (permit-side) | classify-lifecycle-phase.js | **ACTIVE as of Phase I.1.1b (commit `[I.1.1b-COMMIT]`).** **Day 1 spike: 230K-245K rows** (per Spec 84 §2.5.a row counts: ~247K permits with non-null status — only rule 1 status-null and a tiny `'Notice Sent'` catchall slice are excluded; everything else emits a ledger row). Day 2+: converges to ~500–2000 rows/day. The `permitFirstDeployGrace` flag softens `permit_unmapped_status_count` from WARN to INFO during the first 7 days. | ~500–2000 rows/day after Day-7 convergence |
| `lifecycle_status_history_errors` | All three scripts | Should be `0` always | `0`. Non-zero indicates SAVEPOINT WARN path fired — ledger INSERT failed, primary UPSERT survived (Spec 47 §7.8). Operators MUST investigate. |

## Pre-deploy capacity query (NOT a behavioral estimate)

The query below returns an **absolute ceiling** for capacity planning of the WAL spike on
the first chain run after deploy. For load-permits / load-coa it is NOT a realistic count
of rows that will emit — those scripts only emit when CKAN status differs from the
persisted status. For the Phase I.1.1b permit-classifier writer it is nearly the realistic
count — every classified permit with a non-null status will get matched_status populated
for the first time on Day 1 (catchall + null statuses excluded).

```sql
-- WAL CAPACITY CEILING — the maximum possible number of lifecycle_status_history
-- inserts on first run. For load-permits / load-coa: 1-3 orders of magnitude smaller
-- in practice. For Phase I.1.1b classifier permit-side: realistic estimate is 95-98%
-- of this number (only catchall rule 15 + null-status rule 1 don't emit ledger rows).
SELECT (SELECT COUNT(*) FROM permits           WHERE status IS NOT NULL)
     + (SELECT COUNT(*) FROM coa_applications  WHERE status IS NOT NULL)
  AS wal_capacity_ceiling;

-- Phase I.1.1b — permit-classifier-specific ceiling (Day 1 spike estimate).
-- Catchall (rule 15 → matchedStatus = raw unmapped status) DOES emit a ledger row,
-- so the only exclusion is null status. This query approximates the Day 1 spike count
-- contributed by classify-lifecycle-phase.js (permit-side) alone.
SELECT COUNT(*) AS permit_classifier_day1_ceiling
  FROM permits WHERE status IS NOT NULL;
```

**Why load-permits / load-coa have no "realistic" estimate query:** a pre-deploy SQL query
cannot predict the status-delta the CKAN fetch will surface. The operationally meaningful
number is **measured on Day 1** by reading the actual
`audit_table.rows[lifecycle_status_history_inserted].value` from `pipeline_runs` after the
first chain run completes. Record that as the steady-state baseline.

**The Phase I.1.1b classifier permit-side Day 1 spike IS predictable** — see the second
query above. Operators record this number pre-deploy and confirm Day 1 actuals are within
± 5% of it.

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
`classify-lifecycle-phase.js`). The classifier's row count combines CoA-side AND
permit-side writes (Phase I.1.1b active). Day 7 row counts become the steady-state
baseline going forward — typical `classify-lifecycle-phase.js` per-day rate after
convergence is ~500–2000 rows (permit-side CKAN status churn + CoA-side matched_status
re-derivation combined).

## Exit criteria

Operator removes the annotation block from daily Observer reports once **all** of these hold:

1. observe-chain's DeepSeek narrative no longer flags `lifecycle_status_history` first-deploy in 7 consecutive runs.
2. Per-writer 7-day row counts in the convergence query align with the steady-state column in the metrics table.
3. `lifecycle_status_history_errors` has been `0` for every run during the quiet period (SAVEPOINT path never fired).

After exit, retain this runbook — same first-deploy-spike protocol applies to any future
WF that adds a Tier 3 ledger writer (per Spec 48 §3.7 mandatory artifacts).

---

## Phase I.1.1b — permit classifier matchedStatus activation (2026-05-18)

**Deploy event:** `classifyLifecyclePhase()` extended to return `{phase, stalled, matchedStatus, matchedRule, unmappedStatus}` per Spec 84 §3.7. Permit-side classifier ledger writer flips from DORMANT → ACTIVE.

**Day 1 spike:** ~230K-245K rows (the realistic permit-classifier ceiling above — Spec 84 §2.5.a sum). The `OR matched_rule IS NULL` clause added to the dirty SELECT triggers a one-time backfill across every existing classified permit.

**Day-1 operator annotation block** (append to permits-followup.md):

```markdown
> **[Phase I.1.1b first-deploy spike — Day 1]**
> Phase I.1.1b deployed YYYY-MM-DD. classify-lifecycle-phase.js permit-side
> lifecycle_status_history_inserted spiked to N rows (recorded permit_classifier_day1_ceiling
> = M). Expected first-deploy spike — within pre-deploy bound — no investigation needed.
> permit_first_deploy_grace = 1 active for 7 days — permit_unmapped_status_count
> reported as INFO regardless of value during this window.
```

**Day 7 exit criteria additions:**
- `permitFirstDeployGrace` flag flips to 0 automatically (7 consecutive runs with `permit_classifier_extended: 'true'` emit_meta sentinel).
- `permit_unmapped_status_count` audit row activates WARN-grade threshold (`computeWarnableAuditStatus(value, { passAt: 1, warnAt: 3 })`).
- `permit_code_drift_count` continues as INFO-only (Spec 84 §2.5.a rows 6/7/10 documented drift — surface count tracks drift-correction WF3 progress when that ships).

**Steady-state monitoring** (Day 8+):
- `permit_rule_distribution` in `records_meta` shows per-rule hit counts (rules 0..15). Watch for rule 15 (catchall) spikes — indicates CKAN introduced a new unmapped status.
- `permit_matched_status_top20` shows top-20 raw statuses + Other rollup. Anomaly: a previously-unseen status appearing in top-20 = CKAN drift.
