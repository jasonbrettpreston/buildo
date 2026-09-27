'use strict';
/**
 * SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-BA (gate E closed answers)
 *
 * THE ONE HOME FOR PURE UNIT / CALENDAR CONVERSIONS.
 *
 * A unit conversion is a DEFINITION of the unit it names — one metre IS 3.28084
 * feet, 1 m² IS 10.7639 ft² — not a policy knob. It is neither an admin
 * `config.logic_variables[]` tunable (Rule 3: an operator who "tuned" `M_TO_FT`
 * to 3.0 would not move a threshold, they would make every converted figure
 * wrong by ~9% while every count in the audit table still read healthy) nor a
 * module-level literal hidden inside a compute (`gate E`'s
 * `compute-no-module-numeric-const`, `scripts/analysis/gates/compute-literals.mjs`).
 * Under R-BA gate E's closed answer set, a pure unit conversion's home is an
 * import from THIS file — `imported from scripts/lib/units.js` — and the
 * `PROPOSED_UNIT_CONVERSION` names in the gate module are display labels only,
 * with no allowlist behind them.
 *
 * Values are the EXACT literals already in use in `scripts/lib/compute/**` and
 * `scripts/lib/step/**` (`load-parcels.js` `SQM_TO_SQFT`/`M_TO_FT`,
 * `load-ravines.js` `DAYS_PER_JULIAN_YEAR`/`MS_PER_DAY`) — byte-for-byte, never
 * re-derived with a second number. Steps MIGRATE to these imports when next
 * touched; this module introduces no threshold, limit, count, or anything an
 * operator would tune.
 */

/** Milliseconds per day — a duration definition (24 h x 60 min x 60 s x 1000 ms), not a tunable. */
const MS_PER_DAY = 86400000;
/** Days per Julian year — the calendar definition (365.25, leap years included), not a tunable. */
const DAYS_PER_JULIAN_YEAR = 365.25;
/** Square metres per square foot — 1 m² = 10.7639 ft², the unit the converted columns promise. */
const SQM_TO_SQFT = 10.7639;
/** Metres per foot — 1 m = 3.28084 ft, the unit the converted columns promise. */
const M_TO_FT = 3.28084;

module.exports = Object.freeze({
  MS_PER_DAY,
  DAYS_PER_JULIAN_YEAR,
  SQM_TO_SQFT,
  M_TO_FT,
});
