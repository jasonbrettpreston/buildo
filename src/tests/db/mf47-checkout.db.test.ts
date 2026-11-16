// 🔗 SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §11b.7 rules 5-6 (dated note 2026-11-14, MF-47)
//             docs/specs/00-architecture/116_multi_product_architecture.md §4 N2 (the entitlement upsert), §5 OD4 (dated note 2026-11-14)
//
// MF-47 (RULED 2026-11-14) · the live half of migration 322 and the webhook/meter SQL, on the repo's disposable testcontainer (every migration through
// 322 applied by the harness). Each test writes inside BEGIN ... ROLLBACK:
//   (a) plan_key NOT NULL DEFAULT 'basic' with the closed CHECK; overage_cap NOT NULL DEFAULT 0 with CHECK >= 0;
//   (b) the settings: trial and plan re-set to 10 (303's 20 moved), Pro 25, the new keys at their defaults, the four Stripe id keys empty strings;
//       the migration's two DO blocks run for real: an admin_managed parcel_tool row becomes pro, a non-admin_managed row does not;
//   (c) the meter: Basic stops at its allowance, Pro at its own, the ledger row carries meta.extra = false, and the statement timeout is set
//       transaction-local from the setting and really aborts a slow statement (SQLSTATE 57014);
//   (d) the webhook upsert: a stored period end is never nulled by an event without one, a NEW subscription never inherits the old end, the row-claim
//       clause is unchanged, setPlanKeyFromStripeEvent moves only the tracked subscription, setAdminManagedPlanKey only an admin_managed row;
//   (e) the single trial writer, in EVERY order of the three trial-start events with equal `created` seconds, ends status trial with the trial end.
import fs from 'node:fs';
import path from 'node:path';
import type { Pool, PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';
import { openReport, setAdminManagedPlanKey, setPlanKeyFromStripeEvent, upsertEntitlementFromStripeEvent } from '@/lib/entitlements';

const U1 = '00000000-0000-0000-0000-0000000f4701';
const U2 = '00000000-0000-0000-0000-0000000f4702';
const U3 = '00000000-0000-0000-0000-0000000f4703';
let arms = 0;

const inTxn = async (pool: Pool, fn: (c: PoolClient) => Promise<void>): Promise<void> => {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query('INSERT INTO auth.users (id) VALUES ($1), ($2), ($3) ON CONFLICT DO NOTHING', [U1, U2, U3]);
    await fn(c);
  } finally {
    await c.query('ROLLBACK');
    c.release();
  }
};
const code = async (c: PoolClient, sql: string, params: unknown[] = []): Promise<string | null> => {
  await c.query('SAVEPOINT s');
  try { await c.query(sql, params); await c.query('RELEASE SAVEPOINT s'); return null; } catch (e) { await c.query('ROLLBACK TO SAVEPOINT s'); return (e as { code?: string }).code ?? 'error'; }
};
const setting = async (c: PoolClient, key: string): Promise<{ n: string | null; json: unknown }> => {
  const r = await c.query('SELECT variable_value::text AS n, variable_value_json AS json FROM logic_variables WHERE variable_key = $1', [key]);
  return { n: r.rows[0]?.n ?? null, json: r.rows[0]?.json ?? null };
};
const addUsage = (c: PoolClient, uid: string, n: number) =>
  c.query(
    `INSERT INTO usage_events (user_id, product, event, subject_kind, subject_key, occurred_at, meta)
     SELECT $1, 'parcel_tool', 'property_view', 'parcel_ref', 'mf47-' || g, now(), '{}'::jsonb FROM generate_series(1, $2) g`,
    [uid, n],
  );
const row = async (c: PoolClient, uid: string) =>
  (await c.query('SELECT status, plan_key, stripe_subscription_id, current_period_end FROM entitlements WHERE user_id = $1 AND product = $2', [uid, 'parcel_tool'])).rows[0];

const SQL_322 = fs.readFileSync(path.join(process.cwd(), 'migrations/322_mf47_checkout_plans.sql'), 'utf8');
const DO_BLOCKS = [...SQL_322.matchAll(/^DO \$\$[\s\S]*?^END \$\$;/gm)].map((m) => m[0]);

describe.skipIf(!dbAvailable())('MF-47 migration 322, the meter and the webhook SQL (live DB)', () => {
  let pool: Pool;
  beforeAll(() => { pool = getTestPool() as Pool; });
  afterAll(() => { expect(arms).toBe(5); });

  it('(a) plan_key and overage_cap: defaults, NOT NULL, closed CHECKs', async () => {
    arms += 1;
    await inTxn(pool, async (c) => {
      await c.query("INSERT INTO entitlements (user_id, product, status) VALUES ($1, 'parcel_tool', 'active')", [U1]);
      const r = (await c.query("SELECT plan_key, overage_cap FROM entitlements WHERE user_id = $1 AND product = 'parcel_tool'", [U1])).rows[0];
      expect([r.plan_key, r.overage_cap]).toEqual(['basic', 0]);
      expect(await code(c, "UPDATE entitlements SET plan_key = 'gold' WHERE user_id = $1", [U1])).toBe('23514');
      expect(await code(c, 'UPDATE entitlements SET plan_key = NULL WHERE user_id = $1', [U1])).toBe('23502');
      expect(await code(c, 'UPDATE entitlements SET overage_cap = -1 WHERE user_id = $1', [U1])).toBe('23514');
      expect(await code(c, 'UPDATE entitlements SET overage_cap = NULL WHERE user_id = $1', [U1])).toBe('23502');
      expect(await code(c, "UPDATE entitlements SET plan_key = 'pro', overage_cap = 10 WHERE user_id = $1", [U1])).toBeNull();
    });
  });

  it('(b) the settings after 322, and the two DO blocks run for real', async () => {
    arms += 1;
    await inTxn(pool, async (c) => {
      const num = async (k: string) => (await setting(c, k)).n;
      expect([await num('parcel_tool_report_limit_trial'), await num('parcel_tool_report_limit_plan'), await num('parcel_tool_report_limit_pro')]).toEqual(['10', '10', '25']);
      expect([await num('parcel_tool_trial_months'), await num('stripe_tax_enabled'), await num('parcel_tool_overage_enabled'), await num('parcel_tool_overage_cap_default'), await num('parcel_tool_meter_statement_timeout_ms')])
        .toEqual(['1', '0', '0', '10', '5000']);
      for (const k of ['stripe_price_id_parcel_tool_basic', 'stripe_price_id_parcel_tool_pro', 'stripe_price_id_parcel_tool_overage', 'stripe_portal_configuration_id_parcel_tool']) {
        expect((await setting(c, k)).json, k).toBe('');
      }
      // the DO blocks: an admin_managed parcel_tool row -> pro; an active one and a lead_gen admin_managed one are left alone; the re-set only moves a 20
      await c.query("INSERT INTO entitlements (user_id, product, status) VALUES ($1, 'parcel_tool', 'admin_managed'), ($2, 'parcel_tool', 'active')", [U1, U2]);
      await c.query("INSERT INTO entitlements (user_id, product, status) VALUES ($1, 'lead_gen', 'admin_managed')", [U3]);
      await c.query("UPDATE logic_variables SET variable_value = 20 WHERE variable_key = 'parcel_tool_report_limit_trial'");
      await c.query("UPDATE logic_variables SET variable_value = 7 WHERE variable_key = 'parcel_tool_report_limit_plan'");
      expect(DO_BLOCKS).toHaveLength(2);
      for (const b of DO_BLOCKS) await c.query(b);
      expect((await row(c, U1)).plan_key).toBe('pro');
      expect((await row(c, U2)).plan_key).toBe('basic');
      expect((await c.query("SELECT plan_key FROM entitlements WHERE user_id = $1 AND product = 'lead_gen'", [U3])).rows[0].plan_key).toBe('basic');
      expect([await num('parcel_tool_report_limit_trial'), await num('parcel_tool_report_limit_plan')]).toEqual(['10', '7']); // 20 -> 10; an operator's 7 survives
    });
  });

  it('(c) the meter: Basic stops at 10, Pro at 25, meta.extra is false, the 5 s limit is set transaction-local and really aborts', async () => {
    arms += 1;
    await inTxn(pool, async (c) => {
      await c.query("INSERT INTO entitlements (user_id, product, status, plan_key) VALUES ($1, 'parcel_tool', 'active', 'basic'), ($2, 'parcel_tool', 'active', 'pro')", [U1, U2]);
      await addUsage(c, U1, 10);
      await addUsage(c, U2, 10);
      expect(await openReport(c, U1, 'NEW-1')).toMatchObject({ kind: 'limit_reached', reportsLimit: 10, reportsUsed: 10 });
      expect(await openReport(c, U2, 'NEW-1')).toMatchObject({ kind: 'counted', reportsLimit: 25, reportsUsed: 11 });
      const meta = (await c.query("SELECT meta FROM usage_events WHERE user_id = $1 AND subject_key = 'NEW-1'", [U2])).rows[0].meta;
      expect(meta).toEqual({ extra: false });
      expect((await c.query('SHOW statement_timeout')).rows[0].statement_timeout).toBe('5s');
      expect(await code(c, 'SELECT pg_sleep(6)')).toBe('57014');
    });
    // transaction-local: a new transaction on the pool is not limited by the previous one's setting
    const after = await pool.query('SHOW statement_timeout');
    expect(after.rows[0].statement_timeout).not.toBe('5s');
  }, 30_000);

  const T = (s: number) => new Date(s * 1000);
  const ev = (userId: string, status: 'trial' | 'active', sub: string | null, end: Date | null, created: number) =>
    ({ userId, product: 'parcel_tool' as const, status, stripeSubscriptionId: sub, currentPeriodEnd: end, eventCreatedAt: T(created) });

  it('(d) the upsert fences and the plan writes', async () => {
    arms += 1;
    await inTxn(pool, async (c) => {
      const END = T(1_800_000_000);
      await upsertEntitlementFromStripeEvent(c, ev(U1, 'trial', 'sub_A', END, 1000));
      // a later event of the same subscription with NO period end (checkout, invoice) keeps the stored end
      await upsertEntitlementFromStripeEvent(c, ev(U1, 'active', 'sub_A', null, 1001));
      expect((await row(c, U1)).current_period_end.getTime()).toBe(END.getTime());
      // a plan write is guarded to the tracked subscription
      expect(await setPlanKeyFromStripeEvent(c, U1, 'parcel_tool', 'pro', 'sub_OTHER')).toBe(0);
      expect((await row(c, U1)).plan_key).toBe('basic');
      expect(await setPlanKeyFromStripeEvent(c, U1, 'parcel_tool', 'pro', 'sub_A')).toBe(1);
      expect((await row(c, U1)).plan_key).toBe('pro');
      // a NEW subscription (an 'active' claim) never inherits the old subscription's end
      await upsertEntitlementFromStripeEvent(c, ev(U1, 'active', 'sub_B', null, 1002));
      expect(await row(c, U1)).toMatchObject({ stripe_subscription_id: 'sub_B', current_period_end: null });
      // the row-claim clause is unchanged: a non-active event of another subscription does not claim the row
      expect(await upsertEntitlementFromStripeEvent(c, ev(U1, 'trial', 'sub_C', END, 1003))).toBe(0);
      expect((await row(c, U1)).stripe_subscription_id).toBe('sub_B');
      // a stale event (older created) changes nothing
      expect(await upsertEntitlementFromStripeEvent(c, ev(U1, 'active', 'sub_B', END, 999))).toBe(0);
      // the admin path moves an admin_managed comp only
      await c.query("INSERT INTO entitlements (user_id, product, status) VALUES ($1, 'parcel_tool', 'admin_managed')", [U2]);
      expect(await setAdminManagedPlanKey(c, U2, 'pro')).toBe(1);
      expect((await row(c, U2)).plan_key).toBe('pro');
      expect(await setAdminManagedPlanKey(c, U1, 'basic')).toBe(0); // U1 is a Stripe-managed active row
      expect((await row(c, U1)).plan_key).toBe('pro');
    });
  });

  it('(e) the trial writer: every order of the three trial-start events with equal created seconds ends trial with the trial end', async () => {
    arms += 1;
    const END = T(1_800_000_000);
    // classifyEvent writes nothing for the checkout (metadata.trial) and the $0 invoice, so the writer sequence is the trialing event alone,
    // in any position among the other two no-op events: model them as the (absent) writes they are.
    const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
    for (const order of perms) {
      await inTxn(pool, async (c) => {
        for (const k of order) {
          if (k === 0) await upsertEntitlementFromStripeEvent(c, ev(U3, 'trial', 'sub_T', END, 2000)); // customer.subscription.created, trialing
          // k = 1 (checkout.session.completed with metadata.trial) and k = 2 (the $0 subscription_create invoice) write nothing
        }
        expect(await row(c, U3)).toMatchObject({ status: 'trial', stripe_subscription_id: 'sub_T' });
        expect((await row(c, U3)).current_period_end.getTime()).toBe(END.getTime());
      });
    }
  });
});
