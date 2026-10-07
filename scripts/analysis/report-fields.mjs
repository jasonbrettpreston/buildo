// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md (REPORT/LIST surfaces — generator home, PROVISIONAL per
//            generator-design.md §4.2), docs/specs/01-pipeline/69_mcbylaw_policy.md M-69 (the generated report-field
//            inventory is the denominator; kind ∈ formula · empirical · cost · input), docs/specs/01-pipeline/68_mcbylaw_standard.md
//            §6.4 rule 8 (code is parsed, not executed), §9 G-CODE (constant classes via code-link), §6.5 (dsl_target)
//            Design: .cursor/mcbylaw/phase3-prework/generator-design.md
//
// MaxBLD REPORT-FIELD INVENTORY GENERATOR. One row per calculated field a MaxBLD report surface renders (plus the
// whitelisted payload-only fields), each with: the screens and render site, label, formatter, payload path and DB
// column, the producing step (lineage snapshot), the formula chain (SQL: static template render + libpg-query
// per-target lineage, witnessed by fingerprint against the committed sql-witness trace; JS: a bounded TypeScript
// def-use walk), every constant on the chain classified through scripts/analysis/bylaw/code-link.mjs (named
// constants, logic variables, inline literals, DB-seeded rate rows), the Layer-2 dsl_targets its inputs map to
// (scripts/seeds/bylaw/vocab.json via the declared table in scripts/surfaces/_schema/report-fields.decl.json),
// the M-69 kind, the variants and an evidence class.
//
//   node scripts/analysis/report-fields.mjs --write   render docs/reference/maxbld-report-field-inventory.{md,json}
//   node scripts/analysis/report-fields.mjs --check   exit 1 when the committed render differs (drift); 2 = structural
//
// Deterministic: sorted keys and rows, LF, no clock, no git head; inputs are fingerprinted (sha256) in the header.
// No DB. Executes no step: the only JS executed is the witness render of the pure SQL-string builders (PROVISIONAL —
// generator-design.md §4.1 option (b)+(a)); the chain itself comes from the static render.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import { createContext, classifyConstants } from './bylaw/code-link.mjs';
import { initSql, libpg, renderAndParse, traceOutput, nodeSource, excerpt, basesOfColumnText } from './report-fields/sql-lineage.mjs';
import { createFiles, createTracer, configMapOf, moduleTop } from './report-fields/js-lineage.mjs';
import {
  renderedPaths, renderedLocals, consumerMap, columnOfPath, trackedProjection, exportedConst, perSqmIds, jsxLine,
} from './report-fields/display.mjs';

const require = createRequire(import.meta.url);

export const GENERATOR_VERSION = 1;
export const DECL_PATH = 'scripts/surfaces/_schema/report-fields.decl.json';
export const KINDS = Object.freeze(['cost', 'empirical', 'formula', 'input']);
export const EVIDENCE = Object.freeze({ R: 'traced in code (file:line)', W: 'R + the rendered builder SQL fingerprint is in the committed sql-witness trace', I: 'inferred: the walk was cut (call depth) or a ref did not resolve' });

export class ReportFieldsError extends Error {}

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const uniqSorted = (xs) => [...new Set(xs)].sort(cmp);
// Input fingerprints are sha256 truncated to 16 hex (64 bits) — the bylaw-code-findings.md convention: a drift
// signal over a few dozen committed files, not a collision-resistant content address.
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex').slice(0, 16);

// ------------------------------------------------------------------ DB constants (migration INSERT rows, parsed)

function dbRows(sql, spec) {
  const tree = libpg().parseSync(sql);
  const rows = [];
  for (const s of tree.stmts) {
    const ins = s.stmt.InsertStmt;
    if (!ins || ins.relation.relname !== spec.table) continue;
    const cols = ins.cols.map((c) => c.ResTarget.name);
    for (const vl of ins.selectStmt.SelectStmt.valuesLists || []) {
      const vals = vl.List.items.map((it) => {
        let n = it;
        while (n && n.TypeCast) n = n.TypeCast.arg;
        const c = n && n.A_Const;
        if (!c) return null;
        if (c.ival) return Number(c.ival.ival ?? 0); // libpg-query v18: 0 is an empty ival; > int4 arrives as fval
        if (c.fval) { const v = Number(c.fval.fval); return Number.isFinite(v) ? v : null; }
        if (c.sval) return c.sval.sval;
        if (c.boolval) return !!c.boolval.boolval;
        return null;
      });
      const row = {};
      cols.forEach((c, i) => { row[c] = vals[i]; });
      rows.push(row);
    }
  }
  return rows;
}

// ------------------------------------------------------------------ the build

export async function buildInventory({ root }) {
  await initSql();
  const inputTexts = new Map();
  const readText = (rel) => {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) throw new ReportFieldsError(`missing input ${rel}`);
    const t = fs.readFileSync(abs, 'utf8').replace(/\r\n/g, '\n');
    inputTexts.set(rel, t);
    return t;
  };
  const readJson = (rel) => {
    const t = readText(rel);
    try { return JSON.parse(t); } catch (e) { throw new ReportFieldsError(`${rel} is not valid JSON (${e.message})`); }
  };
  const decl = readJson(DECL_PATH);
  const vocab = readJson('scripts/seeds/bylaw/vocab.json');
  const lineage = readJson('scripts/seeds/lineage-meta-snapshot.json');
  const lvs = readJson('scripts/seeds/logic_variables.json');
  const lvKeys = new Set(Object.keys(lvs));
  const ctx = createContext({ root });
  const catalog = ctx.columnsTs;
  const files = createFiles(root);
  const findings = [];
  const finding = (code, detail, field = null) => findings.push({ code, field, detail });
  const maxDepth = decl.max_call_depth;
  const scopeParams = new Set(decl.scope_params || []);

  // -------------------------------------------------- G2 producers (lineage snapshot)
  const writers = new Map(); // parcels column -> [step]
  for (const [step, e] of Object.entries(lineage.inchain)) {
    for (const c of (e.writes && e.writes.parcels) || []) {
      if (!writers.has(c)) writers.set(c, []);
      writers.get(c).push(step);
    }
  }
  for (const v of writers.values()) v.sort(cmp);

  // -------------------------------------------------- SQL builders (static render + parse), witness
  const builders = new Map();
  const builderOf = (rel, fn, externals = new Map()) => {
    const key = `${rel}#${fn}${externals.size ? `|${[...externals.keys()].sort().join(',')}` : ''}`;
    if (builders.has(key)) return builders.get(key);
    const file = files.get(rel);
    if (!file) throw new ReportFieldsError(`declared file ${rel} does not exist`);
    const r = renderAndParse(file, fn, catalog, externals);
    const b = { key, rel, fn, ...r };
    builders.set(key, b);
    return b;
  };
  const traceFps = new Map(); // step -> Set
  for (const [step, list] of Object.entries(decl.witness_traces)) {
    const s = new Set();
    for (const rel of list) { const j = readJson(rel); for (const st of j.statements || []) s.add(st.fingerprint); }
    traceFps.set(step, s);
  }
  const witnessOf = (rel, fn, args, step) => {
    try {
      const mod = require(path.join(root, rel));
      const f = mod[fn];
      if (typeof f !== 'function') { finding('witness_render_failed', `${rel}#${fn}: not exported`); return { witnessed: false, reason: 'builder not exported' }; }
      const sql = Array.isArray(args) ? f(...args) : f(args || {});
      const text = typeof sql === 'string' ? sql : sql && sql.sql;
      const fp = libpg().fingerprintSync(text);
      const set = traceFps.get(step) || new Set();
      return { witnessed: set.has(fp), fingerprint: fp, traces: decl.witness_traces[step] || [] };
    } catch (e) {
      finding('witness_render_failed', `${rel}#${fn}: ${e.message}`);
      return { witnessed: false, reason: `render failed: ${e.message}` };
    }
  };

  // -------------------------------------------------- producer index: column -> producer
  const producerOfCol = new Map();
  const prodInfo = new Map();
  const dbTables = new Map();
  for (const spec of decl.db_constants) {
    const rows = dbRows(readText(spec.migration), spec);
    if (!rows.length) finding('db_seed_rows_missing', `${spec.table}: no INSERT … VALUES rows in ${spec.migration}`);
    dbTables.set(spec.table, { ...spec, rows });
  }

  for (const p of decl.producers) {
    const stepWrites = new Set(lineage.inchain[p.step]?.writes?.parcels ?? []);
    if (!stepWrites.size) throw new ReportFieldsError(`producer ${p.id}: step ${p.step} writes no parcels column in scripts/seeds/lineage-meta-snapshot.json`);
    const info = { ...p, columns: [], witness: {} };
    if (p.kind === 'sql') {
      const externals = new Map();
      for (const t of p.temp_inputs || []) {
        const tb = builderOf(p.file, t.builder);
        if (tb.lineage.creates) externals.set(tb.lineage.creates, tb.lineage.root);
        info.witness[t.builder] = witnessOf(p.file, t.builder, t.witness_args, p.step);
      }
      const b = builderOf(p.file, p.builder, externals);
      info.builderKey = b.key;
      info.witness[p.builder] = witnessOf(p.file, p.builder, p.witness_args, p.step);
      for (const c of b.lineage.root.order) if (stepWrites.has(c)) info.columns.push(c);
    } else if (p.kind === 'js_array') {
      const cols = exportedConst(files, p.file, p.columns_const);
      if (!cols || !Array.isArray(cols.value)) throw new ReportFieldsError(`${p.file}#${p.columns_const} is not a literal array`);
      if (!moduleTop(files, p.file).functions.get(p.fn)) throw new ReportFieldsError(`${p.file} has no function ${p.fn}`);
      info.columnOrder = cols.value;
      for (const c of cols.value) if (stepWrites.has(c)) info.columns.push(c);
    } else if (p.kind === 'js_object') {
      const f = files.get(p.file);
      const fn = moduleTop(files, p.file).functions.get(p.fn);
      if (!fn) throw new ReportFieldsError(`${p.file} has no function ${p.fn}`);
      const fixed = [];
      const visit = (n) => {
        if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(n.left)
          && n.left.expression.getText(f.sf) === p.object) fixed.push({ col: n.left.name.text, rhs: n.right, line: f.lineOf(n.getStart(f.sf)) });
        ts.forEachChild(n, visit);
      };
      visit(fn);
      info.fixedScalars = fixed;
      const cat = exportedConst(files, p.file, p.catalogue.const);
      if (!cat || !Array.isArray(cat.value)) throw new ReportFieldsError(`${p.file}#${p.catalogue.const} is not a literal array`);
      const db = dbTables.get(p.catalogue.db_join.table);
      if (!db) throw new ReportFieldsError(`producer ${p.id}: catalogue table ${p.catalogue.db_join.table} is not a declared db_constants table`);
      const camel = (k) => k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()); // DB snake_case → the engine's camelCase row keys
      info.catalogueRows = cat.value.map((row) => {
        const dbRow = db.rows.find((r) => r[p.catalogue.db_join.key] === row[p.catalogue.key]) || {};
        const sources = {};
        for (const k of Object.keys(row)) sources[k] = `${p.catalogue.const} (${p.file}:${cat.line})`;
        for (const k of Object.keys(dbRow)) if (k !== p.catalogue.db_join.key) sources[camel(k)] = `${p.catalogue.db_join.table} (${db.migration})`;
        return { ...row, ...Object.fromEntries(Object.entries(dbRow).map(([k, v]) => [camel(k), v])), __key: row[p.catalogue.key], __sources: sources };
      });
      info.catalogueLine = cat.line;
      for (const fx of fixed) if (stepWrites.has(fx.col)) info.columns.push(fx.col);
      for (const row of info.catalogueRows) if (row.scalar && stepWrites.has(row.scalar)) info.columns.push(row.scalar);
      if (stepWrites.has('parcel_cost_menu')) info.columns.push('parcel_cost_menu');
    }
    if (p.row) info.witness[p.row.builder] = witnessOf(p.row.file, p.row.builder, p.row.witness_args, p.step);
    for (const c of info.columns) {
      if (producerOfCol.has(c)) finding('column_two_producers', `${c}: ${producerOfCol.get(c)} and ${p.id}`);
      else producerOfCol.set(c, p.id);
    }
    prodInfo.set(p.id, info);
  }

  // -------------------------------------------------- tracers (one per step: the config map is the step module's)
  const tracers = new Map();
  const tracerFor = (step) => {
    if (tracers.has(step)) return tracers.get(step);
    const mod = decl.step_modules[step];
    if (!mod || !files.get(mod)) throw new ReportFieldsError(`step_modules.${step} is not declared or missing`);
    const cm = configMapOf(files, [mod], lvKeys);
    const T = createTracer({ files, maxDepth, transparent: new Set(decl.transparent_helpers), configMap: cm });
    tracers.set(step, T);
    return T;
  };

  // -------------------------------------------------- chains
  /** Trace one SQL builder output (+ its interpolated spans through the JS walker into T's accumulator). */
  const sqlNodes = (b, col, focusKey, T, step, collapseRoot = false) => {
    const t = traceOutput(b.lineage, col, catalog, focusKey, collapseRoot);
    if (!t) return null;
    const nodes = [];
    const inline = [];
    const spanBases = new Set();
    for (const n of t.nodes) {
      const r = n.render || b.render;
      const file = r.file;
      const src = nodeSource(r, n.loc);
      const line = file.lineOf(src.sOff);
      const spanIdx = new Set();
      for (const l of n.literals) {
        const s = nodeSource(r, l.loc);
        if (s.span != null) { spanIdx.add(s.span); continue; }
        if (l.kind === 'num' && l.value !== 0 && l.value !== 1) inline.push({ file: file.path, line: file.lineOf(s.sOff), value: l.value, context: `${r.fnName} ${n.scope}.${n.name}` });
      }
      for (const loc of n.spanLocs) { const s = nodeSource(r, loc); if (s.span != null) spanIdx.add(s.span); }
      const env = T.env(file, r.fn, 0, new Map(), null);
      for (const i of [...spanIdx].sort((a, z) => a - z)) {
        T.expr(r.spans[i].expr, env, []);
        // a nested SQL-fragment builder's string args name columns of THIS scope (`buildSetbackCase('s.zoning_class', …)`)
        const strArgs = [];
        const g = (m) => { if (ts.isStringLiteral(m)) strArgs.push(m.text); ts.forEachChild(m, g); };
        g(r.spans[i].expr);
        for (const a of strArgs) for (const b2 of basesOfColumnText(n.scopeObj, a, catalog)) spanBases.add(b2);
      }
      const shownLits = n.literals.filter((l) => nodeSource(r, l.loc).span == null && l.kind === 'num' && l.value !== 0 && l.value !== 1).map((l) => l.value);
      if (n.filter && !shownLits.length && !spanIdx.size) continue;
      const expr = n.filter
        ? `selection constants: ${[...shownLits, ...[...spanIdx].sort((a, z) => a - z).map((i) => `\${${r.spans[i].text}}`)].join(', ')}`
        : excerpt(r, n.loc, n.endLoc ?? n.boundaryLoc);
      nodes.push({ id: n.id, kind: 'sql', file: file.path, line, builder: r.fnName, name: n.name, scope: n.scope, expr, deps: n.deps, spans: [...spanIdx].sort((a, z) => a - z).map((i) => r.spans[i].text) });
    }
    if (t.unresolved.length) finding('sql_ref_unresolved', `${b.fn}.${col}: ${t.unresolved.join(', ')}`);
    void step;
    return { nodes, bases: uniqSorted([...t.bases, ...spanBases]), inline, unresolved: t.unresolved };
  };

  const chainCache = new Map();
  /** The chain of one produced column (optionally a JSON key / cost line / tier focus). */
  const chainOf = (col, opt = {}) => {
    const key = `${col}|${opt.focusKey || ''}|${opt.line || ''}|${opt.part || ''}`;
    if (chainCache.has(key)) return chainCache.get(key);
    const pid = producerOfCol.get(col);
    const out = { column: col, producer: null, step: null, nodes: [], bases: [], inputs: [], constants: [], literals: [], cuts: [], upstream: [], unresolved: [], witness: [] };
    chainCache.set(key, out);
    if (!pid) {
      const steps = writers.get(col) || [];
      out.step = steps.join(', ') || null;
      out.producer = steps.length ? 'loader' : null;
      return out;
    }
    const p = prodInfo.get(pid);
    out.producer = pid;
    out.step = p.step;
    const T = tracerFor(p.step);
    const acc = T.begin();
    const sqlParts = [];
    if (p.kind === 'sql') {
      const b = builders.get(p.builderKey);
      const part = sqlNodes(b, col, opt.focusKey || null, T, p.step);
      if (part) sqlParts.push(part);
      else out.unresolved.push(`${p.builder}.${col}`);
      out.witness.push({ builder: p.builder, ...p.witness[p.builder] });
      for (const t of p.temp_inputs || []) out.witness.push({ builder: t.builder, ...p.witness[t.builder] });
    } else if (p.kind === 'js_array') {
      const idx = p.columnOrder.indexOf(col);
      if (idx < 0) throw new ReportFieldsError(`${p.id}: ${col} is not in ${p.columns_const}`);
      const f = files.get(p.file);
      const fn = moduleTop(files, p.file).functions.get(p.fn);
      const env = T.env(f, fn, 0, new Map(), null, { rowSource: { param: p.row.param, builder: p.row.builder, file: p.row.file } });
      const focus = [String(idx), ...(opt.focusKey ? [opt.focusKey] : [])];
      const go = (n) => {
        if (n !== fn && (ts.isFunctionDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n))) return;
        if (ts.isReturnStatement(n) && n.expression) T.expr(n.expression, env, focus);
        ts.forEachChild(n, go);
      };
      ts.forEachChild(fn.body, go);
    } else if (p.kind === 'js_object') {
      const f = files.get(p.file);
      const fn = moduleTop(files, p.file).functions.get(p.fn);
      const rowSource = { param: p.row.param, builder: p.row.builder, file: p.row.file };
      if (opt.line) {
        const row = p.catalogueRows.find((r) => r[p.catalogue.key] === opt.line);
        const env = T.env(f, fn, 0, new Map(), null, { rowSource, catalogueBindings: new Map([[p.catalogue.var, row]]) });
        const entryDecl = T.lookupLocal(env, p.entry_local);
        if (!entryDecl) throw new ReportFieldsError(`${p.file}#${p.fn} has no local ${p.entry_local}`);
        for (const part of [opt.part, ...(row.fitField ? ['fits'] : [])]) T.ref(entryDecl.decl.name, env, [part]);
      } else {
        const fx = p.fixedScalars.find((x) => x.col === col);
        const env = T.env(f, fn, 0, new Map(), null, { rowSource });
        if (fx) T.expr(fx.rhs, env, []);
      }
    }
    // row inputs → the row builder's SQL lineage
    const rows = [...acc.inputs.values()].filter((i) => i.kind === 'row');
    for (const r of rows) {
      const b = builderOf(r.file, r.builder);
      const part = sqlNodes(b, r.column, null, T, p.step, true);
      if (part) sqlParts.push(part);
      else out.unresolved.push(`row:${r.builder}.${r.column}`);
      const pr = p.row && p.row.builder === r.builder ? p.witness[r.builder] : null;
      if (pr && !out.witness.some((w) => w.builder === r.builder)) out.witness.push({ builder: r.builder, ...pr });
    }
    const jsNodes = [...acc.nodes.values()].map((n) => ({ id: `${n.fn}:${n.name}`, kind: 'js', file: n.file, line: n.line, fn: n.fn, name: n.name, expr: n.expr, note: n.note }));
    const seenNode = new Set();
    out.nodes = [...sqlParts.flatMap((s) => s.nodes), ...jsNodes].filter((n) => {
      const k = `${n.kind}:${n.file}:${n.line}:${n.name}`;
      if (seenNode.has(k)) return false;
      seenNode.add(k);
      return true;
    });
    out.bases = uniqSorted(sqlParts.flatMap((s) => s.bases));
    out.unresolved.push(...sqlParts.flatMap((s) => s.unresolved));
    out.inputs = [...acc.inputs.entries()].filter(([, v]) => v.kind !== 'row' && !(v.kind === 'param' && scopeParams.has(v.path.split('.')[0]))).map(([k, v]) => ({ key: k, ...v })).sort((a, z) => cmp(a.key, z.key));
    out.constants = [...acc.constants.values()].sort((a, z) => cmp(a.ref, z.ref));
    out.literals = [...sqlParts.flatMap((s) => s.inline.map((l) => ({ ...l, lang: 'sql' }))),
      ...[...acc.literals.values()].filter((l) => l.value !== 0 && l.value !== 1).map((l) => ({ file: l.file, line: l.line, value: l.value, context: `${l.fn}: ${l.context}`, lang: 'js' }))]
      .sort((a, z) => cmp(`${a.file}:${String(a.line).padStart(5, '0')}:${a.value}`, `${z.file}:${String(z.line).padStart(5, '0')}:${z.value}`));
    out.literals = out.literals.filter((l, i, arr) => i === 0 || `${l.file}:${l.line}:${l.value}` !== `${arr[i - 1].file}:${arr[i - 1].line}:${arr[i - 1].value}`);
    out.cuts = [...acc.cuts.values()];
    // DB-param inputs (`rates[archetype].col`) → DB constants
    for (const inp of out.inputs) {
      if (inp.kind !== 'param' || !p.db_params) continue;
      const [param, k, c] = inp.path.split('.');
      const dp = p.db_params[param];
      if (!dp) continue;
      const t = dbTables.get(dp.table);
      const row = t && t.rows.find((r) => r[t.key] === k);
      inp.kind = 'db';
      inp.db = { table: dp.table, key: k, column: c || null, value: row && c ? row[c] : null, migration: t ? t.migration : null };
    }
    // a whole-row presence read (`if (!rate) continue`) is a guard, not a constant
    out.inputs = out.inputs.filter((i) => !(i.kind === 'db' && i.db.column == null));
    // upstream produced columns read as bases
    out.upstream = uniqSorted(out.bases.filter((b) => b.startsWith('parcels.')).map((b) => b.slice(8)).filter((c) => producerOfCol.has(c) || (writers.get(c) || []).length));
    return out;
  };

  /** Transitive closure of a column chain's base inputs, layer-2 keys and LVs (through upstream produced columns). */
  // Merging is first-path-wins for a constant's `via` note (the ref and its leaves are what the report uses).
  const closureCache = new WeakMap(); // keyed by the chain object (cost lines share a column)
  const coaCols = new Set(decl.twins.map((t) => t.coa).filter((c) => !c.startsWith('menu:')));
  const closureOf = (ch, seen = new Set()) => {
    if (closureCache.has(ch)) return closureCache.get(ch);
    let cycleSkipped = false;
    const cols = new Set(ch.upstream);
    const bases = new Set(ch.bases);
    const nodes = new Set(ch.nodes.filter((n) => n.kind === 'sql').map((n) => n.name));
    const lv = new Set(ch.inputs.filter((i) => i.kind === 'logic_variable').map((i) => i.key));
    const consts = new Map(ch.constants.map((c) => [c.ref, c]));
    const lits = new Map(ch.literals.map((l) => [`${l.file}:${l.line}:${l.value}`, l]));
    const dbs = new Map(ch.inputs.filter((i) => i.kind === 'db').map((i) => [`${i.db.table}.${i.db.key}.${i.db.column}`, i.db]));
    const cuts = new Map(ch.cuts.map((c) => [`${c.file}:${c.line}:${c.what}`, c]));
    let selfLoop = false;
    for (const up of ch.upstream) {
      if (up === ch.column && producerOfCol.get(up) === ch.producer) { selfLoop = true; continue; }
      if (seen.has(up)) { cycleSkipped = true; continue; }
      const s2 = new Set(seen); s2.add(ch.column);
      const uc = closureOf(chainOf(up), s2);
      for (const x of uc.bases) bases.add(x);
      for (const x of uc.nodes) nodes.add(x);
      for (const x of uc.lv) lv.add(x);
      for (const x of uc.cols) cols.add(x);
      if (uc.cycleSkipped) cycleSkipped = true;
      for (const c of uc.constants) if (!consts.has(c.ref)) consts.set(c.ref, c);
      for (const l of uc.literals) { const kk = `${l.file}:${l.line}:${l.value}`; if (!lits.has(kk)) lits.set(kk, l); }
      for (const d of uc.db) { const kk = `${d.table}.${d.key}.${d.column}`; if (!dbs.has(kk)) dbs.set(kk, d); }
      for (const c of uc.cuts) { const kk = `${c.file}:${c.line}:${c.what}`; if (!cuts.has(kk)) cuts.set(kk, c); }
    }
    const byKey = (m) => [...m.entries()].sort((a, z) => cmp(a[0], z[0])).map(([, v]) => v);
    const res = { bases: [...bases].sort(cmp), nodes: [...nodes].sort(cmp), lv: [...lv].sort(cmp), cols: [...cols].sort(cmp), selfLoop, cycleSkipped,
      constants: byKey(consts), literals: byKey(lits), db: byKey(dbs), cuts: byKey(cuts) };
    if (!cycleSkipped || seen.size === 0) closureCache.set(ch, res); // a diamond is computed once; a cycle-cut partial result only at the top
    return res;
  };

  // -------------------------------------------------- G1 display → fields
  const fields = [];
  const rawRendered = [];
  const layer2Used = new Set(); // filled by every fieldRow() call; RF-9 reads it AFTER all rows are built (keep that order)
  const layer2Of = (cl) => {
    const keys = [...cl.bases, ...cl.nodes.map((n) => `node:${n}`), ...cl.lv.map((k) => `lv:${k}`)];
    const t = new Set();
    for (const k of keys) if (decl.layer2[k]) { layer2Used.add(k); for (const x of decl.layer2[k]) t.add(x); }
    return [...t].sort(cmp);
  };
  const empirical = new Set(decl.empirical_tables);

  const fieldRow = (base) => {
    const ch = base.chain;
    const cl = closureOf(ch);
    // CoA-ness is DATA: the declared twins (decl.twins[].coa), never a name pattern.
    const isCoa = (base.column && !base.line_id && coaCols.has(base.column)) || (base.line_id && decl.twins.some((t) => t.coa === `menu:${base.line_id}`));
    const variants = new Set([isCoa ? 'coa' : 'aor']);
    for (const n of ch.nodes) {
      if (/heritage/i.test(n.expr || '') || /heritage/i.test(n.name)) variants.add('heritage');
      if (/ravine/i.test(n.expr || '') || /ravine/i.test(n.name)) variants.add('ravine');
    }
    // fallback: a column-to-column COALESCE on the field's own chain (e.g. opt_aor → max_buildable; pocket → citywide cohort)
    if (ch.nodes.some((n) => n.kind === 'sql' && /COALESCE\(\s*[\w.]+(\s*,\s*[\w.]+)+\s*\)/.test(n.expr || ''))) variants.add('fallback');
    let targets = layer2Of(cl);
    let targetsReason = null;
    const coaReached = [...(base.column && coaCols.has(base.column) ? [base.column] : []), ...cl.cols.filter((c) => coaCols.has(c))];
    const coaDriven = isCoa && coaReached.length > 0;
    if (coaDriven && targets.length) { targetsReason = `coa_variance (reaches the declared CoA twin ${uniqSorted(coaReached).join(', ')}; a variance is not a by-law target)`; targets = []; }
    const reachesEmpirical = cl.bases.some((b) => empirical.has(b.split('.')[0])) || (prodInfo.get(ch.producer) || {}).kind_default === 'empirical';
    if (!targets.length && !targetsReason) targetsReason = !ch.producer ? 'unproduced' : reachesEmpirical ? 'empirical' : 'no_mapped_input';
    // kind
    let kind;
    const wrapperOnly = ch.nodes.length > 0 && ch.nodes.every((n) => n.kind === 'sql' && (n.name === base.column || /jsonb_build_object\(|jsonb_agg\(/.test(n.expr || '')));
    if (base.line_id || /^cost_/.test(base.column || '')) kind = 'cost';
    else if (ch.producer === 'loader') kind = 'input';
    else if (base.json_key && wrapperOnly) kind = 'input';
    else if (!ch.producer) kind = null;
    else if (prodInfo.get(ch.producer) && prodInfo.get(ch.producer).kind_default) kind = prodInfo.get(ch.producer).kind_default;
    else if (layer2Of(cl).length) kind = 'formula';
    else kind = 'empirical';
    const ev = !ch.producer ? '—' : ch.producer === 'loader' ? 'R' : cl.cuts.length || ch.unresolved.length ? 'I' : ch.witness.length && ch.witness.every((w) => w.witnessed) ? 'W' : 'R';
    const flags = [];
    if (cl.selfLoop) flags.push('self_loop');
    if (!ch.producer && !base.derived) flags.push('unproduced');
    if (base.derived) flags.push('derived_not_computed');
    if (cl.cuts.length) flags.push('cut');
    return { ...base, kind, variants: [...variants].sort(cmp), layer2_targets: targets, layer2_reason: targetsReason, evidence: ev, flags, closure: cl };
  };

  const sites = (file, lines) => [...new Set(lines)].sort((a, z) => a - z).map((l) => `${file}:${l}`);
  // S-001
  const s1 = decl.surfaces.find((s) => s.ref === 'S-001');
  if (!s1) throw new ReportFieldsError('decl.surfaces has no S-001');
  const screen = files.get(s1.screen);
  if (!screen) throw new ReportFieldsError(`screen ${s1.screen} missing`);
  const cmap = consumerMap(files, s1.consumer.file, s1.consumer.fn, s1.consumer.headline, s1.consumer.scalars_file, s1.consumer.scalars, s1.consumer.comparable);
  const normPath = (p) => p.replace(/\.\[\]/g, '[]');
  const ARRAY_PROPS = new Set(['length', 'map', 'filter', 'slice', 'reduce', 'forEach', 'find', 'findIndex', 'some', 'every', 'includes', 'indexOf', 'join', 'concat', 'at', 'flat', 'flatMap', 'sort', 'keys', 'values', 'entries']);
  const rendered = renderedPaths(screen, new Map([[s1.hook_result, { path: [] }]]), { skipComponents: new Set(s1.skip_components) })
    .map((r) => ({ ...r, path: normPath(r.path) }))
    .filter((r) => !ARRAY_PROPS.has(r.path.split('.').pop()));
  const byPath = new Map();
  for (const r of rendered) {
    if (s1.raw_paths.some((x) => (x.endsWith('.') ? r.path.startsWith(x) : r.path === x || r.path.startsWith(`${x}.`) || r.path.startsWith(`${x}[]`)))) { rawRendered.push({ surface: 'S-001', ...r }); continue; }
    const c = columnOfPath(cmap, r.path);
    if (!c) { if (r.path !== 'parcel.areas') finding('rendered_path_unmapped', `${r.path} at ${s1.screen}:${r.line}`); continue; }
    if (c.json && !c.key) continue; // a JSON tier root read only as a presence test (`menu == null`, `summary != null`)
    if (!byPath.has(r.path)) byPath.set(r.path, { ...r, lines: [r.line], col: c });
    else { const e = byPath.get(r.path); e.lines.push(r.line); if (!e.label && r.label) { e.label = r.label; e.label_how = r.label_how; } if (!e.formatter && r.formatter) e.formatter = r.formatter; }
  }
  for (const [pth, r] of [...byPath.entries()].sort((a, z) => a[1].lines[0] - z[1].lines[0] || cmp(a[0], z[0]))) {
    const col = r.col.column;
    const ch = chainOf(col, { focusKey: r.col.key || null });
    fields.push(fieldRow({ surface: 'S-001', section: 'headline', payload: pth, column: col, json_key: r.col.key || null, label: r.label || (r.col.key || col), label_how: r.label ? r.label_how : 'path', formatter: r.formatter, render_sites: sites(s1.screen, r.lines), whitelist: r.col.whitelist, rendered: true, chain: ch }));
  }
  // cost menu
  const cm = s1.cost_menu;
  const order = exportedConst(files, cm.file, cm.order);
  const labels = exportedConst(files, cm.file, cm.labels);
  const perSqm = perSqmIds(screen, cm.per_sqm_var);
  const cardLine = jsxLine(screen, cm.card);
  const costP = prodInfo.get(cm.producer);
  if (!costP || costP.kind !== 'js_object') throw new ReportFieldsError(`cost_menu.producer ${cm.producer} is not a declared js_object producer`);
  if (!order || !Array.isArray(order.value) || !labels || !labels.value) throw new ReportFieldsError(`${cm.file}: ${cm.order} / ${cm.labels} are not literal consts`);
  const catKey = costP.catalogue.key;
  // basis label: the helper's own reads of its argument
  const helperFile = files.get(cm.file);
  const helper = (() => {
    const reads = [];
    const visit = (n) => {
      if (ts.isFunctionDeclaration(n) && n.name && n.name.text === cm.basis_helper) {
        const g = (m) => { if (ts.isPropertyAccessExpression(m) && ts.isIdentifier(m.expression) && m.expression.text === n.parameters[0].name.getText(helperFile.sf)) reads.push({ prop: m.name.text, line: helperFile.lineOf(m.getStart(helperFile.sf)) }); ts.forEachChild(m, g); };
        g(n);
      }
      ts.forEachChild(n, visit);
    };
    visit(helperFile.sf);
    return reads;
  })();
  for (const id of order.value) {
    const part = perSqm.ids.includes(id) ? 'per_sqm' : 'total';
    const row = costP.catalogueRows.find((r) => r[catKey] === id);
    if (!row) { finding('cost_line_not_in_catalogue', id); continue; }
    const ch = chainOf('parcel_cost_menu', { line: id, part });
    const notes = [];
    if (id === cm.basis_line) notes.push(`basis label \`${cm.basis_helper}\` reads ${helper.map((h) => `\`areas.${h.prop}\` (${cm.file}:${h.line})`).join(', ')}`);
    fields.push(fieldRow({ surface: 'S-001', section: 'cost_menu', payload: `parcel.costMenu.menu.${id}.${part}`, column: 'parcel_cost_menu', json_key: `${id}.${part}`, line_id: id, area_field: row.areaField, archetype: row.archetype, fit_field: row.fitField || null, scalar: row.scalar || null, label: labels.value[id], label_how: 'COST_LINE_LABELS', formatter: 'formatCurrency', render_sites: [`${s1.screen}:${cardLine}`, `${cm.file}:${order.line}`], whitelist: 'costMenu.menu', rendered: true, notes, chain: ch }));
  }
  // payload-only (code whitelist ∖ rendered)
  const renderedPathsSet = new Set(fields.filter((f) => f.surface === 'S-001').map((f) => f.payload));
  const payloadOnly = [];
  for (const [pth, c] of [...cmap.entries()].sort((a, z) => cmp(a[0], z[0]))) {
    if (c.json && !pth.includes('[]')) continue; // json roots (menu, summary) are covered by their rendered keys
    if (renderedPathsSet.has(pth)) continue;
    if (c.key && !pth.includes('[]')) continue;
    const scalarLine = costP.catalogueRows.find((r) => r.scalar === c.column);
    const ch = scalarLine ? chainOf('parcel_cost_menu', { line: scalarLine.id, part: scalarLine.scalarKind }) : chainOf(c.column, { focusKey: c.key || null });
    payloadOnly.push(fieldRow({ surface: 'S-001', section: 'payload_only', payload: pth, column: c.column, json_key: c.key || null, line_id: scalarLine ? scalarLine.id : undefined, label: null, label_how: 'not rendered', formatter: null, render_sites: [], whitelist: c.whitelist, rendered: false, duplicate_of: scalarLine ? `parcel.costMenu.menu.${scalarLine.id}.${scalarLine.scalarKind}` : null, chain: ch }));
  }

  // S-072
  const s2 = decl.surfaces.find((s) => s.ref === 'S-072');
  if (!s2) throw new ReportFieldsError('decl.surfaces has no S-072');
  const trScreen = files.get(s2.screen);
  const projFile = files.get(s2.projection.file);
  const proj = trackedProjection(projFile, s2.projection.type);
  const rootNames = new Map([[s2.element_root.name, { path: [s2.element_root.path] }]]);
  const trRows = [...renderedPaths(trScreen, rootNames), ...renderedLocals(trScreen, rootNames)];
  const trBy = new Map();
  for (const r of trRows) {
    const prop = r.path.split('.').pop();
    const pj = proj.get(prop);
    if (!pj || (!pj.column && !pj.derived)) continue; // identity props (id, address, dates)
    if (/testID|key/.test(r.label_how) || r.formatter === 'useCallback') continue;
    const k = r.path;
    if (!trBy.has(k)) trBy.set(k, { ...r, lines: [r.line], pj });
    else { const e = trBy.get(k); e.lines.push(r.line); if (!e.label && r.label) e.label = r.label; if (!e.formatter && r.formatter) e.formatter = r.formatter; }
  }
  for (const [pth, r] of [...trBy.entries()].sort((a, z) => a[1].lines[0] - z[1].lines[0])) {
    const ch = r.pj.column ? chainOf(r.pj.column) : { column: null, producer: null, step: null, nodes: [], bases: [], inputs: [], constants: [], literals: [], cuts: [], upstream: [], unresolved: [], witness: [] };
    fields.push(fieldRow({ surface: 'S-072', section: 'list_item', payload: pth, column: r.pj.column, json_key: null, label: r.label, label_how: r.label_how, formatter: r.formatter, render_sites: sites(s2.screen, r.lines), projection: `${s2.projection.file}:${r.pj.line} — ${r.pj.doc}`, whitelist: 'contract_parcels_tracked (status: new)', rendered: true, derived: r.pj.derived, chain: ch }));
  }

  // -------------------------------------------------- G4 constants (code-link classes over the chain's modules)
  const chainModules = new Set();
  const allRows = [...fields, ...payloadOnly];
  for (const f of allRows) for (const c of f.closure.constants) chainModules.add(c.path);
  const vocabRoots = Array.isArray(vocab.code_roots) ? vocab.code_roots : [];
  const roots = uniqSorted([...vocabRoots, ...chainModules]);
  const cls = classifyConstants({ ctx, codeRoots: roots, rows: [], heuristics: [] });
  const lvBy = new Map(); // lv key -> [constant members]
  for (const c of cls.constants) if (c.logic_variable) { const k = c.logic_variable.key; if (!lvBy.has(k)) lvBy.set(k, []); lvBy.get(k).push(c); }
  const leafMatch = (ref, c) => {
    const [p, member] = ref.split('#');
    if (!member) return false;
    if (p !== c.path) return false;
    const a = member.split('.');
    const b = c.member.split('.');
    if (b.length < a.length) return false;
    return a.every((x, i) => x === '*' || x === b[i]);
  };
  const constantRow = (ref, via) => {
    const leaves = cls.constants.filter((c) => leafMatch(ref, c));
    const p = ref.split('#')[0];
    const inRoots = vocabRoots.some((r) => (r.endsWith('/') ? p.startsWith(r) : p === r));
    const vals = uniqSorted(leaves.map((l) => String(l.value))).map(Number).sort((a, z) => a - z);
    const proposed = uniqSorted(leaves.map((l) => (l.proposed === 'heuristic' ? `H:${l.proposed_reason}` : l.proposed === 'by_law_cited' ? 'BC' : 'BU')));
    const gate = uniqSorted(leaves.map((l) => l.class));
    const lv = uniqSorted(leaves.filter((l) => l.logic_variable).map((l) => `${l.logic_variable.key}=${l.logic_variable.default}`));
    return { ref, leaves: leaves.length, values: vals, proposed, class: gate.length ? gate : ['unclassified'], logic_variable: lv, in_code_roots: inRoots, via: via || null, line: leaves.length ? Math.min(...leaves.map((l) => l.line)) : null };
  };
  const lvRow = (key) => {
    const def = lvs[key];
    const twins = (lvBy.get(key) || []).map((c) => ({ ref: `${c.path}#${c.member}`, value: c.value, proposed: c.proposed === 'heuristic' ? `H:${c.proposed_reason}` : c.proposed === 'by_law_cited' ? 'BC' : 'BU', class: c.class }));
    return { key, default: def ? def.default : null, js_fallbacks: twins };
  };
  const dedupe = (rows) => {
    // drop a ref whose leaves are a subset of another ref's leaves (SETBACK_DEFAULTS.DEFAULT.front ⊂ SETBACK_DEFAULTS.*.front)
    const leafSet = new Map(rows.map((r) => [r.ref, new Set(cls.constants.filter((c) => leafMatch(r.ref, c)).map((c) => `${c.path}#${c.member}`))]));
    return rows.filter((r) => {
      const a = leafSet.get(r.ref);
      if (!a.size) return true;
      return !rows.some((o) => o.ref !== r.ref && leafSet.get(o.ref).size > a.size && [...a].every((x) => leafSet.get(o.ref).has(x)));
    });
  };
  for (const f of allRows) {
    f.constants = dedupe(f.closure.constants.map((c) => constantRow(c.ref, c.via)));
    f.logic_variables = f.closure.lv.map(lvRow);
    f.db_constants = f.closure.db;
    for (const c of f.constants) if (c.leaves === 0) finding('constant_ref_without_leaves', `${c.ref}`, f.payload);
  }

  // -------------------------------------------------- gates (closed answers, report-only)
  const gates = [];
  const gate = (id, question, failing) => gates.push({ id, question, state: failing.length ? 'FAIL' : 'PASS', failing: uniqSorted(failing) });
  gate('RF-1', 'every rendered calculated field has >= 1 chain node or is an input', fields.filter((f) => f.kind && f.kind !== 'input' && f.chain.nodes.length === 0).map((f) => f.payload));
  gate('RF-2', 'no rendered field is unproduced', fields.filter((f) => f.flags.includes('unproduced') || f.flags.includes('derived_not_computed')).map((f) => `${f.surface} ${f.payload}`));
  gate('RF-3', 'every chain constant resolves to classified code-link leaves', allRows.flatMap((f) => f.constants.filter((c) => c.leaves === 0).map((c) => `${f.payload}: ${c.ref}`)));
  const covered = new Set([...fields, ...payloadOnly].map((f) => f.payload));
  const unaccounted = [];
  for (const [k, c] of cmap) {
    if (c.json && !c.key && !k.includes('[]')) { if (![...covered].some((x) => x.startsWith(`${k}.`))) unaccounted.push(k); continue; }
    if (!covered.has(k)) unaccounted.push(k);
  }
  const contract = readJson(s2.contract_descriptor);
  for (const w of (contract.inputs && contract.inputs.field_whitelist) || []) {
    const prop = w.split('.').pop();
    const pj = proj.get(prop);
    if (pj && !pj.column && !pj.derived) continue; // identity props (id, address, jurisdiction, dates) are not calculated
    if (!covered.has(w)) unaccounted.push(`S-072 ${w}`);
  }
  gate('RF-4', 'every whitelisted field is rendered or listed payload-only', unaccounted);
  gate('RF-5', 'no field reads its own prior value (self-loop)', allRows.filter((f) => f.flags.includes('self_loop')).map((f) => f.payload));
  gate('RF-6', 'every rendered field has a kind in the closed M-69 set', fields.filter((f) => !KINDS.includes(f.kind)).map((f) => `${f.surface} ${f.payload}`));
  // twins
  const allCols = new Map(); // key -> rows (a column can be rendered on one surface and payload-only on another)
  const addCol = (k, f) => { if (!allCols.has(k)) allCols.set(k, []); allCols.get(k).push(f); };
  for (const f of allRows) { if (f.line_id && f.rendered) addCol(`menu:${f.line_id}`, f); else if (f.column && !f.line_id) addCol(f.column, f); }
  const twins = decl.twins.map((t) => {
    const where = (c) => {
      const rows = allCols.get(c) || [];
      const r2 = uniqSorted(rows.filter((x) => x.rendered).map((x) => x.surface));
      if (r2.length) return `rendered (${r2.join(', ')})`;
      if (rows.length) return 'payload only';
      return producerOfCol.has(c) || (writers.get(c) || []).length ? 'produced, not exposed to any report' : 'missing';
    };
    return { ...t, aor_where: where(t.aor), coa_where: where(t.coa) };
  });
  gate('RF-7', 'every declared CoA twin resolves to a produced field', twins.filter((t) => t.aor_where === 'missing' || t.coa_where === 'missing').map((t) => `${t.aor} ↔ ${t.coa}`));
  // descriptor whitelist vs code whitelist (S-001)
  const desc = readJson(s1.descriptor);
  const dw = new Set((desc.inputs && desc.inputs.field_whitelist) || []);
  const codeAreas = [...cmap.keys()].filter((k) => k.startsWith('parcel.areas.'));
  const descDrift = codeAreas.filter((k) => !dw.has(k));
  gate('RF-8', 'the S-001 descriptor field_whitelist names every area column the consumer assembler sends', descDrift);
  // layer2 table both ways
  const badTargets = [];
  for (const [k, ts2] of Object.entries(decl.layer2)) {
    for (const t of ts2) {
      const [structure, target] = t.split(':');
      if (!vocab.dsl_target[target]) badTargets.push(`${k} → ${t}: not a vocab dsl_target`);
      if (!(vocab.feeds && vocab.feeds.structure || []).includes(structure)) badTargets.push(`${k} → ${t}: not a vocab structure`);
    }
    if (k.startsWith('lv:') && !lvKeys.has(k.slice(3))) badTargets.push(`${k}: not a logic variable`);
    if (/^[a-z_]+\.[a-z_0-9]+$/.test(k)) { const [tb, cl] = k.split('.'); if (!(catalog.get(tb) && catalog.get(tb).has(cl))) badTargets.push(`${k}: not a schema column`); }
    if (!layer2Used.has(k)) badTargets.push(`${k}: matches no chain input (dead declaration)`);
  }
  const banned = new Map(((vocab.banned_code_refs) || []).map((b) => [b.ref, b]));
  for (const k of Object.keys(decl.layer2)) if (banned.has(k)) badTargets.push(`${k}: a vocab.banned_code_refs entry may not map to a target`);
  for (const sp of scopeParams) {
    const names = (pr) => (ts.isObjectBindingPattern(pr.name) ? pr.name.elements.map((e) => e.name.getText()) : [pr.name.getText()]);
    const used = [...builders.values()].some((b) => (b.render.fn.parameters || []).some((pr) => names(pr).includes(sp)));
    if (!used) badTargets.push(`scope_params ${sp}: no declared builder takes it`);
  }
  gate('RF-9', 'the declared inputs are closed both ways (real targets and logic variables; every key reaches a chain; no banned ref mapped; every scope param exists)', badTargets);
  gate('RF-10', 'no rendered field reaches a vocab.banned_code_refs input', fields.filter((f) => f.closure.bases.some((b) => banned.has(b))).map((f) => `${f.surface} ${f.payload} ← ${f.closure.bases.filter((b) => banned.has(b)).join(', ')} (${f.closure.bases.filter((b) => banned.has(b)).map((b) => banned.get(b).reason.split(':')[0]).join(', ')})`));

  gate('RF-11', 'the generator raised no findings (unmapped render paths, unresolved refs, witness render failures, missing seed rows)', findings.map((f) => `${f.code}: ${f.detail}`));

  // -------------------------------------------------- inline literals + all constants (cross-field tables)
  const constTable = new Map();
  for (const f of allRows) for (const c of f.constants) { if (!constTable.has(c.ref)) constTable.set(c.ref, { ...c, fields: [] }); constTable.get(c.ref).fields.push(f.payload); }
  const litTable = new Map();
  for (const f of allRows) for (const l of f.closure.literals) { const k = `${l.file}:${l.line}:${l.value}`; if (!litTable.has(k)) litTable.set(k, { ...l, fields: [] }); litTable.get(k).fields.push(f.payload); }
  const lvTable = new Map();
  for (const f of allRows) for (const l of f.logic_variables) { if (!lvTable.has(l.key)) lvTable.set(l.key, { ...l, fields: [] }); lvTable.get(l.key).fields.push(f.payload); }
  const dbTable = new Map();
  for (const f of allRows) for (const d of f.db_constants) { const k = `${d.table}.${d.key}.${d.column}`; if (!dbTable.has(k)) dbTable.set(k, { ...d, fields: [] }); dbTable.get(k).fields.push(f.payload); }
  for (const t of [constTable, litTable, lvTable, dbTable]) for (const v of t.values()) v.fields = uniqSorted(v.fields);

  // -------------------------------------------------- inputs fingerprint
  for (const rel of files.paths()) inputTexts.set(rel, files.get(rel).text);
  const inputs = [...inputTexts.entries()].map(([rel, t]) => ({ path: rel, sha256: sha(t) })).sort((a, z) => cmp(a.path, z.path));

  const provisional = [
    'Home: generator lives under Spec 126 tooling (scripts/surfaces/_schema/report-fields.decl.json + scripts/analysis/report-fields.mjs); McBylaw consumes layer2_targets + constants as the Phase 3 parity worklist (design §4.2 recommendation; not ratified).',
    'SQL source: chains come from a STATIC render of the builder template (spans → placeholder, parsed by libpg-query; no JS executed); the builders are additionally rendered in-process ONLY to fingerprint them against the committed sql-witness trace (evidence W). Design §4.1 recommends (b) render + (a) recorded-SQL witness; the static render replaces (b) for line mapping (not ratified: Spec 68 §6.4 rule 8 "parsed, never executed" — the witness render executes pure string builders).',
    `JS def-use depth: calls are followed ${maxDepth} levels deep (design §2 G3' says one level; one level cannot reach mainBuildGfa from computeOptConfigRow). A deeper call is cut and the field is evidence I.`,
    'Kind names: `empirical` / `cost` are the caller-briefed short forms of M-69\'s `empirical_ref` / `cost_ref`.',
  ];

  const model = {
    generator: { path: 'scripts/analysis/report-fields.mjs', version: GENERATOR_VERSION, decl: DECL_PATH, max_call_depth: maxDepth },
    inputs,
    provisional,
    gates,
    fields: fields.map(strip),
    payload_only: payloadOnly.map(strip),
    raw_rendered: uniqSorted(rawRendered.map((r) => `${r.path} @ ${s1.screen}:${r.line}`)),
    twins,
    constants: [...constTable.values()].sort((a, z) => cmp(a.ref, z.ref)),
    logic_variables: [...lvTable.values()].sort((a, z) => cmp(a.key, z.key)),
    inline_literals: [...litTable.values()].sort((a, z) => cmp(`${a.file}:${String(a.line).padStart(5, '0')}`, `${z.file}:${String(z.line).padStart(5, '0')}`) || a.value - z.value),
    db_constants: [...dbTable.values()].sort((a, z) => cmp(`${a.table}.${a.key}.${a.column}`, `${z.table}.${z.key}.${z.column}`)),
    findings: findings.sort((a, z) => cmp(`${a.code}|${a.detail}`, `${z.code}|${z.detail}`)),
  };
  const json = `${JSON.stringify(sortKeys(model), null, 2)}\n`;
  const markdown = renderMarkdown(model, decl);
  return { model, json, markdown, decl };
}

function strip(f) {
  const ch = f.chain;
  const { chain, closure, ...rest } = f;
  void chain;
  return {
    ...rest,
    producer: ch.producer, step: ch.step,
    chain: ch.nodes.map((n) => ({ ...n })),
    base_inputs: closure.bases,
    direct_bases: ch.bases,
    upstream: ch.upstream,
    inputs: ch.inputs,
    cuts: closure.cuts,
    unresolved: ch.unresolved,
    witness: ch.witness.map((w) => ({ builder: w.builder, witnessed: !!w.witnessed, fingerprint: w.fingerprint || null, reason: w.reason || null })),
    inline_literals: closure.literals.map((l) => `${l.file}:${l.line} ${l.value}`),
  };
}

function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort(cmp).map((k) => [k, sortKeys(v[k])]));
  return v;
}

// ------------------------------------------------------------------ markdown

const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const code = (s) => (s == null || s === '' ? '—' : `\`${String(s).replace(/`/g, "'").replace(/\|/g, '\\|')}\``);
const short = (p) => p.replace(/^scripts\/lib\/compute\//, '').replace(/^scripts\/lib\//, '').replace(/^mobile\/app\/\(app\)\/parcel-tool\//, '').replace(/^mobile\/src\/(components\/parcel|lib)\//, '').replace(/^src\/features\/leads\/lib\//, '');

function renderMarkdown(m, decl) {
  const L = [];
  L.push('# MaxBLD report-field inventory (generated — do not edit)');
  L.push('');
  L.push(`> Generated by \`${m.generator.path}\` v${m.generator.version} from \`${m.generator.decl}\` (Spec 69 M-69: the inventory is the denominator). Regenerate with \`node scripts/analysis/report-fields.mjs --write\`; \`--check\` fails on drift (\`src/tests/report-fields.infra.test.ts\`). JSON form: \`${decl.outputs.json}\`.`);
  L.push('> Replaces the hand first edition `.cursor/mcbylaw/phase3-prework/field-inventory.md`.');
  L.push('');
  L.push(`**Evidence:** **W** = ${EVIDENCE.W} · **R** = ${EVIDENCE.R} · **I** = ${EVIDENCE.I}. **Kind** (M-69): formula · empirical (comps, norms) · cost (Spec 88) · input. **Constant class**: code-link gate class (\`unmapped\` until authored rows cite it) and its comment-derived proposal (BC by-law cited · BU by-law claimed unsourced · H:reason heuristic); OUT = outside \`vocab.code_roots\` (classified here by widening the roots to the chain's modules, for this report only).`);
  L.push('');
  L.push('## Provisional decisions (operator)');
  L.push('');
  for (const p of m.provisional) L.push(`- ${p}`);
  L.push('');
  L.push('## Gates (closed answers, report-only)');
  L.push('');
  L.push('| Gate | Question | State | Failing |');
  L.push('|---|---|---|---|');
  for (const g of m.gates) L.push(`| ${g.id} | ${esc(g.question)} | ${g.state} | ${g.failing.length ? esc(g.failing.join('; ')) : '—'} |`);
  L.push('');
  const kinds = {};
  for (const f of m.fields) kinds[f.kind || 'none'] = (kinds[f.kind || 'none'] || 0) + 1;
  L.push(`**Rendered fields:** ${m.fields.length} (${Object.keys(kinds).sort().map((k) => `${k} ${kinds[k]}`).join(' · ')}) · **payload-only:** ${m.payload_only.length} · **constants on chains:** ${m.constants.length} named, ${m.logic_variables.length} logic variables, ${m.inline_literals.length} inline literals, ${m.db_constants.length} DB rows.`);
  L.push('');
  L.push('## 1. Rendered calculated fields');
  for (const surf of ['S-001', 'S-072']) {
    const rows = m.fields.filter((f) => f.surface === surf);
    L.push('');
    L.push(`### ${surf} ${surf === 'S-001' ? '`mobile_parcel_detail` (REPORT)' : '`mobile_tracked_lots` (LIST — contract `status: new`)'}`);
    L.push('');
    L.push('| # | Label | Payload → column | Render site | Format | Step (producer) | Kind | Variants | Layer-2 targets | Ev |');
    L.push('|---|---|---|---|---|---|---|---|---|---|');
    rows.forEach((f, i) => {
      const col = f.column ? `${f.column}${f.json_key ? `→${f.json_key}` : ''}` : '— (no column)';
      const tg = f.layer2_targets.length ? f.layer2_targets.join(', ') : `none (${f.layer2_reason})`;
      L.push(`| ${surf === 'S-001' ? 'D' : 'T'}${i + 1} | ${esc(f.label)} | ${code(f.payload)} → ${code(col)} | ${f.render_sites.map((s) => short(s)).join(', ')} | ${esc(f.formatter || '—')} | ${esc(f.step || '—')} (${esc(f.producer || '—')}) | ${f.kind || '—'} | ${f.variants.join(', ')} | ${esc(tg)} | ${f.evidence}${f.flags.length ? ` · ${f.flags.join(', ')}` : ''} |`);
    });
  }
  L.push('');
  L.push('## 2. Formula chains');
  L.push('');
  L.push('Each node is `name` file:line — expression excerpt; SQL nodes are CTE/target aliases of the builder (`scope.alias`), JS nodes are def-use sites (`fn:name`). Base inputs are the transitive DB columns (through upstream produced columns).');
  for (const f of [...m.fields, ...m.payload_only]) {
    L.push('');
    L.push(`### ${f.surface} ${code(f.payload)}${f.rendered ? '' : ' (payload only)'}`);
    L.push('');
    L.push(`- column ${code(f.column)} · step ${esc(f.step || '—')} · producer ${esc(f.producer || '—')} · kind ${f.kind || '—'} · evidence ${f.evidence}${f.duplicate_of ? ` · duplicate_of ${code(f.duplicate_of)}` : ''}`);
    if (f.notes && f.notes.length) for (const n of f.notes) L.push(`- note: ${n}`);
    if (f.projection) L.push(`- projection: ${esc(f.projection)}`);
    if (f.witness.length) L.push(`- witness: ${f.witness.map((w) => `${w.builder} ${w.witnessed ? 'W' : `not witnessed${w.reason ? ` (${esc(w.reason)})` : ''}`}`).join(' · ')}`);
    if (f.upstream.length) L.push(`- upstream produced columns: ${f.upstream.map(code).join(', ')}`);
    L.push(`- base inputs: ${f.base_inputs.length ? f.base_inputs.map(code).join(', ') : '—'}`);
    if (f.inputs.length) L.push(`- other inputs: ${f.inputs.map((i) => (i.kind === 'logic_variable' ? `LV ${code(i.key)}` : i.kind === 'db' ? `DB ${code(`${i.db.table}[${i.db.key}].${i.db.column}`)}=${i.db.value}` : `param ${code(i.path)}`)).join(', ')}`);
    if (f.constants.length) L.push(`- named constants: ${f.constants.map((c) => `${code(`${short(c.ref.split('#')[0])}#${c.ref.split('#')[1]}`)} (${c.leaves} leaf${c.leaves === 1 ? '' : 's'}: ${c.values.slice(0, 6).join('/')}${c.values.length > 6 ? '/…' : ''}; ${c.proposed.join('/') || '—'}${c.in_code_roots ? '' : '; OUT'})`).join(', ')}`);
    if (f.inline_literals.length) L.push(`- inline literals: ${f.inline_literals.map((x) => code(short(x))).join(', ')}`);
    if (f.cuts.length) L.push(`- CUT (evidence I): ${f.cuts.map((c) => `${short(c.file)}:${c.line} ${c.what} — ${c.reason}`).join('; ')}`);
    if (f.chain.length) {
      L.push('- chain:');
      for (const n of f.chain) L.push(`  - ${code(n.kind === 'sql' ? (n.id.includes(':') ? n.id : `${n.builder}:${n.scope}.${n.name}`) : n.id)} ${short(n.file)}:${n.line} — ${code(n.expr)}${n.note ? ` [${esc(n.note)}]` : ''}`);
    }
  }
  L.push('');
  L.push('## 3. Constants on the chains');
  L.push('');
  L.push('### 3.1 Named constants (code-link classes)');
  L.push('');
  L.push('| Ref | Line | Leaves | Values | Gate class | Proposed | Logic variable | In code_roots | Fields |');
  L.push('|---|---|---|---|---|---|---|---|---|');
  for (const c of m.constants) L.push(`| ${code(c.ref)} | ${c.line ?? '—'} | ${c.leaves} | ${esc(c.values.slice(0, 13).join(', '))}${c.values.length > 13 ? ' …' : ''} | ${c.class.join(', ')} | ${c.proposed.join(', ') || '—'} | ${esc(c.logic_variable.join(', ') || '—')} | ${c.in_code_roots ? 'yes' : '**OUT**'} | ${c.fields.length} |`);
  L.push('');
  L.push('### 3.2 Logic variables (admin-tunable; the JS fallback constant and its proposed class)');
  L.push('');
  L.push('| Key | Default | JS fallback (proposed class) | Fields |');
  L.push('|---|---|---|---|');
  for (const l of m.logic_variables) L.push(`| ${code(l.key)} | ${l.default ?? '—'} | ${l.js_fallbacks.length ? l.js_fallbacks.map((j) => `${code(j.ref)}=${j.value} (${j.proposed})`).join(', ') : '—'} | ${l.fields.length} |`);
  L.push('');
  L.push('### 3.3 Inline literals on the chains (not classified by code-link — counted only)');
  L.push('');
  L.push('| Site | Value | Lang | Context | Fields |');
  L.push('|---|---|---|---|---|');
  for (const l of m.inline_literals) L.push(`| ${short(l.file)}:${l.line} | ${l.value} | ${l.lang} | ${code(l.context)} | ${l.fields.length} |`);
  L.push('');
  L.push('### 3.4 DB-held constants (migration seed rows)');
  L.push('');
  L.push('| Table[key].column | Value | Seed | Fields |');
  L.push('|---|---|---|---|');
  for (const d of m.db_constants) L.push(`| ${code(`${d.table}[${d.key}].${d.column}`)} | ${d.value ?? '—'} | ${d.migration} | ${d.fields.map(code).join(', ')} |`);
  L.push('');
  L.push('## 4. Payload-only fields (whitelisted, never rendered)');
  L.push('');
  L.push('| Payload → column | Step | Kind | Duplicate of | Layer-2 targets | Ev |');
  L.push('|---|---|---|---|---|---|');
  for (const f of m.payload_only) L.push(`| ${code(f.payload)} → ${code(f.column)} | ${esc(f.step || '—')} | ${f.kind || '—'} | ${code(f.duplicate_of)} | ${esc(f.layer2_targets.length ? f.layer2_targets.join(', ') : `none (${f.layer2_reason})`)} | ${f.evidence}${f.flags.length ? ` · ${f.flags.join(', ')}` : ''} |`);
  L.push('');
  L.push('## 5. Rendered raw (not calculated) values');
  L.push('');
  for (const r of m.raw_rendered) L.push(`- ${code(r)}`);
  L.push('');
  L.push('## 6. CoA twins (declared pairs)');
  L.push('');
  L.push('| As-of-right | CoA | Where (aor / coa) | Note |');
  L.push('|---|---|---|---|');
  for (const t of m.twins) L.push(`| ${code(t.aor)} | ${code(t.coa)} | ${t.aor_where} / ${t.coa_where} | ${esc(t.note)} |`);
  L.push('');
  L.push('## 7. Findings');
  L.push('');
  if (!m.findings.length) L.push('none');
  for (const f of m.findings) L.push(`- ${code(f.code)} ${esc(f.detail)}${f.field ? ` (${f.field})` : ''}`);
  L.push('');
  L.push('## Inputs');
  L.push('');
  for (const i of m.inputs) L.push(`- \`${i.path}\` sha256 \`${i.sha256}\``);
  L.push('');
  return L.join('\n');
}

// ------------------------------------------------------------------ write / check

export async function run({ root, mode }) {
  const r = await buildInventory({ root });
  const mdPath = path.join(root, r.decl.outputs.markdown);
  const jsonPath = path.join(root, r.decl.outputs.json);
  if (mode === 'write') {
    for (const [p, text] of [[mdPath, r.markdown], [jsonPath, r.json]]) {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(`${p}.tmp`, text);
      fs.renameSync(`${p}.tmp`, p); // atomic per file
    }
    return { ...r, drift: [] };
  }
  const drift = [];
  const cur = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null); // byte-exact: a CRLF checkout is drift (outputs are LF)
  if (cur(mdPath) !== r.markdown) drift.push(r.decl.outputs.markdown);
  if (cur(jsonPath) !== r.json) drift.push(r.decl.outputs.json);
  return { ...r, drift };
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const flags = process.argv.slice(2);
  const unknown = flags.filter((f) => f !== '--write' && f !== '--check');
  const mode = flags.includes('--write') ? 'write' : 'check';
  if (unknown.length || (flags.includes('--write') && flags.includes('--check'))) {
    console.error('usage: node scripts/analysis/report-fields.mjs --write | --check');
    process.exitCode = 2;
  } else run({ root, mode }).then((r) => {
    const fails = r.model.gates.filter((g) => g.state === 'FAIL').map((g) => g.id);
    if (mode === 'write') console.log(`wrote ${r.decl.outputs.markdown} + .json: ${r.model.fields.length} rendered fields, ${r.model.payload_only.length} payload-only; gates FAIL (report-only): ${fails.join(', ') || 'none'}`);
    else if (r.drift.length) { console.error(`report-fields DRIFT: ${r.drift.join(', ')} — rerun with --write`); process.exitCode = 1; }
    else console.log(`report-fields current (${r.model.fields.length} rendered fields); gates FAIL (report-only): ${fails.join(', ') || 'none'}`);
  }).catch((err) => {
    if (err instanceof ReportFieldsError) { console.error(`refused — ${err.message}`); process.exitCode = 2; return; }
    console.error(err && err.stack ? err.stack : String(err));
    process.exitCode = 2;
  });
}
