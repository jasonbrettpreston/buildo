// WF3 full sample dump (read-only): for each sampled parcel, print EVERY input field + the FULL
// 13-line parcel_cost_menu + all headline/FSI scalars — nothing truncated. Parcels were already
// re-enriched by wf3-cost-coherence-sanity.js; this only reads + re-computes the menu in-process.
// Usage: node scripts/analysis/wf3-sample-full-dump.js
'use strict';
const { Pool } = require('pg');
const { buildParcelCostMenu } = require('../lib/parcel-cost.js');
const { parcelFamilyFromZoning } = require('../lib/build-norms.js');

const IDS = [1455, 1786, 1842, 1886, 1940, 3435, 3679, 3684, 3690, 4437, 10003, 10011, 8455, 7281];

(async () => {
  const pool = new Pool({ host: 'localhost', port: 5432, user: 'postgres', password: 'postgres', database: 'buildo' });
  const rates = {};
  for (const r of (await pool.query(`SELECT * FROM archetype_cost_rates`)).rows) rates[r.archetype] = r;
  const idxRow = (await pool.query(`SELECT variable_value FROM logic_variables WHERE variable_key='cost_escalation_index'`)).rows[0];
  const indexNow = idxRow ? Number(idxRow.variable_value) : 100;

  // Every field the cost engine reads + the persisted zoning/FSI context, in full.
  const rows = (await pool.query(`
    SELECT p.id, p.parcel_id, p.zoning_class, p.zoning_is_ambiguous, p.zoning_dominant_area_share::float8 AS zoning_dominant_area_share,
           p.lot_size_sqm::float8 AS lot_size_sqm, p.bylaw_max_fsi::float8 AS bylaw_max_fsi,
           p.opt_aor_gfa_sqm::float8 AS opt_aor_gfa_sqm, p.max_buildable_gfa_sqm::float8 AS max_buildable_gfa_sqm,
           p.opt_coa_gfa_sqm::float8 AS opt_coa_gfa_sqm, p.realized_fsi_p90::float8 AS realized_fsi_p90,
           p.max_buildable_footprint_sqm::float8 AS max_buildable_footprint_sqm,
           p.max_garden_suite_gfa_sqm::float8 AS max_garden_suite_gfa_sqm, p.max_laneway_suite_gfa_sqm::float8 AS max_laneway_suite_gfa_sqm,
           p.cur_est_kitchen_gfa_sqm::float8 AS cur_est_kitchen_gfa_sqm, p.cur_est_bath_gfa_sqm::float8 AS cur_est_bath_gfa_sqm,
           p.max_garage_gfa_sqm::float8 AS max_garage_gfa_sqm, p.cur_floor_gfa_sqm::float8 AS cur_floor_gfa_sqm,
           p.cur_pot_2story_gfa_sqm::float8 AS cur_pot_2story_gfa_sqm,
           p.neighbourhood_cost_premium::float8 AS neighbourhood_cost_premium, p.rear_suite_permission, p.garage_permission,
           p.max_build_confidence,
           COALESCE(p.opt_aor_gfa_sqm, p.max_buildable_gfa_sqm)::float8 AS new_build_area
    FROM parcels p WHERE p.id = ANY($1::int[]) ORDER BY array_position($1::int[], p.id)`, [IDS])).rows;

  const inputsRows = [];
  const menuRows = [];
  const scalarRows = [];
  for (const r of rows) {
    const parcel = { ...r, opt_aor_gfa_sqm: r.new_build_area }; // cost engine reads the COALESCE'd new_build area
    const r2Grounded = parcelFamilyFromZoning(r.zoning_class) === 'detached';
    const built = buildParcelCostMenu(parcel, rates, indexNow, { r2Grounded });
    const n2 = (v) => v == null ? null : Math.round(v * 100) / 100;
    inputsRows.push({
      id: r.id, parcel_id: r.parcel_id, zc: r.zoning_class, amb: r.zoning_is_ambiguous, dom_share: n2(r.zoning_dominant_area_share),
      lot: n2(r.lot_size_sqm), bylaw_fsi: r.bylaw_max_fsi, opt_aor: n2(r.opt_aor_gfa_sqm), maxb_env: n2(r.max_buildable_gfa_sqm),
      new_build_area: n2(r.new_build_area), opt_coa: n2(r.opt_coa_gfa_sqm), realized_fsi: r.realized_fsi_p90,
      footprint: n2(r.max_buildable_footprint_sqm), garden: n2(r.max_garden_suite_gfa_sqm), laneway: n2(r.max_laneway_suite_gfa_sqm),
      kitchen: n2(r.cur_est_kitchen_gfa_sqm), bath: n2(r.cur_est_bath_gfa_sqm), garage: n2(r.max_garage_gfa_sqm),
      cur_floor: n2(r.cur_floor_gfa_sqm), cur_2story: n2(r.cur_pot_2story_gfa_sqm), premium: n2(r.neighbourhood_cost_premium),
      suite_perm: r.rear_suite_permission, garage_perm: r.garage_permission, conf: r.max_build_confidence,
    });
    scalarRows.push({ id: r.id, zc: r.zoning_class, ...Object.fromEntries(Object.entries(built.scalars).map(([k, v]) => [k, typeof v === 'number' ? Math.round(v) : v])) });
    for (const [line, e] of Object.entries(built.menu)) {
      if (line === '_schema_version') continue;
      menuRows.push({
        id: r.id, zc: r.zoning_class, line,
        total: e.total == null ? null : Math.round(e.total), per_sqm: e.per_sqm == null ? null : Math.round(e.per_sqm),
        area: e.area, area_conf: e.area_confidence, fits: 'fits' in e ? e.fits : '-', norm_basis: e.norm_basis,
      });
    }
  }
  console.log('\n################  INPUTS (every field the cost engine reads, per parcel)  ################');
  console.table(inputsRows);
  console.log('\n################  HEADLINE + FSI SCALARS (persisted to parcels)  ################');
  console.table(scalarRows);
  console.log('\n################  FULL 13-LINE MENU — one row per (parcel × line), nothing dropped  ################');
  console.table(menuRows);
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
