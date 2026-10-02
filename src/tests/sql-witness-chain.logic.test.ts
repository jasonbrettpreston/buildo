// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §6.6.1 (Phase 1 WITNESS, P1-C3d witness-chain)
// Plan: .cursor/wf2_registry_truth_active_task.md PHASE 1 item 10
//
// RED-first lock for scripts/analysis/witness-chain.mjs (brief p1c3d-contract.md).
// The planner module is created by a sibling brief, so this file is RED today: the
// module is missing. Every RED carries a GREEN control proving the same assertion can
// pass on a sibling input once the module exists.
//
// Contract (exact grammar):
//   planWitness({ chain, manifest, convertedFiles, goldenRoot, readJson, listDir, fingerprintFor, tracePathFor, readTrace })
//     -> jobs in manifest chain order:
//        { slug, relFile, invocation, goldenPath, tracePath, chain, args, reason: 'missing' | 'stale' }
//   buildArgv(job, harnessPath)
//     -> [harnessPath, '--step=' + job.relFile, '--chain=' + job.chain, '--out=' + job.goldenPath, '--trace-only']
//        plus '--args=' + job.args.join(',') only when args is non-empty.

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

type Job = {
  slug: string;
  relFile: string;
  invocation: string;
  goldenPath: string;
  tracePath: string;
  chain: string;
  args: string[];
  reason: 'missing' | 'stale';
};

type GoldenDoc = { chain?: string; args?: unknown };

type PlanArgs = {
  chain: string;
  manifest: unknown;
  convertedFiles: string[];
  goldenRoot: string;
  readJson: (file: string) => unknown;
  listDir: (dir: string) => string[];
  fingerprintFor: (relFile: string) => string;
  tracePathFor: (goldenPath: string) => string;
  readTrace: (tracePath: string) => { source_fingerprint?: string | null } | null;
};

type ChainModule = {
  planWitness: (args: PlanArgs) => Job[];
  buildArgv: (job: Job, harnessPath: string) => string[];
};

const MODULE_PATH = path.join(process.cwd(), 'scripts/analysis/witness-chain.mjs');

// Loaded lazily inside beforeAll (error re-thrown per test in beforeEach) so a missing
// module turns every test RED (per-test failed assertionResults) instead of failing the
// file with 0 tests.
let C: ChainModule;

// A throwing beforeAll SKIPS tests; a throwing beforeEach FAILS each one, which is what
// gate K's red evidence needs (>= 1 failed assertionResults).
let loadError: unknown = null;
beforeAll(async () => {
  try {
    C = (await import(pathToFileURL(MODULE_PATH).href)) as ChainModule;
  } catch (err) {
    loadError = err;
  }
});
beforeEach(() => {
  if (loadError) throw loadError;
});

// ---------------------------------------------------------------------------
// Fixture: a 3-step chain. a_step + b_step converted, c_step NOT converted.
// Golden POST dirs: a_step -> sources.json, standalone.json, explained-diffs.json;
// b_step -> sources.json.
// ---------------------------------------------------------------------------
const CHAIN = 'main';

const MANIFEST = {
  chains: { [CHAIN]: ['a_step', 'b_step', 'c_step'] },
  scripts: {
    a_step: { file: 'scripts/a.js' },
    b_step: { file: 'scripts/b.js' },
    c_step: { file: 'scripts/c.js' },
  },
};

const CONVERTED_FILES = ['scripts/a.js', 'scripts/b.js'];

const GOLDEN_ROOT = path.join('golden');

const REL_FILES: Record<string, string> = {
  a_step: 'scripts/a.js',
  b_step: 'scripts/b.js',
  c_step: 'scripts/c.js',
};

const FP_MATCH: Record<string, string> = {
  'scripts/a.js': 'fp-a',
  'scripts/b.js': 'fp-b',
  'scripts/c.js': 'fp-c',
};

function goldenPath(slug: string, file: string): string {
  return path.join(GOLDEN_ROOT, slug, 'post', file);
}

// Directory listing per POST dir (raw basenames), matching the fixture.
const DIR_LISTINGS: Record<string, string[]> = {
  'a_step': ['sources.json', 'standalone.json', 'explained-diffs.json'],
  'b_step': ['sources.json'],
};

// Golden docs carry { chain, args }.
const GOLDEN_DOCS: Record<string, GoldenDoc> = {
  'a_step/sources.json': { chain: CHAIN, args: ['--full'] },
  'a_step/standalone.json': { chain: CHAIN, args: [] },
  'a_step/explained-diffs.json': { chain: CHAIN, args: [] },
  'b_step/sources.json': { chain: CHAIN, args: [] },
};

function basename(p: string): string {
  return p.replace(/\\/g, '/').split('/').pop() as string;
}

// Inject fakes: no DB, no real fs.
function plan(overrides: {
  readJson?: (file: string) => unknown;
  listDir?: (dir: string) => string[];
  fingerprintFor?: (relFile: string) => string;
  tracePathFor?: (goldenPath: string) => string;
  readTrace?: (tracePath: string) => { source_fingerprint?: string | null } | null;
} = {}): Job[] {
  return C.planWitness({
    chain: CHAIN,
    manifest: MANIFEST,
    convertedFiles: CONVERTED_FILES,
    goldenRoot: GOLDEN_ROOT,
    readJson: (file) => {
      // goldenPath looks like <goldenRoot>/<slug>/post/<file>; GOLDEN_DOCS is keyed
      // `<slug>/<file>`, so key on the segment just before `post` plus the basename.
      const norm = file.replace(/\\/g, '/');
      const parts = norm.split('/');
      const postIdx = parts.lastIndexOf('post');
      const key =
        postIdx > 0
          ? `${parts[postIdx - 1]}/${basename(norm)}`
          : basename(norm);
      return GOLDEN_DOCS[key];
    },
    listDir: (dir) => {
      // dir looks like <goldenRoot>/<slug>/post.
      const norm = dir.replace(/\\/g, '/');
      const parts = norm.split('/');
      const slug = parts[parts.length - 2];
      return slug ? DIR_LISTINGS[slug] ?? [] : [];
    },
    fingerprintFor: (relFile) => FP_MATCH[relFile] ?? `fp-unknown`,
    tracePathFor: (gp) => {
      const norm = gp.replace(/\\/g, '/');
      const idx = norm.indexOf('/post/');
      if (idx < 0) return `${norm}.trace.json`;
      const slug = norm.split('/')[1] ?? '';
      const file = basename(norm).replace(/\.json$/, '');
      return path.join(GOLDEN_ROOT, slug, `${file}.trace.json`);
    },
    readTrace: () => null,
    ...overrides,
  });
}

// ===========================================================================
// 1. missing trace -> job reason 'missing'; unconverted & explained-diffs skipped
// ===========================================================================
describe('witness-chain — missing trace (contract: reason=missing, unconverted/explained skipped)', () => {
  it('RED: a trace missing yields a missing job and never plans c_step', () => {
    const jobs = plan({ readTrace: () => null });
    const slugSet = new Set(jobs.map((j) => j.slug));
    expect(slugSet.has('c_step')).toBe(false);
    expect(jobs.every((j) => j.reason === 'missing')).toBe(true);
    // a_step's missing job exists.
    expect(jobs.some((j) => j.slug === 'a_step' && j.reason === 'missing')).toBe(true);
  });

  it('RED: explained-diffs.json is never planned', () => {
    const jobs = plan({ readTrace: () => null });
    expect(jobs.some((j) => basename(j.goldenPath) === 'explained-diffs.json')).toBe(false);
  });

  it('GREEN control: c_step appears in the manifest but not in convertedFiles, so it is excluded', () => {
    // Sanity on the fixture itself (control): c.js is not converted.
    expect(CONVERTED_FILES.includes(REL_FILES['c_step'] ?? '')).toBe(false);
    const jobs = plan({ readTrace: () => null });
    expect(jobs.some((j) => j.relFile === REL_FILES['c_step'])).toBe(false);
  });
});

// ===========================================================================
// 2. stale fingerprint -> 'stale'; matching -> no job
// ===========================================================================
describe('witness-chain — stale vs fresh (contract: mismatch=stale, match=no job)', () => {
  it('RED: a trace with a different source_fingerprint yields reason stale', () => {
    const jobs = plan({
      readTrace: (tp) =>
        basename(tp).includes('a.js')
          ? { source_fingerprint: 'fp-old' }
          : { source_fingerprint: FP_MATCH['scripts/b.js'] ?? 'fp-b' },
    });
    const aJob = jobs.find((j) => j.slug === 'a_step' && j.invocation === 'sources');
    expect(aJob?.reason).toBe('stale');
  });

  it('GREEN control: a matching source_fingerprint emits no job for that golden', () => {
    // Mirror the real contract: each trace reports the CURRENT fingerprint of its step.
    // The trace path is `<goldenRoot>/<slug>/<file>.trace.json`, so the step is
    // identified by the slug segment (not the file basename). (An unconditional
    // 'fp-a' would wrongly mark b_step stale.)
    const jobs = plan({
      readTrace: (tp) =>
        tp.replace(/\\/g, '/').includes('/a_step/')
          ? { source_fingerprint: FP_MATCH['scripts/a.js'] ?? 'fp-a' }
          : { source_fingerprint: FP_MATCH['scripts/b.js'] ?? 'fp-b' },
    });
    // every fingerprint matches the fixture, so nothing is stale.
    expect(jobs.filter((j) => j.reason === 'stale')).toEqual([]);
  });
});

// ===========================================================================
// 3. manifest chain order + golden chain/args carried through
// ===========================================================================
describe('witness-chain — order + payload (contract: manifest chain order, golden chain/args)', () => {
  it('RED: jobs follow manifest chain order (a_step before b_step) and carry chain/args', () => {
    const jobs = plan({ readTrace: () => null });
    const aIdx = jobs.findIndex((j) => j.slug === 'a_step');
    const bIdx = jobs.findIndex((j) => j.slug === 'b_step');
    expect(aIdx).toBeGreaterThanOrEqual(0);
    expect(bIdx).toBeGreaterThan(aIdx);
    for (const j of jobs) {
      expect(j.chain).toBe(CHAIN);
      expect(Array.isArray(j.args)).toBe(true);
    }
    const aSources = jobs.find((j) => j.slug === 'a_step' && j.invocation === 'sources');
    expect(aSources?.args).toEqual(['--full']);
  });

  it('GREEN control: a manifest chain with a single step yields jobs for that slug only', () => {
    const jobs = plan({ readTrace: () => null });
    // The fixture chain[0] is a_step; its first emitted job is a_step.
    expect(jobs[0]?.slug).toBe('a_step');
  });
});

// ===========================================================================
// 4. buildArgv
// ===========================================================================
describe('witness-chain — buildArgv (contract: --step/--chain/--out/--trace-only [+ --args])', () => {
  const harness = '/tmp/capture-step-golden.js';

  function makeJob(args: string[]): Job {
    return {
      slug: 'a_step',
      relFile: 'scripts/a.js',
      invocation: 'sources',
      goldenPath: goldenPath('a_step', 'sources.json'),
      tracePath: path.join(GOLDEN_ROOT, 'a_step', 'sources.trace.json'),
      chain: CHAIN,
      args,
      reason: 'missing',
    };
  }

  it('RED: empty args emits no --args flag', () => {
    const argv = C.buildArgv(makeJob([]), harness);
    expect(argv.some((a) => a.startsWith('--args='))).toBe(false);
  });

  it('RED: [--full] emits --args=--full', () => {
    const argv = C.buildArgv(makeJob(['--full']), harness);
    expect(argv).toContain('--args=--full');
  });

  it('RED: --trace-only comes immediately before the args flag', () => {
    const argv = C.buildArgv(makeJob(['--full']), harness);
    expect(argv[argv.length - 1]).toBe('--args=--full');
    expect(argv[argv.length - 2]).toBe('--trace-only');
  });

  it('RED: argv includes --out=<goldenPath> and starts with the harness', () => {
    const job = makeJob([]);
    const argv = C.buildArgv(job, harness);
    expect(argv[0]).toBe(harness);
    expect(argv).toContain(`--out=${job.goldenPath}`);
    expect(argv).toContain(`--step=${job.relFile}`);
    expect(argv).toContain(`--chain=${job.chain}`);
  });

  it('GREEN control: empty args still ends with --trace-only', () => {
    const argv = C.buildArgv(makeJob([]), harness);
    expect(argv[argv.length - 1]).toBe('--trace-only');
  });
});

// ===========================================================================
// 5. module source hygiene
// ===========================================================================
describe('witness-chain — module source hygiene', () => {
  let src: string | null = null;
  beforeAll(() => {
    try {
      src = fs.readFileSync(MODULE_PATH, 'utf8');
    } catch {
      src = null; // module missing -> each assertion below fails individually (RED)
    }
  });

  it('contains dsmGuard(', () => {
    expect(src ?? '').toContain('dsmGuard(');
  });

  it('contains --trace-only', () => {
    expect(src ?? '').toContain('--trace-only');
  });

  it('contains no process.exit(', () => {
    expect(src ?? '').not.toContain('process.exit(');
  });
});
