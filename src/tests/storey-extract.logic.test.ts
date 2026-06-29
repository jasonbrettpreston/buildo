// SPEC LINK: docs/specs/01-pipeline/65_enrich_parcels.md §8 (permit-pocket storey norms — WF3-C1)
//
// Unit lock for the storey extractor. Patterns mirror src/lib/classification/scope.ts:325-341
// (numericStorey + cardinalStorey + single-storey) — the parity block below pins the shared cases.

import { describe, expect, it } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { extractStoreys, STOREY_CLAMP_MAX, STOREY_NORM_MIN_SAMPLE } = require('../../scripts/lib/storey-extract');

describe('extractStoreys (WF3-C1)', () => {
  it('numeric: "N storey/story/stories", with/without hyphen', () => {
    expect(extractStoreys('Construct a 2 storey detached dwelling')).toBe(2);
    expect(extractStoreys('new 3-storey house')).toBe(3);
    expect(extractStoreys('4 story building')).toBe(4);
    expect(extractStoreys('proposed 2 stories')).toBe(2);
  });

  it('decimal storeys read the INTEGER part — "2.5 storey" → 2 (the "2.5→5" mis-parse fix), NOT clamped', () => {
    expect(extractStoreys('new 2.5 storey detached dwelling')).toBe(2);   // was 5 (grabbed the post-decimal digit)
    expect(extractStoreys('3.5 storey home')).toBe(3);
    expect(extractStoreys('2.5-storey semi')).toBe(2);                    // hyphen variant
    expect(extractStoreys('10.5 storey')).toBe(10);
    // the real-world demolition string that produced the bogus 5s in small pockets
    expect(extractStoreys('DEMOLITION OF EXISTING 2.5 STOREY BRICK RESIDENCE AND CONSTRUCTION OF 3 STOREY')).toBe(2);
  });

  it('REGRESSION-LOCK: a genuine "5 storey" still returns 5 — the fix corrects a mis-read, it does NOT hide high values', () => {
    expect(extractStoreys('new 5 storey building')).toBe(5);
    expect(extractStoreys('5-storey residential')).toBe(5);
    expect(extractStoreys('6 storey')).toBe(6);
  });

  it('cardinal: one..five', () => {
    expect(extractStoreys('a one storey bungalow')).toBe(1);
    expect(extractStoreys('two-storey semi')).toBe(2);
    expect(extractStoreys('THREE STOREY townhouse')).toBe(3);
    expect(extractStoreys('four storey')).toBe(4);
    expect(extractStoreys('five storey')).toBe(5);
  });

  it('single storey → 1 (the scope.ts:339 branch — parity)', () => {
    expect(extractStoreys('single storey addition')).toBe(1);
    expect(extractStoreys('single-story garage')).toBe(1);
  });

  it('no storey text → null', () => {
    expect(extractStoreys('interior alterations and plumbing')).toBeNull();
    expect(extractStoreys('')).toBeNull();
    expect(extractStoreys(null)).toBeNull();
    expect(extractStoreys(undefined)).toBeNull();
  });

  it('out-of-band → null (clamp at 15; >15 is unit-count / address noise)', () => {
    expect(extractStoreys('20 storey tower')).toBeNull();
    expect(extractStoreys('120 storey')).toBeNull(); // address-number noise
    expect(extractStoreys('0 storey')).toBeNull();
    // genuine mid-rise within the band is kept
    expect(extractStoreys('12 storey residential building')).toBe(12);
    expect(extractStoreys('15 storey')).toBe(15);
  });

  it('numeric wins over cardinal when both present; first match used', () => {
    expect(extractStoreys('3 storey over a two storey base')).toBe(3);
  });

  it('constants exported with expected defaults', () => {
    expect(STOREY_CLAMP_MAX).toBe(15);
    expect(STOREY_NORM_MIN_SAMPLE).toBe(10);
  });
});
