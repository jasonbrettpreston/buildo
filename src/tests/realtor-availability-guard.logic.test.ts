// 🔗 SPEC LINK: docs/specs/03-mobile/91_mobile_lead_feed.md §3.5 (realtor wire-up)
//             docs/specs/01-pipeline/41_chain_permits.md (step 13: classify-permits)
//             docs/specs/01-pipeline/47_pipeline_script_protocol.md §R5 (startup guards)
//
// Logic test for the realtor-availability startup guard. Bug: the
// classifier's appendRealtorMatch helper writes permit_trades rows
// with trade_id=33 unconditionally. If migration 118 (which seeds
// trades.id=33 + trade_configurations.realtor) hasn't been applied,
// the FK constraint `permit_trades_trade_id_fkey` fires and crashes
// the entire classify-permits pipeline.
//
// Fix: at startup, query trades for id=33; cache the result. The
// helper accepts a `realtorAvailable` option — when false, it returns
// the matches array unchanged (no-op). Pipeline completes with
// construction-trade classification only; realtor classification is
// disabled until migration 118 is applied.
//
// Tests cover:
//   - The TS classifier's appendRealtorMatch is a no-op when realtorAvailable=false
//   - The TS classifier's appendRealtorMatch appends a realtor match when realtorAvailable=true (default — preserves Cycle 7 behavior)
//   - The pure helper checkRealtorAvailable returns true on row found, false on missing, false on query error

import { describe, it, expect, vi } from 'vitest';
import type { Permit, TradeMappingRule } from '@/lib/permits/types';
import { classifyPermit } from '@/lib/classification/classifier';

// Mock permit fixture — minimal shape the classifier needs.
const minimalPermit: Partial<Permit> = {
  permit_num: '25 122754 BLD',
  revision_num: '00',
  permit_type: 'Small Residential Projects',
  structure_type: 'SFD - Detached',
  work: 'Multiple Projects',
  description: 'Second storey addition + porch',
  status: 'Inspection',
  est_const_cost: 250000,
  issued_date: new Date('2025-06-17'),
};

const noRules: TradeMappingRule[] = [];

describe('classifyPermit — realtorAvailable option (WF3 startup-guard)', () => {
  it('appends a realtor TradeMatch when permitClass=construction (post WF2 #2)', () => {
    // WF2 #2 (2026-05-08): realtor append is now ALSO gated on
    // `permitClass === 'construction'` (Spec 80 §5). All existing realtor
    // tests must pass `permitClass: 'construction'` explicitly to assert
    // the realtor-append behavior; the default `'unclassified'` returns []
    // (safe-skip) per the gating contract.
    const matches = classifyPermit(minimalPermit, noRules, undefined, {
      permitClass: 'construction',
    });
    const hasRealtor = matches.some((m) => m.trade_slug === 'realtor');
    expect(hasRealtor).toBe(true);
  });

  it('appends realtor when realtorAvailable=true and permitClass=construction', () => {
    const matches = classifyPermit(minimalPermit, noRules, undefined, {
      realtorAvailable: true,
      permitClass: 'construction',
    });
    const hasRealtor = matches.some((m) => m.trade_slug === 'realtor');
    expect(hasRealtor).toBe(true);
  });

  it('SKIPS realtor when realtorAvailable=false (the fix — pipeline survives missing migration 118)', () => {
    // The fix: callers can pass realtorAvailable=false to disable the
    // realtor append. Used by pipeline scripts when the trades.id=33
    // row is absent (migration 118 not deployed). Without this option
    // the FK constraint crashes the entire pipeline.
    const matches = classifyPermit(minimalPermit, noRules, undefined, {
      realtorAvailable: false,
      permitClass: 'construction',
    });
    const hasRealtor = matches.some((m) => m.trade_slug === 'realtor');
    expect(hasRealtor).toBe(false);
    // Construction-trade matches still produced (work-field fallback).
    // Asserting at least one non-realtor match is present so we know
    // the disabled-realtor case isn't silently emptying the array.
    expect(matches.length).toBeGreaterThan(0);
  });

  it('disabling realtor still allows construction-trade matches through unchanged', () => {
    const withRealtor = classifyPermit(minimalPermit, noRules, undefined, {
      permitClass: 'construction',
    });
    const withoutRealtor = classifyPermit(minimalPermit, noRules, undefined, {
      realtorAvailable: false,
      permitClass: 'construction',
    });
    // The non-realtor matches should be identical between the two calls.
    const withRealtorNonRealtor = withRealtor.filter((m) => m.trade_slug !== 'realtor');
    expect(withoutRealtor).toEqual(withRealtorNonRealtor);
  });
});

// ─── WF3 2026-05-09 — Sub-axes within construction class ─────────────────
//
// The realtor signal "home will be sold" only fires for residential structural
// permits without commercial scope. The construction-class bundle (mig 120,
// WF2 #1) was too coarse: included trade-only permits (PLB/MS/DSS) and
// demolition (DM). 75K rows on commercial-scoped permits ALSO got realtor.
// Sub-axes added: permit_type ∈ REALTOR_RELEVANT_TYPES + 'commercial' ∉ scope_tags.

describe('classifyPermit — realtor sub-gating (WF3 2026-05-09): permit_type and scope_tags axes', () => {
  it('Plumbing(PS) construction permit → NO realtor (trade-only fix permit)', () => {
    const plumbingPermit: Partial<Permit> = {
      ...minimalPermit,
      permit_type: 'Plumbing(PS)',
    };
    const matches = classifyPermit(plumbingPermit, noRules, undefined, {
      permitClass: 'construction',
    });
    expect(matches.some((m) => m.trade_slug === 'realtor')).toBe(false);
  });

  it('Mechanical(MS) construction permit → NO realtor (HVAC trade-only)', () => {
    const mechanicalPermit: Partial<Permit> = {
      ...minimalPermit,
      permit_type: 'Mechanical(MS)',
    };
    const matches = classifyPermit(mechanicalPermit, noRules, undefined, {
      permitClass: 'construction',
    });
    expect(matches.some((m) => m.trade_slug === 'realtor')).toBe(false);
  });

  it('Demolition Folder (DM) construction permit → NO realtor (the new build gets realtor instead)', () => {
    const demoPermit: Partial<Permit> = {
      ...minimalPermit,
      permit_type: 'Demolition Folder (DM)',
    };
    const matches = classifyPermit(demoPermit, noRules, undefined, {
      permitClass: 'construction',
    });
    expect(matches.some((m) => m.trade_slug === 'realtor')).toBe(false);
  });

  it('Non-Residential Building Permit construction permit → NO realtor (commercial)', () => {
    const nonResPermit: Partial<Permit> = {
      ...minimalPermit,
      permit_type: 'Non-Residential Building Permit',
    };
    const matches = classifyPermit(nonResPermit, noRules, undefined, {
      permitClass: 'construction',
    });
    expect(matches.some((m) => m.trade_slug === 'realtor')).toBe(false);
  });

  it('Building Additions/Alterations with commercial scope_tag → NO realtor (75K row class)', () => {
    const commercialAlteration: Partial<Permit> = {
      ...minimalPermit,
      permit_type: 'Building Additions/Alterations',
    };
    const matches = classifyPermit(commercialAlteration, noRules, ['commercial'], {
      permitClass: 'construction',
    });
    expect(matches.some((m) => m.trade_slug === 'realtor')).toBe(false);
  });

  it('mixed-use [residential, commercial] → NO realtor (commercial wins, fail-closed)', () => {
    const mixedPermit: Partial<Permit> = {
      ...minimalPermit,
      permit_type: 'New Houses',
    };
    const matches = classifyPermit(mixedPermit, noRules, ['residential', 'commercial'], {
      permitClass: 'construction',
    });
    expect(matches.some((m) => m.trade_slug === 'realtor')).toBe(false);
  });

  it('New Houses with residential scope_tag → realtor appended (the canonical pass case)', () => {
    const newHousePermit: Partial<Permit> = {
      ...minimalPermit,
      permit_type: 'New Houses',
    };
    const matches = classifyPermit(newHousePermit, noRules, ['residential'], {
      permitClass: 'construction',
    });
    expect(matches.some((m) => m.trade_slug === 'realtor')).toBe(true);
  });

  it('Small Residential Projects with no scope_tags → realtor appended (null is permissive)', () => {
    const smallResPermit: Partial<Permit> = {
      ...minimalPermit,
      permit_type: 'Small Residential Projects',
    };
    const matches = classifyPermit(smallResPermit, noRules, undefined, {
      permitClass: 'construction',
    });
    expect(matches.some((m) => m.trade_slug === 'realtor')).toBe(true);
  });
});

describe('checkRealtorAvailable helper — DB lookup with defensive failure mode', () => {
  // The helper lives at scripts/lib/pipeline-realtor-availability.js. We
  // require it via dynamic import per the existing pattern for testing
  // pipeline-script libs (e.g. classifier-paths.test.ts).

  it('returns true when trades has id=33 with slug=realtor', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { checkRealtorAvailable } = require('../../scripts/lib/pipeline-realtor-availability') as {
      checkRealtorAvailable: (pool: { query: (sql: string) => Promise<{ rows: Array<{ id: number; slug: string }> }> }) => Promise<boolean>;
    };
    const fakePool = {
      query: vi.fn().mockResolvedValue({ rows: [{ id: 33, slug: 'realtor' }] }),
    };
    const result = await checkRealtorAvailable(fakePool);
    expect(result).toBe(true);
    expect(fakePool.query).toHaveBeenCalledOnce();
  });

  it('returns false when trades has no id=33 row (migration 118 not deployed)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { checkRealtorAvailable } = require('../../scripts/lib/pipeline-realtor-availability') as {
      checkRealtorAvailable: (pool: { query: (sql: string) => Promise<{ rows: Array<unknown> }> }) => Promise<boolean>;
    };
    const fakePool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    };
    const result = await checkRealtorAvailable(fakePool);
    expect(result).toBe(false);
  });

  it('returns false (defensively) on query error — better to skip realtor than crash the pipeline', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { checkRealtorAvailable } = require('../../scripts/lib/pipeline-realtor-availability') as {
      checkRealtorAvailable: (pool: { query: (sql: string) => Promise<unknown> }) => Promise<boolean>;
    };
    const fakePool = {
      query: vi.fn().mockRejectedValue(new Error('connection lost')),
    };
    const result = await checkRealtorAvailable(fakePool);
    expect(result).toBe(false);
  });
});
