// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.3 (guards.schema_drift); registry-truth plan Phase 3 WIRE #33 (PLAN :238); fold 19 MQ-A2 (a) + compliance amendment; FLEET-2 A-3
//
// WIRE #33 — `guards.schema_drift`. The baseline header is the PRIOR completed run's
// recorded header (`records_meta.acquired.record_fields`, keyed by external id), read
// through the ONE R-BG (iv) baseline selector (`source-version.js readPriorRunMeta`:
// status ∈ {completed, completed_with_warnings}, never a `write_skipped_pre_write_warn`
// run). A changed header is drift: `pause` → the write is refused with an errored FAIL
// row; `propagate` → a WARN row and the write continues; `none` → no check, no row. No
// eligible baseline, or no `record_fields` on either side ⇒ a counted INFO `no_baseline`
// row, never silently an older run. Per-layer arm arrays match `match` against the
// external id, else the `"default"` arm.
//
// Every `it` below is RED today (the API it names does not exist yet) except where the
// comment says GREEN control.
import { describe, expect, it } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS library
const acquire = require(join(process.cwd(), 'scripts/lib/step/acquire.js'));
// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS library
const stepLib = require(join(process.cwd(), 'scripts/lib/step/index.js'));
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const coerce = (v: unknown) => (v == null || v === '' ? null : String(v));

// The descriptor builder the runner receives: ONE non-lookup external (`x`) and one
// lookup (`lk`) that must never appear in the drift surface (`recordFieldsMeta`).
const d = (drift: unknown) => ({
  identity: { name: 'fx', archetype: 'INGESTOR' },
  guards: { schema_drift: drift },
  inputs: { reads: { externals: [{ id: 'x' }, { id: 'lk', role: 'lookup' }] } },
});

// A temp dir with one file written into it; the caller cleans up in a `finally`.
const fixture = (name: string, body: string) => {
  const dir = mkdtempSync(join(tmpdir(), 'p3c1-33-'));
  const file = join(dir, name);
  writeFileSync(file, body);
  return { dir, file, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
};

describe('WIRE #33 — guards.schema_drift (fold 19 MQ-A2 (a))', () => {
  // -------------------------------------------------------------------------
  // S1 — parseCsv returns `recordFields` = Object.keys of the FIRST RAW record.
  // RED today: parseCsv returns only { features, badKey, nullGeometry, rowsParsed }.
  // -------------------------------------------------------------------------
  it('S1 — parseCsv carries recordFields from the FIRST RAW record, null on an empty source', async () => {
    const { file, cleanup } = fixture('s.csv', 'id,name,geom\n1,a,g\n2,b,h\n');
    try {
      const parsed = await acquire.parseCsv(file, { bom: false, relax_quotes: false }, 'id', coerce, 'id');
      expect(parsed.recordFields, 'Object.keys of record one, header order preserved').toEqual(['id', 'name', 'geom']);
    } finally {
      cleanup();
    }
    const empty = fixture('empty.csv', '');
    try {
      const parsed = await acquire.parseCsv(empty.file, { bom: false, relax_quotes: false }, 'id', coerce, 'id');
      expect(parsed.recordFields, 'no record ⇒ no header to record').toBeNull();
    } finally {
      empty.cleanup();
    }
  });

  // -------------------------------------------------------------------------
  // S2 — parseGeoJson returns `recordFields` from the FIRST feature's RAW properties,
  // BEFORE any key/geometry drop.
  // RED today: parseGeoJson does not carry recordFields at all.
  // -------------------------------------------------------------------------
  it('S2 — parseGeoJson carries recordFields before the key/geometry drop', async () => {
    const body = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { k: 1, z: 'q' }, geometry: { type: 'Point', coordinates: [0, 0] } },
      ],
    });
    const { file, cleanup } = fixture('g.geojson', body);
    try {
      const parsed = await acquire.parseGeoJson(file, 'k', coerce, 'k');
      expect(parsed.recordFields).toEqual(['k', 'z']);
    } finally {
      cleanup();
    }
    // A first feature WITHOUT the key property still sets recordFields: the raw record,
    // before the bad-key drop, is what the header check reads.
    const keyless = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { other: 1 }, geometry: null },
        { type: 'Feature', properties: { k: 2 }, geometry: { type: 'Point', coordinates: [1, 1] } },
      ],
    });
    const { file: f2, cleanup: c2 } = fixture('keyless.geojson', keyless);
    try {
      const parsed = await acquire.parseGeoJson(f2, 'k', coerce, 'k');
      expect(parsed.recordFields, 'the second feature is never reached — feature one IS the header').toEqual(['other']);
    } finally {
      c2();
    }
  });

  // -------------------------------------------------------------------------
  // S3 — the acquire seam's structural lock: every parser computes a recordFields,
  // and the feature-arm `acquired` block carries it.
  // RED today: `recordFields` does not appear in the parser range or the return.
  // -------------------------------------------------------------------------
  it('S3 — acquire.js: parseShapefile computes recordFields and the feature arm carries record_fields', () => {
    const src = readFileSync(join(process.cwd(), 'scripts/lib/step/acquire.js'), 'utf8');
    const start = src.indexOf('async function parseShapefile(');
    const end = src.indexOf('async function parseCsv(');
    expect(start, 'parseShapefile exists').toBeGreaterThan(-1);
    expect(end, 'parseCsv follows parseShapefile').toBeGreaterThan(start);
    expect(src.slice(start, end), 'the shapefile arm computes the same header').toContain('recordFields');
    const armStart = src.indexOf('async function acquireExternal(');
    expect(armStart, 'acquireExternal exists').toBeGreaterThan(-1);
    expect(src.slice(armStart), 'the feature arm return carries the parsed header')
      .toContain('record_fields: parsed.recordFields');
  });

  // -------------------------------------------------------------------------
  // S4 — `pause`: drift refuses the write with an errored FAIL row.
  // RED today: stepLib.schemaDriftDecision is not a function.
  // -------------------------------------------------------------------------
  it('S4 — pause drift: refused true, errored FAIL gate row', () => {
    const out = stepLib.schemaDriftDecision(d('pause'), 'x', ['a', 'c'], { found: true, fields: { x: ['a', 'b'] } });
    expect(out.refused).toBe(true);
    expect(out.row).toEqual({
      metric: 'schema_drift:x',
      value: 'added: c; removed: b',
      threshold: stepLib.SCHEMA_DRIFT_THRESHOLD,
      status: 'FAIL',
      source: 'gate',
      errored: true,
    });
  });

  // -------------------------------------------------------------------------
  // S5 — `propagate`: a WARN row, the write continues, no `errored` key.
  // RED today: same missing function.
  // -------------------------------------------------------------------------
  it('S5 — propagate drift: WARN gate row, never refused, no errored key', () => {
    const out = stepLib.schemaDriftDecision(d('propagate'), 'x', ['a', 'c'], { found: true, fields: { x: ['a', 'b'] } });
    expect(out.refused).toBe(false);
    expect(out.row.status).toBe('WARN');
    expect(out.row.source).toBe('gate');
    expect(Object.prototype.hasOwnProperty.call(out.row, 'errored'), 'propagate is not an error').toBe(false);
  });

  // -------------------------------------------------------------------------
  // S6 — unchanged header: order is ignored, so a re-ordered source is NOT drift.
  // RED today: same missing function.
  // -------------------------------------------------------------------------
  it('S6 — unchanged header (order ignored) is INFO, never refused', () => {
    const out = stepLib.schemaDriftDecision(d('pause'), 'x', ['b', 'a'], { found: true, fields: { x: ['a', 'b'] } });
    expect(out.refused).toBe(false);
    expect(out.row.status).toBe('INFO');
    expect(out.row.value).toBe('header unchanged (2 fields)');
  });

  // -------------------------------------------------------------------------
  // S7 — the compliance amendment: every "no baseline" flavour is a COUNTED INFO
  // row, never a silent pass and never an older run's header.
  // RED today: same missing function.
  // -------------------------------------------------------------------------
  it('S7 — no_baseline arms: no prior run / no prior fields / no current fields are all INFO', () => {
    const noRun = stepLib.schemaDriftDecision(d('pause'), 'x', ['a'], { found: false, fields: null });
    expect(noRun.refused).toBe(false);
    expect(noRun.row.status).toBe('INFO');
    expect(noRun.row.value).toBe('no_baseline: no eligible prior run');

    const noPriorFields = stepLib.schemaDriftDecision(d('pause'), 'x', ['a'], { found: true, fields: {} });
    expect(noPriorFields.refused).toBe(false);
    expect(noPriorFields.row.status).toBe('INFO');
    expect(noPriorFields.row.value).toBe('no_baseline: the prior run recorded no record_fields');

    const noCurrentFields = stepLib.schemaDriftDecision(d('pause'), 'x', null, { found: true, fields: { x: ['a'] } });
    expect(noCurrentFields.refused).toBe(false);
    expect(noCurrentFields.row.status).toBe('INFO');
    expect(noCurrentFields.row.value).toBe('no_baseline: this run recorded no record_fields');
  });

  // -------------------------------------------------------------------------
  // S8 — `none`: no check, no row at all.
  // RED today: same missing function.
  // -------------------------------------------------------------------------
  it('S8 — response "none" produces no decision and no row', () => {
    expect(stepLib.schemaDriftDecision(d('none'), 'x', ['a'], { found: true, fields: { x: ['b'] } })).toBeNull();
  });

  // -------------------------------------------------------------------------
  // S9 — per-layer arm arrays: match === externalId, else the "default" arm.
  // RED today: same missing function.
  // -------------------------------------------------------------------------
  it('S9 — per-layer arms resolve by external id, then the default arm', () => {
    const arms = [
      { match: 'x', response: 'pause', severity: 'FAIL' },
      { match: 'default', response: 'propagate', severity: 'WARN' },
    ];
    const descriptor = {
      identity: { name: 'fx', archetype: 'INGESTOR' },
      guards: { schema_drift: arms },
      inputs: { reads: { externals: [{ id: 'x' }, { id: 'y' }] } },
    };
    const x = stepLib.schemaDriftDecision(descriptor, 'x', ['a', 'c'], { found: true, fields: { x: ['a', 'b'] } });
    expect(x.refused).toBe(true);
    expect(x.row.status).toBe('FAIL');
    expect(x.row.errored).toBe(true);

    const y = stepLib.schemaDriftDecision(descriptor, 'y', ['a', 'c'], { found: true, fields: { y: ['a', 'b'] } });
    expect(y.refused).toBe(false);
    expect(y.row.status).toBe('WARN');
  });

  // -------------------------------------------------------------------------
  // S10 — recordFieldsMeta: ONE entry per NON-lookup external, and a skip
  // RE-STAMPS the baseline so the next run still has one.
  // RED today: stepLib.recordFieldsMeta is not a function.
  // -------------------------------------------------------------------------
  it('S10 — recordFieldsMeta keys every non-lookup external and re-stamps a skip', () => {
    const single = stepLib.recordFieldsMeta(
      { skipped: false, acquired: { record_fields: ['a'] } },
      d('pause'),
      { found: true, fields: { x: ['old'] } },
    );
    expect(single, 'the lookup `lk` is absent').toEqual({ x: ['a'] });

    const skipped = stepLib.recordFieldsMeta(
      { skipped: true, acquired: {} },
      d('pause'),
      { found: true, fields: { x: ['old'] } },
    );
    expect(skipped, 'a skip carries the prior header forward (§1.3 re-stamp)').toEqual({ x: ['old'] });

    const multi = stepLib.recordFieldsMeta(
      {
        skipped: false,
        acquired: {
          primaries: {
            x: { outcome: 'loaded', record_fields: ['n'] },
            y: { outcome: 'skipped' },
          },
        },
      },
      {
        identity: { name: 'fx', archetype: 'INGESTOR' },
        guards: { schema_drift: 'pause' },
        inputs: { reads: { externals: [{ id: 'x' }, { id: 'y' }] } },
      },
      { found: true, fields: { y: ['p'] } },
    );
    expect(multi, 'per primary: loaded reads this run, skipped carries the baseline').toEqual({ x: ['n'], y: ['p'] });
  });

  // -------------------------------------------------------------------------
  // S11 — schemaDriftRows flattens every decision's row off the phase results.
  // RED today: stepLib.schemaDriftRows is not a function.
  // -------------------------------------------------------------------------
  it('S11 — schemaDriftRows collects the row(s) of each schemaDrift decision', () => {
    expect(stepLib.schemaDriftRows([{ schemaDrift: { row: { metric: 'schema_drift:x' } } }]))
      .toEqual([{ metric: 'schema_drift:x' }]);
    expect(stepLib.schemaDriftRows([{
      schemaDrift: [{ row: { metric: 'a' } }, { row: { metric: 'b' } }],
    }])).toEqual([{ metric: 'a' }, { metric: 'b' }]);
    expect(stepLib.schemaDriftRows([null, {}])).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // S12 — the runner wiring lock: RUNNER_META_KEYS, the decision BEFORE the write
  // gate, the refusal reason, and the baseline selector inside runWithPool.
  // RED today: `acquired` is not a meta key and none of the seams exist.
  // -------------------------------------------------------------------------
  it('S12 — index.js wires schema drift before the write gate over an R-BG (iv) baseline', () => {
    const src = readFileSync(join(process.cwd(), 'scripts/lib/step/index.js'), 'utf8');
    expect(stepLib.RUNNER_META_KEYS, 'the recorded header reaches records_meta.acquired').toContain('acquired');

    const phaseStart = src.indexOf('async function runIngestPhase(');
    expect(phaseStart, 'runIngestPhase exists').toBeGreaterThan(-1);
    const phase = src.slice(phaseStart);
    const decisionAt = phase.indexOf('schemaDriftDecision(');
    const gateAt = phase.indexOf('preWriteGate({ acquired, prior, overrides, written: null })');
    expect(decisionAt, 'the drift decision is wired into the ingest phase').toBeGreaterThan(-1);
    expect(gateAt, 'the write gate is present').toBeGreaterThan(-1);
    expect(decisionAt, 'drift is decided BEFORE the write gate').toBeLessThan(gateAt);
    expect(phase, 'a refused drift is named in the refusal reason').toContain("reason: 'schema_drift_refused'");

    const poolStart = src.indexOf('async function runWithPool(');
    expect(poolStart, 'runWithPool exists').toBeGreaterThan(-1);
    const pool = src.slice(poolStart);
    expect(pool).toContain('...schemaDriftRows([ingest])');
    expect(pool).toContain('acquired: { record_fields: recordFieldsMeta(');
    expect(
      src.includes('readPriorRunMeta') || src.includes('readPriorEmitWithPosture('),
      'the baseline comes from the ONE R-BG (iv) selector',
    ).toBe(true);
    expect(pool, 'the eligible-baseline computation is named inside runWithPool').toContain('schemaDriftBaseline');
  });
});
