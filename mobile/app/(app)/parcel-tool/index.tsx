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
import { useRouter } from 'expo-router';
import { SurfaceRenderer, type SurfaceTree } from '@/components/surfaces/SurfaceRenderer';
import {
  SEARCH_CANDIDATE_LIMIT,
  SEARCH_DEBOUNCE_MS,
  SEARCH_MIN_QUERY_LEN,
  SEARCH_SLICE,
  searchData,
  searchProps,
} from '@/components/surfaces/SearchBinding';
import { useParcelSearch, ParcelLookupSchemaError } from '@/hooks/useParcelLookup';
import { buildSearchSituation, PARCEL_TAB_ROUTE, searchQueryArg } from '@/lib/parcelSearchMatch';
import { useRecentSearchesStore } from '@/store/recentSearchesStore';

export default function ParcelSearchScreen() {
  const router = useRouter();
  const [input, setInput] = useState('');
  const [debounced, setDebounced] = useState('');
  const [selectedParcelId, setSelectedParcelId] = useState<string | null>(null);
  const recent = useRecentSearchesStore((s) => s.recent);
  const addRecent = useRecentSearchesStore((s) => s.add);

  // Debounce (config.debounce_ms) so typeahead exploration does not burn the 60/min rate bucket.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(input), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [input]);

  // The Toronto-only rule (operator ruling 2026-09-16 (b)): an out-of-Toronto address is refused visibly and never sent ('' disables the hook).
  const { data, isFetching, error, refetch } = useParcelSearch(searchQueryArg(debounced));

  const situation = useMemo(
    () => buildSearchSituation({
      input,
      debounced,
      data,
      error,
      isFetching,
      schemaDrift: error instanceof ParcelLookupSchemaError,
      recent,
      selectedParcelId,
      cap: SEARCH_CANDIDATE_LIMIT,
      minQueryLen: SEARCH_MIN_QUERY_LEN,
    }),
    [input, debounced, data, error, isFetching, recent, selectedParcelId],
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
      open_account: () => router.push(PARCEL_TAB_ROUTE.account),
    }),
    [refetch, navigate, router],
  );

  return (
    <SurfaceRenderer
      tree={searchProps(situation) as SurfaceTree}
      content={SEARCH_SLICE.content}
      data={searchData(situation)}
      actions={actions}
    />
  );
}
