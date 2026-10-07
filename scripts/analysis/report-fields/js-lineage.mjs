// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md (report surfaces; generator home — PROVISIONAL, design §4.2)
//            docs/specs/01-pipeline/69_mcbylaw_policy.md M-69 · docs/specs/01-pipeline/68_mcbylaw_standard.md §6.4 rule 8
//            .cursor/mcbylaw/phase3-prework/generator-design.md §2 G3' (JS formula chain) + G4 (constants)
//
// G3' — a bounded, static def-use walk over plain JS with the TypeScript compiler API. Nothing is executed.
//
// From one expression in one function it follows: local `const`/`let` initialisers and later assignments (including
// `x.prop = …` when the traced access path goes through `prop`, with the enclosing `if` condition as a control
// dependency); parameters back to the caller's argument (object-literal and destructured params are field-sensitive);
// calls into top-level functions of the same module or of a `require`d module, up to MAX_DEPTH nested calls — deeper
// is CUT and recorded (evidence I, never guessed); member reads of top-level constant literals (`BYLAW.X`, `mb.X`,
// `SETBACK_DEFAULTS[p][dim]`) as named constants; numeric literals on the path as inline literals; an unbound
// parameter as an input (a DB row field when the write-site declares the row's SQL source, else a config field that
// the step module maps to a logic variable, else an opaque parameter).

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

export const MAX_DEPTH = 4;

const BUILTIN_ROOTS = new Set(['Math', 'Number', 'String', 'JSON', 'Object', 'Array', 'Boolean', 'Infinity', 'undefined', 'NaN', 'console', 'Date', 'Set', 'Map', 'process']);
const FORMAT_METHODS = new Set(['toFixed', 'toPrecision', 'toLocaleString']);

const toPosix = (p) => p.split(path.sep).join('/');
const MODULE_FN = Object.freeze({ parameters: [], body: null, module: true }); // the env of a module-level initializer

/** File cache: {path, text (LF), sf, lineOf(off)}. */
export function createFiles(root) {
  const cache = new Map();
  return {
    root,
    get(rel) {
      if (cache.has(rel)) return cache.get(rel);
      const abs = path.join(root, rel);
      if (!fs.existsSync(abs)) { cache.set(rel, null); return null; }
      const text = fs.readFileSync(abs, 'utf8').replace(/\r\n/g, '\n');
      const kind = rel.endsWith('.tsx') ? ts.ScriptKind.TSX : rel.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS;
      const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, kind);
      const f = { path: rel, text, sf, lineOf: (off) => sf.getLineAndCharacterOfPosition(off).line + 1, top: null };
      cache.set(rel, f);
      return f;
    },
    paths() { return [...cache.keys()].filter((k) => cache.get(k)).sort(); },
  };
}

const unwrap = (n) => {
  let e = n;
  while (e && (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e) || ts.isTypeAssertionExpression?.(e) || ts.isSatisfiesExpression?.(e))) e = e.expression;
  return e;
};

/** Resolve a require() specifier relative to a module → repo-relative path (or null for a package). */
function resolveRequire(fromRel, spec, files) {
  if (!spec.startsWith('.')) return null;
  const base = toPosix(path.join(path.dirname(fromRel), spec));
  for (const cand of [base, `${base}.js`, `${base}.cjs`, `${base}.mjs`, `${base}.ts`, `${base}/index.js`]) {
    if (files.get(cand)) return cand;
  }
  return null;
}

function requireSpec(init) {
  const e = unwrap(init);
  if (e && ts.isCallExpression(e) && ts.isIdentifier(e.expression) && e.expression.text === 'require' && e.arguments[0] && ts.isStringLiteral(e.arguments[0])) return e.arguments[0].text;
  return null;
}

/** Top-level bindings of a module: functions, consts, require aliases, destructured imports. */
export function moduleTop(files, rel) {
  const f = files.get(rel);
  if (!f) return null;
  if (f.top) return f.top;
  const top = { functions: new Map(), consts: new Map(), aliases: new Map(), imports: new Map() };
  for (const st of f.sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.name) top.functions.set(st.name.text, st);
    if (!ts.isVariableStatement(st)) continue;
    for (const d of st.declarationList.declarations) {
      const spec = d.initializer ? requireSpec(d.initializer) : null;
      if (spec) {
        const target = resolveRequire(rel, spec, files);
        if (ts.isIdentifier(d.name)) top.aliases.set(d.name.text, target);
        else if (ts.isObjectBindingPattern(d.name)) {
          for (const el of d.name.elements) {
            const local = el.name.getText(f.sf);
            const imported = el.propertyName ? el.propertyName.getText(f.sf) : local;
            top.imports.set(local, { module: target, name: imported });
          }
        }
        continue;
      }
      if (ts.isIdentifier(d.name)) {
        const init = d.initializer ? unwrap(d.initializer) : null;
        if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) top.functions.set(d.name.text, init);
        else top.consts.set(d.name.text, d);
      }
    }
  }
  f.top = top;
  return top;
}

/** Is an initializer a pure literal (number/string/bool/null, or object/array literal of those, Object.freeze-wrapped)? */
function isLiteralValue(n) {
  let e = unwrap(n);
  if (!e) return false;
  if (ts.isCallExpression(e) && e.expression.getText() === 'Object.freeze' && e.arguments.length === 1) e = unwrap(e.arguments[0]);
  if (ts.isNumericLiteral(e) || ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return true;
  if (e.kind === ts.SyntaxKind.TrueKeyword || e.kind === ts.SyntaxKind.FalseKeyword || e.kind === ts.SyntaxKind.NullKeyword) return true;
  if (ts.isPrefixUnaryExpression(e) && ts.isNumericLiteral(e.operand)) return true;
  if (ts.isObjectLiteralExpression(e)) return e.properties.every((p) => ts.isPropertyAssignment(p) && isLiteralValue(p.initializer));
  if (ts.isArrayLiteralExpression(e)) return e.elements.every((x) => isLiteralValue(x));
  return false;
}

/** Statically evaluate a literal-valued node (for catalogue reads). */
export function literalValue(n) {
  let e = unwrap(n);
  if (!e) return undefined;
  if (ts.isCallExpression(e) && e.expression.getText() === 'Object.freeze' && e.arguments.length === 1) e = unwrap(e.arguments[0]);
  if (ts.isNumericLiteral(e)) return Number(e.text);
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text;
  if (ts.isPrefixUnaryExpression(e) && ts.isNumericLiteral(e.operand)) return e.operator === ts.SyntaxKind.MinusToken ? -Number(e.operand.text) : Number(e.operand.text);
  if (e.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (e.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (e.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isObjectLiteralExpression(e)) {
    const o = {};
    for (const p of e.properties) if (ts.isPropertyAssignment(p)) o[p.name.getText().replace(/^['"]|['"]$/g, '')] = literalValue(p.initializer);
    return o;
  }
  if (ts.isArrayLiteralExpression(e)) return e.elements.map(literalValue);
  return undefined;
}

/** Function-body nodes, not descending into nested function scopes. */
function forEachOwn(fn, visit) {
  const go = (n) => {
    if (n !== fn && (ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n))) return;
    visit(n);
    ts.forEachChild(n, go);
  };
  if (fn.body) ts.forEachChild(fn.body, go);
}

/** Trace every return of a function (own body) with a focus, plus the if-conditions that guard each return. */
function traceReturns(T, fn, env, focus) {
  if (fn.body && !ts.isBlock(fn.body)) { T.expr(fn.body, env, focus); return; }
  forEachOwn(fn, (n) => {
    if (!ts.isReturnStatement(n) || !n.expression) return;
    T.expr(n.expression, env, focus);
    for (let p = n.parent; p && p !== fn; p = p.parent) if (ts.isIfStatement(p)) T.expr(p.expression, env, []);
  });
}

/** Is a statement an early exit (`continue` / `return` / `break`, alone or as a one-statement block)? */
function isEarlyExit(st) {
  if (!st) return false;
  if (ts.isContinueStatement(st) || ts.isReturnStatement(st) || ts.isBreakStatement(st)) return true;
  return ts.isBlock(st) && st.statements.length === 1 && isEarlyExit(st.statements[0]);
}

/**
 * Presence guards of a declaration: the conditions of `if (…) continue|return|break;` statements that precede it
 * in each enclosing block of the function (a value that exists only when the guard passes, e.g. a cost line that
 * is absent unless its area is priceable).
 */
function guardsOf(node, fn) {
  const out = [];
  for (let cur = node; cur && cur.parent && cur !== fn; cur = cur.parent) {
    const blk = cur.parent;
    if (!ts.isBlock(blk)) continue;
    for (const st of blk.statements) {
      if (st === cur || st.pos >= cur.pos) break;
      if (ts.isIfStatement(st) && !st.elseStatement && isEarlyExit(st.thenStatement)) out.push(st.expression);
    }
    if (blk === fn.body) break;
  }
  return out;
}

/** An access path: {root: Identifier|other, props: [string|'*']}. */
function accessPath(e, env, tracer) {
  const props = [];
  let cur = unwrap(e);
  for (;;) {
    if (ts.isPropertyAccessExpression(cur)) { props.unshift(cur.name.text); cur = unwrap(cur.expression); continue; }
    if (ts.isElementAccessExpression(cur)) {
      const k = tracer.staticKey(cur.argumentExpression, env);
      props.unshift(k == null ? '*' : String(k));
      cur = unwrap(cur.expression);
      continue;
    }
    break;
  }
  return { root: cur, props };
}

/**
 * Create a tracer. opts: {files, maxDepth, transparent: Set<fnName>, configMap: Map<name, Set<lvKey>>,
 * catalogues: Map<varName, {entries: Map<id, object>}>}
 * result accumulators live on the returned object (reset per field with `begin()`).
 */
export function createTracer(opts) {
  const { files } = opts;
  const maxDepth = opts.maxDepth ?? MAX_DEPTH;
  const transparent = opts.transparent || new Set();
  const configMap = opts.configMap || new Map();
  let envSeq = 0;
  const T = {
    acc: null,
    begin() {
      T.acc = { nodes: new Map(), inputs: new Map(), constants: new Map(), literals: new Map(), cuts: new Map(), visited: new Set() };
      return T.acc;
    },
    env(file, fn, depth, bindings = new Map(), parent = null, extra = {}) {
      return { id: ++envSeq, file, fn, depth, bindings, parent, ...extra };
    },
    fnName(fn) {
      if (!fn || fn.module) return '<module>';
      if (fn.name && ts.isIdentifier(fn.name)) return fn.name.text;
      const p = fn.parent;
      if (p && ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return p.name.text;
      return '<anon>';
    },
    line(env, node) { return env.file.lineOf(node.getStart(env.file.sf)); },
    addNode(env, node, name, exprNode, note) {
      const line = T.line(env, node);
      const id = `${env.file.path}:${line}:${name}`;
      if (!T.acc.nodes.has(id)) {
        let text = exprNode ? exprNode.getText(env.file.sf).replace(/\s+/g, ' ').trim() : '';
        if (text.length > 200) text = `${text.slice(0, 199)}…`;
        T.acc.nodes.set(id, { id, file: env.file.path, line, fn: T.fnName(env.fn), name, expr: text, note: note || null, depth: env.depth });
      }
      return id;
    },
    addInput(key, value) { if (!T.acc.inputs.has(key)) T.acc.inputs.set(key, value); },
    addConstant(file, member, node, via) {
      const ref = `${file.path}#${member}`;
      if (!T.acc.constants.has(ref)) T.acc.constants.set(ref, { ref, path: file.path, member, line: file.lineOf(node.getStart(file.sf)), via: via || null });
    },
    addLiteral(env, node) {
      const v = Number(node.text);
      const line = T.line(env, node);
      const key = `${env.file.path}:${line}:${node.getStart(env.file.sf)}`;
      if (!T.acc.literals.has(key)) T.acc.literals.set(key, { file: env.file.path, line, value: v, fn: T.fnName(env.fn), context: node.parent ? node.parent.getText(env.file.sf).replace(/\s+/g, ' ').slice(0, 80) : '' });
    },
    cut(env, node, what) {
      const line = T.line(env, node);
      const key = `${env.file.path}:${line}:${what}`;
      if (!T.acc.cuts.has(key)) T.acc.cuts.set(key, { file: env.file.path, line, what, reason: `call depth > ${maxDepth}` });
    },

    /** Statically evaluate an element-access key: a string/number literal, or a param bound to one. */
    staticKey(k, env) {
      const e = unwrap(k);
      if (!e) return null;
      if (ts.isStringLiteral(e) || ts.isNumericLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text;
      if (ts.isIdentifier(e)) {
        const b = T.lookupParam(env, e.text);
        if (b && b.arg) {
          const v = T.staticKey(b.arg, b.env);
          if (v != null) return v;
        }
        if (!b && env.outer) return T.staticKey(k, env.outer);
        if (env.catalogueBindings && env.catalogueBindings.has(e.text)) return null;
      }
      if (ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression) && env.catalogueBindings && env.catalogueBindings.has(e.expression.text)) {
        const entry = env.catalogueBindings.get(e.expression.text);
        const v = entry[e.name.text];
        return v == null ? null : v;
      }
      return null;
    },

    /** Param binding of `name` in env: {arg, env, focusPrefix} | {unbound: true, param} | null (not a param). */
    lookupParam(env, name) {
      const fn = env.fn;
      if (!fn || !fn.parameters) return null;
      for (let i = 0; i < fn.parameters.length; i++) {
        const p = fn.parameters[i];
        if (ts.isIdentifier(p.name) && p.name.text === name) {
          const b = env.bindings.get(i);
          if (b) return { arg: b.arg, env: b.env, focusPrefix: [], param: p };
          return { unbound: true, param: p, path: [name], index: i };
        }
        if (ts.isObjectBindingPattern(p.name)) {
          for (const el of p.name.elements) {
            if (el.name.getText(env.file.sf) !== name) continue;
            const prop = el.propertyName ? el.propertyName.getText(env.file.sf) : name;
            const b = env.bindings.get(i);
            if (b) return { arg: b.arg, env: b.env, focusPrefix: [prop], param: p, element: el };
            return { unbound: true, param: p, path: [prop], index: i, element: el };
          }
        }
      }
      return null;
    },

    /** Local declaration of `name` inside env.fn (own scope): {decl, focusPrefix} */
    lookupLocal(env, name) {
      let hit = null;
      if (!env.fn || !env.fn.body) return null;
      forEachOwn(env.fn, (n) => {
        if (hit || !ts.isVariableDeclaration(n)) return;
        if (ts.isIdentifier(n.name) && n.name.text === name) hit = { decl: n, focusPrefix: [] };
        else if (ts.isObjectBindingPattern(n.name)) {
          for (const el of n.name.elements) {
            if (el.name.getText(env.file.sf) === name) hit = { decl: n, focusPrefix: [el.propertyName ? el.propertyName.getText(env.file.sf) : name], element: el };
          }
        }
      });
      if (!hit && ts.isForOfStatement && env.fn.body) {
        forEachOwn(env.fn, (n) => {
          if (hit || !ts.isForOfStatement(n)) return;
          const d = n.initializer && n.initializer.declarations && n.initializer.declarations[0];
          if (d && ts.isIdentifier(d.name) && d.name.text === name) hit = { decl: d, forOf: n, focusPrefix: [] };
        });
      }
      return hit;
    },

    /** Assignments in env.fn to `name` or `name.<focus prefix>` (mutations), with their enclosing if-conditions. */
    assignmentsTo(env, name, focus) {
      const out = [];
      forEachOwn(env.fn, (n) => {
        if (!ts.isBinaryExpression(n)) return;
        const k = n.operatorToken.kind;
        if (k !== ts.SyntaxKind.EqualsToken && k !== ts.SyntaxKind.PlusEqualsToken && k !== ts.SyntaxKind.MinusEqualsToken && k !== ts.SyntaxKind.AsteriskEqualsToken) return;
        const ap = accessPath(n.left, env, T);
        if (!ts.isIdentifier(ap.root) || ap.root.text !== name) return;
        const n1 = ap.props.length;
        const prefixOk = ap.props.every((p, i) => i >= focus.length || p === '*' || focus[i] === '*' || p === focus[i]);
        if (!prefixOk) return;
        const conds = [];
        for (let p = n.parent; p && p !== env.fn; p = p.parent) if (ts.isIfStatement(p)) conds.push(p.expression);
        out.push({ node: n, rest: focus.slice(n1), conds, compound: k !== ts.SyntaxKind.EqualsToken, propsLen: n1 });
      });
      return out;
    },

    /** Resolve a callee to {file, fn, name} or null. */
    resolveCallee(callee, env) {
      const e = unwrap(callee);
      const file = env.file;
      const top = moduleTop(files, file.path);
      if (ts.isIdentifier(e)) {
        const name = e.text;
        const local = T.lookupLocal(env, name);
        if (local && local.decl.initializer) {
          const init = unwrap(local.decl.initializer);
          if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) return { file, fn: init, name };
        }
        if (top.functions.has(name)) return { file, fn: top.functions.get(name), name };
        if (top.imports.has(name)) {
          const imp = top.imports.get(name);
          if (!imp.module) return null;
          const t2 = moduleTop(files, imp.module);
          if (t2 && t2.functions.has(imp.name)) return { file: files.get(imp.module), fn: t2.functions.get(imp.name), name: imp.name };
        }
        return null;
      }
      if (ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression)) {
        const alias = e.expression.text;
        if (top.aliases.has(alias) && top.aliases.get(alias)) {
          const mod = top.aliases.get(alias);
          const t2 = moduleTop(files, mod);
          if (t2 && t2.functions.has(e.name.text)) return { file: files.get(mod), fn: t2.functions.get(e.name.text), name: e.name.text };
        }
      }
      return null;
    },

    /** Trace an expression in env with a focus (access path applied to the expression's value). */
    expr(node, env, focus = []) {
      const e = unwrap(node);
      if (!e) return;
      const vkey = `${env.id}:${e.pos}:${e.end}:${focus.join('.')}`;
      if (T.acc.visited.has(vkey)) return;
      T.acc.visited.add(vkey);
      if (ts.isNumericLiteral(e)) { T.addLiteral(env, e); return; }
      if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e) || e.kind === ts.SyntaxKind.NullKeyword
        || e.kind === ts.SyntaxKind.TrueKeyword || e.kind === ts.SyntaxKind.FalseKeyword || e.kind === ts.SyntaxKind.UndefinedKeyword) return;
      if (ts.isIdentifier(e)) { T.ref(e, env, focus); return; }
      if (ts.isPropertyAccessExpression(e) || ts.isElementAccessExpression(e)) {
        const ap = accessPath(e, env, T);
        if (ts.isElementAccessExpression(e)) T.expr(e.argumentExpression, env, []);
        if (ts.isIdentifier(ap.root)) T.ref(ap.root, env, [...ap.props, ...focus], e);
        else T.expr(ap.root, env, [...ap.props, ...focus]);
        return;
      }
      if (ts.isCallExpression(e)) { T.call(e, env, focus); return; }
      if (ts.isObjectLiteralExpression(e)) {
        if (focus.length && focus[0] !== '*') {
          const want = focus[0];
          let found = false;
          for (const p of e.properties) {
            if (ts.isPropertyAssignment(p) && p.name.getText(env.file.sf).replace(/^['"]|['"]$/g, '') === want) { T.expr(p.initializer, env, focus.slice(1)); found = true; }
            else if (ts.isShorthandPropertyAssignment(p) && p.name.text === want) { T.ref(p.name, env, focus.slice(1)); found = true; }
          }
          if (!found) for (const p of e.properties) if (ts.isSpreadAssignment(p)) T.expr(p.expression, env, focus);
          return;
        }
        for (const p of e.properties) {
          if (ts.isPropertyAssignment(p)) T.expr(p.initializer, env, focus.slice(1));
          else if (ts.isShorthandPropertyAssignment(p)) T.ref(p.name, env, focus.slice(1));
          else if (ts.isSpreadAssignment(p)) T.expr(p.expression, env, focus);
        }
        return;
      }
      if (ts.isArrayLiteralExpression(e)) {
        if (focus.length && /^\d+$/.test(focus[0])) { const el = e.elements[Number(focus[0])]; if (el) T.expr(el, env, focus.slice(1)); return; }
        for (const el of e.elements) T.expr(el, env, focus.slice(1));
        return;
      }
      if (ts.isArrowFunction(e) || ts.isFunctionExpression(e)) {
        // An inline callback: its body is traced in a child env whose own params are opaque.
        const child = T.env(env.file, e, env.depth, new Map(), env, { opaqueParams: true, catalogueBindings: env.catalogueBindings });
        child.outer = env;
        if (e.body && !ts.isBlock(e.body)) T.expr(e.body, child, focus);
        else forEachOwn(e, (n) => { if (ts.isReturnStatement(n) && n.expression) T.expr(n.expression, child, focus); });
        return;
      }
      if (ts.isTemplateExpression(e)) { for (const s of e.templateSpans) T.expr(s.expression, env, []); return; }
      if (ts.isConditionalExpression(e)) { T.expr(e.condition, env, []); T.expr(e.whenTrue, env, focus); T.expr(e.whenFalse, env, focus); return; }
      if (ts.isBinaryExpression(e)) { T.expr(e.left, env, focus); T.expr(e.right, env, focus); return; }
      if (ts.isPrefixUnaryExpression(e) || ts.isPostfixUnaryExpression(e)) {
        if (ts.isPrefixUnaryExpression(e) && e.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(e.operand)) { T.addLiteral(env, e.operand); return; }
        T.expr(e.operand, env, focus); return;
      }
      if (ts.isAwaitExpression(e) || ts.isSpreadElement(e) || ts.isTypeOfExpression(e) || ts.isVoidExpression(e)) { T.expr(e.expression, env, focus); return; }
      ts.forEachChild(e, (c) => { if (ts.isExpression(c)) T.expr(c, env, []); });
    },

    /** A call: transparent helper, resolvable function (entered up to maxDepth), method on a value, or opaque. */
    call(e, env, focus) {
      const callee = unwrap(e.expression);
      const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : null;
      const ctext = ts.isPropertyAccessExpression(callee) ? callee.getText(env.file.sf) : null;
      if (ctext === 'Object.keys') return; // key-only use: the object's VALUES do not flow
      if (ctext === 'JSON.stringify') { if (e.arguments[0]) T.expr(e.arguments[0], env, focus); return; }
      if (name && transparent.has(name)) { if (e.arguments[0]) T.expr(e.arguments[0], env, focus); for (const a of e.arguments.slice(1)) T.expr(a, env, []); return; }
      const target = T.resolveCallee(callee, env);
      if (target) {
        if (env.depth + 1 > maxDepth) {
          T.cut(env, e, `${target.name}()`);
          for (const a of e.arguments) T.expr(a, env, []);
          return;
        }
        const bindings = new Map();
        e.arguments.forEach((a, i) => bindings.set(i, { arg: a, env }));
        const child = T.env(target.file, target.fn, env.depth + 1, bindings, env);
        T.addNode(child, target.fn, `${target.name}()`, null, `called from ${env.file.path}:${T.line(env, e)}`);
        traceReturns(T, target.fn, child, focus);
        return;
      }
      // Method call on a value (`x.toFixed(2)`, `arr.map(cb)`), or a builtin (Math.min, Number): the receiver and the
      // args carry the value. Formatting args (toFixed's digits) are not value constants.
      if (ts.isPropertyAccessExpression(callee)) {
        const recv = unwrap(callee.expression);
        const isBuiltin = ts.isIdentifier(recv) && BUILTIN_ROOTS.has(recv.text);
        if (!isBuiltin) T.expr(recv, env, []);
        if (FORMAT_METHODS.has(callee.name.text)) return;
      }
      for (const a of e.arguments) T.expr(a, env, []);
    },

    /** An identifier reference with an access-path focus. */
    ref(id, env, focus, accessNode = null) {
      const name = id.text;
      if (BUILTIN_ROOTS.has(name)) return;
      // own local
      if (env.catalogueBindings && env.catalogueBindings.has(name) && !T.lookupParam(env, name)) {
        const row = env.catalogueBindings.get(name);
        const k = focus[0];
        const local0 = T.lookupLocal(env, name);
        if (local0 && k && k !== '*') {
          const v = row[k];
          const src = row.__sources && row.__sources[k] ? row.__sources[k] : 'catalogue';
          T.addNode(env, local0.decl, `${name}.${k}`, null, `${src}[${row.__key}].${k} = ${JSON.stringify(v ?? null)}`);
        }
        return;
      }
      const local = T.lookupLocal(env, name);
      if (local) {
        const d = local.decl;
        const f2 = [...local.focusPrefix, ...focus];
        const shown = focus.filter((x) => x !== '*');
        const label = shown.length ? `${name}.${shown.join('.')}` : name;
        if (local.forOf) {
          if (env.catalogueBindings && env.catalogueBindings.has(name)) return; // a catalogue row: its fields are statically known
          T.addNode(env, d, label, local.forOf.expression);
          T.expr(local.forOf.expression, env, ['*', ...focus]);
          return;
        }
        T.addNode(env, d, label, d.initializer);
        if (d.initializer) T.expr(d.initializer, env, f2);
        if (env.fn && env.fn.body) for (const g of guardsOf(d, env.fn)) T.expr(g, env, []);
        for (const a of T.assignmentsTo(env, name, focus)) {
          T.addNode(env, a.node, label, a.node, a.conds.length ? `if (${a.conds.map((c) => c.getText(env.file.sf)).join(') && (')})` : 'reassigned');
          T.expr(a.node.right, env, a.rest);
          for (const c of a.conds) T.expr(c, env, []);
        }
        return;
      }
      const prm = T.lookupParam(env, name);
      if (prm) {
        if (env.opaqueParams) return;
        const f2 = [...(prm.focusPrefix || []), ...focus];
        if (prm.arg) { T.expr(prm.arg, prm.env, f2); return; }
        if (prm.param.initializer && !(env.bindings.size && env.bindings.has(prm.index))) {
          // default value applies when the caller omitted the argument (or at an entry point)
          if (env.bindings.size > 0 || env.depth > 0) { T.expr(prm.param.initializer, env, f2); return; }
        }
        if (prm.element && prm.element.initializer) T.expr(prm.element.initializer, env, []);
        T.unboundParam(env, prm, [...prm.path.slice(0, 1), ...f2.slice(prm.focusPrefix && prm.focusPrefix.length ? 1 : 0)], f2);
        return;
      }
      if (env.outer) { T.ref(id, env.outer, focus, accessNode); return; }
      // module top level
      const top = moduleTop(files, env.file.path);
      if (top.consts.has(name)) {
        const d = top.consts.get(name);
        const member = [name, ...focus].join('.');
        if (d.initializer && isLiteralValue(d.initializer)) { T.addConstant(env.file, member, d.initializer); return; }
        const menv = T.env(env.file, MODULE_FN, env.depth, new Map(), null);
        T.addNode(menv, d, name, d.initializer);
        if (d.initializer) T.expr(d.initializer, menv, focus);
        return;
      }
      if (top.aliases.has(name)) {
        const mod = top.aliases.get(name);
        if (!mod || !focus.length) return;
        const t2 = moduleTop(files, mod);
        const f2 = files.get(mod);
        const head = focus[0];
        if (t2.consts.has(head)) {
          const d = t2.consts.get(head);
          if (d.initializer && isLiteralValue(d.initializer)) { T.addConstant(f2, focus.join('.'), d.initializer); return; }
          const menv = T.env(f2, MODULE_FN, env.depth, new Map(), null);
          T.addNode(menv, d, head, d.initializer);
          if (d.initializer) T.expr(d.initializer, menv, focus.slice(1));
        }
        return;
      }
      if (top.imports.has(name)) {
        const imp = top.imports.get(name);
        if (!imp.module) return;
        const t2 = moduleTop(files, imp.module);
        const f2 = files.get(imp.module);
        if (t2.consts.has(imp.name)) {
          const d = t2.consts.get(imp.name);
          if (d.initializer && isLiteralValue(d.initializer)) { T.addConstant(f2, [imp.name, ...focus].join('.'), d.initializer, `imported by ${env.file.path}`); return; }
          const menv = T.env(f2, MODULE_FN, env.depth, new Map(), null);
          T.addNode(menv, d, imp.name, d.initializer);
          if (d.initializer) T.expr(d.initializer, menv, focus);
        }
      }
    },

    /** An entry-point parameter: a DB row field, a config field (→ logic variable), or an opaque input. */
    unboundParam(env, prm, pathParts, focus) {
      const fnName = T.fnName(env.fn);
      const pname = prm.param.name.getText(env.file.sf);
      const row = env.rowSource && env.rowSource.param === (ts.isIdentifier(prm.param.name) ? prm.param.name.text : null) ? env.rowSource : null;
      if (row) {
        const col = focus.find((x) => x !== '*');
        if (col) { T.addInput(`row:${row.builder}.${col}`, { kind: 'row', builder: row.builder, file: row.file, column: col }); return; }
      }
      const names = [...focus].reverse().filter((x) => x !== '*');
      const leaf = names[0] || (ts.isIdentifier(prm.param.name) ? prm.param.name.text : null) || (prm.element ? prm.element.name.getText(env.file.sf) : null);
      const candidates = [];
      if (prm.element) candidates.push(prm.element.name.getText(env.file.sf));
      if (leaf) candidates.push(leaf);
      for (const c of candidates) {
        const lv = configMap.get(c);
        if (lv && lv.size) {
          for (const k of [...lv].sort()) T.addInput(`lv:${k}`, { kind: 'logic_variable', key: k, via: `${fnName}(${c})` });
          return;
        }
      }
      const label = [pname.startsWith('{') ? (prm.element ? prm.element.name.getText(env.file.sf) : 'param') : pname, ...focus.filter((x) => x !== '*')].join('.');
      T.addInput(`param:${fnName}.${label}`, { kind: 'param', fn: fnName, path: label, file: env.file.path });
    },
  };
  return T;
}

/** Entry: trace an expression node inside function `fnName` of `rel`. */
export function traceIn(T, files, rel, fnName, exprNode, focus = [], extra = {}) {
  const file = files.get(rel);
  const top = moduleTop(files, rel);
  const fn = top.functions.get(fnName);
  if (!fn) throw new Error(`report-fields: ${rel} has no function ${fnName}`);
  const env = T.env(file, fn, 0, new Map(), null, extra);
  T.expr(exprNode, env, focus);
  return env;
}

/**
 * The config map of a step module: identifier/property name → logic-variable keys, from `config.<key>` reads
 * (`const x = Number(config.k)`, `{ name: config.k }`, and a call-arg `{ name: x }` re-binding of such an x).
 */
export function configMapOf(files, rels, lvKeys) {
  const map = new Map();
  const add = (name, key) => { if (!map.has(name)) map.set(name, new Set()); map.get(name).add(key); };
  for (const rel of rels) {
    const f = files.get(rel);
    if (!f) continue;
    const local = new Map(); // var name -> keys
    const keysIn = (n) => {
      const ks = [];
      const go = (x) => {
        if (ts.isPropertyAccessExpression(x) && x.name && lvKeys.has(x.name.text)) {
          const recv = x.expression.getText(f.sf);
          if (/(^|\.)config$/.test(recv)) ks.push(x.name.text);
        }
        ts.forEachChild(x, go);
      };
      go(n);
      return ks;
    };
    const visit = (n) => {
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
        const ks = keysIn(n.initializer);
        if (ks.length && !ts.isObjectLiteralExpression(unwrap(n.initializer))) { for (const k of ks) add(n.name.text, k); local.set(n.name.text, ks); }
      }
      if (ts.isPropertyAssignment(n)) {
        const name = n.name.getText(f.sf);
        const init = unwrap(n.initializer);
        const ks = keysIn(n.initializer);
        if (ks.length && !ts.isObjectLiteralExpression(init)) for (const k of ks) add(name, k);
        else if (ts.isIdentifier(init) && local.has(init.text)) for (const k of local.get(init.text)) add(name, k);
      }
      if (ts.isShorthandPropertyAssignment(n) && local.has(n.name.text)) for (const k of local.get(n.name.text)) add(n.name.text, k);
      ts.forEachChild(n, visit);
    };
    visit(f.sf);
    // second pass: call-arg re-bindings that reference locals declared later in source order
    visit(f.sf);
  }
  return map;
}
