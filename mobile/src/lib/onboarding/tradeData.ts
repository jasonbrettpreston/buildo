// SPEC LINK: docs/specs/03-mobile/94_mobile_onboarding.md §3.1
// Static trade list for the SectionList in profession.tsx.
// 6 category groups, 33 items (32 canonical trade slugs + realtor).
// Slugs match the canonical 32 in the system map exactly.

export type TradeItem = { label: string; slug: string };

export const TRADE_SECTIONS: Array<{ title: string; data: TradeItem[] }> = [
  {
    title: 'SITE & STRUCTURE',
    data: [
      { label: 'Excavation', slug: 'excavation' },
      { label: 'Shoring', slug: 'shoring' },
      { label: 'Demolition', slug: 'demolition' },
      { label: 'Concrete', slug: 'concrete' },
      { label: 'Structural Steel', slug: 'structural-steel' },
      { label: 'Framing', slug: 'framing' },
      { label: 'Masonry', slug: 'masonry' },
      { label: 'Temporary Fencing', slug: 'temporary-fencing' },
    ],
  },
  {
    title: 'MECHANICAL & ELECTRICAL',
    data: [
      { label: 'Plumbing', slug: 'plumbing' },
      { label: 'Plumbing (Drains)', slug: 'drain-plumbing' },
      { label: 'HVAC', slug: 'hvac' },
      { label: 'Electrical', slug: 'electrical' },
      { label: 'Fire Protection', slug: 'fire-protection' },
      { label: 'Elevator', slug: 'elevator' },
      { label: 'Security', slug: 'security' },
      { label: 'Solar', slug: 'solar' },
    ],
  },
  {
    title: 'ENVELOPE & EXTERIOR',
    data: [
      { label: 'Roofing', slug: 'roofing' },
      { label: 'Waterproofing', slug: 'waterproofing' },
      { label: 'Glazing', slug: 'glazing' },
      { label: 'Insulation', slug: 'insulation' },
      { label: 'Eavestrough & Siding', slug: 'eavestrough-siding' },
      { label: 'Caulking', slug: 'caulking' },
    ],
  },
  {
    title: 'INTERIOR FINISHING',
    data: [
      { label: 'Drywall', slug: 'drywall' },
      { label: 'Painting', slug: 'painting' },
      { label: 'Flooring', slug: 'flooring' },
      { label: 'Tiling', slug: 'tiling' },
      { label: 'Trim Work', slug: 'trim-work' },
      { label: 'Millwork & Cabinetry', slug: 'millwork-cabinetry' },
      { label: 'Stone Countertops', slug: 'stone-countertops' },
    ],
  },
  {
    title: 'OUTDOOR & SPECIALTY',
    data: [
      { label: 'Landscaping', slug: 'landscaping' },
      { label: 'Decking & Fences', slug: 'decking-fences' },
      { label: 'Pool Installation', slug: 'pool-installation' },
    ],
  },
  {
    title: 'PROPERTY',
    data: [
      { label: 'Real Estate Agent', slug: 'realtor' },
    ],
  },
];
