// 🔗 SPEC LINK: docs/specs/02-web-admin/76_lead_feed_health_dashboard.md §3.4
//             docs/specs/03-mobile/77_mobile_crm_flight_board.md §3.1
//             docs/specs/02-web-admin/35_web_admin_state_architecture.md §B3
//
// Mutation hook for POST /api/leads/save with `saved: true`. Mirrors
// mobile SearchPermitsSheet:42-62 — invalidates the flight-board query
// on success so the new permit appears on the board.
//
// Spec 35 §B3 mandates optimistic-update + rollback for mutations.
// `onMutate` snapshots the current cache, `onError` restores it (and
// `logError`s the failure), `onSuccess` invalidates the query so the
// server's authoritative state replaces the optimistic placeholder.

'use client';

import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';
import * as Sentry from '@sentry/nextjs';
import { logError } from '@/lib/logger';
import { ADMIN_FLIGHT_BOARD_QUERY_KEY } from '@/features/admin-flight-center/api/useAdminFlightBoard';
import type { FlightBoardResult } from '@/lib/admin/lead-schemas';

export interface SavePermitInput {
  permit_num: string;
  revision_num: string;
  /** Optional optimistic placeholder — included in cache write while server confirms. */
  optimisticItem?: FlightBoardResult['data'][number];
}

interface SavePermitContext {
  previousBoard: FlightBoardResult | undefined;
}

async function postSavePermit(input: SavePermitInput): Promise<void> {
  // Spec 91 §4.3.1 canonical lead_id format — `${permit_num}--${revision_num}`.
  // Toronto permit numbers contain single dashes, so `--` is the unambiguous
  // separator. Server-side parser at src/app/api/leads/save/route.ts splits
  // on the FIRST `--` only.
  const leadId = `${input.permit_num}--${input.revision_num}`;
  const response = await fetch('/api/leads/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      lead_id: leadId,
      lead_type: 'permit',
      saved: true,
    }),
  });
  if (!response.ok) {
    throw new Error(`/api/leads/save returned ${response.status}`);
  }
}

export function useSavePermit(): UseMutationResult<
  void,
  Error,
  SavePermitInput,
  SavePermitContext
> {
  const queryClient = useQueryClient();

  return useMutation<void, Error, SavePermitInput, SavePermitContext>({
    mutationFn: postSavePermit,
    onMutate: async (input) => {
      // Spec 35 §7.1 admin action telemetry — breadcrumb fires BEFORE the
      // network call so a failed mutation still leaves a record of the
      // user's INTENT (mirror of mobile Spec 99 §7.6 funnel-event timing).
      Sentry.addBreadcrumb({
        category: 'admin_action',
        message: 'save_permit',
        data: {
          permit_num: input.permit_num,
          revision_num: input.revision_num,
        },
      });
      // Cancel in-flight refetches so they don't overwrite the optimistic
      // write between onMutate and onSettled (Spec 35 §B3 step 1).
      await queryClient.cancelQueries({ queryKey: ADMIN_FLIGHT_BOARD_QUERY_KEY });
      const previousBoard = queryClient.getQueryData<FlightBoardResult>(
        ADMIN_FLIGHT_BOARD_QUERY_KEY,
      );
      // Optimistic insert — only when caller supplied an item shape.
      // Save flows from the search modal CAN supply an item; bare
      // re-saves from the inspector might not, in which case we skip
      // the optimistic write and rely on `onSuccess` invalidation.
      if (input.optimisticItem && previousBoard) {
        const alreadyOnBoard = previousBoard.data.some(
          (i) =>
            i.permit_num === input.permit_num &&
            i.revision_num === input.revision_num,
        );
        if (!alreadyOnBoard) {
          // Spread `previousBoard` first so any non-`data` envelope fields
          // a future Spec 76 amendment adds (pagination cursor, total
          // count, last_updated, etc.) survive the optimistic write.
          // Today FlightBoardResult is `{data}`-only; defensive against
          // schema growth.
          queryClient.setQueryData<FlightBoardResult>(
            ADMIN_FLIGHT_BOARD_QUERY_KEY,
            { ...previousBoard, data: [...previousBoard.data, input.optimisticItem] },
          );
        }
      }
      return { previousBoard };
    },
    onError: (err, input, context) => {
      // Rollback to the snapshot taken in onMutate — Spec 35 §B3 step 3.
      if (context?.previousBoard) {
        queryClient.setQueryData(
          ADMIN_FLIGHT_BOARD_QUERY_KEY,
          context.previousBoard,
        );
      }
      logError('[admin/flight-center]', err, {
        stage: 'save_permit',
        permit_num: input.permit_num,
        revision_num: input.revision_num,
      });
    },
    onSettled: () => {
      // Spec 35 §B3 + Spec 99 §B3 mandate: invalidate in `onSettled`, NOT
      // `onSuccess`. Settling on success OR failure means the cache always
      // reconciles with server truth post-mutation — preventing optimistic
      // drift if the server eventually disagrees with our optimistic write.
      void queryClient.invalidateQueries({
        queryKey: ADMIN_FLIGHT_BOARD_QUERY_KEY,
      });
    },
  });
}
