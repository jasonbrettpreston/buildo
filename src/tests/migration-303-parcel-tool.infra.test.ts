// 🔗 SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §7 (usage_events shape), §6.3 row 2 and §11b.3
//             (dated notes 2026-11-11: the narrow form, D-1 a), §11b.7 rules 5-6 (dated note 2026-11-11)
//             docs/specs/00-architecture/114_rls_policy_catalog.md §2 (dated note 2026-11-11: usage_events Class A, select own), §10
//             docs/specs/00-architecture/116_multi_product_architecture.md §5 OD5 amendment (both keys in one statement)
//
// MF-45 · T4 and the admin listing (plan section 3.1, folds 13-14, 17; operator 2026-11-11 "we should be able to change the
// number of reports per month in the amdin"). Reads migrations/303_parcel_tool_entitlement_usage.sql as text (no DB):
//   (a) chk_entitlements_product is widened to the four keys in ONE statement; nothing is backfilled;
//   (b) usage_events carries the section 7 shape, the principal CHECK and the closed product / event / subject_kind CHECKs;
//   (c) RLS on, exactly one policy, usage_events_select_own FOR SELECT on auth.uid() = user_id; no insert / update / delete
//       policy and no anon policy (the offer-impression insert of section 7.1 is MF-61's row, the one row that relaxes this);
//   (d) the two allowance rows equal the seed (keys, defaults), ON CONFLICT DO NOTHING, and the seed declares them in the
//       "MaxBLD Plan" admin group with bounds 1..1000, so the existing Admin Control Panel lists them (generated groups);
//   (e) the DOWN is comment-only and states the runbook.
// The live proof (apply, the policies as `authenticated`, the configs read, the concurrent meter) is
// src/tests/db/parcel-tool-meter.db.test.ts and supabase/tests/rls_class_a.test.sql, run by the operator's DB job.
// Each RED plant is an in-memory copy of the text, never a file edit.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { REPORT_LIMIT_KEYS, PRODUCTS, USAGE_EVENTS, USAGE_SUBJECT_KINDS } from '@/lib/entitlements';
import { LOGIC_VAR_DEFAULTS } from '@/lib/admin/control-panel';

const ROOT = process.cwd();
const MIGRATION = 'migrations/303_parcel_tool_entitlement_usage.sql';
const read = (p: string): string => fs.readFileSync(path.join(ROOT, p), 'utf8');
const sql = (): string => read(MIGRATION);
/** The UP half only, comment lines removed (the DOWN block is comment-only). */
const upOf = (s: string): string => (s.split(/^--\s*DOWN/m)[0] ?? '').split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');
const list = (vals: readonly string[]): string => vals.map((v) => `'${v}'`).join(',\\s*');

/** `<name> <cmd> <roles|PUBLIC> <using>` for every CREATE POLICY ON usage_events in the UP half. */
export function usagePolicies(s: string): string[] {
  return [...upOf(s).matchAll(/CREATE POLICY (\w+) ON usage_events\s+FOR (\w+)(?:\s+TO ([\w, ]+?))?\s+(?:USING|WITH CHECK)\s*\(([^;]*)\);/g)]
    .map((r) => `${r[1]} ${r[2]} ${(r[3] ?? 'PUBLIC').replace(/\s+/g, '')} ${(r[4] ?? '').replace(/\s+/g, ' ').trim()}`);
}

describe('(a) the entitlement CHECK widens to four keys in one statement (116 OD5 amendment; 126 §6.3 row 3)', () => {
  it('one ALTER drops and re-adds chk_entitlements_product with the PRODUCTS keys, in order', () => {
    const up = upOf(sql());
    expect(up).toMatch(new RegExp(`ALTER TABLE entitlements\\s+DROP CONSTRAINT chk_entitlements_product,\\s+ADD CONSTRAINT chk_entitlements_product\\s+CHECK \\(product IN \\(${list(PRODUCTS)}\\)\\);`));
    expect([...PRODUCTS]).toEqual(['lead_gen', 'flight_center', 'parcel_tool', 'agent_reports']);
  });
  it('no backfill: the UP half writes no entitlements row', () => {
    expect(upOf(sql())).not.toMatch(/(INSERT INTO|UPDATE)\s+entitlements\b/i);
  });
});

describe('(b) usage_events: the section 7 shape and its closed CHECKs (R-04)', () => {
  it('the columns, PK, FK cascade, defaults and the principal CHECK', () => {
    const up = upOf(sql());
    for (const col of [
      /event_id\s+UUID\s+PRIMARY KEY DEFAULT gen_random_uuid\(\)/,
      /user_id\s+UUID\s+NULL REFERENCES auth\.users\(id\) ON DELETE CASCADE/,
      /session_id\s+TEXT\s+NULL/,
      /product\s+TEXT\s+NOT NULL/,
      /event\s+TEXT\s+NOT NULL/,
      /subject_kind\s+TEXT\s+NOT NULL/,
      /subject_key\s+TEXT\s+NOT NULL/,
      /occurred_at\s+TIMESTAMPTZ\s+NOT NULL DEFAULT NOW\(\)/,
      /meta\s+JSONB\s+NOT NULL DEFAULT '\{\}'::jsonb/,
      /CONSTRAINT chk_usage_events_principal\s+CHECK \(\(user_id IS NULL\) <> \(session_id IS NULL\)\)/,
    ]) expect(up).toMatch(col);
  });
  it('product, event and subject_kind are closed CHECKs equal to the TS constants', () => {
    const up = upOf(sql());
    expect(up).toMatch(new RegExp(`chk_usage_events_product\\s+CHECK \\(product IN \\(${list(PRODUCTS)}\\)\\)`));
    expect(up).toMatch(new RegExp(`chk_usage_events_event\\s+CHECK \\(event IN \\(${list(USAGE_EVENTS)}\\)\\)`));
    expect(up).toMatch(new RegExp(`chk_usage_events_subject_kind\\s+CHECK \\(subject_kind IN \\(${list(USAGE_SUBJECT_KINDS)}\\)\\)`));
  });
  it('the quota index covers the meter read (user, product, event, subject_kind, occurred_at)', () => {
    expect(upOf(sql())).toMatch(/CREATE INDEX idx_usage_events_quota\s+ON usage_events \(user_id, product, event, subject_kind, occurred_at\);/);
  });
});

describe('(c) RLS: exactly one select-own policy, no write policy, no anon (Spec 114 §2 note 2026-11-11)', () => {
  it('RLS is enabled and the only policy is usage_events_select_own', () => {
    const up = upOf(sql());
    expect(up).toMatch(/ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;/);
    expect(usagePolicies(sql())).toEqual(['usage_events_select_own SELECT PUBLIC auth.uid() = user_id']);
  });
  it('RED plant: an anon insert policy (MF-61 offer impressions) is caught here until that row relaxes this lock', () => {
    const planted = sql().replace(/(-- DOWN)/, "CREATE POLICY usage_events_insert_anon ON usage_events FOR INSERT TO anon WITH CHECK (event = 'offer_impression');\n$1");
    expect(usagePolicies(planted)).not.toEqual(usagePolicies(sql()));
    expect(usagePolicies(planted)).toContain("usage_events_insert_anon INSERT anon event = 'offer_impression'");
  });
  it('no GRANT to anon or authenticated in the UP half', () => {
    expect(upOf(sql())).not.toMatch(/GRANT\b[^;]*\b(anon|authenticated)\b/i);
  });
});

type SeedEntry = { default: number; type: string; min?: number; max?: number; admin?: { group?: string } };
const SEED = JSON.parse(read('scripts/seeds/logic_variables.json')) as Record<string, SeedEntry>;
const GROUPS = JSON.parse(read('src/features/admin-controls/generated/logic-variable-groups.json')) as Array<{ label: string; keys: string[] }>;

describe('(d) the two allowances: seed truth, migration rows, and the existing Admin Control Panel listing', () => {
  const keys = Object.values(REPORT_LIMIT_KEYS);
  it('the migration inserts both keys with the seed default, ON CONFLICT (variable_key) DO NOTHING', () => {
    const up = upOf(sql());
    const m = /INSERT INTO logic_variables \(variable_key, variable_value, variable_value_json, description\) VALUES([\s\S]*?)ON CONFLICT \(variable_key\) DO NOTHING;/.exec(up);
    expect(m).not.toBeNull();
    const rows = [...(m![1] ?? '').matchAll(/\('([a-z_]+)',\s*(\d+),\s*NULL,/g)].map((r) => [r[1], Number(r[2])]);
    expect(rows).toEqual(keys.map((k) => [k, SEED[k]?.default]));
  });
  it('the seed declares each key numeric, 20, bounds 1..1000, admin group "MaxBLD Plan"', () => {
    for (const k of keys) expect(SEED[k], k).toMatchObject({ default: 20, type: 'number', min: 1, max: 1000, admin: { group: 'MaxBLD Plan' } });
  });
  it('the Admin Control Panel lists both keys under "MaxBLD Plan" (the generated groups GlobalConfigCard renders) with their defaults', () => {
    expect(GROUPS.find((g) => g.label === 'MaxBLD Plan')?.keys).toEqual(keys);
    for (const k of keys) expect(LOGIC_VAR_DEFAULTS[k]).toBe(20);
  });
});

describe('the pgTAP Class A file stays parseable (OUTPUT panel H1: a JS replace once collapsed $$ to $)', () => {
  /** Lines opening a dollar quote with a single $ (e.g. `results_eq($select`), which Postgres cannot parse. */
  const singleDollar = (s: string): string[] => s.split('\n').filter((l) => /\(\$[a-z]/i.test(l));
  it('every pgTAP assertion in rls_class_a.test.sql opens its query with $$, and plan() equals the assertion count', () => {
    const t = read('supabase/tests/rls_class_a.test.sql');
    expect(singleDollar(t)).toEqual([]);
    const planned = Number(/select plan\((\d+)\);/.exec(t)?.[1]);
    const asserted = t.split('\n').filter((l) => /^select (results_eq|is_empty|throws_ok|ok|is|isnt|lives_ok)\(/.test(l)).length;
    expect(asserted).toBe(planned);
    expect(t).toMatch(/usage_events_select_own positive/);
    expect(t).toMatch(/usage_events_select_own negative/);
  });
  it('RED plant: a collapsed $select line is caught', () => {
    expect(singleDollar("select is_empty($select 1 from usage_events$,")).toHaveLength(1);
  });
});

describe('(e) the DOWN is comment-only and states the runbook (fold 17)', () => {
  it('every DOWN line is a comment, and it names the parcel_tool rows that block the restore', () => {
    const down = (sql().split(/^--\s*DOWN/m)[1] ?? '').split('\n').slice(1).join('\n');
    expect(down.length).toBeGreaterThan(0);
    for (const l of down.split('\n')) if (l.trim()) expect(l.trim().startsWith('--'), l).toBe(true);
    expect(down).toMatch(/parcel_tool/);
    expect(down).toMatch(/DROP TABLE IF EXISTS usage_events/);
  });
});
