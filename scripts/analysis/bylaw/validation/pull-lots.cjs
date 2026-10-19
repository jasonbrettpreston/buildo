// Bylaw real-lot validation (2026-10-19): READ-ONLY pull of a stratified parcel sample → lot vectors.
// One BEGIN READ ONLY transaction, rolled back. Deterministic draw: order by md5(parcel_id) within each stratum.
// Usage: DOTENV_CONFIG_PATH=$HOME/Buildo/.env node -r dotenv/config pull-lots.cjs <out.json> [perStratum | ids:<id,id,…> | major:<n>]
const fs = require('node:fs');
const { Client } = require('pg');
const OUT = process.argv[2]; const PER = Number(process.argv[3] || 4);
const EXC_CH = { R: 2, RD: 3, RS: 4, RT: 5, RM: 6 };
function parseLabel(zn) {
  const m = /^\s*([A-Z]+)\s*(?:\(([^)]*)\))?/.exec(zn || ''); const label = {};
  if (m && m[2]) for (const part of m[2].split(';')) { const p = /^\s*([a-wyz][a-z]?)\s*([\d.]+)\s*$/.exec(part); if (p) label[p[1]] = Number(p[2]); }
  const x = /\(x(\d+)\)/.exec(zn || '');
  return { label, exc: x ? Number(x[1]) : null };
}
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
  await c.query('BEGIN READ ONLY');
  const strata = `
    with base as (
      select p.*, case when frontage_m < 6 then 'a<6' when frontage_m < 10 then 'b6-10' when frontage_m < 15 then 'c10-15' else 'd15+' end as fband,
        case when exception_number is not null then 'exc' when is_corner_lot then 'corner' when abuts_laneway then 'lane' when on_policy_road then 'major' else 'plain' end as kind
      from parcels p
      where zoning_class in ('R','RD','RS','RT','RM') and frontage_m is not null and depth_m is not null and lot_size_sqm is not null
        and lot_size_confidence in ('high','medium') and coalesce(zoning_is_ambiguous,false) = false and zoning_holding = 'N'
        and lot_size_sqm::numeric between 60 and 5000 and feature_type is distinct from 'CONDO'
    ), ranked as (select *, row_number() over (partition by zoning_class, fband, kind order by md5(parcel_id)) rn from base)
    select parcel_id, address_number, linear_name_full, zoning_class, zoning_zn_string, exception_number, zoning_overlays, on_policy_road, is_corner_lot, is_through_lot,
      abuts_laneway, frontage_m::float, depth_m::float, lot_size_sqm::float, in_sixplex_area, fband, kind,
      max_buildable_gfa_sqm::float legacy_gfa, max_build_height_m::float legacy_height, max_build_stories legacy_stories, max_build_fsi::float legacy_fsi
    from ranked where rn <= $1 order by zoning_class, fband, kind, parcel_id`;
  let r;
  const MODE = String(process.argv[3] || '');
  if (MODE.startsWith('ids:')) r = await c.query(strata.replace('where rn <= $1', 'where parcel_id = any($1)').replace(/and lot_size_confidence in \('high','medium'\)/, ''), [MODE.slice(4).split(',')]);
  else if (MODE.startsWith('major:')) r = await c.query(strata.replace('from parcels p', 'from parcels p').replace("when on_policy_road then 'major'", "when on_policy_road then 'major'").replace('where rn <= $1', "where rn <= $1 and kind = 'major' and zoning_class in ('RD','RS','RM')"), [Number(MODE.slice(6))]);
  else r = await c.query(strata, [PER]);
  await c.query('ROLLBACK'); await c.end();
  const lots = r.rows.map((x) => {
    const { label, exc } = parseLabel(x.zoning_zn_string);
    const ov = x.zoning_overlays || {}; const overlays = {};
    if (ov.height_overlay && ov.height_overlay.applied) { if (ov.height_overlay.height_max_m != null) overlays.HT = Number(ov.height_overlay.height_max_m); if (ov.height_overlay.stories != null) overlays.ST = Number(ov.height_overlay.stories); }
    if (ov.lot_coverage_overlay && ov.lot_coverage_overlay.applied && ov.lot_coverage_overlay.coverage_max_pct != null) overlays.LC = Number(ov.lot_coverage_overlay.coverage_max_pct);
    return {
      id: x.parcel_id, stratum: `${x.zoning_class}|${x.fband}|${x.kind}`, address: [x.address_number, x.linear_name_full].filter(Boolean).join(' '),
      legacy: { gfa: x.legacy_gfa, height: x.legacy_height, stories: x.legacy_stories, fsi: x.legacy_fsi },
      lot: {
        zone: x.zoning_class, zone_label: x.zoning_zn_string, label, overlays,
        vars: { lot_frontage_m: x.frontage_m, lot_depth_m: x.depth_m, lot_area_m2: x.lot_size_sqm },
        flags: { corner_lot: !!x.is_corner_lot, through_lot: !!x.is_through_lot, major_street: !!x.on_policy_road, abuts_lane: !!x.abuts_laneway, lawfully_existing: false },
        building_type: 'detached_house', exception: exc != null ? `900.${EXC_CH[x.zoning_class]}.10(${exc})` : null, parcel_id: x.parcel_id,
        address: [x.address_number, x.linear_name_full].filter(Boolean).join(' '),
      },
    };
  });
  fs.writeFileSync(OUT, JSON.stringify({ per_stratum: PER, n: lots.length, lots }, null, 1));
  const by = {}; for (const l of lots) by[l.lot.zone] = (by[l.lot.zone] || 0) + 1;
  console.log('lots', lots.length, by);
})().catch((e) => { console.error(e.message); process.exit(1); });
