// Read-only P2-0 (a)/(b) split measurement for Spec 134 §9. One BEGIN READ ONLY transaction, rolled back.
// Usage: DOTENV_CONFIG_PATH=$HOME/Buildo/.env node -r dotenv/config p2-0a-measure.mjs <repoRoot> <out.json> [limit]
import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module'; import { pathToFileURL } from 'node:url';
const [ROOT, OUT, LIMIT] = process.argv.slice(2);
const require = createRequire(path.join(ROOT, 'package.json'));
const { Client } = require('pg');
const RB = require(path.join(ROOT, 'scripts/lib/bylaw-resolution.js'));
const CC = await import(pathToFileURL(path.join(ROOT, 'scripts/analysis/bylaw/cell-cache.mjs')).href);
const S = await import(pathToFileURL(path.join(ROOT, 'scripts/analysis/bylaw-validation/assembly.mjs')).href);
const { E, units, C } = await S.loadRealLotAssembly(ROOT);
const scope = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/seeds/bylaw/layer2-scope.json'), 'utf8'));
const input = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/reference/bylaw-layer2-input.json'), 'utf8'));
const authored = new Set(Array.isArray(input.body.authored) ? input.body.authored : Object.keys(input.body.authored));
const BT = { principal: 'detached_house', garden_suite: 'garden_suite', laneway_suite: 'laneway_suite' };
const EXC_CH = { R: 2, RD: 3, RS: 4, RT: 5, RM: 6 };
function parseLabel(zn) {
  const m = /^\s*([A-Z]+)\s*(?:\(([^)]*)\))?/.exec(zn || ''); const label = {};
  if (m && m[2]) for (const part of m[2].split(';')) { const p = /^\s*([a-wyz][a-z]?)\s*([\d.]+)\s*$/.exec(part); if (p) label[p[1]] = Number(p[2]); }
  return label;
}
const c = new Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
await c.query('BEGIN READ ONLY');
const dbsize = (await c.query('select pg_database_size(current_database())::bigint b')).rows[0].b;
const sql = `select parcel_id, zoning_class, zoning_zn_string, exception_number, zoning_overlays, on_policy_road, is_corner_lot, is_through_lot,
  abuts_laneway, frontage_m::float f, depth_m::float d, lot_size_sqm::float a, coalesce(zoning_is_ambiguous,false) amb
  from parcels where zoning_class in ('R','RD','RS','RT','RM') order by parcel_id ${LIMIT ? 'limit ' + Number(LIMIT) : ''}`;
const rows = (await c.query(sql)).rows;
const total = rows.length;
const gates = { none: 0, ambiguous_zone: 0, lot_metric_missing: 0, exception_not_authored: 0 };
const byZone = {};
const cache = CC.makeCellCache({ evaluator: E, ctx: C, maxEntries: 1e9 });
const cells = new Map(); // cell_id -> zone, lots
const candBytes = new WeakMap(); const candLen = (cands) => { let v = candBytes.get(cands); if (v === undefined) { v = JSON.stringify(cands.map((u) => u.unit_id)).length; candBytes.set(cands, v); } return v; };
const stats = { principal: { rows: 0, bytes: 0, bytesC: 0 }, garden_suite: { rows: 0, bytes: 0, bytesC: 0 }, laneway_suite: { rows: 0, bytes: 0, bytesC: 0 } };
const tk = { principal: { rows: 0, bytes: 0 }, garden_suite: { rows: 0, bytes: 0 }, laneway_suite: { rows: 0, bytes: 0 } };
const SAMPLE_ROWS = [];
const slim = (r, cands, withCands) => ({ status: r.status, value: r.value ?? null, reason: r.reason ?? null, winner: r.winner ? (r.winner.unit_id || r.winner) : null,
  applied: (r.applied || []).map((a) => (typeof a === 'string' ? a : a.unit_id || a.id)).filter(Boolean), disclosures: (r.disclosures || []).length, inputs_used: r.inputs || [],
  ...(withCands ? { candidates: cands } : {}) });
const t0 = process.hrtime.bigint(); let evaluated = 0;
for (const x of rows) {
  byZone[x.zoning_class] = (byZone[x.zoning_class] || 0) + 1;
  const exc = x.exception_number != null ? `900.${EXC_CH[x.zoning_class]}.10(${x.exception_number})` : null;
  if (x.amb) { gates.ambiguous_zone++; continue; }
  if (x.f == null || x.d == null || x.a == null) { gates.lot_metric_missing++; continue; }
  if (exc && !authored.has(exc)) { gates.exception_not_authored++; continue; }
  gates.none++;
  const ov = x.zoning_overlays || {}; const overlays = {};
  if (ov.height_overlay && ov.height_overlay.applied) { if (ov.height_overlay.height_max_m != null) overlays.HT = Number(ov.height_overlay.height_max_m); if (ov.height_overlay.stories != null) overlays.ST = Number(ov.height_overlay.stories); }
  if (ov.lot_coverage_overlay && ov.lot_coverage_overlay.applied && ov.lot_coverage_overlay.coverage_max_pct != null) overlays.LC = Number(ov.lot_coverage_overlay.coverage_max_pct);
  const base = { zone: x.zoning_class, label: parseLabel(x.zoning_zn_string), overlays, vars: { lot_frontage_m: x.f, lot_depth_m: x.d, lot_area_m2: x.a },
    flags: { corner_lot: !!x.is_corner_lot, through_lot: !!x.is_through_lot, major_street: !!x.on_policy_road, abuts_lane: !!x.abuts_laneway, lawfully_existing: false }, exception: exc };
  const per = {}; const union = new Set();
  for (const st of scope.structures) {
    const lot = { ...base, building_type: BT[st], vars: { ...base.vars, dwelling_units: 1 } };
    const { candidates } = E.loadCandidates(lot, units);
    per[st] = {};
    for (const t of scope.targets[st]) {
      const m0 = cache.stats().misses; let r; try { r = cache.effective(lot, t, candidates); } catch (err) { r = { status: 'error', reason: String(err.message).slice(0, 80), inputs: [] }; }
      if (cache.stats().misses > m0) { tk[st].rows++; tk[st].bytes += JSON.stringify({ target: t, structure: st, ...slim(r, null, false) }).length + 64; }
      per[st][t] = { r, cands: candidates };
      for (const p of r.inputs || []) if (p !== 'building_type' && p !== 'vars.dwelling_units' && !p.startsWith('target.')) union.add(p);
    }
  }
  const { cell_id } = RB.cellKey({ ...base }, [...union]);
  if (!cells.has(cell_id)) {
    for (const st of Object.keys(per)) for (const t of Object.keys(per[st])) {
      const q = per[st][t]; const sl = slim(q.r, null, false); const a = JSON.stringify({ cell_id, target: t, structure: st, ...sl }).length;
      stats[st].rows++; stats[st].bytes += a; stats[st].bytesC += a + candLen(q.cands);
      if (SAMPLE_ROWS.length < 240 && st === 'principal') SAMPLE_ROWS.push(JSON.stringify({ cell_id, target: t, structure: st, ...sl }));
    }
    cells.set(cell_id, { zone: x.zoning_class, lots: 0 });
  }
  cells.get(cell_id).lots++;
  if (++evaluated % 20000 === 0) console.error('lots', evaluated, 'cells', cells.size, 'cache', JSON.stringify(cache.stats()));
}
const elapsedMs = Number(process.hrtime.bigint() - t0) / 1e6;
let sampleJson = 0; let sampleServer = 0; const sampleN = SAMPLE_ROWS.length;
for (const j of SAMPLE_ROWS) { sampleJson += j.length; sampleServer += Number((await c.query('select pg_column_size($1::jsonb)::int n', [j])).rows[0].n); }
await c.query('ROLLBACK'); await c.end();
const perZoneCells = {}; for (const v of cells.values()) perZoneCells[v.zone] = (perZoneCells[v.zone] || 0) + 1;
const out = { measured_on: 'local DB, read-only', limit: LIMIT || null, db_bytes: Number(dbsize), in_scope_parcels: total, by_zone: byZone, lot_gates: gates,
  evaluated_lots: gates.none, distinct_cells: cells.size, cells_per_zone: perZoneCells, lots_per_cell_mean: gates.none / Math.max(1, cells.size),
  cache: cache.stats(), elapsed_ms: elapsedMs, ms_per_lot: elapsedMs / Math.max(1, gates.none), ms_per_cell: elapsedMs / Math.max(1, cells.size),
  structure_rows: stats, target_keyed_rows: tk, jsonb_vs_json_sample: { rows: sampleN, json_bytes: sampleJson, server_jsonb_bytes: sampleServer },
  caveat: 'lot vector omits derived flags the builder will add (front_averaging_*, has_secondary_suite, etc.): cell counts are a lower bound; classes (by_class) not modelled; building_type per structure only' };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1)); console.log(JSON.stringify(out, null, 1));
