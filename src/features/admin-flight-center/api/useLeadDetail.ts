// 🔗 SPEC LINK: docs/specs/02-web-admin/76_lead_feed_health_dashboard.md §3.5
//             docs/specs/03-mobile/91_mobile_lead_feed.md §4.3.1
//             docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §5 + §13
//
// Single-permit read of /api/leads/detail/:id. Powers the Lead Detail
// Inspector. The endpoint is `lead_views.saved=true` LATERAL-scoped per
// Spec 91 §4.3.1 — a 404 here means "admin hasn't saved this permit
// yet" (recovery: save it via Flight Center first), NOT "bad id".

'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { logError } from '@/lib/logger';
import { LeadDetailSchema, type LeadDetail } from '@/lib/admin/lead-schemas';

export type LeadDetailErrorCode =
  | 'NOT_SAVED' // 404 — Spec 91 §4.3.1 LATERAL gate
  | 'INVALID_ID' // 400 — bad lead_id shape
  | 'PARSE_ERROR' // schema drift
  | 'NETWORK';

export class LeadDetailError extends Error {
  readonly code: LeadDetailErrorCode;
  readonly status: number | null;
  readonly serverMessage: string | null;
  constructor(
    code: LeadDetailErrorCode,
    message: string,
    options: { status?: number | null; serverMessage?: string | null } = {},
  ) {
    super(message);
    this.code = code;
    this.status = options.status ?? null;
    this.serverMessage = options.serverMessage ?? null;
  }
}

async function fetchLeadDetail(id: string): Promise<LeadDetail> {
  const response = await fetch(`/api/leads/detail/${encodeURIComponent(id)}`);
  if (response.status === 404) {
    throw new LeadDetailError('NOT_SAVED', 'permit not on saved board', {
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
    throw new LeadDetailError('INVALID_ID', 'bad lead_id shape', {
      status: 400,
      serverMessage: serverMsg,
    });
  }
  if (!response.ok) {
    throw new LeadDetailError('NETWORK', `lead-detail returned ${response.status}`, {
      status: response.status,
    });
  }
  let raw: unknown;
  try {
    raw = await response.json();
  } catch (err) {
    logError('[admin/flight-center]', err, { stage: 'lead_detail_parse', id });
    throw new LeadDetailError('NETWORK', 'response not JSON');
  }
  const envelope = raw as { data: unknown };
  return LeadDetailSchema.parse(envelope.data);
}

export function useLeadDetail(
  id: string | null,
): UseQueryResult<LeadDetail, Error> {
  return useQuery<LeadDetail, Error>({
    queryKey: ['admin', 'lead-detail', id],
    queryFn: () => fetchLeadDetail(id as string),
    enabled: !!id,
    staleTime: 30_000,
    // Inline parse-error display per Spec 76 §3.5 — no ErrorBoundary escalation.
  });
}
