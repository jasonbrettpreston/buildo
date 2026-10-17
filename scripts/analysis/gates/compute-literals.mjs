// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rule 2, Rule 3, §5 R-BA (gate E);
//            122_pipeline_step_optimization.md §5.5
//
// GATE E — SCALABLE. Eleven ast-grep rules appended to
// `scripts/ast-grep-rules/compute-shape.yml` (fast invariant #32) ban a
// hard-coded SQL INTERVAL/date literal, a module-level numeric constant of ANY
// identifier case (STANDARDIZED 2026-09-26 — a camelCase rename used to evade
// the original UPPER_SNAKE_CASE-only match), a `violations:` key compared
// against a non-zero literal, and a literal numeric
// SQL bound inside `scripts/lib/compute/**` — the class of invisible, no-audit-
// row, no-deploy-free-to-move tunable Rule 3 bans. The 2026-10-11 R-BZ
// EXTENSION added six more: a literal SQL clock read (`now()`/`CURRENT_DATE`/…),
// a function-LOCAL numeric const, a literal URL, a dynamic `require(...)`/
// `import(...)`, a direct `<step>.descriptor.json` require, and a `catch` that
// neither throws nor reports. `check-step-shape.mjs`
// (the blocking driver) filters a finding for ONE of these 11 rule ids when a
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
/** The KNOWN-GOOD twin (CP-B4) — the gate-E clean exemplar. */
export const CLEAN_FIXTURE_FILE = 'scripts/steps/_schema/fixtures/compute/clean-compute-purity.js';

/** The 11 NEW rule ids gate E owns — filterable by a ledger row; nothing else is. */
export const GATE_E_RULE_IDS = [
  'compute-no-sql-interval-literal',
  'compute-no-sql-date-literal',
  'compute-no-module-numeric-const',
  'compute-no-literal-violation-compare',
  'compute-no-sql-numeric-bound',
  // 2026-10-11 R-BZ extension — six further ids, each EXTENDING one of the five
  // above (or, for `compute-forbidden-require-descriptor`, a sibling extension),
  // in the same order the gate-E rule table lists them.
  'compute-no-sql-clock',
  'compute-no-local-numeric-const',
  'compute-no-literal-url',
  'compute-forbidden-require-dynamic',
  'compute-forbidden-require-descriptor',
  'compute-no-swallow',
];

/** Compute-purity rule ids (Spec 124 R-BZ, 122a §A26): G1–G8 from compute-purity.mjs + the 6 R-BZ ast-grep ids. */
export const PURITY_RULE_IDS = [
  'compute-ledger-sql', 'compute-undeclared-relation', 'compute-catalog', 'compute-ddl-txn',
  'compute-direct-write', 'compute-decides', 'compute-halt',
  'compute-no-sql-clock', 'compute-no-local-numeric-const', 'compute-no-literal-url',
  'compute-forbidden-require-dynamic', 'compute-forbidden-require-descriptor', 'compute-no-swallow',
];
/** Airtight V3 freeze: the only date a purity row may carry, and the only modules that may carry one. */
export const PURITY_ROWS_FILED = '2026-10-11';
export const V2_PURITY_MODULES = [
  'assert-data-bounds', 'assert-engine-health', 'assert-global-coverage', 'assert-schema',
  'compute-parcel-cost-estimates', 'enrich-centreline', 'enrich-heritage', 'enrich-parcels',
  'enrich-ravines', 'load-address-points', 'load-centreline', 'load-heritage', 'load-massing',
  'load-neighbourhoods', 'load-parcels', 'load-ravines', 'load-zoning', 'refresh-snapshot',
  'vocab-coverage',
];

/**
 * A purity ledger row: gate E, keyed on one of the 13 purity rule ids. The
 * `@`-suffix (the offending source line text) is stripped before the lookup, so
 * the row is recognised by its rule id alone.
 */
export function isPurityRow(row) {
  return !!row && row.gate === 'E' && PURITY_RULE_IDS.includes(String(row.item).split('@')[0]);
}

/**
 * Airtight V3 freeze (operator ruling 2026-10-11): a purity finding can NEVER be
 * ledgered. The Phase 1 set of purity rows is frozen — every purity row must
 * carry `filed === PURITY_ROWS_FILED` and sit on a module in `V2_PURITY_MODULES`.
 * Any other purity row is a NEW ledger row invented to slip an unledgered
 * finding past gate E, and is reported here. Returns one problem string per row.
 */
export function purityRowFreeze(ledgerRows) {
  const problems = [];
  for (const row of Array.isArray(ledgerRows) ? ledgerRows : []) {
    if (!isPurityRow(row)) continue;
    if (row.filed !== PURITY_ROWS_FILED || !V2_PURITY_MODULES.includes(row.step)) {
      problems.push(
        `${row.step}:${row.item.split('@')[0]} — Airtight V3: a purity finding cannot be ledgered (filed ${row.filed}); fix the compute`,
      );
    }
  }
  return problems;
}

/**
 * The standard a step speaks: `'V2'` if any purity row names that module (its
 * compute still carries a frozen 2026-10-11 purity finding), else `'V3'`.
 */
export function standardFor(moduleBase, ledgerRows) {
  return (Array.isArray(ledgerRows) ? ledgerRows : []).some(
    (row) => isPurityRow(row) && row.step === moduleBase,
  ) ? 'V2' : 'V3';
}

/** Proposed dispositions for the orchestrator's `--list` output. */
const PROPOSED_UNIT_CONVERSION = /^(MS_PER_DAY|DAYS_PER_JULIAN_YEAR|SQM_TO_SQFT|M_TO_FT)$/;
const PROPOSED_COORDINATE_REFERENCE = /^SOURCE_CRS$/;

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
 * Run the 11 gate-E rule ids over `files`. Returns `[{file, line, ruleId, lineText, step, item}]`.
 * Only the 11 gate-E ids are kept — the pre-existing rules in the same file are
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
  // `<rule>@<trimmed line>` → how many times it has occurred SO FAR *in this FILE*
  // (R-CN: the ordinal is per FILE, not per step — one basename may repeat across dirs).
  // CP-B11 fix 6: the 1st occurrence keeps the bare key; the 2nd, 3rd… get `#2`, `#3`.
  // An existing key that occurs once is therefore unchanged (the 29 ledger rows hold).
  const ord = gateEOrdinal();
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
    out.push({ file: rel, line: Number(lineNo), ruleId, lineText, step, item: ord(rel, `${ruleId}@${lineText}`) });
  }
  return out;
}

/**
 * Map `scanPurity` sites (`{code, rule, file, line, key}`) onto the gate-E finding
 * shape, so the same ledger-row mechanism filters compute-purity findings too.
 */
export function purityFindings(sites) {
  return (sites || []).map((s) => ({
    file: s.file,
    line: s.line,
    ruleId: s.rule,
    step: path.basename(s.file).replace(/\.(c?js)$/, ''),
    item: s.key,
  }));
}

/**
 * The gate-E ordinal helper (R-CN): a `(fileRel, base) => item` closure whose
 * counter is keyed on the FILE (repo-relative posix path) plus the bare item
 * text — never on `step`, because `step` is a basename and the same basename
 * may occur in two directories. CP-B11 fix 6: the 1st occurrence in a file
 * keeps the bare key; the 2nd, 3rd… get `#2`, `#3`. PURE: no fs, no clock.
 *
 * @returns {(fileRel: string, base: string) => string}
 */
export function gateEOrdinal() {
  const itemSeen = new Map();
  return (fileRel, base) => {
    const k = `${fileRel}\u0000${base}`;
    const n = (itemSeen.get(k) || 0) + 1;
    itemSeen.set(k, n);
    return n === 1 ? base : `${base}#${n}`;
  };
}

/** Gate E over an explicit file list. PURE modulo the ast-grep spawn. */
export function checkComputeLiterals(files, ledgerRows, repoRoot = REPO_ROOT, puritySites = []) {
  const findings = [...scanGateE(files, repoRoot), ...purityFindings(puritySites)];
  const { unallowed, orphans, allowed } = matchLedger('E', findings, ledgerRows);
  const blockedSlugs = [...new Set(unallowed.map((v) => v.step))];
  const frozen = purityRowFreeze(ledgerRows);
  const frozenSteps = [...new Set((Array.isArray(ledgerRows) ? ledgerRows : [])
    .filter(isPurityRow)
    .filter((r) => r.filed !== PURITY_ROWS_FILED || !V2_PURITY_MODULES.includes(r.step))
    .map((r) => r.step))];
  for (const step of frozenSteps) if (!blockedSlugs.includes(step)) blockedSlugs.push(step);
  const frozenDetail = frozen.length ? `; ${frozen.length} V3-frozen row(s) [${frozen.join('; ')}]` : '';
  const detail = (unallowed.length || orphans.length)
    ? `COMPUTE-LITERALS (gate E): ${unallowed.length} unallowed finding(s)`
      + (unallowed.length ? ` [${unallowed.map((v) => `${v.step}:${v.item.split('@')[0]}`).join('; ')}]` : '')
      + `; ${orphans.length} orphan ledger row(s)`
      + frozenDetail
    : `COMPUTE-LITERALS (gate E): ${findings.length} finding(s), all ledger-allowed (${allowed.length})`
      + frozenDetail;
  return {
    pass: unallowed.length === 0 && orphans.length === 0 && frozen.length === 0,
    blockedSlugs, detail, unallowed, orphans, allowed, findings, frozen,
  };
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
 * for one of the 11 `GATE_E_RULE_IDS` when a `{gate:'E'}` ledger row allows it
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
    } catch (err) {
      // CP-B8b: an unreadable scan file is NOT "nothing to allow" — silently
      // skipping it would hide every gate-E finding in the file.
      throw new Error('gate E: cannot read ' + file + ': ' + err.message);
    }
    const step = path.basename(file).replace(/\.js$/, '');
    // R-CN: the gate-E key names the file, so each finding carries it. `file` is
    // already repo-relative posix here; normalise defensively if it is not.
    const fileRel = path.isAbsolute(file)
      ? path.relative(repoRoot, file).replace(/\\/g, '/')
      : file.replace(/\\/g, '/');
    // Same ordinal rule as `scanGateE` (CP-B11 fix 6): duplicates of one
    // `<rule>@<trimmed line>` within one step file get `#2`, `#3`…
    const itemSeen = new Map();
    const ord = (base) => {
      const n = (itemSeen.get(base) || 0) + 1;
      itemSeen.set(base, n);
      return n === 1 ? base : `${base}#${n}`;
    };
    const findings = gateEHits.map((v) => ({ step, file: fileRel, item: ord(`${v.rule}@${(text[v.line - 1] || '').trim()}`), _v: v }));
    const { unallowed } = matchLedger('E', findings, ledgerRows);
    const stillReported = new Set(unallowed.map((u) => u.item));
    const others = violations.filter((v) => !GATE_E_RULE_IDS.includes(v.rule));
    const kept = findings.filter((f) => stillReported.has(f.item)).map((f) => f._v);
    byFile.set(file, [...others, ...kept]);
  }
  return byFile;
}

/**
 * `selfTest()` — the fixture proves each of the 11 rule ids fires, and the
 * KNOWN-GOOD purity fixture (`CLEAN_FIXTURE_FILE`) fires 0.
 */
export function selfTest() {
  const fixtureFindings = scanGateE([FIXTURE_FILE]);
  for (const ruleId of GATE_E_RULE_IDS) {
    if (!fixtureFindings.some((f) => f.ruleId === ruleId)) {
      throw new Error(`self-test FAILED (gate E): rule "${ruleId}" did not fire on the known-bad fixture`);
    }
  }
  // GREEN — a clean compute module yields 0 gate-E hits. The exemplar is the
  // CP-B4 purity fixture, NOT `scripts/lib/compute/assert-schema.js`: that real
  // module holds nine literal `https://` CKAN endpoints — the measured G10 sites
  // (`compute-no-literal-url`) the plan expects ledger rows for — so it is not
  // clean for gate E.
  const cleanFindings = scanGateE([CLEAN_FIXTURE_FILE]);
  if (cleanFindings.length !== 0) {
    throw new Error(`self-test FAILED (gate E): ${CLEAN_FIXTURE_FILE} (clean) unexpectedly matched ${JSON.stringify(cleanFindings)}`);
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
    gate: 'E', step: 'bad-compute-literals', file: FIXTURE_FILE, item: 'compute-no-module-numeric-const@const MAX_RETRY_COUNT = 5;',
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
      return {
        gate: 'E', step: v.step, file: v.file, item: v.item, disposition,
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
