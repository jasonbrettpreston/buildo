/**
 * Tag-to-Trade Matrix
 *
 * Maps scope_tags (from classifyScope()) to trade classifications.
 * Replaces the old Tier 2/3 regex-based rules with structured lookups.
 */

interface TagTradeEntry {
  tradeSlug: string;
  confidence: number;
}

/**
 * Master mapping: scope_tag -> array of trade matches with confidence.
 * Tags use the format from scope.ts: "new:kitchen", "alter:bathroom", "sys:hvac", etc.
 * We strip the prefix for matching (both "new:kitchen" and "alter:kitchen" hit "kitchen").
 */
const PREFIXED_TAG_TRADE_MATRIX: Record<string, TagTradeEntry[]> = {
  // ── Residential interior ──────────────────────────────────────────────
  kitchen: [
    { tradeSlug: 'plumbing', confidence: 0.80 },
    { tradeSlug: 'electrical', confidence: 0.80 },
    { tradeSlug: 'tiling', confidence: 0.70 },
    { tradeSlug: 'millwork-cabinetry', confidence: 0.80 },
    { tradeSlug: 'stone-countertops', confidence: 0.70 },
    { tradeSlug: 'flooring', confidence: 0.65 },
    { tradeSlug: 'drywall', confidence: 0.60 },
    { tradeSlug: 'painting', confidence: 0.55 },
  ],
  bathroom: [
    { tradeSlug: 'plumbing', confidence: 0.85 },
    { tradeSlug: 'tiling', confidence: 0.80 },
    { tradeSlug: 'drywall', confidence: 0.70 },
    { tradeSlug: 'glazing', confidence: 0.60 },
    { tradeSlug: 'electrical', confidence: 0.65 },
    { tradeSlug: 'waterproofing', confidence: 0.60 },
    { tradeSlug: 'painting', confidence: 0.55 },
  ],
  basement: [
    { tradeSlug: 'framing', confidence: 0.75 },
    { tradeSlug: 'drywall', confidence: 0.75 },
    { tradeSlug: 'plumbing', confidence: 0.70 },
    { tradeSlug: 'electrical', confidence: 0.75 },
    { tradeSlug: 'insulation', confidence: 0.70 },
    { tradeSlug: 'flooring', confidence: 0.65 },
    { tradeSlug: 'waterproofing', confidence: 0.65 },
    { tradeSlug: 'painting', confidence: 0.55 },
  ],
  // ── Residential exterior / features ───────────────────────────────────
  pool: [
    { tradeSlug: 'pool-installation', confidence: 0.90 },
    { tradeSlug: 'excavation', confidence: 0.75 },
    { tradeSlug: 'concrete', confidence: 0.80 },
    { tradeSlug: 'plumbing', confidence: 0.75 },
    { tradeSlug: 'electrical', confidence: 0.65 },
    { tradeSlug: 'landscaping', confidence: 0.60 },
    { tradeSlug: 'temporary-fencing', confidence: 0.70 },
  ],
  deck: [
    { tradeSlug: 'decking-fences', confidence: 0.85 },
    { tradeSlug: 'framing', confidence: 0.65 },
    { tradeSlug: 'concrete', confidence: 0.55 },
  ],
  porch: [
    { tradeSlug: 'framing', confidence: 0.70 },
    { tradeSlug: 'concrete', confidence: 0.65 },
    { tradeSlug: 'roofing', confidence: 0.55 },
    { tradeSlug: 'masonry', confidence: 0.55 },
  ],
  garage: [
    { tradeSlug: 'framing', confidence: 0.70 },
    { tradeSlug: 'concrete', confidence: 0.70 },
    { tradeSlug: 'roofing', confidence: 0.65 },
    { tradeSlug: 'electrical', confidence: 0.60 },
    { tradeSlug: 'drywall', confidence: 0.55 },
  ],
  fence: [
    { tradeSlug: 'decking-fences', confidence: 0.85 },
  ],
  garden_suite: [
    { tradeSlug: 'framing', confidence: 0.80 },
    { tradeSlug: 'concrete', confidence: 0.75 },
    { tradeSlug: 'excavation', confidence: 0.70 },
    { tradeSlug: 'plumbing', confidence: 0.75 },
    { tradeSlug: 'electrical', confidence: 0.75 },
    { tradeSlug: 'hvac', confidence: 0.70 },
    { tradeSlug: 'insulation', confidence: 0.65 },
    { tradeSlug: 'drywall', confidence: 0.65 },
    { tradeSlug: 'roofing', confidence: 0.65 },
  ],
  laneway: [
    { tradeSlug: 'framing', confidence: 0.80 },
    { tradeSlug: 'concrete', confidence: 0.75 },
    { tradeSlug: 'excavation', confidence: 0.70 },
    { tradeSlug: 'plumbing', confidence: 0.75 },
    { tradeSlug: 'electrical', confidence: 0.75 },
    { tradeSlug: 'hvac', confidence: 0.70 },
    { tradeSlug: 'insulation', confidence: 0.65 },
    { tradeSlug: 'drywall', confidence: 0.65 },
    { tradeSlug: 'roofing', confidence: 0.65 },
  ],
  // ── Building types ────────────────────────────────────────────────────
  'build-sfd': [
    { tradeSlug: 'excavation', confidence: 0.80 },
    { tradeSlug: 'concrete', confidence: 0.80 },
    { tradeSlug: 'framing', confidence: 0.85 },
    { tradeSlug: 'roofing', confidence: 0.80 },
    { tradeSlug: 'plumbing', confidence: 0.80 },
    { tradeSlug: 'hvac', confidence: 0.80 },
    { tradeSlug: 'electrical', confidence: 0.80 },
    { tradeSlug: 'insulation', confidence: 0.75 },
    { tradeSlug: 'drywall', confidence: 0.75 },
    { tradeSlug: 'painting', confidence: 0.70 },
    { tradeSlug: 'flooring', confidence: 0.70 },
    { tradeSlug: 'masonry', confidence: 0.65 },
    { tradeSlug: 'tiling', confidence: 0.65 },
    { tradeSlug: 'trim-work', confidence: 0.65 },
    { tradeSlug: 'millwork-cabinetry', confidence: 0.65 },
    { tradeSlug: 'stone-countertops', confidence: 0.55 },
    { tradeSlug: 'eavestrough-siding', confidence: 0.65 },
    { tradeSlug: 'landscaping', confidence: 0.60 },
    { tradeSlug: 'waterproofing', confidence: 0.55 },
    { tradeSlug: 'glazing', confidence: 0.60 },
    { tradeSlug: 'caulking', confidence: 0.55 },
    { tradeSlug: 'temporary-fencing', confidence: 0.60 },
    { tradeSlug: 'decking-fences', confidence: 0.50 },
  ],
  semi: [
    { tradeSlug: 'excavation', confidence: 0.75 },
    { tradeSlug: 'concrete', confidence: 0.75 },
    { tradeSlug: 'framing', confidence: 0.80 },
    { tradeSlug: 'roofing', confidence: 0.75 },
    { tradeSlug: 'plumbing', confidence: 0.75 },
    { tradeSlug: 'hvac', confidence: 0.75 },
    { tradeSlug: 'electrical', confidence: 0.75 },
    { tradeSlug: 'insulation', confidence: 0.70 },
    { tradeSlug: 'drywall', confidence: 0.70 },
    { tradeSlug: 'painting', confidence: 0.65 },
    { tradeSlug: 'flooring', confidence: 0.65 },
    { tradeSlug: 'masonry', confidence: 0.70 },
    { tradeSlug: 'tiling', confidence: 0.60 },
    { tradeSlug: 'trim-work', confidence: 0.60 },
    { tradeSlug: 'eavestrough-siding', confidence: 0.60 },
    { tradeSlug: 'landscaping', confidence: 0.55 },
    { tradeSlug: 'caulking', confidence: 0.50 },
  ],
  townhouse: [
    { tradeSlug: 'excavation', confidence: 0.75 },
    { tradeSlug: 'concrete', confidence: 0.75 },
    { tradeSlug: 'framing', confidence: 0.80 },
    { tradeSlug: 'roofing', confidence: 0.75 },
    { tradeSlug: 'plumbing', confidence: 0.75 },
    { tradeSlug: 'hvac', confidence: 0.75 },
    { tradeSlug: 'electrical', confidence: 0.75 },
    { tradeSlug: 'insulation', confidence: 0.70 },
    { tradeSlug: 'drywall', confidence: 0.70 },
    { tradeSlug: 'painting', confidence: 0.65 },
    { tradeSlug: 'flooring', confidence: 0.65 },
    { tradeSlug: 'masonry', confidence: 0.70 },
    { tradeSlug: 'fire-protection', confidence: 0.55 },
    { tradeSlug: 'tiling', confidence: 0.60 },
    { tradeSlug: 'trim-work', confidence: 0.60 },
    { tradeSlug: 'eavestrough-siding', confidence: 0.60 },
    { tradeSlug: 'landscaping', confidence: 0.55 },
  ],
  // houseplex covers houseplex-N-unit tags
  houseplex: [
    { tradeSlug: 'excavation', confidence: 0.75 },
    { tradeSlug: 'concrete', confidence: 0.75 },
    { tradeSlug: 'framing', confidence: 0.80 },
    { tradeSlug: 'roofing', confidence: 0.75 },
    { tradeSlug: 'plumbing', confidence: 0.80 },
    { tradeSlug: 'hvac', confidence: 0.80 },
    { tradeSlug: 'electrical', confidence: 0.80 },
    { tradeSlug: 'insulation', confidence: 0.70 },
    { tradeSlug: 'drywall', confidence: 0.70 },
    { tradeSlug: 'painting', confidence: 0.65 },
    { tradeSlug: 'flooring', confidence: 0.65 },
    { tradeSlug: 'fire-protection', confidence: 0.60 },
    { tradeSlug: 'tiling', confidence: 0.60 },
    { tradeSlug: 'masonry', confidence: 0.65 },
  ],
  apartment: [
    { tradeSlug: 'concrete', confidence: 0.80 },
    { tradeSlug: 'framing', confidence: 0.75 },
    { tradeSlug: 'plumbing', confidence: 0.80 },
    { tradeSlug: 'hvac', confidence: 0.80 },
    { tradeSlug: 'electrical', confidence: 0.80 },
    { tradeSlug: 'elevator', confidence: 0.75 },
    { tradeSlug: 'drywall', confidence: 0.70 },
    { tradeSlug: 'painting', confidence: 0.65 },
    { tradeSlug: 'fire-protection', confidence: 0.70 },
  ],
  // ── Commercial / non-residential tags ────────────────────────────────
  'tenant-fitout': [
    { tradeSlug: 'drywall', confidence: 0.80 },
    { tradeSlug: 'painting', confidence: 0.75 },
    { tradeSlug: 'electrical', confidence: 0.75 },
    { tradeSlug: 'flooring', confidence: 0.70 },
    { tradeSlug: 'millwork-cabinetry', confidence: 0.70 },
    { tradeSlug: 'hvac', confidence: 0.65 },
    { tradeSlug: 'plumbing', confidence: 0.60 },
    { tradeSlug: 'fire-protection', confidence: 0.60 },
    { tradeSlug: 'trim-work', confidence: 0.55 },
  ],
  retail: [
    { tradeSlug: 'drywall', confidence: 0.75 },
    { tradeSlug: 'painting', confidence: 0.70 },
    { tradeSlug: 'electrical', confidence: 0.75 },
    { tradeSlug: 'plumbing', confidence: 0.65 },
    { tradeSlug: 'flooring', confidence: 0.70 },
    { tradeSlug: 'glazing', confidence: 0.65 },
    { tradeSlug: 'hvac', confidence: 0.60 },
    { tradeSlug: 'fire-protection', confidence: 0.55 },
  ],
  office: [
    { tradeSlug: 'drywall', confidence: 0.80 },
    { tradeSlug: 'painting', confidence: 0.75 },
    { tradeSlug: 'electrical', confidence: 0.75 },
    { tradeSlug: 'hvac', confidence: 0.70 },
    { tradeSlug: 'flooring', confidence: 0.70 },
    { tradeSlug: 'fire-protection', confidence: 0.60 },
    { tradeSlug: 'millwork-cabinetry', confidence: 0.55 },
  ],
  restaurant: [
    { tradeSlug: 'plumbing', confidence: 0.85 },
    { tradeSlug: 'hvac', confidence: 0.80 },
    { tradeSlug: 'electrical', confidence: 0.80 },
    { tradeSlug: 'fire-protection', confidence: 0.75 },
    { tradeSlug: 'tiling', confidence: 0.70 },
    { tradeSlug: 'millwork-cabinetry', confidence: 0.65 },
    { tradeSlug: 'drywall', confidence: 0.60 },
    { tradeSlug: 'painting', confidence: 0.55 },
  ],
  warehouse: [
    { tradeSlug: 'concrete', confidence: 0.75 },
    { tradeSlug: 'structural-steel', confidence: 0.70 },
    { tradeSlug: 'electrical', confidence: 0.75 },
    { tradeSlug: 'plumbing', confidence: 0.60 },
    { tradeSlug: 'hvac', confidence: 0.65 },
    { tradeSlug: 'fire-protection', confidence: 0.70 },
    { tradeSlug: 'roofing', confidence: 0.55 },
  ],
  // ── Residential — missing tags ────────────────────────────────────────
  walkout: [
    { tradeSlug: 'excavation', confidence: 0.75 },
    { tradeSlug: 'concrete', confidence: 0.70 },
    { tradeSlug: 'waterproofing', confidence: 0.70 },
    { tradeSlug: 'framing', confidence: 0.60 },
  ],
  'second-suite': [
    { tradeSlug: 'framing', confidence: 0.75 },
    { tradeSlug: 'plumbing', confidence: 0.75 },
    { tradeSlug: 'electrical', confidence: 0.75 },
    { tradeSlug: 'hvac', confidence: 0.70 },
    { tradeSlug: 'drywall', confidence: 0.70 },
    { tradeSlug: 'insulation', confidence: 0.65 },
    { tradeSlug: 'flooring', confidence: 0.60 },
    { tradeSlug: 'painting', confidence: 0.55 },
  ],
  balcony: [
    { tradeSlug: 'framing', confidence: 0.70 },
    { tradeSlug: 'concrete', confidence: 0.65 },
    { tradeSlug: 'glazing', confidence: 0.55 },
    { tradeSlug: 'waterproofing', confidence: 0.60 },
  ],
  dormer: [
    { tradeSlug: 'framing', confidence: 0.75 },
    { tradeSlug: 'roofing', confidence: 0.70 },
    { tradeSlug: 'insulation', confidence: 0.60 },
    { tradeSlug: 'drywall', confidence: 0.60 },
    { tradeSlug: 'glazing', confidence: 0.55 },
  ],
  'unit-conversion': [
    { tradeSlug: 'framing', confidence: 0.70 },
    { tradeSlug: 'drywall', confidence: 0.70 },
    { tradeSlug: 'plumbing', confidence: 0.65 },
    { tradeSlug: 'electrical', confidence: 0.70 },
    { tradeSlug: 'hvac', confidence: 0.60 },
    { tradeSlug: 'painting', confidence: 0.55 },
    { tradeSlug: 'flooring', confidence: 0.55 },
  ],
  'open-concept': [
    { tradeSlug: 'framing', confidence: 0.75 },
    { tradeSlug: 'structural-steel', confidence: 0.65 },
    { tradeSlug: 'drywall', confidence: 0.70 },
    { tradeSlug: 'painting', confidence: 0.60 },
    { tradeSlug: 'electrical', confidence: 0.55 },
  ],
  'structural-beam': [
    { tradeSlug: 'structural-steel', confidence: 0.80 },
    { tradeSlug: 'framing', confidence: 0.65 },
  ],
  'fire-damage': [
    { tradeSlug: 'demolition', confidence: 0.70 },
    { tradeSlug: 'framing', confidence: 0.70 },
    { tradeSlug: 'drywall', confidence: 0.70 },
    { tradeSlug: 'painting', confidence: 0.65 },
    { tradeSlug: 'electrical', confidence: 0.65 },
    { tradeSlug: 'plumbing', confidence: 0.60 },
    { tradeSlug: 'insulation', confidence: 0.60 },
  ],
  carport: [
    { tradeSlug: 'framing', confidence: 0.70 },
    { tradeSlug: 'concrete', confidence: 0.65 },
    { tradeSlug: 'roofing', confidence: 0.65 },
  ],
  canopy: [
    { tradeSlug: 'framing', confidence: 0.65 },
    { tradeSlug: 'concrete', confidence: 0.55 },
  ],
  laundry: [
    { tradeSlug: 'plumbing', confidence: 0.80 },
    { tradeSlug: 'electrical', confidence: 0.65 },
  ],
  'accessory-building': [
    { tradeSlug: 'framing', confidence: 0.70 },
    { tradeSlug: 'concrete', confidence: 0.60 },
    { tradeSlug: 'electrical', confidence: 0.55 },
    { tradeSlug: 'roofing', confidence: 0.55 },
  ],
  // ── Systems — missing tags ──────────────────────────────────────────
  drain: [
    { tradeSlug: 'drain-plumbing', confidence: 0.85 },
  ],
  'backflow-preventer': [
    { tradeSlug: 'drain-plumbing', confidence: 0.80 },
  ],
  'access-control': [
    { tradeSlug: 'electrical', confidence: 0.70 },
    { tradeSlug: 'security', confidence: 0.80 },
  ],
  // ── Institutional / specialty ───────────────────────────────────────
  school: [
    { tradeSlug: 'concrete', confidence: 0.65 },
    { tradeSlug: 'framing', confidence: 0.65 },
    { tradeSlug: 'hvac', confidence: 0.70 },
    { tradeSlug: 'electrical', confidence: 0.70 },
    { tradeSlug: 'plumbing', confidence: 0.65 },
    { tradeSlug: 'fire-protection', confidence: 0.60 },
  ],
  hospital: [
    { tradeSlug: 'concrete', confidence: 0.65 },
    { tradeSlug: 'framing', confidence: 0.60 },
    { tradeSlug: 'hvac', confidence: 0.75 },
    { tradeSlug: 'electrical', confidence: 0.75 },
    { tradeSlug: 'plumbing', confidence: 0.70 },
    { tradeSlug: 'fire-protection', confidence: 0.65 },
    { tradeSlug: 'elevator', confidence: 0.60 },
  ],
  station: [
    { tradeSlug: 'concrete', confidence: 0.70 },
    { tradeSlug: 'structural-steel', confidence: 0.65 },
    { tradeSlug: 'electrical', confidence: 0.70 },
  ],
  storage: [
    { tradeSlug: 'framing', confidence: 0.60 },
    { tradeSlug: 'concrete', confidence: 0.60 },
  ],
  // ── Systems tags (from scope.ts sys: prefix) ─────────────────────────
  hvac: [
    { tradeSlug: 'hvac', confidence: 0.85 },
  ],
  plumbing: [
    { tradeSlug: 'plumbing', confidence: 0.85 },
  ],
  electrical: [
    { tradeSlug: 'electrical', confidence: 0.85 },
  ],
  fire_alarm: [
    { tradeSlug: 'fire-protection', confidence: 0.85 },
    { tradeSlug: 'electrical', confidence: 0.55 },
  ],
  sprinkler: [
    { tradeSlug: 'fire-protection', confidence: 0.85 },
    { tradeSlug: 'plumbing', confidence: 0.55 },
  ],
  // ── Structural tags ───────────────────────────────────────────────────
  underpinning: [
    { tradeSlug: 'shoring', confidence: 0.85 },
    { tradeSlug: 'concrete', confidence: 0.75 },
    { tradeSlug: 'waterproofing', confidence: 0.65 },
    { tradeSlug: 'excavation', confidence: 0.70 },
  ],
  foundation: [
    { tradeSlug: 'concrete', confidence: 0.85 },
    { tradeSlug: 'excavation', confidence: 0.75 },
    { tradeSlug: 'waterproofing', confidence: 0.70 },
  ],
  addition: [
    { tradeSlug: 'framing', confidence: 0.75 },
    { tradeSlug: 'concrete', confidence: 0.65 },
    { tradeSlug: 'roofing', confidence: 0.60 },
    { tradeSlug: 'plumbing', confidence: 0.55 },
    { tradeSlug: 'electrical', confidence: 0.60 },
    { tradeSlug: 'insulation', confidence: 0.55 },
    { tradeSlug: 'drywall', confidence: 0.55 },
  ],
  // ── Exterior tags ─────────────────────────────────────────────────────
  roof: [
    { tradeSlug: 'roofing', confidence: 0.85 },
    { tradeSlug: 'eavestrough-siding', confidence: 0.55 },
  ],
  cladding: [
    { tradeSlug: 'masonry', confidence: 0.70 },
    { tradeSlug: 'eavestrough-siding', confidence: 0.70 },
    { tradeSlug: 'insulation', confidence: 0.60 },
    { tradeSlug: 'caulking', confidence: 0.55 },
  ],
  windows: [
    { tradeSlug: 'glazing', confidence: 0.85 },
    { tradeSlug: 'caulking', confidence: 0.55 },
  ],
  // ── Energy / specialty ────────────────────────────────────────────────
  solar: [
    { tradeSlug: 'solar', confidence: 0.90 },
    { tradeSlug: 'electrical', confidence: 0.75 },
    { tradeSlug: 'roofing', confidence: 0.55 },
  ],
  ev_charger: [
    { tradeSlug: 'electrical', confidence: 0.80 },
  ],
  elevator: [
    { tradeSlug: 'elevator', confidence: 0.85 },
    { tradeSlug: 'electrical', confidence: 0.55 },
  ],
  // ── Interior finish tags ──────────────────────────────────────────────
  interior: [
    { tradeSlug: 'drywall', confidence: 0.70 },
    { tradeSlug: 'painting', confidence: 0.65 },
    { tradeSlug: 'flooring', confidence: 0.60 },
    { tradeSlug: 'trim-work', confidence: 0.55 },
    { tradeSlug: 'electrical', confidence: 0.55 },
  ],
  fireplace: [
    { tradeSlug: 'hvac', confidence: 0.65 },
    { tradeSlug: 'masonry', confidence: 0.55 },
  ],
  // ── Scale tags ────────────────────────────────────────────────────────
  'high-rise': [
    { tradeSlug: 'elevator', confidence: 0.65 },
    { tradeSlug: 'concrete', confidence: 0.65 },
    { tradeSlug: 'structural-steel', confidence: 0.60 },
    { tradeSlug: 'fire-protection', confidence: 0.60 },
    { tradeSlug: 'glazing', confidence: 0.55 },
  ],
  'mid-rise': [
    { tradeSlug: 'concrete', confidence: 0.60 },
    { tradeSlug: 'fire-protection', confidence: 0.55 },
    { tradeSlug: 'elevator', confidence: 0.55 },
  ],
  // ── Demolition ────────────────────────────────────────────────────────
  demolition: [
    { tradeSlug: 'demolition', confidence: 0.85 },
    { tradeSlug: 'temporary-fencing', confidence: 0.60 },
    { tradeSlug: 'excavation', confidence: 0.50 },
  ],
  // ── Security ──────────────────────────────────────────────────────────
  security: [
    { tradeSlug: 'security', confidence: 0.85 },
    { tradeSlug: 'electrical', confidence: 0.55 },
  ],
};

/**
 * Alias map: normalised tag names that should map to an existing matrix key.
 * Covers naming mismatches between scope.ts emitters and matrix keys, plus
 * semantic equivalences (e.g. stacked-townhouse ≈ townhouse).
 */
const TAG_ALIASES: Record<string, string> = {
  // Key name mismatches
  'roofing': 'roof',
  'laneway-suite': 'laneway',
  'fire-alarm': 'fire_alarm',
  // Semantic aliases → existing keys
  'interior-alterations': 'interior',
  'finished-basement': 'basement',
  'basement-finish': 'basement',
  'stacked-townhouse': 'townhouse',
  'semi-detached': 'semi',
  'condo': 'apartment',
  // Structural addition variants → addition
  'rear-addition': 'addition',
  'front-addition': 'addition',
  'side-addition': 'addition',
  'storey-addition': 'addition',
  '2nd-floor': 'addition',
  '3rd-floor': 'addition',
  // Unit conversion variants
  'convert-unit': 'unit-conversion',
};

/**
 * Normalize a scope_tag to its base key for matrix lookup.
 * Strips known prefixes: "new:", "alter:", "sys:", "scale:", "exp:".
 * Strips "houseplex-N-unit" to "houseplex".
 * Applies alias mapping for mismatched tag names.
 */
function normalizeTag(tag: string): string {
  let base = tag.replace(/^(new|alter|sys|scale|exp):/, '');
  // "houseplex-3-unit" -> "houseplex"
  base = base.replace(/^houseplex-\d+-unit$/, 'houseplex');
  // Apply alias mapping
  return TAG_ALIASES[base] ?? base;
}

/**
 * Look up trades for a set of scope_tags using the tag-trade matrix.
 * De-duplicates by trade slug, keeping the maximum confidence per trade.
 */
export function lookupTradesForTags(
  tags: string[]
): { tradeSlug: string; confidence: number }[] {
  const best = new Map<string, number>();

  for (const tag of tags) {
    const key = normalizeTag(tag);
    const entries = PREFIXED_TAG_TRADE_MATRIX[key];
    if (!entries) continue;

    for (const entry of entries) {
      const existing = best.get(entry.tradeSlug) ?? 0;
      if (entry.confidence > existing) {
        best.set(entry.tradeSlug, entry.confidence);
      }
    }
  }

  return Array.from(best.entries()).map(([tradeSlug, confidence]) => ({
    tradeSlug,
    confidence,
  }));
}

// Re-export for testing
export { PREFIXED_TAG_TRADE_MATRIX as TAG_TRADE_MATRIX };
