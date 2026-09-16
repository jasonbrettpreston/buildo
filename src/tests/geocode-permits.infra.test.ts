// SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §7.6
// SPEC LINK: docs/specs/01-pipeline/60_shared_steps.md §"Geocode Permits"
//
// Regression lock (WF3-S2, `3e44218a`): `geocode_permits` must issue both of its UPDATEs —
// the main geocode join and the zombie cleanup — through ONE transaction client. If the
// zombie cleanup fails, the main geocode UPDATE must be rolled back, so a dashboard read can
// never see coordinates that disagree with the zombie-cleanup state.
//
// ⚠️ RE-POINTED AT COMMIT 7d, NEVER WEAKENED — and the reason is worth stating, because it is
// the fence the conversion plan walked straight past. Before the conversion this file drove
// `geocodePermits(pool, opts)` and injected `opts.withTransaction`. That `opts` seam was
// introduced by `3e44218a` *specifically so this test could exist without a live database*,
// and it is a CALLING CONVENTION — a fence with no home in any of the 20 descriptor
// categories, every one of which describes DATA (reads, writes, guards, counters). The
// Intent Ledger had no row for it and the plan named it nowhere; the Regression Guardian
// found it at the PLAN panel (assessment §1.8d, GRD-1).
//
// The frozen shell exports no such function — `module.exports = pipeline.step(descriptor,
// compute)` — so the test now drives THE LAYER THE BEHAVIOUR ACTUALLY MOVED TO: the compute
// module's two declared passes, executed against ONE client through the REAL class-N and
// class-O write executors, wrapped in a transaction harness of exactly the shape the original
// injected. Same two assertions, same injected failure on the 2nd UPDATE, one layer down.
//
// It also gains a half the original could not assert: that the second pass does NOT SWALLOW
// its own failure. The original proved the wrapper rolled back; this proves the pass lets the
// error reach the wrapper in the first place, which is what makes the rollback reachable.
//
// The complementary DESCRIPTOR-level half of the same guarantee (`execution.txn_scope: "step"`,
// both `execution.phases[].txn: "shared"`, no `post_commit` anywhere) is locked in
// `src/tests/steps/geocode_permits/violations.test.ts` as fence F3. Two locks, two layers,
// one fence — because the descriptor declaring a shared transaction and the compute actually
// using one are different claims.
import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../');
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any -- the real CJS compute module
const compute: any = require(path.join(REPO_ROOT, 'scripts/lib/compute/geocode-permits.js'));
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any -- the real CJS write library
const write: any = require(path.join(REPO_ROOT, 'scripts/lib/step/write.js'));
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any -- the real descriptor, so the generated class-O statement is the shipped one
const descriptor: any = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'scripts/geocode-permits.descriptor.json'), 'utf8'));

// The before-image artifact lands under a FIXTURE slug so a unit test never writes into the
// step's own golden directory; the mechanism under test is the ordering and the rollback,
// not the file path.
const FIXTURE_SLUG = 'fixture_geocode_permits_atomicity';
const RUN_AT = new Date('2026-09-16T00:00:00.000Z');

const STAT_ROW = {
  count: '100', total: '100', already_geocoded: '80', has_geo_id: '95',
  to_geocode: '15', geocoded: '95', has_geo_id_no_match: '5', no_geo_id: '5',
};

/** ONE client, shared by both passes — which is the whole point of the fence. */
function makeClient(opts?: { throwOnUpdateCall?: number }) {
  let updateCallCount = 0;
  const queryLog: string[] = [];

  return {
    query: vi.fn(async (sql: string) => {
      const norm = (typeof sql === 'string' ? sql : '').replace(/\s+/g, ' ').trim().slice(0, 60);
      queryLog.push(norm);
      if (/^UPDATE/i.test(norm)) {
        updateCallCount++;
        if (opts?.throwOnUpdateCall != null && updateCallCount === opts.throwOnUpdateCall) {
          throw new Error(`Injected failure on UPDATE call ${updateCallCount}`);
        }
      }
      if (norm.startsWith('SELECT COUNT')) return { rows: [STAT_ROW], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    }),
    queryLog,
  };
}

/**
 * The runner's own write seams, built over the REAL executors — `makeWriteSeams` in
 * `scripts/lib/step/index.js`. Reproduced here rather than imported because `runEnrichPhase`
 * needs a pool, a ledger row, a config map and a heartbeat client to reach them; the fence is
 * about the two statements sharing one client, and this is the smallest shape that proves it
 * without mocking the whole runner into meaninglessness.
 */
function makeCtx(client: ReturnType<typeof makeClient>) {
  return {
    full: false,
    scopeWhere: 'TRUE',
    staleOverlays: new Set<string>(),
    clock: { now: () => RUN_AT, asOfDate: () => '2026-09-16' },
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    config: {},
    scopeRunId: null,
    onProgress: vi.fn(),
    joinUpdate: async (ref: number, sql: string, params: unknown[]) =>
      write.executeSetBasedJoinUpdate(client, sql, params || []),
    retract: async (ref: number, scopeParams: unknown[]) => {
      const plan = write.buildWritePlan(descriptor.outputs.writes[ref], descriptor);
      // DELIBERATELY UNWRAPPED, exactly as the runner does it (R-M): a failed before-image
      // must fail the run BEFORE anything is retracted.
      await write.writeBeforeImage(client, plan, scopeParams || [], FIXTURE_SLUG, RUN_AT);
      return write.executeSetBasedClear(client, plan, scopeParams || []);
    },
  };
}

/** The transaction harness, the same shape `3e44218a`'s own test injected through `opts`. */
function makeTxn(client: ReturnType<typeof makeClient>) {
  let rolledBack = false;
  let committed = false;
  return {
    withTransaction: vi.fn(async (fn: (c: typeof client) => Promise<unknown>) => {
      try {
        const result = await fn(client);
        committed = true;
        return result;
      } catch {
        rolledBack = true;
        return undefined;
      }
    }),
    get _committed() { return committed; },
    get _rolledBack() { return rolledBack; },
  };
}

function cleanupFixture() {
  const dir = path.join(REPO_ROOT, 'docs/reports/golden', FIXTURE_SLUG);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

describe('geocode-permits — paired UPDATE atomicity (§7.6, WF3-S2 3e44218a)', () => {
  it('routes both UPDATEs through the SAME transaction client, in declared phase order', async () => {
    const client = makeClient();
    const txn = makeTxn(client);
    const ctx = makeCtx(client);

    await txn.withTransaction(async (c) => {
      for (const pass of compute.passes) await pass.run(c, ctx);
    });

    expect(txn.withTransaction).toHaveBeenCalledOnce();
    const updates = client.queryLog.filter((q) => /^UPDATE/i.test(q));
    expect(updates).toHaveLength(2);
    // Phase order is the declared order, and the two statements are distinguishable: the
    // join UPDATE carries the address_points FROM clause, the retraction sets NULLs.
    expect(updates[0]).toMatch(/^UPDATE permits p SET latitude = ap\.latitude/);
    expect(updates[1]).toMatch(/^UPDATE permits SET latitude = null/);
    expect(txn._committed).toBe(true);
    expect(txn._rolledBack).toBe(false);
    cleanupFixture();
  });

  it('rolls back the main geocode UPDATE when the zombie cleanup (2nd UPDATE) throws', async () => {
    const client = makeClient({ throwOnUpdateCall: 2 });
    const txn = makeTxn(client);
    const ctx = makeCtx(client);

    await txn.withTransaction(async (c) => {
      for (const pass of compute.passes) await pass.run(c, ctx);
    });

    expect(txn._rolledBack).toBe(true);
    expect(txn._committed).toBe(false);
    // Both statements were ISSUED; the 2nd threw before completing.
    const updates = client.queryLog.filter((q) => /^UPDATE/i.test(q));
    expect(updates).toHaveLength(2);
    cleanupFixture();
  });

  it('the zombie-cleanup pass does NOT swallow its own failure — the half the pre-conversion lock could not assert', async () => {
    const client = makeClient({ throwOnUpdateCall: 2 });
    const ctx = makeCtx(client);
    // Phase 1 first, so the retraction is reached with the same client.
    await compute.passes[0].run(client, ctx);
    // A pass that caught its own error would make the rollback above UNREACHABLE — the
    // wrapper can only roll back what propagates to it.
    await expect(compute.passes[1].run(client, ctx)).rejects.toThrow(/Injected failure on UPDATE call 2/);
    cleanupFixture();
  });

  it('the before image is written BEFORE the retraction statement (R-M), on the same client', async () => {
    const client = makeClient();
    const ctx = makeCtx(client);
    await compute.passes[1].run(client, ctx);
    const kinds = client.queryLog.map((q) => q.split(/\s+/)[0]?.toUpperCase());
    // The retraction target's before-image SELECT, then its UPDATE — never the reverse. The
    // retraction is scoped to rows whose geo_id has already vanished upstream, so the prior
    // coordinate exists nowhere else once the statement commits.
    expect(kinds).toEqual(['SELECT', 'UPDATE']);
    cleanupFixture();
  });
});
