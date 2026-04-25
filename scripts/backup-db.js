#!/usr/bin/env node
/**
 * backup-db — pg_dump the full Buildo database and stream it to GCS.
 *
 * Reads the database using the standard PG_* / DATABASE_URL env vars. Uploads
 * a custom-format pg_dump to gs://${BACKUP_GCS_BUCKET}/pg_dump/${date}/${iso}.dump.
 * Prunes objects older than BACKUP_RETAIN_DAYS (default 30). Retention prune
 * failure is non-fatal — backup itself is always the critical path.
 *
 * SPEC LINK: docs/specs/00-architecture/112_backup_recovery.md
 */
'use strict';

const { spawn } = require('child_process');
const { Storage } = require('@google-cloud/storage');
const { z } = require('zod');
const pipeline = require('./lib/pipeline');
const { safeParsePositiveInt } = require('./lib/safe-math');

// §R2 — Advisory lock ID (spec 112)
const ADVISORY_LOCK_ID = 112;

// BACKUP_RETAIN_DAYS is a structural constant (spec 47 §A.2 retention/compliance
// pattern). It is NOT in logic_variables because retention policy changes require
// engineering review, not self-service Admin Panel access.
const DEFAULT_RETAIN_DAYS = 30;

const ConfigSchema = z.object({
  bucket: z.string().min(1),
  retainDays: z.number().int().positive(),
});

pipeline.run('backup-db', async (pool) => {

  // §R5 — Startup guard: BACKUP_GCS_BUCKET is required in production but optional in
  // local dev. Emit SKIP (not throw) so the permits chain continues cleanly when the
  // var is absent. Production GCS bucket is always set via Cloud Run secrets.
  const rawBucket = process.env.BACKUP_GCS_BUCKET;
  if (!rawBucket || rawBucket.trim() === '') {
    pipeline.emitSummary({
      records_total: null,
      records_new: null,
      records_updated: null,
      records_meta: { skipped: true, reason: 'BACKUP_GCS_BUCKET not configured — no backup on this environment' },
    });
    return;
  }

  const rawRetain = process.env.BACKUP_RETAIN_DAYS
    ? safeParsePositiveInt(process.env.BACKUP_RETAIN_DAYS, 'BACKUP_RETAIN_DAYS')
    : DEFAULT_RETAIN_DAYS;

  const config = ConfigSchema.parse({ bucket: rawBucket.trim(), retainDays: rawRetain });

  // §R6 — Advisory lock
  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {

    const startMs = Date.now();

    // §R3.5 — Single DB timestamp for consistent naming and emitSummary.
    // Using DB clock (not JS) per spec 47 §14.1. RUN_AT is used only as a
    // filename component and summary timestamp — no DB write occurs.
    const RUN_AT = await pipeline.getDbTimestamp(pool);

    const isoStamp = RUN_AT.toISOString().replace(/[:.]/g, '-').replace('Z', 'Z');
    const dateStr = RUN_AT.toISOString().slice(0, 10);
    const objectName = `pg_dump/${dateStr}/${isoStamp}.dump`;

    pipeline.log.info('[backup-db]', 'Starting pg_dump', {
      bucket: config.bucket,
      object: objectName,
      retain_days: config.retainDays,
    });

    // Build pg_dump args from PG_* env vars (same as the pool uses)
    const pgArgs = ['--format=custom', '--no-password'];
    if (process.env.PG_HOST) pgArgs.push('--host', process.env.PG_HOST);
    if (process.env.PG_PORT) pgArgs.push('--port', process.env.PG_PORT);
    if (process.env.PG_USER) pgArgs.push('--username', process.env.PG_USER);
    if (process.env.PG_DATABASE) pgArgs.push(process.env.PG_DATABASE);

    const storage = new Storage();
    const bucket = storage.bucket(config.bucket);
    const file = bucket.file(objectName);

    // Stream pg_dump stdout directly to GCS — no temp file on disk.
    let backupSizeBytes = 0;
    await new Promise((resolve, reject) => {
      // stdio: ['ignore', 'pipe', 'inherit'] — stdout piped for GCS upload;
      // stderr goes directly to console so pg_dump progress is visible.
      const pgDump = spawn('pg_dump', pgArgs, {
        env: {
          ...process.env,
          PGPASSWORD: process.env.PG_PASSWORD || '',
        },
        stdio: ['ignore', 'pipe', 'inherit'],
      });

      const writeStream = file.createWriteStream({
        metadata: {
          contentType: 'application/octet-stream',
          metadata: { run_at: RUN_AT.toISOString(), spec: '112_backup_recovery' },
        },
        resumable: true,
      });

      // pgDumpFailed guards the 'finish' handler: GCS signals upload complete
      // before the 'close' event fires when pg_dump exits non-zero. Without
      // this flag the Promise resolves on a partial/corrupt object.
      let pgDumpFailed = false;

      pgDump.stdout.on('data', (chunk) => {
        backupSizeBytes += chunk.length;
      });

      pgDump.stdout.pipe(writeStream);

      pgDump.on('error', (err) => {
        pgDumpFailed = true;
        writeStream.destroy();
        reject(new Error(`[backup-db] pg_dump spawn error: ${err.message}`));
      });

      pgDump.on('close', (code) => {
        if (code !== 0) {
          pgDumpFailed = true;
          writeStream.destroy();
          reject(new Error(`[backup-db] pg_dump exited with code ${code}`));
        }
      });

      writeStream.on('error', (err) => {
        reject(new Error(`[backup-db] GCS upload error: ${err.message}`));
      });

      writeStream.on('finish', () => {
        if (!pgDumpFailed) resolve();
      });
    });

    const gcsPath = `gs://${config.bucket}/${objectName}`;
    pipeline.log.info('[backup-db]', 'Upload complete', {
      gcs_path: gcsPath,
      size_bytes: backupSizeBytes,
    });

    // Retention pruning — non-fatal: a prune failure must not abort the backup.
    let blobsPruned = 0;
    try {
      const cutoff = new Date(RUN_AT.getTime() - config.retainDays * 86_400_000);
      const [files] = await bucket.getFiles({ prefix: 'pg_dump/' });
      for (const f of files) {
        const created = f.metadata.timeCreated ? new Date(f.metadata.timeCreated) : null;
        if (created && created < cutoff) {
          await f.delete();
          blobsPruned++;
        }
      }
      pipeline.log.info('[backup-db]', `Pruned ${blobsPruned} old backup(s)`, {
        retain_days: config.retainDays,
        cutoff: cutoff.toISOString(),
      });
    } catch (pruneErr) {
      pipeline.log.warn('[backup-db]', 'Retention prune failed — backup still succeeded', {
        error: pruneErr.message,
      });
    }

    const durationMs = Date.now() - startMs;

    const auditRows = [
      { metric: 'gcs_path',          value: gcsPath,          threshold: null,    status: 'INFO' },
      { metric: 'backup_size_bytes',  value: backupSizeBytes,  threshold: '> 0',   status: backupSizeBytes > 0 ? 'PASS' : 'FAIL' },
      { metric: 'blobs_pruned',       value: blobsPruned,      threshold: null,    status: 'INFO' },
      { metric: 'retain_days',        value: config.retainDays, threshold: null,   status: 'INFO' },
    ];

    pipeline.emitSummary({
      // Observer archetype — no row-level DB processing (spec 47 §12, observer scripts)
      records_total: null,
      records_new: null,
      records_updated: null,
      records_meta: {
        duration_ms: durationMs,
        backup_size_bytes: backupSizeBytes,
        gcs_path: gcsPath,
        blobs_pruned: blobsPruned,
        retain_days: config.retainDays,
        audit_table: {
          phase: 112,
          name: 'DB Backup to GCS',
          verdict: auditRows.some((r) => r.status === 'FAIL') ? 'FAIL'
                 : auditRows.some((r) => r.status === 'WARN') ? 'WARN'
                 : 'PASS',
          rows: auditRows,
        },
      },
    });

    pipeline.emitMeta(
      {},   // reads: pg_dump bypasses the pool — no table-level reads to declare
      {},   // writes: GCS only, no DB tables written
      ['GCS'],
    );

  }); // withAdvisoryLock

  if (!lockResult.acquired) return;
});
