// ---------------------------------------------------------------------------
// Buildo Cloud Functions (2nd gen) - Main entry point
// ---------------------------------------------------------------------------
//
// This file exports all five Cloud Functions that form the background
// processing pipeline:
//
//   1. syncTrigger       (HTTP)    - Downloads Open Data snapshot to GCS
//   2. syncProcess       (Pub/Sub) - Streams + processes the snapshot
//   3. classifyTrades    (Pub/Sub) - Classifies trades on changed permits
//   4. matchNotifications(Pub/Sub) - Matches users to classified permits
//   5. enrichBuilder     (Pub/Sub) - Enriches newly discovered builders
//
// ---------------------------------------------------------------------------

import * as ff from '@google-cloud/functions-framework';
import { PubSub } from '@google-cloud/pubsub';
import { Storage } from '@google-cloud/storage';

import {
  PROJECT_ID,
  TOPIC_SYNC_START,
  TOPIC_PERMIT_CHANGED,
  TOPIC_PERMIT_CLASSIFIED,
  TOPIC_BUILDER_NEW,
  SNAPSHOT_BUCKET,
  SNAPSHOT_PREFIX,
  BATCH_SIZE,
  BUILDER_ENRICHMENT_LIMIT,
  buildOpenDataUrl,
} from './config';

// ---------------------------------------------------------------------------
// Shared clients (initialised once per cold-start)
// ---------------------------------------------------------------------------

const pubsub = new PubSub({ projectId: PROJECT_ID });
const storage = new Storage({ projectId: PROJECT_ID });

// ---------------------------------------------------------------------------
// Type helpers for Pub/Sub CloudEvent payloads
// ---------------------------------------------------------------------------

interface PubSubMessageData {
  message: {
    data: string; // base64-encoded JSON
    attributes?: Record<string, string>;
    messageId: string;
    publishTime: string;
  };
  subscription: string;
}

/** Decode the base64-encoded data field from a Pub/Sub CloudEvent message. */
function decodePubSubData<T = Record<string, unknown>>(cloudEvent: ff.CloudEvent<PubSubMessageData>): T {
  const raw = cloudEvent.data?.message?.data;
  if (!raw) {
    throw new Error('CloudEvent does not contain a Pub/Sub message data field');
  }
  const json = Buffer.from(raw, 'base64').toString('utf-8');
  return JSON.parse(json) as T;
}

/** Publish a JSON payload to a Pub/Sub topic. */
async function publishMessage(
  topicName: string,
  payload: Record<string, unknown>,
  attributes?: Record<string, string>
): Promise<string> {
  const topic = pubsub.topic(topicName);
  const dataBuffer = Buffer.from(JSON.stringify(payload));
  const messageId = await topic.publishMessage({
    data: dataBuffer,
    attributes,
  });
  return messageId;
}

// =========================================================================
// 1. syncTrigger - HTTP function (Cloud Scheduler, 6 AM weekdays)
// =========================================================================
//
// Downloads the Toronto Open Data Active Building Permits JSON and uploads
// it to Cloud Storage. On success, publishes a "sync-start" Pub/Sub message
// so that syncProcess can pick it up asynchronously.
//
// Expected Cloud Scheduler cron: "0 6 * * 1-5" (6 AM Mon-Fri ET)
// =========================================================================

ff.http('syncTrigger', async (req: ff.Request, res: ff.Response) => {
  const runId = `sync-${Date.now()}`;
  const timestamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const gcsPath = `${SNAPSHOT_PREFIX}/${timestamp}/permits.json`;

  console.log(JSON.stringify({
    severity: 'INFO',
    message: 'syncTrigger started',
    runId,
    gcsPath,
  }));

  try {
    // ----- 1. Download the Open Data feed -----
    const sourceUrl = buildOpenDataUrl();
    console.log(JSON.stringify({
      severity: 'INFO',
      message: 'Fetching Open Data feed',
      url: sourceUrl,
    }));

    const response = await fetch(sourceUrl);

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(JSON.stringify({
        severity: 'ERROR',
        message: 'Open Data fetch failed',
        status: response.status,
        body: errorBody.slice(0, 500),
      }));
      res.status(502).json({
        error: 'Open Data fetch failed',
        status: response.status,
      });
      return;
    }

    // The CKAN response wraps records inside { success: true, result: { records: [...] } }
    const ckanResponse = await response.json() as {
      success: boolean;
      result: { records: unknown[]; total: number };
    };

    if (!ckanResponse.success || !ckanResponse.result?.records) {
      console.error(JSON.stringify({
        severity: 'ERROR',
        message: 'CKAN response did not contain expected records structure',
      }));
      res.status(502).json({ error: 'Invalid CKAN response structure' });
      return;
    }

    const records = ckanResponse.result.records;
    const recordCount = records.length;

    console.log(JSON.stringify({
      severity: 'INFO',
      message: `Fetched ${recordCount} records from Open Data`,
    }));

    // ----- 2. Upload to Cloud Storage -----
    const bucket = storage.bucket(SNAPSHOT_BUCKET);
    const file = bucket.file(gcsPath);

    const jsonPayload = JSON.stringify(records);
    await file.save(jsonPayload, {
      contentType: 'application/json',
      metadata: {
        recordCount: String(recordCount),
        source: 'toronto-open-data',
        fetchedAt: new Date().toISOString(),
      },
    });

    const fileSizeMb = (Buffer.byteLength(jsonPayload, 'utf-8') / (1024 * 1024)).toFixed(2);

    console.log(JSON.stringify({
      severity: 'INFO',
      message: `Snapshot uploaded to gs://${SNAPSHOT_BUCKET}/${gcsPath}`,
      sizeMb: fileSizeMb,
      recordCount,
    }));

    // ----- 3. Publish sync-start message -----
    const messagePayload = {
      runId,
      bucket: SNAPSHOT_BUCKET,
      path: gcsPath,
      recordCount,
      triggeredAt: new Date().toISOString(),
    };

    const messageId = await publishMessage(TOPIC_SYNC_START, messagePayload);

    console.log(JSON.stringify({
      severity: 'INFO',
      message: `Published sync-start message`,
      messageId,
      topic: TOPIC_SYNC_START,
    }));

    res.status(200).json({
      status: 'ok',
      runId,
      gcsPath: `gs://${SNAPSHOT_BUCKET}/${gcsPath}`,
      recordCount,
      messageId,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const errorStack = err instanceof Error ? err.stack : undefined;

    console.error(JSON.stringify({
      severity: 'ERROR',
      message: 'syncTrigger failed',
      error: errorMessage,
      stack: errorStack,
      runId,
    }));

    res.status(500).json({ error: 'Internal error', message: errorMessage });
  }
});

// =========================================================================
// 2. syncProcess - Pub/Sub function (triggered by "sync-start")
// =========================================================================
//
// Reads the snapshot file from Cloud Storage, streams it through the batch
// parser, and processes each batch with change detection. For every permit
// that is new or changed, it publishes a "permit-changed" event so that
// downstream functions can classify/match/geocode.
// =========================================================================

interface SyncStartPayload {
  runId: string;
  bucket: string;
  path: string;
  recordCount: number;
  triggeredAt: string;
}

ff.cloudEvent<PubSubMessageData>('syncProcess', async (cloudEvent) => {
  const payload = decodePubSubData<SyncStartPayload>(cloudEvent);

  console.log(JSON.stringify({
    severity: 'INFO',
    message: 'syncProcess started',
    runId: payload.runId,
    source: `gs://${payload.bucket}/${payload.path}`,
    expectedRecords: payload.recordCount,
  }));

  // Import the processing modules. These use the project's shared lib
  // and are resolved at runtime through the compiled path aliases.
  const { runSync } = await import('../../src/lib/sync/process');

  try {
    // ----- 1. Download snapshot from GCS to a temp file -----
    const tmpDir = '/tmp';
    const localPath = `${tmpDir}/permits-${payload.runId}.json`;

    const bucket = storage.bucket(payload.bucket);
    const file = bucket.file(payload.path);

    console.log(JSON.stringify({
      severity: 'INFO',
      message: 'Downloading snapshot from Cloud Storage',
      gcsPath: `gs://${payload.bucket}/${payload.path}`,
      localPath,
    }));

    await file.download({ destination: localPath });

    console.log(JSON.stringify({
      severity: 'INFO',
      message: 'Snapshot downloaded, starting sync processing',
    }));

    // ----- 2. Run the full sync pipeline -----
    const syncRun = await runSync(localPath);

    console.log(JSON.stringify({
      severity: 'INFO',
      message: 'Sync processing completed',
      runId: payload.runId,
      syncRunId: syncRun.id,
      status: syncRun.status,
      recordsTotal: syncRun.records_total,
      recordsNew: syncRun.records_new,
      recordsUpdated: syncRun.records_updated,
      recordsUnchanged: syncRun.records_unchanged,
      recordsErrors: syncRun.records_errors,
      durationMs: syncRun.duration_ms,
    }));

    // ----- 3. Publish permit-changed events for new + updated permits -----
    // The runSync function has already persisted changes to the database.
    // We query for permits that were touched in this sync run to fan out
    // downstream events for classification and notification matching.

    const changedCount = syncRun.records_new + syncRun.records_updated;

    if (changedCount > 0) {
      // Publish a single batch message with the sync run ID so downstream
      // functions can query the database for changed permits. This is more
      // efficient than publishing one message per permit when thousands change.
      const changePayload = {
        runId: payload.runId,
        syncRunId: syncRun.id,
        recordsNew: syncRun.records_new,
        recordsUpdated: syncRun.records_updated,
        processedAt: new Date().toISOString(),
      };

      const messageId = await publishMessage(TOPIC_PERMIT_CHANGED, changePayload);

      console.log(JSON.stringify({
        severity: 'INFO',
        message: `Published permit-changed event for ${changedCount} permits`,
        messageId,
        topic: TOPIC_PERMIT_CHANGED,
      }));
    } else {
      console.log(JSON.stringify({
        severity: 'INFO',
        message: 'No changed permits detected; skipping downstream events',
      }));
    }

    // ----- 4. Capture data quality snapshot -----
    try {
      const { captureDataQualitySnapshot } = await import('../../src/lib/quality/metrics');
      await captureDataQualitySnapshot();
      console.log(JSON.stringify({
        severity: 'INFO',
        message: 'Data quality snapshot captured',
        runId: payload.runId,
      }));
    } catch (snapshotErr) {
      // Non-fatal; log but don't fail the sync
      console.error(JSON.stringify({
        severity: 'WARNING',
        message: 'Failed to capture data quality snapshot',
        error: snapshotErr instanceof Error ? snapshotErr.message : String(snapshotErr),
      }));
    }

    // ----- 5. Clean up temp file -----
    const fs = await import('fs/promises');
    await fs.unlink(localPath).catch(() => {
      // Non-fatal; /tmp is ephemeral in Cloud Functions
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const errorStack = err instanceof Error ? err.stack : undefined;

    console.error(JSON.stringify({
      severity: 'ERROR',
      message: 'syncProcess failed',
      error: errorMessage,
      stack: errorStack,
      runId: payload.runId,
    }));

    // Re-throw so Cloud Functions marks this invocation as failed,
    // which triggers Pub/Sub retry behaviour.
    throw err;
  }
});

// =========================================================================
// 3. classifyTrades - Pub/Sub function (triggered by "permit-changed")
// =========================================================================
//
// Receives a batch change notification, queries the database for permits
// that were changed in the given sync run, and runs the hybrid trade
// classifier (Tier 1 rules + tag-trade matrix) on each one. Also runs
// product classification. After classification, publishes
// "permit-classified" events for notification matching.
// =========================================================================

interface PermitChangedPayload {
  runId: string;
  syncRunId: number;
  recordsNew: number;
  recordsUpdated: number;
  processedAt: string;
}

ff.cloudEvent<PubSubMessageData>('classifyTrades', async (cloudEvent) => {
  const payload = decodePubSubData<PermitChangedPayload>(cloudEvent);

  console.log(JSON.stringify({
    severity: 'INFO',
    message: 'classifyTrades started',
    syncRunId: payload.syncRunId,
    recordsNew: payload.recordsNew,
    recordsUpdated: payload.recordsUpdated,
  }));

  // Dynamic imports to resolve path aliases at runtime
  const { classifyPermit } = await import('../../src/lib/classification/classifier');
  const pg = await import('pg');

  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    // ----- 1. Fetch permits that changed in this sync run -----
    // New permits: recently inserted with no prior classification
    // Updated permits: have entries in permit_history for this sync run
    const { rows: changedPermits } = await pool.query(
      `SELECT DISTINCT p.*
       FROM permits p
       LEFT JOIN permit_history ph
         ON p.permit_num = ph.permit_num
         AND p.revision_num = ph.revision_num
         AND ph.sync_run_id = $1
       WHERE ph.sync_run_id = $1
          OR (p.first_seen_at = p.last_seen_at
              AND p.last_seen_at >= NOW() - INTERVAL '1 hour')
       ORDER BY p.permit_num`,
      [payload.syncRunId]
    );

    console.log(JSON.stringify({
      severity: 'INFO',
      message: `Found ${changedPermits.length} permits to classify`,
    }));

    // ----- 2. Load trade mapping rules -----
    const { rows: rules } = await pool.query(
      'SELECT * FROM trade_mapping_rules WHERE is_active = true'
    );

    // ----- 2b. Load scope + product classification modules -----
    const { classifyScope, extractBasePermitNum, isBLDPermit } = await import('../../src/lib/classification/scope');
    const { classifyProducts } = await import('../../src/lib/classification/classifier');

    // ----- 3. Classify all permits in memory (CPU-only, no DB) -----
    interface ScopeEntry { permit_num: string; revision_num: string; project_type: string; scope_tags: string[] }
    interface TradeRow { permit_num: string; revision_num: string; trade_id: number; trade_slug: string; trade_name: string; tier: number; confidence: number; is_active: boolean; phase: string; lead_score: number }
    interface ProductRow { permit_num: string; revision_num: string; product_id: number; product_slug: string; product_name: string; confidence: number }

    const allScopes: ScopeEntry[] = [];
    const allTrades: TradeRow[] = [];
    const allProducts: ProductRow[] = [];
    const permitKeys: { permit_num: string; revision_num: string }[] = [];
    let classifiedCount = 0;
    let errorCount = 0;

    for (const permit of changedPermits) {
      try {
        const scope = classifyScope(permit);
        const matches = classifyPermit(permit, rules, scope.scope_tags);
        const productMatches = classifyProducts(permit, scope.scope_tags);

        permitKeys.push({ permit_num: permit.permit_num, revision_num: permit.revision_num });
        allScopes.push({
          permit_num: permit.permit_num,
          revision_num: permit.revision_num,
          project_type: scope.project_type,
          scope_tags: scope.scope_tags,
        });
        for (const m of matches) {
          allTrades.push({
            permit_num: m.permit_num, revision_num: m.revision_num,
            trade_id: m.trade_id, trade_slug: m.trade_slug, trade_name: m.trade_name,
            tier: m.tier, confidence: m.confidence, is_active: m.is_active,
            phase: m.phase, lead_score: m.lead_score,
          });
        }
        for (const pm of productMatches) {
          allProducts.push({
            permit_num: pm.permit_num, revision_num: pm.revision_num,
            product_id: pm.product_id, product_slug: pm.product_slug,
            product_name: pm.product_name, confidence: pm.confidence,
          });
        }
        classifiedCount++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(JSON.stringify({
          severity: 'ERROR',
          message: `Failed to classify permit ${permit.permit_num}/${permit.revision_num}`,
          error: msg,
        }));
        errorCount++;
      }
    }

    console.log(JSON.stringify({
      severity: 'INFO',
      message: `Classified ${classifiedCount} permits in memory (${allTrades.length} trades, ${allProducts.length} products, ${errorCount} errors)`,
    }));

    // ----- 4. Bulk DB operations — single transaction -----
    if (permitKeys.length > 0) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const pNums = permitKeys.map((k) => k.permit_num);
        const rNums = permitKeys.map((k) => k.revision_num);

        // 4a. Bulk DELETE existing trades for all changed permits
        await client.query(
          `DELETE FROM permit_trades
           WHERE (permit_num, revision_num) IN (
             SELECT UNNEST($1::text[]), UNNEST($2::text[])
           )`,
          [pNums, rNums]
        );

        // 4b. Bulk INSERT trades (sub-batch to stay under 65535 param limit)
        const TRADE_COLS = 10;
        const MAX_TRADE_ROWS = Math.floor(65535 / TRADE_COLS) - 1; // ~6553
        for (let i = 0; i < allTrades.length; i += MAX_TRADE_ROWS) {
          const chunk = allTrades.slice(i, i + MAX_TRADE_ROWS);
          const values: unknown[] = [];
          const placeholders: string[] = [];
          let pIdx = 1;
          for (const t of chunk) {
            placeholders.push(`($${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++})`);
            values.push(t.permit_num, t.revision_num, t.trade_id, t.trade_slug, t.trade_name, t.tier, t.confidence, t.is_active, t.phase, t.lead_score);
          }
          await client.query(
            `INSERT INTO permit_trades (
              permit_num, revision_num, trade_id, trade_slug, trade_name,
              tier, confidence, is_active, phase, lead_score
            ) VALUES ${placeholders.join(', ')}`,
            values
          );
        }

        // 4c. Bulk UPDATE scopes on permits
        if (allScopes.length > 0) {
          await client.query(
            `UPDATE permits
             SET project_type = d.project_type,
                 scope_tags = d.scope_tags::text[],
                 scope_classified_at = NOW(),
                 scope_source = 'classified'
             FROM (
               SELECT UNNEST($1::text[]) AS permit_num,
                      UNNEST($2::text[]) AS revision_num,
                      UNNEST($3::text[]) AS project_type,
                      UNNEST($4::text[]) AS scope_tags
             ) AS d
             WHERE permits.permit_num = d.permit_num
               AND permits.revision_num = d.revision_num`,
            [
              allScopes.map((s) => s.permit_num),
              allScopes.map((s) => s.revision_num),
              allScopes.map((s) => s.project_type),
              allScopes.map((s) => `{${s.scope_tags.map((t) => `"${t}"`).join(',')}}`),
            ]
          );
        }

        // 4d. Bulk DELETE + INSERT products
        await client.query(
          `DELETE FROM permit_products
           WHERE (permit_num, revision_num) IN (
             SELECT UNNEST($1::text[]), UNNEST($2::text[])
           )`,
          [pNums, rNums]
        );

        if (allProducts.length > 0) {
          const PROD_COLS = 6;
          const MAX_PROD_ROWS = Math.floor(65535 / PROD_COLS) - 1;
          for (let i = 0; i < allProducts.length; i += MAX_PROD_ROWS) {
            const chunk = allProducts.slice(i, i + MAX_PROD_ROWS);
            const values: unknown[] = [];
            const placeholders: string[] = [];
            let pIdx = 1;
            for (const p of chunk) {
              placeholders.push(`($${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++})`);
              values.push(p.permit_num, p.revision_num, p.product_id, p.product_slug, p.product_name, p.confidence);
            }
            await client.query(
              `INSERT INTO permit_products (
                permit_num, revision_num, product_id, product_slug, product_name, confidence
              ) VALUES ${placeholders.join(', ')}`,
              values
            );
          }
        }

        // ----- 5. Bulk scope propagation: BLD ↔ companions -----

        // 5a. BLD permits → propagate scope to companion permits
        const bldScopes = allScopes.filter(
          (s) => isBLDPermit(s.permit_num) && s.scope_tags.length > 0
        );
        if (bldScopes.length > 0) {
          for (const bld of bldScopes) {
            const baseNum = extractBasePermitNum(bld.permit_num);
            await client.query(
              `UPDATE permits
               SET scope_tags = $1, project_type = $2, scope_classified_at = NOW(), scope_source = 'propagated'
               WHERE TRIM(SPLIT_PART(permit_num, ' ', 1) || ' ' || SPLIT_PART(permit_num, ' ', 2)) = $3
                 AND permit_num !~ '\\sBLD(\\s|$)'
                 AND permit_num ~ '\\s[A-Z]{2,4}(\\s|$)'`,
              [bld.scope_tags, bld.project_type, baseNum]
            );
          }
        }

        // 5b. Companion permits → look up BLD sibling scope in bulk
        const companionScopes = allScopes.filter(
          (s) => !isBLDPermit(s.permit_num) && /\s[A-Z]{2,4}(\s|$)/.test(s.permit_num)
        );
        if (companionScopes.length > 0) {
          const companionBaseNums = companionScopes.map((s) => extractBasePermitNum(s.permit_num));
          const { rows: bldRows } = await client.query(
            `SELECT DISTINCT ON (TRIM(SPLIT_PART(permit_num, ' ', 1) || ' ' || SPLIT_PART(permit_num, ' ', 2)))
                    TRIM(SPLIT_PART(permit_num, ' ', 1) || ' ' || SPLIT_PART(permit_num, ' ', 2)) AS base_num,
                    scope_tags, project_type
             FROM permits
             WHERE TRIM(SPLIT_PART(permit_num, ' ', 1) || ' ' || SPLIT_PART(permit_num, ' ', 2)) = ANY($1)
               AND permit_num ~ '\\sBLD(\\s|$)'
               AND scope_tags IS NOT NULL
               AND array_length(scope_tags, 1) > 0
             ORDER BY TRIM(SPLIT_PART(permit_num, ' ', 1) || ' ' || SPLIT_PART(permit_num, ' ', 2)), scope_classified_at DESC`,
            [companionBaseNums]
          );

          // Build a lookup map: baseNum → { scope_tags, project_type }
          const bldLookup = new Map<string, { scope_tags: string[]; project_type: string }>();
          for (const row of bldRows) {
            bldLookup.set(row.base_num, { scope_tags: row.scope_tags, project_type: row.project_type });
          }

          // Update each companion permit that has a BLD match
          for (const comp of companionScopes) {
            const baseNum = extractBasePermitNum(comp.permit_num);
            const bld = bldLookup.get(baseNum);
            if (bld) {
              await client.query(
                `UPDATE permits SET scope_tags = $1, project_type = $2, scope_classified_at = NOW(), scope_source = 'propagated'
                 WHERE permit_num = $3 AND revision_num = $4`,
                [bld.scope_tags, bld.project_type, comp.permit_num, comp.revision_num]
              );
            }
          }
        }

        await client.query('COMMIT');
      } catch (txErr) {
        await client.query('ROLLBACK');
        throw txErr;
      } finally {
        client.release();
      }
    }

    console.log(JSON.stringify({
      severity: 'INFO',
      message: 'Trade classification complete',
      classified: classifiedCount,
      errors: errorCount,
      trades: allTrades.length,
      products: allProducts.length,
    }));

    // ----- 4. Publish permit-classified event for notification matching -----
    if (classifiedCount > 0) {
      const classifiedPayload = {
        runId: payload.runId,
        syncRunId: payload.syncRunId,
        classifiedCount,
        classifiedAt: new Date().toISOString(),
      };

      const messageId = await publishMessage(TOPIC_PERMIT_CLASSIFIED, classifiedPayload);

      console.log(JSON.stringify({
        severity: 'INFO',
        message: 'Published permit-classified event',
        messageId,
        topic: TOPIC_PERMIT_CLASSIFIED,
        classifiedCount,
      }));
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const errorStack = err instanceof Error ? err.stack : undefined;

    console.error(JSON.stringify({
      severity: 'ERROR',
      message: 'classifyTrades failed',
      error: errorMessage,
      stack: errorStack,
      syncRunId: payload.syncRunId,
    }));

    throw err;
  } finally {
    await pool.end();
  }
});

// =========================================================================
// 4. matchNotifications - Pub/Sub function (triggered by "permit-classified")
// =========================================================================
//
// After permits are classified, this function finds users whose notification
// preferences match the newly classified permits and creates notification
// records in the database.
// =========================================================================

interface PermitClassifiedPayload {
  runId: string;
  syncRunId: number;
  classifiedCount: number;
  classifiedAt: string;
}

ff.cloudEvent<PubSubMessageData>('matchNotifications', async (cloudEvent) => {
  const payload = decodePubSubData<PermitClassifiedPayload>(cloudEvent);

  console.log(JSON.stringify({
    severity: 'INFO',
    message: 'matchNotifications started',
    syncRunId: payload.syncRunId,
    classifiedCount: payload.classifiedCount,
  }));

  // matcher module removed — notification matching is a no-op until reimplemented
  const pg = await import('pg');

  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    // ----- 1. Query recently classified permits with their trade slugs -----
    const { rows: classifiedPermits } = await pool.query(
      `SELECT
        p.permit_num,
        p.revision_num,
        p.ward,
        p.postal,
        p.est_const_cost,
        COALESCE(
          ARRAY_AGG(pt.trade_slug) FILTER (WHERE pt.trade_slug IS NOT NULL),
          '{}'
        ) AS trade_slugs
      FROM permits p
      LEFT JOIN permit_trades pt
        ON p.permit_num = pt.permit_num
        AND p.revision_num = pt.revision_num
      WHERE p.last_seen_at >= NOW() - INTERVAL '2 hours'
        AND (p.first_seen_at = p.last_seen_at
             OR EXISTS (
               SELECT 1 FROM permit_history ph
               WHERE ph.permit_num = p.permit_num
                 AND ph.revision_num = p.revision_num
                 AND ph.sync_run_id = $1
             ))
      GROUP BY p.permit_num, p.revision_num, p.ward, p.postal, p.est_const_cost`,
      [payload.syncRunId]
    );

    console.log(JSON.stringify({
      severity: 'INFO',
      message: `Matching notifications for ${classifiedPermits.length} classified permits`,
    }));

    // Notification matching stubbed out — matcher module was removed with the
    // Two-Client Architecture purge. Reimplment via /api/notifications route.
    console.log(JSON.stringify({
      severity: 'INFO',
      message: 'matchNotifications complete (matching disabled — matcher removed)',
      permitsProcessed: classifiedPermits.length,
      notificationsCreated: 0,
      errors: 0,
      syncRunId: payload.syncRunId,
    }));
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const errorStack = err instanceof Error ? err.stack : undefined;

    console.error(JSON.stringify({
      severity: 'ERROR',
      message: 'matchNotifications failed',
      error: errorMessage,
      stack: errorStack,
      syncRunId: payload.syncRunId,
    }));

    throw err;
  } finally {
    await pool.end();
  }
});

// =========================================================================
// 5. enrichBuilder - Pub/Sub function (triggered by "builder-new")
// =========================================================================
//
// Processes builder enrichment for newly seen builder names. When the sync
// pipeline encounters a builder name that does not already exist in the
// builders table, it publishes a message to the "builder-new" topic.
// This function picks up the message, looks up the builder in Google Places
// to retrieve phone, website, rating, and review count, and persists the
// enrichment data back to the database.
//
// Can also be triggered on a schedule (e.g. daily) to batch-enrich any
// builders that were missed or that have stale enrichment data.
// =========================================================================

interface BuilderNewPayload {
  builderId?: number;
  builderName?: string;
  /** When true, run batch enrichment for all unenriched builders. */
  batchMode?: boolean;
}

ff.cloudEvent<PubSubMessageData>('enrichBuilder', async (cloudEvent) => {
  const payload = decodePubSubData<BuilderNewPayload>(cloudEvent);

  const isBatch = payload.batchMode === true;

  console.log(JSON.stringify({
    severity: 'INFO',
    message: 'enrichBuilder started',
    mode: isBatch ? 'batch' : 'single',
    builderId: payload.builderId ?? null,
    builderName: payload.builderName ?? null,
  }));

  const { enrichBuilder: enrichSingle, enrichUnenrichedBuilders } =
    await import('../../src/lib/builders/enrichment');

  try {
    if (isBatch) {
      // ----- Batch mode: enrich all unenriched builders -----
      const stats = await enrichUnenrichedBuilders(BUILDER_ENRICHMENT_LIMIT);

      console.log(JSON.stringify({
        severity: 'INFO',
        message: 'Batch builder enrichment complete',
        enriched: stats.enriched,
        failed: stats.failed,
        limit: BUILDER_ENRICHMENT_LIMIT,
      }));
    } else if (payload.builderId) {
      // ----- Single builder mode -----
      const result = await enrichSingle(payload.builderId);

      if (result) {
        console.log(JSON.stringify({
          severity: 'INFO',
          message: 'Builder enriched successfully',
          builderId: result.id,
          name: result.name,
          hasPlaceId: !!result.google_place_id,
          hasWebsite: !!result.website,
          hasPhone: !!result.phone,
          rating: result.google_rating,
        }));
      } else {
        console.log(JSON.stringify({
          severity: 'WARN',
          message: 'Builder enrichment returned no result',
          builderId: payload.builderId,
          builderName: payload.builderName ?? 'unknown',
        }));
      }
    } else {
      console.error(JSON.stringify({
        severity: 'ERROR',
        message: 'enrichBuilder called without builderId or batchMode flag',
        payload,
      }));
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const errorStack = err instanceof Error ? err.stack : undefined;

    console.error(JSON.stringify({
      severity: 'ERROR',
      message: 'enrichBuilder failed',
      error: errorMessage,
      stack: errorStack,
      builderId: payload.builderId ?? null,
      batchMode: isBatch,
    }));

    throw err;
  }
});
