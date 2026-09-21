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
 * Max STORABLE / plausible FSI (the pre-conversion literal default — Spec 88 §2.5). The FSI
 * columns are NUMERIC(6,3) (max 999.999), and no residential parcel legitimately reaches FSI
 * 100 — a higher derived FSI means a garbage `max_buildable_gfa_sqm` (the known tree-contaminated
 * massing / setback-box artifacts, ~1.3K parcels). We NULL such FSIs (rather than overflow the
 * column or store nonsense) and COUNT them so the data gap is visible.
 *
 * Batch-2 row 2.4 (Spec 122 §5.5 conversion) — this constant is now ONLY the seed default
 * documented in scripts/seeds/logic_variables.json under
 * `compute_parcel_cost_fsi_max_plausible`; the engine itself takes the live-resolved value
 * through `opts.config.fsiMaxPlausible` (REQUIRED — Spec 122 §1.2a P4: a defaulted config
 * argument is a literal wearing a variable's name, which src/tests/steps/compute_parcel_cost_estimates/violations.test.ts
 * test 5 scans for). Kept exported for the two `scripts/analysis/wf3-*` engine consumers and
 * the logic test's own documentation anchor — it is NOT read internally by `plausibleFsi`.
 */
const FSI_MAX_PLAUSIBLE = 99.999;

/**
 * GFA ÷ lot as a stored FSI, or null when not computable OR implausibly high (data artifact).
 * @param {number|null} gfa
 * @param {number|null} lot
 * @param {number} fsiMaxPlausible  REQUIRED (Rule 3 — no defaulted engine tunable; caller resolves
 *   from `compute_parcel_cost_fsi_max_plausible`, seed 99.999 === FSI_MAX_PLAUSIBLE above).
 */
function plausibleFsi(gfa, lot, fsiMaxPlausible) {
  if (typeof fsiMaxPlausible !== 'number' || !Number.isFinite(fsiMaxPlausible)) {
    throw new Error('[parcel-cost] plausibleFsi requires a finite fsiMaxPlausible (Rule 3 — no defaulted engine tunable)');
  }
  if (!(lot > 0) || gfa === null) return { fsi: null, implausible: false };
  const fsi = round3(gfa / lot);
  if (fsi > fsiMaxPlausible) return { fsi: null, implausible: true };
  return { fsi, implausible: false };
}

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
  // WF3: 'new build' prices the as-of-right optimal config (opt_aor_gfa_sqm), NOT the max-build
  // envelope — else new_build > coa_build (incoherent: CoA can only add). The SELECT COALESCEs
  // opt_aor → max_buildable_gfa for the parcels lacking opt_aor. max_build_fsi below still reports
  // the *envelope* FSI (max_buildable_gfa ÷ lot) — a distinct reference from this priced area.
  { id: 'max_build',        archetype: 'FB',           areaField: 'opt_aor_gfa_sqm',            baseConfidence: 'high',   scalar: 'cost_fb_total',                  scalarKind: 'total' },
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
 * Escalation multiplier (§2.9): MAX(escalationMinMultiplier, index_now ÷ index_base). Never
 * deflate a fresh rate. Missing/invalid index OR base → escalationFallbackMultiplier (the
 * caller WARNs; the engine does not crash). index_base must be > 0 (enforced by the
 * rates-table CHECK + the logic-var Zod validation upstream; defended here too).
 *
 * Batch-2 row 2.4 — both the floor and the fallback are REQUIRED config values (variables 12/13,
 * both seeded 1 === the pre-conversion literals `Math.max(1, …)` / `return 1`), not defaults —
 * Rule 3 / Spec 122 §1.2a P4.
 *
 * @param {number|null|undefined} indexNow   logic_variables.cost_escalation_index
 * @param {number|null|undefined} indexBase  archetype_cost_rates.escalation_index_base
 * @param {{escalationMinMultiplier:number, escalationFallbackMultiplier:number}} cfg  REQUIRED
 * @returns {number} multiplier
 */
function escalationMultiplier(indexNow, indexBase, cfg) {
  if (!cfg || typeof cfg.escalationMinMultiplier !== 'number' || typeof cfg.escalationFallbackMultiplier !== 'number') {
    throw new Error('[parcel-cost] escalationMultiplier requires cfg.{escalationMinMultiplier,escalationFallbackMultiplier} (Rule 3 — no defaulted engine tunable)');
  }
  const now = num(indexNow);
  const base = num(indexBase);
  if (now === null || base === null || base <= 0) return cfg.escalationFallbackMultiplier;
  return Math.max(cfg.escalationMinMultiplier, now / base);
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
 *   multiplier is resolved PER-ARCHETYPE as MAX(cfg.escalationMinMultiplier, indexNow ÷
 *   rate.escalation_index_base) (each rate carries its own base, so a rate re-calibrated at a
 *   different index escalates correctly). Missing/invalid → cfg.escalationFallbackMultiplier
 *   (caller WARNs).
 * @param {Object} opts
 * @param {boolean} [opts.r2Grounded]
 * @param {{fsiMaxPlausible:number, escalationMinMultiplier:number, escalationFallbackMultiplier:number,
 *   premiumDefault:number, adjustmentFactorDefault:number, minPriceableAreaSqm:number}} opts.config
 *   REQUIRED (batch-2 row 2.4 — Rule 3 / Spec 122 §1.2a P4: no defaulted engine tunable). Resolved
 *   by the caller from the six `compute_parcel_cost_*` logic variables (§2(d) of the conversion plan).
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
  const cfg = opts.config;
  if (!cfg) {
    throw new Error('[parcel-cost] buildParcelCostMenu requires opts.config (Rule 3 — no defaulted engine tunable; see scripts/lib/compute/compute-parcel-cost-estimates.js)');
  }
  const premium = num(parcel.neighbourhood_cost_premium) ?? cfg.premiumDefault;
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
    if (area === null || area <= cfg.minPriceableAreaSqm) continue; // not computable → line absent (seed 0 ⇒ area <= 0, byte-identical to legacy)

    const rate = rates[line.archetype];
    if (!rate || num(rate.cost_per_sqm) === null) continue; // no rate seeded → absent (rows are NOT NULL/CHECK>0, so defensive)

    const adjFactor = num(rate.cost_adjustment_factor) ?? cfg.adjustmentFactorDefault;
    const escalationMult = escalationMultiplier(indexNow, rate.escalation_index_base, cfg);
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

  // FSI scalars (§2.5). Derived from parcel GFA ÷ lot; NULLed + counted when implausibly high (a garbage
  // max_buildable_gfa artifact) so they can't overflow NUMERIC(6,3). realized_fsi_p90 read-through (P2 populates).
  // NB (WF3): max_build_fsi is the *envelope* reference (max_buildable_gfa ÷ lot) — deliberately NOT
  // opt_aor. The max_build cost LINE now prices opt_aor (see PARCEL_COST_LINES); these two diverge by design.
  const lot = num(parcel.lot_size_sqm);
  const mb = plausibleFsi(num(parcel.max_buildable_gfa_sqm), lot, cfg.fsiMaxPlausible);
  const coa = plausibleFsi(num(parcel.opt_coa_gfa_sqm), lot, cfg.fsiMaxPlausible);
  scalars.max_build_fsi = mb.fsi;
  scalars.coa_fsi = coa.fsi;
  scalars.realized_fsi_p90 = num(parcel.realized_fsi_p90); // NULL in P1 — P2 family-aware norm read
  const fsiImplausible = mb.implausible || coa.implausible;

  return { menu, scalars, lineCount, confidenceCounts, fitGatedSuiteCount, fitGatedGarageCount, fsiImplausible };
}

module.exports = {
  PARCEL_COST_SCHEMA_VERSION,
  PARCEL_COST_LINES,
  PERMITTED_VALUES,
  FSI_MAX_PLAUSIBLE,
  escalationMultiplier,
  areaConfidenceFor,
  plausibleFsi,
  lineCost,
  buildParcelCostMenu,
};
