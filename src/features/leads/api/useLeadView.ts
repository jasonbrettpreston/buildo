'use client';
// 🔗 SPEC LINK: docs/specs/03-mobile/75_lead_feed_implementation_guide.md §2.3
//
// TanStack Query mutation hook for POST /api/leads/view. Handles the
// three lead-view actions (view / save / unsave) + the optimistic
// `saved` state update pattern. The hook does NOT invalidate the full
// feed on success — the feed's `saved` state is a UI-only overlay that
// the SaveButton component (3-ii) reads from its own local state. The
// server's competition_count IS refreshed via the mutation's response.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  isLeadApiError,
  LeadApiClientError,
  type LeadViewRequest,
  type LeadViewResponse,
} from './types';

async function postLeadView(input: LeadViewRequest): Promise<LeadViewResponse> {
  // Same 3-layer error funnel as useLeadFeed's fetchLeadFeedPage — see
  // that function for the rationale. Shared pattern kept in sync by the
  // two sibling files; future Phase 3-iv may extract to a shared helper.
  let res: Response;
  try {
    res = await fetch('/api/leads/view', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  } catch (err) {
    throw new LeadApiClientError(
      'NETWORK_ERROR',
      err instanceof Error ? err.message : 'View request failed',
    );
  }
  let body: unknown;
  try {
    body = (await res.json()) as unknown;
  } catch {
    throw new LeadApiClientError(
      'NETWORK_ERROR',
      `View request failed: ${res.status} (non-JSON response)`,
    );
  }
  if (!res.ok) {
    const err = isLeadApiError(body)
      ? body.error
      : { code: 'NETWORK_ERROR', message: `View request failed: ${res.status}` };
    throw new LeadApiClientError(
      err.code,
      err.message,
      (err as { details?: unknown }).details,
    );
  }
  if (isLeadApiError(body)) {
    throw new LeadApiClientError(
      body.error.code,
      body.error.message,
      body.error.details,
    );
  }
  return body as LeadViewResponse;
}

/**
 * Mutation hook. Callers use `mutate({...})` for fire-and-forget or
 * `mutateAsync({...})` for the optimistic-update rollback pattern in
 * the SaveButton. The hook itself does not manage the optimistic state —
 * that's the consumer's job because the UI owns the "was saved before
 * the network trip" value.
 *
 * Retry: the default `retry: 0` from the QueryClient defaults applies.
 * Save/unsave is idempotent on the server but `view` increments the
 * competition count, so retries could double-count.
 */
export function useLeadView() {
  const queryClient = useQueryClient();

  return useMutation<LeadViewResponse, LeadApiClientError, LeadViewRequest>({
    mutationFn: postLeadView,
    onSuccess: (_data, variables) => {
      // Save/unsave affects the current user's "saved leads" view
      // (future 3-v). Invalidate just that slice, not the full feed.
      if (variables.action === 'save' || variables.action === 'unsave') {
        queryClient.invalidateQueries({
          queryKey: ['savedLeads'],
          exact: false,
        });
      }
      // `view` action doesn't need cache invalidation — the returned
      // competition_count is written to the card's local state by the
      // consumer.
    },
  });
}
