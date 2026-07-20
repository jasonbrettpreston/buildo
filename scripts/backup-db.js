#!/usr/bin/env node
/**
 * backup-db — pg_dump the full Buildo database and stream it to an
 * S3-compatible off-Supabase destination (Backblaze B2 or Cloudflare R2 —
 * vendor finalized at bucket-creation time, both S3-compatible so no code
 * fork; Spec 112 §2.1 RESOLVED 2026-07-20).
 *
 * Uploads a custom-format pg_dump to
 * ${BACKUP_S3_ENDPOINT}/${BACKUP_S3_BUCKET}/pg_dump/${date}/${iso}.dump,
 * plus a `.manifest.json` sidecar (same path, `.manifest.json` suffix)
 * capturing the gate-baseline metrics `restore-db.js` diffs against
 * (Spec 112 §4.2). Prunes objects older than BACKUP_RETAIN_DAYS
 * (default 30). Retention prune failure is non-fatal — backup itself is
 * always the critical path.
 *
 * SPEC LINK: docs/specs/00-architecture/112_backup_recovery.md
 * SPEC LINK: docs/specs/00-architecture/113_supabase_infrastructure.md §3, §4
 */
'use strict';

const { spawn } = require('child_process');
const { S3Client, ListObjectsV2Command, DeleteObjectsCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const { parse: parsePgConnectionString } = require('pg-connection-string');
const { z } = require('zod');
const pipeline = require('./lib/pipeline');
const { safeParsePositiveInt } = require('./lib/safe-math');
const { isLocalMode } = require('./lib/ssl-config');
const {
  EXCLUDED_TABLES,
  getBaseTables,
  getRowCounts,
  getInvalidGeomIds,
  getSequenceValues,
  getMatviewCount,
  getPostgisVersion,
} = require('./validation/supabase-load-gates');

// §R2 — Advisory lock ID (spec 112) — unchanged across the GCS -> S3 rewrite.
const ADVISORY_LOCK_ID = 112;

// BACKUP_RETAIN_DAYS is a structural constant (spec 47 §A.2 retention/compliance
// pattern). It is NOT in logic_variables because retention policy changes require
// engineering review, not self-service Admin Panel access.
const DEFAULT_RETAIN_DAYS = 30;

// R2/B2 (any generic S3-compatible destination) do not use AWS-style regions —
// the explicit `endpoint` below fully determines where requests land, and the
// AWS SDK v3 S3 client only requires SOME non-empty `region` string to
// construct successfully. 'auto' is Cloudflare R2's own documented value and
// is accepted as an opaque placeholder by Backblaze B2's S3-compatible API.
// Spec 112 §4.2 does not add a BACKUP_S3_REGION var to the required contract
// (vendor choice is meant to be a zero-code-fork decision) — but an optional
// override is still honored (F8 fold 2026-07-20, Gemini) for the rare
// S3-compatible provider that DOES care about a real region value, without
// forcing every other deployment to set a var it doesn't need.
const DEFAULT_S3_REGION = 'auto';

const ConfigSchema = z.object({
  s3Endpoint: z.string().min(1),
  s3Bucket: z.string().min(1),
  s3AccessKeyId: z.string().min(1),
  s3SecretAccessKey: z.string().min(1),
  s3Region: z.string().min(1),
  retainDays: z.number().int().positive(),
});

/**
 * Parse a Postgres connection string into the discrete pieces `pg_dump`
 * needs. Delegates to `pg-connection-string` (ships as a direct dependency
 * of `pg`, already present in node_modules — F8 fold 2026-07-20, Gemini)
 * rather than a hand-rolled `new URL()` parse: the hand-rolled version
 * duplicated logic the ecosystem-standard parser already gets right
 * (IPv6 hosts, connection-string quirks `new URL()` doesn't handle), and
 * every other Postgres-connecting piece of this codebase already trusts `pg`
 * itself to parse connection strings for the exact same reason.
 * @param {string} connectionString
 * @returns {{ host: string, port: string, database: string, user: string, password: string }}
 */
function parseConnectionString(connectionString) {
  const parsed = parsePgConnectionString(connectionString);
  return {
    host: parsed.host || '',
    // pg-connection-string returns '' (not null) when no port is present in
    // the connection string — preserve the same '5432' default the old
    // hand-rolled parser had.
    port: parsed.port || '5432',
    database: parsed.database || '',
    user: parsed.user || '',
    password: parsed.password || '',
  };
}

/**
 * List every object under a prefix, paginating past ListObjectsV2's
 * 1000-key page cap (unlike the retired GCS SDK's `bucket.getFiles()`,
 * which auto-paginated internally), invoking `onPage` once per page instead
 * of buffering the full listing in memory (F8 fold 2026-07-20, Gemini — a
 * bucket with years of daily backups could otherwise accumulate an
 * unbounded in-memory array before a single delete happens).
 * @param {S3Client} s3Client
 * @param {string} bucket
 * @param {string} prefix
 * @param {(page: { Key: string, LastModified: Date }[]) => Promise<void>} onPage
 * @returns {Promise<void>}
 */
async function listAllObjects(s3Client, bucket, prefix, onPage) {
  let continuationToken;
  do {
    const page = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    );
    await onPage(page.Contents || []);
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);
}

pipeline.run('backup-db', async (pool) => {

  // §R5 — Startup guard: BACKUP_S3_* is required in production but optional in
  // local dev. Emit SKIP (not throw) so the permits chain continues cleanly when
  // the destination is not configured — mirrors the retired BACKUP_GCS_BUCKET
  // guard's SKIP-if-unconfigured posture exactly (Spec 112 §4.2/§8).
  const rawEndpoint = process.env.BACKUP_S3_ENDPOINT;
  const rawBucket = process.env.BACKUP_S3_BUCKET;
  const rawAccessKeyId = process.env.BACKUP_S3_ACCESS_KEY_ID;
  const rawSecretAccessKey = process.env.BACKUP_S3_SECRET_ACCESS_KEY;
  if (!rawEndpoint?.trim() || !rawBucket?.trim() || !rawAccessKeyId?.trim() || !rawSecretAccessKey?.trim()) {
    pipeline.emitSummary({
      records_total: null,
      records_new: null,
      records_updated: null,
      records_meta: { skipped: true, reason: 'BACKUP_S3_* not fully configured — no backup on this environment' },
    });
    return;
  }

  const rawRetain = process.env.BACKUP_RETAIN_DAYS
    ? safeParsePositiveInt(process.env.BACKUP_RETAIN_DAYS, 'BACKUP_RETAIN_DAYS')
    : DEFAULT_RETAIN_DAYS;

  const config = ConfigSchema.parse({
    s3Endpoint: rawEndpoint.trim(),
    s3Bucket: rawBucket.trim(),
    s3AccessKeyId: rawAccessKeyId.trim(),
    s3SecretAccessKey: rawSecretAccessKey.trim(),
    s3Region: process.env.BACKUP_S3_REGION?.trim() || DEFAULT_S3_REGION,
    retainDays: rawRetain,
  });

  // §R5 — pg_dump target connection: SUPABASE_DATABASE_URL (cloud project),
  // falling back to DATABASE_URL (local stack) — Spec 113 §3 D14 env
  // contract. Parsed into discrete PG* args below rather than read from
  // discrete PG_HOST/PG_PORT/... env vars (Spec 112 §4.2).
  const connectionString = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;
  if (!connectionString?.trim()) {
    throw new Error('[backup-db] Neither SUPABASE_DATABASE_URL nor DATABASE_URL is set — cannot pg_dump.');
  }
  const pg = parseConnectionString(connectionString);

  // Non-loopback (cloud Supabase) targets require CA-pinned verify-full TLS
  // via libpq env vars — pg_dump/pg_restore are separate binaries that do
  // NOT go through scripts/lib/ssl-config.js's `pg`-pool ssl config object
  // (Spec 112 §4.2 TLS note); only the loopback-vs-cloud DECISION is
  // mirrored here via isLocalMode, reused rather than reimplemented so the
  // two never drift on what counts as "local".
  const targetIsLocal = isLocalMode({ connectionString });
  const tlsEnv = {};
  if (!targetIsLocal) {
    const caCertPath = process.env.SUPABASE_CA_CERT_PATH;
    if (!caCertPath) {
      throw new Error(
        '[backup-db] SUPABASE_CA_CERT_PATH is not set — a non-loopback pg_dump target requires ' +
          'CA-pinned verify-full TLS (Spec 113 §4). Refusing to pg_dump without a pinned CA.'
      );
    }
    tlsEnv.PGSSLMODE = 'verify-full';
    tlsEnv.PGSSLROOTCERT = caCertPath;
  }

  // §R6 — Advisory lock
  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {

    const startMs = Date.now();

    // §R3.5 — Single DB timestamp for consistent naming and emitSummary.
    // Using DB clock (not JS) per spec 47 §14.1. RUN_AT is used only as a
    // filename component and summary timestamp — no DB write occurs.
    const RUN_AT = await pipeline.getDbTimestamp(pool);

    const isoStamp = RUN_AT.toISOString().replace(/[:.]/g, '-');
    const dateStr = RUN_AT.toISOString().slice(0, 10);
    const objectName = `pg_dump/${dateStr}/${isoStamp}.dump`;
    const manifestObjectName = `pg_dump/${dateStr}/${isoStamp}.manifest.json`;

    pipeline.log.info('[backup-db]', 'Starting pg_dump', {
      bucket: config.s3Bucket,
      object: objectName,
      retain_days: config.retainDays,
      target_is_local: targetIsLocal,
    });

    const s3Client = new S3Client({
      endpoint: config.s3Endpoint,
      region: config.s3Region,
      credentials: {
        accessKeyId: config.s3AccessKeyId,
        secretAccessKey: config.s3SecretAccessKey,
      },
      // Path-style addressing is the safest universal default across
      // arbitrary S3-compatible providers (not every provider supports
      // virtual-hosted-style buckets the way AWS S3 does).
      forcePathStyle: true,
    });

    const pgArgs = [
      '--format=custom', '--no-password',
      '--host', pg.host,
      '--port', pg.port,
      '--username', pg.user,
      pg.database,
    ];

    // Stream pg_dump stdout directly into an S3 multipart upload — no temp
    // file on disk, and no need to know the dump size ahead of time.
    // NOTE: @aws-sdk/client-s3's PutObjectCommand does NOT reliably support
    // a raw Readable Body of unknown length (aws/aws-sdk-js-v3#5479,
    // #4979 — hangs on retry, "cannot determine length of [object Object]").
    // @aws-sdk/lib-storage's Upload wraps the same S3Client in a supported
    // multipart-upload flow built exactly for this case; added alongside
    // @aws-sdk/client-s3 rather than hand-rolling a buffering workaround.
    let backupSizeBytes = 0;
    // stdio[2] is 'pipe' (not 'inherit', F8 fold 2026-07-20, Gemini) so
    // pg_dump's stderr is captured into pgDumpStderrChunks below AND
    // simultaneously mirrored to this process's own stderr — no loss of
    // live log visibility, but a failure's root cause now also lands
    // inside pgDumpError's own message instead of only in a separate,
    // easily-scrolled-past log stream.
    const pgDump = spawn('pg_dump', pgArgs, {
      env: {
        ...process.env,
        PGPASSWORD: pg.password || '',
        ...tlsEnv,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    pgDump.stdout.on('data', (chunk) => { backupSizeBytes += chunk.length; });

    const pgDumpStderrChunks = [];
    pgDump.stderr.on('data', (chunk) => {
      pgDumpStderrChunks.push(chunk);
      process.stderr.write(chunk);
    });

    // pgDumpFailed guards against a truncated/corrupt upload "succeeding":
    // if pg_dump exits non-zero mid-stream, its stdout ends without an
    // explicit error (a clean EOF from the OS's point of view) — the S3
    // Upload would otherwise complete on a partial dump. Racing the upload
    // against pg_dump's own exit lets a non-zero exit override an
    // otherwise-successful-looking upload.
    let pgDumpFailed = false;
    let pgDumpError = null;
    const pgDumpExit = new Promise((resolve, reject) => {
      pgDump.on('error', (err) => {
        pgDumpFailed = true;
        pgDumpError = new Error(`[backup-db] pg_dump spawn error: ${err.message}`);
        reject(pgDumpError);
      });
      pgDump.on('close', (code) => {
        if (code !== 0) {
          pgDumpFailed = true;
          const stderrText = Buffer.concat(pgDumpStderrChunks).toString('utf-8').trim();
          pgDumpError = new Error(
            `[backup-db] pg_dump exited with code ${code}` +
              (stderrText ? `: ${stderrText}` : '')
          );
          reject(pgDumpError);
        } else {
          resolve();
        }
      });
    });

    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: config.s3Bucket,
        Key: objectName,
        Body: pgDump.stdout,
        ContentType: 'application/octet-stream',
        Metadata: { run_at: RUN_AT.toISOString(), spec: '112_backup_recovery' },
      },
    });

    try {
      await Promise.all([upload.done(), pgDumpExit]);
    } catch (err) {
      await upload.abort().catch((abortErr) => {
        pipeline.log.warn('[backup-db]', 'Upload abort after failure also failed (non-fatal, orphan multipart upload may remain)', {
          error: abortErr.message,
        });
      });
      // Surface pg_dump's own error as the root cause when it failed —
      // an S3 stream-abort error triggered BY that failure is a symptom,
      // not the cause.
      throw pgDumpFailed ? pgDumpError : err;
    }

    const destPath = `${config.s3Endpoint.replace(/\/+$/, '')}/${config.s3Bucket}/${objectName}`;
    pipeline.log.info('[backup-db]', 'Upload complete', {
      dest_path: destPath,
      size_bytes: backupSizeBytes,
    });

    // F8 fold 2026-07-20 (Gemini): a zero-byte dump is not a successful
    // backup, even though pg_dump exited 0 and the S3 upload "completed" —
    // an empty dump most plausibly means pg_dump wrote nothing before some
    // silent early termination this code didn't otherwise catch. Without
    // this throw, the audit_table row below would still record
    // backup_size_bytes=0/status=FAIL but the pipeline run itself would be
    // reported as a PASS-shaped Observer summary — a green run with a FAIL
    // audit row is exactly the trap Spec 47's audit-table convention exists
    // to prevent. Throwing here routes it through pipeline.run's normal
    // failed-run handling instead.
    if (backupSizeBytes === 0) {
      throw new Error(
        `[backup-db] pg_dump produced a 0-byte dump at ${destPath} — refusing to treat this as a successful backup.`
      );
    }

    // ── Baseline manifest sidecar (Spec 112 §4.2 — NEW) ──────────────────
    // Generalizes the one-time G10 gate baseline into a standing,
    // every-backup artifact restore-db.js diffs against. Reuses the exact
    // same read helpers scripts/validation/supabase-load-gates.js already
    // implements for the G10 gate (row counts, invalid-geom id sets,
    // sequence values, matview count, postgis version) rather than
    // duplicating that query surface here.
    const allTables = (await getBaseTables(pool)).filter((t) => !EXCLUDED_TABLES.includes(t));
    const rowCounts = await getRowCounts(pool, allTables);
    const invalidGeomIds = {
      parcels: await getInvalidGeomIds(pool, 'parcels'),
      building_footprints: await getInvalidGeomIds(pool, 'building_footprints'),
    };
    const sequenceValues = await getSequenceValues(pool);
    const mvMonthlyPermitStatsCount = await getMatviewCount(pool, 'mv_monthly_permit_stats');
    const postgisFullVersion = await getPostgisVersion(pool);

    const manifest = {
      run_at: RUN_AT.toISOString(),
      spec: '112_backup_recovery',
      row_counts: rowCounts,
      invalid_geom_ids: invalidGeomIds,
      sequence_values: sequenceValues,
      mv_monthly_permit_stats_count: mvMonthlyPermitStatsCount,
      postgis_full_version: postgisFullVersion,
    };
    const manifestBody = JSON.stringify(manifest);

    const manifestUpload = new Upload({
      client: s3Client,
      params: {
        Bucket: config.s3Bucket,
        Key: manifestObjectName,
        Body: manifestBody,
        ContentType: 'application/json',
        Metadata: { run_at: RUN_AT.toISOString(), spec: '112_backup_recovery' },
      },
    });
    await manifestUpload.done();
    const manifestPath = `${config.s3Endpoint.replace(/\/+$/, '')}/${config.s3Bucket}/${manifestObjectName}`;
    pipeline.log.info('[backup-db]', 'Manifest sidecar written', { manifest_path: manifestPath });

    // Retention pruning — non-fatal: a prune failure must not abort the backup.
    // Naturally prunes both `.dump` objects and their `.manifest.json`
    // sidecars, since both live under the same pg_dump/ prefix and are aged
    // individually by LastModified.
    let blobsPruned = 0;
    try {
      // F8 fold 2026-07-20 (Gemini): the cutoff is evaluated against actual
      // wall-clock "now" (Date.now()), not RUN_AT — RUN_AT is a DB-clock
      // timestamp captured before pg_dump/upload/manifest-generation ran
      // and exists to give this run's own artifacts a consistent identity
      // (per spec 47 §14.1's DB-clock-for-DB-writes rule), not to answer
      // "how old is too old to keep" for a purely local, non-DB-write
      // comparison against S3 object LastModified timestamps.
      const cutoff = new Date(Date.now() - config.retainDays * 86_400_000);
      // Filter page-by-page inside the listAllObjects callback (F8 fold,
      // Gemini) rather than buffering every object under pg_dump/ into one
      // array first — a bucket with years of daily backups could otherwise
      // hold the entire listing in memory before a single delete happens.
      const toDelete = [];
      await listAllObjects(s3Client, config.s3Bucket, 'pg_dump/', async (page) => {
        for (const o of page) {
          if (o.LastModified && o.LastModified < cutoff) toDelete.push(o);
        }
      });
      // S3 DeleteObjects accepts up to 1000 keys per call — batch rather
      // than one DeleteObjectCommand per key.
      for (let i = 0; i < toDelete.length; i += 1000) {
        const batch = toDelete.slice(i, i + 1000);
        await s3Client.send(
          new DeleteObjectsCommand({
            Bucket: config.s3Bucket,
            Delete: { Objects: batch.map((o) => ({ Key: o.Key })) },
          })
        );
        blobsPruned += batch.length;
      }
      pipeline.log.info('[backup-db]', `Pruned ${blobsPruned} old backup object(s)`, {
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
      { metric: 'dest_path',          value: destPath,         threshold: null,    status: 'INFO' },
      { metric: 'backup_size_bytes',  value: backupSizeBytes,  threshold: '> 0',   status: backupSizeBytes > 0 ? 'PASS' : 'FAIL' },
      { metric: 'manifest_path',      value: manifestPath,     threshold: null,    status: 'INFO' },
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
        dest_path: destPath,
        manifest_path: manifestPath,
        blobs_pruned: blobsPruned,
        retain_days: config.retainDays,
        audit_table: {
          phase: 112,
          name: 'DB Backup to S3-compatible storage',
          verdict: auditRows.some((r) => r.status === 'FAIL') ? 'FAIL'
                 : auditRows.some((r) => r.status === 'WARN') ? 'WARN'
                 : 'PASS',
          rows: auditRows,
        },
      },
    });

    // reads: pg_dump bypasses the pool for the dump itself, but the
    // manifest-sidecar generation (above) does read every base table plus
    // pg_sequences/pg_extension via scripts/validation/supabase-load-gates.js
    // — declared here so emitMeta reflects the real read surface, not the
    // pre-manifest-sidecar Observer framing.
    const readsMeta = {};
    for (const t of allTables) readsMeta[t] = ['*'];
    readsMeta.pg_sequences = ['sequencename', 'last_value'];
    readsMeta.pg_extension = ['extversion'];

    pipeline.emitMeta(
      readsMeta,
      {},   // writes: no DB tables written
      ['S3'],
    );

  }); // withAdvisoryLock

  if (!lockResult.acquired) return;
});
