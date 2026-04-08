#!/usr/bin/env node
// 🔗 SPEC LINK: docs/specs/product/future/72_lead_cost_model.md §Implementation
// 🔗 DUAL CODE PATH: src/features/leads/lib/cost-model.ts — per CLAUDE.md §7,
// these files MUST stay in sync. BASE_RATES, PREMIUM_TIERS, SCOPE_ADDITIONS,
// COST_TIER_BOUNDARIES, COMPLEXITY_SIGNALS below MUST match the TS module
// byte-for-byte. Any formula change lands in BOTH files. A future hardening WF
// can extract to a shared JSON file.
//
// Populates the cost_estimates table (FK'd to permits) used by the lead feed
// API. Runs nightly after parcel + massing linkage, inside the sources chain.

const pipeline = require('./lib/pipeline');

// ---------------------------------------------------------------------------
// Constants — mirror src/features/leads/lib/cost-model.ts EXACTLY
// ---------------------------------------------------------------------------

const BASE_RATES = {
  sfd: 3000,
  semi_town: 2600,
  multi_res: 3400,
  addition: 2000,
  commercial: 4000,
  interior_reno: 1150,
};

const PREMIUM_TIERS = [
  { min: 0, max: 60000, multiplier: 1.0 },
  { min: 60000, max: 100000, multiplier: 1.15 },
  { min: 100000, max: 150000, multiplier: 1.35 },
  { min: 150000, max: 200000, multiplier: 1.6 },
  { min: 200000, max: null, multiplier: 1.85 },
];

const SCOPE_ADDITIONS = {
  pool: 80000,
  elevator: 60000,
  underpinning: 40000,
  solar: 25000,
};

const COST_TIER_BOUNDARIES = {
  small: { min: 0, max: 100000 },
  medium: { min: 100000, max: 500000 },
  large: { min: 500000, max: 2000000 },
  major: { min: 2000000, max: 10000000 },
  mega: { min: 10000000, max: null },
};

const COMPLEXITY_SIGNALS = {
  highRise: 30,
  multiUnit: 20,
  largeFootprint: 15,
  premiumNbhd: 15,
  complexScope: 10,
  newBuild: 10,
};

const FALLBACK_URBAN_COVERAGE = 0.7;
const FALLBACK_SUBURBAN_COVERAGE = 0.4;
const FALLBACK_RESIDENTIAL_FLOORS = 2;
const FALLBACK_COMMERCIAL_FLOORS = 1;
const MODEL_RANGE_PCT = 0.25;
const FALLBACK_RANGE_PCT = 0.5;
const PLACEHOLDER_COST_THRESHOLD = 1000;

const ADVISORY_LOCK_ID = 74;
const BATCH_SIZE = 5000;

// ---------------------------------------------------------------------------
// Inline cost model — mirrors cost-model.ts estimateCost
// ---------------------------------------------------------------------------

function isNewBuild(permit) {
  const pt = (permit.permit_type || '').toLowerCase();
  return pt.includes('new building') || pt.includes('new construction');
}

function isResidential(permit) {
  const st = (permit.structure_type || '').toLowerCase();
  return (
    st.includes('dwelling') ||
    st.includes('residential') ||
    st.includes('detached') ||
    st.includes('semi') ||
    st.includes('town')
  );
}

function isCommercial(permit) {
  const st = (permit.structure_type || '').toLowerCase();
  return st.includes('commercial') || st.includes('office') || st.includes('retail');
}

function determineBaseRate(permit) {
  const st = (permit.structure_type || '').toLowerCase();
  const newBuild = isNewBuild(permit);

  if (newBuild) {
    if (st.includes('multi') || st.includes('apartment') || st.includes('condo')) {
      return BASE_RATES.multi_res;
    }
    if (st.includes('semi') || st.includes('town')) {
      return BASE_RATES.semi_town;
    }
    if (isCommercial(permit)) {
      return BASE_RATES.commercial;
    }
    return BASE_RATES.sfd;
  }

  const pt = (permit.permit_type || '').toLowerCase();
  const work = (permit.work || '').toLowerCase();
  if (pt.includes('addition') || pt.includes('alteration') || work.includes('addition')) {
    return BASE_RATES.addition;
  }
  return BASE_RATES.interior_reno;
}

function computePremiumFactor(avgIncome) {
  if (avgIncome === null || avgIncome === undefined) return 1.0;
  for (const tier of PREMIUM_TIERS) {
    if (avgIncome >= tier.min && (tier.max === null || avgIncome < tier.max)) {
      return tier.multiplier;
    }
  }
  return 1.0;
}

function computeBuildingArea(row) {
  if (
    row.footprint_area_sqm !== null &&
    row.estimated_stories !== null &&
    row.footprint_area_sqm > 0
  ) {
    return { area: row.footprint_area_sqm * row.estimated_stories, usedFallback: false };
  }

  if (row.lot_size_sqm !== null && row.lot_size_sqm > 0) {
    const rentPct = row.tenure_renter_pct || 0;
    const coverage = rentPct > 50 ? FALLBACK_URBAN_COVERAGE : FALLBACK_SUBURBAN_COVERAGE;
    const floors = isCommercial(row)
      ? FALLBACK_COMMERCIAL_FLOORS
      : FALLBACK_RESIDENTIAL_FLOORS;
    return { area: row.lot_size_sqm * coverage * floors, usedFallback: true };
  }

  return { area: 0, usedFallback: true };
}

function sumScopeAdditions(tags) {
  if (!tags) return 0;
  let total = 0;
  for (const tag of tags) {
    const norm = (tag || '').toLowerCase();
    if (norm === 'pool') total += SCOPE_ADDITIONS.pool;
    else if (norm === 'elevator') total += SCOPE_ADDITIONS.elevator;
    else if (norm === 'underpinning') total += SCOPE_ADDITIONS.underpinning;
    else if (norm === 'solar') total += SCOPE_ADDITIONS.solar;
  }
  return total;
}

function determineCostTier(cost) {
  if (cost < COST_TIER_BOUNDARIES.medium.min) return 'small';
  if (cost < COST_TIER_BOUNDARIES.large.min) return 'medium';
  if (cost < COST_TIER_BOUNDARIES.major.min) return 'large';
  if (cost < COST_TIER_BOUNDARIES.mega.min) return 'major';
  return 'mega';
}

function computeComplexityScore(row) {
  let score = 0;
  const stories = row.storeys || row.estimated_stories || 0;
  if (stories > 6) score += COMPLEXITY_SIGNALS.highRise;
  if ((row.dwelling_units_created || 0) > 4) score += COMPLEXITY_SIGNALS.multiUnit;
  if ((row.footprint_area_sqm || 0) > 300) score += COMPLEXITY_SIGNALS.largeFootprint;
  if ((row.avg_household_income || 0) > 150000) score += COMPLEXITY_SIGNALS.premiumNbhd;
  const tags = row.scope_tags || [];
  for (const tag of tags) {
    const norm = (tag || '').toLowerCase();
    if (norm === 'pool' || norm === 'elevator' || norm === 'underpinning') {
      score += COMPLEXITY_SIGNALS.complexScope;
    }
  }
  if (isNewBuild(row)) score += COMPLEXITY_SIGNALS.newBuild;
  return Math.min(100, score);
}

function estimateCostInline(row) {
  // Path 1: permit-reported cost above placeholder threshold
  if (row.est_const_cost !== null && row.est_const_cost > PLACEHOLDER_COST_THRESHOLD) {
    const cost = row.est_const_cost;
    const tier = determineCostTier(cost);
    const complexity = computeComplexityScore(row);
    const premiumFactor = computePremiumFactor(row.avg_household_income);
    return {
      permit_num: row.permit_num,
      revision_num: row.revision_num,
      estimated_cost: cost,
      cost_source: 'permit',
      cost_tier: tier,
      cost_range_low: cost,
      cost_range_high: cost,
      premium_factor: premiumFactor,
      complexity_score: complexity,
    };
  }

  // Path 2: model-based estimate
  const { area, usedFallback } = computeBuildingArea(row);
  const baseRate = determineBaseRate(row);
  const premiumFactor = computePremiumFactor(row.avg_household_income);
  const scopeAdditions = sumScopeAdditions(row.scope_tags);
  const rawCost = area * baseRate * premiumFactor + scopeAdditions;

  if (area <= 0) {
    const complexity = computeComplexityScore(row);
    return {
      permit_num: row.permit_num,
      revision_num: row.revision_num,
      estimated_cost: null,
      cost_source: 'model',
      cost_tier: null,
      cost_range_low: null,
      cost_range_high: null,
      premium_factor: premiumFactor,
      complexity_score: complexity,
    };
  }

  const rangePct = usedFallback ? FALLBACK_RANGE_PCT : MODEL_RANGE_PCT;
  const low = rawCost * (1 - rangePct);
  const high = rawCost * (1 + rangePct);
  const tier = determineCostTier(rawCost);
  const complexity = computeComplexityScore(row);

  return {
    permit_num: row.permit_num,
    revision_num: row.revision_num,
    estimated_cost: rawCost,
    cost_source: 'model',
    cost_tier: tier,
    cost_range_low: low,
    cost_range_high: high,
    premium_factor: premiumFactor,
    complexity_score: complexity,
  };
}

// ---------------------------------------------------------------------------
// Pipeline entry point
// ---------------------------------------------------------------------------

const SOURCE_SQL = `
  SELECT
    p.permit_num,
    p.revision_num,
    p.permit_type,
    p.structure_type,
    p.work,
    p.est_const_cost::float8 AS est_const_cost,
    p.scope_tags,
    p.dwelling_units_created,
    p.storeys,
    pp_parcel.lot_size_sqm::float8 AS lot_size_sqm,
    pp_parcel.frontage_m::float8 AS frontage_m,
    bf.footprint_area_sqm::float8 AS footprint_area_sqm,
    bf.estimated_stories,
    n.avg_household_income::float8 AS avg_household_income,
    n.tenure_renter_pct::float8 AS tenure_renter_pct
  FROM permits p
  LEFT JOIN LATERAL (
    SELECT parcel_id
    FROM permit_parcels
    WHERE permit_num = p.permit_num AND revision_num = p.revision_num
    ORDER BY parcel_id ASC
    LIMIT 1
  ) pp ON true
  LEFT JOIN parcels pp_parcel ON pp_parcel.id = pp.parcel_id
  LEFT JOIN building_footprints bf ON bf.parcel_id = pp.parcel_id
  LEFT JOIN neighbourhoods n ON n.neighbourhood_id = p.neighbourhood_id
`;

async function flushBatch(pool, rows) {
  return await pipeline.withTransaction(pool, async (client) => {
    let inserted = 0;
    let updated = 0;
    for (const r of rows) {
      try {
        const res = await client.query(
          `INSERT INTO cost_estimates (
             permit_num, revision_num, estimated_cost, cost_source, cost_tier,
             cost_range_low, cost_range_high, premium_factor, complexity_score,
             model_version, computed_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
           ON CONFLICT (permit_num, revision_num) DO UPDATE
             SET estimated_cost   = EXCLUDED.estimated_cost,
                 cost_source      = EXCLUDED.cost_source,
                 cost_tier        = EXCLUDED.cost_tier,
                 cost_range_low   = EXCLUDED.cost_range_low,
                 cost_range_high  = EXCLUDED.cost_range_high,
                 premium_factor   = EXCLUDED.premium_factor,
                 complexity_score = EXCLUDED.complexity_score,
                 model_version    = EXCLUDED.model_version,
                 computed_at      = NOW()
           RETURNING (xmax = 0) AS inserted`,
          [
            r.permit_num,
            r.revision_num,
            r.estimated_cost,
            r.cost_source,
            r.cost_tier,
            r.cost_range_low,
            r.cost_range_high,
            r.premium_factor,
            r.complexity_score,
            1,
          ],
        );
        if (res.rows[0] && res.rows[0].inserted) inserted++;
        else updated++;
      } catch (err) {
        pipeline.log.error('[compute-cost-estimates]', 'row upsert failed', {
          permit_num: r.permit_num,
          revision_num: r.revision_num,
          err: err && err.message,
        });
      }
    }
    return { inserted, updated };
  });
}

pipeline.run('compute-cost-estimates', async (pool) => {
  const lockRes = await pool.query('SELECT pg_try_advisory_lock($1) AS locked', [
    ADVISORY_LOCK_ID,
  ]);
  if (!lockRes.rows[0] || !lockRes.rows[0].locked) {
    pipeline.log.warn(
      '[compute-cost-estimates]',
      `Advisory lock ${ADVISORY_LOCK_ID} held by another process — exiting`,
    );
    return;
  }

  let processed = 0;
  let inserted = 0;
  let updated = 0;
  let batch = [];

  try {
    for await (const row of pipeline.streamQuery(pool, SOURCE_SQL)) {
      batch.push(estimateCostInline(row));
      processed++;

      if (batch.length >= BATCH_SIZE) {
        try {
          const res = await flushBatch(pool, batch);
          inserted += res.inserted;
          updated += res.updated;
        } catch (err) {
          pipeline.log.error('[compute-cost-estimates]', 'batch failed', {
            batch_size: batch.length,
            err: err && err.message,
          });
        }
        batch = [];
      }
    }

    if (batch.length > 0) {
      try {
        const res = await flushBatch(pool, batch);
        inserted += res.inserted;
        updated += res.updated;
      } catch (err) {
        pipeline.log.error('[compute-cost-estimates]', 'final batch failed', {
          batch_size: batch.length,
          err: err && err.message,
        });
      }
    }

    pipeline.emitSummary({
      records_total: processed,
      records_new: inserted,
      records_updated: updated,
    });
    pipeline.emitMeta(
      {
        permits: ['permit_num', 'revision_num', 'permit_type', 'structure_type', 'est_const_cost', 'scope_tags'],
        permit_parcels: ['permit_num', 'revision_num', 'parcel_id'],
        parcels: ['id', 'lot_size_sqm'],
        building_footprints: ['parcel_id', 'footprint_area_sqm', 'estimated_stories'],
        neighbourhoods: ['neighbourhood_id', 'avg_household_income', 'tenure_renter_pct'],
      },
      {
        cost_estimates: [
          'permit_num',
          'revision_num',
          'estimated_cost',
          'cost_source',
          'cost_tier',
          'cost_range_low',
          'cost_range_high',
          'premium_factor',
          'complexity_score',
          'model_version',
          'computed_at',
        ],
      },
    );
  } finally {
    await pool.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_ID]);
  }
});
