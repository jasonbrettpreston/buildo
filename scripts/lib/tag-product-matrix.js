'use strict';
// ---------------------------------------------------------------------------
// Tag-to-Product Matrix — JS twin of src/lib/classification/tag-product-matrix.ts
// (§7.1 dual-path; pinned by src/tests/product-archetype-sync.logic.test.ts).
//
// Maps scope_tags → product group slugs for material/rental/service supplier leads.
// Spec 80 §5.B.3: lumber-drywall split into lumber + drywall-board.
// ---------------------------------------------------------------------------

const PREFIXED_TAG_PRODUCT_MATRIX = {
  kitchen: ['kitchen-cabinets', 'appliances', 'countertops', 'plumbing-fixtures', 'tiling', 'lighting', 'flooring'],
  bathroom: ['plumbing-fixtures', 'tiling', 'mirrors-glass', 'lighting', 'paint'],
  basement: ['lumber', 'drywall-board', 'flooring', 'paint', 'lighting', 'doors', 'staircases'],
  pool: [],
  deck: ['lumber'],
  porch: ['lumber', 'paint'],
  garage: ['lumber', 'drywall-board', 'garage-doors', 'lighting'],
  fence: [],
  garden_suite: ['windows', 'doors', 'flooring', 'lighting', 'plumbing-fixtures', 'lumber', 'drywall-board', 'roofing-materials', 'paint'],
  laneway: ['windows', 'doors', 'flooring', 'lighting', 'plumbing-fixtures', 'lumber', 'drywall-board', 'roofing-materials', 'paint'],
  'build-sfd': [
    'kitchen-cabinets', 'appliances', 'countertops', 'plumbing-fixtures', 'tiling',
    'windows', 'doors', 'flooring', 'paint', 'lighting', 'lumber', 'drywall-board',
    'roofing-materials', 'eavestroughs', 'staircases', 'mirrors-glass', 'garage-doors',
  ],
  semi: [
    'kitchen-cabinets', 'appliances', 'countertops', 'plumbing-fixtures', 'tiling',
    'windows', 'doors', 'flooring', 'paint', 'lighting', 'lumber', 'drywall-board',
    'roofing-materials', 'eavestroughs', 'staircases',
  ],
  townhouse: [
    'kitchen-cabinets', 'appliances', 'countertops', 'plumbing-fixtures', 'tiling',
    'windows', 'doors', 'flooring', 'paint', 'lighting', 'lumber', 'drywall-board',
    'roofing-materials', 'eavestroughs', 'staircases',
  ],
  houseplex: [
    'kitchen-cabinets', 'appliances', 'countertops', 'plumbing-fixtures', 'tiling',
    'windows', 'doors', 'flooring', 'paint', 'lighting', 'lumber', 'drywall-board',
    'roofing-materials', 'staircases',
  ],
  roof: ['roofing-materials', 'eavestroughs'],
  cladding: ['eavestroughs'],
  windows: ['windows', 'mirrors-glass'],
  interior: ['paint', 'flooring', 'doors', 'lighting'],
  addition: ['windows', 'doors', 'flooring', 'lumber', 'drywall-board', 'roofing-materials', 'paint', 'lighting'],
  fireplace: [],
  solar: [],
  elevator: [],
  demolition: [],
  security: [],
};

/** Normalize a scope_tag to its base matrix key (mirror of the TS twin). */
function normalizeTag(tag) {
  let base = tag.replace(/^(new|alter|sys|scale|exp):/, '');
  base = base.replace(/^houseplex-\d+-unit$/, 'houseplex');
  // scope.ts emits singular `window`; the matrix keys it `windows` (design-brief §9).
  if (base === 'window') base = 'windows';
  return base;
}

/** De-duplicated product-group slugs implied by a set of scope_tags. */
function lookupProductsForTags(tags) {
  const productSet = new Set();
  for (const tag of tags || []) {
    const products = PREFIXED_TAG_PRODUCT_MATRIX[normalizeTag(tag)];
    if (!products) continue;
    for (const p of products) productSet.add(p);
  }
  return Array.from(productSet);
}

module.exports = { PREFIXED_TAG_PRODUCT_MATRIX, lookupProductsForTags };
