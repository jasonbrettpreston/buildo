'use strict';
/**
 * SPEC LINK: docs/specs/01-pipeline/83_lead_cost_model.md §3-ARCHETYPE (the mapper)
 *            docs/specs/01-pipeline/88_parcel_cost_model.md §2.3 (the lines consumed)
 *
 * The scope→archetype-line mapper (WF2 2026-07-06): selects WHICH Spec-88 cost line prices a
 * permit/CoA from the EXISTING Spec 41/42 outputs (project_type + scope_tags + structure_type) —
 * no classifier changes; the mapping happens at COST time.
 *
 * Lives beside the Brain (NOT scripts/lib): the Brain is bundled into Next.js and must not import
 * from scripts/ (Integration plan-review blocker). scripts→src requires are the sanctioned
 * direction (precedent: compute-cost-estimates.js requires the Brain).
 *
 * Design rules (each pinned by a unit test — plan-review folds):
 *  - normalizeTag strips ANY `word:` prefix (`alter:`/`new:`/… — `alter:interior-alterations` is
 *    the single largest live tag, 39K uses; mirrors scripts/lib/archetypes.js baseSlug).
 *  - FB-family tags (`build-sfd`, `new-construction`) map ONLY when project_type === 'new_build'
 *    (permits) — else a mechanical permit tagged with a building type reads as a full build.
 *  - Dominance hierarchy resolves benign co-scope; the ADDITIVE PAIRS (underpin+basement,
 *    kitchen+bath, gut+addition) return BOTH lines — the Brain sums the two line TOTALS (each
 *    per-sqm × its OWN area basis; never Σper-sqm × one shared area).
 *  - Reno-build escalation: ≥9 active trades + a build-scope line → the FB line (Findings W7).
 *  - CoA: NewConstruction → coa_build (accessory tags never demote it); Mixed → tag dominance,
 *    tagless Mixed → coa_build; Severance/Demolition → null (T4).
 *  - Returning null IS the T4 selector (the caller's residential gate alone is not sufficient —
 *    MEC-only residential permits must fall through to the legacy path).
 */

// ── Line definitions (Spec 88 §2.3) ─────────────────────────────────────────
// scalarCol/areaCol are the §4D-propagated permit/coa columns; kind 'total' scalars are the
// premium-INCLUSIVE line totals, 'per_sqm' scalars are already per-sqm. rateKey = archetype_cost_rates
// key for the T3 inline path. class drives the T2 plausibility bound family. fitGated lines carry
// Spec 88 §2.4 `fits` semantics (a null scalar on them means "doesn't fit" → cost null, NOT a fallback).
const LINE_DEFS = {
  max_build:     { scalarCol: 'cost_fb_total',            kind: 'total',   areaCol: 'opt_aor_gfa_sqm',              rateKey: 'FB',            class: 'build', fitGated: false, ownAreaField: 'residential_sqm' },
  coa_build:     { scalarCol: 'cost_coa_total',           kind: 'total',   areaCol: 'opt_coa_gfa_sqm',              rateKey: 'CoA',           class: 'build', fitGated: false, ownAreaField: 'residential_sqm' },
  addition:      { scalarCol: 'cost_addition_total',      kind: 'total',   areaCol: 'cur_floor_gfa_sqm',            rateKey: 'ADD',           class: 'reno',  fitGated: false, ownAreaField: 'residential_sqm' },
  gut:           { scalarCol: 'cost_gut_total',           kind: 'total',   areaCol: 'cur_pot_2story_gfa_sqm',       rateKey: 'INT',           class: 'reno',  fitGated: false, ownAreaField: 'interior_alterations_sqm' },
  underpin:      { scalarCol: 'cost_basement_underpin_per_sqm', kind: 'per_sqm', areaCol: 'cur_floor_gfa_sqm',      rateKey: 'BAS_UNDERPIN',  class: 'reno',  fitGated: false, ownAreaField: 'interior_alterations_sqm' },
  basement:      { scalarCol: 'cost_basement_per_sqm',    kind: 'per_sqm', areaCol: 'cur_floor_gfa_sqm',            rateKey: 'BAS',           class: 'reno',  fitGated: false, ownAreaField: 'interior_alterations_sqm' },
  garage:        { scalarCol: 'cost_garage_total',        kind: 'total',   areaCol: 'max_garage_gfa_sqm',           rateKey: 'GAR',           class: 'reno',  fitGated: true,  ownAreaField: null },
  laneway_suite: { scalarCol: 'cost_laneway_suite_total', kind: 'total',   areaCol: 'max_laneway_suite_gfa_sqm',    rateKey: 'LANE_LANEWAY',  class: 'reno',  fitGated: true,  ownAreaField: null },
  garden_suite:  { scalarCol: 'cost_garden_suite_total',  kind: 'total',   areaCol: 'max_garden_suite_gfa_sqm',     rateKey: 'LANE_GARDEN',   class: 'reno',  fitGated: true,  ownAreaField: null },
  kitchen:       { scalarCol: 'cost_kitchen_per_sqm',     kind: 'per_sqm', areaCol: 'cur_est_kitchen_gfa_sqm',      rateKey: 'KIT',           class: 'reno',  fitGated: false, ownAreaField: 'interior_alterations_sqm' },
  bath:          { scalarCol: 'cost_bath_per_sqm',        kind: 'per_sqm', areaCol: 'cur_est_bath_gfa_sqm',         rateKey: 'BTH',           class: 'reno',  fitGated: false, ownAreaField: 'interior_alterations_sqm' },
  solar:         { scalarCol: 'cost_solar_total',         kind: 'total',   areaCol: 'max_buildable_footprint_sqm',  rateKey: 'SOLAR',         class: 'reno',  fitGated: false, ownAreaField: null },
};

// ── The tag→line table (built on the LIVE normalized vocabulary, 2026-07-06) ─
// Descriptor tags (building types: residential/commercial/office/…; storey markers: two-storey/
// 2nd-floor/…) and non-archetype scopes (MEC: hvac/plumbing/drain/electrical/roofing/sprinkler/…;
// SITE/ENV: deck/porch/balcony/canopy/fence/pool/…; demolition/severance) are DELIBERATELY absent —
// unmapped tags contribute nothing, and a lead with ONLY unmapped tags maps to null → T4.
const FB_TAGS = new Set(['build-sfd', 'new-construction']);
const TAG_LINE = {
  addition: 'addition',
  'rear-addition': 'addition',
  'front-addition': 'addition',
  'side-addition': 'addition',
  'storey-addition': 'addition',
  dormer: 'addition',
  'interior-alterations': 'gut',
  'open-concept': 'gut',
  'structural-beam': 'gut',
  'fire-damage': 'gut',
  'tenant-fitout': 'gut',
  renovation: 'gut',
  // conversions reconfigure the interior → gut (DECIDED: second-suite is a conversion, not a build)
  'second-suite': 'gut',
  'secondary-suite': 'gut',
  'unit-conversion': 'gut',
  'convert-unit': 'gut',
  'houseplex-2-unit': 'gut',
  'houseplex-3-unit': 'gut',
  'houseplex-4-unit': 'gut',
  underpinning: 'underpin',
  foundation: 'underpin',
  basement: 'basement',
  'finished-basement': 'basement',
  'basement-finish': 'basement',
  walkout: 'basement',
  garage: 'garage',
  carport: 'garage',
  'accessory-building': 'garage',
  'accessory-structure': 'garage',
  'laneway-suite': 'laneway_suite',
  kitchen: 'kitchen',
  bathroom: 'bath',
  solar: 'solar',
};

// Dominance: the higher line already prices the whole project when scopes co-occur (except the
// additive pairs below, which are genuinely two menu items).
const DOMINANCE = ['max_build', 'coa_build', 'laneway_suite', 'garden_suite', 'addition', 'gut',
  'underpin', 'basement', 'garage', 'kitchen', 'bath', 'solar'];

// Genuinely-additive menu pairs (live-measured ~258 leads; kept because the sums are sane).
const ADDITIVE_PAIRS = [
  ['underpin', 'basement'],
  ['kitchen', 'bath'],
  ['gut', 'addition'],
];

const RENO_BUILD_TRADE_THRESHOLD = 9; // Findings report W7: ≥9 active trades = new-build scope

// MIRRORED IMPLEMENTATION: scripts/lib/build-norms.js LOW_RISE_RESIDENTIAL_RE — the Brain cannot
// import scripts/lib (Next bundle boundary). Any rule change there MUST be applied here; the parity
// test in archetype-cost-map.logic.test.ts pins the two. NULL structure_type is RETAINED (unknown on
// a genuine new-build; the T2 plausibility bounds backstop a NULL-that's-secretly-a-tower).
const LOW_RISE_RESIDENTIAL_RE = /sfd|townhouse|duplex|converted house|laneway|rear yard suite|unit - (detached|semi)/i;
function isLowRiseResidential(structureType) {
  return structureType == null || LOW_RISE_RESIDENTIAL_RE.test(structureType);
}

/** Strip any `word:` prefix (mirrors scripts/lib/archetypes.js baseSlug) + lowercase/trim. */
function normalizeTag(tag) {
  if (!tag || typeof tag !== 'string') return '';
  return tag.trim().toLowerCase().replace(/^[a-z0-9_-]+:/, '');
}

/**
 * Map a lead's scope to its archetype line(s).
 * @param {object} lead
 * @param {string|null} lead.projectType   permits: new_build/addition/renovation/…; CoA: NewConstruction/Addition/Mixed/…
 * @param {string[]|null} lead.scopeTags
 * @param {string|null} lead.structureType
 * @param {boolean} lead.isCoa
 * @param {number} lead.activeTradeCount   deduped classified trade count (the W7 escalation input)
 * @returns {{ lines: string[], mapKind: 'clean'|'dominant'|'additive'|'escalated'|'fallback' } | null}
 *          null = no archetype (the T4 selector). lines.length 2 only for additive pairs.
 */
function mapToLines(lead) {
  const projectType = (lead.projectType || '').trim();
  const tags = Array.isArray(lead.scopeTags) ? lead.scopeTags.map(normalizeTag).filter(Boolean) : [];
  const isCoa = Boolean(lead.isCoa);
  const structureType = (lead.structureType || '').toLowerCase();

  // ── CoA project_type rules first ──
  if (isCoa) {
    if (/^severance$/i.test(projectType) || /^demolition$/i.test(projectType)) return null;
    // A CoA new build is by definition seeking the CoA-upside envelope; accessory tags never demote it.
    if (/^newconstruction$/i.test(projectType)) return { lines: ['coa_build'], mapKind: 'clean' };
  }

  // ── Collect candidate lines from the tags ──
  const candidates = new Set();
  for (const t of tags) {
    if (FB_TAGS.has(t)) {
      // FB-gate: a building-type tag on a mechanical/other permit is NOT a build (the ~7K trap).
      if (!isCoa && projectType === 'new_build') candidates.add('max_build');
      if (isCoa) candidates.add('coa_build'); // tag-driven CoA new-construction (rare; Mixed etc.)
      continue;
    }
    const line = TAG_LINE[t];
    if (line) candidates.add(isCoa && line === 'max_build' ? 'coa_build' : line);
  }
  // Permit-side project_type reinforcement (tagless-but-typed leads).
  if (!isCoa && projectType === 'new_build') candidates.add('max_build');
  if (!isCoa && projectType === 'addition' && candidates.size === 0) candidates.add('addition');
  if (isCoa && /^addition$/i.test(projectType) && candidates.size === 0) candidates.add('addition');
  // Laneway structure override (the structure IS the project).
  if (/laneway|rear yard suite/.test(structureType)) {
    candidates.clear();
    candidates.add('laneway_suite');
  }
  // renovation→gut fallback: a 'renovation' project with no mapped scope tag is an interior reno.
  let fallback = false;
  if (candidates.size === 0 && !isCoa && projectType === 'renovation') {
    candidates.add('gut');
    fallback = true;
  }
  // CoA Mixed with no mapped tags → the CoA build envelope (the conservative anchor).
  if (candidates.size === 0 && isCoa && /^mixed$/i.test(projectType)) {
    candidates.add('coa_build');
    fallback = true;
  }

  if (candidates.size === 0) return null; // T4

  // ── Reno-build escalation (Findings W7): ≥9 trades + build-scope lines = a full build. ──
  // The ≥9-trade signal redirects a hidden full-rebuild (a real rebuild filed as a small reno,
  // Finding 7) to the larger max_build AREA basis. But the escalated line inherits its ORIGIN
  // cap class (WF3 2026-07-06, Reality-Check/Guardian): a GENUINE build signal (an FB tag or
  // project_type='new_build' already put max_build in `candidates`) keeps the build cap; a
  // reno-origin escalation (gut/addition only — e.g. a tagless renovation→gut fallback with an
  // over-classified trade count) is bounded by the RENO cap, so an inflated opt_aor_gfa area
  // basis can't blow a deck/interior-gut past the reno ceiling (the F1 $15–19M explosions).
  // W7 is PRESERVED, not retired: a reno-origin rebuild whose max_build total is ≤ the reno cap
  // still prices as max_build (archetype lines price off real §4D area, never the legacy 0.25×
  // scope-matrix multiplier Finding 7 was written against — so a bounded escalation cannot
  // reintroduce that under-pricing). Over-cap reno-origin rows fall to T4.
  const buildScope = candidates.has('gut') || candidates.has('addition') || candidates.has('max_build');
  if (!isCoa && buildScope && Number(lead.activeTradeCount) >= RENO_BUILD_TRADE_THRESHOLD) {
    const capClass = candidates.has('max_build') ? 'build' : 'reno';
    return { lines: ['max_build'], mapKind: 'escalated', capClass };
  }

  // ── Additive pairs: exactly the two lines present (after FB/laneway handling) → sum both. ──
  for (const [a, b] of ADDITIVE_PAIRS) {
    if (candidates.has(a) && candidates.has(b)) {
      const rest = [...candidates].filter((l) => l !== a && l !== b);
      // Only when nothing HIGHER-dominance rides along (a max_build+underpin+basement is a build).
      const highest = DOMINANCE.find((l) => candidates.has(l));
      if (rest.length === 0 || highest === a || highest === b) {
        return { lines: [a, b], mapKind: 'additive' };
      }
    }
  }

  // ── Dominance ──
  const winner = DOMINANCE.find((l) => candidates.has(l));
  return {
    lines: [winner],
    mapKind: fallback ? 'fallback' : candidates.size === 1 ? 'clean' : 'dominant',
  };
}

module.exports = { LINE_DEFS, TAG_LINE, FB_TAGS, DOMINANCE, ADDITIVE_PAIRS, RENO_BUILD_TRADE_THRESHOLD, normalizeTag, mapToLines, isLowRiseResidential, LOW_RISE_RESIDENTIAL_RE };
