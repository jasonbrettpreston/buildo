// 🔗 SPEC LINK: docs/specs/02-web-admin/76_lead_feed_health_dashboard.md §3.4
//             docs/specs/02-web-admin/35_web_admin_state_architecture.md §B3
//
// Mutation hook for POST /api/leads/save with `saved: false`. Web-admin
// port of the mobile swipe-to-remove flow — the admin pattern uses an
// "Unsave" button on each Flight Center card; no undo snackbar in this
// cycle (deferred to followups if requested).

'use client';

import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';
import { logError } from '@/lib/logger';
import { ADMIN_FLIGHT_BOARD_QUERY_KEY } from '@/features/admin-flight-center/api/useAdminFlightBoard';
import type { FlightBoardResult } from '@/lib/admin/lead-schemas';

export interface UnsavePermitInput {
  permit_num: string;
  revision_num: string;
}

interface UnsavePermitContext {
  previousBoard: FlightBoardResult | undefined;
}

async function postUnsavePermit(input: UnsavePermitInput): Promise<void> {
  const leadId = `permit-${input.permit_num}-${input.revision_num}`;
  const response = await fetch('/api/leads/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      lead_id: leadId,
      lead_type: 'permit',
      saved: false,
    }),
  });
  if (!response.ok) {
    throw new Error(`/api/leads/save returned ${response.status}`);
  }
}

export function useUnsavePermit(): UseMutationResult<
  void,
  Error,
  UnsavePermitInput,
  UnsavePermitContext
> {
  const queryClient = useQueryClient();

  return useMutation<void, Error, UnsavePermitInput, UnsavePermitContext>({
    mutationFn: postUnsavePermit,
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ADMIN_FLIGHT_BOARD_QUERY_KEY });
      const previousBoard = queryClient.getQueryData<FlightBoardResult>(
        ADMIN_FLIGHT_BOARD_QUERY_KEY,
      );
      // Optimistic removal — drop the matching row from the cached board.
      if (previousBoard) {
        queryClient.setQueryData<FlightBoardResult>(
          ADMIN_FLIGHT_BOARD_QUERY_KEY,
          {
            data: previousBoard.data.filter(
              (i) =>
                !(
                  i.permit_num === input.permit_num &&
                  i.revision_num === input.revision_num
                ),
            ),
          },
        );
      }
      return { previousBoard };
    },
    onError: (err, input, context) => {
      if (context?.previousBoard) {
        queryClient.setQueryData(
          ADMIN_FLIGHT_BOARD_QUERY_KEY,
          context.previousBoard,
        );
      }
      logError('[admin/flight-center]', err, {
        stage: 'unsave_permit',
        permit_num: input.permit_num,
        revision_num: input.revision_num,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ADMIN_FLIGHT_BOARD_QUERY_KEY,
      });
    },
  });
}
