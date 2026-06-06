// SPEC LINK: docs/specs/01-pipeline/62_source_centreline.md §3.4 (L25), §3.9, §4.1
//
// Pure-function tests for load-centreline.js: the L25 feature-type/jurisdiction
// classifier, the F13 shapefile-column guard, drift math, dedup, skip-check, and
// the verdict cascade. load-centreline.js guards its pipeline.run() behind
// `require.main === module`, so require()-ing it here has no side effects.

import { describe, it, expect } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const lc = require('../../scripts/load-centreline.js');

describe('classifyFeature — L25 filter (Spec 62 §3.4)', () => {
  it('keeps a street-class CITY OF TORONTO segment with its raw feature code', () => {
    const r = lc.classifyFeature('Local', 'CITY OF TORONTO');
    expect(r.drop).toBe(false);
    expect(r.featureCodeDesc).toBe('Local');
    expect(r.jurisdiction).toBe('CITY OF TORONTO');
    expect(r.unknownFeature).toBe(false);
    expect(r.unknownJurisdiction).toBe(false);
  });

  it('drops a non-street feature (Trail) as non_street', () => {
    expect(lc.classifyFeature('Trail', 'CITY OF TORONTO')).toEqual({ drop: true, reason: 'non_street' });
  });

  it('drops a FEDERAL-jurisdiction segment as federal (case/space-insensitive)', () => {
    expect(lc.classifyFeature('Local', ' Federal ')).toEqual({ drop: true, reason: 'federal' });
  });

  it('maps an unknown feature code to the sentinel + flags unknownFeature (WARN driver)', () => {
    const r = lc.classifyFeature('Quantum Skyway', 'PRIVATE');
    expect(r.drop).toBe(false);
    expect(r.featureCodeDesc).toBe(lc.UNKNOWN_FEATURE_SENTINEL);
    expect(r.unknownFeature).toBe(true);
  });

  it('F14: trims trailing CKAN whitespace before Set membership (else valid segments drop)', () => {
    const r = lc.classifyFeature('  Major Arterial  ', '  CITY OF TORONTO  ');
    expect(r.drop).toBe(false);
    expect(r.featureCodeDesc).toBe('Major Arterial'); // raw value trimmed, NOT the sentinel
    expect(r.unknownFeature).toBe(false);
  });

  it('treats UNKNOWN / empty jurisdiction as included + flagged (sentinel jurisdiction)', () => {
    const r = lc.classifyFeature('Collector', 'UNKNOWN');
    expect(r.drop).toBe(false);
    expect(r.unknownJurisdiction).toBe(true);
    expect(r.jurisdiction).toBe('UNKNOWN');
    const empty = lc.classifyFeature('Collector', '');
    expect(empty.jurisdiction).toBe('UNKNOWN');
    expect(empty.unknownJurisdiction).toBe(true);
  });
});

describe('validateShapefileColumns — F13 CKAN column-drop guard (#426 lesson)', () => {
  it('passes when every required DBF field is present', () => {
    const props: Record<string, unknown> = {};
    for (const f of lc.REQUIRED_DBF_FIELDS) props[f] = 'x';
    expect(() => lc.validateShapefileColumns(props)).not.toThrow();
  });

  it('throws a clear error naming the missing field when CKAN renames a column', () => {
    const props: Record<string, unknown> = {};
    for (const f of lc.REQUIRED_DBF_FIELDS) props[f] = 'x';
    delete props[lc.DBF.centreline_id];
    expect(() => lc.validateShapefileColumns(props)).toThrow(new RegExp(lc.DBF.centreline_id));
  });

  it('throws when given no properties at all', () => {
    expect(() => lc.validateShapefileColumns(null)).toThrow(/no feature properties/);
  });
});

describe('coerceSourceId / coerceNodeId', () => {
  it('coerces a positive integer CENTRELINE_ID', () => {
    expect(lc.coerceSourceId('7632579')).toBe(7632579);
  });
  it('rejects zero / negative / non-numeric source ids (counted as skip)', () => {
    expect(lc.coerceSourceId('0')).toBeNull();
    expect(lc.coerceSourceId('-4')).toBeNull();
    expect(lc.coerceSourceId('abc')).toBeNull();
    expect(lc.coerceSourceId(null)).toBeNull();
  });
  it('allows NULL intersection node ids (graph topology may be absent)', () => {
    expect(lc.coerceNodeId(null)).toBeNull();
    expect(lc.coerceNodeId('13950000')).toBe(13950000);
  });
});

describe('drift / dedup / skip-check / verdict', () => {
  it('computeCountDeltaPct: first run / zero prior → 0 (no false drift)', () => {
    expect(lc.computeCountDeltaPct(47000, null)).toBe(0);
    expect(lc.computeCountDeltaPct(47000, 0)).toBe(0);
    expect(lc.computeCountDeltaPct(47000, 47000)).toBe(0);
  });
  it('computeCountDeltaPct: a 15% drop is computed', () => {
    expect(lc.computeCountDeltaPct(40000, 47000)).toBeCloseTo(0.149, 2);
  });
  it('dedupeBySourceId keeps the first occurrence + counts duplicates', () => {
    const { kept, duplicateCount } = lc.dedupeBySourceId([
      { source_id: 1, geojson: 'a' }, { source_id: 2, geojson: 'b' }, { source_id: 1, geojson: 'c' },
    ]);
    expect(kept.map((k: { source_id: number }) => k.source_id)).toEqual([1, 2]);
    expect(duplicateCount).toBe(1);
  });
  it('skipCheckDecision: no prior run → never skip', () => {
    expect(lc.skipCheckDecision({ lastModified: 'x', etag: 'y', prior: null }).skip).toBe(false);
  });
  it('skipCheckDecision: matching Last-Modified vs prior → skip', () => {
    const prior = { centreline_load: { last_modified: 'Mon, 25 May 2026 00:00:00 GMT' } };
    expect(lc.skipCheckDecision({ lastModified: 'Mon, 25 May 2026 00:00:00 GMT', prior }).skip).toBe(true);
  });
  it('datasetAgeStatus: > threshold days → WARN (L9 daily-publish)', () => {
    expect(lc.datasetAgeStatus(3, 7)).toBe('INFO');
    expect(lc.datasetAgeStatus(10, 7)).toBe('WARN');
    expect(lc.datasetAgeStatus(null, 7)).toBe('INFO');
  });
  it('verdictCascade is row-derived FAIL > WARN > PASS', () => {
    expect(lc.verdictCascade([{ status: 'INFO' }, { status: 'PASS' }])).toBe('PASS');
    expect(lc.verdictCascade([{ status: 'WARN' }, { status: 'PASS' }])).toBe('WARN');
    expect(lc.verdictCascade([{ status: 'WARN' }, { status: 'FAIL' }])).toBe('FAIL');
  });
});
