// 🔗 SPEC LINK: docs/specs/02-web-admin/36_flight_center_tool.md §2
//             docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §5 + §13
//             docs/specs/02-web-admin/35_web_admin_state_architecture.md §3.1 + §B1
//
// The Flight Center flight list — GET /api/admin/leads/watchlist.
// Replaces the retired useAdminFlightBoard (which read the consumer
// /api/leads/flight-board under the single-trade lead_views model)
// [PF-HOOKS]. Server-side paginated ([PF4]): LIMIT 50 + offset, total in
// meta. Spec 35 §3.1 row: ['admin', 'flight-center', 'board'] @ 30s.

'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { logError } from '@/lib/logger';
import {
  WatchlistResultSchema,
  type WatchlistResult,
} from '@/lib/admin/watchlist-schemas';

export const WATCHLIST_BOARD_QUERY_KEY = ['admin', 'flight-center', 'board'] as const;

const STALE_TIME_MS = 30_000;
const GC_TIME_MS = 3_600_000;

async function fetchWatchlist(offset: number): Promise<WatchlistResult> {
  const response = await fetch(`/api/admin/leads/watchlist?offset=${offset}`);
  if (!response.ok) {
    throw new Error(`/api/admin/leads/watchlist returned ${response.status}`);
  }
  let json: unknown;
  try {
    json = await response.json();
  } catch (err) {
    logError('[admin/flight-center]', err, { stage: 'watchlist_parse' });
    throw err;
  }
  // Spec 33 §13 — parse {data, meta} at the response boundary; schema drift
  // lands in isError like every other failure mode.
  return WatchlistResultSchema.parse(json);
}

export function useWatchlist(offset = 0): UseQueryResult<WatchlistResult, Error> {
  return useQuery<WatchlistResult, Error>({
    queryKey: [...WATCHLIST_BOARD_QUERY_KEY, offset],
    queryFn: () => fetchWatchlist(offset),
    staleTime: STALE_TIME_MS,
    gcTime: GC_TIME_MS,
  });
}
