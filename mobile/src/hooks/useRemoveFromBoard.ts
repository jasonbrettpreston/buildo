// SPEC LINK: docs/specs/03-mobile/77_mobile_crm_flight_board.md §4.1 Swipe-to-Remove
// Simple DELETE mutation — the 3-second undo window is managed by the screen.
// captureEvent fires on confirmed delete (not on optimistic remove, in case of undo).
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchWithAuth } from '@/lib/apiClient';
import { logQueryInvalidate } from '@/lib/queryTelemetry';
import { FLIGHT_BOARD_QUERY_KEY } from './useFlightBoard';

interface RemoveParams {
  permitNum: string;
  revisionNum: string;
}

export function useRemoveFromBoard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ permitNum, revisionNum }: RemoveParams) =>
      fetchWithAuth('/api/leads/save', {
        method: 'POST',
        body: JSON.stringify({
          lead_id: `permit-${permitNum}-${revisionNum}`,
          lead_type: 'permit',
          saved: false,
        }),
      }),

    onSuccess: () => {
      // Optimistic remove already happened in the screen's handleRemove.
      // Only invalidate — do NOT setQueryData here, which would overwrite any
      // concurrent optimistic updates and cause a visible list flash.
      // Spec 99 §7.2 — non-trivial invalidate (mutation onSuccess, not onSettled)
      logQueryInvalidate('flight-board');
      void queryClient.invalidateQueries({ queryKey: FLIGHT_BOARD_QUERY_KEY });
      // captureEvent('job_removed_from_board') — Phase 8 PostHog wiring
    },

    onError: () => {
      // The caller's inline onError (flight-board.tsx) restores the snapshot.
      // Do NOT invalidate here — a refetch would race the snapshot restore and
      // can overwrite the restored card with fresh server data that might not
      // yet include the card (eventual consistency / replication lag).
    },
  });
}
