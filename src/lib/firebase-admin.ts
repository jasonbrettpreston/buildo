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
//   3. <project-root>/secrets/firebase-admin-sdk.json — default convention
//   4. None found in dev → null + logWarn (DEV_MODE cookie bypass keeps working)
//   5. None found in production → throw + logError (misconfiguration must be loud)
//
// Idempotency: production caches forever (rotation = redeploy). Dev tracks
// the source identity (env-var SHA-256 hash for raw JSON, file mtime for
// path-based sources) and re-initializes when the underlying source changes,
// supporting credential rotation during local development without restart.
//
// Security posture (post-WF2 multi-agent review + WF3 follow-up):
//   - Raw JSON.parse errors are NOT logged via logError(err, ...) because
//     SyntaxError messages can include credential snippets ("Unexpected token
//     '-' at position 1234" prints surrounding bytes, which for a service
//     account JSON contains the private_key).
//   - FIREBASE_ADMIN_KEY_PATH is rejected if it contains `..` to block path
//     traversal. Absolute paths and project-relative paths are allowed.
//   - DEFAULT_KEY_PATH is resolved against process.cwd() at module load so
//     existsSync/readFileSync receive an absolute path regardless of where
//     the process was started.
//   - Service account shape validated for required fields BEFORE cert() so we
//     fail with a clear error instead of an opaque firebase-admin one.
//   - Empty-string env vars are normalised to "unset" (treated as absent).
//   - cert() / initializeApp() throws are caught and channelled through the
//     standard prod-throws / dev-null behavior with logError context.
//   - Failures on an *explicit* FIREBASE_ADMIN_KEY_PATH escalate to logError
//     (the user explicitly asked us to use that path); failures on the
//     default path stay at logWarn (the user may have intended no key).
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { initializeApp, getApps, cert, type App, type ServiceAccount } from 'firebase-admin/app';
import { logError, logWarn } from '@/lib/logger';

// Resolve at module load against process.cwd() so existsSync/readFileSync
// receive an absolute path regardless of where the process was started.
// process.cwd() is the project root in our standard run patterns
// (npm run dev, npm run build, next start, vitest).
const DEFAULT_KEY_PATH = path.resolve(process.cwd(), 'secrets', 'firebase-admin-sdk.json');

// Cache state. In dev we also track the source identity that produced the
// cached app so credential rotation triggers a re-init without restart.
// In production this stays unused (cache forever — rotation = redeploy).
type CacheEntry = { app: App; sourceId: string };
let cache: CacheEntry | null = null;

// Tracks whether we've ever attempted initialization in this process. Distinct
// from `cache !== null` because `cache` can be reset on rotation. Used to gate
// the "adopt an existing default app from firebase-admin's registry" branch:
// we only adopt on the truly first call, never after a rotation, because after
// rotation the existing default was initialized with the OLD credential and
// stamping the new sourceId onto it would silently serve stale credentials
// forever (caught by WF3 reviewer; was a CRITICAL-severity hidden-state bug).
let initializationAttempted = false;

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

// Truncated SHA-256 — enough entropy for change detection, short enough to be
// log-friendly, doesn't reverse to plaintext. NOT a cryptographic guarantee.
function shortHash(s: string): string {
  return createHash('sha256').update(s).digest('hex').slice(0, 16);
}

// Compute the identity of the credential source. Used in dev to detect rotation.
// Returns 'none' if no source is available (cache won't activate).
function computeSourceId(): string {
  const envJson = readEnv('FIREBASE_SERVICE_ACCOUNT_KEY');
  if (envJson) return `env:${shortHash(envJson)}`;

  const explicitPath = readEnv('FIREBASE_ADMIN_KEY_PATH');
  if (explicitPath && isSafePath(explicitPath) && existsSync(explicitPath)) {
    try {
      const stat = statSync(explicitPath);
      return `path:${explicitPath}:${stat.mtimeMs}`;
    } catch {
      return `path:${explicitPath}:unstattable`;
    }
  }

  if (existsSync(DEFAULT_KEY_PATH)) {
    try {
      const stat = statSync(DEFAULT_KEY_PATH);
      return `default:${stat.mtimeMs}`;
    } catch {
      return `default:unstattable`;
    }
  }

  return 'none';
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

// `isExplicit` distinguishes an explicit FIREBASE_ADMIN_KEY_PATH from the
// default-path fallback. Explicit-path failures escalate to logError because
// the user explicitly requested that path; default-path failures stay at
// logWarn since the user may have intended no key (DEV_MODE bypass).
function loadFromPath(filePath: string, isExplicit: boolean): Record<string, unknown> | null {
  if (!isSafePath(filePath)) {
    const err = new Error(
      `firebase-admin: refusing to read service account from path containing '..' — ${filePath}`,
    );
    logError('[firebase-admin/init]', err, { source: 'file', path: filePath, stage: 'path-validation' });
    throw err;
  }
  if (!existsSync(filePath)) {
    if (isExplicit) {
      // The user pointed us at a non-existent file — this is louder than the
      // default-path fallback finding nothing. logError so it's surfaced.
      logError(
        '[firebase-admin/init]',
        new Error(`FIREBASE_ADMIN_KEY_PATH points at non-existent file: ${filePath}`),
        { source: 'file', path: filePath, stage: 'existsSync' },
      );
    }
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    // SECURITY: as in loadFromEnvJson, don't pass the raw err object — the
    // file content (which IS the credential) could end up in error messages.
    if (isProduction()) {
      logError(
        '[firebase-admin/init]',
        new Error(`failed to read or parse service account file at ${filePath}`),
        { source: 'file', path: filePath, stage: 'JSON.parse' },
      );
      throw new Error(
        `firebase-admin: failed to read or parse service account file at ${filePath}`,
      );
    }
    if (isExplicit) {
      // Explicit path failure → logError (the user asked for this path).
      logError(
        '[firebase-admin/init]',
        new Error(`failed to read or parse service account file at ${filePath}`),
        { source: 'file', path: filePath, stage: 'JSON.parse' },
      );
    } else {
      // Default-path failure → logWarn (current behavior; user may have intended no key).
      logWarn(
        '[firebase-admin/init]',
        'failed to read or parse service account file',
        { path: filePath },
      );
    }
    return null;
  }
  if (!hasRequiredServiceAccountFields(parsed)) {
    const err = new Error(
      `firebase-admin: service account JSON at ${filePath} is parsed but missing required fields`,
    );
    logError('[firebase-admin/init]', err, { source: 'file', path: filePath, stage: 'shape-check' });
    if (isProduction()) throw err;
    return null;
  }
  return parsed;
}

export function getFirebaseAdmin(): App | null {
  // Production: cache forever once initialized. Rotation = redeploy.
  if (isProduction() && cache !== null) return cache.app;

  // Dev: check whether the source identity has changed since last init.
  // If unchanged, reuse cache. If changed, fall through to re-init.
  if (!isProduction() && cache !== null) {
    const currentSourceId = computeSourceId();
    if (currentSourceId === cache.sourceId) return cache.app;
    // Source rotated — clear cache. The old App stays in firebase-admin's
    // registry under '[DEFAULT]'; we'll reuse-or-replace below.
    cache = null;
  }

  // firebase-admin maintains its own registry. Adopt an existing default app
  // ONLY on the truly first call this process — never after a rotation.
  // After rotation, the existing default was initialized with the OLD
  // credential; reusing it would silently serve stale credentials. Instead,
  // we let the normal init flow attempt initializeApp again — firebase-admin
  // throws "default app already exists", our try/catch logs and (in dev)
  // returns null. Honest failure beats silent stale-app reuse.
  if (cache === null && !initializationAttempted) {
    const existingDefault = getApps().find((a) => a.name === '[DEFAULT]');
    if (existingDefault) {
      initializationAttempted = true;
      cache = { app: existingDefault, sourceId: computeSourceId() };
      return cache.app;
    }
  }

  // Resolve credentials per Spec 13 §3 priority order.
  let serviceAccount: Record<string, unknown> | null = loadFromEnvJson();

  if (!serviceAccount) {
    const explicitPath = readEnv('FIREBASE_ADMIN_KEY_PATH');
    if (explicitPath) {
      serviceAccount = loadFromPath(explicitPath, true);
    }
  }

  if (!serviceAccount) {
    serviceAccount = loadFromPath(DEFAULT_KEY_PATH, false);
  }

  if (!serviceAccount) {
    if (isProduction()) {
      const err = new Error(
        'firebase-admin: no service account found. Set FIREBASE_SERVICE_ACCOUNT_KEY (raw JSON) ' +
          'or FIREBASE_ADMIN_KEY_PATH (filesystem path) or place key at ' +
          DEFAULT_KEY_PATH +
          '.',
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
  // even after our shape check passes. Also: in dev rotation, initializeApp
  // throws "Firebase app named '[DEFAULT]' already exists" because we cannot
  // synchronously deleteApp the prior default (deleteApp is async). Catch
  // both, channel through the standard prod-throws / dev-null contract, and
  // mark initializationAttempted so subsequent calls don't re-adopt the
  // stale default.
  initializationAttempted = true;
  try {
    const app = initializeApp({ credential: cert(serviceAccount as unknown as ServiceAccount) });
    cache = { app, sourceId: computeSourceId() };
    return app;
  } catch (err) {
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
