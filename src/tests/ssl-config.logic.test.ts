// 🔗 SPEC LINK: docs/specs/00-architecture/113_supabase_infrastructure.md §4
//
// Pure-logic lock for the shared TLS config helper: scripts/lib/ssl-config.js
// (CJS, pipeline/migration call sites) and its ADR-001 dual-path TS twin
// src/lib/db/ssl-config.ts (Next.js call site). Both are exercised with the
// SAME cases so drift between the two is caught here rather than in prod.
// No DB — pure host-detection + CA-file-read logic.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SUPABASE_CA_PEM } from '@/lib/db/supabase-ca';
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
  isParseableCert: (pem: string | null | undefined) => boolean;
};
import { resolveSslConfig as resolveSslConfigTsRaw, isParseableCert as isParseableCertTs } from '@/lib/db/ssl-config';
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
    // A REAL, parseable cert (the committed Supabase root) — isParseableCert
    // now gates every configured source, so 'FAKE' placeholders would be
    // rejected and fall through. The bundled fallback is this same cert.
    writeFileSync(caCertPath, SUPABASE_CA_PEM);
  });

  // A space-flattened REAL cert — the exact Vercel dashboard mangle, but of a
  // genuine cert so it repairs to something X509-valid and is USED.
  const MANGLED_REAL_PEM = SUPABASE_CA_PEM.replace(/\n/g, ' ');

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

    it('non-loopback host with NO env CA → pins the bundled Supabase CA (F1g fold: fail-closed via a pinned root, not a throw)', () => {
      const result = resolveSslConfig({ host: 'db.gcnatfpacuhsytcbaszi.supabase.co' }) as { ca: string; rejectUnauthorized: true };
      expect(result.rejectUnauthorized).toBe(true); // NEVER an unverified connection
      expect(result.ca).toContain('BEGIN CERTIFICATE');
      expect(result.ca).toBe(SUPABASE_CA_PEM);
    });

    it('non-loopback connectionString (SUPABASE_DATABASE_URL form) with NO env CA → pins the bundled Supabase CA', () => {
      const result = resolveSslConfig({
        connectionString: 'postgresql://postgres:pw@db.gcnatfpacuhsytcbaszi.supabase.co:5432/postgres',
      }) as { ca: string; rejectUnauthorized: true };
      expect(result.rejectUnauthorized).toBe(true);
      expect(result.ca).toBe(SUPABASE_CA_PEM);
    });

    it('non-loopback host with an UNREADABLE CA file → falls through to the bundled root (never fatal, never unverified)', () => {
      const result = resolveSslConfig({
        host: 'db.gcnatfpacuhsytcbaszi.supabase.co',
        caCertPath: join(tmpDir, 'does-not-exist.pem'),
      }) as { ca: string; rejectUnauthorized: true };
      expect(result.rejectUnauthorized).toBe(true);
      expect(result.ca).toBe(SUPABASE_CA_PEM);
    });

    it('non-loopback host with a valid CA file → CA-pinned verify-full', () => {
      const result = resolveSslConfig({ host: 'db.gcnatfpacuhsytcbaszi.supabase.co', caCertPath });
      expect(result).toEqual({ ca: SUPABASE_CA_PEM, rejectUnauthorized: true });
    });

    it('non-loopback connectionString with SUPABASE_CA_CERT_PATH env var set → CA-pinned verify-full', () => {
      process.env.SUPABASE_CA_CERT_PATH = caCertPath;
      const result = resolveSslConfig({
        connectionString: 'postgresql://postgres:pw@db.gcnatfpacuhsytcbaszi.supabase.co:5432/postgres',
      });
      expect(result).toEqual({ ca: SUPABASE_CA_PEM, rejectUnauthorized: true });
    });

    it('SUPABASE_CA_CERT (valid inline PEM content) → CA-pinned verify-full with NO file read', () => {
      process.env.SUPABASE_CA_CERT = SUPABASE_CA_PEM;
      const result = resolveSslConfig({ host: 'db.gcnatfpacuhsytcbaszi.supabase.co' }) as { ca: string; rejectUnauthorized: true };
      expect(result.rejectUnauthorized).toBe(true);
      expect(result.ca).toContain('BEGIN CERTIFICATE');
    });

    it('a space-MANGLED but genuine inline cert (the Vercel paste-flatten) is repaired and USED — not fatal', () => {
      process.env.SUPABASE_CA_CERT = MANGLED_REAL_PEM;
      const result = resolveSslConfig({ host: 'db.gcnatfpacuhsytcbaszi.supabase.co' }) as { ca: string; rejectUnauthorized: true };
      expect(result.rejectUnauthorized).toBe(true);
      expect(result.ca).toContain('BEGIN CERTIFICATE');
    });

    it('a TRUNCATED inline cert (valid-looking PEM, incomplete DER — the exact SELF_SIGNED_CERT bug) is IGNORED and falls through to the bundled root — no throw, still verified', () => {
      // first ~6 base64 lines of the real cert, re-wrapped: parses as PEM,
      // fails as X.509. This is what a truncated dashboard paste produces.
      const body = SUPABASE_CA_PEM.split('\n').slice(1, 7).join('');
      process.env.SUPABASE_CA_CERT = `-----BEGIN CERTIFICATE-----\n${body}\n-----END CERTIFICATE-----\n`;
      const result = resolveSslConfig({ host: 'db.gcnatfpacuhsytcbaszi.supabase.co' }) as { ca: string; rejectUnauthorized: true };
      expect(result.rejectUnauthorized).toBe(true);
      expect(result.ca).toBe(SUPABASE_CA_PEM); // the bundled floor, not the truncated garbage
    });

    it('a set-but-garbage SUPABASE_CA_CERT (no cert block at all) → falls through to the bundled root, no throw', () => {
      process.env.SUPABASE_CA_CERT = 'definitely not a pem';
      const result = resolveSslConfig({ host: 'db.gcnatfpacuhsytcbaszi.supabase.co' }) as { ca: string; rejectUnauthorized: true };
      expect(result.rejectUnauthorized).toBe(true);
      expect(result.ca).toBe(SUPABASE_CA_PEM);
    });

    it('an empty/whitespace SUPABASE_CA_CERT falls through to the path form', () => {
      process.env.SUPABASE_CA_CERT = '   ';
      process.env.SUPABASE_CA_CERT_PATH = caCertPath;
      const result = resolveSslConfig({ host: 'db.gcnatfpacuhsytcbaszi.supabase.co' }) as { ca: string };
      expect(result.ca).toBe(SUPABASE_CA_PEM);
    });

    it('a garbage FILE at SUPABASE_CA_CERT_PATH → falls through to the bundled root, no throw', () => {
      const garbagePath = join(tmpDir, 'garbage.pem');
      writeFileSync(garbagePath, 'not a pem at all');
      const result = resolveSslConfig({ host: 'db.gcnatfpacuhsytcbaszi.supabase.co', caCertPath: garbagePath }) as { ca: string; rejectUnauthorized: true };
      expect(result.rejectUnauthorized).toBe(true);
      expect(result.ca).toBe(SUPABASE_CA_PEM);
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
        () => resolveSslConfig({ host: 'db.example.supabase.co' }), // bundled-CA fallback path
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
    // Explicit loopback host → no TLS regardless of the SUPABASE_DATABASE_URL fallback.
    expect(jsLib.resolveSslConfig({ host: 'localhost' })).toBeUndefined();
    expect(resolveSslConfigTs({ host: 'localhost' })).toBeUndefined();
  });

  describe('bundled Supabase CA (F1g fold — build-traced fallback, no operator paste)', () => {
    const committedPem = readFileSync(join(__dirname, '../../scripts/certs/supabase-ca.pem'), 'utf8');

    it('drift-lock: the bundled TS constant is byte-identical to the committed scripts/certs/supabase-ca.pem', () => {
      expect(SUPABASE_CA_PEM).toBe(committedPem);
    });

    it('both twins pin the SAME bundled CA when no env var is set (JS reads the file, TS imports the constant)', () => {
      // caCertPath deleted in beforeEach; no SUPABASE_CA_CERT either
      const js = jsLib.resolveSslConfig({ host: 'db.gcnatfpacuhsytcbaszi.supabase.co' }) as { ca: string };
      const ts = resolveSslConfigTs({ host: 'db.gcnatfpacuhsytcbaszi.supabase.co' }) as { ca: string };
      expect(js.ca).toBe(committedPem);
      expect(ts.ca).toBe(committedPem);
    });

    it('a VALID explicit CA path is USED, not the bundled fallthrough (proven via the fallthrough warning NOT firing)', () => {
      // caCertPath holds a real cert; a valid configured source returns at the
      // path step, so the "pinning the bundled" fallthrough warn never fires.
      process.env.SUPABASE_CA_CERT_PATH = caCertPath;
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const ts = resolveSslConfigTs({ host: 'db.gcnatfpacuhsytcbaszi.supabase.co' }) as { ca: string; rejectUnauthorized: true };
        expect(ts.rejectUnauthorized).toBe(true);
        expect(warnSpy.mock.calls.flat().some((a) => String(a).includes('pinning the bundled'))).toBe(false);
      } finally {
        warnSpy.mockRestore();
      }
    });
  });

  describe('isParseableCert (F1g fold — X.509 validity gate, both twins)', () => {
    for (const [label, isParseable] of [
      ['scripts/lib/ssl-config.js (CJS)', jsLib.isParseableCert],
      ['src/lib/db/ssl-config.ts (TS twin)', isParseableCertTs],
    ] as const) {
      it(`${label}: true for a real cert, false for garbage/truncated/empty`, () => {
        expect(isParseable(SUPABASE_CA_PEM)).toBe(true);
        expect(isParseable('not a pem')).toBe(false);
        // valid-looking PEM, truncated body → invalid DER → false (the bug)
        expect(isParseable('-----BEGIN CERTIFICATE-----\nSHORTBODY\n-----END CERTIFICATE-----')).toBe(false);
        expect(isParseable('')).toBe(false);
        expect(isParseable(null)).toBe(false);
      });
    }
  });
});
