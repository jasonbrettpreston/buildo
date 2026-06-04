/**
 * SPEC LINK: docs/specs/01-pipeline/61_source_heritage_properties.md (§8c, §3, §12)
 * Pure-helper unit tests for scripts/load-heritage.js (Spec 61 §8c load path).
 */
import { describe, it, expect } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const heritage = require('../../scripts/load-heritage.js');

describe('load-heritage — drift math (L7/L7b/L7c)', () => {
  it('computeCountDeltaPct: first run / null prior → 0 (no drift)', () => {
    expect(heritage.computeCountDeltaPct(8803, null)).toBe(0);
    expect(heritage.computeCountDeltaPct(8803, 0)).toBe(0);
  });
  it('computeCountDeltaPct: |loaded-prior|/prior', () => {
    expect(heritage.computeCountDeltaPct(150, 100)).toBeCloseTo(0.5);
    expect(heritage.computeCountDeltaPct(40, 100)).toBeCloseTo(0.6);
  });
  it('computeGeometryUpdatePct / computeMassDeletePct: null prior → 0', () => {
    expect(heritage.computeGeometryUpdatePct(50, null)).toBe(0);
    expect(heritage.computeMassDeletePct(50, null)).toBe(0);
    expect(heritage.computeMassDeletePct(60, 100)).toBeCloseTo(0.6);
  });
});

describe('load-heritage — L25 filters (case-insensitive, H-v1.1.2)', () => {
  it('classifyRegisterStatus: Part IV / Part V mapped, Listed dropped, unknown flagged', () => {
    expect(heritage.classifyRegisterStatus('Part IV')).toEqual({ status: 'part_iv' });
    expect(heritage.classifyRegisterStatus('part iv')).toEqual({ status: 'part_iv' });
    expect(heritage.classifyRegisterStatus('Part V')).toEqual({ status: 'part_v_member' });
    expect(heritage.classifyRegisterStatus('Listed')).toEqual({ drop: 'filtered_listed' });
    expect(heritage.classifyRegisterStatus('Heritage Easement')).toEqual({ drop: 'unknown_status' });
    expect(heritage.classifyRegisterStatus(null)).toEqual({ drop: 'unknown_status' });
  });
  it('classifyHcdType: Designated kept, Under Appeal/Study dropped, unknown flagged', () => {
    expect(heritage.classifyHcdType('Designated District')).toEqual({ hcdType: 'designated_district' });
    expect(heritage.classifyHcdType('designated district')).toEqual({ hcdType: 'designated_district' });
    expect(heritage.classifyHcdType('Under Appeal')).toEqual({ drop: 'filtered_appeal_study' });
    expect(heritage.classifyHcdType('Under Study')).toEqual({ drop: 'filtered_appeal_study' });
    expect(heritage.classifyHcdType('Proposed')).toEqual({ drop: 'unknown_hcd_type' });
  });
});

describe('load-heritage — date + address coercion (L2 / DEC-M)', () => {
  it('normalizeDesignatedDate: Date → YYYY-MM-DD; sentinel 1899-11-30 → null', () => {
    expect(heritage.normalizeDesignatedDate(new Date('2002-02-15T05:00:00.000Z'))).toBe('2002-02-15');
    expect(heritage.normalizeDesignatedDate(new Date('1899-11-30T05:00:00.000Z'))).toBeNull();
    expect(heritage.normalizeDesignatedDate('1997-12-08')).toBe('1997-12-08');
    expect(heritage.normalizeDesignatedDate('1899-11-30')).toBeNull();
    expect(heritage.normalizeDesignatedDate(null)).toBeNull();
    expect(heritage.normalizeDesignatedDate('')).toBeNull();
    expect(heritage.normalizeDesignatedDate('not-a-date')).toBeNull();
  });
  it('coerceAddress: null/empty → "" + coerced flag; real address passes through', () => {
    expect(heritage.coerceAddress(null)).toEqual({ value: '', coerced: true });
    expect(heritage.coerceAddress('   ')).toEqual({ value: '', coerced: true });
    expect(heritage.coerceAddress('123 Main St')).toEqual({ value: '123 Main St', coerced: false });
  });
});

describe('load-heritage — source_id coercion + dedupe', () => {
  it('coerceSourceId: positive int else null', () => {
    expect(heritage.coerceSourceId(42)).toBe(42);
    expect(heritage.coerceSourceId('42')).toBe(42);
    expect(heritage.coerceSourceId(0)).toBeNull();
    expect(heritage.coerceSourceId(-1)).toBeNull();
    expect(heritage.coerceSourceId(null)).toBeNull();
    expect(heritage.coerceSourceId('abc')).toBeNull();
  });
  it('dedupeBySourceId: keeps first, counts duplicates', () => {
    const { kept, duplicateCount } = heritage.dedupeBySourceId([
      { source_id: 1, v: 'a' }, { source_id: 2, v: 'b' }, { source_id: 1, v: 'c' },
    ]);
    expect(kept).toHaveLength(2);
    expect(duplicateCount).toBe(1);
    expect(kept[0].v).toBe('a');
  });
});

describe('load-heritage — validation classifier + verdict cascade', () => {
  it('validatorCounterDelta: accepted carries, collection_extracted repairs, skipped drops', () => {
    expect(heritage.validatorCounterDelta('accepted', true)).toEqual({ repaired: 0, collectionExtracted: 0, skipped: 0, carry: true });
    expect(heritage.validatorCounterDelta('accepted', false)).toEqual({ repaired: 1, collectionExtracted: 0, skipped: 0, carry: true });
    expect(heritage.validatorCounterDelta('collection_extracted', false)).toEqual({ repaired: 1, collectionExtracted: 1, skipped: 0, carry: true });
    expect(heritage.validatorCounterDelta('skipped_null', true)).toEqual({ repaired: 0, collectionExtracted: 0, skipped: 1, carry: false });
  });
  it('verdictCascade: row-derived FAIL > WARN > PASS (never parallel boolean)', () => {
    expect(heritage.verdictCascade([{ status: 'INFO' }, { status: 'PASS' }])).toBe('PASS');
    expect(heritage.verdictCascade([{ status: 'INFO' }, { status: 'WARN' }])).toBe('WARN');
    expect(heritage.verdictCascade([{ status: 'WARN' }, { status: 'FAIL' }])).toBe('FAIL');
    expect(heritage.verdictCascade([{ status: 'INFO' }])).toBe('PASS'); // INFO is cascade-neutral
  });
});

describe('load-heritage — per-dataset skip-check (DEC-K)', () => {
  it('no prior sub-block → cannot skip (first-run guard)', () => {
    expect(heritage.skipCheckDecision({ lastModified: 'x', priorSub: null })).toEqual({ skip: false, reason: 'no_prior_run' });
  });
  it('no validators → proceed', () => {
    expect(heritage.skipCheckDecision({ lastModified: null, etag: null, priorSub: { last_modified: 'x' } }))
      .toEqual({ skip: false, reason: 'no_validators' });
  });
  it('matching last_modified → skip; changed → proceed', () => {
    const priorSub = { last_modified: 'Thu, 21 May 2026 19:34:35 GMT', etag: '"abc"', content_hash: 'h1' };
    expect(heritage.skipCheckDecision({ lastModified: 'Thu, 21 May 2026 19:34:35 GMT', priorSub }).skip).toBe(true);
    expect(heritage.skipCheckDecision({ lastModified: 'Fri, 22 May 2026 00:00:00 GMT', priorSub }).skip).toBe(false);
  });
  it('etag fallback when last_modified absent', () => {
    const priorSub = { last_modified: null, etag: '"abc"', content_hash: null };
    expect(heritage.skipCheckDecision({ etag: '"abc"', priorSub }).skip).toBe(true);
  });
});

describe('load-heritage — dataset age (L9)', () => {
  it('ageDaysFrom: parseable → days; null when unparseable', () => {
    const now = Date.parse('2026-06-04T00:00:00Z');
    expect(heritage.ageDaysFrom(now, '2026-06-03T00:00:00Z')).toBe(1);
    expect(heritage.ageDaysFrom(now, null)).toBeNull();
    expect(heritage.ageDaysFrom(now, 'garbage')).toBeNull();
  });
  it('datasetAgeStatus: WARN past threshold years (default 2)', () => {
    expect(heritage.datasetAgeStatus(null, 2)).toBe('INFO');
    expect(heritage.datasetAgeStatus(100, 2)).toBe('INFO');
    expect(heritage.datasetAgeStatus(3 * 365, 2)).toBe('WARN');
  });
});
