// 🔗 SPEC LINK: docs/specs/01-pipeline/56_source_massing.md §2
//             docs/specs/01-pipeline/83_lead_cost_model.md §3 (the GFA Step A consumer)
//
// SQL-shape regression-lock for migration 122. Mirrors the migration-119 +
// migration-121 patterns (text regex over the migration body — no live DB
// needed for this layer; the live-DB regression-lock lives at
// src/tests/db/building-footprints-area.db.test.ts).
//
// Migration 122 backfills the 427,077 NULL `building_footprints.footprint_area_sqm`
// (and `footprint_area_sqft`) rows by computing PostGIS ST_Area on the
// stored Web Mercator (EPSG:3857) GeoJSON geometry — converted to WGS84
// then cast to geography for true square-meter output.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('migration 122 — building_footprints.footprint_area_sqm backfill', () => {
  let sql: string;

  beforeAll(() => {
    sql = fs.readFileSync(
      path.resolve(__dirname, '../../migrations/122_building_footprints_area_backfill.sql'),
      'utf-8',
    );
  });

  it('UPDATE targets the building_footprints table', () => {
    expect(sql).toMatch(/UPDATE\s+building_footprints/i);
  });

  it('reads geometry::text via ST_GeomFromGeoJSON (JSONB → text → geom)', () => {
    expect(sql).toMatch(/ST_GeomFromGeoJSON\(\s*geometry::text\s*\)/i);
  });

  it('uses ST_Transform from EPSG:3857 (Web Mercator) to 4326 (WGS84)', () => {
    expect(sql).toMatch(/ST_Transform\([\s\S]*?ST_SetSRID\([\s\S]*?,\s*3857\s*\)\s*,\s*4326\s*\)/i);
  });

  it('casts to ::geography for true square-meter ST_Area output', () => {
    expect(sql).toMatch(/::geography/);
  });

  it('idempotency guard — WHERE footprint_area_sqm IS NULL', () => {
    // Re-applying the migration MUST be a no-op once the rows are populated.
    expect(sql).toMatch(/WHERE\s+footprint_area_sqm\s+IS\s+NULL/i);
  });

  it('SETs both footprint_area_sqm AND footprint_area_sqft', () => {
    expect(sql).toMatch(/footprint_area_sqm\s*=/);
    expect(sql).toMatch(/footprint_area_sqft\s*=/);
  });

  it('sqft conversion factor is 10.7639104167 (canonical sqm→sqft)', () => {
    // 1 m² = 10.7639104167 ft² (exact). Common close cousins (10.7639,
    // 10.764) round-trip with up to ~0.01% drift; pin the canonical value.
    expect(sql).toMatch(/10\.7639104167/);
  });

  it('rounds both columns to 2 decimal places (DECIMAL(12,2) match)', () => {
    // building_footprints.footprint_area_sqm is DECIMAL(12,2). Round at the
    // SQL layer so the stored value matches the column's scale exactly. The
    // expected pattern: TWO `ROUND(... , 2)` calls (one per column). Use
    // ::numeric inside ROUND because PostGIS returns float8.
    const roundCalls = sql.match(/ROUND\(\s*\([\s\S]*?\)::numeric\s*,\s*2\s*\)/gi);
    expect(roundCalls).not.toBeNull();
    expect(roundCalls!.length).toBeGreaterThanOrEqual(2);
  });

  it('comment-only DOWN block per Rule 6 (commit 8b1c10b)', () => {
    expect(sql).toMatch(/--\s*(DOWN|MANUAL ROLLBACK|ROLLBACK)/i);
    // No executable SQL after the DOWN comment block.
    const downIdx = sql.search(/--\s*DOWN\b/i);
    expect(downIdx).toBeGreaterThan(0);
    const afterDown = sql.slice(downIdx);
    const offendingLines = afterDown
      .split('\n')
      .filter((line) => {
        const trimmed = line.trim();
        if (trimmed === '' || trimmed.startsWith('--')) return false;
        return /\b(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)\b/i.test(trimmed);
      });
    expect(offendingLines).toEqual([]);
  });
});
