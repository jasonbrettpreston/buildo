// ---------------------------------------------------------------------------
// Archetype bundle prior (Spec 80 §5.B.5)
// ---------------------------------------------------------------------------
//
// An ARCHETYPE is a SECONDARY, derived rollup over `project_type` × `scope_tags`
// (NOT a new classifier — Spec 80 §5.A/§5.B.1). It is used as a {trades, products}
// **bundle prior** that boosts classification recall: a "kitchen-reno" implies its
// trades (tiling, millwork, …) even when the tags don't name each one.
//
// This is the mechanism that lights up the ~13 low-signal trades (interior-finish
// + service trades, ids 21-31/34/36/37) the direct tag/rule paths never emit.
//
// Bundle emissions are merged into the candidate set at a LOWER (bundle-tier)
// confidence than a direct tag/rule hit, then flow through the SAME applyScopeLimit
// (NARROW_SCOPE_CODES + WORK_SCOPE_EXCLUSIONS) so they are scoped exactly like
// direct hits. Deprecated trades are never bundle-emitted.

/** The 11 archetype codes (Spec 80 §5.B.5 / legend). */
export type ArchetypeCode =
  | 'FB'   // full-build
  | 'ADD'  // addition
  | 'BAS'  // basement-reno
  | 'KIT'  // kitchen-reno
  | 'BTH'  // bathroom-reno
  | 'INT'  // interior-reno
  | 'ENV'  // envelope-exterior
  | 'MEC'  // mechanical-upgrade
  | 'SITE' // site-landscape
  | 'LANE' // laneway/garden-suite
  | 'GAR'; // garage/accessory

export interface ArchetypeBundle {
  trades: string[];
  products: string[];
}

// Full-build trade set = all active construction + service trades EXCEPT
// pool-installation + decking-fences (those are SITE-only). Listed explicitly
// (not computed) so the bundle is deterministic and test-pinnable.
const FB_TRADES = [
  'excavation', 'shoring', 'concrete', 'structural-steel', 'framing', 'masonry', 'roofing',
  'plumbing', 'hvac', 'electrical', 'fire-protection', 'insulation', 'drywall', 'painting',
  'flooring', 'glazing', 'elevator', 'demolition', 'landscaping', 'waterproofing', 'trim-work',
  'millwork-cabinetry', 'tiling', 'stone-countertops', 'eavestrough-siding', 'solar', 'security',
  'caulking', 'drain-plumbing', 'overhead-doors', 'site-preparation', 'site-maintenance',
];

const FB_PRODUCTS = [
  'kitchen-cabinets', 'appliances', 'countertops', 'plumbing-fixtures', 'tiling', 'windows',
  'doors', 'flooring', 'paint', 'lighting', 'lumber', 'drywall-board', 'roofing-materials',
  'eavestroughs', 'staircases', 'mirrors-glass', 'garage-doors', 'hvac-equipment',
  'insulation-materials', 'exterior-cladding', 'bin-rental', 'portable-toilet', 'scaffolding-lifts',
  'temp-fencing-rental', 'surveying', 'tree-removal', 'site-security',
];

/** Spec 80 §5.B.5 — each archetype's implied {trades, products}. */
export const ARCHETYPE_BUNDLES: Record<ArchetypeCode, ArchetypeBundle> = {
  FB: { trades: FB_TRADES, products: FB_PRODUCTS },
  // A laneway/garden suite is a small full build — same set.
  LANE: { trades: FB_TRADES, products: FB_PRODUCTS },
  ADD: {
    trades: [
      'site-preparation', 'excavation', 'shoring', 'concrete', 'structural-steel', 'framing',
      'masonry', 'roofing', 'glazing', 'eavestrough-siding', 'plumbing', 'hvac', 'electrical',
      'fire-protection', 'insulation', 'drywall', 'flooring', 'painting', 'trim-work', 'demolition',
      'waterproofing', 'decking-fences', 'caulking', 'drain-plumbing', 'overhead-doors',
      'site-maintenance',
    ],
    products: [
      'lumber', 'exterior-cladding', 'scaffolding-lifts', 'roofing-materials', 'windows',
      'eavestroughs', 'plumbing-fixtures', 'hvac-equipment', 'lighting', 'insulation-materials',
      'drywall-board', 'paint', 'doors', 'garage-doors',
    ],
  },
  BAS: {
    trades: [
      'site-preparation', 'excavation', 'shoring', 'concrete', 'waterproofing', 'framing',
      'drain-plumbing', 'plumbing', 'hvac', 'electrical', 'insulation', 'drywall', 'tiling',
      'flooring', 'painting', 'trim-work', 'demolition', 'site-maintenance',
    ],
    products: [
      'lumber', 'plumbing-fixtures', 'hvac-equipment', 'lighting', 'insulation-materials',
      'drywall-board', 'tiling', 'flooring', 'paint', 'doors', 'staircases', 'bin-rental',
    ],
  },
  KIT: {
    trades: [
      'plumbing', 'electrical', 'drywall', 'tiling', 'flooring', 'painting', 'trim-work',
      'millwork-cabinetry', 'stone-countertops', 'site-maintenance',
    ],
    products: [
      'kitchen-cabinets', 'countertops', 'appliances', 'plumbing-fixtures', 'lighting', 'tiling',
      'flooring', 'paint', 'doors', 'staircases', 'drywall-board', 'bin-rental',
    ],
  },
  BTH: {
    trades: [
      'plumbing', 'electrical', 'drywall', 'tiling', 'flooring', 'painting', 'trim-work',
      'millwork-cabinetry', 'stone-countertops', 'caulking', 'site-maintenance',
    ],
    products: [
      'plumbing-fixtures', 'tiling', 'lighting', 'flooring', 'paint', 'countertops',
      'kitchen-cabinets', 'drywall-board', 'bin-rental',
    ],
  },
  INT: {
    trades: [
      'demolition', 'framing', 'electrical', 'drywall', 'glazing', 'tiling', 'flooring', 'painting',
      'trim-work', 'millwork-cabinetry', 'security', 'caulking', 'site-maintenance',
    ],
    products: [
      'lumber', 'lighting', 'drywall-board', 'windows', 'mirrors-glass', 'tiling', 'flooring',
      'paint', 'doors', 'staircases', 'kitchen-cabinets', 'countertops', 'bin-rental',
    ],
  },
  ENV: {
    trades: ['masonry', 'roofing', 'glazing', 'insulation', 'eavestrough-siding', 'solar', 'caulking'],
    products: [
      'exterior-cladding', 'scaffolding-lifts', 'roofing-materials', 'windows', 'mirrors-glass',
      'eavestroughs', 'insulation-materials',
    ],
  },
  MEC: {
    trades: ['plumbing', 'hvac', 'electrical', 'fire-protection', 'security', 'drain-plumbing'],
    products: ['plumbing-fixtures', 'hvac-equipment', 'lighting'],
  },
  SITE: {
    trades: [
      'site-preparation', 'excavation', 'concrete', 'framing', 'drain-plumbing', 'landscaping',
      'decking-fences', 'pool-installation', 'overhead-doors',
    ],
    products: [
      'lumber', 'garage-doors', 'surveying', 'tree-removal', 'temp-fencing-rental', 'portable-toilet',
    ],
  },
  GAR: {
    trades: [
      'site-preparation', 'excavation', 'concrete', 'framing', 'masonry', 'roofing', 'glazing',
      'electrical', 'eavestrough-siding', 'demolition', 'overhead-doors', 'site-maintenance',
    ],
    products: [
      'lumber', 'exterior-cladding', 'scaffolding-lifts', 'roofing-materials', 'windows', 'lighting',
      'eavestroughs', 'garage-doors',
    ],
  },
};

// scope_tag base-slug → archetype. Tags may carry new:/alter: prefixes (residential
// path) — match on the base slug. A permit can map to multiple archetypes (union).
const TAG_ARCHETYPE: Record<string, ArchetypeCode> = {
  // Interior reno archetypes (precise)
  kitchen: 'KIT',
  bathroom: 'BTH',
  basement: 'BAS',
  'basement-finish': 'BAS',
  'interior-alterations': 'INT',
  'open-concept': 'INT',
  'convert-unit': 'INT',
  'unit-conversion': 'INT',
  'tenant-fitout': 'INT',
  // Envelope / exterior
  roofing: 'ENV',
  window: 'ENV',
  door: 'ENV',
  solar: 'ENV',
  // Mechanical / systems
  hvac: 'MEC',
  plumbing: 'MEC',
  electrical: 'MEC',
  sprinkler: 'MEC',
  'fire-alarm': 'MEC',
  elevator: 'MEC',
  drain: 'MEC',
  'backflow-preventer': 'MEC',
  'access-control': 'MEC',
  // Site / landscape
  pool: 'SITE',
  deck: 'SITE',
  fence: 'SITE',
  porch: 'SITE',
  // Garage / accessory
  garage: 'GAR',
  carport: 'GAR',
  canopy: 'GAR',
  'accessory-building': 'GAR',
  // Laneway / garden suite
  'laneway-suite': 'LANE',
  // Full build (new construction building types)
  'build-sfd': 'FB',
  'semi-detached': 'FB',
  townhouse: 'FB',
  'stacked-townhouse': 'FB',
  'second-suite': 'FB',
  // Addition (structural extensions)
  addition: 'ADD',
  'rear-addition': 'ADD',
  'side-addition': 'ADD',
  'front-addition': 'ADD',
  'storey-addition': 'ADD',
  '2nd-floor': 'ADD',
  '3rd-floor': 'ADD',
  walkout: 'ADD',
  balcony: 'ADD',
  dormer: 'ADD',
  foundation: 'ADD',
  underpinning: 'ADD',
  'structural-beam': 'ADD',
};

// project_type → coarse archetype (fallback signal when tags are thin).
const PROJECT_TYPE_ARCHETYPE: Record<string, ArchetypeCode | null> = {
  new_build: 'FB',
  addition: 'ADD',
  renovation: 'INT',
  mechanical: 'MEC',
  demolition: null, // no archetype — demolition is a trade in many bundles
  repair: null,
  other: null,
};

/** Strip a new:/alter: prefix (residential path) and any houseplex unit suffix. */
function baseSlug(tag: string): string {
  let s = tag.includes(':') ? tag.slice(tag.indexOf(':') + 1) : tag;
  s = s.replace(/^houseplex-\d+-unit$/, 'houseplex');
  return s;
}

/**
 * Derive the archetype set for a permit from project_type × scope_tags.
 * Multi-archetype by design (a new build with a garage + pool → FB + GAR + SITE).
 * Returns [] when nothing matches (signal-less `other`/`repair`/null permits): the
 * bundle prior then adds nothing and the permit keeps its direct-hit/fallback trades.
 * `cov_trade_vocab` is a CORPUS-level metric, so the build permits (new_build→FB,
 * addition→ADD, renovation→INT, mechanical→MEC, + tag-derived KIT/BTH/SITE/…) already
 * cover all 35 active trades — a per-permit default-FB would only over-emit on
 * signal-less permits (a deck-repair permit is not a full build).
 */
export function deriveArchetypes(
  projectType: string | null | undefined,
  scopeTags: readonly string[] | null | undefined,
): ArchetypeCode[] {
  const set = new Set<ArchetypeCode>();

  for (const tag of scopeTags ?? []) {
    const code = TAG_ARCHETYPE[baseSlug(tag)];
    if (code) set.add(code);
    // houseplex building types → full build
    if (baseSlug(tag) === 'houseplex') set.add('FB');
  }

  const ptCode = projectType ? PROJECT_TYPE_ARCHETYPE[projectType] : null;
  if (ptCode) set.add(ptCode);

  return Array.from(set);
}

/**
 * Union the {trades, products} bundles for a permit's archetype set.
 * `deprecatedSlugs` (the active vocab's deprecated trades) are filtered out —
 * the bundle prior must never emit a deprecated trade (e.g. temporary-fencing).
 */
export function bundleSlugsFor(
  archetypes: readonly ArchetypeCode[],
  deprecatedSlugs?: ReadonlySet<string>,
): ArchetypeBundle {
  const trades = new Set<string>();
  const products = new Set<string>();
  for (const code of archetypes) {
    const b = ARCHETYPE_BUNDLES[code];
    if (!b) continue;
    for (const t of b.trades) if (!deprecatedSlugs?.has(t)) trades.add(t);
    for (const p of b.products) products.add(p);
  }
  return { trades: Array.from(trades), products: Array.from(products) };
}
