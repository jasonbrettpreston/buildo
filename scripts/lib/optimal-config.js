'use strict';
/**
 * optimal-config.js — the optimal-lot-configuration budget-allocation engine (Spec 78 Phase 2).
 *
 * Pure, deterministic, IO-free (mirrors scripts/lib/max-build.js). From a lot's RELIABLE inputs
 * (lot dims, by-law caps, max-build outputs, neighbourhood build-norms, building position) it derives
 * the as-of-right + CoA-upside build configurations: main build (coverage/FSI-bound) + suite-if-fits
 * (garden/laneway, evaluated conservatively against the CURRENT building — field-spec §P) + garage,
 * with opt_binding_constraint + opt_config_confidence and a trade-off resolver. NO DB / IO / throws —
 * invalid inputs yield a flagged/NULL result, never an exception. Phase 3 (enrich-parcels) maps DB
 * columns onto the input object and persists the output; this lib is the single source of the rules.
 *
 * By-law constants are the in-force Toronto Zoning By-law 569-2013, Chapter 150.7 office consolidation
 * (garden suites) verified 2026-06-26 against toronto.ca/zoning. NB: a 2025 DRAFT amendment (PH bg
 * 256978) proposes removing the 40% rear-yard footprint term (keeping the 20% all-ancillary cap) — NOT
 * yet enacted, so the 40% term is the baseline; BYLAW_VERSION flags the consolidation in force.
 *
 * SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md §Phase-2
 */

// --- By-law constants (569-2013 Ch.150.7 in-force consolidation). Operator-tunable where the by-law
//     may shift (footprint caps, soft-landscape %, separation) → also pinned in _contracts.json. ---
const BYLAW = {
  GARDEN_FOOTPRINT_REAR_FRAC: 0.4,        // footprint ≤ 40% of rear-yard area (150.7.60.70(1)(C)(i))
  GARDEN_FOOTPRINT_MAX_SQM: 60,           // ...AND ≤ 60 m² total floor area (150.7.60.70(1)(C)(ii))
  ANCILLARY_COVERAGE_MAX_FRAC: 0.2,       // all ancillary buildings ≤ 20% of lot (150.7.60.70(1)(B))
  GARDEN_HEIGHT_LOW_M: 4.0,               // height when 5.0–7.5 m from main (150.7.60.40(1)(A))
  GARDEN_HEIGHT_HIGH_M: 6.0,              // height when ≥ 7.5 m from main (150.7.60.40(1)(B))
  GARDEN_SEP_LOW_M: 5.0,                  // min separation for a ≤ 4.0 m suite (150.7.60.30(1)(A))
  GARDEN_SEP_HIGH_M: 7.5,                 // min separation for a > 4.0 m suite (150.7.60.30(1)(B))
  SOFT_LANDSCAPE_WIDE_FRAC: 0.5,          // ≥ 50% rear-yard soft landscaping, frontage > 6.0 (150.7.50.10(1)(A))
  SOFT_LANDSCAPE_NARROW_FRAC: 0.25,       // ≥ 25% when frontage ≤ 6.0 (150.7.50.10(1)(B))
  SOFT_LANDSCAPE_FRONTAGE_THRESHOLD_M: 6.0,
  SIDE_SETBACK_FRONTAGE_FRAC: 0.1,        // side = max(floor, 10% frontage) cap 3.0 (150.7.60.20(5))
  SIDE_SETBACK_MIN_OPENINGS_M: 1.5,       // floor when the side wall has window/door openings
  SIDE_SETBACK_MIN_NO_OPENINGS_M: 0.6,    // floor otherwise
  SIDE_SETBACK_MAX_M: 3.0,
  REAR_SETBACK_MIN_M: 1.5,                // rear setback (150.7.60.20(2)(A))
  DEEP_LOT_DEPTH_M: 45.0,                 // > this → rear = max(½ height, 1.5)
  LANEWAY_FOOTPRINT_MAX_SQM: 60,          // laneway suite footprint ≤ 60 m² (8.0 × 10.0)
  LANEWAY_ABUTS_MIN_M: 3.5,               // requires ≥ 3.5 m of abutting public lane
  GARAGE_CAR_FOOTPRINT_SQM: 18.5,         // one-car floor — never 0-car as-of-right (Phase-0 fix)
  GARAGE_MAX_SQM: 60,
};
const BYLAW_VERSION = '569-2013_consolidation_2025';

// --- Pure rule helpers (each independently logic-tested) ---

/** Garden-suite footprint cap: lesser of 40% of the rear-yard area and the 60 m² hard cap. */
function gardenSuiteFootprintCap(rearYardAreaSqm) {
  if (!(rearYardAreaSqm > 0)) return 0;
  return Math.min(BYLAW.GARDEN_FOOTPRINT_REAR_FRAC * rearYardAreaSqm, BYLAW.GARDEN_FOOTPRINT_MAX_SQM);
}

/** Soft-landscaping fraction of the rear yard, by lot frontage (50% wide / 25% narrow). */
function softLandscapeFrac(frontageM) {
  return frontageM > BYLAW.SOFT_LANDSCAPE_FRONTAGE_THRESHOLD_M
    ? BYLAW.SOFT_LANDSCAPE_WIDE_FRAC
    : BYLAW.SOFT_LANDSCAPE_NARROW_FRAC;
}

/**
 * The garden-suite height permitted by the AVAILABLE separation from the main building.
 * ≥ 7.5 m → 6.0 m; ≥ 5.0 m → 4.0 m; below 5.0 m → null (no compliant suite height fits).
 */
function gardenHeightForSeparation(separationM) {
  if (!(separationM >= BYLAW.GARDEN_SEP_LOW_M)) return null;
  return separationM >= BYLAW.GARDEN_SEP_HIGH_M ? BYLAW.GARDEN_HEIGHT_HIGH_M : BYLAW.GARDEN_HEIGHT_LOW_M;
}

/** Side setback = max(floor, 10% of frontage) capped at 3.0; floor depends on side-wall openings. */
function sideSetback(frontageM, hasOpenings) {
  const floor = hasOpenings ? BYLAW.SIDE_SETBACK_MIN_OPENINGS_M : BYLAW.SIDE_SETBACK_MIN_NO_OPENINGS_M;
  return Math.min(BYLAW.SIDE_SETBACK_MAX_M, Math.max(floor, BYLAW.SIDE_SETBACK_FRONTAGE_FRAC * (frontageM || 0)));
}

/** Rear setback: through-lot → adjacent front-yard setback; deep lot → max(½ height, 1.5); else 1.5. */
function rearSetback({ depthM, suiteHeightM, isThroughLot, adjacentFrontSetbackM }) {
  if (isThroughLot) return adjacentFrontSetbackM != null ? adjacentFrontSetbackM : BYLAW.REAR_SETBACK_MIN_M;
  if (depthM > BYLAW.DEEP_LOT_DEPTH_M) return Math.max(0.5 * (suiteHeightM || 0), BYLAW.REAR_SETBACK_MIN_M);
  return BYLAW.REAR_SETBACK_MIN_M;
}

/**
 * Main-build GFA under the coverage + FSI caps. NULL-FSI guard: when fsiCap is absent, GFA falls back
 * to footprint × storeys (never an unbounded value). Returns { gfa, binding } where binding ∈
 * {'coverage','fsi'} — which cap actually bound the GFA.
 */
function mainBuildGfa({ footprintSqm, storeys, lotSizeSqm, fsiCap }) {
  const byFootprint = (footprintSqm || 0) * (storeys || 0);
  if (fsiCap == null || !(lotSizeSqm > 0)) return { gfa: byFootprint, binding: 'coverage' };
  const byFsi = fsiCap * lotSizeSqm;
  return byFsi < byFootprint ? { gfa: byFsi, binding: 'fsi' } : { gfa: byFootprint, binding: 'coverage' };
}

/**
 * Can a GARDEN suite fit behind the CURRENT building (conservative, field-spec §P)? Evaluated against
 * the existing rear-yard envelope, NOT a hypothetical max-rebuilt house. Returns a structured verdict
 * with the binding reason so the caller can surface opt_binding_constraint.
 *
 * @param p.rearYardAreaSqm  area behind the current building's rear main wall (Phase-3 position geom)
 * @param p.rearBehindMaxM   usable rear-yard depth behind the current house (depth − front − houseDepth − rear setback)
 * @param p.existingAncillarySqm  footprint already occupied by garage/shed (counts to the 20% cap)
 * @param p.mainGfaSqm       current/optimal main-house GFA (suite GFA must be strictly less)
 */
function gardenSuiteFit(p) {
  const reason = (binding) => ({ fits: false, binding, footprintSqm: 0, gfaSqm: 0, heightM: null });
  if (p.isThroughLot) return reason('through_lot');               // through lot → no rear-yard suite
  if (!(p.rearYardAreaSqm > 0)) return reason('depth');           // no rear yard at all

  const softFrac = softLandscapeFrac(p.frontageM);
  const buildableRearSqm = (1 - softFrac) * p.rearYardAreaSqm;     // soft-landscape floor reserves the rest
  const footprintCap = gardenSuiteFootprintCap(p.rearYardAreaSqm);
  const ancillaryHeadroomSqm = BYLAW.ANCILLARY_COVERAGE_MAX_FRAC * (p.lotSizeSqm || 0) - (p.existingAncillarySqm || 0);

  let footprint = Math.min(footprintCap, buildableRearSqm, ancillaryHeadroomSqm);
  if (!(footprint > 0)) {
    // which cap drove it to zero?
    if (ancillaryHeadroomSqm <= 0) return reason('coverage');
    if (buildableRearSqm <= 0) return reason('soft_landscaping');
    return reason('depth');
  }

  // Separation/depth (conservative, square-footprint proxy = sqrt(area)): the rear yard behind the
  // CURRENT house must seat GARDEN_SEP_LOW_M of clear separation + the suite footprint depth + the rear
  // setback. rearBehindMaxM (when provided) is the position-derived usable depth; null → area-only fit
  // (lower confidence). A depth-constrained yard SHRINKS the suite (a smaller suite is always permitted)
  // rather than failing outright — only a yard too shallow for even the minimum-separation suite fails.
  let heightM = BYLAW.GARDEN_HEIGHT_LOW_M;
  if (p.rearBehindMaxM != null) {
    const maxFootprintDepthM = p.rearBehindMaxM - BYLAW.GARDEN_SEP_LOW_M - BYLAW.REAR_SETBACK_MIN_M;
    if (!(maxFootprintDepthM > 0)) return reason('depth');        // too shallow even at min separation
    let footprintDepthM = Math.sqrt(footprint);
    if (footprintDepthM > maxFootprintDepthM) {                   // shrink to fit the available depth
      footprintDepthM = maxFootprintDepthM;
      footprint = footprintDepthM * footprintDepthM;
    }
    const sepAvailableM = p.rearBehindMaxM - footprintDepthM - BYLAW.REAR_SETBACK_MIN_M;
    heightM = gardenHeightForSeparation(sepAvailableM);
    if (heightM == null) return reason('depth');                 // defensive — shrink guarantees ≥ 5.0 m
  }

  const storeys = heightM >= BYLAW.GARDEN_HEIGHT_HIGH_M ? 2 : 1;  // 6.0 m → 2 storeys, 4.0 m → 1
  let gfaSqm = footprint * storeys;
  if (p.mainGfaSqm != null && gfaSqm >= p.mainGfaSqm) {           // suite GFA must be < main-house GFA
    storeys === 2 && (gfaSqm = footprint);                        // try single storey
    if (gfaSqm >= p.mainGfaSqm) return reason('fsi');             // still too big → suppressed
  }
  return { fits: true, binding: null, footprintSqm: round2(footprint), gfaSqm: round2(gfaSqm), heightM };
}

/**
 * Lane-abutment gate. Prefers the metres signal (`abutsLanewayM ≥ 3.5`); falls back to the boolean
 * `abutsLaneway` when no metre value is available — Spec 62 #431-FU2 currently emits only the boolean
 * `parcels.abuts_laneway`, so Phase 3 supplies the boolean until the richer lane-dimension field lands.
 */
function lanewayAbutmentOk(p) {
  return p.abutsLanewayM != null ? p.abutsLanewayM >= BYLAW.LANEWAY_ABUTS_MIN_M : !!p.abutsLaneway;
}

/** Can a LANEWAY suite fit? Requires an abutting lane; footprint ≤ 60 m²; GFA < main above-grade. */
function lanewaySuiteFit(p) {
  if (!lanewayAbutmentOk(p)) return { fits: false, binding: 'no_lane', footprintSqm: 0, gfaSqm: 0 };
  const ancillaryHeadroomSqm = BYLAW.ANCILLARY_COVERAGE_MAX_FRAC * (p.lotSizeSqm || 0) - (p.existingAncillarySqm || 0);
  const footprint = Math.min(BYLAW.LANEWAY_FOOTPRINT_MAX_SQM, ancillaryHeadroomSqm);
  if (!(footprint > 0)) return { fits: false, binding: 'coverage', footprintSqm: 0, gfaSqm: 0 };
  let gfaSqm = footprint; // 1-storey baseline; Phase-3 position geom can extend
  if (p.mainGfaSqm != null && gfaSqm >= p.mainGfaSqm) return { fits: false, binding: 'fsi', footprintSqm: 0, gfaSqm: 0 };
  return { fits: true, binding: null, footprintSqm: round2(footprint), gfaSqm: round2(gfaSqm) };
}

/** opt_config_confidence ∈ {high, medium, low} from lot-size confidence, FSI presence, accessory suspicion. */
function configConfidence(p) {
  if (p.lotSizeConfidence === 'low' || !(p.lotSizeSqm > 0)) return 'low';
  if (p.fsiCap == null || p.existingAccessorySuspected) return 'medium';
  return 'high';
}

function round2(n) { return n == null ? n : Math.round(n * 100) / 100; }

/**
 * Build one configuration tier (as-of-right or CoA-upside).
 * @param storeys  the storey count for this tier (nbhd p50 for as-of-right, p90 for CoA-upside)
 * @param allowSuite  whether a rear suite may be added (gated off for holding zones)
 */
function buildTier(p, storeys, allowSuite) {
  // Main build: footprint = coverage cap (lot × coverage_cap_frac, or the validated max-build footprint).
  const coverageFootprint = p.maxBuildableFootprintSqm != null
    ? p.maxBuildableFootprintSqm
    : (p.coverageCapFrac || 0) * (p.lotSizeSqm || 0);
  const main = mainBuildGfa({ footprintSqm: coverageFootprint, storeys, lotSizeSqm: p.lotSizeSqm, fsiCap: p.fsiCap });

  const suiteCtx = { ...p, mainGfaSqm: main.gfa };

  // Suite: laneway preferred (separate access, no rear-yard consumption), else garden. suite_binding
  // records the reason the chosen-or-attempted suite missed — laneway-first if a lane abuts, else garden
  // — so bindingConstraint reads it instead of re-deriving (was a wrong-path re-run, Gemini HIGH).
  let suite = null;
  let suiteBinding = allowSuite ? null : 'holding';
  if (allowSuite) {
    const laneway = lanewaySuiteFit(suiteCtx);
    const garden = gardenSuiteFit(suiteCtx);
    if (laneway.fits) suite = { type: 'laneway', ...laneway };
    else if (garden.fits) suite = { type: 'garden', ...garden };
    else suiteBinding = lanewayAbutmentOk(p) ? laneway.binding : garden.binding;
  }

  // Garage gets the ancillary headroom REMAINING after the suite — the 20% all-ancillary cap is SHARED
  // (suite + garage + existing); evaluating them independently could over-allocate (CR/DeepSeek HIGH).
  const suiteFootprint = suite ? suite.footprintSqm : 0;
  const garage = garageFit({ ...p, existingAncillarySqm: (p.existingAncillarySqm || 0) + suiteFootprint });

  const totalGfa = round2(main.gfa + (suite ? suite.gfaSqm : 0));
  return {
    main_footprint_sqm: round2(coverageFootprint),
    main_storeys: storeys,
    main_gfa_sqm: round2(main.gfa),
    main_gfa_binding: main.binding,
    suite,
    suite_binding: suiteBinding,
    garage,
    total_gfa_sqm: totalGfa,
  };
}

/** Garage (one-car floor 18.5 m², cap 60 m²; counts to the 20% ancillary cap). */
function garageFit(p) {
  const headroom = BYLAW.ANCILLARY_COVERAGE_MAX_FRAC * (p.lotSizeSqm || 0) - (p.existingAncillarySqm || 0);
  if (!(headroom >= BYLAW.GARAGE_CAR_FOOTPRINT_SQM)) return { fits: false, footprintSqm: 0 };
  return { fits: true, footprintSqm: round2(Math.min(BYLAW.GARAGE_MAX_SQM, headroom)) };
}

/**
 * The whole-parcel optimal configuration. Emits the as-of-right + CoA-upside tiers, the binding
 * constraint, the confidence, and the trade-off-resolved main+suite combination.
 */
function computeOptimalConfig(parcel) {
  const p = parcel || {};
  const isHolding = !!p.isHolding;
  const blocked = isHolding || p.isHeritageFreeze; // hard gates on the as-of-right suite

  // As-of-right: storeys = nbhd p50; CoA-upside: storeys = nbhd p90 (CoA = up, not out — footprint
  // unchanged between tiers). Fall back to 2 storeys when the norm is absent.
  const p50 = p.nbhdStoreysP50 || 2;
  const p90 = p.nbhdStoreysP90 || p50;

  const asOfRight = buildTier(p, p50, !blocked);
  const coaUpside = buildTier(p, p90, !isHolding); // CoA can relieve heritage-massing but not holding

  // Trade-off resolver: a max-coverage main house may leave no rear yard for a suite. Compare
  // {max-main + whatever suite fits} vs {a shorter main that frees suite room}. We only have one main
  // footprint (the coverage cap), so the resolved combo is simply the tier whose TOTAL GFA is higher —
  // and we record whether adding the suite beat main-only.
  const mainOnlyGfa = asOfRight.main_gfa_sqm;
  const withSuiteGfa = asOfRight.total_gfa_sqm;
  const suiteAddsValue = asOfRight.suite != null && withSuiteGfa > mainOnlyGfa;

  const binding = bindingConstraint(p, asOfRight);
  return {
    bylaw_version: BYLAW_VERSION,
    as_of_right: asOfRight,
    coa_upside: coaUpside,
    opt_binding_constraint: binding,
    opt_config_confidence: configConfidence(p),
    opt_suite_fits_full: asOfRight.suite != null,
    opt_suite_type: asOfRight.suite ? asOfRight.suite.type : null,
    opt_suite_adds_value: suiteAddsValue,
    opt_coa_gfa_uplift_sqm: round2(coaUpside.main_gfa_sqm - asOfRight.main_gfa_sqm),
  };
}

/** Resolve opt_binding_constraint: site gates first, then the main-build cap, then the suite's miss
 *  (read from tier.suite_binding, which buildTier recorded for the actually-attempted suite path). */
function bindingConstraint(p, tier) {
  if (p.isHolding) return 'holding';
  if (p.isHeritageFreeze) return 'heritage';
  if (p.isRavine) return 'ravine';
  if (p.isThroughLot && !tier.suite) return 'through_lot';
  if (tier.main_gfa_binding === 'fsi') return 'fsi';
  if (!tier.suite && tier.suite_binding) return tier.suite_binding;
  return 'coverage';
}

module.exports = {
  BYLAW,
  BYLAW_VERSION,
  gardenSuiteFootprintCap,
  softLandscapeFrac,
  gardenHeightForSeparation,
  sideSetback,
  rearSetback,
  mainBuildGfa,
  gardenSuiteFit,
  lanewayAbutmentOk,
  lanewaySuiteFit,
  garageFit,
  configConfidence,
  buildTier,
  bindingConstraint,
  computeOptimalConfig,
};
