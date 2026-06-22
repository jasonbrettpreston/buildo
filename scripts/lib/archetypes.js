'use strict';
// ---------------------------------------------------------------------------
// Archetype bundle prior (Spec 80 §5.B.5) — JS twin of
// src/lib/classification/archetypes.ts (§7.1 dual-path; pinned by
// product-archetype-sync.logic.test.ts behavior-driven parity).
//
// Derived rollup over project_type × scope_tags → {trades, products} bundle prior
// that boosts classification recall (lights up the low-signal interior-finish +
// service trades the direct tag/rule paths never emit). Bundle emissions merge at
// a LOWER confidence than direct hits and flow through the SAME applyScopeLimit.
// ---------------------------------------------------------------------------

// Full-build trade set = all active construction + service trades EXCEPT
// pool-installation + decking-fences. Listed explicitly (deterministic).
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

const ARCHETYPE_BUNDLES = {
  FB: { trades: FB_TRADES, products: FB_PRODUCTS },
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

const TAG_ARCHETYPE = {
  kitchen: 'KIT',
  bathroom: 'BTH',
  basement: 'BAS',
  'basement-finish': 'BAS',
  'interior-alterations': 'INT',
  'open-concept': 'INT',
  'convert-unit': 'INT',
  'unit-conversion': 'INT',
  'tenant-fitout': 'INT',
  roofing: 'ENV',
  window: 'ENV',
  door: 'ENV',
  solar: 'ENV',
  hvac: 'MEC',
  plumbing: 'MEC',
  electrical: 'MEC',
  sprinkler: 'MEC',
  'fire-alarm': 'MEC',
  elevator: 'MEC',
  drain: 'MEC',
  'backflow-preventer': 'MEC',
  'access-control': 'MEC',
  pool: 'SITE',
  deck: 'SITE',
  fence: 'SITE',
  porch: 'SITE',
  garage: 'GAR',
  carport: 'GAR',
  canopy: 'GAR',
  'accessory-building': 'GAR',
  'laneway-suite': 'LANE',
  'build-sfd': 'FB',
  'semi-detached': 'FB',
  townhouse: 'FB',
  'stacked-townhouse': 'FB',
  'second-suite': 'FB',
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

const PROJECT_TYPE_ARCHETYPE = {
  new_build: 'FB',
  addition: 'ADD',
  renovation: 'INT',
  mechanical: 'MEC',
  demolition: null,
  repair: null,
  other: null,
};

function baseSlug(tag) {
  let s = tag.includes(':') ? tag.slice(tag.indexOf(':') + 1) : tag;
  s = s.replace(/^houseplex-\d+-unit$/, 'houseplex');
  return s;
}

/** project_type × scope_tags → archetype codes (multi; [] when nothing matches —
 *  coverage is corpus-level, so no per-permit default-FB over-emission). */
function deriveArchetypes(projectType, scopeTags) {
  // A repair is maintenance, not construction — never inherit a construction archetype,
  // even with a structural tag (balcony/roof/foundation REPAIR is not a full build). The
  // direct tag-trade matrix still emits the repair's actual trades. WF3 precision fix.
  if (projectType === 'repair') return [];
  const set = new Set();
  for (const tag of scopeTags || []) {
    const code = TAG_ARCHETYPE[baseSlug(tag)];
    if (code) set.add(code);
    if (baseSlug(tag) === 'houseplex') set.add('FB');
  }
  const ptCode = projectType ? PROJECT_TYPE_ARCHETYPE[projectType] : null;
  if (ptCode) set.add(ptCode);
  return Array.from(set);
}

/** Union the bundles for an archetype set; filter deprecated trade slugs. */
function bundleSlugsFor(archetypes, deprecatedSlugs) {
  const trades = new Set();
  const products = new Set();
  for (const code of archetypes) {
    const b = ARCHETYPE_BUNDLES[code];
    if (!b) continue;
    for (const t of b.trades) if (!deprecatedSlugs || !deprecatedSlugs.has(t)) trades.add(t);
    for (const p of b.products) products.add(p);
  }
  return { trades: Array.from(trades), products: Array.from(products) };
}

// Spec 65 §6 (Phase 2 B1) — the archetype → parcel geom_basis bridge: which scenario field supplies
// this archetype's floor area for the cost model (Spec 83 Step B). Additive map (does NOT touch the
// bundle objects → bundle-content + dual-path parity tests unaffected). `null` = not floor-area-
// proportional (ENV/MEC/SITE — Spec 83 §3.A(d)) or deferred (GAR → Phase 3). LANE → garden-suite GFA
// (shipped; laneway field arrives Phase 3). FB+COA is a B2 archetype (own Spec-80 WF) — its field
// max_newbuild_coa_gfa_sqm exists but has no code yet.
const ARCHETYPE_GEOM_BASIS = {
  FB: 'max_buildable_gfa_sqm',
  ADD: 'cur_storey_gfa_sqm',
  BAS: 'cur_basement_gfa_sqm',
  KIT: 'cur_est_kitchen_gfa_sqm',
  BTH: 'cur_est_bath_gfa_sqm',
  INT: 'cur_interior_reno_gfa_sqm',
  LANE: 'max_garden_suite_gfa_sqm',
  ENV: null,
  MEC: null,
  SITE: null,
  GAR: null,
};

module.exports = { ARCHETYPE_BUNDLES, ARCHETYPE_GEOM_BASIS, deriveArchetypes, bundleSlugsFor };
