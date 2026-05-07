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
  it('appends a realtor TradeMatch by default (preserves Cycle 7 behavior)', () => {
    // Default behavior: when no `realtorAvailable` option is passed,
    // the classifier appends realtor as before. Tests with no realtor
    // option must still see realtor in the output.
    const matches = classifyPermit(minimalPermit, noRules);
    const hasRealtor = matches.some((m) => m.trade_slug === 'realtor');
    expect(hasRealtor).toBe(true);
  });

  it('appends realtor when realtorAvailable=true is explicitly passed', () => {
    const matches = classifyPermit(minimalPermit, noRules, undefined, {
      realtorAvailable: true,
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
    });
    const hasRealtor = matches.some((m) => m.trade_slug === 'realtor');
    expect(hasRealtor).toBe(false);
    // Construction-trade matches still produced (work-field fallback).
    // Asserting at least one non-realtor match is present so we know
    // the disabled-realtor case isn't silently emptying the array.
    expect(matches.length).toBeGreaterThan(0);
  });

  it('disabling realtor still allows construction-trade matches through unchanged', () => {
    const withRealtor = classifyPermit(minimalPermit, noRules);
    const withoutRealtor = classifyPermit(minimalPermit, noRules, undefined, {
      realtorAvailable: false,
    });
    // The non-realtor matches should be identical between the two calls.
    const withRealtorNonRealtor = withRealtor.filter((m) => m.trade_slug !== 'realtor');
    expect(withoutRealtor).toEqual(withRealtorNonRealtor);
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
