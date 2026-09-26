// SPEC LINK: docs/specs/01-pipeline/62_source_centreline.md §3.4 (L25), §3.9, §4.1
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1, §5.5 (batch-2 row 3.2 conversion)
//
// Pure-function tests for load_centreline (Spec 62 §8c): the L25 feature-type/
// jurisdiction classifier, the F13 shapefile-column guard, drift math, dedup,
// coercion, dataset-age staleness, and the verdict cascade.
//
// ⚠️ RE-HOMED AT THE ROW 3.2 ② CONVERSION (Spec 122 §5.1, load-ravines precedent).
// The step file is now the frozen three-line shape and exports no domain functions,
// so every subject below moved WITH ITS BEHAVIOUR INTACT rather than being deleted:
//   · classifyFeature, validateShapefileColumns, coerceSourceId/coerceNodeId,
//     computeCountDeltaPct, dedupeBySourceId, datasetAgeStatus  → scripts/lib/compute/load-centreline.js
//   · skipCheckDecision (tier-1 pre-acquisition gate)           → scripts/lib/step/staleness.js
//   · verdictCascade                                            → KNOWINGLY RETIRED to
//     scripts/lib/step/verdict.js `deriveVerdict`; the cascade is asserted there, in
//     one place, instead of once per step.
// The assertions are unchanged; only the import target moved.

import { describe, it, expect } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const lc = require('../../scripts/lib/compute/load-centreline.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const staleness = require('../../scripts/lib/step/staleness.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const verdict = require('../../scripts/lib/step/verdict.js');

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

  it('ORDER IS LOAD-BEARING: EXCLUDE runs before the federal test (a Trail/FEDERAL record drops as non_street, never federal)', () => {
    expect(lc.classifyFeature('Trail', 'Federal')).toEqual({ drop: true, reason: 'non_street' });
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

describe('drift / dedup / dataset-age (scripts/lib/compute/load-centreline.js)', () => {
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
  it('datasetAgeStatus: > threshold years → WARN (L9 daily-publish)', () => {
    expect(lc.datasetAgeStatus(3, 7)).toBe('INFO');
    expect(lc.datasetAgeStatus(10, 7)).toBe('WARN');
    expect(lc.datasetAgeStatus(null, 7)).toBe('INFO');
  });
  it('ageDaysFrom returns null on unparseable dates (no NaN → spurious WARN)', () => {
    expect(lc.ageDaysFrom(Date.now(), 'not-a-date')).toBeNull();
    expect(lc.ageDaysFrom(Date.now(), null)).toBeNull();
  });
});

// RE-HOMED: the step's private tier-1 wrapper is now the library's pre-acquisition
// gate. `prior` is the prior run's EMIT BLOCK (records_meta.centreline_load), not
// the whole records_meta — the library unwraps `emits[0].key` before it gets here.
describe('staleness.skipCheckDecision (tier-1, re-homed from load-centreline.js)', () => {
  const prior = { last_modified: 'Mon, 25 May 2026 00:00:00 GMT', etag: '"abc"', content_hash: 'h1' };
  it('proceeds on first run (no prior)', () => {
    expect(staleness.skipCheckDecision({ lastModified: 'x', etag: 'y', prior: null }).skip).toBe(false);
  });
  it('proceeds when no validators present (CDN-stripped headers)', () => {
    expect(staleness.skipCheckDecision({ lastModified: null, etag: null, prior }).skip).toBe(false);
  });
  it('skips when Last-Modified matches prior', () => {
    const d = staleness.skipCheckDecision({ lastModified: 'Mon, 25 May 2026 00:00:00 GMT', prior });
    expect(d.skip).toBe(true);
    expect(d.reason).toBe('unchanged_last_modified');
  });
  it('proceeds when validators differ from prior', () => {
    expect(staleness.skipCheckDecision({ lastModified: 'Tue, 01 Jan 2030 00:00:00 GMT', etag: '"zzz"', prior }).skip).toBe(false);
  });
});

// A-3-style — the force override the pre-conversion step did not have at all
// (LC-D6, the CENTRELINE_LOCAL_ZIP retirement's replacement hatch).
describe('staleness force_run (CENTRELINE_FORCE_RELOAD, declared deviation LC-D6)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const descriptor = require('../../scripts/load-centreline.descriptor.json');
  it('reads the DECLARED env var name, and only the exact value "1"', () => {
    expect(staleness.forceRunEnv(descriptor)).toBe('CENTRELINE_FORCE_RELOAD');
    expect(staleness.forceRunRequested(descriptor, {})).toBe(false);
    expect(staleness.forceRunRequested(descriptor, { CENTRELINE_FORCE_RELOAD: 'true' })).toBe(false);
    expect(staleness.forceRunRequested(descriptor, { CENTRELINE_FORCE_RELOAD: '1' })).toBe(true);
  });
  it('bypasses the pre-acquisition trigger even when the validators match the prior run', () => {
    const prior = { last_modified: 'Mon, 25 May 2026 00:00:00 GMT' };
    const validators = { lastModified: 'Mon, 25 May 2026 00:00:00 GMT', etag: null };
    expect(staleness.preAcquisitionDecision({ descriptor, validators, prior, forced: false }).skip).toBe(true);
    const forced = staleness.preAcquisitionDecision({ descriptor, validators, prior, forced: true });
    expect(forced.skip).toBe(false);
    expect(forced.reason).toBe('force_run');
  });
});

// RE-HOMED + KNOWINGLY RETIRED: the step's own three-way cascade is gone; the same
// behaviour is `verdict.deriveVerdict`, which the library computes ONCE from the
// rows. The assertion is kept here as well as in the library suite because it is
// the behaviour this step used to own, and dropping it would look like the cascade
// left.
describe('deriveVerdict (Spec 47 §8.2, row-derived — retired here from verdictCascade)', () => {
  it('FAIL dominates WARN dominates PASS', () => {
    expect(verdict.deriveVerdict([{ status: 'INFO' }, { status: 'WARN' }, { status: 'FAIL' }])).toBe('FAIL');
    expect(verdict.deriveVerdict([{ status: 'INFO' }, { status: 'WARN' }])).toBe('WARN');
    expect(verdict.deriveVerdict([{ status: 'INFO' }, { status: 'PASS' }])).toBe('PASS');
  });
  it('the step no longer carries a cascade of its own', () => {
    expect('verdictCascade' in lc).toBe(false);
  });
});

describe('validatorCounterDelta (§3.5 status → counters, LC-D8 four-key shape)', () => {
  it('accepted + already-valid → no repaired, carried', () => {
    expect(lc.validatorCounterDelta('accepted', true)).toEqual({ repaired: 0, collectionExtracted: 0, skipped: 0, carry: true });
  });
  it('accepted + was-invalid → repaired, carried', () => {
    expect(lc.validatorCounterDelta('accepted', false)).toEqual({ repaired: 1, collectionExtracted: 0, skipped: 0, carry: true });
  });
  it('LC-D8: collection_extracted is counted AND still not carried — a Multi cannot bind to a GEOMETRY(LineString) column', () => {
    expect(lc.validatorCounterDelta('collection_extracted', false)).toEqual({ repaired: 0, collectionExtracted: 1, skipped: 1, carry: false });
  });
  it('skipped_null / skipped_unsupported_type → skipped, NOT carried', () => {
    expect(lc.validatorCounterDelta('skipped_null', false)).toEqual({ repaired: 0, collectionExtracted: 0, skipped: 1, carry: false });
    expect(lc.validatorCounterDelta('skipped_unsupported_type', true)).toEqual({ repaired: 0, collectionExtracted: 0, skipped: 1, carry: false });
  });
});
