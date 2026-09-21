// SPEC LINK: docs/specs/01-pipeline/30_pipeline_architecture.md §5.4.1
// SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md
//
// C4 — per-site halt-classification gate for assert_data_bounds. THE
// RED-FIRST PROOF (`.cursor/active_task.md` §"C4 — WF2 v2 (2026-08-13)").
//
// The defect this pins: pre-conversion, `:999` threw on `errors.length > 0` —
// every threshold-derived push in the file was class-blind fatal, including
// sites whose own audit row never leaves PASS/WARN territory the operator
// intended as non-actionable (the `cost_outliers` fence, `f238b814`). The fix
// (Spec 30 §5.4.1) is a per-SITE exception-vs-threshold split: only an
// EXCEPTION propagating out of compute() halts the step; a threshold-derived
// FAIL/WARN row never does.
//
// ── COMMIT 8c REFACTOR — direct `compute()` invocation, not a spawned child ──
//
// This file originally (2026-08-13) spawned `scripts/quality/assert-data-
// bounds.js` as a REAL CHILD PROCESS against a `BUILDO_TEST_DB=1` testcontainer,
// because at that time the step was an unconverted 1,055-line monolith with no
// exported pure function to call directly — a red-first proof against a
// not-yet-existing library required exercising the real file end to end.
//
// Batch 1 I2 (2026-09-12) converted this step onto the Spec 122 step standard.
// Every converted step's frozen shell now begins with `descriptor.database.
// assert_current_database: "postgres"`, enforced unconditionally by
// `scripts/lib/step/index.js`'s `assertDatabaseTarget` — so a spawned child
// process now REFUSES outright against any testcontainer not literally named
// "postgres" ("REFUSING: connected to database X, expected one of postgres").
// ⚠️ CORRECTED (LW-D16 root cause, WF3 2026-09-21): that gap is CLOSED — the
// harness now provisions a database literally named `postgres`
// (`setup-testcontainer.ts`'s TEST_DATABASE_NAME), which the guard accepts, so
// a spawned child / a real `.run({pool})` no longer refuses. The direct-
// `compute()` convention described below remains valid and this file is left on
// it; it is now a CHOICE (a narrower unit), no longer a forced workaround.
//
// This was a FLEET-WIDE, pre-existing structural gap (not specific to this
// step): every other converted step's own DB regression test already avoided
// it by invoking `scripts/lib/compute/<slug>.js` DIRECTLY rather than spawning
// the frozen shell — see `src/tests/db/link-wsib-token-overlap.db.test.ts`
// (`require(...link-wsib.js)` + real SQL against the pool) and
// `src/tests/db/compute-centroids-full-recompute.db.test.ts` (`require(...
// compute-centroids.js)` + `scripts/lib/step/write.js` called directly against
// a real pool, explicitly to avoid spawning the real script — see that file's
// own header). This commit brings `assert_data_bounds`'s halt-classification
// lock onto the SAME fleet convention: `compute()` is required directly and
// driven with a hand-built `ctx` (pool/config/checks/report/log), mirroring
// the exact shape `scripts/lib/step/index.js` builds for a real run (`ctx.
// checks = selectChecks(descriptor, chainId).map(c => c.id)`, `ctx.report`
// writing into an `observations` map, `ctx.config` = resolved logic_variables).
// `buildAuditTable` (the SAME function the real runner calls,
// `scripts/lib/step/verdict.js`) reconstructs the audit table + verdict from
// those observations, so a Case A/C assertion is checking the IDENTICAL
// row-derivation code path a real run uses — not a re-implementation of it.
//
// A SECOND, independent break found while refactoring: the old file's final
// "source assertion" test scanned `SCRIPT` (the pre-conversion step file) for
// literal `errors.push(wsibErr.message)` / `fatalErrors.push(...)` text — none
// of that text exists anywhere post-conversion (the frozen shell is 8 lines;
// `fatalErrors[]` was never ported as a literal array — see
// `scripts/lib/compute/assert-data-bounds.js`'s own header for the mechanism
// it preserves instead: WSIB/inspection loaders have NO per-check `try/catch`
// in the dispatch loop, so their errors propagate OUT OF `compute()` uncaught,
// exactly like the pre-conversion `fatalErrors`-gated throw did). Replaced with
// a static assertion against the NEW mechanism: `NON_FATAL_LOADERS` (the one
// named Set controlling which loaders DO get a per-check catch) is exactly
// `{'costest','ghost'}` — `'wsib'`/`'inspection'` are absent, i.e. still
// fatal-eligible. Case B below is the BEHAVIOURAL proof of the same claim for
// the 'permits' loader (also absent from the set, also uncaught) — the static
// check covers the 2 loaders ('wsib','inspection') this suite cannot
// provoke behaviourally (no reachable non-"does not exist" failure in them
// without corrupting the schema — same coverage ceiling the pre-conversion
// suite stated).
//
// ⚠️ THIS SUITE MUTATES SCHEMA (renames permit_trades) — same hard isolation
// guard as before: BUILDO_TEST_DB=1 or CI=true required, loopback host only.
// NOTE (2026-09-13, commit 8c): in a dev environment where `DATABASE_URL` is
// AMBIENT (set in `.env` to a persistent local Postgres, not a disposable
// testcontainer), `setup-testcontainer.ts`'s own `setup()` short-circuits on
// it BEFORE ever consulting `BUILDO_TEST_DB` — so `BUILDO_TEST_DB=1` does NOT
// guarantee an isolated, empty container; it may mean "the same shared dev DB
// every other session reads." Case A/C's own residue-precondition assertions
// (exact counts) assume a fresh, empty `permits` table (true for a genuine
// testcontainer boot, seeded only by migrations) and are NOT valid against a
// populated shared DB. Run this suite only where BUILDO_TEST_DB=1 genuinely
// provisions an isolated container (CI, or a dev machine with no ambient
// DATABASE_URL) — see this commit's own report §8c for why it was not
// executed live in this session.
//
// Run: BUILDO_TEST_DB=1 npx vitest run src/tests/db/assert-data-bounds-halt.db.test.ts

import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';

const pool = getTestPool();
const REPO_ROOT = path.resolve(__dirname, '../../../');
const COMPUTE_PATH = path.join(REPO_ROOT, 'scripts/lib/compute/assert-data-bounds.js');
const DESCRIPTOR_PATH = path.join(REPO_ROOT, 'scripts/quality/assert-data-bounds.descriptor.json');

// eslint-disable-next-line @typescript-eslint/no-require-imports -- CJS compute module
const compute = require(COMPUTE_PATH) as (ctx: unknown) => Promise<void>;
// eslint-disable-next-line @typescript-eslint/no-require-imports -- the real descriptor
const descriptor = require(DESCRIPTOR_PATH) as {
  checks: Array<{ id: string; chains: string[] | 'all' }>;
  sharing: { varies_by_chain: { checks: string } };
  config: { logic_variables: Array<{ name: string; default: number }> };
};
// eslint-disable-next-line @typescript-eslint/no-require-imports -- CJS library module
const verdictLib = require(path.join(REPO_ROOT, 'scripts/lib/step/verdict.js')) as {
  selectChecks: (d: typeof descriptor, chainId: string | null) => Array<{ id: string }>;
  buildAuditTable: (
    d: typeof descriptor,
    chainId: string | null,
    observations: Record<string, unknown>,
    extraRows: unknown[],
    config: Record<string, number>,
  ) => {
    audit_table: { verdict: string; rows: Array<{ metric: string; value: unknown; status: string }> };
    rows: Array<{ metric: string; value: unknown; status: string }>;
    errors: string[];
    warnings: string[];
  };
};

/** Fixture key prefix — every seeded permits row is deleted by prefix. */
const FX = 'C4DBHALT';
/** Rename target for Case B — never DROP, see the file-level comment. */
const BAK_TABLE = '_c4_permit_trades_bak';

describe.skipIf(!dbAvailable())('assert_data_bounds — per-site halt-classification gate (C4, direct compute())', () => {
  if (!pool) {
    // Throw ONLY in an opted-in DB run (BUILDO_TEST_DB/CI) — there a missing pool
    // means silently registering zero tests (the DeepSeek false-green trap). In a
    // plain `npm run test` (no opt-in) dbAvailable() can be true off an ambient
    // DATABASE_URL while getTestPool() correctly refuses — that is the C1 model's
    // designed silent skip, not a defect.
    if (process.env.BUILDO_TEST_DB === '1' || process.env.CI === 'true') {
      throw new Error('dbAvailable() is true but pool is missing — refusing to silently register zero tests.');
    }
    return;
  }

  // ── HARD ISOLATION GUARD (C1 pattern, unchanged from the pre-refactor file) ──
  if (!process.env.DATABASE_URL) {
    throw new Error('dbAvailable() is true but DATABASE_URL is unset — refusing to mutate an unknown database.');
  }
  const dbUrl = new URL(process.env.DATABASE_URL);
  const optedIn = process.env.BUILDO_TEST_DB === '1' || process.env.CI === 'true';
  const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
  if (!optedIn) {
    throw new Error(
      'assert-data-bounds-halt.db.test.ts renames permit_trades and seeds permits rows. ' +
      'Refusing to run without an explicit opt-in (BUILDO_TEST_DB=1 or CI=true) — an ambient ' +
      'DATABASE_URL is NOT sufficient, because setup-testcontainer.ts short-circuits on it.',
    );
  }
  if (!LOOPBACK.has(dbUrl.hostname)) {
    throw new Error(`Refusing to mutate schema on non-loopback host "${dbUrl.hostname}".`);
  }
  if (dbUrl.pathname.length <= 1) {
    throw new Error(`DATABASE_URL has no database path: ${dbUrl.protocol}//${dbUrl.host}${dbUrl.pathname}`);
  }

  /** Resolve ctx.config the same way a real run does: live `logic_variables`
   * row, `parseFloat`, falling back to the descriptor's own declared default —
   * mirrors `config-loader.js`'s numeric-var resolution (no JSON vars declared
   * by this descriptor). */
  async function resolveConfig(): Promise<Record<string, number>> {
    const names = descriptor.config.logic_variables.map((v) => v.name);
    const { rows } = await pool!.query<{ variable_key: string; variable_value: string }>(
      `SELECT variable_key, variable_value FROM logic_variables WHERE variable_key = ANY($1::text[])`,
      [names],
    );
    const live = new Map(rows.map((r) => [r.variable_key, parseFloat(r.variable_value)]));
    const config: Record<string, number> = {};
    for (const v of descriptor.config.logic_variables) {
      const value = live.get(v.name);
      config[v.name] = Number.isFinite(value) ? (value as number) : v.default;
    }
    return config;
  }

  /** Build the SAME shape of `ctx` `scripts/lib/step/index.js` hands to
   * `compute()` for a real run, narrowed to `chainId`'s selected checks
   * (`selectChecks`, the identical function the real runner and
   * `buildAuditTable` both use — no re-derivation of chain gating here). */
  function buildCtx(chainId: string, config: Record<string, number>) {
    const declared = new Set(descriptor.checks.map((c) => c.id));
    const observations: Record<string, unknown> = {};
    const ctx = {
      pool,
      chainId,
      descriptor,
      checks: verdictLib.selectChecks(descriptor, chainId).map((c) => c.id),
      log: { info: () => {}, warn: () => {}, error: () => {} },
      config,
      report(checkId: string, observation: unknown) {
        if (!declared.has(checkId)) {
          throw new Error(`compute reported check "${checkId}", which the descriptor does not declare`);
        }
        observations[checkId] = observation;
      },
    };
    return { ctx, observations };
  }

  /** Run compute() for `chainId` and reconstruct the SAME audit table a real
   * run would emit (`buildAuditTable`, the library's own function — not a
   * re-implementation). Rejects if compute() itself rejects (Case B). */
  async function runChain(chainId: string) {
    const config = await resolveConfig();
    const { ctx, observations } = buildCtx(chainId, config);
    await compute(ctx);
    return verdictLib.buildAuditTable(descriptor, chainId, observations, [], config);
  }

  async function clearFixtures(): Promise<void> {
    await pool!.query(`DELETE FROM permits WHERE permit_num LIKE $1`, [`${FX}%`]);
  }

  /**
   * Idempotent rename-back-if-exists. Runs in BOTH beforeEach (recovers from
   * a prior crashed run that left permit_trades renamed) and afterEach
   * (restores immediately after Case B within this run).
   */
  async function restorePermitTradesIfRenamed(): Promise<void> {
    await pool!.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = '${BAK_TABLE}')
           AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'permit_trades') THEN
          ALTER TABLE ${BAK_TABLE} RENAME TO permit_trades;
        END IF;
      END
      $$;
    `);
  }

  beforeEach(async () => {
    await restorePermitTradesIfRenamed();
    await clearFixtures();
  });
  afterEach(async () => {
    await restorePermitTradesIfRenamed();
    await clearFixtures();
  });
  afterAll(async () => {
    if (!pool) return;
    await restorePermitTradesIfRenamed();
    await clearFixtures();
    await pool.end();
  });

  it('Case A — Pre-Permit threshold breach is a row-level FAIL, never a thrown exception', async () => {
    await pool!.query(
      `INSERT INTO permits (permit_num, revision_num, permit_type, status)
       VALUES ($1, '00', 'Pre-Permit', 'Under Review')`,
      [`${FX}1`],
    );

    // PRECONDITION — valid only against an isolated, empty-of-residue container
    // (see the file-level "AMBIENT DATABASE_URL" note above).
    const preCheck = await pool!.query(`SELECT COUNT(*) FROM permits WHERE permit_type='Pre-Permit'`);
    expect(
      Number(preCheck.rows[0].count),
      `container residue detected (sibling test leakage?) — expected 1, found ${preCheck.rows[0].count}`,
    ).toBe(1);

    const built = await runChain('permits');

    const preRow = built.rows.find((x) => x.metric === 'permits_pre_permit_count');
    expect(preRow, `no permits_pre_permit_count row: ${JSON.stringify(built.rows)}`).toBeDefined();
    expect(preRow?.status).toBe('FAIL');

    // DeepSeek-idiom exact-set: prove this seed is disjoint from Case C's own seed.
    const failMetrics = built.rows.filter((r) => r.status === 'FAIL').map((r) => r.metric).sort();
    expect(
      failMetrics,
      'Case A must be Pre-Permit-ONLY. Any other FAIL metric means chain scoping or fixture isolation broke.',
    ).toEqual(['permits_pre_permit_count']);

    // THE halt-classification proof: a threshold-derived FAIL is a ROW, not a
    // thrown exception. compute() above already resolved without throwing —
    // reaching this line at all is the non-halting proof; the verdict carries
    // the FAIL, exactly as Spec 30 §5.4.1 requires.
    expect(built.audit_table.verdict).toBe('FAIL');
  }, 60_000);

  it("Case B — an exception mid-permit-branch propagates OUT OF compute() UNCAUGHT (THE load-bearing case)", async () => {
    // Provoke: permit_trades renamed out from under the orphan-trades LEFT
    // JOIN. Reversible (RENAME, never DROP) — restored in afterEach.
    await pool!.query(`ALTER TABLE permit_trades RENAME TO ${BAK_TABLE}`);

    const config = await resolveConfig();
    const { ctx } = buildCtx('permits', config);

    // THE single most important assertion in this file. `loadPermitsBranch`
    // (scripts/lib/compute/assert-data-bounds.js) has NO local try/catch — an
    // error querying the renamed-away table propagates straight out of
    // `compute()`. No downstream fallback (no pipeline.js placeholder, no
    // partial audit_table) exists at THIS layer to catch or soften it — that
    // is exactly the point: the step-library runner (scripts/lib/step/
    // index.js), one layer up, is what turns an uncaught compute() rejection
    // into a halted step (Spec 30 §5.4.1). A naive fix that wrapped the
    // permits branch in a swallow-everything catch (defanging the exception
    // class) would flip THIS assertion green while producing a PASS-shaped
    // result for a chain that never actually finished checking — the bug
    // this regression lock exists to catch.
    await expect(
      compute(ctx),
      'an exception inside the permits branch (no local catch) must reject compute(), not resolve with partial/placeholder rows',
    ).rejects.toThrow(/permit_trades[\s\S]*does not exist/);
  }, 60_000);

  it('Case C — cost_outliers regression lock: 1-19 is silent (PASS), no exception', async () => {
    // 5 permits over the live $2B ceiling (cost_outlier_ceiling_cad default) —
    // inside the [1,19] non-WARN band (cost_outlier_count_warn_max default 20).
    await pool!.query(
      `INSERT INTO permits (permit_num, revision_num, est_const_cost, status)
       SELECT $1 || g::text, '00', 2000000001, 'Under Review'
         FROM generate_series(1, 5) g`,
      [FX],
    );

    // PRECONDITION — valid only against an isolated, empty-of-residue container.
    const costCheck = await pool!.query(
      `SELECT COUNT(*) FROM permits
        WHERE est_const_cost < 0
           OR est_const_cost > (SELECT variable_value::numeric FROM logic_variables WHERE variable_key = 'cost_outlier_ceiling_cad')`,
    );
    expect(
      Number(costCheck.rows[0].count),
      `container residue detected (sibling test leakage?) — expected 5, found ${costCheck.rows[0].count}`,
    ).toBe(5);
    const prePermitCheck = await pool!.query(`SELECT COUNT(*) FROM permits WHERE permit_type='Pre-Permit'`);
    expect(
      Number(prePermitCheck.rows[0].count),
      `container residue detected (sibling test leakage?) — expected 0, found ${prePermitCheck.rows[0].count}`,
    ).toBe(0);

    const built = await runChain('permits');

    const costRow = built.rows.find((x) => x.metric === 'cost_outliers');
    expect(costRow, `no cost_outliers row: ${JSON.stringify(built.rows)}`).toBeDefined();
    expect(costRow?.status).toBe('PASS');
    expect(costRow?.value).toBe(5);

    // Isolation: no other FAIL/WARN entry from this seed.
    expect(built.errors).toEqual([]);
    expect(built.warnings.some((w) => /cost_outliers/i.test(w))).toBe(false);
  }, 60_000);

  it('Case C boundary — exactly 20 cost outliers: row WARN, verdict WARN, no exception', async () => {
    await pool!.query(
      `INSERT INTO permits (permit_num, revision_num, est_const_cost, status)
       SELECT $1 || g::text, '00', 2000000001, 'Under Review'
         FROM generate_series(1, 20) g`,
      [FX],
    );

    const built = await runChain('permits');

    const costRow = built.rows.find((x) => x.metric === 'cost_outliers');
    expect(costRow, `no cost_outliers row: ${JSON.stringify(built.rows)}`).toBeDefined();
    expect(costRow?.status).toBe('WARN');
    expect(costRow?.value).toBe(20);
    expect(built.audit_table.verdict).toBe('WARN');
    expect(built.warnings.some((w) => /cost_outliers/i.test(w))).toBe(true);
    expect(built.errors).toEqual([]);
  }, 60_000);

  it('static assertion — NON_FATAL_LOADERS is exactly {costest, ghost}: wsib/inspection stay fatal-eligible (no per-check catch)', () => {
    // wsib (:680-equivalent) and inspection (:811-equivalent) are NOT
    // behaviourally reachable by this suite: both loaders' own internal
    // "does not exist" guard routes every cheap provocation (a
    // dropped/renamed table) to a SKIP-safe report, not to an uncaught
    // throw — only a real, non-"does not exist" failure inside those
    // branches would reach the fatal path, and this repo has no such
    // provokable failure without corrupting the schema itself. Case B above
    // proves the SAME mechanism behaviourally for the 'permits' loader (also
    // absent from this set). This static check is the only cover wsib/
    // inspection's fatal-eligibility has — a future edit that silently adds
    // 'wsib' or 'inspection' to NON_FATAL_LOADERS (defanging the exception
    // class Spec 30 §5.4.1 names them for) is caught here, not behaviourally.
    const src = fs.readFileSync(COMPUTE_PATH, 'utf8');
    const m = src.match(/const NON_FATAL_LOADERS = new Set\(\[([^\]]*)\]\);/);
    expect(m, 'NON_FATAL_LOADERS declaration not found in scripts/lib/compute/assert-data-bounds.js').toBeTruthy();
    const loaders = (m?.[1] ?? '').split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
    expect(loaders.sort()).toEqual(['costest', 'ghost']);
  });
});
