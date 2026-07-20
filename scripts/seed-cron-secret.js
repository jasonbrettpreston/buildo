#!/usr/bin/env node
/**
 * scripts/seed-cron-secret.js
 *
 * SPEC LINK: docs/specs/00-architecture/113_supabase_infrastructure.md §8.1, §11
 * SPEC LINK: migrations/234_vault_write_rpc.sql
 *
 * Operator-run, one-off ops script (docs/runbook/README.md "one-off script
 * index" convention — NOT a pipeline chain step, no manifest entry, not
 * registered in scripts/manifest.json; same "outside the Spec 47 skeleton"
 * category as scripts/migrate.js and scripts/bootstrap-first-admin.js).
 *
 * WHAT this does: generates a cryptographically random CRON_SECRET
 * (crypto.randomBytes(32), 256 bits of entropy, hex-encoded) and writes it
 * into Supabase Vault via the `public.vault_upsert_secret` RPC (migration
 * 234) over SUPABASE_DATABASE_URL — the service connection, never the
 * anon/publishable key. CRON_SECRET guards the HTTP-triggered manual
 * pipeline-trigger endpoint (Spec 113 §8.1), a DIFFERENT surface from the
 * scheduled GitHub Actions chain workflows (which authenticate via the
 * SUPABASE_DATABASE_URL secret itself, Postgres auth, not an
 * application-level shared secret — Spec 115 §3).
 *
 * WHAT this does NOT do: log, persist, or echo the generated secret
 * anywhere except a single stdout print at the end of a successful run.
 * There is no `--print-again` flag and no re-read path in this script — if
 * the operator loses the printed value before pasting it into GitHub
 * Secrets, the fix is to re-run this script (vault_upsert_secret is an
 * UPSERT-by-name, so re-running safely ROTATES the secret to a fresh
 * random value rather than erroring on a duplicate name), not to try to
 * recover the old value from anywhere this script touched.
 *
 * Idempotent by design (upsert-by-name), unlike bootstrap-first-admin.js —
 * re-running this script is the intended rotation mechanism, not a
 * failure-recovery special case.
 *
 * Usage:
 *   node -r dotenv/config scripts/seed-cron-secret.js
 *
 * Env vars:
 *   SUPABASE_DATABASE_URL   (required) — the cloud project's service
 *                             connection (Spec 113 §3 D14). No DATABASE_URL
 *                             fallback: CRON_SECRET is a production
 *                             HTTP-trigger credential, not something this
 *                             script should silently write to whichever
 *                             local stack happens to be configured.
 *   SUPABASE_CA_CERT_PATH   (required for a non-loopback target) — same
 *                             CA-pinned verify-full TLS contract as every
 *                             other cloud-project connection (Spec 113 §4).
 */
'use strict';

const crypto = require('crypto');
const { Pool } = require('pg');
const { resolveSslConfig } = require('./lib/ssl-config');

const SECRET_NAME = 'CRON_SECRET';
const SECRET_BYTES = 32; // 256 bits

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {string}
 */
function resolveConnectionString(env) {
  const connectionString = env.SUPABASE_DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'SUPABASE_DATABASE_URL is required. CRON_SECRET guards a production ' +
        'HTTP-trigger surface (Spec 113 §8.1) — this script deliberately has ' +
        'no DATABASE_URL/local-stack fallback, unlike most pipeline scripts.',
    );
  }
  return connectionString;
}

async function run() {
  const connectionString = resolveConnectionString(process.env);
  const pool = new Pool({
    connectionString,
    ssl: resolveSslConfig({ connectionString }),
  });

  const secret = crypto.randomBytes(SECRET_BYTES).toString('hex');

  try {
    const res = await pool.query(
      'SELECT public.vault_upsert_secret($1, $2) AS id',
      [SECRET_NAME, secret],
    );
    const secretId = res.rows[0]?.id;

    // Confirmation + the secret ONCE — the operator copies this into GitHub
    // Secrets (repo or environment scope) as CRON_SECRET, then closes this
    // terminal. Nothing else in this process writes the secret anywhere.
    console.log('');
    console.log(`[seed-cron-secret] CRON_SECRET written to Vault (id=${secretId}).`);
    console.log('[seed-cron-secret] Copy the value below into GitHub Secrets NOW — it is printed exactly once and never logged again:');
    console.log('');
    console.log(secret);
    console.log('');
  } catch (err) {
    // Postgres error code 42883 = undefined_function — the clearest signal
    // migration 234 has not been applied, or the vault schema/extension is
    // absent on this project (migration 234 NOTICE-skips RPC creation in
    // that case rather than failing outright — see its header for why).
    if (err.code === '42883') {
      throw new Error(
        '[seed-cron-secret] public.vault_upsert_secret(text, text) does not exist. ' +
          'Either migration 234_vault_write_rpc.sql has not been applied to this ' +
          'project yet, or the vault schema/extension is not installed here (the ' +
          'migration NOTICE-skips RPC creation on vault-less images — Docker/CI/' +
          'plain-local). Run `node scripts/migrate.js --verify` against this project ' +
          'to confirm 234 is applied, and check that Supabase Vault is enabled ' +
          '(Supabase dashboard -> Database -> Vault) before retrying.',
      );
    }
    if (err.code === '42501') {
      throw new Error(
        `[seed-cron-secret] Permission denied calling public.vault_upsert_secret — ` +
          'this RPC is EXECUTE-granted to service_role only (Spec 113 §11). Confirm ' +
          'SUPABASE_DATABASE_URL is the service connection, not an anon/publishable-' +
          'key-authenticated one.',
      );
    }
    throw err;
  } finally {
    await pool.end().catch(() => {});
  }
}

if (require.main === module) {
  run().catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}

module.exports = { run, resolveConnectionString, SECRET_NAME, SECRET_BYTES };
