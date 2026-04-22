/**
 * TanStack Query mutation: write draftConfig diff to DB.
 * On success, commits the draft. On error, preserves draft state (user can retry).
 * SPEC LINK: docs/specs/02-web-admin/86_control_panel.md §5 Phase 2
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { controlPanelKeys } from './query-keys';
import type { ConfigUpdatePayload, ConfigsPutResponse } from '@/lib/admin/control-panel';
import { useAdminControlsStore } from '../store/useAdminControlsStore';
import { captureAdminEvent } from '../lib/telemetry';

async function putConfigs(payload: ConfigUpdatePayload): Promise<ConfigsPutResponse> {
  const res = await fetch('/api/admin/control-panel/configs', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json() as ConfigsPutResponse;
  if (!res.ok) {
    throw new Error(body.error ?? `Save failed (${res.status})`);
  }
  return body;
}

export function useUpdateConfigs() {
  const queryClient = useQueryClient();
  const computeDiff = useAdminControlsStore((s) => s.computeDiff);

  return useMutation({
    mutationFn: () => {
      const diff = computeDiff();
      return putConfigs(diff);
    },
    onSuccess: (data) => {
      // Invalidate so the re-fetch updates productionConfig from DB.
      // useGetConfigs.queryFn will call refreshProductionConfig (not setProductionConfig)
      // so in-flight draft edits are preserved. commitDrafts() is NOT called here
      // to prevent the race where edits made during an in-flight PUT would be silently
      // orphaned (hasUnsavedChanges would reset to false while new edits exist).
      void queryClient.invalidateQueries({ queryKey: controlPanelKeys.configs() });
      captureAdminEvent('admin_gravity_adjusted', { rows_updated: data.data.rows_updated });
      toast.success(`Configs Saved — ${data.data.rows_updated} row(s) updated`);
    },
    onError: (err: Error) => {
      // §5 Phase 6: do NOT clear draft on error — let the admin fix and retry
      captureAdminEvent('admin_gravity_save_failed', { error: err.message });
      toast.error(`Save Failed: ${err.message}`);
    },
  });
}

