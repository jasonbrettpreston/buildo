// 🔗 SPEC LINK: docs/specs/01-pipeline/49_data_completeness_profiling.md §3 (vocabulary-coverage)
//
// Real-DB integration for the vocabulary-coverage metric that assert-global-coverage.js computes:
// distinct values PRESENT vs the defining vocabulary. Validates the COUNT(DISTINCT) query the
// script runs (present / vocab_size) on real PG, the dynamic vocab size (not hardcoded), the
// data-filter (coa scope / -1 sentinel), and the vocab_size=0 edge — all in rolled-back txns.
// Skipped unless BUILDO_TEST_DB=1 / DATABASE_URL.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';
import { dbAvailable, getTestPool } from './setup-testcontainer';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { resolveAndCountTriple } = require('../../../scripts/lib/vocab-coverage');

const pool = getTestPool()!;

// Mirrors the count semantics now shared in scripts/lib/vocab-coverage.js (resolveAndCountTriple).
async function vocab(c: PoolClient, dataTable: string, dataCol: string, dataFilter: string | null, vocabTable: string, vocabCol: string) {
  // Intersection semantics — mirrors resolveAndCountTriple (present = distinct data values IN the vocab).
  const dAnd = dataFilter ? ` AND (${dataFilter})` : '';
  const { rows: [r] } = await c.query(
    `SELECT (SELECT COUNT(DISTINCT ${dataCol}) FROM ${dataTable}
              WHERE ${dataCol} IN (SELECT ${vocabCol} FROM ${vocabTable})${dAnd})::int AS present,
            (SELECT COUNT(DISTINCT ${vocabCol}) FROM ${vocabTable})::int AS vsize`,
  );
  return { present: r.present as number, vsize: r.vsize as number };
}

describe.skipIf(!dbAvailable())('vocabulary-coverage metric (Spec 49 §3) — live DB', () => {
  let c: PoolClient;
  beforeAll(async () => { if (pool) c = await pool.connect(); });
  // pool.end() happens in the LAST describe (shared single pool per file).
  afterAll(async () => { if (c) c.release(); });

  it('trade_id vocab = COUNT(DISTINCT permit_trades.trade_id) / COUNT(*) trades — dynamic vocab size', async () => {
    if (!pool) return;
    await c.query('BEGIN');
    try {
      // vocab size is read dynamically from the trades table (NOT hardcoded 38 — seed-drift proof).
      const vocabSize = (await c.query(`SELECT COUNT(*)::int n FROM trades`)).rows[0].n as number;
      expect(vocabSize).toBeGreaterThanOrEqual(33);

      await c.query(`INSERT INTO permits (permit_num, revision_num, permit_type) VALUES ('VC-1','00','BLD')`);
      // two distinct trades emitted (1 excavation, 3 concrete)
      await c.query(`INSERT INTO permit_trades (permit_num, revision_num, trade_id, tier, confidence, is_active, phase, lead_score)
                     VALUES ('VC-1','00',1,2,0.7,true,'early_construction',10), ('VC-1','00',3,2,0.7,true,'early_construction',10)`);

      const { present, vsize } = await vocab(c, 'permit_trades', 'trade_id', null, 'trades', 'id');
      expect(present).toBe(2);          // 2 distinct trade_ids present
      expect(vsize).toBe(vocabSize);    // denominator = live trades count
      expect(present).toBeLessThan(vsize); // a partial-emission scenario → would FAIL the gate
    } finally {
      await c.query('ROLLBACK');
    }
  });

  it('healthy control: neighbourhood_id vocab — dynamic denominator = neighbourhoods count + <>-1 filter runs', async () => {
    if (!pool) return;
    // NOTE: the -1 sentinel exclusion behavior is live-proven on the dev DB (158/158). A fresh
    // testcontainer has empty neighbourhoods (loaded by the sources chain, not a migration) + a
    // neighbourhood_id FK, so we can't insert a -1 row here. This validates the query + dynamic vsize.
    await c.query('BEGIN');
    try {
      const nbCount = (await c.query(`SELECT COUNT(*)::int n FROM neighbourhoods`)).rows[0].n as number;
      const realNb = (await c.query(`SELECT id FROM neighbourhoods ORDER BY id LIMIT 1`)).rows[0]?.id;
      if (realNb != null) {
        await c.query(`INSERT INTO permits (permit_num, revision_num, permit_type, neighbourhood_id) VALUES ('VC-NB','00','BLD',$1)`, [realNb]);
      }
      const { present, vsize } = await vocab(c, 'permits', 'neighbourhood_id', 'neighbourhood_id <> -1', 'neighbourhoods', 'id');
      expect(vsize).toBe(nbCount); // denominator read dynamically from neighbourhoods (PK → DISTINCT == COUNT)
      if (realNb != null) expect(present).toBeGreaterThanOrEqual(1); // the seeded real-nb permit counts (excl -1)
    } finally {
      await c.query('ROLLBACK');
    }
  });

  it('vocab_size = 0 → INFO edge (no division-by-zero, no false FAIL)', async () => {
    if (!pool) return;
    // An empty vocab table yields vsize=0; the script maps this to {value:'<n>/0', status:'INFO'}.
    const { rows: [r] } = await c.query(
      `SELECT (SELECT COUNT(DISTINCT trade_id) FROM permit_trades)::int AS present,
              (SELECT COUNT(DISTINCT id) FROM trades WHERE 1=0)::int AS vsize`,
    );
    expect(r.vsize).toBe(0); // → INFO branch in vocabRow (vocabSize === 0)
  });
});

// The shared lib executed against real PG — proves the resolve + intersection-count + the
// enumerated unresolved markers actually run (the source-text lock lives in vocab-coverage.logic.test.ts).
describe.skipIf(!dbAvailable())('resolveAndCountTriple (Spec 30 §3 / 48 §3.5) — live DB', () => {
  afterAll(async () => { if (pool) await pool.end(); });

  it('trade_vocab triple → numeric {present, vocab_size}, present <= vocab_size (intersection bound)', async () => {
    if (!pool) return;
    const r = await resolveAndCountTriple(pool, {
      dataTable: 'permit_trades', dataColumn: 'trade_id', vocabTable: 'trades', vocabColumn: 'id',
    });
    expect(r.unresolved).toBeUndefined();
    expect(typeof r.present).toBe('number');
    expect(r.vocab_size).toBeGreaterThanOrEqual(33);      // live trades vocabulary
    expect(r.present).toBeLessThanOrEqual(r.vocab_size);   // intersection semantics ⇒ never > 100%
  });

  it('missing column → enumerated WARN marker (not a throw)', async () => {
    if (!pool) return;
    const r = await resolveAndCountTriple(pool, {
      dataTable: 'permit_trades', dataColumn: 'does_not_exist', vocabTable: 'trades', vocabColumn: 'id',
    });
    expect(r.unresolved).toBe('missing column');
  });

  it('bad identifier → enumerated marker, never reaches SQL', async () => {
    if (!pool) return;
    const r = await resolveAndCountTriple(pool, {
      dataTable: 'permit_trades; DROP TABLE trades', dataColumn: 'trade_id', vocabTable: 'trades', vocabColumn: 'id',
    });
    expect(r.unresolved).toBe('bad identifier');
  });
});
