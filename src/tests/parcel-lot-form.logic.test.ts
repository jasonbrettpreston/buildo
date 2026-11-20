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
const warnMock = vi.fn();
vi.mock('@/lib/logger', () => ({ logWarn: (...a: unknown[]) => warnMock(...a), logInfo: vi.fn(), logError: vi.fn() }));

import { readLotForm, lotFormEffective, lotFormAuditCounts, LOT_FORM_VIEW, LOT_FORM_SETTING_KEYS, LOT_FORM_ZONE_LIST_KEYS } from '@/lib/parcels/lot-form';
import { ConsumerLotFormSchema, ConsumerParcelLookupResponseSchema } from '@/app/api/parcels/lookup/types';

const MIG = fs.readFileSync(path.resolve(__dirname, '../../migrations/320_parcel_lot_form_view.sql'), 'utf8');
const PRES = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../scripts/surfaces/_schema/report-presentation.json'), 'utf8'));
const SEED = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../scripts/seeds/logic_variables.json'), 'utf8'));
const ROUTE = fs.readFileSync(path.resolve(__dirname, '../app/api/parcels/lookup/route.ts'), 'utf8');

beforeEach(() => { queryMock.mockReset(); warnMock.mockReset(); });

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
  it('the view not yet applied (SQLSTATE 42P01, migration 320 is a DB job after the push) reads null and warns: the lookup never 500s, the app never asks', async () => {
    queryMock.mockRejectedValueOnce(Object.assign(new Error('relation "parcel_lot_form" does not exist'), { code: '42P01' }));
    expect(await readLotForm('P6')).toBeNull();
    expect(warnMock).toHaveBeenCalledTimes(1);
  });
  it('any other database error still throws (only the missing view degrades)', async () => {
    queryMock.mockRejectedValueOnce(Object.assign(new Error('connection lost'), { code: '08006' }));
    await expect(readLotForm('P7')).rejects.toThrow('connection lost');
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
    for (const k of LOT_FORM_SETTING_KEYS.filter((x) => x.startsWith('semi_doubt_'))) {
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
  // The once-per-hit lock counts the call sites in the flow file; the plant shows zero and two calls are both seen.
  const readLotFormCalls = (src: string): number => (src.replace(/^\s*\/\/.*$/gm, '').match(/\breadLotForm\(/g) ?? []).length;
  it('RED plant: the once-in-flow lock sees no call and a doubled call; the control sees one', () => {
    expect(readLotFormCalls('const lotForm = await readLotForm(ref);')).toBe(1);
    expect(readLotFormCalls('const a = 1;')).toBe(0);
    expect(readLotFormCalls('await readLotForm(a); await readLotForm(b);')).toBe(2);
  });
  it('the route reads the view once per hit and logs the outcome, never the answer text', () => {
    // STD.ROUTE (task-383): the readLotForm( token pin on the route is dropped (the read moved to the flow file, which keeps it once per hit); the log pin stays on the route.
    expect(readLotFormCalls(fs.readFileSync(path.resolve(__dirname, '../lib/parcels/lookup-flow.ts'), 'utf8'))).toBe(1);
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

// ─────────────────────────────────────────────────────────────────────────────
// SEMI-B2 · operator ruling (a), 2026-11-14 (plan ~/Buildo-scratch/mcbylaws/SEMI-O4/plan.md "Operator 2026-11-14 ... verbatim: a";
// plan-b2.md): (1) detection only on residential zones, (2) an RD two-parcel match is asked, (3) a shared length above
// semi_auto_max_shared_len_m is asked. Migration 323 amends the view; every cut is a registered setting (Spec 132 core.8).
// ─────────────────────────────────────────────────────────────────────────────
describe('SEMI-B2 migration 323: zone gate, RD ask and long-wall ask are registered settings', () => {
  const MIG323 = fs.readFileSync(path.resolve(__dirname, '../../migrations/323_semi_o4_zone_and_wall_asks.sql'), 'utf8');
  const VIEW323 = MIG323.slice(MIG323.indexOf('CREATE OR REPLACE VIEW'));
  const DESC = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_semi_question.descriptor.json'), 'utf8'));
  const RESIDENTIAL = SEED.resolve_bylaws_population_zone_classes.default; // the repo's Residential Zone category (R, RD, RS, RT, RM; Spec 130, Spec 134 §2)

  it('L1 the zone lists are the repo residential list (not invented), closed, non-empty; the ask list defaults to RD', () => {
    expect(RESIDENTIAL).toEqual(['R', 'RD', 'RS', 'RT', 'RM']);
    expect(SEED.semi_detect_zone_classes).toMatchObject({ type: 'list', default: RESIDENTIAL });
    expect(SEED.semi_ask_two_parcel_zone_classes).toMatchObject({ type: 'list', default: ['RD'] });
    for (const k of LOT_FORM_ZONE_LIST_KEYS) {
      expect(SEED[k].admin?.hidden, `${k}: list variables are hidden internal (Q-J)`).toBe('internal');
      expect(MIG323, k).toContain(`'${k}'`);
    }
    expect(MIG323).toMatch(/'semi_detect_zone_classes', 0, '\["R","RD","RS","RT","RM"\]'::jsonb/);
    expect(MIG323).toMatch(/'semi_ask_two_parcel_zone_classes', 0, '\["RD"\]'::jsonb/);
  });

  it('L1 the long-wall limit is a number setting in the existing semi group: default 60, bounds 10..500', () => {
    expect(LOT_FORM_SETTING_KEYS).toContain('semi_auto_max_shared_len_m');
    expect(SEED.semi_auto_max_shared_len_m).toMatchObject({ type: 'number', default: 60, min: 10, max: 500 });
    expect(SEED.semi_auto_max_shared_len_m.admin?.group).toBe('Parcel Lookup');
    expect(MIG323).toMatch(/'semi_auto_max_shared_len_m', 60, NULL/);
  });

  it('L2 the view gates detection on the zone list and asks on the RD list and on the long wall', () => {
    expect(VIEW323).toMatch(/semi_detect_zone_classes/);
    expect(VIEW323).toMatch(/semi_ask_two_parcel_zone_classes/);
    expect(VIEW323).toMatch(/semi_auto_max_shared_len_m/);
    expect(VIEW323).toMatch(/zoning_class\s*=\s*ANY\s*\(\s*cfg\.detect_zones\s*\)/);
    expect(VIEW323).toMatch(/zoning_class\s*=\s*ANY\s*\(\s*cfg\.ask_zones\s*\)/);
    expect(VIEW323).toMatch(/best_shared_len_m\s*>\s*cfg\.auto_max_len/);
  });

  it('L2 the two new asks are not switched off by the doubt switch (the ruling is not a doubt cut)', () => {
    const askLines = VIEW323.split('\n').filter((l) => /cfg\.ask_zones|cfg\.auto_max_len/.test(l));
    expect(askLines.length).toBeGreaterThan(0);
    for (const l of askLines) expect(l).not.toContain('cfg.doubt_on');
  });

  it('L2 no rule number is a literal in the view: the only numbers are the COALESCE/CASE fallbacks, equal to the seed defaults and bounds', () => {
    expect(MIG323).toMatch(/BETWEEN 10 AND 500 THEN v\.n ELSE 60[\s\S]{0,300}'semi_auto_max_shared_len_m'\), 60\)/);
    expect(VIEW323).not.toMatch(/>\s*60\b/);
    expect(VIEW323).not.toMatch(/zoning_class\s*=\s*'RD'/); // the RD ask is the setting, never a literal in the view body
    expect(VIEW323).not.toMatch(/confidence/i);
  });

  it('L3 on_invalid: each new setting declares "default" with a why in the descriptor, and the view falls back to the seeded default', () => {
    const rows = DESC.config.logic_variables as Array<{ name: string; on_invalid: string; why?: string }>;
    for (const k of ['semi_detect_zone_classes', 'semi_ask_two_parcel_zone_classes', 'semi_auto_max_shared_len_m']) {
      const r = rows.find((x) => x.name === k);
      expect(r, k).toBeTruthy();
      expect(r?.on_invalid, k).toBe('default');
      expect(r?.why, k).toBeTruthy();
    }
    // lists: a non-array or empty array reads as the default; the number: out of bounds reads as the default
    expect(VIEW323).toMatch(/jsonb_typeof\(/);
    expect(VIEW323).toMatch(/jsonb_array_length\(/);
  });

  it('L4 the owed card: semi_doubt_min_shared_len_m is the shared lot line, not the party wall (seed and migration 323)', () => {
    const d = String(SEED.semi_doubt_min_shared_len_m.description);
    expect(d).toMatch(/shared lot line/i);
    expect(d).not.toMatch(/party wall/i);
    expect(MIG323).toMatch(/UPDATE logic_variables SET description = '[^']*shared lot line[^']*'\s+WHERE variable_key = 'semi_doubt_min_shared_len_m'/);
  });

  it("L4 the view comment and the switch description no longer say party wall, and the switch says the ruling asks are independent of it", () => {
    expect(MIG323).toMatch(/COMMENT ON VIEW parcel_lot_form IS/);
    const comment = MIG323.slice(MIG323.indexOf("COMMENT ON VIEW"), MIG323.indexOf("COMMENT ON VIEW") + 2500).split("\n-- DOWN")[0];
    expect(comment).not.toMatch(/party wall/i);
    expect(String(SEED.semi_doubt_enabled.description)).toMatch(/semi_detect_zone_classes|operator "a"|ruling/);
    expect(MIG323).toMatch(/UPDATE logic_variables SET description = '[^']*'\s+WHERE variable_key = 'semi_doubt_enabled'/);
  });

  it("L3 the closed-list check is in the view: every member must be one of the five residential codes", () => {
    expect(VIEW323).toMatch(/NOT EXISTS|<@/);
    expect(VIEW323).toMatch(/ARRAY\['R','RD','RS','RT','RM'\]/);
  });

  it('is written, not applied: a view amendment and settings rows only, same view columns, no table change', () => {
    expect(MIG323).not.toMatch(/ALTER TABLE|CREATE TABLE/i);
    expect(MIG323).toMatch(/ON CONFLICT \(variable_key\) DO NOTHING/);
    for (const c of ['parcel_id', 'lot_form_detected', 'lot_form_basis', 'unsure', 'linked_parcel_count', 'best_shared_len_m']) expect(VIEW323).toContain(c);
  });
});
