// 🔗 SPEC LINK: docs/specs/02-web-admin/76_lead_feed_health_dashboard.md §3.6
//             docs/specs/03-mobile/77_mobile_crm_flight_board.md §3.3.1
//             docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §5 + §13
//
// Single-permit read of /api/leads/flight-board/detail/:id. Powers the
// Flight Job Detail Inspector + the Flight Center card-tap drawer.
// `enabled: !!id` keeps the hook inert until the operator picks an id.

'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { logError } from '@/lib/logger';
import {
  FlightBoardDetailSchema,
  type FlightBoardDetail,
} from '@/lib/admin/lead-schemas';

/** Typed error reasons the inspector UI distinguishes between. */
export type FlightBoardDetailErrorCode =
  | 'NOT_SAVED' // 404 — Spec 91 §4.3.1 LATERAL gate; admin must save first
  | 'INVALID_ID' // 400 — bad lead_id shape; UI shows endpoint message verbatim
  | 'PARSE_ERROR' // schema drift — reachable only via typed throwOnError below
  | 'NETWORK'; // anything else (5xx, fetch threw, etc.)

export class FlightBoardDetailError extends Error {
  readonly code: FlightBoardDetailErrorCode;
  readonly status: number | null;
  readonly serverMessage: string | null;
  constructor(
    code: FlightBoardDetailErrorCode,
    message: string,
    options: { status?: number | null; serverMessage?: string | null } = {},
  ) {
    super(message);
    this.code = code;
    this.status = options.status ?? null;
    this.serverMessage = options.serverMessage ?? null;
  }
}

async function fetchFlightBoardDetail(id: string): Promise<FlightBoardDetail> {
  const response = await fetch(
    `/api/leads/flight-board/detail/${encodeURIComponent(id)}`,
  );
  if (response.status === 404) {
    throw new FlightBoardDetailError('NOT_SAVED', 'permit not on saved board', {
      status: 404,
    });
  }
  if (response.status === 400) {
    let serverMsg: string | null = null;
    try {
      const body = (await response.json()) as { error?: { message?: string } };
      serverMsg = body?.error?.message ?? null;
    } catch {
      // Fall through with null serverMessage.
    }
    throw new FlightBoardDetailError('INVALID_ID', 'bad lead_id shape', {
      status: 400,
      serverMessage: serverMsg,
    });
  }
  if (!response.ok) {
    throw new FlightBoardDetailError('NETWORK', `flight-board/detail returned ${response.status}`, {
      status: response.status,
    });
  }
  let raw: unknown;
  try {
    raw = await response.json();
  } catch (err) {
    logError('[admin/flight-center]', err, { stage: 'detail_parse', id });
    throw new FlightBoardDetailError('NETWORK', 'response not JSON');
  }
  // The route wraps in `{data, error, meta}` via withApiEnvelope; parse
  // the inner `data` against the detail schema.
  const envelope = raw as { data: unknown };
  return FlightBoardDetailSchema.parse(envelope.data);
}

export function useFlightBoardDetail(
  id: string | null,
): UseQueryResult<FlightBoardDetail, Error> {
  return useQuery<FlightBoardDetail, Error>({
    queryKey: ['admin', 'flight-board-detail', id],
    queryFn: () => fetchFlightBoardDetail(id as string),
    enabled: !!id,
    staleTime: 30_000,
    // Inline parse-error display per Spec 76 §3.5/§3.6 — no ErrorBoundary escalation.
  });
}
