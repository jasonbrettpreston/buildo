// SPEC LINK: docs/specs/03-mobile/90_mobile_engineering_protocol.md §12
// Singleton QueryClient with staleTime / gcTime per spec §12 defaults:
// - staleTime 5m: main feed stays fresh for 5 minutes before background refetch
// - gcTime 24h: inactive queries survive in memory for 24h, matching MMKV maxAge
//   so cold-boot cache hits don't fall into a gap between in-memory GC and on-disk persistence
// - retry 2: transient network blips get two retries before error state
// Screen-level hooks (e.g. useFlightBoard) may override these defaults.
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
      staleTime: 300_000,
      gcTime: 86_400_000,
      retry: 2,
    },
  },
});
