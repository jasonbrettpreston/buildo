// Logic Layer Tests — scripts/wipe-supabase-auth-state.js
// SPEC LINK: .cursor/phase1_plan.md Item 7 (Rollback/abort + go/no-go gates)
//
// Pure arg/env-resolution logic only (resolveOptions has zero DB access).
// The TRUNCATE/DELETE/RESTRICT-detection sequence itself is exercised
// against a live DB only via manual operator use per Item 7 (an aborted
// migration attempt) — not unit-tested here, matching the same
// no-live-DB-needed convention as this file's sibling migration-shape tests.

import { describe, it, expect } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const wipe = require('../../scripts/wipe-supabase-auth-state.js') as {
  resolveOptions: (
    argv: string[],
    env: NodeJS.ProcessEnv,
  ) => {
    confirmed: boolean;
    truncateAdminAuditLog: boolean;
    isLocal: boolean;
    allowRemote: boolean;
  };
  ADMIN_AUDIT_LOG_RESTRICT_SQLSTATE: string;
};

/** Builds a ProcessEnv-shaped object for a test case, overriding only the given keys. */
function testEnv(overrides: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return { ...process.env, ...overrides };
}

describe('wipe-supabase-auth-state.js — resolveOptions', () => {
  it('defaults to unconfirmed, no audit-log truncation, local, remote not allowed', () => {
    const options = wipe.resolveOptions([], testEnv({}));
    expect(options.confirmed).toBe(false);
    expect(options.truncateAdminAuditLog).toBe(false);
    expect(options.isLocal).toBe(true);
    expect(options.allowRemote).toBe(false);
  });

  it('--confirm sets confirmed=true', () => {
    const options = wipe.resolveOptions(['--confirm'], testEnv({}));
    expect(options.confirmed).toBe(true);
  });

  it('--truncate-admin-audit-log is a separate, explicit opt-in from --confirm', () => {
    const confirmOnly = wipe.resolveOptions(['--confirm'], testEnv({}));
    expect(confirmOnly.truncateAdminAuditLog).toBe(false);

    const both = wipe.resolveOptions(['--confirm', '--truncate-admin-audit-log'], testEnv({}));
    expect(both.confirmed).toBe(true);
    expect(both.truncateAdminAuditLog).toBe(true);
  });

  it('treats PG_HOST=127.0.0.1 / localhost as local', () => {
    expect(wipe.resolveOptions([], testEnv({ PG_HOST: '127.0.0.1' })).isLocal).toBe(true);
    expect(wipe.resolveOptions([], testEnv({ PG_HOST: 'localhost' })).isLocal).toBe(true);
  });

  it('treats a DATABASE_URL with a non-local host as non-local', () => {
    const options = wipe.resolveOptions(
      [],
      testEnv({ PG_HOST: undefined, DATABASE_URL: 'postgresql://user:pass@db.example.com:5432/postgres' }),
    );
    expect(options.isLocal).toBe(false);
  });

  it('treats a DATABASE_URL pointed at the local stack as local', () => {
    const options = wipe.resolveOptions(
      [],
      testEnv({ PG_HOST: undefined, DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' }),
    );
    expect(options.isLocal).toBe(true);
  });

  it('WIPE_ALLOW_REMOTE=1 sets allowRemote=true', () => {
    const options = wipe.resolveOptions([], testEnv({ WIPE_ALLOW_REMOTE: '1' }));
    expect(options.allowRemote).toBe(true);
  });

  it('exports the foreign_key_violation SQLSTATE used to detect the admin_audit_log RESTRICT block', () => {
    expect(wipe.ADMIN_AUDIT_LOG_RESTRICT_SQLSTATE).toBe('23503');
  });
});
