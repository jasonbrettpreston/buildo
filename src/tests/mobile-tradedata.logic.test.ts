// 🔗 SPEC LINK: docs/specs/01-pipeline/80_taxonomies.md §5.B.6
//             + docs/specs/03-mobile/94_mobile_onboarding.md §3.1
//
// Regression lock (Spec 80 v-next P2.6, Regression Guardian): the mobile
// onboarding TRADE_SECTIONS must not let a user register for a DEPRECATED trade,
// and must stay in sync with the active trade vocab. Source-parsed (no cross-package
// import) so it runs in the main vitest suite.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { TRADES } from '@/lib/classification/trades';

const SRC = fs.readFileSync(
  path.resolve(__dirname, '../../mobile/src/lib/onboarding/tradeData.ts'),
  'utf-8',
);
const slugs = Array.from(SRC.matchAll(/slug:\s*'([^']+)'/g)).map((m) => m[1]!);

describe('mobile TRADE_SECTIONS vs the active trade vocab (Spec 80 §5.B.6)', () => {
  it('parses a non-empty slug list', () => {
    expect(slugs.length).toBeGreaterThan(0);
  });

  it('lists NO deprecated trade slug (cannot onboard for a deprecated trade)', () => {
    const deprecated = new Set(TRADES.filter((t) => t.kind === 'deprecated').map((t) => t.slug));
    expect(slugs.filter((s) => deprecated.has(s))).toEqual([]);
  });

  it('every listed slug is a real, non-deprecated trade (no orphans)', () => {
    const active = new Set(TRADES.filter((t) => t.kind !== 'deprecated').map((t) => t.slug));
    expect(slugs.filter((s) => !active.has(s))).toEqual([]);
  });

  it('includes the Spec 80 v-next additions and drops temporary-fencing', () => {
    for (const s of ['site-preparation', 'site-maintenance', 'overhead-doors']) {
      expect(slugs).toContain(s);
    }
    expect(slugs).not.toContain('temporary-fencing');
  });
});
