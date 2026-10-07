// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §7.5 (precedence, rules 0–7, permitted(), building type
//            unknown), §7.6 (the evaluator, lot vector, eval-vectors.json), §9 G-EVAL; docs/specs/01-pipeline/
//            69_mcbylaw_policy.md M-34, M-38, M-42, M-43, M-48, M-49, M-50, M-51; docs/reports/mcbylaw-phase1-plan.md S6b
//
// Pure: no DB, no network, no clock, no fs. The vocab (units, zones, building types, user inputs, threshold tokens)
// is passed in; the S5 vocab.json is the production source, test fixtures supply their own.
//
//   evaluate(expr, lot, ctx)                 → {value, unit, not_evaluated?, trace}
//   loadCandidates(lot, units)               → {candidates, log, include_depth}     (rule 1, the loader)
//   effective(lot, target, candidates, ctx)  → {status, value, unit, bound, bounds, winner, applied, reason, trace, disclosures, per_type?}
//   permitted(lot, building_type, candidates, ctx) → {status: permitted|prohibited|not_evaluated|conflict, …}
//   checkEval({units, vectors, vocab, enactments}) → {pass, violations, checked, counts, rows}   (G-EVAL (a)+(b))
//   precedenceFixtures(vocab) / selfTest(vocab)                                           (G-EVAL (c))
//
// A lot vector (§7.6, M-42): {zone, label:{f,a,d,u…}, overlays:{HT,ST,LC…} (undefined = map not held),
//   vars:{lot_frontage_m…}, flags:{corner_lot…}, building_type (null = unknown, M-50), exception, map_areas
//   (undefined = not held), address, existing:{"<var>@<date>": value}}.
//
// not_evaluated reasons are a closed set (NOT_EVALUATED_CODES), written `<code>` or `<code>:<detail>`.
//
// Argument-level displacement (§7.4, M-48): a DISAPPLY (no target) naming an argument removes it. A same-target
// displacer that names an argument (600.60.40(2)(A) "Despite 10.20.40.10(1)(C)(ii) … may be increased to 10.5 m")
// takes that argument's place and the rewritten unit carries the higher of the two layers; this is the only reading
// under which §7.4's stated result (HT 12.0 → 12.0 m) follows from rules 2–4, and it is listed as an open question
// in the S6b report (`ARG_SUBSTITUTION`), not a ruling.

import { DslError, combineUnits, parseCond, parseExpr, parseStatement, unitTable } from './dsl.mjs';

export const LAYER_RANK = Object.freeze({ base: 0, overlay: 1, exception: 2, provincial: 3 });
export const NOT_EVALUATED_CODES = Object.freeze([
  'no_569_2013_zone', // rule 0 (Spec 69 M-27)
  'no_candidate', // rule 7
  'needs_user_input', // :<user_input> (building_type: M-50)
  'missing_input', // :<variable> the lot vector does not carry
  'map_area_not_held', // :<code|area> the map / overlay geometry is not held (M-41)
  'map_value_absent', // :<code> the map is held and the lot has no value (a bare overlay(), outside max/min)
  'label_value_absent', // :<letter>
  'all_map_arguments_absent', // max/min whose every argument is an absent map/label value (M-48)
  'all_arguments_displaced', // max/min whose every argument was displaced
  'displaced_argument_not_found', // :<path> a displaces[] entry names an argument path the unit does not tag
  'existing_building_facts', // :<variable> existing(…) without as-built input (M-41)
  'enactment_date_unknown', // :<bylaw>
  'band_no_match',
  'by_type_unlisted', // :<building_type>
  'unlimited_in_arithmetic',
  'division_by_zero',
  'condition_unknown', // :<token> a lot-condition token the vector does not carry
  'named_lots_only', // address → parcel matching not held (M-41)
  'target_cycle',
  'unregulated_in_arithmetic', // M-54: `unregulated` is terminal
  'referenced_target_conflict', // :<target> a variable whose own effective() is an eval_conflict
  'expression_error', // :<DslError code>
]);
const EPS = 1e-9;
const r9 = (x) => Math.round(x * 1e9) / 1e9;
const ne = (code, detail) => ({ ne: detail === undefined ? code : `${code}:${detail}` });

/** Reason string → its closed code. */
export function reasonCode(reason) { return String(reason).split(':')[0]; }

// ---------------------------------------------------------------- context
/**
 * Build the evaluation context from a vocab. Expected vocab fields (proposed for S5 vocab.json):
 * dsl_target / dsl_input {name:{unit}}, label_letter / overlay_code {key:{unit}}, zone [..],
 * building_type_residential [..] (M-50 list), building_type_parent {child: parent}, user_input [..],
 * lot_condition_threshold [..] (tokens whose truth comes from condition.if).
 */
export function makeContext(vocab, extra = {}) {
  return {
    units: unitTable(vocab),
    zones: new Set(vocab.zone || []),
    residentialTypes: vocab.building_type_residential || [],
    typeParent: vocab.building_type_parent || {},
    userInputs: new Set(vocab.user_input || []),
    thresholdTokens: new Set(vocab.lot_condition_threshold || []),
    enactments: extra.enactments || {},
  };
}
const ctxOf = (c) => (c && c.units ? c : makeContext(c || {}));

const MONTHS = { January: 1, February: 2, March: 3, April: 4, May: 5, June: 6, July: 7, August: 8, September: 9, October: 10, November: 11, December: 12 };
/** `enacted(<by-law>)` resolution from a pinned page header ("By-law 569-2013 was enacted on May 9, 2013"). */
export function enactedDatesFromText(text) {
  const out = {};
  for (const m of String(text).matchAll(/By-law (\d+-\d{4}) was enacted on ([A-Z][a-z]+) (\d{1,2}), (\d{4})/g)) {
    const mo = MONTHS[m[2]];
    if (!mo) continue;
    out[m[1]] = `${m[4]}-${String(mo).padStart(2, '0')}-${String(Number(m[3])).padStart(2, '0')}`;
  }
  return out;
}

// ---------------------------------------------------------------- evaluate()
/**
 * Evaluate one expression on a lot. `expr` is a statement string, an expression string, or an AST.
 * Returns {value (number | 'unlimited' | null), unit, not_evaluated?, trace}.
 * ctx: a vocab or a context from makeContext(); optional ctx.resolveVariable(name) and ctx.argEdits {path: null|AST}.
 */
export function evaluate(expr, lot, ctx) {
  const C = ctxOf(ctx);
  let ast; let clausePath = null;
  try {
    // a statement starts "target =" (a comparison `=` never follows a bare leading identifier at depth 0)
    const st = typeof expr === 'string' ? (/^\s*[A-Za-z_][A-Za-z0-9_]*\s*=/.test(expr) ? parseStatement(expr) : null) : expr.type === 'statement' ? expr : null;
    ast = st ? st.expr : typeof expr === 'string' ? parseExpr(expr) : expr;
    clausePath = st ? st.path : null;
  } catch (err) {
    if (err instanceof DslError) return { value: null, unit: null, not_evaluated: `expression_error:${err.code}`, trace: [err.message] };
    throw err;
  }
  const trace = [];
  const env = { C, lot, trace, resolveVariable: ctx && ctx.resolveVariable, argEdits: (ctx && ctx.argEdits) || {} };
  const r = ev(ast, env);
  if (r.ne) return { value: null, unit: r.unit ?? null, not_evaluated: r.ne, trace };
  if (r.value === 'unregulated') return { value: 'unregulated', unit: r.unit, clause: clausePath, trace }; // M-54: carries the clause that says so
  return { value: r.value === 'unlimited' ? 'unlimited' : r9(r.value), unit: r.unit, trace };
}

function ev(e, env) {
  const { C, lot, trace } = env;
  switch (e.type) {
    case 'lit': return { value: e.value, unit: e.unit };
    case 'unlimited': return { value: 'unlimited', unit: null };
    case 'unregulated': return { value: 'unregulated', unit: null };
    case 'var': return variable(e.name, env);
    case 'label': {
      if (!lot.label) return ne('missing_input', 'zone_label');
      const v = lot.label[e.letter];
      if (v === undefined || v === null) return { ...ne('label_value_absent', e.letter), absent: true };
      trace.push(`label(${e.letter})=${v}`);
      return { value: v, unit: C.units.label[e.letter] ?? null };
    }
    case 'overlay': {
      if (!lot.overlays) return ne('map_area_not_held', e.code);
      const v = lot.overlays[e.code];
      if (v === undefined || v === null) return { ...ne('map_value_absent', e.code), absent: true };
      trace.push(`overlay(${e.code})=${v}`);
      return { value: v, unit: C.units.overlay[e.code] ?? null };
    }
    case 'existing': {
      let date = e.date;
      if (!date) {
        date = C.enactments[e.enacted];
        if (!date) return ne('enactment_date_unknown', e.enacted);
      }
      const v = lot.existing ? lot.existing[`${e.var}@${date}`] : undefined;
      if (v === undefined || v === null) return ne('existing_building_facts', e.var);
      trace.push(`existing(${e.var};${date})=${v}`);
      return { value: v, unit: C.units.input[e.var] ?? C.units.target[e.var] ?? null };
    }
    case 'call': return callMaxMin(e, env);
    case 'band': {
      const v = variable(e.v.name, env);
      if (v.ne) return v;
      if (v.value === 'unlimited' || v.value === 'unregulated') return ne(`${v.value}_in_arithmetic`);
      for (let i = 0; i < e.arms.length; i++) {
        const a = e.arms[i];
        if (a.conds.every((c) => cmp(v.value, c.cmp, c.lit.value))) { trace.push(`band arm ${i + 1} (${e.v.name}=${r9(v.value)})`); return ev(a.value, env); }
      }
      return ne('band_no_match');
    }
    case 'if': {
      const c = evCond(e.cond, env);
      if (c !== true && c !== false) return c;
      return ev(c ? e.a : e.b, env);
    }
    case 'by_type': {
      const bt = lot.building_type;
      if (!bt) return ne('needs_user_input', 'building_type');
      const hit = e.entries.find((x) => x.key === bt) || e.entries.find((x) => x.key === C.typeParent[bt]) || e.entries.find((x) => x.key === 'other');
      if (!hit) return ne('by_type_unlisted', bt);
      trace.push(`by_type ${hit.key}`);
      return ev(hit.expr, env);
    }
    case 'bin': {
      // `absent` (drop-me-from-max/min) belongs to a bare overlay()/label() argument only, never to arithmetic over it
      const a = ev(e.l, env); if (a.ne) return { ne: a.ne };
      const b = ev(e.r, env); if (b.ne) return { ne: b.ne };
      if (!['+', '−', '×', '÷'].includes(e.op)) return ne('expression_error', `operator ${e.op}`);
      if (a.value === 'unregulated' || b.value === 'unregulated') return ne('unregulated_in_arithmetic');
      if (a.value === 'unlimited' || b.value === 'unlimited') return ne('unlimited_in_arithmetic');
      const unit = combineUnits(e.op, a.unit, b.unit);
      if (e.op === '+') return { value: a.value + b.value, unit };
      if (e.op === '−') return { value: a.value - b.value, unit };
      if (e.op === '×') {
        const sc = (r) => (r.unit === 'pct' ? r.value / 100 : r.value);
        return { value: (a.unit === 'pct' || b.unit === 'pct') ? sc(a) * sc(b) : a.value * b.value, unit };
      }
      if (Math.abs(b.value) < EPS) return ne('division_by_zero');
      return { value: a.value / b.value, unit };
    }
    default: return ne('expression_error', e.type);
  }
}

function variable(name, env) {
  const { C, lot, trace } = env;
  const v = lot.vars ? lot.vars[name] : undefined;
  const unit = C.units.input[name] ?? C.units.target[name] ?? null;
  if (v !== undefined && v !== null) { trace.push(`${name}=${v}`); return { value: v, unit }; }
  if (env.resolveVariable) {
    const r = env.resolveVariable(name);
    if (r) {
      if (r.status === 'value') { trace.push(`${name}=${r.value} (effective ${r.winner})`); return { value: r.value, unit }; }
      if (r.status === 'not_evaluated' && reasonCode(r.reason) !== 'no_candidate') return { ne: r.reason };
      if (r.status === 'conflict') return ne('referenced_target_conflict', name);
    }
  }
  if (C.userInputs.has(name)) return ne('needs_user_input', name);
  return ne('missing_input', name);
}

function callMaxMin(e, env) {
  const vals = [];
  let absent = 0; let displaced = 0; let notAbsentNe = null;
  for (const a0 of e.args) {
    let a = a0;
    if (a0.argPath && Object.prototype.hasOwnProperty.call(env.argEdits, a0.argPath)) {
      const sub = env.argEdits[a0.argPath];
      if (sub === null) { displaced++; env.trace.push(`argument @${a0.argPath} displaced`); continue; }
      a = sub; env.trace.push(`argument @${a0.argPath} replaced by the displacing unit`);
    }
    const r = ev(a, env);
    if (r.ne) { if (r.absent) { absent++; env.trace.push(`absent map argument dropped (${r.ne})`); continue; } notAbsentNe = notAbsentNe || r; continue; }
    if (r.value === 'unregulated') return ne('unregulated_in_arithmetic');
    vals.push(r);
  }
  if (notAbsentNe) return notAbsentNe;
  if (!vals.length) return displaced && !absent ? ne('all_arguments_displaced') : ne('all_map_arguments_absent');
  const unit = vals.find((v) => v.unit)?.unit ?? null;
  const finite = vals.filter((v) => v.value !== 'unlimited');
  let value;
  if (e.fn === 'max') value = finite.length < vals.length ? 'unlimited' : Math.max(...finite.map((v) => v.value));
  else value = finite.length ? Math.min(...finite.map((v) => v.value)) : 'unlimited';
  env.trace.push(`${e.fn}(${vals.map((v) => (v.value === 'unlimited' ? 'unlimited' : r9(v.value))).join(';')})=${value === 'unlimited' ? value : r9(value)}`);
  return { value, unit };
}

function cmp(v, c, lit) {
  const x = r9(v); const y = r9(lit);
  return c === '<' ? x < y : c === '≤' ? x <= y : c === '>' ? x > y : c === '≥' ? x >= y : x === y;
}

// true | false | {ne} (unknown)
function evCond(c, env) {
  const { lot } = env;
  switch (c.type) {
    case 'and': {
      let unknown = null;
      for (const x of c.xs) { const r = evCond(x, env); if (r === false) return false; if (r !== true) unknown = unknown || r; }
      return unknown || true;
    }
    case 'or': {
      let unknown = null;
      for (const x of c.xs) { const r = evCond(x, env); if (r === true) return true; if (r !== false) unknown = unknown || r; }
      return unknown || false;
    }
    case 'not': { const r = evCond(c.x, env); return r === true ? false : r === false ? true : r; }
    case 'mapped': return lot.overlays ? lot.overlays[c.code] !== undefined && lot.overlays[c.code] !== null : ne('map_area_not_held', c.code);
    case 'labelled': return lot.label ? lot.label[c.letter] !== undefined && lot.label[c.letter] !== null : ne('missing_input', 'zone_label');
    case 'cmp': {
      const l = ev(c.lhs, env);
      if (l.ne) return { ne: l.ne };
      if (l.value === 'unlimited' || l.value === 'unregulated') return ne(`${l.value}_in_arithmetic`);
      return cmp(l.value, c.cmp, c.lit.value);
    }
    default: return ne('expression_error', c.type);
  }
}

// ---------------------------------------------------------------- unit helpers
const PARSED = new WeakMap(); // never mutate the caller's unit objects
const statementsOf = (u) => {
  if (!PARSED.has(u)) {
    const raw = u.numeric_expression;
    const list = raw === 'none' || raw == null ? [] : Array.isArray(raw) ? raw : [raw];
    PARSED.set(u, list.map((s) => { try { return parseStatement(s); } catch (err) { if (err instanceof DslError) return { error: err }; throw err; } }));
  }
  return PARSED.get(u);
};
const parsedFor = (u, target) => statementsOf(u).filter((s) => !s.error && s.target === target);
const hasTarget = (u) => u.target && u.target !== 'none';
const tokensOf = (cond) => {
  if (!cond || cond === 'none') return [];
  const raw = cond.tokens ?? cond.token ?? [];
  return (Array.isArray(raw) ? raw : [raw]).filter((t) => t && t !== 'none');
};

/** Split a unit id or displaces[] entry into {reg, path}; "#whole" ≡ the row; letter prefixes SSP/PBS dropped. */
export function splitRef(id) {
  const k = id.indexOf('#');
  let reg; let path;
  if (k >= 0) { reg = id.slice(0, k); path = id.slice(k + 1); } else {
    const m = /^(\d+(?:\.\d+)+\(\d+\))/.exec(id);
    reg = m ? m[1] : id; path = id.slice(reg.length);
  }
  path = path.replace(/^whole$/, '').replace(/^(SSP|PBS)/, '');
  return { reg, path };
}
/** 'full' when the ref covers the unit, {arg: path} when it names an argument path inside it, else null. */
export function refMatch(ref, unitId) {
  const a = splitRef(ref); const b = splitRef(unitId);
  if (a.reg !== b.reg) return null;
  const pb = b.path.replace(/-[a-z_]+$/, ''); // fixture split-unit suffixes (e.g. "(C)-suite")
  if (a.path === '' || a.path === b.path || pb.startsWith(a.path)) return 'full';
  if (pb !== '' && a.path.startsWith(pb)) return { arg: a.path };
  return null;
}
/** Chapter zone of a base regulation id (10.20 → RD …); null = every residential zone. */
export function chapterZone(regulationId) {
  const m = /^10\.(10|20|40|60|80)\./.exec(regulationId || '');
  return m ? { 10: 'R', 20: 'RD', 40: 'RS', 60: 'RT', 80: 'RM' }[m[1]] : null;
}
function rankedLayers(rl) {
  if (!rl || rl === 'none') return [];
  if (typeof rl === 'string') return rl.split(/[>,]/).map((s) => s.trim()).filter(Boolean);
  if (Array.isArray(rl)) return rl;
  return [...[].concat(rl.higher || []), ...[].concat(rl.lower || [])];
}

// ---------------------------------------------------------------- applicability
// {ok:true} | {ok:false, why} | {ok:null, reason}
export function applies(lot, u, ctx, resolveVariable) {
  const C = ctxOf(ctx);
  const app = u.application || {};
  const zones = app.zones || [];
  if (zones.length && !zones.includes('any') && !zones.includes(lot.zone)) return { ok: false, why: 'zone' };
  let unknown = null;
  const types = app.building_types || [];
  if (types.length && !types.includes('any')) {
    const bt = lot.building_type;
    if (!bt) unknown = 'needs_user_input:building_type';
    else if (!types.includes(bt) && !types.includes(C.typeParent[bt])) return { ok: false, why: 'building_type' };
  }
  const part = (u.applies_to && u.applies_to.part) || 'whole';
  const refs = (u.applies_to && u.applies_to.refs) || [];
  if (part === 'map_area') {
    if (!lot.map_areas) unknown = unknown || `map_area_not_held:${refs.join('+') || u.unit_id}`;
    else if (!refs.some((r) => lot.map_areas.includes(r))) return { ok: false, why: 'map_area' };
  } else if (part === 'named_addresses' || part === 'lot_list') {
    if (!lot.address) unknown = unknown || 'named_lots_only';
    else if (!refs.some((r) => r.toLowerCase() === String(lot.address).toLowerCase())) return { ok: false, why: part };
  }
  const cond = u.condition;
  for (const t of tokensOf(cond)) {
    if (C.thresholdTokens.has(t) || t === 'exception_area') continue; // truth from condition.if / the loader
    const v = lot.flags ? lot.flags[t] : undefined;
    if (v === false) return { ok: false, why: `condition ${t}` };
    if (v !== true) unknown = unknown || (C.userInputs.has(t) ? `needs_user_input:${t}` : `condition_unknown:${t}`);
  }
  if (cond && cond !== 'none' && cond.if && cond.if !== 'none') {
    let c;
    try { c = parseCond(cond.if); } catch (err) { if (err instanceof DslError) return { ok: null, reason: `expression_error:${err.code}` }; throw err; }
    const r = evCond(c, { C, lot, trace: [], resolveVariable, argEdits: {} });
    if (r === false) return { ok: false, why: `condition ${cond.if}` };
    if (r !== true) unknown = unknown || r.ne;
  }
  return unknown ? { ok: null, reason: unknown } : { ok: true };
}

// ---------------------------------------------------------------- loader (rule 1)
/** Rule 1: base units of the lot's zone (by chapter), overlay and provincial units, the lot's exception units INCLUDE-expanded. */
export function loadCandidates(lot, units) {
  const out = []; const seen = new Set(); const log = []; let depthMax = 0;
  const add = (u) => { if (!seen.has(u.unit_id)) { seen.add(u.unit_id); out.push(u); } };
  for (const u of units) {
    if (u.layer === 'base') { const z = chapterZone(u.regulation_id || splitRef(u.unit_id).reg); if (!z || z === lot.zone) add(u); }
    else if (u.layer === 'overlay' || u.layer === 'provincial') add(u);
  }
  const excOf = (u) => u.exception || u.regulation_id || splitRef(u.unit_id).reg;
  const visit = (exc, depth, stack) => {
    if (stack.includes(exc)) { log.push(`INCLUDE cycle ${[...stack, exc].join(' → ')}`); return; }
    depthMax = Math.max(depthMax, depth);
    for (const u of units.filter((x) => x.layer === 'exception' && excOf(x) === exc)) {
      add(u);
      if (u.archetype === 'INCLUDE' && u.include_ref) { log.push(`INCLUDE ${u.unit_id} → ${u.include_ref} (depth ${depth + 1})`); visit(splitRef(u.include_ref).reg, depth + 1, [...stack, exc]); }
    }
  };
  if (lot.exception) visit(lot.exception, 0, []);
  return { candidates: out, log, include_depth: depthMax };
}

// ---------------------------------------------------------------- effective()
const NE_RESULT = (reason, extra = {}) => ({ status: 'not_evaluated', value: null, reason, applied: [], trace: [], disclosures: [], ...extra });

/** §7.5 rules 0, 2–7 (+ M-50 building type unknown). */
export function effective(lot, target, candidates, ctx, _env = {}) {
  const C = ctxOf(ctx);
  if (!lot || !lot.zone || (C.zones.size && !C.zones.has(lot.zone))) return NE_RESULT('no_569_2013_zone', { trace: ['rule 0: the lot has no 569-2013 residential zone'] });
  const depth = (_env.depth || 0) + 1;
  if (depth > 8) return NE_RESULT('target_cycle');
  const core = effCore(lot, target, candidates, C, { ...(_env), depth });
  if (lot.building_type || _env.inScenario || core.reason !== 'needs_user_input:building_type') return core;
  // M-50: evaluate every residential type; a value only if all agree
  const per = {}; const results = {};
  for (const t of C.residentialTypes) {
    const r = effCore({ ...lot, building_type: t }, target, candidates, C, { ...(_env), depth, inScenario: true });
    results[t] = r;
    per[t] = r.status === 'value' ? r.value : r.status === 'conflict' ? 'conflict' : `not_evaluated:${r.reason}`;
  }
  const distinct = [...new Set(Object.values(per).map(String))];
  const trace = [...core.trace, `M-50 per-type: ${C.residentialTypes.map((t) => `${t}=${per[t]}`).join(', ')}`];
  if (distinct.length === 1 && C.residentialTypes.length) {
    const any = results[C.residentialTypes[0]];
    return { ...any, winner: any.winner, trace: [...trace, 'all residential types agree'], per_type: per };
  }
  return NE_RESULT('needs_user_input:building_type', { trace, per_type: per });
}

function effCore(lot, target, candidates, C, env) {
  const trace = []; const disclosures = [];
  const resolveVariable = (name) => (name === target ? null : effective(lot, name, candidates, C, { depth: env.depth, inScenario: env.inScenario }));
  const valueUnits = candidates.filter((u) => (u.archetype === 'LIMIT' || u.archetype === 'DEFINE') && parsedFor(u, target).length);
  const refsValue = (u) => (u.displaces || []).some((ref) => valueUnits.some((v) => v !== u && refMatch(ref, v.unit_id)));
  const procs = candidates.filter((u) => u.archetype === 'PROCEDURAL' && rankedLayers(u.ranks_layers).length);
  const displacers = candidates.filter((u) => u.archetype !== 'PROCEDURAL' && refsValue(u) && (!hasTarget(u) || u.target === target));
  const prevailing = candidates.filter((u) => u.archetype === 'PREVAILING');

  // applicability (rule 1's condition filter, run here because conditions read effective targets and the scenario type)
  const A = new Set(); const unknown = [];
  for (const u of new Set([...valueUnits, ...displacers, ...procs])) {
    const a = applies(lot, u, C, resolveVariable);
    if (a.ok === true) A.add(u);
    else if (a.ok === null) unknown.push({ u, reason: a.reason });
  }
  for (const u of prevailing) {
    const a = applies(lot, u, C, resolveVariable);
    if (a.ok === true) disclosures.push(`alternate compliance path under ${u.unit_id} — not evaluated (rule 5)`);
    else if (a.ok === null) disclosures.push(`alternate compliance path under ${u.unit_id} may apply (${a.reason}) — not evaluated (rule 5)`);
  }
  if (unknown.length) {
    const typeUnknown = unknown.find((x) => x.reason === 'needs_user_input:building_type');
    const first = typeUnknown || unknown[0];
    for (const x of unknown) trace.push(`applicability unknown: ${x.u.unit_id} (${x.reason})`);
    return NE_RESULT(first.reason, { trace, disclosures });
  }

  // rule 3 (M-38, M-49): a unit displacing a precedence rule ranks just above the highest layer that rule ranks
  const immune = new Map();
  for (const u of A) for (const ref of u.displaces || []) for (const p of procs) {
    if (A.has(p) && refMatch(ref, p.unit_id) === 'full') {
      const top = Math.max(...rankedLayers(p.ranks_layers).map((l) => LAYER_RANK[l] ?? 0));
      immune.set(u.unit_id, Math.max(immune.get(u.unit_id) ?? -1, top + 0.5));
      trace.push(`rule 3: ${u.unit_id} displaces ${p.unit_id} → ranks above ${rankedLayers(p.ranks_layers).join(', ')}`);
    }
  }
  const rankOf = (u) => Math.max(LAYER_RANK[u.layer] ?? 0, immune.get(u.unit_id) ?? -1);

  // rule 2 (M-48): displacement, own target only; argument-level entries remove or replace one argument
  const dropped = new Set(); const consumed = new Set(); const edits = new Map(); // unit_id → {path: null|AST}
  for (const d of A) {
    if (!(d.displaces || []).length) continue;
    for (const ref of d.displaces) for (const v of A) {
      if (v === d || v.archetype === 'PROCEDURAL' || !valueUnits.includes(v)) continue;
      const m = refMatch(ref, v.unit_id);
      if (!m) continue;
      if (hasTarget(d) && d.target !== v.target) continue;
      if (m === 'full') { dropped.add(v.unit_id); trace.push(`rule 2: ${d.unit_id} drops ${v.unit_id}`); continue; }
      const tagged = parsedFor(v, target).some((s) => argPaths(s.expr).includes(m.arg));
      if (!tagged) return NE_RESULT(`displaced_argument_not_found:${m.arg}`, { trace: [...trace, `rule 2: ${d.unit_id} names ${m.arg} inside ${v.unit_id}, which tags no such argument`], disclosures });
      const own = parsedFor(d, target);
      const e = edits.get(v.unit_id) || { args: {}, layer: v.layer, immune: -1, by: [] };
      if (own.length && !staticUnitOk(own[0], C)) { trace.push(`rule 1: ${d.unit_id} unit of measure ≠ ${target} — G-CLAUSE failure, not substituted`); consumed.add(d.unit_id); continue; }
      if (own.length) { e.args[m.arg] = own[0].expr; consumed.add(d.unit_id); if ((LAYER_RANK[d.layer] ?? 0) > (LAYER_RANK[e.layer] ?? 0)) e.layer = d.layer; e.immune = Math.max(e.immune, immune.get(d.unit_id) ?? -1); trace.push(`rule 2: ${d.unit_id} replaces argument ${m.arg} of ${v.unit_id}`); }
      else { e.args[m.arg] = null; trace.push(`rule 2: ${d.unit_id} removes argument ${m.arg} of ${v.unit_id}`); }
      e.by.push(d.unit_id);
      edits.set(v.unit_id, e);
    }
  }

  // candidates: applicable value units, not dropped, not consumed by a substitution; unit-of-measure check (rule 1)
  const tUnit = C.units.target[target] ?? C.units.input[target] ?? null;
  let T = [...A].filter((u) => valueUnits.includes(u) && !dropped.has(u.unit_id) && !consumed.has(u.unit_id));
  T = T.filter((u) => {
    const bad = parsedFor(u, target).some((s) => staticUnitOk(s, C) === false);
    if (bad) trace.push(`rule 1: ${u.unit_id} unit of measure ≠ ${target} (${tUnit}) — G-CLAUSE failure, never a candidate`);
    return !bad;
  });
  if (!T.length) return NE_RESULT('no_candidate', { trace: [...trace, `rule 7: no candidate for ${target}`], disclosures });

  // rule 4: per bound direction, the highest layer (with rule 3 immunity) replaces lower layers; rule 6 falls out
  const layerOf = (u) => (edits.has(u.unit_id) ? edits.get(u.unit_id).layer : u.layer);
  const rank = (u) => Math.max(LAYER_RANK[layerOf(u)] ?? 0, rankOf(u), edits.has(u.unit_id) ? edits.get(u.unit_id).immune : -1);
  const boundOfUnit = (u) => (u.bound === 'min' || u.bound === 'max' ? u.bound : 'exact'); // DEFINE / 'none' / missing → exact
  const byBound = {};
  for (const u of T) (byBound[boundOfUnit(u)] = byBound[boundOfUnit(u)] || []).push(u);
  const kept = {};
  for (const [b, us] of Object.entries(byBound).sort(([a], [c]) => (a < c ? -1 : a > c ? 1 : 0))) {
    const top = Math.max(...us.map(rank));
    kept[b] = us.filter((u) => rank(u) === top);
    const lost = us.filter((u) => rank(u) !== top).map((u) => u.unit_id);
    if (lost.length) trace.push(`rule 4: ${lost.join(', ')} replaced by a higher layer (bound ${b})`);
  }

  // evaluate + rule 4a
  const vals = {};
  for (const [b, us] of Object.entries(kept)) {
    vals[b] = [];
    for (const u of us) for (const s of parsedFor(u, target)) {
      const ed = edits.get(u.unit_id);
      const r = evaluate(s, lot, { ...C, resolveVariable, argEdits: ed ? ed.args : {} });
      const id = ed ? `${u.unit_id}<${ed.by.join('+')}` : u.unit_id;
      if (r.not_evaluated) return NE_RESULT(r.not_evaluated, { applied: [id], trace: [...trace, `${id}: ${r.not_evaluated}`, ...r.trace], disclosures });
      vals[b].push({ id, unitId: u.unit_id, v: r.value });
      trace.push(`${id} → ${r.value} ${tUnit ?? ''}${r.trace.length ? ` [${r.trace.join(', ')}]` : ''}`.trim());
    }
  }
  const finite = (xs) => xs.filter((x) => typeof x.v === 'number');
  const res = {};
  for (const [b, xs] of Object.entries(vals)) {
    if (b === 'exact') {
      const d = [...new Set(xs.map((x) => String(x.v)))];
      if (d.length > 1) return { status: 'conflict', value: null, reason: 'eval_conflict', conflict: `two exact values ${d.join(' vs ')}`, applied: xs.map((x) => x.id), trace: [...trace, 'rule 4a: CONFLICT (two exact values)'], disclosures };
      res.exact = xs[0];
    } else {
      const f = finite(xs);
      // only non-finite values (`unlimited` / `unregulated`, M-48 / M-54): no bound; a mix reports `unlimited` (traced)
      if (!f.length) { res[b] = xs.find((x) => x.v === 'unlimited') || xs[0]; if (new Set(xs.map((x) => x.v)).size > 1) trace.push('rule 4a: unlimited and unregulated both apply; reported unlimited'); }
      else res[b] = f.reduce((a, c) => ((b === 'min' ? c.v > a.v : c.v < a.v) ? c : a));
      if (f.length && f.length < xs.length) trace.push(`rule 4a: unlimited / unregulated loses to a finite ${b}`);
    }
  }
  if (res.min && res.max && typeof res.min.v === 'number' && typeof res.max.v === 'number' && res.min.v > res.max.v + EPS) {
    return { status: 'conflict', value: null, reason: 'eval_conflict', conflict: `min ${res.min.v} (${res.min.id}) above max ${res.max.v} (${res.max.id})`, applied: [res.min.id, res.max.id], trace: [...trace, 'rule 4a: CONFLICT (min above max)'], disclosures };
  }
  const win = res.exact || res.min || res.max;
  const boundOf = res.exact ? 'exact' : res.min ? 'min' : 'max';
  return {
    status: 'value', value: win.v, unit: tUnit, bound: boundOf, winner: win.id,
    ...(win.v === 'unregulated' ? { clause: win.unitId } : {}),
    bounds: Object.fromEntries(Object.entries(res).map(([k, x]) => [k, x.v])),
    applied: Object.values(vals).flat().map((x) => x.id), trace, disclosures,
  };
}

function staticUnitOk(statement, C) {
  const errs = [];
  const tu = C.units.target[statement.target] ?? C.units.input[statement.target];
  const u = unitOfAst(statement.expr, C, errs);
  return !(errs.length || !tu || (u && u !== tu)); // an undeclared target is never unit-consistent
}
function unitOfAst(e, C, errs) {
  switch (e.type) {
    case 'lit': return e.unit;
    case 'unlimited': return null;
    case 'var': return C.units.input[e.name] ?? C.units.target[e.name] ?? null;
    case 'label': return C.units.label[e.letter] ?? null;
    case 'overlay': return C.units.overlay[e.code] ?? null;
    case 'existing': return C.units.input[e.var] ?? C.units.target[e.var] ?? null;
    case 'call': return pickSame(e.args.map((a) => unitOfAst(a, C, errs)), errs);
    case 'band': return pickSame(e.arms.map((a) => unitOfAst(a.value, C, errs)), errs);
    case 'if': return pickSame([unitOfAst(e.a, C, errs), unitOfAst(e.b, C, errs)], errs);
    case 'by_type': return pickSame(e.entries.map((x) => unitOfAst(x.expr, C, errs)), errs);
    case 'bin': {
      const a = unitOfAst(e.l, C, errs); const b = unitOfAst(e.r, C, errs);
      if (!a || !b) return null;
      const r = combineUnits(e.op, a, b);
      if (!r) errs.push(`${a}${e.op}${b}`);
      return r;
    }
    default: return null;
  }
}
function pickSame(us, errs) { const k = us.filter(Boolean); if (new Set(k).size > 1) errs.push('mixed'); return k[0] ?? null; }
function argPaths(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (node.argPath) out.push(node.argPath);
  for (const k of Object.keys(node)) { const v = node[k]; if (Array.isArray(v)) for (const x of v) argPaths(x, out); else if (v && typeof v === 'object') argPaths(v, out); }
  return out;
}

// ---------------------------------------------------------------- permitted()
/** §7.5 rules applied to PERMIT / PROHIBIT units for one building type (M-38 runs through it). */
export function permitted(lot, buildingType, candidates, ctx) {
  const C = ctxOf(ctx);
  if (!lot || !lot.zone || (C.zones.size && !C.zones.has(lot.zone))) return { status: 'not_evaluated', reason: 'no_569_2013_zone', winners: [], trace: ['rule 0'] };
  if (!buildingType) return { status: 'not_evaluated', reason: 'needs_user_input:building_type', winners: [], trace: [] };
  const L = { ...lot, building_type: buildingType };
  const trace = [];
  const subjects = candidates.filter((u) => u.archetype === 'PERMIT' || u.archetype === 'PROHIBIT');
  const procs = candidates.filter((u) => u.archetype === 'PROCEDURAL' && rankedLayers(u.ranks_layers).length);
  const disapply = candidates.filter((u) => u.archetype === 'DISAPPLY' && (u.displaces || []).some((r) => subjects.some((s) => refMatch(r, s.unit_id))));
  const A = [];
  for (const u of [...subjects, ...procs, ...disapply]) {
    const a = applies(L, u, C, (name) => effective(L, name, candidates, C));
    if (a.ok === null) return { status: 'not_evaluated', reason: a.reason, winners: [], trace: [...trace, `applicability unknown: ${u.unit_id} (${a.reason})`] };
    if (a.ok) A.push(u);
  }
  const immune = new Map(); const dropped = new Set();
  for (const u of A) for (const ref of u.displaces || []) {
    for (const p of procs) if (A.includes(p) && refMatch(ref, p.unit_id) === 'full') {
      const top = Math.max(...rankedLayers(p.ranks_layers).map((l) => LAYER_RANK[l] ?? 0));
      immune.set(u.unit_id, Math.max(immune.get(u.unit_id) ?? -1, top + 0.5)); trace.push(`rule 3: ${u.unit_id} displaces ${p.unit_id}`);
    }
    for (const v of A) if (v !== u && v.archetype !== 'PROCEDURAL' && refMatch(ref, v.unit_id) === 'full') { dropped.add(v.unit_id); trace.push(`rule 2: ${u.unit_id} drops ${v.unit_id}`); }
  }
  const T = A.filter((u) => (u.archetype === 'PERMIT' || u.archetype === 'PROHIBIT') && !dropped.has(u.unit_id));
  if (!T.length) return { status: 'not_evaluated', reason: 'no_candidate', winners: [], trace: [...trace, `rule 7: no PERMIT/PROHIBIT unit for ${buildingType}`] };
  const rank = (u) => Math.max(LAYER_RANK[u.layer] ?? 0, immune.get(u.unit_id) ?? -1);
  const top = Math.max(...T.map(rank));
  const win = T.filter((u) => rank(u) === top);
  trace.push(`rule 4: rank ${top}: ${win.map((u) => `${u.unit_id} ${u.archetype}`).join(', ')}`);
  const kinds = new Set(win.map((u) => u.archetype));
  if (kinds.size > 1) return { status: 'conflict', reason: 'eval_conflict', winners: win.map((u) => u.unit_id), trace };
  return { status: kinds.has('PERMIT') ? 'permitted' : 'prohibited', winners: win.map((u) => u.unit_id), trace };
}

// ---------------------------------------------------------------- G-EVAL (a) + (b)
const TOL = 0.005 + EPS; // Spec 67 records values to 2 decimals
/**
 * G-EVAL over agreed/adjudicated units and eval-vectors.json.
 * (a) every unit's numeric_expression parses, is unit-consistent and evaluates without error on every applicable
 *     vector (applicability from the row's generated chapter zone, never the keyed application);
 * (b) every by_law_expected vector whose target has candidates matches effective(), or carries an eval_mismatch
 *     adjudication naming which side is wrong; a vector whose target has no candidate is `pending`, never failed.
 */
export function checkEval({ units, vectors, vocab, enactments = {} }) {
  const C = makeContext(vocab, { enactments });
  const violations = []; const rows = [];
  const counts = { units_evaluated: 0, unit_vector_evaluations: 0, vectors: 0, match: 0, mismatch_adjudicated: 0, mismatch_unadjudicated: 0, not_evaluated: 0, pending: 0, excluded: 0, inexpressible: 0, no_expected: 0 };
  let checked = 0;
  for (const u of units) {
    const sts = statementsOf(u);
    if (!sts.length) continue;
    counts.units_evaluated++;
    for (const s of sts) if (s.error) violations.push(`parse_error: ${u.unit_id}: ${s.error.message}`);
    const ok = sts.filter((s) => !s.error);
    for (const s of ok) if (!staticUnitOk(s, C)) violations.push(`unit_error: ${u.unit_id}: ${s.target}`);
    const z = chapterZone(u.regulation_id || splitRef(u.unit_id).reg);
    for (const vx of vectors) {
      if (!vx.lot || (z && vx.lot.zone !== z)) continue;
      for (const s of ok) {
        counts.unit_vector_evaluations++; checked++;
        const r = evaluate(s, vx.lot, C);
        if (r.not_evaluated && !NOT_EVALUATED_CODES.includes(reasonCode(r.not_evaluated))) violations.push(`eval_error: ${u.unit_id} on ${vx.id}: ${r.not_evaluated}`);
        if (r.not_evaluated && reasonCode(r.not_evaluated) === 'expression_error') violations.push(`eval_error: ${u.unit_id} on ${vx.id}: ${r.not_evaluated}`);
      }
    }
  }
  for (const vx of vectors) {
    counts.vectors++; checked++;
    const row = { id: vx.id, target: vx.target, vector_status: vx.vector_status, expected: vx.expected, bylaw_clause: vx.bylaw_clause };
    if (!(vx.vector_status === 'by_law_expected' || vx.vector_status === 'model_composite' || /^no_expected:[a-z_]+$/.test(String(vx.vector_status)))) { violations.push(`bad_vector_status: ${vx.id}: ${vx.vector_status}`); row.verdict = 'malformed'; rows.push(row); continue; }
    if (vx.vector_status === 'model_composite') { row.verdict = 'excluded_model_composite'; counts.excluded++; rows.push(row); continue; }
    if (!vx.lot || !vx.target) { violations.push(`malformed_vector: ${vx.id}: no lot or target`); row.verdict = 'malformed'; rows.push(row); continue; }
    const hasCand = units.some((u) => parsedFor(u, vx.target).length);
    const { candidates } = loadCandidates(vx.lot, units);
    const r = hasCand ? effective(vx.lot, vx.target, candidates, C) : null;
    row.got = r ? (r.status === 'value' ? r.value : r.status === 'conflict' ? 'conflict' : `not_evaluated:${r.reason}`) : 'pending';
    if (r && r.per_type) row.per_type = r.per_type;
    if (r && r.winner) row.winner = r.winner;
    const exp = vx.expected || {};
    if (String(vx.vector_status).startsWith('no_expected')) {
      counts.no_expected++;
      row.verdict = exp.not_evaluated && r && r.status === 'not_evaluated' && r.reason === exp.not_evaluated ? 'match_no_expected' : 'no_expected';
      if (exp.not_evaluated && r && row.verdict !== 'match_no_expected') { violations.push(`eval_mismatch_unadjudicated: ${vx.id} expected not_evaluated ${exp.not_evaluated}, got ${row.got}`); counts.mismatch_unadjudicated++; }
      rows.push(row); continue;
    }
    if (!r) { row.verdict = 'pending'; counts.pending++; rows.push(row); continue; }
    if (exp.category !== undefined) { row.verdict = 'inexpressible'; counts.inexpressible++; rows.push(row); continue; }
    let match;
    if (exp.not_evaluated !== undefined) match = r.status === 'not_evaluated' && r.reason === exp.not_evaluated;
    else if (r.status === 'not_evaluated') {
      // an expected value the vector's inputs cannot reach: counted with its reason, never a mismatch and never a pass
      row.verdict = 'not_evaluated'; counts.not_evaluated++;
      if (r.per_type) row.expected_in_per_type = Object.entries(r.per_type).filter(([, v]) => (typeof v === 'number' && typeof exp.value === 'number' ? Math.abs(v - exp.value) <= TOL : v === exp.value)).map(([k]) => k);
      rows.push(row); continue;
    } else if (exp.value === 'unlimited') match = r.status === 'value' && r.value === 'unlimited';
    else if (exp.value === 'unregulated') match = r.status === 'value' && r.value === 'unregulated' && (!exp.clause || r.clause === exp.clause);
    else if (typeof exp.value === 'number' && r.status === 'value' && typeof r.value === 'number') match = Math.abs(r.value - exp.value) <= TOL;
    else match = false;
    if (match) { row.verdict = 'match'; counts.match++; rows.push(row); continue; }
    const adj = vx.adjudication && vx.adjudication.kind === 'eval_mismatch' ? vx.adjudication : null;
    if (adj) { row.verdict = 'mismatch_adjudicated'; counts.mismatch_adjudicated++; } else {
      row.verdict = 'mismatch'; counts.mismatch_unadjudicated++;
      violations.push(`eval_mismatch_unadjudicated: ${vx.id} (${vx.target}) expected ${JSON.stringify(exp.value ?? exp.not_evaluated)}, got ${row.got}`);
    }
    rows.push(row);
  }
  return { pass: violations.length === 0, violations, checked, counts, rows };
}

// ---------------------------------------------------------------- G-EVAL (c): precedence fixtures
const U = (o) => ({ layer: 'base', archetype: 'LIMIT', bound: 'min', displaces: [], condition: 'none', applies_to: { part: 'whole' }, application: { zones: ['RD'], building_types: ['any'] }, ...o });
/** The §7.5 precedence fixtures (rules 0–7, 4a conflicts, M-38 permitted(), M-48 own-target + argument, M-49, M-50). */
export function precedenceFixtures(vocab) {
  const C = makeContext(vocab);
  const lot = { zone: 'RD', label: { f: 9 }, overlays: { HT: 8.5 }, vars: { lot_frontage_m: 9.75, lot_depth_m: 33.56, lot_area_m2: 327.12 }, flags: { corner_lot: false, major_street: false }, building_type: 'detached_house', exception: null };
  const side = (p, v, c) => U({ unit_id: `10.20.40.70(3)#(${p})`, regulation_id: '10.20.40.70(3)', target: 'side_setback_m', numeric_expression: [`side_setback_m = ${v} m @(3)(${p})`], condition: { tokens: ['required_frontage_band'], if: c } });
  const band = [side('B', '0.9', 'required_lot_frontage_m ≥ 6.0 m and required_lot_frontage_m < 12.0 m'), side('C', '1.2', 'required_lot_frontage_m ≥ 12.0 m and required_lot_frontage_m < 15.0 m'), side('D', '1.5', 'required_lot_frontage_m ≥ 15.0 m and required_lot_frontage_m < 18.0 m')];
  const reqF = [
    U({ unit_id: '10.20.30.20(1)#(A)', regulation_id: '10.20.30.20(1)', archetype: 'DEFINE', bound: 'exact', target: 'required_lot_frontage_m', condition: { tokens: ['label_value'], if: 'labelled(f)' }, numeric_expression: ['required_lot_frontage_m = label(f) @(1)(A)'] }),
    U({ unit_id: '10.20.30.20(1)#(B)', regulation_id: '10.20.30.20(1)', archetype: 'DEFINE', bound: 'exact', target: 'required_lot_frontage_m', condition: { tokens: ['label_value'], if: 'not labelled(f)' }, numeric_expression: ['required_lot_frontage_m = 12.0 m @(1)(B)'] }),
  ];
  const p9003 = U({ unit_id: '900.1.10(3)#whole', regulation_id: '900.1.10(3)', archetype: 'PROCEDURAL', target: 'none', bound: 'none', application: { zones: ['any'], building_types: ['any'] }, ranks_layers: 'exception > base, overlay', numeric_expression: 'none' });
  const excSide = U({ unit_id: '900.3.10(5)#SSP(A)', regulation_id: '900.3.10(5)', layer: 'exception', exception: '900.3.10(5)', target: 'side_setback_m', displaces: ['10.20.40.70(3)'], numeric_expression: ['side_setback_m = 1.8 m @SSP(A)'] });
  const corner = U({ unit_id: '10.20.40.70(6)#whole', regulation_id: '10.20.40.70(6)', target: 'side_setback_street_m', displaces: ['10.20.40.70(3)', '10.20.40.70(4)'], condition: { tokens: ['corner_lot', 'adjacent_lot_fronts_flanking_street'], if: 'required_lot_frontage_m ≥ 12.0 m' }, numeric_expression: ['side_setback_street_m = 3.0 m @(6)'] });
  const hA = U({ unit_id: '10.20.40.10(1)#(A)', regulation_id: '10.20.40.10(1)', bound: 'max', target: 'height_m', condition: { tokens: ['overlay_mapped'], if: 'mapped(HT)' }, numeric_expression: ['height_m = overlay(HT) @(1)(A)'] });
  const hB = U({ unit_id: '10.20.40.10(1)#(B)', regulation_id: '10.20.40.10(1)', bound: 'max', target: 'height_m', condition: { tokens: ['overlay_mapped'], if: 'not mapped(HT)' }, numeric_expression: ['height_m = 10.0 m @(1)(B)'] });
  const hC = U({ unit_id: '10.20.40.10(1)#(C)', regulation_id: '10.20.40.10(1)', bound: 'max', target: 'height_m', application: { zones: ['RD'], building_types: ['detached_houseplex'] }, displaces: ['10.20.40.10(1)(A)'], numeric_expression: ['height_m = max(overlay(HT) @(C)(i); 10.0 m @(C)(ii)) @(1)(C)'] });
  const six2A = U({ unit_id: '600.60.40(2)#(A)', regulation_id: '600.60.40(2)', layer: 'overlay', bound: 'max', target: 'height_m', applies_to: { part: 'map_area', refs: ['sixplex_overlay'] }, application: { zones: ['R', 'RD', 'RS', 'RT', 'RM'], building_types: ['detached_houseplex'] }, condition: { tokens: ['unit_count_band'], if: 'dwelling_units ≥ 5 units and dwelling_units ≤ 6 units' }, displaces: ['10.20.40.10(1)(C)(ii)'], numeric_expression: ['height_m = 10.5 m @(2)(A)'] });
  const sixLot = (ht) => ({ ...lot, overlays: ht === null ? {} : { HT: ht }, building_type: 'sixplex', map_areas: ['sixplex_overlay'], vars: { ...lot.vars, dwelling_units: 6 } });
  const ex = (o) => U({ layer: 'exception', exception: 'SYN', ...o });
  const rt = { ...lot, zone: 'RT' };
  const rtA = U({ unit_id: '10.60.40.70(3)#(A)', regulation_id: '10.60.40.70(3)', application: { zones: ['RT'], building_types: ['any'] }, target: 'side_setback_m', numeric_expression: ['side_setback_m = 7.5 m @(3)(A)'] });
  const rtB = U({ unit_id: '10.60.40.70(3)#(B)', regulation_id: '10.60.40.70(3)', application: { zones: ['RT'], building_types: ['detached_house', 'semi_detached_house', 'detached_houseplex', 'semi_detached_houseplex'] }, target: 'side_setback_m', displaces: ['10.60.40.70(3)(A)'], numeric_expression: ['side_setback_m = 0.9 m @(3)(B)'] });
  const prev = ex({ unit_id: '900.3.10(1463)#PBS(A)', regulation_id: '900.3.10(1463)', exception: '900.3.10(1463)', archetype: 'PREVAILING', target: 'none', bound: 'none', numeric_expression: 'none' });
  const permB = U({ unit_id: '600.60.40(1)#(B)', regulation_id: '600.60.40(1)', layer: 'overlay', archetype: 'PERMIT', target: 'none', bound: 'none', applies_to: { part: 'map_area', refs: ['sixplex_overlay'] }, application: { zones: ['R', 'RD', 'RS', 'RT', 'RM'], building_types: ['detached_houseplex'] }, condition: { tokens: ['unit_count_band'], if: 'dwelling_units ≥ 5 units and dwelling_units ≤ 6 units' }, displaces: ['900.1.10(3)', '900.1.10(4)(A)'], numeric_expression: 'none' });
  const synProh = ex({ unit_id: 'SYN#PROHIBIT', regulation_id: 'SYN', archetype: 'PROHIBIT', target: 'none', bound: 'none', application: { zones: ['RD'], building_types: ['detached_houseplex'] }, condition: { tokens: ['unit_count_band'], if: 'dwelling_units ≥ 5 units' }, numeric_expression: 'none' });
  const lot38 = { ...lot, map_areas: ['sixplex_overlay'], vars: { ...lot.vars, dwelling_units: 6 } };
  const E = (rule, name, run, expect) => ({ rule, name, run, expect });
  const val = (r) => (r.status === 'value' ? r.value : `${r.status}:${r.reason ?? ''}`);
  return [
    E('0', 'no 569-2013 zone → not evaluated (Spec 69 M-27)', () => val(effective({ ...lot, zone: null }, 'side_setback_m', [...band, ...reqF], C)), 'not_evaluated:no_569_2013_zone'),
    E('1', 'loader: INCLUDE expands transitively, a cycle is logged, never looped', () => { const inc = ex({ unit_id: 'X1#SSP(C)', regulation_id: 'X1', exception: 'X1', archetype: 'INCLUDE', include_ref: 'X2', target: 'none', bound: 'none', numeric_expression: 'none' }); const back = ex({ unit_id: 'X2#SSP(B)', regulation_id: 'X2', exception: 'X2', archetype: 'INCLUDE', include_ref: 'X1', target: 'none', bound: 'none', numeric_expression: 'none' }); const lim = ex({ unit_id: 'X2#SSP(A)', regulation_id: 'X2', exception: 'X2', target: 'rear_setback_m', numeric_expression: ['rear_setback_m = 9.0 m @SSP(A)'] }); const L = loadCandidates({ ...lot, exception: 'X1' }, [inc, back, lim]); return `${L.candidates.map((u) => u.unit_id).join(',')}|cycle=${L.log.some((l) => l.includes('cycle'))}|depth=${L.include_depth}`; }, 'X1#SSP(C),X2#SSP(B),X2#SSP(A)|cycle=true|depth=1'),
    E('1', 'a unit whose unit of measure differs from the target is never a candidate (G-CLAUSE)', () => val(effective(lot, 'fsi', [U({ unit_id: 'BAD#(A)', target: 'fsi', bound: 'max', numeric_expression: ['fsi = min(0.6 ratio × lot_area_m2; 204 m2) @(A)'] })], C)), 'not_evaluated:no_candidate'),
    E('2', 'same-layer "Despite" drops the displaced unit (RT detached 0.9, not 4a 7.5)', () => val(effective(rt, 'side_setback_m', [rtA, rtB], C)), 0.9),
    E('2', 'ablation: without displaces[] rule 4a takes the most restrictive 7.5', () => val(effective(rt, 'side_setback_m', [rtA, { ...rtB, displaces: [] }], C)), 7.5),
    E('2', 'M-48 own target: a street-side "Despite (3)" does not drop the interior side yard', () => val(effective({ ...lot, label: { f: 15 }, flags: { corner_lot: true, adjacent_lot_fronts_flanking_street: true } }, 'side_setback_m', [...band, ...reqF, corner], C)), 1.5),
    E('2', 'M-48 own target: the street-side value itself', () => val(effective({ ...lot, label: { f: 15 }, flags: { corner_lot: true, adjacent_lot_fronts_flanking_street: true } }, 'side_setback_street_m', [...band, ...reqF, corner], C)), 3),
    E('2', 'M-48 argument: 600.60.40(2)(A) displaces (C)(ii) only — HT 12.0 kept → 12.0', () => val(effective(sixLot(12), 'height_m', [hA, hB, hC, six2A], C)), 12),
    E('2', 'M-48 argument: HT 9.0 → the 10.5 m argument governs', () => val(effective(sixLot(9), 'height_m', [hA, hB, hC, six2A], C)), 10.5),
    E('2', 'M-48 argument: a DISAPPLY naming (C)(ii) removes it; HT absent → all_map_arguments_absent', () => val(effective(sixLot(null), 'height_m', [hC, U({ unit_id: 'D#(Z)', archetype: 'DISAPPLY', target: 'none', bound: 'none', displaces: ['10.20.40.10(1)(C)(ii)'], numeric_expression: 'none' })], C)), 'not_evaluated:all_map_arguments_absent'),
    E('2', 'whole-unit displacement of a max() unit (the pre-M-48 behaviour) would give 10.5, the ablation', () => val(effective(sixLot(12), 'height_m', [hA, hB, hC, { ...six2A, displaces: ['10.20.40.10(1)(C)'] }], C)), 10.5),
    E('3', 'M-38: an overlay PERMIT displacing 900.1.10(3) is not outranked by an exception PROHIBIT', () => permitted(lot38, 'sixplex', [p9003, permB, synProh], C).status, 'permitted'),
    E('3', 'M-38 ablation: without the displacement the exception PROHIBIT wins by layer', () => permitted(lot38, 'sixplex', [p9003, { ...permB, displaces: [] }, synProh], C).status, 'prohibited'),
    E('3', 'M-38 ablation: outside the Sixplex Overlay the exception PROHIBIT governs', () => permitted({ ...lot38, map_areas: [] }, 'sixplex', [p9003, permB, synProh], C).status, 'prohibited'),
    E('3', 'M-49 tie-break: an overlay max displacing 900.1.10(3) beats an exception max outright (10.5, not 4a 9.0)', () => val(effective(lot, 'height_m', [p9003, U({ unit_id: 'OV#h', layer: 'overlay', bound: 'max', target: 'height_m', displaces: ['900.1.10(3)'], numeric_expression: ['height_m = 10.5 m @x'] }), ex({ unit_id: 'EX#h', bound: 'max', target: 'height_m', numeric_expression: ['height_m = 9.0 m @x'] })], C)), 10.5),
    E('3', 'M-49 ablation: without the displacement the exception layer wins (9.0)', () => val(effective(lot, 'height_m', [p9003, U({ unit_id: 'OV#h', layer: 'overlay', bound: 'max', target: 'height_m', numeric_expression: ['height_m = 10.5 m @x'] }), ex({ unit_id: 'EX#h', bound: 'max', target: 'height_m', numeric_expression: ['height_m = 9.0 m @x'] })], C)), 9),
    E('4', 'exception replaces base for the same target and bound, even when less restrictive (900.1.10(3), M-34)', () => val(effective({ ...lot, exception: '900.3.10(254)' }, 'side_setback_m', [...band, ...reqF, ex({ unit_id: '900.3.10(254)#SSP(A)', exception: '900.3.10(254)', target: 'side_setback_m', numeric_expression: ['side_setback_m = 0.6 m @SSP(A)'] })], C)), 0.6),
    E('4', 'overlay replaces base without "Despite" (M-34 note)', () => val(effective(lot, 'height_m', [hA, hB, U({ unit_id: 'OV#h2', layer: 'overlay', bound: 'max', target: 'height_m', numeric_expression: ['height_m = 11.0 m @x'] })], C)), 11),
    E('4', 'a different bound direction is additional (base min kept beside an exception max)', () => { const r = effective(lot, 'side_setback_m', [...band, ...reqF, ex({ unit_id: 'EXM#s', bound: 'max', target: 'side_setback_m', numeric_expression: ['side_setback_m = 5.0 m @x'] })], C); return `${r.value}|${JSON.stringify(r.bounds)}`; }, '0.9|{"max":5,"min":0.9}'),
    E('4', 'explicit exception "Despite" + layer: RD 5 (A) 1.8 replaces the base band', () => val(effective({ ...lot, exception: '900.3.10(5)' }, 'side_setback_m', [...band, ...reqF, excSide], C)), 1.8),
    E('4a', 'same layer, bound min → the largest', () => val(effective(lot, 'rear_setback_m', [U({ unit_id: 'A1#a', target: 'rear_setback_m', numeric_expression: ['rear_setback_m = 7.5 m @a'] }), U({ unit_id: 'A2#b', target: 'rear_setback_m', numeric_expression: ['rear_setback_m = 25 pct × lot_depth_m @b'] })], C)), 8.39),
    E('4a', 'same layer, bound max → the smallest', () => val(effective(lot, 'height_m', [U({ unit_id: 'H1#a', bound: 'max', target: 'height_m', numeric_expression: ['height_m = 10.0 m @a'] }), U({ unit_id: 'H2#b', bound: 'max', target: 'height_m', numeric_expression: ['height_m = 8.5 m @b'] })], C)), 8.5),
    E('4a', 'unlimited (M-48) loses to any finite max', () => val(effective(lot, 'fsi', [U({ unit_id: 'F1#a', bound: 'max', target: 'fsi', numeric_expression: ['fsi = unlimited @a'] }), U({ unit_id: 'F2#b', bound: 'max', target: 'fsi', numeric_expression: ['fsi = 0.6 ratio @b'] })], C)), 0.6),
    E('4a', 'unlimited alone is a value, not not_evaluated', () => val(effective(lot, 'fsi', [U({ unit_id: 'F1#a', bound: 'max', target: 'fsi', numeric_expression: ['fsi = unlimited @a'] })], C)), 'unlimited'),
    E('4a', 'CONFLICT: two different exact values (eval_conflict)', () => val(effective(lot, 'dwelling_units_max', [U({ unit_id: 'E1#a', bound: 'exact', target: 'dwelling_units_max', numeric_expression: ['dwelling_units_max = 4 units @a'] }), U({ unit_id: 'E2#b', bound: 'exact', target: 'dwelling_units_max', numeric_expression: ['dwelling_units_max = 6 units @b'] })], C)), 'conflict:eval_conflict'),
    E('4a', 'CONFLICT: an applicable min above an applicable max', () => val(effective(lot, 'height_m', [U({ unit_id: 'MN#a', bound: 'min', target: 'height_m', numeric_expression: ['height_m = 13.0 m @a'] }), U({ unit_id: 'MX#b', bound: 'max', target: 'height_m', numeric_expression: ['height_m = 8.5 m @b'] })], C)), 'conflict:eval_conflict'),
    E('5', 'PREVAILING never changes the value and adds the alternate-path disclosure', () => { const r = effective({ ...lot, exception: '900.3.10(1463)' }, 'side_setback_m', [...band, ...reqF, prev], C); return `${r.value}|${r.disclosures.some((d) => d.includes('alternate compliance path'))}`; }, '0.9|true'),
    E('6', 'a higher-layer unit with no lower-layer unit for the target is additional', () => val(effective(lot, 'garage_entrance_setback_m', [...band, ex({ unit_id: '900.3.10(806)#SSP(E)', target: 'garage_entrance_setback_m', numeric_expression: ['garage_entrance_setback_m = 6.0 m @SSP(E)'] })], C)), 6),
    E('7', 'no candidate → not evaluated, never a default', () => val(effective(lot, 'building_length_m', [...band], C)), 'not_evaluated:no_candidate'),
    E('M-50', 'building type NULL, types disagree (RT 0.9 vs 7.5) → needs_user_input:building_type', () => val(effective({ ...rt, building_type: null }, 'side_setback_m', [rtA, rtB], C)), 'not_evaluated:needs_user_input:building_type'),
    E('M-50', 'building type NULL, every type agrees → the value', () => val(effective({ ...lot, building_type: null }, 'side_setback_m', [...band, ...reqF], C)), 0.9),
    E('M-50', 'per-type values are returned with the not_evaluated result', () => { const r = effective({ ...rt, building_type: null }, 'side_setback_m', [rtA, rtB], C); return `${r.per_type.detached_house}|${r.per_type.apartment_building}`; }, '0.9|7.5'),
  ];
}

/** Module self-test (Spec 68 §8 rule 8 shape): every precedence fixture returns its expected result. */
export function selfTest(vocab) {
  const results = precedenceFixtures(vocab).map((f) => { const got = f.run(); return { rule: f.rule, name: f.name, pass: got === f.expect, got, expect: f.expect }; });
  return { pass: results.every((r) => r.pass), violations: results.filter((r) => !r.pass).map((r) => `${r.rule}: ${r.name}: got ${JSON.stringify(r.got)}`), checked: results.length, results };
}
