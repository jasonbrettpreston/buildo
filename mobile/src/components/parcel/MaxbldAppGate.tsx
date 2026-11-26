// SPEC LINK: docs/specs/00-architecture/116_multi_product_architecture.md §3 (dated note 2026-11-26: the MaxBLD app inside the one project),
//            docs/specs/03-mobile/99_mobile_state_architecture.md §4 (the B1 entitlement key, a reader), §6.5 (stable gate signals), §7.3 (route_decision),
//            docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §4 (the Opening surface).
//
// task-313 McApp card 1, the front door (PLAN-313-v1 M5; RR-0499 "1a", MORNING-DECISIONS.md:2598: sign-in straight to search, the MaxBLD bar the only bar,
// the lead-app screens kept in the code unreachable; RR-0503 Q1 A: the plan check is the server 403, not this gate). The (app) group's layout in the MaxBLD
// build ((app)/_layout.tsx routes on APP_PRODUCT). It reads the entitlement read (useParcelEntitlement, the search page's query key) for offline and error
// only, and decides with decideMaxbldGate (mobile/src/lib/appShell.ts):
//   loading / offline / error -> the Opening page (mobile_parcel_opening) through the shared SurfaceRenderer; Try again refetches;
//   redirect -> expo-router <Redirect> to the Lookup (a convenience, not the control: the retained lead routes are protected by server authorisation);
//   enter    -> <Slot/>, the existing parcel-tool Stack and its ParcelShelf (Lookup, Tracked Lots, Account), the one MaxBLD bar.
// The only time bound is REPORT_GIVE_UP_MS (the registered 60 000, task-267's export); no setting of its own.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Redirect, Slot, useSegments } from 'expo-router';
import { SurfaceRenderer, type SurfaceActions, type SurfaceTree } from '@/components/surfaces/SurfaceRenderer';
import { OPENING_SLICE, openingData, openingProps } from '@/components/surfaces/OpeningBinding';
import { REPORT_GIVE_UP_MS, useParcelEntitlement } from '@/hooks/useParcelLookup';
import { useAuthStore } from '@/store/authStore';
import { decideMaxbldGate, MAXBLD_LOOKUP_ROUTE } from '@/lib/appShell';
import { track } from '@/lib/analytics';

const NOOP = (): void => undefined;

export function MaxbldAppGate() {
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s._hasHydrated);
  const segments = useSegments();
  const { data, status, fetchStatus, refetch } = useParcelEntitlement();
  const hasData = data !== undefined;

  // The give-up clock: from mount, restarted by Try again (a new start always re-renders, even when the clock had already read the same instant).
  // One timer re-renders the gate when the bound passes while the read has no data.
  const [since, setSince] = useState(() => Date.now());
  const [now, setNow] = useState(since);
  useEffect(() => {
    if (hasData) return undefined;
    const t = setTimeout(() => setNow(Date.now()), Math.max(0, since + REPORT_GIVE_UP_MS - Date.now()));
    return () => clearTimeout(t);
  }, [hasData, since]);

  const gate = decideMaxbldGate({
    hydrated,
    signedIn: !!user,
    read: { status, fetchStatus, hasData },
    segments,
    pendingMs: Math.max(0, now - since),
    giveUpMs: REPORT_GIVE_UP_MS,
  });

  // Spec 99 §7.3 router decision telemetry: DEV-only, once per redirect answer.
  useEffect(() => {
    if (gate !== 'redirect') return;
    if (__DEV__) {
      track('route_decision', {
        authority: 'MaxbldAppGate',
        branch: 'redirect',
        from: segments.join('/') || '(root)',
        to: MAXBLD_LOOKUP_ROUTE,
        reason: 'maxbld_front_door',
      });
    }
  }, [gate, segments]);

  const tryAgain = useCallback(() => {
    const t = Date.now();
    setSince(t);
    setNow(t);
    void refetch();
  }, [refetch]);
  const actions = useMemo<SurfaceActions>(
    () => ({ change_input: NOOP, set_input: NOOP, retry: tryAgain, select: NOOP, back: NOOP, push: NOOP }),
    [tryAgain],
  );

  // The order is the fence (src/tests/surfaces/parcel-tool-fence.infra.test.ts): the Opening and the redirect return before the route is drawn.
  if (gate === 'loading' || gate === 'offline' || gate === 'error') {
    return <SurfaceRenderer tree={openingProps({ kind: gate }) as SurfaceTree} content={OPENING_SLICE.content} data={openingData()} actions={actions} />;
  }
  if (gate === 'redirect') return <Redirect href={MAXBLD_LOOKUP_ROUTE} />;
  return <Slot />;
}
