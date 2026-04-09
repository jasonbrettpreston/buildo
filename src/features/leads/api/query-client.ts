// 🔗 SPEC LINK: docs/specs/product/future/75_lead_feed_implementation_guide.md §2.1 + §11 Phase 3
//
// Singleton TanStack QueryClient + IndexedDB persister for the lead feed.
// Spec 75 §2.1 defines the default options (staleTime, gcTime, retry policy);
// spec 75 §11 Phase 3 step 2 defines the persister wiring (idb-keyval,
// 24-hour maxAge, buster for cache invalidation).
//
// Consumers: `src/app/providers.tsx` creates ONE instance at module scope and
// wraps the app in `<PersistQueryClientProvider>`. Individual hooks
// (`useLeadFeed`, `useLeadView`) read it via `useQueryClient()`. The singleton
// pattern matters for two reasons:
//   1. Every render of the provider would otherwise make a new client,
//      throwing away all cached data.
//   2. The persister needs a stable `queryClient` reference to hydrate from
//      IndexedDB on mount without races.

import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient } from '@tanstack/react-query';
import { del, get, set } from 'idb-keyval';

/**
 * Default options for all leads queries. Per spec 75 §2.1:
 * - `staleTime: 60s` — feed data is time-sensitive but doesn't change
 *   every render; a 1-minute stale window prevents refetch storms.
 * - `gcTime: 24h` — MUST equal `CACHE_MAX_AGE_MS` below. The Phase 3-i
 *   adversarial review caught that a 5-minute gcTime with 24-hour
 *   persistence creates a contract bug: queries evicted from the
 *   in-memory cache after 5 minutes of inactivity are also removed
 *   from the persister's next snapshot, defeating the offline promise.
 *   Matching the two values makes the persister's retention the
 *   single source of truth.
 * - `retry: 1` — one retry on network error. Spec 70 §API Endpoints
 *   documents the 30/min rate limit; aggressive retries would burn
 *   the bucket and get the user 429'd.
 * - `refetchOnWindowFocus: false` — mobile users background the app
 *   constantly; a refetch on every foreground would drain battery +
 *   data. Explicit pull-to-refresh (3-iv) is the refresh trigger.
 * - `refetchOnReconnect: true` — after offline, reconnecting should
 *   re-validate the cache. This is distinct from window-focus refetch.
 */
const DEFAULT_STALE_MS = 60_000;
const DEFAULT_GC_MS = 24 * 60 * 60 * 1000; // must equal CACHE_MAX_AGE_MS below

let clientSingleton: QueryClient | null = null;

/**
 * Returns the process-wide QueryClient. Creates it on first call, returns
 * the same instance on every subsequent call. Do NOT call this inside a
 * React component body — use `useQueryClient()` from TanStack Query
 * instead. This function is for the `<Providers>` bootstrap only.
 */
export function getQueryClient(): QueryClient {
  if (clientSingleton === null) {
    clientSingleton = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: DEFAULT_STALE_MS,
          gcTime: DEFAULT_GC_MS,
          retry: 1,
          refetchOnWindowFocus: false,
          refetchOnReconnect: true,
        },
        mutations: {
          retry: 0, // mutations must not retry automatically — save/unsave is idempotent but view count isn't
        },
      },
    });
  }
  return clientSingleton;
}

/**
 * IndexedDB-backed persister. Uses `idb-keyval` (4KB min-zipped) instead
 * of `localStorage` because IndexedDB has no size cap (we cache up to
 * 75 leads × ~2KB = 150KB, well under the 5MB localStorage quota but
 * uncomfortable on low-memory devices). `throttleTime: 1000` batches
 * writes so rapid cache updates don't thrash the disk.
 *
 * Key name: `buildo-leads-cache`. Bump `CACHE_BUSTER` whenever the feed
 * response shape changes so existing users don't rehydrate stale data.
 */
export const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const CACHE_BUSTER = '1';

export function createLeadsPersister() {
  return createAsyncStoragePersister({
    storage: {
      getItem: async (key: string) => (await get(key)) ?? null,
      setItem: async (key: string, value: string) => {
        await set(key, value);
      },
      removeItem: async (key: string) => {
        await del(key);
      },
    },
    key: 'buildo-leads-cache',
    throttleTime: 1000,
  });
}

/**
 * Reset the singleton. Tests ONLY. Production code MUST NOT call this.
 */
export function __resetQueryClientForTests(): void {
  clientSingleton = null;
}
