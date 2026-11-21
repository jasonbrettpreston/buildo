// SPEC LINK: docs/specs/01-pipeline/132_step_standard_handbook.md x-tooling.1 (a test that needs Postgres is *.db.test.ts, run only by npm run test:db),
//            docs/specs/01-pipeline/124_step_standard_policy.md R-EB (b) (gate and tooling variables, R-CV pinned form),
//            docs/specs/00-architecture/08_agents.md:511 (MCINC-7: every DB job is rehearsed on the test stack first).
//
// task-375 D10b: the registered variable the proof slice runner reads its timeout from exists in the logic_variables table with a value the runner accepts, and it equals the pinned seed.
// WRITTEN, NOT RUN by the lane that built it (no DB connection in that lane): the variable is registered by a seed + migration the operator authorises with a typed GO after the MCINC-7 rehearsal.
// Skipped unless BUILDO_TEST_DB=1 (or CI DATABASE_URL).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TIMEOUT_VARIABLE, timeoutMsFromVariable } from '../../scripts/analysis/proof-slice.mjs';
import { dbAvailable, getTestPool } from './db/setup-testcontainer';

describe.skipIf(!dbAvailable())('proof-slice timeout variable (live DB)', () => {
  let pool: Pool;
  beforeAll(() => { pool = getTestPool() as Pool; });
  afterAll(async () => { await pool.end().catch(() => undefined); });

  it('the variable is in logic_variables and its value is a positive integer the runner accepts', async () => {
    const { rows } = await pool.query('SELECT variable_value FROM logic_variables WHERE variable_key = $1', [TIMEOUT_VARIABLE]);
    expect(rows, `${TIMEOUT_VARIABLE} is not registered in logic_variables`).toHaveLength(1);
    expect(timeoutMsFromVariable(rows[0].variable_value)).toBeGreaterThan(0);
  });
  it('the database value equals the pinned seed default (R-CV form: min = max = default)', async () => {
    const seed = JSON.parse(readFileSync(join(process.cwd(), 'scripts/seeds/logic_variables.json'), 'utf8')) as Record<string, { default: number; min: number; max: number }>;
    const entry = seed[TIMEOUT_VARIABLE];
    expect(entry, `${TIMEOUT_VARIABLE} is not in the seed`).toBeDefined();
    expect(entry!.min).toBe(entry!.default);
    expect(entry!.max).toBe(entry!.default);
    const { rows } = await pool.query('SELECT variable_value FROM logic_variables WHERE variable_key = $1', [TIMEOUT_VARIABLE]);
    expect(timeoutMsFromVariable(rows[0].variable_value)).toBe(entry!.default);
  });
});
