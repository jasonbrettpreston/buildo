// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-EI..R-EN (C6 rulings, operator 2026-10-19)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.10 (EFFECTOR)
//
// C6 rulings lane (McDonald's Airtight V3, operator answers 2026-10-19 to the six
// C6 census questions). Each arm locks one ruling as data the roadmap generator
// and the census schema can check; none is free text.
//   R-EI — EFFECTOR archetype: census enum now, step.schema.json at its first
//          conversion's RE-FREEZE (FREEZE-1 arm D refuses an unproven profile).
//   R-EJ — observe_chain is a runner_owned exemption (chain observation is a
//          RUNNER concern; run-chain.js spawns it).
//   R-EK — a step is retired only under a closed predicate the generator checks:
//          no chain membership, covered_by slugs that each support --full.
//   R-EI..R-EN rows exist in Spec 124 (the rulings are recorded, not implied).
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const REPO_ROOT = path.resolve(__dirname, '../../');
const GENERATOR = path.join(REPO_ROOT, 'scripts/violations/generate-conversion-roadmap.mjs');
const CENSUS_PATH = path.join(REPO_ROOT, 'scripts/steps/_schema/step-archetype-census.json');
const CENSUS_SCHEMA_PATH = path.join(REPO_ROOT, 'scripts/steps/_schema/step-archetype-census.schema.json');
const STEP_SCHEMA_PATH = path.join(REPO_ROOT, 'scripts/steps/_schema/step.schema.json');
const SPEC_124 = path.join(REPO_ROOT, 'docs/specs/01-pipeline/124_step_standard_policy.md');
// integrate-12: M35 moved R-DU, R-DV, R-DX…R-EP (R-EI…R-EN among them) to a 124a LIVE REGISTER section (§B24).
const SPEC_124A = path.join(REPO_ROOT, 'docs/specs/01-pipeline/124a_step_standard_policy_appendix.md');
const SPEC_122 = path.join(REPO_ROOT, 'docs/specs/01-pipeline/122_pipeline_step_optimization.md');

type Exemption = { slug: string; file: string | null; reason: string; ruling: string; scope: string; covered_by?: string[]; evidence?: string };
type Entry = { slug: string; file: string; archetype: string; batch: string; reason: string };
const census = JSON.parse(fs.readFileSync(CENSUS_PATH, 'utf8')) as { entries: Entry[]; exemptions: Exemption[] };

interface RoadmapModule {
  loadManifest: () => { scripts: Record<string, { file: string | null; supports_full?: boolean }>; chains: Record<string, string[]> };
  loadConverted: () => unknown;
  loadCensus: () => { entries: Entry[]; exemptions: Exemption[] };
  loadProgrammeItems: () => unknown[];
  loadTemplateFreeze: () => unknown[];
  parseChurnTable: (text: string) => unknown;
  buildRoadmap: (args: unknown) => unknown[];
}

async function realArgs() {
  const mod = (await import(pathToFileURL(GENERATOR).href)) as unknown as RoadmapModule;
  const { entries, exemptions } = mod.loadCensus();
  return {
    mod,
    args: {
      manifest: mod.loadManifest(),
      convertedInfo: mod.loadConverted(),
      census: entries,
      exemptions,
      programmeItems: mod.loadProgrammeItems(),
      churn: mod.parseChurnTable(fs.readFileSync(path.join(REPO_ROOT, 'docs/reports/generated/122-churn-complexity.md'), 'utf8')),
      archetypeProfiles: mod.loadTemplateFreeze(),
    },
  };
}

function throwsWith(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

describe('R-EI — the EFFECTOR archetype (an outside side effect is the output)', () => {
  it('the census archetype enum gains EFFECTOR', () => {
    const schema = JSON.parse(fs.readFileSync(CENSUS_SCHEMA_PATH, 'utf8'));
    expect(schema.definitions.entry.properties.archetype.enum).toContain('EFFECTOR');
  });

  it('dispatch_notifications and backup_db are censused EFFECTOR', () => {
    for (const slug of ['dispatch_notifications', 'backup_db']) {
      expect(census.entries.find((e) => e.slug === slug)?.archetype, slug).toBe('EFFECTOR');
    }
  });

  it('step.schema.json does NOT carry EFFECTOR yet — it enters at its first conversion RE-FREEZE (FREEZE-1 arm D)', () => {
    const text = fs.readFileSync(STEP_SCHEMA_PATH, 'utf8');
    expect(text.includes('"EFFECTOR"')).toBe(false);
  });

  it('Spec 122 §1.10 names the EFFECTOR profile and its four gates', () => {
    const s122 = fs.readFileSync(SPEC_122, 'utf8');
    expect(s122).toContain('`EFFECTOR` (Spec 124 R-EI');
  });

  it('no C6 census row is UNDECLARED any more (ARCH-CENSUS C6, 2026-10-19)', () => {
    const undeclared = census.entries.filter((e) => e.batch === 'C6' && e.archetype === 'UNDECLARED').map((e) => e.slug);
    expect(undeclared).toEqual([]);
  });
});

describe('R-EJ — observe_chain is a runner_owned exemption', () => {
  it('observe_chain is exempted runner_owned, citing R-EJ, and has no census entry', () => {
    const ex = census.exemptions.find((e) => e.slug === 'observe_chain');
    expect(ex?.reason).toBe('runner_owned');
    expect(ex?.ruling).toContain('R-EJ');
    expect(census.entries.some((e) => e.slug === 'observe_chain')).toBe(false);
  });
});

describe('R-EK — retiring a step is a closed predicate the generator checks', () => {
  it('reclassify_all is exempted "retired", citing R-EK, covered by classify_scope + classify_permits', () => {
    const ex = census.exemptions.find((e) => e.slug === 'reclassify_all');
    expect(ex?.reason).toBe('retired');
    expect(ex?.ruling).toContain('R-EK');
    expect(ex?.covered_by?.slice().sort()).toEqual(['classify_permits', 'classify_scope']);
    expect(ex?.evidence).toBeTruthy();
    expect(census.entries.some((e) => e.slug === 'reclassify_all')).toBe(false);
  });

  it('the real committed data builds (GREEN control)', async () => {
    const { mod, args } = await realArgs();
    expect(throwsWith(() => mod.buildRoadmap(args))).toBeNull();
  });

  it('RED — a retired slug that is still in a manifest chain throws', async () => {
    const { mod, args } = await realArgs();
    const manifest = JSON.parse(JSON.stringify(args.manifest));
    manifest.chains.permits = [...manifest.chains.permits, 'reclassify_all'];
    const msg = throwsWith(() => mod.buildRoadmap({ ...args, manifest }));
    expect(msg).toContain('R-EK');
    expect(msg).toContain('chain');
  });

  it('RED — a retired slug with no covered_by throws', async () => {
    const { mod, args } = await realArgs();
    const exemptions = args.exemptions.map((e) => (e.slug === 'reclassify_all' ? { ...e, covered_by: [] } : e));
    const msg = throwsWith(() => mod.buildRoadmap({ ...args, exemptions }));
    expect(msg).toContain('R-EK');
    expect(msg).toContain('covered_by');
  });

  it('RED — a covering slug that does not support --full throws', async () => {
    const { mod, args } = await realArgs();
    const manifest = JSON.parse(JSON.stringify(args.manifest));
    manifest.scripts.classify_scope.supports_full = false;
    const msg = throwsWith(() => mod.buildRoadmap({ ...args, manifest }));
    expect(msg).toContain('R-EK');
    expect(msg).toContain('supports_full');
  });

  it('RED — a retired row with no evidence throws', async () => {
    const { mod, args } = await realArgs();
    const exemptions = args.exemptions.map((e) => {
      if (e.slug !== 'reclassify_all') return e;
      const rest = { ...e };
      delete rest.evidence;
      return rest;
    });
    const msg = throwsWith(() => mod.buildRoadmap({ ...args, exemptions }));
    expect(msg).toContain('R-EK');
    expect(msg).toContain('evidence');
  });
});

describe('R-EL — paid or outside API steps are captured from recorded responses', () => {
  const PAID = ['enrich_wsib_builders', 'enrich_named_builders', 'enrich_wsib_registry'];

  function captureFiles(dir: string): string[] {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((d) => d.isFile() && d.name.endsWith('.json'))
      .map((d) => path.join(d.parentPath ?? (d as unknown as { path: string }).path, d.name))
      .filter((f) => /[/\\](pre|post)[/\\]/.test(f));
  }

  it.each(PAID)('%s has no PRE/POST capture unless its recorded/ fixture directory exists and is non-empty', (slug) => {
    const golden = path.join(REPO_ROOT, 'docs/reports/golden', slug);
    const captures = captureFiles(golden);
    if (captures.length === 0) return;
    const recorded = path.join(golden, 'recorded');
    expect(fs.existsSync(recorded) && fs.readdirSync(recorded).length > 0, `${slug} has captures but no recorded responses`).toBe(true);
  });
});

describe('R-EM — a one-time backfill leaves its chain only on a measured zero', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'scripts/manifest.json'), 'utf8')) as {
    scripts: Record<string, unknown>;
    chains: Record<string, string[]>;
  };
  const SLUG = 'backfill_realtor_permit_trades';
  const MEASUREMENT = path.join(REPO_ROOT, 'docs/reports/c6/realtor-backfill-measurement.json');

  it('stays in manifest.scripts for on-demand runs', () => {
    expect(manifest.scripts[SLUG]).toBeDefined();
  });

  it('is removed from the permits chain only with a committed zero-count measurement citing R-EM', () => {
    if ((manifest.chains.permits ?? []).includes(SLUG)) return;
    expect(fs.existsSync(MEASUREMENT), 'removal needs docs/reports/c6/realtor-backfill-measurement.json').toBe(true);
    const m = JSON.parse(fs.readFileSync(MEASUREMENT, 'utf8')) as { ruling: string; count: number; measured_at: string };
    expect(m.ruling).toBe('R-EM');
    expect(m.count).toBe(0);
    expect(m.measured_at).toBeTruthy();
  });
});

describe('R-EI..R-EN are recorded in Spec 124', () => {
  // A register row lives in Spec 124 §5 or in a 124a LIVE REGISTER section (moved for the byte budget, still in force).
  const liveRegister = (): string => {
    let live = false;
    return fs.readFileSync(SPEC_124A, 'utf8').split('\n').filter((l) => {
      if (/^#{1,2} /.test(l)) live = /^## .*\(moved from Spec 124 §5\).*LIVE REGISTER/.test(l);
      return live;
    }).join('\n');
  };
  it.each(['R-EI', 'R-EJ', 'R-EK', 'R-EL', 'R-EM', 'R-EN'])('%s has a register row', (id) => {
    const s124 = `${fs.readFileSync(SPEC_124, 'utf8')}\n${liveRegister()}`;
    expect(s124).toMatch(new RegExp(`^\\| ${id} \\| \\*\\*`, 'm'));
  });
});
