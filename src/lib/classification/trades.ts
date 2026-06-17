import type { Trade } from '@/lib/permits/types';

/**
 * The canonical list of 36 trade categories (35 active + 1 deprecated) used by
 * Buildo to classify Toronto building permits into actionable leads.
 *
 * IDs 1-20: original trades (4 display renames, slugs unchanged)
 * IDs 21-31: trades added in WF3
 * ID 32: drain-plumbing (specialized drain/site-service trade)
 * ID 33: realtor (Real Estate Agent persona — WF2 Cycle 7, Spec 91 §1.3)
 * IDs 34/36/37: Spec 80 v-next additions (overhead-doors, site-preparation,
 *   site-maintenance). ID 30 (temporary-fencing) is kept as `kind:'deprecated'`
 *   (folded into site-preparation + the temp-fencing-rental product) — NOT
 *   renumbered (IDs 1-32 are the never-renumber invariant). Each row carries the
 *   §5.B.2 taxonomy attributes: kind, seq (build-stage band 1-12), cost_basis.
 */
export const TRADES: Trade[] = [
  { id: 1,  slug: 'excavation',          name: 'Excavation',              icon: 'Shovel',        color: '#795548', sort_order: 1,  kind: 'construction', seq: 3,    cost_basis: 'per_sqft' },
  { id: 2,  slug: 'shoring',             name: 'Shoring',                 icon: 'Layers',        color: '#8D6E63', sort_order: 2,  kind: 'construction', seq: 3,    cost_basis: 'per_sqft' },
  { id: 3,  slug: 'concrete',            name: 'Concrete',                icon: 'Square',        color: '#9E9E9E', sort_order: 3,  kind: 'construction', seq: 4,    cost_basis: 'per_sqft' },
  { id: 4,  slug: 'structural-steel',    name: 'Structural Steel',        icon: 'Construction',  color: '#607D8B', sort_order: 4,  kind: 'construction', seq: 6,    cost_basis: 'per_sqft' },
  { id: 5,  slug: 'framing',             name: 'Framing',                 icon: 'Frame',         color: '#FF9800', sort_order: 5,  kind: 'construction', seq: 6,    cost_basis: 'per_sqft' },
  { id: 6,  slug: 'masonry',             name: 'Masonry & Brickwork',     icon: 'Brick',         color: '#BF360C', sort_order: 6,  kind: 'construction', seq: 7,    cost_basis: 'per_sqft' },
  { id: 7,  slug: 'roofing',             name: 'Roofing',                 icon: 'Home',          color: '#4CAF50', sort_order: 7,  kind: 'construction', seq: 7,    cost_basis: 'per_sqft' },
  { id: 8,  slug: 'plumbing',            name: 'Plumbing',                icon: 'Droplet',       color: '#2196F3', sort_order: 8,  kind: 'construction', seq: 8,    cost_basis: 'per_sqft' },
  { id: 9,  slug: 'hvac',                name: 'HVAC & Sheet Metal',      icon: 'Wind',          color: '#00BCD4', sort_order: 9,  kind: 'construction', seq: 8,    cost_basis: 'per_sqft' },
  { id: 10, slug: 'electrical',          name: 'Electrical',              icon: 'Zap',           color: '#FFC107', sort_order: 10, kind: 'construction', seq: 8,    cost_basis: 'per_sqft' },
  { id: 11, slug: 'fire-protection',     name: 'Fire Protection',         icon: 'Flame',         color: '#F44336', sort_order: 11, kind: 'construction', seq: 8,    cost_basis: 'per_sqft' },
  { id: 12, slug: 'insulation',          name: 'Insulation',              icon: 'Thermometer',   color: '#E91E63', sort_order: 12, kind: 'construction', seq: 9,    cost_basis: 'per_sqft' },
  { id: 13, slug: 'drywall',             name: 'Drywall & Taping',        icon: 'Layout',        color: '#BDBDBD', sort_order: 13, kind: 'construction', seq: 10,   cost_basis: 'per_sqft' },
  { id: 14, slug: 'painting',            name: 'Painting',                icon: 'Paintbrush',    color: '#9C27B0', sort_order: 14, kind: 'construction', seq: 11,   cost_basis: 'per_sqft' },
  { id: 15, slug: 'flooring',            name: 'Flooring',                icon: 'Grid3x3',       color: '#3E2723', sort_order: 15, kind: 'construction', seq: 11,   cost_basis: 'per_sqft' },
  { id: 16, slug: 'glazing',             name: 'Glazing',                 icon: 'PanelTop',      color: '#03A9F4', sort_order: 16, kind: 'construction', seq: 7,    cost_basis: 'per_unit' },
  { id: 17, slug: 'elevator',            name: 'Elevator',                icon: 'ArrowUpDown',   color: '#455A64', sort_order: 17, kind: 'construction', seq: 11,   cost_basis: 'per_unit' },
  { id: 18, slug: 'demolition',          name: 'Demolition',              icon: 'Trash',         color: '#D32F2F', sort_order: 18, kind: 'construction', seq: 2,    cost_basis: 'per_sqft' },
  { id: 19, slug: 'landscaping',         name: 'Landscaping & Hardscaping', icon: 'TreePine',    color: '#388E3C', sort_order: 19, kind: 'construction', seq: 12,   cost_basis: 'fixed' },
  { id: 20, slug: 'waterproofing',       name: 'Waterproofing',           icon: 'Shield',        color: '#0D47A1', sort_order: 20, kind: 'construction', seq: 5,    cost_basis: 'per_sqft' },
  // --- New trades (WF3) ---
  { id: 21, slug: 'trim-work',           name: 'Trim Work',               icon: 'Ruler',         color: '#A1887F', sort_order: 21, kind: 'construction', seq: 11,   cost_basis: 'per_sqft' },
  { id: 22, slug: 'millwork-cabinetry',  name: 'Millwork & Cabinetry',    icon: 'DoorOpen',      color: '#6D4C41', sort_order: 22, kind: 'construction', seq: 11,   cost_basis: 'per_unit' },
  { id: 23, slug: 'tiling',              name: 'Tiling',                  icon: 'LayoutGrid',    color: '#26A69A', sort_order: 23, kind: 'construction', seq: 11,   cost_basis: 'per_sqft' },
  { id: 24, slug: 'stone-countertops',   name: 'Stone & Countertops',     icon: 'Gem',           color: '#78909C', sort_order: 24, kind: 'construction', seq: 11,   cost_basis: 'per_unit' },
  { id: 25, slug: 'decking-fences',      name: 'Decking & Fences',        icon: 'Fence',         color: '#5D4037', sort_order: 25, kind: 'construction', seq: 12,   cost_basis: 'per_sqft' },
  { id: 26, slug: 'eavestrough-siding',  name: 'Eavestrough & Siding',   icon: 'ArrowDownToLine', color: '#546E7A', sort_order: 26, kind: 'construction', seq: 7,    cost_basis: 'per_sqft' },
  { id: 27, slug: 'pool-installation',   name: 'Pool Installation',       icon: 'Waves',         color: '#0097A7', sort_order: 27, kind: 'construction', seq: 12,   cost_basis: 'fixed' },
  { id: 28, slug: 'solar',               name: 'Solar',                   icon: 'Sun',           color: '#F57F17', sort_order: 28, kind: 'construction', seq: 7,    cost_basis: 'per_unit' },
  { id: 29, slug: 'security',            name: 'Security',                icon: 'ShieldCheck',   color: '#37474F', sort_order: 29, kind: 'construction', seq: 11,   cost_basis: 'fixed' },
  // ID 30 kept (IDs 1-32 invariant) but DEPRECATED — folded into site-preparation (36) + temp-fencing-rental product. Spec 80 §5.B.6.
  { id: 30, slug: 'temporary-fencing',   name: 'Temporary Fencing',       icon: 'AlertTriangle', color: '#FF6F00', sort_order: 30, kind: 'deprecated',   seq: null, cost_basis: 'per_sqft' },
  { id: 31, slug: 'caulking',            name: 'Caulking',                icon: 'Pipette',       color: '#B0BEC5', sort_order: 31, kind: 'construction', seq: 7,    cost_basis: 'per_sqft' },
  { id: 32, slug: 'drain-plumbing',     name: 'Drain & Plumbing',        icon: 'Droplet',       color: '#1565C0', sort_order: 32, kind: 'construction', seq: 5,    cost_basis: 'per_sqft' },
  // --- Real Estate persona (WF2 Cycle 7, 2026-05-06) ---
  // Per Spec 91 §1.3 + §3.5: realtors are tradespeople algorithmically,
  // calibrated to P1 (earliest visibility) + P19 (predicted occupancy /
  // ready-to-list). The 'realtor' slug is the authoritative algorithm
  // input; account_preset='realtor' is the UX hint (Spec 95 §2.5.1).
  { id: 33, slug: 'realtor',             name: 'Real Estate Agent',       icon: 'Key',           color: '#EC407A', sort_order: 33, kind: 'persona',      seq: null, cost_basis: 'commission' },
  // --- Spec 80 v-next additions (2026-06-17) ---
  { id: 34, slug: 'overhead-doors',      name: 'Overhead Doors',          icon: 'Warehouse',     color: '#8B5A2B', sort_order: 34, kind: 'construction', seq: 11,   cost_basis: 'per_unit' },
  { id: 36, slug: 'site-preparation',    name: 'Site Preparation',        icon: 'TrafficCone',   color: '#C19A6B', sort_order: 36, kind: 'service',      seq: 1,    cost_basis: 'fixed' },
  { id: 37, slug: 'site-maintenance',    name: 'Site Maintenance',        icon: 'Trash2',        color: '#808080', sort_order: 37, kind: 'service',      seq: null, cost_basis: 'fixed' },
];

/**
 * Look up a trade by its URL-friendly slug (e.g. "hvac", "plumbing").
 */
export function getTradeBySlug(slug: string): Trade | undefined {
  return TRADES.find((t) => t.slug === slug);
}

/**
 * Look up a trade by its numeric id.
 */
export function getTradeById(id: number): Trade | undefined {
  return TRADES.find((t) => t.id === id);
}
