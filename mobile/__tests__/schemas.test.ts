/** @jest-environment node */
// Jest tests — Zod schema parsing for all API response types (Phase 2)
// SPEC LINK: docs/specs/03-mobile/90_mobile_engineering_protocol.md §Zod Boundary
import {
  PermitLeadFeedItemSchema,
  BuilderLeadFeedItemSchema,
  LeadFeedItemSchema,
  LeadFeedResultSchema,
} from '@/lib/schemas';
import { ZodError } from 'zod';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const validPermitLead = {
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
  lifecycle_phase: 'structural',
  lifecycle_stalled: false,
};

const validBuilderLead = {
  lead_id: 'builder-42',
  lead_type: 'builder',
  distance_m: 800,
  proximity_score: 20,
  timing_score: 18,
  value_score: 12,
  opportunity_score: 10,
  relevance_score: 60,
  timing_confidence: 'medium',
  opportunity_type: 'newbuild',
  timing_display: '4–8 weeks',
  is_saved: true,
  entity_id: 42,
  legal_name: 'ABC Construction Inc.',
  business_size: 'medium',
  primary_phone: '416-555-1234',
  primary_email: null,
  website: null,
  photo_url: null,
  active_permits_nearby: 3,
  avg_project_cost: 250000,
};

// ---------------------------------------------------------------------------
// PermitLeadFeedItemSchema
// ---------------------------------------------------------------------------

describe('PermitLeadFeedItemSchema', () => {
  it('parses a valid permit lead', () => {
    expect(PermitLeadFeedItemSchema.safeParse(validPermitLead).success).toBe(true);
  });

  it('infers lead_type as literal "permit"', () => {
    const result = PermitLeadFeedItemSchema.parse(validPermitLead);
    expect(result.lead_type).toBe('permit');
  });

  it('accepts null for all nullable fields', () => {
    const payload = {
      ...validPermitLead,
      neighbourhood_name: null,
      cost_tier: null,
      estimated_cost: null,
      lifecycle_phase: null,
      status: null,
      permit_type: null,
      description: null,
      street_num: null,
      street_name: null,
      latitude: null,
      longitude: null,
    };
    expect(PermitLeadFeedItemSchema.safeParse(payload).success).toBe(true);
  });

  it('rejects missing opportunity_score with a field-level Zod issue', () => {
    const { opportunity_score: _omit, ...withoutScore } = validPermitLead as Record<string, unknown>;
    const result = PermitLeadFeedItemSchema.safeParse(withoutScore);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(i => i.path.includes('opportunity_score'));
      expect(issue).toBeDefined();
    }
  });

  it('rejects lifecycle_stalled as a string instead of boolean', () => {
    const result = PermitLeadFeedItemSchema.safeParse({ ...validPermitLead, lifecycle_stalled: 'yes' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid timing_confidence value', () => {
    const result = PermitLeadFeedItemSchema.safeParse({ ...validPermitLead, timing_confidence: 'very-high' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid cost_tier value', () => {
    const result = PermitLeadFeedItemSchema.safeParse({ ...validPermitLead, cost_tier: 'gigantic' });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// BuilderLeadFeedItemSchema
// ---------------------------------------------------------------------------

describe('BuilderLeadFeedItemSchema', () => {
  it('parses a valid builder lead', () => {
    expect(BuilderLeadFeedItemSchema.safeParse(validBuilderLead).success).toBe(true);
  });

  it('rejects negative active_permits_nearby', () => {
    const result = BuilderLeadFeedItemSchema.safeParse({ ...validBuilderLead, active_permits_nearby: -1 });
    expect(result.success).toBe(false);
  });

  it('accepts null for nullable contact fields', () => {
    const payload = {
      ...validBuilderLead,
      primary_phone: null,
      website: null,
      photo_url: null,
      avg_project_cost: null,
      business_size: null,
    };
    expect(BuilderLeadFeedItemSchema.safeParse(payload).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// LeadFeedItemSchema — discriminated union
// ---------------------------------------------------------------------------

describe('LeadFeedItemSchema (discriminated union)', () => {
  it('routes lead_type: "permit" to the permit branch', () => {
    const result = LeadFeedItemSchema.parse(validPermitLead);
    expect(result.lead_type).toBe('permit');
  });

  it('routes lead_type: "builder" to the builder branch', () => {
    const result = LeadFeedItemSchema.parse(validBuilderLead);
    expect(result.lead_type).toBe('builder');
  });

  it('rejects an unknown lead_type', () => {
    const result = LeadFeedItemSchema.safeParse({ ...validPermitLead, lead_type: 'coa' });
    expect(result.success).toBe(false);
  });

  it('rejects an empty object', () => {
    expect(LeadFeedItemSchema.safeParse({}).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// LeadFeedResultSchema — full API response
// ---------------------------------------------------------------------------

describe('LeadFeedResultSchema', () => {
  it('parses a feed response with mixed permit + builder leads', () => {
    const payload = {
      data: [validPermitLead, validBuilderLead],
      meta: { next_cursor: null, count: 2, radius_km: 10 },
    };
    expect(LeadFeedResultSchema.safeParse(payload).success).toBe(true);
  });

  it('parses a feed response with a non-null cursor', () => {
    const payload = {
      data: [],
      meta: {
        next_cursor: { score: 75, lead_type: 'permit', lead_id: 'permit-123--01' },
        count: 0,
        radius_km: 10,
      },
    };
    expect(LeadFeedResultSchema.safeParse(payload).success).toBe(true);
  });

  it('rejects an empty object — missing data + meta', () => {
    expect(LeadFeedResultSchema.safeParse({}).success).toBe(false);
  });

  it('ZodError has .issues array with path + message on parse failure', () => {
    expect(() => LeadFeedResultSchema.parse({})).toThrow(ZodError);
    try {
      LeadFeedResultSchema.parse({});
    } catch (err) {
      expect(err).toBeInstanceOf(ZodError);
      if (err instanceof ZodError) {
        expect(Array.isArray(err.issues)).toBe(true);
        expect(err.issues.length).toBeGreaterThan(0);
        expect(err.issues[0]).toHaveProperty('path');
        expect(err.issues[0]).toHaveProperty('message');
      }
    }
  });
});
