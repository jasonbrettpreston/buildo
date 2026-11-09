// @vitest-environment jsdom
// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11a.3-5, 11a.7 (dated note 2026-11-09, MF-14),
//            docs/specs/02-web-admin/128_surface_standard_policy.md Rule 15 (same everywhere), Rule 16 (no maths), Rule 17 (honest display),
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-24, FE-06.
//
// MF-14 · lane E-MF14. The one DOM component over the view: every layout row is honoured through data attributes, honest-display items are always
// shown, and the component source holds no target literal, status word or field name. Structure is asserted, not copy.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { buildTree, viewOf, type ReportView as View } from '../../lib/surfaces/report/core';
import { reportCtx } from '../../lib/surfaces/report/data';
import { ReportView } from '../../components/report/ReportView';
import { TARGETS } from '../../../scripts/surfaces/report-checks.mjs';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- JSON under test
const L = (reportCtx.layout as Json).targets as Json;
const GOLD = path.join(process.cwd(), 'src/tests/fixtures/surfaces/report');
const tree = (s: string): Json => JSON.parse(fs.readFileSync(path.join(GOLD, `${s}.web.json`), 'utf8')).rendered_tree;
const mount = (t: Json, target: string, ctx: Json = reportCtx, scenario: string | null = 'detached_house/flat_or_shallow_roof') =>
  render(<ReportView view={viewOf(t, { scenario, target }, ctx) as View} />);
afterEach(cleanup);

describe('one component, four layout rows', () => {
  for (const target of TARGETS as string[]) {
    it(`${target}: data attributes equal the layout row`, () => {
      const { container } = mount(tree('permitted'), target);
      const root = container.querySelector('[data-report]') as HTMLElement;
      expect(root.dataset.target).toBe(target);
      expect(root.dataset.columns).toBe(String(L[target].columns));
      expect(root.dataset.details).toBe(L[target].details);
      expect(root.dataset.meta).toBe(L[target].meta);
      expect(root.dataset.pageBreak).toBe(L[target].page_break);
      expect(container.querySelectorAll('details').length).toBe(L[target].details === 'collapsed' ? 1 : 0);
    });
  }
  it('a mutated layout object changes the DOM', () => {
    const c = JSON.parse(JSON.stringify(reportCtx)) as Json;
    c.layout.targets.web.columns = 3;
    c.layout.targets.web.details = 'expanded';
    const { container } = mount(tree('permitted'), 'web', c);
    expect((container.querySelector('[data-report]') as HTMLElement).dataset.columns).toBe('3');
    expect(container.querySelectorAll('details').length).toBe(0);
  });
});

describe('honest display on every target', () => {
  for (const target of TARGETS as string[]) {
    it(`${target}: at_least label, badges, reason, null dash, lifecycle message`, () => {
      expect(mount(tree('at_least'), target).container.textContent).toContain('at least');
      cleanup();
      const ne = mount(tree('not_evaluated'), target).container;
      expect(ne.querySelector('[data-badge]')?.textContent).toBe('not evaluated');
      expect(ne.textContent).toContain('not yet evaluated');
      cleanup();
      for (const s of ['loading', 'miss', 'error']) {
        const m = mount(tree(s), target).container;
        expect(m.textContent).toContain((reportCtx.content as Json).states.lifecycle[s]);
        cleanup();
      }
      const nul = buildTree({ status: 'permitted', gfa_flat_m2: null }, reportCtx);
      expect(mount(nul, target).container.textContent).toContain('—');
    });
  }
  it('not_modelled and not_buildable badges (synthetic tree), disclosure text, meta rules', () => {
    const c = JSON.parse(JSON.stringify(reportCtx)) as Json;
    c.content.disclosure_texts.dz_test = { template: 'Disclosed text here.' };
    const node = (status: string, extra: Json = {}): Json => ({ field: 'gfa_flat_m2', source: 'catalogue', label: 'GFA (flat roof)', value: '1 m²', status, confidence: 'none', provenance: 'none', disclosures: [], ...extra });
    for (const [st, badge] of [['not_modelled', 'not modelled'], ['not_buildable', 'not buildable']] as [string, string][]) {
      expect(mount({ nodes: [node(st)] }, 'web', c).container.querySelector('[data-badge]')?.textContent).toBe(badge);
      cleanup();
    }
    expect(mount({ nodes: [node('permitted', { disclosures: ['dz_test'] })] }, 'web', c).container.textContent).toContain('Disclosed text here.');
    cleanup();
    expect(mount({ nodes: [node('permitted')] }, 'web', c).container.querySelector('[data-meta-line]')).toBeNull();
    cleanup();
    expect(mount({ nodes: [node('permitted', { confidence: 'high', provenance: 'permit' })] }, 'web', c).container.querySelector('[data-meta-line]')?.textContent).toContain('high');
    cleanup();
    expect(mount({ nodes: [node('permitted')] }, 'admin', c).container.querySelector('[data-meta-line]')?.textContent).toContain('none');
  });
  it('a headline row the tree lacks shows its label and the dash, marked unavailable', () => {
    const { container } = mount(tree('permitted'), 'web');
    const el = container.querySelector('[data-field="storeys_max"]') as HTMLElement;
    expect(el.textContent).toContain('Storeys (max)');
    expect(el.textContent).toContain('—');
    expect(el.dataset.unavailable).toBe('true');
  });
});

describe('T18 the component holds no target literal, status word or field name', () => {
  const src = fs.readFileSync(path.join(process.cwd(), 'src/components/report/ReportView.tsx'), 'utf8').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  it('source scan', () => {
    for (const t of TARGETS as string[]) expect(src).not.toMatch(new RegExp(`['"\`]${t}['"\`]`));
    for (const w of ['permitted', 'not_buildable', 'not_modelled', 'at_least', 'not_evaluated', 'gfa_', 'storeys', 'height_max']) expect(src).not.toContain(w);
  });
});
