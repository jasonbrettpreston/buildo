// @vitest-environment jsdom
// SPEC LINK: docs/specs/02-web-admin/128_surface_standard_policy.md Rule 15 (same everywhere; parity compares each target's REAL output),
//            docs/specs/02-web-admin/127_surface_conversion_procedure.md 4.3 (2026-11-04 dated note (b): the real output text of each target),
//            docs/specs/02-web-admin/126_maxbld_surface_standard.md 11a.7 (the one renderer, the closed layout table),
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-07 (P6 same everywhere).
//
// MF-16 · McFrontend queue · lane T. The FE-07 lock. For every state of the manifest and every pick (no scenario, then each key of
// row-presentation.json), each target's REAL output is normalised to {field, label, value, status, badge, confidence, provenance, disclosures,
// unavailable} and compared (a) pairwise across the four targets and (b) with the expectation derived from the golden tree by this file, which
// does not call viewOf (an anchor: four equally wrong outputs still fail). Output per target: web, admin, pdf = renderToStaticMarkup of ReportView
// over viewOf (one component, three layout rows); mobile = the viewOf projection (T-2: no React Native component until MF-22). Block order is not
// compared (sorted by field); the reason block has no label in the DOM, so its label is '' in all four and in the expectation.
// Honest limits: block membership (headline versus detail), data-lifecycle and the layout attributes are not compared here (layout is pinned by report-view.ui.test.tsx); the lock cannot see a viewOf bug shared by all four (the golden and capture side covers it: report-render.logic.test.ts T1);
// there is no extracted PDF text until a PDF engine exists; re-point mobile at the React Native component in MF-22.
// The goldens carry confidence/provenance none and no disclosures, so a few synthetic rich trees (injected ctx) cover those legs.
// A hand-written literal pins the at_least state independently of the generator. No DB, no network.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';
import { viewOf, type ReportView as View } from '../../lib/surfaces/report/core';
import { reportCtx } from '../../lib/surfaces/report/data';
import { ReportView } from '../../components/report/ReportView';
import { TARGETS } from '../../../scripts/surfaces/report-checks.mjs';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- JSON under test
interface Rec { field: string; label: string; value: string; status: string; badge: string; confidence: string; provenance: string; disclosures: string[]; unavailable: boolean }
type Raw = string | Json; // markup (web, admin, pdf) or the view object (mobile)
type Emit = (target: string, tree: Json, scenario: string | null, ctx: Json) => Raw;

const GOLD = path.join(process.cwd(), 'src/tests/fixtures/surfaces/report');
const manifest: Json = JSON.parse(fs.readFileSync(path.join(GOLD, 'states.json'), 'utf8'));
const goldenTree = (s: string): Json => JSON.parse(fs.readFileSync(path.join(GOLD, `${s}.web.json`), 'utf8')).rendered_tree;
const SCENARIOS = Object.keys(reportCtx.lists as Json);
const PICKS: Array<string | null> = [null, ...SCENARIOS];
const REASON = 'status_text';
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

// The real outputs.
const emit: Emit = (target, tree, scenario, ctx) => {
  const view = viewOf(tree, { scenario, target }, ctx) as View;
  if (target === 'mobile') return view as unknown as Json;
  return renderToStaticMarkup(createElement(ReportView, { view }));
};

// Normalisers: raw output -> sorted records.
const byField = (a: Rec, b: Rec): number => (a.field < b.field ? -1 : a.field > b.field ? 1 : 0);
const fromView = (view: Json): Rec[] => {
  const rec = (n: Json, isReason: boolean): Rec => ({
    field: n.field, label: isReason ? '' : n.label, value: n.text, status: n.status, badge: n.badge ?? '',
    confidence: n.confidence, provenance: n.provenance, disclosures: [...n.disclosures], unavailable: n.unavailable,
  });
  return [...(view.reason ? [rec(view.reason, true)] : []), ...view.headline.map((n: Json) => rec(n, false)), ...view.detail.map((n: Json) => rec(n, false))].sort(byField);
};
const textWithout = (el: Element, sel: string): string => {
  const c = el.cloneNode(true) as Element;
  c.querySelectorAll(sel).forEach((x) => x.remove());
  return (c.textContent ?? '').trim();
};
const fromMarkup = (markup: string): Rec[] => {
  const box = document.createElement('div');
  box.innerHTML = markup;
  const out: Rec[] = [];
  const reason = box.querySelector('[data-block="reason"]');
  if (reason) {
    out.push({ field: REASON, label: '', value: textWithout(reason, '[data-badge]'), status: reason.getAttribute('data-status') ?? '', badge: reason.querySelector('[data-badge]')?.textContent?.trim() ?? '', confidence: 'none', provenance: 'none', disclosures: [], unavailable: false });
  }
  box.querySelectorAll('[data-field]').forEach((el) => {
    const meta = el.querySelector('[data-meta-line]')?.textContent ?? '';
    const m = /confidence: (\S+) · provenance: (\S+)/.exec(meta);
    out.push({
      field: el.getAttribute('data-field') ?? '', label: textWithout(el.querySelector('dt') as Element, '[data-badge]'),
      value: (el.querySelector('dd') as Element).textContent?.trim() ?? '', status: el.getAttribute('data-status') ?? '',
      badge: el.querySelector('dt [data-badge]')?.textContent?.trim() ?? '', confidence: m?.[1] ?? 'none', provenance: m?.[2] ?? 'none',
      disclosures: [...el.querySelectorAll('[data-disclosure]')].map((d) => d.textContent?.trim() ?? ''), unavailable: el.getAttribute('data-unavailable') === 'true',
    });
  });
  return out.sort(byField);
};
const normalise = (target: string, raw: Raw): Rec[] => (target === 'mobile' ? fromView(raw as Json) : fromMarkup(raw as string));

// The anchor: the expectation from the golden tree, the declaration and the content registry. Never calls viewOf.
const expected = (tree: Json, scenario: string | null, ctx: Json): Rec[] => {
  const dash = String(ctx.content.states.null_value);
  const declared: Json[] = ctx.decl.sections.flatMap((s: Json) => s.fields);
  const badgeOf = (s: string): string => (s.startsWith('not_') ? (s.split(':')[0] as string).replace(/_/g, ' ') : '');
  const recOf = (n: Json): Rec => ({
    field: n.field, label: n.field === REASON ? '' : n.label, value: n.value === null ? dash : n.value, status: n.status, badge: badgeOf(n.status),
    confidence: n.confidence, provenance: n.provenance, disclosures: n.disclosures.map((c: string) => String(ctx.content.disclosure_texts[c].template ?? c)), unavailable: false,
  });
  const recs = (tree.nodes as Json[]).map(recOf);
  const listed: string[] = scenario === null ? [] : (ctx.lists[scenario] as string[]);
  for (const id of listed) {
    if (recs.some((r) => r.field === id)) continue;
    recs.push({ field: id, label: String(declared.find((f) => f.name === id)?.label ?? id), value: dash, status: 'none', badge: '', confidence: 'none', provenance: 'none', disclosures: [], unavailable: true });
  }
  return recs.sort(byField);
};

// Differences between two record lists, one line per field and key.
const diff = (where: string, got: Rec[], want: Rec[]): string[] => {
  const out: string[] = [];
  for (const w of want) {
    const g = got.find((r) => r.field === w.field);
    if (!g) { out.push(`${where} ${w.field}: missing`); continue; }
    for (const k of Object.keys(w) as Array<keyof Rec>) if (JSON.stringify(g[k]) !== JSON.stringify(w[k])) out.push(`${where} ${w.field}.${k}: got ${JSON.stringify(g[k])}, want ${JSON.stringify(w[k])}`);
  }
  for (const g of got) if (!want.some((w) => w.field === g.field)) out.push(`${where} ${g.field}: extra`);
  return out;
};

// Every finding of one case: each target against the anchor, then each target against mobile (pairwise).
const caseFindings = (name: string, tree: Json, scenario: string | null, ctx: Json, em: Emit): string[] => {
  const want = expected(tree, scenario, ctx);
  const got = Object.fromEntries((TARGETS as string[]).map((t) => [t, normalise(t, em(t, tree, scenario, ctx))]));
  const pick = scenario ?? 'no-scenario';
  const out: string[] = [];
  for (const t of TARGETS as string[]) out.push(...diff(`${name} [${pick}] ${t} vs golden:`, got[t] as Rec[], want));
  for (const t of (TARGETS as string[]).filter((x) => x !== 'mobile')) out.push(...diff(`${name} [${pick}] ${t} vs mobile:`, got[t] as Rec[], got.mobile as Rec[]));
  return out;
};
const goldenFindings = (em: Emit, states: string[] = manifest.states, picks: Array<string | null> = PICKS): string[] =>
  states.flatMap((s) => picks.flatMap((p) => caseFindings(s, goldenTree(s), p, reportCtx, em)));

// Synthetic rich trees: non-default confidence and provenance, a registered disclosure, at_least, not_modelled, a null, a not_permitted clause,
// and a listed headline field absent from the tree (a placeholder).
const richCtx = (): Json => {
  const c = clone(reportCtx) as Json;
  c.content.disclosure_texts.zz_probe = { template: 'Probe disclosure text', slots: [], importance: 'high', mandatory: true };
  return c;
};
const node = (field: string, label: string, value: string | null, status: string, confidence = 'none', provenance = 'none', disclosures: string[] = []): Json =>
  ({ field, source: 'catalogue', label, value, status, confidence, provenance, disclosures });
const RICH: Record<string, Json> = {
  rich_mixed: {
    nodes: [
      { field: REASON, source: 'content', label: 'Status reason (plain words)', value: 'A site-specific exception applies; not yet evaluated.', status: 'not_evaluated:exception_not_authored', confidence: 'none', provenance: 'none', disclosures: [] },
      node('gfa_flat_m2', 'GFA (flat roof), at least', '212.4 m²', 'at_least', 'high', 'permit', ['zz_probe']),
      node('height_max_m', 'Height (max)', null, 'not_permitted:x'),
      node('gfa_pitched_m2', 'GFA (pitched roof)', '0.30000000000000004 m²', 'not_modelled', 'low', 'estimated'),
    ],
  },
};
const richFindings = (em: Emit): string[] => Object.entries(RICH).flatMap(([n, t]) => PICKS.flatMap((p) => caseFindings(n, t, p, richCtx(), em)));

// Planted tampering of ONE target's raw output.
const tamperValue = (raw: Raw): Raw => (typeof raw === 'string' ? raw.replace(/(<dd class="text-base font-medium">)([^<]*)/, '$1$2 X') : ((): Json => { const v = clone(raw as Json); const n = v.headline[0] ?? v.detail[0]; n.text = `${n.text} X`; return v; })());
const tamperDisclosure = (raw: Raw): Raw => (typeof raw === 'string' ? raw.replace(/<dd data-disclosure[^>]*>[^<]*<\/dd>/, '') : ((): Json => { const v = clone(raw as Json); for (const n of [...v.headline, ...v.detail]) if (n.disclosures.length) { n.disclosures = []; break; } return v; })());
const only = (target: string, fix: (r: Raw) => Raw): Emit => (t, tree, sc, ctx) => (t === target ? fix(emit(t, tree, sc, ctx)) : emit(t, tree, sc, ctx));
const all = (fix: (r: Raw) => Raw): Emit => (t, tree, sc, ctx) => fix(emit(t, tree, sc, ctx));
const FLAT = 'detached_house/flat_or_shallow_roof';

describe('FE-07 parity: the real output of every target (goldens)', () => {
  it('covers the manifest: 11 states x 3 picks, four targets', () => {
    expect(manifest.states).toHaveLength(11);
    expect(PICKS).toHaveLength(3);
    expect(TARGETS).toHaveLength(4);
  });
  it('no state normalises to fewer nodes than its golden tree, and the lifecycle states carry their one message node', () => {
    for (const s of manifest.states as string[]) {
      const tree = goldenTree(s);
      for (const t of TARGETS as string[]) {
        const recs = normalise(t, emit(t, tree, null, reportCtx));
        expect(recs.length).toBeGreaterThanOrEqual(tree.nodes.length);
        expect(recs.length).toBeGreaterThan(0);
      }
      if (tree.lifecycle) expect(expected(tree, null, reportCtx).map((r) => r.field)).toEqual([REASON]);
    }
  });
  it('the four targets and the golden tree agree on all 33 combinations', () => {
    expect(goldenFindings(emit)).toEqual([]);
  });
  it('a hand-written literal pins the at_least state apart from the generator', () => {
    for (const t of TARGETS as string[]) {
      const rec = normalise(t, emit(t, goldenTree('at_least'), null, reportCtx)).find((r) => r.field === 'gfa_flat_m2');
      expect(rec?.label).toBe('GFA (flat roof), at least');
      expect(rec?.value).toBe('212.4 m²');
    }
  });
});

describe('FE-07 parity: synthetic rich trees (confidence, provenance, disclosures, at_least, not_modelled, null, placeholder)', () => {
  it('the four targets and the expectation agree', () => {
    expect(richFindings(emit)).toEqual([]);
  });
  it('guard: the compared set carries non-default confidence, a disclosure, a placeholder and a null dash', () => {
    const recs = normalise('web', emit('web', RICH.rich_mixed as Json, FLAT, richCtx()));
    expect(recs.some((r) => r.confidence !== 'none' && r.provenance !== 'none')).toBe(true);
    expect(recs.some((r) => r.disclosures.length > 0)).toBe(true);
    expect(recs.some((r) => r.unavailable)).toBe(true);
    expect(recs.some((r) => r.value === '—' && !r.unavailable)).toBe(true);
  });
});

describe('FE-07 RED: one planted change in ONE target is reported by name', () => {
  it.each(TARGETS as string[])('%s: a changed value names the state, the pick, the target and the field', (target) => {
    const found = goldenFindings(only(target, tamperValue), ['permitted'], [FLAT]);
    expect(found.length).toBeGreaterThan(0);
    expect(found.some((f) => f.startsWith(`permitted [${FLAT}] ${target} vs golden:`))).toBe(true); // the anchor names the target
    expect(found.every((f) => f.startsWith(`permitted [${FLAT}] `) && (f.includes(` ${target} vs `) || f.includes(" vs mobile:")))).toBe(true); // pairwise names it, or (mobile) the others differ from it
    expect(found.some((f) => f.includes('.value: got'))).toBe(true);
    expect(found.some((f) => f.includes('gfa_flat_m2') || f.includes('storeys_max') || f.includes('height_max_m') || f.includes('gfa_pitched_m2'))).toBe(true);
  });
  it('the same change in all four targets is caught by the anchor', () => {
    const found = goldenFindings(all(tamperValue), ['permitted'], [FLAT]);
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((f) => f.includes(' vs golden:'))).toBe(true); // pairwise sees nothing: only the anchor does
  });
  it.each(TARGETS as string[])('%s: a dropped disclosure on a rich tree is reported', (target) => {
    const found = richFindings(only(target, tamperDisclosure));
    expect(found.length).toBeGreaterThan(0);
    expect(found.some((f) => f.includes(`${target} vs golden:`) && f.includes('.disclosures'))).toBe(true);
  });
  it('control: the untouched emit reports nothing on the same cases', () => {
    expect(goldenFindings(emit, ['permitted'], [FLAT])).toEqual([]);
    expect(richFindings(emit)).toEqual([]);
  });
});
