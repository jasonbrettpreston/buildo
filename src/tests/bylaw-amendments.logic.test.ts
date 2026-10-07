// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §6 `amendments[]` + `enacting_source`, §4 (`pending:stale`),
//            §9 G-PROV (amendment arm: every tag has an amendments.json entry and a clause_path; per-page tag counts
//            pinned two-directional; enacting-PDF and extraction shas) + G-CHANGE (stale units; adopt refuses partial
//            or old staging), SC-7; docs/specs/01-pipeline/69_mcbylaw_policy.md M-36, M-39, M-45, §3 (654-2025);
//            docs/reports/mcbylaw-phase1-plan.md S10
//
// S10 unit tests over synthetic fixtures (offline): tag parsing, clause binding from the page structure,
// amendments.json build + status merge, the G-PROV amendment arm (one known-bad fixture per reason code and its
// good twin), the enacting capture (sha refusal, deterministic extraction, adopt re-validation) and the G-CHANGE
// stale-unit arm (stale = changed exactly; gate state pass / fail / not_run).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
// A missing module fails every test that uses it (red-first evidence records per-test failures), never silently passes.
const load = (rel: string): Promise<Json> => import(pathToFileURL(path.join(process.cwd(), rel)).href).catch((err: unknown) => ({ importError: String(err) }));
const AM = await load('scripts/analysis/bylaw/amendments.mjs');
const EN = await load('scripts/analysis/bylaw/enacting.mjs');
const CH = await load('scripts/analysis/bylaw/change.mjs');
const SNAP = await load('scripts/analysis/bylaw/snapshot.mjs');

// ---------- City-shaped page fixture ----------
const row = (label: string, text: string, anchor?: string) =>
  `<TR>\n<TD ALIGN=RIGHT VALIGN=TOP width="5%">${anchor ? `<A Name="${anchor}">${label}</A>` : label}</TD><TD VALIGN=TOP colspan="2">${text}</TD>\n</TR>`;
const nest = (inner: string) => `<TR>\n<TD ALIGN=RIGHT VALIGN=TOP width="5%"></TD><TD VALIGN=TOP>\n<TABLE WIDTH="100%">\n${inner}\n</TABLE>\n</TD>\n</TR>`;
const table = (inner: string) => `<TABLE WIDTH="100%">\n${inner}\n</TABLE>`;
const h = (id: string, title: string) => `<H4><A Name="${id}">${id}   ${title}</A></H4>`;

/** A page for section 9.10 with tags at regulation, clause and sub-clause depth, plus a list tag. */
function fixturePage(extra = ''): string {
  return [
    '<html><head><META http-equiv="Content-Type" content="text/html; charset=iso-8859-1"></head><body>',
    '<font>Version Date: July 31, 2024, including City-wide Amendments up to April 30, 2026</font>',
    '<TABLE><TR><TD>9.10</TD><TD><A HREF="ZBL_NewProvision_Chapter9_10.htm">Sec</A></TD></TR>',
    '<TR><TD>9.10.20.10</TD><TD><A HREF="#9.10.20.10">Art</A></TD></TR></TABLE>',
    h('9.10.20.10', 'Permitted Uses'),
    table(`${row('(1)', '<u>Use</u>', '9.10.20.10(1)')}\n${row('', 'Park<br>Library (3)<br>[ By-laws: 1-2020; 0002-2021(OLT) ] [ By-law: 2-2021(OLT) ]<br>')}`),
    h('9.10.40.10', 'Height'),
    table(
      `${row('(1)', '<u>Height</u>', '9.10.40.10(1)')}\n${nest(
        `${row('(A)', 'the height is 10.0 m; and')}\n${row('(B)', 'the height is 7.5 m. [ By-law: 3-2022 ]<br>')}`,
      )}`,
    ),
    table(
      `${row('(2)', '<u>Exceptions</u>', '9.10.40.10(2)')}\n${nest(
        `${row('(A)', 'in the R zone:')}\n${nest(`${row('(i)', 'one;')}\n${row('(ii)', 'two. [ By-law: OMB PL130592 February 7, 2017 ]')}`)}`,
      )}\n${row('', 'Despite (A), none. [By-law: 3-2022; 579-2017 Under Appeal]')}`,
    ),
    extra,
    '</body></html>',
  ].join('\n');
}

describe('tag parsing (Spec 68 §6 amendments[])', () => {
  it('T1 a singular tag yields its by-law refs, leading zeros dropped, the qualifier kept as a note', () => {
    expect(AM.parseTag('[ By-law: 0559-2014 (OMB PL130592) ]')).toEqual({
      form: 'single',
      refs: [{ bylaw: '559-2014', kind: 'bylaw', note: 'OMB PL130592' }],
    });
    expect(AM.parseTag('[ By-law: 474-2023; 1062-2025(OLT); 608-2024 ]').refs.map((r: Json) => [r.bylaw, r.note])).toEqual([
      ['474-2023', null],
      ['1062-2025', 'OLT'],
      ['608-2024', null],
    ]);
    expect(AM.parseTag('[By-law: 579-2017 Under Appeal]').refs).toEqual([{ bylaw: '579-2017', kind: 'bylaw', note: 'Under Appeal' }]);
  });
  it('T2 a tribunal order with no by-law number is its own instrument (literal id, never invented)', () => {
    expect(AM.parseTag('[ By-law: OMB PL130592 February 7, 2017 ]').refs).toEqual([
      { bylaw: 'OMB PL130592 February 7, 2017', kind: 'tribunal_order', note: null },
    ]);
  });
  it('T3 a plural `[ By-laws: … ]` list is form "list"; anything else is not a tag', () => {
    expect(AM.parseTag('[ By-laws: 1-2020; 2-2021 ]').form).toBe('list');
    expect(() => AM.parseTag('[ See: 1-2020 ]')).toThrow(/not_a_tag/);
  });
});

describe('clause binding from the page structure (Spec 68 §6: a tag is bound to the clause it follows)', () => {
  it('B1 regulation-, clause- and sub-clause-depth tags bind to the deepest enclosing labelled cell', () => {
    const tags = AM.extractPageTags(fixturePage(), 'ch9_10');
    expect(tags.map((t: Json) => [t.clause_path, t.form, t.raw])).toEqual([
      ['9.10.20.10(1)', 'list', '[ By-laws: 1-2020; 0002-2021(OLT) ]'],
      ['9.10.20.10(1)', 'single', '[ By-law: 2-2021(OLT) ]'],
      ['9.10.40.10(1)(B)', 'single', '[ By-law: 3-2022 ]'],
      ['9.10.40.10(2)(A)(ii)', 'single', '[ By-law: OMB PL130592 February 7, 2017 ]'],
      ['9.10.40.10(2)', 'single', '[By-law: 3-2022; 579-2017 Under Appeal]'],
    ]);
  });
  it('B2 tag ids are page + clause path + ordinal within that clause (stable when tags elsewhere change)', () => {
    const ids = AM.extractPageTags(fixturePage(), 'ch9_10').map((t: Json) => t.id);
    expect(ids).toEqual(['ch9_10:9.10.20.10(1)#1', 'ch9_10:9.10.20.10(1)#2', 'ch9_10:9.10.40.10(1)(B)#1', 'ch9_10:9.10.40.10(2)(A)(ii)#1', 'ch9_10:9.10.40.10(2)#1']);
  });
  it('B3 a tag before any article heading is unbound (clause_path null), never guessed', () => {
    const html = fixturePage().replace('<TABLE><TR><TD>9.10</TD>', '<p>[ By-law: 9-2019 ]</p><TABLE><TR><TD>9.10</TD>');
    const t = AM.extractPageTags(html, 'ch9_10');
    expect(t[0]).toMatchObject({ clause_path: null, raw: '[ By-law: 9-2019 ]' });
  });
  it('B4 the tags read from the structure equal the tags in the normalized text, in order', () => {
    const html = fixturePage();
    const fromHtml = AM.extractPageTags(html, 'ch9_10').map((t: Json) => t.raw);
    expect(AM.tagsInText(SNAP.normalize(html))).toEqual(fromHtml);
  });
});

// ---------- seeds fixture: a two-page adoption ----------
let root: string;
let seeds: string;
const quiet = fixturePage();
const other = fixturePage().replace(/9\.10/g, '9.20').replace('[ By-law: 3-2022 ]', '[ By-law: 4-2023 ]');

function writeSeeds(pages: Record<string, string>, adoptionId = 'adoption-1') {
  fs.mkdirSync(path.join(seeds, 'pages'), { recursive: true });
  const mpages = Object.entries(pages).map(([key, html]) => {
    const raw = Buffer.from(html, 'latin1');
    const norm = SNAP.normalize(html);
    fs.writeFileSync(path.join(seeds, 'pages', `${key}.htm`), raw);
    fs.writeFileSync(path.join(seeds, 'pages', `${key}.txt`), norm);
    return { key, raw_sha256: SNAP.sha256(raw), normalized_sha256: SNAP.sha256(Buffer.from(norm, 'utf8')), tag_count: SNAP.tagCount(norm), role: 'section', section: key };
  });
  fs.writeFileSync(path.join(seeds, 'manifest.json'), SNAP.stableStringify({ adoption_id: adoptionId, pages: mpages }));
}
const build = (prior: Json | null = null) => AM.buildAmendments({ seeds, prior });
const writeAmendments = (doc: Json) => fs.writeFileSync(path.join(seeds, 'amendments.json'), SNAP.stableStringify(doc));

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bylaw-s10-'));
  seeds = path.join(root, 'scripts', 'seeds', 'bylaw');
  fs.mkdirSync(seeds, { recursive: true });
  writeSeeds({ ch9_10: quiet, ch9_20: other });
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('amendments.json build (default not_verified; status once per by-law)', () => {
  it('A1 every tag is recorded with its clause path; per-page singular and list counts are pinned; the manifest count reconciles', () => {
    const doc = build();
    expect(doc.adoption_id).toBe('adoption-1');
    expect(doc.generator_version).toBe(AM.AMENDMENTS_GENERATOR_VERSION);
    expect(doc.pages.ch9_10).toEqual({ list_tag_count: 1, normalized_sha256: expect.any(String), tag_count: 4 });
    expect(doc.totals).toEqual({ article_level_tags: 0, bylaws: 6, list_tags: 2, pages: 2, tags: 8 });
    expect(doc.tags.filter((t: Json) => t.page === 'ch9_10')).toHaveLength(5);
  });
  it('A2 every referenced by-law gets one status entry, default not_verified with every source field null', () => {
    const doc = build();
    expect(Object.keys(doc.statuses).sort()).toEqual(['1-2020', '2-2021', '3-2022', '4-2023', '579-2017', 'OMB PL130592 February 7, 2017']);
    expect(doc.statuses['3-2022']).toEqual({
      basis: null,
      bylaw: '3-2022',
      enacted_on: null,
      in_force_on: null,
      in_force_trigger: null,
      source_sha256: null,
      source_url: null,
      status: 'not_verified',
      verified_on: null,
    });
    expect(doc.bylaw_tag_counts['3-2022']).toEqual({ clauses: 3, tags: 3 });
    expect(doc.bylaw_tag_counts['1-2020']).toEqual({ clauses: 2, tags: 2 }); // list tags count too
  });
  it('A3 an authored status survives a rebuild; a status for a by-law no longer tagged is dropped and reported', () => {
    const prior = build();
    prior.statuses['3-2022'] = { ...prior.statuses['3-2022'], status: 'in_force', source_url: 'https://www.toronto.ca/x.pdf', source_sha256: 'a'.repeat(64), verified_on: '2026-10-07', in_force_on: '2022-01-01', basis: 'M-36' };
    prior.statuses['77-2001'] = { ...prior.statuses['3-2022'], bylaw: '77-2001' };
    const doc = build(prior);
    expect(doc.statuses['3-2022'].status).toBe('in_force');
    expect(doc.statuses['77-2001']).toBeUndefined();
    expect(AM.droppedStatuses(prior, doc)).toEqual(['77-2001']);
  });
  it('A4 the build is deterministic: same inputs, byte-identical output', () => {
    expect(SNAP.stableStringify(build())).toBe(SNAP.stableStringify(build()));
  });
  it('A5 the build refuses when the structure and the normalized text disagree, or the manifest count differs', () => {
    fs.writeFileSync(path.join(seeds, 'pages', 'ch9_10.txt'), `${SNAP.normalize(quiet)} [ By-law: 5-2024 ]`);
    expect(() => build()).toThrow(/tag_text_mismatch/);
    writeSeeds({ ch9_10: quiet, ch9_20: other });
    const m = JSON.parse(fs.readFileSync(path.join(seeds, 'manifest.json'), 'utf8'));
    m.pages[0].tag_count = 99;
    fs.writeFileSync(path.join(seeds, 'manifest.json'), SNAP.stableStringify(m));
    expect(() => build()).toThrow(/tag_count_mismatch/);
  });
});

describe('G-PROV amendment arm: one known-bad fixture per reason code, and its good twin', () => {
  const codes = (r: Json) => r.violations.map((v: string) => v.split(':')[0]);
  it('P0 the good twin passes', () => {
    writeAmendments(build());
    const r = AM.checkAmendments({ seeds });
    expect(r.violations).toEqual([]);
    expect(r.pass).toBe(true);
    expect(r.checked).toBe(10);
  });
  it('P1 amendments_missing', () => {
    expect(codes(AM.checkAmendments({ seeds }))).toEqual(['amendments_missing']);
  });
  it('P2 amendments_stale: built against another adoption', () => {
    writeAmendments({ ...build(), adoption_id: 'adoption-0' });
    expect(codes(AM.checkAmendments({ seeds }))).toContain('amendments_stale');
  });
  it('P3 tag_count_mismatch: a pinned page count differs from the manifest (both directions: extra or missing page)', () => {
    const doc = build();
    doc.pages.ch9_10.tag_count = 3;
    doc.pages.ch9_99 = { list_tag_count: 0, normalized_sha256: 'x', tag_count: 0 };
    writeAmendments(doc);
    const c = codes(AM.checkAmendments({ seeds }));
    expect(c.filter((x: string) => x === 'tag_count_mismatch')).toHaveLength(2);
  });
  it('P4 tag_unrecorded / tag_not_on_page: the recorded tags differ from the pages (two-directional)', () => {
    const doc = build();
    const dropped = doc.tags.shift();
    doc.tags.push({ ...dropped, id: 'ch9_10:9.10.99.10(1)#1', clause_path: '9.10.99.10(1)' });
    writeAmendments(doc);
    const c = codes(AM.checkAmendments({ seeds }));
    expect(c).toContain('tag_unrecorded');
    expect(c).toContain('tag_not_on_page');
  });
  it('P5 tag_unbound: a recorded tag with no clause_path', () => {
    writeSeeds({ ch9_10: quiet.replace('<TABLE><TR><TD>9.10</TD>', '<p>[ By-law: 9-2019 ]</p><TABLE><TR><TD>9.10</TD>'), ch9_20: other });
    writeAmendments(build());
    expect(codes(AM.checkAmendments({ seeds }))).toEqual(['tag_unbound']);
  });
  it('P6 status_missing and status_orphan (two-directional)', () => {
    const doc = build();
    delete doc.statuses['4-2023'];
    doc.statuses['77-2001'] = { ...doc.statuses['3-2022'], bylaw: '77-2001' };
    writeAmendments(doc);
    const c = codes(AM.checkAmendments({ seeds }));
    expect(c).toContain('status_missing');
    expect(c).toContain('status_orphan');
  });
  it('P7 status_invalid: outside the closed set, or a verified status without its source', () => {
    const doc = build();
    doc.statuses['1-2020'].status = 'probably';
    doc.statuses['3-2022'].status = 'in_force';
    writeAmendments(doc);
    const v = AM.checkAmendments({ seeds }).violations.filter((x: string) => x.startsWith('status_invalid'));
    expect(v).toHaveLength(2);
    expect(v.join('\n')).toMatch(/1-2020.*probably/);
    expect(v.join('\n')).toMatch(/3-2022.*source_url/);
  });
  it('P8 the closed status set is exactly Spec 68 §6', () => {
    expect([...AM.STATUSES].sort()).toEqual(['in_force', 'in_force_not_in_consolidation', 'not_verified', 'partially_in_force', 'repealed', 'under_appeal']);
  });
});

// ---------- enacting capture ----------
const PDF = Buffer.from('%PDF-1.4 fake enacting by-law bytes');
const PDF_SHA = () => SNAP.sha256(PDF);
const EXTRACTED = 'CITY OF TORONTO\nBY-LAW 7-2025\n(C) Despite regulation 1.1, include:\n(i) one; and\n\f2 City of Toronto By-law 7-2025\n(ii) two.\n';
const fakeExtractor = (text = EXTRACTED) => ({
  name: 'fake-pdftotext',
  version: '9.99',
  args: ['-enc', 'UTF-8'],
  run: () => text,
});
let served: Record<string, Buffer | number>;
const fakeFetch = (url: string, init: { redirect: string }) => {
  expect(init.redirect).toBe('manual');
  const b = served[url];
  if (b === undefined) return Promise.resolve({ status: 404, arrayBuffer: async () => new ArrayBuffer(0) });
  if (typeof b === 'number') return Promise.resolve({ status: b, arrayBuffer: async () => new ArrayBuffer(0) });
  return Promise.resolve({ status: 200, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.length) });
};
const URL7 = 'https://www.toronto.ca/legdocs/bylaws/2025/law0007.pdf';
const capture = (extra: Json = {}) =>
  EN.captureEnacting({ root, bylaw: '7-2025', url: URL7, expectedSha256: PDF_SHA(), fetchImpl: fakeFetch, nowIso: () => '2026-10-07T00:00:00.000Z', extractor: fakeExtractor(), ...extra });

describe('enacting capture (Spec 69 M-36: url + sha256 + fetch time + extraction sha + extractor version)', () => {
  beforeEach(() => {
    served = { [URL7]: PDF };
  });
  it('E1 normalization drops the running page header and form feeds and collapses whitespace (versioned)', () => {
    expect(EN.normalizeExtraction(EXTRACTED, '7-2025')).toBe('CITY OF TORONTO BY-LAW 7-2025 (C) Despite regulation 1.1, include: (i) one; and (ii) two.');
    expect(EN.ENACTING_NORMALIZER_VERSION).toBe('enacting-norm-v1');
  });
  it('E2 capture stages the PDF, the extraction and the normalized text with a complete record; adopt writes enacting/', async () => {
    const staged = await capture();
    expect(staged.record).toMatchObject({ bylaw: '7-2025', url: URL7, pdf_sha256: PDF_SHA(), pdf_bytes: PDF.length, fetched_at: '2026-10-07T00:00:00.000Z', extractor: 'fake-pdftotext', extractor_version: '9.99', extractor_args: ['-enc', 'UTF-8'], normalizer_version: 'enacting-norm-v1' });
    expect(staged.record.extraction_sha256).toBe(SNAP.sha256(Buffer.from(EXTRACTED, 'utf8')));
    expect(staged.record.fetch_id).toMatch(/^E-[0-9a-f]{16}$/);
    expect(staged.record.header_lines_stripped).toBe(1);
    const out = EN.adoptEnacting({ root, bylaw: '7-2025' });
    const dir = path.join(seeds, 'enacting');
    expect(fs.readFileSync(path.join(dir, '7-2025.extracted.txt'), 'utf8')).toBe(EXTRACTED);
    expect(fs.readFileSync(path.join(dir, '7-2025.txt'), 'utf8')).toBe(EN.normalizeExtraction(EXTRACTED, '7-2025'));
    expect(fs.existsSync(path.join(dir, '7-2025.pdf'))).toBe(false); // the PDF is never committed (Spec 68 §10)
    const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    expect(m.captures['7-2025']).toEqual(out.record);
    expect(EN.checkEnacting({ seeds }).violations).toEqual([]);
  });
  it('E3 capture refuses a PDF whose sha differs from the expected one; nothing is staged', async () => {
    await expect(capture({ expectedSha256: 'b'.repeat(64) })).rejects.toThrow(/pdf_sha_mismatch/);
    expect(fs.existsSync(path.join(seeds, '.staging', 'enacting', '7-2025.json'))).toBe(false);
  });
  it('E4 capture refuses a redirect / non-200 and an extractor that is not deterministic', async () => {
    served[URL7] = 301;
    await expect(capture()).rejects.toThrow(/http_status/);
    served[URL7] = PDF;
    let n = 0;
    await expect(capture({ extractor: { ...fakeExtractor(), run: () => `${EXTRACTED}${n++}` } })).rejects.toThrow(/extraction_nondeterministic/);
  });
  it('E5 adopt refuses with no staging, and a tampered staging (old or edited)', async () => {
    expect(() => EN.adoptEnacting({ root, bylaw: '7-2025' })).toThrow(/no_complete_staging/);
    await capture();
    fs.appendFileSync(path.join(seeds, '.staging', 'enacting', '7-2025.extracted.txt'), 'x');
    expect(() => EN.adoptEnacting({ root, bylaw: '7-2025' })).toThrow(/staging_tampered/);
    await capture();
    fs.appendFileSync(path.join(seeds, '.staging', 'enacting', '7-2025.pdf'), 'x');
    expect(() => EN.adoptEnacting({ root, bylaw: '7-2025' })).toThrow(/staging_tampered/);
  });
  it('E6 G-PROV enacting arm: extraction / normalized sha mismatch, not reproducible, orphan file', async () => {
    await capture();
    EN.adoptEnacting({ root, bylaw: '7-2025' });
    const dir = path.join(seeds, 'enacting');
    fs.writeFileSync(path.join(dir, 'stray.txt'), 'x');
    fs.appendFileSync(path.join(dir, '7-2025.extracted.txt'), 'x');
    const c = EN.checkEnacting({ seeds }).violations.map((v: string) => v.split(':')[0]).sort();
    expect(c).toEqual(['extraction_sha_mismatch', 'normalized_not_reproducible', 'orphan_enacting_file']);
    fs.writeFileSync(path.join(dir, '7-2025.txt'), 'edited');
    expect(EN.checkEnacting({ seeds }).violations.map((v: string) => v.split(':')[0])).toContain('normalized_sha_mismatch');
  });
  it('E7 an excerpt is cut by literal start/end markers, unique in the text, and carries its own sha', () => {
    const text = EN.normalizeExtraction(EXTRACTED, '7-2025');
    const ex = EN.excerpt(text, '(C) Despite regulation 1.1', '(ii) two.');
    expect(ex.text).toBe('(C) Despite regulation 1.1, include: (i) one; and (ii) two.');
    expect(ex.sha256).toBe(SNAP.sha256(Buffer.from(ex.text, 'utf8')));
    expect(text.slice(ex.start, ex.end)).toBe(ex.text);
    expect(() => EN.excerpt(text, 'nowhere', '(ii) two.')).toThrow(/excerpt_not_found/);
    expect(() => EN.excerpt(`${text} ${text}`, '(C) Despite', '(ii) two.')).toThrow(/excerpt_ambiguous/);
  });
});

describe('G-CHANGE stale-unit arm (Spec 68 §4 pending:stale, SC-7: stale = changed exactly, 0 unflagged changes)', () => {
  const before = { a: 'h1', b: 'h2', c: 'h3', d: 'h4' };
  const after = { a: 'h1', b: 'h2x', c: 'h3', e: 'h5' };
  it('C1 a pinned unit whose text changed becomes stale; unchanged pins stay current; added and removed are listed', () => {
    const r = CH.staleUnits({ before, after, pins: { a: 'h1', b: 'h2', d: 'h4' } });
    expect(r).toMatchObject({ added: ['e'], removed: ['d'], changed: ['b'], unchanged: ['a', 'c'], stale: ['b'], orphaned_pins: ['d'], already_stale: [], unflagged_changes: [] });
    expect(r.sc7).toEqual({ changed_pinned: 1, newly_stale: 1, equal: true });
  });
  it('C2 a pin that was already stale before the adoption is counted separately, never as this adoption’s change', () => {
    const r = CH.staleUnits({ before, after, pins: { a: 'h0', b: 'h2' } });
    expect(r.stale).toEqual(['a', 'b']);
    expect(r.already_stale).toEqual(['a']);
    expect(r.sc7).toEqual({ changed_pinned: 1, newly_stale: 1, equal: true });
  });
  it('C3 an unflagged change (a changed unit whose pin still reads current) is named and breaks SC-7', () => {
    const r = CH.staleUnits({ before, after, pins: { b: 'h2x' } });
    expect(r.unflagged_changes).toEqual(['b']);
    expect(r.sc7.equal).toBe(false);
  });
  it('C4 unit shas come from the adoption record; an adoption with no unit shas makes the arm not_run (never a pass)', () => {
    expect(CH.adoptionUnitShas({ adoption_id: 'adoption-2', units: { 'x(1)': 'h' } })).toEqual({ 'x(1)': 'h' });
    expect(() => CH.adoptionUnitShas({ adoption_id: 'adoption-1' })).toThrow(/units_not_recorded/);
    expect(CH.changeGateState({ adoptions: [{ adoption_id: 'adoption-1' }], record: null })).toBe('not_run');
  });
  it('C5 gate state: pass only when the latest record is bound to the latest adoption and SC-7 holds', () => {
    const adoptions = [{ adoption_id: 'adoption-1', units: before }, { adoption_id: 'adoption-2', units: after }];
    const record = CH.changeRecord({ adoptions, pins: { a: 'h1', b: 'h2' } });
    expect(record).toMatchObject({ adoption_id: 'adoption-2', base_adoption: 'adoption-1', stale: ['b'] });
    expect(CH.changeGateState({ adoptions, record })).toBe('pass');
    expect(CH.changeGateState({ adoptions: [...adoptions, { adoption_id: 'adoption-3', units: after }], record })).toBe('not_run');
    expect(CH.changeGateState({ adoptions, record: { ...record, unflagged_changes: ['b'], sc7: { ...record.sc7, equal: false } } })).toBe('fail');
  });
  it('C6 tag and consolidation delta between two amendments.json builds', () => {
    const prev = { adoption_id: 'adoption-1', pages: { p: { tag_count: 2, list_tag_count: 0 } }, tags: [{ id: 'p:1.1(1)#1', refs: [{ bylaw: '1-2020' }] }], consolidation: { p: { amendments_up_to: '2026-04-30' } } };
    const next = { adoption_id: 'adoption-2', pages: { p: { tag_count: 3, list_tag_count: 0 }, q: { tag_count: 1, list_tag_count: 0 } }, tags: [{ id: 'p:1.1(1)#1', refs: [{ bylaw: '1-2020' }] }, { id: 'q:2.1(1)#1', refs: [{ bylaw: '9-2026' }] }], consolidation: { p: { amendments_up_to: '2026-08-31' } } };
    expect(CH.tagDelta(prev, next)).toEqual({
      pages: [{ page: 'p', tags_before: 2, tags_after: 3 }, { page: 'q', tags_before: 0, tags_after: 1 }],
      tags_added: ['q:2.1(1)#1'],
      tags_removed: [],
      bylaws_added: ['9-2026'],
      bylaws_removed: [],
    });
  });
});

describe('review-lens hardening (DeepSeek spec / error-paths / idempotency lenses, adjudicated)', () => {
  const codes = (r: Json) => r.violations.map((v: string) => v.split(':')[0]);
  it('H1 an empty tag and a part naming two by-law numbers are refusals, never silent', () => {
    expect(() => AM.parseTag('[ By-law: ]')).toThrow(/tag_empty/);
    expect(() => AM.parseTag('[ By-law: 849-2025 and 1051-2021 ]')).toThrow(/tag_ambiguous/);
    expect(() => AM.parseTag('[ By-law: OMB order re 1051-2021 ]')).toThrow(/tag_ambiguous/);
  });
  it('H2 a `[ By-law` prefix no tag accounts for (mixed case, inner bracket) refuses the build', () => {
    fs.writeFileSync(path.join(seeds, 'pages', 'ch9_10.txt'), `${SNAP.normalize(quiet)} [ BY-LAW: 5-2024 ]`);
    expect(() => build()).toThrow(/tag_text_mismatch/);
  });
  it('H3 unbalanced tables refuse (depth would be meaningless)', () => {
    expect(() => AM.extractPageTags(`${fixturePage()}</TABLE>`, 'ch9_10')).toThrow(/structure_unbalanced/);
    expect(() => AM.extractPageTags(fixturePage().replace('</body>', '<TABLE></body>'), 'ch9_10')).toThrow(/structure_unbalanced/);
  });
  it('H4 amendments_drift: an edit to the generated half (refs, totals) is caught; amendments_invalid never throws', () => {
    const doc = build();
    doc.tags[2].refs = [{ bylaw: '3-2022', kind: 'bylaw', note: null }, { bylaw: '9-2099', kind: 'bylaw', note: null }];
    writeAmendments(doc);
    expect(codes(AM.checkAmendments({ seeds }))).toContain('amendments_drift');
    writeAmendments({ ...build(), statuses: { x: null }, tags: [null] });
    expect(codes(AM.checkAmendments({ seeds }))).toEqual(['amendments_invalid']);
  });
  it('H5 a status filed under another key, with an unknown field or a bad date, is status_invalid; authored fields are projected', () => {
    const prior = build();
    prior.statuses['3-2022'] = { ...prior.statuses['3-2022'], typo_field: 1, enacted_on: '2022' };
    const doc = build(prior);
    expect(Object.keys(doc.statuses['3-2022'])).not.toContain('typo_field');
    expect(AM.statusProblems({ ...doc.statuses['3-2022'] }, '4-2023').join('|')).toMatch(/filed under "4-2023".*enacted_on is not an ISO date/);
  });
  it('H6 a missing page is not a burst of tag_not_on_page (the page arm reports it once)', () => {
    writeAmendments(build());
    fs.rmSync(path.join(seeds, 'pages', 'ch9_20.htm'));
    expect(codes(AM.checkAmendments({ seeds }))).not.toContain('tag_not_on_page');
  });
  it('H7 enacting: excerpt markers must each be unique in the whole text, non-empty, end after start', () => {
    const text = 'END x START y END2';
    expect(() => EN.excerpt(text, 'START', 'END')).toThrow(/excerpt_ambiguous|excerpt_not_found/);
    expect(() => EN.excerpt('a START b', 'START', '')).toThrow(/excerpt_not_found/);
    expect(() => EN.excerpt('b END a START', 'START', 'END')).toThrow(/not after/);
  });
  it('H8 enacting: an empty extraction is refused; the header-line count is recorded', async () => {
    served = { [URL7]: PDF };
    await expect(capture({ extractor: fakeExtractor('\f\n') })).rejects.toThrow(/extraction_empty/);
    const { record } = await capture();
    expect(record.header_lines_stripped).toBe(1);
  });
  it('H9 enacting check: a key ≠ record.bylaw or a bad key is enacting_manifest_invalid (no path built from it); a normalizer drift is named', async () => {
    served = { [URL7]: PDF };
    await capture();
    EN.adoptEnacting({ root, bylaw: '7-2025' });
    const mp = path.join(seeds, 'enacting', 'manifest.json');
    const m = JSON.parse(fs.readFileSync(mp, 'utf8'));
    m.captures['7-2025'].normalizer_version = 'enacting-norm-v0';
    m.captures['../../x'] = { ...m.captures['7-2025'] };
    fs.writeFileSync(mp, SNAP.stableStringify(m));
    const c = EN.checkEnacting({ seeds }).violations.map((v: string) => v.split(':')[0]);
    expect(c.filter((x: string) => x === 'enacting_manifest_invalid')).toHaveLength(1);
    expect(c).toContain('normalizer_version_drift');
    m.captures = { '7-2025': null };
    fs.writeFileSync(mp, SNAP.stableStringify(m));
    expect(EN.checkEnacting({ seeds }).violations.map((v: string) => v.split(':')[0])).toContain('enacting_manifest_invalid');
  });
  it('H10 enacting adopt: a truncated staged record is staging_tampered, never a raw SyntaxError', async () => {
    served = { [URL7]: PDF };
    await capture();
    fs.writeFileSync(path.join(seeds, '.staging', 'enacting', '7-2025.json'), '{"bylaw":');
    expect(() => EN.adoptEnacting({ root, bylaw: '7-2025' })).toThrow(/staging_tampered/);
  });
});
