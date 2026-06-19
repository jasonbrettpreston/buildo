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
  // Spec 80 §5.B.5 Phase 3 — archetype bundle prior (CoA translation layer).
  deriveArchetypesForCoa,
  classifyCoaTrades,
  COA_PROJECT_TYPE_MAP,
  COA_TAG_TO_ARCHETYPE_TAG,
  DEPRECATED_TRADE_SLUGS,
  BUNDLE_TIER_CONFIDENCE_DEFAULT,
} from '@/lib/classification/coa-trade-classifier';
import { ARCHETYPE_BUNDLES } from '@/lib/classification/archetypes';
import { TRADES } from '@/lib/classification/trades';
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

// ──────────────────────────────────────────────────────────────────────────
// Spec 80 §5.B.5 Phase 3 — archetype bundle prior (CoA translation layer)
// ──────────────────────────────────────────────────────────────────────────

describe('coa-trade-classifier — deriveArchetypesForCoa (CoA vocab translation)', () => {
  it('maps CoA PascalCase project_type → archetype (project-type axis only)', () => {
    expect(deriveArchetypesForCoa('NewConstruction', [])).toEqual(['FB']);
    expect(deriveArchetypesForCoa('Addition', [])).toEqual(['ADD']);
    expect(deriveArchetypesForCoa('Alteration', [])).toEqual(['INT']);
  });

  it('Demolition / Severance / Mixed project_type → no project-type archetype', () => {
    expect(deriveArchetypesForCoa('Demolition', [])).toEqual([]);
    expect(deriveArchetypesForCoa('Severance', [])).toEqual([]);
    expect(deriveArchetypesForCoa('Mixed', [])).toEqual([]);
  });

  it('R3: Severance/Mixed still derive archetypes from a forward-construction scope tag', () => {
    // project-type axis suppressed (→null), but the `dwelling` tag is a real signal.
    expect(deriveArchetypesForCoa('Severance', ['dwelling'])).toEqual(['FB']);
  });

  it('maps CoA scope_tags onto valid TAG_ARCHETYPE keys (NOT the trade TAG_ALIASES)', () => {
    expect(deriveArchetypesForCoa(null, ['dwelling'])).toEqual(['FB']);
    expect(deriveArchetypesForCoa(null, ['new-construction'])).toEqual(['FB']);
    expect(deriveArchetypesForCoa(null, ['apartment'])).toEqual(['FB']);
    expect(deriveArchetypesForCoa(null, ['renovation'])).toEqual(['INT']); // R1: NOT 'interior' (a matrix key)
    expect(deriveArchetypesForCoa(null, ['office'])).toEqual(['INT']);
    expect(deriveArchetypesForCoa(null, ['retail'])).toEqual(['INT']);
    expect(deriveArchetypesForCoa(null, ['service-shop'])).toEqual(['INT']);
    expect(deriveArchetypesForCoa(null, ['mixed-use'])).toEqual(['INT']);
    expect(deriveArchetypesForCoa(null, ['secondary-suite'])).toEqual(['FB']);
    expect(deriveArchetypesForCoa(null, ['accessory-structure'])).toEqual(['GAR']);
    expect(deriveArchetypesForCoa(null, ['change-of-use'])).toEqual(['INT']);
    expect(deriveArchetypesForCoa(null, ['condo'])).toEqual(['FB']); // Integration fold
    expect(deriveArchetypesForCoa(null, ['third-storey'])).toEqual(['ADD']); // vertical addition
  });

  it('`two-storey` is an intentional non-signal modifier (no archetype on its own)', () => {
    expect(deriveArchetypesForCoa(null, ['two-storey'])).toEqual([]);
    // but co-firing with a real scope tag still resolves via that tag.
    expect(deriveArchetypesForCoa(null, ['two-storey', 'rear-addition'])).toEqual(['ADD']);
  });

  it('passes through scope_tags already valid in TAG_ARCHETYPE', () => {
    expect(deriveArchetypesForCoa(null, ['basement'])).toEqual(['BAS']);
    expect(deriveArchetypesForCoa(null, ['garage'])).toEqual(['GAR']);
    expect(deriveArchetypesForCoa(null, ['walkout'])).toEqual(['ADD']);
    expect(deriveArchetypesForCoa(null, ['fence'])).toEqual(['SITE']);
    expect(deriveArchetypesForCoa(null, ['townhouse'])).toEqual(['FB']);
  });

  it('variance / use-type tags carry no construction signal → no archetype', () => {
    expect(deriveArchetypesForCoa(null, ['severance', 'setback', 'minor-variance', 'lot-coverage'])).toEqual([]);
    expect(deriveArchetypesForCoa('Severance', ['parking'])).toEqual([]);
  });

  it('is case-insensitive on scope_tags and skips non-string elements', () => {
    expect(deriveArchetypesForCoa(null, ['Dwelling'])).toEqual(['FB']);
    expect(deriveArchetypesForCoa(null, ['dwelling', null, 42, '', { x: 1 }] as unknown[])).toEqual(['FB']);
  });

  it('unmapped project_type (defensive) → treated as no project-type axis', () => {
    expect(deriveArchetypesForCoa('SomeFutureType', [])).toEqual([]);
  });
});

describe('coa-trade-classifier — classifyCoaTrades (direct matrix + bundle, MAX-dedup)', () => {
  const BC = BUNDLE_TIER_CONFIDENCE_DEFAULT;

  it('no-archetype CoA (variance-only) → no bundle, no direct hits → []', () => {
    const out = classifyCoaTrades({ project_type: 'Severance', scope_tags: ['severance'] }, BC, DEPRECATED_TRADE_SLUGS);
    expect(out).toEqual([]);
  });

  it('returns a bounded, deduped, slug-sorted {slug, confidence, fromBundle} set', () => {
    const out = classifyCoaTrades({ project_type: 'Alteration', scope_tags: ['renovation'] }, BC, DEPRECATED_TRADE_SLUGS);
    expect(out.length).toBeGreaterThan(0);
    const slugs = out.map((r) => r.slug);
    expect(slugs).toEqual([...slugs].sort());
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const r of out) {
      expect(typeof r.slug).toBe('string');
      expect(typeof r.confidence).toBe('number');
      expect(typeof r.fromBundle).toBe('boolean');
      // pure function emits no tier/phase — those are caller-applied constants.
      expect(Object.keys(r).sort()).toEqual(['confidence', 'fromBundle', 'slug']);
    }
  });

  it('provenance: a direct-matrix hit at exactly the bundle tier is strong (fromBundle=false), not bundle-only', () => {
    // `fence` → direct framing@0.55; SITE bundle ALSO lists framing → merged 0.55. A naive
    // `confidence > bundleConf` proxy would mislabel it bundle_only; provenance keeps it strong.
    const out = classifyCoaTrades({ project_type: null, scope_tags: ['fence'] }, BC, DEPRECATED_TRADE_SLUGS);
    const framing = out.find((r) => r.slug === 'framing');
    expect(framing?.confidence).toBe(0.55);
    expect(framing?.fromBundle).toBe(false);
    // a SITE-bundle trade the fence matrix never emits IS bundle-only.
    expect(out.find((r) => r.slug === 'site-preparation')?.fromBundle).toBe(true);
  });

  it('condo → FB bundle (Integration fold — mirrors TAG_ALIASES condo→apartment)', () => {
    const out = classifyCoaTrades({ project_type: null, scope_tags: ['condo'] }, BC, DEPRECATED_TRADE_SLUGS);
    expect(out.some((r) => r.slug === 'trim-work')).toBe(true); // FB-bundle finish trade
    expect(out.some((r) => r.slug === 'millwork-cabinetry')).toBe(true);
  });

  it('MAX-dedup: a direct hit above the bundle tier wins over the bundle', () => {
    // `renovation` → interior matrix emits drywall@0.70; INT bundle also lists drywall.
    // 0.70 > 0.55, so the direct confidence must survive.
    const out = classifyCoaTrades({ project_type: null, scope_tags: ['renovation'] }, BC, DEPRECATED_TRADE_SLUGS);
    expect(out.find((r) => r.slug === 'drywall')?.confidence).toBe(0.7);
  });

  it('bundle fills a low-signal trade the direct matrix never emits, at exactly the bundle tier', () => {
    // INT bundle includes millwork-cabinetry; the `interior` trade matrix does not.
    const out = classifyCoaTrades({ project_type: null, scope_tags: ['renovation'] }, BC, DEPRECATED_TRADE_SLUGS);
    expect(out.find((r) => r.slug === 'millwork-cabinetry')?.confidence).toBe(BC);
  });

  it('never emits a deprecated trade (temporary-fencing) even on a full-build CoA', () => {
    const out = classifyCoaTrades({ project_type: 'NewConstruction', scope_tags: ['dwelling'] }, BC, DEPRECATED_TRADE_SLUGS);
    expect(out.some((r) => r.slug === 'temporary-fencing')).toBe(false);
  });

  it('a full-build CoA lights up bundle-only finish/service trades absent from the direct matrix', () => {
    const out = classifyCoaTrades({ project_type: 'NewConstruction', scope_tags: ['dwelling'] }, BC, DEPRECATED_TRADE_SLUGS);
    const slugs = new Set(out.map((r) => r.slug));
    // these are FB-bundle trades the build-sfd trade-matrix entry never emits.
    expect(slugs.has('trim-work')).toBe(true);
    expect(slugs.has('millwork-cabinetry')).toBe(true);
    expect(slugs.has('tiling')).toBe(true);
  });
});

describe('coa-trade-classifier — Phase 3 bundle slug integrity (R4) + JS↔TS parity', () => {
  it('R4: every ARCHETYPE_BUNDLES trade slug exists in the trades vocab (no slug_resolution_miss)', () => {
    const vocab = new Set(TRADES.map((t) => t.slug));
    const missing: string[] = [];
    for (const code of Object.keys(ARCHETYPE_BUNDLES) as Array<keyof typeof ARCHETYPE_BUNDLES>) {
      for (const slug of ARCHETYPE_BUNDLES[code].trades) {
        if (!vocab.has(slug)) missing.push(`${code}:${slug}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('parity: COA_PROJECT_TYPE_MAP key/value pairs match', () => {
    expect({ ...COA_PROJECT_TYPE_MAP }).toEqual({ ...jsLib.COA_PROJECT_TYPE_MAP });
  });

  it('parity: COA_TAG_TO_ARCHETYPE_TAG key/value pairs match', () => {
    expect({ ...COA_TAG_TO_ARCHETYPE_TAG }).toEqual({ ...jsLib.COA_TAG_TO_ARCHETYPE_TAG });
  });

  it('parity: DEPRECATED_TRADE_SLUGS + BUNDLE_TIER_CONFIDENCE_DEFAULT match', () => {
    expect([...DEPRECATED_TRADE_SLUGS].sort()).toEqual([...jsLib.DEPRECATED_TRADE_SLUGS].sort());
    expect(BUNDLE_TIER_CONFIDENCE_DEFAULT).toBe(jsLib.BUNDLE_TIER_CONFIDENCE_DEFAULT);
  });

  it('parity: deriveArchetypesForCoa + classifyCoaTrades over fixtures', () => {
    const FIXTURES: Array<{ pt: string | null; tags: unknown[] }> = [
      { pt: 'NewConstruction', tags: ['dwelling'] },
      { pt: 'Alteration', tags: ['renovation', 'kitchen'] },
      { pt: 'Addition', tags: ['rear-addition'] },
      { pt: 'Severance', tags: ['severance'] },
      { pt: 'Mixed', tags: ['mixed-use', 'office'] },
      { pt: null, tags: ['accessory-structure', 'garage'] },
      { pt: 'Demolition', tags: ['demolition'] },
      { pt: 'NewConstruction', tags: ['Dwelling', null, 42, ''] },
    ];
    for (const { pt, tags } of FIXTURES) {
      expect(deriveArchetypesForCoa(pt, tags as unknown[])).toEqual(jsLib.deriveArchetypesForCoa(pt, tags));
      const tsRow = { project_type: pt, scope_tags: tags as unknown[] };
      const jsRow = { project_type: pt, scope_tags: tags };
      expect(classifyCoaTrades(tsRow, BUNDLE_TIER_CONFIDENCE_DEFAULT, DEPRECATED_TRADE_SLUGS)).toEqual(
        jsLib.classifyCoaTrades(jsRow, jsLib.BUNDLE_TIER_CONFIDENCE_DEFAULT, jsLib.DEPRECATED_TRADE_SLUGS),
      );
    }
  });
});
