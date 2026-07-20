// Logic Layer Tests — scripts/seed-cron-secret.js
// SPEC LINK: docs/specs/00-architecture/113_supabase_infrastructure.md §8.1, §11
// SPEC LINK: migrations/234_vault_write_rpc.sql
//
// Pure config-resolution + constants only (resolveConnectionString has zero
// network/DB access) — the actual vault_upsert_secret RPC call was
// live-verified read-only against the cloud project this session (function
// signature, grants, vault.secrets uniqueness), not re-exercised here
// without a live DB (mirrors bootstrap-first-admin.logic.test.ts's scope).

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const seedCronSecret = require('../../scripts/seed-cron-secret.js') as {
  resolveConnectionString: (env: NodeJS.ProcessEnv) => string;
  SECRET_NAME: string;
  SECRET_BYTES: number;
};

const SCRIPT_PATH = path.resolve(__dirname, '../../scripts/seed-cron-secret.js');
const scriptSource = () => fs.readFileSync(SCRIPT_PATH, 'utf-8');

describe('seed-cron-secret.js — resolveConnectionString', () => {
  it('returns SUPABASE_DATABASE_URL when set', () => {
    const url = seedCronSecret.resolveConnectionString({
      ...process.env,
      SUPABASE_DATABASE_URL: 'postgresql://user:pass@cloud-host:5432/postgres',
    });
    expect(url).toBe('postgresql://user:pass@cloud-host:5432/postgres');
  });

  it('throws when SUPABASE_DATABASE_URL is unset — deliberately no DATABASE_URL fallback', () => {
    const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: 'postgresql://local' };
    delete env.SUPABASE_DATABASE_URL;
    expect(() => seedCronSecret.resolveConnectionString(env)).toThrow(
      /SUPABASE_DATABASE_URL is required/
    );
  });

  it('does not silently fall back to DATABASE_URL even when both are set — CRON_SECRET must target the intended project explicitly', () => {
    const url = seedCronSecret.resolveConnectionString({
      ...process.env,
      SUPABASE_DATABASE_URL: 'postgresql://cloud',
      DATABASE_URL: 'postgresql://local',
    });
    expect(url).toBe('postgresql://cloud');
  });
});

describe('seed-cron-secret.js — constants', () => {
  it('SECRET_NAME is CRON_SECRET', () => {
    expect(seedCronSecret.SECRET_NAME).toBe('CRON_SECRET');
  });

  it('SECRET_BYTES is 32 (256 bits of entropy)', () => {
    expect(seedCronSecret.SECRET_BYTES).toBe(32);
  });
});

describe('seed-cron-secret.js — source-scan invariants', () => {
  it('generates the secret via crypto.randomBytes, not Math.random or a hardcoded value', () => {
    const source = scriptSource();
    expect(source).toMatch(/crypto\.randomBytes\(SECRET_BYTES\)/);
    expect(source).not.toMatch(/Math\.random/);
  });

  it('writes via the vault_upsert_secret RPC — never a raw INSERT/UPDATE against vault.secrets', () => {
    const source = scriptSource();
    expect(source).toMatch(/vault_upsert_secret/);
    expect(source).not.toMatch(/INSERT\s+INTO\s+vault\.secrets/i);
    expect(source).not.toMatch(/UPDATE\s+vault\.secrets/i);
  });

  it('prints the secret to stdout exactly once (console.log(secret) appears exactly once)', () => {
    const source = scriptSource();
    const matches = source.match(/console\.log\(secret\)/g) || [];
    expect(matches.length).toBe(1);
  });

  it('has no re-read path decrypting an existing Vault secret back out (no decrypted_secrets read)', () => {
    const source = scriptSource();
    expect(source).not.toMatch(/SELECT\s+decrypted_secret/i);
    expect(source).not.toMatch(/vault\.decrypted_secrets/);
  });

  it('is not registered as a manifest/chain step (standalone operator CLI, mirrors migrate.js/restore-db.js)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const manifest = require('../../scripts/manifest.json') as {
      scripts: Record<string, { file: string | null }>;
    };
    const registered = Object.values(manifest.scripts).some(
      (entry) => entry.file === 'scripts/seed-cron-secret.js'
    );
    expect(registered).toBe(false);
  });
});
