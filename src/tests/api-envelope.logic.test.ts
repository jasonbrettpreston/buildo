// 🔗 SPEC LINK: docs/specs/00_engineering_standards.md §4.4 + spec 70 §API Endpoints
import { describe, it, expect } from 'vitest';
import { ok, err } from '@/features/leads/api/envelope';
import {
  unauthorized,
  forbiddenTradeMismatch,
  rateLimited,
  badRequestZod,
  internalError,
} from '@/features/leads/api/error-mapping';
import { z } from 'zod';

async function readBody(res: Response): Promise<unknown> {
  return res.json();
}

describe('envelope.ok', () => {
  it('returns 200 with {data, error: null, meta: null} by default', async () => {
    const res = ok({ hello: 'world' });
    expect(res.status).toBe(200);
    const body = (await readBody(res)) as { data: unknown; error: unknown; meta: unknown };
    expect(body).toEqual({ data: { hello: 'world' }, error: null, meta: null });
  });

  it('includes meta when provided', async () => {
    const res = ok({ count: 5 }, { next_cursor: null });
    const body = (await readBody(res)) as { meta: unknown };
    expect(body.meta).toEqual({ next_cursor: null });
  });

  it('always returns status 200 (3-arg overload removed — ambiguous with 2-arg form)', async () => {
    const res = ok({ id: 1 }, null);
    expect(res.status).toBe(200);
  });
});

describe('envelope.err', () => {
  it('returns the right shape and status', async () => {
    const res = err('FAIL', 'Something went wrong', 500);
    expect(res.status).toBe(500);
    const body = (await readBody(res)) as { data: unknown; error: { code: string; message: string; details?: unknown }; meta: unknown };
    expect(body.data).toBeNull();
    expect(body.error.code).toBe('FAIL');
    expect(body.error.message).toBe('Something went wrong');
    expect(body.error.details).toBeUndefined();
    expect(body.meta).toBeNull();
  });

  it('includes details when provided', async () => {
    const res = err('VALIDATION_FAILED', 'Bad input', 400, { field: 'lat' });
    const body = (await readBody(res)) as { error: { details?: unknown } };
    expect(body.error.details).toEqual({ field: 'lat' });
  });
});

describe('error-mapping', () => {
  it('unauthorized() → 401 UNAUTHORIZED', async () => {
    const res = unauthorized();
    expect(res.status).toBe(401);
    const body = (await readBody(res)) as { error: { code: string } };
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('forbiddenTradeMismatch(...) → 403 with mismatch detail', async () => {
    const res = forbiddenTradeMismatch('plumbing', 'electrical');
    expect(res.status).toBe(403);
    const body = (await readBody(res)) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('FORBIDDEN_TRADE_MISMATCH');
    expect(body.error.message).toContain('plumbing');
    expect(body.error.message).toContain('electrical');
  });

  it('rateLimited(remaining) → 429 with remaining detail', async () => {
    const res = rateLimited(0);
    expect(res.status).toBe(429);
    const body = (await readBody(res)) as { error: { code: string; details?: { remaining: number } } };
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(body.error.details).toEqual({ remaining: 0 });
  });

  it('badRequestZod(zodError) → 400 VALIDATION_FAILED with flattened details', async () => {
    const schema = z.object({ lat: z.number(), trade_slug: z.string().min(1) });
    const result = schema.safeParse({ lat: 'not-a-number', trade_slug: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const res = badRequestZod(result.error);
      expect(res.status).toBe(400);
      const body = (await readBody(res)) as { error: { code: string; details?: unknown } };
      expect(body.error.code).toBe('VALIDATION_FAILED');
      expect(body.error.details).toBeDefined();
    }
  });

  it('internalError() → 500 INTERNAL_ERROR with no leaked stack', async () => {
    const res = internalError();
    expect(res.status).toBe(500);
    const body = (await readBody(res)) as { error: { code: string; message: string; details?: unknown } };
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(body.error.details).toBeUndefined();
  });
});
