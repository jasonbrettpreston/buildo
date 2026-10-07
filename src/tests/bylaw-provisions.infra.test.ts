// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §9 G-PROV (page shas), §6.4 rules 1 + 10,
//            §10 (determinism rules; clock.mjs the one exemption), §12 (infra: page-set equality);
//            docs/specs/01-pipeline/69_mcbylaw_policy.md M-37, M-47, M-15 v0.5 note; docs/reports/mcbylaw-phase1-plan.md S3
//
// S3 locks over the COMMITTED snapshot (offline): the G-PROV page-sha lock, the pinned page set
// against the rulings that define it, and the determinism grep lock over the generator modules.
// S8 extends this file (check()/selfTest() import, real-universe G-TEXT/G-UNIVERSE).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module / seed JSON
// A missing module fails every test that uses it (red-first evidence records per-test failures), never silently passes.
const load = (rel: string): Promise<Json> => import(pathToFileURL(path.join(process.cwd(), rel)).href).catch((err: unknown) => ({ importError: String(err) }));
const ROOT = process.cwd();
const SEEDS = path.join(ROOT, 'scripts/seeds/bylaw');
const OBS = await load('scripts/analysis/bylaw/observable.mjs');
const SNAP = await load('scripts/analysis/bylaw/snapshot.mjs');
const readJson = (f: string): Json => JSON.parse(fs.readFileSync(path.join(SEEDS, f), 'utf8'));

describe('G-PROV page-sha lock on the committed snapshot', () => {
  it('every pinned page matches the manifest shas, reproduces under the current normalizer, and equals the latest adoption', () => {
    const r = OBS.checkProv({ seeds: SEEDS });
    expect(r.violations).toEqual([]);
    expect(r.pass).toBe(true);
    expect(r.checked).toBe(readJson('page-set.json').pages.length);
  });

  it('the manifest records url, fetch_id -> fetched_at and the normalizer version; never an mtime', () => {
    const ps = readJson('page-set.json');
    const m = readJson('manifest.json');
    expect(m.normalizer_version).toBe(SNAP.NORMALIZER_VERSION);
    for (const p of m.pages) {
      expect(m.fetches[p.fetch_id]).toBeDefined();
      expect(p.fetched_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(p.url).toBe(ps.base_url + ps.pages.find((x: Json) => x.key === p.key).file);
      expect(p.consolidation).toEqual({ version_date: expect.any(String), amendments_up_to: expect.any(String) });
    }
    expect(JSON.stringify(m)).not.toMatch(/mtime/i);
  });

  it('seed JSON is LF, newline-terminated and sorted-key stable', () => {
    for (const f of ['manifest.json', 'adoptions.json']) {
      const text = fs.readFileSync(path.join(SEEDS, f), 'utf8');
      expect(text.includes('\r')).toBe(false);
      expect(SNAP.stableStringify(JSON.parse(text))).toBe(text);
    }
  });
});

describe('pinned page set equals the rulings (Spec 68 §6.4 rule 1; Spec 69 M-37, M-47, M-15)', () => {
  const ps = readJson('page-set.json');
  const sections = new Set(ps.pages.filter((p: Json) => p.role === 'section').map((p: Json) => p.section));

  it('one page per TOC section, at the section URL; exactly one TOC root page', () => {
    for (const p of ps.pages.filter((x: Json) => x.role === 'section')) {
      expect(p.file).toBe(`ZBL_NewProvision_Chapter${p.section.replace('.', '_')}.htm`);
    }
    expect(ps.pages.filter((p: Json) => p.role === 'toc_root').map((p: Json) => p.file)).toEqual(['ZBL_NewProvision_Chapter1.htm']);
  });

  it('M-37 and every M-47 section and carve-in clause page is pinned; Ch.900 exception pages are not (M-15)', () => {
    const m47 = ['1.20', '1.40', '150.15', '150.20', '150.22', '150.25', '150.30', '150.45', '150.48', '150.50', '200.10', '200.15', '200.20', '200.25', '970.30', '995.20', '995.30', '995.41', '995.50', '995.60'];
    for (const s of ['600.60', ...m47]) expect(sections.has(s)).toBe(true);
    for (const ch of ['220', '230']) expect([...sections].some((s) => String(s).startsWith(`${ch}.`))).toBe(true);
    const carve = ps.pages.flatMap((p: Json) => p.carve_in || []).sort();
    expect(carve).toEqual(['15.10.40.50', '40.10.20.10', '40.10.40.10', '80.10.40.40', '80.5.40.40']);
    for (const s of ['150.13', '970.10']) expect(sections.has(s)).toBe(true); // pinned in Phase 0, never sliced (M-47 defect)
    for (const s of ['900.2', '900.3', '900.4', '900.5', '900.6']) expect(sections.has(s)).toBe(false);
    // Operator S3 ruling 2026-10-07 (M-47 note): Ch.230 = residential sections only; M-37 note: 600.10 / 600.50 are Phase 2.
    // Ch.230: 230.5/.10/.90 live; the six zone-category sections are RETIRED (pinned, sha-checked, rows scoped out at S5); none excluded.
    const retired = ['230.20', '230.30', '230.40', '230.50', '230.60', '230.80'];
    expect([...sections].filter((s) => String(s).startsWith('230.')).sort(SNAP.cmpSection)).toEqual(['230.5', '230.10', ...retired, '230.90']);
    expect(ps.pages.filter((p: Json) => p.status).map((p: Json) => [p.section, p.status])).toEqual(retired.map((s) => [s, 'retired']));
    const m = readJson('manifest.json');
    for (const s of retired) expect(m.pages.find((p: Json) => p.section === s).status).toBe('retired');
    expect(ps.excluded_by_ruling).toEqual([]);
    for (const s of ['600.10', '600.50']) expect(sections.has(s)).toBe(false);
  });
});

describe('determinism grep lock (Spec 68 §10): generator + scripts/analysis/bylaw/, clock.mjs exempt', () => {
  const files = [
    'scripts/generate-bylaw-provisions.mjs',
    ...fs.readdirSync(path.join(ROOT, 'scripts/analysis/bylaw')).filter((f) => f.endsWith('.mjs')).map((f) => `scripts/analysis/bylaw/${f}`),
  ].filter((f) => !f.endsWith('/clock.mjs'));
  const banned: [string, RegExp][] = [
    ['process.exit()', /process\.exit\s*\(/],
    ['new Date', /new Date\b/],
    ['Date.now', /Date\.now\s*\(/],
    ['Math.random', /Math\.random/],
    ['locale API', /toLocale\w*\s*\(|\bIntl\./],
    ['file mtime', /\.(mtime|mtimeMs|ctime|birthtime)\b/],
    ['empty catch', /catch\s*(\([^)]*\))?\s*\{\s*\}/],
  ];
  it.each(files)('%s has no clock, locale, mtime, process.exit or empty catch', (f) => {
    const text = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const [name, re] of banned) expect({ file: f, banned: name, hit: re.test(text) }).toEqual({ file: f, banned: name, hit: false });
  });
});
