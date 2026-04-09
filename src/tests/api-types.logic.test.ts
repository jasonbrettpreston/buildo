// 🔗 SPEC LINK: docs/specs/product/future/75_lead_feed_implementation_guide.md §2 + Phase 3-i review
//
// Tests for the client-side types module — specifically the tightened
// `isLeadApiError` guard (Phase 3-i adversarial review fix). The
// pre-fix guard was too loose: it checked only `error.code` and
// returned true for random JSON that happened to contain an `error`
// key. The tightened guard validates the full envelope shape:
//   { data: null, error: { code: string, message: string, ... }, meta: null }

import { describe, expect, it } from 'vitest';
import { isLeadApiError, LeadApiClientError } from '@/features/leads/api/types';

describe('isLeadApiError — full envelope shape guard (Phase 3-i review fix)', () => {
  it('accepts a well-formed error envelope', () => {
    const body = {
      data: null,
      error: { code: 'VALIDATION_FAILED', message: 'lat must be finite' },
      meta: null,
    };
    expect(isLeadApiError(body)).toBe(true);
  });

  it('accepts an error envelope with optional details field', () => {
    const body = {
      data: null,
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Invalid input',
        details: { lat: 'must be a number' },
      },
      meta: null,
    };
    expect(isLeadApiError(body)).toBe(true);
  });

  it('REJECTS a success envelope (data: [], error: null, meta: {...})', () => {
    const body = {
      data: [{ id: 'x' }],
      error: null,
      meta: { count: 1 },
    };
    expect(isLeadApiError(body)).toBe(false);
  });

  it('REJECTS random JSON that happens to contain an `error` key', () => {
    // Pre-fix, this would return true because the loose check only
    // validated `error.code` as a string. The tightened guard
    // requires `data: null && meta: null` too.
    const body = {
      data: { hello: 'world' },
      error: { code: 'FOO', message: 'bar' },
      meta: { something: 'else' },
    };
    expect(isLeadApiError(body)).toBe(false);
  });

  it('REJECTS envelope with error.code as number (not string)', () => {
    const body = {
      data: null,
      error: { code: 429, message: 'Too many requests' },
      meta: null,
    };
    expect(isLeadApiError(body)).toBe(false);
  });

  it('REJECTS envelope missing error.message', () => {
    const body = {
      data: null,
      error: { code: 'FOO' },
      meta: null,
    };
    expect(isLeadApiError(body)).toBe(false);
  });

  it('REJECTS null', () => {
    expect(isLeadApiError(null)).toBe(false);
  });

  it('REJECTS undefined', () => {
    expect(isLeadApiError(undefined)).toBe(false);
  });

  it('REJECTS primitives', () => {
    expect(isLeadApiError('error')).toBe(false);
    expect(isLeadApiError(42)).toBe(false);
    expect(isLeadApiError(true)).toBe(false);
  });

  it('REJECTS envelope with error: null (success body with nullable error)', () => {
    const body = { data: null, error: null, meta: null };
    expect(isLeadApiError(body)).toBe(false);
  });
});

describe('LeadApiClientError', () => {
  it('carries the code, message, and optional details fields', () => {
    const err = new LeadApiClientError('RATE_LIMITED', 'Too many', { retryAfter: 60 });
    expect(err.code).toBe('RATE_LIMITED');
    expect(err.message).toBe('Too many');
    expect(err.details).toEqual({ retryAfter: 60 });
    expect(err.name).toBe('LeadApiClientError');
    expect(err).toBeInstanceOf(Error);
  });
});
