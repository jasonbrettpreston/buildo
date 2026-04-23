import { useAuthStore } from '@/store/authStore';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://buildo.app';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class RateLimitError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super(`Rate limited — retry after ${retryAfterSeconds}s`);
    this.name = 'RateLimitError';
  }
}

export class NetworkError extends Error {
  constructor(cause: unknown) {
    super('Network request failed');
    this.name = 'NetworkError';
    this.cause = cause;
  }
}

/**
 * Authenticated fetch for all Buildo API routes.
 * Attaches `Authorization: Bearer <idToken>` from the auth store.
 * Throws typed errors so callers can handle each class without inspecting
 * status codes directly.
 */
export async function fetchWithAuth<T>(
  path: string,
  options?: RequestInit,
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
