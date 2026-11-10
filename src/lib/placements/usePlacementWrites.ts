// SPEC LINK: docs/specs/02-web-admin/35_web_admin_state_architecture.md §7.1 + §B3
//            docs/specs/02-web-admin/126_maxbld_surface_standard.md §6.3 rows 4-6 (dated notes 2026-11-10)
//
// MF-40 · the three admin placements mutations: save an offer (PUT /api/admin/placements/offers), turn an offer on or off (PATCH, the list-row
// toggle) and add an advertiser (PUT /api/admin/placements/advertisers). The MF-37 hook contract: onMutate breadcrumb + captureEvent (intent);
// onError logError + Sentry + captureEvent(result:'error') + a persistent toast whose text comes from content (`errorText`, no display literal
// here); onSuccess router.refresh() (the RSC page re-reads). A toggle that leaves its placement over the slot limit shows `warnText` (fold 8).

'use client';

import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import * as Sentry from '@sentry/nextjs';
import { toast } from 'sonner';
import { logError } from '@/lib/logger';
import { captureEvent } from '@/lib/observability/capture';
import { readMediaResponse, MediaRequestError } from '@/lib/media/useDeleteMedia';
import type { AdvertiserBody, OfferBody, ToggleBody } from '@/lib/placements/contract';
import {
  AdvertiserUpsertResponseSchema,
  OfferToggleResponseSchema,
  OfferUpsertResponseSchema,
  type AdvertiserUpsertResponse,
  type OfferToggleResponse,
  type OfferUpsertResponse,
} from '@/app/api/admin/placements/types';

const send = async (url: string, method: 'PUT' | 'PATCH', body: unknown): Promise<unknown> =>
  readMediaResponse(await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));

/** The audit action the server writes for a toggle (OUTPUT panel LOW 3: the client names the same action). */
export const toggleActionOf = (active: boolean): 'offer_activate' | 'offer_deactivate' => (active ? 'offer_activate' : 'offer_deactivate');

function useWrite<I, O>(actionOf: string | ((i: I) => string), target: string, fn: (i: I) => Promise<O>, errorText: string, after?: (o: O) => void): UseMutationResult<O, Error, I> {
  const nameOf = (i: I): string => (typeof actionOf === 'string' ? actionOf : actionOf(i));
  const router = useRouter();
  return useMutation<O, Error, I>({
    mutationFn: fn,
    onMutate: (i) => {
      const action = nameOf(i);
      Sentry.addBreadcrumb({ category: 'admin_action', message: action, data: { target } });
      captureEvent('admin_action_performed', { action, target });
    },
    onError: (error, i) => {
      const action = nameOf(i);
      const code = error instanceof MediaRequestError ? error.code : 'CLIENT_ERROR';
      logError('[admin/placements]', error, { stage: action, code });
      Sentry.captureException(error);
      captureEvent('admin_action_performed', { action, target, result: 'error', reason: code });
      toast.error(errorText, { duration: Infinity });
    },
    onSuccess: (o) => {
      after?.(o);
      router.refresh();
    },
  });
}

export const useSaveOffer = ({ errorText, warnText }: { errorText: string; warnText: string }): UseMutationResult<OfferUpsertResponse, Error, OfferBody> =>
  useWrite(
    'offer_schedule',
    'offers',
    async (b: OfferBody) => OfferUpsertResponseSchema.parse(await send('/api/admin/placements/offers', 'PUT', b)),
    errorText,
    (o) => { if (o.over_cap) toast.warning(warnText, { duration: Infinity }); },
  );

export const useToggleOffer = ({ errorText, warnText }: { errorText: string; warnText: string }): UseMutationResult<OfferToggleResponse, Error, ToggleBody> =>
  useWrite(
    (b: ToggleBody) => toggleActionOf(b.active),
    'offers',
    async (b: ToggleBody) => OfferToggleResponseSchema.parse(await send('/api/admin/placements/offers', 'PATCH', b)),
    errorText,
    (o) => { if (o.over_cap) toast.warning(warnText, { duration: Infinity }); },
  );

export const useAddAdvertiser = ({ errorText }: { errorText: string }): UseMutationResult<AdvertiserUpsertResponse, Error, AdvertiserBody> =>
  useWrite('advertiser_upsert', 'advertisers', async (b: AdvertiserBody) => AdvertiserUpsertResponseSchema.parse(await send('/api/admin/placements/advertisers', 'PUT', b)), errorText);
