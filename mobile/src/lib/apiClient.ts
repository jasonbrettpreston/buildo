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
    const body = await response.text().catch(() => '');
    throw new ApiError(response.status, body || `HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
}
