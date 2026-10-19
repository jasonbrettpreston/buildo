// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-EB (EXT-1 estate literal gate);
//            R-DF EXTERNALIZED; R-BA gate E (#32); R-CV (pinned form); R-BZ (the purity-row freeze shape)
//
// GATE E, ESTATE ARM (rule group `estate-no-numeric-literal`). Gate E's compute arm
// (compute-literals.mjs) bans a tunable literal in scripts/lib/compute/**. This arm extends the
// same EXTERNALIZED rule to the code that runs and judges every step:
//
//   ESTATE_SCOPES      — scripts/analysis/gates/** (and scripts/lib/step/** once RE-FREEZE #37
//                        lands its runner rows): a finding is RED. It can NEVER be ledgered —
//                        the fix is a registered variable or a deleted fallback (R-EB).
//   TOOLING_RATCHET    — the decision-bearing tooling outside scope (PIN EXT-2): each file's
//                        finding count may only fall. The marks live in
//                        scripts/steps/_schema/estate-literal-high-water-mark.json (the
//                        admin-unclassified-high-water-mark.json precedent).
//
// A finding is a numeric literal other than 0 / 1 / -1 (category A) that sits in none of the
// closed allowed categories below, or a SQL text bound (`LIMIT <n>` with n != 1,
// `interval '<n> …'`). The categories are decided by AST context, never by a list of sites:
//   (B) structural — a subscript / regex group index; `process.argv.slice(2)`;
//       `JSON.stringify(_, null, 2)`; `process.exitCode = n` / `process.exit(n)`;
//       `toISOString().slice(0, 10)`; a parseInt radix; cardinality "two or more"
//       (a relational comparison against 2); a fast-invariant result row's `id`.
//   (C) definitional unit — an operand of `*` or `/` whose value is in UNIT_FACTORS.
//   (D) catalog / protocol constants — CATALOG_CONSTANTS (a closed list, a citation each) and
//       the values of the closed ENUM_MAPS.
//   (E) self-test fixture data — inside a function named `selfTest` / `selfTestCases`, or a file under fixtures/.
//   (F) human-readable text — inside a template literal, or an argument of `new Error(…)`,
//       `log.*(…)`, `console.*(…)`, `process.stdout|stderr.write(…)`. A persisted value
//       (e.g. a stored audit-value cap) is a const, not text, and stays a finding.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');

export const RULE_ID = 'estate-no-numeric-literal';
export const SQL_RULE_ID = 'estate-no-sql-numeric-literal';

/** Scopes where a finding is RED and can never be ledgered (R-EB). */
export const ESTATE_SCOPES = Object.freeze(['scripts/analysis/gates']);

/** PIN EXT-2: decision-bearing tooling outside scope, ratcheted per file to zero. */
export const TOOLING_RATCHET_FILES = Object.freeze([
  'scripts/analysis/step-validate.mjs',
  'scripts/analysis/capture-step-golden.js',
  'scripts/analysis/ingestor-forced-cohort.js',
  'scripts/run-chain.js',
  'scripts/ai-env-check.mjs',
  'scripts/lib/pipeline.js',
]);
export const HIGH_WATER_MARK_REL_PATH = 'scripts/steps/_schema/estate-literal-high-water-mark.json';

/** (C) definitional units: ms per second/minute/hour/day, percent, binary kilo. */
export const UNIT_FACTORS = Object.freeze([1000, 60000, 3600000, 86400000, 100, 1024]);

/** (B) the structural values the closed (B) contexts compare against. */
export const STRUCTURAL_VALUES = Object.freeze({ argvSliceStart: 2, jsonIndentArg: 2, radix: 10, isoDateLength: 10, pair: 2 });

/** (D) catalog / protocol constants, a closed list with a citation each. */
export const CATALOG_CONSTANTS = Object.freeze([
  { value: 4326, why: 'WGS84 SRID (Spec 124 R-CX; write.js geometry_srid)' },
  { value: 300, why: 'HTTP 3xx class lower bound (RFC 9110 §15), compared against a response status', against: 'status' },
  { value: 400, why: 'HTTP 3xx class upper bound (RFC 9110 §15), compared against a response status', against: 'status' },
  { value: 65535, why: 'PostgreSQL bind-parameter protocol limit (Spec 124 R-CU)' },
]);
/** (D) closed enum maps: a literal inside one of these object initializers is an enum code. */
export const ENUM_MAPS = Object.freeze(['SEVERITY_RANK', 'GEOMETRY_KIND_EXTRACT_TYPE', 'DURATION_UNITS']);
/** The closed lists themselves are declarations, not decisions. */
const CLOSED_LIST_NAMES = new Set(['UNIT_FACTORS', 'CATALOG_CONSTANTS', 'STRUCTURAL_VALUES']);

const LOG_RECEIVERS = new Set(['log', 'logger', 'console']);
/** (E) a self-test function: `selfTest` or `selfTestCases` (the fixture pairs a test drives). */
const SELF_TEST_NAME = /^selfTest(Cases)?$/;

function calleeText(call) {
  return call && call.expression ? call.expression.getText() : '';
}

function isUnderSelfTest(node) {
  for (let p = node.parent; p; p = p.parent) {
    if ((ts.isFunctionDeclaration(p) || ts.isFunctionExpression(p) || ts.isMethodDeclaration(p)) && p.name && SELF_TEST_NAME.test(p.name.text)) return true;
    if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name) && SELF_TEST_NAME.test(p.name.text)) return true;
  }
  return false;
}

function isUnderText(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isTemplateSpan(p) || ts.isTemplateExpression(p)) return true;
    if (ts.isNewExpression(p) && /^(Error|TypeError|RangeError)$/.test(p.expression.getText())) return true;
    if (ts.isCallExpression(p)) {
      const c = calleeText(p);
      if (/^process\.(stdout|stderr)\.write$/.test(c)) return true;
      if (ts.isPropertyAccessExpression(p.expression) && ts.isIdentifier(p.expression.expression) && LOG_RECEIVERS.has(p.expression.expression.text)) return true;
    }
  }
  return false;
}

function isUnderNamedInitializer(node, names) {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name) && names.has(p.name.text)) return true;
  }
  return false;
}

/** (B) structural context of the literal `lit` (the outermost numeric node, incl. a unary minus). */
function structuralReason(lit, value) {
  const p = lit.parent;
  if (ts.isElementAccessExpression(p) && p.argumentExpression === lit) return 'subscript index';
  if (ts.isCallExpression(p)) {
    const c = calleeText(p);
    const argIdx = p.arguments.indexOf(lit);
    if (c === 'process.argv.slice' && value === STRUCTURAL_VALUES.argvSliceStart) return 'argv.slice(2)';
    if (c === 'JSON.stringify' && argIdx === STRUCTURAL_VALUES.jsonIndentArg) return 'JSON.stringify indent';
    if (c === 'process.exit') return 'process exit code';
    if ((c === 'parseInt' || c === 'Number.parseInt') && argIdx === 1 && value === STRUCTURAL_VALUES.radix) return 'parseInt radix';
    if (ts.isPropertyAccessExpression(p.expression) && p.expression.name.text === 'slice'
      && ts.isCallExpression(p.expression.expression) && /\.toISOString$/.test(calleeText(p.expression.expression))
      && value === STRUCTURAL_VALUES.isoDateLength) return 'ISO date slice';
  }
  if (ts.isBinaryExpression(p)) {
    const op = p.operatorToken.kind;
    if (op === ts.SyntaxKind.EqualsToken && p.right === lit && p.left.getText() === 'process.exitCode') return 'process exit code';
    const relational = [ts.SyntaxKind.LessThanToken, ts.SyntaxKind.LessThanEqualsToken, ts.SyntaxKind.GreaterThanToken, ts.SyntaxKind.GreaterThanEqualsToken];
    if (relational.includes(op) && value === STRUCTURAL_VALUES.pair) return 'cardinality two or more';
  }
  if (ts.isPropertyAssignment(p) && p.initializer === lit && ts.isIdentifier(p.name) && p.name.text === 'id'
    && ts.isObjectLiteralExpression(p.parent) && p.parent.properties.some((q) => q.name && q.name.getText() === 'pass')) {
    return 'fast-invariant id';
  }
  return null;
}

function unitReason(lit, value) {
  const p = lit.parent;
  if (!ts.isBinaryExpression(p)) return null;
  const op = p.operatorToken.kind;
  if ((op === ts.SyntaxKind.AsteriskToken || op === ts.SyntaxKind.SlashToken) && UNIT_FACTORS.includes(value)) return 'definitional unit';
  return null;
}

function catalogReason(lit, value) {
  const c = CATALOG_CONSTANTS.find((k) => k.value === value);
  if (!c) return null;
  if (c.against) {
    const p = lit.parent;
    if (!ts.isBinaryExpression(p)) return null;
    const other = p.left === lit ? p.right : p.left;
    return other.getText().endsWith(`.${c.against}`) ? c.why : null;
  }
  return c.why;
}

/** SQL text arms over one string / template chunk. */
function sqlFindings(text) {
  const out = [];
  const limit = /\bLIMIT\s+(\d+)\b/gi;
  let m;
  while ((m = limit.exec(text))) if (Number(m[1]) !== 1 && Number(m[1]) !== 0) out.push(`LIMIT ${m[1]}`);
  const interval = /\binterval\s+'(\d+(?:\.\d+)?)/gi;
  while ((m = interval.exec(text))) if (Number(m[1]) !== 1 && Number(m[1]) !== 0) out.push(`interval '${m[1]}`);
  return out;
}

/**
 * Every finding in one file. PURE over (relPath, text).
 * @param {string} relPath repo-relative path (decides category E for fixtures/)
 * @param {string} text
 * @returns {Array<{file: string, line: number, rule: string, value: string, lineText: string}>}
 */
export function literalFindings(relPath, text) {
  if (/(^|\/)fixtures\//.test(relPath)) return [];
  const sf = ts.createSourceFile(relPath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const lines = text.split('\n');
  const out = [];
  const push = (node, rule, value) => {
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line;
    out.push({ file: relPath, line: line + 1, rule, value, lineText: (lines[line] || '').trim() });
  };
  const visit = (node) => {
    if (ts.isNumericLiteral(node)) {
      const lit = ts.isPrefixUnaryExpression(node.parent) && node.parent.operator === ts.SyntaxKind.MinusToken ? node.parent : node;
      const value = Number(node.text) * (lit === node ? 1 : -1);
      const allowed = value === 0 || value === 1 || value === -1
        || isUnderSelfTest(node)
        || isUnderNamedInitializer(node, CLOSED_LIST_NAMES)
        || isUnderNamedInitializer(node, new Set(ENUM_MAPS))
        || structuralReason(lit, value)
        || unitReason(lit, value)
        || catalogReason(lit, value)
        || isUnderText(node);
      if (!allowed) push(node, RULE_ID, lit.getText(sf));
    } else if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node))
      && !isUnderSelfTest(node)) {
      for (const hit of sqlFindings(node.text)) push(node, SQL_RULE_ID, hit);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

function walk(absDir, out) {
  if (!fs.existsSync(absDir)) return out;
  for (const e of fs.readdirSync(absDir, { withFileTypes: true })) {
    const p = path.join(absDir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p, out); } else if (/\.(js|mjs|cjs)$/.test(e.name)) out.push(p);
  }
  return out;
}

/** Repo-relative source files of the given scopes, sorted. DISK. */
export function scopeFiles(scopes = ESTATE_SCOPES, repoRoot = REPO_ROOT) {
  return scopes.flatMap((s) => walk(path.join(repoRoot, s), []))
    .map((a) => path.relative(repoRoot, a).split(path.sep).join('/'))
    .sort();
}

/** Findings over files. DISK. */
export function scanFiles(files, repoRoot = REPO_ROOT) {
  return files.flatMap((f) => literalFindings(f, fs.readFileSync(path.join(repoRoot, f), 'utf8')));
}

/** Per-file finding counts for the tooling ratchet. DISK. */
export function toolingCounts(repoRoot = REPO_ROOT, files = TOOLING_RATCHET_FILES) {
  return Object.fromEntries(files.map((f) => [f, scanFiles([f], repoRoot).length]));
}

/**
 * The ratchet verdict. PURE. A file over its mark, a file with no mark, or a mark for a file no
 * longer in the list is RED; a count below its mark is GREEN (lowered by `--write`).
 * @param {Record<string, number>} counts
 * @param {{marks: Record<string, number>}} hwm
 */
export function ratchetDecision(counts, hwm) {
  const marks = (hwm && hwm.marks) || {};
  const problems = [];
  for (const [f, n] of Object.entries(counts)) {
    if (!Object.prototype.hasOwnProperty.call(marks, f)) problems.push(`${f}: no high-water mark`);
    else if (n > marks[f]) problems.push(`${f}: ${n} literal finding(s) > high-water mark ${marks[f]}`);
  }
  for (const f of Object.keys(marks)) if (!Object.prototype.hasOwnProperty.call(counts, f)) problems.push(`${f}: mark for a file outside the ratchet list`);
  return { pass: problems.length === 0, problems };
}

function readHighWaterMark(repoRoot) {
  const p = path.join(repoRoot, HIGH_WATER_MARK_REL_PATH);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
}

/**
 * The estate arm of gate E, what step-validate's #32 line folds in. DISK.
 * @param {string} [repoRoot]
 */
export function checkEstateLiterals(repoRoot = REPO_ROOT) {
  const findings = scanFiles(scopeFiles(ESTATE_SCOPES, repoRoot), repoRoot);
  const counts = toolingCounts(repoRoot);
  const ratchet = ratchetDecision(counts, readHighWaterMark(repoRoot));
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const where = (f) => `${f.file}:${f.line} ${f.value}`;
  const detail = `ESTATE-LITERALS (gate E estate arm, R-EB): ${findings.length} finding(s) in ${ESTATE_SCOPES.join(', ')}`
    + (findings.length ? ` [${findings.map(where).join('; ')}]` : '')
    + `; tooling ratchet (PIN EXT-2) ${total} finding(s) over ${TOOLING_RATCHET_FILES.length} files`
    + (ratchet.problems.length ? ` RED [${ratchet.problems.join('; ')}]` : ', at or below the marks');
  return { pass: findings.length === 0 && ratchet.pass, findings, counts, ratchet, detail };
}

/** Lower (never raise) the tooling marks to the live counts. DISK, write. */
export function writeHighWaterMark(repoRoot = REPO_ROOT, today = new Date().toISOString().slice(0, 10)) {
  const counts = toolingCounts(repoRoot);
  const prior = readHighWaterMark(repoRoot);
  const marks = {};
  for (const [f, n] of Object.entries(counts)) {
    const old = prior && prior.marks && Object.prototype.hasOwnProperty.call(prior.marks, f) ? prior.marks[f] : null;
    marks[f] = old === null ? n : Math.min(old, n);
  }
  const doc = {
    $comment: 'PIN EXT-2 (Spec 124 R-EB): per-file estate-literal finding counts for the decision-bearing tooling outside the gate E estate scope. Monotonic: --write only lowers a mark; a rise is RED in step-validate #32. Ratcheted to 0 by a dated follow-up (scripts/lib/pipeline.js first).',
    recorded_at: prior && JSON.stringify(prior.marks) === JSON.stringify(marks) ? prior.recorded_at : today,
    marks,
  };
  fs.writeFileSync(path.join(repoRoot, HIGH_WATER_MARK_REL_PATH), `${JSON.stringify(doc, null, 2)}\n`);
  return doc;
}

/** In-memory fixtures, both directions per category. Throws on the first failure. */
export function selfTest() {
  const fail = (m) => { throw new Error(`estate-literals self-test FAILED: ${m}`); };
  const n = (src, rel = 'scripts/analysis/gates/x.mjs') => literalFindings(rel, src).length;
  // RED — each finding shape from the EXT-1 census.
  const red = [
    'const MIN_WHY_LEN = 20;',
    'const c = Number.isFinite(x) && x > 0 ? x : 4;',
    'const b = opts.batchSize || 100;',
    'const r = Math.max(50, Math.round(t / 4));',
    'setTimeout(f, ms * 2);',
    'spawnSync("git", [], { maxBuffer: 32 * 1024 * 1024 });',
    'const sql = `SELECT 1 FROM t LIMIT 40`;',
    "const sql = \"WHERE a > now() - interval '7 days'\";",
  ];
  for (const src of red) if (n(src) === 0) fail(`no finding for ${src}`);
  // GREEN — each allowed category.
  const green = [
    'const a = m[2];',
    'main(process.argv.slice(2));',
    'out.write(JSON.stringify(x, null, 2));',
    'process.exitCode = 2;',
    'const d = new Date().toISOString().slice(0, 10);',
    'const v = Number.parseInt(s, 10);',
    'if (xs.length < 2) return;',
    'return { id: 43, pass: true };',
    'const s = ms / 1000; const m = x * 60000;',
    'if (srid !== 4326) bad();',
    'if (res.status >= 300 && res.status < 400) follow();',
    'const SEVERITY_RANK = { PASS: 0, WARN: 1, FAIL: 2 };',
    'export function selfTest() { want(f(17), 17); }',
    'throw new Error(`got ${sql.slice(0, 200)}`);',
    'log.info(tag, x.slice(0, 8));',
    'const sql = `SELECT 1 FROM t LIMIT 1`;',
  ];
  for (const src of green) if (n(src) !== 0) fail(`false finding for ${src}: ${JSON.stringify(literalFindings('x.mjs', src))}`);
  if (n('const X = 20;', 'scripts/analysis/gates/fixtures/f.mjs') !== 0) fail('fixtures/ must be category E');
  // Ratchet both directions.
  if (!ratchetDecision({ a: 3 }, { marks: { a: 3 } }).pass) fail('count at mark must be GREEN');
  if (ratchetDecision({ a: 4 }, { marks: { a: 3 } }).pass) fail('count over mark must be RED');
  if (ratchetDecision({ a: 1 }, { marks: {} }).pass) fail('a file with no mark must be RED');
}

function main(argv) {
  if (argv.includes('--write')) {
    const doc = writeHighWaterMark();
    console.log(`[estate-literals] ${HIGH_WATER_MARK_REL_PATH}: ${JSON.stringify(doc.marks)}`);
    return;
  }
  if (argv.includes('--self-test')) { selfTest(); console.log('[estate-literals] self-test passed'); return; }
  const r = checkEstateLiterals();
  if (argv.includes('--list')) for (const f of r.findings) console.log(`${f.file}:${f.line}\t${f.rule}\t${f.value}\t${f.lineText}`);
  console.log(r.detail);
  if (!r.pass) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
