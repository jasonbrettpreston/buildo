// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.7, §1.10, §8.2, §10.3 (R-T)
// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §7
//
// WF1 "conversion roadmap" (2026-09-10). Mirrors programme-backlog.infra.
// test.ts's own canary discipline: no unexecuted claim, both directions
// proven with committed fixtures, totality proven rather than assumed.
//
// (a) byte-identical drift guard — the same --check contract every
//     scripts/violations/*.mjs generator in this estate carries.
// (b) counts re-derived INDEPENDENTLY here (not copied from the plan's own
//     prose, which this WF1 measured and found drifted on two points — see
//     the "measured, not the plan's stated" describe below) and asserted
//     against the rendered table.
// (c) both directions — a fixture census with a mismatched archetype for an
//     already-converted slug throws; a fixture census missing a remaining
//     slug's row throws (totality, the other direction).
// (d) totality — every one of the 52 remaining files (+ 1 pending since batch1 I3 commit 1,
//     2026-09-14 — assert_engine_health red_suite, R-K.1) appears exactly once across C4/C5/C6/pending.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const REPO_ROOT = path.resolve(__dirname, '../../');
const GENERATOR = path.join(REPO_ROOT, 'scripts/violations/generate-conversion-roadmap.mjs');
const GENERATED_PATH = path.join(REPO_ROOT, 'docs/reports/generated/122-conversion-roadmap.md');
const CENSUS_PATH = path.join(REPO_ROOT, 'scripts/steps/_schema/step-archetype-census.json');
const CENSUS_SCHEMA_PATH = path.join(REPO_ROOT, 'scripts/steps/_schema/step-archetype-census.schema.json');
const MANIFEST_PATH = path.join(REPO_ROOT, 'scripts/manifest.json');
const CONVERTED_PATH = path.join(REPO_ROOT, 'scripts/steps/_schema/converted.json');
const BAD_MISMATCH_FIXTURE = 'scripts/steps/_schema/fixtures/census/bad-mismatched-archetype.json';
const BAD_TOTALITY_FIXTURE = 'scripts/steps/_schema/fixtures/census/missing-slug-totality.json';

interface ManifestScriptEntry {
  file: string | null;
}
interface Manifest {
  scripts: Record<string, ManifestScriptEntry>;
  chains: Record<string, string[]>;
}
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')) as Manifest;
const convertedRaw = JSON.parse(fs.readFileSync(CONVERTED_PATH, 'utf8')) as {
  converted: string[];
  pending: Array<{ file: string } | string>;
};
const CONVERTED: string[] = convertedRaw.converted.map((f) => f.replace(/\\/g, '/'));
const PENDING_FILES: string[] = convertedRaw.pending.map((p) => (typeof p === 'string' ? p : p.file).replace(/\\/g, '/'));

// ---------------------------------------------------------------------------
// 1. Census schema validity (AJV)
// ---------------------------------------------------------------------------
describe('step-archetype-census.json — schema validity', () => {
  it('validates against step-archetype-census.schema.json', async () => {
    const Ajv = (await import('ajv')).default;
    const schema = JSON.parse(fs.readFileSync(CENSUS_SCHEMA_PATH, 'utf8'));
    const data = JSON.parse(fs.readFileSync(CENSUS_PATH, 'utf8'));
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(schema);
    const ok = validate(data);
    expect(ok, JSON.stringify(validate.errors, null, 2)).toBe(true);
  });

  it('declares exemptions[] (Ask A2 + Spec 124 R-AP) — never empty, one row per non-JS/null-file manifest slug PLUS the RUNNER-owned class', () => {
    const data = JSON.parse(fs.readFileSync(CENSUS_PATH, 'utf8')) as { exemptions: Array<{ slug: string; reason: string }> };
    expect(data.exemptions.length).toBeGreaterThan(0);
    const slugs = data.exemptions.map((e) => e.slug).sort();
    // Spec 124 R-AP (batch-2 Phase 0.8, 2026-09-15): the totality lock moves 2 -> 3.
    // `reconcile` is NOT a conversion and NOT a no-JS-file exemption — it is the
    // third, named class: a RUNNER-owned concern (Spec 122 §4/§7.3 row 4/§7.4 A3).
    expect(slugs).toEqual(['coa_documents', 'inspections', 'reconcile']);
    const inspections = data.exemptions.find((e) => e.slug === 'inspections');
    expect(inspections?.reason).toBe('python_step_excluded');
    const reconcile = data.exemptions.find((e) => e.slug === 'reconcile');
    expect(reconcile?.reason).toBe('runner_owned');
  });

  it('declares at least one entry (an empty census is never a vacuous pass)', () => {
    const data = JSON.parse(fs.readFileSync(CENSUS_PATH, 'utf8')) as { entries: unknown[] };
    expect(data.entries.length).toBeGreaterThan(0);
  });

  it('has no duplicate slugs', () => {
    const data = JSON.parse(fs.readFileSync(CENSUS_PATH, 'utf8')) as { entries: Array<{ slug: string }> };
    const slugs = data.entries.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

// ---------------------------------------------------------------------------
// 2. Counts re-derived INDEPENDENTLY (never copied from the plan's own
//    prose) — this is the "did I actually re-execute the premise" proof
//    Step 0 of the executor's own instructions demanded.
// ---------------------------------------------------------------------------
describe('measured counts — independently re-derived, not transcribed from the plan', () => {
  // Spec 124 R-AP: a `runner_owned` exemption names a REAL JS file, so this
  // independent re-derivation must subtract the declared exemption set, not just
  // the python/null-file ones — otherwise it would re-count `reconcile` as a
  // remaining conversion the roadmap no longer carries. Derived from the census
  // (R-AN: never a retyped slug list).
  const EXEMPT_SLUGS = new Set(
    (JSON.parse(fs.readFileSync(CENSUS_PATH, 'utf8')) as { exemptions: Array<{ slug: string }> }).exemptions.map((e) => e.slug),
  );

  function fileToSlugsMap(): Record<string, string[]> {
    const map: Record<string, string[]> = {};
    for (const [slug, e] of Object.entries(manifest.scripts)) {
      if (!e.file || e.file.endsWith('.py')) continue;
      if (EXEMPT_SLUGS.has(slug)) continue;
      (map[e.file] = map[e.file] || []).push(slug);
    }
    return map;
  }

  it('47 remaining files, 49 remaining slugs (excluding the 16 converted, 0 pending, the 1 python-exempt file and the 1 RUNNER-owned exemption — `reconcile`, Spec 124 R-AP, 2026-09-15)', () => {
    const fileToSlugs = fileToSlugsMap();
    const convertedSet = new Set(CONVERTED);
    const pendingSet = new Set(PENDING_FILES);
    const remaining = Object.keys(fileToSlugs).filter((f) => !convertedSet.has(f) && !pendingSet.has(f));
    const remainingSlugCount = remaining.reduce((n, f) => n + (fileToSlugs[f]?.length ?? 0), 0);
    // 51 -> 50 files and 53 -> 52 slugs: link_neighbourhoods joined `pending[]` at batch-2 I4
    // commit 1 (2026-09-16), so its file leaves the remaining set. ONE slug, not two: the
    // roadmap keys `fileToSlugs` off `manifest.scripts`, where this file appears once — its
    // two CHAIN memberships (permits, sources) are not two script entries.
    // 50 -> 49 files and 52 -> 51 slugs: geocode_permits joined `pending[]` at the batch-2 I5
    // FOLDED commit 5 (2026-09-16). Same one-slug-not-two arithmetic, and for the same reason
    // — this step is ALSO a two-chain member (permits 8/33, sources 4/28) with a single
    // `manifest.scripts` entry.
    // 49 -> 48 files and 51 -> 50 slugs: assert_parcel_sanity's batch2 P1.1 CUTOVER
    // (converted.json converted[], 2026-09-18) moves its file straight from `remaining`
    // into `convertedSet` (its own conversion never needed a separate pending[]->converted[]
    // step visible to THIS test, since PENDING_FILES was already 0 by the time this ran).
    expect(remaining.length).toBe(47);
    expect(remainingSlugCount).toBe(49);
    // Unchanged across the I5 CUTOVER: the file moved from `pending[]` to `converted[]`, and
    // both sets are excluded from `remaining`, so 49/51 holds on both sides of commit 9.
  });

  it('the census file-count-by-batch matches the independently re-derived C4/C5/C6 split (C4=0 — CLOSED, C5=13 — `reconcile` left C5 for the R-AP RUNNER-owned exemption, 2026-09-15 — C6=36; pending=0 — geocode_permits flipped C4 -> pending at the batch-2 I5 folded commit 5 and was RETAINED as status:\"converted\" at its commit 9 the same day, emptying C4 entirely; link_neighbourhoods was pending from batch-2 I4 commit 1 and converted at commit 3, both on 2026-09-16; assert_engine_health\'s own row was deleted entirely at batch1 I3 commit 9, 2026-09-14, mirroring the assert_data_bounds/I2 commit 9 cutover precedent)', () => {
    const census = JSON.parse(fs.readFileSync(CENSUS_PATH, 'utf8')) as { entries: Array<{ slug: string; file: string; batch: string; status?: string }> };
    const fileToSlugs = fileToSlugsMap();
    const convertedSet = new Set(CONVERTED);
    const pendingSet = new Set(PENDING_FILES);
    const remaining = Object.keys(fileToSlugs).filter((f) => !convertedSet.has(f) && !pendingSet.has(f));
    const byBatch = new Map<string, Set<string>>([
      ['C4', new Set<string>()],
      ['C5', new Set<string>()],
      ['C6', new Set<string>()],
      ['pending', new Set<string>()],
    ]);
    for (const e of census.entries) {
      // Spec 124 R-AO retention (2026-09-15): a status:"converted" row is kept
      // THROUGH cutover so fast invariant #25 has an independently-authored
      // archetype to compare the descriptor against. It carries its PRE-cutover
      // `batch` verbatim (never rewritten), so it must not be counted against the
      // REMAINING batch split this test re-derives — the file is already converted.
      if (e.status === 'converted') continue;
      byBatch.get(e.batch)?.add(e.file);
    }
    const c4 = byBatch.get('C4')!;
    const c5 = byBatch.get('C5')!;
    const c6 = byBatch.get('C6')!;
    const pendingBatch = byBatch.get('pending')!;
    // assert_engine_health's census row flipped from batch:"C4" to batch:"pending" at
    // batch1 I3 commit 1 (2026-09-14) — C4 dropped 3→2, pending rose 0→1 — then was
    // DELETED ENTIRELY at commit 9 (this cutover), mirroring assert_data_bounds's own
    // commit 9 (I2) census-row deletion: pending falls back to 0, C4 stays at 2 (the
    // row was already out of C4 before deletion, so deletion does not restore it).
    // 2 -> 1: link_neighbourhoods flipped C4 -> pending at batch-2 I4 commit 1 (2026-09-16),
    // the same move assert_engine_health made at batch1 I3 commit 1. ⚠️ That flip was MISSED
    // in commit 1 itself and landed the tree RED for three commits: `buildRoadmap` THROWS
    // when a file is in `pending[]` while its census row still names a batch, and nothing
    // caught it because the pre-commit hook runs `vitest related` on STAGED files only and
    // this suite is related to neither the census nor converted.json by import. Found by the
    // Integration seat at the OUTPUT panel; fixed in its own commit.
    // 1 -> 0: geocode_permits was C4's LAST member and flipped to `pending` at the batch-2 I5
    // folded commit 5 (2026-09-16), the same move link_neighbourhoods made at I4 commit 1 and
    // assert_engine_health at batch1 I3 commit 1. C4 is now EMPTY, which is the batch closing,
    // not a count going stale — every one of its five steps has been converted or is in flight.
    expect(c4.size).toBe(0);
    // 13 -> 12 at batch2 P1.1 commit 1 (2026-09-18): assert_parcel_sanity's own
    // census row flipped batch "C5" -> "pending" (mirroring the same C4->pending
    // move every other in-flight conversion makes at ITS commit 1) — mechanically
    // re-counted from the live census file, not retyped.
    expect(c5.size).toBe(11);
    // 1 -> 0 at the I4 CUTOVER (commit 3): the row is RETAINED with `status: "converted"`
    // (Spec 124 R-AO) rather than deleted, but `byBatch` counts only rows the roadmap still
    // treats as pending work, and a converted row is no longer that.
    // 0 -> 1 at the batch-2 I5 FOLDED commit 5 (2026-09-16): geocode_permits' row is the
    // one in flight. It falls back to 0 at that step's own cutover, when the row is RETAINED
    // with `status: "converted"` (Spec 124 R-AO) and therefore stops counting as pending work.
    // 1 -> 0 at the I5 CUTOVER (commit 9): the row is RETAINED with `status: "converted"`
    // (Spec 124 R-AO) rather than deleted, but `byBatch` counts only rows the roadmap still
    // treats as pending work, and a converted row is no longer that. C4 is now empty and
    // pending is empty: batch C4 is CLOSED.
    expect(pendingBatch.size).toBe(0);
    expect(c6.size).toBe(36);
    expect(c4.size + c5.size + c6.size).toBe(remaining.length);
  });

  it('measured drift from the plan\'s OWN stated bucket table (§1: "ds 4"): the real C6 deep_scrapes chain-bucket is 3 (assert_engine_health is now pending (batch1 I3 commit 1, 2026-09-14) and assert_data_bounds is fully converted — neither is a C6 remainder, so neither is double-counted here), and 2 orphan scripts (reclassify_all, observe_chain) have NO manifest.chains membership at all and are not covered by ANY of the plan\'s 6 named buckets', () => {
    const orphanSlugs = ['reclassify_all', 'observe_chain'];
    for (const slug of orphanSlugs) {
      const inAnyChain = Object.values(manifest.chains).some((slugs) => slugs.includes(slug));
      expect(inAnyChain, `${slug} must have zero manifest.chains membership (the measured finding)`).toBe(false);
    }
    const census = JSON.parse(fs.readFileSync(CENSUS_PATH, 'utf8')) as { entries: Array<{ slug: string; batch: string }> };
    const c4c5Slugs = new Set(census.entries.filter((e) => e.batch === 'C4' || e.batch === 'C5').map((e) => e.slug));
    const pendingSet = new Set(PENDING_FILES);
    const dsOnlySlugs = (manifest.chains.deep_scrapes || []).filter((s) => {
      const file = manifest.scripts[s]?.file;
      return file && !CONVERTED.includes(file) && !file.endsWith('.py') && !c4c5Slugs.has(s) && !pendingSet.has(file);
    });
    expect(dsOnlySlugs.length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// 3. The generated report never drifts from its 5 declared inputs
// ---------------------------------------------------------------------------
describe('docs/reports/generated/122-conversion-roadmap.md — generated, drift-guarded', () => {
  it('exists', () => {
    expect(fs.existsSync(GENERATED_PATH)).toBe(true);
  });

  it('a fresh run of the generator produces byte-identical output to the committed file (no drift)', () => {
    const result = execFileSync('node', [GENERATOR, '--check'], { cwd: REPO_ROOT, encoding: 'utf8' });
    expect(result).toContain('clean — no drift');
  });

  it('RED — a stale committed file is caught by --check (mutate a copy, prove the checker fires, restore)', () => {
    const original = fs.readFileSync(GENERATED_PATH, 'utf8');
    try {
      fs.writeFileSync(GENERATED_PATH, `${original}\nSTALE APPEND — this line should never survive a real regenerate\n`);
      let threw = false;
      try {
        execFileSync('node', [GENERATOR, '--check'], { cwd: REPO_ROOT, encoding: 'utf8', stdio: 'pipe' });
      } catch {
        threw = true;
      }
      expect(threw, '--check must exit non-zero on a stale generated file').toBe(true);
    } finally {
      fs.writeFileSync(GENERATED_PATH, original);
    }
  });

  // Spec 124 R-AN (2026-09-15) — fleet counts are DERIVED from the committed
  // registries (manifest.scripts minus converted.json minus the census's
  // declared exemptions), never retyped per cutover. Before this the two
  // literals `**52**`/`**54**` had to be hand-edited at every single cutover;
  // they went red at R-AP for exactly that reason and not because the roadmap
  // was wrong. The PREMISE of the assertion is unchanged: the rendered header
  // must agree with a count this test derives for itself.
  it('the rendered table\'s counts agree with the independently re-derived counts above (derived, never retyped — R-AN)', () => {
    const text = fs.readFileSync(GENERATED_PATH, 'utf8');
    const census = JSON.parse(fs.readFileSync(CENSUS_PATH, 'utf8')) as { exemptions: Array<{ slug: string }> };
    const exemptSlugs = new Set(census.exemptions.map((e) => e.slug));
    const convertedSet = new Set(CONVERTED);
    const pendingSet = new Set(PENDING_FILES);
    const fileToSlugs: Record<string, string[]> = {};
    for (const [slug, e] of Object.entries(manifest.scripts)) {
      if (!e.file || e.file.endsWith('.py') || exemptSlugs.has(slug)) continue;
      (fileToSlugs[e.file] = fileToSlugs[e.file] || []).push(slug);
    }
    const remainingFiles = Object.keys(fileToSlugs).filter((f) => !convertedSet.has(f) && !pendingSet.has(f));
    const remainingSlugs = remainingFiles.reduce((n, f) => n + (fileToSlugs[f]?.length ?? 0), 0);
    const pendingFiles = Object.keys(fileToSlugs).filter((f) => pendingSet.has(f));
    const pendingSlugs = pendingFiles.reduce((n, f) => n + (fileToSlugs[f]?.length ?? 0), 0);
    expect(text).toContain(`Remaining files: **${remainingFiles.length}** (+ **${pendingFiles.length}** pending)`);
    expect(text).toContain(`remaining slugs: **${remainingSlugs}** (+ **${pendingSlugs}** pending)`);
    // Never a vacuous pass: the derivation must still be measuring a real fleet.
    expect(remainingFiles.length).toBeGreaterThan(40);
  });
});

// ---------------------------------------------------------------------------
// 4. Both directions — the two "refuses to emit" throws, proven with
//    committed fixtures (never a synthetic in-memory-only claim).
// ---------------------------------------------------------------------------
describe('generate-conversion-roadmap.mjs — both-directions throws (fixture-proven)', () => {
  it('RED — a census row for an already-converted slug whose archetype disagrees with its real descriptor throws', () => {
    let threw = false;
    let stderr = '';
    try {
      execFileSync('node', [GENERATOR, '--check'], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        stdio: 'pipe',
        env: { ...process.env, BUILDO_CENSUS_PATH: BAD_MISMATCH_FIXTURE },
      });
    } catch (err) {
      threw = true;
      stderr = String((err as { stderr?: string }).stderr ?? '') + String((err as { message?: string }).message ?? '');
    }
    expect(threw, 'a mismatched archetype for a converted slug must throw, never silently render').toBe(true);
    expect(stderr).toMatch(/link_wsib[\s\S]*declares archetype "LINK"[\s\S]*real descriptor says "MATCHER"/);
  });

  it('RED — a remaining slug with NO census row at all throws (totality, the other direction)', () => {
    let threw = false;
    let stderr = '';
    try {
      execFileSync('node', [GENERATOR, '--check'], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        stdio: 'pipe',
        env: { ...process.env, BUILDO_CENSUS_PATH: BAD_TOTALITY_FIXTURE },
      });
    } catch (err) {
      threw = true;
      stderr = String((err as { stderr?: string }).stderr ?? '') + String((err as { message?: string }).message ?? '');
    }
    expect(threw, 'a remaining slug with no census row must throw, never silently omit itself from the table').toBe(true);
    // RE-POINTED at the I5 cutover (2026-09-16): the fixture used to omit `geocode_permits`,
    // which this cutover CONVERTS — and a converted slug's absence no longer makes a
    // REMAINING slug rowless, so the fixture had quietly stopped proving its own claim. It
    // now omits `backup_db`, which is still remaining (C6). The class this guards against is
    // the fixture, not the checker: a known-bad fixture built by mutating real data goes
    // vacuous the moment the real data moves past the mutation.
    expect(stderr).toMatch(/no census row for remaining slug "backup_db"/);
  });

  it('GREEN — the real, committed census carries neither defect (both fixtures are genuinely mutations of the real data, not independently-authored)', () => {
    const out = execFileSync('node', [GENERATOR, '--check'], { cwd: REPO_ROOT, encoding: 'utf8' });
    expect(out).toContain('clean — no drift');
  });
});

// ---------------------------------------------------------------------------
// 5. Totality — every remaining file appears exactly once, via the real
//    module's own exported buildRoadmap() (in-process, no spawn needed —
//    this generator, unlike step-validate.mjs, has no import-time CLI
//    side effect gated behind isEntry).
// ---------------------------------------------------------------------------
interface RoadmapModule {
  loadManifest: () => Manifest;
  loadConverted: () => { converted: string[]; pending: Array<{ file: string; stage?: string }> };
  loadCensus: () => { entries: Array<{ slug: string; file: string; archetype: string; batch: string; reason: string }>; exemptions: Array<{ slug: string; file: string | null; reason: string; ruling: string; scope: string }> };
  loadProgrammeItems: () => unknown[];
  loadTemplateFreeze: () => Array<{ archetype: string; proven: boolean; first_step: string | null }>;
  parseChurnTable: (text: string) => Map<string, { quadrant: string | null }>;
  buildRoadmap: (args: unknown) => Array<{ file: string; batch: string; pending: boolean; slugs: string[] }>;
  render: (rows: unknown[], manifest: Manifest, exemptions?: unknown[], convertedInfo?: unknown) => string;
}

async function loadRealArgs(mod: RoadmapModule) {
  const manifestLoaded = mod.loadManifest();
  const convertedInfo = mod.loadConverted();
  const { entries: census, exemptions } = mod.loadCensus();
  const programmeItems = mod.loadProgrammeItems();
  const archetypeProfiles = mod.loadTemplateFreeze();
  const churn = mod.parseChurnTable(fs.readFileSync(path.join(REPO_ROOT, 'docs/reports/generated/122-churn-complexity.md'), 'utf8'));
  return { manifest: manifestLoaded, convertedInfo, census, exemptions, programmeItems, churn, archetypeProfiles };
}

describe('buildRoadmap() — totality over the real committed data (HIGH-1: slug-grain, exemptions included)', () => {
  it('every remaining-or-pending file appears in exactly one row, C4 ∪ C5 ∪ C6 partition is exact', async () => {
    const mod = (await import(pathToFileURL(GENERATOR).href)) as unknown as RoadmapModule;
    const args = await loadRealArgs(mod);
    const rows = mod.buildRoadmap(args);

    const files = rows.map((r) => r.file);
    expect(new Set(files).size, 'no file appears twice').toBe(files.length);
    // R-AN: derived from the same registries the generator reads, never retyped.
    const exemptSlugs = new Set(args.exemptions.map((e) => (e as { slug: string }).slug));
    const convertedSet = new Set(args.convertedInfo.converted);
    const expectedFiles = new Set(
      Object.entries(args.manifest.scripts)
        .filter(([slug, e]) => e.file && !e.file.endsWith('.py') && !exemptSlugs.has(slug) && !convertedSet.has(e.file))
        .map(([, e]) => e.file as string),
    );
    expect(rows.length).toBe(expectedFiles.size);
    expect(rows.filter((r) => r.pending).length).toBe(args.convertedInfo.pending.length);
    for (const r of rows) {
      expect(['C4', 'C5', 'C6', 'pending']).toContain(r.batch);
      expect(r.pending).toBe(r.batch === 'pending');
    }
  });

  it('HIGH-1 + R-AP: the 3 declared exemptions (inspections, coa_documents, reconcile) are NOT silently dropped — 68 total manifest slugs = 14 converted + 0 pending + 3 exempted + 51 remaining', async () => {
    const mod = (await import(pathToFileURL(GENERATOR).href)) as unknown as RoadmapModule;
    const args = await loadRealArgs(mod);
    expect(args.exemptions.map((e) => e.slug).sort()).toEqual(['coa_documents', 'inspections', 'reconcile']);
    const rows = mod.buildRoadmap(args);
    const remainingSlugs = rows.filter((r) => !r.pending).reduce((n, r) => n + r.slugs.length, 0);
    const pendingSlugs = rows.filter((r) => r.pending).reduce((n, r) => n + r.slugs.length, 0);
    const totalSlugs = Object.keys(args.manifest.scripts).length;
    // Spec 124 R-AN (2026-09-15): the converted count is DERIVED from
    // converted.json, never retyped per cutover.
    const convertedSlugCount = CONVERTED.length;
    expect(totalSlugs).toBe(68);
    expect(convertedSlugCount + pendingSlugs + args.exemptions.length + remainingSlugs).toBe(totalSlugs);
    expect(pendingSlugs).toBe(0);
    // batch2 P1.1 cutover (2026-09-18): CONVERTED grew 14->15 (assert_parcel_sanity);
    // batch-2 row 2.1 cutover (2026-09-18): CONVERTED grew 15->16 (enrich_ravines),
    // derived from converted.json (see convertedSlugCount above, never retyped) — the
    // remaining count is 68 - 16 converted - 0 pending - 3 exempted = 49, mechanically
    // computed by buildRoadmap() itself, not guessed.
    expect(remainingSlugs).toBe(49);
  });

  it('the rendered report never silently drops the 3 exemptions — all appear in the Declared exemptions table and the totality sentence states IDENTITY HOLDS', async () => {
    const mod = (await import(pathToFileURL(GENERATOR).href)) as unknown as RoadmapModule;
    const args = await loadRealArgs(mod);
    const rows = mod.buildRoadmap(args);
    const rendered = mod.render(rows, args.manifest, args.exemptions, args.convertedInfo);
    expect(rendered).toContain('## Declared exemptions');
    expect(rendered).toContain('inspections');
    expect(rendered).toContain('python_step_excluded');
    expect(rendered).toContain('coa_documents');
    expect(rendered).toContain('no_file');
    expect(rendered).toContain('reconcile');
    expect(rendered).toContain('runner_owned');
    expect(rendered).toContain('IDENTITY HOLDS');
    expect(rendered).not.toContain('IDENTITY VIOLATED');
  });
});

describe('buildRoadmap() — both directions on declared exemptions (HIGH-1)', () => {
  const REAL_CENSUS = JSON.parse(fs.readFileSync(CENSUS_PATH, 'utf8')) as { entries: unknown[]; exemptions: Array<{ slug: string; file: string | null; reason: string; ruling: string; scope: string }> };

  it('RED — a manifest slug with no JS file (python or file:null) that is NOT declared exempt throws', async () => {
    const mod = (await import(pathToFileURL(GENERATOR).href)) as unknown as RoadmapModule;
    const args = await loadRealArgs(mod);
    const withoutInspectionsExemption = { ...args, exemptions: args.exemptions.filter((e) => e.slug !== 'inspections') };
    expect(() => mod.buildRoadmap(withoutInspectionsExemption)).toThrow(/slug "inspections".*has no JS file to convert and is NOT a declared exemption/);
  });

  it('RED — an exemption naming the wrong file for its slug throws', async () => {
    const mod = (await import(pathToFileURL(GENERATOR).href)) as unknown as RoadmapModule;
    const args = await loadRealArgs(mod);
    const badFile = { ...args, exemptions: args.exemptions.map((e) => (e.slug === 'inspections' ? { ...e, file: 'scripts/wrong-file.py' } : e)) };
    expect(() => mod.buildRoadmap(badFile)).toThrow(/slug "inspections" declares file.*but manifest.scripts says/);
  });

  it('GREEN — the real, committed exemptions (3: inspections, coa_documents, reconcile) never throw', async () => {
    const mod = (await import(pathToFileURL(GENERATOR).href)) as unknown as RoadmapModule;
    const args = await loadRealArgs(mod);
    expect(() => mod.buildRoadmap(args)).not.toThrow();
    expect(REAL_CENSUS.exemptions).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Spec 124 §5 R-AP (batch-2 Phase 0.8, 2026-09-15) — the RUNNER-owned exemption
// class, proven BOTH directions. The lock exists because the class is the only
// exemption reason allowed to name a real JS file: without the inverse arm it
// would degrade into a catch-all that silently absorbs the no_file/python cases,
// and without the forward arm the pre-R-AP "real JS file is never exempt" rule
// would still refuse `reconcile`.
// ---------------------------------------------------------------------------
describe('buildRoadmap() — the R-AP RUNNER-owned exemption class, both directions', () => {
  it('RED (pre-R-AP behaviour, preserved) — an exemption naming a real JS file with any OTHER reason still throws', async () => {
    const mod = (await import(pathToFileURL(GENERATOR).href)) as unknown as RoadmapModule;
    const args = await loadRealArgs(mod);
    const wrongReason = {
      ...args,
      exemptions: args.exemptions.map((e) => (e.slug === 'reconcile' ? { ...e, reason: 'chain_head_infrastructure' } : e)),
    };
    expect(() => mod.buildRoadmap(wrongReason)).toThrow(/slug "reconcile" has a real JS file .* not eligible for a "chain_head_infrastructure" exemption/);
  });

  it('RED (the inverse) — a `runner_owned` exemption on a slug with NO real JS file throws, so the class can never absorb a no_file/python case', async () => {
    const mod = (await import(pathToFileURL(GENERATOR).href)) as unknown as RoadmapModule;
    const args = await loadRealArgs(mod);
    const absorbed = {
      ...args,
      exemptions: args.exemptions.map((e) => (e.slug === 'inspections' ? { ...e, reason: 'runner_owned' } : e)),
    };
    expect(() => mod.buildRoadmap(absorbed)).toThrow(/slug "inspections" declares the R-AP "runner_owned" exemption but has no real JS file/);
  });

  it('RED (totality) — dropping the `reconcile` exemption without restoring its census row throws, so the slug can never silently vanish', async () => {
    const mod = (await import(pathToFileURL(GENERATOR).href)) as unknown as RoadmapModule;
    const args = await loadRealArgs(mod);
    const dropped = { ...args, exemptions: args.exemptions.filter((e) => e.slug !== 'reconcile') };
    expect(() => mod.buildRoadmap(dropped)).toThrow(/no census row for remaining slug "reconcile"/);
  });

  it('GREEN — `reconcile` is exempted, therefore absent from every rendered C4/C5/C6 batch row (it is not a conversion)', async () => {
    const mod = (await import(pathToFileURL(GENERATOR).href)) as unknown as RoadmapModule;
    const args = await loadRealArgs(mod);
    const rows = mod.buildRoadmap(args);
    expect(rows.some((r) => r.slugs.includes('reconcile'))).toBe(false);
    const c5 = rows.filter((r) => r.batch === 'C5');
    // batch2 P1.1 cutover (2026-09-18): assert_parcel_sanity converted out of C5
    // (13->12); batch-2 row 2.1 cutover (2026-09-18): enrich_ravines converted out
    // of C5 (12->11), mechanically computed by buildRoadmap() from converted.json,
    // not retyped.
    expect(c5).toHaveLength(11);
  });
});

// ---------------------------------------------------------------------------
// Spec 124 R-AO RETENTION + fast invariant #25 ARCHETYPE-PARITY — reachability.
//
// THE INTEGRATION FINDING (HIGH, 2026-09-15): #25 was UNREACHABLE for the very
// case R-AO exists for. Commit 9 DELETED a slug's census row, so `censusArchetype`
// was null for every converted slug and the comparison arm never ran — proved by
// swapping `load_ravines` to a valid-but-wrong ASSERT, which still PASSED.
//
// THE FIX: cutover RETAINS the row (`status: "converted"` + `converted_at`) instead
// of deleting it, so the census keeps an INDEPENDENTLY-AUTHORED archetype for #25
// to compare the descriptor against. The retained value is the census's own
// pre-cutover value, read verbatim from git history — never re-derived from the
// descriptor, which would make #25 compare a value to itself.
//
// MEASURED LIMIT, recorded rather than papered over: only FOUR of the twelve
// converted slugs have a pre-cutover archetype anywhere in git history
// (`enrich_parcels` ENRICHER, `assert_global_coverage` ASSERT, `assert_data_bounds`
// ASSERT, `assert_engine_health` RECORDER). The census was authored 2026-09-10 as
// "the currently-unconverted files", so the other eight were ALREADY converted and
// never had a row. Restoring rows for them would fabricate the exact second copy
// this census's own header forbids, so they carry none, and #25's census arm stays
// not-applicable for them. Every batch-2 cutover from here on retains its row.
// ---------------------------------------------------------------------------
describe('Spec 124 R-AO — the retained census row makes #25 ARCHETYPE-PARITY reachable', () => {
  const census = () => JSON.parse(fs.readFileSync(CENSUS_PATH, 'utf8')) as {
    entries: Array<{ slug: string; file: string; archetype: string; status?: string; converted_at?: string }>;
  };

  it('every retained row names a genuinely converted file, and every converted file with a row is retained (both directions, on the REAL census)', () => {
    const retained = census().entries.filter((e) => e.status === 'converted');
    expect(retained.length, 'the retention mechanism is not a dead declaration').toBeGreaterThan(0);
    const convertedSet = new Set(CONVERTED);
    for (const r of retained) {
      expect(convertedSet.has(r.file), `${r.slug}: status "converted" but ${r.file} is not in converted.json`).toBe(true);
      expect(r.converted_at, `${r.slug}: a retention claim carries the cutover commit that makes it checkable`).toBeTruthy();
    }
    for (const e of census().entries) {
      if (convertedSet.has(e.file)) expect(e.status, `${e.slug}: a converted file's census row must be marked retained, never left looking unconverted`).toBe('converted');
    }
  });

  it('GREEN — checkArchetypeParity passes against the REAL census + REAL descriptors, and is NOT vacuous (>=1 retained row is actually compared)', async () => {
    const mod = (await import(pathToFileURL(path.join(REPO_ROOT, 'scripts/analysis/step-validate.mjs')).href)) as unknown as {
      checkArchetypeParity: (rows: unknown[]) => { pass: boolean; blockedSlugs: string[]; detail: string };
    };
    const rows = realParityRows();
    expect(rows.filter((r) => r.censusArchetype !== null).length, 'at least one converted slug must have a retained census row, or this invariant is vacuous').toBeGreaterThan(0);
    const result = mod.checkArchetypeParity(rows);
    expect(result.pass, result.detail).toBe(true);
  });

  it('RED — a VALID-BUT-WRONG retained archetype (a real enum value, just not the one this step measured) is caught, scoped to its slug', async () => {
    const mod = (await import(pathToFileURL(path.join(REPO_ROOT, 'scripts/analysis/step-validate.mjs')).href)) as unknown as {
      checkArchetypeParity: (rows: unknown[]) => { pass: boolean; blockedSlugs: string[]; detail: string };
    };
    const rows = realParityRows();
    const victim = rows.find((r) => r.censusArchetype !== null)!;
    const wrong = victim.descriptorArchetype === 'ASSERT' ? 'LINK' : 'ASSERT';
    const swapped = rows.map((r) => (r.slug === victim.slug ? { ...r, censusArchetype: wrong } : r));
    const result = mod.checkArchetypeParity(swapped);
    expect(result.pass, 'a valid-but-wrong retained archetype must NOT pass — this is the arm that was unreachable before R-AO retention').toBe(false);
    expect(result.blockedSlugs).toEqual([victim.slug]);
    expect(result.detail).toMatch(/disagrees with the descriptor/);
  });

  it('RED — the generator refuses to render a valid-but-wrong retained archetype (real CLI, committed fixture)', () => {
    let threw = false;
    let stderr = '';
    try {
      execFileSync('node', [GENERATOR, '--check'], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        stdio: 'pipe',
        env: { ...process.env, BUILDO_CENSUS_PATH: BAD_MISMATCH_FIXTURE },
      });
    } catch (err) {
      threw = true;
      stderr = String((err as { stderr?: string }).stderr ?? '') + String((err as { message?: string }).message ?? '');
    }
    expect(threw).toBe(true);
    expect(stderr).toMatch(/link_wsib[\s\S]*declares archetype "LINK"[\s\S]*real descriptor says "MATCHER"/);
  });

  /** The exact rows fastInvariants() builds for #25, read from the real tree. */
  function realParityRows() {
    const c = census();
    const bySlug = new Map(c.entries.map((e) => [e.slug, e.archetype]));
    const freeze = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'scripts/steps/_schema/template-freeze.json'), 'utf8')) as {
      archetype_profiles?: Array<{ archetype: string }>;
    };
    const known = new Set((freeze.archetype_profiles ?? []).map((p) => p.archetype));
    return CONVERTED.map((file) => {
      const slug = Object.entries(manifest.scripts).find(([, e]) => e.file === file)?.[0] as string;
      const descPath = path.join(REPO_ROOT, file.replace(/\.js$/, '.descriptor.json'));
      const descriptorArchetype = (JSON.parse(fs.readFileSync(descPath, 'utf8')) as { identity?: { archetype?: string } }).identity?.archetype ?? null;
      return {
        slug,
        descriptorArchetype,
        censusArchetype: bySlug.has(slug) ? (bySlug.get(slug) as string) : null,
        exempted: false,
        knownArchetype: descriptorArchetype ? known.has(descriptorArchetype) : false,
      };
    });
  }
});
