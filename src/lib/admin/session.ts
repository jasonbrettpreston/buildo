// 🔗 SPEC LINK: docs/specs/02-web-admin/35_web_admin_state_architecture.md §B4 + §B5 + §8.5
//             docs/specs/02-web-admin/36_flight_center_tool.md §2
//
// The Spec 35 §B5 logout fan-out + §B4 uid-change handler — made REAL by
// P15 (Spec 35 §5:214 listed `useFlightCenterStore.getState().reset()` as
// PENDING; this module is the implementation site).
//
// CONTRACT (§B5): every Zustand admin store with admin-scoped state MUST be
// enumerated in `resetAdminStores()`. Adding a new store without adding its
// reset here fails the §8.5 store-enumeration coverage test
// (src/tests/admin-store-reset.coverage.test.ts).
//
// CONTRACT (§B4 + [PF13]): an admin-uid CHANGE (admin A → admin B on the
// same browser) must purge the query cache AND reset the stores — a
// different admin must not inherit selectedIds/drafts. A uid REFRESH (same
// admin, claim refresh) must NOT clear (wasteful round-trip). The client
// provider that observes the session uid calls `handleAdminUidChange` with
// the previous/next uid pair; `clearAdminSession` is the logout entry point.
//
// Layer 4 (localStorage) UI prefs are PRESERVED through both paths —
// admin-account-agnostic per Spec 35 §B5.

import type { QueryClient } from '@tanstack/react-query';
import * as Sentry from '@sentry/nextjs';
import { useAdminControlsStore } from '@/features/admin-controls/store/useAdminControlsStore';
import { useFlightCenterStore } from '@/features/admin-flight-center/store/useFlightCenterStore';

/**
 * Layer-3 fan-out: reset EVERY admin Zustand store. §8.5 coverage-test
 * enforced — new admin stores must be added here.
 */
export function resetAdminStores(): void {
  useAdminControlsStore.getState().resetStore();
  useFlightCenterStore.getState().reset();
}

/**
 * §B5 logout fan-out. Purges the TanStack cache (Layer 2), resets every
 * admin store (Layer 3), and clears the Sentry user.
 */
export function clearAdminSession(queryClient: QueryClient): void {
  queryClient.clear();
  resetAdminStores();
  Sentry.setUser(null);
}

/**
 * §B4 auth-change handler [PF13]. uid CHANGE → clear cache + reset stores +
 * re-attribute Sentry. uid REFRESH (same uid) → no-op.
 */
export function handleAdminUidChange(
  queryClient: QueryClient,
  previousUid: string | null,
  nextUid: string | null,
): void {
  if (previousUid === nextUid) return; // refresh, not a change — keep the cache
  queryClient.clear();
  resetAdminStores();
  if (nextUid) {
    Sentry.setUser({ id: nextUid });
  } else {
    Sentry.setUser(null);
  }
}
