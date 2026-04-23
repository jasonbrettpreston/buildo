// SPEC LINK: docs/specs/03-mobile/90_mobile_engineering_protocol.md §TanStack Query
// Singleton QueryClient with staleTime / gcTime tuned for a mobile feed:
// - staleTime 30s: data is fresh for 30s before a background refetch fires
// - gcTime 1h: inactive queries survive in memory for 1 hour (feeds the persister)
// - retry 2: transient network blips get two retries before error state
//
// Phase 7 — React Native bridge adapters:
//   onlineManager: replaces browser navigator.onLine with NetInfo
//   focusManager:  replaces document visibilitychange with AppState
// Both replacements are required on React Native — the browser globals don't exist.
// onlineManager drives automatic mutation pause/resume on network loss/recovery
// (paused mutations re-queue and replay the moment isConnected returns true).
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { QueryClient, onlineManager, focusManager } from '@tanstack/react-query';

// Wire TanStack's online state to native NetInfo events.
// Returns an unsubscribe function — TanStack calls it on cleanup.
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => setOnline(!!state.isConnected)),
);

// Wire TanStack's focus state to AppState so background → foreground
// transitions trigger a refetch (same as switching browser tabs on web).
focusManager.setEventListener((handleFocus) => {
  const sub = AppState.addEventListener('change', (s) => handleFocus(s === 'active'));
  return sub.remove;
});

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 3_600_000,
      retry: 2,
    },
  },
});
