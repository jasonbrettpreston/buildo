// SPEC LINK: docs/specs/01-pipeline/59_source_ravine_protection.md §4.1
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1, §5.5 (pilot 2 conversion)
//
// Pure-function unit tests for load_ravines (Spec 59 §8c). No DB / FS / network.
// Locks the drift math (L7/L7b/L7c), the F-C1 delete guard (L15), the §3.5 status
// → counter classifier (incl. collection_extracted), the L9 skip-check, OBJECTID
// coercion, and dataset-age staleness.
//
// ⚠️ RE-HOMED AT THE PILOT-2 CONVERSION (Spec 122 §5.1). The step file is now the
// frozen three-line shape and exports no domain functions, so every subject below
// moved WITH ITS BEHAVIOUR INTACT rather than being deleted:
//   · the nine pure helpers      → scripts/lib/compute/load-ravines.js
//   · skipCheckDecision (L9)     → scripts/lib/step/staleness.js (LG-3), where the
//                                  library evaluates the pre-acquisition trigger
//   · verdictCascade             → KNOWINGLY RETIRED to scripts/lib/step/verdict.js
//                                  `deriveVerdict`; the cascade is asserted there,
//                                  in one place, instead of once per step
// The assertions are unchanged; only the import target moved.

import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ravines = require('../../scripts/lib/compute/load-ravines.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const staleness = require('../../scripts/lib/step/staleness.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const verdict = require('../../scripts/lib/step/verdict.js');

describe('computeCountDeltaPct (L7)', () => {
  it('returns 0 on first run (null prior) — DeepSeek null-guard', () => {
    expect(ravines.computeCountDeltaPct(854, null)).toBe(0);
  });
  it('returns 0 when prior is undefined/0 (missing older-format field)', () => {
    expect(ravines.computeCountDeltaPct(854, undefined)).toBe(0);
    expect(ravines.computeCountDeltaPct(854, 0)).toBe(0);
  });
  it('computes the absolute delta ratio otherwise', () => {
    expect(ravines.computeCountDeltaPct(100, 800)).toBeCloseTo(0.875); // 87.5% drop
    expect(ravines.computeCountDeltaPct(854, 854)).toBe(0);
  });
});

describe('computeGeometryUpdatePct (L7b) / computeMassDeletePct (L7c)', () => {
  it('return 0 on first run / missing prior', () => {
    expect(ravines.computeGeometryUpdatePct(500, null)).toBe(0);
    expect(ravines.computeMassDeletePct(500, null)).toBe(0);
  });
  it('compute the ratio against prior', () => {
    expect(ravines.computeGeometryUpdatePct(500, 854)).toBeCloseTo(0.585);
    expect(ravines.computeMassDeletePct(600, 854)).toBeCloseTo(0.702);
  });
});

describe('shouldSkipDelete (F-C1 / L15)', () => {
  it('true for empty / non-array', () => {
    expect(ravines.shouldSkipDelete([])).toBe(true);
    expect(ravines.shouldSkipDelete(null)).toBe(true);
    expect(ravines.shouldSkipDelete(undefined)).toBe(true);
  });
  it('false for a non-empty id set', () => {
    expect(ravines.shouldSkipDelete([1, 2, 3])).toBe(false);
  });
});

describe('validatorCounterDelta (§3.5 status → counters)', () => {
  it('accepted + already-valid → no repaired, carried', () => {
    expect(ravines.validatorCounterDelta('accepted', true)).toEqual({ repaired: 0, collectionExtracted: 0, skipped: 0, carry: true });
  });
  it('accepted + was-invalid → repaired, carried', () => {
    expect(ravines.validatorCounterDelta('accepted', false)).toEqual({ repaired: 1, collectionExtracted: 0, skipped: 0, carry: true });
  });
  it('collection_extracted → both repaired AND collectionExtracted, carried', () => {
    expect(ravines.validatorCounterDelta('collection_extracted', false)).toEqual({ repaired: 1, collectionExtracted: 1, skipped: 0, carry: true });
  });
  it('skipped_null / skipped_unsupported_type → skipped, NOT carried', () => {
    expect(ravines.validatorCounterDelta('skipped_null', false)).toEqual({ repaired: 0, collectionExtracted: 0, skipped: 1, carry: false });
    expect(ravines.validatorCounterDelta('skipped_unsupported_type', true)).toEqual({ repaired: 0, collectionExtracted: 0, skipped: 1, carry: false });
  });
});

describe('dedupeBySourceId (DeepSeek MED — ON CONFLICT twice guard)', () => {
  it('keeps the first occurrence and counts duplicates', () => {
    const { kept, duplicateCount } = ravines.dedupeBySourceId([
      { source_id: 1, geojson: 'a' },
      { source_id: 2, geojson: 'b' },
      { source_id: 1, geojson: 'c' },
    ]);
    expect(kept).toHaveLength(2);
    expect(kept.map((f: { source_id: number }) => f.source_id)).toEqual([1, 2]);
    expect(duplicateCount).toBe(1);
  });
});

describe('coerceSourceId (OBJECTID → positive int)', () => {
  it('accepts positive integers', () => {
    expect(ravines.coerceSourceId(42)).toBe(42);
    expect(ravines.coerceSourceId('42')).toBe(42);
  });
  it('rejects null / zero / negative / non-integer', () => {
    expect(ravines.coerceSourceId(null)).toBeNull();
    expect(ravines.coerceSourceId(0)).toBeNull();
    expect(ravines.coerceSourceId(-5)).toBeNull();
    expect(ravines.coerceSourceId('abc')).toBeNull();
  });
});

// RE-HOMED: the step's private L9 wrapper is now the library's pre-acquisition gate.
// `prior` is the prior run's EMIT BLOCK (records_meta.ravine_load), not the whole
// records_meta — the library unwraps `emits[0].key` before it gets here, so the block
// is what the gate compares and what a test has to hand it.
describe('staleness.skipCheckDecision (L9, re-homed from load-ravines.js)', () => {
  const prior = { last_modified: 'Mon, 14 Mar 2022 15:25:09 GMT', etag: '"abc"', content_hash: 'h1' };
  it('proceeds on first run (no prior)', () => {
    expect(staleness.skipCheckDecision({ lastModified: 'x', prior: null }).skip).toBe(false);
  });
  it('proceeds when no validators present (CDN-stripped headers)', () => {
    expect(staleness.skipCheckDecision({ lastModified: null, etag: null, prior }).skip).toBe(false);
  });
  it('skips when Last-Modified matches prior', () => {
    const d = staleness.skipCheckDecision({ lastModified: 'Mon, 14 Mar 2022 15:25:09 GMT', prior });
    expect(d.skip).toBe(true);
    expect(d.reason).toBe('unchanged_last_modified');
  });
  it('skips on ETag fallback when Last-Modified differs/absent', () => {
    const d = staleness.skipCheckDecision({ lastModified: null, etag: '"abc"', prior });
    expect(d.skip).toBe(true);
    expect(d.reason).toBe('unchanged_etag');
  });
  it('proceeds when validators differ from prior', () => {
    expect(staleness.skipCheckDecision({ lastModified: 'Tue, 01 Jan 2030 00:00:00 GMT', etag: '"zzz"', prior }).skip).toBe(false);
  });
});

// A-3 / LG-10 — the force override the pre-conversion step did not have at all.
describe('staleness force_run (A-3, RAVINE_FORCE_RELOAD)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const descriptor = require('../../scripts/load-ravines.descriptor.json');
  it('reads the DECLARED env var name, and only the exact value "1"', () => {
    expect(staleness.forceRunEnv(descriptor)).toBe('RAVINE_FORCE_RELOAD');
    expect(staleness.forceRunRequested(descriptor, {})).toBe(false);
    expect(staleness.forceRunRequested(descriptor, { RAVINE_FORCE_RELOAD: 'true' })).toBe(false);
    expect(staleness.forceRunRequested(descriptor, { RAVINE_FORCE_RELOAD: '1' })).toBe(true);
  });
  it('bypasses the pre-acquisition trigger even when the validators match the prior run', () => {
    const prior = { last_modified: 'Mon, 14 Mar 2022 15:25:09 GMT' };
    const validators = { lastModified: 'Mon, 14 Mar 2022 15:25:09 GMT', etag: null };
    expect(staleness.preAcquisitionDecision({ descriptor, validators, prior, forced: false }).skip).toBe(true);
    const forced = staleness.preAcquisitionDecision({ descriptor, validators, prior, forced: true });
    expect(forced.skip).toBe(false);
    expect(forced.reason).toBe('force_run');
  });
  it('projects override.accept_anomaly[] to the ctx.overrides keys the compute reads', () => {
    const off = staleness.resolveOverrides(descriptor, {});
    expect(off).toEqual({ accept_feature_count_drift: false, accept_mass_delete: false, force_run: false });
    const on = staleness.resolveOverrides(descriptor, { RAVINE_ACCEPT_MASS_DELETE: '1' });
    expect(on.accept_mass_delete).toBe(true);
    expect(on.accept_feature_count_drift).toBe(false);
  });
});

describe('datasetAgeStatus (L9 staleness) / ageDaysFrom', () => {
  it('WARN past the year threshold, INFO within', () => {
    expect(ravines.datasetAgeStatus(365 * 21, 20)).toBe('WARN');
    expect(ravines.datasetAgeStatus(365 * 4, 20)).toBe('INFO');
    expect(ravines.datasetAgeStatus(null, 20)).toBe('INFO');
  });
  it('ageDaysFrom returns null on unparseable dates (no NaN→spurious WARN)', () => {
    expect(ravines.ageDaysFrom(Date.now(), 'not-a-date')).toBeNull();
    expect(ravines.ageDaysFrom(Date.now(), null)).toBeNull();
  });
});

// RE-HOMED + KNOWINGLY RETIRED: the step's own three-way cascade is gone; the same
// behaviour is `verdict.deriveVerdict`, which the library computes ONCE from the
// rows. The assertion is kept here as well as in the library suite because it is the
// behaviour this step used to own, and dropping it would look like the cascade left.
describe('deriveVerdict (Spec 47 §8.2, row-derived — retired here from verdictCascade)', () => {
  it('FAIL dominates WARN dominates PASS', () => {
    expect(verdict.deriveVerdict([{ status: 'INFO' }, { status: 'WARN' }, { status: 'FAIL' }])).toBe('FAIL');
    expect(verdict.deriveVerdict([{ status: 'INFO' }, { status: 'WARN' }])).toBe('WARN');
    expect(verdict.deriveVerdict([{ status: 'INFO' }, { status: 'PASS' }])).toBe('PASS');
  });
  it('the step no longer carries a cascade of its own', () => {
    expect('verdictCascade' in ravines).toBe(false);
  });
});
