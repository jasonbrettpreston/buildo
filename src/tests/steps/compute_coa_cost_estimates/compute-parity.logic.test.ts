// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §4.5 (legacy oracle)
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rule 2 (R-BZ), R-DF
//
// Phase-4 wave 4 lane C, full-form row 7 (Spec 123 §7; Spec 124 R-EH). The pure compute
// `scripts/lib/compute/compute-coa-cost-estimates.js` must produce the SAME rows the frozen legacy text
// writes, for the same source rows and lookups: cost_estimates (16 values minus the runner-stamped
// computed_at) and the coa_applications cost columns (minus the runner-stamped cost_classified_at).
import { describe, it, expect } from 'vitest';
import path from 'path';

import { loadLegacy, SEEDED, type SourceRow } from './fixtures/legacy-harness';

const REPO_ROOT = path.resolve(__dirname, '../../../../');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const compute = require(path.join(REPO_ROOT, 'scripts/lib/compute/compute-coa-cost-estimates.js')) as {
  materializeRows(rows: SourceRow[], ctx: { config: Record<string, unknown>; lookups: Record<string, unknown[]> }): { rows: { e1: Record<string, unknown>[]; e2: Record<string, unknown>[] }; matched: Record<string, unknown> };
};

const RATES = [{ trade_slug: 'plumbing', base_rate_sqft: 10, structure_complexity_factor: 1 }];
const ROWS: SourceRow[] = [
  { id: 1, lead_id: 'coa:A1', scope_tags: ['rear-addition'], structure_type: 'sfd', project_type: 'Addition', cost_addition_total: 250000, neighbourhood_cost_premium: 1.1, opt_aor_gfa_sqm: 40, parcel_id: 7, lot_size_sqm: 300, frontage_m: 10, active_trade_slugs: ['plumbing'] },
  { id: 2, lead_id: 'coa:B2', scope_tags: ['severance'], structure_type: 'sfd', project_type: 'Severance', parcel_id: 7, active_trade_slugs: ['plumbing'] },
  { id: 3, lead_id: 'coa:C3', scope_tags: [], structure_type: 'sfd', project_type: 'Alteration', parcel_id: null, active_trade_slugs: [] },
];

describe('compute_coa_cost_estimates compute ≡ legacy oracle (rows, counters)', () => {
  it('cost_estimates and coa_applications rows match the legacy INSERT / UPDATE params', async () => {
    const o = loadLegacy({ rows: ROWS, tradeRates: RATES });
    await o.runMain();
    const ins = o.queries.find((q) => /^\s*INSERT INTO cost_estimates/.test(q.sql));
    const legacyCe: unknown[][] = [];
    for (let i = 0; i < (ins?.params.length ?? 0); i += 16) legacyCe.push((ins?.params ?? []).slice(i, i + 15));
    const upd = o.queries.find((q) => /^\s*UPDATE coa_applications/.test(q.sql));
    const legacyCa: unknown[][] = [];
    for (let i = 0; i + 4 <= (upd?.params.length ?? 1) - 1; i += 4) legacyCa.push((upd?.params ?? []).slice(i, i + 4));

    const out = compute.materializeRows(ROWS, {
      config: { ...SEEDED, archetype_cost_enabled: 1 },
      lookups: { trade_sqft_rates: RATES, scope_intensity_matrix: [], archetype_cost_rates: [] },
    });
    const ceCols = ['lead_id', 'permit_num', 'revision_num', 'estimated_cost', 'cost_source', 'cost_tier', 'cost_range_low', 'cost_range_high', 'premium_factor', 'complexity_score', 'model_version', 'is_geometric_override', 'modeled_gfa_sqm', 'effective_area_sqm', 'trade_contract_values'];
    const draftCe = out.rows.e1.map((r) => ceCols.map((c) => (c === 'trade_contract_values' ? JSON.stringify(r[c]) : r[c])));
    expect(draftCe).toEqual(legacyCe);
    expect(out.rows.e2.map((r) => [r.id, r.modeled_gfa_sqm, r.estimated_cost, r.cost_source])).toEqual(legacyCa);

    const meta = o.summaries[0]?.records_meta as Record<string, unknown>;
    expect(out.matched.null_cost_reasons).toEqual(meta.null_cost_reasons);
    expect(out.matched.null_cost_reasons_additive).toEqual(meta.null_cost_reasons_additive);
    expect(out.matched.coa_with_cost).toBe(meta.coa_with_cost);
  });
});
