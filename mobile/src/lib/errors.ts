// SPEC LINK: docs/specs/03-mobile/99_mobile_state_architecture.md §9.6
//             (adversarial review: Gemini F4 + DeepSeek #7 consensus)
//
// Leaf module containing the typed-error class hierarchy used across the
// mobile app. ZERO side-effect imports — no firebase, no MMKV, no Sentry.
// This lets pure modules (e.g., `decideAuthGateRoute`) and their unit tests
// import the error classes without dragging the entire native-module graph
// into the test environment.
//
// `apiClient.ts` re-exports these for backward compatibility — existing
// callers (`useUserProfile`, `_layout.tsx`, etc.) continue to import from
// `@/lib/apiClient` and get the same classes.

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class AccountDeletedError extends Error {
  constructor(
    public readonly account_deleted_at: string,
    public readonly days_remaining: number,
  ) {
    super('Account is scheduled for deletion');
    this.name = 'AccountDeletedError';
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
