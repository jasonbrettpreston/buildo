// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §6 `amendments[]` + `enacting_source`, §9 G-PROV
//            (amendment arm + enacting-PDF / extraction shas), §10 artifacts (`amendments.json`, `enacting/`);
//            docs/specs/01-pipeline/69_mcbylaw_policy.md M-36 (+ 2026-10-07 note), M-39, §3 (654-2025);
//            docs/reports/mcbylaw-phase1-plan.md S10
//
// S10 locks over the COMMITTED seeds (offline): amendments.json equals a rebuild from the adopted pages, the
// per-page tag counts reconcile with manifest.json, statuses default to not_verified except the two the Spec 69
// rulings verified, the 654-2025 enacting capture matches its pinned shas, and the 600.60.40(3)(C)
// consolidation_mismatch finding is reproducible from the committed texts and still awaits the operator.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module / seed JSON
// A missing module fails every test that uses it (red-first evidence records per-test failures), never silently passes.
const load = (rel: string): Promise<Json> => import(pathToFileURL(path.join(process.cwd(), rel)).href).catch((err: unknown) => ({ importError: String(err) }));
const ROOT = process.cwd();
const SEEDS = path.join(ROOT, 'scripts/seeds/bylaw');
const AM = await load('scripts/analysis/bylaw/amendments.mjs');
const EN = await load('scripts/analysis/bylaw/enacting.mjs');
const SNAP = await load('scripts/analysis/bylaw/snapshot.mjs');
const readJson = (f: string): Json => JSON.parse(fs.readFileSync(path.join(SEEDS, f), 'utf8'));
const exists = (f: string) => fs.existsSync(path.join(SEEDS, f));

const SHA_654 = 'bcfdfef304fa9e290d6cc242f66b98577d16228eca097fe0a0734a08a0040237'; // Spec 69 §3
const URL_654 = 'https://www.toronto.ca/legdocs/bylaws/2025/law0654.pdf'; // Spec 69 §3

describe('amendments.json over the committed adoption (G-PROV amendment arm)', () => {
  it('the arm passes: every tag recorded with a clause path, counts pinned both ways, statuses closed', () => {
    const r = AM.checkAmendments({ seeds: SEEDS });
    expect(r.violations).toEqual([]);
    expect(r.pass).toBe(true);
  });

  it('it equals a rebuild from the adopted pages (byte-identical; authored statuses carried)', () => {
    const committed = fs.readFileSync(path.join(SEEDS, 'amendments.json'), 'utf8');
    expect(SNAP.stableStringify(AM.buildAmendments({ seeds: SEEDS, prior: JSON.parse(committed) }))).toBe(committed);
  });

  it('the singular tag count reconciles with the manifest (875 over 57 pages); the 8 list tags are pinned separately', () => {
    const m = readJson('manifest.json');
    const a = readJson('amendments.json');
    expect(a.adoption_id).toBe(m.adoption_id);
    const manifestTotal = m.pages.reduce((s: number, p: Json) => s + p.tag_count, 0);
    expect(manifestTotal).toBe(875);
    expect(a.totals).toMatchObject({ pages: 57, tags: 875, list_tags: 8, article_level_tags: 0 }); // 0: every tag binds below an article (a markup change that loses the label cells fails here)
    for (const p of m.pages) expect([p.key, a.pages[p.key].tag_count]).toEqual([p.key, p.tag_count]);
    expect(a.tags).toHaveLength(875 + 8);
    expect(a.tags.filter((t: Json) => t.clause_path === null)).toEqual([]);
  });

  it('statuses default to not_verified; only 648-2025 and 654-2025 are in_force, each citing its Spec 69 basis', () => {
    const a = readJson('amendments.json');
    const verified = (Object.values(a.statuses) as Json[]).filter((s) => s.status !== 'not_verified');
    expect(verified.map((s) => [s.bylaw, s.status, s.basis]).sort()).toEqual([
      ['648-2025', 'in_force', 'M-36'],
      ['654-2025', 'in_force', 'M-36'],
    ]);
    expect(a.statuses['654-2025']).toMatchObject({ source_url: URL_654, source_sha256: SHA_654, enacted_on: '2025-06-26' });
    expect(a.statuses['654-2025'].in_force_trigger).toMatch(/648-2025/);
  });

  it('654-2025 tags six clauses, all on the Sixplex Overlay page (Spec 69 §3)', () => {
    const a = readJson('amendments.json');
    const t = a.tags.filter((x: Json) => x.refs.some((r: Json) => r.bylaw === '654-2025'));
    expect(t).toHaveLength(6);
    expect(new Set(t.map((x: Json) => x.page))).toEqual(new Set(['ch600_60']));
    expect(t.map((x: Json) => x.clause_path)).toContain('600.60.40(3)(D)');
  });
});

describe('654-2025 enacting capture (Spec 69 M-36, §3; G-PROV enacting arm)', () => {
  it('the capture is recorded at the official url with the pinned PDF sha, extraction sha and extractor version', () => {
    const c = readJson('enacting/manifest.json').captures['654-2025'];
    expect(c).toMatchObject({ bylaw: '654-2025', url: URL_654, pdf_sha256: SHA_654, pdf_bytes: 2549869, normalizer_version: EN.ENACTING_NORMALIZER_VERSION });
    expect(c.extractor_version).toMatch(/\S/);
    expect(c.fetched_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(exists('enacting/654-2025.pdf')).toBe(false);
  });

  it('the committed extraction and normalized text match their shas and reproduce', () => {
    expect(EN.checkEnacting({ seeds: SEEDS }).violations).toEqual([]);
  });
});

describe('600.60.40(3)(C) consolidation_mismatch finding (Spec 69 M-39) — awaiting the operator', () => {
  const f = () => readJson('enacting/findings.json').findings.find((x: Json) => x.unit === '600.60.40(3)(C)');

  it('the consolidated slice ends at "include:" with no items; the enacting excerpt carries items (i)-(ii)', () => {
    const x = f();
    expect(x.kind).toBe('consolidation_mismatch');
    expect(x.consolidated.text.endsWith('include:')).toBe(true);
    expect(x.enacting.text).toMatch(/include: \(i\) .* \(ii\) /);
    expect(x.enacting.text).toContain('June 26, 2025');
  });

  it('both excerpts reproduce from the committed texts by their markers and shas', () => {
    const x = f();
    const page = fs.readFileSync(path.join(SEEDS, 'pages/ch600_60.txt'), 'utf8');
    const en = fs.readFileSync(path.join(SEEDS, 'enacting/654-2025.txt'), 'utf8');
    for (const [side, text, srcSha] of [
      ['consolidated', page, readJson('manifest.json').pages.find((p: Json) => p.key === 'ch600_60').normalized_sha256],
      ['enacting', en, readJson('enacting/manifest.json').captures['654-2025'].normalized_sha256],
    ]) {
      const e = EN.excerpt(text, x[side].start_marker, x[side].end_marker);
      expect([side, e.text, e.sha256]).toEqual([side, x[side].text, x[side].sha256]);
      expect(x[side].source_normalized_sha256).toBe(srcSha);
    }
  });

  it('it is NOT adjudicated here: no adjudicator, status awaiting_operator, cites M-39', () => {
    expect(f()).toMatchObject({ status: 'awaiting_operator', adjudicator: null, ruling: 'M-39' });
  });
});

describe('S10 seeds are LF and sorted-key stable', () => {
  it.each(['amendments.json', 'enacting/manifest.json', 'enacting/findings.json'])('%s', (file) => {
    const text = fs.readFileSync(path.join(SEEDS, file), 'utf8');
    expect(text.includes('\r')).toBe(false);
    expect(SNAP.stableStringify(JSON.parse(text))).toBe(text);
  });
});
