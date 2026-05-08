// SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §6.4
//             docs/specs/01-pipeline/44_chain_deep_scrapes.md §4 (Staleness)
//             docs/specs/02-web-admin/86_control_panel.md §1
//
// Regression lock: scripts/quality/assert-staleness.js must read all of its
// staleness thresholds from logicVars rather than hardcoding them:
//   - scrape_early_phase_threshold_pct (E6): % coverage below which stale = WARN not FAIL (legacy console label)
//   - scrape_stale_days                (E6): days before a scraped permit is stale
//   - staleness_max_stale_over_30d  (mig 121, WF3 2026-05-08): MAX number of permits stale >30d
//                                                              before verdict FAILs (was hardcoded `> 0`)
//   - staleness_min_coverage_pct    (mig 121, WF3 2026-05-08): coverage floor under which a WARN row is emitted
//   - staleness_max_days_stale      (mig 121, WF3 2026-05-08): single-permit stale ceiling above which WARN
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const SRC = fs.readFileSync(
  path.resolve(__dirname, '../../scripts/quality/assert-staleness.js'),
  'utf-8'
);
const SEED = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../scripts/seeds/logic_variables.json'), 'utf-8')
) as Record<string, { default: number; type: string; min?: number; max?: number }>;

describe('assert-staleness.js — scrape threshold externalization (§6.4)', () => {
  it('seed has scrape_early_phase_threshold_pct (default 5, bounds sane)', () => {
    const entry = SEED.scrape_early_phase_threshold_pct;
    if (!entry) throw new Error('scrape_early_phase_threshold_pct missing from seed JSON');
    expect(entry.default).toBe(5);
    expect(entry.type).toBe('number');
    expect(entry.min).toBeGreaterThan(0);
    expect(entry.max).toBeGreaterThan(entry.default);
  });

  it('seed has scrape_stale_days (default 30, bounds sane)', () => {
    const entry = SEED.scrape_stale_days;
    if (!entry) throw new Error('scrape_stale_days missing from seed JSON');
    expect(entry.default).toBe(30);
    expect(entry.type).toBe('number');
    expect(entry.min).toBeGreaterThan(0);
    expect(entry.max).toBeGreaterThan(entry.default);
  });

  it('reads both thresholds from logicVars — LOGIC_VARS_SCHEMA present', () => {
    expect(SRC).toMatch(/LOGIC_VARS_SCHEMA/);
    expect(SRC).toMatch(/logicVars\.scrape_early_phase_threshold_pct/);
    expect(SRC).toMatch(/logicVars\.scrape_stale_days/);
  });

  it('no hardcoded 0.05 coverage fraction', () => {
    expect(SRC).not.toMatch(/\)\s*<\s*0\.05/);
  });

  it('no hardcoded INTERVAL 30 days in SQL', () => {
    expect(SRC).not.toMatch(/INTERVAL '30 days'/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WF3 2026-05-08 — externalize the FAIL gate (mig 121).
// ─────────────────────────────────────────────────────────────────────────────

describe('assert-staleness.js — operator-tunable FAIL gate (mig 121, WF3 2026-05-08)', () => {
  it('seed has staleness_max_stale_over_30d (default 10000)', () => {
    const entry = SEED.staleness_max_stale_over_30d;
    if (!entry) throw new Error('staleness_max_stale_over_30d missing from seed JSON');
    expect(entry.default).toBe(10000);
    expect(entry.type).toBe('number');
    expect(entry.min).toBe(0);
    expect(entry.max).toBeGreaterThan(entry.default);
  });

  it('seed has staleness_min_coverage_pct (default 10)', () => {
    const entry = SEED.staleness_min_coverage_pct;
    if (!entry) throw new Error('staleness_min_coverage_pct missing from seed JSON');
    expect(entry.default).toBe(10);
    expect(entry.type).toBe('number');
    expect(entry.min).toBe(0);
    expect(entry.max).toBeLessThanOrEqual(100);
  });

  it('seed has staleness_max_days_stale (default 60)', () => {
    const entry = SEED.staleness_max_days_stale;
    if (!entry) throw new Error('staleness_max_days_stale missing from seed JSON');
    expect(entry.default).toBe(60);
    expect(entry.type).toBe('number');
    expect(entry.min).toBe(0);
    expect(entry.max).toBeGreaterThan(entry.default);
  });

  it('reads all 3 new thresholds from logicVars', () => {
    expect(SRC).toMatch(/logicVars\.staleness_max_stale_over_30d/);
    expect(SRC).toMatch(/logicVars\.staleness_min_coverage_pct/);
    expect(SRC).toMatch(/logicVars\.staleness_max_days_stale/);
  });

  it('Zod schema covers all 3 new keys (no shape drift on operator hotfix)', () => {
    // Each new key must appear inside the `LOGIC_VARS_SCHEMA = z.object({ … })`
    // block, otherwise validateLogicVars cannot reject malformed values at startup.
    const schemaBlock = SRC.match(/LOGIC_VARS_SCHEMA\s*=\s*z\.object\(\{[\s\S]*?\}\)\.passthrough\(\)/);
    expect(schemaBlock?.[0]).toBeTruthy();
    expect(schemaBlock![0]).toMatch(/staleness_max_stale_over_30d/);
    expect(schemaBlock![0]).toMatch(/staleness_min_coverage_pct/);
    expect(schemaBlock![0]).toMatch(/staleness_max_days_stale/);
  });

  it('no hardcoded `threshold: \'== 0\'` literal in audit_table rows (gate now carries the loaded value)', () => {
    // Per the plan-lock §10.2: the audit_table.threshold field must reflect
    // the loaded threshold so operators can see what gate the run was judged
    // against (e.g. `<= 10000`). The pre-fix code hardcoded `'== 0'` for
    // both WARN and FAIL rows; that literal is forbidden post-mig-121.
    expect(SRC).not.toMatch(/threshold:\s*['"]==\s*0['"]/);
  });

  it('no hardcoded `if (stale30d > 0)` gate (the gate is now loaded from logicVars)', () => {
    // The previous binary gate `if (stale30d > 0)` made the chain halt on any
    // non-zero stale count. Post-mig-121 the gate must reference the loaded
    // threshold variable name, not the literal 0.
    expect(SRC).not.toMatch(/if\s*\(\s*stale30d\s*>\s*0\s*\)/);
  });
});
