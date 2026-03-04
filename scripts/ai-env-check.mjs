#!/usr/bin/env node
// ---------------------------------------------------------------------------
// AI Environment Pre-Flight Check
// Runs before any workflow to orient the AI to the current machine state.
//
// Usage: node scripts/ai-env-check.mjs
// ---------------------------------------------------------------------------

import { execSync } from 'child_process';

function run(cmd, label) {
  try {
    const out = execSync(cmd, { encoding: 'utf-8', timeout: 10000 }).trim();
    console.log(`✔ ${label}: ${out}`);
  } catch (e) {
    console.log(`✘ ${label}: FAILED — ${e.message.split('\n')[0]}`);
  }
}

console.log('--- AI Environment Pre-Flight ---\n');

run('node -v', 'Node.js');
run('npx tsc --version', 'TypeScript');
run('pg_isready -h localhost -p 5432', 'PostgreSQL');
run('git branch --show-current', 'Git branch');
run('git status --short | wc -l', 'Uncommitted files');
run('git log --oneline -1', 'Last commit');

console.log('\n--- Done ---');
