# Backend / Pipeline Domain — Required Reading

This file is loaded automatically when Claude Code works in `scripts/`.
It extends the root `CLAUDE.md` for Backend/Pipeline mode.

**Do NOT use `@` imports here** — they load unconditionally into every session
(including Admin/WF7 tasks) and waste context. Read the specs below explicitly
via Read tool at task start instead.

---

## Required Reading (Backend/Pipeline Mode only — read explicitly, do not auto-import)

Before generating any active task in Backend/Pipeline mode, send these as parallel
Read tool calls in a single message:

| File | Sections |
|------|---------|
| `docs/specs/00_engineering_standards.md` | §2 Error Handling, §3 Database, §6 Logging, §7 Dual Path, §9 Pipeline Safety, §10 Boundary |
| `docs/specs/01-pipeline/30_pipeline_architecture.md` | V2 architecture, archetypes, invariants |
| `docs/specs/01-pipeline/40_pipeline_system.md` | SDK exports, manifest schema, chain orchestration |
| `docs/specs/01-pipeline/47_pipeline_script_protocol.md` | **Mandatory** — §R1-R12 skeleton, advisory lock, emitSummary, emitMeta |
| `docs/specs/00-architecture/01_database_schema.md` | Current schema |

---

## Spec 47 — Mandatory Script Skeleton (§R1–R12)

Full spec: `docs/specs/01-pipeline/47_pipeline_script_protocol.md` (1 769 lines — read it
for edge cases; the skeleton below is the minimum for every new script).

```js
#!/usr/bin/env node
/**
 * [Display name] — [one sentence: what it computes/writes].
 * SPEC LINK: docs/specs/[path].md
 */
'use strict';

const pipeline = require('./lib/pipeline');
const { loadMarketplaceConfigs } = require('./lib/config-loader');
const { z } = require('zod');

// §R2 — lock ID = spec number
const ADVISORY_LOCK_ID = [spec_number];

// §R4 — Zod config schema (validate all consumed env/logicVars upfront)
const ConfigSchema = z.object({ ... });

pipeline.run('[slug]', async (pool) => {

  // §R5 — Startup guard: validate required env vars / config BEFORE acquiring lock
  const rawBucket = process.env.REQUIRED_VAR;
  if (!rawBucket) throw new Error('[slug] REQUIRED_VAR is not set');

  const { logicVars } = await loadMarketplaceConfigs(pool, '[slug]');
  const config = ConfigSchema.parse({ ... }); // throws on bad values

  // §R6 — Advisory lock (transaction-level, auto-released on commit/rollback)
  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {

    // §R3.5 — DB clock, not new Date() — for any timestamp written to DB
    const RUN_AT = await pipeline.getDbTimestamp(pool);

    // §R7 — Read: use streamQuery for >10K rows, pool.query for bounded sets
    // §R8 — Compute (pure functions in scripts/lib/ where possible)
    // §R9 — Atomic write: all DELETEs + UPSERTs that belong together in ONE withTransaction

    // §R10 — PIPELINE_SUMMARY (Observer archetype: records_total/new/updated = null)
    pipeline.emitSummary({
      records_total: ...,   // null for read-only/Observer scripts
      records_new: ...,
      records_updated: ...,
      records_meta: {
        audit_table: {
          phase: [spec_number],
          name: '[Human readable name]',
          verdict: rows.some(r => r.status === 'FAIL') ? 'FAIL'
                 : rows.some(r => r.status === 'WARN') ? 'WARN' : 'PASS',
          rows: [{ metric, value, threshold, status }],
        },
      },
    });

    // §R11 — PIPELINE_META
    pipeline.emitMeta(
      { [input_table]: ['col1', 'col2'] },   // reads
      { [output_table]: ['col1', 'col2'] },  // writes (empty {} for Observer)
      ['ExternalService'],                    // omit if none
    );

  }); // withAdvisoryLock

  if (!lockResult.acquired) return; // §R12 — SDK emitted SKIP summary already

});
```

### Absolute rules (ESLint enforces most of these)
- `new Date()` **banned** for timestamps written to DB — use `pipeline.getDbTimestamp(pool)`
- `new Date()` **allowed** for elapsed time (`Date.now()`) and non-DB arithmetic
- No empty `catch` blocks — always log via `pipeline.log.warn/error`
- No `process.exit()` — throw errors, let `pipeline.run` handle them
- No `new Pool()` — use the pool provided by `pipeline.run`
- No raw SQL string concatenation — parameterised queries only (`$1, $2, …`)
- Streaming for >10K rows — `pipeline.streamQuery()`, never `pool.query` for large sets
- Idempotent — every script must be safely re-runnable

---

## Multi-Agent Review (WF1/WF2) — Exact Execution Pattern

Run these **in a single message** (three parallel tool calls) after Pre-Review Self-Checklist:

```
Tool call 1 — Bash:
  npm run review:gemini -- review [modified-file] --context [spec-path]

Tool call 2 — Bash:
  npm run review:deepseek -- review [modified-file] --context [spec-path]

Tool call 3 — Agent (subagent_type: "feature-dev:code-reviewer", isolation: "worktree"):
  Prompt: "Review [modified-file] against [spec-path]. Generate your own checklist
  from the spec's Behavioral Contract and Operating Boundaries. Report PASS/FAIL
  per item with line numbers for failures."
```

Triage: **BUG** → file WF3 before Green Light. **DEFER** → `docs/reports/review_followups.md`.
