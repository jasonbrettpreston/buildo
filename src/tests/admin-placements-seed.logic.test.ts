// 🔗 SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §6.3 rows 4-6 (dated note 2026-11-10)
//             docs/specs/00-architecture/114_rls_policy_catalog.md §2 (dated notes 2026-11-09 and 2026-11-10)
//             docs/specs/02-web-admin/128_surface_standard_policy.md R-17, R-34 (i) (the disclosure CHECK)
//
// MF-40 · the file-side half of the placements drift lock (plan section 3.5 lock 3, narrowed to the DB seed side by
// panel fold 12; the contract-to-presentation join stays in the landed ad-targeting-keys lock, never edited here).
// Reads migrations/302_admin_ads_placements.sql as text (no DB):
//   (a) the seeded placement rows set-equal ad-contract.json `slots` and report-presentation.json `ad_placements[].key`,
//       and each seeded max_slots equals its ad_placements max_slots (the contract is the authority: a new slot is a
//       contract change plus a placement migration);
//   (b) every seeded row carries disclosure_required true and the column carries CHECK (disclosure_required);
//   (c) the RLS shape the 2026-11-10 notes rule: placements one public select policy; offers and advertisers one
//       admin-read policy each; no write policy on any of the three;
//   (d) the two Admin Placements logic_variables rows equal the seed (keys, defaults) and sit inside the descriptor bounds.
// Each RED plant is an in-memory copy of the text, never a file edit.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const MIGRATION = 'migrations/302_admin_ads_placements.sql';
const read = (p: string): string => fs.readFileSync(path.join(ROOT, p), 'utf8');
const json = <T>(p: string): T => JSON.parse(read(p)) as T;

type Placement = { key: string; max_slots: number };
const CONTRACT = json<{ slots: string[] }>('scripts/surfaces/_schema/ad-contract.json');
const PRESENTATION = json<{ ad_placements: { placements: Placement[] } }>('scripts/surfaces/_schema/report-presentation.json');
const SEED = json<Record<string, { default: number; min?: number; max?: number; admin?: { group?: string } }>>('scripts/seeds/logic_variables.json');
const DESCRIPTOR = json<{ config: { logic_variables: Array<{ name: string; min: number; max: number }> } }>(
  'scripts/surfaces/parcel_admin/F04/surfaces/admin_placements.descriptor.json');

/** The UP half only (the DOWN block is comment-only). */
const upOf = (sql: string): string => sql.split(/^--\s*DOWN/m)[0] ?? '';
/** (placement_key, surface_archetype, max_slots, disclosure_required) tuples of the placements seed INSERT. */
export function seededPlacements(sql: string): Array<{ key: string; archetype: string; max_slots: number; disclosure: boolean }> {
  const m = /INSERT INTO placements\s*\(placement_key, surface_archetype, max_slots, disclosure_required\)\s*VALUES([\s\S]*?);/i.exec(upOf(sql));
  if (!m) return [];
  return [...(m[1] ?? "").matchAll(/\('([a-z0-9_]+)',\s*'([A-Z_]+)',\s*(\d+),\s*(true|false)\)/g)]
    .map((r) => ({ key: r[1] ?? '', archetype: r[2] ?? '', max_slots: Number(r[3]), disclosure: r[4] === 'true' }));
}
/** Every CREATE POLICY of the UP half as `<table> <name> <cmd> <roles>`. */
export function policiesOf(sql: string): string[] {
  return [...upOf(sql).matchAll(/CREATE POLICY (\w+) ON (\w+)\s+FOR (\w+) TO ([\w, ]+?) (?:USING|WITH CHECK)/g)]
    .map((r) => `${r[2]} ${r[1]} ${r[3]} ${(r[4] ?? '').replace(/\s+/g, '')}`).sort();
}
export function seedProblems(sql: string): string[] {
  const out: string[] = [];
  const rows = seededPlacements(sql);
  const keys = rows.map((r) => r.key).sort();
  const slots = [...CONTRACT.slots].sort();
  const placed = PRESENTATION.ad_placements.placements.map((p) => p.key).sort();
  if (JSON.stringify(keys) !== JSON.stringify(slots)) {
    out.push(`seeded placements ${keys.join(',')} differ from ad-contract slots ${slots.join(',')}: the contract is the authority; a new slot needs a placement migration`);
  }
  if (JSON.stringify(slots) !== JSON.stringify(placed)) out.push(`ad-contract slots differ from ad_placements keys ${placed.join(',')}`);
  for (const r of rows) {
    const p = PRESENTATION.ad_placements.placements.find((x) => x.key === r.key);
    if (p && p.max_slots !== r.max_slots) out.push(`${r.key}: seeded max_slots ${r.max_slots} differs from ad_placements max_slots ${p.max_slots} (one home: ad_placements)`);
    if (r.archetype !== 'REPORT') out.push(`${r.key}: surface_archetype ${r.archetype}, expected REPORT`);
    if (!r.disclosure) out.push(`${r.key}: disclosure_required false (R-17, R-34 (i))`);
  }
  if (!/disclosure_required\s+boolean\s+NOT NULL\s+CHECK\s*\(disclosure_required\)/i.test(upOf(sql))) out.push('placements.disclosure_required lacks CHECK (disclosure_required)');
  return out;
}

const SQL = fs.existsSync(path.join(ROOT, MIGRATION)) ? read(MIGRATION) : '';
const ADMIN_READ = 'USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND is_admin = true))';

describe('MF-40 migration 302: placements seed, disclosure CHECK, RLS shape (file side)', () => {
  it('the migration file exists with UP and DOWN blocks', () => {
    expect(SQL, `${MIGRATION} is missing`).not.toBe('');
    expect(SQL).toMatch(/^--\s*UP/m);
    expect(SQL).toMatch(/^--\s*DOWN/m);
  });

  it('(a)(b) the seeded placements equal the contract slots and ad_placements, with disclosure true and the CHECK', () => {
    expect(seededPlacements(SQL).map((r) => r.key).sort()).toEqual([...CONTRACT.slots].sort());
    expect(seedProblems(SQL)).toEqual([]);
  });

  it('(a)(b) RED plants: a dropped slot, an extra slot, a max_slots drift, a false disclosure, a dropped CHECK', () => {
    expect(seedProblems(SQL.replace(/,\s*\('scenario_card',[^)]*\)/, ''))).toEqual(expect.arrayContaining([expect.stringMatching(/differ from ad-contract slots/)]));
    expect(seedProblems(SQL.replace("('scenario_card',", "('banner_top', 'REPORT', 1, true),\n  ('scenario_card',"))).toEqual(
      expect.arrayContaining([expect.stringMatching(/a new slot needs a placement migration/)]));
    expect(seedProblems(SQL.replace(/\('detail_footer', 'REPORT', 1,/, "('detail_footer', 'REPORT', 2,"))).toEqual(
      expect.arrayContaining([expect.stringMatching(/detail_footer: seeded max_slots 2 differs/)]));
    expect(seedProblems(SQL.replace(/\('renovation_section', 'REPORT', 1, true\)/, "('renovation_section', 'REPORT', 1, false)"))).toEqual(
      expect.arrayContaining([expect.stringMatching(/renovation_section: disclosure_required false/)]));
    expect(seedProblems(SQL.replace(/NOT NULL\s+CHECK\s*\(disclosure_required\)/i, 'NOT NULL'))).toEqual(
      expect.arrayContaining([expect.stringMatching(/lacks CHECK/)]));
  });

  it('(c) RLS: placements one public select; offers and advertisers one admin-read select; no write policy', () => {
    for (const t of ['advertisers', 'placements', 'offers']) expect(upOf(SQL)).toMatch(new RegExp(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`));
    expect(policiesOf(SQL)).toEqual([
      'advertisers advertisers_select_admin SELECT authenticated',
      'offers offers_select_admin SELECT authenticated',
      'placements placements_select_public SELECT anon,authenticated',
    ]);
    expect(upOf(SQL).split(ADMIN_READ).length - 1).toBe(2);
    expect(upOf(SQL)).toMatch(/CREATE POLICY placements_select_public ON placements\s+FOR SELECT TO anon, authenticated USING \(true\)/);
    // RED plant: a write policy is a second, unasserted path.
    expect(policiesOf(`${SQL.replace(/^--\s*DOWN[\s\S]*$/m, '')}\nCREATE POLICY offers_insert_admin ON offers FOR INSERT TO authenticated WITH CHECK (true);\n-- DOWN`)).toContain(
      'offers offers_insert_admin INSERT authenticated');
  });

  it('(d) the Admin Placements logic_variables: seed keys, migration rows and descriptor bounds agree', () => {
    const keys = Object.keys(SEED).filter((k) => SEED[k]?.admin?.group === 'Admin Placements').sort();
    expect(keys).toEqual(['admin_placement_default_flight_days', 'admin_placement_max_horizon_days']);
    for (const k of keys) {
      const lv = DESCRIPTOR.config.logic_variables.find((v) => v.name === k);
      expect(lv, `${k} is not declared in admin_placements config.logic_variables`).toBeDefined();
      const d = SEED[k]?.default ?? NaN;
      expect(d).toBeGreaterThanOrEqual(lv?.min ?? Infinity);
      expect(d).toBeLessThanOrEqual(lv?.max ?? -Infinity);
      expect(SEED[k]?.min).toBe(lv?.min);
      expect(SEED[k]?.max).toBe(lv?.max);
      expect(upOf(SQL)).toMatch(new RegExp(`\\('${k}', ${d}, NULL,`));
    }
  });
});
