// 🔗 SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §11b.7 rules 5-6 (dated note 2026-11-14, MF-47)
//             docs/specs/00-architecture/116_multi_product_architecture.md §5 OD4 (dated note 2026-11-14)
//             docs/specs/02-web-admin/128_surface_standard_policy.md §2 rule 3 (every tunable is a registered setting)
//
// MF-47 (RULED 2026-11-14, DECISIONS.md "Ruled 2026-11-14 under the operator's acceptance") · reads migrations/322_mf47_checkout_plans.sql
// as text (no DB; the live proof is the orchestrator's rehearsal on the test stack):
//   (a) entitlements.plan_key NOT NULL DEFAULT 'basic' with a closed CHECK; entitlements.overage_cap NOT NULL DEFAULT 0 CHECK >= 0 (C-2);
//   (b) admin_managed parcel_tool rows -> 'pro', the count printed (RAISE NOTICE); the two re-set UPDATEs only where the value is still 20;
//   (c) every new numeric key mirrors the seed entry for entry, ON CONFLICT DO NOTHING; the four Stripe id keys (Basic, Pro, later overage, portal; RULED-1114 line 5) are empty JSONB strings,
//       migration-only (219 pattern), never in the seed; no Stripe id literal;
//   (d) the DOWN block is comment-only.
// Each RED plant is an in-memory copy of the text, never a file edit.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import seed from '../../scripts/seeds/logic_variables.json';

const FILE = 'migrations/322_mf47_checkout_plans.sql';
const sql = (): string => fs.readFileSync(path.join(process.cwd(), FILE), 'utf8');
const upOf = (s: string): string => (s.split(/^--\s*DOWN/m)[0] ?? '').split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');
const downOf = (s: string): string => (s.split(/^--\s*DOWN/m)[1] ?? '').split('\n').slice(1).join('\n');

const NUMERIC_KEYS = [
  'parcel_tool_report_limit_pro',
  'parcel_tool_trial_months',
  'stripe_tax_enabled',
  'parcel_tool_overage_enabled',
  'parcel_tool_overage_cap_default',
  'parcel_tool_meter_statement_timeout_ms',
] as const;
const STRING_KEYS = ['stripe_price_id_parcel_tool_basic', 'stripe_price_id_parcel_tool_pro', 'stripe_price_id_parcel_tool_overage', 'stripe_portal_configuration_id_parcel_tool'] as const;

type SeedEntry = { default: number; min: number; max: number; admin?: { group: string } };
const entry = (k: string): SeedEntry => (seed as unknown as Record<string, SeedEntry>)[k]!;

describe('(a) the two columns (C-2: NOT NULL DEFAULT, no null branch)', () => {
  it('plan_key is NOT NULL DEFAULT basic with a closed CHECK', () => {
    const up = upOf(sql());
    expect(up).toMatch(/ADD COLUMN plan_key\s+text\s+NOT NULL DEFAULT 'basic'/);
    expect(up).toMatch(/chk_entitlements_plan_key\s+CHECK \(plan_key IN \('basic',\s*'pro'\)\)/);
  });
  it('overage_cap is NOT NULL DEFAULT 0 with CHECK >= 0 (written at consent by the overage row, never inherited from a setting)', () => {
    const up = upOf(sql());
    expect(up).toMatch(/ADD COLUMN overage_cap\s+integer\s+NOT NULL DEFAULT 0/);
    expect(up).toMatch(/chk_entitlements_overage_cap\s+CHECK \(overage_cap >= 0\)/);
  });
  it('RED plant: a nullable plan_key is caught', () => {
    expect(upOf(sql().replace(/(ADD COLUMN plan_key\s+text\s+)NOT NULL DEFAULT 'basic'/, '$1'))).not.toMatch(/ADD COLUMN plan_key\s+text\s+NOT NULL DEFAULT 'basic'/);
  });
});

describe('(b) the data changes', () => {
  it('admin_managed parcel_tool rows become pro and the count is printed', () => {
    const up = upOf(sql());
    expect(up).toMatch(/UPDATE entitlements\s+SET plan_key = 'pro'\s+WHERE product = 'parcel_tool' AND status = 'admin_managed'/);
    expect(up).toMatch(/RAISE NOTICE/);
  });
  it('the trial and plan allowances are re-set to 10 only where the value is still the seeded 20, and the counts are printed', () => {
    const up = upOf(sql());
    expect(up).toMatch(/GET DIAGNOSTICS moved_trial = ROW_COUNT/);
    expect(up).toMatch(/GET DIAGNOSTICS moved_plan = ROW_COUNT/);
    for (const k of ['parcel_tool_report_limit_trial', 'parcel_tool_report_limit_plan']) {
      expect(up).toMatch(new RegExp(`UPDATE logic_variables\\s+SET variable_value = 10[^;]*variable_key = '${k}'[^;]*variable_value = 20`));
      expect(entry(k).default).toBe(10);
    }
  });
});

describe('(c) the settings mirror the seed; the Stripe ids are empty and migration-only', () => {
  it.each(NUMERIC_KEYS)('%s: in the migration with the seed default, ON CONFLICT DO NOTHING, in the MaxBLD Plan group, bounds declared', (k) => {
    const up = upOf(sql());
    const row = up.match(new RegExp(`\\('${k}',\\s*(-?\\d+)`));
    expect(row, `${k} missing from the migration`).not.toBeNull();
    expect(Number(row![1])).toBe(entry(k).default);
    expect(entry(k).admin?.group).toBe('MaxBLD Plan');
    expect(entry(k).min).toBeLessThanOrEqual(entry(k).default);
    expect(entry(k).max).toBeGreaterThanOrEqual(entry(k).default);
  });
  it('every INSERT is ON CONFLICT (variable_key) DO NOTHING (an operator edit survives a re-run)', () => {
    const up = upOf(sql());
    expect((up.match(/INSERT INTO logic_variables/g) ?? []).length).toBe(1);
    expect(up).toMatch(/ON CONFLICT \(variable_key\) DO NOTHING/);
  });
  it.each(STRING_KEYS)('%s: an empty JSONB string, not in the seed (migration 219 pattern)', (k) => {
    expect(upOf(sql())).toMatch(new RegExp(`\\('${k}',\\s*0,\\s*'""'::jsonb`));
    expect((seed as Record<string, unknown>)[k]).toBeUndefined();
  });
  it('no Stripe id literal and no price is typed in the migration', () => {
    expect(upOf(sql())).not.toMatch(/\b(price|prod|bpc|cus|sub)_[A-Za-z0-9]{6,}/);
  });
  it('RED plant: a typed price id is caught', () => {
    expect(upOf(sql().replace("'\"\"'::jsonb", "'\"price_abc123XYZ\"'::jsonb"))).toMatch(/\bprice_[A-Za-z0-9]{6,}/);
  });
});

describe('(d) the DOWN is comment-only', () => {
  it('no uncommented line after -- DOWN', () => {
    expect(downOf(sql()).split('\n').filter((l) => l.trim() !== '' && !/^\s*--/.test(l))).toEqual([]);
  });
});
