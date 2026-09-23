// 🔗 SPEC LINK: docs/specs/01-pipeline/88_parcel_cost_model.md §2.3 (line catalogue)
//   + docs/specs/01-pipeline/124_step_standard_policy.md R-AU (declared INTERIM state, closing row)
//
// Live-DB proof of migration 248 (parcel_cost_lines — the editable half of the 13-line cost
// catalogue, batch-2 row 2.5 C0):
//   (a) the seeded table equals src/tests/fixtures/parcel-cost-lines.seed.json byte-for-byte;
//       the table's id set equals PARCEL_COST_LINES.map(l => l.id) (scripts/lib/parcel-cost.js,
//       now STRUCTURAL-ONLY after row 2.5 E3 — archetype/base_confidence/fit_permitted_values
//       moved to this table, so a "fresh derivation from PARCEL_COST_LINES" is no longer
//       possible: the module has nothing left to derive them FROM); and the fit-vocabulary
//       rows (non-null fit_permitted_values) equal exactly the structural entries carrying a
//       `fitField` — locking the two halves of the catalogue to each other by id and by which
//       rows are fit-gated, without pretending the editable VALUES still live in the module;
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
    areaField: string;
    fitField?: string;
    isCoaLine?: boolean;
    scalar: string | null;
    scalarKind: 'total' | 'per_sqm';
  }>;
};

type LineRow = {
  id: string;
  archetype: string;
  base_confidence: 'high' | 'medium' | 'low';
  fit_permitted_values: string[] | null;
};

/** The fixture is the single source of truth the DB seed is proven against (batch-2 row 2.5 D1). */
function readFixture(): LineRow[] {
  return JSON.parse(
    readFileSync(join(process.cwd(), 'src/tests/fixtures/parcel-cost-lines.seed.json'), 'utf8'),
  ) as LineRow[];
}

/** The structural-only id set left in the module — the other side of the id-set lock. */
function structuralIds(): string[] {
  return [...PARCEL_COST_LINES].map((line) => line.id).sort();
}

/** The structural ids the module still marks fit-gated (via `fitField`) — the other side of the fit-vocabulary lock. */
function structuralFitGatedIds(): string[] {
  return [...PARCEL_COST_LINES]
    .filter((line) => Boolean(line.fitField))
    .map((line) => line.id)
    .sort();
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

  it('seed equals the fixture byte-for-byte', async () => {
    const { rows } = await pool.query<LineRow>(
      `SELECT id, archetype, base_confidence, fit_permitted_values
         FROM parcel_cost_lines
        ORDER BY id`,
    );

    const fixture = [...readFixture()].sort((a, b) => a.id.localeCompare(b.id));

    expect(rows).toHaveLength(13);
    expect(rows).toEqual(fixture);
  });

  it("the table's id set equals PARCEL_COST_LINES.map(l => l.id) (structural ⊕ editable stay id-aligned)", async () => {
    const { rows } = await pool.query<{ id: string }>('SELECT id FROM parcel_cost_lines ORDER BY id');
    expect(rows.map((r) => r.id)).toEqual(structuralIds());
  });

  it('fit-vocabulary rows (non-null fit_permitted_values) equal exactly the structural fitField entries', async () => {
    const { rows } = await pool.query<{ id: string }>(
      `SELECT id FROM parcel_cost_lines WHERE fit_permitted_values IS NOT NULL ORDER BY id`,
    );
    expect(rows.map((r) => r.id)).toEqual(structuralFitGatedIds());

    const { rows: nonFit } = await pool.query<{ id: string }>(
      `SELECT id FROM parcel_cost_lines WHERE fit_permitted_values IS NULL ORDER BY id`,
    );
    const fitGated = new Set(structuralFitGatedIds());
    for (const row of nonFit) expect(fitGated.has(row.id)).toBe(false);
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
