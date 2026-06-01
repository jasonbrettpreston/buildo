'use strict';
/**
 * coverage-status — pure traffic-light status for calibrated (per-field threshold)
 * coverage rows in assert-global-coverage.js.
 *
 * Extracted as a pure, unit-testable function for the WF3 #406 gated
 * `zoning_class` row (DEC-1, PASS >= 80 / WARN >= 75). Mirrors the inline
 * status ladder used by coverageRow/externalRow, but takes explicit thresholds
 * so per-field gates (like externalRow's 10/5) can be locked at the boundary.
 * Existing coverageRow/externalRow keep their inline logic untouched — this
 * helper is used only by the new calibratedRow to avoid altering shipped behavior.
 *
 * SPEC LINK: docs/specs/01-pipeline/49_data_completeness_profiling.md
 */

/**
 * @param {number|null} pct      coverage percentage (0-100), or null when no denominator
 * @param {number}      passPct  PASS floor (inclusive)
 * @param {number}      warnPct  WARN floor (inclusive); must be < passPct
 * @returns {'PASS'|'WARN'|'FAIL'|'INFO'}
 */
function calibratedStatus(pct, passPct, warnPct) {
  // DeepSeek LOW#4 — inverted thresholds would silently mis-status every row.
  if (warnPct >= passPct) {
    throw new Error(
      `calibratedStatus: warnPct must be < passPct (got warnPct=${warnPct}, passPct=${passPct})`,
    );
  }
  if (pct === null || pct === undefined) return 'INFO';
  if (pct >= passPct) return 'PASS';
  if (pct >= warnPct) return 'WARN';
  return 'FAIL';
}

module.exports = { calibratedStatus };
