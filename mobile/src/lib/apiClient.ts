import { auth } from '@/lib/firebase';
import { useAuthStore } from '@/store/authStore';
import { ApiError, AccountDeletedError, RateLimitError, NetworkError } from '@/lib/errors';

// Spec 99 §9.6 amendment: error classes moved to `@/lib/errors` (a leaf
// module with zero side-effect imports). Re-exported here for backward
// compatibility — existing callers continue to `import { ApiError, ... }
// from '@/lib/apiClient'`. Pure modules + their unit tests should import
// from `@/lib/errors` directly to avoid pulling firebase/MMKV into the
// import graph.
export { ApiError, AccountDeletedError, RateLimitError, NetworkError };

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://buildo.app';

async function fetchWithAuthInternal<T>(
  path: string,
  options?: RequestInit,
  isRetry = false,
): Promise<T> {
  const { idToken } = useAuthStore.getState();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string> | undefined),
  };

  if (idToken) {
    headers['Authorization'] = `Bearer ${idToken}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
    });
  } catch (err) {
    throw new NetworkError(err);
  }

  if (response.status === 429) {
    const retryAfter = parseInt(response.headers.get('Retry-After') ?? '60', 10);
    throw new RateLimitError(Number.isFinite(retryAfter) ? retryAfter : 60);
  }

  // Parse 403 body before the generic error path so structured deletion data
  // is not lost. The generic path caps body at 120 chars and discards JSON.
  if (response.status === 403) {
    const text = await response.text().catch(() => '');
    try {
      const json = JSON.parse(text) as Record<string, unknown>;
      const errObj = json.error as Record<string, unknown> | undefined;
      if (errObj?.code === 'ACCOUNT_DELETED') {
        throw new AccountDeletedError(
          String(errObj.account_deleted_at ?? ''),
          Number(errObj.days_remaining ?? 0),
        );
      }
    } catch (e) {
      if (e instanceof AccountDeletedError) throw e;
    }
    throw new ApiError(403, 'Forbidden');
  }

  // 401 intercept: force-refresh the Firebase idToken and retry once.
  // Firebase tokens expire after ~1 hour; a cold-boot or long background session
  // can produce a 401 on the first post-expiry request. The isRetry guard prevents
  // infinite loops if the server keeps returning 401 after a fresh token.
  // Known limitation: concurrent 401s each call getIdToken(true) independently —
  // Firebase deduplicates the network refresh but the store receives two setAuth
  // writes. Low risk in practice; tracked in review_followups.md (concurrent 401 mutex).
  if (response.status === 401 && !isRetry) {
    try {
      const { user } = useAuthStore.getState();
      const newToken = await auth().currentUser?.getIdToken(true);
      if (newToken && user) {
        useAuthStore.getState().setAuth(user, newToken);
        return fetchWithAuthInternal<T>(path, options, true);
      }
    } catch {
      // Token refresh failed (Firebase unreachable, no currentUser) — fall through
    }
    throw new ApiError(401, 'Unauthorized');
  }

  if (!response.ok) {
    // Sanitize body in the error message — never include raw server payload
    // that could carry user PII (addresses, names, permit details) into
    // downstream observability (Sentry breadcrumb on thrown ApiError).
    const raw = await response.text().catch(() => '');
    const safe = raw.length > 0 && raw.length <= 120 ? raw : `HTTP ${response.status}`;
    throw new ApiError(response.status, safe);
  }

  // Handle empty / non-JSON responses defensively. A 204 No Content, a 200 with
  // empty body, or a misconfigured Next.js maintenance page returning HTML with
  // status 200 would all otherwise throw an untyped SyntaxError from response.json()
  // that escapes the typed error taxonomy.
  const text = await response.text().catch(() => '');
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError(response.status, 'Response was not valid JSON');
  }
}

/**
 * Authenticated fetch for all Buildo API routes.
 * Attaches `Authorization: Bearer <idToken>` from the auth store.
 * Throws typed errors so callers can handle each class without inspecting
 * status codes directly.
 */
export function fetchWithAuth<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  return fetchWithAuthInternal(path, options);
}
