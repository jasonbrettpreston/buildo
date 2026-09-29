// SPEC LINK: docs/specs/01-pipeline/122a_step_optimization_appendix.md §A18 (0x; RE-FREEZE #29, logged in 122 §8)
//
// INGESTOR prerequisite 0x (part E) — COUNTER SOURCES and the INGESTOR's own ELAPSED TIME.
//
// Every file before this one locks the 0x SHAPE: the per-primary `target` binding, the
// narrowed `runIngestPhase` calls, the failure postures, the full-run two-transaction
// descent, the idempotency of a skipped second run. NONE of them reads a COUNTER, and that
// omission is not cosmetic — it is exactly where three library defects live, and each one is
// invisible from every 0x assertion already written:
//
//   R1  `resolveCounterSource` (scripts/lib/step/index.js) splits a `source` on `.` and
//       walks ONE dotted path. `records_total: { source: "written.inserted + written.updated" }`
//       — the DECLARED source of five of the six converted INGESTORs (load-address-points,
//       load-parcels, load-massing, load-neighbourhoods, and the newly-bound multi-primary
//       descent) — is therefore not a path at all. The walk descends into `scope.written`
//       and then looks for a key literally named `inserted + written`, finds nothing, and
//       returns null. `records_total` reads "not counted" on the ledger row of a load that
//       JUST COUNTED ROWS. RED below.
//
//   S1  `counters.*.source` is declared as a bare `{ type: "string", minLength: 1 }`, so an
//       UNSUPPORTED expression (`'written.inserted * 2'`) or free text (`'the rows we wrote'`)
//       is accepted by the schema and then silently nulls at run time — the schema endorses a
//       declaration the runner cannot honour. RED below: no `pattern` error exists today.
//
//   F1  The INGESTOR branch of `runWithPool` NEVER sets `ctx.elapsed_ms` (every other phase
//       branch does — see the seven `stepCtx.elapsed_ms = Date.now() - startMs` lines at
//       index.js:5565-5749, none of which is inside `isIngestStep`), so an INGESTOR that
//       times itself the way `load-ravines.js` does emits `duration_ms: 0` on EVERY run.
//       RED below, and the SAME full run pins the counter that defect R1 nulls: the ledger's
//       own `records_total`, params[4] of the runner's finalize. The two facts are asserted
//       in ONE run deliberately — a fix that repairs one and not the other reddens here.
//
// What is a PIN, and why it is in this file rather than left implicit:
//
//   R1-PIN  a SINGLE dotted path still resolves (`written.inserted` → 3), and an ABSENT path
//           still resolves null (`acquired.feature_count` against a scope with no
//           `acquired`) — the expression work must WIDEN the resolver, not replace its
//           "not counted" semantics with a throw or a zero;
//   S2-PIN  every shipped `scripts/*.descriptor.json` still validates AND the three source
//           spellings the estate actually uses — the SUM expression, a per-external counter
//           (`written.e2.inserted`, "DECLARE THE ROOT THAT RESOLVES") and a
//           `records_meta.<key>.<key>` path — are all admitted by whatever constraint
//           replaces the bare string. A constraint that admits only the SUM spelling would
//           redden here, which is the point.
//
// RED evidence today (measured, not asserted): R1 `resolveCounterSource` returns `null` for
// both SUM spellings (the loop ends on `scope.written['inserted + written']`, undefined);
// S1 both clones validate TRUE (there is no `pattern` keyword anywhere on the counter
// definition); F1 the run completes with `records_total: null` (params[4] null, not 5) and
// `ctx.elapsed_ms` still 0 when compute returns — so the last `UPDATE pipeline_runs` ledger
// row of a 1.7-second INGESTOR records a 0.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import * as fs from 'node:fs';

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any -- exercising the real CJS libraries and descriptors */
const Ajv: any = require('ajv');
const stepLib = require(join(process.cwd(), 'scripts/lib/step'));
const stalenessLib = require(join(process.cwd(), 'scripts/lib/step/staleness.js'));
const acquireLib = require(join(process.cwd(), 'scripts/lib/step/acquire.js'));
const writeLib = require(join(process.cwd(), 'scripts/lib/step/write.js'));
const ravineCompute = require(join(process.cwd(), 'scripts/lib/compute/load-ravines.js'));
const LOAD_RAVINES = require(join(process.cwd(), 'scripts/load-ravines.descriptor.json'));
const LOAD_ADDRESS_POINTS = require(join(process.cwd(), 'scripts/load-address-points.descriptor.json'));
const SCHEMA = require(join(process.cwd(), 'scripts/steps/_schema/step.schema.json'));
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));

// ── The AJV setup, byte-for-byte the compile the schema arm uses (allErrors, strict:false) ──
const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile(SCHEMA);
const errText = (errors: unknown) => JSON.stringify(errors ?? []);

type AjvError = { keyword?: string; instancePath?: string; params?: Record<string, unknown> };

/** Locate one AJV error by keyword + instancePath (+ params), never by a bare boolean. */
const errAt = (errors: unknown, match: Record<string, unknown>) =>
  (((errors as AjvError[] | null) ?? [])).some(
    (e) =>
      e.keyword === match.keyword &&
      e.instancePath === match.instancePath &&
      Object.entries((match.params as Record<string, unknown>) ?? {}).every(([k, v]) => e.params?.[k] === v),
  );

// ── The full-run harness, carried VERBATIM from the runner arm ─────────────────────────────
// `fakePool` records `{text, params}`; `seedConfig` resolves ravine's declared tunables from
// the committed seed registry; `primaryAcquired` is the primary's acquisition block.

/**
 * The fake pool the runner tests use: SQL text AND bound params are recorded (the 0x
 * refusals must cost ZERO statements, so `calls.length` is the assertion), logic_variables
 * rows answer the config resolver, `SELECT NOW()` answers the DB clock, and an
 * `INSERT INTO t{a,b,c}` answers the guarded upsert's `is_insert` RETURNING.
 */
function fakePool() {
  const calls: Array<{ text: string; params: unknown[] | undefined }> = [];
  const answer = (text: string) => {
    if (text.includes('FROM logic_variables')) {
      return {
        rows: Object.entries(seedConfig()).map(([variable_key, variable_value]) => ({
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
    if (/SELECT NOW\(\) AS now/i.test(text)) return { rows: [{ now: new Date('2026-09-28T00:00:00Z') }] };
    if (/INSERT INTO t[abc]\b/i.test(text)) return { rows: [{ is_insert: true }] };
    return { rows: [] };
  };
  const record = async (text: string, params?: unknown[]) => { calls.push({ text, params }); return answer(text); };
  return { calls, query: record, connect: async () => ({ query: record, release: () => {} }) };
}

/** The resolved config the runner threads to compute — the seed defaults for ravine's vars. */
function seedConfig(): Record<string, number> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- the committed seed registry
  const seed = require(join(process.cwd(), 'scripts/seeds/logic_variables.json')) as Record<string, { default: number }>;
  const out: Record<string, number> = {};
  for (const v of LOAD_RAVINES.config.logic_variables as Array<{ name: string }>) out[v.name] = seed[v.name]!.default;
  return out;
}

const prior = { feature_count: 854, content_hash: 'aa', last_modified: 'Mon, 14 Mar 2022 15:25:09 GMT' };

/** The primary's acquisition block — every field `runIngestPhase` reads off `result.acquired`. */
function primaryAcquired() {
  return {
    feature_count: 1,
    rows_parsed: 1,
    invalid_geometry_skipped: 0,
    invalid_geometry_repaired: 0,
    geometry_collection_extracted: 0,
    skipped_keys: [],
    last_modified: prior.last_modified,
    last_modified_ms: Date.parse(prior.last_modified),
    etag: null,
    content_hash: 'bb',
    source_dataset_version: 'bb',
    license_url: 'https://open.toronto.ca/open-data-license/',
  };
}

const throwing = async () => { throw new Error('the runner must not reach the network in this test'); };

/**
 * F1's `d` — a SINGLE-primary INGESTOR whose `records_total` is the DECLARED SUM. A clone
 * of `scripts/load-ravines.descriptor.json` with exactly four edits, each load-bearing:
 *
 *   · `execution.shape = 'ingest'` — the branch under test (the runner's dispatch is on the
 *     declared shape, and this is the branch that never stamps `elapsed_ms`);
 *   · `guards.requires = []` — an empty preflight, so no unrelated privilege/index probe
 *     reaches the fake pool;
 *   · `invariants` / `plausibility` = `"none"` — no post-run SQL the fake pool cannot answer;
 *   · `counters.records_total.source = 'written.inserted + written.updated'` — the SUM the
 *     shipped address-points/parcels/massing/neighbourhoods descriptors all declare, and the
 *     ONE spelling the resolver cannot resolve today. `records_new`/`records_updated` keep
 *     ravines' single path (`written.inserted` / `written.updated`) so the run's counter
 *     block mixes both forms.
 *
 * Single-primary on purpose: F1 asserts the COUNTER and the ELAPSED TIME, so the run must be
 * the smallest one that reaches a write, a compute, a count and a finalize — the multi-primary
 * 0x shape is locked by its own files and would only add targets to compare.
 */
function d(): Record<string, unknown> {
  const descriptor = clone(LOAD_RAVINES) as Record<string, any>;
  descriptor.execution = { ...descriptor.execution, shape: 'ingest' };
  descriptor.guards = { ...descriptor.guards, requires: [] };
  descriptor.invariants = 'none';
  descriptor.plausibility = 'none';
  descriptor.counters = {
    records_total: { source: 'written.inserted + written.updated', scoped_by: 'source_id' },
    records_new: { source: 'written.inserted', scoped_by: 'source_id' },
    records_updated: { source: 'written.updated', scoped_by: 'source_id' },
  };
  return descriptor as unknown as Record<string, unknown>;
}

/**
 * F1's full-run harness: drives the REAL `step(d, compute).run(...)` lifecycle over the fake
 * pool while every acquisition seam is stubbed.
 *
 * The seam that matters is `acquireExternal`: it AWAITS 5ms before returning. `stepCtx.elapsed_ms`
 * is stamped (when it is stamped at all) AFTER the phase returns, so a 5ms acquisition
 * guarantees a non-zero elapsed time in any correct runner — a `> 0` assertion cannot be
 * satisfied by a fast clock read, only by an `elapsed_ms` the runner actually computed.
 *
 * `compute` reports EVERY selected check (`{value: 0, inert: true}`) so the run reaches
 * `completed` for the right reason, PUSHES each observed `ctx.elapsed_ms` into `seen`, and —
 * the F1 write evidence — returns its `records_meta` block ONLY when `ctx.written` is set.
 *
 * `executeWrite` returns the row-conservation numbers (`inserted: 2`, `updated: 3`, both
 * scanned and changed 5) and this test sets the acquired `rows_parsed`/`feature_count` to the
 * same 5, so the runner's own conservation check — carried-in rows must equal the rows the
 * write accounted for — passes on the numbers the counters are resolved from. 2 + 3 also
 * distinguishes the SUM from either operand: an implementation that "resolves" the expression
 * by taking its first term reports 2, its last 3, and only the SUM 5.
 */
async function fullRun(descriptor: Record<string, unknown>) {
  const seen: Array<number> = [];
  const compute = Object.assign(
    async (ctx: Record<string, any>) => {
      for (const id of ctx.checks) ctx.report(id, { value: 0, inert: true });
      seen.push(ctx.elapsed_ms);
      return ctx.written
        ? { records_meta: { ravine_load: { duration_ms: ctx.elapsed_ms } } }
        : { records_meta: {} };
    },
    { ...ravineCompute },
  );

  const acquired = primaryAcquired();
  acquired.feature_count = 5;
  acquired.rows_parsed = 5;

  const acquired2 = primaryAcquired();
  acquired2.feature_count = 5;
  acquired2.rows_parsed = 5;

  const restored = [
    vi.spyOn(stalenessLib, 'readPriorEmitWithPosture')
      .mockResolvedValue({ prior: { feature_count: 1, content_hash: 'aa' }, error: null }),
    vi.spyOn(writeLib, 'assertWritePrivileges')
      .mockResolvedValue({ ravines: { rls_enabled: true, bypassrls: true, policies: 0 } }),
    vi.spyOn(acquireLib, 'acquireExternal').mockImplementation((async () => {
      await new Promise((r) => setTimeout(r, 5));
      return {
        tier1: { skip: false },
        tier2: { skip: false },
        emitBlock: null,
        features: [{ source_id: 1, geojson: '{}', record: {} }],
        acquired: acquired2,
      };
    }) as (...args: unknown[]) => unknown),
    vi.spyOn(writeLib, 'validateGeometries').mockResolvedValue({
      carried: [{ source_id: 1, geom: Buffer.from('') }], repaired: 0, collectionExtracted: 0, skipped: 0, skippedKeys: [],
    }),
    vi.spyOn(writeLib, 'executeWrite').mockResolvedValue({
      inserted: 2, updated: 3, deleted: 0, rows_scanned: 5, rows_changed: 5, unchanged: 0,
    }),
  ] as Array<{ mockRestore: () => void }>;

  try {
    const pool = fakePool();
    const out = await stepLib.step(descriptor, compute).run({ pool, chainId: null, fetch: throwing }) as {
      recordsMeta: Record<string, any>;
    };
    return { out, pool, seen };
  } finally {
    for (const s of restored.splice(0)) s.mockRestore();
  }
}

// ── S1/S2, the schema arm ─────────────────────────────────────────────────────────────────

/** The S1 clone: `records_total`'s source replaced by an expression the runner cannot resolve. */
function withTotalSource(source: string): Record<string, any> {
  const descriptor = clone(LOAD_ADDRESS_POINTS) as Record<string, any>;
  descriptor.counters.records_total.source = source;
  return descriptor;
}

describe('INGESTOR prerequisite 0x — counter sources: the SUM expression (R1) + elapsed_ms (F1)', () => {
  // =========================================================================
  // R1 RED — `resolveCounterSource` walks ONE dotted path, so the SUM the
  // shipped descriptors declare resolves to null. Every assertion below is a
  // value, not a shape: 3 + 4 is 7 for BOTH spellings (the shipped
  // `'written.inserted + written.updated'` and the unspaced form a human
  // writes next), and an operand that is absent or non-finite makes the whole
  // expression "not counted" rather than a partial number — a counter that
  // reports 3 for `a + missing` is a lie about what was counted.
  // =========================================================================
  it('R1 (RED) — a SUM source resolves to the sum of its operands, or to null when one operand cannot be counted', () => {
    expect(stepLib.resolveCounterSource({ source: 'written.inserted + written.updated' }, { written: { inserted: 3, updated: 4 } }))
      .toBe(7);
    expect(stepLib.resolveCounterSource({ source: 'written.inserted+written.updated' }, { written: { inserted: 3, updated: 4 } }))
      .toBe(7);
    expect(stepLib.resolveCounterSource({ source: 'written.inserted + written.missing' }, { written: { inserted: 3 } }))
      .toBeNull();
    expect(stepLib.resolveCounterSource({ source: 'written.inserted + written.bad' }, { written: { inserted: 3, bad: NaN } }))
      .toBeNull();
  });

  // =========================================================================
  // R1-PIN — the resolver's existing semantics survive the widening: ONE
  // dotted path still resolves, and a path nothing measured still reads null
  // ("not counted", never a zero). GREEN today and after the fix.
  // =========================================================================
  it('R1-PIN — a single dotted path resolves, and an absent path still reads null', () => {
    expect(stepLib.resolveCounterSource({ source: 'written.inserted' }, { written: { inserted: 3 } })).toBe(3);
    expect(stepLib.resolveCounterSource({ source: 'acquired.feature_count' }, { written: { inserted: 3 } })).toBeNull();
  });

  // =========================================================================
  // F1 RED — the INGESTOR branch never stamps `ctx.elapsed_ms`, so a step that
  // times itself emits `duration_ms: 0`; and the same run's ledger row carries
  // the counter R1 nulls. One run, two defects, because a fix that repairs only
  // one of them must redden this single test.
  // =========================================================================
  it('F1 (RED) — an INGESTOR records records_total = inserted + updated and a positive self-measured elapsed_ms', async () => {
    const { out, pool, seen } = await fullRun(d());

    const update = pool.calls.filter((c) =>
      c.text.includes('UPDATE pipeline_runs') && c.params?.length === 8);
    expect(update.length, 'the runner-owned ledger row is finalized once').toBeGreaterThan(0);
    // ledger.js `finalizeLedgerRow` binds records_total to params[4]; the SUM is 2 + 3 = 5
    // (an implementation reading only the first or last operand writes 2 or 3).
    expect(
      update[update.length - 1]!.params![4],
      'records_total is written.inserted + written.updated (2 + 3), not null and not one operand',
    ).toBe(5);

    const last = seen[seen.length - 1];
    expect(typeof last, 'the compute saw a numeric elapsed_ms').toBe('number');
    expect(last as number, 'the INGESTOR branch stamped ctx.elapsed_ms (a 5ms acquisition already elapsed)').toBeGreaterThan(0);
    expect(
      out.recordsMeta.ravine_load.duration_ms,
      'the run records a POSITIVE self-measured duration, not the branch default of 0',
    ).toBeGreaterThan(0);
  });
});

describe('INGESTOR prerequisite 0x — counter sources: the schema constraint (S1) + the estate PIN (S2)', () => {
  // =========================================================================
  // S1 RED — `counters.*.source` accepts ANY non-empty string, so an
  // expression the resolver cannot evaluate is a VALID descriptor that nulls
  // at run time. The assertion is the SPECIFIC AJV error (keyword + path),
  // never a bare `false`: today there is no `pattern` keyword there to fire.
  // =========================================================================
  it('S1 (RED) — an unsupported expression or free text is refused at the counter source by a pattern', () => {
    for (const source of ['written.inserted * 2', 'the rows we wrote']) {
      const descriptor = withTotalSource(source);
      expect(
        validate(descriptor),
        `\`${source}\` is not a source the runner can resolve, so it must not be declarable: ${errText(validate.errors)}`,
      ).toBe(false);
      expect(
        errAt(validate.errors, { keyword: 'pattern', instancePath: '/counters/records_total/source' }),
        `expected a pattern error at /counters/records_total/source for \`${source}\`: ${errText(validate.errors)}`,
      ).toBe(true);
    }
  });

  // =========================================================================
  // S2 PIN — the rule is ADDITIVE. Every shipped descriptor keeps validating,
  // and each of the three source spellings the estate actually uses is still
  // admitted: the SUM expression, a per-external counter and a
  // `records_meta.<key>.<key>` path. A pattern that admits only the SUM
  // spelling reddens here.
  // =========================================================================
  it('S2 (PIN) — every shipped descriptor validates, and the three real source spellings stay admitted', () => {
    const dir = join(process.cwd(), 'scripts');
    const descriptors = fs.readdirSync(dir).filter((name) => name.endsWith('.descriptor.json'));
    expect(descriptors.length, 'the descriptor corpus is non-empty').toBeGreaterThan(0);
    for (const name of descriptors) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real shipped descriptor
      const descriptor = require(join(dir, name));
      expect(validate(descriptor), `${name} must stay valid: ${errText(validate.errors)}`).toBe(true);
    }

    for (const source of [
      'written.inserted + written.updated',
      'written.e2.inserted',
      'records_meta.centreline_load.features_updated',
    ]) {
      expect(
        validate(withTotalSource(source)),
        `\`${source}\` is a source the runner resolves and must stay declarable: ${errText(validate.errors)}`,
      ).toBe(true);
    }
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
