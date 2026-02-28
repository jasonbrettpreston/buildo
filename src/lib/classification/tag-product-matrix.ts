/**
 * Tag-to-Product Matrix
 *
 * Maps scope_tags to product group slugs for material supplier leads.
 */

const PREFIXED_TAG_PRODUCT_MATRIX: Record<string, string[]> = {
  kitchen: ['kitchen-cabinets', 'appliances', 'countertops', 'plumbing-fixtures', 'tiling', 'lighting', 'flooring'],
  bathroom: ['plumbing-fixtures', 'tiling', 'mirrors-glass', 'lighting', 'paint'],
  basement: ['lumber-drywall', 'flooring', 'paint', 'lighting', 'doors', 'staircases'],
  pool: [],
  deck: ['lumber-drywall'],
  porch: ['lumber-drywall', 'paint'],
  garage: ['lumber-drywall', 'garage-doors', 'lighting'],
  fence: [],
  garden_suite: ['windows', 'doors', 'flooring', 'lighting', 'plumbing-fixtures', 'lumber-drywall', 'roofing-materials', 'paint'],
  laneway: ['windows', 'doors', 'flooring', 'lighting', 'plumbing-fixtures', 'lumber-drywall', 'roofing-materials', 'paint'],
  sfd: [
    'kitchen-cabinets', 'appliances', 'countertops', 'plumbing-fixtures', 'tiling',
    'windows', 'doors', 'flooring', 'paint', 'lighting', 'lumber-drywall',
    'roofing-materials', 'eavestroughs', 'staircases', 'mirrors-glass', 'garage-doors',
  ],
  semi: [
    'kitchen-cabinets', 'appliances', 'countertops', 'plumbing-fixtures', 'tiling',
    'windows', 'doors', 'flooring', 'paint', 'lighting', 'lumber-drywall',
    'roofing-materials', 'eavestroughs', 'staircases',
  ],
  townhouse: [
    'kitchen-cabinets', 'appliances', 'countertops', 'plumbing-fixtures', 'tiling',
    'windows', 'doors', 'flooring', 'paint', 'lighting', 'lumber-drywall',
    'roofing-materials', 'eavestroughs', 'staircases',
  ],
  houseplex: [
    'kitchen-cabinets', 'appliances', 'countertops', 'plumbing-fixtures', 'tiling',
    'windows', 'doors', 'flooring', 'paint', 'lighting', 'lumber-drywall',
    'roofing-materials', 'staircases',
  ],
  roof: ['roofing-materials', 'eavestroughs'],
  cladding: ['eavestroughs'],
  windows: ['windows', 'mirrors-glass'],
  interior: ['paint', 'flooring', 'doors', 'lighting'],
  addition: ['windows', 'doors', 'flooring', 'lumber-drywall', 'roofing-materials', 'paint', 'lighting'],
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

export { PREFIXED_TAG_PRODUCT_MATRIX as TAG_PRODUCT_MATRIX };
