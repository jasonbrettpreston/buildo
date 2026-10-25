// SPEC LINK: docs/specs/01-pipeline/134_resolve_bylaws.md §3 (closed-column CHECKs), §7 I4, I9, I11, I14; docs/specs/01-pipeline/124a_step_standard_policy_appendix.md R-IU
// Handbook: Spec 132 §x-tooling.1 (R-DH: *.db.test.ts run only under npm run test:db); Spec 132 §core.12 (R-CT: RLS); operator CHAT-80.QP (option 4)
//
// The DB arms of migration 282 (Spec 134 §9 "the DB arms as *.db.test.ts"): one case per CHECK, the cascade, the SQL identity recompute (the lot
// row_sha and both dictionary keys equal what the JS emits), and the view bylaw_resolution_results decoding a batch-core lot row to the same
// 8 stored fields the JS decode gives. Each case runs inside a transaction that is rolled back, against the disposable test database only
// (setup-testcontainer refuses the dev stack). NOT RUN in the lane that wrote it (no DB writes allowed there): queued in the lane report for the
// DB night that applies migration 282.
//
// Run: BUILDO_TEST_DB=1 npx vitest run src/tests/steps/resolve_bylaws/migration.db.test.ts --no-file-parallelism

import { afterAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { PoolClient } from 'pg';
import { dbAvailable, getTestPool } from '../../db/setup-testcontainer';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped module surface
const ROOT = path.resolve(__dirname, '../../../../');
const rd = (r: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, r), 'utf8')) as Json;
const pool = getTestPool();
const HEX = 'a'.repeat(64);
const MAP = rd('scripts/seeds/bylaw/layer2-map.json');
const SCOPE = rd('scripts/seeds/bylaw/layer2-scope.json');
const PAIRS = (SCOPE.structures as string[]).flatMap((s) => (SCOPE.targets[s] as string[]).map((t) => ({ structure: s, target: t })));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const NOT_EVALUATED = ((require(path.join(ROOT, 'scripts/lib/bylaw-lot-row.js')) as Json).resultCodes(MAP) as string[]).indexOf('not_evaluated');

describe.skipIf(!dbAvailable())('migration 282 — bylaw_resolution_* (Spec 134 §3, option 4)', () => {
  if (!pool) {
    if (process.env.BUILDO_TEST_DB === '1' || process.env.CI === 'true') throw new Error('dbAvailable() is true but pool is missing — refusing to silently register zero tests.');
    return;
  }
  afterAll(async () => { await pool.end(); });

  /** Run fn in a transaction that is always rolled back. */
  async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
    const c = await pool!.connect();
    try { await c.query('BEGIN'); return await fn(c); } finally { await c.query('ROLLBACK'); c.release(); }
  }
  /** The statement must be refused by a constraint; the savepoint keeps the transaction usable. */
  async function refused(c: PoolClient, sql: string, params: unknown[] = []): Promise<string> {
    await c.query('SAVEPOINT s');
    try { await c.query(sql, params); } catch (e) { await c.query('ROLLBACK TO SAVEPOINT s'); return String((e as Error).message); }
    await c.query('ROLLBACK TO SAVEPOINT s');
    throw new Error(`expected a constraint to refuse: ${sql}`);
  }
  const codes = (v: number): number[] => Array.from({ length: PAIRS.length }, () => v);
  const LOT = `INSERT INTO bylaw_resolution_lots (parcel_id, lot_gate, codes, winner_ids, permitted, inputs_defaulted, row_sha, table_version, evaluator_version, resolved_at) VALUES ($1, $2, $3::smallint[], $4::int[], $5::smallint[], $6, '${HEX}', '${HEX}', '${HEX}', now())`;
  const perm = (): number[] => (SCOPE.classes as string[]).map(() => 0);
  const parcel = async (c: PoolClient, id: string): Promise<number> => (await c.query(`INSERT INTO parcels (parcel_id, feature_type) VALUES ($1, 'TEST') RETURNING id`, [id])).rows[0].id as number;

  it('a valid lot row inserts; the cascade removes it with its parcel (R-IU)', async () => {
    await tx(async (c) => {
      const p = await parcel(c, 'RB-FX-1');
      await c.query(LOT, [p, null, codes(0), null, perm(), 0]);
      await c.query('DELETE FROM parcels WHERE id = $1', [p]);
      expect((await c.query('SELECT count(*)::int n FROM bylaw_resolution_lots')).rows[0].n).toBe(0);
    });
  });

  it('lots: the gate is closed, codes are one closed code per pair, arrays are full width, permitted is one slot per class', async () => {
    await tx(async (c) => {
      const p = await parcel(c, 'RB-FX-2');
      expect(await refused(c, LOT, [p, 'not_a_gate', codes(NOT_EVALUATED), null, perm(), 0])).toMatch(/lot_gate/);
      expect(await refused(c, LOT, [p, null, codes(9), null, perm(), 0])).toMatch(/codes_closed/);
      expect(await refused(c, LOT, [p, null, codes(0).slice(1), null, perm(), 0])).toMatch(/codes_closed/);
      expect(await refused(c, LOT, [p, null, codes(0), [1, 2], perm(), 0])).toMatch(/array_width/);
      expect(await refused(c, LOT, [p, null, codes(0), null, [0], 0])).toMatch(/permitted_closed/);
      expect(await refused(c, LOT, [p, null, codes(0), null, perm(), -1])).toMatch(/inputs_defaulted/);
    });
  });

  it('I4: a gated lot has only not_evaluated results and no winner', async () => {
    await tx(async (c) => {
      const p = await parcel(c, 'RB-FX-3');
      expect(await refused(c, LOT, [p, 'ambiguous_zone', codes(0), null, perm(), 0])).toMatch(/gated_all_not_evaluated/);
      expect(await refused(c, LOT, [p, 'ambiguous_zone', codes(NOT_EVALUATED), codes(1), perm(), 0])).toMatch(/gated_all_not_evaluated/);
      await c.query(LOT, [p, 'ambiguous_zone', codes(NOT_EVALUATED), null, perm(), 0]);
    });
  });

  it('dictionaries: the unit layer is closed; both keys are primary keys', async () => {
    await tx(async (c) => {
      const U = `INSERT INTO bylaw_resolution_units (unit_key, unit_id, regulation_id, layer, resolved_at) VALUES ($1, $2, 'x', $3, now())`;
      expect(await refused(c, U, [1, 'u1', 'nope'])).toMatch(/layer/);
      await c.query(U, [1, 'u1', 'base']);
      expect(await refused(c, U, [1, 'u2', 'base'])).toMatch(/unit_key|duplicate/);
      await c.query(`INSERT INTO bylaw_resolution_texts (text_key, text, resolved_at) VALUES (1, 'a', now())`);
      expect(await refused(c, `INSERT INTO bylaw_resolution_texts (text_key, text, resolved_at) VALUES (1, 'b', now())`)).toMatch(/text_key|duplicate/);
    });
  });

  it('RLS is enabled on every table (Class B, no policies)', async () => {
    const r = await pool!.query(`SELECT relname, relrowsecurity FROM pg_class WHERE relname LIKE 'bylaw_resolution_%' AND relkind = 'r' ORDER BY relname`);
    expect(r.rows.map((x: Json) => x.relname)).toEqual(['bylaw_resolution_lots', 'bylaw_resolution_texts', 'bylaw_resolution_units']);
    for (const x of r.rows as Json[]) expect(x.relrowsecurity, x.relname).toBe(true);
  });

  it('Q-I and the view: the SQL identity recompute is 0 for rows from the batch core, and the view decodes the lot row to the JS decode', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mz = require(path.join(ROOT, 'scripts/lib/bylaw-materialize.js')) as Json;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const lr = require(path.join(ROOT, 'scripts/lib/bylaw-lot-row.js')) as Json;
    const INPUT = rd('docs/reference/bylaw-layer2-input.json');
    const env = mz.makeEnv({ body: INPUT.body, map: MAP, scope: SCOPE, vocab: rd('scripts/seeds/bylaw/vocab.json'), zoneList: ['RD'], versions: { table_version: INPUT.table_version, evaluator_version: INPUT.evaluator_version } });
    await tx(async (c) => {
      const id = await parcel(c, 'RB-FX-4');
      const row = { id, parcel_id: 'RB-FX-4', zoning_class: 'RD', zoning_zn_string: 'RD (f10.0; a245)', exception_number: null, zoning_overlays: {}, on_policy_road: false, is_corner_lot: false, is_through_lot: false, abuts_laneway: false, frontage_m: 10.5, depth_m: 35.2, lot_size_sqm: 369.6, zoning_is_ambiguous: false, in_sixplex_area: false, is_heritage_designated: false, geom_npoints: 5 };
      const out = mz.materializeBatch([row], env);
      const ins = async (table: string, rows: Json[], json: string[]): Promise<void> => {
        for (const r of rows) {
          const keys = Object.keys(r);
          const vals = keys.map((k) => (json.includes(k) && r[k] !== null ? JSON.stringify(r[k]) : r[k]));
          const ph = keys.map((k, i) => (json.includes(k) ? `$${i + 1}::jsonb` : `$${i + 1}`));
          await c.query(`INSERT INTO ${table} (${[...keys, 'resolved_at'].join(', ')}) VALUES (${[...ph, 'now()'].join(', ')})`, vals);
        }
      };
      await ins('bylaw_resolution_units', out.rows.units, []);
      await ins('bylaw_resolution_texts', out.rows.texts, []);
      await ins('bylaw_resolution_lots', out.rows.lots, ['class_results']);
      for (const q of mz.rowShaMismatchSql({ units: 'bylaw_resolution_units', texts: 'bylaw_resolution_texts', lots: 'bylaw_resolution_lots' }) as string[]) {
        expect(Object.values((await c.query(q)).rows[0])[0], q.slice(0, 90)).toBe(0);
      }
      const dicts = lr.makeDecodeDicts({ units: out.rows.units, texts: out.rows.texts });
      const want = lr.decodeLotResults({ lot: out.rows.lots[0], pairs: PAIRS, classes: SCOPE.classes, map: MAP, dicts }) as Json[];
      const got = (await c.query(`SELECT class, structure, target, status, value_kind, value, reason, winner_unit_id, winner_layer, evidence_kind, evidence_ref FROM bylaw_resolution_results WHERE parcel_id = $1`, [id])).rows as Json[];
      expect(got).toHaveLength(want.length);
      const key = (r: Json): string => `${r.class}/${r.structure}/${r.target}`;
      const byKey = new Map(got.map((r) => [key(r), r]));
      for (const w of want) {
        const g = byKey.get(key(w)) as Json;
        expect({ status: g.status, kind: g.value_kind, value: g.value, reason: g.reason, winner: g.winner_unit_id, layer: g.winner_layer, ek: g.evidence_kind, ref: g.evidence_ref }, key(w))
          .toEqual({ status: w.status, kind: w.value_kind, value: w.value, reason: w.reason, winner: w.winner_unit_id, layer: w.winner_layer, ek: w.evidence_kind, ref: w.evidence_ref });
      }
    });
  });
});
