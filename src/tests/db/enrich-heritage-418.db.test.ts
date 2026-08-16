// SPEC LINK: docs/specs/01-pipeline/61_source_heritage_properties.md (v1.1 §8d)
// SPEC LINK: docs/specs/01-pipeline/59_source_ravine_protection.md §8d, §11.1 (#418 — the ported mechanism)
//
// Phase B B3 — real-DB integration tests for the #418 incremental-skip ported
// into enrich-heritage.js. Mirrors enrich-ravines.skip.db.test.ts's isolation
// style: every case runs inside its own BEGIN/ROLLBACK and asserts only on its
// own parcel_id prefix ('B3H418-…') — countStale/ENRICH_SQL operate on the
// WHOLE parcels table, so global counts are not stable across the shared
// container.
//
// Case IDs (B3 grounding fold red-first table):
//   H1 — THE WEDGE-OPEN TRAP: countStale mirrors ENRICH_SQL's full eligibility
//     (NOT ST_IsEmpty + ST_IsValid), so an invalid-geometry parcel that can
//     NEVER be stamped is excluded from the denominator rather than pinning
//     staleCount above 0 forever. Also proves the NAIVE port (geom IS NOT NULL
//     only, the verbatim-ravines predicate) WOULD have stayed stale forever —
//     the adversarial half of "the naive port fails it".
//   H2 — a dataset-version bump re-stales the (eligible) parcels.
//   H3 — the skip path still emits coverage + PIPELINE_SUMMARY + PIPELINE_META
//     (emitHeritageResults shared by both branches — Integration BUG precedent).
//
// Skipped unless BUILDO_TEST_DB=1 / DATABASE_URL.

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import { dbAvailable, getTestPool } from './setup-testcontainer';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const eh = require('../../../scripts/enrich-heritage.js') as {
  ENRICH_SQL: string;
  countStale: (db: Pool | PoolClient, datasetVersion: string) => Promise<number>;
  assertVersionColumn: (db: Pool | PoolClient) => Promise<void>;
  assertPreconditions: (db: Pool | PoolClient) => Promise<void>;
  emitHeritageResults: (
    pool: Pool,
    args: { datasetVersion: string; updated: number; skipped: boolean; t0: number; config: { heritageUnlinkedPointWarnPct: number; heritageUnlinkedPointFailPct: number } },
  ) => Promise<void>;
};

// A self-intersecting "bowtie" — ST_GeomFromText parses it happily; ST_IsValid() is false.
const INVALID_BOWTIE = "ST_GeomFromText('POLYGON((-79.40 43.70, -79.38 43.72, -79.38 43.70, -79.40 43.72, -79.40 43.70))', 4326)";
const VALID_BOX = "ST_GeomFromText('POLYGON((-79.401 43.699,-79.399 43.699,-79.399 43.701,-79.401 43.701,-79.401 43.699))', 4326)";

/** countStale using the EXACT #418 predicate, scoped to this test's parcels only. */
async function myStale(c: PoolClient, prefix: string, ver: string): Promise<number> {
  const { rows } = await c.query(
    `SELECT COUNT(*)::int AS n FROM parcels
      WHERE parcel_id LIKE $1 AND geom IS NOT NULL AND NOT ST_IsEmpty(geom) AND ST_IsValid(geom)
        AND heritage_dataset_version_when_enriched IS DISTINCT FROM $2`,
    [`${prefix}%`, ver],
  );
  return rows[0].n;
}

/** The NAIVE (verbatim-ravines) predicate — geom IS NOT NULL only, no validity filter. */
async function myNaiveStale(c: PoolClient, prefix: string, ver: string): Promise<number> {
  const { rows } = await c.query(
    `SELECT COUNT(*)::int AS n FROM parcels
      WHERE parcel_id LIKE $1 AND geom IS NOT NULL
        AND heritage_dataset_version_when_enriched IS DISTINCT FROM $2`,
    [`${prefix}%`, ver],
  );
  return rows[0].n;
}

describe.skipIf(!dbAvailable())('enrich-heritage.js — #418 incremental skip, ported (real PostGIS)', () => {
  let pool: Pool;
  beforeAll(() => { pool = getTestPool() as Pool; });
  afterAll(async () => { await pool.end(); });

  it('H1 — THE WEDGE-OPEN TRAP: countStale excludes an invalid-geom parcel; the naive predicate would stay stale forever', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query(
        `INSERT INTO parcels (parcel_id, geom) VALUES ('B3H418-VALID', ${VALID_BOX}), ('B3H418-INVALID', ${INVALID_BOWTIE})`,
      );
      // Sanity: the invalid one really is invalid, the valid one really is valid.
      const validity = await c.query(
        `SELECT parcel_id, ST_IsValid(geom) AS valid FROM parcels WHERE parcel_id LIKE 'B3H418-%' ORDER BY parcel_id`,
      );
      expect(validity.rows.find((r) => r.parcel_id === 'B3H418-INVALID').valid).toBe(false);
      expect(validity.rows.find((r) => r.parcel_id === 'B3H418-VALID').valid).toBe(true);

      // Both eligible-by-naive-predicate, but only ONE is eligible-by-ENRICH_SQL's real scope.
      expect(await myNaiveStale(c, 'B3H418-', 'v1')).toBe(2);
      expect(await myStale(c, 'B3H418-', 'v1')).toBe(1);
      expect(await eh.countStale(c, 'v1')).toBeGreaterThanOrEqual(1); // whole-table count, other suites may contribute

      // Run ENRICH_SQL directly (Layer-2 engine, bypassing the producer-contract
      // read — this is the same reduced-surface approach enrich-ravines.skip.db.test.ts
      // uses: exercise ENRICH_SQL + countStale directly rather than the full main()).
      await c.query(eh.ENRICH_SQL, [2, 'v1']);

      const after = await c.query(
        `SELECT parcel_id, heritage_dataset_version_when_enriched AS ver FROM parcels WHERE parcel_id LIKE 'B3H418-%' ORDER BY parcel_id`,
      );
      expect(after.rows.find((r) => r.parcel_id === 'B3H418-VALID').ver).toBe('v1');
      expect(after.rows.find((r) => r.parcel_id === 'B3H418-INVALID').ver).toBeNull(); // NEVER stamped — excluded by ST_IsValid

      // THE TRAP: countStale (mirrored eligibility) now reaches 0 for our rows — the
      // skip branch is reachable. The naive predicate would STILL report 1 forever
      // (the invalid parcel can never satisfy geom IS NOT NULL AND version=current,
      // because it can never BE stamped) — a dead skip branch, proven here directly.
      expect(await myStale(c, 'B3H418-', 'v1')).toBe(0);
      expect(await myNaiveStale(c, 'B3H418-', 'v1')).toBe(1);

      await c.query('ROLLBACK');
    } finally { c.release(); }
  });

  it('H2 — a dataset-version bump re-stales the eligible (valid-geom) parcel only', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query(
        `INSERT INTO parcels (parcel_id, geom) VALUES ('B3H418V2-VALID', ${VALID_BOX}), ('B3H418V2-INVALID', ${INVALID_BOWTIE})`,
      );
      await c.query(eh.ENRICH_SQL, [2, 'v1']);
      expect(await myStale(c, 'B3H418V2-', 'v1')).toBe(0);
      // A heritage refresh bumps the target version — the valid parcel is stale again;
      // the invalid one was never in scope and stays out of scope.
      expect(await myStale(c, 'B3H418V2-', 'v2')).toBe(1);
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });

  it('H3 — the skip path (skipped:true) still emits a PIPELINE_SUMMARY + PIPELINE_META with a parcels_heritage_enrich_skipped row', async () => {
    const lines: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((msg?: unknown) => {
      if (typeof msg === 'string') lines.push(msg);
    });
    try {
      await eh.emitHeritageResults(pool, {
        datasetVersion: 'v1-test-skip',
        updated: 0,
        skipped: true,
        t0: Date.now(),
        config: { heritageUnlinkedPointWarnPct: 0.15, heritageUnlinkedPointFailPct: 0.3 },
      });
    } finally {
      spy.mockRestore();
    }
    const summaryLine = lines.filter((l) => l.startsWith('PIPELINE_SUMMARY:')).pop();
    expect(summaryLine).toBeTruthy();
    const summary = JSON.parse(summaryLine!.slice('PIPELINE_SUMMARY:'.length));
    expect(summary.records_updated).toBe(0);
    const rows = summary.records_meta.audit_table.rows as Array<{ metric: string; value: unknown }>;
    expect(rows.find((r) => r.metric === 'parcels_heritage_enrich_skipped')?.value).toBe(true);
    expect(rows.find((r) => r.metric === 'heritage_source_dataset_version')?.value).toBe('v1-test-skip');
    expect(lines.some((l) => l.startsWith('PIPELINE_META:'))).toBe(true);
  });

  // Commit C (B3 output-panel remediation) — mirrors enrich-ravines.skip.db.test.ts's
  // 'assertVersionColumn passes (DEC-E) and countStale runs against the live table'.
  it('C-R1 (positive half): assertVersionColumn resolves against the live migrated schema (migration 171 applied)', async () => {
    await expect(eh.assertVersionColumn(pool)).resolves.toBeUndefined();
  });

  // assertPreconditions (now hoisted onto the skip path — Commit C) needs
  // heritage_properties/heritage_districts non-empty (L14), which this
  // container's global fixtures don't seed — proven with its own rows,
  // isolated in a rolled-back transaction like the H1/H2 cases above.
  it('C — assertPreconditions (hoisted onto the skip path) resolves once the heritage source tables are non-empty', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query(
        `INSERT INTO heritage_properties (source_id, status, address_text, geom, designated_date, source_dataset_version)
         VALUES (999900001, 'part_iv', 'B3C Test Addr', ST_GeomFromText('POINT(-79.40 43.70)', 4326), '2020-01-01', 'b3c-test')`,
      );
      await c.query(
        `INSERT INTO heritage_districts (source_id, name, hcd_type, geom, designated_date, source_dataset_version)
         VALUES (999900001, 'B3C Test HCD', 'designated_district', ST_Multi(${VALID_BOX}), '2020-01-01', 'b3c-test')`,
      );
      await expect(eh.assertPreconditions(c)).resolves.toBeUndefined();
    } finally {
      await c.query('ROLLBACK');
      c.release();
    }
  });
});
