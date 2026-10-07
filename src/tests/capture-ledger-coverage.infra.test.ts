// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.3
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §2 Rule 1 (nothing hidden)
//
// WF3 capture-ledger gap, L6 (static): every analysis script that runs a pipeline step in-chain
// (sets PIPELINE_CHAIN in a spawn env) either spawns the capture harness, which records the run, or
// records it itself through `capture-ledger.js#flushSession`. Before this WF two cohort scripts
// spawned the step directly with PIPELINE_CHAIN=sources and left no pipeline_runs row.
//
// "Spawns the harness" is read at the env site: the quoted harness path
// `'scripts/analysis/capture-step-golden.js'` within the HARNESS_WINDOW lines above the
// PIPELINE_CHAIN assignment (the argv is always built just before the spawn). A cohort's record
// call sits AFTER its restore (outside the restore bracket's try), so a ledger error can never alter
// the restore result or the exit code.
// Closed allowlist: the harness itself, the recorder, and generate-chain-args.mjs (reads the string).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../');
const ANALYSIS = path.join(REPO_ROOT, 'scripts/analysis');
const ALLOW = new Set([
  'scripts/analysis/capture-step-golden.js',
  'scripts/analysis/capture-ledger.js',
  'scripts/analysis/generate-chain-args.mjs',
]);
const HARNESS_LITERAL = "'scripts/analysis/capture-step-golden.js'";
const HARNESS_WINDOW = 15;
const CHAIN_ENV = /PIPELINE_CHAIN\s*:|\.PIPELINE_CHAIN\s*=(?!=)/;

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
}

const FILES = walk(ANALYSIS)
  .filter((f) => /\.(js|mjs|cjs)$/.test(f))
  .map((f) => ({ rel: path.relative(REPO_ROOT, f).split(path.sep).join('/'), src: fs.readFileSync(f, 'utf8') }));

/** Lines that set PIPELINE_CHAIN in an env, with no quoted harness path in the window above. */
function directChainSpawnSites(src: string): number[] {
  const lines = src.split('\n');
  const out: number[] = [];
  lines.forEach((line, i) => {
    if (!CHAIN_ENV.test(line) || /^\s*(\*|\/\/)/.test(line)) return;
    const window = lines.slice(Math.max(0, i - HARNESS_WINDOW), i + 1).join('\n');
    if (!window.includes(HARNESS_LITERAL)) out.push(i + 1);
  });
  return out;
}

describe('L6: every in-chain step run an analysis script spawns is ledger-recorded', () => {
  it('the scan is live: it sees the harness-spawning cohorts and the env sites they guard', () => {
    const viaHarness = FILES.filter((f) => !ALLOW.has(f.rel) && CHAIN_ENV.test(f.src) && directChainSpawnSites(f.src).length === 0);
    expect(viaHarness.map((f) => f.rel)).toEqual(expect.arrayContaining([
      'scripts/analysis/massing-cohort-differential.js',
      'scripts/analysis/load-heritage-cohort-differential.js',
    ]));
  });

  it('a script that sets PIPELINE_CHAIN for a direct (non-harness) spawn records the run via flushSession', () => {
    const unrecorded = FILES
      .filter((f) => !ALLOW.has(f.rel))
      .map((f) => ({ ...f, sites: directChainSpawnSites(f.src) }))
      .filter((f) => f.sites.length > 0 && !f.src.includes('flushSession('))
      .map((f) => `${f.rel}:${f.sites.join(',')}`);
    expect(unrecorded).toEqual([]);
  });

  it('a cohort record call sits after the restore, never inside the restore bracket', () => {
    const recorders = FILES.filter((f) => !ALLOW.has(f.rel) && f.src.includes('flushSession('));
    for (const f of recorders) {
      const lastRestore = f.src.lastIndexOf('restoreAndVerify(');
      if (lastRestore === -1) continue;
      expect(f.src.indexOf('flushSession('), `${f.rel}: flushSession( must follow the last restoreAndVerify(`).toBeGreaterThan(lastRestore);
    }
  });

  it('OUTPUT-roster #2: both direct-spawn cohort scripts pass their step descriptor to the recorder, never null', () => {
    for (const [rel, descriptor] of [
      ['scripts/analysis/compute-parcel-cost-cohort-differential.js', 'scripts/compute-parcel-cost-estimates.descriptor.json'],
      ['scripts/analysis/enrich-heritage-cohort-differential.js', 'scripts/enrich-heritage.descriptor.json'],
    ] as const) {
      const src = FILES.find((f) => f.rel === rel)!.src;
      expect(src, rel).toContain(`'${descriptor}'`);
      expect(src, rel).toContain('descriptor: LEDGER_DESCRIPTOR');
      expect(src, rel).not.toContain('descriptor: null');
    }
  });
});
