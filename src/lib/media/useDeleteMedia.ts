// SPEC LINK: docs/specs/02-web-admin/35_web_admin_state_architecture.md §7.1 + §B3
//            docs/specs/02-web-admin/126_maxbld_surface_standard.md §6.5
//
// Delete mutation → DELETE /api/admin/media/<asset_id> with {confirm}. Same telemetry/error contract as
// useUploadMedia. Also exports the shared response reader (envelope or non-JSON body → MediaRequestError).

'use client';

import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import * as Sentry from '@sentry/nextjs';
import { toast } from 'sonner';
import { logError } from '@/lib/logger';
import { captureEvent } from '@/lib/observability/capture';
import { MediaDeleteResponseSchema, type MediaDeleteResponse } from '@/app/api/admin/media/types';

const ACTION = 'media_delete';

/** A failed media request: the envelope's error code, or FILE_TOO_LARGE / HTTP_<status> for a non-JSON body. */
export class MediaRequestError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(`media request failed: ${code} (${status})`);
    this.name = 'MediaRequestError';
  }
}

type Envelope = { data?: unknown; error?: { code?: unknown } | null };

export async function readMediaResponse(response: Response): Promise<unknown> {
  let body: Envelope | null;
  try {
    body = (await response.json()) as Envelope;
  } catch {
    body = null; // A platform 413 (or a proxy error page) is not JSON.
  }
  if (!response.ok || body === null) {
    const envelopeCode = typeof body?.error?.code === 'string' ? body.error.code : null;
    const fallback = response.status === 413 ? 'FILE_TOO_LARGE' : `HTTP_${response.status}`;
    throw new MediaRequestError(envelopeCode ?? fallback, response.status);
  }
  return body.data;
}

export interface DeleteMediaInput {
  asset_id: string;
  confirm: string;
}

async function deleteMedia(input: DeleteMediaInput): Promise<MediaDeleteResponse> {
  const response = await fetch(`/api/admin/media/${encodeURIComponent(input.asset_id)}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirm: input.confirm }),
  });
  return MediaDeleteResponseSchema.parse(await readMediaResponse(response));
}

export function useDeleteMedia({
  errorText,
}: {
  errorText: string;
}): UseMutationResult<MediaDeleteResponse, Error, DeleteMediaInput> {
  const router = useRouter();
  return useMutation<MediaDeleteResponse, Error, DeleteMediaInput>({
    mutationFn: deleteMedia,
    onMutate: () => {
      Sentry.addBreadcrumb({ category: 'admin_action', message: ACTION, data: { target: 'media_assets' } });
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
