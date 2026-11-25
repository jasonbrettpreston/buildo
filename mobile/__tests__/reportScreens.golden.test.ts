/** @jest-environment node */
// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §11b.2 dated note 2026-11-11 (MF-48: the mobile REPORT binding, the part ref),
//            §11a.7 dated note 2026-11-11 (the three approved state texts), docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-05, FE-31,
//            FE-32; approved mock v21 (MF-57 D-E pending style).
//
// MF-48 · the mobile REPORT props goldens (src/tests/fixtures/report-page/props/<state>.mobile.json, read from the repo path as the MF-35 golden test
// reads bindings.json). Each page golden's `view` is MF-57's pageViewOf output (re-proved by the root test report-mobile.logic.test.ts); here:
// T1 reportProps(view) / lifecycleProps(state) equal the committed props; every part of a view is shown in some UI state or is a declared unshown
// role (totality); T2 every pending part carries the pending style last; T3 no literal display text, every ref kind declared, every part ref
// resolves; T4 the REPORT layout rules (mapping.mobile.REPORT, keyed children, Text size/weight/report colour, exactly min-h-[44px]); T5 the binding
// throws on an unknown section kind, an unplaced part, an ad section without its ad. Each rule has a planted case.
// task-267 + task-317 (dated 2026-11-25, PLAN-267-v2 section 5): + the five loading screen goldens (checking, ready, holding, error_lines, miss_lines): T1
// checkedProps(checked, elapsed_ms, screen) equals the committed props; every derived ref resolves to a text of the server's checked view; the miss state
// carries Back to search (RR-0490 4 B) and the label Checks for this lot is content (RR-0493).
import fs from 'node:fs';
import path from 'node:path';
import { backProps, checkedProps, lifecycleProps, reportProps, REPORT_UI_CLOSED, UNSHOWN, type CheckedView, type LifecycleState, type PageView, type PropsNode, type ReportScreen, type ReportUi } from '@/components/surfaces/ReportBinding';
import { resolveValue, type SurfaceActions } from '@/components/surfaces/SurfaceRenderer';
import { REPORT_PENDING } from '@/constants/reportPage';

type Json = Record<string, unknown>;
const MOBILE = path.resolve(__dirname, '..');
const REPO = path.resolve(MOBILE, '..');
const rj = (p: string): Json => JSON.parse(fs.readFileSync(p, 'utf8'));
const DIR = path.join(REPO, 'src/tests/fixtures/report-page/props');
const goldens = Object.fromEntries(fs.readdirSync(DIR).filter((f) => f.endsWith('.mobile.json')).sort().map((f) => [f.slice(0, -'.mobile.json'.length), rj(path.join(DIR, f))]));
const bindings = rj(path.join(REPO, 'scripts/surfaces/_schema/bindings.json')) as { mapping: { mobile: Record<string, string[]> }; touch_targets: { mobile: Record<string, string[]> }; ref_kinds: string[]; non_display_keys: string[] };
const PAGE_STATES = ['page_all_null', 'page_no_ad', 'page_not_evaluated', 'page_option_hidden', 'page_v21'];
const LIFE_STATES = ['error', 'loading', 'miss'];
const CHECKED_STATES = ['checking', 'error_lines', 'holding', 'miss_lines', 'ready'];
const viewOf = (n: string): PageView => goldens[n]!.view as PageView;
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
/** The 35 report-* colour keys (MF-83: 31 re-valued + amber-ink, amber-soft, stage, field) of mobile/tailwind.config.js (membership, not a prefix). */
const REPORT_COLOURS = [...new Set([...fs.readFileSync(path.join(MOBILE, 'tailwind.config.js'), 'utf8').matchAll(/'(report-[a-z-]+)':/g)].map((m) => m[1]!))]; // a Set: boxShadow 'report-card' (MF-83 fix 5) shares a name with the colour

const isNode = (v: unknown): v is PropsNode => typeof v === 'object' && v !== null && 'component' in v;
const nodes = (t: PropsNode): PropsNode[] => [t, ...t.children.filter(isNode).flatMap(nodes)];
const refs = (v: unknown, kind: string): string[] => {
  if (Array.isArray(v)) return v.flatMap((x) => refs(x, kind));
  if (typeof v !== 'object' || v === null) return [];
  const o = v as Json;
  if (Object.keys(o).length === 1 && kind in o) return [String(o[kind])];
  return Object.values(o).flatMap((x) => refs(x, kind));
};
const both = (r: { page: PropsNode; sheet: PropsNode | null; detail?: PropsNode | null }): PropsNode[] => [r.page, ...(r.sheet ? [r.sheet] : []), ...(r.detail ? [r.detail] : [])]; // MF-83: + the See details sheet tree
const optionIds = (v: PageView): string[] => v.sections.filter((s) => s.kind === 'option').map((s) => s.id);
const uiAll = (v: PageView, panel: 'size' | 'cost' | null, how: boolean): ReportUi => ({
  panel: Object.fromEntries(optionIds(v).map((id) => [id, panel])), how: Object.fromEntries(optionIds(v).map((id) => [id, how])),
});

/** T2: a Text whose part is pending ends with the pending style. */
export function pendingProblems(t: PropsNode, v: PageView): string[] {
  const out: string[] = [];
  for (const n of nodes(t).filter((x) => x.component === 'Text')) {
    for (const r of refs(n.children, 'part')) {
      const [id, at] = r.split('.');
      const p = v.sections.find((s) => s.id === id)?.parts[at as unknown as number];
      if (p?.kind === 'pending' && !String(n.props.className).endsWith(REPORT_PENDING)) out.push(`${String(n.props.key)}: pending part ${r} without the pending style last`);
      if (p && p.kind !== 'pending' && String(n.props.className).includes(REPORT_PENDING)) out.push(`${String(n.props.key)}: ${p.kind} part ${r} in the pending style`);
    }
  }
  return out;
}

/** T3: under a display key only refs of a declared kind, nodes, lists or true/false/null; never a string or a number. */
export function textProblems(v: unknown, at: string): string[] {
  if (typeof v === 'string') return [`raw string at ${at}`];
  if (typeof v === 'number') return [`number at ${at}`];
  if (v === null || typeof v === 'boolean' || v === undefined) return [];
  if (Array.isArray(v)) return v.flatMap((x, i) => textProblems(x, `${at}/${i}`));
  const o = v as Json;
  const keys = Object.keys(o);
  if (keys.length === 1 && bindings.ref_kinds.includes(keys[0]!)) return typeof o[keys[0]!] === 'string' ? [] : [`ref value not a string at ${at}`];
  return keys.filter((k) => !bindings.non_display_keys.includes(k) || (o[k] !== null && typeof o[k] === 'object')).flatMap((k) => textProblems(o[k], `${at}/${k}`));
}

/** T4: the REPORT layout rules. */
export function reportLayoutProblems(t: PropsNode, archetype = 'REPORT'): string[] {
  const out: string[] = [];
  const allowed = bindings.mapping.mobile[archetype] ?? [];
  const touch = bindings.touch_targets.mobile;
  const walk = (n: PropsNode, parent: PropsNode | null): void => {
    const at = String(n.props.key ?? n.component);
    if (!allowed.includes(n.component)) out.push(`${at}: ${n.component} is not in mapping.mobile.${archetype}`);
    if (parent && n.props.key === undefined) out.push(`${at}: a child node without a key`);
    const tk = String(n.props.className ?? '').split(/\s+/).filter(Boolean);
    if (n.component === 'Text') {
      if (!tk.some((x) => /^text-(xs|sm|base|lg|xl|2xl|\[\d+px\])$/.test(x))) out.push(`${at}: Text without a size`);
      if (!tk.some((x) => /^font-(normal|medium|semibold|bold)$/.test(x))) out.push(`${at}: Text without a weight`);
      if (!tk.some((x) => x.startsWith('text-') && REPORT_COLOURS.includes(x.slice('text-'.length)))) out.push(`${at}: Text without a report colour`);
    }
    if (touch[n.component]) {
      const mins = tk.filter((x) => /(^|:)min-h-/.test(x));
      if (!touch[n.component]!.some((x) => tk.includes(x)) || mins.length !== 1) out.push(`${at}: ${n.component} min-h tokens ${JSON.stringify(mins)} (need exactly one of ${touch[n.component]!.join('|')})`);
    }
    for (const c of n.children) if (isNode(c)) walk(c, n);
  };
  walk(t, null);
  return out;
}

const noActions = {} as unknown as SurfaceActions;
const ctxOf = (v: PageView) => ({ content: {}, data: { contract: {}, derived: {}, page: v }, actions: noActions });

describe('MF-48 mobile REPORT props goldens', () => {
  it('13 committed goldens: 5 page states, the 3 lifecycle states and the 5 loading screen states', () => {
    expect(Object.keys(goldens)).toEqual([...LIFE_STATES, ...PAGE_STATES, ...CHECKED_STATES].sort());
    expect(REPORT_COLOURS).toHaveLength(35);
  });
  it('T1: reportProps(view) and lifecycleProps(state) equal the committed props exactly', () => {
    for (const n of PAGE_STATES) {
      const g = goldens[n]!;
      expect([n, g.target, g.surface, (g.view as PageView).target, (g.view as PageView).layout.details]).toEqual([n, 'mobile', 'mobile_parcel_detail', 'mobile', 'collapsed']);
      expect(reportProps(viewOf(n))).toStrictEqual(g.props);
    }
    for (const n of LIFE_STATES) expect(lifecycleProps(n as LifecycleState)).toStrictEqual(goldens[n]!.props);
    for (const n of CHECKED_STATES) {
      const g = goldens[n]!;
      expect(checkedProps(g.checked as CheckedView, g.elapsed_ms as number, g.screen as Exclude<ReportScreen, 'view'>)).toStrictEqual(g.props);
    }
  });
  it('task-267: every derived ref of a loading screen golden resolves to a text of its checked view; the screens draw their own end area and no Skip', () => {
    for (const n of CHECKED_STATES) {
      const g = goldens[n]!;
      const c = { content: {}, data: { contract: {}, derived: { checked: g.checked }, page: undefined }, actions: noActions };
      for (const r of refs(g.props, 'derived')) expect([n, r, typeof resolveValue({ derived: r }, c)]).toEqual([n, r, 'string']);
      const content = refs(g.props, 'content');
      expect(content[0]).toBe('checks.label');
      expect(JSON.stringify(g.props)).not.toContain('skip');
    }
    expect(refs(goldens.ready!.props, 'derived')).toEqual(expect.arrayContaining(['checked.ready.text', 'checked.open.text']));
    expect(refs(goldens.holding!.props, 'content')).toEqual(['checks.label', 'states.lifecycle.loading']);
    expect(refs(goldens.error_lines!.props, 'content')).toEqual(['checks.label', 'states.lifecycle.error', 'retry.text']);
    expect(refs(goldens.miss_lines!.props, 'content')).toEqual(['checks.label', 'states.lifecycle.miss', 'back_to_search.text']);
    expect(refs(goldens.checking!.props, 'content')).toEqual(['checks.label']);
    // the endings keep the lines as far as they got: the golden's lines are exactly those whose delay has come
    for (const n of CHECKED_STATES) {
      const g = goldens[n]!;
      const ck = g.checked as CheckedView;
      const shown = ck.groups.flatMap((x) => x.lines.filter((l) => l.delay_ms <= (g.elapsed_ms as number)).map((l) => `line-${x.key}-${l.key}`));
      expect([n, nodes(g.props as unknown as PropsNode).map((x) => String(x.props.key)).filter((k) => k.startsWith('line-'))]).toEqual([n, shown]);
    }
  });
  it('T1 totality: every part of every view is shown in some UI state (closed, a panel open, How? open) or is a declared unshown role', () => {
    for (const n of PAGE_STATES) {
      const v = viewOf(n);
      // MF-83: the sheet shows one panel at a time, so each option is opened on its own (size, How?, cost) as well as all at once
      const one = (id: string, panel: 'size' | 'cost' | null, how: boolean): ReportUi => ({ panel: { [id]: panel }, how: { [id]: how } });
      const uis = [REPORT_UI_CLOSED, uiAll(v, 'size', true), uiAll(v, 'cost', false), ...optionIds(v).flatMap((id) => [one(id, 'size', false), one(id, 'cost', false), one(id, null, true)])];
      const shown = new Set(uis.flatMap((ui) => both(reportProps(v, ui)).flatMap((t) => refs(t, 'part'))));
      for (const s of v.sections) s.parts.forEach((p, i) => {
        const r = `${s.id}.${i}.${p.role}`;
        const unshown = (UNSHOWN[s.kind] ?? []).some((u) => u.role === p.role && (!u.whenPending || p.kind === 'pending'));
        expect([n, r, shown.has(r) || unshown]).toEqual([n, r, true]);
      });
      for (const s of v.sections.filter((x) => x.ad)) expect([...shown].filter((r) => r.startsWith(`${s.id}.ad.`)).sort()).toEqual([`${s.id}.ad.disclosure`, `${s.id}.ad.value`]);
    }
  });
  it('the variants: o1 hidden is absent, o2 not_evaluated has no scenario ad, page_no_ad has no ad ref, page_all_null shows the dash', () => {
    const ids = (n: string) => refs(both(reportProps(viewOf(n))), 'part').map((r) => r.split('.')[0]);
    expect(ids('page_v21')).toEqual(expect.arrayContaining(['o1', 'o2', 'o3', 'ad_o2']));
    expect(ids('page_option_hidden')).not.toContain('o1');
    expect(ids('page_not_evaluated')).not.toContain('ad_o2');
    expect(refs(both(reportProps(viewOf('page_no_ad'))), 'part').filter((r) => r.includes('.ad.'))).toEqual([]);
    const v = viewOf('page_all_null');
    expect(v.sections.flatMap((s) => s.parts).filter((p) => p.kind === 'value').every((p) => p.text === '—')).toBe(true);
  });
  it('T2: every pending part carries the pending style last, and no other part does (all goldens, every UI state)', () => {
    for (const n of PAGE_STATES) for (const ui of [REPORT_UI_CLOSED, uiAll(viewOf(n), 'size', true), uiAll(viewOf(n), 'cost', false)]) {
      for (const t of both(reportProps(viewOf(n), ui))) expect([n, pendingProblems(t, viewOf(n))]).toEqual([n, []]);
    }
  });
  it('T2 RED (planted): a pending part drawn in a value style, and a value part in the pending style', () => {
    const v = viewOf('page_v21');
    const t = reportProps(v).page;
    const title = nodes(t).find((x) => x.props.key === 'o1-title')!;
    title.props.className = String(title.props.className).replace(REPORT_PENDING, '').trim();
    const value = nodes(t).find((x) => x.props.key === 'o1-size-value')!;
    value.props.className = `${String(value.props.className)} ${REPORT_PENDING}`;
    expect(pendingProblems(t, v)).toEqual(['o1-title: pending part o1.1.title without the pending style last', 'o1-size-value: value part o1.5.size.value in the pending style']);
  });
  it('T3: no literal display text in any tree; every ref kind is declared; every part ref resolves through SurfaceRenderer', () => {
    for (const n of Object.keys(goldens)) {
      const p = goldens[n]!.props as Json;
      expect([n, textProblems(p, n)]).toEqual([n, []]);
      if (PAGE_STATES.includes(n)) for (const r of refs(p, 'part')) expect(typeof resolveValue({ part: r }, ctxOf(viewOf(n)))).toBe('string');
    }
  });
  it('T3 RED (planted): a "2,670 sq ft" string, a number and an undeclared ref kind', () => {
    const t = clone(goldens.page_v21!.props) as { page: PropsNode };
    const value = nodes(t.page).find((x) => x.props.key === 'o1-size-value')!;
    value.children = ['2,670 sq ft' as unknown as PropsNode];
    value.props.accessibilityLabel = 42;
    value.props.accessibilityHint = { field: 'area_sqft' };
    const lines = textProblems(t, 'g');
    expect(lines).toHaveLength(3);
    expect(lines.filter((l) => /^raw string at g\/page\/.*\/children\/0$/.test(l))).toHaveLength(1);
    expect(lines.filter((l) => /^number at .*\/accessibilityLabel$/.test(l))).toHaveLength(1);
    expect(lines.filter((l) => /^raw string at .*\/accessibilityHint\/field$/.test(l))).toHaveLength(1);
  });
  it('T3 the part ref: a wrong index, a wrong role, ad.label, an unknown section and no page each throw', () => {
    const v = viewOf('page_v21');
    const c = ctxOf(v);
    expect(resolveValue({ part: 'o1.5.size.value' }, c)).toBe('2,670'); // MF-57 D-J: the unit is its own part
    expect(resolveValue({ part: 'o1.6.size.unit' }, c)).toBe('sq ft');
    expect(resolveValue({ part: 'ad_o2.ad.disclosure' }, c)).toBe('Sponsored');
    for (const bad of ['o1.6.size.value', 'o1.5.cost.value', 'ad_o2.ad.label', 'zz.0.title', 'o1.06.size.value', 'o1.x.size.value']) {
      expect(() => resolveValue({ part: bad }, c)).toThrow(`unresolved ref {"part":"${bad}"}`);
    }
    expect(() => resolveValue({ part: 'title.0.title' }, { ...c, data: { contract: {}, derived: {} } })).toThrow('unresolved ref');
  });
  it('T4: the REPORT layout rules hold on every golden tree and every UI state', () => {
    // MF-48 Stage B (dated 2026-11-12): + SafeAreaView, the Back bar's top safe area (the SEARCH and LIST form, edges {top: additive}).
    expect(bindings.mapping.mobile.REPORT).toEqual(['ScrollView', 'View', 'Text', 'Button', 'Input', 'ActivityIndicator', 'SafeAreaView', 'Svg', 'SvgPolygon', 'SvgLine']);
    expect(['back', reportLayoutProblems(backProps()), textProblems(backProps(), 'back')]).toEqual(['back', [], []]);
    expect(['back+title', reportLayoutProblems(backProps(true)), textProblems(backProps(true), 'back')]).toEqual(['back+title', [], []]); // task-267: the bar names the lot
    for (const n of Object.keys(goldens)) {
      const p = goldens[n]!.props as Json;
      for (const t of 'page' in p ? both(p as { page: PropsNode; sheet: PropsNode | null }) : [p as unknown as PropsNode]) expect([n, reportLayoutProblems(t)]).toEqual([n, []]);
    }
    for (const n of PAGE_STATES) for (const t of both(reportProps(viewOf(n), uiAll(viewOf(n), 'size', true)))) expect([n, reportLayoutProblems(t)]).toEqual([n, []]);
  });
  it('T4 RED (planted): a Card, a keyless child, a zinc colour, a Text without size, a Button min-h-11', () => {
    const t = reportProps(viewOf('page_v21')).page;
    const col = t.children[0] as PropsNode;
    col.children.push({ component: 'Card', props: {}, children: [] });
    const addr = nodes(t).find((x) => x.props.key === 'address-address')!;
    addr.props.className = 'text-[18px] font-semibold text-zinc-100';
    const legal = nodes(t).find((x) => x.props.key === 'legal-line')!;
    legal.props.className = 'font-normal text-report-muted';
    const btn = nodes(t).find((x) => x.props.key === 'o1-size-open')!;
    btn.props.className = String(btn.props.className).replace('min-h-[44px]', 'min-h-11');
    expect(reportLayoutProblems(t)).toEqual([
      'address-address: Text without a report colour',
      // Dated 2026-11-20 (task-354): the message names the whole list since 8a5387194 (2026-11-19, SUITE.FIX-2: touch_targets.mobile.Button lists 44 and 48 px).
      'o1-size-open: Button min-h tokens ["min-h-11"] (need exactly one of min-h-[44px]|min-h-[48px])',
      'legal-line: Text without a size',
      'Card: Card is not in mapping.mobile.REPORT',
      'Card: a child node without a key',
    ]);
    // A REPORT tree is not a SEARCH tree: the SEARCH list has no ScrollView-free REPORT allowance beyond its own parts.
    expect(reportLayoutProblems(t, 'SEARCH').some((l) => l.includes('is not in mapping.mobile.SEARCH'))).toBe(true);
  });
  it('T5: an unknown section kind, an unplaced part and an ad section without its ad throw', () => {
    const kind = clone(viewOf('page_v21'));
    kind.sections.push({ kind: 'carousel', id: 'x', parts: [] });
    expect(() => reportProps(kind)).toThrow('ReportBinding: unknown section kind carousel (x)');
    const extra = clone(viewOf('page_v21'));
    extra.sections.find((s) => s.id === 'legal')!.parts.push({ role: 'line2', brief: 'G1', kind: 'content', text: 'x' });
    expect(() => reportProps(extra)).toThrow('ReportBinding: part legal.1.line2 of a legal section is not placed');
    const shownCount = clone(viewOf('page_v21'));
    const o1 = shownCount.sections.find((s) => s.id === 'o1')!;
    const nbr = o1.parts.find((p) => p.role === 'nbr.swipe')!;
    nbr.role = 'nbr.carousel';
    expect(() => reportProps(shownCount)).toThrow(/part o1\.\d+\.nbr\.carousel of a option section is not placed/);
    const ad = clone(viewOf('page_v21'));
    delete ad.sections.find((s) => s.kind === 'ad')!.ad;
    expect(() => reportProps(ad)).toThrow('ReportBinding: ad section ad_o2 has no ad');
  });
  it('UI state (details_view inline, the in-place path): a size panel opens alone in its option; the opener label flips to the hide text; the expanded layout row opens all with no toggles', () => {
    const v0 = viewOf('page_v21');
    const v = { ...v0, layout: { ...v0.layout, details_view: 'inline' } };
    const keys = (ui: ReportUi): string[] => nodes(reportProps(v, ui).page).map((x) => String(x.props.key));
    const closed = keys(REPORT_UI_CLOSED);
    expect(closed.filter((k) => k.endsWith('-panel'))).toEqual([]);
    const open = reportProps(v, { panel: { o1: 'size' }, how: {} }).page;
    expect(nodes(open).map((x) => String(x.props.key)).filter((k) => k.endsWith('-panel'))).toEqual(['o1-size-panel']);
    const label = nodes(open).find((x) => x.props.key === 'o1-size-open-label')!;
    expect(refs(label.children, 'part')[0]).toMatch(/^o1\.\d+\.size\.panel\.hide$/);
    expect(nodes(open).find((x) => x.props.key === 'o1-size-open')!.props.accessibilityState).toEqual({ expanded: true });
    const wide = { ...v, layout: { ...v.layout, details: 'expanded' } };
    const ex = nodes(reportProps(wide).page).map((x) => String(x.props.key));
    expect(ex.filter((k) => k.endsWith('-panel')).sort()).toEqual(['o1-cost-panel', 'o1-size-panel', 'o2-cost-panel', 'o2-size-panel', 'o3-cost-panel', 'o3-size-panel']);
    expect(ex.filter((k) => /^o[0-9]+-.*(open|hide|how)$/.test(k))).toEqual([]); // the lot-size button stays (MF-57 D-K open)
  });
  it('MF-83 (FE-43) details_view sheet: the open panel or How? is the `detail` tree, never in the page; closed is null; the close action is close_detail', () => {
    const v = viewOf('page_v21');
    expect(v.layout.details_view).toBe('sheet');
    expect(reportProps(v).detail).toBeNull();
    const r = reportProps(v, { panel: { o1: 'size' }, how: {} });
    expect(nodes(r.page).map((x) => String(x.props.key)).filter((k) => k.endsWith('-panel'))).toEqual([]);
    expect(r.detail!.props.key).toBe('o1-size-panel');
    const h = reportProps(v, { panel: {}, how: { o1: true } });
    expect(h.detail!.props.key).toBe('o1-how-steps');
    expect(nodes(h.page).map((x) => String(x.props.key))).not.toContain('o1-how-steps');
    expect(() => reportProps({ ...v, layout: { ...v.layout, details_view: 'drawer' } })).toThrow('ReportBinding: unknown layout details_view drawer');
  });
  it('MF-83 group 2 (FE-42): a lot view in the view is drawn as Svg nodes from the sent coordinates (strings only, refs for texts); with no drawing nothing is drawn', () => {
    const fixture = (st: string): PageView => {
      const g = JSON.parse(fs.readFileSync(path.join(process.cwd(), '..', 'src/tests/fixtures/report-page', `${st}.mobile.json`), 'utf8'));
      return { target: 'mobile', layout: { details: 'collapsed', details_view: 'sheet' }, sections: g.rendered_tree.sections } as PageView;
    };
    const drawn = fixture('lot_view_drawn');
    const page = reportProps(drawn).page;
    expect(nodes(page).filter((x) => x.component === 'Svg')).toHaveLength(1);
    expect(nodes(page).filter((x) => x.component === 'SvgLine').map((x) => [x.props.stroke, x.props.x1])).toEqual([['#9a4a07', '100'], ['#1d1b18', '900'], ['#4d4841', '900'], ['#1d1b18', '100']]);
    expect(nodes(page).filter((x) => x.component === 'SvgPolygon').map((x) => x.props.points)).toEqual(['100,100 900,100 900,900 100,900', '200,200 800,200 800,800 200,800']);
    for (const r of refs(page, 'part')) expect(typeof resolveValue({ part: r }, ctxOf(drawn))).toBe('string');
    expect(nodes(reportProps(fixture('lot_view_shape')).page).filter((x) => x.component === 'SvgPolygon')).toHaveLength(1);
    expect(nodes(reportProps(viewOf('page_v21')).page).filter((x) => x.component === 'Svg')).toEqual([]);
  });
  it('OUTPUT fold CR MED-1 / LOW-1: a served (not pending) notes count shows its chip when collapsed and none when expanded, without a throw; an unknown details value throws', () => {
    const v = clone(viewOf('page_v21'));
    const count = v.sections.find((s) => s.id === 'o1')!.parts.find((p) => p.role === 'size.count')!;
    count.kind = 'value';
    count.text = '3';
    expect(refs(reportProps(v).page, 'part').filter((r) => r.endsWith('.size.count'))).toHaveLength(1);
    const wide = { ...v, layout: { ...v.layout, details: 'expanded' } };
    expect(refs(reportProps(wide).page, 'part').filter((r) => r.endsWith('.size.count'))).toEqual([]);
    expect(() => reportProps({ ...v, layout: { ...v.layout, details: 'weird' } })).toThrow('ReportBinding: unknown layout details weird');
  });
  it('T9: the lifecycle trees show their approved content key, never a blank or the dash; loading has the spinner', () => {
    for (const n of LIFE_STATES) {
      const t = lifecycleProps(n as LifecycleState);
      // MF-48 Stage B (B-4 b): the error state also carries Retry, its text the content key retry.text ("Try again"). task-317 (RR-0490 4 B): the miss
      // state carries Back to search, its text the content key back_to_search.text.
      expect(refs(t, 'content')).toEqual([`states.lifecycle.${n}`, ...(n === 'error' ? ['retry.text'] : []), ...(n === 'miss' ? ['back_to_search.text'] : [])]);
      expect(nodes(t).some((x) => x.component === 'ActivityIndicator')).toBe(n === 'loading');
    }
  });
});
