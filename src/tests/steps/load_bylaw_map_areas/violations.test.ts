// SPEC LINK: docs/specs/01-pipeline/58_source_zoning_bylaw.md §11.3 (second INGESTOR load_bylaw_map_areas)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §4.1 (three files, one slug), §5.1 (frozen shape), §1.4 (class B)
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (Rule 1 one home, Rule 3 no literal tunables, Rule 10 verdict row-derived)
// SPEC LINK: .cursor/wf1_mcbylaw_phase2_inputs_active_task.md (A3)

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const ROOT = path.resolve(__dirname, '../../../..');
const abs = (p: string) => path.join(ROOT, p);

const SHELL = 'scripts/load-bylaw-map-areas.js';
const DESC = 'scripts/load-bylaw-map-areas.descriptor.json';
const NOTES = 'scripts/load-bylaw-map-areas.notes.json';
const COMPUTE = 'scripts/lib/compute/load-bylaw-map-areas.js';
const MIG = 'migrations/254_bylaw_map_areas_sixplex.sql';
const SEED_REL = 'scripts/seeds/bylaw/maps/600_60.geojson';
const LOCKS = 'src/tests/pipeline-advisory-lock.infra.test.ts';

const nodeRequire = createRequire(import.meta.url);

function desc(): any {
  expect(fs.existsSync(abs(DESC)), DESC + ' missing').toBe(true);
  return JSON.parse(fs.readFileSync(abs(DESC), 'utf8'));
}

describe('load_bylaw_map_areas — static contract (Spec 122 §4.1 / §5.1)', () => {
  it('BMA-1 frozen shell', () => {
    expect(fs.existsSync(abs(SHELL)), SHELL + ' missing').toBe(true);
    const text = fs.readFileSync(abs(SHELL), 'utf8');
    expect(text).toContain("require('./lib/pipeline')");
    expect(text).toContain("require('./load-bylaw-map-areas.descriptor.json')");
    expect(text).toContain("require('./lib/compute/load-bylaw-map-areas')");
    expect(text).toContain('const ADVISORY_LOCK_ID = 127;');
    expect(text).toContain('module.exports = pipeline.step(descriptor, compute);');
    expect(text).not.toContain('pipeline.run(');
    expect(text).not.toContain('new Pool');
  });

  it('BMA-2 identity', () => {
    const d = desc();
    expect(d.identity.name).toBe('load_bylaw_map_areas');
    expect(d.identity.archetype).toBe('INGESTOR');
    expect(d.identity.lock).toBe(127);
    expect(d.identity.spec).toBe('58');
    expect(d.identity.contract_version).toBe(1);
  });

  it('BMA-3 lock registry', () => {
    expect(fs.existsSync(abs(LOCKS)), LOCKS + ' missing').toBe(true);
    const text = fs.readFileSync(abs(LOCKS), 'utf8');
    expect(text).toMatch(/'scripts\/load-bylaw-map-areas\.js':\s*127,/);
    const matches = text.match(/:\s*127,/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it('BMA-4 external', () => {
    const d = desc();
    const externals = d.inputs.reads.externals;
    expect(Array.isArray(externals)).toBe(true);
    expect(externals.length).toBe(1);
    const e = externals[0];
    expect(e.kind).toBe('filesystem');
    expect(e.format).toBe('geojson');
    expect(e.path).toBe(SEED_REL);
    expect(e.key_property).toBe('area_key');
    expect(e.url).toBeUndefined();
  });

  it('BMA-5 write target', () => {
    const d = desc();
    const writes = d.outputs.writes;
    expect(Array.isArray(writes)).toBe(true);
    expect(writes.length).toBe(1);
    const w = writes[0];
    expect(w.table).toBe('bylaw_map_areas');
    expect(w.key).toBe('area_key');
    expect(w.key_sql_type).toBe('TEXT');
    expect(w.geometry_kind).toBe('polygon');
    expect(w.write_discipline.class).toBe('upsert_scoped_departure_delete');
    expect(w.write_discipline.guard).toBe('is_distinct_from');
    expect(w.write_discipline.idempotent_rerun).toBe('zero_writes');
    expect(w.retract).toBe('departed');
  });

  it('BMA-6 columns == migration', () => {
    expect(fs.existsSync(abs(MIG)), MIG + ' missing').toBe(true);
    const mig = fs.readFileSync(abs(MIG), 'utf8');
    const startMarker = 'CREATE TABLE IF NOT EXISTS bylaw_map_areas (';
    const start = mig.indexOf(startMarker);
    expect(start).toBeGreaterThanOrEqual(0);
    const after = mig.slice(start + startMarker.length);
    const lines = after.split('\n');
    const body: string[] = [];
    for (const line of lines) {
      if (line === ');') break;
      body.push(line);
    }
    const migCols = new Set<string>();
    for (const line of body) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      if (trimmed.startsWith('CONSTRAINT')) continue;
      const m = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)/);
      const col = m?.[1];
      if (typeof col === 'string') migCols.add(col);
    }

    const d = desc();
    const w = d.outputs.writes[0];
    const descCols = new Set<string>((w.columns as any[]).map((c) => c.name));

    for (const c of migCols) {
      expect(descCols.has(c), `descriptor.columns missing migration column ${c}`).toBe(true);
    }
    for (const c of descCols) {
      expect(migCols.has(c), `migration missing descriptor column ${c}`).toBe(true);
    }

    const geom = (w.columns as any[]).find((c) => c.name === 'geom');
    expect(geom).toBeDefined();
    expect(geom.bind).toBe('wkb_geometry');

    const stepCols = new Set<string>(
      (w.columns as any[]).filter((c) => c.written === 'step').map((c) => c.name),
    );
    stepCols.delete('area_key');
    const guardCols = new Set<string>(w.write_discipline.guard_columns as string[]);
    for (const c of stepCols) {
      expect(guardCols.has(c), `guard_columns missing written-step column ${c}`).toBe(true);
    }
    for (const c of guardCols) {
      expect(stepCols.has(c), `guard_columns has non-step column ${c}`).toBe(true);
    }
  });

  it('BMA-7 staleness', () => {
    const d = desc();
    const trigger = d.staleness.trigger;
    expect(Array.isArray(trigger)).toBe(true);
    const externals = d.inputs.reads.externals;
    const item = trigger.find(
      (t: any) =>
        t.signal === 'content_hash' &&
        t.position === 'post_acquisition' &&
        t.external === externals[0].id,
    );
    expect(item, 'no content_hash/post_acquisition trigger for externals[0]').toBeDefined();
    const hasSourceValidator = trigger.some((t: any) => t.signal === 'source_validator');
    expect(hasSourceValidator).toBe(false);
  });

  it('BMA-8 checks dispatch', () => {
    const d = desc();
    expect(fs.existsSync(abs(COMPUTE)), COMPUTE + ' missing').toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const compute = nodeRequire(abs(COMPUTE));
    const computeKeys = Object.keys(compute.checks);
    expect(d.checks.map((c: any) => c.id)).toEqual(computeKeys);
    for (const key of computeKeys) {
      expect(compute.checks[key].name).toBe(key);
    }
    const ids: string[] = d.checks.map((c: any) => c.id);
    for (const required of [
      'seed_hash_matches_manifest',
      'source_counts_match_manifest',
      'bad_key_count',
      'duplicate_key_count',
      'null_geometry_count',
      'geometry_skipped_count',
      'dataset_source_license',
      'delete_skipped_empty_guard',
    ]) {
      expect(ids, `checks missing ${required}`).toContain(required);
    }
  });

  it('BMA-9 pre-write refusals', () => {
    const d = desc();
    const preWriteIds = [
      'seed_hash_matches_manifest',
      'source_counts_match_manifest',
      'bad_key_count',
      'duplicate_key_count',
      'null_geometry_count',
      'geometry_skipped_count',
    ];
    const terminals: any[] = d.terminals;
    for (const id of preWriteIds) {
      const check = d.checks.find((c: any) => c.id === id);
      expect(check, `check ${id} missing`).toBeDefined();
      expect(check.severity, `${id} severity`).toBe('FAIL');
      expect(check.when, `${id} when`).toBe('pre_write');
      const term = terminals.find((t: any) => t.id === 'failed_' + id && t.kind === 'fail_check');
      expect(term, `terminals missing failed_${id}/fail_check`).toBeDefined();
    }
  });

  it('BMA-10 terminals', () => {
    const d = desc();
    const terminals: any[] = d.terminals;
    for (const [id, kind] of [
      ['skipped_no_source_file', 'skip_gated'],
      ['skipped_content_hash', 'skip_gated'],
      ['loaded', 'success'],
      ['failed_acquisition', 'fail_error'],
      ['lock_held_elsewhere', 'skip_lock_contention'],
    ] as [string, string][]) {
      const term = terminals.find((t: any) => t.id === id && t.kind === kind);
      expect(term, `terminals missing ${id}/${kind}`).toBeDefined();
    }
  });
});

// BMA-11..20 (behaviour) follow below. The compute requires the committed seed manifest
// statically (the load_coa_notices vocab.json posture), so every behaviour lock runs
// against the REAL adopted manifest — there is no test-only manifest swap.

const MANIFEST_REL = 'scripts/seeds/bylaw/maps/manifest.json';
const M: any = JSON.parse(fs.readFileSync(abs(MANIFEST_REL), 'utf8'));
const GIS_COUNT: number = M.sources.find((s: any) => s.source === 'city_gis_layer80').feature_count;
const WARD_COUNT: number = M.sources.find((s: any) => s.source === 'ckan_wards_2018').ward_codes.length;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const c = (): any => nodeRequire(abs(COMPUTE));

function run(id: string, ctx: Record<string, unknown>): any {
  const out: Record<string, any> = {};
  c().checks[id]({
    config: {},
    ...ctx,
    report: (k: string, o: any) => {
      out[k] = o;
    },
  });
  return out[id];
}

describe('load_bylaw_map_areas — behaviour', () => {
  it('BMA-11 seed hash matches manifest (md5)', () => {
    expect(fs.existsSync(abs(COMPUTE)), COMPUTE + ' missing').toBe(true);
    expect(run('seed_hash_matches_manifest', { acquired: { content_hash: M.seed_md5 } }).violations).toBe(0);
    expect(run('seed_hash_matches_manifest', { acquired: { content_hash: 'c'.repeat(32) } }).violations).toBe(1);
    expect(run('seed_hash_matches_manifest', { acquired: { content_hash: null } }).violations).toBe(1);
    expect(run('seed_hash_matches_manifest', { acquired: {} }).violations).toBe(1);
  });

  it('BMA-12 source counts match manifest', () => {
    expect(fs.existsSync(abs(COMPUTE)), COMPUTE + ' missing').toBe(true);
    const tags = (gis: number, wards: number) => ({ shaped_tags: { 'source:city_gis_layer80': gis, 'source:ckan_wards_2018': wards } });
    expect(run('source_counts_match_manifest', { acquired: tags(GIS_COUNT, WARD_COUNT) }).violations).toBe(0);
    expect(run('source_counts_match_manifest', { acquired: tags(GIS_COUNT - 1, WARD_COUNT) }).violations).toBe(1);
    expect(run('source_counts_match_manifest', { acquired: tags(GIS_COUNT, WARD_COUNT - 1) }).violations).toBe(1);
    expect(run('source_counts_match_manifest', { acquired: tags(GIS_COUNT - 1, WARD_COUNT - 1) }).violations).toBe(2);
    expect(run('source_counts_match_manifest', { acquired: {} }).violations).toBe(2);
  });

  it('BMA-13 coerceKey', () => {
    expect(fs.existsSync(abs(COMPUTE)), COMPUTE + ' missing').toBe(true);
    const coerceKey = c().coerceKey;
    expect(coerceKey('city_gis_layer80:13202')).toBe('city_gis_layer80:13202');
    expect(coerceKey('ckan_wards_2018:23')).toBe('ckan_wards_2018:23');
    expect(coerceKey('foo:1')).toBeNull();
    expect(coerceKey('')).toBeNull();
    expect(coerceKey(null)).toBeNull();
    expect(coerceKey(undefined)).toBeNull();
    expect(coerceKey('ckan_wards_2018:x')).toBeNull();
    expect(coerceKey('city_gis_layer80:0')).toBeNull();
    expect(coerceKey(' city_gis_layer80:1')).toBeNull();
    expect(coerceKey('city_gis_layer80:1 ')).toBeNull();
    expect(coerceKey('city_gis_layer80')).toBeNull();
  });

  it('BMA-14 shapeRecord', () => {
    expect(fs.existsSync(abs(COMPUTE)), COMPUTE + ' missing').toBe(true);
    const tags: string[] = [];
    const seam = {
      geojson: '{"type":"MultiPolygon","coordinates":[]}',
      tag: (n: string) => {
        tags.push(n);
      },
    };
    const props = {
      area_key: 'ckan_wards_2018:23',
      map_code: M.map_code,
      source: 'ckan_wards_2018',
      source_feature_id: 23,
      area_type: 3,
      area_name: 'Scarborough North (23)',
    };
    const rec = c().shapeRecord(props, seam);
    expect(Object.keys(rec).sort()).toEqual([
      'area_name',
      'area_type',
      'geojson',
      'map_code',
      'seed_sha256',
      'source',
      'source_feature_id',
    ]);
    expect(rec.seed_sha256).toBe(M.seed_sha256);
    expect(tags).toContain('source:ckan_wards_2018');

    expect(c().shapeRecord({ ...props, area_key: 'city_gis_layer80:23' }, seam)).toBe('key_source_mismatch');
    expect(c().shapeRecord({ ...props, area_type: 5 }, seam)).toBe('bad_area_type');
    expect(c().shapeRecord({ ...props, map_code: '600.10' }, seam)).toBe('bad_map_code');
  });

  it('BMA-15 empty-guard + dedupe', () => {
    expect(fs.existsSync(abs(COMPUTE)), COMPUTE + ' missing').toBe(true);
    const shouldSkipDelete = c().shouldSkipDelete;
    expect(shouldSkipDelete([])).toBe(true);
    expect(shouldSkipDelete(undefined)).toBe(true);
    expect(shouldSkipDelete(['x'])).toBe(false);

    const res = c().dedupeBySourceId([
      { area_key: 'a', n: 1 },
      { area_key: 'a', n: 2 },
      { area_key: 'b', n: 3 },
    ]);
    expect(res.kept).toEqual([
      { area_key: 'a', n: 1 },
      { area_key: 'b', n: 3 },
    ]);
    expect(res.duplicateCount).toBe(1);
  });

  it('BMA-16 emits bylaw_map_load object', () => {
    const d = desc();
    const emit = d.emits.find((e: any) => e.key === 'bylaw_map_load');
    expect(emit, 'emits missing bylaw_map_load').toBeDefined();
    expect(emit.type).toBe('object');
    // R-BF: no step reads this block (enrich_parcels' edge is a watermark pin on the TABLE).
    expect(emit.consumers).toEqual([]);
    const skeletonKeys = Object.keys(emit.skeleton ?? {});
    for (const k of [
      'seed_sha256',
      'content_hash',
      'feature_count',
      'areas_inserted',
      'areas_updated',
      'areas_deleted',
      'delete_skipped_empty_guard',
      'skipped_reason',
    ]) {
      expect(skeletonKeys, `skeleton missing ${k}`).toContain(k);
    }
  });

  it('BMA-16b the load block carries content_hash, the key the content-hash skip compares', () => {
    // source-version.js validatorEqualityDecision compares priorMeta.content_hash, and the prior
    // block is records_meta[emits[0].key] — so the gate can only ever skip if this key is set.
    const meta = c().buildLoadMeta({
      acquired: { content_hash: M.seed_md5, feature_count: 27 },
      written: { inserted: 27, updated: 0, deleted: 0 },
    });
    expect(meta.content_hash).toBe(M.seed_md5);
    expect(meta.feature_count).toBe(27);
    expect(meta.areas_inserted).toBe(27);
    expect(meta.areas_updated).toBe(0);
    // A counter the library did not report is null, never a 0 it did not measure (BMA-F2).
    const unmeasured = c().buildLoadMeta({ acquired: {}, written: {} });
    expect(unmeasured.content_hash).toBeNull();
    expect(unmeasured.feature_count).toBeNull();
    expect(unmeasured.areas_inserted).toBeNull();
  });

  it('BMA-17 guards + database', () => {
    const d = desc();
    const requires = d.guards.requires as any[];
    const hasReq = (kind: string, name: string) =>
      requires.some((r) => r.kind === kind && r.name === name);
    expect(hasReq('extension', 'postgis'), 'missing extension postgis').toBe(true);
    expect(hasReq('index', 'idx_bylaw_map_areas_geom_gist'), 'missing gist index').toBe(true);
    expect(d.guards.srid).toBe(4326);
    expect(d.guards.empty_source).toBe('bylaw_map_areas');
    expect(d.database.min_migration).toBe(254);
  });

  it('BMA-18 shell loads without a pool', () => {
    expect(fs.existsSync(abs(SHELL)), SHELL + ' missing').toBe(true);
    const r = spawnSync(
      process.execPath,
      ['-e', "require('./scripts/load-bylaw-map-areas.js'); console.log('ok')"],
      {
        cwd: ROOT,
        encoding: 'utf8',
        env: { ...process.env, DATABASE_URL: '', PG_HOST: '', PG_DATABASE: '' },
      },
    );
    expect(r.status).toBe(0);
    expect(String(r.stdout)).toContain('ok');
  });

  it('BMA-19 notes cap', () => {
    expect(fs.existsSync(abs(NOTES)), NOTES + ' missing').toBe(true);
    const notes = JSON.parse(fs.readFileSync(abs(NOTES), 'utf8'));
    let total = 0;
    for (const k of [
      'expected_shape',
      'read_this_way',
      'suspicious_if',
      'blind_spots',
      'decisions',
      'review_notes',
      'expected',
      'known_normal',
      'known_bad',
      'do_not_reflag',
      'how_to_investigate',
      'limitations',
    ]) {
      const v = notes[k];
      if (Array.isArray(v)) total += v.length;
    }
    expect(total).toBeGreaterThanOrEqual(1);
    expect(total).toBeLessThanOrEqual(12);
  });

  it('BMA-20 licence recorded, not decided', () => {
    expect(fs.existsSync(abs(COMPUTE)), COMPUTE + ' missing').toBe(true);
    const d = desc();
    const check = d.checks.find((x: any) => x.id === 'dataset_source_license');
    expect(check, 'check dataset_source_license missing').toBeDefined();
    expect(check.severity).toBe('WARN'); // O-2 (2026-10-17): a threshold exists (R-H addendum / LG-29), so not INFO

    const ok = run('dataset_source_license', { acquired: {} });
    expect(ok.violations).toBe(0);
    expect(ok.detail.sources.city_gis_layer80.ruling).toBe('not stated — City of Toronto GIS, unverified');
    expect(ok.detail.sources.city_gis_layer80.publish_scope).toBe('local_only');
    // One row per manifest source, so a source added to the manifest is recorded too.
    expect(Object.keys(ok.detail.sources)).toEqual(M.sources.map((s: any) => s.source));
  });
});

// ---------------------------------------------------------------------------
// Fold 2 — review lenses (BMA-F1..F5). Each claim below fixes a gate that could
// pass or fail for the WRONG reason: an unpinned count, an unmeasured counter, a
// key the grammar should never have accepted, an unvalidated pin.
// ---------------------------------------------------------------------------

describe('load_bylaw_map_areas — fold 2 (review lenses)', () => {
  it('BMA-F1 source_counts_match_manifest refuses when a side is unmeasured', () => {
    expect(fs.existsSync(abs(COMPUTE)), COMPUTE + ' missing').toBe(true);
    // A pinned side with an unmeasured count refuses (that side only).
    expect(
      run('source_counts_match_manifest', {
        acquired: { shaped_tags: { 'source:city_gis_layer80': GIS_COUNT } },
      }).violations,
    ).toBe(1);
    // A non-number or a negative measurement is unmeasured, not a match.
    expect(
      run('source_counts_match_manifest', {
        acquired: { shaped_tags: { 'source:city_gis_layer80': String(GIS_COUNT), 'source:ckan_wards_2018': WARD_COUNT } },
      }).violations,
    ).toBe(1);
    // Both pins present and both counts measured — the only configuration that is green.
    const green = run('source_counts_match_manifest', {
      acquired: { shaped_tags: { 'source:city_gis_layer80': GIS_COUNT, 'source:ckan_wards_2018': WARD_COUNT } },
    });
    expect(green.violations).toBe(0);
    expect(green.detail.counts.city_gis_layer80).toEqual({ got: GIS_COUNT, want: GIS_COUNT });
    expect(green.detail.counts.ckan_wards_2018).toEqual({ got: WARD_COUNT, want: WARD_COUNT });
  });

  it('BMA-F2 an unmeasured counter refuses; a measured zero passes', () => {
    expect(fs.existsSync(abs(COMPUTE)), COMPUTE + ' missing').toBe(true);

    const counters: [string, string][] = [
      ['bad_key_count', 'bad_key_count'],
      ['duplicate_key_count', 'duplicate_key_count'],
      ['null_geometry_count', 'null_geometry_count'],
      ['geometry_skipped_count', 'invalid_geometry_skipped'],
    ];

    for (const [id, field] of counters) {
      const refused = run(id, { acquired: {} });
      expect(refused.violations, `${id} with no counter`).toBe(1);
      expect(refused.detail.unmeasured, `${id} detail.unmeasured`).toBe(true);
      expect(refused.detail[field], `${id} detail.${field}`).toBeNull();

      // A non-number and a negative count are equally unmeasured, and equally refused.
      expect(run(id, { acquired: { [field]: '0' } }).violations, `${id} with a string`).toBe(1);
      expect(run(id, { acquired: { [field]: -1 } }).violations, `${id} with a negative`).toBe(1);

      const measuredZero = run(id, { acquired: { [field]: 0 } });
      expect(measuredZero.violations, `${id} with a measured zero`).toBe(0);
      expect(measuredZero.detail.unmeasured, `${id} zero is not unmeasured`).toBeUndefined();
      expect(measuredZero.detail[field], `${id} detail.${field} zero`).toBe(0);

      expect(run(id, { acquired: { [field]: 3 } }).violations, `${id} with 3`).toBe(3);
    }
  });

  it('BMA-F3 shapeRecord refuses a non-integer / non-positive source_feature_id', () => {
    expect(fs.existsSync(abs(COMPUTE)), COMPUTE + ' missing').toBe(true);
    const seam = { geojson: '{"type":"MultiPolygon","coordinates":[]}' };
    const props = {
      area_key: 'ckan_wards_2018:23',
      map_code: M.map_code,
      source: 'ckan_wards_2018',
      source_feature_id: 23,
      area_type: 3,
      area_name: 'Scarborough North (23)',
    };

    for (const bad of [0, 1.5]) {
      expect(
        c().shapeRecord({ ...props, source_feature_id: bad, area_key: `ckan_wards_2018:${bad}` }, seam),
        `source_feature_id ${bad}`,
      ).toBe('key_source_mismatch');
    }
    // A padded string id is NOT the integer id the manifest pinned, even when it stringifies equal.
    expect(c().shapeRecord({ ...props, source_feature_id: '071', area_key: 'ckan_wards_2018:071' }, seam))
      .toBe('key_source_mismatch');
    expect(c().shapeRecord({ ...props, source_feature_id: '23' }, seam)).toBe('key_source_mismatch');

    // The positive integer id still shapes.
    expect(c().shapeRecord(props, seam).source_feature_id).toBe(23);
  });

  it('BMA-F4 the manifest is static committed data whose pins are validated at load', () => {
    expect(fs.existsSync(abs(COMPUTE)), COMPUTE + ' missing').toBe(true);
    const text = fs.readFileSync(abs(COMPUTE), 'utf8');
    // Static require (the load_coa_notices vocab.json posture): no try/catch, no swap seam.
    expect(text).toContain("const MANIFEST = require('../../seeds/bylaw/maps/manifest.json');");
    expect(text).not.toContain('MODULE_NOT_FOUND');
    expect(text).not.toContain('__setManifestForTest');
    expect(text).not.toMatch(/\blet MANIFEST\b/);
    for (const field of ['seed_sha256', 'seed_md5', 'map_code', 'sources', 'area_types']) {
      expect(text, `no load-time guard for ${field}`).toContain(`BMA_E_MANIFEST ${field}`);
    }
    // The committed pins are well-formed, so the module loads.
    expect(M.seed_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(M.seed_md5).toMatch(/^[0-9a-f]{32}$/);
    // The map code, the sources and the area types are the manifest's, never a second copy.
    expect(c().MAP_CODE).toBe(M.map_code);
    expect(c().SOURCES).toEqual(M.sources.map((s: any) => s.source));
  });

  it('BMA-F5 source_counts_match_manifest surfaces shaped_skipped_by_reason', () => {
    expect(fs.existsSync(abs(COMPUTE)), COMPUTE + ' missing').toBe(true);

    const withReasons = run('source_counts_match_manifest', {
      acquired: {
        shaped_tags: { 'source:city_gis_layer80': GIS_COUNT - 1, 'source:ckan_wards_2018': WARD_COUNT },
        shaped_skipped_by_reason: { bad_area_type: 1 },
      },
    });
    expect(Object.prototype.hasOwnProperty.call(withReasons.detail, 'shaped_skipped_by_reason')).toBe(true);
    expect(withReasons.detail.shaped_skipped_by_reason).toEqual({ bad_area_type: 1 });

    // Absent on the ctx, it is still present on the detail — as an empty object, not undefined.
    const withoutReasons = run('source_counts_match_manifest', {
      acquired: { shaped_tags: { 'source:city_gis_layer80': GIS_COUNT, 'source:ckan_wards_2018': WARD_COUNT } },
    });
    expect(Object.prototype.hasOwnProperty.call(withoutReasons.detail, 'shaped_skipped_by_reason')).toBe(true);
    expect(withoutReasons.detail.shaped_skipped_by_reason).toEqual({});
  });
});
