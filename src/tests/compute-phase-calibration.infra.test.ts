// 🔗 SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §R1-R12
//             docs/specs/01-pipeline/84_lifecycle_phase_engine.md §7 (calibration source)
//             docs/specs/02-web-admin/86_control_panel.md §4 (chain step 21.5)
//
// SQL-shape regression-lock for scripts/compute-phase-calibration.js.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('scripts/compute-phase-calibration.js — Spec 47 §R1-R12 skeleton (WF1 #B 2026-05-09)', () => {
  let src: string;

  beforeAll(() => {
    src = fs.readFileSync(
      path.resolve(__dirname, '../../scripts/compute-phase-calibration.js'),
      'utf-8',
    );
  });

  it('uses pipeline.run wrapper with the canonical name', () => {
    expect(src).toMatch(/pipeline\.run\(\s*['"]compute-phase-calibration['"]/);
  });

  it('declares ADVISORY_LOCK_ID = 93 (registry-assigned — owning spec 84 already taken)', () => {
    // The Bundle G registry in pipeline-advisory-lock.infra.test.ts
    // enforces global uniqueness across all scripts. Owning spec 84
    // was claimed by classify-lifecycle-phase.js (the ledger writer);
    // 93 is the registry-assigned free ID for this consumer.
    expect(src).toMatch(/const\s+ADVISORY_LOCK_ID\s*=\s*93\b/);
  });

  it('captures RUN_AT via pipeline.getDbTimestamp (Spec 47 §R3.5)', () => {
    // RUN_AT must be captured once and parameterized into every timestamp
    // write — never inline NOW() inside an INSERT loop. Prevents recompute
    // runs spanning a midnight boundary from producing inconsistent
    // computed_at values across the table.
    expect(src).toMatch(/pipeline\.getDbTimestamp\(\s*pool\s*\)/);
    // The INSERT must parameterize computed_at, not call NOW() inline.
    const insertBlock = src.match(/INSERT\s+INTO\s+phase_stay_calibration[\s\S]*?VALUES\s*\([^)]+\)/i)?.[0] ?? '';
    expect(insertBlock, 'INSERT block not found').toBeTruthy();
    expect(insertBlock).not.toMatch(/\bNOW\s*\(\s*\)/i);
  });

  it('PERCENTILE_CONT results are ROUNDed before ::INTEGER cast (avoids truncation bias)', () => {
    // Postgres ::INTEGER truncates; without ROUND(), a true median of
    // 10.9 days becomes 10. Systematic downward bias on every metric.
    // Each of the three percentiles must be wrapped in ROUND().
    const percentileMatches = src.match(/ROUND\(\s*PERCENTILE_CONT/g);
    expect(percentileMatches?.length).toBe(3);
  });

  it('uses pipeline.withAdvisoryLock (Spec 47 §R6)', () => {
    expect(src).toMatch(/pipeline\.withAdvisoryLock\(\s*pool\s*,\s*ADVISORY_LOCK_ID/);
  });

  it('loads logicVars + validates via Zod (Spec 47 §R4)', () => {
    expect(src).toMatch(/loadMarketplaceConfigs\(/);
    expect(src).toMatch(/z\.object\(/);
    expect(src).toMatch(/calibration_freshness_warn_hours/);
  });

  it('reads from permit_phase_transitions (the ledger that powers calibration)', () => {
    expect(src).toMatch(/permit_phase_transitions/);
  });

  it('uses PERCENTILE_CONT for median + p25 + p75', () => {
    expect(src).toMatch(/PERCENTILE_CONT\(\s*0\.5/i);
    expect(src).toMatch(/PERCENTILE_CONT\(\s*0\.25/i);
    expect(src).toMatch(/PERCENTILE_CONT\(\s*0\.75/i);
  });

  it('uses LAG window function for phase duration computation', () => {
    expect(src).toMatch(/LAG\(\s*transitioned_at/i);
  });

  it('writes to phase_stay_calibration table via withTransaction (Spec 47 §R9 atomic write)', () => {
    expect(src).toMatch(/pipeline\.withTransaction\(/);
    expect(src).toMatch(/INSERT\s+INTO\s+phase_stay_calibration/i);
  });

  it('atomic DELETE+INSERT pattern — full table rebuild per run', () => {
    expect(src).toMatch(/DELETE\s+FROM\s+phase_stay_calibration/i);
  });

  it('emits PIPELINE_SUMMARY with audit_table (Spec 47 §R10)', () => {
    expect(src).toMatch(/pipeline\.emitSummary\(/);
    expect(src).toMatch(/audit_table\s*:/);
    expect(src).toMatch(/permit_types_calibrated/);
    expect(src).toMatch(/phases_calibrated/);
    expect(src).toMatch(/total_buckets/);
  });

  it('emits PIPELINE_META with reads + writes (Spec 47 §R11)', () => {
    expect(src).toMatch(/pipeline\.emitMeta\(/);
    // Reads: ledger
    const meta = src.split('pipeline.emitMeta(')[1] ?? '';
    expect(meta).toContain('permit_phase_transitions');
    // Writes: phase_stay_calibration
    expect(meta).toContain('phase_stay_calibration');
  });

  it('SPEC LINK header points to Spec 84 §7 (calibration source mandate)', () => {
    expect(src).toMatch(/SPEC LINK[\s\S]*?84_lifecycle_phase_engine/);
  });

  it('require.main === module guard so the script can be required from tests', () => {
    expect(src).toMatch(/require\.main\s*===\s*module/);
  });
});
