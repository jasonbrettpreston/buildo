// 🔗 SPEC LINK: docs/specs/01-pipeline/58_source_zoning_bylaw.md (v2.3) §3, §4
// 🔗 SPEC LINK: docs/specs/01-pipeline/48_pipeline_observability.md §3.6
//
// Pure-function tests for the Spec 58 zoning ingest helpers.
// This file covers the DB-independent logic of the loader's libs:
//   - scripts/lib/zoning-attr-drift.js  — F-H3 drift policy
//   - scripts/lib/geometry-validator.js — F-M9/R2-18 geometry SQL + classification
// PostGIS behaviour itself (ST_MakeValid / ST_CollectionExtract) is verified in
// src/tests/db/zoning.db.test.ts; here we lock the pure contracts those rely on.

import { describe, it, expect } from 'vitest';
import { checkAttrDrift } from '../../scripts/lib/zoning-attr-drift';
import {
  POLYGON,
  LINESTRING,
  COLLECTION_EXTRACT_TYPE,
  geomColumnSql,
  geometryValidationSql,
  classifyGeometry,
} from '../../scripts/lib/geometry-validator';

describe('zoning-attr-drift.checkAttrDrift (F-H3)', () => {
  const REQUIRED = ['_id', 'ZN_ZONE', 'ZN_STRING', 'COVERAGE', 'FSI_TOTAL', 'geometry'];

  it('ok=true when all required columns are present', () => {
    const r = checkAttrDrift(REQUIRED, REQUIRED);
    expect(r.ok).toBe(true);
    expect(r.missingRequired).toEqual([]);
    expect(r.extraColumns).toEqual([]);
  });

  it('ok=false and lists the missing required column when one is absent', () => {
    const present = ['_id', 'ZN_ZONE', 'ZN_STRING', 'FSI_TOTAL', 'geometry']; // COVERAGE dropped
    const r = checkAttrDrift(present, REQUIRED);
    expect(r.ok).toBe(false);
    expect(r.missingRequired).toEqual(['COVERAGE']);
  });

  it('F-H3: extra/unknown columns DO NOT abort (ok stays true) and are surfaced', () => {
    const present = [...REQUIRED, 'NEW_CITY_COLUMN', 'ANOTHER_EXTRA'];
    const r = checkAttrDrift(present, REQUIRED);
    expect(r.ok).toBe(true);
    expect(r.missingRequired).toEqual([]);
    expect(r.extraColumns).toEqual(expect.arrayContaining(['NEW_CITY_COLUMN', 'ANOTHER_EXTRA']));
  });

  it('is case-insensitive (dbf field casing must not matter)', () => {
    const present = ['_id', 'zn_zone', 'Zn_String', 'coverage', 'fsi_total', 'GEOMETRY'];
    const r = checkAttrDrift(present, REQUIRED);
    expect(r.ok).toBe(true);
    expect(r.missingRequired).toEqual([]);
  });

  it('treats empty/undefined inputs safely', () => {
    expect(checkAttrDrift([], REQUIRED).ok).toBe(false);
    expect(checkAttrDrift(undefined as unknown as string[], []).ok).toBe(true);
  });
});

describe('geometry-validator.geomColumnSql (R2-18)', () => {
  it('polygon layers extract type 3 and Multi-wrap', () => {
    const sql = geomColumnSql('$5', POLYGON);
    expect(sql).toBe('ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_GeomFromGeoJSON($5)), 3))');
  });

  it('linestring layers extract type 2 and Multi-wrap', () => {
    const sql = geomColumnSql('$5', LINESTRING);
    expect(sql).toBe('ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_GeomFromGeoJSON($5)), 2))');
  });

  it('exposes the canonical extract-type map (3=polygon, 2=linestring)', () => {
    expect(COLLECTION_EXTRACT_TYPE).toEqual({ polygon: 3, linestring: 2 });
  });

  it('throws on an unknown geometry kind rather than emitting wrong SQL', () => {
    expect(() => geomColumnSql('$1', 'point' as 'polygon')).toThrow(/unknown geomKind/);
  });
});

describe('geometry-validator.geometryValidationSql (F-M9)', () => {
  it('always validates via ST_MakeValid + ST_IsEmpty-after-extract', () => {
    const sql = geometryValidationSql(POLYGON);
    expect(sql).toContain('ST_MakeValid');
    expect(sql).toContain('ST_IsEmpty(ST_CollectionExtract(ST_MakeValid(g.geom), 3))');
    expect(sql).toContain('unnest($1::text[]) WITH ORDINALITY');
    // polygons have no simplicity requirement
    expect(sql).toContain('TRUE');
    expect(sql).not.toContain('ST_IsSimple');
  });

  it('linestring layers additionally require positive length + simplicity (F-M9)', () => {
    const sql = geometryValidationSql(LINESTRING);
    expect(sql).toContain('ST_CollectionExtract(ST_MakeValid(g.geom), 2)');
    expect(sql).toContain('ST_IsSimple(g.geom)');
    expect(sql).toContain('ST_Length(g.geom::geography) > 0');
  });
});

describe('geometry-validator.classifyGeometry', () => {
  it('valid-as-is geometry → valid', () => {
    expect(classifyGeometry({ valid_before: true, empty_after: false, simple_ok: true })).toBe('valid');
  });

  it('invalid-but-repairable geometry → repaired', () => {
    expect(classifyGeometry({ valid_before: false, empty_after: false, simple_ok: true })).toBe('repaired');
  });

  it('empty-after-extract (no target geometry / GeometryCollection mismatch) → discarded', () => {
    expect(classifyGeometry({ valid_before: true, empty_after: true, simple_ok: true })).toBe('discarded');
  });

  it('linestring failing F-M9 simplicity → discarded even if non-empty', () => {
    expect(classifyGeometry({ valid_before: true, empty_after: false, simple_ok: false })).toBe('discarded');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Loader pure helpers (scripts/load-zoning.js) — locks mid-process review fixes
// ─────────────────────────────────────────────────────────────────────────
import {
  LAYERS,
  coerceSourceId,
  coerceColumn,
  parseHeightLabel,
  dedupeRejectAll,
  orphanStatus,
  loadedCountStatus,
  loadedPctStatus,
  priorMetricValue,
  withExceptionsStatus,
  durationStatus,
  datasetVersionAgeStatus,
  topNDistribution,
  verdictCascade,
  skipCheckDecision,
} from '../../scripts/load-zoning';

describe('load-zoning.coerceSourceId (F-M7, M4)', () => {
  it('accepts positive integers', () => expect(coerceSourceId(11719)).toBe(11719));
  it('rejects 0 (degenerate upsert key — M4)', () => expect(coerceSourceId(0)).toBeNull());
  it('rejects null / non-integer / negative', () => {
    expect(coerceSourceId(null)).toBeNull();
    expect(coerceSourceId('abc')).toBeNull();
    expect(coerceSourceId(-4)).toBeNull();
    expect(coerceSourceId(3.5)).toBeNull();
  });
});

describe('load-zoning.coerceColumn (H1 non-throwing, P-H5 range-reject)', () => {
  it('does NOT throw on dirty non-numeric text — returns null value (H1)', () => {
    expect(() => coerceColumn('SEE NOTE', { src: 'DENSITY', kind: 'num', min: 0 })).not.toThrow();
    expect(coerceColumn('SEE NOTE', { src: 'DENSITY', kind: 'num', min: 0 })).toEqual({ value: null, ok: true });
  });
  it('nulls the cell on the -1 sentinel / out-of-range (not clamp, not row-reject), keeps the row', () => {
    // Toronto encodes "not regulated" as -1; null the cell + keep the row (spike 2026-05-30).
    expect(coerceColumn(-1, { src: 'FSI_TOTAL', kind: 'num', min: 0 })).toEqual({ value: null, ok: true, nulled: true });
    expect(coerceColumn(200, { src: 'COVERAGE', kind: 'num', min: 0, max: 100 })).toEqual({ value: null, ok: true, nulled: true });
  });
  it('truncates TEXT to maxLen', () => {
    expect(coerceColumn('abcdef', { src: 'ZN_ZONE', kind: 'text', maxLen: 3 }).value).toBe('abc');
  });
  it('height_label uses strict parse → null on a range, never fabricates', () => {
    expect(coerceColumn('4-6m', { src: 'HT_LABEL', kind: 'height_label' })).toEqual({ value: null, ok: true });
    expect(parseHeightLabel('4-6m').unparseable).toBe(true);
    expect(parseHeightLabel('20m').value).toBe(20);
  });
});

describe('load-zoning.dedupeRejectAll (R2-17)', () => {
  it('rejects ALL rows sharing a non-unique source_id (deterministic)', () => {
    const { kept, duplicateCount } = dedupeRejectAll([
      { source_id: 1 }, { source_id: 2 }, { source_id: 2 }, { source_id: 3 },
    ]);
    expect(kept.map((r: { source_id: number }) => r.source_id)).toEqual([1, 3]);
    expect(duplicateCount).toBe(2);
  });
});

describe('load-zoning.priorMetricValue (C3 — reads audit_table.rows, not flat keys)', () => {
  const prior = {
    records_meta: {
      zoning_baseline_count: 999, // flat key must be IGNORED
      audit_table: { rows: [{ metric: 'zoning_areas_loaded_count', value: 11719, status: 'INFO' }] },
    },
  };
  it('finds a metric value inside audit_table.rows', () => {
    expect(priorMetricValue(prior, 'zoning_areas_loaded_count')).toBe(11719);
  });
  it('returns null for a missing metric or absent prior', () => {
    expect(priorMetricValue(prior, 'nope')).toBeNull();
    expect(priorMetricValue(null, 'x')).toBeNull();
    expect(priorMetricValue({ records_meta: {} }, 'x')).toBeNull();
  });
});

describe('load-zoning threshold cascades', () => {
  it('orphanStatus: first-deploy (0 denom) → INFO, then relative-% F-H1', () => {
    expect(orphanStatus(50, 0)).toBe('INFO');
    expect(orphanStatus(1, 1000)).toBe('INFO');   // 0.1% ≤ 0.5
    expect(orphanStatus(15, 1000)).toBe('WARN');  // 1.5% ≤ 2
    expect(orphanStatus(30, 1000)).toBe('FAIL');  // 3% > 2
  });
  it('loadedCountStatus: OB-2 zero gate — ==0 FAIL, else INFO (spec §3, no WARN band)', () => {
    expect(loadedCountStatus(0)).toBe('FAIL');
    expect(loadedCountStatus(500)).toBe('INFO');
    expect(loadedCountStatus(11719)).toBe('INFO');
  });
  it('loadedPctStatus: no baseline → INFO + _no_baseline (F-H11)', () => {
    expect(loadedPctStatus(100, null)).toEqual({ pct: null, status: 'INFO', noBaseline: true });
    expect(loadedPctStatus(96, 100).status).toBe('PASS');
    expect(loadedPctStatus(92, 100).status).toBe('WARN');
    expect(loadedPctStatus(80, 100).status).toBe('FAIL');
  });
  it('withExceptionsStatus: WARN if 50% below prior (F-H13)', () => {
    expect(withExceptionsStatus(2000, 5000)).toBe('WARN');
    expect(withExceptionsStatus(4000, 5000)).toBe('INFO');
    expect(withExceptionsStatus(4000, null)).toBe('INFO');
  });
  it('durationStatus: WARN if > 2× prior (F-H14)', () => {
    expect(durationStatus(2500, 1000)).toBe('WARN');
    expect(durationStatus(1500, 1000)).toBe('INFO');
    expect(durationStatus(1500, null)).toBe('INFO');
  });
  it('datasetVersionAgeStatus: 450/730 bands (F-H10)', () => {
    expect(datasetVersionAgeStatus(100)).toBe('INFO');
    expect(datasetVersionAgeStatus(600)).toBe('WARN');
    expect(datasetVersionAgeStatus(900)).toBe('FAIL');
  });
});

describe('load-zoning.topNDistribution (Spec 47 §8.4 / P-M4)', () => {
  it('caps at top-N and reports truncated-class + other counts', () => {
    const vals: string[] = [];
    for (let z = 0; z < 25; z++) for (let k = 0; k <= z; k++) vals.push(`R${z}`); // R24 most frequent
    const d = topNDistribution(vals, 20);
    expect(d.top).toHaveLength(20);
    expect(d.top[0]!.zone).toBe('R24');
    expect(d.truncatedClassCount).toBe(5);
    expect(d.otherCount).toBeGreaterThan(0);
  });
});

describe('load-zoning.verdictCascade (P-C3 — 3-way row-derived)', () => {
  it('FAIL > WARN > PASS', () => {
    expect(verdictCascade([{ status: 'INFO' }, { status: 'WARN' }, { status: 'FAIL' }])).toBe('FAIL');
    expect(verdictCascade([{ status: 'INFO' }, { status: 'WARN' }])).toBe('WARN');
    expect(verdictCascade([{ status: 'INFO' }, { status: 'PASS' }])).toBe('PASS');
  });
});

describe('load-zoning LAYERS — per-layer column mapping (§4)', () => {
  it('registers exactly 10 layers, each with a UUID resourceId, geomKind, non-empty cols', () => {
    expect(LAYERS).toHaveLength(10);
    for (const l of LAYERS) {
      expect(l.resourceId).toMatch(/^[0-9a-f-]{36}$/);
      expect(['polygon', 'linestring']).toContain(l.geomKind);
      expect(l.cols.length).toBeGreaterThan(0);
    }
  });
  it('base maps the spec §2 CKAN source fields to the right target columns', () => {
    const base = LAYERS.find((l) => l.key === 'base')!;
    const map = Object.fromEntries(base.cols.map((c) => [c.src, c.col]));
    expect(map.COVERAGE).toBe('coverage_max_pct');
    expect(map.FSI_TOTAL).toBe('fsi_max');
    expect(map.ZN_ZONE).toBe('zn_zone');
    expect(map.EXCPTN_NO).toBe('exception_number');
    expect(map.ZBL_CHAPT).toBe('bylaw_chapter');
  });
  it('only policy_road + priority_retail are LineString layers', () => {
    const lines = LAYERS.filter((l) => l.geomKind === 'linestring').map((l) => l.key).sort();
    expect(lines).toEqual(['policy_road_overlay', 'priority_retail_overlay']);
  });
});

describe('load-zoning.skipCheckDecision (R2-11 / F-M4)', () => {
  const now = Date.parse('2026-05-30T00:00:00Z');
  it('no prior version → load', () => expect(skipCheckDecision({ lastModified: 'x', storedVersion: null, nowMs: now }).skip).toBe(false));
  it('unchanged → skip', () => {
    const v = '2026-02-20T21:25:57Z';
    expect(skipCheckDecision({ lastModified: v, storedVersion: v, nowMs: now }).skip).toBe(true);
  });
  it('changed → load', () => {
    expect(skipCheckDecision({ lastModified: '2026-05-01T00:00:00Z', storedVersion: '2026-02-20T00:00:00Z', nowMs: now }).skip).toBe(false);
  });
  it('missing validators → force load', () => {
    expect(skipCheckDecision({ lastModified: null, etag: null, storedVersion: 'v', nowMs: now }).reason).toBe('no_validators');
  });
  it('stale cache (> 730d) → force reload', () => {
    const old = '2023-01-01T00:00:00Z';
    expect(skipCheckDecision({ lastModified: old, storedVersion: old, nowMs: now }).reason).toBe('cache_stale_force_reload');
  });
});
