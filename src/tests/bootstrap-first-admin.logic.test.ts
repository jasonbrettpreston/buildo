// Logic Layer Tests — scripts/bootstrap-first-admin.js
// SPEC LINK: .cursor/phase1_plan.md Item 3 (P1-F3a, "Bootstrap seed mechanism
//   — REDESIGNED") + docs/specs/00-architecture/113_supabase_infrastructure.md §3
//
// Pure config-resolution logic only (resolveConfig has zero network/DB
// access) — the createUser/promote-UPDATE/generateLink sequence itself was
// verified this session by an actual local-stack run (see the task's
// verification output: auth.users row + profiles.is_admin=true confirmed).

import { describe, it, expect } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const bootstrap = require('../../scripts/bootstrap-first-admin.js') as {
  resolveConfig: (env: NodeJS.ProcessEnv) => {
    supabaseUrl: string;
    serviceRoleKey: string;
    adminEmail: string;
  };
  LOCAL_SUPABASE_URL: string;
};

const baseEnv: NodeJS.ProcessEnv = {
  ...process.env,
  BOOTSTRAP_ADMIN_EMAIL: 'operator@example.com',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
};

describe('bootstrap-first-admin.js — resolveConfig', () => {
  it('defaults SUPABASE_URL to the local stack when unset', () => {
    const config = bootstrap.resolveConfig(baseEnv);
    expect(config.supabaseUrl).toBe('http://127.0.0.1:54321');
    expect(config.supabaseUrl).toBe(bootstrap.LOCAL_SUPABASE_URL);
  });

  it('accepts an explicit localhost SUPABASE_URL without requiring BOOTSTRAP_ALLOW_REMOTE', () => {
    const config = bootstrap.resolveConfig({
      ...baseEnv,
      SUPABASE_URL: 'http://localhost:54321',
    } as NodeJS.ProcessEnv);
    expect(config.supabaseUrl).toBe('http://localhost:54321');
  });

  it('never reads NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY (the cloud-bound vars)', () => {
    // A .env with the cloud project's vars set should NOT influence this
    // script's resolved target — those names are deliberately not read.
    const config = bootstrap.resolveConfig({
      ...baseEnv,
      NEXT_PUBLIC_SUPABASE_URL: 'https://gcnatfpacuhsytcbaszi.supabase.co',
      SUPABASE_SECRET_KEY: 'sb_secret_cloud_value_should_be_ignored',
    } as NodeJS.ProcessEnv);
    expect(config.supabaseUrl).toBe('http://127.0.0.1:54321');
    expect(config.serviceRoleKey).toBe('test-service-role-key');
  });

  it('refuses a non-local SUPABASE_URL without BOOTSTRAP_ALLOW_REMOTE=1', () => {
    expect(() =>
      bootstrap.resolveConfig({
        ...baseEnv,
        SUPABASE_URL: 'https://gcnatfpacuhsytcbaszi.supabase.co',
      } as NodeJS.ProcessEnv),
    ).toThrow(/refuses to run against a non-local/i);
  });

  it('allows a non-local SUPABASE_URL when BOOTSTRAP_ALLOW_REMOTE=1 is explicitly set', () => {
    const config = bootstrap.resolveConfig({
      ...baseEnv,
      SUPABASE_URL: 'https://gcnatfpacuhsytcbaszi.supabase.co',
      BOOTSTRAP_ALLOW_REMOTE: '1',
    } as NodeJS.ProcessEnv);
    expect(config.supabaseUrl).toBe('https://gcnatfpacuhsytcbaszi.supabase.co');
  });

  it('throws when SUPABASE_SERVICE_ROLE_KEY is missing', () => {
    const env = { ...baseEnv } as NodeJS.ProcessEnv;
    delete env.SUPABASE_SERVICE_ROLE_KEY;
    expect(() => bootstrap.resolveConfig(env)).toThrow(/SUPABASE_SERVICE_ROLE_KEY is required/i);
  });

  it('throws when BOOTSTRAP_ADMIN_EMAIL is missing (never hardcoded)', () => {
    const env = { ...baseEnv } as NodeJS.ProcessEnv;
    delete env.BOOTSTRAP_ADMIN_EMAIL;
    expect(() => bootstrap.resolveConfig(env)).toThrow(/BOOTSTRAP_ADMIN_EMAIL is required/i);
  });

  it('returns the exact BOOTSTRAP_ADMIN_EMAIL value untouched', () => {
    const config = bootstrap.resolveConfig({
      ...baseEnv,
      BOOTSTRAP_ADMIN_EMAIL: 'jasonbrettpreston@gmail.com',
    } as NodeJS.ProcessEnv);
    expect(config.adminEmail).toBe('jasonbrettpreston@gmail.com');
  });
});
