// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §6 (regulation_id, clauses[], unit id
//            `regulation_id#clause_path`, verified_against_sha256), §6.4 rule 6, §6.5 (unit table, number words,
//            anti-vacuity exclusions), §9 G-TEXT (structure from the HTML; unit set == clause cells + declared inline
//            splits; every-level numbering; variants; source defects counted), G-UNIVERSE (unconsolidated list),
//            §10 stage 2; docs/specs/01-pipeline/69_mcbylaw_policy.md M-2, M-36, M-57 (operator rulings R1–R5,
//            2026-10-07); docs/reports/mcbylaw-phase1-plan.md S4 (rework)
//
// S4 unit tests, one block per operator rule: R1 clause cells + table depth (text only inside one cell), R2 data
// tables keyed (table, row, column), R3 a gap fails unless the page proves it absent, R4 status-tagged variants,
// R5 enacting amendments + the unconsolidated list; plus the extractors and one known-bad fixture per G-TEXT code.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
// A missing module fails every test that uses it (red-first evidence records per-test failures), never silently passes.
const load = (rel: string): Promise<Json> => import(pathToFileURL(path.join(process.cwd(), rel)).href).catch((err: unknown) => ({ importError: String(err) }));
const SL = await load('scripts/analysis/bylaw/slice.mjs');
const ST = await load('scripts/analysis/bylaw/standardized.mjs');
const HT = await load('scripts/analysis/bylaw/html.mjs');
const UC = await load('scripts/analysis/bylaw/unconsolidated.mjs');
const SNAP = await load('scripts/analysis/bylaw/snapshot.mjs');

const page = (articles: Json[], extra: Json = {}) => ST.fixturePage({ articles, ...extra });
const sliceOf = (pages: Json[]) => SL.sliceSnapshot({ pages });
const unitIds = (s: Json) => s.units.map((u: Json) => u.unit_id);

describe('normalizeWithMap: the pinned normalizer, with a raw offset per character', () => {
  it('reproduces normalize() exactly and maps characters back to the raw page', () => {
    const html = '<p>A&nbsp;<b>bold</b> &amp; “quoted” text</p><script>x</script>\n<TD>(1)</TD>';
    const { text, map } = HT.normalizeWithMap(html);
    expect(text).toBe(SNAP.normalize(html));
    expect(html[map[text.indexOf('bold')]]).toBe('b');
    expect(html.slice(map[text.indexOf('(1)')], map[text.indexOf('(1)')] + 3)).toBe('(1)');
  });
});

describe('R1 — structure from the HTML clause cells; text parsing only inside one cell', () => {
  it('nests regulation → (A) → (i) → (a) by table depth, and a reference "(B) above" splits nothing', () => {
    const s = sliceOf([page([{ id: '10.20.40.10', regs: [{ clauses: [{ clauses: [{ clauses: [{ sym: 'a', text: 'x;' }, { sym: 'b', text: 'y.' }], sym: 'i', text: 'for a lot:' }], sym: 'A', text: 'the height is:' }, { sym: 'B', text: 'despite (A) and (B) above, 9.0 metres.' }], n: 2, text: 'Lead:', title: 'Height' }], title: 'Height' }])]);
    expect(unitIds(s)).toEqual(['10.20.40.10(2)#(2)(A)(i)(a)', '10.20.40.10(2)#(2)(A)(i)(b)', '10.20.40.10(2)#(2)(B)']);
    expect(s.problems).toEqual([]);
    expect(s.pages.ch10_20.cells_html).toBe(s.pages.ch10_20.cells_sliced);
  });
  it('a clause cell with no punctuation before the next marker still splits (class A: 200.5.1.10(3)(B) width 3.2 m)', () => {
    const s = sliceOf([page([{ id: '200.5.1.10', regs: [{ clauses: [{ sym: 'A', text: 'length of 6.0 metres' }, { sym: 'B', text: 'width of 3.2 metres' }], n: 3, text: 'Dimensions', title: 'Dimensions' }], title: 'Interpretation' }], { chapter: '200', chapterTitle: 'Parking', key: 'ch200_5', section: '200.5', sectionTitle: 'Parking Spaces' })]);
    expect(s.units.map((u: Json) => [u.unit_id, u.text])).toEqual([['200.5.1.10(3)#(3)(A)', '(A) length of 6.0 metres'], ['200.5.1.10(3)#(3)(B)', '(B) width of 3.2 metres']]);
  });
  it('an inline list inside ONE cell is split and declared (origin inline); carve-in pages slice only their articles', () => {
    const s = sliceOf([page([{ id: '10.20.40.70', regs: [{ n: 1, text: 'Rates: (A) in Zone A 1.0; and (B) in Zone B 2.0.', title: 'T' }], title: 'S' }, { id: '10.20.40.80', regs: [{ n: 1, text: 'z', title: 'U' }], title: 'Sep' }], { carve_in: ['10.20.40.70'] })]);
    expect(s.units.map((u: Json) => [u.unit_id, u.origin])).toEqual([['10.20.40.70(1)#(1)(A)', 'inline'], ['10.20.40.70(1)#(1)(B)', 'inline']]);
    expect(s.spans.ch10_20.some((x: Json) => x.kind === 'outside_carve_in')).toBe(true);
  });
  it('the unit sha covers the lead-ins above a unit: a lead-in edit stales its leaves', () => {
    const mk = (lead: string) => sliceOf([page([{ id: '10.20.40.70', regs: [{ clauses: [{ sym: 'A', text: '0.9 metres;' }, { sym: 'B', text: '1.2 metres.' }], n: 1, text: lead, title: 'Side Yard' }], title: 'S' }])]).units[1].sha256;
    expect(mk('The setback is:')).not.toBe(mk('The setback is not:'));
  });
});

describe('R2 — data tables are units keyed (table, row header, column header)', () => {
  const table = '<TR><TD ALIGN=RIGHT></TD><TD><TABLE border="1"><TR><TD>Land Use Category</TD><TD>Parking Rate</TD></TR><TR><TD>Secondary Suite</TD><TD>None</TD></TR><TR><TD>Multi-tenant House</TD><TD>Parking spaces must be provided: (A) in Policy Area 1 at a minimum rate of 0; and (B) in all other areas at a minimum rate of 0.34 for each dwelling room.</TD></TR></TABLE></TD></TR>';
  const s = sliceOf([page([{ id: '200.5.10.1', regs: [{ html: table, n: 1, text: 'Parking spaces must be provided in compliance with the table below:', title: 'Parking Space Rates' }], title: 'General' }], { chapter: '200', chapterTitle: 'Parking', key: 'ch200_5', section: '200.5', sectionTitle: 'Parking Spaces' })]);
  const u = (id: string) => s.units.find((x: Json) => x.unit_id === id);
  it('each cell is a unit; its row and column headers are in its context (row-correct)', () => {
    expect(u('200.5.10.1(1)#(1)[T1.R2.C2]').text).toBe('None');
    expect(u('200.5.10.1(1)#(1)[T1.R2.C2]').context.slice(-2)).toEqual(['[row] Secondary Suite', '[column] Parking Rate']);
  });
  it('an inline list inside a cell splits under the cell and keeps the cell headers', () => {
    const b = u('200.5.10.1(1)#(1)[T1.R3.C2](B)');
    expect(b.text).toMatch(/0\.34 for each dwelling room/);
    expect(b.origin).toBe('inline');
    expect(b.context.slice(-2)).toEqual(['[row] Multi-tenant House', '[column] Parking Rate']);
  });
});

describe('R3 — a numbering gap fails unless the page proves the number absent (every level)', () => {
  it('a regulation number absent from the page is a counted gap, not a failure', () => {
    const s = sliceOf([page([{ id: '10.20.40.70', regs: [{ n: 1, text: 'a', title: 'T' }, { n: 3, text: 'c', title: 'V' }], title: 'S' }])]);
    expect(s.numbering.unproven).toEqual([]);
    expect(s.numbering.gaps.map((g: Json) => g.missing)).toEqual(['2']);
  });
  it('a number the page holds as text, not as a cell, fails', () => {
    const s = sliceOf([page([{ id: '10.20.40.70', regs: [{ n: 1, text: 'a. (2) Rear yard 7.5 metres', title: 'T' }, { n: 3, text: 'c', title: 'V' }], title: 'S' }])]);
    expect(s.numbering.unproven.map((g: Json) => g.missing)).toEqual(['2']);
  });
  it('a clause-level gap with the symbol in the text fails; the first child must be (A)', () => {
    const s = sliceOf([page([{ id: '10.20.40.70', regs: [{ clauses: [{ sym: 'A', text: 'x; (B) y;' }, { sym: 'C', text: 'z.' }], n: 1, text: 'L:', title: 'T' }], title: 'S' }])]);
    expect(s.numbering.unproven.map((g: Json) => g.missing)).toContain('B');
  });
});

describe('R3 — the first division of a list is checked too; the City\'s "(I)" typo cell reads as (i)', () => {
  it('a list starting at (B) with "(A)" in the lead-in text fails; one with no (A) anywhere is a counted gap', () => {
    const mk = (lead: string) => sliceOf([page([{ id: '10.20.40.70', regs: [{ clauses: [{ sym: 'B', text: 'x;' }, { sym: 'C', text: 'y.' }], n: 1, text: lead, title: 'T' }], title: 'S' }])]).numbering;
    expect(mk('as follows: (A) a lost clause;').unproven.map((g: Json) => g.missing)).toEqual(['A']);
    expect(mk('as follows:').gaps.map((g: Json) => g.missing)).toEqual(['A']);
  });
  it('a clause cell "(I)" under an upper-case clause is (i), disclosed as marker_typo, and the list stays gap-free', () => {
    const s = sliceOf([page([{ id: '10.20.40.70', regs: [{ clauses: [{ clauses: [{ sym: 'I', text: 'length 2.4 metres;' }, { sym: 'ii', text: 'width 1.0 metres.' }], sym: 'A', text: 'is:' }], n: 4, text: 'L:', title: 'T' }], title: 'S' }])]);
    expect(unitIds(s)).toEqual(['10.20.40.70(4)#(4)(A)(i)', '10.20.40.70(4)#(4)(A)(ii)']);
    expect(s.numbering.unproven).toEqual([]);
    expect(s.defects.map((d: Json) => d.kind)).toEqual(['marker_typo']);
  });
});

describe('R4 — a repeated division is a status-tagged variant, never merged', () => {
  it('an "Under Appeal" repeat of a regulation becomes `<id>~under_appeal` with its own units', () => {
    const s = sliceOf([page([{ id: '200.15.1', regs: [{ clauses: [{ sym: 'B', text: 'width of 3.9 metres' }], n: 1, text: 'Dims:', title: 'T' }, { clauses: [{ sym: 'B', text: 'width of 3.4 metres [ By-law: 579-2017 Under Appeal ]' }], n: 1, text: 'Dims:', title: 'T' }], title: 'General' }], { chapter: '200', chapterTitle: 'Parking', key: 'ch200_15', section: '200.15', sectionTitle: 'Accessible' })]);
    expect(s.rows.map((r: Json) => [r.regulation_id, r.variant_status ?? null])).toEqual([['200.15.1(1)', null], ['200.15.1(1)~under_appeal', 'under_appeal']]);
    expect(unitIds(s)).toContain('200.15.1(1)~under_appeal#(1)~under_appeal(B)');
    expect(s.numbering.gaps.length + s.numbering.unproven.length).toBeGreaterThanOrEqual(0);
  });
  it('a tribunal-order repeat is tagged; an unstatused repeat with the same numbers is a disclosed duplicate', () => {
    const s = sliceOf([page([{ id: '10.20.40.70', regs: [{ clauses: [{ sym: 'A', text: 'RA zone.' }, { sym: 'A', text: 'RA zone and townhouses. [ By-law: 414-2024(OLT) ]' }, { sym: 'B', text: 'RAC zone.' }, { sym: 'B', text: 'RAC zone.' }], n: 3, text: 'Purpose:', title: 'T' }], title: 'S' }])]);
    expect(unitIds(s)).toEqual(['10.20.40.70(3)#(3)(A)', '10.20.40.70(3)#(3)(A)~tribunal_order', '10.20.40.70(3)#(3)(B)', '10.20.40.70(3)#(3)(B)~unstatused']);
    expect(s.problems).toEqual([]);
    expect(s.defects.map((d: Json) => d.kind)).toContain('variant_duplicate');
  });
  it('an unstatused repeat with different numbers fails (200.15.1(1)(B) 3.9 m vs 3.4 m)', () => {
    const s = sliceOf([page([{ id: '200.15.1', regs: [{ clauses: [{ sym: 'B', text: 'width of 3.9 metres' }, { sym: 'B', text: 'width of 3.4 metres' }], n: 1, text: 'Dims:', title: 'T' }], title: 'G' }], { chapter: '200', chapterTitle: 'Parking', key: 'ch200_15', section: '200.15', sectionTitle: 'Accessible' })]);
    expect(s.problems.some((p: string) => p.startsWith('unstatused_variant:'))).toBe(true);
  });
});

describe('R5 — enacted, not yet consolidated: enacting amendments and the City list', () => {
  const scope = { carve: new Map([['80.5', new Set(['80.5.40.40'])]]), sections: new Set(['10.5', '80.5', '800.50']) };
  const text = '1. The words highlighted ... 2. Zoning By-law 569-2013, as amended, is further amended by deleting the number "0.15" in regulation 10.5.40.60(4)(A) and replacing it with "0.3", so that regulation 10.5.40.60(4) reads: (4) Exterior Main Wall Surface In the Residential Zone category, cladding may encroach a maximum of 0.3 metres. 3. Zoning By-law 569-2013, as amended, is further amended by replacing regulation 30.20.40.60(4), so that it reads: (4) In the CL zone 0.9 metres. 4. Zoning By-law 569-2013, as amended, is further amended by deleting the word "and" at the end of regulation 10.5.40.40(3)(C), and adding a new regulation 10.5.40.40(3)(E), so that it reads: (E) cladding added. 5. Zoning By-law 569-2013, as amended, is further amended by deleting regulation 10.5.60.20(10). Enacted and passed on July 30, 2026.';
  const r = SL.sliceEnacting ? SL.sliceEnacting({ bylaw: '1075-2026', scope, text }) : { rows: [], skipped: [] };
  it('each section on a pinned in-scope article is a row; others are skipped with a reason', () => {
    expect(r.rows.map((x: Json) => [x.regulation_id, x.action, x.target])).toEqual([
      ['10.5.40.60(4)@1075-2026', 'replacing', '10.5.40.60(4)'],
      ['10.5.40.40(3)(E)@1075-2026', 'adding', '10.5.40.40(3)(E)'],
      ['10.5.60.20(10)@1075-2026', 'deleting', '10.5.60.20(10)'],
    ]);
    expect(r.skipped.map((x: Json) => [x.target, x.reason])).toEqual([['30.20.40.60(4)', 'target_not_pinned_in_scope']]);
    expect(r.rows[0].verbatim.startsWith('2. Zoning By-law 569-2013')).toBe(true);
    expect(text.slice(r.rows[0].start, r.rows[0].end)).toBe(r.rows[0].verbatim);
  });
  it('a replaced or deleted regulation points its consolidation row at the enacting row (current_source)', () => {
    const rows = [{ page: 'ch10_5', regulation_id: '10.5.40.60(4)' }, { page: 'ch10_5', regulation_id: '10.5.40.40(3)' }, { page: 'ch10_5', regulation_id: '10.5.60.20(10)' }];
    SL.applyAmendments(rows, r.rows);
    expect(rows.map((x: Json) => [x.regulation_id, x.current_source ?? null, (x.amended_by || []).length])).toEqual([
      ['10.5.40.60(4)', '10.5.40.60(4)@1075-2026', 1],
      ['10.5.40.40(3)', null, 1],
      ['10.5.60.20(10)', '10.5.60.20(10)@1075-2026', 1],
    ]);
  });
  it('the City list page names linked PDFs and "By-law NNN-YYYY" mentions (never 569-2013)', () => {
    const html = '<p>Zoning By-law 569-2013. <a href="https://www.toronto.ca/legdocs/bylaws/2026/law1075.pdf">By-law 1075-2026</a>, and By-law 595-2022 appeals.</p>';
    expect(UC.parseUnconsolidated(html).map((b: Json) => [b.bylaw, b.linked])).toEqual([['1075-2026', true], ['595-2022', false]]);
    expect(UC.citedPinned('regulation 10.5.40.10(1) and 80.5.40.60(2) and 80.5.40.40(1) and 30.5.1', scope)).toEqual(['10.5.40.10', '80.5.40.40']);
  });
  it('a listed by-law citing a pinned regulation is a G-UNIVERSE item until captured', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uc-'));
    fs.mkdirSync(path.join(dir, 'enacting'));
    fs.writeFileSync(path.join(dir, 'enacting', 'manifest.json'), JSON.stringify({ captures: { '1075-2026': {} } }));
    const rec = { bylaws: [{ bylaw: '1075-2026', cites_pinned: ['10.5.40.60'], linked: true }, { bylaw: '1018-2026', cites_pinned: ['10.5.40.40'], linked: true }, { bylaw: '635-2026', cites_pinned: [], linked: true }], fetched_at: '2026-10-07T00:00:00.000Z', page_sha256: 'a'.repeat(64), url: UC.UNCONSOLIDATED_URL };
    fs.writeFileSync(path.join(dir, 'unconsolidated.json'), JSON.stringify(rec));
    const res = UC.checkUnconsolidated({ seeds: dir });
    expect(res.items).toEqual(['1018-2026']);
    expect(res.violations.every((v: string) => v.startsWith('unconsolidated_uncaptured:'))).toBe(true);
    fs.writeFileSync(path.join(dir, 'enacting', 'manifest.json'), JSON.stringify({ captures: { '1075-2026': {}, '1018-2026': {} } }));
    expect(UC.checkUnconsolidated({ seeds: dir }).pass).toBe(true);
    fs.rmSync(dir, { force: true, recursive: true });
  });
});

describe('literal extractor (Spec 68 §6.5 unit table) and the anti-vacuity scan', () => {
  const lit = (t: string) => SL.extractLiterals(t).map((l: Json) => [l.value, l.unit]);
  it('reads value + unit on token boundaries, number words as numerals, and inherits a range unit', () => {
    expect(lit('a setback of 1.8 m and 6.0 metres')).toEqual([[1.8, 'm'], [6, 'm']]);
    expect(lit('1,200 square metres, 80 percent, 30 per cent, 25% and 2 storeys')).toEqual([[1200, 'm2'], [80, 'pct'], [30, 'pct'], [25, 'pct'], [2, 'storeys']]);
    expect(lit('five or six dwelling units')).toEqual([[5, 'units'], [6, 'units']]);
    expect(lit('between 1.0 to 1.5 metres above grade')).toEqual([[1, 'm'], [1.5, 'm']]);
    expect(lit('5, 10 or 15 metres')).toEqual([[5, 'm'], [10, 'm'], [15, 'm']]);
  });
  it('ids, by-law numbers, dates, zone labels, map numbers, statute citations, street numbers and tags are not literals', () => {
    expect(lit('regulation 10.20.40.70(3) of By-law 569-2013 enacted May 9, 2013, label RD (f12.0; a370) (x5), Diagram 2, R.S.O. 1990, c. P.13, 25R Queens Quay [ By-law: 654-2025 ]')).toEqual([]);
  });
  it('every digit run and number word is covered; a dropped literal is reported uncovered', () => {
    const t = 'The minimum side yard is 1.2 metres for five units under regulation 10.5.40.70(1) [ By-law: 1-2020 ].';
    expect(SL.scanNumbers(t).uncovered).toEqual([]);
    expect(SL.scanNumbers(t, SL.extractLiterals(t).filter((l: Json) => l.value !== 5)).uncovered.map((u: Json) => u.token)).toEqual(['five']);
  });
  it('tags and cross-references', () => {
    expect(SL.extractTags('x. [ By-law: 1062-2025(OLT); 608-2024 ] y [103-2016] w [Deleted]').map((t: Json) => t.entries.map((e: Json) => [e.bylaw, e.qualifier]))).toEqual([[['1062-2025', '(OLT)'], ['608-2024', null]], [['103-2016', null]]]);
    const t = 'comply with regulations 10.80.30.10(1) and (2), 600.60.40(3)(B) and (C), 10.10.40.70(1) to (4)';
    expect(SL.extractRefs(t).map((r: Json) => [r.citation, r.via])).toEqual([['10.80.30.10(1)', 'direct'], ['10.80.30.10(2)', 'and'], ['600.60.40(3)(B)', 'direct'], ['600.60.40(3)(C)', 'and'], ['10.10.40.70(1)', 'direct'], ['10.10.40.70(4)', 'range_to']]);
  });
});

describe('G-TEXT: one known-bad fixture per reason code, each with its good twin', () => {
  it('selfTest() passes: every known-bad fixture fails for its own reason, every good twin passes', () => {
    const r = ST.selfTest();
    expect(r.results.filter((x: Json) => !x.ok).map((x: Json) => x.name)).toEqual([]);
    expect(r.pass).toBe(true);
  });
  it('the fixture set covers every G-TEXT reason code the module declares', () => {
    const reasons = new Set(ST.FIXTURES.map((f: Json) => f.reason).filter(Boolean));
    for (const code of ['duplicate_id', 'slice_mismatch', 'clauses_not_concatenating', 'page_not_covered', 'span_overlap', 'numbering_gap_unproven', 'unstatused_variant', 'cell_set_mismatch', 'inline_split_undeclared', 'lock_missing', 'lock_stale', 'count_mismatch']) {
      expect(reasons.has(code)).toBe(true);
    }
  });
  it('is deterministic: two slices serialize byte-identically', () => {
    const run = () => JSON.stringify(sliceOf([page([{ id: '10.20.40.70', regs: [{ n: 1, text: 'x 1.2 metres', title: 'T' }], title: 'S' }])]));
    expect(run()).toBe(run());
  });
});
