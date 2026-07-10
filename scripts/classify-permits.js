#!/usr/bin/env node
/**
 * SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md
 * SPEC LINK: docs/specs/01-pipeline/80_taxonomies.md
 *
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
const pipeline = require('./lib/pipeline');
const { safeParsePositiveInt, safeParseFloat } = require('./lib/safe-math');
const { checkRealtorAvailable } = require('./lib/pipeline-realtor-availability');
// WF2 #2 (2026-05-08) — gate the tag-trade matrix on permit_type_class
// (mig 120 / Spec 80 §5). Stops the 12K+ wrong DST permit_trades + 14K+
// wrong Fire/Security Upgrade trade rows + 1.4K wrong realtor classifications
// surfaced by WF3 investigation 2026-05-08.
const {
  loadPermitTypeClassMap,
  classifyPermitType,
  filterTradesByClass,
  shouldAppendRealtor,
} = require('./lib/permit-type-classifier');
const { z } = require('zod');
const { loadMarketplaceConfigs, validateLogicVars } = require('./lib/config-loader');
const { deriveArchetypes, bundleSlugsFor } = require('./lib/archetypes');
// Spec 80 §5.B.5 archetype bundle prior. Deprecated trades (kept in the vocab but
// never bundle-emitted, Spec 80 §5.B.6) — temporary-fencing only. The JS TRADES list
// carries no `kind`, so the deprecated set is maintained explicitly here (mirrors the
// DEPRECATED_SLUGS derived from trades.ts kind on the TS side).
const DEPRECATED_TRADE_SLUGS = new Set(['temporary-fencing']);
const BUNDLE_TIER_CONFIDENCE_DEFAULT = 0.55;
// P16 16C (Spec 80 §5.C) — the lean scope-mapped inference layer. mapToLines detects the cost
// line(s); LINE_TRADE_COMPLEMENT supplies the lean, inspection-calibrated trade complement
// (16B GO gate 2026-07-10: hold-out recall 61.4% / prec(insp) 70.5% / mean 10.2). scripts→src
// require is the sanctioned direction (precedent: compute-cost-estimates.js requires the Brain).
const { mapToLines, complementTradesFor, LINE_TRADE_COMPLEMENT } = require('../src/features/leads/lib/archetype-cost-map');
// [FAB4] — inference-tier confidence. DESCRIPTIVE ONLY: serving/ranking authority is
// attachment_basis, never this value (clears the feed's ≥0.5 floor; sits below the 0.55
// tag-matrix band; no serving logic may depend on it).
const INFERENCE_TIER_CONFIDENCE = 0.50;
// P16 16F [D7 bands — GLOBAL-band resolution, ratified panel fold]: the flat per-archetype
// FAIL>13 would trip on build lines BY DESIGN (the honest max_build/coa_build complements are
// 16 trades; addition 12; laneway/garden 11), so the band governs the CORPUS-WIDE mean of
// active trades per permit-with-trades (16B whole-corpus mean attached 10.6 passes; the
// eval-corpus band was [8,11]). Per-line spikes are watched via the p95/max companion rows.
// Values mirror docs/specs/_contracts.json `p16_gate.mean_warn/mean_fail` (contracts lock).
const INFERENCE_MEAN_WARN = 11;
const INFERENCE_MEAN_FAIL = 13;
// [FAB2] — the 13 trades measured 0-active corpus-wide (P14 evaluation, Spec 80 §5.C).
// The FAIL band = the subset a 16B-authored complement legitimately COVERS (derived FROM
// LINE_TRADE_COMPLEMENT at runtime, never hand-maintained); the remainder is the enumerated
// WARN/INFO band (no line honestly implies them — accepted or routed elsewhere).
// temporary-fencing is deprecated-for-emission and deliberately NOT in this list (D8d).
const STARVED_TRADE_SLUGS = [
  'caulking', 'decking-fences', 'eavestrough-siding', 'millwork-cabinetry', 'overhead-doors',
  'pool-installation', 'security', 'site-maintenance', 'site-preparation', 'solar',
  'stone-countertops', 'tiling', 'trim-work',
];
// Spec 80 §5.B — product classifier (wire the dormant permit_products). Tag-driven
// (mirror of src/lib/classification/classifier.ts classifyProducts); the archetype
// {products} bundle is a deferred enhancement (review_followups 80-vnext-P2).
const { lookupProductsForTags } = require('./lib/tag-product-matrix');
const PRODUCT_TAG_CONFIDENCE = 0.75;   // direct scope_tag -> product hit
const PRODUCT_BUNDLE_CONFIDENCE = 0.45; // archetype-implied product (bundle prior; below tag hits)
const manifest = require('./manifest.json');

const ADVISORY_LOCK_ID = 88;

const BATCH_SIZE = 1000;

// cov_* vocabulary-coverage thresholds (Spec 30 §3 / 48 §3.5 — the cov_ primitive).
const LOGIC_VARS_SCHEMA = z
  .object({
    vocab_coverage_pass_pct: z.coerce.number().int().min(0).max(100),
    vocab_coverage_warn_pct: z.coerce.number().int().min(0).max(100),
    // Spec 80 §5.B.5 — bundle-tier confidence for archetype-implied trades.
    archetype_bundle_confidence: z.coerce.number().min(0).max(1).default(0.55),
    // P16 §5.C [BUG-6] — hard gate for the lean inference layer (0 = OFF, evidence-only).
    p16_inference_layer_enabled: z.coerce.number().int().min(0).max(1).default(0),
  })
  .passthrough()
  .refine((d) => d.vocab_coverage_warn_pct < d.vocab_coverage_pass_pct, {
    message: 'vocab_coverage_warn_pct must be strictly less than vocab_coverage_pass_pct',
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
  { id: 21, slug: 'trim-work' },
  { id: 22, slug: 'millwork-cabinetry' },
  { id: 23, slug: 'tiling' },
  { id: 24, slug: 'stone-countertops' },
  { id: 25, slug: 'decking-fences' },
  { id: 26, slug: 'eavestrough-siding' },
  { id: 27, slug: 'pool-installation' },
  { id: 28, slug: 'solar' },
  { id: 29, slug: 'security' },
  { id: 30, slug: 'temporary-fencing' },
  { id: 31, slug: 'caulking' },
  { id: 32, slug: 'drain-plumbing' },
  // Spec 80 v-next (2026-06-17). realtor (33) stays OUT — it is a persona the
  // permit classifier does not emit (handled in the lifecycle/forecast path).
  { id: 34, slug: 'overhead-doors' },
  { id: 36, slug: 'site-preparation' },
  { id: 37, slug: 'site-maintenance' },
];

const TRADE_BY_ID = new Map(TRADES.map(t => [t.id, t]));

// ---------------------------------------------------------------------------
// Phase determination
// ---------------------------------------------------------------------------
const PHASE_TRADES = {
  early_construction: ['excavation','shoring','demolition','concrete','waterproofing','drain-plumbing','temporary-fencing','site-preparation','site-maintenance'],
  structural: ['framing','structural-steel','masonry','concrete','roofing','plumbing','hvac','electrical','elevator','fire-protection','site-maintenance'],
  finishing: ['insulation','drywall','painting','flooring','glazing','fire-protection','plumbing','hvac','electrical','trim-work','millwork-cabinetry','tiling','stone-countertops','caulking','solar','security','overhead-doors','site-maintenance'],
  landscaping: ['landscaping','painting','decking-fences','eavestrough-siding','pool-installation','site-maintenance'],
};

function determinePhase(permit, runAt) {
  const status = (permit.status || '').toLowerCase();
  if (status.includes('completed') || status.includes('closed')) return 'landscaping';
  if (status.includes('application') || status.includes('not started')) return 'early_construction';

  if (!permit.issued_date) return 'early_construction';
  const issued = new Date(permit.issued_date);
  // Use RUN_AT (DB clock) not Date.now() to prevent Midnight Cross drift —
  // same run timestamp for all permits in this batch.
  const months = Math.floor((runAt.getTime() - issued.getTime()) / (1000 * 60 * 60 * 24 * 30));

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

function calculateLeadScore(permit, match, phase, runAt) {
  let score = statusBaseScore(permit.status);

  // Cost boost (0-15)
  const cost = permit.est_const_cost != null ? safeParseFloat(permit.est_const_cost, 'est_const_cost') : 0;
  if (cost >= 5000000) score += 15;
  else if (cost >= 1000000) score += 12;
  else if (cost >= 500000) score += 10;
  else if (cost >= 100000) score += 7;
  else if (cost >= 50000) score += 4;

  // Freshness boost (0-20) — use RUN_AT (DB clock) for Midnight Cross consistency
  if (permit.issued_date) {
    const days = Math.floor((runAt.getTime() - new Date(permit.issued_date).getTime()) / (1000 * 60 * 60 * 24));
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

  // Staleness penalty (0-20) — use RUN_AT (DB clock) for Midnight Cross consistency
  if (permit.issued_date) {
    const days = Math.floor((runAt.getTime() - new Date(permit.issued_date).getTime()) / (1000 * 60 * 60 * 24));
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

// PERMIT_TYPE_CEILING (P16 §5.C / D2) — a `permit_type`-STRING family cap; the complement to the
// `permit_num`-CODE NARROW_SCOPE_CODES above. Fires ONLY on the plumbing/mechanical/drain permit_types
// whose permit_num carries NO narrow code (the disjoint residual — code-carrying permits early-return
// via the isNarrowScope branch, unchanged). Families mirror the single-trade NARROW_SCOPE_CODES entries
// (PLB→plumbing, HVA→hvac, DRN→drain-plumbing) so the ceiling and the code-path stay consistent.
// Applied to the broad-scope `final` set (after applyScopeLimit, before applyClassGating) so the realtor
// append + class gating still run. Evidence-minimal by design (D2): 0 movement on code-carrying permits.
const PERMIT_TYPE_CEILING = {
  'Plumbing(PS)': ['plumbing'],
  'Mechanical(MS)': ['hvac'],
  'Drain and Site Service': ['drain-plumbing'],
};
/** The permit_type family ceiling, or null when the permit_type has no family cap. */
function permitTypeCeilingFor(permitType) {
  return (permitType && PERMIT_TYPE_CEILING[permitType]) || null;
}

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

// Per Spec 91 §1.2 + §3.5 item 4 (option (a) MANDATED): every permit
// gets a realtor TradeMatch alongside any construction-trade matches.
// This helper is called at every return path in classifyPermit() so the
// JS-side behavior mirrors the TS-side classifier (CLAUDE.md §7 dual
// code path mandate). Without this, JS callers of classifyPermit would
// receive a different shape than TS callers.
const REALTOR_TRADE_ID_JS = 33;
const REALTOR_TRADE_SLUG_JS = 'realtor';

function appendRealtorMatch(matches, permit, phase, runAt, realtorAvailable) {
  // WF3 startup-guard: skip the realtor append when migration 118 hasn't
  // been applied (trades.id=33 missing → FK constraint would crash on
  // INSERT). Caller is responsible for setting `realtorAvailable` from
  // a one-time DB lookup at script-startup. See
  // scripts/lib/pipeline-realtor-availability.js.
  if (!realtorAvailable) return matches;
  if (!permit.permit_num || !permit.revision_num) return matches;
  const realtorMatch = {
    permit_num: permit.permit_num,
    revision_num: permit.revision_num,
    trade_id: REALTOR_TRADE_ID_JS,
    trade_slug: REALTOR_TRADE_SLUG_JS,
    tier: 1,
    confidence: 1.0,
    is_active: true,
    phase,
  };
  realtorMatch.lead_score = calculateLeadScore(permit, realtorMatch, phase, runAt);
  return [...matches, realtorMatch];
}

/**
 * Apply WF2 #2 (mig 120 / Spec 80 §5) class-based gating to a matches array.
 * Filters the trade matrix per `permit_type_class`, then conditionally appends
 * the realtor TradeMatch only for construction-class permits.
 *
 * `permitClass` defaults to 'unclassified' (safe-skip) when the caller doesn't
 * resolve it — protects future call sites from accidentally bypassing the gate.
 */
function applyClassGating(matches, permit, phase, runAt, realtorAvailable, permitClass) {
  const filtered = filterTradesByClass(matches, permitClass);
  // WF3 2026-05-09 — 3-axis gate: class + permit_type + scope_tags. The
  // construction class alone is too coarse (mig 120 bundles trade-only
  // permits, demolition, and non-residential). See Spec 80 §5 Realtor
  // sub-gating sub-table.
  if (!shouldAppendRealtor(permitClass, permit.permit_type, permit.scope_tags)) return filtered;
  return appendRealtorMatch(filtered, permit, phase, runAt, realtorAvailable);
}

function classifyPermit(permit, rules, runAt, realtorAvailable = true, permitClass = 'unclassified', inferenceEnabled = false) {
  const phase = determinePhase(permit, runAt);
  const code = extractPermitCode(permit.permit_num);
  const isNarrowScope = code != null && NARROW_SCOPE_CODES[code] != null;

  // Step 1: Tier 1 rule matches
  const ruleMap = new Map();
  for (const rule of rules) {
    if (!rule.is_active) continue;
    if (rule.tier !== 1) continue; // Only Tier 1 rules — kept in sync with classifier.ts (§7.1)
    const fieldValue = getFieldValue(permit, rule.match_field);
    const { matched } = fieldMatches(fieldValue, rule.match_pattern, rule.tier);
    if (!matched) continue;

    const trade = TRADE_BY_ID.get(rule.trade_id);
    if (!trade) continue;

    const confidence = rule.confidence > 0 ? rule.confidence : 0.95;
    const tradeMatch = {
      permit_num: permit.permit_num,
      revision_num: permit.revision_num,
      trade_id: trade.id,
      trade_slug: trade.slug,
      tier: rule.tier,
      confidence,
      is_active: true,
      phase,
    };
    tradeMatch.lead_score = calculateLeadScore(permit, tradeMatch, phase, runAt);

    const existing = ruleMap.get(trade.slug);
    if (!existing || existing.confidence < confidence) {
      ruleMap.set(trade.slug, tradeMatch);
    }
  }

  // Narrow-scope permits: Tier 1 rule matches, with code-based fallback
  if (isNarrowScope) {
    const limited = applyScopeLimit(Array.from(ruleMap.values()), permit.permit_num, permit.work);
    if (limited.length > 0) return applyClassGating(limited, permit, phase, runAt, realtorAvailable, permitClass);

    // Fallback: assign code's allowed trades at 0.80 confidence
    const allowed = NARROW_SCOPE_CODES[code];
    const fallbackMatches = allowed.map((slug) => {
      const tradeId = SLUG_TO_ID.get(slug);
      if (!tradeId) return null;
      const tradeMatch = {
        permit_num: permit.permit_num,
        revision_num: permit.revision_num,
        trade_id: tradeId,
        trade_slug: slug,
        tier: 1,
        confidence: 0.80,
        is_active: true,
        phase,
        fromFallback: true, // narrow-code inference, not a direct tag/rule hit (precision counter)
      };
      tradeMatch.lead_score = calculateLeadScore(permit, tradeMatch, phase, runAt);
      return tradeMatch;
    }).filter(Boolean);
    return applyClassGating(fallbackMatches, permit, phase, runAt, realtorAvailable, permitClass);
  }

  // Step 2: Tag-trade matrix matches (Tier 2)
  const scopeTags = permit.scope_tags || [];
  const merged = new Map(ruleMap); // start with rule matches

  if (scopeTags.length > 0) {
    const tagResults = lookupTradesForTags(scopeTags);
    for (const { slug, confidence } of tagResults) {
      const tradeId = SLUG_TO_ID.get(slug);
      if (!tradeId) continue; // skip trades not in the 20-trade list
      const tradeMatch = {
        permit_num: permit.permit_num,
        revision_num: permit.revision_num,
        trade_id: tradeId,
        trade_slug: slug,
        tier: 2,
        confidence,
        is_active: true,
        phase,
      };
      tradeMatch.lead_score = calculateLeadScore(permit, tradeMatch, phase, runAt);

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
      const tradeMatch = {
        permit_num: permit.permit_num,
        revision_num: permit.revision_num,
        trade_id: tradeId,
        trade_slug: slug,
        tier: 1,
        confidence: fb.confidence,
        is_active: true,
        phase,
        fromFallback: true, // work-field inference, not a direct tag/rule hit (precision counter)
      };
      tradeMatch.lead_score = calculateLeadScore(permit, tradeMatch, phase, runAt);
      merged.set(slug, tradeMatch);
    }
  }

  // Step 4 (P16 16C, Spec 80 §5.C): lean scope-mapped INFERENCE layer — takes the retired coarse
  // archetype bundle prior's slot. [GRD-1 disposition]: the old loop CANNOT be retained beside this
  // one — it filled `merged` with is_active=false slugs FIRST, so the merged.has() guard would make
  // the inference layer SKIP exactly the overlap set it exists to re-activate. The P13-3 fence
  // (804d90f; introducing literal from feature commit f7a604a, no Severity/Lesson-routing footer)
  // is KNOWINGLY extended, not silently retired: bundle DEMOTION evolves into bundle RETIREMENT +
  // a measured lean inference tier (16B GO gate). HARD-GATED on p16_inference_layer_enabled
  // [BUG-6]: OFF → this block emits NOTHING (evidence-only, P13-3 posture byte-preserved).
  // Emitted BEFORE applyScopeLimit + the permit_type ceiling + applyClassGating [GRD-2], so a
  // narrow/class-gated permit gains NO inference trades. attached = evidence ∪ lean_inference (D1):
  // the merged.has(slug) guard keeps every evidence hit's slot. A permit whose scope maps to NO
  // cost line (mapToLines → null, the T4 selector) stays evidence-only by construction.
  if (inferenceEnabled) {
    const mapped = mapToLines({
      projectType: permit.project_type,
      scopeTags,
      structureType: permit.structure_type,
      isCoa: false,
      activeTradeCount: merged.size, // evidence count — the W7 escalation input
    });
    if (mapped && mapped.lines) {
      for (const slug of complementTradesFor(mapped.lines)) {
        if (merged.has(slug)) continue; // an evidence hit already won the slot (D1 union)
        const tradeId = SLUG_TO_ID.get(slug);
        if (!tradeId) continue;
        const tradeMatch = {
          permit_num: permit.permit_num,
          revision_num: permit.revision_num,
          trade_id: tradeId,
          trade_slug: slug,
          tier: 2,
          confidence: INFERENCE_TIER_CONFIDENCE,
          // P16 D1/D5: inference rows SERVE (is_active=true) but rank below evidence BY BASIS —
          // consumers read attachment_basis, not the 0.50 confidence value [FAB4].
          is_active: true,
          attachment_basis: 'inference',
          phase,
          fromLines: mapped.lines, // transient (not persisted) — feeds the FB-line watch counter
        };
        tradeMatch.lead_score = calculateLeadScore(permit, tradeMatch, phase, runAt);
        merged.set(slug, tradeMatch);
      }
    }
  }

  let final = applyScopeLimit(Array.from(merged.values()), permit.permit_num, permit.work);
  // P16 D2 — permit_type family ceiling for the code-LESS plumbing/mechanical/drain residual
  // (isNarrowScope permits already early-returned above, so this only bites broad-scope permits
  // whose permit_type is by-definition single-family). MUST NOT touch code-carrying permits.
  const ceiling = permitTypeCeilingFor(permit.permit_type);
  if (ceiling) final = final.filter((m) => ceiling.includes(m.trade_slug));
  return applyClassGating(final, permit, phase, runAt, realtorAvailable, permitClass);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const fullMode = pipeline.isFullMode();

pipeline.run('classify-permits', async (pool) => {
  // §R5 — cov_* thresholds validated BEFORE acquiring the lock (matches classify-coa-trades).
  // logicVars is closed over by the lock callback below (used at emitSummary).
  const { logicVars } = await loadMarketplaceConfigs(pool, 'classify-permits');
  const vocabValidation = validateLogicVars(logicVars, LOGIC_VARS_SCHEMA, 'classify-permits');
  if (!vocabValidation.valid) {
    throw new Error(`logicVars validation failed: ${vocabValidation.errors.join('; ')}`);
  }
  // Spec 80 §5.B.5 — bundle-tier confidence (operator-tunable; default if the
  // logic_variable is absent in the DB). Post-16C the bundle prior is retired; the value
  // still anchors the strong/weak signal counters (a hit above it = direct evidence).
  const archetypeBundleConfidence =
    Number(logicVars.archetype_bundle_confidence) || BUNDLE_TIER_CONFIDENCE_DEFAULT;
  // P16 §5.C [BUG-6] — the lean inference layer's hard gate. OFF (0, the seeded default) →
  // classifyPermit emits evidence-only; ON (1, flipped in 16F after the 16E consumer contract) →
  // lean inference rows emit at is_active=true / attachment_basis='inference'.
  const inferenceEnabled = Number(logicVars.p16_inference_layer_enabled) === 1;
  // Product vocab (slug -> {id, name}) loaded once from product_groups (Spec 80 §5.B.3).
  // Single source of truth — the JS classifier does NOT duplicate the product vocab.
  const productGroupsRes = await pool.query('SELECT id, slug, name FROM product_groups');
  const productMap = new Map(productGroupsRes.rows.map((r) => [r.slug, { id: r.id, name: r.name }]));

  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
    const RUN_AT = await pipeline.getDbTimestamp(pool);
    const startTime = Date.now();

  pipeline.log.info('[classify-permits]', 'Trade classification — inferred from permit metadata, not actual building plans');

  // WF3 startup-guard: Cycle 7 added unconditional realtor classification
  // (trade_id=33). If migration 118 hasn't been applied, the trades.id=33
  // row is missing and the FK constraint `permit_trades_trade_id_fkey`
  // crashes the pipeline mid-run. Probe the table once at startup; pass
  // the result to classifyPermit so it skips the realtor append cleanly.
  const realtorAvailable = await checkRealtorAvailable(pool);
  if (!realtorAvailable) {
    pipeline.log.warn(
      '[classify-permits]',
      'Realtor trade row (trades.id=33) NOT FOUND — apply migration 118_realtor_trade.sql to enable realtor classification. Continuing with construction-trade classification only.',
    );
  }

  // WF2 #2 (mig 120 / Spec 80 §5) — load permit_type class map at startup
  // (Spec 47 §R5 startup-guard pattern). The classifier filters trade matches
  // per class: construction → full matrix; administrative/unclassified → empty;
  // safety_upgrade → electrical+fire-protection only; signage → reserved.
  // Single ~25-row table read; PK lookup latency 0.071ms (verified WF2 #1).
  const permitClassMap = await loadPermitTypeClassMap(pool);
  pipeline.log.info(
    '[classify-permits]',
    `Loaded ${permitClassMap.size} permit_type class entries`,
  );

  // Load rules from DB
  const rulesResult = await pool.query(
    'SELECT id, trade_id, tier, match_field, match_pattern, confidence, phase_start, phase_end, is_active FROM trade_mapping_rules WHERE is_active = true ORDER BY tier, id'
  );
  const dbRules = rulesResult.rows;
  pipeline.log.info('[classify-permits]', `Loaded ${dbRules.length} active rules`);

  const allRules = dbRules;

  // Count permits to classify
  // Timestamp-based incremental: evaluate permits never classified or changed since last classification.
  // Avoids infinite re-evaluation of unmatchable permits (the NOT EXISTS pattern would loop forever
  // on permits that yield zero trades, since no child row is inserted to break the cycle).
  const incrementalWhere = `
    WHERE trade_classified_at IS NULL
       OR trade_classified_at < last_seen_at`;
  const whereClause = fullMode ? '' : incrementalWhere;

  const countResult = await pool.query(
    `SELECT COUNT(*) as total FROM permits p ${whereClause}`
  );
  const totalPermits = safeParsePositiveInt(countResult.rows[0].total, 'total');
  pipeline.log.info('[classify-permits]', `Mode: ${fullMode ? 'FULL' : 'INCREMENTAL'}, permits to classify: ${totalPermits.toLocaleString()}`);

  // Count truly new permits (never classified before) for accurate reporting
  const newCountResult = await pool.query(
    `SELECT COUNT(*) as cnt FROM permits WHERE trade_classified_at IS NULL`
  );
  const trulyNewPermits = safeParsePositiveInt(newCountResult.rows[0].cnt, 'cnt');

  let processed = 0;
  let totalMatches = 0;
  let permitsWithTrades = 0;
  let dbUpdated = 0;
  let totalProducts = 0;
  let permitsWithProducts = 0;
  let productsDbUpdated = 0;
  // Precision signal (Spec 80 §5.B.5 — guards against cov_trade_vocab going green on
  // bundle-only emission): distinct trades seen with a STRONG signal (confidence above
  // the bundle tier) vs trades only ever seen at/below it (bundle or work-fallback).
  const strongSignalTradeIds = new Set();
  const weakSignalTradeIds = new Set();
  // WF2 #2 — per-class telemetry for operator visibility (worktree review #4).
  // Surfaces in audit_table: counts of permits processed per permit_type_class
  // so operators can confirm e.g. "3,500 administrative permits emitted zero
  // trades" rather than silently failing for another reason.
  const classCounters = {
    construction: 0,
    signage: 0,
    administrative: 0,
    safety_upgrade: 0,
    unclassified: 0,
  };
  // P16 D2 — count permits where the permit_type ceiling legitimately bites (broad-scope +
  // ceiling permit_type; code-carrying narrow permits early-return before the ceiling applies).
  let permitTypeCeilingApplied = 0;
  // P16 16C — inference-layer telemetry (feeds the 16F §R10 bands): rows emitted at
  // attachment_basis='inference', permits gaining ≥1 inference row, and the FB-line
  // (max_build/coa_build) share — the stratum the 122-permit corpus could NOT validate
  // (zero large new-builds in the hold-out; watched, not assumed — Gemini fold).
  let inferenceRowsEmitted = 0;
  let permitsWithInference = 0;
  let fbLineInferenceRows = 0;
  let lastPermitNum = '';
  let lastRevisionNum = '';

  while (true) {
    // Keyset pagination — O(1) per batch via index seek on (permit_num, revision_num)
    // In incremental mode, the WHERE clause has OR conditions, so the cursor must be
    // wrapped in a separate AND (...) to avoid operator precedence issues.
    let batchWhere;
    let params;
    if (fullMode) {
      // Full mode: no incremental filter, just cursor
      batchWhere = lastPermitNum
        ? `WHERE (p.permit_num, p.revision_num) > ($2, $3)`
        : '';
      params = lastPermitNum ? [BATCH_SIZE, lastPermitNum, lastRevisionNum] : [BATCH_SIZE];
    } else {
      // Incremental mode: wrap incremental filter in parens, add cursor
      const cursorClause = lastPermitNum
        ? `AND (p.permit_num, p.revision_num) > ($2, $3)`
        : '';
      batchWhere = `WHERE (${incrementalWhere.replace(/^\s*WHERE\s+/i, '')}) ${cursorClause}`;
      params = lastPermitNum ? [BATCH_SIZE, lastPermitNum, lastRevisionNum] : [BATCH_SIZE];
    }
    const batch = await pool.query(
      `SELECT p.permit_num, p.revision_num, p.permit_type, p.structure_type, p.work,
              p.description, p.status, p.est_const_cost, p.issued_date, p.current_use, p.proposed_use,
              p.scope_tags, p.project_type
       FROM permits p ${batchWhere}
       ORDER BY p.permit_num ASC, p.revision_num ASC
       LIMIT $1`,
      params
    );

    if (batch.rows.length === 0) break;
    const lastRow = batch.rows[batch.rows.length - 1];
    lastPermitNum = lastRow.permit_num;
    lastRevisionNum = lastRow.revision_num;

    const insertValues = [];
    const insertParams = [];
    const productInsertValues = []; // flat [permit_num, revision_num, product_id, slug, name, confidence] × N
    let paramIdx = 1;

    for (const permit of batch.rows) {
      // classifyPermit now includes a realtor TradeMatch in its return
      // array per Spec 91 §1.2 + §3.5 item 4 (option (a) MANDATED). The
      // realtor append is internal to classifyPermit so JS + TS classifiers
      // expose the same shape (CLAUDE.md §7 dual code path mandate).
      // WF2 #2 (2026-05-08) — also threads `permitClass` through so the
      // classifier filters non-construction trade matches per Spec 80 §5.
      const permitClass = classifyPermitType(permitClassMap, permit.permit_type);
      classCounters[permitClass] = (classCounters[permitClass] ?? 0) + 1;
      // P16 D2 telemetry — ceiling bites only broad-scope permits (narrow codes early-return).
      const ceilCode = extractPermitCode(permit.permit_num);
      const ceilNarrow = ceilCode != null && NARROW_SCOPE_CODES[ceilCode] != null;
      if (!ceilNarrow && permitTypeCeilingFor(permit.permit_type)) permitTypeCeilingApplied++;
      const matches = classifyPermit(permit, allRules, RUN_AT, realtorAvailable, permitClass, inferenceEnabled);
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

        let permitHadInference = false;
        for (const m of dedupedMatches) {
          if (m.attachment_basis === 'inference') {
            inferenceRowsEmitted++;
            permitHadInference = true;
            if (Array.isArray(m.fromLines) && (m.fromLines.includes('max_build') || m.fromLines.includes('coa_build'))) {
              fbLineInferenceRows++;
            }
          }
        }
        if (permitHadInference) permitsWithInference++;

        for (const m of dedupedMatches) {
          // STRONG = a direct tag/rule hit above the bundle tier. A bundle row (conf ==
          // bundle-tier) OR any fallback inference (work-field / narrow-code, even at 0.85)
          // is WEAK — fallback is not direct evidence (output-review fix).
          if (m.confidence > archetypeBundleConfidence && !m.fromFallback) strongSignalTradeIds.add(m.trade_id);
          else weakSignalTradeIds.add(m.trade_id);
          insertParams.push(
            `($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++})`
          );
          // P16 D4 — attachment_basis provenance. In 16A every emitted row derives it from is_active
          // (evidence path = active; the coarse bundle-prior = inactive = 'inference'), matching the
          // mig-216 backfill. 16C sets m.attachment_basis explicitly on lean-inference rows, which
          // takes precedence here.
          const basis = m.attachment_basis || (m.is_active ? 'evidence' : 'inference');
          insertValues.push(
            m.permit_num, m.revision_num, m.trade_id, m.tier,
            m.confidence, m.is_active, m.phase, m.lead_score, basis
          );
        }
      }

      // Product classification (Spec 80 §5.B): tag-driven (0.75) + the §5.B.5
      // archetype {products} bundle (bundle-tier). NARROW-SCOPE GUARD: companion
      // sub-permits (PLB/MS/DR/DM/…) repeat the whole project description, so their
      // tags/archetype look like a full build. Products belong on the PRIMARY permit,
      // not duplicated across companions — so skip products for narrow-scope codes,
      // exactly as the trade path emits only the 1 narrow trade. Mirror of classifyProducts.
      const pCode = extractPermitCode(permit.permit_num);
      const pNarrow = pCode != null && NARROW_SCOPE_CODES[pCode] != null;
      let permitProductCount = 0;
      if (!pNarrow) {
        const productConf = new Map();
        for (const slug of lookupProductsForTags(permit.scope_tags || [])) {
          productConf.set(slug, PRODUCT_TAG_CONFIDENCE);
        }
        const pArchetypes = deriveArchetypes(permit.project_type, permit.scope_tags || []);
        const { products: bundleProducts } = bundleSlugsFor(pArchetypes, DEPRECATED_TRADE_SLUGS);
        for (const slug of bundleProducts) {
          if (!productConf.has(slug)) productConf.set(slug, PRODUCT_BUNDLE_CONFIDENCE);
        }
        for (const [slug, conf] of productConf) {
          const pg = productMap.get(slug);
          if (!pg) continue;
          productInsertValues.push(permit.permit_num, permit.revision_num, pg.id, slug, pg.name, conf);
          permitProductCount++;
        }
      }
      if (permitProductCount > 0) { permitsWithProducts++; totalProducts += permitProductCount; }
    }

    // Collect permit keys for ghost trade cleanup
    const batchPermitKeys = batch.rows.map(p => `${p.permit_num}--${p.revision_num}`);

    // Batch insert — sub-batch to stay under 65535 param limit (9 params per row + 1 RUN_AT → max 4000 rows)
    const COLS_PER_ROW = 9; // P16: was 8; +attachment_basis
    const MAX_ROWS_PER_INSERT = 4000;
    for (let i = 0; i < insertParams.length; i += MAX_ROWS_PER_INSERT) {
      const chunk = insertParams.slice(i, i + MAX_ROWS_PER_INSERT);
      // Append RUN_AT as the last param; its index = chunk.length * COLS_PER_ROW + 1
      const valChunk = [...insertValues.slice(i * COLS_PER_ROW, (i + MAX_ROWS_PER_INSERT) * COLS_PER_ROW), RUN_AT];
      const runAtIdx = chunk.length * COLS_PER_ROW + 1;
      // Re-number params for this chunk
      let pIdx = 1;
      const renumbered = [];
      for (let r = 0; r < chunk.length; r++) {
        renumbered.push(`($${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++})`);
      }
      await pipeline.withTransaction(pool, async (client) => {
        const result = await client.query(
          `INSERT INTO permit_trades (permit_num, revision_num, trade_id, tier, confidence, is_active, phase, lead_score, attachment_basis)
           VALUES ${renumbered.join(', ')}
           ON CONFLICT (permit_num, revision_num, trade_id)
           DO UPDATE SET tier = EXCLUDED.tier, confidence = EXCLUDED.confidence,
                         is_active = EXCLUDED.is_active, phase = EXCLUDED.phase,
                         lead_score = EXCLUDED.lead_score, attachment_basis = EXCLUDED.attachment_basis,
                         classified_at = $${runAtIdx}::timestamptz
           RETURNING permit_num`,
          valChunk
        );
        dbUpdated += result.rows.length;
      });
    }

    // Ghost cleanup + timestamp update in a single transaction for atomicity.
    // If this fails, the INSERTs above are already committed, but the timestamp
    // stays NULL — causing re-evaluation on next run (safe failure mode).
    const allNums = batch.rows.map(p => p.permit_num);
    const allRevs = batch.rows.map(p => p.revision_num);

    await pipeline.withTransaction(pool, async (client) => {
      // Ghost trade cleanup: delete trades that no longer match after reclassification.
      // Uses bulk unnest DELETE (single query) instead of per-permit loop to avoid N+1.
      const validTradeIds = new Map(); // "pnum--rev" -> Set<trade_id>
      for (let i = 0; i < insertValues.length; i += 9) { // P16: 9 cols/row (+attachment_basis)
        const key = `${insertValues[i]}--${insertValues[i + 1]}`;
        if (!validTradeIds.has(key)) validTradeIds.set(key, new Set());
        validTradeIds.get(key).add(insertValues[i + 2]);
      }

      // For permits that had matches, delete trades not in the current match set.
      // Builds (permit_num, revision_num) scope + valid trade_id tuples for bulk delete.
      // Cannot use unnest on 2D arrays (PostgreSQL flattens all dimensions), so we
      // delete all trades for affected permits then let the earlier UPSERT re-insert valid ones.
      const entries = Array.from(validTradeIds.entries());
      if (entries.length > 0) {
        const scopeNums = entries.map(([key]) => key.split('--')[0]);
        const scopeRevs = entries.map(([key]) => key.split('--')[1]);
        // Collect all valid (permit_num, revision_num, trade_id) tuples
        const keepNums = [];
        const keepRevs = [];
        const keepIds = [];
        for (const [key, ids] of entries) {
          const [pn, rv] = key.split('--');
          for (const tid of ids) {
            keepNums.push(pn);
            keepRevs.push(rv);
            keepIds.push(tid);
          }
        }
        await client.query(
          `DELETE FROM permit_trades pt
           WHERE (pt.permit_num, pt.revision_num) IN (
             SELECT unnest($1::text[]), unnest($2::text[])
           )
           AND NOT EXISTS (
             SELECT 1 FROM (
               SELECT unnest($3::text[]) AS kn, unnest($4::text[]) AS kr, unnest($5::int[]) AS ki
             ) keep
             WHERE keep.kn = pt.permit_num AND keep.kr = pt.revision_num AND keep.ki = pt.trade_id
           )`,
          [scopeNums, scopeRevs, keepNums, keepRevs, keepIds]
        );
      }

      // For permits that yielded ZERO matches, delete all existing trades
      const zeroMatchPermits = batch.rows.filter(p => {
        const key = `${p.permit_num}--${p.revision_num}`;
        return !validTradeIds.has(key);
      });
      if (zeroMatchPermits.length > 0) {
        const zeroNums = zeroMatchPermits.map(p => p.permit_num);
        const zeroRevs = zeroMatchPermits.map(p => p.revision_num);
        await client.query(
          `DELETE FROM permit_trades
           WHERE (permit_num, revision_num) IN (
             SELECT unnest($1::text[]), unnest($2::text[])
           )`,
          [zeroNums, zeroRevs]
        );
      }
    });

    // ── Product classification write (Spec 80 §5.B) — mirrors the trade path ──
    // Sub-batch UPSERT (6 params/row → 4000-row chunks under the 65535-param cap).
    const PROD_COLS = 6;
    const PROD_MAX_ROWS = 4000;
    for (let i = 0; i < productInsertValues.length; i += PROD_MAX_ROWS * PROD_COLS) {
      const chunkVals = productInsertValues.slice(i, i + PROD_MAX_ROWS * PROD_COLS);
      const rowCount = chunkVals.length / PROD_COLS;
      let pIdx = 1;
      const ph = [];
      for (let r = 0; r < rowCount; r++) {
        ph.push(`($${pIdx++},$${pIdx++},$${pIdx++},$${pIdx++},$${pIdx++},$${pIdx++})`);
      }
      await pipeline.withTransaction(pool, async (client) => {
        const res = await client.query(
          `INSERT INTO permit_products (permit_num, revision_num, product_id, product_slug, product_name, confidence)
           VALUES ${ph.join(',')}
           ON CONFLICT (permit_num, revision_num, product_id)
           DO UPDATE SET product_slug = EXCLUDED.product_slug, product_name = EXCLUDED.product_name,
                         confidence = EXCLUDED.confidence
           RETURNING permit_num`,
          chunkVals
        );
        productsDbUpdated += res.rows.length;
      });
    }

    // Ghost cleanup for products — delete products no longer matching, and all
    // products for permits that yielded zero products this run. Mirrors trades.
    await pipeline.withTransaction(pool, async (client) => {
      const validProductIds = new Map(); // "pnum--rev" -> Set<product_id>
      for (let i = 0; i < productInsertValues.length; i += PROD_COLS) {
        const key = `${productInsertValues[i]}--${productInsertValues[i + 1]}`;
        if (!validProductIds.has(key)) validProductIds.set(key, new Set());
        validProductIds.get(key).add(productInsertValues[i + 2]);
      }
      const pEntries = Array.from(validProductIds.entries());
      if (pEntries.length > 0) {
        const scopeNums = [], scopeRevs = [], keepNums = [], keepRevs = [], keepIds = [];
        for (const [key, ids] of pEntries) {
          const [pn, rv] = key.split('--');
          scopeNums.push(pn); scopeRevs.push(rv);
          for (const id of ids) { keepNums.push(pn); keepRevs.push(rv); keepIds.push(id); }
        }
        await client.query(
          `DELETE FROM permit_products pp
           WHERE (pp.permit_num, pp.revision_num) IN (SELECT unnest($1::text[]), unnest($2::text[]))
           AND NOT EXISTS (
             SELECT 1 FROM (
               SELECT unnest($3::text[]) AS kn, unnest($4::text[]) AS kr, unnest($5::int[]) AS ki
             ) keep
             WHERE keep.kn = pp.permit_num AND keep.kr = pp.revision_num AND keep.ki = pp.product_id
           )`,
          [scopeNums, scopeRevs, keepNums, keepRevs, keepIds]
        );
      }
      const zeroProductPermits = batch.rows.filter(
        (p) => !validProductIds.has(`${p.permit_num}--${p.revision_num}`)
      );
      if (zeroProductPermits.length > 0) {
        await client.query(
          `DELETE FROM permit_products
           WHERE (permit_num, revision_num) IN (SELECT unnest($1::text[]), unnest($2::text[]))`,
          [zeroProductPermits.map((p) => p.permit_num), zeroProductPermits.map((p) => p.revision_num)]
        );
      }
    });

    // Watermark LAST — set trade_classified_at only AFTER both trades AND products are
    // written + cleaned, so a crash mid-batch leaves the permit unmarked → re-processed
    // next run (idempotent UPSERTs) rather than marked-done with under-written products.
    // (Output-review fix: products previously wrote after the watermark committed.)
    await pipeline.withTransaction(pool, async (client) => {
      await client.query(
        `UPDATE permits SET trade_classified_at = $3::timestamptz
         WHERE (permit_num, revision_num) IN (
           SELECT unnest($1::text[]), unnest($2::text[])
         )`,
        [allNums, allRevs, RUN_AT]
      );
    });

    processed += batch.rows.length;

    if (processed % 10000 === 0 || processed >= totalPermits) {
      pipeline.progress('classify-permits', processed, totalPermits, startTime);
    }
  }

  const durationMs = Date.now() - startTime;
  pipeline.log.info('[classify-permits]', 'Classification complete', {
    processed,
    permits_with_trades: permitsWithTrades,
    total_matches: totalMatches,
    avg_trades: (totalMatches / Math.max(permitsWithTrades, 1)).toFixed(1),
    db_changes: dbUpdated,
    duration: `${(durationMs / 1000).toFixed(1)}s`,
  });

  // Build audit_table for trade classification observability
  // Cumulative coverage — run-specific rate is misleading in incremental mode
  const cumulativeResult = await pool.query(
    `SELECT
       (SELECT COUNT(DISTINCT (permit_num, revision_num)) FROM permit_trades) AS classified,
       (SELECT COUNT(*) FROM permits) AS total`
  );
  const cumulativeClassified = safeParsePositiveInt(cumulativeResult.rows[0].classified, 'classified');
  const cumulativeTotal = safeParsePositiveInt(cumulativeResult.rows[0].total, 'total');
  const classificationCoverage = cumulativeTotal > 0 ? (cumulativeClassified / cumulativeTotal) * 100 : 0;
  const avgTradesPerPermit = totalMatches / Math.max(permitsWithTrades, 1);

  // ── P16 16F §R10 bands (D7 + [FAB2] + [FAB1v2]) — CORPUS-WIDE post-run state ──
  // Cumulative queries (same convention as classification_coverage above): the bands govern
  // the standing corpus, not the run increment, so incremental runs stay honest.
  const distResult = await pool.query(
    `WITH per_permit AS (
       SELECT permit_num, revision_num,
              COUNT(*) FILTER (WHERE is_active) AS act,
              COUNT(*) FILTER (WHERE attachment_basis = 'evidence' AND is_active) AS ev
         FROM permit_trades
        GROUP BY permit_num, revision_num
     )
     SELECT round(avg(act) FILTER (WHERE act > 0), 2)  AS mean_active,
            percentile_disc(0.95) WITHIN GROUP (ORDER BY act) FILTER (WHERE act > 0) AS p95_active,
            max(act)                                    AS max_active,
            round(avg(ev)  FILTER (WHERE ev  > 0), 2)  AS mean_evidence
       FROM per_permit`,
  );
  const meanActive = safeParseFloat(distResult.rows[0].mean_active ?? '0', 'mean_active');
  const p95Active = Number(distResult.rows[0].p95_active ?? 0);
  const maxActive = Number(distResult.rows[0].max_active ?? 0);
  const meanEvidence = safeParseFloat(distResult.rows[0].mean_evidence ?? '0', 'mean_evidence');
  // [FAB1v2] agreement surface: every row must carry a basis (backfill stamped the corpus;
  // every 16A+ writer emits it) — a NULL is a missed writer, hard-FAIL.
  const basisNullResult = await pool.query(
    `SELECT COUNT(*) AS n FROM permit_trades WHERE attachment_basis IS NULL`,
  );
  const basisNullCount = safeParsePositiveInt(basisNullResult.rows[0].n, 'basis_null');
  // [FAB2] starvation two-band — FAIL band DERIVED from the complement table.
  const complementCoveredSlugs = new Set(complementTradesFor(Object.keys(LINE_TRADE_COMPLEMENT)));
  const starvedFailBand = STARVED_TRADE_SLUGS.filter((s) => complementCoveredSlugs.has(s));
  const starvedInfoBand = STARVED_TRADE_SLUGS.filter((s) => !complementCoveredSlugs.has(s));
  const starvedResult = await pool.query(
    `SELECT t.slug, COUNT(pt.id) FILTER (WHERE pt.is_active) AS act
       FROM trades t
       LEFT JOIN permit_trades pt ON pt.trade_id = t.id
      WHERE t.slug = ANY($1)
      GROUP BY t.slug`,
    [STARVED_TRADE_SLUGS],
  );
  const starvedActive = new Map(starvedResult.rows.map((r) => [r.slug, Number(r.act)]));
  const failBandStillStarved = starvedFailBand.filter((s) => (starvedActive.get(s) ?? 0) === 0);
  const infoBandStillStarved = starvedInfoBand.filter((s) => (starvedActive.get(s) ?? 0) === 0);
  // Band statuses fire only with the gate ON (gate OFF = the designed pre-16F state where
  // the covered starved trades are legitimately 0-active — a FAIL there would be noise).
  const meanBandStatus = !inferenceEnabled ? 'INFO'
    : meanActive > INFERENCE_MEAN_FAIL ? 'FAIL'
    : meanActive > INFERENCE_MEAN_WARN ? 'WARN' : 'PASS';
  const starvedFailStatus = !inferenceEnabled ? 'INFO'
    : failBandStillStarved.length > 0 ? 'FAIL' : 'PASS';
  // Evidence-mean creep guard (D7d proxy): the D1 union must leave the evidence posture
  // untouched — corpus baseline 5.06 (2026-07-10); WARN on upward creep past 7.
  const evidenceMeanStatus = !inferenceEnabled ? 'INFO' : meanEvidence > 7 ? 'WARN' : 'PASS';

  const classifyAuditRows = [
    { metric: 'permits_processed', value: processed, threshold: null, status: 'INFO' },
    { metric: 'run_classified', value: permitsWithTrades, threshold: null, status: 'INFO' },
    { metric: 'classification_coverage', value: classificationCoverage.toFixed(1) + '%', threshold: '>= 95%', status: classificationCoverage >= 95 ? 'PASS' : 'WARN' },
    { metric: 'total_trade_matches', value: totalMatches, threshold: null, status: 'INFO' },
    { metric: 'permit_trades_written', value: dbUpdated, threshold: null, status: 'INFO' },
    // Spec 80 §5.B — product classification (permit_products, now live).
    { metric: 'permits_with_products', value: permitsWithProducts, threshold: null, status: 'INFO' },
    { metric: 'total_product_matches', value: totalProducts, threshold: null, status: 'INFO' },
    { metric: 'permit_products_written', value: productsDbUpdated, threshold: null, status: 'INFO' },
    // Precision signal alongside cov_trade_vocab — so a green coverage gate can't hide
    // trades that only ever appear at bundle/fallback confidence (Spec 80 §5.B.5).
    { metric: 'trades_strong_signal', value: strongSignalTradeIds.size, threshold: null, status: 'INFO' },
    { metric: 'trades_bundle_or_fallback_only', value: [...weakSignalTradeIds].filter((id) => !strongSignalTradeIds.has(id)).length, threshold: null, status: 'INFO' },
    // WF2 #2 — per-class breakdown for operator visibility (Spec 80 §5).
    // Operator can confirm whether non-construction permits emitted the
    // expected zero-trade output (the gating's intended behavior) vs.
    // silently failing for another reason.
    { metric: 'class.construction', value: classCounters.construction, threshold: null, status: 'INFO' },
    { metric: 'class.signage', value: classCounters.signage, threshold: null, status: 'INFO' },
    { metric: 'class.administrative', value: classCounters.administrative, threshold: null, status: 'INFO' },
    { metric: 'class.safety_upgrade', value: classCounters.safety_upgrade, threshold: null, status: 'INFO' },
    { metric: 'class.unclassified', value: classCounters.unclassified, threshold: null, status: 'INFO' },
    // P16 D2 (§R10, [BUG-1]) — permit_type family ceiling applications this run. A count of a
    // correctness mechanism firing (plumbing/mechanical/drain permit_types capped to their family);
    // INFO by nature — a large count is not a defect, it is the residual the ceiling is designed for.
    { metric: 'permit_type_ceiling_applied_count', value: permitTypeCeilingApplied, threshold: null, status: 'INFO' },
    // P16 16C (§R10) — lean inference layer telemetry. Gate state + emission volume; the mean-band
    // WARN/FAIL tripwires + starvation bands land with the 16F re-run (they need corpus-wide state,
    // not a run increment).
    { metric: 'inference_layer_enabled', value: inferenceEnabled ? 1 : 0, threshold: null, status: 'INFO' },
    { metric: 'inference_rows_emitted', value: inferenceRowsEmitted, threshold: null, status: 'INFO' },
    { metric: 'permits_with_inference', value: permitsWithInference, threshold: null, status: 'INFO' },
    // FB-line (max_build/coa_build) inference volume — the stratum the partial corpus could not
    // validate (zero large new-builds in the hold-out). WARN when it dominates emission (>40%) so
    // the unvalidated stratum is WATCHED until the deep_scrapes re-measure (Gemini fold).
    {
      metric: 'fb_line_inference_rows',
      value: fbLineInferenceRows,
      threshold: '<= 40% of inference_rows_emitted',
      status: inferenceRowsEmitted > 0 && fbLineInferenceRows / inferenceRowsEmitted > 0.4 ? 'WARN' : 'INFO',
    },
    // ── P16 16F §R10 bands (corpus-wide; INFO while the gate is OFF) ──
    // D7(a) GLOBAL band (panel-ratified): mean active trades per permit-with-trades.
    {
      metric: 'inference_mean_trades_per_permit',
      value: meanActive,
      threshold: `WARN > ${INFERENCE_MEAN_WARN}, FAIL > ${INFERENCE_MEAN_FAIL} (global band; build-line complements are 16 by design)`,
      status: meanBandStatus,
    },
    // DeepSeek companion: an average hides permit-level spikes.
    { metric: 'inference_p95_trades_per_permit', value: p95Active, threshold: null, status: 'INFO' },
    { metric: 'inference_max_trades_per_permit', value: maxActive, threshold: null, status: 'INFO' },
    // D7(d) precision-regression proxy: the D1 union must not move the evidence posture
    // (corpus baseline mean-evidence 5.06; the full prec(insp) guard is the eval harness re-run).
    {
      metric: 'evidence_mean_trades_per_permit',
      value: meanEvidence,
      threshold: '<= 7 (baseline 5.06 — D1: evidence posture unchanged by inference)',
      status: evidenceMeanStatus,
    },
    // [FAB2] starvation-recovery two-band (FAIL band derived FROM LINE_TRADE_COMPLEMENT).
    {
      metric: 'starved_trades_recovered_fail_band',
      value: `${starvedFailBand.length - failBandStillStarved.length}/${starvedFailBand.length} recovered` +
        (failBandStillStarved.length ? ` — still 0-active: ${failBandStillStarved.join(', ')}` : ''),
      threshold: 'every complement-covered starved trade > 0 active post-re-run',
      status: starvedFailStatus,
    },
    {
      metric: 'starved_trades_uncovered_band',
      value: `${starvedInfoBand.join(', ') || '(none)'}${infoBandStillStarved.length ? ` — still 0-active: ${infoBandStillStarved.join(', ')}` : ''}`,
      threshold: 'no line honestly implies these — enumerated + ACCEPTED (or routed to another mechanism)',
      status: 'INFO',
    },
    // [FAB1v2] backfill-vs-writer agreement surface: a NULL basis = a missed writer.
    {
      metric: 'attachment_basis_null_count',
      value: basisNullCount,
      threshold: '== 0',
      status: basisNullCount === 0 ? 'PASS' : 'FAIL',
    },
  ];

  // cov_* vocabulary coverage (Spec 30 §3 / 48 §3.5): distinct trade_ids emitted vs the trades
  // vocabulary. emitSummary injects the cov_ row and escalates the verdict if it FAILs.
  const vocabSpec = manifest.scripts.classify_permits?.telemetry_vocab_cols;
  const vocabCoverage = vocabSpec ? await pipeline.computeVocabCoverage(pool, vocabSpec) : undefined;

  pipeline.emitSummary({
    records_total: processed,
    records_new: trulyNewPermits,
    records_updated: permitsWithTrades,
    ...(vocabCoverage
      ? {
          telemetry_context: {
            vocab_coverage: vocabCoverage,
            vocab_coverage_thresholds: { pass: logicVars.vocab_coverage_pass_pct, warn: logicVars.vocab_coverage_warn_pct },
          },
        }
      : {}),
    records_meta: {
      duration_ms: durationMs,
      permits_processed: processed,
      permits_with_trades: permitsWithTrades,
      total_trade_matches: totalMatches,
      avg_trades_per_permit: safeParseFloat(avgTradesPerPermit.toFixed(2), 'avg_trades_per_permit'),
      db_updated: dbUpdated,
      audit_table: {
        phase: 11,
        name: 'Trade Classification',
        // P16 16F (Spec 47 §8.2, KNOWING fix): verdict is ROW-DERIVED, never a parallel
        // boolean — the old `classifyHasWarns ? 'WARN' : 'PASS'` could not see the new
        // FAIL-able band rows (and was itself the anti-pattern the Observability charter bans).
        verdict: classifyAuditRows.some((r) => r.status === 'FAIL') ? 'FAIL'
          : classifyAuditRows.some((r) => r.status === 'WARN') ? 'WARN' : 'PASS',
        rows: classifyAuditRows,
      },
    },
  });
  pipeline.emitMeta({ "permits": ["permit_num", "revision_num", "permit_type", "structure_type", "work", "description", "status", "est_const_cost", "issued_date", "current_use", "proposed_use", "scope_tags", "project_type", "last_seen_at"], "trade_mapping_rules": ["id", "trade_id", "tier", "match_field", "match_pattern", "confidence", "phase_start", "phase_end", "is_active"], "product_groups": ["id", "slug", "name"] }, { "permit_trades": ["permit_num", "revision_num", "trade_id", "tier", "confidence", "is_active", "phase", "lead_score", "attachment_basis", "classified_at"], "permit_products": ["permit_num", "revision_num", "product_id", "product_slug", "product_name", "confidence"] });
  });
  if (!lockResult.acquired) return;
});
