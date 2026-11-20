// SPEC LINK: docs/specs/03-mobile/99_mobile_state_architecture.md §6.5 (a redirect fires once, on the first settled data, never on a background refetch)
//            docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §4 (the parcel-tool pages) and its dated note 2026-11-10 (the search debounce)
//            docs/specs/02-web-admin/126_maxbld_surface_standard.md §11b (a mount holds hooks and callbacks; shared behaviour lives in @/hooks)
//
// STD.HOOKS (task-381): the three mount concerns the parcel-tool pages used to copy (redirect once on settled data, go back, debounced value). A mount may
// import only @/hooks/ (FE-31 C-2), so they live here. This is its own file, not useParcelLookup.ts: five page tests replace that whole module with a mock.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { PARCEL_TAB_ROUTE } from '@/lib/parcelSearchMatch';

/**
 * Redirect once, on settled data. Replaces this page with `target` the first time the fetch is not running and a target exists; a background refetch, or a
 * later change of target, never fires it again (Spec 99 section 6.5). Returns `markRedirected`: the semi question page calls it before its own replace.
 */
export function useSettledRedirect(target: string | null, isFetching: boolean): () => void {
  const router = useRouter();
  const redirectedRef = useRef(false);
  useEffect(() => {
    if (isFetching || target === null || redirectedRef.current) return;
    redirectedRef.current = true;
    router.replace(target);
  }, [target, isFetching, router]);
  return useCallback(() => { redirectedRef.current = true; }, []);
}

/** NAV-AUDIT-20261111 #64: back when there is history; a cold open (deep link) replaces with the Lookup route so it can never strand the user. */
export function useGoBack(): () => void {
  const router = useRouter();
  return useCallback(() => (router.canGoBack() ? router.back() : router.replace(PARCEL_TAB_ROUTE.lookup)), [router]);
}

/** The value after `ms` of no change (the search page's config.debounce_ms, so typeahead does not burn the rate bucket). Starts at the first value. */
export function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}
