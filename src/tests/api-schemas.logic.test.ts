// 🔗 SPEC LINK: docs/specs/product/future/70_lead_feed.md §API Endpoints
import { describe, it, expect } from 'vitest';
import {
  leadFeedQuerySchema,
  leadViewBodySchema,
} from '@/features/leads/api/schemas';
import { MAX_FEED_LIMIT, DEFAULT_FEED_LIMIT } from '@/features/leads/lib/get-lead-feed';
import { MAX_RADIUS_KM, DEFAULT_RADIUS_KM } from '@/features/leads/lib/distance';

// ---------------------------------------------------------------------------
// leadFeedQuerySchema
// ---------------------------------------------------------------------------

describe('leadFeedQuerySchema', () => {
  it('parses valid full query (string inputs from URL)', () => {
    const result = leadFeedQuerySchema.parse({
      lat: '43.65',
      lng: '-79.38',
      trade_slug: 'plumbing',
      radius_km: '5',
      limit: '10',
    });
    expect(result.lat).toBe(43.65);
    expect(result.lng).toBe(-79.38);
    expect(result.trade_slug).toBe('plumbing');
    expect(result.radius_km).toBe(5);
    expect(result.limit).toBe(10);
  });

  it('applies default radius_km when omitted', () => {
    const result = leadFeedQuerySchema.parse({
      lat: '43.65',
      lng: '-79.38',
      trade_slug: 'plumbing',
    });
    expect(result.radius_km).toBe(DEFAULT_RADIUS_KM);
  });

  it('applies default limit when omitted', () => {
    const result = leadFeedQuerySchema.parse({
      lat: '43.65',
      lng: '-79.38',
      trade_slug: 'plumbing',
    });
    expect(result.limit).toBe(DEFAULT_FEED_LIMIT);
  });

  it('rejects lat > 90', () => {
    expect(() => leadFeedQuerySchema.parse({ lat: '91', lng: '-79.38', trade_slug: 'plumbing' })).toThrow();
  });

  it('rejects lat < -90', () => {
    expect(() => leadFeedQuerySchema.parse({ lat: '-91', lng: '-79.38', trade_slug: 'plumbing' })).toThrow();
  });

  it('rejects lng > 180', () => {
    expect(() => leadFeedQuerySchema.parse({ lat: '43.65', lng: '181', trade_slug: 'plumbing' })).toThrow();
  });

  it('rejects lng < -180', () => {
    expect(() => leadFeedQuerySchema.parse({ lat: '43.65', lng: '-181', trade_slug: 'plumbing' })).toThrow();
  });

  it('rejects radius_km > MAX_RADIUS_KM', () => {
    expect(() =>
      leadFeedQuerySchema.parse({ lat: '43.65', lng: '-79.38', trade_slug: 'plumbing', radius_km: String(MAX_RADIUS_KM + 1) }),
    ).toThrow();
  });

  it('rejects radius_km <= 0', () => {
    expect(() =>
      leadFeedQuerySchema.parse({ lat: '43.65', lng: '-79.38', trade_slug: 'plumbing', radius_km: '0' }),
    ).toThrow();
  });

  it('rejects limit > MAX_FEED_LIMIT', () => {
    expect(() =>
      leadFeedQuerySchema.parse({ lat: '43.65', lng: '-79.38', trade_slug: 'plumbing', limit: String(MAX_FEED_LIMIT + 1) }),
    ).toThrow();
  });

  it('rejects limit <= 0', () => {
    expect(() =>
      leadFeedQuerySchema.parse({ lat: '43.65', lng: '-79.38', trade_slug: 'plumbing', limit: '0' }),
    ).toThrow();
  });

  it('rejects empty trade_slug', () => {
    expect(() => leadFeedQuerySchema.parse({ lat: '43.65', lng: '-79.38', trade_slug: '' })).toThrow();
  });

  it('accepts full cursor triple', () => {
    const result = leadFeedQuerySchema.parse({
      lat: '43.65',
      lng: '-79.38',
      trade_slug: 'plumbing',
      cursor_score: '75',
      cursor_lead_type: 'permit',
      cursor_lead_id: '24 101234:01',
    });
    expect(result.cursor_score).toBe(75);
    expect(result.cursor_lead_type).toBe('permit');
    expect(result.cursor_lead_id).toBe('24 101234:01');
  });

  it('rejects partial cursor (score only)', () => {
    expect(() =>
      leadFeedQuerySchema.parse({
        lat: '43.65',
        lng: '-79.38',
        trade_slug: 'plumbing',
        cursor_score: '75',
      }),
    ).toThrow();
  });

  it('rejects partial cursor (missing lead_id)', () => {
    expect(() =>
      leadFeedQuerySchema.parse({
        lat: '43.65',
        lng: '-79.38',
        trade_slug: 'plumbing',
        cursor_score: '75',
        cursor_lead_type: 'permit',
      }),
    ).toThrow();
  });

  it('rejects invalid cursor_lead_type', () => {
    expect(() =>
      leadFeedQuerySchema.parse({
        lat: '43.65',
        lng: '-79.38',
        trade_slug: 'plumbing',
        cursor_score: '75',
        cursor_lead_type: 'something_else',
        cursor_lead_id: 'id',
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// leadViewBodySchema
// ---------------------------------------------------------------------------

describe('leadViewBodySchema', () => {
  it('parses a permit view body', () => {
    const result = leadViewBodySchema.parse({
      trade_slug: 'plumbing',
      action: 'view',
      lead_type: 'permit',
      permit_num: '24 101234',
      revision_num: '01',
    });
    expect(result.trade_slug).toBe('plumbing');
    expect(result.action).toBe('view');
    expect(result.lead_type).toBe('permit');
  });

  it('parses a builder save body', () => {
    const result = leadViewBodySchema.parse({
      trade_slug: 'plumbing',
      action: 'save',
      lead_type: 'builder',
      entity_id: 9183,
    });
    expect(result.lead_type).toBe('builder');
  });

  it('parses an unsave action', () => {
    const result = leadViewBodySchema.parse({
      trade_slug: 'plumbing',
      action: 'unsave',
      lead_type: 'permit',
      permit_num: '24 101234',
      revision_num: '01',
    });
    expect(result.action).toBe('unsave');
  });

  it('rejects an invalid action', () => {
    expect(() =>
      leadViewBodySchema.parse({
        trade_slug: 'plumbing',
        action: 'click',
        lead_type: 'permit',
        permit_num: '24 101234',
        revision_num: '01',
      }),
    ).toThrow();
  });

  it('rejects permit lead missing revision_num', () => {
    expect(() =>
      leadViewBodySchema.parse({
        trade_slug: 'plumbing',
        action: 'view',
        lead_type: 'permit',
        permit_num: '24 101234',
      }),
    ).toThrow();
  });

  it('rejects builder lead missing entity_id', () => {
    expect(() =>
      leadViewBodySchema.parse({
        trade_slug: 'plumbing',
        action: 'view',
        lead_type: 'builder',
      }),
    ).toThrow();
  });

  it('rejects empty trade_slug', () => {
    expect(() =>
      leadViewBodySchema.parse({
        trade_slug: '',
        action: 'view',
        lead_type: 'permit',
        permit_num: '24 101234',
        revision_num: '01',
      }),
    ).toThrow();
  });

  it('rejects entity_id of 0 or negative', () => {
    expect(() =>
      leadViewBodySchema.parse({
        trade_slug: 'plumbing',
        action: 'view',
        lead_type: 'builder',
        entity_id: 0,
      }),
    ).toThrow();
  });

  it('rejects unknown lead_type discriminator', () => {
    expect(() =>
      leadViewBodySchema.parse({
        trade_slug: 'plumbing',
        action: 'view',
        lead_type: 'mystery',
      }),
    ).toThrow();
  });

  it('rejects entity_id on a permit branch (strict XOR)', () => {
    // Regression: without .strict() Zod silently strips entity_id from the
    // permit branch instead of rejecting it. Adversarial review caught the
    // misleading "fails parsing" comment in fcbe04a; this test locks the
    // strict behavior in.
    expect(() =>
      leadViewBodySchema.parse({
        trade_slug: 'plumbing',
        action: 'view',
        lead_type: 'permit',
        permit_num: '24 101234',
        revision_num: '01',
        entity_id: 9183,
      }),
    ).toThrow();
  });

  it('rejects permit_num on a builder branch (strict XOR)', () => {
    expect(() =>
      leadViewBodySchema.parse({
        trade_slug: 'plumbing',
        action: 'view',
        lead_type: 'builder',
        entity_id: 9183,
        permit_num: '24 101234',
      }),
    ).toThrow();
  });

  it('rejects unknown extra keys on either branch (strict)', () => {
    expect(() =>
      leadViewBodySchema.parse({
        trade_slug: 'plumbing',
        action: 'view',
        lead_type: 'permit',
        permit_num: '24 101234',
        revision_num: '01',
        unexpected_field: 'should be rejected',
      }),
    ).toThrow();
  });

  it('rejects entity_id > PostgreSQL INT max (2^31-1)', () => {
    expect(() =>
      leadViewBodySchema.parse({
        trade_slug: 'plumbing',
        action: 'view',
        lead_type: 'builder',
        entity_id: 2147483648,
      }),
    ).toThrow();
  });
});
