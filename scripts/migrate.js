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
      await pool.query(sql);
      console.log(`  OK`);
    } catch (err) {
      console.error(`  FAILED: ${err.message}`);
      process.exit(1);
    }
  }

  console.log('All migrations completed successfully');
  await pool.end();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
