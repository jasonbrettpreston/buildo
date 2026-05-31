// 🔗 SPEC LINK: docs/specs/01-pipeline/65_enrich_parcels.md (v1.0) §2, §6
//
// File-content + wiring regression lock for Spec 65 (enrich-parcels WF2):
//   - migration 165 adds the full bylaw feed onto parcels (~36 nullable cols),
//     NO index (validate-migration Rule 2 + CONCURRENTLY-in-txn), commented DOWN.
//   - manifest.json registers enrich_parcels (scripts map + chains.sources AFTER
//     load_zoning, BEFORE refresh_snapshot) — the chain-registration cascade.
//   - _contracts.json carries the ambiguity threshold.
// Cheap (no DB). Live-schema assertions live in src/tests/db/enrich-parcels.db.test.ts.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const sql = readFileSync(resolve(root, 'migrations/165_parcels_zoning_columns.sql'), 'utf8');
const manifest = JSON.parse(readFileSync(resolve(root, 'scripts/manifest.json'), 'utf8'));
const contracts = JSON.parse(readFileSync(resolve(root, 'docs/specs/_contracts.json'), 'utf8'));

const COLUMNS: Array<[string, string]> = [
  ['zoning_class', 'TEXT'],
  ['zoning_zn_string', 'TEXT'],
  ['zoning_gen_zone', 'INTEGER'],
  ['zoning_holding', 'TEXT'],
  ['zone_status', 'INTEGER'],
  ['bylaw_max_fsi', 'NUMERIC(6,3)'],
  ['bylaw_max_coverage_pct', 'NUMERIC(5,2)'],
  ['bylaw_max_height_m', 'NUMERIC(8,2)'],
  ['bylaw_max_stories', 'INTEGER'],
  ['bylaw_max_units', 'INTEGER'],
  ['bylaw_max_density', 'NUMERIC(10,2)'],
  ['bylaw_min_frontage_m', 'NUMERIC(8,2)'],
  ['bylaw_min_area_sqm', 'INTEGER'],
  ['bylaw_standard_setback_m', 'NUMERIC(8,2)'],
  ['bylaw_pct_commercial_max', 'NUMERIC(5,2)'],
  ['bylaw_pct_residential_max', 'NUMERIC(5,2)'],
  ['bylaw_pct_employment_max', 'NUMERIC(5,2)'],
  ['bylaw_pct_office_max', 'NUMERIC(5,2)'],
  ['exception_number', 'INTEGER'],
  ['exception_text', 'TEXT'],
  ['bylaw_chapter', 'TEXT'],
  ['bylaw_section', 'TEXT'],
  ['bylaw_exception_ref', 'TEXT'],
  ['in_policy_area', 'BOOLEAN'],
  ['on_policy_road', 'BOOLEAN'],
  ['in_rooming_house_overlay', 'BOOLEAN'],
  ['in_parking_zone_overlay', 'BOOLEAN'],
  ['in_building_setback_overlay', 'BOOLEAN'],
  ['on_priority_retail', 'BOOLEAN'],
  ['in_queenstw_eat_overlay', 'BOOLEAN'],
  ['zoning_overlays', 'JSONB'],
  ['zoning_base_source_id', 'INTEGER'],
  ['zoning_dominant_area_share', 'NUMERIC(5,4)'],
  ['zoning_is_ambiguous', 'BOOLEAN'],
  ['zoning_base_source_dataset_version', 'TIMESTAMPTZ'],
  ['zoning_enriched_at', 'TIMESTAMPTZ'],
];

describe('migration 165 — parcels zoning columns DDL', () => {
  it('adds all 36 bylaw-feed columns with the expected types', () => {
    expect(COLUMNS).toHaveLength(36);
    for (const [col, type] of COLUMNS) {
      // ADD COLUMN IF NOT EXISTS <col> <TYPE>
      const re = new RegExp(
        `ADD COLUMN IF NOT EXISTS\\s+${col}\\s+${type.replace(/[()]/g, '\\$&')}`,
      );
      expect(sql, `${col} ${type}`).toMatch(re);
    }
  });

  it('uses F-H5 bylaw_max_* / bylaw_min_* naming (no coverage_max_pct / fsi_max collision cols)', () => {
    expect(sql).toContain('bylaw_max_coverage_pct');
    expect(sql).toContain('bylaw_max_fsi');
    expect(sql).toContain('bylaw_max_height_m');
    expect(sql).not.toMatch(/ADD COLUMN IF NOT EXISTS\s+coverage_max_pct\b/);
    expect(sql).not.toMatch(/ADD COLUMN IF NOT EXISTS\s+fsi_max\b/);
  });

  it('creates NO index on parcels (validate-migration Rule 2 + CONCURRENTLY-in-txn)', () => {
    expect(sql).not.toMatch(/CREATE INDEX/i);
  });

  it('has a commented-out (Rule 6) DROP COLUMN DOWN block — no live destructive statement', () => {
    expect(sql).toMatch(/--\s*DROP COLUMN IF EXISTS zoning_class/);
    // Every DROP COLUMN line must be a comment.
    for (const line of sql.split('\n')) {
      if (/DROP COLUMN/.test(line)) {
        expect(line.trimStart().startsWith('--'), `live DROP COLUMN: ${line}`).toBe(true);
      }
    }
  });
});

describe('manifest.json — enrich_parcels chain-registration cascade', () => {
  it('registers enrich_parcels in the scripts map → scripts/enrich-parcels.js', () => {
    expect(manifest.scripts.enrich_parcels).toBeDefined();
    expect(manifest.scripts.enrich_parcels.file).toBe('scripts/enrich-parcels.js');
    expect(manifest.scripts.enrich_parcels.telemetry_tables).toContain('parcels');
  });

  it('inserts enrich_parcels into the sources chain immediately after load_zoning', () => {
    const sources: string[] = manifest.chains.sources;
    expect(sources).toContain('enrich_parcels');
    const zi = sources.indexOf('load_zoning');
    const ei = sources.indexOf('enrich_parcels');
    expect(ei).toBe(zi + 1);
    // …and before refresh_snapshot (downstream consumers see enriched parcels).
    expect(ei).toBeLessThan(sources.indexOf('refresh_snapshot'));
  });

  it('grows the sources chain from 17 to 18 steps', () => {
    expect(manifest.chains.sources).toHaveLength(18);
  });
});

describe('_contracts.json — zoning ambiguity threshold', () => {
  it('defines zoning.ambiguous_dominant_share_max = 0.6', () => {
    expect(contracts.zoning).toBeDefined();
    expect(contracts.zoning.ambiguous_dominant_share_max).toBe(0.6);
  });
});
