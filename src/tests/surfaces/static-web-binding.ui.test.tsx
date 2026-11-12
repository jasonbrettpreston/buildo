// @vitest-environment jsdom
// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §11b.5 (the first web consumer of STATIC: one planted-defect case and one render
//            smoke), §11b.2 (every declared state maps to a library state component), §0b item 11 (navigation is a route),
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-33 (every displayed string from content), FE-31, FE-34 (closed kinds and
//            roles; a number throws), docs/specs/02-web-admin/33_web_admin_engineering_protocol.md section 9 (44 px).
//
// MF-46 stage C · the web STATIC render smoke (plan ~/Buildo-scratch/mcfrontend/MF-46/plan.md v3 §12 fold 13; operator D-2 (a) 2026-11-11). Cases:
//   (a) every committed STATIC web golden equals a fresh staticWebTree of its page and renders through the one provider (dark, as the parcel-tool
//       layout): no throw, no console error, every content string it names present, no raw ref left, the footer links are real <a href> routes;
//   (b) the error state's Try again runs the mount's retry (the boundary reset); with no retry given the button is disabled;
//   (c) RED: an unknown component, a missing content key, a number as content, an unknown section kind, a role outside its kind, a link with no
//       or an off-origin href, and an unknown action each throw.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createElement as h, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AdminMantineProvider } from '../../components/surfaces/web/AdminMantineProvider';
import { StaticBinding, staticWebTree, type StaticNode, type StaticPage } from '../../components/surfaces/web/StaticBinding';
import { STATIC_CONTENT, staticPage } from '../../lib/surfaces/maxbld-static';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- golden JSON
const ROOT = process.cwd();
const GROOT = path.join(ROOT, 'src/tests/fixtures/surfaces');
// MF-76 (dated 2026-11-11): the landing's goldens need its server values and report views; they are rendered by src/tests/surfaces/web-landing.ui.test.tsx
// (the same render smoke, FE-33, with a fixture of the declared reads), so this file keeps the plain pages.
const IDS = Object.keys(STATIC_CONTENT).filter((id) => id !== 'web_landing');
const GOLDENS: Json[] = IDS.flatMap((id) => fs.readdirSync(path.join(GROOT, id)).filter((f) => f.endsWith('.web.json')).sort()
  .map((f) => JSON.parse(fs.readFileSync(path.join(GROOT, id, f), 'utf8')) as Json));
const provided = (el: ReactElement): ReactElement => h(AdminMantineProvider, { scheme: 'dark', children: el });
const decode = (s: string): string => s.replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const ssr = (tree: StaticNode, content: Record<string, string>, extra: Json = {}): string => decode(renderToStaticMarkup(provided(h(StaticBinding, { tree, content, ...extra }))));
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

// Console errors a library prints during a render that are not defects of the binding. Empty today: any entry needs a comment naming why.
const CONSOLE_ALLOW: RegExp[] = [];
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

const refsOf = (n: unknown): string[] => {
  if (Array.isArray(n)) return n.flatMap(refsOf);
  if (n === null || typeof n !== 'object') return [];
  const o = n as Json;
  if (Object.keys(o).length === 1 && typeof o.content === 'string') return [o.content];
  return Object.values(o).flatMap(refsOf);
};

describe('(a) every STATIC web golden renders', () => {
  it('5 goldens (help, terms, privacy static; the error page error and miss): equal to a fresh tree, rendered, every string present, no raw ref, no console error', () => {
    expect(GOLDENS.map((g) => `${g.surface}/${g.state}`)).toEqual(['web_help/static', 'web_terms/static', 'web_privacy/static', 'web_maxbld_error/error', 'web_maxbld_error/miss']);
    for (const g of GOLDENS) {
      const { page, content } = staticPage(g.surface, g.state);
      expect(staticWebTree(page)).toEqual(g.props);
      const html = ssr(g.props as StaticNode, content, { actions: { retry: () => undefined } });
      for (const k of refsOf(g.props)) expect([g.surface, k, html.includes(content[k] as string)]).toEqual([g.surface, k, true]);
      expect(html).not.toMatch(/\{"content"/);
      for (const href of ['/terms', '/privacy', '/help']) expect([g.surface, href, html.includes(`href="${href}"`)]).toEqual([g.surface, href, true]);
      expect(html).toMatch(/<main[^>]*data-testid="static-page"/);
      expect(html).toMatch(/<footer[^>]*data-testid="static-footer"/);
    }
    expect(errors).toEqual([]);
  });
  it('a page has one h1 (the title) and its section headings are h2', () => {
    const { page, content } = staticPage('web_terms', 'static');
    const html = ssr(staticWebTree(page), content);
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect((html.match(/<h2\b/g) ?? []).length).toBeGreaterThan(1);
    expect(html).toMatch(/<ul\b/);
  });
});

describe('(b) the one action', () => {
  it('Try again runs the mount retry; without a retry the button is disabled', () => {
    const { page, content } = staticPage('web_maxbld_error', 'error');
    const retry = vi.fn();
    render(provided(h(StaticBinding, { tree: staticWebTree(page), content, actions: { retry } })));
    fireEvent.click(screen.getByTestId('static-retry'));
    expect(retry).toHaveBeenCalledTimes(1);
    cleanup();
    render(provided(h(StaticBinding, { tree: staticWebTree(page), content })));
    expect((screen.getByTestId('static-retry') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('(c) RED: planted defects throw', () => {
  const base = (): { page: StaticPage; content: Record<string, string> } => clone(staticPage('web_help', 'static'));
  it('an unknown component and an unknown action throw at render', () => {
    const { page, content } = base();
    const tree = staticWebTree(page);
    const bad = clone(tree);
    (bad.children[0] as StaticNode).component = 'Card';
    expect(() => ssr(bad, content)).toThrow('StaticBinding: unmapped component "Card"');
    const act = staticWebTree(clone(staticPage('web_maxbld_error', 'error')).page);
    const prose = (act.children[0] as StaticNode).children[0] as StaticNode;
    (prose.children[2] as StaticNode).props.onClick = { action: 'push', route: '/x' };
    expect(() => ssr(act, STATIC_CONTENT.web_maxbld_error as Record<string, string>)).toThrow('StaticBinding: unknown action');
  });
  it('a missing content key and a number as a content value throw at render (FE-05: a number is never shown)', () => {
    const { page, content } = base();
    const tree = staticWebTree(page);
    const missing = { ...content };
    delete missing['help.intro'];
    expect(() => ssr(tree, missing)).toThrow('StaticBinding: unknown content key "help.intro"');
    expect(() => ssr(tree, { ...content, 'help.intro': 9.99 as unknown as string })).toThrow('StaticBinding: content "help.intro" is not a string');
  });
  it('a number as a part content, an unknown kind, a role outside its kind, a link with no href or an off-origin href throw in the tree', () => {
    const plant = (f: (p: Json) => void): (() => StaticNode) => { const { page } = base(); f(page as unknown as Json); return () => staticWebTree(page); };
    expect(plant((p) => { p.sections[0].parts[1].content = 9.99; })).toThrow('is not a content key');
    // MF-76 (dated 2026-11-11): hero is a landing kind now; the planted unknown kind is one no row has added.
    expect(plant((p) => { p.sections[0].kind = 'banner'; })).toThrow('unknown section kind "banner"');
    expect(plant((p) => { p.sections[0].parts[1].role = 'link'; p.sections[0].parts[1].href = '/help'; })).toThrow('role "link" is not a prose role');
    expect(plant((p) => { delete p.sections[1].parts[0].href; })).toThrow('href undefined is not allowed here');
    expect(plant((p) => { p.sections[1].parts[0].href = '//evil.com'; })).toThrow('href "//evil.com" is not allowed here');
    expect(plant((p) => { p.sections[1].parts[0].href = 'https://evil.com'; })).toThrow('is not allowed here');
    expect(plant((p) => { p.sections[0].parts[1].href = '/help'; })).toThrow('href "/help" is not allowed here');
    expect(plant((p) => { p.sections[0].extra = 1; })).toThrow('unknown key "extra"');
    expect(plant((p) => { p.sections = []; })).toThrow('at least one section');
  });
});
