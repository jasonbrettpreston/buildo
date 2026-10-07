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
//   permitted(lot, building_type, candidates, ctx) → {status: permitted|prohibited|not_evaluated, …}  (a same-rank
//                                            PERMIT/PROHIBIT tie is prohibited + expert_sample, ruling (a) 2026-10-07)
//   checkEval({units, vectors, vocab, enactments}) → {pass, violations, checked, counts, rows}   (G-EVAL (a)+(b))
//   precedenceFixtures(vocab) / selfTest(vocab)                                           (G-EVAL (c))
//
// A lot vector (§7.6, M-42): {zone, label:{f,a,d,u…}, overlays:{HT,ST,LC…} (undefined = map not held),
//   vars:{lot_frontage_m…}, flags:{corner_lot…}, building_type (null = unknown, M-50), exception, map_areas
//   (undefined = not held), address, parcel_id (the City PARCEL_ID: provincial land default / exclusions, ruling (c)),
//   existing:{"<var>@<date>": value}}.
//
// Fail-closed lot gate (operator rulings 2026-10-07), before any precedence rule, for every target and permitted():
// a label letter outside vocab.label_letter → label_letter_unknown:<letter> (e); the lot's exception or one in its
// INCLUDE closure not authored for the target → exception_not_authored:<exception> (d). Every result lists
// `exception` and `label` in inputs[].
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
  'label_letter_unknown', // :<letter> the lot label carries a letter outside vocab.label_letter (operator ruling (e) 2026-10-07)
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
  'exception_not_authored', // :<exception> the lot's exception (or one it INCLUDEs) is not authored for the target — blocks
  //                           every target, base included (operator ruling (d) 2026-10-07; was rule 7a only)
]);
/** Lot inputs every result depends on through the fail-closed lot gate (rulings (d), (e)): recorded in inputs[]. */
const GATE_READS = Object.freeze(['exception', 'label']);
/** Undecided applicability is resolved by enumeration over at most this many units (2^n worlds), else not_evaluated. */
export const MAX_UNDECIDED = 8;
const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const stableJson = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort(cmpStr).map((y) => [y, x[y]])) : x));
/** How a provincial unit restrains a by-law (Spec 68 §6.1, Spec 69 M-55 note): the bound it restrains. */
const LIMITS = Object.freeze({ min_permission: 'max', max_requirement: 'min' });
const PENDING_ROW = Object.freeze(['pending', 'pending:stale', 'failed']);
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
    residentialTypes: [...(vocab.building_type_residential || [])].sort(cmpStr), // order-free (red-team E8)
    typeParent: vocab.building_type_parent || {},
    userInputs: new Set(vocab.user_input || []),
    thresholdTokens: new Set(vocab.lot_condition_threshold || []),
    enactments: extra.enactments || {},
    absences: [...(extra.absences || [])].sort((a, b) => cmpStr(String(a.id), String(b.id))), // absence-rulings.json (M-54 note)
    // exception id -> 'authored' | {status: 'authored'} | {status: 'partial', targets: [...]} (the G-AGREE outcome);
    // the lot gate reads it (ruling (d)). Nothing listed = not authored (Phase 1 has no authored exception yet).
    authored: extra.authored || {},
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
  const reads = new Set();
  const env = { C, lot, trace, reads, resolveVariable: ctx && ctx.resolveVariable, argEdits: (ctx && ctx.argEdits) || {} };
  const r = ev(ast, env);
  const inputs = [...reads].sort(cmpStr);
  if (r.ne) return { value: null, unit: r.unit ?? null, not_evaluated: r.ne, trace, inputs };
  if (r.value === 'unregulated') return { value: 'unregulated', unit: r.unit, clause: clausePath, trace, inputs }; // M-54: carries the clause that says so
  return { value: r.value === 'unlimited' ? 'unlimited' : r9(r.value), unit: r.unit, trace, inputs };
}
const addAll = (set, xs) => { for (const x of xs || []) set.add(x); };

function ev(e, env) {
  const { C, lot, trace } = env;
  switch (e.type) {
    case 'lit': return { value: e.value, unit: e.unit };
    case 'unlimited': return { value: 'unlimited', unit: null };
    case 'unregulated': return { value: 'unregulated', unit: null };
    case 'var': return variable(e.name, env);
    case 'label': {
      env.reads.add(`label.${e.letter}`);
      if (!lot.label) return ne('missing_input', 'zone_label');
      const v = lot.label[e.letter];
      if (v === undefined || v === null) return { ...ne('label_value_absent', e.letter), absent: true };
      trace.push(`label(${e.letter})=${v}`);
      return { value: v, unit: C.units.label[e.letter] ?? null };
    }
    case 'overlay': {
      env.reads.add(`overlays.${e.code}`);
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
      env.reads.add(`existing.${e.var}@${date}`);
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
      env.reads.add('building_type');
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
  env.reads.add(`vars.${name}`); // a lot value, when present, is read first (so it is a dependency either way)
  if (v !== undefined && v !== null) { trace.push(`${name}=${v}`); return { value: v, unit }; }
  if (env.resolveVariable) {
    const r = env.resolveVariable(name);
    if (r) {
      env.reads.add(`target.${name}`);
      addAll(env.reads, r.inputs);
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
    case 'mapped': {
      env.reads.add(`overlays.${c.code}`);
      const r = lot.overlays ? lot.overlays[c.code] !== undefined && lot.overlays[c.code] !== null : ne('map_area_not_held', c.code);
      env.trace.push(`mapped(${c.code})=${r === true || r === false ? r : 'unknown'}`);
      return r;
    }
    case 'labelled': {
      env.reads.add(`label.${c.letter}`);
      const r = lot.label ? lot.label[c.letter] !== undefined && lot.label[c.letter] !== null : ne('missing_input', 'zone_label');
      env.trace.push(`labelled(${c.letter})=${r === true || r === false ? r : 'unknown'}`);
      return r;
    }
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
export function applies(lot, u, ctx, resolveVariable, reads = new Set(), trace = []) {
  const C = ctxOf(ctx);
  const app = u.application || {};
  const zones = app.zones || [];
  reads.add('zone');
  if (zones.length && !zones.includes('any') && !zones.includes(lot.zone)) return { ok: false, why: 'zone' };
  let unknown = null;
  const types = app.building_types || [];
  if (types.length && !types.includes('any')) {
    reads.add('building_type');
    const bt = lot.building_type;
    if (!bt) unknown = 'needs_user_input:building_type';
    else if (!types.includes(bt) && !types.includes(C.typeParent[bt])) return { ok: false, why: 'building_type' };
  }
  const part = (u.applies_to && u.applies_to.part) || 'whole';
  const refs = (u.applies_to && u.applies_to.refs) || [];
  if (part === 'map_area') {
    reads.add('map_areas');
    if (!lot.map_areas) unknown = unknown || `map_area_not_held:${refs.join('+') || u.unit_id}`;
    else if (!refs.some((r) => lot.map_areas.includes(r))) return { ok: false, why: 'map_area' };
  } else if (part === 'named_addresses' || part === 'lot_list') {
    reads.add('address');
    if (!lot.address) unknown = unknown || 'named_lots_only';
    else if (!refs.some((r) => r.toLowerCase() === String(lot.address).toLowerCase())) return { ok: false, why: part };
  }
  const cond = u.condition;
  const hasIf = Boolean(cond && cond !== 'none' && cond.if && cond.if !== 'none');
  for (const t of tokensOf(cond)) {
    // a threshold token's truth comes from condition.if; without one it is undecided, never unconditional (DeepSeek
    // error-paths lens, adjudicated by execution 2026-10-07)
    if (C.thresholdTokens.has(t) && !hasIf) { trace.push(`${t}=unknown (threshold token without condition.if)`); unknown = unknown || `condition_unknown:${t}`; continue; }
    if (C.thresholdTokens.has(t) || t === 'exception_area') continue; // truth from condition.if / the loader
    reads.add(`flags.${t}`);
    const v = lot.flags ? lot.flags[t] : undefined;
    trace.push(`${t}=${v === true || v === false ? v : 'unknown'}`);
    if (v === false) return { ok: false, why: `condition ${t}` };
    if (v !== true) unknown = unknown || (C.userInputs.has(t) ? `needs_user_input:${t}` : `condition_unknown:${t}`);
  }
  if (cond && cond !== 'none' && cond.if && cond.if !== 'none') {
    let c;
    try { c = parseCond(cond.if); } catch (err) { if (err instanceof DslError) return { ok: null, reason: `expression_error:${err.code}` }; throw err; }
    const r = evCond(c, { C, lot, trace, reads, resolveVariable, argEdits: {} });
    if (r === false) return { ok: false, why: `condition ${cond.if}` };
    if (r !== true) unknown = unknown || r.ne;
  }
  if (u.layer === 'provincial' && u.provincial) {
    const s = provincialScope(lot, u.provincial, C, reads, trace);
    if (s === false) return { ok: false, why: 'provincial scope' };
    if (s !== true) unknown = unknown || s;
  }
  return unknown ? { ok: null, reason: unknown } : { ok: true };
}

/**
 * Spec 68 §6.1: a provincial unit is a candidate only when the lot meets its `scope` (land, principal building
 * type, unit configuration), resolved to lot inputs by provincialUnits() through vocab.provincial_scope.
 * Three-valued: true | false | '<reason>' (undecided). A false part decides false whatever else is unknown.
 */
function provincialScope(lot, p, C, reads, trace) {
  const unknowns = [];
  let out = true;
  reads.add('building_type');
  const bt = lot.building_type;
  let cond = null; // ruling (b): a houseplex type that maps only up to max_lot_units
  if (!bt) unknowns.push('needs_user_input:building_type');
  else if (!p.building_types.includes(bt) && !p.building_types.includes(C.typeParent[bt])) {
    cond = (p.conditional_types || []).find((c) => c.type === bt || c.children.includes(bt)) || null;
    if (!cond) out = false;
  }
  // ruling (c): an explicit lot flag wins; else the declared default, unless the parcel is on the exclusion list (unknown)
  reads.add(`flags.${p.land_flag}`);
  let land = lot.flags ? lot.flags[p.land_flag] : undefined;
  let landReason = `condition_unknown:${p.land_flag}`; let landNote = '';
  if (land !== true && land !== false && typeof p.land_default === 'boolean') {
    reads.add('parcel_id');
    const pid = lot.parcel_id === undefined || lot.parcel_id === null ? null : String(lot.parcel_id);
    if (pid === null) landNote = ' (no parcel_id: the exclusion list cannot be checked, default not applied)';
    else if ((p.land_exclusions || []).includes(pid)) { landReason = `missing_input:${p.land_flag}`; landNote = ` (parcel ${pid} on the exclusion list: unknown)`; }
    else { land = p.land_default; landNote = ' (declared citywide default)'; }
  }
  if (land === false) out = false;
  else if (land !== true) unknowns.push(landReason);
  reads.add(`vars.${p.house_var}`); reads.add(`vars.${p.ancillary_var}`);
  const h = lot.vars ? lot.vars[p.house_var] : undefined;
  const a = lot.vars ? lot.vars[p.ancillary_var] : undefined;
  const known = (x) => x !== undefined && x !== null;
  const fits = p.unit_configurations.filter((c) => (!known(h) || c.house_units.includes(h)) && (!known(a) || c.ancillary_units.includes(a)));
  if (!fits.length) out = false;
  else if (!known(h)) unknowns.push(`needs_user_input:${p.house_var}`);
  else if (!known(a)) unknowns.push(`needs_user_input:${p.ancillary_var}`);
  if (cond && known(h) && known(a) && h + a > cond.max_lot_units) out = false;
  trace.push(`provincial scope: building_type=${bt ?? 'unknown'}, ${p.land_flag}=${land ?? 'unknown'}${landNote}, ${p.house_var}=${known(h) ? h : 'unknown'}, ${p.ancillary_var}=${known(a) ? a : 'unknown'}`);
  if (cond) trace.push(`provincial scope: conditional ${bt} → ${cond.provincial_type} via ${cond.type} (≤ ${cond.max_lot_units} lot units; evidence ${cond.evidence}; M-29 expert sample)`);
  if (out === false) return false;
  return unknowns.length ? unknowns[0] : true;
}

// ---------------------------------------------------------------- loader (rule 1)
/** Rule 1: base units of the lot's zone (by chapter), overlay and provincial units, the lot's exception units INCLUDE-expanded. */
export function loadCandidates(lot, units) {
  const out = []; const seen = new Set(); const log = []; let depthMax = 0;
  units = sortCandidates(units); // declared total order first, so a duplicate unit_id never resolves by input order
  const add = (u) => { if (!seen.has(u.unit_id)) { seen.add(u.unit_id); out.push(u); } else if (!out.includes(u)) log.push(`duplicate unit_id ${u.unit_id} ignored (first in the declared order kept)`); };
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
const NE_RESULT = (reason, extra = {}) => ({ status: 'not_evaluated', value: null, reason, applied: [], trace: [], disclosures: [], inputs: [], ...extra });
const UNIT_SORT = new WeakMap();
const unitSortKey = (u) => { if (!UNIT_SORT.has(u)) UNIT_SORT.set(u, stableJson(u)); return UNIT_SORT.get(u); };
/** The declared total order on candidates (layer rank, unit_id, then content): every result is independent of input order. */
export function sortCandidates(cands) {
  return [...(cands || [])].sort((a, b) => ((LAYER_RANK[a.layer] ?? 0) - (LAYER_RANK[b.layer] ?? 0)) || cmpStr(String(a.unit_id), String(b.unit_id)) || cmpStr(unitSortKey(a), unitSortKey(b)));
}
/**
 * The reported reason when several are possible: a declared priority, never first-seen — building type first (M-50
 * enumerates it), then the order of NOT_EVALUATED_CODES, then the reason text.
 */
export function pickReason(reasons) {
  const rank = (r) => (r === 'needs_user_input:building_type' ? -1 : (NOT_EVALUATED_CODES.indexOf(reasonCode(r)) + 1) || 999);
  return [...new Set(reasons)].sort((a, b) => (rank(a) - rank(b)) || cmpStr(a, b))[0];
}
const resultKey = (r) => stableJson({ s: r.status, v: r.value, r: r.reason ?? null, b: r.bounds ?? null, e: r.evidence ?? null });

/** §7.5 rules 0, 2–7 (+ M-50 building type unknown). Candidates are put in the declared total order first. */
export function effective(lot, target, candidates, ctx, _env = {}) {
  const C = ctxOf(ctx);
  if (!lot || !lot.zone || (C.zones.size && !C.zones.has(lot.zone))) return NE_RESULT('no_569_2013_zone', { trace: ['rule 0: the lot has no 569-2013 residential zone'], inputs: ['zone'] });
  const depth = (_env.depth || 0) + 1;
  if (depth > 8) return NE_RESULT('target_cycle');
  const gate = lotGate(lot, target, candidates, C);
  if (gate) return gate;
  const cands = _env.sorted ? candidates : sortCandidates(candidates);
  const r = effResolve(lot, target, cands, C, { ...(_env), depth, sorted: true });
  return { ...r, inputs: [...new Set([...(r.inputs || []), ...GATE_READS])].sort(cmpStr) };
}

/**
 * Fail-closed lot checks that run before any precedence rule (operator rulings 2026-10-07): (e) a label letter outside
 * vocab.label_letter → label_letter_unknown:<first letter, sorted>; (d) the lot's exception, or one in its INCLUDE
 * closure, not authored for `target` → exception_not_authored:<exception>, for EVERY target, base included (a base
 * value under an unread exception may be the wrong law). null when the lot passes.
 */
function lotGate(lot, target, candidates, C) {
  const inputs = [...GATE_READS, 'zone'].sort(cmpStr);
  const letters = lot.label && typeof lot.label === 'object' ? Object.keys(lot.label) : [];
  const unknownLetters = letters.filter((l) => !Object.hasOwn(C.units.label, l)).sort(cmpStr);
  if (unknownLetters.length) return NE_RESULT(`label_letter_unknown:${unknownLetters[0]}`, { trace: [`ruling (e): label letter(s) ${unknownLetters.join(', ')} outside the grammar (vocab.label_letter) — not evaluated, never read as absent`], inputs });
  const exc = exceptionNotAuthored(lot, target, candidates, C);
  if (exc) return NE_RESULT(`exception_not_authored:${exc}`, { trace: [`ruling (d): exception ${exc} (the lot's exception or one it INCLUDEs) is not authored for ${target} — no layer resolves on this lot`], inputs });
  return null;
}

function effResolve(lot, target, cands, C, _env) {
  const { depth } = _env;
  const core = effCore(lot, target, cands, C, _env);
  if (lot.building_type || _env.inScenario || core.reason !== 'needs_user_input:building_type') return core;
  // M-50: evaluate every residential type (sorted, order-free); a value only if all agree
  const per = {}; const results = {}; const inputs = new Set(['building_type', ...core.inputs]);
  for (const t of C.residentialTypes) {
    const r = effCore({ ...lot, building_type: t }, target, cands, C, { ...(_env), depth, inScenario: true, sorted: true });
    results[t] = r; addAll(inputs, r.inputs);
    per[t] = r.status === 'value' ? r.value : r.status === 'conflict' ? 'conflict' : `not_evaluated:${r.reason}`;
  }
  const distinct = [...new Set(C.residentialTypes.map((t) => resultKey(results[t])))]; // value, bounds, reason, evidence
  const trace = [...core.trace, `M-50 per-type: ${C.residentialTypes.map((t) => `${t}=${per[t]}`).join(', ')}`];
  const ins = [...inputs].sort(cmpStr);
  if (distinct.length === 1 && C.residentialTypes.length) {
    const any = results[C.residentialTypes[0]];
    const winners = [...new Set(C.residentialTypes.map((t) => results[t].winner ?? null))];
    return { ...any, winner: winners.length === 1 ? any.winner : null, ...(winners.length > 1 ? { winners_per_type: Object.fromEntries(C.residentialTypes.map((t) => [t, results[t].winner ?? null])) } : {}), trace: [...trace, 'all residential types agree'], per_type: per, inputs: ins };
  }
  return NE_RESULT('needs_user_input:building_type', { trace, per_type: per, inputs: ins });
}

function effCore(lot, target, candidates, C, env) {
  const trace = []; const disclosures = []; const reads = new Set(['zone']);
  const resolveVariable = (name) => (name === target ? null : effective(lot, name, candidates, C, { depth: env.depth, inScenario: env.inScenario, sorted: true }));
  let valueUnits = candidates.filter((u) => (u.archetype === 'LIMIT' || u.archetype === 'DEFINE') && parsedFor(u, target).length);
  // a provincial-layer unit comes only from external.json through provincialUnits(): it must carry limits_bylaw + scope
  for (const u of valueUnits) if (u.layer === 'provincial' && !(u.provincial && LIMITS[u.provincial.limits_bylaw])) trace.push(`rule 1: ${u.unit_id} is a provincial-layer unit without limits_bylaw / scope (not from external.json) — never a candidate`);
  valueUnits = valueUnits.filter((u) => u.layer !== 'provincial' || (u.provincial && LIMITS[u.provincial.limits_bylaw]));
  const refsValue = (u) => (u.displaces || []).some((ref) => valueUnits.some((v) => v !== u && refMatch(ref, v.unit_id)));
  const procs = candidates.filter((u) => u.archetype === 'PROCEDURAL' && rankedLayers(u.ranks_layers).length);
  const displacers = candidates.filter((u) => u.archetype !== 'PROCEDURAL' && refsValue(u) && (!hasTarget(u) || u.target === target));
  const prevailing = candidates.filter((u) => u.archetype === 'PREVAILING');

  // applicability (rule 1's condition filter, run here because conditions read effective targets and the scenario type);
  // every condition input read is recorded (reads → result.inputs; the values → the trace)
  const considered = new Set([...valueUnits, ...displacers, ...procs]);
  const A = new Set(); const unknown = [];
  for (const u of candidates) {
    if (!considered.has(u)) continue;
    const t = [];
    const a = applies(lot, u, C, resolveVariable, reads, t);
    if (t.length) trace.push(`condition ${u.unit_id}: ${t.join(', ')} → ${a.ok === true ? 'applies' : a.ok === false ? `not applicable (${a.why})` : `undecided (${a.reason})`}`);
    if (a.ok === true) A.add(u);
    else if (a.ok === null) unknown.push({ u, reason: a.reason });
  }
  for (const u of prevailing) {
    const a = applies(lot, u, C, resolveVariable, reads, []);
    if (a.ok === true) disclosures.push(`alternate compliance path under ${u.unit_id} — not evaluated (rule 5)`);
    else if (a.ok === null) disclosures.push(`alternate compliance path under ${u.unit_id} may apply (${a.reason}) — not evaluated (rule 5)`);
  }
  const base = { lot, target, candidates, C, resolveVariable, valueUnits, procs, reads };
  if (!unknown.length) return resolveSet(base, A, trace, disclosures);
  for (const x of unknown) trace.push(`applicability unknown: ${x.u.unit_id} (${x.reason})`);
  const reason = pickReason(unknown.map((x) => x.reason));
  const ins = () => [...reads].sort(cmpStr);
  if (reason === 'needs_user_input:building_type' && !lot.building_type) return NE_RESULT(reason, { trace, disclosures, inputs: ins() }); // M-50 enumerates
  if (unknown.length > MAX_UNDECIDED) return NE_RESULT(reason, { trace: [...trace, `${unknown.length} undecided units > ${MAX_UNDECIDED}: not enumerated`], disclosures, inputs: ins() });
  // Spec 68 §7.5 (Spec 69 M-60, generalising M-50): resolve every combination of the undecided units; the result
  // stands only when every resolution agrees (status, value, bounds, reason, evidence); else not_evaluated
  const worlds = [];
  for (let mask = 0; mask < (1 << unknown.length); mask++) {
    const Aw = new Set(A);
    unknown.forEach((x, i) => { if (mask & (1 << i)) Aw.add(x.u); });
    worlds.push(resolveSet(base, Aw, [...trace], [...disclosures]));
  }
  const keys = new Set(worlds.map(resultKey));
  if (keys.size === 1) {
    const w0 = worlds[0];
    const winners = [...new Set(worlds.map((w) => w.winner ?? null))];
    return { ...w0, winner: winners.length === 1 ? w0.winner : null, undecided: unknown.map((x) => ({ unit_id: x.u.unit_id, reason: x.reason })),
      trace: [...w0.trace, `undecided: ${unknown.map((x) => x.u.unit_id).join(', ')} — all ${worlds.length} resolutions agree (M-60)`], inputs: ins() };
  }
  return NE_RESULT(reason, { trace: [...trace, `undecided: ${worlds.length} resolutions disagree (${[...new Set(worlds.map((w) => (w.status === 'value' ? String(w.value) : `${w.status}:${w.reason}`)))].sort(cmpStr).join(' | ')})`], disclosures, inputs: ins() });
}

/** The lot's exception and its INCLUDE closure are authored for `target` (lot gate, ruling (d)); returns the first that is not, or null. */
function exceptionNotAuthored(lot, target, candidates, C) {
  if (!lot.exception) return null;
  const excOf = (u) => u.exception || u.regulation_id || splitRef(u.unit_id).reg;
  const ok = (s) => s === 'authored' || (s && s.status === 'authored') || (s && s.status === 'partial' && Array.isArray(s.targets) && s.targets.includes(target));
  const pending = (u) => PENDING_ROW.includes(u.row_status) || statementsOf(u).some((s) => s.error)
    || ((u.archetype === 'LIMIT' || u.archetype === 'DEFINE') && hasTarget(u) && !statementsOf(u).length);
  const seen = new Set(); const queue = [lot.exception];
  while (queue.length) {
    const e = queue.shift();
    if (seen.has(e)) continue;
    seen.add(e);
    const us = candidates.filter((u) => u.layer === 'exception' && excOf(u) === e);
    if (!us.length || !ok(C.authored[e]) || us.some(pending)) return e;
    for (const u of us) if (u.archetype === 'INCLUDE' && u.include_ref) queue.push(splitRef(u.include_ref).reg);
  }
  return null;
}

/** Rules 3, 2, 1 (unit check), 7 / 7a, 4, 4a, the provincial restraint (rule 4, M-55) over one applicable set A. */
function resolveSet({ lot, target, candidates, C, resolveVariable, valueUnits, procs, reads }, A, trace, disclosures) {
  const ins = () => [...reads].sort(cmpStr);
  const sortedA = candidates.filter((u) => A.has(u));
  // rule 3 (M-38, M-49): a unit displacing a precedence rule ranks just above the highest layer that rule ranks
  const immune = new Map();
  for (const u of sortedA) for (const ref of u.displaces || []) for (const p of procs) {
    if (A.has(p) && refMatch(ref, p.unit_id) === 'full') {
      const top = Math.max(...rankedLayers(p.ranks_layers).map((l) => LAYER_RANK[l] ?? 0));
      immune.set(u.unit_id, Math.max(immune.get(u.unit_id) ?? -1, top + 0.5));
      trace.push(`rule 3: ${u.unit_id} displaces ${p.unit_id} → ranks above ${rankedLayers(p.ranks_layers).join(', ')}`);
    }
  }
  const rankOf = (u) => Math.max(LAYER_RANK[u.layer] ?? 0, immune.get(u.unit_id) ?? -1);

  // rule 2 (M-48): displacement, own target only; argument-level entries remove or replace one argument. A same-target
  // displacer naming an argument takes that argument's place, and the rewritten unit carries the higher of the two
  // layers (Spec 68 §7.5 rule 2, stated with the §7.4 worked example: HT 12.0 → 12.0 m; Spec 69 M-60)
  const dropped = new Set(); const consumed = new Set(); const edits = new Map(); // unit_id → {path: null|AST}
  for (const d of sortedA) {
    if (!(d.displaces || []).length) continue;
    for (const ref of d.displaces) for (const v of sortedA) {
      if (v === d || v.archetype === 'PROCEDURAL' || !valueUnits.includes(v)) continue;
      const m = refMatch(ref, v.unit_id);
      if (!m) continue;
      if (hasTarget(d) && d.target !== v.target) continue;
      if (m === 'full') { dropped.add(v.unit_id); trace.push(`rule 2: ${d.unit_id} drops ${v.unit_id}`); continue; }
      const tagged = parsedFor(v, target).some((s) => argPaths(s.expr).includes(m.arg));
      if (!tagged) return NE_RESULT(`displaced_argument_not_found:${m.arg}`, { trace: [...trace, `rule 2: ${d.unit_id} names ${m.arg} inside ${v.unit_id}, which tags no such argument`], disclosures, inputs: ins() });
      const own = parsedFor(d, target);
      const e = edits.get(v.unit_id) || { args: {}, layer: v.layer, immune: -1, by: [] };
      if (own.length && !staticUnitOk(own[0], C)) { trace.push(`rule 1: ${d.unit_id} unit of measure ≠ ${target} — G-CLAUSE failure, not substituted`); consumed.add(d.unit_id); continue; }
      if (own.length) { e.args[m.arg] = own[0].expr; consumed.add(d.unit_id); if ((LAYER_RANK[d.layer] ?? 0) > (LAYER_RANK[e.layer] ?? 0)) e.layer = d.layer; e.immune = Math.max(e.immune, immune.get(d.unit_id) ?? -1); trace.push(`rule 2: ${d.unit_id} replaces argument ${m.arg} of ${v.unit_id}`); }
      else { e.args[m.arg] = null; trace.push(`rule 2: ${d.unit_id} removes argument ${m.arg} of ${v.unit_id}`); }
      e.by.push(d.unit_id);
      edits.set(v.unit_id, e);
    }
  }

  // candidates: applicable value units, not dropped, not consumed by a substitution; unit-of-measure check (rule 1).
  // Provincial units are restrainers (rule 4, M-55), kept apart: never replaced-by-layer, never additional.
  const tUnit = C.units.target[target] ?? C.units.input[target] ?? null;
  const unitOk = (u) => {
    const bad = parsedFor(u, target).some((s) => staticUnitOk(s, C) === false);
    if (bad) trace.push(`rule 1: ${u.unit_id} unit of measure ≠ ${target} (${tUnit}) — G-CLAUSE failure, never a candidate`);
    return !bad;
  };
  const T = sortedA.filter((u) => valueUnits.includes(u) && u.layer !== 'provincial' && !dropped.has(u.unit_id) && !consumed.has(u.unit_id)).filter(unitOk);
  const prov = sortedA.filter((u) => valueUnits.includes(u) && u.layer === 'provincial').filter(unitOk);
  if (!T.length) {
    for (const p of prov) trace.push(`rule 4 (M-55): ${p.unit_id} not applied — no by-law unit for ${target} (a provincial unit is never additional)`);
    // rule 7a (M-54 note 2026-10-07; Spec 69 M-60): unregulated BY ABSENCE only when (i) a verified ruling covers
    // (zone, target), (ii) the lot's exception and its INCLUDE closure are authored for the target — guaranteed here:
    // effective()'s lot gate already returned exception_not_authored otherwise (ruling (d)), (iii) no by-law unit of
    // any layer carries the target, keyed or pending.
    const abs = (C.absences || []).find((a) => a.zone === lot.zone && a.target === target);
    if (abs) {
      const any = candidates.filter((u) => u.layer !== 'provincial' && (u.target === target || parsedFor(u, target).length));
      if (!any.length) {
        return { status: 'value', value: 'unregulated', unit: C.units.target[target] ?? null, bound: null, winner: null, clause: null,
          evidence: { kind: 'absence', ruling: abs.id, statement: abs.statement, expert_sample: abs.expert_sample === true },
          bounds: {}, applied: [], trace: [...trace, `rule 7 + ${abs.id}: no unit of any by-law layer for ${target}; unregulated by absence (${abs.statement})`], disclosures, inputs: ins() };
      }
      trace.push(`${abs.id} not applied: a unit for ${target} exists (${any.map((u) => u.unit_id).join(', ')})`);
    }
    return NE_RESULT('no_candidate', { trace: [...trace, `rule 7: no candidate for ${target}`], disclosures, inputs: ins() });
  }

  // rule 4: per bound direction, the highest layer (with rule 3 immunity) replaces lower layers; rule 6 falls out
  const layerOf = (u) => (edits.has(u.unit_id) ? edits.get(u.unit_id).layer : u.layer);
  const rank = (u) => Math.max(LAYER_RANK[layerOf(u)] ?? 0, rankOf(u), edits.has(u.unit_id) ? edits.get(u.unit_id).immune : -1);
  const boundOfUnit = (u) => (u.bound === 'min' || u.bound === 'max' ? u.bound : 'exact'); // DEFINE / 'none' / missing → exact
  const byBound = {};
  for (const u of T) (byBound[boundOfUnit(u)] = byBound[boundOfUnit(u)] || []).push(u);
  const kept = {};
  for (const [b, us] of Object.entries(byBound).sort(([a], [c]) => cmpStr(a, c))) {
    const top = Math.max(...us.map(rank));
    kept[b] = us.filter((u) => rank(u) === top);
    const lost = us.filter((u) => rank(u) !== top).map((u) => u.unit_id);
    if (lost.length) trace.push(`rule 4: ${lost.join(', ')} replaced by a higher layer (bound ${b})`);
  }

  // evaluate + rule 4a
  const ev1 = (s, args) => {
    const r = evaluate(s, lot, { ...C, resolveVariable, argEdits: args });
    addAll(reads, r.inputs);
    return r;
  };
  const vals = {};
  for (const [b, us] of Object.entries(kept)) {
    vals[b] = [];
    for (const u of us) for (const s of parsedFor(u, target)) {
      const ed = edits.get(u.unit_id);
      const r = ev1(s, ed ? ed.args : {});
      const id = ed ? `${u.unit_id}<${ed.by.join('+')}` : u.unit_id;
      if (r.not_evaluated) return NE_RESULT(r.not_evaluated, { applied: [id], trace: [...trace, `${id}: ${r.not_evaluated}`, ...r.trace], disclosures, inputs: ins() });
      vals[b].push({ id, unitId: u.unit_id, v: r.value });
      trace.push(`${id} → ${r.value} ${tUnit ?? ''}${r.trace.length ? ` [${r.trace.join(', ')}]` : ''}`.trim());
    }
  }
  const finite = (xs) => xs.filter((x) => typeof x.v === 'number');
  const res = {};
  for (const [b, xs] of Object.entries(vals)) {
    if (b === 'exact') {
      const d = [...new Set(xs.map((x) => String(x.v)))].sort(cmpStr);
      if (d.length > 1) return { status: 'conflict', value: null, reason: 'eval_conflict', conflict: `two exact values ${d.join(' vs ')}`, applied: xs.map((x) => x.id), trace: [...trace, 'rule 4a: CONFLICT (two exact values)'], disclosures, inputs: ins() };
      res.exact = xs[0];
    } else {
      const f = finite(xs);
      // only non-finite values (`unlimited` / `unregulated`, M-48 / M-54): no bound; a mix reports `unlimited` (traced;
      // Spec 68 §7.5 rule 4a, M-60: unlimited and unregulated at the same layer → unlimited)
      if (!f.length) { res[b] = xs.find((x) => x.v === 'unlimited') || xs[0]; if (new Set(xs.map((x) => x.v)).size > 1) trace.push('rule 4a: unlimited and unregulated both apply; reported unlimited'); }
      else res[b] = f.reduce((a, c) => ((b === 'min' ? c.v > a.v : c.v < a.v) ? c : a)); // ties: the first in the declared order
      if (f.length && f.length < xs.length) trace.push(`rule 4a: unlimited / unregulated loses to a finite ${b}`);
    }
  }
  // rule 4 provincial restraint (Spec 69 M-55 + note): a provincial unit only restrains a MORE RESTRICTIVE by-law value
  // of its own bound direction, per limits_bylaw; a silent (unregulated / unlimited) by-law stands; never additional
  const applied = Object.values(vals).flat().map((x) => x.id);
  for (const p of prov) {
    const b = LIMITS[p.provincial.limits_bylaw];
    const x = res[b];
    if (p.bound !== b) { trace.push(`rule 4 (M-55): ${p.unit_id} bound ${p.bound} ≠ ${p.provincial.limits_bylaw} (${b}) — not applied`); continue; }
    if (!x) { trace.push(`rule 4 (M-55): ${p.unit_id} not applied — no by-law ${b} for ${target} (never additional)`); continue; }
    let pv = null;
    for (const s of parsedFor(p, target)) {
      const r = ev1(s, {});
      if (r.not_evaluated) return NE_RESULT(r.not_evaluated, { applied: [p.unit_id], trace: [...trace, `${p.unit_id}: ${r.not_evaluated}`], disclosures, inputs: ins() });
      pv = r.value;
    }
    applied.push(p.unit_id);
    const restrains = typeof x.v === 'number' && (b === 'max' ? (pv === 'unlimited' || (typeof pv === 'number' && x.v < pv - EPS)) : (typeof pv === 'number' && x.v > pv + EPS));
    if (restrains) { trace.push(`rule 4 (M-55): ${p.unit_id} (${p.provincial.limits_bylaw} ${pv}) restrains ${x.id} (${x.v}) → ${pv}`); res[b] = { id: p.unit_id, unitId: p.unit_id, v: pv, restrained: x.id }; }
    else trace.push(`rule 4 (M-55): ${x.id} (${x.v}) is not more restrictive than ${p.unit_id} (${pv}) — the by-law stands`);
  }
  if (res.min && res.max && typeof res.min.v === 'number' && typeof res.max.v === 'number' && res.min.v > res.max.v + EPS) {
    return { status: 'conflict', value: null, reason: 'eval_conflict', conflict: `min ${res.min.v} (${res.min.id}) above max ${res.max.v} (${res.max.id})`, applied: [res.min.id, res.max.id], trace: [...trace, 'rule 4a: CONFLICT (min above max)'], disclosures, inputs: ins() };
  }
  const win = res.exact || res.min || res.max;
  const boundOf = res.exact ? 'exact' : res.min ? 'min' : 'max';
  return {
    status: 'value', value: win.v, unit: tUnit, bound: boundOf, winner: win.id,
    ...(win.v === 'unregulated' ? { clause: win.unitId, evidence: { kind: 'clause', clause: win.unitId } } : {}),
    bounds: Object.fromEntries(Object.entries(res).map(([k, x]) => [k, x.v])),
    applied, trace, disclosures, inputs: ins(),
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
  // rulings (e), (d): the same fail-closed lot gate as effective(); a use permission is the target `use_permission`
  // (Spec 69 M-56: a PERMIT / PROHIBIT with no target feeds aspect use_permission)
  const gate = lotGate(lot, 'use_permission', candidates, C);
  if (gate) return { status: 'not_evaluated', reason: gate.reason, winners: [], inputs: gate.inputs, trace: gate.trace };
  const L = { ...lot, building_type: buildingType };
  const trace = []; const reads = new Set(['zone', 'building_type', ...GATE_READS]);
  candidates = sortCandidates(candidates); // declared total order (order-free result)
  const subjects = candidates.filter((u) => u.archetype === 'PERMIT' || u.archetype === 'PROHIBIT');
  const procs = candidates.filter((u) => u.archetype === 'PROCEDURAL' && rankedLayers(u.ranks_layers).length);
  const disapply = candidates.filter((u) => u.archetype === 'DISAPPLY' && (u.displaces || []).some((r) => subjects.some((s) => refMatch(r, s.unit_id))));
  const A = []; const unknown = [];
  const considered = new Set([...subjects, ...procs, ...disapply]);
  for (const u of candidates) {
    if (!considered.has(u)) continue;
    const t = [];
    const a = applies(L, u, C, (name) => effective(L, name, candidates, C, { sorted: true }), reads, t);
    if (t.length) trace.push(`condition ${u.unit_id}: ${t.join(', ')} → ${a.ok === true ? 'applies' : a.ok === false ? `not applicable (${a.why})` : `undecided (${a.reason})`}`);
    if (a.ok === null) unknown.push({ u, reason: a.reason });
    if (a.ok) A.push(u);
  }
  const inputs = () => [...reads].sort(cmpStr);
  if (unknown.length) { const reason = pickReason(unknown.map((x) => x.reason)); return { status: 'not_evaluated', reason, winners: [], inputs: inputs(), trace: [...trace, ...unknown.map((x) => `applicability unknown: ${x.u.unit_id} (${x.reason})`)] }; }
  const immune = new Map(); const dropped = new Set();
  for (const u of A) for (const ref of u.displaces || []) {
    for (const p of procs) if (A.includes(p) && refMatch(ref, p.unit_id) === 'full') {
      const top = Math.max(...rankedLayers(p.ranks_layers).map((l) => LAYER_RANK[l] ?? 0));
      immune.set(u.unit_id, Math.max(immune.get(u.unit_id) ?? -1, top + 0.5)); trace.push(`rule 3: ${u.unit_id} displaces ${p.unit_id}`);
    }
    for (const v of A) if (v !== u && v.archetype !== 'PROCEDURAL' && refMatch(ref, v.unit_id) === 'full') { dropped.add(v.unit_id); trace.push(`rule 2: ${u.unit_id} drops ${v.unit_id}`); }
  }
  const T = A.filter((u) => (u.archetype === 'PERMIT' || u.archetype === 'PROHIBIT') && !dropped.has(u.unit_id));
  if (!T.length) return { status: 'not_evaluated', reason: 'no_candidate', winners: [], inputs: inputs(), trace: [...trace, `rule 7: no PERMIT/PROHIBIT unit for ${buildingType}`] };
  const rank = (u) => Math.max(LAYER_RANK[u.layer] ?? 0, immune.get(u.unit_id) ?? -1);
  const top = Math.max(...T.map(rank));
  const win = T.filter((u) => rank(u) === top);
  trace.push(`rule 4: rank ${top}: ${win.map((u) => `${u.unit_id} ${u.archetype}`).join(', ')}`);
  const kinds = new Set(win.map((u) => u.archetype));
  // PERMIT vs PROHIBIT at the same rank (operator ruling (a) 2026-10-07, Spec 69 M-60 note): PROHIBIT wins — never show a
  // permission the law may forbid; both clauses are named in the trace and the result goes to the M-29 expert sample
  if (kinds.size > 1) {
    const ids = (k) => win.filter((u) => u.archetype === k).map((u) => u.unit_id);
    return { status: 'prohibited', winners: ids('PROHIBIT'), overruled_permits: ids('PERMIT'), ruling: 'prohibit_over_permit_same_rank', expert_sample: true, inputs: inputs(),
      trace: [...trace, `ruling (a): PERMIT ${ids('PERMIT').join(', ')} and PROHIBIT ${ids('PROHIBIT').join(', ')} at the same rank — PROHIBIT wins (never show a permission the law may forbid); M-29 expert sample`] };
  }
  return { status: kinds.has('PERMIT') ? 'permitted' : 'prohibited', winners: win.map((u) => u.unit_id), inputs: inputs(), trace };
}

// ---------------------------------------------------------------- provincial units (external.json → candidates)
const PROV_SCOPE_KEYS = Object.freeze(['ancillary_units', 'building_type', 'house_units', 'land']);
/**
 * Spec 68 §6.1 / Spec 69 M-55: every provincial unit of an `active` external.json row as a layer-`provincial`
 * candidate. Its scope is resolved to lot inputs ONLY through vocab.provincial_scope (land → a lot flag; each
 * provincial building type → the by-law types it names, e.g. rowhouse → townhouse; house / ancillary unit counts →
 * lot vars). Anything the vocab does not map is a violation, never assumed. PURE.
 * Returns {units, violations}.
 */
export function provincialUnits(external, vocab) {
  const units = []; const violations = [];
  const map = vocab && vocab.provincial_scope;
  if (!map || typeof map !== 'object') return { units, violations: ['provincial_scope_missing: vocab.provincial_scope is not declared'] };
  for (const k of PROV_SCOPE_KEYS) if (map[k] === undefined) violations.push(`provincial_scope_missing: vocab.provincial_scope.${k}`);
  const types = (vocab.building_type && typeof vocab.building_type === 'object') ? vocab.building_type : {};
  const lotConditions = vocab.lot_condition || {}; const inputs = vocab.dsl_input || {};
  const entries = [...((external && external.entries) || [])].sort((a, b) => cmpStr(String(a.id), String(b.id)));
  for (const e of entries) {
    if (e.precedence !== 'active') continue;
    for (const pu of e.provincial_units || []) {
      const id = `${e.id} ${pu.unit_id}`;
      const sc = pu.scope || {};
      const bad = [];
      if (LIMITS[pu.limits_bylaw] !== pu.bound) bad.push(`limits_bylaw ${pu.limits_bylaw} needs bound ${LIMITS[pu.limits_bylaw]}`);
      const land = map.land && map.land[sc.land];
      if (!land || !land.flag) bad.push(`land ${sc.land} unmapped`);
      else if (!Object.hasOwn(lotConditions, land.flag)) bad.push(`land flag ${land.flag} is not a vocab.lot_condition`);
      else bad.push(...landDefaultProblems(land, sc.land));
      const bts = []; const conds = [];
      for (const t of sc.principal_building_types || []) {
        const m = map.building_type && map.building_type[t];
        if (!Array.isArray(m) || !m.length) { bad.push(`provincial building type ${t} unmapped`); continue; }
        for (const x of m) {
          if (typeof x !== 'string') { const c = conditionalType(x, t, types, bad); if (c) conds.push(c); continue; }
          if (!Object.hasOwn(types, x)) bad.push(`provincial building type ${t} maps to ${x}, not a vocab.building_type`); else bts.push(x);
        }
      }
      for (const k of ['house_units', 'ancillary_units']) if (!map[k] || !Object.hasOwn(inputs, map[k])) bad.push(`${k} input ${map[k]} is not a vocab.dsl_input`);
      if (!['parcel', 'building_pair'].includes(sc.applies_to)) bad.push(`applies_to ${sc.applies_to}`);
      const tgt = vocab.dsl_target && vocab.dsl_target[pu.target];
      if (!tgt) bad.push(`target ${pu.target} is not a vocab.dsl_target`);
      else if (typeof pu.value === 'number' && pu.unit !== tgt.unit) bad.push(`unit ${pu.unit} ≠ target unit ${tgt.unit}`);
      if (!Array.isArray(sc.principal_building_types) || !sc.principal_building_types.length) bad.push('principal_building_types empty');
      if (!Array.isArray(sc.unit_configurations) || !sc.unit_configurations.length) bad.push('unit_configurations empty');
      else for (const c of sc.unit_configurations) {
        const ints = (xs) => Array.isArray(xs) && xs.length > 0 && xs.every((n) => Number.isInteger(n) && n >= 0);
        if (!c || !ints(c.house_units) || !ints(c.ancillary_units)) bad.push(`unit_configuration ${JSON.stringify(c)} needs non-empty integer house_units and ancillary_units`);
      }
      const lit = typeof pu.value === 'number' ? `${pu.value} ${pu.unit}` : pu.value === 'unlimited' ? 'unlimited' : null;
      if (lit === null) bad.push(`value ${JSON.stringify(pu.value)}`);
      if (bad.length) { violations.push(`provincial_unit_unmapped: ${id}: ${bad.join('; ')}`); continue; }
      units.push({
        unit_id: pu.unit_id, regulation_id: pu.unit_id, layer: 'provincial', archetype: 'LIMIT', target: pu.target, bound: pu.bound,
        numeric_expression: [`${pu.target} = ${lit} @prov`], application: { zones: ['any'], building_types: ['any'] },
        applies_to: { part: 'whole', refs: [] }, condition: 'none', displaces: [], ranks_layers: 'none',
        provincial: {
          row: e.id, citation: pu.citation, limits_bylaw: pu.limits_bylaw, direction_basis: pu.direction_basis, bylaw_prevails_citation: pu.bylaw_prevails_citation,
          applies_to: sc.applies_to, land_flag: land.flag, building_types: [...new Set(bts)].sort(cmpStr),
          land_default: typeof land.default === 'boolean' ? land.default : null,
          land_exclusions: (land.exclusions || []).map((x) => String(x.parcel_id)).sort(cmpStr),
          conditional_types: [...new Map(conds.map((c) => [c.type, c])).values()].sort((a, b) => cmpStr(a.type, b.type)),
          house_var: map.house_units, ancillary_var: map.ancillary_units,
          unit_configurations: sc.unit_configurations.map((c) => ({ house_units: [...c.house_units], ancillary_units: [...c.ancillary_units] })),
        },
      });
    }
  }
  return { units, violations };
}

const COND_KEYS = Object.freeze(['children', 'citations', 'evidence', 'expert_sample', 'max_lot_units', 'type']);
const EVIDENCE_CLASSES = Object.freeze(['measured', 'inferred', 'declared']);
/**
 * A conditional provincial building-type mapping (operator ruling (b) 2026-10-07, Spec 69 M-55 note): a 569-2013 type
 * (and the listed child types) counts as the provincial type only while the lot's residential units (house +
 * ancillary) are at most max_lot_units. Data with its evidence class, citations and the M-29 flag; anything else is a
 * violation, never assumed. → the normalized entry, or null (problems pushed to `bad`).
 */
function conditionalType(x, provType, types, bad) {
  const where = `provincial building type ${provType} conditional entry`;
  if (!x || typeof x !== 'object' || Array.isArray(x)) { bad.push(`${where} ${JSON.stringify(x)} is not an object`); return null; }
  const keys = Object.keys(x).sort(cmpStr);
  if (stableJson(keys) !== stableJson(COND_KEYS)) { bad.push(`${where} keys ${keys.join(',')} ≠ ${COND_KEYS.join(',')}`); return null; }
  const n = bad.length;
  if (!Object.hasOwn(types, x.type)) bad.push(`${where} type ${x.type} is not a vocab.building_type`);
  if (!Number.isInteger(x.max_lot_units) || x.max_lot_units < 1) bad.push(`${where} max_lot_units ${JSON.stringify(x.max_lot_units)} is not a positive integer`);
  if (!Array.isArray(x.children)) bad.push(`${where} children is not a list`);
  else for (const c of x.children) if (!types[c] || types[c].parent !== x.type) bad.push(`${where} child ${c} is not a vocab.building_type whose parent is ${x.type}`);
  if (!EVIDENCE_CLASSES.includes(x.evidence) || x.expert_sample !== true) bad.push(`${where} needs evidence ∈ ${EVIDENCE_CLASSES.join(' · ')} and expert_sample true`);
  if (!Array.isArray(x.citations) || !x.citations.length || !x.citations.every((c) => typeof c === 'string' && c.trim())) bad.push(`${where} citations empty`);
  if (bad.length > n) return null;
  return { type: x.type, children: [...x.children].sort(cmpStr), max_lot_units: x.max_lot_units, provincial_type: provType, evidence: x.evidence, expert_sample: true };
}

/**
 * The land entry's declared default (operator ruling (c) 2026-10-07, Spec 69 M-55 note): `default` boolean with its
 * evidence + citation, and `exclusions` [{parcel_id, address, value: 'unknown', permits}] (unique, sorted). → problems.
 */
function landDefaultProblems(land, name) {
  const p = [];
  if (land.default === undefined) return [`land ${name} has no declared default (ruling (c) 2026-10-07: an explicit lot input, else the declared default)`];
  if (typeof land.default !== 'boolean') p.push(`land ${name} default ${JSON.stringify(land.default)} is not a boolean`);
  if (!EVIDENCE_CLASSES.includes(land.evidence) || typeof land.citation !== 'string' || !land.citation.trim()) p.push(`land ${name} default needs evidence ∈ ${EVIDENCE_CLASSES.join(' · ')} and a citation`);
  const ex = land.exclusions || [];
  if (!Array.isArray(ex)) return [...p, `land ${name} exclusions is not a list`];
  const ids = ex.map((x) => String(x && x.parcel_id));
  for (const x of ex) if (!x || !/^\d+$/.test(String(x.parcel_id)) || x.value !== 'unknown' || typeof x.address !== 'string' || !Array.isArray(x.permits) || !x.permits.length) p.push(`land ${name} exclusion ${JSON.stringify(x && x.parcel_id)} needs {parcel_id (digits), address, value: unknown, permits[]}`);
  if (stableJson(ids) !== stableJson([...new Set(ids)].sort(cmpStr))) p.push(`land ${name} exclusions are not unique and sorted by parcel_id`);
  return p;
}

// ---------------------------------------------------------------- absence rulings (rule 7a) — verified against the page
const foldText = (s) => String(s).toLowerCase().replace(/\s+/g, ' ');
const ABS_KEYS = Object.freeze(['absent_phrases', 'accounted_occurrences', 'checked_page', 'evidence_kind', 'expert_sample', 'id', 'occurrence_patterns', 'present_phrases', 'ruling', 'statement', 'target', 'zone']);
/**
 * One absence ruling against its pinned page text (case-insensitive, whitespace-folded). Structural: EVERY occurrence
 * of every occurrence pattern (which must cover the target's vocab licensing patterns) lies inside a declared
 * accounted occurrence; so a new clause naming the target, in any case or wording that uses the pattern, fails.
 * Absent phrases never occur; present phrases occur. PURE. → {pass, violations}
 */
export function verifyAbsence(ruling, pageText, vocab) {
  const v = []; const id = ruling && ruling.id;
  if (!ruling || typeof ruling !== 'object') return { pass: false, violations: ['absence_malformed: not an object'] };
  for (const k of ABS_KEYS) if (ruling[k] === undefined) v.push(`absence_malformed: ${id} missing ${k}`);
  for (const k of Object.keys(ruling)) if (!ABS_KEYS.includes(k)) v.push(`absence_malformed: ${id} unknown key ${k}`);
  if (v.length) return { pass: false, violations: v };
  if (!/^ABS-\d+$/.test(id)) v.push(`absence_malformed: ${id} id must be ABS-<n>`);
  if (ruling.evidence_kind !== 'absence' || ruling.expert_sample !== true) v.push(`absence_malformed: ${id} evidence_kind absence + expert_sample true`);
  if (vocab && !(vocab.zone || []).includes(ruling.zone)) v.push(`absence_malformed: ${id} zone ${ruling.zone}`);
  const tgt = vocab && vocab.dsl_target && vocab.dsl_target[ruling.target];
  if (!tgt) v.push(`absence_malformed: ${id} target ${ruling.target} is not a vocab.dsl_target`);
  if (typeof pageText !== 'string' || !pageText.length) return { pass: false, violations: [...v, `absence_page_missing: ${id} ${ruling.checked_page}`] };
  const page = foldText(pageText);
  const pats = (ruling.occurrence_patterns || []).map(foldText).filter(Boolean);
  if (!pats.length) v.push(`absence_malformed: ${id} occurrence_patterns empty`);
  for (const lp of (tgt && tgt.patterns) || []) if (!pats.some((p) => foldText(lp).includes(p))) v.push(`absence_pattern_uncovered: ${id} target pattern "${lp}" contains no occurrence pattern`);
  for (const a of ruling.absent_phrases || []) if (page.includes(foldText(a))) v.push(`absence_contradicted: ${id} absent phrase "${a}" occurs on ${ruling.checked_page}`);
  for (const p of ruling.present_phrases || []) if (!page.includes(foldText(p))) v.push(`absence_present_missing: ${id} "${p}" not on ${ruling.checked_page}`);
  // spans covered by declared accounted occurrences
  const spans = [];
  for (const acc of ruling.accounted_occurrences || []) {
    const f = foldText(acc);
    let i = page.indexOf(f); let n = 0;
    while (f && i >= 0) { spans.push([i, i + f.length]); n++; i = page.indexOf(f, i + 1); }
    if (!n) v.push(`absence_accounted_missing: ${id} accounted occurrence not on the page: "${acc.slice(0, 80)}"`);
  }
  for (const p of pats) {
    let i = page.indexOf(p);
    while (i >= 0) {
      if (!spans.some(([a, b]) => i >= a && i + p.length <= b)) v.push(`absence_contradicted: ${id} unaccounted "${p}" on ${ruling.checked_page}: "…${page.slice(Math.max(0, i - 60), i + p.length + 60)}…"`);
      i = page.indexOf(p, i + 1);
    }
  }
  return { pass: v.length === 0, violations: v };
}
/** Every ruling executed (no id filter); duplicates fail. pages: {checked_page: text|null}. → {pass, violations, executed} */
export function checkAbsenceRulings({ rulings, pages, vocab }) {
  const v = []; let executed = 0; const seen = new Set();
  for (const r of rulings || []) {
    executed++;
    if (seen.has(r && r.id)) v.push(`absence_malformed: duplicate id ${r.id}`);
    seen.add(r && r.id);
    v.push(...verifyAbsence(r, pages ? pages[r && r.checked_page] : null, vocab).violations);
  }
  const pairs = new Set();
  for (const r of rulings || []) { const k = `${r.zone}|${r.target}`; if (pairs.has(k)) v.push(`absence_malformed: two rulings for ${k}`); pairs.add(k); }
  return { pass: v.length === 0, violations: v, executed };
}

// ---------------------------------------------------------------- threshold tokens (vocab.lot_condition)
function condReads(node, out = new Set()) {
  if (!node || typeof node !== 'object') return out;
  if (node.type === 'var') out.add(node.name);
  if (node.type === 'label' || node.type === 'labelled') out.add('label');
  if (node.type === 'overlay' || node.type === 'mapped') out.add('overlay');
  for (const k of Object.keys(node)) { const x = node[k]; if (Array.isArray(x)) for (const y of x) condReads(y, out); else if (x && typeof x === 'object') condReads(x, out); }
  return out;
}
/**
 * A threshold token's truth comes from the unit's condition.if, so the evaluator never reads it as a lot flag. A token
 * wrongly flagged threshold would silently stop being checked (red-team A18). Rule: a threshold token declares the
 * quantities it summarises (`reads`: dsl_input / dsl_target names, or `label` / `overlay`); a flag token declares
 * none; every unit carrying a threshold token has a condition.if that reads at least one of them. PURE.
 */
export function checkThresholdTokens(vocab, units = []) {
  const v = []; let checked = 0;
  const lc = (vocab && vocab.lot_condition) || {};
  const known = new Set([...Object.keys((vocab && vocab.dsl_input) || {}), ...Object.keys((vocab && vocab.dsl_target) || {}), 'label', 'overlay']);
  for (const t of Object.keys(lc).sort(cmpStr)) {
    checked++;
    const e = lc[t] || {};
    if (e.threshold === true) {
      if (!Array.isArray(e.reads) || !e.reads.length) v.push(`threshold_reads_missing: ${t}`);
      else for (const r of e.reads) if (!known.has(r)) v.push(`threshold_read_unknown: ${t} ${r}`);
    } else if (e.reads !== undefined) v.push(`flag_declares_reads: ${t}`);
  }
  for (const u of units) {
    const toks = tokensOf(u.condition);
    for (const t of toks) {
      const e = lc[t];
      if (!e || e.threshold !== true) continue;
      checked++;
      const cif = u.condition && u.condition !== 'none' ? u.condition.if : null;
      if (!cif || cif === 'none') { v.push(`threshold_without_condition: ${u.unit_id} ${t}`); continue; }
      let c;
      try { c = parseCond(cif); } catch (err) { if (err instanceof DslError) { v.push(`threshold_condition_unparsed: ${u.unit_id} ${t}`); continue; } throw err; }
      const rd = condReads(c);
      if (!(e.reads || []).some((r) => rd.has(r))) v.push(`threshold_not_read: ${u.unit_id} ${t} (condition reads ${[...rd].sort(cmpStr).join(', ') || 'nothing'}; token declares ${(e.reads || []).join(', ')})`);
    }
  }
  return { pass: v.length === 0, violations: v, checked };
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
export function checkEval({ units, vectors, vocab, enactments = {}, absences = [] }) {
  const C = makeContext(vocab, { enactments, absences });
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
  // the fixtures' exceptions are declared authored: ruling (d) blocks every target under an unauthored exception
  const C = makeContext(vocab, { authored: { '900.3.10(254)': 'authored', '900.3.10(5)': 'authored', '900.3.10(1463)': 'authored' } });
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
    E('1', 'loader: INCLUDE expands transitively, a cycle is logged, never looped', () => { const inc = ex({ unit_id: 'X1#SSP(C)', regulation_id: 'X1', exception: 'X1', archetype: 'INCLUDE', include_ref: 'X2', target: 'none', bound: 'none', numeric_expression: 'none' }); const back = ex({ unit_id: 'X2#SSP(B)', regulation_id: 'X2', exception: 'X2', archetype: 'INCLUDE', include_ref: 'X1', target: 'none', bound: 'none', numeric_expression: 'none' }); const lim = ex({ unit_id: 'X2#SSP(A)', regulation_id: 'X2', exception: 'X2', target: 'rear_setback_m', numeric_expression: ['rear_setback_m = 9.0 m @SSP(A)'] }); const L = loadCandidates({ ...lot, exception: 'X1' }, [inc, back, lim]); return `${L.candidates.map((u) => u.unit_id).join(',')}|cycle=${L.log.some((l) => l.includes('cycle'))}|depth=${L.include_depth}`; }, 'X1#SSP(C),X2#SSP(A),X2#SSP(B)|cycle=true|depth=1'),
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
