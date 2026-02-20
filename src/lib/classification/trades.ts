import type { Trade } from '@/lib/permits/types';

/**
 * The canonical list of 20 trade categories used by Buildo to classify
 * Toronto building permits into actionable leads.
 */
export const TRADES: Trade[] = [
  { id: 1,  slug: 'excavation',        name: 'Excavation',         icon: 'Shovel',        color: '#795548', sort_order: 1  },
  { id: 2,  slug: 'shoring',           name: 'Shoring',            icon: 'Layers',        color: '#8D6E63', sort_order: 2  },
  { id: 3,  slug: 'concrete',          name: 'Concrete',           icon: 'Square',        color: '#9E9E9E', sort_order: 3  },
  { id: 4,  slug: 'structural-steel',  name: 'Structural Steel',   icon: 'Construction',  color: '#607D8B', sort_order: 4  },
  { id: 5,  slug: 'framing',           name: 'Framing',            icon: 'Frame',         color: '#FF9800', sort_order: 5  },
  { id: 6,  slug: 'masonry',           name: 'Masonry',            icon: 'Brick',         color: '#BF360C', sort_order: 6  },
  { id: 7,  slug: 'roofing',           name: 'Roofing',            icon: 'Home',          color: '#4CAF50', sort_order: 7  },
  { id: 8,  slug: 'plumbing',          name: 'Plumbing',           icon: 'Droplet',       color: '#2196F3', sort_order: 8  },
  { id: 9,  slug: 'hvac',              name: 'HVAC',               icon: 'Wind',          color: '#00BCD4', sort_order: 9  },
  { id: 10, slug: 'electrical',        name: 'Electrical',         icon: 'Zap',           color: '#FFC107', sort_order: 10 },
  { id: 11, slug: 'fire-protection',   name: 'Fire Protection',    icon: 'Flame',         color: '#F44336', sort_order: 11 },
  { id: 12, slug: 'insulation',        name: 'Insulation',         icon: 'Thermometer',   color: '#E91E63', sort_order: 12 },
  { id: 13, slug: 'drywall',           name: 'Drywall',            icon: 'Layout',        color: '#BDBDBD', sort_order: 13 },
  { id: 14, slug: 'painting',          name: 'Painting',           icon: 'Paintbrush',    color: '#9C27B0', sort_order: 14 },
  { id: 15, slug: 'flooring',          name: 'Flooring',           icon: 'Grid3x3',       color: '#3E2723', sort_order: 15 },
  { id: 16, slug: 'glazing',           name: 'Glazing',            icon: 'PanelTop',      color: '#03A9F4', sort_order: 16 },
  { id: 17, slug: 'elevator',          name: 'Elevator',           icon: 'ArrowUpDown',   color: '#455A64', sort_order: 17 },
  { id: 18, slug: 'demolition',        name: 'Demolition',         icon: 'Trash',         color: '#D32F2F', sort_order: 18 },
  { id: 19, slug: 'landscaping',       name: 'Landscaping',        icon: 'TreePine',      color: '#388E3C', sort_order: 19 },
  { id: 20, slug: 'waterproofing',     name: 'Waterproofing',      icon: 'Shield',        color: '#0D47A1', sort_order: 20 },
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
