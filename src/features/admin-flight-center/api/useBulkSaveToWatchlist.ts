// 🔗 SPEC LINK: docs/specs/02-web-admin/36_flight_center_tool.md §2 + §4.3
//             docs/specs/02-web-admin/35_web_admin_state_architecture.md §7.1 + §B3
//
// Bulk save → POST /api/admin/leads/watchlist. Replaces the retired
// useSavePermit (consumer /api/leads/save under the lead_views model)
// [PF-HOOKS]. Server response is {added, skipped_existing, failed[]} [PF5];
// the Sonner summary toast renders those counts.
//
// Spec 35 §7.1 telemetry — breadcrumb + captureEvent fire in onMutate,
// BEFORE the network call, so a failed mutation still records intent.
//
// NO optimistic cache insert (deliberate): the board is server-paginated
// and its temporal_group/forecast aggregation is server-computed — a
// synthetic client row would need a fabricated temporal group. onSettled
// invalidation reconciles instead (§B3 reconcile rule still satisfied).

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
  BulkSaveResponseSchema,
  type BulkSaveResponse,
  type WatchlistSaveItem,
} from '@/lib/admin/watchlist-schemas';

export interface BulkSaveInput {
  items: WatchlistSaveItem[];
}

async function postBulkSave(input: BulkSaveInput): Promise<BulkSaveResponse> {
  const response = await fetch('/api/admin/leads/watchlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: input.items }),
  });
  if (!response.ok) {
    throw new Error(`/api/admin/leads/watchlist returned ${response.status}`);
  }
  const raw = (await response.json()) as { data: unknown };
  return BulkSaveResponseSchema.parse(raw.data);
}

export function useBulkSaveToWatchlist(): UseMutationResult<
  BulkSaveResponse,
  Error,
  BulkSaveInput
> {
  const queryClient = useQueryClient();

  return useMutation<BulkSaveResponse, Error, BulkSaveInput>({
    mutationFn: postBulkSave,
    onMutate: (input) => {
      // Spec 35 §7.1 — intent capture BEFORE the network call.
      Sentry.addBreadcrumb({
        category: 'admin_action',
        message: 'watchlist_bulk_save',
        data: { target: 'admin_watchlist', item_count: input.items.length },
      });
      captureEvent('admin_action_performed', {
        action: input.items.length === 1 ? 'watchlist_save' : 'watchlist_bulk_save',
        target: 'admin_watchlist',
      });
    },
    onSuccess: (data) => {
      // [PF5] summary toast with the per-batch counts.
      const parts = [`${data.added} added`];
      if (data.skipped_existing > 0) parts.push(`${data.skipped_existing} already watched`);
      if (data.failed.length > 0) parts.push(`${data.failed.length} failed`);
      if (data.failed.length > 0) {
        toast.warning(`Watchlist: ${parts.join(' · ')}`);
      } else {
        toast.success(`Watchlist: ${parts.join(' · ')}`);
      }
    },
    onError: (err, input) => {
      logError('[admin/flight-center]', err, {
        stage: 'watchlist_bulk_save',
        item_count: input.items.length,
      });
      toast.error('Failed to save to watchlist. Please try again.');
    },
    onSettled: () => {
      // §B3 — reconcile with server truth on success OR failure.
      void queryClient.invalidateQueries({ queryKey: WATCHLIST_BOARD_QUERY_KEY });
    },
  });
}
