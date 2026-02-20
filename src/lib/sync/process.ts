import { query, getClient } from '@/lib/db/client';
import { mapRawToPermit } from '@/lib/permits/field-mapping';
import { computePermitHash } from '@/lib/permits/hash';
import { diffPermitFields } from '@/lib/permits/diff';
import { classifyPermit } from '@/lib/classification/classifier';
import { parsePermitsStream } from '@/lib/sync/ingest';
import type {
  RawPermitRecord,
  Permit,
  SyncRun,
  SyncStats,
  TradeMappingRule,
} from '@/lib/permits/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fetch all active trade-mapping rules from the database. */
async function loadRules(): Promise<TradeMappingRule[]> {
  return query<TradeMappingRule>(
    'SELECT * FROM trade_mapping_rules WHERE is_active = true'
  );
}

/** Look up an existing permit by its composite key. */
async function findExistingPermit(
  permitNum: string,
  revisionNum: string
): Promise<(Partial<Permit> & { data_hash: string }) | null> {
  const rows = await query<Permit>(
    'SELECT * FROM permits WHERE permit_num = $1 AND revision_num = $2 LIMIT 1',
    [permitNum, revisionNum]
  );
  return rows.length > 0 ? rows[0] : null;
}

// ---------------------------------------------------------------------------
// Batch processing
// ---------------------------------------------------------------------------

/**
 * Process a single batch of raw permit records within a sync run.
 *
 * For every record the function:
 *  1. Computes a content hash.
 *  2. Checks whether the permit already exists in the database.
 *  3. Based on comparison:
 *     - **New** - INSERT the permit, classify trades, store matches.
 *     - **Changed** - compute a diff, UPDATE the permit, INSERT history rows.
 *     - **Unchanged** - touch `last_seen_at` only.
 *
 * Each record is wrapped in its own transaction so a single bad record
 * does not roll back the entire batch.
 */
export async function processBatch(
  batch: RawPermitRecord[],
  syncRunId: number
): Promise<SyncStats> {
  const stats: SyncStats = {
    total: batch.length,
    new_count: 0,
    updated: 0,
    unchanged: 0,
    errors: 0,
  };

  const rules = await loadRules();

  for (const raw of batch) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      const hash = computePermitHash(raw);
      const mapped = mapRawToPermit(raw);
      const permitNum = mapped.permit_num ?? '';
      const revisionNum = mapped.revision_num ?? '';

      const existing = await findExistingPermit(permitNum, revisionNum);

      if (!existing) {
        // ---- New permit ----
        await client.query(
          `INSERT INTO permits (
            permit_num, revision_num, permit_type, structure_type, work,
            street_num, street_name, street_type, street_direction, city,
            postal, geo_id, building_type, category, application_date,
            issued_date, completed_date, status, description, est_const_cost,
            builder_name, owner, dwelling_units_created, dwelling_units_lost,
            ward, council_district, current_use, proposed_use, housing_units,
            storeys, data_hash, first_seen_at, last_seen_at
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
            $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
            $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,
            $31, NOW(), NOW()
          )`,
          [
            mapped.permit_num, mapped.revision_num, mapped.permit_type,
            mapped.structure_type, mapped.work, mapped.street_num,
            mapped.street_name, mapped.street_type, mapped.street_direction,
            mapped.city, mapped.postal, mapped.geo_id, mapped.building_type,
            mapped.category, mapped.application_date, mapped.issued_date,
            mapped.completed_date, mapped.status, mapped.description,
            mapped.est_const_cost, mapped.builder_name, mapped.owner,
            mapped.dwelling_units_created, mapped.dwelling_units_lost,
            mapped.ward, mapped.council_district, mapped.current_use,
            mapped.proposed_use, mapped.housing_units, mapped.storeys,
            hash,
          ]
        );

        // Classify and store trade matches
        const matches = classifyPermit(mapped, rules);
        for (const m of matches) {
          await client.query(
            `INSERT INTO permit_trades (
              permit_num, revision_num, trade_id, trade_slug, trade_name,
              tier, confidence, is_active, phase, lead_score
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [
              m.permit_num, m.revision_num, m.trade_id, m.trade_slug,
              m.trade_name, m.tier, m.confidence, m.is_active, m.phase,
              m.lead_score,
            ]
          );
        }

        stats.new_count++;
      } else if (existing.data_hash !== hash) {
        // ---- Changed permit ----
        const changes = diffPermitFields(existing, mapped);

        await client.query(
          `UPDATE permits SET
            permit_type=$1, structure_type=$2, work=$3, street_num=$4,
            street_name=$5, street_type=$6, street_direction=$7, city=$8,
            postal=$9, geo_id=$10, building_type=$11, category=$12,
            application_date=$13, issued_date=$14, completed_date=$15,
            status=$16, description=$17, est_const_cost=$18,
            builder_name=$19, owner=$20, dwelling_units_created=$21,
            dwelling_units_lost=$22, ward=$23, council_district=$24,
            current_use=$25, proposed_use=$26, housing_units=$27,
            storeys=$28, data_hash=$29, last_seen_at=NOW()
          WHERE permit_num=$30 AND revision_num=$31`,
          [
            mapped.permit_type, mapped.structure_type, mapped.work,
            mapped.street_num, mapped.street_name, mapped.street_type,
            mapped.street_direction, mapped.city, mapped.postal,
            mapped.geo_id, mapped.building_type, mapped.category,
            mapped.application_date, mapped.issued_date, mapped.completed_date,
            mapped.status, mapped.description, mapped.est_const_cost,
            mapped.builder_name, mapped.owner, mapped.dwelling_units_created,
            mapped.dwelling_units_lost, mapped.ward, mapped.council_district,
            mapped.current_use, mapped.proposed_use, mapped.housing_units,
            mapped.storeys, hash,
            permitNum, revisionNum,
          ]
        );

        // Record each changed field in the history table
        for (const change of changes) {
          await client.query(
            `INSERT INTO permit_history (
              permit_num, revision_num, field_name, old_value, new_value,
              sync_run_id, changed_at
            ) VALUES ($1,$2,$3,$4,$5,$6,NOW())`,
            [
              change.permit_num, change.revision_num, change.field_name,
              change.old_value, change.new_value, syncRunId,
            ]
          );
        }

        // Re-classify trades after update
        await client.query(
          'DELETE FROM permit_trades WHERE permit_num=$1 AND revision_num=$2',
          [permitNum, revisionNum]
        );
        const matches = classifyPermit(mapped, rules);
        for (const m of matches) {
          await client.query(
            `INSERT INTO permit_trades (
              permit_num, revision_num, trade_id, trade_slug, trade_name,
              tier, confidence, is_active, phase, lead_score
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [
              m.permit_num, m.revision_num, m.trade_id, m.trade_slug,
              m.trade_name, m.tier, m.confidence, m.is_active, m.phase,
              m.lead_score,
            ]
          );
        }

        stats.updated++;
      } else {
        // ---- Unchanged ----
        await client.query(
          'UPDATE permits SET last_seen_at = NOW() WHERE permit_num=$1 AND revision_num=$2',
          [permitNum, revisionNum]
        );
        stats.unchanged++;
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(
        `[sync] Error processing permit ${raw.PERMIT_NUM}/${raw.REVISION_NUM}:`,
        err
      );
      stats.errors++;
    } finally {
      client.release();
    }
  }

  return stats;
}

// ---------------------------------------------------------------------------
// Full sync orchestrator
// ---------------------------------------------------------------------------

/**
 * Run a complete sync from a local JSON file of Toronto Open Data permits.
 *
 * Steps:
 *  1. Create a `sync_runs` record to track this run.
 *  2. Stream-parse the file in batches and call `processBatch` for each.
 *  3. Aggregate stats and update the `sync_runs` record on completion.
 */
export async function runSync(filePath: string): Promise<SyncRun> {
  // 1. Create the sync run record
  const [syncRun] = await query<SyncRun>(
    `INSERT INTO sync_runs (started_at, status)
     VALUES (NOW(), 'running')
     RETURNING *`
  );

  const aggregated: SyncStats = {
    total: 0,
    new_count: 0,
    updated: 0,
    unchanged: 0,
    errors: 0,
  };

  try {
    // 2. Stream + process
    const totalRecords = await parsePermitsStream(filePath, async (batch) => {
      const batchStats = await processBatch(batch, syncRun.id);
      aggregated.total += batchStats.total;
      aggregated.new_count += batchStats.new_count;
      aggregated.updated += batchStats.updated;
      aggregated.unchanged += batchStats.unchanged;
      aggregated.errors += batchStats.errors;
    });

    // 3. Finalise the sync run
    const durationMs = Date.now() - Date.parse(syncRun.started_at as unknown as string);
    const [finished] = await query<SyncRun>(
      `UPDATE sync_runs SET
        completed_at = NOW(),
        status = 'completed',
        records_total = $1,
        records_new = $2,
        records_updated = $3,
        records_unchanged = $4,
        records_errors = $5,
        duration_ms = $6
      WHERE id = $7
      RETURNING *`,
      [
        totalRecords,
        aggregated.new_count,
        aggregated.updated,
        aggregated.unchanged,
        aggregated.errors,
        durationMs,
        syncRun.id,
      ]
    );

    return finished;
  } catch (err) {
    // Mark the run as failed
    const errorMessage = err instanceof Error ? err.message : String(err);
    const [failed] = await query<SyncRun>(
      `UPDATE sync_runs SET
        completed_at = NOW(),
        status = 'failed',
        records_total = $1,
        records_new = $2,
        records_updated = $3,
        records_unchanged = $4,
        records_errors = $5,
        error_message = $6
      WHERE id = $7
      RETURNING *`,
      [
        aggregated.total,
        aggregated.new_count,
        aggregated.updated,
        aggregated.unchanged,
        aggregated.errors,
        errorMessage,
        syncRun.id,
      ]
    );

    return failed;
  }
}
