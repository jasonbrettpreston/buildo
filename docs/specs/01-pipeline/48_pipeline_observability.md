# Pipeline Observability Agent

<requirements>
## 1. Goal & User Story

As a developer, after any pipeline chain completes, I want an AI agent to automatically read the run's warnings and failures alongside the 7-day historical baseline, then append a structured findings report — so I can identify regressions, anomalies, and critical issues without manually diffing `pipeline_runs` records.
</requirements>

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
