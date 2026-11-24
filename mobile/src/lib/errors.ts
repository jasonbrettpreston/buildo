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

/**
 * task-452 SEARCHFIX.4 (RR-0444 2b): the parcel 403 for a parcel_tool holder at this month's allowance (src/features/leads/api/error-mapping.ts
 * reportLimitReached, code REPORT_LIMIT_REACHED). Still an ApiError(403), so every `instanceof ApiError` reader is unchanged. It keeps the 403's own
 * limit and reset date (null when the body did not carry them typed right); the wall draws the entitlement read's values, never these (RR-0310).
 */
export class ReportLimitError extends ApiError {
  readonly code = 'REPORT_LIMIT_REACHED';
  constructor(
    public readonly reportsLimit: number | null,
    public readonly resetsOn: string | null,
  ) {
    super(403, 'Forbidden');
    this.name = 'ReportLimitError';
  }
}

/** task-452: the parcel 403 for a person without an active parcel_tool subscription (error-mapping.ts forbiddenSubscription, code SUBSCRIPTION_REQUIRED). */
export class SubscriptionRequiredError extends ApiError {
  readonly code = 'SUBSCRIPTION_REQUIRED';
  constructor() {
    super(403, 'Forbidden');
    this.name = 'SubscriptionRequiredError';
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
