/** @jest-environment node */
// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §0a principle 1 and §11b.2 (one props golden per state per target; refs only; the page
//            structure is rows of the page table), docs/specs/02-web-admin/136_mcfrontend_handbook.md fe.31, fe.57.
//
// task-313 McApp card 1 (PLAN-313-v1 M6, T6; RR-0499 "1a" own start-up screen; RR-0503 3 A) · the mobile golden test of S-097 `mobile_parcel_opening`, the
// Opening page of the MaxBLD front door. The wall's golden test (wallScreens.golden.test.ts) on this surface: the committed goldens equal
// openingProps(situation) exactly; every input is a golden or a named case; every content key is used by a golden; every component is in
// mapping.mobile.LIST; every Button is 44 px or more; no two siblings share a React key. The goldens assert states and content keys, not snapshots.
import fs from 'node:fs';
import path from 'node:path';
import { OPENING_SLICE, openingData, openingProps, type OpeningSituation } from '@/components/surfaces/OpeningBinding';
import type { PropsNode } from '@/components/surfaces/SearchBinding';
import { LOT_MAP_LAYOUT } from '@/constants/lotMap';

type Json = Record<string, unknown>;
const MOBILE = path.resolve(__dirname, '..');
const REPO = path.resolve(MOBILE, '..');
const rj = (p: string): Json => JSON.parse(fs.readFileSync(p, 'utf8'));
const fixture = rj(path.join(__dirname, 'fixtures/opening.situations.json')) as { goldens: Record<string, { state: string; situation: string }>; inputs: Record<string, OpeningSituation>; named: string[] };
const goldens = (rj(path.join(__dirname, 'fixtures/surfaces/mobile_parcel_opening.goldens.json')).goldens ?? {}) as Record<string, Json>;
const bindings = rj(path.join(REPO, 'scripts/surfaces/_schema/bindings.json')) as { mapping: { mobile: Record<string, string[]> } };
const descriptor = rj(path.join(REPO, 'scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_opening.descriptor.json')) as { states: Array<{ name: string; golden: string }> };

const situation = (name: string): OpeningSituation => {
  const i = fixture.inputs[name];
  if (!i) throw new Error(`no input ${name}`);
  return i;
};
const isNode = (v: unknown): v is PropsNode => typeof v === 'object' && v !== null && 'component' in v;
const nodes = (t: PropsNode): PropsNode[] => [t, ...t.children.filter(isNode).flatMap(nodes)];
const refs = (v: unknown, kind: string): string[] => {
  if (Array.isArray(v)) return v.flatMap((x) => refs(x, kind));
  if (typeof v !== 'object' || v === null) return [];
  const o = v as Json;
  if (Object.keys(o).length === 1 && kind in o) return [String(o[kind])];
  return Object.values(o).flatMap((x) => refs(x, kind));
};
const ALL = [...Object.values(fixture.goldens).map((g) => g.situation), ...fixture.named];

/** The layout rules on one tree: mapped components, keyed children, 44 px Buttons, no derived names (the Opening declares none). */
export function openingProblems(t: PropsNode): string[] {
  const out: string[] = [];
  const allowed = bindings.mapping.mobile.LIST!;
  const walk = (n: PropsNode, parent: PropsNode | null): void => {
    const at = String(n.props.key ?? n.props.testID ?? n.component);
    if (!allowed.includes(n.component)) out.push(`${at}: ${n.component} is not in mapping.mobile.LIST`);
    if (parent && n.props.key === undefined) out.push(`${at}: a child node without a key`);
    if (n.component === 'Button' && !String(n.props.className ?? '').split(/\s+/).some((c) => c === 'min-h-[44px]' || c === 'min-h-[48px]')) out.push(`${at}: Button without min-h-[44px] or min-h-[48px]`);
    for (const c of n.children) if (isNode(c)) walk(c, n);
  };
  walk(t, null);
  for (const name of refs(t, 'derived')) out.push(`derived name ${name} is not declared`);
  return out;
}

/** React keys must be unique among siblings (a duplicate key reconciles wrongly on an update): every node's child keys, by parent. */
export function duplicateSiblingKeys(t: PropsNode): string[] {
  const out: string[] = [];
  for (const n of nodes(t)) {
    const keys = n.children.filter(isNode).map((c) => String(c.props.key));
    for (const k of new Set(keys)) if (keys.filter((x) => x === k).length > 1) out.push(`${String(n.props.key ?? n.props.testID ?? n.component)}: key ${k} repeats`);
  }
  return out;
}

describe('mobile_parcel_opening goldens (FE-31)', () => {
  const names = Object.keys(goldens);
  it('one committed golden per declared state, each equal to openingProps(situation) exactly', () => {
    expect(names.sort()).toEqual(descriptor.states.map((s) => s.golden).sort());
    for (const n of names) {
      const g = goldens[n] as { situation: string; props: PropsNode; target: string; surface: string; state: string };
      expect([n, g.surface, g.target, g.state, g.situation]).toEqual([n, 'mobile_parcel_opening', 'mobile', fixture.goldens[n]!.state, fixture.goldens[n]!.situation]);
      expect(openingProps(situation(g.situation))).toStrictEqual(g.props);
    }
  });
  it('every input is a golden or a named case (both directions)', () => {
    expect(Object.keys(fixture.inputs).filter((k) => !ALL.includes(k))).toEqual([]);
    expect(ALL.filter((k) => !(k in fixture.inputs))).toEqual([]);
  });
  it('every content key is used by a committed golden, and every content ref names a key', () => {
    const used = new Set(Object.values(goldens).flatMap((g) => refs(g.props, 'content')));
    expect(Object.keys(OPENING_SLICE.content).filter((k) => !used.has(k))).toEqual([]);
    expect([...used].filter((k) => !(k in OPENING_SLICE.content))).toEqual([]);
  });
  it('the layout rules hold on every golden (mapped components, keyed children, 44 px Buttons, no derived names)', () => {
    for (const k of ALL) expect([k, openingProblems(openingProps(situation(k)))]).toEqual([k, []]);
  });
  it('no two siblings of any Opening golden props tree share a React key', () => {
    for (const n of names) expect([n, duplicateSiblingKeys((goldens[n] as { props: PropsNode }).props)]).toEqual([n, []]);
    for (const k of ALL) expect([k, duplicateSiblingKeys(openingProps(situation(k)))]).toEqual([k, []]);
  });
  it('RED (planted): a Card, a Button under 44 px, a child without a key, a repeated sibling key and a derived name are each found', () => {
    const t = openingProps(situation('offline'));
    const col = nodes(t).find((n) => n.props.testID === 'parcel-opening-column')!;
    col.children.push({ component: 'Card', props: { key: 'c' }, children: [] });
    col.children.push({ component: 'Button', props: { key: 'small', className: 'min-h-[30px]' }, children: [{ derived: 'nearest_lot' }] });
    col.children.push({ component: 'View', props: {}, children: [] });
    col.children.push({ component: 'View', props: { key: 'c' }, children: [] });
    expect(openingProblems(t)).toEqual(expect.arrayContaining([
      'c: Card is not in mapping.mobile.LIST', 'small: Button without min-h-[44px] or min-h-[48px]', 'View: a child node without a key', 'derived name nearest_lot is not declared',
    ]));
    expect(duplicateSiblingKeys(t)).toEqual(['column: key c repeats']);
  });
});

describe('the Opening rules (named cases)', () => {
  const testIDs = (t: PropsNode): string[] => nodes(t).map((n) => String(n.props.testID ?? '')).filter(Boolean);
  it('every state opens with the two header lines: the plain wordmark and the tagline', () => {
    for (const k of ['loading', 'offline', 'error']) {
      const t = openingProps(situation(k));
      const heads = nodes(t).filter((n) => n.props.role === 'header').map((n) => refs(n, 'content')[0]);
      expect([k, heads]).toEqual([k, ['opening.wordmark', 'opening.tagline']]);
    }
    expect([OPENING_SLICE.content['opening.wordmark'], OPENING_SLICE.content['opening.tagline']]).toEqual(['MaxBLD', 'Lot Intelligence']);
  });
  it('loading: Connecting… and no notice and no button (RR-0503 3 A: for the whole loading state)', () => {
    const t = openingProps(situation('loading'));
    expect(refs(t, 'content')).toEqual(['opening.wordmark', 'opening.tagline', 'opening.connecting']);
    expect(nodes(t).filter((n) => n.component === 'Button')).toEqual([]);
    expect(OPENING_SLICE.content['opening.connecting']).toBe('Connecting…');
  });
  it('offline: one neutral notice and Try again (retry); no error copy', () => {
    const t = openingProps(situation('offline'));
    const notice = nodes(t).find((n) => n.props.testID === 'parcel-opening-offline')!;
    expect(refs(notice, 'content')).toEqual(['opening.offline.title', 'opening.offline.text']);
    expect(notice.props.className).toBe(LOT_MAP_LAYOUT.notice);
    expect(testIDs(t)).not.toContain('parcel-opening-error');
    const b = nodes(t).filter((n) => n.component === 'Button');
    expect(b.map((n) => [n.props.testID, n.props.onPress])).toEqual([['parcel-opening-retry_offline', { action: 'retry' }]]);
    expect([OPENING_SLICE.content['opening.offline.title'], OPENING_SLICE.content['opening.offline.text']]).toEqual(['Can\'t reach MaxBLD', 'Check your connection and try again.']);
  });
  it('error: one tone-error notice and Try again (retry); a 401, 429 or 500 is not called a connection problem', () => {
    const t = openingProps(situation('error'));
    const notice = nodes(t).find((n) => n.props.testID === 'parcel-opening-error')!;
    expect(refs(notice, 'content')).toEqual(['opening.error.title', 'opening.error.text']);
    expect([notice.props.icon, notice.props.className]).toEqual(['AlertTriangle', LOT_MAP_LAYOUT.noticeError]);
    expect(refs(t, 'content')).not.toContain('opening.offline.text');
    const b = nodes(t).filter((n) => n.component === 'Button');
    expect(b.map((n) => [n.props.testID, n.props.onPress])).toEqual([['parcel-opening-retry_error', { action: 'retry' }]]);
    expect([OPENING_SLICE.content['opening.error.title'], OPENING_SLICE.content['opening.error.text'], OPENING_SLICE.content['opening.retry']]).toEqual(['Something went wrong', 'Try again in a moment.', 'Try again']);
  });
  it('the rows read no contract value', () => {
    for (const k of ['loading', 'offline', 'error']) expect([k, refs(openingProps(situation(k)), 'contract')]).toEqual([k, []]);
    expect(openingData()).toEqual({ contract: { contract_parcels_entitlement: {} }, derived: {} });
  });
});
