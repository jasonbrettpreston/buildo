// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §7.4 (the DSL + the S1 / Spec 69 M-48 additions),
//            §7.2 (value_form, generated, never keyed), §6 (`numeric_expression`, `condition` are ⧉ fields);
//            docs/specs/01-pipeline/69_mcbylaw_policy.md M-48; docs/reports/mcbylaw-phase1-plan.md S6
//
// Parser + canonicalizer for the numeric_expression grammar. Pure: no fs, no clock, no network.
//
//   statement := target "=" expr "@" clause_path
//   expr      := literal | variable | unlimited | "(" expr ")" | max(arg; …) | min(arg; …)
//              | band(variable; armcond:literal; …) | if(cond; expr; expr) | by_type(type:expr; …[; other:expr])
//              | existing(variable; date | enacted(bylaw)) | label(letter) | overlay(code) | expr op expr
//   arg       := expr ["@" clause_path]
//   cond      := atom { (and | or) atom }          atom := variable cmp literal | mapped(code) | labelled(letter) | not atom
//   literal   := number unit                       unit ∈ { m, m2, pct, storeys, units, ratio }
//
// Two reading choices where §7.4 is silent (listed as open questions in the S6 report, not rulings):
//   (a) `and` / `or` have no stated precedence, so a cond that MIXES them at one level must use parentheses
//       ("(" cond ")" is accepted as an atom); an unparenthesized mix is a parse error, never a guessed precedence.
//   (b) a band arm's value is a `literal` or `unlimited` exactly as written (`cond:literal`); an expression-valued
//       tier (RD 1462) is keyed as an if-chain.
//
// Canonical form (§7.4, agreement compares canonical forms): whitespace removed, numerals normalized (15 ≡ 15.0),
// ASCII operators mapped to × ÷ − ≤ ≥; arguments sorted ONLY for max, min, +, × and by_type keys; if and band keep
// their order. A unit's statement list is a set, so `canonicalExpression()` sorts the canonical statements.
//
// Errors are thrown as DslError with a closed `code`: syntax · bad_literal · bad_unit · bad_target · bad_clause_path
// · unknown_function · mixed_and_or · band_arm_not_literal · min_max_arity · duplicate_by_type_key · value_form_mixed.

export const LITERAL_UNITS = Object.freeze(['m', 'm2', 'pct', 'storeys', 'units', 'ratio']);
export const VALUE_FORMS = Object.freeze(['literal', 'band', 'formula', 'by_building_type', 'if', 'map_lookup', 'existing_as_of', 'none']);
export const DSL_ERROR_CODES = Object.freeze([
  'syntax', 'bad_literal', 'bad_unit', 'bad_target', 'bad_clause_path', 'unknown_function', 'mixed_and_or',
  'band_arm_not_literal', 'min_max_arity', 'duplicate_by_type_key', 'value_form_mixed',
]);

const KEYWORDS = new Set(['max', 'min', 'band', 'if', 'by_type', 'existing', 'enacted', 'label', 'overlay', 'unlimited', 'mapped', 'labelled', 'not', 'and', 'or']);
const OPS = { '+': '+', '-': '−', '−': '−', '*': '×', '×': '×', '/': '÷', '÷': '÷' };
const CMPS = { '<': '<', '<=': '≤', '≤': '≤', '>': '>', '>=': '≥', '≥': '≥', '=': '=' };
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*/;
// a clause path: optional '#', optional letter prefix (SSP, PBS, whole), then zero or more "(x)" groups
const CLAUSE_PATH = /^#?(?:[A-Za-z]+)?(?:\([A-Za-z0-9]+\))*/;

export class DslError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = 'DslError';
    this.code = code;
  }
}

// ---------------------------------------------------------------- tokenizer
function tokenize(src) {
  const toks = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const rest = src.slice(i);
    if (/\s/.test(c)) { i++; continue; }
    let m;
    if (c === '@') {
      let j = i + 1;
      while (j < src.length && /\s/.test(src[j])) j++;
      m = CLAUSE_PATH.exec(src.slice(j));
      if (!m || !m[0] || m[0] === '#') throw new DslError('bad_clause_path', `"@" must be followed by a clause path at ${i} in: ${src}`);
      toks.push({ t: 'at', v: m[0] });
      i = j + m[0].length;
      continue;
    }
    // a by-law number is only legal as the argument of enacted( … )
    const prev = toks[toks.length - 1];
    const prev2 = toks[toks.length - 2];
    if (prev && prev.t === '(' && prev2 && prev2.t === 'id' && prev2.v === 'enacted' && (m = /^\d+-\d{4}(?![\d.])/.exec(rest))) {
      toks.push({ t: 'bylaw', v: m[0] }); i += m[0].length; continue;
    }
    if ((m = /^\d{4}-\d{2}-\d{2}(?![\d.])/.exec(rest))) { toks.push({ t: 'date', v: m[0] }); i += m[0].length; continue; }
    if ((m = /^\d+(?:\.\d+)?/.exec(rest))) { toks.push({ t: 'num', v: m[0] }); i += m[0].length; continue; }
    if ((m = IDENT.exec(rest))) { toks.push({ t: 'id', v: m[0] }); i += m[0].length; continue; }
    const two = src.slice(i, i + 2);
    if (two === '<=' || two === '>=') { toks.push({ t: 'cmp', v: CMPS[two] }); i += 2; continue; }
    if ('<>≤≥='.includes(c)) { toks.push({ t: 'cmp', v: CMPS[c] }); i++; continue; }
    if (OPS[c]) { toks.push({ t: 'op', v: OPS[c] }); i++; continue; }
    if ('();:'.includes(c)) { toks.push({ t: c }); i++; continue; }
    throw new DslError('syntax', `unexpected character '${c}' at ${i} in: ${src}`);
  }
  return toks;
}

// ---------------------------------------------------------------- parser
class Parser {
  constructor(src) { this.src = src; this.toks = tokenize(src); this.i = 0; }
  peek(k = 0) { return this.toks[this.i + k]; }
  next() {
    const t = this.toks[this.i++];
    if (!t) throw new DslError('syntax', `unexpected end of: ${this.src}`);
    return t;
  }
  expect(t, v) {
    const x = this.next();
    if (x.t !== t || (v !== undefined && x.v !== v)) throw new DslError('syntax', `expected ${v ?? t}, got ${x.v ?? x.t} in: ${this.src}`);
    return x;
  }
  isTok(t, k = 0) { const x = this.peek(k); return !!x && x.t === t; }
  isId(v, k = 0) { const x = this.peek(k); return !!x && x.t === 'id' && x.v === v; }
  done() { if (this.i !== this.toks.length) throw new DslError('syntax', `trailing tokens at ${this.i} in: ${this.src}`); }

  expr() {
    let l = this.term();
    while (this.isTok('op') && (this.peek().v === '+' || this.peek().v === '−')) l = { type: 'bin', op: this.next().v, l, r: this.term() };
    return l;
  }
  term() {
    let l = this.factor();
    while (this.isTok('op') && (this.peek().v === '×' || this.peek().v === '÷')) l = { type: 'bin', op: this.next().v, l, r: this.factor() };
    return l;
  }
  literal() {
    const n = this.next();
    if (n.t !== 'num') throw new DslError('bad_literal', `expected a number, got ${n.v ?? n.t} in: ${this.src}`);
    const u = this.peek();
    if (!u || u.t !== 'id' || !LITERAL_UNITS.includes(u.v)) throw new DslError('bad_unit', `literal ${n.v} needs a unit from {${LITERAL_UNITS.join(', ')}} in: ${this.src}`);
    this.i++;
    return { type: 'lit', raw: n.v, value: Number(n.v), unit: u.v };
  }
  factor() {
    const t = this.peek();
    if (!t) throw new DslError('syntax', `unexpected end of: ${this.src}`);
    if (t.t === 'num') return this.literal();
    if (t.t === '(') { this.next(); const e = this.expr(); this.expect(')'); return e; }
    if (t.t !== 'id') throw new DslError('syntax', `unexpected ${t.v ?? t.t} in: ${this.src}`);
    const name = this.next().v;
    if (name === 'unlimited') return { type: 'unlimited' };
    if (!this.isTok('(')) {
      if (KEYWORDS.has(name) || LITERAL_UNITS.includes(name)) throw new DslError('syntax', `keyword ${name} used as a variable in: ${this.src}`);
      return { type: 'var', name };
    }
    this.next();
    let node;
    if (name === 'max' || name === 'min') {
      const args = [this.arg()];
      while (this.isTok(';')) { this.next(); args.push(this.arg()); }
      if (args.length < 2) throw new DslError('min_max_arity', `${name} needs ≥ 2 arguments in: ${this.src}`);
      node = { type: 'call', fn: name, args };
    } else if (name === 'band') {
      const v = this.variable();
      const arms = [];
      while (this.isTok(';')) {
        this.next();
        const conds = [this.armCmp()];
        while (this.isId('and')) { this.next(); conds.push(this.armCmp()); }
        this.expect(':');
        const value = this.bandValue();
        arms.push({ conds, value });
      }
      if (!arms.length) throw new DslError('syntax', `band needs ≥ 1 arm in: ${this.src}`);
      node = { type: 'band', v, arms };
    } else if (name === 'if') {
      const cond = this.cond(); this.expect(';');
      const a = this.expr(); this.expect(';');
      const b = this.expr();
      node = { type: 'if', cond, a, b };
    } else if (name === 'by_type') {
      const entries = [];
      do {
        if (entries.length) this.expect(';');
        const k = this.expect('id').v;
        if (entries.some((e) => e.key === k)) throw new DslError('duplicate_by_type_key', `by_type key ${k} twice in: ${this.src}`);
        this.expect(':');
        entries.push({ key: k, expr: this.expr() });
      } while (this.isTok(';'));
      node = { type: 'by_type', entries };
    } else if (name === 'existing') {
      const v = this.variable(); this.expect(';');
      if (this.isTok('date')) node = { type: 'existing', var: v.name, date: this.next().v };
      else if (this.isId('enacted') && this.isTok('(', 1)) {
        this.next(); this.next();
        const b = this.next();
        if (b.t !== 'bylaw') throw new DslError('syntax', `enacted() needs a by-law number like 569-2013 in: ${this.src}`);
        this.expect(')');
        node = { type: 'existing', var: v.name, enacted: b.v };
      } else throw new DslError('syntax', `existing() needs an ISO date or enacted(<by-law>) in: ${this.src}`);
    } else if (name === 'label') {
      node = { type: 'label', letter: this.expect('id').v };
    } else if (name === 'overlay') {
      node = { type: 'overlay', code: this.expect('id').v };
    } else throw new DslError('unknown_function', `${name}() in: ${this.src}`);
    this.expect(')');
    return node;
  }
  arg() {
    const e = this.expr();
    if (this.isTok('at') && (this.isTok(';', 1) || this.isTok(')', 1))) return { ...e, argPath: normPath(this.next().v) };
    return e;
  }
  variable() {
    const t = this.next();
    if (t.t !== 'id' || KEYWORDS.has(t.v)) throw new DslError('syntax', `expected a variable, got ${t.v ?? t.t} in: ${this.src}`);
    return { type: 'var', name: t.v };
  }
  bandValue() {
    if (this.isId('unlimited')) { this.next(); return { type: 'unlimited' }; }
    if (!this.isTok('num')) throw new DslError('band_arm_not_literal', `a band arm value is a literal (§7.4 band(variable; cond:literal; …)) in: ${this.src}`);
    const lit = this.literal();
    if (this.isTok('op')) throw new DslError('band_arm_not_literal', `a band arm value is a literal, not an expression, in: ${this.src}`);
    return lit;
  }
  armCmp() { const c = this.expect('cmp').v; return { cmp: c, lit: this.literal() }; }
  // cond := atom {(and|or) atom}; mixing and/or at one level without parentheses is rejected (no stated precedence)
  cond() {
    const atoms = [this.atom()];
    let joiner = null;
    while (this.isId('and') || this.isId('or')) {
      const j = this.next().v;
      if (joiner && joiner !== j) throw new DslError('mixed_and_or', `mixing "and" and "or" needs parentheses in: ${this.src}`);
      joiner = j;
      atoms.push(this.atom());
    }
    return atoms.length === 1 ? atoms[0] : { type: joiner, xs: atoms };
  }
  atom() {
    if (this.isId('not')) { this.next(); return { type: 'not', x: this.atom() }; }
    if (this.isId('mapped') && this.isTok('(', 1)) { this.next(); this.next(); const c = this.expect('id').v; this.expect(')'); return { type: 'mapped', code: c }; }
    if (this.isId('labelled') && this.isTok('(', 1)) { this.next(); this.next(); const c = this.expect('id').v; this.expect(')'); return { type: 'labelled', letter: c }; }
    if (this.isTok('(')) { this.next(); const c = this.cond(); this.expect(')'); return c; }
    const lhs = this.expr();
    const cmp = this.expect('cmp').v;
    return { type: 'cmp', lhs, cmp, lit: this.literal() };
  }
}

function normPath(p) { return p.replace(/\s+/g, ''); }

/** Parse one statement "target = expr @clause_path" → {type:'statement', target, expr, path}. Throws DslError. */
export function parseStatement(src) {
  if (typeof src !== 'string') throw new DslError('syntax', 'a statement is a string');
  const eq = src.indexOf('=');
  if (eq < 0) throw new DslError('syntax', `statement needs "target =": ${src}`);
  const target = src.slice(0, eq).trim();
  if (!IDENT.test(target) || IDENT.exec(target)[0] !== target || KEYWORDS.has(target)) throw new DslError('bad_target', `bad target "${target}" in: ${src}`);
  const p = new Parser(src.slice(eq + 1));
  const expr = p.expr();
  if (!p.isTok('at')) throw new DslError('bad_clause_path', `statement needs a final "@clause_path": ${src}`);
  const path = normPath(p.next().v);
  p.done();
  return { type: 'statement', target, expr, path };
}

/** Parse a bare expression (no target, no final @). */
export function parseExpr(src) { const p = new Parser(src); const e = p.expr(); p.done(); return e; }

/** Parse a condition (`condition.if`). */
export function parseCond(src) { const p = new Parser(src); const c = p.cond(); p.done(); return c; }

/** A unit's numeric_expression: "none" | string | string[] → statement ASTs ([] for "none"). */
export function parseExpression(numericExpression) {
  if (numericExpression === 'none' || numericExpression == null) return [];
  const list = Array.isArray(numericExpression) ? numericExpression : [numericExpression];
  return list.map(parseStatement);
}

// ---------------------------------------------------------------- canonical form
function num(raw) { return String(Number(raw)); }
const byStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export function canonExpr(e) {
  const tag = e.argPath ? `@${e.argPath}` : '';
  return canonCore(e) + tag;
}
function canonCore(e) {
  switch (e.type) {
    case 'lit': return num(e.raw) + e.unit;
    case 'unlimited': return 'unlimited';
    case 'var': return e.name;
    case 'label': return `label(${e.letter})`;
    case 'overlay': return `overlay(${e.code})`;
    case 'existing': return `existing(${e.var};${e.date ?? `enacted(${e.enacted})`})`;
    case 'call': return `${e.fn}(${e.args.map(canonExpr).sort(byStr).join(';')})`;
    case 'band': return `band(${e.v.name};${e.arms.map((a) => a.conds.map((c) => c.cmp + canonExpr(c.lit)).join('and') + ':' + canonExpr(a.value)).join(';')})`;
    case 'if': return `if(${canonCond(e.cond)};${canonExpr(e.a)};${canonExpr(e.b)})`;
    case 'by_type': return `by_type(${e.entries.map((x) => `${x.key}:${canonExpr(x.expr)}`).sort(byStr).join(';')})`;
    case 'bin': {
      if (e.op === '+' || e.op === '×') {
        const flat = [];
        const walk = (n) => { if (n.type === 'bin' && n.op === e.op && !n.argPath) { walk(n.l); walk(n.r); } else flat.push(n); };
        walk(e);
        return flat.map(wrap).sort(byStr).join(e.op);
      }
      return wrap(e.l) + e.op + wrap(e.r);
    }
    default: throw new DslError('syntax', `canonical: unknown node ${e.type}`);
  }
}
function wrap(n) { return n.type === 'bin' && !n.argPath ? `(${canonExpr(n)})` : canonExpr(n); }

export function canonCond(c) {
  switch (c.type) {
    // delimited, so the map is injective (`not(a<5m)` ≠ a variable `nota`); nested same-type and/or flatten (associative)
    case 'and': case 'or': {
      const flat = [];
      const walk = (n) => { if (n.type === c.type) for (const x of n.xs) walk(x); else flat.push(n); };
      walk(c);
      return `${c.type}(${flat.map(canonCond).join(';')})`;
    }
    case 'not': return `not(${canonCond(c.x)})`;
    case 'mapped': return `mapped(${c.code})`;
    case 'labelled': return `labelled(${c.letter})`;
    case 'cmp': return canonExpr(c.lhs) + c.cmp + canonExpr(c.lit);
    default: throw new DslError('syntax', `canonical: unknown condition ${c.type}`);
  }
}

/** Canonical form of one statement string. */
export function canonicalStatement(src) {
  const s = parseStatement(src);
  return `${s.target}=${canonExpr(s.expr)}@${s.path}`;
}

/** Canonical form of a unit's numeric_expression ("none" | string | string[]): sorted canonical statements joined by "\n". */
export function canonicalExpression(numericExpression) {
  const sts = parseExpression(numericExpression);
  if (!sts.length) return 'none';
  return [...new Set(sts.map((s) => `${s.target}=${canonExpr(s.expr)}@${s.path}`))].sort(byStr).join('\n');
}

/** Canonical form of a unit's `condition`: "none" | {tokens|token, if}. Tokens are a conjunction (a set) → sorted. */
export function canonicalCondition(condition) {
  if (condition === 'none' || condition == null) return 'none';
  const raw = condition.tokens ?? condition.token ?? [];
  const tokens = (Array.isArray(raw) ? raw : [raw]).filter((t) => t && t !== 'none').slice().sort(byStr);
  const iff = condition.if && condition.if !== 'none' ? canonCond(parseCond(condition.if)) : 'none';
  return `[${tokens.join(',')}]if:${iff}`;
}

// ---------------------------------------------------------------- value_form (§7.2)
/** value_form of one expression AST: the form of its outermost head. */
export function valueFormOf(e) {
  switch (e.type) {
    case 'band': return 'band';
    case 'call': return 'formula';
    case 'bin': return 'formula';
    case 'var': return 'formula';
    case 'by_type': return 'by_building_type';
    case 'if': return 'if';
    case 'label': case 'overlay': return 'map_lookup';
    case 'existing': return 'existing_as_of';
    case 'lit': case 'unlimited': return 'literal';
    default: throw new DslError('syntax', `value_form: unknown node ${e.type}`);
  }
}

/** value_form of a unit's numeric_expression. "none" → none; every statement must share one form. */
export function valueForm(numericExpression) {
  const sts = parseExpression(numericExpression);
  if (!sts.length) return 'none';
  const forms = [...new Set(sts.map((s) => valueFormOf(s.expr)))];
  if (forms.length > 1) throw new DslError('value_form_mixed', `statements have forms ${forms.join(', ')}`);
  return forms[0];
}

// ---------------------------------------------------------------- static checks (vocab injected)
/**
 * Unit table from a vocab: dsl_target / dsl_input entries carry `.unit`; label_letter / overlay_code map to units.
 * Shape expected of vocab.json (S5): {dsl_target:{name:{unit}}, dsl_input:{name:{unit}}, label_letter:{f:{unit}}, overlay_code:{HT:{unit}}}.
 */
export function unitTable(vocab) {
  const pick = (o) => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k, typeof v === 'string' ? v : v.unit]));
  return { target: pick(vocab.dsl_target), input: pick(vocab.dsl_input), label: pick(vocab.label_letter), overlay: pick(vocab.overlay_code) };
}

export function unitOfVariable(name, units) { return units.input[name] ?? units.target[name] ?? null; }

/** Unit algebra shared with the evaluator: returns the result unit or null (illegal). */
export function combineUnits(op, a, b) {
  if (op === '+' || op === '−') return a === b ? a : null;
  if (op === '×') {
    if (a === 'ratio' || a === 'pct') return b;
    if (b === 'ratio' || b === 'pct') return a;
    if (a === 'm' && b === 'm') return 'm2';
    return null;
  }
  if (op !== '÷') return null;
  if (a === b) return 'ratio';
  if (b === 'ratio') return a;
  if (a === 'm2' && b === 'm') return 'm';
  return null;
}

/**
 * Static check of one statement against the vocab: target known, every variable known, literal units bind to the
 * variable or target they bind to (§7.4), operators unit-legal. Returns a list of violations (empty = ok).
 */
export function checkStatement(statement, vocab) {
  const s = typeof statement === 'string' ? parseStatement(statement) : statement;
  const units = unitTable(vocab);
  const errs = [];
  const tu = units.target[s.target] ?? null;
  const types = vocab.building_type ? new Set([...vocab.building_type, 'other']) : null;
  if (types) for (const k of byTypeKeys(s.expr)) if (!types.has(k)) errs.push(`unknown_building_type: ${k}`);
  if (!tu) errs.push(`unknown_target: ${s.target}`);
  const u = staticUnit(s.expr, units, errs);
  if (tu && u && u !== tu) errs.push(`unit_mismatch: expression unit ${u} ≠ target ${s.target} unit ${tu}`);
  return errs;
}

function staticUnit(e, U, errs) {
  switch (e.type) {
    case 'lit': return e.unit;
    case 'unlimited': return null; // takes the unit of its context
    case 'var': { const u = unitOfVariable(e.name, U); if (!u) errs.push(`unknown_variable: ${e.name}`); return u; }
    case 'label': return U.label[e.letter] ?? (errs.push(`unknown_label_letter: ${e.letter}`), null);
    case 'overlay': return U.overlay[e.code] ?? (errs.push(`unknown_overlay_code: ${e.code}`), null);
    case 'existing': { const u = unitOfVariable(e.var, U); if (!u) errs.push(`unknown_variable: ${e.var}`); return u; }
    case 'call': return same(e.args.map((a) => staticUnit(a, U, errs)), `${e.fn} mixes units`, errs);
    case 'band': {
      const vu = staticUnit(e.v, U, errs);
      for (const a of e.arms) for (const c of a.conds) if (vu && c.lit.unit !== vu) errs.push(`unit_mismatch: band threshold ${c.lit.raw} ${c.lit.unit} vs ${e.v.name} ${vu}`);
      return same(e.arms.map((a) => staticUnit(a.value, U, errs)), 'band arms mix units', errs);
    }
    case 'if': { condUnits(e.cond, U, errs); return same([staticUnit(e.a, U, errs), staticUnit(e.b, U, errs)], 'if branches mix units', errs); }
    case 'by_type': return same(e.entries.map((x) => staticUnit(x.expr, U, errs)), 'by_type arms mix units', errs);
    case 'bin': {
      const a = staticUnit(e.l, U, errs); const b = staticUnit(e.r, U, errs);
      if (mayBeUnlimited(e.l) || mayBeUnlimited(e.r)) { errs.push('unlimited_in_arithmetic'); return null; }
      if (!a || !b) return null;
      const r = combineUnits(e.op, a, b);
      if (!r) errs.push(`unit_mismatch: ${a} ${e.op} ${b}`);
      return r;
    }
    default: errs.push(`unknown_node: ${e.type}`); return null;
  }
}
function same(us, msg, errs) {
  const known = us.filter(Boolean);
  if (new Set(known).size > 1) errs.push(`unit_mismatch: ${msg} (${known.join(', ')})`);
  return known[0] ?? null;
}
function condUnits(c, U, errs) {
  if (c.type === 'and' || c.type === 'or') { for (const x of c.xs) condUnits(x, U, errs); return; }
  if (c.type === 'not') { condUnits(c.x, U, errs); return; }
  if (c.type === 'mapped') { if (!U.overlay[c.code]) errs.push(`unknown_overlay_code: ${c.code}`); return; }
  if (c.type === 'labelled') { if (!U.label[c.letter]) errs.push(`unknown_label_letter: ${c.letter}`); return; }
  if (c.type === 'cmp') {
    const u = staticUnit(c.lhs, U, errs);
    if (u && u !== c.lit.unit) errs.push(`unit_mismatch: condition literal ${c.lit.raw} ${c.lit.unit} vs ${u}`);
  }
}

/** True when an operand can evaluate to `unlimited` (bare, or an arm of max / min / band / if / by_type). */
function mayBeUnlimited(e) {
  if (!e || typeof e !== 'object') return false;
  if (e.type === 'unlimited') return true;
  if (e.type === 'call') return e.args.some(mayBeUnlimited);
  if (e.type === 'band') return e.arms.some((a) => mayBeUnlimited(a.value));
  if (e.type === 'if') return mayBeUnlimited(e.a) || mayBeUnlimited(e.b);
  if (e.type === 'by_type') return e.entries.some((x) => mayBeUnlimited(x.expr));
  return false;
}
function byTypeKeys(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (node.type === 'by_type') for (const x of node.entries) out.push(x.key);
  for (const k of Object.keys(node)) { const v = node[k]; if (Array.isArray(v)) for (const x of v) byTypeKeys(x, out); else if (v && typeof v === 'object') byTypeKeys(v, out); }
  return out;
}

/** Every literal in an AST (statement, expr or cond) — G-CLAUSE checks each against the cited clause. */
export function literalsOf(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (node.type === 'lit') { out.push(node); return out; }
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (Array.isArray(v)) for (const x of v) literalsOf(x, out);
    else if (v && typeof v === 'object') literalsOf(v, out);
  }
  return out;
}

/** Every variable name in an AST. */
export function variablesOf(node, out = new Set()) {
  if (!node || typeof node !== 'object') return out;
  if (node.type === 'var') out.add(node.name);
  if (node.type === 'existing') out.add(node.var);
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (Array.isArray(v)) for (const x of v) variablesOf(x, out);
    else if (v && typeof v === 'object') variablesOf(v, out);
  }
  return out;
}

/** Argument clause paths (`arg @clause`) inside an AST — the targets argument-level displacement may name. */
export function argPathsOf(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (node.argPath) out.push(node.argPath);
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (Array.isArray(v)) for (const x of v) argPathsOf(x, out);
    else if (v && typeof v === 'object') argPathsOf(v, out);
  }
  return out;
}
