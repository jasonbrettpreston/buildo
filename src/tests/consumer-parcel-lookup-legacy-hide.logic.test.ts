// SPEC LINK: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §3.2 (the whitelist; dated note 2026-11-12)
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-38 (EI-D1: legacy values neither sent nor shown)
//            docs/specs/01-pipeline/69a_mcbylaw_register.md M-367 (dated note 2026-11-12, R-1)
//
// EI-D1, operator 2026-11-12, verbatim: "D all as recommended - please ensure this is addedd to the McFrontend decisions"
// (record ~/Buildo-scratch/mcfrontend/phase1/open-questions.md, "Engine inputs (cost / build bigger / neighbours) — rulings
// 2026-11-12"; plan ~/Buildo-scratch/mcbylaws/ENGINE-INPUTS-PLAN.md v2 §4e, compliance M-1: server first, so apps already
// installed stop receiving them). The FE-38 lock: the consumer lookup sends the legacy Spec 88 cost menu and the 12 cost
// scalars as null, and the legacy size headlines (CONSUMER_WITHHELD_LEGACY_COLS) as null, so no legacy value leaves the server.
// The keys stay (installed apps and the report v2 declaration still parse); only the values are withheld.
// The row below carries every withheld field with a distinctive value; none may appear in the serialized payload.
// Retired when MB-43 deletes the legacy columns (the M-367 dated note).
import { describe, expect, it } from 'vitest';
import { assembleConsumerPayload, CONSUMER_WITHHELD_LEGACY_COLS } from '@/lib/parcels/consumer-lookup';
import { ConsumerParcelLookupResponseSchema } from '@/app/api/parcels/lookup/types';
import type { ParcelRow } from '@/lib/admin/parcel-lookup';

// The withheld headline columns (Spec 100 §3.2 dated notes 2026-11-12), each with a value found nowhere else in the row.
// Dated 2026-11-12 (operator "1 b 2 a", item 2 (a)): the three envelope fields join the set (prior text: the nine size headlines only).
const WITHHELD_HEADLINES: Record<string, number | string | boolean> = {
  max_buildable_footprint_sqm: 211.37,
  envelope_constrained: true,
  envelope_constraint_reason: 'setback-zq7',
  opt_aor_gfa_sqm: 382.91,
  opt_aor_storeys: 3.71,
  opt_coa_gfa_sqm: 455.17,
  opt_coa_storeys: 4.13,
  max_buildable_gfa_sqm: 999.33,
  max_build_stories: 7.77,
  max_build_fsi: 3.17,
  coa_fsi: 0.613,
  max_newbuild_coa_gfa_sqm: 631.29,
};

const row = {
  parcel_id: 'EI-D1-LOCK',
  lot_size_sqm: 400,
  lot_size_sqft: 4305,
  ...WITHHELD_HEADLINES,
  parcel_cost_menu: {
    _schema_version: 1,
    max_build: { total: 2503805, per_sqm: 6539, area: 382.9, area_confidence: 'high', norm_basis: 'n/a', trades: null, products: null },
    coa_build: { total: 3111111, per_sqm: 6835, area: 455.2, area_confidence: 'high', norm_basis: 'n/a', trades: null, products: null },
  },
  cost_fb_total: 2503805,
  cost_coa_total: 3111111,
  cost_kitchen_per_sqm: 7771,
  neighbourhood_id: 42,
  neighbourhood_cost_premium: 1.8537, // item 2 (a): compStats.neighbourhoodCostPremium is withheld too
  comp_count: 12,
} as unknown as ParcelRow;

describe('FE-38 (EI-D1): the consumer lookup sends no legacy cost or legacy size value', () => {
  const { payload } = assembleConsumerPayload(row, []);
  const flat = JSON.stringify(payload);

  it('the cost menu and the cost scalars are null (the key shape is kept for installed apps)', () => {
    expect(payload.costMenu).toEqual({ menu: null, scalars: null });
  });

  it('every withheld headline is sent as null, and the withheld list is exactly the ruled set', () => {
    expect([...CONSUMER_WITHHELD_LEGACY_COLS].sort()).toEqual(Object.keys(WITHHELD_HEADLINES).sort());
    for (const c of Object.keys(WITHHELD_HEADLINES)) expect(payload.areas[c]).toBeNull();
  });

  it('no distinctive legacy value appears anywhere in the serialized payload', () => {
    expect(payload.neighbourhood.compStats.neighbourhoodCostPremium).toBeNull();
    const distinctive = Object.values(WITHHELD_HEADLINES).filter((v) => typeof v !== 'boolean');
    for (const v of [...distinctive, 2503805, 3111111, 7771, 6539, 6835, 1.8537]) {
      expect(flat).not.toContain(String(v));
    }
  });

  // Output panel fold (code reviewer, 2026-11-12): a string value in a withheld column (the old string branch) is also null.
  it('a string value in a withheld column is sent as null, not passed through', () => {
    const { payload: p } = assembleConsumerPayload({ ...row, opt_aor_gfa_sqm: '300-400', coa_fsi: 'n/a' } as unknown as ParcelRow, []);
    expect(p.areas.opt_aor_gfa_sqm).toBeNull();
    expect(p.areas.coa_fsi).toBeNull();
    expect(JSON.stringify(p)).not.toMatch(/300-400|"n\/a"/);
  });

  it('the lot facts stay, and the response still passes the strict boundary parse', () => {
    expect(payload.areas.lot_size_sqm).toBe(400);
    expect(payload.areas.lot_size_sqft).toBe(4305);
    const res = ConsumerParcelLookupResponseSchema.safeParse({
      match: { parcelId: 'EI-D1-LOCK', matchType: 'exact', address: '26 Hurlingham Cres' },
      candidates: [], warnings: [], parcel: payload, resolution: 'unique', map: null, page: null, // MF-48 Stage B: the page key
    });
    expect(res.success).toBe(true);
  });
});
