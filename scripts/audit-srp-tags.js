#!/usr/bin/env node
/**
 * Audit Small Residential Project scope tags against descriptions.
 *
 * Checks for systematic misclassifications using a rubric of known patterns.
 * Runs classification in-memory (no scope_tags column needed).
 */
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  database: process.env.PG_DATABASE || 'buildo',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'postgres',
});

// ---------------------------------------------------------------------------
// Inline classification (mirrors scope.ts extractResidentialTags)
// ---------------------------------------------------------------------------

const CARDINAL_MAP = { one: 1, two: 2, three: 3, four: 4, five: 5 };

function hasRepairSignalNear(keyword, desc) {
  const idx = desc.indexOf(keyword);
  if (idx === -1) return false;
  const windowStart = Math.max(0, idx - 60);
  const windowEnd = Math.min(desc.length, idx + keyword.length + 60);
  const window = desc.substring(windowStart, windowEnd);
  if (!/\b(repair|replace|reconstruct|refinish|restore|re-?build)\b/.test(window)) return false;
  if (/\b(new|construct|build)\b/.test(window)) return false;
  return true;
}

function extractResidentialTags(permit) {
  const work = (permit.work || '').trim();
  const desc = (permit.description || '').trim();
  const descLower = desc.toLowerCase();
  if (work === 'Party Wall Admin Permits') return [];
  const tags = new Set();

  let storeyCount = 0;
  const numericStorey = descLower.match(/\b(\d+)\s*[-]?\s*(storey|story|stories)\b/);
  if (numericStorey) storeyCount = parseInt(numericStorey[1], 10);
  if (storeyCount === 0) {
    const cardinalStorey = descLower.match(/\b(one|two|three|four|five)\s*[-]?\s*(storey|story|stories)\b/);
    if (cardinalStorey) storeyCount = CARDINAL_MAP[cardinalStorey[1]] || 0;
  }
  if (storeyCount === 0 && /\bsingle\s*[-]?\s*(storey|story)\b/.test(descLower)) storeyCount = 1;

  const isAddition = /^Addition/i.test(work) || /\badd(i)?tion\b(?!\s+of\b)/i.test(descLower);
  if (isAddition) {
    if (storeyCount >= 3) tags.add('new:3-storey-addition');
    else if (storeyCount === 2) tags.add('new:2-storey-addition');
    else tags.add('new:1-storey-addition');
  }

  if (/\bdeck\b/i.test(descLower) || /^Deck$/i.test(work)) tags.add(hasRepairSignalNear('deck', descLower) ? 'alter:deck' : 'new:deck');
  if (/\bgarage\b/i.test(descLower) || /^Garage$/i.test(work)) tags.add(hasRepairSignalNear('garage', descLower) ? 'alter:garage' : 'new:garage');
  if (/\bporch\b/i.test(descLower) || /^Porch$/i.test(work)) tags.add(hasRepairSignalNear('porch', descLower) ? 'alter:porch' : 'new:porch');
  if (/\bbasement\b/i.test(descLower)) tags.add('new:basement');
  if (/\bunderpinn?ing\b/i.test(descLower)) tags.add('new:underpinning');
  if (/\bwalk[\s-]?out\b/i.test(descLower)) tags.add('new:walkout');
  if (/\bbalcon(y|ies)\b/i.test(descLower)) tags.add('new:balcony');
  if (/\bdormer\b/i.test(descLower)) tags.add('new:dormer');
  if (work === 'Second Suite (New)' || /\b(2nd|second(ary)?)\s*(suite|unit)\b/i.test(descLower)) tags.add('new:second-suite');
  if (/\bkitchen\b/i.test(descLower)) tags.add('new:kitchen');
  if (/\bbath(room)?\b/i.test(descLower) || /\bwashroom\b/i.test(descLower) || /\bpowder\s*room\b/i.test(descLower) || /\bensuite\b/i.test(descLower) || /\ben-suite\b/i.test(descLower) || /\blavatory\b/i.test(descLower)) tags.add('new:bathroom');
  if (/\blaundry\b/i.test(descLower)) tags.add('new:laundry');
  if (/\bopen\s*concept\b/i.test(descLower) || /\b(remov|load[\s-]*bearing).*wall\b/i.test(descLower)) tags.add('new:open-concept');
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
  if (/\bshed\b/i.test(descLower) || /\bcabana\b/i.test(descLower) || /\bancillary\b/i.test(descLower) || /\baccessory\s*(building|structure)\b/i.test(descLower) || work === 'Accessory Building(s)' || work === 'Accessory Structure') tags.add('new:accessory-building');
  if (/\binterior\s*alter/i.test(descLower) || /\brenovati?on\b/i.test(descLower) || /\bremodel\b/i.test(descLower) || work === 'Interior Alterations') tags.add('alter:interior-alterations');
  if (/\bfire\s*(damage|restoration)\b/i.test(descLower) || /\bvehicle\s*impact\b/i.test(descLower) || work === 'Fire Damage') tags.add('alter:fire-damage');
  if (/\bconvert\b/i.test(descLower) || /\bconversion\b/i.test(descLower) || work === 'Change of Use') tags.add('alter:unit-conversion');

  // Dedup
  if (tags.has('new:basement') && tags.has('new:underpinning')) tags.delete('new:basement');
  if (tags.has('new:basement') && tags.has('new:second-suite')) tags.delete('new:basement');
  if (tags.has('new:second-suite') && tags.has('alter:interior-alterations')) tags.delete('alter:interior-alterations');
  if (tags.has('new:accessory-building') && (tags.has('new:garage') || tags.has('alter:garage'))) tags.delete('new:accessory-building');
  if (tags.has('new:accessory-building') && tags.has('new:pool')) tags.delete('new:accessory-building');
  if (tags.has('alter:unit-conversion') && tags.has('new:second-suite')) tags.delete('alter:unit-conversion');

  return Array.from(tags).sort();
}

// ---------------------------------------------------------------------------
// Audit Rubric — patterns that SHOULD produce a tag but currently DON'T
// ---------------------------------------------------------------------------

const MISSING_TAG_RUBRIC = [
  {
    id: 'BATH-01',
    name: 'Washroom/bathroom not tagged',
    descPattern: /\b(washroom|bathroom|bath\b|powder\s*room|ensuite|en-suite|lavatory|w\.?c\.?\b)/i,
    expectedTag: null, // No residential bathroom tag exists
    severity: 'gap',
    note: 'No residential bathroom tag — only general extractor has "bathroom"',
  },
  {
    id: 'LAUNDRY-01',
    name: 'Laundry facility not tagged',
    descPattern: /\b(laundry|washer|dryer)\b/i,
    expectedTag: null,
    severity: 'gap',
    note: 'No laundry tag exists in residential system',
  },
  {
    id: 'WINDOW-01',
    name: 'Window work not tagged',
    descPattern: /\b(window|glazing|fenestration)\b/i,
    expectedTag: null,
    severity: 'gap',
    note: 'No window tag exists in residential system',
  },
  {
    id: 'FIREPLACE-01',
    name: 'Fireplace work not tagged',
    descPattern: /\b(fireplace|chimney|flue)\b/i,
    expectedTag: null,
    severity: 'gap',
    note: 'No fireplace tag exists',
  },
  {
    id: 'HVAC-01',
    name: 'HVAC/furnace in residential not tagged',
    descPattern: /\b(hvac|furnace|air\s*condition|heat\s*pump|duct(work)?)\b/i,
    expectedTag: null,
    severity: 'gap',
    note: 'HVAC tag only in general extractor, not residential',
  },
  {
    id: 'PLUMB-01',
    name: 'Plumbing in residential not tagged',
    descPattern: /\b(plumbing|plumber)\b/i,
    expectedTag: null,
    severity: 'gap',
    note: 'Plumbing tag only in general extractor, not residential',
  },
  {
    id: 'ELEC-01',
    name: 'Electrical in residential not tagged',
    descPattern: /\b(electrical|wiring|panel)\b/i,
    expectedTag: null,
    severity: 'gap',
    note: 'Electrical tag only in general extractor, not residential',
  },
  {
    id: 'STAIR-01',
    name: 'Stairs/staircase not tagged',
    descPattern: /\b(stair(s|case)?|step(s)?)\b/i,
    expectedTag: null,
    severity: 'gap',
    note: 'No staircase tag exists',
  },
  {
    id: 'DRIVEWAY-01',
    name: 'Driveway work not tagged',
    descPattern: /\b(driveway|parking\s*pad)\b/i,
    expectedTag: null,
    severity: 'gap',
    note: 'No driveway tag exists',
  },
  {
    id: 'RETAINING-01',
    name: 'Retaining wall not tagged',
    descPattern: /\bretaining\s*wall\b/i,
    expectedTag: null,
    severity: 'gap',
    note: 'No retaining wall tag exists',
  },
];

// ---------------------------------------------------------------------------
// Audit Rubric — WRONG tag assignments
// ---------------------------------------------------------------------------

const WRONG_TAG_RUBRIC = [
  {
    id: 'ADD-WRONG-01',
    name: 'Addition tag when work is Interior Alterations only',
    check: (permit, tags) => {
      const work = (permit.work || '').trim();
      const desc = (permit.description || '').trim().toLowerCase();
      // work is strictly Interior Alterations (not Addition/Multiple)
      if (work !== 'Interior Alterations') return false;
      // Has an addition tag
      const hasAdditionTag = tags.some(t => t.includes('storey-addition'));
      if (!hasAdditionTag) return false;
      // Description says "addition of" something (not a structural addition)
      // e.g. "addition of laundry facility", "addition of washroom"
      if (/\baddition\s+of\s+/i.test(desc)) return true;
      return false;
    },
    severity: 'misclass',
    note: '"addition of [facility]" != structural addition',
  },
  {
    id: 'ADD-WRONG-02',
    name: 'Addition tag from "addition of" (non-structural) phrasing',
    check: (permit, tags) => {
      const desc = (permit.description || '').trim().toLowerCase();
      const hasAdditionTag = tags.some(t => t.includes('storey-addition'));
      if (!hasAdditionTag) return false;
      // "addition of" followed by a non-structural item
      const match = desc.match(/\baddition\s+of\s+(a\s+)?(new\s+)?(\w+)/i);
      if (match) {
        const item = match[3].toLowerCase();
        const nonStructural = ['washroom', 'bathroom', 'laundry', 'closet', 'window', 'door', 'shower', 'powder'];
        if (nonStructural.includes(item)) return true;
      }
      return false;
    },
    severity: 'misclass',
    note: '"addition of washroom/laundry" should not trigger storey-addition',
  },
  {
    id: 'EMPTY-01',
    name: 'No tags at all (excluding Party Wall)',
    check: (permit, tags) => {
      const work = (permit.work || '').trim();
      if (work === 'Party Wall Admin Permits') return false;
      return tags.length === 0;
    },
    severity: 'coverage',
    note: 'Permit gets zero scope tags',
  },
];

// ---------------------------------------------------------------------------
// Main audit
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== Small Residential Scope Tag Audit ===\n');

  const BATCH_SIZE = 2000;
  let lastKey = null;
  let total = 0;

  // Counters
  const missingCounts = {};
  const missingSamples = {};
  for (const r of MISSING_TAG_RUBRIC) {
    missingCounts[r.id] = 0;
    missingSamples[r.id] = [];
  }
  const wrongCounts = {};
  const wrongSamples = {};
  for (const r of WRONG_TAG_RUBRIC) {
    wrongCounts[r.id] = 0;
    wrongSamples[r.id] = [];
  }

  // Tag distribution
  const tagDist = {};
  let emptyTags = 0;

  while (true) {
    let q, params;
    if (lastKey === null) {
      q = `SELECT permit_num, revision_num, permit_type, work, description
           FROM permits WHERE permit_type LIKE 'Small Residential%'
           ORDER BY permit_num, revision_num LIMIT $1`;
      params = [BATCH_SIZE];
    } else {
      q = `SELECT permit_num, revision_num, permit_type, work, description
           FROM permits WHERE permit_type LIKE 'Small Residential%'
             AND (permit_num, revision_num) > ($1, $2)
           ORDER BY permit_num, revision_num LIMIT $3`;
      params = [lastKey.permit_num, lastKey.revision_num, BATCH_SIZE];
    }

    const { rows } = await pool.query(q, params);
    if (rows.length === 0) break;

    for (const permit of rows) {
      total++;
      const tags = extractResidentialTags(permit);
      const descLower = (permit.description || '').toLowerCase();

      // Tag distribution
      if (tags.length === 0) emptyTags++;
      for (const tag of tags) {
        tagDist[tag] = (tagDist[tag] || 0) + 1;
      }

      // Check missing tag rubric
      for (const r of MISSING_TAG_RUBRIC) {
        if (r.descPattern.test(descLower)) {
          missingCounts[r.id]++;
          if (missingSamples[r.id].length < 5) {
            missingSamples[r.id].push({
              permit_num: permit.permit_num,
              work: permit.work,
              desc: (permit.description || '').slice(0, 120),
              tags,
            });
          }
        }
      }

      // Check wrong tag rubric
      for (const r of WRONG_TAG_RUBRIC) {
        if (r.check(permit, tags)) {
          wrongCounts[r.id]++;
          if (wrongSamples[r.id].length < 5) {
            wrongSamples[r.id].push({
              permit_num: permit.permit_num,
              work: permit.work,
              desc: (permit.description || '').slice(0, 120),
              tags,
            });
          }
        }
      }
    }

    lastKey = rows[rows.length - 1];
    if (total % 10000 < BATCH_SIZE) {
      process.stdout.write(`  Audited ${total.toLocaleString()} permits...\r`);
    }
  }

  console.log(`\nTotal SRP permits audited: ${total.toLocaleString()}`);
  console.log(`Permits with zero tags:   ${emptyTags.toLocaleString()} (${((emptyTags / total) * 100).toFixed(1)}%)`);

  // --- Tag Distribution ---
  console.log('\n--- Tag Distribution (top 30) ---');
  const sortedTags = Object.entries(tagDist).sort((a, b) => b[1] - a[1]).slice(0, 30);
  for (const [tag, count] of sortedTags) {
    console.log(`  ${tag.padEnd(35)} ${String(count).padStart(7)}  (${((count / total) * 100).toFixed(1)}%)`);
  }

  // --- Misclassification Issues ---
  console.log('\n========================================');
  console.log('MISCLASSIFICATION ISSUES (wrong tags)');
  console.log('========================================');
  for (const r of WRONG_TAG_RUBRIC) {
    const count = wrongCounts[r.id];
    if (count === 0) continue;
    console.log(`\n[${r.severity.toUpperCase()}] ${r.id}: ${r.name}`);
    console.log(`  Count: ${count.toLocaleString()} (${((count / total) * 100).toFixed(2)}%)`);
    console.log(`  Note:  ${r.note}`);
    console.log('  Samples:');
    for (const s of wrongSamples[r.id]) {
      console.log(`    ${s.permit_num} | work="${s.work}" | tags=[${s.tags.join(', ')}]`);
      console.log(`      desc: "${s.desc}"`);
    }
  }

  // --- Coverage Gaps ---
  console.log('\n========================================');
  console.log('COVERAGE GAPS (untagged concepts in descriptions)');
  console.log('========================================');
  for (const r of MISSING_TAG_RUBRIC) {
    const count = missingCounts[r.id];
    if (count === 0) continue;
    console.log(`\n[${r.severity.toUpperCase()}] ${r.id}: ${r.name}`);
    console.log(`  Mentions: ${count.toLocaleString()} (${((count / total) * 100).toFixed(1)}%)`);
    console.log(`  Note:     ${r.note}`);
    console.log('  Samples:');
    for (const s of missingSamples[r.id]) {
      console.log(`    ${s.permit_num} | work="${s.work}" | tags=[${s.tags.join(', ')}]`);
      console.log(`      desc: "${s.desc}"`);
    }
  }

  // --- Summary ---
  console.log('\n========================================');
  console.log('AUDIT SUMMARY');
  console.log('========================================');

  let totalMisclass = 0;
  let totalGaps = 0;
  for (const r of WRONG_TAG_RUBRIC) {
    if (wrongCounts[r.id] > 0) {
      totalMisclass += wrongCounts[r.id];
      console.log(`  [WRONG]    ${r.id.padEnd(16)} ${String(wrongCounts[r.id]).padStart(7)} permits`);
    }
  }
  for (const r of MISSING_TAG_RUBRIC) {
    if (missingCounts[r.id] > 0) {
      totalGaps += missingCounts[r.id];
      console.log(`  [GAP]      ${r.id.padEnd(16)} ${String(missingCounts[r.id]).padStart(7)} mentions`);
    }
  }
  console.log(`\n  Total misclassifications:  ${totalMisclass.toLocaleString()}`);
  console.log(`  Total gap mentions:        ${totalGaps.toLocaleString()}`);
  console.log(`  Classification accuracy:   ${(((total - totalMisclass) / total) * 100).toFixed(2)}%`);

  await pool.end();
}

main().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
