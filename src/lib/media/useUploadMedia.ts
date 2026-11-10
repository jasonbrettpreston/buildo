// SPEC LINK: docs/specs/02-web-admin/35_web_admin_state_architecture.md §7.1 + §B3
//            docs/specs/02-web-admin/126_maxbld_surface_standard.md §6.5
//
// Upload mutation → POST /api/admin/media. onMutate: breadcrumb + captureEvent (intent, before the
// network call). onError: logError + Sentry.captureException + captureEvent(result:'error') + a
// persistent toast whose text comes from content (`errorText`; no display literal here). A platform 413
// arrives as a non-JSON body: mapped to FILE_TOO_LARGE. onSuccess: router.refresh() (the RSC list re-reads).

'use client';

import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import * as Sentry from '@sentry/nextjs';
import { toast } from 'sonner';
import { logError } from '@/lib/logger';
import { captureEvent } from '@/lib/observability/capture';
import type { MediaUploadBody } from '@/lib/media/contract';
import { MediaUploadResponseSchema, type MediaUploadResponse } from '@/app/api/admin/media/types';
import { readMediaResponse, MediaRequestError } from '@/lib/media/useDeleteMedia';

const ACTION = 'media_upload';

async function postUpload(input: MediaUploadBody): Promise<MediaUploadResponse> {
  const response = await fetch('/api/admin/media', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return MediaUploadResponseSchema.parse(await readMediaResponse(response));
}

export function useUploadMedia({
  errorText,
}: {
  errorText: string;
}): UseMutationResult<MediaUploadResponse, Error, MediaUploadBody> {
  const router = useRouter();
  return useMutation<MediaUploadResponse, Error, MediaUploadBody>({
    mutationFn: postUpload,
    onMutate: (input) => {
      Sentry.addBreadcrumb({ category: 'admin_action', message: ACTION, data: { target: 'media_assets', kind: input.kind } });
      captureEvent('admin_action_performed', { action: ACTION, target: 'media_assets' });
    },
    onError: (error) => {
      const code = error instanceof MediaRequestError ? error.code : 'CLIENT_ERROR';
      logError('[admin/media]', error, { stage: ACTION, code });
      Sentry.captureException(error);
      captureEvent('admin_action_performed', { action: ACTION, target: 'media_assets', result: 'error', reason: code });
      toast.error(errorText, { duration: Infinity });
    },
    onSuccess: () => {
      router.refresh();
    },
  });
}
