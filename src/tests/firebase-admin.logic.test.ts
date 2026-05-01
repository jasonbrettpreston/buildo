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
const mockStatSync = vi.fn();
vi.mock('node:fs', () => ({
  readFileSync: mockReadFileSync,
  existsSync: mockExistsSync,
  statSync: mockStatSync,
  default: { readFileSync: mockReadFileSync, existsSync: mockExistsSync, statSync: mockStatSync },
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
    // Default statSync mock — tests that need mtime tracking override this.
    mockStatSync.mockImplementation(() => ({ mtime: new Date(0), mtimeMs: 0 }));
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
    // Slash-agnostic — DEFAULT_KEY_PATH is absolute via path.resolve(), which
    // produces backslashes on Windows. Normalise to forward slashes for the suffix check.
    const matchesDefault = (p: string) => p.replace(/\\/g, '/').endsWith('secrets/firebase-admin-sdk.json');
    mockExistsSync.mockImplementation((p: string) => matchesDefault(p));
    mockReadFileSync.mockImplementation((p: string) => {
      if (matchesDefault(p)) return VALID_SERVICE_ACCOUNT_JSON;
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

  // Deferred-review fixes (WF3 follow-up to commit 403adcc)

  it('uses an absolute path for DEFAULT_KEY_PATH (review #10 — anchor to project root)', async () => {
    (process.env as Record<string, string>).NODE_ENV = 'development';
    let lastPathChecked = '';
    mockExistsSync.mockImplementation((p: string) => {
      lastPathChecked = p;
      return false;
    });
    const { getFirebaseAdmin } = await import('@/lib/firebase-admin');
    getFirebaseAdmin();
    // The default path passed to existsSync must be absolute (not relative).
    // Windows: starts with drive letter + colon. POSIX: starts with /.
    expect(lastPathChecked).toMatch(/^([a-zA-Z]:[\\/]|\/)/);
    expect(lastPathChecked).toMatch(/firebase-admin-sdk\.json$/);
  });

  it('re-initializes when FIREBASE_SERVICE_ACCOUNT_KEY changes in dev (review #11 — credential rotation)', async () => {
    (process.env as Record<string, string>).NODE_ENV = 'development';
    const json1 = VALID_SERVICE_ACCOUNT_JSON;
    const json2 = JSON.stringify({
      ...JSON.parse(VALID_SERVICE_ACCOUNT_JSON),
      project_id: 'buildo-rotated',
    });
    (process.env as Record<string, string>).FIREBASE_SERVICE_ACCOUNT_KEY = json1;
    const { getFirebaseAdmin } = await import('@/lib/firebase-admin');
    const first = getFirebaseAdmin();
    expect(first).not.toBeNull();
    expect(mockInitializeApp).toHaveBeenCalledTimes(1);

    // Rotate the env var — same shape, different project_id
    (process.env as Record<string, string>).FIREBASE_SERVICE_ACCOUNT_KEY = json2;
    // Don't simulate getApps returning the prior app — the module should not
    // reuse a stale-source cached app in dev.
    const second = getFirebaseAdmin();
    expect(second).not.toBeNull();
    expect(mockInitializeApp).toHaveBeenCalledTimes(2);
    // Verify the new credential reached cert()
    expect(mockCert).toHaveBeenLastCalledWith(expect.objectContaining({ project_id: 'buildo-rotated' }));
  });

  it('re-initializes when service account file mtime changes in dev (review #11 — file rotation)', async () => {
    (process.env as Record<string, string>).NODE_ENV = 'development';
    (process.env as Record<string, string>).FIREBASE_ADMIN_KEY_PATH = '/path/to/key.json';
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(VALID_SERVICE_ACCOUNT_JSON);
    let mtimeMs = new Date('2026-05-01T10:00:00Z').getTime();
    mockStatSync.mockImplementation(() => ({ mtime: new Date(mtimeMs), mtimeMs }));

    const { getFirebaseAdmin } = await import('@/lib/firebase-admin');
    const first = getFirebaseAdmin();
    expect(first).not.toBeNull();
    expect(mockInitializeApp).toHaveBeenCalledTimes(1);

    // File rotated — bump mtime
    mtimeMs = new Date('2026-05-01T11:30:00Z').getTime();
    const second = getFirebaseAdmin();
    expect(second).not.toBeNull();
    expect(mockInitializeApp).toHaveBeenCalledTimes(2);
  });

  it('does NOT re-initialize in production even when source identity changes (review #11 — production cache forever)', async () => {
    (process.env as Record<string, string>).NODE_ENV = 'production';
    (process.env as Record<string, string>).FIREBASE_SERVICE_ACCOUNT_KEY = VALID_SERVICE_ACCOUNT_JSON;
    const { getFirebaseAdmin } = await import('@/lib/firebase-admin');
    const first = getFirebaseAdmin();
    expect(first).not.toBeNull();
    expect(mockInitializeApp).toHaveBeenCalledTimes(1);

    // Rotate the env var — production must ignore (rotation = redeploy).
    const json2 = JSON.stringify({
      ...JSON.parse(VALID_SERVICE_ACCOUNT_JSON),
      project_id: 'buildo-attempted-rotation',
    });
    (process.env as Record<string, string>).FIREBASE_SERVICE_ACCOUNT_KEY = json2;
    const second = getFirebaseAdmin();
    expect(second).toBe(first);
    expect(mockInitializeApp).toHaveBeenCalledTimes(1);
  });

  it('escalates to logError when explicit FIREBASE_ADMIN_KEY_PATH points at a malformed file (review #12)', async () => {
    (process.env as Record<string, string>).NODE_ENV = 'development';
    (process.env as Record<string, string>).FIREBASE_ADMIN_KEY_PATH = '/explicit/bad.json';
    mockExistsSync.mockImplementation((p: string) => p === '/explicit/bad.json');
    mockReadFileSync.mockImplementation((p: string) => {
      if (p === '/explicit/bad.json') return 'not-valid-json{';
      throw new Error(`unexpected read: ${p}`);
    });
    const logger = await import('@/lib/logger');
    const { getFirebaseAdmin } = await import('@/lib/firebase-admin');
    getFirebaseAdmin();
    // logError should have been called specifically for the explicit-path parse failure
    const errorCalls = (logger.logError as ReturnType<typeof vi.fn>).mock.calls;
    const explicitPathErrorCall = errorCalls.find(
      (call) =>
        call[2] !== undefined &&
        typeof call[2] === 'object' &&
        (call[2] as Record<string, unknown>).path === '/explicit/bad.json' &&
        (call[2] as Record<string, unknown>).source === 'file',
    );
    expect(explicitPathErrorCall).toBeDefined();
  });

  it('does NOT silently serve a stale app on rotation when firebase-admin already has the default registered (WF3 review CRITICAL)', async () => {
    // Realistic scenario: after first init, firebase-admin's getApps() returns
    // the previously-registered default. On rotation, naive code would adopt
    // the OLD app from getApps() and stamp the NEW sourceId — silent stale
    // credential serving. Verify that doesn't happen: instead, re-init is
    // attempted (which firebase-admin would reject — caught by our try/catch)
    // and dev returns null rather than the stale app.
    (process.env as Record<string, string>).NODE_ENV = 'development';
    (process.env as Record<string, string>).FIREBASE_SERVICE_ACCOUNT_KEY = VALID_SERVICE_ACCOUNT_JSON;

    const oldApp = { name: '[DEFAULT]', _id: 'old-app' };
    mockInitializeApp.mockImplementation(() => oldApp);

    const { getFirebaseAdmin } = await import('@/lib/firebase-admin');
    const first = getFirebaseAdmin();
    expect(first).toBe(oldApp);
    expect(mockInitializeApp).toHaveBeenCalledTimes(1);

    // Now firebase-admin's registry has [DEFAULT] (simulate that real-world side effect).
    mockGetApps.mockReturnValue([oldApp]);
    // initializeApp now throws on second call because default already exists.
    mockInitializeApp.mockImplementation(() => {
      throw new Error('Firebase app named "[DEFAULT]" already exists');
    });

    // Rotate the credential.
    const json2 = JSON.stringify({
      ...JSON.parse(VALID_SERVICE_ACCOUNT_JSON),
      project_id: 'buildo-rotated',
    });
    (process.env as Record<string, string>).FIREBASE_SERVICE_ACCOUNT_KEY = json2;

    const second = getFirebaseAdmin();
    // Must NOT silently return the old (stale-credential) app.
    expect(second).not.toBe(oldApp);
    // In dev with init failure, the contract is null (NOT throw).
    expect(second).toBeNull();
    // Must have ATTEMPTED re-init (proving the rotation was detected and
    // not silently absorbed), even though firebase-admin rejected it.
    expect(mockInitializeApp).toHaveBeenCalledTimes(2);
  });

  it('uses logWarn (NOT logError) when default-path file is malformed (review #12 regression guard)', async () => {
    (process.env as Record<string, string>).NODE_ENV = 'development';
    // No FIREBASE_ADMIN_KEY_PATH — fall through to default path
    mockExistsSync.mockImplementation((p: string) => p.endsWith('firebase-admin-sdk.json'));
    mockReadFileSync.mockImplementation((p: string) => {
      if (p.endsWith('firebase-admin-sdk.json')) return 'not-valid-json{';
      throw new Error(`unexpected read: ${p}`);
    });
    const logger = await import('@/lib/logger');
    const { getFirebaseAdmin } = await import('@/lib/firebase-admin');
    getFirebaseAdmin();
    // logWarn should have been called for the parse failure
    const warnCalls = (logger.logWarn as ReturnType<typeof vi.fn>).mock.calls;
    const parseWarn = warnCalls.find((call) =>
      typeof call[1] === 'string' && /failed to read or parse/i.test(call[1] as string),
    );
    expect(parseWarn).toBeDefined();
    // logError should NOT have been called for the parse failure
    // (the final no-credentials path uses logWarn in dev too)
    const errorCalls = (logger.logError as ReturnType<typeof vi.fn>).mock.calls;
    const parseError = errorCalls.find(
      (call) =>
        call[2] !== undefined &&
        typeof call[2] === 'object' &&
        (call[2] as Record<string, unknown>).stage === 'JSON.parse',
    );
    expect(parseError).toBeUndefined();
  });
});
