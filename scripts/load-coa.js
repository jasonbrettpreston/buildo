#!/usr/bin/env node
/**
 * Load Committee of Adjustment applications from Toronto Open Data (CKAN).
 * Fetches from both "Active Applications" and "Closed Applications since 2017"
 * datastore resources and upserts into coa_applications.
 *
 * Observability:
 *   - Structured logging via pipeline.log (§9.4)
 *   - Network telemetry: latencies, api_errors, retry counts
 *   - Schema drift detection: critical CKAN field presence check per-record
 *   - Skip accounting: reason-tracked (missing_app_num, schema_mismatch)
 *   - Portal rot detection: max_hearing_date staleness
 *   - Full records_meta in PIPELINE_SUMMARY for downstream assertion steps
 *
 * Usage: node scripts/load-coa.js
 *        node scripts/load-coa.js --full   (both resources)
 *
 * SPEC LINK: docs/specs/pipeline/42_chain_coa.md
 * SPEC LINK: docs/specs/pipeline/51_source_coa.md
 */
const pipeline = require('./lib/pipeline');
const { normalizeStreetName } = require('./lib/address');
const crypto = require('crypto');

const CKAN_BASE = 'https://ckan0.cf.opendata.inter.prod-toronto.ca';

// Two datastore resources to load
const RESOURCES = [
  { id: '51fd09cd-99d6-430a-9d42-c24a937b0cb0', name: 'Active Applications' },
  { id: '9c97254e-5460-4799-896f-c7823413c81c', name: 'Closed Applications since 2017' },
];

const BATCH_SIZE = 500;
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 2000;

// Active resource ID (incremental mode only fetches from Active)
const ACTIVE_RESOURCE_ID = '51fd09cd-99d6-430a-9d42-c24a937b0cb0';

// Critical CKAN fields — if any are missing from the payload, schema has drifted
const CRITICAL_FIELDS = [
  'REFERENCE_FILE#',   // application_number — primary key
  'C_OF_A_DESCISION',  // decision (note city's typo)
  'STATUSDESC',        // status
  'HEARING_DATE',      // hearing_date — used for portal rot detection
  'STREET_NUM',        // address component
  'STREET_NAME',       // address component
];

function trimToNull(v) {
  if (v == null) return null;
  const t = String(v).trim();
  return t === '' ? null : t;
}

function parseDate(v) {
  if (!v || String(v).trim() === '') return null;
  const ms = Date.parse(String(v).trim());
  if (isNaN(ms)) return null;
  return new Date(ms);
}

function computeHash(record) {
  const sorted = {};
  for (const key of Object.keys(record).sort()) {
    sorted[key] = record[key];
  }
  return crypto.createHash('sha256').update(JSON.stringify(sorted)).digest('hex');
}

async function fetchAllRecords(resourceId, resourceName, tel) {
  const records = [];
  const limit = 10000;
  let offset = 0;

  pipeline.log.info('[load-coa]', `Fetching "${resourceName}"...`);

  while (true) {
    const url = `${CKAN_BASE}/api/3/action/datastore_search?resource_id=${resourceId}&limit=${limit}&offset=${offset}`;
    let lastErr = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const reqStart = Date.now();
      try {
        const res = await fetch(url);
        tel.latencies.push(Date.now() - reqStart);

        if (!res.ok) {
          throw new Error(`HTTP ${res.status} at offset ${offset}`);
        }

        const json = await res.json();
        if (!json.success) throw new Error(`CKAN success=false at offset ${offset}`);

        const batch = json.result.records || [];
        records.push(...batch);
        pipeline.log.info('[load-coa]', `${resourceName}: offset=${offset}, got ${batch.length} (total: ${records.length})`);

        lastErr = null;
        if (batch.length < limit) return records;
        offset += limit;
        break; // success — exit retry loop, continue pagination

      } catch (err) {
        tel.latencies.push(Date.now() - reqStart);
        lastErr = err;
        if (attempt < MAX_RETRIES) {
          const delay = RETRY_BASE_MS * Math.pow(2, attempt - 1);
          pipeline.log.warn('[load-coa]', `Fetch failed (attempt ${attempt}/${MAX_RETRIES}): ${err.message}. Retrying in ${delay}ms...`);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }

    if (lastErr) {
      tel.api_errors++;
      pipeline.log.error('[load-coa]', lastErr, { offset, resource: resourceName });
      throw lastErr;
    }
  }

  return records;
}

/**
 * Map a CKAN record to our coa_applications schema.
 * Returns { record, skipReason } — record is null if skipped.
 *
 * Field names in the CKAN data:
 *   REFERENCE_FILE#     → application_number  (e.g. "A0246/23EYK")
 *   STREET_NUM          → street_num
 *   STREET_NAME         → street_name (we combine with STREET_TYPE + STREET_DIRECTION)
 *   WARD_NUMBER / WARD  → ward (field name differs between active/closed datasets)
 *   C_OF_A_DESCISION    → decision  (note typo in source: "DESCISION")
 *   STATUSDESC          → status
 *   HEARING_DATE        → hearing_date
 *   FINALDATE           → decision_date (for closed); for active, use APPEAL_EXPIRY_DATE
 *   DESCRIPTION         → description
 *   CONTACT_NAME        → applicant (closest available field)
 */
function mapRecord(raw, schemaDrift) {
  // Schema drift detection: check critical fields exist in the CKAN payload
  const rawKeys = Object.keys(raw);
  for (const field of CRITICAL_FIELDS) {
    if (!rawKeys.includes(field)) {
      if (!schemaDrift.includes(field)) schemaDrift.push(field);
      return { record: null, skipReason: 'schema_mismatch' };
    }
  }

  // Application number
  const appNum = trimToNull(raw['REFERENCE_FILE#']);
  if (!appNum) return { record: null, skipReason: 'missing_app_num' };

  // Build address from separate fields
  const streetNum = trimToNull(raw.STREET_NUM);
  const streetName = trimToNull(raw.STREET_NAME);
  const streetType = trimToNull(raw.STREET_TYPE);
  const streetDir = trimToNull(raw.STREET_DIRECTION);

  // Compose full street name: "QUEEN ST E" style
  let fullStreetName = streetName || '';
  if (streetType) fullStreetName += ' ' + streetType;
  if (streetDir) fullStreetName += ' ' + streetDir;
  fullStreetName = fullStreetName.trim() || null;

  // Full address: "123 QUEEN ST E"
  const address = streetNum && fullStreetName
    ? `${streetNum} ${fullStreetName}`
    : fullStreetName || streetNum || null;

  // Ward — field name differs between datasets
  const ward = trimToNull(raw.WARD_NUMBER || raw.WARD);

  // Decision — note the typo "DESCISION" in the CKAN data
  const decision = trimToNull(raw['C_OF_A_DESCISION']);

  // Status
  const status = trimToNull(raw.STATUSDESC);

  // Dates
  const hearingDate = parseDate(raw.HEARING_DATE);
  // For closed apps, FINALDATE is the close/decision date
  // For active apps, fall back to APPEAL_EXPIRY_DATE or HEARING_DATE
  const decisionDate = parseDate(raw.FINALDATE) || parseDate(raw.APPEAL_EXPIRY_DATE);

  // Description
  const description = trimToNull(raw.DESCRIPTION);

  // Applicant — only use CONTACT_NAME (SUB_TYPE is stored separately)
  const applicant = trimToNull(raw.CONTACT_NAME);
  const subType = trimToNull(raw.SUB_TYPE);

  // Build record first, then hash its own mapped fields — NOT the raw CKAN object.
  // Raw CKAN records include _id, _full_text, rank which change between fetches
  // and cause phantom updates even when the actual data is identical.
  const record = {
    application_number: appNum,
    address,
    street_num: streetNum,
    street_name: fullStreetName,
    street_name_normalized: normalizeStreetName(fullStreetName),
    ward,
    status,
    decision,
    decision_date: decisionDate,
    hearing_date: hearingDate,
    description,
    applicant,
    sub_type: subType,
  };
  record.data_hash = computeHash(record);

  return { record, skipReason: null };
}

async function upsertBatch(client, batch, RUN_AT) {
  if (batch.length === 0) return { inserted: 0, updated: 0 };

  // Collect arrays for UNNEST batch insert (O(1) round-trips instead of O(batch.length)).
  // 14 column arrays + scalar RUN_AT = 15 params; 500 rows × 14 cols = 7,000 params
  // per batch — well under PostgreSQL's 65,535 limit.
  const applicationNumbers = [], addresses = [], streetNums = [], streetNames = [],
    streetNamesNormalized = [], wards = [], statuses = [], decisions = [],
    decisionDates = [], hearingDates = [], descriptions = [], applicants = [],
    subTypes = [], dataHashes = [];

  for (const rec of batch) {
    applicationNumbers.push(rec.application_number);
    addresses.push(rec.address);
    streetNums.push(rec.street_num);
    streetNames.push(rec.street_name);
    streetNamesNormalized.push(rec.street_name_normalized);
    wards.push(rec.ward);
    statuses.push(rec.status);
    decisions.push(rec.decision);
    decisionDates.push(rec.decision_date ?? null);
    hearingDates.push(rec.hearing_date ?? null);
    descriptions.push(rec.description ?? null);
    applicants.push(rec.applicant ?? null);
    subTypes.push(rec.sub_type ?? null);
    dataHashes.push(rec.data_hash);
  }

  const result = await client.query(
    `INSERT INTO coa_applications (
       application_number, address, street_num, street_name, street_name_normalized, ward,
       status, decision, decision_date, hearing_date, description,
       applicant, sub_type, data_hash, first_seen_at, last_seen_at
     )
     SELECT
       unnest($1::text[]),
       unnest($2::text[]),
       unnest($3::text[]),
       unnest($4::text[]),
       unnest($5::text[]),
       unnest($6::text[]),
       unnest($7::text[]),
       unnest($8::text[]),
       unnest($9::timestamptz[]),
       unnest($10::timestamptz[]),
       unnest($11::text[]),
       unnest($12::text[]),
       unnest($13::text[]),
       unnest($14::text[]),
       $15::timestamptz,
       $15::timestamptz
     ON CONFLICT (application_number) DO UPDATE SET
       address = EXCLUDED.address,
       street_num = EXCLUDED.street_num,
       street_name = EXCLUDED.street_name,
       street_name_normalized = EXCLUDED.street_name_normalized,
       ward = EXCLUDED.ward,
       status = EXCLUDED.status,
       decision = EXCLUDED.decision,
       decision_date = EXCLUDED.decision_date,
       hearing_date = EXCLUDED.hearing_date,
       description = EXCLUDED.description,
       applicant = EXCLUDED.applicant,
       sub_type = EXCLUDED.sub_type,
       data_hash = EXCLUDED.data_hash,
       last_seen_at = $15::timestamptz
     WHERE coa_applications.data_hash IS DISTINCT FROM EXCLUDED.data_hash
     RETURNING (xmax = 0) AS is_insert`,
    [
      applicationNumbers, addresses, streetNums, streetNames, streetNamesNormalized,
      wards, statuses, decisions, decisionDates, hearingDates, descriptions,
      applicants, subTypes, dataHashes, RUN_AT,
    ]
  );

  let inserted = 0;
  let updated = 0;
  for (const row of result.rows) {
    if (row.is_insert) inserted++;
    else updated++;
  }
  return { inserted, updated };
}

const ADVISORY_LOCK_ID = 95;

pipeline.run('load-coa', async (pool) => {
  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
  const RUN_AT = await pipeline.getDbTimestamp(pool);

  const fullMode = pipeline.isFullMode();
  const startMs = Date.now();

  // Telemetry accumulator
  const tel = {
    api_errors: 0,
    latencies: [],
    schema_drift: [],
    skip_reasons: {},
  };

  pipeline.log.info('[load-coa]', `Mode: ${fullMode ? 'FULL (both resources)' : 'INCREMENTAL (Active only)'}`);

  // Fetch records based on mode
  let allRaw = [];
  if (fullMode) {
    for (const res of RESOURCES) {
      const records = await fetchAllRecords(res.id, res.name, tel);
      allRaw.push(...records);
    }
  } else {
    const records = await fetchAllRecords(ACTIVE_RESOURCE_ID, 'Active Applications', tel);
    allRaw.push(...records);
  }

  pipeline.log.info('[load-coa]', `Fetched ${allRaw.length} raw records from CKAN`);

  if (allRaw.length === 0) {
    pipeline.log.warn('[load-coa]', 'No records found from CKAN. Exiting.');
    pipeline.emitSummary({
      records_total: 0, records_new: 0, records_updated: 0,
      records_meta: {
        audit_table: {
          phase: 2,
          name: 'CoA Ingestion',
          verdict: 'WARN',
          rows: [
            { metric: 'status', value: 'SKIPPED', threshold: null, status: 'WARN' },
            { metric: 'reason', value: 'Zero records returned from CKAN — possible API outage or empty dataset', threshold: null, status: 'WARN' },
          ],
        },
      },
    });
    pipeline.emitMeta(
      { "CKAN API": ["REFERENCE_FILE#", "STREET_NUM", "STREET_NAME", "WARD", "C_OF_A_DESCISION", "STATUSDESC", "HEARING_DATE", "DESCRIPTION", "CONTACT_NAME", "SUB_TYPE"] },
      { "coa_applications": ["application_number", "address", "street_num", "street_name", "street_name_normalized", "ward", "status", "decision", "decision_date", "hearing_date", "description", "applicant", "sub_type", "data_hash", "first_seen_at", "last_seen_at"] }
    );
    return;
  }

  // Log sample record fields for debugging (structured, not raw dump)
  pipeline.log.info('[load-coa]', 'Sample CKAN fields', { fields: Object.keys(allRaw[0]) });

  // Map records with skip accounting
  const mapped = [];
  let maxHearingDate = null;

  for (const raw of allRaw) {
    const { record, skipReason } = mapRecord(raw, tel.schema_drift);
    // Halt immediately if schema drift detected — no point processing 10K broken records
    if (tel.schema_drift.length > 0) break;
    if (record) {
      mapped.push(record);
      // Track max hearing date for portal rot detection
      if (record.hearing_date && (!maxHearingDate || record.hearing_date > maxHearingDate)) {
        maxHearingDate = record.hearing_date;
      }
    } else {
      tel.skip_reasons[skipReason] = (tel.skip_reasons[skipReason] || 0) + 1;
    }
  }

  const totalSkipped = allRaw.length - mapped.length;
  pipeline.log.info('[load-coa]', `Mapped ${mapped.length} valid records (${totalSkipped} skipped)`, {
    skip_reasons: Object.keys(tel.skip_reasons).length > 0 ? tel.skip_reasons : 'none',
  });

  // Schema drift abort: if critical fields are missing, stop before upserting bad data
  if (tel.schema_drift.length > 0) {
    pipeline.log.error('[load-coa]', `Schema drift detected — missing CKAN fields: ${tel.schema_drift.join(', ')}. Aborting to prevent NULL data ingestion.`);
    pipeline.emitSummary({
      records_total: 0, records_new: 0, records_updated: 0,
      records_meta: {
        duration_ms: Date.now() - startMs,
        api_health: { api_errors: tel.api_errors },
        data_health: {
          records_fetched: allRaw.length,
          records_mapped: mapped.length,
          records_skipped: totalSkipped,
          skip_reasons: tel.skip_reasons,
          schema_mismatch_count: tel.schema_drift.length,
          schema_drift: tel.schema_drift,
        },
      },
    });
    throw new Error(`Schema drift detected: ${tel.schema_drift.join(', ')}`);
  }

  // Deduplicate by application_number (active may overlap with closed)
  const byAppNum = new Map();
  for (const rec of mapped) {
    const existing = byAppNum.get(rec.application_number);
    // Prefer the record with the more recent data
    if (!existing || (rec.decision_date && (!existing.decision_date || rec.decision_date > existing.decision_date))) {
      byAppNum.set(rec.application_number, rec);
    }
  }
  const deduplicated = [...byAppNum.values()];
  pipeline.log.info('[load-coa]', `Deduplicated: ${deduplicated.length} unique applications`);

  let totalInserted = 0;
  let totalUpdated = 0;

  for (let i = 0; i < deduplicated.length; i += BATCH_SIZE) {
    const batch = deduplicated.slice(i, i + BATCH_SIZE);
    const { inserted, updated } = await pipeline.withTransaction(pool, async (client) => {
      return upsertBatch(client, batch, RUN_AT);
    });
    totalInserted += inserted;
    totalUpdated += updated;
    pipeline.progress('load-coa', Math.min(i + BATCH_SIZE, deduplicated.length), deduplicated.length, startMs);
  }

  // Touch last_seen_at for ALL records seen this run — even unchanged ones.
  // The IS DISTINCT FROM guard in upsertBatch correctly prevents phantom writes
  // for content fields, but it also blocks last_seen_at updates for stable records,
  // causing false staleness positives in downstream assert-coa-freshness checks.
  // This bulk UPDATE is a no-op for records already touched by the upsert.
  if (deduplicated.length > 0) {
    const allAppNums = deduplicated.map((r) => r.application_number);
    // Process in BATCH_SIZE slices to stay within PG param limit
    for (let i = 0; i < allAppNums.length; i += BATCH_SIZE) {
      const slice = allAppNums.slice(i, i + BATCH_SIZE);
      await pool.query(
        `UPDATE coa_applications
            SET last_seen_at = $1::timestamptz
          WHERE application_number = ANY($2)
            AND last_seen_at IS DISTINCT FROM $1::timestamptz`,
        [RUN_AT, slice],
      );
    }
    pipeline.log.info('[load-coa]', `last_seen_at refreshed for ${allAppNums.length} records`);
  }

  // Portal rot detection: how stale is the most recent hearing?
  const maxDaysStale = maxHearingDate
    ? Math.max(0, Math.round((Date.now() - maxHearingDate.getTime()) / (1000 * 60 * 60 * 24)))
    : null;
  if (maxDaysStale !== null && maxDaysStale > 45) {
    pipeline.log.warn('[load-coa]', `Portal rot warning: newest hearing date is ${maxDaysStale} days old. CKAN data may be frozen.`);
  }

  // Latency stats
  const sortedLat = [...tel.latencies].sort((a, b) => a - b);
  const avgLatency = sortedLat.length > 0
    ? Math.round(sortedLat.reduce((a, b) => a + b, 0) / sortedLat.length) : 0;
  const maxLatency = sortedLat.length > 0 ? sortedLat[sortedLat.length - 1] : 0;

  // VACUUM — upsert touches ~2,800 rows on a 33K table, creating 97%+ dead tuples.
  // Clean before telemetry snapshot and engine health check.
  await pool.query('VACUUM ANALYZE coa_applications');

  const durationMs = Date.now() - startMs;
  pipeline.log.info('[load-coa]', 'Load complete', {
    inserted: totalInserted,
    updated: totalUpdated,
    skipped: totalSkipped,
    duration: `${(durationMs / 1000).toFixed(1)}s`,
    avg_latency: `${avgLatency}ms`,
  });

  // Build audit_table for CoA ingestion observability
  const skipRate = allRaw.length > 0 ? (totalSkipped / allRaw.length) * 100 : 0;
  const skipRateStr = skipRate.toFixed(1) + '%';
  const coaAuditRows = [
    { metric: 'records_fetched', value: allRaw.length, threshold: null, status: 'INFO' },
    { metric: 'records_mapped', value: mapped.length, threshold: null, status: 'INFO' },
    { metric: 'records_skipped', value: totalSkipped, threshold: null, status: 'INFO' },
    { metric: 'skip_rate', value: skipRateStr, threshold: '< 5%', status: skipRate >= 5 ? 'FAIL' : 'PASS' },
    { metric: 'records_inserted', value: totalInserted, threshold: null, status: 'INFO' },
    { metric: 'records_updated', value: totalUpdated, threshold: null, status: 'INFO' },
    { metric: 'api_errors', value: tel.api_errors, threshold: '== 0', status: tel.api_errors > 0 ? 'FAIL' : 'PASS' },
    { metric: 'avg_latency_ms', value: avgLatency, threshold: null, status: 'INFO' },
    { metric: 'schema_mismatch_count', value: tel.schema_drift.length, threshold: '== 0', status: tel.schema_drift.length > 0 ? 'FAIL' : 'PASS' },
    { metric: 'max_days_stale', value: maxDaysStale, threshold: '< 45', status: maxDaysStale !== null && maxDaysStale >= 45 ? 'WARN' : 'PASS' },
  ];
  const coaAuditHasFails = tel.api_errors > 0 || tel.schema_drift.length > 0 || skipRate >= 5;
  const coaAuditHasWarns = maxDaysStale !== null && maxDaysStale >= 45;
  const coaAuditTable = {
    phase: 2,
    name: 'CoA Ingestion',
    verdict: coaAuditHasFails ? 'FAIL' : coaAuditHasWarns ? 'WARN' : 'PASS',
    rows: coaAuditRows,
  };

  pipeline.emitSummary({
    records_total: totalInserted + totalUpdated,
    records_new: totalInserted,
    records_updated: totalUpdated,
    records_meta: {
      duration_ms: durationMs,
      api_health: {
        api_errors: tel.api_errors,
        avg_req_latency_ms: avgLatency,
        max_req_latency_ms: maxLatency,
      },
      data_health: {
        records_fetched: allRaw.length,
        records_mapped: mapped.length,
        records_skipped: totalSkipped,
        skip_reasons: tel.skip_reasons,
        records_deduplicated: deduplicated.length,
        schema_mismatch_count: tel.schema_drift.length,
        max_days_stale: maxDaysStale,
      },
      audit_table: coaAuditTable,
    },
  });
  pipeline.emitMeta(
    { "CKAN API": ["REFERENCE_FILE#", "STREET_NUM", "STREET_NAME", "WARD", "C_OF_A_DESCISION", "STATUSDESC", "HEARING_DATE", "DESCRIPTION", "CONTACT_NAME", "SUB_TYPE"] },
    { "coa_applications": ["application_number", "address", "street_num", "street_name", "street_name_normalized", "ward", "status", "decision", "decision_date", "hearing_date", "description", "applicant", "sub_type", "data_hash", "first_seen_at", "last_seen_at"] }
  );

  // Show stats
  const stats = await pool.query(`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE decision ILIKE 'approved%') AS approved,
      COUNT(*) FILTER (WHERE linked_permit_num IS NOT NULL) AS linked,
      COUNT(*) FILTER (WHERE decision ILIKE 'approved%' AND linked_permit_num IS NULL AND decision_date >= NOW() - INTERVAL '90 days') AS upcoming
    FROM coa_applications
  `);
  const s = stats.rows[0];
  pipeline.log.info('[load-coa]', `Stats: ${s.total} total | ${s.approved} approved | ${s.linked} linked | ${s.upcoming} upcoming leads`);
  }); // withAdvisoryLock

  if (!lockResult.acquired) return;
});
