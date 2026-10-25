// SPEC LINK: docs/specs/01-pipeline/134_resolve_bylaws.md (MATERIALIZER rows form; the batch core and the compute own NO db handle)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.4 (P1-C4a — witness
//   adoption: a `zero_statement` step proves, structurally, that its suite holds no pool/client)
//
// P1-C4a Fold 7 rulings 2/4 — `resolve_bylaws` joins the CLOSED adoption map (converted + pending) as `zero_statement`: its suites carry NO db
// handle (reads, writes and the once-per-run post read are library-owned, Spec 124 R-EH), so the `guarded` class would need a fixture record and
// the `legacy_oracle_excluded` class a legacy harness — neither applies. The class-marker lock in
// `src/tests/sql-witness-fixture.logic.test.ts` then requires this directory to contain the literal `must not touch the pool`, which this
// file supplies AND EXERCISES: every declared check is dispatched with a `pool` whose every access throws, and the throw never escapes.
import { describe, it, expect } from 'vitest';
import path from 'path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const REPO_ROOT = path.resolve(__dirname, '../../../../');
const COMPUTE = require(path.join(REPO_ROOT, 'scripts/lib/compute/resolve-bylaws.js')) as {
  compute: (ctx: Record<string, unknown>) => Promise<{ records_meta: Record<string, unknown> }>;
  checks: Record<string, unknown>;
};

/** A pool every access to which throws: if the compute reads the db handle, the throw surfaces. */
function throwingPool(): { query: () => never; connect: () => never; end: () => never } {
  const boom = (): never => {
    throw new Error('the compute must not touch the pool — reads/writes are library-owned (R-EH)');
  };
  return { query: boom, connect: boom, end: boom };
}

describe('resolve_bylaws — P1-C4a zero_statement adoption', () => {
  it('the compute runs on an EMPTY declared-check set WITHOUT ever touching a throwing pool', async () => {
    const reported: Array<[string, unknown]> = [];
    const result = await COMPUTE.compute({
      pool: throwingPool(), chainId: null, runId: null, descriptor: { identity: { name: 'resolve_bylaws' } }, checks: [] as string[], matched: {}, config: {},
      log: { info() {}, warn() {}, error() {} }, report(id: string, o: unknown) { reported.push([id, o]); },
    });
    expect(reported).toEqual([]);
    expect(result).toEqual(expect.objectContaining({ records_meta: expect.any(Object) }));
  });

  it('every DECLARED check dispatches WITHOUT a pool read — the pool throw never escapes', async () => {
    const ids = Object.keys(COMPUTE.checks);
    expect(ids.length).toBeGreaterThan(0);
    const errors: unknown[] = [];
    await COMPUTE.compute({
      pool: throwingPool(), chainId: null, runId: null, descriptor: { identity: { name: 'resolve_bylaws' } }, checks: ids, matched: {}, config: {},
      log: { info() {}, warn() {}, error() {} }, report(_id: string, o: { error?: unknown }) { if (o && o.error) errors.push(o.error); },
    });
    for (const err of errors) expect(String((err as Error)?.message ?? err)).not.toContain('must not touch the pool');
  });
});
