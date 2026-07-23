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
import type { PoolConfig } from 'pg';

export type SslConfigOpts = {
  connectionString?: string;
  host?: string;
  local?: boolean;
  caCertPath?: string;
};

export const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

/**
 * Rebuild a canonical PEM from ANY mangled inline form (F1g fold,
 * 2026-07-23): real newlines (untouched), literal `\n` escapes (unescaped),
 * or a dashboard-flattened single line with spaces (base64 body re-wrapped
 * at 64 chars). Returns null when no certificate block is present.
 * Keep byte-aligned with scripts/lib/ssl-config.js.
 */
export function normalizeInlinePem(raw: string): string | null {
  const unescaped = String(raw).replace(/\\n/g, '\n');
  const m = unescaped.match(/-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/);
  if (!m) return null;
  const body = (m[1] ?? '').replace(/\s+/g, '');
  if (!body) return null;
  const lines = body.match(/.{1,64}/g) || [];
  return `-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----\n`;
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
 * - Any non-loopback (cloud Supabase) target: CA-pinned `verify-full`,
 *   reading the CA PEM from SUPABASE_CA_CERT_PATH. THROWS if the env var or
 *   file is missing — fail-fast per Spec 47 §R5. NEVER falls back to
 *   `rejectUnauthorized: false` (banned repo-wide, Spec 113 §4).
 */
export function resolveSslConfig(opts: SslConfigOpts = {}): PoolConfig['ssl'] {
  if (isLocalMode(opts)) {
    return undefined;
  }

  // Inline PEM content takes precedence (F1g fold, 2026-07-23): on Vercel
  // serverless, an env-var FILE PATH cannot work — fs.readFileSync on a
  // dynamic path is invisible to Next.js output tracing, so the cert file
  // never lands in the function bundle (build passes, every DB route 500s at
  // runtime). SUPABASE_CA_CERT carries the certificate CONTENT itself; the
  // PEM is public (committed at scripts/certs/supabase-ca.pem), so
  // content-in-env is safe. Keep byte-aligned with scripts/lib/ssl-config.js.
  const caCertInline = process.env.SUPABASE_CA_CERT;
  if (caCertInline && caCertInline.trim()) {
    // Dashboard env fields mangle multi-line PEMs (newlines flattened to
    // spaces or stored as literal \n) — a mangled PEM yields an EMPTY trust
    // store and the exact SELF_SIGNED_CERT_IN_CHAIN failure the first F1g
    // runtime hit. Rebuild canonically from any of the three forms; throw
    // loud if no certificate block survives (never feed garbage to TLS).
    const ca = normalizeInlinePem(caCertInline);
    if (!ca) {
      throw new Error(
        'resolveSslConfig: SUPABASE_CA_CERT is set but contains no PEM certificate block ' +
          '(-----BEGIN CERTIFICATE----- … -----END CERTIFICATE-----). Re-paste the cert content ' +
          '(scripts/certs/supabase-ca.pem) — refusing to fall back to an unverified connection.'
      );
    }
    return { ca, rejectUnauthorized: true };
  }

  const caCertPath = opts.caCertPath || process.env.SUPABASE_CA_CERT_PATH;
  if (!caCertPath) {
    throw new Error(
      'resolveSslConfig: neither SUPABASE_CA_CERT (inline PEM content) nor ' +
        'SUPABASE_CA_CERT_PATH is set — a non-loopback Postgres ' +
        'target requires CA-pinned verify-full TLS (Spec 113 §4). Refusing to connect ' +
        'without a pinned CA rather than falling back to an unverified connection.'
    );
  }

  let ca: string;
  try {
    ca = fs.readFileSync(caCertPath, 'utf8');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `resolveSslConfig: could not read CA cert at SUPABASE_CA_CERT_PATH=${caCertPath} ` +
        `(${message}). A non-loopback Postgres target requires CA-pinned verify-full ` +
        'TLS (Spec 113 §4) — refusing to fall back to an unverified connection.'
    );
  }

  return { ca, rejectUnauthorized: true };
}
