// SPEC LINK: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §4 (ParcelSearchScreen) and its dated note 2026-11-10, §2.6 (the response shape
//            drives the client state machine), §2.8 (never log the raw query), §2.9 (Toronto scoping is UX, not security)
//            docs/specs/02-web-admin/126_maxbld_surface_standard.md §3.1 (SEARCH archetype), §11b (a page = descriptor + content + library)
//            docs/specs/00-architecture/117_maxbld_brand.md §6.1 and its dated note 2026-11-10 (this page's layout)
//            docs/specs/03-mobile/99_mobile_state_architecture.md §4 (query keys), §3.4c (recent searches), §6.1 (atomic Zustand selectors)
//
// Surface S-002 `mobile_parcel_search` — the Lookup tab of the MaxBLD product shell, S-004 `shell_parcel_tool_stack`. S-004 draws the shelf;
// this screen draws no navigation of its own (the account button inside the search bar is one action).
//
// MF-35: the mount file of a converted surface. It holds only hooks, the navigation effect and the callbacks; everything it shows comes from
// the binding (SearchBinding.tsx: the props tree; SurfaceRenderer.tsx: the library parts) and the content file. It branches on a MATCH TYPE,
// never on a result count (operator ruling 2026-09-16): `unique` opens the lot, `text_candidates` shows the address list here, the map kinds
// open `disambiguate` (MF-53). MaxBLD is its own product (Spec 116 OD5): nothing here may reference a lead-gen concept, and the query is
// never logged or tracked.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { SurfaceRenderer, type SurfaceTree } from '@/components/surfaces/SurfaceRenderer';
import {
  SEARCH_CANDIDATE_LIMIT,
  SEARCH_DEBOUNCE_MS,
  SEARCH_MIN_QUERY_LEN,
  SEARCH_SLICE,
  searchData,
  searchProps,
} from '@/components/surfaces/SearchBinding';
import { useParcelEntitlement, useParcelSearch, ParcelLookupSchemaError } from '@/hooks/useParcelLookup';
import { useDebouncedValue, useGoBack } from '@/hooks/useParcelPageHooks';
import { useWallState } from '@/hooks/useWallState';
import { buildSearchSituation, searchQueryArg } from '@/lib/parcelSearchMatch';
import { openHelp } from '@/lib/maxbldHelp';
import { useRecentSearchesStore } from '@/store/recentSearchesStore';
import { useAuthStore } from '@/store/authStore';

export default function ParcelSearchScreen() {
  const router = useRouter();
  const [input, setInput] = useState('');
  const [selectedParcelId, setSelectedParcelId] = useState<string | null>(null);
  const recent = useRecentSearchesStore((s) => s.recent);
  const addRecent = useRecentSearchesStore((s) => s.add);

  // Debounce (config.debounce_ms) so typeahead exploration does not burn the 60/min rate bucket.
  const debounced = useDebouncedValue(input, SEARCH_DEBOUNCE_MS);

  // P35-D17 a (nothing pre-checked; OUTPUT fold MEDIUM 1): a new debounced query clears the checked address card.
  useEffect(() => {
    setSelectedParcelId(null);
  }, [debounced]);

  // SRCH.A6 (task-320; RR-0307): the reports-left line reads the served count (GET /api/parcels/entitlement) and re-reads it each time this screen gains
  // focus, so the number is current after a report was produced. A failed read or no plan leaves `data` undefined or null: no line (v8 draws none).
  // After a failed re-read the query keeps its last data: a failed read draws NO line, so the data is dropped when the query is in error (output review r2).
  const accessToken = useAuthStore((s) => s.accessToken);
  const { data: entitlementData, isError: entitlementFailed, refetch: refetchEntitlement } = useParcelEntitlement();
  const entitlement = entitlementFailed ? null : entitlementData;
  useFocusEffect(
    useCallback(() => {
      if (accessToken) void refetchEntitlement({ cancelRefetch: false });
    }, [accessToken, refetchEntitlement]),
  );

  // The Toronto-only rule (operator ruling 2026-09-16 (b)): an out-of-Toronto address is refused visibly and never sent ('' disables the hook).
  const { data, isFetching, error, refetch } = useParcelSearch(searchQueryArg(debounced));
  // task-452 SEARCHFIX.4: a refused lookup (limit, expired) shows the wall in place of the page once the entitlement read has answered; while the read is
  // pending ('wait') the page shows its loading state (neither the notice nor the miss copy). A failed read shows the wall's error state (round 2,
  // RR-0468); a plain 403 or no plan keep today's notice.
  const { kind: wallKind, wall } = useWallState(error);
  const waiting = wallKind === 'wait';

  const situation = useMemo(
    () => buildSearchSituation({
      input,
      debounced,
      data: waiting ? undefined : data,
      error: waiting ? null : error,
      isFetching: waiting || isFetching,
      schemaDrift: error instanceof ParcelLookupSchemaError,
      recent,
      selectedParcelId,
      cap: SEARCH_CANDIDATE_LIMIT,
      minQueryLen: SEARCH_MIN_QUERY_LEN,
      entitlement: entitlement ? { reportsLeft: entitlement.reportsLeft, reportsLimit: entitlement.reportsLimit, resetsOnDisplay: entitlement.resetsOnDisplay } : null,
    }),
    [input, debounced, data, error, isFetching, recent, selectedParcelId, entitlement, waiting],
  );

  // A search is recorded only when it opens a page (P35-D16 a): the lot, SELECT, the map page. One navigation, one record.
  const navigate = useCallback(
    (route: string) => {
      addRecent(debounced);
      router.push(route);
    },
    [addRecent, debounced, router],
  );

  // `unique` navigates straight to the lot; the map kinds to the map surface. The ref stops the screen bouncing the user forward again when they
  // navigate BACK with the query still in the box; it is cleared the moment the outcome stops being navigable, so retyping navigates again.
  const goBack = useGoBack();
  const navigatedForRef = useRef<string | null>(null);
  const route = situation.route;
  useEffect(() => {
    if (isFetching) return;
    if (!route) {
      navigatedForRef.current = null;
      return;
    }
    if (navigatedForRef.current === route) return;
    navigatedForRef.current = route;
    navigate(route);
  }, [route, isFetching, navigate]);

  const actions = useMemo(
    () => ({
      change_input: (text: string) => setInput(text),
      set_input: (value: string) => setInput(value),
      retry: () => void refetch(),
      select: (parcelId: string) => setSelectedParcelId(parcelId),
      push: (to: string) => navigate(to),
      // The search page renders no back control; the action exists for the shared renderer's action set. Guarded as #64 so it can never strand a cold open.
      back: goBack,
      // MF-46 follow-up (P35-D18 a): "Report incorrect address match" opens Help & Support in the in-app browser sheet (task-362; openBrowserAsync).
      open_help: openHelp,
    }),
    [refetch, navigate, goBack],
  );

  if (wall) return <SurfaceRenderer tree={wall.tree} content={wall.content} data={wall.data} actions={wall.actions} />;
  return (
    <SurfaceRenderer
      tree={searchProps(situation) as SurfaceTree}
      content={SEARCH_SLICE.content}
      data={searchData(situation)}
      actions={actions}
    />
  );
}
