#!/usr/bin/env node
/**
 * A2 — the frozen-file-shape gate (Spec 122 §5.1).
 *
 * ⚠️ WHY THIS DRIVER EXISTS AT ALL. The ast-grep rule cannot express its own
 * scope. §5.1 says "an ast-grep rule over every file in manifest.chains[*].file",
 * but ZERO steps are converted today, so enforcing over that set would fail all
 * 27 on the first commit. This script splits the corpus in two:
 *
 *   BLOCKING     — the files listed in scripts/steps/_schema/converted.json.
 *                  Each C-track pilot appends exactly one entry as its last
 *                  commit, so the gate arms itself one step at a time.
 *   REPORT-ONLY  — every other manifest step file. Informational, never fails,
 *                  and it is the PROVE-RED: src/tests/step-conformance.infra.test.ts
 *                  asserts the rule fires on every unconverted file, so the empty
 *                  converted list can never read as a clean bill of health.
 *
 * A THIRD, ALWAYS-BLOCKING corpus was added at pilot 1 peel 8c: every module in
 * scripts/lib/compute/ is scanned against scripts/ast-grep-rules/compute-shape.yml
 * (Spec 122 §5.5 — PROPOSED, ratify at C3). It needs no converted.json entry
 * because the directory IS the scope: a compute module exists only because a
 * conversion produced it. Its prove-red is a known-bad fixture, not a report-only
 * half — scripts/steps/_schema/fixtures/compute/bad-compute-shape.js, asserted to
 * fire all five rule ids by the conformance suite.
 *
 * Node, not bash (the house style for scripts/hooks/), because the conformance
 * suite shells out to it with `--json` on Windows too. `.husky/pre-commit` reaches
 * it through scripts/hooks/ast-grep-leads.sh; CI calls it directly.
 *
 * Usage:
 *   node scripts/hooks/check-step-shape.mjs                 # both modes, blocking half gates
 *   node scripts/hooks/check-step-shape.mjs --report-only   # never exits non-zero
 *   node scripts/hooks/check-step-shape.mjs --json          # machine-readable, no gating
 *
 * Exit codes: 0 = clean · 1 = a converted step file violates the frozen shape, or a
 * compute module violates the compute shape · 2 = bad setup.
 *
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1
 * SPEC LINK: docs/specs/01-pipeline/121_*.md §12b.6 (known-bad fixtures must FIRE)
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { filterGateELedgerFindings, purityFindings, purityRowFreeze } from '../analysis/gates/compute-literals.mjs';
import { scanPurity } from '../analysis/gates/compute-purity.mjs';
import { loadLedger, matchLedger } from '../analysis/gates/ledger.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// Repo-relative, POSIX-separated on every platform: these strings are printed in
// operator messages and compared against manifest `file` values, which are POSIX.
const RULE = 'scripts/ast-grep-rules/step-shape.yml';
// A2's sibling gate (Spec 122 §5.5, PROPOSED at pilot 1 peel 8c). Scope is the
// compute DIRECTORY, not converted.json: a compute module exists only because a
// conversion produced it, so the corpus is self-arming and never report-only.
const COMPUTE_RULE = 'scripts/ast-grep-rules/compute-shape.yml';
// BUILDO_COMPUTE_DIR is a TEST-ONLY override so the conformance suite can point the
// blocking half at the known-bad fixture and prove the driver exits 1 without --json
// (Regression Guardian, P4 remediation 2026-08-25: a --json run returns before the
// blocking loop, so the previous "enforces" test never exercised the gate).
const COMPUTE_DIR = process.env.BUILDO_COMPUTE_DIR || 'scripts/lib/compute';
const CONVERTED = 'scripts/steps/_schema/converted.json';
const MANIFEST = 'scripts/manifest.json';

const args = new Set(process.argv.slice(2));
const REPORT_ONLY = args.has('--report-only');
const AS_JSON = args.has('--json');

/** The committed enforcement scope. Throws loudly rather than degrading to "nothing to check". */
function readConvertedList() {
  const abs = path.join(REPO_ROOT, CONVERTED);
  if (!existsSync(abs)) throw new Error(`${CONVERTED} is missing — the A2 enforcement scope has no definition`);
  const parsed = JSON.parse(readFileSync(abs, 'utf8'));
  if (!Array.isArray(parsed.converted)) throw new Error(`${CONVERTED}: "converted" must be an array`);
  return parsed.converted.map((f) => String(f).replace(/\\/g, '/'));
}

/** Every distinct JS step file reachable from manifest.chains — the §5.1 corpus. */
function readManifestStepFiles() {
  const manifest = JSON.parse(readFileSync(path.join(REPO_ROOT, MANIFEST), 'utf8'));
  const files = new Set();
  for (const slugs of Object.values(manifest.chains)) {
    for (const slug of slugs) {
      const entry = manifest.scripts[slug];
      if (entry && typeof entry.file === 'string' && entry.file.endsWith('.js')) files.add(entry.file);
    }
  }
  return [...files];
}

/**
 * The ast-grep executable, resolved WITHOUT a shell.
 *
 * ⚠️ `spawnSync('npx.cmd', …)` fails EINVAL on Node 20+/Windows (the shell-less
 * .cmd restriction from CVE-2024-27980), and `shell: true` would put every path
 * through cmd.exe quoting. `@ast-grep/cli` ships a real .exe on win32 and a real
 * binary elsewhere, so spawn that directly on both.
 */
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

/** Every compute module — the §5.5 corpus. Absent directory = empty corpus, not a failure. */
function readComputeFiles() {
  const abs = path.join(REPO_ROOT, COMPUTE_DIR);
  if (!existsSync(abs)) return [];
  return readdirSync(abs)
    .filter((f) => f.endsWith('.js'))
    .map((f) => `${COMPUTE_DIR}/${f}`);
}

/**
 * Run one rule FILE (all its rules) over `files` and return one record per file.
 * ast-grep is invoked ONCE for the whole batch — 27 process spawns per commit
 * would be the kind of hook nobody keeps.
 */
function scan(files, rule = RULE) {
  const byFile = new Map(files.map((f) => [f, []]));
  if (files.length === 0) return byFile;
  // ⚠️ `--report-style=short`, NOT `--json`. Measured 2026-08-24: the JSON
  // encoder emits `labels` + `metaVariables` per match (~55 KB each), so the
  // 61-file manifest sweep produced 37 MB and spawnSync died ENOBUFS. The short
  // style is one greppable line per match — ~1 MB for the same sweep.
  const res = spawnSync(
    astGrepBinary(),
    ['scan', '--rule', rule, '--report-style=short', '--color=never', ...files],
    { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  if (res.error) throw res.error;
  const stdout = res.stdout || '';
  // ast-grep exits non-zero when an `error`-severity rule matches; that is the
  // expected path here, so only a missing/failed BINARY is a setup failure.
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

/**
 * Gate E (Spec 124 §5 R-BA, WF2 "standardized gates", 2026-09-26) — drop a
 * finding for one of the 5 gate-E rule ids when a ledger row allows it.
 * `scripts/analysis/gates/compute-literals.mjs` owns the one shared
 * implementation (also used by `step:validate`'s per-step `computeClean`
 * check), so the two can never drift apart on what counts as allowed.
 * Mutates `computeResults` in place.
 */
function filterGateEFindings(computeResults, repoRoot) {
  let rows;
  try {
    rows = loadLedger(repoRoot).rows;
  } catch {
    rows = [];
  }
  filterGateELedgerFindings(computeResults, repoRoot, rows);
}

/**
 * Render one line per `matchLedger` purity `unallowed` entry.
 *
 * ⚠️ 2026-10-11 (CP-B8d defect 1): `matchLedger` returns `unallowed` entries as
 * `{step, item[, collision]}` — NOT the finding itself. The blocking loop printed
 * `v.ruleId`/`v.file`/`v.line`, so every purity failure read
 * "footgun[undefined]: undefined:undefined". The finding is only recoverable by
 * looking the entry's `(step, item)` key back up in the findings array the same
 * match was fed (the same key `matchLedger` keys on, `<step>\0<item>`). Pure:
 * no fs, no clock, no ledger.
 *
 * @param {Array<{step: string, item: string}>} unallowed `matchLedger(...).unallowed`
 * @param {Array<{step: string, item: string, file: string, line: number, ruleId: string}>} findings
 *   the exact array passed to `matchLedger` (i.e. `purityFindings(puritySites)`)
 * @returns {string[]} one message per entry, in the same order
 */
export function formatPurityUnallowed(unallowed, findings) {
  const byKey = new Map(
    (Array.isArray(findings) ? findings : []).map((f) => [`${f.step}\u0000${f.item}`, f]),
  );
  return (Array.isArray(unallowed) ? unallowed : []).map((u) => {
    const f = byKey.get(`${u.step}\u0000${u.item}`);
    if (!f) return `${u.step} ${u.item}`;
    return (
      `footgun[${f.ruleId}]: ${f.file}:${f.line} — ${f.message || 'is a compute-purity finding'} ` +
      `(no ledger row; purity rows are frozen)`
    );
  });
}

async function main() {
  const converted = readConvertedList();
  const manifestFiles = readManifestStepFiles();
  const manifestSet = new Set(manifestFiles);

  // Scope validity is checked HERE as well as in the conformance suite: a typo'd
  // path would otherwise silently narrow the blocking scope to nothing.
  const strays = converted.filter((f) => !manifestSet.has(f));
  if (strays.length > 0) {
    console.error(`footgun[step-shape]: ${CONVERTED} lists non-manifest files: ${strays.join(', ')}`);
    process.exit(2);
  }

  const unconverted = manifestFiles.filter((f) => !converted.includes(f));
  const blockingResults = scan(converted);
  const reportResults = scan(unconverted);
  const computeFiles = readComputeFiles();
  const computeResults = scan(computeFiles, COMPUTE_RULE);
  filterGateEFindings(computeResults, REPO_ROOT);
  // ---- the G1–G8 compute-purity codes, SAME ledger ------------------------
  // `step-validate --staged` exits early when no step is staged, so a compute or
  // closure-lib edit can add a purity finding at commit time with nothing on this
  // side seeing it. The purity codes never reached THIS hook at all: they come from
  // `scanPurity` (async), not from an ast-grep rule. Gate E's ledger mechanism is
  // shared, so the same rows adjudicate both halves.
  // ⚠️ `loadLedger` is NOT wrapped in a try/catch here (unlike `filterGateEFindings`,
  // whose try degrades to "no rows = no findings filtered"): a gate that cannot read
  // its ledger must not pass, and letting it throw lands in the `main().catch` below
  // as exit 2. Only `purity.unallowed` gates — orphans are step-validate #32's job,
  // fleet-wide, and would fire wrongly in a directory-scoped hook.
  const puritySites = await scanPurity({ repoRoot: REPO_ROOT });
  const purityFindingsList = purityFindings(puritySites);
  const ledgerRows = loadLedger(REPO_ROOT).rows;
  const purity = matchLedger('E', purityFindingsList, ledgerRows);
  // Airtight V3 freeze (CP-B8d defect 2): a purity row is ILLEGITIMATE by
  // construction — Phase 1's rows are frozen, so any purity row at a later
  // `filed` date, or on a module outside V2_PURITY_MODULES, is a NEW row
  // invented to slip an unledgered finding past gate E. `step-validate` #32
  // catches it too; a commit-time hook that never applied it left the door
  // open until CI.
  const purityFrozen = purityRowFreeze(ledgerRows);

  if (AS_JSON) {
    const shape = (map) => [...map.entries()].map(([file, violations]) => ({ file, violations }));
    process.stdout.write(
      JSON.stringify({
        rule: RULE,
        converted,
        blocking: shape(blockingResults),
        report_only: shape(reportResults),
        compute_rule: COMPUTE_RULE,
        compute: shape(computeResults),
        purity_unallowed: purity.unallowed,
        purity_frozen: purityFrozen,
      }),
    );
    return;
  }

  // ---- report-only half: the prove-red, printed every run -----------------
  const stillIsland = [...reportResults.values()].filter((v) => v.length > 0).length;
  console.log(
    `footgun[step-shape] (info): ${stillIsland}/${unconverted.length} unconverted manifest step files violate the frozen shape (Spec 122 §5.1). ` +
      `This is the expected pre-conversion state and does NOT gate — see ${CONVERTED}.`,
  );
  for (const [file, violations] of reportResults) {
    if (violations.length === 0) {
      console.log(
        `footgun[step-shape] (info): ${file} is shape-clean but NOT in ${CONVERTED} — if its conversion landed, add it there so the gate arms.`,
      );
    }
  }

  if (REPORT_ONLY) return;

  // ---- blocking half ------------------------------------------------------
  let failed = false;
  for (const [file, violations] of blockingResults) {
    for (const v of violations) {
      console.error(
        `footgun[${v.rule}]: ${file}:${v.line} violates the frozen step shape (Spec 122 §5.1). ` +
          `A converted step is exactly: 3 requires, const ADVISORY_LOCK_ID = <literal>, ` +
          `module.exports = pipeline.step(<id>, <id>), and the two named re-exports. Nothing else executable.`,
      );
      failed = true;
    }
  }
  // ---- the compute corpus, ALSO blocking -----------------------------------
  // ⚠️ 2026-08-25 (Pilot 1 P4): this loop was MISSING. `computeResults` was scanned,
  // shaped into `--json`, and counted in the success line — but never gated, so the
  // §5.5 half of the "always-blocking" corpus documented in this file's header was
  // report-only in fact. The conformance suite's "the driver enforces the compute
  // corpus in its blocking half" read the JSON and so could not see it. The §1.2a P4
  // literal rules land in the same file, and a gate that does not exit non-zero
  // gates nothing.
  for (const [file, violations] of computeResults) {
    for (const v of violations) {
      console.error(
        `footgun[${v.rule}]: ${file}:${v.line} violates the compute shape (Spec 122 §5.5 / §1.2a P4). ` +
          `A compute is domain logic only: observations via ctx.report, narration via ctx.log, I/O via ` +
          `ctx.fetch/ctx.clock, tunables via ctx.config. Run ` +
          `\`npx ast-grep scan --rule ${COMPUTE_RULE} ${file}\` for the full message.`,
      );
      failed = true;
    }
  }
  // ---- the compute-purity corpus (G1–G8), ALSO blocking --------------------
  // Same corpus as the ast-grep half above, different rule family: a purity
  // finding is a `ctx.*` requirement the compute did not honour, and it is invisible
  // to the rule file. Both halves fail the commit.
  // The finding's real rule id, file and line — `matchLedger` hands back only
  // `{step, item}`, so `formatPurityUnallowed` looks it back up (CP-B8d defect 1).
  for (const line of formatPurityUnallowed(purity.unallowed, purityFindingsList)) {
    console.error(
      `${line} (Spec 124 R-BZ, McDonald's Airtight V3). ` +
        `Compute measures only — fix the compute; a new ledger row is refused.`,
    );
    failed = true;
  }
  // ---- Airtight V3 purity-row freeze, ALSO blocking ------------------------
  // A purity row with a post-2026-10-11 `filed`, or one moved onto a module
  // outside V2_PURITY_MODULES, is a NEW row invented to slip an unledgered
  // purity finding past gate E. CP-B8d defect 2: the hook never applied
  // `purityRowFreeze` at all, so that row lived until step-validate #32.
  for (const problem of purityFrozen) {
    console.error(
      `footgun[compute-purity-freeze]: ${problem} (Spec 124 R-BZ, McDonald's Airtight V3).`,
    );
    failed = true;
  }

  if (failed) {
    console.error('\n❌ Step-shape gate failed. Run `npx ast-grep scan --rule scripts/ast-grep-rules/step-shape.yml <file>` for the full message.');
    process.exit(1);
  }
  console.log(
    `✅ Step-shape gate clean (${converted.length} converted step file(s) enforced; ` +
      `${computeFiles.length} compute module(s) enforced against ${COMPUTE_RULE}; ` +
      `${puritySites.length} compute-purity site(s), all ledger-allowed).`,
  );
}

// Run only as a program. The conformance suite (and CP-B8d's purity test) imports
// this module for `formatPurityUnallowed`; unguarded, that import would spawn
// ast-grep and call `process.exit` inside the test runner.
const isEntryPoint =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntryPoint) {
  main().catch((err) => {
    console.error(`footgun[step-shape]: ${err.message}`);
    process.exit(2);
  });
}
