// SPEC LINK: docs/specs/01-pipeline/129_source_coa_notices.md §2c; Spec 122 §8 RE-FREEZE #40
//
// RE-FREEZE #40 — the runner passes the R-CU slice ordinal to `deriveRows` as the 4th argument, so a derived target
// fed by data that is not a function of the slice (plan facts of a pinned batch) is emitted exactly once. This drives
// the real `executeWrite` over TWO slices (a fake client), the path the source-text lock in plan-facts.logic cannot see.
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS library */
const writeLib = require(join(process.cwd(), 'scripts/lib/step/write.js'));
const pipeline = require(join(process.cwd(), 'scripts/lib/pipeline'));
/* eslint-enable @typescript-eslint/no-require-imports */

const noopLog = { info: () => {}, warn: () => {}, error: () => {} };
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped CJS under test

const primary = { table: 'p_x', key: 'k', key_sql_type: 'TEXT', columns: [{ name: 'k', written: 'step' }, { name: 'v', written: 'step' }], write_discipline: { class: 'guarded_upsert', guard: 'is_distinct_from', guard_columns: ['v'], scope: 'none' }, retract: 'none' };
const derivedSpec = { table: 'd_x', key: 'k', key_sql_type: 'TEXT', derive: { from: 'p_x', prior_columns: ['v'], why: { text: 'w', liveness: 'none' } }, columns: [{ name: 'k', written: 'step' }, { name: 'n', written: 'step' }], write_discipline: { class: 'guarded_upsert', guard: 'is_distinct_from', guard_columns: ['n'], scope: 'none' }, retract: 'none' };
const desc = { identity: { name: 'x', archetype: 'INGESTOR', spec_version: '1.0' } };

function pool() {
  const query = async (text: string) => {
    if (/INSERT INTO/i.test(text)) return { rows: [{ is_insert: true }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  };
  return { query, connect: async () => ({ query, release: () => {} }) };
}

describe('RE-FREEZE #40 deriveRows receives the slice ordinal', () => {
  it('is 0 for the first slice and increments; a once-only emitter writes exactly once', async () => {
    const stride = pipeline.maxRowsPerInsert(primary.columns.length);
    const carried = Array.from({ length: stride + 5 }, (_v, i) => ({ k: `k${i}`, v: i }));
    const seen: number[] = [];
    const out = await writeLib.executeWrite(pool(), {
      plan: writeLib.buildWritePlan(primary, desc), writeSpec: primary, carried, columnValues: (r: Json) => r, shouldSkipDelete: () => true, log: noopLog, tag: '[x]',
      derived: {
        prior: writeLib.buildPriorReadSql({ from: 'p_x', keys: ['k'], keyTypes: ['text'], priorColumns: ['v'] }),
        keyOf: (r: Json) => JSON.stringify([String(r.k)]),
        deriveRows: (_t: string, _s: unknown[], _p: unknown, sliceIndex: number) => { seen.push(sliceIndex); return sliceIndex === 0 ? [{ k: 'only', n: 1 }] : []; },
        targets: [{ index: 1, plan: writeLib.buildWritePlan(derivedSpec, desc), onError: 'fail_step' }],
      },
    });
    expect(seen).toEqual([0, 1]);
    expect(out.e1).toEqual({ inserted: 1, updated: 0, errors: 0 });
  });
});
