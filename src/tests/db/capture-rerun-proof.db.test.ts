// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.0-§1.1 (idempotent_rerun)
//
// Live-DB proof of the two-run zero-writes measurement (WF2 "conversion
// simplification" item 7, `scripts/analysis/capture-rerun-proof.js`). The
// logic test pins the decision table against a fake pool; this pins the xmin
// probe itself against real Postgres:
//   (a) a "second run" that rewrites every row with IDENTICAL values (the
//       LS018 / B4.5 unguarded-UPDATE class) is caught — row count and content
//       are unchanged, yet the proof FAILs with the exact rewrite count;
//   (b) a guarded (IS DISTINCT FROM) second run over unchanged data PASSes;
//   (c) a second run that only DELETEs is caught by the row-count delta.
// Skipped unless BUILDO_TEST_DB=1 (or CI DATABASE_URL).
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { Pool } from 'pg';
import { createRequire } from 'node:module';
import { dbAvailable, getTestPool } from './setup-testcontainer';

const require = createRequire(import.meta.url);
const { measureRerun, rerunProofDecision } = require('../../../scripts/analysis/capture-rerun-proof.js');

const TABLE = '_capture_rerun_proof_fixture';
const ROWS = 20;
const TABLES = [{ table: TABLE, mode: 'strict' }];

describe.skipIf(!dbAvailable())('capture rerun proof — xmin rewrite probe (live DB)', () => {
  let pool: Pool;
  beforeAll(async () => {
    pool = getTestPool() as Pool;
    await pool.query(`CREATE TABLE IF NOT EXISTS ${TABLE} (id int PRIMARY KEY, v text NOT NULL)`);
  });
  beforeEach(async () => {
    await pool.query(`TRUNCATE ${TABLE}`);
    await pool.query(`INSERT INTO ${TABLE} (id, v) SELECT g, 'v' || g FROM generate_series(1, ${ROWS}) g`);
  });
  afterAll(async () => {
    await pool.query(`DROP TABLE IF EXISTS ${TABLE}`);
    await pool.end();
  });

  it('(a) an identical-value rewrite of every row FAILs with the rewrite count', async () => {
    const { measured, run2 } = await measureRerun(pool, TABLES, async () => {
      await pool.query(`UPDATE ${TABLE} SET v = v`);
      return { exit_code: 0, skipped: false };
    });
    const d = rerunProofDecision({ tables: TABLES, measured, run2 });
    expect(measured[TABLE]).toEqual({ rewritten: ROWS, rows_before: ROWS, rows_after: ROWS });
    expect(d.answer).toBe('FAIL');
    expect(d.reason).toContain(`${TABLE}: ${ROWS} row(s) rewritten`);
  });

  it('(b) a guarded second run over unchanged data PASSes', async () => {
    const { measured, run2 } = await measureRerun(pool, TABLES, async () => {
      await pool.query(`UPDATE ${TABLE} t SET v = s.v FROM ${TABLE} s WHERE s.id = t.id AND t.v IS DISTINCT FROM s.v`);
      return { exit_code: 0, skipped: false };
    });
    const d = rerunProofDecision({ tables: TABLES, measured, run2 });
    expect(measured[TABLE].rewritten).toBe(0);
    expect(d.answer).toBe('PASS');
  });

  it('(c) a delete-only second run FAILs on the row delta', async () => {
    const { measured, run2 } = await measureRerun(pool, TABLES, async () => {
      await pool.query(`DELETE FROM ${TABLE} WHERE id = 1`);
      return { exit_code: 0, skipped: false };
    });
    const d = rerunProofDecision({ tables: TABLES, measured, run2 });
    expect(measured[TABLE]).toMatchObject({ rewritten: 0, rows_before: ROWS, rows_after: ROWS - 1 });
    expect(d.answer).toBe('FAIL');
  });
});
