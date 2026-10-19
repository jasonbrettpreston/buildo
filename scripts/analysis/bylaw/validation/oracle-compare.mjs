// Bylaw real-world oracle comparison (2026-10-19). Pure. Signals, not proof: permit areas and CoA figures vary in quality.
// (a) permit residential area vs our as-of-right GFA cap (FSI × lot area, detached house); also vs the legacy column.
// (b) approved CoA variances: the approved (proposed) figure should be beyond our as-of-right limit in the varied
//     dimension (above a max, below a min); and the City's cited required value vs ours.
// Usage: node oracle-compare.mjs <oracleA-lots> <oracleA-eval> <oracleB-lots> <oracleB-eval> <out.json>
import fs from 'node:fs';
const [AL, AE, BL, BE, OUT] = process.argv.slice(2);
const rd = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const join = (lf, ef) => { const L = new Map(rd(lf).lots.map((x) => [x.id, x])); return rd(ef).lots.map((e) => ({ ...e, oracle: L.get(e.id).oracle })); };
const num = (r) => (r && r.status !== 'not_evaluated' && typeof r.value === 'number' ? r.value : null);
const r1 = (x) => Math.round(x * 10) / 10;
// ---------------- (a)
const A = join(AL, AE); const aRows = [];
for (const x of A) {
  const R = x.rows['detached_house|pitched'].res; const fsi = num(R.fsi); const area = x.lot.vars.lot_area_m2; const res = x.oracle.residential_sqm;
  const cap = fsi !== null ? fsi * area : null;
  aRows.push({ id: x.id, address: x.address, zone_label: x.lot.zone_label, lot_area_m2: area, residential_sqm: res, our_fsi: fsi ?? (R.fsi.value ?? R.fsi.reason), our_gfa_cap: cap !== null ? r1(cap) : null,
    ratio: cap ? Math.round((res / cap) * 100) / 100 : null, legacy_gfa: x.legacy.gfa, built_fsi: r1((res / area) * 100) / 100, description: x.oracle.description });
}
const aCmp = aRows.filter((r) => r.our_gfa_cap !== null);
const aOver = aCmp.filter((r) => r.residential_sqm > r.our_gfa_cap * 1.0);
const aOver25 = aCmp.filter((r) => r.residential_sqm > r.our_gfa_cap * 1.25);
const aLeg = aRows.filter((r) => r.legacy_gfa); const aLegOver = aLeg.filter((r) => r.residential_sqm > r.legacy_gfa);
const quant = (arr, q) => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[Math.floor(q * (s.length - 1))] : null; };
const a = { n: aRows.length, comparable: aCmp.length, no_fsi_cap: aRows.length - aCmp.length,
  share_over_cap: aCmp.length ? r1((aOver.length / aCmp.length) * 1000) / 10 : null, share_over_cap_by_25pct: aCmp.length ? r1((aOver25.length / aCmp.length) * 1000) / 10 : null,
  ratio_p25: quant(aCmp.map((r) => r.ratio), 0.25), ratio_p50: quant(aCmp.map((r) => r.ratio), 0.5), ratio_p75: quant(aCmp.map((r) => r.ratio), 0.75),
  legacy_comparable: aLeg.length, legacy_share_over: aLeg.length ? r1((aLegOver.length / aLeg.length) * 1000) / 10 : null,
  examples_over: aOver25.sort((x, y) => y.ratio - x.ratio).slice(0, 8), by_zone: {} };
for (const r of aCmp) { const z = r.zone_label.split(' ')[0]; const b = (a.by_zone[z] ||= { n: 0, over: 0 }); b.n++; if (r.residential_sqm > r.our_gfa_cap) b.over++; }
// ---------------- (b)
const MAXT = new Set(['fsi', 'height_m', 'main_wall_height_m', 'lot_coverage_pct', 'building_length_m', 'building_depth_m']);
const UNIT = { fsi: 'ratio', height_m: 'm', main_wall_height_m: 'm', lot_coverage_pct: 'pct', building_length_m: 'm', building_depth_m: 'm', front_setback_m: 'm', rear_setback_m: 'm', side_setback_m: 'm' };
const B = join(BL, BE); const bRows = [];
for (const x of B) {
  const o = x.oracle; const t = o.target; const R = x.rows['detached_house|pitched'].res; const ours = R[t]; const ov = num(ours);
  if ((o.proposed_unit || UNIT[t]) !== UNIT[t] && !(t === 'lot_coverage_pct' && /%|pct|percent/.test(String(o.proposed_unit)))) { bRows.push({ id: x.id, target: t, skip: `unit ${o.proposed_unit}` }); continue; }
  const row = { id: x.id, application: o.application_number, hearing: o.hearing_date, address: x.address, zone_label: x.lot.zone_label, target: t, proposed: o.proposed_value, city_required: o.required_value,
    city_required_unit: o.required_unit, ours: ov ?? (ours ? ours.reason || ours.value || ours.status : null), ours_winner: ours && ours.winner };
  if (ov === null) row.verdict = 'ours_not_numeric';
  else if (MAXT.has(t)) row.verdict = o.proposed_value > ov + 1e-9 ? 'beyond_ours' : 'within_ours';
  else row.verdict = o.proposed_value < ov - 1e-9 ? 'beyond_ours' : 'within_ours';
  if (ov !== null && o.required_value !== null && (o.required_unit || UNIT[t]) === UNIT[t]) row.city_required_matches_ours = Math.abs(o.required_value - ov) < 0.011;
  bRows.push(row);
}
const bC = bRows.filter((r) => r.verdict === 'beyond_ours' || r.verdict === 'within_ours');
const byT = {}; for (const r of bRows) { if (r.skip) continue; const s = (byT[r.target] ||= { n: 0, comparable: 0, beyond: 0, within: 0, not_numeric: 0, city_req_cmp: 0, city_req_match: 0 }); s.n++;
  if (r.verdict === 'ours_not_numeric') s.not_numeric++; else { s.comparable++; s[r.verdict === 'beyond_ours' ? 'beyond' : 'within']++; }
  if (r.city_required_matches_ours !== undefined) { s.city_req_cmp++; if (r.city_required_matches_ours) s.city_req_match++; } }
const b = { n: bRows.length, skipped_unit: bRows.filter((r) => r.skip).length, comparable: bC.length, share_beyond_ours: bC.length ? r1((bC.filter((r) => r.verdict === 'beyond_ours').length / bC.length) * 1000) / 10 : null,
  city_required_match_rate: (() => { const c = bRows.filter((r) => r.city_required_matches_ours !== undefined); return c.length ? r1((c.filter((r) => r.city_required_matches_ours).length / c.length) * 1000) / 10 : null; })(),
  by_target: byT, examples_within: bC.filter((r) => r.verdict === 'within_ours').slice(0, 12) };
fs.writeFileSync(OUT, JSON.stringify({ a, b, a_rows: aRows, b_rows: bRows }, null, 1));
console.log('(a)', JSON.stringify({ ...a, examples_over: undefined }));
console.log('(b)', JSON.stringify({ ...b, examples_within: undefined }, null, 0));
