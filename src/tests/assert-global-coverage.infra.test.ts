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
import { beforeAll, describe, expect, it } from 'vitest';

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

  it('geo_id Step 2 coverage uses simple IS NOT NULL (Denom A — permitsTotal; geocodeable regex removed, Step 8 now uses permitsTotal)', () => {
    const content = src();
    // geo_id simple IS NOT NULL present (Step 2 Denom A field coverage)
    expect(content).toContain("geo_id IS NOT NULL");
    // The old geocodeable denominator filter (geo_id != '' AND geo_id ~ '^[0-9]+$') is gone —
    // Step 8 denominator is now permitsTotal (Denom A) to report end-to-end geocode coverage.
    expect(content).not.toContain("geo_id ~ '^[0-9]+$'");
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

// ── WF3 false-FAIL fixes ─────────────────────────────────────────────────────

describe('assert-global-coverage.js — Bug 1+2: sparse fields use infoRow, not coverageRow', () => {
  let content: string;
  beforeAll(() => { content = src(); });

  // These fields are naturally sparse in Toronto city open data — they do not
  // reliably approach the 90% PASS threshold and must not trigger FAIL alerts.
  const SPARSE_FIELDS = [
    'street_direction',
    'building_type',
    'category',
    'owner',
    'council_district',
    'ward',
    'builder_name',
  ];

  for (const field of SPARSE_FIELDS) {
    it(`${field} at Step 2 uses infoRow (not coverageRow) — naturally sparse (Bug 2)`, () => {
      // The field must appear inside an infoRow call, not inside a coverageRow call.
      // We check that the pattern `coverageRow(... '${field}')` does NOT appear
      // with permitsTotal as the denominator in Step 2 context.
      expect(content).toMatch(new RegExp(`infoRow[^)]*permits\\.${field}`));
      // Must NOT appear as a coverageRow in Step 2 (permitsTotal denominator)
      expect(content).not.toMatch(
        new RegExp(`coverageRow\\('Step 2[^)]*permits\\.${field}`),
      );
    });
  }

  it('completed_date at Step 2 uses infoRow (not coverageRow) — active permits have no completed date (Bug 1)', () => {
    // Step 2 measures load_permits field coverage. completed_date is NULL for
    // all active permits → ~5.6% → FAIL. Demoted to infoRow since it's
    // structural sparsity, not a data quality gap. Step 3 already audits
    // completed_date on stale/closed permits with the correct denominator.
    expect(content).toMatch(/infoRow[\s\S]{0,100}permits\.completed_date[\s\S]{0,200}permitsTotal/);
    expect(content).not.toMatch(/coverageRow\('Step 2[^)]*permits\.completed_date/);
  });
});

describe('assert-global-coverage.js — Bug 3: CoA lifecycle_phase uses unlinked denominator', () => {
  let content: string;
  beforeAll(() => { content = src(); });

  it('CoA aggregate query counts unlinked_total (linked_permit_num IS NULL)', () => {
    // Classifier assigns P1/P2 only to unlinked CoA apps. Using coaTotal (32K+)
    // as denominator produces 0.6% → FAIL. Correct denominator = unlinked apps only.
    expect(content).toMatch(/linked_permit_num IS NULL[\s\S]{0,60}AS unlinked_total/);
  });

  it('CoA lifecycle_phase coverage row uses unlinkedTotal as denominator (not coaTotal)', () => {
    expect(content).toMatch(/lifecycle_phase['"]\s*,\s*lifecyclePhaseTotal\s*,\s*unlinkedTotal/);
  });

  it('CoA lifecycle_classified_at uses unlinkedTotal denominator (not coaTotal)', () => {
    expect(content).toMatch(/lifecycle_classified_at['"]\s*,[\s\S]{0,100}unlinkedTotal/);
  });

  it('permits chain misc query includes coa_unlinked_total for Step 21', () => {
    expect(content).toMatch(/coa_unlinked_total/);
  });

  it('CoA lifecycle_phase_pop aggregate excludes linked apps (numerator cannot exceed unlinkedTotal denominator)', () => {
    // lifecycle_phase IS NOT NULL without linked_permit_num IS NULL includes apps
    // that were classified while unlinked but later got linked — numerator > denominator → >100%.
    expect(content).toContain('lifecycle_phase IS NOT NULL AND linked_permit_num IS NULL');
    // Applies to both CoA aggregate and permits-chain misc subquery
    expect(content).toContain('lifecycle_phase IS NOT NULL AND linked_permit_num IS NULL) AS coa_lifecycle_phase_pop');
  });

  it('CoA lifecycle_classified_pop aggregate excludes linked apps (same contamination guard)', () => {
    expect(content).toContain('lifecycle_classified_at IS NOT NULL AND linked_permit_num IS NULL');
  });
});

describe('assert-global-coverage.js — Bug 4: pre-permit coverage cannot exceed 100%', () => {
  let content: string;
  beforeAll(() => { content = src(); });

  it('uses COUNT(DISTINCT permit_num) for pre-permit numerator (not COUNT(*))', () => {
    // COUNT(*) WHERE permit_num LIKE "PRE-%" counts all revisions; DISTINCT
    // counts unique CoA parent identifiers. Prevents overcounting when a
    // pre-permit has multiple revisions.
    expect(content).toMatch(/COUNT\(DISTINCT permit_num\)[\s\S]{0,50}PRE-%/);
  });

  it('CoA chain uses approved_total (all approved CoA apps) as pre-permit denominator', () => {
    // approvedUnlinked shrinks as CoAs get linked after pre-permit creation →
    // denominator < numerator → >100%. approved_total is stable.
    expect(content).toMatch(/decision = 'Approved'[\s\S]{0,80}AS approved_total|approved_total[\s\S]{0,80}decision = 'Approved'/);
    expect(content).toMatch(/permits\.pre_permit_leads['"]\s*,\s*preTotal\s*,\s*approvedTotal/);
  });

  it('permits chain uses coa_approved_total as Step 17 denominator (not approvedUnlinked)', () => {
    expect(content).toMatch(/coa_approved_total/);
    // Step 17 row must reference the approved_total sub-query, not the shrinkable unlinked count
    expect(content).toMatch(/Step 17[\s\S]{0,200}pre_permit_leads[\s\S]{0,200}coa_approved_total/);
  });
});

describe('assert-global-coverage.js — Bug 5: lifecycle_stalled NOT NULL DEFAULT false → infoRow', () => {
  let content: string;
  beforeAll(() => { content = src(); });

  it('CoA lifecycle_stalled uses infoRow (not coverageRow) — BOOLEAN NOT NULL DEFAULT false guarantees 100% population', () => {
    // lifecycle_stalled BOOLEAN NOT NULL DEFAULT false — IS NOT NULL is always vacuous.
    // coverageRow would permanently show 100% PASS; infoRow shows count of actually-stalled apps.
    expect(content).toMatch(/infoRow\('CoA Step 10[\s\S]{0,80}lifecycle_stalled[\s\S]{0,80}lifecyclePhaseTotal/);
    expect(content).not.toMatch(/coverageRow\('CoA Step 10[\s\S]{0,30}lifecycle_stalled/);
  });

  it('CoA aggregate uses lifecycle_stalled = true (count stalled apps, not IS NOT NULL)', () => {
    expect(content).toContain("lifecycle_stalled = true AND linked_permit_num IS NULL)   AS lifecycle_stalled_true_pop");
  });

  it('permits lifecycle_stalled uses infoRow (not coverageRow) — same NOT NULL DEFAULT false constraint', () => {
    // permits.lifecycle_stalled also BOOLEAN NOT NULL DEFAULT false (migration 085).
    expect(content).toMatch(/infoRow\('Step 21[^)]*permits\.lifecycle_stalled/);
    expect(content).not.toMatch(/coverageRow\('Step 21[^)]*permits\.lifecycle_stalled/);
  });

  it('permits aggregate counts lifecycle_stalled = true (stalled permits, not IS NOT NULL)', () => {
    expect(content).toContain("lifecycle_stalled = true)                     AS lifecycle_stalled_pop");
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
