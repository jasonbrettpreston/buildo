// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §9 G-CODE (i)(ii)(iv), §6 `code_refs`, §6.3 (model heuristics),
//            §6.5 `feeds` (G-CODE cross-check), §6.4 rule 8 (code parsed by static AST, never executed), §10 stage 8,
//            §8 rule 8 (module shape: check…() → {pass, violations, checked} + selfTest());
//            docs/specs/01-pipeline/69_mcbylaw_policy.md M-11, M-22, M-32 note, M-46, M-52; docs/reports/mcbylaw-phase1-plan.md S9
//
// ACCURATE word, G-CODE. Code linkage is DECLARED-ONLY in Phase 1: a ref is shown to exist and a declared constant
// is compared, never executed against the table (Spec 68 §5, §14 item 4).
//
// A code_ref is one of (Spec 68 §6): `table.column` (resolved in src/lib/db/generated/schema.ts ∪ the Column Detail
// of docs/specs/00-architecture/01_database_schema.md) · `module#dotted.member` (resolved by the typescript compiler
// API; the module path must lie under vocab.code_roots) · a logic variable key (scripts/seeds/logic_variables.json).
// An entry is a string or `{ref, expects}`; `expects` is the value the code should hold, in the code's own unit.
//
// Arms:
//   (i)  BLOCKING — reason codes REASON_CODES_I (one known-bad fixture each in selfTest()).
//   (ii) report-only — `expects_mismatch`: the live constant differs from `expects` (M-11, M-22).
//   (iv) report-only — every named numeric constant in the root modules is by-law · heuristic · unmapped (M-46);
//        `unmapped_constant` is a counted finding. A comment-derived `proposed` class is shown for the operator's
//        S9 confirmation only; it never sets the class.
//   feeds report-only — a modelled unit's refs lie in a module registered for its (structure, aspect) pair (M-52).
// A report-only arm never changes `pass` (fixture).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import { sha256 } from './snapshot.mjs';

export const CODE_LINK_VERSION = 1;
export const SCHEMA_TS = 'src/lib/db/generated/schema.ts';
export const SCHEMA_DOC = 'docs/specs/00-architecture/01_database_schema.md';
export const LOGIC_VARS = 'scripts/seeds/logic_variables.json';
export const FINDINGS_PATH = 'docs/reference/bylaw-code-findings.md';

/**
 * PROPOSED `vocab.code_roots` (S5 owns vocab.json). The max-build / envelope / zoning compute modules of Specs 65/67,
 * 78 and 88. Used by the report only while vocab.json carries no `code_roots`, and the report says so.
 */
export const PROPOSED_CODE_ROOTS = Object.freeze([
  'scripts/lib/build-norms.js',
  'scripts/lib/compute/enrich-parcels.js',
  'scripts/lib/max-build.js',
  'scripts/lib/optimal-config.js',
  'scripts/lib/parcel-cost.js',
  'scripts/lib/zoning-precedence.js',
]);

export const REASON_CODES_I = Object.freeze([
  'banned_code_ref',
  'constant_without_expects',
  'malformed_code_ref',
  'modelled_without_code_ref',
  'ref_outside_code_roots',
  'unparseable_code_file',
  'unresolved_code_ref',
]);
export const REPORT_CODES = Object.freeze([
  'code_root_missing',
  'constant_double_classified',
  'expects_mismatch',
  'expects_unverifiable',
  'feeds_pair_unregistered',
  'feeds_ref_outside_registry',
  'unmapped_constant',
  'unparseable_code_file',
  'unresolved_code_ref_unmodelled',
]);
export const HEURISTIC_REASONS = Object.freeze([
  'data_cleaning_bound',
  'modelling_assumption',
  'proxy_for_unmodelled_rule',
  'statistical_default',
  'tolerance',
]);

const EPS = 1e-9;
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const toPosix = (p) => p.split(path.sep).join('/');

// ---------------------------------------------------------------- context: the three ref universes

/** Columns from the drizzle schema.ts: pgTable("t", { prop: type("col", …)… }) — the column is the root call's string arg, else the prop. */
function schemaTsColumns(text) {
  const out = new Map();
  const sf = ts.createSourceFile('schema.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const visit = (node) => {
    if (ts.isCallExpression(node) && node.arguments.length >= 2) {
      const callee = node.expression;
      const isTable = (ts.isIdentifier(callee) && callee.text === 'pgTable') || (ts.isPropertyAccessExpression(callee) && callee.name.text === 'table');
      const [nameArg, colsArg] = node.arguments;
      if (isTable && ts.isStringLiteral(nameArg) && ts.isObjectLiteralExpression(colsArg)) {
        const cols = out.get(nameArg.text) || new Set();
        for (const prop of colsArg.properties) {
          if (!ts.isPropertyAssignment(prop)) continue;
          let call = prop.initializer;
          while (ts.isCallExpression(call) && ts.isPropertyAccessExpression(call.expression) && ts.isCallExpression(call.expression.expression)) {
            call = call.expression.expression;
          }
          const first = ts.isCallExpression(call) ? call.arguments[0] : undefined;
          cols.add(first && ts.isStringLiteral(first) ? first.text : prop.name.getText(sf));
        }
        out.set(nameArg.text, cols);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/** Columns from the schema doc's `### Column Detail` section only (`#### \`table\`` then `| \`col\` |` rows). */
function schemaDocColumns(text) {
  const out = new Map();
  let inDetail = false;
  let table = null;
  for (const line of text.split('\n')) {
    if (/^### /.test(line)) {
      inDetail = /^### Column Detail\s*$/.test(line.trimEnd());
      table = null;
      continue;
    }
    if (!inDetail) continue;
    const t = /^#### `([a-z0-9_]+)`/.exec(line);
    if (t) {
      table = t[1];
      if (!out.has(table)) out.set(table, new Set());
      continue;
    }
    const c = /^\| `([a-z0-9_]+)` \|/.exec(line);
    if (c && table) out.get(table).add(c[1]);
  }
  return out;
}

const readIf = (abs) => (fs.existsSync(abs) && fs.statSync(abs).isFile() ? fs.readFileSync(abs, 'utf8') : null);

/** A structural input defect (unparseable JSON input): the caller exits 2 naming the input (Spec 68 §9). */
export class CodeLinkError extends Error {}

/** JSON.parse that names the input on failure. */
export function parseJsonInput(text, label) {
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new CodeLinkError(`G-CODE: ${label} is not valid JSON (${err.message})`);
  }
}

/** Loads the column and logic-variable universes once; modules are parsed lazily and cached. */
export function createContext({ root }) {
  const tsText = readIf(path.join(root, SCHEMA_TS));
  const docText = readIf(path.join(root, SCHEMA_DOC));
  const lvText = readIf(path.join(root, LOGIC_VARS));
  const logicVars = lvText == null ? {} : parseJsonInput(lvText, LOGIC_VARS);
  if (!logicVars || typeof logicVars !== 'object' || Array.isArray(logicVars)) throw new CodeLinkError(`G-CODE: ${LOGIC_VARS} is not an object of variables`);
  return {
    root,
    columnsTs: tsText == null ? new Map() : schemaTsColumns(tsText),
    columnsDoc: docText == null ? new Map() : schemaDocColumns(docText.replace(/\r\n/g, '\n')),
    logicVars,
    inputs: { [SCHEMA_TS]: tsText, [SCHEMA_DOC]: docText, [LOGIC_VARS]: lvText },
    modules: new Map(),
  };
}

// ---------------------------------------------------------------- code_ref parsing

const COLUMN_RE = /^([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)$/;
const LOGIC_RE = /^[a-z_][a-z0-9_]*$/;
const MEMBER_RE = /^((?:scripts|src)\/[A-Za-z0-9_./-]+\.(?:js|mjs|cjs|ts))#([A-Za-z_$][\w$]*(?:\.[\w$]+)*)$/;

/** PURE. String or {ref, expects} → {kind: column|member|logic_variable|malformed, …}. */
export function parseCodeRef(entry) {
  const isObj = entry && typeof entry === 'object' && !Array.isArray(entry);
  const ref = isObj ? entry.ref : entry;
  const hasExpects = isObj && Object.prototype.hasOwnProperty.call(entry, 'expects');
  const label = typeof ref === 'string' ? ref : JSON.stringify(entry);
  if (typeof ref !== 'string') return { kind: 'malformed', ref: label, reason: 'no ref string' };
  if (hasExpects && (typeof entry.expects !== 'number' || !Number.isFinite(entry.expects))) {
    return { kind: 'malformed', ref, reason: 'expects is not a finite number' };
  }
  const base = { ref, hasExpects, expects: hasExpects ? entry.expects : null };
  let m;
  if ((m = MEMBER_RE.exec(ref))) {
    if (m[1].split('/').some((seg) => seg === '..' || seg === '.' || seg === '')) return { kind: 'malformed', ref, reason: 'module path has a ./.. or empty segment' };
    return { ...base, kind: 'member', path: m[1], member: m[2] };
  }
  if ((m = COLUMN_RE.exec(ref))) return { ...base, kind: 'column', table: m[1], column: m[2] };
  if (LOGIC_RE.test(ref)) return { ...base, kind: 'logic_variable', key: ref };
  return { kind: 'malformed', ref, reason: 'not table.column, module#member or a logic variable key' };
}

/** PURE. A module path lies under the roots when it equals a root file or starts with a root directory ending in '/'. */
export function underRoots(relPath, codeRoots) {
  return (codeRoots || []).some((r) => (r.endsWith('/') ? relPath.startsWith(r) : relPath === r));
}

// ---------------------------------------------------------------- module parsing (typescript AST, never executed)

function unwrap(node) {
  let n = node;
  for (;;) {
    if (!n) return n;
    if (ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isNonNullExpression(n) || ts.isTypeAssertionExpression(n) || (ts.isSatisfiesExpression && ts.isSatisfiesExpression(n))) {
      n = n.expression;
    } else if (ts.isCallExpression(n) && n.expression.getText() === 'Object.freeze' && n.arguments.length === 1) {
      n = n.arguments[0];
    } else return n;
  }
}

function numericValue(node) {
  const n = unwrap(node);
  if (!n) return null;
  let v = null;
  if (ts.isNumericLiteral(n)) v = Number(n.text);
  else if (ts.isPrefixUnaryExpression(n) && ts.isNumericLiteral(n.operand)) {
    if (n.operator === ts.SyntaxKind.MinusToken) v = -Number(n.operand.text);
    if (n.operator === ts.SyntaxKind.PlusToken) v = Number(n.operand.text);
  }
  return Number.isFinite(v) ? v : null; // 1e400 → Infinity is not a comparable constant
}

function propName(prop, sf) {
  const name = prop.name;
  if (!name) return null;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  if (ts.isPrivateIdentifier(name)) return null;
  return ts.isComputedPropertyName(name) ? null : name.getText(sf);
}

const hasExportModifier = (node) => (ts.getModifiers ? ts.getModifiers(node) || [] : node.modifiers || []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

/** The text of the comment lines directly above `line0` (0-based), stopping at a blank or code line; max 8 lines. */
function leadingComment(lines, line0) {
  const out = [];
  for (let i = line0 - 1; i >= 0 && out.length < 8; i--) {
    const t = lines[i].trim();
    if (!/^(\/\/|\/\*|\*)/.test(t)) break;
    out.unshift(t.replace(/^(\/\/+|\/\*+|\*+\/?)\s?/, '').replace(/\*\/$/, ''));
  }
  return out.join(' ').trim();
}

/** The trailing `// …` on a line after column `col`. */
function trailingComment(lines, line0, col) {
  // Only a `//` that follows the literal across punctuation and whitespace — never one inside a later string.
  const rest = lines[line0].slice(col).replace(/^[\s,;)\]}]*/, '');
  return rest.startsWith('//') ? rest.slice(2).trim() : '';
}

/** The nearest `// ---` section header at or above line0 (a group heading such as "--- By-law constants …"). */
function sectionHeader(lines, line0) {
  for (let i = line0; i >= 0; i--) {
    const t = lines[i].trim();
    if (/^\/\/\s*---/.test(t)) return t.replace(/^\/\/\s*/, '');
  }
  return '';
}

/** Parse a module once: top-level members (dotted paths into object/array literals), named constants, inline counts. */
export function loadModule(ctx, relPath) {
  if (ctx.modules.has(relPath)) return ctx.modules.get(relPath);
  const abs = path.join(ctx.root, relPath);
  let mod;
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    mod = { ok: false, reason: 'file_missing', path: relPath };
  } else {
    const text = fs.readFileSync(abs, 'utf8').replace(/\r\n/g, '\n');
    const kind = relPath.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS;
    const sf = ts.createSourceFile(relPath, text, ts.ScriptTarget.Latest, true, kind);
    const diags = sf.parseDiagnostics || [];
    if (diags.length > 0) {
      mod = { ok: false, reason: 'unparseable_code_file', path: relPath, detail: ts.flattenDiagnosticMessageText(diags[0].messageText, ' ') };
    } else {
      mod = parseModuleAst(sf, text, relPath);
    }
  }
  ctx.modules.set(relPath, mod);
  return mod;
}

function parseModuleAst(sf, text, relPath) {
  const lines = text.split('\n');
  const lineOf = (node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line;
  const top = new Map(); // name -> {node (initializer or declaration), kind, line, exported, stmtLine}
  const exported = new Set();
  const aliases = new Map(); // exported name -> local name
  const register = (name, entry) => {
    if (!top.has(name)) top.set(name, entry);
  };

  for (const st of sf.statements) {
    if (ts.isVariableStatement(st)) {
      const exp = hasExportModifier(st);
      for (const d of st.declarationList.declarations) {
        if (!ts.isIdentifier(d.name)) continue;
        register(d.name.text, { init: d.initializer, kind: 'variable', line: lineOf(d), stmtLine: lineOf(st), exported: exp });
        if (exp) exported.add(d.name.text);
      }
    } else if ((ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) && st.name) {
      register(st.name.text, { init: null, kind: ts.isFunctionDeclaration(st) ? 'function' : 'class', line: lineOf(st), stmtLine: lineOf(st), exported: hasExportModifier(st) });
      if (hasExportModifier(st)) exported.add(st.name.text);
    } else if (ts.isExportDeclaration(st) && st.exportClause && ts.isNamedExports(st.exportClause)) {
      // `export { local as name }`: `name` is the exported member and resolves to `local`. A re-export
      // (`export … from`) has no local declaration and stays unresolved (a declared blind spot).
      for (const el of st.exportClause.elements) {
        if (st.moduleSpecifier) continue;
        exported.add(el.name.text);
        if (el.propertyName) aliases.set(el.name.text, el.propertyName.text);
      }
    } else if (ts.isExpressionStatement(st) && ts.isBinaryExpression(st.expression) && st.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const lhs = st.expression.left.getText(sf);
      const rhs = unwrap(st.expression.right);
      if (lhs === 'module.exports' && rhs && ts.isObjectLiteralExpression(rhs)) {
        for (const p of rhs.properties) {
          if (ts.isShorthandPropertyAssignment(p)) exported.add(p.name.text);
          else if (ts.isPropertyAssignment(p)) {
            const n = propName(p, sf);
            if (n == null) continue;
            exported.add(n);
            if (ts.isIdentifier(p.initializer)) {
              if (p.initializer.text !== n) aliases.set(n, p.initializer.text); // { alias: LOCAL }
            } else {
              register(n, { init: p.initializer, kind: 'variable', line: lineOf(p), stmtLine: lineOf(p), exported: true });
            }
          }
        }
      } else {
        const m = /^(?:module\.)?exports\.([A-Za-z_$][\w$]*)$/.exec(lhs);
        if (m) {
          exported.add(m[1]);
          register(m[1], { init: st.expression.right, kind: 'variable', line: lineOf(st), stmtLine: lineOf(st), exported: true });
        }
      }
    }
  }
  for (const [name, local] of aliases) if (!top.has(name) && top.has(local)) top.set(name, { ...top.get(local), exported: true, alias: local });
  for (const [name, e] of top) e.exported = e.exported || exported.has(name);

  // Named numeric constants: numeric leaves of top-level variable initializers, through object and array literals.
  const constants = [];
  const covered = new Set();
  const walk = (node, member, ownLine, stmtLine, exp) => {
    const n = unwrap(node);
    if (!n) return;
    const v = numericValue(n);
    if (v != null) {
      const lit = ts.isNumericLiteral(n) ? n : n.operand;
      covered.add(lit.getStart(sf));
      const line0 = lineOf(n);
      const own = [leadingComment(lines, ownLine), trailingComment(lines, line0, sf.getLineAndCharacterOfPosition(n.getEnd()).character)].filter(Boolean).join(' · ');
      const stmt = ownLine === stmtLine ? '' : leadingComment(lines, stmtLine);
      constants.push({ path: relPath, member, value: v, line: line0 + 1, exported: exp, comment: own, statement_comment: stmt, section: sectionHeader(lines, stmtLine) });
      return;
    }
    if (ts.isObjectLiteralExpression(n)) {
      for (const p of n.properties) {
        if (!ts.isPropertyAssignment(p)) continue;
        const k = propName(p, sf);
        if (k != null) walk(p.initializer, `${member}.${k}`, lineOf(p), stmtLine, exp);
      }
    } else if (ts.isArrayLiteralExpression(n)) {
      n.elements.forEach((el, i) => walk(el, `${member}.${i}`, lineOf(el), stmtLine, exp));
    }
  };
  for (const [name, e] of top) if (e.kind === 'variable' && e.init && !e.alias) walk(e.init, name, e.line, e.stmtLine, e.exported);

  // Inline disclosure: numeric literals not part of a named constant; decimal numbers inside string / template text.
  let numericLiterals = 0;
  let numbersInStrings = 0;
  const DEC = /(?<![\w.])\d+\.\d+(?![\w.])/g;
  const count = (node) => {
    if (ts.isNumericLiteral(node) && !covered.has(node.getStart(sf))) numericLiterals++;
    else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      numbersInStrings += (node.text.match(DEC) || []).length;
    }
    ts.forEachChild(node, count);
  };
  count(sf);

  return { ok: true, path: relPath, top, constants, inline: { path: relPath, numeric_literals: numericLiterals, numbers_in_strings: numbersInStrings }, sha256: sha256(text) };
}

/** Walk a dotted member through the module's top-level declarations and their object / array literals. */
function lookupMember(mod, dotted) {
  const [head, ...rest] = dotted.split('.');
  const e = mod.top.get(head);
  if (!e) return null;
  if (rest.length === 0 && e.kind !== 'variable') return { constant: false, value: null, line: e.line + 1, exported: e.exported };
  let node = e.init ? unwrap(e.init) : null;
  for (const seg of rest) {
    if (!node) return null;
    if (ts.isObjectLiteralExpression(node)) {
      const p = node.properties.find((q) => ts.isPropertyAssignment(q) && q.name && (ts.isIdentifier(q.name) || ts.isStringLiteral(q.name) || ts.isNumericLiteral(q.name)) && q.name.text === seg);
      node = p ? unwrap(p.initializer) : null;
    } else if (ts.isArrayLiteralExpression(node) && /^\d+$/.test(seg)) {
      node = unwrap(node.elements[Number(seg)]) || null;
    } else return null;
  }
  if (rest.length > 0 && !node) return null;
  const target = node || e.init;
  const v = target ? numericValue(target) : null;
  const sf = target ? target.getSourceFile() : null;
  const line = target && sf ? sf.getLineAndCharacterOfPosition(target.getStart(sf)).line + 1 : e.line + 1;
  return { constant: v != null, value: v, line, exported: e.exported };
}

/** Resolve one parsed ref statically. → {resolved, reason?, value?, line?, constant?, sources?, exported?} */
export function resolveCodeRef(ctx, parsed) {
  if (parsed.kind === 'malformed') return { resolved: false, reason: 'malformed_code_ref', detail: parsed.reason };
  if (parsed.kind === 'column') {
    const sources = [];
    if (ctx.columnsTs.get(parsed.table)?.has(parsed.column)) sources.push('schema.ts');
    if (ctx.columnsDoc.get(parsed.table)?.has(parsed.column)) sources.push('01_database_schema.md');
    return sources.length ? { resolved: true, constant: false, sources } : { resolved: false, reason: 'column_not_found' };
  }
  if (parsed.kind === 'logic_variable') {
    const lv = Object.prototype.hasOwnProperty.call(ctx.logicVars, parsed.key) ? ctx.logicVars[parsed.key] : null;
    if (!lv) return { resolved: false, reason: 'logic_variable_not_found' };
    const v = typeof lv.default === 'number' ? lv.default : null;
    return { resolved: true, constant: v != null, value: v };
  }
  const mod = loadModule(ctx, parsed.path);
  if (!mod.ok) return { resolved: false, reason: mod.reason, detail: mod.detail };
  const hit = lookupMember(mod, parsed.member);
  return hit ? { resolved: true, ...hit } : { resolved: false, reason: 'member_not_found' };
}

// ---------------------------------------------------------------- G-CODE (i) blocking + (ii) report-only

const refsOf = (row) => (Array.isArray(row.code_refs) ? row.code_refs : []);
const targetsOf = (row) => (Array.isArray(row.units) ? row.units.map((u) => u && u.target).filter(Boolean) : []);
const statusOf = (row) => (row.calculation_handling && row.calculation_handling.status) || null;

/**
 * G-CODE (i)(ii) over rows. A row with no authored `code_refs` is pending (counted, never failed; M-45).
 * `code_refs` "none" (or []) is an authored "none". Returns {pass, violations, checked, pending, items, findings}.
 */
export function checkCodeLinkage({ ctx, rows, codeRoots, bannedCodeRefs }) {
  const items = [];
  const findings = [];
  let checked = 0;
  let pending = 0;
  const banned = bannedCodeRefs || [];
  for (const row of rows || []) {
    const id = row.regulation_id;
    if (row.code_refs === undefined) {
      pending++;
      continue;
    }
    checked++;
    const modelled = statusOf(row) === 'modelled';
    const refs = refsOf(row);
    if (modelled && refs.length === 0) items.push({ code: 'modelled_without_code_ref', row: id, ref: null, detail: `code_refs ${JSON.stringify(row.code_refs)}` });
    for (const entry of refs) {
      const p = parseCodeRef(entry);
      if (p.kind === 'malformed') {
        items.push({ code: 'malformed_code_ref', row: id, ref: p.ref, detail: p.reason });
        continue;
      }
      for (const b of banned) {
        if (b.ref !== p.ref) continue;
        // A ban scoped to targets clears only a row whose unit targets are known and all outside the scope;
        // a non-array or empty `targets` bans everywhere; a row with no unit targets cannot clear a scoped ban.
        const scoped = Array.isArray(b.targets) && b.targets.length > 0;
        const rowTargets = targetsOf(row);
        const hit = scoped ? rowTargets.filter((t) => b.targets.includes(t)) : [];
        if (!scoped || hit.length > 0 || rowTargets.length === 0) {
          const why = !scoped ? '' : hit.length ? ` (target ${hit.join(', ')})` : ' (row has no unit targets, so the scoped ban cannot be cleared)';
          items.push({ code: 'banned_code_ref', row: id, ref: p.ref, detail: `${b.reason}${why}` });
        }
      }
      if (p.kind === 'member' && !underRoots(p.path, codeRoots)) {
        items.push({ code: 'ref_outside_code_roots', row: id, ref: p.ref, detail: `${p.path} is not under vocab.code_roots` });
        continue;
      }
      const r = resolveCodeRef(ctx, p);
      if (!r.resolved) {
        if (r.reason === 'unparseable_code_file') items.push({ code: 'unparseable_code_file', row: id, ref: p.ref, detail: r.detail || '' });
        else if (modelled) items.push({ code: 'unresolved_code_ref', row: id, ref: p.ref, detail: r.reason });
        else findings.push({ code: 'unresolved_code_ref_unmodelled', row: id, ref: p.ref, detail: r.reason });
        continue;
      }
      if (p.kind === 'member' && r.constant && !p.hasExpects) {
        items.push({ code: 'constant_without_expects', row: id, ref: p.ref, detail: `constant ${r.value} at line ${r.line} declares no expects` });
      }
      if (p.hasExpects && !r.constant) {
        findings.push({ code: 'expects_unverifiable', row: id, ref: p.ref, code_value: null, expects: p.expects, line: r.line ?? null });
      }
      if (p.hasExpects && r.constant && Math.abs(r.value - p.expects) > EPS) {
        findings.push({ code: 'expects_mismatch', row: id, ref: p.ref, code_value: r.value, expects: p.expects, line: r.line ?? null });
      }
    }
  }
  const violations = items.map((i) => `${i.code}: ${i.row}${i.ref ? ` ${i.ref}` : ''} — ${i.detail}`);
  // A gate that checked no row is not_run, never a PASS (Spec 68 §4); `pass` stays the exit-code input (no failure).
  const state = items.length > 0 ? 'fail' : checked === 0 ? 'not_run' : 'pass';
  return { pass: items.length === 0, state, violations, checked, pending, items, findings };
}

// ---------------------------------------------------------------- G-CODE (iv) constant classifier (M-46)

const CLAUSE_RE = /\b\d{1,3}(?:\.\d{1,3}){2,4}(?:\([0-9A-Za-z]{1,4}\))*/g;
const BYLAW_WORD_RE = /\bby-?laws?\b/i;
const REASON_RULES = [
  ['tolerance', /\btol(?:erance)?\b|\bagree within\b/i],
  ['proxy_for_unmodelled_rule', /\bTRCA\b|\bravine\b|\bproxy\b|\bstable-slope\b|\bapproximat|\bcoarse\b/i],
  ['data_cleaning_bound', /\bsane\b|\bband\b|\bplausib|\bguard\b|\bmislink\b|\bartifact\b|\bover-capture\b|\bclamp|\bsliver|\bambiguous\b/i],
  ['statistical_default', /\bmedians?\b|\bempirical\b|\btypical\b|\bp90\b|\bsample\b|\bwindow\b/i],
];

/** PURE. The comment-derived proposal: by_law_cited (a clause is cited) · by_law_claimed_unsourced · heuristic:<reason>. */
export function proposeClass(c) {
  const ownAndStmt = `${c.comment} ${c.statement_comment}`;
  const clauses = [...new Set(ownAndStmt.match(CLAUSE_RE) || [])].sort(cmp);
  if (clauses.length) return { proposed: 'by_law_cited', proposed_reason: null, clauses };
  // The constant's OWN comment claiming a by-law source wins ("typical by-law cap" is a claim to verify). Otherwise a
  // comment that says how the number was made (median, approximation, tolerance…) outranks a by-law mention in the
  // statement or section: "empirical medians of the parcels that carry a bylaw value" is a statistic, not a by-law value.
  if (BYLAW_WORD_RE.test(c.comment)) return { proposed: 'by_law_claimed_unsourced', proposed_reason: null, clauses: [] };
  const hit = REASON_RULES.find(([, re]) => re.test(`${ownAndStmt} ${c.member}`));
  if (hit) return { proposed: 'heuristic', proposed_reason: hit[0], clauses: [] };
  if (BYLAW_WORD_RE.test(`${ownAndStmt} ${c.section}`)) return { proposed: 'by_law_claimed_unsourced', proposed_reason: null, clauses: [] };
  return { proposed: 'heuristic', proposed_reason: 'modelling_assumption', clauses: [] };
}

/** The logic variable a constant is the JS fallback for: lower(name) minus a `_default` suffix, if that key exists. */
function logicVariableFor(ctx, member) {
  if (member.includes('.')) return null;
  const key = member.toLowerCase().replace(/_default$/, '');
  const lv = Object.prototype.hasOwnProperty.call(ctx.logicVars, key) ? ctx.logicVars[key] : null;
  return lv ? { key, default: typeof lv.default === 'number' ? lv.default : null } : null;
}

/**
 * Classify every named numeric constant in the root modules: by-law (a row's code_ref names it, directly or through
 * its logic variable) · heuristic (a model_heuristic row's code_ref names it, likewise) · unmapped (a counted finding).
 */
export function classifyConstants({ ctx, codeRoots, rows, heuristics }) {
  const findings = [];
  const lawRefs = new Map(); // ref -> [regulation ids]
  for (const row of rows || []) {
    for (const entry of refsOf(row)) {
      const p = parseCodeRef(entry);
      if (p.kind === 'malformed') continue;
      if (!lawRefs.has(p.ref)) lawRefs.set(p.ref, []);
      lawRefs.get(p.ref).push(row.regulation_id);
    }
  }
  const heurRefs = new Map();
  for (const h of heuristics || []) {
    if (h && h.kind === 'model_heuristic' && typeof h.code_ref === 'string') {
      if (!heurRefs.has(h.code_ref)) heurRefs.set(h.code_ref, []);
      heurRefs.get(h.code_ref).push(h.id);
    }
  }
  const constants = [];
  const inline = [];
  const files = [];
  for (const root of [...new Set(codeRoots || [])].sort(cmp)) {
    const found = root.endsWith('/') ? listFiles(ctx.root, root) : [root];
    if (found.length === 0) findings.push({ code: 'code_root_missing', path: root, detail: 'directory root has no code files' });
    for (const rel of found) if (!files.includes(rel)) files.push(rel); // a file under two roots is read once
  }
  for (const rel of files) {
    {
      const mod = loadModule(ctx, rel);
      if (!mod.ok) {
        findings.push({ code: mod.reason === 'unparseable_code_file' ? 'unparseable_code_file' : 'code_root_missing', path: rel, detail: mod.detail || mod.reason });
        continue;
      }
      inline.push(mod.inline);
      for (const c of mod.constants) {
        const ref = `${c.path}#${c.member}`;
        const lv = logicVariableFor(ctx, c.member);
        const keys = [ref, ...(lv ? [lv.key] : [])];
        const law = keys.flatMap((k) => lawRefs.get(k) || []);
        const heur = keys.flatMap((k) => heurRefs.get(k) || []);
        const cls = law.length ? 'by-law' : heur.length ? 'heuristic' : 'unmapped';
        if (law.length && heur.length) findings.push({ code: 'constant_double_classified', path: c.path, member: c.member, detail: `rows ${law.join(', ')} and ${heur.join(', ')}` });
        if (cls === 'unmapped') findings.push({ code: 'unmapped_constant', path: c.path, member: c.member, detail: `${c.value} at line ${c.line}` });
        constants.push({
          ...c,
          ...proposeClass(c),
          class: cls,
          cited_by: [...law, ...heur].sort(cmp),
          logic_variable: lv ? { key: lv.key, default: lv.default, default_equal: lv.default != null && Math.abs(lv.default - c.value) <= EPS } : null,
        });
      }
    }
  }
  const counts = { 'by-law': 0, heuristic: 0, unmapped: 0, total: constants.length };
  for (const c of constants) counts[c.class]++;
  return { constants, counts, findings, inline, files };
}

function listFiles(root, dirRel) {
  const abs = path.join(root, dirRel);
  if (!fs.existsSync(abs)) return [];
  const out = [];
  const rec = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => cmp(a.name, b.name))) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) rec(p);
      else if (/\.(js|mjs|cjs|ts)$/.test(e.name) && !e.name.endsWith('.d.ts')) out.push(toPosix(path.relative(root, p)));
    }
  };
  rec(abs);
  return out;
}

// ---------------------------------------------------------------- feeds cross-check (M-52), report-only

/** PURE. A registry ref covers a code_ref when equal, or the code_ref extends it past '#' or '.'. */
function covers(registryRef, ref) {
  if (ref === registryRef) return true;
  // A module path (has '/') covers its members after '#', or a member covers its sub-members after '.';
  // a table covers its columns. Never a bare-prefix match ('scripts/lib/fx' does not cover 'scripts/lib/fx.js#K').
  if (registryRef.includes('/')) return ref.startsWith(`${registryRef}${registryRef.includes('#') ? '.' : '#'}`);
  return ref.startsWith(`${registryRef}.`);
}

/**
 * For each modelled row's unit with `feeds` pairs: the pair must be registered, and ≥ 1 of the row's refs must lie
 * in a registered ref for it. `structure: any` matches a registry entry of any structure with that aspect.
 * Registry shape (proposed `vocab.code_registry`): [{structure, aspect, refs: [module path | module#member | table | table.column | logic var]}].
 */
export function checkFeeds({ rows, registry }) {
  const findings = [];
  let checked = 0;
  if (!Array.isArray(registry)) return { findings, checked, state: 'not_run', declared: false }; // no registry declared (S5): nothing to check against
  const reg = registry;
  for (const row of rows || []) {
    if (statusOf(row) !== 'modelled') continue;
    const refs = refsOf(row).map((e) => parseCodeRef(e)).filter((p) => p.kind !== 'malformed').map((p) => p.ref);
    for (const u of Array.isArray(row.units) ? row.units : []) {
      const feeds = Array.isArray(u && u.feeds) ? u.feeds : [];
      if (feeds.length === 0) continue;
      checked++;
      for (const f of feeds) {
        const entries = reg.filter((e) => e.aspect === f.aspect && (f.structure === 'any' || e.structure === f.structure));
        const pair = `(${f.structure}, ${f.aspect})`;
        if (entries.length === 0) {
          findings.push({ code: 'feeds_pair_unregistered', row: row.regulation_id, unit: u.unit_id, detail: `${pair} has no registered module` });
        } else if (!refs.some((r) => entries.some((e) => (e.refs || []).some((rr) => covers(rr, r))))) {
          findings.push({ code: 'feeds_ref_outside_registry', row: row.regulation_id, unit: u.unit_id, detail: `no code_ref lies in a module registered for ${pair}` });
        }
      }
    }
  }
  return { findings, checked, state: checked === 0 ? 'not_run' : 'pass', declared: true };
}

// ---------------------------------------------------------------- render

const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const fmt = (v) => (v == null ? '—' : String(v));
const clip = (s, n = 140) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Build every arm and render `bylaw-code-findings.md`. `vocab` null ⇒ the roots are the S9 proposal. Deterministic. */
export function buildReport({ ctx, rows, heuristics, vocab, seedTexts = {} }) {
  const rootsDeclared = Array.isArray(vocab && vocab.code_roots);
  const codeRoots = rootsDeclared ? vocab.code_roots : [...PROPOSED_CODE_ROOTS];
  const linkage = checkCodeLinkage({ ctx, rows, codeRoots, bannedCodeRefs: (vocab && vocab.banned_code_refs) || [] });
  const classification = classifyConstants({ ctx, codeRoots, rows, heuristics });
  const feeds = checkFeeds({ rows, registry: vocab ? vocab.code_registry : undefined });
  const markdown = render({ ctx, rows, heuristics, codeRoots, rootsDeclared, linkage, classification, feeds, seedTexts });
  return { pass: linkage.pass, markdown, linkage, classification, feeds };
}

function render({ ctx, rows, heuristics, rootsDeclared, linkage, classification, feeds, seedTexts }) {
  const feedsRegistered = feeds.declared;
  const L = [];
  const n = (rows || []).length;
  const k = classification.counts;
  const inlineNum = classification.inline.reduce((a, b) => a + b.numeric_literals, 0);
  const inlineStr = classification.inline.reduce((a, b) => a + b.numbers_in_strings, 0);
  L.push('# By-law code findings (generated — do not edit)');
  L.push('');
  L.push('> Generated by `scripts/analysis/bylaw/code-link.mjs` (Spec 68 §9 G-CODE, §10 stage 8). Report-only arms never change the exit');
  L.push('> code (Spec 69 M-11, M-22): code ≠ by-law disagreements are Phase 3 inputs, never table edits. **code_linkage: declared-only** —');
  L.push('> a ref is shown to exist and a declared constant is compared; no code is executed against the table until Phase 3.');
  L.push('');
  L.push(`- code_link version: ${CODE_LINK_VERSION}`);
  L.push(`- code_roots source: ${rootsDeclared ? 'vocab.json `code_roots`' : 'PROPOSED (S9; vocab.json carries no `code_roots` yet — S5 ratifies the list)'}`);
  L.push(`- authored rows read: ${n} (pending ${linkage.pending}) · heuristic rows read: ${(heuristics || []).length}`);
  // Every input the arms read, hashed (LF-normalized); a missing input is printed, never silently dropped.
  const inputs = Object.entries({ ...ctx.inputs, ...seedTexts }).map(([p, t]) => [p, t == null ? 'MISSING' : sha256(t.replace(/\r\n/g, '\n')).slice(0, 16)]);
  for (const rel of classification.files) {
    const m = ctx.modules.get(rel);
    inputs.push([rel, m && m.ok ? m.sha256.slice(0, 16) : m ? m.reason : 'MISSING']);
  }
  for (const [p, s] of inputs.sort((a, b) => cmp(a[0], b[0]))) L.push(`- input \`${p}\` sha256 \`${s}\``);
  L.push('');
  L.push('## Summary');
  L.push('');
  L.push('| Arm | State | Count |');
  L.push('|---|---|---|');
  L.push(`| G-CODE (i) blocking | ${linkage.state} | ${linkage.items.length} violation(s) over ${linkage.checked} row(s) |`);
  L.push(`| G-CODE (ii) report-only | — | ${linkage.findings.filter((f) => f.code === 'expects_mismatch').length} expects mismatch(es) |`);
  L.push(`| feeds cross-check report-only | ${feedsRegistered ? '—' : 'not_run (registry not declared)'} | ${feeds.findings.length} finding(s) over ${feeds.checked} unit(s) |`);
  const decls = new Set(classification.constants.map((c) => `${c.path}#${c.member.split('.')[0]}`)).size;
  L.push(`| G-CODE (iv) report-only | — | ${k.total} constants in ${decls} named declarations: by-law ${k['by-law']} · heuristic ${k.heuristic} · unmapped ${k.unmapped} |`);
  L.push('');
  L.push('## G-CODE (i) — blocking violations');
  L.push('');
  if (linkage.items.length === 0) L.push('None.');
  else {
    L.push('| Reason | Row | Ref | Detail |');
    L.push('|---|---|---|---|');
    for (const i of linkage.items) L.push(`| ${i.code} | ${esc(i.row)} | ${i.ref ? `\`${esc(i.ref)}\`` : '—'} | ${esc(i.detail)} |`);
  }
  L.push('');
  L.push('## G-CODE (ii) — live constant vs `expects` (report-only)');
  L.push('');
  const other = linkage.findings.filter((f) => f.code !== 'expects_mismatch');
  const mism = linkage.findings.filter((f) => f.code === 'expects_mismatch');
  if (mism.length === 0) L.push('None.');
  else {
    L.push('| Ref | Code value | Expects | Row | Line |');
    L.push('|---|---|---|---|---|');
    for (const f of mism) L.push(`| \`${esc(f.ref)}\` | ${fmt(f.code_value)} | ${fmt(f.expects)} | ${esc(f.row)} | ${fmt(f.line)} |`);
  }
  if (other.length) {
    L.push('');
    L.push('Unresolved refs on rows that are not `modelled` (report-only):');
    L.push('');
    for (const f of other) L.push(`- ${f.code}: ${esc(f.row)} \`${esc(f.ref)}\` — ${esc(f.detail)}`);
  }
  L.push('');
  L.push('## feeds cross-check (report-only, Spec 69 M-52)');
  L.push('');
  if (feeds.findings.length === 0) L.push(feedsRegistered ? 'None.' : 'None — `vocab.code_registry` is not declared yet (S5), so no unit is checked against it.');
  else for (const f of feeds.findings) L.push(`- ${f.code}: ${esc(f.row)} ${esc(f.unit)} — ${esc(f.detail)}`);
  L.push('');
  L.push('## G-CODE (iv) — root-module constants: by-law · heuristic · unmapped (Spec 69 M-46)');
  L.push('');
  L.push('`class` is the gate class (from row `code_refs` and `model_heuristic` rows). `proposed` is read from the code comments');
  L.push('for the operator to confirm at S9 — it never sets the class: `by_law_cited` (the comment cites a clause) · `by_law_claimed_unsourced`');
  L.push('(the comment or its section header claims a by-law source with no clause; the operator classifies, F-2) · `heuristic` with a');
  L.push(`proposed \`heuristic_reason\`. Inline disclosure: ${inlineNum} numeric literals outside named constants and ${inlineStr} decimal numbers`);
  L.push('inside string/SQL text are not classified (see blind spots).');
  L.push('');
  L.push('| # | Module | Member | Value | Line | Class | Proposed | Evidence | Logic variable |');
  L.push('|---|---|---|---|---|---|---|---|---|');
  classification.constants.forEach((c, i) => {
    const prop = c.proposed === 'heuristic' ? `heuristic: ${c.proposed_reason}` : c.proposed === 'by_law_cited' ? `by_law_cited ${c.clauses.join(', ')}` : c.proposed;
    const ev = clip([c.comment, c.statement_comment && `[stmt] ${c.statement_comment}`, c.section && `[section] ${c.section}`].filter(Boolean).join(' · '));
    const lv = c.logic_variable ? `\`${c.logic_variable.key}\` (default ${fmt(c.logic_variable.default)}${c.logic_variable.default_equal ? '' : ' ≠ code'})` : '—';
    L.push(`| ${i + 1} | \`${esc(c.path)}\` | \`${esc(c.member)}\` | ${c.value} | ${c.line} | ${c.class}${c.cited_by.length ? ` (${esc(c.cited_by.join(', '))})` : ''} | ${esc(prop)} | ${esc(ev)} | ${lv} |`);
  });
  L.push('');
  const unp = classification.findings.filter((f) => f.code !== 'unmapped_constant');
  if (unp.length) {
    L.push('Other (iv) findings:');
    L.push('');
    for (const f of unp) L.push(`- ${f.code}: \`${esc(f.path)}\`${f.member ? ` ${esc(f.member)}` : ''} — ${esc(f.detail)}`);
    L.push('');
  }
  L.push('### Proposed counts (for the S12b heuristic list)');
  L.push('');
  const pc = {};
  for (const c of classification.constants) {
    const key = c.proposed === 'heuristic' ? `heuristic: ${c.proposed_reason}` : c.proposed;
    pc[key] = (pc[key] || 0) + 1;
  }
  for (const key of Object.keys(pc).sort(cmp)) L.push(`- ${key}: ${pc[key]}`);
  L.push('');
  L.push('### Per-module inline disclosure');
  L.push('');
  L.push('| Module | Named constants | Inline numeric literals | Decimals in string/SQL text |');
  L.push('|---|---|---|---|');
  for (const m of classification.inline) {
    L.push(`| \`${m.path}\` | ${classification.constants.filter((c) => c.path === m.path).length} | ${m.numeric_literals} | ${m.numbers_in_strings} |`);
  }
  L.push('');
  L.push('## Blind spots (declared)');
  L.push('');
  L.push('- Only **named** numeric constants are classified: numeric leaves of top-level `const` initializers through object/array literals');
  L.push('  (and inline `module.exports` members). Inline literals in function bodies and numbers inside SQL template text are counted above,');
  L.push('  not classified; SQL-builder formulas are executed against the table only by the Phase 3 parity test (Spec 68 §14 item 4).');
  L.push('- `proposed` is a comment pre-sort (M-40 spirit: a dev aid, never the authority); a constant with no comment is proposed `modelling_assumption`.');
  L.push('- A logic-variable link is by name (lower-case constant name minus `_DEFAULT` equals a `logic_variables.json` key).');
  L.push('');
  return L.join('\n');
}

/** Read the committed inputs (vocab.json, authored rows, external.json heuristics when they exist) and render. */
export function buildReportFromTree({ root }) {
  const seeds = path.join(root, 'scripts/seeds/bylaw');
  const seedTexts = {};
  const readJson = (rel) => {
    const t = readIf(path.join(seeds, rel));
    if (t != null) seedTexts[`scripts/seeds/bylaw/${rel}`] = t;
    return t == null ? null : parseJsonInput(t, `scripts/seeds/bylaw/${rel}`);
  };
  const vocab = readJson('vocab.json');
  const external = readJson('external.json');
  const heuristics = external ? (Array.isArray(external) ? external : external.entries || external.rows || []).filter((e) => e && e.kind === 'model_heuristic') : [];
  // Authored rows arrive at A1 (S6 owns their schema and loader); none are committed at S9.
  const rows = [];
  return buildReport({ ctx: createContext({ root }), rows, heuristics, vocab, seedTexts });
}

// ---------------------------------------------------------------- selfTest: one known-bad fixture per (i) reason code

/** In-memory fixtures over a synthetic context (no files): each (i) reason code fails for that reason; the good twin passes. */
export function selfTest() {
  const violations = [];
  const sf = (rel, text) => parseModuleAst(ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS), text, rel);
  const ctx = {
    root: '',
    columnsTs: new Map([['parcels', new Set(['lot_size_sqm', 'bylaw_standard_setback_m'])]]),
    columnsDoc: new Map(),
    logicVars: { storey_height_m: { default: 3 } },
    inputs: {},
    modules: new Map([
      ['scripts/lib/fx.js', sf('scripts/lib/fx.js', 'const K = { H: 6.0 };\nfunction f() {}\nmodule.exports = { K, f };\n')],
      ['scripts/lib/bad.js', { ok: false, reason: 'unparseable_code_file', path: 'scripts/lib/bad.js', detail: 'fixture' }],
    ]),
  };
  const roots = ['scripts/lib/fx.js', 'scripts/lib/bad.js'];
  const banned = [{ ref: 'parcels.bylaw_standard_setback_m', reason: 'STAND_SET', targets: ['front_setback_m'] }];
  const R = (refs, status = 'modelled', target = 'height_m') => [{ regulation_id: 'fx(1)', calculation_handling: { status }, code_refs: refs, units: [{ unit_id: 'u', target }] }];
  const cases = [
    ['good_twin', R(['parcels.lot_size_sqm', { ref: 'scripts/lib/fx.js#K.H', expects: 6 }]), null],
    ['banned_code_ref', R(['parcels.bylaw_standard_setback_m'], 'modelled', 'front_setback_m'), 'banned_code_ref'],
    ['constant_without_expects', R(['scripts/lib/fx.js#K.H']), 'constant_without_expects'],
    ['malformed_code_ref', R(['Bad Ref!']), 'malformed_code_ref'],
    ['modelled_without_code_ref', R('none'), 'modelled_without_code_ref'],
    ['ref_outside_code_roots', R(['scripts/other.js#X']), 'ref_outside_code_roots'],
    ['unparseable_code_file', R(['scripts/lib/bad.js#X']), 'unparseable_code_file'],
    ['unresolved_code_ref', R(['parcels.gone']), 'unresolved_code_ref'],
  ];
  for (const [name, rows, expected] of cases) {
    const r = checkCodeLinkage({ ctx, rows, codeRoots: roots, bannedCodeRefs: banned });
    const got = r.items.map((i) => i.code);
    const ok = expected === null ? r.pass && got.length === 0 : !r.pass && got.length === 1 && got[0] === expected;
    if (!ok) violations.push(`selfTest ${name}: expected ${expected || 'pass'}, got ${got.join(',') || 'pass'}`);
  }
  // Report-only codes: each has a known-bad fixture, and none changes `pass`.
  const reportCases = [
    ['expects_mismatch', () => checkCodeLinkage({ ctx, rows: R([{ ref: 'scripts/lib/fx.js#K.H', expects: 6.3 }]), codeRoots: roots, bannedCodeRefs: [] })],
    ['expects_unverifiable', () => checkCodeLinkage({ ctx, rows: R([{ ref: 'parcels.lot_size_sqm', expects: 1 }]), codeRoots: roots, bannedCodeRefs: [] })],
    ['unresolved_code_ref_unmodelled', () => checkCodeLinkage({ ctx, rows: R(['parcels.gone'], 'not_modelled'), codeRoots: roots, bannedCodeRefs: [] })],
    ['unmapped_constant', () => classifyConstants({ ctx, codeRoots: ['scripts/lib/fx.js'], rows: [], heuristics: [] })],
    ['constant_double_classified', () => classifyConstants({ ctx, codeRoots: ['scripts/lib/fx.js'], rows: R([{ ref: 'scripts/lib/fx.js#K.H', expects: 6 }]), heuristics: [{ id: 'HEUR-1', kind: 'model_heuristic', code_ref: 'scripts/lib/fx.js#K.H' }] })],
    ['code_root_missing', () => classifyConstants({ ctx, codeRoots: ['scripts/lib/none.js'], rows: [], heuristics: [] })],
    ['unparseable_code_file', () => classifyConstants({ ctx, codeRoots: ['scripts/lib/bad.js'], rows: [], heuristics: [] })],
    ['feeds_pair_unregistered', () => checkFeeds({ rows: [{ ...R(['scripts/lib/fx.js#f'])[0], units: [{ unit_id: 'u', target: 'height_m', feeds: [{ structure: 'principal', aspect: 'envelope' }] }] }], registry: [] })],
    ['feeds_ref_outside_registry', () => checkFeeds({ rows: [{ ...R(['parcels.lot_size_sqm'])[0], units: [{ unit_id: 'u', target: 'height_m', feeds: [{ structure: 'principal', aspect: 'envelope' }] }] }], registry: [{ structure: 'principal', aspect: 'envelope', refs: ['scripts/lib/fx.js'] }] })],
  ];
  ctx.modules.set('scripts/lib/none.js', { ok: false, reason: 'file_missing', path: 'scripts/lib/none.js' });
  for (const [code, run] of reportCases) {
    const r = run();
    if (!r.findings.some((f) => f.code === code)) violations.push(`selfTest ${code}: the known-bad fixture produced no ${code} finding`);
    if (r.pass === false) violations.push(`selfTest ${code}: a report-only finding changed pass`);
  }
  const covered = new Set([...cases.map((c) => c[2]), ...reportCases.map((c) => c[0])].filter(Boolean));
  for (const code of [...REASON_CODES_I, ...REPORT_CODES]) if (!covered.has(code)) violations.push(`selfTest: reason code ${code} has no known-bad fixture`);
  for (const [reason] of REASON_RULES) if (!HEURISTIC_REASONS.includes(reason)) violations.push(`selfTest: ${reason} is not a heuristic_reason (Spec 68 §6.3)`);
  if (!HEURISTIC_REASONS.includes('modelling_assumption')) violations.push('selfTest: the default proposal is not a heuristic_reason');
  return { pass: violations.length === 0, violations, checked: cases.length + reportCases.length };
}

// ---------------------------------------------------------------- CLI (report only; the generator's --write renders at S8)

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const write = process.argv.includes('--write');
  let r = null;
  try {
    r = buildReportFromTree({ root });
  } catch (err) {
    if (!(err instanceof CodeLinkError)) throw err;
    console.error(`refused — ${err.message}`);
    process.exitCode = 2; // structural: nothing written (Spec 68 §9)
  }
  if (r && write) {
    const out = path.join(root, FINDINGS_PATH);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, r.markdown);
    console.log(`wrote ${FINDINGS_PATH}: ${r.classification.counts.total} constants (unmapped ${r.classification.counts.unmapped}); G-CODE (i) ${r.linkage.state}`);
    process.exitCode = r.pass ? 0 : 1;
  } else if (r) {
    const committed = readIf(path.join(root, FINDINGS_PATH));
    const drift = committed !== r.markdown;
    // A stale findings render is reported, never a commit blocker (M-32; excluded from the pre-commit compare like census.json).
    console.log(`G-CODE (i) ${r.linkage.state} · ${FINDINGS_PATH} ${drift ? 'STALE (report-only; rerun --write)' : 'current'}`);
    process.exitCode = r.pass ? 0 : 1;
  }
}
