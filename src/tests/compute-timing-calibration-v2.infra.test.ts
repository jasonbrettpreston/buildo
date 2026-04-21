// SPEC LINK: docs/specs/product/future/86_control_panel.md
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

  it('rounds percentile results rather than truncating (H-W7 / 86-W3)', () => {
    // PERCENTILE_CONT returns a float8; bare ::int truncates toward zero
    // (10.9 → 10), producing systematic downward bias that compounds across
    // multi-phase prediction paths. The fix is `ROUND(PERCENTILE_CONT(...))::int`.
    //
    // Ratio-based assertion: every PERCENTILE_CONT call must be wrapped in
    // ROUND(...). Avoids hardcoding a site count so future additions/removals
    // don't break this test, only drift in the rounding pattern does.
    const allPercentile = content.match(/PERCENTILE_CONT\(/g) ?? [];
    const wrappedInRound = content.match(/ROUND\(\s*PERCENTILE_CONT\(/g) ?? [];
    expect(allPercentile.length, 'no PERCENTILE_CONT calls found — script shape changed').toBeGreaterThan(0);
    expect(
      wrappedInRound.length,
      'every PERCENTILE_CONT must be wrapped in ROUND(...) to avoid truncation bias',
    ).toBe(allPercentile.length);

    // Regression anchor: assert no bare `::int` directly on a PERCENTILE_CONT
    // result (i.e., no `...)::int` following the aggregate without an
    // intervening ROUND closing paren). If someone reintroduces truncation,
    // this fires.
    const bareTruncate = content.match(
      /PERCENTILE_CONT\([^)]+\) WITHIN GROUP \([^)]+\)::int/g,
    );
    expect(
      bareTruncate,
      'bare ::int cast on PERCENTILE_CONT result reintroduces truncation bias',
    ).toBeNull();
  });

  it('filters out same-phase pairs and negative gaps', () => {
    expect(content).toMatch(/from_phase <> to_phase/);
    expect(content).toMatch(/gap_days >= 0/);
  });

  it('loads calibration_min_sample_size from logicVars — no hardcoded HAVING threshold (spec 47 §4.1)', () => {
    // Hardcoded HAVING COUNT(*) >= 5 violates §4.1: business-logic thresholds
    // must come from DB logic_variables, not source code. Dynamic param replaces literal.
    expect(content).toMatch(/loadMarketplaceConfigs/);
    expect(content).toMatch(/calibration_min_sample_size/);
    expect(content).toMatch(/HAVING COUNT\(\*\) >= \$1/);
    expect(content).not.toMatch(/HAVING COUNT\(\*\) >= 5/);
  });

  it('filters backwards transitions via ordinal comparison (adversarial HIGH-3)', () => {
    // Rework/data-entry errors (e.g., P11→P10) produce nonsensical
    // calibration data. Only forward transitions should enter the table.
    expect(content).toMatch(/PHASE_ORDINAL_SQL/);
    expect(content).toMatch(/TO_ORDINAL_SQL.*>.*FROM_ORDINAL_SQL/);
  });

  it('delegates advisory lock 86 to pipeline.withAdvisoryLock — Phase 2 migration (spec 47 §5)', () => {
    // Phase 2: hand-rolled lockClient + SIGTERM boilerplate replaced with SDK helper.
    expect(content).toMatch(/const ADVISORY_LOCK_ID = 86/);
    expect(content).toMatch(/pipeline\.withAdvisoryLock\(pool,\s*ADVISORY_LOCK_ID/);
    // Must NOT hand-roll — any direct lock call bypasses the spec helper
    expect(content).not.toMatch(/pg_try_advisory_lock/);
    expect(content).not.toMatch(/pg_advisory_unlock/);
    // Must NOT install its own SIGTERM — helper handles it
    expect(content).not.toMatch(/process\.on\(\s*['"]SIGTERM['"]/);
  });

  it('replaces N+1 UPSERT loop with single multi-row VALUES inside withTransaction (WF3-03 / H-W2 / 86-W1)', () => {
    // Per-row UPSERT inside a for-loop = N round-trips per run + no atomic
    // crash recovery. Replaced with a single multi-row INSERT … VALUES (…),(…)
    // wrapped in pipeline.withTransaction.
    expect(content).toMatch(/pipeline\.withTransaction/);
    // Multi-row VALUES with parameterized placeholders (e.g. `$1, $2, $3, …`)
    expect(content).toMatch(/INSERT INTO phase_calibration[\s\S]*?VALUES\s+\$\{/);
    // Regression anchor: the per-row loop pattern is gone. The old code did
    // `for (const row of allRows) { await pool.query(`INSERT … VALUES ($1,…)`, [row.from_phase, …]); }`.
    expect(content).not.toMatch(
      /for \(const row of allRows\)[\s\S]{0,200}await pool\.query/,
    );
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

// ── WF3-10 spec 47 compliance tests (added as failing tests before fixes) ──

describe('scripts/compute-timing-calibration-v2.js — spec 47 compliance (WF3-10)', () => {
  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(
      path.resolve(__dirname, '../..', 'scripts/compute-timing-calibration-v2.js'),
      'utf-8',
    );
  });

  it('has correct SPEC LINKs pointing to chain + engine specs', () => {
    expect(content).toMatch(/SPEC LINK:.*41_chain_permits\.md/);
    expect(content).toMatch(/SPEC LINK:.*84_lifecycle_phase_engine\.md/);
    expect(content).toMatch(/SPEC LINK:.*85_trade_forecast_engine\.md/);
    expect(content).not.toMatch(/SPEC LINK:.*lifecycle_phase_implementation/);
  });

  it('handles lock-held path: checks lockResult.acquired and emits skip with audit_table (spec 47 §5)', () => {
    // Rich SKIP path (skipEmit:false): script emits custom summary with audit_table.
    expect(content).toMatch(/lockResult\.acquired/);
    expect(content).toMatch(/skipEmit\s*:\s*false/);
    expect(content).toMatch(/advisory_lock_held_elsewhere/);
  });

  it('includes a real audit_table in the main emitSummary — not omitted (spec 47 §8.2)', () => {
    expect(content).toMatch(/audit_table/);
    expect(content).toMatch(/phase_pairs_computed/);
    expect(content).toMatch(/negative_gap_count/);
  });

  it('includes audit_table in the lock-skipped early-return emitSummary (spec 47 §8.2)', () => {
    // Both call sites must have audit_table — the early-return skipped path included.
    const auditTableCount = (content.match(/audit_table/g) ?? []).length;
    expect(auditTableCount).toBeGreaterThanOrEqual(2);
  });

  it('captures RUN_AT from DB at startup — no inline NOW() in UPSERT values (spec 47 §14.1)', () => {
    // Accepts either the old inline pattern or the new SDK helper (pipeline.getDbTimestamp).
    expect(content).toMatch(/RUN_AT/);
    const hasInlineNow = /SELECT NOW\(\) AS now/.test(content);
    const hasSdkHelper = /pipeline\.getDbTimestamp\s*\(/.test(content);
    expect(hasInlineNow || hasSdkHelper,
      'Must capture RUN_AT via SELECT NOW() inline or pipeline.getDbTimestamp()'
    ).toBe(true);
    // NOW() must not appear inside a VALUES placeholder
    expect(content).not.toMatch(/vals\.push\(`[^`]*NOW\(\)/);
  });

  it('uses pipeline.maxRowsPerInsert(8) for CALIBRATION_BATCH_SIZE — not hardcoded 5000 (spec 47 §6.2)', () => {
    expect(content).toMatch(/maxRowsPerInsert\(8\)/);
    expect(content).not.toMatch(/const CALIBRATION_BATCH_SIZE = 5000/);
  });

  it('accumulates result.rowCount not chunk.length for upserted count (spec 47 §8.1)', () => {
    expect(content).toMatch(/result\.rowCount/);
    expect(content).not.toMatch(/upserted \+= chunk\.length/);
  });

  it('validates logicVars with Zod schema via validateLogicVars (spec 47 §4.2)', () => {
    expect(content).toMatch(/validateLogicVars/);
    expect(content).toMatch(/CALIB_SCHEMA/);
    expect(content).toMatch(/calibration_min_sample_size/);
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
      TRADE_TARGET_PHASE: Record<string, { bid_phase: string; work_phase: string }>;
    };
    const jsMap = jsLib.TRADE_TARGET_PHASE;
    for (const slug of EXPECTED_SLUGS) {
      const entry = jsMap[slug];
      expect(entry, `JS TRADE_TARGET_PHASE missing "${slug}"`).toBeDefined();
      // WF3: bimodal shape — both bid_phase and work_phase must exist
      expect(entry!.bid_phase, `JS ${slug} missing bid_phase`).toBeTruthy();
      expect(entry!.work_phase, `JS ${slug} missing work_phase`).toBeTruthy();
    }
    expect(Object.keys(jsMap).length).toBe(EXPECTED_SLUGS.length);

    // TS side
    const { TRADE_TARGET_PHASE: tsMap } = await import(
      '@/lib/classification/lifecycle-phase'
    );
    for (const slug of EXPECTED_SLUGS) {
      const tsEntry = tsMap[slug];
      const jsEntry = jsMap[slug];
      expect(tsEntry, `TS TRADE_TARGET_PHASE missing "${slug}"`).toBeDefined();
      // Dual code path parity: both phases must match
      expect(tsEntry!.bid_phase).toBe(jsEntry!.bid_phase);
      expect(tsEntry!.work_phase).toBe(jsEntry!.work_phase);
    }
    expect(Object.keys(tsMap).length).toBe(EXPECTED_SLUGS.length);
  });

  it('all target phases (bid + work) are in the VALID_PHASES set', async () => {
    const { TRADE_TARGET_PHASE, VALID_PHASES } = await import(
      '@/lib/classification/lifecycle-phase'
    );
    for (const [slug, target] of Object.entries(TRADE_TARGET_PHASE)) {
      expect(
        VALID_PHASES.has(target.bid_phase),
        `${slug} → bid_phase ${target.bid_phase} is not a valid phase`,
      ).toBe(true);
      expect(
        VALID_PHASES.has(target.work_phase),
        `${slug} → work_phase ${target.work_phase} is not a valid phase`,
      ).toBe(true);
    }
  });
});
