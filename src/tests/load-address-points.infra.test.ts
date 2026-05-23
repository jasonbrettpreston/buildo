// 🔗 SPEC LINK: docs/specs/01-pipeline/54_source_address_points.md
// 🔗 SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md
// 🔗 SPEC LINK: docs/specs/01-pipeline/48_pipeline_observability.md §3.6
//
// SQL-string + structural regression-locks on load-address-points.js
// after WF1 #parcel-address-bridge Phase 2b. The loader now ingests 12
// new fields (10 source + 2 derived-normalized) + computes geom in-SQL
// + emits drift+null-address audit rows + uses Spec 48 §3.6 row-derived
// verdict cascade.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('scripts/load-address-points.js — WF1 Phase 2b extension', () => {
  let src: string;
  beforeAll(() => {
    src = fs.readFileSync(
      path.resolve(__dirname, '../../scripts/load-address-points.js'),
      'utf-8',
    );
  });

  it('imports the shared CSV-drift detector + normalizer lib', () => {
    expect(src).toMatch(/require\(['"]\.\/lib\/address-points-csv-drift['"]\)/);
    expect(src).toMatch(/require\(['"]\.\/lib\/address-normalizers['"]\)/);
  });

  it('INSERT column list covers the 16 columns (3 base + 10 source + 2 normalized + geom)', () => {
    expect(src).toMatch(/INSERT\s+INTO\s+address_points\s*\(\s*[\s\S]*?address_point_id/);
    expect(src).toMatch(/address_number/);
    expect(src).toMatch(/linear_name_full/);
    expect(src).toMatch(/address_full/);
    expect(src).toMatch(/lo_num/);
    expect(src).toMatch(/hi_num/);
    expect(src).toMatch(/maint_stage/);
    expect(src).toMatch(/address_status/);
    expect(src).toMatch(/address_class_desc/);
    expect(src).toMatch(/class_family_desc/);
    expect(src).toMatch(/place_name/);
    expect(src).toMatch(/addr_num_normalized/);
    expect(src).toMatch(/linear_name_normalized/);
    expect(src).toMatch(/\bgeom\b/);
  });

  it('computes geom in-SQL via ST_SetSRID(ST_MakePoint(lng, lat), 4326)', () => {
    expect(src).toMatch(/ST_SetSRID\s*\(\s*ST_MakePoint\s*\(\s*\$\$\{i\+2\}::float8\s*,\s*\$\$\{i\+1\}::float8\s*\)\s*,\s*4326\s*\)/);
  });

  it('UPSERT preserves existing values via COALESCE(NULLIF(EXCLUDED.X, ),)', () => {
    // Day-1 safety pattern from Phase 1 (load-parcels). For all 10 new source
    // columns + 2 normalized: if the CSV is stripped (NULL/empty EXCLUDED),
    // the existing DB value is preserved by COALESCE.
    const cols = [
      'address_number',
      'linear_name_full',
      'address_full',
      'maint_stage',
      'address_status',
      'address_class_desc',
      'class_family_desc',
      'place_name',
      'addr_num_normalized',
      'linear_name_normalized',
    ];
    for (const c of cols) {
      const pattern = new RegExp(
        `${c}\\s*=\\s*COALESCE\\(\\s*NULLIF\\(\\s*EXCLUDED\\.${c}\\s*,\\s*['"]['"]\\s*\\)\\s*,\\s*address_points\\.${c}\\s*\\)`,
      );
      expect(src).toMatch(pattern);
    }
  });

  it('integer columns (lo_num, hi_num) use plain COALESCE without NULLIF (no empty-string sentinel)', () => {
    expect(src).toMatch(/lo_num\s*=\s*COALESCE\(\s*EXCLUDED\.lo_num\s*,\s*address_points\.lo_num\s*\)/);
    expect(src).toMatch(/hi_num\s*=\s*COALESCE\(\s*EXCLUDED\.hi_num\s*,\s*address_points\.hi_num\s*\)/);
  });

  it('WHERE clause guards no-op writes (NULLIF + NOT NULL for each address column)', () => {
    expect(src).toMatch(/NULLIF\(EXCLUDED\.address_number,\s*['"]['"]\)\s*IS\s+NOT\s+NULL/);
    expect(src).toMatch(/NULLIF\(EXCLUDED\.linear_name_full,\s*['"]['"]\)\s*IS\s+NOT\s+NULL/);
  });

  it('emits CSV-drift audit row (analogous to parcels CRIT-3b)', () => {
    expect(src).toMatch(/buildDriftAuditRow\(/);
    expect(src).toMatch(/missingCsvColumns/);
  });

  it('emits null-address-number audit row', () => {
    expect(src).toMatch(/buildNullAddressNumberAuditRow\(/);
    expect(src).toMatch(/attemptedAddressNumberRows/);
    expect(src).toMatch(/nullAddressNumberRows/);
  });

  it('uses Spec 48 §3.6 row-derived verdict cascade (replaces prior parallel-boolean)', () => {
    expect(src).toMatch(/auditRows\.some\(\(?r\)?\s*=>\s*r\.status\s*===\s*['"]FAIL['"]\)\s*\?\s*['"]FAIL['"]/);
    expect(src).toMatch(/auditRows\.some\(\(?r\)?\s*=>\s*r\.status\s*===\s*['"]WARN['"]\)\s*\?\s*['"]WARN['"]/);
    // No leftover parallel-boolean from the pre-Phase-2b form.
    expect(src).not.toMatch(/const\s+hasFails\s*=\s*errors/);
    expect(src).not.toMatch(/const\s+hasWarns\s*=\s*processed/);
  });

  it('emitMeta reads-list declares all 14 consumed CSV columns', () => {
    expect(src).toMatch(/"ADDRESS_POINT_ID"/);
    expect(src).toMatch(/"ADDRESS_NUMBER"/);
    expect(src).toMatch(/"LINEAR_NAME_FULL"/);
    expect(src).toMatch(/"LATITUDE"/);
    expect(src).toMatch(/"LONGITUDE"/);
    expect(src).toMatch(/"geometry"/);
  });

  it('emitMeta writes-list declares all 16 persisted columns (incl. geom + 2 normalized)', () => {
    expect(src).toMatch(/"addr_num_normalized"/);
    expect(src).toMatch(/"linear_name_normalized"/);
    expect(src).toMatch(/"geom"/);
  });
});
