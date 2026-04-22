'use client';
// 🔗 SPEC LINK: docs/specs/03-mobile/75_lead_feed_implementation_guide.md §11 Phase 3
//
// Client-side provider composition. Lives in src/app/ (NOT inside
// src/features/leads/) so the React Context exemption in CLAUDE.md §12.4
// Frontend Mode applies: 3rd-party providers are allowed outside the leads
// feature scope, even though useContext is banned inside it.
//
// Composition:
//   PersistQueryClientProvider (TanStack Query + IndexedDB hydration)
//     └── PostHogProvider (existing observability side-effect wrapper)
//         └── children
//
// The QueryClient is a singleton from `getQueryClient()` so React Strict
// Mode remounts don't throw away the cache. The persister is created
// once at module scope so `persistOptions` has a stable reference —
// passing a fresh object on every render would cause infinite rehydration
// loops in dev.

import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { PostHogProvider } from '@/components/observability/PostHogProvider';
import {
  CACHE_BUSTER,
  CACHE_MAX_AGE_MS,
  createLeadsPersister,
  getQueryClient,
} from '@/features/leads/api/query-client';

const queryClient = getQueryClient();
const persister = createLeadsPersister();

// Module-scope `persistOptions` — the Phase 3-i adversarial review
// flagged that an inline object literal passed to
// `PersistQueryClientProvider` is recreated on every render, causing
// unnecessary rehydration checks in dev. Hoisting it to module scope
// guarantees a stable reference for the provider.
const persistOptions = {
  persister,
  maxAge: CACHE_MAX_AGE_MS,
  buster: CACHE_BUSTER,
} as const;

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      <PostHogProvider>{children}</PostHogProvider>
    </PersistQueryClientProvider>
  );
}
