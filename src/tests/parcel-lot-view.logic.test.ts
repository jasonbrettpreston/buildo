// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md (FE-42, the lot-view drawing: four closed states, fail closed)
//            docs/specs/02-web-admin/128_surface_standard_policy.md rules 3, 16, 17
//
// MF-83 group 3 (plan-group3.md D-G3-3, D-G3-4, D-G3-6; operator "Accepted" and "All reco's accepted 1- 4", 2026-11-15) · locks, no DB (migration 325 is
// read as text; the table parcel_lot_view and its job are the pipeline task MB-109's):
//   - lotViewState: the closed states equal the table's list; each gate; exact boundaries at 0.80 and 0.995; require_convex 0; the per-class setback map;
//     no envelope -> never `drawn`
//   - readLotView: 42P01 -> null + warn; no row; geom_hash mismatch; outside the population; classes not one per vertex; a bad ratio or class; the
//     settings missing or outside the seed bounds -> null + error log naming the keys; any other DB error throws; the SQL names the table literally
//   - the seven settings: seed (defaults, bounds, admin group), migration 325 rows equal the seed, ON CONFLICT DO NOTHING, comment-only DOWN
import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const queryMock = vi.fn();
vi.mock('@/lib/db/client', () => ({ query: (...a: unknown[]) => queryMock(...a) }));
const warnMock = vi.fn();
const errorMock = vi.fn();
vi.mock('@/lib/logger', () => ({ logWarn: (...a: unknown[]) => warnMock(...a), logInfo: vi.fn(), logError: (...a: unknown[]) => errorMock(...a) }));

import { lotViewState, LOT_VIEW_STATES, LOT_VIEW_CLASSES, type LotViewRow, type LotViewSettings, type LotViewEvaluated } from '@/lib/parcels/lot-view-rule';
import { readLotView, LOT_VIEW_TABLE, LOT_VIEW_SETTING_KEYS, LOT_VIEW_UNAPPLIED_SQLSTATE } from '@/lib/parcels/lot-view';

const read = (p: string): string => fs.readFileSync(path.resolve(__dirname, '../..', p), 'utf8');
type SeedEntry = { default: number; type: string; min: number; max: number; admin?: { group?: string }; description: string };
const SEED = JSON.parse(read('scripts/seeds/logic_variables.json')) as Record<string, SeedEntry>;
const PAGE = JSON.parse(read('scripts/surfaces/_schema/report-page.json')) as { drawing: { states: string[]; classes: string[] } };
const MIG = read('migrations/325_lot_view_settings.sql');
const SRC = read('src/lib/parcels/lot-view.ts');

const S: LotViewSettings = { requireConvex: true, convexTol: 0.995, minRectangularity: 0.8 };
const ALL: LotViewEvaluated = { front: true, side: true, rear: true };
const row = (o: Partial<LotViewRow> = {}): LotViewRow => ({ rectangularity: 0.95, convexity: 1, edgeConfidence: 'high', edgeClasses: ['front', 'side', 'rear', 'side'], reasons: [], ...o });

describe('lotViewState (the pure eligibility rule)', () => {
  it('the four states and the three classes are the table\'s own lists, in order', () => {
    expect(LOT_VIEW_STATES).toEqual(PAGE.drawing.states);
    expect(LOT_VIEW_STATES).toEqual(['drawn', 'outline_shape', 'outline_edges', 'outline_unevaluated']);
    expect(LOT_VIEW_CLASSES).toEqual(PAGE.drawing.classes);
  });
  it('a convex, rectangular, high-confidence, fully evaluated lot with an envelope is drawn', () => {
    expect(lotViewState(row(), S, ALL, true)).toBe('drawn');
  });
  it('no envelope: never drawn (outline-only until MB-44), outline_unevaluated for a lot that passes the other gates', () => {
    expect(lotViewState(row(), S, ALL, false)).toBe('outline_unevaluated');
  });
  it('rectangularity: exactly the minimum passes, a hair under is outline_shape', () => {
    expect(lotViewState(row({ rectangularity: 0.8 }), S, ALL, true)).toBe('drawn');
    expect(lotViewState(row({ rectangularity: 0.7999999 }), S, ALL, true)).toBe('outline_shape');
  });
  it('convexity: exactly the tolerance passes, a hair under is outline_shape', () => {
    expect(lotViewState(row({ convexity: 0.995 }), S, ALL, true)).toBe('drawn');
    expect(lotViewState(row({ convexity: 0.9949999 }), S, ALL, true)).toBe('outline_shape');
  });
  it('require_convex off: convexity is not tested, rectangularity still is', () => {
    const off = { ...S, requireConvex: false };
    expect(lotViewState(row({ convexity: 0.5 }), off, ALL, true)).toBe('drawn');
    expect(lotViewState(row({ convexity: 0.5, rectangularity: 0.5 }), off, ALL, true)).toBe('outline_shape');
  });
  it('shape is checked before edges and before the evaluated gate', () => {
    expect(lotViewState(row({ rectangularity: 0.1, edgeConfidence: 'low' }), S, { front: false, side: false, rear: false }, false)).toBe('outline_shape');
  });
  it('low edge confidence is outline_edges, checked before the evaluated gate', () => {
    expect(lotViewState(row({ edgeConfidence: 'low' }), S, { front: false, side: false, rear: false }, true)).toBe('outline_edges');
  });
  it('every class the lot has needs an evaluated setback; a class the lot does not have is not asked', () => {
    expect(lotViewState(row(), S, { ...ALL, rear: false }, true)).toBe('outline_unevaluated');
    expect(lotViewState(row(), S, { ...ALL, front: false }, true)).toBe('outline_unevaluated');
    expect(lotViewState(row(), S, { ...ALL, side: false }, true)).toBe('outline_unevaluated');
    expect(lotViewState(row({ edgeClasses: ['front', 'side', 'side'] }), S, { ...ALL, rear: false }, true)).toBe('drawn');
  });
  it('is pure: the same inputs give the same state and nothing is mutated', () => {
    const r = row();
    const snap = JSON.stringify([r, S, ALL]);
    expect(lotViewState(r, S, ALL, true)).toBe(lotViewState(r, S, ALL, true));
    expect(JSON.stringify([r, S, ALL])).toBe(snap);
  });
});

const GOOD = { rectangularity: 0.9, convexity: 0.999, edge_classes: ['front', 'side', 'rear', 'side'], edge_confidence: 'high', reasons: [], geom_hash: 'abc', geom_hash_now: 'abc', vertex_count: 4, polygons: 1, holes: 0 };
const SETTINGS = [
  { variable_key: 'lotview_require_convex', variable_value: '1' },
  { variable_key: 'lotview_convex_tol', variable_value: '0.995' },
  { variable_key: 'lotview_min_rectangularity', variable_value: '0.80' },
];
/** The first query is the row, the second the settings (the order of the reader). */
const answer = (rows: unknown[], settings: unknown[] = SETTINGS): void => { queryMock.mockReset(); queryMock.mockResolvedValueOnce(rows).mockResolvedValueOnce(settings); };
beforeEach(() => { queryMock.mockReset(); warnMock.mockReset(); errorMock.mockReset(); });

describe('readLotView (fail closed, one lot)', () => {
  it('a good row and good settings give the typed row and settings', async () => {
    answer([GOOD]);
    const r = await readLotView('P1');
    expect(r).toEqual({ row: { rectangularity: 0.9, convexity: 0.999, edgeConfidence: 'high', edgeClasses: ['front', 'side', 'rear', 'side'], reasons: [] }, settings: S });
    expect(queryMock.mock.calls[0]![1]).toEqual(['P1']);
  });
  it('SQLSTATE 42P01 (table not applied yet) gives null and a warning; the settings are not read', async () => {
    queryMock.mockRejectedValueOnce(Object.assign(new Error('relation does not exist'), { code: '42P01' }));
    expect(await readLotView('P1')).toBeNull();
    expect(warnMock).toHaveBeenCalledTimes(1);
    expect(queryMock).toHaveBeenCalledTimes(1);
  });
  it('any other database error throws', async () => {
    queryMock.mockRejectedValueOnce(Object.assign(new Error('boom'), { code: '57014' }));
    await expect(readLotView('P1')).rejects.toThrow('boom');
  });
  it('no row for the lot gives null', async () => {
    answer([]);
    expect(await readLotView('P1')).toBeNull();
  });
  it.each([
    ['a geom_hash that is not the lot\'s hash now', { geom_hash: 'old' }],
    ['a multi-polygon lot', { polygons: 2 }],
    ['a lot with a hole', { holes: 1 }],
    ['edge classes not one per vertex', { vertex_count: 5 }],
    ['an unknown edge class', { edge_classes: ['front', 'side', 'rear', 'back'] }],
    ['edge classes that are not a list', { edge_classes: null }],
    ['a confidence outside high/low', { edge_confidence: 'medium' }],
    ['a rectangularity above 1', { rectangularity: 1.2 }],
    ['a null convexity', { convexity: null }],
    ['reasons that are not text', { reasons: [1] }],
  ])('%s gives null and a warning', async (_n, over) => {
    answer([{ ...GOOD, ...over }]);
    expect(await readLotView('P1')).toBeNull();
    expect(warnMock).toHaveBeenCalledTimes(1);
  });
  it.each([
    ['a missing setting', SETTINGS.slice(0, 2), 'lotview_min_rectangularity'],
    ['a null setting', [SETTINGS[0], SETTINGS[1], { variable_key: 'lotview_min_rectangularity', variable_value: null }], 'lotview_min_rectangularity'],
    ['a setting above the seed maximum', [SETTINGS[0], { variable_key: 'lotview_convex_tol', variable_value: '1.5' }, SETTINGS[2]], 'lotview_convex_tol'],
    ['a setting below the seed minimum', [SETTINGS[0], SETTINGS[1], { variable_key: 'lotview_min_rectangularity', variable_value: '0.1' }], 'lotview_min_rectangularity'],
    ['a non-whole switch', [{ variable_key: 'lotview_require_convex', variable_value: '0.5' }, SETTINGS[1], SETTINGS[2]], 'lotview_require_convex'],
    ['no settings at all', [], 'lotview_require_convex'],
  ])('%s gives null and an error log naming the key (the lookup must not 500)', async (_n, settings, key) => {
    answer([GOOD], settings as unknown[]);
    expect(await readLotView('P1')).toBeNull();
    expect(errorMock).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(errorMock.mock.calls[0])).toContain(key);
  });
  it('the table present with the settings absent, and the reverse (no row), give distinct logs', async () => {
    answer([GOOD], []);
    await readLotView('P1');
    expect(errorMock).toHaveBeenCalledTimes(1);
    expect(warnMock).not.toHaveBeenCalled();
    answer([]);
    expect(await readLotView('P2')).toBeNull();
    expect(errorMock).toHaveBeenCalledTimes(1);
  });
  it('locks the names: the table literal in the SQL, the SQLSTATE, the three keys', () => {
    expect(LOT_VIEW_TABLE).toBe('parcel_lot_view');
    expect(SRC).toContain('FROM parcel_lot_view v');
    expect(LOT_VIEW_UNAPPLIED_SQLSTATE).toBe('42P01');
    expect(SRC).toContain('=== LOT_VIEW_UNAPPLIED_SQLSTATE');
    expect(Object.values(LOT_VIEW_SETTING_KEYS)).toEqual(['lotview_require_convex', 'lotview_convex_tol', 'lotview_min_rectangularity']);
  });
  it('the statement is read-only and parameterised (the id is $1, never concatenated)', () => {
    expect(SRC).not.toMatch(/\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE)\b\s+(INTO|\w+\s+SET|FROM|TABLE)/);
    expect(SRC).toContain('WHERE v.parcel_id = $1');
  });
});

const KEYS = ['lotview_require_convex', 'lotview_convex_tol', 'lotview_min_rectangularity', 'lotview_front_max_angle_deg', 'lotview_front_dist_tol_m', 'lotview_rear_max_angle_deg', 'lotview_run_max_turn_deg'];
const upOf = (s: string): string => (s.split(/^--\s*DOWN/m)[0] ?? '').split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');

describe('the seven settings: seed truth and migration 325', () => {
  it('the seed has exactly seven lotview_ keys, with the ruled defaults and bounds, numeric, admin group "Parcel Lookup"', () => {
    expect(Object.keys(SEED).filter((k) => k.startsWith('lotview_'))).toEqual(KEYS);
    const want: Record<string, [number, number, number]> = {
      lotview_require_convex: [1, 0, 1], lotview_convex_tol: [0.995, 0.5, 1], lotview_min_rectangularity: [0.8, 0.5, 1],
      lotview_front_max_angle_deg: [30, 0, 90], lotview_front_dist_tol_m: [2, 0, 10], lotview_rear_max_angle_deg: [45, 0, 90], lotview_run_max_turn_deg: [10, 0, 90],
    };
    for (const k of KEYS) {
      expect([SEED[k]!.default, SEED[k]!.min, SEED[k]!.max], k).toEqual(want[k]);
      expect(SEED[k]).toMatchObject({ type: 'number', admin: { group: 'Parcel Lookup' } });
    }
  });
  it('the three keys the rule reads have a seed bound the reader uses', () => {
    for (const k of Object.values(LOT_VIEW_SETTING_KEYS)) expect(typeof SEED[k]!.min).toBe('number');
  });
  it('migration 325 inserts the seven keys with the seed default, ON CONFLICT (variable_key) DO NOTHING', () => {
    const m = /INSERT INTO logic_variables \(variable_key, variable_value, variable_value_json, description\) VALUES([\s\S]*?)ON CONFLICT \(variable_key\) DO NOTHING;/.exec(upOf(MIG));
    expect(m).not.toBeNull();
    const rows = [...(m![1] ?? '').matchAll(/\('([a-z_]+)',\s*([0-9.]+),\s*NULL,/g)].map((r) => [r[1], Number(r[2])]);
    expect(rows).toEqual(KEYS.map((k) => [k, SEED[k]!.default]));
  });
  it('migration 325 holds settings only: no table, the UP writes nothing else and the DOWN is comment-only', () => {
    expect(upOf(MIG).match(/\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP)\b/g)).toEqual(['INSERT']);
    expect(MIG).not.toMatch(/CREATE TABLE/i);
    for (const l of (MIG.split(/^--\s*DOWN/m)[1] ?? '').split('\n').slice(1)) if (l.trim()) expect(l.trim().startsWith('--'), l).toBe(true);
  });
});
