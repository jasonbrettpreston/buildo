// SPEC LINK: docs/specs/01-pipeline/85_trade_forecast_engine.md §3.6 (Audit-verdict thresholds + CoA gate policy)
//
// WF2 D2a (externalized calibration verdict thresholds + mechanical re-tightening guard) and
// D3a (declarative coa_gate_policy pass_or_warn + coa_audit_gate_warn_accepted). Source-shape +
// seeds/migration content assertions — the verdict cascade and the gate matrix are inline in the
// stream/audit code; these pin their structure so a refactor cannot re-hardcode a threshold, drop
// the relaxed-thresholds guard, or silently accept a WARN verdict without the loud audit row.
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.resolve(repoRoot, rel), 'utf-8');

describe('compute-trade-forecasts.js — D2a externalized calibration thresholds', () => {
  let content: string;
  beforeAll(() => {
    content = read('scripts/compute-trade-forecasts.js');
  });

  it('LOGIC_VARS_SCHEMA requires both threshold vars, fail-fast (finite, not optional)', () => {
    expect(content).toMatch(/forecast_default_calibration_warn_pct:\s*z\.coerce\.number\(\)\.finite\(\)/);
    expect(content).toMatch(/forecast_default_calibration_fail_pct:\s*z\.coerce\.number\(\)\.finite\(\)/);
    // Must NOT be optional (a missing threshold must throw, not degrade the verdict).
    expect(content).not.toMatch(/forecast_default_calibration_warn_pct:.*\.optional\(\)/);
    expect(content).not.toMatch(/forecast_default_calibration_fail_pct:.*\.optional\(\)/);
  });

  it('default_calibration_pct verdict reads the externalized thresholds (no hardcoded 20/50)', () => {
    expect(content).toMatch(/const calibWarnPct = logicVars\.forecast_default_calibration_warn_pct;/);
    expect(content).toMatch(/const calibFailPct = logicVars\.forecast_default_calibration_fail_pct;/);
    expect(content).toMatch(/defaultPct >= calibFailPct \? 'FAIL' : defaultPct >= calibWarnPct \? 'WARN' : 'PASS'/);
    // The old hardcoded cascade must be gone.
    expect(content).not.toMatch(/defaultPct >= 50 \? 'FAIL' : defaultPct >= 20 \? 'WARN'/);
  });

  it('leaves the expired_urgency_pct thresholds hardcoded/unchanged (60/30)', () => {
    expect(content).toMatch(/expiredPct >= 60 \? 'FAIL' : expiredPct >= 30 \? 'WARN' : 'PASS'/);
  });

  it('defines the strict (20/50) baseline pair for the re-tightening guard', () => {
    expect(content).toMatch(/const STRICT_CALIB_WARN_PCT = 20;/);
    expect(content).toMatch(/const STRICT_CALIB_FAIL_PCT = 50;/);
    expect(content).toMatch(/calibThresholdsRelaxed = calibWarnPct > STRICT_CALIB_WARN_PCT \|\| calibFailPct > STRICT_CALIB_FAIL_PCT/);
  });

  it('emits calibration_thresholds_relaxed (WARN when relaxed) + calibration_cohort_fill_pct (INFO)', () => {
    expect(content).toMatch(/metric:\s*'calibration_thresholds_relaxed'/);
    expect(content).toMatch(/status:\s*calibThresholdsRelaxed \? 'WARN' : 'PASS'/);
    expect(content).toMatch(/metric:\s*'calibration_cohort_fill_pct'/);
    expect(content).toMatch(/const calibCohortFillPct = 100 - defaultPct;/);
  });
});

describe('compute-trade-forecasts.js — D3a CoA gate policy (pass_or_warn)', () => {
  let content: string;
  beforeAll(() => {
    content = read('scripts/compute-trade-forecasts.js');
  });

  it('reads coa_gate_policy directly (JSONB string) and defaults to pass_only', () => {
    expect(content).toMatch(/let coaGatePolicy = 'pass_only';/);
    expect(content).toMatch(/WHERE variable_key = 'coa_gate_policy'/);
    expect(content).toMatch(/rawPolicy === 'pass_only' \|\| rawPolicy === 'pass_or_warn'/);
  });

  it('gate matrix: PASS activates; WARN activates ONLY under pass_or_warn; else blocked', () => {
    // PASS branch (unchanged).
    expect(content).toMatch(/coaGateLastVerdict === 'PASS'/);
    // WARN accepted only under pass_or_warn → sets active + warnAccepted + status.
    expect(content).toMatch(/coaGateLastVerdict === 'WARN' && coaGatePolicy === 'pass_or_warn'/);
    expect(content).toMatch(/coaGateWarnAccepted = true;/);
    expect(content).toMatch(/coaGateStatus = 'pass_or_warn_accepted';/);
    // FAIL / null still blocked_by_*.
    expect(content).toMatch(/coaGateStatus = `blocked_by_\$\{\(coaGateLastVerdict \|\| 'null'\)\.toLowerCase\(\)\}`/);
  });

  it('emits coa_audit_gate_warn_accepted WARN row mirroring grace/force bypass rows', () => {
    expect(content).toMatch(/metric: 'coa_audit_gate_warn_accepted'/);
    expect(content).toMatch(/status: coaGateWarnAccepted \? 'WARN' : 'INFO'/);
  });

  it('preserves the review-locked override ordering (verdict → grace → force-active last)', () => {
    const warnIdx = content.indexOf("coaGateStatus = 'pass_or_warn_accepted'");
    const graceIdx = content.indexOf('const coaGraceBypassActive = coaFirstDeployGrace && !coaGateActive');
    const forceIdx = content.indexOf('const coaGateForceActive = logicVars.coa_gate_force_active === 1');
    expect(warnIdx).toBeGreaterThan(-1);
    expect(warnIdx).toBeLessThan(graceIdx); // verdict (incl. WARN-accept) resolves before grace
    expect(graceIdx).toBeLessThan(forceIdx); // grace before force-active (force last)
  });
});

describe('seeds + migration content — D2a/D3a', () => {
  it('logic_variables.json seeds the two numeric thresholds at 70/85', () => {
    const json = JSON.parse(read('scripts/seeds/logic_variables.json')) as Record<string, { default: number }>;
    expect(json.forecast_default_calibration_warn_pct?.default).toBe(70);
    expect(json.forecast_default_calibration_fail_pct?.default).toBe(85);
  });

  it('coa_gate_policy is NOT in seeds JSON (migration-only, like income_premium_tiers)', () => {
    const json = JSON.parse(read('scripts/seeds/logic_variables.json')) as Record<string, unknown>;
    expect(json).not.toHaveProperty('coa_gate_policy');
    expect(json).not.toHaveProperty('forecast_excluded_trade_slugs');
  });

  it('migration 211 seeds pass_only then conditionally re-baselines the live value to pass_or_warn', () => {
    const sql = read('migrations/211_coa_gate_policy.sql');
    expect(sql).toMatch(/'coa_gate_policy',\s*0,\s*'"pass_only"'::jsonb/);
    expect(sql).toMatch(/ON CONFLICT \(variable_key\) DO NOTHING/);
    // Conditional UPDATE only flips a row still at the seed default (mig 209 pattern).
    expect(sql).toMatch(/SET variable_value_json = '"pass_or_warn"'::jsonb/);
    expect(sql).toMatch(/AND variable_value_json = '"pass_only"'::jsonb/);
    // DOWN fully commented.
    const downBlock = sql.slice(sql.indexOf('-- DOWN'));
    expect(downBlock).not.toMatch(/^\s*DELETE/m);
    expect(downBlock).not.toMatch(/^\s*UPDATE/m);
  });
});
