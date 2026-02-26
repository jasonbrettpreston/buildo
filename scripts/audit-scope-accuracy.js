#!/usr/bin/env node
/**
 * Scope Classification Accuracy Audit
 *
 * Analyzes how well the scope classifier captures details from
 * permit descriptions, focused on "Small Residential Projects".
 *
 * Rubric:
 *   For each permit, compares classifier output (project_type + scope_tags)
 *   against keyword signals found in the description. Produces per-permit
 *   and aggregate accuracy scores.
 *
 * Usage:
 *   node scripts/audit-scope-accuracy.js [--limit 500] [--permit-type "Small Residential Projects"]
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
  if (/\baddition\b/i.test(desc)) return 'addition';
  if (/\brenovati?on|interior\s*alter|remodel/i.test(desc)) return 'renovation';
  if (/\brepair\b/i.test(desc)) return 'repair';

  return 'other';
}

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
  { tag: 'tenant-fitout',   patterns: [/\btenant\b/i, /\bfit[\s-]?out\b/i, /\bleasehold\s*improv/i] },
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

  const storeys = permit.storeys || 0;
  if (storeys >= 10) tags.add('high-rise');
  else if (storeys >= 5) tags.add('mid-rise');
  else if (storeys >= 2) tags.add('low-rise');

  return Array.from(tags).sort();
}

// ---------------------------------------------------------------------------
// "Ground Truth" keyword signals — broader patterns that SHOULD be captured
// These represent what a human reader would extract from the description
// ---------------------------------------------------------------------------

const GROUND_TRUTH_SIGNALS = [
  // Project type signals
  { signal: 'addition',        pattern: /\baddition\b/i, category: 'project_type' },
  { signal: 'new_build',       pattern: /\bnew\s*(build|construct|erect|house|dwelling)\b/i, category: 'project_type' },
  { signal: 'renovation',      pattern: /\b(renovation|remodel|interior\s*alter|renovate)\b/i, category: 'project_type' },
  { signal: 'demolition',      pattern: /\b(demolish|demolition|tear\s*down)\b/i, category: 'project_type' },
  { signal: 'repair',          pattern: /\brepair\b/i, category: 'project_type' },

  // Storey-related signals (broader than current patterns)
  { signal: 'storey-addition', pattern: /\b(one|two|three|four|five|1|2|3|4|5)\s*[-]?\s*(storey|story|stories)\s*(rear|side|front)?\s*(addition|ext)/i, category: 'scope_tag' },
  { signal: 'storey-mention',  pattern: /\b(one|two|three|four|five|six|1|2|3|4|5|6)\s*[-]?\s*(storey|story|stories)\b/i, category: 'description_detail' },
  { signal: '2nd-floor',       pattern: /\b(2nd|second)\s*(floor|storey|flr|level)\b/i, category: 'scope_tag' },
  { signal: '3rd-floor',       pattern: /\b(3rd|third|three)\s*(floor|storey|flr|level)\b/i, category: 'scope_tag' },

  // Structural signals
  { signal: 'rear-addition',   pattern: /\brear\s*(addition|extension|ext)\b/i, category: 'scope_tag' },
  { signal: 'side-addition',   pattern: /\bside\s*(addition|extension|ext)\b/i, category: 'scope_tag' },
  { signal: 'front-addition',  pattern: /\bfront\s*(addition|extension|ext)\b/i, category: 'scope_tag' },
  { signal: 'basement',        pattern: /\bbasement\b/i, category: 'scope_tag' },
  { signal: 'underpinning',    pattern: /\bunderpinn?ing\b/i, category: 'scope_tag' },
  { signal: 'foundation',      pattern: /\bfoundation\b/i, category: 'scope_tag' },

  // Exterior signals
  { signal: 'deck',            pattern: /\bdeck\b/i, category: 'scope_tag' },
  { signal: 'porch',           pattern: /\bporch\b/i, category: 'scope_tag' },
  { signal: 'garage',          pattern: /\bgarage\b/i, category: 'scope_tag' },
  { signal: 'laneway-suite',   pattern: /\blaneway\b/i, category: 'scope_tag' },
  { signal: 'pool',            pattern: /\bpool\b/i, category: 'scope_tag' },
  { signal: 'balcony',         pattern: /\bbalcon(y|ies)\b/i, category: 'scope_tag' },
  { signal: 'walkout',         pattern: /\bwalk[\s-]?out\b/i, category: 'scope_tag' },
  { signal: 'roofing',         pattern: /\broof(ing)?\b/i, category: 'scope_tag' },

  // Interior signals
  { signal: 'kitchen',         pattern: /\bkitchen\b/i, category: 'scope_tag' },
  { signal: 'bathroom',        pattern: /\bbath(room)?\b/i, category: 'scope_tag' },
  { signal: 'basement-finish', pattern: /\bbasement\s*(finish|reno|completion|convert|apartment)\b/i, category: 'scope_tag' },
  { signal: 'second-suite',    pattern: /\b(2nd|second(ary)?)\s*(suite|unit)\b/i, category: 'scope_tag' },
  { signal: 'open-concept',    pattern: /\bopen\s*concept|remov.*wall\b/i, category: 'scope_tag' },

  // Systems signals
  { signal: 'hvac',            pattern: /\bhvac|furnace|air\s*condition|heat\s*pump\b/i, category: 'scope_tag' },
  { signal: 'plumbing',        pattern: /\bplumbing\b/i, category: 'scope_tag' },
  { signal: 'electrical',      pattern: /\belectrical\b/i, category: 'scope_tag' },
  { signal: 'sprinkler',       pattern: /\bsprinkler\b/i, category: 'scope_tag' },
  { signal: 'drain',           pattern: /\bdrain|sewer\b/i, category: 'scope_tag' },
];

function extractGroundTruth(description) {
  const signals = [];
  for (const { signal, pattern, category } of GROUND_TRUTH_SIGNALS) {
    if (pattern.test(description || '')) {
      signals.push({ signal, category });
    }
  }
  return signals;
}

// ---------------------------------------------------------------------------
// Accuracy scoring
// ---------------------------------------------------------------------------

function scorePermit(permit) {
  const desc = (permit.description || '').trim();
  if (!desc) return null; // Skip permits with no description

  // Run current classifier
  const projectType = classifyProjectType(permit);
  const scopeTags = extractScopeTags(permit);

  // Extract ground truth signals from description
  const groundTruth = extractGroundTruth(desc);
  const gtScopeTags = groundTruth
    .filter(g => g.category === 'scope_tag')
    .map(g => g.signal);
  const gtProjectTypes = groundTruth
    .filter(g => g.category === 'project_type')
    .map(g => g.signal);
  const gtDescDetails = groundTruth
    .filter(g => g.category === 'description_detail')
    .map(g => g.signal);

  // Score: what % of ground truth signals are captured by classifier?
  const capturedTags = gtScopeTags.filter(gt => scopeTags.includes(gt));
  const missedTags = gtScopeTags.filter(gt => !scopeTags.includes(gt));

  // Project type accuracy
  const projectTypeCorrect = gtProjectTypes.length === 0 || gtProjectTypes.includes(projectType);

  // Storey-addition specific check
  const storeyMentionInDesc = /\b(one|two|three|four|five|1|2|3|4|5)\s*[-]?\s*(storey|story|stories)\b/i.test(desc);
  const storeyAdditionInDesc = /\b(one|two|three|four|five|1|2|3|4|5)\s*[-]?\s*(storey|story|stories)\s*\w*\s*(addition|ext)/i.test(desc);
  const storeyAdditionCaptured = scopeTags.includes('storey-addition');

  // Description richness — how many signals in desc vs how many captured
  const totalSignals = gtScopeTags.length + gtDescDetails.length;
  const capturedSignals = capturedTags.length;
  const tagRecall = totalSignals > 0 ? capturedSignals / totalSignals : 1;

  return {
    permit_num: permit.permit_num,
    work: permit.work,
    description: desc.substring(0, 120),
    project_type: projectType,
    project_type_correct: projectTypeCorrect,
    scope_tags: scopeTags,
    gt_scope_tags: gtScopeTags,
    captured_tags: capturedTags,
    missed_tags: missedTags,
    gt_desc_details: gtDescDetails,
    storey_in_desc: storeyMentionInDesc,
    storey_addition_in_desc: storeyAdditionInDesc,
    storey_addition_captured: storeyAdditionCaptured,
    tag_recall: tagRecall,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  let limit = 500;
  let permitType = 'Small Residential Projects';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit') limit = parseInt(args[i + 1], 10);
    if (args[i] === '--permit-type') permitType = args[i + 1];
  }

  console.log(`\n=== SCOPE CLASSIFICATION ACCURACY AUDIT ===`);
  console.log(`Permit type: "${permitType}"`);
  console.log(`Sample size: ${limit}\n`);

  const { rows } = await pool.query(
    `SELECT permit_num, revision_num, permit_type, work, description,
            structure_type, proposed_use, current_use, storeys
     FROM permits
     WHERE permit_type = $1
       AND description IS NOT NULL
       AND description != ''
     ORDER BY issued_date DESC NULLS LAST
     LIMIT $2`,
    [permitType, limit]
  );

  console.log(`Fetched ${rows.length} permits with descriptions\n`);

  // Score each permit
  const results = rows.map(scorePermit).filter(Boolean);

  // ---------------------------------------------------------------------------
  // Aggregate metrics
  // ---------------------------------------------------------------------------

  // 1. Project type accuracy
  const ptCorrect = results.filter(r => r.project_type_correct).length;
  const ptAccuracy = (ptCorrect / results.length * 100).toFixed(1);

  // 2. Tag recall (avg across permits with signals)
  const withSignals = results.filter(r => r.gt_scope_tags.length > 0);
  const avgRecall = withSignals.length > 0
    ? (withSignals.reduce((s, r) => s + r.tag_recall, 0) / withSignals.length * 100).toFixed(1)
    : 'N/A';

  // 3. Storey-addition miss rate
  const storeyAdditionDescs = results.filter(r => r.storey_addition_in_desc);
  const storeyAdditionCaptured = storeyAdditionDescs.filter(r => r.storey_addition_captured).length;
  const storeyAdditionMissRate = storeyAdditionDescs.length > 0
    ? ((1 - storeyAdditionCaptured / storeyAdditionDescs.length) * 100).toFixed(1)
    : 'N/A';

  // 4. Storey mention in desc but storeys field is NULL
  const storeyInDescNullField = results.filter(r => r.storey_in_desc).length;

  // 5. "Multiple Projects" work field analysis
  const multipleProjects = results.filter(r => r.work === 'Multiple Projects');
  const mpOther = multipleProjects.filter(r => r.project_type === 'other');

  // 6. Most common missed tags
  const missedTagCounts = {};
  for (const r of results) {
    for (const tag of r.missed_tags) {
      missedTagCounts[tag] = (missedTagCounts[tag] || 0) + 1;
    }
  }
  const topMissedTags = Object.entries(missedTagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  // 7. Project type distribution
  const ptDist = {};
  for (const r of results) {
    ptDist[r.project_type] = (ptDist[r.project_type] || 0) + 1;
  }

  // 8. Work field distribution
  const workDist = {};
  for (const r of results) {
    const w = r.work || '(empty)';
    workDist[w] = (workDist[w] || 0) + 1;
  }

  // 9. Permits with zero scope tags despite having description signals
  const zeroTagsWithSignals = results.filter(
    r => r.scope_tags.length === 0 && r.gt_scope_tags.length > 0
  );

  // ---------------------------------------------------------------------------
  // Report
  // ---------------------------------------------------------------------------

  console.log('═══════════════════════════════════════════════════════════');
  console.log('                    ACCURACY RUBRIC');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log('┌─────────────────────────────────┬──────────┐');
  console.log('│ Metric                          │ Score    │');
  console.log('├─────────────────────────────────┼──────────┤');
  console.log(`│ Project Type Accuracy           │ ${ptAccuracy.padStart(6)}%  │`);
  console.log(`│ Scope Tag Recall (avg)          │ ${avgRecall.toString().padStart(6)}%  │`);
  console.log(`│ Storey-Addition Miss Rate       │ ${storeyAdditionMissRate.toString().padStart(6)}%  │`);
  console.log(`│ Storey in desc (field NULL)     │ ${String(storeyInDescNullField).padStart(6)}   │`);
  console.log(`│ "Multiple Projects" → other     │ ${String(mpOther.length).padStart(3)}/${String(multipleProjects.length).padStart(3)}  │`);
  console.log(`│ Zero tags despite desc signals  │ ${String(zeroTagsWithSignals.length).padStart(6)}   │`);
  console.log('└─────────────────────────────────┴──────────┘\n');

  console.log('PROJECT TYPE DISTRIBUTION:');
  for (const [type, count] of Object.entries(ptDist).sort((a, b) => b[1] - a[1])) {
    const bar = '█'.repeat(Math.round(count / results.length * 50));
    console.log(`  ${type.padEnd(14)} ${String(count).padStart(5)} (${(count / results.length * 100).toFixed(1)}%) ${bar}`);
  }

  console.log('\nWORK FIELD DISTRIBUTION:');
  for (const [work, count] of Object.entries(workDist).sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    console.log(`  ${work.padEnd(35)} ${String(count).padStart(5)} (${(count / results.length * 100).toFixed(1)}%)`);
  }

  console.log('\nTOP MISSED SCOPE TAGS:');
  if (topMissedTags.length === 0) {
    console.log('  (none)');
  } else {
    for (const [tag, count] of topMissedTags) {
      console.log(`  ${tag.padEnd(20)} missed ${count} times`);
    }
  }

  // Show sample misses
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('         SAMPLE MISSES (storey-addition pattern)');
  console.log('═══════════════════════════════════════════════════════════\n');

  const storeyMisses = results
    .filter(r => r.storey_addition_in_desc && !r.storey_addition_captured)
    .slice(0, 10);

  if (storeyMisses.length === 0) {
    console.log('  (none found)');
  } else {
    for (const r of storeyMisses) {
      console.log(`  ${r.permit_num}: "${r.description}"`);
      console.log(`    project_type: ${r.project_type} | tags: [${r.scope_tags.join(', ')}]`);
      console.log(`    MISSED: [${r.missed_tags.join(', ')}]\n`);
    }
  }

  // Show "Multiple Projects" permits classified as "other"
  console.log('═══════════════════════════════════════════════════════════');
  console.log('     "MULTIPLE PROJECTS" → "other" (description unmatched)');
  console.log('═══════════════════════════════════════════════════════════\n');

  for (const r of mpOther.slice(0, 10)) {
    console.log(`  ${r.permit_num}: "${r.description}"`);
    console.log(`    tags: [${r.scope_tags.join(', ')}]\n`);
  }

  // Show permits with gt signals but zero captured tags
  console.log('═══════════════════════════════════════════════════════════');
  console.log('     ZERO SCOPE TAGS DESPITE DESCRIPTION SIGNALS');
  console.log('═══════════════════════════════════════════════════════════\n');

  for (const r of zeroTagsWithSignals.slice(0, 10)) {
    console.log(`  ${r.permit_num}: "${r.description}"`);
    console.log(`    EXPECTED: [${r.gt_scope_tags.join(', ')}]\n`);
  }

  await pool.end();
  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
