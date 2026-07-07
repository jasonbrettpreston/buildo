// 🔗 SPEC LINK: docs/specs/02-web-admin/89_parcel_cost_model_tool.md §3 (API contract)
//             docs/specs/02-web-admin/35_web_admin_state_architecture.md §3.1 (parcel_lookup row)
//
// Read of GET /api/admin/parcels/lookup for the Parcel Cost Model Tool. Mirrors useStepOutput
// (typed error class + Zod-parse at the fetch boundary). Query key: ['admin','parcel-cost', qOrId].

'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { logError } from '@/lib/logger';
import {
  ParcelLookupResponseSchema,
  type ParcelLookupResponse,
} from '@/app/api/admin/parcels/lookup/types';

export type ParcelLookupErrorCode = 'VALIDATION' | 'UNAUTHORIZED' | 'NETWORK';

export class ParcelLookupError extends Error {
  readonly code: ParcelLookupErrorCode;
  readonly status: number | null;
  readonly serverMessage: string | null;
  constructor(
    code: ParcelLookupErrorCode,
    message: string,
    options: { status?: number | null; serverMessage?: string | null } = {},
  ) {
    super(message);
    this.code = code;
    this.status = options.status ?? null;
    this.serverMessage = options.serverMessage ?? null;
  }
}

/** Exactly one of q | parcelId — parcelId wins (the candidate-click direct path). */
export interface ParcelLookupArgs {
  q: string | null;
  parcelId: string | null;
}

async function fetchParcelLookup(args: ParcelLookupArgs): Promise<ParcelLookupResponse> {
  const params = new URLSearchParams();
  if (args.parcelId) params.set('parcelId', args.parcelId);
  else if (args.q) params.set('q', args.q);
  const response = await fetch(`/api/admin/parcels/lookup?${params.toString()}`);

  if (response.status === 401) throw new ParcelLookupError('UNAUTHORIZED', 'admin auth required', { status: 401 });
  if (response.status === 400) {
    let serverMsg: string | null = null;
    try {
      const body = (await response.json()) as { error?: { message?: string } };
      serverMsg = body?.error?.message ?? null;
    } catch {
      serverMsg = null;
    }
    throw new ParcelLookupError('VALIDATION', 'invalid search', { status: 400, serverMessage: serverMsg });
  }
  if (!response.ok) {
    throw new ParcelLookupError('NETWORK', `parcel lookup returned ${response.status}`, { status: response.status });
  }

  let raw: unknown;
  try {
    raw = await response.json();
  } catch (err) {
    logError('[admin/parcel-lookup]', err, { stage: 'parse', q: args.q });
    throw new ParcelLookupError('NETWORK', 'response not JSON');
  }
  const envelope = raw as { data: unknown };
  return ParcelLookupResponseSchema.parse(envelope.data);
}

export function useParcelLookup(args: ParcelLookupArgs): UseQueryResult<ParcelLookupResponse, Error> {
  return useQuery<ParcelLookupResponse, Error>({
    queryKey: ['admin', 'parcel-cost', args.parcelId ?? args.q ?? null],
    queryFn: () => fetchParcelLookup(args),
    enabled: Boolean(args.parcelId || args.q), // idle until the user submits a search
    staleTime: 60_000,
  });
}
