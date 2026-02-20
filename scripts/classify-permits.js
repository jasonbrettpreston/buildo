#!/usr/bin/env node
/**
 * Classify all permits against trade mapping rules and populate permit_trades.
 *
 * Trade classification is inferred from permit metadata (type, work, structure,
 * description) in the absence of actual building plans. Results are estimates
 * that can be refined as rules improve over time.
 *
 * Usage: node scripts/classify-permits.js
 */
const { Pool } = require('pg');

const BATCH_SIZE = 1000;

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  database: process.env.PG_DATABASE || 'buildo',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'postgres',
});

// ---------------------------------------------------------------------------
// Trades (hardcoded to avoid module resolution issues in standalone script)
// ---------------------------------------------------------------------------
const TRADES = [
  { id: 1,  slug: 'excavation' },
  { id: 2,  slug: 'shoring' },
  { id: 3,  slug: 'concrete' },
  { id: 4,  slug: 'structural-steel' },
  { id: 5,  slug: 'framing' },
  { id: 6,  slug: 'masonry' },
  { id: 7,  slug: 'roofing' },
  { id: 8,  slug: 'plumbing' },
  { id: 9,  slug: 'hvac' },
  { id: 10, slug: 'electrical' },
  { id: 11, slug: 'fire-protection' },
  { id: 12, slug: 'insulation' },
  { id: 13, slug: 'drywall' },
  { id: 14, slug: 'painting' },
  { id: 15, slug: 'flooring' },
  { id: 16, slug: 'glazing' },
  { id: 17, slug: 'elevator' },
  { id: 18, slug: 'demolition' },
  { id: 19, slug: 'landscaping' },
  { id: 20, slug: 'waterproofing' },
];

const TRADE_BY_ID = new Map(TRADES.map(t => [t.id, t]));

// ---------------------------------------------------------------------------
// Phase determination
// ---------------------------------------------------------------------------
const PHASE_TRADES = {
  early_construction: ['excavation','shoring','demolition','concrete','waterproofing'],
  structural: ['framing','structural-steel','masonry','concrete','roofing','plumbing','hvac','electrical','elevator','fire-protection'],
  finishing: ['insulation','drywall','painting','flooring','glazing','fire-protection','plumbing','hvac','electrical'],
  landscaping: ['landscaping','painting'],
};

function determinePhase(permit) {
  const status = (permit.status || '').toLowerCase();
  if (status.includes('completed') || status.includes('closed')) return 'landscaping';
  if (status.includes('application') || status.includes('not started')) return 'early_construction';

  if (!permit.issued_date) return 'early_construction';
  const issued = new Date(permit.issued_date);
  const months = Math.floor((Date.now() - issued.getTime()) / (1000 * 60 * 60 * 24 * 30));

  if (months <= 3) return 'early_construction';
  if (months <= 9) return 'structural';
  if (months <= 18) return 'finishing';
  return 'landscaping';
}

function isTradeActiveInPhase(slug, phase) {
  return (PHASE_TRADES[phase] || []).includes(slug);
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------
function statusBaseScore(status) {
  const s = (status || '').toLowerCase();
  if (s.includes('permit issued') || s.includes('revision issued')) return 40;
  if (s.includes('inspection')) return 50;
  if (s.includes('under review') || s.includes('issuance pending')) return 30;
  if (s.includes('application')) return 20;
  if (s.includes('not started')) return 15;
  if (s.includes('revocation') || s.includes('cancellation')) return 5;
  if (s.includes('abandoned')) return 0;
  return 25;
}

function calculateLeadScore(permit, match, phase) {
  let score = statusBaseScore(permit.status);

  // Cost boost (0-15)
  const cost = parseFloat(permit.est_const_cost) || 0;
  if (cost >= 5000000) score += 15;
  else if (cost >= 1000000) score += 12;
  else if (cost >= 500000) score += 10;
  else if (cost >= 100000) score += 7;
  else if (cost >= 50000) score += 4;

  // Freshness boost (0-20)
  if (permit.issued_date) {
    const days = Math.floor((Date.now() - new Date(permit.issued_date).getTime()) / (1000 * 60 * 60 * 24));
    if (days <= 7) score += 20;
    else if (days <= 30) score += 15;
    else if (days <= 90) score += 10;
    else if (days <= 180) score += 5;
  }

  // Phase match boost (0-15)
  if (match.trade_slug && isTradeActiveInPhase(match.trade_slug, phase)) {
    score += 15;
  }

  // Confidence boost (0-10)
  score += Math.round((match.confidence || 0) * 10);

  // Staleness penalty (0-20)
  if (permit.issued_date) {
    const days = Math.floor((Date.now() - new Date(permit.issued_date).getTime()) / (1000 * 60 * 60 * 24));
    if (days > 730) score -= 20;
    else if (days > 365) score -= 10;
    else if (days > 180) score -= 5;
  }

  // Revocation penalty
  const status = (permit.status || '').toLowerCase();
  if (status.includes('revocation') || status.includes('cancellation') || status.includes('abandoned')) {
    score -= 30;
  }

  return Math.max(0, Math.min(100, score));
}

// ---------------------------------------------------------------------------
// Rule matching
// ---------------------------------------------------------------------------
function fieldMatches(fieldValue, pattern, tier) {
  if (!fieldValue) return { matched: false, strength: 0 };
  const normValue = fieldValue.toLowerCase().trim();
  const normPattern = pattern.toLowerCase().trim();

  if (tier === 3) {
    try {
      const re = new RegExp(normPattern, 'i');
      const m = re.test(fieldValue);
      if (!m) return { matched: false, strength: 0 };
      const execResult = re.exec(fieldValue);
      const matchLength = execResult ? execResult[0].length : 0;
      const ratio = Math.min(matchLength / normValue.length, 1);
      const strength = 0.50 + ratio * 0.20;
      return { matched: true, strength };
    } catch {
      const matched = normValue.includes(normPattern);
      return { matched, strength: matched ? 0.50 : 0 };
    }
  }

  // Tier 1 & 2 - case-insensitive includes
  const matched = normValue.includes(normPattern);
  return { matched, strength: matched ? 1 : 0 };
}

// ---------------------------------------------------------------------------
// Permit code scope limiting
// ---------------------------------------------------------------------------
const NARROW_SCOPE_CODES = {
  PLB: ['plumbing'],
  PSA: ['plumbing'],
  HVA: ['hvac'],
  MSA: ['hvac'],
  DRN: ['plumbing'],
  STS: ['plumbing'],
  FSU: ['fire-protection'],
  DEM: ['demolition'],
  SHO: ['excavation', 'shoring', 'concrete', 'waterproofing'],
  FND: ['excavation', 'concrete', 'waterproofing', 'shoring'],
  TPS: ['framing', 'electrical'],
  PCL: ['electrical', 'plumbing', 'hvac'],
};

const WORK_SCOPE_EXCLUSIONS = {
  'interior alterations': ['excavation', 'shoring', 'roofing', 'landscaping', 'waterproofing'],
  'underpinning': ['roofing', 'glazing', 'landscaping', 'elevator', 'painting', 'flooring'],
  're-roofing': ['excavation', 'shoring', 'concrete', 'elevator', 'landscaping'],
  're-cladding': ['excavation', 'shoring', 'elevator', 'landscaping'],
  'fire alarm': ['excavation', 'shoring', 'concrete', 'roofing', 'framing', 'masonry', 'plumbing', 'hvac', 'insulation', 'drywall', 'painting', 'flooring', 'glazing', 'elevator', 'demolition', 'landscaping', 'waterproofing', 'structural-steel'],
  'sprinklers': ['excavation', 'shoring', 'concrete', 'roofing', 'framing', 'masonry', 'hvac', 'insulation', 'drywall', 'painting', 'flooring', 'glazing', 'elevator', 'demolition', 'landscaping', 'waterproofing', 'structural-steel'],
  'electromagnetic locks': ['excavation', 'shoring', 'concrete', 'roofing', 'framing', 'masonry', 'plumbing', 'hvac', 'insulation', 'drywall', 'painting', 'flooring', 'glazing', 'elevator', 'demolition', 'landscaping', 'waterproofing', 'structural-steel'],
  'elevator': ['excavation', 'shoring', 'roofing', 'landscaping', 'demolition', 'masonry', 'insulation', 'painting', 'waterproofing'],
  'demolition': ['framing', 'roofing', 'insulation', 'drywall', 'painting', 'flooring', 'glazing', 'elevator', 'landscaping'],
  'deck': ['elevator', 'shoring', 'structural-steel'],
  'porch': ['elevator', 'shoring', 'structural-steel'],
  'garage': ['elevator', 'landscaping'],
  'garage repair/reconstruction': ['elevator', 'landscaping'],
};

function extractPermitCode(permitNum) {
  if (!permitNum) return null;
  const m = permitNum.match(/\s([A-Z]{2,4})(?:\s|$)/);
  return m ? m[1] : null;
}

function applyScopeLimit(matches, permitNum, work) {
  const code = extractPermitCode(permitNum);

  if (code && NARROW_SCOPE_CODES[code]) {
    const allowed = NARROW_SCOPE_CODES[code];
    return matches.filter((m) => allowed.includes(m.trade_slug));
  }

  if (work) {
    const workLower = work.toLowerCase();
    for (const [workPattern, excluded] of Object.entries(WORK_SCOPE_EXCLUSIONS)) {
      if (workLower.includes(workPattern)) {
        return matches.filter((m) => !excluded.includes(m.trade_slug));
      }
    }
  }

  return matches;
}

function getFieldValue(permit, matchField) {
  return permit[matchField] || null;
}

function classifyPermit(permit, rules) {
  const phase = determinePhase(permit);
  const matchMap = new Map();

  for (const rule of rules) {
    if (!rule.is_active) continue;
    const fieldValue = getFieldValue(permit, rule.match_field);
    const { matched, strength } = fieldMatches(fieldValue, rule.match_pattern, rule.tier);
    if (!matched) continue;

    const trade = TRADE_BY_ID.get(rule.trade_id);
    if (!trade) continue;

    let confidence;
    if (rule.confidence > 0) {
      confidence = rule.confidence;
    } else if (rule.tier === 3) {
      confidence = strength;
    } else {
      confidence = rule.tier === 1 ? 0.95 : 0.80;
    }

    const isActive = isTradeActiveInPhase(trade.slug, phase);
    const tradeMatch = {
      permit_num: permit.permit_num,
      revision_num: permit.revision_num,
      trade_id: trade.id,
      trade_slug: trade.slug,
      tier: rule.tier,
      confidence,
      is_active: isActive,
      phase,
    };

    tradeMatch.lead_score = calculateLeadScore(permit, tradeMatch, phase);

    const key = `${trade.id}-${rule.tier}`;
    const existing = matchMap.get(key);
    if (!existing || existing.confidence < tradeMatch.confidence) {
      matchMap.set(key, tradeMatch);
    }
  }

  const allMatches = Array.from(matchMap.values());
  return applyScopeLimit(allMatches, permit.permit_num, permit.work);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('=== Buildo Trade Classification ===');
  console.log('Note: Trades are inferred from permit metadata, not actual building plans.');
  console.log('');

  // Load rules from DB
  const rulesResult = await pool.query(
    'SELECT id, trade_id, tier, match_field, match_pattern, confidence, phase_start, phase_end, is_active FROM trade_mapping_rules WHERE is_active = true ORDER BY tier, id'
  );
  const dbRules = rulesResult.rows;
  console.log(`Loaded ${dbRules.length} active rules from database`);

  // Also use hardcoded structure_type rules (not yet in DB migration)
  const structureTypeRules = [
    // Small residential (SFD-*)
    { id: 1000, trade_id: 5,  tier: 2, match_field: 'structure_type', match_pattern: 'SFD',               confidence: 0.55, phase_start: 3,  phase_end: 9,  is_active: true },
    { id: 1001, trade_id: 7,  tier: 2, match_field: 'structure_type', match_pattern: 'SFD',               confidence: 0.50, phase_start: 9,  phase_end: 18, is_active: true },
    { id: 1002, trade_id: 8,  tier: 2, match_field: 'structure_type', match_pattern: 'SFD',               confidence: 0.50, phase_start: 3,  phase_end: 18, is_active: true },
    { id: 1003, trade_id: 9,  tier: 2, match_field: 'structure_type', match_pattern: 'SFD',               confidence: 0.50, phase_start: 3,  phase_end: 18, is_active: true },
    { id: 1004, trade_id: 10, tier: 2, match_field: 'structure_type', match_pattern: 'SFD',               confidence: 0.50, phase_start: 3,  phase_end: 18, is_active: true },
    { id: 1005, trade_id: 12, tier: 2, match_field: 'structure_type', match_pattern: 'SFD',               confidence: 0.45, phase_start: 9,  phase_end: 18, is_active: true },
    { id: 1006, trade_id: 13, tier: 2, match_field: 'structure_type', match_pattern: 'SFD',               confidence: 0.45, phase_start: 9,  phase_end: 18, is_active: true },
    { id: 1007, trade_id: 14, tier: 2, match_field: 'structure_type', match_pattern: 'SFD',               confidence: 0.40, phase_start: 9,  phase_end: 18, is_active: true },
    { id: 1008, trade_id: 15, tier: 2, match_field: 'structure_type', match_pattern: 'SFD',               confidence: 0.40, phase_start: 9,  phase_end: 18, is_active: true },
    // Laneway
    { id: 1009, trade_id: 5,  tier: 2, match_field: 'structure_type', match_pattern: 'Laneway',           confidence: 0.55, phase_start: 3,  phase_end: 9,  is_active: true },
    { id: 1010, trade_id: 3,  tier: 2, match_field: 'structure_type', match_pattern: 'Laneway',           confidence: 0.50, phase_start: 0,  phase_end: 6,  is_active: true },
    { id: 1011, trade_id: 1,  tier: 2, match_field: 'structure_type', match_pattern: 'Laneway',           confidence: 0.50, phase_start: 0,  phase_end: 3,  is_active: true },
    // Apartment Building
    { id: 1012, trade_id: 3,  tier: 2, match_field: 'structure_type', match_pattern: 'Apartment Building', confidence: 0.60, phase_start: 0,  phase_end: 6,  is_active: true },
    { id: 1013, trade_id: 17, tier: 2, match_field: 'structure_type', match_pattern: 'Apartment Building', confidence: 0.60, phase_start: 6,  phase_end: 18, is_active: true },
    { id: 1014, trade_id: 11, tier: 2, match_field: 'structure_type', match_pattern: 'Apartment Building', confidence: 0.55, phase_start: 6,  phase_end: 18, is_active: true },
    { id: 1015, trade_id: 16, tier: 2, match_field: 'structure_type', match_pattern: 'Apartment Building', confidence: 0.55, phase_start: 9,  phase_end: 18, is_active: true },
    { id: 1016, trade_id: 4,  tier: 2, match_field: 'structure_type', match_pattern: 'Apartment Building', confidence: 0.50, phase_start: 3,  phase_end: 9,  is_active: true },
    // Stacked Townhouses
    { id: 1017, trade_id: 3,  tier: 2, match_field: 'structure_type', match_pattern: 'Stacked Townhouses', confidence: 0.55, phase_start: 0,  phase_end: 6,  is_active: true },
    { id: 1018, trade_id: 11, tier: 2, match_field: 'structure_type', match_pattern: 'Stacked Townhouses', confidence: 0.50, phase_start: 6,  phase_end: 18, is_active: true },
    // Industrial
    { id: 1019, trade_id: 4,  tier: 2, match_field: 'structure_type', match_pattern: 'Industrial',        confidence: 0.60, phase_start: 3,  phase_end: 9,  is_active: true },
    { id: 1020, trade_id: 10, tier: 2, match_field: 'structure_type', match_pattern: 'Industrial',        confidence: 0.55, phase_start: 3,  phase_end: 18, is_active: true },
    { id: 1021, trade_id: 3,  tier: 2, match_field: 'structure_type', match_pattern: 'Industrial',        confidence: 0.55, phase_start: 0,  phase_end: 6,  is_active: true },
    // Office
    { id: 1022, trade_id: 11, tier: 2, match_field: 'structure_type', match_pattern: 'Office',            confidence: 0.50, phase_start: 6,  phase_end: 18, is_active: true },
    { id: 1023, trade_id: 16, tier: 2, match_field: 'structure_type', match_pattern: 'Office',            confidence: 0.50, phase_start: 9,  phase_end: 18, is_active: true },
    { id: 1024, trade_id: 9,  tier: 2, match_field: 'structure_type', match_pattern: 'Office',            confidence: 0.50, phase_start: 3,  phase_end: 18, is_active: true },
    // Retail
    { id: 1025, trade_id: 16, tier: 2, match_field: 'structure_type', match_pattern: 'Retail',            confidence: 0.50, phase_start: 9,  phase_end: 18, is_active: true },
    { id: 1026, trade_id: 11, tier: 2, match_field: 'structure_type', match_pattern: 'Retail',            confidence: 0.45, phase_start: 6,  phase_end: 18, is_active: true },
    // Restaurant
    { id: 1027, trade_id: 9,  tier: 2, match_field: 'structure_type', match_pattern: 'Restaurant',        confidence: 0.55, phase_start: 3,  phase_end: 18, is_active: true },
    { id: 1028, trade_id: 8,  tier: 2, match_field: 'structure_type', match_pattern: 'Restaurant',        confidence: 0.50, phase_start: 3,  phase_end: 18, is_active: true },
    { id: 1029, trade_id: 11, tier: 2, match_field: 'structure_type', match_pattern: 'Restaurant',        confidence: 0.50, phase_start: 6,  phase_end: 18, is_active: true },
  ];

  const allRules = [...dbRules, ...structureTypeRules];
  console.log(`Total rules (DB + structure_type): ${allRules.length}`);

  // Count permits
  const countResult = await pool.query('SELECT COUNT(*) as total FROM permits');
  const totalPermits = parseInt(countResult.rows[0].total, 10);
  console.log(`Total permits to classify: ${totalPermits.toLocaleString()}`);
  console.log('');

  let processed = 0;
  let totalMatches = 0;
  let permitsWithTrades = 0;
  const offset = { value: 0 };
  const startTime = Date.now();

  while (offset.value < totalPermits) {
    const batch = await pool.query(
      `SELECT permit_num, revision_num, permit_type, structure_type, work,
              description, status, est_const_cost, issued_date, current_use, proposed_use
       FROM permits ORDER BY permit_num, revision_num
       LIMIT $1 OFFSET $2`,
      [BATCH_SIZE, offset.value]
    );

    if (batch.rows.length === 0) break;

    const insertValues = [];
    const insertParams = [];
    let paramIdx = 1;

    for (const permit of batch.rows) {
      const matches = classifyPermit(permit, allRules);
      if (matches.length > 0) {
        // Dedup by (permit_num, revision_num, trade_id) - keep highest confidence
        const dedupMap = new Map();
        for (const m of matches) {
          const key = `${m.permit_num}--${m.revision_num}--${m.trade_id}`;
          const existing = dedupMap.get(key);
          if (!existing || existing.confidence < m.confidence) {
            dedupMap.set(key, m);
          }
        }
        const dedupedMatches = Array.from(dedupMap.values());

        permitsWithTrades++;
        totalMatches += dedupedMatches.length;

        for (const m of dedupedMatches) {
          insertParams.push(
            `($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++})`
          );
          insertValues.push(
            m.permit_num, m.revision_num, m.trade_id, m.tier,
            m.confidence, m.is_active, m.phase, m.lead_score
          );
        }
      }
    }

    // Batch insert
    if (insertParams.length > 0) {
      await pool.query(
        `INSERT INTO permit_trades (permit_num, revision_num, trade_id, tier, confidence, is_active, phase, lead_score)
         VALUES ${insertParams.join(', ')}
         ON CONFLICT (permit_num, revision_num, trade_id)
         DO UPDATE SET tier = EXCLUDED.tier, confidence = EXCLUDED.confidence,
                       is_active = EXCLUDED.is_active, phase = EXCLUDED.phase,
                       lead_score = EXCLUDED.lead_score, classified_at = NOW()`,
        insertValues
      );
    }

    processed += batch.rows.length;
    offset.value += BATCH_SIZE;

    if (processed % 10000 === 0 || processed === totalPermits) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const pct = ((processed / totalPermits) * 100).toFixed(1);
      console.log(`  ${processed.toLocaleString()} / ${totalPermits.toLocaleString()} (${pct}%) - ${elapsed}s elapsed`);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('');
  console.log('=== Classification Complete ===');
  console.log(`Permits processed:    ${processed.toLocaleString()}`);
  console.log(`Permits with trades:  ${permitsWithTrades.toLocaleString()} (${((permitsWithTrades / processed) * 100).toFixed(1)}%)`);
  console.log(`Total trade matches:  ${totalMatches.toLocaleString()}`);
  console.log(`Avg trades/permit:    ${(totalMatches / Math.max(permitsWithTrades, 1)).toFixed(1)}`);
  console.log(`Duration:             ${elapsed}s`);
  console.log('');
  console.log('NOTE: Trade classifications are inferred estimates based on permit');
  console.log('metadata, not actual building plans. Rules can be refined over time.');

  await pool.end();
}

main().catch((err) => {
  console.error('Classification failed:', err);
  process.exit(1);
});
