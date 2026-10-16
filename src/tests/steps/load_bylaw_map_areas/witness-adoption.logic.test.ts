// SPEC LINK: docs/specs/01-pipeline/58_source_zoning_bylaw.md §11.3 (standalone chain `bylaw_maps`, operator-triggered; pending per Spec 124 R-CS; the compute owns NO db handle)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.4 (P1-C4a — witness
//   adoption: a `zero_statement` step proves, structurally, that its suite holds no pool/client)
//
// P1-C4a Fold 7 rulings 2/4 — `load_bylaw_map_areas` joins the CLOSED adoption map (converted +
// pending) as `zero_statement`: its suites carry NO db handle (grep: no pool/client under
// `src/tests/steps/load_bylaw_map_areas/`), so the `guarded` class would need a fixture record and
// the `legacy_oracle_excluded` class a legacy harness — neither applies. The class-marker lock in
// `src/tests/sql-witness-fixture.logic.test.ts` then requires this directory to contain the
// literal `must not touch the pool`, which this file supplies AND EXERCISES: the compute is called
// with a `pool` whose every access throws, and the run must complete without that throw escaping.
//
// The compute reads `ctx.checks` / `ctx.acquired` / `ctx.written` / `ctx.report` / `ctx.log` —
// NEVER a db handle (A-1): acquisition and writes are library-owned.
import { describe, it, expect } from 'vitest';
import path from 'path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const REPO_ROOT = path.resolve(__dirname, '../../../../');

/** The compute module under test — the real `scripts/lib/compute/load-bylaw-map-areas.js`. */
const COMPUTE = require(path.join(REPO_ROOT, 'scripts/lib/compute/load-bylaw-map-areas.js')) as {
  compute: (ctx: Record<string, unknown>) => Promise<{ records_meta: Record<string, unknown> }>;
  checks: Record<string, unknown>;
};

/**
 * A pool every access to which throws. If the compute (or any check it dispatches) reads the
 * db handle, the throw surfaces — it must not, because reads/writes are library-owned (A-1).
 */
function throwingPool(): { query: () => never; connect: () => never; end: () => never } {
  const boom = (): never => {
    throw new Error('the compute must not touch the pool — reads/writes are library-owned (A-1)');
  };
  return { query: boom, connect: boom, end: boom };
}

describe('load_bylaw_map_areas — P1-C4a zero_statement adoption', () => {
  it('the compute runs on an EMPTY declared-check set WITHOUT ever touching a throwing pool', async () => {
    const pool = throwingPool();
    const reported: Array<[string, unknown]> = [];
    const ctx = {
      pool,
      chainId: null,
      runId: null,
      descriptor: { identity: { name: 'load_bylaw_map_areas' } },
      checks: [] as string[],
      acquired: {},
      written: null,
      config: {},
      log: { info() {}, warn() {}, error() {} },
      report(id: string, o: unknown) {
        reported.push([id, o]);
      },
    };
    // An empty `checks` list short-circuits the dispatch loop; the pool is never read.
    const result = await COMPUTE.compute(ctx);
    expect(reported).toEqual([]);
    expect(result).toEqual(expect.objectContaining({ records_meta: expect.any(Object) }));
  });

  it('every DECLARED check dispatches WITHOUT a pool read — the pool throw never escapes', async () => {
    const ids = Object.keys(COMPUTE.checks);
    expect(ids.length).toBeGreaterThan(0);
    const pool = throwingPool();
    const errors: unknown[] = [];
    const ctx = {
      pool,
      chainId: null,
      runId: null,
      descriptor: { identity: { name: 'load_bylaw_map_areas' } },
      checks: ids,
      acquired: {},
      written: null,
      config: {},
      log: { info() {}, warn() {}, error() {} },
      report(_id: string, o: { error?: unknown }) {
        if (o && o.error) errors.push(o.error);
      },
    };
    await COMPUTE.compute(ctx);
    // A check may fail on its OWN terms (an empty `acquired` has nothing to grade), but NONE of
    // those failures may be the pool throw — the compute must not touch the pool.
    for (const err of errors) {
      expect(String((err as Error)?.message ?? err)).not.toContain('must not touch the pool');
    }
  });
});
