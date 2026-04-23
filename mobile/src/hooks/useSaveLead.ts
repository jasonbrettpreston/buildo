// SPEC LINK: docs/specs/03-mobile/91_mobile_lead_feed.md §3.2 Save Mutation
// Save/unsave mutation with optimistic update and successNotification haptic.
// On error, the snapshot is rolled back via TanStack Query's onError callback.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchWithAuth } from '@/lib/apiClient';
import type { LeadFeedResult } from '@/lib/schemas';
import type { InfiniteData } from '@tanstack/react-query';

interface SaveLeadParams {
  leadId: string;
  leadType: 'permit' | 'builder';
  saved: boolean;
}

export function useSaveLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ leadId, leadType, saved }: SaveLeadParams) =>
      fetchWithAuth('/api/leads/save', {
        method: 'POST',
        body: JSON.stringify({ lead_id: leadId, lead_type: leadType, saved }),
      }),

    onMutate: async ({ leadId, saved }) => {
      // Snapshot all feed cache entries before the optimistic update
      await queryClient.cancelQueries({ queryKey: ['lead-feed'] });
      const snapshot = queryClient.getQueriesData<InfiniteData<LeadFeedResult>>({
        queryKey: ['lead-feed'],
      });

      // Apply optimistic update across all cached feed pages
      queryClient.setQueriesData<InfiniteData<LeadFeedResult>>(
        { queryKey: ['lead-feed'] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              data: page.data.map((item) =>
                item.lead_id === leadId ? { ...item, is_saved: saved } : item,
              ),
            })),
          };
        },
      );

      // Haptic fires from the component on tap (closer to the user gesture, and
      // independent of optimistic update path). See SaveButton.handlePress.
      return { snapshot };
    },

    onError: (_err, _vars, context) => {
      // Roll back to snapshot on error. Guard against undefined data entries:
      // setQueryData(key, undefined) removes the key instead of restoring it.
      if (context?.snapshot) {
        for (const [queryKey, data] of context.snapshot) {
          if (data !== undefined) queryClient.setQueryData(queryKey, data);
        }
      }
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['lead-feed'] });
    },
  });
}
