import type { TradeMappingRule } from '@/lib/permits/types';

let nextId = 1;
function rule(
  trade_id: number,
  tier: number,
  match_field: string,
  match_pattern: string,
  confidence: number,
  phase_start: number | null = null,
  phase_end: number | null = null
): TradeMappingRule {
  return {
    id: nextId++,
    trade_id,
    tier,
    match_field,
    match_pattern,
    confidence,
    phase_start,
    phase_end,
    is_active: true,
  };
}

// Trade IDs map: 1=excavation, 2=shoring, 3=concrete, 4=structural-steel,
// 5=framing, 6=masonry, 7=roofing, 8=plumbing, 9=hvac, 10=electrical,
// 11=fire-protection, 12=insulation, 13=drywall, 14=painting, 15=flooring,
// 16=glazing, 17=elevator, 18=demolition, 19=landscaping, 20=waterproofing

// ---------------------------------------------------------------------------
// Tier 1: PERMIT_TYPE direct match (highest confidence)
// ---------------------------------------------------------------------------
export const TIER_1_RULES: TradeMappingRule[] = [
  rule(8,  1, 'permit_type', 'Plumbing(PS)',           0.95, 3, 18),
  rule(8,  1, 'permit_type', 'Plumbing',               0.95, 3, 18),
  rule(8,  1, 'permit_type', 'Drain and Site Service', 0.90, 3, 18),
  rule(18, 1, 'permit_type', 'Demolition Folder (DM)', 0.95, 0, 3),
  rule(18, 1, 'permit_type', 'Demolition',             0.95, 0, 3),
  rule(9,  1, 'permit_type', 'Mechanical/HVAC(MH)',    0.95, 3, 18),
  rule(9,  1, 'permit_type', 'Mechanical',             0.90, 3, 18),
  rule(10, 1, 'permit_type', 'Electrical(EL)',         0.95, 3, 18),
  rule(10, 1, 'permit_type', 'Electrical',             0.95, 3, 18),
  rule(11, 1, 'permit_type', 'Fire/Security Upgrade',   0.95, 6, 18),
  rule(11, 1, 'permit_type', 'Fire Alarm',             0.90, 6, 18),
  rule(11, 1, 'permit_type', 'Sprinkler',              0.90, 6, 18),
];

// ---------------------------------------------------------------------------
// Tier 2: WORK field match (high confidence)
// ---------------------------------------------------------------------------
export const TIER_2_RULES: TradeMappingRule[] = [
  rule(7,  2, 'work', 'Re-Roofing',             0.85, 9, 18),
  rule(7,  2, 'work', 'Re-Cladding',            0.80, 9, 18),
  rule(2,  2, 'work', 'Underpinning',           0.85, 0, 6),
  rule(2,  2, 'work', 'Shoring',                0.90, 0, 6),
  rule(18, 2, 'work', 'Demolition',             0.85, 0, 3),
  rule(13, 2, 'work', 'Interior Alterations',   0.70, 9, 18),
  rule(14, 2, 'work', 'Interior Alterations',   0.60, 9, 18),
  rule(15, 2, 'work', 'Interior Alterations',   0.60, 9, 18),
  rule(5,  2, 'work', 'New Building',           0.75, 3, 9),
  rule(3,  2, 'work', 'New Building',           0.75, 0, 6),
  rule(1,  2, 'work', 'New Building',           0.70, 0, 3),
  rule(5,  2, 'work', 'Addition',               0.70, 3, 9),
  rule(16, 2, 'work', 'Curtain Wall',           0.85, 9, 18),
  rule(20, 2, 'work', 'Foundation Repair',      0.80, 0, 6),
  rule(1,  2, 'work', 'Excavation',             0.90, 0, 3),
  rule(17, 2, 'work', 'Elevator',               0.85, 6, 18),
  rule(19, 2, 'work', 'Site Servicing',         0.60, 18, 24),
  rule(6,  2, 'work', 'Masonry',                0.85, 3, 12),
];

// ---------------------------------------------------------------------------
// Tier 2: STRUCTURE_TYPE inferred match (moderate confidence)
// These are inferred from structure type in the absence of actual building
// plans. Confidence is lower (0.50-0.65) as these are estimates that may be
// refined as the rule engine improves over time.
// ---------------------------------------------------------------------------
export const STRUCTURE_TYPE_RULES: TradeMappingRule[] = [
  // Small residential (SFD-*) → typical residential trades
  rule(5,  2, 'structure_type', 'SFD',               0.55, 3, 9),   // framing
  rule(7,  2, 'structure_type', 'SFD',               0.50, 9, 18),  // roofing
  rule(8,  2, 'structure_type', 'SFD',               0.50, 3, 18),  // plumbing
  rule(9,  2, 'structure_type', 'SFD',               0.50, 3, 18),  // hvac
  rule(10, 2, 'structure_type', 'SFD',               0.50, 3, 18),  // electrical
  rule(12, 2, 'structure_type', 'SFD',               0.45, 9, 18),  // insulation
  rule(13, 2, 'structure_type', 'SFD',               0.45, 9, 18),  // drywall
  rule(14, 2, 'structure_type', 'SFD',               0.40, 9, 18),  // painting
  rule(15, 2, 'structure_type', 'SFD',               0.40, 9, 18),  // flooring

  // Laneway / Rear Yard Suite → similar to small residential
  rule(5,  2, 'structure_type', 'Laneway',           0.55, 3, 9),   // framing
  rule(3,  2, 'structure_type', 'Laneway',           0.50, 0, 6),   // concrete
  rule(1,  2, 'structure_type', 'Laneway',           0.50, 0, 3),   // excavation

  // Apartment Building → high-rise trades
  rule(3,  2, 'structure_type', 'Apartment Building', 0.60, 0, 6),  // concrete
  rule(17, 2, 'structure_type', 'Apartment Building', 0.60, 6, 18), // elevator
  rule(11, 2, 'structure_type', 'Apartment Building', 0.55, 6, 18), // fire-protection
  rule(16, 2, 'structure_type', 'Apartment Building', 0.55, 9, 18), // glazing
  rule(4,  2, 'structure_type', 'Apartment Building', 0.50, 3, 9),  // structural-steel

  // Stacked Townhouses → mid-density trades
  rule(3,  2, 'structure_type', 'Stacked Townhouses', 0.55, 0, 6),  // concrete
  rule(11, 2, 'structure_type', 'Stacked Townhouses', 0.50, 6, 18), // fire-protection

  // Industrial → heavy trades
  rule(4,  2, 'structure_type', 'Industrial',        0.60, 3, 9),   // structural-steel
  rule(10, 2, 'structure_type', 'Industrial',        0.55, 3, 18),  // electrical
  rule(3,  2, 'structure_type', 'Industrial',        0.55, 0, 6),   // concrete

  // Office / Commercial → commercial trades
  rule(11, 2, 'structure_type', 'Office',            0.50, 6, 18),  // fire-protection
  rule(16, 2, 'structure_type', 'Office',            0.50, 9, 18),  // glazing
  rule(9,  2, 'structure_type', 'Office',            0.50, 3, 18),  // hvac

  // Retail → commercial finish trades
  rule(16, 2, 'structure_type', 'Retail',            0.50, 9, 18),  // glazing
  rule(11, 2, 'structure_type', 'Retail',            0.45, 6, 18),  // fire-protection

  // Restaurant → specific systems
  rule(9,  2, 'structure_type', 'Restaurant',        0.55, 3, 18),  // hvac (kitchen exhaust)
  rule(8,  2, 'structure_type', 'Restaurant',        0.50, 3, 18),  // plumbing
  rule(11, 2, 'structure_type', 'Restaurant',        0.50, 6, 18),  // fire-protection
];

// ---------------------------------------------------------------------------
// Tier 3: DESCRIPTION keyword/regex match (moderate confidence)
// ---------------------------------------------------------------------------
export const TIER_3_RULES: TradeMappingRule[] = [
  // Plumbing keywords
  rule(8,  3, 'description', 'plumb(ing|er)',              0.65, 3, 18),
  rule(8,  3, 'description', 'water\\s*(heater|tank|line)', 0.60, 3, 18),
  rule(8,  3, 'description', 'drain(age|s)?',              0.55, 3, 18),
  rule(8,  3, 'description', 'sewer',                      0.60, 3, 18),
  rule(8,  3, 'description', 'bathroom|washroom|lavatory',  0.55, 3, 18),

  // Electrical keywords
  rule(10, 3, 'description', 'electri(cal|c)',             0.65, 3, 18),
  rule(10, 3, 'description', 'wiring|rewir',              0.65, 3, 18),
  rule(10, 3, 'description', 'panel\\s*upgrade',           0.60, 3, 18),
  rule(10, 3, 'description', 'transformer',               0.55, 3, 18),

  // HVAC keywords
  rule(9,  3, 'description', 'hvac|furnace',              0.65, 3, 18),
  rule(9,  3, 'description', 'air\\s*condition',           0.60, 3, 18),
  rule(9,  3, 'description', 'duct(work|s)?',             0.55, 3, 18),
  rule(9,  3, 'description', 'ventilat',                  0.55, 3, 18),
  rule(9,  3, 'description', 'heat(ing|\\s*pump)',         0.55, 3, 18),

  // Roofing keywords
  rule(7,  3, 'description', 'roof(ing)?|shingle',        0.65, 9, 18),
  rule(7,  3, 'description', 'eaves(trough)?|gutter',     0.55, 9, 18),

  // Concrete / foundation
  rule(3,  3, 'description', 'concrete|foundation',       0.60, 0, 6),
  rule(3,  3, 'description', 'footing|slab',              0.55, 0, 6),

  // Framing
  rule(5,  3, 'description', 'fram(ing|e)',               0.55, 3, 9),
  rule(5,  3, 'description', 'storey|story|floor.*new',   0.50, 3, 9),

  // Masonry
  rule(6,  3, 'description', 'mason(ry)?|brick(work)?',   0.60, 3, 12),
  rule(6,  3, 'description', 'stone.*veneer',             0.55, 3, 12),

  // Insulation
  rule(12, 3, 'description', 'insulat',                   0.60, 9, 18),
  rule(12, 3, 'description', 'vapou?r\\s*barrier',        0.55, 9, 18),

  // Drywall
  rule(13, 3, 'description', 'drywall|gypsum',            0.60, 9, 18),
  rule(13, 3, 'description', 'partition.*wall',           0.55, 9, 18),

  // Painting
  rule(14, 3, 'description', 'paint(ing)?|finish(ing)?',  0.55, 9, 18),

  // Flooring
  rule(15, 3, 'description', 'floor(ing)?|tile|hardwood', 0.60, 9, 18),
  rule(15, 3, 'description', 'carpet|laminate|vinyl',     0.55, 9, 18),

  // Glazing
  rule(16, 3, 'description', 'glaz(ing|e)|window|curtain.*wall', 0.60, 9, 18),

  // Elevator
  rule(17, 3, 'description', 'elevator|escalator|lift',   0.65, 6, 18),

  // Demolition
  rule(18, 3, 'description', 'demoli(tion|sh)',           0.65, 0, 3),

  // Excavation
  rule(1,  3, 'description', 'excavat',                   0.60, 0, 3),
  rule(1,  3, 'description', 'dig(ging)?|trench',        0.50, 0, 3),

  // Shoring
  rule(2,  3, 'description', 'shor(ing|e)',               0.60, 0, 6),
  rule(2,  3, 'description', 'underpinn',                 0.60, 0, 6),
  rule(2,  3, 'description', 'retain(ing)?.*wall',       0.55, 0, 6),

  // Structural steel
  rule(4,  3, 'description', 'structural.*steel',         0.65, 3, 9),
  rule(4,  3, 'description', 'steel.*beam|steel.*column', 0.60, 3, 9),

  // Fire protection
  rule(11, 3, 'description', 'fire.*protect|sprinkler',   0.60, 6, 18),
  rule(11, 3, 'description', 'fire.*alarm|fire.*suppres', 0.55, 6, 18),

  // Landscaping
  rule(19, 3, 'description', 'landscap',                  0.60, 18, 24),
  rule(19, 3, 'description', 'garden|patio|deck',        0.50, 18, 24),

  // Waterproofing
  rule(20, 3, 'description', 'waterproof',                0.65, 0, 6),
  rule(20, 3, 'description', 'damp.*proof|membrane',     0.55, 0, 6),
];

export const ALL_RULES: TradeMappingRule[] = [
  ...TIER_1_RULES,
  ...TIER_2_RULES,
  ...STRUCTURE_TYPE_RULES,
  ...TIER_3_RULES,
];
