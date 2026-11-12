// @vitest-environment jsdom
// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §11b.3 (web_landing, dated note 2026-11-11 MF-76), §11b.5 (render smoke),
//            §11b.1 (REPORT keeps the landed renderer), §0b item 11 (navigation is a route), docs/specs/02-web-admin/135_mcfrontend_decisions_register.md
//            FE-05, FE-07, FE-33 (every displayed string from content), FE-35, FE-36, FE-37.
//
// MF-76 · the landing render smoke (plan ~/Buildo-scratch/mcfrontend/MF-46/plan.md v3 §4 T5, T6, T7, T9 as folded by §12 folds 8, 9, 12, §13b).
// Cases:
//   (a) both committed web_landing goldens equal a fresh staticWebTree of their page and render through the one provider with the server values and
//       report views of the fixture (static: every read; degraded: no stored row): no throw, no console error, every content string present (a
//       template with its value filled), no raw ref; one h1, an h2 per section, an h3 per item and plan box; the footer and the disclaimer twice;
//   (b) every control outside the shared report page is an <a href> (no <button>); the demo's Skip and View report are links to /#sample, present
//       from the first paint, paced by the server (--skip, --ready); the sample region is a named, keyboard-reachable section#sample that fades in
//       at the server minimum; no element of the landing sets aria-live;
//   (c) the plans render with no price (MF-47's reader does not exist yet) and the four boxes; the step picture and the scene render nothing until
//       the server sends an image, and render the report Picture when it does;
//   (d) RED: a missing server value, a number as a value, a template without its value, a demo part without its view, a value on a plain text.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createElement as h, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AdminMantineProvider } from '../../components/surfaces/web/AdminMantineProvider';
import { StaticBinding, staticWebTree, type StaticNode, type StaticReport, type StaticValues } from '../../components/surfaces/web/StaticBinding';
import { readLanding } from '../../lib/surfaces/maxbld-landing';
import { STATIC_CONTENT, staticPage } from '../../lib/surfaces/maxbld-static';
import { fixtureDb } from './web-landing-fixture';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- golden JSON
const ROOT = process.cwd();
const GDIR = path.join(ROOT, 'src/tests/fixtures/surfaces/web_landing');
const golden = (state: string): Json => JSON.parse(fs.readFileSync(path.join(GDIR, `${state}.web.json`), 'utf8')) as Json;
const CONTENT = STATIC_CONTENT.web_landing as Record<string, string>;
const LEGAL = 'This is an estimate, not 100% accurate. Not legal advice. Confirm with a lot survey and the City.';
const provided = (el: ReactElement): ReactElement => h(AdminMantineProvider, { scheme: 'dark', children: el });
const decode = (s: string): string => s.replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const ssr = (tree: StaticNode, values: StaticValues, report: StaticReport): string =>
  decode(renderToStaticMarkup(provided(h(StaticBinding, { tree, content: CONTENT, values, report }))));
const IMAGE = { field: 'fixture', label: 'Picture', asset_id: 'a0000000-0000-4000-8000-000000000001', alt: 'Fixture illustration', caption: 'Illustration', src: '/fixture.png' };

const CONSOLE_ALLOW: RegExp[] = [];
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', { writable: true, value: (q: string) => ({ matches: false, media: q, onchange: null, addListener: () => undefined, removeListener: () => undefined, addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => false }) });
});
let errors: string[] = [];
beforeEach(() => {
  errors = [];
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { const m = a.map(String).join(' '); if (!CONSOLE_ALLOW.some((r) => r.test(m))) errors.push(m); });
});
afterEach(() => { vi.restoreAllMocks(); });

const refsOf = (n: unknown): string[] => {
  if (Array.isArray(n)) return n.flatMap(refsOf);
  if (n === null || typeof n !== 'object') return [];
  const o = n as Json;
  if (Object.keys(o).length === 1 && typeof o.content === 'string') return [o.content];
  return Object.values(o).flatMap(refsOf);
};
/** The landing html of one state, with the server values and views of the fixture (static: every read healthy; degraded: no stored row). */
const render = async (state: 'static' | 'degraded'): Promise<{ html: string; values: StaticValues }> => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const l = await readLanding(fixtureDb(state === 'static' ? 'ok' : 'no_row'));
  const g = golden(state);
  expect(staticWebTree(staticPage('web_landing', state).page)).toEqual(g.props);
  return { html: ssr(g.props as StaticNode, l.values, { ...l.report, picture: IMAGE, scene: IMAGE }), values: l.values };
};

/** The html with the shared ReportPage (the balanced <div data-report-page ...> element) removed: the landing outside the embedded sample. */
const withoutReportPage = (html: string): string => {
  const start = html.indexOf("<div data-report-page");
  if (start < 0) return html;
  let depth = 0;
  const re = /<div\b|<\/div>/g;
  re.lastIndex = start;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[0] === "</div>" ? -1 : 1;
    if (depth === 0) return html.slice(0, start) + html.slice(m.index + 6);
  }
  return html;
};

describe('(a) the two goldens render (FE-33)', () => {
  it.each(['static', 'degraded'] as const)('%s: every string present (templates filled), no raw ref, one h1, h2 per section, h3 per item and box', async (state) => {
    const { html, values } = await render(state);
    for (const k of refsOf(golden(state).props)) {
      const t = CONTENT[k] as string;
      for (const piece of t.split('{value}')) expect([k, html.includes(piece)]).toEqual([k, true]);
    }
    expect(html).not.toMatch(/\{"content"|\{"derived"|\{value\}/);
    // One h1 for the landing; the embedded sample report keeps its own title h1 inside its named region (the shared ReportPage, never re-drawn).
    const page = withoutReportPage(html);
    expect(page.match(/<h1\b/g)).toHaveLength(1);
    expect(html.match(/<h1\b/g)).toHaveLength(2);
    expect(html.match(/<h1[^>]*>Show your clients what’s <span[^>]*>possible!<\/span><\/h1>/)).not.toBeNull();
    expect((html.match(/<h2\b[^>]*class="[^"]*text-3xl/g) ?? []).length).toBe(4); // uses, trust, how, pricing (the report's own h2s are inside the sample)
    expect(html).toContain(`Costed MaxBLD scenarios for the specific lot you enter: ${values.scenario_list}.`);
    expect(html.split(LEGAL).length - 1).toBe(2 + 1); // the hero, the footer, and the report's own legal line inside the sample
    expect(errors).toEqual([]);
    if (state === 'static') for (const k of ['lots', 'regulations', 'buildings', 'builds', 'map_areas']) expect(html).toContain(values[`checked.citywide.${k}`] as string);
    else expect(html).not.toContain('data-testid="landing-checked-lots"');
  });
});

describe('(b) controls, the demo and the sample region', () => {
  it('every control outside the shared report page is a link; Skip and View report lead to /#sample from the first paint; no aria-live on the landing', async () => {
    const { html } = await render('static');
    const outside = withoutReportPage(html);
    expect(outside).not.toMatch(/<button\b/);
    expect(html).toMatch(/<a [^>]*href="\/#sample"[^>]*data-block="checked-skip"[^>]*style="--skip:0ms;--ready:\d+ms"/);
    expect(html).toMatch(/<a [^>]*href="\/#sample"[^>]*data-block="checked-open"/);
    expect(html).toMatch(/data-paced="true"/);
    expect(html).not.toMatch(/aria-live=/);
    const hrefs = [...new Set([...outside.matchAll(/<a [^>]*href="([^"]+)"/g)].map((m) => m[1]))].sort();
    expect(hrefs).toEqual(['/', '/#how', '/#pricing', '/#sample', '/help', '/help#topic=enterprise', '/login', '/privacy', '/signup', '/signup?plan=basic', '/signup?plan=pro', '/terms']);
  });
  it('the sample region is a named, keyboard-reachable section#sample that fades in at the server minimum; its caption follows', async () => {
    const { html } = await render('static');
    expect(html).toMatch(/<section[^>]*id="sample"[^>]*tabindex="0"[^>]*aria-label="Sample report, made-up address, illustrative figures"|<section[^>]*aria-label="Sample report, made-up address, illustrative figures"[^>]*id="sample"[^>]*tabindex="0"/);
    expect(html).toMatch(/--reveal:23000ms"[^>]*id="sample"/);
    expect(html).toMatch(/class="[^"]*landing-sample/);
    expect(html.indexOf('Sample report. Address and figures are illustrative.')).toBeGreaterThan(html.indexOf('id="sample"'));
    expect(html).toContain('The Building Possibilities Report for 24 Sample Avenue is ready.');
  });
  it('degraded: no demo, so the sample shows with no reveal delay', async () => {
    const { html } = await render('degraded');
    expect(html).not.toMatch(/data-block="checked"/);
    expect(html).not.toMatch(/--reveal/);
    expect(html).toMatch(/id="sample"/);
  });
});

describe('(c) plans without prices; pictures only when the server sends one', () => {
  it('four boxes, no price, no "/ month", the declared plan links', async () => {
    const { html } = await render('static');
    expect(html.match(/data-testid="landing-plan-/g)).toHaveLength(4);
    expect(html).not.toMatch(/\$|\/ month|CAD, plus HST|data-testid="landing-price"/);
    for (const t of ['Free trial', 'Basic', 'Pro', 'Enterprise', 'Call for a quote', 'Up to 25 reports a month']) expect(html).toContain(t);
  });
  it('the step picture and the scene are the report Picture when an image is sent, and absent from the page when not', async () => {
    const { html } = await render('static');
    expect(html.match(/data-block="image"/g)).toHaveLength(2);
    const l = await readLanding(fixtureDb('ok'));
    expect(l.page.sections.flatMap((s) => s.parts).filter((p) => p.role === 'picture' || p.role === 'scene')).toEqual([]);
    expect(() => ssr(staticWebTree(l.page), l.values, l.report)).not.toThrow();
  });
});

describe('(d) RED: planted faults throw (the server leaves a failed part out; the binding never skips one)', () => {
  const base = async (): Promise<{ tree: StaticNode; values: StaticValues; report: StaticReport }> => {
    const l = await readLanding(fixtureDb('ok'));
    return { tree: staticWebTree(staticPage('web_landing', 'static').page), values: l.values, report: { ...l.report, picture: IMAGE, scene: IMAGE } };
  };
  it('a missing value, a number as a value, a demo without its view, a template without its value', async () => {
    const { tree, values, report } = await base();
    const { trial_reports: _drop, ...missing } = values; // eslint-disable-line @typescript-eslint/no-unused-vars
    expect(() => ssr(tree, missing, report)).toThrow('StaticBinding: no server value "trial_reports"');
    expect(() => ssr(tree, { ...values, scenarios: 6 as unknown as string }, report)).toThrow('no server value "scenarios"');
    const { demo: _demo, ...noDemo } = report; // eslint-disable-line @typescript-eslint/no-unused-vars
    expect(() => ssr(tree, values, noDemo)).toThrow('no demo view');
    const bare = JSON.parse(JSON.stringify(tree).replace(/,"value":\{"derived":"cost_sources"\}/, '')) as StaticNode;
    expect(() => ssr(bare, values, report)).toThrow('a {value} template without its value');
    const extra = JSON.parse(JSON.stringify(tree).replace('"className":"text-sm font-semibold uppercase tracking-[.12em] text-amber-400"', '"className":"x","value":{"derived":"scenarios"}')) as StaticNode;
    expect(() => ssr(extra, values, report)).toThrow('a value fills a template with exactly one {value} slot');
  });
});
