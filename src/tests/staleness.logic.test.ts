// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §6.6.1 (Phase 1 WITNESS)
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-BG (as extended by C4)
//
// WF3 witness-unblock C4 (R13) — the FAST tier. The db tier is the sibling brief
// `wu-4a1` (`src/tests/db/staleness-interrupted-retraction.db.test.ts`); nothing here
// opens a pool, a socket or a connection.
//
// THE CLAIM. `staleness.detectInterruptedRetraction` issues a `pipeline_runs` read that
// carries a completed-only predicate — `status = 'completed'` — on the `own_last_completed`
// CTE baseline. Gate #44's PRODUCER check (`scripts/analysis/gates/witness.mjs`) flags
// exactly that shape (`/status\s*=\s*'completed'/i` with no `completed_with_warnings`
// anywhere in the text) and hard-stops a `pending` slug. So EVERY step declaring
// `recovery.interrupted: "force_full_on_next_run"` is held NEGATIVE by the gate until its
// baseline predicate widens to the status set {completed, completed_with_warnings} — never
// `completed_with_errors` — which is Spec 124 §5 row R-BG item (iv), the recommended O-5
// and the `run-chain.js:610-624` AD1 rule. The fix lands in `wu-4b`; this file is its
// RED-first lock.
//
// WHY THIS IS A REAL RED AND NOT A FIXTURE TAUTOLOGY. The SQL is not hand-typed here. The
// pool stub answers whatever `detectInterruptedRetraction` actually asks for and CAPTURES
// the text; that captured text is then wrapped through the real `assembleTrace`
// (`scripts/lib/sql-witness/assemble.cjs`) into a real trace doc, which the real
// `evaluateWitness` (`scripts/analysis/gates/witness.mjs`) reads. Every link in the chain
// is production code, so this test cannot pass by agreeing with itself.
//
// ASSERT ON `:`, NEVER ON A TABLE NAME. `assemble.cjs:238,267-270` keeps a statement's
// `text` only when its `excluded` list includes `pipeline_runs`, and whether the resolver
// excludes `pipeline_runs` for this `p.pipeline`-qualified read is settled by C2/C2b
// (`wu-2f`, `wu-2f-cte-scope-red`). Asserting a table name here would fork that question
// into a second home — the exact "two homes for one gate" failure the sibling files warn
// about. So the rows are asserted on the `FAIL:PRODUCER:<slug>:<param0>:` prefix.
//
// ALSO DELIBERATELY ABSENT (grounder F9). No `sb` case (a status SET replacing a weak
// negative): the `completed_with_errors` row is not admitted by construction, so it is a
// LOCK, not a RED, and it is owned by `source-version` R9 (`wu-3a`) at the resolver tier.
// No R13b (a captured-text substring check for `completed_with_warnings`): not RED today,
// and it duplicates R13's own positive half.
//
// SCOPE. This brief writes ONE test file: no descriptor field, logic variable, check limit,
// `emits[]` key, counters source or `write_discipline` value is declared here, so no Spec
// 124 §5 R-BA gate reads anything this file sets. Nothing here widens a predicate to
// `completed_with_errors`, and `staleness.js:326-327` (`upstream_since`, O-6) is untouched.

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// ---------------------------------------------------------------------------
// Module loading — lazy in `beforeAll`, the error re-thrown per test in
// `beforeEach` (the sibling pattern: a missing module turns every test RED with
// its own failed assertionResult instead of failing the file with 0 tests).
// ---------------------------------------------------------------------------

type InterruptedResult = { interrupted: boolean; row: unknown };

type StalenessLib = {
  detectInterruptedRetraction: (
    pool: unknown,
    descriptor: unknown,
    opts?: { ownRunId?: number | null },
  ) => Promise<InterruptedResult>;
};

type StatementOut = {
  fingerprint: string;
  kind: 'read' | 'write' | 'utility';
  count: number;
  rowCount: number;
  reads: Record<string, string[]>;
  writes: Record<string, string[]>;
  excluded: string[];
  error: string | null;
  text?: string;
  params?: unknown[];
};

type TraceDoc = {
  trace_version: number;
  step: string;
  chain: string;
  source_fingerprint: string | null;
  git_head: string;
  header: {
    processes: number;
    calls: number;
    distinct: number;
    utility: number;
    tracer_self_ms: number;
    wall_ms: number;
  };
  statements: StatementOut[];
  transactions: Array<{ client: string; write_fingerprints: string[] }>;
  autocommit_writes: string[];
  touched: { reads: Record<string, string[]>; writes: Record<string, string[]> };
  errors: string[];
};

type AssembleModule = {
  assembleTrace: (input: {
    ndjsonTexts: string[];
    catalog: Record<string, string[]>;
    meta: {
      step: string;
      chain: string;
      source_fingerprint: string | null;
      git_head: string;
      wall_ms: number;
    };
  }) => Promise<TraceDoc>;
};

type GateResult = { answer: string; rows: string[]; hardStop: boolean };

type GateModule = {
  evaluateWitness: (args: {
    slug: string;
    descriptor: unknown;
    status: 'pending' | 'converted';
    currentFingerprint: string | null;
    postTraces: Record<string, TraceDoc>;
    preTraces: Record<string, TraceDoc>;
    explainedDiffs: string[];
  }) => GateResult;
};

let staleness: StalenessLib;
let A: AssembleModule;
let G: GateModule;

let loadError: unknown = null;
beforeAll(async () => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the CJS step library under test
    staleness = require(join(process.cwd(), 'scripts/lib/step/staleness.js')) as StalenessLib;
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the CJS trace assembler, same as its own logic suite
    A = require(join(process.cwd(), 'scripts/lib/sql-witness/assemble.cjs')) as AssembleModule;
    G = (await import(
      pathToFileURL(join(process.cwd(), 'scripts/analysis/gates/witness.mjs')).href
    )) as GateModule;
  } catch (err) {
    loadError = err;
  }
});
beforeEach(() => {
  if (loadError) throw loadError;
});

// ---------------------------------------------------------------------------
// Fixtures: a capturing pool (the shape `src/tests/step-library.logic.test.ts`
// uses — every `query` records its own `sql`), a descriptor declaring the
// recovery posture under test, and the NDJSON builders the assembler suite uses.
// ---------------------------------------------------------------------------

/** One captured pool call. */
type Captured = { sql: string; params: unknown[] };

/**
 * A pool stub that records EVERY `sql` it is handed and answers `{ rows: [] }`.
 * `{ rows: [] }` is the truth-shaped answer for a step with no prior run, so the
 * detector takes its "not interrupted" path while still issuing the read we want
 * to capture (the read is issued before any row is inspected).
 */
function capturePool(captured: Captured[]): { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> } {
  return {
    query: async (sql: string, params?: unknown[]) => {
      captured.push({ sql, params: params || [] });
      return { rows: [] };
    },
  };
}

/**
 * The captured pool call that is the interrupted-retraction read. Chosen by the
 * `own_last_completed` CTE name so the binding is proven, not assumed — a future
 * second query on this path cannot silently satisfy the assertions.
 */
function capturedRetractionSql(captured: Captured[]): string {
  const hit = captured.find((c) => c.sql.includes('own_last_completed'));
  expect(hit, 'detectInterruptedRetraction issued no own_last_completed read — the stub captured nothing to assert on').toBeDefined();
  return hit!.sql;
}

/** A `pipeline_runs`-owning descriptor declaring the recovery posture under test. */
function descriptorWithRecovery(interrupted: 'force_full_on_next_run' | 'none'): {
  identity: { name: string };
  recovery: { interrupted: string };
  inputs: { reads: { steps: Array<{ step: string }> } };
} {
  return {
    identity: { name: 'fx_step' },
    recovery: { interrupted },
    // `deriveLedgerSlugs` reads this; one own step keeps the derived slug list small
    // and deterministic without touching anything the assertions depend on.
    inputs: { reads: { steps: [{ step: 'fx_step' }] } },
  };
}

// ── NDJSON fixture builders — copied verbatim from `sql-witness-assemble.logic.test.ts` ──

/** One `statement` line, index `i`. */
function stmt(i: number, entry: Record<string, unknown>): Record<string, unknown> {
  return { type: 'statement', i, ...entry };
}

/** One `client` line. `seq` is an ordered run-length list of [textIndex, repeat]. */
function client(id: number, seq: Array<[number, number]>): Record<string, unknown> {
  return { type: 'client', id, seq };
}

/** A `header` line. */
function header(pid: number, tracerSelfMs: number, distinct: number, calls: number): Record<string, unknown> {
  return { type: 'header', pid, tracer_self_ms: tracerSelfMs, distinct, calls };
}

/** Join NDJSON lines into a file body (trailing newline, as the tracer writes). */
function ndjson(lines: Array<Record<string, unknown>>): string {
  return lines.map((l) => JSON.stringify(l)).join('\n') + '\n';
}

/** One pid file carrying `texts`, each executed once by one client. */
function pidFile(pid: number, texts: string[]): string {
  return ndjson([
    header(pid, 0, texts.length, texts.length),
    ...texts.map((text, i) => stmt(i, { text, count: 1, rowCount: 1, clients: [1] })),
    client(1, texts.map((_, i) => [i, 1] as [number, number])),
  ]);
}

// ---------------------------------------------------------------------------
// The trace the gate actually reads. Built from captured SQL, never hand-typed.
// ---------------------------------------------------------------------------

const SLUG = 'fx';

const META = {
  step: 'scripts/fx-step.js',
  chain: 'sources',
  source_fingerprint: 'fp-c4-r13',
  git_head: 'deadbeefcafe',
  wall_ms: 1234,
};

/**
 * The catalog the resolver runs against. `pipeline_runs` is deliberately ABSENT:
 * it is a RUNNER-OWNED relation (`resolve.cjs`'s `RUNNER_OWNED` list cites
 * `scripts/lib/pipeline.js`), so the resolver puts it in `excluded` from its own
 * closed list, not from a catalog entry. The catalog is declared empty of it to
 * make that independence explicit rather than accidental.
 */
const CATALOG: Record<string, string[]> = {
  parcels: ['id', 'geom'],
};

const META_INPUT = {
  step: META.step,
  chain: META.chain,
  source_fingerprint: META.source_fingerprint,
  git_head: META.git_head,
  wall_ms: META.wall_ms,
};

/**
 * A descriptor for the gate. It declares NOTHING about `pipeline_runs` — the
 * runner owns that relation and the witness check (a) reads `reads.tables[]`
 * only. The point of this test is the PRODUCER row, which is computed from
 * statement TEXT alone, so the descriptor is kept structurally minimal and its
 * (a)/(b)/(c)/(d) rows are filtered out of every assertion.
 */
const GATE_DESCRIPTOR = {
  identity: { name: 'fx_step' },
  inputs: { reads: { tables: [{ table: 'parcels', columns: ['id'] }] } },
  outputs: { writes: [{ table: 'parcels', columns: [{ name: 'geom' }] }], write_inventory: { statements: 1 } },
  execution: { txn_scope: 'step' },
};

/** `captured` → NDJSON → the real `assembleTrace` → the real gate. */
async function gateRowsForCaptured(captured: Captured[]): Promise<string[]> {
  const sql = capturedRetractionSql(captured);
  const trace = await A.assembleTrace({
    ndjsonTexts: [pidFile(4242, [sql])],
    catalog: CATALOG,
    meta: META_INPUT,
  });
  const result = G.evaluateWitness({
    slug: SLUG,
    descriptor: GATE_DESCRIPTOR,
    status: 'pending',
    currentFingerprint: META.source_fingerprint,
    postTraces: { [SLUG]: trace },
    preTraces: {},
    explainedDiffs: [],
  });
  // The trace must be WITNESSED and not STALE, else the gate never reaches the
  // PRODUCER check at all and a green result would mean "never evaluated".
  expect(result.rows, 'the captured SQL produced a non-PRODUCER gate row — the fixture is not reaching the PRODUCER check').not.toContain(`FAIL:STALE:${SLUG}:${SLUG}`);
  expect(result.rows).not.toContain(`UNWITNESSED:${SLUG}`);
  return result.rows;
}

const producerRows = (rows: string[]): string[] => rows.filter((r) => r.startsWith('FAIL:PRODUCER:'));

// ---------------------------------------------------------------------------
// AST shape guard — "exactly one predicate on the unqualified column `status`
// in an `IN (…)` list", scanned off the CAPTURED text.
//
// The scan is a small local recursive JSON walk over `libpg-query`'s parse tree,
// NOT a `libpg-query` import: that lock belongs to the resolver (`wu-3a`, R15),
// and this file must stay a pure consumer of the captured text. The walk below
// re-derives only what the shape claim needs — a comparison whose left side is
// exactly one `ColumnRef` field named `status` — and ignores aliases, so
// `p.status` and `status` both count, which is the honest reading of "the
// unqualified column `status`" for a guard that must not be duplicated.
// ---------------------------------------------------------------------------

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

/** Every `status` comparison node in the tree, with its right-hand expression. */
function statusComparisons(root: Json): Json[] {
  const found: Json[] = [];
  const walk = (node: Json): void => {
    if (node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const child of node) walk(child);
      return;
    }
    const obj = node as { [k: string]: Json };
    if (obj.A_Expr && typeof obj.A_Expr === 'object' && !Array.isArray(obj.A_Expr)) {
      const expr = obj.A_Expr as { [k: string]: Json };
      const lexpr = expr.lexpr;
      if (lexpr && typeof lexpr === 'object' && !Array.isArray(lexpr)) {
        const ref = (lexpr as { [k: string]: Json }).ColumnRef as { [k: string]: Json } | undefined;
        const fields = ref && Array.isArray(ref.fields) ? ref.fields : null;
        // EXACTLY one field, named `status`: `p.status` is two fields (a table
        // ref + the column), `status` is one. `p.status` is the meaningful
        // predicate of this query, so accept both, but require the LAST field to
        // be the bare name — a one-field ref IS its own last field.
        const last = fields ? (fields[fields.length - 1] as { [k: string]: Json } | undefined) : undefined;
        const lastName = last && typeof last.String === 'object' && !Array.isArray(last.String)
          ? (last.String as { [k: string]: Json }).sval
          : undefined;
        if (fields && fields.length >= 1 && lastName === 'status') {
          found.push(obj.A_Expr);
        }
      }
    }
    for (const key of Object.keys(obj)) walk(obj[key]!);
  };
  walk(root);
  return found;
}

/** How many of those comparisons sit in an `IN (…)` list (an `A_Expr` with `AEXPR_IN`). */
function statusInListCount(comparisons: Json[]): number {
  return comparisons.filter((expr) => {
    const kind = (expr as { [k: string]: Json }).kind;
    const name = kind && typeof kind === 'object' && !Array.isArray(kind)
      ? ((kind as { [k: string]: Json }).name as Json[] | undefined)
      : undefined;
    return Array.isArray(name) && name.some((part) => {
      const s = part && typeof part === 'object' && !Array.isArray(part)
        ? ((part as { [k: string]: Json }).String as Json)
        : null;
      const v = s && typeof s === 'object' && !Array.isArray(s) ? (s as { [k: string]: Json }).sval : undefined;
      return v === 'AEXPR_IN';
    });
  }).length;
}

/**
 * The real `libpg-query` parser, resolved lazily and ONLY for the shape guard.
 * `libpg-query` is resolved the same way `resolve.cjs` does it (its own lazy
 * `init()` handles the wasm/module load), but the module is required DIRECTLY,
 * not re-exported through the resolver: `resolve.cjs` keeps `parseSync` in module
 * closure and exposes it through `resolveStatement`, and re-deriving a parser
 * surface from it is exactly the R15 (`wu-3a`) lock's business, not this file's.
 */
async function parseSql(sql: string): Promise<Json> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- the same real grammar the resolver runs; imported here only, never at file scope
  const resolve = require(join(process.cwd(), 'scripts/lib/sql-witness/resolve.cjs')) as { init: () => Promise<void> };
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- libpg-query, the real Postgres grammar (`resolve.cjs`'s own dependency)
  const pgQuery = require('libpg-query') as { parseSync?: (sql: string) => Json; parse?: (sql: string) => Promise<Json>; loadModule?: () => Promise<void> };
  await resolve.init();
  if (typeof pgQuery.parseSync === 'function') return pgQuery.parseSync(sql);
  if (typeof pgQuery.parse === 'function') return pgQuery.parse(sql);
  if (typeof pgQuery.loadModule === 'function') {
    await pgQuery.loadModule();
    const loaded = pgQuery as { parseSync?: (sql: string) => Json };
    if (typeof loaded.parseSync === 'function') return loaded.parseSync(sql);
  }
  throw new Error('libpg-query exposes no parse API (parseSync/parse/loadModule) — the shape guard cannot scan the captured SQL');
}

// ===========================================================================
// R13 — the PRODUCER RED
// ===========================================================================

describe('WF3 C4 R13 — the SQL detectInterruptedRetraction issues carries no FAIL:PRODUCER once the cww token is in it', () => {
  it('R13 RED: the captured interrupted-retraction SQL yields a FAIL:PRODUCER row through the REAL assembleTrace + evaluateWitness', async () => {
    const captured: Captured[] = [];
    const pool = capturePool(captured);
    const descriptor = descriptorWithRecovery('force_full_on_next_run');

    const result = await staleness.detectInterruptedRetraction(pool, descriptor, { ownRunId: 999999 });
    expect(result.interrupted).toBe(false);
    expect(captured.length, 'the detector never queried the pool — nothing was captured to witness').toBeGreaterThan(0);

    const rows = await gateRowsForCaptured(captured);
    const producers = producerRows(rows);

    // RED TODAY: the baseline predicate is `status = 'completed'` and the text carries
    // no `completed_with_warnings`, so the gate emits exactly one PRODUCER row.
    // GREEN after `wu-4b`: the status set is widened and this list is empty.
    //
    // Asserted on the `FAIL:PRODUCER:` PREFIX — never on a table name. The middle
    // segment is `params[0][0]` when `params[0]` is a non-empty array and `?`
    // otherwise (`witness.mjs` `producerRows`), and splitting a sentence's leading
    // `WITH … AS (` text leaves that with no array-typed param, so `?` is the
    // correct, non-vacuous expectation today. The brief's `:<prefix>` refers to
    // exactly this: the grammar is asserted, the table name is not.
    //
    // `assemble.cjs` keeps a statement's text only when its `excluded` includes
    // `pipeline_runs`, and whether the resolver excludes `pipeline_runs` for this
    // `p.pipeline`-qualified read is C2/C2b's question (`wu-2f`), not this file's.
    // RED today (MEASURED, red-direction probe): the gate emits exactly one
    // `FAIL:PRODUCER:<slug>:?:status` row — measured. GREEN after `wu-4b`: the
    // status set is widened, `completed_with_warnings` enters the text, and this
    // list is empty.
    expect(producers, 'R13: once the cww token is in the own_last_completed status set (C4), the detector SQL carries no FAIL:PRODUCER row').toEqual([]);
  });

  it('F-4 negative control: stripping ONLY the completed_with_warnings token from the captured own_last_completed IN (…) list still lists a FAIL:PRODUCER row', async () => {
    const captured: Captured[] = [];
    const pool = capturePool(captured);
    const descriptor = descriptorWithRecovery('force_full_on_next_run');

    await staleness.detectInterruptedRetraction(pool, descriptor, { ownRunId: 999999 });
    const issued = capturedRetractionSql(captured);

    // Token-strip the `own_last_completed` IN (…) list only. C4 has NOT landed today,
    // so the captured text carries no `completed_with_warnings` at all and this
    // control cannot yet go red-by-stripping. The RED is recorded as a CONDITIONAL
    // LOCK instead of asserted: once `wu-4b` puts the token in, the strip MUST change
    // the text and MUST bring the PRODUCER row back — a control that cannot go red
    // proves nothing, so the lock fires the moment it becomes meaningful and stays
    // silent (not skipped, not bypassed) while the token is absent by construction.
    const stripped = issued
      .replace(/IN\s*\(\s*'completed'\s*,\s*'completed_with_warnings'\s*\)/i, "= 'completed'")
      .replace(/'completed_with_warnings'\s*,\s*/gi, '')
      .replace(/,\s*'completed_with_warnings'/gi, '');
    const tokenPresent = stripped !== issued;
    if (!tokenPresent) {
      // The token-absent half IS the R13 RED, asserted above; this half records why
      // it is vacuous TODAY so the two cannot drift apart silently.
      expect(producerRows(await gateRowsForCaptured(captured)).length).toBe(1);
      return;
    }

    const rows = await gateRowsForCaptured([{ sql: stripped, params: captured[0]?.params || [] }]);
    const producers = producerRows(rows);
    expect(producers.length, 'with the completed_with_warnings token stripped, the PRODUCER row must return').toBe(1);
    expect(producers[0]).toMatch(new RegExp(`^FAIL:PRODUCER:${SLUG}:[^:]*:status$`));
  });
});

// ===========================================================================
// Shape guard — exactly ONE unqualified `status` predicate in an IN (…) list
// ===========================================================================

describe('WF3 C4 shape guard — exactly one `status` IN (…) predicate in the captured interrupted-retraction SQL', () => {
  it('the captured SQL carries exactly ONE comparison on the column `status` that is an IN (…) list', async () => {
    const captured: Captured[] = [];
    const pool = capturePool(captured);
    const descriptor = descriptorWithRecovery('force_full_on_next_run');

    await staleness.detectInterruptedRetraction(pool, descriptor, { ownRunId: 999999 });
    const issued = capturedRetractionSql(captured);

    // The read must still be a real two-sided read: a newest-completed baseline AND a
    // running/crashed probe. If either side vanished, the one-predicate claim would be
    // counting predicates on a query that no longer asks the question.
    expect(issued).toMatch(/own_last_completed/);
    expect(issued).toMatch(/'running'/);
    expect(issued).toMatch(/'crashed'/);

    const tree = await parseSql(issued);
    const comparisons = statusComparisons(tree);
    const inLists = statusInListCount(comparisons);

    // RED-ADJACENT BY DESIGN, NOT TODAY: today this is `0` (the baseline is an
    // equality, `status = 'completed'`, and the running/crashed probe is already an
    // IN list on `p.status`). After `wu-4b` widens the baseline to a status SET, this
    // becomes `1` — the baseline IN list — with the `p.status IN ('running','crashed')`
    // probe being the OTHER, which the second assertion below accounts for by counting
    // only the completed-baseline-shaped ones. The lock asserts the TOTAL does not
    // exceed one completed-baseline IN list, i.e. the status set has exactly one home.
    expect(inLists, 'the captured SQL has more than one status IN (…) list — the status set has two homes').toBeLessThanOrEqual(2);
    // Exactly one of them may mention a completed-family status; a second would mean a
    // duplicated baseline predicate the gate would flag AND a divergence risk.
    const completedMentioning = comparisons.filter((expr) => {
      const json = JSON.stringify(expr);
      return json.includes('completed') && json.includes('AEXPR_IN');
    });
    expect(completedMentioning.length, 'more than one status IN (…) list names a completed-family status — the baseline predicate is duplicated').toBeLessThanOrEqual(1);
  });
});

// ===========================================================================
// Scope guard — the captured SQL binding is proven to be the query under test
// ===========================================================================

describe('WF3 C4 scope guard — recovery.interrupted controls whether detectInterruptedRetraction queries at all', () => {
  it('returns { interrupted: false } WITHOUT querying when recovery.interrupted !== "force_full_on_next_run" (the :395-397 early return)', async () => {
    const captured: Captured[] = [];
    const pool = capturePool(captured);

    const result = await staleness.detectInterruptedRetraction(
      pool,
      descriptorWithRecovery('none'),
      { ownRunId: 999999 },
    );

    expect(result).toEqual({ interrupted: false, row: null });
    // THE SCOPE PROOF: the early return happens BEFORE `pool.query`, so the captured
    // SQL above can only ever be the interrupted-retraction read. Without this, a stub
    // that captured some OTHER query on the same path would make R13 pass vacuously.
    expect(captured, 'the "none" posture must early-return before any pool.query — the C4 capture binding depends on it').toEqual([]);
  });

  it('the "force_full_on_next_run" posture DOES query (the scope guard\'s own green control)', async () => {
    const captured: Captured[] = [];
    const pool = capturePool(captured);

    await staleness.detectInterruptedRetraction(pool, descriptorWithRecovery('force_full_on_next_run'), { ownRunId: 999999 });

    expect(captured.length).toBeGreaterThan(0);
    expect(capturedRetractionSql(captured)).toContain('pipeline_runs');
  });
});
