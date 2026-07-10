// 🔗 SPEC LINK: docs/specs/02-web-admin/36_flight_center_tool.md §2 + §4.2
//             docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §5 + §13
//             docs/specs/02-web-admin/35_web_admin_state_architecture.md §3.1 + §B1
//
// Address → permit/coa resolution for the Flight Center search box — GET
// /api/admin/leads/watchlist/search?q=. Replaces the retired
// useSearchPermits (which hit the consumer-auth /api/leads/search)
// [PF-HOOKS]. Debouncing is the caller's responsibility (the modal
// debounces input); `enabled: q.trim().length >= 2` keeps 1-char/blank
// queries off the network. Spec 35 §3.1 row:
// ['admin', 'flight-center', 'search', q] @ 30s.

'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { logError } from '@/lib/logger';
import {
  WatchlistSearchResultSchema,
  type WatchlistSearchResult,
} from '@/lib/admin/watchlist-schemas';

const MIN_QUERY_LENGTH = 2;
const STALE_TIME_MS = 30_000;

async function fetchWatchlistSearch(q: string): Promise<WatchlistSearchResult> {
  const response = await fetch(
    `/api/admin/leads/watchlist/search?q=${encodeURIComponent(q)}`,
  );
  if (!response.ok) {
    throw new Error(`/api/admin/leads/watchlist/search returned ${response.status}`);
  }
  let raw: unknown;
  try {
    raw = await response.json();
  } catch (err) {
    logError('[admin/flight-center]', err, { stage: 'watchlist_search_parse', q });
    throw err;
  }
  return WatchlistSearchResultSchema.parse(raw);
}

export function useWatchlistSearch(
  q: string,
): UseQueryResult<WatchlistSearchResult, Error> {
  const trimmed = q.trim();
  return useQuery<WatchlistSearchResult, Error>({
    queryKey: ['admin', 'flight-center', 'search', trimmed],
    queryFn: () => fetchWatchlistSearch(trimmed),
    enabled: trimmed.length >= MIN_QUERY_LENGTH,
    staleTime: STALE_TIME_MS,
  });
}
