// 🔗 SPEC LINK: docs/specs/01-pipeline/58_source_zoning_bylaw.md (v2.3) §2, §4
//
// File-content + wiring regression lock for the Spec 58 zoning ingest:
//   - migration 164 declares all 10 tables + GIST + key CHECK constraints,
//     NO zoning_exceptions (D6), commented-out DROP…CASCADE DOWN, FK-EXEMPT.
//   - manifest.json registers load_zoning (scripts map + chains.sources, R2-3)
//     with the 10 telemetry_tables + telemetry_null_cols (P-C4).
//   - logic_variables.json seeds road_overlay_distance_m (R2-10).
// Cheap (no DB). Live-schema assertions live in src/tests/db/zoning.db.test.ts.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const sql = readFileSync(resolve(root, 'migrations/164_zoning_bylaw_tables.sql'), 'utf8');
const manifest = JSON.parse(readFileSync(resolve(root, 'scripts/manifest.json'), 'utf8'));
const logicVars = JSON.parse(readFileSync(resolve(root, 'scripts/seeds/logic_variables.json'), 'utf8'));

const TABLES = [
  'zoning_bylaw_areas',
  'zoning_height_overlay',
  'zoning_lot_coverage_overlay',
  'zoning_building_setback_overlay',
  'zoning_policy_area_overlay',
  'zoning_policy_road_overlay',
  'zoning_rooming_house_overlay',
  'zoning_parking_zone_overlay',
  'zoning_priority_retail_overlay',
  'zoning_queenstw_eat_overlay',
];

describe('migration 164 — zoning tables DDL', () => {
  it('creates all 10 layer tables', () => {
    for (const t of TABLES) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${t} (`);
    }
  });

  it('creates a GIST index on geom for every table', () => {
    for (const t of TABLES) {
      expect(sql).toMatch(new RegExp(`USING GIST \\(geom\\)[\\s\\S]*?ON ${t}|ON ${t} USING GIST \\(geom\\)`));
    }
    expect((sql.match(/USING GIST \(geom\)/g) || []).length).toBe(10);
  });

  it('uses typed Multi* geometry: MultiPolygon ×8, MultiLineString ×2 (Policy Road + Priority Retail)', () => {
    // Match the DDL column form (… NOT NULL); the header comment names the
    // types too but without NOT NULL, so this counts only real columns.
    expect((sql.match(/GEOMETRY\(MultiPolygon, 4326\) NOT NULL/g) || []).length).toBe(8);
    expect((sql.match(/GEOMETRY\(MultiLineString, 4326\) NOT NULL/g) || []).length).toBe(2);
    expect(sql).toMatch(/zoning_policy_road_overlay[\s\S]*?GEOMETRY\(MultiLineString, 4326\) NOT NULL/);
    expect(sql).toMatch(/zoning_priority_retail_overlay[\s\S]*?GEOMETRY\(MultiLineString, 4326\) NOT NULL/);
  });

  it('declares source_id as the UNIQUE NOT NULL upsert key on every table', () => {
    expect((sql.match(/source_id\s+INTEGER UNIQUE NOT NULL/g) || []).length).toBe(10);
  });

  it('carries the base CHECK constraints (coverage 0–100, fsi >= 0, length caps)', () => {
    expect(sql).toMatch(/coverage_max_pct\s+NUMERIC\(5,2\)\s+CHECK \(coverage_max_pct BETWEEN 0 AND 100\)/);
    expect(sql).toMatch(/fsi_max\s+NUMERIC\(6,3\)\s+CHECK \(fsi_max >= 0\)/);
    expect(sql).toMatch(/CHECK \(char_length\(zn_zone\) <= 20\)/);
    expect(sql).toMatch(/CHECK \(char_length\(zn_string\) <= 50\)/);
  });

  it('embeds exceptions in the base table (D6) — NO separate zoning_exceptions table', () => {
    expect(sql).toContain('exception_number');
    expect(sql).toContain('exception_text');
    // D6: no CREATE TABLE for zoning_exceptions (the D6 comment may mention the name).
    expect(sql).not.toMatch(/CREATE TABLE (IF NOT EXISTS )?zoning_exceptions\b/);
  });

  it('has the base non-spatial indexes (zn_zone, partial exception_number, bylaw_chapter)', () => {
    expect(sql).toMatch(/ON zoning_bylaw_areas \(zn_zone\)/);
    expect(sql).toMatch(/ON zoning_bylaw_areas \(exception_number\) WHERE exception_number IS NOT NULL/);
    expect(sql).toMatch(/ON zoning_bylaw_areas \(bylaw_chapter\)/);
  });

  it('is FK-EXEMPT (D1 source_id is CKAN _id, not a Buildo FK) and has a commented-out DROP…CASCADE DOWN (Rule 6)', () => {
    expect(sql).toMatch(/--\s*FK-EXEMPT/i);
    for (const t of TABLES) {
      expect(sql).toMatch(new RegExp(`--\\s*DROP TABLE IF EXISTS ${t}\\s+CASCADE;`));
    }
  });

  it('creates GIST indexes WITHOUT CONCURRENTLY (F-H6 — empty tables, in-txn migration)', () => {
    expect(sql).not.toMatch(/CREATE INDEX CONCURRENTLY/);
  });
});

describe('manifest.json — load_zoning registration', () => {
  it('registers load_zoning in the scripts map → scripts/load-zoning.js', () => {
    expect(manifest.scripts.load_zoning).toBeDefined();
    expect(manifest.scripts.load_zoning.file).toBe('scripts/load-zoning.js');
  });

  it('lists all 10 telemetry_tables and the 3 base NULL-tracked cols (P-C4)', () => {
    expect(manifest.scripts.load_zoning.telemetry_tables).toEqual(TABLES);
    expect(manifest.scripts.load_zoning.telemetry_null_cols).toEqual({
      zoning_bylaw_areas: ['coverage_max_pct', 'fsi_max', 'frontage_min_m'],
    });
  });

  it('wires load_zoning into the sources chain (R2-3 — the operative registration)', () => {
    expect(manifest.chains.sources).toContain('load_zoning');
  });
});

describe('logic_variables.json — road_overlay_distance_m (R2-10 seed)', () => {
  it('seeds road_overlay_distance_m with default 5', () => {
    expect(logicVars.road_overlay_distance_m).toBeDefined();
    expect(logicVars.road_overlay_distance_m.default).toBe(5);
    expect(logicVars.road_overlay_distance_m.type).toBe('number');
  });
});
