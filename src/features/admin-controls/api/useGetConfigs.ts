/**
 * TanStack Query hook: fetch current live state of all control-panel tables.
 * SPEC LINK: docs/specs/02-web-admin/86_control_panel.md §5 Phase 2
 */

import { useQuery } from '@tanstack/react-query';
import { controlPanelKeys } from './query-keys';
import type { ConfigsGetResponse } from '@/lib/admin/control-panel';
import { useAdminControlsStore } from '../store/useAdminControlsStore';

async function fetchConfigs(): Promise<ConfigsGetResponse> {
  const res = await fetch('/api/admin/control-panel/configs');
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Failed to load configs (${res.status})`);
  }
  return res.json() as Promise<ConfigsGetResponse>;
}

export function useGetConfigs() {
  return useQuery({
    queryKey: controlPanelKeys.configs(),
    queryFn: async () => {
      const result = await fetchConfigs();
      const store = useAdminControlsStore.getState();
      if (store.productionConfig === null) {
        // Initial load: set both production and draft from DB
        store.setProductionConfig(result.data);
      } else {
        // Re-fetch after save invalidation: only update production.
        // Preserves any in-flight draft edits the user made while the PUT was in flight.
        store.refreshProductionConfig(result.data);
      }
      return result;
    },
    staleTime: 0,  // Always refetch on mount/window-focus — admin panel must show live DB state
    gcTime: 0,     // Don't keep stale config snapshots in the React Query cache
    retry: 2,
  });
}
