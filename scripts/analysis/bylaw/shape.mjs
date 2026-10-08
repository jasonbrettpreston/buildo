// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §9 G-SHAPE ("JSON Schema on every seed and authored file;
//            every value in `vocab.json`; on rows with an agreed or adjudicated record: every authored field present
//            ("none" written), no generated field authored (a sealed `.a` without its `.b` is `pending`, never a failure);
//            §7.3 shape per unit; every authored key resolves to a row; computes `row_status` (§4 (a)–(e)) from all gate
//            results, so it runs last among content gates"), §4 (row state), §6 (G / A / ⧉), §6.5 `feeds` (G-SHAPE
//            totality), §7.3 (per-archetype shape + the cross-cutting `modelled` rule); docs/specs/01-pipeline/
//            69_mcbylaw_policy.md M-17, M-45, M-52, M-56; docs/reports/mcbylaw-phase1-plan.md S6
//
// G-SHAPE. PURE. Runs last among the content gates: `gates` carries the other gates' results ({<gate>: {violations}}),
// whose unit- / row-attributed violations make a row `failed`.
//
//   checkShape({slice, shards, vocab, agree?, adjudications?, gates?, inScopeIds?, external?})
//       → {status, pass, checked, violations, counts:{complete, pending, 'pending:stale', failed, …}, rows:[{regulation_id,
//          row_status, why}]}
//   ROW_STATUSES, selfTest()
//
// Row state (§4), first match wins: `failed` — an agreed / adjudicated unit (not stale) that a gate rejects, incl. this
// gate; `pending:stale` — an agreed unit whose pin (prov.unit_shas, copied from the brief) ≠ the current unit sha;
// `pending` — no authored entry, a draft awaiting its pair or an adjudication, or a leaf no agreed unit covers;
// `complete` — otherwise (row fields present, every leaf covered by agreed units, every pin current), unless the row holds
// a City repeat-letter unit (slice defect `source_repeat_letter`) with no adjudications.json entry of kind
// `source_repeat_letter` on a closed basis (enacting_text | expert): then `pending`, why `repeat_letter_unadjudicated: …`
// (operator ruling Q-K7b, Spec 69 M-57 dated note 2026-10-07).
//
// Reason codes (closed):
//   schema_invalid             an authored file does not parse or breaks its declared shape (bylaw-authored-v1)
//   authored_orphan            an authored unit id names no slice row / clause (renumbering is mapped via adoptions.json)
//   generated_field_authored   an agreed unit's draft writes a generated field (Spec 68 §6 G)
//   single_field_in_b          keyer B's draft writes a single-drafted (A) field (data boundary, M-17)
//   field_missing              an agreed unit / its row omits an authored field ("none" is written, never omitted)
//   vocab_value_unknown        an authored value outside its vocab.json list
//   shape_required_missing     a §7.3 required field of the unit's archetype is "none" / empty
//   shape_must_be_none         a §7.3 must-be-"none" field (the expression) is written
//   value_form_not_allowed     the generated value_form is outside the archetype's allowed forms (§7.3)
//   statement_target_mismatch  a LIMIT / DEFINE statement's target ≠ the unit's `target`
//   modelled_without_inputs    calculation_handling `modelled` with an overlay / existing(…) we do not hold, or
//                              applies_to.part ∈ {map_area, named_addresses, lot_list} (§7.3 cross-cutting)
//   feeds_unresolved           a LIMIT / PERMIT / PROHIBIT unit resolves to no (structure, aspect) pair (M-52)

import { DslError, parseCond, parseExpression, valueForm } from './dsl.mjs';
import {
  AUTHORED_SCHEMA, DOUBLE_KEYED, GENERATED_FIELDS, INSTRUMENT_KINDS, OPTIONAL_KEYED, ROW_SINGLE_DRAFTED,
  SINGLE_DRAFTED, buildIndex, gateResult, getField, splitUnitId, unitView, violation,
} from './authored.mjs';
import { checkAgree } from './agree.mjs';
import { displacesOf, includeOf } from './xref.mjs';
import { checkFeedsTotality } from './vocab.mjs';
import { shapeFixtures } from './authored-fixtures.mjs';

export const REASON_CODES = Object.freeze([
  'schema_invalid',
  'authored_orphan',
  'generated_field_authored',
  'single_field_in_b',
  'field_missing',
  'vocab_value_unknown',
  'shape_required_missing',
  'shape_must_be_none',
  'value_form_not_allowed',
  'statement_target_mismatch',
  'modelled_without_inputs',
  'feeds_unresolved',
]);
/** §4 row state, the order G-SHAPE decides it in. */
export const ROW_STATUSES = Object.freeze(['failed', 'pending:stale', 'pending', 'complete']);
/** Closed pending reasons a `why` may start with beyond the §4 ones (Q-K7b). */
export const PENDING_REASONS = Object.freeze(['repeat_letter_unadjudicated']);
/** The bases on which a repeat-letter adjudication counts (Q-K7b: the enacting text, or an expert). */
export const REPEAT_ADJUDICATION_BASES = Object.freeze(['enacting_text', 'expert']);

/** Repeat-letter unit ids adjudicated on a closed basis by a named adjudicator. PURE. */
function repeatAdjudicated(adjudications) {
  const out = new Set();
  for (const e of (adjudications && Array.isArray(adjudications.adjudications) ? adjudications.adjudications : [])) {
    if (e && e.kind === 'source_repeat_letter' && isStr(e.unit) && isStr(e.adjudicator) && REPEAT_ADJUDICATION_BASES.includes(e.basis)) out.add(e.unit);
  }
  return out;
}
/** §7.3 allowed value_form per archetype (null = any except none for LIMIT, any for DEFINE). */
export const ALLOWED_FORMS = Object.freeze({
  LIMIT: ['literal', 'band', 'formula', 'by_building_type', 'if', 'map_lookup', 'existing_as_of'],
  PERMIT: ['none', 'if'],
  PROHIBIT: ['none', 'if'],
  REQUIRE: ['none'],
  DEFINE: ['literal', 'band', 'formula', 'by_building_type', 'if', 'map_lookup', 'existing_as_of', 'none'],
  DISAPPLY: ['none'],
  INCLUDE: ['none'],
  PREVAILING: ['none'],
  PROCEDURAL: ['none'],
  UNUSUAL: ['none'],
});
/** §7.3 "must be none": the expression, for every archetype whose only allowed form is none. */
const EXPRESSION_NONE = Object.freeze(['REQUIRE', 'DISAPPLY', 'INCLUDE', 'PREVAILING', 'PROCEDURAL', 'UNUSUAL']);
const REQUIRED_SINGLE = Object.freeze(['calculation_handling.status', 'calculation_handling.description', 'calculation_handling.gaps', 'disclosure']);
const UNIT_KEYS = new Set(['unit_id', ...DOUBLE_KEYED.map((p) => p.split('.')[0]), ...SINGLE_DRAFTED.map((p) => p.split('.')[0])]);
const NOT_HELD_PARTS = Object.freeze(['map_area', 'named_addresses', 'lot_list']);

const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = (v) => typeof v === 'string' && v.length > 0;
const none = (v) => v === undefined || v === null || v === 'none' || (Array.isArray(v) && v.length === 0);

/** The bylaw-authored-v1 shape of an .a / .b file (the JSON Schema arm, as a closed structural check). */
function fileProblems(doc, keyer, shardKey) {
  const p = [];
  if (!isMap(doc)) return ['not an object'];
  const keys = keyer === 'A' ? ['schema', 'shard', 'keyer', 'units', 'rows'] : ['schema', 'shard', 'keyer', 'units'];
  for (const k of Object.keys(doc)) if (!keys.includes(k)) p.push(`unknown key ${k}`);
  if (doc.schema !== AUTHORED_SCHEMA) p.push(`schema ≠ ${AUTHORED_SCHEMA}`);
  if (doc.shard !== shardKey) p.push(`shard ${doc.shard} ≠ ${shardKey}`);
  if (doc.keyer !== keyer) p.push(`keyer ${doc.keyer} ≠ ${keyer}`);
  if (!Array.isArray(doc.units)) p.push('units is not an array');
  else {
    const ids = new Set();
    for (const u of doc.units) {
      if (!isMap(u) || !isStr(u.unit_id)) {
        p.push('a unit without unit_id');
        continue;
      }
      if (ids.has(u.unit_id)) p.push(`unit ${u.unit_id} twice`);
      ids.add(u.unit_id);
      for (const k of Object.keys(u)) if (!UNIT_KEYS.has(k) && !GENERATED_FIELDS.includes(k)) p.push(`unit ${u.unit_id}: unknown key ${k}`);
    }
  }
  if (keyer === 'A') {
    if (!isMap(doc.rows)) p.push('rows is not an object');
    else for (const [rid, r] of Object.entries(doc.rows)) if (!isMap(r) || Object.keys(r).some((k) => !ROW_SINGLE_DRAFTED.includes(k))) p.push(`rows.${rid} has a key outside ${ROW_SINGLE_DRAFTED.join(', ')}`);
  }
  return p;
}

/** Every authored value of a resolved unit against vocab.json (+ the instrument kinds, a proposed vocab key). */
function vocabProblems(u, vocab) {
  const p = [];
  const inList = (list, x) => Array.isArray(list) && list.includes(x);
  const chk = (ok, what) => {
    if (!ok) p.push(what);
  };
  chk(inList(vocab.archetype, u.archetype), `archetype ${u.archetype}`);
  chk(u.target === 'none' || Object.hasOwn(vocab.dsl_target || {}, u.target), `target ${u.target}`);
  chk(u.bound === 'none' || inList(vocab.bound, u.bound), `bound ${u.bound}`);
  chk(u.requirement === 'none' || inList(vocab.requirement, u.requirement), `requirement ${u.requirement}`);
  chk(u.evaluated_by_us === 'none' || u.evaluated_by_us === 'no', `evaluated_by_us ${u.evaluated_by_us}`);
  if (isMap(u.instrument)) chk(INSTRUMENT_KINDS.includes(u.instrument.kind), `instrument.kind ${u.instrument.kind}`);
  else chk(u.instrument === 'none', `instrument ${JSON.stringify(u.instrument)}`);
  const parts = u.applies_to && u.applies_to.part;
  chk(inList(vocab.applies_to_part, parts), `applies_to.part ${parts}`);
  const ranks = u.ranks_layers;
  if (ranks !== 'none' && ranks !== undefined) {
    // the three forms evaluate.mjs rankedLayers() reads: "a > b, c", [layers], {higher, lower}
    const names = Array.isArray(ranks) ? ranks : isMap(ranks) ? [...[].concat(ranks.higher ?? []), ...[].concat(ranks.lower ?? [])] : String(ranks).split(/[>,]/).map((x) => x.trim()).filter(Boolean);
    for (const n of names) chk(inList(vocab.layer, n), `ranks_layers layer ${n}`);
  }
  const app = isMap(u.application) ? u.application : {};
  for (const z of app.zones || []) chk(z === 'any' || inList(vocab.zone, z), `zone ${z}`);
  for (const t of app.building_types || []) chk(Object.hasOwn(vocab.building_type || {}, t), `building_type ${t}`);
  for (const t of app.lot_conditions || []) chk(Object.hasOwn(vocab.lot_condition || {}, t), `lot_condition ${t}`);
  for (const t of app.uses || []) chk(inList(vocab.uses, t), `use ${t}`);
  const cond = u.condition;
  if (isMap(cond)) for (const t of [].concat(cond.tokens ?? cond.token ?? [])) chk(t === 'none' || Object.hasOwn(vocab.lot_condition || {}, t), `condition token ${t}`);
  for (const e of Array.isArray(u.literals_not_expressed) ? u.literals_not_expressed : []) chk(inList(vocab.literal_not_expressed_reason, e && e.reason), `literals_not_expressed reason ${e && e.reason}`);
  const ch = isMap(u.calculation_handling) ? u.calculation_handling : {};
  chk(inList(vocab.calculation_handling_status, ch.status), `calculation_handling.status ${ch.status}`);
  chk(none(ch.not_modelled_reason) || inList(vocab.not_modelled_reason, ch.not_modelled_reason), `not_modelled_reason ${ch.not_modelled_reason}`);
  for (const x of Array.isArray(ch.user_inputs) ? ch.user_inputs : []) chk(inList(vocab.user_input, x), `user_input ${x}`);
  const fid = u.input_fidelity && u.input_fidelity.status;
  if (fid !== undefined) chk(inList(vocab.input_fidelity_status, fid), `input_fidelity.status ${fid}`);
  return p;
}

/** §7.3 shape of one resolved unit. Returns [code, detail][]. */
function shapeProblems(u, index, vocab, external) {
  const p = [];
  const a = u.archetype;
  const ch = isMap(u.calculation_handling) ? u.calculation_handling : {};
  let sts = [];
  let vf = null; // unknown when the DSL does not parse (G-CLAUSE reports expression_unparseable); every other arm still runs
  try {
    sts = parseExpression(u.numeric_expression);
    vf = valueForm(u.numeric_expression);
  } catch (err) {
    if (!(err instanceof DslError)) throw err;
  }
  let cond = null;
  try {
    cond = isMap(u.condition) && u.condition.if && u.condition.if !== 'none' ? parseCond(u.condition.if) : null;
  } catch (err) {
    if (!(err instanceof DslError)) throw err;
  }
  const req = (cond, what) => {
    if (!cond) p.push(['shape_required_missing', what]);
  };
  const app = isMap(u.application) ? u.application : {};
  const subject = (app.building_types || []).length + (app.uses || []).length > 0;
  if (a === 'LIMIT') {
    req(!none(u.target), 'LIMIT needs a target');
    req(!none(u.bound), 'LIMIT needs a bound');
    req(!none(u.numeric_expression), 'LIMIT needs a numeric_expression');
  }
  if (a === 'PERMIT' || a === 'PROHIBIT') req(subject, `${a} needs an application subject token`);
  if (a === 'REQUIRE') {
    req(subject, 'REQUIRE needs a subject');
    req(!none(u.requirement), 'REQUIRE needs a requirement');
  }
  if (a === 'DISAPPLY') {
    const d = displacesOf(index, u.unit_id, vocab, external);
    req(d.targets.length + d.unresolved.length > 0, 'DISAPPLY needs ≥ 1 displaces[] entry');
  }
  if (a === 'INCLUDE') {
    const inc = includeOf(index, u.unit_id, external);
    req(inc && inc.citation, 'INCLUDE needs an include_ref');
  }
  if (a === 'PREVAILING') {
    req(!none(u.instrument), 'PREVAILING needs an instrument');
    req(u.evaluated_by_us === 'no', 'PREVAILING needs evaluated_by_us: no');
  }
  if (a === 'UNUSUAL') {
    req(!none(ch.not_modelled_reason), 'UNUSUAL needs a not_modelled_reason');
    req(!none(u.disclosure), 'UNUSUAL needs a disclosure');
  }
  if (EXPRESSION_NONE.includes(a) && !none(u.numeric_expression)) p.push(['shape_must_be_none', `${a}: numeric_expression must be "none"`]);
  else if (vf !== null && ALLOWED_FORMS[a] && !ALLOWED_FORMS[a].includes(vf)) p.push(['value_form_not_allowed', `${a} × ${vf}`]);
  if ((a === 'LIMIT' || a === 'DEFINE') && !none(u.target)) for (const s of sts) if (s.target !== u.target) p.push(['statement_target_mismatch', `statement target ${s.target} ≠ unit target ${u.target}`]);
  // cross-cutting (§7.3): what we do not hold cannot be `modelled`
  if (ch.status === 'modelled') {
    const nodes = [];
    const walk = (n) => {
      if (!n || typeof n !== 'object') return;
      if (typeof n.type === 'string') nodes.push(n);
      for (const x of Object.values(n)) walk(x);
    };
    walk(sts);
    walk(cond);
    const overlays = nodes.filter((n) => n.type === 'overlay' || n.type === 'mapped').map((n) => n.code);
    const notHeld = [...new Set(overlays)].filter((c) => !(vocab.overlay_code && vocab.overlay_code[c] && vocab.overlay_code[c].held === true)).sort();
    if (notHeld.length) p.push(['modelled_without_inputs', `overlay ${notHeld.join(', ')} geometry is not declared held`]);
    if (nodes.some((n) => n.type === 'existing')) p.push(['modelled_without_inputs', 'existing(…) needs as-built input']);
    if (NOT_HELD_PARTS.includes(u.applies_to && u.applies_to.part)) p.push(['modelled_without_inputs', `applies_to.part ${u.applies_to.part}`]);
  }
  return p;
}

/** G-SHAPE + row_status. PURE. */
export function checkShape({ slice, shards = [], vocab, agree = null, adjudications = null, gates = {}, inScopeIds = null, external = null } = {}) {
  const v = [];
  const index = buildIndex(slice);
  const ag = agree || checkAgree({ shards, adjudications, vocab });
  const counts = { complete: 0, pending: 0, 'pending:stale': 0, failed: 0, units_checked: 0, draft_failures: ag.counts ? ag.counts.draft_failures : 0 };

  // files: schema + orphans (every draft, any state)
  const orphans = new Set();
  const pins = new Map(); // unit_id → pinned sha
  const rowFields = new Map(); // regulation_id → A row fields
  const drafts = new Map(); // unit_id → {a, b}
  for (const s of [...shards].sort((x, y) => cmpStr(String(x.key), String(y.key)))) {
    for (const e of s.parse_errors || []) v.push(violation('schema_invalid', s.key, e));
    for (const [k, keyer] of [['a', 'A'], ['b', 'B']]) {
      const doc = s[k];
      if (!doc) continue;
      for (const prob of fileProblems(doc, keyer, s.key)) v.push(violation('schema_invalid', s.paths[k] || s.key, prob));
      for (const u of Array.isArray(doc.units) ? doc.units : []) {
        if (!isMap(u) || !isStr(u.unit_id)) continue;
        if (!unitView(index, u.unit_id) && !orphans.has(u.unit_id)) {
          orphans.add(u.unit_id);
          v.push(violation('authored_orphan', u.unit_id, `${s.key}: names no row / clause of the slice`));
        }
        if (!drafts.has(u.unit_id)) drafts.set(u.unit_id, {});
        const prev = drafts.get(u.unit_id)[`${k}_shard`];
        if (prev && prev !== s.key) v.push(violation('schema_invalid', u.unit_id, `keyed in shards ${prev} and ${s.key}`));
        drafts.get(u.unit_id)[k] = u;
        drafts.get(u.unit_id)[`${k}_shard`] = s.key;
      }
    }
    if (s.a && isMap(s.a.rows)) {
      for (const [rid, r] of Object.entries(s.a.rows)) {
        if (!index.rows.has(rid)) v.push(violation('authored_orphan', rid, `${s.key}: rows.${rid} names no slice row`));
        else if (rowFields.has(rid)) v.push(violation('schema_invalid', rid, `row fields written in two shards (${s.key})`));
        rowFields.set(rid, r);
      }
    }
    if (s.prov && isMap(s.prov.unit_shas)) for (const [id, sha] of Object.entries(s.prov.unit_shas)) pins.set(id, sha);
  }

  // agreed / adjudicated units: fields, vocab, §7.3, feeds
  const unitBad = new Map(); // unit_id → [violations]
  const flag = (id, code, detail) => {
    const x = violation(code, id, detail);
    v.push(x);
    if (!unitBad.has(id)) unitBad.set(id, []);
    unitBad.get(id).push(x);
  };
  const agreed = [...ag.units].filter(([id, r]) => (r.state === 'agreed' || r.state === 'adjudicated') && !orphans.has(id)).sort((x, y) => cmpStr(x[0], y[0]));
  for (const [id, rec] of agreed) {
    counts.units_checked++;
    const u = rec.unit;
    const d = drafts.get(id) || {};
    for (const [k, draft] of [['a', d.a], ['b', d.b]]) {
      if (!draft) continue;
      for (const g of GENERATED_FIELDS) if (Object.hasOwn(draft, g)) flag(id, 'generated_field_authored', `keyer ${k.toUpperCase()} wrote ${g}`);
      for (const f of DOUBLE_KEYED) if (!OPTIONAL_KEYED.includes(f) && getField(draft, f) === undefined) flag(id, 'field_missing', `keyer ${k.toUpperCase()} omits ${f}`);
    }
    if (d.b) for (const f of SINGLE_DRAFTED) if (getField(d.b, f) !== undefined) flag(id, 'single_field_in_b', `keyer B wrote ${f}`);
    for (const f of REQUIRED_SINGLE) if (getField(u, f) === undefined) flag(id, 'field_missing', `keyer A omits ${f}`);
    for (const x of vocabProblems(u, vocab)) flag(id, 'vocab_value_unknown', x);
    for (const [code, detail] of shapeProblems(u, index, vocab, external)) flag(id, code, detail);
    const feeds = checkFeedsTotality([u], vocab);
    for (const x of feeds.violations) if (x.startsWith('feeds_unresolved')) flag(id, 'feeds_unresolved', x.slice('feeds_unresolved: '.length));
  }

  // other gates' unit / row attributed violations
  const external_bad = new Map();
  const notRunGates = [];
  for (const [gate, res] of Object.entries(gates || {}).sort((x, y) => cmpStr(x[0], y[0]))) {
    if (res && res.status === 'not_run') notRunGates.push(gate); // §4 (c) cannot be shown: no row is `complete`
    for (const x of (res && res.violations) || []) {
      const id = String(x.id ?? '');
      if (!external_bad.has(id)) external_bad.set(id, []);
      external_bad.get(id).push(`${gate} ${x.code}`);
    }
  }

  // row_status
  const unitsByRow = new Map();
  for (const [id, rec] of [...ag.units].sort((x, y) => cmpStr(x[0], y[0]))) {
    const { reg } = splitUnitId(id);
    if (!unitsByRow.has(reg)) unitsByRow.set(reg, []);
    unitsByRow.get(reg).push([id, rec]);
  }
  const scope = inScopeIds ? new Set(inScopeIds) : null;
  const repeatOk = repeatAdjudicated(adjudications);
  const rows = [];
  for (const row of [...index.rows.values()].sort((x, y) => cmpStr(x.regulation_id, y.regulation_id))) {
    const rid = row.regulation_id;
    if (scope && !scope.has(rid)) continue;
    const us = (unitsByRow.get(rid) || []).filter(([id]) => !orphans.has(id));
    let status;
    let why;
    if (!us.length) {
      status = 'pending';
      why = 'no authored entry';
    } else {
      const ok = us.filter(([, r]) => r.state === 'agreed' || r.state === 'adjudicated');
      const stale = ok.filter(([id]) => {
        const view = unitView(index, id);
        return !view || pins.get(id) !== view.sha256;
      });
      const live = ok.filter((x) => !stale.includes(x));
      const bad = live.filter(([id]) => unitBad.has(id) || external_bad.has(id));
      const rowBad = external_bad.get(rid) || [];
      const leaves = row.clauses.filter((c) => c.leaf).map((c) => c.path);
      const cov = new Set();
      for (const [id] of ok) {
        const view = unitView(index, id);
        if (view) for (const l of leaves) if (l.startsWith(view.clause_path)) cov.add(l);
      }
      const allAgreed = ok.length === us.length && leaves.every((l) => cov.has(l));
      if (allAgreed && !stale.length) {
        const rf = rowFields.get(rid);
        if (!isMap(rf) || !isStr(rf.explanation)) flag(rid, 'field_missing', 'row explanation');
        if (!isMap(rf) || !(rf.code_refs === 'none' || Array.isArray(rf.code_refs))) flag(rid, 'field_missing', 'row code_refs ("none" when there are none)');
      }
      if (bad.length || rowBad.length || unitBad.has(rid)) {
        status = 'failed';
        why = [...bad.map(([id]) => `${id}: ${[...(unitBad.get(id) || []).map((x) => `G-SHAPE ${x.code}`), ...(external_bad.get(id) || [])].join(', ')}`), ...rowBad, ...(unitBad.get(rid) || []).map((x) => `G-SHAPE ${x.code}`)].join('; ');
      } else if (stale.length) {
        status = 'pending:stale';
        why = `${stale.map(([id]) => id).join(', ')}: verified_against_sha256 ≠ the current unit sha`;
      } else if (!allAgreed) {
        status = 'pending';
        why = us.filter(([, r]) => r.state === 'pending').map(([id, r]) => `${id}: ${r.why || `open disagreement on ${r.disagreements.join(', ')}`}`).join('; ') || 'a leaf no agreed unit covers';
      } else if (notRunGates.length) {
        status = 'pending';
        why = `gate(s) not run: ${notRunGates.join(', ')}`;
      } else {
        const open = (row.defects || []).filter((d) => d.kind === 'source_repeat_letter').map((d) => `${rid}#${d.clause_path}`).filter((u) => !repeatOk.has(u));
        status = open.length ? 'pending' : 'complete';
        why = open.length ? `repeat_letter_unadjudicated: ${open.join(', ')} (adjudicate on the enacting text or by an expert)` : '';
      }
    }
    counts[status]++;
    rows.push({ regulation_id: rid, row_status: status, why });
  }
  return gateResult({ violations: v, checked: counts.units_checked, counts, rows });
}

/** One known-bad fixture per reason code + a good twin per pinned archetype × value-form pair + the row_status set. */
export function selfTest() {
  const results = [];
  const fixtures = shapeFixtures();
  for (const f of fixtures) {
    const r = checkShape(f.input);
    const codes = [...new Set(r.violations.map((x) => x.code))];
    let ok = f.reason === null ? r.status === 'pass' : r.status === 'fail' && codes.length === 1 && codes[0] === f.reason;
    if (ok && f.expectRows) for (const [id, st] of Object.entries(f.expectRows)) ok = ok && (r.rows.find((x) => x.regulation_id === id) || {}).row_status === st;
    results.push({ name: f.name, expected: f.reason, got: codes, ok });
  }
  const covered = new Set(results.map((x) => x.expected).filter(Boolean));
  for (const c of REASON_CODES) if (!covered.has(c)) results.push({ name: `fixture for ${c}`, expected: c, got: [], ok: false });
  const states = new Set(fixtures.flatMap((f) => Object.values(f.expectRows || {})));
  for (const s of ROW_STATUSES) if (!states.has(s)) results.push({ name: `row_status fixture for ${s}`, expected: null, got: [], ok: false });
  return { pass: results.every((x) => x.ok), results };
}

