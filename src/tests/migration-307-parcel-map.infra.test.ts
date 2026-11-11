// 🔗 SPEC LINK: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §3.2 (dated note 2026-11-11, MF-53)
//             docs/specs/02-web-admin/128_surface_standard_policy.md rule 3 (every page size is a registered logic variable)
//
// MF-53 · the two neighbour tunables of the "choose your lot" map (DECISIONS-v3 item 2, operator 2026-11-11 "b": admin-editable).
// Reads migrations/307_parcel_map_logic_variables.sql as text (no DB; the operator's DB job applies it):
//   the two rows equal the seed (keys, defaults), ON CONFLICT DO NOTHING; the seed declares them numeric with the PLAN panel bounds
//   (radius 5..100 m, limit 1..50) in the "Parcel Lookup" admin group, so the existing Admin Control Panel lists them; the DOWN is comment-only.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { LOT_MAP_LIMIT_KEYS } from '@/lib/parcels/lot-map';
import { LOGIC_VAR_DEFAULTS } from '@/lib/admin/control-panel';

const ROOT = process.cwd();
const read = (p: string): string => fs.readFileSync(path.join(ROOT, p), 'utf8');
const sql = (): string => read('migrations/307_parcel_map_logic_variables.sql');
const upOf = (s: string): string => (s.split(/^--\s*DOWN/m)[0] ?? '').split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');
type SeedEntry = { default: number; type: string; min?: number; max?: number; admin?: { group?: string } };
const SEED = JSON.parse(read('scripts/seeds/logic_variables.json')) as Record<string, SeedEntry>;
const GROUPS = JSON.parse(read('src/features/admin-controls/generated/logic-variable-groups.json')) as Array<{ label: string; keys: string[] }>;
const keys = Object.values(LOT_MAP_LIMIT_KEYS);

describe('migration 307: seed truth, migration rows, the Admin Control Panel listing', () => {
  it('inserts both keys with the seed default, ON CONFLICT (variable_key) DO NOTHING', () => {
    const m = /INSERT INTO logic_variables \(variable_key, variable_value, variable_value_json, description\) VALUES([\s\S]*?)ON CONFLICT \(variable_key\) DO NOTHING;/.exec(upOf(sql()));
    expect(m).not.toBeNull();
    const rows = [...(m![1] ?? '').matchAll(/\('([a-z_]+)',\s*(\d+),\s*NULL,/g)].map((r) => [r[1], Number(r[2])]);
    expect(rows).toEqual(keys.map((k) => [k, SEED[k]?.default]));
  });
  it('the seed: radius 25 m within 5..100, limit 30 within 1..50, both numeric, admin group "Parcel Lookup"', () => {
    expect(SEED[LOT_MAP_LIMIT_KEYS.radius_m]).toMatchObject({ default: 25, type: 'number', min: 5, max: 100, admin: { group: 'Parcel Lookup' } });
    expect(SEED[LOT_MAP_LIMIT_KEYS.limit]).toMatchObject({ default: 30, type: 'number', min: 1, max: 50, admin: { group: 'Parcel Lookup' } });
  });
  it('the Admin Control Panel lists both keys under "Parcel Lookup" with their defaults', () => {
    expect(GROUPS.find((g) => g.label === 'Parcel Lookup')?.keys).toEqual(keys);
    expect(keys.map((k) => LOGIC_VAR_DEFAULTS[k])).toEqual([25, 30]);
  });
  it('the UP half writes nothing else, and the DOWN is comment-only', () => {
    expect(upOf(sql()).match(/\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP)\b/g)).toEqual(['INSERT']);
    const down = (sql().split(/^--\s*DOWN/m)[1] ?? '').split('\n').slice(1);
    for (const l of down) if (l.trim()) expect(l.trim().startsWith('--'), l).toBe(true);
  });
});
