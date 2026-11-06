// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-72, M-377 (MB-31 Layer 3 step; plan sections 2, 3 E10, 5 "The seam" (M-415))
// MB-31 B9: the ONE generic row runner (contract C5). Pure over parsed seed JSON; it never reads a file, env, clock or database.
'use strict';

const catalogueLib = require('./catalogue.js');
const factsLib = require('./neighbour-facts.js');
const l3 = require('../../../analysis/bylaw/evaluate-l3.mjs');
const evaluator = require('../../../analysis/bylaw/evaluate.mjs');

const NOT_MODELLED_REASON = 'class not resolved in Phase 2 (MB-27.L2)';
// R3-11 extended (M-465 (6), RC-1; plan-l3-forms.md §2b "Fail closed"): a design_option row of a class Phase 2 stores no option for
const optionNotModelledReason = (cls) => `roof option not resolved for ${cls} (MB-27.L2)`;
// MB-27 R2 (operator "L3-F2 a", "Q-r1 a"): the run of the rows without a design option; every other run is an option value
const BASE_RUN = 'base';
const HOOKS_MISSING = 'expression_error:layer3_hooks_missing';
const CODES = { ok: 0, refuse: 1, unknown: 2 };

function toList(x) {
  return Array.isArray(x) ? x : [];
}

function isObject(x) {
  return !!x && typeof x === 'object' && !Array.isArray(x);
}

function has(o, k) {
  return Object.prototype.hasOwnProperty.call(o || {}, k);
}

function findById(list, id) {
  return toList(list).find((x) => isObject(x) && x.id === id) || null;
}

function unique(list) {
  return [...new Set(toList(list))].sort();
}

/** The effective switch state: the caller's override, else the switchboard's own state, else on. */
function stateOf(id, switchboard, inputs) {
  const given = isObject(inputs.switches) ? inputs.switches[id] : undefined;
  if (given === 'on' || given === 'off') return given;
  const row = findById(isObject(switchboard) ? switchboard.rows : null, id);
  return row && (row.state === 'on' || row.state === 'off') ? row.state : 'on';
}

function effectiveSwitches(switchboard, inputs) {
  const out = {};
  for (const row of toList(isObject(switchboard) ? switchboard.rows : null)) {
    if (isObject(row) && typeof row.id === 'string') out[row.id] = stateOf(row.id, switchboard, inputs);
  }
  for (const [id, state] of Object.entries(isObject(inputs.switches) ? inputs.switches : {})) out[id] = stateOf(id, switchboard, inputs);
  return out;
}

/** Every pair the row reads, in consultation order, plus the switch the evaluator itself consulted. */
function switchesOf(consulted, env) {
  const seen = new Set();
  const out = [];
  const add = (s) => {
    if (!isObject(s) || typeof s.id !== 'string' || seen.has(s.id)) return;
    seen.add(s.id);
    out.push({ id: s.id, state: s.state });
  };
  toList(consulted).forEach(add);
  toList(env ? env.switchesRead : null).forEach(add);
  return out;
}

/**
 * M-481 (Q-CONF a; amends M-378 "every result lists the switches on its path"): the reading switches a row rests on, each
 * with its effective state and the SWITCHBOARD's confidence and evidence (a caller may override a state, never a
 * confidence). They come, in consultation order, from the row's own setting reads (a trace `lv` entry with a guard state,
 * whose guard was consulted and whose declared `switch` is a reading row) and from every catalogue row it reads (that row's own reading entries).
 */
function readingSwitches(env, seeds, state, run) {
  const board = toList(isObject(seeds.switchboard) ? seeds.switchboard.rows : null);
  const rowIds = new Set(toList(env.rowIds));
  const out = [];
  const seen = new Set();
  const add = (s) => {
    if (!isObject(s) || typeof s.id !== 'string' || seen.has(s.id)) return;
    seen.add(s.id);
    out.push(s);
  };
  for (const t of toList(env.trace)) {
    if (!isObject(t)) continue;
    if (t.kind === 'lv' && (typeof t.guard_state === 'string' || t.status === 'applies')) { // the guard was consulted (off, on unfitted, or on)
      const decl = isObject(env.settingDecls) ? env.settingDecls[t.id] : null;
      const sw = isObject(decl) ? findById(board, decl.switch) : null;
      if (sw && sw.kind === 'reading') add({ id: sw.id, state: has(state, sw.id) ? state[sw.id] : t.guard_state, confidence: has(sw, 'confidence') ? sw.confidence : null, evidence: has(sw, 'evidence') ? sw.evidence : null });
    } else if (t.kind === 'row' && rowIds.has(t.id)) {
      const read = run(t.id);
      for (const s of toList(read && read.switches)) {
        const sw = isObject(s) ? findById(board, s.id) : null;
        if (sw && sw.kind === 'reading') add(s);
      }
    }
  }
  return out;
}

/** The switches of a computed row: the evaluator's own (clause switches), then the readings it rests on (M-481). */
function pathSwitches(env, seeds, state, run) {
  const own = switchesOf([], env);
  const ids = new Set(own.map((s) => s.id));
  return [...own, ...readingSwitches(env, seeds, state, run).filter((s) => !ids.has(s.id))];
}

function result(row, status, extra) {
  const e = extra || {};
  return {
    row: row ? row.id : null,
    status,
    value: has(e, 'value') ? e.value : null,
    unit: row ? row.unit : null,
    reason: has(e, 'reason') ? e.reason : null,
    flags: unique(e.flags),
    trace: toList(e.trace),
    switches: toList(e.switches),
    undecided: toList(e.undecided),
    clauses: unique(e.clauses),
  };
}

/** The reasons a permission code cannot decide a row; `statusMap` is the CATALOGUE ROW's own map (contract C5). */
function permissionTerminated(code, gate, p, statusMap) {
  const map = isObject(statusMap) ? statusMap : {};
  const fill = (s, k, v) => (k === undefined && v === undefined ? s : String(s).split(k).join(v));
  if (gate !== undefined && gate !== null && has(map, 'gate')) return fill(map.gate, '{gate}', gate);
  if (code === CODES.ok) return has(map, '0') ? map['0'] : 'permitted';
  if (code === CODES.refuse) return has(map, '1') ? fill(map['1'], '{clause}', p.clause ?? '') : 'not_permitted';
  if (code === CODES.unknown) return has(map, '2') ? fill(map['2'], '{reason}', p.reason || 'no_candidate') : 'not_evaluated:no_candidate';
  return 'not_evaluated:no_candidate';
}

function notModelled(row) {
  return result(row, 'not_modelled', { reason: NOT_MODELLED_REASON });
}

/** `computed 168.0` -> { status: 'computed', reason: null }, `not_evaluated:x` -> { status, reason: 'x' }. */
function splitStatus(text) {
  const s = String(text);
  const at = s.indexOf(':');
  return at < 0 ? { status: s, reason: null } : { status: s.slice(0, at), reason: s.slice(at + 1) };
}

function injectedResult(row, slot, consulted) {
  if (!isObject(slot)) return notEvaluated(row, 'missing_input:absent_target', { switches: consulted });
  const trace = [{ kind: 'row', id: row.id, status: 'injected' }];
  if (typeof slot.value === 'number') {
    return result(row, 'computed', { value: slot.value, trace, switches: consulted, flags: slot.flags });
  }
  return result(row, typeof slot.status === 'string' ? slot.status : 'not_evaluated', {
    value: has(slot, 'value') ? slot.value : null,
    reason: has(slot, 'reason') ? slot.reason : null,
    flags: slot.flags,
    undecided: slot.undecided,
    clauses: slot.clauses,
    trace,
    switches: consulted,
  });
}

function notEvaluated(row, reason, extra) {
  const e = extra || {};
  return result(row, 'not_evaluated', { reason, value: null, undecided: e.undecided, flags: e.flags, trace: e.trace, switches: e.switches, clauses: e.clauses });
}

function shape(value, row, switches, env, flags) {
  const base = { flags, switches, trace: env.trace, undecided: value.undecided };
  switch (value.k) {
    case 'num': return result(row, 'computed', { ...base, value: value.v });
    case 'unlimited': return result(row, 'unlimited', { ...base, clauses: value.clause ? [value.clause] : [] });
    case 'unregulated': return result(row, value.na === true ? 'not_applicable' : 'unregulated', { ...base, clauses: value.clause ? [value.clause] : [] });
    case 'nb': return result(row, 'not_buildable', { ...base, clauses: value.clauses });
    case 'absent': return notEvaluated(row, 'missing_input:absent_target', base);
    default: {
      const map = isObject(row.status_map) ? row.status_map : {};
      const reason = has(map, value.reason) ? map[value.reason] : value.reason;
      return notEvaluated(row, reason, base);
    }
  }
}

/** The catalogue's row unit accepts a count where the row counts storeys or units. */
function unitOk(value, row) {
  if (value.k !== 'num' || value.u === row.unit) return true;
  return value.u === 'count' && (row.unit === 'storeys' || row.unit === 'units');
}

// ── MB-27 R2: per-option runs (plan-reader-and-mech.md 1.4 R2 (3); plan-l3-forms.md §2b; operator "L3-F2 a", "Q-r1 a", "Q-r2 a") ──
//
// One cell set per run: `base` (the rows without an option, M-60) and one per option value of vocab.design_options. A row
// whose `design_option` names X is always evaluated in run X, never its caller's; a row without one is evaluated in the run
// of the row reading it, and reported from the base run (Q-r1 a: no duplicated rows). The memo is keyed by (row, run).

/** The run a row's own `design_option` names ({key: option} -> option), or null for a row without one. */
function designRunOf(row) {
  if (!isObject(row) || !isObject(row.design_option)) return null;
  const values = Object.values(row.design_option);
  return typeof values[0] === 'string' ? values[0] : null;
}

/** The run a row is evaluated in when `callerRun` reads it. */
function runFor(row, callerRun) {
  return designRunOf(row) ?? callerRun;
}

/** The run a row is reported from (Q-r1 a): its own option, else the base run. */
function reportRunOf(row) {
  return designRunOf(row) ?? BASE_RUN;
}

/** The option values the seeds declare (vocab.design_options), each a run beside `base`. */
function declaredRuns(seeds) {
  const decls = isObject(seeds.vocab) && isObject(seeds.vocab.design_options) ? seeds.vocab.design_options : {};
  const out = [BASE_RUN];
  for (const decl of Object.values(decls)) for (const v of toList(isObject(decl) ? decl.values : null)) if (isObject(v) && typeof v.option === 'string') out.push(v.option);
  return out;
}

/** R3-11 extended: the class's Phase 2 rows carry this row's option (layer2-scope.json options.<key>.classes, as seeded). */
function optionListed(row, seeds, cls) {
  // operator "a" on Q-A: fail closed, a design_option row with no declared roof_form scope is not_modelled, never the base cells
  const key = Object.keys(row.design_option)[0];
  const scope = isObject(seeds.layer2Options) ? seeds.layer2Options[key] : null;
  return isObject(scope) && toList(scope.classes).includes(cls);
}

/**
 * The cell set of one run: the base cells, overlaid in an option run with that option's cells (`inputs.l2Options.runs`),
 * plus the cells without an option (`inputs.l2Options.shared`: slot 61, `pitched_roof_slope_min`) in every run.
 */
function cellsOfRun(inputs, run) {
  const base = isObject(inputs.l2) ? inputs.l2 : {};
  const opts = isObject(inputs.l2Options) ? inputs.l2Options : {};
  const overlay = run !== BASE_RUN && isObject(opts.runs) && isObject(opts.runs[run]) ? opts.runs[run] : {};
  const shared = isObject(opts.shared) ? opts.shared : {};
  return { ...base, ...overlay, ...shared };
}

/**
 * The row's input flags in a run: its declared `input_flags`, plus the Phase 2 option-row disclosures of that run
 * (`inputs.l2Options.flags`, ROOF-5 from Layer 2's own withNotAbove) on the key `l2(<target>)`, so readL2 carries them
 * into the value (evaluate-l3.mjs is not edited).
 */
function inputFlagsOfRun(row, inputs, run) {
  const out = {};
  for (const [k, words] of Object.entries(isObject(row.input_flags) ? row.input_flags : {})) out[k] = toList(words).slice();
  const opts = isObject(inputs.l2Options) ? inputs.l2Options : {};
  const words = run !== BASE_RUN && isObject(opts.flags) && isObject(opts.flags[run]) ? opts.flags[run] : {};
  for (const [target, list] of Object.entries(words)) {
    const key = `l2(${target})`;
    out[key] = unique([...toList(out[key]), ...toList(list)]);
  }
  return out;
}

/**
 * §2b lock and the M-400 / M-415 dated notes (2026-11-04): a trace entry carries `run` only on an option run, an absent `run`
 * being the base run (so the increment-1 rows' traces are unchanged); a row read names the run that row ran in.
 */
function withRuns(res, run, seeds) {
  const rows = toList(isObject(seeds.catalogue) ? seeds.catalogue.rows : null);
  const trace = toList(res.trace).map((t) => {
    if (!isObject(t)) return t;
    const r = t.kind === 'row' ? runFor(findById(rows, t.id), run) : run;
    return r === BASE_RUN ? t : { ...t, run: r };
  });
  return { ...res, trace };
}

function l3Env(seeds, row, inputs, state, memo, run, runName) {
  const cat = seeds.catalogue;
  const vocab = isObject(seeds.vocab) ? seeds.vocab : {};
  const targets = isObject(vocab.dsl_target) ? vocab.dsl_target : {};
  const targetUnits = {};
  for (const [id, entry] of Object.entries(targets)) targetUnits[id] = isObject(entry) ? entry.unit : entry;
  const geometryDecls = {};
  for (const g of toList(cat.geometry_inputs)) if (isObject(g)) geometryDecls[g.id] = { unit: g.unit };
  const factDecls = {};
  for (const f of toList(cat.facts)) if (isObject(f)) factDecls[f.id] = f;
  const settingVals = catalogueLib.settingVals(cat, seeds.logicVariables);
  for (const [id, v] of Object.entries(isObject(inputs.settings) ? inputs.settings : {})) settingVals[id] = v;
  const cells = cellsOfRun(inputs, runName);
  let facts = isObject(inputs.facts) ? inputs.facts : null;
  if (!facts && inputs.neighbours !== undefined) {
    facts = factsLib.neighbourFacts(inputs.neighbours, cells.averaging_distance_m).facts;
  }
  return l3.makeL3Env({
    cells,
    targetUnits,
    optionalTargets: toList(row.optional_targets),
    settingDecls: catalogueLib.settingDecls(cat, seeds.logicVariables),
    settingVals,
    switches: state,
    geometryDecls,
    factDecls,
    geometry: isObject(inputs.geometry) ? inputs.geometry : {},
    facts: facts || {},
    lotFlags: isObject(inputs.flags) ? inputs.flags : {},
    rowIds: toList(cat.rows).map((r) => r.id),
    readRow: (id) => toValue(run(id)),
    inputFlags: inputFlagsOfRun(row, inputs, runName),
    // the evaluator contract (evaluate-l3.mjs compare, bestOf, applyInt): "Both values are rounded at 9 places first"
    round9: (x) => Math.round(x * 1e9) / 1e9,
    eps: 0,
  });
}

/**
 * M-476 (MB-27 increment 2): the formula a row runs. A row whose later increment revised it carries the revision in
 * `revisions`, each behind its own switch; the latest revision whose switch is on is read, and a switched-off revision
 * reverts to the formula before it (the increment-1 formula last). Every revision switch consulted is listed.
 */
function activeFormula(row, inputs, seeds) {
  const revs = toList(row.revisions).filter(isObject).slice().sort((a, b) => String(b.increment).localeCompare(String(a.increment), 'en', { numeric: true }));
  const consulted = [];
  for (const rev of revs) {
    const s = { id: rev.switch, state: stateOf(rev.switch, seeds.switchboard, inputs) };
    consulted.push(s);
    if (s.state === 'on') {
      const formula = { ...row, expression: rev.expression, optional_targets: rev.optional_targets ?? row.optional_targets, input_flags: rev.input_flags ?? row.input_flags, clauses: rev.clauses ?? row.clauses };
      return { formula, consulted };
    }
  }
  return { formula: row, consulted };
}

function exprResult(row, inputs, state, memo, runIn, revisionSwitches, runName) {
  // a row read is evaluated in the run its own design_option names, else in this row's run (Q-r1 a)
  const catRows = toList(inputs.seeds.catalogue.rows);
  const run = (id) => runIn(id, runFor(findById(catRows, id), runName));
  const env = l3Env(inputs.seeds, row, inputs, state, memo, run, runName);
  for (const s of toList(revisionSwitches)) env.switchesRead.push(s);
  const res = evaluator.evaluate(row.expression, {}, { layer: 'l3', l3: env });
  const v = res ? res.l3 : undefined;
  if (!v || typeof v.k !== 'string') return notEvaluated(row, HOOKS_MISSING, { trace: env.trace, switches: switchesOf([], env) });
  const flags = v.flags;
  const switched = pathSwitches(env, inputs.seeds, state, run); // M-481: the readings it rests on, with their confidence
  if (row.envelope === true && v.k === 'num' && v.v <= 0) {
    const read = env.trace.filter((t) => t && t.kind === 'l2' && typeof t.clause === 'string').map((t) => t.clause);
    return result(row, 'not_buildable', { clauses: [...read, ...toList(row.clauses)], switches: switched, trace: env.trace, flags });
  }
  if (row.terminal === 'refuse' && (v.k === 'unlimited' || v.k === 'unregulated')) {
    return notEvaluated(row, 'terminal_not_allowed', { switches: switched, trace: env.trace, flags });
  }
  if (!unitOk(v, row)) return notEvaluated(row, 'expression_error:unit_mismatch', { switches: switched, trace: env.trace, flags });
  return shape(v, row, switched, env, flags);
}

/** One row's result in one run, given the run function of the call's own memo (keyed by (row, run)). */
function computeRow(row, inputs, runAll, runName) {
  const seeds = isObject(inputs.seeds) ? inputs.seeds : null;
  if (!seeds) throw new Error('runRow: inputs.seeds is required');
  return withRuns(computeRowIn(row, inputs, runAll, runName), runName, seeds);
}

function computeRowIn(row, inputs, runAll, runName) {
  const seeds = isObject(inputs.seeds) ? inputs.seeds : null;
  if (!seeds) throw new Error('runRow: inputs.seeds is required');
  const buildingTypeId = inputs.buildingType || 'detached_house';
  const buildingType = findById(isObject(seeds.buildingTypes) ? seeds.buildingTypes.rows : null, buildingTypeId);
  if (!buildingType) throw new Error(`runRow: unknown building type ${buildingTypeId}`);
  if (!toList(seeds.layer2Classes).includes(buildingType.class)) return notModelled(row);

  const state = effectiveSwitches(seeds.switchboard, inputs);
  const consulted = [];
  for (const id of [row.switch, buildingType.switch]) {
    if (typeof id !== 'string') continue;
    const s = { id, state: stateOf(id, seeds.switchboard, inputs) };
    if (!consulted.some((c) => c.id === s.id)) consulted.push(s);
  }
  const off = consulted.find((s) => s.state === 'off');
  if (off) return notEvaluated(row, `switched_off:${off.id}`, { switches: consulted });

  if (isObject(inputs.rows) && has(inputs.rows, row.id)) return injectedResult(row, inputs.rows[row.id], consulted);
  // R3-11 extended: an injected row (the M-415 seam) reads no cell; every other design_option row of an unlisted class is refused here
  if (designRunOf(row) !== null && !optionListed(row, seeds, buildingType.class)) return result(row, 'not_modelled', { reason: optionNotModelledReason(buildingType.class) });

  if (row.form === 'status') {
    const p = isObject(inputs.perm) ? inputs.perm : {};
    const code = typeof p.code === 'number' ? p.code : CODES.unknown;
    const trace = [{ kind: 'permission', code, gate: p.gate ?? null }];
    const split = splitStatus(permissionTerminated(code, p.gate, p, row.status_map));
    return result(row, split.status, { reason: split.reason, trace, switches: consulted });
  }

  if (row.form !== 'expr' || typeof row.expression !== 'string') return notEvaluated(row, HOOKS_MISSING, { switches: consulted });
  const active = activeFormula(row, inputs, seeds);
  return exprResult(active.formula, inputs, state, null, runAll, active.consulted, runName);
}

function toValue(r) {
  const flags = toList(r && r.flags);
  switch (r ? r.status : null) {
    case 'computed': return { k: 'num', v: r.value, u: r.unit, flags };
    case 'unlimited': return { k: 'unlimited', clause: toList(r.clauses)[0] ?? null, flags };
    case 'unregulated': return { k: 'unregulated', clause: toList(r.clauses)[0] ?? null, flags };
    case 'not_applicable': return { k: 'unregulated', clause: toList(r.clauses)[0] ?? null, flags, na: true };
    case 'not_buildable': return { k: 'nb', clauses: toList(r.clauses), flags };
    default: return { k: 'ne', reason: r ? r.reason : 'expression_error:unknown_variable', undecided: toList(r && r.undecided), flags };
  }
}

/** One runner over one call's inputs: the memo is keyed by (row, run) (MB-27 R2, plan-l3-forms.md §2b). */
function makeRunner(inputs) {
  const seeds = isObject(inputs.seeds) ? inputs.seeds : null;
  if (!seeds) throw new Error('runRow: inputs.seeds is required');
  const memo = new Map();
  const run = (id, runName) => {
    const key = `${id}\u0000${runName}`;
    if (!memo.has(key)) {
      const row = findById(isObject(seeds.catalogue) ? seeds.catalogue.rows : null, id);
      if (!row) throw new Error(`runRow: unknown row ${id}`);
      memo.set(key, computeRow(row, inputs, run, runName));
    }
    return memo.get(key);
  };
  return { seeds, run };
}

/** One row of one building type (M-415): the seam every Layer 3 consumer reads; reported from its own run (Q-r1 a). */
function runRow(rowId, inputsIn) {
  const inputs = isObject(inputsIn) ? inputsIn : {};
  const { seeds, run } = makeRunner(inputs);
  const row = findById(isObject(seeds.catalogue) ? seeds.catalogue.rows : null, rowId);
  if (!row) throw new Error(`runRow: unknown row ${rowId}`);
  return run(rowId, reportRunOf(row));
}

/**
 * One row evaluated in a named run (`base` or an option value): the per-run answer of a row without a design option
 * (Q-r1 a: what a reading row in that run sees; only Phase 3 compares options, M-400). A row with a design option is always
 * evaluated in its own run, whatever run is named. An undeclared run throws.
 */
function runRowIn(rowId, runName, inputsIn) {
  const inputs = isObject(inputsIn) ? inputsIn : {};
  const { seeds, run } = makeRunner(inputs);
  if (!declaredRuns(seeds).includes(runName)) throw new Error(`runRowIn: unknown run ${runName}`);
  const row = findById(isObject(seeds.catalogue) ? seeds.catalogue.rows : null, rowId);
  if (!row) throw new Error(`runRow: unknown row ${rowId}`);
  return run(rowId, runFor(row, runName));
}

/** Every catalogue row of one building type, in dependency order, over one shared memo; each from its own report run. */
function runAllRows(inputsIn) {
  const inputs = isObject(inputsIn) ? inputsIn : {};
  const { seeds, run } = makeRunner(inputs);
  const buildingTypeId = inputs.buildingType || 'detached_house';
  const buildingType = findById(isObject(seeds.buildingTypes) ? seeds.buildingTypes.rows : null, buildingTypeId);
  if (!buildingType) throw new Error(`runRow: unknown building type ${buildingTypeId}`);
  const rows = toList(seeds.catalogue.rows);
  const mine = new Set(rows.filter((r) => r.building_type === buildingType.id).map((r) => r.id));
  // M-476 dated note (D3 a): a switched-off row that has no increment-1 formula is not shown; rows that read it still do
  // (only the row whose OWN switch is off; a row that reads it is shown, not_evaluated with that switch as its reason)
  const later = new Map(rows.filter((r) => isObject(r) && r.increment !== '1').map((r) => [r.id, r.switch]));
  return catalogueLib.topoOrder(seeds.catalogue)
    .filter((id) => mine.has(id))
    .map((id) => run(id, reportRunOf(findById(rows, id))))
    .filter((res) => !(later.has(res.row) && res.status === 'not_evaluated' && res.reason === `switched_off:${later.get(res.row)}`));
}

module.exports = { runRow, runRowIn, runAllRows, toValue, cellsOfRun, NOT_MODELLED_REASON, BASE_RUN };
