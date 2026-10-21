// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-127 (notice address -> parcel link); DRAFT RULING pending (see coa-parse.cjs). READ-ONLY (BEGIN READ ONLY, rolled back).
// Usage: DOTENV_CONFIG_PATH=$HOME/Buildo/.env node -r dotenv/config scripts/analysis/bylaw-validation/coa-pull-parcels.cjs <notices.json> <parcels.json>
// READ-ONLY: notice address → address_points_active → parcel_address_points → parcels (+ abutments). One BEGIN READ ONLY txn, rolled back.
const fs = require('fs'); const { Client } = require('pg');
const [NOT, OUT] = process.argv.slice(2);
const notices = JSON.parse(fs.readFileSync(NOT, 'utf8'));
const norm = (a) => a.replace(/\s+[–-]\s+PART\s+\d+$/i, '').trim().toUpperCase();
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL }); await c.connect(); await c.query('BEGIN READ ONLY');
  const res = {};
  try {
    for (const n of notices) {
      const addr = norm(n.address);
      const ap = await c.query(`select address_point_id, address_full, addr_num_normalized, linear_name_normalized from address_points_active where upper(address_full) = $1`, [addr]);
      let how = 'address_full';
      let apr = ap.rows;
      if (!apr.length) { const m = /^(\d+)\s+(\S+)/.exec(addr); if (m) { apr = (await c.query(`select address_point_id, address_full from address_points_active where addr_num_normalized=$1 and linear_name_normalized=$2`, [m[1], m[2]])).rows; how = 'num+name'; } }
      const ids = apr.map((r) => r.address_point_id);
      // cross-check / fallback: the parcel's own address columns (the durie-check lane's q6 / q9 approach)
      const mm = /^(\d+)\s+(.+)$/.exec(addr);
      const byAddr = mm ? (await c.query(`select id from parcels where address_number = $1 and upper(linear_name_full) = $2`, [mm[1], mm[2]])).rows.map((r) => r.id) : [];
      const pidList = ids.length ? null : byAddr; if (!ids.length && byAddr.length) how = 'parcels.address (no address point)';
      const pr = (ids.length || byAddr.length) ? (await c.query(`select p.id, p.parcel_id, p.feature_type, p.address_number, p.linear_name_full, p.zoning_class, p.zoning_zn_string, p.zoning_holding, p.zoning_is_ambiguous, p.exception_number, p.zoning_overlays,
        p.on_policy_road, p.is_corner_lot, p.is_through_lot, p.abuts_laneway, p.frontage_m::float, p.depth_m::float, p.lot_size_sqm::float, p.lot_size_basis, p.lot_size_source, p.lot_size_confidence, p.is_heritage_designated, p.in_sixplex_area,
        p.bylaw_max_fsi::float, p.bylaw_max_coverage_pct::float, p.bylaw_max_height_m::float, p.bylaw_max_stories, p.max_buildable_footprint_sqm::float, p.max_buildable_gfa_sqm::float, p.max_buildable_gfa_basis, p.max_build_fsi::float,
        p.max_build_height_m::float, p.max_build_stories, p.max_build_basis, p.max_build_setback_basis, p.max_build_length_m::float, p.max_garage_gfa_sqm::float, p.max_garden_suite_gfa_sqm::float, p.max_laneway_suite_gfa_sqm::float,
        ST_Area(p.geom::geography)::float geog_area
        from parcels p where p.id in (select pap.parcel_id from parcel_address_points pap where pap.address_point_id = any($1)) or p.id = any($2) order by p.id`, [ids, pidList || []])).rows : [];
      for (const p of pr) p.abutments = (await c.query(`select a.neighbour_id, a.neighbour_residential, a.same_frontage_street, a.neighbour_building_id, a.bldg_to_subject_m::float, a.front_setback_est_m::float, a.est_status from parcel_abutments a where a.parcel_id = $1`, [p.id])).rows;
      res[n.file_number] = { address: n.address, query: addr, how, address_points: apr, parcels_by_address_columns: byAddr, parcels: pr };
    }
  } finally { await c.query('ROLLBACK'); await c.end(); }
  fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
  for (const [k, v] of Object.entries(res)) console.log(k, v.query, v.how, 'ap', v.address_points.length, 'parcels', v.parcels.map((p) => `${p.id}/${p.parcel_id} ${p.zoning_zn_string} A=${p.lot_size_sqm}`).join(' | '));
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
