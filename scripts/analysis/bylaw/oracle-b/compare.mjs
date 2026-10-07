#!/usr/bin/env node
// Oracle A vs oracle B comparison harness (Phase 2 plan §V-2, §V-1b; Spec 68 §7.5–§7.6).
//
// Runs the production evaluator (A: scripts/analysis/bylaw/evaluate.mjs, called ONLY through its public exports
// makeContext / loadCandidates / effective — this harness never reads its source) and oracle B over
//   (1) every eval vector (scripts/seeds/bylaw/eval-vectors.json), and
//   (2) every (unit-set × lot) combination of a seeded pairwise covering array over the lot inputs, per zone.
// Writes docs/reports/mcbylaw-oracleb/{summary,disagreements}.json. Never "fixes" A or B to agree: each
// disagreement is classified by a signature rule in classifications.json (reasoned from the spec, cited there).
//
// Usage: node scripts/analysis/bylaw/oracle-b/compare.mjs [--out <dir>] [--a <oracle A module path>]

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createOracle, canonical as canonB, ORACLE_B_VERSION } from './resolve.mjs';
import { pairwise, seedOf } from './pairwise.mjs';

const ROOT = process.cwd();
const J = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const args = process.argv.slice(2);
const OUT = args.includes('--out') ? args[args.indexOf('--out') + 1] : 'docs/reports/mcbylaw-oracleb';
// --a <path>: oracle A module (default the production evaluator); any module exporting makeContext / loadCandidates / effective
const A_PATH = args.includes('--a') ? args[args.indexOf('--a') + 1] : 'scripts/analysis/bylaw/evaluate.mjs';
const abs = (p) => (path.isAbsolute(p) ? p : path.join(ROOT, p));
const SEED = 'mcbylaw-oracleb-2026-10-07';

const VOCAB = J('scripts/seeds/bylaw/vocab.json');
const ABS = J('scripts/seeds/bylaw/absence-rulings.json');
const EXT = J('scripts/seeds/bylaw/external.json');
const UNITS_ALL = J('src/tests/fixtures/bylaw/eval-units.json').units;
const VECTORS = J('scripts/seeds/bylaw/eval-vectors.json').vectors;
const CLASSES = J('scripts/analysis/bylaw/oracle-b/classifications.json');

const A = await import(pathToFileURL(abs(A_PATH)).href);
const VO = await import(pathToFileURL(path.join(ROOT, 'scripts/analysis/bylaw/vocab.mjs')).href);
const CTX = A.makeContext(VO.evaluatorVocab(VOCAB), { absences: ABS.rulings });

// ------------------------------------------------ unit sets (identical data to both oracles)
const candidates = UNITS_ALL.filter((u) => u.candidate !== false);
const bandIds = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((c) => `10.20.40.70(3)#(${c})`);
const bandUnit = UNITS_ALL.find((u) => u.unit_id === '10.20.40.70(3)#band');
const provAsUnits = [];
for (const e of EXT.entries) {
  if (e.precedence !== 'active') continue;
  for (const pu of e.provincial_units || []) {
    const v = typeof pu.value === 'number' ? `${pu.value} ${pu.unit}` : pu.value;
    provAsUnits.push({ unit_id: pu.unit_id, regulation_id: pu.unit_id, clause_path: 'whole', layer: 'provincial', archetype: 'LIMIT', target: pu.target,
      bound: pu.bound, numeric_expression: [`${pu.target} = ${v} @#whole`], application: { zones: ['R', 'RD', 'RS', 'RT', 'RM'], building_types: ['any'] },
      applies_to: { part: 'whole', refs: [] }, condition: 'none', displaces: [], ranks_layers: 'none', candidate: true,
      bylaw_prevails: pu.bylaw_prevails, scope: pu.scope });
  }
}
const SETS = {
  fixture: { a: candidates, b: { units: candidates } },
  rd_band: { a: [...candidates.filter((u) => !bandIds.includes(u.unit_id)), { ...bandUnit, candidate: true }], b: null },
  provincial: { a: [...candidates, ...provAsUnits], b: { units: candidates, externals: EXT } },
};
SETS.rd_band.b = { units: SETS.rd_band.a };
const ORACLES = Object.fromEntries(Object.entries(SETS).map(([k, s]) => [k, createOracle({ vocab: VOCAB, absences: ABS, ...s.b })]));
const TARGETS = [...new Set([...ORACLES.provincial.targets(), ...candidates.map((u) => u.target).filter((t) => t && t !== 'none')])].filter((t) => VOCAB.dsl_target[t]).sort();

// ------------------------------------------------ normalisation
const r6 = (v) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v);
const base = (reason) => (reason ? String(reason).split(':')[0] : null);
function normA(r) {
  if (!r) return { status: 'error', value: null };
  let status = r.status; let value = r.value;
  if (status === 'value' && (value === 'unlimited' || value === 'unregulated')) { status = value; value = null; }
  const bounds = r.bounds && Object.keys(r.bounds).length > 1 ? Object.fromEntries(Object.entries(r.bounds).map(([k, v]) => [k, r6(v)])) : null;
  return { status, value: r6(value ?? null), bounds, reason: r.reason ?? null, winner: r.winner ?? null, evidence: r.evidence ?? r.evidence_kind ?? null };
}
function normB(r) {
  const bounds = r.bounds && Object.keys(r.bounds).length > 1 ? r.bounds : null;
  return { status: r.status, value: r6(r.value ?? null), bounds, reason: r.reason ?? null, winner: r.winner ?? null, evidence: r.evidence };
}
const key = (n) => `${n.status}|${n.value}|${n.bounds ? JSON.stringify(Object.entries(n.bounds).sort()) : ''}|${n.status === 'not_evaluated' ? base(n.reason) : ''}`;
const valueKey = (n) => `${n.status === 'not_evaluated' ? 'ne' : n.status}|${n.value}|${n.bounds ? JSON.stringify(Object.entries(n.bounds).sort()) : ''}`;

function runA(lot, units, target) {
  try {
    const L = A.loadCandidates(lot, units);
    return { raw: A.effective(lot, target, L.candidates, CTX) };
  } catch (e) { return { raw: { status: 'error', reason: String(e.message || e) } }; }
}
function runB(set, lot, target) {
  try { return ORACLES[set].resolve(lot, target); } catch (e) { return { status: 'error', reason: String(e.message || e), trace: [String(e.stack)] }; }
}

// ------------------------------------------------ classification (signature rules from classifications.json)
function classify(d) {
  for (const rule of CLASSES.rules) {
    const m = rule.match;
    if (m.set && m.set !== d.set) continue;
    if (m.target && !(Array.isArray(m.target) ? m.target : [m.target]).includes(d.target)) continue;
    if (m.a_status && m.a_status !== d.A.status) continue;
    if (m.b_status && m.b_status !== d.B.status) continue;
    if (m.a_reason && base(d.A.reason) !== m.a_reason) continue;
    if (m.b_reason && base(d.B.reason) !== m.b_reason) continue;
    if (m.b_reason_full && d.B.reason !== m.b_reason_full) continue;
    if (m.a_reason_full && d.A.reason !== m.a_reason_full) continue;
    if (m.zone && !(Array.isArray(m.zone) ? m.zone : [m.zone]).includes(d.lot.zone)) continue;
    if (m.building_type !== undefined && m.building_type !== d.lot.building_type) continue;
    if (m.b_trace_includes && !(d.B.trace || []).some((t) => t.includes(m.b_trace_includes))) continue;
    if (m.a_trace_includes && !(d.A.trace || []).some((t) => String(t).includes(m.a_trace_includes))) continue;
    if (m.a_winner_includes && !String(d.A.winner || '').includes(m.a_winner_includes)) continue;
    if (m.any_includes && !JSON.stringify([d.A.winner, d.A.trace, d.B.winner, d.B.trace, d.B.notes]).includes(m.any_includes)) continue;
    if (m.exception !== undefined && (m.exception === null ? d.lot.exception !== null : d.lot.exception !== m.exception)) continue;
    return { class: rule.class, rule: rule.id };
  }
  return { class: 'unclassified', rule: null };
}

// ------------------------------------------------ lots
function vectorLots() {
  return VECTORS.filter((v) => VOCAB.dsl_target[v.target]).map((v) => ({ id: v.id, lot: v.lot, targets: [v.target], expected: v.expected, vector_status: v.vector_status }));
}
const ZONE_EXCEPTIONS = (() => {
  const m = { R: [], RD: [], RS: [], RT: [], RM: [] };
  const K = { 2: 'R', 3: 'RD', 4: 'RS', 5: 'RT', 6: 'RM' };
  for (const u of candidates) { const x = /^900\.([2-6])\.10\((\d+)\)/.exec(u.regulation_id); if (x) { const e = `900.${x[1]}.10(${x[2]})`; if (!m[K[x[1]]].includes(e)) m[K[x[1]]].push(e); } }
  return m;
})();
const U = undefined;
function dims(zone) {
  return [
    { name: 'building_type', values: [null, 'detached_house', 'semi_detached_house', 'townhouse', 'detached_houseplex', 'semi_detached_houseplex', 'apartment_building', 'triplex', 'non_residential_building'] },
    { name: 'exception', values: [null, ...ZONE_EXCEPTIONS[zone]] },
    { name: 'has_secondary_suite', values: [U, true, false] },
    { name: 'ancillary_suite', values: [U, 'none', 'garden', 'laneway'] },
    { name: 'corner_lot', values: [U, true, false] },
    { name: 'through_lot', values: [false, true] },
    { name: 'major_street', values: [U, false, true] },
    { name: 'all_units_front_street', values: [U, true, false] },
    { name: 'adjacent_lot_fronts_flanking_street', values: [U, true, false] },
    { name: 'front_averaging_tokens', values: [U, 'not_applicable', 'one_abutting', 'two_abutting', 'all_false'] },
    { name: 'lot_frontage_m', values: [U, 5.5, 6.0, 9.75, 10.0, 12.0, 15.0, 18.0, 23.0, 24.0, 30.0, 40.0] },
    { name: 'lot_depth_m', values: [U, 30, 36, 40, 45] },
    { name: 'lot_area_m2', values: [U, 300, 408, 600, 697, 800] },
    { name: 'label_f', values: [U, 5.5, 6, 9, 12, 15, 18, 24, 30] },
    { name: 'label_d', values: [U, 0.45, 0.6] },
    { name: 'label_u', values: [U, 4, 6] },
    { name: 'label_au', values: [U, 150] },
    { name: 'HT', values: [U, 8.5, 12] },
    { name: 'ST', values: [U, 2, 3] },
    { name: 'LC', values: [U, 30, 50] },
    { name: 'dwelling_units', values: [U, 2, 5, 6] },
    { name: 'townhouse_unit_width_m', values: [U, 5, 7] },
    { name: 'sixplex_overlay', values: [U, true, false] },
    { name: 'lowest_level_tokens', values: [U, true, false] },
    { name: 'misc_tokens', values: [U, true, false] },
    { name: 'abutting_front_setback_m', values: [U, 5.0] },
    { name: 'parking_width_m', values: [U, 2.6] },
  ];
}
function lotFrom(zone, ds, row) {
  const v = Object.fromEntries(ds.map((d, i) => [d.name, d.values[row[i]]]));
  const flags = {}; const vars = {}; const label = {}; const overlays = {};
  const setF = (k, x) => { if (x !== U) flags[k] = x; };
  setF('has_secondary_suite', v.has_secondary_suite);
  if (v.ancillary_suite !== U) { flags.has_garden_suite = v.ancillary_suite === 'garden'; flags.has_laneway_suite = v.ancillary_suite === 'laneway'; }
  for (const k of ['corner_lot', 'through_lot', 'major_street', 'all_units_front_street', 'adjacent_lot_fronts_flanking_street']) setF(k, v[k]);
  if (v.front_averaging_tokens !== U) {
    flags.front_averaging_not_applicable = v.front_averaging_tokens === 'not_applicable';
    flags.one_abutting_building_within_15_m = v.front_averaging_tokens === 'one_abutting';
    flags.two_abutting_buildings_within_15_m = v.front_averaging_tokens === 'two_abutting';
  }
  for (const k of ['lowest_level_joists_1_0_to_1_5_m_for_80_pct', 'lowest_level_ceiling_2_4_m_for_80_pct', 'lowest_level_contains_dwelling_unit']) setF(k, v.lowest_level_tokens);
  for (const k of ['garage_entrance_faces_street', 'individual_private_driveway', 'complies_with_omb_order']) setF(k, v.misc_tokens);
  for (const k of ['lot_frontage_m', 'lot_depth_m', 'lot_area_m2', 'dwelling_units', 'townhouse_unit_width_m', 'abutting_front_setback_m', 'parking_width_m']) if (v[k] !== U) vars[k] = v[k];
  for (const [d, l] of [['label_f', 'f'], ['label_d', 'd'], ['label_u', 'u'], ['label_au', 'au']]) if (v[d] !== U) label[l] = v[d];
  for (const k of ['HT', 'ST', 'LC']) if (v[k] !== U) overlays[k] = v[k];
  const lot = { zone, zone_label: `${zone} (pairwise)`, building_type: v.building_type, exception: v.exception, flags, vars, label, overlays };
  if (v.sixplex_overlay !== U) lot.map_areas = v.sixplex_overlay ? ['sixplex_overlay'] : [];
  return lot;
}

// ------------------------------------------------ run
const rows = []; const disagreements = []; const pairStats = {};
function compareOne(set, lotId, lot, target, extra = {}) {
  const a = runA(lot, SETS[set].a, target);
  const b = runB(set, lot, target);
  const nA = normA(a.raw); const nB = normB(b);
  const agree = key(nA) === key(nB);
  const valueAgree = valueKey(nA) === valueKey(nB);
  const winnerAgree = nA.winner === nB.winner;
  const row = { set, lot_id: lotId, target, agree, value_agree: valueAgree, winner_agree: winnerAgree, a: key(nA), b: key(nB), ...extra };
  rows.push(row);
  if (!agree) {
    const d = { set, lot_id: lotId, target, lot, A: { ...nA, trace: a.raw.trace ?? null }, B: { ...nB, trace: b.trace ?? null, notes: b.notes ?? [], per_type: b.per_type ?? undefined }, ...extra };
    Object.assign(d, classify(d));
    disagreements.push(d);
  }
  return { nA, nB };
}

// (1) eval vectors
const vectorResults = [];
for (const v of vectorLots()) {
  for (const t of v.targets) {
    const { nA, nB } = compareOne('fixture', v.id, v.lot, t, { source: 'vector' });
    const exp = v.expected || {};
    const expKey = exp.value !== undefined ? (typeof exp.value === 'number' ? `value|${r6(exp.value)}` : `${exp.value}|null`) : exp.not_evaluated ? `ne:${base(exp.not_evaluated)}` : null;
    const got = (n) => (n.status === 'not_evaluated' ? `ne:${base(n.reason)}` : n.status === 'value' ? `value|${n.value}` : `${n.status}|null`);
    vectorResults.push({ id: v.id, vector_status: v.vector_status, expected: expKey, A: got(nA), B: got(nB), A_matches: expKey ? got(nA) === expKey : null, B_matches: expKey ? got(nB) === expKey : null });
  }
}
// (2) pairwise lots per zone, every unit set
let lotCount = 0;
for (const zone of ['R', 'RD', 'RS', 'RT', 'RM']) {
  const ds = dims(zone);
  const pw = pairwise(ds, seedOf(`${SEED}:${zone}`));
  pairStats[zone] = { rows: pw.rows.length, pairs_total: pw.pairs_total, pairs_covered: pw.pairs_covered, dimensions: ds.map((d) => `${d.name}(${d.values.length})`) };
  pw.rows.forEach((row, i) => {
    const lot = lotFrom(zone, ds, row);
    lotCount += 1;
    for (const set of Object.keys(SETS)) {
      if (set === 'rd_band' && zone !== 'RD') continue;
      for (const t of TARGETS) compareOne(set, `${zone}-${String(i).padStart(4, '0')}`, lot, t, { source: 'pairwise' });
    }
  });
}
// rule 0: no zone
for (const t of TARGETS) compareOne('fixture', 'nozone', { zone: null, building_type: 'detached_house', exception: null, flags: {}, vars: {}, label: {}, overlays: {} }, t, { source: 'rule0' });

// ------------------------------------------------ summary
const agg = (rs) => ({ n: rs.length, agree: rs.filter((r) => r.agree).length, value_agree: rs.filter((r) => r.value_agree).length, winner_agree: rs.filter((r) => r.winner_agree).length,
  rate: rs.length ? Math.round((rs.filter((r) => r.agree).length / rs.length) * 10000) / 100 : null });
const bySet = {}; for (const s of Object.keys(SETS)) bySet[s] = agg(rows.filter((r) => r.set === s));
const byTarget = {}; for (const t of TARGETS) byTarget[t] = Object.fromEntries(Object.keys(SETS).map((s) => [s, agg(rows.filter((r) => r.target === t && r.set === s))]));
const bySource = {}; for (const s of ['vector', 'pairwise', 'rule0']) bySource[s] = agg(rows.filter((r) => r.source === s));
const byClass = {}; for (const d of disagreements) { const k = d.class; byClass[k] ||= { n: 0, rules: {} }; byClass[k].n += 1; byClass[k].rules[d.rule] = (byClass[k].rules[d.rule] || 0) + 1; }
const vecSummary = { n: vectorResults.length, with_expected: vectorResults.filter((v) => v.expected).length,
  A_matches_expected: vectorResults.filter((v) => v.A_matches).length, B_matches_expected: vectorResults.filter((v) => v.B_matches).length };
const summary = { oracle_b_version: ORACLE_B_VERSION, seed: SEED, label: 'agreement≠correctness', lots_pairwise: lotCount, targets: TARGETS, pairwise: pairStats,
  overall: agg(rows), by_set: bySet, by_source: bySource, by_target: byTarget, disagreements_by_class: byClass, vectors: vecSummary, vector_results: vectorResults,
  classification_rules: CLASSES.rules.map((r) => ({ id: r.id, class: r.class, why: r.why, cites: r.cites })) };

const sortKeys = (x) => (Array.isArray(x) ? x.map(sortKeys) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, sortKeys(x[k])])) : x);
fs.mkdirSync(abs(OUT), { recursive: true });
fs.writeFileSync(path.join(abs(OUT), 'summary.json'), `${JSON.stringify(sortKeys(summary), null, 1)}\n`);
fs.writeFileSync(path.join(abs(OUT), 'disagreements.json'), `${JSON.stringify(sortKeys(disagreements), null, 1)}\n`);
console.log(JSON.stringify({ overall: summary.overall, by_set: bySet, by_source: bySource, disagreements_by_class: byClass, vectors: vecSummary, pairwise: Object.fromEntries(Object.entries(pairStats).map(([z, p]) => [z, `${p.rows} rows, ${p.pairs_covered}/${p.pairs_total} pairs`])) }, null, 1));
void canonB;
