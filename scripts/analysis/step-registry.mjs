// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (generated Target Files, WF2 2026-09-29); 122_pipeline_step_optimization.md §4.1, §6
//
// `npm run step:registry -- <slug|path>   (or --step=<slug>)` — the ONE read-only window onto the
// registry row of a
// single step, from one slug or one repo-relative / absolute path (either slash). It is the CLI
// form of contract §B's derivation (`scripts/analysis/gates/step-registry.mjs`), so the DECLARED
// half it prints is BYTE-IDENTICAL to the step's generated block in its owner spec(s) — the exact
// equality `src/tests/generate-target-files.infra.test.ts` locks. `scripts/CLAUDE.md` tells authors
// to read every row before changing a step, so a refusal to guess (a path that resolves to no step
// prints NOTHING and exits 0) is a feature: a hook or a human reading this CLI is asking a question
// the registry cannot answer, not getting a plausible-looking wrong one.
//
// No DB, no writes: the whole answer is the census, the capture-step-golden derivation, the
// committed cross-step ledger and consumer-registry.json, plus a read-only ADVISORY half. The
// ADVISORY half is INFORMATION, never a gate — it is the census row and the tests that name the
// step (naming collisions, not violations). src/ SQL readers are no longer grepped: they are
// generated consumer rows (consumer source #5 from `scripts/steps/_schema/src-sql-ledger.json`)
// shown in the DECLARED `consumers:` line, and the DECLARED vs OBSERVED section compares the
// effective ledger row with the committed witness traces + fixture records.

import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import {
  REPO_ROOT,
  loadRegistryInputs,
  registryRows,
  stepData,
  stepFiles,
  resolveStep,
  renderStepEntry,
  loadObserved,
  renderDeclaredVsObserved,
} from './gates/step-registry.mjs';

/** The ADVISORY reader/test sections print at most this many findings, then a `(+N more)` line. */
const SECTION_CAP = 25;

/**
 * `git grep -l [-w] -F -e <term>` restricted to `paths`, in `cwd`. Returns the found paths, `null`
 * when git itself failed (not a repository, no git binary, a usage error) — the caller renders the
 * failure as an information line, never a throw, because the ADVISORY half must not break the ONE
 * answer the DECLARED half gives.
 *
 * @param {string} term
 * @param {string[]} paths the pathspec handed to `git grep`
 * @param {string} cwd the repository root
 * @param {boolean} wordBoundary `-w` for a reader term; the test section greps fragments, so no `-w`
 * @returns {string[]|null}
 */
function grepFiles(term, paths, cwd, wordBoundary) {
  const argv = wordBoundary ? ['-l', '-w'] : ['-l'];
  const result = spawnSync('git', ['grep', ...argv, '-F', '-e', term, '--', ...paths], {
    cwd,
    encoding: 'utf8',
  });
  if (result.error || result.status === null || result.status > 1) return null;
  return String(result.stdout || '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * The tests outside the step's own `src/tests/steps/<slug>/` that name the step's shell (its
 * basename without `.js`) or one of its tables — the naming collisions a rename or a table move
 * would strand. `git grep -l -F` (no word boundary: a basename is a fragment of a longer identifier
 * as often as a whole token) for each literal under `src/tests`, minus the declared tests.
 *
 * `null` when git could not run for any term.
 *
 * @param {string} slug
 * @param {{files: string[], tests: string[]}} declared
 * @param {object} inputs
 * @returns {string[]|null}
 */
function namingTests(slug, declared, inputs) {
  const own = new Set(declared.tests);
  const ownDir = `src/tests/steps/${slug}/`;
  const row = registryRows(inputs).find((candidate) => candidate.slug === slug);
  const shell = row && typeof row.file === 'string' ? path.posix.basename(row.file.replace(/\.js$/, '')) : null;

  const terms = new Set(stepData(slug, inputs).map((dataRow) => dataRow.table));
  if (shell) terms.add(shell);
  if (terms.size === 0) return [];

  const found = new Set();
  for (const term of [...terms].sort()) {
    const lines = grepFiles(term, ['src/tests'], inputs.root, false);
    if (lines === null) return null;
    for (const file of lines) {
      if (own.has(file) || file.startsWith(ownDir)) continue;
      found.add(file);
    }
  }
  return [...found].sort();
}

/** The census row for `slug` — an entry, an exemption, or `null` when the census declares neither. */
function censusRow(slug, inputs) {
  const census = (inputs && inputs.census) || {};
  for (const key of ['entries', 'exemptions']) {
    const rows = Array.isArray(census[key]) ? census[key] : [];
    const hit = rows.find((row) => row && row.slug === slug);
    if (hit) return hit;
  }
  return null;
}

/**
 * Write one ADVISORY section body: the first `SECTION_CAP` rendered lines, then `  … (+N more)` when
 * the list overflowed; `  none` when there is nothing to report. Every line ends in `\n`.
 *
 * @param {import('node:stream').Writable} stdout
 * @param {string[]} rendered the already-prefixed body lines
 */
function writeSection(stdout, rendered) {
  if (rendered.length === 0) {
    stdout.write('  none\n');
    return;
  }
  for (const line of rendered.slice(0, SECTION_CAP)) stdout.write(`${line}\n`);
  if (rendered.length > SECTION_CAP) stdout.write(`  … (+${rendered.length - SECTION_CAP} more)\n`);
}

/**
 * The `npm run step:registry -- <slug|path>   (or --step=<slug>)` CLI: one input — a positional
 * argument or the `--step=<v>` alias, resolved through the shared registry derivation — then the
 * DECLARED block (byte-identical to the owner spec's generated block) and the ADVISORY half (the
 * census row and the tests that name the step — naming collisions, not violations), then the
 * DECLARED vs OBSERVED section comparing the effective ledger row with the committed witness
 * traces + fixture records. (src/ SQL readers are generated consumer rows, shown in the DECLARED
 * `consumers:` line — never grepped.)
 *
 * A path that resolves to no step prints NOTHING and exits 0 — the registry's refusal to guess is
 * the answer. No input at all also prints nothing and exits 0. Any other argument starting with `-`
 * (an unknown flag), or more than one input (positional and/or `--step=`), writes the usage line to
 * stderr and exits 1. Any thrown error is the main guard's to report (message to stderr, exit 2).
 *
 * @param {string[]} argv the CLI arguments (no `node` / script path); the positional argument or `--step=<v>`
 * @param {{stdout?: import('node:stream').Writable, stderr?: import('node:stream').Writable}} [opts]
 * @returns {number} the process exit code (0 — the ADVISORY half never fails a run; 1 — bad CLI usage)
 */
export function main(argv, { stdout = process.stdout, stderr = process.stderr } = {}) {
  const USAGE = 'usage: npm run step:registry -- <slug|path>   (or --step=<slug>)\n';
  const parsed = [];
  for (const arg of Array.isArray(argv) ? argv : []) {
    if (typeof arg !== 'string') continue;
    if (arg.startsWith('--step=')) {
      parsed.push(arg.slice('--step='.length));
    } else if (arg.startsWith('-')) {
      stderr.write(USAGE);
      return 1;
    } else {
      parsed.push(arg);
    }
  }
  if (parsed.length > 1) {
    stderr.write(USAGE);
    return 1;
  }
  const input = parsed.length === 1 ? parsed[0] : undefined;
  const inputs = loadRegistryInputs(REPO_ROOT);
  const slug = resolveStep(input, inputs);
  if (slug === null) return 0;

  const row = registryRows(inputs).find((candidate) => candidate.slug === slug);
  if (!row) return 0;

  // ONE declared set: the exclusions below are exactly what the DECLARED half just printed.
  const declared = stepFiles(row, inputs.root);

  stdout.write('== DECLARED ==\n');
  stdout.write(renderStepEntry(row, inputs));
  stdout.write('== ADVISORY ==\n');
  stdout.write(`census: ${JSON.stringify(censusRow(slug, inputs))}\n`);

  stdout.write(`tests naming the script or its tables (outside src/tests/steps/${slug}/):\n`);
  const tests = namingTests(slug, declared, inputs);
  if (tests === null) {
    stdout.write('  (git grep unavailable)\n');
  } else {
    writeSection(stdout, tests.map((file) => `  ${file}`));
  }

  stdout.write('== DECLARED vs OBSERVED ==\n');
  stdout.write(renderDeclaredVsObserved(slug, inputs, loadObserved(inputs.root, slug)));

  return 0;
}

const INVOKED_AS_CLI =
  !!process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (INVOKED_AS_CLI) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${(error && error.message) || error}\n`);
    process.exitCode = 2;
  }
}
