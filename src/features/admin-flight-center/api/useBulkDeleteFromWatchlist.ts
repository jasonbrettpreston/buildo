// 🔗 SPEC LINK: docs/specs/02-web-admin/36_flight_center_tool.md §2 + §4.3
//             docs/specs/02-web-admin/35_web_admin_state_architecture.md §7.1 + §B3
//
// Bulk delete → DELETE /api/admin/leads/watchlist. Replaces the retired
// useUnsavePermit [PF-HOOKS]. Manual bulk-delete is the watchlist's ONLY
// removal path — the deliberate replacement for the consumer flight-board's
// auto-archive ([PF10] no-auto-eviction contract, Spec 36 §4a).
//
// Spec 35 §B3 — optimistic removal across every cached board page with
// snapshot + rollback on error; onSettled invalidation reconciles.
// Telemetry (§7.1): breadcrumb + captureEvent BEFORE the network call.

'use client';

import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';
import * as Sentry from '@sentry/nextjs';
import { toast } from 'sonner';
import { logError } from '@/lib/logger';
import { captureEvent } from '@/lib/observability/capture';
import { WATCHLIST_BOARD_QUERY_KEY } from '@/features/admin-flight-center/api/useWatchlist';
import {
  BulkDeleteResponseSchema,
  type BulkDeleteResponse,
  type WatchlistResult,
} from '@/lib/admin/watchlist-schemas';

export interface BulkDeleteInput {
  ids: number[];
}

interface BulkDeleteContext {
  /** Snapshot of every cached board page for rollback (§B3). */
  previousPages: Array<[readonly unknown[], WatchlistResult | undefined]>;
}

async function deleteBulk(input: BulkDeleteInput): Promise<BulkDeleteResponse> {
  const response = await fetch('/api/admin/leads/watchlist', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: input.ids }),
  });
  if (!response.ok) {
    throw new Error(`/api/admin/leads/watchlist returned ${response.status}`);
  }
  const raw = (await response.json()) as { data: unknown };
  return BulkDeleteResponseSchema.parse(raw.data);
}

export function useBulkDeleteFromWatchlist(): UseMutationResult<
  BulkDeleteResponse,
  Error,
  BulkDeleteInput,
  BulkDeleteContext
> {
  const queryClient = useQueryClient();

  return useMutation<BulkDeleteResponse, Error, BulkDeleteInput, BulkDeleteContext>({
    mutationFn: deleteBulk,
    onMutate: async (input) => {
      // Spec 35 §7.1 — intent capture BEFORE the network call.
      Sentry.addBreadcrumb({
        category: 'admin_action',
        message: 'watchlist_bulk_delete',
        data: { target: 'admin_watchlist', id_count: input.ids.length },
      });
      captureEvent('admin_action_performed', {
        action: 'watchlist_bulk_delete',
        target: 'admin_watchlist',
      });

      // §B3 optimistic removal — every cached page of the paginated board.
      await queryClient.cancelQueries({ queryKey: WATCHLIST_BOARD_QUERY_KEY });
      const previousPages = queryClient.getQueriesData<WatchlistResult>({
        queryKey: WATCHLIST_BOARD_QUERY_KEY,
      });
      const removed = new Set(input.ids);
      queryClient.setQueriesData<WatchlistResult>(
        { queryKey: WATCHLIST_BOARD_QUERY_KEY },
        (page) => {
          if (!page) return page;
          const kept = page.data.filter((item) => !removed.has(item.id));
          if (kept.length === page.data.length) return page;
          return {
            ...page,
            data: kept,
            meta: {
              ...page.meta,
              total: Math.max(0, page.meta.total - (page.data.length - kept.length)),
            },
          };
        },
      );
      return { previousPages };
    },
    onSuccess: (data) => {
      toast.success(`Removed ${data.deleted} from the watchlist`);
    },
    onError: (err, input, context) => {
      // §B3 rollback — restore every snapshotted page.
      if (context?.previousPages) {
        for (const [key, page] of context.previousPages) {
          queryClient.setQueryData(key, page);
        }
      }
      logError('[admin/flight-center]', err, {
        stage: 'watchlist_bulk_delete',
        id_count: input.ids.length,
      });
      toast.error('Failed to delete from watchlist. Please try again.');
    },
    onSettled: () => {
      // §B3 — reconcile with server truth on success OR failure.
      void queryClient.invalidateQueries({ queryKey: WATCHLIST_BOARD_QUERY_KEY });
    },
  });
}
