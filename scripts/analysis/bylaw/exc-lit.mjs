// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §8 rule 1 ("No per-row code. No regulation id or exception
//            number appears as an executable literal in `scripts/` or `src/` (G-EXC-LIT, Phase 2); no branch on a
//            regulation id"), §8 rule 8 (`check…() → {pass, violations, checked}` + `selfTest()`), §8 rule 9 (the
//            `typescript` compiler API, AST), §9 G-EXC-LIT row; docs/specs/01-pipeline/69_mcbylaw_policy.md M-25 (output
//            HOLD: legacy code is report-only until Phase 3); .cursor/mcbylaw/phase2-plan-v2.md row L8
//
// G-EXC-LIT — no per-row code. An AST walk (typescript compiler API; never a text grep, never executed) over every code
// file under scripts/ and src/ finds three KINDS of identity literal in an EXECUTABLE POSITION:
//
//   regulation_id_literal     a string containing a by-law id: `<d>.<d>[.<d>…](<n>)` (10.20.40.70(1), 800.50(445),
//                             900.3.10(5), clause-unit ids such as 10.20.40.70(3)#(A)) or `<article>#article`; or a bare
//                             dotted article id (900.1.10) / its prefix (.startsWith) against a regulation-named counterpart
//                             (`regulation_id`, `article`, `unit_id`, `clause_path`, `citation`)
//   exception_number_literal  a Ch.900 exception label `(x5)` / `x5`, or a positive integer whose counterpart is named
//                             like an exception number (scalar: `exception_number`, `exceptionNo`, `exc_no`; collection:
//                             any name containing "exception", or `EXC_…` / `exc[A-Z]…` — EXCEPTION_RULES[5], excMap.get(5))
//   parcel_id_literal         a positive integer (or digit string) whose counterpart is named like a parcel id
//                             (`parcel_id`, `parcelIds`, `parcel.id`, `parcels[0].id`) — Phase 2 plan v2 L8 / §B ("no per-lot patch")
//
// EXECUTABLE POSITIONS (closed; everything else — comments, log / error strings, call arguments, data values — is not
// executable and is never a hit):
//   comparison        an operand of === !== == != < > <= >=, or the argument of .startsWith / .endsWith
//   switch_case       a `case` label (counterpart: the switch discriminant)
//   key_lookup        `obj[L]`, `L in obj` (counterpart: the receiver)
//   object_key        a literal property / method / accessor name of an object literal or class (a dispatch table;
//                     counterpart: the owner name)
//   map_key           the first argument of .get / .has / .set / .delete, or a `new Map([[L, …]])` entry key
//   array_membership  an element of an array literal that is the receiver of .includes / .indexOf / .lastIndexOf, an
//                     element of `new Set([…])`, or the argument of .includes / .indexOf / .lastIndexOf
//   regex             a regex literal, or a `RegExp(…)` string argument, whose unescaped source contains the literal
//   sql_compare       inside SQL text (SELECT … FROM · UPDATE <t> SET · DELETE FROM · INSERT INTO), never in a log / error
//                     call or constructor argument: a quoted literal compared to a column on either side (= <> != IN (
//                     LIKE ILIKE ANY(ARRAY[ ), or an unquoted integer compared to an exception / parcel-id column
//                     (= <> != IN ( ANY(ARRAY[ ); reported on the literal's own line
// A `const` identifier in an executable position is followed one hop to its literal initializer (`via: const_alias`).
// Sentinels are never ids: 0, negative numbers. A file is parsed only if its text can hit (mayHit: an id shape, an
// id-named counterpart, or a \u / \x escape); a blocking file with parse diagnostics FAILS (source_unparsed).
// Declared limits (not detected; listed so nobody reads a PASS as more): an id imported from another module, a `let` /
// `var` alias, a function returning an id, a numeric-keyed dispatch table whose owner name is not exception / parcel
// shaped, an id in an INSERT … VALUES list, .sql files.
//
// SCOPE is data (SCOPE_RULES, first match wins; each reason implies one mode): McBylaw's own modules and any NEW
// scripts/lib/compute/ file are BLOCKING; the enumerated legacy compute files and the rest of scripts/ + src/ are
// REPORT-ONLY (Spec 69 M-25: no output change before Phase 3); src/tests/ is EXCLUDED (the test suite is fixture data
// by construction). The ALLOW_LIST is closed, applies only in blocking files, and is checked both directions (an entry
// that silences nothing is an orphan). Reason codes (closed):
//
//   regulation_id_literal / exception_number_literal / parcel_id_literal   a blocking, un-allowed hit (one per hit)
//   allow_entry_invalid   an allow-list entry that is not an object, has an unknown key, a reason outside
//                         ALLOW_REASONS, no note, no path, or a path that is not in blocking scope
//   allow_entry_orphan    a valid allow-list entry that silences no hit
//   scope_rule_invalid    a scope rule with a mode outside SCOPE_MODES, a reason outside SCOPE_REASONS or paired with
//                         another mode, not exactly one of path / prefix; or a file no valid rule matches (fail closed)
//   scope_rule_orphan     an explicit scope path that is not a file in the tree (the legacy list only shrinks), or no
//                         file in blocking scope at all (vacuous)
//   source_unparsed       a blocking file with parse diagnostics (a report-only one is counted)
//
//   scanSource(rel, text)                        → hits [{line, kind, position, literal, via, fn}]      PURE
//   classify(rel, scope?)                        → {mode, reason, rule} | null                          PURE
//   checkExcLit({sources, scope?, allow?})       → {pass, checked, violations, findings, counts}        PURE
//   loadSources(root) · checkTree({root}) · renderReport(result) · selfTest()

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

export const KINDS = Object.freeze(['exception_number_literal', 'parcel_id_literal', 'regulation_id_literal']);
export const REASON_CODES = Object.freeze([
  'allow_entry_invalid', 'allow_entry_orphan', 'exception_number_literal', 'parcel_id_literal',
  'regulation_id_literal', 'scope_rule_invalid', 'scope_rule_orphan', 'source_unparsed',
]);
export const POSITIONS = Object.freeze(['array_membership', 'comparison', 'key_lookup', 'map_key', 'object_key', 'regex', 'sql_compare', 'switch_case']);
export const SCOPE_MODES = Object.freeze(['blocking', 'excluded', 'report_only']);
export const SCOPE_REASON_NOTES = Object.freeze({
  mcbylaw_module: "McBylaw's own code (Spec 68 §8 rule 1): blocking from the gate's first commit",
  new_compute_step: 'a scripts/lib/compute/ file not on the legacy list: the Phase 2/3 Layer 2/3 step code lands here, blocking',
  legacy_compute_m25_hold: 'a compute file that existed when G-EXC-LIT landed: report-only until Phase 3 replaces it (Spec 69 M-25)',
  legacy_code_m25_hold: 'the rest of scripts/ and src/ (Spec 68 §8 rule 1 scope): report-only until Phase 3 (Spec 69 M-25)',
  test_suite: 'src/tests/ is fixture data by construction (every test pins ids); never executable product code',
});
export const ALLOW_REASON_NOTES = Object.freeze({
  self_test_fixture: "known-bad / good-twin fixture data inside a gate module's selfTest (Spec 68 §9: every reason code has one)",
  authored_fixture_module: 'a module that is fixture data as a whole (the S6 authored fixtures): no product decision branches on it',
  fixture_harness: 'a verification harness (never a step, never on a product path) selecting a named unit from a src/tests/fixtures file',
});
export const SCOPE_REASONS = Object.freeze(Object.keys(SCOPE_REASON_NOTES).sort());
/** Each scope reason implies one mode (a rule pairing them otherwise is scope_rule_invalid). */
const REASON_MODE = Object.freeze({ mcbylaw_module: 'blocking', new_compute_step: 'blocking', legacy_compute_m25_hold: 'report_only', legacy_code_m25_hold: 'report_only', test_suite: 'excluded' });
export const ALLOW_REASONS = Object.freeze(Object.keys(ALLOW_REASON_NOTES).sort());

/** Compute files present when G-EXC-LIT landed (2026-10-07). Only shrinks; a new compute file is blocking. */
const LEGACY_COMPUTE = [
  'assert-data-bounds.js', 'assert-engine-health.js', 'assert-global-coverage.js', 'assert-parcel-sanity.js', 'assert-schema.js',
  'compute-centroids.js', 'compute-parcel-cost-estimates.js', 'enrich-centreline.js', 'enrich-heritage.js', 'enrich-parcels.js',
  'enrich-ravines.js', 'geocode-permits.js', 'link-massing.js', 'link-neighbourhoods.js', 'link-parcel-addresses.js',
  'link-parcels.js', 'link-wsib.js', 'load-address-points.js', 'load-centreline.js', 'load-heritage.js', 'load-massing.js',
  'load-neighbourhoods.js', 'load-parcels.js', 'load-ravines.js', 'load-wsib.js', 'load-zoning.js', 'refresh-snapshot.js',
];

const deepFreeze = (o) => {
  if (o && typeof o === 'object') {
    for (const v of Object.values(o)) deepFreeze(v);
    Object.freeze(o);
  }
  return o;
};

/** First match wins. */
export const SCOPE_RULES = deepFreeze([
  { prefix: 'src/tests/', mode: 'excluded', reason: 'test_suite' },
  { prefix: 'scripts/analysis/bylaw/', mode: 'blocking', reason: 'mcbylaw_module' },
  { path: 'scripts/generate-bylaw-provisions.mjs', mode: 'blocking', reason: 'mcbylaw_module' },
  ...LEGACY_COMPUTE.map((f) => ({ path: `scripts/lib/compute/${f}`, mode: 'report_only', reason: 'legacy_compute_m25_hold' })),
  { prefix: 'scripts/lib/compute/', mode: 'blocking', reason: 'new_compute_step' },
  { prefix: 'scripts/', mode: 'report_only', reason: 'legacy_code_m25_hold' },
  { prefix: 'src/', mode: 'report_only', reason: 'legacy_code_m25_hold' },
]);

/**
 * Closed. Each entry: {path, function?, reason ∈ ALLOW_REASONS, note}. `function` limits the entry to hits inside a
 * declaration of that name (a function, a method, or a const / property the hit sits in); without it, the whole file.
 * Measured on the tree when the gate landed (2026-10-07): these are the only blocking-scope hits, all fixture data.
 */
export const ALLOW_LIST = deepFreeze([
  { path: 'scripts/analysis/bylaw/authored-fixtures.mjs', reason: 'authored_fixture_module', note: 'S6 gate fixtures cut from the live slice; ids name the fixture rows, imported only by gate selfTests and tests' },
  { path: 'scripts/analysis/bylaw/definitions.mjs', function: 'FIXTURES', reason: 'self_test_fixture', note: 'G-READ definitions arm known-bad / good-twin fixtures (input_fidelity records keyed by definition id)' },
  { path: 'scripts/analysis/bylaw/definitions.mjs', function: 'matcherSelfTest', reason: 'self_test_fixture', note: 'definition-matcher fixtures: the expected term ids of the fixture rows' },
  { path: 'scripts/analysis/bylaw/exc-lit.mjs', function: 'selfTest', reason: 'self_test_fixture', note: "G-EXC-LIT's own known-bad sources (an id inside SQL text)" },
  { path: 'scripts/analysis/bylaw/evaluate.mjs', function: 'precedenceFixtures', reason: 'self_test_fixture', note: 'G-EVAL (c) precedence fixtures (Spec 68 §7.5 rules 0–7); the fixture exceptions are declared authored per ruling (d)' },
  { path: 'scripts/analysis/bylaw/oracle-b/compare.mjs', function: 'bandUnit', reason: 'fixture_harness', note: 'the oracle A/B harness picks the RD band fixture unit from src/tests/fixtures/bylaw/eval-units.json' },
]);

// ---------------------------------------------------------------- literal shapes and names

const REG_ID_RE = /(?<![\d.])\d{1,3}(?:\.\d{1,3}){1,4}\(\d{1,4}[A-Za-z]?\)/;
const ARTICLE_RE = /(?<![\d.])\d{1,3}(?:\.\d{1,3}){1,4}#article\b/;
const EXC_WHOLE_RE = /^\(?x\d{1,4}\)?$/i;
const EXC_PART_RE = /(?<![A-Za-z0-9])\(x\d{1,4}\)/i;
const EXC_NAME_RE = /exception_?(?:number|num|nbr|no|id|ref)s?$|^exceptions?$|^exc(?:_?(?:no|num|nbr|id))?s?$/i; // a scalar
const EXC_COLLECTION_RE = /[Ee]xception|EXCEPTION|^(?:exc|EXC)(?:[_A-Z]|s?$)/; // a receiver / owner (EXCEPTION_RULES[5], EXC_RULES[5], excMap.get(5))
const REG_NAME_RE = /regulation_?ids?$|^article(?:_?id)?$|^citation$|unit_?ids?$|clause_?path$/i; // a by-law id column / variable
const DOTTED_RE = /^\d{1,3}(?:\.\d{1,3}){2,4}$/; // a bare article id (900.1.10, 10.20.40.70): an id only against a REG_NAME counterpart
const PARCEL_NAME_RE = /parcel_?ids?$|^pids?$/i;
const SQL_RE = /\bselect\b[\s\S]*\bfrom\b|\bupdate\s+[\w."]+\s+set\b|\bdelete\s+from\b|\binsert\s+into\b/i;
const LOG_SINK_RE = /^(?:(?:console|logger|log|Logger)\.\w+|logError|logWarn|logInfo|log|warn|(?:[A-Z]\w*)?Error)$/;
const SQL_CMP_TAIL_RE = /(?:=|<>|!=|\bin\s*\(\s*(?:'[^']*'\s*,\s*)*|\blike|\bilike|\bany\s*\(\s*array\s*\[\s*(?:'[^']*'\s*,\s*)*)\s*$/i;
const SQL_NUM_CMP_RE = /\b([A-Za-z_][\w.]*)\s*(?:=|<>|!=)\s*'?(\d+)\b/g;
const SQL_NUM_IN_RE = /\b([A-Za-z_][\w.]*)\s+in\s*\(([^)]*)\)/gi;
const EQ_OPS = new Set([ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken]);
const REL_OPS = new Set([ts.SyntaxKind.LessThanToken, ts.SyntaxKind.GreaterThanToken, ts.SyntaxKind.LessThanEqualsToken, ts.SyntaxKind.GreaterThanEqualsToken]);
const MAP_METHODS = new Set(['get', 'has', 'set', 'delete']);
const MEMBER_METHODS = new Set(['includes', 'indexOf', 'lastIndexOf']);
const STRING_MATCH_METHODS = new Set(['startsWith', 'endsWith']); // a prefix / suffix comparison
const SQL_WINDOW = 4000; // chars of SQL text before a quoted literal searched for its comparison operator (an IN list longer than this is missed)
const SQL_NUM_ANY_RE = /\b([A-Za-z_][\w.]*)\s*=\s*any\s*\(\s*array\s*\[([^\]]*)\]/gi;
const SQL_LEFT_CMP_RE = /^\s*(?:=|<>|!=)\s*[A-Za-z_]/;

const isRegulationText = (s) => REG_ID_RE.test(s) || ARTICLE_RE.test(s);

/** Kind implied by a column / variable name. */
function kindOfColumn(name, receiver = null, { collection = false } = {}) {
  if (!name) return null;
  if (EXC_NAME_RE.test(name) || (collection && EXC_COLLECTION_RE.test(name))) return 'exception_number_literal';
  if (PARCEL_NAME_RE.test(name)) return 'parcel_id_literal';
  if (name === 'id' && receiver && /parcel/i.test(receiver)) return 'parcel_id_literal';
  if (REG_NAME_RE.test(name)) return 'regulation_id_literal';
  return null;
}

const unwrap = (e) => {
  while (e && (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e) || ts.isTypeAssertionExpression(e) || ts.isSatisfiesExpression(e))) e = e.expression;
  return e;
};

/** {name, receiver} of an expression (the last name segment), for counterpart kinds. */
function nameOf(expr) {
  const e = unwrap(expr);
  if (!e) return { name: null, receiver: null };
  if (ts.isIdentifier(e)) return { name: e.text, receiver: null };
  if (ts.isPropertyAccessExpression(e)) return { name: e.name.text, receiver: nameOf(e.expression).name };
  if (ts.isElementAccessExpression(e) && ts.isStringLiteralLike(e.argumentExpression)) return { name: e.argumentExpression.text, receiver: nameOf(e.expression).name };
  if (ts.isElementAccessExpression(e)) return { name: nameOf(e.expression).name, receiver: null }; // parcels[0] → parcels
  if (ts.isCallExpression(e)) {
    if (ts.isIdentifier(e.expression) && e.arguments.length) return nameOf(e.arguments[0]); // Number(x), String(x), parseInt(x)
    return nameOf(e.expression);
  }
  return { name: null, receiver: null };
}
const counterpartKind = (expr, opts) => {
  const n = nameOf(expr);
  return kindOfColumn(n.name, n.receiver, opts);
};
const COLL = { collection: true };

/** The text of a string-like literal (template substitutions → U+0000), or null. */
function textOf(node) {
  const n = unwrap(node);
  if (!n) return null;
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text;
  if (ts.isTemplateExpression(n)) return n.head.text + n.templateSpans.map((s) => `\u0000${s.literal.text}`).join('');
  return null;
}

/**
 * A positive integer literal's source text, or null. A negative number is a PrefixUnaryExpression, never a
 * NumericLiteral, so it never reaches here as one (sentinel by construction). Separators are allowed (1_234_567).
 */
function intOf(node) {
  const n = unwrap(node);
  if (!n) return null;
  if (ts.isNumericLiteral(n)) {
    const v = Number(n.text.replace(/_/g, ''));
    return Number.isInteger(v) && v > 0 ? n.getText() : null; // the source spelling (n.text drops separators)
  }
  const t = textOf(n);
  return t !== null && /^[1-9]\d*$/.test(t) ? t : null;
}

/** Classify one literal node given its counterpart kind (null = no id-named counterpart). → {kind, literal} | null */
function classifyLiteral(node, cpKind, { numeric = true, prefix = false } = {}) {
  if (prefix) {
    const t0 = textOf(node);
    if (t0 !== null && cpKind === 'regulation_id_literal' && /^\d{1,3}(?:\.\d{1,3}){1,4}/.test(t0)) return { kind: cpKind, literal: t0 };
  }
  const t = textOf(node);
  if (t !== null) {
    if (isRegulationText(t)) return { kind: 'regulation_id_literal', literal: t.replace(/\u0000/g, '${…}') };
    if (EXC_WHOLE_RE.test(t)) return { kind: 'exception_number_literal', literal: t };
    if (cpKind === 'regulation_id_literal' && DOTTED_RE.test(t)) return { kind: cpKind, literal: t };
  }
  if (numeric && cpKind && cpKind !== 'regulation_id_literal') {
    const v = intOf(node);
    if (v !== null) return { kind: cpKind, literal: v };
  }
  return null;
}

// ---------------------------------------------------------------- the AST walk

function scriptKind(rel) {
  if (rel.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (/\.[mc]?ts$/.test(rel)) return ts.ScriptKind.TS;
  if (rel.endsWith('.jsx')) return ts.ScriptKind.JSX;
  return ts.ScriptKind.JS;
}

/** Names of the enclosing declarations (function, method, accessor, class field, variable, property), innermost first. */
function enclosingNames(node) {
  const out = [];
  for (let p = node.parent; p; p = p.parent) {
    const named = ts.isFunctionDeclaration(p) || ts.isMethodDeclaration(p) || ts.isGetAccessorDeclaration(p) || ts.isSetAccessorDeclaration(p)
      || ts.isPropertyDeclaration(p) || ts.isVariableDeclaration(p) || ts.isPropertyAssignment(p);
    if (named && p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) out.push(p.name.text);
  }
  return out;
}

/** Owner name of an object literal (the variable / property / assignment target it is bound to). */
function ownerName(obj) {
  const p = obj.parent;
  if (!p) return null;
  if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return p.name.text;
  if (ts.isPropertyAssignment(p) && p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) return p.name.text;
  if (ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.EqualsToken) return nameOf(p.left).name;
  if (ts.isCallExpression(p) && p.parent) return ownerName(p); // Object.freeze({...}) / deepFreeze({...})
  return null;
}

/** Elements of a constructor `new Set([…])` / `new Map([…])`, or null. */
function ctorArray(e, ctor) {
  const n = unwrap(e);
  if (n && ts.isNewExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === ctor && n.arguments && n.arguments[0] && ts.isArrayLiteralExpression(unwrap(n.arguments[0]))) return unwrap(n.arguments[0]).elements;
  return null;
}

/** A string that is (part of) an argument of a log / error call or constructor is a message (never executable). */
function inLogSink(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isCallExpression(p) || ts.isNewExpression(p)) {
      const callee = p.expression;
      const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? `${nameOf(callee.expression).name || ''}.${callee.name.text}` : '';
      return LOG_SINK_RE.test(name);
    }
    if (ts.isBlock(p) || ts.isSourceFile(p) || ts.isVariableDeclaration(p) || ts.isReturnStatement(p)) return false;
  }
  return false;
}

/**
 * Sound pre-filter: every hit needs an id-shaped text (regex sources are compared unescaped) or an id-named counterpart,
 * so a file whose backslash-stripped text matches neither cannot hit and is not parsed.
 */
const PREFILTER_RE = /(?<![\d.])\d{1,3}(?:\.\d{1,3}){1,4}(?:\(\d{1,4}[A-Za-z]?\)|#article)|regulation_?ids?|article|citation|unit_?ids?|clause_?path|['"`(]x\d{1,4}\b|exception|\bexc(?:_?(?:no|num|nbr|id))?s?\b|parcel_?ids?\b|\bpids?\b/i;
export const mayHit = (text) => {
  if (/\\[ux]/.test(text)) return true; // an escaped character could cook into an id shape: always parse
  const t = text.replace(/\\/g, '');
  return PREFILTER_RE.test(t) || /\b(?:exc|EXC)[_A-Z]/.test(t) || (/parcel/i.test(t) && /\bid\b/.test(t)); // EXC_RULES / excMap; parcel-named receiver of .id
};

/** Scan one source file. PURE. */
export function scanSource(rel, text) {
  if (!mayHit(text)) return [];
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, scriptKind(rel));
  const hits = [];
  for (const d of sf.parseDiagnostics || []) {
    const line = sf.getLineAndCharacterOfPosition(d.start || 0).line + 1;
    hits.push({ line, kind: 'source_unparsed', position: null, literal: ts.flattenDiagnosticMessageText(d.messageText, ' '), via: null, fn: [] });
  }
  const seen = new Set();
  // const aliases: name → initializer (a name declared twice is ambiguous and not followed)
  const consts = new Map();
  const dup = new Set();
  const collect = (n) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && n.parent && ts.isVariableDeclarationList(n.parent) && (n.parent.flags & ts.NodeFlags.Const)) {
      if (consts.has(n.name.text)) dup.add(n.name.text);
      consts.set(n.name.text, n.initializer);
    }
    ts.forEachChild(n, collect);
  };
  collect(sf);
  const resolve = (e) => {
    const n = unwrap(e);
    if (n && ts.isIdentifier(n) && consts.has(n.text) && !dup.has(n.text)) return unwrap(consts.get(n.text));
    return null;
  };

  const lineOf = (node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  const push = (at, node, position, c, via = null) => {
    if (!c) return;
    const key = `${position}|${node.pos}|${node.end}|${at.pos}`;
    if (seen.has(key)) return;
    seen.add(key);
    hits.push({ line: lineOf(at), kind: c.kind, position, literal: c.literal, via, fn: enclosingNames(at) });
  };
  /** A literal, or a const alias to one, at `at`. */
  const check = (at, node, position, cpKind, opts) => {
    const direct = classifyLiteral(node, cpKind, opts);
    if (direct) return push(at, node, position, direct);
    const r = resolve(node);
    if (r) push(at, r, position, classifyLiteral(r, cpKind, opts), 'const_alias');
  };
  /** Elements of an array literal / a const alias to one. */
  const checkElements = (at, recv, position, cpKind) => {
    const n = unwrap(recv);
    if (n && ts.isArrayLiteralExpression(n)) {
      for (const el of n.elements) push(el, el, position, classifyLiteral(el, cpKind));
      return;
    }
    const r = resolve(recv);
    if (r && ts.isArrayLiteralExpression(r)) for (const el of r.elements) push(at, el, position, classifyLiteral(el, cpKind), 'const_alias');
  };
  const sql = (node) => {
    const t = textOf(node);
    if (t === null || !SQL_RE.test(t)) return;
    const quoted = /'([^']*)'/g;
    let m;
    while ((m = quoted.exec(t))) {
      if (!isRegulationText(m[1]) && !EXC_PART_RE.test(m[1]) && !EXC_WHOLE_RE.test(m[1])) continue;
      const left = SQL_CMP_TAIL_RE.test(t.slice(Math.max(0, m.index - SQL_WINDOW), m.index));
      if (!left && !SQL_LEFT_CMP_RE.test(t.slice(m.index + m[0].length))) continue;
      const kind = isRegulationText(m[1]) ? 'regulation_id_literal' : 'exception_number_literal';
      pushSql(node, kind, m[1], m.index);
    }
    for (const mm of t.matchAll(SQL_NUM_CMP_RE)) {
      const col = mm[1].split('.').pop();
      const k = kindOfColumn(col, mm[1].includes('.') ? mm[1].split('.')[0] : null);
      if (k && k !== 'regulation_id_literal' && Number(mm[2]) > 0) pushSql(node, k, mm[2], mm.index); // numeric kinds only
    }
    for (const re of [SQL_NUM_IN_RE, SQL_NUM_ANY_RE]) for (const mm of t.matchAll(re)) {
      const col = mm[1].split('.').pop();
      const k = kindOfColumn(col, mm[1].includes('.') ? mm[1].split('.')[0] : null);
      if (!k || k === 'regulation_id_literal') continue; // quoted ids are the loop above
      const listAt = mm.index + Math.max(mm[0].lastIndexOf('('), mm[0].lastIndexOf('[')) + 1;
      let at = 0;
      for (const raw of mm[2].split(',')) {
        const v = raw.trim().replace(/^'|'$/g, '');
        if (/^[1-9]\d*$/.test(v)) pushSql(node, k, v, listAt + at);
        at += raw.length + 1;
      }
    }
  };
  const pushSql = (node, kind, literal, offset) => {
    const key = `sql|${node.pos}|${offset}|${literal}`;
    if (seen.has(key)) return;
    seen.add(key);
    const t = textOf(node) || '';
    hits.push({ line: lineOf(node) + (t.slice(0, offset).match(/\n/g) || []).length, kind, position: 'sql_compare', literal, via: null, fn: enclosingNames(node) });
  };

  const visit = (n) => {
    if (ts.isBinaryExpression(n)) {
      const op = n.operatorToken.kind;
      if (EQ_OPS.has(op) || REL_OPS.has(op)) {
        check(n, n.left, 'comparison', counterpartKind(n.right));
        check(n, n.right, 'comparison', counterpartKind(n.left));
      } else if (op === ts.SyntaxKind.InKeyword) {
        check(n, n.left, 'key_lookup', counterpartKind(n.right, COLL));
      }
    } else if (ts.isCaseClause(n)) {
      const sw = n.parent && n.parent.parent;
      check(n, n.expression, 'switch_case', sw && ts.isSwitchStatement(sw) ? counterpartKind(sw.expression) : null);
    } else if (ts.isElementAccessExpression(n)) {
      check(n, n.argumentExpression, 'key_lookup', counterpartKind(n.expression, COLL));
    } else if ((ts.isPropertyAssignment(n) || ts.isMethodDeclaration(n) || ts.isGetAccessorDeclaration(n) || ts.isSetAccessorDeclaration(n) || ts.isPropertyDeclaration(n)) && n.name && n.parent && (ts.isObjectLiteralExpression(n.parent) || ts.isClassLike(n.parent))) {
      const nm = ts.isComputedPropertyName(n.name) ? n.name.expression : n.name;
      const cp = kindOfColumn(ts.isObjectLiteralExpression(n.parent) ? ownerName(n.parent) : n.parent.name ? n.parent.name.text : null, null, COLL);
      if (ts.isStringLiteral(nm) || ts.isNumericLiteral(nm) || ts.isNoSubstitutionTemplateLiteral(nm)) push(n, nm, 'object_key', classifyLiteral(nm, cp));
      else if (ts.isComputedPropertyName(n.name)) check(n, nm, 'object_key', cp); // [ID]: a const alias
    } else if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
      const method = n.expression.name.text;
      const recv = n.expression.expression;
      const arg = n.arguments[0];
      if (MAP_METHODS.has(method) && arg) {
        check(n, arg, 'map_key', counterpartKind(recv, COLL)); // a const Set's elements are hit where it is built
      }
      if (STRING_MATCH_METHODS.has(method) && arg) check(n, arg, 'comparison', counterpartKind(recv), { prefix: true });
      if (MEMBER_METHODS.has(method) && arg) {
        check(n, arg, 'array_membership', counterpartKind(recv));
        checkElements(n, recv, 'array_membership', counterpartKind(arg));
      }
    } else if (ts.isNewExpression(n) && ts.isIdentifier(n.expression)) {
      const els = ctorArray(n, n.expression.text);
      if (els && n.expression.text === 'Set') for (const el of els) push(el, el, 'array_membership', classifyLiteral(el, kindOfColumn(ownerName(n), null, COLL)));
      if (els && n.expression.text === 'Map') {
        for (const el of els) {
          const pair = unwrap(el);
          if (pair && ts.isArrayLiteralExpression(pair) && pair.elements[0]) push(pair.elements[0], pair.elements[0], 'map_key', classifyLiteral(pair.elements[0], kindOfColumn(ownerName(n), null, COLL)));
        }
      }
      if (n.expression.text === 'RegExp' && n.arguments && n.arguments[0]) regexText(n, n.arguments[0]);
    }
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'RegExp' && n.arguments[0]) regexText(n, n.arguments[0]);
    if (ts.isRegularExpressionLiteral(n)) {
      const src = n.text.slice(1, n.text.lastIndexOf('/'));
      regexSource(n, src);
    }
    if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateExpression(n)) && !inLogSink(n)) sql(n);
    ts.forEachChild(n, visit);
  };
  const regexSource = (at, src) => {
    const un = src.replace(/\\(.)/g, '$1');
    if (isRegulationText(un)) push(at, at, 'regex', { kind: 'regulation_id_literal', literal: src });
    else if (EXC_PART_RE.test(un)) push(at, at, 'regex', { kind: 'exception_number_literal', literal: src });
  };
  const regexText = (at, arg) => {
    const t = textOf(arg);
    if (t !== null) regexSource(at, t);
  };
  visit(sf);
  const cmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0); // code-unit order, never a locale API (Spec 68 §10)
  return hits.sort((a, b) => a.line - b.line || cmp(a.position, b.position) || cmp(String(a.literal), String(b.literal)));
}

// ---------------------------------------------------------------- scope, allow-list, the gate

const ruleMatches = (r, rel) => (r.path ? r.path === rel : rel.startsWith(r.prefix));

/** First matching scope rule. PURE. */
export function classify(rel, scope = SCOPE_RULES) {
  const rule = scope.find((r) => ruleMatches(r, rel));
  return rule ? { mode: rule.mode, reason: rule.reason, rule } : null;
}

function scopeViolations(scope, files) {
  const v = [];
  for (const [i, r] of scope.entries()) {
    const keys = Object.keys(r).filter((k) => !['path', 'prefix', 'mode', 'reason'].includes(k));
    if (!SCOPE_MODES.includes(r.mode) || !SCOPE_REASONS.includes(r.reason) || REASON_MODE[r.reason] !== r.mode || Boolean(r.path) === Boolean(r.prefix) || keys.length) {
      v.push(`scope_rule_invalid: rule ${i} ${JSON.stringify(r)} (mode ∈ ${SCOPE_MODES.join('|')}, reason ∈ SCOPE_REASONS with its own mode, exactly one of path|prefix)`);
    } else if (r.path && !files.has(r.path)) v.push(`scope_rule_orphan: rule ${i} path ${r.path} is not a file in the tree (remove it from the list)`);
  }
  return v;
}

function allowEntryProblem(e, scope) {
  if (!e || typeof e !== 'object' || Array.isArray(e)) return 'not an object';
  const keys = Object.keys(e);
  if (keys.some((k) => !['path', 'function', 'reason', 'note'].includes(k))) return `unknown key (${keys.join(',')})`;
  if (typeof e.path !== 'string' || !e.path) return 'no path';
  if (!ALLOW_REASONS.includes(e.reason)) return `reason ${JSON.stringify(e.reason)} is not one of ${ALLOW_REASONS.join('|')}`;
  if (typeof e.note !== 'string' || !e.note.trim()) return 'no note';
  if (e.function !== undefined && (typeof e.function !== 'string' || !e.function)) return 'function must be a non-empty name';
  const c = classify(e.path, scope);
  if (!c || c.mode !== 'blocking') return `path ${e.path} is not in blocking scope (${c ? c.mode : 'unscoped'})`;
  return null;
}

/** The gate. sources: {relPath: text}. PURE. */
export function checkExcLit({ sources, scope = SCOPE_RULES, allow = ALLOW_LIST }) {
  const files = new Set(Object.keys(sources));
  const violations = [...scopeViolations(scope, files)];
  const allowState = allow.map((e) => ({ e, problem: allowEntryProblem(e, scope), used: 0 }));
  for (const [i, a] of allowState.entries()) if (a.problem) violations.push(`allow_entry_invalid: entry ${i} ${JSON.stringify(a.e)}: ${a.problem}`);
  const findings = [];
  const fileCounts = { blocking: 0, excluded: 0, report_only: 0, unscoped: 0 };
  let unparsed = 0; // parse diagnostics in report-only files (counted, never failing)
  for (const rel of [...files].sort()) {
    const c = classify(rel, scope);
    if (!c || !SCOPE_MODES.includes(c.mode)) {
      fileCounts.unscoped++;
      violations.push(`scope_rule_invalid: no valid scope rule matches ${rel} (fail closed)`);
      continue;
    }
    fileCounts[c.mode]++;
    if (c.mode === 'excluded') continue;
    for (const h of scanSource(rel, sources[rel])) {
      if (h.kind === 'source_unparsed') {
        if (c.mode === 'blocking') violations.push(`source_unparsed: ${rel}:${h.line} ${h.literal}`);
        else unparsed++;
        continue;
      }
      const a = c.mode === 'blocking' ? allowState.find((x) => !x.problem && x.e.path === rel && (x.e.function === undefined || h.fn.includes(x.e.function))) : undefined;
      if (a) a.used++;
      findings.push({ file: rel, ...h, mode: c.mode, allowed: Boolean(a), allow_reason: a ? a.e.reason : null });
    }
  }
  if (fileCounts.blocking === 0) violations.push('scope_rule_orphan: no file is in blocking scope (the gate would pass vacuously)');
  for (const [i, a] of allowState.entries()) if (!a.problem && a.used === 0) violations.push(`allow_entry_orphan: entry ${i} ${a.e.path}${a.e.function ? `#${a.e.function}` : ''} silences no hit (remove it)`);
  for (const f of findings) {
    if (f.mode === 'blocking' && !f.allowed) violations.push(`${f.kind}: ${f.file}:${f.line} ${f.position} ${JSON.stringify(f.literal)}${f.via ? ` via ${f.via}` : ''}`);
  }
  const tally = (key) => Object.fromEntries([...new Set(findings.map((f) => f[key]))].sort().map((k) => [k, findings.filter((f) => f[key] === k).length]));
  return {
    pass: violations.length === 0,
    checked: fileCounts.blocking + fileCounts.report_only,
    violations,
    findings,
    counts: {
      files: fileCounts,
      blocking: findings.filter((f) => f.mode === 'blocking' && !f.allowed).length,
      report_only: findings.filter((f) => f.mode === 'report_only').length,
      allowed: findings.filter((f) => f.allowed).length,
      report_only_unparsed: unparsed,
      by_kind: tally('kind'),
      by_position: tally('position'),
    },
  };
}

const CODE_EXT = /\.(?:js|mjs|cjs|ts|mts|cts|tsx|jsx)$/;

/** Every code file under scripts/ and src/ (no node_modules, no dot-dirs), sorted, '/'-separated. */
export function loadSources(root) {
  const out = {};
  const walk = (dir) => {
    for (const ent of fs.readdirSync(path.join(root, dir), { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      if (ent.name === 'node_modules' || ent.name.startsWith('.')) continue;
      const rel = `${dir}/${ent.name}`;
      if (ent.isDirectory()) walk(rel);
      else if (ent.isFile() && CODE_EXT.test(ent.name) && !/\.d\.[mc]?ts$/.test(ent.name)) out[rel] = fs.readFileSync(path.join(root, rel), 'utf8');
    }
  };
  for (const top of ['scripts', 'src']) if (fs.existsSync(path.join(root, top))) walk(top);
  return out;
}

export function checkTree({ root }) {
  return checkExcLit({ sources: loadSources(root) });
}

/** Deterministic text report: summary line, then every finding (blocking first). LF. */
export function renderReport(r) {
  const c = r.counts;
  const lines = [`G-EXC-LIT: ${r.pass ? 'PASS' : 'FAIL'} · blocking ${c.blocking} · report_only ${c.report_only} · allowed ${c.allowed} · files ${r.checked}`];
  lines.push(`  files scanned ${r.checked} = blocking ${c.files.blocking} + report_only ${c.files.report_only} · excluded ${c.files.excluded} · unscoped ${c.files.unscoped}`);
  lines.push(`  by kind: ${JSON.stringify(c.by_kind)} · by position: ${JSON.stringify(c.by_position)}`);
  for (const v of r.violations) lines.push(`  violation ${v}`);
  const order = { blocking: 0, report_only: 1 };
  const sorted = [...r.findings].sort((a, b) => order[a.mode] - order[b.mode] || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0) || a.line - b.line);
  for (const f of sorted) lines.push(`  ${f.mode}${f.allowed ? `(allowed:${f.allow_reason})` : ''} ${f.file}:${f.line} ${f.kind} ${f.position} ${JSON.stringify(f.literal)}${f.via ? ` via ${f.via}` : ''}${f.fn.length ? ` within ${f.fn[0]}` : ''}`);
  return `${lines.join('\n')}\n`;
}

// ---------------------------------------------------------------- self-test

/** Every reason code and every position: one known-bad that fires it and a good twin that does not. PURE. */
export function selfTest() {
  const results = [];
  const BY = 'scripts/analysis/bylaw/fx.mjs';
  const kinds = (src) => scanSource(BY, src).map((h) => `${h.kind}@${h.position}`);
  const t = (covers, twin, name, ok) => results.push({ covers, twin, name, ok: Boolean(ok) });
  const POS = {
    comparison: ["if (id === '10.20.40.70(1)') f();", "log('10.20.40.70(1)');"],
    switch_case: ["switch (id) { case '10.20.40.70(1)': f(); }", "switch (id) { case 'a': log('10.20.40.70(1)'); }"],
    key_lookup: ["h = H['10.20.40.70(1)'];", "h = H.a; // H['10.20.40.70(1)']"],
    object_key: ["const H = { '10.20.40.70(1)': 1 };", "const H = { a: '10.20.40.70(1)' };"],
    map_key: ["m.get('10.20.40.70(1)');", "m.get(k, '10.20.40.70(1)');"],
    array_membership: ["['10.20.40.70(1)'].includes(id);", "const a = ['10.20.40.70(1)']; a.map(f);"],
    regex: ['/10\\.20\\.40\\.70\\(1\\)/.test(t);', '/\\d+\\.\\d+\\(\\d+\\)/.test(t);'],
    sql_compare: ["q(`SELECT 1 FROM t WHERE regulation_id = '10.20.40.70(1)'`);", "q(`SELECT regulation_id FROM t WHERE regulation_id = $1`, ['10.20.40.70(1)']);"],
  };
  for (const [pos, [bad, good]] of Object.entries(POS)) {
    t(pos, 'bad', `${pos}: known-bad fires`, kinds(bad).includes(`regulation_id_literal@${pos}`));
    t(pos, 'good', `${pos}: good twin is silent`, kinds(good).length === 0);
  }
  const KIND = {
    regulation_id_literal: ["if (u.unit_id === '900.3.10(5)#SSP(A)') f();", "throw new Error('900.3.10(5) unresolved');"],
    exception_number_literal: ['if (r.exception_number === 812) f();', 'if (r.exception_number != null && r.storeys === 812) f();'],
    parcel_id_literal: ["if (p.parcel_id === '1234567') f();", "q('SELECT * FROM parcels WHERE parcel_id = $1', [id]);"],
  };
  for (const [k, [bad, good]] of Object.entries(KIND)) {
    t(k, 'bad', `${k}: known-bad fires`, kinds(bad).some((x) => x.startsWith(`${k}@`)));
    t(k, 'good', `${k}: good twin is silent`, kinds(good).length === 0);
  }
  // structural codes, on a minimal tree with its own scope
  const scope = [{ prefix: 'scripts/analysis/bylaw/', mode: 'blocking', reason: 'mcbylaw_module' }, { prefix: 'src/', mode: 'report_only', reason: 'legacy_code_m25_hold' }];
  const SRC = "export function selfTest() { return x === '800.50(290)'; }";
  const run = (o) => checkExcLit({ sources: { [BY]: SRC, 'src/a.ts': '', ...(o.sources || {}) }, scope: o.scope || scope, allow: o.allow || [] });
  const has = (r, code) => r.violations.some((v) => v.startsWith(`${code}:`));
  const okEntry = { path: BY, function: 'selfTest', reason: 'self_test_fixture', note: 'fixture' };
  t('allow_entry_invalid', 'bad', 'allow: reason outside the closed set', has(run({ allow: [{ ...okEntry, reason: 'because' }] }), 'allow_entry_invalid'));
  t('allow_entry_invalid', 'good', 'allow: a well-formed entry is valid and silences its hit', (() => { const r = run({ allow: [okEntry] }); return r.pass && r.counts.allowed === 1; })());
  t('allow_entry_orphan', 'bad', 'allow: an entry that silences nothing', has(run({ allow: [{ ...okEntry, function: 'other' }] }), 'allow_entry_orphan'));
  t('allow_entry_orphan', 'good', 'allow: removing the entry re-exposes the hit (direction 1)', (() => { const r = run({}); return !r.pass && has(r, 'regulation_id_literal') && !has(r, 'allow_entry_orphan'); })());
  t('scope_rule_invalid', 'bad', 'scope: mode outside the closed set', has(run({ scope: [{ prefix: 'src/', mode: 'sometimes', reason: 'test_suite' }] }), 'scope_rule_invalid'));
  t('scope_rule_invalid', 'good', 'scope: closed rules are valid', !has(run({ allow: [okEntry] }), 'scope_rule_invalid'));
  t('scope_rule_orphan', 'bad', 'scope: an explicit path with no file', has(run({ scope: [...scope, { path: 'scripts/gone.js', mode: 'report_only', reason: 'legacy_code_m25_hold' }] }), 'scope_rule_orphan'));
  t('scope_rule_orphan', 'good', 'scope: an explicit path that exists', !has(run({ allow: [okEntry], sources: { 'scripts/here.js': '' }, scope: [...scope, { path: 'scripts/here.js', mode: 'report_only', reason: 'legacy_code_m25_hold' }] }), 'scope_rule_orphan'));
  // the split: the same literal is report-only in legacy scope, blocking in McBylaw scope
  const split = run({ allow: [okEntry], sources: { 'src/a.ts': "if (x === '10.20.40.70(1)') f();" } });
  t('scope_split', 'good', 'split: a legacy hit is counted, never failing', split.pass && split.counts.report_only === 1);
  t('scope_rule_invalid', 'bad', 'scope: a reason paired with another mode (legacy code excluded)', has(run({ scope: [...scope.slice(0, 1), { prefix: 'src/', mode: 'excluded', reason: 'legacy_code_m25_hold' }] }), 'scope_rule_invalid'));
  t('scope_rule_invalid', 'bad', 'scope: a file no rule matches fails closed', has(run({ sources: { 'tools/x.js': '' } }), 'scope_rule_invalid'));
  const BROKEN = 'scripts/analysis/bylaw/broken.mjs';
  t('source_unparsed', 'bad', 'a blocking file that does not parse fails (never half-scanned)', has(run({ allow: [okEntry], sources: { [BROKEN]: "const a = ; if (x === '10.20.40.70(1)') f();" } }), 'source_unparsed'));
  t('source_unparsed', 'good', 'the same file, parseable, is scanned', (() => { const r = run({ allow: [okEntry], sources: { [BROKEN]: "const a = 1; log('10.20.40.70(1)');" } }); return r.pass; })());
  t('regulation_id_literal', 'bad', 'a bare article id against a regulation-named counterpart', kinds("if (row.regulation_id === '900.1.10') f();").includes('regulation_id_literal@comparison'));
  t('regulation_id_literal', 'bad', 'a prefix branch on a regulation id', kinds("if (u.unit_id.startsWith('10.20.40.70')) f();").includes('regulation_id_literal@comparison'));
  t('regulation_id_literal', 'good', 'a dotted version / address against a non-id name', kinds("if (v.version === '1.2.3' || host === '127.0.0.1') f();").length === 0);
  // the shipped scope classifies representative paths as declared (a reordered or widened rule cannot pass silently)
  const PINNED = { 'scripts/analysis/bylaw/x.mjs': 'blocking', 'scripts/generate-bylaw-provisions.mjs': 'blocking', 'scripts/lib/compute/new-step.js': 'blocking', 'scripts/lib/compute/enrich-parcels.js': 'report_only', 'scripts/lib/max-build.js': 'report_only', 'src/lib/x.ts': 'report_only', 'src/tests/x.test.ts': 'excluded' };
  for (const [rel, mode] of Object.entries(PINNED)) t('shipped_scope', 'good', `shipped scope: ${rel} → ${mode}`, (classify(rel) || {}).mode === mode);
  t('shipped_scope', 'good', 'shipped scope rules are valid', scopeViolations(SCOPE_RULES, new Set(SCOPE_RULES.filter((r) => r.path).map((r) => r.path))).length === 0);
  // coverage of the closed sets, both directions (Spec 68 §9: every reason code has a known-bad and a good twin)
  const named = new Set([...REASON_CODES, ...POSITIONS]);
  for (const code of named) for (const twin of ['bad', 'good']) {
    if (!results.some((r) => r.covers === code && r.twin === twin)) results.push({ covers: code, twin, name: `coverage: ${code} has no ${twin} fixture`, ok: false });
  }
  for (const r of results) if (!named.has(r.covers) && !['scope_split', 'shipped_scope'].includes(r.covers)) r.ok = false;
  return { pass: results.every((r) => r.ok), results };
}
