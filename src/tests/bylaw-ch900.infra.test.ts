// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §6 (Ch.900 exceptions `900.<k>.10(<n>)`, k = 2 R · 3 RD ·
//            4 RS · 5 RT · 6 RM), §6.4 rule 1 (one page per TOC section), §9 G-TEXT, G-CHANGE, §6 archetype INCLUDE;
//            docs/specs/01-pipeline/69_mcbylaw_policy.md M-15 (dated note 2026-10-07: operator Q-K7a pins
//            ch900_2..6), M-47 (dated note 2026-10-07)
//
// Phase 2 prep over the COMMITTED snapshot (offline): the five Ch.900 residential exception pages are pinned at
// adoption-4 as NEW pages only (G-CHANGE: 0 changed), every exception anchor on a page is exactly one row (both
// directions), the pages slice with no problem and no unproven gap, and every "comply with exception / Regulation
// 900.k.10(n)" INCLUDE phrase is an extracted ref of its row. k7-exceptions.json is generated and deterministic.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs modules / seed JSON
const load = (rel: string): Promise<Json> => import(pathToFileURL(path.join(process.cwd(), rel)).href).catch((err: unknown) => ({ importError: String(err) }));
const SEEDS = path.join(process.cwd(), 'scripts/seeds/bylaw');
const ST = await load('scripts/analysis/bylaw/standardized.mjs');
const SNAP = await load('scripts/analysis/bylaw/snapshot.mjs');
const K7 = await load('scripts/analysis/bylaw/k7.mjs');
const SL = await load('scripts/analysis/bylaw/slice.mjs');
const readJson = (f: string): Json => JSON.parse(fs.readFileSync(path.join(SEEDS, f), 'utf8'));
const sliced: Json = ST.sliceSeeds ? ST.sliceSeeds(SEEDS) : { slice: { rows: [], units: [], problems: [], numbering: { gaps: [], unproven: [] } }, snap: { pages: [] } };
const slice: Json = sliced.slice;
const EXC = ['ch900_2', 'ch900_3', 'ch900_4', 'ch900_5', 'ch900_6'];

describe('the Ch.900 residential exception pages are pinned (Q-K7a, Spec 69 M-15 / M-47 dated notes)', () => {
  it('page-set pins 900.2..900.6 at their section URLs with the Q-K7a basis; nothing is left not-carried', () => {
    const ps = readJson('page-set.json');
    for (const [i, key] of EXC.entries()) {
      expect(ps.pages.find((p: Json) => p.key === key)).toEqual({ basis: 'Q-K7a operator 2026-10-07', file: `ZBL_NewProvision_Chapter900_${i + 2}.htm`, key, role: 'section', section: `900.${i + 2}` });
    }
    expect(ps.phase0_not_carried).toEqual([]);
  });
  it('adoption-4 adds exactly these five pages: G-CHANGE 5 new, 0 changed, 0 not carried', () => {
    const a = readJson('adoptions.json').adoptions.at(-1);
    expect(a.adoption_id).toBe('adoption-4');
    expect(a.change_summary).toEqual({ changed: 0, new: 5, not_carried: 0, not_carried_undeclared: 0, pinned: 64, unchanged: 59 });
    expect(Object.entries(a.pages as Record<string, Json>).filter(([, p]) => p.status === 'new').map(([k]) => k).sort()).toEqual(EXC);
  });
});

describe('the slicer on the real exception pages (G-TEXT)', () => {
  it('no slicer problem and no unproven gap on the exception pages; the 26 City repeat-letters are disclosures (Q-K7b, pinned in bylaw-slice.infra)', () => {
    expect(slice.problems.filter((p: string) => EXC.some((k) => p.includes(` ${k} `)))).toEqual([]);
    expect(slice.defects.filter((d: Json) => d.kind === 'source_repeat_letter' && EXC.includes(d.page))).toHaveLength(26);
    expect(slice.numbering.unproven.filter((g: Json) => EXC.includes(g.key))).toEqual([]);
    expect(slice.numbering.gaps.filter((g: Json) => EXC.includes(g.key)).length).toBeGreaterThan(500); // deleted / never-used exception numbers, proven absent
  });
  it('the City markup variants are disclosed, never silent: 16 group headings left inside the previous item cell', () => {
    const d = slice.defects.filter((x: Json) => x.kind === 'group_heading_in_cell');
    expect(d).toHaveLength(16);
    for (const x of d) expect(EXC.includes(x.page)).toBe(true);
  });
  it('the anti-vacuity residue on exception rows is exactly the 9 source quirks keying must list (literals_not_expressed)', () => {
    const left = slice.rows.filter((r: Json) => EXC.includes(r.page)).flatMap((r: Json) => r.uncovered_numbers.map((u: Json) => `${r.regulation_id} ${u.token}`));
    // "800 .50(75)" (spaced id), "one-half" x3 (fractions are left uncovered by design), "1,25" / "7,5" (decimal
    // comma), "minimum1.5" (glued)
    expect(left).toEqual(['900.2.10(21) 50', '900.3.10(617) one', '900.3.10(618) one', '900.3.10(1006) 25', '900.6.10(50) one', '900.6.10(174) 1', '900.6.10(174) 5', '900.6.10(260) one', '900.6.10(404) 5']);
  });
  it('every exception anchor <A Name="900.k.10(n)"> is exactly one row, and every exception row has its anchor', () => {
    for (const p of sliced.snap.pages.filter((x: Json) => EXC.includes(x.key))) {
      const art = `${p.section}.10`;
      const anchors = new Set([...p.html.matchAll(/<A Name="(900\.\d+\.10\(\d+\))">/gi)].map((m: Json) => m[1]));
      const rows = slice.rows.filter((r: Json) => r.page === p.key && r.article === art).map((r: Json) => r.regulation_id.replace(/~.*$/, ''));
      expect([p.key, anchors.size > 100]).toEqual([p.key, true]);
      expect([p.key, [...new Set(rows)].sort()]).toEqual([p.key, [...anchors].sort()]);
      expect([p.key, rows.length]).toEqual([p.key, new Set(rows).size]); // no exception is split into variants
    }
  });
  it('RD 1462 (the FSI cap) slices to its Site Specific Provision (A) with the three bands; its prevailing list is (None Apply)', () => {
    const u = slice.units.filter((x: Json) => x.regulation_id === '900.3.10(1462)');
    expect(u.map((x: Json) => x.unit_id)).toEqual(['900.3.10(1462)#(1462)[SSP](A)(i)', '900.3.10(1462)#(1462)[SSP](A)(ii)', '900.3.10(1462)#(1462)[SSP](A)(iii)', '900.3.10(1462)#(1462)[PBS]']);
    expect(u[0].context.join(' ')).toMatch(/maximum floor space index/);
    expect(u[3].text).toMatch(/^Prevailing By-laws and Prevailing Sections: \(None Apply\)/);
  });
  it('every "comply with exception / Regulation 900.k.10(n)" phrase is an extracted ref of its row (INCLUDE edges)', () => {
    let phrases = 0;
    const missing: string[] = [];
    for (const r of slice.rows.filter((x: Json) => EXC.includes(x.page))) {
      const refs = new Set(r.refs.map((x: Json) => x.citation));
      for (const m of r.verbatim.matchAll(/comply with (?:the )?(?:exception|regulations?)\s+(900\.\d+\.10\(\d+\))/gi)) {
        phrases++;
        if (!refs.has(m[1])) missing.push(`${r.regulation_id} -> ${m[1]}`);
      }
    }
    expect(phrases).toBeGreaterThan(500);
    expect(missing).toEqual([]);
  });
});

describe('k7-exceptions.json — the wave-1 top 30 by direct residential lots (generated, deterministic)', () => {
  it('equals an in-memory regeneration from census.json + the live slice (LF, sorted keys)', () => {
    const text = fs.readFileSync(path.join(SEEDS, 'k7-exceptions.json'), 'utf8');
    expect(text.includes('\r')).toBe(false);
    const doc = K7.buildK7({ census: readJson('census.json'), groups: SL.CLAUSE_GROUPS, slice, adoptionId: readJson('manifest.json').adoption_id });
    expect(text).toBe(SNAP.stableStringify(doc));
    expect(fs.readFileSync(path.join(SEEDS, 'k7-exceptions.md'), 'utf8')).toBe(K7.renderK7Markdown(doc));
    expect(doc.missing_from_slice).toEqual([]);
    expect(doc.census.current).toBe(true); // census.json re-run on adoption-4: only adoption_id moved
    expect(doc.refs.include_edges).toBeGreaterThan(1000);
  });
  it('the INCLUDE-closed count reproduces M-15: RD 1462 inherits 38,512 lots (0 direct) and is an INCLUDE target of the 30', () => {
    const k = readJson('k7-exceptions.json');
    expect(k.closure_outside_top).toEqual([{ closed_lots: 38512, direct_lots: 0, regulation_id: '900.3.10(1462)' }]);
    expect(k.top_by_closed_lots_not_in_top_by_direct).toEqual(expect.arrayContaining(['900.3.10(1462)', '900.4.10(336)', '900.5.10(352)']));
  });
  it('30 wave-1 exceptions, ranked by direct lots (desc), each on a pinned page with ≥ 1 unit', () => {
    const k = readJson('k7-exceptions.json');
    expect(k.exceptions).toHaveLength(30);
    const lots = k.exceptions.map((e: Json) => e.direct_lots);
    expect(lots).toEqual([...lots].sort((a: number, b: number) => b - a));
    for (const e of k.exceptions) {
      expect([e.regulation_id, EXC.includes(e.page), e.units > 0, e.wave]).toEqual([e.regulation_id, true, true, 1]);
      expect(e.regulation_id).toBe(`900.${{ R: 2, RD: 3, RS: 4, RT: 5, RM: 6 }[e.zone as 'R']}.10(${e.exception})`);
    }
  });
});
