// 🔗 SPEC LINK: docs/specs/01-pipeline/66_enrich_permits.md (v1.0) §2, §5
//
// File-content + wiring regression lock for Spec 66 (enrich-permits WF3):
//   - migration 166 adds the zoning feed onto permits + coa_applications,
//     method CHECK, NO in-migration index, commented DOWN.
//   - manifest.json registers BOTH modes (enrich_permits in permits chain after
//     link_parcels; enrich_coa_zoning in coa chain after link_coa_to_parcels),
//     same file, with env.ENRICH_TARGET — the dual-entry cascade.
//   - _contracts.json carries the F-H12 thresholds.
// Cheap (no DB). Live-schema assertions live in src/tests/db/enrich-permits.db.test.ts.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const sql = readFileSync(resolve(root, 'migrations/166_permits_coa_zoning_columns.sql'), 'utf8');
const manifest = JSON.parse(readFileSync(resolve(root, 'scripts/manifest.json'), 'utf8'));
const contracts = JSON.parse(readFileSync(resolve(root, 'docs/specs/_contracts.json'), 'utf8'));

const PERMIT_COLS: Array<[string, string]> = [
  ['zoning_class', 'TEXT'], ['bylaw_max_coverage_pct', 'NUMERIC(5,2)'], ['bylaw_max_fsi', 'NUMERIC(6,3)'],
  ['bylaw_max_height_m', 'NUMERIC(8,2)'], ['exception_number', 'INTEGER'], ['applicable_bylaws', 'JSONB'],
  ['overlay_summary', 'JSONB'], ['zoning_parcel_count', 'INTEGER'], ['zoning_dominant_parcel_id', 'INTEGER'],
  ['zoning_enriched_at', 'TIMESTAMPTZ'],
];
const COA_COLS: Array<[string, string]> = [
  ['zoning_class', 'TEXT'], ['bylaw_max_coverage_pct', 'NUMERIC(5,2)'], ['bylaw_max_fsi', 'NUMERIC(6,3)'],
  ['bylaw_max_height_m', 'NUMERIC(8,2)'], ['exception_number', 'INTEGER'], ['variance_context', 'JSONB'],
  ['zoning_parcel_count', 'INTEGER'], ['zoning_dominant_parcel_id', 'INTEGER'], ['zoning_enriched_at', 'TIMESTAMPTZ'],
];

describe('migration 166 — permits + coa zoning columns', () => {
  it('adds the zoning columns with expected types on both tables', () => {
    for (const [col, type] of [...PERMIT_COLS, ...COA_COLS]) {
      const re = new RegExp(`ADD COLUMN IF NOT EXISTS\\s+${col}\\s+${type.replace(/[()]/g, '\\$&')}`);
      expect(sql, `${col} ${type}`).toMatch(re);
    }
  });

  it('constrains zoning_dominant_parcel_method vocab via CHECK on both tables', () => {
    expect((sql.match(/CHECK \(zoning_dominant_parcel_method IN \('max_area'\)\)/g) || []).length).toBe(2);
  });

  it('drops base_zoning_class (CoA uses variance_context instead)', () => {
    expect(sql).not.toMatch(/ADD COLUMN IF NOT EXISTS\s+base_zoning_class/);
  });

  it('creates NO index (Rule 2 — partial/GIN ship out-of-band)', () => {
    expect(sql).not.toMatch(/CREATE INDEX/i);
  });

  it('has a commented-out (Rule 6) DROP COLUMN DOWN — no live destructive statement', () => {
    for (const line of sql.split('\n')) {
      if (/DROP COLUMN/.test(line)) expect(line.trimStart().startsWith('--'), line).toBe(true);
    }
  });
});

describe('manifest.json — dual-entry enrich-permits cascade', () => {
  it('registers both modes pointing to scripts/enrich-permits.js with env.ENRICH_TARGET', () => {
    expect(manifest.scripts.enrich_permits?.file).toBe('scripts/enrich-permits.js');
    expect(manifest.scripts.enrich_coa_zoning?.file).toBe('scripts/enrich-permits.js');
    expect(manifest.scripts.enrich_permits.env?.ENRICH_TARGET).toBe('permits');
    expect(manifest.scripts.enrich_coa_zoning.env?.ENRICH_TARGET).toBe('coa');
    expect(manifest.scripts.enrich_permits.telemetry_tables).toContain('permits');
    expect(manifest.scripts.enrich_coa_zoning.telemetry_tables).toContain('coa_applications');
  });

  it('inserts enrich_permits after link_parcels in the permits chain', () => {
    const c: string[] = manifest.chains.permits;
    expect(c).toContain('enrich_permits');
    expect(c.indexOf('enrich_permits')).toBe(c.indexOf('link_parcels') + 1);
  });

  it('inserts enrich_coa_zoning after link_coa_to_parcels in the coa chain', () => {
    const c: string[] = manifest.chains.coa;
    expect(c).toContain('enrich_coa_zoning');
    expect(c.indexOf('enrich_coa_zoning')).toBe(c.indexOf('link_coa_to_parcels') + 1);
  });
});

describe('_contracts.json — F-H12 thresholds (spike-calibrated)', () => {
  it('defines permits + coa coverage FAIL thresholds = 80', () => {
    expect(contracts.zoning.permits_zoning_class_coverage_fail).toBe(80);
    expect(contracts.zoning.coa_zoning_class_coverage_fail).toBe(80);
  });
});
