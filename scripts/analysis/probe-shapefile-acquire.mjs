#!/usr/bin/env node
'use strict';
// SPEC LINK: docs/specs/01-pipeline/56_source_massing.md §2
// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §7
// PURPOSE: row 3.6 `massing` P-M probe — measure the shapefile through the runner's OWN
// acquisition seam (scripts/lib/step/acquire.js). READ-ONLY: one SELECT (`--db`), no writes.
// USAGE: node scripts/analysis/probe-shapefile-acquire.mjs --url=<zip> [--db] [--out=<json>]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import v8 from 'node:v8';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
// The runner's OWN functions — not a reimplementation.
const { downloadArchive, extractArchive, locateShapefile, parseShapefile } = require('../lib/step/acquire.js');
const HELP = `probe-shapefile-acquire — massing P-M probe through acquire.js. Read-only.
  --url=<zip url>   REQUIRED: CKAN shapefile ZIP to download + parse.
  --db              Opt-in: M-D5 SELECT (building_footprints.source_id) + key diff.
  --out=<json path> Write the JSON result here as well as stdout.
  --help, -h        Print this text and exit 0 (no network, no DB, no env).
`;
const mb = (b) => Math.round((b / 1048576) * 100) / 100;
// Snapshot memory (rss/heapUsed), fold into the running peak `p`, return the flat display.
const sample = (p) => {
  const m = process.memoryUsage();
  p.rss = Math.max(p.rss, m.rss); p.heapUsed = Math.max(p.heapUsed, m.heapUsed);
  return { rss_mb: mb(m.rss), heap_used_mb: mb(m.heapUsed), peak_rss_mb: mb(p.rss), peak_heap_used_mb: mb(p.heapUsed) };
};
// The 0s derivation, LOCAL (the compute module does not exist yet): no id column, so the key
// comes from the geometry string. Legacy formula verbatim.
const coerceKey = (_raw, { geojson }) => geojson == null ? null
  : `hash_${crypto.createHash('md5').update(geojson).digest('hex').slice(0, 12)}`;
// Outer ring length of a Polygon, or of a MultiPolygon's first polygon.
function ringLen(json) {
  let g; try { g = JSON.parse(json); } catch { return null; }
  if (g?.type === 'Polygon') return g.coordinates?.[0]?.length ?? null;
  if (g?.type === 'MultiPolygon') return g.coordinates?.[0]?.[0]?.length ?? null;
  return null;
}
// M-D3: duplicate-key groups in file order; batch = Math.floor(index/1000) (legacy per-1000
// txn). Same batch ⇒ within-batch dedupe; different ⇒ cross-batch self-overwrite.
function dupAnalysis(features) {
  const byKey = new Map();
  features.forEach((f, i) => { if (!byKey.has(f.source_id)) byKey.set(f.source_id, []); byKey.get(f.source_id).push(i); });
  let groups = 0, extra = 0, differing = 0; const samples = [];
  for (const [key, ix] of byKey) {
    if (ix.length < 2) continue;
    groups++; extra += ix.length - 1;
    if (new Set(ix.map((i) => JSON.stringify(features[i].record))).size > 1) {
      differing++;
      if (samples.length < 20) {
        const batches = [...new Set(ix.map((i) => Math.floor(i / 1000)))];
        samples.push({ key, file_indexes: ix, batches, same_batch: batches.length === 1 });
      }
    }
  }
  return { duplicate_key_group_count: groups, duplicate_key_extra_rows: extra,
    duplicate_key_groups_with_differing_attrs: differing, duplicate_groups_sampled: samples };
}
async function dbKeyDiff(log, fileKeys) {
  const { createResolvedPool } = require('../lib/resolve-db.js');
  const pool = createResolvedPool({ label: 'probe-shapefile-acquire' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const res = await client.query('SELECT source_id FROM building_footprints');
    await client.query('ROLLBACK');
    const dbKeys = new Set(res.rows.map((r) => r.source_id));
    const dbOnly = [...dbKeys].filter((k) => !fileKeys.has(k)).length;
    const fileOnly = [...fileKeys].filter((k) => !dbKeys.has(k)).length;
    log(`[probe-shapefile-acquire] DB keys=${dbKeys.size} file keys=${fileKeys.size} db_only=${dbOnly} file_only=${fileOnly}`);
    return { db_key_count: dbKeys.size, db_keys_absent_from_file: dbOnly, file_keys_absent_from_db: fileOnly };
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* the original error wins */ }
    throw e;
  } finally { client.release(); await pool.end(); }
}
async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) { process.stdout.write(HELP); return; }
  const args = { url: null, db: false, out: null };
  for (const r of argv) {
    if (r === '--db') args.db = true;
    else if (r.startsWith('--url=')) args.url = r.slice(6);
    else if (r.startsWith('--out=')) args.out = r.slice(6);
    else throw new Error(`unknown argument ${JSON.stringify(r)} (try --help)`);
  }
  if (!args.url) throw new Error('usage: probe-shapefile-acquire.mjs --url=<zip> [--db] [--out=<json>]');
  const log = (l) => process.stderr.write(`${l}\n`);
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'probe-shapefile-acquire-'));
  const zip = path.join(tmpRoot, 'source.zip');
  const peak = { rss: 0, heapUsed: 0 };
  try {
    log(`[probe-shapefile-acquire] downloading ${args.url}`);
    let t = Date.now();
    const dl = await downloadArchive(fetch, args.url, zip, 600000, 'sha256');
    const downloadMs = Date.now() - t;
    log(`[probe-shapefile-acquire] downloaded ${dl.bytesDownloaded} bytes in ${downloadMs}ms (sha256 ${dl.contentHash.slice(0, 12)}...)`);
    const dir = path.join(tmpRoot, 'extracted');
    await extractArchive(zip, dir);
    const { shpPath, dbfPath } = locateShapefile(dir);
    t = Date.now();
    const { features, badKey, nullGeometry, rowsParsed } = await parseShapefile(shpPath, dbfPath, undefined, coerceKey, 'source_id');
    const parseMs = Date.now() - t;
    const afterParse = sample(peak);
    log(`[probe-shapefile-acquire] parsed rows=${rowsParsed} features=${features.length} in ${parseMs}ms`);
    // The validator's `$2::TEXT[]` model: every geojson stringified into one array.
    t = Date.now();
    const arrLen = JSON.stringify(features.map((f) => f.geojson)).length;
    const stringifyMs = Date.now() - t;
    const afterText = sample(peak);
    log(`[probe-shapefile-acquire] validator TEXT[] ${(arrLen / 1048576).toFixed(1)}MB in ${stringifyMs}ms; peak heapUsed=${afterText.peak_heap_used_mb}MB`);
    let ringUnderFour = 0, missingLat = 0, missingLng = 0;
    for (const f of features) {
      const rl = ringLen(f.geojson);
      if (rl != null && rl < 4) ringUnderFour++;
      if (f.record?.LATITUDE == null) missingLat++;
      if (f.record?.LONGITUDE == null) missingLng++;
    }
    const fileKeys = new Set(features.map((f) => f.source_id));
    const result = {
      url: args.url, bytes_downloaded: dl.bytesDownloaded, content_hash_sha256: dl.contentHash,
      download_ms: downloadMs, parse_ms: parseMs, stringify_ms: stringifyMs, rows_read: rowsParsed,
      bad_key: badKey, null_geometry: nullGeometry, feature_count: features.length,
      ring_under_four_count: ringUnderFour, missing_latitude_count: missingLat, missing_longitude_count: missingLng,
      memory: { after_parse: afterParse, after_validator_text_array: afterText, heap_size_limit_mb: mb(v8.getHeapStatistics().heap_size_limit) },
      ...dupAnalysis(features),
      db: args.db ? await dbKeyDiff(log, fileKeys) : null,
    };
    const json = `${JSON.stringify(result, null, 2)}\n`;
    process.stdout.write(json);
    if (args.out) { fs.writeFileSync(args.out, json); log(`[probe-shapefile-acquire] wrote ${args.out}`); }
  } finally { fs.rmSync(tmpRoot, { recursive: true, force: true }); }
}
main().catch((err) => {
  process.stderr.write(`[probe-shapefile-acquire] FAILED: ${err.stack || err.message}\n`);
  process.exitCode = 1;
});
