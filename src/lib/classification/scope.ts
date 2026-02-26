// ---------------------------------------------------------------------------
// Permit Scope Classification
// ---------------------------------------------------------------------------
//
// Classifies permits along two dimensions:
//   1. project_type (mutually exclusive) — what kind of project
//   2. scope_tags (multiple per permit) — what specifically is being built/changed
//
// Branching:
//   Small Residential              → extractResidentialTags()
//   New House*                     → extractNewHouseTags()
//   Building Additions/Alterations
//     + isResidentialStructure()   → extractResidentialTags()
//   Everything else                → extractScopeTags()
// ---------------------------------------------------------------------------

import type { Permit } from '@/lib/permits/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProjectType =
  | 'new_build'
  | 'addition'
  | 'renovation'
  | 'demolition'
  | 'mechanical'
  | 'repair'
  | 'other';

export type WorkType = 'new' | 'alter';

export type ResidentialTagSlug =
  // new: tags (27)
  | '1-storey-addition'
  | '2-storey-addition'
  | '3-storey-addition'
  | 'deck'
  | 'garage'
  | 'porch'
  | 'basement'
  | 'underpinning'
  | 'walkout'
  | 'balcony'
  | 'dormer'
  | 'second-suite'
  | 'kitchen'
  | 'bathroom'
  | 'laundry'
  | 'open-concept'
  | 'structural-beam'
  | 'laneway-suite'
  | 'pool'
  | 'carport'
  | 'canopy'
  | 'roofing'
  | 'fence'
  | 'foundation'
  | 'solar'
  | 'fireplace'
  | 'accessory-building'
  | 'stair'
  | 'window'
  | 'door'
  | 'shoring'
  | 'demolition'
  // alter: tags (6)
  | 'interior-alterations'
  | 'fire-damage'
  | 'unit-conversion';
// Note: alter:deck, alter:porch, alter:garage share slugs with their new: counterparts

export type NewHouseBuildingType =
  | 'sfd'
  | 'semi-detached'
  | 'townhouse'
  | 'stacked-townhouse'
  | 'houseplex-2-unit'
  | 'houseplex-3-unit'
  | 'houseplex-4-unit'
  | 'houseplex-5-unit'
  | 'houseplex-6-unit';

export type NewHouseFeature =
  | 'garage'
  | 'deck'
  | 'porch'
  | 'walkout'
  | 'balcony'
  | 'laneway-suite'
  | 'finished-basement';

export type ScopeTag =
  // Structural
  | '2nd-floor'
  | '3rd-floor'
  | 'rear-addition'
  | 'side-addition'
  | 'front-addition'
  | 'storey-addition'
  | 'basement'
  | 'underpinning'
  | 'foundation'
  // Exterior
  | 'deck'
  | 'porch'
  | 'garage'
  | 'carport'
  | 'canopy'
  | 'walkout'
  | 'balcony'
  | 'laneway-suite'
  | 'pool'
  | 'fence'
  | 'roofing'
  // Interior
  | 'kitchen'
  | 'bathroom'
  | 'basement-finish'
  | 'second-suite'
  | 'open-concept'
  | 'convert-unit'
  | 'tenant-fitout'
  // Building
  | 'condo'
  | 'apartment'
  | 'townhouse'
  | 'mixed-use'
  | 'retail'
  | 'office'
  | 'restaurant'
  | 'warehouse'
  | 'school'
  | 'hospital'
  // Systems
  | 'hvac'
  | 'plumbing'
  | 'electrical'
  | 'sprinkler'
  | 'fire-alarm'
  | 'elevator'
  | 'drain'
  | 'backflow-preventer'
  | 'access-control'
  // Experimental
  | 'stair'
  | 'window'
  | 'door'
  | 'shoring'
  | 'demolition'
  | 'station'
  | 'storage'
  // Use-type
  | 'commercial'
  | 'residential'
  // Scale
  | 'high-rise'
  | 'mid-rise'
  | 'low-rise';

export interface ScopeResult {
  project_type: ProjectType;
  scope_tags: string[];
}

// ---------------------------------------------------------------------------
// Scope tag patterns — general (non-residential)
// ---------------------------------------------------------------------------

interface TagPattern {
  tag: ScopeTag;
  patterns: RegExp[];
}

const TAG_PATTERNS: TagPattern[] = [
  // Structural
  { tag: '2nd-floor', patterns: [/\b2nd\s*(floor|storey|flr)\b/i, /\bsecond\s*(floor|storey|flr)\b/i] },
  { tag: '3rd-floor', patterns: [/\b3rd\s*(floor|storey|flr)\b/i, /\bthird\s*(floor|storey|flr)\b/i] },
  { tag: 'rear-addition', patterns: [/\brear\s*(addition|ext(ension)?)\b/i] },
  { tag: 'side-addition', patterns: [/\bside\s*(addition|ext(ension)?)\b/i] },
  { tag: 'front-addition', patterns: [/\bfront\s*(addition|ext(ension)?)\b/i] },
  { tag: 'storey-addition', patterns: [/\b(storey|story)\s*addition\b/i, /\badd(ition)?\s*(a|one|1|two|2|three|3)?\s*(storey|story|stories)\b/i] },
  { tag: 'basement', patterns: [/\bbasement\b/i] },
  { tag: 'underpinning', patterns: [/\bunderpinn?ing\b/i] },
  { tag: 'foundation', patterns: [/\bfoundation\b/i] },
  // Exterior
  { tag: 'deck', patterns: [/\bdeck\b/i] },
  { tag: 'porch', patterns: [/\bporch\b/i] },
  { tag: 'garage', patterns: [/\bgarage\b/i] },
  { tag: 'carport', patterns: [/\bcarport\b/i] },
  { tag: 'canopy', patterns: [/\bcanopy\b/i] },
  { tag: 'walkout', patterns: [/\bwalk[\s-]?out\b/i] },
  { tag: 'balcony', patterns: [/\bbalcon(y|ies)\b/i] },
  { tag: 'laneway-suite', patterns: [/\blaneway\s*(suite|house)\b/i, /\blaneway\b/i] },
  { tag: 'pool', patterns: [/\bpool\b/i] },
  { tag: 'fence', patterns: [/\bfenc(e|ing)\b/i] },
  { tag: 'roofing', patterns: [/\broof(ing)?\b/i, /\bre-?roof\b/i] },
  // Interior
  { tag: 'kitchen', patterns: [/\bkitchen\b/i] },
  { tag: 'bathroom', patterns: [/\bbath(room)?\b/i, /\bwashroom\b/i] },
  { tag: 'basement-finish', patterns: [/\bbasement\s*(finish|reno|completion|convert|apartment)\b/i, /\bfinish(ed|ing)?\s*basement\b/i] },
  { tag: 'second-suite', patterns: [/\b(2nd|second)\s*suite\b/i, /\bsecondary\s*suite\b/i, /\b2nd\s*unit\b/i, /\bsecond\s*unit\b/i] },
  { tag: 'open-concept', patterns: [/\bopen\s*concept\b/i, /\bremov(e|al|ing)\s*(of\s*)?(bearing|load|interior)\s*wall\b/i] },
  { tag: 'convert-unit', patterns: [/\bconvert\b/i] },
  { tag: 'tenant-fitout', patterns: [/\btenant\b/i, /\bfit[\s-]?out\b/i, /\bleasehold\s*improv/i] },
  // Building type
  { tag: 'condo', patterns: [/\bcondo(minium)?\b/i] },
  { tag: 'apartment', patterns: [/\bapartment\b/i] },
  { tag: 'townhouse', patterns: [/\btownhouse\b/i, /\btown\s*home\b/i, /\brow\s*house\b/i] },
  { tag: 'mixed-use', patterns: [/\bmixed[\s-]?use\b/i] },
  { tag: 'retail', patterns: [/\bretail\b/i] },
  { tag: 'office', patterns: [/\boffice\b/i] },
  { tag: 'restaurant', patterns: [/\brestaurant\b/i] },
  { tag: 'warehouse', patterns: [/\bwarehouse\b/i] },
  { tag: 'school', patterns: [/\bschool\b/i] },
  { tag: 'hospital', patterns: [/\bhospital\b/i] },
  // Systems
  { tag: 'hvac', patterns: [/\bhvac\b/i, /\b(furnace|air\s*condition|heat\s*pump|duct(work)?)\b/i] },
  { tag: 'plumbing', patterns: [/\bplumbing\b/i] },
  { tag: 'electrical', patterns: [/\belectrical\b/i] },
  { tag: 'sprinkler', patterns: [/\bsprinkler\b/i] },
  { tag: 'fire-alarm', patterns: [/\bfire\s*alarm\b/i] },
  { tag: 'elevator', patterns: [/\belevator\b/i, /\blift\b/i] },
  { tag: 'drain', patterns: [/\bdrain\b/i, /\bsewer\b/i, /\bstorm\s*water\b/i] },
  { tag: 'backflow-preventer', patterns: [/\bbackflow\s*(preventer|prevent(ion)?|device)\b/i, /\bbackflow\b/i] },
  { tag: 'access-control', patterns: [/\bmaglock\b/i, /\baccess\s*control\b/i, /\bcard\s*reader\b/i, /\bsecurity\s*(lock|access)\b/i] },
  // Experimental
  { tag: 'stair', patterns: [/\bstair(s|case|way|\s*well)?\b/i, /\bstep(s)?\b/i] },
  { tag: 'window', patterns: [/\bwindow(s)?\b/i, /\bfenestration\b/i] },
  { tag: 'door', patterns: [/\bdoor(s)?\b/i] },
  { tag: 'shoring', patterns: [/\bshor(ing|e)\b/i] },
  { tag: 'demolition', patterns: [/\bdemol(ish|ition)\b/i, /\btear[\s-]?down\b/i] },
  { tag: 'station', patterns: [/\b(transit|pumping|subway|bus)\s*station\b/i, /\bstation\b/i] },
  { tag: 'storage', patterns: [/\bstorage\b/i, /\bracking\b/i, /\bsilo\b/i] },
];

// ---------------------------------------------------------------------------
// Project Type Classification
// ---------------------------------------------------------------------------

/**
 * Classify a permit's project type using a deterministic cascade:
 *   1. Check `work` field (most specific)
 *   2. Check `permit_type` field
 *   3. Fall back to `description` regex
 *   4. Default: `other`
 */
export function classifyProjectType(permit: Pick<Permit, 'work' | 'permit_type' | 'description'>): ProjectType {
  const work = (permit.work || '').trim();
  const permitType = (permit.permit_type || '').trim();
  const desc = (permit.description || '').trim().toLowerCase();

  // --- Tier 1: work field ---
  if (work === 'New Building') return 'new_build';
  if (work === 'Demolition') return 'demolition';
  if (work === 'Interior Alterations') return 'renovation';

  // Addition-like work values
  if (work === 'Addition(s)') return 'addition';
  if (/^(Deck|Porch|Garage|Pool)$/i.test(work)) return 'addition';

  // Repair-like work values
  if (/repair|fire damage|balcony\/guard/i.test(work)) return 'repair';

  // --- Tier 2: permit_type field ---
  if (/new\s*(house|building)/i.test(permitType)) return 'new_build';
  if (/demolition\s*folder/i.test(permitType)) return 'demolition';

  // Mechanical-only permits (no building work indicated)
  if (/^(Plumbing|Mechanical|Drain|Electrical)/i.test(permitType)) {
    // Only classify as mechanical if work doesn't indicate building work
    const buildingWork = /addition|alteration|new\s*building|renovation|construct/i.test(work);
    if (!buildingWork) return 'mechanical';
  }

  // --- Tier 3: description fallback (for "Multiple Projects", "Other", etc.) ---
  if (/\bnew\s*(build|construct|erect)/i.test(desc)) return 'new_build';
  if (/\bdemolish|demolition|tear\s*down/i.test(desc)) return 'demolition';
  if (/\badd(i)?tion\b/i.test(desc)) return 'addition';
  if (/\brenovati?on|interior\s*alter|remodel/i.test(desc)) return 'renovation';
  if (/\brepair\b/i.test(desc)) return 'repair';

  return 'other';
}

// ---------------------------------------------------------------------------
// Scope Tag Extraction (general — non-residential permits)
// ---------------------------------------------------------------------------

/**
 * Extract scope tags from all available permit fields.
 * Scans description, work, structure_type, and proposed_use.
 */
export function extractScopeTags(
  permit: Pick<Permit, 'description' | 'work' | 'structure_type' | 'proposed_use' | 'current_use' | 'storeys'>
): ScopeTag[] {
  // Combine all text fields for scanning
  const fields = [
    permit.description || '',
    permit.work || '',
    permit.structure_type || '',
    permit.proposed_use || '',
    permit.current_use || '',
  ].join(' ');

  const tags = new Set<ScopeTag>();

  for (const { tag, patterns } of TAG_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(fields)) {
        tags.add(tag);
        break; // One match per tag is enough
      }
    }
  }

  // Scale tags from storeys
  const storeys = permit.storeys || 0;
  if (storeys >= 10) {
    tags.add('high-rise');
  } else if (storeys >= 5) {
    tags.add('mid-rise');
  } else if (storeys >= 2) {
    tags.add('low-rise');
  }

  return Array.from(tags).sort();
}

// ---------------------------------------------------------------------------
// Residential Scope Tag Extraction (Small Residential permits)
// ---------------------------------------------------------------------------

const CARDINAL_MAP: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
};

/**
 * Check if a repair signal ("repair", "replace", etc.) appears near a keyword
 * in the description. Returns true if repair context is detected AND no
 * construction override ("new", "construct", "build") is present nearby.
 */
function hasRepairSignalNear(keyword: string, desc: string): boolean {
  const idx = desc.indexOf(keyword);
  if (idx === -1) return false;

  const windowStart = Math.max(0, idx - 60);
  const windowEnd = Math.min(desc.length, idx + keyword.length + 60);
  const window = desc.substring(windowStart, windowEnd);

  if (!/\b(repair|replace|reconstruct|refinish|restore|re-?build)\b/.test(window)) {
    return false;
  }

  // Override back to new if construction signal also present
  if (/\b(new|construct|build)\b/.test(window)) {
    return false;
  }

  return true;
}

/**
 * Extract scope tags for Small Residential permits.
 * Uses a 30-tag fixed set with work-type prefixes (new:/alter:)
 * and deduplication rules.
 */
export function extractResidentialTags(
  permit: Pick<Permit, 'description' | 'work' | 'permit_type'>
): string[] {
  const work = (permit.work || '').trim();
  const desc = (permit.description || '').trim();
  const descLower = desc.toLowerCase();

  // Party Wall Admin Permits are procedural — no scope tags
  if (work === 'Party Wall Admin Permits') return [];

  const tags = new Set<string>();

  // --- 1. Storey count extraction ---
  let storeyCount = 0;

  // Match "N storey" / "N-storey" / "N story"
  const numericStorey = descLower.match(/\b(\d+)\s*[-]?\s*(storey|story|stories)\b/);
  if (numericStorey) {
    storeyCount = parseInt(numericStorey[1], 10);
  }

  // Match cardinal words: "one storey", "two storey", etc.
  if (storeyCount === 0) {
    const cardinalStorey = descLower.match(/\b(one|two|three|four|five)\s*[-]?\s*(storey|story|stories)\b/);
    if (cardinalStorey) {
      storeyCount = CARDINAL_MAP[cardinalStorey[1]] || 0;
    }
  }

  // Match "single storey"
  if (storeyCount === 0 && /\bsingle\s*[-]?\s*(storey|story)\b/.test(descLower)) {
    storeyCount = 1;
  }

  // --- 2. Addition detection ---
  // "addition of washroom" = installing a feature (NOT structural)
  // "rear addition" / "build an addition" = structural extension (YES)
  // Explicit blacklist: "addition of [optional article] [non-structural noun]"
  // catches "addition of a washroom", "addition of new laundry", etc.
  const isAddition =
    /^Addition/i.test(work) ||
    /\badd(i)?tion\b(?!\s+(of\s+)?(a\s+)?(new\s+)?(washroom|bathroom|laundry|closet|window|door|powder|shower|fireplace|skylight)\b)/i.test(descLower);

  if (isAddition) {
    if (storeyCount >= 3) {
      tags.add('new:3-storey-addition');
    } else if (storeyCount === 2) {
      tags.add('new:2-storey-addition');
    } else {
      tags.add('new:1-storey-addition');
    }
  }

  // --- 3. Tag extraction from description + work field ---

  // Deck
  if (/\bdeck\b/i.test(descLower) || /^Deck$/i.test(work)) {
    tags.add(hasRepairSignalNear('deck', descLower) ? 'alter:deck' : 'new:deck');
  }

  // Garage
  if (/\bgarage\b/i.test(descLower) || /^Garage$/i.test(work)) {
    tags.add(hasRepairSignalNear('garage', descLower) ? 'alter:garage' : 'new:garage');
  }

  // Porch
  if (/\bporch\b/i.test(descLower) || /^Porch$/i.test(work)) {
    tags.add(hasRepairSignalNear('porch', descLower) ? 'alter:porch' : 'new:porch');
  }

  // Basement
  if (/\bbasement\b/i.test(descLower)) {
    tags.add('new:basement');
  }

  // Underpinning
  if (/\bunderpinn?ing\b/i.test(descLower)) {
    tags.add('new:underpinning');
  }

  // Walkout
  if (/\bwalk[\s-]?out\b/i.test(descLower)) {
    tags.add('new:walkout');
  }

  // Balcony
  if (/\bbalcon(y|ies)\b/i.test(descLower)) {
    tags.add('new:balcony');
  }

  // Dormer
  if (/\bdormer\b/i.test(descLower)) {
    tags.add('new:dormer');
  }

  // Second Suite — primary source is work field
  if (
    work === 'Second Suite (New)' ||
    /\b(2nd|second(ary)?)\s*(suite|unit)\b/i.test(descLower)
  ) {
    tags.add('new:second-suite');
  }

  // Kitchen
  if (/\bkitchen\b/i.test(descLower)) {
    tags.add('new:kitchen');
  }

  // Bathroom / Washroom
  if (
    /\bbath(room)?\b/i.test(descLower) ||
    /\bwashroom\b/i.test(descLower) ||
    /\bpowder\s*room\b/i.test(descLower) ||
    /\bensuite\b/i.test(descLower) ||
    /\ben-suite\b/i.test(descLower) ||
    /\blavatory\b/i.test(descLower)
  ) {
    tags.add('new:bathroom');
  }

  // Laundry
  if (/\blaundry\b/i.test(descLower)) {
    tags.add('new:laundry');
  }

  // Open Concept
  if (/\bopen\s*concept\b/i.test(descLower) || /\b(remov|load[\s-]*bearing).*wall\b/i.test(descLower)) {
    tags.add('new:open-concept');
  }

  // Structural Beam
  if (/\b(beam|lvl|steel\s*beam)\b/i.test(descLower)) {
    tags.add('new:structural-beam');
  }

  // Laneway Suite (includes garden suite and rear yard suite — all are ARUs)
  if (
    /\blaneway\b/i.test(descLower) ||
    /\bgarden\s*suite\b/i.test(descLower) ||
    /\brear\s*yard\s*suite\b/i.test(descLower) ||
    work === 'New Laneway / Rear Yard Suite'
  ) {
    tags.add('new:laneway-suite');
  }

  // Pool
  if (/\bpool\b/i.test(descLower) || /^Pool$/i.test(work)) {
    tags.add('new:pool');
  }

  // Carport
  if (/\bcarport\b/i.test(descLower)) {
    tags.add('new:carport');
  }

  // Canopy
  if (/\bcanopy\b/i.test(descLower)) {
    tags.add('new:canopy');
  }

  // Roofing
  if (/\broof(ing)?\b/i.test(descLower)) {
    tags.add('new:roofing');
  }

  // Fence
  if (/\bfenc(e|ing)\b/i.test(descLower)) {
    tags.add('new:fence');
  }

  // Foundation
  if (/\bfoundation\b/i.test(descLower)) {
    tags.add('new:foundation');
  }

  // Solar
  if (/\bsolar\b/i.test(descLower)) {
    tags.add('new:solar');
  }

  // Fireplace
  if (
    /\bfireplace\b/i.test(descLower) ||
    /\bwood\s*stove\b/i.test(descLower) ||
    work === 'Fireplace/Wood Stoves'
  ) {
    tags.add('new:fireplace');
  }

  // Accessory Building
  if (
    /\bshed\b/i.test(descLower) ||
    /\bcabana\b/i.test(descLower) ||
    /\bancillary\b/i.test(descLower) ||
    /\baccessory\s*(building|structure)\b/i.test(descLower) ||
    work === 'Accessory Building(s)' ||
    work === 'Accessory Structure'
  ) {
    tags.add('new:accessory-building');
  }

  // Experimental tags
  if (/\bstair(s|case|way|\s*well)?\b/i.test(descLower) || /\bstep(s)?\b/i.test(descLower)) tags.add('new:stair');
  if (/\bwindow(s)?\b/i.test(descLower) || /\bfenestration\b/i.test(descLower)) tags.add('new:window');
  if (/\bdoor(s)?\b/i.test(descLower)) tags.add('new:door');
  if (/\bshor(ing|e)\b/i.test(descLower)) tags.add('new:shoring');

  // Conditional Systems Tagging
  const hasArchitecture = /\b(addition|deck|garage|porch|underpinn|walkout|balcony|dormer|second suite|kitchen|bath|washroom|roof|door|window|alter|reno|basement)\b/.test(descLower);
  if (!hasArchitecture) {
    if (/\b(plumbing|plumber)\b/.test(descLower) || work === 'Plumbing') tags.add('plumbing');
    if (/\b(hvac|furnace|air condition|heat pump|duct)\b/.test(descLower) || work === 'HVAC') tags.add('hvac');
  }

  // --- alter: tags ---

  // Interior Alterations (absorbs "renovation" — no separate renovation tag)
  if (
    /\binterior\s*alter/i.test(descLower) ||
    /\brenovati?on\b/i.test(descLower) ||
    /\bremodel\b/i.test(descLower) ||
    work === 'Interior Alterations'
  ) {
    tags.add('alter:interior-alterations');
  }

  // Fire Damage
  if (
    /\bfire\s*(damage|restoration)\b/i.test(descLower) ||
    /\bvehicle\s*impact\b/i.test(descLower) ||
    work === 'Fire Damage'
  ) {
    tags.add('alter:fire-damage');
  }

  // Unit Conversion
  if (
    /\bconvert\b/i.test(descLower) ||
    /\bconversion\b/i.test(descLower) ||
    work === 'Change of Use'
  ) {
    tags.add('alter:unit-conversion');
  }

  // --- 4. Deduplication rules ---

  // Rule 1: basement + underpinning → remove basement
  if (tags.has('new:basement') && tags.has('new:underpinning')) {
    tags.delete('new:basement');
  }

  // Rule 2: basement + second-suite → remove basement
  if (tags.has('new:basement') && tags.has('new:second-suite')) {
    tags.delete('new:basement');
  }

  // Rule 3: second-suite + interior-alterations → remove interior-alterations
  if (tags.has('new:second-suite') && tags.has('alter:interior-alterations')) {
    tags.delete('alter:interior-alterations');
  }

  // Rule 4: accessory-building + garage → remove accessory-building
  if (tags.has('new:accessory-building') && (tags.has('new:garage') || tags.has('alter:garage'))) {
    tags.delete('new:accessory-building');
  }

  // Rule 5: accessory-building + pool → remove accessory-building
  if (tags.has('new:accessory-building') && tags.has('new:pool')) {
    tags.delete('new:accessory-building');
  }

  // Rule 6: unit-conversion + second-suite → remove unit-conversion
  if (tags.has('alter:unit-conversion') && tags.has('new:second-suite')) {
    tags.delete('alter:unit-conversion');
  }

  return Array.from(tags).sort();
}

// ---------------------------------------------------------------------------
// Residential Structure Gate (for Building Additions/Alterations)
// ---------------------------------------------------------------------------

/**
 * Check if a permit's structure_type/proposed_use indicates a residential building.
 * Used to route residential Building Additions/Alterations through the residential
 * tag system instead of the general extractor.
 */
export function isResidentialStructure(
  permit: Pick<Permit, 'structure_type' | 'proposed_use'>
): boolean {
  const st = (permit.structure_type || '').trim();
  const pu = (permit.proposed_use || '').trim();

  if (/^SFD\b/i.test(st)) return true;
  if (/\b(Detached|Semi|Townhouse|Row\s*House|Stacked)\b/i.test(st)) return true;
  if (/\b(residential|dwelling|house|duplex|triplex)\b/i.test(pu)) return true;

  return false;
}

// ---------------------------------------------------------------------------
// New Houses Scope Tag Extraction
// ---------------------------------------------------------------------------

/**
 * Extract scope tags for New Houses permits.
 * Returns exactly one building type tag (new:sfd, new:houseplex-N-unit, etc.)
 * plus zero or more feature tags (new:garage, new:deck, etc.).
 */
export function extractNewHouseTags(
  permit: Pick<Permit, 'description' | 'work' | 'structure_type' | 'proposed_use' | 'housing_units'>
): string[] {
  const desc = (permit.description || '').trim();
  const descLower = desc.toLowerCase();
  const st = (permit.structure_type || '').trim();
  const pu = (permit.proposed_use || '').trim();
  const housingUnits = permit.housing_units || 0;

  const tags = new Set<string>();

  // --- Building type classification cascade (first match wins) ---
  let buildingTypeSet = false;

  // 1. proposed_use contains "houseplex" → extract unit count
  if (/houseplex/i.test(pu)) {
    const unitMatch = pu.match(/\((\d+)\s*Units?\)/i);
    let units = unitMatch ? parseInt(unitMatch[1], 10) : (housingUnits > 1 ? housingUnits : 3);
    units = Math.max(2, Math.min(6, units));
    tags.add(`new:houseplex-${units}-unit`);
    buildingTypeSet = true;
  }

  // 2. structure_type matches "3+ Unit" style → use housing_units for count
  if (!buildingTypeSet && /3\+\s*Unit/i.test(st)) {
    let units = housingUnits > 1 ? housingUnits : 3;
    units = Math.max(2, Math.min(6, units));
    tags.add(`new:houseplex-${units}-unit`);
    buildingTypeSet = true;
  }

  // 3. housing_units > 1 + description mentions "houseplex"
  if (!buildingTypeSet && housingUnits > 1 && /houseplex/i.test(descLower)) {
    const units = Math.max(2, Math.min(6, housingUnits));
    tags.add(`new:houseplex-${units}-unit`);
    buildingTypeSet = true;
  }

  // 4. structure_type contains "stacked" → stacked-townhouse
  if (!buildingTypeSet && /stacked/i.test(st)) {
    tags.add('new:stacked-townhouse');
    buildingTypeSet = true;
  }

  // 5. structure_type contains "townhouse" or "row house" → townhouse
  if (!buildingTypeSet && /townhouse|row\s*house/i.test(st)) {
    tags.add('new:townhouse');
    buildingTypeSet = true;
  }

  // 6. structure_type contains "semi" → semi-detached
  if (!buildingTypeSet && /semi/i.test(st)) {
    tags.add('new:semi-detached');
    buildingTypeSet = true;
  }

  // 7. Default → sfd
  if (!buildingTypeSet) {
    tags.add('new:sfd');
  }

  // --- Feature tags ---
  if (/\bgarage\b/i.test(descLower)) tags.add('new:garage');
  if (/\bdeck\b/i.test(descLower)) tags.add('new:deck');
  if (/\bporch\b/i.test(descLower)) tags.add('new:porch');
  if (/\bwalk[\s-]?out\b/i.test(descLower)) tags.add('new:walkout');
  if (/\bbalcon(y|ies)\b/i.test(descLower)) tags.add('new:balcony');
  if (/\blaneway\b/i.test(descLower) || /\bgarden\s*suite\b/i.test(descLower) || /\brear\s*yard\s*suite\b/i.test(descLower)) {
    tags.add('new:laneway-suite');
  }
  if (/\bfinish(ed)?\s*basement\b/i.test(descLower)) tags.add('new:finished-basement');

  return Array.from(tags).sort();
}

// ---------------------------------------------------------------------------
// Display Helpers
// ---------------------------------------------------------------------------

export const PROJECT_TYPE_CONFIG: Record<ProjectType, { label: string; color: string }> = {
  new_build: { label: 'New Build', color: '#16A34A' },
  addition: { label: 'Addition', color: '#2563EB' },
  renovation: { label: 'Renovation', color: '#9333EA' },
  demolition: { label: 'Demolition', color: '#DC2626' },
  mechanical: { label: 'Mechanical', color: '#0891B2' },
  repair: { label: 'Repair', color: '#EA580C' },
  other: { label: 'Other', color: '#6B7280' },
};

/** Display config for use-type tags (universal tier — blue #2563EB). */
export const USE_TYPE_TAG_CONFIG: Record<string, { label: string; color: string }> = {
  'residential': { label: 'Residential', color: '#2563EB' },
  'commercial': { label: 'Commercial', color: '#2563EB' },
  'mixed-use': { label: 'Mixed Use', color: '#2563EB' },
};

/** Display config for New Houses building type + feature tags. */
export const NEW_HOUSE_TAG_CONFIG: Record<string, { label: string; color: string }> = {
  // Building type tags — emerald (#059669)
  'new:sfd': { label: 'Single Family Detached', color: '#059669' },
  'new:semi-detached': { label: 'Semi-Detached', color: '#059669' },
  'new:townhouse': { label: 'Townhouse', color: '#059669' },
  'new:stacked-townhouse': { label: 'Stacked Townhouse', color: '#059669' },
  'new:houseplex-2-unit': { label: 'Houseplex 2 Units', color: '#059669' },
  'new:houseplex-3-unit': { label: 'Houseplex 3 Units', color: '#059669' },
  'new:houseplex-4-unit': { label: 'Houseplex 4 Units', color: '#059669' },
  'new:houseplex-5-unit': { label: 'Houseplex 5 Units', color: '#059669' },
  'new:houseplex-6-unit': { label: 'Houseplex 6 Units', color: '#059669' },
  // Feature tags — standard green (#16A34A), same slugs as SRP
  'new:finished-basement': { label: 'Finished Basement', color: '#16A34A' },
};

/** Display config for the 30 residential scope tags. */
export const RESIDENTIAL_TAG_CONFIG: Record<string, { label: string; color: string }> = {
  // new: tags — green
  'new:1-storey-addition': { label: '1 Storey Addition', color: '#16A34A' },
  'new:2-storey-addition': { label: '2 Storey Addition', color: '#16A34A' },
  'new:3-storey-addition': { label: '3 Storey Addition', color: '#16A34A' },
  'new:deck': { label: 'Deck', color: '#16A34A' },
  'new:garage': { label: 'Garage', color: '#16A34A' },
  'new:porch': { label: 'Porch', color: '#16A34A' },
  'new:basement': { label: 'Basement', color: '#16A34A' },
  'new:underpinning': { label: 'Underpinning', color: '#16A34A' },
  'new:walkout': { label: 'Walkout', color: '#16A34A' },
  'new:balcony': { label: 'Balcony', color: '#16A34A' },
  'new:dormer': { label: 'Dormer', color: '#16A34A' },
  'new:second-suite': { label: 'Second Suite', color: '#16A34A' },
  'new:kitchen': { label: 'Kitchen', color: '#16A34A' },
  'new:open-concept': { label: 'Open Concept', color: '#16A34A' },
  'new:structural-beam': { label: 'Structural Beam', color: '#16A34A' },
  'new:laneway-suite': { label: 'Laneway Suite', color: '#16A34A' },
  'new:pool': { label: 'Pool', color: '#16A34A' },
  'new:carport': { label: 'Carport', color: '#16A34A' },
  'new:canopy': { label: 'Canopy', color: '#16A34A' },
  'new:roofing': { label: 'Roofing', color: '#16A34A' },
  'new:fence': { label: 'Fence', color: '#16A34A' },
  'new:foundation': { label: 'Foundation', color: '#16A34A' },
  'new:solar': { label: 'Solar', color: '#16A34A' },
  'new:bathroom': { label: 'Bathroom', color: '#16A34A' },
  'new:laundry': { label: 'Laundry', color: '#16A34A' },
  'new:fireplace': { label: 'Fireplace', color: '#16A34A' },
  'new:accessory-building': { label: 'Accessory Building', color: '#16A34A' },
  // alter: tags — orange
  'alter:interior-alterations': { label: 'Interior Alterations', color: '#EA580C' },
  'alter:fire-damage': { label: 'Fire Damage', color: '#EA580C' },
  'alter:deck': { label: 'Deck (Repair)', color: '#EA580C' },
  'alter:porch': { label: 'Porch (Repair)', color: '#EA580C' },
  'alter:garage': { label: 'Garage (Repair)', color: '#EA580C' },
  'alter:unit-conversion': { label: 'Unit Conversion', color: '#EA580C' },
};

/**
 * Parse a prefixed tag into its work type and slug.
 * e.g. "new:deck" → { work_type: "new", slug: "deck" }
 *      "alter:fire-damage" → { work_type: "alter", slug: "fire-damage" }
 *      "basement" → { work_type: "new", slug: "basement" } (unprefixed fallback)
 */
export function parseTagPrefix(tag: string): { work_type: WorkType; slug: string } {
  if (tag.startsWith('new:')) {
    return { work_type: 'new', slug: tag.slice(4) };
  }
  if (tag.startsWith('alter:')) {
    return { work_type: 'alter', slug: tag.slice(6) };
  }
  return { work_type: 'new', slug: tag };
}

/**
 * Convert a scope tag slug to a human-readable label.
 * Handles both prefixed residential tags and plain tags.
 */
export function formatScopeTag(tag: string, storeys?: number): string {
  // Check use-type config first (universal tier)
  const useType = USE_TYPE_TAG_CONFIG[tag];
  if (useType) return useType.label;

  // Check New House config (emerald building type tags)
  const newHouse = NEW_HOUSE_TAG_CONFIG[tag];
  if (newHouse) {
    // For houseplex tags, append storey info if available
    if (tag.startsWith('new:houseplex-') && storeys && storeys > 0) {
      return `${newHouse.label} · ${storeys} Storey${storeys > 1 ? 's' : ''}`;
    }
    return newHouse.label;
  }

  // Check residential config
  const residential = RESIDENTIAL_TAG_CONFIG[tag];
  if (residential) return residential.label;

  // Strip prefix if present, then format
  const { slug } = parseTagPrefix(tag);
  return slug
    .split('-')
    .map((word) => {
      if (/^\d/.test(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

/**
 * Get the display color for a scope tag.
 * Green (#16A34A) for new:, orange (#EA580C) for alter:, gray for unprefixed.
 */
export function getScopeTagColor(tag: string): string {
  const useType = USE_TYPE_TAG_CONFIG[tag];
  if (useType) return useType.color;

  const newHouse = NEW_HOUSE_TAG_CONFIG[tag];
  if (newHouse) return newHouse.color;

  const residential = RESIDENTIAL_TAG_CONFIG[tag];
  if (residential) return residential.color;

  const { work_type } = parseTagPrefix(tag);
  if (work_type === 'alter') return '#EA580C';
  if (work_type === 'new' && tag.includes(':')) return '#16A34A';
  return '#6B7280';
}

// ---------------------------------------------------------------------------
// Base Permit Number Extraction (for BLD→companion propagation)
// ---------------------------------------------------------------------------

/**
 * Extract the base permit number (project identifier) from a full permit_num.
 * Toronto permits share a base number across BLD/PLB/HVA/DRN/DEM/etc.
 *
 * "21 123456 BLD 00" → "21 123456"
 * "21 123456 PLB 00" → "21 123456"
 * "24 101234"         → "24 101234" (no code — already the base)
 */
export function extractBasePermitNum(permitNum: string): string {
  const parts = permitNum.trim().split(/\s+/);
  return parts.slice(0, 2).join(' ');
}

/**
 * Check if a permit_num contains a BLD code.
 * "21 123456 BLD 00" → true
 * "21 123456 PLB 00" → false
 */
export function isBLDPermit(permitNum: string): boolean {
  return /\sBLD(\s|$)/.test(permitNum.trim());
}

// ---------------------------------------------------------------------------
// Use-Type Classification (universal — every permit gets exactly one)
// ---------------------------------------------------------------------------

export type UseType = 'residential' | 'commercial' | 'mixed-use';

/**
 * Classify a permit's primary use-type from permit_type, structure_type,
 * and proposed_use fields. Every permit receives exactly one use-type tag.
 *
 * - `residential` — Small Residential, New Houses, residential structure types
 * - `commercial` — Non-Residential, commercial/industrial structure types
 * - `mixed-use` — signals of both residential AND commercial
 *
 * Default: `commercial` (non-residential permits without clear residential signal)
 */
export function classifyUseType(
  permit: Pick<Permit, 'permit_type' | 'structure_type' | 'proposed_use'>
): UseType {
  const pt = (permit.permit_type || '').trim();
  const st = (permit.structure_type || '').trim();
  const pu = (permit.proposed_use || '').trim();

  const hasResidentialSignal =
    /^(Small Residential|New House|Residential)/i.test(pt) ||
    /\b(SFD|Detached|Semi|Townhouse|Row\s*House|Stacked|Duplex|Triplex)\b/i.test(st) ||
    /\b(residential|dwelling|house|duplex|triplex|apartment)\b/i.test(pu);

  const hasCommercialSignal =
    /^Non-Residential/i.test(pt) ||
    /\b(commercial|industrial|mercantile)\b/i.test(st) ||
    /\b(commercial|industrial|retail|office|mercantile|warehouse)\b/i.test(pu);

  if (hasResidentialSignal && hasCommercialSignal) return 'mixed-use';
  if (hasResidentialSignal) return 'residential';
  return 'commercial';
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

/**
 * Classify a permit's scope: project type + scope tags + use-type.
 *
 * Branching:
 *   Small Residential              → extractResidentialTags()
 *   New House*                     → extractNewHouseTags()
 *   Building Additions/Alterations
 *     + isResidentialStructure()   → extractResidentialTags()
 *   Everything else                → extractScopeTags()
 *
 * Use-type (residential/commercial/mixed-use) is applied universally
 * as a separate tier on every permit.
 */
export function classifyScope(permit: Permit): ScopeResult {
  const permitType = (permit.permit_type || '').trim();

  let scope_tags: string[];

  if (permitType.startsWith('Small Residential')) {
    scope_tags = extractResidentialTags(permit);
  } else if (permitType.startsWith('New House')) {
    scope_tags = extractNewHouseTags(permit);
  } else if (permitType.startsWith('Building Additions') && isResidentialStructure(permit)) {
    scope_tags = extractResidentialTags(permit);
  } else {
    scope_tags = extractScopeTags(permit);
  }

  // Demolition tier — all DM permits get a demolition tag
  const project_type = classifyProjectType(permit);
  const isDemolitionPermit = project_type === 'demolition' ||
    /demolition\s*folder/i.test(permitType);
  if (isDemolitionPermit && !scope_tags.includes('demolition')) {
    scope_tags.push('demolition');
  }

  // Universal use-type tier — every permit gets exactly one
  const useType = classifyUseType(permit);
  if (!scope_tags.includes(useType)) {
    scope_tags.push(useType);
    scope_tags.sort();
  }

  return {
    project_type,
    scope_tags,
  };
}
