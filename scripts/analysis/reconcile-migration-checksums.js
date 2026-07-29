#!/usr/bin/env node
/**
 * One-off: reconcile schema_migrations checksums to line-ending-normalized
 * hashing (2026-07-29).
 *
 * SPEC LINK: docs/specs/00-architecture/113_supabase_infrastructure.md §3
 *
 * Why: migrate.js originally hashed migration files byte-for-byte. 28
 * migrations were applied from a Windows worktree whose on-disk files were
 * CRLF while their committed git blobs are LF, so the recorded checksums
 * match only the CRLF bytes. The first Linux GH-runner checkout (LF)
 * reported 28 false DRIFTs and failed the chain-coa-permits pre-flight
 * (`migrate.js --verify`). migrate.js now hashes CRLF→LF-normalized
 * content; this script rewrites the pre-normalization rows to the
 * normalized hash so --verify agrees on every platform.
 *
 * Safety: UPDATE is guarded per-row on the exact old checksum (raw-bytes
 * hash of the local file) — a row that doesn't match the expected legacy
 * value is left untouched and reported. Idempotent: a second run matches
 * nothing. Read-only unless --apply is passed.
 *
 * Usage:
 *   node scripts/analysis/reconcile-migration-checksums.js --target=cloud [--apply]
 *   node scripts/analysis/reconcile-migration-checksums.js --target=local [--apply]
 *
 * --target=cloud reads SUPABASE_DATABASE_URL; --target=local reads
 * DATABASE_URL (the local Supabase stack). Both from .env.
 */
'use strict';
require('dotenv').config();
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { resolveSslConfig, stripSslParams } = require('../lib/ssl-config');

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

async function main() {
  const target = (process.argv.find((a) => a.startsWith('--target=')) || '').split('=')[1];
  const apply = process.argv.includes('--apply');
  if (target !== 'cloud' && target !== 'local') {
    throw new Error('Pass --target=cloud or --target=local');
  }
  const cs = target === 'cloud' ? process.env.SUPABASE_DATABASE_URL : process.env.DATABASE_URL;
  if (!cs) throw new Error(`${target === 'cloud' ? 'SUPABASE_DATABASE_URL' : 'DATABASE_URL'} is not set`);

  const pool = new Pool({
    connectionString: stripSslParams(cs),
    ssl: resolveSslConfig({ connectionString: cs }),
  });

  const dir = path.join(__dirname, '..', '..', 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

  const { rows } = await pool.query('SELECT filename, checksum FROM schema_migrations');
  const recorded = new Map(rows.map((r) => [r.filename, r.checksum]));

  let updated = 0, alreadyNormalized = 0, unexpected = 0, missing = 0;
  for (const file of files) {
    const raw = fs.readFileSync(path.join(dir, file));
    const rawHash = sha(raw);
    const normHash = sha(Buffer.from(raw.toString('utf8').replace(/\r\n/g, '\n')));
    const rec = recorded.get(file);
    if (rec === undefined) { missing++; console.log(`  MISSING IN DB: ${file}`); continue; }
    if (rec === normHash) { alreadyNormalized++; continue; }
    if (rec !== rawHash) {
      unexpected++;
      console.log(`  UNEXPECTED: ${file} recorded=${rec.slice(0, 12)} matches neither raw=${rawHash.slice(0, 12)} nor normalized=${normHash.slice(0, 12)} — left untouched`);
      continue;
    }
    if (apply) {
      const res = await pool.query(
        'UPDATE schema_migrations SET checksum = $1 WHERE filename = $2 AND checksum = $3',
        [normHash, file, rawHash]
      );
      console.log(`  UPDATED: ${file} ${rawHash.slice(0, 12)} -> ${normHash.slice(0, 12)} (${res.rowCount} row)`);
      updated += res.rowCount;
    } else {
      console.log(`  WOULD UPDATE: ${file} ${rawHash.slice(0, 12)} -> ${normHash.slice(0, 12)}`);
      updated++;
    }
  }
  console.log(`\n[${target}] ${apply ? 'updated' : 'would update'}=${updated} already-normalized=${alreadyNormalized} unexpected=${unexpected} not-in-db=${missing}`);
  await pool.end();
  if (unexpected > 0) process.exitCode = 2;
}

main().catch((err) => {
  console.error('[reconcile-migration-checksums] FAILED:', err.message);
  process.exitCode = 1;
});
