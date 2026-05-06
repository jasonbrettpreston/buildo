// 🔗 SPEC LINK: docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §11
//             docs/specs/02-web-admin/35_web_admin_state_architecture.md §7.1
//
// Tests for the server-side admin analytics module. Spec 33 §11 mandates
// the PII whitelist; Spec 35 §7.3 mandates hashed uid for PostHog events
// (broader access than Sentry). This file exercises the whitelist
// enforcement + capture call shape; the actual PostHog HTTP call is
// mocked at the global `fetch` boundary.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
  logWarn: vi.fn(),
  logInfo: vi.fn(),
}));

import { logError } from '@/lib/logger';

const mockedLogError = vi.mocked(logError);
const ORIGINAL_ENV = { ...process.env };

let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  process.env = { ...ORIGINAL_ENV, POSTHOG_API_KEY: 'test-ph-key' };
  consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
  global.fetch = mockFetch as unknown as typeof fetch;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllEnvs();
  consoleWarnSpy.mockRestore();
});

describe('stripPii — PII whitelist enforcement', () => {
  it('keeps whitelisted keys verbatim', async () => {
    const { stripPii } = await import('@/lib/admin/analytics');
    const result = stripPii({
      action: 'config_committed',
      target: 'logic_variables',
      keys_changed: ['los_base_divisor', 'los_penalty_tracking'],
      admin_uid_hashed: 'sha256:abc',
      auth_method: 'session',
      reason: null,
      duration_ms: 142,
      result: 'ok',
    });
    expect(result).toEqual({
      action: 'config_committed',
      target: 'logic_variables',
      keys_changed: ['los_base_divisor', 'los_penalty_tracking'],
      admin_uid_hashed: 'sha256:abc',
      auth_method: 'session',
      reason: null,
      duration_ms: 142,
      result: 'ok',
    });
  });

  it('drops PII keys silently in production-like NODE_ENV', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { stripPii } = await import('@/lib/admin/analytics');
    const result = stripPii({
      email: 'leak@example.com',
      phone_number: '+15551234',
      uid: 'firebase-uid',
      action: 'allowed',
    });
    // Only `action` survives — three PII keys dropped.
    expect(result).toEqual({ action: 'allowed' });
    // Production silently drops; no console.warn.
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('drops PII keys + console.warns in DEV-like NODE_ENV', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const { stripPii } = await import('@/lib/admin/analytics');
    stripPii({
      email: 'leak@example.com',
      action: 'allowed',
    });
    // DEV warns the developer of the leak attempt.
    expect(consoleWarnSpy).toHaveBeenCalled();
    const warnArg = String(consoleWarnSpy.mock.calls[0]?.[0] ?? '');
    expect(warnArg).toMatch(/dropped non-whitelisted key "email"/);
  });

  it('returns empty object when props is undefined', async () => {
    const { stripPii } = await import('@/lib/admin/analytics');
    expect(stripPii(undefined)).toEqual({});
  });

  it('returns empty object when props is empty', async () => {
    const { stripPii } = await import('@/lib/admin/analytics');
    expect(stripPii({})).toEqual({});
  });
});

describe('track — PostHog capture call shape', () => {
  it('POSTs to PostHog with the canonical event envelope', async () => {
    const { track } = await import('@/lib/admin/analytics');
    await track('admin-hash-1', 'admin_action_performed', {
      action: 'config_committed',
      target: 'logic_variables',
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/posthog\.com\/i\/v0\/e\//);
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' });
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      api_key: 'test-ph-key',
      event: 'admin_action_performed',
      distinct_id: 'admin-hash-1',
      properties: {
        action: 'config_committed',
        target: 'logic_variables',
      },
    });
    expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('strips PII from properties BEFORE sending the request', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { track } = await import('@/lib/admin/analytics');
    await track('admin-hash-1', 'admin_action_performed', {
      action: 'config_committed',
      email: 'should-not-leak@example.com', // PII
    });
    const body = JSON.parse(String(mockFetch.mock.calls[0]?.[1]?.body));
    expect(body.properties).toEqual({ action: 'config_committed' });
    expect(body.properties).not.toHaveProperty('email');
  });

  it('silently no-ops when POSTHOG_API_KEY is unset (no fetch call)', async () => {
    delete process.env.POSTHOG_API_KEY;
    vi.resetModules();
    const { track } = await import('@/lib/admin/analytics');
    await track('admin-hash-1', 'admin_action_performed', { action: 'foo' });
    expect(mockFetch).not.toHaveBeenCalled();
    // No fetch called → no error logged.
    expect(mockedLogError).not.toHaveBeenCalled();
  });

  it('logs error to Sentry when fetch resolves with non-OK status', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    const { track } = await import('@/lib/admin/analytics');
    await track('admin-hash-1', 'admin_action_performed', { action: 'foo' });
    expect(mockedLogError).toHaveBeenCalledTimes(1);
  });

  it('logs error to Sentry when fetch throws (network failure)', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network timeout'));
    const { track } = await import('@/lib/admin/analytics');
    await track('admin-hash-1', 'admin_action_performed', { action: 'foo' });
    expect(mockedLogError).toHaveBeenCalledTimes(1);
    expect(mockedLogError.mock.calls[0]?.[0]).toBe('[admin/analytics]');
  });

  it('respects POSTHOG_HOST env var override', async () => {
    process.env.POSTHOG_HOST = 'https://eu.i.posthog.com';
    vi.resetModules();
    const { track } = await import('@/lib/admin/analytics');
    await track('admin-hash-1', 'admin_action_performed', { action: 'foo' });
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toMatch(/^https:\/\/eu\.i\.posthog\.com/);
  });
});
