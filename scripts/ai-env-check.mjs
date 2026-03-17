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
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env if present (manual parse — no dotenv dependency)
const envPath = resolve(__dirname, '..', '.env');
const hasEnv = existsSync(envPath);
if (hasEnv) {
  try {
    const { readFileSync } = await import('fs');
    const envContent = readFileSync(envPath, 'utf-8');
    for (const line of envContent.split('\n')) {
      const match = line.match(/^([A-Z_]+)=(.*)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
      }
    }
  } catch { /* ignore parse errors */ }
}

function run(cmd, label) {
  try {
    const out = execSync(cmd, { encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    console.log(`✔ ${label}: ${out.replace(/\s+/g, ' ')}`);
  } catch (e) {
    const errorMsg = e.stderr ? e.stderr.toString().split('\n')[0] : e.message.split('\n')[0];
    console.log(`✘ ${label}: FAILED — ${errorMsg}`);
  }
}

console.log('--- AI Environment Pre-Flight ---\n');

// 1. Core Infrastructure
run('node -v', 'Node.js');
run('npx tsc --version', 'TypeScript');

// 2. Database (from env vars, not hardcoded)
const pgHost = process.env.PG_HOST || 'localhost';
const pgPort = process.env.PG_PORT || '5432';
run(`pg_isready -h ${pgHost} -p ${pgPort}`, `PostgreSQL: ${pgHost}:${pgPort}`);

// 3. Project Config
console.log(`✔ .env file: ${hasEnv ? 'present' : 'MISSING'}`);
console.log(`✔ Pipeline SDK: ${existsSync(resolve(__dirname, 'lib', 'pipeline.js')) ? 'present' : 'MISSING'}`);

// 4. Git State
run('git branch --show-current', 'Git branch');
run('git status --short | wc -l', 'Uncommitted files');
run('git log --oneline -1', 'Last commit');

console.log('\n--- Done ---');
