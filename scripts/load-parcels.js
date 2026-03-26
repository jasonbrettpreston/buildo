#!/usr/bin/env node
/**
 * Load Toronto Property Boundaries CSV into the parcels table.
 * Streams the 327 MB file and batch-inserts in groups of 1000.
 *
 * Usage:
 *   node scripts/load-parcels.js [path-to-csv]
 *
 * If no path is given, downloads from Toronto Open Data.
 */
const pipeline = require('./lib/pipeline');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { parse } = require('csv-parse');

const CSV_URL =
  'https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/property-boundaries/resource/23d1f792-018f-4069-ac5d-443e932e1b78/download/Property%20Boundaries%20-%204326.csv';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const SQM_TO_SQFT = 10.7639;
const M_TO_FT = 3.28084;

const STREET_TYPE_REGEX =
  /\b(ST|STREET|AVE|AVENUE|DR|DRIVE|RD|ROAD|BLVD|BOULEVARD|CRT|COURT|CRES|CRESCENT|PL|PLACE|WAY|LANE|LN|TR|TRAIL|TERR|TERRACE|CIR|CIRCLE|PKWY|PARKWAY|GATE|GDNS|GARDENS|GRV|GROVE|HTS|HEIGHTS|MEWS|SQ|SQUARE)\b/;

const STREET_TYPE_MAP = {
  STREET: 'ST', AVENUE: 'AVE', DRIVE: 'DR', ROAD: 'RD',
  BOULEVARD: 'BLVD', COURT: 'CRT', CRESCENT: 'CRES', PLACE: 'PL',
  LANE: 'LN', TRAIL: 'TR', TERRACE: 'TERR', CIRCLE: 'CIR',
  PARKWAY: 'PKWY', GARDENS: 'GDNS', GROVE: 'GRV', HEIGHTS: 'HTS',
  SQUARE: 'SQ',
};

// ---------------------------------------------------------------------------
// Helpers (inline to avoid module resolution issues in standalone scripts)
// ---------------------------------------------------------------------------
function parseStatedArea(raw) {
  if (!raw || !raw.trim()) return null;
  const match = raw.trim().match(/^([\d.]+)\s*sq\.m/i);
  if (!match) return null;
  const value = parseFloat(match[1]);
  if (isNaN(value) || value <= 0) return null;
  return value;
}

function parseLinearName(linearName) {
  if (!linearName || !linearName.trim()) {
    return { street_name: '', street_type: '' };
  }
  const upper = linearName.trim().toUpperCase();
  const typeMatch = upper.match(STREET_TYPE_REGEX);
  let streetType = '';
  if (typeMatch) {
    streetType = STREET_TYPE_MAP[typeMatch[1]] || typeMatch[1];
  }
  const nameOnly = upper
    .replace(STREET_TYPE_REGEX, '')
    .replace(/\b(NORTH|SOUTH|EAST|WEST|[NSEW])\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return { street_name: nameOnly, street_type: streetType };
}

function normalizeAddressNumber(num) {
  if (!num) return '';
  return num.trim().replace(/^0+/, '').toUpperCase();
}

function extractRing(geometry) {
  if (!geometry || !geometry.type || !geometry.coordinates) return null;
  if (geometry.type === 'Polygon') return geometry.coordinates[0] || null;
  if (geometry.type === 'MultiPolygon') return geometry.coordinates[0]?.[0] || null;
  return null;
}

function minimumBoundingRect(ring) {
  if (!ring || ring.length < 4) return null;
  const n = ring.length - 1;
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
  let minArea = Infinity, bestW = 0, bestH = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    const dx = points[j][0] - points[i][0];
    const dy = points[j][1] - points[i][1];
    const angle = Math.atan2(dy, dx);
    const cos = Math.cos(-angle), sin = Math.sin(-angle);
    let mnX = Infinity, mxX = -Infinity, mnY = Infinity, mxY = -Infinity;
    for (const [px, py] of points) {
      const rx = px * cos - py * sin, ry = px * sin + py * cos;
      if (rx < mnX) mnX = rx; if (rx > mxX) mxX = rx;
      if (ry < mnY) mnY = ry; if (ry > mxY) mxY = ry;
    }
    const w = mxX - mnX, h = mxY - mnY, area = w * h;
    if (area < minArea) { minArea = area; bestW = Math.min(w, h); bestH = Math.max(w, h); }
  }
  if (bestW <= 0 || bestH <= 0) return null;
  return { width: bestW, height: bestH };
}

const IRREGULARITY_THRESHOLD = 0.95;

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

function rectangularityRatio(ring) {
  const polyArea = shoelaceArea(ring);
  if (polyArea == null || polyArea <= 0) return null;
  const mbr = minimumBoundingRect(ring);
  if (!mbr) return null;
  const mbrArea = mbr.width * mbr.height;
  if (mbrArea <= 0) return null;
  return Math.min(polyArea / mbrArea, 1.0);
}

function estimateLotDimensions(geometry, statedAreaSqm) {
  if (!geometry) return null;
  const ring = extractRing(geometry);
  if (!ring) return null;
  const mbr = minimumBoundingRect(ring);
  if (!mbr) return null;
  if (mbr.width < 1 || mbr.height < 1) return null;

  const mbrArea = mbr.width * mbr.height;
  const polygonArea = shoelaceArea(ring);

  const trueArea = (statedAreaSqm && statedAreaSqm > 0) ? statedAreaSqm : polygonArea;
  const scale = (trueArea && trueArea > 0 && mbrArea > 0)
    ? Math.sqrt(trueArea / mbrArea) : 1;

  const isIrregular = (polygonArea != null && polygonArea > 0 && mbrArea > 0)
    ? (polygonArea / mbrArea) < IRREGULARITY_THRESHOLD : false;

  return {
    frontage_m: Math.round(mbr.width * scale * 100) / 100,
    depth_m: Math.round(mbr.height * scale * 100) / 100,
    is_irregular: isIrregular,
  };
}

function parseDate(v) {
  if (!v || String(v).trim() === '') return null;
  const s = String(v).trim();
  // Return ISO date string YYYY-MM-DD to avoid timezone mismatch in IS DISTINCT FROM
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const ms = Date.parse(s);
  if (isNaN(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10);
}

function parseGeoJSON(raw) {
  if (!raw || !raw.trim()) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
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
          pipeline.log.info('[load-parcels]', `Download: ${(downloaded / 1024 / 1024).toFixed(0)} MB / ${(total / 1024 / 1024).toFixed(0)} MB (${pct}%)`);
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
pipeline.run('load-parcels', async (pool) => {
  pipeline.log.info('[load-parcels]','=== Buildo Property Boundaries Loader ===');
  pipeline.log.info('[load-parcels]','');

  let csvPath = process.argv[2];

  if (!csvPath) {
    csvPath = path.join(__dirname, '..', 'data', 'property-boundaries-4326.csv');
    if (!fs.existsSync(csvPath)) {
      pipeline.log.info('[load-parcels]','Downloading Property Boundaries CSV (~327 MB)...');
      await downloadFile(CSV_URL, csvPath);
      pipeline.log.info('[load-parcels]','Download complete.');
    } else {
      pipeline.log.info('[load-parcels]',`Using cached CSV: ${csvPath}`);
    }
  }

  pipeline.log.info('[load-parcels]',`Parsing: ${csvPath}`);

  // Detect PostGIS for optional geom column population
  const pgisCheck = await pool.query("SELECT 1 FROM pg_extension WHERE extname = 'postgis'");
  const hasPostGIS = pgisCheck.rows.length > 0;
  if (!hasPostGIS) pipeline.log.info('[load-parcels]', 'PostGIS not installed — skipping geom column');
  pipeline.log.info('[load-parcels]','');

  const startTime = Date.now();
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
        placeholders.push(
          `($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`
        );
        values.push(
          row.parcel_id, row.feature_type,
          row.address_number, row.linear_name_full,
          row.addr_num_normalized, row.street_name_normalized, row.street_type_normalized,
          row.stated_area_raw, row.lot_size_sqm, row.lot_size_sqft,
          row.frontage_m, row.frontage_ft, row.depth_m, row.depth_ft,
          row.geometry ? JSON.stringify(row.geometry) : null,
          row.date_effective, row.is_irregular
        );
      }

      const geomLine = hasPostGIS
        ? 'geom = ST_SetSRID(ST_GeomFromGeoJSON(EXCLUDED.geometry::text), 4326),'
        : '';

      const result = await client.query(
        `INSERT INTO parcels (
          parcel_id, feature_type,
          address_number, linear_name_full,
          addr_num_normalized, street_name_normalized, street_type_normalized,
          stated_area_raw, lot_size_sqm, lot_size_sqft,
          frontage_m, frontage_ft, depth_m, depth_ft,
          geometry, date_effective, is_irregular
        ) VALUES ${placeholders.join(', ')}
        ON CONFLICT (parcel_id)
        DO UPDATE SET
          feature_type = EXCLUDED.feature_type,
          address_number = EXCLUDED.address_number,
          linear_name_full = EXCLUDED.linear_name_full,
          addr_num_normalized = EXCLUDED.addr_num_normalized,
          street_name_normalized = EXCLUDED.street_name_normalized,
          street_type_normalized = EXCLUDED.street_type_normalized,
          stated_area_raw = EXCLUDED.stated_area_raw,
          lot_size_sqm = EXCLUDED.lot_size_sqm,
          lot_size_sqft = EXCLUDED.lot_size_sqft,
          frontage_m = EXCLUDED.frontage_m,
          frontage_ft = EXCLUDED.frontage_ft,
          depth_m = EXCLUDED.depth_m,
          depth_ft = EXCLUDED.depth_ft,
          geometry = EXCLUDED.geometry,
          ${geomLine}
          date_effective = EXCLUDED.date_effective,
          is_irregular = EXCLUDED.is_irregular
        WHERE parcels.geometry::jsonb IS DISTINCT FROM EXCLUDED.geometry::jsonb
          OR parcels.lot_size_sqm IS DISTINCT FROM EXCLUDED.lot_size_sqm
          OR parcels.feature_type IS DISTINCT FROM EXCLUDED.feature_type
          OR parcels.address_number IS DISTINCT FROM EXCLUDED.address_number
          OR parcels.date_effective IS DISTINCT FROM EXCLUDED.date_effective
        RETURNING (xmax = 0) AS is_insert`,
        values
      );

      const batchNew = result.rows.filter(r => r.is_insert).length;
      inserted += batchNew;
      updated += result.rows.length - batchNew;
    });
  }

  const parser = parse({
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true,
  });

  const stream = fs.createReadStream(csvPath).pipe(parser);

  // Helper to emit final summary (used in both success and truncated paths)
  function emitFinal(label) {
    const durationMs = Date.now() - startTime;
    pipeline.log.info('[load-parcels]', `${label}`, {
      rows_read: processed, inserted, updated, skipped, errors,
      duration: `${(durationMs / 1000).toFixed(1)}s`,
    });

    // Note: if a batch flush fails, lost rows inflate this count slightly
    const unchanged = Math.max(0, processed - inserted - updated - skipped);
    const skipRate = processed > 0 ? (skipped / processed) * 100 : 0;
    const skipRateStr = skipRate.toFixed(1) + '%';
    const auditRows = [
      { metric: 'rows_read', value: processed, threshold: '>= 450000', status: processed < 450000 ? 'WARN' : 'PASS' },
      { metric: 'records_inserted', value: inserted, threshold: null, status: 'INFO' },
      { metric: 'records_updated', value: updated, threshold: null, status: 'INFO' },
      { metric: 'records_unchanged', value: unchanged, threshold: null, status: 'INFO' },
      { metric: 'records_skipped', value: skipped, threshold: null, status: 'INFO' },
      { metric: 'skip_rate', value: skipRateStr, threshold: '< 10%', status: skipRate >= 10 ? 'FAIL' : 'PASS' },
      { metric: 'records_errors', value: errors, threshold: '== 0', status: errors > 0 ? 'FAIL' : 'PASS' },
    ];
    const hasFails = errors > 0 || skipRate >= 10;
    const hasWarns = processed < 450000;

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
          phase: 4,
          name: 'Parcels Ingestion',
          verdict: hasFails ? 'FAIL' : hasWarns ? 'WARN' : 'PASS',
          rows: auditRows,
        },
      },
    });
    pipeline.emitMeta(
      { "Toronto Open Data CSV": ["PARCELID", "FEATURE_TYPE", "ADDRESS_NUMBER", "LINEAR_NAME_FULL", "STATEDAREA", "geometry", "DATE_EFFECTIVE"] },
      { "parcels": ["parcel_id", "feature_type", "address_number", "linear_name_full", "addr_num_normalized", "street_name_normalized", "street_type_normalized", "stated_area_raw", "lot_size_sqm", "lot_size_sqft", "frontage_m", "frontage_ft", "depth_m", "depth_ft", "geometry", "date_effective", "is_irregular", "geom"] }
    );
  }

  // Use for-await async iterator for clean stream backpressure (§9.5)
  try {
    for await (const record of stream) {
      processed++;

      // Filter: skip CORRIDOR, RESERVE feature types
      const featureType = (record.FEATURE_TYPE || '').trim().toUpperCase();
      if (featureType === 'CORRIDOR' || featureType === 'RESERVE') {
        skipped++;
        continue;
      }

      // Filter: skip expired parcels (DATE_EXPIRY before today)
      const dateExpiry = record.DATE_EXPIRY || '';
      if (dateExpiry && dateExpiry !== '3000-01-01' && dateExpiry < new Date().toISOString().slice(0, 10)) {
        skipped++;
        continue;
      }

      const parcelId = (record.PARCELID || '').trim();
      if (!parcelId) { skipped++; continue; }

      // Parse stated area
      const statedAreaRaw = (record.STATEDAREA || '').trim();
      const lotSizeSqm = parseStatedArea(statedAreaRaw);
      const lotSizeSqft = lotSizeSqm ? Math.round(lotSizeSqm * SQM_TO_SQFT * 100) / 100 : null;

      // Parse address
      const addressNumber = (record.ADDRESS_NUMBER || '').trim();
      const linearNameFull = (record.LINEAR_NAME_FULL || '').trim();
      const parsed = parseLinearName(linearNameFull);
      const addrNumNorm = normalizeAddressNumber(addressNumber);

      // Parse geometry and estimate dimensions (area-corrected)
      const geometry = parseGeoJSON(record.geometry || '');
      const dims = estimateLotDimensions(geometry, lotSizeSqm);
      const frontageM = dims ? dims.frontage_m : null;
      const depthM = dims ? dims.depth_m : null;
      const frontageFt = frontageM ? Math.round(frontageM * M_TO_FT * 100) / 100 : null;
      const depthFt = depthM ? Math.round(depthM * M_TO_FT * 100) / 100 : null;
      const isIrregular = dims ? dims.is_irregular : false;

      batch.push({
        parcel_id: parcelId,
        feature_type: featureType || null,
        address_number: addressNumber || null,
        linear_name_full: linearNameFull || null,
        addr_num_normalized: addrNumNorm || null,
        street_name_normalized: parsed.street_name || null,
        street_type_normalized: parsed.street_type || null,
        stated_area_raw: statedAreaRaw || null,
        lot_size_sqm: lotSizeSqm,
        lot_size_sqft: lotSizeSqft,
        frontage_m: frontageM,
        frontage_ft: frontageFt,
        depth_m: depthM,
        depth_ft: depthFt,
        geometry: geometry,
        date_effective: parseDate(record.DATE_EFFECTIVE),
        is_irregular: isIrregular,
      });

      if (batch.length >= pipeline.BATCH_SIZE) {
        try {
          await flushBatch();
        } catch (err) {
          pipeline.log.error('[load-parcels]', err, { row: processed });
          errors++;
          batch = [];
        }

        if (processed % 50000 === 0) {
          pipeline.progress('load-parcels', processed, 484000, startTime);
        }
      }
    }

    // Flush remaining
    await flushBatch();
    emitFinal('Load complete');

  } catch (err) {
    // Truncated CSV (unclosed quote at EOF) is recoverable — flush what we have
    if (err.code === 'CSV_QUOTE_NOT_CLOSED' && processed > 0) {
      pipeline.log.warn('[load-parcels]', `CSV truncated at line ${err.lines || '?'} — flushing ${processed.toLocaleString()} rows already parsed`);
      try {
        await flushBatch();
      } catch (flushErr) {
        pipeline.log.error('[load-parcels]', flushErr, { phase: 'truncated_flush' });
        errors++;
      }
      emitFinal('Load complete (partial — truncated CSV)');
    } else {
      pipeline.log.error('[load-parcels]', err, { phase: 'csv_parse' });
      throw err;
    }
  }
});
