#!/usr/bin/env node
/**
 * Classify all permits against trade mapping rules and populate permit_trades.
 *
 * Trade classification is inferred from permit metadata (type, work, structure,
 * description) in the absence of actual building plans. Results are estimates
 * that can be refined as rules improve over time.
 *
 * Usage:
 *   node scripts/classify-permits.js           # incremental (new/changed only)
 *   node scripts/classify-permits.js --full     # re-classify all permits
 */
const { Pool } = require('pg');

const BATCH_SIZE = 1000;
const fullMode = process.argv.includes('--full');

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
  { id: 32, slug: 'drain-plumbing' },
];

const TRADE_BY_ID = new Map(TRADES.map(t => [t.id, t]));

// ---------------------------------------------------------------------------
// Phase determination
// ---------------------------------------------------------------------------
const PHASE_TRADES = {
  early_construction: ['excavation','shoring','demolition','concrete','waterproofing','drain-plumbing'],
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
// Tag-Trade Matrix (mirrors src/lib/classification/tag-trade-matrix.ts)
// ---------------------------------------------------------------------------
const TAG_ALIASES = {
  'roofing': 'roof',
  'laneway-suite': 'laneway',
  'fire-alarm': 'fire_alarm',
  'interior-alterations': 'interior',
  'finished-basement': 'basement',
  'basement-finish': 'basement',
  'stacked-townhouse': 'townhouse',
  'semi-detached': 'semi',
  'condo': 'apartment',
  'rear-addition': 'addition',
  'front-addition': 'addition',
  'side-addition': 'addition',
  'storey-addition': 'addition',
  '2nd-floor': 'addition',
  '3rd-floor': 'addition',
  'convert-unit': 'unit-conversion',
};

function normalizeTag(tag) {
  let base = tag.replace(/^(new|alter|sys|scale|exp):/, '');
  base = base.replace(/^houseplex-\d+-unit$/, 'houseplex');
  return TAG_ALIASES[base] ?? base;
}

const TAG_TRADE_MATRIX = {
  kitchen: [['plumbing',0.80],['electrical',0.80],['flooring',0.65],['drywall',0.60],['painting',0.55]],
  bathroom: [['plumbing',0.85],['drywall',0.70],['glazing',0.60],['electrical',0.65],['waterproofing',0.60],['painting',0.55]],
  basement: [['framing',0.75],['drywall',0.75],['plumbing',0.70],['electrical',0.75],['insulation',0.70],['flooring',0.65],['waterproofing',0.65],['painting',0.55]],
  pool: [['excavation',0.75],['concrete',0.80],['plumbing',0.75],['electrical',0.65],['landscaping',0.60]],
  deck: [['framing',0.65],['concrete',0.55]],
  porch: [['framing',0.70],['concrete',0.65],['roofing',0.55],['masonry',0.55]],
  garage: [['framing',0.70],['concrete',0.70],['roofing',0.65],['electrical',0.60],['drywall',0.55]],
  fence: [['framing',0.55]],
  garden_suite: [['framing',0.80],['concrete',0.75],['excavation',0.70],['plumbing',0.75],['electrical',0.75],['hvac',0.70],['insulation',0.65],['drywall',0.65],['roofing',0.65]],
  laneway: [['framing',0.80],['concrete',0.75],['excavation',0.70],['plumbing',0.75],['electrical',0.75],['hvac',0.70],['insulation',0.65],['drywall',0.65],['roofing',0.65]],
  'build-sfd': [['excavation',0.80],['concrete',0.80],['framing',0.85],['roofing',0.80],['plumbing',0.80],['hvac',0.80],['electrical',0.80],['insulation',0.75],['drywall',0.75],['painting',0.70],['flooring',0.70],['masonry',0.65],['glazing',0.60],['waterproofing',0.55],['landscaping',0.60]],
  semi: [['excavation',0.75],['concrete',0.75],['framing',0.80],['roofing',0.75],['plumbing',0.75],['hvac',0.75],['electrical',0.75],['insulation',0.70],['drywall',0.70],['painting',0.65],['flooring',0.65],['masonry',0.70],['landscaping',0.55]],
  townhouse: [['excavation',0.75],['concrete',0.75],['framing',0.80],['roofing',0.75],['plumbing',0.75],['hvac',0.75],['electrical',0.75],['insulation',0.70],['drywall',0.70],['painting',0.65],['flooring',0.65],['masonry',0.70],['fire-protection',0.55],['landscaping',0.55]],
  houseplex: [['excavation',0.75],['concrete',0.75],['framing',0.80],['roofing',0.75],['plumbing',0.80],['hvac',0.80],['electrical',0.80],['insulation',0.70],['drywall',0.70],['painting',0.65],['flooring',0.65],['fire-protection',0.60],['masonry',0.65]],
  apartment: [['concrete',0.80],['framing',0.75],['plumbing',0.80],['hvac',0.80],['electrical',0.80],['elevator',0.75],['drywall',0.70],['painting',0.65],['fire-protection',0.70]],
  'tenant-fitout': [['drywall',0.80],['painting',0.75],['electrical',0.75],['flooring',0.70],['hvac',0.65],['plumbing',0.60],['fire-protection',0.60]],
  retail: [['drywall',0.75],['painting',0.70],['electrical',0.75],['plumbing',0.65],['flooring',0.70],['glazing',0.65],['hvac',0.60],['fire-protection',0.55]],
  office: [['drywall',0.80],['painting',0.75],['electrical',0.75],['hvac',0.70],['flooring',0.70],['fire-protection',0.60]],
  restaurant: [['plumbing',0.85],['hvac',0.80],['electrical',0.80],['fire-protection',0.75],['drywall',0.60],['painting',0.55]],
  warehouse: [['concrete',0.75],['structural-steel',0.70],['electrical',0.75],['plumbing',0.60],['hvac',0.65],['fire-protection',0.70],['roofing',0.55]],
  hvac: [['hvac',0.85]],
  plumbing: [['plumbing',0.85]],
  electrical: [['electrical',0.85]],
  fire_alarm: [['fire-protection',0.85],['electrical',0.55]],
  sprinkler: [['fire-protection',0.85],['plumbing',0.55]],
  underpinning: [['shoring',0.85],['concrete',0.75],['waterproofing',0.65],['excavation',0.70]],
  foundation: [['concrete',0.85],['excavation',0.75],['waterproofing',0.70]],
  addition: [['framing',0.75],['concrete',0.65],['roofing',0.60],['plumbing',0.55],['electrical',0.60],['insulation',0.55],['drywall',0.55]],
  roof: [['roofing',0.85]],
  cladding: [['masonry',0.70],['insulation',0.60]],
  windows: [['glazing',0.85]],
  solar: [['electrical',0.75],['roofing',0.55]],
  ev_charger: [['electrical',0.80]],
  elevator: [['elevator',0.85],['electrical',0.55]],
  interior: [['drywall',0.70],['painting',0.65],['flooring',0.60],['electrical',0.55]],
  fireplace: [['hvac',0.65],['masonry',0.55]],
  'high-rise': [['elevator',0.65],['concrete',0.65],['structural-steel',0.60],['fire-protection',0.60],['glazing',0.55]],
  'mid-rise': [['concrete',0.60],['fire-protection',0.55],['elevator',0.55]],
  demolition: [['demolition',0.85],['excavation',0.50]],
  security: [['electrical',0.55]],
  // New entries
  walkout: [['excavation',0.75],['concrete',0.70],['waterproofing',0.70],['framing',0.60]],
  'second-suite': [['framing',0.75],['plumbing',0.75],['electrical',0.75],['hvac',0.70],['drywall',0.70],['insulation',0.65],['flooring',0.60],['painting',0.55]],
  balcony: [['framing',0.70],['concrete',0.65],['glazing',0.55],['waterproofing',0.60]],
  dormer: [['framing',0.75],['roofing',0.70],['insulation',0.60],['drywall',0.60],['glazing',0.55]],
  'unit-conversion': [['framing',0.70],['drywall',0.70],['plumbing',0.65],['electrical',0.70],['hvac',0.60],['painting',0.55],['flooring',0.55]],
  'open-concept': [['framing',0.75],['structural-steel',0.65],['drywall',0.70],['painting',0.60],['electrical',0.55]],
  'structural-beam': [['structural-steel',0.80],['framing',0.65]],
  'fire-damage': [['demolition',0.70],['framing',0.70],['drywall',0.70],['painting',0.65],['electrical',0.65],['plumbing',0.60],['insulation',0.60]],
  carport: [['framing',0.70],['concrete',0.65],['roofing',0.65]],
  canopy: [['framing',0.65],['concrete',0.55]],
  laundry: [['plumbing',0.80],['electrical',0.65]],
  'accessory-building': [['framing',0.70],['concrete',0.60],['electrical',0.55],['roofing',0.55]],
  drain: [['drain-plumbing',0.85]],
  'backflow-preventer': [['drain-plumbing',0.80]],
  'access-control': [['electrical',0.70]],
  school: [['concrete',0.65],['framing',0.65],['hvac',0.70],['electrical',0.70],['plumbing',0.65],['fire-protection',0.60]],
  hospital: [['concrete',0.65],['framing',0.60],['hvac',0.75],['electrical',0.75],['plumbing',0.70],['fire-protection',0.65],['elevator',0.60]],
  station: [['concrete',0.70],['structural-steel',0.65],['electrical',0.70]],
  storage: [['framing',0.60],['concrete',0.60]],
};

// Slug → trade id mapping
const SLUG_TO_ID = new Map(TRADES.map(t => [t.slug, t.id]));

function lookupTradesForTags(scopeTags) {
  const best = new Map(); // slug -> confidence
  for (const tag of scopeTags) {
    const key = normalizeTag(tag);
    const entries = TAG_TRADE_MATRIX[key];
    if (!entries) continue;
    for (const [slug, conf] of entries) {
      const existing = best.get(slug) ?? 0;
      if (conf > existing) best.set(slug, conf);
    }
  }
  return Array.from(best.entries()).map(([slug, confidence]) => ({ slug, confidence }));
}

// ---------------------------------------------------------------------------
// Work-Field Fallback (mirrors classifier.ts WORK_TRADE_FALLBACK)
// ---------------------------------------------------------------------------
const WORK_TRADE_FALLBACK = {
  'Interior Alterations': { slugs: ['drywall','painting','flooring','electrical','plumbing'], confidence: 0.70 },
  'New Building': { slugs: ['framing','concrete','excavation','plumbing','electrical','hvac','drywall','roofing','insulation'], confidence: 0.65 },
  'Addition': { slugs: ['framing','concrete','plumbing','electrical','hvac','drywall','insulation'], confidence: 0.65 },
  'Re-Roofing': { slugs: ['roofing'], confidence: 0.85 },
  'Re-Cladding': { slugs: ['masonry','insulation'], confidence: 0.80 },
  'Deck': { slugs: ['framing','concrete'], confidence: 0.75 },
  'Porch': { slugs: ['framing','concrete','roofing','masonry'], confidence: 0.70 },
  'Garage': { slugs: ['framing','concrete','roofing','electrical','drywall'], confidence: 0.70 },
  'Pool': { slugs: ['excavation','concrete','plumbing','electrical'], confidence: 0.75 },
  'Demolition': { slugs: ['demolition','excavation'], confidence: 0.85 },
  'Underpinning': { slugs: ['shoring','concrete','waterproofing','excavation'], confidence: 0.80 },
  'Fireplace/Wood Stoves': { slugs: ['hvac','masonry'], confidence: 0.75 },
  'Fire Damage': { slugs: ['demolition','framing','drywall','painting','electrical','plumbing','insulation'], confidence: 0.65 },
  'Sprinklers': { slugs: ['fire-protection','plumbing'], confidence: 0.80 },
  'Electromagnetic Locks': { slugs: ['electrical'], confidence: 0.80 },
  'Fire Alarm': { slugs: ['fire-protection','electrical'], confidence: 0.80 },
  'Elevator': { slugs: ['elevator','electrical'], confidence: 0.80 },
  'Balcony/Guard Replacement': { slugs: ['framing','concrete','glazing','waterproofing'], confidence: 0.70 },
  'HVAC': { slugs: ['hvac'], confidence: 0.85 },
  'Plumbing': { slugs: ['plumbing'], confidence: 0.85 },
  'Drain': { slugs: ['drain-plumbing'], confidence: 0.85 },
  'Mechanical': { slugs: ['hvac','plumbing','electrical'], confidence: 0.75 },
};
const DEFAULT_FALLBACK = { slugs: ['framing','plumbing','electrical','hvac','drywall','painting'], confidence: 0.55 };

function getWorkFallback(work) {
  if (!work) return DEFAULT_FALLBACK;
  const workLower = work.toLowerCase();
  for (const [pattern, fb] of Object.entries(WORK_TRADE_FALLBACK)) {
    if (workLower.includes(pattern.toLowerCase())) return fb;
  }
  return DEFAULT_FALLBACK;
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
  DRN: ['drain-plumbing'],
  STS: ['drain-plumbing'],
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
  const code = extractPermitCode(permit.permit_num);
  const isNarrowScope = code != null && NARROW_SCOPE_CODES[code] != null;

  // Step 1: Tier 1 rule matches
  const ruleMap = new Map();
  for (const rule of rules) {
    if (!rule.is_active) continue;
    if (rule.tier !== 1) continue; // Only Tier 1 rules now
    const fieldValue = getFieldValue(permit, rule.match_field);
    const { matched } = fieldMatches(fieldValue, rule.match_pattern, rule.tier);
    if (!matched) continue;

    const trade = TRADE_BY_ID.get(rule.trade_id);
    if (!trade) continue;

    const confidence = rule.confidence > 0 ? rule.confidence : 0.95;
    const isActive = isTradeActiveInPhase(trade.slug, phase);
    const tradeMatch = {
      permit_num: permit.permit_num,
      revision_num: permit.revision_num,
      trade_id: trade.id,
      trade_slug: trade.slug,
      tier: 1,
      confidence,
      is_active: isActive,
      phase,
    };
    tradeMatch.lead_score = calculateLeadScore(permit, tradeMatch, phase);

    const existing = ruleMap.get(trade.slug);
    if (!existing || existing.confidence < confidence) {
      ruleMap.set(trade.slug, tradeMatch);
    }
  }

  // Narrow-scope permits: Tier 1 rule matches, with code-based fallback
  if (isNarrowScope) {
    const limited = applyScopeLimit(Array.from(ruleMap.values()), permit.permit_num, permit.work);
    if (limited.length > 0) return limited;

    // Fallback: assign code's allowed trades at 0.80 confidence
    const allowed = NARROW_SCOPE_CODES[code];
    return allowed.map((slug) => {
      const tradeId = SLUG_TO_ID.get(slug);
      if (!tradeId) return null;
      const isActive = isTradeActiveInPhase(slug, phase);
      const tradeMatch = {
        permit_num: permit.permit_num,
        revision_num: permit.revision_num,
        trade_id: tradeId,
        trade_slug: slug,
        tier: 1,
        confidence: 0.80,
        is_active: isActive,
        phase,
      };
      tradeMatch.lead_score = calculateLeadScore(permit, tradeMatch, phase);
      return tradeMatch;
    }).filter(Boolean);
  }

  // Step 2: Tag-trade matrix matches (Tier 2)
  const scopeTags = permit.scope_tags || [];
  const merged = new Map(ruleMap); // start with rule matches

  if (scopeTags.length > 0) {
    const tagResults = lookupTradesForTags(scopeTags);
    for (const { slug, confidence } of tagResults) {
      const tradeId = SLUG_TO_ID.get(slug);
      if (!tradeId) continue; // skip trades not in the 20-trade list
      const isActive = isTradeActiveInPhase(slug, phase);
      const tradeMatch = {
        permit_num: permit.permit_num,
        revision_num: permit.revision_num,
        trade_id: tradeId,
        trade_slug: slug,
        tier: 2,
        confidence,
        is_active: isActive,
        phase,
      };
      tradeMatch.lead_score = calculateLeadScore(permit, tradeMatch, phase);

      const existing = merged.get(slug);
      if (!existing || existing.confidence < confidence) {
        merged.set(slug, tradeMatch);
      }
    }
  }

  // Step 3: Work-field fallback if no matches
  if (merged.size === 0) {
    const fb = getWorkFallback(permit.work);
    for (const slug of fb.slugs) {
      const tradeId = SLUG_TO_ID.get(slug);
      if (!tradeId) continue;
      const isActive = isTradeActiveInPhase(slug, phase);
      const tradeMatch = {
        permit_num: permit.permit_num,
        revision_num: permit.revision_num,
        trade_id: tradeId,
        trade_slug: slug,
        tier: 1,
        confidence: fb.confidence,
        is_active: isActive,
        phase,
      };
      tradeMatch.lead_score = calculateLeadScore(permit, tradeMatch, phase);
      merged.set(slug, tradeMatch);
    }
  }

  return applyScopeLimit(Array.from(merged.values()), permit.permit_num, permit.work);
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

  const allRules = dbRules;
  console.log(`Total rules: ${allRules.length} (Tier 1 DB rules + tag-trade matrix + work-field fallback)`);

  // Count permits to classify
  const incrementalWhere = `
    WHERE NOT EXISTS (
      SELECT 1 FROM permit_trades pt
      WHERE pt.permit_num = p.permit_num AND pt.revision_num = p.revision_num
    )
    OR EXISTS (
      SELECT 1 FROM permit_trades pt
      WHERE pt.permit_num = p.permit_num AND pt.revision_num = p.revision_num
        AND p.last_seen_at > pt.classified_at
    )`;
  const whereClause = fullMode ? '' : incrementalWhere;

  const countResult = await pool.query(
    `SELECT COUNT(*) as total FROM permits p ${whereClause}`
  );
  const totalPermits = parseInt(countResult.rows[0].total, 10);
  console.log(`Mode: ${fullMode ? 'FULL (all permits)' : 'INCREMENTAL (new/changed only)'}`);
  console.log(`Permits to classify: ${totalPermits.toLocaleString()}`);
  console.log('');

  let processed = 0;
  let totalMatches = 0;
  let permitsWithTrades = 0;
  const offset = { value: 0 };
  const startTime = Date.now();

  while (offset.value < totalPermits) {
    const batch = await pool.query(
      `SELECT p.permit_num, p.revision_num, p.permit_type, p.structure_type, p.work,
              p.description, p.status, p.est_const_cost, p.issued_date, p.current_use, p.proposed_use,
              p.scope_tags
       FROM permits p ${whereClause}
       ORDER BY p.permit_num, p.revision_num
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

    // Batch insert — sub-batch to stay under 65535 param limit (8 params per row → max 8000 rows)
    const MAX_ROWS_PER_INSERT = 4000;
    for (let i = 0; i < insertParams.length; i += MAX_ROWS_PER_INSERT) {
      const chunk = insertParams.slice(i, i + MAX_ROWS_PER_INSERT);
      const valChunk = insertValues.slice(i * 8, (i + MAX_ROWS_PER_INSERT) * 8);
      // Re-number params for this chunk
      let pIdx = 1;
      const renumbered = [];
      for (let r = 0; r < chunk.length; r++) {
        renumbered.push(`($${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++})`);
      }
      await pool.query(
        `INSERT INTO permit_trades (permit_num, revision_num, trade_id, tier, confidence, is_active, phase, lead_score)
         VALUES ${renumbered.join(', ')}
         ON CONFLICT (permit_num, revision_num, trade_id)
         DO UPDATE SET tier = EXCLUDED.tier, confidence = EXCLUDED.confidence,
                       is_active = EXCLUDED.is_active, phase = EXCLUDED.phase,
                       lead_score = EXCLUDED.lead_score, classified_at = NOW()`,
        valChunk
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
