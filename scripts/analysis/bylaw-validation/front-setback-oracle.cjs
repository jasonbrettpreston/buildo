#!/usr/bin/env node
/**
 * Front-setback reliability oracle (Spec 130 Q-B1; M-205(1); Spec 131 LC-58; operator ruling 2026-10-19).
 *
 * READ-ONLY. Compares the averaged neighbour front setback built from
 * parcel_abutments.front_setback_est_m (10.5.40.70(1), derived on read) with the
 * required front setback a City examiner stated in a 2017 CoA notice that cites front-yard
 * averaging. The examiner's figure comes from a survey, so it is the independent value.
 *
 * Oracle rows: coa_notice_variances with target front_setback_m and a citation of
 *   10.5.40.70(1)[(A)|(B)] (any value), or
 *   a zone x.40.70(1)[(A)|(B)] (the 2017 consolidation's averaging clause) whose value is not
 *   one of the zone's flat defaults (3.0 / 4.5 / 6.0 / 7.5 / 9.0 m).
 *
 * Also re-measures every qualifying neighbour by a second, independent method: the distance
 * from the neighbour's footprint to the neighbour lot's FRONT LOT LINE (the part of its
 * boundary within lot_street_m + 1.5 m of its frontage street), instead of the step's
 * difference of two distances to the street centreline.
 *
 * Reports the ruled front setback, max(averaged estimate + fya_porch_allowance_m, zone default),
 * resolved by scripts/analysis/bylaw/front-averaging.mjs at the current allowance (the DB value,
 * else the seed default), against the examiner's figure, beside the zone default alone.
 *
 * Usage: DOTENV_CONFIG_PATH=$HOME/Buildo/.env node -r dotenv/config \
 *          scripts/analysis/bylaw-validation/front-setback-oracle.cjs <out.json>
 * Non-deterministic by design (reads the live DB), so it lives outside the Spec 68 §10 tree.
 */
'use strict';
const fs = require('node:fs');
const { Client } = require('pg');

const ZONE_DEFAULTS = [3.0, 4.5, 6.0, 7.5, 9.0];
const MAX_DIST_M = 15.0; // 10.5.40.70(1): "15.0 metres or less from the subject lot"
// x.40.70(1)'s front setback in R / RD / RS / RT / RM (each zone's own unit; locked by bylaw-front-setback-reliability.logic).
const ZONE_DEFAULT_M = 6.0;

const ORACLE_SQL = `
SELECT v.variance_key, v.application_number, v.regulation_id_as_cited AS cited,
       v.required_value::numeric AS required_m, v.zoning_as_stated, lp.parcel_id
  FROM coa_notice_variances v
  JOIN lead_parcels lp ON lp.lead_id = 'coa:' || v.application_number
 WHERE v.retired_at IS NULL
   AND v.target = 'front_setback_m'
   AND v.required_value IS NOT NULL
   AND v.regulation_id_as_cited ~ '^10\\.(5|10|20|40|60|80)\\.40\\.70\\(1\\)(\\((A|B)\\))?$'`;

const NEIGHBOUR_SQL = `
WITH pa AS (
  SELECT a.* FROM parcel_abutments a WHERE a.parcel_id = $1
)
SELECT pa.neighbour_id, pa.same_frontage_street, pa.neighbour_residential, pa.neighbour_building_id,
       pa.bldg_to_subject_m::float AS bldg_to_subject_m, pa.front_setback_est_m::float AS est_m, pa.est_status,
       np.frontage_m::float AS n_frontage_m,
       m2.setback2_m
  FROM pa
  JOIN parcels np ON np.id = pa.neighbour_id
  LEFT JOIN LATERAL (
    SELECT ST_Distance(ST_Transform(bf.geom, 2952),
             ST_Intersection(ST_Boundary(ST_Transform(np.geom, 2952)),
                             ST_Buffer(st.g, ST_Distance(ST_Transform(np.geom, 2952), st.g) + 1.5)))::float AS setback2_m
      FROM building_footprints bf,
           LATERAL (SELECT ST_Union(ST_Transform(c.geom, 2952)) AS g FROM toronto_centreline c
                     WHERE c.linear_name_full = np.primary_frontage_street_name
                       AND c.geom && ST_Expand(np.geom, 0.003)) st
     WHERE bf.id = pa.neighbour_building_id AND st.g IS NOT NULL AND NOT ST_IsEmpty(st.g)
  ) m2 ON true`;

function round2(x) { return x == null ? null : Math.round(x * 100) / 100; }

async function main() {
  const out = process.argv[2];
  if (!out) throw new Error('usage: front-setback-oracle.cjs <out.json>');
  const path = require('node:path');
  const FA = await import(require('node:url').pathToFileURL(path.join(__dirname, '..', 'bylaw', 'front-averaging.mjs')).href);
  const seed = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'seeds', 'logic_variables.json'), 'utf8'));
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    const lvRow = (await c.query("SELECT variable_value::float AS v FROM logic_variables WHERE variable_key = 'fya_porch_allowance_m'")).rows[0];
    const allowance = lvRow ? lvRow.v : seed.fya_porch_allowance_m.default;
    const oracle = (await c.query(ORACLE_SQL)).rows.filter((r) =>
      /^10\.5\./.test(r.cited) || !ZONE_DEFAULTS.includes(Number(r.required_m)));
    const rows = [];
    for (const o of oracle) {
      const subj = (await c.query(
        'SELECT zoning_class, frontage_m::float AS frontage_m, is_corner_lot FROM parcels WHERE id = $1', [o.parcel_id])).rows[0] || {};
      const nbs = (await c.query(NEIGHBOUR_SQL, [o.parcel_id])).rows;
      const qual = nbs.filter((n) => n.neighbour_residential === true && n.same_frontage_street === true
        && n.neighbour_building_id != null && n.bldg_to_subject_m != null && n.bldg_to_subject_m <= MAX_DIST_M);
      const fya = qual.length === 0 ? 'fya_none' : qual.length === 1 ? 'fya_one' : qual.length === 2 ? 'fya_two' : 'fya_ambiguous_multi';
      const allEst = qual.length > 0 && qual.every((n) => n.est_status === 'estimated');
      const est = allEst && (fya === 'fya_one' || fya === 'fya_two')
        ? qual.reduce((s, n) => s + n.est_m, 0) / qual.length : null;
      const ruled = FA.resolveFrontAveraging(nbs.map((n) => ({ ...n, front_setback_est_m: n.est_m })),
        { fya_porch_allowance_m: allowance }, { zone_default_m: ZONE_DEFAULT_M });
      const m2 = qual.length > 0 && qual.every((n) => n.setback2_m != null)
        ? qual.reduce((s, n) => s + n.setback2_m, 0) / qual.length : null;
      rows.push({
        application_number: o.application_number, cited: o.cited, parcel_id: o.parcel_id,
        zone: subj.zoning_class ?? null, subject_frontage_m: round2(subj.frontage_m), corner: subj.is_corner_lot ?? null,
        required_m: Number(o.required_m),
        fya, n_qualifying: qual.length,
        statuses: qual.map((n) => n.est_status),
        neighbour_est_m: qual.map((n) => round2(n.est_m)),
        neighbour_setback2_m: qual.map((n) => round2(n.setback2_m)),
        neighbour_dist_m: qual.map((n) => round2(n.bldg_to_subject_m)),
        neighbour_frontage_m: qual.map((n) => round2(n.n_frontage_m)),
        est_m: round2(est), setback2_m: round2(m2),
        err_m: est == null ? null : round2(est - Number(o.required_m)),
        err2_m: m2 == null ? null : round2(m2 - Number(o.required_m)),
        ruled_basis: ruled.basis, ruled_m: ruled.front_setback_m,
        ruled_err_m: round2(ruled.front_setback_m - Number(o.required_m)),
      });
    }
    const est = rows.filter((r) => r.est_m != null);
    const share = (xs, f) => (xs.length ? Math.round((1000 * xs.filter(f).length) / xs.length) / 10 : null);
    const mae = (xs) => (xs.length ? round2(xs.reduce((t, x) => t + Math.abs(x), 0) / xs.length) : null);
    const abs = est.map((r) => Math.abs(r.err_m)).sort((x, y) => x - y);
    const at = (q) => (abs.length ? abs[Math.min(abs.length - 1, Math.floor(q * (abs.length - 1) + 0.5))] : null);
    const ruled = est.map((r) => r.ruled_err_m);
    const flat = est.map((r) => round2(ZONE_DEFAULT_M - r.required_m));
    const summary = {
      n_oracle: rows.length, n_with_estimate: est.length, porch_allowance_m: allowance, zone_default_m: ZONE_DEFAULT_M,
      estimate: { median_abs_err_m: at(0.5), p90_abs_err_m: at(0.9), within_0_5m_pct: share(abs, (x) => x <= 0.5), within_1m_pct: share(abs, (x) => x <= 1),
        at_or_below_examiner_pct: share(est, (r) => r.est_m <= r.required_m) },
      ruled: { mae_m: mae(ruled), within_1m_pct: share(ruled, (x) => Math.abs(x) <= 1), below_examiner_pct: share(ruled, (x) => x < 0) },
      zone_default_alone: { mae_m: mae(flat), within_1m_pct: share(flat, (x) => Math.abs(x) <= 1), below_examiner_pct: share(flat, (x) => x < 0) },
    };
    fs.writeFileSync(out, JSON.stringify({ generated_from: 'coa_notice_variances x parcel_abutments', summary, rows }, null, 1));
    console.log(JSON.stringify(summary));
  } finally {
    await c.end();
  }
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; });
