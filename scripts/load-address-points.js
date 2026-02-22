#!/usr/bin/env node
/**
 * Load Toronto Address Points CSV into the address_points lookup table.
 * Streams the ~185 MB file and batch-inserts in groups of 1000.
 *
 * Usage:
 *   node scripts/load-address-points.js [path-to-csv]
 *
 * If no path is given, downloads from Toronto Open Data.
 */
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { parse } = require('csv-parse');

const BATCH_SIZE = 1000;

const CSV_URL =
  'https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/abedd8bc-e3dd-4d45-8e69-79165a76e4fa/resource/64d4e54b-738f-4cd9-a9e7-8050fac8a52f/download/address-points-4326.csv';

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  database: process.env.PG_DATABASE || 'buildo',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'postgres',
});

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
  console.log('=== Buildo Address Points Loader ===');
  console.log('');

  let csvPath = process.argv[2];

  if (!csvPath) {
    csvPath = path.join(__dirname, '..', 'address-points-4326.csv');
    if (!fs.existsSync(csvPath)) {
      console.log('Downloading Address Points CSV (~185 MB)...');
      await downloadFile(CSV_URL, csvPath);
      console.log('Download complete.');
    } else {
      console.log(`Using cached CSV: ${csvPath}`);
    }
  }

  console.log(`Parsing: ${csvPath}`);
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
      placeholders.push(`($${idx++}, $${idx++}, $${idx++})`);
      values.push(row.address_point_id, row.latitude, row.longitude);
    }

    await pool.query(
      `INSERT INTO address_points (address_point_id, latitude, longitude)
       VALUES ${placeholders.join(', ')}
       ON CONFLICT (address_point_id) DO NOTHING`,
      values
    );

    inserted += batch.length;
    batch = [];
  }

  return new Promise((resolve, reject) => {
    const parser = parse({
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      relax_quotes: true,
    });

    const stream = fs.createReadStream(csvPath).pipe(parser);

    stream.on('data', async (record) => {
      processed++;

      const idRaw = (record.ADDRESS_POINT_ID || '').trim();
      const id = parseInt(idRaw, 10);
      if (isNaN(id)) {
        skipped++;
        return;
      }

      // Coordinates are in a GeoJSON geometry column (MultiPoint or Point)
      let lat, lng;
      const geomRaw = (record.geometry || '').trim();
      if (geomRaw) {
        try {
          const geom = JSON.parse(geomRaw);
          if (geom.coordinates && geom.coordinates.length > 0) {
            // MultiPoint: [[lng, lat]], Point: [lng, lat]
            const coord = Array.isArray(geom.coordinates[0])
              ? geom.coordinates[0]
              : geom.coordinates;
            lng = coord[0];
            lat = coord[1];
          }
        } catch {
          // fall through
        }
      }

      // Fallback: check for explicit LATITUDE/LONGITUDE columns
      if (lat == null || lng == null) {
        lat = parseFloat((record.LATITUDE || '').trim());
        lng = parseFloat((record.LONGITUDE || '').trim());
      }

      if (isNaN(lat) || isNaN(lng)) {
        skipped++;
        return;
      }

      batch.push({
        address_point_id: id,
        latitude: lat,
        longitude: lng,
      });

      if (batch.length >= BATCH_SIZE) {
        stream.pause();
        try {
          await flushBatch();
        } catch (err) {
          console.error(`  Error inserting batch at row ${processed}:`, err.message);
          errors++;
          batch = [];
        }
        stream.resume();
      }

      if (processed % 50000 === 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`  ${processed.toLocaleString()} rows read, ${inserted.toLocaleString()} inserted, ${skipped.toLocaleString()} skipped - ${elapsed}s`);
      }
    });

    stream.on('end', async () => {
      try {
        await flushBatch();
      } catch (err) {
        console.error('Error flushing final batch:', err.message);
        errors++;
      }

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log('');
      console.log('=== Load Complete ===');
      console.log(`Rows read:     ${processed.toLocaleString()}`);
      console.log(`Inserted:      ${inserted.toLocaleString()}`);
      console.log(`Skipped:       ${skipped.toLocaleString()}`);
      console.log(`Errors:        ${errors}`);
      console.log(`Duration:      ${elapsed}s`);

      await pool.end();
      resolve();
    });

    stream.on('error', async (err) => {
      console.error('CSV parse error:', err);
      await pool.end();
      reject(err);
    });
  });
}

main().catch((err) => {
  console.error('Load failed:', err);
  process.exit(1);
});
