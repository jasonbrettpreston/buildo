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
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { execSync } = require('child_process');
const shapefile = require('shapefile');

const BATCH_SIZE = 1000;
const SQM_TO_SQFT = 10.7639;
const STORY_HEIGHT_M = 3.0;

const ZIP_URL =
  'https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/3d-massing/resource/edcd1310-ee62-40d0-a4a0-c95e7c3eaaf5/download/3dmassingshapefile_2025_wgs84.zip';

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  database: process.env.PG_DATABASE || 'buildo',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'postgres',
});

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
          console.log(`  Downloaded: ${(downloaded / 1024 / 1024).toFixed(0)} MB / ${(total / 1024 / 1024).toFixed(0)} MB (${pct}%)`);
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
async function main() {
  console.log('=== Buildo 3D Massing Loader ===');
  console.log('');

  let shpPath = process.argv[2];

  if (!shpPath) {
    const zipPath = path.join(__dirname, '..', '3d-massing-wgs84.zip');
    const extractDir = path.join(__dirname, '..', '3d-massing-wgs84');

    if (!fs.existsSync(extractDir)) {
      if (!fs.existsSync(zipPath)) {
        console.log('Downloading 3D Massing ZIP...');
        await downloadFile(ZIP_URL, zipPath);
        console.log('Download complete.');
      }

      console.log('Extracting ZIP...');
      fs.mkdirSync(extractDir, { recursive: true });
      execSync(`unzip -o "${zipPath}" -d "${extractDir}"`, { stdio: 'inherit' });
      console.log('Extraction complete.');
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

  console.log(`Reading: ${shpPath}`);
  console.log('');

  const startTime = Date.now();
  let processed = 0;
  let inserted = 0;
  let skipped = 0;
  let errors = 0;
  let batch = [];

  async function flushBatch() {
    if (batch.length === 0) return;

    const values = [];
    const placeholders = [];
    let idx = 1;

    for (const row of batch) {
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

    await pool.query(
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
        centroid_lng = EXCLUDED.centroid_lng`,
      values
    );

    inserted += batch.length;
    batch = [];
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
    const elevZ = props.ELEVZ != null ? parseFloat(props.ELEVZ) : null;
    const sourceId = props.OBJECTID != null ? String(props.OBJECTID) : null;
    if (!sourceId) {
      skipped++;
      continue;
    }

    const areaSqm = shoelaceArea(ring);
    const areaSqft = areaSqm != null ? Math.round(areaSqm * SQM_TO_SQFT * 100) / 100 : null;
    const centroid = computeCentroid(ring);
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

    if (batch.length >= BATCH_SIZE) {
      try {
        await flushBatch();
      } catch (err) {
        console.error(`  Error inserting batch at row ${processed}:`, err.message);
        errors++;
        batch = [];
      }
    }

    if (processed % 50000 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`  ${processed.toLocaleString()} features read, ${inserted.toLocaleString()} inserted, ${skipped.toLocaleString()} skipped - ${elapsed}s`);
    }
  }

  // Flush remaining
  try {
    await flushBatch();
  } catch (err) {
    console.error('Error flushing final batch:', err.message);
    errors++;
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('');
  console.log('=== Load Complete ===');
  console.log(`Features read:  ${processed.toLocaleString()}`);
  console.log(`Inserted:       ${inserted.toLocaleString()}`);
  console.log(`Skipped:        ${skipped.toLocaleString()}`);
  console.log(`Errors:         ${errors}`);
  console.log(`Duration:       ${elapsed}s`);

  await pool.end();
}

main().catch((err) => {
  console.error('Load failed:', err);
  process.exit(1);
});
