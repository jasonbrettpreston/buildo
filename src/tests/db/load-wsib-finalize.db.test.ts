// SPEC LINK: docs/specs/01-pipeline/52_source_wsib.md
// SPEC LINK: docs/specs/00-architecture/115_scheduling.md §2.2
//
// Commit E (B3 output-panel remediation, E#1) — load-wsib.js's pipeline_runs
// 'running' row had no try/finally: any throw mid-run left it wedged forever.
// Since link-wsib.js's UPSTREAM_SLUGS includes load_wsib, a stranded row
// silently disables the B3 run-ledger gate's savings for link_wsib (it always
// sees non-completed upstream activity → always RUN) — invisible unless a
// human loads the admin dashboard (the only thing that ever reaped it).
//
// E-R1 (this file): a real throw mid-run (malformed CSV header) still
// finalizes the standalone pipeline_runs row to a terminal status ('failed'),
// proven via a REAL spawned child process (no manifest/chain — load-wsib.js
// only INSERTs its own pipeline_runs row when CHAIN_ID is unset, i.e. a bare
// `node scripts/load-wsib.js --file ...` invocation).
//
// Run: BUILDO_TEST_DB=1 npx vitest run src/tests/db/load-wsib-finalize.db.test.ts --no-file-parallelism

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';

const pool = getTestPool();
const REPO_ROOT = path.resolve(__dirname, '../../../');
const SCRIPT = path.join(REPO_ROOT, 'scripts/load-wsib.js');

describe.skipIf(!dbAvailable())('load-wsib.js — Commit E finalize (real child process, no CHAIN_ID)', () => {
  if (!pool) {
    if (process.env.BUILDO_TEST_DB === '1' || process.env.CI === 'true') {
      throw new Error('dbAvailable() is true but pool is missing — refusing to silently register zero tests.');
    }
    return;
  }

  // ── HARD ISOLATION GUARD (enrich-parcels-incremental.db.test.ts pattern, verbatim rationale) ──
  if (!process.env.DATABASE_URL) {
    throw new Error('dbAvailable() is true but DATABASE_URL is unset — refusing to spawn a child against an unknown database.');
  }
  const dbUrl = new URL(process.env.DATABASE_URL);
  const optedIn = process.env.BUILDO_TEST_DB === '1' || process.env.CI === 'true';
  const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
  if (!optedIn) {
    throw new Error(
      'load-wsib-finalize.db.test.ts spawns scripts/load-wsib.js against a real pool and inserts/finalizes ' +
      'pipeline_runs rows. Refusing to run without an explicit opt-in (BUILDO_TEST_DB=1 or CI=true).',
    );
  }
  if (!LOOPBACK.has(dbUrl.hostname)) {
    throw new Error(`Refusing to spawn a mutating child against non-loopback host "${dbUrl.hostname}".`);
  }
  const childEnv: Record<string, string> = {
    ...(process.env as Record<string, string>),
    PG_HOST: dbUrl.hostname,
    PG_PORT: dbUrl.port,
    PG_USER: dbUrl.username,
    PG_PASSWORD: dbUrl.password,
    PG_DATABASE: dbUrl.pathname.slice(1),
  };
  // Standalone invocation — CHAIN_ID must be UNSET so load-wsib.js takes the
  // branch that INSERTs its own pipeline_runs row (the branch this defect lives in).
  delete childEnv.PIPELINE_CHAIN;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'load-wsib-finalize-'));

  afterEach(async () => {
    await pool!.query(`DELETE FROM pipeline_runs WHERE pipeline = 'load_wsib'`);
  });

  function writeCsv(content: string): string {
    const p = path.join(tmpDir, `fixture-${Date.now()}-${Math.random().toString(36).slice(2)}.csv`);
    fs.writeFileSync(p, content, 'utf8');
    return p;
  }

  it('E-R1: a malformed-header CSV throws mid-parse, and the finally block STILL finalizes the row to a terminal status (not left running)', async () => {
    // Missing 'Legal name' (a required header) — load-wsib.js's parser.on('data')
    // header-validation branch calls parser.destroy(new Error(...)) on the FIRST
    // row, which rejects the parse promise and throws inside the try block.
    const badCsv = writeCsv('Predominant class,Mailing Address\nG1,123 Test St\n');

    const r = spawnSync('node', [SCRIPT, '--file', badCsv], {
      env: childEnv as NodeJS.ProcessEnv,
      encoding: 'utf8',
      timeout: 30_000,
    });
    expect(r.error, `child failed to spawn: ${r.error?.message}`).toBeUndefined();
    expect(r.status, 'a thrown Schema drift error must exit non-zero').not.toBe(0);
    expect((r.stderr ?? '') + (r.stdout ?? '')).toMatch(/Schema drift/);

    const { rows } = await pool!.query(
      `SELECT status, completed_at FROM pipeline_runs WHERE pipeline = 'load_wsib' ORDER BY started_at DESC LIMIT 1`,
    );
    expect(rows.length, 'load-wsib.js must have INSERTed its own pipeline_runs row (standalone, no CHAIN_ID)').toBe(1);
    // THE fix: pre-Commit-E this row would still read status='running', completed_at=NULL forever.
    expect(rows[0].status).not.toBe('running');
    expect(rows[0].status).toBe('failed');
    expect(rows[0].completed_at).not.toBeNull();
  }, 30_000);

  it('a genuinely missing file (no rows parsed at all, throws before the parser even starts) also finalizes to a terminal status', async () => {
    const r = spawnSync('node', [SCRIPT, '--file', path.join(tmpDir, 'does-not-exist.csv')], {
      env: childEnv as NodeJS.ProcessEnv,
      encoding: 'utf8',
      timeout: 30_000,
    });
    expect(r.error).toBeUndefined();
    expect(r.status).not.toBe(0);

    const { rows } = await pool!.query(
      `SELECT status FROM pipeline_runs WHERE pipeline = 'load_wsib' ORDER BY started_at DESC LIMIT 1`,
    );
    // 'File not found' throws BEFORE the advisory lock / runId INSERT (Spec 47
    // §R5 startup guard, unrelated to Commit E) — so there is legitimately no
    // row to finalize here. Documents the boundary rather than asserting a row.
    if (rows.length > 0) {
      expect(rows[0].status).not.toBe('running');
    }
  }, 30_000);
});
