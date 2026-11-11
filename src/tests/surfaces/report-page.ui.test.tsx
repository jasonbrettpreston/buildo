// @vitest-environment jsdom
// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11a.7 (dated note 2026-11-09, MF-14: one component, the layout table), 11a.10 (ad slots), 5.3 (client is glass),
//            docs/specs/02-web-admin/128_surface_standard_policy.md Rule 15 (same everywhere), Rule 17 (honest display), R-34 (an ad is never inside a card),
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-05, FE-24.
//
// MF-57 · McFrontend queue. The v21 report page component over the page view: the approved screen order, every part shown in its slot (pending
// text included), the details panels honour the layout row (collapsed: closed with a toggle; expanded: open), the ad sits between options and
// carries "Sponsored", the sheet is a dialog. The component source names no field and no target. Structure is asserted, not copy.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { pageViewOf, type PageView } from '../../lib/surfaces/report/core';
import { reportCtx } from '../../lib/surfaces/report/data';
import { ReportPage } from '../../components/report/ReportPage';
import { PAGE_GOLDEN_DIR } from '../../../scripts/surfaces/report-page-capture';
import { TARGETS } from '../../../scripts/surfaces/report-checks.mjs';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- JSON under test
const tree = (t: string): Json => JSON.parse(fs.readFileSync(path.join(process.cwd(), PAGE_GOLDEN_DIR, `v21.${t}.json`), 'utf8')).rendered_tree;
const mount = (target: string) => render(<ReportPage view={pageViewOf(tree(target), { target }, reportCtx) as PageView} />);
const L = (reportCtx.layout as Json).targets as Json;
// The parts that are toggle labels only (See details, Hide details, How?): drawn on collapsed rows, not on expanded rows.
const TOGGLE_ROLES = ['size.button', 'cost.button', 'size.panel.hide', 'cost.panel.hide', 'bigger.how'];
afterEach(cleanup);

describe('the v21 page, four layout rows', () => {
  for (const target of TARGETS as string[]) {
    it(`${target}: sections render in the page-table order, and every part text is on the page`, () => {
      const { container } = mount(target);
      const kinds = [...container.querySelectorAll('[data-section]')].map((e) => (e as HTMLElement).dataset.section);
      expect(kinds).toEqual((tree(target).sections as Json[]).map((s) => s.kind));
      const text = [container.textContent ?? '', ...[...container.querySelectorAll('[placeholder]')].map((e) => e.getAttribute('placeholder'))].join('\n');
      for (const s of tree(target).sections as Json[]) for (const p of s.parts as Json[]) {
        if (p.role === 'size.count' && p.kind === 'pending') continue; // the notes chip is left out while its count is pending (plan fold F2; listed)
        if (L[target].details === 'expanded' && TOGGLE_ROLES.includes(p.role)) continue; // expanded rows draw every panel open, so no toggle labels
        expect(text.includes(p.text), `${s.id} ${p.role}`).toBe(true);
      }
    });
    it(`${target}: details panels follow the layout row (${L[target].details})`, () => {
      const { container } = mount(target);
      const panels = [...container.querySelectorAll('[data-panel]')] as HTMLElement[];
      expect(panels.length).toBe(6);
      const open = L[target].details === 'expanded';
      for (const p of panels) expect(p.hidden).toBe(!open);
      expect(container.querySelectorAll('button[data-toggle="panel"]').length > 0).toBe(!open);
    });
  }
  it('collapsed: See details opens one panel per option at a time, Hide details closes it', () => {
    const { container } = mount('mobile');
    const opt = container.querySelector('[data-section="option"]') as HTMLElement;
    const [size, cost] = [...opt.querySelectorAll('button[data-toggle="panel"]')] as HTMLButtonElement[];
    fireEvent.click(size as HTMLButtonElement);
    const panels = [...opt.querySelectorAll('[data-panel]')] as HTMLElement[];
    expect(panels.map((p) => p.hidden)).toEqual([false, true]);
    fireEvent.click(cost as HTMLButtonElement);
    expect(panels.map((p) => p.hidden)).toEqual([true, false]);
    fireEvent.click(panels[1]?.querySelector('button[data-toggle="hide"]') as HTMLButtonElement);
    expect(panels.map((p) => p.hidden)).toEqual([true, true]);
  });
  it('the ad is a sibling between options, labelled Sponsored, never inside an option (R-34, R-17)', () => {
    const { container } = mount('web');
    const ad = container.querySelector('[data-section="ad"]') as HTMLElement;
    expect(ad.tagName).toBe('ASIDE');
    expect(ad.closest('[data-section="option"]')).toBeNull();
    expect(ad.textContent).toContain(String(reportCtx.content.sponsored_label));
  });
  it('the Add lot size sheet is a dialog with the record value; Recalculate stays inert (input is MF-19)', () => {
    const { container } = mount('mobile');
    const dlg = container.querySelector('dialog[data-section="sheet"]') as HTMLDialogElement;
    expect(dlg).not.toBeNull();
    expect(dlg.querySelector('button[type="submit"]')?.hasAttribute('disabled')).toBe(true);
  });
  it('a pending part shows the ruled text in its own slot, marked data-pending', () => {
    const { container } = mount('web');
    const pend = [...container.querySelectorAll('[data-pending="true"]')] as HTMLElement[];
    expect(pend.length).toBeGreaterThan(0);
    for (const e of pend) expect(['not yet estimated', 'not yet classified']).toContain(e.textContent);
  });
  it('the component source holds no field name, no target literal and no hex colour (named theme colours only)', () => {
    const dir = path.join(process.cwd(), 'src/components/report');
    const src = ['ReportPage.tsx', 'ReportPageToggles.tsx'].map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
    const fields = (reportCtx.decl.sections as Json[]).flatMap((s) => (s.fields as Json[]).map((f) => String(f.name))).filter((n) => n.length > 4);
    for (const f of fields) expect(src.includes(`'${f}'`) || src.includes(`"${f}"`), f).toBe(false);
    for (const t of TARGETS as string[]) expect(src.includes(`'${t}'`), t).toBe(false);
    expect(/#[0-9a-fA-F]{6}\b/.test(src)).toBe(false);
  });
});
