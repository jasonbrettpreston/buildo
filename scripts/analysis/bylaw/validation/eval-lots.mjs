// Bylaw real-lot validation (2026-10-19): evaluates sampled lots with the committed evaluator (no re-implementation):
// agreed units (agree.mjs) + generated fields (authored.mjs) + displacement links (xref.mjs displacesOf, as G-EVAL) +
// makeContext(evaluatorVocab, enactments) — the same assembly as validate.mjs G-EVAL and the review builder.
// Pure apart from reading the tree and the lots file. Usage: node eval-lots.mjs <root> <lots.json> <out.json>
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import { pathToFileURL } from 'node:url';
const [ROOT, LOTS, OUT] = process.argv.slice(2);
const mod = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const V = await mod('scripts/analysis/bylaw/validate.mjs'); const AU = await mod('scripts/analysis/bylaw/authored.mjs');
const AG = await mod('scripts/analysis/bylaw/agree.mjs'); const VO = await mod('scripts/analysis/bylaw/vocab.mjs');
const E = await mod('scripts/analysis/bylaw/evaluate.mjs'); const X = await mod('scripts/analysis/bylaw/xref.mjs');
const I = V.loadInputs({ root: ROOT });
const external = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/seeds/bylaw/external.json'), 'utf8'));
const ag = AG.checkAgree({ shards: AU.loadAuthored(ROOT), adjudications: I.adjudications, vocab: I.vocab });
const index = AU.buildIndex(I.slice);
const base = [...AG.agreedUnits(ag).values()].map(AU.withGeneratedFields);
const units = base.map((u) => { let d = []; try { d = X.displacesOf(index, u.unit_id, I.vocab, external).targets.map((t) => t.id); } catch { d = []; } return { ...u, displaces: d }; });
const enactments = {}; for (const p of I.snap.pages || []) Object.assign(enactments, E.enactedDatesFromText(p.normalized || ''));
// exception authoring state (ruling (d)), as the review builder: authored when every unit of the exception is agreed / adjudicated
const isExcReg = (r) => /^900\.\d+\.10\(/.test(r);
const excState = new Map();
for (const [id, rec] of ag.units) {
  const reg = AU.splitUnitId(id).reg.replace(/~.*$/, ''); if (!isExcReg(reg)) continue;
  const s = excState.get(reg) || { agreed: new Set(), pending: new Set(), pendingN: 0 };
  const tg = [].concat((rec.unit && rec.unit.target) || []).filter((t) => t && t !== 'none');
  if (rec.state === 'agreed' || rec.state === 'adjudicated') tg.forEach((t) => s.agreed.add(t)); else { s.pendingN++; tg.forEach((t) => s.pending.add(t)); }
  excState.set(reg, s);
}
const authored = {}; for (const [reg, s] of excState) authored[reg] = s.pendingN === 0 ? 'authored' : { status: 'partial', targets: [...s.agreed].filter((t) => !s.pending.has(t)).sort() };
const C = E.makeContext(VO.evaluatorVocab(I.vocab), { enactments, absences: I.absences, authored });
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
