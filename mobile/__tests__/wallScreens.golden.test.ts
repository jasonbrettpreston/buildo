/** @jest-environment node */
// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §0a principle 1 and §11b.2 (one props golden per state per target; refs only; the page
//            structure is rows of the page table), docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-05, FE-18, FE-31.
//
// task-452 SEARCHFIX.4 · the mobile golden test of S-096 `mobile_parcel_wall`, the wall a refused lookup shows (RR-0443, RR-0444 2b; RR-0454 item 3: the plan line,
// no top-up or upgrade control; RR-0455: phone first, the no-plan page is task-357). The semi page's golden test (semiQuestionScreens.golden.test.ts) on this
// surface: the committed goldens equal wallProps(situation) exactly; every input is a golden or a named case; every content key is used by a golden; every
// component is in mapping.mobile.LIST; every Button is 44 px or more; no two siblings share a React key; the wall literals are the approved mock's.
import fs from 'node:fs';
import path from 'node:path';
import { WALL_SLICE, wallData, wallProps, type WallSituation } from '@/components/surfaces/WallBinding';
import type { PropsNode } from '@/components/surfaces/SearchBinding';
import searchSlice from '@/generated/surfaces/mobile_parcel_search.json';
import { LOT_MAP_LAYOUT } from '@/constants/lotMap';

type Json = Record<string, unknown>;
const MOBILE = path.resolve(__dirname, '..');
const REPO = path.resolve(MOBILE, '..');
const rj = (p: string): Json => JSON.parse(fs.readFileSync(p, 'utf8'));
const fixture = rj(path.join(__dirname, 'fixtures/wall.situations.json')) as { goldens: Record<string, { state: string; situation: string }>; inputs: Record<string, WallSituation>; named: string[] };
const goldens = (rj(path.join(__dirname, 'fixtures/surfaces/mobile_parcel_wall.goldens.json')).goldens ?? {}) as Record<string, Json>;
const bindings = rj(path.join(REPO, 'scripts/surfaces/_schema/bindings.json')) as { mapping: { mobile: Record<string, string[]> } };
const descriptor = rj(path.join(REPO, 'scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_wall.descriptor.json')) as { states: Array<{ name: string; golden: string }> };

const situation = (name: string): WallSituation => {
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

/** The layout rules on one tree: mapped components, keyed children, 44 px Buttons, no derived names (the wall declares none). */
export function wallProblems(t: PropsNode): string[] {
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

describe('mobile_parcel_wall goldens (FE-31)', () => {
  const names = Object.keys(goldens);
  it('one committed golden per declared state, each equal to wallProps(situation) exactly', () => {
    expect(names.sort()).toEqual(descriptor.states.map((s) => s.golden).sort());
    for (const n of names) {
      const g = goldens[n] as { situation: string; props: PropsNode; target: string; surface: string; state: string };
      expect([n, g.surface, g.target, g.state, g.situation]).toEqual([n, 'mobile_parcel_wall', 'mobile', fixture.goldens[n]!.state, fixture.goldens[n]!.situation]);
      expect(wallProps(situation(g.situation))).toStrictEqual(g.props);
    }
  });
  it('every input is a golden or a named case (both directions)', () => {
    expect(Object.keys(fixture.inputs).filter((k) => !ALL.includes(k))).toEqual([]);
    expect(ALL.filter((k) => !(k in fixture.inputs))).toEqual([]);
  });
  it('every content key is used by a committed golden, and every content ref names a key', () => {
    const used = new Set(Object.values(goldens).flatMap((g) => refs(g.props, 'content')));
    expect(Object.keys(WALL_SLICE.content).filter((k) => !used.has(k))).toEqual([]);
    expect([...used].filter((k) => !(k in WALL_SLICE.content))).toEqual([]);
  });
  it('the layout rules hold on every golden (mapped components, keyed children, 44 px Buttons, no derived names)', () => {
    for (const k of ALL) expect([k, wallProblems(wallProps(situation(k)))]).toEqual([k, []]);
  });
  it('no two siblings of any wall golden props tree share a React key (the limit notice has five text lines)', () => {
    for (const n of names) expect([n, duplicateSiblingKeys((goldens[n] as { props: PropsNode }).props)]).toEqual([n, []]);
    for (const k of ALL) expect([k, duplicateSiblingKeys(wallProps(situation(k)))]).toEqual([k, []]);
  });
  it('RED (planted): a Card, a Button under 44 px, a child without a key, a repeated sibling key and a derived name are each found', () => {
    const t = wallProps(situation('limit'));
    const col = nodes(t).find((n) => n.props.testID === 'parcel-wall-column')!;
    col.children.push({ component: 'Card', props: { key: 'c' }, children: [] });
    col.children.push({ component: 'Button', props: { key: 'small', className: 'min-h-[30px]' }, children: [{ derived: 'nearest_lot' }] });
    col.children.push({ component: 'View', props: {}, children: [] });
    col.children.push({ component: 'View', props: { key: 'c' }, children: [] });
    expect(wallProblems(t)).toEqual(expect.arrayContaining([
      'c: Card is not in mapping.mobile.LIST', 'small: Button without min-h-[44px] or min-h-[48px]', 'View: a child node without a key', 'derived name nearest_lot is not declared',
    ]));
    expect(duplicateSiblingKeys(t)).toEqual(['column: key c repeats']);
  });
});

describe('the wall rules (named cases)', () => {
  it('the limit state: one neutral notice (title with the count, reset with the date, the two lead lines, the plan line) and Go to Tracked Lots; no reactivate copy', () => {
    const t = wallProps(situation('limit'));
    const notice = nodes(t).find((n) => n.props.testID === 'parcel-wall-limit')!;
    expect(refs(notice, 'content')).toEqual(['wall.limit.title', 'wall.limit.reset', 'wall.limit.opened', 'wall.limit.stay', 'wall.plan']);
    expect(refs(notice, 'contract')).toEqual(['contract_parcels_entitlement.reportsLimit', 'contract_parcels_entitlement.resetsOnDisplay']);
    expect(nodes(t).some((n) => n.props.testID === 'parcel-wall-reactivate')).toBe(false);
    expect(nodes(t).find((n) => n.props.testID === 'parcel-wall-tracked')!.props.onPress).toEqual({ action: 'push', route: '/(app)/parcel-tool/tracked' });
    expect(wallData(situation('limit'))).toEqual({ contract: { contract_parcels_entitlement: { reportsLimit: 10, resetsOnDisplay: '9 Dec 2026' } }, derived: {} });
  });
  it('round 2 (RR-0468, Spec 128 rule 12): the error state is one tone-error notice with the one sentence and Go to Tracked Lots; no plan line, no retry, no limit or reactivate copy', () => {
    const t = wallProps(situation('error'));
    const notice = nodes(t).find((n) => n.props.testID === 'parcel-wall-error')!;
    expect(refs(notice, 'content')).toEqual(['wall.error']);
    expect([notice.props.icon, notice.props.className]).toEqual(['AlertTriangle', LOT_MAP_LAYOUT.noticeError]); // tone error
    expect(refs(t, 'content')).not.toContain('wall.plan');
    expect(nodes(t).some((n) => n.props.testID === 'parcel-wall-limit' || n.props.testID === 'parcel-wall-reactivate')).toBe(false);
    expect(nodes(t).filter((n) => n.component === 'Button').map((n) => n.props.testID)).toEqual(['parcel-wall-tracked']);
    expect(WALL_SLICE.content['wall.error']).toBe('Something went wrong on our side. Please try again.');
    expect(wallData(situation('error'))).toEqual({ contract: { contract_parcels_entitlement: { reportsLimit: null, resetsOnDisplay: null } }, derived: {} });
  });
  it('the reactivate state: the reactivate sentence and the plan line in one notice, and Go to Tracked Lots; no limit copy; no button but Go to Tracked Lots (RR-0454 item 3)', () => {
    const t = wallProps(situation('reactivate'));
    const notice = nodes(t).find((n) => n.props.testID === 'parcel-wall-reactivate')!;
    expect(refs(notice, 'content')).toEqual(['wall.reactivate', 'wall.plan']);
    expect(nodes(t).some((n) => n.props.testID === 'parcel-wall-limit')).toBe(false);
    expect(nodes(t).filter((n) => n.component === 'Button').map((n) => n.props.testID)).toEqual(['parcel-wall-tracked']);
  });
  it('the wall literals: three equal the approved mock small-pages-v8 report-limit.html state 3 (:286-287), three are the RR-0466 rewording; the reactivate sentence equals the search notice', () => {
    // report-limit.html:286 "You’ve used all <span class="fc">10</span> reports", "Your count resets on <span class="fc">9 Dec 2026</span>."; :287 "Go to Tracked Lots".
    // RR-0466 (MORNING-DECISIONS.md:2410-2413) reworded the other three; the ruling, not the mock, is their pin. The opened line awaits the operator's
    // confirmation (MD:2416-2418) and stays one content key so one string can change.
    expect([
      WALL_SLICE.content['wall.limit.title'], WALL_SLICE.content['wall.limit.reset'], WALL_SLICE.content['wall.tracked'],
      WALL_SLICE.content['wall.limit.opened'], WALL_SLICE.content['wall.limit.stay'], WALL_SLICE.content['wall.plan'],
    ]).toEqual([
      'You’ve used all {limit} reports', 'Your count resets on {date}.', 'Go to Tracked Lots',
      'Lot reports you’ve opened this month stay available.', 'Your Tracked Lots remain.', 'Your plan is managed on the web for changes.',
    ]);
    expect(WALL_SLICE.content['wall.reactivate']).toBe((searchSlice.content as Record<string, string>)['search.entitlement']);
  });
  it('RR-0466 emphasis: the title line carries the title class, the reset line beneath it the small class, every other line the notice text class', () => {
    const notice = nodes(wallProps(situation('limit'))).find((n) => n.props.testID === 'parcel-wall-limit')!;
    const lines = notice.children.filter(isNode).map((n) => [refs(n, 'content')[0], n.props.className]);
    const [title, small, text] = [lines[0]![1], lines[1]![1], lines[2]![1]];
    expect(lines.map((l) => l[0])).toEqual(['wall.limit.title', 'wall.limit.reset', 'wall.limit.opened', 'wall.limit.stay', 'wall.plan']);
    expect(String(title)).toContain('font-semibold');
    expect(String(small)).toContain('text-xs');
    expect(new Set([title, small, text]).size).toBe(3);
    expect([lines[3]![1], lines[4]![1]]).toEqual([text, text]);
  });
});
