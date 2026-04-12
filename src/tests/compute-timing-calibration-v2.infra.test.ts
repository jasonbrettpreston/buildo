// 🔗 SPEC LINK: docs/reports/lifecycle_phase_implementation.md (Phase 3)
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '../..');
const read = (rel: string) =>
  fs.readFileSync(path.resolve(repoRoot, rel), 'utf-8');

describe('scripts/compute-timing-calibration-v2.js — script shape', () => {
  let content: string;
  beforeAll(() => {
    content = read('scripts/compute-timing-calibration-v2.js');
  });

  it('uses pipeline.run wrapper', () => {
    expect(content).toMatch(
      /pipeline\.run\(\s*['"]compute-timing-calibration-v2['"]/,
    );
  });

  it('imports mapInspectionStageToPhase from shared lib', () => {
    expect(content).toMatch(/mapInspectionStageToPhase/);
  });

  it('builds a SQL CASE that mirrors mapInspectionStageToPhase', () => {
    // The SQL CASE must contain the same patterns as the JS function
    expect(content).toMatch(/STAGE_TO_PHASE_SQL/);
    expect(content).toMatch(/LIKE '%excavation%'/);
    expect(content).toMatch(/THEN 'P9'/);
    expect(content).toMatch(/LIKE '%footings%'/);
    expect(content).toMatch(/THEN 'P10'/);
    expect(content).toMatch(/LIKE '%structural framing%'/);
    expect(content).toMatch(/THEN 'P11'/);
    expect(content).toMatch(/LIKE '%insulation%'/);
    expect(content).toMatch(/THEN 'P13'/);
  });

  it('uses LAG window function for consecutive stage pairing', () => {
    expect(content).toMatch(/LAG\(i\.stage_name\) OVER/);
    expect(content).toMatch(/LAG\(i\.inspection_date\) OVER/);
  });

  it('computes percentiles (median, p25, p75)', () => {
    expect(content).toMatch(/PERCENTILE_CONT\(0\.5\)/);
    expect(content).toMatch(/PERCENTILE_CONT\(0\.25\)/);
    expect(content).toMatch(/PERCENTILE_CONT\(0\.75\)/);
  });

  it('filters out same-phase pairs and negative gaps', () => {
    expect(content).toMatch(/from_phase <> to_phase/);
    expect(content).toMatch(/gap_days >= 0/);
  });

  it('enforces minimum sample size of 5', () => {
    expect(content).toMatch(/HAVING COUNT\(\*\) >= 5/);
  });

  it('filters backwards transitions via ordinal comparison (adversarial HIGH-3)', () => {
    // Rework/data-entry errors (e.g., P11→P10) produce nonsensical
    // calibration data. Only forward transitions should enter the table.
    expect(content).toMatch(/PHASE_ORDINAL_SQL/);
    expect(content).toMatch(/TO_ORDINAL_SQL.*>.*FROM_ORDINAL_SQL/);
  });

  it('computes ISSUED → first-phase calibration', () => {
    expect(content).toMatch(/'ISSUED' AS from_phase/);
    expect(content).toMatch(/DISTINCT ON \(i\.permit_num\)/);
  });

  it('upserts into phase_calibration using the COALESCE unique index', () => {
    expect(content).toMatch(/INSERT INTO phase_calibration/);
    expect(content).toMatch(
      /ON CONFLICT \(from_phase, to_phase, COALESCE\(permit_type, '__ALL__'\)\)/,
    );
    expect(content).toMatch(/DO UPDATE SET/);
  });

  it('emits PIPELINE_SUMMARY and PIPELINE_META', () => {
    expect(content).toMatch(/pipeline\.emitSummary/);
    expect(content).toMatch(/pipeline\.emitMeta/);
    expect(content).toMatch(/phase_calibration/);
  });
});

describe('TRADE_TARGET_PHASE — shared trade→phase mapping', () => {
  it('JS and TS versions cover all 32 trade slugs', async () => {
    // The 32 trade slugs from CLAUDE.md
    const EXPECTED_SLUGS = [
      'excavation', 'shoring', 'concrete', 'structural-steel', 'framing',
      'masonry', 'roofing', 'plumbing', 'hvac', 'electrical',
      'fire-protection', 'insulation', 'drywall', 'painting', 'flooring',
      'glazing', 'elevator', 'demolition', 'landscaping', 'waterproofing',
      'trim-work', 'millwork-cabinetry', 'tiling', 'stone-countertops',
      'decking-fences', 'eavestrough-siding', 'pool-installation', 'solar',
      'security', 'temporary-fencing', 'caulking', 'drain-plumbing',
    ];

    // JS side — dynamic import to avoid ESLint no-require-imports
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const jsLib = require('../../scripts/lib/lifecycle-phase') as {
      TRADE_TARGET_PHASE: Record<string, string>;
    };
    const jsMap = jsLib.TRADE_TARGET_PHASE;
    for (const slug of EXPECTED_SLUGS) {
      expect(jsMap[slug], `JS TRADE_TARGET_PHASE missing "${slug}"`).toBeDefined();
    }
    expect(Object.keys(jsMap).length).toBe(EXPECTED_SLUGS.length);

    // TS side
    const { TRADE_TARGET_PHASE: tsMap } = await import(
      '@/lib/classification/lifecycle-phase'
    );
    for (const slug of EXPECTED_SLUGS) {
      expect(tsMap[slug], `TS TRADE_TARGET_PHASE missing "${slug}"`).toBeDefined();
      expect(tsMap[slug]).toBe(jsMap[slug]); // dual code path parity
    }
    expect(Object.keys(tsMap).length).toBe(EXPECTED_SLUGS.length);
  });

  it('all target phases are in the VALID_PHASES set', async () => {
    const { TRADE_TARGET_PHASE, VALID_PHASES } = await import(
      '@/lib/classification/lifecycle-phase'
    );
    for (const [slug, phase] of Object.entries(TRADE_TARGET_PHASE)) {
      expect(
        VALID_PHASES.has(phase),
        `${slug} → ${phase} is not a valid lifecycle phase`,
      ).toBe(true);
    }
  });
});
