/**
 * SPEC LINK: docs/specs/00-architecture/00_engineering_standards.md §2.2 (Try-Catch Boundary),
 *            docs/reports/bug_prevention_strategy.md §3 (withApiEnvelope)
 *
 * Tests for src/lib/api/with-api-envelope.ts — the HOF that wraps route handlers
 * to auto-catch uncaught exceptions, log them, and return a structured error envelope.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';

// Mock logError so we can verify it's called
vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
}));

import { logError } from '@/lib/logger';

function makeRequest(path = '/api/test'): NextRequest {
  return new NextRequest(`http://localhost${path}`);
}

describe('withApiEnvelope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes through a successful response unchanged', async () => {
    const handler = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: 'ok', error: null, meta: null }), { status: 200 }));
    const wrapped = withApiEnvelope(handler);
    const res = await wrapped(makeRequest());
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(logError).not.toHaveBeenCalled();
  });

  it('catches a generic thrown Error and returns 500 envelope', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('Something exploded'));
    const wrapped = withApiEnvelope(handler);
    const res = await wrapped(makeRequest());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.data).toBeNull();
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(body.error.message).toBe('An unexpected error occurred');
    expect(body.meta).toBeNull();
  });

  it('does NOT leak the raw error message to the client', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('db password is hunter2'));
    const wrapped = withApiEnvelope(handler);
    const res = await wrapped(makeRequest());
    const body = await res.json();
    expect(body.error.message).not.toContain('hunter2');
  });

  it('calls logError with the route context on any error', async () => {
    const cause = new Error('Kaboom');
    const handler = vi.fn().mockRejectedValue(cause);
    const wrapped = withApiEnvelope(handler);
    await wrapped(makeRequest('/api/leads'));
    expect(logError).toHaveBeenCalledTimes(1);
    const call = (logError as ReturnType<typeof vi.fn>).mock.calls[0] as unknown[];
    const [tag, err] = call;
    expect(tag).toBe('[api/envelope]');
    expect(err).toBe(cause);
  });

  it('sanitizes PostgreSQL errors (5-char SQLSTATE code) to DATABASE_ERROR', async () => {
    const pgError = Object.assign(new Error('relation "foo" does not exist'), { code: '42P01' });
    const handler = vi.fn().mockRejectedValue(pgError);
    const wrapped = withApiEnvelope(handler);
    const res = await wrapped(makeRequest());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe('DATABASE_ERROR');
    expect(body.error.message).toBe('A database error occurred');
  });

  it('does not swallow non-PG errors as DATABASE_ERROR', async () => {
    const nonPgError = Object.assign(new Error('not found'), { code: 'ENOENT' });
    const handler = vi.fn().mockRejectedValue(nonPgError);
    const wrapped = withApiEnvelope(handler);
    const res = await wrapped(makeRequest());
    const body = await res.json();
    expect(body.error.code).toBe('INTERNAL_ERROR');
  });

  it('handles non-Error throws (e.g. thrown string, object)', async () => {
    const handler = vi.fn().mockRejectedValue('raw string error');
    const wrapped = withApiEnvelope(handler);
    const res = await wrapped(makeRequest());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe('INTERNAL_ERROR');
  });

  it('forwards the request object to the underlying handler', async () => {
    const req = makeRequest('/api/test?foo=bar');
    const handler = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const wrapped = withApiEnvelope(handler);
    await wrapped(req);
    expect(handler).toHaveBeenCalledWith(req, undefined);
  });

  it('passes through the context argument to the underlying handler', async () => {
    const req = makeRequest();
    const ctx = { params: { id: '123' } };
    const handler = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const wrapped = withApiEnvelope(handler);
    await wrapped(req, ctx);
    expect(handler).toHaveBeenCalledWith(req, ctx);
  });
});
