// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rule 2 (R-BZ, compute purity)
//            plan: .cursor/wf1_compute_purity_active_task.md Phase 1
//
// Split out of compute-purity.mjs (2026-10-11, mechanical move, no behaviour change): the JS pass (G7 alias table, G8 call graph, G5 def-use, and their site emitters).

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { findDescriptors } from './compute-purity-sql.mjs';
import { CODES, COMPARE_OPS, SEAM_METHODS, libpg, resolver } from './compute-purity-base.mjs';

// ------------------------------------------------------------------ G7: the ctx.config alias table

/**
 * Every local name bound to `ctx.config` (or a `{}`-defaulted `ctx.config`) in one
 * file, at ANY binding depth — `{names, destructured}`:
 *   · the WHOLE object — `const|let <a> = ctx.config`, `= ctx.config || {}`,
 *     `= ctx.config ?? {}` — keys of `names`; and
 *   · a DESTRUCTURED field — `const { x } = ctx.config` — keys of `destructured`.
 *
 * A whole-object alias is permissive: once `<a>` is bound to `ctx.config`, a later
 * `const <a> = 5` does NOT retract it (the gate would rather over-report a reader
 * that reads like config than miss one that is).
 */
function configAliases(sf) {
  const names = new Set();
  const destructured = new Set();
  const isConfig = (node) => !!node && ts.isPropertyAccessExpression(node)
    && node.name.text === 'config' && ts.isIdentifier(node.expression) && node.expression.text === 'ctx';
  const unwrap = (init) => {
    if (!init) return null;
    if (ts.isParenthesizedExpression(init)) return unwrap(init.expression);
    if (ts.isBinaryExpression(init)) {
      const k = init.operatorToken.kind;
      if (k === ts.SyntaxKind.BarBarToken || k === ts.SyntaxKind.QuestionQuestionToken) return unwrap(init.left);
    }
    return init;
  };
  const walk = (node) => {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      const init = unwrap(node.initializer);
      if (ts.isIdentifier(node.name) && isConfig(init)) names.add(node.name.text);
      else if (ts.isObjectBindingPattern(node.name) && isConfig(init)) {
        for (const el of node.name.elements) if (ts.isIdentifier(el.name)) destructured.add(el.name.text);
      }
    }
    ts.forEachChild(node, walk);
  };
  ts.forEachChild(sf, walk);
  for (const d of destructured) names.delete(d);
  return { names, destructured };
}

/** Is `node` a property access rooted at `ctx.config`, or at a local `ctx.config` alias? */
function isConfigOperand(node, table) {
  if (!node || !ts.isPropertyAccessExpression(node)) return false;
  const base = node.expression;
  if (ts.isPropertyAccessExpression(base) && ts.isIdentifier(base.expression)
    && base.expression.text === 'ctx' && base.name.text === 'config') return true;
  if (ts.isIdentifier(base)) return table.names.has(base.text) || table.destructured.has(base.text);
  return false;
}

// ------------------------------------------------------------------ G8: the same-file call graph

/** The name a function-like declaration is bound to (`function f` → `f`; `const f = …` → `f`). */
function declaredName(node) {
  if (ts.isFunctionDeclaration(node) && node.name) return node.name.text;
  if (ts.isMethodDeclaration(node) && node.name && ts.isIdentifier(node.name)) return node.name.text;
  if ((ts.isArrowFunction(node) || ts.isFunctionExpression(node)) && ts.isVariableDeclaration(node.parent)
    && ts.isIdentifier(node.parent.name)) return node.parent.name.text;
  return null;
}

/** Every function node in one file, keyed by the name it is bound to (`null` for anonymous). */
function functionBodies(sf) {
  const map = new Map();
  const visit = (node) => {
    if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)
      || ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
      const name = declaredName(node);
      if (name && !map.has(name)) map.set(name, node);
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  return map;
}

/** Every callee NAME of a call in one body, into `out` (nested closures are their own bodies). */
function calleeNamesIn(body, out) {
  const visit = (node) => {
    if (node !== body && (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node)
      || ts.isFunctionExpression(node) || ts.isMethodDeclaration(node))) return;
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) out.add(node.expression.text);
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(body, visit);
}

/** Every `throw` statement of one body, in document order (nested closures excluded). */
function throwStatementsIn(body, out) {
  const visit = (node) => {
    if (node !== body && (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node)
      || ts.isFunctionExpression(node) || ts.isMethodDeclaration(node))) return;
    if (ts.isThrowStatement(node)) out.add(node);
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(body, visit);
}

/**
 * The `throw` statements (as line numbers) reachable from `roots` in the same-file call
 * graph. Follows calls by IDENTIFIER name, depth-first and cycle-safe, so a `throw`
 * buried behind three helpers is still the halt decision it is.
 */
function reachableThrows(sf, bodies, roots) {
  const throws = new Set();
  const visited = new Set();
  const queue = [...roots];
  while (queue.length) {
    const name = queue.shift();
    if (visited.has(name)) continue;
    visited.add(name);
    const body = bodies.get(name);
    if (!body) continue;
    const found = new Set();
    throwStatementsIn(body, found);
    for (const t of found) throws.add(sf.getLineAndCharacterOfPosition(t.getStart(sf)).line + 1);
    const called = new Set();
    calleeNamesIn(body, called);
    for (const c of called) if (!visited.has(c)) queue.push(c);
  }
  return throws;
}

/**
 * The export names a step DESCRIPTOR wires to a halt-capable hook
 * (`execution.enrich_hooks.contract_read` — a string — and its sibling
 * `execution.enrich_hooks.defer_scope.export`), or null when the descriptor does not
 * name one. `enrich_hooks.post_phase` runs AFTER commit, so it is NOT a halt root.
 */
function descriptorHookExports(repoRoot, file) {
  const abs = path.resolve(repoRoot, file);
  const base = path.basename(abs).replace(/\.(js|cjs)$/, '');
  const candidates = base.endsWith('-compute') ? [base, base.replace(/-compute$/, '')] : [base];
  const roots = [];
  let found = false;
  for (const cand of candidates) {
    for (const d of findDescriptors(repoRoot, cand)) {
      let obj;
      try {
        obj = JSON.parse(fs.readFileSync(d, 'utf8'));
      } catch {
        continue;
      }
      const hooks = obj && obj.execution && obj.execution.enrich_hooks;
      if (!hooks || typeof hooks !== 'object') continue;
      found = true;
      if (typeof hooks.contract_read === 'string' && hooks.contract_read !== 'none') roots.push(hooks.contract_read);
      const defer = hooks.defer_scope;
      if (defer && typeof defer === 'object' && typeof defer.export === 'string') roots.push(defer.export);
    }
  }
  return found ? roots : null;
}

/** The static name of an object-literal property key, or `''`. */
function propName(p) {
  return p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? p.name.text : '';
}

/**
 * The function names an exported `enrich_hooks = {…}` object literal names (fixtures),
 * across the two spellings a fixture uses:
 *   · `module.exports.enrich_hooks = { contract_read: f, … }` (inline literal), and
 *   · `const hooks = { contract_read: f }; module.exports.enrich_hooks = hooks;`.
 */
function enrichHookExportsFromAst(sf, bodies) {
  const roots = [];
  const fromLiteral = (objLit) => {
    for (const p of objLit.properties) {
      if (!ts.isPropertyAssignment(p) || !p.initializer || !ts.isIdentifier(p.initializer)) continue;
      const fn = p.initializer.text;
      if (bodies.has(fn)) roots.push(fn);
    }
  };
  const namedLiterals = new Map();
  const collect = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer
      && ts.isObjectLiteralExpression(node.initializer)) namedLiterals.set(node.name.text, node.initializer);
    ts.forEachChild(node, collect);
  };
  ts.forEachChild(sf, collect);
  const visit = (node) => {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && ts.isPropertyAccessExpression(node.left) && node.left.name.text === 'enrich_hooks') {
      if (ts.isObjectLiteralExpression(node.right)) fromLiteral(node.right);
      else if (ts.isIdentifier(node.right) && namedLiterals.has(node.right.text)) fromLiteral(namedLiterals.get(node.right.text));
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  return roots;
}

// ------------------------------------------------------------------ G5: def-use over one function

/** The innermost function/method/source-file that CONTAINS `node`. */
function enclosingFunction(node) {
  let p = node.parent;
  while (p) {
    if (ts.isFunctionDeclaration(p) || ts.isFunctionExpression(p) || ts.isArrowFunction(p)
      || ts.isMethodDeclaration(p) || ts.isConstructorDeclaration(p) || ts.isSourceFile(p)) return p;
    p = p.parent;
  }
  return null;
}

/**
 * `identifier name → initializer` for the `const`/`let` (and `var`) declarations of ONE
 * function (its own body only, not a nested closure's): the def-use table a
 * `<x>.query(<arg>)` site consults to turn `<arg>` into the literal it was bound to.
 */
function functionInitMap(fn) {
  const map = new Map();
  const visit = (node) => {
    if (node !== fn && (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)
      || ts.isArrowFunction(node) || ts.isMethodDeclaration(node))) return;
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      if (!map.has(node.name.text)) map.set(node.name.text, node.initializer);
    }
    ts.forEachChild(node, visit);
  };
  const body = ts.isSourceFile(fn) ? fn : fn.body;
  if (body) ts.forEachChild(body, visit);
  return map;
}

/** The static text of a StringLiteral / NoSubstitutionTemplateLiteral / TemplateExpression. */
function staticLiteralText(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    let out = node.head.text;
    for (const span of node.templateSpans) out += '1' + span.literal.text;
    return out;
  }
  return null;
}

/**
 * Is this literal text DML — `INSERT|UPDATE|DELETE|MERGE` (with an optional leading
 * `EXPLAIN`), or a `WITH … <verb>`? A `SELECT`/`WITH … SELECT` is not.
 */
const DML_VERB_RE = /^(INSERT|UPDATE|DELETE|MERGE)\b/i;

function isDmlText(text) {
  const t = String(text || '').trim().replace(/^EXPLAIN\s+(?:\([^)]*\)\s*)?/i, '');
  if (!t) return false;
  if (DML_VERB_RE.test(t)) return true;
  return /^WITH\b/i.test(t) && /\b(INSERT|UPDATE|DELETE|MERGE)\b/i.test(t);
}

/**
 * `identifier name → initializer` for the TOP-LEVEL `const`/`let`/`var` declarations of ONE
 * file (direct `SourceFile` statements only, not a statement nested in a block). Built once
 * per file and cached on the `SourceFile` node (CP-B3c fix 2, step 1).
 */
function moduleInitMap(sf) {
  if (sf.__moduleInitMap) return sf.__moduleInitMap;
  const map = new Map();
  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (ts.isIdentifier(decl.name) && decl.initializer && !map.has(decl.name.text)) {
        map.set(decl.name.text, decl.initializer);
      }
    }
  }
  sf.__moduleInitMap = map;
  return map;
}

/**
 * `identifier name → the function node it names` for the TOP-LEVEL declarations of ONE file:
 * `function f() {}` and `const f = (…) => …` / `const f = function (…) {}` (CP-B3c fix 2,
 * step 2). Built once per file and cached on the `SourceFile` node.
 */
function moduleFunctionMap(sf) {
  if (sf.__moduleFunctionMap) return sf.__moduleFunctionMap;
  const map = new Map();
  const isFn = (n) => ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n)
    || ts.isArrowFunction(n);
  for (const stmt of sf.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name) {
      if (!map.has(stmt.name.text)) map.set(stmt.name.text, stmt);
      continue;
    }
    if (!ts.isVariableStatement(stmt)) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (ts.isIdentifier(decl.name) && decl.initializer && isFn(decl.initializer)
        && !map.has(decl.name.text)) {
        map.set(decl.name.text, decl.initializer);
      }
    }
  }
  sf.__moduleFunctionMap = map;
  return map;
}

/**
 * The literal a same-file top-level function RETURNS, or null: the first `return <literal>`
 * (or `return <identifier>` whose single local initializer is a literal) found in the
 * function's own body, in source order (CP-B3c fix 2, step 2).
 */
function returnedLiteral(fnNode, sf) {
  let found = null;
  const visit = (node) => {
    if (found) return;
    if (node !== fnNode && (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)
      || ts.isArrowFunction(node) || ts.isMethodDeclaration(node))) return;
    if (ts.isReturnStatement(node) && node.expression) {
      const lit = resolveLiteralNode(node.expression, fnNode, sf);
      if (lit) { found = lit; return; }
    }
    ts.forEachChild(node, visit);
  };
  const body = ts.isFunctionDeclaration(fnNode) || ts.isFunctionExpression(fnNode)
    || ts.isArrowFunction(fnNode) ? fnNode.body : fnNode;
  if (body && ts.isSourceFile(body)) ts.forEachChild(body, visit);
  else if (body && ts.isBlock(body)) ts.forEachChild(body, visit);
  else if (body) visit(body);
  return found;
}

/**
 * Resolve a `<arg>` node to a literal node, or null. In order (CP-B3c):
 *   1. a literal (or a parenthesized literal);
 *   2. a function-local `const`/`let`/`var` initializer (the original def-use table);
 *   3. a TOP-LEVEL `const` initializer (`const DML = 'UPDATE …'`);
 *   4. a call `f(...)` naming a same-file top-level `function f() {}` / `const f = (…) =>`
 *      whose body returns a literal (or a locally-bound literal);
 *   5. otherwise null — G5Sites then reports the site as unresolved with `fp = 'call:' + line`.
 */
function resolveLiteralNode(arg, fn, sf) {
  if (!arg) return null;
  if (ts.isParenthesizedExpression(arg)) return resolveLiteralNode(arg.expression, fn, sf);
  if (staticLiteralText(arg) !== null) return arg;
  const file = sf || arg.getSourceFile();
  if (ts.isIdentifier(arg)) {
    if (fn) {
      const init = functionInitMap(fn).get(arg.text);
      if (init && init !== arg) return resolveLiteralNode(init, fn, file);
    }
    if (file) {
      const init = moduleInitMap(file).get(arg.text);
      if (init && init !== arg) return resolveLiteralNode(init, fn, file);
    }
    return null;
  }
  if (ts.isCallExpression(arg) && ts.isIdentifier(arg.expression) && file) {
    const target = moduleFunctionMap(file).get(arg.expression.text);
    if (target) return returnedLiteral(target, file);
  }
  return null;
}

/**
 * The receiver TEXT of a `<x>.query(` call — `pool` for a bare identifier,
 * `ctx.pool` for a property-access chain — or null when the callee is not a
 * `.query` call at all (or the receiver is neither). G5Sites uses this ONLY to
 * skip the `ctx` seam object and its four seam methods; seam-ness is decided by
 * the CALLEE (`ctx.joinUpdate|flushBatch|retract|stream`), never by a receiver
 * merely starting with `ctx.` (CP-B3c).
 */
function queryReceiver(call) {
  const callee = call.expression;
  if (!ts.isPropertyAccessExpression(callee) || callee.name.text !== 'query') return null;
  if (ts.isIdentifier(callee.expression) || ts.isPropertyAccessExpression(callee.expression)) {
    return callee.expression.getText();
  }
  return null;
}

/**
 * The nearest enclosing `<x>.method(...)` call whose argument list contains `node` — used
 * to see whether a DML literal is handed to a seam (`ctx.joinUpdate`, `ctx.flushBatch`,
 * `ctx.retract`, `ctx.stream`).
 */
function enclosingSeamCall(node) {
  let p = node.parent;
  while (p && !ts.isSourceFile(p)) {
    if (ts.isCallExpression(p) && ts.isPropertyAccessExpression(p.expression)) return p;
    if (ts.isStatement(p)) break;
    p = p.parent;
  }
  return null;
}


/** `js:<trimmed line>` — the shared fingerprint of the two AST rules G7/G8. */
function lineFp(lineText) {
  return `js:${lineText}`;
}

// ------------------------------------------------------------------ G7 — ctx.config comparisons

/**
 * G7 sites: a `<`/`<=`/`>`/`>=` BinaryExpression whose LEFT or RIGHT operand is a
 * property access rooted at `ctx.config` or at a local `ctx.config` alias (see
 * `configAliases`). One site per LINE; `fp = js:<trimmed line>` (CP-B11 fix 5: two
 * comparisons on one line, e.g. assert-engine-health:148, are ONE site — the rule is
 * line-fingerprinted, so a second emit for the same line is a duplicate). A
 * comparison nested in an alias BINDING (`const a = ctx.config || {}`) has no
 * property access, so it needs no special case.
 */
export function G7Sites(sf, text) {
  const lines = text.split(/\r?\n/);
  const table = configAliases(sf);
  const out = [];
  const seen = new Set();
  const visit = (node) => {
    if (ts.isBinaryExpression(node) && COMPARE_OPS.has(node.operatorToken.kind)
      && (isConfigOperand(node.left, table) || isConfigOperand(node.right, table))) {
      const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
      if (!seen.has(line)) {
        seen.add(line);
        out.push({ line, fp: lineFp((lines[line - 1] || '').trim()) });
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  return out;
}

// ------------------------------------------------------------------ G8 — reachable halts

/** One throw's 1-based line and `js:<trimmed line>` fingerprint. */
function throwSiteAt(sf, text, line) {
  const lines = text.split(/\r?\n/);
  return { line, fp: lineFp((lines[line - 1] || '').trim()) };
}

/**
 * G8 sites: every `throw` reachable from the step's halt roots — the export names its
 * descriptor wires to `execution.enrich_hooks.contract_read` / `.defer_scope.export`,
 * else (a fixture with no descriptor) the functions named in an exported
 * `enrich_hooks` object literal. Returns [] when no roots resolve.
 */
export function G8Sites(repoRoot, file, sf, text) {
  const roots = descriptorHookExports(repoRoot, file);
  const bodies = functionBodies(sf);
  const effective = roots && roots.length ? roots : enrichHookExportsFromAst(sf, bodies);
  if (!effective.length) return [];
  const lines = reachableThrows(sf, bodies, effective);
  return [...lines].sort((a, b) => a - b).map((line) => throwSiteAt(sf, text, line));
}

// ------------------------------------------------------------------ G5 — direct DML / unresolved query

/** The whitespace-squashed key of an object literal, so an identical literal is one exemption. */
function objectLiteralKey(o) {
  return o.getText().replace(/\s+/g, '');
}

/**
 * Is the DML LITERAL `lit` exempt? The closed seam set:
 *   · it is the value of an object property whose name ends with `_sql` (so the plan's
 *     own `update_sql: 'UPDATE …'` string is the seam, wherever the object is written), or
 *   · it flows as an argument into `ctx.joinUpdate` / `ctx.flushBatch` / `ctx.retract` /
 *     `ctx.stream`.
 * Any other literal is judged.
 */
function isSeamLiteral(lit) {
  let node = lit;
  while (node && node.parent && !ts.isStatement(node.parent) && !ts.isSourceFile(node.parent)) {
    const parent = node.parent;
    if (ts.isPropertyAssignment(parent) && parent.initializer === node
      && /_sql$/i.test(propName(parent))) return true;
    if (ts.isVariableDeclaration(parent) && parent.initializer === node) {
      const declList = parent.parent;
      const stmt = declList && declList.parent;
      if (stmt && ts.isVariableStatement(stmt)) {
        const decls = stmt.declarationList.declarations;
        if (decls.length === 1) {
          const name = decls[0].name;
          if (ts.isObjectBindingPattern(name)) {
            for (const el of name.elements) {
              if (el.propertyName && typeof el.propertyName === 'object' && el.propertyName.text
                && /_sql$/i.test(el.propertyName.text)) return true;
            }
          }
        }
      }
    }
    node = parent;
  }
  const call = enclosingSeamCall(lit);
  if (call && ts.isPropertyAccessExpression(call.expression) && ts.isIdentifier(call.expression.expression)
    && call.expression.expression.text === 'ctx' && SEAM_METHODS.has(call.expression.name.text)) {
    return true;
  }
  return false;
}

/**
 * G5 sites over ONE compute entry: every `<x>.query(<arg>)` call, in source order.
 *
 * The arg is resolved through the def-use table (a literal, or an identifier whose
 * single initializer in the SAME function is one):
 *   · RESOLVED and DML (`INSERT`/`UPDATE`/`DELETE`/`MERGE`, or a `WITH` naming one) →
 *     a site UNLESS the literal is in the closed seam set (`isSeamLiteral`);
 *   · RESOLVED and not DML (a `SELECT`, a plan fragment) → NOT a site;
 *   · UNRESOLVED (a parameter, a call result, a wrapper such as `flushClient.query`) →
 *     a site only when the receiver is not the `ctx` seam object.
 *
 * `fp` is the resolved literal's libpg fingerprint (the same helper G1–G4 use), or
 * `call:<trimmed line>` for an unresolved arg. One site per (enclosing statement,
 * fingerprint).
 */
export function G5Sites(file, sf, text) {
  const lines = text.split(/\r?\n/);
  const out = [];
  const seen = new Set();
  const visits = [];
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === 'query' && node.arguments.length) {
      const arg = node.arguments[0];
      const receiver = queryReceiver(node);
      // Seam-ness keys on the CALLEE, not the receiver: only the four `ctx.*` seam
      // methods are exempt; any other receiver (incl. `ctx.pool`, `ctx.db`) is judged.
      const notCtx = !(receiver === 'ctx' || receiver === 'this.ctx');
      const fn = enclosingFunction(node);
      const lit = resolveLiteralNode(arg, fn, sf);
      // A RESOLVED literal is a site only when it is DML text; a SELECT / WITH…SELECT /
      // DDL / plan fragment that resolves is NOT G5.
      const dml = lit && isDmlText(staticLiteralText(lit)) ? lit : null;
      visits.push({ notCtx, arg, lit, dml, resolved: dml ? enclosingFunction(dml) : null });
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  for (const v of visits) {
    const line = sf.getLineAndCharacterOfPosition(v.arg.getStart(sf)).line + 1;
    if (v.dml) {
      if (isSeamLiteral(v.dml)) continue;
      let fp;
      try {
        const sql = staticLiteralText(v.dml);
        const res = resolver.resolveStatement(sql, {});
        fp = res && typeof res.fingerprint === 'string' && res.fingerprint
          ? res.fingerprint
          : libpg().fingerprintSync(sql);
      } catch {
        fp = `unparsed:${(lines[line - 1] || '').trim()}`;
      }
      const dedupe = `${v.resolved ? v.resolved.pos : -1}\t${line}\t${fp}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      out.push({ line, fp });
    } else if (v.notCtx && !v.lit) {
      // Unresolved arg on a non-`ctx` receiver — the brief's wrapper case.
      const fp = `call:${(lines[line - 1] || '').trim()}`;
      if (seen.has(`${line}\t${fp}`)) continue;
      seen.add(`${line}\t${fp}`);
      out.push({ line, fp });
    }
  }
  return out;
}

/**
 * Stable `key = <rule>@<fp>#<ordinal>` per file (ordinal counts the same
 * `rule@fp` in source order within THAT file from 1) + final sort by (file, line, relation).
 * The `relation` field (G1/G2/G3 only) is carried through so `--list` names what was judged.
 */
export function finalizeSites(byFile) {
  const out = [];
  for (const file of [...byFile.keys()].sort()) {
    const seen = new Map();
    const list = byFile.get(file).slice().sort((a, b) => (a.line - b.line)
      || (a.ruleKey < b.ruleKey ? -1 : a.ruleKey > b.ruleKey ? 1 : 0)
      || String(a.relation || '').localeCompare(String(b.relation || '')));
    for (const s of list) {
      const n = (seen.get(s.ruleKey) || 0) + 1;
      seen.set(s.ruleKey, n);
      out.push({
        code: s.code,
        rule: CODES[s.code].rule,
        file: s.file,
        line: s.line,
        fp: s.fp,
        key: `${s.ruleKey}#${n}`,
        ...(s.relation ? { relation: s.relation } : {}),
      });
    }
  }
  out.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line));
  return out;
}

/** `codesSummary(sites)` → `{G1: n, G2: n, …}` (B3 extends it with G5/G7/G8). */
