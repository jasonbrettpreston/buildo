// 🔗 SPEC LINK: docs/specs/03-mobile/75_lead_feed_implementation_guide.md §2
//
// Client-side request/response types for the /api/leads/* routes.
// Derived from the Phase 2 Zod schemas (server authoritative) + the
// Phase 1 lib types (domain authoritative) so drift between client
// and server is a typecheck failure, not a runtime bug.

import type { LeadFeedQuery, LeadViewBody } from './schemas';

// ---------------------------------------------------------------------------
// Request types — reused from the Zod schemas via z.infer
// ---------------------------------------------------------------------------

export type LeadViewRequest = LeadViewBody;

export interface LeadViewResponseData {
  competition_count: number;
}

export interface LeadViewResponse {
  data: LeadViewResponseData;
  error: null;
  meta: null;
}

// ---------------------------------------------------------------------------
// Error envelope — matches `src/features/leads/api/envelope.ts` ApiErrorBody.
// Client code inspects `error.code` (not HTTP status) because the server's
// error taxonomy is the stable contract; HTTP status codes can drift between
// frameworks (e.g., 422 vs 400 for validation).
// ---------------------------------------------------------------------------

interface LeadApiError {
  data: null;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta: null;
}

/**
 * Type guard for the error envelope. Use at the fetch boundary:
 *   const body = await res.json();
 *   if (isLeadApiError(body)) throw new LeadApiClientError(body.error.code, body.error.message);
 */
export function isLeadApiError(body: unknown): body is LeadApiError {
  // Full envelope shape check: `{ data: null, error: { code, message }, meta: null }`.
  // Tightened after the Phase 3-i DeepSeek adversarial review flagged
  // the original loose check as prone to false positives on random
  // JSON that happens to contain an `error` key.
  if (typeof body !== 'object' || body === null) return false;
  const b = body as { data?: unknown; error?: unknown; meta?: unknown };
  if (b.data !== null) return false;
  if (b.meta !== null) return false;
  if (typeof b.error !== 'object' || b.error === null) return false;
  const e = b.error as { code?: unknown; message?: unknown };
  if (typeof e.code !== 'string') return false;
  if (typeof e.message !== 'string') return false;
  return true;
}

/**
 * Client-side error wrapper. Surfaces `code` (stable identifier) + `message`
 * (display string) + optional `details` (field-level validation errors from
 * the server's Zod layer). Thrown by the query/mutation hooks; caught by
 * TanStack Query's error state.
 */
export class LeadApiClientError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'LeadApiClientError';
  }
}
