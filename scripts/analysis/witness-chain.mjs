// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §6.6.1 (Phase 1 WITNESS, P1-C3d witness-chain)
// Plan: .cursor/wf2_registry_truth_active_task.md PHASE 1 item 10
//
// ONE operator script per chain (brief `.cursor/engine-briefs/p1c3d-contract.md`).
// It is the WITNESS backfill driver: it NEVER writes goldens, it only re-runs each
// CONVERTED step's already-committed POST invocation through
// `scripts/analysis/capture-step-golden.js --trace-only`, which writes the sibling
// `docs/reports/witness/<slug>/<sub>/<invocation>.trace.json` (assemble.cjs
// `tracePathFor`) without touching the golden itself.
//
//   usage: node scripts/analysis/witness-chain.mjs --chain=<id> [--dry-run]
//
// `planWitness` / `buildArgv` are PURE (no DB, no fs, no stdout) so the planner is
// testable from a fixture; `main()` opens the ONE pool it needs for the DSM
// pre-flight and never runs on import (guarded CLI, `process.exitCode` only).
//
//   node -r dotenv/config scripts/analysis/witness-chain.mjs --chain=sources

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const MANIFEST_PATH = path.join(REPO_ROOT, 'scripts/manifest.json');
const CONVERTED_PATH = path.join(REPO_ROOT, 'scripts/steps/_schema/converted.json');
const GOLDEN_ROOT = path.join(REPO_ROOT, 'docs/reports/golden');
const HARNESS_PATH = path.join(REPO_ROOT, 'scripts/analysis/capture-step-golden.js');

// A trace beside a golden would be read as a capture by G8/GOLD-PRE (assemble.cjs
// `tracePathFor` docblock); every capture reader lists `*.json`, so these two
// basenames are the non-capture files that must never become an invocation.
const EXPLAINED_DIFFS = 'explained-diffs.json';
const TRACE_SUFFIX = '.trace.json';

/** basename of a path, POSIX-normalised so a Windows separator is never an invocation. */
function baseName(p) {
  return String(p).replace(/\\/g, '/').split('/').pop() || '';
}

/** The trace path for a golden JSON path, via the ONE owner of that convention (assemble.cjs). */
function defaultTracePathFor(goldenPath) {
  return require(path.join(REPO_ROOT, 'scripts/lib/sql-witness/assemble.cjs')).tracePathFor(goldenPath);
}

/**
 * Plan the WITNESS backfill for ONE chain: for every CONVERTED step of
 * `manifest.chains[chain]`, in manifest chain order, every committed
 * `<goldenRoot>/<slug>/post/*.json` invocation whose trace is absent (`missing`)
 * or whose `source_fingerprint` no longer matches the current tree (`stale`).
 *
 * @param {{
 *   chain: string,
 *   manifest: {chains: Record<string, string[]>, scripts: Record<string, {file?: string}>},
 *   convertedFiles: string[],
 *   goldenRoot: string,
 *   readJson: (file: string) => {chain?: string, args?: unknown},
 *   listDir: (dir: string) => string[],
 *   fingerprintFor: (relFile: string) => string,
 *   tracePathFor: (goldenPath: string) => string,
 *   readTrace: (tracePath: string) => {source_fingerprint?: string | null} | null,
 * }} args
 * @returns {Array<{slug: string, relFile: string, invocation: string, goldenPath: string,
 *   tracePath: string, chain: string, args: string[], reason: 'missing'|'stale'}>}
 */
export function planWitness({
  chain,
  manifest,
  convertedFiles,
  goldenRoot,
  readJson,
  listDir,
  fingerprintFor,
  tracePathFor,
  readTrace,
}) {
  const slugs = (manifest && manifest.chains && manifest.chains[chain]) || [];
  const scripts = (manifest && manifest.scripts) || {};
  const converted = new Set(convertedFiles || []);
  const resolveTracePath = tracePathFor || defaultTracePathFor;
  const jobs = [];

  for (const slug of slugs) {
    const relFile = scripts[slug] && scripts[slug].file;
    // A slug with no manifest file, or one whose conversion has not landed, is out of
    // scope: WITNESS only backfills steps that are already converted (Spec 122 §6.6.1).
    if (!relFile || !converted.has(relFile)) continue;
    const postDir = path.join(goldenRoot, slug, 'post');
    const fingerprint = fingerprintFor(relFile);

    for (const entry of listDir(postDir) || []) {
      if (!entry.endsWith('.json')) continue;
      if (entry === EXPLAINED_DIFFS || entry.endsWith(TRACE_SUFFIX)) continue;
      // `path.join` normalises to the host separator on BOTH sides, which is what
      // the test's injected `readJson` (matching on a `/post/` marker) expects.
      const goldenPath = path.join(postDir, entry);
      const tracePath = resolveTracePath(goldenPath);
      const trace = readTrace(tracePath);
      const reason = !trace ? 'missing' : trace.source_fingerprint !== fingerprint ? 'stale' : null;
      if (!reason) continue; // fresh — the lockfile is current, nothing to re-capture
      const golden = readJson(goldenPath);
      if (!golden) continue;
      jobs.push({
        slug,
        relFile,
        invocation: entry.replace(/\.json$/, ''),
        goldenPath,
        tracePath,
        chain: golden.chain,
        args: Array.isArray(golden.args) ? golden.args : [],
        reason,
      });
    }
  }
  return jobs;
}

/**
 * The argv for ONE job's re-run, WITHOUT the node/dotenv prefix:
 * `[harness, --step, --chain, --out, --trace-only]` plus `--args=` only when the
 * golden actually carried args (an empty `--args=` would be a flag the harness
 * parses into nothing, but it is never emitted so the invocation reads honestly).
 *
 * @param {{relFile: string, chain: string, goldenPath: string, args: string[]}} job
 * @param {string} harnessPath
 * @returns {string[]}
 */
export function buildArgv(job, harnessPath) {
  const argv = [
    harnessPath,
    `--step=${job.relFile}`,
    `--chain=${job.chain}`,
    `--out=${job.goldenPath}`,
    '--trace-only',
  ];
  if (Array.isArray(job.args) && job.args.length > 0) argv.push(`--args=${job.args.join(',')}`);
  return argv;
}

/** `docs/reports/golden/<slug>/post/<invocation>.json` -> `<slug>/post/<invocation>.json`, or the raw path. */
function relToGoldenRoot(goldenPath) {
  const norm = String(goldenPath).replace(/\\/g, '/');
  const marker = '/post/';
  const idx = norm.indexOf(marker);
  if (idx === -1) return norm;
  const tail = norm.slice(idx + 1);
  const slug = tail.split('/')[0];
  return `${slug}/${tail.split('/').slice(1).join('/')}`;
}

function printPlan(chain, jobs) {
  console.log(`[witness-chain] chain=${chain} — ${jobs.length} job(s) to backfill`);
  for (const job of jobs) {
    console.log(`  ${job.slug} ${job.invocation} ${job.reason} -> ${relToGoldenRoot(job.goldenPath)}`);
  }
}

/** The committed sources corpus, in `converted.json` order, filtered to REAL manifest files. */
function loadConverted() {
  const parsed = JSON.parse(fs.readFileSync(CONVERTED_PATH, 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const files = new Set(Object.values(manifest.scripts || {}).map((e) => e && e.file));
  return (parsed.converted || []).filter((f) => files.has(f));
}

/** `computeSourceFingerprint` for a repo-relative step file — the SAME helper G8/R-C uses. */
function defaultFingerprintFor(relFile) {
  const harness = require(HARNESS_PATH);
  const descriptorPath = harness.descriptorPathFor(relFile);
  const abs = path.join(REPO_ROOT, descriptorPath);
  const descriptor = fs.existsSync(abs) ? JSON.parse(fs.readFileSync(abs, 'utf8')) : null;
  const { source_fingerprint: fingerprint } = harness.computeSourceFingerprint({
    step: relFile,
    descriptorPath,
    notesPath: harness.notesPathFor(descriptor, descriptorPath),
    computePath: harness.computePathFor(relFile),
  });
  return fingerprint;
}

/**
 * ONE pool for the ONE DB use this script makes: the Phase-0 DSM pre-flight
 * (`capture-witness.dsmGuard`, Spec 30 §4.1). No job needs a pool of its own —
 * each job re-runs the capture harness as a CHILD process.
 */
async function dsmPreflight(pool) {
  const { dsmGuard } = require(path.join(REPO_ROOT, 'scripts/analysis/capture-witness.js'));
  await dsmGuard(pool, process.env);
}

function spawnJob(job, harnessPath) {
  const run = spawnSync(
    process.execPath,
    ['-r', 'dotenv/config', ...buildArgv(job, harnessPath)],
    { cwd: REPO_ROOT, stdio: 'inherit', env: process.env },
  );
  return run.status == null ? 1 : run.status;
}

/** `slug invocation reason exit` — one row per planned job, failures last is not wanted: plan order. */
function printResults(results) {
  const widths = ['slug', 'invocation', 'reason'].map((key, i) =>
    Math.max(key.length, ...results.map((r) => String(r[key]).length)),
  );
  const line = (slug, invocation, reason, exit) =>
    `  ${String(slug).padEnd(widths[0])}  ${String(invocation).padEnd(widths[1])}  ` +
    `${String(reason).padEnd(widths[2])}  ${exit}`;
  console.log(line('slug', 'invocation', 'reason', 'exit'));
  for (const r of results) console.log(line(r.slug, r.invocation, r.reason, r.exit));
}

function parseArgs(argv) {
  const opts = {};
  for (const arg of argv) {
    if (arg.startsWith('--chain=')) opts.chain = arg.slice('--chain='.length) || null;
    else if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg === '--probe') opts.probe = true;
  }
  return opts;
}

async function probe() {
  const CHAIN = 'main';
  const MANIFEST = {
    chains: { [CHAIN]: ['a_step', 'b_step', 'c_step'] },
    scripts: {
      a_step: { file: 'scripts/a.js' },
      b_step: { file: 'scripts/b.js' },
      c_step: { file: 'scripts/c.js' },
    },
  };
  const GOLDEN_ROOT = path.join('golden');
  const DIR_LISTINGS = {
    a_step: ['sources.json', 'standalone.json', 'explained-diffs.json'],
    b_step: ['sources.json'],
  };
  const GOLDEN_DOCS = {
    'a_step/sources.json': { chain: CHAIN, args: ['--full'] },
    'a_step/standalone.json': { chain: CHAIN, args: [] },
    'a_step/explained-diffs.json': { chain: CHAIN, args: [] },
    'b_step/sources.json': { chain: CHAIN, args: [] },
  };
  const jobs = planWitness({
    chain: CHAIN,
    manifest: MANIFEST,
    convertedFiles: ['scripts/a.js', 'scripts/b.js'],
    goldenRoot: GOLDEN_ROOT,
    readJson: (file) => {
      const norm = file.replace(/\\/g, '/');
      const idx = norm.indexOf('/post/');
      const key = idx >= 0 ? norm.slice(idx + '/post/'.length) : baseName(norm);
      console.log(`PROBE readJson ${JSON.stringify(file)} -> norm=${JSON.stringify(norm)} idx=${idx} key=${JSON.stringify(key)} hit=${key in GOLDEN_DOCS}`);
      return GOLDEN_DOCS[key];
    },
    listDir: (dir) => {
      const parts = dir.replace(/\\/g, '/').split('/');
      return DIR_LISTINGS[parts[parts.length - 2]] ?? [];
    },
    fingerprintFor: (relFile) => ({ 'scripts/a.js': 'fp-a', 'scripts/b.js': 'fp-b' }[relFile] ?? 'fp-unknown'),
    tracePathFor: (gp) => {
      const norm = gp.replace(/\\/g, '/');
      const idx = norm.indexOf('/post/');
      if (idx < 0) return `${norm}.trace.json`;
      const slug = norm.split('/')[1];
      return path.join(GOLDEN_ROOT, slug, `${baseName(norm).replace(/\.json$/, '')}.trace.json`);
    },
    readTrace: () => null,
  });
  for (const j of jobs) console.log(`PROBE job ${j.slug} ${j.invocation} ${j.reason} chain=${JSON.stringify(j.chain)} args=${JSON.stringify(j.args)}`);
}

/** @returns {Promise<number>} the exit code; never calls `process.exit`. */
async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || !opts.chain) {
    console.log('usage: node scripts/analysis/witness-chain.mjs --chain=<id> [--dry-run]');
    return opts.help ? 0 : 2;
  }

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  if (!manifest.chains || !manifest.chains[opts.chain]) {
    console.error(`[witness-chain] unknown chain "${opts.chain}" — not in scripts/manifest.json chains` +
      ` [${Object.keys((manifest && manifest.chains) || {}).join(', ')}]`);
    return 2;
  }

  const jobs = planWitness({
    chain: opts.chain,
    manifest,
    convertedFiles: loadConverted(),
    goldenRoot: GOLDEN_ROOT,
    readJson: (file) => JSON.parse(fs.readFileSync(file, 'utf8')),
    listDir: (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir) : []),
    fingerprintFor: defaultFingerprintFor,
    tracePathFor: defaultTracePathFor,
    readTrace: (tracePath) =>
      fs.existsSync(tracePath) ? JSON.parse(fs.readFileSync(tracePath, 'utf8')) : null,
  });

  if (opts.dryRun) {
    printPlan(opts.chain, jobs);
    return 0; // --dry-run touches no DB and spawns nothing
  }
  if (jobs.length === 0) {
    console.log(`[witness-chain] chain=${opts.chain}: every converted step's POST trace is fresh — nothing to do`);
    return 0;
  }

  const { createResolvedPool } = require(path.join(REPO_ROOT, 'scripts/lib/resolve-db.js'));
  const pool = createResolvedPool({ label: 'witness-chain' });
  try {
    console.log(`[witness-chain] db target: ${pool.buildoTarget.description} (source ${pool.buildoTarget.source})`);
    await dsmPreflight(pool);
  } catch (err) {
    console.error(`[witness-chain] ${err.message}`);
    return 1;
  } finally {
    await pool.end();
  }

  console.log(`[witness-chain] chain=${opts.chain}: ${jobs.length} job(s), sequential`);
  const results = [];
  for (const job of jobs) {
    const exit = spawnJob(job, HARNESS_PATH);
    results.push({ slug: job.slug, invocation: job.invocation, reason: job.reason, exit });
  }
  printResults(results);
  return results.some((r) => r.exit !== 0) ? 1 : 0;
}

// The CLI runs ONLY when this file IS the process entry point, so importing the
// planner from a test opens no pool and spawns nothing (`-r dotenv/config` does not
// change `process.argv[1]`).
const INVOKED_AS_CLI = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (INVOKED_AS_CLI) {
  main()
    .then((code) => { process.exitCode = code; })
    .catch((err) => {
      console.error(`[witness-chain] ${err.stack || err.message}`);
      process.exitCode = 1;
    });
}
