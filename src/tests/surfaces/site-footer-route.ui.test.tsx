// @vitest-environment jsdom
// SPEC LINK: docs/specs/02-web-admin/136_mcfrontend_handbook.md fe.36 (navigation is a route: web <Link>),
//            docs/specs/00_engineering_standards.md section 1.1 (a link has a 44 px tappable area),
//            docs/specs/02-web-admin/126_maxbld_surface_standard.md section 11b.2 (one footer tree, a render per binding).
//
// task-374 (FIX.FOOTER, defects D7 and D8 of the BL-GROUND handbook pass; operator 2026-11-20: "essential we have a non compliance build again - the entire
// reason for this approach") · the web report footer's three links (Terms, Privacy, Help):
//   D7 each is a next/link (the platform router), as the search and static footers already are, not a plain anchor that reloads the page;
//   D8 each is drawn at the 44 px the approved mock draws (report-themes/pub/B.html:222, "min-height:44px", inline-flex, items centred): min-h-11 and items-center.
// next/link is replaced by a marker anchor so a render shows WHICH links went through the router; the search footer is the control.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createElement as h, type ReactNode } from 'react';
import { cleanup, render } from '@testing-library/react';

vi.mock('next/link', () => ({
  default: ({ href, children, ...p }: { href: string; children: ReactNode }) => h('a', { href, 'data-next-link': 'true', ...p }, children),
}));

import { AdminMantineProvider } from '../../components/surfaces/web/AdminMantineProvider';
import { SearchBinding, searchWebData, searchWebTree, type WebSituation } from '../../components/surfaces/web/SearchBinding';
import { pickFooterText } from '../../components/surfaces/web/footerNode';
import { ReportPage } from '../../components/report/ReportPage';
import { pageViewOf, type PageView } from '../../lib/surfaces/report/core';
import { reportCtx } from '../../lib/surfaces/report/data';
import { SEARCH_CONTENT as C, WEB_STATIC_SITUATION } from '../../lib/surfaces/maxbld-web';
import { PAGE_GOLDEN_DIR } from '../../../scripts/surfaces/report-page-capture';

const ROOT = process.cwd();
const view = (t: string): PageView => pageViewOf(JSON.parse(fs.readFileSync(path.join(ROOT, PAGE_GOLDEN_DIR, `v21.${t}.json`), 'utf8')).rendered_tree, { target: t }, reportCtx) as PageView;
const FOOTER = pickFooterText(C);
const HREFS = ['/terms', '/privacy', '/help'];
const reportLinks = (): HTMLAnchorElement[] => {
  const { container } = render(h(ReportPage, { view: view('web'), footer: FOOTER }));
  return [...(container.querySelector('footer[data-section="footer"]') as HTMLElement).querySelectorAll('a')];
};
const classesOf = (a: Element): string[] => (a.getAttribute('class') ?? '').split(/\s+/);

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', { writable: true, value: (q: string) => ({ matches: false, media: q, onchange: null, addListener: () => undefined, removeListener: () => undefined, addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => false }) });
  if (!('ResizeObserver' in globalThis)) Object.defineProperty(globalThis, 'ResizeObserver', { writable: true, value: class { observe(): void { /* jsdom stub */ } unobserve(): void { /* jsdom stub */ } disconnect(): void { /* jsdom stub */ } } });
});
afterEach(cleanup);

describe('D7 the report footer links are route links', () => {
  it('each of the three links goes through next/link and keeps its href', () => {
    const links = reportLinks();
    expect(links.map((a) => [a.getAttribute('href'), a.getAttribute('data-next-link')])).toEqual(HREFS.map((x) => [x, 'true']));
  });
  it('control: the search footer links go through next/link (the render path the report now shares)', () => {
    const s = WEB_STATIC_SITUATION as WebSituation;
    const { container } = render(h(AdminMantineProvider, { scheme: 'dark', children: h(SearchBinding, { tree: searchWebTree(s), content: C, data: searchWebData(s), runtime: { disabled: false } }) }));
    const links = [...(container.querySelector('footer') as HTMLElement).querySelectorAll('a')];
    expect(links.map((a) => [a.getAttribute('href'), a.getAttribute('data-next-link')])).toEqual(HREFS.map((x) => [x, 'true']));
  });
});

describe('D8 the report footer links are drawn at the 44 px target', () => {
  it('each link class carries min-h-11 and min-w-11 (44 x 44 px, standards 1.1), inline-flex, items-center and justify-center', () => {
    const links = reportLinks();
    expect(links).toHaveLength(HREFS.length);
    for (const a of links) {
      const cls = classesOf(a);
      expect([a.getAttribute('href'), cls.includes('min-h-11'), cls.includes('min-w-11'), cls.includes('items-center'), cls.includes('justify-center'), cls.includes('inline-flex')]).toEqual([a.getAttribute('href'), true, true, true, true, true]);
    }
  });
  it('the links keep their other classes (colour, underline, focus ring): nothing else moves', () => {
    for (const a of reportLinks()) {
      const cls = classesOf(a);
      expect([cls.includes('text-report-soft'), cls.includes('underline'), cls.includes('focus-visible:outline-report-amber')]).toEqual([true, true, true]);
    }
  });
});
