// SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §6.4
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.5
//
// Regression lock: assert_data_bounds's data-quality thresholds must be
// registered logic_variables, actually consumed, not hardcoded:
//   - cost_outlier_ceiling_cad (E7): outlier ceiling
//   - desc_null_rate_warn_pct  (E8): description null-rate SLA
//   - builder_null_rate_warn_pct (E8): builder null-rate SLA
//   - cost_est_null_rate_warn_pct (E9): cost_estimates null-rate SLA
//   - cost_est_min_tiers (E9): minimum distinct cost tiers
//   - coa_forward_link_sub085_warn_pct (P12-B2): CoA forward-link identity floor watch
//
// ── Batch1 I2 commit 6 (2026-09-12) — BEHAVIOUR vs SKELETON classification ──
// Fold A item 1 (`.cursor/batch1_i2_assert_data_bounds_active_task.md`): this
// pre-existing file is KEPT, not deleted, following the sole measured precedent
// `src/tests/link-wsib.infra.test.ts` (which coexists with
// `src/tests/steps/link_wsib/violations.test.ts`) and `assert-global-coverage.
// infra.test.ts`'s own I1 precedent — not deleted, not silently migrated.
//
// ── COMMIT 7 (this commit) — the promised repoint lands ──────────────────────
// Of the 18 `expect(SRC)` source-text assertions classified at commit 6:
//   BEHAVIOUR (15) — domain thresholds this conversion PRESERVES IN COMPUTE.
//   REPOINTED here to a second `COMPUTE = readFileSync('scripts/lib/compute/
//   assert-data-bounds.js')` read, mirroring `link-wsib.infra.test.ts:19-23`.
//   Every one of the 5 var names below is CONSUMED — 3 (cost_outlier_ceiling_cad,
//   coa's magnitude/window vars) as direct `ctx.config.<name>` SQL binds; 2
//   (desc/builder null-rate) via the descriptor's `limit_from_config`
//   substitution (declared in `scripts/lib/assert-data-bounds-fields.js`'s
//   LOGIC_VAR_DEFS, not a literal `ctx.config.X` text in compute — the library
//   substitutes the bound at verdict-evaluation time, `scripts/lib/step/
//   verdict.js resolveLimit`), so those 2 assertions check the FIELDS module,
//   not compute, for the honest reason a text search of compute alone would
//   never find them.
//   E10 (calibration_freshness_warn_hours) — REMOVED, not repointed, exactly as
//   commit 6 predicted: ADB-D5 found ZERO runtime consumption in this step;
//   commit 7 retires it from assert_data_bounds entirely (the seed row SURVIVES
//   — a genuine second consumer, scripts/compute-phase-calibration.js, was
//   found this session — see scripts/lib/assert-data-bounds-fields.js's header;
//   locked separately in src/tests/steps/assert_data_bounds/violations.test.ts).
//   SKELETON (3) — `LOGIC_VARS_SCHEMA`/`loadMarketplaceConfigs`/
//   `validateLogicVars` retired wholesale into the shared library
//   (`scripts/lib/step/config.js` `resolveConfig`) — the old assertion is
//   replaced by checking the NEW skeleton contract instead of deleting the
//   coverage outright (mirrors I1's own SKELETON repoint).
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const COMPUTE = fs.readFileSync(
  path.resolve(__dirname, '../../scripts/lib/compute/assert-data-bounds.js'),
  'utf-8'
);
const FIELDS = fs.readFileSync(
  path.resolve(__dirname, '../../scripts/lib/assert-data-bounds-fields.js'),
  'utf-8'
);
const DESCRIPTOR = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../scripts/quality/assert-data-bounds.descriptor.json'), 'utf-8')
) as { config: { logic_variables: Array<{ name: string; min: number; max: number; on_invalid: string }>; validation: string } };
const SEED = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../scripts/seeds/logic_variables.json'), 'utf-8')
) as Record<string, { default: number; type: string; min?: number; max?: number; description?: string }>;

describe('assert-data-bounds — threshold externalization (§6.4, repointed to COMPUTE/FIELDS at commit 7)', () => {
  // ── E7: cost outlier ceiling ────────────────────────────────────────────
  it('seed has cost_outlier_ceiling_cad (default 2000000000, bounds sane)', () => {
    const entry = SEED.cost_outlier_ceiling_cad;
    if (!entry) throw new Error('cost_outlier_ceiling_cad missing from seed JSON');
    expect(entry.default).toBe(2000000000);
    expect(entry.type).toBe('number');
    expect(entry.min).toBeGreaterThan(0);
    expect(entry.max).toBeGreaterThan(entry.default);
  });

  it('compute reads cost_outlier_ceiling_cad from ctx.config as a bound SQL param — no hardcoded ceiling literal', () => {
    expect(COMPUTE).toMatch(/ctx\.config\.cost_outlier_ceiling_cad/);
    expect(COMPUTE).not.toMatch(/est_const_cost > 500000000/);
    expect(COMPUTE).not.toMatch(/est_const_cost > 2000000000/);
  });

  // ── E8: null-rate SLAs — consumed via the descriptor's limit_from_config
  //    substitution (declared in FIELDS' LOGIC_VAR_DEFS), not a literal
  //    ctx.config.X text in compute (percentage-form checks never touch
  //    ctx.config directly — scripts/lib/step/verdict.js resolveLimit does
  //    the substitution at verdict-evaluation time). ────────────────────────
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

  it('null-rate thresholds are declared LOGIC_VAR_DEFS entries + declared checks[] (limit_from_config substitution, not a compute literal)', () => {
    expect(FIELDS).toMatch(/name: 'desc_null_rate_warn_pct'/);
    expect(FIELDS).toMatch(/name: 'builder_null_rate_warn_pct'/);
    const cfg = DESCRIPTOR.config.logic_variables.map((v) => v.name);
    expect(cfg).toContain('desc_null_rate_warn_pct');
    expect(cfg).toContain('builder_null_rate_warn_pct');
    expect(COMPUTE).not.toMatch(/descPct > 5\b/);
    expect(COMPUTE).not.toMatch(/builderPct > 95\b/);
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

  it('cost_estimates thresholds are declared LOGIC_VAR_DEFS entries, now visible audit rows (cost_estimates_null_rate/cost_estimates_min_tiers, consequence 3 — pre-conversion were warnings[]-only)', () => {
    expect(FIELDS).toMatch(/name: 'cost_est_null_rate_warn_pct'/);
    expect(FIELDS).toMatch(/name: 'cost_est_min_tiers'/);
    const cfg = DESCRIPTOR.config.logic_variables.map((v) => v.name);
    expect(cfg).toContain('cost_est_null_rate_warn_pct');
    expect(cfg).toContain('cost_est_min_tiers');
    expect(FIELDS).toMatch(/id: 'cost_estimates_null_rate'/);
    expect(FIELDS).toMatch(/id: 'cost_estimates_min_tiers'/);
    expect(COMPUTE).not.toMatch(/nullPct > 80\b/);
    expect(COMPUTE).not.toMatch(/tierCount < 2\b/);
  });

  // ── E10: calibration freshness — REMOVED (ADB-D5, zero runtime consumption
  //    in THIS step; the seed row survives for a genuine second consumer —
  //    see src/tests/steps/assert_data_bounds/violations.test.ts). ──────────
  it('calibration_freshness_warn_hours is NOT consumed by assert_data_bounds\' own compute/fields (ADB-D5 retirement)', () => {
    expect(COMPUTE).not.toMatch(/calibration_freshness_warn_hours/);
    const cfg = DESCRIPTOR.config.logic_variables.map((v) => v.name);
    expect(cfg).not.toContain('calibration_freshness_warn_hours');
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

  it('coa_forward_link_sub085_warn_pct is a declared LOGIC_VAR_DEFS entry + declared audit-row check (limit_from_config substitution)', () => {
    expect(FIELDS).toMatch(/name: 'coa_forward_link_sub085_warn_pct'/);
    expect(FIELDS).toMatch(/id: 'coa_forward_link_sub085_pct'/);
    const cfg = DESCRIPTOR.config.logic_variables.map((v) => v.name);
    expect(cfg).toContain('coa_forward_link_sub085_warn_pct');
  });

  // ── Infrastructure (SKELETON — retired wholesale into the shared library) ─
  it('the old LOGIC_VARS_SCHEMA/loadMarketplaceConfigs/validateLogicVars convention is GONE from compute — replaced by the library\'s config.logic_variables[] + scripts/lib/step/config.js resolveConfig', () => {
    expect(COMPUTE).not.toMatch(/LOGIC_VARS_SCHEMA/);
    expect(COMPUTE).not.toMatch(/loadMarketplaceConfigs/);
    expect(COMPUTE).not.toMatch(/validateLogicVars/);
    expect(DESCRIPTOR.config.validation).toBe('strict');
    expect(Array.isArray(DESCRIPTOR.config.logic_variables)).toBe(true);
    expect(DESCRIPTOR.config.logic_variables.length).toBe(26);
    for (const v of DESCRIPTOR.config.logic_variables) {
      expect(v.on_invalid, `${v.name} on_invalid`).toBe('fail');
    }
  });
});
