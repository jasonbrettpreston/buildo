// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11b.2 dated note 2026-11-11 (MF-48: the part ref resolved against MF-57's
//            pageViewOf view, no second resolver; the mobile props goldens), 11a.7 dated note 2026-11-11 (Stage A on synthetic goldens),
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-18, FE-31, FE-32.
//
// MF-48 · the root half of the mobile REPORT props goldens (src/tests/fixtures/report-page/props/<state>.mobile.json). The mobile jest test proves
// props = reportProps(view); this file proves the other half: each committed `view` IS MF-57's core output, pageViewOf(buildPage(response_fixture),
// {target: 'mobile'}), so the phone never rebuilds a page (D-4 a), and the capture writes every golden byte for byte. It also runs the gate's own
// golden-side rule (SV-SBIND propsProblems, scripts/surfaces/screen-checks.mjs) over every props tree, because these goldens sit outside the gate
// root (MF-57 D-D), and checks every component against bindings.json mapping.mobile.REPORT. No DB, no network.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildPage, pageViewOf } from '../../lib/surfaces/report/core';
import { reportCtx } from '../../lib/surfaces/report/data';
import { captureMobileViews, MOBILE_LIFECYCLE_STATES, MOBILE_PAGE_STATES, MOBILE_PROPS_DIR, PAGE_GOLDEN_DIR } from '../../../scripts/surfaces/report-page-capture';
import { propsProblems } from '../../../scripts/surfaces/screen-checks.mjs';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- JSON under test
const ROOT = process.cwd();
const rj = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const B = rj('scripts/surfaces/_schema/bindings.json');
const LIFE = rj('scripts/surfaces/_schema/report-presentation.json').states.lifecycle as Record<string, string>;
const CONTENT = Object.fromEntries(Object.entries(LIFE).map(([k, v]) => [`states.lifecycle.${k}`, v]));
const names = fs.readdirSync(path.join(ROOT, MOBILE_PROPS_DIR)).filter((f) => f.endsWith('.mobile.json')).sort();
const golden = (f: string): Json => rj(`${MOBILE_PROPS_DIR}/${f}`);
const sbind = (v: unknown, at: string): string[] => propsProblems(v, at, { kinds: B.ref_kinds, nonDisplay: B.non_display_keys, content: CONTENT, used: new Set(), contracts: new Map() });
const walkC = (o: Json): string[] => [o.component, ...((o.children ?? []) as Json[]).filter((c) => c && typeof c === 'object' && 'component' in c).flatMap(walkC)];

describe('MF-48 the mobile props goldens: the root half', () => {
  it('8 goldens, one per declared state; the capture writes each byte for byte (a stale view fails)', () => {
    expect(names).toEqual([...Object.keys(MOBILE_PAGE_STATES), ...MOBILE_LIFECYCLE_STATES].map((s) => `${s}.mobile.json`).sort());
    const cap = captureMobileViews(ROOT);
    for (const f of names) expect([f, cap.get(`props/${f}`)]).toEqual([f, fs.readFileSync(path.join(ROOT, MOBILE_PROPS_DIR, f), 'utf8')]);
  });
  it('D-4 a: every page view is pageViewOf(buildPage(response_fixture), {target: mobile}) through MF-57 core; the response is synthetic', () => {
    for (const f of names.filter((n) => n.startsWith('page_'))) {
      const g = golden(f);
      expect(g.response_fixture.synthetic).toBe(true);
      expect([f, g.view]).toEqual([f, pageViewOf(buildPage(g.response_fixture, reportCtx), { target: 'mobile' }, reportCtx)]);
    }
  });
  it('RED (in memory): a view edited by hand no longer equals the core output', () => {
    const g = golden('page_v21.mobile.json');
    g.view.sections[1].parts[0].text = '26 Hurlingham Cres';
    expect(g.view).not.toEqual(pageViewOf(buildPage(g.response_fixture, reportCtx), { target: 'mobile' }, reportCtx));
  });
  it('the page_v21 response is MF-57\'s committed mobile response unchanged (MF-57 goldens untouched)', () => {
    expect(golden('page_v21.mobile.json').response_fixture).toEqual(rj(`${PAGE_GOLDEN_DIR}/v21.mobile.json`).response_fixture);
  });
  it('SV-SBIND (the gate rule, run here because the goldens are outside the gate root): every props tree is refs only', () => {
    for (const f of names) expect([f, sbind(golden(f).props, f)]).toEqual([f, []]);
  });
  it('RED (in memory): SV-SBIND finds a written "2,670 sq ft" and an undeclared ref kind in a props tree', () => {
    const p = golden('page_v21.mobile.json').props;
    p.page.children[0].children[0].children = ['2,670 sq ft', { field: 'area_sqft' }];
    expect(sbind(p, 'g')).toEqual(['raw string at g/page/children/0/children/0/children/0', 'unknown binding kind field at g/page/children/0/children/0/children/1']);
  });
  it('every component of every props tree is in mapping.mobile.REPORT', () => {
    for (const f of names) {
      const p = golden(f).props;
      const trees = 'page' in p ? [p.page, ...(p.sheet ? [p.sheet] : [])] : [p];
      expect([f, trees.flatMap(walkC).filter((c) => !B.mapping.mobile.REPORT.includes(c))]).toEqual([f, []]);
    }
  });
  it('plan v1.1 F12: with every option hidden, buildPage still places the lot-size box and drops nothing else', () => {
    const r = { ...rj(`${PAGE_GOLDEN_DIR}/v21.mobile.json`).response_fixture, hidden: ['o1', 'o2', 'o3'] };
    const ids = (buildPage(r, reportCtx).sections as Json[]).map((s) => s.id);
    expect(ids).toEqual(['title', 'address', 'lot_size', 'soon', 'lot', 'legal', 'footer', 'sheet']);
  });
});
