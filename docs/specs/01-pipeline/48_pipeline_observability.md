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
