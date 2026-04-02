# Active Task: WF2 — SDK emitSummary Auto-Injection + Pre-Flight Audit
**Status:** Planning
**Workflow:** WF2 — Feature Enhancement
**Rollback Anchor:** `792e9a9`

## Context
* **Goal:** Upgrade `emitSummary()` to auto-inject standardized health metrics into every script's audit_table, and add Phase 0 Pre-Flight audit_table to run-chain.js.
* **Target Spec:** `docs/specs/pipeline/40_pipeline_system.md`
* **Key Files:** `scripts/lib/pipeline.js`, `scripts/run-chain.js`, `src/tests/pipeline-sdk.logic.test.ts`

## Design Constraints

### 1. Append, Don't Replace
The SDK intercepts the payload and **concatenates** new rows to the bottom of the existing `audit_table.rows` array. Scripts keep their custom metrics untouched. The dashboard receives the same data it always has, plus new rows in the same `{ metric, value, threshold, status }` format.

### 2. Namespace Protection (Prefix Taxonomy)
All auto-injected metrics use strict prefixes to avoid colliding with developer-defined metrics:
- `sys_` — System metrics (velocity, duration)
- `err_` — Error taxonomy (waf_blocks, timeouts, parse_failures)
- `dq_` — Data quality (null rates per column)

A developer's `{ metric: "total_errors" }` safely coexists with the SDK's `{ metric: "err_timeouts" }`.

### 3. Opt-In Rollout Strategy
- **Day 1 (free, automatic):** `sys_velocity_rows_sec` injected into all 44 scripts immediately — computed from `records_total` and `_runStartMs`. Zero script changes.
- **Day 2+ (opt-in):** Scripts pass an optional `telemetry_context` object to `emitSummary()` to enable `err_*` and `dq_*` metrics. If absent, SDK skips those rows.

## Technical Implementation

### Change 1: Module-level `_runStartMs` for velocity
Add `let _runStartMs = Date.now()` in SDK module scope. `run()` sets it at start. `emitSummary()` uses it to compute elapsed time and velocity. Backward-compatible — scripts that don't use `run()` get `_runStartMs = module load time`.

### Change 2: `emitSummary()` auto-injection logic
```js
function emitSummary(stats) {
  // ... existing payload construction ...
  
  // Auto-inject sys_* metrics (always, free)
  const durationMs = Date.now() - _runStartMs;
  const velocity = durationMs > 0 ? parseFloat((stats.records_total / (durationMs / 1000)).toFixed(2)) : 0;
  const sysRows = [
    { metric: 'sys_velocity_rows_sec', value: velocity, threshold: null, status: 'INFO' },
    { metric: 'sys_duration_ms', value: durationMs, threshold: null, status: 'INFO' },
  ];

  // Opt-in err_* metrics (from telemetry_context.error_taxonomy)
  const errRows = [];
  if (stats.telemetry_context?.error_taxonomy) {
    for (const [key, count] of Object.entries(stats.telemetry_context.error_taxonomy)) {
      errRows.push({ metric: `err_${key}`, value: count, threshold: null, status: count > 0 ? 'WARN' : 'PASS' });
    }
  }

  // Opt-in dq_* metrics (from telemetry_context.data_quality)
  const dqRows = [];
  if (stats.telemetry_context?.data_quality) {
    for (const [field, info] of Object.entries(stats.telemetry_context.data_quality)) {
      const pct = info.total > 0 ? ((info.nulls / info.total) * 100).toFixed(1) + '%' : '0.0%';
      dqRows.push({ metric: `dq_null_rate_${field}`, value: pct, threshold: '< 50%', status: ... });
    }
  }

  // Append to existing audit_table.rows (don't replace)
  if (payload.records_meta?.audit_table?.rows) {
    payload.records_meta.audit_table.rows.push(...sysRows, ...errRows, ...dqRows);
  }
}
```

### Change 3: run-chain.js Phase 0 Pre-Flight audit_table
After bloat gate checks complete (before first step), emit a Phase 0 audit_table with:
```js
{
  phase: 0,
  name: 'Pre-Flight Health Gate',
  verdict: allPass ? 'PASS' : 'WARN',
  rows: [
    { metric: 'sys_db_bloat_permits', value: '12.3%', threshold: '< 50%', status: 'PASS' },
    { metric: 'sys_db_bloat_permit_trades', value: '5.1%', threshold: '< 50%', status: 'PASS' },
  ]
}
```
Stored in the chain's `records_meta` so the dashboard shows DB health at chain start.

## Database Impact
NO

## Standards Compliance
* **Try-Catch Boundary:** N/A — SDK internal
* **Unhappy Path Tests:** Missing audit_table, missing telemetry_context, zero records_total
* **logError Mandate:** N/A — SDK logging
* **Mobile-First:** N/A — backend

## Execution Plan
- [ ] **State Verification:** emitSummary currently passes through records_meta unchanged
- [ ] **Guardrail Test:** Tests for sys_ auto-injection, err_ opt-in, dq_ opt-in, append behavior, namespace isolation
- [ ] **Red Light:** Tests fail
- [ ] **Implementation:**
  - [ ] Add `_runStartMs` module variable, set in `run()`
  - [ ] Modify `emitSummary()` with auto-injection logic
  - [ ] Add Phase 0 Pre-Flight audit_table to run-chain.js
  - [ ] Update spec
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass. → WF6
