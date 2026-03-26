#!/usr/bin/env node
/**
 * Load Toronto 3D Massing shapefile into building_footprints table.
 * Downloads the SHP ZIP from Toronto Open Data, extracts, and streams
 * features into PostgreSQL in batches of 1000.
 *
 * Usage:
 *   node scripts/load-massing.js [path-to-shp]
 *
 * If no path is given, downloads from Toronto Open Data.
 */
const pipeline = require('./lib/pipeline');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const { execSync } = require('child_process');
const { platform } = require('os');
const shapefile = require('shapefile');

const SQM_TO_SQFT = 10.7639;
const STORY_HEIGHT_M = 3.0;

const ZIP_URL =
  'https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/387b2e3b-2a76-4199-8b3b-0b7d22e2ec10/resource/c57a333a-dc6c-416e-8dd0-7b7964161720/download/3dmassingshapefile_2025_wgs84.zip';

// ---------------------------------------------------------------------------
// Helpers (inline to avoid module resolution issues in standalone scripts)
// ---------------------------------------------------------------------------

function shoelaceArea(ring) {
  if (!ring || ring.length < 4) return null;
  const n = ring.length - 1;
  if (n < 3) return null;
  let cLat = 0, cLng = 0;
  for (let i = 0; i < n; i++) { cLng += ring[i][0]; cLat += ring[i][1]; }
  cLat /= n; cLng /= n;
  const cosLat = Math.cos((cLat * Math.PI) / 180);
  const mPerDegLat = 111320;
  const mPerDegLng = 111320 * cosLat;
  const points = [];
  for (let i = 0; i < n; i++) {
    points.push([(ring[i][0] - cLng) * mPerDegLng, (ring[i][1] - cLat) * mPerDegLat]);
  }
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    sum += points[i][0] * points[j][1] - points[j][0] * points[i][1];
  }
  return Math.abs(sum) / 2;
}

function computeCentroid(ring) {
  if (!ring || ring.length < 4) return null;
  const n = ring.length - 1;
  if (n < 3) return null;
  let sumLng = 0, sumLat = 0;
  for (let i = 0; i < n; i++) {
    sumLng += ring[i][0];
    sumLat += ring[i][1];
  }
  return [sumLng / n, sumLat / n];
}

function extractRing(geometry) {
  if (!geometry || !geometry.type || !geometry.coordinates) return null;
  if (geometry.type === 'Polygon') return geometry.coordinates[0] || null;
  if (geometry.type === 'MultiPolygon') return geometry.coordinates[0]?.[0] || null;
  return null;
}

function estimateStories(maxHeightM) {
  if (maxHeightM == null || maxHeightM <= 0) return null;
  return Math.max(1, Math.round(maxHeightM / STORY_HEIGHT_M));
}

// ---------------------------------------------------------------------------
// Download helper
// ---------------------------------------------------------------------------
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const get = url.startsWith('https') ? https.get : http.get;
    get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.close();
        fs.unlinkSync(destPath);
        return downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
      }
      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(destPath);
        return reject(new Error(`Download failed: HTTP ${response.statusCode}`));
      }
      const total = parseInt(response.headers['content-length'] || '0', 10);
      let downloaded = 0;
      response.on('data', (chunk) => {
        downloaded += chunk.length;
        if (total > 0 && downloaded % (10 * 1024 * 1024) < chunk.length) {
          const pct = ((downloaded / total) * 100).toFixed(1);
          pipeline.log.info('[load-massing]', `Download: ${(downloaded / 1024 / 1024).toFixed(0)} MB / ${(total / 1024 / 1024).toFixed(0)} MB (${pct}%)`);
        }
      });
      response.pipe(file);
      file.on('finish', () => { file.close(); resolve(destPath); });
    }).on('error', (err) => {
      fs.unlinkSync(destPath);
      reject(err);
    });
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
pipeline.run('load-massing', async (pool) => {
  const startTime = Date.now();
  pipeline.log.info('[load-massing]', '3D Massing Loader starting...');

  let shpPath = process.argv[2];

  if (!shpPath) {
    const zipPath = path.join(__dirname, '..', 'data', '3d-massing-wgs84.zip');
    const extractDir = path.join(__dirname, '..', 'data', '3d-massing-wgs84');

    if (!fs.existsSync(extractDir)) {
      if (!fs.existsSync(zipPath)) {
        pipeline.log.info('[load-massing]', 'Downloading 3D Massing ZIP...');
        await downloadFile(ZIP_URL, zipPath);
        pipeline.log.info('[load-massing]', 'Download complete.');
      }

      pipeline.log.info('[load-massing]', 'Extracting ZIP...');
      fs.mkdirSync(extractDir, { recursive: true });
      if (platform() === 'win32') {
        execSync(
          `powershell -Command "Expand-Archive -Force -Path '${zipPath}' -DestinationPath '${extractDir}'"`,
          { stdio: 'inherit' }
        );
      } else {
        execSync(`unzip -o "${zipPath}" -d "${extractDir}"`, { stdio: 'inherit' });
      }
      pipeline.log.info('[load-massing]', 'Extraction complete.');
    }

    // Find the .shp file in the extracted directory
    const files = fs.readdirSync(extractDir);
    const shpFile = files.find(f => f.toLowerCase().endsWith('.shp'));
    if (!shpFile) {
      // Check subdirectories
      for (const dir of files) {
        const subDir = path.join(extractDir, dir);
        if (fs.statSync(subDir).isDirectory()) {
          const subFiles = fs.readdirSync(subDir);
          const subShp = subFiles.find(f => f.toLowerCase().endsWith('.shp'));
          if (subShp) {
            shpPath = path.join(subDir, subShp);
            break;
          }
        }
      }
      if (!shpPath) {
        throw new Error('No .shp file found in extracted ZIP');
      }
    } else {
      shpPath = path.join(extractDir, shpFile);
    }
  }

  pipeline.log.info('[load-massing]', `Reading: ${shpPath}`);

  // Detect source_id format change: if the new shapefile uses a different ID
  // strategy (e.g., hash vs OBJECTID), old rows won't match ON CONFLICT and
  // the table will double. Peek at the first feature to determine the format,
  // then clean up mismatched rows before loading.
  const peekSource = await shapefile.open(shpPath);
  const peekResult = await peekSource.read();
  const peekProps = peekResult.value?.properties || {};
  const usesHashIds = peekProps.OBJECTID == null && peekProps.ID == null;
  if (usesHashIds) {
    const staleCheck = await pool.query(
      `SELECT COUNT(*) AS cnt FROM building_footprints WHERE source_id NOT LIKE 'hash_%' LIMIT 1`
    );
    const staleCount = parseInt(staleCheck.rows[0].cnt, 10);
    if (staleCount > 0) {
      pipeline.log.info('[load-massing]', `Detected source_id format change: ${staleCount.toLocaleString()} old non-hash rows → cleaning up`);
      await pool.query(`DELETE FROM parcel_buildings WHERE building_id IN (SELECT id FROM building_footprints WHERE source_id NOT LIKE 'hash_%')`);
      await pool.query(`DELETE FROM building_footprints WHERE source_id NOT LIKE 'hash_%'`);
      pipeline.log.info('[load-massing]', `Cleanup complete: removed ${staleCount.toLocaleString()} stale rows`);
    }
  } else {
    const staleCheck = await pool.query(
      `SELECT COUNT(*) AS cnt FROM building_footprints WHERE source_id LIKE 'hash_%' LIMIT 1`
    );
    const staleCount = parseInt(staleCheck.rows[0].cnt, 10);
    if (staleCount > 0) {
      pipeline.log.info('[load-massing]', `Detected source_id format change: ${staleCount.toLocaleString()} old hash rows → cleaning up`);
      await pool.query(`DELETE FROM parcel_buildings WHERE building_id IN (SELECT id FROM building_footprints WHERE source_id LIKE 'hash_%')`);
      await pool.query(`DELETE FROM building_footprints WHERE source_id LIKE 'hash_%'`);
      pipeline.log.info('[load-massing]', `Cleanup complete: removed ${staleCount.toLocaleString()} stale rows`);
    }
  }

  let processed = 0;
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;
  let batch = [];

  async function flushBatch() {
    if (batch.length === 0) return;

    // Deduplicate within the batch by source_id — the 2025 shapefile lacks
    // OBJECTID, so source_id is an MD5 hash of geometry. Identical geometries
    // produce duplicate hashes; PostgreSQL rejects INSERT...ON CONFLICT when
    // the same row is affected twice in a single statement. Last write wins.
    const uniqueMap = new Map();
    for (const row of batch) {
      uniqueMap.set(row.source_id, row);
    }
    const currentBatch = Array.from(uniqueMap.values());
    batch = [];

    await pipeline.withTransaction(pool, async (client) => {
      const values = [];
      const placeholders = [];
      let idx = 1;

      for (const row of currentBatch) {
        placeholders.push(
          `($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`
        );
        values.push(
          row.source_id,
          JSON.stringify(row.geometry),
          row.footprint_area_sqm, row.footprint_area_sqft,
          row.max_height_m, row.min_height_m, row.elev_z,
          row.estimated_stories,
          row.centroid_lat, row.centroid_lng
        );
      }

      const result = await client.query(
        `INSERT INTO building_footprints (
          source_id, geometry,
          footprint_area_sqm, footprint_area_sqft,
          max_height_m, min_height_m, elev_z,
          estimated_stories,
          centroid_lat, centroid_lng
        ) VALUES ${placeholders.join(', ')}
        ON CONFLICT (source_id) DO UPDATE SET
          geometry = EXCLUDED.geometry,
          footprint_area_sqm = EXCLUDED.footprint_area_sqm,
          footprint_area_sqft = EXCLUDED.footprint_area_sqft,
          max_height_m = EXCLUDED.max_height_m,
          min_height_m = EXCLUDED.min_height_m,
          elev_z = EXCLUDED.elev_z,
          estimated_stories = EXCLUDED.estimated_stories,
          centroid_lat = EXCLUDED.centroid_lat,
          centroid_lng = EXCLUDED.centroid_lng
        WHERE building_footprints.geometry IS DISTINCT FROM EXCLUDED.geometry
          OR building_footprints.max_height_m IS DISTINCT FROM EXCLUDED.max_height_m
          OR building_footprints.min_height_m IS DISTINCT FROM EXCLUDED.min_height_m
          OR building_footprints.footprint_area_sqm IS DISTINCT FROM EXCLUDED.footprint_area_sqm
          OR building_footprints.centroid_lat IS DISTINCT FROM EXCLUDED.centroid_lat
          OR building_footprints.centroid_lng IS DISTINCT FROM EXCLUDED.centroid_lng
        RETURNING (xmax = 0) AS is_insert`,
        values
      );

      const batchNew = result.rows.filter(r => r.is_insert).length;
      inserted += batchNew;
      updated += result.rows.length - batchNew;
    });
  }

  const source = await shapefile.open(shpPath);

  while (true) {
    const result = await source.read();
    if (result.done) break;

    processed++;
    const feature = result.value;

    if (!feature || !feature.geometry) {
      skipped++;
      continue;
    }

    const ring = extractRing(feature.geometry);
    if (!ring || ring.length < 4) {
      skipped++;
      continue;
    }

    const props = feature.properties || {};
    const maxHeight = props.MAX_HEIGHT != null ? parseFloat(props.MAX_HEIGHT) : null;
    const minHeight = props.MIN_HEIGHT != null ? parseFloat(props.MIN_HEIGHT) : null;
    const elevZ = props.ELEVZ != null ? parseFloat(props.ELEVZ) : (props.SURF_ELEV != null ? parseFloat(props.SURF_ELEV) : null);
    // Stable deterministic ID: prefer OBJECTID, fall back to geometry hash
    // (loop counter would cause PK collisions on re-runs with different shapefiles)
    let sourceId;
    if (props.OBJECTID != null) {
      sourceId = String(props.OBJECTID);
    } else if (props.ID != null) {
      sourceId = String(props.ID);
    } else {
      sourceId = 'hash_' + crypto.createHash('md5').update(JSON.stringify(feature.geometry)).digest('hex').substring(0, 12);
    }

    // Detect projected coords (Web Mercator): values >> 180 means not WGS84 degrees
    const isProjected = ring[0] && (Math.abs(ring[0][0]) > 180 || Math.abs(ring[0][1]) > 180);
    const areaSqm = isProjected ? null : shoelaceArea(ring);
    const areaSqft = areaSqm != null ? Math.round(areaSqm * SQM_TO_SQFT * 100) / 100 : null;
    // Prefer explicit LONGITUDE/LATITUDE properties over computing from ring coords
    // (ring may be in projected CRS even if file claims WGS84)
    const centroid = (props.LONGITUDE != null && props.LATITUDE != null)
      ? [parseFloat(props.LONGITUDE), parseFloat(props.LATITUDE)]
      : computeCentroid(ring);
    const stories = estimateStories(maxHeight);

    batch.push({
      source_id: sourceId,
      geometry: feature.geometry,
      footprint_area_sqm: areaSqm != null ? Math.round(areaSqm * 100) / 100 : null,
      footprint_area_sqft: areaSqft,
      max_height_m: maxHeight != null && !isNaN(maxHeight) ? Math.round(maxHeight * 100) / 100 : null,
      min_height_m: minHeight != null && !isNaN(minHeight) ? Math.round(minHeight * 100) / 100 : null,
      elev_z: elevZ != null && !isNaN(elevZ) ? Math.round(elevZ * 100) / 100 : null,
      estimated_stories: stories,
      centroid_lat: centroid ? Math.round(centroid[1] * 10000000) / 10000000 : null,
      centroid_lng: centroid ? Math.round(centroid[0] * 10000000) / 10000000 : null,
    });

    if (batch.length >= pipeline.BATCH_SIZE) {
      try {
        await flushBatch();
      } catch (err) {
        pipeline.log.error('[load-massing]', err, { row: processed });
        errors++;
        batch = [];
      }
    }

    if (processed % 50000 === 0) {
      pipeline.progress('load-massing', processed, 480000, startTime);
    }
  }

  // Flush remaining
  try {
    await flushBatch();
  } catch (err) {
    pipeline.log.error('[load-massing]', err, { phase: 'final_flush' });
    errors++;
  }

  const durationMs = Date.now() - startTime;
  pipeline.log.info('[load-massing]', 'Load complete', {
    features_read: processed, inserted, updated, skipped, errors,
    duration: `${(durationMs / 1000).toFixed(1)}s`,
  });

  // Note: if a batch flush fails, lost rows inflate this count slightly
  const unchanged = Math.max(0, processed - inserted - updated - skipped);
  const skipRate = processed > 0 ? (skipped / processed) * 100 : 0;
  const skipRateStr = skipRate.toFixed(1) + '%';
  const errorRate = processed > 0 ? (errors / Math.ceil(processed / pipeline.BATCH_SIZE)) * 100 : 0;
  const errorRateStr = errorRate.toFixed(1) + '%';
  const auditRows = [
    { metric: 'features_read', value: processed, threshold: '>= 400000', status: processed < 400000 ? 'WARN' : 'PASS' },
    { metric: 'records_inserted', value: inserted, threshold: null, status: 'INFO' },
    { metric: 'records_updated', value: updated, threshold: null, status: 'INFO' },
    { metric: 'records_unchanged', value: unchanged, threshold: null, status: 'INFO' },
    { metric: 'features_skipped', value: skipped, threshold: null, status: 'INFO' },
    { metric: 'skip_rate', value: skipRateStr, threshold: '< 5%', status: skipRate >= 5 ? 'FAIL' : 'PASS' },
    { metric: 'batch_errors', value: errors, threshold: null, status: 'INFO' },
    { metric: 'batch_error_rate', value: errorRateStr, threshold: '< 1%', status: errorRate >= 1 ? 'FAIL' : 'PASS' },
  ];
  const hasFails = skipRate >= 5 || errorRate >= 1;
  const hasWarns = processed < 400000;

  pipeline.emitSummary({
    records_total: inserted + updated,
    records_new: inserted,
    records_updated: updated,
    records_meta: {
      duration_ms: durationMs,
      features_read: processed,
      records_inserted: inserted,
      records_updated: updated,
      records_unchanged: unchanged,
      features_skipped: skipped,
      errors,
      audit_table: {
        phase: 7,
        name: 'Building Footprints Ingestion',
        verdict: hasFails ? 'FAIL' : hasWarns ? 'WARN' : 'PASS',
        rows: auditRows,
      },
    },
  });
  pipeline.emitMeta(
    { "City Shapefile": ["SOURCE_ID", "geometry", "AREA_SQ_M", "MAX_HEIGHT", "MIN_HEIGHT", "ELEV_Z", "EST_STORIES"] },
    { "building_footprints": ["source_id", "geometry", "footprint_area_sqm", "footprint_area_sqft", "max_height_m", "min_height_m", "elev_z", "estimated_stories", "centroid_lat", "centroid_lng"] }
  );
  // Note: link-massing.js runs as the next chain step — no longer coupled via execSync
});
