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
  classifyCoaProducts,
  PRODUCT_TAG_CONFIDENCE,
  PRODUCT_BUNDLE_CONFIDENCE,
  COA_PROJECT_TYPE_MAP,
  COA_TAG_TO_ARCHETYPE_TAG,
  DEPRECATED_TRADE_SLUGS,
  BUNDLE_TIER_CONFIDENCE_DEFAULT,
  // P16 16D — the lean inference layer's confidence constant.
  INFERENCE_TIER_CONFIDENCE,
} from '@/lib/classification/coa-trade-classifier';
import { ARCHETYPE_BUNDLES } from '@/lib/classification/archetypes';
import { TRADES } from '@/lib/classification/trades';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';

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

describe('coa-trade-classifier — classifyCoaTrades (P16 16D: evidence + gated lean inference)', () => {
  // P16 16D KNOWING lock update: the coarse archetype bundle prior is RETIRED and the 2-state
  // `fromBundle` boolean replaced by attachment_basis ('evidence'|'inference'). The old
  // bundle-fill locks retire WITH it; the new contract is pinned below.

  it('no-line CoA (variance-only Severance) → no evidence, no inference → [] (gate ON or OFF)', () => {
    const row = { project_type: 'Severance', scope_tags: ['severance'] };
    expect(classifyCoaTrades(row)).toEqual([]);
    expect(classifyCoaTrades(row, { inferenceEnabled: true })).toEqual([]);
  });

  it('returns a bounded, deduped, slug-sorted {slug, confidence, attachment_basis} set', () => {
    const out = classifyCoaTrades(
      { project_type: 'Alteration', scope_tags: ['renovation'] },
      { inferenceEnabled: true },
    );
    expect(out.length).toBeGreaterThan(0);
    const slugs = out.map((r) => r.slug);
    expect(slugs).toEqual([...slugs].sort());
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const r of out) {
      expect(typeof r.slug).toBe('string');
      expect(typeof r.confidence).toBe('number');
      expect(['evidence', 'inference']).toContain(r.attachment_basis);
      // pure function emits no tier/phase — those are caller-applied constants.
      expect(Object.keys(r).sort()).toEqual(['attachment_basis', 'confidence', 'slug']);
    }
  });

  it('gate OFF (default): output is the direct tag-matrix EVIDENCE set only', () => {
    const out = classifyCoaTrades({ project_type: 'Alteration', scope_tags: ['renovation'] });
    expect(out.length).toBeGreaterThan(0);
    for (const r of out) expect(r.attachment_basis).toBe('evidence');
    // The old bundle-fill trade (millwork-cabinetry via INT) does NOT appear when gated OFF.
    expect(out.some((r) => r.slug === 'millwork-cabinetry')).toBe(false);
  });

  it('coincidental-tier value lock: a direct hit at 0.55 stays EVIDENCE (provenance ≠ confidence)', () => {
    // `fence` → direct framing@0.55 (the old bundle tier). The basis must be path-keyed.
    const out = classifyCoaTrades({ project_type: null, scope_tags: ['fence'] }, { inferenceEnabled: true });
    const framing = out.find((r) => r.slug === 'framing');
    expect(framing?.confidence).toBe(0.55);
    expect(framing?.attachment_basis).toBe('evidence');
    // fence maps to NO cost line (mapToLines → null) → no inference rows ride along.
    expect(out.every((r) => r.attachment_basis === 'evidence')).toBe(true);
  });

  it('gate ON: renovation (gut line) fills evidence-missed finish trades at 0.50 inference', () => {
    // Alteration+renovation → TAG_LINE renovation→gut → the lean gut complement carries
    // millwork-cabinetry/tiling/trim-work, which the `interior` matrix never emits.
    const out = classifyCoaTrades(
      { project_type: 'Alteration', scope_tags: ['renovation'] },
      { inferenceEnabled: true },
    );
    for (const starved of ['millwork-cabinetry', 'tiling', 'trim-work']) {
      const r = out.find((x) => x.slug === starved);
      expect(r, `gut complement trade missing: ${starved}`).toBeTruthy();
      expect(r?.attachment_basis).toBe('inference');
      expect(r?.confidence).toBe(INFERENCE_TIER_CONFIDENCE);
    }
    // D1 union: a direct hit keeps its slot + confidence (drywall@0.70 from the interior matrix).
    const drywall = out.find((r) => r.slug === 'drywall');
    expect(drywall?.confidence).toBe(0.7);
    expect(drywall?.attachment_basis).toBe('evidence');
  });

  it('never emits a deprecated trade (temporary-fencing) even on a full-build CoA, gate ON', () => {
    const out = classifyCoaTrades(
      { project_type: 'NewConstruction', scope_tags: ['dwelling'] },
      { inferenceEnabled: true },
    );
    expect(out.some((r) => r.slug === 'temporary-fencing')).toBe(false);
  });

  it('gate ON: NewConstruction (coa_build line) attaches its lean complement as inference', () => {
    const out = classifyCoaTrades(
      { project_type: 'NewConstruction', scope_tags: ['dwelling'] },
      { inferenceEnabled: true },
    );
    const slugs = new Set(out.map((r) => r.slug));
    // lean coa_build complement trades the build-sfd matrix never emits:
    expect(slugs.has('trim-work')).toBe(true);
    expect(slugs.has('millwork-cabinetry')).toBe(true);
    expect(slugs.has('tiling')).toBe(true);
    // …and the RETIRED coarse-FB-only trades are GONE (leanness — D6): elevator/structural-steel
    // were FB-bundle recall; the lean complement excludes them.
    expect(slugs.has('elevator')).toBe(false);
    expect(slugs.has('structural-steel')).toBe(false);
  });
});

describe('coa-trade-classifier — P16 16D attachment_basis partition contract (supersedes P6.6 fromBundle)', () => {
  // classify-coa-trades.js now writes is_active=true for BOTH bases and persists
  // attachment_basis; ranking authority is the BASIS (D1/D5). These pin the partition.
  it('NewConstruction+dwelling: direct build-sfd trades are EVIDENCE', () => {
    const out = classifyCoaTrades(
      { project_type: 'NewConstruction', scope_tags: ['dwelling'] },
      { inferenceEnabled: true },
    );
    expect(out.find((r) => r.slug === 'framing')?.attachment_basis).toBe('evidence');
  });

  it('severance-only CoA → [] → 0 active trades (the P6.6 fence PRESERVED through 16D)', () => {
    const out = classifyCoaTrades(
      { project_type: 'Severance', scope_tags: ['severance'] },
      { inferenceEnabled: true },
    );
    expect(out).toEqual([]);
  });

  it('structure-type laneway override: a laneway CoA maps to the laneway complement', () => {
    const out = classifyCoaTrades(
      {
        project_type: 'Alteration',
        scope_tags: ['renovation'],
        structure_type: 'Laneway / Rear Yard Suite',
      },
      { inferenceEnabled: true },
    );
    // The laneway_suite lean complement carries eavestrough-siding (starved trade) —
    // proof the structure override reached mapToLines.
    expect(out.find((r) => r.slug === 'eavestrough-siding')?.attachment_basis).toBe('inference');
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

  it('parity: deriveArchetypesForCoa + classifyCoaTrades over fixtures (both gate states)', () => {
    const FIXTURES: Array<{ pt: string | null; tags: unknown[]; st?: string | null }> = [
      { pt: 'NewConstruction', tags: ['dwelling'] },
      { pt: 'Alteration', tags: ['renovation', 'kitchen'] },
      { pt: 'Addition', tags: ['rear-addition'] },
      { pt: 'Severance', tags: ['severance'] },
      { pt: 'Mixed', tags: ['mixed-use', 'office'] },
      { pt: null, tags: ['accessory-structure', 'garage'] },
      { pt: 'Demolition', tags: ['demolition'] },
      { pt: 'NewConstruction', tags: ['Dwelling', null, 42, ''] },
      { pt: 'Alteration', tags: ['renovation'], st: 'Laneway / Rear Yard Suite' },
    ];
    for (const { pt, tags, st } of FIXTURES) {
      expect(deriveArchetypesForCoa(pt, tags as unknown[])).toEqual(jsLib.deriveArchetypesForCoa(pt, tags));
      const tsRow = { project_type: pt, scope_tags: tags as unknown[], structure_type: st ?? null };
      const jsRow = { project_type: pt, scope_tags: tags, structure_type: st ?? null };
      for (const inferenceEnabled of [false, true]) {
        expect(classifyCoaTrades(tsRow, { inferenceEnabled })).toEqual(
          jsLib.classifyCoaTrades(jsRow, { inferenceEnabled }),
        );
      }
    }
  });

  it('parity: INFERENCE_TIER_CONFIDENCE matches JS↔TS (0.50, descriptive-only [FAB4])', () => {
    expect(INFERENCE_TIER_CONFIDENCE).toBe(0.5);
    expect(jsLib.INFERENCE_TIER_CONFIDENCE).toBe(0.5);
  });
});

describe('coa-trade-classifier — classifyCoaProducts (Spec 80 §5.B)', () => {
  it('emits product slugs for a product-bearing residential new-construction CoA', () => {
    const out = classifyCoaProducts(
      { project_type: 'NewConstruction', scope_tags: ['new-construction', 'dwelling', 'roofing'] },
      DEPRECATED_TRADE_SLUGS,
    );
    expect(out.length).toBeGreaterThan(0);
    // shape mirrors classifyCoaTrades: { slug, confidence, fromBundle }
    for (const m of out) {
      expect(typeof m.slug).toBe('string');
      expect(m.confidence === PRODUCT_TAG_CONFIDENCE || m.confidence === PRODUCT_BUNDLE_CONFIDENCE).toBe(true);
      expect(typeof m.fromBundle).toBe('boolean');
    }
  });

  it('returns [] for empty scope_tags (no signal)', () => {
    expect(classifyCoaProducts({ project_type: null, scope_tags: [] }, DEPRECATED_TRADE_SLUGS)).toEqual([]);
  });

  it('TS and JS dual-path produce identical product output', () => {
    const cases: Array<[string | null, string[]]> = [
      ['NewConstruction', ['new-construction', 'dwelling', 'roofing']],
      ['Addition', ['addition', 'rear-addition']],
      ['Alteration', ['renovation', 'kitchen']],
      [null, []],
    ];
    for (const [pt, tags] of cases) {
      expect(classifyCoaProducts({ project_type: pt, scope_tags: tags as unknown[] }, DEPRECATED_TRADE_SLUGS)).toEqual(
        jsLib.classifyCoaProducts({ project_type: pt, scope_tags: tags }, jsLib.DEPRECATED_TRADE_SLUGS),
      );
    }
  });

  it('product confidence tiers are pinned to 0.75 / 0.45 in BOTH the CoA classifier AND classify-permits (no drift)', () => {
    // TS + JS CoA constants.
    expect(PRODUCT_TAG_CONFIDENCE).toBe(0.75);
    expect(PRODUCT_BUNDLE_CONFIDENCE).toBe(0.45);
    expect(jsLib.PRODUCT_TAG_CONFIDENCE).toBe(0.75);
    expect(jsLib.PRODUCT_BUNDLE_CONFIDENCE).toBe(0.45);
    // The live permit path must carry the same literals (we duplicate rather than extract,
    // so this lock is the anti-drift guard — Regression Guardian).
    const permitsSrc = readFileSync(
      path.resolve(__dirname, '../../scripts/classify-permits.js'),
      'utf-8',
    );
    expect(permitsSrc).toMatch(/PRODUCT_TAG_CONFIDENCE\s*=\s*0\.75/);
    expect(permitsSrc).toMatch(/PRODUCT_BUNDLE_CONFIDENCE\s*=\s*0\.45/);
  });
});
