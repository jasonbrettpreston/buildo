// 🔗 SPEC LINK: docs/specs/02-web-admin/76_lead_feed_health_dashboard.md §3.4
//             docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §5 + §13
//             docs/specs/02-web-admin/35_web_admin_state_architecture.md §B1
//             docs/specs/03-mobile/77_mobile_crm_flight_board.md §5
//
// Polling read of /api/leads/flight-board for the admin Flight Center.
// Mirrors mobile useFlightBoard staleTime/gcTime cadence so the admin
// surface behaves identically to the mobile UX. Spec 33 §13 Zod parse
// runs at the response boundary; a parse failure surfaces a typed error.

'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { logError } from '@/lib/logger';
import {
  FlightBoardResultSchema,
  type FlightBoardResult,
} from '@/lib/admin/lead-schemas';

export const ADMIN_FLIGHT_BOARD_QUERY_KEY = ['admin', 'flight-board'] as const;

const STALE_TIME_MS = 30_000;
const GC_TIME_MS = 3_600_000;

async function fetchAdminFlightBoard(): Promise<FlightBoardResult> {
  const response = await fetch('/api/leads/flight-board');
  if (!response.ok) {
    throw new Error(`flight-board endpoint returned ${response.status}`);
  }
  let json: unknown;
  try {
    json = await response.json();
  } catch (err) {
    logError('[admin/flight-center]', err, { stage: 'flight_board_parse' });
    throw err;
  }
  return FlightBoardResultSchema.parse(json);
}

export function useAdminFlightBoard(): UseQueryResult<FlightBoardResult, Error> {
  return useQuery<FlightBoardResult, Error>({
    queryKey: ADMIN_FLIGHT_BOARD_QUERY_KEY,
    queryFn: fetchAdminFlightBoard,
    staleTime: STALE_TIME_MS,
    gcTime: GC_TIME_MS,
    // Spec 76 §3.5 mandates inline display of schema drift (parse error
    // + raw response side-by-side), NOT ErrorBoundary escalation. So
    // ZodError stays in `isError` like every other failure mode — the
    // inspector UI's parse_error state handles the render.
  });
}
