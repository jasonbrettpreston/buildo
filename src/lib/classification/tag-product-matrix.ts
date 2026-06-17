/**
 * Tag-to-Product Matrix
 *
 * Maps scope_tags to product group slugs for material supplier leads.
 */

const PREFIXED_TAG_PRODUCT_MATRIX: Record<string, string[]> = {
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

/**
 * Normalize a scope_tag to its base key for matrix lookup.
 */
function normalizeTag(tag: string): string {
  let base = tag.replace(/^(new|alter|sys|scale|exp):/, '');
  base = base.replace(/^houseplex-\d+-unit$/, 'houseplex');
  // scope.ts emits the singular `window` tag; the matrix keys it `windows`
  // (design-brief §9 bug — otherwise the windows/mirrors-glass products are
  // unreachable via the tag path). Alias so both resolve.
  if (base === 'window') base = 'windows';
  return base;
}

/**
 * Look up product groups for a set of scope_tags.
 * Returns de-duplicated list of product group slugs.
 */
export function lookupProductsForTags(tags: string[]): string[] {
  const productSet = new Set<string>();

  for (const tag of tags) {
    const key = normalizeTag(tag);
    const products = PREFIXED_TAG_PRODUCT_MATRIX[key];
    if (!products) continue;
    for (const p of products) {
      productSet.add(p);
    }
  }

  return Array.from(productSet);
}

