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
// The fence MOVED with the parcels conversion: `load-parcels.js` is now a frozen shell (the
// inline upsert SQL is gone, 0 hits for DEC-FENCE2), and the fence is DECLARED in
// scripts/load-parcels.descriptor.json `outputs.invalidates[]` (three entries,
// `set_null_on_change_of: "geom"` — WF3 2026-09-28 moved the watch from the raw jsonb
// `geometry` to the derived `geom`, the shape every enrich-* step reads; the fence's intent,
// "the stamp follows the shape", is unchanged) and RENDERED by
// scripts/lib/step/write.js `buildWritePlan(writeSpec, descriptor)` (the `invalidatesSetArms`
// block) as the ON CONFLICT SET CASE arms. This file therefore (A) locks the DECLARATION and
// the RENDERED SQL — never weakened, only re-pointed — and (B) proves the CASE semantics
// against a real parcels row using the identical ON CONFLICT SET fragment.

import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS libraries */
const writeLib = require(path.join(process.cwd(), 'scripts/lib/step/write.js'));
const LOAD_PARCELS = require(path.join(process.cwd(), 'scripts/load-parcels.descriptor.json'));
/* eslint-enable @typescript-eslint/no-require-imports */

interface InvalidatesEntry { table: string; column: string; when: string; set_null_on_change_of?: string }

/** The declared fence entries this file locks (prerequisite 0l, #418 DEC-FENCE2). */
const INVALIDATES: InvalidatesEntry[] = LOAD_PARCELS.outputs.invalidates;

/** The rendered ON CONFLICT statement for THIS descriptor's parcels write. */
const UPSERT_SQL: string = writeLib.buildWritePlan(LOAD_PARCELS.outputs.writes[0], LOAD_PARCELS).upsert_sql;

// ── (A) Source-contract: the DECLARED fence AND its rendered CASE invalidation ─────────────
describe('load-parcels descriptor — DEC-FENCE2 source contract (#418)', () => {
  it('NULLs the ravine + heritage + centreline stamps via a CASE gated ONLY on a geom change (WF3 2026-09-28: watched column `geom`)', () => {
    // The DECLARATION (the descriptor), for each of the three stamps.
    for (const column of [
      'ravine_dataset_version_when_enriched',
      'heritage_dataset_version_when_enriched',
      'centreline_dataset_version_when_enriched',
    ]) {
      const entry = INVALIDATES.find((e) => e.column === column);
      if (!entry) throw new Error(`invalidates[] entry for ${column}`);
      expect(entry.table).toBe('parcels');
      expect(entry.set_null_on_change_of).toBe('geom');
      expect(entry.when).toContain('DEC-FENCE2');
    }
    // The RENDERED SQL (write.js buildWritePlan): each stamp NULLed by a CASE gated on the
    // geom-change predicate (NOT the broader upsert WHERE — an address-only update must
    // preserve the stamp; the regex pins the WHEN to exactly the derived-geom predicate).
    // Re-pointed IN PLACE, WF3 2026-09-28: the legacy `geometry::jsonb` WHEN text is
    // knowingly retired — the stamp now follows `geom`, the shape the enrichers read.
    expect(UPSERT_SQL).toMatch(
      /ravine_dataset_version_when_enriched = CASE\s+WHEN parcels\.geom IS DISTINCT FROM EXCLUDED\.geom\s+THEN NULL ELSE parcels\.ravine_dataset_version_when_enriched END/,
    );
    expect(UPSERT_SQL).toMatch(
      /heritage_dataset_version_when_enriched = CASE\s+WHEN parcels\.geom IS DISTINCT FROM EXCLUDED\.geom\s+THEN NULL ELSE parcels\.heritage_dataset_version_when_enriched END/,
    );
    // WF2 P11-1: the centreline arm is the load-bearing precondition for the
    // enrich_centreline row-level version-skip gate.
    expect(UPSERT_SQL).toMatch(
      /centreline_dataset_version_when_enriched = CASE\s+WHEN parcels\.geom IS DISTINCT FROM EXCLUDED\.geom\s+THEN NULL ELSE parcels\.centreline_dataset_version_when_enriched END/,
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
