// 🔗 SPEC LINK: docs/specs/01-pipeline/80_taxonomies.md §5 (Realtor signal sub-gating)
//             docs/specs/03-mobile/91_mobile_lead_feed.md §3.5 (mobile realtor wire-up)
//             migrations/120_permit_type_classifications.sql (the construction-class taxonomy)
//
// Layer 3 live-DB regression-lock for the realtor sub-gating contract.
//
// Why this test exists (WF3 2026-05-09):
//   WF2 #2 (commit 9fdd31e) gated realtor on `permit_type_class === 'construction'`,
//   but the construction class (mig 120) bundles trade-only permits (PLB,
//   MS, DSS), demolition (DM), and non-residential. Live audit found 75,795
//   realtor rows on commercial-scoped permits + 50K on PLB + 42K on MS +
//   16K on DSS + 2.5K on DM — none of which signal "home will be sold."
//
//   The new contract gates on three axes:
//     1. permitClass === 'construction'   (existing — class-level gate)
//     2. permit_type ∈ REALTOR_RELEVANT_TYPES   (NEW — residential structural only)
//     3. 'commercial' ∉ scope_tags         (NEW — catches mixed-use)
//
//   This test would have caught the 75K commercial-realtor row class at
//   WF2 #2 commit time. Layer 1 (permit-type-class.logic.test.ts) covers
//   the unit contract; this layer exercises the contract through the live
//   classifier against real DB data — the only layer that catches taxonomy
//   drift between mig 120's seeds and REALTOR_RELEVANT_TYPES.
//
// Skipped if BUILDO_TEST_DB=1 / DATABASE_URL is not set so the default
// `npm run test` doesn't fail when Docker isn't running locally.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';
import { classifyPermit } from '@/lib/classification/classifier';
import { CONSTRUCTION } from '@/lib/classification/permit-type-class';
import type { Permit, TradeMappingRule } from '@/lib/permits/types';

const pool = getTestPool();

// All test fixtures share the prefix `TEST 9999` so afterAll cleanup is
// targeted and concurrent tests are unaffected.
const PERMIT_PREFIX = 'TEST 9999';
const PERMIT_REV = '00';
const noRules: TradeMappingRule[] = [];

// Each fixture covers one row of the contract matrix.
// expect_realtor=true ONLY for permits that pass all 3 axes.
const FIXTURES: Array<{
  permit_num: string;
  permit_type: string;
  scope_tags: string[] | null;
  expect_realtor: boolean;
  rationale: string;
}> = [
  {
    permit_num: `${PERMIT_PREFIX}01`,
    permit_type: 'New Houses',
    scope_tags: ['residential'],
    expect_realtor: true,
    rationale: 'residential building type + residential scope → canonical pass',
  },
  {
    permit_num: `${PERMIT_PREFIX}02`,
    permit_type: 'Small Residential Projects',
    scope_tags: null,
    expect_realtor: true,
    rationale: 'residential building type + null scope (permissive) → pass',
  },
  {
    permit_num: `${PERMIT_PREFIX}03`,
    permit_type: 'Plumbing(PS)',
    scope_tags: ['residential'],
    expect_realtor: false,
    rationale: 'trade-only permit type — does not signal home sale',
  },
  {
    permit_num: `${PERMIT_PREFIX}04`,
    permit_type: 'Mechanical(MS)',
    scope_tags: null,
    expect_realtor: false,
    rationale: 'HVAC trade-only — does not signal home sale',
  },
  {
    permit_num: `${PERMIT_PREFIX}05`,
    permit_type: 'Demolition Folder (DM)',
    scope_tags: ['residential'],
    expect_realtor: false,
    rationale: 'demolition — the new build (separate permit) gets realtor',
  },
  {
    permit_num: `${PERMIT_PREFIX}06`,
    permit_type: 'Building Additions/Alterations',
    scope_tags: ['commercial'],
    expect_realtor: false,
    rationale: 'commercial scope_tag → 75K row class WF3 closes',
  },
];

describe.skipIf(!dbAvailable())('classifyPermit — realtor 3-axis gating live-DB regression-lock (WF3 2026-05-09)', () => {
  beforeAll(async () => {
    if (!pool) return;

    // Seed the trades.id=33 realtor row if mig 118 hasn't run, so the
    // classifier's realtor append doesn't FK-crash. permit-type-classifier
    // shouldAppendRealtor will refuse to fire on non-residential anyway,
    // but realtor=true rows need the trade row to exist.
    await pool.query(
      `INSERT INTO trades (id, slug, name)
       VALUES (33, 'realtor', 'Real Estate Agent')
       ON CONFLICT (id) DO NOTHING`,
    );

    for (const f of FIXTURES) {
      await pool.query(
        `INSERT INTO permits (permit_num, revision_num, permit_type, status, scope_tags)
         VALUES ($1, $2, $3, 'Permit Issued', $4)
         ON CONFLICT (permit_num, revision_num) DO UPDATE
           SET permit_type = EXCLUDED.permit_type,
               scope_tags = EXCLUDED.scope_tags`,
        [f.permit_num, PERMIT_REV, f.permit_type, f.scope_tags],
      );
    }
  });

  afterAll(async () => {
    if (!pool) return;
    for (const f of FIXTURES) {
      await pool.query(`DELETE FROM permits WHERE permit_num = $1`, [f.permit_num]);
    }
    await pool.end();
  });

  // Run each fixture through classifyPermit with permitClass='construction'
  // (mirroring what the pipeline would compute for these permit_types via
  // mig 120's classifications). The 3-axis gate decides whether realtor fires.
  // scope_tags is passed as the separate `scopeTags` arg of classifyPermit
  // (TS classifier doesn't carry scope_tags on the Permit row interface).
  it.each(FIXTURES)(
    'permit_type=$permit_type scope_tags=$scope_tags → realtor=$expect_realtor ($rationale)',
    async ({ permit_num, permit_type, scope_tags, expect_realtor }) => {
      if (!pool) return;
      const permit: Partial<Permit> = {
        permit_num,
        revision_num: PERMIT_REV,
        permit_type,
        status: 'Permit Issued',
        issued_date: new Date('2025-06-17'),
      };
      const matches = classifyPermit(permit, noRules, scope_tags ?? undefined, {
        permitClass: CONSTRUCTION,
      });
      const hasRealtor = matches.some((m) => m.trade_slug === 'realtor');
      expect(hasRealtor).toBe(expect_realtor);
    },
  );

  it('zero residential-trade-only fixtures get realtor (the bug class WF3 closes)', async () => {
    if (!pool) return;
    // Aggregate the 4 reject fixtures and assert NONE got realtor.
    const rejectFixtures = FIXTURES.filter((f) => !f.expect_realtor);
    expect(rejectFixtures.length).toBe(4); // sanity: 4 reject classes

    for (const f of rejectFixtures) {
      const permit: Partial<Permit> = {
        permit_num: f.permit_num,
        revision_num: PERMIT_REV,
        permit_type: f.permit_type,
        status: 'Permit Issued',
        issued_date: new Date('2025-06-17'),
      };
      const matches = classifyPermit(permit, noRules, f.scope_tags ?? undefined, {
        permitClass: CONSTRUCTION,
      });
      expect(matches.some((m) => m.trade_slug === 'realtor'), `${f.permit_type} (${f.scope_tags}) leaked realtor`).toBe(false);
    }
  });
});
