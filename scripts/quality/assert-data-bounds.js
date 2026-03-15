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
      console.warn('Could not insert pipeline_runs row:', err.message);
    }
  }

  // Determine which checks to run based on chain context.
  // Each chain only validates data relevant to its own sources.
  const runPermitChecks = !CHAIN_ID || CHAIN_ID === 'permits';
  const runCoaChecks    = !CHAIN_ID || CHAIN_ID === 'coa';
  const runSourceChecks = !CHAIN_ID || CHAIN_ID === 'sources';

  const warnings = [];
  const errors = [];

  try {
    // -----------------------------------------------------------------------
    // Permit-scoped checks (sections 1-4)
    // -----------------------------------------------------------------------
    if (runPermitChecks) {
      // 1. Cost bounds
      const costOutliers = await count(
        `SELECT COUNT(*) FROM permits WHERE est_const_cost < 0 OR est_const_cost > 500000000`
      );
      if (costOutliers > 0) {
        warnings.push(`${costOutliers} permits with negative cost or > $500M`);
        console.log(`  WARN: ${costOutliers} permits with cost outliers`);
      } else {
        console.log('  OK: Cost bounds — no outliers');
      }

      // 2. Null-rate thresholds (recent batch — last 24h by last_seen_at)
      const recentTotal = await count(
        `SELECT COUNT(*) FROM permits WHERE last_seen_at > NOW() - INTERVAL '1 day'`
      );

      if (recentTotal > 0) {
        const descNull = await count(
          `SELECT COUNT(*) FROM permits WHERE last_seen_at > NOW() - INTERVAL '1 day' AND description IS NULL`
        );
        const descPct = (descNull / recentTotal * 100).toFixed(1);
        if (descNull / recentTotal > 0.05) {
          warnings.push(`Description null rate ${descPct}% (${descNull}/${recentTotal})`);
          console.log(`  WARN: Description null rate ${descPct}%`);
        } else {
          console.log(`  OK: Description null rate ${descPct}%`);
        }

        const builderNull = await count(
          `SELECT COUNT(*) FROM permits WHERE last_seen_at > NOW() - INTERVAL '1 day' AND builder_name IS NULL`
        );
        const builderPct = (builderNull / recentTotal * 100).toFixed(1);
        if (builderNull / recentTotal > 0.20) {
          warnings.push(`Builder name null rate ${builderPct}% (${builderNull}/${recentTotal})`);
          console.log(`  WARN: Builder name null rate ${builderPct}%`);
        } else {
          console.log(`  OK: Builder name null rate ${builderPct}%`);
        }

        const statusNull = await count(
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
    }

    // -----------------------------------------------------------------------
    // CoA-scoped checks
    // -----------------------------------------------------------------------
    if (runCoaChecks) {
      const orphanCoa = await count(
        `SELECT COUNT(*) FROM coa_applications ca
         WHERE ca.linked_permit_num IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM permits p WHERE p.permit_num = ca.linked_permit_num)`
      );
      if (orphanCoa > 0) {
        errors.push(`${orphanCoa} orphaned coa_applications linked_permit_num`);
        console.error(`  FAIL: ${orphanCoa} orphaned coa linked_permit_num`);
      } else {
        console.log('  OK: No orphaned CoA links');
      }
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
        `SELECT COUNT(*) FROM building_footprints WHERE max_height_m IS NOT NULL AND (max_height_m <= 0 OR max_height_m > 500)`
      );
      if (heightOutliers > 0) {
        warnings.push(`${heightOutliers} building_footprints with max_height out of bounds (0-500m)`);
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
    }

    // -----------------------------------------------------------------------
    // WSIB-scoped checks
    // -----------------------------------------------------------------------
    if (runPermitChecks || runSourceChecks) {
      try {
        const wsibCount = await count(`SELECT COUNT(*) FROM wsib_registry`);
        if (wsibCount > 0) {
          console.log(`  OK: wsib_registry has ${wsibCount.toLocaleString()} rows`);

          // All entries should have a legal name
          const wsibNoName = await count(
            `SELECT COUNT(*) FROM wsib_registry WHERE legal_name IS NULL OR TRIM(legal_name) = ''`
          );
          if (wsibNoName > 0) {
            errors.push(`${wsibNoName} wsib_registry entries with NULL/empty legal_name`);
            console.error(`  FAIL: ${wsibNoName} wsib_registry entries with no legal name`);
          } else {
            console.log('  OK: All WSIB entries have legal names');
          }

          // All entries should have at least one G class (predominant OR subclass)
          const wsibNonG = await count(
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
          const wsibBadNaics = await count(
            `SELECT COUNT(*) FROM wsib_registry WHERE naics_code IS NOT NULL AND naics_code !~ '^[0-9]+$'`
          );
          if (wsibBadNaics > 0) {
            warnings.push(`${wsibBadNaics} wsib_registry entries with non-numeric naics_code`);
            console.warn(`  WARN: ${wsibBadNaics} wsib_registry entries with non-numeric naics_code`);
          } else {
            console.log('  OK: All WSIB NAICS codes are numeric');
          }

          // Orphaned linked_entity_id
          const wsibOrphan = await count(
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
    }

    // -----------------------------------------------------------------------
    // Inspection-scoped checks
    // -----------------------------------------------------------------------
    {
      try {
        const inspCount = await count(`SELECT COUNT(*) FROM permit_inspections`);
        if (inspCount > 0) {
          console.log(`  OK: permit_inspections has ${inspCount.toLocaleString()} rows`);

          // Orphaned permit_num (not in permits table)
          const orphanInsp = await count(
            `SELECT COUNT(*) FROM permit_inspections pi
             WHERE NOT EXISTS (SELECT 1 FROM permits p WHERE p.permit_num = pi.permit_num)`
          );
          if (orphanInsp > 0) {
            errors.push(`${orphanInsp} orphaned permit_inspections rows (permit_num not in permits)`);
            console.error(`  FAIL: ${orphanInsp} orphaned permit_inspections rows`);
          } else {
            console.log('  OK: No orphaned permit_inspections');
          }

          // Invalid status values
          const badStatus = await count(
            `SELECT COUNT(*) FROM permit_inspections
             WHERE status NOT IN ('Outstanding', 'Passed', 'Not Passed', 'Partial')`
          );
          if (badStatus > 0) {
            errors.push(`${badStatus} permit_inspections with invalid status value`);
            console.error(`  FAIL: ${badStatus} invalid inspection status values`);
          } else {
            console.log('  OK: All inspection status values valid');
          }

          // Date logic: Outstanding should have null date, non-Outstanding should have date
          const outstandingWithDate = await count(
            `SELECT COUNT(*) FROM permit_inspections
             WHERE status = 'Outstanding' AND inspection_date IS NOT NULL`
          );
          if (outstandingWithDate > 0) {
            warnings.push(`${outstandingWithDate} Outstanding inspections with a date (unexpected)`);
            console.log(`  WARN: ${outstandingWithDate} Outstanding inspections have dates`);
          } else {
            console.log('  OK: No Outstanding inspections with dates');
          }

          const completedNoDate = await count(
            `SELECT COUNT(*) FROM permit_inspections
             WHERE status != 'Outstanding' AND inspection_date IS NULL`
          );
          if (completedNoDate > 0) {
            warnings.push(`${completedNoDate} completed inspections missing date`);
            console.log(`  WARN: ${completedNoDate} completed inspections have no date`);
          } else {
            console.log('  OK: All completed inspections have dates');
          }

          // Duplicate (permit_num, stage_name) — should be impossible with UNIQUE constraint
          const inspDupes = await count(
            `SELECT COUNT(*) FROM (
               SELECT permit_num, stage_name FROM permit_inspections
               GROUP BY permit_num, stage_name HAVING COUNT(*) > 1
             ) d`
          );
          if (inspDupes > 0) {
            errors.push(`${inspDupes} duplicate (permit_num, stage_name) groups`);
            console.error(`  FAIL: ${inspDupes} duplicate inspection stage groups`);
          } else {
            console.log('  OK: No duplicate inspection stages');
          }

          // --- Check 1: Coverage rate by permit type ---
          console.log('\n  --- Inspection Coverage & Staleness ---');
          const TARGET_TYPES = [
            'Small Residential Projects', 'Building Additions/Alterations',
            'New Houses', 'Plumbing(PS)', 'Residential Building Permit',
          ];
          const coverageRes = await pool.query(
            `SELECT p.permit_type,
                    COUNT(DISTINCT p.permit_num) AS total,
                    COUNT(DISTINCT pi.permit_num) AS scraped
             FROM permits p
             LEFT JOIN permit_inspections pi ON pi.permit_num = p.permit_num
             WHERE p.status = 'Inspection' AND p.permit_type = ANY($1)
             GROUP BY p.permit_type`,
            [TARGET_TYPES]
          );
          // Determine overall coverage phase: if <5% scraped across all types, we're in early ramp-up
          const totalTarget = coverageRes.rows.reduce((s, r) => s + parseInt(r.total), 0);
          const totalScraped = coverageRes.rows.reduce((s, r) => s + parseInt(r.scraped), 0);
          const isEarlyPhase = totalTarget > 0 && (totalScraped / totalTarget) < 0.05;

          for (const row of coverageRes.rows) {
            if (parseInt(row.scraped) === 0) {
              if (isEarlyPhase) {
                // During early ramp-up, 0-scraped types are expected — warn, don't fail
                warnings.push(`${row.permit_type}: 0 permits scraped (early coverage phase)`);
                console.log(`  WARN: ${row.permit_type} has 0 scraped permits (early phase — not blocking)`);
              } else {
                errors.push(`${row.permit_type}: 0 permits scraped (AIC portal may have changed)`);
                console.error(`  FAIL: ${row.permit_type} has 0 scraped permits`);
              }
            } else {
              const pct = (100 * parseInt(row.scraped) / parseInt(row.total)).toFixed(1);
              console.log(`  OK: ${row.permit_type}: ${row.scraped}/${row.total} scraped (${pct}%)`);
            }
          }

          // --- Check 2: Scrape staleness ---
          const staleRes = await pool.query(
            `SELECT COUNT(*) AS total,
                    COUNT(*) FILTER (WHERE pi.scraped_at IS NULL OR pi.scraped_at < NOW() - INTERVAL '30 days') AS stale
             FROM permits p
             LEFT JOIN (SELECT DISTINCT ON (permit_num) permit_num, scraped_at
                        FROM permit_inspections ORDER BY permit_num, scraped_at DESC) pi
               ON pi.permit_num = p.permit_num
             WHERE p.status = 'Inspection' AND p.permit_type = ANY($1)`,
            [TARGET_TYPES]
          );
          const staleTotal = parseInt(staleRes.rows[0].total);
          const staleCount = parseInt(staleRes.rows[0].stale);
          const stalePct = staleTotal > 0 ? (100 * staleCount / staleTotal).toFixed(1) : '0';
          if (staleTotal > 0 && staleCount / staleTotal > 0.99) {
            // >99% stale is expected early (only scraped ~100 of 104K) — just log
            console.log(`  OK: ${stalePct}% stale (${staleCount.toLocaleString()}/${staleTotal.toLocaleString()}) — early coverage phase`);
          } else if (staleTotal > 0 && staleCount / staleTotal > 0.50) {
            warnings.push(`${stalePct}% of inspection permits are stale (>30 days since scrape)`);
            console.log(`  WARN: ${stalePct}% stale — scrape batches may not be keeping up`);
          } else {
            console.log(`  OK: ${stalePct}% stale (${staleCount.toLocaleString()}/${staleTotal.toLocaleString()})`);
          }

          // --- Check 3: Suspiciously thin data (only 1 Outstanding stage) ---
          const thinPermits = await count(
            `SELECT COUNT(*) FROM (
               SELECT permit_num FROM permit_inspections
               GROUP BY permit_num
               HAVING COUNT(*) = 1 AND COUNT(*) FILTER (WHERE status = 'Outstanding') = 1
             ) t`
          );
          if (thinPermits > inspCount * 0.3) {
            warnings.push(`${thinPermits} permits have only 1 Outstanding stage (${(100 * thinPermits / inspCount).toFixed(0)}% — suspiciously thin)`);
            console.log(`  WARN: ${thinPermits} permits with only 1 Outstanding stage`);
          } else {
            console.log(`  OK: ${thinPermits} permits with single Outstanding stage (normal)`);
          }

          // --- Check 4: Stage count per permit (>20 = anomaly) ---
          const highStagePermits = await count(
            `SELECT COUNT(*) FROM (
               SELECT permit_num FROM permit_inspections
               GROUP BY permit_num HAVING COUNT(*) > 20
             ) h`
          );
          if (highStagePermits > 0) {
            warnings.push(`${highStagePermits} permits have >20 inspection stages (possible duplication)`);
            console.log(`  WARN: ${highStagePermits} permits with >20 stages`);
          } else {
            console.log('  OK: No permits with >20 stages');
          }

          // --- Check 5: Future inspection dates ---
          const futureDates = await count(
            `SELECT COUNT(*) FROM permit_inspections WHERE inspection_date > CURRENT_DATE`
          );
          if (futureDates > 0) {
            errors.push(`${futureDates} inspections with future dates`);
            console.error(`  FAIL: ${futureDates} inspections have future dates`);
          } else {
            console.log('  OK: No future inspection dates');
          }

          // --- Check 6: Date before permit year ---
          const dateBeforePermit = await count(
            `SELECT COUNT(*) FROM permit_inspections
             WHERE inspection_date IS NOT NULL
               AND EXTRACT(YEAR FROM inspection_date) < (2000 + SUBSTRING(permit_num FROM '^[0-9]{2}')::int)`
          );
          if (dateBeforePermit > 0) {
            errors.push(`${dateBeforePermit} inspections with date before permit year`);
            console.error(`  FAIL: ${dateBeforePermit} inspections dated before their permit year`);
          } else {
            console.log('  OK: No inspection dates before permit year');
          }

          // --- Check 7: Scraper telemetry (from latest scraper run) ---
          console.log('\n  --- Scraper Telemetry ---');
          try {
            const lastRun = await pool.query(
              `SELECT records_updated, records_meta FROM pipeline_runs
               WHERE (pipeline = 'inspections' OR pipeline LIKE '%:inspections')
                 AND status = 'completed'
               ORDER BY started_at DESC LIMIT 1`
            );
            const row = lastRun.rows[0];
            const statusChanges = row?.records_updated ?? 0;
            const scTel = row?.records_meta?.scraper_telemetry;

            if (statusChanges > 0) {
              console.log(`  INFO: ${statusChanges} inspection stages changed status in last scrape run`);
            } else {
              console.log('  OK: No status changes in last scrape run');
            }

            if (scTel) {
              // Proxy configuration
              if (scTel.proxy_configured === false) {
                warnings.push('Scraper ran without proxy — WAF likely blocking direct connections');
                console.log('  WARN: No proxy configured — running direct');
              }

              // Proxy errors with breakdown
              if (scTel.proxy_errors > 0) {
                const cats = scTel.error_categories || {};
                const breakdown = Object.entries(cats).map(([k, v]) => `${k}:${v}`).join(', ');
                warnings.push(`Scraper had ${scTel.proxy_errors} proxy errors (${breakdown || 'unclassified'})`);
                console.log(`  WARN: ${scTel.proxy_errors} proxy errors — ${breakdown || 'unclassified'}`);
                if (scTel.last_error) {
                  console.log(`  WARN: Last error: ${scTel.last_error}`);
                }
              } else {
                console.log('  OK: No proxy errors');
              }

              // Schema drift
              if (scTel.schema_drift && scTel.schema_drift.length > 0) {
                errors.push(`AIC API schema drift detected: ${scTel.schema_drift.join('; ')}`);
                console.error(`  FAIL: Schema drift — ${scTel.schema_drift.join('; ')}`);
              } else {
                console.log('  OK: No API schema drift');
              }

              // WAF trap
              if (scTel.consecutive_empty_max >= 20) {
                warnings.push(`WAF trap triggered (${scTel.consecutive_empty_max} consecutive empty responses)`);
                console.log(`  WARN: WAF trap triggered — ${scTel.session_bootstraps || 0} session re-bootstraps`);
              } else {
                console.log(`  OK: Max consecutive empty: ${scTel.consecutive_empty_max || 0}`);
              }

              // Session failures
              if (scTel.session_failures > 0) {
                warnings.push(`${scTel.session_failures} session refresh/bootstrap failures`);
                console.log(`  WARN: ${scTel.session_failures} session failures`);
              }

              // Latency
              if (scTel.latency) {
                console.log(`  INFO: Latency p50=${scTel.latency.p50}ms p95=${scTel.latency.p95}ms max=${scTel.latency.max}ms`);
              }
            } else {
              console.log('  SKIP: No scraper telemetry in latest run (pre-telemetry run)');
            }
          } catch {
            console.log('  SKIP: Could not read last scraper run');
          }
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
    }

    // Ghost record detection — permits the City silently dropped from CKAN
    console.log('\n--- Ghost Records (stale > 30 days) ---');
    try {
      const ghostRes = await pool.query(
        `SELECT COUNT(*) AS count, MIN(last_seen_at) AS oldest
         FROM permits
         WHERE last_seen_at < CURRENT_DATE - INTERVAL '30 days'`
      );
      const ghostCount = parseInt(ghostRes.rows[0].count, 10);
      if (ghostCount > 0) {
        const oldest = ghostRes.rows[0].oldest;
        warnings.push(`${ghostCount} permits not seen in 30+ days (oldest: ${oldest})`);
        console.warn(`  WARN: ${ghostCount} ghost permits — oldest last_seen_at: ${oldest}`);
      } else {
        console.log('  OK: No ghost records (all permits seen within 30 days)');
      }
    } catch (ghostErr) {
      // Non-fatal — last_seen_at column may not exist
      console.log(`  SKIP: Ghost record check failed: ${ghostErr.message}`);
    }

  } catch (err) {
    errors.push(err.message);
    console.error(`  ERROR: ${err.message}`);
  }

  const durationMs = Date.now() - startMs;
  const hasErrors = errors.length > 0;
  const status = hasErrors ? 'failed' : 'completed';
  const allMessages = [...errors, ...warnings.map((w) => `WARN: ${w}`)];
  const errorMsg = allMessages.length > 0 ? allMessages.join('; ') : null;
  const meta = JSON.stringify({
    checks_passed: allMessages.length === 0 ? 'all' : undefined,
    checks_failed: errors.length,
    checks_warned: warnings.length,
    errors: errors.length > 0 ? errors : undefined,
    warnings: warnings.length > 0 ? warnings : undefined,
  });

  if (runId) {
    await pool.query(
      `UPDATE pipeline_runs
       SET completed_at = NOW(), status = $1, duration_ms = $2, error_message = $3,
           records_meta = $5
       WHERE id = $4`,
      [status, durationMs, errorMsg, runId, meta]
    ).catch(() => {});
  }

  // Always emit PIPELINE_SUMMARY so chain orchestrator can capture records_meta
  console.log(`PIPELINE_SUMMARY:${JSON.stringify({ records_total: 0, records_new: null, records_meta: JSON.parse(meta) })}`);
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
  pool.end().catch(() => {});
  process.exit(1);
});
