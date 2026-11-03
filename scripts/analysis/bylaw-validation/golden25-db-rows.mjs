// SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md D-1; MB-31 plan ~/Buildo-scratch/mcbylaws/MB-31/inc1-plan.md section 1.1 (G)
// MB-31 increment 1 · the database-reading shell of the 25-lot input generator. READ-ONLY and LOCAL ONLY: one SELECT of the 17
// `parcels` columns that resolve_bylaws reads (scripts/lib/compute/resolve-bylaws.js buildSourceSql), for the 25 golden parcel ids
// named by expected-25.jsonl, over the local stack 127.0.0.1:54322, in a read-only session. Writes a JSON array; golden25-inputs.mjs
// does everything else without a database.
// usage: node scripts/analysis/bylaw-validation/golden25-db-rows.mjs --expected <expected-25.jsonl> --out <parcels-rows.json>
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Pool } = require('pg');
const arg = (k) => { const i = process.argv.indexOf('--' + k); return i >= 0 ? process.argv[i + 1] : null; };
const expectedFile = arg('expected'); const outFile = arg('out');
if (!expectedFile || !outFile) { console.error('usage: golden25-db-rows.mjs --expected <expected-25.jsonl> --out <rows.json>'); process.exit(2); }
const ids = fs.readFileSync(expectedFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l).parcel_id);
const pool = new Pool({ connectionString: 'postgres://postgres:postgres@127.0.0.1:54322/postgres', options: '-c default_transaction_read_only=on' });
const sql = `SELECT id, parcel_id, zoning_class, zoning_zn_string, exception_number, zoning_overlays, on_policy_road, is_corner_lot,
       is_through_lot, abuts_laneway, frontage_m, depth_m, lot_size_sqm, zoning_is_ambiguous, in_sixplex_area, is_heritage_designated,
       ST_NPoints(geom)::int AS geom_npoints
  FROM parcels WHERE id = ANY($1::int[]) ORDER BY id`;
try {
  const { rows } = await pool.query(sql, [ids]);
  if (rows.length !== ids.length) throw new Error(`expected ${ids.length} parcels rows, got ${rows.length}`);
  // pg returns numeric columns as strings; the step's own pool parses them to numbers, so do the same here
  const asNumber = (v) => (v === null || v === undefined ? null : Number(v));
  const out = rows.map((r) => ({ ...r, frontage_m: asNumber(r.frontage_m), depth_m: asNumber(r.depth_m), lot_size_sqm: asNumber(r.lot_size_sqm) }));
  fs.writeFileSync(outFile, JSON.stringify(out, null, 1) + '\n');
  console.log(`wrote ${rows.length} parcels rows to ${outFile}`);
} finally {
  await pool.end();
}
