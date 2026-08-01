# `permit_scrape_outcomes` First-Deploy Spike Runbook (Spec 48 §3.7)

**Owning spec:** `docs/specs/01-pipeline/44_chain_deep_scrapes.md` §3 (Scrape-Outcome Persistence Contract) + `48_pipeline_observability.md` §3.7
**Deploy event:** WF2 2026-07-31 (`.cursor/wf2_scrape_outcome_persistence_v2.md`) — migrations 236/237 + the OutcomeWriter in `aic-scraper-nodriver.py`
**Owner:** Operator on shift during the first 7 days of scheduled deep-scrapes runs after cloud apply

---

## Why this runbook exists

The deep-scrapes chain gains a new Tier-3 ledger writer: every attempted permit now appends
one or more rows to `permit_scrape_outcomes` (outcome, sanitized detail, transport, run_id).
Before this deploy the table does not exist, so observe-chain's 7-day DeepSeek narrative
baseline contains none of the new audit metrics and may flag the first runs as `CRITICAL`
or `HIGH`. This runbook is the pre-ack instrument so the first-deploy shape is not conflated
with a real anomaly.

## Expected first-run shape

Unlike the lifecycle-history Day-1 backfill spike, this writer has **no backfill**: rows
appear only as permits are scraped. The expected shape is therefore a **step change, not a
spike**:

| Metric (orchestrator audit table) | First 7 days | Steady state |
|---|---|---|
| `outcome_write_failures` | `0` on every run. **Any non-zero value is NOT first-deploy noise** — WARN means some ledger writes were swallowed (scrape unaffected); FAIL (`failures >= attempted` with `attempted > 0`) means the ledger is silently dead. Investigate immediately, do not annotate away. | `0` |
| `outcome_resolution_failures` | Small non-zero counts possible: a queued `year_seq` whose permits left the eligible `TARGET_TYPES`/status population resolves to zero rows and lands with `permit_num NULL`. A LARGE count (a significant fraction of attempted) means the resolution query and `populate_queue` have drifted apart. | Near `0` |
| `scrape_outcome_breakdown` (INFO) | Mix dominated by `scraped` / `no_stages` / `no_inspection_link` on a healthy run. `waf_blocked` and `transport_error` rows appear per failed ATTEMPT (up to `SCRAPER_MAX_RETRIES` per permit plus one `retry_exhausted`), so failure counts can exceed permit counts by design. | Same |
| Ledger row volume | Roughly `permits_attempted` rows per run plus failure-attempt rows. Eligible population ~11.6K permits; worst case (re-queue-forever defect live) ~605K rows/yr; 90-day steady state ~150K raw rows. | Pruned daily at 08:00 UTC |

## Pre-deploy capacity query

```sql
-- Eligible-population ceiling for a single full pass (the 3 ALL_TARGET_TYPES):
SELECT COUNT(DISTINCT SUBSTRING(p.permit_num FROM '^[0-9]{2} [0-9]+')) AS eligible_year_seqs,
       COUNT(DISTINCT p.permit_num) AS eligible_permits
  FROM permits p
 WHERE p.status = 'Inspection'
   AND p.permit_type = ANY(ARRAY['Small Residential Projects',
                                 'Building Additions/Alterations',
                                 'New Houses']);
```

## Convergence verification query

After the first week of scheduled runs:

```sql
SELECT outcome, transport, COUNT(*) AS rows_last_7_days,
       COUNT(*) FILTER (WHERE permit_num IS NULL) AS unresolved
  FROM permit_scrape_outcomes
 WHERE observed_at > NOW() - INTERVAL '7 days'
 GROUP BY outcome, transport
 ORDER BY outcome, transport;
```

Expected: every outcome value present is one of the 8 contracted values; `transport` matches
the workflow's `SCRAPER_TRANSPORT`; `unresolved` is near zero. To diagnose one permit:

```sql
SELECT observed_at, outcome, detail, transport, run_id
  FROM permit_scrape_outcomes
 WHERE permit_num = '<permit_num>'
 ORDER BY observed_at DESC LIMIT 20;
```

## Prune verification (Day 90+ but check wiring on Day 1)

```sql
-- The pg_cron job exists (cloud/local-Supabase only):
SELECT jobname, schedule FROM cron.job WHERE jobname = 'permit_scrape_outcomes_prune';
-- The prune leaves a durable summary row per run:
SELECT started_at, status, records_meta FROM pipeline_runs
 WHERE pipeline = 'scrape_outcome_prune' ORDER BY started_at DESC LIMIT 7;
```

Before Day 90 the prune legitimately reports `pruned_count = 0` every day — that is the
correct no-op, not a fault. A `status = 'failed'` row is a fault at any age.

## Operator annotation protocol

For the first 7 days of scheduled runs post-deploy, append to the daily observe-chain
narrative entries (`docs/reports/pipeline-observability/` followups):

```markdown
> **[permit_scrape_outcomes first-deploy — Day X of 7]**
> Scrape-outcome persistence deployed YYYY-MM-DD (migrations 236/237). New audit
> rows (outcome_write_failures / outcome_resolution_failures / scrape_outcome_breakdown)
> and permit_scrape_outcomes row volume have no 7-day baseline yet. Expected
> first-deploy behavior; Spec 48 §3.7 baseline math produces stable signal from Day 8.
> NOT covered by this annotation: any non-zero outcome_write_failures.
```

These annotations are for human readers; observe-chain does not read the followup files
and will keep flagging until its own baseline fills (same caveat as `I1_first_deploy_spike.md`).

## Exit criteria

1. observe-chain's narrative no longer flags the new metrics in 7 consecutive runs.
2. `outcome_write_failures` has been `0` for every run in the window.
3. The convergence query shows only contracted outcome values and near-zero `unresolved`.
4. `pipeline_runs` shows a daily `scrape_outcome_prune` `completed` row (0-pruned is fine).

After exit, retain this runbook — the same protocol applies to any future Tier-3 ledger
writer (Spec 48 §3.7 mandatory artifacts).
