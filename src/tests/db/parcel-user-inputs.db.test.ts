// 🔗 SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §11a.4, §11a.9 (dated notes 2026-11-11),
//   docs/specs/00-architecture/114_rls_policy_catalog.md §2 (dated note 2026-11-11: parcel_user_inputs Class B), §4, §10;
//   docs/specs/00-architecture/115_scheduling.md offboarding_sweep_30day (dated note 2026-11-11).
//
// MF-19 · live-DB proof of migration 305 (applied by the operator's DB job; every write here is inside BEGIN ... ROLLBACK). WRITTEN, NOT RUN in
// the build lane (no DB there): it runs under npm run test:db.
//   (a) columns, types and nullability (exact list);
//   (b) the CHECKs both ways: input_key, value_sqm <= 0, typed_unit, source <> 'user', status, reverted without reverted_at;
//   (c) entered once: a second active entry is 23505; after a revert a new entry is accepted (history kept, two rows);
//   (d) the route's insert and revert SQL (src/lib/parcels/lot-size-entry.ts) on live rows, through the real driver: 289.86 stored, the
//       read returns the active row only, a reverted row is never read, the revert writes one admin_audit_log row;
//   (e) two concurrent inserts for one lot: exactly one row (the partial unique index decides; the loser is 23505 -> 409 in the route);
//   (f) D-7 erasure: deleting the author's auth.users row keeps the entry and sets entered_by to NULL;
//   (g) RLS on, zero policies (Class B); as authenticated: zero rows read and INSERT refused;
//   (h) the five logic_variables rows equal the seed (the switch 0).
import fs from 'node:fs';
import path from 'node:path';
import type { Pool, PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';
import { writeAdminAudit } from '@/lib/admin/admin-audit';
import { insertLotSizeEntry, readLotSizeRead, revertLotSizeEntry, LOT_SIZE_SETTING_KEYS, type LotSizeSettings } from '@/lib/parcels/lot-size-entry';

const USER = '00000000-0000-0000-0000-00000000c019';
const ADMIN = '00000000-0000-0000-0000-00000000a019';
const PARCEL_REF = 'MF19-TEST-1';
const SEED = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'scripts/seeds/logic_variables.json'), 'utf8')) as Record<string, { default: number }>;
const ON: LotSizeSettings = { enabled: true, min_sqm: 46.45, max_sqm: 4645.15, ratio_max: 3, per_day: 5 };
let arms = 0;

/** A transaction that always rolls back, with the two users and one lot (City value 290 m²); returns the lot's pk. */
const inTxn = async (pool: Pool, fn: (c: PoolClient, pk: number) => Promise<void>): Promise<void> => {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query("SELECT set_config('request.jwt.claims', '{}', true)");
    await c.query('INSERT INTO auth.users (id) VALUES ($1), ($2) ON CONFLICT DO NOTHING', [USER, ADMIN]);
    const p = await c.query<{ id: number }>("INSERT INTO parcels (parcel_id, lot_size_sqm) VALUES ($1, 290) RETURNING id", [PARCEL_REF]);
    await fn(c, p.rows[0]!.id);
  } finally {
    await c.query('ROLLBACK');
    c.release();
  }
};
const code = async (c: PoolClient, sql: string, params: unknown[] = []): Promise<string | null> => {
  await c.query('SAVEPOINT s');
  try { await c.query(sql, params); await c.query('RELEASE SAVEPOINT s'); return null; } catch (e) { await c.query('ROLLBACK TO SAVEPOINT s'); return (e as { code?: string }).code ?? 'error'; }
};
const row = (pk: number, over: Record<string, unknown> = {}): [string, unknown[]] => {
  const r = { parcel_id: pk, input_key: 'lot_area', value_sqm: 289.86, typed_value: 3120, typed_unit: 'sqft', entered_by: USER, ...over };
  const cols = Object.keys(r);
  return [`INSERT INTO parcel_user_inputs (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})`, cols.map((k) => (r as Record<string, unknown>)[k])];
};

describe.skipIf(!dbAvailable())('migration 305: parcel_user_inputs and the MF-19 settings (live DB)', () => {
  let pool: Pool;
  beforeAll(() => { pool = getTestPool() as Pool; });
  afterAll(() => { expect(arms).toBe(8); });

  it('(a) columns, types and nullability', async () => {
    const cols = (await pool.query<{ c: string }>(
      "SELECT column_name || ' ' || data_type || ' ' || is_nullable AS c FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'parcel_user_inputs' ORDER BY ordinal_position")).rows.map((r) => r.c);
    expect(cols).toEqual([
      'id bigint NO', 'parcel_id integer NO', 'input_key text NO', 'value_sqm numeric NO', 'typed_value numeric NO', 'typed_unit text NO', 'source text NO',
      'entered_at timestamp with time zone NO', 'entered_by uuid YES', 'status text NO', 'reverted_at timestamp with time zone YES', 'reverted_by uuid YES',
    ]);
    arms++;
  });

  it('(b) the CHECKs refuse each bad value; a good row is accepted', async () => {
    await inTxn(pool, async (c, pk) => {
      expect(await code(c, ...row(pk, { input_key: 'storeys' }))).toBe('23514');
      expect(await code(c, ...row(pk, { value_sqm: 0 }))).toBe('23514');
      expect(await code(c, ...row(pk, { typed_unit: 'acres' }))).toBe('23514');
      expect(await code(c, ...row(pk, { source: 'verified' }))).toBe('23514');
      expect(await code(c, ...row(pk, { status: 'deleted' }))).toBe('23514');
      expect(await code(c, ...row(pk, { status: 'reverted' }))).toBe('23514'); // reverted without reverted_at
      expect(await code(c, ...row(pk))).toBeNull();
    });
    arms++;
  });

  it('(c) entered once: a second active entry is 23505; after a revert a new one is accepted and history keeps both', async () => {
    await inTxn(pool, async (c, pk) => {
      expect(await code(c, ...row(pk))).toBeNull();
      expect(await code(c, ...row(pk, { value_sqm: 300 }))).toBe('23505');
      await c.query("UPDATE parcel_user_inputs SET status = 'reverted', reverted_at = NOW() WHERE parcel_id = $1", [pk]);
      expect(await code(c, ...row(pk, { value_sqm: 300 }))).toBeNull();
      expect((await c.query('SELECT status FROM parcel_user_inputs WHERE parcel_id = $1 ORDER BY id', [pk])).rows.map((r) => r.status)).toEqual(['reverted', 'active']);
    });
    arms++;
  });

  it('(d) the route SQL on live rows: insert, read the active row only, revert with one audit row', async () => {
    await inTxn(pool, async (c, pk) => {
      const v = await insertLotSizeEntry(c, { parcel_id: PARCEL_REF, lot_area_value: 3120, lot_area_unit: 'sqft' }, USER, ON);
      expect([v.sqm, v.display, v.source]).toEqual([289.86, '3,120 sq ft · 290 m²', 'user']);
      const r1 = await readLotSizeRead(c, PARCEL_REF);
      expect([r1?.parcel_pk, r1?.city_sqm, r1?.entry?.value_sqm]).toEqual([pk, 290, 289.86]);
      const rv = await revertLotSizeEntry(c, PARCEL_REF, ADMIN);
      await writeAdminAudit(rv.audit, c); // as the route does, in the same transaction
      expect((await readLotSizeRead(c, PARCEL_REF))?.entry).toBeNull();
      expect((await c.query("SELECT count(*)::int AS n FROM admin_audit_log WHERE action = 'lot_size_revert' AND target_uid = $1", [PARCEL_REF])).rows[0].n).toBe(1);
    });
    arms++;
  });

  it('(e) two concurrent inserts for one committed lot: exactly one active row', async () => {
    const setup = await pool.query<{ id: number }>("INSERT INTO parcels (parcel_id, lot_size_sqm) VALUES ('MF19-RACE', 290) RETURNING id");
    const pk = setup.rows[0]!.id;
    await pool.query('INSERT INTO auth.users (id) VALUES ($1) ON CONFLICT DO NOTHING', [USER]);
    try {
      const [a, b] = await Promise.allSettled([pool.query(...row(pk)), pool.query(...row(pk, { value_sqm: 291 }))]);
      expect([a.status, b.status].sort()).toEqual(['fulfilled', 'rejected']);
      const lost = [a, b].find((x) => x.status === 'rejected') as PromiseRejectedResult;
      expect((lost.reason as { code?: string }).code).toBe('23505');
      expect((await pool.query("SELECT count(*)::int AS n FROM parcel_user_inputs WHERE parcel_id = $1 AND status = 'active'", [pk])).rows[0].n).toBe(1);
    } finally {
      await pool.query('DELETE FROM parcel_user_inputs WHERE parcel_id = $1', [pk]);
      await pool.query('DELETE FROM parcels WHERE id = $1', [pk]);
    }
    arms++;
  });

  it('(f) D-7: erasing the author keeps the entry and empties entered_by', async () => {
    await inTxn(pool, async (c, pk) => {
      await c.query(...row(pk));
      await c.query('DELETE FROM auth.users WHERE id = $1', [USER]);
      const r = await c.query('SELECT entered_by, value_sqm::float8 AS v FROM parcel_user_inputs WHERE parcel_id = $1', [pk]);
      expect(r.rows).toEqual([{ entered_by: null, v: 289.86 }]);
    });
    arms++;
  });

  it('(g) Class B: RLS on with zero policies; authenticated reads nothing and cannot insert', async () => {
    const rls = await pool.query("SELECT relrowsecurity FROM pg_class WHERE relname = 'parcel_user_inputs' AND relnamespace = 'public'::regnamespace");
    expect(rls.rows[0]?.relrowsecurity).toBe(true);
    expect((await pool.query("SELECT count(*)::int AS n FROM pg_policies WHERE tablename = 'parcel_user_inputs'")).rows[0].n).toBe(0);
    await inTxn(pool, async (c, pk) => {
      await c.query(...row(pk));
      await c.query('GRANT SELECT, INSERT ON parcel_user_inputs TO authenticated');
      await c.query('SET LOCAL ROLE authenticated');
      expect((await c.query('SELECT count(*)::int AS n FROM parcel_user_inputs')).rows[0].n).toBe(0);
      expect(await code(c, ...row(pk, { value_sqm: 300 }))).toBe('42501');
    });
    arms++;
  });

  it('(h) the five logic_variables rows equal the seed (the switch 0)', async () => {
    const keys = Object.values(LOT_SIZE_SETTING_KEYS);
    const r = await pool.query<{ variable_key: string; v: number }>('SELECT variable_key, variable_value::float8 AS v FROM logic_variables WHERE variable_key = ANY($1::text[]) ORDER BY variable_key', [keys]);
    expect(Object.fromEntries(r.rows.map((x) => [x.variable_key, x.v]))).toEqual(Object.fromEntries([...keys].sort().map((k) => [k, SEED[k]!.default])));
    expect(SEED[LOT_SIZE_SETTING_KEYS.enabled]!.default).toBe(0);
    arms++;
  });
});
