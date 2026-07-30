// WF3 cost-coherence reality check (re-runnable). Pulls a diverse sample, snapshots the OLD
// bylaw_max_fsi, re-enriches the sample scoped (zoning→max-build→existing→optconfig, full=true),
// re-costs each parcel in-process, and prints:
//   - fsi_before → fsi_after   (Fix B: borrowed sliver FSI on RD/RS should drop to null)
//   - new_build vs coa_build    (Fix A: new_build must be ≤ coa_build — coherent)
// Dev DB (postgres/postgres@localhost:5432/buildo). Read-only except the scoped re-enrich UPDATE.
// Usage: node scripts/analysis/wf3-cost-coherence-sanity.js
'use strict';
const { Pool } = require('pg');
const ep = require('../enrich-parcels.js');
const mb = require('../lib/max-build.js');
const { buildParcelCostMenu } = require('../lib/parcel-cost.js');
const { parcelFamilyFromZoning } = require('../lib/build-norms.js');
const pipeline = require('../lib/pipeline.js');

// A few flagged anchors (2 fixed inversions + 1 legit-FSI-preserved + 1 normal) + suspects below.
// Kept small: this box's PostGIS re-enrich is ~slow, so a lean scope finishes in a few minutes.
const FLAGGED = [1786, 7281, 1842, 1455];
const SUSPECT_LIMIT = 10;

const roadDist = 5, storeyHeight = mb.RESIDENTIAL_STOREY_HEIGHT_M;
const reno = { coaUplift: mb.RENO_COA_UPLIFT_PCT_DEFAULT, kitchenPct: mb.RENO_KITCHEN_GFA_PCT_DEFAULT, bathPct: mb.RENO_BATH_GFA_PCT_DEFAULT, mislinkTol: mb.MISLINK_FOOTPRINT_LOT_TOL_DEFAULT };
const acc = {
  gardenMinLot: mb.GARDEN_SUITE_MIN_LOT_SQM, gardenMinRearYard: mb.GARDEN_SUITE_MIN_REAR_YARD_M, gardenMaxGfa: mb.GARDEN_SUITE_MAX_GFA_SQM,
  garageMinLot: mb.GARAGE_MIN_LOT_SQM, garageMaxGfa: mb.GARAGE_MAX_GFA_SQM, garageMinFootprint: mb.GARAGE_MIN_FOOTPRINT_SQM,
  accessoryMaxCovPct: mb.ACCESSORY_MAX_COVERAGE_PCT, carFootprint: mb.CAR_FOOTPRINT_SQM,
  lanewayMaxGfa: mb.LANEWAY_SUITE_MAX_GFA_SQM, lanewayMinLot: mb.LANEWAY_SUITE_MIN_LOT_SQM, lanewayMinRearYard: mb.LANEWAY_SUITE_MIN_REAR_YARD_M,
  minSoftPct: mb.MIN_SOFT_LANDSCAPING_PCT, lanewayStoreys: mb.LANEWAY_SUITE_STOREYS, gardenStoreys: mb.GARDEN_SUITE_STOREYS,
};

(async () => {
  const pool = new Pool({ host: 'localhost', port: 5432, user: 'postgres', password: 'postgres', database: 'buildo' });

  // Build the sample: flagged 11 + up to 25 borrowed-FSI suspects (RD/RS with fsi≥1.5 today)
  // + up to 12 diverse across other residential zones. Deterministic (ORDER BY id).
  const suspects = (await pool.query(`
    SELECT id FROM parcels
    WHERE upper(zoning_class) IN ('RD','RS') AND bylaw_max_fsi >= 1.5
      AND max_buildable_gfa_sqm IS NOT NULL
    ORDER BY id LIMIT ${SUSPECT_LIMIT}`)).rows.map((r) => r.id);
  const IDS = [...new Set([...FLAGGED, ...suspects])];
  const SCOPE = `p.id IN (${IDS.join(',')})`;
  console.log(`Sample: ${IDS.length} parcels (${FLAGGED.length} flagged anchors + ${suspects.length} borrowed-FSI suspects)`);

  // Snapshot OLD fsi before re-enriching.
  const before = {};
  for (const r of (await pool.query(`SELECT p.id, p.bylaw_max_fsi::float8 AS fsi FROM parcels p WHERE ${SCOPE}`)).rows) before[r.id] = r.fsi;

  // Re-enrich the sample scoped, full=true.
  await pipeline.withTransaction(pool, async (client) => {
    const runAt = await pipeline.getDbTimestamp(client);
    await ep.enrichParcels(client, { scopeWhere: SCOPE, full: true, roadDist, runAt, staleOverlays: new Set() });
    await ep.enrichMaxBuild(client, { scopeWhere: SCOPE, full: true, storeyHeight, acc });
    await ep.enrichExistingStructure(client, { scopeWhere: SCOPE, full: true, reno });
  });
  await ep.enrichOptimalConfig(pool, { full: true, scopeWhere: SCOPE });

  const rates = {};
  for (const r of (await pool.query(`SELECT * FROM archetype_cost_rates`)).rows) rates[r.archetype] = r;
  const idxRow = (await pool.query(`SELECT variable_value FROM logic_variables WHERE variable_key='cost_escalation_index'`)).rows[0];
  const indexNow = idxRow ? Number(idxRow.variable_value) : 100;

  const rows = (await pool.query(`
    SELECT p.id, p.zoning_class AS zc, p.lot_size_sqm::float8 AS lot, p.bylaw_max_fsi::float8 AS fsi_after,
           p.opt_aor_gfa_sqm::float8 AS opt_aor, p.max_buildable_gfa_sqm::float8 AS maxb, p.opt_coa_gfa_sqm::float8 AS opt_coa,
           p.zoning_is_ambiguous AS amb, COALESCE(p.opt_aor_gfa_sqm, p.max_buildable_gfa_sqm)::float8 AS new_build_area,
           p.max_buildable_footprint_sqm::float8 AS max_buildable_footprint_sqm,
           p.max_garden_suite_gfa_sqm::float8 AS max_garden_suite_gfa_sqm, p.max_laneway_suite_gfa_sqm::float8 AS max_laneway_suite_gfa_sqm,
           p.cur_est_kitchen_gfa_sqm::float8 AS cur_est_kitchen_gfa_sqm, p.cur_est_bath_gfa_sqm::float8 AS cur_est_bath_gfa_sqm,
           p.max_garage_gfa_sqm::float8 AS max_garage_gfa_sqm, p.cur_floor_gfa_sqm::float8 AS cur_floor_gfa_sqm,
           p.cur_pot_2story_gfa_sqm::float8 AS cur_pot_2story_gfa_sqm, p.realized_fsi_p90::float8 AS realized_fsi_p90,
           p.neighbourhood_cost_premium::float8 AS neighbourhood_cost_premium, p.rear_suite_permission, p.garage_permission, p.max_build_confidence
    FROM parcels p WHERE ${SCOPE} ORDER BY p.zoning_class, p.id`)).rows;

  const fmt = (n) => n == null ? 'null' : '$' + Math.round(n).toLocaleString();
  let inverted = 0, borrowFixed = 0;
  const out = rows.map((r) => {
    const parcel = { ...r, opt_aor_gfa_sqm: r.new_build_area, max_buildable_gfa_sqm: r.maxb, opt_coa_gfa_sqm: r.opt_coa };
    const built = buildParcelCostMenu(parcel, rates, indexNow, { r2Grounded: parcelFamilyFromZoning(r.zc) === 'detached' });
    const nb = built.menu.max_build ? built.menu.max_build.total : null;
    const coa = built.menu.coa_build ? built.menu.coa_build.total : null;
    const coherent = (nb == null || coa == null) ? 'n/a' : (nb <= coa + 1 ? 'OK' : 'INVERTED');
    if (coherent === 'INVERTED') inverted++;
    const fb = before[r.id], fa = r.fsi_after;
    if (fb != null && fb >= 1.5 && (fa == null || fa < fb) && ['RD', 'RS'].includes((r.zc || '').toUpperCase())) borrowFixed++;
    return {
      id: r.id, zc: r.zc, lot: r.lot == null ? null : Math.round(r.lot),
      fsi_before: fb == null ? 'null' : fb, fsi_after: fa == null ? 'null' : fa,
      aor: r.opt_aor == null ? null : Math.round(r.opt_aor), coa_gfa: r.opt_coa == null ? null : Math.round(r.opt_coa),
      newbuild: fmt(nb), coabuild: fmt(coa), coherent,
    };
  });
  console.table(out);
  console.log(`\nSUMMARY: ${out.length} parcels · ${inverted} INVERTED (new_build > coa_build) · ${borrowFixed} borrowed-FSI RD/RS parcels corrected (fsi dropped).`);
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
