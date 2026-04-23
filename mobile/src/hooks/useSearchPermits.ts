// SPEC LINK: docs/specs/03-mobile/77_mobile_crm_flight_board.md §3.1 Global Search & Claim
// Fires when query is >= 2 chars. staleTime: 60s (search results age quickly).
import { useQuery } from '@tanstack/react-query';
import { ZodError } from 'zod';
import { fetchWithAuth } from '@/lib/apiClient';
import { SearchResultSchema } from '@/lib/schemas';
import type { SearchResult } from '@/lib/schemas';

async function fetchSearch(q: string): Promise<SearchResult> {
  const raw = await fetchWithAuth<unknown>(
    `/api/leads/search?q=${encodeURIComponent(q)}`,
  );
  return SearchResultSchema.parse(raw);
}

export function useSearchPermits(q: string) {
  const trimmed = q.trim();
  return useQuery({
    queryKey: ['search-permits', trimmed],
    queryFn: () => fetchSearch(trimmed),
    enabled: trimmed.length >= 2,
    staleTime: 60_000,
    // Schema drift re-throws to ErrorBoundary; network errors stay inline.
    throwOnError: (err) => err instanceof ZodError,
  });
}
