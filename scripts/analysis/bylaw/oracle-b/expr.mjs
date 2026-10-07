// Oracle B — DSL lexer, Pratt parser and evaluator (Spec 68 §7.4, Spec 69 M-48, M-54).
//
// INDEPENDENCE: written from Spec 68 §7.4 / §7.5, Spec 69 and vocab.json only. It never reads, imports or
// mirrors scripts/analysis/bylaw/evaluate.mjs or dsl.mjs (Phase 2 plan §V-2, oracle B). The parser is a
// table-driven Pratt parser: binding powers live in BINARY_BP / PREFIX_BP below, one place.
//
// Pure: no clock, no network, no DB, no file reads (enactment dates are passed in by the caller).

const UNIT_WORDS = new Set(['m', 'm2', 'pct', 'storeys', 'units', 'ratio']);
const FUNCS = new Set(['max', 'min', 'band', 'if', 'by_type', 'existing', 'label', 'overlay', 'mapped', 'labelled']);

// Explicit precedence table (higher binds tighter). §7.4: "op ∈ + − × ÷ (usual precedence, left-associative)";
// the grammar leaves and/or precedence unstated — oracle B uses the conventional and > or (listed as an ambiguity).
const BINARY_BP = Object.freeze({
  or: 10,
  and: 20,
  '<': 30, '≤': 30, '>': 30, '≥': 30, '=': 30,
  '+': 40, '−': 40,
  '×': 50, '÷': 50,
});
const PREFIX_BP = Object.freeze({ not: 25 });
const CMP = new Set(['<', '≤', '>', '≥', '=']);
const OP_ALIAS = Object.freeze({ '<=': '≤', '>=': '≥', '-': '−', '*': '×', '/': '÷' });

class DslError extends Error {}

// ---------------------------------------------------------------- lexer
export function lex(src) {
  const out = [];
  let i = 0;
  const s = String(src);
  while (i < s.length) {
    const rest = s.slice(i);
    let m;
    if (/^\s/.test(rest)) { i += 1; continue; }
    if ((m = /^@\s*(#[A-Za-z0-9_]+|[A-Za-z]*(?:\([0-9A-Za-z]+\))+)/.exec(rest))) { out.push({ t: 'path', v: m[1] }); i += m[0].length; continue; }
    if ((m = /^\d{4}-\d{2}-\d{2}/.exec(rest))) { out.push({ t: 'raw', v: m[0] }); i += m[0].length; continue; }
    if ((m = /^\d{1,5}-\d{4}(?=\s*\))/.exec(rest))) { out.push({ t: 'raw', v: m[0] }); i += m[0].length; continue; }
    if ((m = /^\d+(?:\.\d+)?/.exec(rest))) { out.push({ t: 'num', v: Number(m[0]) }); i += m[0].length; continue; }
    if ((m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest))) { out.push({ t: 'id', v: m[0] }); i += m[0].length; continue; }
    if ((m = /^(<=|>=|[≤≥<>=+−\-×*÷/])/.exec(rest))) { out.push({ t: 'op', v: OP_ALIAS[m[0]] ?? m[0] }); i += m[0].length; continue; }
    if ((m = /^[();:,]/.exec(rest))) { out.push({ t: 'p', v: m[0] }); i += 1; continue; }
    throw new DslError(`lex: unexpected '${rest[0]}' at ${i}`);
  }
  out.push({ t: 'eof' });
  return out;
}

// ---------------------------------------------------------------- parser
class Parser {
  constructor(tokens) { this.k = tokens; this.i = 0; this.subject = null; }
  peek() { return this.k[this.i]; }
  next() { return this.k[this.i++]; }
  is(t, v) { const x = this.peek(); return x.t === t && (v === undefined || x.v === v); }
  expect(t, v) { if (!this.is(t, v)) throw new DslError(`expected ${v ?? t}, got ${JSON.stringify(this.peek())}`); return this.next(); }

  lbp(tok) {
    if (tok.t === 'op' && BINARY_BP[tok.v] !== undefined) return BINARY_BP[tok.v];
    if (tok.t === 'id' && (tok.v === 'and' || tok.v === 'or')) return BINARY_BP[tok.v];
    return 0;
  }

  expr(rbp = 0) {
    let left = this.nud(this.next());
    while (rbp < this.lbp(this.peek())) {
      const op = this.next();
      const bp = this.lbp(op);
      if (op.v === 'and' || op.v === 'or') left = { n: op.v, a: left, b: this.expr(bp) };
      else if (CMP.has(op.v)) {
        left = { n: 'cmp', op: op.v, a: left, b: this.expr(bp) };
        if (CMP.has(this.peek().v)) throw new DslError('comparisons do not chain');
      } else left = { n: 'bin', op: op.v, a: left, b: this.expr(bp) }; // left-assoc: rhs parsed at the same bp
    }
    return left;
  }

  nud(tok) {
    if (tok.t === 'num') {
      const u = this.peek();
      if (u.t === 'id' && UNIT_WORDS.has(u.v)) { this.next(); return { n: 'num', v: tok.v, u: u.v }; }
      throw new DslError(`literal ${tok.v} has no unit`);
    }
    if (tok.t === 'p' && tok.v === '(') { const e = this.expr(0); this.expect('p', ')'); return e; }
    if (tok.t === 'op' && CMP.has(tok.v)) {
      if (!this.subject) throw new DslError(`comparison '${tok.v}' with no left side outside band()`);
      return { n: 'cmp', op: tok.v, a: this.subject, b: this.expr(BINARY_BP[tok.v]) };
    }
    if (tok.t === 'id') {
      if (tok.v === 'not') return { n: 'not', a: this.expr(PREFIX_BP.not) };
      if (tok.v === 'unlimited' || tok.v === 'unregulated') return { n: 'kw', v: tok.v };
      if (FUNCS.has(tok.v) && this.is('p', '(')) return this.call(tok.v);
      return { n: 'var', name: tok.v };
    }
    throw new DslError(`unexpected token ${JSON.stringify(tok)}`);
  }

  call(fn) {
    this.expect('p', '(');
    let node;
    if (fn === 'label' || fn === 'overlay' || fn === 'mapped' || fn === 'labelled') {
      node = { n: fn, code: this.expect('id').v };
    } else if (fn === 'max' || fn === 'min') {
      const args = [];
      do { const e = this.expr(0); const p = this.is('path') ? this.next().v : null; args.push({ e, path: p }); } while (this.is('p', ';') && this.next());
      node = { n: fn, args };
    } else if (fn === 'if') {
      const c = this.expr(0); this.expect('p', ';'); const a = this.expr(0); this.expect('p', ';'); const b = this.expr(0);
      node = { n: 'if', c, a, b };
    } else if (fn === 'band') {
      const subj = { n: 'var', name: this.expect('id').v };
      const arms = [];
      while (this.is('p', ';')) {
        this.next();
        const saved = this.subject; this.subject = subj;
        const c = this.expr(0);
        this.subject = saved;
        this.expect('p', ':');
        arms.push({ c, e: this.expr(0) });
      }
      node = { n: 'band', subj, arms };
    } else if (fn === 'by_type') {
      const arms = [];
      do { const key = this.expect('id').v; this.expect('p', ':'); arms.push({ key, e: this.expr(0) }); } while (this.is('p', ';') && this.next());
      node = { n: 'by_type', arms };
    } else if (fn === 'existing') {
      const v = this.expect('id').v; this.expect('p', ';');
      let date = null; let bylaw = null;
      if (this.is('raw')) date = this.next().v;
      else { this.expect('id', 'enacted'); this.expect('p', '('); bylaw = this.expect('raw').v; this.expect('p', ')'); }
      node = { n: 'existing', v, date, bylaw };
    }
    this.expect('p', ')');
    return node;
  }
}

const cache = new Map();
function cached(key, f) { if (!cache.has(key)) { try { cache.set(key, { ok: f() }); } catch (e) { cache.set(key, { err: String(e.message || e) }); } } return cache.get(key); }

/** Parse one statement `target = expr @ path`. Returns {target, expr, path} or throws. */
export function parseStatement(src) {
  const r = cached(`S:${src}`, () => {
    const p = new Parser(lex(src));
    const target = p.expect('id').v; p.expect('op', '=');
    const e = p.expr(0);
    const path = p.is('path') ? p.next().v : null;
    p.expect('eof');
    if (!path) throw new DslError('statement has no @clause');
    return { target, expr: e, path };
  });
  if (r.err) throw new DslError(r.err);
  return r.ok;
}
/** Parse a bare expression or condition. */
export function parseExpr(src) {
  const r = cached(`E:${src}`, () => { const p = new Parser(lex(src)); const e = p.expr(0); p.expect('eof'); return e; });
  if (r.err) throw new DslError(r.err);
  return r.ok;
}

// ---------------------------------------------------------------- evaluator
export const ne = (reason, extra = {}) => ({ k: 'ne', reason, ...extra });
const num = (v, u) => ({ k: 'num', v, u });
const EPS = 1e-9;

function unitOf(vocab, kind, code) {
  const t = vocab?.[kind]?.[code];
  return t ? t.unit : null;
}

function arith(op, a, b) {
  for (const x of [a, b]) {
    if (x.k === 'ne') return x;
    if (x.k === 'unregulated') return ne('unregulated_in_arithmetic');
    if (x.k === 'unlimited') return ne('unlimited_in_arithmetic');
  }
  if (op === '+' || op === '−') {
    if (a.u !== b.u) return ne('expression_error', { detail: `unit ${a.u} ${op} ${b.u}` });
    return num(op === '+' ? a.v + b.v : a.v - b.v, a.u);
  }
  if (op === '×') {
    if (a.u === 'pct' && b.u !== 'pct') return num((a.v / 100) * b.v, b.u);
    if (b.u === 'pct' && a.u !== 'pct') return num(a.v * (b.v / 100), a.u);
    if (a.u === 'ratio') return num(a.v * b.v, b.u);
    if (b.u === 'ratio') return num(a.v * b.v, a.u);
    if (a.u === 'm' && b.u === 'm') return num(a.v * b.v, 'm2');
    return ne('expression_error', { detail: `unit ${a.u} × ${b.u}` });
  }
  if (op === '÷') {
    if (Math.abs(b.v) < EPS) return ne('division_by_zero');
    if (a.u === b.u) return num(a.v / b.v, 'ratio');
    if (b.u === 'ratio') return num(a.v / b.v, a.u);
    if (a.u === 'm2' && b.u === 'm') return num(a.v / b.v, 'm');
    return ne('expression_error', { detail: `unit ${a.u} ÷ ${b.u}` });
  }
  return ne('expression_error', { detail: `op ${op}` });
}

// three-valued booleans: {k:'bool', b: true|false|null, reason}
const bool = (b, reason = null) => ({ k: 'bool', b, reason });

function compare(op, a, b) {
  for (const x of [a, b]) if (x.k === 'ne') return bool(null, x.reason);
  if (a.k !== 'num' || b.k !== 'num') return bool(null, 'expression_error');
  if (a.u !== b.u) return bool(null, 'expression_error');
  const d = a.v - b.v;
  switch (op) {
    case '<': return bool(d < -EPS);
    case '≤': return bool(d <= EPS);
    case '>': return bool(d > EPS);
    case '≥': return bool(d >= -EPS);
    default: return bool(Math.abs(d) <= EPS);
  }
}

function lotVar(lot, name) {
  const v = lot?.vars?.[name] ?? lot?.user?.[name];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Evaluate an AST node. env = { lot, vocab, resolveTarget(name) → oracle result, dropped: Set<relative arg path>,
 * enacted: {bylaw: 'YYYY-MM-DD'}, trace: string[] }.
 */
export function ev(node, env) {
  const { lot, vocab } = env;
  switch (node.n) {
    case 'num': return num(node.v, node.u);
    case 'kw': return { k: node.v };
    case 'var': {
      if (vocab?.dsl_target?.[node.name]) {
        if (!env.resolveTarget) return ne('expression_error', { detail: `no resolver for ${node.name}` });
        const r = env.resolveTarget(node.name);
        env.trace?.push(`${node.name} -> ${r.status}${r.value !== undefined && r.value !== null ? `=${r.value}` : ''}${r.reason ? `:${r.reason}` : ''}`);
        if (r.status === 'value') {
          if (typeof r.value !== 'number') return ne('referenced_target_conflict', { detail: `${node.name} has several bounds` });
          return num(r.value, vocab.dsl_target[node.name].unit);
        }
        if (r.status === 'unlimited' || r.status === 'unregulated') return { k: r.status };
        if (r.status === 'conflict') return ne('referenced_target_conflict');
        return ne(r.reason || 'expression_error');
      }
      if (vocab?.dsl_input?.[node.name]) {
        const v = lotVar(lot, node.name);
        return v === null ? ne('missing_input', { detail: node.name }) : num(v, vocab.dsl_input[node.name].unit);
      }
      return ne('expression_error', { detail: `unknown variable ${node.name}` });
    }
    case 'label': {
      const v = lot?.label?.[node.code];
      const u = unitOf(vocab, 'label_letter', node.code);
      if (!u) return ne('expression_error', { detail: `unknown label letter ${node.code}` });
      return typeof v === 'number' ? num(v, u) : ne('label_value_absent', { absent: true });
    }
    case 'overlay': {
      const v = lot?.overlays?.[node.code];
      const u = unitOf(vocab, 'overlay_code', node.code);
      if (!u) return ne('expression_error', { detail: `unknown overlay ${node.code}` });
      return typeof v === 'number' ? num(v, u) : ne('map_value_absent', { absent: true });
    }
    case 'bin': return arith(node.op, ev(node.a, env), ev(node.b, env));
    case 'max':
    case 'min': {
      const kept = node.args.filter((a) => !(a.path && env.dropped?.has(a.path)));
      if (kept.length === 0) return ne('all_arguments_displaced');
      const vals = [];
      for (const a of kept) {
        const v = ev(a.e, env);
        if (v.k === 'ne' && v.absent && (a.e.n === 'label' || a.e.n === 'overlay')) continue; // M-48: absent map argument dropped
        vals.push(v);
      }
      if (vals.length === 0) return ne('all_map_arguments_absent');
      const bad = vals.find((v) => v.k === 'ne'); if (bad) return bad;
      if (vals.some((v) => v.k === 'unregulated')) return ne('unregulated_in_arithmetic');
      const nums = vals.filter((v) => v.k === 'num');
      if (new Set(nums.map((v) => v.u)).size > 1) return ne('expression_error', { detail: 'mixed units in max/min' });
      if (node.n === 'max') {
        if (vals.some((v) => v.k === 'unlimited')) return { k: 'unlimited' };
        return num(Math.max(...nums.map((v) => v.v)), nums[0].u);
      }
      if (nums.length === 0) return { k: 'unlimited' };
      return num(Math.min(...nums.map((v) => v.v)), nums[0].u);
    }
    case 'if': {
      const c = cond(node.c, env);
      if (c.b === null) return ne(c.reason || 'condition_unknown');
      return ev(c.b ? node.a : node.b, env);
    }
    case 'band': {
      const s = ev(node.subj, env);
      if (s.k === 'ne') return s;
      if (s.k !== 'num') return ne('expression_error', { detail: 'band subject is not a number' });
      for (let i = 0; i < node.arms.length; i += 1) {
        const c = cond(node.arms[i].c, env);
        if (c.b === null) return ne(c.reason || 'condition_unknown');
        if (c.b) { env.trace?.push(`band arm ${i + 1}`); return ev(node.arms[i].e, env); }
      }
      return ne('band_no_match');
    }
    case 'by_type': {
      const t = lot?.building_type;
      if (!t) return ne('needs_user_input:building_type');
      const parent = vocab?.building_type?.[t]?.parent;
      const arm = node.arms.find((a) => a.key === t) || (parent && node.arms.find((a) => a.key === parent)) || node.arms.find((a) => a.key === 'other');
      return arm ? ev(arm.e, env) : ne('by_type_unlisted');
    }
    case 'existing': {
      let date = node.date;
      if (!date) {
        date = env.enacted?.[node.bylaw] ?? null;
        if (!date) return ne('enactment_date_unknown');
      }
      env.trace?.push(`existing(${node.v}; ${date})`);
      const rec = lot?.existing?.[node.v];
      const v = rec && typeof rec === 'object' ? rec[date] : null;
      const u = vocab?.dsl_input?.[node.v]?.unit ?? vocab?.dsl_target?.[node.v]?.unit;
      return typeof v === 'number' && u ? num(v, u) : ne('existing_building_facts');
    }
    default: return ne('expression_error', { detail: `not a value: ${node.n}` });
  }
}

/** Evaluate a condition node to a three-valued boolean. */
export function cond(node, env) {
  switch (node.n) {
    case 'and': {
      const a = cond(node.a, env); if (a.b === false) return a;
      const b = cond(node.b, env); if (b.b === false) return b;
      if (a.b === null) return a; if (b.b === null) return b;
      return bool(true);
    }
    case 'or': {
      const a = cond(node.a, env); if (a.b === true) return a;
      const b = cond(node.b, env); if (b.b === true) return b;
      if (a.b === null) return a; if (b.b === null) return b;
      return bool(false);
    }
    case 'not': { const a = cond(node.a, env); return a.b === null ? a : bool(!a.b); }
    case 'cmp': return compare(node.op, ev(node.a, env), ev(node.b, env));
    case 'mapped': return bool(typeof env.lot?.overlays?.[node.code] === 'number');
    case 'labelled': return bool(typeof env.lot?.label?.[node.code] === 'number');
    default: return bool(null, 'expression_error');
  }
}

/** Convenience for tests: evaluate a bare expression against a lot (no target resolution). */
export function evalStandalone(src, lot, vocab = null) {
  let ast;
  try { ast = parseExpr(src); } catch (e) { return ne('expression_error', { detail: String(e.message || e) }); }
  return ev(ast, { lot, vocab, dropped: new Set(), trace: [] });
}

export { DslError };
