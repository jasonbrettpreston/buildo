// SPEC LINK: docs/specs/00-architecture/115_scheduling.md §5 (the itemisation trigger this migration answers)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §7.5 (migration numbering)
//
// EP-D17 (WF3, 2026-09-10) — migration 247 sets three per-table autovacuum storage
// params on `parcels` (Engineering Standards §5.2's DB-replay row: "any migration
// touching schema/constraints/indexes" — a reloptions/storage-parameter change is
// schema-adjacent enough to warrant the same real-DB proof as an index/constraint
// change, since `pg_class.reloptions` is exactly the kind of catalog state a mocked
// pool test cannot observe). Skipped unless BUILDO_TEST_DB=1 / DATABASE_URL.
//
// This asserts `reloptions` CONTAINS the three declared params after migrate.js
// applies the full migration set — it proves the SQL landed on a real Postgres
// catalog, NOT that the autovacuum daemon actually obeys them (some managed
// platforms clamp storage params; that is a live-cloud-only verification, filed
// as a low-confidence item in the WF3 plan, not testable against a bare
// postgis/postgis container).

import { describe, expect, it } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';

const pool = getTestPool();

describe.skipIf(!dbAvailable())('migration 247 — parcels autovacuum storage params', () => {
  it('reloptions contains all three declared params after migrate.js applies the full set', async () => {
    if (!pool) return;
    const { rows } = await pool.query(
      `SELECT reloptions FROM pg_class WHERE relname = 'parcels'`,
    );
    expect(rows.length).toBe(1);
    const reloptions: string[] | null = rows[0]?.reloptions ?? null;
    expect(reloptions, 'parcels must carry non-null reloptions after migration 247').not.toBeNull();
    expect(reloptions).toEqual(
      expect.arrayContaining([
        'autovacuum_vacuum_scale_factor=0.02',
        'autovacuum_analyze_scale_factor=0.01',
        'autovacuum_vacuum_cost_delay=0',
      ]),
    );
  });

  it('the table comment states the migration 247 rationale (never a bare reloptions write with no discoverable why)', async () => {
    if (!pool) return;
    const { rows } = await pool.query(
      `SELECT obj_description('parcels'::regclass, 'pg_class') AS comment`,
    );
    const comment: string | null = rows[0]?.comment ?? null;
    expect(comment).not.toBeNull();
    expect(comment).toMatch(/EP-D17/);
    expect(comment).toMatch(/migration 247/);
  });

  it('no other parcels reloptions were clobbered — the ALTER TABLE SET is additive, never a full reloptions rewrite', async () => {
    if (!pool) return;
    // Sets a fourth, unrelated storage param directly, then re-runs the EXACT
    // migration-247 statement to prove SET only ever touches the three named keys
    // (Postgres's own SET semantics: it never resets keys it does not name).
    await pool.query(`ALTER TABLE parcels SET (fillfactor = 90)`);
    await pool.query(
      `ALTER TABLE parcels SET (autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.01, autovacuum_vacuum_cost_delay = 0)`,
    );
    const { rows } = await pool.query(`SELECT reloptions FROM pg_class WHERE relname = 'parcels'`);
    const reloptions: string[] = rows[0]?.reloptions ?? [];
    expect(reloptions).toEqual(expect.arrayContaining(['fillfactor=90']));
    // Clean up so this test's own side effect does not leak into a later run of the suite.
    await pool.query(`ALTER TABLE parcels RESET (fillfactor)`);
  });
});
