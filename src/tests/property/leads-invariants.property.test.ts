// 🔗 SPEC LINK: docs/specs/00_engineering_standards.md §12.12 Property-based tests
//
// fast-check property tests for the pure functions in src/features/leads/lib/.
// Each invariant is a math statement that the function MUST satisfy for ALL
// inputs of the declared type. fast-check generates random inputs, runs the
// invariant, and shrinks any failing case to the smallest counterexample.
//
// Why these specific invariants:
//   - Phase 0+1+2 holistic review caught fit_score=23 overflowing the 0-100
//     ceiling — a `forAll(input => relevance <= 100)` would have flagged it
//     in seconds. Same for buildLeadKey '0' vs '00' drift.
//   - Snapshot-style tests like `expect(result).toBe(20)` lock the value
//     but not the property. Property tests lock the relationship.
//
// Per spec 70 §4 Behavioral Contract + spec 72 cost model + the Phase 2
// holistic review fixes (commits 0a3e680, 449fb2a).

import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';

import {
  buildLeadKey,
  type RecordLeadViewInput,
} from '@/features/leads/lib/record-lead-view';
import {
  formatDistanceForDisplay,
  MAX_RADIUS_KM,
  metersFromKilometers,
  kilometersFromMeters,
} from '@/features/leads/lib/distance';
import {
  estimateCost,
  type CostModelPermitInput,
  type CostModelFootprintInput,
  type CostModelNeighbourhoodInput,
} from '@/features/leads/lib/cost-model';

// ---------------------------------------------------------------------------
// Arbitraries — fast-check generators tailored to the lib's input shapes
// ---------------------------------------------------------------------------

const permitNumArb = fc
  .tuple(
    fc.integer({ min: 20, max: 25 }),
    fc.integer({ min: 100000, max: 999999 }),
  )
  .map(([yr, num]) => `${yr} ${num}`);

// Revision number is the bug class we're locking: DB has both '0' and '00'.
// Generate single-digit and double-digit forms.
const revisionNumArb = fc.oneof(
  fc.constantFrom('0', '00', '01', '02', '03', '10', '99'),
);

const tradeSlugArb = fc.constantFrom(
  'plumbing',
  'electrical',
  'hvac',
  'framing',
  'roofing',
);

const userIdArb = fc.string({ minLength: 5, maxLength: 50 }).filter(
  (s) => /^[a-zA-Z0-9_-]+$/.test(s),
);

const permitInputArb: fc.Arbitrary<RecordLeadViewInput> = fc.record({
  user_id: userIdArb,
  trade_slug: tradeSlugArb,
  action: fc.constantFrom('view', 'save', 'unsave'),
  lead_type: fc.constant('permit' as const),
  permit_num: permitNumArb,
  revision_num: revisionNumArb,
});

const builderInputArb: fc.Arbitrary<RecordLeadViewInput> = fc.record({
  user_id: userIdArb,
  trade_slug: tradeSlugArb,
  action: fc.constantFrom('view', 'save', 'unsave'),
  lead_type: fc.constant('builder' as const),
  entity_id: fc.integer({ min: 1, max: 999_999 }),
});

const finiteMetersArb = fc.double({
  min: 0,
  max: 200_000,
  noNaN: true,
});

const costModelPermitArb: fc.Arbitrary<CostModelPermitInput> = fc.record({
  permit_num: permitNumArb,
  revision_num: revisionNumArb,
  permit_type: fc.constantFrom(
    'New House',
    'Addition/Alteration',
    'Interior Alteration',
    'New Building',
  ),
  structure_type: fc.option(
    fc.constantFrom('SFD', 'Semi/Town', 'Multi-Res'),
    { nil: null },
  ),
  work: fc.option(fc.constantFrom('Renovation', 'New', 'Demolition'), { nil: null }),
  est_const_cost: fc.option(fc.double({ min: 0, max: 5_000_000, noNaN: true }), {
    nil: null,
  }),
  scope_tags: fc.array(
    fc.constantFrom('pool', 'underpinning', 'elevator', 'kitchen'),
    { maxLength: 4 },
  ),
  dwelling_units_created: fc.option(fc.integer({ min: 0, max: 50 }), { nil: null }),
  storeys: fc.option(fc.integer({ min: 1, max: 30 }), { nil: null }),
});

const footprintArb: fc.Arbitrary<CostModelFootprintInput> = fc.record({
  footprint_area_sqm: fc.option(fc.double({ min: 50, max: 5000, noNaN: true }), {
    nil: null,
  }),
  estimated_stories: fc.option(fc.integer({ min: 1, max: 4 }), { nil: null }),
});

const neighbourhoodArb: fc.Arbitrary<CostModelNeighbourhoodInput> = fc.record({
  avg_household_income: fc.option(
    fc.integer({ min: 30_000, max: 250_000 }),
    { nil: null },
  ),
  tenure_renter_pct: fc.option(fc.double({ min: 0, max: 100, noNaN: true }), {
    nil: null,
  }),
});

// ---------------------------------------------------------------------------
// Invariants
// ---------------------------------------------------------------------------

describe('buildLeadKey — property invariants', () => {
  it('idempotent under revision_num zero-padding ("0" produces same key as "00")', () => {
    fc.assert(
      fc.property(
        permitNumArb,
        userIdArb,
        tradeSlugArb,
        (permit_num, user_id, trade_slug) => {
          const single: RecordLeadViewInput = {
            user_id,
            trade_slug,
            action: 'view',
            lead_type: 'permit',
            permit_num,
            revision_num: '0',
          };
          const double: RecordLeadViewInput = { ...single, revision_num: '00' };
          return buildLeadKey(single) === buildLeadKey(double);
        },
      ),
    );
  });

  it('always normalizes 1-digit revision to 2-digit zero-padded form', () => {
    fc.assert(
      fc.property(permitNumArb, userIdArb, tradeSlugArb, (permit_num, user_id, trade_slug) => {
        const input: RecordLeadViewInput = {
          user_id,
          trade_slug,
          action: 'view',
          lead_type: 'permit',
          permit_num,
          revision_num: '0',
        };
        const key = buildLeadKey(input);
        // Last segment after the second `:` must be 2 digits.
        const parts = key.split(':');
        const rev = parts[parts.length - 1];
        return rev?.length === 2 && rev === '00';
      }),
    );
  });

  it('permit and builder keys never collide (disjoint prefixes)', () => {
    fc.assert(
      fc.property(permitInputArb, builderInputArb, (permit, builder) => {
        const pk = buildLeadKey(permit);
        const bk = buildLeadKey(builder);
        return pk.startsWith('permit:') && bk.startsWith('builder:') && pk !== bk;
      }),
    );
  });

  it('builder lead key contains exactly the entity_id and nothing else', () => {
    fc.assert(
      fc.property(builderInputArb, (builder) => {
        if (builder.lead_type !== 'builder') return true;
        return buildLeadKey(builder) === `builder:${builder.entity_id}`;
      }),
    );
  });
});

describe('distance — formatDistanceForDisplay invariants', () => {
  it('always returns a non-empty string for finite, non-negative meters', () => {
    fc.assert(
      fc.property(finiteMetersArb, (meters) => {
        const out = formatDistanceForDisplay(meters);
        return typeof out === 'string' && out.length > 0;
      }),
    );
  });

  it('returns the placeholder "—" for NaN, Infinity, and negative inputs', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(Number.NaN),
          fc.constant(Number.POSITIVE_INFINITY),
          fc.constant(Number.NEGATIVE_INFINITY),
          fc.double({ min: -1_000_000, max: -0.001, noNaN: true }),
        ),
        (bad) => formatDistanceForDisplay(bad) === '—',
      ),
    );
  });

  it('parses back to a value monotonically non-decreasing in the input meters', () => {
    // The km/m boundary should not produce a discontinuity where format(999)
    // > format(1000) when re-parsed back to a number. This locks the
    // 999.9m → 1.0km regression class from Phase 1b-i.
    fc.assert(
      fc.property(
        finiteMetersArb,
        finiteMetersArb,
        (a, b) => {
          const lo = Math.min(a, b);
          const hi = Math.max(a, b);
          const parseDisplay = (s: string): number => {
            if (s.endsWith('km')) return Number.parseFloat(s.slice(0, -2)) * 1000;
            if (s.endsWith('m')) return Number.parseFloat(s.slice(0, -1));
            return Number.NaN;
          };
          const loVal = parseDisplay(formatDistanceForDisplay(lo));
          const hiVal = parseDisplay(formatDistanceForDisplay(hi));
          // Allow up to 100m of rounding slack (whole-km buckets at >=10km).
          return hiVal + 100 >= loVal;
        },
      ),
    );
  });

  it('km/m unit conversions are exact inverses', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.001, max: MAX_RADIUS_KM, noNaN: true }), (km) => {
        const m = metersFromKilometers(km);
        const back = kilometersFromMeters(m);
        return Math.abs(back - km) < 1e-9;
      }),
    );
  });
});

describe('cost-model — estimateCost invariants', () => {
  it('returned cost_tier is always one of the spec-allowed enum values (or null for unknown area)', () => {
    const allowed = new Set<string | null>([
      'mega',
      'major',
      'large',
      'medium',
      'small',
      null,
    ]);
    fc.assert(
      fc.property(
        costModelPermitArb,
        fc.option(footprintArb, { nil: null }),
        fc.option(neighbourhoodArb, { nil: null }),
        (permit, footprint, neighbourhood) => {
          const result = estimateCost(permit, null, footprint, neighbourhood);
          return allowed.has(result.cost_tier);
        },
      ),
    );
  });

  it('estimated_cost is null IFF cost_tier is null (consistent unknown signal)', () => {
    fc.assert(
      fc.property(
        costModelPermitArb,
        fc.option(footprintArb, { nil: null }),
        fc.option(neighbourhoodArb, { nil: null }),
        (permit, footprint, neighbourhood) => {
          const result = estimateCost(permit, null, footprint, neighbourhood);
          if (result.estimated_cost === null) return result.cost_tier === null;
          return result.cost_tier !== null;
        },
      ),
    );
  });

  it('premium_factor is always within the spec 72 range [1.0, 2.0] when set', () => {
    fc.assert(
      fc.property(
        costModelPermitArb,
        fc.option(footprintArb, { nil: null }),
        fc.option(neighbourhoodArb, { nil: null }),
        (permit, footprint, neighbourhood) => {
          const result = estimateCost(permit, null, footprint, neighbourhood);
          if (result.premium_factor === null) return true;
          return result.premium_factor >= 1.0 && result.premium_factor <= 2.0;
        },
      ),
    );
  });
});
