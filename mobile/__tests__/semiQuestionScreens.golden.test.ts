/** @jest-environment node */
// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §11b.2 (one props golden per state per target; refs only), §3.1 (LIST),
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-05, FE-31, FE-32,
//            docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §4 (dated note 2026-11-13, SEMI-B).
//
// SEMI-B · the mobile golden test of S-093 `mobile_parcel_semi_question` (the MF-53 test, lotMapScreens.golden.test.ts, on this page). The committed
// goldens (copied by scripts/surfaces/emit-mobile-surfaces.mjs) equal semiQuestionProps(buildSemiQuestionSituation(inputs)) exactly; every input is a
// golden or a named case; every content key is used by a committed golden; derived names are the declared closed list; every component is in
// mapping.mobile.LIST; nothing is selected at open and Continue is disabled until a tap (parcelsemi_nothing_preselected); the question is asked
// ONLY for an unsure lot (parcelsemi_ask_only_when_unsure); each answer opens the report with the right route param.
import fs from 'node:fs';
import path from 'node:path';
import { SEMI_QUESTION_DERIVED_NAMES, SEMI_QUESTION_SLICE, semiQuestionData, semiQuestionProps } from '@/components/surfaces/SemiQuestionBinding';
import type { PropsNode } from '@/components/surfaces/SearchBinding';
import { buildSemiQuestionSituation, type SemiQuestionSituation } from '@/lib/semiQuestion';
import { ApiError, RateLimitError } from '@/lib/errors';
import { PARCEL_TAB_ROUTE, parcelSearchRoute } from '@/lib/parcelSearchMatch';
import type { SemiAnswer } from '@/lib/lotForm';
import type { ConsumerParcelLookupResult } from '@/lib/schemas';

type Json = Record<string, unknown>;
type Input = { parcelId: string; data?: ConsumerParcelLookupResult; error?: string; isFetching?: boolean; selected?: SemiAnswer | null };
const MOBILE = path.resolve(__dirname, '..');
const REPO = path.resolve(MOBILE, '..');
const rj = (p: string): Json => JSON.parse(fs.readFileSync(p, 'utf8'));
const fixture = rj(path.join(__dirname, 'fixtures/semiQuestion.situations.json')) as { goldens: Record<string, { state: string; situation: string }>; inputs: Record<string, Input>; named: string[] };
const goldens = (rj(path.join(__dirname, 'fixtures/surfaces/mobile_parcel_semi_question.goldens.json')).goldens ?? {}) as Record<string, Json>;
const bindings = rj(path.join(REPO, 'scripts/surfaces/_schema/bindings.json')) as { mapping: { mobile: Record<string, string[]> } };
const descriptor = rj(path.join(REPO, 'scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_semi_question.descriptor.json')) as { states: Array<{ name: string; golden: string }> };

/** The same error construction as scripts/surfaces/semi-question-golden-capture.ts. */
const errorOf = (kind: string | undefined): unknown =>
  kind === 'rate_limited' ? new RateLimitError(30) : kind === 'entitlement' ? new ApiError(403, 'forbidden') : kind === 'unexpected' || kind === 'schema_drift' ? new Error('boom') : null;
const situation = (name: string): SemiQuestionSituation => {
  const i = fixture.inputs[name];
  if (!i) throw new Error(`no input ${name}`);
  return buildSemiQuestionSituation({ parcelId: i.parcelId, data: i.data, error: errorOf(i.error), isFetching: i.isFetching ?? false, schemaDrift: i.error === 'schema_drift', selected: i.selected ?? null });
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
const byTestID = (t: PropsNode, id: string): PropsNode | undefined => nodes(t).find((n) => n.props.testID === id);
const ALL = [...Object.values(fixture.goldens).map((g) => g.situation), ...fixture.named];

/** The layout and selection rules on one tree (each rule's planted case is below). */
export function semiQuestionProblems(t: PropsNode, s: SemiQuestionSituation): string[] {
  const out: string[] = [];
  const allowed = bindings.mapping.mobile.LIST!;
  const walk = (n: PropsNode, parent: PropsNode | null): void => {
    const at = String(n.props.key ?? n.props.testID ?? n.component);
    if (!allowed.includes(n.component)) out.push(`${at}: ${n.component} is not in mapping.mobile.LIST`);
    if (parent && n.props.key === undefined) out.push(`${at}: a child node without a key`);
    if (n.component === 'Button' && !String(n.props.className ?? '').split(/\s+/).includes('min-h-[44px]')) out.push(`${at}: Button without min-h-[44px]`);
    for (const c of n.children) if (isNode(c)) walk(c, n);
  };
  walk(t, null);
  const cont = byTestID(t, 'parcel-semi-continue');
  const radios = nodes(t).filter((n) => n.props.role === 'radio');
  const checked = radios.filter((n) => (n.props.accessibilityState as Json).checked === true);
  if (s.selected === null && checked.length > 0) out.push('an answer is checked with nothing selected');
  if (s.state === 'ask' && radios.length !== 3) out.push('the question does not show exactly three answers');
  if (s.state !== 'ask' && (radios.length > 0 || cont)) out.push('answers shown outside the ask state');
  if (cont && s.selected === null && (cont.props.disabled !== true || cont.props.onPress !== null)) out.push('Continue is enabled with nothing selected');
  for (const name of refs(t, 'derived')) if (!SEMI_QUESTION_DERIVED_NAMES.some((re) => re.test(name))) out.push(`derived name ${name} is not declared`);
  return out;
}

describe('mobile_parcel_semi_question goldens (FE-31)', () => {
  const names = Object.keys(goldens);
  it('one committed golden per declared state, each equal to semiQuestionProps(situation) exactly', () => {
    expect(names.sort()).toEqual(descriptor.states.map((s) => s.golden).sort());
    for (const n of names) {
      const g = goldens[n] as { situation: string; props: PropsNode; target: string; surface: string; state: string };
      expect([n, g.surface, g.target, g.state, g.situation]).toEqual([n, 'mobile_parcel_semi_question', 'mobile', fixture.goldens[n]!.state, fixture.goldens[n]!.situation]);
      expect(semiQuestionProps(situation(g.situation))).toStrictEqual(g.props);
    }
  });
  it('every input is a golden or a named case (both directions)', () => {
    expect(Object.keys(fixture.inputs).filter((k) => !ALL.includes(k))).toEqual([]);
    expect(ALL.filter((k) => !(k in fixture.inputs))).toEqual([]);
  });
  it('every content key is used by a committed golden, every content ref names a key, every declared derived name is used', () => {
    const used = new Set(Object.values(goldens).flatMap((g) => refs(g.props, 'content')));
    expect(Object.keys(SEMI_QUESTION_SLICE.content).filter((k) => !used.has(k))).toEqual([]);
    expect([...used].filter((k) => !(k in SEMI_QUESTION_SLICE.content))).toEqual([]);
    const derived = ALL.flatMap((k) => refs(semiQuestionProps(situation(k)), 'derived'));
    expect(SEMI_QUESTION_DERIVED_NAMES.filter((re) => !derived.some((u) => re.test(u))).map(String)).toEqual([]);
  });
  it('the layout and selection rules hold on every golden and named case', () => {
    for (const k of ALL) expect([k, semiQuestionProblems(semiQuestionProps(situation(k)), situation(k))]).toEqual([k, []]);
  });
  it('RED (planted): a pre-checked answer, an enabled Continue with nothing picked, an undeclared name, a Card, a fourth answer', () => {
    const s = situation('ask');
    const t = semiQuestionProps(s);
    nodes(t).find((n) => n.props.role === 'radio')!.props.accessibilityState = { checked: true };
    const cont = byTestID(t, 'parcel-semi-continue')!;
    cont.props.disabled = false; cont.props.onPress = { action: 'push', route: 'x' };
    nodes(t).find((n) => n.component === 'Text')!.children.push({ derived: 'nearest_lot' });
    const col = byTestID(t, 'parcel-semi-column')!;
    col.children.push({ component: 'Card', props: { key: 'c' }, children: [] });
    col.children.push({ component: 'Button', props: { key: 'extra', role: 'radio', className: 'min-h-[44px]', accessibilityState: { checked: false } }, children: [] });
    expect(semiQuestionProblems(t, s)).toEqual(expect.arrayContaining([
      'an answer is checked with nothing selected', 'Continue is enabled with nothing selected', 'derived name nearest_lot is not declared',
      'c: Card is not in mapping.mobile.LIST', 'the question does not show exactly three answers',
    ]));
  });
});

describe('the page rules (named cases)', () => {
  it('ask: three answers in the ruled order, nothing selected at open, Continue reads "Choose an answer" and is disabled', () => {
    const s = situation('ask');
    expect([s.state, s.answers, s.selected, s.route]).toEqual(['ask', ['yes', 'no', 'not_sure'], null, null]);
    const cont = byTestID(semiQuestionProps(s), 'parcel-semi-continue')!;
    expect(cont.children[0]).toMatchObject({ children: [{ content: 'select.none' }] });
    expect(semiQuestionData(s).derived).toEqual({ answer: ['yes', 'no', 'not_sure'] });
  });
  it.each([
    ['ask_yes', '/(app)/parcel-tool/PCL-S1?semi=answered&lotFormOverride=semi_half'],
    ['ask_no', '/(app)/parcel-tool/PCL-S1?semi=answered&lotFormOverride=detached'],
    ['ask_not_sure', '/(app)/parcel-tool/PCL-S1?semi=answered'],
  ])('%s: that card is checked and Continue replaces the page with %s', (name, route) => {
    const s = situation(name);
    expect(s.route).toBe(route);
    const t = semiQuestionProps(s);
    expect(nodes(t).filter((n) => n.props.role === 'radio' && (n.props.accessibilityState as Json).checked === true)).toHaveLength(1);
    expect(byTestID(t, 'parcel-semi-continue')!.props.onPress).toEqual({ action: 'push', route });
  });
  it('asked ONLY when unsure: a clear semi, a clear detached lot and an older server go straight to the report route the search page opens', () => {
    for (const k of ['redirect_clear', 'redirect_detached', 'redirect_older_server']) {
      const s = situation(k);
      expect([k, s.state, s.answers, s.navigate]).toEqual([k, 'redirect', [], parcelSearchRoute('unique', { parcelId: 'PCL-S1', query: '' })]);
      expect(semiQuestionProps(s).props.navigate).toBe('/(app)/parcel-tool/PCL-S1');
    }
  });
  it('no data and not fetching replaces with the Lookup route; a stale pick outside the ask state is dropped', () => {
    expect(situation('redirect_no_data').navigate).toBe(PARCEL_TAB_ROUTE.lookup);
    const s = situation('stale_pick_outside_ask');
    expect([s.selected, s.route]).toEqual([null, null]);
  });
});
