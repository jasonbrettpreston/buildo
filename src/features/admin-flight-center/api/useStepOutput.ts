// 🔗 SPEC LINK: docs/specs/01-pipeline/26_*.md §3.1 (Step-Output Inspector)
//             docs/specs/02-web-admin/35_*.md (admin state — TanStack reads)
//
// Read of GET /api/admin/pipeline/step-output. Powers the Step-Output Inspector's row browser.
// Mirrors useLeadInspect (typed error class + Zod-parse at the fetch boundary).

'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { logError } from '@/lib/logger';
import { StepOutputSchema, type StepOutputResponse } from '@/lib/admin/types';

export type StepOutputErrorCode = 'NOT_FOUND' | 'VALIDATION' | 'UNAUTHORIZED' | 'NETWORK';

export class StepOutputError extends Error {
  readonly code: StepOutputErrorCode;
  readonly status: number | null;
  readonly serverMessage: string | null;
  constructor(
    code: StepOutputErrorCode,
    message: string,
    options: { status?: number | null; serverMessage?: string | null } = {},
  ) {
    super(message);
    this.code = code;
    this.status = options.status ?? null;
    this.serverMessage = options.serverMessage ?? null;
  }
}

export interface StepOutputArgs {
  slug: string | null;
  limit: number;
  offset: number;
  filterField?: string | null;
  filterValue?: string | null;
}

async function fetchStepOutputData(args: StepOutputArgs): Promise<StepOutputResponse> {
  const params = new URLSearchParams({
    slug: args.slug as string,
    limit: String(args.limit),
    offset: String(args.offset),
  });
  if (args.filterField && args.filterValue) {
    params.set('filterField', args.filterField);
    params.set('filterValue', args.filterValue);
  }
  const response = await fetch(`/api/admin/pipeline/step-output?${params.toString()}`);

  if (response.status === 401) throw new StepOutputError('UNAUTHORIZED', 'admin auth required', { status: 401 });
  if (response.status === 404) throw new StepOutputError('NOT_FOUND', 'step has no inspectable table', { status: 404 });
  if (response.status === 400) {
    let serverMsg: string | null = null;
    try {
      const body = (await response.json()) as { error?: { message?: string } };
      serverMsg = body?.error?.message ?? null;
    } catch {
      serverMsg = null;
    }
    throw new StepOutputError('VALIDATION', 'invalid request', { status: 400, serverMessage: serverMsg });
  }
  if (!response.ok) {
    throw new StepOutputError('NETWORK', `step-output returned ${response.status}`, { status: response.status });
  }

  let raw: unknown;
  try {
    raw = await response.json();
  } catch (err) {
    logError('[admin/step-output]', err, { stage: 'parse', slug: args.slug });
    throw new StepOutputError('NETWORK', 'response not JSON');
  }
  const envelope = raw as { data: unknown };
  return StepOutputSchema.parse(envelope.data);
}

export function useStepOutput(args: StepOutputArgs): UseQueryResult<StepOutputResponse, Error> {
  return useQuery<StepOutputResponse, Error>({
    queryKey: [
      'admin',
      'step-output',
      args.slug,
      { limit: args.limit, offset: args.offset, filterField: args.filterField ?? null, filterValue: args.filterValue ?? null },
    ],
    queryFn: () => fetchStepOutputData(args),
    enabled: !!args.slug,
    staleTime: 60_000,
  });
}
