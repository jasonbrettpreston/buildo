/**
 * SPEC LINK: docs/specs/01-pipeline/134_resolve_bylaws.md §2 (inputs through effective() only), §3 (row shape), §4 (status sets),
 *            §5 (the unauthored-exception gate, written per target), §7 (I1, I3, I4, I9, I10, I13, I14, I15)
 * SPEC LINK: docs/specs/01-pipeline/124a_step_standard_policy_appendix.md R-JA (form C: the lot link row points at its per-target
 *            results through ONE profile key; operator CHAT-69.Q1), R-IN (cell_id, option B), R-IR (classes), R-IT, R-IU
 * Handbook:  Spec 132 §x-rulings.4 (R-JA); Spec 132 §materializer.1 (R-EH: rows computed in JS; the runner owns reads, writes and
 *            transactions); Spec 132 §core.9 (R-W: compute is pure)
 *
 * `resolve_bylaws` (Layer 2), part A of the build: the PURE batch core. parcels rows in, the four tables' rows out
 * (signatures, cells, profiles, lots), through the real evaluator and the committed Layer 1 input
 * (docs/reference/bylaw-layer2-input.json). No fs, pg, env or clock: the caller builds the env once (makeEnv) from files it
 * has read. The compute module (registered at commit ①, R-IX) wraps this as `materializeRows`; nothing here is a runner hook.
 *
 * Where a ruling is still open the PLAIN Spec 134 reading is implemented and marked:
 *   Q-B  the structure row is merged into the cell row (option B keys a cell by structure and target);
 *   Q-C  classes are evaluated per cell and stored in `by_class` (R-IR), class-vector inputs left out of cell_id;
 *   Q-H  `disclosures` is stored on the cell row as ruled (R-IT) although it measures about 2.4 KB per row.
 *
 *   makeEnv({ body, map, scope, vocab, zoneList, versions, hooks? }) → env
 *   materializeBatch(batch, env)  → { rows: { signatures, cells, profiles, lots }, retract, matched }
 *   classLotFor(row, structure, classKey, env) → the class lot of one parcels row
 *   RESULT_COLUMNS → the canonical result columns per table (the write guard and row_sha cover these only)
 */
'use strict';

const rb = require('./bylaw-resolution.js');
const E = require('../analysis/bylaw/evaluate.mjs');
const CC = require('../analysis/bylaw/cell-cache.mjs');

/** Spec 134 §3 / I14: the result columns of each table; chain_run_id, the versions and timestamps are outside every list. */
const RESULT_COLUMNS = Object.freeze({
  signatures: Object.freeze(['signature_id', 'candidates']),
  cells: Object.freeze(['cell_id', 'structure', 'target', 'status', 'reason', 'value', 'value_kind', 'winner_unit_id', 'winner_layer', 'evidence_kind', 'evidence_ref', 'inputs_used', 'losers', 'disclosures', 'signature_id', 'by_class']),
  profiles: Object.freeze(['profile_id', 'pointers']),
  lots: Object.freeze(['parcel_id', 'profile_id', 'lot_gate', 'permitted_by_class', 'inputs_defaulted']),
});
/** The part of a cell result that a class can change (and by_class stores). */
const CLASS_RESULT_FIELDS = Object.freeze(['status', 'reason', 'value', 'value_kind', 'winner_unit_id', 'winner_layer', 'evidence_kind', 'evidence_ref', 'losers', 'disclosures']);
/** Lot gates decided from the parcels row alone, before any candidate is loaded (the exception gate needs the closure). */
const ROW_GATES = Object.freeze(['no_569_2013_zone', 'ambiguous_zone', 'label_unparsed', 'label_exception_mismatch']);

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const sortedUnique = (xs) => [...new Set(xs)].sort(cmp);

/**
 * The env, built once per run from data the caller has read. `hooks` replace the evaluator calls (tests, or a caller that
 * wants its own cache); the defaults are the cell cache over evaluate.mjs effective() and evaluate.mjs permitted().
 */
function makeEnv({ body, map, scope, vocab, zoneList, versions, hooks = {} }) {
  for (const [k, v] of Object.entries({ body, map, scope, vocab, zoneList, versions })) if (v === undefined || v === null) throw new TypeError(`makeEnv: ${k} is missing (a missing input is never defaulted)`);
  const ctx = E.makeContext(body.evaluator_vocab, { enactments: body.enactments, absences: body.absences, authored: body.authored });
  const cache = CC.makeCellCache({ evaluator: E, ctx, maxEntries: 500000, keyInputs: (inputs) => inputs.filter((p) => !rb.UNSET_LOT_INPUTS.includes(p)) });
  const classes = scope.classes;
  if (!Array.isArray(classes) || classes.length === 0) throw new Error('makeEnv: layer2-scope.json declares no classes');
  const classVectors = {};
  for (const c of classes) {
    if (!vocab.scenario_class_units || !vocab.scenario_class_units[c]) throw new Error(`makeEnv: class ${c} is not a vocab scenario_class_units entry`);
    classVectors[c] = vocab.scenario_class_units[c];
  }
  const designDefaults = {};
  const dc = (vocab.design_choice_disclosure && vocab.design_choice_disclosure.default_overrides) || {};
  for (const [k, v] of Object.entries(dc)) if (k !== '$comment' && v && typeof v.taken_as === 'boolean') designDefaults[k] = v.taken_as;
  const isIn = rb.inPopulation(zoneList, vocab.zone);
  return {
    units: body.units, ctx, authored: body.authored, map, scope, classes, classVectors, versions, isIn,
    pairs: rb.scopePairs(scope),
    lotEnv: { vocabZones: vocab.zone, labelLetters: Object.keys(vocab.label_letter), exceptionChapter: vocab.exception_chapter, sentinel: map.exception_number_sentinel, mapAreas: scope.map_areas, designDefaults },
    hooks: {
      evaluate: hooks.evaluate || ((lot, target, candidates) => cache.effective(lot, target, candidates)),
      permitted: hooks.permitted || ((lot, buildingType, candidates) => E.permitted(lot, buildingType, candidates, ctx)),
    },
    state: { candidates: new Map(), permitted: new Map() },
  };
}

/** The candidate set of a lot (rule 1): zone and exception fix it at one table_version (R-IN), so it is memoised on them. */
function candidatesFor(lot, env) {
  const key = `${lot.zone}\u0000${lot.exception}`;
  let hit = env.state.candidates.get(key);
  if (!hit) {
    const { candidates } = E.loadCandidates(lot, env.units);
    hit = { candidates, ids: candidates.map((u) => u.unit_id).sort(cmp), byId: new Map(candidates.map((u) => [u.unit_id, u])) };
    hit.signature_id = rb.signatureId(hit.ids);
    env.state.candidates.set(key, hit);
  }
  return hit;
}

function classLotFor(row, structure, classKey, env) {
  const { lot } = rb.buildLotVector(row, env.lotEnv);
  return rb.classLot(lot, { structure, classKey, vector: env.classVectors[classKey] });
}

/** An effective() result as the stored columns (Spec 134 §3; R-IO, R-IP): the Layer 2 status, value, winner and evidence. */
function normalizeResult(r, cand, env) {
  const { status, reason } = rb.layer2Status(r, env.map);
  let value = null;
  let valueKind = null;
  if (status === 'applies') {
    valueKind = rb.valueKindOf(r.value);
    value = valueKind === 'number' ? r.value : null;
  }
  const winnerId = status === 'applies' && r.winner ? (typeof r.winner === 'string' ? r.winner : r.winner.unit_id) : null;
  const unit = winnerId ? cand.byId.get(winnerId) : null;
  const winnerLayer = unit ? unit.layer : null;
  const ev = status === 'applies' ? rb.evidenceOf(r, env.map, { winnerLayer }) : { evidence_kind: null, evidence_ref: null };
  return {
    status, reason, value, value_kind: valueKind, winner_unit_id: winnerId, winner_layer: winnerLayer, evidence_kind: ev.evidence_kind, evidence_ref: ev.evidence_ref,
    losers: (r.losers || []).map((l) => ({ unit_id: l.unit_id, dropped_by: l.dropped_by, by: l.by === undefined ? null : l.by })),
    disclosures: sortedUnique((r.disclosures || []).map((d) => (typeof d === 'string' ? d : JSON.stringify(d)))),
  };
}

function stamp(table, row, env) {
  const full = { ...row };
  full.row_sha = rb.rowSha(full, RESULT_COLUMNS[table]);
  full.table_version = env.versions.table_version;
  full.evaluator_version = env.versions.evaluator_version;
  return full;
}

/** Q-C (plain reading): one cell = the representative class's columns plus by_class for the others (R-IR (iv)). */
function computedCell(base, structure, target, cand, env) {
  const classOrder = env.classes;
  const results = {};
  const reads = new Set();
  const lots = {};
  for (const c of classOrder) {
    lots[c] = rb.classLot(base, { structure, classKey: c, vector: env.classVectors[c] });
    const r = env.hooks.evaluate(lots[c], target, cand.candidates);
    results[c] = normalizeResult(r, cand, env);
    for (const p of r.inputs || []) reads.add(p);
  }
  const inputs = sortedUnique([...reads].filter((p) => !rb.CLASS_INPUT_PATHS.includes(p)));
  const rep = classOrder[0];
  const cellId = rb.cellKey(lots[rep], inputs.filter((p) => !rb.UNSET_LOT_INPUTS.includes(p)), { structure, target }).cell_id;
  const collapsed = rb.collapseClasses(classOrder, results);
  const byClass = {};
  for (const c of classOrder.slice(1)) byClass[c] = collapsed[c] !== c ? `collapsed_into:${collapsed[c]}` : Object.fromEntries(CLASS_RESULT_FIELDS.map((f) => [f, results[c][f]]));
  return { cell_id: cellId, structure, target, ...results[rep], inputs_used: inputs, signature_id: cand.signature_id, by_class: byClass };
}

function gatedCell(structure, target, statusTextValue) {
  const reason = statusTextValue.slice('not_evaluated:'.length);
  return {
    cell_id: rb.gatedCellKey({ structure, target }, statusTextValue).cell_id, structure, target, status: 'not_evaluated', reason, value: null, value_kind: null,
    winner_unit_id: null, winner_layer: null, evidence_kind: null, evidence_ref: null, inputs_used: [], losers: [], disclosures: [], signature_id: null, by_class: {},
  };
}

/** permitted()'s own words per class (R-IT); a status the map has no image for throws. */
function permittedWord(p, env) {
  if (!Object.prototype.hasOwnProperty.call(env.map.permission_image, p.status)) throw new Error(`permitted(): status ${JSON.stringify(p.status)} is not in layer2-map.json permission_image`);
  if (p.status === 'permitted') return { status: 'permitted' };
  if (p.status === 'prohibited') return { status: 'prohibited', clause: sortedUnique(p.winners || []).join(',') };
  return { status: 'not_evaluated', reason: String(p.reason) };
}

/** Permission per class with the same read-input memo the cell cache uses: lots that agree on every input permitted() read share a result. */
function permittedCached(lot, buildingType, cand, classKey, env) {
  const memoKey = `${cand.signature_id}\u0000${classKey}`;
  const groups = env.state.permitted.get(memoKey) || [];
  const valuesKey = (inputs) => inputs.map((p) => CC.inputValue(lot, p)).join('\u0001');
  const keyed = (inputs) => { try { return valuesKey(inputs); } catch (e) { if (e instanceof CC.CellCacheError) return null; throw e; } };
  for (const g of groups) {
    const k = keyed(g.inputs);
    if (k !== null && g.byValues.has(k)) return g.byValues.get(k);
  }
  const p = env.hooks.permitted(lot, buildingType, cand.candidates);
  const word = permittedWord(p, env);
  const inputs = sortedUnique((p.inputs || []).filter((x) => !rb.CLASS_INPUT_PATHS.includes(x) && !rb.UNSET_LOT_INPUTS.includes(x) && !String(x).startsWith('target.')));
  const k = keyed(inputs);
  if (k !== null) {
    let group = groups.find((g) => g.inputs.join('\u0000') === inputs.join('\u0000'));
    if (!group) { group = { inputs, byValues: new Map() }; groups.push(group); }
    group.byValues.set(k, word);
    env.state.permitted.set(memoKey, groups);
  }
  return word;
}

function resolveRow(row, env) {
  const { lot, gates, inputs_defaulted: defaulted } = rb.buildLotVector(row, env.lotEnv);
  const fired = [...gates];
  let cand = null;
  let excStatus = null;
  if (!fired.some((g) => ROW_GATES.includes(g))) {
    cand = candidatesFor(lot, env);
    excStatus = rb.exceptionGateStatus(E.exceptionClosure(lot, cand.candidates), env.authored);
    if (excStatus !== null) fired.push('exception_not_authored');
  }
  const gate = rb.firstLotGate(fired, env.map.lot_gate);
  const cells = [];
  const permitted = {};
  let signature = null;
  if (gate !== null) {
    const statusTextValue = gate === 'exception_not_authored' ? excStatus : `not_evaluated:${gate}`;
    for (const p of env.pairs) cells.push(gatedCell(p.structure, p.target, statusTextValue));
    for (const c of env.classes) permitted[c] = { status: 'not_evaluated', reason: statusTextValue.slice('not_evaluated:'.length) };
  } else {
    signature = { signature_id: cand.signature_id, candidates: cand.ids };
    for (const p of env.pairs) cells.push(computedCell(lot, p.structure, p.target, cand, env));
    for (const c of env.classes) {
      const l = rb.classLot(lot, { structure: 'principal', classKey: c, vector: env.classVectors[c] });
      permitted[c] = permittedCached(l, env.classVectors[c].building_type, cand, c, env);
    }
  }
  const entries = cells.map((c) => ({ structure: c.structure, target: c.target, cell_id: c.cell_id }));
  return { cells, signature, entries, gate, permitted, defaulted, parcelId: row.id };
}

function addUnique(map, table, row, key, env) {
  const full = stamp(table, row, env);
  const prior = map.get(row[key]);
  if (prior && prior.row_sha !== full.row_sha) throw new Error(`${table} ${row[key]}: two different rows for one key in a batch (a determinism defect, I15)`);
  if (!prior) map.set(row[key], full);
}

/**
 * The batch core. Splits the batch by the population (R-IU), resolves each in-population parcel (the gate first, then the
 * cells), and returns each table's rows once, in key order, with row_sha and the two versions stamped. `retract` is the
 * parcel ids whose link rows the replace-keys write deletes. `matched` is additive (R-EH (c)).
 */
function materializeBatch(batch, env) {
  const { inside, retract } = rb.splitPopulation(batch, 'id', (row) => env.isIn({ zone: row.zoning_class }));
  const sigs = new Map();
  const cells = new Map();
  const profiles = new Map();
  const lots = new Map();
  const matched = { lots: 0, lots_retracted: retract.length, lots_gated: 0, inputs_defaulted: 0, gated_by_gate: {}, cells_by_status: {}, not_evaluated_by_reason: {} };
  for (const row of inside) {
    const r = resolveRow(row, env);
    if (r.signature) addUnique(sigs, 'signatures', r.signature, 'signature_id', env);
    for (const c of r.cells) addUnique(cells, 'cells', c, 'cell_id', env);
    const profileId = rb.profileKey(r.entries);
    addUnique(profiles, 'profiles', { profile_id: profileId, pointers: rb.packPointers(env.pairs, r.entries) }, 'profile_id', env);
    addUnique(lots, 'lots', { parcel_id: r.parcelId, profile_id: profileId, lot_gate: r.gate, permitted_by_class: r.permitted, inputs_defaulted: r.defaulted }, 'parcel_id', env);
    matched.lots += 1;
    matched.inputs_defaulted += r.defaulted;
    if (r.gate !== null) { matched.lots_gated += 1; matched.gated_by_gate[r.gate] = (matched.gated_by_gate[r.gate] || 0) + 1; }
  }
  for (const c of cells.values()) {
    matched.cells_by_status[c.status] = (matched.cells_by_status[c.status] || 0) + 1;
    if (c.status === 'not_evaluated') {
      const code = String(c.reason).split(':')[0];
      matched.not_evaluated_by_reason[code] = (matched.not_evaluated_by_reason[code] || 0) + 1;
    }
  }
  const ordered = (m) => [...m.entries()].sort((a, b) => cmp(a[0], b[0])).map((e) => e[1]);
  return {
    rows: { signatures: ordered(sigs), cells: ordered(cells), profiles: ordered(profiles), lots: [...lots.values()].sort((a, b) => a.parcel_id - b.parcel_id) },
    retract: [...retract].sort((a, b) => a - b),
    matched,
  };
}

module.exports = { RESULT_COLUMNS, CLASS_RESULT_FIELDS, makeEnv, materializeBatch, classLotFor };
