// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.4 (outputs.writes[].retract); docs/specs/01-pipeline/54_source_address_points.md; registry-truth plan fold 10 (soft-retire, operator ruling 2026-10-03)
//
// FLEET-2 fold 10 (soft-retire) — RED locks for `outputs.writes[].retract: "departed_mark"`.
//
// The class-A retract enum today has TWO executable members: `none` (no statement) and
// `departed` (the scoped departure DELETE, `DELETE FROM <t> WHERE <key> <> ALL($1::<type>[])`).
// A class-B departure DELETE is a HARD retraction — the row is gone, and every downstream
// consumer that reads the table loses the key. Fold 10 adds a THIRD shape that retracts by
// MARK rather than by REMOVAL: a `retired_at` timestamp is set on the rows the source no
// longer carries, and cleared on the rows the source does carry again. The row survives; a
// reader that declares `retired_at IS NULL` sees exactly the class-B row set, and a reader
// that does not sees the full history.
//
// ⚠️ THESE LOCKS WERE RED BEFORE THE IMPLEMENTATION, ON PURPOSE — the RED evidence is
// `docs/reports/red-evidence/fleet2/soft-retire-write-red.json` (SR1–SR5, SR7–SR11 failed
// against the pre-fold library, whose `buildWritePlan` had no `departed_mark` branch and
// whose `executeWrite` took no `retireMaxPct`). SR6 and SR12 are GREEN CONTROLS that pin
// the UNMODIFIED retract-`none` descriptor and prove this file's own harness (the fake
// pool, the carried-row builder) is sound, so a RED above is a missing feature rather
// than a broken stub.
//
// The soft-retire mechanic has FOUR statements, in this order, in ONE transaction:
//   1. the guarded upsert (unchanged — and it must NOT carry `retired_at` in its conflict
//      `DO UPDATE SET` or its guard, because a re-carried row's retirement state is decided
//      by step 2, not by the source payload; the INSERT list seeds it NULL, so a new key is
//      live — `undefined` binds as NULL),
//   2. the UNMARK — clear `retired_at` on every key this run carried,
//   3. the candidates SELECT — count how many rows the MARK would touch and how many are
//      active, so the mass-retire guard can be evaluated against a MEASURED ratio,
//   4. the MARK — set `retired_at = now()` on every stale, not-yet-retired row.
//
// Steps 3 and 4 are separated by the MASS-RETIRE GUARD: a source that arrives 50% short must
// not silently retire half the table (`retire_max_pct_from_config` names the bound). The
// bound passes AT the declared value (`pct <=`) — the fleet's pct grammar — and an
// UNRESOLVED bound fails the run closed rather than marking anything.
//
// A NEW file, never appended to the 7,200-line `step-library.logic.test.ts`. Its fake-pool
// stub is adapted from `src/tests/ingest-prereq-0x-counters.logic.test.ts` (`connect: async
// () => ({ query: record, release: () => {} })`), copied rather than imported.
import { describe, expect, it } from 'vitest';
import path from 'path';

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS libraries */
const writeLib = require(path.join(process.cwd(), 'scripts/lib/step/write.js'));
const LOAD_AP = require(path.join(process.cwd(), 'scripts/load-address-points.descriptor.json'));
/* eslint-enable @typescript-eslint/no-require-imports */

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));

/**
 * The PRE-FOLD address_points write: the real target with the fold-10 soft-retire edits REMOVED
 * (retract "none", no retire_max_pct_from_config, no retired_at column). Works whether or not the
 * real descriptor already carries them (seat B's B-1 lands them in the FLEET-2 assembly), so the
 * retract-none controls and the "three declared edits" builders always start from the same base.
 */
const preFoldApWrite = (): Record<string, unknown> => {
  const w = clone((LOAD_AP.outputs as { writes: Array<Record<string, unknown>> }).writes[0]!) as Record<string, unknown>;
  w.retract = 'none';
  delete w.retire_max_pct_from_config;
  w.columns = (w.columns as Array<{ name: string }>).filter((c) => c.name !== 'retired_at');
  return w;
};

/** The inherited plan `columnValues` — every carried row IS its own value map. */
const identityColumnValues = (r: Record<string, unknown>) => r;

/** A `log` whose three methods are no-ops: the guard's warn must not reach a real logger. */
const noopLog = { info: () => {}, warn: () => {}, error: () => {} };

// ── The three statements the soft-retire mechanic issues, verbatim ────────────
// Single spaces, one line each — pinned as CONSTANTS so a whitespace drift in the
// implementation is a test failure rather than a silent difference in statement text.
// `$1` is the key array of the rows THIS run carried:
//   · the MARK retires a reported-actual row that is stale and not already retired;
//   · the UNMARK revives a carried row that was previously retired (an idempotent re-run
//     over an unchanged source changes nothing — the carried set is the same set);
//   · the candidates SELECT is what the mass-retire guard measures, BEFORE the MARK runs.
const MARK = 'UPDATE address_points SET retired_at = now() WHERE address_point_id <> ALL($1::INTEGER[]) AND retired_at IS NULL;';
const UNMARK = 'UPDATE address_points SET retired_at = NULL WHERE address_point_id = ANY($1::INTEGER[]) AND retired_at IS DISTINCT FROM NULL;';
const CANDIDATES = 'SELECT count(*) FILTER (WHERE address_point_id <> ALL($1::INTEGER[]) AND retired_at IS NULL)::bigint AS candidates, count(*) FILTER (WHERE retired_at IS NULL)::bigint AS active FROM address_points;';

/**
 * The write target under test: the REAL `address_points` target (class `guarded_upsert`,
 * key `address_point_id`, `key_sql_type` INTEGER, 16 declared columns including `geom`,
 * 12 of them with a declared `on_empty`) with exactly THREE declared edits:
 *
 *   · `retract: 'departed_mark'` — the axis this fold adds;
 *   · `retire_max_pct_from_config: 'address_points_mass_retire_max_pct'` — the mass-retire
 *     bound, named rather than inlined (Rule 3: no bare percentage literal);
 *   · one NEW column, `retired_at`, `written: 'insert_only'` — the INSERT list carries it
 *     (seeded NULL: a new key is live, node-pg binds `undefined` as NULL), and it is EXCLUDED
 *     from the `ON CONFLICT ... DO UPDATE SET` and its guard, so a reload never rewrites it.
 *     The MARK/UNMARK statements are the only writers.
 *
 * `overrides` is shallow-merged LAST, so a test can replace any single top-level field
 * (`columns`, `key`, `write_discipline`) without restating the rest.
 */
const apSpec = (overrides: Record<string, unknown> = {}): Record<string, unknown> => {
  const base = preFoldApWrite();
  return {
    ...base,
    retract: 'departed_mark',
    retire_max_pct_from_config: 'address_points_mass_retire_max_pct',
    columns: [
      ...(base.columns as Array<Record<string, unknown>>),
      { name: 'retired_at', vocabulary: 'none', written: 'insert_only' },
    ],
    ...overrides,
  };
};

/** The write-spec an INGESTOR runner hands `executeWrite` — the pre-fold retract-none shape. */
const retractNoneSpec = (): Record<string, unknown> => preFoldApWrite();

/** The write_discipline of the real target, so an override can spread/deviate from it. */
const origWriteDiscipline = (): Record<string, unknown> => clone(
  ((LOAD_AP.outputs as { writes: Array<Record<string, unknown>> }).writes[0]!.write_discipline),
) as Record<string, unknown>;

/** The step-declared column names the carried rows must be keyed by. */
const stepColumnNames = (plan: { step_columns: string[] }): string[] => plan.step_columns;

/**
 * One carried row: every `plan.step_columns` name is set. `latitude`/`longitude` are numbers
 * (they are the address point's coordinates and the class guard compares them numerically);
 * `geom` is `null` (the fake pool never parses a WKB); everything else is a string. The
 * values are DISTINCT per row so a `[[<ids>]]`-style param assertion is unambiguous.
 */
const carriedRow = (name: string, ids: Array<string | number>, n: number): Record<string, unknown> => {
  const row: Record<string, unknown> = {};
  for (const col of ids) {
    if (col === 'latitude' || col === 'longitude') row[col] = 45.4 + n;
    else if (col === 'geom') row[col] = null;
    else row[col] = `${name}-${n}`;
  }
  // The key column is the ONE column whose value a test reads out of the params, so it is
  // set from the test's own id list rather than smeared by the string default above.
  row[name] = (n + 1) * 1000;
  return row;
};

/** Two carried rows keyed by every declared step column, ids 1000 / 2000. */
const carriedRows = (plan: { step_columns: string[]; keys: string[] }): Array<Record<string, unknown>> => {
  const cols = stepColumnNames(plan);
  return [0, 1].map((n) => carriedRow(`row-${n}`, cols, n));
};

/**
 * The fake pool the executeWrite tests use — mirrors `ingest-prereq-0x-counters.logic.test.ts`:
 * every `client.query(text, params)` is RECORDED (the statement ORDER and the PARAMS are the
 * assertions), and the answers are keyed by the statement text the mechanic issues. The
 * candidate/active counts and the unretired/marked row counts are per-test knobs.
 */
function fakePool({ carried, unretired, cand, active }: {
  carried: Array<Record<string, unknown>>;
  unretired: number;
  cand: number;
  active: number;
}) {
  const calls: Array<{ text: string; params: unknown[] | undefined }> = [];
  const answer = (text: string) => {
    if (text.startsWith('INSERT INTO address_points')) {
      return { rows: carried.map(() => ({ is_insert: true })), rowCount: carried.length };
    }
    if (text === UNMARK) return { rows: [], rowCount: unretired };
    if (text === CANDIDATES) return { rows: [{ candidates: String(cand), active: String(active) }] };
    if (text === MARK) return { rows: [], rowCount: cand };
    return { rows: [], rowCount: 0 };
  };
  const record = async (text: string, params?: unknown[]) => { calls.push({ text, params }); return answer(text); };
  return { calls, query: record, connect: async () => ({ query: record, release: () => {} }) };
}

/** The statements the engine actually issued, BEGIN/COMMIT stripped (the txn wrapper's noise). */
const nonTxn = (calls: Array<{ text: string }>) => calls
  .map((c) => c.text)
  .filter((t) => t !== 'BEGIN' && t !== 'COMMIT' && t !== 'ROLLBACK');

describe('fold 10 — retract "departed_mark" (soft-retire)', () => {
  // ---------------------------------------------------------------------------
  // SR1 — the plan's STATEMENT SHAPE. RED today: `plan.mark_sql` is `undefined`
  // (buildWritePlan has no `departed_mark` branch) and `plan.delete_sql` is the
  // class-A `null` only by accident of `retract !== 'departed'`.
  // ---------------------------------------------------------------------------
  it('SR1 — buildWritePlan renders mark/unmark/candidates, no delete_sql, and the upsert '
    + 'never carries retired_at', () => {
    const plan = writeLib.buildWritePlan(apSpec(), LOAD_AP);
    // Soft-retire is NOT a DELETE: there is no departure statement to run at all.
    expect(plan.delete_sql).toBe(null);
    // The three statements the mechanic issues, verbatim — pinned as constants so a
    // whitespace or placeholder drift is a failure rather than a silent difference.
    expect(plan.mark_sql).toBe(MARK);
    expect(plan.unmark_sql).toBe(UNMARK);
    expect(plan.mark_candidates_sql).toBe(CANDIDATES);
    // `retired_at` is `written: 'insert_only'` — it is IN the INSERT list (seeded NULL, so a
    // new key is live) and in NO part of the conflict half: not the `DO UPDATE SET`, not the
    // guard. A step-bound `retired_at` would let a reload WIPE a retirement the guard just set.
    expect(plan.upsert_sql.slice(0, plan.upsert_sql.indexOf('VALUES'))).toContain('retired_at');
    const afterDoUpdate = plan.upsert_sql.slice(plan.upsert_sql.indexOf('DO UPDATE SET'));
    const guardStart = afterDoUpdate.indexOf('WHERE');
    expect(afterDoUpdate.slice(0, guardStart).length).toBeGreaterThan(0);
    expect(afterDoUpdate.slice(0, guardStart + afterDoUpdate.slice(guardStart).indexOf('\n')))
      .not.toContain('retired_at');
    expect(plan.update_columns).not.toContain('retired_at');
    expect(plan.guard_columns).not.toContain('retired_at');
  });

  // ---------------------------------------------------------------------------
  // SR2 — the `retired_at` column is REQUIRED and the failure is NAMED. RED today:
  // no validation exists, so buildWritePlan happily returns a plan for a target with
  // no column to mark (and no throw at all).
  // ---------------------------------------------------------------------------
  it('SR2 — departed_mark without a retired_at column throws, naming both', () => {
    const spec = apSpec();
    // Drop the appended retired_at column — the declared columns are the originals only.
    spec.columns = (spec.columns as Array<Record<string, unknown>>)
      .filter((c) => c.name !== 'retired_at');
    expect(() => writeLib.buildWritePlan(spec, LOAD_AP)).toThrow(/departed_mark.*retired_at/);
  });

  // ---------------------------------------------------------------------------
  // SR3 — `retired_at` must be `insert_only`, never step-bound. RED today (no throw).
  // ---------------------------------------------------------------------------
  it('SR3 — a step-written retired_at throws, naming both', () => {
    const spec = apSpec({
      columns: (apSpec().columns as Array<Record<string, unknown>>).map(
        (c) => (c.name === 'retired_at' ? { ...c, written: 'step' } : c),
      ),
    });
    expect(() => writeLib.buildWritePlan(spec, LOAD_AP)).toThrow(/departed_mark.*retired_at/);
  });

  // ---------------------------------------------------------------------------
  // SR3b — `db_default` is ALSO refused. The MARK/UNMARK statements write this
  // column, so `db_default` ("nothing this step writes") would be an untruth, and a
  // traced write of a `db_default` column is a witness-gate violation.
  // ---------------------------------------------------------------------------
  it('SR3b — a db_default retired_at also throws, naming both', () => {
    const spec = apSpec({
      columns: (apSpec().columns as Array<Record<string, unknown>>).map(
        (c) => (c.name === 'retired_at' ? { ...c, written: 'db_default' } : c),
      ),
    });
    expect(() => writeLib.buildWritePlan(spec, LOAD_AP)).toThrow(/departed_mark.*retired_at/);
  });

  // ---------------------------------------------------------------------------
  // SR4 — a composite key has no single-column array to mark. RED today: the
  // existing composite-key refusal is scoped to `retract === 'departed'`, so a
  // `departed_mark` target with key ['address_point_id','latitude'] sails through.
  // ---------------------------------------------------------------------------
  it('SR4 — a composite key throws /composite key/', () => {
    // ⚠️ The `geom` column is dropped FROM THE SPEC, on purpose. `apSpec()` inherits
    // address_points' `wkb_geometry` column, and `buildWritePlan`'s PRE-EXISTING
    // `keys.length > 1 && geometryColumns.length > 0` refusal also says "composite key" —
    // so with `geom` present this assertion would pass on the WRONG throw (the validator's
    // one-key join) and the test would be a false green for the soft-retire guard. Removing
    // the geometry column leaves the soft-retire refusal as the ONLY throw that can fire,
    // which is what makes this RED today (no `departed_mark` branch exists at all).
    const spec = apSpec({
      key: ['address_point_id', 'latitude'],
      columns: (apSpec().columns as Array<Record<string, unknown>>)
        .filter((c) => c.name !== 'geom'),
    });
    expect(() => writeLib.buildWritePlan(spec, LOAD_AP)).toThrow(/composite key/);
  });

  // ---------------------------------------------------------------------------
  // SR5 — `departed_mark` is a variant of the guarded_upsert class, and declaring
  // a DIFFERENT class with it is a contradiction. RED today (no throw).
  // ---------------------------------------------------------------------------
  it('SR5 — departed_mark on a non-guarded_upsert class throws', () => {
    const spec = apSpec({
      write_discipline: { ...origWriteDiscipline(), class: 'upsert_scoped_departure_delete' },
    });
    expect(() => writeLib.buildWritePlan(spec, LOAD_AP)).toThrow(/departed_mark.*guarded_upsert/);
  });

  // ---------------------------------------------------------------------------
  // SR6 — GREEN CONTROL. The PRE-FOLD descriptor (retract: "none") must keep the
  // class-A plan: no mark/unmark/candidates, no delete. This passes against the
  // current library and pins that the soft-retire axis is ADDITIVE — the existing
  // class-A path is byte-for-byte what it was.
  // ---------------------------------------------------------------------------
  it('SR6 (GREEN control) — the pre-fold retract-none target emits no mark/unmark/'
    + 'candidates/delete', () => {
    const plan = writeLib.buildWritePlan(retractNoneSpec(), LOAD_AP);
    expect(plan.mark_sql ?? null).toBe(null);
    expect(plan.unmark_sql ?? null).toBe(null);
    expect(plan.mark_candidates_sql ?? null).toBe(null);
    expect(plan.delete_sql).toBe(null);
  });

  // ---------------------------------------------------------------------------
  // SR7 — the HAPPY PATH, end to end through executeWrite. 3 candidates of 100
  // active rows is 3% — far under the 50% bound — so the MARK fires. RED today:
  // executeWrite ignores retireMaxPct entirely and issues only the upsert, so
  // `result.retired` is `undefined`, no unmark/candidates/mark statement appears
  // and the result shape is missing every soft-retire counter.
  // ---------------------------------------------------------------------------
  it('SR7 — 3% retire: upsert, unmark, candidates, mark — in that order, no DELETE anywhere', async () => {
    const plan = writeLib.buildWritePlan(apSpec(), LOAD_AP);
    const carried = carriedRows(plan);
    const key = plan.keys[0];
    const pool = fakePool({ carried, unretired: 2, cand: 3, active: 100 });
    const result = await writeLib.executeWrite(pool, {
      plan,
      writeSpec: apSpec(),
      carried,
      columnValues: identityColumnValues,
      shouldSkipDelete: () => { throw new Error('compute guard must not be consulted for departed_mark'); },
      log: noopLog,
      tag: 'address_points',
      retireMaxPct: 0.5,
    });
    expect(result.retired).toBe(3);
    expect(result.unretired).toBe(2);
    expect(result.retire_candidates).toBe(3);
    expect(result.retire_pct).toBe(0.03);
    expect(result.retire_suppressed_mass_guard).toBe(false);
    expect(result.retire_skipped_empty_guard).toBe(false);
    // Soft-retire NEVER deletes: the class-A `deleted` counter stays 0 and no statement
    // text contains DELETE.
    expect(result.deleted).toBe(0);
    const texts = nonTxn(pool.calls);
    expect(texts[0]).toContain('INSERT INTO address_points');
    expect(texts[1]).toBe(UNMARK);
    expect(texts[2]).toBe(CANDIDATES);
    expect(texts[3]).toBe(MARK);
    expect(texts).toHaveLength(4);
    for (const t of texts) expect(t).not.toContain('DELETE');
    // Each of the three keyed statements binds the SAME array — the ids THIS run carried.
    const ids = carried.map((r) => r[key]);
    expect(pool.calls.find((c) => c.text === UNMARK)!.params).toEqual([ids]);
    expect(pool.calls.find((c) => c.text === CANDIDATES)!.params).toEqual([ids]);
    expect(pool.calls.find((c) => c.text === MARK)!.params).toEqual([ids]);
  });

  // ---------------------------------------------------------------------------
  // SR8 — the MASS-RETIRE GUARD fires. 60 candidates of 100 active is 60% > the
  // 50% bound: the MARK must NOT be issued. RED today (no guard, no suppression).
  // ---------------------------------------------------------------------------
  it('SR8 — 60% > 50% bound: the mark is suppressed, the unmark is not', async () => {
    const plan = writeLib.buildWritePlan(apSpec(), LOAD_AP);
    const carried = carriedRows(plan);
    const pool = fakePool({ carried, unretired: 2, cand: 60, active: 100 });
    const result = await writeLib.executeWrite(pool, {
      plan,
      writeSpec: apSpec(),
      carried,
      columnValues: identityColumnValues,
      shouldSkipDelete: () => { throw new Error('compute guard must not be consulted for departed_mark'); },
      log: noopLog,
      tag: 'address_points',
      retireMaxPct: 0.5,
    });
    expect(result.retired).toBe(0);
    expect(result.retire_suppressed_mass_guard).toBe(true);
    expect(result.retire_pct).toBe(0.6);
    const texts = nonTxn(pool.calls);
    expect(texts).not.toContain(MARK);
    // The unmark still runs — a carried row that is active again is revived regardless of
    // whether the retire was suppressed; the suppression is about DESTROYING too much.
    expect(texts).toContain(UNMARK);
  });

  // ---------------------------------------------------------------------------
  // SR9 — the bound's `pct <=` GRAMMAR: 50 candidates of 100 active is EXACTLY at the
  // bound and PASSES (the fleet's pct comparator is inclusive; a strict `<` would
  // refuse a retire the declared bound admits). RED today.
  // ---------------------------------------------------------------------------
  it('SR9 — exactly at the bound passes (pct <= grammar): 50/100 marks', async () => {
    const plan = writeLib.buildWritePlan(apSpec(), LOAD_AP);
    const carried = carriedRows(plan);
    const pool = fakePool({ carried, unretired: 0, cand: 50, active: 100 });
    const result = await writeLib.executeWrite(pool, {
      plan,
      writeSpec: apSpec(),
      carried,
      columnValues: identityColumnValues,
      shouldSkipDelete: () => { throw new Error('compute guard must not be consulted for departed_mark'); },
      log: noopLog,
      tag: 'address_points',
      retireMaxPct: 0.5,
    });
    expect(result.retire_suppressed_mass_guard).toBe(false);
    expect(result.retire_pct).toBe(0.5);
    expect(nonTxn(pool.calls)).toContain(MARK);
  });

  // ---------------------------------------------------------------------------
  // SR10 — the EMPTY-SET GUARD. Zero carried rows means the candidate count would
  // be the WHOLE table (`<> ALL('{}')` is true for every row) — exactly the shape
  // class B's empty-set guard exists to prevent, and here it would retire the entire
  // table rather than delete it. No unmark/candidates/mark may be issued. RED today.
  // ---------------------------------------------------------------------------
  it('SR10 — zero carried rows: no unmark/candidates/mark, the empty-set guard reports it', async () => {
    const plan = writeLib.buildWritePlan(apSpec(), LOAD_AP);
    const pool = fakePool({ carried: [], unretired: 0, cand: 0, active: 0 });
    const result = await writeLib.executeWrite(pool, {
      plan,
      writeSpec: apSpec(),
      carried: [],
      columnValues: identityColumnValues,
      shouldSkipDelete: () => { throw new Error('compute guard must not be consulted for departed_mark'); },
      log: noopLog,
      tag: 'address_points',
      retireMaxPct: 0.5,
    });
    expect(result.retire_skipped_empty_guard).toBe(true);
    expect(result.retired).toBe(0);
    expect(result.unretired).toBe(0);
    const texts = nonTxn(pool.calls);
    expect(texts).not.toContain(UNMARK);
    expect(texts).not.toContain(CANDIDATES);
    expect(texts).not.toContain(MARK);
  });

  // ---------------------------------------------------------------------------
  // SR11 — FAIL CLOSED. An UNRESOLVED mass-retire bound must refuse the run rather
  // than mark anything: "I have no bound" is not "the bound is 1.0", and a missing
  // config row is exactly the case a silent default would hide. RED today: the
  // argument is ignored entirely and the call resolves.
  // ---------------------------------------------------------------------------
  it('SR11 — an undefined retireMaxPct rejects /retire_max_pct/ (fail closed)', async () => {
    const plan = writeLib.buildWritePlan(apSpec(), LOAD_AP);
    const carried = carriedRows(plan);
    const pool = fakePool({ carried, unretired: 0, cand: 1, active: 100 });
    await expect(writeLib.executeWrite(pool, {
      plan,
      writeSpec: apSpec(),
      carried,
      columnValues: identityColumnValues,
      shouldSkipDelete: () => { throw new Error('compute guard must not be consulted for departed_mark'); },
      log: noopLog,
      tag: 'address_points',
      retireMaxPct: undefined,
    })).rejects.toThrow(/retire_max_pct/);
  });

  // ---------------------------------------------------------------------------
  // SR12 — GREEN CONTROL. The PRE-FOLD retract-none plan through executeWrite
  // must be EXACTLY the pre-fold run: one upsert statement, no soft-retire keys on
  // the result. This passes against the current library and proves the harness's
  // fake pool and carried rows reach a real write.
  // ---------------------------------------------------------------------------
  it('SR12 (GREEN control) — the pre-fold retract-none plan writes one upsert and '
    + 'reports no soft-retire counters', async () => {
    const spec = retractNoneSpec();
    const plan = writeLib.buildWritePlan(spec, LOAD_AP);
    const carried = carriedRows(plan);
    const pool = fakePool({ carried, unretired: 0, cand: 0, active: 0 });
    const result = await writeLib.executeWrite(pool, {
      plan,
      writeSpec: spec,
      carried,
      columnValues: identityColumnValues,
      shouldSkipDelete: () => false,
      log: noopLog,
      tag: 'address_points',
    });
    expect('retired' in result).toBe(false);
    const texts = nonTxn(pool.calls);
    expect(texts).toHaveLength(1);
    expect(texts[0]).toContain('INSERT INTO address_points');
  });
});
