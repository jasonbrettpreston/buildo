// SPEC LINK: docs/specs/01-pipeline/122a_step_optimization_appendix.md §A17 (0fs; RE-FREEZE #28, logged in 122 §8)
//
// INGESTOR prerequisite 0fs (part D) — THE FULL RUN, end to end.
//
// Parts A (acquire), B (runner) and C (schema) lock the three seams of filesystem
// acquisition one at a time: `resolveLocalSource`/`copyLocalFile`, the path-bearing
// primary's selection + its `no_source_file` signal, and the schema rules that make a
// `path`-bearing external representable at all. This file locks what NONE of them can:
// that the whole assembled thing — a REAL descriptor, an operator who has not dropped
// the file, the real `step(...).run(...)` lifecycle and the runner's own ledger — lands
// a COMPLETED `skip_gated` run that fetched nothing and wrote nothing.
//
// T7c is deliberately the integrated claim, so it asserts exactly four things and no
// more (§4 of the plan, and the LPA-D4 note: whether a `skip_gated` terminal needs a
// `when:"pre"` check is a REGISTRY invariant, owned by step-conformance's LPA-D4, not
// by a full-run behavioural test — so it is not asserted here):
//
//   (1) `out.status === 'completed'` — the missing file is the DECLARED outcome, not an
//       error and not a `failed` ledger row;
//   (2) the injected `fetch` was called 0× — nothing is downloaded, not even a HEAD;
//   (3) `pool.sql` contains an `UPDATE pipeline_runs` — the runner-owned ledger row is
//       finalized (the Commit E fence: a run that reaches a terminal must close its own
//       row, never leave it `running`);
//   (4) `pool.sql` contains NO `INSERT INTO address_points` — a skip writes nothing.
//
// RED BEFORE 0fs, and for ONE reason: the descriptor is REJECTED AT CONSTRUCTION.
// `step(descriptor, compute)` AJV-validates against step.schema.json, and
// `inputs.reads.externals.items` declares `additionalProperties: false` with no `path`
// property [READ step.schema.json:1948], so `D` fails with
//   /inputs/reads/externals/0: must NOT have additional properties {"additionalProperty":"path"}
// The runner is never reached, which is exactly why this test belongs in its own file:
// it is the one place the SCHEMA, the SEAM and the LIFECYCLE are exercised as one
// descriptor rather than three isolated units.
import { describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS libraries */
const stepLib = require(join(process.cwd(), 'scripts/lib/step'));
const LOAD_ADDRESS_POINTS = require(join(process.cwd(), 'scripts/load-address-points.descriptor.json'));
const addressPointsCompute = require(join(process.cwd(), 'scripts/lib/compute/load-address-points.js'));
/* eslint-enable @typescript-eslint/no-require-imports */

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));

/**
 * D — the descriptor under test. A clone of the REAL address_points descriptor (so the
 * INGESTOR profile, the write target, the checks and the terminals are the shipped ones,
 * not a hand-rolled approximation), with exactly two changes:
 *
 *   1. `inputs.reads.externals[0]` becomes the filesystem PRIMARY: the same id, the same
 *      `format`/`csv_options`/`key_property`, but a repo-relative `path` — a pattern that
 *      matches nothing, which is the PREMISE of the test (no WSIB-style file has been
 *      dropped into `data/` yet). `url`, `license` and `on_head_error` are REMOVED rather
 *      than left inert: a url+path pair is a refusal (runner (viii)) and would turn this
 *      into a construction test wearing a full-run test's name. `cache:"none"` was kept —
 *      a local file is never a revalidated artifact — but the cache field itself was
 *      DELETED in the Phase 3 RE-FREEZE, so it is no longer declared here.
 *
 *   2. The terminal `skipped_no_source_file` is APPENDED to `terminals[]`. Load-address-
 *      points declares no `skip_gated` terminal at all (its normal exit is `loaded`), so
 *      without this the terminal refused by (vii) would not exist and the skip would be
 *      mislabelled by `selectTerminal`'s `pool[0]` fallback.
 *
 * The address_points clone is deliberate per the brief: `checks[]` there declares no
 * `when:"pre"` check, so the run takes the pre-checks-only path with an empty selection —
 * and because that makes the LPA-D4 registry question inapplicable, this test asserts
 * only the four lifecycle facts above.
 */
function D(): Record<string, unknown> {
  const d = clone(LOAD_ADDRESS_POINTS) as Record<string, unknown> & {
    inputs: { reads: { externals: Array<Record<string, unknown>> } };
    terminals: Array<Record<string, unknown>>;
  };
  const source = d.inputs.reads.externals[0]!;
  d.inputs.reads.externals[0] = {
    id: source.id,
    kind: 'filesystem',
    path: 'data/NoSuchFile*.csv',
    format: source.format,
    csv_options: source.csv_options,
    key_property: source.key_property,
  };
  d.terminals.push({
    id: 'skipped_no_source_file',
    kind: 'skip_gated',
    status: 'completed',
    records_meta: { audit_table: 'object', terminal: 'string' },
    why: {
      text: 'no WSIB-style file has been dropped into data/ yet',
      liveness: { kind: 'file', ref: 'scripts/lib/step/acquire.js' },
    },
  });
  return d;
}

type FakePoolOpts = { logicVars?: Record<string, unknown> };

/**
 * The minimal fake pool the LR-D9 test in src/tests/step-library.logic.test.ts uses
 * (copied from 0w-runner's own helper): SQL text is recorded, logic_variables rows are
 * answered, everything else is `{rows: []}`. The recorded `sql[]` is what T7c's ledger
 * assertions read — the pool IS the ledger observer here, which is the point of a
 * full-run test: no spy, no seam, just the statements a real run would have issued.
 */
function fakePool(opts: FakePoolOpts = {}) {
  const sql: string[] = [];
  const answer = (text: string) => {
    if (text.includes('FROM logic_variables')) {
      return {
        rows: Object.entries(opts.logicVars ?? {}).map(([variable_key, variable_value]) => ({
          variable_key, variable_value, variable_value_json: null,
        })),
      };
    }
    if (text.includes('current_database()')) {
      return { rows: [{ database: 'postgres', db_user: 'postgres', has_tracking: true }] };
    }
    if (text.includes('FROM public.schema_migrations')) return { rows: [{ n: 999 }] };
    if (text.includes('pg_try_advisory_xact_lock')) return { rows: [{ acquired: true }] };
    if (text.startsWith('INSERT INTO pipeline_runs')) return { rows: [{ id: 4242 }] };
    // The full run captures one DB timestamp (pipeline.getDbTimestamp: `SELECT NOW() AS now`).
    if (/SELECT NOW\(\) AS now/i.test(text)) return { rows: [{ now: new Date('2026-09-28T00:00:00Z') }] };
    return { rows: [] };
  };
  const record = async (text: string) => { sql.push(text); return answer(text); };
  return { sql, query: record, connect: async () => ({ query: record, release: () => {} }) };
}

/**
 * The seeded tunables — every `config.logic_variables[].name` of THIS descriptor at its
 * default from the committed seed registry, so the hoisted config resolution succeeds
 * and the run reaches the phase that returns the skip. Same helper shape as 0w-runner's
 * `seedConfig` and step-library's `seededLogicVars` (:2022-2028).
 */
function seededLogicVars(): Record<string, number> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- the committed seed registry
  const seed = require(join(process.cwd(), 'scripts/seeds/logic_variables.json')) as Record<string, { default: number }>;
  const out: Record<string, number> = {};
  for (const v of LOAD_ADDRESS_POINTS.config.logic_variables as Array<{ name: string }>) {
    out[v.name] = seed[v.name]!.default;
  }
  return out;
}

describe('INGESTOR prerequisite 0fs — the full run: an absent file lands a completed skip', () => {
  // -------------------------------------------------------------------------
  // T7c RED — the schema rejects `path`
  // (`/inputs/reads/externals/0: must NOT have additional properties`).
  //
  // The integrated claim, and the only one of the four parts' tests that goes
  // through `step(...).run(...)`: one real descriptor, absent file, real
  // lifecycle. `pool` is the run's OWN ledger, so "finalized" and "wrote
  // nothing" are read off the statements a production run would have issued
  // rather than off a mock's call count.
  // -------------------------------------------------------------------------
  it('T7c — an absent filesystem source lands a COMPLETED skip: no fetch, the ledger row finalized, nothing written', async () => {
    const pool = fakePool({ logicVars: seededLogicVars() });
    const fetch = vi.fn(async () => { throw new Error('an absent local file must not reach the network — not even a HEAD'); });

    // RED today: this THROWS at construction...
    // chainId null = standalone: the runner OWNS the ledger row (ledger.js ownsLedgerRow =
    // `!chainId`), so it opens and finalizes it. Under a chain id run-chain.js owns the row
    // and the runner issues no `UPDATE pipeline_runs` at all.
    const out = await stepLib.step(D(), addressPointsCompute).run({ pool, chainId: null, fetch }) as {
      status: string;
    };

    // ...so none of the four assertions below is reached until `path` is representable.
    expect(out.status, 'a declared-but-absent source is a completed skip, never a failure').toBe('completed');
    expect(fetch, 'the absent file costs no network call at all — no HEAD, no GET').toHaveBeenCalledTimes(0);
    expect(
      pool.sql.some((s) => /UPDATE pipeline_runs/i.test(s)),
      'the runner-owned ledger row is finalized (Commit E) — a terminal run never leaves its row `running`',
    ).toBe(true);
    expect(
      pool.sql.some((s) => /INSERT INTO address_points/i.test(s)),
      'a skip writes NOTHING — no guarded upsert is attempted',
    ).toBe(false);
  });
});
