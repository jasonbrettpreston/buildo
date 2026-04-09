// 🔗 SPEC LINK: docs/specs/product/future/75_lead_feed_implementation_guide.md §2.1
//
// Smoke tests for the QueryClient singleton + persister wiring. We
// verify that the defaults match spec 75 §2.1 and that the singleton
// actually returns the same instance across calls.

import { afterEach, describe, expect, it } from 'vitest';
import {
  CACHE_BUSTER,
  CACHE_MAX_AGE_MS,
  __resetQueryClientForTests,
  createLeadsPersister,
  getQueryClient,
} from '@/features/leads/api/query-client';

afterEach(() => {
  __resetQueryClientForTests();
});

describe('getQueryClient — singleton + defaults', () => {
  it('returns the same instance on repeated calls', () => {
    const a = getQueryClient();
    const b = getQueryClient();
    expect(a).toBe(b);
  });

  it('default staleTime is 60 seconds (spec 75 §2.1)', () => {
    const client = getQueryClient();
    const defaults = client.getDefaultOptions();
    expect(defaults.queries?.staleTime).toBe(60_000);
  });

  it('default gcTime is 24 hours (must equal CACHE_MAX_AGE_MS so the persister contract holds)', () => {
    // The Phase 3-i adversarial review caught that a 5-minute gcTime
    // with 24h persistence was a real bug: queries evicted from
    // memory after 5 min would also be dropped from the persister's
    // next snapshot, defeating the offline promise. gcTime now
    // matches CACHE_MAX_AGE_MS.
    const client = getQueryClient();
    const defaults = client.getDefaultOptions();
    expect(defaults.queries?.gcTime).toBe(24 * 60 * 60 * 1000);
  });

  it('default gcTime equals CACHE_MAX_AGE_MS exactly (contract invariant)', () => {
    const client = getQueryClient();
    const defaults = client.getDefaultOptions();
    expect(defaults.queries?.gcTime).toBe(CACHE_MAX_AGE_MS);
  });

  it('default query retry is 1 (not the TanStack default of 3)', () => {
    const client = getQueryClient();
    const defaults = client.getDefaultOptions();
    expect(defaults.queries?.retry).toBe(1);
  });

  it('default mutation retry is 0 (save/unsave must not auto-retry)', () => {
    const client = getQueryClient();
    const defaults = client.getDefaultOptions();
    expect(defaults.mutations?.retry).toBe(0);
  });

  it('refetchOnWindowFocus is false (mobile battery)', () => {
    const client = getQueryClient();
    const defaults = client.getDefaultOptions();
    expect(defaults.queries?.refetchOnWindowFocus).toBe(false);
  });

  it('refetchOnReconnect is true (resume after offline)', () => {
    const client = getQueryClient();
    const defaults = client.getDefaultOptions();
    expect(defaults.queries?.refetchOnReconnect).toBe(true);
  });
});

describe('persister constants', () => {
  it('CACHE_MAX_AGE_MS is 24 hours (spec 75 §11 Phase 3)', () => {
    expect(CACHE_MAX_AGE_MS).toBe(24 * 60 * 60 * 1000);
  });

  it('CACHE_BUSTER is a non-empty string', () => {
    expect(typeof CACHE_BUSTER).toBe('string');
    expect(CACHE_BUSTER.length).toBeGreaterThan(0);
  });

  it('createLeadsPersister returns a persister with getItem/setItem/removeItem', () => {
    const p = createLeadsPersister();
    expect(p).toBeDefined();
    expect(typeof p.persistClient).toBe('function');
    expect(typeof p.restoreClient).toBe('function');
    expect(typeof p.removeClient).toBe('function');
  });
});
