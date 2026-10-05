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
// Loader pure helpers — RE-POINTED at batch-2 row 3.3 ② from scripts/load-zoning.js (now the frozen
// pipeline.step() shell) to scripts/lib/compute/load-zoning.js + the descriptor checks + verdict.js.
// ─────────────────────────────────────────────────────────────────────────
import {
  LAYERS,
  coerceSourceId,
  coerceColumn,
  parseHeightLabel,
  dedupeRejectAll,
  priorMetricValue,
  topNDistribution,
  checks as COMPUTE_CHECKS,
} from '../../scripts/lib/compute/load-zoning';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { checkRow, deriveVerdict } = require('../../scripts/lib/step/verdict.js') as {
  checkRow: (check: unknown, observation: unknown, onCheckError: string, config: unknown) => { status: string };
  deriveVerdict: (rows: Array<{ status: string }>) => string;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sv = require('../../scripts/lib/source-version.js') as {
  skipCheckDecision: (args: Record<string, unknown>, opts: unknown) => { skip?: boolean; reason?: string };
  STYLE_CKAN_METADATA: string;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ZD = require('../../scripts/load-zoning.descriptor.json') as {
  checks: Array<{ id: string }>;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const SEEDS = require('../../scripts/seeds/logic_variables.json') as Record<string, { default: unknown }>;

/** The seed defaults for this step's own tunables — checkRow's config. */
const CFG = Object.fromEntries(
  Object.entries(SEEDS)
    .filter(([k]) => k.startsWith('load_zoning_'))
    .map(([k, v]) => [k, v.default]),
);
/** The declared check, read from the descriptor by id (one source of truth for the bands). */
const declared = (id: string) => ZD.checks.find((c: { id: string }) => c.id === id);
/** The row a declared check renders for an observation — the shared two-tier cascade. */
const statusOf = (id: string, obs: Record<string, unknown>) => checkRow(declared(id), obs, 'fail_step', CFG).status;

describe('load-zoning compute.coerceSourceId (F-M7, M4)', () => {
  it('accepts positive integers', () => expect(coerceSourceId(11719)).toBe(11719));
  it('rejects 0 (degenerate upsert key — M4)', () => expect(coerceSourceId(0)).toBeNull());
  it('rejects null / non-integer / negative', () => {
    expect(coerceSourceId(null)).toBeNull();
    expect(coerceSourceId('abc')).toBeNull();
    expect(coerceSourceId(-4)).toBeNull();
    expect(coerceSourceId(3.5)).toBeNull();
  });
});

describe('load-zoning compute.coerceColumn (H1 non-throwing, P-H5 range-reject)', () => {
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

describe('load-zoning compute.dedupeRejectAll (R2-17)', () => {
  it('rejects ALL rows sharing a non-unique source_id (deterministic)', () => {
    const { kept, duplicateCount } = dedupeRejectAll([
      { source_id: 1 }, { source_id: 2 }, { source_id: 2 }, { source_id: 3 },
    ]);
    expect(kept.map((r: { source_id: number }) => r.source_id)).toEqual([1, 3]);
    expect(duplicateCount).toBe(2);
  });
});

describe('load-zoning compute.priorMetricValue (C3 — reads audit_table.rows, not flat keys)', () => {
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

describe('load-zoning threshold cascades — the declared checks via verdict.checkRow', () => {
  it('orphans (zoning_areas_orphans_removed_count): first-deploy (0 denom) → INFO, then relative-% F-H1 → PASS/WARN/FAIL', () => {
    expect(statusOf('zoning_areas_orphans_removed_count', { value: 0, detail: 50, inert: true })).toBe('INFO');
    expect(statusOf('zoning_areas_orphans_removed_count', { value: 0.1, detail: 1 })).toBe('PASS');
    expect(statusOf('zoning_areas_orphans_removed_count', { value: 1.5, detail: 15 })).toBe('WARN');
    expect(statusOf('zoning_areas_orphans_removed_count', { value: 3, detail: 30 })).toBe('FAIL');
    // The compute observer derives the same 1.5% for 15 departed of a 1,000-row pre-delete count.
    let got: Record<string, unknown> = {};
    const ctx = {
      checks: [],
      acquired: { primaries: { base: { outcome: 'loaded' } } },
      written: {
        by_target: {
          zoning_bylaw_areas: { inserted: 0, updated: 985, unchanged: 0, deleted: 15, rows_scanned: 985 },
        },
      },
      report: (_id: string, o: Record<string, unknown>) => {
        got = o;
      },
    };
    (COMPUTE_CHECKS as unknown as Record<string, (c: unknown) => void>).zoning_areas_orphans_removed_count!(ctx);
    expect(got.value).toBe(1.5);
    expect(got.detail).toBe(15);
    expect(statusOf('zoning_areas_orphans_removed_count', got)).toBe('WARN');
  });
  it('loaded count (zoning_areas_loaded_count): OB-2 zero gate — viol != 0 FAIL, else PASS (no WARN band)', () => {
    expect(statusOf('zoning_areas_loaded_count', { violations: 1, detail: 0 })).toBe('FAIL');
    expect(statusOf('zoning_areas_loaded_count', { violations: 0, detail: 500 })).toBe('PASS');
    expect(statusOf('zoning_areas_loaded_count', { violations: 0, detail: 11719 })).toBe('PASS');
  });
  it('loaded pct (zoning_areas_loaded_pct): no baseline → INFO, then PASS/WARN/FAIL (F-H11)', () => {
    expect(statusOf('zoning_areas_loaded_pct', { value: 0, detail: null, inert: true })).toBe('INFO');
    expect(statusOf('zoning_areas_loaded_pct', { value: 96 })).toBe('PASS');
    expect(statusOf('zoning_areas_loaded_pct', { value: 92 })).toBe('WARN');
    expect(statusOf('zoning_areas_loaded_pct', { value: 80 })).toBe('FAIL');
  });
  it('with exceptions (zoning_areas_with_exceptions_count): WARN if 50% below prior (F-H13)', () => {
    expect(statusOf('zoning_areas_with_exceptions_count', { value: 40, detail: 2000 })).toBe('WARN');
    expect(statusOf('zoning_areas_with_exceptions_count', { value: 80, detail: 4000 })).toBe('PASS');
    expect(statusOf('zoning_areas_with_exceptions_count', { value: 0, detail: 4000, inert: true })).toBe('INFO');
  });
  it('duration (zoning_duration_ms): WARN if > 2× prior (F-H14)', () => {
    expect(statusOf('zoning_duration_ms', { value: 2.5, detail: 2500 })).toBe('WARN');
    expect(statusOf('zoning_duration_ms', { value: 1.5, detail: 1500 })).toBe('PASS');
    expect(statusOf('zoning_duration_ms', { value: 0, detail: 1500, inert: true })).toBe('INFO');
  });
  it('age (dataset_version_age_days): 450/730 bands (F-H10) → PASS/WARN/FAIL', () => {
    expect(statusOf('dataset_version_age_days', { value: 100 })).toBe('PASS');
    expect(statusOf('dataset_version_age_days', { value: 600 })).toBe('WARN');
    expect(statusOf('dataset_version_age_days', { value: 900 })).toBe('FAIL');
  });
});

describe('load-zoning compute.topNDistribution (Spec 47 §8.4 / P-M4)', () => {
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

describe('load-zoning compute.verdictCascade (P-C3 — 3-way row-derived)', () => {
  it('FAIL > WARN > PASS', () => {
    expect(deriveVerdict([{ status: 'INFO' }, { status: 'WARN' }, { status: 'FAIL' }])).toBe('FAIL');
    expect(deriveVerdict([{ status: 'INFO' }, { status: 'WARN' }])).toBe('WARN');
    expect(deriveVerdict([{ status: 'INFO' }, { status: 'PASS' }])).toBe('PASS');
  });
});

describe('load-zoning compute LAYERS — per-layer column mapping (§4)', () => {
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
    const map = Object.fromEntries(base.cols.map((c: { src: string; col: string }) => [c.src, c.col]));
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
  const skip = (a: Record<string, unknown>) =>
    sv.skipCheckDecision(a, {
      style: sv.STYLE_CKAN_METADATA,
      forceReloadMaxAgeDays: CFG.load_zoning_force_reload_max_age_days,
    });
  it('no prior version → load', () => expect(skip({ lastModified: 'x', storedVersion: null, nowMs: now }).skip).toBe(false));
  it('unchanged → skip', () => {
    const v = '2026-02-20T21:25:57Z';
    expect(skip({ lastModified: v, storedVersion: v, nowMs: now }).skip).toBe(true);
  });
  it('changed → load', () => {
    expect(skip({ lastModified: '2026-05-01T00:00:00Z', storedVersion: '2026-02-20T00:00:00Z', nowMs: now }).skip).toBe(false);
  });
  it('missing validators → force load', () => {
    expect(skip({ lastModified: null, etag: null, storedVersion: 'v', nowMs: now }).reason).toBe('no_validators');
  });
  it('stale cache (> 730d) → force reload', () => {
    const old = '2023-01-01T00:00:00Z';
    expect(skip({ lastModified: old, storedVersion: old, nowMs: now }).reason).toBe('cache_stale_force_reload');
  });
});
