// 🔗 SPEC LINK: docs/specs/01-pipeline/84_lifecycle_phase_engine.md §7 Orphan Logic
//
// Logic test for `computeIsOrphan` (scripts/lib/orphan-detection.js).
//
// Spec 84 §7 explicitly scopes O-phases (O1/O2/O3) to "standalone trade
// permits" — HVA, PLB, DRN, ELE etc., NOT BLD or CMB. BLD and CMB are
// parent permits / combined-permit folders, not standalone trade
// permits, so they can NEVER legitimately fall into the orphan branch.
//
// The earlier inline implementation in scripts/classify-lifecycle-phase.js
// computed `is_orphan = true` whenever the permit's prefix had no OTHER
// BLD/CMB sibling — including for the BLD itself. A single-revision
// BLD's prefix Set contained only itself, so the loop never set
// is_orphan = false, and the BLD was wrongly orphaned. Surfaced via
// manual Flight Center verification on `25 122754 BLD` (currently O3
// despite being an actively-inspected build with live HVA + PLB
// sub-permits at P18).
//
// This test exercises the four cases enumerated in Spec 84 §7 + edge
// cases (malformed permit_num, missing prefix, empty map).

import { describe, it, expect } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { computeIsOrphan } = require('../../scripts/lib/orphan-detection') as {
  computeIsOrphan: (permitNum: string, linkedCoaApplicationNumber: string | null, bldCmbByPrefix: Map<string, Set<string>>) => boolean;
};

describe('computeIsOrphan — Spec 84 §7 categorical rule (BLD/CMB never orphan)', () => {
  it('BLD permit with NO sibling BLD/CMB → is_orphan = false (Spec 84 §7: BLDs are not standalone trade permits)', () => {
    // The 24 Northbridge case: 25 122754 BLD has no sibling BLD revision,
    // but it has live HVA + PLB sub-permits. Per spec it should be P18,
    // NOT O3. The earlier inline logic returned `true` here — this test
    // is the regression lock.
    const map = new Map<string, Set<string>>([
      ['25 122754', new Set(['25 122754 BLD'])],
    ]);
    expect(computeIsOrphan('25 122754 BLD', null, map)).toBe(false);
  });

  it('CMB permit with no sibling CMB → is_orphan = false', () => {
    // Same rule applies to combined-permit folders. CMB acts as a parent
    // permit; cannot be a "standalone trade permit" per spec.
    const map = new Map<string, Set<string>>([
      ['24 999999', new Set(['24 999999 CMB'])],
    ]);
    expect(computeIsOrphan('24 999999 CMB', null, map)).toBe(false);
  });

  it('BLD permit WITH a sibling BLD revision → is_orphan = false (existing path, preserved)', () => {
    // Same prefix, two BLD revisions. Existing logic correctly returned
    // false; the fix doesn't regress this case.
    const map = new Map<string, Set<string>>([
      ['23 555000', new Set(['23 555000 BLD', '23 555000 BLD-REV1'])],
    ]);
    expect(computeIsOrphan('23 555000 BLD', null, map)).toBe(false);
  });
});

describe('computeIsOrphan — sub-permit (HVA/PLB/DRN/etc.) classification (existing logic preserved)', () => {
  it('HVA sub-permit WITH a parent BLD at the prefix → is_orphan = false', () => {
    // Parent BLD exists in the prefix group → the sub-permit is correctly
    // a child of an active project, not orphan.
    const map = new Map<string, Set<string>>([
      ['25 122754', new Set(['25 122754 BLD'])],
    ]);
    expect(computeIsOrphan('25 122754 HVA', null, map)).toBe(false);
  });

  it('HVA sub-permit WITHOUT a parent BLD/CMB at the prefix → is_orphan = true (canonical orphan case)', () => {
    // No parent in the map → genuinely orphan trade permit per Spec 84 §7.
    // E.g., a one-off furnace replacement filed without an associated BLD.
    const map = new Map<string, Set<string>>();
    expect(computeIsOrphan('25 999000 HVA', null, map)).toBe(true);
  });

  it('PLB sub-permit WITHOUT a parent BLD/CMB → is_orphan = true', () => {
    const map = new Map<string, Set<string>>();
    expect(computeIsOrphan('25 999111 PLB', null, map)).toBe(true);
  });

  it('DRN sub-permit WITHOUT a parent → is_orphan = true', () => {
    const map = new Map<string, Set<string>>();
    expect(computeIsOrphan('25 999222 DRN', null, map)).toBe(true);
  });

  it('Sub-permit prefix exists in map but only contains the sub-permit itself (degenerate) → is_orphan = true', () => {
    // Map has the prefix BUT the only entry is the sub-permit — meaning
    // no actual parent BLD/CMB exists. Tests the loop's "pn !== row.permit_num"
    // guard. Note: this is an unusual map state because bldCmbByPrefix
    // is supposed to contain only BLD/CMB entries; including a sub-permit
    // in the values is degenerate. Test guards against logic regression
    // if the upstream map construction ever changes.
    const map = new Map<string, Set<string>>([
      ['25 999333', new Set(['25 999333 HVA'])],
    ]);
    expect(computeIsOrphan('25 999333 HVA', null, map)).toBe(true);
  });
});

describe('computeIsOrphan — edge cases', () => {
  it('Malformed permit_num (no spaces) → is_orphan = true (defensive default)', () => {
    // Splitting on space yields a single-element array → cannot extract
    // a prefix. The function falls through to the orphan default. Acceptable
    // because the upstream classifier should have caught malformed input
    // earlier; this is just a defensive guard.
    const map = new Map<string, Set<string>>();
    expect(computeIsOrphan('garbage', null, map)).toBe(true);
  });

  it('permit_num with fewer than 3 space-separated parts → is_orphan = true', () => {
    // Two parts → no suffix → cannot determine BLD/CMB short-circuit;
    // also cannot construct prefix. Defensive default.
    const map = new Map<string, Set<string>>();
    expect(computeIsOrphan('25 122754', null, map)).toBe(true);
  });

  it('Empty bldCmbByPrefix map → BLD short-circuits to non-orphan regardless', () => {
    // A pristine map (e.g., on first ingest before any BLD permits land)
    // should still correctly identify a BLD as non-orphan via the suffix
    // check.
    const map = new Map<string, Set<string>>();
    expect(computeIsOrphan('25 122754 BLD', null, map)).toBe(false);
  });

  it('Empty map + sub-permit → orphan (canonical first-ingest case)', () => {
    const map = new Map<string, Set<string>>();
    expect(computeIsOrphan('25 122754 HVA', null, map)).toBe(true);
  });
});

// WF3 #12 Pass-2.5 Finding B (2026-05-22) — CoA-linkage exclusion.
//
// Spec 84 §7's "standalone trade permit" semantic now means: no BLD/CMB
// sibling AND no CoA linkage. A trade permit attached to a Committee of
// Adjustment application is part of a regulated project with CoA parent
// context — same conceptual category as a BLD/CMB sibling — so it does
// NOT fall into O1/O2/O3.
//
// The §7a Inspector spot-check on 2026-05-20 found 4/4 CoA-linked trade
// permits in a 12-permit sample were incorrectly orphaned and silently
// dropped from the lead feed via Spec 85's SKIP_PHASES_SQL filter. These
// tests are the regression lock for the fix.
describe('computeIsOrphan — Spec 84 §7 CoA-linkage exclusion (WF3 #12 Finding B)', () => {
  it('Trade permit with CoA linkage AND no BLD/CMB sibling → is_orphan = false', () => {
    // The canonical Finding B case: a PLB (or other trade) permit
    // attached to a CoA application but with no parent BLD in the same
    // prefix group. Pre-fix this was classified as orphan and dropped
    // from forecasts. Post-fix it correctly stays in the feed.
    const map = new Map<string, Set<string>>();
    expect(computeIsOrphan('25 237692 PLB', 'B0030/26TEY', map)).toBe(false);
  });

  it('Trade permit with CoA linkage AND a BLD sibling → is_orphan = false (both exclusions; result unchanged)', () => {
    // Two parent contexts — either alone would disqualify. Confirms
    // the function returns false via the CoA short-circuit before
    // reaching the prefix-Set lookup, AND that having both doesn't
    // produce an unexpected interaction.
    const map = new Map<string, Set<string>>([
      ['25 237692', new Set(['25 237692 BLD'])],
    ]);
    expect(computeIsOrphan('25 237692 PLB', 'B0030/26TEY', map)).toBe(false);
  });

  it('Trade permit with NO CoA linkage AND NO sibling → is_orphan = true (canonical orphan preserved)', () => {
    // The CoA-linkage path returns false only when the linkage is NOT NULL.
    // null linkage falls through to the existing prefix-Set check.
    const map = new Map<string, Set<string>>();
    expect(computeIsOrphan('25 999000 HVA', null, map)).toBe(true);
  });

  it('BLD with CoA linkage → is_orphan = false (BLD short-circuit fires first; CoA is redundant)', () => {
    // Spec 84 §7 categorical rule: BLD is never orphan regardless of
    // other parent context signals. The BLD short-circuit is Step 1,
    // before the CoA check. Confirms the ordering is consistent.
    const map = new Map<string, Set<string>>([
      ['25 122754', new Set(['25 122754 BLD'])],
    ]);
    expect(computeIsOrphan('25 122754 BLD', 'A1234/24TEY', map)).toBe(false);
  });
});
