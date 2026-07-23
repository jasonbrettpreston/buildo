/**
 * Shared TLS config helper for `pg` Pool connections in Next.js server code
 * (`src/lib/db/client.ts`).
 *
 * TS twin of `scripts/lib/ssl-config.js` (ADR-001 dual code path —
 * `docs/adr/001-dual-code-path.md`). Next.js server code bundled for Vercel
 * does not cleanly reach into `scripts/lib/` at runtime (no build-time
 * guarantee the file is included in the serverless function trace, and the
 * existing precedent for src/↔scripts/lib sharing — classification/scoring/
 * scope logic per ADR-001 — is a manually-synced mirror, not a cross-import).
 * This file is that mirror: keep its LOOPBACK_HOSTS set and branch logic
 * byte-for-byte aligned with `scripts/lib/ssl-config.js` whenever either
 * changes.
 *
 * SPEC LINK: docs/specs/00-architecture/113_supabase_infrastructure.md
 */
import fs from 'fs';
import { X509Certificate } from 'crypto';
import type { PoolConfig } from 'pg';
import { SUPABASE_CA_PEM } from './supabase-ca';

export type SslConfigOpts = {
  connectionString?: string;
  host?: string;
  local?: boolean;
  caCertPath?: string;
};

export const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

/**
 * Strip libpq SSL query params (`sslmode`, `sslrootcert`, `sslcert`, `sslkey`)
 * from a Postgres connection string (F1g root-cause fix, 2026-07-23). When a
 * connection string carries `sslmode=`, node-postgres/pg-connection-string
 * builds its OWN `ssl` config from it and DISCARDS a separately-passed
 * `ssl:{ca,...}` object — so our CA-pinned config is silently dropped and TLS
 * verifies against nothing, throwing SELF_SIGNED_CERT_IN_CHAIN. The Vercel–
 * Supabase integration injects `POSTGRES_URL` WITH `?sslmode=require`, which is
 * exactly this trap (reproduced live). Removing these params lets the explicit
 * `ssl` config from resolveSslConfig govern. Non-ssl params are preserved;
 * a non-URL/garbage string is returned unchanged (the caller handles it).
 * Keep byte-aligned with scripts/lib/ssl-config.js.
 */
export function stripSslParams(connectionString: string): string {
  try {
    const u = new URL(connectionString);
    for (const p of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'ssl']) u.searchParams.delete(p);
    return u.toString();
  } catch {
    return connectionString;
  }
}

/**
 * Rebuild a canonical PEM from ANY mangled inline form (F1g fold,
 * 2026-07-23): real newlines (untouched), literal `\n` escapes (unescaped),
 * or a dashboard-flattened single line with spaces (base64 body re-wrapped
 * at 64 chars). Returns null when no certificate block is present.
 * Keep byte-aligned with scripts/lib/ssl-config.js.
 */
/**
 * Does `pem` parse as a real X.509 certificate? (F1g fold, 2026-07-23) —
 * normalizeInlinePem repairs FORMATTING but cannot detect TRUNCATION: a
 * partial paste re-wraps into a syntactically-valid-looking PEM whose DER is
 * incomplete, which then fails at the TLS handshake as SELF_SIGNED_CERT (the
 * exact preview-build symptom that burned four rounds). A real X.509 parse
 * catches it, so an unusable configured cert can be IGNORED in favor of the
 * bundled default rather than breaking every DB connection. Keep byte-aligned
 * with scripts/lib/ssl-config.js.
 */
export function isParseableCert(pem: string | null | undefined): boolean {
  if (!pem) return false;
  // Validate EVERY certificate block (Guardian F3, empirically confirmed):
  // new X509Certificate(bundle) parses only the FIRST block, so a bundle whose
  // 2nd+ block is truncated would otherwise pass. A single cert has one block.
  const blocks = String(pem).match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
  if (!blocks || blocks.length === 0) return false;
  try {
    // eslint-disable-next-line no-new
    for (const b of blocks) new X509Certificate(b);
    return true;
  } catch {
    return false;
  }
}

export function normalizeInlinePem(raw: string): string | null {
  const unescaped = String(raw).replace(/\\n/g, '\n');
  // ALL certificate blocks, in order (Round-2 fold, Gemini+DeepSeek converge):
  // node's TLS `ca` accepts concatenated PEMs, and CA BUNDLES are standard
  // practice — silently keeping only the first block would truncate a bundle.
  const blocks = [...unescaped.matchAll(/-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/g)];
  const rebuilt: string[] = [];
  for (const m of blocks) {
    const body = (m[1] ?? '').replace(/\s+/g, '');
    if (!body) continue;
    const lines = body.match(/.{1,64}/g) || [];
    rebuilt.push(`-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----\n`);
  }
  return rebuilt.length > 0 ? rebuilt.join('') : null;
}

/**
 * Resolve the target host from either connection-string style opts
 * (`connectionString` — DATABASE_URL/SUPABASE_DATABASE_URL) or discrete
 * options style (`host` — PG_HOST etc.). Falls back to SUPABASE_DATABASE_URL
 * only when the caller supplied neither — `client.ts`'s two branches always
 * pass one explicitly, so this fallback never changes their behavior.
 */
export function extractHost(opts: SslConfigOpts): string | undefined {
  if (opts.host) return opts.host;
  const connectionString = opts.connectionString || process.env.SUPABASE_DATABASE_URL;
  if (!connectionString) return undefined;
  try {
    const parsed = new URL(connectionString);
    // URL hostnames are lowercased and IPv6 literals are bracketed;
    // strip brackets so '::1' compares equal against LOOPBACK_HOSTS.
    return parsed.hostname.replace(/^\[|\]$/g, '');
  } catch {
    return undefined;
  }
}

export function isLocalMode(opts: SslConfigOpts): boolean {
  if (opts.local === true) return true;
  if (process.env.PGSSL_DISABLE === '1') return true;
  const resolvedHost = extractHost(opts);
  if (!resolvedHost) return false;
  return LOOPBACK_HOSTS.has(resolvedHost.toLowerCase());
}

/**
 * Resolve the `ssl` value for a `pg` Pool/Client config.
 *
 * - Local `supabase start` / Docker dev DB / CI containers (loopback host,
 *   or an explicit local-mode override): no TLS.
 * - Any non-loopback (cloud Supabase) target: CA-pinned `verify-full`. CA
 *   source precedence (F1g fold 2026-07-23): SUPABASE_CA_CERT (inline PEM) >
 *   SUPABASE_CA_CERT_PATH (file) > the bundled Supabase root imported from
 *   ./supabase-ca (build-traced for Vercel — no operator config needed; env
 *   vars are the rotation/override path). Any UNUSABLE configured source (an
 *   unreadable path, or an inline/file value that isn't a parseable X.509
 *   cert — isParseableCert) is WARNED and SKIPPED, not fatal — the bundled
 *   root is the guaranteed floor. NEVER falls back to `rejectUnauthorized:
 *   false` (banned repo-wide, Spec 113 §4).
 */
export function resolveSslConfig(opts: SslConfigOpts = {}): PoolConfig['ssl'] {
  if (isLocalMode(opts)) {
    return undefined;
  }

  // CA source precedence with VALIDATED fall-through (F1g fold, 2026-07-23):
  // SUPABASE_CA_CERT (inline) > SUPABASE_CA_CERT_PATH (file) > bundled root.
  // Each configured source is used ONLY if it parses as a real X.509 cert
  // (isParseableCert) — a truncated/garbage env paste re-wraps into a valid-
  // LOOKING PEM whose DER is incomplete and fails at the TLS handshake as
  // SELF_SIGNED_CERT (the symptom that burned four preview builds). An
  // unusable configured source is WARNED and skipped, never used and never
  // fatal, because the committed bundled root is the guaranteed floor. Every
  // branch below returns rejectUnauthorized:true against a real pinned root —
  // fail-closed is preserved; the app just can't be broken by a bad paste.

  // (1) inline env content
  const caCertInline = process.env.SUPABASE_CA_CERT;
  if (caCertInline && caCertInline.trim()) {
    if (process.env.SUPABASE_CA_CERT_PATH) {
      console.warn('resolveSslConfig: SUPABASE_CA_CERT (inline) takes precedence over SUPABASE_CA_CERT_PATH — both are set');
    }
    const ca = normalizeInlinePem(caCertInline);
    if (isParseableCert(ca)) return { ca: ca as string, rejectUnauthorized: true };
    console.warn('resolveSslConfig: SUPABASE_CA_CERT is set but is not a parseable X.509 certificate (truncated/garbage?) — IGNORING it and falling through to the bundled Supabase root CA');
  }

  // (2) explicit file path
  const caCertPath = opts.caCertPath || process.env.SUPABASE_CA_CERT_PATH;
  if (caCertPath) {
    try {
      const ca = fs.readFileSync(caCertPath, 'utf8');
      if (isParseableCert(ca)) return { ca, rejectUnauthorized: true };
      console.warn(`resolveSslConfig: file at SUPABASE_CA_CERT_PATH=${caCertPath} is not a parseable X.509 certificate — IGNORING it and falling through to the bundled Supabase root CA`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`resolveSslConfig: could not read SUPABASE_CA_CERT_PATH=${caCertPath} (${message}) — falling through to the bundled Supabase root CA`);
    }
  }

  // (3) bundled root — the guaranteed floor (build-traced constant). Observable
  // so a pinned-vs-configured cert is never a guess in the logs.
  console.warn('resolveSslConfig: pinning the bundled Supabase root CA (src/lib/db/supabase-ca.ts)');
  return { ca: SUPABASE_CA_PEM, rejectUnauthorized: true };
}
