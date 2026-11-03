// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-72 (Layer 3 extension), M-377; MB-31 plan section 3 (E5, E6, E8), ledger L31-02, L31-11
//
// Layer 3 semantics, held in one module that the ONE evaluator (`evaluate.mjs`) calls behind `ctx.layer === 'l3'`.
// The hook edits in `evaluate.mjs` are brief B5: they are NOT built here. This file never reads fs, env, the clock
// or the network. Rounding is injected by the evaluator (`env.round9`, `env.eps`): this module types no rounding
// constant of its own, so the evaluator owns its 9-place r9 and EPS.
//
// Values are plain (never frozen) objects, and `flags` is always a sorted, unique string array:
//   { k: 'num', v, u, flags, clause? }   { k: 'unlimited', clause, flags }   { k: 'unregulated', clause, flags, na? }
//   { k: 'absent', id, flags }           { k: 'ne', reason, undecided, flags }   { k: 'nb', clauses, flags }
//
// B3 holds the value algebra: num · ne · nb · unionFlags · arith · minMax · applyInt · compare · and3 · or3 · not3.
// B4 appends the Layer 3 readers (contract C3): makeL3Env · readL2 · readLv · readName · readHolds · readRegulated ·
// L3RefusalError. Every reader pushes ONE trace entry to `env.trace` in call order, BEFORE it returns (E9).

import { combineUnitsL3, DslError, LEX, parseExpr } from './dsl.mjs';

/** Union of flag lists: deduplicated and sorted, so a flag comparison is a plain array equality. */
export function unionFlags(...lists) {
  return [...new Set(lists.flatMap((l) => (Array.isArray(l) ? l : [])))].sort();
}

const flagsOf = (v) => (v && Array.isArray(v.flags) ? v.flags : []);

export function num(v, u, flags = [], clause) {
  const out = { k: LEX.w.num, v, u, flags: unionFlags(flags) };
  if (clause !== undefined && clause !== null) out.clause = clause;
  return out;
}

export function ne(reason, undecided, flags = []) {
  const list = Array.isArray(undecided) && undecided.length ? undecided : [{ id: '', reason }];
  return {
    k: LEX.w.ne,
    reason,
    undecided: list.map((d) => ({ id: d && d.id !== undefined ? d.id : '', reason: d && d.reason !== undefined ? d.reason : reason })),
    flags: unionFlags(flags),
  };
}

export function nb(clauses, flags = []) {
  return { k: LEX.w.nb, clauses: [...new Set(Array.isArray(clauses) ? clauses : [])], flags: unionFlags(flags) };
}

const isKind = (v, k) => Boolean(v) && v.k === k;
const isNe = (v) => isKind(v, LEX.w.ne);
const isNb = (v) => isKind(v, LEX.w.nb);
const isNum = (v) => isKind(v, LEX.w.num);
const isOpenEnded = (v) => isKind(v, LEX.w.unlimited) || isKind(v, LEX.w.unregulated);
const undecidedOf = (v) => (Array.isArray(v.undecided) && v.undecided.length ? v.undecided.map((d) => ({ ...d })) : [{ id: '', reason: v.reason }]);
/** An error value carrying the unioned flags of its operands (a flag read upstream is never lost). */
const fail = (reason, flags, undecided) => ne(reason, undecided, flags);

/** The two operands' magnitudes with a percentage turned into its fraction (pct scaling is the only use of 100). */
function magnitudes(op, a, b) {
  if (a.u === LEX.w.pct) return [a.v / 100, b.v];
  if (b.u === LEX.w.pct) return op === LEX.p.times ? [a.v, b.v / 100] : null;
  return [a.v, b.v];
}

/**
 * Arithmetic over Layer 3 values, most decisive operand first: nb dominates; then ne; then absent (a missing Layer 2
 * target); then unlimited / unregulated (the first such operand, flags unioned); only then the numbers. A pair whose
 * units do not combine is `ne('expression_error:unit_mismatch')`; a zero divisor is `ne('division_by_zero')`.
 */
export function arith(op, a, b, env) {
  const flags = unionFlags(flagsOf(a), flagsOf(b));
  const nbs = [a, b].filter(isNb);
  if (nbs.length) return nb(nbs.flatMap((v) => v.clauses), flags);
  const nes = [a, b].filter(isNe);
  if (nes.length) return fail(nes[0].reason, flags, nes.flatMap(undecidedOf));
  const absents = [a, b].filter((v) => isKind(v, LEX.w.absent));
  if (absents.length) {
    const reason = LEX.p.missing_input_absent_target;
    return fail(reason, flags, absents.map((v) => ({ id: `${LEX.p.l2}${v.id}${LEX.p.close}`, reason })));
  }
  const open = [a, b].find(isOpenEnded);
  if (open) return { ...open, flags };
  if (!isNum(a) || !isNum(b)) return fail(LEX.p.expression_error_unknown_variable, flags);
  const unit = combineUnitsL3(op, a.u, b.u);
  if (unit === null) return fail(LEX.p.expression_error_unit_mismatch, flags);
  const mags = op === LEX.p.times || op === LEX.p.divide ? magnitudes(op, a, b) : null;
  if ((op === LEX.p.times || op === LEX.p.divide) && mags === null) return fail(LEX.p.expression_error_unit_mismatch, flags);
  if (op === LEX.p.divide && mags[1] === 0) return fail(LEX.w.division_by_zero, flags);
  if (op === LEX.p.plus) return num(a.v + b.v, unit, flags);
  if (op === LEX.p.sym) return num(a.v - b.v, unit, flags);
  if (op === LEX.p.times) return num(mags[0] * mags[1], unit, flags);
  if (op === LEX.p.divide) return num(mags[0] / mags[1], unit, flags);
  return fail(LEX.p.expression_error_unknown_operator, flags);
}

const extreme = (list, dir) => list.reduce((best, v) => ((dir === LEX.w.min ? v.v < best.v : v.v > best.v) ? v : best));

/**
 * `min` / `max` over Layer 3 values. `min` lets nb dominate; `max` drops nb unless every argument is nb (then their
 * clauses union). Then ne (first reason, every undecided list). `min` prefers the smallest number, then the first
 * unlimited, then the first unregulated, then the first absent; `max` prefers unlimited, then unregulated, then the
 * largest number, then absent. Absent arguments never block a number. Flags union over ALL arguments.
 */
export function minMax(fn, vals, env) {
  const list = Array.isArray(vals) ? vals : [];
  const flags = unionFlags(...list.map(flagsOf));
  const nbs = list.filter(isNb);
  if (nbs.length && (fn === LEX.w.min || nbs.length === list.length)) return nb(nbs.flatMap((v) => v.clauses), flags);
  const live = nbs.length ? list.filter((v) => !isNb(v)) : list;
  const nes = live.filter(isNe);
  if (nes.length) return fail(nes[0].reason, flags, nes.flatMap(undecidedOf));
  const nums = live.filter(isNum);
  const unlimited = live.filter((v) => isKind(v, LEX.w.unlimited));
  const unregulated = live.filter((v) => isKind(v, LEX.w.unregulated));
  const absents = live.filter((v) => isKind(v, LEX.w.absent));
  const pass = (v) => ({ ...v, flags });
  if (fn === LEX.w.min) {
    if (nums.length) return num(extreme(nums, LEX.w.min).v, nums[0].u, flags);
    if (unlimited.length) return pass(unlimited[0]);
    if (unregulated.length) return pass(unregulated[0]);
    return absents.length ? pass(absents[0]) : fail(LEX.p.expression_error_unknown_variable, flags);
  }
  if (unlimited.length) return pass(unlimited[0]);
  if (unregulated.length) return pass(unregulated[0]);
  if (nums.length) return num(extreme(nums, LEX.w.max).v, nums[0].u, flags);
  return absents.length ? pass(absents[0]) : fail(LEX.p.expression_error_unknown_variable, flags);
}

/**
 * `floor` / `ceil` / `round` of a number. The argument is rounded at 9 places BEFORE the integer function, so a binary
 * representation like 2.9999999999999996 floors to 3 while a true fraction still floors to its lower integer. A ratio
 * becomes a `count` (a computed storeys / units figure); any other unit is kept. A non-num value passes through.
 */
export function applyInt(fn, a, env) {
  if (!isNum(a)) return a;
  const f = Math[fn];
  const v = (typeof f === LEX.w.function ? f : Math.round)(env.round9(a.v));
  return num(v, a.u === LEX.w.ratio ? LEX.w.count : a.u, flagsOf(a), a.clause);
}

const family = (u) => (u === LEX.w.count ? [LEX.w.count, LEX.w.storeys, LEX.w.units] : [u]);
const sameUnit = (a, b) => family(a).includes(b) || family(b).includes(a);

/**
 * Three-valued comparison: a boolean, or the first ne / nb operand (kept whole), or a `ne` for a non-numeric operand
 * (unlimited / unregulated cannot be compared) or a mixed-unit pair. Both values are rounded at 9 places first.
 */
export function compare(cmp, a, b, env) {
  const decisive = [a, b].find((v) => isNe(v) || isNb(v));
  if (decisive) return decisive;
  if (!isNum(a) || !isNum(b)) return ne(LEX.p.condition_unknown_unlimited_or_unregulat);
  if (!sameUnit(a.u, b.u)) return ne(LEX.p.expression_error_unit_mismatch);
  const flags = unionFlags(flagsOf(a), flagsOf(b));
  const x = env.round9(a.v);
  const y = env.round9(b.v);
  if (cmp === LEX.p.lt) return x < y;
  if (cmp === LEX.p.le) return x <= y;
  if (cmp === LEX.p.gt) return x > y;
  if (cmp === LEX.p.ge) return x >= y;
  if (cmp === LEX.p.eq) return x === y;
  return fail(LEX.p.expression_error_unknown_comparison, flags);
}

const isValue = (r) => Boolean(r) && typeof r === LEX.w.object && !Array.isArray(r);

/**
 * Three-valued `and` over thunks (lazy, left to right): a false ends it at once; any other non-boolean (an ne / nb
 * value) is REMEMBERED (the first one) and the walk continues, since a later false is decisive; at the end the
 * remembered value if any, else true.
 */
export function and3(thunks) {
  let remembered = null;
  for (const thunk of thunks) {
    const r = thunk();
    if (r === false) return false;
    if (typeof r !== LEX.w.boolean && remembered === null) remembered = r;
  }
  return remembered === null ? true : remembered; // remembered: the first ne / nb, a false was decisive above
}

/**
 * Three-valued `or` over thunks (lazy, left to right): a true ends it at once; any other non-boolean is REMEMBERED
 * (the first one) and the walk continues, since a later true is decisive; at the end the remembered value, else false.
 */
export function or3(thunks) {
  let remembered = null;
  for (const thunk of thunks) {
    const r = thunk();
    if (r === true) return true;
    if (typeof r !== LEX.w.boolean && remembered === null) remembered = r;
  }
  return remembered === null ? false : remembered;
}

/** Kleene negation: a boolean flips, an ne / nb value passes through unchanged. */
export function not3(r) {
  if (r === true) return false;
  if (r === false) return true;
  return r;
}

// ── C3 · the Layer 3 readers (B4, plan section 3: E3, E4, E7, E8, E9; E31-03, E31-10, E31-26, E31-38) ──────────────
//
// Every reader takes `(id, env)` and pushes ONE trace entry to `env.trace` in read order, before it returns. A reader
// never names a zone, a scenario or a by-law number (M-61): it only looks an id up in the env that `makeL3Env` holds.

/** A refusal: an out-of-bounds setting is never a row status, it stops the evaluation. */
export class L3RefusalError extends Error {
  constructor(code, setting, value, min, max) {
    super(`${code}${LEX.p.colon} ${setting} ${LEX.p.eq} ${value} ${LEX.p.is_outside}${min}${LEX.p.comma} ${max}${LEX.p.rbracket}`);
    this.name = LEX.p.l3refusalerror;
    this.code = code;
    this.setting = setting;
  }
}

const traceOf = (env) => {
  if (!env || !Array.isArray(env.trace)) return null;
  return env.trace;
};
const push = (env, entry) => {
  const t = traceOf(env);
  if (t) t.push(entry);
};
const inputFlagsOf = (env, key) => {
  const map = env && env.inputFlags;
  return map && Array.isArray(map[key]) ? map[key] : [];
};
/** An error value carrying the row's input flags for that key (a flag read upstream is never lost). */
const neAt = (env, key, reason, undecided) => ne(reason, undecided, inputFlagsOf(env, key));
const nullish = (v) => v === undefined || v === null;
const cellClause = (cell) => (cell && !nullish(cell.clause) ? cell.clause : null);

/** The Layer 3 evaluation env. Every field is taken from `o` with a plain default; `trace` records every read. */
export function makeL3Env(o = {}) {
  const base = o && typeof o === LEX.w.object ? o : {};
  return {
    cells: base.cells || {},
    targetUnits: base.targetUnits || {},
    optionalTargets: base.optionalTargets || [],
    settingDecls: base.settingDecls || {},
    settingVals: base.settingVals || {},
    switches: base.switches || {},
    geometryDecls: base.geometryDecls || {},
    geometry: base.geometry || {},
    factDecls: base.factDecls || {},
    facts: base.facts || {},
    lotFlags: base.lotFlags || {},
    rowIds: base.rowIds || [],
    readRow: typeof base.readRow === LEX.w.function ? base.readRow : () => ne(LEX.p.expression_error_unknown_variable),
    inputFlags: base.inputFlags || {},
    round9: typeof base.round9 === LEX.w.function ? base.round9 : (x) => x,
    eps: typeof base.eps === LEX.w.number ? base.eps : 0,
    trace: Array.isArray(base.trace) ? base.trace : [],
    switchesRead: Array.isArray(base.switchesRead) ? base.switchesRead : [],
  };
}

const isPct = (unit) => unit === LEX.w.pct;
const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);

/** A cell is malformed when its words, kind or value cannot be believed (the only magnitude limits: 0 and 100). */
function cellMalformed(cell, unit) {
  const statuses = [LEX.w.applies, LEX.w.not_applicable, 'not_evaluated', LEX.w.conflict];
  const kinds = [LEX.w.number, LEX.w.unlimited, LEX.w.unregulated];
  if (!cell || typeof cell !== LEX.w.object || !statuses.includes(cell.s)) return true;
  if (cell.s !== LEX.w.applies) return false;
  if (!kinds.includes(cell.kind)) return true;
  if (cell.kind !== LEX.w.number) return !nullish(cell.value);
  const v = cell.value;
  if (typeof v !== LEX.w.number || !Number.isFinite(v) || v < 0) return true;
  return isPct(unit) && v > 100;
}

/** The value a well-formed cell decodes to (never called for a malformed cell, a reason or a conflict cell). */
function cellValue(cell, unit, flags) {
  const clause = cellClause(cell);
  if (cell.s === LEX.w.not_applicable) return { k: LEX.w.unregulated, clause, flags, na: true };
  if (cell.kind === LEX.w.unlimited) return { k: LEX.w.unlimited, clause, flags };
  if (cell.kind === LEX.w.unregulated) return { k: LEX.w.unregulated, clause, flags };
  return num(cell.value, unit, flags, clause);
}

/**
 * A stored Layer 2 cell, decoded (E3/E4): unknown target, a missing cell (optional -> absent, else a missing input), a
 * malformed cell, a clause switched off, a not_evaluated reason, a conflict, then the cell itself.
 */
export function readL2(id, env) {
  const key = `${LEX.p.l2}${id}${LEX.p.close}`;
  const flags = inputFlagsOf(env, key);
  const idAt = [{ id: key, reason: LEX.p.expression_error_unknown_target }];
  if (!has(env.targetUnits, id)) return neAt(env, key, LEX.p.expression_error_unknown_target, idAt);
  const unit = env.targetUnits[id];
  const cell = has(env.cells, id) ? env.cells[id] : undefined;
  if (nullish(cell)) {
    if ((env.optionalTargets || []).includes(id)) {
      push(env, { kind: LEX.w.l2, id, status: LEX.w.absent });
      return { k: LEX.w.absent, id, flags: unionFlags(flags) };
    }
    push(env, { kind: LEX.w.l2, id, status: LEX.w.absent });
    return neAt(env, key, LEX.p.missing_input_absent_target, [{ id: key, reason: LEX.p.missing_input_absent_target }]);
  }
  if (cellMalformed(cell, unit)) {
    push(env, { kind: LEX.w.l2, id, status: 'not_evaluated' });
    return neAt(env, key, LEX.p.condition_unknown_cell_malformed, [{ id: key, reason: LEX.p.condition_unknown_cell_malformed }]);
  }
  const clause = cellClause(cell);
  const entry = { kind: LEX.w.l2, id, status: cell.s, clause };
  if (cell.s === LEX.w.applies && cell.kind === LEX.w.number) entry.value = cell.value;
  if (!nullish(clause) && env.switches[`${LEX.p.clause}${clause}`] === LEX.w.off) {
    push(env, entry);
    env.switchesRead.push({ id: `${LEX.p.clause}${clause}`, state: LEX.w.off });
    const reason = `${LEX.p.clause_switched_off}${clause}`;
    return neAt(env, key, reason, [{ id: `${LEX.p.clause}${clause}`, reason }]);
  }
  push(env, entry);
  if (cell.s === 'not_evaluated') {
    const reason = nullish(cell.reason) ? 'not_evaluated' : cell.reason;
    return neAt(env, key, reason, [{ id: key, reason }]);
  }
  if (cell.s === LEX.w.conflict) return neAt(env, key, LEX.w.layer2_conflict, [{ id: key, reason: LEX.w.layer2_conflict }]);
  return { ...cellValue(cell, unit, flags), flags: unionFlags(flags) };
}

/** A setting's guard: its switch decides whether the declared value applies at all (reading switches are data). */
function lvGuard(decl, id, env) {
  if (nullish(decl.switch)) return null;
  return env.switches[decl.switch] === LEX.w.on;
}

/**
 * A Layer 3 setting (`lv`, E7): an unknown setting, a missing value (never the declared default), the switch guard
 * (off -> the default with its `flags_off`; on without a provenance -> `setting_not_fitted`; on -> `flags_on`), then the
 * declared bounds. A value outside its bounds THROWS an `L3RefusalError`: it is never a row status.
 */
export function readLv(id, env) {
  const key = `${LEX.p.lv}${id}${LEX.p.close}`;
  const decl = has(env.settingDecls, id) ? env.settingDecls[id] : undefined;
  if (!decl || typeof decl !== LEX.w.object) {
    push(env, { kind: LEX.w.lv, id, status: 'not_evaluated' });
    return neAt(env, key, LEX.p.expression_error_unknown_variable, [{ id: key, reason: LEX.p.expression_error_unknown_variable }]);
  }
  const flags = inputFlagsOf(env, key);
  const citation = nullish(decl.citation) ? undefined : decl.citation;
  const entry = (status) => push(env, { kind: LEX.w.lv, id, citation, ...status });
  const stored = has(env.settingVals, id) ? env.settingVals[id] : undefined;
  const value = stored && typeof stored === LEX.w.object ? stored.value : undefined;
  if (nullish(value)) {
    entry({ status: 'not_evaluated' });
    return neAt(env, key, `${LEX.p.missing_input}${key}`, [{ id: key, reason: `${LEX.p.missing_input}${key}` }]);
  }
  const on = lvGuard(decl, id, env);
  if (on === false) {
    entry({ status: LEX.w.applies, guard_state: LEX.w.off });
    return num(decl.default, decl.unit, unionFlags(flags, decl.flags_off), citation);
  }
  if (on === true && decl.provenance_required_when_on === true && nullish(stored.provenance)) {
    entry({ status: 'not_evaluated', guard_state: LEX.w.on });
    const reason = `${LEX.p.setting_not_fitted}${id}`;
    return neAt(env, key, reason, [{ id: key, reason }]);
  }
  if (value < decl.min || value > decl.max) {
    entry({ status: 'not_evaluated' });
    throw new L3RefusalError(LEX.w.setting_out_of_bounds, id, value, decl.min, decl.max);
  }
  entry({ status: LEX.w.applies, value });
  return num(value, decl.unit, unionFlags(flags, on === true ? decl.flags_on : []), citation);
}

/** A fact's own bounds, read against two settings' stored values (`bounds_lv`), never against a bare number. */
function factOutOfBounds(decl, value, env) {
  if (!Array.isArray(decl.bounds_lv) || decl.bounds_lv.length !== 2) return false;
  const bound = (i) => {
    const s = env.settingVals[decl.bounds_lv[i]];
    return s && typeof s === LEX.w.object ? s.value : undefined;
  };
  const lo = bound(0);
  const hi = bound(1);
  if (nullish(lo) || nullish(hi)) return false;
  return value < lo || value > hi;
}
const declFlags = (decl) => (Array.isArray(decl.flags) ? decl.flags : []);

/**
 * A bare name (E8): an upstream row first, then a derived fact (its decl flags, a not_evaluated reason, its
 * `bounds_lv`), then a geometry input; else the id is a Layer 2 target (it must be read through `l2(...)`), or unknown.
 */
export function readName(id, env) {
  if ((env.rowIds || []).includes(id)) {
    const v = env.readRow(id, env);
    push(env, { kind: LEX.w.row, id, status: v && v.k });
    return v;
  }
  const f = has(env.factDecls, id) ? env.factDecls[id] : undefined;
  if (f) {
    const flags = declFlags(f);
    const stored = has(env.facts, id) ? env.facts[id] : undefined;
    if (nullish(stored)) {
      push(env, { kind: LEX.w.fact, id, status: 'not_evaluated' });
      return ne(`${LEX.p.missing_input}${id}`, [{ id, reason: `${LEX.p.missing_input}${id}` }], flags);
    }
    if (typeof stored === LEX.w.object) {
      push(env, { kind: LEX.w.fact, id, status: 'not_evaluated' });
      const reason = nullish(stored.not_evaluated) ? `${LEX.p.missing_input}${id}` : stored.not_evaluated;
      return ne(reason, [{ id, reason }], flags);
    }
    push(env, { kind: LEX.w.fact, id, status: LEX.w.applies, value: stored });
    if (factOutOfBounds(f, stored, env)) {
      const reason = `${LEX.p.fact_out_of_bounds}${id}`;
      return ne(reason, [{ id, reason }], flags);
    }
    return num(stored, f.unit, flags);
  }
  const g = has(env.geometryDecls, id) ? env.geometryDecls[id] : undefined;
  if (g) {
    const stored = has(env.geometry, id) ? env.geometry[id] : undefined;
    if (nullish(stored)) {
      push(env, { kind: LEX.w.geometry, id, status: 'not_evaluated' });
      return ne(`${LEX.p.missing_input}${id}`, [{ id, reason: `${LEX.p.missing_input}${id}` }]);
    }
    push(env, { kind: LEX.w.geometry, id, status: LEX.w.applies, value: stored });
    return num(stored, g.unit, []);
  }
  push(env, { kind: LEX.w.row, id, status: 'not_evaluated' });
  if (has(env.targetUnits, id)) return ne(LEX.p.expression_error_target_not_via_l2);
  return ne(LEX.p.expression_error_unknown_variable);
}

/** A lot flag as a three-valued test: its boolean, or `condition_unknown` when the lot never supplied it. */
export function readHolds(token, env) {
  const v = has(env.lotFlags, token) ? env.lotFlags[token] : undefined;
  if (v === true || v === false) {
    push(env, { kind: LEX.w.flag, id: token, status: v });
    return v;
  }
  push(env, { kind: LEX.w.flag, id: token, status: 'not_evaluated' });
  return ne(`${LEX.p.condition_unknown}${token}`);
}

/** `regulated(<id>)` as a three-valued test: a stored number is true, an open / not-applicable cell is false. */
export function readRegulated(id, env) {
  const v = readL2(id, env);
  const entry = traceOf(env) ? traceOf(env)[traceOf(env).length - 1] : null;
  if (entry && entry.id === id) entry.role = LEX.w.cond;
  if (!v || v.k === LEX.w.ne || v.k === LEX.w.nb) return v;
  if (v.k === LEX.w.unlimited || v.k === LEX.w.unregulated || v.k === LEX.w.absent) return false;
  return true;
}

/**
 * Walk one Layer 3 expression AST (nodes from `parseExpr(src, { layer: 'l3' })`) into a Layer 3 value, using only the
 * algebra and the readers above. `if` is the ONE branching form: a decided condition returns the chosen branch, and an
 * ne / nb condition is returned as it stands (the walk holds no decision of its own). Any other node type is unknown.
 */
export function evalExprL3(e, env) {
  if (e.type === LEX.w.lit) return num(e.value, e.unit);
  if (e.type === LEX.w.unlimited) return { k: LEX.w.unlimited, clause: null, flags: [] };
  if (e.type === LEX.w.unregulated) return { k: LEX.w.unregulated, clause: null, flags: [] };
  if (e.type === LEX.w.lv) return readLv(e.id, env);
  if (e.type === LEX.w.l2) return readL2(e.id, env);
  if (e.type === LEX.w.var) return readName(e.name, env);
  if (e.type === LEX.w.int) return applyInt(e.fn, evalExprL3(e.a, env), env);
  if (e.type === LEX.w.bin) return arith(e.op, evalExprL3(e.l, env), evalExprL3(e.r, env), env);
  if (e.type === LEX.w.call) return minMax(e.fn, e.args.map((x) => evalExprL3(x, env)), env);
  if (e.type === LEX.w.if) {
    const c = evalCondL3(e.cond, env);
    if (c === true) return evalExprL3(e.a, env);
    if (c === false) return evalExprL3(e.b, env);
    return c;
  }
  return ne(`${LEX.p.unknown_node} ${e.type}`, undefined);
}

/**
 * Walk one Layer 3 condition AST (nodes from `parseCond(src, { layer: 'l3' })`) into a three-valued result: `true`,
 * `false`, or an ne / nb value (the walk holds no decision of its own). `and` / `or` are lazy over thunks, `not` is
 * Kleene negation, `regulated` / `holds` are the C3 readers and `cmp` is the three-valued comparison. Any other node
 * type is unknown.
 */
export function evalCondL3(c, env) {
  if (c.type === LEX.w.cmp) return compare(c.cmp, evalExprL3(c.lhs, env), evalExprL3(c.rhs !== undefined ? c.rhs : c.lit, env), env);
  if (c.type === LEX.w.regulated) return readRegulated(c.id, env);
  if (c.type === LEX.w.holds) return readHolds(c.token, env);
  if (c.type === LEX.w.and) return and3(c.xs.map((x) => () => evalCondL3(x, env)));
  if (c.type === LEX.w.or) return or3(c.xs.map((x) => () => evalCondL3(x, env)));
  if (c.type === LEX.w.not) return not3(evalCondL3(c.x, env));
  return ne(`${LEX.p.unknown_node} ${c.type}`, undefined);
}

/**
 * The single entry the `evaluate.mjs` hook calls for one Layer 3 expression (B5, plan section 3; MB-31). The value
 * carries exactly one key, `l3`. No try / catch: an `L3RefusalError` and every other thrown error pass straight
 * through, so a refusal is never turned into a row status.
 */
export function evaluateL3(ast, env) {
  return { l3: evalExprL3(ast, env) };
}

/**
 * The same entry, from the expression TEXT (B5, plan section 3; MB-31): parse the source for Layer 3, then evaluate.
 * A parse error becomes a visible not_evaluated value (never a silent skip); every other error, an `L3RefusalError`
 * included, is re-thrown unchanged, so a refusal is never turned into a row status.
 */
export function evaluateL3Source(expr, env) {
  try {
    return evaluateL3(parseExpr(expr, { layer: LEX.w.l3 }), env);
  } catch (err) {
    if (err instanceof DslError) return { l3: ne(`${LEX.p.parse_error} ${err.code}`, undefined) };
    throw err;
  }
}


