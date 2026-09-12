// SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §6.4
//
// Regression lock: scripts/quality/assert-data-bounds.js must read its
// data-quality thresholds from logicVars rather than hardcoding them:
//   - cost_outlier_ceiling_cad (E7): $500M outlier ceiling
//   - desc_null_rate_warn_pct  (E8): description null-rate SLA
//   - builder_null_rate_warn_pct (E8): builder null-rate SLA
//   - cost_est_null_rate_warn_pct (E9): cost_estimates null-rate SLA
//   - cost_est_min_tiers (E9): minimum distinct cost tiers
//   - calibration_freshness_warn_hours (E10): timing_calibration staleness SLA
//
// ── Batch1 I2 commit 6 (2026-09-12) — BEHAVIOUR vs SKELETON classification ──
// Fold A item 1 (`.cursor/batch1_i2_assert_data_bounds_active_task.md`): this
// pre-existing file is KEPT, not deleted, following the sole measured precedent
// `src/tests/link-wsib.infra.test.ts` (which coexists with
// `src/tests/steps/link_wsib/violations.test.ts`) and `assert-global-coverage.
// infra.test.ts`'s own I1 precedent — not deleted, not silently migrated. Of
// the 18 `expect(SRC)` source-text assertions in this file (all reading
// `SRC` — this STEP file's own text), each is classified:
//
//   BEHAVIOUR (15) — domain thresholds this conversion PRESERVES IN COMPUTE
//   (Spec 122 §5.5). At commit 7, once `scripts/lib/compute/assert-data-
//   bounds.js` exists, these assertions REPOINT to a second
//   `COMPUTE = readFileSync('scripts/lib/compute/assert-data-bounds.js')`
//   read, mirroring `link-wsib.infra.test.ts:19-23` — NOT done in this
//   commit (the compute file does not exist yet; repointing now would red
//   the whole file). Lines: `:35-36` (E7 cost_outlier_ceiling_cad, though
//   the audit-row threshold itself is CHANGE-TO logic var at commit 7 per
//   the report §2.4 IL-2 ruling — a distinct threshold from this one),
//   `:59-62` (E8 desc/builder null-rate), `:85-88` (E9 cost_estimates null-
//   rate + min tiers), `:102-103` (E10 calibration_freshness_warn_hours —
//   ⚠ this assertion only proves the var is READ into a local, not that it
//   affects any verdict; the report's ADB-D5 finding is that it is dead —
//   commit 7 RETIRES this var entirely, so this specific assertion does not
//   survive the repoint at all, unlike the other 14), `:117-118,120`
//   (P12-B2 coa_forward_link_sub085_warn_pct + the WARN/PASS ternary).
//
//   SKELETON (3) — archetype/plumbing convention, retired wholesale into the
//   shared library at commit 7 rather than repointed to COMPUTE (mirrors I1's
//   own "logic_variables Zod validation" SKELETON bucket exactly): `:125-127`
//   (`LOGIC_VARS_SCHEMA`, `loadMarketplaceConfigs`, `validateLogicVars` — the
//   Zod-schema/config-loader convention, replaced by `config.logic_variables[].
//   min/max/on_invalid` + `scripts/lib/step/config.js`).
//
// Nothing above changes any assertion body in this commit — this classification
// is a documentation-only obligation for commit 6; the repoint (and the E10
// assertion's removal) is commit 7's.
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const SRC = fs.readFileSync(
  path.resolve(__dirname, '../../scripts/quality/assert-data-bounds.js'),
  'utf-8'
);
const SEED = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../scripts/seeds/logic_variables.json'), 'utf-8')
) as Record<string, { default: number; type: string; min?: number; max?: number }>;

describe('assert-data-bounds.js — threshold externalization (§6.4)', () => {
  // ── E7: cost outlier ceiling ────────────────────────────────────────────
  it('seed has cost_outlier_ceiling_cad (default 2000000000, bounds sane)', () => {
    const entry = SEED.cost_outlier_ceiling_cad;
    if (!entry) throw new Error('cost_outlier_ceiling_cad missing from seed JSON');
    expect(entry.default).toBe(2000000000);
    expect(entry.type).toBe('number');
    expect(entry.min).toBeGreaterThan(0);
    expect(entry.max).toBeGreaterThan(entry.default);
  });

  it('reads cost_outlier_ceiling_cad from logicVars — no hardcoded 500000000 in SQL', () => {
    expect(SRC).toMatch(/logicVars\.cost_outlier_ceiling_cad/);
    expect(SRC).not.toMatch(/> 500000000/);
  });

  // ── E8: null-rate SLAs ──────────────────────────────────────────────────
  it('seed has desc_null_rate_warn_pct (default 5, bounds sane)', () => {
    const entry = SEED.desc_null_rate_warn_pct;
    if (!entry) throw new Error('desc_null_rate_warn_pct missing from seed JSON');
    expect(entry.default).toBe(5);
    expect(entry.type).toBe('number');
    expect(entry.min).toBeGreaterThan(0);
    expect(entry.max).toBeGreaterThan(entry.default);
  });

  it('seed has builder_null_rate_warn_pct (default 95, bounds sane)', () => {
    const entry = SEED.builder_null_rate_warn_pct;
    if (!entry) throw new Error('builder_null_rate_warn_pct missing from seed JSON');
    expect(entry.default).toBe(95);
    expect(entry.type).toBe('number');
    expect(entry.min).toBeGreaterThan(0);
    expect(entry.max).toBeGreaterThan(entry.default);
  });

  it('reads null-rate thresholds from logicVars — no hardcoded 0.05 or 0.95 comparisons', () => {
    expect(SRC).toMatch(/logicVars\.desc_null_rate_warn_pct/);
    expect(SRC).toMatch(/logicVars\.builder_null_rate_warn_pct/);
    expect(SRC).not.toMatch(/recentTotal > 0\.05/);
    expect(SRC).not.toMatch(/recentTotal > 0\.95/);
  });

  // ── E9: cost_estimates health ───────────────────────────────────────────
  it('seed has cost_est_null_rate_warn_pct (default 80, bounds sane)', () => {
    const entry = SEED.cost_est_null_rate_warn_pct;
    if (!entry) throw new Error('cost_est_null_rate_warn_pct missing from seed JSON');
    expect(entry.default).toBe(80);
    expect(entry.type).toBe('number');
    expect(entry.min).toBeGreaterThan(0);
    expect(entry.max).toBeGreaterThan(entry.default);
  });

  it('seed has cost_est_min_tiers (default 2, bounds sane)', () => {
    const entry = SEED.cost_est_min_tiers;
    if (!entry) throw new Error('cost_est_min_tiers missing from seed JSON');
    expect(entry.default).toBe(2);
    expect(entry.type).toBe('number');
    expect(entry.min).toBeGreaterThan(0);
    expect(entry.max).toBeGreaterThan(entry.default);
  });

  it('reads cost_estimates thresholds from logicVars — no hardcoded 0.80 or < 2', () => {
    expect(SRC).toMatch(/logicVars\.cost_est_null_rate_warn_pct/);
    expect(SRC).toMatch(/logicVars\.cost_est_min_tiers/);
    expect(SRC).not.toMatch(/ceTotal > 0\.80/);
    expect(SRC).not.toMatch(/tierCount < 2\b/);
  });

  // ── E10: calibration freshness ──────────────────────────────────────────
  it('seed has calibration_freshness_warn_hours (default 48, bounds sane)', () => {
    const entry = SEED.calibration_freshness_warn_hours;
    if (!entry) throw new Error('calibration_freshness_warn_hours missing from seed JSON');
    expect(entry.default).toBe(48);
    expect(entry.type).toBe('number');
    expect(entry.min).toBeGreaterThan(0);
    expect(entry.max).toBeGreaterThan(entry.default);
  });

  it('reads calibration_freshness_warn_hours from logicVars — no hardcoded > 48', () => {
    expect(SRC).toMatch(/logicVars\.calibration_freshness_warn_hours/);
    expect(SRC).not.toMatch(/tcFreshness > 48\b/);
  });

  // ── P12-B2: CoA forward-link sub-0.85 identity-floor watch ───────────────
  it('seed has coa_forward_link_sub085_warn_pct (default 59, bounds sane)', () => {
    const entry = SEED.coa_forward_link_sub085_warn_pct;
    if (!entry) throw new Error('coa_forward_link_sub085_warn_pct missing from seed JSON');
    expect(entry.default).toBe(59);
    expect(entry.type).toBe('number');
    expect(entry.min).toBeGreaterThan(0);
    expect(entry.max).toBe(100);
  });

  it('reads coa_forward_link_sub085_warn_pct from logicVars + emits the audit row', () => {
    expect(SRC).toMatch(/logicVars\.coa_forward_link_sub085_warn_pct/);
    expect(SRC).toMatch(/coa_forward_link_sub085_pct/);
    // WARN (regression signal), never FAIL — a below-floor link is honest, not corrupt.
    expect(SRC).toMatch(/coaSub085 > coaSub085WarnPct \? 'WARN' : 'PASS'/);
  });

  // ── Infrastructure ──────────────────────────────────────────────────────
  it('uses LOGIC_VARS_SCHEMA for validation', () => {
    expect(SRC).toMatch(/LOGIC_VARS_SCHEMA/);
    expect(SRC).toMatch(/loadMarketplaceConfigs/);
    expect(SRC).toMatch(/validateLogicVars/);
  });
});
