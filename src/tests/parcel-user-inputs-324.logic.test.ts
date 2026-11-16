// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11a.9 (dated note 2026-11-15), 11a.4 (provenance);
//            docs/specs/00-architecture/114_rls_policy_catalog.md section 2 (parcel_user_inputs Class B, unchanged);
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-19, FE-20.
//
// MF-19 plan v3 (operator 2026-11-15 "R-1 thru R-6 recommendations approved") · the file-level lock of migration 324 (WRITTEN, NOT APPLIED here: the
// DB job MF19-324 applies it; the live-DB arms are in src/tests/db/parcel-user-inputs.db.test.ts and run under npm run test:db):
//   (1) the four new columns (NUMERIC(8,2), NULL) and typed_value made nullable, all idempotent (IF NOT EXISTS, DROP ... IF EXISTS then re-add);
//   (2) the unit CHECK admits ft and m beside sqft and m2; the shape CHECK is written with IS NOT NULL (a bare "x > 0" is NULL and a CHECK passes
//       on NULL, so a NULL side would slip through);
//   (3) the two settings INSERTs are ON CONFLICT DO NOTHING and equal the seed (the seed is the test truth);
//   (4) the DOWN block is comment-only and warns against running it once a width-path row exists;
//   (5) no new table, no policy (Class B stays), nothing on parcels, and no row assertion or backfill.
// Planted defects (each must fail): a shape CHECK with a bare "> 0"; a non-idempotent ADD COLUMN; an uncommented DOWN line; a seed mismatch.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const read = (p: string): string => fs.readFileSync(path.join(ROOT, p), 'utf8');
const MIG = 'migrations/324_parcel_user_inputs_width_depth.sql';
const SEED = JSON.parse(read('scripts/seeds/logic_variables.json')) as Record<string, { default: number; min: number; max: number; admin?: { group?: string } }>;
const KEYS = ['user_lot_size_side_min_m', 'user_lot_size_side_max_m'];

const up = (sql: string): string => sql.slice(sql.indexOf('-- UP'), sql.indexOf('-- DOWN'));
const down = (sql: string): string => sql.slice(sql.indexOf('-- DOWN'));

export const migrationProblems = (sql: string): string[] => {
  const out: string[] = [];
  const u = up(sql);
  for (const c of ['width_m', 'depth_m', 'typed_width', 'typed_depth']) {
    if (!new RegExp(`ADD COLUMN IF NOT EXISTS ${c}\\s+NUMERIC\\(8,2\\) NULL`).test(u)) out.push(`${c} is not an idempotent NUMERIC(8,2) NULL column`);
  }
  if (!/ALTER COLUMN typed_value DROP NOT NULL/.test(u)) out.push('typed_value is not made nullable');
  for (const k of ['unit', 'typed', 'shape']) {
    if (!new RegExp(`DROP CONSTRAINT IF EXISTS chk_parcel_user_inputs_${k};`).test(u)) out.push(`chk_parcel_user_inputs_${k} is not dropped IF EXISTS before it is re-added`);
  }
  if (!/chk_parcel_user_inputs_unit CHECK \(typed_unit IN \('sqft', 'm2', 'ft', 'm'\)\)/.test(u)) out.push('the unit CHECK does not admit ft and m beside sqft and m2');
  const shape = /ADD CONSTRAINT chk_parcel_user_inputs_shape CHECK \(([\s\S]*?)\n  \);/.exec(u)?.[1] ?? '';
  if (!shape) out.push('no named shape CHECK');
  for (const c of ['width_m', 'depth_m', 'typed_width', 'typed_depth']) {
    if (!new RegExp(`${c}\\s+IS NOT NULL AND ${c}\\s+> 0`).test(shape)) out.push(`the shape CHECK does not refuse a NULL ${c} on the width path (IS NOT NULL AND > 0)`);
    if (!new RegExp(`${c}\\s+IS NULL`).test(shape)) out.push(`the shape CHECK does not require ${c} NULL on the area path`);
  }
  if (!/typed_unit IN \('ft', 'm'\)/.test(shape) || !/typed_unit IN \('sqft', 'm2'\)/.test(shape)) out.push('the shape CHECK does not pair each path with its units');
  if (!/typed_value IS NULL\)/.test(shape) || !/typed_value IS NOT NULL AND typed_value > 0/.test(shape)) out.push('the shape CHECK does not pair each path with typed_value');
  if (!/INSERT INTO logic_variables[\s\S]*ON CONFLICT \(variable_key\) DO NOTHING;/.test(u)) out.push('the settings INSERT is not ON CONFLICT DO NOTHING');
  if (/CREATE TABLE|CREATE POLICY|ALTER TABLE parcels\b|ENABLE ROW LEVEL SECURITY|DELETE FROM|UPDATE parcel_user_inputs/.test(u)) out.push('the UP block does more than the plan names (a table, a policy, parcels, a backfill or a delete)');
  const d = down(sql).split('\n').filter((l) => l.trim() !== '' && !l.startsWith('--'));
  if (d.length) out.push(`uncommented line under DOWN: ${d[0]}`);
  if (!/do NOT run this if any width-path row exists/.test(down(sql))) out.push('the DOWN header does not warn about width-path rows');
  return out;
};

describe('migration 324 (MF-19 plan v3): the file', () => {
  it('has no problems', () => {
    expect(migrationProblems(read(MIG))).toEqual([]);
  });
  it('RED: a bare "> 0" shape CHECK (NULL passes a CHECK) is caught', () => {
    expect(migrationProblems(read(MIG).replace('width_m     IS NOT NULL AND width_m     > 0', 'width_m     > 0'))).toContainEqual(expect.stringContaining('NULL width_m'));
  });
  it('RED: a non-idempotent ADD COLUMN is caught', () => {
    expect(migrationProblems(read(MIG).replace('ADD COLUMN IF NOT EXISTS width_m', 'ADD COLUMN width_m'))).toContainEqual(expect.stringContaining('width_m is not an idempotent'));
  });
  it('RED: an uncommented DOWN line is caught', () => {
    expect(migrationProblems(read(MIG).replace('-- BEGIN;\n--   DELETE FROM', 'BEGIN;\n--   DELETE FROM'))).toContainEqual(expect.stringContaining('uncommented line under DOWN'));
  });
  it('RED: the unit CHECK without ft and m is caught', () => {
    expect(migrationProblems(read(MIG).replace("('sqft', 'm2', 'ft', 'm')", "('sqft', 'm2')"))).toContainEqual(expect.stringContaining('admit ft and m'));
  });
});

describe('migration 324: the two settings equal the seed', () => {
  const tuples = (): Map<string, number> => {
    const m = new Map<string, number>();
    for (const t of up(read(MIG)).matchAll(/\('(user_lot_size_\w+)', ([\d.]+), NULL, '/g)) m.set(t[1]!, Number(t[2]));
    return m;
  };
  it('exactly the two keys, each value = the seed default, each in the group "MaxBLD Lot Size", seed bounds 1-20 and 100-1000', () => {
    const t = tuples();
    expect([...t.keys()]).toEqual(KEYS);
    for (const k of KEYS) {
      expect(t.get(k)).toBe(SEED[k]!.default);
      expect(SEED[k]!.admin?.group).toBe('MaxBLD Lot Size');
    }
    expect([SEED[KEYS[0]!]!.min, SEED[KEYS[0]!]!.max, SEED[KEYS[1]!]!.min, SEED[KEYS[1]!]!.max]).toEqual([1, 20, 100, 1000]);
    expect([SEED[KEYS[0]!]!.default, SEED[KEYS[1]!]!.default]).toEqual([2, 450]); // R-5 a: 2 m (6.6 ft) to 450 m
  });
  it('RED: a migration value that differs from the seed is caught', () => {
    const bad = read(MIG).replace("('user_lot_size_side_min_m', 2,", "('user_lot_size_side_min_m', 3,");
    const m = new Map<string, number>();
    for (const t of up(bad).matchAll(/\('(user_lot_size_\w+)', ([\d.]+), NULL, '/g)) m.set(t[1]!, Number(t[2]));
    expect(m.get(KEYS[0]!)).not.toBe(SEED[KEYS[0]!]!.default);
  });
  it('the entry switch and the other four MF-19 settings are untouched (the switch stays 0-0, OFF)', () => {
    const s = SEED['user_lot_size_entry_enabled']!;
    expect([s.default, s.min, s.max]).toEqual([0, 0, 0]);
    expect(up(read(MIG))).not.toMatch(/user_lot_size_entry_enabled|user_lot_size_min_sqm|user_lot_size_max_sqm|user_lot_size_city_ratio_max|user_lot_size_entries_per_day/);
  });
});
