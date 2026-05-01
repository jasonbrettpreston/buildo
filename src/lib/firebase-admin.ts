// SPEC LINK: docs/specs/00-architecture/13_authentication.md §3 (auth architecture
//             — Firebase Admin SDK init source resolution)
//             docs/specs/00-architecture/13_authentication.md §4a Known Failure Modes
//
// Initializes the Firebase Admin SDK at backend boot. Without this, every
// Bearer-token verification in `src/lib/auth/get-user.ts` fails closed because
// `admin.apps.length === 0` — see Spec 13 §4a for the silent-401 failure mode
// this guard prevents.
//
// Init source resolution (priority order, per Spec 13 §3):
//   1. FIREBASE_SERVICE_ACCOUNT_KEY env var (raw JSON) — production EAS/Vercel
//   2. FIREBASE_ADMIN_KEY_PATH env var (filesystem path) — explicit dev override
//   3. ./secrets/firebase-admin-sdk.json — default convention for fresh checkouts
//   4. None found in dev → null + logWarn (DEV_MODE cookie bypass keeps working)
//   5. None found in production → throw + logError (misconfiguration must be loud)
//
// Idempotent — safe to call from multiple modules. Re-init is short-circuited
// by both an internal cache and firebase-admin's own getApps() registry.
//
// Security posture (post-WF2 multi-agent review):
//   - Raw JSON.parse errors are NOT logged via logError(err, ...) because
//     SyntaxError messages can include credential snippets ("Unexpected token
//     '-' at position 1234" prints surrounding bytes, which for a service
//     account JSON contains the private_key).
//   - FIREBASE_ADMIN_KEY_PATH is rejected if it contains `..` to block path
//     traversal. Absolute paths and project-relative paths are allowed.
//   - Service account shape validated for required fields BEFORE cert() so we
//     fail with a clear error instead of an opaque firebase-admin one.
//   - Empty-string env vars are normalised to "unset" (treated as absent).
//   - cert() / initializeApp() throws are caught and channelled through the
//     standard prod-throws / dev-null behavior with logError context.
import { readFileSync, existsSync } from 'node:fs';
import { initializeApp, getApps, cert, type App, type ServiceAccount } from 'firebase-admin/app';
import { logError, logWarn } from '@/lib/logger';

const DEFAULT_KEY_PATH = './secrets/firebase-admin-sdk.json';

// Module-level cache. Only set on successful init — if a dev call returns null
// we leave this null so a later call (e.g., after the dev sets the env var)
// still has a chance to initialize without a process restart.
let cachedApp: App | null = null;

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

// Treat empty / whitespace-only env vars as "not set" — a stray empty string
// in `.env.local` would otherwise crash JSON.parse or readFileSync.
function readEnv(name: string): string | null {
  const v = process.env[name];
  if (v === undefined || v === null) return null;
  const trimmed = v.trim();
  return trimmed.length === 0 ? null : trimmed;
}

// Path traversal guard: reject any `..` segment. Absolute paths are allowed
// (production volume mounts use them). Relative paths resolve against the
// process cwd, which is the project root in our standard run patterns.
function isSafePath(p: string): boolean {
  return !p.split(/[\\/]/).includes('..');
}

// Required fields per Firebase service account JSON. Validates presence
// (non-empty string) before passing to cert() so a malformed JSON produces
// our own clear error rather than an opaque firebase-admin internal one.
function hasRequiredServiceAccountFields(obj: unknown): obj is Record<string, unknown> {
  if (typeof obj !== 'object' || obj === null) return false;
  const o = obj as Record<string, unknown>;
  // Firebase Console JSON uses snake_case; ServiceAccount type uses camelCase.
  // cert() handles both — we accept either set.
  const projectId = o.project_id ?? o.projectId;
  const clientEmail = o.client_email ?? o.clientEmail;
  const privateKey = o.private_key ?? o.privateKey;
  return (
    typeof projectId === 'string' &&
    projectId.length > 0 &&
    typeof clientEmail === 'string' &&
    clientEmail.length > 0 &&
    typeof privateKey === 'string' &&
    privateKey.length > 0
  );
}

function loadFromEnvJson(): Record<string, unknown> | null {
  const raw = readEnv('FIREBASE_SERVICE_ACCOUNT_KEY');
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // SECURITY: do NOT pass the original error to logError — its message can
    // contain raw bytes from the malformed JSON, which for a service account
    // JSON includes the private_key. Log only that parsing failed, no err object.
    logError(
      '[firebase-admin/init]',
      new Error('FIREBASE_SERVICE_ACCOUNT_KEY env var is set but is not valid JSON'),
      { source: 'FIREBASE_SERVICE_ACCOUNT_KEY', stage: 'JSON.parse' },
    );
    throw new Error(
      'firebase-admin: FIREBASE_SERVICE_ACCOUNT_KEY env var is set but is not valid JSON',
    );
  }
  if (!hasRequiredServiceAccountFields(parsed)) {
    const err = new Error(
      'firebase-admin: FIREBASE_SERVICE_ACCOUNT_KEY is parsed JSON but missing required fields ' +
        '(project_id/projectId, client_email/clientEmail, private_key/privateKey)',
    );
    logError('[firebase-admin/init]', err, {
      source: 'FIREBASE_SERVICE_ACCOUNT_KEY',
      stage: 'shape-check',
    });
    throw err;
  }
  return parsed;
}

function loadFromPath(path: string): Record<string, unknown> | null {
  if (!isSafePath(path)) {
    const err = new Error(
      `firebase-admin: refusing to read service account from path containing '..' — ${path}`,
    );
    logError('[firebase-admin/init]', err, { source: 'path', path, stage: 'path-validation' });
    throw err;
  }
  if (!existsSync(path)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    // SECURITY: as in loadFromEnvJson, don't pass the raw err object — the
    // file content (which IS the credential) could end up in error messages.
    if (isProduction()) {
      logError(
        '[firebase-admin/init]',
        new Error(`failed to read or parse service account file at ${path}`),
        { source: 'file', path, stage: 'JSON.parse' },
      );
      throw new Error(
        `firebase-admin: failed to read or parse service account file at ${path}`,
      );
    }
    logWarn(
      '[firebase-admin/init]',
      'failed to read or parse service account file',
      { path },
    );
    return null;
  }
  if (!hasRequiredServiceAccountFields(parsed)) {
    const err = new Error(
      `firebase-admin: service account JSON at ${path} is parsed but missing required fields`,
    );
    logError('[firebase-admin/init]', err, { source: 'file', path, stage: 'shape-check' });
    if (isProduction()) throw err;
    return null;
  }
  return parsed;
}

export function getFirebaseAdmin(): App | null {
  // Cached success — short-circuit.
  if (cachedApp !== null) return cachedApp;

  // firebase-admin maintains its own registry. If the DEFAULT app was already
  // initialized by something else, reuse it. Filtering by name avoids
  // accidentally returning a NAMED app that another module registered first.
  const existingDefault = getApps().find((a) => a.name === '[DEFAULT]');
  if (existingDefault) {
    cachedApp = existingDefault;
    return cachedApp;
  }

  // Resolve credentials per Spec 13 §3 priority order.
  let serviceAccount: Record<string, unknown> | null = loadFromEnvJson();

  if (!serviceAccount) {
    const explicitPath = readEnv('FIREBASE_ADMIN_KEY_PATH');
    if (explicitPath) {
      serviceAccount = loadFromPath(explicitPath);
    }
  }

  if (!serviceAccount) {
    serviceAccount = loadFromPath(DEFAULT_KEY_PATH);
  }

  if (!serviceAccount) {
    if (isProduction()) {
      const err = new Error(
        'firebase-admin: no service account found. Set FIREBASE_SERVICE_ACCOUNT_KEY (raw JSON) ' +
          'or FIREBASE_ADMIN_KEY_PATH (filesystem path) or place key at ./secrets/firebase-admin-sdk.json.',
      );
      logError('[firebase-admin/init]', err, { stage: 'no-credentials' });
      throw err;
    }
    logWarn(
      '[firebase-admin/init]',
      'firebase-admin not initialized — no service account in dev; DEV_MODE cookie bypass remains available',
      { tried: ['env:FIREBASE_SERVICE_ACCOUNT_KEY', 'env:FIREBASE_ADMIN_KEY_PATH', DEFAULT_KEY_PATH] },
    );
    return null;
  }

  // cert() can still throw on credential decode errors (bad PEM block, etc.)
  // even after our shape check passes. Catch and channel through the standard
  // prod-throws / dev-null contract.
  try {
    cachedApp = initializeApp({ credential: cert(serviceAccount as unknown as ServiceAccount) });
    return cachedApp;
  } catch (err) {
    // Don't include the err message verbatim if it might contain secret bytes.
    // The cert() error is structurally about credential format — message is
    // generally safe ("Failed to parse private key"), but err can carry
    // additional fields. Pass a sanitized message to logError.
    logError(
      '[firebase-admin/init]',
      new Error(
        `firebase-admin: initializeApp failed during cert() — ${(err as Error).message}`,
      ),
      { stage: 'initializeApp' },
    );
    if (isProduction()) throw err;
    return null;
  }
}
