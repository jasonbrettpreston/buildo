// 🔗 SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.5 step 5, §6.8 row 667, §6.11 Phase D
//             docs/specs/01-pipeline/84_lifecycle_phase_engine.md §7 (TS↔JS dual-path)
//
// WF1 R5.4 (2026-05-14): Extends R5.1 substrate tests with R8 fold coverage
// (TAG_ALIASES additions, case-insensitivity, non-string element guard) and
// JS↔TS dual-path functional parity.
//
// Original R5.1 R2.v5 fix E (null-phase pass-through) coverage retained.
//

import { describe, it, expect } from 'vitest';
import {
  lookupTradesForTags,
  isTradeActiveInPhase,
  determineCoaPhase,
  shouldAppendRealtor,
  normalizeTag,
  TAG_TRADE_MATRIX,
  TAG_ALIASES,
  PHASE_TRADES,
} from '@/lib/classification/coa-trade-classifier';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const jsLib: any = require('../../scripts/lib/coa-trade-classifier');

describe('coa-trade-classifier — lookupTradesForTags (R5.1 substrate + R5.4 R8 folds)', () => {
  it('returns trade objects for known scope_tags', () => {
    const trades = lookupTradesForTags(['addition', 'deck']);
    expect(Array.isArray(trades)).toBe(true);
    expect(trades.length).toBeGreaterThan(0);
    // Result shape: { slug, confidence }
    for (const t of trades) {
      expect(typeof t.slug).toBe('string');
      expect(typeof t.confidence).toBe('number');
    }
  });

  it('returns empty array for empty, null, undefined, or non-array input', () => {
    expect(lookupTradesForTags([])).toEqual([]);
    expect(lookupTradesForTags(null)).toEqual([]);
    expect(lookupTradesForTags(undefined)).toEqual([]);
    // @ts-expect-error — exercise runtime guard
    expect(lookupTradesForTags('not-an-array')).toEqual([]);
  });

  it('returns deduped, slug-sorted output', () => {
    const out = lookupTradesForTags(['kitchen', 'bathroom', 'basement']);
    const slugs = out.map((r) => r.slug);
    expect(slugs).toEqual([...slugs].sort());
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('takes max confidence when same trade appears across multiple tags', () => {
    // kitchen has plumbing@0.80; bathroom has plumbing@0.85. Max wins.
    const out = lookupTradesForTags(['kitchen', 'bathroom']);
    const plumbing = out.find((r) => r.slug === 'plumbing');
    expect(plumbing?.confidence).toBe(0.85);
  });

  it('variance-only tags (severance, setback, minor-variance) correctly produce zero trades', () => {
    const out = lookupTradesForTags(['severance', 'setback', 'minor-variance', 'lot-coverage']);
    expect(out).toEqual([]);
  });

  it('R8 fold #4 — `dwelling` tag aliases to build-sfd matrix', () => {
    const out = lookupTradesForTags(['dwelling']);
    expect(out.length).toBeGreaterThan(0);
    // build-sfd matrix includes framing@0.85
    const framing = out.find((r) => r.slug === 'framing');
    expect(framing?.confidence).toBe(0.85);
  });

  it('R8 fold #4 — `renovation` tag aliases to interior matrix', () => {
    const out = lookupTradesForTags(['renovation']);
    expect(out.length).toBeGreaterThan(0);
    // interior matrix includes drywall@0.70
    const drywall = out.find((r) => r.slug === 'drywall');
    expect(drywall?.confidence).toBe(0.7);
  });

  it('R8 fold #6 (Gemini CRIT) — normalizeTag is case-insensitive', () => {
    expect(normalizeTag('roofing')).toBe('roof');
    expect(normalizeTag('Roofing')).toBe('roof');
    expect(normalizeTag('ROOFING')).toBe('roof');

    const lower = lookupTradesForTags(['kitchen']);
    const upper = lookupTradesForTags(['KITCHEN']);
    expect(upper).toEqual(lower);

    const dwellingLower = lookupTradesForTags(['dwelling']);
    const dwellingMixed = lookupTradesForTags(['Dwelling']);
    expect(dwellingMixed).toEqual(dwellingLower);
  });

  it('R8 fold #7 (Gemini HIGH) — non-string elements skipped without crash', () => {
    expect(() =>
      lookupTradesForTags([
        'kitchen',
        null,
        undefined,
        42,
        { tag: 'x' },
        'bathroom',
      ] as unknown[]),
    ).not.toThrow();

    const out = lookupTradesForTags([
      'kitchen',
      null,
      undefined,
      42,
      { tag: 'x' },
      'bathroom',
    ] as unknown[]);
    // Should produce the same result as just ['kitchen', 'bathroom']
    expect(out).toEqual(lookupTradesForTags(['kitchen', 'bathroom']));
  });

  it('R8 fold #7 — empty-string elements skipped', () => {
    const out = lookupTradesForTags(['', 'kitchen', '']);
    expect(out).toEqual(lookupTradesForTags(['kitchen']));
  });
});

describe('coa-trade-classifier — isTradeActiveInPhase (R5.1 R2.v5 fix E — null-phase CRITICAL pass-through)', () => {
  it('returns true when phase === null (CoA submission has no construction phase)', () => {
    expect(isTradeActiveInPhase('plumbing', null)).toBe(true);
    expect(isTradeActiveInPhase('any-arbitrary-slug', null)).toBe(true);
  });

  it('returns true when phase === undefined or empty string (defensive)', () => {
    expect(isTradeActiveInPhase('plumbing', undefined)).toBe(true);
    expect(isTradeActiveInPhase('plumbing', '')).toBe(true);
  });

  it('delegates to PHASE_TRADES lookup for known phases', () => {
    expect(isTradeActiveInPhase('framing', 'structural')).toBe(true);
    expect(isTradeActiveInPhase('landscaping', 'structural')).toBe(false);
    expect(isTradeActiveInPhase('pool-installation', 'landscaping')).toBe(true);
  });

  it('returns false for unknown phase string', () => {
    expect(isTradeActiveInPhase('plumbing', 'totally-fake-phase' as never)).toBe(false);
  });
});

describe('coa-trade-classifier — determineCoaPhase (always null at submission time)', () => {
  it('returns null for any input', () => {
    expect(determineCoaPhase({}, '2026-05-14')).toBeNull();
    expect(determineCoaPhase(null, null)).toBeNull();
  });
});

describe('coa-trade-classifier — shouldAppendRealtor (1-axis CoA gate)', () => {
  it('returns true for residential coa_type_class', () => {
    expect(shouldAppendRealtor({ coa_type_class: 'residential' })).toBe(true);
  });

  it('returns false for non-residential classes', () => {
    expect(shouldAppendRealtor({ coa_type_class: 'commercial' })).toBe(false);
    expect(shouldAppendRealtor({ coa_type_class: 'institutional' })).toBe(false);
    expect(shouldAppendRealtor({ coa_type_class: 'mixed' })).toBe(false);
    expect(shouldAppendRealtor({ coa_type_class: null })).toBe(false);
  });

  it('returns false for null/undefined input', () => {
    expect(shouldAppendRealtor(null)).toBe(false);
    expect(shouldAppendRealtor(undefined)).toBe(false);
  });
});

describe('coa-trade-classifier — JS↔TS dual-path functional parity (Spec 84 §7)', () => {
  const FIXTURES: Array<{ name: string; tags: unknown[] }> = [
    { name: 'empty', tags: [] },
    { name: 'kitchen-only', tags: ['kitchen'] },
    { name: 'kitchen+bathroom (max wins)', tags: ['kitchen', 'bathroom'] },
    { name: 'dwelling-alias (R8 fold #4)', tags: ['dwelling'] },
    { name: 'renovation-alias (R8 fold #4)', tags: ['renovation'] },
    { name: 'roofing→roof alias', tags: ['roofing'] },
    { name: 'case-insensitivity (R8 fold #6)', tags: ['KITCHEN', 'Bathroom'] },
    { name: 'unknown-tag-skipped', tags: ['totally-made-up-tag'] },
    { name: 'variance-only-zero-trades', tags: ['severance', 'setback', 'minor-variance'] },
    { name: 'mixed structural', tags: ['build-sfd', 'addition'] },
    { name: 'commercial fitout', tags: ['office', 'tenant-fitout'] },
    { name: 'non-string elements (R8 fold #7)', tags: ['kitchen', null, 42, { x: 1 }, 'bathroom'] },
  ];

  for (const { name, tags } of FIXTURES) {
    it(`parity: ${name}`, () => {
      const ts = lookupTradesForTags(tags as unknown[]);
      const js = jsLib.lookupTradesForTags(tags);
      expect(ts).toEqual(js);
    });
  }

  it('parity: TAG_TRADE_MATRIX key sets match', () => {
    const tsKeys = Object.keys(TAG_TRADE_MATRIX).sort();
    const jsKeys = Object.keys(jsLib.TAG_TRADE_MATRIX).sort();
    expect(tsKeys).toEqual(jsKeys);
  });

  it('parity: TAG_ALIASES key/value pairs match', () => {
    expect({ ...TAG_ALIASES }).toEqual({ ...jsLib.TAG_ALIASES });
  });

  it('parity: PHASE_TRADES key sets match', () => {
    const tsKeys = Object.keys(PHASE_TRADES).sort();
    const jsKeys = Object.keys(jsLib.PHASE_TRADES).sort();
    expect(tsKeys).toEqual(jsKeys);
  });

  it('parity: shouldAppendRealtor', () => {
    expect(shouldAppendRealtor({ coa_type_class: 'residential' })).toBe(
      jsLib.shouldAppendRealtor({ coa_type_class: 'residential' }),
    );
    expect(shouldAppendRealtor({ coa_type_class: 'commercial' })).toBe(
      jsLib.shouldAppendRealtor({ coa_type_class: 'commercial' }),
    );
    expect(shouldAppendRealtor(null)).toBe(jsLib.shouldAppendRealtor(null));
  });

  it('parity: isTradeActiveInPhase', () => {
    expect(isTradeActiveInPhase('plumbing', null)).toBe(jsLib.isTradeActiveInPhase('plumbing', null));
    expect(isTradeActiveInPhase('framing', 'structural')).toBe(
      jsLib.isTradeActiveInPhase('framing', 'structural'),
    );
    expect(isTradeActiveInPhase('landscaping', 'structural')).toBe(
      jsLib.isTradeActiveInPhase('landscaping', 'structural'),
    );
  });
});
