---
write_scope:
- src/tests/db/refresh-snapshot-recorder-bound.db.test.ts
---
# WF2 hygiene H5/C5 — V1 "deadline exhausted by the main reads" must be deterministic — STOP BEFORE COMMIT

## Goal
In `src/tests/db/refresh-snapshot-recorder-bound.db.test.ts`, the test `(V1) a phase deadline already exhausted by the main reads skips EVERY optional read up front ...` declares a 1 ms deadline (`test_v1_exhausted_deadline_min: 1 / 60000`). `runRecorderPhase` (scripts/lib/step/index.js, READ ONLY — never edit it) arms a real `setTimeout(phaseDeadlineMs)` that `pg_cancel_backend`s the main read; on CI the 1 ms fired DURING the main read, so the main read was cancelled and the step threw. A wall-clock race by construction. The optional-skip branch is decided by `const elapsedBeforeOptional = Date.now() - phaseStartMs;` then `remainingBudgetMs(phaseDeadlineMs, elapsedBeforeOptional) <= 0` (read index.js around `elapsedBeforeOptional`).

## Fix (this test only; no production change)
Exhaust the budget BY CONSTRUCTION, not by a tiny wall-clock value:
1. Declare a 1-minute deadline: `const config = { test_v1_exhausted_deadline_min: 1 };` (60 000 ms — the real cancel timer can never fire during an instant `SELECT`).
2. Give the main read a unique marker SQL: `sql: 'SELECT 1 AS v1_main_marker'`.
3. Wrap the pool: `const clockPool = { ...pool-like }` — simplest: an object whose `connect()` calls `pool.connect()` and returns the client with its `query` wrapped so that, AFTER the real query whose text contains `v1_main_marker` resolves, a closure variable `offsetMs` is set to `120000`. Pass every other property the phase uses through (read index.js `connectPair` + `runRecorderPhase` to see whether it calls anything on `pool` besides `connect`; forward those too). Type it loosely with a narrow local interface — no `any`.
4. `const realNow = Date.now.bind(Date); const spy = vi.spyOn(Date, 'now').mockImplementation(() => realNow() + offsetMs);` before the call, and `spy.mockRestore()` in a `finally`. Import `vi` from vitest.
5. Keep every existing assertion unchanged (both optional keys in `optional_failed`, `cancelled: true`, `cancel_kind: 'phase_deadline'`, `elapsed_ms: 0`, `row_count: null`). ADD: the main entry `main_instant` has `phase: 'main'` and `cancelled` undefined (proves the main read was NOT cancelled — the CI failure mode).
6. Replace the comment above the old 1 ms config with: the budget is exhausted by an injected clock jump after the main read, so the real 60 s cancel timer can never race the main read (CI 2026-09-27 run on d968e3e9 cancelled the main read at 1 ms).

## Gate answers
Test-only; sets no descriptor field, logic variable, check limit, emits key or counters source — no Spec 124 §5 R-BA gate reads it.

## Green
`npx tsc --noEmit`; `npx eslint src/tests/db/refresh-snapshot-recorder-bound.db.test.ts`; `npx vitest run src/tests/db/refresh-snapshot-recorder-bound.db.test.ts` (without a DB the DB blocks skip — the orchestrator runs it against a DB).

## Stop
UNCOMMITTED. Do not call git_commit. Report the diff.
