// SPEC LINK: docs/specs/pipeline/49_data_completeness_profiling.md
//
// Infra tests for assert-global-coverage.js:
//   (a) Denominator enforcement — assert SQL contains the exact gate conditions
//       mirrored from each source script's WHERE clause
//   (b) Payload shape — audit_table has `columns`, all rows have required keys,
//       records_total = 1
//   (c) Chain count — permits chain = 27 steps, coa chain = 12 steps
//   (d) Advisory lock ID = 111

import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'quality', 'assert-global-coverage.js');
const MANIFEST_PATH = path.join(REPO_ROOT, 'scripts', 'manifest.json');
const CHAIN_PERMITS_SPEC = path.join(REPO_ROOT, 'docs', 'specs', 'pipeline', '41_chain_permits.md');
const CHAIN_COA_SPEC = path.join(REPO_ROOT, 'docs', 'specs', 'pipeline', '42_chain_coa.md');

function src(): string {
  return fs.readFileSync(SCRIPT_PATH, 'utf8');
}

describe('assert-global-coverage.js — file existence', () => {
  it('script file exists', () => {
    expect(fs.existsSync(SCRIPT_PATH)).toBe(true);
  });
});

describe('assert-global-coverage.js — advisory lock', () => {
  it('uses ADVISORY_LOCK_ID = 111', () => {
    expect(src()).toContain('ADVISORY_LOCK_ID = 111');
  });

  it('calls pipeline.withAdvisoryLock', () => {
    expect(src()).toMatch(/pipeline\.withAdvisoryLock/);
  });
});

describe('assert-global-coverage.js — records_total contract', () => {
  it('emits records_total: 1 (never a DB entity count)', () => {
    expect(src()).toContain('records_total: 1');
  });

  it('does not set records_total to a variable', () => {
    const content = src();
    // records_total must always be the literal 1, not a computed value
    expect(content).not.toMatch(/records_total:\s*[a-zA-Z_][a-zA-Z0-9_]*/);
  });
});

describe('assert-global-coverage.js — columnar audit_table shape', () => {
  it('audit_table has a columns array', () => {
    expect(src()).toContain('columns:');
  });

  it('columns array contains all 6 required keys', () => {
    const content = src();
    expect(content).toContain('step_target');
    expect(content).toContain('field');
    expect(content).toContain('populated');
    expect(content).toContain('denominator');
    expect(content).toContain('coverage_pct');
    expect(content).toContain('status');
  });

  it('verdict is computed as worst non-INFO status', () => {
    expect(src()).toMatch(/verdict/);
  });
});

describe('assert-global-coverage.js — denominator gates (source-script mirroring)', () => {
  it('excludes PRE-% synthetic permits from all real-permit denominators', () => {
    expect(src()).toContain("NOT LIKE 'PRE-%'");
  });

  it('geocode denominator gates on geo_id IS NOT NULL AND geo_id != empty string AND numeric regex (mirrors geocode-permits.js)', () => {
    const content = src();
    expect(content).toContain("geo_id IS NOT NULL");
    expect(content).toContain("geo_id != ''");
    expect(content).toContain("geo_id ~ '^[0-9]+$'");
  });

  it('massing denominator uses parcel centroid_lat/centroid_lng (mirrors link-massing.js: processes parcels not permits)', () => {
    const content = src();
    expect(content).toContain('centroid_lat IS NOT NULL');
    expect(content).toContain('centroid_lng IS NOT NULL');
  });

  it('trade_forecasts denominator includes is_active = true join (mirrors compute-trade-forecasts.js SOURCE_SQL)', () => {
    expect(src()).toContain('is_active = true');
  });

  it('trade_forecasts denominator excludes SKIP_PHASES exactly (mirrors compute-trade-forecasts.js)', () => {
    // SKIP_PHASES_SQL constant must contain all 7 phases exactly as in compute-trade-forecasts.js
    expect(src()).toContain("('P19','P20','O1','O2','O3','P1','P2')");
    // Must be referenced in SQL as a NOT IN gate
    expect(src()).toMatch(/NOT IN.*SKIP_PHASES|lifecycle_phase NOT IN/);
  });

  it('trade_forecasts denominator requires lifecycle_phase IS NOT NULL (mirrors compute-trade-forecasts.js SOURCE_SQL)', () => {
    expect(src()).toMatch(/lifecycle_phase IS NOT NULL/);
  });

  it('trade_forecasts denominator requires phase_started_at IS NOT NULL (mirrors compute-trade-forecasts.js SOURCE_SQL)', () => {
    expect(src()).toMatch(/phase_started_at IS NOT NULL/);
  });

  it('opportunity_score denominator filters urgency IS NULL OR urgency != expired (mirrors compute-opportunity-scores.js WHERE clause)', () => {
    const content = src();
    expect(content).toContain("urgency IS NULL OR urgency <> 'expired'");
  });
});

describe('assert-global-coverage.js — chain-aware behavior', () => {
  it('reads PIPELINE_CHAIN env variable', () => {
    expect(src()).toContain('PIPELINE_CHAIN');
  });

  it('has permits branch (full profile)', () => {
    expect(src()).toMatch(/permits/);
  });

  it('has coa branch (scoped subset)', () => {
    expect(src()).toContain('coa');
  });
});

describe('assert-global-coverage.js — logic_variables Zod validation', () => {
  it('validates profiling_coverage_pass_pct', () => {
    expect(src()).toContain('profiling_coverage_pass_pct');
  });

  it('validates profiling_coverage_warn_pct', () => {
    expect(src()).toContain('profiling_coverage_warn_pct');
  });

  it('uses z.number().int() constraint (not just z.number())', () => {
    expect(src()).toContain('.int()');
  });
});

describe('manifest.json — chain wiring', () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));

  it('assert_global_coverage registered in scripts', () => {
    expect(manifest.scripts).toHaveProperty('assert_global_coverage');
    expect(manifest.scripts.assert_global_coverage.file).toBe(
      'scripts/quality/assert-global-coverage.js',
    );
  });

  it('assert_global_coverage is last step in permits chain (step 27)', () => {
    const permitsChain: string[] = manifest.chains.permits;
    expect(permitsChain[permitsChain.length - 1]).toBe('assert_global_coverage');
    expect(permitsChain).toHaveLength(27);
  });

  it('assert_global_coverage is last step in coa chain (step 12)', () => {
    const coaChain: string[] = manifest.chains.coa;
    expect(coaChain[coaChain.length - 1]).toBe('assert_global_coverage');
    expect(coaChain).toHaveLength(12);
  });

  it('assert_global_coverage comes after assert_entity_tracing in permits chain', () => {
    const permitsChain: string[] = manifest.chains.permits;
    const entityIdx = permitsChain.indexOf('assert_entity_tracing');
    const globalIdx = permitsChain.indexOf('assert_global_coverage');
    expect(entityIdx).toBeGreaterThan(-1);
    expect(globalIdx).toBe(entityIdx + 1);
  });

  it('assert_global_coverage comes after assert_lifecycle_phase_distribution in coa chain', () => {
    const coaChain: string[] = manifest.chains.coa;
    const distIdx = coaChain.indexOf('assert_lifecycle_phase_distribution');
    const globalIdx = coaChain.indexOf('assert_global_coverage');
    expect(distIdx).toBeGreaterThan(-1);
    expect(globalIdx).toBe(distIdx + 1);
  });
});

describe('chain specs — step counts updated', () => {
  it('41_chain_permits.md declares 27 steps', () => {
    const content = fs.readFileSync(CHAIN_PERMITS_SPEC, 'utf8');
    expect(content).toContain('27 (sequential');
  });

  it('42_chain_coa.md declares 12 steps', () => {
    const content = fs.readFileSync(CHAIN_COA_SPEC, 'utf8');
    expect(content).toContain('12 (sequential');
  });
});
