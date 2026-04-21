#!/usr/bin/env node
/**
 * Load Toronto Address Points CSV into the address_points lookup table.
 * Streams the ~185 MB file and batch-inserts in groups of 1000.
 *
 * Observability:
 *   - Structured logging via pipeline.log (§9.4)
 *   - for-await async iterator for clean backpressure (§9.5)
 *   - IS DISTINCT FROM upsert to apply coordinate updates (§9.3)
 *   - records_meta with rows_read, inserted, updated, skipped
 *
 * Usage:
 *   node scripts/load-address-points.js [path-to-csv]
 *
 * If no path is given, downloads from Toronto Open Data.
 *
 * SPEC LINK: docs/specs/pipeline/43_chain_sources.md
 * SPEC LINK: docs/specs/pipeline/54_source_address_points.md
 */
const pipeline = require('./lib/pipeline');
const { safeParsePositiveInt } = require('./lib/safe-math');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { parse } = require('csv-parse');

const CSV_URL =
  'https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/abedd8bc-e3dd-4d45-8e69-79165a76e4fa/resource/64d4e54b-738f-4cd9-a9e7-8050fac8a52f/download/address-points-4326.csv';

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
      const total = safeParsePositiveInt(response.headers['content-length'] || '0', 'content-length');
      let downloaded = 0;
      response.on('data', (chunk) => {
        downloaded += chunk.length;
        if (total > 0 && downloaded % (10 * 1024 * 1024) < chunk.length) {
          const pct = ((downloaded / total) * 100).toFixed(1);
          pipeline.log.info('[load-address-points]', `Download: ${(downloaded / 1024 / 1024).toFixed(0)} MB / ${(total / 1024 / 1024).toFixed(0)} MB (${pct}%)`);
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

const ADVISORY_LOCK_ID = 96;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
pipeline.run('load-address-points', async (pool) => {
  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
  const startTime = Date.now();

  let csvPath = process.argv[2];

  if (!csvPath) {
    csvPath = path.join(__dirname, '..', 'data', 'address-points-4326.csv');
    if (!fs.existsSync(csvPath)) {
      pipeline.log.info('[load-address-points]', 'Downloading Address Points CSV (~185 MB)...');
      await downloadFile(CSV_URL, csvPath);
      pipeline.log.info('[load-address-points]', 'Download complete.');
    } else {
      pipeline.log.info('[load-address-points]', `Using cached CSV: ${csvPath}`);
    }
  }

  pipeline.log.info('[load-address-points]', `Parsing: ${csvPath}`);

  let processed = 0;
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;
  let batch = [];

  async function flushBatch() {
    if (batch.length === 0) return;

    const currentBatch = batch;
    batch = [];

    await pipeline.withTransaction(pool, async (client) => {
      const values = [];
      const placeholders = [];
      let idx = 1;

      for (const row of currentBatch) {
        placeholders.push(`($${idx++}, $${idx++}, $${idx++})`);
        values.push(row.address_point_id, row.latitude, row.longitude);
      }

      const result = await client.query(
        `INSERT INTO address_points (address_point_id, latitude, longitude)
         VALUES ${placeholders.join(', ')}
         ON CONFLICT (address_point_id) DO UPDATE SET
           latitude = EXCLUDED.latitude,
           longitude = EXCLUDED.longitude
         WHERE address_points.latitude IS DISTINCT FROM EXCLUDED.latitude
            OR address_points.longitude IS DISTINCT FROM EXCLUDED.longitude
         RETURNING (xmax = 0) AS is_insert`,
        values
      );

      for (const r of result.rows) {
        if (r.is_insert) inserted++;
        else updated++;
      }
    });
  }

  // Use for-await async iterator for clean stream backpressure (§9.5)
  const parser = parse({
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true,
  });

  const stream = fs.createReadStream(csvPath).pipe(parser);

  try {
    for await (const record of stream) {
      processed++;

      const idRaw = (record.ADDRESS_POINT_ID || '').trim();
      const id = parseInt(idRaw, 10);
      if (isNaN(id)) {
        skipped++;
        continue;
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
          // fall through to fallback
        }
      }

      // Fallback: check for explicit LATITUDE/LONGITUDE columns
      if (lat == null || lng == null) {
        lat = parseFloat((record.LATITUDE || '').trim());
        lng = parseFloat((record.LONGITUDE || '').trim());
      }

      if (isNaN(lat) || isNaN(lng)) {
        skipped++;
        continue;
      }

      batch.push({ address_point_id: id, latitude: lat, longitude: lng });

      if (batch.length >= pipeline.BATCH_SIZE) {
        try {
          await flushBatch();
        } catch (err) {
          pipeline.log.error('[load-address-points]', err, { row: processed });
          errors++;
          batch = [];
        }

        if (processed % 50000 === 0) {
          pipeline.progress('load-address-points', processed, 525000, startTime);
        }
      }
    }

    // Flush remaining
    await flushBatch();
  } catch (err) {
    pipeline.log.error('[load-address-points]', err, { phase: 'csv_parse_or_insert' });
    errors++;
  }

  const durationMs = Date.now() - startTime;
  pipeline.log.info('[load-address-points]', 'Load complete', {
    rows_read: processed, inserted, updated, skipped, errors,
    duration: `${(durationMs / 1000).toFixed(1)}s`,
  });

  // Note: if a batch flush fails, lost rows inflate this count slightly
  const unchanged = Math.max(0, processed - inserted - updated - skipped);
  const skipRate = processed > 0 ? (skipped / processed) * 100 : 0;
  const skipRateStr = skipRate.toFixed(1) + '%';
  const auditRows = [
    { metric: 'rows_read', value: processed, threshold: '>= 500000', status: processed < 500000 ? 'WARN' : 'PASS' },
    { metric: 'records_inserted', value: inserted, threshold: null, status: 'INFO' },
    { metric: 'records_updated', value: updated, threshold: null, status: 'INFO' },
    { metric: 'records_unchanged', value: unchanged, threshold: null, status: 'INFO' },
    { metric: 'records_skipped', value: skipped, threshold: null, status: 'INFO' },
    { metric: 'skip_rate', value: skipRateStr, threshold: '< 5%', status: skipRate >= 5 ? 'FAIL' : 'PASS' },
    { metric: 'records_errors', value: errors, threshold: '== 0', status: errors > 0 ? 'FAIL' : 'PASS' },
  ];
  const hasFails = errors > 0 || skipRate >= 5;
  const hasWarns = processed < 500000;

  pipeline.emitSummary({
    records_total: inserted + updated,
    records_new: inserted,
    records_updated: updated,
    records_meta: {
      duration_ms: durationMs,
      rows_read: processed,
      records_inserted: inserted,
      records_updated: updated,
      records_unchanged: unchanged,
      records_skipped: skipped,
      errors,
      audit_table: {
        phase: 2,
        name: 'Address Points Ingestion',
        verdict: hasFails ? 'FAIL' : hasWarns ? 'WARN' : 'PASS',
        rows: auditRows,
      },
    },
  });
  pipeline.emitMeta(
    { "Toronto Open Data CSV": ["ADDRESS_POINT_ID", "LONGITUDE", "LATITUDE", "geometry"] },
    { "address_points": ["address_point_id", "latitude", "longitude"] }
  );
  }); // withAdvisoryLock

  if (!lockResult.acquired) return;
});
