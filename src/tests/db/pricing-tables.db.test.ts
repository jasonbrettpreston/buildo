// 🔗 SPEC LINK: docs/specs/01-pipeline/88_parcel_cost_model.md §2.3 (line catalogue)
//   + docs/specs/01-pipeline/124_step_standard_policy.md R-AU (declared INTERIM state, closing row)
//
// Live-DB proof of migration 248 (parcel_cost_lines — the editable half of the 13-line cost
// catalogue, batch-2 row 2.5 C0):
//   (a) the seeded table equals src/tests/fixtures/parcel-cost-lines.seed.json byte-for-byte AND
//       equals a fresh derivation from scripts/lib/parcel-cost.js PARCEL_COST_LINES — locking seed
//       ≡ fixture ≡ module literals from both sides (a drift in any one of the three is caught);
//   (b) the archetype FK refuses an unknown archetype; the base_confidence CHECK refuses 'urgent';
//   (c) RLS is enabled (bare, no policy — Spec 88 §2.3 / 227's form) on both parcel_cost_lines and
//       archetype_cost_rates;
//   (d) re-running the migration's own INSERT statement is a no-op (0 rows — ON CONFLICT DO NOTHING).
// Skipped unless BUILDO_TEST_DB=1 (or CI DATABASE_URL).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { dbAvailable, getTestPool } from './setup-testcontainer';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- scripts/lib is CommonJS
const { PARCEL_COST_LINES } = require('../../../scripts/lib/parcel-cost.js') as {
  PARCEL_COST_LINES: ReadonlyArray<{
    id: string;
    archetype: string;
    baseConfidence: 'high' | 'medium' | 'low';
    fitField?: string;
  }>;
};

type LineRow = {
  id: string;
  archetype: string;
  base_confidence: 'high' | 'medium' | 'low';
  fit_permitted_values: string[] | null;
};

/** The fixture is the single source of truth the DB seed is proven against (generated from the module — see D1/E1). */
function readFixture(): LineRow[] {
  return JSON.parse(
    readFileSync(join(process.cwd(), 'src/tests/fixtures/parcel-cost-lines.seed.json'), 'utf8'),
  ) as LineRow[];
}

/** Fresh derivation straight from PARCEL_COST_LINES — the module-literals side of the lock. */
function deriveFromModule(): LineRow[] {
  return [...PARCEL_COST_LINES]
    .map((line) => ({
      id: line.id,
      archetype: line.archetype,
      base_confidence: line.baseConfidence,
      fit_permitted_values: line.fitField ? ['as_of_right', 'coa_required'] : null,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** The migration's own INSERT ... ON CONFLICT DO NOTHING statement, extracted verbatim from the file on disk. */
function migration248InsertStatement(): string {
  const sql = readFileSync(join(process.cwd(), 'migrations/248_parcel_cost_lines.sql'), 'utf8');
  const match = /INSERT INTO parcel_cost_lines[\s\S]*?ON CONFLICT \(id\) DO NOTHING;/.exec(sql);
  if (!match) throw new Error('248: could not extract the INSERT statement');
  return match[0];
}

describe.skipIf(!dbAvailable())('migration 248 — parcel_cost_lines (live DB)', () => {
  let pool: Pool;

  beforeAll(() => {
    pool = getTestPool() as Pool;
  });

  afterAll(async () => {
    await pool.end();
  });

  it('seed equals the fixture byte-for-byte AND equals a fresh module derivation', async () => {
    const { rows } = await pool.query<LineRow>(
      `SELECT id, archetype, base_confidence, fit_permitted_values
         FROM parcel_cost_lines
        ORDER BY id`,
    );

    const fixture = [...readFixture()].sort((a, b) => a.id.localeCompare(b.id));
    const fromModule = deriveFromModule();

    expect(rows).toHaveLength(13);
    expect(rows).toEqual(fixture);
    expect(rows).toEqual(fromModule);
    expect(fixture).toEqual(fromModule);
  });

  it('the archetype FK refuses an unknown archetype', async () => {
    await expect(
      pool.query(
        `INSERT INTO parcel_cost_lines (id, archetype, base_confidence) VALUES ('test_fk_row', 'NOPE', 'high')`,
      ),
    ).rejects.toThrow(/foreign key constraint/);
  });

  it("the base_confidence CHECK refuses 'urgent'", async () => {
    await expect(
      pool.query(
        `INSERT INTO parcel_cost_lines (id, archetype, base_confidence) VALUES ('test_chk_row', 'FB', 'urgent')`,
      ),
    ).rejects.toThrow(/violates check constraint/);
  });

  it('RLS is enabled (bare, no policy) on both pricing tables', async () => {
    const rls = await pool.query<{ relname: string; relrowsecurity: boolean }>(
      `SELECT relname, relrowsecurity FROM pg_class
        WHERE relname IN ('parcel_cost_lines', 'archetype_cost_rates')`,
    );
    expect(rls.rows).toHaveLength(2);
    for (const row of rls.rows) expect(row.relrowsecurity).toBe(true);

    const policies = await pool.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM pg_policies
        WHERE tablename IN ('parcel_cost_lines', 'archetype_cost_rates')`,
    );
    expect(policies.rows[0]?.n).toBe(0);
  });

  it("re-running the migration's INSERT is a no-op (0 rows)", async () => {
    const before = await pool.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM parcel_cost_lines');
    expect(before.rows[0]?.n).toBe(13);

    const res = await pool.query(migration248InsertStatement());
    expect(res.rowCount).toBe(0);

    const after = await pool.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM parcel_cost_lines');
    expect(after.rows[0]?.n).toBe(13);
  });
});
