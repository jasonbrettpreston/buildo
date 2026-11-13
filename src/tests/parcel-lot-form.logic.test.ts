// SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md O-4, ML-4, the lot_form_detected row (dated note 2026-11-13)
//            docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §3.2 (the lookup payload; dated note 2026-11-13)
//
// SEMI-B · the semi detector's server half (operator "semi all y" and "semi ask a", 2026-11-13; plan ~/Buildo-scratch/mcbylaws/SEMI-O4/plan.md).
// The rule lives in ONE place, the view `parcel_lot_form` (migration 320); the lookup only READS its row. Locks:
//   - the view reads the three settings and holds no cut as a literal rule number (every cut is a logic variable)           [L-SEMI c, h]
//   - readLotForm maps the view row to the response block, null when the lot has no row                                      [L-SEMI a, b, e]
//   - the shared pure function lotFormEffective = override ?? detected (O-12: the pipeline never reads the override)          [L-SEMI d]
//   - a semi lot never carries a suite add-on or new-build card kinds (presentation lot_form_rules.semi_half)                  [L-SEMI f, g]
//   - the response schema carries the block only with a parcel, strictly
import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const queryMock = vi.fn();
vi.mock('@/lib/db/client', () => ({ query: (...a: unknown[]) => queryMock(...a) }));

import { readLotForm, lotFormEffective, lotFormAuditCounts, LOT_FORM_VIEW, LOT_FORM_SETTING_KEYS } from '@/lib/parcels/lot-form';
import { ConsumerLotFormSchema, ConsumerParcelLookupResponseSchema } from '@/app/api/parcels/lookup/types';

const MIG = fs.readFileSync(path.resolve(__dirname, '../../migrations/320_parcel_lot_form_view.sql'), 'utf8');
const PRES = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../scripts/surfaces/_schema/report-presentation.json'), 'utf8'));
const SEED = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../scripts/seeds/logic_variables.json'), 'utf8'));
const ROUTE = fs.readFileSync(path.resolve(__dirname, '../app/api/parcels/lookup/route.ts'), 'utf8');

beforeEach(() => queryMock.mockReset());

describe('readLotForm (the lookup reads the view row)', () => {
  it('a strict O-4 lot: semi_half, basis o4_two_parcel_abut, not unsure (L-SEMI a)', async () => {
    queryMock.mockResolvedValueOnce([{ lot_form_detected: 'semi_half', lot_form_basis: 'o4_two_parcel_abut', unsure: false }]);
    expect(await readLotForm('P1')).toEqual({ detected: 'semi_half', basis: 'o4_two_parcel_abut', unsure: false });
  });
  it('a three-parcel footprint lot: semi_half, doubt basis, unsure (L-SEMI b)', async () => {
    queryMock.mockResolvedValueOnce([{ lot_form_detected: 'semi_half', lot_form_basis: 'doubt_multi_parcel_abut', unsure: true }]);
    expect(await readLotForm('P2')).toEqual({ detected: 'semi_half', basis: 'doubt_multi_parcel_abut', unsure: true });
  });
  it('a detached lot: detached, never unsure (L-SEMI e)', async () => {
    queryMock.mockResolvedValueOnce([{ lot_form_detected: 'detached', lot_form_basis: 'o4_not_met', unsure: false }]);
    expect(await readLotForm('P3')).toEqual({ detected: 'detached', basis: 'o4_not_met', unsure: false });
  });
  it('no row (an unknown lot) is null, never a guess', async () => {
    queryMock.mockResolvedValueOnce([]);
    expect(await readLotForm('NOPE')).toBeNull();
  });
  it('a row the contract does not know throws (a drifted view is loud, not a silent detached)', async () => {
    queryMock.mockResolvedValueOnce([{ lot_form_detected: 'triplex', lot_form_basis: 'x', unsure: false }]);
    await expect(readLotForm('P4')).rejects.toThrow();
  });
  it('reads the view by the lot id with a parameter (no concatenation)', async () => {
    queryMock.mockResolvedValueOnce([]);
    await readLotForm('P5');
    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain(LOT_FORM_VIEW);
    expect(sql).toContain('$1');
    expect(sql).not.toContain('P5');
    // one-lot pushdown: the id is a scalar subquery, never a JOIN to parcels (a JOIN scans every parcel through the view's lateral: 2.9 s vs 0.4 ms)
    expect(sql).toMatch(/l\.parcel_id = \(SELECT p\.id FROM parcels p WHERE p\.parcel_id = \$1\)/);
    expect(sql).not.toMatch(/JOIN parcels/i);
    expect(params).toEqual(['P5']);
  });
});

describe('lotFormEffective (the shared pure function, P5.7; O-12)', () => {
  it('no override: the detected form', () => {
    expect(lotFormEffective('semi_half', null)).toBe('semi_half');
    expect(lotFormEffective('detached', null)).toBe('detached');
  });
  it("the owner's 'detached' correction restores the full report (L-SEMI d)", () => {
    expect(lotFormEffective('semi_half', 'detached')).toBe('detached');
  });
  it("the owner's 'yes, a semi' answer makes a detected-detached lot a semi", () => {
    expect(lotFormEffective('detached', 'semi_half')).toBe('semi_half');
  });
});

describe('the view (migration 320) keeps every cut in a logic variable (L-SEMI c, h)', () => {
  it('reads each of the three settings by key, and each is in the seed with bounds and an admin group', () => {
    for (const k of LOT_FORM_SETTING_KEYS) {
      expect(MIG).toContain(`'${k}'`);
      const s = SEED[k];
      expect(s, k).toBeTruthy();
      expect(typeof s.min).toBe('number');
      expect(typeof s.max).toBe('number');
      expect(s.admin?.group, k).toBe('Parcel Lookup');
    }
  });
  it('the switch is 0/1 and strict-only when off: the doubt arms are all guarded by the switch', () => {
    expect(SEED.semi_doubt_enabled).toMatchObject({ min: 0, max: 1, default: 1 });
    const view = MIG.slice(MIG.indexOf('CREATE OR REPLACE VIEW'));
    // Every arm that is not the strict two-parcel test mentions cfg.doubt_on.
    const arms = view.split('\n').filter((l) => l.includes('cfg.max_link') && l.includes('best_shared_len_m'));
    expect(arms.length).toBeGreaterThan(0);
    for (const l of arms) expect(l).toContain('cfg.doubt_on');
  });
  it('the three defaults in the seed equal the migration and the view COALESCE fallbacks', () => {
    expect(SEED.semi_doubt_max_link_parcels.default).toBe(3);
    expect(SEED.semi_doubt_min_shared_len_m.default).toBe(5);
    expect(MIG).toMatch(/'semi_doubt_max_link_parcels', 3, NULL/);
    expect(MIG).toMatch(/'semi_doubt_min_shared_len_m', 5, NULL/);
    expect(MIG).toMatch(/'semi_doubt_max_link_parcels'\), 3\)/);
    expect(MIG).toMatch(/'semi_doubt_min_shared_len_m'\), 5\)/);
  });
  it('link confidence is not a gate (plan key finding: nearest 0.60 is the semi signature)', () => {
    const view = MIG.slice(MIG.indexOf('CREATE OR REPLACE VIEW'));
    expect(view).not.toMatch(/confidence/i);
  });
  it('is a read-only view over the existing tables: no stored column', () => {
    expect(MIG).not.toMatch(/ALTER TABLE|CREATE TABLE/i);
  });
});

describe('a semi lot (presentation lot_form_rules; Q-1, Q-2, Q-3) (L-SEMI f, g)', () => {
  const semi = PRES.lot_form_rules.semi_half;
  it('shows renovation cards only, no headline, no suite add-on', () => {
    expect(semi.show_card_kinds).toEqual(['renovation']);
    expect(semi.headline).toBeNull();
    expect(semi.suite_add_on).toBe(false);
  });
  it('the correction writes lot_form_user_override = detached', () => {
    expect(semi.correction.field).toBe('scenarios.lot_form.lot_form_user_override');
    expect(semi.correction.value).toBe('detached');
  });
});

describe('the lookup payload', () => {
  const base = {
    match: { parcelId: 'P1', matchType: 'exact', address: '1 Main St' },
    candidates: [],
    warnings: [],
    resolution: 'unique',
    map: null,
    page: null,
  };
  it('the block is strict and closed', () => {
    expect(ConsumerLotFormSchema.safeParse({ detected: 'semi_half', basis: 'o4_two_parcel_abut', unsure: false }).success).toBe(true);
    expect(ConsumerLotFormSchema.safeParse({ detected: 'semi_half', basis: 'o4_two_parcel_abut', unsure: false, shared: 3 }).success).toBe(false);
    expect(ConsumerLotFormSchema.safeParse({ detected: 'maybe', basis: 'o4_two_parcel_abut', unsure: false }).success).toBe(false);
  });
  it('a response without the block still parses (older callers) and reads null', () => {
    const r = ConsumerParcelLookupResponseSchema.safeParse({ ...base, parcel: null, match: null });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.lotForm).toBeNull();
  });
  it('the block is present only with a parcel (a hit)', () => {
    const r = ConsumerParcelLookupResponseSchema.safeParse({
      ...base,
      match: null,
      parcel: null,
      lotForm: { detected: 'semi_half', basis: 'o4_two_parcel_abut', unsure: false },
    });
    expect(r.success).toBe(false);
  });
  it('the route reads the view once per hit and logs the outcome, never the answer text', () => {
    expect(ROUTE).toContain('readLotForm(');
    expect(ROUTE).toMatch(/lot_form_unsure/);
  });
});

describe('the read-only audit count (D6)', () => {
  it('groups the view by band and reports corrections as null (not stored), never 0', async () => {
    queryMock.mockResolvedValueOnce([
      { lot_form_detected: 'detached', lot_form_basis: 'o4_not_met', unsure: false, lots: '371799' },
      { lot_form_detected: 'semi_half', lot_form_basis: 'doubt_multi_parcel_abut', unsure: true, lots: '21565' },
    ]);
    const c = await lotFormAuditCounts();
    expect(c.bands).toEqual([
      { detected: 'detached', basis: 'o4_not_met', unsure: false, lots: 371799 },
      { detected: 'semi_half', basis: 'doubt_multi_parcel_abut', unsure: true, lots: 21565 },
    ]);
    expect(c.corrections).toBeNull();
    const [sql] = queryMock.mock.calls[0] as [string];
    expect(sql).toMatch(/^\s*SELECT/);
    expect(sql).not.toMatch(/INSERT|UPDATE|DELETE|ALTER|CREATE|DROP/i);
  });
});
