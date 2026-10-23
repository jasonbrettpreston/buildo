/**
 * SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md §Phase-5 P5.1 (scenarios, gates, scenario status), P5.3
 * SPEC LINK: docs/specs/01-pipeline/134_resolve_bylaws.md §4 (status sets and layer2-map.json)
 * Handbook:  Spec 133 §m.232 (M-232), §m.238 (M-238); Spec 132 §core.9; HELD on P3-Q1 (N6a freeze, operator ruling pending)
 *
 * Status mapping for compute_maxbld_scenarios (P3-2): the closed scenario status of one (parcel, scenario) row and the
 * Layer 3 field status of one Layer 2 result, both through the declared total map (layer2-map.json, passed IN).
 * Pure library; reads Layer 2 only through the one accessor (maxbld-layer2-view.js).
 *
 *   classOf(scenario, flags)            -> the Layer 2 class of a scenario (P5.1 table)
 *   isProduced(scenario, flags)         -> whether the row exists at all (P5.1 "Produced when")
 *   scenarioStatus({scenario, view, flags, config}) -> {status, disclosures[], class}
 *   fieldStatus(result, map)            -> the Spec 68 §11.1 field status text of one Layer 2 result
 *
 * flags = { semiHalf, holdingZone, existingHouse (renovation input exists), existingBasement (true | false | null),
 *           frontageM, lawfullyExistingBelowZoneMin, heritage, ravine, shoreline }
 * config = { viabilityFrontageMinM (the keyed clause literal of 10.5.30.21(3)), lotViabilityMarginM (P5.9) }
 */
'use strict';

const NEW_BUILD = Object.freeze(['D', 'H', 'S', '2']);
const RENOVATION = Object.freeze(['RA', 'RI', 'RB', 'RE', 'RF']);
const NEW_BUILD_CLASS = Object.freeze({ D: 'detached_house', H: 'detached_houseplex', S: 'semi_detached_houseplex', 2: 'house_with_secondary_suite' });
/** P5.2 gate 2 names D, 2, H (M-207). */
const VIABILITY_SCENARIOS = Object.freeze(['D', '2', 'H']);
const VIABILITY_CLAUSE = '10.5.30.21(3)';

function classOf(scenario, flags) {
  if (Object.prototype.hasOwnProperty.call(NEW_BUILD_CLASS, scenario)) return NEW_BUILD_CLASS[scenario];
  if (RENOVATION.includes(scenario)) return flags && flags.semiHalf ? 'semi_detached_house' : 'detached_house';
  throw new Error(`maxbld-scenario-status: unknown scenario ${JSON.stringify(scenario)}`);
}

/** P5.1: S only where semi_half holds; RF only where the owner says a basement exists; the other renovations always have a row (their status carries the missing input). */
function isProduced(scenario, flags) {
  if (scenario === 'S') return flags.semiHalf === true;
  if (scenario === 'RF') return flags.existingBasement === true;
  classOf(scenario, flags);
  return true;
}

const uniqSorted = (xs) => [...new Set(xs)].sort();

function scenarioStatus({ scenario, view, flags, config }) {
  const cls = classOf(scenario, flags);
  const disclosures = [];
  const renovation = RENOVATION.includes(scenario);
  if (flags.heritage) disclosures.push('heritage_designated');
  if (flags.ravine) disclosures.push('ravine_protection');
  if (flags.shoreline) disclosures.push('shoreline_hazard');
  const done = (status) => ({ status, disclosures: uniqSorted(disclosures), class: cls });

  // Gate 1: holding. New-build rows are not permitted; renovation rows are computed and disclosed (LC-12).
  if (flags.holdingZone) {
    disclosures.push('holding_zone');
    if (!renovation) return done('not_permitted:holding_zone');
  }
  // Gate 2: lot viability (M-207). Within the margin of the threshold the row is computed and disclosed.
  if (VIABILITY_SCENARIOS.includes(scenario) && flags.lawfullyExistingBelowZoneMin === true) {
    if (!Number.isFinite(flags.frontageM) || !Number.isFinite(config.viabilityFrontageMinM) || !Number.isFinite(config.lotViabilityMarginM)) {
      throw new TypeError('scenarioStatus: frontageM, viabilityFrontageMinM and lotViabilityMarginM are required for the lot-viability gate; a missing input is never defaulted');
    }
    if (flags.frontageM < config.viabilityFrontageMinM) return done(`not_permitted:${VIABILITY_CLAUSE}`);
    if (flags.frontageM < config.viabilityFrontageMinM + config.lotViabilityMarginM) disclosures.push('irregular_lot_approximation');
  }
  // Gate 3: the Layer 2 lot gate propagates unchanged (ambiguous zone, unauthored exception, ...).
  const gate = view.lotGate();
  if (gate !== null) {
    if (gate === 'exception_not_authored') disclosures.push('exception_not_authored');
    return done(`not_evaluated:${gate}`);
  }
  // A renovation with no existing-house input.
  if (renovation && !flags.existingHouse) return done('not_evaluated:no_existing_house');
  // The class permission (R-IT): prohibited -> not_permitted:<clause>; not_evaluated reason propagates.
  const p = view.permission(cls);
  if (p.status === 'prohibited') return done(`not_permitted:${p.clause}`);
  if (p.status === 'not_evaluated') return done(`not_evaluated:${p.reason}`);
  if (p.status !== 'permitted') throw new Error(`scenarioStatus: permission status ${JSON.stringify(p.status)} is not in layer2-map.json permission_image`);
  return done('permitted');
}

/**
 * The Layer 3 field status of a stored Layer 2 result through layer2-map.json `layer3_image` (M-232 total map):
 * applies by value_kind -> computed | unlimited:<clause> | unregulated:<clause>; not_applicable:<clause>; not_evaluated:<reason>.
 */
function fieldStatus(result, map) {
  const img = map.layer3_image;
  if (!Object.prototype.hasOwnProperty.call(img, result.status)) throw new Error(`fieldStatus: Layer 2 status ${JSON.stringify(result.status)} has no Layer 3 image in layer2-map.json`);
  let word = img[result.status];
  if (result.status === 'applies') {
    if (!Object.prototype.hasOwnProperty.call(word, result.value_kind)) throw new Error(`fieldStatus: value_kind ${JSON.stringify(result.value_kind)} has no Layer 3 image`);
    word = word[result.value_kind];
  }
  if (word === 'computed') return word;
  const param = result.status === 'not_evaluated' ? result.reason : result.status === 'not_applicable' ? result.reason : result.evidence_ref;
  return param === null || param === undefined ? word : `${word}:${param}`;
}

module.exports = { NEW_BUILD, RENOVATION, VIABILITY_CLAUSE, classOf, isProduced, scenarioStatus, fieldStatus };
