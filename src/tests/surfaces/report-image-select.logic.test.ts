// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11a.7 (dated note 2026-11-11, MF-38: single image per option),
//            docs/specs/02-web-admin/128_surface_standard_policy.md Rule 16 (no maths; dated note 2026-11-11: the scan reaches the selection),
//            docs/specs/01-pipeline/114_rls_policy_catalog.md section 6 (thresholds are logic_variables values, injected).
//
// MF-38 · McFrontend queue · lane MF-38. THE selector lock (operator 2026-11-09 "targeted scenario images": a closed selector list, precedence
// storeys > corner > frontage band > design group > income band, the most specific matching set wins, step-wise fallback to the scenario default;
// v1 ships default images only). Single image per option (O-1 b, 2026-11-11): the chosen set yields its lowest-position image.
// The function is pure; every threshold is injected; the closed selector list is report-images.json. No DB, no network.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ImageSelectError, selectImage, type ImageSet } from '../../lib/surfaces/report-images/select';
import { loadInputs } from '../../../scripts/analysis/report-schema.mjs';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- JSON under test
const ROOT = process.cwd();
const CFG: Json = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/surfaces/_schema/report-images.json'), 'utf8'));
const EDGES = { narrow_max: 9, wide_min: 15 }; // injected test values; the real ones are logic_variables rows (D-3 a)
const FACTS = { storeys: 3, corner: true, frontage_m: 12 };
const img = (asset_id: string, position = 0, alt = `Alt ${asset_id}`): Json => ({ asset_id, alt, position });
const set = (rule: Json | null, ...images: Json[]): ImageSet => ({ rule, images } as ImageSet);
const pick = (sets: ImageSet[], facts: Json = FACTS, edges: Json = EDGES): string | null => selectImage(sets, facts as never, edges as never, CFG)?.asset_id ?? null;
const throwsWith = (fn: () => unknown, text: string): void => {
  let got: unknown = null;
  try { fn(); } catch (e) { got = e; }
  expect(got).toBeInstanceOf(ImageSelectError);
  expect((got as ImageSelectError).message).toContain(text);
};

describe('MF-38 selector: the data file is the ruled precedence', () => {
  it('selector order is storeys, corner, frontage_band; design_group and income_band are named and deferred', () => {
    expect(CFG.selectors.map((s: Json) => s.id)).toEqual(['storeys', 'corner', 'frontage_band']);
    expect(CFG.deferred).toEqual(['design_group', 'income_band']);
  });
  it('every selector member resolves through the RS-1 resolvers (catalogue row, parcels migration column) and its kind is in the closed binding set', () => {
    const inp = loadInputs(ROOT);
    const kinds = Object.keys(inp.bindingSources.sources);
    const rows = new Set(inp.catalogue.rows.map((r: Json) => r.id));
    for (const s of CFG.selectors as Json[]) {
      const [kind, ref] = String(s.member).split(':');
      expect(kinds, s.member).toContain(kind);
      if (kind === 'catalogue') expect(rows.has(ref), s.member).toBe(true);
      else if (kind === 'parcels') expect(inp.parcels_columns, s.member).toContain(ref);
      else throw new Error(`selector ${s.id}: kind ${kind} has no resolver here`);
    }
  });
  it('the frontage bands are declared with the two logic_variables key names (the values are injected, never in this file)', () => {
    expect(CFG.bands.frontage.ids).toEqual(['narrow', 'standard', 'wide']);
    expect(Object.keys(CFG.bands.frontage.edges).sort()).toEqual(['narrow_max', 'wide_min']);
    for (const v of Object.values(CFG.bands.frontage.edges)) expect(String(v)).toMatch(/^[a-z][a-z0-9_]*$/);
  });
});

describe('MF-38 selector: choice', () => {
  it('a. default only -> the default image', () => {
    expect(pick([set(null, img('d0'))])).toBe('d0');
  });
  it('b. storeys beats corner beats frontage (three sets, three matching facts)', () => {
    const s = [set({ frontage_band: 'standard' }, img('f')), set({ corner: true }, img('c')), set({ storeys: 3 }, img('s')), set(null, img('d'))];
    expect(pick(s)).toBe('s');
    expect(pick(s.filter((x) => x.rule?.storeys === undefined))).toBe('c');
    expect(pick(s.filter((x) => x.rule?.storeys === undefined && x.rule?.corner === undefined))).toBe('f');
  });
  it('c. {storeys, corner} beats {storeys}; {storeys} beats {corner, frontage_band} (lexicographic over the ordered list)', () => {
    expect(pick([set({ storeys: 3 }, img('s')), set({ storeys: 3, corner: true }, img('sc')), set(null, img('d'))])).toBe('sc');
    expect(pick([set({ corner: true, frontage_band: 'standard' }, img('cf')), set({ storeys: 3 }, img('s')), set(null, img('d'))])).toBe('s');
  });
  it('d. conditioned sets all miss -> the default (a miss never empties the card)', () => {
    expect(pick([set({ storeys: 2 }, img('s')), set({ corner: false }, img('c')), set(null, img('d'))])).toBe('d');
  });
  it('e. a null fact never matches a condition, not even corner:false', () => {
    expect(pick([set({ corner: false }, img('c')), set(null, img('d'))], { ...FACTS, corner: null })).toBe('d');
    expect(pick([set({ storeys: 3 }, img('s')), set(null, img('d'))], { ...FACTS, storeys: null })).toBe('d');
    expect(pick([set({ frontage_band: 'standard' }, img('f')), set(null, img('d'))], { ...FACTS, frontage_m: null })).toBe('d');
  });
  it('f. no default and no match -> null (nothing is rendered)', () => {
    expect(pick([set({ storeys: 2 }, img('s'))])).toBeNull();
    expect(pick([])).toBeNull();
  });
  it('j. frontage at each edge value lands in the ruled band (< narrow_max narrow, >= wide_min wide, else standard)', () => {
    const s = [set({ frontage_band: 'narrow' }, img('n')), set({ frontage_band: 'standard' }, img('st')), set({ frontage_band: 'wide' }, img('w'))];
    expect(pick(s, { ...FACTS, frontage_m: 8.99 })).toBe('n');
    expect(pick(s, { ...FACTS, frontage_m: 9 })).toBe('st');
    expect(pick(s, { ...FACTS, frontage_m: 14.99 })).toBe('st');
    expect(pick(s, { ...FACTS, frontage_m: 15 })).toBe('w');
  });
  it('k. single image per option: the lowest position of the chosen set, whatever the list order', () => {
    expect(pick([set(null, img('p2', 2), img('p0', 0), img('p1', 1))])).toBe('p0');
  });
  it('a matched set with no images is skipped in favour of the next match or the default', () => {
    expect(pick([set({ storeys: 3 }), set({ corner: true }, img('c')), set(null, img('d'))])).toBe('c');
  });
  it('rule {} is the default set', () => {
    expect(pick([set({}, img('d'))])).toBe('d');
  });
});

describe('MF-38 selector: RED inputs throw (FE-24 spirit: never a guess)', () => {
  it('g. a rule key outside the closed list, or a deferred selector, throws', () => {
    throwsWith(() => pick([set({ roof: 'flat' }, img('x'))]), 'not a selector');
    throwsWith(() => pick([set({ design_group: 'a' }, img('x'))]), 'deferred');
    throwsWith(() => pick([set({ income_band: 'a' }, img('x'))]), 'deferred');
  });
  it('h. an undeclared band id throws', () => {
    throwsWith(() => pick([set({ frontage_band: 'huge' }, img('x'))]), 'band');
  });
  it('i. two defaults, two identical rules (in any key order), duplicate position, empty or placeholder alt throw', () => {
    throwsWith(() => pick([set(null, img('a')), set({}, img('b'))]), 'two default sets');
    throwsWith(() => pick([set({ storeys: 3, corner: true }, img('a')), set({ corner: true, storeys: 3 }, img('b'))]), 'identical rules');
    throwsWith(() => pick([set(null, img('a', 0), img('b', 0))]), 'duplicate position');
    throwsWith(() => pick([set(null, img('a', 0, ''))]), 'alt');
    throwsWith(() => pick([set(null, img('a', 0, '   '))]), 'alt');
    throwsWith(() => pick([set(null, img('a', 0, 'Houseplex {dwelling_units} units'))]), 'alt');
  });
  it('a string or non-finite frontage, a non-integer storeys and overlapping edges throw', () => {
    throwsWith(() => pick([set(null, img('d'))], { ...FACTS, frontage_m: '12' }), 'frontage_m');
    throwsWith(() => pick([set(null, img('d'))], { ...FACTS, frontage_m: Infinity }), 'frontage_m');
    throwsWith(() => pick([set(null, img('d'))], { ...FACTS, frontage_m: NaN }), 'frontage_m');
    throwsWith(() => pick([set(null, img('d'))], FACTS, { narrow_max: 15, wide_min: 9 }), 'edges');
    throwsWith(() => pick([set(null, img('d'))], FACTS, { narrow_max: '9', wide_min: 15 }), 'edges');
  });
});
