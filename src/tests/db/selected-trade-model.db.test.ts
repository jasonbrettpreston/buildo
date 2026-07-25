// 🔗 SPEC LINK: docs/specs/03-mobile/95_mobile_user_profiles.md §2.5.1 + §2.5.2
//             docs/specs/02-web-admin/21_admin_user_management.md §4
//
// P24-24D — the SELECTED-TRADE model on REAL seeded accounts (BUILDO_TEST_DB=1).
// Live-verifies (the realtor path was previously doc-sourced only) that the
// exact get-user-context read returns the correct trade set + primary for a
// supplier, a realtor, a tradesperson, and a multi-trade (big-box / manufacturer)
// account — AND that account_preset='supplier' round-trips through the mig-217
// CHECK. The set-building logic itself is unit-pinned in get-user-context.logic.
//
// Run: BUILDO_TEST_DB=1 npm run test:db -- selected-trade-model

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';
import { deriveAccountPreset } from '@/lib/classification/account-preset';

const pool = getTestPool();

// The user_profiles projection get-user-context.ts reads (post-entitlements
// swap, `.cursor/phase1_plan.md` P1-F3d: subscription_status left this
// projection — it now LEFT JOINs the lead_gen entitlements row, which these
// non-uuid seed accounts can never have; the trade-set assertions below are
// entitlement-independent).
const CTX_SQL = `SELECT trade_slug, trade_slugs_override, display_name FROM user_profiles WHERE user_id = $1`;

// Replicates the helper's NULL-safe set builder (kept tiny; the canonical impl
// is get-user-context.ts, unit-pinned separately).
function buildSet(trade_slug: string | null, override: string[] | null): { set: string[]; primary: string | null } {
  const set: string[] = [];
  if (trade_slug && trade_slug.trim()) set.push(trade_slug);
  for (const s of override ?? []) if (typeof s === 'string' && s.trim() && !set.includes(s)) set.push(s);
  return { set, primary: set[0] ?? null };
}

// user_profiles.user_id is uuid since mig 229 (varchar→uuid + FK auth.users). Each
// seed account gets a deterministic uuid sharing this file's hex prefix '5e1ec700-'
// (replaces the old '_p24m_*' string sentinels), keeping the fixture FK-valid and the
// prefix-scoped cleanup below hermetic. UID.* names map account → uuid for the tests.
const UID_NS = '5e1ec700-0000-4000-8000-';
const mkUid = (n: number): string => UID_NS + String(n).padStart(12, '0');
const UID = {
  supplier: mkUid(1),
  realtor: mkUid(2),
  trade: mkUid(3),
  bigbox: mkUid(4),
  mfr: mkUid(5),
};

const SEED = [
  { user_id: UID.supplier, trade_slug: 'glazing', override: null, preset: 'supplier' },
  { user_id: UID.realtor, trade_slug: 'realtor', override: null, preset: 'realtor' },
  { user_id: UID.trade, trade_slug: 'concrete', override: null, preset: 'tradesperson' },
  { user_id: UID.bigbox, trade_slug: 'glazing', override: ['framing', 'plumbing'], preset: 'supplier' },
  { user_id: UID.mfr, trade_slug: null, override: ['plumbing', 'electrical'], preset: 'manufacturer' },
];

describe.skipIf(!dbAvailable())('SELECTED-TRADE model on seeded accounts', () => {
  beforeAll(async () => {
    for (const s of SEED) {
      // auth.users identity row first — user_profiles.user_id FKs it (mig 229).
      await pool!.query(
        `INSERT INTO auth.users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
        [s.user_id],
      );
      await pool!.query(
        `INSERT INTO user_profiles (user_id, trade_slug, trade_slugs_override, account_preset, onboarding_complete)
         VALUES ($1, $2, $3, $4, true)
         ON CONFLICT (user_id) DO UPDATE SET trade_slug = EXCLUDED.trade_slug, trade_slugs_override = EXCLUDED.trade_slugs_override, account_preset = EXCLUDED.account_preset`,
        [s.user_id, s.trade_slug, s.override, s.preset],
      );
    }
  });

  afterAll(async () => {
    if (pool) {
      // uuid column → cast to text for the prefix LIKE (mig 229). auth.users delete
      // cascades user_profiles, but the explicit delete first is a harmless no-op.
      await pool.query(`DELETE FROM user_profiles WHERE user_id::text LIKE '5e1ec700-%'`);
      await pool.query(`DELETE FROM auth.users WHERE id::text LIKE '5e1ec700-%'`);
    }
  });

  it("account_preset='supplier' round-trips the migration-217 CHECK", async () => {
    const res = await pool!.query<{ account_preset: string }>(
      `SELECT account_preset FROM user_profiles WHERE user_id = $1`,
      [UID.supplier],
    );
    expect(res.rows[0]!.account_preset).toBe('supplier');
  });

  it('deriveAccountPreset matches the v2 mapping (supplier explicit-only, never derived)', () => {
    // The seeded supplier row (UID.supplier) carries preset='supplier' via the EXPLICIT
    // path (its INSERT — modelling admin provisioning), NOT via derivation:
    // a product trade like glazing derives 'tradesperson' (v2 overrule).
    expect(deriveAccountPreset('glazing')).toBe('tradesperson');
    expect(deriveAccountPreset('realtor')).toBe('realtor');
    expect(deriveAccountPreset('concrete')).toBe('tradesperson');
  });

  it('single-trade accounts resolve to a one-element set (supplier / realtor / tradesperson)', async () => {
    for (const uid of [UID.supplier, UID.realtor, UID.trade]) {
      const res = await pool!.query<{ trade_slug: string | null; trade_slugs_override: string[] | null }>(CTX_SQL, [uid]);
      const { set, primary } = buildSet(res.rows[0]!.trade_slug, res.rows[0]!.trade_slugs_override);
      expect(set).toHaveLength(1);
      expect(primary).toBe(res.rows[0]!.trade_slug);
    }
  });

  it('big-box supplier resolves to the full set, primary = trade_slug', async () => {
    const res = await pool!.query<{ trade_slug: string | null; trade_slugs_override: string[] | null }>(CTX_SQL, [UID.bigbox]);
    const { set, primary } = buildSet(res.rows[0]!.trade_slug, res.rows[0]!.trade_slugs_override);
    expect(primary).toBe('glazing');
    expect(set).toEqual(['glazing', 'framing', 'plumbing']);
  });

  it('legacy manufacturer (NULL trade + override) resolves to the override set, primary = first element (un-401)', async () => {
    const res = await pool!.query<{ trade_slug: string | null; trade_slugs_override: string[] | null }>(CTX_SQL, [UID.mfr]);
    const { set, primary } = buildSet(res.rows[0]!.trade_slug, res.rows[0]!.trade_slugs_override);
    expect(primary).toBe('plumbing');
    expect(set).toEqual(['plumbing', 'electrical']);
  });
});
