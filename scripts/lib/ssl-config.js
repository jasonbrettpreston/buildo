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
const { X509Certificate } = require('crypto');

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

/**
 * Does `pem` parse as a real X.509 certificate? (F1g fold, 2026-07-23) —
 * normalizeInlinePem repairs FORMATTING but cannot detect TRUNCATION: a
 * partial paste re-wraps into a syntactically-valid-looking PEM whose DER is
 * incomplete, which then fails at the TLS handshake as SELF_SIGNED_CERT. A
 * real X.509 parse catches it so an unusable configured cert can be IGNORED
 * in favor of the bundled default. Keep byte-aligned with src/lib/db/ssl-config.ts.
 * @param {string|null|undefined} pem
 * @returns {boolean}
 */
function isParseableCert(pem) {
  if (!pem) return false;
  try {
    // eslint-disable-next-line no-new
    new X509Certificate(pem);
    return true;
  } catch {
    return false;
  }
}

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

  // CA source precedence with VALIDATED fall-through (F1g fold, 2026-07-23):
  // SUPABASE_CA_CERT (inline) > SUPABASE_CA_CERT_PATH (file) > bundled root.
  // Each configured source is used ONLY if it parses as a real X.509 cert —
  // a truncated/garbage env paste re-wraps into a valid-LOOKING PEM whose DER
  // is incomplete and fails at the TLS handshake as SELF_SIGNED_CERT (the
  // symptom that burned four preview builds). An unusable source is WARNED and
  // skipped, never used and never fatal; the committed bundled root is the
  // guaranteed floor. Every branch returns rejectUnauthorized:true against a
  // real pinned root — fail-closed preserved; a bad paste can't break the app.
  // Keep byte-aligned with src/lib/db/ssl-config.ts.

  // (1) inline env content
  const caCertInline = process.env.SUPABASE_CA_CERT;
  if (caCertInline && caCertInline.trim()) {
    if (process.env.SUPABASE_CA_CERT_PATH) {
      console.warn('resolveSslConfig: SUPABASE_CA_CERT (inline) takes precedence over SUPABASE_CA_CERT_PATH — both are set');
    }
    const ca = normalizeInlinePem(caCertInline);
    if (isParseableCert(ca)) return { ca, rejectUnauthorized: true };
    console.warn('resolveSslConfig: SUPABASE_CA_CERT is set but is not a parseable X.509 certificate (truncated/garbage?) — IGNORING it and falling through to the bundled Supabase root CA');
  }

  // (2) explicit file path
  const caCertPath = o.caCertPath || process.env.SUPABASE_CA_CERT_PATH;
  if (caCertPath) {
    try {
      const ca = fs.readFileSync(caCertPath, 'utf8');
      if (isParseableCert(ca)) return { ca, rejectUnauthorized: true };
      console.warn(`resolveSslConfig: file at SUPABASE_CA_CERT_PATH=${caCertPath} is not a parseable X.509 certificate — IGNORING it and falling through to the bundled Supabase root CA`);
    } catch (err) {
      console.warn(`resolveSslConfig: could not read SUPABASE_CA_CERT_PATH=${caCertPath} (${err.message}) — falling through to the bundled Supabase root CA`);
    }
  }

  // (3) bundled root — the guaranteed floor (committed PEM, always present in
  // the runner/CI context; the TS twin imports the byte-identical constant).
  console.warn('resolveSslConfig: pinning the bundled Supabase root CA (scripts/certs/supabase-ca.pem)');
  const bundledPath = path.join(__dirname, '..', 'certs', 'supabase-ca.pem');
  try {
    return { ca: fs.readFileSync(bundledPath, 'utf8'), rejectUnauthorized: true };
  } catch (err) {
    throw new Error(
      `resolveSslConfig: bundled CA at ${bundledPath} is unreadable (${err.message}) — refusing to fall back to an unverified connection.`
    );
  }
}

module.exports = { resolveSslConfig, isLocalMode, extractHost, normalizeInlinePem, isParseableCert, LOOPBACK_HOSTS };
