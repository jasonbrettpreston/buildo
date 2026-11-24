/** @jest-environment node */
// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §11b.2 (one props golden per state per target; regenerated, never hand-edited),
//            docs/specs/00-architecture/117_maxbld_brand.md §3.2 and §6.1 (Daylight tokens, MF-83), task-322 (R-D1: small pages v8).
//
// SRCH.DAYLIGHT (task-322) · the search pages (search + candidate list, choose-your-lot map page, semi question page) use only the Daylight
// report-* tokens of mobile/tailwind.config.js, and the three elements small pages v8 drops are gone: A.13 (in-bar Account button), B.8 (faint
// tappable neighbour outlines), C.9 (lot card frontage and zoning line). Scope of the legacy-class rule: the two layout tables and the render
// trees; the Account, Tracked Lots and shelf constants (PARCEL_SEARCH_TOKENS, TRACKED_LOTS_HEX, PARCEL_SHELF_HEX, PARCEL_SEARCH_HEX) are named
// exemptions because those screens still read them. Dated 2026-11-24 (task-450 R5, GROUNDER-D D7; prior text kept): "three layout tables" read "two": the rule reads
// PARCEL_SEARCH_LAYOUT and LOT_MAP_LAYOUT.
import fs from 'node:fs';
import path from 'node:path';
import { searchProps, SEARCH_SLICE, type PropsNode } from '@/components/surfaces/SearchBinding';
import { lotMapProps, LOT_MAP_SLICE } from '@/components/surfaces/LotMapBinding';
import { semiQuestionProps } from '@/components/surfaces/SemiQuestionBinding';
import { LOT_MAP_HEX, LOT_MAP_LAYOUT, LOT_MAP_STYLE } from '@/constants/lotMap';
import { PARCEL_SEARCH_LAYOUT } from '@/constants/parcelSearch';
import { buildLotMapSituation } from '@/lib/lotMap';
import { buildSemiQuestionSituation } from '@/lib/semiQuestion';
import { ApiError, RateLimitError } from '@/lib/errors';
import type { SearchSituation } from '@/lib/parcelSearchMatch';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- fixture JSON
const MOBILE = path.resolve(__dirname, '..');
const rj = (p: string): Json => JSON.parse(fs.readFileSync(p, 'utf8'));
const read = (p: string): string => fs.readFileSync(path.join(MOBILE, p), 'utf8');
const searchFx = rj(path.join(__dirname, 'fixtures/parcelSearch.situations.json'));
const lotFx = rj(path.join(__dirname, 'fixtures/lotMap.situations.json'));
const semiFx = rj(path.join(__dirname, 'fixtures/semiQuestion.situations.json'));
const err = (k?: string): unknown => (k === 'rate_limited' ? new RateLimitError(30) : k === 'entitlement' ? new ApiError(403, 'forbidden') : k === 'unexpected' || k === 'schema_drift' ? new Error('boom') : null);

const searchTrees = Object.keys(searchFx).filter((k) => k !== '$comment').map((k) => searchProps(searchFx[k] as SearchSituation));
const lotTrees = Object.entries(lotFx.inputs as Record<string, Json>).map(([k, i]) => lotMapProps(buildLotMapSituation({ query: i.query, data: i.data, error: err(i.error), isFetching: i.isFetching ?? false, schemaDrift: i.error === 'schema_drift', selectedParcelId: i.selectedParcelId ?? null })));
const semiTrees = Object.values(semiFx.inputs as Record<string, Json>).map((i) => semiQuestionProps(buildSemiQuestionSituation({ parcelId: i.parcelId, data: i.data, error: err(i.error), isFetching: i.isFetching ?? false, schemaDrift: i.error === 'schema_drift', selected: i.selected ?? null })));
const ALL = [...searchTrees, ...lotTrees, ...semiTrees];

const isNode = (v: unknown): v is PropsNode => typeof v === 'object' && v !== null && 'component' in v;
const nodes = (t: PropsNode): PropsNode[] => [t, ...t.children.filter(isNode).flatMap(nodes)];
const classTokens = (c: string): string[] => c.split(/\s+/).filter(Boolean);
/** A legacy dark token: a hex arbitrary value, a zinc or red palette colour, or the dark ground names. */
const LEGACY = /(\[#[0-9a-fA-F]{3,8}\]|zinc-\d+|red-\d+|bg-feed|text-primary$)/;

describe('Daylight tokens only (R-D1, small pages v8)', () => {
  it('the two layout tables hold no legacy dark class and no raw hex class', () => {
    const bad: string[] = [];
    for (const [table, o] of Object.entries({ PARCEL_SEARCH_LAYOUT, LOT_MAP_LAYOUT }) as Array<[string, Record<string, string>]>) {
      for (const [k, v] of Object.entries(o)) for (const t of classTokens(v)) if (LEGACY.test(t.replace(/^[a-z-]*:/, ''))) bad.push(`${table}.${k}: ${t}`);
    }
    expect(bad).toEqual([]);
  });
  it('the screen ground is the report page paper; a checked card edge is report-ink with its dark twin', () => {
    expect(classTokens(PARCEL_SEARCH_LAYOUT.screen)).toContain('bg-report-page');
    expect(classTokens(LOT_MAP_LAYOUT.screen)).toContain('bg-report-page');
    for (const c of [PARCEL_SEARCH_LAYOUT.cardChecked, LOT_MAP_LAYOUT.cardChecked]) expect(classTokens(c)).toEqual(expect.arrayContaining(['border-report-ink', 'dark:border-report-ink']));
  });
  it('every class in every render tree is free of legacy dark tokens', () => {
    const bad = ALL.flatMap((t) => nodes(t).flatMap((n) => classTokens(String(n.props.className ?? '')).filter((x) => LEGACY.test(x.replace(/^[a-z-]*:/, ''))).map((x) => `${n.props.key ?? n.component}: ${x}`)));
    expect([...new Set(bad)]).toEqual([]);
  });
  it('the map hexes are the existing Daylight values (report-amber, amber-ink, ink, muted) and the lot fill alphas of v8', () => {
    const tw = read('tailwind.config.js');
    const allowed = new Set([...tw.matchAll(/'report-[a-z-]+':\s*'(#[0-9a-fA-F]{6})'/g)].map((m) => m[1]!.toLowerCase()));
    for (const [k, v] of Object.entries(LOT_MAP_HEX)) if (v.startsWith('#')) expect([k, allowed.has(v.toLowerCase())]).toEqual([k, true]);
    expect(LOT_MAP_HEX.lotFill).toBe('rgba(245,158,11,0.12)');
    expect(LOT_MAP_HEX.lotFillChecked).toBe('rgba(245,158,11,0.40)');
  });
  it('the map is light: userInterfaceStyle light, and the style holds structure only (no colour stylers, no new palette)', () => {
    const maps = lotTrees.flatMap((t) => nodes(t).filter((n) => n.component === 'MapView'));
    expect(maps.length).toBeGreaterThan(0);
    for (const m of maps) expect(m.props.userInterfaceStyle).toBe('light');
    expect(JSON.stringify(LOT_MAP_STYLE)).not.toMatch(/"color"/);
  });
});

describe('A.13 the in-bar Account button is removed', () => {
  it('no search tree has the button, the action or the content key', () => {
    for (const t of searchTrees) {
      expect(nodes(t).filter((n) => n.props.testID === 'parcel-search-account' || n.props.key === 'account')).toEqual([]);
      expect(JSON.stringify(t)).not.toMatch(/open_account|search\.account\.label/);
    }
    expect(Object.keys(SEARCH_SLICE.content)).not.toContain('search.account.label');
    expect(PARCEL_SEARCH_LAYOUT).not.toHaveProperty('account');
  });
  it('the renderer and the three mounts no longer declare open_account', () => {
    for (const f of ['src/components/surfaces/SurfaceRenderer.tsx', 'src/components/surfaces/SearchBinding.tsx', 'app/(app)/parcel-tool/index.tsx', 'app/(app)/parcel-tool/semi-question.tsx', 'app/(app)/parcel-tool/disambiguate.tsx']) {
      expect([f, /open_account/.test(read(f))]).toEqual([f, false]);
    }
  });
});

describe('B.8 the faint tappable neighbour outlines are removed', () => {
  it('no map tree draws a neighbour polygon; the situation and the binding carry no neighbours', () => {
    for (const t of lotTrees) expect(nodes(t).filter((n) => String(n.props.key ?? '').startsWith('neighbour'))).toEqual([]);
    for (const f of ['src/components/surfaces/LotMapBinding.tsx', 'src/lib/lotMap.ts', 'src/constants/lotMap.ts']) expect([f, /neighbour/i.test(read(f))]).toEqual([f, false]);
  });
});

describe('C.9 the lot card frontage and zoning line is removed', () => {
  it('no card has the facts line; the lot.facts key and class are gone', () => {
    for (const t of lotTrees) expect(nodes(t).filter((n) => n.props.key === 'card-facts')).toEqual([]);
    expect(Object.keys(LOT_MAP_SLICE.content)).not.toContain('lot.facts');
    expect(LOT_MAP_LAYOUT).not.toHaveProperty('cardFacts');
  });
});
