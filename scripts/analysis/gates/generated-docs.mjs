// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rule 13, §5 R-AG, §5 R-BA (gate J)
//
// GATE J (half 2) — every committed artifact under `docs/reports/generated/` is
// either (a) produced by a generator that has a drift-check mode (so it cannot
// silently rot) or (b) EXPLICITLY RETIRED with a written why. Rule 13
// "understandable": a doc nobody regenerates and nobody retires is a doc that
// lies. This is the closed list the gate owns; the orchestrator decides per doc
// whether to WIRE it (`--check`) or RETIRE it, and records that decision here.
//
// The registry below is the ONLY thing that can change a verdict — no generator
// is ever invented. `findings` records what a repo read actually turned up for
// each file (generator path, whether that generator has a `--check` mode), so a
// "keep" proposal is always backed by a real command; `--report` prints it.
//
// Decision rule (closed):
//   1. every live `docs/reports/generated/*.md` file absent from the registry → RED (an unowned doc).
//   2. a registry row with `retired: true` AND a non-empty `why` → GREEN (the retire answer).
//   3. a registry row with a `generator` + `has_check: true` → GREEN (the generated+checked answer).
//   4. anything else (a `generator` without `has_check`, a row with no `generator` and no `retired`) → RED.
// A registry row naming a file NOT in the tree is reported by `--report` as stale,
// never silently dropped; the live-listing RED (rule 1) is what guards the tree.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '..', '..', '..');
export const GENERATED_DIR_REL = 'docs/reports/generated';

// ---------------------------------------------------------------------------
// THE CLOSED LIST. Findings measured 2026-09-26 by reading the tree (grep the
// filename across `scripts/` + the generators' own `Regenerate:` headers) —
// nothing here is inferred. `has_check` is true ONLY where a real `--check`
// arm was read in the generator source. A row with no generator and no retire
// is a RED the orchestrator must resolve (Ask list in the plan).
// ---------------------------------------------------------------------------
export const GENERATED_DOCS = [
  // --- generated + checkable today -----------------------------------------
  { file: '122-churn-complexity.md', generator: 'scripts/analysis/step-churn-complexity.mjs', has_check: true,
    proposed: 'keep', note: '--check re-derives every column at the committed window_end.' },
  { file: '122-conversion-roadmap.md', generator: 'scripts/violations/generate-conversion-roadmap.mjs', has_check: true,
    proposed: 'keep', note: '--check exits 1 on drift, writes nothing.' },
  { file: '122-programme-backlog.md', generator: 'scripts/violations/generate-programme-backlog.mjs', has_check: true,
    proposed: 'keep', note: '--check exits 1 on drift, writes nothing.' },
  { file: '122-vocabulary.md', generator: 'scripts/violations/schema-to-vocab.mjs', has_check: true,
    proposed: 'keep', note: 'wire `--check docs/reports/generated/122-vocabulary.md` (already the pre-commit command in the plan).' },
  { file: '127-surface-registry.md', generator: 'scripts/violations/generate-surface-registry.mjs', has_check: true,
    proposed: 'keep', note: '--check exits 1 on drift.' },
  { file: '127-surface-review-queue.md', generator: 'scripts/violations/generate-surface-registry.mjs', has_check: true,
    proposed: 'keep', note: 'same generator + --check arm as the registry; written together.' },
  // --- explicitly retired 2026-09-26 (orchestrator ruling, gate J closing
  // commit): each had a `generator` with NO --check arm — a doc that can rot
  // silently, which is exactly the class Rule 13 bans. The FILE stays on disk
  // (R-X: a retired declaration is a declaration, never a silent deletion);
  // only the "someone actively drift-checks this" claim is retracted. ------
  { file: '122-category-coverage.md', retired: true,
    why: 'generator scripts/violations/map-categories.mjs is the retired pre-R2 mapper with no --check arm (Regenerate header names only the file arg). Retired 2026-09-26 (gate J closing commit) rather than built a check — the pre-R2 category set it maps against is itself superseded.' },
  { file: '123-claim-plan.md', generator: 'scripts/violations/plan-claims.mjs', has_check: false, retired: true,
    why: 'plan-claims.mjs prints/writes but declares no --check arm; Spec 121 Appendix A (the source this doc classifies) is itself the retired artifact. Retired 2026-09-26 (gate J closing commit).' },
  { file: '123-per-step-checklist.md', generator: 'scripts/violations/plan-claims.mjs', has_check: false, retired: true,
    why: 'same generator, no --check arm; a one-shot template render with nothing left to drift-check against. Retired 2026-09-26 (gate J closing commit).' },
  { file: '122-claim-classification.md', generator: 'scripts/violations/extract-claims.mjs', has_check: false, retired: true,
    why: 'extract-claims.mjs is the retired Appendix-A catalogue generator; no --check arm. Retired 2026-09-26 (gate J closing commit).' },
  { file: '122-claim-classification-js-export.md', generator: 'scripts/violations/extract-claims.mjs', has_check: false, retired: true,
    why: 'same generator, no --check arm; a stale duplicate export of the classification table above. Retired 2026-09-26 (gate J closing commit).' },
  { file: '122-concern-homes.md', retired: true,
    why: 'map-concerns.mjs resolves Spec 122 concerns against the pre-R2 category set; the concern index now lives in Spec 122 §1.8 prose and no CI step regenerates this doc. Retired 2026-09-26 (gate J ask J2-2).' },
];

/** `true` when a registry row carries the retire answer (the why must be non-empty). */
export const isRetired = (row) =>
  !!row && row.retired === true && typeof row.why === 'string' && row.why.trim().length > 0;

/** The single GREEN predicate a registry row must satisfy. @returns {string|null} why-RED */
export function rowViolation(row) {
  if (isRetired(row)) return null;
  if (row && typeof row.generator === 'string' && row.generator.trim() && row.has_check === true) return null;
  if (row && typeof row.generator === 'string' && row.generator.trim()) {
    return `generator ${row.generator} has no --check arm and the row is not retired (the doc can rot silently)`;
  }
  return 'row has neither a checkable generator nor retired:true with a why';
}

/**
 * The gate's own listing of the live `docs/reports/generated/` tree.
 * @param {string} [repoRoot]
 * @returns {string[]} basenames, sorted
 */
export function liveGeneratedDocs(repoRoot = REPO_ROOT) {
  const dir = path.join(repoRoot, GENERATED_DIR_REL);
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    throw new Error(`generated-docs: unreadable dir ${GENERATED_DIR_REL}: ${e.message}`);
  }
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => e.name)
    .sort();
}

/**
 * Gate J (half 2) over the generated-docs registry. An unowned live file, or a
 * row with no checkable generator and no retire answer, is a violation.
 * @param {string} [repoRoot]
 * @param {Array<object>} [rows] registry rows (defaults to the live registry)
 * @returns {{pass:boolean, violations:Array<{item:string, detail:string}>, checked:number}}
 */
export function checkGeneratedDocs(repoRoot = REPO_ROOT, rows = GENERATED_DOCS) {
  const violations = [];
  const byName = new Map();
  for (const row of rows) {
    if (row && typeof row.file === 'string') byName.set(row.file, row);
    const why = rowViolation(row);
    if (why) violations.push({ item: `registry:${(row && row.file) || '(no-file)'}`, detail: why });
  }
  let live = [];
  try {
    live = liveGeneratedDocs(repoRoot);
  } catch (e) {
    violations.push({ item: 'listing', detail: e.message });
  }
  for (const name of live) {
    if (!byName.has(name)) {
      violations.push({ item: `unowned:${name}`, detail: `${name} exists in ${GENERATED_DIR_REL}/ but is not in the gate's closed list — add a generator+check or retire it` });
    }
  }
  const detail = violations.length
    ? `GENERATED-DOCS (gate J): ${violations.length} problem(s) [${violations.map((v) => v.item).join('; ')}]`
    : `GENERATED-DOCS (gate J): ${live.length} live doc(s), ${rows.length} registry row(s), all owned (${rows.filter(isRetired).length} retired)`;
  return { pass: violations.length === 0, violations, checked: live.length };
}

/** In-memory fixtures + assertions (known-bad + known-good). Throws on the first failure. */
export function selfTest() {
  const rows = [
    { file: 'a.md', generator: 'scripts/g.mjs', has_check: true },
    { file: 'b.md', retired: true, why: 'superseded by Spec 122 §1.8 prose' },
  ];
  const dirOf = (...names) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-docs-'));
    fs.mkdirSync(path.join(root, GENERATED_DIR_REL), { recursive: true });
    for (const n of names) fs.writeFileSync(path.join(root, GENERATED_DIR_REL, n), '# fixture\n');
    return root;
  };
  const eq = (a, b, msg) => { if (a !== b) throw new Error(`self-test FAILED (${msg}): ${a} !== ${b}`); };

  eq(rowViolation(rows[0]), null, '1 checkable generator GREEN');
  eq(rowViolation(rows[1]), null, '2 retired+why GREEN');
  if (!/no --check arm/.test(rowViolation({ file: 'c.md', generator: 'scripts/g.mjs', has_check: false }))) throw new Error('self-test FAILED (3): generator w/o check');
  if (!/neither a checkable/.test(rowViolation({ file: 'd.md' }))) throw new Error('self-test FAILED (4): bare row');
  if (!/neither a checkable/.test(rowViolation({ file: 'e.md', retired: true, why: '   ' }))) throw new Error('self-test FAILED (5): retired with blank why');

  const good = checkGeneratedDocs(dirOf('a.md', 'b.md'), rows);
  if (!good.pass || good.violations.length) throw new Error(`self-test FAILED (6): clean tree RED (${JSON.stringify(good)})`);

  const bad = checkGeneratedDocs(dirOf('a.md', 'b.md', 'extra.md'), rows);
  if (bad.pass || !bad.violations.some((v) => v.item === 'unowned:extra.md')) throw new Error(`self-test FAILED (7): unowned file not RED (${JSON.stringify(bad)})`);
  return true;
}

/** `--report` — the table the orchestrator rules on: file · generator · has --check · proposed. */
export function report(repoRoot = REPO_ROOT) {
  const live = new Set(liveGeneratedDocs(repoRoot));
  return GENERATED_DOCS.map((row) => ({
    file: row.file,
    live: live.has(row.file) ? 'yes' : 'STALE (not in tree)',
    generator: row.generator || (isRetired(row) ? '(retired)' : '(none)'),
    hasCheck: row.has_check === true ? 'yes' : 'no',
    proposed: isRetired(row) ? 'retire' : (row.proposed || (row.has_check ? 'keep' : 'retire')),
  }));
}

function main(argv) {
  if (argv.includes('--self-test')) {
    selfTest();
    process.stdout.write('generated-docs self-test OK\n');
    return;
  }
  if (argv.includes('--report')) {
    const rows = report();
    const w = (s, n) => String(s).padEnd(n);
    process.stdout.write(`${w('file', 40)} ${w('live', 20)} ${w('generator', 52)} ${w('--check', 7)} proposed\n`);
    for (const r of rows) process.stdout.write(`${w(r.file, 40)} ${w(r.live, 20)} ${w(r.generator, 52)} ${w(r.hasCheck, 7)} ${r.proposed}\n`);
    return;
  }
  const result = checkGeneratedDocs(REPO_ROOT);
  for (const v of result.violations) process.stderr.write(`  ${v.item}: ${v.detail}\n`);
  process.stdout.write(`${result.pass ? 'PASS' : 'RED'} — ${result.checked} live doc(s)\n`);
  if (!result.pass) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
