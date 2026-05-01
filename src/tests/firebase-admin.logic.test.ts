// SPEC LINK: docs/specs/00-architecture/13_authentication.md §3 (auth architecture
//             — Firebase Admin SDK init source resolution + DEV_MODE preservation)
//             docs/specs/00-architecture/13_authentication.md §4a Known Failure Modes
//             (the silent-401 failure mode this guard prevents)
//
// Verifies the 5 init-resolution paths from the spec § 3 priority list:
//   1. FIREBASE_SERVICE_ACCOUNT_KEY env (raw JSON) → initialize
//   2. FIREBASE_ADMIN_KEY_PATH env (filesystem path) → initialize
//   3. ./secrets/firebase-admin-sdk.json default → initialize
//   4. None found in dev → null + logWarn (DEV_MODE bypass keeps working)
//   5. None found in production → throw + logError
// Plus security/correctness regressions caught by adversarial review:
//   - Idempotency: multiple calls reuse the same default app
//   - Empty-string env var treated as unset (not crashed)
//   - Service account shape validation (missing private_key, etc.) → throw/null
//   - Path traversal blocked (FIREBASE_ADMIN_KEY_PATH containing `..`)
//   - Existing NAMED app does NOT spoof default-app reuse
//   - Malformed env JSON throws in BOTH dev and production
//   - JSON.parse error does NOT log raw err (private_key leak prevention)
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const mockInitializeApp = vi.fn();
const mockGetApps = vi.fn();
const mockCert = vi.fn();

vi.mock('firebase-admin/app', () => ({
  initializeApp: mockInitializeApp,
  getApps: mockGetApps,
  cert: mockCert,
}));

vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
  logWarn: vi.fn(),
  logInfo: vi.fn(),
}));

const mockReadFileSync = vi.fn();
const mockExistsSync = vi.fn();
vi.mock('node:fs', () => ({
  readFileSync: mockReadFileSync,
  existsSync: mockExistsSync,
  default: { readFileSync: mockReadFileSync, existsSync: mockExistsSync },
}));

const ENV_KEYS = [
  'NODE_ENV',
  'FIREBASE_SERVICE_ACCOUNT_KEY',
  'FIREBASE_ADMIN_KEY_PATH',
] as const;
type EnvSnapshot = Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>;

function snapshotEnv(): EnvSnapshot {
  const snap: EnvSnapshot = {};
  for (const k of ENV_KEYS) snap[k] = process.env[k];
  return snap;
}

function restoreEnv(snap: EnvSnapshot) {
  for (const k of ENV_KEYS) {
    if (snap[k] === undefined) {
      delete (process.env as Record<string, string | undefined>)[k];
    } else {
      (process.env as Record<string, string | undefined>)[k] = snap[k];
    }
  }
}

const VALID_SERVICE_ACCOUNT_JSON = JSON.stringify({
  type: 'service_account',
  project_id: 'buildo-test',
  private_key_id: 'fake',
  private_key: '-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----\n',
  client_email: 'firebase-adminsdk@buildo-test.iam.gserviceaccount.com',
  client_id: '0',
  token_uri: 'https://oauth2.googleapis.com/token',
});

describe('getFirebaseAdmin', () => {
  let envSnapshot: EnvSnapshot;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    envSnapshot = snapshotEnv();
    mockGetApps.mockReturnValue([]);
    mockInitializeApp.mockImplementation(() => ({ name: '[DEFAULT]' }));
    mockCert.mockImplementation((arg: unknown) => ({ _cert: arg }));
    delete (process.env as Record<string, string | undefined>).FIREBASE_SERVICE_ACCOUNT_KEY;
    delete (process.env as Record<string, string | undefined>).FIREBASE_ADMIN_KEY_PATH;
    mockExistsSync.mockReturnValue(false);
    mockReadFileSync.mockImplementation(() => {
      throw new Error('readFileSync called without explicit mock setup');
    });
  });

  afterEach(() => {
    restoreEnv(envSnapshot);
  });

  it('initializes from FIREBASE_SERVICE_ACCOUNT_KEY env var (raw JSON) — priority 1', async () => {
    (process.env as Record<string, string>).NODE_ENV = 'development';
    (process.env as Record<string, string>).FIREBASE_SERVICE_ACCOUNT_KEY = VALID_SERVICE_ACCOUNT_JSON;
    const { getFirebaseAdmin } = await import('@/lib/firebase-admin');
    const result = getFirebaseAdmin();
    expect(result).not.toBeNull();
    expect(mockCert).toHaveBeenCalledTimes(1);
    expect(mockCert).toHaveBeenCalledWith(expect.objectContaining({ project_id: 'buildo-test' }));
    expect(mockInitializeApp).toHaveBeenCalledTimes(1);
    expect(mockReadFileSync).not.toHaveBeenCalled();
  });

  it('initializes from FIREBASE_ADMIN_KEY_PATH env var (filesystem path) — priority 2', async () => {
    (process.env as Record<string, string>).NODE_ENV = 'development';
    (process.env as Record<string, string>).FIREBASE_ADMIN_KEY_PATH = '/explicit/override.json';
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(VALID_SERVICE_ACCOUNT_JSON);
    const { getFirebaseAdmin } = await import('@/lib/firebase-admin');
    const result = getFirebaseAdmin();
    expect(result).not.toBeNull();
    expect(mockExistsSync).toHaveBeenCalledWith('/explicit/override.json');
    expect(mockReadFileSync).toHaveBeenCalledWith('/explicit/override.json', 'utf8');
    expect(mockCert).toHaveBeenCalledWith(expect.objectContaining({ project_id: 'buildo-test' }));
    expect(mockInitializeApp).toHaveBeenCalledTimes(1);
  });

  it('falls back to ./secrets/firebase-admin-sdk.json when env vars unset — priority 3', async () => {
    (process.env as Record<string, string>).NODE_ENV = 'development';
    mockExistsSync.mockImplementation((p: string) => p.endsWith('secrets/firebase-admin-sdk.json'));
    mockReadFileSync.mockImplementation((p: string) => {
      if (p.endsWith('secrets/firebase-admin-sdk.json')) return VALID_SERVICE_ACCOUNT_JSON;
      throw new Error(`Unexpected read: ${p}`);
    });
    const { getFirebaseAdmin } = await import('@/lib/firebase-admin');
    const result = getFirebaseAdmin();
    expect(result).not.toBeNull();
    expect(mockInitializeApp).toHaveBeenCalledTimes(1);
  });

  it('returns null + logs warning in dev when no key is found — priority 4 (DEV_MODE bypass survives)', async () => {
    (process.env as Record<string, string>).NODE_ENV = 'development';
    const logger = await import('@/lib/logger');
    const { getFirebaseAdmin } = await import('@/lib/firebase-admin');
    const result = getFirebaseAdmin();
    expect(result).toBeNull();
    expect(logger.logWarn).toHaveBeenCalledWith(
      expect.stringContaining('firebase-admin'),
      expect.any(String),
      expect.any(Object),
    );
    expect(mockInitializeApp).not.toHaveBeenCalled();
  });

  it('throws + logs error in production when no key is found — priority 5', async () => {
    (process.env as Record<string, string>).NODE_ENV = 'production';
    const logger = await import('@/lib/logger');
    const { getFirebaseAdmin } = await import('@/lib/firebase-admin');
    expect(() => getFirebaseAdmin()).toThrow(/firebase-admin/i);
    expect(logger.logError).toHaveBeenCalled();
    expect(mockInitializeApp).not.toHaveBeenCalled();
  });

  it('is idempotent — calling twice does NOT re-initialize when an app already exists', async () => {
    (process.env as Record<string, string>).NODE_ENV = 'development';
    (process.env as Record<string, string>).FIREBASE_SERVICE_ACCOUNT_KEY = VALID_SERVICE_ACCOUNT_JSON;
    const { getFirebaseAdmin } = await import('@/lib/firebase-admin');
    const first = getFirebaseAdmin();
    mockGetApps.mockReturnValue([{ name: '[DEFAULT]' }]);
    const second = getFirebaseAdmin();
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(mockInitializeApp).toHaveBeenCalledTimes(1);
  });

  // SECURITY/CORRECTNESS regressions caught by adversarial review

  it('throws in dev too when FIREBASE_SERVICE_ACCOUNT_KEY contains malformed JSON (review HIGH-4)', async () => {
    (process.env as Record<string, string>).NODE_ENV = 'development';
    (process.env as Record<string, string>).FIREBASE_SERVICE_ACCOUNT_KEY = 'not-valid-json{';
    const { getFirebaseAdmin } = await import('@/lib/firebase-admin');
    expect(() => getFirebaseAdmin()).toThrow(/FIREBASE_SERVICE_ACCOUNT_KEY/);
  });

  it('throws in production when FIREBASE_SERVICE_ACCOUNT_KEY contains malformed JSON', async () => {
    (process.env as Record<string, string>).NODE_ENV = 'production';
    (process.env as Record<string, string>).FIREBASE_SERVICE_ACCOUNT_KEY = 'not-valid-json{';
    const { getFirebaseAdmin } = await import('@/lib/firebase-admin');
    expect(() => getFirebaseAdmin()).toThrow();
    expect(mockInitializeApp).not.toHaveBeenCalled();
  });

  it('does NOT pass the raw error object to logError when JSON.parse fails — prevents private_key leak (review CRITICAL-1 Gemini)', async () => {
    (process.env as Record<string, string>).NODE_ENV = 'development';
    (process.env as Record<string, string>).FIREBASE_SERVICE_ACCOUNT_KEY = '{"private_key":"-----BEGIN PRIVATE KEY-----\\nABC';
    const logger = await import('@/lib/logger');
    const { getFirebaseAdmin } = await import('@/lib/firebase-admin');
    expect(() => getFirebaseAdmin()).toThrow();
    // logError must have been called, but the err arg passed to it must NOT
    // be the original SyntaxError (whose message can contain credential bytes).
    const calls = (logger.logError as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      const errArg = call[1] as Error;
      // The err passed to logError must be our own constructed Error, not a
      // raw SyntaxError from JSON.parse. SyntaxError messages from V8 like
      // "Unexpected end of JSON input" or "Unexpected token X at position N"
      // can include surrounding bytes — must not appear here.
      expect(errArg.message).not.toMatch(/Unexpected token|Unexpected end of/);
      expect(errArg.message).not.toContain('BEGIN PRIVATE KEY');
    }
  });

  it('treats empty-string FIREBASE_SERVICE_ACCOUNT_KEY="" as unset (review HIGH-7 Gemini)', async () => {
    (process.env as Record<string, string>).NODE_ENV = 'development';
    (process.env as Record<string, string>).FIREBASE_SERVICE_ACCOUNT_KEY = '';
    // Empty env var should fall through to next priority — file path lookup
    // (none present here) → ultimately null + warning, NOT a JSON.parse crash.
    const { getFirebaseAdmin } = await import('@/lib/firebase-admin');
    const result = getFirebaseAdmin();
    expect(result).toBeNull();
    expect(mockInitializeApp).not.toHaveBeenCalled();
  });

  it('treats whitespace-only FIREBASE_SERVICE_ACCOUNT_KEY="   " as unset', async () => {
    (process.env as Record<string, string>).NODE_ENV = 'development';
    (process.env as Record<string, string>).FIREBASE_SERVICE_ACCOUNT_KEY = '   ';
    const { getFirebaseAdmin } = await import('@/lib/firebase-admin');
    const result = getFirebaseAdmin();
    expect(result).toBeNull();
    expect(mockInitializeApp).not.toHaveBeenCalled();
  });

  it('rejects FIREBASE_ADMIN_KEY_PATH containing `..` to block path traversal (review HIGH-3)', async () => {
    (process.env as Record<string, string>).NODE_ENV = 'development';
    (process.env as Record<string, string>).FIREBASE_ADMIN_KEY_PATH = '../../../etc/passwd';
    const { getFirebaseAdmin } = await import('@/lib/firebase-admin');
    expect(() => getFirebaseAdmin()).toThrow(/refusing to read.*\.\./i);
    expect(mockReadFileSync).not.toHaveBeenCalled();
  });

  it('throws when FIREBASE_SERVICE_ACCOUNT_KEY parses but is missing required fields (review HIGH-4)', async () => {
    (process.env as Record<string, string>).NODE_ENV = 'development';
    // JSON parses successfully but is missing private_key and client_email
    (process.env as Record<string, string>).FIREBASE_SERVICE_ACCOUNT_KEY = JSON.stringify({
      project_id: 'only-project-id',
    });
    const { getFirebaseAdmin } = await import('@/lib/firebase-admin');
    expect(() => getFirebaseAdmin()).toThrow(/missing required fields/i);
    expect(mockCert).not.toHaveBeenCalled();
    expect(mockInitializeApp).not.toHaveBeenCalled();
  });

  it('does NOT reuse a NAMED app as the default (review HIGH-5 DeepSeek)', async () => {
    (process.env as Record<string, string>).NODE_ENV = 'development';
    (process.env as Record<string, string>).FIREBASE_SERVICE_ACCOUNT_KEY = VALID_SERVICE_ACCOUNT_JSON;
    // Simulate a named app already present (NOT '[DEFAULT]')
    mockGetApps.mockReturnValue([{ name: 'secondary' }]);
    const { getFirebaseAdmin } = await import('@/lib/firebase-admin');
    const result = getFirebaseAdmin();
    expect(result).not.toBeNull();
    // initializeApp should still be called — the named app is NOT reused as default
    expect(mockInitializeApp).toHaveBeenCalledTimes(1);
  });

  it('reuses the existing default app when getApps() includes one named "[DEFAULT]"', async () => {
    (process.env as Record<string, string>).NODE_ENV = 'development';
    const existingDefault = { name: '[DEFAULT]', _existing: true };
    mockGetApps.mockReturnValue([{ name: 'secondary' }, existingDefault]);
    const { getFirebaseAdmin } = await import('@/lib/firebase-admin');
    const result = getFirebaseAdmin();
    expect(result).toBe(existingDefault);
    expect(mockInitializeApp).not.toHaveBeenCalled();
  });

  it('returns null in dev when cert() throws on a structurally invalid credential (review CRITICAL-2)', async () => {
    (process.env as Record<string, string>).NODE_ENV = 'development';
    (process.env as Record<string, string>).FIREBASE_SERVICE_ACCOUNT_KEY = VALID_SERVICE_ACCOUNT_JSON;
    mockCert.mockImplementation(() => {
      throw new Error('Failed to parse private key — bad PEM');
    });
    const logger = await import('@/lib/logger');
    const { getFirebaseAdmin } = await import('@/lib/firebase-admin');
    const result = getFirebaseAdmin();
    expect(result).toBeNull();
    expect(logger.logError).toHaveBeenCalledWith(
      expect.stringContaining('firebase-admin'),
      expect.objectContaining({ message: expect.stringContaining('initializeApp failed') }),
      expect.any(Object),
    );
  });

  it('throws in production when cert() throws on a structurally invalid credential', async () => {
    (process.env as Record<string, string>).NODE_ENV = 'production';
    (process.env as Record<string, string>).FIREBASE_SERVICE_ACCOUNT_KEY = VALID_SERVICE_ACCOUNT_JSON;
    mockCert.mockImplementation(() => {
      throw new Error('Failed to parse private key — bad PEM');
    });
    const { getFirebaseAdmin } = await import('@/lib/firebase-admin');
    expect(() => getFirebaseAdmin()).toThrow(/private key|PEM/i);
  });
});
