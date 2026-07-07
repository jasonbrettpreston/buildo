/**
 * coa-cost-model.regression.test.ts
 *
 * SPEC LINK: docs/specs/01-pipeline/83_lead_cost_model.md §3.A "Geometric-Only Path for CoA Leads"
 * SPEC LINK: docs/specs/01-pipeline/83_lead_cost_model.md §3-ARCHETYPE (CoA: same ladder minus T1)
 *
 * Regression coverage for the CoA path. Block 1 (buildCoaConfig scopeMatrix
 * production-vocabulary compatibility) is retained — the T4 legacy path still
 * builds the matrix. Block 2 (PI-5) is REPLACED (WF2 Phase C, 2026-07-06) with
 * an equivalent lock against the new archetype ladder: the ladder is a separate
 * pricing path that never consults the matrix, and the T4 fallthrough still uses
 * the unchanged narrow mapCoaRowToBrainInput (the PI-5 fence).
 *
 * PI-5 finding: CoA applications carry NULL structure_type and lack permit_type
 * entirely (33,119 apps, 0 with structure_type populated; 100% of CoA
 * cost_estimates are cost_source='geometric'). Therefore the WF1 production-
 * vocabulary re-key has zero behavioural impact on CoA leads — they continue
 * to safe-skip the matrix and fall through to the geometric path.
 *
 * This test asserts: (a) buildCoaConfig consumes the new production-vocabulary
 * matrix rows without throwing; (b) the resulting scopeMatrix is keyed on
 * production-vocabulary strings, not normalized lowercase.
 */

import { describe, it, expect } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { buildCoaConfig, mapCoaRowToBrainInput, buildCoaArchetypeInput } = require('../../scripts/lib/coa-cost-model');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { tryArchetypeCost } = require('../../src/features/leads/lib/cost-model-shared');

const PRODUCTION_VOCAB_MATRIX_ROWS = [
  { permit_type: 'Small Residential Projects',     structure_type: 'SFD - Detached',                gfa_allocation_percentage: 0.25 },
  { permit_type: 'New Houses',                     structure_type: 'SFD - Detached',                gfa_allocation_percentage: 1.00 },
  { permit_type: 'Building Additions/Alterations', structure_type: 'Office',                        gfa_allocation_percentage: 0.20 },
];

const TRADE_RATES = [
  { trade_slug: 'plumbing', base_rate_sqft: 195, structure_complexity_factor: 1.40 },
];

const LOGIC_VARS = {
  liar_gate_threshold: 0.25,
  model_range_pct: 0.20,
  fallback_range_pct: 0.30,
  urban_coverage_ratio: 0.7,
  suburban_coverage_ratio: 0.4,
};

describe('CoA buildCoaConfig — WF1 production-vocabulary compatibility', () => {
  it('builds the scopeMatrix keyed on production-vocabulary strings (Title Case)', () => {
    const cfg = buildCoaConfig({
      tradeRates: TRADE_RATES,
      scopeMatrix: PRODUCTION_VOCAB_MATRIX_ROWS,
      logicVars: LOGIC_VARS,
    });
    expect(cfg.scopeMatrix['Small Residential Projects::SFD - Detached']).toBe(0.25);
    expect(cfg.scopeMatrix['New Houses::SFD - Detached']).toBe(1.00);
    expect(cfg.scopeMatrix['Building Additions/Alterations::Office']).toBe(0.20);
  });

  it('does NOT lowercase the keys (G11 — symmetric with permits Brain)', () => {
    const cfg = buildCoaConfig({
      tradeRates: TRADE_RATES,
      scopeMatrix: PRODUCTION_VOCAB_MATRIX_ROWS,
      logicVars: LOGIC_VARS,
    });
    expect(cfg.scopeMatrix['small residential projects::sfd - detached']).toBeUndefined();
  });

  it('trims whitespace defensively (G11)', () => {
    const cfg = buildCoaConfig({
      tradeRates: TRADE_RATES,
      scopeMatrix: [
        { permit_type: '  Building Additions/Alterations  ', structure_type: ' Office ', gfa_allocation_percentage: 0.20 },
      ],
      logicVars: LOGIC_VARS,
    });
    expect(cfg.scopeMatrix['Building Additions/Alterations::Office']).toBe(0.20);
  });
});

// §3-ARCHETYPE (WF2 Phase C, 2026-07-06): Block 2 replaced. The old PI-5 lock
// asserted the geometric-only path never synthesized permit_type/structure_type
// into a matrix call. The archetype ladder now supersedes that path for low-rise
// residential CoAs — but the PI-5 FENCE STILL HOLDS: the ladder is a separate
// pricing path that never consults the scope_intensity_matrix, and the T4
// fallthrough still uses the unchanged narrow `mapCoaRowToBrainInput`.
const ARCH_CONFIG = {
  tradeRates: { plumbing: { base_rate_sqft: 195, structure_complexity_factor: 1.4 } },
  scopeMatrix: {},
  archetypeEnabled: true,
  archetypeRates: {} as Record<string, number>,
  archetypeT1FsiMin: 0.05,
  archetypeT1FsiMax: 8,
  archetypeT1TotalCap: 25_000_000,
  archetypeT2RenoCap: 10_000_000,
  archetypeT2BuildCap: 20_000_000,
  archetypeT2BuildMin: 200_000,
};

describe('CoA archetype path — PI-5 fence re-locked against the new ladder (Phase C)', () => {
  it('T4 fallthrough still omits permit_type/structure_type (mapCoaRowToBrainInput fence)', () => {
    // The legacy geometric path (T4) must never synthesize matrix inputs — this
    // is the byte-identical fence the ladder falls through to.
    const brainInput = mapCoaRowToBrainInput({
      lead_id: 'coa:A0001/26',
      scope_tags: ['kitchen'],
      project_type: 'Addition',
    });
    expect(brainInput.permit_type).toBeFalsy();
    expect(brainInput.structure_type).toBeFalsy();
  });

  it('buildCoaArchetypeInput sets _is_coa and carries NO permit_type (never enters the matrix)', () => {
    const archRow = buildCoaArchetypeInput({
      lead_id: 'coa:A0002/26',
      project_type: 'Mixed',
      structure_type: 'SFD - Detached',
      scope_tags: ['kitchen'],
      cost_coa_total: 500_000,
      opt_coa_gfa_sqm: 200,
    });
    expect(archRow._is_coa).toBe(true);
    expect(archRow.permit_type).toBeUndefined();
    // CoA has no applicant-declared area → T1/T3 own-area fields absent.
    expect(archRow.residential_sqm).toBeUndefined();
    expect(archRow.interior_alterations_sqm).toBeUndefined();
  });

  it('a low-rise residential CoA prices via T2 (archetype_parcel), is_geometric_override=false', () => {
    // NewConstruction → coa_build; cost_coa_total is the propagated T2 line total.
    const archRow = buildCoaArchetypeInput({
      lead_id: 'coa:A0003/26',
      project_type: 'NewConstruction',
      structure_type: 'SFD - Detached',
      scope_tags: [],
      cost_coa_total: 850_000,
      opt_coa_gfa_sqm: 240,
      neighbourhood_cost_premium: 1.2,
    });
    const r = tryArchetypeCost(archRow, ARCH_CONFIG);
    expect(r).not.toBeNull();
    expect(r.cost_source).toBe('archetype_parcel');
    expect(r._archetypeTier).toBe('t2');
    expect(r.estimated_cost).toBe(850_000); // the propagated total, premium NOT re-applied
    expect(r.is_geometric_override).toBe(false);
  });

  it('T1/T3 never fire on CoA — an own area is absent so a no-scalar CoA falls to T4 (null)', () => {
    // No propagated scalar + no own area (CoA has none) → tryArchetypeCost returns
    // null → the caller falls through to the legacy T4 geometric path.
    const archRow = buildCoaArchetypeInput({
      lead_id: 'coa:A0004/26',
      project_type: 'Alteration',
      structure_type: 'SFD - Detached',
      scope_tags: ['kitchen'],
      cost_kitchen_per_sqm: null,
      cur_est_kitchen_gfa_sqm: null,
    });
    const r = tryArchetypeCost({ ...archRow }, { ...ARCH_CONFIG, archetypeRates: { KIT: 3000 } });
    // KIT rate exists but there is NO own area on CoA → T3 cannot fire → T4.
    expect(r).toBeNull();
  });

  it('non-lowrise CoA (Apartment Building) never enters the ladder → T4', () => {
    const archRow = buildCoaArchetypeInput({
      lead_id: 'coa:A0005/26',
      project_type: 'NewConstruction',
      structure_type: 'Apartment Building',
      scope_tags: [],
      cost_coa_total: 5_000_000,
      opt_coa_gfa_sqm: 2000,
    });
    expect(tryArchetypeCost(archRow, ARCH_CONFIG)).toBeNull();
  });
});
