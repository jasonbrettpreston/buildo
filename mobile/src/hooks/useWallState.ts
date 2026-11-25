// SPEC LINK: docs/specs/03-mobile/99_mobile_state_architecture.md §4 (query keys: the existing B1 entitlement key, no new store, field or bridge), §6.5 (gate
//            conditions are stable signals); docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-51 (a tab switch is router.navigate).
//
// task-452 SEARCHFIX.4 · the wall of a refused lookup, shared by the search page (mobile/app/(app)/parcel-tool/index.tsx) and the report route
// ([parcelId].tsx, through ReportPageHost's `wall` prop). Both call it unconditionally at the top with their lookup error. It reads the entitlement read
// (useParcelEntitlement; the same query key the search page reads, so one fetch), decides the wall with searchWall and returns its kind with the tree,
// content, data and actions the shared renderer needs. Go to Tracked Lots switches tab with router.navigate (never the search page's own push, which
// records a recent search). The rows name no other action, so the rest are no-ops (the semi host's pattern). The server 403 is the gate; the read only
// picks the words (Spec 99: a display, never a gate).
import { useMemo } from 'react';
import { useRouter } from 'expo-router';
import type { SurfaceActions, SurfaceTree } from '@/components/surfaces/SurfaceRenderer';
import { WALL_SLICE, wallData, wallProps, type WallBindingData } from '@/components/surfaces/WallBinding';
import { useParcelEntitlement } from '@/hooks/useParcelLookup';
import { searchWall, type WallKind } from '@/lib/parcelSearchMatch';

/** What a host draws in place of its page: the wall's tree, its own content, its data and its actions. */
export type WallView = { tree: SurfaceTree; content: Record<string, string>; data: WallBindingData; actions: SurfaceActions };
export type WallState = { kind: WallKind | 'wait' | null; wall: WallView | null };

const NOOP = (): void => undefined;

export function useWallState(error: unknown): WallState {
  const router = useRouter();
  const { data, isFetching, isError } = useParcelEntitlement();
  const kind = searchWall(error, { data, isFetching, isError });
  const actions = useMemo<SurfaceActions>(
    () => ({ change_input: NOOP, set_input: NOOP, retry: NOOP, select: NOOP, back: NOOP, push: (route: string) => router.navigate(route) }),
    [router],
  );
  const reportsLimit = data?.reportsLimit ?? null;
  const resetsOnDisplay = data?.resetsOnDisplay ?? null;
  const wall = useMemo<WallView | null>(() => {
    if (kind !== 'limit' && kind !== 'reactivate' && kind !== 'error') return null;
    const s = { kind, reportsLimit, resetsOnDisplay };
    return { tree: wallProps(s) as SurfaceTree, content: WALL_SLICE.content, data: wallData(s), actions };
  }, [kind, reportsLimit, resetsOnDisplay, actions]);
  return { kind, wall };
}
