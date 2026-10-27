/**
 * SPEC LINK: docs/specs/01-pipeline/134_resolve_bylaws.md §2 (inputs through effective() only), §3 (row shape), §4 (status sets),
 *            §5 (the unauthored-exception gate, written per target), §7 (I1, I3, I4, I9, I10, I13, I14, I15)
 * SPEC LINK: docs/specs/01-pipeline/124a_step_standard_policy_appendix.md R-IN (cell identity), R-IR (classes), R-IT, R-IU (population)
 * Handbook:  Spec 132 §materializer.1 (R-EH: rows computed in JS; the runner owns reads, writes and transactions); Spec 132 §core.9 (R-W: compute is pure)
 * Operator:  CHAT-80.QP (option 4): ONE row per lot with the results as positional arrays in layer2-scope.json pair order, plus two closed dictionary
 *            tables (unit ids; reason and evidence-ref texts). Profiles, cells, signatures and json/disclosure sets are gone. `losers`, `inputs_used`
 *            and `disclosures` are not stored: they are recomputed on read through the uncached evaluator (traceResult). CHAT-77.freeze: the
 *            logical row stays the same 11 fields (logicalRowsOf).
 *
 * `resolve_bylaws` (Layer 2): the PURE batch core. parcels rows in, the three tables' rows out (units, texts, lots), through the real evaluator
 * and the committed Layer 1 input (docs/reference/bylaw-layer2-input.json). No fs, pg, env or clock: the caller builds the env once (makeEnv).
 *
 *   makeEnv({ body, map, scope, vocab, zoneList, versions, hooks?, audit? }) -> env
 *   seedDictionaries(env, { units, texts })           the stored dictionary rows (collision detection against them)
 *   materializeBatch(batch, env)  -> { rows: { units, texts, lots }, retract, matched }
 *   logicalRowsOf(parcelRow, storedLot, dicts, env)   -> { lot_gate, permission_disclosures, permitted_by_class, rows }: the frozen 11-field
 *                                                        logical rows, plus the M-169 permission disclosures recomputed on read (CHAT-180)
 *   traceResult(lot, structure, target, classKey, env) -> the recomputed fields of ONE result
 *   classLotFor(row, structure, classKey, env)
 */
'use strict';

const rb = require('./bylaw-resolution.js');
const lr = require('./bylaw-lot-row.js');
const E = require('../analysis/bylaw/evaluate.mjs');
const CC = require('../analysis/bylaw/cell-cache.mjs');

/** Spec 134 §3 / I14: the result columns of each table. The lot row_sha covers these; chain_run_id, the versions and timestamps are outside. */
const RESULT_COLUMNS = Object.freeze({
  units: Object.freeze(['unit_key', 'unit_id', 'regulation_id', 'layer']),
  texts: Object.freeze(['text_key', 'text']),
  lots: Object.freeze(['parcel_id', 'lot_gate', 'codes', 'numbers', 'reason_ids', 'winner_ids', 'evidence_kinds', 'evidence_ref_ids', 'class_results', 'permitted', 'permitted_text_ids', 'inputs_defaulted']),
});
/** Which result columns are jsonb (rendered as their Postgres ::text in the canonical text, Q-I). */
const COLUMN_KINDS = Object.freeze({
  units: Object.freeze({}),
  texts: Object.freeze({}),
  lots: Object.freeze({ class_results: 'jsonb' }),
});
/** The SQL type of each result column: how the I14 recompute renders it (Q-I). Locked against RESULT_COLUMNS and the emitted JS values. */
const COLUMN_SQL = Object.freeze({
  units: Object.freeze({ unit_key: 'int', unit_id: 'text', regulation_id: 'text', layer: 'text' }),
  texts: Object.freeze({ text_key: 'int', text: 'text' }),
  lots: Object.freeze({
    parcel_id: 'int', lot_gate: 'text', codes: 'array', numbers: 'array', reason_ids: 'array', winner_ids: 'array', evidence_kinds: 'array', evidence_ref_ids: 'array',
    class_results: 'jsonb', permitted: 'array', permitted_text_ids: 'array', inputs_defaulted: 'int',
  }),
});
const SQL_RENDER = Object.freeze({
  text: (c) => `coalesce(${c}::text, '')`,
  int: (c) => `coalesce(${c}::text, '')`,
  jsonb: (c) => `coalesce(${c}::text, '')`,
  array: (c) => `coalesce(array_to_string(${c}, chr(30), ''), '')`,
});
/**
 * Spec 134 I14 (Q-I): scalar counts of rows whose stored identity differs from the one recomputed in SQL: the lot rows' row_sha (canonical text of
 * RESULT_COLUMNS.lots, columns joined by chr(31)) and both dictionaries' keys (hash32 of the content: the first four bytes of its sha256).
 * @param {Record<string, string>} tables logical name -> table name
 * @returns {string[]} the statements in units, texts, lots order
 */
function rowShaMismatchSql(tables) {
  const hash = (col) => `('x' || encode(substring(sha256(convert_to(${col}, 'UTF8')) FROM 1 FOR 4), 'hex'))::bit(32)::int`;
  const text = RESULT_COLUMNS.lots.map((c) => SQL_RENDER[COLUMN_SQL.lots[c]](c)).join(' || chr(31) || ');
  return [
    `SELECT COUNT(*)::int FROM ${tables.units} WHERE unit_key IS DISTINCT FROM ${hash('unit_id')}`,
    `SELECT COUNT(*)::int FROM ${tables.texts} WHERE text_key IS DISTINCT FROM ${hash('text')}`,
    `SELECT COUNT(*)::int FROM ${tables.lots} WHERE row_sha IS DISTINCT FROM encode(sha256(convert_to(${text}, 'UTF8')), 'hex')`,
  ];
}

/** The stored fields of one result (the part of a logical row the arrays hold). */
const STORED_RESULT_FIELDS = Object.freeze(['status', 'reason', 'value', 'value_kind', 'winner_unit_id', 'winner_layer', 'evidence_kind', 'evidence_ref']);
/** The frozen logical row (CHAT-77.freeze): the stored fields plus the three recomputed on read. Spelled out, not derived. */
const LOGICAL_RESULT_FIELDS = Object.freeze(['status', 'reason', 'value', 'value_kind', 'winner_unit_id', 'winner_layer', 'evidence_kind', 'evidence_ref', 'inputs_used', 'losers', 'disclosures']);
/** Lot gates decided from the parcels row alone, before any candidate is loaded (the exception gate needs the closure). */
const ROW_GATES = Object.freeze(['no_569_2013_zone', 'ambiguous_zone', 'label_unparsed', 'label_exception_mismatch']);

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const sortedUnique = (xs) => [...new Set(xs)].sort(cmp);

/**
 * The env, built once per run from data the caller has read. `hooks` replace the evaluator calls (tests, or a caller that
 * wants its own cache); the defaults are the cell cache over evaluate.mjs effective() and evaluate.mjs permitted().
 */
function makeEnv({ body, map, scope, vocab, zoneList, versions, hooks = {}, audit = null }) {
  for (const [k, v] of Object.entries({ body, map, scope, vocab, zoneList, versions })) if (v === undefined || v === null) throw new TypeError(`makeEnv: ${k} is missing (a missing input is never defaulted)`);
  const ctx = E.makeContext(body.evaluator_vocab, { enactments: body.enactments, absences: body.absences, authored: body.authored });
  // The cell cache keeps its own bound (20,000 cells at ~9 KB): 500,000 overran the 4 GB heap at parcel 36,000 (RB-D8, CHAT-114).
  const cache = CC.makeCellCache({ evaluator: E, ctx, keyInputs: (inputs) => inputs.filter((p) => !rb.UNSET_LOT_INPUTS.includes(p)) });
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
  if (audit !== null) {
    if (!Number.isInteger(audit.everyNth) || audit.everyNth < 1) throw new TypeError('makeEnv: audit.everyNth must be a positive integer');
    if (!Number.isInteger(audit.offset) || audit.offset < 0 || audit.offset >= audit.everyNth) throw new TypeError('makeEnv: audit.offset must be an integer in [0, everyNth)');
  }
  const unitInfo = {};
  for (const u of body.units) unitInfo[u.unit_id] = { regulation_id: u.regulation_id, layer: u.layer };
  return {
    units: body.units, unitInfo, ctx, authored: body.authored, map, scope, classes, classVectors, versions, isIn, audit,
    pairs: rb.scopePairs(scope),
    lotEnv: { vocabZones: vocab.zone, labelLetters: Object.keys(vocab.label_letter), exceptionChapter: vocab.exception_chapter, sentinel: map.exception_number_sentinel, mapAreas: scope.map_areas, designDefaults },
    hooks: {
      evaluate: hooks.evaluate || ((lot, target, candidates) => cache.effective(lot, target, candidates)),
      evaluateDirect: hooks.evaluateDirect || ((lot, target, candidates) => E.effective(lot, target, candidates, ctx)),
      permitted: hooks.permitted || ((lot, buildingType, candidates) => E.permitted(lot, buildingType, candidates, ctx)),
    },
    dict: lr.makeDict(),
    state: { candidates: new Map(), permitted: new Map() },
  };
}

/** The stored dictionary rows, read once per run by the runner's lookup reads; a fresh key that collides with one of them throws. */
function seedDictionaries(env, rows) {
  env.dict.seed({ units: rows.units || [], texts: rows.texts || [] });
}

/** The candidate set of a lot (rule 1): zone and exception fix it at one table_version (R-IN), so it is memoised on them. */
function candidatesFor(lot, env) {
  const key = `${lot.zone}\u0000${lot.exception}`;
  let hit = env.state.candidates.get(key);
  if (!hit) {
    const { candidates } = E.loadCandidates(lot, env.units);
    hit = { key, candidates, byId: new Map(candidates.map((u) => [u.unit_id, u])) };
    env.state.candidates.set(key, hit);
  }
  return hit;
}

function classLotFor(row, structure, classKey, env) {
  const { lot } = rb.buildLotVector(row, env.lotEnv);
  return rb.classLot(lot, { structure, classKey, vector: env.classVectors[classKey] });
}

/** An effective() result as the logical columns (Spec 134 §3; R-IO, R-IP): the eight stored fields and the three recomputed on read. */
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
  // With no single winner (M-60), the cited layer is provincial only when every applied unit is provincial (CHAT-115).
  const applied = !unit && Array.isArray(r.applied) ? r.applied.map((id) => cand.byId.get(id)).filter(Boolean) : [];
  const citedLayer = unit ? winnerLayer : (applied.length && applied.every((u) => u.layer === 'provincial') ? 'provincial' : null);
  const ev = status === 'applies' ? rb.evidenceOf(r, env.map, { winnerLayer: citedLayer }) : { evidence_kind: null, evidence_ref: null };
  const disclosures = sortedUnique((r.disclosures || []).map((d) => (typeof d === 'string' ? d : JSON.stringify(d))));
  const losers = (r.losers || []).map((l) => ({ unit_id: l.unit_id, dropped_by: l.dropped_by, by: l.by === undefined ? null : l.by }));
  const inputs = sortedUnique((r.inputs || []).filter((p) => !rb.CLASS_INPUT_PATHS.includes(p)));
  return {
    status, reason, value, value_kind: valueKind, winner_unit_id: winnerId, winner_layer: winnerLayer, evidence_kind: ev.evidence_kind, evidence_ref: ev.evidence_ref,
    inputs_used: inputs, losers: losers.length ? losers : null, disclosures: disclosures.length ? disclosures : null,
  };
}

const gatedResult = (reason) => ({
  status: 'not_evaluated', reason, value: null, value_kind: null, winner_unit_id: null, winner_layer: null, evidence_kind: null, evidence_ref: null,
  inputs_used: [], losers: null, disclosures: null,
});

/**
 * ON READ (CHAT-80.QP): the full logical result of ONE (class, structure, target), recomputed through the uncached evaluator.
 * `lot` is the lot vector (rb.buildLotVector(...).lot); the candidates come from its zone and exception.
 */
function traceResult(lot, structure, target, classKey, env) {
  const cand = candidatesFor(lot, env);
  const l = rb.classLot(lot, { structure, classKey, vector: env.classVectors[classKey] });
  return normalizeResult(env.hooks.evaluateDirect(l, target, cand.candidates), cand, env);
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
  const memoKey = `${cand.key}\u0000${classKey}`;
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

/**
 * Spec 134 I13 (Q-F): needs_user_input stays legal only for the existing-structure facts and the listed axes; any other axis a class could have
 * enumerated is a scenario axis. The list is the spec's own words (existing_*, current_stories, lawfully_existing_status, roof_type, pool,
 * suite_wall_openings).
 */
const LEGAL_USER_INPUT = Object.freeze(['current_stories', 'lawfully_existing_status', 'roof_type', 'pool', 'suite_wall_openings']);
function isScenarioAxisReason(reason) {
  if (typeof reason !== 'string' || !reason.startsWith('needs_user_input:')) return false;
  const axis = reason.slice('needs_user_input:'.length).split(':')[0];
  return !(axis.startsWith('existing_') || LEGAL_USER_INPUT.includes(axis));
}

const pickStored = (r) => Object.fromEntries(STORED_RESULT_FIELDS.map((f) => [f, r[f]]));
const sameStored = (a, b) => rb.stableJson(pickStored(a)) === rb.stableJson(pickStored(b));
const sameFull = (a, b) => rb.stableJson(Object.fromEntries(LOGICAL_RESULT_FIELDS.map((f) => [f, a[f]]))) === rb.stableJson(Object.fromEntries(LOGICAL_RESULT_FIELDS.map((f) => [f, b[f]])));

/**
 * I12 and I15 (Q-N): for an audited lot, every (class, structure, target) is re-evaluated uncached and compared with what the lot row DECODES to
 * (so the encoding is audited too), and re-evaluated once more with the candidates in reversed order (order invariance). Counts pairs.
 */
function auditLot(lot, decoded, cand, env, tally) {
  const rep = env.classes[0];
  const at = new Map(decoded.map((d) => [`${d.class}\u0000${d.structure}\u0000${d.target}`, d]));
  for (const p of env.pairs) {
    let disagree = false;
    for (const c of env.classes) {
      const l = rb.classLot(lot, { structure: p.structure, classKey: c, vector: env.classVectors[c] });
      const direct = normalizeResult(env.hooks.evaluateDirect(l, p.target, cand.candidates), cand, env);
      if (!sameStored(direct, at.get(`${c}\u0000${p.structure}\u0000${p.target}`))) disagree = true;
    }
    tally.equivalence_checked += 1;
    if (disagree) tally.equivalence_disagreements += 1;
    const l0 = rb.classLot(lot, { structure: p.structure, classKey: rep, vector: env.classVectors[rep] });
    const fwd = normalizeResult(env.hooks.evaluateDirect(l0, p.target, cand.candidates), cand, env);
    const rev = normalizeResult(env.hooks.evaluateDirect(l0, p.target, [...cand.candidates].reverse()), cand, env);
    if (!sameFull(fwd, rev)) tally.order_disagreements += 1;
  }
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
  const audit = { equivalence_checked: 0, equivalence_disagreements: 0, order_disagreements: 0 };
  const byClass = {};
  const words = {};
  if (gate !== null) {
    const statusTextValue = gate === 'exception_not_authored' ? excStatus : `not_evaluated:${gate}`;
    const reason = statusTextValue.slice('not_evaluated:'.length);
    for (const [i, c] of env.classes.entries()) {
      byClass[c] = i === 0 ? env.pairs.map(() => gatedResult(reason)) : null;
      words[c] = { status: 'not_evaluated', reason };
    }
  } else {
    for (const c of env.classes) {
      byClass[c] = env.pairs.map((p) => {
        const l = rb.classLot(lot, { structure: p.structure, classKey: c, vector: env.classVectors[c] });
        return normalizeResult(env.hooks.evaluate(l, p.target, cand.candidates), cand, env);
      });
    }
    for (const c of env.classes) {
      const l = rb.classLot(lot, { structure: 'principal', classKey: c, vector: env.classVectors[c] });
      words[c] = permittedCached(l, env.classVectors[c].building_type, cand, c, env);
    }
  }
  const enc = lr.encodeLotResults({ pairs: env.pairs, classes: env.classes, byClass, map: env.map, dict: env.dict, unitInfo: env.unitInfo });
  const perm = lr.encodePermitted({ classes: env.classes, words, map: env.map, dict: env.dict });
  if (gate === null && env.audit !== null && row.id % env.audit.everyNth === env.audit.offset) {
    const decoded = lr.decodeLotResults({ lot: enc, pairs: env.pairs, classes: env.classes, map: env.map, dicts: env.dict.view() });
    auditLot(lot, decoded, cand, env, audit);
  }
  return { enc, perm, gate, defaulted, audit, parcelId: row.id, rep: byClass[env.classes[0]] };
}

function stampLot(row, env) {
  const full = { ...row };
  full.row_sha = rb.rowSha(full, RESULT_COLUMNS.lots, COLUMN_KINDS.lots);
  full.table_version = env.versions.table_version;
  full.evaluator_version = env.versions.evaluator_version;
  return full;
}

/**
 * The batch core. Splits the batch by the population (R-IU), resolves each in-population parcel (the gate first, then the results), and
 * returns each table's rows once: the dictionary rows this batch used (key order) and the lot rows (parcel order), with row_sha and the two
 * versions stamped on the lot rows. `retract` is the parcel ids whose lot rows the replace-keys write deletes. `matched` is additive (R-EH (c)).
 */
function materializeBatch(batch, env) {
  const { inside, retract } = rb.splitPopulation(batch, 'id', (row) => env.isIn({ zone: row.zoning_class }));
  env.dict.beginBatch();
  const lots = [];
  const matched = { lots: 0, lots_retracted: retract.length, lots_gated: 0, inputs_defaulted: 0, scenario_axis_results: 0, equivalence_checked: 0, equivalence_disagreements: 0, order_disagreements: 0, gated_by_gate: {}, results_by_status: {}, not_evaluated_by_reason: {}, winner_layers: {} };
  for (const row of inside) {
    const r = resolveRow(row, env);
    lots.push(stampLot({
      parcel_id: r.parcelId, lot_gate: r.gate, codes: r.enc.codes, numbers: r.enc.numbers, reason_ids: r.enc.reason_ids, winner_ids: r.enc.winner_ids,
      evidence_kinds: r.enc.evidence_kinds, evidence_ref_ids: r.enc.evidence_ref_ids, class_results: r.enc.class_results,
      permitted: r.perm.permitted, permitted_text_ids: r.perm.permitted_text_ids, inputs_defaulted: r.defaulted,
    }, env));
    matched.lots += 1;
    matched.inputs_defaulted += r.defaulted;
    for (const k of Object.keys(r.audit)) matched[k] += r.audit[k];
    if (r.gate !== null) { matched.lots_gated += 1; matched.gated_by_gate[r.gate] = (matched.gated_by_gate[r.gate] || 0) + 1; }
    for (const c of r.rep) {
      matched.results_by_status[c.status] = (matched.results_by_status[c.status] || 0) + 1;
      if (c.winner_layer !== null) matched.winner_layers[c.winner_layer] = (matched.winner_layers[c.winner_layer] || 0) + 1;
      if (isScenarioAxisReason(c.reason)) matched.scenario_axis_results += 1;
      if (c.status === 'not_evaluated') {
        const code = String(c.reason).split(':')[0];
        matched.not_evaluated_by_reason[code] = (matched.not_evaluated_by_reason[code] || 0) + 1;
      }
    }
  }
  const d = env.dict.rows();
  return {
    rows: { units: d.units.sort((a, b) => a.unit_key - b.unit_key), texts: d.texts.sort((a, b) => a.text_key - b.text_key), lots: lots.sort((a, b) => a.parcel_id - b.parcel_id) },
    retract: [...retract].sort((a, b) => a - b),
    matched,
  };
}

/**
 * ON READ (CHAT-80.QP, CHAT-77.freeze): a stored lot row back into the frozen logical rows P3's accessor (fromLogicalRows) consumes:
 * the eight stored fields decode from the arrays and dictionaries; inputs_used, losers and disclosures are recomputed through the
 * uncached evaluator. `parcelRow` is the parcels row (the lot vector is rebuilt from it).
 */
function logicalRowsOf(parcelRow, storedLot, dicts, env) {
  const decoded = lr.decodeLotResults({ lot: storedLot, pairs: env.pairs, classes: env.classes, map: env.map, dicts });
  const permitted = lr.decodePermitted({ lot: storedLot, classes: env.classes, map: env.map, dicts });
  const gate = storedLot.lot_gate === undefined ? null : storedLot.lot_gate;
  if (gate !== null) return { lot_gate: gate, permission_disclosures: Object.fromEntries(env.classes.map((c) => [c, null])), permitted_by_class: permitted, rows: decoded.map((d) => ({ ...d, inputs_used: [], losers: null, disclosures: null })) };
  const { lot } = rb.buildLotVector(parcelRow, env.lotEnv);
  const rows = decoded.map((d) => {
    const t = traceResult(lot, d.structure, d.target, d.class, env);
    return { ...d, inputs_used: t.inputs_used, losers: t.losers, disclosures: t.disclosures };
  });
  return { lot_gate: null, permission_disclosures: permissionDisclosuresOf(parcelRow, storedLot, permitted, env), permitted_by_class: permitted, rows };
}

/** The stored row was written by another table / evaluator version than this tree's (expected between an evaluator commit and its Layer 2 night). */
class PermissionRecomputeStaleError extends Error {
  constructor(stored, now) { super(`permission_recompute_stale:${stored.tv}/${stored.ev}:${now.tv}/${now.ev}`); this.name = 'PermissionRecomputeStaleError'; this.code = 'permission_recompute_stale'; }
}
/** A permitted() result without a disclosures array, or a disclosure whose closed phrase is missing (OUTPUT panel F2): never a default. */
class PermissionDisclosureError extends Error {
  constructor(code) { super(code); this.name = 'PermissionDisclosureError'; this.code = code.split(':')[0]; }
}
/** At equal versions the recomputed permission word differs from the stored one: a defect, never re-derived silently. */
class PermissionRecomputeDriftError extends Error {
  constructor(parcelId, cls, stored, recomputed) { super(`permission_recompute_drift:${parcelId}:${cls}`); this.name = 'PermissionRecomputeDriftError'; this.code = 'permission_recompute_drift'; this.stored = stored; this.recomputed = recomputed; }
}

/**
 * ON READ (2026-10-26-batch-m#CHAT-180.L2-G5-DISCLOSURE-ON-READ (a); the CHAT-80.QP form: no column, no schema change): the M-169
 * set-aside disclosures of each class's permission word, one closed sentence each ("If {condition}: {effect}.", the {effect} the
 * archetype's vocab permission_effect phrase with {clause} = the unit id), sorted and de-duplicated. The word is recomputed through the
 * uncached evaluator and must equal the stored word: first the versions (PermissionRecomputeStaleError), then the word
 * (PermissionRecomputeDriftError). A permitted() result without a disclosures array throws permission_disclosures_missing. The 11 frozen
 * row fields and the permitted_by_class words are untouched (CHAT-77.freeze).
 */
function permissionDisclosuresOf(parcelRow, storedLot, storedWords, env) {
  const now = { tv: String(env.versions.table_version).slice(0, 8), ev: String(env.versions.evaluator_version).slice(0, 8) };
  const was = { tv: String(storedLot.table_version || '').slice(0, 8), ev: String(storedLot.evaluator_version || '').slice(0, 8) };
  if (was.tv !== now.tv || was.ev !== now.ev) throw new PermissionRecomputeStaleError(was, now);
  const ud = env.ctx.undeterminedDisclosure || {};
  const out = {};
  for (const cls of env.classes) {
    const lot = classLotFor(parcelRow, 'principal', cls, env);
    const p = env.hooks.permitted(lot, env.classVectors[cls].building_type, candidatesFor(lot, env).candidates);
    const w = permittedWord(p, env);
    if (JSON.stringify(w) !== JSON.stringify(storedWords[cls])) throw new PermissionRecomputeDriftError(storedLot.parcel_id, cls, storedWords[cls], w);
    if (!Array.isArray(p.disclosures)) throw new PermissionDisclosureError(`permission_disclosures_missing:${storedLot.parcel_id}:${cls}`);
    const sentence = (d) => {
      const tpl = ud.template; const eff = ud.permission_effect && ud.permission_effect[d.archetype];
      if (typeof tpl !== 'string' || !tpl.includes('{condition}') || !tpl.includes('{effect}')) throw new PermissionDisclosureError('permission_disclosure_template_missing');
      if (typeof eff !== 'string' || !eff.includes('{clause}')) throw new PermissionDisclosureError(`permission_effect_missing:${d.archetype}`);
      if (typeof d.condition_phrase !== 'string' || !d.condition_phrase) throw new PermissionDisclosureError(`permission_condition_phrase_missing:${d.unit_id}`);
      return tpl.replace('{condition}', () => d.condition_phrase).replace('{effect}', () => eff.replace('{clause}', () => d.unit_id)); // function replacers: no $ patterns
    };
    const s = p.disclosures.map(sentence);
    if (p.closure) { // CHAT-194.USO-Q1e: "Exception <n> permits only <types>", the closed sentence from vocab exception_type_list_closure.$disclosure
      const cd = env.ctx.typeListClosure && env.ctx.typeListClosure.$disclosure;
      if (typeof cd !== 'string' || !cd.includes('{exception}') || !cd.includes('{types}')) throw new PermissionDisclosureError('closure_disclosure_missing');
      s.push(cd.replace('{exception}', () => p.closure.exception).replace('{types}', () => p.closure.types.join(', ')));
    }
    out[cls] = [...new Set(s)].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
  }
  return out;
}

module.exports = {
  LEGAL_USER_INPUT, RESULT_COLUMNS, COLUMN_SQL, COLUMN_KINDS, STORED_RESULT_FIELDS, LOGICAL_RESULT_FIELDS, rowShaMismatchSql,
  makeEnv, seedDictionaries, materializeBatch, classLotFor, traceResult, logicalRowsOf, PermissionRecomputeStaleError, PermissionRecomputeDriftError, PermissionDisclosureError,
};
