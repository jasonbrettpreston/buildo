// 🔗 SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md (WF2 P6.5 chain honesty)
//             docs/specs/01-pipeline/66_zoning_enrichment.md §3a (sparse-by-design)
//             docs/specs/01-pipeline/30_pipeline_architecture.md §2.1 (Mutator headline)
//
// WF2 P6.5 regression-lock for scripts/enrich-permits.js:
//   - bylaw_max_fsi / bylaw_max_coverage null-rates WARN above per-target floors
//     (structural nulls — never FAIL); height stays INFO.
//   - Mutator headline honesty: records_total = result.scoped (not null).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.resolve(__dirname, '../../scripts/enrich-permits.js'),
  'utf-8',
);
const SEED = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../scripts/seeds/logic_variables.json'), 'utf-8'),
) as Record<string, { default: number; min?: number; max?: number }>;

describe('enrich-permits.js — WF2 P6.5 bylaw null-rate WARN floors', () => {
  it('reads per-target bylaw null WARN floors (permits + coa keys)', () => {
    expect(SRC).toMatch(/permits_bylaw_max_fsi_null_warn_pct/);
    expect(SRC).toMatch(/permits_bylaw_max_coverage_null_warn_pct/);
    expect(SRC).toMatch(/coa_bylaw_max_fsi_null_warn_pct/);
    expect(SRC).toMatch(/coa_bylaw_max_coverage_null_warn_pct/);
  });

  it('fsi + coverage rows escalate to WARN above the floor (never FAIL); null denom → INFO', () => {
    // nullFloorStatus: null → INFO; value > floor → WARN; else INFO. No FAIL branch.
    expect(SRC).toMatch(/value === null \? 'INFO' : value > floor \? 'WARN' : 'INFO'/);
    expect(SRC).toMatch(/bylaw_max_fsi_null_pct[\s\S]{0,120}nullFloorStatus\(nr\.fsi/);
    expect(SRC).toMatch(/bylaw_max_coverage_pct_null_pct[\s\S]{0,120}nullFloorStatus\(nr\.cov/);
  });

  it('height null-rate stays INFO (no floor)', () => {
    expect(SRC).toMatch(/bylaw_max_height_m_null_pct[\s\S]{0,80}status: 'INFO'/);
  });

  for (const [key, expected] of [
    ['permits_bylaw_max_fsi_null_warn_pct', 88],
    ['permits_bylaw_max_coverage_null_warn_pct', 72],
    ['coa_bylaw_max_fsi_null_warn_pct', 97],
    ['coa_bylaw_max_coverage_null_warn_pct', 66],
  ] as const) {
    it(`seed ${key} present (default ${expected}, 0..100 bounds)`, () => {
      expect(SEED).toHaveProperty(key);
      const entry = SEED[key];
      if (!entry) throw new Error(`${key} missing from seed JSON`);
      expect(entry.default).toBe(expected);
      expect(entry.min).toBe(0);
      expect(entry.max).toBe(100);
    });
  }
});

describe('enrich-permits.js — WF2 P6.5 Mutator headline honesty (Spec 30 §2.1)', () => {
  it('records_total = result.scoped (not null — Mutators may not null counters)', () => {
    expect(SRC).toMatch(/records_total:\s*result\.scoped,\s*records_new:\s*0,\s*records_updated:\s*result\.updated/);
    expect(SRC).not.toMatch(/records_total:\s*null,\s*records_new:\s*null,\s*records_updated:\s*result\.updated/);
  });
});
