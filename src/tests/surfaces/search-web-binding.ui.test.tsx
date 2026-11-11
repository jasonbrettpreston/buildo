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
  it('10 goldens: equal to searchWebTree(situation), rendered, every content string present, no raw ref, no console error', () => {
    expect(GOLDENS).toHaveLength(10);
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
  it('templates are filled: the 429 seconds, the candidate count and a chip label', () => {
    const rl = decode(renderToStaticMarkup(provided(bind(SITUATIONS.rate_limited as WebSituation))));
    expect(rl).toContain((C['search.ratelimit'] as string).replace('{seconds}', String((SITUATIONS.rate_limited as WebSituation).errors.retryAfterSeconds)));
    const amb = SITUATIONS.ambiguous as WebSituation;
    expect(decode(renderToStaticMarkup(provided(bind(amb))))).toContain((C['list.badge'] as string).replace('{count}', String(amb.candidates.length)));
    const st = SITUATIONS.static as WebSituation;
    expect(decode(renderToStaticMarkup(provided(bind(st))))).toContain(`aria-label="${(C['search.chip.label'] as string).replace('{query}', st.recent[0] as string)}"`);
    expect(errors).toEqual([]);
  });
  it('the mount situations: idle (prompt, no chips), unauthorized (entitlement notice, no prompt), error (notice with Retry)', () => {
    const idle = decode(renderToStaticMarkup(provided(bind(WEB_STATIC_SITUATION))));
    expect([idle.includes(C['search.prompt'] as string), idle.includes('parcel-search-suggestion')]).toEqual([true, false]);
    const no = decode(renderToStaticMarkup(provided(bind(WEB_UNAUTHORIZED_SITUATION))));
    expect([no.includes(C['search.entitlement'] as string), no.includes(C['search.prompt'] as string)]).toEqual([true, false]);
    const err = decode(renderToStaticMarkup(provided(bind(WEB_ERROR_SITUATION))));
    expect([err.includes(C['search.error'] as string), err.includes(C['search.retry.text'] as string)]).toEqual([true, true]);
    expect({ ...WEB_STATIC_SITUATION, recent: [] }).toEqual({ ...(SITUATIONS.static as WebSituation), recent: [] });
    expect(errors).toEqual([]);
  });
});

describe('(b) the live switch off: every control disabled', () => {
  it('the input and every button are disabled with runtime.disabled, even with every callback supplied', () => {
    const all = { change_input: vi.fn(), set_input: vi.fn(), retry: vi.fn(), select: vi.fn(), push: vi.fn(), open_account: vi.fn() };
    render(provided(bind(SITUATIONS.ambiguous as WebSituation, { actions: all, runtime: { disabled: true } })));
    expect((screen.getByTestId('parcel-search-input') as HTMLInputElement).disabled).toBe(true);
    const buttons = screen.getAllByRole('button').concat(screen.getAllByRole('radio'));
    expect(buttons.length).toBeGreaterThan(3);
    for (const b of buttons) expect((b as HTMLButtonElement).disabled).toBe(true);
  });
  it('a button whose action has no callback is disabled (no dead control)', () => {
    render(provided(bind(WEB_STATIC_SITUATION)));
    expect((screen.getByTestId('parcel-search-account') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('(c) actions reach the mount', () => {
  it('a chip sets the input; a card selects; SELECT pushes the web route of the checked lot', () => {
    const set_input = vi.fn(); const select = vi.fn(); const push = vi.fn();
    const st = SITUATIONS.static as WebSituation;
    render(provided(bind(st, { actions: { set_input } })));
    fireEvent.click(screen.getByTestId(`parcel-search-suggestion-${st.recent[0] as string}`));
    expect(set_input).toHaveBeenCalledWith(st.recent[0]);
    cleanup();
    const amb = SITUATIONS.ambiguous as WebSituation;
    const first = amb.candidates[0] as { parcelId: string };
    render(provided(bind({ ...amb, selectedParcelId: first.parcelId }, { actions: { select, push } })));
    fireEvent.click(screen.getByTestId(`parcel-candidate-${first.parcelId}`));
    expect(select).toHaveBeenCalledWith(first.parcelId);
    fireEvent.click(screen.getByTestId('parcel-search-select'));
    expect(push).toHaveBeenCalledWith(`/parcel-tool/${encodeURIComponent(first.parcelId)}`);
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
