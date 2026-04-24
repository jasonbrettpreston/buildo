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
import { existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env if present (manual parse — no dotenv dependency)
const envPath = resolve(__dirname, '..', '.env');
const hasEnv = existsSync(envPath);
if (hasEnv) {
  try {
    const envContent = readFileSync(envPath, 'utf-8');
    for (const line of envContent.split('\n')) {
      const match = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)=(.*)$/);
      if (match && !process.env[match[1]]) {
        let val = match[2].trim();
        // Strip matching quote pairs first, then strip inline comments only for unquoted values.
        // This prevents truncating quoted values containing # (e.g., SECRET="my #1 password").
        const quoteMatch = val.match(/^(['"])(.*)\1$/);
        if (quoteMatch) {
          val = quoteMatch[2];
        } else {
          val = val.replace(/\s+#.*$/, '');
          // Re-check for quotes that may remain after comment removal (e.g., VAL='hello' # comment)
          const innerQuote = val.match(/^(['"])(.*)\1$/);
          if (innerQuote) val = innerQuote[2];
        }
        process.env[match[1]] = val;
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

// 3. Project Config
console.log(`✔ .env file: ${hasEnv ? 'present' : 'MISSING'}`);
console.log(`✔ Pipeline SDK: ${existsSync(resolve(__dirname, 'lib', 'pipeline.js')) ? 'present' : 'MISSING'}`);

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
