// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §6 (regulation_id, clauses[], unit id
//            `regulation_id#clause_path`, verified_against_sha256), §6.4 rules 6 + 11, §6.5 (unit table,
//            number words, anti-vacuity exclusions), §9 G-TEXT (every reason code + good twin; source
//            defects counted, never failures), §10 stage 2 (Slice);
//            docs/specs/01-pipeline/69_mcbylaw_policy.md M-2; docs/reports/mcbylaw-phase1-plan.md S4
//
// S4 unit tests: the clause parser (four by-law levels, references are not divisions), the
// case-insensitive definition matcher and the numbering-sequence check, the literal / tag /
// cross-reference extractors, the anti-vacuity scan, and one known-bad fixture per G-TEXT reason
// code plus its good twin. Offline and pure.
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
// A missing module fails every test that uses it (red-first evidence records per-test failures), never silently passes.
const load = (rel: string): Promise<Json> => import(pathToFileURL(path.join(process.cwd(), rel)).href).catch((err: unknown) => ({ importError: String(err) }));
const SL = await load('scripts/analysis/bylaw/slice.mjs');
const ST = await load('scripts/analysis/bylaw/standardized.mjs');

const paths = (text: string, root = '(1)') => SL.parseClauses(text, root).nodes.map((n: Json) => n.path);

describe('clause parser (1.20.1(2): (25) · (A) · (i) · (a))', () => {
  it('nests four levels and partitions the verbatim exactly', () => {
    const t = '(2) Height (A) the height is: (i) for a lot: (a) 10.0 metres; and (b) 11.0 metres; or (ii) 12.0 metres; and (B) 13.0 metres.';
    const { nodes } = SL.parseClauses(t, '(2)');
    expect(nodes.map((n: Json) => n.path)).toEqual(['(2)', '(2)(A)', '(2)(A)(i)', '(2)(A)(i)(a)', '(2)(A)(i)(b)', '(2)(A)(ii)', '(2)(B)']);
    expect(nodes.map((n: Json) => t.slice(n.start, n.end)).join('')).toBe(t);
    expect(nodes.filter((n: Json) => n.leaf).map((n: Json) => n.path)).toEqual(['(2)(A)(i)(a)', '(2)(A)(i)(b)', '(2)(A)(ii)', '(2)(B)']);
  });

  it('a reference is not a division: "(A) and (B) above", "(a) to (d) above", "600.60.40(3)(B) and (C)"', () => {
    expect(paths('(1) X (A) one; and (B) despite (A) and (B) above, two.')).toEqual(['(1)', '(1)(A)', '(1)(B)']);
    expect(paths('(1) X (A) a; (B) b; (C) b complies with (a) to (d) above.')).toEqual(['(1)', '(1)(A)', '(1)(B)', '(1)(C)']);
    expect(paths('(1) X subject to regulations 600.60.40(3)(B) and (C) here.')).toEqual(['(1)']);
    expect(paths('(2) Numbering (25) [bracketed numeral] (A) [bracketed upper-case letter]', '(2)')).toEqual(['(2)']);
  });

  it('a list break eaten by a garbled character still separates siblings (600.60.40(3)(A) "(©")', () => {
    expect(paths('(3) Conversion (A) subject to regulations 600.60.40(3)(B) and (© (B) Despite x; (C) y', '(3)')).toEqual(['(3)', '(3)(A)', '(3)(B)', '(3)(C)']);
  });

  it('the lower-case letter (i) after (h) is a letter, not a Roman numeral', () => {
    const t = '(1) X (A) y: (i) z: (a) a; (b) b; (c) c; (d) d; (e) e; (f) f; (g) g; (h) h; (i) i; (j) j.';
    expect(paths(t).slice(-3)).toEqual(['(1)(A)(i)(h)', '(1)(A)(i)(i)', '(1)(A)(i)(j)']);
  });

  it('a repeated division (a table, duplicated City text) is disclosed and kept in the preceding leaf', () => {
    const r = SL.parseClauses('(1) Rates (A) in Zone A 1.0; and (B) in Zone B 2.0. (A) in Zone A 3.0; and (B) in Zone B 4.0.', '(1)');
    expect(r.nodes.map((n: Json) => n.path)).toEqual(['(1)', '(1)(A)', '(1)(B)']);
    expect(r.repeats.length).toBe(2);
  });

  it('"(I)" where (i) is due is read as (i) and logged as a marker typo (230.5.1.10(4))', () => {
    const r = SL.parseClauses('(4) X (A) is: (I) length of 2.4 metres; (ii) width of 1.0 metres.', '(4)');
    expect(r.nodes.map((n: Json) => n.path)).toEqual(['(4)', '(4)(A)', '(4)(A)(i)', '(4)(A)(ii)']);
    expect(r.typos).toHaveLength(1);
  });
});

describe('definition matcher + numbering-sequence check (Spec 68 §9 G-TEXT, X-9)', () => {
  const body = '(405) Landscaping means trees. (410) Lawfully Existing Means: in compliance. (415) Lot means land. (695) Residential Building includes a house. (700) Residential Care Home means care.';
  it('the case-insensitive matcher slices "(410) ... Means:" and "(695) ... includes"', () => {
    const heads = SL.definitionHeads(body, SL.DEFINITION_MATCHER);
    expect(heads.map((h: Json) => [h.n, h.term])).toEqual([[405, 'Landscaping'], [410, 'Lawfully Existing'], [415, 'Lot'], [695, 'Residential Building'], [700, 'Residential Care Home']]);
    expect(SL.numberingCheck(body, heads, { definitions: true }).unsliced).toEqual([]);
  });
  it('an article whose (1) the slicer refuses never collapses silently: the head is reported unsliced', () => {
    const page = ST.fixturePage({ articles: [{ id: '10.20.40.10', title: 'Height', text: 'In this article (1) Height The height is 10.0 metres.' }] });
    const s = SL.sliceSnapshot({ pages: [page] });
    expect(s.rows.map((r: Json) => r.regulation_id)).toEqual(['10.20.40.10#article']);
    expect(s.numbering.unsliced.map((u: Json) => u.n)).toEqual([1]);
  });
  it('the Phase 0 matcher misses them and the numbering-sequence check names both', () => {
    const heads = SL.definitionHeads(body, SL.PHASE0_DEFINITION_MATCHER);
    expect(heads.map((h: Json) => h.n)).toEqual([405, 415, 700]);
    expect(SL.numberingCheck(body, heads, { definitions: true }).unsliced.map((u: Json) => u.n)).toEqual([410, 695]);
  });
});

describe('literal extractor (Spec 68 §6.5 unit table) and the anti-vacuity scan', () => {
  const lit = (t: string) => SL.extractLiterals(t).map((l: Json) => [l.value, l.unit]);
  it('reads value + unit on token boundaries, number words as numerals, and inherits a range unit', () => {
    expect(lit('a setback of 1.8 m and 6.0 metres')).toEqual([[1.8, 'm'], [6, 'm']]);
    expect(lit('1,200 square metres, 80 percent, 30 per cent, 25% and 2 storeys')).toEqual([[1200, 'm2'], [80, 'pct'], [30, 'pct'], [25, 'pct'], [2, 'storeys']]);
    expect(lit('five or six dwelling units')).toEqual([[5, 'units'], [6, 'units']]);
    expect(lit('between 1.0 to 1.5 metres above grade')).toEqual([[1, 'm'], [1.5, 'm']]);
    expect(lit('twenty-five vehicles')).toEqual([[25, null]]);
    expect(lit('5, 10 or 15 metres')).toEqual([[5, 'm'], [10, 'm'], [15, 'm']]); // review lens: chains of three inherit
  });
  it('ids, by-law numbers, dates, zone labels, map numbers, statute citations and tags are not literals', () => {
    expect(lit('regulation 10.20.40.70(3) of By-law 569-2013 enacted May 9, 2013, label RD (f12.0; a370) (x5), Diagram 2, R.S.O. 1990, c. P.13 [ By-law: 654-2025 ]')).toEqual([]);
  });
  it('every digit run and number word is covered; a dropped literal is reported uncovered', () => {
    const t = 'The minimum side yard is 1.2 metres for five units under regulation 10.5.40.70(1) [ By-law: 1-2020 ].';
    expect(SL.scanNumbers(t).uncovered).toEqual([]);
    const lits = SL.extractLiterals(t).filter((l: Json) => l.value !== 5);
    expect(SL.scanNumbers(t, lits).uncovered.map((u: Json) => u.token)).toEqual(['five']);
  });
});

describe('tag and cross-reference extractors', () => {
  it('tags: every form, split into by-law entries with qualifiers', () => {
    const tags = SL.extractTags('x. [ By-law: 1062-2025(OLT); 608-2024 ] y [By-law: 1-2020] z [103-2016] w [Deleted] v [ ]');
    expect(tags.map((t: Json) => t.entries.map((e: Json) => [e.bylaw, e.qualifier]))).toEqual([
      [['1062-2025', '(OLT)'], ['608-2024', null]],
      [['1-2020', null]],
      [['103-2016', null]],
    ]);
  });
  it('refs: continuation siblings, level-aligned replacement, ranges; refs inside tags skipped', () => {
    const t = 'comply with regulations 10.80.30.10(1) and (2), 600.60.40(3)(B) and (C), 10.10.40.70(1) to (4), Section 600.60 and Chapter 800 [ By-law: 1-2020 ]';
    const refs = SL.extractRefs(t, SL.extractTags(t)).map((r: Json) => [r.citation, r.via]);
    expect(refs).toEqual([
      ['10.80.30.10(1)', 'direct'], ['10.80.30.10(2)', 'and'],
      ['600.60.40(3)(B)', 'direct'], ['600.60.40(3)(C)', 'and'],
      ['10.10.40.70(1)', 'direct'], ['10.10.40.70(4)', 'range_to'],
      ['600.60', 'direct'], ['Chapter 800', 'direct'],
    ]);
  });
});

describe('slicePage: rows, units, tags bound to their clause, retired and carve-in pages', () => {
  const art = [
    { id: '10.20.40.10', title: 'Height', text: '(1) Maximum Height The permitted maximum height is 10.0 metres. [ By-law: 1-2020 ]' },
    { id: '10.20.40.70', title: 'Setbacks', text: '(1) Side Yard The setback is: (A) 0.9 metres; and (B) 1.2 metres. [ By-law: 2-2021 ]' },
  ];
  it('regulation_id / clause path / unit id; the tag binds to the clause it follows; units are sha-pinned', () => {
    const s = SL.sliceSnapshot({ pages: [ST.fixturePage({ articles: art })] });
    expect(s.rows.map((r: Json) => r.regulation_id)).toEqual(['10.20.40.10(1)', '10.20.40.70(1)']);
    expect(s.units.map((u: Json) => u.unit_id)).toEqual(['10.20.40.10(1)#(1)', '10.20.40.70(1)#(1)(A)', '10.20.40.70(1)#(1)(B)']);
    expect(s.units.map((u: Json) => u.citation)).toEqual(['10.20.40.10(1)', '10.20.40.70(1)(A)', '10.20.40.70(1)(B)']);
    expect(s.rows[1].tags[0].clause_path).toBe('(1)(B)');
    expect(s.rows[1].literals.map((l: Json) => [l.clause_path, l.value])).toEqual([['(1)(A)', 0.9], ['(1)(B)', 1.2]]);
    const b = s.units[2];
    expect(b.context).toEqual(['(1) Side Yard The setback is:']);
    expect(b.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
  it('a lead-in edit stales its leaves: the unit sha covers the ancestor lead-ins', () => {
    const a = SL.sliceSnapshot({ pages: [ST.fixturePage({ articles: art })] }).units[2].sha256;
    const h = art[0] as Json;
    const sb = art[1] as Json;
    const art2 = [h, { ...sb, text: String(sb.text).replace('The setback is:', 'The setback is not:') }];
    const b = SL.sliceSnapshot({ pages: [ST.fixturePage({ articles: art2 })] }).units[2].sha256;
    expect(b).not.toBe(a);
  });
  it('a retired page is sliced with its rows marked retired; a carve-in page slices only its carve-in articles', () => {
    const retired = SL.sliceSnapshot({ pages: [ST.fixturePage({ articles: art, status: 'retired', ruling: 'operator S3 2026-10-07' })] });
    expect(retired.rows.every((r: Json) => r.retired && r.retired_ruling === 'operator S3 2026-10-07')).toBe(true);
    const carve = SL.sliceSnapshot({ pages: [ST.fixturePage({ articles: art, carve_in: ['10.20.40.70'] })] });
    expect(carve.rows.map((r: Json) => r.regulation_id)).toEqual(['10.20.40.70(1)']);
    expect(carve.spans.ch10_20.some((x: Json) => x.kind === 'outside_carve_in')).toBe(true);
  });
  it('is deterministic: two runs serialize byte-identically', () => {
    const run = () => JSON.stringify(SL.sliceSnapshot({ pages: [ST.fixturePage({ articles: art })] }));
    expect(run()).toBe(run());
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
    for (const code of ['duplicate_id', 'slice_mismatch', 'clauses_not_concatenating', 'page_not_covered', 'span_overlap', 'unsliced_head', 'heading_not_found', 'carve_in_not_found', 'empty_article', 'text_before_first_regulation', 'lock_missing', 'lock_stale', 'count_mismatch']) {
      expect(reasons.has(code)).toBe(true);
    }
  });
  it('a source defect is a counted disclosure, never a failure', () => {
    const page = ST.fixturePage({ articles: [{ id: '10.20.40.10', title: 'Height', text: '(1) Maximum Height A zoning by\u0002law value of 10.0 metres.' }] });
    const slice = SL.sliceSnapshot({ pages: [page] });
    const expectBind = { adoption_id: 'adoption-1', normalizer_version: 'norm-v1' };
    const r = ST.checkTextSlice({ slice, pages: { ch10_20: page.normalized }, lock: ST.buildSliceLock(slice, expectBind), expect: expectBind });
    expect(r.violations).toEqual([]);
    expect(r.pass).toBe(true);
    expect(r.disclosures.source_defect_by_kind).toEqual({ garbled_character: 1 });
  });
});
