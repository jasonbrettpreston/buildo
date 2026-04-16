#!/usr/bin/env node
/**
 * CQA Tier 2: Post-Ingestion Data Bounds Validation
 *
 * Runs SQL-based validation queries against the local database to detect
 * data quality issues after ingestion: cost outliers, null rates, orphaned
 * records, duplicate PKs, and source table row counts and bounds.
 *
 * Usage: node scripts/quality/assert-data-bounds.js
 *
 * Exit 0 = pass (warnings are OK)
 * Exit 1 = fail (errors detected — orphans, duplicates, or critical nulls)
 */
const pipeline = require('../lib/pipeline');

const pool = pipeline.createPool();

const SLUG = 'assert_data_bounds';

// When run from a chain (via run-chain.js), PIPELINE_CHAIN env var is set.
const CHAIN_ID = process.env.PIPELINE_CHAIN || null;

async function count(sql) {
  const res = await pool.query(sql);
  return parseInt(res.rows[0].count, 10);
}

async function run() {
  console.log('\n=== CQA Tier 2: Data Bounds Validation ===\n');

  const startMs = Date.now();
  let runId = null;

  // Skip own pipeline_runs tracking when run from a chain
  if (!CHAIN_ID) {
    try {
      const res = await pool.query(
        `INSERT INTO pipeline_runs (pipeline, started_at, status)
         VALUES ($1, NOW(), 'running') RETURNING id`,
        [SLUG]
      );
      runId = res.rows[0].id;
    } catch (err) {
      pipeline.log.warn('[assert-data-bounds]', `Could not insert pipeline_runs row: ${err.message}`);
    }
  }

  // Determine which checks to run based on chain context.
  // Each chain only validates data relevant to its own sources.
  const runPermitChecks     = !CHAIN_ID || CHAIN_ID === 'permits';
  const runCoaChecks        = !CHAIN_ID || CHAIN_ID === 'coa';
  const runSourceChecks     = !CHAIN_ID || CHAIN_ID === 'sources';
  const runInspectionChecks = !CHAIN_ID || CHAIN_ID === 'deep_scrapes';

  const warnings = [];
  const errors = [];
  let inspectionAuditTable = null;
  let coaAuditTable = null;
  let permitsAuditTable = null;
  let sourcesAuditTable = null;

  try {
    // -----------------------------------------------------------------------
    // Permit-scoped checks (sections 1-4)
    // -----------------------------------------------------------------------
    if (runPermitChecks) {
      // 1. Cost bounds
      const costOutliers = await count(
        `SELECT COUNT(*) FROM permits WHERE est_const_cost < 0 OR est_const_cost > 500000000`
      );
      if (costOutliers >= 20) {
        warnings.push(`${costOutliers} permits with negative cost or > $500M`);
        console.log(`  WARN: ${costOutliers} permits with cost outliers`);
      } else {
        console.log('  OK: Cost bounds — no outliers');
      }

      // 2. Null-rate thresholds (recent batch — last 24h by last_seen_at)
      const recentTotal = await count(
        `SELECT COUNT(*) FROM permits WHERE last_seen_at > NOW() - INTERVAL '1 day'`
      );

      let descNull = 0, descPct = '0.0';
      let builderNull = 0, builderPct = '0.0';
      let statusNull = 0;

      if (recentTotal > 0) {
        descNull = await count(
          `SELECT COUNT(*) FROM permits WHERE last_seen_at > NOW() - INTERVAL '1 day' AND description IS NULL`
        );
        descPct = (descNull / recentTotal * 100).toFixed(1);
        if (descNull / recentTotal > 0.05) {
          warnings.push(`Description null rate ${descPct}% (${descNull}/${recentTotal})`);
          console.log(`  WARN: Description null rate ${descPct}%`);
        } else {
          console.log(`  OK: Description null rate ${descPct}%`);
        }

        builderNull = await count(
          `SELECT COUNT(*) FROM permits WHERE last_seen_at > NOW() - INTERVAL '1 day' AND builder_name IS NULL`
        );
        builderPct = (builderNull / recentTotal * 100).toFixed(1);
        if (builderNull / recentTotal > 0.95) {
          warnings.push(`Builder name null rate ${builderPct}% (${builderNull}/${recentTotal})`);
          console.log(`  WARN: Builder name null rate ${builderPct}%`);
        } else {
          console.log(`  OK: Builder name null rate ${builderPct}%`);
        }

        statusNull = await count(
          `SELECT COUNT(*) FROM permits WHERE last_seen_at > NOW() - INTERVAL '1 day' AND status IS NULL`
        );
        if (statusNull > 0) {
          warnings.push(`${statusNull} permits with NULL status`);
          console.log(`  WARN: ${statusNull} permits with NULL status`);
        } else {
          console.log('  OK: No NULL status values');
        }
      } else {
        console.log('  SKIP: No recent permits (last 24h) — null rate checks skipped');
      }

      // 3. Referential audits
      const orphanTrades = await count(
        `SELECT COUNT(*) FROM permit_trades pt
         LEFT JOIN permits p ON p.permit_num = pt.permit_num AND p.revision_num = pt.revision_num
         WHERE p.permit_num IS NULL`
      );
      if (orphanTrades > 0) {
        errors.push(`${orphanTrades} orphaned permit_trades rows`);
        console.error(`  FAIL: ${orphanTrades} orphaned permit_trades rows`);
      } else {
        console.log('  OK: No orphaned permit_trades');
      }

      const orphanParcels = await count(
        `SELECT COUNT(*) FROM permit_parcels pp
         LEFT JOIN permits p ON p.permit_num = pp.permit_num AND p.revision_num = pp.revision_num
         WHERE p.permit_num IS NULL`
      );
      if (orphanParcels > 0) {
        errors.push(`${orphanParcels} orphaned permit_parcels rows`);
        console.error(`  FAIL: ${orphanParcels} orphaned permit_parcels rows`);
      } else {
        console.log('  OK: No orphaned permit_parcels');
      }

      // 4. Duplicate PK check
      const dupes = await count(
        `SELECT COUNT(*) FROM (
           SELECT permit_num, revision_num FROM permits
           GROUP BY permit_num, revision_num HAVING COUNT(*) > 1
         ) d`
      );
      if (dupes > 0) {
        errors.push(`${dupes} duplicate (permit_num, revision_num) groups`);
        console.error(`  FAIL: ${dupes} duplicate PK groups`);
      } else {
        console.log('  OK: No duplicate PKs');
      }

      // Build permits audit_table
      const permitAuditRows = [
        { metric: 'cost_outliers', value: costOutliers, threshold: '< 20', status: costOutliers >= 20 ? 'WARN' : 'PASS' },
        ...(recentTotal > 0 ? [
          { metric: 'null_descriptions_24h', value: `${descPct}%`, threshold: '< 5%', status: (descNull / recentTotal > 0.05) ? 'WARN' : 'PASS' },
          { metric: 'null_builders_24h', value: `${builderPct}%`, threshold: '< 95%', status: (builderNull / recentTotal > 0.95) ? 'WARN' : 'PASS' },
          { metric: 'null_status_24h', value: statusNull, threshold: '== 0', status: statusNull > 0 ? 'WARN' : 'PASS' },
        ] : []),
        { metric: 'orphaned_permit_trades', value: orphanTrades, threshold: '== 0', status: orphanTrades > 0 ? 'FAIL' : 'PASS' },
        { metric: 'orphaned_permit_parcels', value: orphanParcels, threshold: '== 0', status: orphanParcels > 0 ? 'FAIL' : 'PASS' },
        { metric: 'duplicate_pk_groups', value: dupes, threshold: '== 0', status: dupes > 0 ? 'FAIL' : 'PASS' },
      ];
      const permitHasFails = permitAuditRows.some((r) => r.status === 'FAIL');
      const permitHasWarns = permitAuditRows.some((r) => r.status === 'WARN');
      permitsAuditTable = {
        phase: 15,
        name: 'Data Quality Checks',
        verdict: permitHasFails ? 'FAIL' : permitHasWarns ? 'WARN' : 'PASS',
        rows: permitAuditRows,
      };
    }

    // -----------------------------------------------------------------------
    // CoA-scoped checks
    // -----------------------------------------------------------------------
    if (runCoaChecks) {
      const coaAuditRows = [];

      const orphanCoa = await count(
        `SELECT COUNT(*) FROM coa_applications ca
         WHERE ca.linked_permit_num IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM permits p WHERE p.permit_num = ca.linked_permit_num)`
      );
      coaAuditRows.push({ metric: 'orphan_link_count', value: orphanCoa, threshold: '== 0', status: orphanCoa > 0 ? 'FAIL' : 'PASS' });
      if (orphanCoa > 0) {
        errors.push(`${orphanCoa} orphaned coa_applications linked_permit_num`);
        console.error(`  FAIL: ${orphanCoa} orphaned coa linked_permit_num`);
      } else {
        console.log('  OK: No orphaned CoA links');
      }

      const nullAddress = await count(
        `SELECT COUNT(*) FROM coa_applications WHERE address IS NULL OR TRIM(address) = ''`
      );
      coaAuditRows.push({ metric: 'null_address', value: nullAddress, threshold: '< 10', status: nullAddress >= 10 ? 'WARN' : 'PASS' });
      if (nullAddress >= 10) {
        warnings.push(`${nullAddress} coa_applications with NULL/empty address`);
        console.log(`  WARN: ${nullAddress} coa_applications with NULL address`);
      } else {
        console.log(`  OK: CoA NULL addresses within baseline (${nullAddress})`);
      }

      const nullAppNum = await count(
        `SELECT COUNT(*) FROM coa_applications WHERE application_number IS NULL OR TRIM(application_number) = ''`
      );
      coaAuditRows.push({ metric: 'null_app_num', value: nullAppNum, threshold: '== 0', status: nullAppNum > 0 ? 'FAIL' : 'PASS' });
      if (nullAppNum > 0) {
        errors.push(`${nullAppNum} coa_applications with NULL application_number`);
        console.error(`  FAIL: ${nullAppNum} coa_applications with NULL application_number`);
      } else {
        console.log('  OK: No NULL CoA application numbers');
      }

      const futureHearing = await count(
        `SELECT COUNT(*) FROM coa_applications WHERE hearing_date > CURRENT_DATE + INTERVAL '2 years'`
      );
      coaAuditRows.push({ metric: 'future_hearing', value: futureHearing, threshold: '== 0', status: futureHearing > 0 ? 'FAIL' : 'PASS' });
      if (futureHearing > 0) {
        errors.push(`${futureHearing} coa_applications with hearing_date > 2 years in future`);
        console.error(`  FAIL: ${futureHearing} coa_applications with future hearing dates`);
      } else {
        console.log('  OK: No future hearing dates beyond 2 years');
      }

      const ancientHearing = await count(
        `SELECT COUNT(*) FROM coa_applications WHERE hearing_date < '2010-01-01'`
      );
      coaAuditRows.push({ metric: 'ancient_hearing', value: ancientHearing, threshold: '< 5', status: ancientHearing >= 5 ? 'WARN' : 'PASS' });
      if (ancientHearing >= 5) {
        warnings.push(`${ancientHearing} coa_applications with hearing_date before 2010`);
        console.log(`  WARN: ${ancientHearing} coa_applications with ancient hearing dates`);
      } else {
        console.log(`  OK: Ancient hearing dates within baseline (${ancientHearing})`);
      }

      // Emit CoA audit_table
      const coaHasFails = coaAuditRows.some((r) => r.status === 'FAIL');
      const coaHasWarns = coaAuditRows.some((r) => r.status === 'WARN');
      coaAuditTable = {
        phase: 8,
        name: 'CoA Data Quality',
        verdict: coaHasFails ? 'FAIL' : coaHasWarns ? 'WARN' : 'PASS',
        rows: coaAuditRows,
      };
    }

    // -----------------------------------------------------------------------
    // Source-scoped checks (sections 5-8)
    // -----------------------------------------------------------------------
    if (runSourceChecks) {
      // 5. address_points
      const apCount = await count(`SELECT COUNT(*) FROM address_points`);
      if (apCount === 0) {
        errors.push('address_points table is empty');
        console.error('  FAIL: address_points table is empty');
      } else {
        console.log(`  OK: address_points has ${apCount.toLocaleString()} rows`);
      }

      const apDupes = await count(
        `SELECT COUNT(*) FROM (
           SELECT address_point_id FROM address_points
           GROUP BY address_point_id HAVING COUNT(*) > 1
         ) d`
      );
      if (apDupes > 0) {
        errors.push(`${apDupes} duplicate address_point_id groups`);
        console.error(`  FAIL: ${apDupes} duplicate address_point_id groups`);
      } else {
        console.log('  OK: No duplicate address_point_id');
      }

      // 6. parcels
      const parcelCount = await count(`SELECT COUNT(*) FROM parcels`);
      if (parcelCount === 0) {
        errors.push('parcels table is empty');
        console.error('  FAIL: parcels table is empty');
      } else {
        console.log(`  OK: parcels has ${parcelCount.toLocaleString()} rows`);
      }

      const parcelDupes = await count(
        `SELECT COUNT(*) FROM (
           SELECT parcel_id FROM parcels
           GROUP BY parcel_id HAVING COUNT(*) > 1
         ) d`
      );
      if (parcelDupes > 0) {
        errors.push(`${parcelDupes} duplicate parcel_id groups`);
        console.error(`  FAIL: ${parcelDupes} duplicate parcel_id groups`);
      } else {
        console.log('  OK: No duplicate parcel_id');
      }

      const lotOutliers = await count(
        `SELECT COUNT(*) FROM parcels WHERE lot_size_sqm IS NOT NULL AND (lot_size_sqm <= 0 OR lot_size_sqm > 1000000)`
      );
      if (lotOutliers > 0) {
        warnings.push(`${lotOutliers} parcels with lot_size_sqm out of bounds (0-1M sqm)`);
        console.log(`  WARN: ${lotOutliers} parcels with lot size outliers`);
      } else {
        console.log('  OK: Parcel lot sizes within bounds');
      }

      // 7. building_footprints
      const bfCount = await count(`SELECT COUNT(*) FROM building_footprints`);
      if (bfCount === 0) {
        errors.push('building_footprints table is empty');
        console.error('  FAIL: building_footprints table is empty');
      } else {
        console.log(`  OK: building_footprints has ${bfCount.toLocaleString()} rows`);
      }

      const heightOutliers = await count(
        `SELECT COUNT(*) FROM building_footprints WHERE max_height_m IS NOT NULL AND (max_height_m < 0 OR max_height_m > 500)`
      );
      if (heightOutliers > 0) {
        warnings.push(`${heightOutliers} building_footprints with max_height out of bounds (negative or >500m)`);
        console.log(`  WARN: ${heightOutliers} building footprints with height outliers`);
      } else {
        console.log('  OK: Building footprint heights within bounds');
      }

      // 8. neighbourhoods
      const nhoodCount = await count(`SELECT COUNT(*) FROM neighbourhoods`);
      if (nhoodCount < 158) {
        errors.push(`neighbourhoods has ${nhoodCount} rows (expected >= 158)`);
        console.error(`  FAIL: neighbourhoods has ${nhoodCount} rows (expected >= 158)`);
      } else {
        console.log(`  OK: neighbourhoods has ${nhoodCount} rows (>= 158)`);
      }

      const nhoodDupes = await count(
        `SELECT COUNT(*) FROM (
           SELECT neighbourhood_id FROM neighbourhoods
           GROUP BY neighbourhood_id HAVING COUNT(*) > 1
         ) d`
      );
      if (nhoodDupes > 0) {
        errors.push(`${nhoodDupes} duplicate neighbourhood_id groups`);
        console.error(`  FAIL: ${nhoodDupes} duplicate neighbourhood_id groups`);
      } else {
        console.log('  OK: No duplicate neighbourhood_id');
      }

      // Build sources audit_table
      const sourceAuditRows = [
        { metric: 'address_points_count', value: apCount, threshold: '> 0', status: apCount === 0 ? 'FAIL' : 'PASS' },
        { metric: 'address_point_dupes', value: apDupes, threshold: '== 0', status: apDupes > 0 ? 'FAIL' : 'PASS' },
        { metric: 'parcels_count', value: parcelCount, threshold: '> 0', status: parcelCount === 0 ? 'FAIL' : 'PASS' },
        { metric: 'parcel_dupes', value: parcelDupes, threshold: '== 0', status: parcelDupes > 0 ? 'FAIL' : 'PASS' },
        { metric: 'parcel_lot_outliers', value: lotOutliers, threshold: '== 0', status: lotOutliers > 0 ? 'WARN' : 'PASS' },
        { metric: 'building_footprints_count', value: bfCount, threshold: '> 0', status: bfCount === 0 ? 'FAIL' : 'PASS' },
        { metric: 'building_height_outliers', value: heightOutliers, threshold: '== 0', status: heightOutliers > 0 ? 'WARN' : 'PASS' },
        { metric: 'neighbourhoods_count', value: nhoodCount, threshold: '>= 158', status: nhoodCount < 158 ? 'FAIL' : 'PASS' },
        { metric: 'neighbourhood_dupes', value: nhoodDupes, threshold: '== 0', status: nhoodDupes > 0 ? 'FAIL' : 'PASS' },
      ];
      const sourceHasFails = sourceAuditRows.some((r) => r.status === 'FAIL');
      const sourceHasWarns = sourceAuditRows.some((r) => r.status === 'WARN');
      sourcesAuditTable = {
        phase: 14,
        name: 'Sources Data Quality',
        verdict: sourceHasFails ? 'FAIL' : sourceHasWarns ? 'WARN' : 'PASS',
        rows: sourceAuditRows,
      };
    }

    // -----------------------------------------------------------------------
    // WSIB-scoped checks
    // -----------------------------------------------------------------------
    let wsibNoName = 0, wsibNonG = 0, wsibBadNaics = 0, wsibOrphan = 0;
    let wsibChecked = false;

    if (runPermitChecks || runSourceChecks) {
      try {
        const wsibCount = await count(`SELECT COUNT(*) FROM wsib_registry`);
        if (wsibCount > 0) {
          wsibChecked = true;
          console.log(`  OK: wsib_registry has ${wsibCount.toLocaleString()} rows`);

          // All entries should have a legal name
          wsibNoName = await count(
            `SELECT COUNT(*) FROM wsib_registry WHERE legal_name IS NULL OR TRIM(legal_name) = ''`
          );
          if (wsibNoName > 0) {
            errors.push(`${wsibNoName} wsib_registry entries with NULL/empty legal_name`);
            console.error(`  FAIL: ${wsibNoName} wsib_registry entries with no legal name`);
          } else {
            console.log('  OK: All WSIB entries have legal names');
          }

          // All entries should have at least one G class (predominant OR subclass)
          wsibNonG = await count(
            `SELECT COUNT(*) FROM wsib_registry
             WHERE predominant_class NOT LIKE 'G%'
               AND (subclass IS NULL OR subclass NOT LIKE 'G%')`
          );
          if (wsibNonG > 0) {
            errors.push(`${wsibNonG} wsib_registry entries with no G class`);
            console.error(`  FAIL: ${wsibNonG} wsib_registry entries with no G class`);
          } else {
            console.log('  OK: All WSIB entries have at least one G classification');
          }

          // NAICS codes should be numeric strings
          wsibBadNaics = await count(
            `SELECT COUNT(*) FROM wsib_registry WHERE naics_code IS NOT NULL AND naics_code !~ '^[0-9]+$'`
          );
          if (wsibBadNaics > 0) {
            warnings.push(`${wsibBadNaics} wsib_registry entries with non-numeric naics_code`);
            console.warn(`  WARN: ${wsibBadNaics} wsib_registry entries with non-numeric naics_code`);
          } else {
            console.log('  OK: All WSIB NAICS codes are numeric');
          }

          // Orphaned linked_entity_id
          wsibOrphan = await count(
            `SELECT COUNT(*) FROM wsib_registry w
             WHERE w.linked_entity_id IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM entities e WHERE e.id = w.linked_entity_id)`
          );
          if (wsibOrphan > 0) {
            errors.push(`${wsibOrphan} orphaned wsib_registry linked_entity_id`);
            console.error(`  FAIL: ${wsibOrphan} orphaned WSIB entity links`);
          } else {
            console.log('  OK: No orphaned WSIB entity links');
          }
        } else {
          console.log('  SKIP: wsib_registry is empty (not yet loaded)');
        }
      } catch (wsibErr) {
        // Table may not exist yet
        if (wsibErr.message && wsibErr.message.includes('does not exist')) {
          console.log('  SKIP: wsib_registry table does not exist');
        } else {
          errors.push(wsibErr.message);
          console.error(`  ERROR: ${wsibErr.message}`);
        }
      }

      // Append WSIB metrics to the active audit_table so the UI shows them
      if (wsibChecked) {
        const wsibAuditRows = [
          { metric: 'wsib_no_legal_name', value: wsibNoName, threshold: '== 0', status: wsibNoName > 0 ? 'FAIL' : 'PASS' },
          { metric: 'wsib_no_g_class', value: wsibNonG, threshold: '== 0', status: wsibNonG > 0 ? 'FAIL' : 'PASS' },
          { metric: 'wsib_invalid_naics', value: wsibBadNaics, threshold: '== 0', status: wsibBadNaics > 0 ? 'WARN' : 'PASS' },
          { metric: 'wsib_orphaned_links', value: wsibOrphan, threshold: '== 0', status: wsibOrphan > 0 ? 'FAIL' : 'PASS' },
        ];
        const wsibHasFails = wsibAuditRows.some((r) => r.status === 'FAIL');

        if (permitsAuditTable) {
          permitsAuditTable.rows.push(...wsibAuditRows);
          if (wsibHasFails) permitsAuditTable.verdict = 'FAIL';
        }
        if (sourcesAuditTable) {
          sourcesAuditTable.rows.push(...wsibAuditRows);
          if (wsibHasFails) sourcesAuditTable.verdict = 'FAIL';
        }
      }
    }

    // -----------------------------------------------------------------------
    // Inspection-scoped checks (Phase 3: Data Quality)
    // Note: Telemetry checks moved to assert-network-health.js (Phase 2)
    //       Staleness checks moved to assert-staleness.js (Phase 4)
    // -----------------------------------------------------------------------
    if (runInspectionChecks) {
      const auditRows = [];
      try {
        const inspCount = await count(`SELECT COUNT(*) FROM permit_inspections`);
        if (inspCount > 0) {
          console.log(`\n--- Phase 3: Inspection Data Quality (${inspCount.toLocaleString()} rows) ---`);

          // Helper to run a check and record audit row
          function checkInsp(metric, value, threshold, level) {
            const status = level === 'FAIL' ? (value > 0 ? 'FAIL' : 'PASS')
              : level === 'WARN' ? (value > 0 ? 'WARN' : 'PASS')
              : 'INFO';
            auditRows.push({ metric, value, threshold, status });
            if (status === 'FAIL') {
              errors.push(`${value} ${metric}`);
              console.error(`  FAIL: ${metric} = ${value}`);
            } else if (status === 'WARN') {
              warnings.push(`${value} ${metric}`);
              console.log(`  WARN: ${metric} = ${value}`);
            } else {
              console.log(`  PASS: ${metric} = ${value}`);
            }
          }

          // NULL field checks (4 required columns)
          const nullPermitNum = await count(`SELECT COUNT(*) FROM permit_inspections WHERE permit_num IS NULL OR permit_num = ''`);
          checkInsp('null_permit_num', nullPermitNum, '== 0', 'FAIL');

          const nullStageName = await count(`SELECT COUNT(*) FROM permit_inspections WHERE stage_name IS NULL OR stage_name = ''`);
          checkInsp('null_stage_name', nullStageName, '== 0', 'FAIL');

          const nullStatus = await count(`SELECT COUNT(*) FROM permit_inspections WHERE status IS NULL OR status = ''`);
          checkInsp('null_status', nullStatus, '== 0', 'FAIL');

          const nullScrapedAt = await count(`SELECT COUNT(*) FROM permit_inspections WHERE scraped_at IS NULL`);
          checkInsp('null_scraped_at', nullScrapedAt, '== 0', 'FAIL');

          // Orphaned permit_num (not in permits table)
          const orphanInsp = await count(
            `SELECT COUNT(*) FROM permit_inspections pi
             WHERE NOT EXISTS (SELECT 1 FROM permits p WHERE p.permit_num = pi.permit_num)`
          );
          checkInsp('orphan_inspections', orphanInsp, '== 0', 'FAIL');

          // Invalid status values
          const badStatus = await count(
            `SELECT COUNT(*) FROM permit_inspections
             WHERE status NOT IN ('Outstanding', 'Passed', 'Not Passed', 'Partial')`
          );
          checkInsp('invalid_status', badStatus, '== 0', 'FAIL');

          // Date logic
          const outstandingWithDate = await count(
            `SELECT COUNT(*) FROM permit_inspections
             WHERE status = 'Outstanding' AND inspection_date IS NOT NULL`
          );
          checkInsp('outstanding_with_date', outstandingWithDate, '== 0', 'WARN');

          const completedNoDate = await count(
            `SELECT COUNT(*) FROM permit_inspections
             WHERE status != 'Outstanding' AND inspection_date IS NULL`
          );
          checkInsp('completed_without_date', completedNoDate, '== 0', 'WARN');

          // Duplicate (permit_num, stage_name)
          const inspDupes = await count(
            `SELECT COUNT(*) FROM (
               SELECT permit_num, stage_name FROM permit_inspections
               GROUP BY permit_num, stage_name HAVING COUNT(*) > 1
             ) d`
          );
          checkInsp('duplicate_stages', inspDupes, '== 0', 'FAIL');

          // Future inspection dates
          const futureDates = await count(
            `SELECT COUNT(*) FROM permit_inspections WHERE inspection_date > CURRENT_DATE`
          );
          checkInsp('future_dates', futureDates, '== 0', 'FAIL');

          // Ancient dates (before 2020 — rare but legitimate for long-lived permits)
          const ancientDates = await count(
            `SELECT COUNT(*) FROM permit_inspections WHERE inspection_date < '2020-01-01'`
          );
          checkInsp('ancient_dates', ancientDates, '<= 5', 'WARN');

          // Date before permit year
          const dateBeforePermit = await count(
            `SELECT COUNT(*) FROM permit_inspections
             WHERE inspection_date IS NOT NULL
               AND EXTRACT(YEAR FROM inspection_date) < (2000 + SUBSTRING(permit_num FROM '^[0-9]{2}')::int)`
          );
          checkInsp('date_before_permit_year', dateBeforePermit, '== 0', 'FAIL');

        } else {
          console.log('  SKIP: permit_inspections is empty (not yet scraped)');
        }
      } catch (inspErr) {
        if (inspErr.message && inspErr.message.includes('does not exist')) {
          console.log('  SKIP: permit_inspections table does not exist');
        } else {
          errors.push(inspErr.message);
          console.error(`  ERROR: ${inspErr.message}`);
        }
      }

      // Emit inspection audit_table in records_meta
      if (auditRows.length > 0) {
        const hasFails = auditRows.some((r) => r.status === 'FAIL');
        const hasWarns = auditRows.some((r) => r.status === 'WARN');
        inspectionAuditTable = {
          phase: 3,
          name: 'Data Quality',
          verdict: hasFails ? 'FAIL' : hasWarns ? 'WARN' : 'PASS',
          rows: auditRows,
        };
      }
    }

    // -----------------------------------------------------------------------
    // Cost estimates & timing calibration checks (permits chain only)
    // -----------------------------------------------------------------------
    if (runPermitChecks) {
      console.log('\n--- Cost Estimates Coverage ---');
      try {
        const ceTotal = await count(`SELECT COUNT(*) FROM cost_estimates`);
        const ceNull = await count(`SELECT COUNT(*) FROM cost_estimates WHERE estimated_cost IS NULL`);
        const ceTiers = await pool.query(`SELECT COUNT(DISTINCT cost_tier) as tiers FROM cost_estimates WHERE cost_tier IS NOT NULL`);
        const tierCount = parseInt(ceTiers.rows[0].tiers, 10);
        if (ceTotal === 0) {
          warnings.push('cost_estimates table is empty — compute_cost_estimates has not run yet');
          console.warn('  WARN: cost_estimates table is empty');
        } else {
          const nullPct = ((ceNull / ceTotal) * 100).toFixed(1);
          console.log(`  OK: ${ceTotal} cost estimates (${nullPct}% null, ${tierCount} distinct tiers)`);
          if (ceNull / ceTotal > 0.80) {
            warnings.push(`cost_estimates NULL rate is ${nullPct}% (> 80%)`);
            console.warn(`  WARN: ${nullPct}% of cost estimates have NULL estimated_cost`);
          }
          if (tierCount < 2) {
            warnings.push(`cost_estimates has only ${tierCount} distinct tier(s) — expected >= 2`);
            console.warn(`  WARN: Only ${tierCount} distinct cost tier(s)`);
          }
        }
      } catch (ceErr) {
        console.log(`  SKIP: cost_estimates check failed: ${ceErr.message}`);
      }

      console.log('\n--- Timing Calibration Coverage (legacy v1 — check retained for now) ---');
      // WF3 2026-04-13: v1 (compute_timing_calibration) was REMOVED from the
      // permits chain. The `timing_calibration` table is no longer kept fresh
      // by any chain step. It is still read by spec 71 detail-page timing
      // (src/features/leads/lib/timing.ts); that engine will be migrated to
      // `phase_calibration` in a future frontend WF. Until then this check
      // will fire stale warnings — that's intentional ops signal, not noise.
      try {
        const tcRes = await pool.query(
          `SELECT COUNT(*) as total,
                  MIN(sample_size) as min_sample,
                  EXTRACT(EPOCH FROM (NOW() - MAX(computed_at))) / 3600.0 as freshness_hours
           FROM timing_calibration`
        );
        const tc = tcRes.rows[0];
        const tcTotal = parseInt(tc.total, 10);
        const tcMinSample = parseInt(tc.min_sample, 10) || 0;
        const tcFreshness = tc.freshness_hours !== null ? parseFloat(tc.freshness_hours) : null;
        if (tcTotal === 0) {
          warnings.push('timing_calibration table is empty — compute_timing_calibration has not run yet');
          console.warn('  WARN: timing_calibration table is empty');
        } else {
          console.log(`  OK: ${tcTotal} permit_types calibrated (min sample=${tcMinSample}, freshness=${tcFreshness !== null ? tcFreshness.toFixed(1) + 'h' : 'N/A'})`);
          if (tcMinSample < 5) {
            errors.push(`timing_calibration has rows with sample_size < 5 (min=${tcMinSample}) — HAVING clause should prevent this`);
            console.error(`  FAIL: sample_size < 5 found (min=${tcMinSample})`);
          }
          if (tcFreshness !== null && tcFreshness > 48) {
            // Check if permit_inspections has data — staleness only matters if scraper has run
            try {
              const piCount = await count(`SELECT COUNT(*) FROM permit_inspections`);
              if (piCount > 0) {
                warnings.push(`timing_calibration is ${tcFreshness.toFixed(0)}h stale (> 48h threshold)`);
                console.warn(`  WARN: timing_calibration last computed ${tcFreshness.toFixed(0)}h ago`);
              }
            } catch (piErr) {
              console.log(`  SKIP: permit_inspections staleness check: ${piErr.message}`);
            }
          }
        }
      } catch (tcErr) {
        console.log(`  SKIP: timing_calibration check failed: ${tcErr.message}`);
      }
    } // end runPermitChecks cost/timing checks

    // Ghost record detection — permits the City silently dropped from CKAN
    if (runPermitChecks) {
    console.log('\n--- Ghost Records (stale > 30 days) ---');
    try {
      const ghostRes = await pool.query(
        `SELECT COUNT(*) AS count, MIN(last_seen_at) AS oldest
         FROM permits
         WHERE last_seen_at < CURRENT_DATE - INTERVAL '30 days'
           AND lifecycle_phase IS NOT NULL
           AND lifecycle_phase NOT IN ('P19', 'P20')`
      );
      const ghostCount = parseInt(ghostRes.rows[0].count, 10);
      if (ghostCount > 0) {
        const oldest = ghostRes.rows[0].oldest;
        warnings.push(`${ghostCount} non-terminal permits not seen in 30+ days (oldest: ${oldest})`);
        console.warn(`  WARN: ${ghostCount} ghost permits (non-terminal, unseen 30+ days) — oldest last_seen_at: ${oldest}`);
        // Push into audit table so the dashboard reflects the warning (not just console)
        if (permitsAuditTable) {
          permitsAuditTable.rows.push({
            metric: 'ghost_permits_30d', value: ghostCount,
            threshold: '== 0', status: 'WARN',
          });
          if (permitsAuditTable.verdict === 'PASS') permitsAuditTable.verdict = 'WARN';
        }
      } else {
        console.log('  OK: No ghost records (all permits seen within 30 days)');
      }
    } catch (ghostErr) {
      // Non-fatal — last_seen_at column may not exist
      console.log(`  SKIP: Ghost record check failed: ${ghostErr.message}`);
    }
    } // end runPermitChecks ghost check

  } catch (err) {
    errors.push(err.message);
    console.error(`  ERROR: ${err.message}`);
  }

  const durationMs = Date.now() - startMs;
  const hasErrors = errors.length > 0;
  const status = hasErrors ? 'failed' : 'completed';
  const allMessages = [...errors, ...warnings.map((w) => `WARN: ${w}`)];
  const errorMsg = allMessages.length > 0 ? allMessages.join('; ') : null;
  const metaObj = {
    checks_passed: allMessages.length === 0 ? 'all' : undefined,
    checks_failed: errors.length,
    checks_warned: warnings.length,
    errors: errors.length > 0 ? errors : undefined,
    warnings: warnings.length > 0 ? warnings : undefined,
    // Chain-aware: only emit the relevant audit_table for the current chain (exclusive)
    ...(() => {
      if (CHAIN_ID === 'permits' && permitsAuditTable) return { audit_table: permitsAuditTable };
      if (CHAIN_ID === 'sources' && sourcesAuditTable) return { audit_table: sourcesAuditTable };
      if (CHAIN_ID === 'deep_scrapes' && inspectionAuditTable) return { audit_table: inspectionAuditTable };
      if (CHAIN_ID === 'coa' && coaAuditTable) return { audit_table: coaAuditTable };
      // Standalone (no chain) — prefer permits if available
      if (permitsAuditTable) return { audit_table: permitsAuditTable };
      if (sourcesAuditTable) return { audit_table: sourcesAuditTable };
      if (coaAuditTable) return { audit_table: coaAuditTable };
      if (inspectionAuditTable) return { audit_table: inspectionAuditTable };
      return {};
    })(),
  };
  const meta = JSON.stringify(metaObj);

  if (runId) {
    await pool.query(
      `UPDATE pipeline_runs
       SET completed_at = NOW(), status = $1, duration_ms = $2, error_message = $3,
           records_meta = $5
       WHERE id = $4`,
      [status, durationMs, errorMsg, runId, meta]
    ).catch((err) => pipeline.log.warn('[assert-data-bounds]', `pipeline_runs UPDATE failed: ${err.message}`));
  }

  // Always emit PIPELINE_SUMMARY so chain orchestrator can capture records_meta
  pipeline.emitSummary({ records_total: 0, records_new: null, records_updated: null, records_meta: JSON.parse(meta) });
  console.log('PIPELINE_META:' + JSON.stringify({ reads: { "permits": ["*"], "parcels": ["*"], "address_points": ["*"], "building_footprints": ["*"], "neighbourhoods": ["*"], "coa_applications": ["*"], "permit_inspections": ["*"] }, writes: { "pipeline_runs": ["checks_passed", "checks_failed", "checks_warned"] } }));

  if (warnings.length > 0) {
    console.log(`\n  Warnings: ${warnings.length}`);
  }
  if (errors.length > 0) {
    console.log(`  Errors: ${errors.length}`);
  }

  console.log(`\n=== Data Bounds: ${status.toUpperCase()} (${(durationMs / 1000).toFixed(1)}s) ===\n`);

  await pool.end();

  if (hasErrors) process.exit(1);
}

run().catch((err) => {
  console.error('Data bounds validation error:', err);
  pool.end().catch((endErr) => pipeline.log.warn('[assert-data-bounds]', `pool.end failed: ${endErr.message}`));
  process.exit(1);
});
