/**
 * Shared TLS config helper — the ONLY place a `pg` Pool/Client `ssl` config
 * object is constructed for pipeline/migration code (Spec 113 §4.1).
 *
 * `scripts/lib/pipeline.js` (createPool), `scripts/migrate.js`, and
 * `scripts/validation/run-step.mjs` MUST import this rather than construct
 * their own `ssl` key. Any new Postgres pool anywhere in the codebase MUST
 * go through this helper (§0.2b pool sweep) or carry an explicit
 * `// LOCAL-ONLY` annotation for hardcoded-localhost diagnostic scripts.
 *
 * Rules (Spec 113 §4.2):
 *   - Local `supabase start` / Docker dev DB / CI containers (loopback host,
 *     or explicit local-mode override): no TLS.
 *   - Any non-loopback (cloud Supabase) target: CA-pinned `verify-full`,
 *     reading the CA PEM from SUPABASE_CA_CERT_PATH. THROWS if the env var
 *     or file is missing — fail-fast per Spec 47 §R5. NEVER falls back to
 *     `rejectUnauthorized: false` (banned repo-wide, Spec 113 §4).
 *
 * Twin: `src/lib/db/client.ts` imports `src/lib/db/ssl-config.ts`, a
 * manually-synced TS mirror of this file (ADR-001 dual code path —
 * `docs/adr/001-dual-code-path.md` — Next.js server code bundled for Vercel
 * does not cleanly reach into `scripts/lib/` at runtime, matching the
 * existing precedent for classification/scoring/scope logic). Keep both
 * files' LOOPBACK_HOSTS set and branch logic byte-for-byte aligned.
 *
 * SPEC LINK: docs/specs/00-architecture/113_supabase_infrastructure.md
 */
'use strict';

const fs = require('fs');

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

/**
 * Resolve the target host from either connection-string style opts
 * (`connectionString` — DATABASE_URL/SUPABASE_DATABASE_URL) or discrete
 * options style (`host` — PG_HOST etc.). Falls back to SUPABASE_DATABASE_URL
 * only when the caller supplied neither (covers future call sites that read
 * the D14 cloud env var directly without threading it through `opts`) —
 * callers that explicitly pass `host`/`connectionString` (all 4 current
 * canonical sites) are never affected by this fallback.
 *
 * @param {{connectionString?: string, host?: string}} opts
 * @returns {string|undefined}
 */
function extractHost(opts) {
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

/**
 * @param {{connectionString?: string, host?: string, local?: boolean}} opts
 * @returns {boolean}
 */
function isLocalMode(opts) {
  if (opts.local === true) return true;
  if (process.env.PGSSL_DISABLE === '1') return true;
  const resolvedHost = extractHost(opts);
  if (!resolvedHost) return false;
  return LOOPBACK_HOSTS.has(resolvedHost.toLowerCase());
}

/**
 * Resolve the `ssl` value for a `pg` Pool/Client config.
 *
 * @param {object} [opts]
 * @param {string} [opts.connectionString] - DATABASE_URL/SUPABASE_DATABASE_URL style config
 * @param {string} [opts.host] - discrete-options host (PG_HOST etc.)
 * @param {boolean} [opts.local] - explicit local-mode override, bypasses host sniffing
 * @param {string} [opts.caCertPath] - override for SUPABASE_CA_CERT_PATH (tests)
 * @returns {undefined|{ca: string, rejectUnauthorized: true}}
 */
function resolveSslConfig(opts) {
  const o = opts || {};

  if (isLocalMode(o)) {
    return undefined;
  }

  // Inline PEM content takes precedence (F1g fold, 2026-07-23): on Vercel
  // serverless, an env-var FILE PATH cannot work — fs.readFileSync on a
  // dynamic path is invisible to Next.js output tracing, so the cert file
  // never lands in the function bundle (build passes, every DB route 500s at
  // runtime). SUPABASE_CA_CERT carries the certificate CONTENT itself; the
  // PEM is public (committed at scripts/certs/supabase-ca.pem), so
  // content-in-env is safe. Keep byte-aligned with src/lib/db/ssl-config.ts.
  const caCertInline = process.env.SUPABASE_CA_CERT;
  if (caCertInline && caCertInline.trim()) {
    return { ca: caCertInline, rejectUnauthorized: true };
  }

  const caCertPath = o.caCertPath || process.env.SUPABASE_CA_CERT_PATH;
  if (!caCertPath) {
    throw new Error(
      'resolveSslConfig: neither SUPABASE_CA_CERT (inline PEM content) nor ' +
        'SUPABASE_CA_CERT_PATH is set — a non-loopback Postgres ' +
        'target requires CA-pinned verify-full TLS (Spec 113 §4). Refusing to connect ' +
        'without a pinned CA rather than falling back to an unverified connection.'
    );
  }

  let ca;
  try {
    ca = fs.readFileSync(caCertPath, 'utf8');
  } catch (err) {
    throw new Error(
      `resolveSslConfig: could not read CA cert at SUPABASE_CA_CERT_PATH=${caCertPath} ` +
        `(${err.message}). A non-loopback Postgres target requires CA-pinned verify-full ` +
        'TLS (Spec 113 §4) — refusing to fall back to an unverified connection.'
    );
  }

  return { ca, rejectUnauthorized: true };
}

module.exports = { resolveSslConfig, isLocalMode, extractHost, LOOPBACK_HOSTS };
