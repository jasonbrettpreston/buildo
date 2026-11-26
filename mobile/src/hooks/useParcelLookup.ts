// SPEC LINK: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §4 (screens + hooks)
//            docs/specs/03-mobile/99_mobile_state_architecture.md §4 B1 (query keys)
//            docs/specs/03-mobile/90_mobile_engineering_protocol.md §13 (Zod boundary)
//
// TanStack Query hooks for the Parcel Cost Tool. Two query keys (Spec 99 §4):
//   ['parcel-search', q]      — debounced typeahead (search screen)
//   ['parcel-lookup', parcelId] — the detail screen (depends ONLY on parcelId, query-key hygiene)
//   ['parcel-checking', parcelId] — task-267 LOAD.2: the report screen's fast read (fast=1), sent first at the pick; never persisted (persistFilter.ts)
// Both endpoints return the SAME whitelist envelope shape; the hook parses `raw.data` through
// ConsumerParcelLookupResultSchema. A drifted server shape re-throws to the ErrorBoundary; network
// errors (ApiError/RateLimitError/NetworkError) stay in `isError` for inline handling.

import { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, AppState } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Sentry from '@sentry/react-native';
import { fetchWithAuth } from '@/lib/apiClient';
import { AccountDeletedError, ApiError, RateLimitError } from '@/lib/errors';
import { useAuthStore } from '@/store/authStore';
import { boundedWait, SEMI_CONTINUE_WAIT_MS } from '@/lib/semiQuestion';
import searchSlice from '@/generated/surfaces/mobile_parcel_search.json';
import { sliceNumber } from '@/lib/sliceConfig';
import {
  ConsumerParcelLookupResultSchema,
  ParcelToolEntitlementSchema,
  type ConsumerParcelLookupResult,
  type ParcelToolEntitlement,
} from '@/lib/schemas';

// Sentinel for deterministic schema-drift failures — short-circuits the retry guard so a
// malformed server response doesn't generate duplicate Sentry events (mirrors useLeadDetail).
export class ParcelLookupSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParcelLookupSchemaError';
  }
}

export async function fetchParcelLookup(
  // SRCH.SEMI stage 2 (task-319, MF-93; RR-0278): `semi: 'answered'` is the one optional flag the semi question page sends at Continue, so the
  // server counts the lot once its report is produced (contract_parcels_lookup, route.ts). It belongs to the parcelId form only.
  // task-267 LOAD.2 (PLAN-267-v2 step 4): `fast: '1'` is the report screen's fast read (the stored page or the What we checked view, never a compute); it
  // belongs to the parcelId form and is never sent with semi (the server refuses the pair).
  params: { q: string } | { parcelId: string; semi?: 'answered'; fast?: '1' },
): Promise<ConsumerParcelLookupResult> {
  const qs = 'q' in params
    ? `q=${encodeURIComponent(params.q)}`
    : `parcelId=${encodeURIComponent(params.parcelId)}${params.semi ? `&semi=${params.semi}` : ''}${params.fast ? `&fast=${params.fast}` : ''}`;
  const raw = await fetchWithAuth<{ data: unknown }>(`/api/parcels/lookup?${qs}`);
  const parsed = ConsumerParcelLookupResultSchema.safeParse(raw.data);
  if (!parsed.success) {
    Sentry.captureException(parsed.error, { extra: { context: 'useParcelLookup Zod parse' } });
    throw new ParcelLookupSchemaError('Parcel lookup response failed schema validation');
  }
  return parsed.data;
}

// FIX.TUNE (task-378; Spec 126 P4, Spec 128 Rule 3): the retry count and the stale times are the search surface's declared config, read from its generated slice.
const LOOKUP_RETRY_MAX = sliceNumber(searchSlice, 'lookup_retry_max');
const LOOKUP_STALE_MS = sliceNumber(searchSlice, 'lookup_stale_ms');
const ENTITLEMENT_STALE_MS = sliceNumber(searchSlice, 'entitlement_stale_ms');
const LOOKUP_MIN_QUERY_LEN = sliceNumber(searchSlice, 'min_query_len');

// Skip retries for deterministic states: 400 (bad params), 403 (no subscription / deleted),
// 429 (burning retries against the rate-limit compounds the throttle), schema-drift.
export function shouldRetryParcelLookup(failureCount: number, err: unknown): boolean {
  return (
    !(err instanceof AccountDeletedError) &&
    !(err instanceof RateLimitError) &&
    !(err instanceof ApiError && (err.status === 400 || err.status === 403)) &&
    !(err instanceof ParcelLookupSchemaError) &&
    failureCount < LOOKUP_RETRY_MAX
  );
}

/** task-457 (RR-0456 Q5): the search retries a zero-second rate limit once, on the first failure only; everything else is shouldRetryParcelLookup. A zero-second wait is not a throttle the person must sit out, so the 429 guard above stays for every other wait. Once is the ruling and not a setting (RR-0392). */
export function shouldRetryParcelSearch(failureCount: number, err: unknown): boolean {
  if (err instanceof RateLimitError && err.retryAfterSeconds === 0) return failureCount === 0;
  return shouldRetryParcelLookup(failureCount, err);
}

/**
 * Debounced typeahead search. Fires when the trimmed query is ≥ 3 chars (the server min).
 * The screen owns the ≥400ms debounce (Spec 100 §4); this hook just caches per query string.
 */
export function useParcelSearch(q: string) {
  const trimmed = q.trim();
  const accessToken = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['parcel-search', trimmed],
    queryFn: () => fetchParcelLookup({ q: trimmed }),
    enabled: trimmed.length >= LOOKUP_MIN_QUERY_LEN && !!accessToken,
    staleTime: LOOKUP_STALE_MS,
    retry: shouldRetryParcelSearch,
  });
}

/**
 * SRCH.METER-2 (task-360, RR-0278; SE-1, SE-2): the parcelId form of the lookup, carrying the report route's `semi` param to the server as `semi: 'answered'`
 * only when it is exactly the string 'answered' (the server holds an unsure lot's page without it; a stray param asks, never skips: lotForm.ts needsSemiQuestion).
 */
export function parcelLookupParams(parcelId: string, semi?: string): { parcelId: string; semi?: 'answered' } {
  return semi === 'answered' ? { parcelId, semi: 'answered' } : { parcelId };
}

/**
 * Detail lookup by parcelId. Depends ONLY on `['parcel-lookup', parcelId]` (Spec 100 §4 /
 * fold #9 query-key hygiene) — never on the search query string. `semi` is the report route's param (the report screen only); it changes the request,
 * not the key (the semi page stores its answered result under the same key, useSetParcelLookup).
 */
export function useParcelLookup(parcelId: string | undefined, semi?: string, gate = true) {
  const accessToken = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['parcel-lookup', parcelId],
    queryFn: () => fetchParcelLookup(parcelLookupParams(parcelId!, semi)),
    // task-267: `gate` holds the report read until the fast read has settled (useReportScreen); every other caller leaves it true.
    enabled: !!parcelId && !!accessToken && gate,
    // LOOKUP_STALE_MS stays (PLAN-267-v2 step 4, O5 reversed): a cached page shows at once and the refetch behind it is silent (Spec 90 §14).
    staleTime: LOOKUP_STALE_MS,
    retry: (failureCount, err) => !(parcelId !== undefined && REPORT_GAVE_UP.has(parcelId)) && shouldRetryParcelLookup(failureCount, err),
  });
}

/**
 * task-267 LOAD.2 (PLAN-267-v2 steps 4, 6 and 9; RR-0491 and RR-0493: 60 s from the pick is the failure limit; RR-0497 Q-a A: after the 3 ruled retries
 * or at 60 s). The give-up is the existing registered 60 000 (maxbld_page_continue_wait_ms, read as SEMI_CONTINUE_WAIT_MS): the semi wait and the report
 * give-up share one value (a later card gives the report its own row, RR-0477). No typed number (Spec 128 Rule 3).
 */
export const REPORT_GIVE_UP_MS = SEMI_CONTINUE_WAIT_MS;
/** The lots whose report read gave up: their retries stop (the attempt in flight is left to land in the cache). Try again clears the lot. */
const REPORT_GAVE_UP = new Set<string>();
/** The pick mark per lot (the screen's first mount, milliseconds after the push), kept outside the component so a remount or a second push for the
 *  same lot does not restart the lines; a mark older than the give-up is stale and replaced. Removed once the screen ends (a page shown or an ending). */
const PICK_MARKS = new Map<string, number>();
const TICK_MS = 250; // the redraw tick of the line reveal (animation timing, Spec 128 §2.1 exception 4), not a business value
export const reportClock = {
  mark(id: string, now: number): number {
    const m = PICK_MARKS.get(id);
    if (m !== undefined && now - m < REPORT_GIVE_UP_MS) return m;
    PICK_MARKS.set(id, now);
    return now;
  },
  end(id: string): void { PICK_MARKS.delete(id); },
  gaveUp: (id: string): boolean => REPORT_GAVE_UP.has(id),
  /** Test seam: forget every mark and every give-up. */
  reset(): void { PICK_MARKS.clear(); REPORT_GAVE_UP.clear(); },
};

/** The fast read (fast=1): the stored page or the checked view, never a compute. A page it finds is stored under the report's own key, so no report read
 *  is sent for it. No retry (it is optional and shares the parcels-lookup bucket with the report read). */
export function useParcelChecking(parcelId: string | undefined, send: boolean) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ['parcel-checking', parcelId],
    queryFn: async () => {
      // enabled below holds the query until parcelId is set, so the query function never runs without it
      const r = await fetchParcelLookup({ parcelId: parcelId!, fast: '1' });
      if (r.page) queryClient.setQueryData(['parcel-lookup', parcelId], r);
      return r;
    },
    enabled: !!parcelId && !!accessToken && send,
    retry: false,
  });
}

/**
 * task-267 LOAD.2 + task-317 LOAD.4: the report screen's reads and clock. The fast read is sent first unless the lot's page is already in the cache
 * (opened on this phone: the lines are skipped, RR-0485 item 5) or the route carries the semi answer; the report read only after the fast read settles
 * with no page (or fails). The clock starts at the pick mark; it ticks while the screen waits and stops at an ending, so the lines stay as far as they got
 * (RR-0492 item 2). Every signal it returns is stable (Spec 99 §6.5): timestamps and settled answers, never isFetching.
 */
export function useReportScreen(parcelId: string | undefined, semi?: string) {
  const queryClient = useQueryClient();
  const id = parcelId ?? '';
  const [mountAt] = useState(() => Date.now());
  const [cachedPage] = useState(() => Boolean((queryClient.getQueryData(['parcel-lookup', parcelId]) as ConsumerParcelLookupResult | undefined)?.page));
  const sendFast = semi === undefined && !cachedPage;
  const checking = useParcelChecking(parcelId, sendFast);
  const fastDone = !sendFast || checking.isError || (checking.data !== undefined && !checking.data.page);
  const report = useParcelLookup(parcelId, semi, fastDone);
  const [mark] = useState(() => reportClock.mark(id, mountAt));
  const [tryAt, setTryAt] = useState(mountAt);
  const [giveUpFrom, setGiveUpFrom] = useState(mark);
  const [now, setNow] = useState(mountAt);
  // A new visit starts with no give-up (the mark of an earlier visit's give-up is cleared; the retries of this visit stop at this visit's give-up).
  const [gaveUp, setGaveUp] = useState(() => { REPORT_GAVE_UP.delete(id); return false; });
  const [kicked, setKicked] = useState(false);
  const [opened, setOpened] = useState(false);
  const [linesFull, setLinesFull] = useState(false);
  const reduceMotion = useReduceMotion();
  const checked = checking.data?.whatWeChecked ?? null;
  const pageIn = Boolean(report.data?.page);
  const answeredThisVisit = report.data !== undefined && report.dataUpdatedAt >= tryAt;
  const errorThisTry = report.isError && report.errorUpdatedAt >= tryAt;
  const linesDone = checked === null || linesFull || now - mark >= checked.min_ms;
  const ended = gaveUp || errorThisTry || (answeredThisVisit && !pageIn);
  const running = !opened && !ended && !(pageIn && linesDone);
  useEffect(() => {
    if (!running) return undefined;
    const t = setInterval(() => setNow(Date.now()), TICK_MS);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') setNow(Date.now()); });
    return () => { clearInterval(t); sub.remove(); };
  }, [running]);
  useEffect(() => {
    if (running && !pageIn && now - giveUpFrom >= REPORT_GIVE_UP_MS) { REPORT_GAVE_UP.add(id); setGaveUp(true); }
  }, [running, pageIn, now, giveUpFrom, id]);
  useEffect(() => { if (!running) reportClock.end(id); }, [running, id]);
  // A miss cached from an earlier visit (fresh within the stale time, so enabling the query does not refetch it) is not this visit's answer: ask once.
  const { data: reportData, dataUpdatedAt: reportAt, refetch } = report;
  useEffect(() => {
    if (!kicked && fastDone && reportData !== undefined && !reportData.page && reportAt < tryAt) { setKicked(true); void refetch(); }
  }, [kicked, fastDone, reportData, reportAt, tryAt, refetch]);
  const ready = checked !== null && pageIn && linesDone && !opened && !gaveUp;
  useEffect(() => { if (ready && reduceMotion && checked) AccessibilityInfo.announceForAccessibility(checked.summary); }, [ready, reduceMotion, checked]);
  const retry = useCallback(() => {
    REPORT_GAVE_UP.delete(id);
    setGaveUp(false);
    if (queryClient.getQueryData<ConsumerParcelLookupResult>(['parcel-lookup', parcelId])?.page) { setOpened(true); return; } // a late page in the cache: no new compute
    const t = Date.now();
    setLinesFull(true);
    setTryAt(t);
    setGiveUpFrom(t);
    setNow(t);
    void refetch();
  }, [id, parcelId, queryClient, refetch]);
  const open = useCallback(() => setOpened(true), []);
  // The wall reads the report read's refusal, or the fast read's only when it is a 403 (a stored lot at the limit); any other fast error is ignored.
  const fastRefusal = checking.error instanceof ApiError && checking.error.status === 403 ? checking.error : null;
  return {
    data: report.data, isError: errorThisTry, isFetching: report.isFetching, error: report.error ?? fastRefusal,
    checked, elapsedMs: now - mark, lineElapsedMs: reduceMotion || linesFull ? Number.MAX_SAFE_INTEGER : now - mark,
    gaveUp, answeredThisVisit, opened, linesFull, open, retry,
    address: report.data?.match?.address || checking.data?.match?.address || null,
  };
}

/** Reduce Motion (Spec 100 §4 MF-62): the lines show at once; read once and kept current. */
export function useReduceMotion(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => { if (live) setOn(v); });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setOn);
    return () => { live = false; sub.remove(); };
  }, []);
  return on;
}

/**
 * Store an answered lookup under the report's own cache key. SUITE.FIX-2 (task-353, 2026-11-19): the semi question page (a mount file) used to call
 * useQueryClient itself (9fea46277); a mount may import only framework packages, binding modules and @/hooks/ (bindings.json mount_internal, FE-31 C-2),
 * so the one setQueryData call lives here, the same key as useParcelLookup.
 */
export function useSetParcelLookup() {
  const queryClient = useQueryClient();
  return useCallback(
    (parcelId: string, result: ConsumerParcelLookupResult) => { queryClient.setQueryData(['parcel-lookup', parcelId], result); },
    [queryClient],
  );
}

/**
 * FIX.SEMI (task-373, grounder D5; Spec 99 section 4 B1 99:219 "Every server fetch MUST go through TanStack Query"): the semi question page's Continue lookup,
 * the same lookup with the one flag `semi: 'answered'` (SRCH.SEMI stage 2, task-319), bounded by SEMI_CONTINUE_WAIT_MS (task-361, LX-E1: a lookup that does not
 * settle ends in the page's built error state). The Zod boundary is fetchParcelLookup's own parse.
 */
export function answeredParcelLookup(parcelId: string): Promise<ConsumerParcelLookupResult> {
  return boundedWait(fetchParcelLookup({ parcelId, semi: 'answered' }), SEMI_CONTINUE_WAIT_MS);
}

/**
 * Options of the Continue mutation. retry 0: a failed answer is not re-sent by the library (the page's Try again is the retry). networkMode 'always': the
 * default 'online' pauses a mutation while offline, so the bounded wait would never start and the page would stay busy; offline it must fail at once, as task-361 built it.
 */
export function buildAnswerParcelLookupOptions() {
  return { mutationFn: answeredParcelLookup, retry: 0, networkMode: 'always' } as const;
}

// Callers use mutateAsync inside try/catch (the semi page does): the hook sets no onError.
export function useAnswerParcelLookup() {
  return useMutation(buildAnswerParcelLookupOptions());
}

/**
 * SRCH.A6 (task-320; RR-0307): the caller's plan and this month's report count, read from GET /api/parcels/entitlement (the line "N of M reports left
 * until <date>"). A display, never a gate. Parsed through the Zod boundary like the lookup; a drifted shape is the same ParcelLookupSchemaError. No
 * retry on 401/403/429 or drift (the line is simply absent); never persisted across a restart (mobile/src/lib/persistFilter.ts); re-read on focus.
 */
export async function fetchParcelEntitlement(): Promise<ParcelToolEntitlement> {
  const raw = await fetchWithAuth<{ data: unknown }>('/api/parcels/entitlement');
  const parsed = ParcelToolEntitlementSchema.safeParse(raw.data);
  if (!parsed.success) {
    Sentry.captureException(parsed.error, { extra: { context: 'useParcelEntitlement Zod parse' } });
    throw new ParcelLookupSchemaError('Parcel entitlement response failed schema validation');
  }
  return parsed.data;
}

export function useParcelEntitlement() {
  const accessToken = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['parcel-entitlement'],
    queryFn: fetchParcelEntitlement,
    enabled: !!accessToken,
    staleTime: ENTITLEMENT_STALE_MS,
    retry: shouldRetryParcelLookup,
  });
}
