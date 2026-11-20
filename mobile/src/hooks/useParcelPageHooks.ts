// SPEC LINK: docs/specs/03-mobile/99_mobile_state_architecture.md §6.5 ("Gate conditions MUST be stable signals": the redirect waits on isFetching being false and fires once, so a refetch toggling isFetching cannot repeat it)
//            docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §4 (the parcel-tool pages) and its dated note 2026-11-10 (the search debounce)
//            scripts/surfaces/_schema/bindings.json (mount_internal lists "@/hooks/"; a converted surface's mount file "may import only a framework package (framework[]), a binding module or a project-internal path (mount_internal[]")
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-31 ("Every MaxBLD page (a converted non-REPORT surface) is descriptor + content + standard library components configured by schema")
//
// STD.HOOKS (task-381): the three mount concerns the parcel-tool pages used to copy (redirect once on settled data, go back, debounced value). A mount may
// import only framework, binding and mount_internal paths (bindings.json), so they live here. This is its own file, not useParcelLookup.ts: five page tests replace that whole module with a mock.
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
