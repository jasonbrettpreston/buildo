#!/usr/bin/env node
/**
 * Batch classify all permits by project scope (project_type + scope_tags).
 *
 * Processes permits in batches of 1000, applying the deterministic
 * classification cascade from src/lib/classification/scope.ts.
 * Re-runnable — overwrites previous classifications.
 *
 * For Small Residential permits, uses the 30-tag residential system
 * with work-type prefixes (new:/alter:) and deduplication rules.
 * For all other permits, uses the general tag extraction.
 *
 * Usage:
 *   node scripts/classify-scope.js
 */
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  database: process.env.PG_DATABASE || 'buildo',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'postgres',
});

const BATCH_SIZE = 1000;

// ---------------------------------------------------------------------------
// Inline classification logic (mirrors src/lib/classification/scope.ts)
// ---------------------------------------------------------------------------

function classifyProjectType(permit) {
  const work = (permit.work || '').trim();
  const permitType = (permit.permit_type || '').trim();
  const desc = (permit.description || '').trim().toLowerCase();

  if (work === 'New Building') return 'new_build';
  if (work === 'Demolition') return 'demolition';
  if (work === 'Interior Alterations') return 'renovation';
  if (work === 'Addition(s)') return 'addition';
  if (/^(Deck|Porch|Garage|Pool)$/i.test(work)) return 'addition';
  if (/repair|fire damage|balcony\/guard/i.test(work)) return 'repair';

  if (/new\s*(house|building)/i.test(permitType)) return 'new_build';
  if (/demolition\s*folder/i.test(permitType)) return 'demolition';

  if (/^(Plumbing|Mechanical|Drain|Electrical)/i.test(permitType)) {
    const buildingWork = /addition|alteration|new\s*building|renovation|construct/i.test(work);
    if (!buildingWork) return 'mechanical';
  }

  if (/\bnew\s*(build|construct|erect)/i.test(desc)) return 'new_build';
  if (/\bdemolish|demolition|tear\s*down/i.test(desc)) return 'demolition';
  if (/\badd(i)?tion\b/i.test(desc)) return 'addition';
  if (/\brenovati?on|interior\s*alter|remodel/i.test(desc)) return 'renovation';
  if (/\brepair\b/i.test(desc)) return 'repair';

  return 'other';
}

// ---------------------------------------------------------------------------
// General scope tags (non-residential)
// ---------------------------------------------------------------------------

const TAG_PATTERNS = [
  { tag: '2nd-floor',       patterns: [/\b2nd\s*(floor|storey|flr)\b/i, /\bsecond\s*(floor|storey|flr)\b/i] },
  { tag: '3rd-floor',       patterns: [/\b3rd\s*(floor|storey|flr)\b/i, /\bthird\s*(floor|storey|flr)\b/i] },
  { tag: 'rear-addition',   patterns: [/\brear\s*(addition|ext(ension)?)\b/i] },
  { tag: 'side-addition',   patterns: [/\bside\s*(addition|ext(ension)?)\b/i] },
  { tag: 'front-addition',  patterns: [/\bfront\s*(addition|ext(ension)?)\b/i] },
  { tag: 'storey-addition', patterns: [/\b(storey|story)\s*addition\b/i, /\badd(ition)?\s*(a|one|1|two|2|three|3)?\s*(storey|story|stories)\b/i] },
  { tag: 'basement',        patterns: [/\bbasement\b/i] },
  { tag: 'underpinning',    patterns: [/\bunderpinn?ing\b/i] },
  { tag: 'foundation',      patterns: [/\bfoundation\b/i] },
  { tag: 'deck',            patterns: [/\bdeck\b/i] },
  { tag: 'porch',           patterns: [/\bporch\b/i] },
  { tag: 'garage',          patterns: [/\bgarage\b/i] },
  { tag: 'carport',         patterns: [/\bcarport\b/i] },
  { tag: 'canopy',          patterns: [/\bcanopy\b/i] },
  { tag: 'walkout',         patterns: [/\bwalk[\s-]?out\b/i] },
  { tag: 'balcony',         patterns: [/\bbalcon(y|ies)\b/i] },
  { tag: 'laneway-suite',   patterns: [/\blaneway\s*(suite|house)\b/i, /\blaneway\b/i] },
  { tag: 'pool',            patterns: [/\bpool\b/i] },
  { tag: 'fence',           patterns: [/\bfenc(e|ing)\b/i] },
  { tag: 'roofing',         patterns: [/\broof(ing)?\b/i, /\bre-?roof\b/i] },
  { tag: 'kitchen',         patterns: [/\bkitchen\b/i] },
  { tag: 'bathroom',        patterns: [/\bbath(room)?\b/i, /\bwashroom\b/i] },
  { tag: 'basement-finish', patterns: [/\bbasement\s*(finish|reno|completion|convert|apartment)\b/i, /\bfinish(ed|ing)?\s*basement\b/i] },
  { tag: 'second-suite',    patterns: [/\b(2nd|second)\s*suite\b/i, /\bsecondary\s*suite\b/i, /\b2nd\s*unit\b/i, /\bsecond\s*unit\b/i] },
  { tag: 'open-concept',    patterns: [/\bopen\s*concept\b/i, /\bremov(e|al|ing)\s*(of\s*)?(bearing|load|interior)\s*wall\b/i] },
  { tag: 'convert-unit',    patterns: [/\bconvert\b/i] },
  { tag: 'tenant-fitout',  patterns: [/\btenant\b/i, /\bfit[\s-]?out\b/i, /\bleasehold\s*improv/i] },
  { tag: 'condo',           patterns: [/\bcondo(minium)?\b/i] },
  { tag: 'apartment',       patterns: [/\bapartment\b/i] },
  { tag: 'townhouse',       patterns: [/\btownhouse\b/i, /\btown\s*home\b/i, /\brow\s*house\b/i] },
  { tag: 'mixed-use',       patterns: [/\bmixed[\s-]?use\b/i] },
  { tag: 'retail',          patterns: [/\bretail\b/i] },
  { tag: 'office',          patterns: [/\boffice\b/i] },
  { tag: 'restaurant',      patterns: [/\brestaurant\b/i] },
  { tag: 'warehouse',       patterns: [/\bwarehouse\b/i] },
  { tag: 'school',          patterns: [/\bschool\b/i] },
  { tag: 'hospital',        patterns: [/\bhospital\b/i] },
  { tag: 'hvac',            patterns: [/\bhvac\b/i, /\b(furnace|air\s*condition|heat\s*pump|duct(work)?)\b/i] },
  { tag: 'plumbing',        patterns: [/\bplumbing\b/i] },
  { tag: 'electrical',      patterns: [/\belectrical\b/i] },
  { tag: 'sprinkler',       patterns: [/\bsprinkler\b/i] },
  { tag: 'fire-alarm',      patterns: [/\bfire\s*alarm\b/i] },
  { tag: 'elevator',        patterns: [/\belevator\b/i, /\blift\b/i] },
  { tag: 'drain',           patterns: [/\bdrain\b/i, /\bsewer\b/i, /\bstorm\s*water\b/i] },
  { tag: 'backflow-preventer', patterns: [/\bbackflow\s*(preventer|prevent(ion)?|device)\b/i, /\bbackflow\b/i] },
  { tag: 'access-control',  patterns: [/\bmaglock\b/i, /\baccess\s*control\b/i, /\bcard\s*reader\b/i, /\bsecurity\s*(lock|access)\b/i] },
  { tag: 'station',         patterns: [/\b(transit|pumping|subway|bus)\s*station\b/i, /\bstation\b/i] },
  { tag: 'storage',         patterns: [/\bstorage\b/i, /\bracking\b/i, /\bsilo\b/i] },
];

function extractScopeTags(permit) {
  const fields = [
    permit.description || '',
    permit.work || '',
    permit.structure_type || '',
    permit.proposed_use || '',
    permit.current_use || '',
  ].join(' ');

  const tags = new Set();

  for (const { tag, patterns } of TAG_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(fields)) {
        tags.add(tag);
        break;
      }
    }
  }

  const storeys = parseInt(permit.storeys) || 0;
  if (storeys >= 10) tags.add('high-rise');
  else if (storeys >= 5) tags.add('mid-rise');
  else if (storeys >= 2) tags.add('low-rise');

  return Array.from(tags).sort();
}

// ---------------------------------------------------------------------------
// Residential scope tags (Small Residential permits)
// ---------------------------------------------------------------------------

const CARDINAL_MAP = { one: 1, two: 2, three: 3, four: 4, five: 5 };

function hasRepairSignalNear(keyword, desc) {
  const idx = desc.indexOf(keyword);
  if (idx === -1) return false;

  const windowStart = Math.max(0, idx - 60);
  const windowEnd = Math.min(desc.length, idx + keyword.length + 60);
  const window = desc.substring(windowStart, windowEnd);

  if (!/\b(repair|replace|reconstruct|refinish|restore|re-?build)\b/.test(window)) {
    return false;
  }
  if (/\b(new|construct|build)\b/.test(window)) {
    return false;
  }
  return true;
}

function extractResidentialTags(permit) {
  const work = (permit.work || '').trim();
  const desc = (permit.description || '').trim();
  const descLower = desc.toLowerCase();

  if (work === 'Party Wall Admin Permits') return [];

  const tags = new Set();

  // --- Storey count extraction ---
  let storeyCount = 0;

  const numericStorey = descLower.match(/\b(\d+)\s*[-]?\s*(storey|story|stories)\b/);
  if (numericStorey) {
    storeyCount = parseInt(numericStorey[1], 10);
  }

  if (storeyCount === 0) {
    const cardinalStorey = descLower.match(/\b(one|two|three|four|five)\s*[-]?\s*(storey|story|stories)\b/);
    if (cardinalStorey) {
      storeyCount = CARDINAL_MAP[cardinalStorey[1]] || 0;
    }
  }

  if (storeyCount === 0 && /\bsingle\s*[-]?\s*(storey|story)\b/.test(descLower)) {
    storeyCount = 1;
  }

  // --- Addition detection ---
  // "addition of washroom" = installing a feature (NOT structural)
  // "rear addition" / "build an addition" = structural extension (YES)
  const isAddition = /^Addition/i.test(work) || /\badd(i)?tion\b(?!\s+(of\s+)?(a\s+)?(new\s+)?(washroom|bathroom|laundry|closet|window|door|powder|shower|fireplace|skylight)\b)/i.test(descLower);

  if (isAddition) {
    if (storeyCount >= 3) tags.add('new:3-storey-addition');
    else if (storeyCount === 2) tags.add('new:2-storey-addition');
    else tags.add('new:1-storey-addition');
  }

  // --- Tag extraction ---
  if (/\bdeck\b/i.test(descLower) || /^Deck$/i.test(work)) {
    tags.add(hasRepairSignalNear('deck', descLower) ? 'alter:deck' : 'new:deck');
  }
  if (/\bgarage\b/i.test(descLower) || /^Garage$/i.test(work)) {
    tags.add(hasRepairSignalNear('garage', descLower) ? 'alter:garage' : 'new:garage');
  }
  if (/\bporch\b/i.test(descLower) || /^Porch$/i.test(work)) {
    tags.add(hasRepairSignalNear('porch', descLower) ? 'alter:porch' : 'new:porch');
  }
  if (/\bbasement\b/i.test(descLower)) tags.add('new:basement');
  if (/\bunderpinn?ing\b/i.test(descLower)) tags.add('new:underpinning');
  if (/\bwalk[\s-]?out\b/i.test(descLower)) tags.add('new:walkout');
  if (/\bbalcon(y|ies)\b/i.test(descLower)) tags.add('new:balcony');
  if (/\bdormer\b/i.test(descLower)) tags.add('new:dormer');

  if (work === 'Second Suite (New)' || /\b(2nd|second(ary)?)\s*(suite|unit)\b/i.test(descLower)) {
    tags.add('new:second-suite');
  }

  if (/\bkitchen\b/i.test(descLower)) tags.add('new:kitchen');
  if (/\bbath(room)?\b/i.test(descLower) || /\bwashroom\b/i.test(descLower) || /\bpowder\s*room\b/i.test(descLower) || /\bensuite\b/i.test(descLower) || /\ben-suite\b/i.test(descLower) || /\blavatory\b/i.test(descLower)) tags.add('new:bathroom');
  if (/\blaundry\b/i.test(descLower)) tags.add('new:laundry');
  if (/\bopen\s*concept\b/i.test(descLower) || /\b(remov|load[\s-]*bearing).*wall\b/i.test(descLower)) {
    tags.add('new:open-concept');
  }
  if (/\b(beam|lvl|steel\s*beam)\b/i.test(descLower)) tags.add('new:structural-beam');
  if (/\blaneway\b/i.test(descLower) || /\bgarden\s*suite\b/i.test(descLower) || /\brear\s*yard\s*suite\b/i.test(descLower) || work === 'New Laneway / Rear Yard Suite') tags.add('new:laneway-suite');
  if (/\bpool\b/i.test(descLower) || /^Pool$/i.test(work)) tags.add('new:pool');
  if (/\bcarport\b/i.test(descLower)) tags.add('new:carport');
  if (/\bcanopy\b/i.test(descLower)) tags.add('new:canopy');
  if (/\broof(ing)?\b/i.test(descLower)) tags.add('new:roofing');
  if (/\bfenc(e|ing)\b/i.test(descLower)) tags.add('new:fence');
  if (/\bfoundation\b/i.test(descLower)) tags.add('new:foundation');
  if (/\bsolar\b/i.test(descLower)) tags.add('new:solar');
  if (/\bfireplace\b/i.test(descLower) || /\bwood\s*stove\b/i.test(descLower) || work === 'Fireplace/Wood Stoves') tags.add('new:fireplace');

  if (
    /\bshed\b/i.test(descLower) || /\bcabana\b/i.test(descLower) ||
    /\bancillary\b/i.test(descLower) || /\baccessory\s*(building|structure)\b/i.test(descLower) ||
    work === 'Accessory Building(s)' || work === 'Accessory Structure'
  ) {
    tags.add('new:accessory-building');
  }

  // alter: tags
  if (/\binterior\s*alter/i.test(descLower) || /\brenovati?on\b/i.test(descLower) ||
      /\bremodel\b/i.test(descLower) || work === 'Interior Alterations') {
    tags.add('alter:interior-alterations');
  }
  if (/\bfire\s*(damage|restoration)\b/i.test(descLower) ||
      /\bvehicle\s*impact\b/i.test(descLower) || work === 'Fire Damage') {
    tags.add('alter:fire-damage');
  }
  if (/\bconvert\b/i.test(descLower) || /\bconversion\b/i.test(descLower) || work === 'Change of Use') {
    tags.add('alter:unit-conversion');
  }

  // --- Deduplication rules ---
  if (tags.has('new:basement') && tags.has('new:underpinning')) tags.delete('new:basement');
  if (tags.has('new:basement') && tags.has('new:second-suite')) tags.delete('new:basement');
  if (tags.has('new:second-suite') && tags.has('alter:interior-alterations')) tags.delete('alter:interior-alterations');
  if (tags.has('new:accessory-building') && (tags.has('new:garage') || tags.has('alter:garage'))) tags.delete('new:accessory-building');
  if (tags.has('new:accessory-building') && tags.has('new:pool')) tags.delete('new:accessory-building');
  if (tags.has('alter:unit-conversion') && tags.has('new:second-suite')) tags.delete('alter:unit-conversion');

  return Array.from(tags).sort();
}

function isResidentialStructure(permit) {
  const st = (permit.structure_type || '').trim();
  const pu = (permit.proposed_use || '').trim();
  if (/^SFD\b/i.test(st)) return true;
  if (/\b(Detached|Semi|Townhouse|Row\s*House|Stacked)\b/i.test(st)) return true;
  if (/\b(residential|dwelling|house|duplex|triplex)\b/i.test(pu)) return true;
  return false;
}

function extractNewHouseTags(permit) {
  const desc = (permit.description || '').trim();
  const descLower = desc.toLowerCase();
  const st = (permit.structure_type || '').trim();
  const pu = (permit.proposed_use || '').trim();
  const housingUnits = parseInt(permit.housing_units) || 0;

  const tags = new Set();
  let buildingTypeSet = false;

  // 1. proposed_use contains "houseplex"
  if (/houseplex/i.test(pu)) {
    const unitMatch = pu.match(/\((\d+)\s*Units?\)/i);
    let units = unitMatch ? parseInt(unitMatch[1], 10) : (housingUnits > 1 ? housingUnits : 3);
    units = Math.max(2, Math.min(6, units));
    tags.add(`new:houseplex-${units}-unit`);
    buildingTypeSet = true;
  }
  // 2. structure_type "3+ Unit"
  if (!buildingTypeSet && /3\+\s*Unit/i.test(st)) {
    let units = housingUnits > 1 ? housingUnits : 3;
    units = Math.max(2, Math.min(6, units));
    tags.add(`new:houseplex-${units}-unit`);
    buildingTypeSet = true;
  }
  // 3. housing_units > 1 + description "houseplex"
  if (!buildingTypeSet && housingUnits > 1 && /houseplex/i.test(descLower)) {
    const units = Math.max(2, Math.min(6, housingUnits));
    tags.add(`new:houseplex-${units}-unit`);
    buildingTypeSet = true;
  }
  // 4. stacked
  if (!buildingTypeSet && /stacked/i.test(st)) {
    tags.add('new:stacked-townhouse');
    buildingTypeSet = true;
  }
  // 5. townhouse / row house
  if (!buildingTypeSet && /townhouse|row\s*house/i.test(st)) {
    tags.add('new:townhouse');
    buildingTypeSet = true;
  }
  // 6. semi
  if (!buildingTypeSet && /semi/i.test(st)) {
    tags.add('new:semi-detached');
    buildingTypeSet = true;
  }
  // 7. default SFD
  if (!buildingTypeSet) {
    tags.add('new:sfd');
  }

  // Feature tags
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

function classifyUseType(permit) {
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

function classifyScopeTags(permit) {
  const permitType = (permit.permit_type || '').trim();
  if (permitType.startsWith('Small Residential')) {
    return extractResidentialTags(permit);
  }
  if (permitType.startsWith('New House')) {
    return extractNewHouseTags(permit);
  }
  if (permitType.startsWith('Building Additions') && isResidentialStructure(permit)) {
    return extractResidentialTags(permit);
  }
  return extractScopeTags(permit);
}

// ---------------------------------------------------------------------------
// BLD→companion scope propagation helpers
// ---------------------------------------------------------------------------

function isBLDPermit(permitNum) {
  return /\sBLD(\s|$)/.test(permitNum.trim());
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== Buildo Permit Scope Classifier ===');
  console.log('');

  const startTime = Date.now();

  // Get total count
  const countResult = await pool.query('SELECT COUNT(*) as total FROM permits');
  const total = parseInt(countResult.rows[0].total, 10);
  console.log(`Total permits: ${total.toLocaleString()}`);
  console.log(`Batch size:    ${BATCH_SIZE}`);
  console.log('');

  // Track distribution
  const typeCounts = {};
  const tagCounts = {};
  let processed = 0;
  let withTags = 0;

  // Process in batches using cursor-style pagination
  let lastKey = null;

  while (true) {
    let batchQuery;
    let batchParams;

    if (lastKey === null) {
      batchQuery = `
        SELECT permit_num, revision_num, permit_type, structure_type, work,
               description, current_use, proposed_use, storeys,
               housing_units, dwelling_units_created
        FROM permits
        ORDER BY permit_num, revision_num
        LIMIT $1
      `;
      batchParams = [BATCH_SIZE];
    } else {
      batchQuery = `
        SELECT permit_num, revision_num, permit_type, structure_type, work,
               description, current_use, proposed_use, storeys,
               housing_units, dwelling_units_created
        FROM permits
        WHERE (permit_num, revision_num) > ($1, $2)
        ORDER BY permit_num, revision_num
        LIMIT $3
      `;
      batchParams = [lastKey.permit_num, lastKey.revision_num, BATCH_SIZE];
    }

    const { rows } = await pool.query(batchQuery, batchParams);
    if (rows.length === 0) break;

    // Classify each permit in the batch
    const updates = rows.map((permit) => {
      const projectType = classifyProjectType(permit);
      const scopeTags = classifyScopeTags(permit);

      // Demolition tier — all DM permits get a demolition tag
      const isDemolitionPermit = projectType === 'demolition' ||
        /demolition\s*folder/i.test(permit.permit_type || '');
      if (isDemolitionPermit && !scopeTags.includes('demolition')) {
        scopeTags.push('demolition');
      }

      const useType = classifyUseType(permit);
      if (!scopeTags.includes(useType)) {
        scopeTags.push(useType);
        scopeTags.sort();
      }

      typeCounts[projectType] = (typeCounts[projectType] || 0) + 1;
      if (scopeTags.length > 0) withTags++;
      for (const tag of scopeTags) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }

      return { permit_num: permit.permit_num, revision_num: permit.revision_num, projectType, scopeTags };
    });

    // Batch update using a single query with unnest
    const permitNums = updates.map((u) => u.permit_num);
    const revisionNums = updates.map((u) => u.revision_num);
    const projectTypes = updates.map((u) => u.projectType);
    const scopeTagArrays = updates.map((u) => `{${u.scopeTags.join(',')}}`);

    await pool.query(
      `UPDATE permits AS p SET
         project_type = v.project_type,
         scope_tags = v.scope_tags::TEXT[],
         scope_classified_at = NOW(),
         scope_source = 'classified'
       FROM (
         SELECT unnest($1::TEXT[]) AS permit_num,
                unnest($2::TEXT[]) AS revision_num,
                unnest($3::TEXT[]) AS project_type,
                unnest($4::TEXT[]) AS scope_tags
       ) AS v
       WHERE p.permit_num = v.permit_num AND p.revision_num = v.revision_num`,
      [permitNums, revisionNums, projectTypes, scopeTagArrays]
    );

    processed += rows.length;
    lastKey = rows[rows.length - 1];

    if (processed % 10000 < BATCH_SIZE) {
      const pct = ((processed / total) * 100).toFixed(1);
      console.log(`  Processed ${processed.toLocaleString()} / ${total.toLocaleString()} (${pct}%)`);
    }
  }

  // ----- Propagation pass: copy BLD scope_tags to companion permits -----
  console.log('');
  console.log('--- BLD→Companion Scope Propagation ---');

  const propagateResult = await pool.query(
    `UPDATE permits AS companion
     SET
       scope_tags = bld.scope_tags,
       project_type = bld.project_type,
       scope_classified_at = NOW(),
       scope_source = 'propagated'
     FROM (
       SELECT
         TRIM(SPLIT_PART(permit_num, ' ', 1) || ' ' || SPLIT_PART(permit_num, ' ', 2)) AS base_num,
         scope_tags,
         project_type
       FROM permits
       WHERE permit_num ~ '\\sBLD(\\s|$)'
         AND scope_tags IS NOT NULL
         AND array_length(scope_tags, 1) > 0
     ) AS bld
     WHERE TRIM(SPLIT_PART(companion.permit_num, ' ', 1) || ' ' || SPLIT_PART(companion.permit_num, ' ', 2)) = bld.base_num
       AND companion.permit_num !~ '\\sBLD(\\s|$)'
       AND companion.permit_num ~ '\\s[A-Z]{2,4}(\\s|$)'`
  );

  const propagated = propagateResult.rowCount || 0;
  console.log(`  Propagated scope tags to ${propagated.toLocaleString()} companion permits`);

  // Re-add demolition tag to DM permits that lost it during propagation
  const demFixResult = await pool.query(
    `UPDATE permits
     SET scope_tags = array_append(scope_tags, 'demolition')
     WHERE permit_type = 'Demolition Folder (DM)'
       AND NOT ('demolition' = ANY(scope_tags))`
  );
  const demFixed = demFixResult.rowCount || 0;
  if (demFixed > 0) {
    console.log(`  Re-added demolition tag to ${demFixed} DM companion permits`);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('');
  console.log('=== Classification Complete ===');
  console.log(`Processed:     ${processed.toLocaleString()}`);
  console.log(`With tags:     ${withTags.toLocaleString()} (${((withTags / processed) * 100).toFixed(1)}%)`);
  console.log(`Propagated:    ${propagated.toLocaleString()} companion permits`);
  console.log(`Duration:      ${elapsed}s`);
  console.log('');
  console.log('--- Project Type Distribution ---');
  for (const [type, count] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1])) {
    const pct = ((count / processed) * 100).toFixed(1);
    console.log(`  ${type.padEnd(15)} ${String(count).padStart(8)}  (${pct}%)`);
  }
  console.log('');
  console.log('--- Top 20 Scope Tags ---');
  const sortedTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 20);
  for (const [tag, count] of sortedTags) {
    const pct = ((count / processed) * 100).toFixed(1);
    console.log(`  ${tag.padEnd(30)} ${String(count).padStart(8)}  (${pct}%)`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error('Scope classification failed:', err);
  process.exit(1);
});
