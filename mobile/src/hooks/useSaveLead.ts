// SPEC LINK: docs/specs/03-mobile/91_mobile_lead_feed.md §3.2 Save Mutation
//             docs/specs/03-mobile/91_mobile_lead_feed.md §4.3 Detail Screen
// Save/unsave mutation with optimistic update and successNotification haptic.
// On error, the snapshot is rolled back via TanStack Query's onError callback.
//
// Maintains TWO cache keys in lockstep so the SaveButton renders correctly
// on both the lead feed AND the detail screen (cold-boot deep-link to
// /(app)/[lead] reads `is_saved` from the ['lead-detail', id] hook, not
// the feed cache).
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchWithAuth } from '@/lib/apiClient';
import type { LeadDetail, LeadFeedResult } from '@/lib/schemas';
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
      // Snapshot BOTH cache keys before the optimistic update so onError can
      // restore either side if the mutation fails. Cancel in-flight refetches
      // so they don't overwrite the optimistic state.
      await queryClient.cancelQueries({ queryKey: ['lead-feed'] });
      await queryClient.cancelQueries({ queryKey: ['lead-detail', leadId] });

      const feedSnapshot = queryClient.getQueriesData<InfiniteData<LeadFeedResult>>({
        queryKey: ['lead-feed'],
      });
      const detailSnapshot = queryClient.getQueryData<LeadDetail>([
        'lead-detail',
        leadId,
      ]);

      // Apply optimistic update across all cached feed pages.
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

      // Apply optimistic update on the detail-screen cache (Spec 91 §4.3).
      // Cold-boot deep-link users have no feed cache, so the detail key is
      // the only source of truth for SaveButton fill state on that screen.
      queryClient.setQueryData<LeadDetail>(['lead-detail', leadId], (old) =>
        old ? { ...old, is_saved: saved } : old,
      );

      // Haptic fires from the component on tap (closer to the user gesture, and
      // independent of optimistic update path). See SaveButton.handlePress.
      return { feedSnapshot, detailSnapshot, leadId };
    },

    onError: (_err, _vars, context) => {
      // Roll back to snapshot on error. Guard against undefined data entries:
      // setQueryData(key, undefined) removes the key instead of restoring it.
      if (context?.feedSnapshot) {
        for (const [queryKey, data] of context.feedSnapshot) {
          if (data !== undefined) queryClient.setQueryData(queryKey, data);
        }
      }
      if (context?.detailSnapshot !== undefined && context.leadId) {
        queryClient.setQueryData(
          ['lead-detail', context.leadId],
          context.detailSnapshot,
        );
      }
    },

    onSettled: (_data, _err, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['lead-feed'] });
      // Refetch detail so server state reconciles any drift from the
      // optimistic mirror (e.g., concurrent save from another device).
      void queryClient.invalidateQueries({
        queryKey: ['lead-detail', variables.leadId],
      });
    },
  });
}
