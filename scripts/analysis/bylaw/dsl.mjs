// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §7.4 (the DSL + the S1 / Spec 69 M-48 additions),
//            §7.2 (value_form, generated, never keyed), §6 (`numeric_expression`, `condition` are ⧉ fields);
//            docs/specs/01-pipeline/69_mcbylaw_policy.md M-48; docs/reports/mcbylaw-phase1-plan.md S6
//
// Parser + canonicalizer for the numeric_expression grammar. Pure: no fs, no clock, no network.
//
//   statement := target "=" expr "@" clause_path
//   expr      := literal | variable | unlimited | unregulated | "(" expr ")" | max(arg; …) | min(arg; …)
//              | band(variable; armcond:literal; …) | if(cond; expr; expr) | by_type(type:expr; …[; other:expr])
//              | existing(variable; date | enacted(bylaw)) | label(letter) | overlay(code) | expr op expr
//              | [Layer 3 only, M-72 / M-466] lv(id) | l2(target) | floor/ceil/round(expr) | sqrt(expr)  (sqrt: a ratio argument only)
//              | [Layer 3 only, M-480] refuse(word) | flag(word; expr) | best_of(expr; expr[; …][; ceiling: expr])
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
// their order; an argument @path equal to its statement's @path is dropped (rule C3). A unit's statement list is a
// set, so `canonicalExpression()` sorts the canonical statements.
//
// Errors are thrown as DslError with a closed `code`: syntax · bad_literal · bad_unit · bad_target · bad_clause_path
// · unknown_function · mixed_and_or · band_arm_not_literal · min_max_arity · duplicate_by_type_key · value_form_mixed
// · too_deep (nesting past MAX_NEST — parse and canonicalize are bounded, so no input ever overflows the stack).

import L3_CATALOGUE from '../../seeds/bylaw/layer3-catalogue.json' with { type: 'json' };
export const LEX = L3_CATALOGUE.lexicon;

export const LITERAL_UNITS = Object.freeze(['m', 'm2', 'pct', 'storeys', 'units', 'ratio']);
export const VALUE_FORMS = Object.freeze(['literal', 'band', 'formula', 'by_building_type', 'if', 'map_lookup', 'existing_as_of', 'none']);
export const DSL_ERROR_CODES = Object.freeze([
  'syntax', 'bad_literal', 'bad_unit', 'bad_target', 'bad_clause_path', 'unknown_function', 'mixed_and_or',
  'band_arm_not_literal', 'min_max_arity', 'duplicate_by_type_key', 'value_form_mixed', 'too_deep',
]);
/** Nesting bound for the recursive parser and canonicalizer (real by-law expressions nest < 10 deep). */
export const MAX_NEST = 200;

const KEYWORDS = new Set(['max', 'min', 'band', 'if', 'by_type', 'existing', 'enacted', 'label', 'overlay', 'unlimited', 'unregulated', 'mapped', 'labelled', 'holds', 'not', 'and', 'or']);
// MB-31 (M-72 Layer 3 forms, plan section 3 E1): enabled only by { layer: 'l3' }; Layer 1/2 parsing is unchanged.
const L3_REF_FNS = [LEX.w.lv, LEX.w.l2];
const L3_INT_FNS = [LEX.w.floor, LEX.w.ceil, LEX.w.round];
const L3_REFUSED_FNS = [LEX.w.label, LEX.w.overlay, LEX.w.mapped, LEX.w.labelled];
// MB-27 (sqrt; Spec 69a M-466, the M-377 form of a note on M-72): the one-argument root form, Layer 3 only.
const L3_ROOT_FNS = [LEX.w.sqrt];
// MB-27 (M-72 forms; Spec 69a M-480, the M-377 form of a note on M-72): refuse, flag and best_of, Layer 3 only. The reason and
// flag words are the catalogue's declared lists (data, never code); a word outside them is a static error, never a parse error.
export const L3_DECLARED = Object.freeze({
  refuse_reasons: Object.freeze([...(L3_CATALOGUE.refuse_reasons || [])]),
  drop_reasons: Object.freeze([...(L3_CATALOGUE.drop_reasons || [])]),
  flag_words: Object.freeze([...(L3_CATALOGUE.flag_words || [])]),
  // M-480 dated note (Q-K5 a): a parameterised flag word, written `<word>: <reason>`, takes its reason from its own closed list
  flag_params: Object.freeze(Object.fromEntries(Object.entries(L3_CATALOGUE.flag_params || {}).map(([w, rs]) => [w, Object.freeze([...rs])]))),
});
const OPS = { '+': '+', '-': '−', '−': '−', '*': '×', '×': '×', '/': '÷', '÷': '÷' };
const CMPS = { '<': '<', '<=': '≤', '≤': '≤', '>': '>', '>=': '≥', '≥': '≥', '=': '=' };
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*/;
// a clause path: optional '#', optional letter prefix (SSP, PBS, whole), then zero or more "(x)" groups or bracket groups —
// the Ch.900 list groups [SSP] / [PBS], data-table cells [T2.R4.C2] (Spec 69 M-57) and the enacting [instruction] clause
// (Spec 68 §6 path ids) and status-variant tags ~under_appeal / ~repeat2 (Spec 69 M-57)
const CLAUSE_PATH = /^#?(?:[A-Za-z]+)?(?:\([A-Za-z0-9]+\)|\[[A-Za-z0-9.]+\]|~[a-z][a-z0-9_]*)*/; // ~<status> variant tag (Spec 69 M-57)

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
  constructor(src, opts) { this.src = src; this.toks = tokenize(src); this.i = 0; this.depth = 0; this.l3 = !!(opts && opts.layer === LEX.w.l3); }
  nest(fn) {
    if (++this.depth > MAX_NEST) throw new DslError('too_deep', `nesting deeper than ${MAX_NEST} in: ${this.src.slice(0, 120)}`);
    try { return fn(); } finally { this.depth--; }
  }
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
  factor() { return this.nest(() => this.factor0()); }
  factor0() {
    const t = this.peek();
    if (!t) throw new DslError('syntax', `unexpected end of: ${this.src}`);
    if (t.t === 'num') return this.literal();
    if (t.t === '(') { this.next(); const e = this.expr(); this.expect(')'); return e; }
    if (t.t !== 'id') throw new DslError('syntax', `unexpected ${t.v ?? t.t} in: ${this.src}`);
    const name = this.next().v;
    if (name === 'unlimited') return { type: 'unlimited' };
    if (name === 'unregulated') return { type: 'unregulated' }; // Spec 69 M-54: the by-law sets no limit here
    if (!this.isTok('(')) {
      if (KEYWORDS.has(name) || LITERAL_UNITS.includes(name)) throw new DslError('syntax', `keyword ${name} used as a variable in: ${this.src}`);
      return { type: 'var', name };
    }
    this.next();
    let node;
    // MB-31 (M-72 Layer 3 forms, plan section 3 E1): enabled only by { layer: 'l3' }; Layer 1/2 parsing is unchanged.
    if (this.l3 && L3_REF_FNS.includes(name)) {
      node = { type: name, id: this.expect(LEX.w.id).v };
    } else if (this.l3 && L3_INT_FNS.includes(name)) {
      node = { type: LEX.w.int, fn: name, a: this.expr() };
    } else if (this.l3 && L3_ROOT_FNS.includes(name)) {
      node = { type: LEX.w.root, fn: name, a: this.expr() }; // M-466
    } else if (this.l3 && name === LEX.w.refuse) {
      node = { type: LEX.w.refuse, word: this.expect(LEX.w.id).v }; // M-480: exactly one reason word
    } else if (this.l3 && name === LEX.w.flag) {
      const word = this.expect(LEX.w.id).v; // M-480: one disclosure word, then the expression
      let param = null; // M-480 dated note (Q-K5 a): `<word>: <reason>`, one reason word
      if (this.isTok(LEX.p.colon)) { this.next(); param = this.expect(LEX.w.id).v; }
      this.expect(LEX.p.semi);
      node = param === null ? { type: LEX.w.flag, word, a: this.expr() } : { type: LEX.w.flag, word, param, a: this.expr() };
    } else if (this.l3 && name === LEX.w.best_of) {
      node = this.bestOf(); // M-480
    } else if (this.l3 && L3_REFUSED_FNS.includes(name)) {
      throw new DslError(LEX.w.unknown_function, `${name}${LEX.p.is_not_a_layer_3_form_in} ${this.src}`);
    } else if (name === LEX.w.max || name === LEX.w.min) {
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
  /** M-480: best_of(<expr>; <expr>[; …][; ceiling: <expr>]): two or more candidates in argument order, at most one ceiling, last. */
  bestOf() {
    const args = [];
    let ceiling = null;
    for (;;) {
      if (this.isId(LEX.w.ceiling) && this.isTok(LEX.p.colon, 1)) {
        if (ceiling) throw new DslError(LEX.w.syntax, `${LEX.p.ceiling_once_in} ${this.src}`);
        this.next();
        this.next();
        ceiling = this.expr();
      } else {
        if (ceiling) throw new DslError(LEX.w.syntax, `${LEX.p.ceiling_must_be_last_in} ${this.src}`);
        args.push(this.expr());
      }
      if (!this.isTok(LEX.p.semi)) break;
      this.next();
    }
    if (args.length < 2) throw new DslError(LEX.w.syntax, `${LEX.p.best_of_needs_2_candidates_in} ${this.src}`);
    return ceiling ? { type: LEX.w.best_of, args, ceiling } : { type: LEX.w.best_of, args };
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
    if (this.isId('unregulated')) { this.next(); return { type: 'unregulated' }; }
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
  atom() { return this.nest(() => this.atom0()); }
  atom0() {
    if (this.isId('not')) { this.next(); return { type: 'not', x: this.atom() }; }
    // MB-31 (M-72 Layer 3 forms, plan section 3 E1): enabled only by { layer: 'l3' }; Layer 1/2 parsing is unchanged.
    if (this.l3 && this.isId(LEX.w.mapped) && this.isTok(LEX.p.open, 1)) throw new DslError(LEX.w.unknown_function, `${LEX.p.mapped_is_not_a_layer_3_form_in} ${this.src}`);
    if (this.l3 && this.isId(LEX.w.labelled) && this.isTok(LEX.p.open, 1)) throw new DslError(LEX.w.unknown_function, `${LEX.p.labelled_is_not_a_layer_3_form_in} ${this.src}`);
    if (this.l3 && this.isId(LEX.w.regulated) && this.isTok(LEX.p.open, 1)) { this.next(); this.next(); const id = this.expect(LEX.w.id).v; this.expect(LEX.p.close); return { type: LEX.w.regulated, id }; }
    if (this.isId('mapped') && this.isTok('(', 1)) { this.next(); this.next(); const c = this.expect('id').v; this.expect(')'); return { type: 'mapped', code: c }; }
    if (this.isId('labelled') && this.isTok('(', 1)) { this.next(); this.next(); const c = this.expect('id').v; this.expect(')'); return { type: 'labelled', letter: c }; }
    // M-241 (N-2, operator approved 2026-10-20): holds(<lot condition token>) — one statement's own condition when a clause
    // gives each of its statements a different one (10.10.60.20(1)(A): rear / side-street / lane), three-valued from lot.flags
    if (this.isId('holds') && this.isTok('(', 1)) { this.next(); this.next(); const t = this.expect('id').v; this.expect(')'); return { type: 'holds', token: t }; }
    if (this.isTok('(')) { this.next(); const c = this.cond(); this.expect(')'); return c; }
    const lhs = this.expr();
    const cmp = this.expect(LEX.w.cmp).v;
    if (this.l3) {
      const node = this.expr();
      return node.type === LEX.w.lit ? { type: 'cmp', lhs, cmp, lit: node } : { type: 'cmp', lhs, cmp, rhs: node };
    }
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
export function parseExpr(src, opts) { const p = new Parser(src, opts); const e = p.expr(); p.done(); return e; }

// M-242 (N-3, operator approved 2026-10-20, 2026-10-20-bylaw-fix-rulings#N-3): a whole condition may be the complement of
// one or more sibling arms, complement(<unit id>, …) — "in all other cases" takes not (the condition of each arm it
// complements). The sibling's condition is resolved over the agreed units (agree.mjs resolveComplements).
const COMPLEMENT_RE = /^\s*complement\s*\(([\s\S]*)\)\s*$/;
const UNIT_REF_RE = /^[0-9][0-9A-Za-z.()@-]*#[0-9A-Za-z().-]+$/;
/** Parse a condition (`condition.if`). */
export function parseCond(src, opts) {
  const m = typeof src === 'string' ? COMPLEMENT_RE.exec(src) : null;
  if (m) {
    const of = m[1].split(',').map((x) => x.trim());
    if (!of.length || of.some((x) => !UNIT_REF_RE.test(x))) throw new DslError('syntax', `complement(…) names sibling unit ids: ${src}`);
    return { type: 'complement', of };
  }
  const p = new Parser(src, opts); const c = p.cond(); p.done(); return c;
}

/** A unit's numeric_expression: "none" | string | string[] → statement ASTs ([] for "none"). */
export function parseExpression(numericExpression) {
  if (numericExpression === 'none' || numericExpression == null) return [];
  const list = Array.isArray(numericExpression) ? numericExpression : [numericExpression];
  return list.map(parseStatement);
}

// ---------------------------------------------------------------- canonical form
function num(raw) { return String(Number(raw)); }
const byStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

let canonDepth = 0;
function bounded(fn) {
  if (++canonDepth > MAX_NEST) { canonDepth = 0; throw new DslError('too_deep', `canonical: nesting deeper than ${MAX_NEST}`); }
  try { return fn(); } finally { if (canonDepth > 0) canonDepth--; }
}

export function canonExpr(e) {
  const tag = e.argPath ? `@${e.argPath}` : '';
  return bounded(() => canonCore(e)) + tag;
}
function canonCore(e) {
  switch (e.type) {
    case 'lit': return num(e.raw) + e.unit;
    case 'unlimited': return 'unlimited';
    case 'unregulated': return 'unregulated';
    case 'var': return e.name;
    case 'label': return `label(${e.letter})`;
    case 'overlay': return `overlay(${e.code})`;
    case 'existing': return `existing(${e.var};${e.date ?? `enacted(${e.enacted})`})`;
    // MB-31 (M-72 Layer 3 forms, plan section 3 E1): enabled only by { layer: 'l3' }; Layer 1/2 parsing is unchanged.
    case LEX.w.lv: return `${LEX.p.lv}${e.id}${LEX.p.close}`;
    case LEX.w.l2: return `${LEX.p.l2}${e.id}${LEX.p.close}`;
    case LEX.w.int: return `${e.fn}${LEX.p.open}${canonExpr(e.a)}${LEX.p.close}`;
    case LEX.w.root: return `${e.fn}${LEX.p.open}${canonExpr(e.a)}${LEX.p.close}`; // M-466
    // M-480: never sorted (best_of's argument order is its tie order); the ceiling, when given, is last
    case LEX.w.refuse: return `${LEX.w.refuse}${LEX.p.open}${e.word}${LEX.p.close}`;
    case LEX.w.flag: return `${LEX.w.flag}${LEX.p.open}${flagWordOf(e)}${LEX.p.semi}${canonExpr(e.a)}${LEX.p.close}`;
    case LEX.w.best_of: {
      const parts = e.args.map(canonExpr);
      if (e.ceiling) parts.push(`${LEX.w.ceiling}${LEX.p.colon}${canonExpr(e.ceiling)}`);
      return `${LEX.w.best_of}${LEX.p.open}${parts.join(LEX.p.semi)}${LEX.p.close}`;
    }
    case 'call': return `${e.fn}(${e.args.map(canonExpr).sort(byStr).join(';')})`;
    case 'band': return `band(${e.v.name};${e.arms.map((a) => a.conds.map((c) => c.cmp + canonExpr(c.lit)).join('and') + ':' + canonExpr(a.value)).join(';')})`;
    case 'if': return `if(${canonCond(e.cond)};${canonExpr(e.a)};${canonExpr(e.b)})`;
    case 'by_type': return `by_type(${e.entries.map((x) => `${x.key}:${canonExpr(x.expr)}`).sort(byStr).join(';')})`;
    case 'bin': {
      if (e.op === '+' || e.op === '×') {
        const flat = [];
        // flatten from the root's OPERANDS: the root itself may carry an argPath (`max(25 pct × d_m @(B); …)`), and
        // pushing it as its own operand re-entered canonExpr(e) forever (the A1 stack overflow)
        const walk = (n) => { if (n.type === 'bin' && n.op === e.op && !n.argPath) { walk(n.l); walk(n.r); } else flat.push(n); };
        walk(e.l); walk(e.r);
        return flat.map(wrap).sort(byStr).join(e.op);
      }
      return wrap(e.l) + e.op + wrap(e.r);
    }
    default: throw new DslError('syntax', `canonical: unknown node ${e.type}`);
  }
}
/** The flag text a flag() node raises: its word, or `<word>:<reason>` for a parameterised word (M-480 dated note, Q-K5 a). */
export function flagWordOf(e) {
  return e.param === undefined ? e.word : `${e.word}${LEX.p.colon}${e.param}`;
}
function wrap(n) { return n.type === 'bin' && !n.argPath ? `(${canonExpr(n)})` : canonExpr(n); }

export function canonCond(c) { return bounded(() => canonCond0(c)); }
function canonCond0(c) {
  switch (c.type) {
    // delimited, so the map is injective (`not(a<5m)` ≠ a variable `nota`); nested same-type and/or flatten (associative)
    case 'and': case 'or': {
      const flat = [];
      const walk = (n) => { if (n.type === c.type) for (const x of n.xs) walk(x); else flat.push(n); };
      walk(c);
      return `${c.type}(${flat.map(canonCond).join(';')})`;
    }
    case 'not': return `not(${canonCond(c.x)})`;
    case 'complement': return `complement(${c.of.join(';')})`;
    case 'mapped': return `mapped(${c.code})`;
    case 'labelled': return `labelled(${c.letter})`;
    case 'holds': return `holds(${c.token})`;
    // MB-31 (M-72 Layer 3 forms, plan section 3 E1): enabled only by { layer: 'l3' }; Layer 1/2 parsing is unchanged.
    case LEX.w.regulated: return `${LEX.p.regulated}${c.id}${LEX.p.close}`;
    case LEX.w.cmp: return c.rhs ? canonExpr(c.lhs) + c.cmp + canonExpr(c.rhs) : canonExpr(c.lhs) + c.cmp + canonExpr(c.lit);
    default: throw new DslError('syntax', `canonical: unknown condition ${c.type}`);
  }
}

/**
 * Canonical rule C3 (A1 agreement analysis 2026-10-07): an argument `@path` equal to its statement's own `@path` names
 * the statement itself — displacement of that path is whole-unit (evaluate.mjs refMatch → 'full'), never argument-level
 * — so the tag is dropped before comparison. A sub-clause argument path is kept (M-48 argument-level displacement).
 * Bounded like the canonicalizer (a node deeper than MAX_NEST is left as is; canonExpr then throws too_deep).
 */
function dropSelfArgPaths(e, self, depth = 0) {
  if (!e || typeof e !== 'object' || depth > MAX_NEST) return e;
  const out = Array.isArray(e) ? [] : {};
  for (const k of Object.keys(e)) out[k] = k === 'argPath' ? e[k] : dropSelfArgPaths(e[k], self, depth + 1);
  if (!Array.isArray(out) && out.argPath === self) delete out.argPath;
  return out;
}
const canonStatementAst = (s) => `${s.target}=${canonExpr(dropSelfArgPaths(s.expr, s.path))}@${s.path}`;

/** Canonical form of one statement string. */
export function canonicalStatement(src) {
  return canonStatementAst(parseStatement(src));
}

/** Canonical form of a unit's numeric_expression ("none" | string | string[]): sorted canonical statements joined by "\n". */
export function canonicalExpression(numericExpression) {
  const sts = parseExpression(numericExpression);
  if (!sts.length) return 'none';
  return [...new Set(sts.map(canonStatementAst))].sort(byStr).join('\n');
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
    case LEX.w.lv: case LEX.w.l2: case LEX.w.int: case LEX.w.root: case LEX.w.refuse: case LEX.w.flag: case LEX.w.best_of: return LEX.w.formula; // MB-31 Layer 3 forms (plan section 3 E1); root: M-466; refuse, flag, best_of: M-480
    case 'by_type': return 'by_building_type';
    case 'if': return 'if';
    case 'label': case 'overlay': return 'map_lookup';
    case 'existing': return 'existing_as_of';
    case 'lit': case 'unlimited': case 'unregulated': return 'literal';
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
    // Spec 69 M-74: a count scales a length or area ("6.0 metres for each dwelling unit" → 6.0 m × dwelling_units → m)
    if (a === 'units' && (b === 'm' || b === 'm2')) return b;
    if (b === 'units' && (a === 'm' || a === 'm2')) return a;
    // Spec 69a M-251 (M-74's count form): "0.6 metres for each additional storey" → 0.6 m × storeys → m
    if (a === 'storeys' && b === 'm') return b;
    if (b === 'storeys' && a === 'm') return a;
    if (a === 'm' && b === 'm') return 'm2';
    return null;
  }
  if (op !== '÷') return null;
  if (a === b) return 'ratio';
  if (b === 'ratio') return a;
  if (a === 'm2' && b === 'm') return 'm';
  return null;
}

// MB-31 (M-72, E2; E31-09): Layer 3 unit algebra; Layer 1 combineUnits is unchanged.
// A count (a computed storeys / units figure) behaves exactly like `units` inside a product.
const asUnits = (u) => (u === LEX.w.count ? LEX.w.units : u);

/** Layer 3 product / quotient units: an area scales by a storey count, a percentage never multiplies itself or divides. */
export function combineUnitsL3(op, a, b) {
  const x = asUnits(a);
  const y = asUnits(b);
  if (op === LEX.p.times) {
    if (a === LEX.w.pct && b === LEX.w.pct) return null;
    if (a === LEX.w.m2 && b === LEX.w.storeys) return LEX.w.m2;
    if (b === LEX.w.m2 && a === LEX.w.storeys) return LEX.w.m2;
  }
  if (op === LEX.p.divide && a === LEX.w.pct) return null;
  return combineUnits(op, x, y);
}

/** Unify two Layer 3 units: `count` equals `storeys` or `units` and yields the other unit; otherwise equality. */
function unifyL3(a, b) {
  if (a === null || b === null) return { ok: true, unit: a ?? b };
  if (a === b) return { ok: true, unit: a };
  if (a === LEX.w.count && (b === LEX.w.storeys || b === LEX.w.units)) return { ok: true, unit: b };
  if (b === LEX.w.count && (a === LEX.w.storeys || a === LEX.w.units)) return { ok: true, unit: a };
  return { ok: false, unit: null };
}
function unifyAllL3(us) {
  let out = null;
  for (const u of us) {
    const r = unifyL3(out, u);
    if (!r.ok) return r;
    out = r.unit;
  }
  return { ok: true, unit: out };
}

/**
 * Static unit of a Layer 3 expression: `U = { lv:{id:unit}, l2:{id:unit}, names:{id:unit}, flags:string[] }`.
 * Returns `{ unit, errs }`; an unknown reference is reported, never thrown.
 */
export function staticUnitL3(ast, U) {
  const errs = [];
  const u = { lv: (U && U.lv) || {}, l2: (U && U.l2) || {}, names: (U && U.names) || {}, flags: (U && U.flags) || [] };
  const unit = staticExprL3(ast, u, errs);
  return { unit, errs };
}

function staticExprL3(e, U, errs) {
  switch (e.type) {
    case LEX.w.lit: return e.unit;
    case LEX.w.unlimited: case LEX.w.unregulated: return null; // terminal in Layer 3: no unit, no error
    case LEX.w.lv: {
      const out = U.lv[e.id];
      if (!out) errs.push(`${LEX.p.unknown_variable_lv}${e.id}${LEX.p.close}`);
      return out ?? null;
    }
    case LEX.w.l2: {
      const out = U.l2[e.id];
      if (!out) errs.push(`${LEX.p.unknown_target} ${e.id}`);
      return out ?? null;
    }
    case LEX.w.var: {
      const out = U.names[e.name];
      if (out) return out;
      if (Object.prototype.hasOwnProperty.call(U.l2, e.name)) errs.push(`${LEX.p.target_not_via_l2} ${e.name}`);
      else errs.push(`${LEX.p.unknown_variable} ${e.name}`);
      return null;
    }
    case LEX.w.int: {
      const a = staticExprL3(e.a, U, errs);
      return a === LEX.w.ratio ? LEX.w.count : a;
    }
    case LEX.w.root: {
      // M-466: a unitless (ratio) argument gives ratio; a null argument unit stays null (an unknown is never hidden); any other unit is refused
      const a = staticExprL3(e.a, U, errs);
      if (a === null || a === LEX.w.ratio) return a;
      errs.push(`${LEX.p.unit_mismatch} ${e.fn} ${a}`);
      return null;
    }
    case LEX.w.refuse: // M-480: no unit of its own (it unifies with any branch, like unlimited); the word must be declared
      if (!L3_DECLARED.refuse_reasons.includes(e.word)) errs.push(`${LEX.p.unknown_reason} ${e.word}`);
      return null;
    case LEX.w.flag: { // M-480: the unit of its expression; the word must be declared
      const a = staticExprL3(e.a, U, errs);
      const reasons = Object.prototype.hasOwnProperty.call(L3_DECLARED.flag_params, e.word) ? L3_DECLARED.flag_params[e.word] : null;
      if (e.param === undefined) {
        if (!L3_DECLARED.flag_words.includes(e.word)) errs.push(`${LEX.p.unknown_flag} ${e.word}`);
      } else if (!reasons) {
        errs.push(`${LEX.p.unknown_flag} ${e.word}`); // only a declared parameterised word takes a reason (Q-K5 a)
      } else if (!reasons.includes(e.param)) {
        errs.push(`${LEX.p.unknown_reason} ${e.param}`);
      }
      return a;
    }
    case LEX.w.best_of: { // M-480: every candidate and the ceiling share one unit
      const all = e.ceiling ? [...e.args, e.ceiling] : e.args;
      const r = unifyAllL3(all.map((a) => staticExprL3(a, U, errs)));
      if (!r.ok) errs.push(`${LEX.p.unit_mismatch} ${LEX.w.best_of} ${LEX.p.mixes_units}`);
      return r.unit;
    }
    case LEX.w.bin: {
      const a = staticExprL3(e.l, U, errs);
      const b = staticExprL3(e.r, U, errs);
      if (!a || !b) return null;
      const out = combineUnitsL3(e.op, a, b);
      if (!out) errs.push(`${LEX.p.unit_mismatch} ${a} ${e.op} ${b}`);
      return out;
    }
    case LEX.w.call: {
      const r = unifyAllL3(e.args.map((a) => staticExprL3(a, U, errs)));
      if (!r.ok) errs.push(`${LEX.p.unit_mismatch} ${e.fn} ${LEX.p.mixes_units}`);
      return r.unit;
    }
    case LEX.w.if: {
      condUnitsL3(e.cond, U, errs);
      const r = unifyAllL3([staticExprL3(e.a, U, errs), staticExprL3(e.b, U, errs)]);
      if (!r.ok) errs.push(LEX.p.unit_mismatch_if_branches_mix_units);
      return r.unit;
    }
    default: errs.push(`${LEX.p.unknown_node} ${e.type}`); return null;
  }
}

function condUnitsL3(c, U, errs) {
  switch (c.type) {
    case LEX.w.cmp: {
      const a = staticExprL3(c.lhs, U, errs);
      const b = c.lit ? c.lit.unit : staticExprL3(c.rhs, U, errs);
      if (a && b && !unifyL3(a, b).ok) errs.push(`${LEX.p.unit_mismatch_condition} ${a} ${c.cmp} ${b}`);
      return;
    }
    case LEX.w.regulated: if (!U.l2[c.id]) errs.push(`${LEX.p.unknown_target} ${c.id}`); return;
    case LEX.w.holds: if (!U.flags.includes(c.token)) errs.push(`${LEX.p.unknown_flag} ${c.token}`); return;
    case LEX.w.and: case LEX.w.or: for (const x of c.xs) condUnitsL3(x, U, errs); return;
    case LEX.w.not: condUnitsL3(c.x, U, errs); return;
    default: errs.push(`${LEX.p.unknown_node} ${c.type}`);
  }
}

/** Row-level Layer 3 unit check: parse, static unit, then compare with the catalogue row's declared unit. */
export function checkRowL3(row, U) {
  if (!row || row.form === LEX.w.status) return [];
  let ast;
  try { ast = parseExpr(row.expression, { layer: LEX.w.l3 }); } catch (e) {
    if (e instanceof DslError) return [`${LEX.p.parse_error} ${e.code}`];
    throw e;
  }
  const { unit, errs } = staticUnitL3(ast, U);
  if (!errs.length && unit && row.unit && !unifyL3(unit, row.unit).ok) errs.push(`${LEX.p.unit_mismatch_expression} ${unit} ${LEX.p.row} ${row.unit}`);
  // one error per distinct violation, first occurrence order kept: a row that names the same bad target twice reports it once
  return [...new Set(errs)];
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
  // vocab.json keeps building_type as {name: {structure, …}}; fixture vocabs may pass a list of names (S6g patch)
  const bt = vocab.building_type;
  const types = bt ? new Set([...(Array.isArray(bt) ? bt : Object.keys(bt)), 'other']) : null;
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
    case 'unregulated': return null;
    case 'var': { const u = unitOfVariable(e.name, U); if (!u) errs.push(`unknown_variable: ${e.name}`); return u; }
    case 'label': return U.label[e.letter] ?? (errs.push(`unknown_label_letter: ${e.letter}`), null);
    case 'overlay': return U.overlay[e.code] ?? (errs.push(`unknown_overlay_code: ${e.code}`), null);
    case 'existing': { const u = unitOfVariable(e.var, U); if (!u) errs.push(`unknown_variable: ${e.var}`); return u; }
    case 'call':
      if (e.args.some(mayBeUnregulated)) errs.push('unregulated_not_terminal');
      return same(e.args.map((a) => staticUnit(a, U, errs)), `${e.fn} mixes units`, errs);
    case 'band': {
      const vu = staticUnit(e.v, U, errs);
      for (const a of e.arms) for (const c of a.conds) if (vu && c.lit.unit !== vu) errs.push(`unit_mismatch: band threshold ${c.lit.raw} ${c.lit.unit} vs ${e.v.name} ${vu}`);
      return same(e.arms.map((a) => staticUnit(a.value, U, errs)), 'band arms mix units', errs);
    }
    case 'if': { condUnits(e.cond, U, errs); return same([staticUnit(e.a, U, errs), staticUnit(e.b, U, errs)], 'if branches mix units', errs); }
    case 'by_type': return same(e.entries.map((x) => staticUnit(x.expr, U, errs)), 'by_type arms mix units', errs);
    case 'bin': {
      const a = staticUnit(e.l, U, errs); const b = staticUnit(e.r, U, errs);
      if (mayBeUnregulated(e.l) || mayBeUnregulated(e.r)) { errs.push('unregulated_not_terminal'); return null; }
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
  if (c.type === 'complement') return; // M-242: its sibling's units are checked on the sibling
  if (c.type === 'holds') return; // M-241: a lot condition token carries no unit
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
/** True when an operand can evaluate to `unregulated` (M-54): it is terminal, never an operand of max / min / arithmetic. */
function mayBeUnregulated(e) {
  if (!e || typeof e !== 'object') return false;
  if (e.type === 'unregulated') return true;
  if (e.type === 'band') return e.arms.some((a) => mayBeUnregulated(a.value));
  if (e.type === 'if') return mayBeUnregulated(e.a) || mayBeUnregulated(e.b);
  if (e.type === 'by_type') return e.entries.some((x) => mayBeUnregulated(x.expr));
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

// MB-31 (M-72 Layer 3 forms, plan section 3 E1): enabled only by { layer: 'l3' }; Layer 1/2 parsing is unchanged.
/** Every reference a Layer 3 AST names: lv(...) ids, l2(...)/regulated(...) ids, and bare variable names. Each sorted, unique. */
export function l3RefsOf(node) {
  const lv = new Set();
  const l2 = new Set();
  const names = new Set();
  const walk = (n) => {
    if (!n || typeof n !== LEX.w.object) return;
    if (n.type === LEX.w.lv) lv.add(n.id);
    else if (n.type === LEX.w.l2 || n.type === LEX.w.regulated) l2.add(n.id);
    else if (n.type === LEX.w.var) names.add(n.name);
    for (const k of Object.keys(n)) {
      const v = n[k];
      if (Array.isArray(v)) for (const x of v) walk(x);
      else if (v && typeof v === LEX.w.object) walk(v);
    }
  };
  walk(node);
  const sorted = (s) => [...s].sort(byStr);
  return { lv: sorted(lv), l2: sorted(l2), names: sorted(names) };
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
