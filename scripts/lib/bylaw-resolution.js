/**
 * SPEC LINK: docs/specs/01-pipeline/134_resolve_bylaws.md §3 (row shape, value_kind), §5 (the unauthored-exception
 *            gate), §7 I3 / I4 / I10 (PRIMARY)
 * SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-231 (operator approved 2026-10-20,
 *            2026-10-20-scenario-build-rulings#R-4), M-232 (the Layer 2 status set)
 * SPEC LINK: docs/specs/01-pipeline/132_step_standard_handbook.md §1 (compute purity)
 *
 * `resolve_bylaws` (Layer 2) — slice (a) of the build plan (docs/reports/2026-10-21-layer2-build-plan.md §7): the
 * pure resolution functions Spec 134 and the recorded rulings fully settle, built ahead of commit ① on fixtures (the
 * node N6a form, Spec 134 §9). No descriptor, shell, migration or runner hook exists yet (Spec 124 R-K.1: at
 * red_suite there is no descriptor file). Pure: requires only node:crypto and the two pure evaluator modules
 * (evaluate.mjs, cell-cache.mjs, through Node's synchronous require of an ES module, PIN-L2-2); no fs, pg, env, clock
 * or randomness.
 *
 * A library, not the compute module: a file in scripts/lib/compute/ must pair with a manifest step (step-conformance
 * §5.5), and the step is registered only at ①. The compute module `scripts/lib/compute/resolve-bylaws.js` (②) will
 * require it, as compute modules require `../zoning-precedence` and `../safe-math`.
 *
 * What is still open is passed IN, never decided here (plan §6): the INCLUDE closure and the authored map (OQ-2), the
 * declared (target, structure) scope (OQ-8), which lot gate is reported first (OQ-6), and the physical status columns
 * (OQ-4). Status strings use the Spec 68 §5a part 3 written form `not_evaluated:<code>` (Spec 134 §4; M-232).
 *
 *   unauthoredException(closure, authored)       → the first exception id not fully authored, or null   (M-231)
 *   exceptionGateStatus(closure, authored)       → 'not_evaluated:exception_not_authored:<id>' or null   (M-231)
 *   gatedRows(scope, status)                     → one no-winner row per (target, structure)             (M-231; I3, I4)
 *   resolveLot({ scope, gateStatus, resolveOne }) → gated rows, or resolveOne per scope entry            (gate first)
 *   valueKindOf(value)                           → 'number' | 'unlimited' | 'unregulated'                (§3)
 *
 * Batch J (Spec 124 R-IL…R-IW, operator 2026-10-21, approved on the simplicity condition):
 *   sha256Hex(bytes), filesHash([{path, sha256}])  → version hashes                                       (R-IW)
 *   cellKey(lot, readPaths, {structure, target}) → {cell_id}   one target's result, by its own read inputs (R-IN, CHAT-41)
 *   statusText(status, reason), layer2Status(result, map) → the stored status and reason                   (R-IO)
 *   evidenceOf(result, map, {winnerLayer})       → {evidence_kind, evidence_ref}                           (R-IP)
 *   firstLotGate(fired, order), closureStart(n, sentinel), exceptionMismatch(n, xN, sentinel)             (R-IQ)
 *   collapseClasses(order, resultsByClass)       → class → its representative class                        (R-IR)
 *   splitPopulation(batch, key, isIn)            → {inside, retract}                                       (R-IU)
 *   inPopulation(zoneList, vocabZones)           → the population predicate over a row's zone              (R-IU, Q-L2-4)
 */
'use strict';

const crypto = require('node:crypto');
const { splitRef } = require('../analysis/bylaw/evaluate.mjs');
const { inputValue } = require('../analysis/bylaw/cell-cache.mjs');

/** The evaluator's closed code for this gate (evaluate.mjs NOT_EVALUATED_CODES; the test locks the membership). */
const EXCEPTION_GATE_CODE = 'exception_not_authored';
/** The Layer 2 status a lot gate writes (Spec 68 §5a part 3 / Spec 134 §4: `not_evaluated:<code>`). */
const NOT_EVALUATED_PREFIX = 'not_evaluated:';
/** Spec 134 §3 value_kind, closed: a finite number, or one of the evaluator's two terminal values (evaluate.mjs). */
const TERMINAL_VALUE_KINDS = Object.freeze(['unlimited', 'unregulated']);

/**
 * "Fully authored" is the evaluator context's authored state (evaluate.mjs makeContext `authored`: 'authored' |
 * {status: 'authored'} | {status: 'partial', targets}). `partial` is NOT fully authored, whatever targets it lists:
 * M-231 gates the whole lot, where the evaluator's own ruling (d) gate is per target. Nothing listed = not authored.
 */
function isFullyAuthored(state) {
  return state === 'authored' || (state !== null && typeof state === 'object' && state.status === 'authored');
}

/**
 * M-231: the first exception id of the lot's ordered INCLUDE closure (the lot's own exception first) that is not
 * fully authored, or null. An empty closure (no exception) is never gated. A missing closure or authored map is a
 * missing input and throws: it is never defaulted (Spec 134 I10).
 */
function unauthoredException(closure, authored) {
  if (!Array.isArray(closure)) throw new TypeError('unauthoredException: closure must be the ordered exception closure (an array); a missing input is never defaulted (Spec 134 I10)');
  if (authored === null || typeof authored !== 'object' || Array.isArray(authored)) throw new TypeError('unauthoredException: authored must be the exception → authored-state map; a missing input is never defaulted (Spec 134 I10)');
  for (const id of closure) {
    if (!isFullyAuthored(Object.prototype.hasOwnProperty.call(authored, id) ? authored[id] : undefined)) return id;
  }
  return null;
}

/** M-231's written form: `not_evaluated:exception_not_authored:<exception id>` for a gated lot, else null. */
function exceptionGateStatus(closure, authored) {
  const id = unauthoredException(closure, authored);
  return id === null ? null : `${NOT_EVALUATED_PREFIX}${EXCEPTION_GATE_CODE}:${id}`;
}

function checkedScope(scope) {
  if (!Array.isArray(scope)) throw new TypeError('scope must be the declared (target, structure) list');
  const seen = new Set();
  for (const s of scope) {
    if (!s || typeof s.target !== 'string' || !s.target) throw new TypeError(`scope entry without a target: ${JSON.stringify(s)}`);
    if (typeof s.structure !== 'string' || !s.structure) throw new TypeError(`scope entry without a structure: ${JSON.stringify(s)}`);
    const k = `${s.target}\u0000${s.structure}`;
    if (seen.has(k)) throw new Error(`duplicate scope entry ${s.target} × ${s.structure} (Spec 134 I1 counts each exactly once)`);
    seen.add(k);
  }
  return scope;
}

/**
 * M-231, "written per target": one row per declared (target, structure), each carrying the gate's status and no
 * winner (Spec 134 I3: a closed reason and no winner; I4: no winner on a gated lot).
 */
function gatedRows(scope, status) {
  if (typeof status !== 'string' || !status.startsWith(NOT_EVALUATED_PREFIX) || status.length === NOT_EVALUATED_PREFIX.length) {
    throw new TypeError(`gatedRows: a lot gate writes a not_evaluated:<code> status, got ${JSON.stringify(status)}`);
  }
  return checkedScope(scope).map((s) => ({ target: s.target, structure: s.structure, status, winner_unit_id: null }));
}

/**
 * The gate fires before effective() (M-231; Spec 134 §5): a gated lot takes the gated rows and the resolver is never
 * called, even where it could resolve a target from base (the A14 case). An ungated lot calls resolveOne once per
 * scope entry, in scope order.
 */
function resolveLot({ scope, gateStatus, resolveOne }) {
  if (gateStatus !== null && gateStatus !== undefined) return gatedRows(scope, gateStatus);
  if (typeof resolveOne !== 'function') throw new TypeError('resolveLot: resolveOne must be a function for an ungated lot');
  return checkedScope(scope).map((s) => resolveOne(s));
}

/** Spec 134 §3: value_kind ∈ number · unlimited · unregulated; anything else throws, never guessed. */
function valueKindOf(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return 'number';
  if (TERMINAL_VALUE_KINDS.includes(value)) return value;
  throw new TypeError(`value_kind: ${JSON.stringify(value)} is neither a finite number nor one of ${TERMINAL_VALUE_KINDS.join(', ')}`);
}

// ---------------------------------------------------------------------------------------------------------------------
// The operator's batch-J rulings (2026-10-21, `2026-10-21-chat-batch-j`; Spec 124 R-IN, R-IO, R-IP, R-IQ, R-IR, R-IU,
// R-IW), each in its simplest compliant form. The map (`scripts/seeds/bylaw/layer2-map.json`) is passed in; nothing
// here holds a status, code, gate or class list.
// ---------------------------------------------------------------------------------------------------------------------

/** R-IW: the hex sha256 of a string's UTF-8 bytes or of a Buffer. */
function sha256Hex(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

const SHA256_HEX = /^[0-9a-f]{64}$/;
/**
 * R-IW: one hash over several files: sha256 of the `<path>\0<sha256>\n` lines sorted by path (order-free; a rename
 * changes it). Paths are repo-relative POSIX paths.
 */
function filesHash(entries) {
  if (!Array.isArray(entries)) throw new TypeError('filesHash: entries must be [{path, sha256}]');
  const seen = new Set();
  for (const e of entries) {
    const p = e && e.path;
    if (typeof p !== 'string' || !p || p.startsWith('/') || p.split('/').includes('..') || p.includes('\\')) throw new TypeError(`filesHash: path ${JSON.stringify(p)} is not a repo-relative POSIX path`);
    if (seen.has(p)) throw new Error(`filesHash: duplicate path ${p}`);
    seen.add(p);
    if (typeof e.sha256 !== 'string' || !SHA256_HEX.test(e.sha256)) throw new TypeError(`filesHash: ${p} sha256 ${JSON.stringify(e.sha256)} is not a hex sha256`);
  }
  const lines = [...entries].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)).map((e) => `${e.path}\0${e.sha256}\n`);
  return sha256Hex(lines.join(''));
}

/** The two lot fields loadCandidates reads (evaluate.mjs): they fix the candidate set at one table_version (R-IN). */
const CANDIDATE_INPUTS = Object.freeze(['zone', 'exception']);
/**
 * R-IN (option B, operator CHAT-41): `cell_id` keys ONE stored result: the `structure` and `target` lines, then the sorted
 * `<path>\t<token>` lines (token = cell-cache.mjs inputValue) of `zone`, `exception` and that target's own read paths
 * (`target.*` paths are dropped as in the cell cache). Lots whose values agree on those inputs share the row. There is no
 * `inputs_hash` (Q-L2-1). An input path the cell cache cannot value throws (never keyed loosely).
 */
function cellKey(lot, readPaths, scope) {
  if (!lot || typeof lot !== 'object') throw new TypeError('cellKey: lot must be the lot vector');
  if (!Array.isArray(readPaths)) throw new TypeError('cellKey: readPaths must be the target\'s inputs[]');
  if (!scope || typeof scope.structure !== 'string' || typeof scope.target !== 'string') throw new TypeError('cellKey: scope must be {structure, target}');
  const paths = [...new Set([...CANDIDATE_INPUTS, ...readPaths.filter((p) => !String(p).startsWith('target.'))])].sort();
  const lines = [`structure\t${scope.structure}`, `target\t${scope.target}`, ...paths.map((p) => `${p}\t${inputValue(lot, p)}`)];
  return { cell_id: sha256Hex(lines.join('\n')) };
}

/** R-IO: the §5a written form, derived on read: `<status>:<reason>`, or the bare status. */
function statusText(status, reason) {
  return reason === null || reason === undefined ? status : `${status}:${reason}`;
}

const reasonCodeOf = (reason) => String(reason).split(':')[0];
/**
 * R-IO: an effective() result's stored Layer 2 status and reason, through the map's `evaluator_status`. A
 * `not_evaluated` reason must carry a code in the map's `reason_code`; an unmapped status throws.
 */
function layer2Status(result, map) {
  const m = map && map.evaluator_status && Object.prototype.hasOwnProperty.call(map.evaluator_status, result && result.status) ? map.evaluator_status[result.status] : null;
  if (!m) throw new Error(`layer2Status: evaluator status ${JSON.stringify(result && result.status)} is not in layer2-map.json evaluator_status`);
  let reason = null;
  if (m.reason !== undefined) reason = m.reason;
  else if (result.reason !== undefined && result.reason !== null) {
    reason = String(result.reason);
    if (m.strip_prefix && reason.startsWith(m.strip_prefix)) reason = reason.slice(m.strip_prefix.length);
  }
  if (m.status === 'not_evaluated' && !map.reason_code.includes(reasonCodeOf(reason))) {
    throw new Error(`layer2Status: not_evaluated reason code ${JSON.stringify(reasonCodeOf(reason))} is not in layer2-map.json reason_code`);
  }
  return { status: m.status, reason };
}

/** R-IP: the ref each evaluator evidence kind carries. */
const EVIDENCE_REF = Object.freeze({
  clause: (ev) => ev.clause,
  absence: (ev) => ev.ruling,
  label_absent: (ev) => ev.ruling,
  disapply: (ev) => [...(ev.disapplied_by || [])].sort().join(','),
});
/**
 * R-IP: `evidence_kind` / `evidence_ref`. An evidence object keeps the evaluator's kind (it must be in the map's
 * `evidence_kind`). A winner with no evidence object (a numeric rule-path winner) is `clause`, or `provincial` when the
 * caller says the winner's layer is provincial, with the winner's regulation id (`splitRef`, no unit read).
 */
function evidenceOf(result, map, { winnerLayer = null } = {}) {
  const ev = result && result.evidence;
  if (ev) {
    if (!map.evidence_kind.includes(ev.kind) || !EVIDENCE_REF[ev.kind]) throw new Error(`evidenceOf: evidence kind ${JSON.stringify(ev.kind)} is not in layer2-map.json evidence_kind`);
    return { evidence_kind: ev.kind, evidence_ref: EVIDENCE_REF[ev.kind](ev) };
  }
  if (result && result.winner) {
    return { evidence_kind: winnerLayer === 'provincial' ? 'provincial' : 'clause', evidence_ref: splitRef(result.winner).reg };
  }
  // M-60 agreeing worlds (CHAT-115.L2-EVID-1): no single winner, but when every applied clause sits in one regulation, that regulation is
  // the evidence; the winner stays empty. Clauses in several regulations stay uncited (winner_evidence_violations still counts them).
  const regs = result && Array.isArray(result.applied) ? [...new Set(result.applied.map((u) => splitRef(u).reg))] : [];
  if (regs.length === 1) return { evidence_kind: winnerLayer === 'provincial' ? 'provincial' : 'clause', evidence_ref: regs[0] };
  return { evidence_kind: null, evidence_ref: null };
}

/** R-IQ: the first fired lot gate in the declared order (the map's `lot_gate`), or null; an undeclared gate throws. */
function firstLotGate(fired, order) {
  const set = new Set(fired);
  for (const g of set) if (!order.includes(g)) throw new Error(`firstLotGate: gate ${JSON.stringify(g)} is not in layer2-map.json lot_gate`);
  return order.find((g) => set.has(g)) || null;
}

/** R-IQ: the exception number that starts the INCLUDE closure: none for an absent number or the sentinel. */
function closureStart(exceptionNumber, sentinel) {
  return exceptionNumber === null || exceptionNumber === undefined || exceptionNumber === sentinel ? null : exceptionNumber;
}

/**
 * R-IQ (with P2's xN != number arm): the parcel's exception number and the label's (xN) disagree. With no (xN), only a
 * real exception number mismatches (the sentinel base-resolves); with an (xN), anything but that same number does.
 */
function exceptionMismatch(exceptionNumber, labelX, sentinel) {
  const n = exceptionNumber === undefined ? null : exceptionNumber;
  const x = labelX === undefined ? null : labelX;
  return x === null ? n !== null && n !== sentinel : n !== x;
}

/** The stable JSON form (sorted object keys) used to compare results byte for byte. */
function stableJson(v) {
  return JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((y) => [y, x[y]])) : x));
}

/**
 * R-IR (iv): each class → its representative: the first class in catalogue order whose result is byte-equal under the
 * stable JSON form (itself when none earlier is). Every declared class needs a result and every result a declared
 * class (Spec 134 I13).
 */
function collapseClasses(order, resultsByClass) {
  for (const c of order) if (!Object.prototype.hasOwnProperty.call(resultsByClass, c)) throw new Error(`collapseClasses: no result for declared class ${c}`);
  for (const c of Object.keys(resultsByClass)) if (!order.includes(c)) throw new Error(`collapseClasses: result for undeclared class ${c} (Spec 134 I13)`);
  const firstBy = new Map();
  const out = {};
  for (const c of order) {
    const k = stableJson(resultsByClass[c]);
    if (!firstBy.has(k)) firstBy.set(k, c);
    out[c] = firstBy.get(k);
  }
  return out;
}

/**
 * R-IU: one source batch split by the population predicate (passed in): the rows to resolve, and the keys whose link
 * rows the `replace_keys` write retracts.
 */
function splitPopulation(batch, key, isIn) {
  if (typeof isIn !== 'function') throw new TypeError('splitPopulation: the population predicate must be a function');
  const inside = [];
  const retract = [];
  for (const row of batch) {
    if (!row || row[key] === undefined || row[key] === null) throw new Error(`splitPopulation: a source row has no ${key}`);
    if (isIn(row)) inside.push(row); else retract.push(row[key]);
  }
  return { inside, retract };
}

/**
 * Q-L2-4 (R-AY): the in-scope zone list is a logic variable (`resolve_bylaws_population_zone_classes`, migration 280),
 * read by the shell and passed in; this checks it against the evaluator's zone vocabulary (vocab.json `zone`) and
 * returns the predicate `splitPopulation` takes. A list that is not an array of vocabulary strings, or is empty, throws.
 */
function inPopulation(zoneList, vocabZones) {
  if (!Array.isArray(zoneList)) throw new TypeError('inPopulation: the zone list must be an array');
  if (zoneList.length === 0) throw new Error('inPopulation: the zone list is empty (an empty population retracts every lot)');
  for (const z of zoneList) {
    if (typeof z !== 'string') throw new TypeError('inPopulation: every zone must be a string');
    if (!vocabZones.includes(z)) throw new Error(`inPopulation: zone ${z} is not in the evaluator zone vocabulary`);
  }
  const set = new Set(zoneList);
  return (row) => set.has(row.zone);
}


// ---------------------------------------------------------------------------------------------------------------------
// Part A of the Layer 2 build (lane L2-SLICES, 2026-10-22): the lot vector (R-IV), R-LABEL, the class lot, and the form-C
// pointer/profile/lineage functions (Spec 124 R-JA, operator CHAT-69.Q1). All pure: no fs, pg, env, clock or randomness.
// Handbook: Spec 132 §x-rulings.4 (R-JA); Spec 132 §core.9 (R-W: compute is pure).
// ---------------------------------------------------------------------------------------------------------------------

const NUMBER_TOKEN = /^\d+(?:\.\d+)?$/;
/**
 * R-LABEL (P2 D7, P2:204): the zone string `ZONE (letterN; letterN) (xN)`, total over the vocab `label_letter` set, numbers and
 * `H` as a declared holding token. Anything else is `ok: false` (the lot gate `label_unparsed`); it never throws on a
 * string. `x` is the exception number group, alone in its parentheses; a letter repeats, or an unknown letter, is not ok.
 */
function parseZoneLabel(zn, labelLetters) {
  const NO = { ok: false, zone: null, label: {}, labelX: null, holding: false };
  if (typeof zn !== 'string' || !Array.isArray(labelLetters)) return NO;
  const m = /^\s*([A-Z]+)((?:\s*\([^()]*\))*)\s*$/.exec(zn);
  if (!m) return NO;
  const label = {};
  let labelX = null;
  let holding = false;
  for (const g of m[2].matchAll(/\(([^()]*)\)/g)) {
    const parts = g[1].split(';').map((p) => p.trim());
    for (const p of parts) {
      const x = /^x(\d+)$/.exec(p);
      if (x) {
        if (parts.length !== 1 || labelX !== null) return NO;
        labelX = Number(x[1]);
      } else if (p === 'H') {
        holding = true;
      } else {
        const l = /^([a-z]+)\s*(\S+)$/.exec(p);
        if (!l || !labelLetters.includes(l[1]) || !NUMBER_TOKEN.test(l[2]) || Object.prototype.hasOwnProperty.call(label, l[1])) return NO;
        label[l[1]] = Number(l[2]);
      }
    }
  }
  return { ok: true, zone: m[1], label, labelX, holding };
}

/**
 * R-IV: the lot vector of one parcels row, the shape the golden-lot puller builds (pull-golden-lots.cjs rowToLot) so the two cannot
 * drift. `env`: { vocabZones, labelLetters, exceptionChapter, sentinel, mapAreas, designDefaults }. Returns
 * { lot, gates, inputs_defaulted }. `gates` are the parcel-derived lot gates that fired (a subset of layer2-map.json lot_gate);
 * `exception_not_authored` is decided from the INCLUDE closure (M-231), never here. A missing metric stays null and fires
 * `lot_metric_missing`; a missing map membership leaves `map_areas` absent. Nothing is defaulted, so inputs_defaulted is 0 (I10).
 */
function buildLotVector(row, env) {
  if (!row || typeof row !== 'object') throw new TypeError('buildLotVector: row must be a parcels row');
  for (const k of ['vocabZones', 'labelLetters', 'exceptionChapter', 'mapAreas']) if (env[k] === undefined || env[k] === null) throw new TypeError(`buildLotVector: env.${k} is missing`);
  const zone = row.zoning_class;
  const parsed = parseZoneLabel(row.zoning_zn_string, env.labelLetters);
  const gates = [];
  if (!zone || !env.vocabZones.includes(zone)) gates.push('no_569_2013_zone');
  if (row.zoning_is_ambiguous === true) gates.push('ambiguous_zone');
  if (!parsed.ok) gates.push('label_unparsed');
  else if (exceptionMismatch(row.exception_number, parsed.labelX, env.sentinel)) gates.push('label_exception_mismatch');
  const metric = (v) => (v === null || v === undefined ? null : Number(v));
  const vars = { lot_frontage_m: metric(row.frontage_m), lot_depth_m: metric(row.depth_m), lot_area_m2: metric(row.lot_size_sqm) };
  if (Object.values(vars).some((v) => v === null)) gates.push('lot_metric_missing');
  const ov = row.zoning_overlays || {};
  const overlays = {};
  if (ov.height_overlay && ov.height_overlay.applied) {
    if (ov.height_overlay.height_max_m != null) overlays.HT = Number(ov.height_overlay.height_max_m);
    if (ov.height_overlay.stories != null) overlays.ST = Number(ov.height_overlay.stories);
  }
  if (ov.lot_coverage_overlay && ov.lot_coverage_overlay.applied && ov.lot_coverage_overlay.coverage_max_pct != null) overlays.LC = Number(ov.lot_coverage_overlay.coverage_max_pct);
  const n = closureStart(row.exception_number, env.sentinel);
  const chapter = env.exceptionChapter[zone];
  const exception = n !== null && n > 0 && chapter !== undefined ? `900.${chapter}.10(${n})` : null;
  // Q-D: the flags follow the golden-lot puller, including its declared lawfully_existing:false and the 4-vertex no_rear_lot_line rule
  const flag = (v) => (typeof v === 'boolean' ? v : undefined);
  const raw = {
    corner_lot: flag(row.is_corner_lot), through_lot: flag(row.is_through_lot), major_street: flag(row.on_policy_road), abuts_lane: flag(row.abuts_laneway),
    lawfully_existing: false, heritage_property: flag(row.is_heritage_designated), ...(row.geom_npoints === 4 ? { no_rear_lot_line: true } : {}),
  };
  const flags = { ...(env.designDefaults || {}) };
  for (const [k, v] of Object.entries(raw)) if (v !== undefined) flags[k] = v;
  const lot = { zone, zone_label: row.zoning_zn_string, label: parsed.ok ? parsed.label : {}, overlays, vars, flags, exception, parcel_id: row.parcel_id };
  // Q-E: map membership is the parcels column enrich_parcels derives from bylaw_map_areas; null is unknown, not outside
  const cols = Object.keys(env.mapAreas);
  if (cols.every((c) => typeof row[c] === 'boolean')) lot.map_areas = cols.filter((c) => row[c] === true).map((c) => env.mapAreas[c]);
  return { lot, gates, inputs_defaulted: 0 };
}

/** The lot inputs a class vector sets (so they are not lot inputs): left out of cell_id and inputs_used (Q-C). */
const CLASS_INPUT_PATHS = Object.freeze(['building_type', 'flags.has_garden_suite', 'flags.has_laneway_suite', 'flags.has_secondary_suite', 'vars.ancillary_units', 'vars.dwelling_units', 'vars.house_units']);
/**
 * Lot inputs effective() reports as read that this step never sets, so every lot has the same (absent) value: `uses` (the specific uses
 * on a lot, a scenario value). cell-cache.mjs inputValue cannot value `uses` (PIN: a gap in that file, owned by the by-law lane), and a
 * constant adds nothing to a key, so these paths are left out of cell_id and the cell cache key, and listed in inputs_used as read.
 */
const UNSET_LOT_INPUTS = Object.freeze(['uses']);
const STRUCTURE_BUILDING_TYPE = Object.freeze({ garden_suite: 'garden_suite', laneway_suite: 'laneway_suite' });
/**
 * Spec 134 §2 (the class catalogue): the base lot vector evaluated for one structure under one class. The principal takes
 * the class's building type and house units (evaluated_at for a range); a suite structure keeps the class context and takes
 * its own building type and one dwelling unit (the golden-lot helper's UNITS_OF). Q-C: the suite's unit counts are the plain
 * reading of the vocab fields, not a ruling.
 */
function classLot(base, { structure, classKey, vector }) {
  if (structure !== 'principal' && !Object.prototype.hasOwnProperty.call(STRUCTURE_BUILDING_TYPE, structure)) throw new Error(`classLot: structure ${JSON.stringify(structure)} is not a v1 structure`);
  if (!vector || typeof vector.building_type !== 'string') throw new TypeError(`classLot: class ${classKey} has no vector`);
  const house = typeof vector.house_units === 'number' ? vector.house_units : vector.house_units && vector.house_units.evaluated_at;
  if (typeof house !== 'number') throw new TypeError(`classLot: class ${classKey} has no house_units`);
  const principal = structure === 'principal';
  return {
    ...base,
    building_type: principal ? vector.building_type : STRUCTURE_BUILDING_TYPE[structure],
    vars: { ...base.vars, dwelling_units: principal ? house : 1, house_units: house, ancillary_units: principal ? vector.ancillary_units : 1 },
    flags: { ...base.flags, has_secondary_suite: vector.has_secondary_suite, has_garden_suite: vector.has_garden_suite, has_laneway_suite: vector.has_laneway_suite },
  };
}

/** CHAT-80.QP: the array order of a lot row, the (structure, target) pairs of layer2-scope.json in file order. */
function scopePairs(scope) {
  if (!scope || !Array.isArray(scope.structures) || !scope.targets) throw new TypeError('scopePairs: scope must be layer2-scope.json');
  return scope.structures.flatMap((structure) => {
    if (!Array.isArray(scope.targets[structure])) throw new Error(`scopePairs: no targets for structure ${structure}`);
    return scope.targets[structure].map((target) => ({ structure, target }));
  });
}

const FIELD_SEP = '\u001f';
const ITEM_SEP = '\u001e';

/**
 * Q-I: a jsonb value as Postgres prints it (`::text`), so SQL can recompute row_sha with no custom serializer: object keys by
 * length then bytes, `", "` between members and `": "` after a key, arrays in order, JSON string escapes. Pure; verified against
 * a read-only `SELECT $1::jsonb::text` in the capture queue.
 */
function jsonbText(v) {
  if (v === null) return 'null';
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return `[${v.map(jsonbText).join(', ')}]`;
  if (typeof v === 'object') {
    const keys = Object.keys(v).sort((x, y) => x.length - y.length || Buffer.compare(Buffer.from(x), Buffer.from(y)));
    return `{${keys.map((k) => { if (v[k] === undefined) throw new TypeError(`jsonbText: undefined at key ${k}`); return `${JSON.stringify(k)}: ${jsonbText(v[k])}`; }).join(', ')}}`;
  }
  throw new TypeError(`jsonbText: cannot render ${typeof v}`);
}

/** One value in the canonical text of a row (I14): null is empty, booleans t / f, bytea hex, text[] items joined by U+001E, jsonb as its ::text. */
function canonicalValue(v, kind) {
  if (v === null || v === undefined) return '';
  if (kind === 'jsonb') return jsonbText(v);
  if (typeof v === 'boolean') return v ? 't' : 'f';
  if (Buffer.isBuffer(v)) return v.toString('hex');
  if (Array.isArray(v)) return v.map((x) => canonicalValue(x)).join(ITEM_SEP);
  if (typeof v === 'object') throw new TypeError('canonicalValue: an object column must be declared kind "jsonb" (it is never rendered two ways)');
  return String(v);
}
/**
 * Spec 134 §3 / I14: the exact text a row hash covers: the listed result columns in order, joined by U+001F. `kinds` names the
 * jsonb columns. chain_run_id, the two versions and timestamps are outside any list (the write guard's own exclusions). The SQL
 * recompute (part B) renders the same text for every table (Q-I). A listed column the row lacks throws.
 */
function canonicalText(row, columns, kinds = {}) {
  return columns.map((c) => {
    if (!Object.prototype.hasOwnProperty.call(row, c)) throw new Error(`canonicalText: row has no column ${c}`);
    return canonicalValue(row[c], kinds[c]);
  }).join(FIELD_SEP);
}
function rowSha(row, columns, kinds = {}) {
  return sha256Hex(canonicalText(row, columns, kinds));
}
/** I14: the stored row_sha equals the recomputed one. */
function verifyRowSha(row, columns, kinds = {}) {
  return row.row_sha === rowSha(row, columns, kinds);
}

const BYTES_PER_MB = 1048576;
/** Spec 134 §6 / R-JA: measured bytes against `resolve_bylaws_storage_budget_mb`. Neither input is ever defaulted. */
function storageWithinBudget(measuredBytes, budgetMb) {
  if (typeof budgetMb !== 'number' || !Number.isFinite(budgetMb) || budgetMb <= 0) throw new TypeError(`storageWithinBudget: budget ${JSON.stringify(budgetMb)} must be a positive number of MB`);
  if (typeof measuredBytes !== 'number' || !Number.isFinite(measuredBytes) || measuredBytes < 0) throw new TypeError(`storageWithinBudget: bytes ${JSON.stringify(measuredBytes)} must be a non-negative number`);
  const measured = measuredBytes / BYTES_PER_MB;
  return { ok: measuredBytes <= budgetMb * BYTES_PER_MB, measured_mb: measured, budget_mb: budgetMb, ratio: measured / budgetMb };
}

module.exports = {
  unauthoredException,
  exceptionGateStatus,
  gatedRows,
  resolveLot,
  valueKindOf,
  sha256Hex,
  filesHash,
  cellKey,
  statusText,
  layer2Status,
  evidenceOf,
  firstLotGate,
  closureStart,
  exceptionMismatch,
  stableJson,
  collapseClasses,
  splitPopulation,
  inPopulation,
  parseZoneLabel,
  buildLotVector,
  CLASS_INPUT_PATHS,
  UNSET_LOT_INPUTS,
  classLot,
  scopePairs,
  jsonbText,
  canonicalText,
  rowSha,
  verifyRowSha,
  storageWithinBudget,
};
