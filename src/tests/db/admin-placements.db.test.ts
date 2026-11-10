// 🔗 SPEC LINK: docs/specs/00-architecture/114_rls_policy_catalog.md section 2 (dated notes 2026-11-09 and 2026-11-10: the admin-read
//   pattern for offers and advertisers; placements Class E, amendment (b)) and section 10 (a positive and a negative case per policy),
//   docs/specs/02-web-admin/126_maxbld_surface_standard.md section 6.1 (declare-and-assert), 6.2 rule 3 (read the LIVE catalog),
//   6.3 rows 4-6 (dated note 2026-11-10); docs/specs/02-web-admin/128_surface_standard_policy.md R-17, R-34 (i).
//
// MF-40 · plan section 3.5 lock 5 (folds 3, 9, 10). Live-DB proof of migration 302 (applied by the operator; this file only reads, and
// every write is inside BEGIN ... ROLLBACK). WRITTEN, NOT RUN in the build lane (no DB there): it runs under npm run test:db.
//   (a) advertisers, placements, offers: columns, types and nullability both directions (exact lists);
//   (b) the CHECKs both ways: disclosure_required false refused (R-17, R-34 (i)), max_slots 0, a bad placement_key, a blank advertiser
//       name, flight_end before flight_start, a non-object targeting, an empty and an over-long creative_text;
//   (c) the FKs: unknown advertiser, unknown placement, unknown creative asset refused; an existing media_assets row accepted;
//   (d) the placements seed equals ad-contract.json slots and report-presentation.json ad_placements (keys, max_slots), REPORT, disclosure;
//   (e) RLS on all three; the live policy sets are exactly {advertisers_select_admin}, {placements_select_public}, {offers_select_admin};
//       as `authenticated` and `anon`: everyone reads placements, only an admin reads offers and advertisers, INSERT denied to all;
//   (f) updated_at: the trigger moves it on UPDATE; the route's concurrency SQL (WHERE updated_at = $2::timestamptz with the value read
//       back as ::text) matches the fresh value and misses a stale one, with the real driver (fold 3: no mocked Date);
//   (g) the descriptor invariants and plausibility on the live tables: flight window ordered, offer has placement, the max_slots WARN
//       query runs, disclosure coverage (0 of 3 without disclosure);
//   (h) the two Admin Placements logic_variables rows equal the seed.
// Owed with the MF-40 route code (not in this file yet): the forced audit-insert failure that must leave no offer row, and the 409 through
// the PUT handler itself (fold 9).
import fs from 'node:fs';
import path from 'node:path';
import type { Pool, PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';

const ADMIN = '00000000-0000-0000-0000-00000000a400';
const USER = '00000000-0000-0000-0000-00000000b400';
const read = (p: string): string => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const SEED = JSON.parse(read('scripts/seeds/logic_variables.json')) as Record<string, { default: number; admin?: { group?: string } }>;
const PLACEMENT_KEYS = Object.keys(SEED).filter((k) => SEED[k]?.admin?.group === 'Admin Placements').sort();
const CONTRACT = JSON.parse(read('scripts/surfaces/_schema/ad-contract.json')) as { slots: string[] };
const PRESENTATION = JSON.parse(read('scripts/surfaces/_schema/report-presentation.json')) as { ad_placements: { placements: Array<{ key: string; max_slots: number }> } };
const DESCRIPTOR = JSON.parse(read('scripts/surfaces/parcel_admin/F04/surfaces/admin_placements.descriptor.json')) as {
  invariants: Array<{ id: string; sql: string }>; plausibility: Array<{ id: string; sql: string }>;
};
let arms = 0;

/** Run `fn` in a transaction that always rolls back; users ADMIN (is_admin) and USER exist inside it. */
const inTxn = async (pool: Pool, fn: (c: PoolClient) => Promise<void>): Promise<void> => {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query('INSERT INTO auth.users (id) VALUES ($1), ($2) ON CONFLICT DO NOTHING', [ADMIN, USER]);
    await c.query('INSERT INTO profiles (id, is_admin) VALUES ($1, true), ($2, false) ON CONFLICT (id) DO UPDATE SET is_admin = EXCLUDED.is_admin', [ADMIN, USER]);
    await fn(c);
  } finally {
    await c.query('ROLLBACK');
    c.release();
  }
};
const asUser = async (c: PoolClient, uid: string | null): Promise<void> => {
  await c.query(uid === null ? 'SET LOCAL ROLE anon' : 'SET LOCAL ROLE authenticated');
  await c.query("SELECT set_config('request.jwt.claims', $1, true)", [uid === null ? '' : JSON.stringify({ sub: uid, role: 'authenticated' })]);
  // The pinned test image's auth.uid() reads the legacy request.jwt.claim.sub only (the harness fallback reads request.jwt.claims): set both.
  await c.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [uid ?? '']);
};
const code = async (c: PoolClient, sql: string, params: unknown[] = []): Promise<string | null> => {
  await c.query('SAVEPOINT s');
  try { await c.query(sql, params); await c.query('RELEASE SAVEPOINT s'); return null; } catch (e) { await c.query('ROLLBACK TO SAVEPOINT s'); return (e as { code?: string }).code ?? 'error'; }
};
const insert = (table: string, r: Record<string, unknown>): [string, unknown[]] => {
  const cols = Object.keys(r);
  return [`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})`, cols.map((k) => r[k])];
};
/** One advertiser row inside the transaction; returns its id. */
const advertiser = async (c: PoolClient): Promise<string> => {
  const id = crypto.randomUUID();
  await c.query(...insert('advertisers', { advertiser_id: id, name: 'Example sponsor' }));
  return id;
};
const offer = (advertiserId: string, over: Record<string, unknown> = {}): [string, unknown[]] =>
  insert('offers', { offer_id: crypto.randomUUID(), advertiser_id: advertiserId, placement_key: 'detail_footer', targeting: '{}', creative_text: 'Example sponsor offer (detail footer)', ...over });
const columns = async (pool: Pool, table: string): Promise<string[]> =>
  (await pool.query<{ column_name: string; data_type: string; is_nullable: string }>(
    "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position", [table]))
    .rows.map((r) => `${r.column_name} ${r.data_type} ${r.is_nullable}`);

describe.skipIf(!dbAvailable())('migration 302: advertisers, placements, offers, Admin Placements variables (live DB)', () => {
  let pool: Pool;
  beforeAll(() => { pool = getTestPool() as Pool; });
  afterAll(() => { expect(arms).toBe(8); });

  it('(a) columns, types and nullability of the three tables', async () => {
    arms += 1;
    expect(await columns(pool, 'advertisers')).toEqual([
      'advertiser_id uuid NO', 'name text NO', 'contact_user_id uuid YES', 'active boolean NO',
      'created_at timestamp with time zone NO', 'updated_at timestamp with time zone NO']);
    expect(await columns(pool, 'placements')).toEqual([
      'placement_key text NO', 'surface_archetype text NO', 'max_slots integer NO', 'disclosure_required boolean NO']);
    expect(await columns(pool, 'offers')).toEqual([
      'offer_id uuid NO', 'advertiser_id uuid NO', 'placement_key text NO', 'targeting jsonb NO', 'flight_start timestamp with time zone YES',
      'flight_end timestamp with time zone YES', 'active boolean NO', 'creative_text text NO', 'creative_asset_id uuid YES',
      'created_at timestamp with time zone NO', 'updated_at timestamp with time zone NO']);
  });

  it('(b) the CHECKs both ways', async () => {
    arms += 1;
    await inTxn(pool, async (c) => {
      expect(await code(c, ...insert('placements', { placement_key: 'test_slot', surface_archetype: 'REPORT', max_slots: 1, disclosure_required: true }))).toBeNull();
      expect(await code(c, ...insert('placements', { placement_key: 'test_slot_b', surface_archetype: 'REPORT', max_slots: 1, disclosure_required: false }))).toBe('23514');
      expect(await code(c, "UPDATE placements SET disclosure_required = false WHERE placement_key = 'detail_footer'")).toBe('23514');
      expect(await code(c, ...insert('placements', { placement_key: 'test_slot_c', surface_archetype: 'REPORT', max_slots: 0, disclosure_required: true }))).toBe('23514');
      expect(await code(c, ...insert('placements', { placement_key: 'Bad-Key', surface_archetype: 'REPORT', max_slots: 1, disclosure_required: true }))).toBe('23514');
      expect(await code(c, ...insert('advertisers', { name: '  ' }))).toBe('23514');
      const a = await advertiser(c);
      expect(await code(c, ...offer(a))).toBeNull();
      expect(await code(c, ...offer(a, { flight_start: '2026-12-01T00:00:00Z', flight_end: '2026-12-31T00:00:00Z' }))).toBeNull();
      expect(await code(c, ...offer(a, { flight_start: '2026-12-31T00:00:00Z', flight_end: '2026-12-01T00:00:00Z' }))).toBe('23514');
      // The array goes in as JSON text: node-postgres sends a JS array as a Postgres array literal ('{}'), which jsonb reads as an empty OBJECT.
      expect(await code(c, ...offer(a, { targeting: '[]' }))).toBe('23514');
      expect(await code(c, ...offer(a, { creative_text: ' ' }))).toBe('23514');
      expect(await code(c, ...offer(a, { creative_text: 'x'.repeat(281) }))).toBe('23514');
      expect(await code(c, ...offer(a, { creative_text: 'x'.repeat(280) }))).toBeNull();
    });
  });

  it('(c) the FKs: unknown advertiser, placement and creative asset refused; an existing asset accepted', async () => {
    arms += 1;
    await inTxn(pool, async (c) => {
      const a = await advertiser(c);
      expect(await code(c, ...offer(crypto.randomUUID()))).toBe('23503');
      expect(await code(c, ...offer(a, { placement_key: 'banner_top' }))).toBe('23503');
      expect(await code(c, ...offer(a, { creative_asset_id: crypto.randomUUID() }))).toBe('23503');
      const asset = crypto.randomUUID();
      await c.query(...insert('media_assets', { asset_id: asset, kind: 'ad_creative', path: `ad_creative/${asset}.png`, mime: 'image/png', bytes: 10, alt: 'a' }));
      expect(await code(c, ...offer(a, { creative_asset_id: asset }))).toBeNull();
    });
  });

  it('(d) the placements seed equals the ad contract and ad_placements (the contract is the authority)', async () => {
    arms += 1;
    const r = await pool.query<{ placement_key: string; surface_archetype: string; max_slots: number; disclosure_required: boolean }>(
      'SELECT placement_key, surface_archetype, max_slots, disclosure_required FROM placements ORDER BY placement_key');
    expect(r.rows.map((x) => x.placement_key), 'a new slot needs a contract change and a placement migration').toEqual([...CONTRACT.slots].sort());
    for (const x of r.rows) {
      const p = PRESENTATION.ad_placements.placements.find((q) => q.key === x.placement_key);
      expect([x.surface_archetype, x.max_slots, x.disclosure_required]).toEqual(['REPORT', p?.max_slots, true]);
    }
  });

  it('(e) RLS on; the live policy sets; everyone reads placements, only an admin reads offers and advertisers; INSERT denied', async () => {
    arms += 1;
    const rls = await pool.query<{ relname: string; on: boolean }>(
      "SELECT relname, relrowsecurity AS on FROM pg_class WHERE oid IN ('public.advertisers'::regclass, 'public.placements'::regclass, 'public.offers'::regclass) ORDER BY 1");
    expect(rls.rows).toEqual([{ relname: 'advertisers', on: true }, { relname: 'offers', on: true }, { relname: 'placements', on: true }]);
    const pol = await pool.query<{ tablename: string; policyname: string; cmd: string; roles: string[] }>(
      "SELECT tablename, policyname, cmd, roles::text[] AS roles FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('advertisers', 'placements', 'offers') ORDER BY 1, 2");
    expect(pol.rows).toEqual([
      { tablename: 'advertisers', policyname: 'advertisers_select_admin', cmd: 'SELECT', roles: ['authenticated'] },
      { tablename: 'offers', policyname: 'offers_select_admin', cmd: 'SELECT', roles: ['authenticated'] },
      { tablename: 'placements', policyname: 'placements_select_public', cmd: 'SELECT', roles: ['anon', 'authenticated'] },
    ]);
    await inTxn(pool, async (c) => {
      const a = await advertiser(c);
      await c.query(...offer(a));
      await c.query('GRANT SELECT, INSERT ON advertisers, placements, offers TO authenticated, anon');
      await c.query('GRANT SELECT ON profiles TO authenticated');
      const seen = async (uid: string | null, table: string): Promise<number> => {
        await asUser(c, uid);
        const n = (await c.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n as number;
        await c.query('RESET ROLE');
        return n;
      };
      for (const uid of [ADMIN, USER, null]) expect(await seen(uid, 'placements')).toBe(CONTRACT.slots.length);
      for (const t of ['offers', 'advertisers']) {
        expect(await seen(ADMIN, t)).toBeGreaterThan(0);
        expect(await seen(USER, t)).toBe(0);
        expect(await seen(null, t)).toBe(0);
      }
      for (const uid of [ADMIN, USER, null]) {
        await asUser(c, uid);
        expect(await code(c, ...insert('advertisers', { name: 'x' }))).toBe('42501');
        expect(await code(c, ...offer(a))).toBe('42501');
        expect(await code(c, ...insert('placements', { placement_key: 'x_slot', surface_archetype: 'REPORT', max_slots: 1, disclosure_required: true }))).toBe('42501');
        await c.query('RESET ROLE');
      }
    });
  });

  it('(f) updated_at moves on UPDATE; the concurrency compare matches the fresh ::text value and misses a stale one', async () => {
    arms += 1;
    await inTxn(pool, async (c) => {
      const a = await advertiser(c);
      const [sql, params] = offer(a, { updated_at: '2000-01-01T00:00:00.123456Z' });
      await c.query(sql, params);
      const id = params[0] as string;
      const stale = (await c.query<{ u: string }>('SELECT updated_at::text AS u FROM offers WHERE offer_id = $1', [id])).rows[0]?.u ?? '';
      await c.query("UPDATE offers SET creative_text = 'Example sponsor offer (edited)' WHERE offer_id = $1", [id]);
      const fresh = (await c.query<{ u: string }>('SELECT updated_at::text AS u FROM offers WHERE offer_id = $1', [id])).rows[0]?.u ?? '';
      expect(fresh).not.toBe(stale);
      const hit = async (u: string): Promise<number> =>
        (await c.query("UPDATE offers SET active = active WHERE offer_id = $1 AND updated_at = $2::timestamptz", [id, u])).rowCount ?? -1;
      expect(await hit(stale)).toBe(0);
      expect(await hit(fresh)).toBe(1);
      // Microseconds survive the ::text round trip; a JS Date (milliseconds) would not compare equal (fold 3's RED).
      const millis = fresh.replace(/(\.\d{3})\d+/, '$1');
      if (millis !== fresh) expect(await hit(millis)).toBe(0);
    });
  });

  it('(g) the descriptor invariants and plausibility on the live tables', async () => {
    arms += 1;
    const one = (id: string, list: Array<{ id: string; sql: string }>): string => {
      const q = list.find((x) => x.id === id)?.sql;
      if (!q) throw new Error(`descriptor query ${id} missing`);
      return q;
    };
    for (const id of ['placements_flight_window_ordered', 'placements_offer_has_placement']) {
      expect(Number((await pool.query<{ count: string }>(one(id, DESCRIPTOR.invariants))).rows[0]?.count)).toBe(0);
    }
    // WARN, never silent: the query runs; a non-zero count is a commercial state the admin list shows (fold 8).
    await pool.query(one('placements_active_offers_within_max_slots', DESCRIPTOR.invariants));
    const cov = await pool.query(one('placements_disclosure_coverage', DESCRIPTOR.plausibility));
    expect(Object.values(cov.rows[0] ?? {}).map(Number)).toEqual([0, CONTRACT.slots.length]);
  });

  it('(h) the two Admin Placements logic_variables rows equal the seed', async () => {
    arms += 1;
    expect(PLACEMENT_KEYS).toEqual(['admin_placement_default_flight_days', 'admin_placement_max_horizon_days']);
    const r = await pool.query<{ variable_key: string; variable_value: string }>('SELECT variable_key, variable_value::text FROM logic_variables WHERE variable_key = ANY($1) ORDER BY 1', [PLACEMENT_KEYS]);
    expect(r.rows.map((x) => [x.variable_key, Number(x.variable_value)])).toEqual(PLACEMENT_KEYS.map((k) => [k, SEED[k]?.default]));
  });
});
