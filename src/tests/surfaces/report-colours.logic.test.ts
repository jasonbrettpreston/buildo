// SPEC LINK: docs/specs/00-architecture/117_maxbld_brand.md 3.2 (the on-primary contrast precedent at globals.css), docs/specs/02-web-admin/126_maxbld_surface_standard.md 11a.7,
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-05 (named colours only).
//
// MF-83 group 1b (D-1 (a); operator 2026-11-14, verbatim: "a as long as we get the same result"): the named --color-report-* keys (web globals.css) and their twin
// (mobile/tailwind.config.js) take the Daylight B values. "The same result": every colour the mock's :root defines is used at its exact value (an rgba becomes the
// equal 8-digit hex); a key with no mock value is DERIVED from the mock and marked so; every text/surface pair is contrast-checked. Reads the two files as text. No DB.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const web = (): Record<string, string> => Object.fromEntries([...read('src/app/globals.css').matchAll(/--color-report-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6,8});/g)].map((m) => [m[1]!, m[2]!.toLowerCase()]));
const mobile = (): Record<string, string> => Object.fromEntries([...read('mobile/tailwind.config.js').matchAll(/'report-([a-z0-9-]+)':\s*'(#[0-9a-fA-F]{6,8})'/g)].map((m) => [m[1]!, m[2]!.toLowerCase()]));

// Daylight B :root (report-themes/pub/B.html), copied: the mock is outside the repo.
const MOCK = { field: '#8a8172', paper: '#f4f1eb', card: '#ffffff', well: '#faf8f4', stage: '#efe9df', line: '#e9e3d8', line2: '#d9d0c1', ink: '#1d1b18', t2: '#4d4841', t3: '#655f55', amber: '#f59e0b', 'amber-ink': '#9a4a07', 'amber-soft': '#fdf1d8', ok: '#1a7340', no: '#b3261e' } as const;
// key -> [value, source]: 'mock:<name>' is the mock's own value, 'derived:<why>' has no mock value.
const MAP: Record<string, [string, string]> = {
  page: [MOCK.paper, 'mock:paper'], card: [MOCK.card, 'mock:card'], sky: [MOCK.stage, 'mock:stage'], line: [MOCK.line, 'mock:line'], ink: [MOCK.ink, 'mock:ink'], muted: [MOCK.t2, 'mock:t2'],
  amber: [MOCK.amber, 'mock:amber'], 'count-ink': [MOCK.ink, 'derived:ink on the amber chip (the mock puts ink on amber)'], ok: [MOCK.ok, 'mock:ok'], no: [MOCK.no, 'mock:no'],
  outer: [MOCK.card, 'mock:card (.opt)'], 'outer-border': [MOCK.line, 'mock:line'], inner: [MOCK.paper, 'mock:paper (.dsheet)'], tile: [MOCK.well, 'mock:well (.key)'], 'tile-border': [MOCK.line, 'mock:line (.key)'],
  mini: [MOCK.well, 'derived:well, as the tile'], 'mini-border': [MOCK.line, 'derived:line, as the tile border'], button: [MOCK.card, 'mock:card (.how-btn)'], 'button-border': [MOCK.line2, 'mock:line2 (.how-btn)'],
  soft: [MOCK.t3, 'mock:t3'], quiet: [MOCK.t3, 'mock:t3'], dim: [MOCK.t2, 'mock:t2'], 'option-label': [MOCK['amber-ink'], 'mock:amber-ink'], refused: [MOCK.no, 'mock:no'],
  scrim: ['#1d1b1847', 'mock:rgba(29,27,24,.28) (.ds-scrim)'], shade: ['#ffffffb8', 'derived:white wash at the old .72 alpha so the ink title stays readable on a photo'], chip: ['#ffffffe0', 'mock:rgba(255,255,255,.88) (.slide figcaption)'],
  'ok-fill': ['#1a73401f', 'derived:mock ok at the old .12 alpha'], 'ok-ring': ['#1a734059', 'derived:mock ok at the old .35 alpha'], 'no-fill': ['#b3261e1f', 'derived:mock no at the old .12 alpha'], 'no-ring': ['#b3261e59', 'derived:mock no at the old .35 alpha'],
  field: [MOCK.field, 'mock:field (new name; control edges, operator fix 4)'],
  'amber-ink': [MOCK['amber-ink'], 'mock:amber-ink (new name)'], 'amber-soft': [MOCK['amber-soft'], 'mock:amber-soft (new name)'], stage: [MOCK.stage, 'mock:stage (new name)'],
};

const lum = (h: string): number => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!; };
const ratio = (a: string, b: string): number => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number]; return (x + 0.05) / (y + 0.05); };

describe('MF-83 1b the Daylight B report colours (D-1 a, "the same result")', () => {
  it('the web keys are exactly the mapped keys (31 re-valued + 4 new: amber-ink, amber-soft, stage, field), each at its mapped value', () => {
    const w = web();
    expect(Object.keys(w).sort()).toEqual(Object.keys(MAP).sort());
    for (const [k, [v]] of Object.entries(MAP)) expect([k, w[k]]).toEqual([k, v]);
  });
  it('the mobile twin carries the same keys at the same values, and the hex twins of the sheet chrome', () => {
    expect(mobile()).toEqual(web());
    const h = read('mobile/src/constants/reportPage.ts');
    expect(/amber: '([^']+)'/.exec(h)?.[1]).toBe(MAP.amber![0]);
    expect(/inner: '([^']+)'/.exec(h)?.[1]).toBe(MAP.inner![0]);
    expect(/buttonBorder: '([^']+)'/.exec(h)?.[1]).toBe(MAP['button-border']![0]);
  });
  it('every mock :root colour the report uses is used at its exact value (a mock source names a mock value that exists)', () => {
    for (const [k, [v, src]] of Object.entries(MAP)) {
      const m = /^mock:([a-z0-9-]+)/.exec(src);
      if (m && m[1]! in MOCK) expect([k, v]).toEqual([k, (MOCK as Record<string, string>)[m[1]!]]);
    }
  });
  const SURFACES = ['page', 'card', 'outer', 'inner', 'tile', 'mini', 'button', 'sky'];
  const TEXTS = ['ink', 'muted', 'dim', 'quiet', 'soft', 'option-label', 'refused', 'ok', 'no'];
  it('contrast: every text colour on every surface it sits on is at least 4.5:1 (WCAG 1.4.3), the count-ink on amber too', () => {
    const w = web();
    for (const t of TEXTS) for (const s of SURFACES) expect(ratio(w[t]!, w[s]!), `${t} on ${s}`).toBeGreaterThanOrEqual(4.5);
    expect(ratio(w['count-ink']!, w.amber!), 'count-ink on amber').toBeGreaterThanOrEqual(4.5);
    expect(ratio(w['amber-ink']!, w['amber-soft']!), 'amber-ink on amber-soft').toBeGreaterThanOrEqual(4.5);
    expect(ratio(w.t3 ?? w.soft!, w.page!), 'text-3 on paper').toBeGreaterThanOrEqual(4.5);
  });
  // Operator 2026-11-14 ("1 y 2. yes, now 3. yes", and "with fixes" for the button and the sheet): the three dark-theme component uses are fixed.
  it('the fixed pairs: ink on the solid amber button and on Recalculate (4.5:1), amber-ink on the amber-soft pressed fill, and the field edge on the surfaces it outlines (3:1, WCAG 1.4.11)', () => {
    const w = web();
    expect(ratio(w.ink!, w.amber!), 'ink on amber').toBeGreaterThanOrEqual(4.5);
    expect(ratio(w['amber-ink']!, w['amber-soft']!), 'amber-ink on amber-soft').toBeGreaterThanOrEqual(4.5);
    for (const surf of ['page', 'card', 'tile', 'inner']) expect(ratio(w.field!, w[surf]!), `field on ${surf}`).toBeGreaterThanOrEqual(3);
  });
  it('the components use the fixed names: solid amber Add lot size with ink text, ink Recalculate, amber-soft pressed state with an amber-ink edge, field edges on the sheet controls (web and mobile)', () => {
    const w = read('src/components/report/ReportPage.tsx');
    expect(w).not.toContain('text-report-amber focus-visible');
    expect(w).not.toContain('text-report-page focus-visible');
    expect(w).not.toContain('aria-expanded:bg-report-sky');
    expect(w).toContain('bg-report-amber text-[16px]/[24px] font-bold text-report-ink');
    expect(w).toContain('aria-expanded:border-report-amber-ink aria-expanded:bg-report-amber-soft');
    expect(w).toContain('border-report-field');
    const m = read('mobile/src/constants/reportPage.ts');
    expect(m).toContain('border-report-field');
    expect(m).not.toContain('text-report-page');
    expect(m).toContain('bg-report-amber-soft');
  });
  // Fix 5 (operator: one card-shadow style from the mock --sh-2 as a NAMED key, on the option cards and the lot-size box only).
  it('the card shadow is one named key equal to the mock --sh-2, used by the option card and the lot-size box only; no shadow literal beside them; mobile carries the nearest single shadow under the same name', () => {
    const css = read('src/app/globals.css');
    expect(/--shadow-report-card:\s*([^;]+);/.exec(css)?.[1]).toBe('0 1px 2px rgba(70,50,20,.05), 0 10px 28px -6px rgba(70,50,20,.10), 0 28px 60px -24px rgba(70,50,20,.14)');
    const w = read('src/components/report/ReportPage.tsx');
    expect(w.split('shadow-report-card').length - 1).toBe(2);
    expect(/data-section="option"[^\n]*shadow-report-card/.test(w)).toBe(true);
    expect(/data-section="lot_size"[^\n]*shadow-report-card/.test(w)).toBe(true);
    const tw = read('mobile/tailwind.config.js');
    expect(/'report-card':\s*'0 10px 28px -6px rgba\(70,50,20,0?\.10?\)'/.test(tw)).toBe(true); // the --sh-2 middle layer, the nearest single shadow React Native can carry
    const m = read('mobile/src/constants/reportPage.ts');
    expect(m.split('shadow-report-card').length - 1).toBe(2);
  });
});
