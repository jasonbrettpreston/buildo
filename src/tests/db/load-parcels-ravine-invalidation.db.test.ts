// 🔗 SPEC LINK: docs/specs/01-pipeline/59_source_ravine_protection.md §8d (#418 DEC-FENCE2)
// 🔗 SPEC LINK: docs/specs/01-pipeline/55_source_parcels.md
//
// DEC-FENCE2 (#418): the enrich_ravines incremental-skip is only SOUND because
// load-parcels.js invalidates the downstream enrichment lineage stamps when a parcel's
// GEOMETRY changes. A moved parcel can cross a ravine / HCD boundary, so its
// ravine_dataset_version_when_enriched (and heritage_…) must be NULLed → the consumer's
// version-skip then sees it as stale and recomputes it. An ADDRESS-only change is
// geom-invariant and must NOT null the stamp (else every benign address refresh would force
// a ~77-min ravine KNN recompute).
//
// load-parcels.js runs pipeline.run(...) at module scope (no require.main guard) so it can't
// be required without firing a DB run; the upsert SQL is inline. This file therefore (A) locks
// the gated CASE is present in the script source, and (B) proves the CASE semantics against a
// real parcels row using the identical ON CONFLICT SET fragment.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';

const SCRIPT = fs.readFileSync(path.resolve(__dirname, '../../../scripts/load-parcels.js'), 'utf8');

// ── (A) Source-contract: the gated CASE invalidation is wired into the upsert ──────────────
describe('load-parcels.js — DEC-FENCE2 source contract (#418)', () => {
  it('NULLs the ravine + heritage stamps via a CASE gated ONLY on geometry change', () => {
    expect(SCRIPT).toContain('DEC-FENCE2');
    // Both stamps invalidated, each gated on the geometry-change predicate (NOT the broader
    // upsert WHERE — an address-only update must preserve the stamp).
    expect(SCRIPT).toMatch(
      /ravine_dataset_version_when_enriched = CASE\s*\n\s*WHEN parcels\.geometry::jsonb IS DISTINCT FROM EXCLUDED\.geometry::jsonb\s*\n\s*THEN NULL ELSE parcels\.ravine_dataset_version_when_enriched END/,
    );
    expect(SCRIPT).toMatch(
      /heritage_dataset_version_when_enriched = CASE\s*\n\s*WHEN parcels\.geometry::jsonb IS DISTINCT FROM EXCLUDED\.geometry::jsonb\s*\n\s*THEN NULL ELSE parcels\.heritage_dataset_version_when_enriched END/,
    );
    // WF2 P11-1: the centreline arm is the load-bearing precondition for the
    // enrich_centreline row-level version-skip gate.
    expect(SCRIPT).toMatch(
      /centreline_dataset_version_when_enriched = CASE\s*\n\s*WHEN parcels\.geometry::jsonb IS DISTINCT FROM EXCLUDED\.geometry::jsonb\s*\n\s*THEN NULL ELSE parcels\.centreline_dataset_version_when_enriched END/,
    );
  });
});

// ── (B) DB-backed: the CASE flips on geom change, preserves on address-only change ─────────
describe.skipIf(!dbAvailable())('load-parcels.js — DEC-FENCE2 stamp invalidation (real DB)', () => {
  const pool = getTestPool()!;
  const G1 = JSON.stringify({ type: 'Polygon', coordinates: [[[-79.40, 43.70], [-79.39, 43.70], [-79.39, 43.71], [-79.40, 43.71], [-79.40, 43.70]]] });
  const G2 = JSON.stringify({ type: 'Polygon', coordinates: [[[-79.30, 43.80], [-79.29, 43.80], [-79.29, 43.81], [-79.30, 43.81], [-79.30, 43.80]]] });

  // The EXACT ON CONFLICT SET fragment from load-parcels.js (the two DEC-FENCE2 CASE lines).
  const UPSERT = `
    INSERT INTO parcels (parcel_id, geometry, address_number)
    VALUES ($1, $2, $3)
    ON CONFLICT (parcel_id) DO UPDATE SET
      geometry = EXCLUDED.geometry,
      address_number = COALESCE(NULLIF(EXCLUDED.address_number, ''), parcels.address_number),
      ravine_dataset_version_when_enriched = CASE
        WHEN parcels.geometry::jsonb IS DISTINCT FROM EXCLUDED.geometry::jsonb
        THEN NULL ELSE parcels.ravine_dataset_version_when_enriched END,
      heritage_dataset_version_when_enriched = CASE
        WHEN parcels.geometry::jsonb IS DISTINCT FROM EXCLUDED.geometry::jsonb
        THEN NULL ELSE parcels.heritage_dataset_version_when_enriched END,
      centreline_dataset_version_when_enriched = CASE
        WHEN parcels.geometry::jsonb IS DISTINCT FROM EXCLUDED.geometry::jsonb
        THEN NULL ELSE parcels.centreline_dataset_version_when_enriched END
    WHERE parcels.geometry::jsonb IS DISTINCT FROM EXCLUDED.geometry::jsonb
       OR (NULLIF(EXCLUDED.address_number, '') IS NOT NULL
           AND parcels.address_number IS DISTINCT FROM EXCLUDED.address_number)`;

  async function seed(stamps = true) {
    await pool.query("DELETE FROM parcels WHERE parcel_id = 'FENCE2-001'");
    await pool.query(
      `INSERT INTO parcels (parcel_id, geometry, address_number,
         ravine_dataset_version_when_enriched, heritage_dataset_version_when_enriched,
         centreline_dataset_version_when_enriched)
       VALUES ('FENCE2-001', $1, '100', $2, $3, $4)`,
      [G1, stamps ? 'rv1' : null, stamps ? 'hv1' : null, stamps ? 'cv1' : null],
    );
  }

  afterAll(async () => {
    await pool.query("DELETE FROM parcels WHERE parcel_id = 'FENCE2-001'");
    await pool.end();
  });

  it('geometry change NULLs the ravine, heritage AND centreline stamps (→ recomputed downstream)', async () => {
    await seed();
    await pool.query(UPSERT, ['FENCE2-001', G2, '100']); // geom changes, address same
    const { rows } = await pool.query(
      `SELECT ravine_dataset_version_when_enriched AS rv, heritage_dataset_version_when_enriched AS hv,
              centreline_dataset_version_when_enriched AS cv
         FROM parcels WHERE parcel_id = 'FENCE2-001'`,
    );
    expect(rows[0].rv).toBeNull();
    expect(rows[0].hv).toBeNull();
    expect(rows[0].cv).toBeNull();
  });

  it('address-only change PRESERVES all three stamps (geom-invariant → no needless recompute)', async () => {
    await seed();
    await pool.query(UPSERT, ['FENCE2-001', G1, '200']); // same geom, address changes
    const { rows } = await pool.query(
      `SELECT ravine_dataset_version_when_enriched AS rv, heritage_dataset_version_when_enriched AS hv,
              centreline_dataset_version_when_enriched AS cv, address_number AS addr
         FROM parcels WHERE parcel_id = 'FENCE2-001'`,
    );
    expect(rows[0].addr).toBe('200'); // the address update did happen …
    expect(rows[0].rv).toBe('rv1');   // … but the ravine stamp survived
    expect(rows[0].hv).toBe('hv1');   // … and the heritage stamp survived
    expect(rows[0].cv).toBe('cv1');   // … and the centreline stamp survived
  });
});
