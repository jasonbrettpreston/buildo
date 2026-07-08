/**
 * calibration-guard.logic.test.ts
 *
 * SPEC LINK: docs/specs/01-pipeline/85_trade_forecast_engine.md §3.6
 *
 * Locks the WF2 P8 escalation (Gemini P9-pass) of the `calibration_thresholds_
 * relaxed` guard in compute-trade-forecasts.js. The relaxed default-calibration
 * verdict thresholds must never quietly become permanent:
 *   - strict thresholds active                              → PASS
 *   - relaxed AND cohorts still cold (defaultPct >= warn)   → WARN
 *   - relaxed AND cohorts RECOVERED (defaultPct < warn)     → FAIL
 * The FAIL state is the load-bearing new behavior: a system that has recovered
 * past the strict-PASS point while still running loose thresholds is config
 * drift demanding action, not a warning.
 */

import { describe, it, expect } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { classifyCalibrationThresholdStatus, classifyCoaGateWarnAcceptedStatus } = require('../../scripts/lib/calibration-guard');

const STRICT_WARN = 20; // matches STRICT_CALIB_WARN_PCT in compute-trade-forecasts.js

describe('classifyCalibrationThresholdStatus — three-state re-tightening guard', () => {
  it('relaxed + cohorts still cold → WARN', () => {
    // defaultPct 45% is still well above the strict-PASS point (< 20%): loosening defensible.
    expect(
      classifyCalibrationThresholdStatus({ relaxed: true, defaultPct: 45, strictWarnPct: STRICT_WARN }),
    ).toBe('WARN');
  });

  it('relaxed + cohorts recovered past the strict-PASS point → FAIL', () => {
    // defaultPct 12% < 20% strict WARN ⇒ strict thresholds would PASS; running loose = drift.
    expect(
      classifyCalibrationThresholdStatus({ relaxed: true, defaultPct: 12, strictWarnPct: STRICT_WARN }),
    ).toBe('FAIL');
  });

  it('strict thresholds active (not relaxed) → PASS', () => {
    expect(
      classifyCalibrationThresholdStatus({ relaxed: false, defaultPct: 5, strictWarnPct: STRICT_WARN }),
    ).toBe('PASS');
    // Not relaxed stays PASS even if cohorts are cold — strict is the honest state.
    expect(
      classifyCalibrationThresholdStatus({ relaxed: false, defaultPct: 80, strictWarnPct: STRICT_WARN }),
    ).toBe('PASS');
  });

  it('boundary: defaultPct exactly at the strict WARN point is NOT recovered → WARN', () => {
    // Strict-PASS is `defaultPct < warn`, so exactly == warn is still cold ⇒ WARN, never FAIL.
    expect(
      classifyCalibrationThresholdStatus({ relaxed: true, defaultPct: STRICT_WARN, strictWarnPct: STRICT_WARN }),
    ).toBe('WARN');
  });
});

describe('classifyCoaGateWarnAcceptedStatus — CoA gate policy re-tightening guard', () => {
  it('pass_or_warn + cohorts still cold (accepting a WARN verdict) → WARN', () => {
    expect(
      classifyCoaGateWarnAcceptedStatus({ policy: 'pass_or_warn', warnAccepted: true, calibrationPassGrade: false }),
    ).toBe('WARN');
  });

  it('pass_or_warn + calibration recovered to PASS-grade → FAIL', () => {
    // Policy still loose but the gate verdict is a clean PASS ⇒ config drift: revert to pass_only.
    expect(
      classifyCoaGateWarnAcceptedStatus({ policy: 'pass_or_warn', warnAccepted: false, calibrationPassGrade: true }),
    ).toBe('FAIL');
  });

  it('pass_only (strict policy) → INFO', () => {
    expect(
      classifyCoaGateWarnAcceptedStatus({ policy: 'pass_only', warnAccepted: false, calibrationPassGrade: false }),
    ).toBe('INFO');
    // Strict policy stays INFO even when calibration is PASS-grade — no drift, nothing loose.
    expect(
      classifyCoaGateWarnAcceptedStatus({ policy: 'pass_only', warnAccepted: false, calibrationPassGrade: true }),
    ).toBe('INFO');
  });
});
