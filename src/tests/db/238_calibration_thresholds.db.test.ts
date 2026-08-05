// 🔗 SPEC LINK: docs/specs/01-pipeline/85_trade_forecast_engine.md §3.6 (audit-verdict thresholds
//   + the GRD-F1 mechanical re-tightening guard)
//
// Live-DB proof of migration 238 (restore the STRICT calibration verdict pair 20/50).
//
// WHY THIS TEST EXISTS IN THIS SHAPE (plan panel, Schema-Fidelity + Integration, 2026-08-05):
// a plain `test:db` run CANNOT exercise 238. The two keys are created ONLY by
// scripts/seeds/apply-logic-variables.js, and scripts/migrate.js runs that seed loader AFTER
// all migrations — so on the fresh testcontainer the rows do not exist when 238 executes and
// its guarded UPDATE matches zero rows, always. An assertion that merely read "the value is 20"
// would therefore pass off the SEED and prove nothing about the migration.
//
// This test instead RE-CREATES the pre-migration state (70/85) and executes 238's own UP block
// read from the migration file, so what is proven is the migration's SQL, not the seed's.
// Skipped unless BUILDO_TEST_DB=1 (or CI DATABASE_URL).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { dbAvailable, getTestPool } from './setup-testcontainer';

const WARN_KEY = 'forecast_default_calibration_warn_pct';
const FAIL_KEY = 'forecast_default_calibration_fail_pct';

/** The migration's UP block only — the DOWN block is all comments (validate-migration Rule 6). */
function migration238Up(): string {
  const sql = readFileSync(
    join(process.cwd(), 'migrations/238_restore_strict_calibration_thresholds.sql'),
    'utf8',
  );
  const up = sql.split('-- UP')[1]?.split('-- DOWN')[0];
  if (!up || !up.trim()) throw new Error('238: could not extract the UP block');
  return up;
}

type SeedEntry = { default: number; description: string };

/** The seed JSON is the single source of truth for both the value and the description. */
function readSeed(): Record<string, SeedEntry | undefined> {
  return JSON.parse(readFileSync(join(process.cwd(), 'scripts/seeds/logic_variables.json'), 'utf8')) as Record<
    string,
    SeedEntry | undefined
  >;
}

async function valueOf(pool: Pool, key: string): Promise<number> {
  const { rows } = await pool.query('SELECT variable_value FROM logic_variables WHERE variable_key = $1', [key]);
  return Number(rows[0]?.variable_value);
}

async function descriptionOf(pool: Pool, key: string): Promise<string> {
  const { rows } = await pool.query('SELECT description FROM logic_variables WHERE variable_key = $1', [key]);
  return String(rows[0]?.description ?? '');
}

/** Put both rows back to the pre-238 relaxed pair so the migration has something to do. */
async function restoreRelaxedState(pool: Pool): Promise<void> {
  await pool.query(
    `UPDATE logic_variables SET variable_value = 70, description = 'pre-238 relaxed placeholder'
      WHERE variable_key = $1`,
    [WARN_KEY],
  );
  await pool.query(
    `UPDATE logic_variables SET variable_value = 85, description = 'pre-238 relaxed placeholder'
      WHERE variable_key = $1`,
    [FAIL_KEY],
  );
}

describe.skipIf(!dbAvailable())('migration 238 — restore strict calibration thresholds', () => {
  let pool: Pool;

  beforeAll(() => {
    pool = getTestPool() as Pool;
  });

  beforeEach(async () => {
    await restoreRelaxedState(pool);
  });

  afterAll(async () => {
    // Leave the container in the post-migration state the seed/migration pair intends.
    // This must be UNCONDITIONAL: the operator-override test below deliberately parks a value
    // (40) that migration 238's guard can never match, so re-running the guarded UP block here
    // would silently no-op and strand the shared testcontainer at 40 for every db test that
    // runs after this file (the suite is --no-file-parallelism, one DB for all files).
    const seed = readSeed();
    for (const key of [WARN_KEY, FAIL_KEY]) {
      const entry = seed[key];
      if (!entry) throw new Error(`238 cleanup: ${key} is missing from the seed JSON`);
      await pool.query('UPDATE logic_variables SET variable_value = $1, description = $2 WHERE variable_key = $3', [
        entry.default,
        entry.description,
        key,
      ]);
    }
  });

  it('flips the relaxed pair 70/85 to the strict pair 20/50', async () => {
    expect(await valueOf(pool, WARN_KEY)).toBe(70);
    expect(await valueOf(pool, FAIL_KEY)).toBe(85);

    await pool.query(migration238Up());

    expect(await valueOf(pool, WARN_KEY)).toBe(20);
    expect(await valueOf(pool, FAIL_KEY)).toBe(50);
  });

  it('rewrites description alongside the value — the seed loader never would', async () => {
    // ON CONFLICT DO NOTHING means an existing row's description is frozen forever; without
    // this the Control Panel would render "restore 20 once cohort fill recovers past 80%"
    // next to a value of 20 — the self-announcing lie the migration exists to retire.
    await pool.query(migration238Up());

    for (const key of [WARN_KEY, FAIL_KEY]) {
      const description = await descriptionOf(pool, key);
      expect(description).not.toBe('pre-238 relaxed placeholder');
      expect(description).toContain('STRICT baseline, restored 2026-08-05 by migration 238');
    }
  });

  it("keeps the migration's description byte-identical to the seed's", async () => {
    // scripts/generate-logic-vars-docs.mjs renders the SEED string for any key present in the
    // seed and skips the migration-derived entry, so a divergence silently documents text the
    // database does not hold — invisible to the registry's own --check gate.
    const seed = readSeed();
    await pool.query(migration238Up());

    for (const key of [WARN_KEY, FAIL_KEY]) {
      expect(await descriptionOf(pool, key)).toBe(seed[key]?.description);
    }
  });

  it('is idempotent — a re-apply changes nothing', async () => {
    await pool.query(migration238Up());
    const before = await descriptionOf(pool, WARN_KEY);

    await pool.query(migration238Up());

    expect(await valueOf(pool, WARN_KEY)).toBe(20);
    expect(await valueOf(pool, FAIL_KEY)).toBe(50);
    expect(await descriptionOf(pool, WARN_KEY)).toBe(before);
  });

  it('never clobbers a deliberate operator override', async () => {
    // The guard is on the exact value being replaced, so a pair an operator has since tuned to
    // some third value is left alone — a future re-relaxation cannot be silently undone by a
    // migration re-apply.
    await pool.query('UPDATE logic_variables SET variable_value = 40 WHERE variable_key = $1', [WARN_KEY]);

    await pool.query(migration238Up());

    expect(await valueOf(pool, WARN_KEY)).toBe(40);
  });
});
