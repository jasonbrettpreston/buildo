// 🔗 SPEC LINK: docs/specs/02-web-admin/76_lead_feed_health_dashboard.md §3.5 (Cycle 7)
//             docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §5 + §13
//
// Single-permit read of /api/admin/leads/inspect/:id. Powers the admin
// Lead Detail Inspector's diagnostic panels. Decoupled from useLeadDetail
// (Spec 91 §4.3.1 mobile contract) — this endpoint is admin-only and
// returns the richer LeadInspect shape (~70 fields, 8 panels) that
// mirrors the step 27 (assert_global_coverage) field-coverage matrix.
//
// Unlike useLeadDetail, this endpoint has NO `lead_views.saved=true`
// LATERAL gate — admin can inspect any permit, not just saved ones.
// 404 here means "permit doesn't exist", NOT "admin hasn't saved it".

'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { logError } from '@/lib/logger';
import { LeadInspectSchema, type LeadInspect } from '@/lib/admin/lead-schemas';

// Note: schema drift (Zod parse failure) is thrown as ZodError directly by
// LeadInspectSchema.parse — NOT as a LeadInspectError. The component handles
// ZodError as a separate error type, so PARSE_ERROR is intentionally absent
// from this code union.
export type LeadInspectErrorCode =
  | 'NOT_FOUND' // 404 — permit row absent
  | 'INVALID_ID' // 400 — bad lead_id shape
  | 'UNAUTHORIZED' // 401 — verifyAdminAuth returned null
  | 'NETWORK';

export class LeadInspectError extends Error {
  readonly code: LeadInspectErrorCode;
  readonly status: number | null;
  readonly serverMessage: string | null;
  constructor(
    code: LeadInspectErrorCode,
    message: string,
    options: { status?: number | null; serverMessage?: string | null } = {},
  ) {
    super(message);
    this.code = code;
    this.status = options.status ?? null;
    this.serverMessage = options.serverMessage ?? null;
  }
}

async function fetchLeadInspect(id: string): Promise<LeadInspect> {
  const response = await fetch(
    `/api/admin/leads/inspect/${encodeURIComponent(id)}`,
  );
  if (response.status === 401) {
    throw new LeadInspectError('UNAUTHORIZED', 'admin auth required', {
      status: 401,
    });
  }
  if (response.status === 404) {
    throw new LeadInspectError('NOT_FOUND', 'permit row not found', {
      status: 404,
    });
  }
  if (response.status === 400) {
    let serverMsg: string | null = null;
    try {
      const body = (await response.json()) as { error?: { message?: string } };
      serverMsg = body?.error?.message ?? null;
    } catch {
      // null fallback
    }
    throw new LeadInspectError('INVALID_ID', 'bad lead_id shape', {
      status: 400,
      serverMessage: serverMsg,
    });
  }
  if (!response.ok) {
    throw new LeadInspectError(
      'NETWORK',
      `lead-inspect returned ${response.status}`,
      { status: response.status },
    );
  }
  let raw: unknown;
  try {
    raw = await response.json();
  } catch (err) {
    logError('[admin/flight-center]', err, { stage: 'lead_inspect_parse', id });
    throw new LeadInspectError('NETWORK', 'response not JSON');
  }
  const envelope = raw as { data: unknown };
  return LeadInspectSchema.parse(envelope.data);
}

export function useLeadInspect(
  id: string | null,
): UseQueryResult<LeadInspect, Error> {
  return useQuery<LeadInspect, Error>({
    queryKey: ['admin', 'lead-inspect', id],
    queryFn: () => fetchLeadInspect(id as string),
    enabled: !!id,
    staleTime: 30_000,
  });
}
