// SPEC LINK: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §2.6, §3.2 and §4 (dated note 2026-11-11, MF-53)
//            docs/specs/02-web-admin/126_maxbld_surface_standard.md §3.1 (LIST archetype; a map is a `render.projection`), §11b (a page =
//            descriptor + content + library), §11b.7 A3 (dated note 2026-11-11)
//            docs/specs/03-mobile/99_mobile_state_architecture.md §4 (query keys), §6.5 (a redirect fires on the first settled data only)
//
// Surface S-071 `mobile_parcel_disambiguation_map` — the "choose your lot" page and its message states (MF-53; operator 2026-11-11:
// "\"choose your lot\" and \"address issues\" screens should be built now"). The mount file of a converted surface: hooks, the redirect
// effect and the callbacks only; everything it shows comes from the binding (LotMapBinding.tsx: the props tree; SurfaceRenderer.tsx: the
// parts) and the content file. It reads the SAME lookup query the search page filled (['parcel-search', q]), so the normal flow makes no
// extra request. Nothing is selected at open; the chosen lot opens through the one report route helper (lotMap.ts). The query is never
// logged or tracked, and picking a lot does not add a recent search (P35-D16 a: the search page recorded it when it opened this page).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SurfaceRenderer, type SurfaceTree } from '@/components/surfaces/SurfaceRenderer';
import { LOT_MAP_SLICE, lotMapData, lotMapProps } from '@/components/surfaces/LotMapBinding';
import { useParcelSearch, ParcelLookupSchemaError } from '@/hooks/useParcelLookup';
import { buildLotMapSituation } from '@/lib/lotMap';
import { searchQueryArg } from '@/lib/parcelSearchMatch';

export default function ParcelDisambiguationScreen() {
  const router = useRouter();
  const { q } = useLocalSearchParams<{ q?: string }>();
  const query = typeof q === 'string' ? q : '';
  const [selectedParcelId, setSelectedParcelId] = useState<string | null>(null);
  const { data, isFetching, error, refetch } = useParcelSearch(searchQueryArg(query));

  const situation = useMemo(
    () => buildLotMapSituation({ query, data, error, isFetching, schemaDrift: error instanceof ParcelLookupSchemaError, selectedParcelId }),
    [query, data, error, isFetching, selectedParcelId],
  );

  // The redirect state (the fetched outcome is not a map kind) replaces this page once, on settled data, never on a background refetch.
  const redirectedRef = useRef(false);
  const target = situation.navigate;
  useEffect(() => {
    if (isFetching || target === null || redirectedRef.current) return;
    redirectedRef.current = true;
    router.replace(target);
  }, [target, isFetching, router]);

  const push = useCallback((route: string) => router.push(route), [router]);
  const actions = useMemo(
    () => ({
      change_input: () => undefined,
      set_input: () => undefined,
      retry: () => void refetch(),
      select: (parcelId: string) => setSelectedParcelId(parcelId),
      push,
      open_account: () => undefined,
      back: () => router.back(),
    }),
    [refetch, push, router],
  );

  return (
    <SurfaceRenderer tree={lotMapProps(situation) as SurfaceTree} content={LOT_MAP_SLICE.content} data={lotMapData(situation)} actions={actions} />
  );
}
