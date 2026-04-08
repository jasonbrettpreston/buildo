// 🔗 SPEC LINK: docs/specs/product/future/71_lead_timing_engine.md §Implementation
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('scripts/compute-timing-calibration.js — file shape', () => {
  let content: string;

  beforeAll(() => {
    content = fs.readFileSync(
      path.resolve(__dirname, '../../scripts/compute-timing-calibration.js'),
      'utf-8',
    );
  });

  it('uses pipeline.run wrapper with correct name', () => {
    expect(content).toMatch(/pipeline\.run\(\s*['"]compute-timing-calibration['"]/);
  });

  it('computes all three percentiles via PERCENTILE_CONT', () => {
    expect(content).toMatch(/PERCENTILE_CONT\(0\.25\)/);
    expect(content).toMatch(/PERCENTILE_CONT\(0\.50\)/);
    expect(content).toMatch(/PERCENTILE_CONT\(0\.75\)/);
  });

  it('uses WITHIN GROUP ORDER BY for percentiles', () => {
    expect(content).toMatch(/WITHIN GROUP \(ORDER BY days_to_first\)/);
  });

  it('batches UPSERT via pipeline.withTransaction', () => {
    expect(content).toMatch(/pipeline\.withTransaction\(/);
  });

  it('uses ON CONFLICT (permit_type) DO UPDATE for idempotency', () => {
    expect(content).toMatch(/ON CONFLICT \(permit_type\) DO UPDATE/);
  });

  it('references source and target tables', () => {
    expect(content).toMatch(/\bpermits\b/);
    expect(content).toMatch(/\bpermit_inspections\b/);
    expect(content).toMatch(/\btiming_calibration\b/);
  });

  it('filters outlier deltas via BETWEEN 0 AND 730', () => {
    expect(content).toMatch(/BETWEEN 0 AND 730/);
  });

  it('excludes tiny samples via HAVING COUNT >= 5', () => {
    expect(content).toMatch(/HAVING COUNT\(\*\) >= 5/);
  });

  it('emits PIPELINE_SUMMARY with records counts', () => {
    expect(content).toMatch(/pipeline\.emitSummary\(/);
    expect(content).toMatch(/records_total/);
  });

  it('emits PIPELINE_META with reads and writes maps', () => {
    expect(content).toMatch(/pipeline\.emitMeta\(/);
  });

  it('logs errors via pipeline.log.error (not bare console.error)', () => {
    expect(content).toMatch(/pipeline\.log\.error\(/);
  });
});
