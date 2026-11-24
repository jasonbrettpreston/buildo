/** @jest-environment node */
// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §11b.2 (one props golden per state per target; refs only), §3.1 (LIST,
//            render.projection map), docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-05, FE-31, FE-32,
//            docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §3.2 and §4 (dated note 2026-11-11, MF-53).
//
// MF-53 · T6, the mobile golden test of S-071 `mobile_parcel_disambiguation_map` (plan v4 §5, §8). The committed goldens (copied by
// scripts/surfaces/emit-mobile-surfaces.mjs) must equal lotMapProps(buildLotMapSituation(inputs)) exactly; every input is a golden or a named
// case; every content key is used by a committed golden; derived names are the declared closed list; every component is in
// mapping.mobile.LIST; nothing is selected at open in any state and Continue is disabled until a tap (parceldisambig_nothing_preselected);
// the unlinked states show the visible message and never pre-select (parceldisambig_no_silent_fallback); the chosen lot opens through the
// ONE report route helper the search page's `unique` uses (operator 2026-11-11: the new report only; plan v4 §4).
import fs from 'node:fs';
import path from 'node:path';
import { LOT_MAP_DERIVED_NAMES, LOT_MAP_SLICE, lotMapData, lotMapProps } from '@/components/surfaces/LotMapBinding';
import type { PropsNode } from '@/components/surfaces/SearchBinding';
import { buildLotMapSituation, polygonsOf, regionOf, type LotMapSituation } from '@/lib/lotMap';
import { ApiError, RateLimitError } from '@/lib/errors';
import { PARCEL_TAB_ROUTE, parcelSearchRoute } from '@/lib/parcelSearchMatch';
import type { ConsumerParcelLookupResult } from '@/lib/schemas';

type Json = Record<string, unknown>;
type Input = { query: string; data?: ConsumerParcelLookupResult; error?: string; isFetching?: boolean; selectedParcelId?: string | null };
const MOBILE = path.resolve(__dirname, '..');
const REPO = path.resolve(MOBILE, '..');
const rj = (p: string): Json => JSON.parse(fs.readFileSync(p, 'utf8'));
const fixture = rj(path.join(__dirname, 'fixtures/lotMap.situations.json')) as { goldens: Record<string, { state: string; situation: string }>; inputs: Record<string, Input> };
const goldens = (rj(path.join(__dirname, 'fixtures/surfaces/mobile_parcel_disambiguation_map.goldens.json')).goldens ?? {}) as Record<string, Json>;
const bindings = rj(path.join(REPO, 'scripts/surfaces/_schema/bindings.json')) as { mapping: { mobile: Record<string, string[]> } };
const descriptor = rj(path.join(REPO, 'scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_disambiguation_map.descriptor.json')) as { identity: { route: string }; states: Array<{ name: string; golden: string }> };
const detail = rj(path.join(REPO, 'scripts/surfaces/parcel_product/F02/surfaces/mobile_parcel_detail.descriptor.json')) as { identity: { route: string } };

/** The same error construction as scripts/surfaces/lotmap-golden-capture.ts. */
const errorOf = (kind: string | undefined, name: string): unknown =>
  kind === 'rate_limited' ? new RateLimitError(name === 'rate_limited_zero' ? 0 : 30)
    : kind === 'entitlement' ? new ApiError(403, 'forbidden')
      : kind === 'unexpected' || kind === 'schema_drift' ? new Error('boom') : null;
const situation = (name: string): LotMapSituation => {
  const i = fixture.inputs[name];
  if (!i) throw new Error(`no input ${name}`);
  return buildLotMapSituation({ query: i.query, data: i.data, error: errorOf(i.error, name), isFetching: i.isFetching ?? false, schemaDrift: i.error === 'schema_drift', selectedParcelId: i.selectedParcelId ?? null });
};
export const NAMED_CASES = [
  'unlinked_no_pin', 'multi_parcel_2_lot_b', 'multi_parcel_3plus_none', 'lot_facts_null',
  'redirect_unique', 'redirect_no_match', 'intersection_loading', 'refetching_multi_parcel', 'rate_limited_zero',
];

const isNode = (v: unknown): v is PropsNode => typeof v === 'object' && v !== null && 'component' in v;
const nodes = (t: PropsNode): PropsNode[] => [t, ...t.children.filter(isNode).flatMap(nodes)];
const refs = (v: unknown, kind: string): string[] => {
  if (Array.isArray(v)) return v.flatMap((x) => refs(x, kind));
  if (typeof v !== 'object' || v === null) return [];
  const o = v as Json;
  if (Object.keys(o).length === 1 && kind in o) return [String(o[kind])];
  return Object.values(o).flatMap((x) => refs(x, kind));
};
const byTestID = (t: PropsNode, id: string): PropsNode | undefined => nodes(t).find((n) => n.props.testID === id);
const ALL = [...Object.values(fixture.goldens).map((g) => g.situation), ...NAMED_CASES];

/** The layout and selection rules on one tree (each rule's planted case is below). */
export function lotMapProblems(t: PropsNode, s: LotMapSituation): string[] {
  const out: string[] = [];
  const allowed = bindings.mapping.mobile.LIST!;
  const walk = (n: PropsNode, parent: PropsNode | null): void => {
    const at = String(n.props.key ?? n.props.testID ?? n.component);
    if (!allowed.includes(n.component)) out.push(`${at}: ${n.component} is not in mapping.mobile.LIST`);
    if (parent && n.props.key === undefined) out.push(`${at}: a child node without a key`);
    if ((n.component === 'Button') && !String(n.props.className ?? '').split(/\s+/).includes('min-h-[44px]')) out.push(`${at}: Button without min-h-[44px]`);
    for (const c of n.children) if (isNode(c)) walk(c, n);
  };
  walk(t, null);
  const cont = byTestID(t, 'parcel-lotmap-continue');
  const checked = nodes(t).filter((n) => n.props.role === 'radio' && (n.props.accessibilityState as Json).checked === true);
  if (s.selectedParcelId === null && checked.length > 0) out.push('a card is checked with nothing selected');
  if (cont && s.selectedParcelId === null && (cont.props.disabled !== true || cont.props.onPress !== null)) out.push('Continue is enabled with nothing selected');
  const map = byTestID(t, 'parcel-lotmap-map');
  if (map && (map.props.importantForAccessibility !== 'no-hide-descendants' || map.props.accessibilityElementsHidden !== true)) out.push('the map is not hidden from screen readers');
  for (const n of nodes(t)) if (n.component === 'MapView' && ['region', 'animate', 'onRegionChange'].some((k) => k in n.props)) out.push('the map animates or is controlled (reduce motion: initialRegion only)');
  for (const name of refs(t, 'derived')) if (!LOT_MAP_DERIVED_NAMES.some((re) => re.test(name))) out.push(`derived name ${name} is not declared`);
  return out;
}

describe('mobile_parcel_disambiguation_map goldens (FE-31; plan v4 §5 T6)', () => {
  const names = Object.keys(goldens);
  it('11 committed goldens, one per declared state, each equal to lotMapProps(situation) exactly', () => {
    expect(names.sort()).toEqual(descriptor.states.map((s) => s.golden).sort());
    for (const n of names) {
      const g = goldens[n] as { situation: string; props: PropsNode; target: string; surface: string; state: string };
      expect([n, g.surface, g.target, g.state, g.situation]).toEqual([n, 'mobile_parcel_disambiguation_map', 'mobile', fixture.goldens[n]!.state, fixture.goldens[n]!.situation]);
      expect(lotMapProps(situation(g.situation))).toStrictEqual(g.props);
    }
  });
  it('the done-condition goldens exist: 2 lots, 3+ lots, unlinked, intersection', () => {
    expect(['multi_parcel_2', 'multi_parcel_3plus', 'unlinked', 'intersection'].map((n) => situation(fixture.goldens[n]!.situation).state)).toEqual(['multi_parcel', 'multi_parcel', 'unlinked', 'intersection']);
    expect(situation('multi_parcel_2').lots).toHaveLength(2);
    expect(situation('multi_parcel_3plus').lots).toHaveLength(3);
  });
  it('every input is a golden or a named case (both directions)', () => {
    expect(Object.keys(fixture.inputs).filter((k) => !ALL.includes(k))).toEqual([]);
    expect(ALL.filter((k) => !(k in fixture.inputs))).toEqual([]);
  });
  it('every content key is used by a committed golden, every content ref names a key, every declared derived name is used', () => {
    const used = new Set(Object.values(goldens).flatMap((g) => refs(g.props, 'content')));
    expect(Object.keys(LOT_MAP_SLICE.content).filter((k) => !used.has(k))).toEqual([]);
    expect([...used].filter((k) => !(k in LOT_MAP_SLICE.content))).toEqual([]);
    const derived = ALL.flatMap((k) => refs(lotMapProps(situation(k)), 'derived'));
    expect(LOT_MAP_DERIVED_NAMES.filter((re) => !derived.some((u) => re.test(u))).map(String)).toEqual([]);
  });
  it('the layout, selection, accessibility and motion rules hold on every golden and named case', () => {
    for (const k of ALL) expect([k, lotMapProblems(lotMapProps(situation(k)), situation(k))]).toEqual([k, []]);
  });
  it('RED (planted): a pre-checked card, an enabled Continue with nothing picked, a map visible to screen readers, an animated map, an undeclared name, a Card', () => {
    const s = situation('multi_parcel_2');
    const t = lotMapProps(s);
    const card = nodes(t).find((n) => n.props.role === 'radio')!;
    card.props.accessibilityState = { checked: true };
    const cont = byTestID(t, 'parcel-lotmap-continue')!;
    cont.props.disabled = false; cont.props.onPress = { action: 'push', route: 'x' };
    byTestID(t, 'parcel-lotmap-map')!.props.importantForAccessibility = 'auto';
    nodes(t).find((n) => n.component === 'MapView')!.props.region = { derived: 'region' };
    nodes(t).find((n) => n.component === 'Text')!.children.push({ derived: 'nearest_lot' });
    (t.children[0] as PropsNode).children.push({ component: 'Card', props: { key: 'c' }, children: [] });
    expect(lotMapProblems(t, s)).toEqual(expect.arrayContaining([
      'a card is checked with nothing selected', 'Continue is enabled with nothing selected', 'the map is not hidden from screen readers',
      'the map animates or is controlled (reduce motion: initialRegion only)', 'derived name nearest_lot is not declared', 'c: Card is not in mapping.mobile.LIST',
    ]));
  });
});

describe('the page rules (named cases)', () => {
  it('nothing is selected at open in every state; Continue reads "Choose a lot" and is disabled', () => {
    for (const k of ['multi_parcel_2', 'multi_parcel_3plus_none', 'unlinked', 'lot_facts_null']) {
      const s = situation(k);
      expect([k, s.selectedParcelId, s.route]).toEqual([k, null, null]);
      const cont = byTestID(lotMapProps(s), 'parcel-lotmap-continue');
      // Dated 2026-11-20 (task-354; Mobile CI run 44741125636): the unlinked state draws no Continue since fdb6cd266 (2026-11-19, SRCH.DAYLIGHT: B.8 removed,
      // small-pages-v8 choose-lot.html draws none; the named case "unlinked" below pins it). The loop said every state; the check is now per state: a
      // state that draws Continue shows "Choose a lot", and the unlinked state draws none.
      if (k === 'unlinked') expect([k, cont]).toEqual([k, undefined]);
      else expect([k, cont!.children[0]]).toMatchObject([k, { children: [{ content: 'select.none' }] }]);
    }
  });
  it('task-362 AC2, AC6 (choose-lot.html:278 `<button type="button" class="btn p" disabled aria-describedby="pick-hint">Choose a lot</button><p class="small" id="pick-hint">Pick a lot on the map or in the list.</p>`): the hint is the content key select.hint, drawn only while Choose a lot is disabled in the choose-a-lot state, and the button points at it', () => {
    expect(LOT_MAP_SLICE.content['select.hint']).toBe('Pick a lot on the map or in the list.');
    for (const k of ['multi_parcel_2', 'multi_parcel_3plus_none']) {
      const t = lotMapProps(situation(k));
      const hint = byTestID(t, 'parcel-lotmap-pick-hint')!;
      expect(hint.children).toEqual([{ content: 'select.hint' }]);
      expect(byTestID(t, 'parcel-lotmap-continue')!.props.accessibilityHint).toEqual({ content: 'select.hint' });
      const col = nodes(t).find((n) => n.props.testID === 'parcel-lotmap-column')!;
      const keys = col.children.filter(isNode).map((n) => n.props.key);
      expect(keys.indexOf('pick-hint')).toBe(keys.indexOf('continue') + 1); // directly under the button, before the help row
      expect(keys.slice(-3)).toEqual(['continue', 'pick-hint', 'help-row']);
    }
    // A picked lot: button, then the help row, no hint (choose-lot.html draws the hint only at line 278, the nothing-picked state).
    const picked = nodes(lotMapProps(situation('multi_parcel_2_lot_b'))).find((n) => n.props.testID === 'parcel-lotmap-column')!.children.filter(isNode).map((n) => n.props.key);
    expect(picked.slice(-2)).toEqual(['continue', 'help-row']);
    expect(picked).not.toContain('pick-hint');
    for (const k of ['multi_parcel_2_lot_b', 'unlinked', 'unlinked_no_pin', 'intersection', 'too_many_lots', 'loading', 'rate_limited_zero']) {
      const t = lotMapProps(situation(k));
      expect([k, byTestID(t, 'parcel-lotmap-pick-hint'), byTestID(t, 'parcel-lotmap-continue')?.props.accessibilityHint]).toEqual([k, undefined, undefined]);
    }
  });
  it('a picked lot: its card checked, "Continue with Lot B", the route = the search page\'s unique route = the REPORT surface route', () => {
    const s = situation('multi_parcel_2_lot_b');
    expect([s.selectedParcelId, s.selectedLetter]).toEqual(['PCL-B2', 'B']);
    expect(s.route).toBe(parcelSearchRoute('unique', { parcelId: 'PCL-B2', query: '5 Elm St' }));
    expect(s.route).toBe('/(app)/parcel-tool/PCL-B2');
    // The REPORT surface mobile_parcel_detail is declared at [parcelId].tsx and the file exists (plan v4 §4; regression LOW-8).
    expect(detail.identity.route).toBe('mobile/app/(app)/parcel-tool/[parcelId].tsx');
    expect(fs.existsSync(path.join(REPO, detail.identity.route))).toBe(true);
    const t = lotMapProps(s);
    expect(byTestID(t, 'parcel-lotmap-continue')!.props.onPress).toEqual({ action: 'push', route: '/(app)/parcel-tool/PCL-B2' });
    expect(byTestID(t, 'parcel-lotmap-continue')!.children[0]).toMatchObject({ children: [{ text: { content: 'select.lot' }, vars: { letter: { derived: 'letter.1' } } }] });
  });
  it('the binding and lotMap.ts never spell a report route themselves (one helper; regression LOW-8)', () => {
    for (const f of ['src/lib/lotMap.ts', 'src/components/surfaces/LotMapBinding.tsx', 'app/(app)/parcel-tool/disambiguate.tsx']) {
      expect([f, /\/\(app\)\/parcel-tool\/\$\{/.test(fs.readFileSync(path.join(MOBILE, f), 'utf8'))]).toEqual([f, false]);
    }
    expect(fs.readFileSync(path.join(MOBILE, 'app/(app)/parcel-tool/disambiguate.tsx'), 'utf8')).not.toMatch(/addRecent|useRecentSearchesStore/);
  });
  it('unlinked: the visible message and the pin, nothing picked; no faint neighbours, no Continue (B.8 removed, small pages v8)', () => {
    const s = situation('unlinked');
    const t = lotMapProps(s);
    expect(byTestID(t, 'parcel-lotmap-unlinked')).toBeDefined();
    expect(nodes(t).filter((n) => n.component === 'Polygon')).toHaveLength(0);
    expect(nodes(t).filter((n) => n.component === 'Marker').map((n) => n.props.key)).toEqual(['pin']);
    expect(byTestID(t, 'parcel-lotmap-continue')).toBeUndefined();
    expect(s.selectedParcelId).toBeNull();
    expect(Object.keys(s)).not.toContain('neighbours');
    expect(JSON.stringify(t)).not.toMatch(/neighbour/);
  });
  it('several unlinked addresses: the message only, no map, no Continue (Q5 i)', () => {
    const t = lotMapProps(situation('unlinked_no_pin'));
    expect([situation('unlinked_no_pin').state, byTestID(t, 'parcel-lotmap-unlinked') !== undefined, byTestID(t, 'parcel-lotmap-map'), byTestID(t, 'parcel-lotmap-continue')]).toEqual(['unlinked_no_pin', true, undefined, undefined]);
  });
  it('more than 10 lots: the ruled message only (Q5 ii)', () => {
    const t = lotMapProps(situation('too_many_lots'));
    expect(byTestID(t, 'parcel-lotmap-too-many')!.children[0]).toMatchObject({ children: [{ content: 'state.too_many' }] });
    expect(LOT_MAP_SLICE.content['state.too_many']).toBe('This address has many lots. Add a unit number or pick a nearby address.');
  });
  it('the ruled message texts are verbatim', () => {
    expect(LOT_MAP_SLICE.content['state.intersection']).toBe('That looks like an intersection. Type a house number to see the lots.');
    expect(LOT_MAP_SLICE.content['unlinked.heading']).toBe('No lot linked yet');
    // SEARCHFIX.3 V2 (task-451 AC3, dated 2026-11-24; ruling source doc-2 B.6 (doc-2:48) "Try a nearby address or report it." and B.7 (doc-2:49) "report it inside
    // the no-lot message"; plan ruling 8.1 b; prior pin: "... Try a nearby address."): the line is the body, the link "report it", then the full stop.
    expect(LOT_MAP_SLICE.content['unlinked.body']).toBe("We found {address}, but the City's data doesn't link it to a lot yet. Try a nearby address or ");
    expect([LOT_MAP_SLICE.content['unlinked.report'], LOT_MAP_SLICE.content['unlinked.stop']]).toEqual(['report it', '.']);
  });
  it('SEARCHFIX.3 V2 (task-451 AC3): the no-lot message holds the "report it" link to the wrong-lot help topic, then the stop', () => {
    for (const k of ['unlinked', 'unlinked_no_pin']) {
      const desc = nodes(byTestID(lotMapProps(situation(k)), 'parcel-lotmap-unlinked')!).find((n) => n.component === 'AlertDescription')!;
      const [body, link, stop] = desc.children as [unknown, PropsNode, PropsNode];
      expect([k, body]).toEqual([k, { text: { content: 'unlinked.body' }, vars: { address: { contract: 'contract_parcels_lookup.map.address' } } }]);
      expect([k, link.component, link.props.key, link.props.testID, link.props.accessibilityRole, link.props.onPress, link.children]).toEqual([
        k, 'Text', 'unlinked-report', 'parcel-lotmap-report', 'link', { action: 'open_help', topic: 'wrong-lot', q: { derived: 'query' } }, [{ content: 'unlinked.report' }]]);
      expect([k, stop.component, stop.props.key, stop.children]).toEqual([k, 'Text', 'unlinked-stop', [{ content: 'unlinked.stop' }]]);
    }
  });
  it('SEARCHFIX.3 B.7 (task-451; doc-2:49 "to /help?topic=wrong-lot ... under every notice"): every help link of the page opens the wrong-lot topic', () => {
    const topics = ALL.flatMap((k) => nodes(lotMapProps(situation(k))).filter((n) => (n.props.onPress as Json | null | undefined)?.action === 'open_help').map((n) => (n.props.onPress as Json).topic));
    expect(topics.length).toBeGreaterThan(0);
    expect([...new Set(topics)]).toEqual(['wrong-lot']);
  });
  it('SEARCHFIX.3 ST3 (task-451 AC1; RR-0444 MD:2290-2291 2c): the null area reads "Not available" on the card and in its label', () => {
    expect(LOT_MAP_SLICE.content['lot.null']).toBe('Not available');
    const card = byTestID(lotMapProps(situation('lot_facts_null')), 'parcel-lotmap-card-PCL-A1')!;
    const area = nodes(card).find((n) => n.props.key === 'card-area')!;
    expect(area.children).toEqual([{ content: 'lot.null' }]);
    const label = card.props.accessibilityLabel as { text: unknown; vars: Json };
    expect([label.text, label.vars.area]).toEqual([{ content: 'lot.label' }, { content: 'lot.null' }]);
  });
  it('SEARCHFIX.3 V3 (task-451 AC4; GROUNDER-H D1): the card label is the lead line and the area (no frontage, no zoning); Continue speaks its visible text', () => {
    for (const k of ['multi_parcel_2', 'multi_parcel_3plus', 'multi_parcel_2_lot_b', 'lot_facts_null']) {
      const t = lotMapProps(situation(k));
      for (const card of nodes(t).filter((n) => n.props.role === 'radio')) {
        const label = card.props.accessibilityLabel as { text: unknown; vars: Json };
        const title = nodes(card).find((n) => n.props.key === 'card-title')!.children[0];
        const area = nodes(card).find((n) => n.props.key === 'card-area')!.children[0];
        expect([k, label.text, Object.keys(label.vars).sort(), label.vars.lead, label.vars.area]).toEqual([k, { content: 'lot.label' }, ['area', 'lead'], title, area]);
      }
      const cont = byTestID(t, 'parcel-lotmap-continue')!;
      expect([k, cont.props.accessibilityLabel]).toEqual([k, (cont.children[0] as PropsNode).children[0]]);
    }
    expect(LOT_MAP_SLICE.content['lot.label']).toBe('{lead}, {area}');
    expect('select.label' in LOT_MAP_SLICE.content).toBe(false);
  });
  it('null lot facts show the content null value, never "0"; an outline-less lot draws no polygon but keeps its card', () => {
    const s = situation('lot_facts_null');
    const t = lotMapProps(s);
    const card = byTestID(t, 'parcel-lotmap-card-PCL-A1')!;
    expect(refs(card, 'content')).toEqual(expect.arrayContaining(['lot.null']));
    expect(refs(card, 'contract')).toEqual(['contract_parcels_lookup.map.lots.0.parcelId']);
    expect(nodes(t).filter((n) => n.component === 'Polygon').map((n) => n.props.key)).toEqual(['lot-PCL-A1-0']);
    expect(byTestID(t, 'parcel-lotmap-card-PCL-B2')).toBeDefined();
    expect(nodes(t).filter((n) => n.component === 'Marker').map((n) => n.props.key)).toEqual(['marker-PCL-B2']);
  });
  it('redirects: unique replaces with the report route; text_candidates and no_match go back to search; an intersection is never redirected (regression HIGH-1)', () => {
    expect(situation('redirect_unique').navigate).toBe(parcelSearchRoute('unique', { parcelId: 'PCL-U1', query: '5 Elm St' }));
    expect(situation('redirect').navigate).toBe(PARCEL_TAB_ROUTE.lookup);
    expect(situation('redirect_no_match').navigate).toBe(PARCEL_TAB_ROUTE.lookup);
    expect([situation('intersection').state, situation('intersection').navigate]).toEqual(['intersection', null]);
    expect(situation('intersection_loading').state).toBe('loading');
  });
  it('a background refetch keeps the drawn page (no loading flash, no redirect)', () => {
    expect([situation('refetching_multi_parcel').state, situation('refetching_multi_parcel').navigate]).toEqual(['multi_parcel', null]);
  });
  it('a 429 of 0 seconds still shows its line with 0 (the search page rule)', () => {
    const s = situation('rate_limited_zero');
    expect([s.errors.rateLimited, lotMapData(s).contract]).toEqual([true, { contract_parcels_lookup: { map: null, errors: { '429': { retryAfterSeconds: 0 } } } }]);
  });
});

describe('the client reshape (declared derivations)', () => {
  it('a MultiPolygon draws every part; inner rings are holes; lng/lat order is swapped to latitude/longitude', () => {
    const p = polygonsOf({ type: 'MultiPolygon', coordinates: [[[[1, 2], [3, 4], [1, 2]], [[5, 6], [7, 8], [5, 6]]], [[[9, 10], [11, 12], [9, 10]]]] });
    expect(p).toHaveLength(2);
    expect(p[0]!.coordinates[0]).toEqual({ latitude: 2, longitude: 1 });
    expect(p[0]!.holes).toEqual([[{ latitude: 6, longitude: 5 }, { latitude: 8, longitude: 7 }, { latitude: 6, longitude: 5 }]]);
    expect(polygonsOf(null)).toEqual([]);
  });
  it('the start view becomes a padded initial region centred on the box', () => {
    const r = regionOf({ north: 2, south: 1, east: 4, west: 2 })!;
    expect([r.latitude, r.longitude]).toEqual([1.5, 3]);
    expect(r.latitudeDelta).toBeGreaterThan(1);
    expect(regionOf(null)).toBeNull();
  });
});
