// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §9 G-TEXT (real snapshot: counts equal the lock;
//            coverage; clause-cell set; every-level numbering; variants), G-UNIVERSE (unconsolidated list), §6 (unit
//            shas), §10 (determinism: LF, sorted keys); docs/specs/01-pipeline/69_mcbylaw_policy.md M-36, M-37, M-47,
//            M-57 (operator rulings R1–R5 + page set, 2026-10-07); docs/reports/mcbylaw-phase1-plan.md S4 (rework)
//
// S4 locks over the COMMITTED snapshot (adoption-2) and enacting captures, offline: G-TEXT passes, the
// generated slice.lock.json regenerates byte-identically, and each audit class the rework closes (A–F,
// .cursor/mcbylaw/completeness-audit/REPORT.md) is pinned on the real text.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module / seed JSON
// A missing module fails every test that uses it (red-first evidence records per-test failures), never silently passes.
const load = (rel: string): Promise<Json> => import(pathToFileURL(path.join(process.cwd(), rel)).href).catch((err: unknown) => ({ importError: String(err) }));
const SEEDS = path.join(process.cwd(), 'scripts/seeds/bylaw');
const ST = await load('scripts/analysis/bylaw/standardized.mjs');
const SNAP = await load('scripts/analysis/bylaw/snapshot.mjs');
const UC = await load('scripts/analysis/bylaw/unconsolidated.mjs');
const readJson = (f: string): Json => JSON.parse(fs.readFileSync(path.join(SEEDS, f), 'utf8'));
const sliced: Json = ST.sliceSeeds ? ST.sliceSeeds(SEEDS) : { slice: { defects: [], numbering: { gaps: [], unproven: [] }, pages: {}, rows: [], units: [] } };
const slice: Json = sliced.slice;
const unit = (id: string): Json => slice.units.find((u: Json) => u.unit_id === id) || {};
const row = (id: string): Json => slice.rows.find((r: Json) => r.regulation_id === id) || {};

describe('G-TEXT on the committed snapshot (adoption-3)', () => {
  it('passes with no violations', () => {
    const r = ST.checkText({ seeds: SEEDS });
    expect(r.violations).toEqual([]);
    expect(r.pass).toBe(true);
    expect(r.checked).toBeGreaterThan(1200);
  });
  it('slice.lock.json is generated: it equals an in-memory regeneration, LF, sorted keys', () => {
    const text = fs.readFileSync(path.join(SEEDS, 'slice.lock.json'), 'utf8');
    const m = readJson('manifest.json');
    expect(m.adoption_id).toBe('adoption-3'); // adoption-3 re-pins the page-set metadata edit of the S4 integration (same page bytes)
    expect(text.includes('\r')).toBe(false);
    expect(text).toBe(SNAP.stableStringify(ST.buildSliceLock(slice, { adoption_id: m.adoption_id, normalizer_version: m.normalizer_version })));
  });
  it('R1: every clause cell of every sliced article is a sliced cell node (both directions), on every page', () => {
    for (const [k, c] of Object.entries(slice.pages) as [string, Json][]) if (!k.startsWith('enacting:')) expect([k, c.cells_sliced]).toEqual([k, c.cells_html]);
    expect((Object.values(slice.pages) as Json[]).reduce((s: number, c: Json) => s + c.cells_html, 0)).toBeGreaterThan(3000);
  });
  it('R3: no unproven gap; the proven gaps outside the sparse 800.50 numbering are the 7 true source gaps', () => {
    expect(slice.numbering.unproven).toEqual([]);
    const g = slice.numbering.gaps.filter((x: Json) => x.key !== 'ch800_50').map((x: Json) => `${x.article}(${x.missing})`).sort();
    expect(g).toEqual(['10.10.20.100(7)', '10.20.20.100(7)', '10.40.20.100(7)', '10.60.20.100(7)', '150.10.20.1(3)', '230.5.10.1(2)', '5.10.40.1(5)']);
  });
});

describe('the completeness-audit classes, closed on the real text', () => {
  it('A — a clause with no punctuation before its marker is its own unit (200.5.1.10(3)(B), 150.5.20.1(2)(A)(iii))', () => {
    expect(unit('200.5.1.10(3)#(3)(B)').text).toBe('(B) width of 3.2 metres');
    expect(unit('150.5.20.1(2)#(2)(A)(iii)').text).toMatch(/^\(iii\) obtaining physical goods/);
  });
  it('B — Table 200.5.10.1 is row-correct: secondary suite "None", multi-tenant 0.34 per room, visitor rates', () => {
    expect(unit('200.5.10.1(1)#(1)[T2.R5.C2]')).toMatchObject({ text: 'None' });
    expect(unit('200.5.10.1(1)#(1)[T2.R5.C2]').context.slice(-2)).toEqual(['[row] Secondary Suite', '[column] Parking Rate']);
    expect(unit('200.5.10.1(1)#(1)[T2.R6.C2](C)').text).toMatch(/minimum rate of 0\.34 for each dwelling room/);
    expect(unit('200.5.10.1(1)#(1)[T2.R7.C2](A)').text).toMatch(/2\.0 plus 0\.01 per dwelling unit/);
  });
  it('B — Table 970.10.15.5 has its 90 land-use rows, each rate under its row and grouped column header', () => {
    const rows970 = slice.units.filter((u: Json) => u.regulation_id === '970.10.15.5(5)' && /\[T2\.R\d+\.C1\]$/.test(u.clause_path));
    expect(rows970.length).toBe(90);
    expect(unit('970.10.15.5(5)#(5)[T2.R3.C5]').context.slice(-2)).toEqual(['[row] Adult Education School', '[column] Parking Occupancy Rate / Eve']);
  });
  it('C — a table without lists keeps its row/column pairing (220.5.10.1(3) loading spaces)', () => {
    const cells = slice.units.filter((u: Json) => u.regulation_id === '220.5.10.1(3)' && u.origin === 'table_cell');
    expect(cells.length).toBeGreaterThan(10);
    for (const u of cells) expect(u.context.some((c: string) => c.startsWith('[row] '))).toBe(true);
  });
  it('D — duplicate numbering is never merged: 200.15.1(1) 3.9 m and its Under Appeal variant 3.4 m; 1.40.15(3)(A) OLT variant', () => {
    expect(unit('200.15.1(1)#(1)(B)').text).toMatch(/3\.9 metres/);
    expect(unit('200.15.1(1)~under_appeal#(1)~under_appeal(B)').text).toMatch(/3\.4 metres/);
    expect(row('200.15.1(1)~under_appeal')).toMatchObject({ variant_of: '200.15.1(1)', variant_status: 'under_appeal' });
    expect(unit('1.40.15(3)#(3)(A)~tribunal_order').text).toMatch(/townhouses/);
  });
  it('E — 1075-2026 is captured and sliced; the regulations it replaces point at their enacting rows', () => {
    const caps = readJson('enacting/manifest.json').captures;
    for (const b of ['1075-2026', '206-2026', '650-2026']) expect(caps[b].url).toMatch(/^https:\/\/www\.toronto\.ca\/legdocs\/bylaws\/2026\/law\d{4}\.pdf$/);
    expect(caps['1075-2026'].pdf_sha256).toBe('c7f2c35cd474ddba1ecdde74f3d52fe57e43e420acf16b56b8acfe0037607d00');
    expect(caps['206-2026'].pdf_sha256).toBe('3a082172512d92f9ad0ae8bb4ff03e595f5a31e9c3384a7fa9d2783d38470809');
    expect(caps['650-2026'].pdf_sha256).toBe('6b71d71984bd0856070c30df663cb5260ccefa08bf3978b8da8e7a08275bdac7');
    for (const id of ['10.5.40.60(4)', '5.10.75.1(2)', '150.8.60.60(7)', '10.5.60.20(10)']) expect(row(id).current_source).toBe(`${id}@1075-2026`);
    expect(row('10.5.40.60(4)@1075-2026')).toMatchObject({ action: 'replacing', kind: 'enacting_amendment', page: 'enacting:1075-2026' });
    expect(row('10.5.40.60(4)@1075-2026').verbatim).toMatch(/maximum of 0\.3 metres/);
  });
  it('E (R5) — the City\'s not-yet-consolidated list is recorded; open items are the listed by-laws citing pinned regulations', () => {
    const rec = readJson('unconsolidated.json');
    expect(rec.url).toBe(UC.UNCONSOLIDATED_URL);
    expect(rec.page_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(rec.bylaws.map((b: Json) => b.bylaw)).toEqual(expect.arrayContaining(['1075-2026', '206-2026', '650-2026']));
    const r = UC.checkUnconsolidated({ seeds: SEEDS });
    expect(r.items).toEqual([]);
    expect(r.pass).toBe(true);
  });
  it('E (R5 follow-up) — the five site-specific by-laws are captured; their sliced amendments are overlay-map changes only', () => {
    const caps = readJson('enacting/manifest.json').captures;
    const five = ['1018-2026', '1207-2026', '262-2026', '63-2024', '842-2025'];
    for (const b of five) expect(caps[b].pdf_sha256).toMatch(/^[0-9a-f]{64}$/);
    const rows = slice.rows.filter((r: Json) => five.some((b) => r.page === `enacting:${b}`));
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.section.startsWith('995.')).toBe(true); // overlay maps; no pinned regulation's text
    expect(slice.rows.filter((r: Json) => (r.amended_by || []).some((a: Json) => five.includes(a.bylaw)))).toEqual([]);
  });
  it('F — 600.10 and 600.50 are pinned RETIRED with closed reasons; Ch.500 is recorded empty once (universe page rule)', () => {
    const ps = readJson('page-set.json');
    for (const k of ['ch600_10', 'ch600_50']) {
      expect(ps.pages.find((p: Json) => p.key === k)).toMatchObject({ status: 'retired' });
      const rows = slice.rows.filter((r: Json) => r.page === k);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r: Json) => r.retired)).toBe(true);
    }
    const u = readJson('universe.json');
    expect(u.page_rules.find((r: Json) => r.entry === '500')).toMatchObject({ level: 'chapter', reason: 'chapter_empty' }); // one record (S5 M-56)
    expect(ps.excluded_by_ruling).toEqual([]);
    expect(u.page_rules.some((r: Json) => ['600.10', '600.50'].includes(r.entry))).toBe(false); // pinned now: page_status rules, not page rules
  });
});

describe('one source for the slicer configuration: vocab.json `slicer` (Spec 69 M-56)', () => {
  it('no slicer module keeps a copy of the definition sections, unit table, allowed characters or exclusion patterns', () => {
    const files = ['slice.mjs', 'text.mjs', 'html.mjs', 'standardized.mjs', 'unconsolidated.mjs'].map((f) => fs.readFileSync(path.join(process.cwd(), 'scripts/analysis/bylaw', f), 'utf8').replace(/^\s*(\/\/|\*).*$/gm, ''));
    const copies: [string, RegExp][] = [
      ['definition section literal', /['"]800\.50['"]/],
      ['unit table entry', /['"]square metres['"]/],
      ['allowed extra characters', /çé²|\\u00e7/],
      ['statute citation pattern', /R\\\.S\\\.O/],
      ['date month pattern', /January\|February/],
      ['encoding dash literal', /\\u0096/],
    ];
    for (const src of files) for (const [what, re] of copies) expect([what, re.test(src)]).toEqual([what, false]);
    const v = readJson('vocab.json').slicer;
    expect(v.anti_vacuity_exclusions.map((x: Json) => x.kind)).toEqual(expect.arrayContaining(['statute_citation', 'label_code']));
  });
});

describe('extractors on the real text', () => {
  it('anti-vacuity: every digit run and number word in every row is a literal or a declared exclusion', () => {
    expect(slice.rows.length).toBeGreaterThan(1200); // never vacuous
    expect(slice.rows.flatMap((r: Json) => r.uncovered_numbers.map((u: Json) => `${r.regulation_id}: ${u.token} | ${u.context}`))).toEqual([]);
  });
  it('800.50: 203 defined terms, incl. (410) Lawfully Existing and (695) Residential Building', () => {
    expect(slice.pages.ch800_50.definitions).toBe(203);
    expect(row('800.50(410)').term).toBe('Lawfully Existing');
    expect(row('800.50(695)').term).toBe('Residential Building');
  });
  it('600.60.40(3): the (A) garble and the (C) omission are disclosed source defects', () => {
    expect(slice.defects.filter((x: Json) => x.regulation_id === '600.60.40(3)').map((x: Json) => [x.clause_path, x.kind])).toEqual([['(3)(A)', 'garbled_character'], ['(3)(C)', 'lead_in_without_items']]);
  });
});
