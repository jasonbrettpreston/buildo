'use strict';
/**
 * coa-trade-classifier — TAG_PATTERNS scope-tag → trade matrix for CoA leads.
 *
 * Twin-extracted from `scripts/classify-permits.js`'s in-process matrix
 * (TAG_TRADE_MATRIX + TAG_ALIASES + normalizeTag + lookupTradesForTags).
 *
 * Per R0.8 audit + R2.v3 design pivot: trade_mapping_rules has 0 Tier-3
 * description rules in production. The actual production trade classifier
 * is this inline matrix. CoA classifier reuses it verbatim, sourced from
 * coa_applications.scope_tags.
 *
 * R2.v5 fix E (Worktree HIGH 82%): `isTradeActiveInPhase(slug, null)` MUST
 * return true (pass-through). Without the explicit null-phase guard, the
 * twin's `PHASE_TRADES[phase] || []` evaluates to `[]` for null/undefined
 * phase → `.includes(slug)` returns false for every trade → zero
 * lead_trades rows for every CoA. The CoA twin returns null phase by
 * design (no construction stage at CoA submission time); the null guard
 * makes pass-through explicit.
 *
 * SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.11 Phase D R5.1
 *
 * DUAL PATH NOTE (Spec 47 §9.1): src/lib/classification/coa-trade-classifier.ts
 * is the functional twin of this module. Parity is locked-in by
 * src/tests/coa-trade-classifier.logic.test.ts (JS↔TS fixture-matrix tests
 * over lookupTradesForTags, TAG_TRADE_MATRIX keys, TAG_ALIASES, PHASE_TRADES,
 * isTradeActiveInPhase, shouldAppendRealtor).
 *
 * Spec 80 §5.B.5 (Phase 3 — CoA classifier parity): the archetype bundle prior
 * is shared with permits via scripts/lib/archetypes.js, but CoA carries a DIFFERENT
 * vocab (PascalCase project_type + its own ~31-tag set), so a translation layer
 * (COA_PROJECT_TYPE_MAP + COA_TAG_TO_ARCHETYPE_TAG → deriveArchetypesForCoa) maps
 * CoA inputs onto the permit-side keys deriveArchetypes() understands BEFORE
 * delegating to the shared engine. classifyCoaTrades() merges the direct
 * tag-matrix path with the bundle prior (MAX-dedup, deprecated-filtered).
 */

const { deriveArchetypes, bundleSlugsFor } = require('./archetypes');
const { lookupProductsForTags } = require('./tag-product-matrix');

// Product-confidence tiers — DUPLICATED verbatim from scripts/classify-permits.js:42-43
// (and src/lib/classification/classifier.ts) to keep the CoA product path in lockstep
// with the permit path WITHOUT touching the live permit file. A parity test pins both
// sites to these exact values so they cannot drift. (Spec 80 §5.B; recalibration deferred.)
const PRODUCT_TAG_CONFIDENCE = 0.75;    // direct scope_tag → product hit
const PRODUCT_BUNDLE_CONFIDENCE = 0.45; // archetype-implied product (bundle prior; below tag hits)

// ──────────────────────────────────────────────────────────────────────
// TAG_ALIASES (verbatim from classify-permits.js:168)
// ──────────────────────────────────────────────────────────────────────
// R5.4 R8 fold #4: CoA-side TAG_ALIASES additions to cover high-frequency R5.3
// emissions that have no direct matrix entry. `dwelling` is the meta-tag for
// residential structures (build-sfd is the closest matrix trade-set); `renovation`
// is the meta-tag for interior renovation work (interior is the matrix entry).
// Variance-only tags (severance, setback, parking, lot-coverage, minor-variance)
// intentionally remain unmapped — they represent no construction work.
const TAG_ALIASES = {
  'roofing': 'roof',
  'laneway-suite': 'laneway',
  'fire-alarm': 'fire_alarm',
  'interior-alterations': 'interior',
  'finished-basement': 'basement',
  'basement-finish': 'basement',
  'stacked-townhouse': 'townhouse',
  'semi-detached': 'semi',
  'condo': 'apartment',
  'rear-addition': 'addition',
  'front-addition': 'addition',
  'side-addition': 'addition',
  'storey-addition': 'addition',
  '2nd-floor': 'addition',
  '3rd-floor': 'addition',
  'convert-unit': 'unit-conversion',
  // R5.4 R8 fold #4 — CoA-side coverage gap fills (initial set):
  'dwelling': 'build-sfd',
  'renovation': 'interior',
  // R5.4 review fold (Worktree#2 IMP-6 CRIT) — additional R5.3-emitted tag
  // coverage gaps confirmed by walking coa-scope-classifier.js TAG_PATTERNS:
  //   - `secondary-suite` → `second-suite` (hyphen-spelling mismatch: matrix
  //     entry exists but unreachable without alias; high-frequency Toronto
  //     CoA type — secondary suite additions in residential basements)
  //   - `accessory-structure` → `accessory-building` (matrix key uses
  //     `building`; R5.3 emits `structure`)
  //   - `new-construction` → `build-sfd` (project-type tag fires when desc
  //     says "construct a new ..." without the word "dwelling" — most
  //     defensible universal mapping; build-sfd's 15-trade set is the
  //     superset for residential new construction)
  //   - `service-shop` → `retail` (commercial fitout — auto-repair, personal
  //     service shops typically involve retail-equivalent trades)
  //   - `mixed-use` → `tenant-fitout` (combined res+commercial; fitout
  //     trades are the common subset)
  'secondary-suite': 'second-suite',
  'accessory-structure': 'accessory-building',
  'new-construction': 'build-sfd',
  'service-shop': 'retail',
  'mixed-use': 'tenant-fitout',
};

// R5.4 R8 fold #6 (Gemini CRIT): defensive lowercase normalization. R5.3 emits
// lowercase tags today, but upstream changes could regress. Single .toLowerCase()
// at function entry makes the matrix lookup case-insensitive.
function normalizeTag(tag) {
  let base = tag.toLowerCase().replace(/^(new|alter|sys|scale|exp):/, '');
  base = base.replace(/^houseplex-\d+-unit$/, 'houseplex');
  return TAG_ALIASES[base] ?? base;
}

// ──────────────────────────────────────────────────────────────────────
// TAG_TRADE_MATRIX (verbatim from classify-permits.js:193)
// ──────────────────────────────────────────────────────────────────────
const TAG_TRADE_MATRIX = {
  kitchen: [['plumbing',0.80],['electrical',0.80],['flooring',0.65],['drywall',0.60],['painting',0.55]],
  bathroom: [['plumbing',0.85],['drywall',0.70],['glazing',0.60],['electrical',0.65],['waterproofing',0.60],['painting',0.55]],
  basement: [['framing',0.75],['drywall',0.75],['plumbing',0.70],['electrical',0.75],['insulation',0.70],['flooring',0.65],['waterproofing',0.65],['painting',0.55]],
  pool: [['excavation',0.75],['concrete',0.80],['plumbing',0.75],['electrical',0.65],['landscaping',0.60]],
  deck: [['framing',0.65],['concrete',0.55]],
  porch: [['framing',0.70],['concrete',0.65],['roofing',0.55],['masonry',0.55]],
  garage: [['framing',0.70],['concrete',0.70],['roofing',0.65],['electrical',0.60],['drywall',0.55]],
  fence: [['framing',0.55]],
  garden_suite: [['framing',0.80],['concrete',0.75],['excavation',0.70],['plumbing',0.75],['electrical',0.75],['hvac',0.70],['insulation',0.65],['drywall',0.65],['roofing',0.65]],
  laneway: [['framing',0.80],['concrete',0.75],['excavation',0.70],['plumbing',0.75],['electrical',0.75],['hvac',0.70],['insulation',0.65],['drywall',0.65],['roofing',0.65]],
  'build-sfd': [['excavation',0.80],['concrete',0.80],['framing',0.85],['roofing',0.80],['plumbing',0.80],['hvac',0.80],['electrical',0.80],['insulation',0.75],['drywall',0.75],['painting',0.70],['flooring',0.70],['masonry',0.65],['glazing',0.60],['waterproofing',0.55],['landscaping',0.60]],
  semi: [['excavation',0.75],['concrete',0.75],['framing',0.80],['roofing',0.75],['plumbing',0.75],['hvac',0.75],['electrical',0.75],['insulation',0.70],['drywall',0.70],['painting',0.65],['flooring',0.65],['masonry',0.70],['landscaping',0.55]],
  townhouse: [['excavation',0.75],['concrete',0.75],['framing',0.80],['roofing',0.75],['plumbing',0.75],['hvac',0.75],['electrical',0.75],['insulation',0.70],['drywall',0.70],['painting',0.65],['flooring',0.65],['masonry',0.70],['fire-protection',0.55],['landscaping',0.55]],
  houseplex: [['excavation',0.75],['concrete',0.75],['framing',0.80],['roofing',0.75],['plumbing',0.80],['hvac',0.80],['electrical',0.80],['insulation',0.70],['drywall',0.70],['painting',0.65],['flooring',0.65],['fire-protection',0.60],['masonry',0.65]],
  apartment: [['concrete',0.80],['framing',0.75],['plumbing',0.80],['hvac',0.80],['electrical',0.80],['elevator',0.75],['drywall',0.70],['painting',0.65],['fire-protection',0.70]],
  'tenant-fitout': [['drywall',0.80],['painting',0.75],['electrical',0.75],['flooring',0.70],['hvac',0.65],['plumbing',0.60],['fire-protection',0.60]],
  retail: [['drywall',0.75],['painting',0.70],['electrical',0.75],['plumbing',0.65],['flooring',0.70],['glazing',0.65],['hvac',0.60],['fire-protection',0.55]],
  office: [['drywall',0.80],['painting',0.75],['electrical',0.75],['hvac',0.70],['flooring',0.70],['fire-protection',0.60]],
  restaurant: [['plumbing',0.85],['hvac',0.80],['electrical',0.80],['fire-protection',0.75],['drywall',0.60],['painting',0.55]],
  warehouse: [['concrete',0.75],['structural-steel',0.70],['electrical',0.75],['plumbing',0.60],['hvac',0.65],['fire-protection',0.70],['roofing',0.55]],
  hvac: [['hvac',0.85]],
  plumbing: [['plumbing',0.85]],
  electrical: [['electrical',0.85]],
  fire_alarm: [['fire-protection',0.85],['electrical',0.55]],
  sprinkler: [['fire-protection',0.85],['plumbing',0.55]],
  underpinning: [['shoring',0.85],['concrete',0.75],['waterproofing',0.65],['excavation',0.70]],
  foundation: [['concrete',0.85],['excavation',0.75],['waterproofing',0.70]],
  addition: [['framing',0.75],['concrete',0.65],['roofing',0.60],['plumbing',0.55],['electrical',0.60],['insulation',0.55],['drywall',0.55]],
  roof: [['roofing',0.85]],
  cladding: [['masonry',0.70],['insulation',0.60]],
  windows: [['glazing',0.85]],
  solar: [['electrical',0.75],['roofing',0.55]],
  ev_charger: [['electrical',0.80]],
  elevator: [['elevator',0.85],['electrical',0.55]],
  interior: [['drywall',0.70],['painting',0.65],['flooring',0.60],['electrical',0.55]],
  fireplace: [['hvac',0.65],['masonry',0.55]],
  'high-rise': [['elevator',0.65],['concrete',0.65],['structural-steel',0.60],['fire-protection',0.60],['glazing',0.55]],
  'mid-rise': [['concrete',0.60],['fire-protection',0.55],['elevator',0.55]],
  demolition: [['demolition',0.85],['excavation',0.50]],
  security: [['electrical',0.55]],
  walkout: [['excavation',0.75],['concrete',0.70],['waterproofing',0.70],['framing',0.60]],
  'second-suite': [['framing',0.75],['plumbing',0.75],['electrical',0.75],['hvac',0.70],['drywall',0.70],['insulation',0.65],['flooring',0.60],['painting',0.55]],
  balcony: [['framing',0.70],['concrete',0.65],['glazing',0.55],['waterproofing',0.60]],
  dormer: [['framing',0.75],['roofing',0.70],['insulation',0.60],['drywall',0.60],['glazing',0.55]],
  'unit-conversion': [['framing',0.70],['drywall',0.70],['plumbing',0.65],['electrical',0.70],['hvac',0.60],['painting',0.55],['flooring',0.55]],
  'open-concept': [['framing',0.75],['structural-steel',0.65],['drywall',0.70],['painting',0.60],['electrical',0.55]],
  'structural-beam': [['structural-steel',0.80],['framing',0.65]],
  'fire-damage': [['demolition',0.70],['framing',0.70],['drywall',0.70],['painting',0.65],['electrical',0.65],['plumbing',0.60],['insulation',0.60]],
  carport: [['framing',0.70],['concrete',0.65],['roofing',0.65]],
  canopy: [['framing',0.65],['concrete',0.55]],
  laundry: [['plumbing',0.80],['electrical',0.65]],
  'accessory-building': [['framing',0.70],['concrete',0.60],['electrical',0.55],['roofing',0.55]],
  drain: [['drain-plumbing',0.85]],
  'backflow-preventer': [['drain-plumbing',0.80]],
  'access-control': [['electrical',0.70]],
  school: [['concrete',0.65],['framing',0.65],['hvac',0.70],['electrical',0.70],['plumbing',0.65],['fire-protection',0.60]],
  hospital: [['concrete',0.65],['framing',0.60],['hvac',0.75],['electrical',0.75],['plumbing',0.70],['fire-protection',0.65],['elevator',0.60]],
  station: [['concrete',0.70],['structural-steel',0.65],['electrical',0.70]],
  storage: [['framing',0.60],['concrete',0.60]],
};

// ──────────────────────────────────────────────────────────────────────
// lookupTradesForTags — twin of classify-permits.js:259
// Returns deduplicated array of { slug, confidence } sorted by slug.
// ──────────────────────────────────────────────────────────────────────
function lookupTradesForTags(scopeTags) {
  if (scopeTags == null || !Array.isArray(scopeTags)) return [];
  const best = new Map();
  for (const tag of scopeTags) {
    // R5.4 R8 fold #7 (Gemini HIGH): defensive type guard. Upstream data
    // quality is never guaranteed; a non-string element would crash on
    // .replace() inside normalizeTag.
    if (typeof tag !== 'string' || tag === '') continue;
    const key = normalizeTag(tag);
    const entries = TAG_TRADE_MATRIX[key];
    if (!entries) continue;
    for (const [slug, conf] of entries) {
      const existing = best.get(slug) ?? 0;
      if (conf > existing) best.set(slug, conf);
    }
  }
  // R5.1.g DeepSeek NIT fix: deterministic slug ordering. Map insertion
  // order is technically deterministic per spec, but caller-visible sort
  // protects against future refactors that might shuffle iteration.
  return Array.from(best.entries())
    .map(([slug, confidence]) => ({ slug, confidence }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

// ──────────────────────────────────────────────────────────────────────
// Archetype bundle prior — CoA translation layer (Spec 80 §5.B.5, Phase 3).
//
// CoA's project_type + scope_tag vocab differ from permits, so they cannot be
// fed to the shared deriveArchetypes() verbatim. These two maps translate CoA
// inputs onto the permit-side keys deriveArchetypes()/TAG_ARCHETYPE understand.
// NOTE: distinct from TAG_ALIASES above — TAG_ALIASES targets TAG_TRADE_MATRIX
// keys (renovation→interior); these target TAG_ARCHETYPE keys (renovation→
// interior-alterations). Locked TS↔JS by coa-trade-classifier.logic.test.ts.
// ──────────────────────────────────────────────────────────────────────

// CoA PascalCase project_type → permit-side project_type key (PROJECT_TYPE_ARCHETYPE).
// Demolition/Severance/Mixed → null: no project-type-axis archetype (Severance is a
// lot division, Mixed is ambiguous). Scope tags still derive archetypes independently.
const COA_PROJECT_TYPE_MAP = {
  NewConstruction: 'new_build', // → FB
  Addition: 'addition',         // → ADD
  Alteration: 'renovation',     // → INT
  Demolition: null,
  Severance: null,
  Mixed: null,
};

// CoA scope_tag → valid TAG_ARCHETYPE key. Tags already valid in TAG_ARCHETYPE
// (basement/garage/walkout/rear-addition/addition/fence/townhouse/…) pass through
// unchanged; variance/use-type tags (severance/setback/minor-variance/residential/…)
// map to nothing → no archetype (correct — they carry no construction signal).
// `two-storey` is an intentional NON-entry: it is a storey-count modifier, not a scope
// signal, and on a real CoA always co-fires with the actual scope tag (dwelling / addition /
// rear-addition) that carries the archetype. `third-storey`, by contrast, is virtually always
// a vertical addition, so it maps to `addition` (mirrors TAG_ARCHETYPE 3rd-floor→ADD, which the
// CoA spelling `third-storey` cannot reach directly). `condo` mirrors TAG_ALIASES condo→apartment
// (a "condominium" CoA without the literal word apartment/dwelling would otherwise miss the FB
// bundle — Integration review, 2026-06-19).
const COA_TAG_TO_ARCHETYPE_TAG = {
  dwelling: 'build-sfd',                 // → FB
  'new-construction': 'build-sfd',       // → FB
  apartment: 'build-sfd',                // → FB
  condo: 'build-sfd',                    // → FB (mirror TAG_ALIASES condo→apartment)
  renovation: 'interior-alterations',    // → INT
  office: 'tenant-fitout',               // → INT
  retail: 'tenant-fitout',               // → INT
  'service-shop': 'tenant-fitout',       // → INT
  'mixed-use': 'tenant-fitout',          // → INT
  'secondary-suite': 'second-suite',     // → FB
  'accessory-structure': 'accessory-building', // → GAR
  'change-of-use': 'convert-unit',       // → INT
  'third-storey': 'addition',            // → ADD (vertical addition; CoA spelling of 3rd-floor)
};

// Deprecated trades kept in the vocab but NEVER bundle-emitted (Spec 80 §5.B.6).
// Explicit set mirrors classify-permits.js (the JS TRADES list carries no `kind`);
// parity-pinned by coa-trade-classifier.logic.test.ts.
const DEPRECATED_TRADE_SLUGS = new Set(['temporary-fencing']);

// Bundle-tier confidence default when the archetype_bundle_confidence logic_var is
// absent (mirrors classify-permits.js BUNDLE_TIER_CONFIDENCE_DEFAULT / migration 182).
const BUNDLE_TIER_CONFIDENCE_DEFAULT = 0.55;

/**
 * Derive the §5.B.5 archetype set for a CoA application. Translates CoA's vocab
 * (PascalCase project_type via COA_PROJECT_TYPE_MAP; scope_tags via
 * COA_TAG_TO_ARCHETYPE_TAG) onto permit-side keys, then delegates to the shared
 * deriveArchetypes(). Returns [] when nothing maps (coverage is corpus-level).
 */
function deriveArchetypesForCoa(projectType, scopeTags) {
  const mappedPt =
    projectType != null && Object.prototype.hasOwnProperty.call(COA_PROJECT_TYPE_MAP, projectType)
      ? COA_PROJECT_TYPE_MAP[projectType]
      : null;
  const mappedTags = [];
  for (const tag of scopeTags || []) {
    if (typeof tag !== 'string' || tag === '') continue;
    const base = tag.toLowerCase();
    mappedTags.push(COA_TAG_TO_ARCHETYPE_TAG[base] ?? base);
  }
  return deriveArchetypes(mappedPt, mappedTags);
}

/**
 * CoA trade classification = direct tag-matrix path + archetype bundle prior,
 * MAX-deduped (a direct hit above the bundle tier wins; the bundle only fills
 * low-signal trades). Deprecated slugs are never bundle-emitted. Returns a
 * deduped, slug-sorted array of { slug, confidence, fromBundle } where
 * `fromBundle` is true ONLY when the direct tag-matrix did not emit the slug
 * at all (the archetype bundle is its sole source) — this is the honest
 * precision signal (mirrors the permit twin's `!fromFallback`), independent of
 * the confidence value, so a direct hit at exactly the bundle tier is still a
 * direct ("strong") signal. tier/phase/lead_score are attached by the caller
 * (tier 3, phase null for CoA).
 */
function classifyCoaTrades(row, bundleConf, deprecatedSlugs) {
  const best = new Map();
  const directSlugs = new Set();
  for (const { slug, confidence } of lookupTradesForTags(row.scope_tags)) {
    directSlugs.add(slug);
    if (confidence > (best.get(slug) ?? 0)) best.set(slug, confidence);
  }
  const archetypes = deriveArchetypesForCoa(row.project_type, row.scope_tags);
  for (const slug of bundleSlugsFor(archetypes, deprecatedSlugs).trades) {
    if (bundleConf > (best.get(slug) ?? 0)) best.set(slug, bundleConf);
  }
  return Array.from(best.entries())
    .map(([slug, confidence]) => ({ slug, confidence, fromBundle: !directSlugs.has(slug) }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

/**
 * Classify a CoA row into product-group slugs (Spec 80 §5.B). Mirror of classifyCoaTrades
 * but for products: direct scope_tag→product hits at PRODUCT_TAG_CONFIDENCE, archetype-implied
 * products (the SAME deriveArchetypesForCoa bundle the trade path computes) at the lower
 * PRODUCT_BUNDLE_CONFIDENCE. Returns sorted [{ slug, confidence, fromBundle }]; the caller
 * resolves slug→product_id via product_groups and attaches classified_at.
 */
function classifyCoaProducts(row, deprecatedSlugs) {
  const best = new Map();
  const directSlugs = new Set();
  for (const slug of lookupProductsForTags(row.scope_tags)) {
    directSlugs.add(slug);
    if (PRODUCT_TAG_CONFIDENCE > (best.get(slug) ?? 0)) best.set(slug, PRODUCT_TAG_CONFIDENCE);
  }
  const archetypes = deriveArchetypesForCoa(row.project_type, row.scope_tags);
  for (const slug of bundleSlugsFor(archetypes, deprecatedSlugs).products) {
    if (PRODUCT_BUNDLE_CONFIDENCE > (best.get(slug) ?? 0)) best.set(slug, PRODUCT_BUNDLE_CONFIDENCE);
  }
  return Array.from(best.entries())
    .map(([slug, confidence]) => ({ slug, confidence, fromBundle: !directSlugs.has(slug) }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

// ──────────────────────────────────────────────────────────────────────
// PHASE_TRADES (verbatim from classify-permits.js:77)
// ──────────────────────────────────────────────────────────────────────
const PHASE_TRADES = {
  early_construction: ['excavation','shoring','demolition','concrete','waterproofing','drain-plumbing','temporary-fencing'],
  structural: ['framing','structural-steel','masonry','concrete','roofing','plumbing','hvac','electrical','elevator','fire-protection'],
  finishing: ['insulation','drywall','painting','flooring','glazing','fire-protection','plumbing','hvac','electrical','trim-work','millwork-cabinetry','tiling','stone-countertops','caulking','solar','security'],
  landscaping: ['landscaping','painting','decking-fences','eavestrough-siding','pool-installation'],
};

// ──────────────────────────────────────────────────────────────────────
// isTradeActiveInPhase — R2.v5 fix E (Worktree HIGH 82% CRITICAL FIX).
//
// Twin's signature: `(slug, phase) => (PHASE_TRADES[phase] || []).includes(slug)`.
// With phase=null, PHASE_TRADES[null] is undefined → [].includes(slug) → false.
// That would gate out ALL trades for every CoA — the OPPOSITE of the
// pass-through behavior the CoA chain needs.
//
// MUST have explicit null-phase guard before delegating to the matrix.
// ──────────────────────────────────────────────────────────────────────
function isTradeActiveInPhase(slug, phase) {
  // R5.1.g DeepSeek LOW: treat empty string the same as null/undefined to
  // avoid silent gating-out from a buggy null-coalescing chain upstream.
  if (phase == null || phase === '') return true;
  return (PHASE_TRADES[phase] || []).includes(slug);
}

// ──────────────────────────────────────────────────────────────────────
// determineCoaPhase — CoA-adapted twin of classify-permits.js:84.
//
// CoA records have no permit-style construction phase. Phase E lifecycle
// engine handles CoA P1-P4 separately. Phase D returns null sentinel so
// `isTradeActiveInPhase(slug, null)` passes every trade through.
// ──────────────────────────────────────────────────────────────────────
function determineCoaPhase(_coa, _runAt) {
  return null;
}

// ──────────────────────────────────────────────────────────────────────
// shouldAppendRealtor — CoA-side gate.
//
// Twin: `scripts/lib/permit-type-classifier.js:167` reads
// `(permitClass, permitType, scopeTags)` and uses permitClass='residential'.
// CoA twin simplifies to `coa_type_class='residential'` per Spec 42 §6.4.
// ──────────────────────────────────────────────────────────────────────
function shouldAppendRealtor(coaRow) {
  if (coaRow == null) return false;
  return coaRow.coa_type_class === 'residential';
}

module.exports = {
  lookupTradesForTags,
  isTradeActiveInPhase,
  determineCoaPhase,
  shouldAppendRealtor,
  normalizeTag,
  TAG_TRADE_MATRIX,
  TAG_ALIASES,
  PHASE_TRADES,
  // Spec 80 §5.B.5 Phase 3 — archetype bundle prior (CoA translation layer).
  COA_PROJECT_TYPE_MAP,
  COA_TAG_TO_ARCHETYPE_TAG,
  DEPRECATED_TRADE_SLUGS,
  BUNDLE_TIER_CONFIDENCE_DEFAULT,
  deriveArchetypesForCoa,
  classifyCoaTrades,
  classifyCoaProducts,
  PRODUCT_TAG_CONFIDENCE,
  PRODUCT_BUNDLE_CONFIDENCE,
};
