// 🔗 SPEC LINK: docs/specs/00-architecture/114_rls_policy_catalog.md sections 2, 6 and 10 (dated notes 2026-11-09: the one ruled admin-read
//   pattern; the surface-media bucket, admin scope; pgTAP-style positive and negative case per policy),
//   docs/specs/02-web-admin/126_maxbld_surface_standard.md sections 6.2 (rule 3: read the LIVE catalog) and 6.5.
//
// MF-37 · McFrontend queue · T5. Live-DB proof of migrations 300 and 301 (applied by the operator; this file only reads):
//   (a) media_assets columns, types and nullability; the kind and mime CHECKs both ways; the report-image and rule CHECKs;
//   (b) media_assets_report_order is UNIQUE ... NULLS NOT DISTINCT: two NULL-rule report images on one (scenario_key, position) are
//       refused, while the same pair on a plain-unique control table is accepted (the RED the clause exists for);
//   (c) RLS on, the live policy set is exactly {media_assets_select_admin}; as `authenticated`: an admin sees rows, a non-admin
//       and anon see none, INSERT is denied to both;
//   (d) the surface-media bucket is private and its live policies are exactly the three admin ones, each with a positive and a
//       negative case; an instance without the Storage tables FAILS this block unless BUILDO_TEST_DB_NO_STORAGE=1 names the gap;
//   (e) the five Admin Media logic_variables rows equal the seed.
// Every write is inside BEGIN ... ROLLBACK. Skipped unless the db harness is up (BUILDO_TEST_DB=1 or a disposable DATABASE_URL).
import fs from 'node:fs';
import path from 'node:path';
import type { Pool, PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';

const ADMIN = '00000000-0000-0000-0000-00000000a370';
const USER = '00000000-0000-0000-0000-00000000b370';
const SEED = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'scripts/seeds/logic_variables.json'), 'utf8')) as Record<string, { default: number; admin?: { group?: string } }>;
const MEDIA_KEYS = Object.keys(SEED).filter((k) => SEED[k]?.admin?.group === 'Admin Media').sort();
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
const row = (over: Record<string, unknown> = {}): [string, unknown[]] => {
  const r: Record<string, unknown> = { asset_id: crypto.randomUUID(), kind: 'ad_creative', mime: 'image/png', bytes: 10, alt: 'a', scenario_key: null, position: null, rule: null, ...over };
  r.path ??= `${r.kind}/${r.asset_id}.png`;
  const cols = Object.keys(r);
  return [`INSERT INTO media_assets (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})`, cols.map((k) => r[k])];
};

describe.skipIf(!dbAvailable())('migrations 300/301: media_assets, surface-media, Admin Media variables (live DB)', () => {
  let pool: Pool;
  beforeAll(() => { pool = getTestPool() as Pool; });
  afterAll(() => { expect(arms).toBe(5); });

  it('(a) columns, types, nullability and the CHECKs both ways', async () => {
    arms += 1;
    const cols = await pool.query<{ column_name: string; data_type: string; is_nullable: string }>(
      "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'media_assets' ORDER BY ordinal_position");
    expect(cols.rows.map((r) => `${r.column_name} ${r.data_type} ${r.is_nullable}`)).toEqual([
      'asset_id uuid NO', 'kind text NO', 'path text NO', 'mime text NO', 'bytes integer NO', 'alt text NO', 'scenario_key text YES',
      'position integer YES', 'rule jsonb YES', 'uploaded_by uuid YES', 'created_at timestamp with time zone NO']);
    await inTxn(pool, async (c) => {
      expect(await code(c, ...row())).toBeNull();
      expect(await code(c, ...row({ kind: 'report_image', scenario_key: 's', position: 0 }))).toBeNull();
      expect(await code(c, ...row({ kind: 'banner' }))).toBe('23514');
      expect(await code(c, ...row({ mime: 'image/svg+xml' }))).toBe('23514');
      expect(await code(c, ...row({ alt: '' }))).toBe('23514');
      expect(await code(c, ...row({ alt: 'x'.repeat(501) }))).toBe('23514');
      expect(await code(c, ...row({ kind: 'report_image' }))).toBe('23514');
      expect(await code(c, ...row({ rule: { zone: 'R' } }))).toBe('23514');
      // The array goes in as JSON text: node-postgres sends a JS array as a Postgres array literal ('{}'), which jsonb reads as an empty OBJECT.
      expect(await code(c, ...row({ kind: 'report_image', scenario_key: 's', position: 1, rule: '[]' }))).toBe('23514');
    });
  });

  it('(b) one ordered list per (scenario_key, rule): NULLS NOT DISTINCT refuses a second NULL-rule row; a plain unique would not', async () => {
    arms += 1;
    const idx = await pool.query<{ def: string }>("SELECT pg_get_indexdef(indexrelid) AS def FROM pg_index WHERE indexrelid = 'media_assets_report_order'::regclass");
    expect(idx.rows[0]?.def).toMatch(/UNIQUE INDEX media_assets_report_order .*\(scenario_key, rule, "?position"?\) NULLS NOT DISTINCT WHERE \(kind = 'report_image'::text\)/);
    await inTxn(pool, async (c) => {
      const r = { kind: 'report_image', scenario_key: 's', position: 3 };
      expect(await code(c, ...row(r))).toBeNull();
      expect(await code(c, ...row(r))).toBe('23505');
      expect(await code(c, ...row({ ...r, rule: { zone: 'R' } }))).toBeNull();
      await c.query('CREATE TEMP TABLE plain_control (s text, r jsonb, p int)');
      await c.query('CREATE UNIQUE INDEX ON plain_control (s, r, p)');
      expect(await code(c, "INSERT INTO plain_control VALUES ('s', NULL, 3), ('s', NULL, 3)")).toBeNull(); // RED control: duplicates pass
    });
  });

  it('(c) RLS on; the live policy set; admin reads, non-admin and anon read nothing, INSERT denied', async () => {
    arms += 1;
    const rls = await pool.query<{ on: boolean }>("SELECT relrowsecurity AS on FROM pg_class WHERE oid = 'public.media_assets'::regclass");
    expect(rls.rows[0]?.on).toBe(true);
    const pol = await pool.query<{ policyname: string }>("SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'media_assets' ORDER BY 1");
    expect(pol.rows.map((r) => r.policyname)).toEqual(['media_assets_select_admin']);
    await inTxn(pool, async (c) => {
      await c.query(...row());
      await c.query('GRANT SELECT, INSERT ON media_assets TO authenticated, anon');
      await c.query('GRANT SELECT ON profiles TO authenticated');
      const seen = async (uid: string | null): Promise<number> => { await asUser(c, uid); const n = (await c.query('SELECT count(*)::int AS n FROM media_assets')).rows[0].n as number; await c.query('RESET ROLE'); return n; };
      expect(await seen(ADMIN)).toBeGreaterThan(0);
      expect(await seen(USER)).toBe(0);
      expect(await seen(null)).toBe(0);
      for (const uid of [ADMIN, USER]) { await asUser(c, uid); expect(await code(c, ...row())).toBe('42501'); await c.query('RESET ROLE'); }
    });
  });

  it('(d) surface-media is private; its live policies are the three admin ones, each positive and negative', async () => {
    arms += 1;
    const present = (await pool.query<{ ok: boolean }>(
      "SELECT to_regclass('storage.objects') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'storage' AND table_name = 'buckets' AND column_name = 'public') AS ok")).rows[0]?.ok;
    if (!present) {
      expect(process.env.BUILDO_TEST_DB_NO_STORAGE, 'the Storage tables are absent on this DB: set BUILDO_TEST_DB_NO_STORAGE=1 to record the gap; the bucket was NOT checked').toBe('1');
      return;
    }
    const b = await pool.query<{ public: boolean }>("SELECT public FROM storage.buckets WHERE id = 'surface-media'");
    expect(b.rows).toEqual([{ public: false }]);
    const pol = await pool.query<{ policyname: string; cmd: string }>("SELECT policyname, cmd FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'surface_media_%' ORDER BY 1");
    expect(pol.rows).toEqual([{ policyname: 'surface_media_delete_admin', cmd: 'DELETE' }, { policyname: 'surface_media_insert_admin', cmd: 'INSERT' }, { policyname: 'surface_media_select_admin', cmd: 'SELECT' }]);
    // Security OUTPUT seat F8: no other storage.objects policy may reach every bucket (one that never names bucket_id would open surface-media).
    const broad = await pool.query<{ policyname: string }>("SELECT policyname FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND coalesce(qual, '') NOT LIKE '%bucket_id%' AND coalesce(with_check, '') NOT LIKE '%bucket_id%'");
    expect(broad.rows).toEqual([]);
    const limits = await pool.query<{ ok: boolean }>("SELECT NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'storage' AND table_name = 'buckets' AND column_name = 'file_size_limit') OR EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'surface-media' AND file_size_limit = 3000000) AS ok");
    expect(limits.rows[0]?.ok).toBe(true);
    await inTxn(pool, async (c) => {
      await c.query('GRANT SELECT, INSERT, DELETE ON storage.objects TO authenticated');
      await c.query('GRANT SELECT ON profiles TO authenticated');
      const put = async (uid: string, name: string): Promise<string | null> => { await asUser(c, uid); const r = await code(c, "INSERT INTO storage.objects (bucket_id, name) VALUES ('surface-media', $1)", [name]); await c.query('RESET ROLE'); return r; };
      expect(await put(ADMIN, 'ad_creative/a.png')).toBeNull();
      expect(await put(USER, 'ad_creative/b.png')).toBe('42501');
      const count = async (uid: string, sql: string): Promise<number> => { await asUser(c, uid); const r = await c.query(sql); await c.query('RESET ROLE'); return r.rowCount ?? 0; };
      expect(await count(USER, "SELECT 1 FROM storage.objects WHERE bucket_id = 'surface-media'")).toBe(0);
      expect(await count(ADMIN, "SELECT 1 FROM storage.objects WHERE bucket_id = 'surface-media'")).toBe(1);
      expect(await count(USER, "DELETE FROM storage.objects WHERE bucket_id = 'surface-media'")).toBe(0);
      expect(await count(ADMIN, "DELETE FROM storage.objects WHERE bucket_id = 'surface-media'")).toBe(1);
    });
  });

  it('(e) the five Admin Media logic_variables rows equal the seed', async () => {
    arms += 1;
    expect(MEDIA_KEYS).toHaveLength(5);
    const r = await pool.query<{ variable_key: string; variable_value: string }>('SELECT variable_key, variable_value::text FROM logic_variables WHERE variable_key = ANY($1) ORDER BY 1', [MEDIA_KEYS]);
    expect(r.rows.map((x) => [x.variable_key, Number(x.variable_value)])).toEqual(MEDIA_KEYS.map((k) => [k, SEED[k]?.default]));
  });
});
