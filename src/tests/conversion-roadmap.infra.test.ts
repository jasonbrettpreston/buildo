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
// (d) totality — every one of the 55 remaining files (+ 0 pending since pilot 9 commit 9, 2026-09-11) appears
//     exactly once across C4/C5/C6.
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

  it('declares exemptions[] (Ask A2) — never empty, one row per non-JS/null-file manifest slug', () => {
    const data = JSON.parse(fs.readFileSync(CENSUS_PATH, 'utf8')) as { exemptions: Array<{ slug: string; reason: string }> };
    expect(data.exemptions.length).toBeGreaterThan(0);
    const slugs = data.exemptions.map((e) => e.slug).sort();
    expect(slugs).toEqual(['coa_documents', 'inspections']);
    const inspections = data.exemptions.find((e) => e.slug === 'inspections');
    expect(inspections?.reason).toBe('python_step_excluded');
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
  function fileToSlugsMap(): Record<string, string[]> {
    const map: Record<string, string[]> = {};
    for (const [slug, e] of Object.entries(manifest.scripts)) {
      if (!e.file || e.file.endsWith('.py')) continue;
      (map[e.file] = map[e.file] || []).push(slug);
    }
    return map;
  }

  it('54 remaining files, 56 remaining slugs (excluding the 9 converted, 1 pending — assert_global_coverage, batch1 I1 commit 6, 2026-09-11 — and the 1 python-exempt file)', () => {
    const fileToSlugs = fileToSlugsMap();
    const convertedSet = new Set(CONVERTED);
    const pendingSet = new Set(PENDING_FILES);
    const remaining = Object.keys(fileToSlugs).filter((f) => !convertedSet.has(f) && !pendingSet.has(f));
    const remainingSlugCount = remaining.reduce((n, f) => n + (fileToSlugs[f]?.length ?? 0), 0);
    expect(remaining.length).toBe(54);
    expect(remainingSlugCount).toBe(56);
  });

  it('the census file-count-by-batch matches the independently re-derived C4/C5/C6 split (C4=4, C5=14, C6=36; pending=1 — assert_global_coverage entered the census at batch1 I1 commit 6, 2026-09-11, provenance rule 1)', () => {
    const census = JSON.parse(fs.readFileSync(CENSUS_PATH, 'utf8')) as { entries: Array<{ slug: string; file: string; batch: string }> };
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
      byBatch.get(e.batch)?.add(e.file);
    }
    const c4 = byBatch.get('C4')!;
    const c5 = byBatch.get('C5')!;
    const c6 = byBatch.get('C6')!;
    const pendingBatch = byBatch.get('pending')!;
    // assert_global_coverage's census row flipped from batch:"C4" to batch:"pending"
    // at batch1 I1 commit 6 (2026-09-11), when converted.json first declared it
    // pending (stage red_suite) — C4 drops 5→4, pending rises 0→1.
    expect(c4.size).toBe(4);
    // C5 as declared in the census covers the 14 truly-remaining files + reconcile is
    // among them already (UNDECLARED but batch:"C5") — 14 remaining + reconcile is
    // already counted in that 14.
    expect(c5.size).toBe(14);
    expect(pendingBatch.size).toBe(1);
    expect(c6.size).toBe(36);
    expect(c4.size + c5.size + c6.size).toBe(remaining.length);
  });

  it('measured drift from the plan\'s OWN stated bucket table (§1: "ds 4"): the real C6 deep_scrapes chain-bucket is 3 (assert_data_bounds/assert_engine_health are C4-batch, not C6, so they must NOT be double-counted here), and 2 orphan scripts (reclassify_all, observe_chain) have NO manifest.chains membership at all and are not covered by ANY of the plan\'s 6 named buckets', () => {
    const orphanSlugs = ['reclassify_all', 'observe_chain'];
    for (const slug of orphanSlugs) {
      const inAnyChain = Object.values(manifest.chains).some((slugs) => slugs.includes(slug));
      expect(inAnyChain, `${slug} must have zero manifest.chains membership (the measured finding)`).toBe(false);
    }
    const census = JSON.parse(fs.readFileSync(CENSUS_PATH, 'utf8')) as { entries: Array<{ slug: string; batch: string }> };
    const c4c5Slugs = new Set(census.entries.filter((e) => e.batch === 'C4' || e.batch === 'C5').map((e) => e.slug));
    const dsOnlySlugs = (manifest.chains.deep_scrapes || []).filter((s) => {
      const file = manifest.scripts[s]?.file;
      return file && !CONVERTED.includes(file) && !file.endsWith('.py') && !c4c5Slugs.has(s);
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

  it('the rendered table\'s counts agree with the independently re-derived counts above (54 remaining files, 1 pending)', () => {
    const text = fs.readFileSync(GENERATED_PATH, 'utf8');
    expect(text).toContain('Remaining files: **54** (+ **1** pending)');
    expect(text).toContain('remaining slugs: **56** (+ **1** pending)');
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
    expect(stderr).toMatch(/no census row for remaining slug "geocode_permits"/);
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
    expect(rows.filter((r) => !r.pending).length).toBe(54);
    expect(rows.filter((r) => r.pending).length).toBe(1);
    for (const r of rows) {
      expect(['C4', 'C5', 'C6', 'pending']).toContain(r.batch);
      expect(r.pending).toBe(r.batch === 'pending');
    }
  });

  it('HIGH-1: the 2 declared exemptions (inspections, coa_documents) are NOT silently dropped — 68 total manifest slugs = 9 converted + 1 pending + 2 exempted + 56 remaining', async () => {
    const mod = (await import(pathToFileURL(GENERATOR).href)) as unknown as RoadmapModule;
    const args = await loadRealArgs(mod);
    expect(args.exemptions.map((e) => e.slug).sort()).toEqual(['coa_documents', 'inspections']);
    const rows = mod.buildRoadmap(args);
    const remainingSlugs = rows.filter((r) => !r.pending).reduce((n, r) => n + r.slugs.length, 0);
    const pendingSlugs = rows.filter((r) => r.pending).reduce((n, r) => n + r.slugs.length, 0);
    const totalSlugs = Object.keys(args.manifest.scripts).length;
    expect(totalSlugs).toBe(68);
    expect(9 + pendingSlugs + args.exemptions.length + remainingSlugs).toBe(totalSlugs);
    expect(pendingSlugs).toBe(1);
    expect(remainingSlugs).toBe(56);
  });

  it('the rendered report never silently drops the 2 exemptions — both appear in the Declared exemptions table and the totality sentence states IDENTITY HOLDS', async () => {
    const mod = (await import(pathToFileURL(GENERATOR).href)) as unknown as RoadmapModule;
    const args = await loadRealArgs(mod);
    const rows = mod.buildRoadmap(args);
    const rendered = mod.render(rows, args.manifest, args.exemptions, args.convertedInfo);
    expect(rendered).toContain('## Declared exemptions');
    expect(rendered).toContain('inspections');
    expect(rendered).toContain('python_step_excluded');
    expect(rendered).toContain('coa_documents');
    expect(rendered).toContain('no_file');
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

  it('GREEN — the real, committed exemptions (2: inspections, coa_documents) never throw', async () => {
    const mod = (await import(pathToFileURL(GENERATOR).href)) as unknown as RoadmapModule;
    const args = await loadRealArgs(mod);
    expect(() => mod.buildRoadmap(args)).not.toThrow();
    expect(REAL_CENSUS.exemptions).toHaveLength(2);
  });
});
