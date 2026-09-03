// 🔗 SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §6.4
//
// WF3 cloud-parity FIX 1.6 (.cursor/wf3_cloud_parity_active_task.md, Fold E,
// 2026-09-03): FIX 1.2's original documented cloud command was
//   `node -e "process.env.DATABASE_URL=...; require('./scripts/seeds/apply-logic-variables.js')"`
// which is a SILENT NO-OP — apply-logic-variables.js guards its standalone
// block with `require.main === module`, so a bare `require()` from an `-e`
// wrapper loads the module and never calls it. This test proves the
// CORRECTED command (docs/runbook/README.md §3 rule 1a — direct invocation,
// `node -r dotenv/config scripts/seeds/apply-logic-variables.js`) actually
// spawns a process that inserts. RED-first: reverting to the `-e require()`
// form (or removing the `require.main` guard's early-exit) makes this fail —
// the child process would report 0 inserted for the deliberately-deleted key.
//
// Skipped unless BUILDO_TEST_DB=1 (or CI DATABASE_URL).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import type { Pool } from 'pg';
import { dbAvailable, getTestPool } from './setup-testcontainer';

// A real, non-obscure key from scripts/seeds/logic_variables.json. Chosen
// because it participates in no other concurrent db.test.ts file's fixtures;
// the test re-inserts it at its exact seed default (via the loader itself,
// twice), so the test DB is left in the SAME state it started in.
const FRESH_KEY = 'massing_shed_threshold_sqm';

const REPO_ROOT = path.resolve(__dirname, '../../..');

function runSeedCommand(): string {
  return execFileSync(
    'node',
    ['-r', 'dotenv/config', 'scripts/seeds/apply-logic-variables.js'],
    {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        DATABASE_URL: process.env.DATABASE_URL,
        PG_HOST: '', // cleared — never let a discrete PG_* triple win
      },
      encoding: 'utf-8',
    },
  );
}

describe.skipIf(!dbAvailable())('runbook §3 rule 1a — the documented seed command actually inserts', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = getTestPool() as Pool;
    // Global setup already ran `node scripts/migrate.js`, which calls this
    // SAME loader once — every seed key, including FRESH_KEY, already
    // exists. Delete FRESH_KEY to manufacture a genuinely missing row, the
    // only state a DO-NOTHING loader can prove it inserts.
    await pool.query(`DELETE FROM logic_variables WHERE variable_key = $1`, [FRESH_KEY]);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('first run: the child process reports the deleted key as newly inserted', async () => {
    const before = await pool.query(
      `SELECT 1 FROM logic_variables WHERE variable_key = $1`,
      [FRESH_KEY],
    );
    expect(before.rowCount).toBe(0);

    const output = runSeedCommand();
    expect(output).toMatch(/Seeds: \d+\/\d+ logic_variables rows inserted/);
    const [, insertedStr] = output.match(/Seeds: (\d+)\/\d+/) ?? [];
    expect(Number(insertedStr)).toBeGreaterThan(0);

    const after = await pool.query(
      `SELECT variable_value FROM logic_variables WHERE variable_key = $1`,
      [FRESH_KEY],
    );
    expect(after.rowCount).toBe(1);
  });

  it('second run (idempotent re-run): the same key is no longer newly inserted', async () => {
    const output = runSeedCommand();
    const [, insertedStr] = output.match(/Seeds: (\d+)\/\d+/) ?? [];
    // The whole table is now fully seeded (FRESH_KEY was restored by the
    // first run) — a re-run of the ENTIRE seed file must insert exactly 0.
    expect(Number(insertedStr)).toBe(0);
  });
});
