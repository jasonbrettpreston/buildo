---
write_scope:
- scripts/lib/step/write.js
- src/tests/step-upsert-bind-limit.logic.test.ts
---
## Goal
Spec 124 R-CU (2026-10-16): one upsert statement binds at most 65,535 parameters, the PostgreSQL protocol limit. `scripts/lib/step/write.js` `executeUpsertBatch` (line ~1770) sends ALL rows of a caller's batch as ONE statement. A LINK whose rows fan out per key overflows: link_parcel_abutments at 1,000 parcels produced 67,400 parameters and PostgreSQL refused the statement with `bind message has 1864 parameter formats but 0 parameters` (67,400 mod 65,536 = 1,864). The INGESTOR path already strides by the limit: `executeWrite` uses `const batchSize = pipeline.maxRowsPerInsert(plan.columnsPerRow);` (write.js:1553) and loops over slices (write.js:1553-1560). Apply the same stride inside `executeUpsertBatch`.

## Read only these ranges
- `scripts/lib/step/write.js` lines 1540-1575 (the precedent loop) and 1755-1780 (`executeUpsertBatch`), plus wherever `columnsPerRow` is set on an upsert plan (search `columnsPerRow` in write.js).
- `scripts/lib/pipeline.js` lines 826-836 (`maxRowsPerInsert`).
Do not read the whole of either file.

## Facts already measured (do NOT search for them; no repo-wide grep_files, no grep without a `path` inside scripts/lib/step)
- `pipeline` is already required in write.js at line 61: `const pipeline = require('../pipeline');`.
- Every upsert plan sets `columnsPerRow` (write.js:1367 `columnsPerRow: stepColumns.length`), so no fallback is needed; use `plan.columnsPerRow`.
- `executeUpsertBatch` is exported (write.js:2242, in `module.exports`).
- Test import style (copy src/tests/step-library.logic.test.ts:27-33): `import { describe, expect, it } from 'vitest';` and `import { join } from 'node:path';`, then the line `/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS libraries */` and `const write = require(join(process.cwd(), 'scripts/lib/step/write.js'));`
- Your edit is ~15 lines inside `executeUpsertBatch` (write.js:1770-1777). Read at most write.js 1545-1562 and 1765-1780.

## Red (write this test FIRST and run it, so it FAILS against the current code)
Create `src/tests/step-upsert-bind-limit.logic.test.ts`, starting with the header
`// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-CU (one upsert statement binds at most 65,535 parameters)`.
Use a fake `client` whose `query(sql, values)` records `values.length` for each call and returns `{ rows: values-derived rows }`, with each returned row carrying `is_insert: true` for the first half of the input rows and `false` for the rest. Build a plan object with:
- `columnsPerRow: 10`,
- `bindRow: (row) => [row.a, row.b, …10 values]`,
- `upsertSqlFor: (n) => \`SQL with ${n} rows\``.
Assert:
1. 7,000 rows × 10 columns: `client.query` is called ≥ 2 times; EVERY call's `values.length` ≤ 65,535; the sum of the calls' `values.length` = 70,000; `inserted + updated` = 7,000; `inserted` = the total `is_insert:true` count.
2. 100 rows: exactly one call (no behaviour change below the limit).
3. 0 rows: no call, and the result is `{ inserted: 0, updated: 0 }`.
Run it before the fix and confirm case 1 fails.

## Fix
Inside `executeUpsertBatch` only: stride `rows` by `pipeline.maxRowsPerInsert(plan.columnsPerRow)`, exactly as the precedent loop does. Issue one `client.query(plan.upsertSqlFor(slice.length), values)` per slice and sum `inserted` and `updated` across slices. 

Invariants to KEEP:
- Same `client`. The caller owns the transaction, so do not open or commit one here.
- The return shape stays `{ inserted, updated }`. `inserted` still comes from `RETURNING (xmax = 0)`/`is_insert`, never a literal.
- Row order is preserved across slices.
- No change to any other function, to SQL text, to `upsertSqlFor`/`bindRow`, or to the 0-rows early return.
- Keep the file's line endings and style; add a short comment citing R-CU above the loop.

## Gate answers
- This is library code (`scripts/lib/step/**`): no compute-purity codes apply. `lib_fingerprint` WILL change, which is expected; the orchestrator schedules the fleet recapture.

## Green
- `npx vitest run src/tests/step-upsert-bind-limit.logic.test.ts src/tests/step-library.logic.test.ts --poolOptions.forks.maxForks=4 --poolOptions.forks.minForks=1`
- `npx vitest run src/tests/steps/link_massing src/tests/steps/link_parcels src/tests/steps/link_parcel_addresses --poolOptions.forks.maxForks=4 --poolOptions.forks.minForks=1`
- `npm run typecheck`
Report every red. Golden-fingerprint / lib_fingerprint staleness reds in other suites are expected and must NOT be "fixed".

## Commit
Do NOT commit.
