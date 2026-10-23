// SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md §Phase-5 P5.15 (validation plan), P5.13
//            docs/specs/01-pipeline/133_bylaw_handbook.md m.71 (shadow before switch), m.22
// Handbook:  operator CHAT-63.C10 (operator-keyed golden cases on one generated form; its field ids are the S2/S4/S5 keys of
//            ~/Buildo-scratch/evidence-rulings/form-def.json), CHAT-63.C8 (calculation floors: >= minRows per scenario family, else
//            pooled); HELD on P3-Q1
//
// P3-11 prep: a READ-ONLY, PURE comparator of Layer 3 module output against operator-keyed golden values. No file, database,
// env or clock is touched; nothing is written. The caller passes cases already loaded. A case that is `synthetic` can never set
// a floor (floorEligible false). Rules of the form are kept: a blank keyed value is "not shown", never zero (not_keyed); every
// number carries its unit and a different unit is not converted (unit_mismatch); fields the modules do not produce yet are
// not_produced (never a mismatch); form fields with no Layer 3 output are not_covered.
//
//   compareCase(case, config)    -> {id, synthetic, scenario, family, fields[], counts}
//   compareLimits(case, config)  -> {id, rows[]}   (S5: our as-of-right limit = the by-law limit the plan says it exceeds)
//   summarize(results, config)   -> {total, families, synthetic, floorEligible}
// config = {abs: {<unit>: tolerance}, rel, minRows}
// case   = {id, synthetic, scenario, family, lot: {area_sqm}, keyed: {<form id>: {value, unit, as_printed}}, computed: {<Layer 3 field>: value,
//           field_citations?}, limits?: [...], computedLimits?: {clause: value}}

/** C-10 form-def S4 id -> the Layer 3 field it checks. covered false = the form field has no Layer 3 output (yet). */
export const FORM_FIELD_MAP = Object.freeze({
  p_type: { field: 'building_class', unit: 'text', covered: true },
  p_units: { field: 'dwelling_units', unit: 'units', covered: true },
  p_bedrooms: { field: 'max_bedrooms', unit: 'count', covered: true },
  p_gfa_total: { field: 'main_gfa_sqm', unit: 'm2', covered: true },
  p_fsi: { field: null, unit: 'ratio', covered: true, derive: { num: 'main_gfa_sqm', per: 1, cite: 'main_gfa_sqm' } },
  p_cov_pct: { field: null, unit: 'percent', covered: true, derive: { num: 'main_footprint_sqm', per: 100, cite: 'main_footprint_sqm' } },
  p_cov_m2: { field: 'main_footprint_sqm', unit: 'm2', covered: true },
  p_height: { field: 'main_height_m', unit: 'm', covered: true },
  p_storeys: { field: 'main_storeys', unit: 'storeys', covered: true },
  p_mainwall: { field: 'main_wall_limit_m', unit: 'm', covered: true },
  p_depth: { field: 'main_depth_cap_m', unit: 'm', covered: true },
  p_length: { field: 'main_length_cap_m', unit: 'm', covered: true },
  p_front: { field: 'main_front_setback_m', unit: 'm', covered: true },
  p_rear: { field: 'main_rear_setback_m', unit: 'm', covered: true },
  p_side: { field: 'main_side_setbacks_m', unit: 'm', covered: true, reduce: 'min' },
  p_land_front: { field: null, unit: 'percent', covered: false },
  p_land_rear: { field: null, unit: 'percent', covered: false },
  p_parking: { field: null, unit: 'count', covered: false },
  p_platform: { field: null, unit: 'm2', covered: false },
  p_suite_type: { field: 'suite_type', unit: 'text', covered: true },
  p_suite_gfa: { field: 'suite_gfa_sqm', unit: 'm2', covered: true },
  p_suite_height: { field: 'suite_height_m', unit: 'm', covered: true },
  p_suite_sep: { field: 'suite_separation_m', unit: 'm', covered: true },
  p_suite_setbacks: { field: null, unit: 'm', covered: false },
});

const STATUSES = ['match', 'mismatch', 'not_keyed', 'not_produced', 'not_covered', 'unit_mismatch'];

function checkConfig(cfg) {
  if (!cfg || typeof cfg.abs !== 'object' || cfg.abs === null || !Number.isFinite(cfg.rel) || !Number.isFinite(cfg.minRows)) {
    throw new TypeError('golden-compare: config {abs: {<unit>: tolerance}, rel, minRows} is required; a missing input is never defaulted');
  }
}

const blank = (v) => v === null || v === undefined;
const round9 = (x) => Math.round(x * 1e9) / 1e9;

function tolerance(unit, a, b, cfg) {
  if (!Object.prototype.hasOwnProperty.call(cfg.abs, unit)) throw new TypeError(`golden-compare: config.abs has no tolerance for unit ${JSON.stringify(unit)}`);
  return Math.max(cfg.abs[unit], cfg.rel * Math.max(Math.abs(a), Math.abs(b)));
}

function computedValue(map, c) {
  const comp = c.computed || {};
  if (map.derive) {
    const n = comp[map.derive.num];
    const area = c.lot && c.lot.area_sqm;
    if (blank(n) || !Number.isFinite(area)) return null;
    return (n / area) * map.derive.per;
  }
  const v = comp[map.field];
  if (blank(v)) return null;
  if (map.reduce === 'min' && Array.isArray(v)) return Math.min(...v);
  return v;
}

function citedFor(map, c) {
  const key = map.derive ? map.derive.cite : map.field;
  const cites = c.computed && c.computed.field_citations && key ? c.computed.field_citations[key] : null;
  return cites ? [...new Set(cites.map((x) => x.unit_id))].sort() : [];
}

export function compareCase(c, cfg) {
  checkConfig(cfg);
  const fields = [];
  for (const [formId, entry] of Object.entries(c.keyed || {})) {
    if (!Object.prototype.hasOwnProperty.call(FORM_FIELD_MAP, formId)) throw new Error(`golden-compare: ${JSON.stringify(formId)} is not a C-10 form id (the map is closed)`);
    const map = FORM_FIELD_MAP[formId];
    const row = { form_id: formId, field: map.field, unit: map.unit };
    if (blank(entry.value)) { fields.push({ ...row, status: 'not_keyed' }); continue; }
    if (!map.covered) { fields.push({ ...row, status: 'not_covered', keyed: entry.value }); continue; }
    if (entry.unit !== map.unit) { fields.push({ ...row, status: 'unit_mismatch', keyed: entry.value, keyed_unit: entry.unit }); continue; }
    const got = computedValue(map, c);
    if (got === null) { fields.push({ ...row, status: 'not_produced', keyed: entry.value }); continue; }
    if (map.unit === 'text') { fields.push({ ...row, status: got === entry.value ? 'match' : 'mismatch', keyed: entry.value, computed: got, cited_clauses: citedFor(map, c) }); continue; }
    const delta = round9(got - entry.value);
    const ok = Math.abs(got - entry.value) <= tolerance(map.unit, entry.value, got, cfg);
    fields.push({ ...row, status: ok ? 'match' : 'mismatch', keyed: entry.value, computed: got, delta, cited_clauses: citedFor(map, c) });
  }
  const counts = Object.fromEntries(STATUSES.map((s) => [s, fields.filter((f) => f.status === s).length]));
  return { id: c.id, synthetic: c.synthetic === true, scenario: c.scenario, family: c.family, fields, counts };
}

export function compareLimits(c, cfg) {
  checkConfig(cfg);
  const rows = [];
  for (const l of c.limits || []) {
    const lim = l.bylaw_limit;
    const row = { clause: l.clause, unit: lim.unit };
    const prop = l.proposed;
    const exam = l.examiner;
    // approved = as-of-right + the granted variance: yes -> examiner = proposed; modified -> between the limit and the proposal; no -> blank
    let approved = 'consistent';
    if (l.granted === 'yes') approved = !blank(exam.value) && !blank(prop.value) && Math.abs(exam.value - prop.value) <= tolerance(prop.unit, exam.value, prop.value, cfg) ? 'consistent' : 'inconsistent';
    else if (l.granted === 'modified') {
      const lo = blank(lim.value) ? -Infinity : Math.min(lim.value, prop.value);
      const hi = Math.max(blank(lim.value) ? prop.value : lim.value, prop.value);
      approved = !blank(exam.value) && exam.value >= lo - 1e-9 && exam.value <= hi + 1e-9 ? 'consistent' : 'inconsistent';
    } else if (l.granted === 'no') approved = blank(exam.value) ? 'consistent' : 'inconsistent';
    if (blank(lim.value)) { rows.push({ ...row, status: 'not_keyed', approved_check: approved }); continue; }
    const ours = c.computedLimits ? c.computedLimits[l.clause] : undefined;
    const variance = blank(prop.value) ? null : round9(prop.value - lim.value);
    if (blank(ours)) { rows.push({ ...row, status: 'not_produced', keyed: lim.value, variance, approved_check: approved }); continue; }
    const ok = Math.abs(ours - lim.value) <= tolerance(lim.unit, lim.value, ours, cfg);
    rows.push({ ...row, status: ok ? 'match' : 'mismatch', keyed: lim.value, computed: ours, variance, approved_check: approved });
  }
  return { id: c.id, rows };
}

export function summarize(results, cfg) {
  checkConfig(cfg);
  const total = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  const byFamily = new Map();
  for (const r of results) {
    for (const s of STATUSES) total[s] += r.counts[s];
    const f = byFamily.get(r.family) || { cases: 0, rows: 0, match: 0, mismatch: 0 };
    f.cases += 1;
    f.match += r.counts.match;
    f.mismatch += r.counts.mismatch;
    f.rows += r.counts.match + r.counts.mismatch;
    byFamily.set(r.family, f);
  }
  const families = {};
  const pooled = { cases: 0, rows: 0, match: 0, mismatch: 0 };
  for (const [name, f] of [...byFamily.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (f.rows >= cfg.minRows) families[name] = { ...f, rate: f.rows === 0 ? null : f.match / f.rows };
    else for (const k of Object.keys(pooled)) pooled[k] += f[k];
  }
  if (pooled.cases > 0) families.pooled = { ...pooled, rate: pooled.rows === 0 ? null : pooled.match / pooled.rows, note: `pooled: families with fewer than ${cfg.minRows} compared rows` };
  const synthetic = results.some((r) => r.synthetic);
  return { total, families, synthetic, floorEligible: results.length > 0 && !synthetic };
}
