// SPEC LINK: docs/specs/03-mobile/77_mobile_crm_flight_board.md §5 State & API Flow
// useQuery (not infinite) — the personal board fits in memory.
// staleTime: 30s, gcTime: 1h per spec 77 §5.
import { useQuery } from '@tanstack/react-query';
import { ZodError } from 'zod';
import { fetchWithAuth } from '@/lib/apiClient';
import { FlightBoardResultSchema } from '@/lib/schemas';
import type { FlightBoardResult } from '@/lib/schemas';

export const FLIGHT_BOARD_QUERY_KEY = ['flight-board'] as const;

async function fetchFlightBoard(): Promise<FlightBoardResult> {
  const raw = await fetchWithAuth<unknown>('/api/leads/flight-board');
  return FlightBoardResultSchema.parse(raw);
}

export function useFlightBoard() {
  return useQuery({
    queryKey: FLIGHT_BOARD_QUERY_KEY,
    queryFn: fetchFlightBoard,
    staleTime: 30_000,
    gcTime: 3_600_000,
    // Schema drift re-throws to ErrorBoundary; network errors stay inline.
    throwOnError: (err) => err instanceof ZodError,
  });
}
