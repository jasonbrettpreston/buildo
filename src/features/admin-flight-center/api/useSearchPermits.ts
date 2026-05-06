// 🔗 SPEC LINK: docs/specs/02-web-admin/76_lead_feed_health_dashboard.md §3.4
//             docs/specs/03-mobile/77_mobile_crm_flight_board.md §3.1
//             docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §5 + §13
//
// Permit search hook — web-admin port of mobile useSearchPermits.
// Backed by GET /api/leads/search?q= (full-text search on permit_num
// or address; no geo filter; up to 20 results). The hook takes the
// raw query string; debouncing is the caller's responsibility (the
// SearchPermitsModal debounces input via React state + setTimeout).
//
// `enabled: q.trim().length >= 2` matches the mobile schema's min-length
// gate (mobile schemas.ts uses `z.string().min(2)`), so a 1-char or
// blank query never hits the network.

'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { logError } from '@/lib/logger';
import {
  SearchResultSchema,
  type SearchResult,
} from '@/lib/admin/lead-schemas';

const MIN_QUERY_LENGTH = 2;

async function fetchSearchPermits(q: string): Promise<SearchResult> {
  const response = await fetch(
    `/api/leads/search?q=${encodeURIComponent(q.trim())}`,
  );
  if (!response.ok) {
    throw new Error(`/api/leads/search returned ${response.status}`);
  }
  let raw: unknown;
  try {
    raw = await response.json();
  } catch (err) {
    logError('[admin/flight-center]', err, { stage: 'search_parse', q });
    throw err;
  }
  return SearchResultSchema.parse(raw);
}

export function useSearchPermits(
  q: string,
): UseQueryResult<SearchResult, Error> {
  const trimmed = q.trim();
  return useQuery<SearchResult, Error>({
    queryKey: ['admin', 'search-permits', trimmed],
    queryFn: () => fetchSearchPermits(trimmed),
    enabled: trimmed.length >= MIN_QUERY_LENGTH,
    staleTime: 30_000,
    // Search results land in `isError` on parse failure; the modal UI
    // surfaces the error inline ("Couldn't load search results — try again").
  });
}
