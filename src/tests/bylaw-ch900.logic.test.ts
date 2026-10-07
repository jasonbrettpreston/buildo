// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §6 (regulation_id: Ch.900 exceptions `900.<k>.10(<n>)`;
//            clause units `regulation_id#clause_path`), §9 G-TEXT (structure from the HTML; every-level numbering;
//            repeats are status-tagged variants), §6 archetype INCLUDE ("must comply with exception 900.3.10(1462)");
//            docs/specs/01-pipeline/69_mcbylaw_policy.md M-2, M-15 (dated note 2026-10-07, operator Q-K7a), M-57
//
// Phase 2 prep (Q-K7a): the slicer on Ch.900 exception markup. An exception carries two lists under one number —
// "Site Specific Provisions:" and "Prevailing By-laws and Prevailing Sections:" — each restarting at (A). The group
// headings are declared in vocab.json `slicer.clause_groups` (a rule, not a code branch on an id); each heading is a
// path segment `[<key>]`, so the two (A)s are distinct units, never an unstatused variant.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
// A missing module fails every test that uses it (red-first evidence records per-test failures), never silently passes.
const load = (rel: string): Promise<Json> => import(pathToFileURL(path.join(process.cwd(), rel)).href).catch((err: unknown) => ({ importError: String(err) }));
const SL = await load('scripts/analysis/bylaw/slice.mjs');
const ST = await load('scripts/analysis/bylaw/standardized.mjs');
const VOCAB = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'scripts/seeds/bylaw/vocab.json'), 'utf8'));

const CONT = '<TD ALIGN=RIGHT VALIGN=TOP width="5%"></TD>';
const group = (label: string, items?: Json[], tail = '') =>
  `<TR>${CONT}<TD VALIGN=TOP>${label}: ${tail}</TD></TR>${items ? `<TR>${CONT}<TD VALIGN=TOP>${ST.clauseTable(items)}</TD></TR>` : ''}`;
const LANDS = `<TR>${CONT}<TD VALIGN=TOP colspan="2">The lands, or a portion thereof as noted below, are subject to the following Site Specific Provisions, Prevailing By-laws and Prevailing Sections.<br><br></TD></TR>`;
const exception = (n: number, ssp: Json[] | null, pbs: Json[] | null) => ({
  html: `${LANDS}${group('Site Specific Provisions', ssp || undefined, ssp ? '' : '(None Apply)')}${group('Prevailing By-laws and Prevailing Sections', pbs || undefined, pbs ? '' : '(None Apply)')}`,
  n,
  title: `Exception RD ${n}`,
});
const rdPage = (regs: Json[]) =>
  ST.fixturePage({ articles: [{ id: '900.3.10', regs, title: 'Exceptions for RD Zone' }], chapter: '900', chapterTitle: 'Site Specific Exceptions', key: 'ch900_3', section: '900.3', sectionTitle: 'RD - Zone' });
const sliceOf = (regs: Json[]) => SL.sliceSnapshot({ pages: [rdPage(regs)] });

describe('vocab.slicer.clause_groups declares the Ch.900 list headings (one source, read by the slicer)', () => {
  it('declares SSP and PBS with their City labels', () => {
    expect(VOCAB.slicer.clause_groups).toEqual([
      { key: 'SSP', label: 'Site Specific Provisions' },
      { key: 'PBS', label: 'Prevailing By-laws and Prevailing Sections' },
    ]);
    expect(SL.CLAUSE_GROUPS.map((g: Json) => [g.key, g.label])).toEqual(VOCAB.slicer.clause_groups.map((g: Json) => [g.key, g.label]));
  });
});

describe('an exception is one row; its two lists are path groups, not variants', () => {
  const s = sliceOf([
    exception(28, [{ sym: 'A', text: 'The minimum lot depth is 45 metres;' }, { sym: 'B', text: 'These lands must comply with exception 900.3.10(5).' }], [{ sym: 'A', text: 'Former City of Etobicoke by-law 4101.' }]),
    exception(29, null, null),
  ]);
  it('slices without problems or unproven gaps', () => {
    expect(s.problems).toEqual([]);
    expect(s.numbering.unproven).toEqual([]);
  });
  it('one row per exception number', () => {
    expect(s.rows.map((r: Json) => r.regulation_id)).toEqual(['900.3.10(28)', '900.3.10(29)']);
  });
  it('units carry the group segment; the heading is the context of its items', () => {
    expect(s.units.filter((u: Json) => u.regulation_id === '900.3.10(28)').map((u: Json) => u.unit_id)).toEqual([
      '900.3.10(28)#(28)[SSP](A)',
      '900.3.10(28)#(28)[SSP](B)',
      '900.3.10(28)#(28)[PBS](A)',
    ]);
    const a = s.units.find((u: Json) => u.unit_id === '900.3.10(28)#(28)[SSP](A)');
    expect(a.context.join(' ')).toMatch(/Site Specific Provisions:$/);
    const p = s.units.find((u: Json) => u.unit_id === '900.3.10(28)#(28)[PBS](A)');
    expect(p.context.at(-1)).toBe('Prevailing By-laws and Prevailing Sections:');
  });
  it('a "(None Apply)" group is a leaf unit of its own (the stated absence is text, never dropped)', () => {
    expect(s.units.filter((u: Json) => u.regulation_id === '900.3.10(29)').map((u: Json) => [u.unit_id, u.text])).toEqual([
      ['900.3.10(29)#(29)[SSP]', 'Site Specific Provisions: (None Apply)'],
      ['900.3.10(29)#(29)[PBS]', 'Prevailing By-laws and Prevailing Sections: (None Apply)'],
    ]);
  });
  it('an INCLUDE ("must comply with exception 900.3.10(5)") is an extracted ref on its clause', () => {
    const r = s.rows.find((x: Json) => x.regulation_id === '900.3.10(28)');
    expect(r.refs.map((x: Json) => [x.citation, x.clause_path])).toEqual([['900.3.10(5)', '(28)[SSP](B)']]);
  });
  it('a numbering gap inside a group is still checked (R3): SSP (A) then (C) is a gap', () => {
    const g = sliceOf([exception(30, [{ sym: 'A', text: 'x;' }, { sym: 'C', text: 'y.' }], null)]);
    expect(g.numbering.gaps.concat(g.numbering.unproven).filter((x: Json) => x.parent).map((x: Json) => [x.parent, x.missing])).toEqual([['(30)[SSP]', 'B']]);
  });
  it('without the group rule the two (A)s collide: a heading-less exception still reports the repeat (R4 unchanged)', () => {
    const html = `${LANDS}<TR>${CONT}<TD VALIGN=TOP>${ST.clauseTable([{ sym: 'A', text: 'x 1;' }])}</TD></TR><TR>${CONT}<TD VALIGN=TOP>${ST.clauseTable([{ sym: 'A', text: 'y 2.' }])}</TD></TR>`;
    const b = sliceOf([{ html, n: 31, title: 'Exception RD 31' }]);
    expect(b.problems.some((p: string) => p.startsWith('unstatused_variant:'))).toBe(true);
  });
});

describe('the City markup variants found on the real Ch.900 pages (adoption-4)', () => {
  it('a heading left at the END of the previous item cell (900.6.10(128): "… Prevailing By-laws and Prevailing Section:") opens that group for the list restarting at (A); disclosed', () => {
    const html = `${LANDS}${group('Site Specific Provisions', [{ sym: 'A', text: 'The minimum lot frontage is 8.0 metres for a detached house.<br><br>Prevailing By-laws and Prevailing Section:' }, { sym: 'A', text: 'On 708-710 Jane St., Section 16(213) of the former City of York zoning by-law 1-83.' }])}`;
    const s = sliceOf([{ html, n: 128, title: 'Exception RM 128' }]);
    expect(s.problems).toEqual([]);
    expect(s.units.map((u: Json) => u.unit_id)).toEqual(['900.3.10(128)#(128)[SSP](A)', '900.3.10(128)#(128)[PBS](A)']);
    // the heading's colon also makes the cell a lead-in without items (existing disclosure)
    expect(s.defects.map((d: Json) => [d.kind, d.clause_path])).toEqual([['lead_in_without_items', '(128)[SSP](A)'], ['group_heading_in_cell', '(128)[SSP](A)']]);
  });
  it('the tail rule needs the restart at (A): a cell ending in the label before (B) opens nothing', () => {
    const html = `${LANDS}${group('Site Specific Provisions', [{ sym: 'A', text: 'as set out in the Site Specific Provisions' }, { sym: 'B', text: 'y.' }])}`;
    const s = sliceOf([{ html, n: 129, title: 'Exception RM 129' }]);
    expect(s.units.map((u: Json) => u.unit_id)).toEqual(['900.3.10(129)#(129)[SSP](A)', '900.3.10(129)#(129)[SSP](B)']);
    expect(s.defects).toEqual([]);
  });
  it("an article's first division is checked from its own heading: 900.x.10 starting at (2) proves (1) absent even if an earlier article has a (1)", () => {
    const pg = ST.fixturePage({
      articles: [
        { id: '900.3.1', regs: [{ n: 1, text: 'General.', title: 'Application' }], title: 'General' },
        { id: '900.3.10', regs: [{ n: 2, text: 'x.', title: 'Exception RD 2' }], title: 'Exceptions for RD Zone' },
      ],
      chapter: '900', chapterTitle: 'Site Specific Exceptions', key: 'ch900_3', section: '900.3', sectionTitle: 'RD - Zone',
    });
    const s = SL.sliceSnapshot({ pages: [pg] });
    expect(s.numbering.unproven).toEqual([]);
    expect(s.numbering.gaps.map((g: Json) => [g.article, g.missing])).toEqual([['900.3.10', '1']]);
  });
  it('a numeral restating its number word ("fifteen (15) of which") does not make a missing (15) unproven; a bare "(15)" still does', () => {
    const mk = (t: string) => SL.sliceSnapshot({ pages: [rdPage([{ n: 13, text: t, title: 'Exception RD 13' }, { n: 17, text: 'y.', title: 'Exception RD 17' }])] }).numbering;
    const words = mk('A minimum of seventeen (17) parking spaces, fifteen (15) of which must be stacked.');
    expect(words.unproven.filter((g: Json) => g.missing === '15')).toEqual([]);
    expect(mk('see (15) here.').unproven.map((g: Json) => g.missing)).toContain('15');
  });
});

describe('k7.mjs — the keying list over a fixture census + slice', () => {
  const K7P = load('scripts/analysis/bylaw/k7.mjs');
  // RD 1 includes RD 2; RD 3 includes RD 1 (a chain), RD 4 includes RD 2 (a diamond onto 2), RD 5 <-> RD 6 (a cycle).
  const ex = (n: number, includes: number[]) =>
    exception(n, [{ sym: 'A', text: 'x 1;' }, ...includes.map((t, i) => ({ sym: String.fromCharCode(66 + i), text: `These lands must comply with exception 900.3.10(${t}).` }))], null);
  const fixtureSlice = () => sliceOf([ex(1, [2]), ex(2, []), ex(3, [1]), ex(4, [2]), ex(5, [6]), ex(6, [5])]);
  const census = { adoption_id: 'adoption-x', backlog: [1, 2, 3, 4, 5, 6].map((n) => ({ exception_number: n, lots: n * 10, zone: 'RD' })).concat([{ exception_number: 99, lots: 1000, zone: 'RD' }]), excepted: { lots: 1210 }, sql: { blob_sha: 'f' } };
  it('closed lots = own direct + every transitive includer, once each; a cycle terminates', async () => {
    const K7 = await K7P;
    const d = K7.buildK7({ adoptionId: 'adoption-x', census, groups: SL.CLAUSE_GROUPS, slice: fixtureSlice() });
    const by = Object.fromEntries(d.exceptions.filter((e: Json) => e.regulation_id).map((e: Json) => [e.exception, e.closed_lots]));
    expect(by).toEqual({ 1: 40, 2: 100, 3: 30, 4: 40, 5: 110, 6: 110 }); // 2 = 20 + 1: 10 + 3: 30 (via 1) + 4: 40
    expect(d.census.current).toBe(true);
  });
  it('a census exception with no slice row is listed, never silently dropped', async () => {
    const K7 = await K7P;
    const d = K7.buildK7({ adoptionId: 'adoption-x', census, groups: SL.CLAUSE_GROUPS, slice: fixtureSlice() });
    expect(d.missing_from_slice).toEqual(['RD 99']);
    expect(d.join.census_not_in_slice).toEqual(['RD 99']);
    expect(K7.renderK7Markdown(d)).toMatch(/Missing from the slice in the top 30: RD 99/);
  });
  it('units are counted per list group; a census with no positive denominator is refused', async () => {
    const K7 = await K7P;
    const d = K7.buildK7({ adoptionId: 'adoption-y', census, groups: SL.CLAUSE_GROUPS, slice: fixtureSlice() });
    expect(d.exceptions.find((e: Json) => e.exception === 1).groups).toEqual({ PBS: 1, SSP: 2 });
    expect(d.census.current).toBe(false);
    expect(() => K7.buildK7({ adoptionId: 'a', census: { ...census, excepted: { lots: 0 } }, groups: [], slice: fixtureSlice() })).toThrow(/census_invalid/);
  });
});
