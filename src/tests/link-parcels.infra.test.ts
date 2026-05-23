// SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §6.4
//
// Regression lock: scripts/link-parcels.js must read its spatial-match
// constants from logicVars rather than hardcoding them:
//   - spatial_match_max_distance_m (E18): max metres for Strategy 3 spatial match
//   - spatial_match_confidence     (E18): confidence score for spatial match
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const SRC = fs.readFileSync(
  path.resolve(__dirname, '../../scripts/link-parcels.js'),
  'utf-8'
);
const SEED = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../scripts/seeds/logic_variables.json'), 'utf-8')
) as Record<string, { default: number; type: string; min?: number; max?: number }>;

describe('link-parcels.js — spatial match constant externalization (§6.4)', () => {
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

  it('reads constants from logicVars — no hardcoded SPATIAL_MAX_DISTANCE_M or SPATIAL_CONFIDENCE', () => {
    expect(SRC).toMatch(/logicVars\.spatial_match_max_distance_m/);
    expect(SRC).toMatch(/logicVars\.spatial_match_confidence/);
    expect(SRC).not.toMatch(/SPATIAL_MAX_DISTANCE_M\s*=/);
    expect(SRC).not.toMatch(/SPATIAL_CONFIDENCE\s*=/);
  });

  it('uses LOGIC_VARS_SCHEMA for validation', () => {
    expect(SRC).toMatch(/LOGIC_VARS_SCHEMA/);
    expect(SRC).toMatch(/loadMarketplaceConfigs/);
    expect(SRC).toMatch(/validateLogicVars/);
  });
});

describe('link-parcels.js — WF1 #parcel-address-bridge Phase 2d Strategy 1a', () => {
  it('defines an address_points_exact CTE that JOINs through parcel_address_points', () => {
    // The new top-of-cascade strategy. Higher confidence than legacy
    // parcels.addr_num_normalized exact match because address_points is the
    // canonical source post-2026-05-20 CKAN strip + the bridge guarantees
    // the AP geom is inside the parcel polygon.
    expect(SRC).toMatch(/address_points_exact\s+AS\s*\(/);
    expect(SRC).toMatch(/JOIN\s+address_points\s+ap/);
    expect(SRC).toMatch(/JOIN\s+parcel_address_points\s+pap\s+ON\s+pap\.address_point_id\s*=\s*ap\.address_point_id/);
    expect(SRC).toMatch(/'address_points_exact'\s+AS\s+match_type/);
    expect(SRC).toMatch(/0\.97\s+AS\s+confidence/);
  });

  it('Strategy 1a filters to MAINT_STAGE=REGULAR + ADDRESS_STATUS in (CURRENT, NONE) with NULL fallback', () => {
    // Defensive: NULL fallback for pre-Phase-2b imports.
    // WF3 hotfix #2 (2026-05-23): Toronto's actual ADDRESS_STATUS column
    // contains the literal string 'None' for 100% of rows. Plan v4
    // originally assumed CURRENT/RETIRED/PENDING. Filter accepts 'NONE'
    // as equivalent to 'CURRENT' (canonical in-use state in production).
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
    // Plan v4 fold H5: uniform 3-level tiebreaker.
    //   1. ADDRESS_CLASS_DESC CASE
    //   2. ST_Area(p.geom::geography) ASC — smallest enclosing parcel wins.
    //      Cast to ::geography because raw ST_Area on GEOMETRY(*, 4326)
    //      returns square *degrees* which vary with latitude (fold C2).
    //   3. ap.address_point_id ASC — stable deterministic final tiebreaker.
    expect(SRC).toMatch(/ST_Area\s*\(\s*p\.geom\s*::\s*geography\s*\)\s+ASC/i);
    expect(SRC).toMatch(/ap\.address_point_id\s+ASC/);
  });

  it('Strategy 1a JOINs parcels p ON p.id = pap.parcel_id (to access geom for ST_Area)', () => {
    expect(SRC).toMatch(/JOIN\s+parcels\s+p\s+ON\s+p\.id\s*=\s*pap\.parcel_id/);
  });

  it('Strategy 1b (exact) AND Strategy 2 (name_only) BOTH have NOT EXISTS guards against address_points_exact', () => {
    // Independent IMPL F1 fold: each downstream CTE must have its OWN guard
    // against the new Strategy 1a CTE. A single regex assertion would pass
    // even if one guard were deleted; require count >= 2.
    const guardPattern = /NOT\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+address_points_exact/g;
    const matches = SRC.match(guardPattern);
    expect(matches, 'address_points_exact NOT EXISTS guard missing in one of the downstream CTEs').not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });

  it('audit_table preserves legacy tier_1_exact_address name + adds tier_1_via_bridge sibling (plan v4 F17)', () => {
    // F17 lock: keep `tier_1_exact_address` to preserve observe-chain.js
    // 7-day baseline. Add `tier_1_via_bridge` as INFORMATIONAL sibling that
    // counts the subset of Tier-1 matches via the bridge path.
    expect(SRC).toMatch(/['"]tier_1_exact_address['"]/);
    expect(SRC).toMatch(/['"]tier_1_via_bridge['"]/);
    // Defensive: NO rename to tier_1b_*
    expect(SRC).not.toMatch(/['"]tier_1b_exact_address['"]/);
    expect(SRC).not.toMatch(/['"]tier_1a_address_points_exact['"]/);
  });

  it('records_meta preserves legacy matches_tier_1_exact key + adds matches_tier_1_via_bridge sibling (F17)', () => {
    expect(SRC).toMatch(/matches_tier_1_exact:/);
    expect(SRC).toMatch(/matches_tier_1_via_bridge:/);
    expect(SRC).not.toMatch(/matches_tier_1b_exact:/);
    expect(SRC).not.toMatch(/matches_tier_1a_address_points:/);
  });

  it('emitMeta reads-list adds address_points + parcel_address_points (Spec 48 §3)', () => {
    // Independent IMPL F2 fold: cover ALL 6 columns referenced by the
    // Strategy 1a CTE — including the filter predicate columns
    // (maint_stage, address_status) so schema-drift detection catches
    // a future CKAN rename of either column.
    expect(SRC).toMatch(/"address_points":\s*\[[^\]]*"address_point_id"/);
    expect(SRC).toMatch(/"address_points":\s*\[[^\]]*"addr_num_normalized"/);
    expect(SRC).toMatch(/"address_points":\s*\[[^\]]*"linear_name_normalized"/);
    expect(SRC).toMatch(/"address_points":\s*\[[^\]]*"address_class_desc"/);
    expect(SRC).toMatch(/"address_points":\s*\[[^\]]*"maint_stage"/);
    expect(SRC).toMatch(/"address_points":\s*\[[^\]]*"address_status"/);
    expect(SRC).toMatch(/"parcel_address_points":\s*\[[^\]]*"parcel_id"/);
  });

  it('upgrades verdict to Spec 48 §3.6 row-derived cascade (no parallel-boolean)', () => {
    expect(SRC).toMatch(/parcelAuditRows\.some\(\(?r\)?\s*=>\s*r\.status\s*===\s*['"]FAIL['"]\)/);
    expect(SRC).toMatch(/parcelAuditRows\.some\(\(?r\)?\s*=>\s*r\.status\s*===\s*['"]WARN['"]\)/);
    expect(SRC).not.toMatch(/parcelLinkRate\s*<\s*75\s*\?\s*['"]WARN['"]/);
  });

  it('linkedExactTotal sums linkedAddressPoints + linkedExactLegacy (F17 rollup)', () => {
    // Plan v4 F17: the legacy `tier_1_exact_address` metric value is the
    // SUM of bridge-path + legacy-path Tier-1 matches.
    expect(SRC).toMatch(/linkedExactTotal\s*=\s*linkedAddressPoints\s*\+\s*linkedExactLegacy/);
    expect(SRC).toMatch(/totalLinked\s*=\s*linkedExactTotal\s*\+\s*linkedName\s*\+\s*linkedSpatial/);
  });

  it('Strategy 1a UNION ALL runs first; cascade order preserved', () => {
    // Source-order: address_points_exact first, then exact, then name_only.
    // The CTE references rely on this order for the NOT EXISTS guards.
    const apFirst = SRC.indexOf('SELECT * FROM address_points_exact');
    const exactSecond = SRC.indexOf('SELECT * FROM exact');
    const nameThird = SRC.indexOf('SELECT * FROM name_only');
    expect(apFirst).toBeGreaterThan(-1);
    expect(exactSecond).toBeGreaterThan(apFirst);
    expect(nameThird).toBeGreaterThan(exactSecond);
  });
});
