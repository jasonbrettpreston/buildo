// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rule 2, Rule 3, §5 R-BA (gate E);
//            122_pipeline_step_optimization.md §5.5
//
// GATE E — SCALABLE. Five ast-grep rules appended to
// `scripts/ast-grep-rules/compute-shape.yml` (fast invariant #32) ban a
// hard-coded SQL INTERVAL/date literal, a module-level numeric constant of ANY
// identifier case (STANDARDIZED 2026-09-26 — a camelCase rename used to evade
// the original UPPER_SNAKE_CASE-only match), a `violations:` key compared
// against a non-zero literal, and a literal numeric
// SQL bound inside `scripts/lib/compute/**` — the class of invisible, no-audit-
// row, no-deploy-free-to-move tunable Rule 3 bans. `check-step-shape.mjs`
// (the blocking driver) filters a finding for ONE of these 5 rule ids when a
// ledger row exists keyed on `<rule-id>@<trimmed source line text>` — TEXT, not
// line number, so the row survives line drift. The other (pre-existing)
// compute-shape rules are NOT filterable by this mechanism (no widening of an
// old gate). This module owns the answer set + the orphan direction; the
// driver owns the filtering; `step-validate.mjs` wires fast invariant #32.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { matchLedger, loadLedger } from './ledger.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');

export const RULE_FILE = 'scripts/ast-grep-rules/compute-shape.yml';
export const COMPUTE_DIR = 'scripts/lib/compute';
export const FIXTURE_FILE = 'scripts/steps/_schema/fixtures/compute/bad-compute-literals.js';

/** The 5 NEW rule ids gate E owns — filterable by a ledger row; nothing else is. */
export const GATE_E_RULE_IDS = [
  'compute-no-sql-interval-literal',
  'compute-no-sql-date-literal',
  'compute-no-module-numeric-const',
  'compute-no-literal-violation-compare',
  'compute-no-sql-numeric-bound',
];

/** Proposed dispositions for the orchestrator's `--list` output. */
const PROPOSED_UNIT_CONVERSION = /^(MS_PER_DAY|DAYS_PER_JULIAN_YEAR|SQM_TO_SQFT|M_TO_FT)$/;
const PROPOSED_COORDINATE_REFERENCE = /^SOURCE_CRS$/;
const PROPOSED_PHYSICAL_CONSTANT = /^DEGREES_PER_METRE_DIVISOR$/;

function astGrepBinary() {
  const candidates = process.platform === 'win32'
    ? [
      path.join(REPO_ROOT, 'node_modules', '@ast-grep', 'cli-win32-x64-msvc', 'ast-grep.exe'),
      path.join(REPO_ROOT, 'node_modules', '@ast-grep', 'cli', 'ast-grep.exe'),
    ]
    : [path.join(REPO_ROOT, 'node_modules', '.bin', 'ast-grep')];
  const found = candidates.find((c) => fs.existsSync(c));
  if (!found) throw new Error(`ast-grep binary not found (looked in ${candidates.join(', ')}) — run npm ci`);
  return found;
}

const LINE_RE = /^(.+?):(\d+):(\d+): error\[([\w-]+)\]:/;

/**
 * Run the 5 gate-E rule ids over `files`. Returns `[{file, line, ruleId, lineText, step, item}]`.
 * Only the 5 gate-E ids are kept — the pre-existing rules in the same file are
 * scanned too (ast-grep has no per-rule-id file filter) and dropped here.
 */
export function scanGateE(files, repoRoot = REPO_ROOT) {
  if (!files.length) return [];
  const res = spawnSync(
    astGrepBinary(),
    ['scan', '--rule', RULE_FILE, '--report-style=short', '--color=never', ...files],
    { cwd: repoRoot, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  );
  if (res.error) throw res.error;
  const stdout = res.stdout || '';
  if (!stdout.trim() && res.status !== 0 && res.status !== 1) {
    throw new Error(`ast-grep failed (exit ${res.status}): ${res.stderr}`);
  }
  const out = [];
  const fileTextCache = new Map();
  for (const line of stdout.split(/\r?\n/)) {
    const m = LINE_RE.exec(line);
    if (!m) continue;
    const [, filePathRaw, lineNo, , ruleId] = m;
    if (!GATE_E_RULE_IDS.includes(ruleId)) continue;
    const rel = path.relative(repoRoot, path.resolve(repoRoot, filePathRaw)).replace(/\\/g, '/');
    if (!fileTextCache.has(rel)) {
      fileTextCache.set(rel, fs.readFileSync(path.join(repoRoot, rel), 'utf8').split('\n'));
    }
    const lines = fileTextCache.get(rel);
    const lineText = (lines[Number(lineNo) - 1] || '').trim();
    const step = path.basename(rel).replace(/\.js$/, '');
    out.push({ file: rel, line: Number(lineNo), ruleId, lineText, step, item: `${ruleId}@${lineText}` });
  }
  return out;
}

/** Gate E over an explicit file list. PURE modulo the ast-grep spawn. */
export function checkComputeLiterals(files, ledgerRows, repoRoot = REPO_ROOT) {
  const findings = scanGateE(files, repoRoot);
  const { unallowed, orphans, allowed } = matchLedger('E', findings, ledgerRows);
  const blockedSlugs = [...new Set(unallowed.map((v) => v.step))];
  const detail = (unallowed.length || orphans.length)
    ? `COMPUTE-LITERALS (gate E): ${unallowed.length} unallowed finding(s)`
      + (unallowed.length ? ` [${unallowed.map((v) => `${v.step}:${v.item.split('@')[0]}`).join('; ')}]` : '')
      + `; ${orphans.length} orphan ledger row(s)`
    : `COMPUTE-LITERALS (gate E): ${findings.length} finding(s), all ledger-allowed (${allowed.length})`;
  return { pass: unallowed.length === 0 && orphans.length === 0, blockedSlugs, detail, unallowed, orphans, allowed, findings };
}

/** Every real compute module under scripts/lib/compute/. */
export function loadComputeFiles(repoRoot = REPO_ROOT) {
  const abs = path.join(repoRoot, COMPUTE_DIR);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs).filter((f) => f.endsWith('.js')).map((f) => `${COMPUTE_DIR}/${f}`);
}

/**
 * The ONE shared gate-E ledger-filter, applied to any `Map<file, [{rule, line}]>`
 * an ast-grep-driven caller produces (`scripts/hooks/check-step-shape.mjs`'s
 * `computeResults`, `step-validate.mjs`'s `checkShapeBatch`). Drops a finding
 * for one of the 5 `GATE_E_RULE_IDS` when a `{gate:'E'}` ledger row allows it
 * (keyed on `<rule-id>@<trimmed source line text>`); every other rule id is
 * untouched. A SINGLE implementation so the blocking driver and the
 * `step:validate` per-step `computeClean` check can never drift apart on what
 * counts as allowed. Mutates `byFile` in place and also returns it.
 */
export function filterGateELedgerFindings(byFile, repoRoot, ledgerRows) {
  for (const [file, violations] of byFile) {
    const gateEHits = violations.filter((v) => GATE_E_RULE_IDS.includes(v.rule));
    if (!gateEHits.length) continue;
    let text;
    try {
      text = fs.readFileSync(path.join(repoRoot, file), 'utf8').split('\n');
    } catch {
      continue;
    }
    const step = path.basename(file).replace(/\.js$/, '');
    const findings = gateEHits.map((v) => ({ step, item: `${v.rule}@${(text[v.line - 1] || '').trim()}`, _v: v }));
    const { unallowed } = matchLedger('E', findings, ledgerRows);
    const stillReported = new Set(unallowed.map((u) => u.item));
    const others = violations.filter((v) => !GATE_E_RULE_IDS.includes(v.rule));
    const kept = findings.filter((f) => stillReported.has(f.item)).map((f) => f._v);
    byFile.set(file, [...others, ...kept]);
  }
  return byFile;
}

/** `selfTest()` — the fixture proves each of the 5 rule ids fires, and a clean file fires 0. */
export function selfTest() {
  const fixtureFindings = scanGateE([FIXTURE_FILE]);
  for (const ruleId of GATE_E_RULE_IDS) {
    if (!fixtureFindings.some((f) => f.ruleId === ruleId)) {
      throw new Error(`self-test FAILED (gate E): rule "${ruleId}" did not fire on the known-bad fixture`);
    }
  }
  // GREEN — a clean compute module yields 0 gate-E hits.
  const cleanFindings = scanGateE(['scripts/lib/compute/assert-schema.js']);
  if (cleanFindings.length !== 0) {
    throw new Error(`self-test FAILED (gate E): assert-schema.js (clean) unexpectedly matched ${JSON.stringify(cleanFindings)}`);
  }
  // A finding with a matching ledger row is filtered (allowed); without one it
  // is reported (unallowed). Old rule ids (e.g. compute-no-console) are never
  // filterable by a ledger row — matchLedger only ever sees GATE_E_RULE_IDS
  // findings because scanGateE already drops everything else.
  // The fixture now carries THREE compute-no-module-numeric-const violations
  // (UPPER_SNAKE_CASE + two camelCase, one arithmetic) so a case-blind rule is
  // proven — a single matching ledger row must filter ONLY its own finding,
  // leaving the other two unledgered findings unallowed (still RED).
  const row = {
    gate: 'E', step: 'bad-compute-literals', item: 'compute-no-module-numeric-const@const MAX_RETRY_COUNT = 5;',
    disposition: 'pending_remediation', why: 'fixture', closing_brief: 'fixture', filed: '2026-09-26', adjudicated_by: 'operator',
  };
  const allowed = checkComputeLiterals([FIXTURE_FILE], [row]);
  const stillUnallowed = allowed.unallowed.filter((v) => v.item === row.item);
  if (stillUnallowed.length !== 0) {
    throw new Error(`self-test FAILED (gate E): a matching ledger row must filter its finding (${JSON.stringify(stillUnallowed)})`);
  }
  const noRow = checkComputeLiterals([FIXTURE_FILE], []);
  if (noRow.pass) {
    throw new Error('self-test FAILED (gate E): the fixture must RED with no ledger rows at all');
  }
  // An orphan row (no matching finding) is RED.
  const orphanRow = { ...row, item: 'compute-no-module-numeric-const@no such line exists' };
  const orphaned = checkComputeLiterals([FIXTURE_FILE], [orphanRow]);
  if (orphaned.orphans.length === 0) {
    throw new Error('self-test FAILED (gate E): a ledger row with no matching finding must be an orphan');
  }
}

/** `--list` — proposed rows for every CURRENT unallowed finding over the real corpus. */
function main(argv) {
  if (argv.includes('--self-test')) {
    selfTest();
    process.stdout.write('compute-literals self-test OK\n');
    return;
  }
  if (argv.includes('--list')) {
    const { rows } = loadLedger(REPO_ROOT);
    const result = checkComputeLiterals(loadComputeFiles(REPO_ROOT), rows);
    const out = result.unallowed.map((v) => {
      // The closed allowlist (PROPOSED_UNIT_CONVERSION/COORDINATE_REFERENCE/
      // PHYSICAL_CONSTANT) only ever names UPPER_SNAKE_CASE identifiers — a
      // camelCase module const legitimately never matches and falls through
      // to pending_remediation, same as any other un-allowlisted name.
      const name = v.item.split('@')[0] === 'compute-no-module-numeric-const' ? (v.item.split('@')[1] || '').match(/(?:const|let)\s+([A-Za-z0-9_]+)/)?.[1] : null;
      let disposition = 'pending_remediation';
      if (name && PROPOSED_UNIT_CONVERSION.test(name)) disposition = 'unit_conversion';
      else if (name && PROPOSED_COORDINATE_REFERENCE.test(name)) disposition = 'coordinate_reference';
      else if (name && PROPOSED_PHYSICAL_CONSTANT.test(name)) disposition = 'physical_constant';
      return {
        gate: 'E', step: v.step, item: v.item, disposition,
        why: disposition === 'pending_remediation' ? 'measured 2026-09-26 — rides the step remediation commit' : null,
        spec_ref: disposition === 'pending_remediation' ? undefined : '(orchestrator fills)',
        anchor: disposition === 'pending_remediation' ? undefined : '(orchestrator fills)',
        closing_brief: disposition === 'pending_remediation' ? `wf2-remediate-${v.step.replace(/_/g, '-')}` : undefined,
        filed: new Date().toISOString().slice(0, 10), adjudicated_by: 'operator',
      };
    });
    process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
    return;
  }
  process.stderr.write('usage: compute-literals.mjs --list | --self-test\n');
  process.exitCode = 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
