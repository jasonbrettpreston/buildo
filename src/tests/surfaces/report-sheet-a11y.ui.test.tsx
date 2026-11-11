// @vitest-environment jsdom
// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11a.9 (user inputs; dated notes 2026-11-11), 5.3 (client is glass),
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-05; WCAG 2.2 2.4.3, 2.4.11, 1.4.4, 1.4.10, 3.3.1, 4.1.3, 1.4.11, 4.1.2.
//
// MF-19 · the accessibility audit fold A12 on the Add lot size sheet (~/Buildo-scratch/mcfrontend/small-pages-review/6-accessibility.md B2, S2, S3;
// CONSOLIDATED.md A12), on the web report page (the app sheet is MF-48's):
//   (1) focus stays inside the open sheet: every sibling of the dialog is inert while it is open (on top of the native modal), and focus returns to
//       the Add lot size button when the sheet closes by Cancel, by Escape or by the dialog's own close (2.4.3, 2.4.11);
//   (2) at 200 % zoom the title and fields stay reachable: the sheet is capped at the viewport height and scrolls (1.4.4, 1.4.10);
//   (3) the entry error is announced: its container is role="alert" (3.3.1, 4.1.3);
//   (4) the sq ft / m² selector is a native radio pair (one tab stop, arrow keys, checked state from the browser), and the selected segment's
//       border (report-ink) has at least 3:1 against the sheet and the segment fill (1.4.11, 4.1.2).
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { pageViewOf, type PageView } from '../../lib/surfaces/report/core';
import { reportCtx } from '../../lib/surfaces/report/data';
import { ReportPage } from '../../components/report/ReportPage';
import { PAGE_GOLDEN_DIR } from '../../../scripts/surfaces/report-page-capture';

const ROOT = process.cwd();
// v21 web: the box and sheet are on (flags lot_size_entry_open) on a collapsed row.
const view = (): PageView => pageViewOf(JSON.parse(fs.readFileSync(path.join(ROOT, PAGE_GOLDEN_DIR, 'v21.web.json'), 'utf8')).rendered_tree, { target: 'web' }, reportCtx) as PageView;
const mount = () => render(<ReportPage view={view()} />);
afterEach(cleanup);

const parts = (c: HTMLElement) => {
  const dlg = c.querySelector('dialog[data-section="sheet"]') as HTMLDialogElement;
  const opener = c.querySelector('button[data-toggle="sheet"]') as HTMLButtonElement;
  const siblings = [...(dlg.parentElement?.children ?? [])].filter((e) => e !== dlg) as HTMLElement[];
  return { dlg, opener, siblings };
};
const isOpen = (d: HTMLDialogElement): boolean => d.open || d.hasAttribute('open');

describe('A12 (1) focus stays in the open sheet and returns to its opener (2.4.3, 2.4.11)', () => {
  it('opening makes every sibling of the dialog inert and moves focus into the sheet', () => {
    const { container } = mount();
    const { dlg, opener, siblings } = parts(container);
    expect(siblings.length).toBeGreaterThan(0);
    opener.focus();
    fireEvent.click(opener);
    expect(isOpen(dlg)).toBe(true);
    for (const s of siblings) expect(s.hasAttribute('inert'), s.dataset.section).toBe(true);
    expect(dlg.contains(document.activeElement)).toBe(true);
  });
  for (const [how, close] of [
    ['Cancel', (dlg: HTMLDialogElement) => fireEvent.click(dlg.querySelector('button[data-toggle="sheet-close"]') as HTMLElement)],
    ['Escape', (dlg: HTMLDialogElement) => fireEvent.keyDown(dlg.querySelector('input') as HTMLElement, { key: 'Escape' })],
    ['the dialog close event', (dlg: HTMLDialogElement) => { dlg.removeAttribute('open'); dlg.dispatchEvent(new Event('close')); }],
  ] as const) {
    it(`closing by ${how} lifts inert and returns focus to the Add lot size button`, () => {
      const { container } = mount();
      const { dlg, opener, siblings } = parts(container);
      opener.focus();
      fireEvent.click(opener);
      close(dlg);
      expect(isOpen(dlg)).toBe(false);
      for (const s of siblings) expect(s.hasAttribute('inert'), s.dataset.section).toBe(false);
      expect(document.activeElement).toBe(opener);
    });
  }
});

describe('A12 (2) the sheet scrolls within the viewport at 200 % zoom (1.4.4, 1.4.10)', () => {
  it('the dialog is capped at the dynamic viewport height and scrolls; no unbounded height', () => {
    const { container } = mount();
    const cls = parts(container).dlg.className.split(/\s+/);
    expect(cls).toContain('max-h-[100dvh]');
    expect(cls).toContain('overflow-y-auto');
    expect(cls).not.toContain('max-h-none');
  });
});

describe('A12 (3) the entry error is announced (3.3.1, 4.1.3)', () => {
  it('the error container is role="alert" and is the field\'s description', () => {
    const { container } = mount();
    const err = container.querySelector('#report-sheet-err') as HTMLElement;
    expect(err.getAttribute('role')).toBe('alert');
    expect(container.querySelector('#report-sheet-in')?.getAttribute('aria-describedby')).toBe('report-sheet-err');
  });
});

const hex = (s: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16) / 255) as [number, number, number];
const lum = (s: string): number => { const [r, g, b] = hex(s).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!; };
const ratio = (a: string, b: string): number => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05); };
const token = (name: string): string => {
  const m = new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(fs.readFileSync(path.join(ROOT, 'src/app/globals.css'), 'utf8'));
  if (!m) throw new Error(`no token ${name}`);
  return m[1]!;
};

describe('A12 (4) the unit selector is a real radio group with a visible selected state (1.4.11, 4.1.2)', () => {
  it('two native radios in one group (one tab stop, arrow keys by the browser), sq ft checked first; no ARIA radio buttons', () => {
    const { container } = mount();
    const group = container.querySelector('dialog [role="radiogroup"]') as HTMLElement;
    const radios = [...group.querySelectorAll('input[type="radio"]')] as HTMLInputElement[];
    expect(radios.map((r) => [r.name, r.value, r.checked])).toEqual([['report-sheet-unit', 'sqft', true], ['report-sheet-unit', 'm2', false]]);
    expect(group.querySelectorAll('[role="radio"], button').length).toBe(0);
    expect(group.getAttribute('aria-labelledby')).toBe('report-sheet-lbl');
    for (const r of radios) expect(r.closest('label')?.textContent).toBeTruthy();
    fireEvent.click(radios[1]!.closest('label') as HTMLElement);
    expect(radios.map((r) => r.checked)).toEqual([false, true]);
  });
  it('the selected segment draws a report-ink border, at least 3:1 against the sheet and the segment fill', () => {
    const { container } = mount();
    const seg = container.querySelector('dialog [role="radiogroup"] input[type="radio"] + span') as HTMLElement;
    expect(seg.className.split(/\s+/)).toEqual(expect.arrayContaining(['peer-checked:border-report-ink', 'peer-focus-visible:outline-2']));
    for (const bg of ['report-inner', 'report-button', 'report-tile']) expect(ratio(token('report-ink'), token(bg)), bg).toBeGreaterThanOrEqual(3);
  });
});
