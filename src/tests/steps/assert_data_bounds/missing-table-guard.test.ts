// SPEC LINK: docs/specs/01-pipeline/44_chain_deep_scrapes.md §4
//
// Regression lock for the review_followups LOW filed 2026-08-13 against
// `scripts/lib/compute/assert-data-bounds.js`'s WSIB branch.
//
// ── THE DEFECT THIS LOCKS ────────────────────────────────────────────────────
// `isMissingTable(err)` was written as "the error message contains `does not
// exist`" — with NO table name in the predicate. `loadWsibBranch` uses it to
// declare a missing `wsib_registry` table SKIP-safe (`{ checked: false, … }`,
// the intended deploy-ordering guard): the WSIB metrics legitimately may not
// have a table to read yet, and that must not halt the chain.
//
// But the branch's LAST query (`wsib_orphaned_links`) joins `entities`:
//     SELECT COUNT(*) FROM wsib_registry w
//      WHERE w.linked_entity_id IS NOT NULL
//        AND NOT EXISTS (SELECT 1 FROM entities e WHERE e.id = w.linked_entity_id)
// Postgres answers a missing `entities` with `relation "entities" does not
// exist` — which the table-agnostic predicate also matches. The whole WSIB
// block then reports "nothing to check" and the run PASSes. "I could not
// check" was reading as "nothing to check" — the exact inversion this repo's
// Nothing-Hidden rule forbids.
//
// ── THE FIX (commit under test) ──────────────────────────────────────────────
// The predicate NAMES the table it guards: `isMissingTable(err, 'wsib_registry')`
// matches `relation "wsib_registry" does not exist` (and tolerates the
// schema-qualified `public.wsib_registry` form). Only the guarded table is
// SKIP-safe; any OTHER missing relation rethrows out of `compute()` and halts
// the chain, which is the honest behaviour for an uncheckable metric.
//
// ── SIBLING CALL SITE (inspections — DISPOSITION: same defect shape, fixed) ──
// `loadInspectionBranch` is the second `isMissingTable(` call site (the third
// loader, `loadSourcesBranch`, holds the ravines/heritage/centreline guards).
// It HAD the same defect shape: its orphan query joins a second relation
// (`NOT EXISTS (SELECT 1 FROM permits p …)`), so a missing `permits` table
// used to match the table-agnostic predicate and SKIP the whole block. The
// guard now names `permit_inspections`, so a missing `permits` rethrows
// (ARM 5). [Landing note, orchestrator 2026-09-22: the engine's original
// docstring claimed this sibling "reads ONE table" — the Regression Guardian
// found the join; the engine's FIX was right, its stated reason was not.]
//
// ── WHY THIS IS A UNIT TEST, NOT A DB TEST ───────────────────────────────────
// The defect is entirely in the compute module's error CLASSIFICATION, so a
// fake `pool` that rejects on a chosen query exercises it exactly — no
// container, no DATABASE_URL, no ambient DB (the C1 model's safe default).
// The real-Postgres arm lives in src/tests/db/assert-data-bounds-halt.db.test.ts.

import path from 'node:path';
import { describe, it, expect } from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '../../../../');

// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS compute module, same as assert-data-bounds-halt.db.test.ts
const computeModule = require(path.join(REPO_ROOT, 'scripts/lib/compute/assert-data-bounds.js')) as {
  loadWsibBranch: (ctx: unknown) => Promise<Record<string, unknown>>;
  loadInspectionBranch: (ctx: unknown) => Promise<Record<string, unknown>>;
};

/** The exact SQL text of the WSIB orphan query — the ONLY wsib query that
 * touches `entities`. Asserting on this (not on call order) is what makes the
 * test fail for the RIGHT reason if the loader is ever reordered. */
const ENTITIES_JOIN_RE = /FROM\s+entities\b/i;

interface Stub { sql: string; params: unknown[] | undefined }
interface StubResult { rows: Array<Record<string, unknown>> }

/** A `pool` that records every statement and answers from `respond`, so a test
 * can reject ONE relation's query while the rest succeed (the deploy-ordering
 * shape: table A exists, table B does not). */
function makePool(respond: (sql: string, call: number) => StubResult) {
  const stubs: Stub[] = [];
  return {
    stubs,
    pool: {
      query: (sql: string, params?: unknown[]): Promise<StubResult> => {
        const call = stubs.length + 1;
        stubs.push({ sql, params });
        return Promise.resolve(respond(sql, call));
      },
    },
  };
}

/** `relation "<table>" does not exist` — Postgres 42P01's message, verbatim. */
function relationMissing(table: string): Error {
  return new Error(`relation "${table}" does not exist`);
}

/**
 * Run `fn` and hand back EITHER its resolved value or its rejection — for the
 * "returns the SKIP-safe row" arm we need the value, and for the "must throw"
 * arm we need to inspect the error. Never swallows anything silently: a
 * non-Error rejection is rethrown so a bad stub cannot read as a pass.
 */
async function settle<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: Error }> {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    if (!(err instanceof Error)) throw err;
    return { ok: false, error: err };
  }
}

/** A fresh ctx per call — the loader memo is a WeakMap keyed on ctx, so a new
 * object per test is what keeps the memo from leaking across arms. */
function ctxFor(pool: unknown) {
  return { pool, log: { info: () => {}, warn: () => {}, error: () => {} }, config: {} };
}

/** Table-existence oracle: every relation exists except the named ones — the
 * missing ones raise Postgres's own 42P01 message. */
function relationsExist(...missing: string[]) {
  const gone = new Set(missing);
  return (sql: string): StubResult => {
    for (const t of gone) {
      if (new RegExp(`(FROM|JOIN)\\s+${t}\\b`, 'i').test(sql)) throw relationMissing(t);
    }
    return { rows: [{ count: '3' }] };
  };
}

describe('assert_data_bounds — the missing-table guard names the table it guards', () => {
  // ── ARM 1 (RED at authoring time): the filed defect ───────────────────────
  it('loadWsibBranch THROWS when `entities` is missing — a `wsib_registry` outage must not mask an `entities` outage as a SKIP', async () => {
    const { pool, stubs } = makePool(relationsExist('entities'));
    const outcome = await settle(() => computeModule.loadWsibBranch(ctxFor(pool)));

    // Reaching the entities join at all is the precondition for this test to
    // mean anything: without it a vacuous pass is possible.
    expect(
      stubs.some((s) => ENTITIES_JOIN_RE.test(s.sql)),
      'the WSIB loader never issued the `entities` join query — this test is not exercising the defect',
    ).toBe(true);

    expect(
      outcome.ok,
      'loadWsibBranch RESOLVED while `entities` was missing — the broad "does not exist" predicate masked an uncheckable metric as `{ checked: false }` (review_followups LOW, 2026-08-13)',
    ).toBe(false);
    if (outcome.ok) throw new Error('unreachable — asserted above');
    expect(outcome.error.message).toMatch(/relation "entities" does not exist/);
  });

  // ── ARM 2: the INTENDED deploy-ordering guard must survive ────────────────
  it('loadWsibBranch still yields { checked: false } when `wsib_registry` itself is missing (the deploy-order guard this predicate exists for)', async () => {
    // The FIRST query is `SELECT COUNT(*) FROM wsib_registry` — the guard is
    // evaluated there, before any wsib_registry read can succeed.
    const { pool, stubs } = makePool(relationsExist('wsib_registry'));
    const branch = await computeModule.loadWsibBranch(ctxFor(pool));

    expect(stubs.length, 'expected the loader to stop at the first guarded query, not blanket-swallow a later failure').toBe(1);
    expect(stubs[0]?.sql).toMatch(/FROM\s+wsib_registry\b/i);
    expect(branch).toEqual({ checked: false, wsibNoName: 0, wsibNonG: 0, wsibBadNaics: 0, wsibOrphan: 0 });
  });

  // ── ARM 3: a genuinely unreachable database still halts ───────────────────
  it('loadWsibBranch rethrows a non-"does not exist" failure (a check that could not run is never a PASS)', async () => {
    const { pool } = makePool(() => { throw new Error('connection terminated unexpectedly'); });
    const outcome = await settle(() => computeModule.loadWsibBranch(ctxFor(pool)));
    expect(outcome.ok, 'a connection failure must not be classified SKIP-safe').toBe(false);
    if (outcome.ok) throw new Error('unreachable — asserted above');
    expect(outcome.error.message).toMatch(/connection terminated unexpectedly/);
  });

  // ── ARM 4: the healthy path is unperturbed ───────────────────────────────
  it('loadWsibBranch reports checked: true and parses all 4 WSIB metrics when every relation exists', async () => {
    const { pool, stubs } = makePool(relationsExist());
    const branch = await computeModule.loadWsibBranch(ctxFor(pool));

    expect(stubs.length, 'expected all 5 WSIB queries to run on the healthy path').toBe(5);
    expect(branch).toEqual({ checked: true, wsibNoName: 3, wsibNonG: 3, wsibBadNaics: 3, wsibOrphan: 3 });
  });

  // ── ARM 5: the sibling call site is NOT the same defect shape ────────────
  it('loadInspectionBranch — the sibling guard — stays SKIP-safe for its OWN single table and still rethrows a missing joined relation', async () => {
    // permit_inspections missing entirely → the guard's whole point.
    const gated = makePool(relationsExist('permit_inspections'));
    const skipped = await computeModule.loadInspectionBranch(ctxFor(gated.pool));
    expect(skipped.checked).toBe(false);
    expect(gated.stubs.length, 'the guard must stop at its first (count) query').toBe(1);

    // permit_inspections present, but a relation one of its queries joins is
    // not → the inspection branch reads exactly ONE table, so the only such
    // relation is `permits` (its orphan-inspections query). That must NOT be
    // read as "nothing to check": the guard names permit_inspections only.
    const { pool } = makePool(relationsExist('permits'));
    const outcome = await settle(() => computeModule.loadInspectionBranch(ctxFor(pool)));
    expect(outcome.ok, 'a missing `permits` relation must halt, not read as SKIP — the guard names permit_inspections').toBe(false);
    if (outcome.ok) throw new Error('unreachable — asserted above');
    expect(outcome.error.message).toMatch(/relation "permits" does not exist/);
  });
});
