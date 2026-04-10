#!/usr/bin/env node
/**
 * Simple PostgreSQL migration runner.
 * Runs all SQL files in /migrations/ in alphabetical order.
 *
 * Usage: node scripts/migrate.js
 * Requires DATABASE_URL or PG_* environment variables.
 */
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function run() {
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

  const migrationsDir = path.join(__dirname, '..', 'migrations');
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  console.log(`Found ${files.length} migration files`);

  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf-8');
    console.log(`Running ${file}...`);
    try {
      // Files containing CREATE INDEX CONCURRENTLY can NOT be sent as
      // a single multi-statement query — node-pg's simple-query
      // protocol wraps the batch in an implicit transaction, and
      // Postgres rejects CONCURRENTLY operations inside transaction
      // blocks. Detect this and run statements individually.
      // Phase 3-holistic WF2 (2026-04-09): silent breakage of the
      // BUILDO_TEST_DB=1 testcontainer harness via this exact
      // failure mode is how Phase 3-vi's lead_key regression slipped
      // through the cracks (no integration coverage). Fix unblocks
      // every *.db.test.ts file.
      if (/\bCONCURRENTLY\b/i.test(sql)) {
        for (const stmt of splitTopLevelStatements(sql)) {
          await pool.query(stmt);
        }
      } else {
        await pool.query(sql);
      }
      console.log(`  OK`);
    } catch (err) {
      console.error(`  FAILED: ${err.message}`);
      process.exit(1);
    }
  }

  console.log('All migrations completed successfully');
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
