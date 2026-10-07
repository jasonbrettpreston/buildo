// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §9 G-TEXT (real snapshot: per-page counts
//            equal the lock; coverage; numbering sequence; source defects disclosed), §6 (unit shas),
//            §6.4 rules 1 + 6 + 11, §10 (determinism: LF, sorted keys);
//            docs/specs/01-pipeline/69_mcbylaw_policy.md M-47 (+ S3 notes: ch150_13 / ch970_10 sliced,
//            Ch.230 retired sections, the clause-level carve-ins); docs/reports/mcbylaw-phase1-plan.md S4
//
// S4 locks over the COMMITTED snapshot (offline): G-TEXT passes on the adopted pages, the
// generated slice.lock.json regenerates byte-identically, and the counts the plan says move
// (Phase 0: 945 rows / 200 definitions on its 18 pages) are re-measured and pinned here.
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
const readJson = (f: string): Json => JSON.parse(fs.readFileSync(path.join(SEEDS, f), 'utf8'));
const sliced = ST.sliceSeeds ? ST.sliceSeeds(SEEDS) : { slice: { rows: [], units: [], pages: {}, defects: [] } };
const slice: Json = sliced.slice;
const row = (id: string): Json => slice.rows.find((r: Json) => r.regulation_id === id);

/** Phase 0's 18 pages, as section pages (Phase 0 sliced chapter URLs; each holds the same section). */
const PHASE0_PAGES = ['ch1_5', 'ch2_1', 'ch5_10', 'ch10_5', 'ch10_10', 'ch10_20', 'ch10_40', 'ch10_60', 'ch10_80', 'ch150_5', 'ch150_7', 'ch150_8', 'ch150_10', 'ch200_5', 'ch600_5', 'ch800_50', 'ch900_1', 'ch995_10'];

describe('G-TEXT on the committed snapshot', () => {
  it('passes with no violations', () => {
    const r = ST.checkText({ seeds: SEEDS });
    expect(r.violations).toEqual([]);
    expect(r.pass).toBe(true);
    expect(r.checked).toBe(slice.rows.length);
  });

  it('slice.lock.json is generated: it equals an in-memory regeneration, LF, sorted keys', () => {
    const text = fs.readFileSync(path.join(SEEDS, 'slice.lock.json'), 'utf8');
    const m = readJson('manifest.json');
    const regen = SNAP.stableStringify(ST.buildSliceLock(slice, { adoption_id: m.adoption_id, normalizer_version: m.normalizer_version }));
    expect(text.includes('\r')).toBe(false);
    expect(text).toBe(regen);
  });

  it('every section page is sliced, the TOC root is not, ch150_13 and ch970_10 are, retired pages are marked', () => {
    const ps = readJson('page-set.json');
    const sections = ps.pages.filter((p: Json) => p.role === 'section').map((p: Json) => p.key).sort();
    expect(Object.keys(slice.pages).sort()).toEqual(sections);
    expect(slice.pages.ch1).toBeUndefined();
    expect(slice.pages.ch150_13.rows).toBeGreaterThan(0);
    expect(slice.pages.ch970_10.rows).toBeGreaterThan(0);
    for (const p of ps.pages.filter((x: Json) => x.status === 'retired')) {
      const rows = slice.rows.filter((r: Json) => r.page === p.key);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r: Json) => r.retired && r.retired_ruling === p.ruling)).toBe(true);
    }
    expect(slice.rows.filter((r: Json) => r.retired).length).toBe((Object.values(slice.pages) as Json[]).reduce((s: number, c: Json) => s + c.retired_rows, 0));
  });

  it('carve-in pages hold only the carve-in articles (M-47)', () => {
    const ps = readJson('page-set.json');
    const carve = ps.pages.filter((p: Json) => p.carve_in);
    expect(carve.flatMap((p: Json) => p.carve_in).sort()).toEqual(['15.10.40.50', '40.10.20.10', '40.10.40.10', '80.10.40.40', '80.5.40.40']);
    for (const p of carve) {
      const arts = [...new Set(slice.rows.filter((r: Json) => r.page === p.key).map((r: Json) => r.article))].sort();
      expect(arts).toEqual([...p.carve_in].sort());
    }
  });
});

describe('the counts the plan says move (Phase 0 → S4), re-measured on the same pages', () => {
  it('Phase 0 pages: 945 rows → 949 (+800.50(5), (410), (695); +150.5.60.1(1)); definitions 200 → 203', () => {
    const rows = slice.rows.filter((r: Json) => PHASE0_PAGES.includes(r.page));
    expect(rows.length).toBe(949);
    expect(slice.pages.ch800_50.definitions).toBe(203);
    expect(row('800.50(410)').term).toBe('Lawfully Existing');
    expect(row('800.50(695)').term).toBe('Residential Building');
    expect(row('800.50(5)').term).toBe('Adult Entertainment');
    expect(row('150.5.60.1(1)').verbatim).toMatch(/^\(1\) \(THIS DOES NOT CURRENTLY CONTAIN A REGULATION\)/);
  });
  it('the numbering-sequence check finds no unsliced head on any page', () => {
    expect(slice.numbering.unsliced).toEqual([]);
  });
});

describe('extractors on the real text', () => {
  it('anti-vacuity: every digit run and number word in every row is a literal or a declared exclusion', () => {
    expect(slice.rows.length).toBeGreaterThan(1000); // never vacuous
    const uncovered = slice.rows.flatMap((r: Json) => r.uncovered_numbers.map((u: Json) => `${r.regulation_id}: ${u.token} | ${u.context}`));
    expect(uncovered).toEqual([]);
  });
  it('every amendment tag in a row is extracted and bound to a clause path', () => {
    expect(slice.rows.filter((r: Json) => r.tags.length > 0).length).toBeGreaterThan(500); // never vacuous
    for (const r of slice.rows) {
      const raw = (r.verbatim.match(/\[\s*By-laws?:/g) || []).length;
      expect(r.tags.filter((t: Json) => /By-law/.test(t.raw)).length).toBe(raw);
      for (const t of r.tags) expect(r.clauses.some((c: Json) => c.path === t.clause_path)).toBe(true);
    }
  });
  it('600.60.40: the (3)(A) garble and the (3)(C) omission are disclosed source defects; (1)(B) cites 900.1.10(3)', () => {
    const d = slice.defects.filter((x: Json) => x.regulation_id === '600.60.40(3)').map((x: Json) => [x.clause_path, x.kind]);
    expect(d).toEqual([['(3)(A)', 'garbled_character'], ['(3)(C)', 'lead_in_without_items']]);
    expect(slice.units.filter((u: Json) => u.regulation_id === '600.60.40(3)').map((u: Json) => u.unit_id)).toEqual(['600.60.40(3)#(3)(A)', '600.60.40(3)#(3)(B)', '600.60.40(3)#(3)(C)', '600.60.40(3)#(3)(D)']);
    expect(row('600.60.40(1)').refs.map((r: Json) => [r.clause_path, r.citation])).toContainEqual(['(1)(B)', '900.1.10(3)']);
  });
});
