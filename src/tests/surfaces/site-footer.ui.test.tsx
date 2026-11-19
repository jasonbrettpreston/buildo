// @vitest-environment jsdom
// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §11b.2 (one tree, a render per binding), §0b item 11 (navigation is a route),
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-18, FE-33.
//
// MF-91 (SRCH.FOOTER, task-332; operator, verbatim: "1. once  -approved", "this is a shared component") · the footer rendered by its three users:
//   (a) web search: a real <footer>, the legal sentence once in the whole markup, three real links, the copyright, in that order, live while the switch is off;
//   (b) static page: the same three links and texts in the same order;
//   (c) web report: G2 (pending) FIRST inside the same footer, then G3, the three links (G5), the copyright (G4) once; the mobile G4 part is not shown twice;
//   (d) cross-user equality: the three renders list the same hrefs and link texts in the same order;
//   RED: a footer text with a missing key throws a named error in the report.
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createElement as h, type ReactElement } from 'react';
import { cleanup, render } from '@testing-library/react';
import { AdminMantineProvider } from '../../components/surfaces/web/AdminMantineProvider';
import { SearchBinding, searchWebData, searchWebTree, type WebSituation } from '../../components/surfaces/web/SearchBinding';
import { StaticBinding, staticWebTree } from '../../components/surfaces/web/StaticBinding';
import { pickFooterText } from '../../components/surfaces/web/footerNode';
import { ReportPage } from '../../components/report/ReportPage';
import { pageViewOf, type PageView } from '../../lib/surfaces/report/core';
import { reportCtx } from '../../lib/surfaces/report/data';
import { SEARCH_CONTENT as C, WEB_STATIC_SITUATION } from '../../lib/surfaces/maxbld-web';
import { staticPage } from '../../lib/surfaces/maxbld-static';
import { PAGE_GOLDEN_DIR } from '../../../scripts/surfaces/report-page-capture';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- JSON under test
const ROOT = process.cwd();
const SITUATIONS: Record<string, WebSituation> = JSON.parse(fs.readFileSync(path.join(ROOT, 'mobile/__tests__/fixtures/parcelSearch.situations.json'), 'utf8'));
const provided = (el: ReactElement): ReactElement => h(AdminMantineProvider, { scheme: 'dark', children: el });
const view = (t: string): PageView => pageViewOf(JSON.parse(fs.readFileSync(path.join(ROOT, PAGE_GOLDEN_DIR, `v21.${t}.json`), 'utf8')).rendered_tree, { target: t }, reportCtx) as PageView;
const FOOTER = pickFooterText(C);
const HREFS = ['/terms', '/privacy', '/help'];
const TEXTS = [C['footer.terms'], C['footer.privacy'], C['footer.help']];
const linksOf = (el: Element): Array<[string | null, string | null]> => [...el.querySelectorAll('a')].map((a) => [a.getAttribute('href'), a.textContent]);

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', { writable: true, value: (q: string) => ({ matches: false, media: q, onchange: null, addListener: () => undefined, removeListener: () => undefined, addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => false }) });
  if (!('ResizeObserver' in globalThis)) Object.defineProperty(globalThis, 'ResizeObserver', { writable: true, value: class { observe(): void { /* jsdom stub */ } unobserve(): void { /* jsdom stub */ } disconnect(): void { /* jsdom stub */ } } });
});
afterEach(cleanup);

const mountSearch = (s: WebSituation, disabled = false) => render(provided(h(SearchBinding, { tree: searchWebTree(s), content: C, data: searchWebData(s), runtime: { disabled } })));
const mountStatic = () => { const { page, content } = staticPage('web_terms', 'static'); return render(provided(h(StaticBinding, { tree: staticWebTree(page), content }))); };

describe('(a) web search', () => {
  it('every state: one <footer>, the legal sentence once in the markup, links in order, copyright last, anchors live with the switch off', () => {
    for (const [name, s] of Object.entries(SITUATIONS).filter(([, v]) => Array.isArray((v as Json).recent))) {
      const { container } = mountSearch(s, true);
      const footers = container.querySelectorAll('footer');
      expect([name, footers.length]).toEqual([name, 1]);
      const f = footers[0] as HTMLElement;
      expect((container.innerHTML.match(new RegExp((C['search.legal'] as string).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length, name).toBe(1);
      expect(f.contains(container.querySelector('[data-testid="parcel-search-legal"]'))).toBe(true);
      expect(linksOf(f)).toEqual(HREFS.map((x, i) => [x, TEXTS[i]]));
      for (const a of f.querySelectorAll('a')) expect([a.hasAttribute('disabled'), a.getAttribute('aria-disabled'), a.getAttribute('data-disabled')]).toEqual([false, null, null]);
      expect([...f.children].map((c) => (c as HTMLElement).dataset.testid ?? c.tagName)).toEqual(['parcel-search-legal', 'DIV', 'parcel-search-copyright']);
      expect(f.lastElementChild?.textContent).toBe(C['footer.copyright']);
      cleanup();
    }
  });
});

describe('(b) static page', () => {
  it('the same three links and texts in the same order', () => {
    const { container } = mountStatic();
    const f = container.querySelector('footer[data-testid="static-footer"]') as HTMLElement;
    expect(linksOf(f)).toEqual(HREFS.map((x, i) => [x, TEXTS[i]]));
  });
});

describe('(c) web report', () => {
  const mount = (footer = FOOTER) => render(h(ReportPage, { view: view('web'), footer }));
  it('one footer holds G2 (pending) first, G3, the three links, the copyright once', () => {
    const { container } = mount();
    const footers = container.querySelectorAll('footer[data-section="footer"]');
    expect(footers.length).toBe(1);
    const f = footers[0] as HTMLElement;
    const sec = (view('web').sections as Json[]).find((s) => s.kind === 'footer') as Json;
    const g2 = sec.parts.find((p: Json) => p.brief === 'G2').text as string;
    const g3 = sec.parts.find((p: Json) => p.brief === 'G3').text as string;
    const text = f.textContent ?? '';
    expect([text.indexOf(g2) >= 0, text.indexOf(g2) < text.indexOf(g3), text.indexOf(g3) < text.indexOf(C['footer.terms'] as string), text.indexOf(C['footer.help'] as string) < text.indexOf(C['footer.copyright'] as string)]).toEqual([true, true, true, true]);
    expect(f.querySelector('[data-pending="true"]')?.textContent).toBe(g2);
    expect(linksOf(f)).toEqual(HREFS.map((x, i) => [x, TEXTS[i]]));
    expect((text.match(/© MaxBLD/g) ?? []).length).toBe(1);
    expect(f.querySelector('footer')).toBeNull();
  });
  it('RED: a footer text with a missing key throws a named error', () => {
    const { ['footer.help']: _gone, ...rest } = FOOTER; // eslint-disable-line @typescript-eslint/no-unused-vars -- removed on purpose
    expect(() => mount(rest as never)).toThrow('footer text: missing key "footer.help"');
  });
});

describe('(d) one footer, three users', () => {
  it('the link lists (href, text) are equal on the search, static and report renders', () => {
    const a = linksOf(mountSearch(WEB_STATIC_SITUATION).container.querySelector('footer') as Element);
    cleanup();
    const b = linksOf(mountStatic().container.querySelector('footer') as Element);
    cleanup();
    const c = linksOf(render(h(ReportPage, { view: view('web'), footer: FOOTER })).container.querySelector('footer') as Element);
    expect([a, b]).toEqual([c, c]);
  });
});
