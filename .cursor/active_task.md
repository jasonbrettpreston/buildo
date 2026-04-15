# Active Task: WF3-08 — Pipeline SDK Hardening (Zod · withAdvisoryLock · emitSummary · checkJs)
**Status:** Implementation
**Domain Mode:** Backend/Pipeline
**Workflow:** WF3 (Bug Fix)
**Findings:** H-W11 (NaN propagation from bad env), H-W18 (false-green emitSummary stub), 83-W5 (advisory lock on ephemeral client), systemic (no checkJs on scripts/)

## Context
* **Goal:** Eliminate four classes of future pipeline bugs by hardening the shared SDK layer.
  1. **Bad env values** — `PG_PORT='abc'` silently becomes `NaN` inside `createPool()`. Any script that starts will try to connect on port `NaN`, get a connection error, and that error will be logged without indicating the root cause.
  2. **NaN propagation from `logic_variables`** — `loadMarketplaceConfigs` has `isFinite` guards but no schema contract; callers get unvalidated `logicVars` objects with no guarantee required keys exist.
  3. **Advisory lock on ephemeral client** — pre-PR-C pattern `pool.query('SELECT pg_try_advisory_lock($1)')` acquires a session-level lock on a connection that's returned to the pool immediately after the query, so the lock is silently released. Scripts need a `withAdvisoryLock` helper that pins to a dedicated `pool.connect()` client.
  4. **False-green dashboard** — `emitSummary` auto-injects `{ verdict: 'PASS', ... }` when a script provides no `audit_table`. Admin FreshnessTimeline shows a green check for scripts that haven't wired any real quality checks (H-W18). Verdict should be `'UNKNOWN'` with a warn log.
  5. **`run()` pool leak on bad env** — `createPool()` is called before `try { ... } finally { pool.end() }`, so if env validation throws, `pool.end()` is never reached (pool leak / unhandled rejection).
  6. **No IDE type checking on scripts/** — `tsconfig.json` excludes `scripts/`; a `jsconfig.json` with `checkJs + strictNullChecks` enables VS Code / ts-server inline type errors without requiring a build step.
* **Target Spec:** `docs/specs/pipeline/47_pipeline_script_protocol.md` §4 (config validation), §5 (advisory lock), §8 (observability)
* **Key Files:**
  - `scripts/lib/pipeline.js` (createPool, run, emitSummary — all modified)
  - `scripts/lib/config-loader.js` (add validateLogicVars export)
  - `scripts/jsconfig.json` (NEW — checkJs)
  - `src/tests/pipeline-sdk.logic.test.ts` (NEW — failing tests first)

## Technical Implementation

### 1. `scripts/lib/pipeline.js` — `createPool()` env validation

Replace the bare `parseInt(process.env.PG_PORT || '5432', 10)` pattern with guarded parsing that throws a clear error on startup:

```js
function createPool() {
  const rawPort = process.env.PG_PORT || '5432';
  const port = parseInt(rawPort, 10);
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    throw new Error(`PG_PORT must be a valid port number (1-65535), got: ${JSON.stringify(rawPort)}`);
  }
  return new Pool({
    host: process.env.PG_HOST || 'localhost',
    port,
    database: process.env.PG_DATABASE || 'buildo',
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || 'postgres',
  });
}
```

No Zod dependency needed here — the guard is a single range check. Zod is higher-value in config-loader where the schema is complex.

### 2. `scripts/lib/pipeline.js` — `run()` restructure

Move `createPool()` inside the try block so `pool.end()` in finally is always guarded by `if (pool)`:

```js
async function run(name, fn) {
  let pool;
  const startMs = Date.now();
  _runStartMs = startMs;
  try {
    pool = createPool();
    await fn(pool);
    const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
    console.log(`\n[${name}] completed in ${elapsed}s`);
  } catch (err) {
    log.error(`[${name}]`, err, { phase: 'fatal' });
    throw err;
  } finally {
    if (pool) {
      await pool.end().catch((endErr) => {
        log.warn(`[${name}]`, `pool.end failed: ${endErr.message}`);
      });
    }
  }
}
```

### 3. `scripts/lib/pipeline.js` — `withAdvisoryLock(pool, lockId, fn)`

New export. Acquires a session-level advisory lock on a dedicated `pool.connect()` client (not `pool.query`). Mirrors the pattern in `classify-lifecycle-phase.js` L161-193. Lock ID = spec number convention (§5 of spec 47).

```js
/**
 * Acquire a PostgreSQL advisory lock on a dedicated client, run fn(), then
 * release. The lock is session-scoped so it MUST stay on the same connection.
 *
 * @param {import('pg').Pool} pool
 * @param {number} lockId  - Convention: lock_id = spec number (§5.2 of spec 47)
 * @param {() => Promise<T>} fn
 * @returns {Promise<{ acquired: false } | { acquired: true; result: T }>}
 * @template T
 */
async function withAdvisoryLock(pool, lockId, fn) {
  const client = await pool.connect();
  try {
    const lockRes = await client.query('SELECT pg_try_advisory_lock($1) AS acquired', [lockId]);
    if (!lockRes.rows[0].acquired) {
      return { acquired: false };
    }
    try {
      const result = await fn();
      return { acquired: true, result };
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [lockId]);
    }
  } finally {
    client.release();
  }
}
```

Callers check `acquired` and gracefully return (with an `emitSummary` skipped-run) when `false`.

### 4. `scripts/lib/pipeline.js` — `emitSummary` stub verdict fix

Change auto-injected stub verdict from `'PASS'` to `'UNKNOWN'` and emit a warn log so the Admin UI correctly shows an ambiguous state rather than a false green:

```js
if (!payload.records_meta.audit_table) {
  log.warn('[pipeline]', 'emitSummary called with no audit_table — admin UI will show UNKNOWN verdict. Wire a real audit_table for meaningful observability.');
  payload.records_meta.audit_table = { phase: 0, name: 'Auto', verdict: 'UNKNOWN', rows: [] };
}
```

Scripts that already provide a real `audit_table` are unaffected (the condition only fires when absent).

### 5. `scripts/lib/config-loader.js` — `validateLogicVars(logicVars, schema, tag)`

New export that callers use after `loadMarketplaceConfigs` to assert required keys exist and are valid numbers. Uses Zod for structured error messages. Returns `{ valid: true }` or `{ valid: false; errors: string[] }`.

```js
const { z } = require('zod');

/**
 * Validate a logicVars object against a Zod schema.
 * Call this after loadMarketplaceConfigs() to fail fast if required keys
 * are missing or non-finite (e.g. DB returned NULL, fallback was skipped).
 *
 * @param {Record<string, number>} logicVars
 * @param {import('zod').ZodSchema} schema
 * @param {string} [tag='config-loader']
 * @returns {{ valid: true } | { valid: false; errors: string[] }}
 */
function validateLogicVars(logicVars, schema, tag = 'config-loader') {
  const result = schema.safeParse(logicVars);
  if (!result.success) {
    const errors = result.error.issues.map(
      (i) => `${i.path.join('.')}: ${i.message}`
    );
    pipeline.log.error(`[${tag}]`, new Error('logicVars validation failed'), { errors });
    return { valid: false, errors };
  }
  return { valid: true };
}
```

### 6. `scripts/jsconfig.json` — checkJs

New file. Enables inline TypeScript checking in VS Code and `tsc --noEmit` for scripts:

```json
{
  "compilerOptions": {
    "checkJs": true,
    "strictNullChecks": true,
    "noEmit": true,
    "target": "ES2020",
    "module": "CommonJS",
    "lib": ["ES2020"],
    "allowSyntheticDefaultImports": true
  },
  "include": ["**/*.js"],
  "exclude": ["node_modules"]
}
```

### Test strategy (`src/tests/pipeline-sdk.logic.test.ts`)

Tests use `createRequire(import.meta.url)` for CJS module imports. No real DB — all pool/client calls are `vi.fn()` mocks. `vi.stubEnv()` for env var testing. `vi.resetModules()` before each test that needs a fresh `pipeline.js` instance (module-level state reset).

**Test cases (must fail RED before implementation):**

#### `createPool` env validation
1. `PG_PORT='abc'` → throws with message matching `PG_PORT must be a valid port number`
2. `PG_PORT='0'` → throws (out of range)
3. `PG_PORT='65536'` → throws (out of range)
4. `PG_PORT=''` (empty string) → uses default 5432 (same as `|| '5432'` path)
5. `PG_PORT='5432'` → resolves to valid pool config (port 5432)

#### `withAdvisoryLock`
6. When `pg_try_advisory_lock` returns `{ acquired: false }` → returns `{ acquired: false }`, `fn` never called, `pg_advisory_unlock` never called
7. When `pg_try_advisory_lock` returns `{ acquired: true }` and `fn` succeeds → returns `{ acquired: true, result }`, `pg_advisory_unlock` called exactly once
8. When `fn` throws → `pg_advisory_unlock` still called (finally), error re-thrown
9. `pool.connect()` used (not `pool.query`) for the lock pair

#### `emitSummary` stub verdict
10. When called with no `audit_table` in `records_meta` → emitted JSON contains `verdict: 'UNKNOWN'` (not `'PASS'`)
11. When called with a real `audit_table` → existing verdict preserved unchanged
12. `log.warn` called exactly once when auto-stub is injected

#### `validateLogicVars`
13. Valid schema + valid data → `{ valid: true }`
14. Required field missing → `{ valid: false, errors: [...] }` with field name in error string
15. Field present but NaN (non-finite) → validation fails with descriptive message
16. `log.error` called when validation fails

#### `run()` pool safety
17. When `createPool()` throws (bad PG_PORT env) → error is caught and re-thrown by `run()`, `pool.end()` never called (no pool to end — no crash)

## Standards Compliance
* **Try-Catch Boundary:** All new code paths either throw or propagate — no empty catches.
* **Unhappy Path Tests:** 17 test cases covering invalid env, lock failure, fn failure, missing audit_table, schema violations.
* **logError Mandate:** N/A — `validateLogicVars` uses `pipeline.log.error` (the pipeline equivalent).
* **Mobile-First:** N/A — backend only.

## Execution Plan
- [ ] **Rollback Anchor:** `bb8c341787e9b536f0276a8a44af3f82e0889e6a` (current HEAD).
- [ ] **State Verification:** Confirmed (from prior reads): `createPool()` has unguarded `parseInt(PG_PORT)` at L36; `emitSummary` auto-injects `verdict: 'PASS'` at L193; `run()` calls `createPool()` at L279 before the try block; no `withAdvisoryLock` exists; `config-loader.js` has no `validateLogicVars` export; `scripts/` excluded from `tsconfig.json`.
- [ ] **Spec Review:** `docs/specs/pipeline/47_pipeline_script_protocol.md` §4, §5, §8 — all items in this plan are mandated there.
- [ ] **Reproduction:** Write `src/tests/pipeline-sdk.logic.test.ts` with all 17 failing tests.
- [ ] **Red Light:** `npx vitest run src/tests/pipeline-sdk.logic.test.ts` — all 17 fail.
- [ ] **Fix:**
  1. `scripts/lib/pipeline.js` — `createPool()` port range guard.
  2. `scripts/lib/pipeline.js` — `run()` restructure (`let pool; try { pool = createPool(); ... }`).
  3. `scripts/lib/pipeline.js` — add `withAdvisoryLock(pool, lockId, fn)`.
  4. `scripts/lib/pipeline.js` — `emitSummary` stub verdict `'PASS'` → `'UNKNOWN'` + `log.warn`.
  5. `scripts/lib/pipeline.js` — add `withAdvisoryLock` to `module.exports`.
  6. `scripts/lib/config-loader.js` — add `const { z } = require('zod')`, add `validateLogicVars(logicVars, schema, tag)` function, add to `module.exports`.
  7. `scripts/jsconfig.json` — create new file with `checkJs: true, strictNullChecks: true`.
- [ ] **Pre-Review Self-Checklist — sibling bugs sharing root cause:**
  1. **`withAdvisoryLock` used in existing scripts?** No existing script calls `withAdvisoryLock` (it doesn't exist yet). Each existing script (classify-lifecycle-phase.js, compute-cost-estimates.js) implements the lock pattern inline. New helper doesn't break them — they continue using their own inline pattern until a follow-up WF2 migrates them. ✓ No regression.
  2. **`emitSummary` verdict change breaks CQA parsing?** `run-chain.js` reads `records_meta.audit_table.verdict`. CQA throws on `'FAIL'`; passes on `'PASS'`. `'UNKNOWN'` is a new value — confirm `run-chain.js` treats unknown verdicts as non-failing (permissive). If not, scripts with no audit_table would start failing the chain. Need to verify.
  3. **`validateLogicVars` export: `zod` available in scripts/?** Confirmed: `zod` is in `package.json` dependencies, available in CommonJS `require`. ✓
  4. **`jsconfig.json` conflicts with root `tsconfig.json`?** `tsconfig.json` excludes `scripts/`. `jsconfig.json` is scoped to `scripts/` directory. No conflict — they're separate projects. ✓
  5. **`run()` restructure: `_runStartMs` set before or after `createPool()`?** Currently `_runStartMs = startMs` is set immediately after `const startMs = Date.now()`. With the restructure, this stays the same — the assignment is before the try block so velocity calculation still works correctly even when `createPool()` throws. ✓
- [ ] **Green Light:**
  - `npx vitest run src/tests/pipeline-sdk.logic.test.ts` — all 17 pass.
  - `npm run test && npm run lint -- --fix` — all pass.
  - Visible ✅/⬜ summary. → WF6.

## §10 Plan Compliance Checklist
- ⬜ **DB:** N/A — no migrations, no schema changes.
- ⬜ **API:** N/A — no API routes modified.
- ⬜ **UI:** N/A — no components modified.
- ✅ **Shared Logic (§7.1 dual-code-path):**
  - These changes are to the Pipeline SDK and config-loader — consumed by JS pipeline scripts only. No TS API consumer uses `pipeline.js` or `config-loader.js` directly. Dual-path discipline applies when *business logic* changes; SDK infrastructure changes are single-path (scripts/ only). ✓
- ✅ **Pipeline (§9):**
  - Changes harden the SDK layer that all pipeline scripts depend on.
  - `withAdvisoryLock` enforces the spec 47 §5 pattern (dedicated client, try/finally, lock ID = spec number).
  - `validateLogicVars` enforces the spec 47 §4 pattern (fail fast on bad config).
  - `emitSummary` fix resolves H-W18 (false-green admin dashboard).
  - `createPool()` guard and `run()` restructure resolve startup reliability gap.
  - All changes are backward-compatible: existing callers continue to work unchanged.
  - `jsconfig.json` adds IDE-level type checking without changing runtime behavior.

---

**PLAN LOCKED. Do you authorize this WF3-08 Bug Fix plan? (y/n)**
