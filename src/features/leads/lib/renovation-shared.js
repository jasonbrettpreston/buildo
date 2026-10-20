/**
 * renovation-shared.js — the Spec 78 P5.7 shared pure calculation (step + app)
 *
 * SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md §Phase-5 P5.7 (one pure calculation, shared by
 *            the step and the app), P5.5 / P5.2 item 6, P5.12 (`through_lot_front_line`, `mechanical_attic_excluded`),
 *            P5.13 (the M-228 / M-229 vectors);
 *            docs/specs/01-pipeline/69a_mcbylaw_register.md M-228 (through-lot front lot line), M-229 (mechanical attic
 *            area left out of GFA; amends M-171).
 * DUAL CODE PATH: to be shared by
 *   - scripts/lib/compute/compute-maxbld-scenarios.js (the step's compute module; wiring OWED, step commit ①)
 *   - a TS shim for the app (PIN APP-RENO), as cost-model.ts is for cost-model-shared.js.
 * This file holds the formulas that are ruled today (M-228, M-229). P5.6's renovationResults() joins it at ①.
 *
 * Purity contract (Spec 124 R-BZ / R-CA): no query, no network, no clock, no randomness, no process or module state, no
 * locale APIs. Every law number arrives in the arguments (the keyed clause literals of 10.5.40.40(2); M-229(4): "never
 * code constants"); the street names arrive from parcel data (M-228(1)). Deterministic and re-entrant.
 *
 * @module renovation-shared
 */
'use strict';

/**
 * @typedef {Object} StreetLine
 * @property {string} line_id      the lot line's id from the lot-line classification (Spec 78 P5.14 ML-1)
 * @property {string|null} street_name  the street the line separates the lot from
 */

/**
 * @typedef {Object} ThroughLotFrontLineResult
 * @property {'not_applicable'|'applies'|'undecided'} status  Spec 68 §5a part 3 statuses
 * @property {string|null} front_line_id
 * @property {string[]} rear_line_ids
 * @property {string|null} front_street
 * @property {{code: string, params: {street: string}}|null} disclosure  P5.12 `through_lot_front_line`
 * @property {string[]} candidates  the street-line ids when undecided
 */

const normStreet = (s) => (typeof s === 'string' ? s.trim().replace(/\s+/g, ' ').toUpperCase() : '');

/**
 * M-228 (operator 2026-10-20, "1 & 2 y"; 10.5.30.20(1)(B): "the lot line abuts a street where an adjacent lot has its
 * front lot line on the same street"). On a through lot the front lot line is the street line on the lot's own
 * address street (`parcels.primary_frontage_street_name`, the proxy for the neighbours' front street); the other
 * street line(s) are the rear lot line. (A) the 0.3 m reserve is taken as not separating (M-169(1)), so it is no input.
 * Not a through lot → `not_applicable`. The address street on no street line, or on more than one → `undecided`
 * with the candidate lines (never a guess; Spec 68 §5a part 3).
 *
 * @param {{isThroughLot: boolean, addressStreet: string|null, streetLines: StreetLine[]}} input
 * @returns {ThroughLotFrontLineResult}
 */
function throughLotFrontLine(input) {
  const { isThroughLot, addressStreet, streetLines } = input;
  const lines = Array.isArray(streetLines) ? streetLines : [];
  const none = { front_line_id: null, rear_line_ids: [], front_street: null, disclosure: null, candidates: [] };
  if (isThroughLot !== true) return { status: 'not_applicable', ...none };
  const want = normStreet(addressStreet);
  const ids = lines.map((l) => l.line_id).sort();
  const hits = want ? lines.filter((l) => normStreet(l.street_name) === want) : [];
  if (hits.length !== 1 || lines.length < 2) return { status: 'undecided', ...none, candidates: ids };
  const front = hits[0];
  const street = String(front.street_name).trim();
  return {
    status: 'applies',
    front_line_id: front.line_id,
    rear_line_ids: lines.filter((l) => l !== front).map((l) => l.line_id).sort(),
    front_street: street,
    disclosure: { code: 'through_lot_front_line', params: { street } },
    candidates: [],
  };
}

/**
 * @typedef {Object} MechanicalAtticResult
 * @property {number} excluded_sqm        attic area taken as mechanical-equipment space, left out of GFA
 * @property {number} floor_area_sqm      floor area the design builds (plates + counted attic), after the FSI cap
 * @property {number} gfa_sqm             floor_area_sqm − excluded_sqm (what FSI measures)
 * @property {number} gain_sqm            floor_area_sqm − the floor area without the exclusion
 * @property {{code: string, params: {X: number}}|null} disclosure  P5.12 `mechanical_attic_excluded`
 */

/**
 * M-229 (operator 2026-10-20, "1 & 2 y"; 10.5.40.40(2): "that area is not included in the gross floor area of the
 * building if it is not more than 5% of the permitted maximum gross floor area of the building to a maximum of 20
 * square metres"). Where the design has an attic that passes 10.5.40.40(1) (counted in GFA, M-203), up to
 * min(share × permitted maximum GFA, max_sqm) of it is mechanical-equipment area outside GFA (a permissive design
 * choice taken as met, M-172(3)). `clause` carries the keyed literals (share, max_sqm) — never constants here.
 * No counted attic (flat-roof form, or a failing attic already outside GFA, M-203) → no change (M-229(3)).
 * No permitted maximum GFA (FSI `not_applicable` / `unlimited`) → the share has no base: no exclusion, and the
 * buildable floor area is unchanged either way.
 *
 * @param {{atticCounted: boolean, atticFloorAreaSqm: number, grossFloorAreaSqm: number,
 *          permittedMaxGfaSqm: number|null, clause: {share: number, max_sqm: number}}} input
 * @returns {MechanicalAtticResult}
 */
function mechanicalAtticExclusion(input) {
  const { atticCounted, atticFloorAreaSqm, grossFloorAreaSqm, permittedMaxGfaSqm, clause } = input;
  const capped = (gross, extra) => (permittedMaxGfaSqm == null ? gross : Math.min(gross, permittedMaxGfaSqm + extra));
  const without = capped(grossFloorAreaSqm, 0);
  const attic = Number.isFinite(atticFloorAreaSqm) ? Math.max(atticFloorAreaSqm, 0) : 0;
  if (atticCounted !== true || !(attic > 0) || permittedMaxGfaSqm == null || !clause) {
    return { excluded_sqm: 0, floor_area_sqm: without, gfa_sqm: without, gain_sqm: 0, disclosure: null };
  }
  const limit = Math.min(clause.share * permittedMaxGfaSqm, clause.max_sqm);
  const excluded = Math.max(Math.min(attic, limit), 0);
  const floor = capped(grossFloorAreaSqm, excluded);
  const used = Math.min(excluded, Math.max(floor - Math.min(grossFloorAreaSqm - attic, floor), 0));
  return {
    excluded_sqm: used,
    floor_area_sqm: floor,
    gfa_sqm: floor - used,
    gain_sqm: floor - without,
    disclosure: used > 0 ? { code: 'mechanical_attic_excluded', params: { X: used } } : null,
  };
}

module.exports = { throughLotFrontLine, mechanicalAtticExclusion };
