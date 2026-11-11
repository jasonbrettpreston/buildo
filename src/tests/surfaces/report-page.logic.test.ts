// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11a.1 (the binding rule), 11a.7 (golden = fixture + rendered tree), 11a.10 (ad slots), 5.3 (the server projects),
//            docs/specs/02-web-admin/128_surface_standard_policy.md Rule 16 (no maths), Rule 17 (honest display),
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-05, FE-24;
//            ~/Buildo-scratch/mcfrontend/CARD-Q-FE.answered.md Q-G4 a (declared pending entries: content text only, no value).
//
// MF-57 · McFrontend queue. The v21 report page (approved mock v21, open-questions.md "mock v21: APPROVED") in the shared REPORT renderer:
// buildPage (the capture), assertPage (the throw), pageViewOf (the projection). Every datum is injected, so planted tables prove each rule.
// Assertions look for a problem line starting `RR-<KIND> <subject>`. No DB, no network.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ReportRenderError, assertPage, buildPage, buildTree, pageViewOf } from '../../lib/surfaces/report/core';
import { reportCtx } from '../../lib/surfaces/report/data';
import { capturePages, PAGE_GOLDEN_DIR } from '../../../scripts/surfaces/report-page-capture';
import { TARGETS } from '../../../scripts/surfaces/report-checks.mjs';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- JSON under test
const ROOT = process.cwd();
const GOLD = path.join(ROOT, PAGE_GOLDEN_DIR);
const golden = (t: string): Json => JSON.parse(fs.readFileSync(path.join(GOLD, `v21.${t}.json`), 'utf8'));
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const problemsOf = (fn: () => unknown): string[] => {
  try { fn(); } catch (e) { if (e instanceof ReportRenderError) return e.problems; throw e; }
  return [];
};
const has = (ps: string[], prefix: string): boolean => ps.some((p) => p.startsWith(prefix));
const table = (): Json => reportCtx.page as Json;
const parts = (t: Json): Json[] => (t.sections as Json[]).flatMap((s) => s.parts as Json[]);
const response = (): Json => golden('web').response_fixture;
// The 63 element ids of fields/REPORT-LAYOUT-BRIEF-v4.md (A0..H0), copied as a closed list: the brief is outside the repo.
const BRIEF_IDS = ['A0', 'A1', 'A2', 'B0', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9', 'B9.1', 'B9.2', 'B9.3', 'B9.4', 'B9.5', 'B9.6', 'B9.7', 'B9.8', 'B9.9', 'B9.10',
  'B9.11', 'B9.12', 'B9.13', 'B9.14', 'B9.15', 'B9.16', 'B9.17', 'B9.18', 'B9.19', 'B10', 'B10.1', 'B10.2', 'B10.3', 'B10.4', 'B10.5', 'B10.6', 'B11', 'B12', 'B13',
  'B14', 'B15', 'B16', 'C1', 'C2', 'D1', 'D2', 'E1', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'G1', 'G2', 'G3', 'G4', 'H0'];
// The brief's screen order: A page top, Option 1, the lot-size box, Option 2, ad, Option 3, (ad D2 owed), Coming soon, About this lot, legal, footer; H is the sheet.
const SCREEN_ORDER = ['title', 'address', 'option', 'lot_size', 'option', 'ad', 'option', 'coming_soon', 'lot_facts', 'legal', 'footer', 'sheet'];

describe('P1 the page table covers the brief and binds only what exists', () => {
  it('every brief v4 element id is placed, a frame, or listed owed; nothing else', () => {
    const t = table();
    const placed = new Set<string>([...parts(t).map((p) => p.brief), ...(t.sections as Json[]).filter((s) => s.brief).map((s) => s.brief)]);
    for (const x of [...t.frames, ...t.owed] as Json[]) placed.add(x.brief);
    expect([...placed].sort()).toEqual([...BRIEF_IDS].sort());
  });
  it('every value part binds a field declared in report-v2.decl.json (no invented field)', () => {
    const declared = new Set((reportCtx.decl.sections as Json[]).flatMap((s) => (s.fields as Json[]).map((f) => f.name)));
    const vs = parts(table()).filter((p) => p.field !== undefined);
    expect(vs.length).toBeGreaterThan(0);
    for (const p of vs) expect(declared.has(p.field), p.field).toBe(true);
  });
  it('FE-05: no value part binds a display rule flagged FE-05 in brief v4 (those stay pending until the server sends the text)', () => {
    const flagged = new Set(table().fe05_flagged_rules as string[]);
    expect(flagged.size).toBe(15); // display-rules-v4.json v4.1 (brief v4 review fold): 12 plus notes_h, coa_answer, coa_neighbours
    for (const p of parts(table()).filter((q) => q.field !== undefined)) {
      expect(typeof p.rule, JSON.stringify(p)).toBe('string');
      expect(flagged.has(p.rule), p.rule).toBe(false);
    }
  });
  it('every part has exactly one binding, and every pending part says why', () => {
    for (const p of parts(table())) {
      expect(['field', 'content', 'pending'].filter((k) => p[k] !== undefined).length, JSON.stringify(p)).toBe(1);
      if (p.pending !== undefined) expect(String(p.why ?? '').length, JSON.stringify(p)).toBeGreaterThan(0);
    }
  });
  it('the sections follow the brief screen order', () => {
    expect((table().sections as Json[]).map((s) => s.kind)).toEqual(SCREEN_ORDER);
  });
});

describe('P2 buildPage: the capture, the throw and Q-G4 a', () => {
  for (const t of TARGETS as string[]) {
    it(`v21.${t}: the committed tree is buildPage(response_fixture) and passes assertPage`, () => {
      const g = golden(t);
      expect(g.response_fixture.synthetic).toBe(true);
      expect(buildPage(g.response_fixture, reportCtx)).toEqual(g.rendered_tree);
      expect(() => assertPage(g.rendered_tree, reportCtx)).not.toThrow();
    });
  }
  it('S-parity: the four target files carry the same tree', () => {
    const trees = (TARGETS as string[]).map((t) => JSON.stringify(golden(t).rendered_tree));
    expect(new Set(trees).size).toBe(1);
  });
  it('capture twice writes identical bytes and equals the committed files', () => {
    const a = capturePages(ROOT);
    const b = capturePages(ROOT);
    expect([...a.entries()]).toEqual([...b.entries()]);
    expect(a.size).toBe(4);
    for (const [file, text] of a) expect(fs.readFileSync(path.join(GOLD, file), 'utf8')).toBe(text);
  });
  it('a pending part shows one of the two ruled texts and never a value', () => {
    const texts = new Set(Object.values(reportCtx.page.pending_texts as Json).map((k) => reportCtx.content.page[k as string]));
    expect([...texts].sort()).toEqual(['not yet classified', 'not yet estimated']);
    const tree = buildPage(response(), reportCtx);
    const pend = parts(tree).filter((p) => p.kind === 'pending');
    expect(pend.length).toBeGreaterThan(0);
    for (const p of pend) expect(texts.has(p.text)).toBe(true);
  });
  it('Q-G4 a: a response value for a pending or content part throws', () => {
    for (const bind of ['pending', 'content']) {
      const c = clone(reportCtx) as Json;
      const p = (c.page.sections as Json[]).flatMap((s) => s.parts as Json[]).find((x) => x[bind] !== undefined) as Json;
      p.key = 'planted.key';
      const r = clone(response());
      r.values['planted.key'] = 'x';
      expect(has(problemsOf(() => buildPage(r, c)), 'RR-PAGE planted.key'), bind).toBe(true);
    }
  });
  it('an unknown response key throws RR-PAGE', () => {
    const r = clone(response());
    r.values.not_a_key = 'x';
    expect(has(problemsOf(() => buildPage(r, reportCtx)), 'RR-PAGE not_a_key')).toBe(true);
  });
  it('a value part on an undeclared field throws RR-FIELD', () => {
    const c = clone(reportCtx) as Json;
    const p = (c.page.sections as Json[]).flatMap((s) => s.parts as Json[]).find((x) => x.field !== undefined) as Json;
    p.field = 'not_declared_anywhere';
    expect(has(problemsOf(() => buildPage(response(), c)), 'RR-FIELD not_declared_anywhere')).toBe(true);
  });
  it('a content part whose key is missing throws RR-CONTENT', () => {
    const c = clone(reportCtx) as Json;
    const p = (c.page.sections as Json[]).flatMap((s) => s.parts as Json[]).find((x) => x.content !== undefined) as Json;
    p.content = 'no.such.key';
    expect(has(problemsOf(() => buildPage(response(), c)), 'RR-CONTENT no.such.key')).toBe(true);
  });
  it('a role outside its kind vocabulary throws RR-PAGE', () => {
    const c = clone(reportCtx) as Json;
    (c.page.sections[0].parts[0] as Json).role = 'invented_role';
    expect(has(problemsOf(() => buildPage(response(), c)), 'RR-PAGE')).toBe(true);
  });
  it('a missing value shows the declared null dash, never a blank (11a.7 note (6))', () => {
    const r = clone(response());
    delete r.values['o1.size.value'];
    const tree = buildPage(r, reportCtx);
    const p = parts(tree).find((x) => x.key === 'o1.size.value') as Json;
    expect(p.text).toBe(reportCtx.content.states.null_value);
  });
  it('a declared ad slot with no creative yields no section (no empty box, MF-20)', () => {
    const r = clone(response());
    const ad = (table().sections as Json[]).find((s) => s.kind === 'ad') as Json;
    r.values[ad.field] = null;
    expect((buildPage(r, reportCtx).sections as Json[]).some((s) => s.kind === 'ad')).toBe(false);
  });
  it('a hidden option is left out; the lot-size box follows the first SHOWN option; a scenario ad follows its own option (no fixed positions)', () => {
    const order = (patch: Json): string[] => (buildPage({ ...clone(response()), ...patch }, reportCtx).sections as Json[]).map((s) => s.id);
    const tail = ['soon', 'lot', 'legal', 'footer', 'sheet'];
    expect(order({ hidden: ['o1'] })).toEqual(['title', 'address', 'o2', 'lot_size', 'ad_o2', 'o3', ...tail]);
    expect(order({ hidden: ['o3'] })).toEqual(['title', 'address', 'o1', 'lot_size', 'o2', 'ad_o2', ...tail]);
    expect(order({ hidden: ['o1', 'o3'] })).toEqual(['title', 'address', 'o2', 'lot_size', 'ad_o2', ...tail]);
    expect(order({ hidden: ['o1', 'o2', 'o3'] })).toEqual(['title', 'address', 'lot_size', ...tail]);
    const r = clone(response());
    r.values.ad_scenario_detached_house_flat_or_shallow_roof = null;
    r.hidden = ['o1'];
    expect((buildPage(r, reportCtx).sections as Json[]).map((s) => s.id)).toEqual(['title', 'address', 'o2', 'lot_size', 'o3', ...tail]);
  });
  it('MF-20 D-7 in the page path: no scenario ad beside a hidden or not_evaluated option', () => {
    const order = (patch: Json): string[] => (buildPage({ ...clone(response()), ...patch }, reportCtx).sections as Json[]).map((s) => s.id);
    expect(order({ hidden: ['o2'] })).not.toContain('ad_o2');
    expect(order({ not_evaluated: ['o2'] })).toEqual(['title', 'address', 'o1', 'lot_size', 'o2', 'o3', 'soon', 'lot', 'legal', 'footer', 'sheet']);
    expect(order({ not_evaluated: ['o1'] })).toContain('ad_o2');
  });
  it('the shown-option lists are option ids in a list', () => {
    for (const k of ['hidden', 'not_evaluated']) {
      const r = clone(response());
      r[k] = ['not_an_option'];
      expect(has(problemsOf(() => buildPage(r, reportCtx)), `RR-PAGE ${k} not_an_option`), k).toBe(true);
      r[k] = 'o1';
      expect(has(problemsOf(() => buildPage(r, reportCtx)), `RR-PAGE response: ${k} is not a list`), k).toBe(true);
    }
  });
  it('a raw number from the producer throws: the server formats (R17, FE-05)', () => {
    const r = clone(response());
    r.values['o1.size.value'] = 2670;
    expect(has(problemsOf(() => buildPage(r, reportCtx)), 'RR-PAGE o1.size.value: value is not a string')).toBe(true);
  });
  it('page_text is the renderer\'s content field and is never accepted in a node response', () => {
    expect(has(problemsOf(() => buildTree({ status: 'permitted', page_text: 'x' }, reportCtx)), 'RR-FIELD page_text: produced by the renderer')).toBe(true);
  });
  it('no maths: a value is shown exactly as the producer sent it', () => {
    const r = clone(response());
    r.values['o1.size.value'] = '0.30000000000000004 sq ft';
    const p = parts(buildPage(r, reportCtx)).find((x) => x.key === 'o1.size.value') as Json;
    expect(p.text).toBe('0.30000000000000004 sq ft');
  });
  it('assertPage: the committed tree passes (control), and each planted defect throws its own line', () => {
    const base = (): Json => clone(golden('web').rendered_tree);
    expect(problemsOf(() => assertPage(base(), reportCtx))).toEqual([]);
    const ad = (t: Json): Json => (t.sections as Json[]).find((s) => s.kind === 'ad') as Json;
    const opt = (t: Json): Json => (t.sections as Json[]).find((s) => s.kind === 'option') as Json;
    const plant = (fn: (t: Json) => void, prefix: string): void => { const t = base(); fn(t); expect(has(problemsOf(() => assertPage(t, reportCtx)), prefix), prefix).toBe(true); };
    plant((t) => { ad(t).ad.disclosure = 'Ad'; }, 'RR-SLOT ad_scenario_detached_house_flat_or_shallow_roof: disclosure is not content.sponsored_label');
    plant((t) => { ad(t).ad.slot = 'bogus'; }, 'RR-SLOT ad_scenario_detached_house_flat_or_shallow_roof: slot bogus is not in the ad contract');
    plant((t) => { ad(t).parts = [clone(opt(t).parts[0])]; }, 'RR-SLOT ad_o2: an ad section has no parts');
    plant((t) => { opt(t).ad = clone(ad(t).ad); }, 'RR-SLOT o1: an ad is never inside a option section');
    plant((t) => { ((opt(t).parts as Json[]).find((p) => p.kind === 'pending') as Json).text = 'Medium confidence'; }, 'RR-CONTENT o1.');
    plant((t) => { ((opt(t).parts as Json[]).find((p) => p.kind === 'value') as Json).field = 'nope'; }, 'RR-FIELD nope');
    plant((t) => { ((opt(t).parts as Json[])[0] as Json).role = 'invented_role'; }, 'RR-PAGE o1.invented_role');
  });
  it('a schema-invalid tree throws RR-SCHEMA', () => {
    const tree = clone(golden('web').rendered_tree);
    tree.sections[0].kind = 'invented_kind';
    expect(has(problemsOf(() => assertPage(tree, reportCtx)), 'RR-SCHEMA')).toBe(true);
  });
});

describe('P3 pageViewOf: the layout row', () => {
  it('an unknown target throws RR-TARGET', () => {
    expect(has(problemsOf(() => pageViewOf(golden('web').rendered_tree, { target: 'tv' }, reportCtx)), 'RR-TARGET')).toBe(true);
  });
  for (const t of TARGETS as string[]) {
    it(`${t}: the view carries the target's layout row`, () => {
      const v = pageViewOf(golden(t).rendered_tree, { target: t }, reportCtx) as Json;
      expect(v.layout).toEqual((reportCtx.layout as Json).targets[t]);
      // D-K: a section the page table marks with a `details` value is drawn only on rows with that value; every other section is kept, in order.
      const only = new Map((table().sections as Json[]).filter((s) => s.details !== undefined).map((s) => [s.id, s.details]));
      const kept = (golden(t).rendered_tree.sections as Json[]).filter((s) => !only.has(s.id) || only.get(s.id) === v.layout.details);
      expect(v.sections).toEqual(kept);
    });
  }
});

// MF-57 and MF-38 follow-ups (operator 2026-11-11, verbatim "y to all as built"; record ~/Buildo-scratch/mcfrontend/MF-57/decisions.md bottom).
describe('P4 the 2026-11-11 rulings: D-J unit part, D-K expanded rows, MF-38 picture', () => {
  const options = (): Json[] => (table().sections as Json[]).filter((s) => s.kind === 'option');
  it('D-J: every tile value bound to an area field has its unit as its own value part on the same field and rule (no screen maths)', () => {
    let n = 0;
    for (const s of options()) for (const pre of ['size', 'unit']) {
      const v = (s.parts as Json[]).find((p) => p.role === `${pre}.value`);
      if (!v || v.field === undefined) continue;
      const u = (s.parts as Json[]).find((p) => p.role === `${pre}.unit`) as Json;
      expect(u, `${s.id} ${pre}.unit`).toBeDefined();
      expect([u.field, u.rule, u.brief]).toEqual([v.field, v.rule, v.brief]);
      expect(u.key).toBe(`${s.id}.${pre}.unit`);
      n += 1;
    }
    expect(n).toBe(4); // o1 size, o2 size, o3 size, o3 size per unit
  });
  it('D-J: the producer sends the number and the unit as two server-formatted strings; the page shows each as sent', () => {
    const tree = buildPage(response(), reportCtx);
    const pv = parts(tree).filter((p) => /[.](size|unit)[.](value|unit)$/.test(String(p.key)));
    expect(pv.length).toBe(8);
    for (const p of pv) {
      expect(p.text, p.key).toBe(response().values[p.key]);
      if (String(p.key).endsWith('.unit')) expect(p.text).toBe('sq ft');
      else expect(p.text.includes('sq ft'), p.key).toBe(false);
    }
  });
  it('D-K: the table marks exactly the lot-size box and the sheet as drawn only where details is collapsed (a closed layout value)', () => {
    const marked = (table().sections as Json[]).filter((s) => s.details !== undefined).map((s) => [s.kind, s.details]);
    expect(marked).toEqual([['lot_size', 'collapsed'], ['sheet', 'collapsed']]);
    for (const [, d] of marked) expect((reportCtx.layout as Json).closed.details).toContain(d);
  });
  it('D-K: expanded rows (admin, pdf) leave out the lot-size box and the sheet; collapsed rows (mobile, web) keep them; no target is named', () => {
    for (const t of TARGETS as string[]) {
      const v = pageViewOf(golden(t).rendered_tree, { target: t }, reportCtx) as Json;
      const kinds = (v.sections as Json[]).map((s) => s.kind);
      const expanded = (reportCtx.layout as Json).targets[t].details === 'expanded';
      expect(kinds.includes('lot_size'), t).toBe(!expanded);
      expect(kinds.includes('sheet'), t).toBe(!expanded);
    }
    const c = clone(reportCtx) as Json;
    c.layout.targets.web.details = 'expanded'; // the layout row decides, not the target name
    expect((pageViewOf(golden('web').rendered_tree, { target: 'web' }, c).sections as Json[]).some((s) => s.kind === 'lot_size')).toBe(false);
  });
  it('D-K: a table details value outside the layout closed set throws RR-PAGE', () => {
    const c = clone(reportCtx) as Json;
    ((c.page.sections as Json[]).find((s) => s.kind === 'sheet') as Json).details = 'folded';
    expect(has(problemsOf(() => pageViewOf(golden('web').rendered_tree, { target: 'web' }, c)), 'RR-PAGE sheet: details folded')).toBe(true);
  });
  it('MF-38: no option carries a pending caption part; B4 is listed owed (the reused figure, its caption default and the owed signed-URL read)', () => {
    for (const s of options()) expect((s.parts as Json[]).some((p) => p.role === 'picture.caption' || p.brief === 'B4'), s.id).toBe(false);
    expect((table().kinds as Json).option).not.toContain('picture.caption');
    const b4 = (table().owed as Json[]).find((x) => x.brief === 'B4') as Json;
    expect(b4, 'B4 owed').toBeDefined();
    for (const w of ['MF-44', 'MF-22', 'caption_default']) expect(String(b4.why)).toContain(w);
    expect(String(reportCtx.content.illustrations.caption_default)).toBe('Illustrative — not this lot');
  });
});
