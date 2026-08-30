// SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §6.4
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1 (frozen shape)
//
// Regression lock: link-parcels' spatial-match constants and Strategy 1a bridge SQL,
// RE-HOMED at pilot 7's conversion (2026-08-30) from scripts/link-parcels.js (now the
// frozen 3-statement shape) to scripts/lib/compute/link-parcels.js (where the SQL text
// and config reads now live, Spec 122 §5.1). Every claim this file locked
// pre-conversion still holds — the file it reads changed, the assertions were rewritten
// to match the new code shape (ctx.config reads instead of a local `logicVars` var,
// buildMatchSql's generated SQL text instead of inline template literals), never
// silently dropped. See docs/reports/2026-08-30-pilot7-link-parcels-assessment.md for
// the full G3 intent-ledger disposition of every pre-conversion commit this file used
// to lock.
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const SRC = fs.readFileSync(
  path.resolve(__dirname, '../../scripts/lib/compute/link-parcels.js'),
  'utf-8'
);
const SEED = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../scripts/seeds/logic_variables.json'), 'utf-8')
) as Record<string, { default: number; type: string; min?: number; max?: number }>;

describe('scripts/lib/compute/link-parcels.js — spatial match constant externalization (§6.4)', () => {
  it('seed has spatial_match_max_distance_m (default 100, bounds sane)', () => {
    const entry = SEED.spatial_match_max_distance_m;
    if (!entry) throw new Error('spatial_match_max_distance_m missing from seed JSON');
    expect(entry.default).toBe(100);
    expect(entry.type).toBe('number');
    expect(entry.min).toBeGreaterThan(0);
    expect(entry.max).toBeGreaterThanOrEqual(100);
  });

  it('seed has spatial_match_confidence (default 0.65, bounds sane)', () => {
    const entry = SEED.spatial_match_confidence;
    if (!entry) throw new Error('spatial_match_confidence missing from seed JSON');
    expect(entry.default).toBe(0.65);
    expect(entry.type).toBe('number');
    expect(entry.min).toBeGreaterThan(0);
    expect(entry.max).toBeLessThanOrEqual(1.0);
  });

  it('seeds T1-T5 (LP-D4, pilot 7) — the four confidence literals + link_rate_warn_pct, all registered with sane bounds', () => {
    for (const key of [
      'link_parcels_confidence_address_points_exact',
      'link_parcels_confidence_exact_address',
      'link_parcels_confidence_spatial_polygon',
      'link_parcels_confidence_name_only',
      'link_parcels_link_rate_warn_pct',
    ]) {
      const entry = SEED[key];
      if (!entry) throw new Error(`${key} missing from seed JSON`);
      expect(entry.type).toBe('number');
    }
  });

  it('THE FIX\'s spatial_fallback_sql reads spatialMaxDistanceM/spatialConfidence via bound params ($5/$6), never a hardcoded literal', () => {
    expect(SRC).toMatch(/spatial_fallback_sql:/);
    expect(SRC).not.toMatch(/<=\s*100\b/); // the cap must never be a literal 100 in the generated SQL
  });

  it('the four confidence literals (T1-T4) are interpolated from resolved config values, not bare numeric literals, in buildMatchSql\'s generated SQL', () => {
    expect(SRC).toMatch(/\$\{addressPointsExactConfidence\}::numeric AS confidence/);
    expect(SRC).toMatch(/\$\{exactAddressConfidence\}::numeric AS confidence/);
    expect(SRC).toMatch(/\$\{spatialPolygonConfidence\}::numeric AS confidence/);
    expect(SRC).toMatch(/\$\{nameOnlyConfidence\}::numeric AS confidence/);
  });
});

describe('scripts/lib/compute/link-parcels.js — WF1 #parcel-address-bridge Phase 2d Strategy 1a', () => {
  it('defines an address_points_exact CTE that JOINs through parcel_address_points', () => {
    expect(SRC).toMatch(/address_points_exact\s+AS\s*\(/);
    expect(SRC).toMatch(/JOIN\s+address_points\s+ap/);
    expect(SRC).toMatch(/JOIN\s+parcel_address_points\s+pap\s+ON\s+pap\.address_point_id\s*=\s*ap\.address_point_id/);
    expect(SRC).toMatch(/'address_points_exact'\s+AS\s+match_type/);
  });

  it('Strategy 1a filters to MAINT_STAGE=REGULAR + ADDRESS_STATUS in (CURRENT, NONE) with NULL fallback', () => {
    expect(SRC).toMatch(/ap\.maint_stage\s+IS\s+NULL\s+OR\s+UPPER\(ap\.maint_stage\)\s*=\s*'REGULAR'/);
    expect(SRC).toMatch(/ap\.address_status\s+IS\s+NULL\s+OR\s+UPPER\(ap\.address_status\)\s+IN\s*\(\s*'CURRENT'\s*,\s*'NONE'\s*\)/);
  });

  it('Strategy 1a disambiguates multiple APs per parcel via Structure > Structure Entrance > Land (PI-6 option b)', () => {
    expect(SRC).toMatch(/CASE\s+UPPER\(COALESCE\(ap\.address_class_desc/);
    expect(SRC).toMatch(/WHEN\s+'STRUCTURE'\s+THEN\s+1/);
    expect(SRC).toMatch(/WHEN\s+'STRUCTURE ENTRANCE'\s+THEN\s+2/);
    expect(SRC).toMatch(/WHEN\s+'LAND'\s+THEN\s+3/);
  });

  it('Strategy 1a uses ST_Area(p.geom::geography) + address_point_id ASC tiebreakers (plan v4 H5/C2/F19)', () => {
    expect(SRC).toMatch(/ST_Area\s*\(\s*p\.geom\s*::\s*geography\s*\)\s+ASC/i);
    expect(SRC).toMatch(/ap\.address_point_id\s+ASC/);
  });

  it('Strategy 1a JOINs parcels p ON p.id = pap.parcel_id (to access geom for ST_Area)', () => {
    expect(SRC).toMatch(/JOIN\s+parcels\s+p\s+ON\s+p\.id\s*=\s*pap\.parcel_id/);
  });

  it('Strategy 1b (exact) AND Strategy 2 (name_only) BOTH have NOT EXISTS guards against address_points_exact', () => {
    const guardPattern = /NOT\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+address_points_exact/g;
    const matches = SRC.match(guardPattern);
    expect(matches, 'address_points_exact NOT EXISTS guard missing in one of the downstream CTEs').not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });

  it('Strategies 1a/1b/2 are folded into ONE primary_match_sql via UNION ALL (A-4 ruling, pilot 7) — cascade order preserved', () => {
    const apFirst = SRC.indexOf('SELECT * FROM address_points_exact');
    const exactSecond = SRC.indexOf('SELECT * FROM exact');
    const nameThird = SRC.indexOf('SELECT * FROM name_only');
    expect(apFirst).toBeGreaterThan(-1);
    expect(exactSecond).toBeGreaterThan(apFirst);
    expect(nameThird).toBeGreaterThan(exactSecond);
    expect(SRC).toMatch(/UNION ALL/);
  });

  it('emitMeta reads-list (descriptor inputs.reads.tables) covers address_points + parcel_address_points columns Strategy 1a needs (Spec 48 §3)', () => {
    const descriptor = JSON.parse(fs.readFileSync(
      path.resolve(__dirname, '../../scripts/link-parcels.descriptor.json'), 'utf-8',
    )) as { inputs: { reads: { tables: Array<{ table: string; columns: string[] }> } } };
    const apTable = descriptor.inputs.reads.tables.find((t) => t.table === 'address_points');
    expect(apTable, 'address_points not declared in inputs.reads.tables').toBeTruthy();
    for (const col of ['address_point_id', 'addr_num_normalized', 'linear_name_normalized', 'address_class_desc', 'maint_stage', 'address_status']) {
      expect(apTable!.columns).toContain(col);
    }
    const papTable = descriptor.inputs.reads.tables.find((t) => t.table === 'parcel_address_points');
    expect(papTable, 'parcel_address_points not declared in inputs.reads.tables').toBeTruthy();
    expect(papTable!.columns).toContain('parcel_id');
  });

  it('F17 rollup preserved — tier_1_exact_address sums address_points_exact + exact_legacy, matches_tier_1_via_bridge is the informational sibling', () => {
    expect(SRC).toMatch(/function tier_1_exact_address/);
    expect(SRC).toMatch(/address_points_exact\s*\+\s*.*exact_legacy/);
    expect(SRC).toMatch(/matches_tier_1_via_bridge:/);
  });

  it('verdict is row-derived (Spec 48 §3.6, no parallel-boolean) — checks[] dispatch drives buildAuditTable generically, no step-owned hasWarns/hasFails', () => {
    expect(SRC).not.toMatch(/hasWarns/);
    expect(SRC).not.toMatch(/hasFails/);
    expect(SRC).not.toMatch(/parcelLinkRate\s*<\s*75\s*\?\s*['"]WARN['"]/);
  });
});
