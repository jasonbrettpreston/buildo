import type { ProductGroup } from '@/lib/permits/types';

/**
 * The 27 product group categories (20 material / 4 rental / 3 service) for
 * material/rental/service supplier lead generation. Each maps to scope_tags via
 * the tag-product matrix. Spec 80 §5.B.3: the old `lumber-drywall`(11) is split
 * into `lumber`(11) + `drywall-board`(12), shifting the old ids 12-16 up by +1.
 */
export const PRODUCT_GROUPS: ProductGroup[] = [
  { id: 1,  slug: 'kitchen-cabinets',     name: 'Kitchen Cabinets',         sort_order: 1,  type: 'material' },
  { id: 2,  slug: 'appliances',           name: 'Appliances',               sort_order: 2,  type: 'material' },
  { id: 3,  slug: 'countertops',          name: 'Countertops',              sort_order: 3,  type: 'material' },
  { id: 4,  slug: 'plumbing-fixtures',    name: 'Plumbing Fixtures',        sort_order: 4,  type: 'material' },
  { id: 5,  slug: 'tiling',               name: 'Tiling',                   sort_order: 5,  type: 'material' },
  { id: 6,  slug: 'windows',              name: 'Windows',                  sort_order: 6,  type: 'material' },
  { id: 7,  slug: 'doors',                name: 'Doors',                    sort_order: 7,  type: 'material' },
  { id: 8,  slug: 'flooring',             name: 'Flooring',                 sort_order: 8,  type: 'material' },
  { id: 9,  slug: 'paint',                name: 'Paint',                    sort_order: 9,  type: 'material' },
  { id: 10, slug: 'lighting',             name: 'Lighting',                 sort_order: 10, type: 'material' },
  { id: 11, slug: 'lumber',               name: 'Lumber',                   sort_order: 11, type: 'material' },
  { id: 12, slug: 'drywall-board',        name: 'Drywall Board',            sort_order: 12, type: 'material' },
  { id: 13, slug: 'roofing-materials',    name: 'Roofing Materials',        sort_order: 13, type: 'material' },
  { id: 14, slug: 'eavestroughs',         name: 'Eavestroughs',             sort_order: 14, type: 'material' },
  { id: 15, slug: 'staircases',           name: 'Staircases',               sort_order: 15, type: 'material' },
  { id: 16, slug: 'mirrors-glass',        name: 'Mirrors & Glass',          sort_order: 16, type: 'material' },
  { id: 17, slug: 'garage-doors',         name: 'Garage Doors',             sort_order: 17, type: 'material' },
  { id: 18, slug: 'hvac-equipment',       name: 'HVAC Equipment',           sort_order: 18, type: 'material' },
  { id: 19, slug: 'insulation-materials', name: 'Insulation Materials',     sort_order: 19, type: 'material' },
  { id: 20, slug: 'exterior-cladding',    name: 'Exterior Cladding',        sort_order: 20, type: 'material' },
  { id: 21, slug: 'bin-rental',           name: 'Bin Rental',               sort_order: 21, type: 'rental' },
  { id: 22, slug: 'portable-toilet',      name: 'Portable Toilet',          sort_order: 22, type: 'rental' },
  { id: 23, slug: 'scaffolding-lifts',    name: 'Scaffolding & Lifts',      sort_order: 23, type: 'rental' },
  { id: 24, slug: 'temp-fencing-rental',  name: 'Temporary Fencing Rental', sort_order: 24, type: 'rental' },
  { id: 25, slug: 'surveying',            name: 'Surveying',                sort_order: 25, type: 'service' },
  { id: 26, slug: 'tree-removal',         name: 'Tree Removal',             sort_order: 26, type: 'service' },
  { id: 27, slug: 'site-security',        name: 'Site Security',            sort_order: 27, type: 'service' },
];
