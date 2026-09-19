// SPEC LINK: docs/specs/01-pipeline/59_source_ravine_protection.md §8d, §9, §11.1
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1 (frozen shape), §5.5 (compute shape)
//
// Infra tests for the CONVERTED enrich_ravines step (batch-2 row 2.1, ENRICHER), two layers:
//  (A) Source-contract — the descriptor + compute wire the §8d/§9 behaviors (consumer protocol,
//      the F1/F2/SRID pre-transaction HALT, guards.requires preconditions, the Enrich-archetype
//      emit, the honestly-widened emitMeta read-set WITHOUT lead_id, §11.1 SQL form).
//  (B) DB-backed §11.1 — real PostGIS: a parcel inside a ravine → is_in_ravine=true, distance
//      ≤ 0; an outside parcel → false, distance > 0; idempotent re-run; L14 empty-ravines HALT.
//
// RE-POINTED at commit 2b (batch-2 row 2.1): the pre-conversion `SCRIPT` (raw shell source)
// assertions are replaced by descriptor + compute assertions, since the pre-conversion
// `countStale`/`assertPreconditions`/`assertVersionColumn` standalone exports no longer exist —
// L14/SRID are folded into `readRavineContract` (RV-L2, the one hook proven to run
// pre-transaction on every invocation), DEC-E/PostGIS/both GIST indexes moved to
// `guards.requires` (Class A(vii): now armed on EVERY run, not only the recompute path), and
// the #418 Layer-1 early-return branch is RETIRED AS A MECHANISM (F9) — its OBSERVABLE
// (`parcels_ravine_enrich_skipped`) is re-derived in `computePostPhase` from the same scope
// count the write itself used.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { dbAvailable, getTestPool } from './db/setup-testcontainer';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const descriptor = require('../../scripts/enrich-ravines.descriptor.json');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const compute = require('../../scripts/lib/compute/enrich-ravines.js');

const COMPUTE_SRC = fs.readFileSync(path.resolve(__dirname, '../../scripts/lib/compute/enrich-ravines.js'), 'utf8');
const SHELL_SRC = fs.readFileSync(path.resolve(__dirname, '../../scripts/enrich-ravines.js'), 'utf8');

// ── (A) Source-contract ─────────────────────────────────────────────────────
describe('enrich_ravines — source contract (Spec 59 §8d/§9, converted)', () => {
  it('lock 60 (descriptor + shell source-text agreement) + reads the chain-scoped producer sources:load_ravines, completed_at DESC', () => {
    expect(descriptor.identity.lock).toBe(60);
    expect(SHELL_SRC).toMatch(/ADVISORY_LOCK_ID\s*=\s*60/);
    expect(COMPUTE_SRC).toContain("'sources:load_ravines'");
    expect(COMPUTE_SRC).toMatch(/ORDER BY completed_at DESC/);
  });

  it('§11.1 SQL: ST_Intersects boolean + index-accelerated LATERAL KNN (materialized centroid), geom-scoped, PORTED VERBATIM (F5)', () => {
    expect(compute.ENRICH_SQL).toContain('ST_Intersects(pc.geom, r.geom)');
    expect(compute.ENRICH_SQL).toMatch(/pc\.cg <-> r\.geom::geography/); // binds idx_ravines_geog_gist (not the slow inline-centroid form)
    expect(compute.ENRICH_SQL).toContain('AS MATERIALIZED');
    expect(compute.ENRICH_SQL).toContain('WHERE p.geom IS NOT NULL');
    expect(compute.ENRICH_SQL).toContain('IS DISTINCT FROM');
  });

  it('guards.requires declares PostGIS + BOTH ravines indexes + parcels GIST + the DEC-E lineage column, all on_missing:"fail", armed on EVERY run (Class A(vii))', () => {
    const kinds = descriptor.guards.requires.map((r: { kind: string; name: string; on_missing: string }) => `${r.kind}:${r.name}`);
    expect(kinds).toContain('extension:postgis');
    expect(kinds).toContain('index:idx_parcels_geom_gist');
    expect(kinds).toContain('index:idx_ravines_geom_gist'); // planar (DeepSeek HIGH, pre-conversion review)
    expect(kinds).toContain('index:idx_ravines_geog_gist'); // geography
    expect(kinds).toContain('column:parcels.ravine_dataset_version_when_enriched'); // DEC-E
    for (const r of descriptor.guards.requires) expect(r.on_missing).toBe('fail');
  });

  it('the SRID=4326 assertion is folded into readRavineContract (RV-L2 — guards.srid is declarative only, unconsumed by the runner)', () => {
    expect(COMPUTE_SRC).toMatch(/Find_SRID\([^)]*parcels[^)]*geom/);
    expect(descriptor.guards.srid).toBe(4326);
  });

  it('Enrich archetype: records_total is the scanned population (A4 ruling), records_updated resolves written.e1.updated (COUNTER-ROOT)', () => {
    expect(descriptor.counters.records_total.source).toBe('matched.compute.geom_bearing_parcels_scanned');
    expect(descriptor.counters.records_updated.source).toBe('written.e1.updated');
    expect(descriptor.counters.records_new.source).toBe('matched.compute.records_new_aggregate');
  });

  it('the WIDENED, honest declared read-set (RV-D1) — still NO lead_id (F10 intent preserved)', () => {
    const parcelsRead = descriptor.inputs.reads.tables.find((t: { table: string }) => t.table === 'parcels');
    expect(parcelsRead.columns).toEqual(
      expect.arrayContaining(['id', 'geom', 'is_in_ravine_protection_area', 'ravine_distance_m', 'ravine_dataset_version_when_enriched']),
    );
    expect(parcelsRead.columns).not.toContain('lead_id');
    const outputs = descriptor.outputs.writes[0];
    expect(outputs.table).toBe('parcels');
    expect(outputs.columns.map((c: { name: string }) => c.name)).toEqual([
      'is_in_ravine_protection_area', 'ravine_distance_m', 'ravine_dataset_version_when_enriched',
    ]);
  });

  it('consumer-protocol gate strings present (spec_version pin, empty-guard, drift, lineage) — F1, ported verbatim', () => {
    expect(COMPUTE_SRC).toContain('spec_version');
    expect(COMPUTE_SRC).toContain('delete_skipped_empty_guard');
    expect(COMPUTE_SRC).toContain('mass_delete_check_passed');
    expect(COMPUTE_SRC).toContain('source_dataset_version is null/empty');
  });

  it('#418 Layer-1 is RETIRED AS A MECHANISM (F9) — no standalone stale-count early return; Layer-2 stays embedded in the ONE statement', () => {
    // The pre-conversion two-layer shape (a separate `countStale` query + an `if (staleCount === 0) return` before
    // any transaction) is gone: the ENRICHER runner has no gated-skip branch for this shape.
    expect(COMPUTE_SRC).not.toMatch(/function countStale/);
    expect(COMPUTE_SRC).not.toMatch(/if \(staleCount === 0\)/);
    // Layer-2's own scope predicate is still exactly the #418 stale-only scope, now the WHOLE mechanism.
    expect(compute.ENRICH_SQL).toMatch(/ravine_dataset_version_when_enriched IS DISTINCT FROM \$1/);
    expect(compute.ENRICH_SQL).toContain('#418 stale-only scope');
  });

  it('F9 observable preservation — parcels_ravine_enrich_skipped is RE-DERIVED from the write rowCount, not a retired skip branch', () => {
    const postPhaseFn = COMPUTE_SRC.slice(
      COMPUTE_SRC.indexOf('async function computePostPhase'),
      COMPUTE_SRC.indexOf('async function computePostPhase') + 1500,
    );
    expect(postPhaseFn).toMatch(/skipped\s*=\s*updated === 0/);
    expect(postPhaseFn).toContain('parcels_ravine_enrich_skipped');
  });

  it('coverage is re-queried LIVE on every call (F7 — Regression Guardian: a pre-existing partial-coverage hole stays visible even on a zero-write run)', () => {
    expect(compute.COVERAGE_SQL).toMatch(/COUNT\(\*\) FILTER \(WHERE geom IS NOT NULL\)/);
    expect(compute.COVERAGE_SQL).toMatch(/ST_IsValid\(geom\)/);
  });

  it('the shell is FROZEN onto pipeline.step and declares ADVISORY_LOCK_ID 60 as source text', () => {
    expect(SHELL_SRC).toContain('module.exports = pipeline.step(descriptor, compute);');
    expect(SHELL_SRC).not.toContain('withTransaction');
    expect(SHELL_SRC).not.toContain('emitSummary');
    expect(SHELL_SRC).not.toContain('UPDATE parcels');
  });
});

// ── (B) DB-backed §11.1 spatial-join behavior ───────────────────────────────
describe.skipIf(!dbAvailable())('enrich_ravines — §11.1 spatial join (real PostGIS, ENRICH_SQL exported verbatim)', () => {
  const pool = getTestPool()!;
  // A ravine box covering lon -79.41..-79.39, lat 43.69..43.71.
  const RAVINE = "ST_Multi(ST_GeomFromText('POLYGON((-79.41 43.69,-79.39 43.69,-79.39 43.71,-79.41 43.71,-79.41 43.69))',4326))";
  const INSIDE = "ST_GeomFromText('POLYGON((-79.401 43.699,-79.399 43.699,-79.399 43.701,-79.401 43.701,-79.401 43.699))',4326)";
  const OUTSIDE = "ST_GeomFromText('POLYGON((-79.31 43.80,-79.30 43.80,-79.30 43.81,-79.31 43.81,-79.31 43.80))',4326)";

  afterAll(async () => {
    await pool.query("DELETE FROM parcels WHERE parcel_id LIKE 'RAV-INFRA-%'");
    await pool.query('DELETE FROM ravines WHERE source_id >= 990100');
    await pool.end();
  });

  it('enriches an inside parcel (true, distance ≤ 0) and an outside parcel (false, distance > 0); idempotent re-run', async () => {
    await pool.query("DELETE FROM parcels WHERE parcel_id LIKE 'RAV-INFRA-%'");
    await pool.query('DELETE FROM ravines WHERE source_id >= 990100');
    await pool.query(`INSERT INTO ravines (source_id, geom, source_dataset_version) VALUES (990101, ${RAVINE}, 'tv1')`);
    await pool.query(`INSERT INTO parcels (parcel_id, geom) VALUES ('RAV-INFRA-IN', ${INSIDE}), ('RAV-INFRA-OUT', ${OUTSIDE})`);

    const upd1 = await pool.query(compute.ENRICH_SQL, ['tv1']);
    expect(upd1.rowCount).toBeGreaterThanOrEqual(2);

    const { rows } = await pool.query(
      `SELECT parcel_id, is_in_ravine_protection_area AS inr, ravine_distance_m AS dist, ravine_dataset_version_when_enriched AS ver
         FROM parcels WHERE parcel_id LIKE 'RAV-INFRA-%' ORDER BY parcel_id`,
    );
    const inside = rows.find((r) => r.parcel_id === 'RAV-INFRA-IN');
    const outside = rows.find((r) => r.parcel_id === 'RAV-INFRA-OUT');
    expect(inside.inr).toBe(true);
    expect(Number(inside.dist)).toBeLessThanOrEqual(0); // L2: 0 inside, negative if intersecting
    expect(inside.ver).toBe('tv1');
    expect(outside.inr).toBe(false);
    expect(Number(outside.dist)).toBeGreaterThan(0);
    expect(outside.ver).toBe('tv1');

    // Idempotency: same version + unchanged geometry → IS DISTINCT FROM guard → 0 rows.
    const upd2 = await pool.query(compute.ENRICH_SQL, ['tv1']);
    expect(upd2.rowCount).toBe(0);
  });

  it('readRavineContract HALTs (L14) when the ravines table is empty, even with a valid producer run on record', async () => {
    // A valid producer fixture, so the L14 halt is genuinely isolated from the producer-protocol
    // halts F1 also folds into this same hook (RV-L2).
    await pool.query(
      `INSERT INTO pipeline_runs (pipeline, status, started_at, completed_at, records_meta)
       VALUES ('sources:load_ravines', 'completed', now(), now(), $1::jsonb)`,
      [JSON.stringify({
        ravine_load: {
          spec_version: '1.2', source_dataset_version: 'infra-fixture-v1',
          feature_count: 10, invalid_geometry_skipped: 0,
          delete_skipped_empty_guard: false, drift_check_passed: true, mass_delete_check_passed: true,
        },
      })],
    );
    await pool.query('DELETE FROM ravines');
    expect.assertions(1);
    await expect(compute.readRavineContract(pool)).rejects.toThrow(/ravines table is empty/);
  });
});
