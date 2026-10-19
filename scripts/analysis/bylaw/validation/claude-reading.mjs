// Bylaw hand-check round 1, Claude seat: an independent reading of the base-zone clause text (10.x.30 / 10.x.40 for
// R, RD, RS, RT, RM, as dumped by zone-text.mjs), written WITHOUT reading the evaluator's answers. Each value carries the
// clause it comes from. Exception lots get the base-zone reading only (marked), since the reader judges exceptions in
// round 2 from the exception text. Pure. Usage: node claude-reading.mjs <hc-lots.json> <out.json>
import fs from 'node:fs';
import { scenarios } from './ds-round1.mjs';
const [LOTS, OUT] = process.argv.slice(2);
const CH = { R: '10.10', RD: '10.20', RS: '10.40', RT: '10.60', RM: '10.80' };
const U = (v, c) => ({ value: v, clause: c });
const r2 = (x) => Math.round(x * 100) / 100;
function frontage(z, ch, lab, bt, units, major) {
  if (bt === 'townhouse' && major) return U(6.0 * units, `${ch}.30.20(1) major-street townhouse arm: 6.0 m × ${units} units (each unit has its own driveway)`);
  if (z === 'RT' && (bt === 'detached_houseplex' || bt === 'semi_detached_houseplex')) return U(6.0, '10.60.30.20(1)(E)');
  const dflt = { R: 6.0, RD: 12.0, RS: 15.0, RT: 6.0, RM: bt === 'semi_detached_house' ? 15.0 : 12.0 }[z];
  const base = lab.f != null ? lab.f : dflt; const c = lab.f != null ? `${ch}.30.20(1)(A)` : `${ch}.30.20(1)(B)`;
  if (bt === 'semi_detached_houseplex' && (z === 'RS' || z === 'RM')) return U(r2(base / 2), `${ch}.30.20(1)(C) 50 % of (A)/(B)`);
  return U(base, c);
}
function area(z, ch, lab, bt, f) {
  if (bt === 'semi_detached_houseplex' && ['RS', 'RT', 'RM'].includes(z) && lab.a != null) return U(r2(lab.a / 2), `${ch}.30.10(1)(B) 50 % of a`);
  if (lab.a != null) return U(lab.a, `${ch}.30.10(1)(A)`);
  const fv = typeof f.value === 'number' ? f.value : null;
  const ccl = z === 'R' || z === 'RD' ? `${ch}.30.10(1)(B)` : `${ch}.30.10(1)(C)`;
  return fv === null ? U('unknown:frontage', ccl) : U(r2(fv * 30), `${ch}.30.10(1) frontage × 30 (${ccl})`);
}
function height(z, ch, ov, bt, major) {
  if (bt === 'townhouse' && major) return U(Math.max(13, ov.HT ?? 0), `${ch}.40.10(1)(D)(i)`);
  if (bt === 'detached_houseplex' || bt === 'semi_detached_houseplex') return U(Math.max(ov.HT ?? 10, 10), `${ch}.40.10(1)(C)`);
  if (ov.HT != null) return U(ov.HT, `${ch}.40.10(1)(A)`);
  return U(10, `${ch}.40.10(1)(B)`);
}
function sideBand(z, req) {
  if (z === 'RD') { const b = [[6, 0.6], [12, 0.9], [15, 1.2], [18, 1.5], [24, 1.8], [30, 2.4]]; for (const [lim, v] of b) if (req < lim) return v; return 3.0; }
  if (z === 'RS') { if (req < 6) return 0.6; if (req < 12) return 0.9; if (req < 15) return 1.2; return 1.5; }
  return null;
}
function read(L, s) {
  const z = L.lot.zone, ch = CH[z], lab = L.lot.label || {}, ov = L.lot.overlays || {}, v = L.lot.vars, bt = s.building_type, major = !!L.lot.flags.major_street;
  const units = s.dwelling_units || 1;
  const out = {};
  const f = frontage(z, ch, lab, bt, units, major);
  const h = height(z, ch, ov, bt, major);
  for (const t of s.targets) {
    switch (t) {
      case 'required_lot_frontage_m': out[t] = f; break;
      case 'required_lot_area_m2': out[t] = area(z, ch, lab, bt, f); break;
      case 'height_m': out[t] = h; break;
      case 'main_wall_height_m': {
        if (z === 'RT') { out[t] = U('unregulated', 'RT has no main-wall regulation'); break; }
        if (z === 'RM' && !['detached_house', 'semi_detached_house'].includes(bt)) { out[t] = U('unregulated', '10.80.40.10(2) names detached / semi-detached only'); break; }
        if (s.roof === 'flat' && z === 'RD') { out[t] = U(Math.max(7.2, h.value - 2.5), '10.20.40.10(4)(A)'); break; }
        out[t] = U(Math.max(7.0, h.value - 2.5), `${ch}.40.10(2)`); break;
      }
      case 'upper_storey_setback_m': {
        if (s.roof !== 'flat') { out[t] = U('not_applicable', 'pitched roof'); break; }
        if (z === 'RT') { out[t] = U('unregulated', 'RT has no main-wall regulation'); break; }
        out[t] = U(1.4, { R: '10.10.40.10(11)/(12)', RD: '10.20.40.10(4)(B)', RS: '10.40.40.10(6)(A)', RM: '10.80.40.10(6)(A)' }[z]); break;
      }
      case 'height_storeys': {
        if (bt === 'detached_houseplex' || bt === 'semi_detached_houseplex') { out[t] = U('not_applicable', `${ch}.40.10(3)(C)`); break; }
        out[t] = ov.ST != null ? U(ov.ST, `${ch}.40.10(3)(A)`) : U('unregulated', `${ch}.40.10(3)(B)`); break;
      }
      case 'fsi': {
        if (bt === 'detached_houseplex' || bt === 'semi_detached_houseplex') { out[t] = U('not_applicable', `${ch}.40.40(1)(C)`); break; }
        if (lab.d != null) out[t] = U(lab.d, `${ch}.40.40(1)(A)`); else out[t] = z === 'R' ? U(0.6, '10.10.40.40(1)(B)') : U('unregulated', `${ch}.40.40(1)(B)`); break;
      }
      case 'lot_coverage_pct': {
        if (z === 'R') { out[t] = U('unregulated', 'no R lot-coverage article'); break; }
        out[t] = ov.LC != null ? U(ov.LC, `${ch}.30.40(1)(A)`) : U('unregulated', `${ch}.30.40(1)(B)`); break;
      }
      case 'rear_setback_m': out[t] = (z === 'R' || z === 'RT') ? U(7.5, `${ch}.40.70(2)`) : U(r2(Math.max(7.5, 0.25 * v.lot_depth_m)), `${ch}.40.70(2) greater of 7.5 or 25 % depth`); break;
      case 'side_setback_m': {
        if (z === 'R' || z === 'RT') { out[t] = U(0.9, z === 'R' ? '10.10.40.70(3)(A)' : '10.60.40.70(3)(B)'); break; }
        if (z === 'RM') { out[t] = U(1.2, '10.80.40.70(3)(A)'); break; }
        out[t] = typeof f.value === 'number' ? U(sideBand(z, f.value), `${ch}.40.70(3) band on required frontage ${f.value}`) : U('unknown:frontage', ''); break;
      }
      case 'building_depth_m': {
        if (z === 'R') { out[t] = U(17.0, '10.10.40.30(1)(A)'); break; }
        if (z === 'RT') { out[t] = U('unregulated', 'RT has no depth article'); break; }
        if (z === 'RD' && !(typeof f.value === 'number' && f.value <= 18)) { out[t] = U('unregulated', '10.20.40.30(1) only when required frontage ≤ 18.0'); break; }
        out[t] = U(19.0, `${ch}.40.30(1) (from the required front yard setback)`); break;
      }
      case 'building_length_m': {
        if (z === 'R' || z === 'RT') { out[t] = U('unregulated', `${ch}.40.20(1) major street only`); break; }
        if (z === 'RD' && !(typeof f.value === 'number' && f.value <= 18)) { out[t] = U('unregulated', '10.20.40.20(1) only when required frontage ≤ 18.0'); break; }
        out[t] = U(17.0, `${ch}.40.20(1)`); break;
      }
      default: out[t] = U('unknown:not read', '');
    }
  }
  return out;
}
const { lots } = JSON.parse(fs.readFileSync(LOTS, 'utf8'));
const res = lots.map((L) => ({ id: L.id, base_zone_only: !!L.lot.exception, scenarios: scenarios(L).map((s) => ({ building_type: s.building_type, roof: s.roof, values: read(L, s) })) }));
fs.writeFileSync(OUT, JSON.stringify({ seat: 'claude', lots: res }, null, 1));
console.log('claude reading', res.length, 'lots');
