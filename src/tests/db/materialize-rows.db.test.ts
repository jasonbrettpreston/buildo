// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-EH (the MATERIALIZER ROWS arm, T11); Spec 124 R-DH
//
// R-EH T11 — the generated F + A pair (keyed replace of lead_products for a coa: lead, then the unguarded upsert)
// and a generated G keyed update from rows are accepted by Postgres, and the per-batch transaction rolls back
// whole. Every statement runs inside ONE transaction that is rolled back: the test DB is left untouched.
// Run: BUILDO_TEST_DB=1 npx vitest run src/tests/db/materialize-rows.db.test.ts --no-file-parallelism
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';

const pool = getTestPool();
const REPO_ROOT = path.resolve(__dirname, '../../../');
// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS library
const write = require(path.join(REPO_ROOT, 'scripts/lib/step/write.js'));

const why = { text: 'T11', liveness: { kind: 'table', ref: 'lead_products' } };
const replaceSpec = {
  table: 'lead_products', key: ['lead_id'],
  columns: [{ name: 'lead_id', written: 'step', source: 'compute' }],
  write_discipline: { class: 'link_full_retraction', guard: 'none', guard_why: why, guard_columns: 'all_declared', scope: 'none', key_prefix: { column: 'lead_id', prefix: 'coa:' } },
  retract: 'replace_keys',
};
const upsertSpec = {
  table: 'lead_products', key: ['lead_id', 'product_id'],
  columns: [{ name: 'lead_id', written: 'step', source: 'compute' }, { name: 'product_id', written: 'step', source: 'compute' }, { name: 'confidence', written: 'step', source: 'compute' }],
  write_discipline: { class: 'guarded_upsert', guard: 'none', guard_why: why, guard_columns: 'all_declared', scope: 'none', key_prefix: { column: 'lead_id', prefix: 'coa:' } },
  retract: 'none',
};
const descriptor = { identity: { name: 'r_eg_db', archetype: 'MATERIALIZER' }, outputs: { writes: [replaceSpec, upsertSpec] }, guards: { srid: 'none' }, execution: { shape: 'materialize', materialize_form: 'rows' } };

describe.skipIf(!dbAvailable())('R-EH — the ROWS arm generated statements on Postgres (T11)', () => {
  it('T11: F (keyed replace) then A (unguarded upsert) replace a coa: lead\'s products, and never touch a permit: lead', async () => {
    if (!pool) throw new Error('dbAvailable() is true but pool is missing — refusing to silently register zero tests.');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: pg } = await client.query('SELECT id FROM product_groups ORDER BY id LIMIT 2');
      if (pg.length < 2) throw new Error('product_groups needs two seeded rows for T11');
      const [a, b] = [pg[0].id, pg[1].id];
      await client.query('INSERT INTO lead_products (lead_id, product_id, confidence) VALUES ($1, $2, 0.5), ($1, $3, 0.5), ($4, $2, 0.5)', ['coa:T11', a, b, 'permit:T11--00']);
      const keyType = (await client.query("SELECT data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'lead_products' AND column_name = 'lead_id'")).rows[0].data_type;
      const f = write.buildReplaceKeysSql(replaceSpec, keyType);
      const del = await client.query(f.delete_sql, f.binds(['coa:T11']));
      expect(del.rowCount).toBe(2);
      const plan = write.buildWritePlan(upsertSpec, descriptor);
      expect(plan.upsert_sql).not.toMatch(/\n\s+WHERE /);
      const ins = await client.query(plan.upsertSqlFor(1), plan.bindRow({ lead_id: 'coa:T11', product_id: b, confidence: 0.75 }));
      expect(ins.rows).toEqual([{ is_insert: true }]);
      const after = await client.query("SELECT lead_id, product_id FROM lead_products WHERE lead_id IN ('coa:T11', 'permit:T11--00') ORDER BY lead_id, product_id");
      expect(after.rows).toEqual([{ lead_id: 'coa:T11', product_id: b }, { lead_id: 'permit:T11--00', product_id: a }]);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  it('T11b: a G keyed update from rows is accepted with catalog-typed arrays and honours its IS DISTINCT FROM guard', async () => {
    if (!pool) throw new Error('dbAvailable() is true but pool is missing — refusing to silently register zero tests.');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('CREATE TEMP TABLE r_eg_g (id integer PRIMARY KEY, label varchar(30), stamped_at timestamptz) ON COMMIT DROP');
      await client.query("INSERT INTO r_eg_g VALUES (1, 'a', NULL), (2, 'b', NULL)");
      const g = write.buildKeyedUpdateFromRowsSql({
        table: 'r_eg_g', key: ['id'],
        columns: [{ name: 'id', written: 'step' }, { name: 'label', written: 'step' }, { name: 'stamped_at', written: 'step', source: 'run_at' }],
        write_discipline: { class: 'set_based_scoped', guard: 'is_distinct_from', guard_columns: ['label'], rows: 'compute' },
      }, { id: 'integer', label: 'character varying', stamped_at: 'timestamp with time zone' });
      const at = new Date('2026-10-18T00:00:00Z');
      const res = await client.query(g.sql, [[1, 2], ['a', 'z'], [at, at]]);
      expect(res.rowCount).toBe(1);
      const { rows } = await client.query('SELECT id, label FROM r_eg_g ORDER BY id');
      expect(rows).toEqual([{ id: 1, label: 'a' }, { id: 2, label: 'z' }]);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });
});
