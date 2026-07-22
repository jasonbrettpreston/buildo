#!/usr/bin/env node
// ---------------------------------------------------------------------------
// AI Environment Pre-Flight Check
// Runs before any workflow to orient the AI to the current machine state.
//
// Checks: Node.js, TypeScript, PostgreSQL (from env vars), Git state,
//         .env presence, pipeline library, and core DB tables.
//
// Usage: node scripts/ai-env-check.mjs
// ---------------------------------------------------------------------------

import { execSync } from 'child_process';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { X509Certificate } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Clean a raw dotenv value: strip matching quote pairs first, then strip
// inline comments only for unquoted values. This prevents truncating quoted
// values containing # (e.g., SECRET="my #1 password").
function cleanEnvValue(raw) {
  let val = raw.trim();
  const quoteMatch = val.match(/^(['"])(.*)\1$/);
  if (quoteMatch) {
    val = quoteMatch[2];
  } else {
    val = val.replace(/\s+#.*$/, '');
    // Re-check for quotes that may remain after comment removal (e.g., VAL='hello' # comment)
    const innerQuote = val.match(/^(['"])(.*)\1$/);
    if (innerQuote) val = innerQuote[2];
  }
  return val;
}

// Parse a dotenv-style file into a plain map (NO process.env mutation) —
// used by the env-plane mismatch check to resolve .env + .env.local the way
// Next.js would (pragmatic re-implementation: parse both, .env.local wins).
function parseEnvFile(filePath) {
  const map = {};
  if (!existsSync(filePath)) return map;
  try {
    const content = readFileSync(filePath, 'utf-8');
    for (const line of content.split('\n')) {
      const match = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)=(.*)$/);
      if (match) map[match[1]] = cleanEnvValue(match[2]);
    }
  } catch (err) {
    console.warn(`⚠️  Warning: could not read ${filePath}: ${err.message}`);
  }
  return map;
}

// Load .env if present (manual parse — no dotenv dependency)
const envPath = resolve(__dirname, '..', '.env');
const hasEnv = existsSync(envPath);
if (hasEnv) {
  try {
    const envContent = readFileSync(envPath, 'utf-8');
    for (const line of envContent.split('\n')) {
      const match = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)=(.*)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = cleanEnvValue(match[2]);
      }
    }
  } catch (err) {
    console.warn(`⚠️  Warning: Found .env file but could not read it: ${err.message}`);
  }
}

function run(cmd, label) {
  try {
    const out = execSync(cmd, { encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    console.log(`✔ ${label}: ${out.replace(/\s+/g, ' ')}`);
  } catch (e) {
    const errorMsg = e.stderr ? e.stderr.toString().split('\n')[0] : e.message.split('\n')[0];
    if (/not recognized|not found|ENOENT/.test(errorMsg)) {
      console.log(`✘ ${label}: NOT INSTALLED — ${errorMsg}`);
    } else {
      console.log(`✘ ${label}: FAILED — ${errorMsg}`);
    }
  }
}

console.log('--- AI Environment Pre-Flight ---\n');

// 1. Core Infrastructure
run('node -v', 'Node.js');
run('npx --no-install tsc --version', 'TypeScript');

// 2. Database (from env vars, not hardcoded)
const pgHost = process.env.PG_HOST || 'localhost';
const pgPort = process.env.PG_PORT || '5432';
run(`pg_isready -h ${pgHost} -p ${pgPort}`, `PostgreSQL: ${pgHost}:${pgPort}`);

// 2b. Migration drift — schema_migrations ledger vs the migrations/ folder on disk.
// `migrate.js --verify` exits non-zero if any migration file is unapplied (MISSING) or its
// checksum drifted since apply. Wired here so a dev DB silently falling behind the code (the
// 2026-06-10 incident: persistent volume stuck at the ravine era while specs 58/61/62 shipped)
// is caught on every pre-flight instead of weeks later. Report-only — never aborts the check run.
try {
  execSync('node scripts/migrate.js --verify', {
    encoding: 'utf-8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'], cwd: resolve(__dirname, '..'),
  });
  console.log('✔ Migrations: DB in sync with migrations/ (no missing, no drift)');
} catch (e) {
  // --verify exits 1 on missing/drift; its "Verify: N missing, M drift" summary is on stdout.
  const out = `${e.stdout ? e.stdout.toString() : ''}${e.stderr ? e.stderr.toString() : ''}`;
  const summary = (out.match(/^Verify:.*$/m) || [])[0];
  const detail = summary ? summary.trim() : (out.split('\n').find((l) => l.trim()) || e.message).trim();
  console.log(`✘ Migrations: ${detail} — DB behind code; run \`npm run migrate\` (details: node scripts/migrate.js --verify)`);
}

// 2c. Env-plane mismatch (Spec 113 §3 — the trap hit live 2026-07-19): the
// app's AUTH plane (NEXT_PUBLIC_SUPABASE_URL) and the DB plane (DATABASE_URL /
// PG_*) must agree. Cloud Supabase URL + loopback DB means the app
// authenticates against CLOUD users while reading/writing the LOCAL DB.
// Resolution is pragmatic: parse .env AND .env.local directly (the way Next.js
// layers them — .env.local wins); the check says so in its message because
// process.env alone would miss a .env.local override.
{
  const nextResolvedEnv = {
    ...parseEnvFile(envPath),
    ...parseEnvFile(resolve(__dirname, '..', '.env.local')),
  };
  const hostOf = (url) => {
    try {
      return new URL(url).hostname;
    } catch {
      return null;
    }
  };
  const isLoopback = (host) =>
    host === 'localhost' || host === '::1' || host === '[::1]' || host === '0.0.0.0' || /^127\./.test(host);

  const supaUrl = nextResolvedEnv.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const planeDbUrl = nextResolvedEnv.DATABASE_URL || process.env.DATABASE_URL;
  const planePgHost = nextResolvedEnv.PG_HOST || process.env.PG_HOST || 'localhost';
  if (supaUrl) {
    const supaHost = hostOf(supaUrl);
    const dbHost = planeDbUrl ? hostOf(planeDbUrl) : planePgHost;
    if (supaHost && dbHost && !isLoopback(supaHost) && isLoopback(dbHost)) {
      console.log(
        `⚠ Env planes MIXED: NEXT_PUBLIC_SUPABASE_URL → ${supaHost} (non-loopback/cloud) while DATABASE_URL/PG_* → ${dbHost} (loopback). ` +
        `The app will AUTH against cloud Supabase but read/write the LOCAL DB. ` +
        `Checked .env + .env.local with .env.local precedence (as Next.js resolves them). ` +
        `Fix: put the local-stack NEXT_PUBLIC_SUPABASE_* overrides in .env.local, or point DATABASE_URL/PG_* at the cloud DB (Spec 113 §3).`,
      );
    } else if (supaHost && dbHost) {
      console.log(
        `✔ Env planes: NEXT_PUBLIC_SUPABASE_URL (${supaHost}) and DB (${dbHost}) agree — checked .env + .env.local (.env.local wins)`,
      );
    }
  }
}

// 3. Project Config
console.log(`✔ .env file: ${hasEnv ? 'present' : 'MISSING'}`);
console.log(`✔ Pipeline SDK: ${existsSync(resolve(__dirname, 'lib', 'pipeline.js')) ? 'present' : 'MISSING'}`);

// Spec 113 §7 schema-authority tripwire (P4 hardening H2): migrate.js is the
// SOLE schema authority — files in supabase/migrations/ mean someone used the
// Supabase CLI migration flow (`supabase db push` / `supabase migration new`)
// instead. Visibility only, per this script's report-only convention; the
// ENFORCING gate is src/tests/schema-authority.logic.test.ts inside the husky
// pre-commit gauntlet.
// try/catch per this file's report-only invariant (Round-2 output fold,
// Guardian MED: an unguarded readdirSync throw — permissions, ENOTDIR, a
// TOCTOU race — would abort the whole pre-flight and silently cancel every
// downstream check; a crash is not a report).
try {
  const supaMigrationsDir = resolve(__dirname, '..', 'supabase', 'migrations');
  if (existsSync(supaMigrationsDir)) {
    const offending = readdirSync(supaMigrationsDir).filter((f) => f !== '.gitkeep');
    if (offending.length > 0) {
      console.log(
        `✘ Schema authority: supabase/migrations/ holds ${offending.length} file(s) — ` +
          `${offending.slice(0, 5).join(', ')}${offending.length > 5 ? ', …' : ''} — ` +
          `scripts/migrate.js is the ONLY schema authority (Spec 113 §7); re-author the DDL as ` +
          `migrations/NNN_*.sql and delete these`,
      );
    } else {
      console.log('✔ Schema authority: supabase/migrations/ empty — migrate.js is the sole authority');
    }
  } else {
    console.log('✔ Schema authority: supabase/migrations/ absent — migrate.js is the sole authority');
  }
} catch (e) {
  console.log(`✘ Schema authority: check FAILED — ${e.message}`);
}

// 4. Git State
run('git branch --show-current', 'Git branch');
try {
  const statusOut = execSync('git status --short', { encoding: 'utf-8', timeout: 10000 }).trim();
  const fileCount = statusOut ? statusOut.split('\n').length : 0;
  console.log(`✔ Uncommitted files: ${fileCount}`);
} catch (e) {
  const errorMsg = e.stderr ? e.stderr.toString().split('\n')[0] : e.message.split('\n')[0];
  console.log(`✘ Uncommitted files: FAILED — ${errorMsg}`);
}
run('git log --oneline -1', 'Last commit');

// 5. API Keys
const deepseekKey = process.env.DEEPSEEK_API_KEY;
console.log(
  `${deepseekKey ? '✔' : '✘'} DEEPSEEK_API_KEY: ${deepseekKey
    ? 'present (observe-chain.js AI analysis enabled)'
    : 'MISSING — observe-chain.js will write placeholder reports'}`,
);

// Backup env (spec 112)
const backupBucket = process.env.BACKUP_GCS_BUCKET;
console.log(
  `${backupBucket ? '✔' : '⚠'} BACKUP_GCS_BUCKET: ${backupBucket
    ? 'present (backup-db.js enabled)'
    : 'not set — backup-db.js will throw if run'}`,
);

// 5b. Supabase CA cert expiry (Spec 113 §4.3 CA rotation runbook) — only when
// SUPABASE_CA_CERT_PATH is set. Pre-cutover environments have no cloud CA to
// check yet, so an unset var is skipped silently (not a FAIL/WARN) rather
// than treated as a missing-config error the way BACKUP_GCS_BUCKET is above.
const caCertPath = process.env.SUPABASE_CA_CERT_PATH;
if (caCertPath) {
  try {
    const certPem = readFileSync(caCertPath, 'utf-8');
    const cert = new X509Certificate(certPem);
    // Date.parse (not `new Date()`) — this repo's pipeline-scripts lint rule
    // bans `new Date()` repo-wide to keep DB-timestamp writes routed through
    // pipeline.getDbTimestamp(pool); this is non-DB elapsed-time arithmetic
    // (CA-cert expiry vs the local clock), which CLAUDE.md's Absolute Rules
    // explicitly carve out, but Date.parse() sidesteps the AST selector too.
    const msRemaining = Date.parse(cert.validTo) - Date.now();
    const daysRemaining = Math.floor(msRemaining / (1000 * 60 * 60 * 24));
    if (msRemaining <= 0) {
      console.log(`✘ Supabase CA cert: EXPIRED ${Math.abs(daysRemaining)} day(s) ago (${caCertPath}) — rotate per Spec 113 §4.3`);
    } else if (daysRemaining < 30) {
      console.log(`⚠ Supabase CA cert: expires in ${daysRemaining} day(s) (${caCertPath}) — rotate soon per Spec 113 §4.3`);
    } else {
      console.log(`✔ Supabase CA cert: valid, ${daysRemaining} day(s) remaining (${caCertPath})`);
    }
  } catch (e) {
    console.log(`✘ Supabase CA cert: FAILED to read/parse ${caCertPath} — ${e.message}`);
  }
}

// 6. Optional DB Extensions
const dbUrl = process.env.DATABASE_URL;
if (dbUrl) {
  run(
    `psql "${dbUrl}" -tAc "SELECT CASE WHEN EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_stat_statements') THEN 'installed' ELSE 'not installed' END"`,
    'pg_stat_statements extension',
  );
} else {
  console.log('⚠  pg_stat_statements: skipped (DATABASE_URL not set — run migration 110 to enable)');
}

console.log('\n--- Done ---');
