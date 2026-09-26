// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §8 (0v, RE-FREEZE #25); 124_step_standard_policy.md Rule 1
//
// INGESTOR prerequisite 0v (2026-09-25, WF2 plan §0v, Fold G-2) — `externals[].format`
// gains `"geojson"`. The 0b format axis (RE-FREEZE #13) selects the parser by DECLARED
// payload format, never by a URL-extension sniff; before this file its `enum` was
// `["shapefile_zip", "csv"]`, so the neighbourhoods source — a bare 2.1 MB
// FeatureCollection (`AREA_SHORT_CODE` string 158/158) — had no arm to land in: the seam
// throws `… which no parser in the acquisition seam handles`. The legacy loader parsed it
// in-module (`JSON.parse` with `Failed to parse GeoJSON file ${path}: ${err.message} (first
// 100 chars: ${raw.slice(0,100)})`, geometry `JSON.stringify(feature.geometry)`).
//
// `parseGeoJson` reproduces that parse as a GENERIC seam function: same tallies and drop
// ORDER as `parseShapefile` (`key == null` → `bad_key` BEFORE `geometry == null` →
// `null_geometry`, `rowsParsed` counted first), same `{ [keyColumn]: key, geojson, record }`
// feature shape, same `coerceKey(raw, { geojson })` 2nd argument (0s). It STREAMS the temp
// file (`fs.createReadStream` → `stream-json` parser → `Pick({filter:'features'})` →
// `StreamArray`), never whole-file reading it: commit cb21b6f3 briefly reintroduced
// `fs.readFileSync` here and broke the load_ravines F2 no-whole-file-read fence (Spec 43 §9.5,
// Spec 124 Rule 1), and T7 pins the streamed read at the call-site level.
//
// Fixture: a synthetic 4-feature FeatureCollection built in `fs.mkdtempSync`, chosen so
// each drop mode fires exactly once — A `'1'`+Polygon (KEPT), B `'0'`+Polygon (key), C
// `'2'`+null geometry, D `'0'`+null (key fires first, geometry never reached).
import { describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS libraries */
const acquireLib = require(path.join(process.cwd(), 'scripts/lib/step/acquire.js'));
const pipeline = require(path.join(process.cwd(), 'scripts/lib/pipeline.js'));
const LOAD_RAVINES = require(path.join(process.cwd(), 'scripts/load-ravines.descriptor.json'));
/* eslint-enable @typescript-eslint/no-require-imports */

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));

/** The neighbourhoods key coercion (Fold G-2): a positive integer or nothing. */
const intOrNull = (r: unknown) => (Number(r) > 0 ? Number(r) : null);

/** The T1 4-feature FeatureCollection' geometry — the string T1 pins against. */
const POLYGON = { type: 'Polygon', coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]] };
const propsA = { AREA_SHORT_CODE: '1', AREA_NAME: 'Alpha' };
const FEATURES_FOUR = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: propsA, geometry: POLYGON },
    { type: 'Feature', properties: { AREA_SHORT_CODE: '0', AREA_NAME: 'Bravo' }, geometry: POLYGON },
    { type: 'Feature', properties: { AREA_SHORT_CODE: '2', AREA_NAME: 'Charlie' }, geometry: null },
    { type: 'Feature', properties: { AREA_SHORT_CODE: '0', AREA_NAME: 'Delta' }, geometry: null },
  ],
};

/** Write `body` to a fresh temp dir and hand back the file path plus a cleanup. */
const fixture = (name: string, body: string) => {
  const dir = fs.mkdtempSync(path.join(process.cwd(), 'tmp-0v-'));
  const file = path.join(dir, name);
  fs.writeFileSync(file, body);
  return { dir, file, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
};

/** A fetch whose Nth call returns the Nth queued response (copied from 0q T1's `fetchOf`). */
const fetchOf = (queue: Array<{ status: number; body?: string }>) => {
  let i = 0;
  return vi.fn(async () => {
    const next = queue[i++];
    if (!next) throw new Error(`fetchOf: call ${i} exceeds the queued response list`);
    return new Response(new Uint8Array(Buffer.from(next.body ?? 'x')), {
      status: next.status,
      statusText: String(next.status),
    });
  });
};

describe('INGESTOR prerequisite 0v — geojson format', () => {
  // -------------------------------------------------------------------------
  // T1 — the parse itself: same order/tallies as parseShapefile, and the
  // geometry string is built ONCE and carried on both `geojson` and `record`.
  // RED before 0v: parseGeoJson is not a function.
  // -------------------------------------------------------------------------
  it('T1 — parseGeoJson over 4 features keeps 1 (key 1), counts badKey 2 / nullGeometry 1 / rowsParsed 4, '
    + 'and carries JSON.stringify(A.geometry) plus A.properties', async () => {
    const { file, cleanup } = fixture('four.geojson', JSON.stringify(FEATURES_FOUR));
    try {
      const parsed = await acquireLib.parseGeoJson(file, 'AREA_SHORT_CODE', intOrNull, 'neighbourhood_id');
      expect(parsed.rowsParsed, 'EVERY feature the source handed back, counted before the filters').toBe(4);
      expect(parsed.badKey, 'B (key 0) and D (key 0, null geometry — key fires FIRST)').toBe(2);
      expect(parsed.nullGeometry, 'C only — D was already dropped as a bad key').toBe(1);
      expect(parsed.features).toHaveLength(1);
      const f = parsed.features[0];
      expect(f.neighbourhood_id, 'keyed by the DECLARED key column').toBe(1);
      expect(f.geojson, 'the geometry string is JSON.stringify(feature.geometry) — built once').toBe(JSON.stringify(POLYGON));
      expect(f.record, 'record IS the feature properties object (parseShapefile parity)').toEqual(propsA);
    } finally {
      cleanup();
    }
  });

  // -------------------------------------------------------------------------
  // T2 — `properties: null` degrades to `{}` (parseShapefile parity), so the
  // lookup misses `keyProperty` and the row counts as one bad key.
  // -------------------------------------------------------------------------
  it('T2 — a feature whose properties is null is one badKey, never a crash', async () => {
    const body = JSON.stringify({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: null, geometry: POLYGON }],
    });
    const { file, cleanup } = fixture('null-props.geojson', body);
    try {
      const parsed = await acquireLib.parseGeoJson(file, 'AREA_SHORT_CODE', intOrNull, 'neighbourhood_id');
      expect(parsed.badKey).toBe(1);
      expect(parsed.features).toHaveLength(0);
      expect(parsed.rowsParsed).toBe(1);
    } finally {
      cleanup();
    }
  });

  // -------------------------------------------------------------------------
  // T3 — the 0s contract: coerceKey's 2nd argument is DATA ONLY — exactly
  // `{ geojson }`, no logger, no pool, no config (Rule 2), so a
  // geometry-derived key (massing's `hash_`) is expressible without `crypto`
  // ever reaching the seam.
  // -------------------------------------------------------------------------
  it('T3 — coerceKey receives a 2nd argument whose keys are exactly [geojson]', async () => {
    const { file, cleanup } = fixture('ctx.geojson', JSON.stringify(FEATURES_FOUR));
    try {
      const spy = vi.fn((r: unknown, _ctx: { geojson: string | null }) => intOrNull(r));
      await acquireLib.parseGeoJson(file, 'AREA_SHORT_CODE', spy, 'neighbourhood_id');
      expect(spy).toHaveBeenCalled();
      const ctx = spy.mock.calls[0]![1] as Record<string, unknown>;
      expect(Object.keys(ctx)).toEqual(['geojson']);
      expect(ctx.geojson, 'the string, or null for a geometry-less feature').toBe(JSON.stringify(POLYGON));
    } finally {
      cleanup();
    }
  });

  // -------------------------------------------------------------------------
  // T4 — the legacy error contract: a parse failure names the file (streamed
  // form, file + parser reason — the legacy 100-char prefix is unreproducible
  // without buffering the document, which §9.5 forbids), and a FeatureCollection-
  // shaped object with no `features` array is refused BY NAME by the `Pick`
  // stage rather than iterated into zero rows.
  // -------------------------------------------------------------------------
  it('T4 — malformed JSON rejects with the legacy message form (streamed: file + parser reason); a missing features array is refused', async () => {
    const bad = fixture('bad.geojson', '{not json');
    try {
      // STREAMED form (Spec 43 §9.5, F2 fence): the file and the parser's reason are named;
      // the legacy 100-char prefix is gone because producing it requires buffering the whole
      // document — exactly what the fence forbids. The contract is unchanged: a malformed
      // download REJECTS, it never silently parses to zero rows.
      await expect(acquireLib.parseGeoJson(bad.file, 'AREA_SHORT_CODE', intOrNull, 'neighbourhood_id'))
        .rejects.toThrow(/^Failed to parse GeoJSON file .+ \(streamed via stream-json;/);
    } finally {
      bad.cleanup();
    }

    const noFeatures = fixture('no-features.geojson', '{"type":"FeatureCollection"}');
    try {
      await expect(acquireLib.parseGeoJson(noFeatures.file, 'AREA_SHORT_CODE', intOrNull, 'neighbourhood_id'))
        .rejects.toThrow(/features/);
    } finally {
      noFeatures.cleanup();
    }
  });

  // -------------------------------------------------------------------------
  // T5 — end to end through the seam: a `format: "geojson"` external downloads
  // and parses, and the acquired counters report the same numbers the parse
  // returned. Fold G-2 (2026-09-25): the runner passes keyProperty/keyColumn/
  // coerceKey as ARGUMENTS (they win over `external.key_property`), so this
  // test overrides all three on the copied `acquireArgs` (0r).
  // RED before 0v: the format axis rejects with /no parser/.
  // -------------------------------------------------------------------------
  it('T5 — acquireExternal(format:"geojson") acquires the FeatureCollection: feature_count 1, '
    + 'bad_key_count 2, null_geometry_count 1, rows_parsed 4', async () => {
    const descriptor = clone(LOAD_RAVINES);
    const external = {
      id: 'x', kind: 'http_file', url: 'http://ex/n.geojson', format: 'geojson', cache: 'none',
    };
    const fetchImpl = fetchOf([
      { status: 200 }, // HEAD
      { status: 200, body: JSON.stringify(FEATURES_FOUR) }, // GET
    ]);
    const log = { info: () => {}, warn: () => {}, error: () => {} };
    const r = await acquireLib.acquireExternal({
      ctxFetch: fetchImpl,
      log,
      tag: '[t5]',
      slug: descriptor.identity.name,
      external,
      descriptor,
      prior: null,
      timeoutMs: null,
      keyProperty: 'AREA_SHORT_CODE',
      keyColumn: 'neighbourhood_id',
      coerceKey: intOrNull,
      forced: false,
      preAcquisitionGate: () => ({ skip: false, reason: 't5' }),
      emitSkeleton: {},
    }) as { acquired: Record<string, number>; features: Array<Record<string, unknown>> };
    expect(r.acquired.feature_count).toBe(1);
    expect(r.acquired.bad_key_count).toBe(2);
    expect(r.acquired.null_geometry_count).toBe(1);
    expect(r.acquired.rows_parsed).toBe(4);
    expect(r.features[0]!.neighbourhood_id).toBe(1);
    expect(r.features[0]!.geojson).toBe(JSON.stringify(POLYGON));
  });

  // -------------------------------------------------------------------------
  // T6 — the schema: `geojson` is declarable, an unrecognised sibling is not.
  // -------------------------------------------------------------------------
  it('T6 — AJV: format "geojson" validates; "json" is rejected', () => {
    const good = clone(LOAD_RAVINES);
    good.inputs.reads.externals[0].format = 'geojson';
    expect(() => pipeline.step(good, async () => {})).not.toThrow();

    const bad = clone(LOAD_RAVINES);
    bad.inputs.reads.externals[0].format = 'json';
    expect(() => pipeline.step(bad, async () => {})).toThrow(/does not satisfy step\.schema\.json/);
  });

  // -------------------------------------------------------------------------
  // T7 — the F2 fence in behaviour (Spec 43 §9.5, Spec 124 Rule 1): the arm MUST
  // stream the document (`fs.createReadStream`) and MUST NOT whole-file read it.
  // commit cb21b6f3 slipped `fs.readFileSync(filePath,'utf8')` into this arm and
  // broke the load_ravines F2 no-whole-file-read fence; this pins the fix at the
  // call-site level so the reversion is caught even before the static fence.
  // The same 4-feature fixture T1 uses: same result, streamed read.
  // -------------------------------------------------------------------------
  it('T7 — parseGeoJson reads THROUGH a stream: fs.createReadStream is called and fs.readFileSync is NOT', async () => {
    const { file, cleanup } = fixture('stream.geojson', JSON.stringify(FEATURES_FOUR));
    const readSpy = vi.spyOn(fs, 'createReadStream');
    const wholeSpy = vi.spyOn(fs, 'readFileSync');
    const wholePromiseSpy = vi.spyOn(fs.promises, 'readFile');
    try {
      const parsed = await acquireLib.parseGeoJson(file, 'AREA_SHORT_CODE', intOrNull, 'neighbourhood_id');
      // The parse still lands the same numbers as T1 — the stream did not change the result.
      expect(parsed).toMatchObject({ badKey: 2, nullGeometry: 1, rowsParsed: 4 });
      expect(parsed.features).toHaveLength(1);
      expect(readSpy).toHaveBeenCalledTimes(1);
      expect(readSpy.mock.calls[0]![0]).toBe(file);
      // The F2 fence: no whole-file read of ANY kind (readFileSync OR the async readFile —
      // both buffer the document, and the fence bans the read, not the specific API).
      expect(wholeSpy).not.toHaveBeenCalled();
      expect(wholePromiseSpy).not.toHaveBeenCalled();
    } finally {
      readSpy.mockRestore();
      wholeSpy.mockRestore();
      wholePromiseSpy.mockRestore();
      cleanup();
    }
  });
});
