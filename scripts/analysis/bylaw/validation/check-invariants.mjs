// Bylaw real-lot validation (2026-10-19): the Spec 78 P5.15 invariants that can run on evaluator output before the
// P5.13 scenario step exists, plus targeted checks for the 2026-10-19 rulings. Reads eval output; pure; no DB.
// Usage: node check-invariants.mjs <root> <eval.json> <out.json>
import fs from 'node:fs'; import path from 'node:path';
const [ROOT, EV, OUT] = process.argv.slice(2);
const d = JSON.parse(fs.readFileSync(EV, 'utf8'));
const prov = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/reference/bylaw-provisions.json'), 'utf8'));
const regIds = new Set(prov.rows.map((r) => r.regulation_id));
const num = (r) => (r && r.status !== 'not_evaluated' && typeof r.value === 'number' ? r.value : null);
const reasonCode = (r) => String((r && r.reason) || '').split(':')[0];
const checks = {}; const add = (id, title, scope) => (checks[id] ||= { id, title, scope, checked: 0, violations: [] });
const v = (c, lot, key, detail) => c.violations.push({ parcel_id: lot.id, address: lot.address, stratum: lot.stratum, scenario: key, ...detail });
const ZONES_NO = { lot_coverage_pct: ['R'], building_length_m: ['R', 'RT'], building_depth_m: ['RT'] };
for (const L of d.lots) {
  const z = L.lot.zone; const lab = L.lot.label || {};
  for (const [key, row] of Object.entries(L.rows)) {
    const [bt, roof] = key.split('|'); const R = row.res;
    if (reasonCode(R.height_m) === 'exception_not_authored') continue; // exception lots without authored closure answer nothing (ruling (d)); counted separately
    // INV-10 (part): main wall height never exceeds the building height
    { const c = add('INV-10a', 'main_wall_height_m ≤ height_m', 'evaluator'); const mw = num(R.main_wall_height_m), h = num(R.height_m);
      if (mw !== null && h !== null) { c.checked++; if (mw > h + 1e-9) v(c, L, key, { main_wall_height_m: mw, height_m: h }); } }
    // INV-16: every applied unit's regulation exists in bylaw-provisions.json
    { const c = add('INV-16', 'every applied unit regulation is in bylaw-provisions.json', 'evaluator');
      for (const [t, r] of Object.entries(R)) for (const u of r.applied || []) { c.checked++; const reg = String(u).split('#')[0].replace(/~.*$/, ''); if (!regIds.has(reg)) v(c, L, key, { target: t, unit: u }); } }
    // INV-18 (part, M-159): no place-of-worship / non-residential-use unit applied to a residential building type
    { const c = add('INV-18', 'no non-residential-use unit applied to a residential scenario (M-159)', 'evaluator');
      for (const [t, r] of Object.entries(R)) for (const u of r.applied || []) { c.checked++; if (/^10\.\d+\.20\.100\(/.test(String(u)) || /^150\.50\./.test(String(u))) v(c, L, key, { target: t, unit: u }); } }
    // INV-19: no no_candidate where the article does not exist in the zone (known OWED: M-220)
    { const c = add('INV-19', 'no not_evaluated:no_candidate on R coverage, R/RT length, RT depth, RT main walls (M-220, OWED)', 'evaluator');
      for (const [t, zs] of Object.entries(ZONES_NO)) if (zs.includes(z)) { c.checked++; if (reasonCode(R[t]) === 'no_candidate') v(c, L, key, { target: t }); }
      if (z === 'RT') { c.checked++; if (reasonCode(R.main_wall_height_m) === 'no_candidate') v(c, L, key, { target: 'main_wall_height_m' }); } }
    // INV-11 (part): unit cap never above 6; 'u' binds in RD / RS (M-202(2))
    { const c = add('INV-11a', 'dwelling_units_max ≤ 6, and = u in RD/RS when labelled', 'evaluator'); const du = num(R.dwelling_units_max);
      if (du !== null) { c.checked++; if (du > 6) v(c, L, key, { dwelling_units_max: du }); else if ((z === 'RD' || z === 'RS') && lab.u != null && du > lab.u) v(c, L, key, { dwelling_units_max: du, label_u: lab.u }); } }
    // Q-M218 (2026-10-19): the 1.4 m step-back exists only with a flat or shallow roof, and is 1.4
    { const c = add('Q-M218', 'upper_storey_setback_m: 1.4 m with a flat roof only; none with a pitched roof', 'ruling');
      const s = R.upper_storey_setback_m; c.checked++;
      if (roof === 'pitched' && s && s.status !== 'not_evaluated' && s.value !== null && s.value !== 'not_applicable') v(c, L, key, { upper_storey_setback_m: s.value, why: 'step-back on a pitched roof' });
      if (roof === 'flat' && num(s) !== null && Math.abs(num(s) - 1.4) > 1e-9) v(c, L, key, { upper_storey_setback_m: num(s), why: 'step-back ≠ 1.4' }); }
    // Q-label-defs: detached house frontage / area = the label value when labelled (the zone's own (A))
    if (bt === 'detached_house' && roof === 'pitched' && !L.lot.exception) {
      const c = add('Q-label-defs', 'detached house required frontage / area = label f / a when labelled', 'ruling');
      if (lab.f != null) { c.checked++; const f = num(R.required_lot_frontage_m); if (f === null || Math.abs(f - lab.f) > 1e-9) v(c, L, key, { target: 'required_lot_frontage_m', expected: lab.f, actual: R.required_lot_frontage_m }); }
      if (lab.a != null) { c.checked++; const a = num(R.required_lot_area_m2); if (a === null || Math.abs(a - lab.a) > 1e-9) v(c, L, key, { target: 'required_lot_area_m2', expected: lab.a, actual: R.required_lot_area_m2 }); }
    }
    // M-181(2): semi-detached houseplex lot area = 50 % of a in RS / RT / RM
    if (bt === 'semi_detached_houseplex' && ['RS', 'RT', 'RM'].includes(z) && lab.a != null && roof === 'pitched' && !L.lot.exception) {
      const c = add('M-181(2)', 'semi-detached houseplex required lot area = 50 % of a (RS/RT/RM)', 'ruling'); c.checked++;
      const a = num(R.required_lot_area_m2); if (a === null || Math.abs(a - lab.a / 2) > 1e-9) v(c, L, key, { expected: lab.a / 2, actual: R.required_lot_area_m2 });
    }
    // M-181(3) (2026-10-19, Spec 68 percent link): semi-detached houseplex required frontage = 50 % of (A)/(B) in RS / RM
    if (bt === 'semi_detached_houseplex' && ['RS', 'RM'].includes(z) && lab.f != null && roof === 'pitched' && !L.lot.exception) {
      const c = add('M-181(3)', 'semi-detached houseplex required frontage = 50 % of f (RS/RM)', 'ruling'); c.checked++;
      const f = num(R.required_lot_frontage_m); if (f === null || Math.abs(f - lab.f / 2) > 1e-9) v(c, L, key, { expected: lab.f / 2, actual: R.required_lot_frontage_m });
    }
    // M-187 F06: 4-unit townhouse on a major street needs 20.0 m (RD/RS/RM)
    if (bt === 'townhouse' && L.lot.flags.major_street && roof === 'pitched' && !L.lot.exception) {
      const c = add('M-187-F06', '4-unit townhouse on a major street: required frontage 20.0 m', 'ruling'); c.checked++;
      const f = num(R.required_lot_frontage_m); if (f === null || Math.abs(f - 20) > 1e-9) v(c, L, key, { expected: 20, actual: R.required_lot_frontage_m });
    }
    // RT detached houseplex frontage 6.0 m (10.60.30.20(1)(E), 648-2025)
    if (z === 'RT' && bt === 'detached_houseplex' && roof === 'pitched' && !L.lot.exception) {
      const c = add('RT-houseplex-6.0', 'RT detached houseplex required frontage 6.0 m (10.60.30.20(1)(E))', 'ruling'); c.checked++;
      const f = num(R.required_lot_frontage_m); if (f === null || Math.abs(f - 6) > 1e-9) v(c, L, key, { expected: 6, actual: R.required_lot_frontage_m });
    }
    // Sanity: FSI × lot area is a positive finite GFA where FSI is a value; height in (0, 40]
    { const c = add('SANITY', 'fsi in (0, 3]; height_m in (0, 40]; setbacks ≥ 0', 'evaluator'); const f = num(R.fsi), h = num(R.height_m);
      if (f !== null) { c.checked++; if (!(f > 0 && f <= 3)) v(c, L, key, { fsi: f }); }
      if (h !== null) { c.checked++; if (!(h > 0 && h <= 40)) v(c, L, key, { height_m: h }); }
      for (const t of ['front_setback_m', 'rear_setback_m', 'side_setback_m']) { const s = num(R[t]); if (s !== null) { c.checked++; if (s < 0) v(c, L, key, { [t]: s }); } } }
  }
}
const excN = d.lots.filter((L) => reasonCode(L.rows[Object.keys(L.rows)[0]].res.height_m) === 'exception_not_authored').length;
const res = { exception_lots_not_authored: excN, lots: d.lots.length, checks: Object.values(checks).map((c) => ({ ...c, violations_n: c.violations.length, pass_rate: c.checked ? 1 - c.violations.length / c.checked : null })) };
fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
for (const c of res.checks) console.log(c.id.padEnd(16), `checked ${String(c.checked).padStart(5)}  violations ${String(c.violations_n).padStart(4)}  ${c.title}`);
console.log('exception lots not authored (no answer, ruling (d)):', excN, 'of', d.lots.length);
