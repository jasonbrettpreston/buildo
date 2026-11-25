// @vitest-environment jsdom
// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §11b.5 (the first web consumer of SEARCH: one planted-defect case and one render
//            smoke), §11b.2 (every declared state maps to a library state component), docs/specs/02-web-admin/135_mcfrontend_decisions_register.md
//            FE-33 (every displayed string from content), FE-31, docs/specs/02-web-admin/33_web_admin_engineering_protocol.md section 9 (44 px).
//
// MF-44 · the web SEARCH render smoke (operator "01-a 0-2 b as long as they are complaint"). Cases:
//   (a) every committed web golden of mobile_parcel_search renders through the one provider with its situation's data: no throw, no console error
//       outside a commented allowlist, every content string it names present (templates filled), no raw ref left in the markup;
//   (b) the run-time `disabled` option (the live switch is off) disables the input and every button;
//   (c) actions reach the mount's callbacks (a chip sets the input; SELECT pushes the web route of the checked lot);
//   Dated 2026-11-25 (task-465 McFixV2.1, RR-0487, RR-0495; prior text kept): a row tap pushes the web route of its lot and Enter fires submit; there
//   is no SELECT, no radio card, no count badge and no prompt line.
//   (d) RED: an unknown component, a missing content key, an unresolved ref and an unknown action each throw.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createElement as h, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AdminMantineProvider } from '../../components/surfaces/web/AdminMantineProvider';
import { SearchBinding, searchWebData, searchWebTree, type WebNode, type WebSituation } from '../../components/surfaces/web/SearchBinding';
import { SEARCH_CONTENT as C, WEB_ERROR_SITUATION, WEB_STATIC_SITUATION, WEB_UNAUTHORIZED_SITUATION } from '../../lib/surfaces/maxbld-web';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- golden JSON
const ROOT = process.cwd();
const DIR = path.join(ROOT, 'src/tests/fixtures/surfaces/mobile_parcel_search');
const SITUATIONS: Record<string, WebSituation> = JSON.parse(fs.readFileSync(path.join(ROOT, 'mobile/__tests__/fixtures/parcelSearch.situations.json'), 'utf8'));
const GOLDENS = fs.readdirSync(DIR).filter((f) => f.endsWith('.web.json')).sort().map((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')) as Json);
const provided = (el: ReactElement): ReactElement => h(AdminMantineProvider, { scheme: 'dark', children: el });
const decode = (s: string): string => s.replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const bind = (s: WebSituation, extra: Json = {}): ReactElement => h(SearchBinding, { tree: searchWebTree(s), content: C, data: searchWebData(s), ...extra });
// task-450 AC4 (L5): the minimum length comes from the generated slice's setting (config.min_query_len), never a typed 3; the input description is a
// template filled with it. Dated 2026-11-25 (task-465, RR-0495; prior text kept as text: "the prompt and the input description"): the prompt is dropped.
const MIN = String((JSON.parse(fs.readFileSync(path.join(ROOT, 'mobile/src/generated/surfaces/mobile_parcel_search.json'), 'utf8')) as Json).config.min_query_len);
const HINT = (C['search.input.hint'] as string).replace('{min}', MIN);

// Console errors a library prints during a server render that are not defects of the binding. Empty today: any entry needs a comment naming why.
const CONSOLE_ALLOW: RegExp[] = [];
// jsdom has no matchMedia or ResizeObserver; the Mantine provider reads them on mount (the render-smoke.logic.test.ts stubs, verbatim).
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', { writable: true, value: (q: string) => ({ matches: false, media: q, onchange: null, addListener: () => undefined, removeListener: () => undefined, addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => false }) });
  if (!('ResizeObserver' in globalThis)) Object.defineProperty(globalThis, 'ResizeObserver', { writable: true, value: class { observe(): void { /* jsdom stub */ } unobserve(): void { /* jsdom stub */ } disconnect(): void { /* jsdom stub */ } } });
});
let errors: string[] = [];
beforeEach(() => {
  errors = [];
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { const m = a.map(String).join(' '); if (!CONSOLE_ALLOW.some((r) => r.test(m))) errors.push(m); });
});
afterEach(() => { vi.restoreAllMocks(); cleanup(); });

/** Every display string a tree names: content texts, template texts filled from the data. */
const textsOf = (n: unknown, s: WebSituation): string[] => {
  if (Array.isArray(n)) return n.flatMap((x) => textsOf(x, s));
  if (n === null || typeof n !== 'object') return [];
  const o = n as Json;
  if (Object.keys(o).length === 1 && typeof o.content === 'string') return [C[o.content] as string];
  if ('text' in o && 'vars' in o) return [];
  return Object.entries(o).filter(([k]) => k !== 'ariaLabel' && k !== 'ariaDescription' && k !== 'placeholder').flatMap(([, v]) => textsOf(v, s));
};

describe('(a) every web golden renders with its situation', () => {
  // Dated 2026-11-25 (task-465; prior title kept: "11 goldens: ..."): 12, the typing state's golden suggest.
  it('12 goldens: equal to searchWebTree(situation), rendered, every content string present, no raw ref, no console error', () => {
    expect(GOLDENS).toHaveLength(12); // SRCH.A6 (task-320, dated 2026-11-19): 10 -> 11, the new state reports_left; task-465: 12, suggest
    for (const g of GOLDENS) {
      const s = SITUATIONS[g.situation] as WebSituation;
      expect(searchWebTree(s)).toEqual(g.props);
      const html = decode(renderToStaticMarkup(provided(h(SearchBinding, { tree: g.props as WebNode, content: C, data: searchWebData(s) }))));
      for (const t of textsOf(g.props, s)) expect([g.state, html.includes(t)], t).toEqual([g.state, true]);
      expect(html).not.toMatch(/\{"(content|contract|derived)"/);
      expect(html.indexOf(C['search.legal'] as string)).toBeGreaterThan(-1);
    }
    expect(errors).toEqual([]);
  });
  // Dated 2026-11-25 (task-465; prior title kept: "templates are filled: the 429 seconds, the candidate count and a chip label"): the count badge is
  // gone; the miss line is the new template.
  it('templates are filled: the 429 seconds, the miss line and a chip label', () => {
    const rl = decode(renderToStaticMarkup(provided(bind(SITUATIONS.rate_limited as WebSituation))));
    expect(rl).toContain((C['search.ratelimit'] as string).replace('{seconds}', String((SITUATIONS.rate_limited as WebSituation).errors.retryAfterSeconds)));
    const miss = SITUATIONS.miss as WebSituation;
    expect(decode(renderToStaticMarkup(provided(bind(miss))))).toContain((C['search.miss'] as string).replace('{query}', miss.input));
    const st = SITUATIONS.static as WebSituation;
    expect(decode(renderToStaticMarkup(provided(bind(st))))).toContain(`aria-label="${(C['search.chip.label'] as string).replace('{query}', st.recent[0] as string)}"`);
    // task-450 AC4 (L5): the input description carries the setting's value, no "{min}" left and no typed 3 in the content (task-465: the prompt is dropped).
    expect([C['search.input.hint']].every((t) => (t as string).includes('{min}') && !(t as string).includes('3'))).toBe(true);
    expect(C).not.toHaveProperty('search.prompt');
    const idle = decode(renderToStaticMarkup(provided(bind(WEB_STATIC_SITUATION))));
    expect(idle).toContain(`aria-description="${HINT}"`);
    expect(idle).not.toContain('{min}');
    expect(errors).toEqual([]);
  });
  // Dated 2026-11-25 (task-465 O14, RR-0495; prior title kept: "the mount situations: idle (prompt, no chips), unauthorized (entitlement notice, no prompt), ...").
  it('the mount situations: idle (no prompt line, no chips), unauthorized (entitlement notice), error (notice with Retry)', () => {
    const idle = decode(renderToStaticMarkup(provided(bind(WEB_STATIC_SITUATION))));
    expect([idle.includes('parcel-search-prompt'), idle.includes('parcel-search-suggestion'), idle.includes('parcel-search-drop')]).toEqual([false, false, false]);
    const no = decode(renderToStaticMarkup(provided(bind(WEB_UNAUTHORIZED_SITUATION))));
    expect([no.includes(C['search.entitlement'] as string), no.includes('parcel-search-prompt')]).toEqual([true, false]);
    const err = decode(renderToStaticMarkup(provided(bind(WEB_ERROR_SITUATION))));
    expect([err.includes(C['search.error'] as string), err.includes(C['search.retry.text'] as string)]).toEqual([true, true]);
    expect({ ...WEB_STATIC_SITUATION, recent: [] }).toEqual({ ...(SITUATIONS.static as WebSituation), recent: [] });
    expect(errors).toEqual([]);
  });
});

describe('(b) the live switch off: every control disabled', () => {
  it('the input and every button are disabled with runtime.disabled, even with every callback supplied', () => {
    const all = { change_input: vi.fn(), set_input: vi.fn(), retry: vi.fn(), select: vi.fn(), push: vi.fn() };
    // Dated 2026-11-25 (task-465, third addendum; prior lines kept as text: the ambiguous state's radio cards and SELECT were the buttons): the rows
    // are real links now (a route, like the footer links: the live switch does not disable a link), so the buttons are the static page's chips.
    render(provided(bind(SITUATIONS.static as WebSituation, { actions: all, runtime: { disabled: true } })));
    expect((screen.getByTestId('parcel-search-input') as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(3);
    for (const b of buttons) expect((b as HTMLButtonElement).disabled).toBe(true);
  });
  it('a button whose action has no callback is disabled (no dead control)', () => {
    render(provided(bind(SITUATIONS.static as WebSituation))); // task-465: no callbacks given; the static page recent chips are the buttons (the ambiguous page has only link rows)
    expect(screen.queryByTestId('parcel-search-account')).toBeNull();
    const btns = screen.queryAllByRole('button'); expect(btns.length).toBeGreaterThanOrEqual(3); for (const b of btns) expect((b as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('(c) actions reach the mount', () => {
  // Dated 2026-11-25 (task-465; prior title kept: "a chip sets the input; a card selects; SELECT pushes the web route of the checked lot").
  // task-465 third addendum (NAV-6): a lot row is a real link to the web route of its lot (Button component={Link} href), never an imperative push.
  it('a chip sets the input; a lot row is a link to the web route of its lot; a map-kind row has no web route; Enter in the field fires submit; no SELECT', () => {
    const set_input = vi.fn(); const push = vi.fn(); const submit = vi.fn();
    const st = SITUATIONS.static as WebSituation;
    render(provided(bind(st, { actions: { set_input } })));
    fireEvent.click(screen.getByTestId(`parcel-search-suggestion-${st.recent[0] as string}`));
    expect(set_input).toHaveBeenCalledWith(st.recent[0]);
    cleanup();
    const amb = SITUATIONS.ambiguous as WebSituation;
    const first = amb.rows[0] as { parcelId: string };
    render(provided(bind(amb, { actions: { push, submit } })));
    const row = screen.getByTestId(`parcel-candidate-${first.parcelId}`) as HTMLAnchorElement;
    expect([row.tagName, row.getAttribute('href')]).toEqual(['A', `/parcel-tool/${encodeURIComponent(first.parcelId)}`]);
    expect(screen.queryByTestId('parcel-search-select')).toBeNull();
    const map = searchWebTree(SITUATIONS.navigating_multi_parcel as WebSituation);
    const nodes = (n: Json): Json[] => [n, ...((n.children ?? []) as Json[]).filter((c) => c && typeof c === 'object' && 'component' in c).flatMap(nodes)];
    const mapRow = nodes(map as unknown as Json).find((n) => n.props?.testID === 'parcel-candidate-100026') as Json;
    expect([mapRow.props.href, mapRow.props.onClick]).toEqual([undefined, null]); // no web route: no link, no handler (S-7)
    expect(JSON.stringify(map)).not.toContain('disambiguate');
    fireEvent.keyDown(screen.getByTestId('parcel-search-input'), { key: 'Enter' });
    expect(submit).toHaveBeenCalledTimes(1);
  });  // MF-46 follow-up (P35-D18 a, dated 2026-11-12): "Report incorrect address match" is a real link to Help & Support, the query in the fragment.
  // Dated 2026-11-24 (task-450 AC6, B.7 doc-2:49; prior title kept: "...with topic address_match..."): the topic is wrong-lot ("Wrong address or lot").
  it('the report link opens /help with topic wrong-lot and the encoded input in the fragment', () => {
    const amb = { ...(SITUATIONS.ambiguous as WebSituation), input: 'Queen & Spadina #2' };
    render(provided(bind(amb)));
    const a = screen.getByTestId('parcel-search-report') as HTMLAnchorElement;
    expect([a.tagName, a.getAttribute('href'), a.textContent]).toEqual(['A', `/help#topic=wrong-lot&q=${encodeURIComponent('Queen & Spadina #2')}`, C['list.report']]);
  });
  it('task-450 AC6: the search link topic is a mailto topic of web_help in static-page.json', () => {
    const table = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/surfaces/_schema/static-page.json'), 'utf8')) as Json;
    const topics = (table.pages.web_help.static.sections as Json[]).flatMap((sec) => (sec.parts ?? []) as Json[]).filter((p) => p.role === 'mailto').map((p) => p.topic);
    render(provided(bind(SITUATIONS.ambiguous as WebSituation)));
    const href = (screen.getByTestId('parcel-search-report') as HTMLAnchorElement).getAttribute('href') as string;
    const topic = /#topic=([^&]+)/.exec(href)?.[1];
    expect(topics).toContain(topic);
    expect(topic).toBe('wrong-lot');
  });
});

describe('(d) RED: gaps are loud', () => {
  const s = WEB_STATIC_SITUATION;
  it('an unknown component throws', () => {
    const tree = { component: 'Card', props: { key: 'x' }, children: [] };
    expect(() => renderToStaticMarkup(provided(h(SearchBinding, { tree, content: C, data: searchWebData(s) })))).toThrow('SearchBinding: unmapped component "Card"');
  });
  it('a missing content key throws', () => {
    const { ['search.legal']: _gone, ...rest } = C; // eslint-disable-line @typescript-eslint/no-unused-vars -- the key is removed on purpose
    expect(() => renderToStaticMarkup(provided(h(SearchBinding, { tree: searchWebTree(s), content: rest, data: searchWebData(s) })))).toThrow('unknown content key "search.legal"');
  });
  it('an unresolved ref and an unknown action throw', () => {
    const ref = { component: 'Text', props: { key: 'x' }, children: [{ derived: 'nope' }] };
    expect(() => renderToStaticMarkup(provided(h(SearchBinding, { tree: ref, content: C, data: searchWebData(s) })))).toThrow('unresolved ref');
    const act = { component: 'Button', props: { key: 'x', size: 'lg', onClick: { action: 'delete_everything' } }, children: [] };
    expect(() => renderToStaticMarkup(provided(h(SearchBinding, { tree: act, content: C, data: searchWebData(s) })))).toThrow('unknown action "delete_everything"');
  });
});

// SRCH.A6 (task-320; RR-0307): the reports-left line, executed through the real web binding (the root run executes this; the mobile tree is
// executed by search-golden-capture.ts --check, and the mobile jest cases are not run by the hook: UNVERIFIED).
describe("(e) the reports-left line renders the v8 copy from the served fields only", () => {
  it("the new state shows exactly \"6 of 10 reports left until 9 Dec 2026\" with no placeholder left, and an undrawn state shows no such line", () => {
    const s = SITUATIONS.reports_left as WebSituation;
    const { container } = render(provided(bind(s)));
    const line = container.querySelector("[data-testid=parcel-search-reports-left], #parcel-search-reports-left");
    expect(line?.textContent).toBe("6 of 10 reports left until 9 Dec 2026");
    expect(line?.textContent).not.toContain("{");
    // RR-0310 (task-351): the date is the served Toronto label, the same string the mobile situation carries; no instant reaches the binding
    expect((searchWebData(s) as { contract: Record<string, unknown> }).contract.contract_parcels_entitlement).toEqual({ reportsLeft: 6, reportsLimit: 10, resetsOnDisplay: "9 Dec 2026" });
    cleanup();
    const none = render(provided(bind(SITUATIONS.static as WebSituation)));
    expect(none.container.textContent).not.toContain("reports left");
  });
});
