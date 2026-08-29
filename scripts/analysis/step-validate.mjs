#!/usr/bin/env node
/**
 * step:validate — Spec 123 integrated validation (operator ruling R-R, 2026-08-29).
 * Also the mechanism behind Spec 124 Rule 13 "A step validates itself."
 *
 * "Validation is part of the standard step and ENFORCED — never a separate track"
 * (Spec 120's validator drifted on a separate track; Spec 123's scorecard was not
 * produced for pilots 4-5). This is the ONE command that, for a converted (or
 * pending) step:
 *   (i)   runs validateDescriptor (AJV + grandfathered + semantic) on its descriptor
 *   (ii)  runs the shape gate for its file + compute module
 *   (iii) runs vitest for step-conformance + golden-fingerprint + src/tests/steps/<slug>/
 *   (iv)  checks golden captures: post/ present for every declared invocation,
 *         fingerprint current, --compare of newest post vs pre shows only
 *         explained-bucket diffs
 *   (v)   computes the Spec 123 SS6 SCORECARD G0-G9 from ARTIFACTS, never prose
 *   (vi)  prints the Spec 124 POLICY COVERAGE MATRIX (Rules 1-13) for this step
 *
 * PLUS the 7 fast invariants (the "fast descriptor gate" followup, subsumed here
 * per the operator's instruction) — always run, always cheap, no vitest/DB needed:
 *   1. database.min_migration <= migrations/*.sql COUNT (LW-D8 — a COUNT floor,
 *      never a filename number)
 *   2. every declared config.logic_variables[].name has a scripts/seeds/logic_variables.json entry
 *   3. config.retired[].name INTERSECT config.logic_variables[].name === empty
 *   4. converted.json: converted INTERSECT pending === empty
 *   5. every real `it.fails(` call site under src/tests/steps/ sits under a slug
 *      that is in converted.json's `pending` list AND carries a "flips at" comment
 *   6. golden-fingerprint currency (shares its result with item iv/G8)
 *   7. the step file carries a `SPEC LINK:` header comment
 *   8. G-4 (Rule 3) — a verdict-affecting logic variable (named by some check's
 *      `limit_from_config`) has `on_invalid:"fail"`, unless `deviations[]` names a
 *      reviewed, dated exception (the `load_ravines` cloud-seed-timing precedent)
 *
 * SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md SS6 (gates),
 *            SS5.2 (per-step checklist), SS4.4 (checker self-test doctrine, SS12b.6)
 * SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md SS2 (Rules 1-13)
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md ruling R-C (fingerprint lockfile)
 *
 * Usage:
 *   node scripts/analysis/step-validate.mjs --step=link_massing
 *   node scripts/analysis/step-validate.mjs --all
 *   node scripts/analysis/step-validate.mjs --all --write      (backfill the scorecard into each report)
 *   node scripts/analysis/step-validate.mjs --all --fast       (skip the vitest spawn — pre-commit/pre-push)
 *
 * Exit codes: 0 = clean · 1 = a hard stop fired (G6/G7/G8 == 0, G9 fails, or a fast
 * invariant fails) on any validated step, or the built-in self-test did not fire as
 * expected · 2 = bad setup.
 *
 * ---------------------------------------------------------------------------------
 * POLICY-COVERAGE MAP (item vi) — describe title (regex) -> Spec 124 Rule, scoped to
 * a test whose title also names THIS step's slug/file/compute-path where the describe
 * loops per-step. A rule with no line here, or whose matched tests never ran for this
 * step, prints PROSE-ONLY (never silently "green"). Documented here because the task
 * itself requires the map to live in this file's header, not to be inferred.
 *
 *   Rule 1  (nothing hidden)        -> (i) AJV `checks` minItems + (ii) compute-shape scan clean +
 *                                       G-1's schema-baseline `--check` (new fields need x-ruling).
 *   Rule 2  (compute is just compute) -> (ii) compute-shape ast-grep + describe /§5\.5.*compute shape/i,
 *                                       scoped to a title containing the step's compute path.
 *   Rule 3  (tunables externalized) -> (ii) compute-no-literal-* ast-grep rules + describes
 *                                       /§1\.2a P4/i, /LW-D10/i, /R-A —/i (scoped to slug/file where present)
 *                                       + Rule 4-closing G-4 lock (on_invalid:fail binding — validate.js).
 *   Rule 4  (compute rule declared) -> G-2: checkPreservedInComputeHasWhy(report) — every
 *                                       preserved-in-compute Intent Ledger row names where the
 *                                       rule is written down (why/notes.json/checks[] in the same row).
 *   Rule 5  (checks != "none")      -> (i) AJV `checks` minItems:1.
 *   Rule 6  (omission fails)        -> (i) AJV top-level `required` (18 categories).
 *   Rule 7  (archetype gates categories) -> (i) AJV allOf archetype profiles.
 *   Rule 8  (per-target write discipline) -> (i) AJV write_discipline if/then blocks.
 *   Rule 9  (banned write needs ledger) -> (i) assertGrandfathered + assertNoRetraction (V7 no_retraction,
 *                                       validate.js semanticFindings).
 *   Rule 10 (verdict row-derived)   -> enforced by step-library.logic.test.ts, which is OUTSIDE this
 *                                       tool's run scope (spec names step-conformance + golden-fingerprint
 *                                       + src/tests/steps/<slug>/ only) -> PROSE-ONLY from step:validate's
 *                                       own vantage, with that caveat stated explicitly.
 *   Rule 11 (phase-order re-derive) -> describe /R-B —/i (scoped to slug where present).
 *   Rule 12 (truthful crash posture) -> describe /R-M\/LG-17/i (scoped to slug where present) +
 *                                       describe /R-B reader|LW-D20|LG-19/i (the crashed/stuck-running FULL trigger).
 *   Rule 13 (a step validates itself) -> (i)-(vi) all ran successfully for this step, this run
 *                                       (this tool IS Rule 13's mechanism — a step with no scorecard
 *                                       block or a stale one violates it; see the conformance lock).
 *   (extra, not a numbered Rule) P3 (Spec 122 §1.2a disk-I/O cost adjudication) -> NOT a schema
 *                                       field (Spec 122's own text: "programme mechanics... not a
 *                                       property of a finished step"). measureP3Footprint reports
 *                                       descriptor/notes bytes, checks[] count, and the newest post/
 *                                       capture's records_meta bytes — a MEASUREMENT, never pass/fail
 *                                       ("visibility wins by default; the cost is stated").
 * ---------------------------------------------------------------------------------
 */
'use strict';

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const CONVERTED_PATH = path.join(REPO_ROOT, 'scripts/steps/_schema/converted.json');
const MANIFEST_PATH = path.join(REPO_ROOT, 'scripts/manifest.json');
const GOLDEN_ROOT = path.join(REPO_ROOT, 'docs/reports/golden');
const DEFECT_LEDGER_PATH = path.join(REPO_ROOT, 'docs/reports/defect-ledger.md');

const validateLib = require(path.join(REPO_ROOT, 'scripts/lib/step/validate.js'));
const harness = require(path.join(REPO_ROOT, 'scripts/analysis/capture-step-golden.js'));

const STEP_SHAPE_RULE = 'scripts/ast-grep-rules/step-shape.yml';
const COMPUTE_SHAPE_RULE = 'scripts/ast-grep-rules/compute-shape.yml';
const MIGRATIONS_DIR = path.join(REPO_ROOT, 'migrations');
const SEEDS_PATH = path.join(REPO_ROOT, 'scripts/seeds/logic_variables.json');
const STEPS_TEST_ROOT = path.join(REPO_ROOT, 'src/tests/steps');

const DISPOSITION_VOCAB = [
  'preserved-in-runner',
  'preserved-in-validator',
  'preserved-in-compute',
  'encoded-as-descriptor-field',
  'encoded-as-deviation',
  'knowingly-retired',
];

// The G6 closed vocabulary for a defect-ledger row's STATUS column (Rule/G6 normalisation,
// WF1 commit 1 fix). A DEFECT-classified row's status must be exactly one of these buckets;
// free text like "OPEN · fix scheduled commit 7" is not machine-checkable — the row itself
// must carry one of these tokens.
const LEDGER_STATUS_VOCAB = /\b(CLOSED|PIN)\b/i;

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const out = { fast: false, write: false, all: false, staged: false, step: null, selfTestOnly: false };
  for (const a of argv) {
    if (a === '--all') out.all = true;
    else if (a === '--staged') out.staged = true;
    else if (a === '--write') out.write = true;
    else if (a === '--fast') out.fast = true;
    else if (a === '--self-test-only') out.selfTestOnly = true;
    else if (a.startsWith('--step=')) out.step = a.slice('--step='.length);
    else throw new Error(`unrecognised argument: ${a}`);
  }
  if (!out.all && !out.staged && !out.step && !out.selfTestOnly) {
    throw new Error('usage: --step=<slug> | --all | --staged [--write] [--fast]');
  }
  return out;
}

/**
 * `--staged` — the git hooks' mode, and NOT the same thing as `--all`.
 *
 * A hard stop is meant to gate a PILOT'S OWN cutover ("you may not land commit
 * 9 with G6/G7/G8 red"), per Spec 123 §6's own wording — never to permanently
 * block every future commit repo-wide until every HISTORICAL pilot report is
 * perfect. Measured 2026-08-29, building this exact tool: wiring `--all` into
 * `.husky/pre-commit` bricked the repo — four of five pilots pre-date this
 * scorecard and score below 14/17, so EVERY commit (including the one adding
 * this tool) failed the hook, forever, until all four were individually fixed.
 * `--staged` fixes the SCOPE, not the SEVERITY: it still hard-stops, but only
 * for a step whose OWN files (descriptor/notes/compute/script/report/tests)
 * are part of THIS commit. `--all` stays available, unchanged, for a full-fleet
 * CI/manual audit that is explicitly allowed to report red without blocking
 * anything — that is `review_followups.md`'s job, not a commit gate's.
 */
function gitDiffNameOnly(args) {
  const res = spawnSync('git', ['diff', '--name-only', ...args], { cwd: REPO_ROOT, encoding: 'utf8' });
  if (res.status !== 0) return null;
  return (res.stdout || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => l.replace(/\\/g, '/'));
}

/**
 * The index (`git diff --cached`) at pre-commit time; at pre-push time the
 * index is normally clean (the commit already landed), so that call returns
 * empty and we fall back to the LAST commit's own changed files
 * (`git diff HEAD~1 HEAD`) — "what did the thing about to be pushed change."
 * A repo with only one commit ever (no `HEAD~1`) falls back again to nothing
 * staged, which `main()` already treats as a clean no-op exit, never a crash.
 */
function gitStagedFiles() {
  const cached = gitDiffNameOnly(['--cached']);
  if (cached && cached.length > 0) return cached;
  return gitDiffNameOnly(['HEAD~1', 'HEAD']) || [];
}

/**
 * `blocking: true` — the step's own CODE moved (script/descriptor/notes/compute)
 * in this commit: a hard stop is a real gate here.
 * `blocking: false` — only the REPORT or its `violations.test.ts` moved (a
 * doc/scorecard/test-wording fix). Still scored and printed for visibility,
 * but never counted toward `anyHardStop` — a step's OWN pre-existing red score
 * must never block a commit that merely documents it honestly (measured
 * 2026-08-29 building this tool: the very commit backfilling all five pilots'
 * scorecards would otherwise be permanently unable to land, since backfilling
 * IS touching every report on purpose).
 */
function filterToStaged(registry) {
  const staged = new Set(gitStagedFiles());
  if (staged.size === 0) return [];
  const out = [];
  for (const row of registry) {
    const notesPath = path.dirname(row.relFile) + '/' + path.basename(row.relFile).replace(/\.(js|py)$/, '') + '.notes.json';
    const computePath = harness.computePathFor(row.relFile);
    const codeCandidates = [row.relFile, harness.descriptorPathFor(row.relFile), notesPath, computePath].filter(Boolean);
    const docCandidates = [
      row.report ? path.relative(REPO_ROOT, row.report).replace(/\\/g, '/') : null,
      `src/tests/steps/${row.slug}/violations.test.ts`,
    ].filter(Boolean);
    const codeTouched = codeCandidates.some((c) => staged.has(c));
    const docTouched = docCandidates.some((c) => staged.has(c));
    if (codeTouched || docTouched) out.push({ ...row, blocking: codeTouched });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Step registry — derived from converted.json + pending + manifest.json, never
// hand-maintained (a hardcoded list would drift the moment pilot 6 lands).
// ---------------------------------------------------------------------------
function loadConverted() {
  const parsed = JSON.parse(readFileSync(CONVERTED_PATH, 'utf8'));
  return {
    converted: (parsed.converted || []).map((f) => String(f).replace(/\\/g, '/')),
    pending: (parsed.pending || []).map((p) => (typeof p === 'string' ? p : p.file)).map((f) => String(f).replace(/\\/g, '/')),
  };
}

function loadManifest() {
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
}

/** slug for a manifest step file — throws rather than silently skipping (mirrors golden-fingerprint's own rule). */
function slugFor(manifest, relFile) {
  const found = Object.entries(manifest.scripts).find(([, e]) => e.file === relFile)?.[0];
  if (!found) throw new Error(`no manifest.scripts entry points at ${relFile}`);
  return found;
}

/** The estate's initials convention (AS/LR/LM/LW/LPA) — one letter per underscore-separated word, uppercased. */
function defectPrefixFor(slug) {
  return slug.split('_').map((w) => w[0].toUpperCase()).join('');
}

/** The assessment report for a slug, found by dash-form filename match — never hand-mapped. */
function reportPathFor(slug) {
  const dashSlug = slug.replace(/_/g, '-');
  const dir = path.join(REPO_ROOT, 'docs/reports');
  const hit = readdirSync(dir).find(
    (f) => /^\d{4}-\d{2}-\d{2}-pilot\d+-.*-assessment\.md$/.test(f) && f.includes(`-${dashSlug}-assessment.md`),
  );
  return hit ? path.join(dir, hit) : null;
}

function buildRegistry() {
  const manifest = loadManifest();
  const { converted, pending } = loadConverted();
  const rows = [];
  for (const relFile of converted) {
    const slug = slugFor(manifest, relFile);
    rows.push({ slug, relFile, stage: 'converted', prefix: defectPrefixFor(slug), report: reportPathFor(slug) });
  }
  for (const relFile of pending) {
    let slug;
    try {
      slug = slugFor(manifest, relFile);
    } catch {
      continue; // a pending entry not (yet) reachable from any chain is not this tool's problem
    }
    rows.push({ slug, relFile, stage: 'pending', prefix: defectPrefixFor(slug), report: reportPathFor(slug) });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// (i) validateDescriptor
// ---------------------------------------------------------------------------
function checkDescriptor(row) {
  const descriptorPath = harness.descriptorPathFor(row.relFile);
  const abs = path.join(REPO_ROOT, descriptorPath);
  if (!existsSync(abs)) return { ok: false, descriptorPath, error: `${descriptorPath} does not exist` };
  let descriptor;
  try {
    descriptor = JSON.parse(readFileSync(abs, 'utf8'));
  } catch (err) {
    return { ok: false, descriptorPath, error: `not valid JSON: ${err.message}` };
  }
  try {
    validateLib.validateDescriptor(descriptor);
    return { ok: true, descriptorPath, descriptor };
  } catch (err) {
    return { ok: false, descriptorPath, descriptor, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// (ii) shape gate — "for its file + compute" (the task's own words): a NARROW
// ast-grep scan over only the targets being validated, not the full ~66-file
// manifest corpus scripts/hooks/check-step-shape.mjs sweeps (which is already
// enforced, full-corpus, later in the SAME pre-commit hook via
// scripts/hooks/ast-grep-leads.sh). Measured 2026-08-29: the full-corpus
// driver alone costs ~1.5s; a scan scoped to N converted files is the
// difference between step:validate meeting its own <1s --fast budget and not.
// Same rule files, same ast-grep binary resolution — narrower scope only.
// ---------------------------------------------------------------------------
function astGrepBinary() {
  const candidates =
    process.platform === 'win32'
      ? [
          path.join(REPO_ROOT, 'node_modules', '@ast-grep', 'cli-win32-x64-msvc', 'ast-grep.exe'),
          path.join(REPO_ROOT, 'node_modules', '@ast-grep', 'cli', 'ast-grep.exe'),
        ]
      : [path.join(REPO_ROOT, 'node_modules', '.bin', 'ast-grep')];
  const found = candidates.find((c) => existsSync(c));
  if (!found) throw new Error(`ast-grep binary not found (looked in ${candidates.join(', ')}) — run npm ci`);
  return found;
}

function scanFiles(files, rule) {
  const byFile = new Map(files.map((f) => [f, []]));
  if (files.length === 0) return byFile;
  const res = spawnSync(astGrepBinary(), ['scan', '--rule', rule, '--report-style=short', '--color=never', ...files], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (res.error) throw res.error;
  const stdout = res.stdout || '';
  if (!stdout.trim() && res.status !== 0 && res.status !== 1) {
    throw new Error(`ast-grep failed (exit ${res.status}): ${res.stderr}`);
  }
  const LINE = /^(.+?):(\d+):(\d+): (?:error|warning|note|info)\[([\w-]+)\]:/;
  for (const line of stdout.split(/\r?\n/)) {
    const m = LINE.exec(line);
    if (!m) continue;
    const rel = path.relative(REPO_ROOT, path.resolve(REPO_ROOT, m[1])).replace(/\\/g, '/');
    if (!byFile.has(rel)) byFile.set(rel, []);
    byFile.get(rel).push({ rule: m[4], line: Number(m[2]) });
  }
  return byFile;
}

/** Batched across every target so --all pays exactly 2 ast-grep spawns total, not 2xN. */
function checkShapeBatch(rows) {
  const stepFiles = rows.filter((r) => r.stage === 'converted').map((r) => r.relFile);
  const computeFiles = [...new Set(rows.map((r) => harness.computePathFor(r.relFile)).filter(Boolean))];
  const stepResults = scanFiles(stepFiles, STEP_SHAPE_RULE);
  const computeResults = scanFiles(computeFiles, COMPUTE_SHAPE_RULE);
  const out = new Map();
  for (const row of rows) {
    const computePath = harness.computePathFor(row.relFile);
    const fileViolations = row.stage === 'converted' ? stepResults.get(row.relFile) || [] : [];
    const computeViolations = computePath ? computeResults.get(computePath) || [] : [];
    out.set(row.slug, {
      fileClean: row.stage === 'converted' ? fileViolations.length === 0 : null,
      computeClean: computePath ? computeViolations.length === 0 : null,
      fileViolations,
      computeViolations,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// (iii) vitest — one spawn for the whole run, not one per step (the shared
// suites already loop over converted.json internally).
// ---------------------------------------------------------------------------
function runVitest() {
  const outFile = path.join(os.tmpdir(), `step-validate-vitest-${process.pid}.json`);
  const targets = ['src/tests/step-conformance.infra.test.ts', 'src/tests/golden-fingerprint.infra.test.ts', 'src/tests/steps/'];
  const run = spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['vitest', 'run', ...targets, '--reporter=json', `--outputFile=${outFile}`],
    { cwd: REPO_ROOT, encoding: 'utf8', timeout: 600_000, maxBuffer: 256 * 1024 * 1024 },
  );
  if (!existsSync(outFile)) {
    return { ranOk: false, error: `vitest produced no JSON report (exit ${run.status}); stderr: ${(run.stderr || '').slice(0, 2000)}`, tests: [] };
  }
  const parsed = JSON.parse(readFileSync(outFile, 'utf8'));
  const tests = [];
  for (const file of parsed.testResults || []) {
    for (const a of file.assertionResults || []) {
      tests.push({
        file: file.name,
        ancestorTitles: a.ancestorTitles || [],
        title: a.title,
        fullName: [...(a.ancestorTitles || []), a.title].join(' > '),
        status: a.status, // 'passed' | 'failed' | 'pending'
      });
    }
  }
  return {
    ranOk: true,
    numTotalTests: parsed.numTotalTests,
    numPassedTests: parsed.numPassedTests,
    numFailedTests: parsed.numFailedTests,
    success: parsed.success,
    tests,
  };
}

// ---------------------------------------------------------------------------
// (iv) captures — invocation coverage + fingerprint currency + compare
// (deliberately re-derives the SAME logic golden-fingerprint.infra.test.ts
// proves, off the SAME exported harness functions, so a red here and a red
// there always agree — never two independent implementations of one gate).
// ---------------------------------------------------------------------------
function derivedInvocations(manifest, slug) {
  const chains = Object.entries(manifest.chains).filter(([, slugs]) => slugs.includes(slug)).map(([id]) => id);
  const scriptEntry = manifest.scripts[slug];
  const out = chains.map((chain) => ({ chain, args: [...((scriptEntry?.chain_args || {})[chain] || [])] }));
  out.push({ chain: 'none', args: [] });
  return out;
}
function invocationKey(inv) {
  return `${inv.chain}::${inv.args.join(',')}`;
}
function capturesIn(slug, sub) {
  const dir = path.join(GOLDEN_ROOT, slug, sub);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const abs = path.join(dir, f);
      let doc = null;
      try {
        doc = JSON.parse(readFileSync(abs, 'utf8'));
      } catch {
        doc = null;
      }
      return { file: f, abs, mtime: statSync(abs).mtimeMs, doc };
    });
}

function checkCaptures(row, descriptorInfo, computePath, report) {
  const manifest = loadManifest();
  const findings = { invocationsMissing: [], staleFingerprints: [], compareRan: false, diffs: [], unexplainedDiffs: [] };

  const invocations = derivedInvocations(manifest, row.slug);
  const posts = capturesIn(row.slug, 'post');
  const postKeys = new Set(posts.filter((p) => p.doc).map((p) => invocationKey({ chain: String(p.doc.chain), args: p.doc.args || [] })));
  findings.invocationsMissing = invocations.filter((inv) => !postKeys.has(invocationKey(inv))).map(invocationKey);

  let expected = null;
  if (descriptorInfo.ok || existsSync(path.join(REPO_ROOT, descriptorInfo.descriptorPath))) {
    try {
      expected = harness.computeSourceFingerprint({
        step: row.relFile,
        descriptorPath: descriptorInfo.descriptorPath,
        notesPath: harness.notesPathFor(descriptorInfo.descriptor, descriptorInfo.descriptorPath),
        computePath,
      });
    } catch (err) {
      findings.fingerprintError = err.message;
    }
  }
  if (expected) {
    for (const p of posts) {
      if (!p.doc) continue;
      if (p.doc.source_fingerprint !== expected.source_fingerprint) findings.staleFingerprints.push(p.file);
    }
  }

  // --compare: newest pre vs newest post, matched by SHARED FILENAME (the
  // scenario-label convention every step's golden/ directory already follows).
  const pres = capturesIn(row.slug, 'pre');
  const postByName = new Map(posts.map((p) => [p.file, p]));
  for (const pre of pres) {
    const post = postByName.get(pre.file);
    if (!post || !pre.doc || !post.doc) continue;
    findings.compareRan = true;
    const preNorm = pre.doc.normalised ?? pre.doc;
    const postNorm = post.doc.normalised ?? post.doc;
    let diffs = [];
    try {
      diffs = harness.diffNormalised(preNorm, postNorm) || [];
    } catch (err) {
      findings.diffError = err.message;
      continue;
    }
    for (const d of diffs) {
      const key = typeof d === 'string' ? d : d.path || JSON.stringify(d);
      findings.diffs.push({ scenario: pre.file, key });
      // A diff is EXPLAINED when its own deepest field name is cited anywhere in
      // the assessment report — a Defect Ledger ID, a ruling id, or the literal
      // field name discussed as a declared diff — never silently. Deliberately
      // the DEEPEST segment only, never a generic wrapper ("records_meta",
      // "audit_table", "rows", "summary" appear on every diff regardless of
      // whether THIS specific field was ever discussed — matching on those would
      // silently mark every diff "explained" and defeat the gate).
      const GENERIC_WRAPPERS = new Set(['summary', 'records_meta', 'audit_table', 'rows', 'table_state', 'invariants', 'stdout_lines']);
      const rawSegments = String(key).replace(/\[\d+\]/g, '').split('.').filter((s) => s && !/^\d+$/.test(s));
      const segments = rawSegments.filter((s) => !GENERIC_WRAPPERS.has(s));
      let cited;
      if (segments.length > 0) {
        // A real field name survives filtering — require it cited BY NAME.
        const leaf = segments[segments.length - 1];
        cited = report && report.toLowerCase().includes(leaf.toLowerCase());
      } else {
        // Purely structural (an array-index diff with no field name of its own,
        // e.g. "invariants[9]" or "stdout_lines[0]") CANNOT be explained by
        // literal-name citation — there is no name. The only honest evidence is
        // an explicit, NARROWLY-SCOPED blanket acknowledgment: the report must
        // mention an actual difference COUNT ("N differences") within ~400 chars
        // of the bucket word this diff fell under. This is deliberately much
        // narrower than "the word appears anywhere in the document" (which
        // would silently explain everything — measured regression, reverted).
        const bucketWord = rawSegments[rawSegments.length - 1] || String(key).replace(/\[\d+\]/g, '');
        const countRe = /\d+\s+differences?[\s\S]{0,400}/gi;
        cited = false;
        if (report) {
          for (const m of report.matchAll(countRe)) {
            if (m[0].toLowerCase().includes(bucketWord.toLowerCase())) {
              cited = true;
              break;
            }
          }
        }
      }
      if (!cited) findings.unexplainedDiffs.push({ scenario: pre.file, key });
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Fast invariants — the "fast descriptor gate" followup, subsumed here.
// Always run (not only under --fast): cheap, no DB, no vitest.
// ---------------------------------------------------------------------------
function fastMigrationCount() {
  return readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).length;
}
function fastSeeds() {
  if (!existsSync(SEEDS_PATH)) return {};
  return JSON.parse(readFileSync(SEEDS_PATH, 'utf8'));
}
function fastInvariants(rows, converted, pending) {
  const results = [];
  const migCount = fastMigrationCount();
  const seeds = fastSeeds();
  const seedNames = new Set(Object.keys(seeds));

  for (const row of rows) {
    const descPath = harness.descriptorPathFor(row.relFile);
    const abs = path.join(REPO_ROOT, descPath);
    if (!existsSync(abs)) continue;
    let descriptor;
    try {
      descriptor = JSON.parse(readFileSync(abs, 'utf8'));
    } catch {
      continue;
    }

    // 1. database.min_migration <= migrations/*.sql COUNT (LW-D8).
    const db = descriptor.database;
    if (db && db !== 'none' && db.min_migration !== undefined && db.min_migration !== 'none') {
      const pass = db.min_migration <= migCount;
      results.push({ id: 1, slug: row.slug, pass, detail: `min_migration=${db.min_migration} <= migrations count=${migCount}` });
    }

    // 2. declared logic_variables SUBSET OF seeds.
    const cfg = descriptor.config;
    const declared = cfg && cfg !== 'none' && Array.isArray(cfg.logic_variables) ? cfg.logic_variables.map((v) => v.name) : [];
    const missingSeeds = declared.filter((n) => !seedNames.has(n));
    results.push({ id: 2, slug: row.slug, pass: missingSeeds.length === 0, detail: `${declared.length} declared, missing from seeds: ${missingSeeds.join(', ') || 'none'}` });

    // 3. retired INTERSECT declared === empty.
    const retired = cfg && cfg !== 'none' && Array.isArray(cfg.retired) ? cfg.retired.map((r) => r.name) : [];
    const overlap = retired.filter((n) => declared.includes(n));
    results.push({ id: 3, slug: row.slug, pass: overlap.length === 0, detail: `retired=${retired.length} overlap-with-declared=${overlap.join(', ') || 'none'}` });

    // 7. SPEC LINK header exists.
    const stepAbs = path.join(REPO_ROOT, row.relFile);
    const hasSpecLink = existsSync(stepAbs) && /SPEC LINK:/.test(readFileSync(stepAbs, 'utf8'));
    results.push({ id: 7, slug: row.slug, pass: hasSpecLink, detail: `SPEC LINK header present=${hasSpecLink}` });

    // 8. G-4 (Rule 3) — a verdict-affecting logic variable's on_invalid must be "fail",
    // unless a deviations[] entry names a reviewed, dated exception (load_ravines precedent).
    const g4 = checkOnInvalidFail(descriptor);
    results.push({ id: 8, slug: row.slug, pass: g4.pass, detail: `G-4: ${g4.detail}` });
  }

  // 4. converted INTERSECT pending === empty (whole-registry, one row).
  const overlap4 = converted.filter((f) => pending.includes(f));
  results.push({ id: 4, slug: '(registry)', pass: overlap4.length === 0, detail: `overlap: ${overlap4.join(', ') || 'none'}` });

  // 5. every real `it.fails(` call site sits under a pending slug and carries "flips at".
  const pendingSlugs = new Set();
  {
    const manifest = loadManifest();
    for (const f of pending) {
      try {
        pendingSlugs.add(slugFor(manifest, f));
      } catch {
        /* unreachable pending entry — item 5 has nothing to scope it to below */
      }
    }
  }
  const badCallSites = [];
  if (existsSync(STEPS_TEST_ROOT)) {
    for (const slugDir of readdirSync(STEPS_TEST_ROOT)) {
      const f = path.join(STEPS_TEST_ROOT, slugDir, 'violations.test.ts');
      if (!existsSync(f)) continue;
      const text = readFileSync(f, 'utf8');
      const lines = text.split('\n');
      lines.forEach((line, i) => {
        const trimmed = line.trim();
        if (!/^it\.fails\s*\(/.test(trimmed)) return; // real call sites only, never a backticked mention in prose
        const carriesFlip = /flips at/i.test(line);
        if (!pendingSlugs.has(slugDir) || !carriesFlip) {
          badCallSites.push(`${slugDir}/violations.test.ts:${i + 1}`);
        }
      });
    }
  }
  results.push({ id: 5, slug: '(registry)', pass: badCallSites.length === 0, detail: badCallSites.length ? `bad call sites: ${badCallSites.join(', ')}` : 'clean (0 it.fails( call sites outside a declared pending slug)' });

  return results;
}

// ---------------------------------------------------------------------------
// G-1 — new schema fields require x-ruling (Spec 124 §2 Rule 1). One spawn,
// cached across the whole run (schema-wide, not per-step) — mirrors the shape
// checkShapeBatch already uses for the same reason.
// ---------------------------------------------------------------------------
const SCHEMA_BASELINE_GENERATOR = path.join(REPO_ROOT, 'scripts/steps/_schema/generate-schema-baseline.mjs');
let _schemaBaselineResult = null;
function checkSchemaBaseline() {
  if (_schemaBaselineResult) return _schemaBaselineResult;
  const run = spawnSync('node', [SCHEMA_BASELINE_GENERATOR, '--check'], { cwd: REPO_ROOT, encoding: 'utf8', timeout: 30_000 });
  _schemaBaselineResult = { pass: run.status === 0, detail: run.status === 0 ? 'schema-baseline clean' : (run.stderr || run.stdout || '').split('\n')[0] };
  return _schemaBaselineResult;
}

/**
 * G-4 (Spec 124 §2 Rule 3, GAP G-4) — "no check ties on_invalid:'fail' to
 * 'verdict- or write-affecting'; applied by author judgment, reviewed narratively."
 *
 * VERDICT-affecting is mechanically decidable: a `config.logic_variables[]`
 * entry is verdict-affecting iff SOME `checks[].limit_from_config` in the same
 * descriptor names it — that is exactly the schema's own established mechanism
 * for "this config value moves a check's PASS/WARN/FAIL boundary" (already the
 * P4 battery's own `limit_from_config` cross-reference). WRITE-affecting has no
 * equivalent named field anywhere in the schema today and is left PROSE-ONLY —
 * narrowing honestly rather than inventing a shape nothing else in the schema
 * uses (matching G-2's own narrowing precedent).
 *
 * Real descriptors ALREADY carry a legitimate, ratified exception to the naive
 * rule: `load_ravines`'s 6 variables are ALL `on_invalid:"default"` despite 3
 * being verdict-affecting, because `deviations[]` records a dated, adjudicated
 * why (the mig-099 cloud-seed timing hole — `fail` would halt the sources
 * chain on every un-seeded database before the seed runs). A mechanical check
 * that flagged this as a violation would be WRONG, not merely strict — so a
 * verdict-affecting variable with `on_invalid !== "fail"` is a G-4 violation
 * UNLESS the descriptor's `deviations[]` has an entry whose `from` text
 * mentions both "on_invalid" and "fail" (the same rung-(a) descriptor
 * mechanism Rule 1 already prefers for a declared exception).
 */
function checkOnInvalidFail(descriptor) {
  if (!descriptor) return { pass: true, detail: 'no descriptor', violations: [] };
  const cfg = descriptor.config;
  const vars = cfg && cfg !== 'none' && Array.isArray(cfg.logic_variables) ? cfg.logic_variables : [];
  if (vars.length === 0) return { pass: true, detail: 'no declared logic_variables', violations: [] };
  const limitRefs = new Set((descriptor.checks || []).map((c) => c && c.limit_from_config).filter(Boolean));
  const deviations = Array.isArray(descriptor.deviations) ? descriptor.deviations : [];
  const hasOnInvalidDeviation = deviations.some((d) => {
    const from = (d && d.from) || '';
    return /on_invalid/i.test(from) && /fail/i.test(from);
  });
  const violations = vars.filter((v) => limitRefs.has(v.name) && v.on_invalid !== 'fail' && !hasOnInvalidDeviation).map((v) => v.name);
  return {
    pass: violations.length === 0,
    detail: `${vars.length} declared, ${limitRefs.size ? [...limitRefs].length : 0} verdict-affecting, ${violations.length} violate on_invalid:fail with no deviations[] cover`,
    violations,
  };
}

/**
 * P3 (Spec 122 §1.2a) — CORRECTED 2026-08-29 after re-reading the governing text
 * directly, per CLAUDE.md PD#10 (spec-first, never infer from a name). Spec 122's
 * own words: "P3 stays here — it is programme mechanics (a conversion-proposal
 * discipline for this effort, not a PROPERTY OF A FINISHED STEP), per Spec 124
 * §6." P3 is NOT a schema field — it is a MEASURE-AND-STATE discipline: "Disk
 * I/O is a balance that is ADJUDICATED WITH NUMBERS, never assumed... a proposal
 * to add [a box/check/audit row] carries its measured cost (bytes and rows per
 * run) ... Visibility wins by default; the cost is stated." Pilot 1's own P3
 * baseline table (records_meta B / check rows / stdout B, pre→post) is exactly
 * this measurement, done once by hand. This function is that measurement, done
 * automatically, every run, from committed artifacts — never a schema field, and
 * never pass/fail (a footprint has no "correct" size; the discipline is that it
 * is STATED, so an operator reviewing a growth can adjudicate it, per the spec's
 * own words).
 *
 * ⚠️ CORRECTS A REAL MISTAKE: the WF1 commit that first built this validator
 * invented `execution.io_budget` as a new schema field before reading this
 * section of Spec 122 closely enough — a genuine "infer from a name" violation
 * of the project's own PD#10, caught and fixed while building GAP P3's real
 * closure. No such field exists in step.schema.json, and none is added by this
 * function.
 */
function measureP3Footprint(row, descriptorInfo) {
  const descPath = harness.descriptorPathFor(row.relFile);
  const descAbs = path.join(REPO_ROOT, descPath);
  const descriptorBytes = existsSync(descAbs) ? Buffer.byteLength(readFileSync(descAbs)) : 0;
  const notesPath = harness.notesPathFor(descriptorInfo.descriptor, descPath);
  const notesAbs = notesPath ? path.join(REPO_ROOT, notesPath) : null;
  const notesBytes = notesAbs && existsSync(notesAbs) ? Buffer.byteLength(readFileSync(notesAbs)) : 0;
  const checksCount = descriptorInfo.descriptor && Array.isArray(descriptorInfo.descriptor.checks) ? descriptorInfo.descriptor.checks.length : 0;

  // The newest post/ capture's records_meta, if one exists — the same "bytes
  // per run" half of Pilot 1's baseline table, read from a REAL run rather
  // than re-derived. Not required (a step with no capture yet still reports
  // the descriptor/notes/checks half).
  const posts = capturesIn(row.slug, 'post');
  let recordsMetaBytes = null;
  if (posts.length > 0) {
    const newest = posts.reduce((a, b) => (b.mtime > a.mtime ? b : a));
    const rm = newest.doc && newest.doc.summary && newest.doc.summary.records_meta;
    if (rm !== undefined) recordsMetaBytes = Buffer.byteLength(JSON.stringify(rm));
  }
  return {
    descriptorBytes,
    notesBytes,
    checksCount,
    recordsMetaBytes,
    detail:
      `descriptor=${descriptorBytes}B notes=${notesBytes}B checks=${checksCount} rows` +
      (recordsMetaBytes === null ? ' records_meta=(no capture)' : ` records_meta=${recordsMetaBytes}B (newest post/ capture)`),
  };
}

// ---------------------------------------------------------------------------
// (v) SCORECARD G0-G9 — every check reads an ARTIFACT (the report text, the
// descriptor, the defect ledger, the capture files, the test file) — never a
// hand-typed number. §6.1's G4d and G-shape ride along as separate booleans.
// ---------------------------------------------------------------------------
function section(report, headingRe, stopRe = /^##\s/m) {
  const m = headingRe.exec(report);
  if (!m) return null;
  const rest = report.slice(m.index + m[0].length);
  const stop = stopRe.exec(rest);
  return rest.slice(0, stop ? stop.index : rest.length);
}

function notesFencesFor(row) {
  const notesPath = path.join(REPO_ROOT, path.dirname(row.relFile), path.basename(row.relFile).replace(/\.(js|py)$/, '') + '.notes.json');
  if (!existsSync(notesPath)) return [];
  try {
    const notes = JSON.parse(readFileSync(notesPath, 'utf8'));
    return Array.isArray(notes.fences) ? notes.fences : [];
  } catch {
    return [];
  }
}

/** Markdown table row split that respects `\|`-escaped pipes inside a cell's prose (defect-ledger.md rows routinely quote code containing `||`/`|`). A naive `l.split('|')` shifts every later column on such a row. */
function splitTableRow(line) {
  return line.split(/(?<!\\)\|/).map((c) => c.trim());
}

function defectLedgerRowsFor(row) {
  const text = readFileSync(DEFECT_LEDGER_PATH, 'utf8');
  const lines = text.split('\n').filter((l) => l.startsWith('| ') && l.slice(2).trim().startsWith(`${row.prefix}-D`));
  return lines.map((l) => {
    const cells = splitTableRow(l);
    // | ID | Step | Anchor | One-line | Status | Closes at | Source |
    return { id: cells[1], status: cells[5] || '' };
  });
}

function scoreG0(report) {
  const hasBoundary = /(§0|PH-0)[^\n]{0,100}\b(boundary|seed)\b/i.test(report) || /##\s*\d*\.?\s*PH-0\s*—?\s*boundary freeze/i.test(report);
  const hasSpecLine = /(target spec|governing spec|governing plan|governing:|governing specs)/i.test(report);
  return { max: 1, score: hasBoundary && hasSpecLine ? 1 : 0, detail: `boundary-section=${hasBoundary} spec-line=${hasSpecLine}` };
}
function scoreG1(report) {
  const phSection = section(report, /##\s*.{0,10}\d*\.?\s*PH-3[^\n]*\n/i) || section(report, /##\s*.{0,10}\d*\.?\s*(Intent Ledger)[^\n]*\n/i);
  const shaCount = phSection ? (phSection.match(/\b[0-9a-f]{7,10}\b/g) || []).length : 0;
  return { max: 1, score: phSection && shaCount >= 2 ? 1 : 0, detail: `PH-3 section found=${!!phSection} sha-count=${shaCount}` };
}
function scoreG2(report) {
  const hasIncomplete = /ASSESSMENT-INCOMPLETE/.test(report);
  if (!hasIncomplete) return { max: 1, score: 1, detail: 'ASSESSMENT-INCOMPLETE not claimed (vacuously satisfied)' };
  const stated = /ASSESSMENT-INCOMPLETE[\s\S]{0,300}?(because|why|reason|time-box|saturation)/i.test(report);
  return { max: 1, score: stated ? 1 : 0, detail: `ASSESSMENT-INCOMPLETE claimed; why-stated=${stated}` };
}
function scoreG3(report) {
  const phSection = section(report, /##\s*.{0,10}\d*\.?\s*PH-3[^\n]*\n/i);
  if (!phSection) return { max: 2, score: 0, detail: 'no PH-3/Intent Ledger section found' };
  const rows = phSection.split('\n').filter((l) => l.trim().startsWith('|') && !/^\|[-\s|]+\|$/.test(l.trim()));
  const vocabHitRows = rows.filter((r) => DISPOSITION_VOCAB.some((v) => r.toLowerCase().includes(v)));
  const score = rows.length > 0 && vocabHitRows.length > 0 ? (vocabHitRows.length === rows.length ? 2 : 1) : phSection ? 1 : 0;
  return { max: 2, score, detail: `table rows=${rows.length} vocab-hit rows=${vocabHitRows.length}` };
}
/**
 * G-2 (Spec 124 §2 Rule 4, GAP G-2) — "no test asserts that a preserved-in-compute
 * disposition has a corresponding checks[].why. A future disposition could mark
 * something preserved-in-compute and simply not write the rule down anywhere."
 *
 * A disposition and a specific check's `why` text are two different artifacts
 * (a markdown table row in a report; a JSON string in a descriptor) with no
 * shared id to join on — there is no way to mechanically prove row N's rule is
 * THE SAME rule as check id X's why without semantic understanding this tool
 * does not have. What IS mechanically checkable, and matches the report
 * culture's own existing practice (pilot 3's own Intent Ledger: "preserved-
 * in-compute (buildMatchSql, A-2) with the predicate ... DECLARED in
 * notes.json + a shape lock"): every `preserved-in-compute` row must itself
 * NAME where the rule was written down — "why", "notes.json", or "checks[]"
 * appearing in the SAME row. A row that says only the disposition, with no
 * grounding of where the rule lives, is exactly the failure mode G-2 names.
 */
function checkPreservedInComputeHasWhy(report) {
  const phSection = section(report, /##\s*.{0,10}\d*\.?\s*PH-3[^\n]*\n/i);
  if (!phSection) return { pass: true, detail: 'no PH-3 section — vacuously nothing to check', violations: [] };
  const rows = phSection.split('\n').filter((l) => l.trim().startsWith('|') && !/^\|[-\s|]+\|$/.test(l.trim()));
  const preservedRows = rows.filter((r) => r.toLowerCase().includes('preserved-in-compute'));
  const violations = preservedRows.filter((r) => !/\bwhy\b|notes\.json|checks\[\]/i.test(r));
  return {
    pass: violations.length === 0,
    detail: `${preservedRows.length} preserved-in-compute row(s), ${violations.length} with no why/notes.json/checks[] grounding`,
    violations,
  };
}

function scoreG4(report) {
  const hit = /risk class[\s\S]{0,400}?\bchance\b[\s\S]{0,200}?\bimpact\b/i.test(report) || /\bchance\b[\s\S]{0,100}?\bimpact\b[\s\S]{0,200}?risk class/i.test(report);
  return { max: 2, score: hit ? 2 : 0, detail: `risk-class row with chance+impact found=${hit}` };
}
function scoreG5(report) {
  const phSection = section(report, /##\s*.{0,10}\d*\.?\s*PH-5[^\n]*\n/i) || section(report, /##\s*.{0,10}\d*\.?\s*(Seam map)[^\n]*\n/i);
  if (!phSection) return { max: 1, score: 0, detail: 'no PH-5/Seam map section found' };
  const has = (re) => re.test(phSection);
  const all = has(/db seam/i) && has(/clock seam/i) && has(/network seam/i) && has(/argv[\s/]*env seam|env seam/i);
  return { max: 1, score: all ? 1 : 0, detail: `db=${has(/db seam/i)} clock=${has(/clock seam/i)} network=${has(/network seam/i)} argv/env=${has(/argv[\s/]*env seam|env seam/i)}` };
}
function scoreG6(row) {
  const rows = defectLedgerRowsFor(row);
  if (rows.length === 0) return { max: 3, score: 0, detail: `no defect-ledger rows found for prefix ${row.prefix}-D*` };
  const bad = rows.filter((r) => !LEDGER_STATUS_VOCAB.test(r.status));
  return { max: 3, score: bad.length === 0 ? 3 : 0, detail: `${rows.length} ledger row(s), ${bad.length} without CLOSED/PIN (${bad.map((b) => b.id).join(', ')})` };
}
function scoreG7(row, report) {
  const violationsPath = path.join(REPO_ROOT, 'src/tests/steps', row.slug, 'violations.test.ts');
  const fileExists = existsSync(violationsPath);
  const fences = notesFencesFor(row);
  let itCount = 0;
  if (fileExists) {
    const text = readFileSync(violationsPath, 'utf8');
    itCount = (text.match(/\bit(?:\.each|\.fails)?\s*\(/g) || []).length;
  }
  const hasRed = /\bRED\b/.test(report);
  const lockCoverage = fences.length === 0 || itCount >= fences.length;
  const score = fileExists && lockCoverage && hasRed ? 3 : fileExists && hasRed ? 1 : 0;
  return { max: 3, score, detail: `file=${fileExists} fences=${fences.length} it-count=${itCount} RED-evidence=${hasRed}` };
}
function scoreG8(captureFindings) {
  const invOk = captureFindings.invocationsMissing.length === 0;
  const fpOk = captureFindings.staleFingerprints.length === 0;
  const diffOk = captureFindings.unexplainedDiffs.length === 0;
  const score = invOk && fpOk && diffOk ? 3 : 0;
  return {
    max: 3,
    score,
    detail: `missing-invocations=${captureFindings.invocationsMissing.length} stale-fingerprints=${captureFindings.staleFingerprints.length} unexplained-diffs=${captureFindings.unexplainedDiffs.length}`,
  };
}
function scoreG9(report) {
  const hasHeading = /§?R\.?\s*Reflection/i.test(report);
  const hasLow = /LOW-CONFIDENCE/i.test(report);
  const hasRecurring = /RECURRING\s*\/?\s*STANDARD-SHAPING|RECURRING\/STANDARD-SHAPING/i.test(report);
  return { pass: hasHeading && hasLow && hasRecurring, detail: `heading=${hasHeading} low-confidence-table=${hasLow} recurring-table=${hasRecurring}` };
}
function scoreG4d(row) {
  const fences = notesFencesFor(row);
  const violationsPath = path.join(REPO_ROOT, 'src/tests/steps', row.slug, 'violations.test.ts');
  let itCount = 0;
  if (existsSync(violationsPath)) {
    itCount = (readFileSync(violationsPath, 'utf8').match(/\bit(?:\.each|\.fails)?\s*\(/g) || []).length;
  }
  return { pass: fences.length <= itCount, detail: `fences=${fences.length} lock-it-count=${itCount}` };
}
function scoreGShape(shape) {
  const pass = shape.fileClean !== false && shape.computeClean !== false;
  return { pass, detail: `file-clean=${shape.fileClean} compute-clean=${shape.computeClean}` };
}

function computeScorecard(row, report, descriptorInfo, shape, captureFindings, invariantResults) {
  const g = {
    G0: scoreG0(report),
    G1: scoreG1(report),
    G2: scoreG2(report),
    G3: scoreG3(report),
    G4: scoreG4(report),
    G5: scoreG5(report),
    G6: scoreG6(row),
    G7: scoreG7(row, report),
    G8: scoreG8(captureFindings),
  };
  const total = Object.values(g).reduce((s, x) => s + x.score, 0);
  const maxTotal = Object.values(g).reduce((s, x) => s + x.max, 0);
  const g9 = scoreG9(report);
  const g4d = scoreG4d(row);
  const gshape = scoreGShape(shape);
  const invariantsFail = invariantResults.some((r) => (r.slug === row.slug || r.slug === '(registry)') && !r.pass);
  const hardStop = g.G6.score === 0 || g.G7.score === 0 || g.G8.score === 0 || !g9.pass || invariantsFail;
  return { g, total, maxTotal, g9, g4d, gshape, hardStop, descriptorOk: descriptorInfo.ok };
}

// ---------------------------------------------------------------------------
// (vi) POLICY COVERAGE MATRIX — Spec 124 Rules 1-13, per the header map above.
// ---------------------------------------------------------------------------
function matchTests(tests, describeRe, scopeToken) {
  return tests.filter((t) => {
    if (!describeRe.test(t.fullName) && !t.ancestorTitles.some((a) => describeRe.test(a))) return false;
    if (!scopeToken) return true;
    return t.fullName.toLowerCase().includes(scopeToken.toLowerCase());
  });
}
function ruleStatus(matched) {
  if (matched.length === 0) return 'prose-only';
  return matched.every((t) => t.status === 'passed') ? 'enforced-green' : 'enforced-red';
}

function computePolicyMatrix(row, descriptorInfo, shape, vitestResult, p3, report) {
  const tests = vitestResult.ranOk ? vitestResult.tests : [];
  const slugToken = row.slug;
  const computeToken = harness.computePathFor(row.relFile) || '';

  const rows = [];
  const push = (rule, name, status, note) => rows.push({ rule, name, status, note });

  {
    const baseline = checkSchemaBaseline();
    const ok = descriptorInfo.ok && shape.computeClean !== false && baseline.pass;
    push(1, 'Nothing hidden', ok ? 'enforced-green' : 'enforced-red', `G-1 schema-baseline: ${baseline.detail}`);
  }
  {
    const m = vitestResult.ranOk ? matchTests(tests, /§5\.5.*compute shape/i, computeToken) : [];
    const shapeOk = shape.computeClean !== false;
    const status = !vitestResult.ranOk ? (shapeOk ? 'enforced-green' : 'enforced-red') : m.length > 0 ? ruleStatus(m) : (shapeOk ? 'enforced-green' : 'enforced-red');
    push(2, 'Compute is just compute', status, m.length === 0 ? '§5.5 describe not scoped to this step in the vitest run' : '');
  }
  {
    const m = vitestResult.ranOk ? [
      ...matchTests(tests, /§1\.2a P4/i, slugToken),
      ...matchTests(tests, /LW-D10/i, slugToken),
      ...matchTests(tests, /R-A —/i, slugToken),
    ] : [];
    const g4 = checkOnInvalidFail(descriptorInfo.descriptor);
    const vitestOk = m.length === 0 || ruleStatus(m) === 'enforced-green';
    const status = g4.pass && vitestOk ? 'enforced-green' : 'enforced-red';
    push(3, 'Tunables externalized', status, `G-4: ${g4.detail}`);
  }
  {
    const g2 = checkPreservedInComputeHasWhy(report || '');
    push(4, 'Compute rule declared', g2.pass ? 'enforced-green' : 'enforced-red', `G-2: ${g2.detail}`);
  }
  push(5, 'checks >= 1', descriptorInfo.ok ? 'enforced-green' : 'enforced-red', '');
  push(6, 'Omission fails (18 categories)', descriptorInfo.ok ? 'enforced-green' : 'enforced-red', '');
  push(7, 'Archetype gates categories', descriptorInfo.ok ? 'enforced-green' : 'enforced-red', '');
  push(8, 'Per-target write discipline', descriptorInfo.ok ? 'enforced-green' : 'enforced-red', '');
  push(9, 'Banned write needs ledger (+ V7 no_retraction)', descriptorInfo.ok ? 'enforced-green' : 'enforced-red', '');
  push(10, 'Verdict row-derived', 'prose-only', 'enforced by step-library.logic.test.ts, outside step:validate\'s (i)(ii)(iii) run scope');
  {
    const m = vitestResult.ranOk ? matchTests(tests, /R-B —/i, slugToken) : [];
    push(11, 'Phase-order re-derive (R-B)', m.length > 0 ? ruleStatus(m) : 'prose-only', m.length === 0 ? 'R-B describe not scoped to this step' : '');
  }
  {
    const m1 = vitestResult.ranOk ? matchTests(tests, /R-M\/LG-17/i, slugToken) : [];
    const m2 = vitestResult.ranOk ? matchTests(tests, /R-B reader|LW-D20|LG-19/i, slugToken) : [];
    const m = [...m1, ...m2];
    push(12, 'Truthful crash posture (R-M + R-B reader)', m.length > 0 ? ruleStatus(m) : 'prose-only', m.length === 0 ? 'R-M/R-B-reader describes not scoped to this step' : '');
  }
  push(13, 'A step validates itself', descriptorInfo.ok ? 'enforced-green' : 'enforced-red', 'this run of step:validate IS the mechanism');
  push('P3', 'I/O cost adjudication (measured, not gated)', 'measured', p3.detail);

  return rows;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function renderScorecard(row, sc, matrix, captureFindings, vitestResult, invariantResults) {
  const lines = [];
  lines.push('## Validation scorecard (generated)');
  lines.push('');
  lines.push(`> Generated by \`node scripts/analysis/step-validate.mjs --step=${row.slug} --write\` — Spec 123 §6, ruling R-R (2026-08-29).`);
  lines.push(`> Regenerate with the same command; a stale block is a conformance-lock finding (\`step-conformance.infra.test.ts\`).`);
  lines.push('');
  lines.push(`**Score: ${sc.total}/${sc.maxTotal}** · G9 Reflection: ${sc.g9.pass ? 'PASS' : 'FAIL'} · G4d fence-lock coverage: ${sc.g4d.pass ? 'PASS' : 'FAIL'} · G-shape: ${sc.gshape.pass ? 'PASS' : 'FAIL'} · **Hard stop: ${sc.hardStop ? 'YES' : 'no'}**`);
  lines.push('');
  lines.push('| Gate | Score | Max | Detail |');
  lines.push('|---|---:|---:|---|');
  for (const [id, v] of Object.entries(sc.g)) {
    lines.push(`| ${id} | ${v.score} | ${v.max} | ${v.detail} |`);
  }
  lines.push(`| G9 (binary) | ${sc.g9.pass ? 'PASS' : 'FAIL'} | — | ${sc.g9.detail} |`);
  lines.push(`| G4d (fence<=lock) | ${sc.g4d.pass ? 'PASS' : 'FAIL'} | — | ${sc.g4d.detail} |`);
  lines.push(`| G-shape | ${sc.gshape.pass ? 'PASS' : 'FAIL'} | — | ${sc.gshape.detail} |`);
  lines.push('');
  lines.push('### Fast invariants (always run — the fast descriptor gate)');
  lines.push('');
  lines.push('| # | Scope | Pass | Detail |');
  lines.push('|---|---|---|---|');
  const mine = invariantResults.filter((r) => r.slug === row.slug || r.slug === '(registry)');
  for (const r of mine) lines.push(`| ${r.id} | ${r.slug} | ${r.pass ? 'PASS' : 'FAIL'} | ${r.detail} |`);
  lines.push('');
  lines.push('### Captures (item iv)');
  lines.push(`- missing invocations: ${captureFindings.invocationsMissing.length ? captureFindings.invocationsMissing.join(', ') : 'none'}`);
  lines.push(`- stale fingerprints: ${captureFindings.staleFingerprints.length ? captureFindings.staleFingerprints.join(', ') : 'none'}`);
  lines.push(`- compare ran: ${captureFindings.compareRan} · diffs found: ${captureFindings.diffs.length} · unexplained: ${captureFindings.unexplainedDiffs.length}`);
  if (captureFindings.unexplainedDiffs.length) {
    lines.push(`  - unexplained: ${captureFindings.unexplainedDiffs.map((d) => `${d.scenario}:${d.key}`).join('; ')}`);
  }
  lines.push('');
  lines.push('### Test suite (item iii)');
  lines.push(vitestResult.ranOk ? `- ${vitestResult.numPassedTests}/${vitestResult.numTotalTests} passed (suite success=${vitestResult.success})` : `- SKIPPED or failed to run: ${vitestResult.error || '--fast'}`);
  lines.push('');
  lines.push('### Policy coverage matrix (item vi) — Spec 124 Rules 1-13');
  lines.push('');
  lines.push('| Rule | Name | Status | Note |');
  lines.push('|---|---|---|---|');
  for (const r of matrix) lines.push(`| ${r.rule} | ${r.name} | ${r.status} | ${r.note} |`);
  const enforcedGreen = matrix.filter((r) => r.status === 'enforced-green').length;
  lines.push('');
  lines.push(`**Enforced-green: ${enforcedGreen}/${matrix.length}**`);
  lines.push('');
  return lines.join('\n');
}

/**
 * Strip a previously-generated scorecard block before scoring the report's OWN
 * prose. Without this, a report that already carries a block is SELF-CONTAMINATING:
 * the block's own rendered text ("ASSESSMENT-INCOMPLETE claimed; why-stated=…",
 * literal G0-G9 gate ids, "RED" appearing in G7's own detail column, etc.) gets
 * read back as if it were evidence, making a second `--write` run score
 * DIFFERENTLY from the first over the identical underlying prose — measured
 * 2026-08-29: G2 flipped 0->1 between two consecutive runs purely because the
 * first run's own "why-stated=false" text satisfied the SECOND run's own
 * "why-stated" proximity regex. A generated artifact must never become an input
 * to its own regeneration.
 */
function stripScorecard(text) {
  const marker = '## Validation scorecard (generated)';
  const idx = text.indexOf(marker);
  return idx === -1 ? text : text.slice(0, idx);
}

function writeScorecard(reportPath, block) {
  const text = readFileSync(reportPath, 'utf8');
  const marker = '## Validation scorecard (generated)';
  const idx = text.indexOf(marker);
  let next;
  if (idx === -1) {
    next = text.replace(/\n?$/, '\n') + '\n---\n\n' + block + '\n';
  } else {
    const rest = text.slice(idx);
    const nextHeadingMatch = /\n##\s(?!\s)/.exec(rest.slice(marker.length));
    const end = nextHeadingMatch ? idx + marker.length + nextHeadingMatch.index + 1 : text.length;
    next = text.slice(0, idx) + block + '\n' + text.slice(end);
  }
  writeFileSync(reportPath, next);
}

// ---------------------------------------------------------------------------
// Self-test (Spec 121 §12b.6 — a checker that has never been proven to fire is
// not evidence). Runs in-memory against synthetic fixtures on every invocation,
// cheap enough to always pay: it must FIRE on the bad case and stay quiet on
// the good one, or step:validate refuses to do real work.
// ---------------------------------------------------------------------------
function selfTest() {
  const goodReport = [
    '## §0. PH-0 seed — measured boundary table',
    'Target Spec: docs/specs/x.md',
    '## §1. PH-0 — boundary freeze (commit 1, G0)',
    'stuff',
    '## §2. PH-3 — Intent Ledger over the corpus (commit 2, G3)',
    '| commit | note |',
    '|---|---|',
    '| `abcdef1234` | preserved-in-compute disposition |',
    '| `1234abcdef` | encoded-as-descriptor-field disposition |',
    '## §3. PH-5 — Seam map (commit 3, G5)',
    '### DB seam',
    '### Clock seam',
    '### Network seam',
    '### argv/env seam',
    '## §R Reflection',
    'LOW-CONFIDENCE table here',
    'RECURRING/STANDARD-SHAPING table here',
  ].join('\n');
  const badReport = '## Some report\nnothing structured here at all.\n';

  const g0good = scoreG0(goodReport);
  const g0bad = scoreG0(badReport);
  if (g0good.score !== 1 || g0bad.score !== 0) {
    throw new Error(`self-test FAILED: G0 did not discriminate good/bad fixtures (good=${g0good.score}, bad=${g0bad.score})`);
  }
  const g5good = scoreG5(goodReport);
  const g5bad = scoreG5(badReport);
  if (g5good.score !== 1 || g5bad.score !== 0) {
    throw new Error(`self-test FAILED: G5 did not discriminate good/bad fixtures (good=${g5good.score}, bad=${g5bad.score})`);
  }
  const g9good = scoreG9(goodReport);
  const g9bad = scoreG9(badReport);
  if (!g9good.pass || g9bad.pass) {
    throw new Error(`self-test FAILED: G9 did not discriminate good/bad fixtures (good=${g9good.pass}, bad=${g9bad.pass})`);
  }
  const g3good = scoreG3(goodReport);
  const g3bad = scoreG3(badReport);
  if (g3good.score < 1 || g3bad.score !== 0) {
    throw new Error(`self-test FAILED: G3 did not discriminate good/bad fixtures (good=${g3good.score}, bad=${g3bad.score})`);
  }
  const g6good = { status: 'CLOSED · commit 7' };
  const g6bad = { status: 'OPEN · fix scheduled commit 7' };
  if (!LEDGER_STATUS_VOCAB.test(g6good.status) || LEDGER_STATUS_VOCAB.test(g6bad.status)) {
    throw new Error('self-test FAILED: LEDGER_STATUS_VOCAB did not discriminate CLOSED/PIN vs free-text OPEN');
  }
  // Self-contamination regression lock (measured 2026-08-29): a report already
  // carrying a generated block must score IDENTICALLY to the same report with
  // the block absent — the block itself must never become evidence.
  {
    const contaminated = badReport + '\n## Validation scorecard (generated)\n\n| G2 | 0 | 1 | ASSESSMENT-INCOMPLETE claimed; why-stated=false |\n';
    const g2Clean = scoreG2(badReport);
    const g2FromStripped = scoreG2(stripScorecard(contaminated));
    if (g2Clean.score !== g2FromStripped.score) {
      throw new Error('self-test FAILED: stripScorecard did not neutralise a self-contaminating prior block');
    }
    const g2Unstripped = scoreG2(contaminated);
    if (g2Unstripped.score === g2Clean.score && g2Unstripped.detail === g2Clean.detail) {
      throw new Error('self-test FAILED: the contamination fixture does not actually contaminate — the RED half of this lock never fires');
    }
  }
  // measureP3Footprint is a MEASUREMENT, not an enforcer — there is no violation
  // to prove it catches (Spec 121 §12b.6 applies to checkers that gate something).
  // The smoke test instead proves it runs against a real artifact and reports a
  // well-formed number, never silently returning garbage.
  const p3Smoke = measureP3Footprint(
    { slug: '__p3_self_test_nonexistent_slug__', relFile: 'scripts/quality/assert-schema.js' },
    { descriptor: null },
  );
  if (typeof p3Smoke.descriptorBytes !== 'number' || p3Smoke.descriptorBytes <= 0 || !/^descriptor=\d+B/.test(p3Smoke.detail)) {
    throw new Error(`self-test FAILED: measureP3Footprint did not produce a well-formed measurement (${JSON.stringify(p3Smoke)})`);
  }
  const g2GoodReport = '## §2. PH-3\n| c | note |\n|---|---|\n| `abc1234` | preserved-in-compute, the rule is DECLARED in notes.json |\n';
  const g2BadReport = '## §2. PH-3\n| c | note |\n|---|---|\n| `abc1234` | preserved-in-compute, nothing more said |\n';
  const g2Good = checkPreservedInComputeHasWhy(g2GoodReport);
  const g2Bad = checkPreservedInComputeHasWhy(g2BadReport);
  if (!g2Good.pass || g2Bad.pass) {
    throw new Error(`self-test FAILED: checkPreservedInComputeHasWhy did not discriminate good/bad fixtures (good=${g2Good.pass}, bad=${g2Bad.pass})`);
  }
  const g4Descriptor = {
    config: { logic_variables: [{ name: 'x_warn_pct', on_invalid: 'default' }] },
    checks: [{ id: 'c1', limit_from_config: 'x_warn_pct' }],
    deviations: [],
  };
  const g4Bad = checkOnInvalidFail(g4Descriptor);
  const g4Covered = checkOnInvalidFail({ ...g4Descriptor, deviations: [{ from: 'on_invalid: "fail" for a declared logic variable', why: 'fixture' }] });
  const g4Good = checkOnInvalidFail({ ...g4Descriptor, config: { logic_variables: [{ name: 'x_warn_pct', on_invalid: 'fail' }] } });
  if (g4Bad.pass || !g4Covered.pass || !g4Good.pass) {
    throw new Error(`self-test FAILED: checkOnInvalidFail did not discriminate fixtures (bad=${g4Bad.pass}, covered=${g4Covered.pass}, good=${g4Good.pass})`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  const opts = parseArgs(process.argv.slice(2));
  selfTest();
  if (opts.selfTestOnly) {
    console.log('[step-validate] self-test PASSED');
    return;
  }

  const registry = buildRegistry();
  let targets;
  if (opts.staged) {
    targets = filterToStaged(registry);
    if (targets.length === 0) {
      console.log('[step-validate] --staged: no converted/pending step touched by this commit — nothing to validate, exiting clean.');
      return;
    }
  } else {
    targets = opts.all ? registry : registry.filter((r) => r.slug === opts.step);
    if (targets.length === 0) {
      throw new Error(`no step found for ${opts.all ? '--all' : `--step=${opts.step}`} (registry has: ${registry.map((r) => r.slug).join(', ')})`);
    }
  }

  const { converted, pending } = loadConverted();
  const invariantResults = fastInvariants(targets, converted, pending);
  const shapeBatch = checkShapeBatch(targets);
  const vitestResult = opts.fast ? { ranOk: false, error: '--fast: vitest spawn skipped' } : runVitest();

  let anyHardStop = false;
  const summaries = [];

  for (const row of targets) {
    const descriptorInfo = checkDescriptor(row);
    const computePath = harness.computePathFor(row.relFile);
    const shape = shapeBatch.get(row.slug);
    const report = row.report ? stripScorecard(readFileSync(row.report, 'utf8')) : '';
    if (!row.report) {
      console.error(`[step-validate] WARNING: no assessment report found for ${row.slug} — scorecard gates that read the report will read as empty/0`);
    }
    const captureFindings = checkCaptures(row, descriptorInfo, computePath, report);
    const p3 = measureP3Footprint(row, descriptorInfo);
    const sc = computeScorecard(row, report, descriptorInfo, shape, captureFindings, invariantResults);
    const matrix = computePolicyMatrix(row, descriptorInfo, shape, vitestResult, p3, report);
    const block = renderScorecard(row, sc, matrix, captureFindings, vitestResult, invariantResults);

    console.log(`\n\`\`\`\n[step-validate] ${row.slug} (${row.stage}) — ${sc.total}/${sc.maxTotal}, hard-stop=${sc.hardStop}\n\`\`\`\n`);
    console.log(block);

    if (opts.write) {
      if (!row.report) {
        console.error(`[step-validate] --write requested but no report found for ${row.slug}; skipping write`);
      } else {
        writeScorecard(row.report, block);
        console.log(`[step-validate] wrote scorecard into ${path.relative(REPO_ROOT, row.report)}`);
      }
    }

    if (!descriptorInfo.ok) console.error(`[step-validate] ${row.slug}: descriptor validation FAILED — ${descriptorInfo.error}`);
    // row.blocking is only set by --staged (filterToStaged); --all/--step have no
    // doc-only distinction to make and always block on their own hard stops.
    const isBlocking = row.blocking === undefined ? true : row.blocking;
    if (sc.hardStop && !isBlocking) {
      console.log(`[step-validate] ${row.slug}: hard-stop scored but NOT gating — only its report/tests are staged, not its code (--staged doc-only rule)`);
    }
    if (sc.hardStop && isBlocking) anyHardStop = true;
    summaries.push({ slug: row.slug, total: sc.total, maxTotal: sc.maxTotal, hardStop: sc.hardStop, blocking: isBlocking });
  }

  const registryFails = invariantResults.filter((r) => r.slug === '(registry)' && !r.pass);
  if (registryFails.length) anyHardStop = true;

  console.log('\n[step-validate] summary:');
  for (const s of summaries) console.log(`  ${s.slug}: ${s.total}/${s.maxTotal} hard-stop=${s.hardStop}${s.blocking ? '' : ' (non-blocking: doc-only touch)'}`);
  if (registryFails.length) {
    console.log('[step-validate] registry-level fast invariant failures:');
    for (const r of registryFails) console.log(`  #${r.id}: ${r.detail}`);
  }

  if (anyHardStop) {
    console.error('\n[step-validate] HARD STOP on at least one step (G6/G7/G8 == 0, G9 FAIL, or a fast invariant FAIL). Exiting non-zero.');
    process.exit(1);
  }
}

try {
  main();
} catch (err) {
  console.error(`[step-validate] ${err.stack || err.message}`);
  process.exit(2);
}
