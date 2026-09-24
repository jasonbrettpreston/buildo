// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §8 (0s); 124_step_standard_policy.md Rule 1, Rule 2
//
// INGESTOR prerequisite 0s (2026-09-24, WF2 plan §0s) — `parseShapefile` must hand
// the step's own `coerceKey` the feature GeoJSON it already built.
//
// The founding case is row 3.6 `massing`: its 2025 CKAN shapefile carries NO id
// column, so the legacy loader derives the primary key FROM THE GEOMETRY —
// `scripts/load-massing.js`: `sourceId = 'hash_' + crypto.createHash('md5')
// .update(JSON.stringify(feature.geometry)).digest('hex').substring(0, 12)`.
// The seam calls `coerceKey(props[keyProperty])` BEFORE any geometry is visible, so a
// step whose key is geometry-derived could only ever return null — and a null key is
// dropped as `bad_key` before the geometry is ever looked at (`missing-prj`'s
// OBJECTID=9914257 is a FIXTURE convenience, not the massing shape). The fix is a pure
// second argument: `coerceKey(raw, { geojson })`, the string built ONCE and reused by
// the push (no second `JSON.stringify`).
//
// Rule 2 is the reason the context is `{ geojson }` and nothing else: it carries DATA,
// not a service, a pool or a logger — the parse stays domain-free and `crypto` is never
// imported into `scripts/lib/step/acquire.js`.
//
// Fixture: src/tests/steps/load_ravines/fixtures/missing-prj/ravines.{shp,dbf} — the
// EXISTING real 1-polygon shapefile anchor T1 of `step-library.logic.test.ts` uses
// (DBF: OBJECTID=9914257, NAME="Ravine North"). The idiom is copied, not imported.
import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS libraries */
const acquireLib = require(join(process.cwd(), 'scripts/lib/step/acquire.js'));
const shapefile = require('shapefile');
/* eslint-enable @typescript-eslint/no-require-imports */

const md5 = (s: string) => createHash('md5').update(s).digest('hex');

/** `{source_id, geojson}` is the only pair this file reads off a parsed feature. */
type KeyedFeature = { source_id: number | string; geojson: string };
/** `parseShapefile`'s return, narrowed to what these locks assert (the real lib is untyped CJS). */
type Parsed = { features: KeyedFeature[]; badKey: number; nullGeometry: number };

/** The legacy oracle's own coercion, verbatim in shape: prefer OBJECTID, else the geometry hash. */
const intOrNull = (raw: unknown) => { const n = Number(raw); return Number.isFinite(n) ? n : null; };
/** massing's rule, lifted out of `scripts/load-massing.js` — the step's OWN pure domain logic. */
const hashKey = (_r: unknown, c?: { geojson: string | null }) =>
  (c && c.geojson != null ? 'hash_' + md5(c.geojson).slice(0, 12) : null);

describe('INGESTOR prerequisite 0s — coerceKey(raw, { geojson })', () => {
  const FIXTURES = join(process.cwd(), 'src/tests/steps/load_ravines/fixtures/missing-prj');
  const SHP = join(FIXTURES, 'ravines.shp');
  const DBF = join(FIXTURES, 'ravines.dbf');

  /** A `shapefile.open` stub that yields EXACTLY one feature, then `done`. */
  const withOpenStub = async <T>(feature: { geometry: unknown; properties: unknown }, fn: () => Promise<T>): Promise<T> => {
    const spy = vi.spyOn(shapefile, 'open').mockImplementation((async () => ({
      read: (() => {
        let sent = false;
        return async () => (sent
          ? { done: true }
          : (sent = true, { done: false, value: feature }));
      })(),
      close: async () => {},
    })) as unknown as typeof shapefile.open);
    try {
      return await fn();
    } finally {
      spy.mockRestore();
    }
  };

  it('T1 — a geometry-derived key is reachable: parseShapefile passes the feature GeoJSON '
    + '(RED before 0s: `coerceKey` was called with ONE argument, so `c.geojson` was undefined '
    + 'and every feature scored bad_key === 1 with 0 features kept)', async () => {
    const parsed = await acquireLib.parseShapefile(
      SHP, DBF, undefined, hashKey, 'source_id',
    ) as Parsed;
    const { features, badKey, nullGeometry } = parsed;
    expect(features).toHaveLength(1);
    const feature = features[0];
    if (!feature) throw new Error('expected one feature');
    expect(feature.source_id).toBe('hash_' + md5(feature.geojson).slice(0, 12));
    expect(badKey).toBe(0);
    expect(nullGeometry).toBe(0);
  });

  it('T2 — legacy oracle (scripts/load-massing.js): md5 of JSON.stringify(geometry) read with '
    + 'NO dbf reproduces T1\'s key byte-for-byte — the same string the seam builds', async () => {
    // `shapefile.open(shpPath)` with no `dbfPath` — the massing path's own open call.
    const source = await shapefile.open(SHP);
    const r = await source.read();
    if (r.done) throw new Error('expected one feature from the fixture');
    const geometry = (r.value as { geometry: unknown }).geometry;
    const oracle = 'hash_' + md5(JSON.stringify(geometry)).slice(0, 12);

    const parsed = await acquireLib.parseShapefile(SHP, DBF, undefined, hashKey, 'source_id') as Parsed;
    expect(parsed.features[0]?.source_id).toBe(oracle);
  });

  it('T3 — a 1-arg coerceKey is byte-identical: same numeric key as today, and the 2nd argument '
    + 'carries DATA ONLY (Rule 2: keys are exactly [\'geojson\']) '
    + '(RED before 0s: `calls[0][1]` is undefined)', async () => {
    const spy = vi.fn<(raw: unknown, ctx?: { geojson: string | null }) => number | null>(intOrNull);
    const parsed = await acquireLib.parseShapefile(SHP, DBF, 'OBJECTID', spy, 'source_id') as Parsed;
    expect(parsed.features[0]?.source_id).toBe(9914257);
    expect(parsed.badKey).toBe(0);
    expect(spy).toHaveBeenCalled();
    const ctx = spy.mock.calls[0]?.[1] as unknown as { geojson: string };
    expect(ctx).toEqual({ geojson: parsed.features[0]?.geojson });
    expect(Object.keys(ctx)).toEqual(['geojson']);
  });

  it('T4 — a null geometry makes a geometry-derived key NULL, and the declared order is pinned: '
    + 'the row lands as badKey 1, NEVER nullGeometry '
    + '(RED before 0s: badKey 2, 0 features — `hashKey` could not see the geometry either way)', async () => {
    const derived = await withOpenStub<Parsed>(
      { geometry: null, properties: {} },
      () => acquireLib.parseShapefile(SHP, DBF, undefined, hashKey, 'source_id') as Promise<Parsed>,
    );
    expect(derived.badKey).toBe(1);
    expect(derived.nullGeometry).toBe(0);
    expect(derived.features).toHaveLength(0); // no key AND no geometry — nothing to write
  });

  it('T4b — the OTHER direction is green on both sides: a numeric key over the same null geometry '
    + 'is kept by the key test and then re-bucketed as nullGeometry 1, badKey 0 '
    + '(0s does not reorder the two filters)', async () => {
    const numeric = await withOpenStub<Parsed>(
      { geometry: null, properties: { OBJECTID: 9914257 } },
      () => acquireLib.parseShapefile(SHP, DBF, 'OBJECTID', intOrNull, 'source_id') as Promise<Parsed>,
    );
    expect(numeric.nullGeometry).toBe(1);
    expect(numeric.badKey).toBe(0);
    expect(numeric.features).toHaveLength(0);
  });
});
