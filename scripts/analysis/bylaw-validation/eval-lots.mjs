// Bylaw real-lot validation (2026-10-19): evaluates sampled lots with the committed evaluator (no re-implementation):
// agreed units (agree.mjs) + generated fields (authored.mjs) + displacement links (xref.mjs displacesOf, as G-EVAL) +
// makeContext(evaluatorVocab, enactments) — the same assembly as validate.mjs G-EVAL and the review builder (assembly.mjs).
// Pure apart from reading the tree and the lots file. Usage: node eval-lots.mjs <root> <lots.json> <out.json>
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import { pathToFileURL } from 'node:url';
const [ROOT, LOTS, OUT] = process.argv.slice(2);
const { E, units, C } = await (await import(pathToFileURL(path.join(ROOT, 'scripts/analysis/bylaw-validation/assembly.mjs')).href)).loadRealLotAssembly(ROOT); // shared with the golden-lot helper
const TARGETS = ['required_lot_frontage_m', 'required_lot_area_m2', 'front_setback_m', 'rear_setback_m', 'side_setback_m', 'side_setback_street_m',
  'height_m', 'main_wall_height_m', 'height_storeys', 'fsi', 'gfa_m2', 'lot_coverage_pct', 'building_length_m', 'building_depth_m', 'upper_storey_setback_m', 'dwelling_units_max'];
const SCEN = { R: ['detached_house', 'detached_houseplex', 'semi_detached_houseplex'], RD: ['detached_house', 'detached_houseplex'], RS: ['detached_house', 'semi_detached_house', 'semi_detached_houseplex'], RT: ['detached_house', 'townhouse', 'detached_houseplex'], RM: ['detached_house', 'semi_detached_houseplex', 'townhouse'] };
// scenario unit counts (a scenario input, as the review builder places scenario values in the lot vector)
const UNITS = { detached_house: 1, semi_detached_house: 1, semi_detached_houseplex: 2, detached_houseplex: 3, townhouse: 4 };
const slim = (r) => ({ status: r.status, value: r.value ?? null, reason: r.reason ?? null, winner: r.winner ? (r.winner.unit_id || r.winner) : null,
  applied: (r.applied || []).map((a) => (typeof a === 'string' ? a : a.unit_id || a.id)).filter(Boolean), disclosures: (r.disclosures || []).map((d) => (typeof d === 'string' ? d : d.code || d.unit_id || JSON.stringify(d))).slice(0, 6), per_type: r.per_type ? Object.keys(r.per_type) : undefined });
const { lots } = JSON.parse(fs.readFileSync(LOTS, 'utf8'));
const out = [];
for (const L of lots) {
  const rows = {};
  const types = [...SCEN[L.lot.zone], ...(L.lot.flags.major_street && !SCEN[L.lot.zone].includes('townhouse') ? ['townhouse'] : [])];
  for (const bt of types) for (const roof of [false, true]) {
    const lot = { ...L.lot, building_type: bt, vars: { ...L.lot.vars, dwelling_units: UNITS[bt] }, flags: { ...L.lot.flags, flat_or_shallow_roof: roof } };
    const { candidates } = E.loadCandidates(lot, units);
    const perm = E.permitted(lot, bt, candidates, C);
    const res = {}; for (const t of TARGETS) { let r; try { r = E.effective(lot, t, candidates, C); } catch (err) { r = { status: 'error', reason: String(err.message).slice(0, 160) }; } res[t] = slim(r); }
    rows[`${bt}|${roof ? 'flat' : 'pitched'}`] = { permitted: perm.status, permitted_reason: perm.reason || null, res };
  }
  out.push({ id: L.id, stratum: L.stratum, address: L.address, lot: L.lot, legacy: L.legacy, rows });
}
const doc = { root: ROOT, units: units.length, targets: TARGETS, lots: out };
const s = JSON.stringify(doc); fs.writeFileSync(OUT, s);
console.log('evaluated', out.length, 'lots; sha', crypto.createHash('sha256').update(JSON.stringify(out)).digest('hex').slice(0, 12));
