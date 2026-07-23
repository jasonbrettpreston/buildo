// 🔗 SPEC LINK: docs/specs/00-architecture/113_supabase_infrastructure.md §4
//
// Pure-logic lock for the shared TLS config helper: scripts/lib/ssl-config.js
// (CJS, pipeline/migration call sites) and its ADR-001 dual-path TS twin
// src/lib/db/ssl-config.ts (Next.js call site). Both are exercised with the
// SAME cases so drift between the two is caught here rather than in prod.
// No DB — pure host-detection + CA-file-read logic.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
type SslConfigOpts = {
  connectionString?: string;
  host?: string;
  local?: boolean;
  caCertPath?: string;
};
type SslConfigResult = undefined | { ca: string; rejectUnauthorized: true };
type ResolveSslConfigFn = (opts?: SslConfigOpts) => SslConfigResult;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const jsLib = require('../../scripts/lib/ssl-config') as {
  resolveSslConfig: ResolveSslConfigFn;
};
import { resolveSslConfig as resolveSslConfigTsRaw } from '@/lib/db/ssl-config';
// The TS twin's return type is pg's PoolConfig['ssl'] (broader than our
// {ca, rejectUnauthorized} shape); narrow it here so both twins share one
// call signature in the table-driven cases below — the assertions
// themselves still verify the exact shape returned.
const resolveSslConfigTs = resolveSslConfigTsRaw as unknown as ResolveSslConfigFn;

const ORIGINAL_ENV = { ...process.env };

// Run every case against both twins so a drift between the CJS pipeline
// helper and the TS Next.js helper fails a test immediately.
const IMPLS: Array<[string, ResolveSslConfigFn]> = [
  ['scripts/lib/ssl-config.js (CJS)', jsLib.resolveSslConfig],
  ['src/lib/db/ssl-config.ts (TS twin)', resolveSslConfigTs],
];

describe('ssl-config — resolveSslConfig', () => {
  let tmpDir: string;
  let caCertPath: string;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.SUPABASE_CA_CERT_PATH;
    delete process.env.SUPABASE_CA_CERT;
    delete process.env.SUPABASE_DATABASE_URL;
    delete process.env.PGSSL_DISABLE;
    tmpDir = mkdtempSync(join(tmpdir(), 'ssl-config-test-'));
    caCertPath = join(tmpDir, 'ca.pem');
    writeFileSync(caCertPath, '-----BEGIN CERTIFICATE-----\nFAKE\n-----END CERTIFICATE-----\n');
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe.each(IMPLS)('%s', (_label, resolveSslConfig) => {
    it('loopback host (discrete options) → no TLS', () => {
      expect(resolveSslConfig({ host: '127.0.0.1' })).toBeUndefined();
      expect(resolveSslConfig({ host: 'localhost' })).toBeUndefined();
      expect(resolveSslConfig({ host: 'LOCALHOST' })).toBeUndefined();
    });

    it('loopback host via connectionString (DATABASE_URL form) → no TLS', () => {
      expect(
        resolveSslConfig({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' })
      ).toBeUndefined();
      expect(
        resolveSslConfig({ connectionString: 'postgres://user:pass@localhost:5432/buildo' })
      ).toBeUndefined();
    });

    it('explicit local override bypasses host sniffing even for a non-loopback host', () => {
      expect(resolveSslConfig({ host: 'db.example.supabase.co', local: true })).toBeUndefined();
    });

    it('PGSSL_DISABLE=1 forces local mode regardless of host', () => {
      process.env.PGSSL_DISABLE = '1';
      expect(resolveSslConfig({ host: 'db.example.supabase.co' })).toBeUndefined();
    });

    it('non-loopback host without SUPABASE_CA_CERT_PATH throws (fail-fast, no silent fallback)', () => {
      expect(() => resolveSslConfig({ host: 'db.gcnatfpacuhsytcbaszi.supabase.co' })).toThrow(
        /SUPABASE_CA_CERT_PATH/
      );
    });

    it('non-loopback connectionString (SUPABASE_DATABASE_URL form) without CA path throws', () => {
      expect(() =>
        resolveSslConfig({
          connectionString: 'postgresql://postgres:pw@db.gcnatfpacuhsytcbaszi.supabase.co:5432/postgres',
        })
      ).toThrow(/SUPABASE_CA_CERT_PATH/);
    });

    it('non-loopback host with a missing CA file throws (does not silently continue)', () => {
      expect(() =>
        resolveSslConfig({
          host: 'db.gcnatfpacuhsytcbaszi.supabase.co',
          caCertPath: join(tmpDir, 'does-not-exist.pem'),
        })
      ).toThrow(/could not read CA cert/);
    });

    it('non-loopback host with a valid CA file → CA-pinned verify-full', () => {
      const result = resolveSslConfig({
        host: 'db.gcnatfpacuhsytcbaszi.supabase.co',
        caCertPath,
      });
      expect(result).toEqual({
        ca: expect.stringContaining('BEGIN CERTIFICATE'),
        rejectUnauthorized: true,
      });
    });

    it('non-loopback connectionString with SUPABASE_CA_CERT_PATH env var set → CA-pinned verify-full', () => {
      process.env.SUPABASE_CA_CERT_PATH = caCertPath;
      const result = resolveSslConfig({
        connectionString: 'postgresql://postgres:pw@db.gcnatfpacuhsytcbaszi.supabase.co:5432/postgres',
      });
      expect(result).toEqual({
        ca: expect.stringContaining('BEGIN CERTIFICATE'),
        rejectUnauthorized: true,
      });
    });

    it('SUPABASE_CA_CERT (inline PEM content, F1g fold) → CA-pinned verify-full with NO file read', () => {
      process.env.SUPABASE_CA_CERT = '-----BEGIN CERTIFICATE-----\nINLINE\n-----END CERTIFICATE-----\n';
      const result = resolveSslConfig({ host: 'db.gcnatfpacuhsytcbaszi.supabase.co' });
      expect(result).toEqual({
        ca: expect.stringContaining('INLINE'),
        rejectUnauthorized: true,
      });
    });

    it('inline SUPABASE_CA_CERT takes precedence over SUPABASE_CA_CERT_PATH', () => {
      process.env.SUPABASE_CA_CERT = '-----BEGIN CERTIFICATE-----\nINLINE\n-----END CERTIFICATE-----\n';
      process.env.SUPABASE_CA_CERT_PATH = caCertPath; // holds FAKE, not INLINE
      const result = resolveSslConfig({ host: 'db.gcnatfpacuhsytcbaszi.supabase.co' }) as { ca: string };
      expect(result.ca).toContain('INLINE');
      expect(result.ca).not.toContain('FAKE');
    });

    it('an empty/whitespace SUPABASE_CA_CERT falls through to the path form (never pins an empty CA)', () => {
      process.env.SUPABASE_CA_CERT = '   ';
      process.env.SUPABASE_CA_CERT_PATH = caCertPath;
      const result = resolveSslConfig({ host: 'db.gcnatfpacuhsytcbaszi.supabase.co' }) as { ca: string };
      expect(result.ca).toContain('FAKE');
    });

    it('IPv6 loopback literal ([::1] in a connection string) → no TLS', () => {
      expect(
        resolveSslConfig({ connectionString: 'postgres://user:pass@[::1]:5432/buildo' })
      ).toBeUndefined();
    });

    it('never returns rejectUnauthorized:false in any branch', () => {
      const cases: Array<() => unknown> = [
        () => resolveSslConfig({ host: '127.0.0.1' }),
        () => resolveSslConfig({ host: 'localhost' }),
        () => resolveSslConfig({ host: 'db.example.supabase.co', local: true }),
        () => {
          try {
            return resolveSslConfig({ host: 'db.example.supabase.co' });
          } catch {
            return undefined; // the throw path IS the "no insecure fallback" guarantee
          }
        },
        () => resolveSslConfig({ host: 'db.example.supabase.co', caCertPath }),
      ];
      for (const run of cases) {
        const result = run();
        if (result && typeof result === 'object') {
          expect((result as { rejectUnauthorized?: boolean }).rejectUnauthorized).not.toBe(false);
        }
      }
    });
  });

  it('falls back to SUPABASE_DATABASE_URL for host detection only when the caller passes neither host nor connectionString (both twins)', () => {
    process.env.SUPABASE_DATABASE_URL =
      'postgresql://postgres:pw@db.gcnatfpacuhsytcbaszi.supabase.co:5432/postgres';
    process.env.SUPABASE_CA_CERT_PATH = caCertPath;

    expect(jsLib.resolveSslConfig()).toEqual({
      ca: expect.stringContaining('BEGIN CERTIFICATE'),
      rejectUnauthorized: true,
    });
    expect(resolveSslConfigTs()).toEqual({
      ca: expect.stringContaining('BEGIN CERTIFICATE'),
      rejectUnauthorized: true,
    });
  });

  it('an explicit host takes precedence over SUPABASE_DATABASE_URL (canonical call sites are never affected by it)', () => {
    process.env.SUPABASE_DATABASE_URL =
      'postgresql://postgres:pw@db.gcnatfpacuhsytcbaszi.supabase.co:5432/postgres';
    // No SUPABASE_CA_CERT_PATH set — if the explicit loopback host were
    // overridden by the SUPABASE_DATABASE_URL fallback, this would throw.
    expect(jsLib.resolveSslConfig({ host: 'localhost' })).toBeUndefined();
    expect(resolveSslConfigTs({ host: 'localhost' })).toBeUndefined();
  });
});
