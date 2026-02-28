import type { ProductGroup } from '@/lib/permits/types';

/**
 * The 16 product group categories for material supplier lead generation.
 * Each maps to scope_tags via the tag-product matrix.
 */
export const PRODUCT_GROUPS: ProductGroup[] = [
  { id: 1,  slug: 'kitchen-cabinets',   name: 'Kitchen Cabinets',    sort_order: 1  },
  { id: 2,  slug: 'appliances',         name: 'Appliances',          sort_order: 2  },
  { id: 3,  slug: 'countertops',        name: 'Countertops',         sort_order: 3  },
  { id: 4,  slug: 'plumbing-fixtures',  name: 'Plumbing Fixtures',   sort_order: 4  },
  { id: 5,  slug: 'tiling',             name: 'Tiling',              sort_order: 5  },
  { id: 6,  slug: 'windows',            name: 'Windows',             sort_order: 6  },
  { id: 7,  slug: 'doors',              name: 'Doors',               sort_order: 7  },
  { id: 8,  slug: 'flooring',           name: 'Flooring',            sort_order: 8  },
  { id: 9,  slug: 'paint',              name: 'Paint',               sort_order: 9  },
  { id: 10, slug: 'lighting',           name: 'Lighting',            sort_order: 10 },
  { id: 11, slug: 'lumber-drywall',     name: 'Lumber & Drywall',    sort_order: 11 },
  { id: 12, slug: 'roofing-materials',  name: 'Roofing Materials',   sort_order: 12 },
  { id: 13, slug: 'eavestroughs',       name: 'Eavestroughs',        sort_order: 13 },
  { id: 14, slug: 'staircases',         name: 'Staircases',          sort_order: 14 },
  { id: 15, slug: 'mirrors-glass',      name: 'Mirrors & Glass',     sort_order: 15 },
  { id: 16, slug: 'garage-doors',       name: 'Garage Doors',        sort_order: 16 },
];

export function getProductGroupBySlug(slug: string): ProductGroup | undefined {
  return PRODUCT_GROUPS.find((p) => p.slug === slug);
}

export function getProductGroupById(id: number): ProductGroup | undefined {
  return PRODUCT_GROUPS.find((p) => p.id === id);
}
