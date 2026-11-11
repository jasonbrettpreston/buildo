// 🔗 SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §7 (usage_events), §6.3 row 2, §11b.7 rules 5-6
//             (dated notes 2026-11-11: the narrow form, D-1 a; 20 a month; D-2..D-6 a)
//             docs/specs/00-architecture/114_rls_policy_catalog.md §2 (dated note 2026-11-11), §10 (positive and negative per policy)
//             docs/specs/00-architecture/116_multi_product_architecture.md §5 OD5 amendment (the widened CHECK)
//
// MF-45 · T12 and the live half of T4/T5 (operator DB job; plan section 3.1 and section 12 folds 1, 2, 4, 14).
// Live-DB proof of migration 303:
//   (a) chk_entitlements_product admits the four keys and refuses an unknown one; the usage_events CHECKs both ways;
//   (b) RLS on, the live policy set is exactly {usage_events_select_own}; as `authenticated` the owner sees own rows, another
//       user sees none, INSERT is denied; `anon` sees none and cannot insert;
//   (c) T12: two concurrent new-lot opens at used = limit - 1 -> exactly one counted and one limit_reached (the
//       (user, parcel_tool) row lock serialises count-and-insert); a re-open is free and writes nothing;
//   (d) the two allowance rows equal the seed, and the Admin Control Panel loader (loadAllConfigs, the GET of
//       /api/admin/control-panel/configs) returns them, so the existing panel lists them.
// (a), (b), (d) write inside BEGIN ... ROLLBACK. (c) needs two committed sessions: it uses one throwaway user and deletes
// it in a finally (the auth.users cascade removes its entitlement and usage rows).
// Skipped unless the db harness is up (BUILDO_TEST_DB=1 or a disposable DATABASE_URL).
import fs from 'node:fs';
import path from 'node:path';
import type { Pool, PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';
import { openReport, readReportLimits, REPORT_LIMIT_KEYS } from '@/lib/entitlements';
import { loadAllConfigs } from '@/lib/admin/control-panel';

const OWNER = '00000000-0000-0000-0000-0000000045d1';
const OTHER = '00000000-0000-0000-0000-0000000045d2';
const RACER = '00000000-0000-0000-0000-0000000045d3';
const SEED = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'scripts/seeds/logic_variables.json'), 'utf8')) as Record<string, { default: number }>;
let arms = 0;

const inTxn = async (pool: Pool, fn: (c: PoolClient) => Promise<void>): Promise<void> => {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query('INSERT INTO auth.users (id) VALUES ($1), ($2) ON CONFLICT DO NOTHING', [OWNER, OTHER]);
    await fn(c);
  } finally {
    await c.query('ROLLBACK');
    c.release();
  }
};
const asUser = async (c: PoolClient, uid: string | null): Promise<void> => {
  await c.query(uid === null ? 'SET LOCAL ROLE anon' : 'SET LOCAL ROLE authenticated');
  await c.query("SELECT set_config('request.jwt.claims', $1, true)", [uid === null ? '' : JSON.stringify({ sub: uid, role: 'authenticated' })]);
  await c.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [uid ?? '']);
};
const code = async (c: PoolClient, sql: string, params: unknown[] = []): Promise<string | null> => {
  await c.query('SAVEPOINT s');
  try { await c.query(sql, params); await c.query('RELEASE SAVEPOINT s'); return null; } catch (e) { await c.query('ROLLBACK TO SAVEPOINT s'); return (e as { code?: string }).code ?? 'error'; }
};
const ue = (uid: string | null, over: Record<string, unknown> = {}): [string, unknown[]] => {
  const r: Record<string, unknown> = { user_id: uid, product: 'parcel_tool', event: 'property_view', subject_kind: 'parcel_ref', subject_key: 'P-1', ...over };
  const cols = Object.keys(r);
  return [`INSERT INTO usage_events (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})`, cols.map((k) => r[k])];
};

describe.skipIf(!dbAvailable())('migration 303: parcel_tool entitlement, usage_events, the report meter (live DB)', () => {
  let pool: Pool;
  beforeAll(() => { pool = getTestPool() as Pool; });
  afterAll(() => { expect(arms).toBe(4); });

  it('(a) the four entitlement keys; the usage_events CHECKs both ways', async () => {
    arms += 1;
    await inTxn(pool, async (c) => {
      for (const p of ['lead_gen', 'flight_center', 'parcel_tool', 'agent_reports']) {
        expect(await code(c, 'INSERT INTO entitlements (user_id, product, status) VALUES ($1, $2, $3)', [OWNER, p, 'active']), p).toBeNull();
      }
      expect(await code(c, 'INSERT INTO entitlements (user_id, product, status) VALUES ($1, $2, $3)', [OTHER, 'maxbld', 'active'])).toBe('23514');
      expect(await code(c, ...ue(OWNER))).toBeNull();
      expect(await code(c, ...ue(OWNER, { event: 'page_view' }))).toBe('23514');
      expect(await code(c, ...ue(OWNER, { subject_kind: 'parcel_id' }))).toBe('23514');
      expect(await code(c, ...ue(OWNER, { product: 'maxbld' }))).toBe('23514');
      expect(await code(c, ...ue(null))).toBe('23514'); // neither principal
      expect(await code(c, ...ue(OWNER, { session_id: 's1' }))).toBe('23514'); // both principals
      expect(await code(c, ...ue(null, { session_id: 's1', event: 'offer_impression', subject_kind: 'offer_id' }))).toBeNull();
    });
  });

  it('(b) RLS: exactly usage_events_select_own; owner sees own, another user none; authenticated and anon cannot insert', async () => {
    arms += 1;
    const rls = await pool.query<{ on: boolean }>("SELECT relrowsecurity AS on FROM pg_class WHERE oid = 'public.usage_events'::regclass");
    expect(rls.rows[0]?.on).toBe(true);
    const pol = await pool.query<{ policyname: string; cmd: string }>("SELECT policyname, cmd FROM pg_policies WHERE schemaname = 'public' AND tablename = 'usage_events' ORDER BY 1");
    expect(pol.rows.map((r) => `${r.policyname} ${r.cmd}`)).toEqual(['usage_events_select_own SELECT']);
    await inTxn(pool, async (c) => {
      await c.query(...ue(OWNER, { subject_key: 'OWN' }));
      await c.query(...ue(OTHER, { subject_key: 'THEIRS' }));
      await c.query('GRANT SELECT, INSERT ON usage_events TO authenticated, anon'); // transient; rolled back
      const keys = async (uid: string | null): Promise<string[]> => {
        await asUser(c, uid);
        const r = await c.query<{ subject_key: string }>("SELECT subject_key FROM usage_events WHERE subject_key IN ('OWN', 'THEIRS') ORDER BY 1");
        await c.query('RESET ROLE');
        return r.rows.map((x) => x.subject_key);
      };
      expect(await keys(OWNER)).toEqual(['OWN']); // positive
      expect(await keys(OTHER)).toEqual(['THEIRS']); // the OWN row is invisible to another user (negative)
      expect(await keys(null)).toEqual([]); // anon
      await asUser(c, OWNER);
      expect(await code(c, ...ue(OWNER, { subject_key: 'SELF' }))).toBe('42501'); // no insert policy, even for own uid
      await c.query('RESET ROLE');
      await asUser(c, null);
      expect(await code(c, ...ue(null, { session_id: 's', event: 'offer_impression', subject_kind: 'offer_id' }))).toBe('42501'); // no anon insert (MF-61)
      await c.query('RESET ROLE');
    });
  });

  it('(c) T12: two concurrent new lots at used = limit - 1 -> one counted, one limit_reached; a re-open is free', async () => {
    arms += 1;
    const limits = await readReportLimits(pool);
    const setup = await pool.connect();
    try {
      await setup.query('INSERT INTO auth.users (id) VALUES ($1) ON CONFLICT DO NOTHING', [RACER]);
      await setup.query(
        "INSERT INTO entitlements (user_id, product, status, current_period_end) VALUES ($1, 'parcel_tool', 'active', now() + interval '15 days')",
        [RACER],
      );
      for (let i = 0; i < limits.plan - 1; i += 1) await setup.query(...ue(RACER, { subject_key: `PRE-${i}`, occurred_at: new Date() }));
      const open = async (ref: string) => {
        const c = await pool.connect();
        try {
          await c.query('BEGIN');
          const r = await openReport(c, RACER, ref);
          await c.query('SELECT pg_sleep(0.2)'); // hold the lock long enough for the other session to queue on it
          await c.query('COMMIT');
          return r.kind;
        } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
      };
      const kinds = (await Promise.all([open('NEW-A'), open('NEW-B')])).sort();
      expect(kinds).toEqual(['counted', 'limit_reached']);
      const n = await setup.query<{ n: number }>("SELECT count(*)::int AS n FROM usage_events WHERE user_id = $1", [RACER]);
      expect(n.rows[0]?.n).toBe(limits.plan);
      expect(await open('PRE-0')).toBe('already_counted'); // D-3 a: a re-open is free
      const after = await setup.query<{ n: number }>("SELECT count(*)::int AS n FROM usage_events WHERE user_id = $1", [RACER]);
      expect(after.rows[0]?.n).toBe(limits.plan);
    } finally {
      await setup.query('DELETE FROM auth.users WHERE id = $1', [RACER]); // cascades entitlements and usage_events
      setup.release();
    }
  }, 30000);

  it('(d) the allowance rows equal the seed; the Admin Control Panel loader returns both', async () => {
    arms += 1;
    const keys = Object.values(REPORT_LIMIT_KEYS);
    const r = await pool.query<{ variable_key: string; variable_value: string }>(
      'SELECT variable_key, variable_value FROM logic_variables WHERE variable_key = ANY($1::text[]) ORDER BY 1', [keys]);
    expect(r.rows.map((x) => [x.variable_key, Number(x.variable_value)])).toEqual(keys.map((k) => [k, SEED[k]?.default]));
    const cfg = await loadAllConfigs(pool);
    for (const k of keys) expect(cfg.logicVariables.find((v) => v.key === k)?.value, k).toBe(SEED[k]?.default);
  });
});
