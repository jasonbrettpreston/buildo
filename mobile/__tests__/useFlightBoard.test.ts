/** @jest-environment node */
// Jest tests — useFlightBoard hook: Zod schema validation for FlightBoardResultSchema
// SPEC LINK: docs/specs/03-mobile/77_mobile_crm_flight_board.md §5 State & API Flow
import { FlightBoardResultSchema, FlightBoardItemSchema } from '@/lib/schemas';
import { ZodError } from 'zod';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const validItem = {
  permit_num: '23-145678-BLD',
  revision_num: '00',
  address: '123 Main St',
  lifecycle_phase: 'P7a',
  lifecycle_stalled: false,
  predicted_start: '2026-05-15',
  p25_days: -10,
  p75_days: 20,
  temporal_group: 'departing_soon',
  // Spec 77 §3.2 — drives the amber update flash via flightBoardSeenStore.
  updated_at: '2026-05-01T12:00:00Z',
};

const validResult = {
  data: [validItem],
};

// ---------------------------------------------------------------------------
// FlightBoardItemSchema
// ---------------------------------------------------------------------------

describe('FlightBoardItemSchema', () => {
  it('parses a valid item', () => {
    expect(FlightBoardItemSchema.safeParse(validItem).success).toBe(true);
  });

  it('accepts temporal_group: "action_required"', () => {
    expect(
      FlightBoardItemSchema.safeParse({ ...validItem, temporal_group: 'action_required' }).success,
    ).toBe(true);
  });

  it('accepts temporal_group: "on_the_horizon"', () => {
    expect(
      FlightBoardItemSchema.safeParse({ ...validItem, temporal_group: 'on_the_horizon' }).success,
    ).toBe(true);
  });

  it('rejects invalid temporal_group', () => {
    expect(
      FlightBoardItemSchema.safeParse({ ...validItem, temporal_group: 'soon' }).success,
    ).toBe(false);
  });

  it('accepts null predicted_start', () => {
    expect(
      FlightBoardItemSchema.safeParse({ ...validItem, predicted_start: null }).success,
    ).toBe(true);
  });

  it('accepts null lifecycle_phase', () => {
    expect(
      FlightBoardItemSchema.safeParse({ ...validItem, lifecycle_phase: null }).success,
    ).toBe(true);
  });

  it('accepts null p25_days and p75_days', () => {
    expect(
      FlightBoardItemSchema.safeParse({ ...validItem, p25_days: null, p75_days: null }).success,
    ).toBe(true);
  });

  it('rejects missing permit_num', () => {
    const { permit_num: _omit, ...without } = validItem as Record<string, unknown>;
    const result = FlightBoardItemSchema.safeParse(without);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.includes('permit_num'));
      expect(issue).toBeDefined();
    }
  });

  it('requires lifecycle_stalled to be boolean', () => {
    expect(
      FlightBoardItemSchema.safeParse({ ...validItem, lifecycle_stalled: 'yes' }).success,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// FlightBoardResultSchema
// ---------------------------------------------------------------------------

describe('FlightBoardResultSchema', () => {
  it('parses a valid result with one item', () => {
    expect(FlightBoardResultSchema.safeParse(validResult).success).toBe(true);
  });

  it('parses an empty data array', () => {
    expect(FlightBoardResultSchema.safeParse({ data: [] }).success).toBe(true);
  });

  it('rejects missing data array', () => {
    expect(FlightBoardResultSchema.safeParse({}).success).toBe(false);
  });

  it('rejects when data is not an array', () => {
    expect(FlightBoardResultSchema.safeParse({ data: validItem }).success).toBe(false);
  });

  it('throws ZodError with .issues on invalid payload', () => {
    expect(() => FlightBoardResultSchema.parse({ data: 'wrong' })).toThrow(ZodError);
    try {
      FlightBoardResultSchema.parse({ data: 'wrong' });
    } catch (err) {
      if (err instanceof ZodError) {
        expect(Array.isArray(err.issues)).toBe(true);
        expect(err.issues.length).toBeGreaterThan(0);
        expect(err.issues[0]).toHaveProperty('path');
        expect(err.issues[0]).toHaveProperty('message');
      }
    }
  });

  it('propagates item-level validation failures', () => {
    const badItem = { ...validItem, temporal_group: 'unknown_group' };
    expect(FlightBoardResultSchema.safeParse({ data: [badItem] }).success).toBe(false);
  });
});
