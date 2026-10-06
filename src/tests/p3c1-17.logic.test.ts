// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.4 (outputs.writes[].columns[].vocabulary); registry-truth plan Phase 3 WIRE #17 (PLAN :238); FLEET-2 A-2
//
// FLEET-2 A-2 — the `vocabulary.on_unknown` POST-WRITE measurement, in the RED
// direction.
//
// Every converted descriptor already DECLARES a closed value set on the columns a
// compute writes (`vocabulary: { values: [...], on_unknown: 'fail', source: ... }`
// — link-massing's `parcel_buildings.structure_type`, link-parcels'
// `permit_parcels.match_type`, link-wsib's `wsib_registry.match_confidence` ...).
// Today that declaration is DOCUMENTATION ONLY: nothing ever reads the column back
// after the write, so a compute that stores a value outside its own declared set is
// green (the trust audit's "declared, never measured" class).
//
// What is being wired:
//
//   V-1..V-6 — `scripts/lib/step/write.js` exports
//              `vocabularyRows(pool, descriptor) -> Promise<object[]>`. For every
//              `descriptor.outputs.writes[i].columns[j]` whose `vocabulary` is an
//              OBJECT (skip `vocabulary: "none"`; skip `outputs: "none"`), it runs
//              exactly
//                `SELECT DISTINCT <col>::text AS v FROM <tbl> WHERE <col> IS NOT NULL`
//              and compares each distinct value against the declared `values`
//              (string compare). ONE row per vocabulary column on the audit table,
//              metric `vocabulary:<table>.<column>`, threshold
//              `every stored value is a declared vocabulary value (on_unknown: <on_unknown>)`:
//                * no unknown value -> INFO `within declared values (<n> distinct)`;
//                * unknown values (sorted ascending, joined `', '`) ->
//                  `unknown: <v1>, <v2>`, rendered as FAIL / WARN / FAIL for
//                  `on_unknown` = `fail` / `warn` / `quarantine` (quarantine has no
//                  executor and no declarer, so it takes the strictest arm until one
//                  exists), all with `source: 'gate'`.
//
//   V-8 — `scripts/lib/step/index.js`'s `runWithPool` CALLS it: the text
//         `write.vocabularyRows(pool, descriptor)` appears inside `async function
//         runWithPool(` AFTER `runnable.compute(stepCtx)`, and its result lands on
//         the audit table via `...vocabRows` in `extraRows`.
//
// Today NONE of that wiring exists: `vocabularyRows` is not exported and
// `runWithPool` never calls it. So every lock below FAILS except the GREEN controls
// in V4 (which only ever asserts the POST-WIRE arm the code must reach) and V7 (the
// declared vocabularies the four real descriptors already carry).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS libraries */
const write = require(join(process.cwd(), 'scripts/lib/step/write.js')) as {
  vocabularyRows?: (pool: unknown, descriptor: unknown) => Promise<Array<Record<string, unknown>>>;
};
/* eslint-enable @typescript-eslint/no-require-imports */
type Row = Record<string, unknown>;

/**
 * Fake pool in the shape `runWithPool` already hands to every library call: `query`
 * returns `{ rows }` and records every statement text it was asked to run, so a lock
 * can assert on the SQL SHAPE without a database (V5). The single recognized
 * statement is the post-write DISTINCT read; anything else answers empty.
 */
function distinctPool(byColumn: Record<string, string[]>) {
  const sql: string[] = [];
  const pool = {
    query: async (text: string) => {
      sql.push(text);
      const m = /SELECT DISTINCT (\w+)::text AS v FROM (\w+) WHERE \1 IS NOT NULL/.exec(text);
      if (!m) return { rows: [] as Row[] };
      const [, column, table] = m;
      return { rows: (byColumn[`${table}.${column}`] ?? []).map((v) => ({ v })) };
    },
  };
  return { pool, sql };
}

/** The fixture descriptor: one vocabulary OBJECT column + one `vocabulary: 'none'`. */
function v(onUnknown = 'fail') {
  return {
    identity: { name: 'fixture_step', archetype: 'LINK' },
    outputs: {
      writes: [{
        table: 'parcel_buildings',
        columns: [
          {
            name: 'structure_type',
            vocabulary: { values: ['primary', 'garage', 'shed', 'other'], on_unknown: onUnknown, source: 'x' },
          },
          { name: 'linked_at', vocabulary: 'none' },
        ],
      }],
    },
  };
}

const EXPECTED_SQL = 'SELECT DISTINCT structure_type::text AS v FROM parcel_buildings WHERE structure_type IS NOT NULL';

describe('P3-C1 #17 — vocabulary.on_unknown is measured after the write', () => {
  it('V1 — on_unknown:"fail" turns a stored value outside the declared set into a FAIL gate row', async () => {
    // RED today: `vocabularyRows` is not exported, so this call throws.
    const { pool, sql } = distinctPool({ 'parcel_buildings.structure_type': ['garage', 'primary', 'barn', 'annex'] });
    const rows = await write.vocabularyRows!(pool, v('fail'));

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      metric: 'vocabulary:parcel_buildings.structure_type',
      status: 'FAIL',
      source: 'gate',
      value: 'unknown: annex, barn',
      threshold: 'every stored value is a declared vocabulary value (on_unknown: fail)',
    });
    expect(sql).toHaveLength(1);
  });

  it('V2 — on_unknown:"warn" reports the same unknowns as a WARN gate row, never a FAIL', async () => {
    // RED today: `vocabularyRows` is not exported.
    const { pool } = distinctPool({ 'parcel_buildings.structure_type': ['garage', 'primary', 'barn', 'annex'] });
    const rows = await write.vocabularyRows!(pool, v('warn'));

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      metric: 'vocabulary:parcel_buildings.structure_type',
      status: 'WARN',
      source: 'gate',
      value: 'unknown: annex, barn',
      threshold: 'every stored value is a declared vocabulary value (on_unknown: warn)',
    });
  });

  it('V3 — on_unknown:"quarantine" takes the strictest arm (FAIL) until an executor exists', async () => {
    // RED today: `vocabularyRows` is not exported. Quarantine has no executor and no
    // declarer anywhere in scripts*, so it must not read LENIENT by accident.
    const { pool } = distinctPool({ 'parcel_buildings.structure_type': ['garage', 'barn'] });
    const rows = await write.vocabularyRows!(pool, v('quarantine'));

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      metric: 'vocabulary:parcel_buildings.structure_type',
      status: 'FAIL',
      source: 'gate',
      value: 'unknown: barn',
      threshold: 'every stored value is a declared vocabulary value (on_unknown: quarantine)',
    });
  });

  it('V4 — a column whose every stored value is declared reads INFO with its distinct count', async () => {
    // RED today: `vocabularyRows` is not exported. This is the healthy path the
    // post-wire code must reach for every real run that classified cleanly.
    const { pool } = distinctPool({ 'parcel_buildings.structure_type': ['garage', 'primary'] });
    const rows = await write.vocabularyRows!(pool, v('fail'));

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      metric: 'vocabulary:parcel_buildings.structure_type',
      status: 'INFO',
      value: 'within declared values (2 distinct)',
      threshold: 'every stored value is a declared vocabulary value (on_unknown: fail)',
    });
    expect(rows[0]!.source).toBeUndefined();
  });

  it('V5 — SQL shape: exactly one DISTINCT read, for the vocabulary column only', async () => {
    // RED today: `vocabularyRows` is not exported. `linked_at` declares
    // `vocabulary: "none"` (a run clock, not a closed set) and must never be read.
    const { pool, sql } = distinctPool({});
    await write.vocabularyRows!(pool, v('fail'));

    expect(sql).toEqual([EXPECTED_SQL]);
  });

  it('V6 — outputs:"none" yields no rows and runs no statement', async () => {
    // RED today: `vocabularyRows` is not exported.
    const { pool, sql } = distinctPool({});
    const rows = await write.vocabularyRows!(pool, { identity: { name: 'fixture_step', archetype: 'LINK' }, outputs: 'none' });

    expect(rows).toEqual([]);
    expect(sql).toEqual([]);
  });

  it('V7 — the four real descriptors declare their vocabularies as OBJECTS with on_unknown:"fail"', () => {
    // GREEN control on the subject: the declarations this wire measures already
    // exist in the descriptors, so the wire is reading real closed sets, not
    // fixture-only ones.
    const files = ['link-massing.descriptor.json', 'link-parcels.descriptor.json', 'link-wsib.descriptor.json'];
    const seen = new Map<string, Record<string, unknown>>();
    for (const file of files) {
      const descriptor = JSON.parse(readFileSync(join(process.cwd(), 'scripts', file), 'utf8')) as {
        outputs?: { writes?: Array<{ table?: string; columns?: Array<{ name?: string; vocabulary?: unknown }> }> };
      };
      for (const w of descriptor.outputs?.writes ?? []) {
        for (const c of w.columns ?? []) {
          const vocab = c.vocabulary;
          if (vocab && typeof vocab === 'object' && !Array.isArray(vocab)) {
            seen.set(`${w.table}.${c.name}`, vocab as Record<string, unknown>);
          }
        }
      }
    }

    const keys = [...seen.keys()];
    for (const expected of [
      'parcel_buildings.structure_type',
      'parcel_buildings.match_type',
      'permit_parcels.match_type',
      'wsib_registry.match_confidence',
    ]) {
      expect(keys, `${expected} is declared as a vocabulary object`).toContain(expected);
      expect(seen.get(expected)!.on_unknown, `${expected} fails closed on an unknown value`).toBe('fail');
      expect(Array.isArray(seen.get(expected)!.values), `${expected} declares a closed value set`).toBe(true);
    }
  });

  it('V8 — runWithPool calls write.vocabularyRows AFTER compute and folds it into extraRows', () => {
    // RED today: `runWithPool` never calls `vocabularyRows`, so the source text has
    // neither token inside the function body.
    const src = readFileSync(join(process.cwd(), 'scripts', 'lib', 'step', 'index.js'), 'utf8');
    const start = src.indexOf('async function runWithPool(');
    expect(start, 'runWithPool still exists in the runner').toBeGreaterThan(-1);
    const body = src.slice(start);

    const computeAt = body.indexOf('runnable.compute(stepCtx)');
    const callAt = body.indexOf('write.vocabularyRows(pool, descriptor)');
    expect(computeAt, 'compute still runs inside runWithPool').toBeGreaterThan(-1);
    expect(callAt, 'the post-write vocabulary read is wired into runWithPool').toBeGreaterThan(-1);
    expect(callAt, 'the vocabulary read runs AFTER the write (compute), never before').toBeGreaterThan(computeAt);
    expect(body).toContain('...vocabRows');
  });
});
