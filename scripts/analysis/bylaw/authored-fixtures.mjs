// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §7.3 ("one red-first fixture per archetype × value-form pair
//            that occurs in real text (the set is enumerated and pinned at S6)"), §9 ("every named reason code has a
//            known-bad fixture that fails for that reason, plus a good twin"); docs/reports/mcbylaw-phase1-plan.md S6
//
// Fixtures for the S6 authored-field gates, cut from the LIVE slice: the rows named in FIXTURE_ROW_IDS are taken from
// slice.mjs sliceSnapshot() over the committed snapshot (whatever adoption / slicer version is current), never from a
// hand-pinned copy of their text, so a slicer or vocab change reds the gates' own self-tests (bylaw-s6g.infra) instead
// of only the push suite. Mutation fixtures edit the live row OBJECTS structurally (drop a row, retarget a ref, inject
// an uncovered number), never the text. The committed snapshot is read once, on first use (I/O, like slice.mjs reading
// vocab.json); every fixture builder is otherwise pure.
//
// The archetype × value_form pairs that occur in the Phase 1 pinned text (keyed at S0.5, re-keyed here) — PINNED:
//   LIMIT×literal · LIMIT×band · LIMIT×formula · LIMIT×by_building_type · LIMIT×map_lookup · DEFINE×literal ·
//   DEFINE×map_lookup · DEFINE×none · DISAPPLY×none · PERMIT×none · PROHIBIT×none · REQUIRE×none · PROCEDURAL×none
// Occurring only in Ch.900 exception text (Phase 2 pages, not pinned in Phase 1): INCLUDE×none, PREVAILING×none,
// LIMIT×existing_as_of; UNUSUAL occurred 0 times at S0.5 (Spec 69 M-44 note). Their shape rules are still exercised by
// the G-SHAPE fixtures below on Phase 1 text.

import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadSnapshotPages, sliceSnapshot } from './slice.mjs';
import { DOUBLE_KEYED, AUTHORED_SCHEMA, buildIndex, getField, sha256, unitView } from './authored.mjs';

const require = createRequire(import.meta.url);
export const REAL_VOCAB = Object.freeze(require('../../seeds/bylaw/vocab.json'));
const REAL_ADJ = require('../../seeds/bylaw/adjudications.json');
const SEEDS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'seeds', 'bylaw');

export const PINNED_PAIRS = Object.freeze([
  'LIMIT×literal', 'LIMIT×band', 'LIMIT×formula', 'LIMIT×by_building_type', 'LIMIT×map_lookup', 'DEFINE×literal',
  'DEFINE×map_lookup', 'DEFINE×none', 'DISAPPLY×none', 'PERMIT×none', 'PROHIBIT×none', 'REQUIRE×none', 'PROCEDURAL×none',
]);
/** The live rows the fixtures key or reference (displacement / include / cross-ref targets). */
export const FIXTURE_ROW_IDS = Object.freeze([
  '10.20.40.70(3)', '10.20.40.70(4)', '10.20.40.70(6)', '10.20.40.10(1)', '10.80.40.10(1)', '10.20.40.40(1)', '10.20.40.20(1)',
  '10.20.40.20(4)', '10.20.30.20(1)', '600.60.40(1)', '600.60.40(3)', '900.1.10(2)', '900.1.10(3)', '900.1.10(4)', '1.5.7(1)',
  '10.5.20.40(1)', '10.5.20.40(2)', '10.5.20.40(3)', '10.5.20.40(4)', '10.5.20.40(5)', '10.10.40.1(3)', '10.60.40.1(2)',
  '10.80.40.1(2)', '800.50(445)', '10.80.80.1(1)', '10.10.80.1(1)', '10.40.40.20(2)',
  '10.20.20.100(8)', '10.10.80.200(1)', '10.5.40.40(3)', '10.5.40.40(3)(E)@1075-2026',
  '10.10.20.40(2)', '10.5.40.60(8)', '10.5.40.60(8)(C)@1075-2026',
]);

const clone = (x) => JSON.parse(JSON.stringify(x));
let LIVE = null;
/** The live slice of the committed snapshot (read and cut once). */
export function liveSlice() {
  if (!LIVE) {
    const p = loadSnapshotPages(SEEDS);
    LIVE = sliceSnapshot({ pages: p.pages, enacting: p.enacting, scope: p.scope });
  }
  return LIVE;
}

/** The fixture slice: the FIXTURE_ROW_IDS rows and their units, cloned from the live slice; `edit(rowsById)` may drop
 * or structurally edit rows (units follow the rows that remain). A fixture id missing from the live slice throws. */
export function fixtureSlice(edit = null) {
  const live = liveSlice();
  const byId = new Map();
  for (const id of FIXTURE_ROW_IDS) {
    const r = live.rows.find((x) => x.regulation_id === id);
    if (!r) throw new Error(`fixture row ${id} is not in the live slice (${live.slicer_version})`);
    byId.set(id, clone(r));
  }
  if (edit) edit(byId);
  const rows = [...byId.values()];
  const ids = new Set(rows.map((r) => r.regulation_id));
  return { rows, units: clone(live.units.filter((u) => ids.has(u.regulation_id))) };
}
/** Retarget the first ref of a row whose citation is `from` (a structural edit of live output, offsets kept). */
export const retargetRef = (id, from, to) => (m) => {
  const r = m.get(id);
  const ref = r.refs.find((x) => x.citation === from);
  if (!ref) throw new Error(`fixture: ${id} has no ref ${from}`);
  ref.citation = to;
};
/** Add a ref at the start of a row's root clause (no trigger precedes it, so it is a plain cross-reference). */
export const injectRef = (id, citation) => (m) => {
  const r = m.get(id);
  r.refs = [{ citation, clause_path: r.clauses[0].path, end: 0, start: 0, raw: citation, via: 'direct' }, ...r.refs];
};

// ---------------------------------------------------------------- the good units (keyer A drafts; ⧉ + A fields)

const ALL_ZONES = ['R', 'RD', 'RS', 'RT', 'RM'];
const base = (unit_id, o) => ({
  unit_id,
  archetype: 'LIMIT',
  target: 'none',
  bound: 'none',
  requirement: 'none',
  instrument: 'none',
  evaluated_by_us: 'none',
  ranks_layers: 'none',
  condition: 'none',
  applies_to: { part: 'whole' },
  numeric_expression: 'none',
  literals_not_expressed: [],
  application: { zones: [], building_types: [], lot_conditions: [], uses: [], evidence: {} },
  disclosure: 'none',
  not_an_override: [],
  ...o,
  calculation_handling: { status: 'modelled', description: 'none', gaps: 'none', not_modelled_reason: 'none', user_inputs: [], ...(o.calculation_handling || {}) },
});
const app = (zones, building_types, evidence, lot_conditions = [], uses = []) => ({ zones, building_types, lot_conditions, uses, evidence });

/** The good twins, one per pinned pair (some pairs have two real instances). Keyed by fixture name. */
export const GOOD = Object.freeze({
  'LIMIT×literal': base('10.20.40.70(3)#(3)(A)', { target: 'side_setback_m', bound: 'min', condition: { tokens: ['required_frontage_band'], if: 'required_lot_frontage_m < 6.0 m' }, numeric_expression: ['side_setback_m = 0.6 m @(A)'], application: app(['RD'], ['any'], { RD: 'in the RD zone', required_frontage_band: 'required minimum lot frontage' }, ['required_frontage_band']) }),
  'LIMIT×band': base('10.20.40.70(3)#(3)', { target: 'side_setback_m', bound: 'min', numeric_expression: ['side_setback_m = band(required_lot_frontage_m; < 6.0 m: 0.6 m; ≥ 6.0 m and < 12.0 m: 0.9 m; ≥ 12.0 m and < 15.0 m: 1.2 m; ≥ 15.0 m and < 18.0 m: 1.5 m; ≥ 18.0 m and < 24.0 m: 1.8 m; ≥ 24.0 m and < 30.0 m: 2.4 m; ≥ 30.0 m: 3.0 m) @(3)'], application: app(['RD'], ['any'], { RD: 'in the RD zone' }) }),
  'LIMIT×map_lookup': base('10.20.40.10(1)#(1)(A)', { target: 'height_m', bound: 'max', numeric_expression: ['height_m = overlay(HT) @(A)'], application: app(['RD'], ['any'], { RD: 'in the RD zone' }), calculation_handling: { status: 'partially_modelled' } }),
  'LIMIT×formula': base('10.20.40.10(1)#(1)(C)', { target: 'height_m', bound: 'max', numeric_expression: ['height_m = max(overlay(HT) @(C)(i); 10.0 m @(C)(ii)) @(C)'], application: app(['RD'], ['detached_houseplex'], { RD: 'in the RD zone', detached_houseplex: 'for a detached houseplex' }), calculation_handling: { status: 'partially_modelled' } }),
  'LIMIT×by_building_type': base('10.80.40.10(1)#(1)(B)', { target: 'height_m', bound: 'max', condition: { tokens: [], if: 'not mapped(HT)' }, numeric_expression: ['height_m = by_type(detached_house: 10.0 m; semi_detached_house: 10.0 m; other: 12.0 m) @(B)'], application: app(['RM'], ['any'], { RM: 'in the RM zone' }), calculation_handling: { status: 'partially_modelled' } }),
  'LIMIT×by_building_type (whole)': base('10.20.40.20(4)#whole', { target: 'building_length_m', bound: 'max', condition: { tokens: ['major_street'] }, numeric_expression: ['building_length_m = by_type(townhouse: 19.0 m; apartment_building: 25.0 m) @(4)'], application: app(['RD'], ['townhouse', 'apartment_building'], { RD: 'in the RD zone', townhouse: 'for a townhouse', apartment_building: 'for an apartment building', major_street: 'abuts a major street' }, ['major_street']) }),
  'LIMIT×literal (unlimited)': base('10.20.40.40(1)#(1)(B)', { target: 'fsi', bound: 'max', condition: { tokens: [], if: 'not labelled(d)' }, numeric_expression: ['fsi = unlimited @(B)'], application: app(['RD'], ['any'], { RD: 'In the RD zone' }) }),
  'LIMIT×literal (whole, displaces)': base('10.20.40.70(6)#whole', { target: 'side_setback_street_m', bound: 'min', condition: { tokens: ['corner_lot', 'adjacent_lot_fronts_flanking_street', 'required_frontage_band'], if: 'required_lot_frontage_m ≥ 12.0 m' }, numeric_expression: ['side_setback_street_m = 3.0 m @(6)'], application: app(['RD'], ['any'], { RD: 'in the RD zone', corner_lot: 'for a corner lot', adjacent_lot_fronts_flanking_street: 'an adjacent lot fronting on the street', required_frontage_band: 'required minimum lot frontage' }, ['corner_lot', 'adjacent_lot_fronts_flanking_street', 'required_frontage_band']) }),
  'LIMIT×literal (label condition)': base('600.60.40(1)#(1)(A)', { target: 'dwelling_units_max', bound: 'max', condition: { tokens: ['label_value'], if: 'labelled(u) and label(u) < 6 units' }, numeric_expression: ['dwelling_units_max = 6 units @(A)'], application: app([], ['any'], { label_value: 'a zone label contains the letter' }, ['label_value']) }),
  'DEFINE×map_lookup': base('10.20.30.20(1)#(1)(A)', { archetype: 'DEFINE', target: 'required_lot_frontage_m', condition: { tokens: [], if: 'labelled(f)' }, numeric_expression: ['required_lot_frontage_m = label(f) @(A)'], application: app(['RD'], ['any'], { RD: 'In the RD zone' }) }),
  'DEFINE×literal': base('10.20.30.20(1)#(1)(B)', { archetype: 'DEFINE', target: 'required_lot_frontage_m', condition: { tokens: [], if: 'not labelled(f)' }, numeric_expression: ['required_lot_frontage_m = 12.0 m @(B)'], application: app(['RD'], ['any'], { RD: 'In the RD zone' }) }),
  'DEFINE×none (M-39)': base('600.60.40(3)#(3)(C)', { archetype: 'DEFINE', application: app(ALL_ZONES, [], { R: 'Zoning By-law 569-2013', RD: 'Zoning By-law 569-2013', RS: 'Zoning By-law 569-2013', RT: 'Zoning By-law 569-2013', RM: 'Zoning By-law 569-2013', lawfully_existing: 'building permit was lawfully issued' }, ['lawfully_existing']), calculation_handling: { status: 'informational' } }),
  'DISAPPLY×none': base('10.20.40.40(1)#(1)(C)', { archetype: 'DISAPPLY', application: app(['RD'], ['detached_houseplex'], { RD: 'In the RD zone', detached_houseplex: 'to a detached houseplex' }) }),
  'PERMIT×none': base('600.60.40(1)#(1)(B)', { archetype: 'PERMIT', literals_not_expressed: [{ literal: 'five', clause: '(1)(B)', reason: 'threshold_used_in_application' }, { literal: 'six dwelling units', clause: '(1)(B)', reason: 'threshold_used_in_application' }], application: app(ALL_ZONES, ['detached_houseplex'], { R: 'the Residential Zone category', RD: 'the Residential Zone category', RS: 'the Residential Zone category', RT: 'the Residential Zone category', RM: 'the Residential Zone category', detached_houseplex: 'a detached houseplex' }) }),
  'PROHIBIT×none': base('600.60.40(3)#(3)(D)', { archetype: 'PROHIBIT', application: app(ALL_ZONES, ['semi_detached_houseplex', 'semi_detached_house', 'townhouse'], { R: 'the Residential Zone category', RD: 'the Residential Zone category', RS: 'the Residential Zone category', RT: 'the Residential Zone category', RM: 'the Residential Zone category', semi_detached_houseplex: 'a semi-detached houseplex', semi_detached_house: 'a semi-detached house', townhouse: 'or a townhouse' }) }),
  'REQUIRE×none': base('600.60.40(3)#(3)(B)', { archetype: 'REQUIRE', requirement: 'comply_or_minor_variance', application: app([], ['any'], { lawfully_existing: 'a lawfully existing building' }, ['lawfully_existing']) }),
  'PROCEDURAL×none': base('900.1.10(3)#whole', { archetype: 'PROCEDURAL', ranks_layers: 'exception > base, overlay', calculation_handling: { status: 'informational' } }),
  'PROCEDURAL×none (not_an_override)': base('900.1.10(4)#(4)(C)(iii)', { archetype: 'PROCEDURAL', not_an_override: [{ phrase: 'despite', reason: 'condition_not_displacement' }], calculation_handling: { status: 'informational' } }),
});

/** The value of `pair` for a GOOD key ("LIMIT×literal (whole, displaces)" → "LIMIT×literal"). */
export const pairOf = (name) => name.split(' ')[0];

/** Keyer B's draft: the ⧉ fields of A's draft only. */
export function bDraftOf(a) {
  const out = { unit_id: a.unit_id };
  for (const p of DOUBLE_KEYED) {
    const v = getField(a, p);
    if (v === undefined) continue;
    const ks = p.split('.');
    let cur = out;
    for (const k of ks.slice(0, -1)) cur = cur[k] ||= {};
    cur[ks[ks.length - 1]] = clone(v);
  }
  return out;
}

/** A shard holding the given A drafts (B = their ⧉ projection unless `b` given), with a consistent provenance record. */
export function shardOf(units, { key = null, a = null, b = undefined, prov = undefined, rows = null, slice = null } = {}) {
  const first = units[0].unit_id.split('#')[0];
  const article = first.replace(/\(\d+\)$/, '');
  const sl = slice || fixtureSlice();
  const aDoc = a || { schema: AUTHORED_SCHEMA, shard: key || `fx/${article}`, keyer: 'A', units: clone(units), rows: rows || Object.fromEntries([...new Set(units.map((u) => u.unit_id.split('#')[0]))].map((r) => [r, { explanation: `The by-law sets this rule in ${r}.`, code_refs: 'none' }])) };
  const bDoc = b === undefined ? { schema: AUTHORED_SCHEMA, shard: aDoc.shard, keyer: 'B', units: units.map(bDraftOf) } : b;
  const aBytes = Buffer.from(JSON.stringify(aDoc), 'utf8');
  const unitShas = {};
  for (const u of units) unitShas[u.unit_id] = unitSha(sl, u.unit_id);
  const pv = prov === undefined
    ? { schema: AUTHORED_SCHEMA, shard: aDoc.shard, keyers: { a: { id: 'keyer-a:claude', engine: 'claude' }, b: { id: 'keyer-b:deepseek', engine: 'deepseek' } }, briefs: { a: 'a'.repeat(64), b: 'b'.repeat(64) }, a_seal: { sha256: sha256(aBytes), seal_id: 1 }, b_run: { run_id: 'run-1', ledger_sha256: 'c'.repeat(64), read_paths: [`.cursor/briefs/${article}.b.md`], worktree_commit: 'f'.repeat(40) }, unit_shas: unitShas }
    : prov;
  const k = aDoc.shard;
  return { key: k, page: 'fx', article, paths: { a: `scripts/seeds/bylaw/authored/${k}.a.json`, b: `scripts/seeds/bylaw/authored/${k}.b.json`, prov: `scripts/seeds/bylaw/authored/${k}.prov.json` }, a: aDoc, b: bDoc, prov: pv, a_sha256: sha256(aBytes), b_sha256: bDoc ? sha256(Buffer.from(JSON.stringify(bDoc), 'utf8')) : null, prov_sha256: pv ? sha256(Buffer.from(JSON.stringify(pv), 'utf8')) : null, parse_errors: [] };
}
function unitSha(sl, unitId) {
  const v = unitView(buildIndex(sl), unitId); // exactly what G-SHAPE compares the pin with
  return v ? v.sha256 : 'missing';
}

/** Spec 69a M-80: a re-key generation `<key>~r<n>` of `old` holding `units`, its prov recording what it supersedes. */
export function rekeyOf(old, units, { gen = 1, seal_id = 2, b = undefined } = {}) {
  const key = `${old.key}~r${gen}`;
  const s = shardOf(units, { key, b });
  s.prov.a_seal.seal_id = seal_id;
  s.prov.supersedes = { a_sha: old.a_sha256, b_sha: old.b_sha256, prov_sha: old.prov_sha256 };
  return s;
}

export const realAdjudications = () => clone(REAL_ADJ);
const mutU = (name, fn) => {
  const u = clone(GOOD[name]);
  fn(u);
  return u;
};
const unitsMap = (...us) => new Map(us.map((u) => [u.unit_id, u]));

// ---------------------------------------------------------------- per-gate fixtures

/** G-AGREE: {name, reason, input:{shards, adjudications, vocab}}. */
export function agreeFixtures() {
  const g = GOOD['LIMIT×literal'];
  const disagree = () => {
    const s = shardOf([g]);
    s.b.units[0].bound = 'max';
    return s;
  };
  const adj = (o) => ({ adjudications: [{ id: 'ADJ-1', kind: 'disagreement', unit: g.unit_id, field: 'bound', adjudicator: 'operator', decision: 'a', reason: '"The required minimum side yard setback" — a minimum.', ...o }] });
  const vocab = REAL_VOCAB;
  return [
    { name: 'good twin: every ⧉ field agrees', reason: null, input: { shards: [shardOf(Object.values(GOOD).slice(0, 4))], vocab }, expect: (r) => r.counts.units_agreed === 4 && r.agreement_rate === 1 },
    { name: 'good twin: a disagreement adjudicated by the operator', reason: null, input: { shards: [disagree()], adjudications: adj({}), vocab }, expect: (r) => r.counts.units_adjudicated === 1 && r.units.get(g.unit_id).unit.bound === 'min' },
    { name: 'pending never fails: an open disagreement', reason: null, input: { shards: [disagree()], vocab }, expect: (r) => r.counts.units_pending === 1 && r.counts.disagreements_open === 1 },
    { name: 'pending never fails: a sealed .a with no .b', reason: null, input: { shards: [{ ...shardOf([g]), b: null }], vocab }, expect: (r) => r.counts.units_pending === 1 },
    { name: 'canonical agreement: 6 m ≡ 6.0 m, max args reordered', reason: null, input: { shards: [(() => { const s = shardOf([GOOD['LIMIT×formula']]); s.b.units[0].numeric_expression = ['height_m = max(10 m @(C)(ii); overlay(HT) @(C)(i)) @(C)']; return s; })()], vocab }, expect: (r) => r.counts.units_agreed === 1 },
    { name: 'no canonical form, no agreement: identical unparseable drafts stay pending', reason: null, input: { shards: [(() => { const s = shardOf([g]); s.a.units[0].numeric_expression = ['side_setback_m = 0.6 @(A)']; s.b.units[0].numeric_expression = ['side_setback_m = 0.6 @(A)']; return s; })()], vocab }, expect: (r) => r.counts.units_pending === 1 && r.counts.draft_failures === 2 },
    // applies_to left the ⧉ set at the A1 narrowing (M-17 dated note); the alias stays exercised with an explicit ⧉ set
    { name: 'the Spec 68 §6 field name applies_to.part is adjudicable', reason: null, input: { doubleKeyed: [...DOUBLE_KEYED, 'applies_to'], shards: [(() => { const s = shardOf([g]); s.b.units[0].applies_to = { part: 'map_area' }; return s; })()], adjudications: { adjudications: [{ id: 'ADJ-P', kind: 'disagreement', unit: g.unit_id, field: 'applies_to.part', adjudicator: 'operator', decision: 'a', reason: 'the clause names no map' }] }, vocab }, expect: (r) => r.counts.units_adjudicated === 1 },
    { name: 'adjudicator_missing', reason: 'adjudicator_missing', input: { shards: [disagree()], adjudications: adj({ adjudicator: '' }), vocab } },
    { name: 'adjudicator_is_keyer', reason: 'adjudicator_is_keyer', input: { shards: [disagree()], adjudications: adj({ adjudicator: 'keyer-b:deepseek' }), vocab } },
    { name: 'adjudication_decision_invalid', reason: 'adjudication_decision_invalid', input: { shards: [disagree()], adjudications: adj({ decision: 'value' }), vocab } },
    { name: 'adjudication_duplicate', reason: 'adjudication_duplicate', input: { shards: [disagree()], adjudications: { adjudications: [...adj({}).adjudications, { ...adj({}).adjudications[0], id: 'ADJ-2' }] }, vocab } },
    { name: 'adjudicator_is_keyer: no keyer ids recorded (fail closed)', reason: 'adjudicator_is_keyer', input: { shards: [{ ...disagree(), prov: null }], adjudications: adj({}), vocab } },
    { name: 'adjudication_duplicate: order-independent (invalid entry first)', reason: 'adjudication_duplicate', input: { shards: [disagree()], adjudications: { adjudications: [{ ...adj({}).adjudications[0], id: 'ADJ-0', decision: 'x' }, ...adj({}).adjudications] }, vocab } },
    { name: 'adjudication_orphan', reason: 'adjudication_orphan', input: { shards: [shardOf([g])], adjudications: adj({}), vocab } },
    { name: 'adjudication_kind_invalid', reason: 'adjudication_kind_invalid', input: { shards: [shardOf([g])], adjudications: { adjudications: [{ id: 'ADJ-9', kind: 'opinion', unit: g.unit_id, adjudicator: 'operator' }] }, vocab } },
    // M-75 corrections: a sealed draft is corrected by a record, never edited. `application` is A-only (not ⧉).
    { name: 'good twin: a correction on an A-only field (application)', reason: null, input: { shards: [shardOf([g])], adjudications: { adjudications: [{ id: `COR-${g.unit_id}/application`, kind: 'correction', unit: g.unit_id, field: 'application', value: { zones: ['RS'], building_types: ['any'], lot_conditions: [], uses: [], evidence: { RS: 'in the RS zone' } }, reason: 'the clause names the RS zone, not RD', rule: 'Spec 68 §6.4 rule 4 — application lists the named zone', adjudicator: 'operator', adjudicated_on: '2026-10-08' }] }, vocab }, expect: (r) => r.counts.corrections === 1 && r.counts.units_agreed === 1 && r.units.get(g.unit_id).unit.application.zones[0] === 'RS' },
    { name: 'correction_orphan', reason: 'correction_orphan', input: { shards: [shardOf([g])], adjudications: { adjudications: [{ id: 'COR-1', kind: 'correction', unit: g.unit_id, field: 'not_a_field', value: 'x', reason: 'x', rule: 'Spec 68 §7.4', adjudicator: 'operator' }] }, vocab } },
    { name: 'correction_rule_missing', reason: 'correction_rule_missing', input: { shards: [shardOf([g])], adjudications: { adjudications: [{ id: 'COR-2', kind: 'correction', unit: g.unit_id, field: 'application', value: { zones: ['RS'], building_types: ['any'], lot_conditions: [], uses: [], evidence: {} }, reason: 'x', rule: '', adjudicator: 'operator' }] }, vocab } },
    { name: 'correction_duplicate', reason: 'correction_duplicate', input: { shards: [shardOf([g])], adjudications: { adjudications: [{ id: 'COR-3', kind: 'correction', unit: g.unit_id, field: 'application', value: { zones: ['RS'], building_types: ['any'], lot_conditions: [], uses: [], evidence: {} }, reason: 'x', rule: 'Spec 68 §7.4', adjudicator: 'operator' }, { id: 'COR-4', kind: 'correction', unit: g.unit_id, field: 'application', value: { zones: ['RT'], building_types: ['any'], lot_conditions: [], uses: [], evidence: {} }, reason: 'y', rule: 'Spec 68 §7.4', adjudicator: 'operator' }] }, vocab } },
    // Spec 69a M-75 note 2026-10-08: supersedes — the newest live correction applies; unknown / duplicate supersede is RED
    (() => {
      const app = (z) => ({ zones: [z], building_types: ['any'], lot_conditions: [], uses: [], evidence: { [z]: `in the ${z} zone` } });
      const c1 = { id: `COR-${g.unit_id}/application`, kind: 'correction', unit: g.unit_id, field: 'application', value: app('RS'), reason: 'x', rule: 'Spec 68 §6.4 rule 4', adjudicator: 'operator', adjudicated_on: '2026-10-08' };
      const c2 = { ...c1, id: `${c1.id}~s1`, value: app('RT'), supersedes: c1.id };
      return { name: 'good twin: M-75 supersedes — the superseding correction applies', reason: null, input: { shards: [shardOf([g])], adjudications: { adjudications: [c1, c2] }, vocab }, expect: (r) => r.counts.corrections === 1 && r.counts.corrections_superseded === 1 && r.units.get(g.unit_id).unit.application.zones[0] === 'RT' };
    })(),
    { name: 'correction_supersedes_unknown', reason: 'correction_supersedes_unknown', input: { shards: [shardOf([g])], adjudications: { adjudications: [{ id: 'COR-S1', kind: 'correction', unit: g.unit_id, field: 'application', value: { zones: ['RS'], building_types: ['any'], lot_conditions: [], uses: [], evidence: {} }, reason: 'x', rule: 'Spec 68 §7.4', adjudicator: 'operator', supersedes: 'COR-nope' }] }, vocab } },
    (() => {
      const base = { kind: 'correction', unit: g.unit_id, field: 'application', reason: 'x', rule: 'Spec 68 §7.4', adjudicator: 'operator' };
      const v = (z) => ({ zones: [z], building_types: ['any'], lot_conditions: [], uses: [], evidence: {} });
      return { name: 'correction_supersede_duplicate', reason: 'correction_supersede_duplicate', input: { shards: [shardOf([g])], adjudications: { adjudications: [{ ...base, id: 'COR-D', value: v('RS') }, { ...base, id: 'COR-D~s1', value: v('RT'), supersedes: 'COR-D' }, { ...base, id: 'COR-D~s1b', value: v('RM'), supersedes: 'COR-D' }] }, vocab } };
    })(),
    // Spec 69a M-80: the old generation disagrees on bound; the re-key generation agrees → the unit is agreed, from the newest
    { name: 'good twin: M-80 — a re-key generation supersedes the older drafts of its units', reason: null, input: { shards: (() => { const old = shardOf([g]); old.b.units[0].bound = 'max'; return [old, rekeyOf(old, [g])]; })(), vocab }, expect: (r) => r.counts.units_agreed === 1 && r.counts.units_pending === 0 && r.counts.superseded_units === 1 },
    { name: 'pending never fails: M-80 — a re-key generation with only its .a makes the unit pending', reason: null, input: { shards: (() => { const old = shardOf([g]); const nu = rekeyOf(old, [g]); nu.b = null; return [old, nu]; })(), vocab }, expect: (r) => r.counts.units_pending === 1 && r.counts.units_agreed === 0 },
  ];
}
export function clauseFixtures() {
  const slice = fixtureSlice();
  const vocab = REAL_VOCAB;
  const adjudications = realAdjudications();
  const goods = Object.entries(GOOD).filter(([n]) => !n.startsWith('LIMIT×band')); // the band unit overlaps (3)(A)
  const out = goods.map(([n, u]) => ({ name: `good twin: ${n}`, reason: null, input: { slice, units: unitsMap(u), vocab, adjudications } }));
  out.push({ name: 'good twin: LIMIT×band', reason: null, input: { slice, units: unitsMap(GOOD['LIMIT×band']), vocab, adjudications } });
  const patVocab = clone(REAL_VOCAB);
  patVocab.building_type.detached_houseplex.patterns = ['detached houseplex'];
  const bad = (reason, name, fn, extra = {}) => out.push({ name: reason, reason, input: { slice, units: unitsMap(mutU(name, fn)), vocab, adjudications, ...extra } });
  bad('cited_clause_unresolved', 'LIMIT×literal', (u) => u.numeric_expression.push('side_setback_m = 0.6 m @(Z)'));
  bad('literal_not_in_clause', 'LIMIT×literal', (u) => u.numeric_expression.push('side_setback_m = 0.7 m @(A)'));
  bad('literal_unaccounted', 'LIMIT×literal', (u) => (u.condition = { tokens: ['required_frontage_band'] }));
  bad('literal_unaccounted', 'LIMIT×literal (label condition)', (u) => (u.condition = { tokens: ['label_value'] })); // 600.60.40(1)(A) says "6" twice: one binding discharges one occurrence
  bad('variable_unlicensed', 'LIMIT×literal', (u) => (u.condition = { tokens: ['required_frontage_band'], if: 'lot_depth_m < 6.0 m' }));
  bad('unit_binding', 'LIMIT×literal (label condition)', (u) => (u.numeric_expression = ['dwelling_units_max = 6 m @(A)']));
  bad('expression_unparseable', 'PERMIT×none', (u) => (u.condition = { tokens: [], if: 'labelled(' }));
  bad('evidence_short', 'LIMIT×literal', (u) => (u.application.evidence.RD = 'RD'));
  bad('evidence_not_in_clause', 'LIMIT×literal', (u) => (u.application.evidence.RD = 'in the RM zone'));
  bad('evidence_pattern_mismatch', 'PERMIT×none', (u) => (u.application.evidence.detached_houseplex = 'houseplex with five'), { vocab: patVocab });
  bad('any_with_named_type', 'LIMIT×formula', (u) => (u.application.building_types = ['any']));
  // Spec 69 M-76 A1 both directions, real text: a type named only as an exclusion ("other than an ancillary building",
  // "other than an apartment building") is not named, so `any` passes; a type the clause names positively still fails
  const exclusionOnly = base('10.80.80.1(1)#(1)(A)', { archetype: 'PERMIT', application: app([], ['any'], {}), calculation_handling: { status: 'informational' } });
  out.push({ name: 'good twin: M-76 A1 — types named only as exclusions ("other than an …") leave `any` allowed', reason: null, input: { slice, units: unitsMap(exclusionOnly), vocab, adjudications } });
  const positiveAfterExclusion = base('10.10.80.1(1)#(1)(B)', { archetype: 'PERMIT', application: app([], ['any'], {}), calculation_handling: { status: 'informational' } });
  out.push({ name: 'any_with_named_type: M-76 A1 — the exclusion is dropped, the positively named types still count', reason: 'any_with_named_type', input: { slice, units: unitsMap(positiveAfterExclusion), vocab, adjudications } });
  const s2 = fixtureSlice();
  const r = s2.rows.find((x) => x.regulation_id === '10.20.40.70(3)');
  r.uncovered_numbers = [{ start: 0, end: 1, token: '3', clause_path: '(3)(A)', context: 'an injected slicer miss' }];
  out.push({ name: 'number_uncovered', reason: 'number_uncovered', input: { slice: s2, units: unitsMap(GOOD['LIMIT×literal']), vocab, adjudications } });
  // M-39: the (3)(C) evidence exists only in the enacting excerpt; without the adjudication it is not in the clause
  out.push({ name: 'M-39 both directions: no consolidation_mismatch adjudication → evidence_not_in_clause', reason: 'evidence_not_in_clause', input: { slice, units: unitsMap(GOOD['DEFINE×none (M-39)']), vocab, adjudications: { adjudications: [] } } });
  // A13 + M-76 A10, real text 10.40.40.20(2)(A) "a maximum height of 5.0 metres and one storey": both measures bind the
  // clause's own literals (not the heading "One Storey"); with only height_m the body's "one storey" is unaccounted
  const mixedApp = app(['RS'], ['detached_house', 'semi_detached_house'], { RS: 'In the RS zone', detached_house: 'for a detached house', semi_detached_house: 'an entire semi-detached house' });
  const mixed = base('10.40.40.20(2)#(2)(A)', { target: ['height_m', 'height_storeys'], bound: 'max', numeric_expression: ['height_m = 5.0 m @(A)', 'height_storeys = 1 storeys @(A)'], application: mixedApp });
  out.push({ name: 'good twin: A13 + M-76 A10 — two measures bind the body literals, never the heading', reason: null, input: { slice, units: unitsMap(mixed), vocab, adjudications } });
  out.push({ name: 'literal_unaccounted: A13 — keyed height only, the body "one storey" is unaccounted', reason: 'literal_unaccounted', input: { slice, units: unitsMap({ ...clone(mixed), target: 'height_m', numeric_expression: ['height_m = 5.0 m @(A)'] }), vocab, adjudications } });
  // A12, real text 10.10.20.40(2) "a detached houseplex, semi- detached houseplex, townhouse or apartment building"
  const plex = base('10.10.20.40(2)#whole', { archetype: 'PERMIT', application: app(['R'], ['detached_houseplex', 'semi_detached_houseplex', 'townhouse', 'apartment_building'], { R: 'for the R zone', detached_houseplex: 'a detached houseplex', semi_detached_houseplex: 'semi- detached houseplex', townhouse: 'townhouse or apartment building', apartment_building: 'or apartment building' }), calculation_handling: { status: 'informational' } });
  out.push({ name: 'good twin: A12 — "semi- detached houseplex" matches the pattern "semi-detached houseplex"', reason: null, input: { slice, units: unitsMap(plex), vocab, adjudications } });
  out.push({ name: 'evidence_pattern_mismatch: A12 — the fold does not license a wrong token', reason: 'evidence_pattern_mismatch', input: { slice, units: unitsMap((() => { const u = clone(plex); u.application.evidence.townhouse = 'semi- detached houseplex'; return u; })()), vocab, adjudications } });
  // A6b, real text: enacting 10.5.40.60(8)(C)@1075-2026 "(C) antenna … a maximum of 0.9 metres into …" under the
  // consolidation lead-in "(8) … may encroach …"; without that row the target is unlicensed
  const antenna = base('10.5.40.60(8)(C)@1075-2026#(8)(C)', { target: 'encroachment_m', bound: 'max', numeric_expression: ['encroachment_m = 0.9 m @(8)(C)'], application: app([], ['any'], {}) });
  out.push({ name: 'good twin: A6b — an enacting clause reads the consolidation lead-in ("may encroach")', reason: null, input: { slice, units: unitsMap(antenna), vocab, adjudications } });
  out.push({ name: 'variable_unlicensed: A6b — without the consolidation row the lead-in is absent', reason: 'variable_unlicensed', input: { slice: fixtureSlice((m) => m.delete('10.5.40.60(8)')), units: unitsMap(antenna), vocab, adjudications } });
  return out;
}

/** G-XREF: {name, reason, input:{slice, units, vocab, external}}. */
export function xrefFixtures() {
  const vocab = REAL_VOCAB;
  const external = { entries: [] };
  const slice = fixtureSlice();
  const goods = ['LIMIT×formula', 'LIMIT×literal (whole, displaces)', 'LIMIT×by_building_type (whole)', 'DISAPPLY×none', 'PERMIT×none', 'PROHIBIT×none', 'REQUIRE×none', 'DEFINE×none (M-39)', 'PROCEDURAL×none', 'PROCEDURAL×none (not_an_override)', 'LIMIT×literal (label condition)', 'DEFINE×literal'];
  const out = goods.map((n) => ({ name: `good twin: ${n}`, reason: null, input: { slice, units: unitsMap(GOOD[n]), vocab, external } }));
  const include = (id) => base(id, { archetype: 'INCLUDE', calculation_handling: { status: 'informational' } });
  out.push({ name: 'good twin: INCLUDE resolves to a row', reason: null, input: { slice, units: unitsMap(include('10.20.40.20(4)#whole')), vocab, external } });
  out.push({ name: 'good twin: INCLUDE to a phase2_exception ref (counted)', reason: null, input: { slice: fixtureSlice((m) => m.delete('10.20.40.20(1)')), units: unitsMap(include('10.20.40.20(4)#whole')), vocab, external: { entries: [{ id: 'REF-1', kind: 'ref', citation: '10.20.40.20(1)', url: 'https://www.toronto.ca/x', reason: 'phase2_exception' }] } }, expect: (r) => r.counts.include_to_phase2_ref === 1 });
  out.push({ name: 'ref_unresolved', reason: 'ref_unresolved', input: { slice: fixtureSlice((m) => m.delete('800.50(445)')), units: unitsMap(GOOD['DEFINE×none (M-39)']), vocab, external } });
  out.push({ name: 'displaces_unresolved', reason: 'displaces_unresolved', input: { slice: fixtureSlice((m) => m.delete('10.5.20.40(4)')), units: unitsMap(GOOD['REQUIRE×none']), vocab, external } });
  out.push({ name: 'displaces_self', reason: 'displaces_self', input: { slice: fixtureSlice(retargetRef('10.20.40.70(6)', '10.20.40.70(3)', '10.20.40.70(6)')), units: unitsMap(GOOD['LIMIT×literal (whole, displaces)']), vocab, external } });
  out.push({ name: 'displaces_cycle', reason: 'displaces_cycle', input: { slice: fixtureSlice(retargetRef('10.20.40.70(4)', '10.20.40.70(3)', '10.20.40.70(6)')), units: unitsMap(GOOD['LIMIT×literal (whole, displaces)'], base('10.20.40.70(4)#whole', { target: 'side_setback_m', bound: 'min' })), vocab, external } });
  out.push({ name: 'include_unresolved', reason: 'include_unresolved', input: { slice, units: unitsMap(include('900.1.10(3)#whole')), vocab, external } });
  out.push({ name: 'include_to_ref', reason: 'include_to_ref', input: { slice: fixtureSlice((m) => m.delete('10.20.40.20(1)')), units: unitsMap(include('10.20.40.20(4)#whole')), vocab, external: { entries: [{ id: 'REF-2', kind: 'ref', citation: '10.20.40.20(1)', url: 'https://www.toronto.ca/x', reason: 'outside_page_set' }] } } });
  out.push({ name: 'include_cycle', reason: 'include_cycle', input: { slice: fixtureSlice(injectRef('10.20.40.20(1)', '10.20.40.20(4)')), units: unitsMap(include('10.20.40.20(4)#whole'), include('10.20.40.20(1)#whole')), vocab, external } });
  out.push({ name: 'include_cycle: an INCLUDE of its own regulation', reason: 'include_cycle', input: { slice: fixtureSlice(injectRef('10.20.40.20(1)', '10.20.40.20(1)')), units: unitsMap(include('10.20.40.20(1)#whole')), vocab, external } });
  // Spec 69 M-76 A2 + A3 (real rows; the reference is injected at the root clause so it is the first one includeOf reads)
  out.push({ name: 'good twin: M-76 A2 — a section include ("10.20") expands to its in-scope rows', reason: null, input: { slice: fixtureSlice(injectRef('600.60.40(1)', '10.20')), units: unitsMap(include('600.60.40(1)#whole')), vocab, external }, expect: (r) => r.counts.include_group_expansions === 1 && r.counts.include_group_rows >= 3 });
  out.push({ name: 'good twin: M-76 A2 + A3 — a 3-part Article include ("10.20.40") resolves and expands', reason: null, input: { slice: fixtureSlice(injectRef('600.60.40(1)', '10.20.40')), units: unitsMap(include('600.60.40(1)#whole')), vocab, external }, expect: (r) => r.counts.include_group_expansions === 1 && r.counts.include_group_rows >= 3 });
  out.push({ name: 'include_cycle: M-76 A2 — an Article include whose other rows include the unit back (transitive)', reason: 'include_cycle', input: { slice: fixtureSlice((m) => { injectRef('10.20.40.70(6)', '10.20.40.70')(m); injectRef('10.20.40.70(4)', '10.20.40.70(6)')(m); }), units: unitsMap(include('10.20.40.70(6)#whole'), include('10.20.40.70(4)#whole')), vocab, external } });
  out.push({ name: 'good twin: M-76 A2 (R5 Q7c) — an Article include that contains the unit own regulation expands to the OTHER rows', reason: null, input: { slice: fixtureSlice(injectRef('10.20.40.70(6)', '10.20.40.70')), units: unitsMap(include('10.20.40.70(6)#whole')), vocab, external }, expect: (r) => r.counts.include_group_expansions === 1 && r.counts.include_group_rows === 2 });
  out.push({ name: 'include_unresolved: M-76 A2 (R5 Q7c) — the unit own regulation is the only in-scope row of the group', reason: 'include_unresolved', input: { slice: fixtureSlice(injectRef('10.20.40.70(6)', '10.20.40.70')), units: unitsMap(include('10.20.40.70(6)#whole')), vocab, external, inScopeIds: new Set(['10.20.40.70(6)']) } });
  out.push({ name: 'include_unresolved: M-76 A2 — a section include with no in-scope rows', reason: 'include_unresolved', input: { slice: fixtureSlice(injectRef('600.60.40(1)', '10.20')), units: unitsMap(include('600.60.40(1)#whole')), vocab, external, inScopeIds: new Set(['600.60.40(1)']) } });
  out.push({ name: 'trigger_unaccounted', reason: 'trigger_unaccounted', input: { slice, units: unitsMap(mutU('PROCEDURAL×none (not_an_override)', (u) => (u.not_an_override = []))), vocab, external } });
  out.push({ name: 'not_an_override_invalid', reason: 'not_an_override_invalid', input: { slice, units: unitsMap(mutU('PROCEDURAL×none (not_an_override)', (u) => (u.not_an_override = [{ phrase: 'despite', reason: 'seemed_harmless' }]))), vocab, external } });
  // A4: "exempt from the requirements of regulation 10.20.20.100(8) (B) and (C)" — a forward trigger; the " (B) and (C)" tail
  const exempt = base('10.20.20.100(8)#(8)(D)', { archetype: 'DISAPPLY', calculation_handling: { status: 'informational' } });
  out.push({ name: 'good twin: A4 — "exempt from the requirements of regulation X (B) and (C)" displaces both clauses', reason: null, input: { slice, units: unitsMap(exempt), vocab, external }, expect: (r) => r.counts.displaces === 2 });
  out.push({ name: 'displaces_unresolved: A4 — "exempt from" is a trigger, so a target that resolves nowhere is reported', reason: 'displaces_unresolved', input: { slice: fixtureSlice(retargetRef('10.20.20.100(8)', '10.20.20.100(8)', '10.99.99.99(8)')), units: unitsMap(exempt), vocab, external } });
  // A9: the enacting instruction cites the regulation it creates
  const instr = base('10.5.40.40(3)(E)@1075-2026#[instruction]', { archetype: 'PROCEDURAL', calculation_handling: { status: 'informational' } });
  out.push({ name: 'good twin: A9 — an instruction citing the regulation it creates resolves to its own row', reason: null, input: { slice, units: unitsMap(instr), vocab, external }, expect: (r) => r.counts.self_instruction_refs === 1 });
  out.push({ name: 'ref_unresolved: A9 — a non-self instruction citation that names nothing still fails', reason: 'ref_unresolved', input: { slice: fixtureSlice((m) => { m.get('10.5.40.40(3)(E)@1075-2026').target = '10.5.40.40(3)(F)'; }), units: unitsMap(instr), vocab, external } });
  return out;
}

/** G-SHAPE: {name, reason, input:{slice, shards, vocab, gates}}; row_status fixtures carry `expectRows`. */
export function shapeFixtures() {
  const vocab = REAL_VOCAB;
  const slice = fixtureSlice();
  const one = (u, o = {}) => [shardOf([u], { slice, ...o })];
  const out = [];
  for (const [n, u] of Object.entries(GOOD)) out.push({ name: `good twin: ${n}`, reason: null, pair: pairOf(n), input: { slice, shards: one(u), vocab } });
  out.push({ name: 'good twin: ranks_layers in the {higher, lower} form evaluate.mjs reads', reason: null, input: { slice, shards: one(mutU('PROCEDURAL×none', (u) => (u.ranks_layers = { higher: 'exception', lower: ['base', 'overlay'] }))), vocab } });
  const bad = (reason, name, fn, extra = {}) => out.push({ name: reason, reason, input: { slice, shards: one(mutU(name, fn)), vocab, ...extra } });
  bad('field_missing', 'LIMIT×literal', (u) => delete u.ranks_layers);
  bad('vocab_value_unknown', 'LIMIT×literal', (u) => (u.application.zones = ['RX']));
  bad('shape_required_missing', 'LIMIT×literal', (u) => (u.bound = 'none'));
  bad('shape_must_be_none', 'REQUIRE×none', (u) => (u.numeric_expression = ['side_setback_m = 0.6 m @(B)']));
  bad('value_form_not_allowed', 'PERMIT×none', (u) => (u.numeric_expression = ['dwelling_units_max = 6 units @(B)']));
  bad('statement_target_mismatch', 'LIMIT×literal', (u) => (u.target = 'side_setback_street_m'));
  { // Spec 69 M-76 A10, real text 10.40.40.20(2)(A) "a maximum height of 5.0 metres and one storey": one LIMIT, two targets
    const mixed = base('10.40.40.20(2)#(2)(A)', { target: ['height_m', 'height_storeys'], bound: 'max', numeric_expression: ['height_m = 5.0 m @(A)', 'height_storeys = 1 storeys @(A)'], application: app(['RS'], ['any'], { RS: 'In the RS zone' }) });
    out.push({ name: 'good twin: M-76 A10 — a mixed-measure LIMIT lists both targets, one statement each', reason: null, input: { slice, shards: one(mixed), vocab } });
    out.push({ name: 'statement_target_mismatch: M-76 A10 — a listed target without a statement and a statement outside the list', reason: 'statement_target_mismatch', input: { slice, shards: one({ ...clone(mixed), target: ['height_m', 'building_length_m'] }), vocab } });
    out.push({ name: 'statement_target_mismatch: M-76 A10 — a target list on a DEFINE', reason: 'statement_target_mismatch', input: { slice, shards: one({ ...clone(mixed), archetype: 'DEFINE', bound: 'none' }), vocab } });
  }
  { // vocab.json declares HT / ST / LC held (Spec 58; folded by the hardening lane): the not-held arm runs on a
    // vocab clone whose overlays are not declared held, so the gate keeps a red fixture
    const notHeld = JSON.parse(JSON.stringify(REAL_VOCAB));
    for (const c of Object.keys(notHeld.overlay_code || {})) delete notHeld.overlay_code[c].held;
    bad('modelled_without_inputs', 'LIMIT×map_lookup', (u) => (u.calculation_handling.status = 'modelled'), { vocab: notHeld });
  }
  bad('feeds_unresolved', 'LIMIT×literal', (u) => (u.application.building_types = []));
  bad('authored_orphan', 'LIMIT×literal', (u) => (u.unit_id = '10.20.40.70(3)#(3)(Z)'));
  bad('generated_field_authored', 'LIMIT×literal', (u) => (u.displaces = ['10.20.40.70(2)']));
  { // Spec 69 M-17: keyer B's draft is never the resolved unit, so in ANY batch a generated field a .b writes
    // is ignored and counted. The same write in the .a draft still fails.
    const legacy = one(GOOD['LIMIT×literal']);
    legacy[0].b.units[0].displaces = ['10.20.40.70(2)'];
    out.push({ name: 'good twin: M-84 — a generated field in a .b draft is ignored (counted)', reason: null, input: { slice, shards: legacy, vocab }, expect: (r) => r.counts.b_generated_ignored === 1 });
    const a4 = one(GOOD['LIMIT×literal']);
    a4[0].b.units[0].displaces = ['10.20.40.70(2)'];
    a4[0].prov.batch = 'A4';
    out.push({ name: 'good twin: M-84 — the same write in an A4 .b is ignored too', reason: null, input: { slice, shards: a4, vocab }, expect: (r) => r.counts.b_generated_ignored === 1 });
  }
  {
    const s = one(GOOD['LIMIT×literal']);
    (s[0].b.units[0].calculation_handling ||= {}).status = 'modelled';
    out.push({ name: 'good twin: M-84 — a single-drafted field in a .b draft is ignored (counted)', reason: null, input: { slice, shards: s, vocab }, expect: (r) => r.counts.b_single_ignored === 1 });
  }
  {
    const s = one(GOOD['LIMIT×literal']);
    s[0].a.keyer = 'C';
    out.push({ name: 'schema_invalid', reason: 'schema_invalid', input: { slice, shards: s, vocab } });
  }
  // row_status (Spec 68 §4 (a)–(e), Spec 69 M-45) — both directions; none of these fail the gate except `failed`'s cause
  const whole = GOOD['LIMIT×literal (whole, displaces)'];
  const rid = '10.20.40.70(6)';
  out.push({ name: 'row_status complete', reason: null, input: { slice, shards: one(whole), vocab }, expectRows: { [rid]: 'complete' } });
  out.push({ name: 'row_status pending: no authored entry', reason: null, input: { slice, shards: [], vocab, inScopeIds: [rid] }, expectRows: { [rid]: 'pending' } });
  out.push({ name: 'row_status pending: a sealed .a with no .b', reason: null, input: { slice, shards: [{ ...one(whole)[0], b: null }], vocab }, expectRows: { [rid]: 'pending' } });
  {
    const s = one(whole);
    s[0].b.units[0].bound = 'max';
    out.push({ name: 'row_status pending: an open disagreement', reason: null, input: { slice, shards: s, vocab }, expectRows: { [rid]: 'pending' } });
  }
  {
    const s = one(whole);
    s[0].prov.unit_shas[whole.unit_id] = '0'.repeat(64);
    out.push({ name: 'row_status pending:stale: the unit pin differs from the current unit sha', reason: null, input: { slice, shards: s, vocab }, expectRows: { [rid]: 'pending:stale' } });
  }
  out.push({ name: 'row_status failed: an agreed unit a content gate rejects', reason: null, input: { slice, shards: one(whole), vocab, gates: { 'G-CLAUSE': { violations: [{ code: 'literal_not_in_clause', id: whole.unit_id, detail: 'fixture' }] } } }, expectRows: { [rid]: 'failed' } });
  out.push({ name: 'row_status pending: a content gate did not run (no row is complete)', reason: null, input: { slice, shards: one(whole), vocab, gates: { 'G-EVAL': { status: 'not_run', violations: [] } } }, expectRows: { [rid]: 'pending' } });
  {
    const s = one(whole);
    s[0].a.rows['10.20.40.70(99)'] = { explanation: 'x', code_refs: 'none' };
    out.push({ name: 'authored_orphan: a rows key names no row', reason: 'authored_orphan', input: { slice, shards: s, vocab } });
  }
  { // Spec 69a M-80: the same unit keyed in a shard and its re-key generation is not "keyed in two shards"
    const old = shardOf([GOOD['LIMIT×literal']], { slice });
    out.push({ name: 'good twin: M-80 — a unit in a shard and its re-key generation', reason: null, input: { slice, shards: [old, rekeyOf(old, [GOOD['LIMIT×literal']])], vocab } });
    const other = shardOf([GOOD['LIMIT×literal']], { slice, key: 'fx/other' });
    out.push({ name: 'schema_invalid: M-80 — the same unit in two unrelated shards still fails', reason: 'schema_invalid', input: { slice, shards: [old, other], vocab } });
  }
  { // Spec 69a M-82 Q7: limit_not_modelled only on UNUSUAL
    const lit = [{ literal: '0.6 metres', clause: '(3)(A)', reason: 'limit_not_modelled' }];
    const un = mutU('LIMIT×literal', (u) => { u.archetype = 'UNUSUAL'; u.target = 'none'; u.bound = 'none'; u.numeric_expression = 'none'; u.literals_not_expressed = lit; u.calculation_handling.status = 'not_modelled'; u.calculation_handling.not_modelled_reason = vocab.not_modelled_reason[0]; u.disclosure = 'the clause states a limit this unit does not model'; });
    out.push({ name: 'good twin: M-82 — limit_not_modelled on an UNUSUAL unit', reason: null, input: { slice, shards: one(un), vocab } });
    out.push({ name: 'shape_must_be_none: M-82 — limit_not_modelled on a LIMIT', reason: 'shape_must_be_none', input: { slice, shards: one(mutU('LIMIT×literal', (u) => (u.literals_not_expressed = lit))), vocab } });
    // Spec 69a M-107: lot_condition_arm_not_modelled only on LIMIT (the mirror of M-82 Q7)
    const arm = [{ literal: '0.6 metres', clause: '(3)(A)', reason: 'lot_condition_arm_not_modelled' }];
    out.push({ name: 'good twin: M-107 — lot_condition_arm_not_modelled on a LIMIT', reason: null, input: { slice, shards: one(mutU('LIMIT×literal', (u) => (u.literals_not_expressed = arm))), vocab } });
    const unArm = mutU('LIMIT×literal', (u) => { u.archetype = 'UNUSUAL'; u.target = 'none'; u.bound = 'none'; u.numeric_expression = 'none'; u.literals_not_expressed = arm; u.calculation_handling.status = 'not_modelled'; u.calculation_handling.not_modelled_reason = vocab.not_modelled_reason[0]; u.disclosure = 'the clause states a limit this unit does not model'; });
    out.push({ name: 'shape_must_be_none: M-107 — lot_condition_arm_not_modelled on an UNUSUAL', reason: 'shape_must_be_none', input: { slice, shards: one(unArm), vocab } });
    // Spec 69a M-130: limit_arm_not_modelled only on LIMIT
    const add = [{ literal: '0.6 metres', clause: '(3)(A)', reason: 'limit_arm_not_modelled' }];
    out.push({ name: 'good twin: M-130 — limit_arm_not_modelled on a LIMIT', reason: null, input: { slice, shards: one(mutU('LIMIT×literal', (u) => (u.literals_not_expressed = add))), vocab } });
    const unAdd = mutU('LIMIT×literal', (u) => { u.archetype = 'UNUSUAL'; u.target = 'none'; u.bound = 'none'; u.numeric_expression = 'none'; u.literals_not_expressed = add; u.calculation_handling.status = 'not_modelled'; u.calculation_handling.not_modelled_reason = vocab.not_modelled_reason[0]; u.disclosure = 'the clause states a limit this unit does not model'; });
    out.push({ name: 'shape_must_be_none: M-130 — limit_arm_not_modelled on an UNUSUAL', reason: 'shape_must_be_none', input: { slice, shards: one(unAdd), vocab } });
  }
  return out;
}
export function keyerFixtures() {
  const g = GOOD['LIMIT×literal'];
  const s = () => shardOf([g]);
  const tree = (paths) => () => paths;
  const ok = { lsTree: tree(['scripts/seeds/bylaw/vocab.json']), headTree: [], staged: [] };
  const out = [
    { name: 'good twin: blind B, sealed A', reason: null, input: { shards: [s()], ...ok } },
    { name: 'pending never fails: a sealed .a with no .b and no .prov yet', reason: null, input: { shards: [{ ...s(), b: null, prov: null }], ...ok } },
  ];
  const bad = (reason, fn, extra = {}) => {
    const x = s();
    fn(x);
    out.push({ name: reason, reason, input: { shards: [x], ...ok, ...extra } });
  };
  bad('prov_missing', (x) => (x.prov = null));
  bad('prov_field_missing', (x) => delete x.prov.b_run.worktree_commit);
  bad('keyers_not_distinct', (x) => (x.prov.keyers.b.id = x.prov.keyers.a.id));
  bad('seal_mismatch', (x) => (x.a_sha256 = '0'.repeat(64)));
  out.push({ name: 'seal_id_duplicate', reason: 'seal_id_duplicate', input: { shards: [s(), (() => { const y = shardOf([GOOD['LIMIT×map_lookup']]); return y; })()], ...ok } });
  bad('a_visible_to_b', () => {}, { lsTree: (c) => (c === 'f'.repeat(40) ? ['scripts/seeds/bylaw/authored/fx/10.20.40.70.a.json'] : []) });
  bad('a_in_b_read_paths', (x) => x.prov.b_run.read_paths.push('scripts/seeds/bylaw/authored/fx/10.20.40.70.a.json'));
  bad('a_staged_without_b', (x) => (x.b = null), { staged: ['scripts/seeds/bylaw/authored/fx/10.20.40.70.a.json'] });
  bad('a_staged_without_b', () => {}, { staged: ['scripts/seeds/bylaw/authored/fx/10.20.40.70.a.json'] }); // .b on disk, but neither staged nor committed
  bad('seal_mismatch', (x) => (x.a = null)); // a .b with no .a: nothing for the seal to equal
  bad('prov_field_missing', (x) => (x.prov.b_run.worktree_commit = 'HEAD')); // a moving ref is not a witness
  bad('witness_commit_unknown', () => {}, { lsTree: () => null });
  // Spec 69a M-80: the old shard's seal no longer matches (it was edited after sealing), but a re-key generation supersedes it
  {
    const old = s();
    old.a_sha256 = '0'.repeat(64); // seal ≠ .a
    out.push({ name: 'good twin: M-80 — a wholly superseded shard is not re-checked; the generation records its predecessor', reason: null, input: { shards: [old, rekeyOf(old, [GOOD['LIMIT×literal']])], ...ok }, expect: (r) => r.counts.superseded_shards === 1 });
    const old2 = s();
    const bad = rekeyOf(old2, [GOOD['LIMIT×literal']]);
    out.push({ name: 'supersedes_mismatch: M-80 — the recorded predecessor hashes differ from its files', reason: 'supersedes_mismatch', input: { shards: [old2, (() => { bad.prov.supersedes.b_sha = 'f'.repeat(64); return bad; })()], ...ok } });
    const old3 = s();
    const none = rekeyOf(old3, [GOOD['LIMIT×literal']]);
    delete none.prov.supersedes;
    out.push({ name: 'supersedes_mismatch: M-80 — a generation without prov.supersedes', reason: 'supersedes_mismatch', input: { shards: [old3, none], ...ok } });
  }
  return out;
}

const SPEC69 = ['| **M-17** | x | y | G-AGREE | RATIFIED 2026-10-06 (decision 10) |', '| **M-39** | x | y | G-CLAUSE | RATIFIED 2026-10-06 |', '| **M-56** | x | y | G-UNIVERSE | RATIFIED 2026-10-07 |', '| **M-90** | x | y | G-X | PROPOSED |', '| ~~M-19~~ | RETIRED → P-1. | | | RETIRED |'].join('\n');

/** G-PROV ruling-id arm: {name, reason, input:{spec69Text, ledger, adjudications}}. */
export function rulingFixtures() {
  const pin = (o = {}) => ({ adjudicated_by: 'operator', adoption_id: 'adoption-1', anchor: '**M-56**', kind: 'universe_pin', ruling: 'M-56', spec_ref: 'docs/specs/01-pipeline/69a_mcbylaw_register.md', ...o });
  const real = realAdjudications();
  return [
    { name: 'good twin: a RATIFIED, literally anchored pin + the M-39 adjudication', reason: null, input: { spec69Text: SPEC69, ledger: { rows: [pin()] }, adjudications: real } },
    { name: 'ruling_not_ratified', reason: 'ruling_not_ratified', input: { spec69Text: SPEC69, ledger: { rows: [pin({ ruling: 'M-90', anchor: '**M-90**' })] }, adjudications: real } },
    { name: 'ruling_anchor_missing', reason: 'ruling_anchor_missing', input: { spec69Text: SPEC69, ledger: { rows: [pin({ anchor: 'M-56' })] }, adjudications: real } },
    { name: 'ruling_duplicate', reason: 'ruling_duplicate', input: { spec69Text: `${SPEC69}\n| **M-56** | again | y | G-X | PROPOSED |`, ledger: { rows: [] }, adjudications: real } },
    { name: 'rulings_empty', reason: 'rulings_empty', input: { spec69Text: '# no register here', ledger: { rows: [] }, adjudications: { adjudications: [] } } },
    { name: 'adjudication_unattributed', reason: 'adjudication_unattributed', input: { spec69Text: SPEC69, ledger: { rows: [] }, adjudications: (() => { const a = realAdjudications(); a.adjudications[0].adjudicator = ''; return a; })() } },
    { name: 'adjudication_ruling_wrong', reason: 'adjudication_ruling_wrong', input: { spec69Text: SPEC69, ledger: { rows: [] }, adjudications: (() => { const a = realAdjudications(); a.adjudications[0].ruling = 'M-17'; return a; })() } },
  ];
}
