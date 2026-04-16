#!/usr/bin/env node
/**
 * PostgreSQL migration runner with schema_migrations tracking.
 *
 * Tracks applied migrations in the `schema_migrations` table so repeat
 * invocations are idempotent and a partial-apply state (some files
 * ran, others didn't) becomes observable instead of silent.
 *
 * Columns tracked per row:
 *   - filename (PK)        — e.g. '067_permits_location_geom.sql'
 *   - applied_at           — when the file successfully finished
 *   - checksum             — SHA-256 of the file contents at apply time
 *                            (detects in-place edits to already-applied files)
 *   - duration_ms          — how long the file took
 *
 * Flags:
 *   --force       re-run all files, ignoring schema_migrations
 *   --dry-run     print what would run, don't execute
 *   --verify      exit non-zero if any checksum differs from what was applied
 *
 * Usage: node scripts/migrate.js [--force] [--dry-run] [--verify]
 * Requires DATABASE_URL or PG_* environment variables.
 *
 * WF3 2026-04-10: added tracking after two consecutive sessions uncovered
 * partial-apply state (migration 070 missing after later migrations ran;
 * migration 067 missing after postgis-less deploys). Root cause was the
 * "run everything every time" loop with no record of what was applied.
 */
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TRACKING_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    filename     TEXT PRIMARY KEY,
    applied_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    checksum     TEXT NOT NULL,
    duration_ms  INTEGER NOT NULL
  )
`;

function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

async function ensureTrackingTable(pool) {
  await pool.query(TRACKING_TABLE_SQL);
}

async function getAppliedMap(pool) {
  const res = await pool.query(
    'SELECT filename, checksum FROM schema_migrations'
  );
  const map = new Map();
  for (const row of res.rows) map.set(row.filename, row.checksum);
  return map;
}

async function recordApplied(pool, filename, checksum, durationMs) {
  await pool.query(
    `INSERT INTO schema_migrations (filename, checksum, duration_ms)
     VALUES ($1, $2, $3)
     ON CONFLICT (filename) DO UPDATE
       SET applied_at  = NOW(),
           checksum    = EXCLUDED.checksum,
           duration_ms = EXCLUDED.duration_ms`,
    [filename, checksum, durationMs]
  );
}

async function run() {
  const force = process.argv.includes('--force');
  const dryRun = process.argv.includes('--dry-run');
  const verifyOnly = process.argv.includes('--verify');

  const pool = new Pool(
    process.env.DATABASE_URL
      ? { connectionString: process.env.DATABASE_URL }
      : {
          host: process.env.PG_HOST || 'localhost',
          port: parseInt(process.env.PG_PORT || '5432', 10),
          database: process.env.PG_DATABASE || 'buildo',
          user: process.env.PG_USER || 'postgres',
          password: process.env.PG_PASSWORD || '',
        }
  );

  await ensureTrackingTable(pool);
  const applied = await getAppliedMap(pool);

  const migrationsDir = path.join(__dirname, '..', 'migrations');
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  console.log(`Found ${files.length} migration files`);
  console.log(`Tracking table reports ${applied.size} previously applied`);

  // --force safety: re-running all migrations can re-execute destructive
  // statements (DROP TABLE, TRUNCATE, ALTER DROP COLUMN). Warn + require
  // BUILDO_FORCE_CONFIRM=1 to proceed. WF3 review — adversarial C2.
  if (force) {
    console.warn('');
    console.warn('  ⚠  WARNING: --force will re-run ALL migrations including destructive ones');
    console.warn(`  ⚠  ${files.length} migrations will be executed from scratch.`);
    console.warn('  ⚠  This may DROP TABLES, TRUNCATE data, or revert schema changes.');
    console.warn('');
    if (process.env.BUILDO_FORCE_CONFIRM !== '1') {
      console.error('  Set BUILDO_FORCE_CONFIRM=1 to confirm and proceed.');
      process.exit(1);
    }
    console.warn('  BUILDO_FORCE_CONFIRM=1 set — proceeding.');
    console.warn('');
  }

  // --verify: checksum-only run. Exit non-zero on drift or missing files.
  if (verifyOnly) {
    let drift = 0;
    let missing = 0;
    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      const checksum = sha256(sql);
      const prev = applied.get(file);
      if (!prev) {
        console.log(`  MISSING: ${file} (not yet applied)`);
        missing++;
      } else if (prev !== checksum) {
        console.log(`  DRIFT:   ${file} (checksum changed since apply)`);
        drift++;
      }
    }
    console.log(`Verify: ${missing} missing, ${drift} drift`);
    await pool.end();
    if (missing > 0 || drift > 0) process.exit(1);
    return;
  }

  let ranCount = 0;
  let skippedCount = 0;
  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf-8');
    const checksum = sha256(sql);

    if (!force && applied.has(file)) {
      const prev = applied.get(file);
      if (prev === checksum) {
        skippedCount++;
        continue; // Already applied, unchanged — skip silently
      }
      // Checksum drift: the file was edited after being applied. Warn
      // but do NOT auto-rerun — rerunning a destructive migration on
      // live data is a footgun. Operator must explicitly decide.
      console.warn(
        `  WARN: ${file} was previously applied but its checksum has changed. ` +
        `Use --force to re-run, or revert the file.`
      );
      continue;
    }

    if (dryRun) {
      console.log(`Would run ${file}`);
      continue;
    }

    console.log(`Running ${file}...`);
    const startMs = Date.now();
    try {
      // Files containing CREATE INDEX CONCURRENTLY can NOT be sent as
      // a single multi-statement query — node-pg's simple-query
      // protocol wraps the batch in an implicit transaction, and
      // Postgres rejects CONCURRENTLY operations inside transaction
      // blocks. The CONCURRENTLY path CANNOT be wrapped in an explicit
      // transaction either, so apply+record is best-effort: if
      // recordApplied fails after the CONCURRENTLY path, the migration
      // runs again next time (idempotent via IF NOT EXISTS).
      //
      // WF3 2026-04-11 — strip SQL comments and dollar-quoted bodies
      // BEFORE testing for CONCURRENTLY so the detection isn't fooled
      // by operator-runbook comments that mention the keyword. Adversarial
      // review caught that migration 083's header documents the
      // `CREATE INDEX CONCURRENTLY` runbook in line comments, which
      // used to match the bare `/\bCONCURRENTLY\b/` regex and route
      // the whole migration through the non-transactional path —
      // making the DROP TRIGGER / CREATE TRIGGER cycle non-atomic and
      // the 221K-row backfill transaction-less. Comment stripping
      // restores the transactional path for migrations that only
      // reference CONCURRENTLY in documentation.
      const sqlNoComments = sql
        .replace(/--.*$/gm, '')                        // line comments
        .replace(/\/\*[\s\S]*?\*\//g, '')              // block comments
        .replace(/\$[A-Za-z0-9_]*\$[\s\S]*?\$[A-Za-z0-9_]*\$/g, ''); // dollar-quoted bodies
      if (/\bCONCURRENTLY\b/i.test(sqlNoComments)) {
        for (const stmt of splitTopLevelStatements(sql)) {
          await pool.query(stmt);
        }
        const durationMs = Date.now() - startMs;
        await recordApplied(pool, file, checksum, durationMs);
        console.log(`  OK (${durationMs}ms, concurrently)`);
      } else {
        // Atomic apply+record: run the migration AND the tracking INSERT
        // inside a single transaction. If recordApplied fails for any
        // reason (pool exhaustion, client timeout), the migration itself
        // rolls back — preventing the "destructive migration silently
        // re-runs next time" footgun flagged in WF3 review.
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await client.query(sql);
          await client.query(
            `INSERT INTO schema_migrations (filename, checksum, duration_ms)
             VALUES ($1, $2, $3)
             ON CONFLICT (filename) DO UPDATE
               SET applied_at  = NOW(),
                   checksum    = EXCLUDED.checksum,
                   duration_ms = EXCLUDED.duration_ms`,
            [file, checksum, Date.now() - startMs],
          );
          await client.query('COMMIT');
        } catch (err) {
          await client.query('ROLLBACK').catch(() => {});
          throw err;
        } finally {
          client.release();
        }
        console.log(`  OK (${Date.now() - startMs}ms)`);
      }
      ranCount++;
    } catch (err) {
      console.error(`  FAILED: ${err.message}`);
      process.exit(1);
    }
  }

  console.log(`Done: ${ranCount} applied, ${skippedCount} skipped (already applied)`);

  // Apply logic variable seeds after all migrations complete.
  // ON CONFLICT DO NOTHING: operator-tuned values in the DB are never overwritten.
  // Skipped on --dry-run and --verify (no mutations in those modes).
  if (!dryRun && !verifyOnly) {
    const applyLogicVariables = require('./seeds/apply-logic-variables');
    await applyLogicVariables(pool);
  }

  await pool.end();
}

/**
 * Split a SQL file into top-level statements by `;`, respecting
 * dollar-quoted blocks (`$$...$$` and `$tag$...$tag$`) and `--` line
 * comments + `/* ... *\/` block comments. Empty statements (comments
 * only) are dropped. Used by the CONCURRENTLY detection path so each
 * `CREATE INDEX CONCURRENTLY` runs as its own non-transactional query.
 *
 * NOT a general SQL parser — handles the specific subset that appears
 * in this project's migrations. If a future migration trips it, expand
 * here rather than working around it in the file.
 */
function splitTopLevelStatements(sql) {
  const stmts = [];
  let buf = '';
  let i = 0;
  const n = sql.length;
  let inLineComment = false;
  let inBlockComment = false;
  let dollarTag = null; // e.g. '$$' or '$tag$'

  while (i < n) {
    const ch = sql[i];
    const next = i + 1 < n ? sql[i + 1] : '';

    if (inLineComment) {
      buf += ch;
      if (ch === '\n') inLineComment = false;
      i += 1;
      continue;
    }
    if (inBlockComment) {
      buf += ch;
      if (ch === '*' && next === '/') {
        buf += next;
        i += 2;
        inBlockComment = false;
        continue;
      }
      i += 1;
      continue;
    }
    if (dollarTag) {
      buf += ch;
      if (sql.startsWith(dollarTag, i)) {
        buf += sql.slice(i + 1, i + dollarTag.length);
        i += dollarTag.length;
        dollarTag = null;
        continue;
      }
      i += 1;
      continue;
    }
    // Not in comment or dollar block — check for entry into one.
    if (ch === '-' && next === '-') {
      inLineComment = true;
      buf += ch;
      i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      buf += ch;
      i += 1;
      continue;
    }
    if (ch === '$') {
      // Match $tag$ where tag is [A-Za-z0-9_]*
      const m = sql.slice(i).match(/^\$([A-Za-z0-9_]*)\$/);
      if (m) {
        dollarTag = m[0];
        buf += dollarTag;
        i += dollarTag.length;
        continue;
      }
    }
    if (ch === ';') {
      const trimmed = buf.trim();
      if (trimmed.length > 0) stmts.push(trimmed);
      buf = '';
      i += 1;
      continue;
    }
    buf += ch;
    i += 1;
  }
  const tail = buf.trim();
  if (tail.length > 0) stmts.push(tail);
  // Drop comment-only statements (a `--` line followed by nothing else).
  return stmts.filter((s) => {
    const stripped = s
      .replace(/--.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .trim();
    return stripped.length > 0;
  });
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
