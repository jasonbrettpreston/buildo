// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md (report surfaces; generator home — PROVISIONAL, design §4.2)
//            docs/specs/01-pipeline/69_mcbylaw_policy.md M-69 (the generated report-field inventory is the denominator)
//            docs/specs/01-pipeline/68_mcbylaw_standard.md §6.4 rule 8 (code is parsed, never executed)
//            .cursor/mcbylaw/phase3-prework/generator-design.md §2 G3 (SQL formula chain)
//
// G3 — per-target-alias SQL lineage of a pure SQL builder, by STATIC template render: the builder's returned template
// literal is read with the TypeScript compiler API; every `${…}` span is replaced by the placeholder `1` (a valid
// expression, `$1` parameter and string body), and the result is parsed with the real Postgres grammar (libpg-query,
// loaded through the sql-witness resolver's `init()`). No JS is executed here. Every parse-node location (a UTF-8 byte
// offset) maps back to a source offset, so each chain node carries its exact file:line, and each literal is either
// INSIDE a span (an interpolated JS value, resolved later by the JS def-use walker) or an inline SQL literal.
//
// The lineage is a graph of scopes (the statement, each CTE, each FROM subselect, each scalar SubLink). A scope output
// (target alias) depends on the ColumnRefs of its expression; a ColumnRef resolves to another scope's output (a CTE,
// a subselect, a `x.*` passthrough) or to a base `table.column`. Set operations resolve each arm as its own scope and
// union the deps by position (the resolver's 2026-10-07 set-op rule). Filters (WHERE / JOIN ON) are not value deps.

import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const resolver = require('../../lib/sql-witness/resolve.cjs');

let lq = null;

/** Load libpg-query through the witness resolver (one wasm load per process). */
export async function initSql() {
  await resolver.init();
  if (!lq) lq = require('libpg-query');
  return { resolver, lq };
}

export function libpg() {
  if (!lq) throw new Error('report-fields: initSql() was not awaited');
  return lq;
}

const PLACEHOLDER = '1';

// ------------------------------------------------------------------ template render (static)

/** The function declaration named `name` at the top level of a source file (function decl or const arrow/function). */
export function findFunction(sf, name) {
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.name && st.name.text === name) return st;
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.name.text === name && d.initializer
          && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))) return d.initializer;
      }
    }
  }
  return null;
}

/** The template literal the function returns (its own body only, not nested functions). */
function returnedTemplate(fn) {
  let found = null;
  const visit = (n) => {
    if (found) return;
    if (n !== fn && (ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n))) return;
    if (ts.isReturnStatement(n) && n.expression) {
      const e = n.expression;
      if (ts.isTemplateExpression(e) || ts.isNoSubstitutionTemplateLiteral(e)) { found = e; return; }
    }
    ts.forEachChild(n, visit);
  };
  if (fn.body) ts.forEachChild(fn.body, visit);
  return found;
}

/**
 * Render a builder's returned template statically. → {sql, segments, spans, text, sf, tpl}
 * segments: [{rStart, rEnd, sStart, span: index|null}] in CHAR offsets of `sql` and the (LF) source text.
 */
export function renderTemplate(file, fnName, empty = new Set()) {
  const { sf, text } = file;
  const fn = findFunction(sf, fnName);
  if (!fn) throw new Error(`report-fields: ${file.path} has no function ${fnName}`);
  const tpl = returnedTemplate(fn);
  if (!tpl) throw new Error(`report-fields: ${file.path}#${fnName} does not return a template literal`);
  const segments = [];
  const spans = [];
  let sql = '';
  const pushText = (sStart, sEnd) => {
    const chunk = text.slice(sStart, sEnd);
    segments.push({ rStart: sql.length, rEnd: sql.length + chunk.length, sStart, span: null });
    sql += chunk;
  };
  if (ts.isNoSubstitutionTemplateLiteral(tpl)) {
    pushText(tpl.getStart(sf) + 1, tpl.getEnd() - 1);
  } else {
    pushText(tpl.head.getStart(sf) + 1, tpl.head.getEnd() - 2);
    for (const s of tpl.templateSpans) {
      const idx = spans.length;
      const sStart = s.expression.getStart(sf);
      const sOuter = text.lastIndexOf('${', sStart);
      spans.push({ index: idx, expr: s.expression, sStart, sOuter, text: s.expression.getText(sf) });
      const ph = empty.has(idx) ? '' : PLACEHOLDER;
      segments.push({ rStart: sql.length, rEnd: sql.length + ph.length, sStart, sOuter, span: idx });
      sql += ph;
      const lit = s.literal;
      const tail = ts.isTemplateTail(lit);
      pushText(lit.getStart(sf) + 1, lit.getEnd() - (tail ? 1 : 2));
    }
  }
  return { sql, segments, spans, fn, tpl, file, fnName, empty };
}

/**
 * Render + parse, retrying with an EMPTY placeholder for a span that sits in a statement-fragment position
 * (`AND (x) ${extraPredicate}`), located by the parser's cursor. Bounded by the span count.
 */
export function renderAndParse(file, fnName, catalog, externals) {
  const empty = new Set();
  for (;;) {
    const render = renderTemplate(file, fnName, empty);
    try {
      return { render, lineage: buildLineage(render.sql, catalog, externals, render) };
    } catch (err) {
      const cur = err && err.sqlDetails && err.sqlDetails.cursorPosition;
      if (cur == null) throw err;
      if (process.env.RF_DEBUG) console.error("parse retry", err.message, cur, [...empty]);
      const rOff = Math.max(0, cur - 1); // libpg-query cursorPosition: 1-based, measured in chars (verified on a non-ASCII render)
      let best = null;
      for (const seg of render.segments) {
        if (seg.span == null || empty.has(seg.span)) continue;
        const d = Math.abs(seg.rStart - rOff);
        if (best == null || d < best.d) best = { d, span: seg.span };
      }
      if (!best || best.d > 2) throw new Error(`report-fields: ${file.path}#${fnName} does not parse: ${err.message}`);
      empty.add(best.span);
    }
  }
}

/** UTF-8 byte offset → char offset, for one string. */
function byteToCharMap(s) {
  const map = new Map();
  let b = 0;
  for (let i = 0; i < s.length; i++) {
    map.set(b, i);
    const cp = s.codePointAt(i);
    const len = cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
    if (cp >= 0x10000) i++;
    b += len;
  }
  map.set(b, s.length);
  return (byte) => {
    if (map.has(byte)) return map.get(byte);
    let k = byte;
    while (k > 0 && !map.has(k)) k--;
    return map.get(k) ?? 0;
  };
}

/** Render char offset → {sOff, span} through the segment map. */
function locate(render, rOff) {
  const segs = render.segments;
  let lo = 0;
  let hi = segs.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const s = segs[mid];
    if (rOff < s.rStart) hi = mid - 1;
    else if (rOff >= s.rEnd && !(s.rEnd === s.rStart && rOff === s.rStart)) lo = mid + 1;
    else return { sOff: s.span == null ? s.sStart + (rOff - s.rStart) : s.sOuter, span: s.span };
  }
  const last = segs[segs.length - 1];
  return { sOff: last.sStart + (last.rEnd - last.rStart), span: null };
}

// ------------------------------------------------------------------ parse-tree helpers

const sval = (n) => (n && n.String ? n.String.sval : null);

function constValue(c) {
  if (!c) return null;
  if (c.ival) return { kind: 'num', value: typeof c.ival.ival === 'number' ? c.ival.ival : 0 };
  if (c.fval) return { kind: 'num', value: Number(c.fval.fval) };
  if (c.sval) return { kind: 'str', value: c.sval.sval };
  if (c.boolval) return { kind: 'bool', value: !!c.boolval.boolval };
  if (c.isnull) return { kind: 'null', value: null };
  return null;
}

/** Visit an expression tree, never descending into a nested scope body (SubLink.subselect). */
function walkExpr(node, visit) {
  if (node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const x of node) walkExpr(x, visit); return; }
  if (visit(node) === false) return;
  for (const k of Object.keys(node)) {
    if (k === 'subselect' && node.subLinkType !== undefined) continue;
    walkExpr(node[k], visit);
  }
}

/** Round-precision argument of round(x, n): not a value constant (formatting), never reported. */
function isRoundPrecision(parent, idx) {
  if (!parent || !parent.FuncCall) return false;
  const name = (parent.FuncCall.funcname || []).map(sval).filter(Boolean).pop();
  return name === 'round' && idx === 1;
}

// ------------------------------------------------------------------ lineage

let scopeSeq = 0;
let currentRender = null; // the render every scope of the statement being built belongs to
let currentExternals = new Map(); // temp table name -> root scope of the builder that CREATEs it

class Scope {
  constructor(label, parent) {
    this.label = label;
    this.parent = parent;
    this.sources = []; // {alias, kind:'table'|'scope'|'func', table?, scope?}
    this.outputs = new Map(); // name -> {name, expr, loc, star?: {scope|table, col}}
    this.order = [];
    this.ctes = new Map();
    this.uid = ++scopeSeq;
    this.render = currentRender;
    this.boundaryLoc = null; // byte location of the FROM clause (end of the target list)
  }
  cte(name) {
    if (this.ctes.has(name)) return this.ctes.get(name);
    return this.parent ? this.parent.cte(name) : null;
  }
  addOutput(o) {
    if (!this.outputs.has(o.name)) { this.outputs.set(o.name, o); this.order.push(o.name); }
  }
}

/**
 * Build the scope graph of one parsed statement. `catalog`: Map<table, Set<column>> (schema.ts) for `t.*` and the
 * binding of unqualified columns against base tables.
 */
export function buildLineage(sql, catalog, externals = new Map(), render = null) {
  currentExternals = externals;
  currentRender = render;
  const tree = libpg().parseSync(sql);
  const stmts = tree.stmts.map((s) => s.stmt);
  if (stmts.length !== 1) throw new Error(`report-fields: expected one statement, got ${stmts.length}`);
  const st = stmts[0];
  let root;
  let creates = null;
  if (st.CreateTableAsStmt) {
    creates = st.CreateTableAsStmt.into && st.CreateTableAsStmt.into.rel ? st.CreateTableAsStmt.into.rel.relname : null;
    root = selectScope(st.CreateTableAsStmt.query.SelectStmt, 'select', null, catalog);
  } else if (st.SelectStmt) {
    root = selectScope(st.SelectStmt, 'select', null, catalog);
  } else if (st.UpdateStmt) {
    root = updateScope(st.UpdateStmt, catalog);
  } else {
    throw new Error(`report-fields: unsupported statement kind ${Object.keys(st)[0]}`);
  }
  return { root, creates, sql };
}

function addCtes(scope, withClause, catalog) {
  if (!withClause) return;
  for (const c of withClause.ctes || []) {
    const cte = c.CommonTableExpr;
    const body = cte.ctequery.SelectStmt;
    const s = selectScope(body, cte.ctename, scope, catalog);
    s.cteLoc = cte.location;
    scope.ctes.set(cte.ctename, s);
  }
}

function addFrom(scope, items, catalog) {
  for (const it of items || []) {
    if (it.RangeVar) {
      const rv = it.RangeVar;
      const alias = rv.alias ? rv.alias.aliasname : rv.relname;
      const cte = scope.cte(rv.relname);
      const ext = currentExternals.get(rv.relname);
      if (cte && !rv.schemaname) scope.sources.push({ alias, kind: 'scope', scope: cte });
      else if (ext) scope.sources.push({ alias, kind: 'scope', scope: ext });
      else scope.sources.push({ alias, kind: 'table', table: rv.relname });
    } else if (it.RangeSubselect) {
      const rs = it.RangeSubselect;
      const alias = rs.alias ? rs.alias.aliasname : `subselect${scope.sources.length}`;
      const sub = selectScope(rs.subquery.SelectStmt, alias, scope, catalog);
      scope.sources.push({ alias, kind: 'scope', scope: sub });
    } else if (it.JoinExpr) {
      addFrom(scope, [it.JoinExpr.larg, it.JoinExpr.rarg], catalog);
    } else if (it.RangeFunction) {
      const rf = it.RangeFunction;
      scope.sources.push({ alias: rf.alias ? rf.alias.aliasname : 'func', kind: 'func' });
    }
  }
}

function firstLoc(items) {
  for (const it of items || []) {
    const v = it && (it.RangeVar || it.RangeSubselect || it.JoinExpr || it.RangeFunction);
    if (v && typeof v.location === 'number') return v.location;
    if (it && it.JoinExpr) { const l = firstLoc([it.JoinExpr.larg]); if (l != null) return l; }
    if (it && it.RangeSubselect) return null;
  }
  return null;
}

function selectScope(sel, label, parent, catalog) {
  if (sel.op && sel.op !== 'SETOP_NONE') {
    // Set operation: each arm is its own scope; output i = union of the arms' output i.
    const s = new Scope(label, parent);
    addCtes(s, sel.withClause, catalog);
    const l = selectScope(sel.larg, `${label}#l`, s, catalog);
    const r = selectScope(sel.rarg, `${label}#r`, s, catalog);
    s.setop = [l, r];
    l.order.forEach((name, i) => s.addOutput({ name, setop: [{ scope: l, col: name }, { scope: r, col: r.order[i] }], loc: l.outputs.get(name).loc }));
    return s;
  }
  const s = new Scope(label, parent);
  addCtes(s, sel.withClause, catalog);
  addFrom(s, sel.fromClause, catalog);
  s.boundaryLoc = firstLoc(sel.fromClause);
  s.filters = { where: sel.whereClause, having: sel.havingClause, sort: sel.sortClause, limit: sel.limitCount, joins: joinQuals(sel.fromClause) };
  const targets = sel.targetList || (sel.valuesLists ? [] : []);
  targets.forEach((t, i) => {
    const rt = t.ResTarget;
    const v = rt.val;
    if (v && v.ColumnRef && v.ColumnRef.fields.some((f) => f.A_Star)) {
      expandStar(s, v.ColumnRef, catalog, rt.location);
      return;
    }
    let name = rt.name;
    if (!name && v && v.ColumnRef) name = sval(v.ColumnRef.fields[v.ColumnRef.fields.length - 1]);
    if (!name && v && v.FuncCall) name = sval(v.FuncCall.funcname[v.FuncCall.funcname.length - 1]);
    if (!name) name = `?column?${i}`;
    const next = targets[i + 1] ? targets[i + 1].ResTarget.location : null;
    s.addOutput({ name, expr: v, loc: rt.location, endLoc: next });
  });
  return s;
}

function updateScope(upd, catalog) {
  const s = new Scope('update', null);
  addCtes(s, upd.withClause, catalog);
  const rel = upd.relation;
  s.sources.push({ alias: rel.alias ? rel.alias.aliasname : rel.relname, kind: 'table', table: rel.relname });
  addFrom(s, upd.fromClause, catalog);
  s.updates = rel.relname;
  const targets = upd.targetList || [];
  targets.forEach((t, i) => {
    const rt = t.ResTarget;
    const next = targets[i + 1] ? targets[i + 1].ResTarget.location : null;
    s.addOutput({ name: rt.name, expr: rt.val, loc: rt.location, endLoc: next });
  });
  s.boundaryLoc = firstLoc(upd.fromClause);
  s.filters = { where: upd.whereClause, joins: joinQuals(upd.fromClause) };
  return s;
}

/** JOIN … ON quals of a FROM list (selection, not value). */
function joinQuals(items) {
  const out = [];
  const go = (it) => { if (it && it.JoinExpr) { if (it.JoinExpr.quals) out.push(it.JoinExpr.quals); go(it.JoinExpr.larg); go(it.JoinExpr.rarg); } };
  for (const it of items || []) go(it);
  return out;
}

/** Literals + interpolation sites of a scope's selection clauses (WHERE / ON / ORDER BY / LIMIT / HAVING). */
function filterConstants(scope) {
  const literals = [];
  const spanLocs = [];
  let loc = null;
  const f = scope.filters || {};
  const visitParentArgs = new Map();
  for (const k of ['where', 'joins', 'sort', 'limit', 'having']) {
    walkExpr(f[k], (n) => {
      if (n.FuncCall && Array.isArray(n.FuncCall.args)) n.FuncCall.args.forEach((a, i) => visitParentArgs.set(a, { parent: n, idx: i }));
      if (n.ParamRef) { spanLocs.push(n.ParamRef.location); if (loc == null) loc = n.ParamRef.location; return false; }
      if (n.A_Const) {
        const pa = visitParentArgs.get(n);
        const v = constValue(n.A_Const);
        if (v && !(pa && isRoundPrecision(pa.parent, pa.idx))) { literals.push({ ...v, loc: n.A_Const.location }); if (loc == null) loc = n.A_Const.location; }
        return false;
      }
      return true;
    });
  }
  return { literals, spanLocs, loc };
}

function expandStar(s, colRef, catalog, loc) {
  const q = colRef.fields.length > 1 ? sval(colRef.fields[0]) : null;
  const srcs = q ? s.sources.filter((x) => x.alias === q) : s.sources;
  for (const src of srcs) {
    if (src.kind === 'scope') {
      for (const name of src.scope.order) s.addOutput({ name, star: { scope: src.scope, col: name }, loc });
    } else if (src.kind === 'table') {
      const cols = catalog.get(src.table);
      if (cols) for (const name of [...cols].sort()) s.addOutput({ name, star: { table: src.table, col: name }, loc });
    }
  }
}

/** Resolve one ColumnRef in a scope → {scope, col} | {table, col} | null. */
function resolveRef(scope, fields, catalog) {
  const names = fields.map(sval);
  if (names.some((n) => n == null)) return null;
  const col = names[names.length - 1];
  const q = names.length >= 2 ? names[names.length - 2] : null;
  for (let s = scope; s; s = s.parent) {
    if (q) {
      const src = s.sources.find((x) => x.alias === q);
      if (!src) continue;
      if (src.kind === 'scope') return src.scope.outputs.has(col) ? { scope: src.scope, col } : { unresolved: `${q}.${col}` };
      if (src.kind === 'table') return { table: src.table, col };
      return { func: q, col };
    }
    for (const src of s.sources) {
      if (src.kind === 'scope' && src.scope.outputs.has(col)) return { scope: src.scope, col };
    }
    const tables = s.sources.filter((x) => x.kind === 'table' && catalog.get(x.table) && catalog.get(x.table).has(col));
    if (tables.length) return { table: tables[0].table, col };
    if (s.sources.length === 1 && s.sources[0].kind === 'table' && !catalog.get(s.sources[0].table)) return { table: s.sources[0].table, col };
  }
  return { unresolved: col };
}

/** jsonb_build_object focus: the value expression paired with key `key`, else null. */
function focusJsonb(expr, key) {
  let hit = null;
  walkExpr(expr, (n) => {
    if (hit) return false;
    if (n.FuncCall) {
      const fname = n.FuncCall.funcname.map(sval).filter(Boolean).pop();
      if (fname === 'jsonb_build_object' || fname === 'json_build_object') {
        const args = n.FuncCall.args || [];
        for (let i = 0; i + 1 < args.length; i += 2) {
          const k = args[i].A_Const && constValue(args[i].A_Const);
          if (k && k.kind === 'str' && k.value === key) { hit = args[i + 1]; return false; }
        }
      }
    }
    return true;
  });
  return hit;
}

/**
 * Deps of one scope output: [{scope, col} | {table, col} | {unresolved}], literals [{value, loc}], spans [loc].
 * A scalar SubLink contributes its first target's deps (its value), resolved in the sub-scope.
 */
function outputDeps(scope, out, catalog, focusKey) {
  const deps = [];
  const literals = [];
  const spanLocs = [];
  if (out.star) { deps.push(out.star.scope ? { scope: out.star.scope, col: out.star.col } : { table: out.star.table, col: out.star.col }); return { deps, literals, spanLocs, carry: focusKey }; }
  if (out.setop) { for (const a of out.setop) deps.push({ scope: a.scope, col: a.col }); return { deps, literals, spanLocs, carry: focusKey }; }
  let expr = out.expr;
  let carry = null; // a focus not satisfied here is carried to the deps (a passthrough of the jsonb column)
  if (focusKey) {
    const f = focusJsonb(expr, focusKey);
    if (f) expr = f;
    else carry = focusKey;
  }
  const visitParentArgs = new Map();
  walkExpr(expr, (n) => {
    if (n.FuncCall && Array.isArray(n.FuncCall.args)) n.FuncCall.args.forEach((a, i) => visitParentArgs.set(a, { parent: n, idx: i }));
    if (n.ColumnRef) {
      if (n.ColumnRef.fields.some((f) => f.A_Star)) return false;
      deps.push(resolveRef(scope, n.ColumnRef.fields, catalog));
      return false;
    }
    if (n.ParamRef) { spanLocs.push(n.ParamRef.location); return false; }
    if (n.A_Const) {
      const pa = visitParentArgs.get(n);
      const v = constValue(n.A_Const);
      if (v && !(pa && isRoundPrecision(pa.parent, pa.idx))) literals.push({ ...v, loc: n.A_Const.location });
      return false;
    }
    if (n.SubLink && n.SubLink.subselect) {
      const sub = selectScope(n.SubLink.subselect.SelectStmt, `sublink@${n.SubLink.location}`, scope, catalog);
      const first = sub.order[0];
      if (first != null) deps.push({ scope: sub, col: first });
      if (n.SubLink.testexpr) walkExpr(n.SubLink.testexpr, () => true);
      return true; // testexpr etc. still walked; subselect skipped by walkExpr
    }
    if (n.TypeCast && n.TypeCast.arg && n.TypeCast.arg.A_Const) {
      // the ::numeric cast of a placeholder or literal — the arg is visited next
    }
    return true;
  });
  return { deps, literals, spanLocs, carry };
}

/** Is a scope output a pure passthrough (a bare column ref / star) — collapsed out of the chain. */
function isPassthrough(out) {
  if (out.star || out.setop) return true;
  let e = out.expr;
  while (e && e.TypeCast) e = e.TypeCast.arg;
  return !!(e && e.ColumnRef);
}

/**
 * Trace one output of the root scope back to base columns. Returns
 * {nodes: [{id, scope, name, loc, endLoc, deps:[ids|base], literals, spanLocs}], bases: [table.col], unresolved: []}.
 * Passthrough outputs (`x.col`, `x.*`) are collapsed: their deps are inherited, they get no node of their own
 * unless they are the traced output itself.
 */
export function traceOutput(lineage, colName, catalog, focusKey = null, collapseRoot = false) {
  const root = lineage.root;
  if (!root.outputs.has(colName)) return null;
  const nodes = new Map();
  const bases = new Set();
  const unresolved = new Set();
  const filtered = new Set();
  const idOf = (scope, col) => (scope.render && root.render && scope.render !== root.render
    ? `${scope.render.fnName}:${scope.label}.${col}` : `${scope.label}.${col}`);

  const visit = (scope, col, isRoot, focus) => {
    const out = scope.outputs.get(col);
    if (!out) { unresolved.add(idOf(scope, col)); return []; }
    const key = `${scope.uid}:${col}:${focus || ''}`;
    if (nodes.has(key)) return nodes.get(key).passthrough ? nodes.get(key).inherited : [nodes.get(key).id];
    const { deps, literals, spanLocs, carry } = outputDeps(scope, out, catalog, focus);
    const pass = (!isRoot || collapseRoot) && isPassthrough(out) && literals.length === 0;
    if (!filtered.has(scope.uid)) {
      filtered.add(scope.uid);
      const fc = filterConstants(scope);
      if (fc.literals.length || fc.spanLocs.length) {
        nodes.set(`${scope.uid}:(filter)`, { id: idOf(scope, '(filter)'), uid: `${scope.uid}:(filter)`, render: scope.render, scope: scope.label, name: '(filter)', loc: fc.loc, endLoc: null, boundaryLoc: null, deps: [], literals: fc.literals, spanLocs: fc.spanLocs, passthrough: false, inherited: [], filter: true });
      }
    }
    const node = { id: idOf(scope, col), uid: key, render: scope.render, scopeObj: scope, scope: scope.label, name: col, loc: out.loc, endLoc: out.endLoc, boundaryLoc: scope.boundaryLoc, deps: [], literals, spanLocs, passthrough: pass, inherited: [] };
    nodes.set(key, node);
    const resolved = [];
    for (const d of deps) {
      if (!d) continue;
      if (d.unresolved) { unresolved.add(d.unresolved); continue; }
      if (d.func) continue;
      if (d.table) { const b = `${d.table}.${d.col}`; bases.add(b); resolved.push(b); continue; }
      resolved.push(...visit(d.scope, d.col, false, carry));
    }
    const uniq = [...new Set(resolved)];
    if (pass) { node.inherited = uniq; return uniq; }
    node.deps = uniq;
    return [node.id];
  };
  visit(root, colName, true, focusKey);
  const list = [...nodes.values()].filter((n) => !n.passthrough);
  return { nodes: list, bases: [...bases].sort(), unresolved: [...unresolved].sort() };
}

/**
 * Base columns of a column reference given as TEXT (`'s.zoning_class'`, `'nbhd_income'`) — a string argument a nested
 * SQL-fragment builder interpolates into this scope. Resolved exactly as a ColumnRef at that position would be.
 */
export function basesOfColumnText(scope, text, catalog) {
  if (!/^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$/.test(text)) return [];
  const fields = text.split('.').map((x) => ({ String: { sval: x } }));
  const bases = new Set();
  const seen = new Set();
  const go = (d) => {
    if (!d || d.unresolved || d.func) return;
    if (d.table) { bases.add(`${d.table}.${d.col}`); return; }
    const k = `${d.scope.uid}:${d.col}`;
    if (seen.has(k)) return;
    seen.add(k);
    const out = d.scope.outputs.get(d.col);
    if (!out) return;
    for (const x of outputDeps(d.scope, out, catalog, null).deps) go(x);
  };
  go(resolveRef(scope, fields, catalog));
  return [...bases].sort();
}

/** Map byte locations of a traced node to source info via the render. */
export function nodeSource(render, loc) {
  const b2c = render._b2c || (render._b2c = byteToCharMap(render.sql));
  return locate(render, b2c(loc));
}

/** A clean one-line excerpt of a target expression from the source (comments stripped, whitespace collapsed). */
export function excerpt(render, startLoc, endLoc) {
  const b2c = render._b2c || (render._b2c = byteToCharMap(render.sql));
  const r0 = b2c(startLoc);
  const r1 = endLoc != null ? b2c(endLoc) : render.sql.length;
  const s0 = locate(render, r0).sOff;
  const s1 = locate(render, Math.max(r0, r1 - 1)).sOff + 1;
  let t = render.file.text.slice(s0, Math.max(s0, s1));
  t = t.split('\n').map((l) => l.replace(/--.*$/, '')).join(' ');
  t = t.replace(/\s+/g, ' ').trim().replace(/,\s*$/, '').replace(/\bFROM\b.*$/i, (m) => (m.length > 0 && endLoc == null ? '' : m)).trim();
  return t.length > 220 ? `${t.slice(0, 219)}…` : t;
}

/** Which template span a byte location falls in (null = inline SQL text). */
export function spanAt(render, loc) {
  return nodeSource(render, loc).span;
}
