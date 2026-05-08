// SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §6.4
//             docs/specs/01-pipeline/84_lifecycle_phase_engine.md §3.4
//             docs/specs/02-web-admin/86_control_panel.md §1
//
// Regression lock: scripts/quality/assert-lifecycle-phase-distribution.js must read
// its thresholds + per-phase distribution bands from logicVars rather than hardcoding:
//   - lifecycle_unclassified_max (E12): hard FAIL limit for unclassified non-terminal permits
//   - lifecycle_band_<phase>_min/_max (WF2 2026-05-07): per-phase ±-tolerance bands
//   - lifecycle_cross_<dimension>_threshold (WF2 2026-05-07): Strangler Fig drift thresholds
//
// EXPECTED_BANDS used to be a hardcoded constant; promoted to logic_variables
// in migration 119 so operators can tune via the admin Control Panel without a
// redeploy.
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const SRC = fs.readFileSync(
  path.resolve(__dirname, '../../scripts/quality/assert-lifecycle-phase-distribution.js'),
  'utf-8'
);
const SEED = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../scripts/seeds/logic_variables.json'), 'utf-8')
) as Record<string, { default: number; type: string; min?: number; max?: number }>;

describe('assert-lifecycle-phase-distribution.js — unclassified threshold externalization (§6.4)', () => {
  it('seed has lifecycle_unclassified_max (default 100, bounds sane)', () => {
    const entry = SEED.lifecycle_unclassified_max;
    if (!entry) throw new Error('lifecycle_unclassified_max missing from seed JSON');
    expect(entry.default).toBe(100);
    expect(entry.type).toBe('number');
    expect(entry.min).toBeGreaterThanOrEqual(0);
    expect(entry.max).toBeGreaterThan(entry.default);
  });

  it('reads lifecycle_unclassified_max from logicVars — no hardcoded UNCLASSIFIED_MAX = 100', () => {
    expect(SRC).toMatch(/logicVars\.lifecycle_unclassified_max/);
    expect(SRC).not.toMatch(/UNCLASSIFIED_MAX\s*=\s*100/);
    expect(SRC).not.toMatch(/const UNCLASSIFIED_MAX/);
  });

  it('uses LOGIC_VARS_SCHEMA for validation', () => {
    expect(SRC).toMatch(/LOGIC_VARS_SCHEMA/);
    expect(SRC).toMatch(/loadMarketplaceConfigs/);
    expect(SRC).toMatch(/validateLogicVars/);
  });

  it('reads cross-status drift thresholds from logicVars — no hardcoded 1000/500', () => {
    // WF2 2026-05-07 — Spec 47 §R4 prohibits hardcoded thresholds.
    expect(SRC).toMatch(/logicVars\.lifecycle_cross_stalled_threshold/);
    expect(SRC).toMatch(/logicVars\.lifecycle_cross_active_inspection_threshold/);
    expect(SRC).toMatch(/logicVars\.lifecycle_cross_issued_threshold/);
    // Original threshold strings — confirm they no longer appear as numeric literals
    // inside the threshold string templates. (The string `< 1000 (WARN)` is what
    // the old hardcoded form rendered; matches none of the dynamically-built
    // `< ${stalledThreshold}` strings.)
    expect(SRC).not.toMatch(/threshold:\s*['"`]<\s*1000\s*\(WARN\)/);
    expect(SRC).not.toMatch(/threshold:\s*['"`]<\s*500\s*\(WARN\)/);
  });

  it('builds EXPECTED_BANDS dynamically from logicVars — no hardcoded literal map', () => {
    // The dynamic builder reads bands via lifecycle_band_<suffix>_min/_max.
    // A hardcoded literal map would have lines like `P3:  { min: 200, max: 400 }`
    // — assert that style of literal is NOT present.
    expect(SRC).toMatch(/lifecycle_band_\$\{suffix\}_min/);
    expect(SRC).toMatch(/lifecycle_band_\$\{suffix\}_max/);
    expect(SRC).not.toMatch(/P3:\s*\{\s*min:\s*\d+,\s*max:\s*\d+\s*\}/);
    expect(SRC).not.toMatch(/'P9-P17':\s*\{\s*min:\s*\d+,\s*max:\s*\d+\s*\}/);
  });

  it('seed has all 36 lifecycle_band_<phase>_<min|max> keys + 3 cross-status thresholds', () => {
    const expectedBandSuffixes = [
      'p3', 'p4', 'p5', 'p6',
      'p7a', 'p7b', 'p7c', 'p7d',
      'p8', 'p18', 'p19', 'p20',
      'p9_p17_agg',
      'o1', 'o2', 'o3',
      'coa_p1', 'coa_p2',
    ];
    for (const suffix of expectedBandSuffixes) {
      expect(SEED[`lifecycle_band_${suffix}_min`], `seed missing lifecycle_band_${suffix}_min`).toBeDefined();
      expect(SEED[`lifecycle_band_${suffix}_max`], `seed missing lifecycle_band_${suffix}_max`).toBeDefined();
    }
    expect(SEED.lifecycle_cross_stalled_threshold).toBeDefined();
    expect(SEED.lifecycle_cross_active_inspection_threshold).toBeDefined();
    expect(SEED.lifecycle_cross_issued_threshold).toBeDefined();
  });

  it('cross-check #1 (Stalled drift) handles NULL + case (WF3 2026-05-08)', () => {
    // Spec 84 §3.5 + Spec 47 §10.3 + Spec 85 §3.5 — silent-failure-mode hardening.
    //
    // Two silent-failure modes the original query had:
    //   1. `lifecycle_stalled = false` excludes NULL rows via SQL three-valued logic.
    //      Even though the column is currently NOT NULL (mig 085), this regression-locks
    //      the query against a future schema relaxation. Cross-checks #2/#3 already
    //      adopted the equivalent `OR ... IS NULL` shape; this aligns #1.
    //   2. `enriched_status = 'Stalled'` is case-sensitive. Mixed-case DB drift would
    //      silently miss rows. `LOWER(enriched_status)` is consistent with the existing
    //      CoA unclassified query at line ~195 (`lower(trim(...))`).
    //
    // Locate cross-check #1 — it's the single SELECT that joins `enriched_status` (any
    // case) and `lifecycle_stalled`. Use a multiline regex to pull the WHERE clause.
    const crossStalled = SRC.match(
      /SELECT[\s\S]*?lifecycle_stalled[\s\S]*?(?=`,)/i,
    );
    if (!crossStalled) throw new Error('cross-check #1 query block not found in source');
    const block = crossStalled[0];

    // Required: NULL-safe predicate on lifecycle_stalled.
    // Accept either `IS NOT TRUE` or an explicit `(... = false OR ... IS NULL)`.
    const hasNullSafePredicate =
      /lifecycle_stalled\s+IS\s+NOT\s+TRUE/i.test(block) ||
      /\blifecycle_stalled\s*=\s*false\s+OR\s+lifecycle_stalled\s+IS\s+NULL/i.test(block);
    expect(
      hasNullSafePredicate,
      'cross-check #1 must use `lifecycle_stalled IS NOT TRUE` (or equivalent NULL-safe form). ' +
        'Bare `= false` silently excludes NULL rows via SQL three-valued logic.',
    ).toBe(true);

    // Required: case-insensitive predicate on enriched_status (LOWER() or canonical-array).
    const hasCaseInsensitiveStatus =
      /LOWER\s*\(\s*enriched_status\s*\)\s*=\s*'stalled'/i.test(block) ||
      /LOWER\s*\(\s*enriched_status\s*\)\s*IN\s*\(/i.test(block);
    expect(
      hasCaseInsensitiveStatus,
      'cross-check #1 must compare `LOWER(enriched_status)` against a lowercase literal. ' +
        'Bare `enriched_status = \'Stalled\'` silently misses mixed-case rows.',
    ).toBe(true);

    // Negative regression-lock — the old shape MUST NOT reappear.
    expect(block).not.toMatch(/lifecycle_stalled\s*=\s*false(?!\s+OR)/i);
    expect(block).not.toMatch(/enriched_status\s*=\s*'Stalled'/);
  });

  it('cross-checks #2 and #3 also use case-insensitive enriched_status (WF3 2026-05-08 sibling concern)', () => {
    // Same case-sensitivity gap as #1 — extending the fix to the whole class
    // per WF3 protocol Pre-Review Self-Checklist ("fixed the symptom, missed
    // the class" antipattern).
    expect(SRC).toMatch(/LOWER\s*\(\s*enriched_status\s*\)\s*=\s*'active inspection'/i);
    expect(SRC).toMatch(/LOWER\s*\(\s*enriched_status\s*\)\s*=\s*'permit issued'/i);
    // Negative regression-lock — scoped to SQL `WHERE` context to avoid matching
    // error-message templates (which legitimately contain the literal phrase).
    expect(SRC).not.toMatch(/WHERE\s+enriched_status\s*=\s*'Active Inspection'/);
    expect(SRC).not.toMatch(/WHERE\s+enriched_status\s*=\s*'Permit Issued'/);
  });
});
