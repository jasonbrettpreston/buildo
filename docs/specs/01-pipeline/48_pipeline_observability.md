# Pipeline Observability Agent

<requirements>
## 1. Goal & User Story

As a developer, after any pipeline chain completes, I want an AI agent to automatically read the run's warnings and failures alongside the 7-day historical baseline, then append a structured findings report — so I can identify regressions, anomalies, and critical issues without manually diffing `pipeline_runs` records.
</requirements>

> **EXECUTION-MODEL SPLIT (2026-07-29):** the `observe-chain.js` path this spec describes
> (run-chain.js detached-spawn → DeepSeek analysis → report file append) is
> **LOCAL-OPERATOR-ONLY**. On GitHub Actions (Spec 115, the production scheduler) it
> produces nothing: no chain workflow env carries `DEEPSEEK_API_KEY`, the detached child is
> reaped at job teardown, and the report file lands on the ephemeral runner filesystem with
> no artifact upload. Production chain-health observability is instead the
> `check-chain-verdict.js` step in every chain workflow (gates the run RED on a
> verdict-only FAIL that run-chain.js exits 0 on; since 2026-08-03 it passes only on the
> green allowlist `completed`/`completed_with_warnings` — Spec 115 §2.4) + GitHub
> notification alerting, and the
> admin dispatch surface of Spec 115 §7a. OPEN DECISION (not ruled): keep observe-chain
> local-only, or make it real on CI (DEEPSEEK secret + synchronous run + upload-artifact) —
> a future WF2.

---

<architecture>
## 2. System Overview

### 2.1 Component Topology

```
run-chain.js (after chain lock released, before pool.end)
       │
       └── spawn detached  →  scripts/observe-chain.js
                                       │
                                       ├── pipeline_runs (current run + 7-day history)
                                       │
                                       ├── pg_stat_statements (optional — top 10 slow queries)
                                       │
                                       ├── openai → DeepSeek API (deepseek-chat)
                                       │
                                       └── docs/reports/pipeline-observability/
                                               review-database-followup.md
```

### 2.2 Archetype

`observe-chain.js` is an **Observer** (spec 30 §2.1) — it reads existing `pipeline_runs` rows only. It does NOT mutate any business tables. It writes only to the local filesystem.

### 2.3 Advisory Lock

Base lock constant `ADVISORY_LOCK_ID = 113` (assigned sequentially per §A.5 Bundle G; original spec ID was 112 but changed to 113 in B1 fix to resolve collision with `backup-db.js`).

**Chain-scoped effective lock IDs:** To allow concurrent observations across different chains, the script computes `effectiveLockId = 113 * 100 + chainOffset` (permits→11300, coa→11301, sources→11302, etc.). Different chains acquire different lock IDs and run in parallel; only concurrent invocations for the *same* chain serialise. If a chain-scoped lock is held, the script emits PIPELINE_SUMMARY with `records_meta.skipped = true` and exits 0.

### 2.4 Trigger

Spawned as a detached fire-and-forget child process by `run-chain.js` immediately after the chain advisory lock is released, before `pool.end()`. The parent does NOT wait for it — the chain exit code is independent of the observer.

CLI contract:
```
node scripts/observe-chain.js <chain_id> <run_id>
```

Guard: only spawned when `OBSERVABILITY_ENABLED !== '0'`.

**Required environment variable:** `DEEPSEEK_API_KEY` — DeepSeek API key. If absent, the script
logs a warning and writes a placeholder to the report; the rest of the observability chain continues
unaffected. Set in `.env` as `DEEPSEEK_API_KEY=sk-...`.
</architecture>

---

<behavior>
## 3. Behavioral Contract

### 3.1 DB Reads

Primary source — `pipeline_runs`:

| Query | Purpose |
|-------|---------|
| Steps for the completed run: `WHERE pipeline LIKE '{chain_id}:%' AND started_at >= (SELECT started_at FROM pipeline_runs WHERE id = $run_id)` | Current run step verdicts + audit_table rows |
| Chain-level row: `WHERE id = $run_id` | Chain status, duration, total records |
| 7-day historical baseline: same step slugs, `started_at >= NOW() - INTERVAL '7 days'`, `id < $run_id` | Velocity/duration/verdict baselines for anomaly detection |

Optional source — `pg_stat_statements` (requires `migrations/110_pg_stat_statements.sql`):

```sql
SELECT LEFT(query, 200) AS query_snippet, calls,
       ROUND(mean_exec_time::numeric, 2) AS mean_exec_time_ms,
       ROUND(total_exec_time::numeric, 2) AS total_exec_time_ms,
       ROUND(stddev_exec_time::numeric, 2) AS stddev_exec_time_ms, rows
FROM pg_stat_statements
WHERE query NOT ILIKE '%pg_stat_statements%' AND mean_exec_time > 0
ORDER BY mean_exec_time DESC LIMIT 10
```

This query is wrapped in a `try/catch`. If `pg_stat_statements` is not installed (extension
missing or `permission denied`), the error is caught, a warning is logged, and `slow_queries`
is set to `null` — the rest of the observability chain continues unaffected.

All queries are bounded (≤200 rows). No streaming needed. No business table access.

### 3.2 DeepSeek API Call

- SDK: `openai` package (`require('openai')`) with `baseURL: 'https://api.deepseek.com'`
- Model: `deepseek-chat` (V3 — fast operational analysis; `deepseek-reasoner` is reserved for adversarial code review via `scripts/deepseek-review.js`)
- Auth: `DEEPSEEK_API_KEY` env var — gracefully skipped if absent
- Context includes: formatted current run data (step verdicts, WARN/FAIL metrics, `failed_sample` arrays when present), 7-day historical velocity/duration averages per step, and `slow_queries` table from `pg_stat_statements` when available
- Prompt instructs the model to: identify anomalies vs baseline, flag slow queries >100ms mean, classify issues by severity (CRITICAL/HIGH/INFO), suggest WF3 prompts for CRITICAL issues
- Timeout: 30 seconds via `OpenAI({ timeout: API_TIMEOUT_MS })` constructor option
- Gracefully degraded: if API unavailable or key absent, writes placeholder to report

### 3.3 Output Format

Appended section in `docs/reports/pipeline-observability/{chain_id}-followup.md` (one file per chain, e.g. `permits-followup.md`; prevents interleaving writes when concurrent chain observations run after the G2 chain-scoped lock fix):

```markdown
## [chain_id] — YYYY-MM-DD HH:MM UTC  (run_id: NNN)

### Summary
[1-2 sentence chain health summary]

### Step Verdicts
| Step | Status | Duration | Records | vs Baseline |
|------|--------|----------|---------|-------------|
| ...  | PASS   | 4.2s     | 12,500  | +2% (normal) |

### Anomalies & Warnings
- [WARN] step_name: metric description

### Critical Issues — WF3 Prompts
> **WF3** [issue description]. Repro: [how to reproduce]. Expected: [correct behavior].

---
```

If no anomalies detected: writes a brief "CLEAN" summary section only.

### 3.4 Error Handling

All logic wrapped in a single top-level try-catch. On any failure (DB query error, Claude API timeout, file write error): log `pipeline.log.warn('[observe-chain]', ...)` and exit 0. The observer NEVER propagates errors to the parent chain run.

### 3.5 PIPELINE_SUMMARY Emission

Emitted once per run (per spec 47 §R10). Observer pattern:

```json
{
  "records_total": 0,
  "records_new": null,
  "records_updated": null,
  "records_meta": {
    "audit_table": {
      "phase": 0,
      "name": "Observability Agent",
      "verdict": "PASS",
      "rows": [{ "metric": "sys_duration_ms", "value": N, "threshold": null, "status": "INFO" }]
    }
  }
}
```

### 3.6 audit_table dual-pattern for ledger writers _(NEW 2026-05-18 — Phase I.1 fold)_

Scripts that write to a Tier 3 audit ledger (per Spec 47 §7.8) — currently
`load-permits.js`, `load-coa.js`, `classify-lifecycle-phase.js`, all writing to
`lifecycle_status_history` — MUST emit a **pair** of `audit_table.rows` entries:

| Row | Metric | Status | Purpose |
|-----|--------|--------|---------|
| INFO counter | `lifecycle_status_history_inserted` (or analogous) | `INFO` | Always emitted, **even at value=0**. The zero-row emission is the steady-state signal — its absence means the ledger pathway is broken. |
| WARN-grade error gate | `lifecycle_status_history_errors` (or analogous) | `INFO` if value=0; `WARN` if value>0 | Increments on SAVEPOINT ROLLBACK (Spec 47 §7.8). Primary write survived; ledger write failed. Operators MUST investigate. |

**Verdict derivation:** MUST use Spec 47 §8.2's row-derived cascade
(`rows.some(r => r.status === 'FAIL') ? 'FAIL' : rows.some(r => r.status === 'WARN') ? 'WARN' : 'PASS'`).
Parallel-boolean verdicts (`hasFails ? 'FAIL' : 'PASS'`) **collapse the WARN signal**
and are forbidden for any script emitting WARN-grade rows. Phase I.1's `load-permits.js`
fix swapping the boolean for the cascade is the canonical example.

**Zero-row emission preservation:** when no ledger writes happened this run (steady state),
the INFO counter still emits as `value: 0`. Removing the row when value is zero is a
common observability anti-pattern — it makes "ledger pathway healthy with no work" and
"ledger pathway broken" indistinguishable.

### 3.7 First-deploy spike pattern for new ledger writers _(NEW 2026-05-18 — Phase I.1 fold)_

When a new Tier 3 ledger writer ships, the **first chain run after deploy** produces a
one-time spike in the INFO counter because no prior writes exist. observe-chain.js's
7-day DeepSeek narrative baseline doesn't yet contain the new metric, so the narrative
may flag the spike as `CRITICAL`/`HIGH`.

**Mandatory artifacts for any WF shipping a new ledger writer:**

1. **Operator runbook** (NEW under `docs/runbook/`) describing the expected spike
   shape, pre-deploy estimate query, and 7-day convergence verification query.
   Mirrors the unnumbered-section format of `docs/runbook/F1_baseline_quiet_period.md`.
2. **Pre-ack instrument** referenced from the runbook so the operator can annotate the
   followup markdown reports with "Expected first-deploy spike — within pre-deploy bound."
   **Annotations are for human readers only** — observe-chain.js writes followup files but
   does not read them; DeepSeek will continue to flag the spike for the duration of the
   quiet window. Until observe-chain.js is extended to ingest operator annotations into
   the system prompt, the annotation block serves on-call escalation, not narrative
   suppression.
3. **Exit criteria** documented for when the spike has converged to steady state
   (typically 7 consecutive runs without the metric appearing in the narrative).

Phase I.1's `lifecycle_status_history` deploy is the canonical example — see
`docs/runbook/I1_first_deploy_spike.md`.

**Inverse case — a regularly-REDUCED step (WF2 P11-1 fold).** The mirror of a spike:
`enrich_centreline` now runs a version-skip gate (Spec 62 §3.11), so on an unchanged
quarterly source its `records_updated` reads `0`/`N` instead of ~472K, and its audit set
shrinks to the reduced `enrich_centreline_mode` / `skip_reason` rows. This is the designed
steady state, NOT a coverage regression or a stalled step — the DeepSeek narrative may flag
the drop for the quiet window. Pre-ack: a reduced/skip run still emits a `completed` row with
a fresh `completed_at` and preserves the ~97% `centreline_dataset_version_when_enriched`
coverage, so `assertCentrelineEnriched` stays green; a genuine regression would instead show
a `failed`/absent run or coverage below `centreline_propagation_coverage_min`.

### 3.8 Per-step observability validation _(NEW 2026-05-19 — Spec 79 fold)_

Per-step §3.6 dual-pattern + §3.7 first-deploy spike compliance is validated per Spec 79 §2 checklist items C2, C3, C4, C6 plus C12 tripwires (per-risk-class profile per Spec 79 §10). Validation records under `docs/reports/pipeline-validation/{permits,coa}/` show actual `pipeline_runs.records_meta` JSON and audit_table.rows shape — never asserted compliance without the actual JSON.

### 3.9 `records_meta.step_completeness` — producer/consumer contract _(NEW 2026-08-14 — Phase B B2 + C5, ONE combined commit)_

**Shape:** `records_meta.step_completeness = {expected, executed, died_at, skipped_gate,
skipped_budget, deferred_at}`, written by `run-chain.js` onto the CHAIN-level `pipeline_runs`
row (the existing `budget_stopped` jsonb-merge shape is the precedent — no schema change).

| Field | Meaning | Decision-relevant? |
|---|---|---|
| `expected` | The manifest's step slug list for this chain, in declared order | Yes — paired with `died_at` |
| `executed` | Step slugs that actually got a `pipeline_runs` row this run | Informational only |
| `died_at` | `wasCancelled ? null : failedStep` — the slug a genuine step FAILURE stopped at, or `null` | Yes — the only failure signal this field carries |
| `skipped_gate` | Step slugs skipped by gate-skip (§3.2 of Spec 40, primary ingest had 0 new records) | Informational only |
| `skipped_budget` | Step slugs left with no row because the soft time-budget stopped the chain (Spec 115 §2.2) | Informational only |
| `deferred_at` | The manifest STEP SLUG (e.g. `'enrich_parcels'`) that deferred this run — from the defer marker's `step` field (Spec 47 §8.7), NOT a timestamp despite the field name (named for symmetry with `died_at`); absent otherwise | Yes — the defer-streak signal (Spec 40 §3.1.2) |

**Producer:** `run-chain.js`.

**Consumer:** a third exported pure helper on `check-chain-verdict.js`,
`classifyStepCompleteness(sc, status)` — `status` is the row's own `pipeline_runs.status`,
needed to enforce the `⟺` tripwire below (scoped to `OK_STATUSES`) and the defer-arm's
manifest-order reconciliation. **Consulted ONLY on rows already inside `OK_STATUSES`**
(today `['completed', 'completed_with_warnings']`; Phase B B2 adds `'deferred_to_full'` to
this set, Spec 40 §3.1.2) — every other status is already red via `classifyVerdict`, so
completeness classification there would be redundant. **Only `expected` and `died_at` are
decision-relevant** — `executed`/`skipped_gate`/`skipped_budget` are informational; a verdict
function that instead compares `executed.length !== expected.length` misclassifies every
legitimate gate-skip or budget-stop as an incomplete chain.

**Absent ≠ pass.** For one deploy cycle after this field ships, an absent `step_completeness`
(legacy rows, pre-deploy) is ANNOTATED (`{ok: true, annotate: true}`), never failed — this is
one instance of §4.9's self-announcing relaxation pair, detailed there.

**The `⟺` tripwire, scoped to `OK_STATUSES` rows (v6.1 X-2 correction).**
`status === 'deferred_to_full' ⟺ deferred_at is present` holds ONLY within `OK_STATUSES`
rows. It does NOT hold chain-wide: the status ladder ranks a FAIL-verdict
(`completed_with_errors`) ABOVE a defer, so a run that both deferred a step AND separately
FAILed a different step's audit verdict legitimately terminalizes `completed_with_errors`
while still carrying `deferred_at` — a "defer-then-FAIL" run. **This is a deliberate
semantic choice, not a bug:** streak detection (Spec 40 §3.1.2) keys on `deferred_at`
regardless of the row's final status, so a defer-that-also-FAILed still counts toward the
2-consecutive escalation. Hiding a real defer behind its own red would starve the
loop-breaker of the exact signal it exists to catch.

**Missing step rows are legitimate iff at-or-after `deferred_at` in manifest order.** A
`deferred_to_full` chain leaves no `pipeline_runs` row for any step at-or-after the
deferring step in the manifest's declared order (Spec 47 §8.7) — rows for steps BEFORE the
defer point are ordinary `completed` rows and must not be flagged as "missing" by
`classifyStepCompleteness`.

**`died_at` derivation:** `died_at = wasCancelled ? null : failedStep` — a cancelled run's
`failedStep` may be non-null incidentally (the cancel check runs between steps), so the
helper reads `wasCancelled` first to avoid misreading a cancellation as a genuine failure.

### 3.10 `records_meta.last_heartbeat_at` / `current_pass` / `rows_processed` — progress heartbeat _(NEW 2026-09-03 — WF3 cloud-parity FIX 3 remediation, `00659574`)_

**Shape:** `records_meta.last_heartbeat_at` (timestamp, `now()`), `records_meta.current_pass`
(text — the script-local name of the loop currently running, e.g. `'optimal_config'`),
`records_meta.rows_processed` (int — rows seen by that loop so far this run), written onto
the STEP's own `pipeline_runs` row (not the chain-level row §3.9 uses).

**Producer:** originally `scripts/enrich-parcels.js`'s own `recordHeartbeat(pool, pipelineRunId, currentPass, rowsProcessedCount)` (legacy, pre-conversion). **Moved into the library at LG-28 (pilot 9 commit 7d, `runEnrichPhase`, `scripts/lib/step/index.js`)** — called once per phase BOUNDARY (before/after each of the 5 `execution.phases[]`) in both the shared-txn and post_commit loops. `runId` is threaded as `ownRunId` (Spec 47's `pipeline.run(name, fn)` mechanism) — `null` under a standalone invocation, in which case `recordHeartbeat` no-ops.

⚠️ **CORRECTED (EP-D15, WF3 C4, 2026-09-09; widened to whole-step by F5, output panel, same day):** "at a configurable interval" was FALSE for every phase before this commit — the two boundary calls (`rows_processed` the hard-coded literal `0`/`1`, never a counter) were the ONLY writes; nothing advanced `last_heartbeat_at` while a phase actually ran, so a healthy 50+-minute phase (measured: `phase max_build completed in 3049335ms` — itself a SHARED-txn phase) went silent for its entire duration. This is now genuinely periodic for EVERY phase, shared-txn and post_commit alike, on ONE dedicated `heartbeatClient` held for the WHOLE step (F5 corrected the first cut of this fix, which scoped the ticker to post_commit only — exactly the wrong scope, since the reaper hazard's own measured evidence was a shared-txn phase): `startHeartbeatTicker` (`scripts/lib/step/index.js`) fires an UNLATCHED `recordHeartbeat` every `enrich_parcels_heartbeat_minutes`, reading a STEP-LEVEL (never per-phase-reset) `rows_processed` value a pass MAY advance via a runner-owned `ctx.onProgress(n)` seam (compute stays JUST compute — Rule 2; the pass reports a NUMBER, the write cadence/connection stay the runner's job) and attributing each tick to whichever phase is CURRENTLY running. The 4 SHARED-txn phases (zoning/max_build/existing_structure/comparable_builds) are each a single set-based SQL statement with no natural per-batch progress point, so none call `ctx.onProgress` today — the ticker still advances `last_heartbeat_at` on schedule regardless, since a tick needs only a live phase name, not a fresh progress value. Both phase-boundary `recordHeartbeat` calls (start and end) now write the real cumulative `rows_processed`, never the literal `0`/`1` — the literal would otherwise clobber whatever the ticker/`onProgress` had already advanced it to.

⚠️ **CORRECTED (EP-D12, pilot 9 commit 8 P8, 2026-09-08):** the write is NO LONGER on "the SAME `pool` the rest of the pass uses" — that framing predates a live cloud finding (`pipeline_runs` row 4429: `last_heartbeat_at`/`current_pass` stayed `NULL` for an entire run) traced to per-call `pool.query()` connection-checkout contention under cloud's tighter Supavisor pool ceiling (a fresh checkout per heartbeat call can queue behind the phase's own long-held connection, making the write invisible for as long as the phase runs). `runEnrichPhase` now acquires ONE dedicated, autocommit `heartbeatClient` (`pool.connect()`, once, released in a `finally` covering the whole call) and threads it through every heartbeat/stall write instead — never wrapped in BEGIN/COMMIT/ROLLBACK, so each write is its own immediately-visible statement, and connection churn does not scale with heartbeat frequency. The guarded UPDATE SQL itself (below) is unchanged:

```sql
UPDATE pipeline_runs
   SET records_meta = COALESCE(records_meta, '{}'::jsonb) || jsonb_build_object(
         'last_heartbeat_at', now(),
         'current_pass', $1::text,
         'rows_processed', $2::int
       )
 WHERE id = $3
```

The `COALESCE(records_meta, '{}'::jsonb)` is deliberate, not decorative: `run-chain.js`'s per-step INSERT sets no `records_meta`, so the column reads `NULL` for a row's entire `running` lifetime — a bare `records_meta || jsonb_build_object(...)` against a `NULL` left operand evaluates to `NULL` in Postgres, silently erasing the column instead of setting it (the same NULL-swallow class `tasks/lessons.md` already documents for `MIN`/`LEAST`). A failed UPDATE is caught and logged via `pipeline.log.warn` naming the run id, never thrown — this satisfies §3.6's "never crash the pass it is instrumenting" posture: a heartbeat write must be able to fail without taking the run down with it.

**Consumer:** `src/lib/admin/reap-stale-runs.ts`'s `reapStaleRunningRows()` (called from `src/app/api/admin/stats/route.ts`'s `GET` handler — extracted into its own module at pilot 9 commit 8 P5(d), 2026-09-08, since a `route.ts` file's own generated Next.js type-check restricts it to the HTTP-method/config export allowlist, so the reaper could not stay inline and still be independently testable). Reads `records_meta->>'last_heartbeat_at'`: a `running` row with a heartbeat inside the last 30 minutes is NOT aged out, even if `started_at` is well past the original 2-hour threshold; a row with no heartbeat at all keeps that original 2-hour `started_at` rule unchanged. **BUILT** — both directions locked against a real Postgres in `src/tests/db/admin-stats-reaper.db.test.ts` (recent-heartbeat survival, stale-heartbeat reap, no-heartbeat-old reap, no-heartbeat-fresh survival, reaped-row field shape). `scripts/reconcile-runs.js` (Spec 122 §7.4), the MORE authoritative Step-0 reaper (writes `crashed`, not `failed`), has the identical heartbeat-unaware gap — not closed here, named for awareness (this producer/consumer contract does not silently drift the way §3.9's did before this table existed).

**Rationale (§3.6).** Before this, a stalled per-row loop was invisible in the pipeline's own records — a real cloud run stalled silently for 3h31m with zero output between "config load" and the timeout kill (`review_followups.md` HIGH) and the only observability was a `pipeline.log.info` line to stdout, gone the moment the log stream rotated or was lost. §3.6 requires observability to live in the pipeline's own records, not stdout; this field makes a stalled pass diagnosable from `pipeline_runs` itself, on the run's OWN row, without fixing the stall (a separate WF3, `wf3_enrich_parcels_cloud_stall`) — it makes the *next* one legible.

**`records_meta.stall_diagnostic` / `stall_diagnostic_at` — silence-gated `pg_stat_activity` capture** _(NEW 2026-09-03 — WF3 enrich_parcels stall commit 3)_. The heartbeat above only LOGS on a **completed** loop iteration — if the underlying cursor's `FETCH` itself blocks (H5 in the `wf3_enrich_parcels_cloud_stall` premise verification, UNDETERMINED: a reaped TCP socket the client never notices), no JS in the loop body runs at all and the inline per-row heartbeat check can never fire. `startStallTicker` closes that gap with a genuine `setInterval`, started BEFORE the loop and independent of its own await points, so it still fires while the loop is fully stuck.

⚠️ **CORRECTED (EP-D15, WF3 C4, 2026-09-09):** "two consecutive ticks with an unchanged `rows_processed`" describes code that has never existed. `startStallTicker`'s own trigger is TIME-SINCE-THIS-PHASE-STARTED, not a `rows_processed` comparison: if a single phase call has not returned within `2 * intervalMs`, ONE `fired` latch flips true and the probe below runs exactly once for that phase call — `rows_processed` changing or not changing has no bearing on it (the ticker has no read access to that value at all; only the SEPARATE, unlatched `startHeartbeatTicker` above reads it). "Progress resuming resets the tick counter AND the fired-once guard" is equally not built: there is no tick counter, and `fired` is reset only when the CALLER starts a fresh ticker for the phase's NEXT invocation (`stopTicker()` in a `finally`, a new `startStallTicker(...)` at the next phase's own start) — never by an in-flight progress signal. The paragraph below describes the mechanism AS BUILT: one silence-gated probe per phase call, fired ONCE, keyed purely on elapsed wall-clock time. It runs `SELECT pid, state, wait_event_type, wait_event, query_start FROM pg_stat_activity WHERE pid <> pg_backend_pid() AND state <> 'idle' AND query ILIKE '%max_buildable_footprint_sqm%' ORDER BY query_start ASC LIMIT 1` on a **dedicated connection distinct from the possibly-stuck phase client** (originally a fresh per-call `pool.query`; EP-D12, pilot 9 commit 8 P8, moved this to the SAME held-open `heartbeatClient` `recordHeartbeat` now uses, for the identical connection-contention reason — see the correction above) and writes the single-row result (or `{note: 'no matching backend found in pg_stat_activity'}`) into `records_meta.stall_diagnostic`, stamping `records_meta.stall_diagnostic_at`. A fresh `startStallTicker(...)` call at the START of the phase's NEXT invocation is what resets the `fired` latch (not an in-flight progress signal, corrected above) — so a second, separate stall in a LATER phase of the same run is captured too, while a single phase call's own ticker still fires only once no matter how long that one call keeps running (it does not spam one query per tick for the duration of a real multi-hour hang). Same never-throws posture as `recordHeartbeat` (§3.6); a failed probe or write is caught and logged via `pipeline.log.warn`, never re-thrown, and no-ops when `pipelineRunId` is null. **Consumer:** none yet — same OPEN status as `last_heartbeat_at` above; an operator reads it by hand from `pipeline_runs.records_meta` after a stall. **This instrument does not PROVE H5** — only a live capture during an ACTUAL hang can confirm the backend is gone while the client still waits — it only guarantees the next occurrence leaves a diagnosable trace instead of nothing.

**`records_meta.pool_errors` — idle-client `pool.on('error')` events, COALESCE-merged into the run's own record** _(NEW 2026-09-08 — pilot 9 commit 8 P5(a))_. `scripts/lib/pipeline.js`'s `attachPoolErrorLogger` (the WF3 2026-09-07 crash-prevention fix — a `pg.Pool` with no `'error'` listener crashes the whole process on any idle-client error, per node-postgres's own re-emit behaviour) was LOG-ONLY: `pipeline.log.error(...)` on stdout, nothing in the run's own persisted record — the same "invisible in the pipeline's own records" gap §3.6 exists to close. The listener now ALSO increments `pool.__buildoPoolErrorCount` (a per-pool counter — each `pipeline.run`/converted-step invocation gets its own fresh pool, Spec 122's per-step-process model, so this needs no reset between runs). `scripts/lib/step/index.js`'s `runWithPool` reads it at every terminal (the happy path AND both self-skip paths — an idle-client error can occur regardless of which branch a run ends on) via `pool.__buildoPoolErrorCount ?? 0` — a COALESCE-style merge, always present, `0` on the common (no-error) case, never omitted when zero (matching `chain_run_id`'s own "nothing hidden" rule). **BUILT** — the counter mechanism locked in `src/tests/pipeline-sdk.logic.test.ts` (increments per event, starts at 0, non-throwing); the `records_meta.pool_errors` merge locked in `src/tests/step-library.logic.test.ts` (0 on a clean pool, the real count on a pool that saw errors).

**Consumer:** none yet — same class as `last_heartbeat_at`/`stall_diagnostic` above: an operator or a future automated audit reads it by hand from a run's own `records_meta`. Filed so this producer/consumer contract does not silently drift.

### 3.11 `audit_table.rows[].order_guarantee` — Rule 11 ordering-guarantee passthrough _(NEW 2026-09-03 — WF3 Rules 10-12 output panel remediation, commit 2)_

**Shape:** `audit_table.rows[N].order_guarantee = {anchor, guarantee}` (both strings), present ONLY on a row whose declaring `checks[]` entry carries a descriptor `order_guarantee` (Spec 124 §2 Rule 11 — schema-required on any check with `when:"pre_write"`, `docs/specs/01-pipeline/124_step_standard_policy.md` §2 Rule 11, `step.schema.json` `checks[].order_guarantee`). Absent on every other row — never an empty object or null placeholder key, per the same "zero-row emission preservation is for COUNTERS, not for a per-row optional key" reading §3.6 already applies to `audit_table.rows` shape generally.

**Producer:** `scripts/lib/step/verdict.js`'s `checkRow(check, observation, onCheckError, config)` — the row-builder closure spreads `{order_guarantee: {anchor: check.order_guarantee.anchor, guarantee: check.order_guarantee.guarantee}}` onto the row it returns when `check.order_guarantee` is present on the descriptor entry. `spec_ref` (the third field of the descriptor's `order_guarantee` object) is DELIBERATELY OMITTED from the emitted row: it is the citation coordinate `checkOrderGuaranteesCited` (`scripts/analysis/step-validate.mjs`) re-resolves against the live `docs/specs/` tree at descriptor-validation time — a `pipeline_runs.records_meta.audit_table` reader has no use for a file path it cannot re-open from a JSONB column, only for WHAT the guarantee is and WHERE (which anchor) to find it if they go looking.

**Consumer:** none yet — same class as `last_heartbeat_at`/`stall_diagnostic` above (§3.10): an operator or a future automated audit reads it by hand from a run's own `records_meta`. **Rationale (§3.6, "observability lives in the pipeline's own records, not stdout/the descriptor"):** before this, a `when:"pre_write"` check's ordering guarantee was declared ONLY in the descriptor (static, source-controlled) — the RUN's own persisted record carried the check's id/value/threshold/status but nothing saying that row's `pre_write` position was asserting a specific, spec-cited "before X" promise. A reader auditing a historical run from `pipeline_runs` alone (the descriptor may since have changed) could not tell. This closes that gap for the 3 live `pre_write` checks (`load_ravines` 2, `link_massing` 1, `link_wsib` 1 — Spec 124 §2 Rule 11's own WF2 grounding table, row 9) without changing what is GATED — purely additive to the row shape.

**Key registry (Spec 48 §3.10-style):** `order_guarantee` joins `source` (Fold B-3, §3.9 note above) as a `audit_table.rows[]`-scoped key a consumer may find present-or-absent per row, never assume: `source` is on EVERY row (default `'check'`); `order_guarantee` is on ONLY a `pre_write`-with-declared-guarantee row. Both are documented here so a future key added to the same row shape has a place to register itself rather than being discoverable only by reading `verdict.js` source.

</behavior>

---

<behavior>
## 4. `emitSummary()` Extension — `failed_sample`

### 4.1 Purpose

Scripts may optionally pass a `failed_sample` array to `emitSummary()` containing string descriptors of the specific records that failed (e.g. permit numbers + error snippet). This lets the observability agent surface *which* records failed, not just how many.

### 4.2 Contract

```js
pipeline.emitSummary({
  records_total: 500,
  records_new: 3,
  records_updated: 490,
  failed_sample: [
    'permit_num:2023-12345 — TypeError: cannot read issued_date',
    'permit_num:2024-00007 — RangeError: invalid date',
  ],
});
```

| Rule | Detail |
|------|--------|
| **Optional** | All existing callers continue to work unchanged |
| **Capped** | Truncated to 20 items if more are provided |
| **Passthrough** | Written verbatim to `PIPELINE_SUMMARY` payload as `failed_sample` top-level field |
| **Absent when empty** | If array is empty or not provided, the field is omitted from the payload |

## 4.3 `emitSummary()` Extension — `vocab_coverage` (cov_* primitive) _(NEW 2026-06-16)_

Scripts may pass `telemetry_context.vocab_coverage` to surface value/vocabulary coverage as a
verdict-driving `cov_*` audit row (parallel to `dq_`; see Spec 30 §3.2). The data is produced by
`pipeline.computeVocabCoverage(pool, spec)` from a manifest `telemetry_vocab_cols` declaration (Spec 40).

```js
const vocabCoverage = await pipeline.computeVocabCoverage(pool, manifest.scripts.classify_permits.telemetry_vocab_cols);
pipeline.emitSummary({
  records_total: n,
  telemetry_context: {
    vocab_coverage: vocabCoverage,                       // { trade_vocab: { present, vocab_size } | { unresolved } }
    vocab_coverage_thresholds: { pass: 90, warn: 70 },   // optional; defaults 90/70
  },
  records_meta: { audit_table: { ... } },
});
```

| Rule | Detail |
|------|--------|
| **Optional** | Absent `vocab_coverage` → no `cov_*` rows (opt-in, like `dq_`) |
| **Row shape** | `cov_<label>: present/vocab_size (pct%)` → PASS ≥ pass%, WARN ≥ warn%, FAIL below |
| **Empty vocab** | `vocab_size=0` with data present → WARN; with no data → INFO |
| **Unresolved** | `{ unresolved: '<enumerated reason>' }` → a VISIBLE WARN row (never silent); raw error logged via `log.warn` only |
| **Bounded** | INTERSECTION semantics (data values in vocab) ⇒ coverage ≤ 100% |

### 4.4 Verdict recompute (escalate-only) _(NEW 2026-06-16)_

After injecting all auto rows (`sys_/err_/dq_/cov_`), `emitSummary()` recomputes `audit_table.verdict`
as the row-derived cascade (§3.6), **escalate-only**: it raises the verdict when an injected row is
more severe but NEVER downgrades a script-set verdict, and preserves `SKIP`/`UNKNOWN` verbatim. This
enforces the §3.6 "row-derived, never parallel-boolean" rule at the SDK level — a `cov_*`/`dq_`/`err_`
FAIL now turns its step red without each script re-deriving its own verdict.

### 4.5 Coverage-gate row vocabulary (assert-global-coverage.js) _(NEW 2026-07)_

`assert-global-coverage.js` — the corpus-wide coverage gate (chain step 27 / lock 111) — is
the canonical builder of coverage `audit_table.rows`. It emits a small vocabulary of row
shapes, all on the **same** `{ metric, value, threshold, status }` rail the admin UI and the
SDK auto-inject share. New coverage assertions MUST reuse these shapes, not invent per-field
verdict logic:

| Builder | Gate | Use |
|---------|------|-----|
| `coverageRow(step, field, pop, denom)` | PASS ≥ `passPct`%, WARN ≥ `warnPct`% (default 90/70, logic_variables-loaded) | Standard field coverage. |
| `externalRow(step, field, pop, denom)` | PASS ≥ 10%, WARN ≥ 5% | Third-party scraper fields (phone, email, website, WSIB) — low coverage is normal. |
| `calibratedRow(step, field, pop, denom, fieldPassPct, fieldWarnPct)` | Per-field explicit thresholds (e.g. zoning 80/75) | Fields whose achievable ceiling differs from the global gate. Params are deliberately **named** `fieldPassPct`/`fieldWarnPct` (not the outer `passPct`/`warnPct`) so a caller that forgets to pass thresholds fails loudly instead of silently inheriting the global gate. |
| `infoRow(step, field, value)` | none — always `INFO` | Structural sparsity / count-only metrics, no traffic light. |
| `vocabRow(step, col, present, vocabSize)` / `profileVocabTriple(t)` | PASS ≥ `vocabPassPct`%, WARN ≥ `vocabWarnPct`% | Value/vocabulary dimension (distinct values present vs the defining vocabulary). Backs the SDK `cov_*` primitive (§4.3) via the shared `resolveAndCountTriple`; an **unresolved** triple (bad identifier / missing column / type mismatch / timeout) becomes a VISIBLE `WARN` row, never a silent INFO-skip. |
| `acceptedBaselineRows({valuePct, strictPct, acceptanceMetric, baseline})` (`scripts/lib/accepted-baseline.js`, _NEW 2026-08-03 Pipeline Rehab P4_) | WARN while `valuePct < strictPct`; **null (self-retired) at ≥ `strictPct`** | Producer-side accepted baseline for a persistently-red gate whose gap is structural and owned by a named fix epic (§4.6 — the acceptance lives IN the gate, never a checker-side allowlist). Returns the §4.9 pair: an accepted-WARN row under a **NEW metric name** (never reuse an existing metric — Spec 85's gate-policy metric name is reserved) carrying the LIVE value every run + a self-documenting acceptance string, and a `<metric>_retighten` INFO companion stating the machine-observable re-tighten condition. The caller also downgrades its own would-be-FAIL field row to WARN with a pointer annotation. |

### 4.6 Denominator honesty — batch- vs subset- vs corpus-scoped coverage _(NEW 2026-07)_

A coverage `%` is only trustworthy if its **denominator names the population the field is
expected to be present in**. Three recurring traps:

- **Corpus flatters the servable subset.** The CoA cost-coverage row read ~58% against the
  whole `coa_applications` corpus but only ~49% on the OPEN (non-terminal, geocoded) subset
  the feed actually serves — priced CoAs skew closed, so the corpus number over-reports what
  a consumer sees. Gate the row on the **subset the consumer reads**, not the corpus.
- **Born-red / scoped-denominator gates.** Whole-corpus cost coverage is ~62% *by design*
  (many permits are legitimately unpriceable), so a global 90% gate sits **permanently red**
  and desensitizes operators. `assert-global-coverage.js` (~L49) scopes those few cost rows
  via `calibratedRow` while the global rail stays 90/70. Scope the denominator/threshold to
  the **achievable** population; never leave a structurally-unreachable global gate red.
- **Path-bypass metrics.** After a code path is bypassed for a subset, a metric measured over
  the FULL population (rather than the sub-population that path serves) reports a phantom gap.
  Measure over the population the step actually acts on, and say which population that is.

### 4.7 Active-scoped vs all-rows counters _(NEW 2026-07)_

A counter that counts **rows written** cannot observe a state change on rows it did not
rewrite. The CoA trade fan-out derives `lead_trades.is_active` from bundle provenance
(commit `9883656`): a lead can **lose** `is_active` without any new row being written. A
health/coverage counter that reads `count(*)` over written rows will silently miss the
deactivation and over-report live coverage. Count over the **active-scoped** predicate
(`WHERE is_active`) — the state you actually serve — not over all-rows-ever-written.

### 4.8 Magnitude floors vs `> 0` floors for reference tables _(NEW 2026-07)_

For reference / source-load tables (GIS layers, centreline, bylaw tables), a `count > 0`
gate **passes on a catastrophic partial load** — one row of an expected 500K clears it.
Assert a **magnitude floor** (an expected order-of-magnitude minimum) so a truncated ingest
turns the step red instead of green. The sources-chain honesty gates are the pattern: GIS /
scoped max-build coverage floors (`1f8ca38`), bylaw WARN floors (`173f0d1`), back-ref
confidence floor (`fb593a9`).

### 4.9 First-deploy posture must carry its re-tightening condition observably _(NEW 2026-07)_

When a gate is loosened for a first-deploy / cold-start window (relaxed thresholds while a
calibration cohort fills), the relaxation MUST be **self-announcing on every run** and carry
a **machine-observable re-tightening condition** — never a silent, forgettable bypass. The
`calibration_thresholds_relaxed` WARN row (commit `c6310d6`) emits on EVERY run while the
relaxed values are in effect, and flips to FAIL-advice once a companion INFO row
(`calibration_cohort_fill_pct`) recovers past the strict-PASS point: the loosening is loud
and permanent-by-choice-only. The CoA gate's `coa_audit_gate_warn_accepted` WARN row is the
same shape — a sanctioned bypass made as loud as the failure it suppresses (cf. §3.7's
first-deploy spike runbook posture).

Two further exemplars landed 2026-08-03 (Pipeline Rehab P4, via the §4.5
`acceptedBaselineRows` builder — both self-retire automatically, no operator revert
needed):

- **`coa_cost_coverage_gate_accepted`** (coa `assert_global_coverage`, coa chain ONLY —
  the permits-chain cost profile is untouched): `coa_applications.estimated_cost` sits at
  61.1-61.2% vs the 90/70 rail, a structural gap owned by the Spec 80 Phase 4
  forecast/cost reconciliation epic. The field row emits WARN (not FAIL) with a pointer
  annotation; the acceptance pair re-emits the live value every run and self-retires at
  ≥ 90%.
- **`permits_opportunity_score_gate_accepted`** (permits `assert_entity_tracing`):
  `opportunity_score` coverage has sat at 79.9-80.0% vs ≥ 80 on every nightly run (never
  passed — knife-edge after the P16 denominator growth, not flapping). Same pair shape,
  self-retires at ≥ 80%.
- **`step_completeness` absent-field annotate → `_retighten` pair** (Phase B B2+C5, ONE
  combined commit — `run-chain.js`/`check-chain-verdict.js`, §3.9 above): the relaxation
  window opens the moment that commit deploys — legacy chain rows written before it carry
  no `step_completeness` field at all, so `classifyStepCompleteness` ANNOTATES
  (`{ok: true, annotate: true}`) an absent field for one deploy cycle rather than failing
  it. The companion `step_completeness_retighten` INFO row carries the machine-observable
  flip condition: **zero absent-field rows across one full cycle of all five scheduled
  chains** (`chain_coa`, `chain_permits`, `chain_sources`, `chain_entities`,
  `chain_deep_scrapes`). The absent-count query is PINNED to the **latest row per chain** —
  a naive lookback-window count would hold legacy rows in scope indefinitely and never reach
  zero, which is exactly the silent-relaxation drift this section exists to prevent.
  **Named dependency (v6.1 S-3):** the flip is STRUCTURALLY UNREACHABLE before
  `chain_sources` is re-enabled (Phase B B6) — `chain_sources`'s workflow is
  `disabled_manually` as of this writing (2026-08-14), so its "latest row" never advances
  and the cycle can never close until B6 lands. The flip itself is the same one-line
  operator-triggered follow-up commit as the other exemplars above — filed to
  `docs/reports/review_followups.md` in the landing commit, not self-executing.

### 4.10 `records_total` honesty on Mutator steps _(NEW 2026-07)_

Only **Observer** archetype scripts (Spec 30 §2.1; §3.5 here) null the three top-level
counters (`records_total`/`records_new`/`records_updated`). A **Mutator** step MUST report a
real primary-entity `records_total` per Spec 47 §11 — nulling or zeroing the counter on a
step that writes rows hides the work and zeroes `sys_velocity_rows_sec`. The Spec 80
archetype cost writes (commit `4442fb7`) are Mutators: `records_total` = the permits / CoA
rows evaluated, never null. Reserve null counters for genuinely read-only Observers.

</behavior>

---

<testing>
## 5. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic:** `pipeline-sdk.logic.test.ts` — `failed_sample` passthrough and cap-at-20 behavior
- **Infra:** `pipeline-observability.infra.test.ts` — script existence, Observer emit pattern, lock 112, error isolation, no bare console.error
<!-- TEST_INJECT_END -->
</testing>

---

<constraints>
## 6. Operating Boundaries

### Target Files
- `scripts/observe-chain.js` (NEW — Observer script)
- `scripts/lib/pipeline.js` (emitSummary extension only)
- `scripts/run-chain.js` (detached spawn + Boy Scout lint fix)
- `docs/reports/pipeline-observability/{chain_id}-followup.md` (one file per chain — permits-followup.md, coa-followup.md, etc.)

### Out-of-Scope Files
- Any business tables (`permits`, `trade_forecasts`, etc.) — observer reads `pipeline_runs` only
- `scripts/manifest.json` — observe-chain.js is NOT a chain step; it's a post-chain observer
- `src/app/api/` — no API routes

### Cross-Spec Dependencies
- **Relies on:** `30_pipeline_architecture.md` §2.1 (Observer archetype), `40_pipeline_system.md` §3.5 (advisory lock convention), `47_pipeline_script_protocol.md` §R10 (PIPELINE_SUMMARY mandate)
- **Consumed by:** Developer review workflow
</constraints>
