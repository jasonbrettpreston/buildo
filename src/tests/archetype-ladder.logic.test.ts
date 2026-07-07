// 🔗 SPEC LINK: docs/specs/01-pipeline/83_lead_cost_model.md §3-ARCHETYPE (the T1–T3 ladder)
//
// Phase B unit tests for the archetype pricing ladder inside the Brain:
// entry gate, T1 declared-area (band + cap), T2 parcel totals (per-line
// bounds), fits:false + zero-total 'none' semantics, T3 rate fallback,
// additive-pair totals, Decision-4 slicing, rate resolution (§2.9), and the
// T4 byte-identical non-regression gate.
import { describe, it, expect } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const brain = require('../features/leads/lib/cost-model-shared.js');

// ── Fixtures ────────────────────────────────────────────────────────────────

const GUARDS = {
  archetypeEnabled: true,
  archetypeRates: {} as Record<string, number>,
  archetypeT1FsiMin: 0.05,
  archetypeT1FsiMax: 8,
  archetypeT1TotalCap: 25_000_000,
  archetypeT2RenoCap: 10_000_000,
  archetypeT2BuildCap: 20_000_000,
  archetypeT2BuildMin: 200_000,
  archetypeT3TotalCap: 15_000_000,
};

const BASE_CONFIG = {
  tradeRates: {
    framing: { base_rate_sqft: 40, structure_complexity_factor: 1.5 },
    electrical: { base_rate_sqft: 20, structure_complexity_factor: 1.0 },
  },
  scopeMatrix: {},
  urbanCoverageRatio: 0.7,
  suburbanCoverageRatio: 0.4,
  liarGateThreshold: 0.25,
  ...GUARDS,
};

// A low-rise residential renovation permit whose tags map cleanly to `gut`,
// with the Spec 88 propagated scalars present.
const gutPermit = (over: Record<string, unknown> = {}) => ({
  permit_num: 'P100',
  revision_num: '00',
  permit_type: 'Small Residential Projects',
  permit_type_class: 'construction',
  structure_type: 'SFD - Detached',
  project_type: 'renovation',
  work: 'Interior Alterations',
  est_const_cost: 50_000,
  scope_tags: ['alter:interior-alterations'],
  dwelling_units_created: 0,
  storeys: 2,
  lot_size_sqm: 400,
  frontage_m: 12,
  footprint_area_sqm: 120,
  estimated_stories: 2,
  avg_household_income: 120_000,
  tenure_renter_pct: 30,
  active_trade_slugs: ['framing', 'electrical'],
  neighbourhood_cost_premium: 1.2,
  // gut line: scalarCol cost_gut_total (kind total), areaCol cur_pot_2story_gfa_sqm,
  // ownAreaField interior_alterations_sqm
  cost_gut_total: 480_000,
  cur_pot_2story_gfa_sqm: 240,
  interior_alterations_sqm: null,
  residential_sqm: null,
  ...over,
});

// ── Entry gate ──────────────────────────────────────────────────────────────

describe('entry gate', () => {
  it('archetypeEnabled=false → ladder off, legacy path prices the row', () => {
    const r = brain.estimateCostShared(gutPermit(), { ...BASE_CONFIG, archetypeEnabled: false });
    expect(String(r.cost_source).startsWith('archetype_')).toBe(false);
  });
  it('non-lowrise structure_type → T4 (Office never enters the ladder)', () => {
    const r = brain.tryArchetypeCost(gutPermit({ structure_type: 'Office' }), BASE_CONFIG);
    expect(r).toBeNull();
  });
  it('mapper-null residential (MEC-only) → T4', () => {
    const r = brain.tryArchetypeCost(
      gutPermit({ project_type: 'mechanical', scope_tags: ['hvac'] }),
      BASE_CONFIG,
    );
    expect(r).toBeNull();
  });
  it('non-construction permit_type_class short-circuits BEFORE the ladder', () => {
    const r = brain.estimateCostShared(gutPermit({ permit_type_class: 'demolition' }), BASE_CONFIG);
    expect(r.cost_source).toBe('none');
    expect(r._permitTypeClassSkipped).toBe(true);
    expect(r._archetypeTier).toBeUndefined();
  });
});

// ── T1 — declared area ──────────────────────────────────────────────────────

describe('T1 declared-area', () => {
  it('own area × line per-sqm (derived total÷basis), premium NOT re-applied', () => {
    // per_sqm = 480,000 / 240 = 2,000 (premium-inclusive); own 100 m² → 200,000
    const r = brain.estimateCostShared(gutPermit({ interior_alterations_sqm: 100 }), BASE_CONFIG);
    expect(r.cost_source).toBe('archetype_declared_area');
    expect(r.estimated_cost).toBe(200_000);
    expect(r._archetypeTier).toBe('t1');
    expect(r.effective_area_sqm).toBe(100);
  });
  it('FSI band floor: own/lot < 0.05 rejects to T2, counted', () => {
    // 10/400 = 0.025 < 0.05 → T2 (the propagated total)
    const r = brain.estimateCostShared(gutPermit({ interior_alterations_sqm: 10 }), BASE_CONFIG);
    expect(r.cost_source).toBe('archetype_parcel');
    expect(r.estimated_cost).toBe(480_000);
    expect(r._archetypeRejections).toContain('t1_band');
  });
  it('FSI band ceiling: own/lot > 8 rejects to T2', () => {
    const r = brain.estimateCostShared(gutPermit({ interior_alterations_sqm: 4000 }), BASE_CONFIG);
    expect(r.cost_source).toBe('archetype_parcel');
    expect(r._archetypeRejections).toContain('t1_band');
  });
  it('absolute cap × max(1, dwelling_units_created): out-of-cap → T2', () => {
    // per_sqm 2,000 × 15,000 m² = $30M > $25M cap (units 0 → divisor 1)
    const r = brain.estimateCostShared(
      gutPermit({ interior_alterations_sqm: 15_000, lot_size_sqm: 100_000 }),
      BASE_CONFIG,
    );
    expect(r.cost_source).toBe('archetype_parcel');
    expect(r._archetypeRejections).toContain('t1_cap');
  });
  it('multi-unit divisor keeps a legitimate complex: units=2 doubles the cap', () => {
    const r = brain.estimateCostShared(
      gutPermit({ interior_alterations_sqm: 15_000, lot_size_sqm: 100_000, dwelling_units_created: 2 }),
      BASE_CONFIG,
    );
    expect(r.cost_source).toBe('archetype_declared_area'); // $30M ≤ $50M cap
  });
  it('no lot size → FSI unverifiable → band rejects to T2 (never an unbounded T1)', () => {
    const r = brain.estimateCostShared(
      gutPermit({ interior_alterations_sqm: 100, lot_size_sqm: null }),
      BASE_CONFIG,
    );
    expect(r.cost_source).toBe('archetype_parcel');
    expect(r._archetypeRejections).toContain('t1_band');
  });
});

// ── T2 — parcel line total + bounds ────────────────────────────────────────

describe('T2 parcel total + plausibility bounds', () => {
  it('no own area → the propagated total as-is', () => {
    const r = brain.estimateCostShared(gutPermit(), BASE_CONFIG);
    expect(r.cost_source).toBe('archetype_parcel');
    expect(r.estimated_cost).toBe(480_000);
    expect(r._archetypeTier).toBe('t2');
    expect(r.modeled_gfa_sqm).toBe(240); // the geom-basis area
  });
  it('reno line above $10M cap (the live $105M gut poison) → T3-if-priceable else T4', () => {
    const r = brain.tryArchetypeCost(gutPermit({ cost_gut_total: 105_000_000 }), BASE_CONFIG);
    expect(r).toBeNull(); // no rate, no own area → T4
  });
  it('build line below $200K floor (sliver-parcel envelope) → fallthrough', () => {
    const row = gutPermit({
      project_type: 'new_build',
      scope_tags: ['new:build-sfd'],
      cost_fb_total: 4_800, // the <$5K sliver rows Reality-Check found
      opt_aor_gfa_sqm: 1,
      cost_gut_total: null,
      cur_pot_2story_gfa_sqm: null,
    });
    expect(brain.tryArchetypeCost(row, BASE_CONFIG)).toBeNull();
  });
  it('build line within [$200K, $20M] prices as coa/max_build', () => {
    const row = gutPermit({
      project_type: 'new_build',
      scope_tags: ['new:build-sfd'],
      cost_fb_total: 1_500_000,
      opt_aor_gfa_sqm: 310,
      cost_gut_total: null,
      cur_pot_2story_gfa_sqm: null,
    });
    const r = brain.estimateCostShared(row, BASE_CONFIG);
    expect(r.cost_source).toBe('archetype_parcel');
    expect(r.estimated_cost).toBe(1_500_000);
    expect(r._archetypeLines).toEqual(['max_build']);
  });
});

// ── Reno-build escalation cap-class (WF3 F1) ───────────────────────────────
// A reno-origin escalation (gut/addition + ≥9 trades, no genuine build signal) still
// redirects to the max_build AREA basis (W7 detection preserved) but is bounded by the
// RENO cap — killing the deck/interior-gut/oversized-addition $15–19M explosions while a
// real ≤reno-cap rebuild still prices as max_build.
describe('reno-build escalation cap-class (WF3 F1)', () => {
  // 9 active trades → escalation fires; a max_build scalar + area on the row.
  const escalatedReno = (over: Record<string, unknown> = {}) => gutPermit({
    active_trade_slugs: ['framing', 'electrical', 'plumbing', 'hvac', 'drywall', 'painting', 'roofing', 'concrete', 'insulation'],
    cost_fb_total: 15_000_000,
    opt_aor_gfa_sqm: 2_000,
    residential_sqm: null, // no T1 own-area → prices via T2 max_build
    ...over,
  });

  it('reno-origin escalation above the $10M reno cap → T4 (the $15M deck explosion killed)', () => {
    const r = brain.tryArchetypeCost(escalatedReno(), BASE_CONFIG);
    expect(r).toBeNull(); // reno cap $10M → t2_bound; no FB rate / own area → T4
  });

  it('reno-origin escalation ≤ reno cap → STILL max_build (W7 preserved — the pinning test)', () => {
    const r = brain.estimateCostShared(escalatedReno({ cost_fb_total: 6_000_000, opt_aor_gfa_sqm: 400 }), BASE_CONFIG);
    expect(r._archetypeMapKind).toBe('escalated');   // escalation FIRED (assert the flag, not the DB — RC round-2)
    expect(r._archetypeLines).toEqual(['max_build']); // redirected to the build AREA basis
    expect(r.cost_source).toBe('archetype_parcel');
    expect(r.estimated_cost).toBe(6_000_000);         // within the $10M reno cap → priced
  });

  it('genuine new_build (FB tag) escalation keeps the $20M BUILD cap', () => {
    const r = brain.estimateCostShared(
      escalatedReno({ project_type: 'new_build', scope_tags: ['new:build-sfd'] }),
      BASE_CONFIG,
    );
    expect(r._archetypeMapKind).toBe('escalated');
    expect(r.cost_source).toBe('archetype_parcel');
    expect(r.estimated_cost).toBe(15_000_000);        // $15M < $20M build cap → priced (unchanged)
  });
});

// ── fits:false + zero-total 'none' semantics ───────────────────────────────

describe("fits:false and zero-total → 'none', never a fallback price", () => {
  it('fit-gated line (garage) with NULL scalar → cost_source none + _archetypeFitBlocked', () => {
    const row = gutPermit({
      scope_tags: ['garage'],
      project_type: 'other',
      cost_garage_total: null, // fits:false — permissioning, not missing data
      max_garage_gfa_sqm: null,
      cost_gut_total: null,
    });
    const r = brain.estimateCostShared(row, BASE_CONFIG);
    expect(r.cost_source).toBe('none');
    expect(r.estimated_cost).toBeNull();
    expect(r._archetypeFitBlocked).toBe(true);
  });
  it('present-but-ZERO scalar → none + _archetypeZeroTotal (Guardian F1-B)', () => {
    const r = brain.estimateCostShared(gutPermit({ cost_gut_total: 0 }), BASE_CONFIG);
    expect(r.cost_source).toBe('none');
    expect(r.estimated_cost).toBeNull();
    expect(r._archetypeZeroTotal).toBe(true);
  });
});

// ── T3 — rate table × own area ─────────────────────────────────────────────

describe('T3 rate-table fallback', () => {
  it('no scalar + own area + rate → rate × area × premium', () => {
    const cfg = { ...BASE_CONFIG, archetypeRates: { INT: 3229 } };
    const row = gutPermit({
      cost_gut_total: null,
      cur_pot_2story_gfa_sqm: null,
      interior_alterations_sqm: 100,
    });
    const r = brain.estimateCostShared(row, cfg);
    expect(r.cost_source).toBe('archetype_rate');
    expect(r.estimated_cost).toBe(Math.round(3229 * 100 * 1.2));
    expect(r._archetypeTier).toBe('t3');
  });
  it('no scalar + NO own area → T4 (no derived-area invention)', () => {
    const cfg = { ...BASE_CONFIG, archetypeRates: { INT: 3229 } };
    const row = gutPermit({ cost_gut_total: null, cur_pot_2story_gfa_sqm: null });
    expect(brain.tryArchetypeCost(row, cfg)).toBeNull();
  });
  it('missing premium → 1.0 fallback (mirrors Spec 88 §2.1)', () => {
    const cfg = { ...BASE_CONFIG, archetypeRates: { INT: 1000 } };
    const row = gutPermit({
      cost_gut_total: null,
      cur_pot_2story_gfa_sqm: null,
      interior_alterations_sqm: 50,
      neighbourhood_cost_premium: null,
    });
    const r = brain.estimateCostShared(row, cfg);
    expect(r.estimated_cost).toBe(50_000);
    expect(r.premium_factor).toBe(1.0);
  });

  // ── T3 per-unit cap (WF3 F2) — the $159.9M tail ──
  it('T3 above the per-unit cap → reject to T4 (WF3 F2)', () => {
    const cfg = { ...BASE_CONFIG, archetypeRates: { INT: 3229 } };
    // 3229 × 20,000 m² × 1.2 = $77.5M ≫ $15M cap (units 0 → divisor 1). FSI 0.2 (in band).
    const row = gutPermit({
      cost_gut_total: null, cur_pot_2story_gfa_sqm: null,
      interior_alterations_sqm: 20_000, lot_size_sqm: 100_000, dwelling_units_created: 0,
    });
    expect(brain.tryArchetypeCost(row, cfg)).toBeNull();
  });
  it('T3 per-unit divisor keeps a genuine multi-unit development', () => {
    const cfg = { ...BASE_CONFIG, archetypeRates: { INT: 3229 } };
    // Same $77.5M, but 20 units → cap 15M × 20 = $300M ≥ $77.5M → priced.
    const row = gutPermit({
      cost_gut_total: null, cur_pot_2story_gfa_sqm: null,
      interior_alterations_sqm: 20_000, lot_size_sqm: 100_000, dwelling_units_created: 20,
    });
    const r = brain.estimateCostShared(row, cfg);
    expect(r.cost_source).toBe('archetype_rate');
    expect(r.estimated_cost).toBe(Math.round(3229 * 20_000 * 1.2));
  });
  it('missing archetypeT3TotalCap (undefined→NaN) → uncapped, prices as today (no reject-all regression)', () => {
    const cfg: Record<string, unknown> = { ...BASE_CONFIG, archetypeRates: { INT: 3229 } };
    delete cfg.archetypeT3TotalCap;
    const row = gutPermit({
      cost_gut_total: null, cur_pot_2story_gfa_sqm: null,
      interior_alterations_sqm: 20_000, lot_size_sqm: 100_000,
    });
    const r = brain.estimateCostShared(row, cfg);
    expect(r.cost_source).toBe('archetype_rate'); // Number.isFinite(NaN)=false → cap skipped → priced
  });
});

// ── resolveArchetypeRates (§2.9 single source) ─────────────────────────────

describe('resolveArchetypeRates — the Spec 88 §2.9 escalation contract', () => {
  const rows = [
    { archetype: 'FB', cost_per_sqm: 4844, cost_adjustment_factor: 1.0, escalation_index_base: 100 },
    { archetype: 'SOLAR', cost_per_sqm: 377, cost_adjustment_factor: 0.75, escalation_index_base: 100 },
  ];
  it('MAX(1, now/base) — never deflate', () => {
    expect(brain.resolveArchetypeRates(rows, 110).FB).toBeCloseTo(4844 * 1.1);
    expect(brain.resolveArchetypeRates(rows, 90).FB).toBe(4844); // clamped at 1
  });
  it('missing index → multiplier 1.0; adjustment factor applied (SOLAR 0.75)', () => {
    const rates = brain.resolveArchetypeRates(rows, null);
    expect(rates.FB).toBe(4844);
    expect(rates.SOLAR).toBeCloseTo(377 * 0.75);
  });
  it('empty/absent rows → {}', () => {
    expect(brain.resolveArchetypeRates([], 110)).toEqual({});
    expect(brain.resolveArchetypeRates(undefined, 110)).toEqual({});
  });
});

// ── Additive pairs ──────────────────────────────────────────────────────────

describe('additive pairs — sum of line TOTALS, each on its own area', () => {
  const pairPermit = (over: Record<string, unknown> = {}) =>
    gutPermit({
      scope_tags: ['new:underpinning', 'new:basement'],
      project_type: 'renovation',
      cost_gut_total: null,
      // underpin: per_sqm scalar × cur_floor_gfa_sqm; basement: per_sqm × cur_floor_gfa_sqm
      cost_basement_underpin_per_sqm: 1615,
      cost_basement_per_sqm: 753,
      cur_floor_gfa_sqm: 100,
      ...over,
    });
  it('both priceable → summed totals, cost_source archetype_parcel, tier additive', () => {
    const r = brain.estimateCostShared(pairPermit(), BASE_CONFIG);
    expect(r.cost_source).toBe('archetype_parcel');
    expect(r.estimated_cost).toBe(Math.round(1615 * 100 + 753 * 100));
    expect(r._archetypeTier).toBe('additive');
  });
  it('one side unpriceable → the priceable line alone', () => {
    const r = brain.estimateCostShared(
      pairPermit({ cost_basement_underpin_per_sqm: null }),
      BASE_CONFIG,
    );
    expect(r.cost_source).toBe('archetype_parcel');
    expect(r.estimated_cost).toBe(753 * 100);
  });
  it('both unpriceable → T4', () => {
    const row = pairPermit({
      cost_basement_underpin_per_sqm: null,
      cost_basement_per_sqm: null,
      cur_floor_gfa_sqm: null,
    });
    expect(brain.tryArchetypeCost(row, BASE_CONFIG)).toBeNull();
  });
});

// ── Decision-4 slicing ──────────────────────────────────────────────────────

describe('Decision-4 trade slicing', () => {
  it('weights ∝ base_rate × complexity over deduped slugs, scaled to total', () => {
    const r = brain.estimateCostShared(gutPermit(), BASE_CONFIG);
    const tv = r.trade_contract_values as Record<string, number>;
    // framing 40×1.5=60, electrical 20×1=20 → 75% / 25% of 480,000
    expect(tv.framing).toBe(360_000);
    expect(tv.electrical).toBe(120_000);
  });
  it('trade-less lead → {} (counted by the Muscle, never a crash)', () => {
    const r = brain.estimateCostShared(gutPermit({ active_trade_slugs: [] }), BASE_CONFIG);
    expect(r.trade_contract_values).toEqual({});
    expect(r.cost_source).toBe('archetype_parcel');
  });
  it('duplicate slugs deduped before weighting (Guardian F1)', () => {
    const r = brain.estimateCostShared(
      gutPermit({ active_trade_slugs: ['framing', 'framing', 'electrical'] }),
      BASE_CONFIG,
    );
    expect((r.trade_contract_values as Record<string, number>).framing).toBe(360_000);
  });
});

// ── Envelope contract ───────────────────────────────────────────────────────

describe('envelope shape — byte-symmetric with the legacy envelopes', () => {
  it('archetype envelope carries every legacy key + the ±25% range', () => {
    const r = brain.estimateCostShared(gutPermit(), BASE_CONFIG);
    for (const k of [
      'permit_num', 'revision_num', 'estimated_cost', 'cost_source', 'cost_tier',
      'cost_range_low', 'cost_range_high', 'premium_factor', 'complexity_score',
      'is_geometric_override', 'modeled_gfa_sqm', 'effective_area_sqm',
      'trade_contract_values', '_liarsGateOverride', '_zeroTotalBypass',
      '_usedFallback', '_matrixMiss', '_matrixMissKey',
    ]) expect(r, k).toHaveProperty(k);
    expect(r.is_geometric_override).toBe(false);
    expect(r._liarsGateOverride).toBe(false);
    expect(r.cost_range_low).toBe(Math.round(480_000 * 0.75));
    expect(r.cost_range_high).toBe(Math.round(480_000 * 1.25));
    expect(r.premium_factor).toBe(1.2); // the EMBEDDED Spec 88 premium
  });
  it("declared est_const_cost is NEVER assigned on T1–T3 (Liar's Gate retired)", () => {
    const r = brain.estimateCostShared(gutPermit({ est_const_cost: 5_000_000 }), BASE_CONFIG);
    expect(r.cost_source).toBe('archetype_parcel');
    expect(r.estimated_cost).toBe(480_000); // not the declared 5M
  });
});

// ── T4 byte-identical non-regression gate ──────────────────────────────────

describe('T4 non-regression — the ladder changes NOTHING off-path', () => {
  const t4Rows = [
    gutPermit({ structure_type: 'Office' }),                       // non-lowrise
    gutPermit({ project_type: 'mechanical', scope_tags: ['hvac'] }), // mapper-null
    gutPermit({ cost_gut_total: null, cur_pot_2story_gfa_sqm: null }), // unpriceable
    gutPermit({ permit_type_class: 'demolition' }),                // class gate
  ];
  it('estimateCostShared output is deep-equal with the ladder on vs off', () => {
    for (const row of t4Rows) {
      const on = brain.estimateCostShared(row, BASE_CONFIG);
      const off = brain.estimateCostShared(row, { ...BASE_CONFIG, archetypeEnabled: false });
      expect(on).toEqual(off);
    }
  });
});
