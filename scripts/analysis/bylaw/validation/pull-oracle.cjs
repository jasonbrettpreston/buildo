// Bylaw real-world oracle pull (2026-10-19): READ-ONLY. One BEGIN READ ONLY transaction, rolled back.
// (a) new detached-house permits (New Houses / SFD - Detached / New Building, issued or later), linked to an R/RD/RS/RT/RM
//     parcel with no exception, with a reported residential area, and with NO Committee of Adjustment application linked
//     to the permit or to the parcel; (b) approved CoA variance items on built-form targets, linked to such a parcel.
// Deterministic draw: md5 order. Output: lots files in the pull-lots.cjs shape plus the oracle payload per lot.
// Usage: DOTENV_CONFIG_PATH=$HOME/Buildo/.env node -r dotenv/config pull-oracle.cjs <outA.json> <outB.json> [nA] [nB]
const fs = require('node:fs');
const { Client } = require('pg');
const [OUTA, OUTB] = process.argv.slice(2, 4); const NA = Number(process.argv[4] || 300); const NB = Number(process.argv[5] || 500);
const EXC_CH = { R: 2, RD: 3, RS: 4, RT: 5, RM: 6 };
function parseLabel(zn) {
  const m = /^\s*([A-Z]+)\s*(?:\(([^)]*)\))?/.exec(zn || ''); const label = {};
  if (m && m[2]) for (const part of m[2].split(';')) { const p = /^\s*([a-wyz][a-z]?)\s*([\d.]+)\s*$/.exec(part); if (p) label[p[1]] = Number(p[2]); }
  return label;
}
function lotOf(x) {
  const ov = x.zoning_overlays || {}; const overlays = {};
  if (ov.height_overlay && ov.height_overlay.applied) { if (ov.height_overlay.height_max_m != null) overlays.HT = Number(ov.height_overlay.height_max_m); if (ov.height_overlay.stories != null) overlays.ST = Number(ov.height_overlay.stories); }
  if (ov.lot_coverage_overlay && ov.lot_coverage_overlay.applied && ov.lot_coverage_overlay.coverage_max_pct != null) overlays.LC = Number(ov.lot_coverage_overlay.coverage_max_pct);
  return { zone: x.zoning_class, zone_label: x.zoning_zn_string, label: parseLabel(x.zoning_zn_string), overlays,
    vars: { lot_frontage_m: Number(x.frontage_m), lot_depth_m: Number(x.depth_m), lot_area_m2: Number(x.lot_size_sqm) },
    flags: { corner_lot: !!x.is_corner_lot, through_lot: !!x.is_through_lot, major_street: !!x.on_policy_road, abuts_lane: !!x.abuts_laneway, lawfully_existing: false },
    building_type: 'detached_house', exception: null, parcel_id: x.parcel_id, address: [x.address_number, x.linear_name_full].filter(Boolean).join(' ') };
}
const PCOLS = `x.id pid, x.parcel_id, x.address_number, x.linear_name_full, x.zoning_class, x.zoning_zn_string, x.zoning_overlays, x.on_policy_road, x.is_corner_lot, x.is_through_lot,
  x.abuts_laneway, x.frontage_m, x.depth_m, x.lot_size_sqm, x.max_buildable_gfa_sqm::float legacy_gfa, x.max_build_fsi::float legacy_fsi`;
const PWHERE = `x.zoning_class in ('R','RD','RS','RT','RM') and x.exception_number is null and x.frontage_m is not null and x.depth_m is not null
  and x.lot_size_sqm is not null and x.lot_size_confidence in ('high','medium') and coalesce(x.zoning_is_ambiguous,false) = false`;
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
  await c.query('BEGIN READ ONLY');
  const a = await c.query(`
    with coa_parcels as (select distinct zoning_dominant_parcel_id pid from coa_applications where zoning_dominant_parcel_id is not null)
    select ${PCOLS}, p.permit_num, p.revision_num, p.issued_date, p.status, p.residential_sqm::float residential_sqm, p.storeys, left(p.description, 160) description
    from permits p join permit_parcels pp on pp.permit_num = p.permit_num and pp.revision_num = p.revision_num and pp.confidence >= 0.9
    join parcels x on x.id = pp.parcel_id
    where p.permit_type = 'New Houses' and p.structure_type = 'SFD - Detached' and p.work = 'New Building' and p.residential_sqm > 0
      and p.linked_coa_application_number is null and p.status in ('Permit Issued','Inspection','Pending Closed','Closed','Completed')
      and p.issued_date >= '2014-05-09' and x.id not in (select pid from coa_parcels) and ${PWHERE}
    order by md5(p.permit_num) limit $1`, [NA]);
  const b = await c.query(`
    select ${PCOLS}, v.variance_key, v.application_number, v.target, v.required_value::float required_value, v.required_unit, v.proposed_value::float proposed_value,
      v.proposed_unit, v.decision, v.hearing_date, v.regulation_id_as_cited
    from coa_notice_variances v join coa_applications ca on ca.application_number = v.application_number
    join parcels x on x.id = ca.zoning_dominant_parcel_id
    where v.retired_at is null and v.decision in ('approved','approved_with_conditions') and v.proposed_value is not null
      and v.target in ('fsi','height_m','main_wall_height_m','lot_coverage_pct','building_length_m','building_depth_m','front_setback_m','rear_setback_m','side_setback_m')
      and ${PWHERE}
    order by md5(v.variance_key) limit $1`, [NB]);
  await c.query('ROLLBACK'); await c.end();
  const lotsA = a.rows.map((x) => ({ id: `A:${x.permit_num}`, stratum: `${x.zoning_class}|oracleA`, address: lotOf(x).address, legacy: { gfa: x.legacy_gfa, fsi: x.legacy_fsi }, lot: lotOf(x),
    oracle: { permit_num: x.permit_num, issued: x.issued_date, status: x.status, residential_sqm: x.residential_sqm, storeys: x.storeys, description: x.description } }));
  const lotsB = b.rows.map((x) => ({ id: `B:${x.variance_key}`, stratum: `${x.zoning_class}|oracleB`, address: lotOf(x).address, legacy: { gfa: x.legacy_gfa, fsi: x.legacy_fsi }, lot: lotOf(x),
    oracle: { application_number: x.application_number, target: x.target, required_value: x.required_value, required_unit: x.required_unit, proposed_value: x.proposed_value,
      proposed_unit: x.proposed_unit, decision: x.decision, hearing_date: x.hearing_date, cited: x.regulation_id_as_cited } }));
  fs.writeFileSync(OUTA, JSON.stringify({ n: lotsA.length, lots: lotsA })); fs.writeFileSync(OUTB, JSON.stringify({ n: lotsB.length, lots: lotsB }));
  console.log('oracle A permits', lotsA.length, '· oracle B variance items', lotsB.length);
})().catch((e) => { console.error(e.message); process.exit(1); });
