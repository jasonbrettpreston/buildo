// SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.11 Phase D R5.1
//
// scripts/lib/coa-trade-classifier.js — TAG_PATTERNS scope-tag→trade matrix
// twin-extracted from scripts/classify-permits.js's `lookupTradesForTags`.
//
// Per R0.8 audit + R2.v3 pivot: trade_mapping_rules has 0 Tier-3 description
// rules; the production trade classifier is this inline matrix. CoA classifier
// reuses it verbatim, sourced from coa_applications.scope_tags.
//
// R2.v5 fix E (Worktree HIGH 82%): isTradeActiveInPhase(slug, null) MUST
// return true (pass-through) — without an explicit null-phase guard, the
// twin's `PHASE_TRADES[null] === undefined` would gate out ALL trades.

import { describe, it, expect } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { lookupTradesForTags, isTradeActiveInPhase, shouldAppendRealtor } = require('../../scripts/lib/coa-trade-classifier');

describe('coa-trade-classifier — lookupTradesForTags (R5.1)', () => {
  it('returns trade slugs for known scope_tags', () => {
    const trades = lookupTradesForTags(['addition', 'deck']);
    expect(Array.isArray(trades)).toBe(true);
    expect(trades.length).toBeGreaterThan(0);
  });

  it('returns empty array for empty scope_tags', () => {
    expect(lookupTradesForTags([])).toEqual([]);
  });

  it('returns empty array for null scope_tags', () => {
    expect(lookupTradesForTags(null)).toEqual([]);
  });

  it('deduplicates trade slugs when multiple tags map to the same trade', () => {
    const trades = lookupTradesForTags(['addition', 'addition', 'deck']);
    const unique = [...new Set(trades)];
    expect(trades.length).toBe(unique.length);
  });
});

describe('coa-trade-classifier — isTradeActiveInPhase (R2.v5 fix E — CRITICAL null-phase guard)', () => {
  it('returns true when phase === null (pass-through for CoA stage — no construction phase yet)', () => {
    // R2.v5 fix E: the twin returns PHASE_TRADES[phase].includes(slug). With
    // phase=null, PHASE_TRADES[null] is undefined → [].includes(slug) is false
    // → ALL trades gated out. The CoA twin MUST have `if (phase === null)
    // return true` as the first line. Without this guard, classify-coa-trades
    // produces zero lead_trades rows.
    expect(isTradeActiveInPhase('electrician', null)).toBe(true);
    expect(isTradeActiveInPhase('any-arbitrary-slug', null)).toBe(true);
  });

  it('returns true when phase === undefined (defensive — same pass-through)', () => {
    expect(isTradeActiveInPhase('electrician', undefined)).toBe(true);
  });

  it('delegates to PHASE_TRADES lookup for known construction phases', () => {
    // For now we only assert the function does NOT crash for known phase strings.
    // Behavior parity with the permit twin is delegated to the dual-path tests.
    expect(typeof isTradeActiveInPhase('electrician', 'early_construction')).toBe('boolean');
    expect(typeof isTradeActiveInPhase('electrician', 'structural')).toBe('boolean');
    expect(typeof isTradeActiveInPhase('electrician', 'finishing')).toBe('boolean');
    expect(typeof isTradeActiveInPhase('electrician', 'landscaping')).toBe('boolean');
  });
});

describe('coa-trade-classifier — shouldAppendRealtor (R2.v5 fix R — DeepSeek NIT explicit test)', () => {
  it('returns true for residential coa_type_class', () => {
    expect(shouldAppendRealtor({ coa_type_class: 'residential' })).toBe(true);
  });

  it('returns false for commercial coa_type_class', () => {
    expect(shouldAppendRealtor({ coa_type_class: 'commercial' })).toBe(false);
  });

  it('returns false for institutional coa_type_class', () => {
    expect(shouldAppendRealtor({ coa_type_class: 'institutional' })).toBe(false);
  });

  it('returns false for null coa_type_class', () => {
    expect(shouldAppendRealtor({ coa_type_class: null })).toBe(false);
  });

  it('returns false for unclassified', () => {
    expect(shouldAppendRealtor({ coa_type_class: 'unclassified' })).toBe(false);
  });
});
