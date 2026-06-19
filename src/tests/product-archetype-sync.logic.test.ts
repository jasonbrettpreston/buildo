// 🔗 SPEC LINK: docs/specs/00-architecture/00_engineering_standards.md §7.1 (dual-path)
//             + docs/specs/01-pipeline/80_taxonomies.md §5.B
//
// Behavior-driven dual-path parity for the Spec 80 v-next product/archetype twins:
// scripts/lib/tag-product-matrix.js ↔ src/lib/classification/tag-product-matrix.ts and
// scripts/lib/archetypes.js ↔ src/lib/classification/archetypes.ts. These pure libs are
// required directly (no pipeline/pg deps), so we compare OUTPUTS, not source text.

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { lookupProductsForTags as tsProducts } from '@/lib/classification/tag-product-matrix';
import {
  deriveArchetypes as tsDerive,
  bundleSlugsFor as tsBundle,
  type ArchetypeCode,
} from '@/lib/classification/archetypes';

const req = createRequire(import.meta.url);
const jsProductMatrix = req('../../scripts/lib/tag-product-matrix');
const jsArch = req('../../scripts/lib/archetypes');

const TAG_SAMPLES: string[][] = [
  [], ['new:kitchen'], ['bathroom'], ['new:basement'], ['new:deck'], ['garage'],
  ['roofing'], ['windows'], ['new:window'], ['new:laneway-suite'], ['interior'],
  ['new:build-sfd'], ['new:houseplex-3-unit'], ['solar'], ['demolition'], ['unknown-tag'],
  ['new:kitchen', 'new:basement', 'garage'],
];
const PT_SAMPLES: (string | null)[] = [
  'new_build', 'addition', 'renovation', 'mechanical', 'demolition', 'repair', 'other', null,
];
const sorted = (a: string[]) => [...a].sort();

describe('product + archetype dual-path parity (§7.1)', () => {
  it('lookupProductsForTags: JS twin === TS for every sample', () => {
    for (const tags of TAG_SAMPLES) {
      expect(sorted(jsProductMatrix.lookupProductsForTags(tags))).toEqual(sorted(tsProducts(tags)));
    }
  });

  it('deriveArchetypes: JS twin === TS across project_type × tags', () => {
    for (const pt of PT_SAMPLES) {
      for (const tags of TAG_SAMPLES) {
        expect(sorted(jsArch.deriveArchetypes(pt, tags))).toEqual(
          sorted(tsDerive(pt, tags) as string[]),
        );
      }
    }
  });

  it('bundleSlugsFor: JS twin === TS (trades + products), deprecated-filtered', () => {
    const codeSets: ArchetypeCode[][] = [['FB'], ['MEC'], ['KIT', 'INT'], ['SITE', 'GAR'], ['ADD', 'BAS', 'ENV']];
    const dep = new Set(['temporary-fencing']);
    for (const codes of codeSets) {
      const js = jsArch.bundleSlugsFor(codes, dep);
      const ts = tsBundle(codes, dep);
      expect(sorted(js.trades)).toEqual(sorted(ts.trades));
      expect(sorted(js.products)).toEqual(sorted(ts.products));
    }
  });
});
