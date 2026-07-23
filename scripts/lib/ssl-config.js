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
 *   - Any non-loopback (cloud Supabase) target: CA-pinned `verify-full`. CA
 *     source precedence (F1g fold 2026-07-23): SUPABASE_CA_CERT (inline PEM) >
 *     SUPABASE_CA_CERT_PATH (file) > the committed bundled Supabase root
 *     (scripts/certs/supabase-ca.pem). No env var needed — the bundled default
 *     covers the one host this app targets; env vars are the rotation/override
 *     path. THROWS only on an explicit-but-unreadable path or an
 *     unrepairable inline value. NEVER falls back to `rejectUnauthorized:
 *     false` (banned repo-wide, Spec 113 §4).
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
const path = require('path');

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

/**
 * Rebuild a canonical PEM from ANY mangled inline form (F1g fold,
 * 2026-07-23): real newlines (untouched), literal `\n` escapes (unescaped),
 * or a dashboard-flattened single line with spaces (base64 body re-wrapped
 * at 64 chars). Returns null when no certificate block is present.
 * Keep byte-aligned with src/lib/db/ssl-config.ts.
 * @param {string} raw
 * @returns {string|null}
 */
function normalizeInlinePem(raw) {
  const unescaped = String(raw).replace(/\\n/g, '\n');
  // ALL certificate blocks, in order (Round-2 fold, Gemini+DeepSeek converge):
  // node's TLS `ca` accepts concatenated PEMs, and CA BUNDLES are standard
  // practice — silently keeping only the first block would truncate a bundle.
  const blocks = [...unescaped.matchAll(/-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/g)];
  const rebuilt = [];
  for (const m of blocks) {
    const body = (m[1] || '').replace(/\s+/g, '');
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
    // Both-set ambiguity warn (Guardian G2 fold): a lingering inline paste in
    // a dev .env silently overrides the path form for every dotenv-loading
    // script (migrate/restore-db) — make the precedence observable. Fires
    // ONLY when both are set; single-source configs stay quiet.
    if (process.env.SUPABASE_CA_CERT_PATH) {
      console.warn(
        'resolveSslConfig: SUPABASE_CA_CERT (inline) is taking precedence over SUPABASE_CA_CERT_PATH — both are set'
      );
    }
    // Dashboard env fields mangle multi-line PEMs (newlines flattened to
    // spaces or stored as literal \n) — a mangled PEM yields an EMPTY trust
    // store and the exact SELF_SIGNED_CERT_IN_CHAIN failure the first F1g
    // runtime hit. Rebuild canonically from any of the three forms; throw
    // loud if no certificate block survives (never feed garbage to TLS).
    const ca = normalizeInlinePem(caCertInline);
    if (!ca) {
      throw new Error(
        'resolveSslConfig: SUPABASE_CA_CERT is set but contains no PEM certificate block ' +
          '(-----BEGIN CERTIFICATE----- … -----END CERTIFICATE-----). Ensure the VARIABLE holds the ' +
          'certificate CONTENT (e.g. the text of scripts/certs/supabase-ca.pem), not a file path — ' +
          'refusing to fall back to an unverified connection.'
      );
    }
    return { ca, rejectUnauthorized: true };
  }

  const caCertPath = o.caCertPath || process.env.SUPABASE_CA_CERT_PATH;
  if (!caCertPath) {
    // Bundled fallback (F1g fold, 2026-07-23): no env var configured → pin the
    // committed Supabase Root CA. The JS twin runs on a runner/CI where the
    // committed PEM file is always present, so it reads it directly (the TS
    // twin, bundled for Vercel where fs is unreliable, imports the constant
    // from src/lib/db/supabase-ca.ts — the two are byte-identical, drift-
    // locked by src/tests/ssl-config.logic.test.ts). Still CA-pinned verify-
    // full, never rejectUnauthorized:false — a non-Supabase target fails
    // CLOSED at handshake, not open. Observable, not silent (Gemini/Guardian).
    console.warn('resolveSslConfig: no CA env var set — pinning the bundled Supabase root CA (scripts/certs/supabase-ca.pem)');
    const bundledPath = path.join(__dirname, '..', 'certs', 'supabase-ca.pem');
    try {
      return { ca: fs.readFileSync(bundledPath, 'utf8'), rejectUnauthorized: true };
    } catch (err) {
      // Descriptive over a raw ENOENT (Guardian LOW) — still fail-closed.
      throw new Error(
        `resolveSslConfig: bundled CA at ${bundledPath} is unreadable (${err.message}) and no CA env ` +
          'var is set — refusing to fall back to an unverified connection.'
      );
    }
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
  // Content validation only (Round-2 fold, Gemini MED): an empty/garbage FILE
  // previously produced an opaque OpenSSL "no start line" failure downstream.
  // Validate the same way as the inline form but pass the ORIGINAL bytes —
  // pre-existing path-form consumers keep byte-identical behavior.
  if (normalizeInlinePem(ca) === null) {
    throw new Error(
      `resolveSslConfig: file at SUPABASE_CA_CERT_PATH=${caCertPath} contains no PEM certificate ` +
        'block — refusing to fall back to an unverified connection.'
    );
  }

  return { ca, rejectUnauthorized: true };
}

module.exports = { resolveSslConfig, isLocalMode, extractHost, normalizeInlinePem, LOOPBACK_HOSTS };
