// SPEC LINK: docs/specs/02-web-admin/35_web_admin_state_architecture.md §7.1 + §B3
//            docs/specs/02-web-admin/126_maxbld_surface_standard.md §11a.9 (dated note 2026-11-11)
//
// MF-19 · the admin lot-size revert mutation (PUT /api/admin/parcels/lot-size/revert, D-4), on the MF-37 / MF-40 hook contract: onMutate breadcrumb +
// captureEvent (intent); onError logError + Sentry + captureEvent(result:'error') + a persistent toast whose text comes from content (`errorText`);
// onSuccess router.refresh().

'use client';

import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import * as Sentry from '@sentry/nextjs';
import { toast } from 'sonner';
import { logError } from '@/lib/logger';
import { captureEvent } from '@/lib/observability/capture';
import { readMediaResponse, MediaRequestError } from '@/lib/media/useDeleteMedia';
import { LotSizeRevertResponseSchema } from '@/app/api/parcels/lot-size/types';
import type { z } from 'zod';

type RevertResponse = z.infer<typeof LotSizeRevertResponseSchema>;
const ACTION = 'lot_size_revert';
const TARGET = 'parcel_user_inputs';

export const useLotSizeRevert = ({ errorText }: { errorText: string }): UseMutationResult<RevertResponse, Error, { parcel_id: string }> => {
  const router = useRouter();
  return useMutation<RevertResponse, Error, { parcel_id: string }>({
    mutationFn: async (b) =>
      LotSizeRevertResponseSchema.parse(
        await readMediaResponse(await fetch('/api/admin/parcels/lot-size/revert', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })),
      ),
    onMutate: () => {
      Sentry.addBreadcrumb({ category: 'admin_action', message: ACTION, data: { target: TARGET } });
      captureEvent('admin_action_performed', { action: ACTION, target: TARGET });
    },
    onError: (error) => {
      const code = error instanceof MediaRequestError ? error.code : 'CLIENT_ERROR';
      logError('[admin/lot-size]', error, { stage: ACTION, code });
      Sentry.captureException(error);
      captureEvent('admin_action_performed', { action: ACTION, target: TARGET, result: 'error', reason: code });
      toast.error(errorText, { duration: Infinity });
    },
    onSuccess: () => router.refresh(),
  });
};
