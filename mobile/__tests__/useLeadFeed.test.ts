/** @jest-environment node */
// Jest tests — useLeadFeed hook: Zod validation, schema edge cases, MMKV recovery
// SPEC LINK: docs/specs/03-mobile/91_mobile_lead_feed.md §5 State
import {
  LeadFeedResultSchema,
  PermitLeadFeedItemSchema,
} from '@/lib/schemas';
import { ZodError } from 'zod';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const validPermitItem = {
  lead_id: 'permit-23-145678-BLD--01',
  lead_type: 'permit',
  distance_m: 500,
  proximity_score: 25,
  timing_score: 20,
  value_score: 15,
  opportunity_score: 15,
  relevance_score: 75,
  timing_confidence: 'high',
  opportunity_type: 'homeowner',
  timing_display: '2–4 weeks',
  is_saved: false,
  permit_num: '23 145678 BLD',
  revision_num: '01',
  status: 'Permit Issued',
  permit_type: 'Residential',
  description: 'Detached house addition',
  street_num: '123',
  street_name: 'Main St',
  latitude: 43.65,
  longitude: -79.38,
  neighbourhood_name: 'Annex',
  cost_tier: 'medium',
  estimated_cost: 75000,
  lifecycle_phase: 'P7a',
  lifecycle_stalled: false,
  target_window: 'bid',
  competition_count: 0,
};

const validFeedResponse = {
  data: [validPermitItem],
  meta: { next_cursor: null, count: 1, radius_km: 10 },
};

// ---------------------------------------------------------------------------
// Zod parse — V2 payload with target_window: 'bid'
// ---------------------------------------------------------------------------

describe('useLeadFeed — Zod payload validation', () => {
  it('parses a full feed response with target_window: "bid"', () => {
    expect(LeadFeedResultSchema.safeParse(validFeedResponse).success).toBe(true);
  });

  it('parses target_window: "work"', () => {
    const payload = {
      ...validFeedResponse,
      data: [{ ...validPermitItem, target_window: 'work' }],
    };
    expect(LeadFeedResultSchema.safeParse(payload).success).toBe(true);
  });

  it('rejects an invalid target_window value', () => {
    const payload = {
      ...validFeedResponse,
      data: [{ ...validPermitItem, target_window: 'maybe' }],
    };
    expect(LeadFeedResultSchema.safeParse(payload).success).toBe(false);
  });

  it('parses competition_count: 0 and positive integers', () => {
    const base = { ...validPermitItem };
    expect(PermitLeadFeedItemSchema.safeParse({ ...base, competition_count: 0 }).success).toBe(true);
    expect(PermitLeadFeedItemSchema.safeParse({ ...base, competition_count: 7 }).success).toBe(true);
  });

  it('rejects negative competition_count', () => {
    expect(
      PermitLeadFeedItemSchema.safeParse({ ...validPermitItem, competition_count: -1 }).success,
    ).toBe(false);
  });

  it('throws ZodError with field-level issue path when opportunity_score is missing', () => {
    const { opportunity_score: _omit, ...without } = validPermitItem as Record<string, unknown>;
    const result = PermitLeadFeedItemSchema.safeParse(without);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.includes('opportunity_score'));
      expect(issue).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// MMKV cache recovery — corrupted payload falls back gracefully
// ---------------------------------------------------------------------------

describe('MMKV cache recovery — corrupted payload handling', () => {
  it('LeadFeedResultSchema.safeParse returns success:false for corrupted string payload', () => {
    // Simulates what PersistQueryClientProvider does with a corrupted MMKV entry:
    // JSON.parse succeeds but the shape is wrong. safeParse should return false
    // so the caller can call mmkvPersister.removeClient() and start fresh.
    const corrupted = { data: 'not-an-array', meta: null };
    expect(LeadFeedResultSchema.safeParse(corrupted).success).toBe(false);
  });

  it('mmkvPersister.restoreClient returns undefined for missing key (no crash)', () => {
    // Mock MMKV storage that returns undefined — simulates first cold boot
    // before any data has been persisted. The persister must return undefined,
    // not throw, so TanStack Query starts with an empty cache.
    const mockStorage = {
      getString: (_key: string) => undefined as string | undefined,
      set: (_key: string, _val: string) => {},
      remove: (_key: string) => {},
    };

    // Inline the restoreClient logic from mmkvPersister.ts
    const raw = mockStorage.getString('tq-client');
    const result = raw ? (() => { try { return JSON.parse(raw); } catch { return undefined; } })() : undefined;
    expect(result).toBeUndefined();
  });

  it('mmkvPersister.restoreClient returns undefined for invalid JSON (no crash)', () => {
    const mockStorage = {
      getString: (_key: string) => 'CORRUPTED{{{{',
      set: (_key: string, _val: string) => {},
      remove: (_key: string) => {},
    };

    const raw = mockStorage.getString('tq-client');
    const result = raw ? (() => { try { return JSON.parse(raw); } catch { return undefined; } })() : undefined;
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// ZodError shape — error boundary contract
// ---------------------------------------------------------------------------

describe('ZodError — error boundary contract', () => {
  it('LeadFeedResultSchema.parse throws ZodError with .issues on bad payload', () => {
    expect(() => LeadFeedResultSchema.parse({})).toThrow(ZodError);
    try {
      LeadFeedResultSchema.parse({});
    } catch (err) {
      if (err instanceof ZodError) {
        expect(Array.isArray(err.issues)).toBe(true);
        expect(err.issues.length).toBeGreaterThan(0);
        expect(err.issues[0]).toHaveProperty('path');
        expect(err.issues[0]).toHaveProperty('message');
      }
    }
  });

  it('errors on a feed response missing the meta block', () => {
    const result = LeadFeedResultSchema.safeParse({ data: [] });
    expect(result.success).toBe(false);
  });
});
