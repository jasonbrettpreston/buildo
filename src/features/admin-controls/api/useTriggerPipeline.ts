/**
 * TanStack Query mutation: trigger pipeline re-sync (Steps 14-24).
 * Returns immediately; client polls pipeline status for progress.
 * SPEC LINK: docs/specs/product/future/86_control_panel.md §5 Phase 6
 */

import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { ResyncPostResponse } from '@/lib/admin/control-panel';
import { captureAdminEvent } from '../lib/telemetry';

async function postResync(): Promise<ResyncPostResponse> {
  const res = await fetch('/api/admin/control-panel/resync', { method: 'POST' });
  const body = await res.json() as ResyncPostResponse;
  if (!res.ok) {
    throw new Error(body.error ?? `Re-sync failed (${res.status})`);
  }
  return body;
}

export function useTriggerPipeline() {
  return useMutation({
    mutationFn: postResync,
    onSuccess: (data) => {
      captureAdminEvent('admin_pipeline_resync_triggered', {
        steps: data.meta.steps.join(','),
      });
      toast.success(`Pipeline Re-Run Initiated — steps: ${data.meta.steps.join(', ')}`);
    },
    onError: (err: Error) => {
      // §5 Phase 6: preserve draft state on error; show specific error message
      toast.error(`Re-Sync Failed: ${err.message}`);
    },
  });
}
