// 🔗 SPEC LINK: docs/specs/02-web-admin/76_lead_feed_health_dashboard.md §3.4 + §2.4
//
// Logic test for the admin-uid sentinel resolver. Coverage: default,
// env-var override, env-var trim/empty fallback.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getAdminUid } from '@/lib/admin/admin-uid';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('getAdminUid', () => {
  it('returns the canonical admin sentinel by default', () => {
    delete process.env.ADMIN_TEST_UID;
    expect(getAdminUid()).toBe('admin-test');
  });

  it('honours the ADMIN_TEST_UID env-var override', () => {
    process.env.ADMIN_TEST_UID = 'staging-admin-99';
    expect(getAdminUid()).toBe('staging-admin-99');
  });

  it('trims whitespace from the env-var value', () => {
    process.env.ADMIN_TEST_UID = '  spaced-uid  ';
    expect(getAdminUid()).toBe('spaced-uid');
  });

  it('falls back to the default when env var is empty string', () => {
    // An accidental `ADMIN_TEST_UID=` line in `.env` MUST NOT bypass the
    // default — empty-string is treated as "not configured".
    process.env.ADMIN_TEST_UID = '';
    expect(getAdminUid()).toBe('admin-test');
  });

  it('falls back to the default when env var is whitespace-only', () => {
    process.env.ADMIN_TEST_UID = '   ';
    expect(getAdminUid()).toBe('admin-test');
  });
});
