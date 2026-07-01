/**
 * parcel-cost.js — Parcel Renovation Cost Model (pure engine)
 *
 * SPEC LINK: docs/specs/01-pipeline/88_parcel_cost_model.md §2
 * Design-of-record: docs/reports/wf1-parcel-renovation-cost-model.md
 *
 * Consumed by: scripts/compute-parcel-cost-estimates.js (the Mutator — bulk writer).
 *
 * Pure functions only — no DB, no side effects, no process-level state. Every
 * input arrives via parameters (the parcel row, the rates map, the escalation
 * multiplier). Deterministic + re-entrant, so a single bad parcel can be caught
 * by the caller's per-row try/catch without corrupting the engine.
 *
 * The TOP-DOWN model (§2.1), per line:
 *   cost = rate_$/m²(archetype)
 *        × MAX(1, cost_escalation_index ÷ escalation_index_base)   (escalation, never deflate)
 *        × cost_adjustment_factor(archetype)                       (1.0 default; SOLAR 0.75 usable roof)
 *        × area(line)                                              (the cost-LOCAL line→field map below)
 *        × neighbourhood_cost_premium                              (1.0 fallback)
 *
 * The per-trade/per-product breakdown is DEFERRED to P3 — P1 emits trades:null /
 * products:null (a documented not-yet-calibrated sentinel; the total is the anchor).
 *
 * IMPORTANT — this module carries its OWN 13-line→parcel-field map (PARCEL_COST_LINES).
 * It deliberately does NOT touch the shared ARCHETYPE_GEOM_BASIS / ARCHETYPE_BUNDLES /
 * deriveArchetypes (archetypes.js) or their JS=TS parity tests. The new SOLAR +
 * BAS_UNDERPIN archetypes live ONLY here — adding them to the shared classifier maps
 * would break the closed ArchetypeCode union + the dual-path parity tests.
 *
 * @module parcel-cost
 */
'use strict';

/** Current parcel_cost_menu JSONB schema version (root `_schema_version`). */
const PARCEL_COST_SCHEMA_VERSION = 1;

/** Permission values for which a fit-gated line (suite/garage) is considered buildable. */
const PERMITTED_VALUES = new Set(['as_of_right', 'coa_required']);

/**
 * The 13 reno lines → parcel area field + rate archetype + headline scalar.
 * Order is the menu/report order. `archetype` keys the archetype_cost_rates table.
 *
 *  - baseConfidence: §2.7 floor-AREA certainty (NOT a price range). Lot-driven
 *    envelope + SOLAR = high; cur_floor/cur_est_* derived = medium; storey-multiplied
 *    gut = low. Downgraded to 'low' when the parcel's max_build_confidence='low'
 *    (envelope lines only — see areaConfidenceFor).
 *  - fitField: present ONLY on fit-gated lines (suites/garage). Drives `fits` by
 *    PERMISSION (∈ PERMITTED_VALUES), NOT area-presence (a non-NULL garage GFA can
 *    still be not-permitted on a heritage lot).
 *  - isCoaLine: norm_basis is CoA-line-scoped (pre_r2|r2_refined; n/a elsewhere).
 *  - scalar / scalarKind: the propagated headline column (§2.5). 'total' lines emit
 *    the full premium-inclusive total; 'per_sqm' lines (small/uncertain area) emit
 *    the area-independent premium-inclusive $/m².
 *
 * @type {ReadonlyArray<{
 *   id: string, archetype: string, areaField: string, baseConfidence: 'high'|'medium'|'low',
 *   fitField?: string, isCoaLine?: boolean, scalar: string|null, scalarKind: 'total'|'per_sqm'
 * }>}
 */
const PARCEL_COST_LINES = Object.freeze([
  { id: 'max_build',        archetype: 'FB',           areaField: 'max_buildable_gfa_sqm',      baseConfidence: 'high',   scalar: 'cost_fb_total',                  scalarKind: 'total' },
  { id: 'coa_build',        archetype: 'CoA',          areaField: 'opt_coa_gfa_sqm',            baseConfidence: 'high',   scalar: 'cost_coa_total',                 scalarKind: 'total',  isCoaLine: true },
  { id: 'solar_max',        archetype: 'SOLAR',        areaField: 'max_buildable_footprint_sqm', baseConfidence: 'high',  scalar: 'cost_solar_total',               scalarKind: 'total' },
  // solar_coa shares the SAME capped footprint as solar_max (§2.2 "up, not out") → equal cost; no separate headline scalar.
  { id: 'solar_coa',        archetype: 'SOLAR',        areaField: 'max_buildable_footprint_sqm', baseConfidence: 'high',  scalar: null,                             scalarKind: 'total' },
  { id: 'garden_suite',     archetype: 'LANE_GARDEN',  areaField: 'max_garden_suite_gfa_sqm',   baseConfidence: 'high',   scalar: 'cost_garden_suite_total',        scalarKind: 'total',  fitField: 'rear_suite_permission' },
  { id: 'laneway_suite',    archetype: 'LANE_LANEWAY', areaField: 'max_laneway_suite_gfa_sqm',  baseConfidence: 'high',   scalar: 'cost_laneway_suite_total',       scalarKind: 'total',  fitField: 'rear_suite_permission' },
  { id: 'kitchen',          archetype: 'KIT',          areaField: 'cur_est_kitchen_gfa_sqm',    baseConfidence: 'medium', scalar: 'cost_kitchen_per_sqm',           scalarKind: 'per_sqm' },
  { id: 'bath',             archetype: 'BTH',          areaField: 'cur_est_bath_gfa_sqm',       baseConfidence: 'medium', scalar: 'cost_bath_per_sqm',              scalarKind: 'per_sqm' },
  { id: 'garage',           archetype: 'GAR',          areaField: 'max_garage_gfa_sqm',         baseConfidence: 'high',   scalar: 'cost_garage_total',              scalarKind: 'total',  fitField: 'garage_permission' },
  { id: 'basement_underpin', archetype: 'BAS_UNDERPIN', areaField: 'cur_floor_gfa_sqm',         baseConfidence: 'medium', scalar: 'cost_basement_underpin_per_sqm', scalarKind: 'per_sqm' },
  { id: 'basement',         archetype: 'BAS',          areaField: 'cur_floor_gfa_sqm',          baseConfidence: 'medium', scalar: 'cost_basement_per_sqm',          scalarKind: 'per_sqm' },
  { id: 'gut',              archetype: 'INT',          areaField: 'cur_pot_2story_gfa_sqm',     baseConfidence: 'low',    scalar: 'cost_gut_total',                 scalarKind: 'total' },
  { id: 'addition',         archetype: 'ADD',          areaField: 'cur_floor_gfa_sqm',          baseConfidence: 'medium', scalar: 'cost_addition_total',            scalarKind: 'total' },
]);

/**
 * Coerce a DB numeric (string|number|null|undefined) to a finite number, or null.
 * @param {unknown} v
 * @returns {number|null}
 */
function num(v) {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Round to 2 decimals (cents). @param {number} n @returns {number} */
function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Round to 3 decimals (FSI). @param {number} n @returns {number} */
function round3(n) {
  return Math.round((n + Number.EPSILON) * 1000) / 1000;
}

/**
 * Escalation multiplier (§2.9): MAX(1, index_now ÷ index_base). Never deflate a
 * fresh rate. Missing/invalid index OR base → 1.0 (the caller WARNs; the engine
 * does not crash). index_base must be > 0 (enforced by the rates-table CHECK + the
 * logic-var Zod validation upstream; defended here too).
 *
 * @param {number|null|undefined} indexNow   logic_variables.cost_escalation_index
 * @param {number|null|undefined} indexBase  archetype_cost_rates.escalation_index_base
 * @returns {number} multiplier ≥ 1
 */
function escalationMultiplier(indexNow, indexBase) {
  const now = num(indexNow);
  const base = num(indexBase);
  if (now === null || base === null || base <= 0) return 1;
  return Math.max(1, now / base);
}

/**
 * Effective area-confidence band for a line (§2.7). Envelope lines that would be
 * 'high' are downgraded to 'low' when the parcel's max-build envelope is itself
 * low-confidence (imagery-footprint unreliable) — but never skipped / never $0.
 *
 * @param {'high'|'medium'|'low'} baseConfidence
 * @param {string|null|undefined} maxBuildConfidence  parcel.max_build_confidence
 * @returns {'high'|'medium'|'low'}
 */
function areaConfidenceFor(baseConfidence, maxBuildConfidence) {
  if (baseConfidence === 'high' && maxBuildConfidence === 'low') return 'low';
  return baseConfidence;
}

/**
 * Core per-line cost (§2.1). Pure arithmetic; all multipliers pre-resolved.
 * Returns { total, per_sqm } both premium-INCLUSIVE (§2.6 — the lead model must
 * NOT re-apply the premium), rounded to cents.
 *
 * @param {Object} p
 * @param {number} p.areaSqm        the line's geom-basis area (m²), > 0
 * @param {number} p.ratePerSqm     archetype_cost_rates.cost_per_sqm
 * @param {number} p.escalationMult MAX(1, index/base)
 * @param {number} p.adjFactor      archetype_cost_rates.cost_adjustment_factor (SOLAR 0.75)
 * @param {number} p.premium        neighbourhood_cost_premium (1.0 fallback)
 * @returns {{ total: number, per_sqm: number }}
 */
function lineCost({ areaSqm, ratePerSqm, escalationMult, adjFactor, premium }) {
  const perSqm = ratePerSqm * escalationMult * adjFactor * premium;
  return { total: round2(perSqm * areaSqm), per_sqm: round2(perSqm) };
}

/**
 * Build the full parcel_cost_menu JSONB + the propagated headline/FSI scalars for
 * ONE parcel. Pure — the caller supplies the parcel row, the rates map, and the
 * escalation multiplier (resolved once per run from logic_variables).
 *
 * Semantics (§2.4):
 *  - area field NULL → line key ABSENT (not computable) — distinct from fits:false.
 *  - fit-gated line with non-NULL area → present + priced + `fits` by permission.
 *  - non-fit-gated line with non-NULL area → present + priced, no `fits` key.
 *  - realized_fsi_p90 is read-through (NULL in P1 — populated by the P2 family-aware
 *    norm read); coa_fsi/max_build_fsi are derived from parcel GFA ÷ lot here.
 *
 * @param {Record<string, unknown>} parcel  the parcel row (snake_case DB columns)
 * @param {Record<string, {cost_per_sqm:number, cost_adjustment_factor:number, escalation_index_base:number}>} rates
 *   archetype_cost_rates keyed by archetype
 * @param {number|null} indexNow  logic_variables.cost_escalation_index — the escalation
 *   multiplier is resolved PER-ARCHETYPE as MAX(1, indexNow ÷ rate.escalation_index_base)
 *   (each rate carries its own base, so a rate re-calibrated at a different index escalates
 *   correctly). Missing/invalid → 1.0 (caller WARNs).
 * @returns {{
 *   menu: Record<string, unknown>,
 *   scalars: Record<string, number|null>,
 *   lineCount: number,
 *   confidenceCounts: { high:number, medium:number, low:number },
 *   fitGatedSuiteCount: number,
 *   fitGatedGarageCount: number
 * }}
 */
function buildParcelCostMenu(parcel, rates, indexNow, opts = {}) {
  const premium = num(parcel.neighbourhood_cost_premium) ?? 1;
  const maxBuildConfidence = parcel.max_build_confidence ?? null;
  // §2.4: coa_build norm_basis. Spec 78 P2 R2 grounds opt_coa in realized detached FSI p90 — but only
  // for the DETACHED family (townhouse/multiplex keep by-law). The caller passes r2Grounded=true only
  // for detached parcels; otherwise the CoA GFA is still by-law-derived (pre_r2).
  const coaNormBasis = opts.r2Grounded === true ? 'r2_refined' : 'pre_r2';

  /** @type {Record<string, unknown>} */
  const menu = { _schema_version: PARCEL_COST_SCHEMA_VERSION };
  /** @type {Record<string, number|null>} */
  const scalars = {};
  const confidenceCounts = { high: 0, medium: 0, low: 0 };
  let fitGatedSuiteCount = 0;
  let fitGatedGarageCount = 0;
  let lineCount = 0;

  for (const line of PARCEL_COST_LINES) {
    const area = num(parcel[line.areaField]);
    if (area === null || area <= 0) continue; // not computable → line absent

    const rate = rates[line.archetype];
    if (!rate || num(rate.cost_per_sqm) === null) continue; // no rate seeded → absent (rows are NOT NULL/CHECK>0, so defensive)

    const adjFactor = num(rate.cost_adjustment_factor) ?? 1;
    const escalationMult = escalationMultiplier(indexNow, rate.escalation_index_base);
    const { total, per_sqm } = lineCost({
      areaSqm: area,
      ratePerSqm: num(rate.cost_per_sqm),
      escalationMult,
      adjFactor,
      premium,
    });

    const areaConfidence = areaConfidenceFor(line.baseConfidence, maxBuildConfidence);
    confidenceCounts[areaConfidence] += 1;
    lineCount += 1;

    /** @type {Record<string, unknown>} */
    const entry = {
      total,
      per_sqm,
      area: round2(area),
      area_confidence: areaConfidence,
      norm_basis: line.isCoaLine ? coaNormBasis : 'n/a', // §2.4: CoA-line-scoped (pre_r2 | r2_refined post-R2)
      trades: null, // §2.1 — breakdown deferred to P3
      products: null,
    };

    if (line.fitField) {
      const permission = parcel[line.fitField] ?? null;
      const fits = PERMITTED_VALUES.has(permission);
      entry.fits = fits;
      if (!fits) {
        if (line.fitField === 'garage_permission') fitGatedGarageCount += 1;
        else fitGatedSuiteCount += 1;
      }
    }

    menu[line.id] = entry;

    if (line.scalar) {
      scalars[line.scalar] = line.scalarKind === 'per_sqm' ? per_sqm : total;
    }
  }

  // FSI scalars (§2.5). Derived from parcel GFA ÷ lot; realized_fsi_p90 read-through (P2 populates).
  const lot = num(parcel.lot_size_sqm);
  const maxGfa = num(parcel.max_buildable_gfa_sqm);
  const coaGfa = num(parcel.opt_coa_gfa_sqm);
  scalars.max_build_fsi = lot && lot > 0 && maxGfa !== null ? round3(maxGfa / lot) : null;
  scalars.coa_fsi = lot && lot > 0 && coaGfa !== null ? round3(coaGfa / lot) : null;
  scalars.realized_fsi_p90 = num(parcel.realized_fsi_p90); // NULL in P1 — P2 family-aware norm read

  return { menu, scalars, lineCount, confidenceCounts, fitGatedSuiteCount, fitGatedGarageCount };
}

module.exports = {
  PARCEL_COST_SCHEMA_VERSION,
  PARCEL_COST_LINES,
  PERMITTED_VALUES,
  escalationMultiplier,
  areaConfidenceFor,
  lineCost,
  buildParcelCostMenu,
};
