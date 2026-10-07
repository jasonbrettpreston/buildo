// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §10 stage 1 (Snapshot), §6.4 rules 1 + 10,
//            §9 G-PROV (page arm) + G-CHANGE (change report; adopt refuses partial or old staging);
//            docs/specs/01-pipeline/69_mcbylaw_policy.md M-47; docs/reports/mcbylaw-phase1-plan.md S3
//
// S3 unit tests: the versioned normalizer, the manifest/adoption writer, --refresh transactionality
// (all or nothing, never follows links), --adopt refusals, and one known-bad fixture per G-PROV
// page-arm reason code plus its good twin. Offline: --refresh runs against an injected fetch.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
// A missing module fails every test that uses it (red-first evidence records per-test failures), never silently passes.
const load = (rel: string): Promise<Json> => import(pathToFileURL(path.join(process.cwd(), rel)).href).catch((err: unknown) => ({ importError: String(err) }));
const SNAP = await load('scripts/analysis/bylaw/snapshot.mjs');
const OBS = await load('scripts/analysis/bylaw/observable.mjs');

const BASE = 'https://www.toronto.ca/zoning/bylaw_amendments/';
const fileOf = (section: string) => `ZBL_NewProvision_Chapter${section.replace('.', '_')}.htm`;

/** A minimal City-shaped page holding `section` (CRLF, like the real server bytes). */
function page(section: string, body = 'The minimum lot frontage is 12.0 m.', charset = 'iso-8859-1'): string {
  return [
    '<html><head>',
    `<META http-equiv="Content-Type" content="text/html; charset=${charset}">`,
    '<style>x{}</style></head><body>',
    '<font>Version Date: July 31, 2024, including City-wide Amendments up to April 30, 2026</font>',
    '<TABLE>',
    '<TR><TD>Chapter 1</TD><TD><A HREF="ZBL_NewProvision_Chapter1.htm">Administration</A></TD></TR>',
    `<TR><TD>${section}</TD><TD><A HREF="${fileOf(section)}">Section</A></TD></TR>`,
    `<TR><TD>${section}.1</TD><TD><A HREF="#${section}.1">Article</A></TD></TR>`,
    '</TABLE>',
    `<p>${section}.1 Title (1) ${body} [ By-law: 1-2020 ]</p>`,
    '</body></html>',
  ].join('\r\n');
}

const PAGE_SET = {
  version: 1,
  base_url: BASE,
  normalizer_charset: 'iso-8859-1',
  pages: [
    { key: 'ch1', role: 'toc_root', section: null, file: 'ZBL_NewProvision_Chapter1.htm', basis: 'G-UNIVERSE' },
    { key: 'ch1_5', role: 'section', section: '1.5', file: fileOf('1.5'), basis: 'phase0' },
    { key: 'ch1_20', role: 'section', section: '1.20', file: fileOf('1.20'), basis: 'M-47' },
  ],
  phase0_not_carried: [{ phase0_key: 'ch900_2', section: '900.2', ruling: 'M-15', reason: 'Phase 2' }],
};

let root: string;
let seeds: string;
let baseline: string;
let served: Record<string, string>;
let calls: { url: string; redirect: string }[];

function fakeFetch(url: string, init: { redirect: string }) {
  calls.push({ url, redirect: init.redirect });
  const name = url.slice(BASE.length);
  const body = served[name];
  if (body === undefined) return Promise.resolve({ status: 404, arrayBuffer: async () => new ArrayBuffer(0) });
  if (body.startsWith('REDIRECT:')) return Promise.resolve({ status: 301, arrayBuffer: async () => new ArrayBuffer(0) });
  if (body === 'ERROR') return Promise.reject(new Error('socket hang up'));
  const buf = Buffer.from(body, 'latin1');
  return Promise.resolve({ status: 200, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length) });
}

let tick = 0;
const clock = { nowIso: () => `2026-10-07T00:00:${String(tick++ % 60).padStart(2, '0')}.000Z`, sleep: async () => undefined };
const doRefresh = (extra: Json = {}) =>
  SNAP.refresh({ root, fetchImpl: fakeFetch, ...clock, delayMs: 500, baselineDir: baseline, ...extra });

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bylaw-s3-'));
  seeds = path.join(root, 'scripts', 'seeds', 'bylaw');
  fs.mkdirSync(seeds, { recursive: true });
  fs.writeFileSync(path.join(seeds, 'page-set.json'), `${JSON.stringify(PAGE_SET, null, 2)}\n`);
  served = {
    'ZBL_NewProvision_Chapter1.htm': page('1.5'),
    [fileOf('1.5')]: page('1.5'),
    [fileOf('1.20')]: page('1.20'),
  };
  calls = [];
  // Phase 0 baseline: the chapter page ch1 (= 1.5), ch1_5 with an older text, and a Ch.900 page not carried.
  baseline = path.join(root, 'phase0');
  fs.mkdirSync(baseline);
  for (const [k, html] of Object.entries({ ch1: page('1.5'), ch1_5: page('1.5', 'The minimum lot frontage is 10.0 m.'), ch900_2: page('900.2') })) {
    fs.writeFileSync(path.join(baseline, `${k}.htm`), Buffer.from(html, 'latin1'));
    fs.writeFileSync(path.join(baseline, `${k}.txt`), SNAP.normalize(html));
  }
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const ready = () => path.join(seeds, '.staging', 'ready');
const incoming = () => path.join(seeds, '.staging', 'incoming');

describe('normalizer (versioned)', () => {
  it('N1 drops script/style, removes inline tags without a space, turns other tags into a space', () => {
    expect(SNAP.normalize('<p>a<b>b</b>c</p><style>x</style><script>y</script><div>d</div>')).toBe('abc d');
  });
  it('N2 decodes entities, folds curly quotes, dashes and nbsp, collapses whitespace', () => {
    expect(SNAP.normalize('a&nbsp;&amp;&#167;&#x41;’“– b\r\n\r\n c &unknown;')).toBe("a &§A'\"- b c &unknown;");
  });
  it('N3 the version string is recorded and is norm-v1', () => {
    expect(SNAP.NORMALIZER_VERSION).toBe('norm-v1');
  });
  it('N4 stableStringify sorts keys at every depth, keeps array order, LF + trailing newline', () => {
    expect(SNAP.stableStringify({ b: 1, a: { d: [3, 1], c: 2 } })).toBe('{\n  "a": {\n    "c": 2,\n    "d": [\n      3,\n      1\n    ]\n  },\n  "b": 1\n}\n');
  });
  it('N5 consolidation date and tag count are read from the page', () => {
    const t = SNAP.normalize(page('1.5'));
    expect(SNAP.consolidationOf(t)).toEqual({ version_date: '2024-07-31', amendments_up_to: '2026-04-30' });
    expect(SNAP.tagCount(t)).toBe(1);
  });
});

describe('page validation (one page per TOC section)', () => {
  const entry = (section: string) => ({ key: `ch${section.replace('.', '_')}`, role: 'section', section, file: fileOf(section) });
  it('V1 a section page holding its own section is accepted, with raw + normalized shas', () => {
    const buf = Buffer.from(page('1.20'), 'latin1');
    const v = SNAP.validatePage(entry('1.20'), buf, 'iso-8859-1');
    expect(v.record.own_section).toBe('1.20');
    expect(v.record.raw_sha256).toBe(SNAP.sha256(buf));
    expect(v.record.normalized_sha256).toBe(SNAP.sha256(Buffer.from(v.normalized, 'utf8')));
  });
  it('V2 a chapter-URL page that holds only the first section is refused (wrong_section)', () => {
    expect(() => SNAP.validatePage(entry('1.20'), Buffer.from(page('1.5'), 'latin1'), 'iso-8859-1')).toThrow(/wrong_section/);
  });
  it('V2b a chapter-URL page maps to its section only via same-page articles, its own section link, or a single-section chapter', () => {
    const noArticles = page('800.50').replace(/<TR><TD>800\.50\.1[\s\S]*?<\/TR>/, '');
    expect(SNAP.ownSection(noArticles, 'ZBL_NewProvision_Chapter800.htm')).toBe('800.50');
    expect(SNAP.ownSection(noArticles, 'ZBL_NewProvision_Chapter800_50.htm')).toBe('800.50');
    const twoSections = noArticles.replace('</TABLE>', `<TR><TD>800.60</TD><TD><A HREF="${fileOf('800.60')}">Other</A></TD></TR></TABLE>`);
    expect(SNAP.ownSection(twoSections, 'ZBL_NewProvision_Chapter800.htm')).toBe(null);
  });
  it('V3 an undeclared charset change is refused (unexpected_charset)', () => {
    expect(() => SNAP.validatePage(entry('1.20'), Buffer.from(page('1.20', 'x', 'utf-8'), 'latin1'), 'iso-8859-1')).toThrow(/unexpected_charset/);
  });
  it('V4 a page with no consolidation date or an empty TOC is refused', () => {
    expect(() => SNAP.validatePage(entry('1.20'), Buffer.from(page('1.20').replace('Version Date', 'Versio'), 'latin1'), 'iso-8859-1')).toThrow(/no_consolidation_date/);
    expect(() => SNAP.validatePage(entry('1.20'), Buffer.from('<META charset=iso-8859-1><p>x</p>', 'latin1'), 'iso-8859-1')).toThrow(/toc_empty/);
  });
});

describe('--refresh is transactional and never follows links', () => {
  it('R1 a complete refresh stages every pinned page + staging.json + the change report', async () => {
    const { report, meta } = await doRefresh();
    expect(fs.readdirSync(path.join(ready(), 'pages')).sort()).toEqual(['ch1.htm', 'ch1.txt', 'ch1_20.htm', 'ch1_20.txt', 'ch1_5.htm', 'ch1_5.txt']);
    expect(fs.existsSync(path.join(ready(), 'staging.json'))).toBe(true);
    expect(fs.existsSync(incoming())).toBe(false);
    expect(meta.normalizer_version).toBe('norm-v1');
    expect(calls.map((c) => c.url)).toEqual(PAGE_SET.pages.map((p) => BASE + p.file));
    expect(calls.every((c) => c.redirect === 'manual')).toBe(true);
    // raw bytes are kept exactly (CRLF preserved)
    expect(fs.readFileSync(path.join(ready(), 'pages', 'ch1_20.htm')).equals(Buffer.from(page('1.20'), 'latin1'))).toBe(true);
    // diff vs Phase 0: 1.20 new (M-47), 1.5 changed (12.0 vs 10.0), root unchanged, ch900_2 not carried by ruling
    const st = Object.fromEntries(report.pages.map((p: Json) => [p.key, p.status]));
    expect(st).toEqual({ ch1: 'unchanged', ch1_5: 'changed', ch1_20: 'new' });
    expect(report.pages.find((p: Json) => p.key === 'ch1_5').baseline_duplicates_differ).toEqual(['ch1']);
    expect(report.not_carried).toEqual([{ key: 'ch900_2', section: '900.2', ruling: 'M-15', reason: 'Phase 2' }]);
  });
  it('R2 a failed fetch (HTTP 404) stages nothing and discards the previous staging', async () => {
    await doRefresh();
    served[fileOf('1.20')] = undefined as unknown as string;
    await expect(doRefresh()).rejects.toThrow(/http_status/);
    expect(fs.existsSync(ready())).toBe(false);
    expect(fs.existsSync(incoming())).toBe(false);
  });
  it('R3 a redirect is never followed: HTTP 301 fails the refresh, nothing staged', async () => {
    served[fileOf('1.20')] = 'REDIRECT:elsewhere';
    await expect(doRefresh()).rejects.toThrow(/HTTP 301/);
    expect(calls.filter((c) => c.url.includes('elsewhere'))).toEqual([]);
    expect(fs.existsSync(ready())).toBe(false);
  });
  it('R4 a network error is retried, then fails with nothing staged', async () => {
    served[fileOf('1.20')] = 'ERROR';
    await expect(doRefresh()).rejects.toThrow(/fetch_error/);
    expect(calls.filter((c) => c.url.endsWith(fileOf('1.20')))).toHaveLength(3);
    expect(fs.existsSync(ready())).toBe(false);
  });
  it('R5 a wrong-section page anywhere fails the whole refresh', async () => {
    served[fileOf('1.20')] = page('1.5');
    await expect(doRefresh()).rejects.toThrow(/wrong_section/);
    expect(fs.existsSync(ready())).toBe(false);
  });
  it('R6 adoption 1 needs a baseline; later adoptions refuse one', async () => {
    await expect(doRefresh({ baselineDir: null })).rejects.toThrow(/baseline_missing/);
    await doRefresh();
    SNAP.adopt({ root });
    await expect(doRefresh()).rejects.toThrow(/baseline_not_allowed/);
  });
});

describe('--adopt writes the snapshot and refuses partial or old staging', () => {
  it('A1 adopt writes pages/, manifest (normalizer version, fetch_id -> fetched_at) and adoption-1; G-PROV passes', async () => {
    const { meta } = await doRefresh();
    const { adoptionId, manifest } = SNAP.adopt({ root });
    expect(adoptionId).toBe('adoption-1');
    expect(manifest.normalizer_version).toBe('norm-v1');
    expect(Object.keys(manifest.fetches)).toEqual([meta.fetch_id]);
    expect(manifest.pages.map((p: Json) => p.key)).toEqual(['ch1', 'ch1_5', 'ch1_20']);
    for (const p of manifest.pages) {
      expect(p.fetch_id).toBe(meta.fetch_id);
      expect(p.url).toBe(BASE + PAGE_SET.pages.find((x) => x.key === p.key)!.file);
      expect(p.fetched_at).toMatch(/^2026-10-07T/);
    }
    const text = fs.readFileSync(path.join(seeds, 'manifest.json'), 'utf8');
    expect(text.endsWith('\n') && !text.includes('\r')).toBe(true);
    expect(fs.existsSync(ready())).toBe(false);
    expect(OBS.checkProv({ seeds })).toEqual({ pass: true, violations: [], checked: 3 });
  });
  it('A1b a page status other than retired, or retired without a ruling, is refused (page_set_invalid)', () => {
    for (const bad of [{ status: 'excluded', ruling: 'x' }, { status: 'retired' }]) {
      const ps = { ...PAGE_SET, pages: PAGE_SET.pages.map((p) => (p.key === 'ch1_20' ? { ...p, ...bad } : p)) };
      fs.writeFileSync(path.join(seeds, 'page-set.json'), JSON.stringify(ps));
      expect(() => SNAP.loadPageSet(seeds)).toThrow(/page_set_invalid/);
    }
    const ok = { ...PAGE_SET, pages: PAGE_SET.pages.map((p) => (p.key === 'ch1_20' ? { ...p, status: 'retired', ruling: 'r' } : p)) };
    fs.writeFileSync(path.join(seeds, 'page-set.json'), JSON.stringify(ok));
    expect(SNAP.loadPageSet(seeds).doc.pages[2].status).toBe('retired');
  });
  it('A2 no staging -> no_complete_staging', () => {
    expect(() => SNAP.adopt({ root })).toThrow(/no_complete_staging/);
  });
  it('A3 page-set.json changed after the refresh -> old_staging', async () => {
    await doRefresh();
    const ps = { ...PAGE_SET, version: 2 };
    fs.writeFileSync(path.join(seeds, 'page-set.json'), `${JSON.stringify(ps, null, 2)}\n`);
    expect(() => SNAP.adopt({ root })).toThrow(/old_staging/);
  });
  it('A4 a staged normalized page edited by hand -> staging_tampered', async () => {
    await doRefresh();
    fs.appendFileSync(path.join(ready(), 'pages', 'ch1_5.txt'), ' x');
    expect(() => SNAP.adopt({ root })).toThrow(/staging_tampered/);
  });
  it('A5 a baseline page dropped with no page-set ruling -> undeclared_drop', async () => {
    fs.writeFileSync(path.join(baseline, 'ch900_3.htm'), Buffer.from(page('900.3'), 'latin1'));
    await doRefresh();
    expect(() => SNAP.adopt({ root })).toThrow(/undeclared_drop/);
  });
  it('A6 adoption 2 diffs against the adopted snapshot: a changed page is reported, unchanged ones are not', async () => {
    await doRefresh();
    SNAP.adopt({ root });
    served[fileOf('1.20')] = page('1.20', 'The minimum lot frontage is 15.0 m.');
    const { report } = await doRefresh({ baselineDir: null });
    expect(report.baseline.kind).toBe('adopted');
    expect(Object.fromEntries(report.pages.map((p: Json) => [p.key, p.status]))).toEqual({ ch1: 'unchanged', ch1_5: 'unchanged', ch1_20: 'changed' });
    const { adoptionId } = SNAP.adopt({ root });
    expect(adoptionId).toBe('adoption-2');
    expect(OBS.checkProv({ seeds }).pass).toBe(true);
  });
  it('A7 a staging made against adoption-1 is old once adoption-2 exists', async () => {
    await doRefresh();
    SNAP.adopt({ root });
    await doRefresh({ baselineDir: null });
    const staged = fs.readFileSync(path.join(ready(), 'staging.json'));
    SNAP.adopt({ root }); // adoption-2
    fs.mkdirSync(ready(), { recursive: true });
    fs.cpSync(path.join(seeds, 'pages'), path.join(ready(), 'pages'), { recursive: true });
    fs.writeFileSync(path.join(ready(), 'staging.json'), staged);
    fs.writeFileSync(path.join(ready(), 'change-report.json'), '{}\n');
    expect(() => SNAP.adopt({ root })).toThrow(/old_staging/);
  });
});

describe('G-PROV page arm: one known-bad fixture per reason code, plus the good twin', () => {
  beforeEach(async () => {
    await doRefresh();
    SNAP.adopt({ root });
  });
  const codes = () => OBS.checkProv({ seeds }).violations.map((v: string) => v.split(':')[0]);
  const pagesDir = () => path.join(seeds, 'pages');

  it('P0 good twin: the adopted snapshot passes', () => {
    expect(OBS.checkProv({ seeds }).pass).toBe(true);
  });
  it('P1 manifest_missing', () => {
    fs.rmSync(path.join(seeds, 'manifest.json'));
    expect(codes()).toEqual(['manifest_missing']);
  });
  it('P2 page_set_mismatch (a page pinned in page-set.json but absent from the manifest)', () => {
    const ps = { ...PAGE_SET, pages: [...PAGE_SET.pages, { key: 'ch1_40', role: 'section', section: '1.40', file: fileOf('1.40'), basis: 'M-47' }] };
    fs.writeFileSync(path.join(seeds, 'page-set.json'), JSON.stringify(ps));
    expect(codes()).toEqual(['page_set_mismatch']);
  });
  it('P3 raw_sha_mismatch (raw page edited)', () => {
    fs.appendFileSync(path.join(pagesDir(), 'ch1_20.htm'), '\r\n');
    expect(codes()).toEqual(['raw_sha_mismatch']);
  });
  it('P4 normalized_sha_mismatch (normalized page edited)', () => {
    fs.appendFileSync(path.join(pagesDir(), 'ch1_20.txt'), ' x');
    expect(codes()).toEqual(['normalized_sha_mismatch']);
  });
  it('P5 normalized_not_reproducible (raw + manifest edited together, normalized left behind)', () => {
    const raw = Buffer.from(page('1.20', 'The minimum lot frontage is 9.0 m.'), 'latin1');
    fs.writeFileSync(path.join(pagesDir(), 'ch1_20.htm'), raw);
    const m = JSON.parse(fs.readFileSync(path.join(seeds, 'manifest.json'), 'utf8'));
    m.pages.find((p: Json) => p.key === 'ch1_20').raw_sha256 = SNAP.sha256(raw);
    fs.writeFileSync(path.join(seeds, 'manifest.json'), JSON.stringify(m));
    const a = JSON.parse(fs.readFileSync(path.join(seeds, 'adoptions.json'), 'utf8'));
    a.adoptions[0].pages.ch1_20.raw_sha256 = SNAP.sha256(raw);
    fs.writeFileSync(path.join(seeds, 'adoptions.json'), JSON.stringify(a));
    expect(codes()).toEqual(['normalized_not_reproducible']);
  });
  it('P6 orphan_page_file', () => {
    fs.writeFileSync(path.join(pagesDir(), 'ch99.htm'), 'x');
    expect(codes()).toEqual(['orphan_page_file']);
  });
  it('P7 adoption_mismatch (manifest no longer equals the latest adoption)', () => {
    const a = JSON.parse(fs.readFileSync(path.join(seeds, 'adoptions.json'), 'utf8'));
    a.adoptions[0].pages.ch1_5.normalized_sha256 = '0'.repeat(64);
    fs.writeFileSync(path.join(seeds, 'adoptions.json'), JSON.stringify(a));
    expect(codes()).toEqual(['adoption_mismatch']);
  });
});
