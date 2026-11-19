// @vitest-environment jsdom
// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11a.7 (dated note 2026-11-09, MF-14: one component, the layout table), 11a.10 (ad slots), 5.3 (client is glass),
//            docs/specs/02-web-admin/128_surface_standard_policy.md Rule 15 (same everywhere), Rule 17 (honest display), R-34 (an ad is never inside a card),
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-05, FE-24.
//
// MF-57 · McFrontend queue. The v21 report page component over the page view: the approved screen order, every part shown in its slot (pending
// text included), the details panels honour the layout row (collapsed: closed with a toggle; expanded: open), the ad sits between options and
// carries "Sponsored", the sheet is a dialog. The component source names no field and no target. Structure is asserted, not copy.
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { pageViewOf, type PageView, type ViewImage } from '../../lib/surfaces/report/core';
import { reportCtx } from '../../lib/surfaces/report/data';
import { ReportPage } from '../../components/report/ReportPage';
import { pickFooterText } from '../../components/surfaces/web/footerNode';
import { SEARCH_CONTENT as FOOTER_SOURCE } from '../../lib/surfaces/maxbld-web';
import { PAGE_GOLDEN_DIR } from '../../../scripts/surfaces/report-page-capture';
import { TARGETS } from '../../../scripts/surfaces/report-checks.mjs';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- JSON under test
const tree = (t: string): Json => JSON.parse(fs.readFileSync(path.join(process.cwd(), PAGE_GOLDEN_DIR, `v21.${t}.json`), 'utf8')).rendered_tree;
const view = (target: string): PageView => pageViewOf(tree(target), { target }, reportCtx) as PageView;
const mount = (target: string) => render(<ReportPage view={view(target)} footer={FOOTER} />);
// MF-83 (FE-43): the in-place (inline) disclosure is the admin/pdf path and any row naming details_view: inline; mounted here with the row overridden (data, not a target name).
const mountInline = (target: string) => render(<ReportPage view={{ ...view(target), layout: { ...(view(target).layout as Json), details_view: 'inline' } } as PageView} footer={FOOTER} />);
// MF-91: the web report footer takes its links and copyright from the shared footer (RR-0273); the caller supplies the four strings.
const FOOTER = pickFooterText(FOOTER_SOURCE);
const L = (reportCtx.layout as Json).targets as Json;
// The parts that are toggle labels only (See details, Hide details, How?): drawn on collapsed rows, not on expanded rows.
const TOGGLE_ROLES = ['size.button', 'cost.button', 'size.panel.hide', 'cost.panel.hide', 'bigger.how'];
afterEach(cleanup);

describe('the v21 page, four layout rows', () => {
  for (const target of TARGETS as string[]) {
    it(`${target}: sections render in the page-table order, and every part text is on the page`, () => {
      const { container } = mount(target);
      const kinds = [...container.querySelectorAll('[data-section]')].map((e) => (e as HTMLElement).dataset.section);
      expect(kinds).toEqual((view(target).sections as Json[]).map((s) => s.kind));
      const text = [container.textContent ?? '', ...[...container.querySelectorAll('[placeholder]')].map((e) => e.getAttribute('placeholder'))].join('\n');
      for (const s of view(target).sections as Json[]) for (const p of s.parts as Json[]) {
        if (p.role === 'copyright') continue; // MF-91 (RR-0273): the web copyright is the shared footer's "© MaxBLD", not the G4 pending part (the mobile binding keeps it)
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
      const sheet = L[target].details_view === 'sheet' && !open;
      for (const p of panels) expect(p.hidden).toBe(sheet ? false : !open); // a sheet panel is not hidden: its dialog is closed until its address is opened
      expect(container.querySelectorAll('button[data-toggle="panel"]').length > 0).toBe(!open && !sheet);
      expect(container.querySelectorAll('dialog[data-detail]').length).toBe(sheet ? 8 : 0); // size and cost for each of three options, How? for the two options that have it
    });
  }
  it('details_view inline: See details opens one panel per option at a time, Hide details closes it (the in-place path is unchanged)', () => {
    const { container } = mountInline('mobile');
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

// MF-57 and MF-38 follow-ups (operator 2026-11-11, verbatim "y to all as built"; record ~/Buildo-scratch/mcfrontend/MF-57/decisions.md bottom).
const lum = (hex: string): number => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (c[0] as number) + 0.7152 * (c[1] as number) + 0.0722 * (c[2] as number);
};
const token = (name: string): string => {
  const m = new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6});`).exec(fs.readFileSync(path.join(process.cwd(), 'src/app/globals.css'), 'utf8'));
  if (!m) throw new Error(`token ${name} missing`);
  return m[1] as string;
};
const ratio = (a: string, b: string): number => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number]; return (x + 0.05) / (y + 0.05); };
const IMAGE: ViewImage = { field: 'card_image', label: 'Illustration', asset_id: 'synthetic-asset-1', alt: 'Synthetic illustration of a pitched-roof house', caption: String(reportCtx.content.illustrations.caption_default), src: 'data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22/%3E' };

describe('MF-83 (FE-43) See details as a sheet with its own address', () => {
  const hashTo = (h: string): void => { window.location.hash = h; act(() => { window.dispatchEvent(new HashChangeEvent('hashchange')); }); };
  const dlg = (c: HTMLElement, route: string): HTMLDialogElement => c.querySelector(`dialog[data-route="${route}"]`) as HTMLDialogElement;
  const isOpen = (d: HTMLDialogElement): boolean => d.open || d.hasAttribute('open');
  afterEach(() => { window.location.hash = ''; });
  it('web and mobile: the tile opener and How? are links to #<option>/<panel>; no toggle buttons; every sheet starts closed', () => {
    for (const t of ['web', 'mobile']) {
      const { container, unmount } = mount(t);
      const hrefs = [...container.querySelectorAll('a[data-detail="open"]')].map((a) => a.getAttribute('href'));
      expect(hrefs, t).toEqual(['#o1/size', '#o1/cost', '#o1/how', '#o2/size', '#o2/cost', '#o2/how', '#o3/size', '#o3/cost']);
      expect(container.querySelector('button[data-toggle="panel"], button[data-toggle="how"]'), t).toBeNull();
      for (const d of container.querySelectorAll('dialog[data-detail]')) expect(isOpen(d as HTMLDialogElement)).toBe(false);
      unmount();
    }
  });
  it('the address opens exactly that sheet; Back (the hash leaves it) closes it; another address replaces it', () => {
    const { container } = mount('web');
    hashTo('#o1/size');
    expect(isOpen(dlg(container, '#o1/size'))).toBe(true);
    hashTo('#o1/cost');
    expect([isOpen(dlg(container, '#o1/size')), isOpen(dlg(container, '#o1/cost'))]).toEqual([false, true]);
    hashTo('#o1');
    expect(isOpen(dlg(container, '#o1/cost'))).toBe(false);
  });
  it('a deep link on load opens that sheet', () => {
    window.location.hash = '#o2/how';
    const { container } = mount('mobile');
    expect(isOpen(dlg(container, '#o2/how'))).toBe(true);
  });
  it('Escape (the dialog close event) puts the address back on the option and returns focus to the opener link', () => {
    const { container } = mount('web');
    hashTo('#o3/size');
    const d = dlg(container, '#o3/size');
    d.removeAttribute('open');
    act(() => { d.dispatchEvent(new Event('close')); });
    expect(window.location.hash).toBe('#o3');
    expect(document.activeElement).toBe(container.querySelector('a[data-detail="open"][href="#o3/size"]'));
  });
  it('the sheet shows the same panel parts as the inline panel, and a Back link to the option', () => {
    const { container } = mount('web');
    const d = dlg(container, '#o1/size');
    expect(d.querySelector('[data-part="size.panel.h"]')).not.toBeNull();
    expect(d.querySelector('a[data-detail="close"]')?.getAttribute('href')).toBe('#o1');
  });
  it('an unknown address opens nothing', () => {
    const { container } = mount('web');
    hashTo('#o9/size');
    for (const d of container.querySelectorAll('dialog[data-detail]')) expect(isOpen(d as HTMLDialogElement)).toBe(false);
  });
});

describe('MF-83 group 2 (FE-42) the lot view on the page', () => {
  const lotTree = (state: string, t: string): Json => JSON.parse(fs.readFileSync(path.join(process.cwd(), PAGE_GOLDEN_DIR, `${state}.${t}.json`), 'utf8')).rendered_tree;
  const mountState = (state: string, t: string) => render(<ReportPage view={pageViewOf(lotTree(state, t), { target: t }, reportCtx) as PageView} footer={FOOTER} />);
  it('data absent (v21): no lot view anywhere', () => {
    for (const t of TARGETS as string[]) { const { container, unmount } = mount(t); expect(container.querySelector('[data-lotview]'), t).toBeNull(); unmount(); }
  });
  it('drawn: the outline, the four edge lines in their classes and the envelope are drawn from the sent coordinates; label and caption shown', () => {
    for (const t of TARGETS as string[]) {
      const { container, unmount } = mountState('lot_view_drawn', t);
      const fig = container.querySelector('[data-lotview="drawn"]') as HTMLElement;
      expect(fig, t).not.toBeNull();
      expect(fig.querySelector('polygon[data-part="lotview.outline"]')?.getAttribute('points')).toBe('100,100 900,100 900,900 100,900');
      expect([...fig.querySelectorAll('line[data-edge]')].map((l) => l.getAttribute('data-edge'))).toEqual(['front', 'side', 'rear', 'side']);
      expect(fig.querySelector('polygon[data-part="lotview.envelope"]')).not.toBeNull();
      expect(fig.textContent).toContain('From above');
      expect(fig.textContent).toContain('Not from a survey. Illustrative.');
      unmount();
    }
  });
  it('each outline-only state: the outline and edges, no envelope, its own fallback line and the same caption', () => {
    for (const [st, text] of [['lot_view_shape', 'Irregular lot'], ['lot_view_edges', 'Lot edges unclear'], ['lot_view_unevaluated', 'Some setbacks not worked out yet']] as const) {
      const { container, unmount } = mountState(st, 'web');
      const fig = container.querySelector('[data-lotview]') as HTMLElement;
      expect(fig.querySelector('polygon[data-part="lotview.envelope"]'), st).toBeNull();
      expect(fig.textContent, st).toContain(text);
      expect(fig.textContent, st).toContain('Not from a survey. Illustrative.');
      unmount();
    }
  });
});

describe('MF-83 (FE-41) the summary on the page', () => {
  it('every target: items link to their option anchors, each text is the option\'s own part', () => {
    for (const t of TARGETS as string[]) {
      const { container, unmount } = mount(t);
      const links = [...container.querySelectorAll('[data-section="summary"] a[data-item]')] as HTMLAnchorElement[];
      expect(links.map((a) => a.getAttribute('href')), t).toEqual(['#o1', '#o2', '#o3']);
      for (const a of links) expect(container.querySelector(a.getAttribute('href') as string)?.getAttribute('data-section'), t).toBe('option');
      expect(container.querySelector('[data-section="summary"] h2')?.textContent, t).toBe('3 options');
      unmount();
    }
  });
});

describe('the 2026-11-11 rulings on the v21 page', () => {
  for (const target of TARGETS as string[]) {
    it(`${target}: D-J the size number and its unit are two parts on one line, the unit in the smaller v21 unit style`, () => {
      const { container } = mount(target);
      const units = [...container.querySelectorAll('[data-part="size.unit"], [data-part="unit.unit"]')] as HTMLElement[];
      expect(units.length).toBe(4);
      for (const u of units) {
        expect(u.textContent).toBe('sq ft');
        expect(u.className).toContain('text-[13px]/[18px]');
        expect(u.className).toContain('text-report-dim');
        const line = u.parentElement as HTMLElement;
        const num = line.querySelector('[data-part$=".value"]') as HTMLElement;
        expect(num.textContent).toMatch(/^[0-9,]+$/);
        expect(line.textContent).toBe(`${num.textContent} sq ft`);
      }
    });
    it(`${target}: D-K the lot-size box and the sheet follow the layout row (${L[target].details})`, () => {
      const { container } = mount(target);
      const drawn = L[target].details === 'collapsed';
      expect(container.querySelector('[data-section="lot_size"]') !== null).toBe(drawn);
      expect(container.querySelector('dialog[data-section="sheet"]') !== null).toBe(drawn);
      expect(container.querySelector('button[data-toggle="sheet"]') !== null).toBe(drawn);
    });
    it(`${target}: MF-38 empty state, no signed URL yet: no figure, no caption, no "Illustration" chip`, () => {
      const { container } = mount(target);
      expect(container.querySelector('figure')).toBeNull();
      expect(container.querySelector('[data-part="picture.caption"]')).toBeNull();
      expect(container.textContent).not.toContain('Illustration');
    });
  }
  it('MF-38: an option image renders the reused ReportView figure inside that option picture box, caption from the image item', () => {
    const v = view('web');
    const sc = String((v.sections.find((s) => s.kind === 'option') as Json).scenario);
    const { container } = render(<ReportPage view={{ ...v, images: { [sc]: IMAGE } }} footer={FOOTER} />);
    const figs = [...container.querySelectorAll('figure[data-block="image"]')] as HTMLElement[];
    expect(figs.length).toBe(1);
    const fig = figs[0] as HTMLElement;
    expect((fig.closest('[data-section="option"]') as HTMLElement).dataset.scenario).toBe(sc);
    expect(fig.closest('[data-picture]')).not.toBeNull();
    expect(fig.querySelector('img')?.getAttribute('alt')).toBe(IMAGE.alt);
    const cap = fig.querySelector('figcaption') as HTMLElement;
    expect(cap.textContent).toBe('Illustrative — not this lot');
    expect(cap.className).toContain('text-report-soft');
    expect(cap.className).not.toMatch(/text-gray-/);
    expect(fig.className).toContain('bg-report-outer');
  });
  it('MF-38 caption contrast (MF-83 Daylight B values): report-soft on the report-outer frame meets WCAG 2.1 SC 1.4.3 (4.5:1), and on the white admin card too', () => {
    expect(token('report-soft').toLowerCase()).toBe('#655f55');
    expect(token('report-outer').toLowerCase()).toBe('#ffffff');
    expect(ratio(token('report-soft'), token('report-outer'))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(token('report-soft'), '#ffffff')).toBeGreaterThanOrEqual(4.5); // the earlier dark-theme control (soft fails on white) no longer holds: light only
  });
});
