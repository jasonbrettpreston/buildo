// 🔗 SPEC LINK: docs/specs/01-pipeline/80_taxonomies.md §5.B.5 (archetype bundle prior)
//
// Proves the bundle prior is APPROPRIATELY SCOPED, not blanket-applied:
//  - deriveArchetypes returns [] when there is no archetype signal → NO bundle.
//  - each archetype contributes only ITS bundle (MEC → 3 products, not 27).
//  - classifyProducts: a no-archetype permit yields nothing; tag hits beat bundle hits.

import { describe, it, expect } from 'vitest';
import { deriveArchetypes, bundleSlugsFor, ARCHETYPE_BUNDLES } from '@/lib/classification/archetypes';
import { classifyProducts } from '@/lib/classification/classifier';

describe('deriveArchetypes — scoping (the "not every permit" guarantee)', () => {
  it('returns [] for signal-less permits (other/repair/null + no tags) → bundle never fires', () => {
    expect(deriveArchetypes('other', [])).toEqual([]);
    expect(deriveArchetypes('repair', [])).toEqual([]);
    expect(deriveArchetypes('demolition', [])).toEqual([]); // demolition maps to no archetype
    expect(deriveArchetypes(null, null)).toEqual([]);
    expect(deriveArchetypes(undefined, [])).toEqual([]);
  });

  it('maps a build/system project_type to its single coarse archetype', () => {
    expect(deriveArchetypes('new_build', [])).toEqual(['FB']);
    expect(deriveArchetypes('addition', [])).toEqual(['ADD']);
    expect(deriveArchetypes('renovation', [])).toEqual(['INT']);
    expect(deriveArchetypes('mechanical', [])).toEqual(['MEC']);
  });

  it('repair suppresses the bundle even with a construction tag (WF3 Fix B)', () => {
    // A balcony/roof REPAIR must not inherit the full ADD/ENV construction bundle —
    // repair overrides the tag path. (Direct tag-trade matrix still emits its trades.)
    expect(deriveArchetypes('repair', ['balcony'])).toEqual([]);          // not ['ADD']
    expect(deriveArchetypes('repair', ['new:roofing', 'balcony'])).toEqual([]); // not ['ENV','ADD']
    // Non-repair project_types are unaffected — tags still derive archetypes.
    expect(deriveArchetypes('renovation', ['new:kitchen']).sort()).toEqual(['INT', 'KIT'].sort());
    expect(deriveArchetypes('other', ['new:laneway-suite'])).toEqual(['LANE']);
  });

  it('unions tag-derived + project_type-derived archetypes (multi)', () => {
    const a = deriveArchetypes('addition', ['new:garage', 'new:pool']).sort();
    expect(a).toEqual(['ADD', 'GAR', 'SITE'].sort());
    expect(deriveArchetypes('renovation', ['new:kitchen']).sort()).toEqual(['INT', 'KIT'].sort());
  });
});

describe('bundleSlugsFor — each archetype contributes only its own set', () => {
  it('MEC is a small bundle (systems only), not the full vocab', () => {
    const { trades, products } = bundleSlugsFor(['MEC']);
    expect(products.sort()).toEqual(['hvac-equipment', 'lighting', 'plumbing-fixtures'].sort());
    expect(trades).toContain('plumbing');
    expect(trades).not.toContain('tiling'); // MEC has no interior-finish trades
  });

  it('never emits a deprecated trade slug', () => {
    const { trades } = bundleSlugsFor(['FB', 'ADD', 'SITE'], new Set(['temporary-fencing']));
    expect(trades).not.toContain('temporary-fencing');
  });

  it('FB is the broad set (a full build legitimately implies ~all)', () => {
    expect(ARCHETYPE_BUNDLES.FB.trades.length).toBeGreaterThanOrEqual(30);
    expect(ARCHETYPE_BUNDLES.FB.trades).not.toContain('pool-installation'); // FB excludes pool/decking
  });
});

describe('classifyProducts — scoped product bundle', () => {
  const permit = { permit_num: 'p1', revision_num: '00' };

  it('a signal-less permit emits NO products (bundle does not fire)', () => {
    expect(classifyProducts(permit, [], { projectType: 'other' })).toEqual([]);
    expect(classifyProducts(permit, [], { projectType: 'repair' })).toEqual([]);
  });

  it('a mechanical permit emits only the 3 MEC products (bounded, not 27)', () => {
    const out = classifyProducts(permit, [], { projectType: 'mechanical' });
    expect(out.map((p) => p.product_slug).sort()).toEqual(['hvac-equipment', 'lighting', 'plumbing-fixtures'].sort());
    expect(out.every((p) => p.confidence === 0.45)).toBe(true); // bundle-tier
  });

  it('tag hits win over bundle hits (MAX-dedup)', () => {
    // kitchen tag → tiling at 0.75; KIT/INT bundle also implies tiling → must stay 0.75.
    const out = classifyProducts(permit, ['new:kitchen'], { projectType: 'renovation' });
    const tiling = out.find((p) => p.product_slug === 'tiling');
    expect(tiling?.confidence).toBe(0.75);
  });

  it('tags alone derive an archetype (projectType optional) — bundle fires from the tag', () => {
    const out = classifyProducts(permit, ['new:kitchen']); // no projectType, but kitchen tag → KIT
    expect(out.find((p) => p.product_slug === 'kitchen-cabinets')?.confidence).toBe(0.75); // tag hit
    // `staircases` is in the KIT bundle but NOT a kitchen tag-product → bundle-tier 0.45
    expect(out.find((p) => p.product_slug === 'staircases')?.confidence).toBe(0.45);
  });

  it('truly signal-less (no tags, no options) emits nothing', () => {
    expect(classifyProducts(permit, [])).toEqual([]);
  });

  it('narrow-scope companion permits get NO products (they live on the primary permit)', () => {
    // A PLB/MS/DR companion repeats the whole project scope; products must not leak.
    const narrow = classifyProducts(
      { permit_num: '21 123456 PLB 00', revision_num: '00' },
      ['new:kitchen'],
      { projectType: 'renovation' },
    );
    expect(narrow).toEqual([]); // narrow-scope → no products despite kitchen tag + KIT/INT archetype
    // The primary (BLD, non-narrow) permit of the same project DOES emit products.
    const primary = classifyProducts(
      { permit_num: '21 123456 BLD 00', revision_num: '00' },
      ['new:kitchen'],
      { projectType: 'renovation' },
    );
    expect(primary.length).toBeGreaterThan(0);
  });
});
