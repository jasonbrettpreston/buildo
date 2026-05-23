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
 * SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md
 * SPEC LINK: docs/specs/01-pipeline/54_source_address_points.md
 */
const pipeline = require('./lib/pipeline');
const { safeParsePositiveInt, safeParseIntOrNull } = require('./lib/safe-math');
const {
  detectMissingColumns,
  buildDriftAuditRow,
  buildNullAddressNumberAuditRow,
} = require('./lib/address-points-csv-drift');
const {
  normalizeAddressNumber,
  parseLinearName,
} = require('./lib/address-normalizers');
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

  // WF1 Phase 2b — drift detection (analogous to parcels-csv-drift CRIT-3b).
  // Captured once from the first parsed record's keys; csv-parse with
  // `columns: true` derives headers from line 1, so this is the canonical
  // CSV header set for the run.
  let missingCsvColumns = null;
  let attemptedAddressNumberRows = 0;
  let nullAddressNumberRows = 0;

  async function flushBatch() {
    if (batch.length === 0) return;

    const currentBatch = batch;
    batch = [];

    await pipeline.withTransaction(pool, async (client) => {
      const values = [];
      const placeholders = [];
      let idx = 1;

      // 15 bind params per row (3 base + 10 source + 2 normalized; geom
      // is computed in-SQL via ST_SetSRID(ST_MakePoint(lng, lat), 4326)
      // and does not consume a bind param).
      //   $i   = address_point_id
      //   $i+1 = latitude
      //   $i+2 = longitude
      //   $i+3..i+12 = 10 source columns
      //   $i+13 = addr_num_normalized
      //   $i+14 = linear_name_normalized
      // pipeline.BATCH_SIZE = 1000 → 15K bind params, well below the 65535 cap.
      for (const row of currentBatch) {
        const i = idx;
        placeholders.push(
          // WF3 hotfix on Phase 2b (2026-05-23): the prior form used
          // $${i+1} (latitude) and $${i+2} (longitude) WITHOUT casts in
          // the column positions (PG inferred NUMERIC from address_points.
          // latitude / .longitude column types) AND with `::float8` casts
          // inside ST_MakePoint. PG cannot reconcile two different inferred
          // types for the same parameter slot — "error: inconsistent types
          // deduced for parameter $2" — and every batch failed in production
          // despite passing SQL-string regex tests + 4-reviewer IMPL review.
          // Fix: pin both uses of lat/lng to ::float8 so the parameter type
          // is unambiguous in all positions. The NUMERIC column accepts the
          // float8 value via implicit cast on the column side.
          `($${i}, $${i+1}::float8, $${i+2}::float8, $${i+3}, $${i+4}, $${i+5}, $${i+6}, $${i+7}, ` +
          `$${i+8}, $${i+9}, $${i+10}, $${i+11}, $${i+12}, $${i+13}, $${i+14}, ` +
          // ST_MakePoint takes (X=longitude, Y=latitude).
          `ST_SetSRID(ST_MakePoint($${i+2}::float8, $${i+1}::float8), 4326))`,
        );
        idx += 15;
        values.push(
          row.address_point_id,
          row.latitude,
          row.longitude,
          row.address_number,
          row.linear_name_full,
          row.address_full,
          row.lo_num,
          row.hi_num,
          row.maint_stage,
          row.address_status,
          row.address_class_desc,
          row.class_family_desc,
          row.place_name,
          row.addr_num_normalized,
          row.linear_name_normalized,
        );
      }

      const result = await client.query(
        // Day-1 safety: COALESCE-preserve existing values when EXCLUDED is
        // NULL/empty (mirrors load-parcels.js post-2026-05-20 Toronto CKAN
        // strip pattern). For the 10 new source columns + 2 normalized,
        // this prevents NULL-overwriting 525K rows if Toronto strips them.
        `INSERT INTO address_points (
           address_point_id, latitude, longitude,
           address_number, linear_name_full, address_full, lo_num, hi_num,
           maint_stage, address_status, address_class_desc, class_family_desc, place_name,
           addr_num_normalized, linear_name_normalized,
           geom
         )
         VALUES ${placeholders.join(', ')}
         ON CONFLICT (address_point_id) DO UPDATE SET
           -- latitude/longitude are intentionally NOT COALESCE-wrapped.
           -- The stream-loop skip guard (isNaN(lat) || isNaN(lng) →
           -- skipped++; continue) ensures rows with stripped or invalid
           -- coordinates never reach this UPSERT, so a bare assignment
           -- is safe: every row that arrives here has valid lat/lng.
           -- If a future change wraps these in COALESCE, legitimate
           -- coordinate updates (e.g., a corrected lat/lng for a moved
           -- address point) would be silently suppressed.
           latitude  = EXCLUDED.latitude,
           longitude = EXCLUDED.longitude,
           address_number          = COALESCE(NULLIF(EXCLUDED.address_number, ''),          address_points.address_number),
           linear_name_full        = COALESCE(NULLIF(EXCLUDED.linear_name_full, ''),        address_points.linear_name_full),
           address_full            = COALESCE(NULLIF(EXCLUDED.address_full, ''),            address_points.address_full),
           lo_num                  = COALESCE(EXCLUDED.lo_num,                              address_points.lo_num),
           hi_num                  = COALESCE(EXCLUDED.hi_num,                              address_points.hi_num),
           maint_stage             = COALESCE(NULLIF(EXCLUDED.maint_stage, ''),             address_points.maint_stage),
           address_status          = COALESCE(NULLIF(EXCLUDED.address_status, ''),          address_points.address_status),
           address_class_desc      = COALESCE(NULLIF(EXCLUDED.address_class_desc, ''),      address_points.address_class_desc),
           class_family_desc       = COALESCE(NULLIF(EXCLUDED.class_family_desc, ''),       address_points.class_family_desc),
           place_name              = COALESCE(NULLIF(EXCLUDED.place_name, ''),              address_points.place_name),
           addr_num_normalized     = COALESCE(NULLIF(EXCLUDED.addr_num_normalized, ''),     address_points.addr_num_normalized),
           linear_name_normalized  = COALESCE(NULLIF(EXCLUDED.linear_name_normalized, ''),  address_points.linear_name_normalized),
           geom = EXCLUDED.geom
         WHERE address_points.latitude  IS DISTINCT FROM EXCLUDED.latitude
            OR address_points.longitude IS DISTINCT FROM EXCLUDED.longitude
            OR (NULLIF(EXCLUDED.address_number, '') IS NOT NULL
                AND address_points.address_number IS DISTINCT FROM EXCLUDED.address_number)
            OR (NULLIF(EXCLUDED.linear_name_full, '') IS NOT NULL
                AND address_points.linear_name_full IS DISTINCT FROM EXCLUDED.linear_name_full)
            OR (NULLIF(EXCLUDED.address_full, '') IS NOT NULL
                AND address_points.address_full IS DISTINCT FROM EXCLUDED.address_full)
            OR (EXCLUDED.lo_num IS NOT NULL
                AND address_points.lo_num IS DISTINCT FROM EXCLUDED.lo_num)
            OR (EXCLUDED.hi_num IS NOT NULL
                AND address_points.hi_num IS DISTINCT FROM EXCLUDED.hi_num)
            OR (NULLIF(EXCLUDED.maint_stage, '') IS NOT NULL
                AND address_points.maint_stage IS DISTINCT FROM EXCLUDED.maint_stage)
            OR (NULLIF(EXCLUDED.address_status, '') IS NOT NULL
                AND address_points.address_status IS DISTINCT FROM EXCLUDED.address_status)
            OR (NULLIF(EXCLUDED.address_class_desc, '') IS NOT NULL
                AND address_points.address_class_desc IS DISTINCT FROM EXCLUDED.address_class_desc)
            OR (NULLIF(EXCLUDED.class_family_desc, '') IS NOT NULL
                AND address_points.class_family_desc IS DISTINCT FROM EXCLUDED.class_family_desc)
            OR (NULLIF(EXCLUDED.place_name, '') IS NOT NULL
                AND address_points.place_name IS DISTINCT FROM EXCLUDED.place_name)
            OR (NULLIF(EXCLUDED.addr_num_normalized, '') IS NOT NULL
                AND address_points.addr_num_normalized IS DISTINCT FROM EXCLUDED.addr_num_normalized)
            OR (NULLIF(EXCLUDED.linear_name_normalized, '') IS NOT NULL
                AND address_points.linear_name_normalized IS DISTINCT FROM EXCLUDED.linear_name_normalized)
            OR address_points.geom IS DISTINCT FROM EXCLUDED.geom
         RETURNING (xmax = 0) AS is_insert`,
        values,
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

      // WF1 Phase 2b — capture CSV header once on the first record. The
      // csv-parse `columns: true` option yields each row as an object whose
      // keys ARE the header line; reading them on iteration 1 gives the
      // canonical column set without re-reading the file.
      if (missingCsvColumns === null) {
        missingCsvColumns = detectMissingColumns(Object.keys(record));
        if (missingCsvColumns.length > 0) {
          pipeline.log.warn(
            '[load-address-points]',
            `CKAN CSV column drift: missing ${missingCsvColumns.join(', ')}`,
          );
        }
      }

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

      // WF1 Phase 2b — 10 new source fields + 2 derived normalized.
      // Each field defaults to '' when the column is absent from the CSV
      // (silently null-filled by the `record.X || ''` fallback). The
      // address_points_csv_schema_drift audit row surfaces this loss as WARN.
      const addressNumber = (record.ADDRESS_NUMBER || '').trim();
      const linearNameFull = (record.LINEAR_NAME_FULL || '').trim();
      const addressFull = (record.ADDRESS_FULL || '').trim();
      const loNum = safeParseIntOrNull((record.LO_NUM || '').trim());
      const hiNum = safeParseIntOrNull((record.HI_NUM || '').trim());
      const maintStage = (record.MAINT_STAGE || '').trim();
      const addressStatus = (record.ADDRESS_STATUS || '').trim();
      const addressClassDesc = (record.ADDRESS_CLASS_DESC || '').trim();
      const classFamilyDesc = (record.CLASS_FAMILY_DESC || '').trim();
      const placeName = (record.PLACE_NAME || '').trim();

      // Normalized JOIN keys via the shared lib so they match parcels exactly.
      // NOTE on column naming asymmetry (Phase 2c handoff): parseLinearName
      // returns { street_name, street_type }. address_points stores the
      // street_name component as `linear_name_normalized` (the column name
      // pre-dates the split). parcels stores them in two separate columns
      // `street_name_normalized` + `street_type_normalized`. Phase 2c
      // link-parcel-addresses + Phase 2d link-parcels MUST JOIN
      // `parcels.street_name_normalized = address_points.linear_name_normalized`
      // (NOT linear_name_full vs linear_name_normalized) — both sides
      // carry the same `street_name`-only value via this same function.
      const addrNumNorm = normalizeAddressNumber(addressNumber);
      const { street_name: streetNameOnly } = parseLinearName(linearNameFull);

      // null-address tracking for the WARN audit row (CKAN strip detector).
      attemptedAddressNumberRows++;
      if (!addressNumber) {
        nullAddressNumberRows++;
      }

      batch.push({
        address_point_id: id,
        latitude: lat,
        longitude: lng,
        address_number: addressNumber || null,
        linear_name_full: linearNameFull || null,
        address_full: addressFull || null,
        lo_num: loNum,
        hi_num: hiNum,
        maint_stage: maintStage || null,
        address_status: addressStatus || null,
        address_class_desc: addressClassDesc || null,
        class_family_desc: classFamilyDesc || null,
        place_name: placeName || null,
        addr_num_normalized: addrNumNorm || null,
        linear_name_normalized: streetNameOnly || null,
      });

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
  // WF1 Phase 2b — CKAN drift + null-address audit rows. `missingCsvColumns`
  // is null only if the loop saw zero records (empty CSV); treat that as
  // "no drift observed" so the row_count audit can fail/warn on its own.
  const driftRow = buildDriftAuditRow(missingCsvColumns ?? []);
  const nullAddressNumberRow = buildNullAddressNumberAuditRow(
    nullAddressNumberRows,
    attemptedAddressNumberRows,
  );

  const auditRows = [
    { metric: 'rows_read', value: processed, threshold: '>= 500000', status: processed < 500000 ? 'WARN' : 'PASS' },
    { metric: 'records_inserted', value: inserted, threshold: null, status: 'INFO' },
    { metric: 'records_updated', value: updated, threshold: null, status: 'INFO' },
    { metric: 'records_unchanged', value: unchanged, threshold: null, status: 'INFO' },
    { metric: 'records_skipped', value: skipped, threshold: null, status: 'INFO' },
    { metric: 'skip_rate', value: skipRateStr, threshold: '< 5%', status: skipRate >= 5 ? 'FAIL' : 'PASS' },
    { metric: 'records_errors', value: errors, threshold: '== 0', status: errors > 0 ? 'FAIL' : 'PASS' },
    driftRow,
    nullAddressNumberRow,
  ];

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
        // WF1 Phase 2b — row-derived cascade per Spec 48 §3.6 / Spec 47 §8.2.
        // Replaces the prior parallel-boolean form (hasFails/hasWarns) so
        // future WARN-emitting rows (e.g., drift, null-address) elevate the
        // verdict correctly instead of being silently dropped.
        verdict: auditRows.some((r) => r.status === 'FAIL') ? 'FAIL'
               : auditRows.some((r) => r.status === 'WARN') ? 'WARN'
               : 'PASS',
        rows: auditRows,
      },
    },
  });
  // WF1 Phase 2b — reads-list expanded to include all 14 CKAN columns the
  // loader now reads (10 new source + ADDRESS_POINT_ID + LATITUDE +
  // LONGITUDE + geometry). Writes-list expanded with the 10 new persisted
  // columns + 2 derived normalized + geom (computed in-SQL from lat/lng).
  pipeline.emitMeta(
    {
      "Toronto Open Data CSV": [
        "ADDRESS_POINT_ID",
        "ADDRESS_NUMBER",
        "LINEAR_NAME_FULL",
        "ADDRESS_FULL",
        "LO_NUM",
        "HI_NUM",
        "MAINT_STAGE",
        "ADDRESS_STATUS",
        "ADDRESS_CLASS_DESC",
        "CLASS_FAMILY_DESC",
        "PLACE_NAME",
        "LATITUDE",
        "LONGITUDE",
        "geometry",
      ],
    },
    {
      "address_points": [
        "address_point_id",
        "latitude",
        "longitude",
        "address_number",
        "linear_name_full",
        "address_full",
        "lo_num",
        "hi_num",
        "maint_stage",
        "address_status",
        "address_class_desc",
        "class_family_desc",
        "place_name",
        "addr_num_normalized",
        "linear_name_normalized",
        "geom",
      ],
    },
  );
  }); // withAdvisoryLock

  if (!lockResult.acquired) return;
});
