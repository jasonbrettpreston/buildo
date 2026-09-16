// SPEC LINK: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §4 (screens)
//            docs/specs/02-web-admin/126_maxbld_surface_standard.md §3.1 (LIST archetype)
//            docs/specs/00-architecture/116_multi_product_architecture.md (OD5 — MaxBLD is its own
//            product; no reuse of the lead-gen save machinery)
//            docs/specs/00-architecture/117_maxbld_brand.md §6.1 (Tracked Lots tokens + layout)
//
// Surface S-072 `mobile_tracked_lots` — the Tracked Lots tab of the S-004 product shell.
//
// ARCHETYPE: LIST, not REPORT. A REPORT's schema profile FORCES `outputs.answer` and
// `state.answer` to "none" (surface.schema.json, the REPORT x-profile), and this screen removes
// rows — a write — and holds manage-mode/undo state. It is a scrollable collection with a
// per-item archetype, which is what LIST is for. Recorded in the descriptor.
//
// DATA: `/api/parcels/tracked` and the `user_tracked_lots` table DO NOT EXIST YET. Both are
// declared in contract C-039 and filed as the Backend follow-up. `useTrackedLots` is a
// fixture-backed stub, and this screen SAYS SO on the surface — preview rows are never passed off
// as the user's own tracked lots.
//
// The shelf (Lookup · Tracked Lots · Account) is drawn by S-004; this screen renders no second nav.
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, Pressable, FlatList, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Bookmark, AlertTriangle } from 'lucide-react-native';
import { TrackedLotsHeader } from '@/components/parcel/TrackedLotsHeader';
import { TrackedLotRow } from '@/components/parcel/TrackedLotRow';
import { useTrackedLots, useUntrackLot } from '@/hooks/useTrackedLots';
import {
  commitRemoval,
  initialView,
  removalToastLabel,
  removeLot,
  setManageMode,
  trackedLotRoute,
  undoRemoval,
  type TrackedLot,
  type TrackedLotsView,
} from '@/lib/trackedLots';
import { PARCEL_TAB_ROUTE } from '@/lib/parcelSearchMatch';
import { PARCEL_SHELF_HEIGHT, TRACKED_LOTS_HEX as C } from '@/constants/parcelSearch';

const DEFAULT_JURISDICTION = 'TORONTO, ON';

export default function TrackedLotsScreen() {
  const router = useRouter();
  const { data, isLoading, error, isStub } = useTrackedLots();
  const { untrack } = useUntrackLot();

  const [manageMode, setManage] = useState(false);
  // Server rows are the baseline; `view` carries the optimistic removals on top of them.
  const [override, setOverride] = useState<TrackedLotsView | null>(null);

  const view: TrackedLotsView = useMemo(
    () => override ?? initialView(data?.lots ?? []),
    [override, data],
  );

  const jurisdiction = view.lots[0]?.jurisdiction ?? DEFAULT_JURISDICTION;

  const onOpen = useCallback(
    (parcelId: string) => router.push(trackedLotRoute(parcelId)),
    [router],
  );

  const onRemove = useCallback(
    (parcelId: string) => {
      setOverride((prev) => {
        const base = prev ?? initialView(data?.lots ?? []);
        // A second removal commits the first — one toast, one undoable action.
        if (base.pending) void untrack(base.pending.lot.parcelId);
        return removeLot(base, parcelId);
      });
    },
    [data, untrack],
  );

  const onUndo = useCallback(() => setOverride((prev) => (prev ? undoRemoval(prev) : prev)), []);

  const onDismissToast = useCallback(() => {
    setOverride((prev) => {
      if (!prev?.pending) return prev;
      // Dismissing the toast is what makes the removal final, so this is where the DELETE fires.
      void untrack(prev.pending.lot.parcelId);
      return commitRemoval(prev);
    });
  }, [untrack]);

  const onToggleManage = useCallback(() => {
    const nextManageMode = !manageMode;
    setOverride((prev) => {
      const base = prev ?? initialView(data?.lots ?? []);
      // "Done" means done: leaving manage mode commits anything still undoable.
      if (!nextManageMode && base.pending) void untrack(base.pending.lot.parcelId);
      return setManageMode(base, nextManageMode).view;
    });
    setManage(nextManageMode);
  }, [manageMode, data, untrack]);

  const onAccount = useCallback(() => router.push(PARCEL_TAB_ROUTE.account), [router]);

  const renderItem = useCallback(
    ({ item }: { item: TrackedLot }) => (
      <TrackedLotRow lot={item} manageMode={manageMode} onOpen={onOpen} onRemove={onRemove} />
    ),
    [manageMode, onOpen, onRemove],
  );

  const keyExtractor = useCallback((item: TrackedLot) => item.parcelId, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.surface }} edges={['top']}>
      <TrackedLotsHeader
        count={view.lots.length}
        jurisdiction={jurisdiction}
        manageMode={manageMode}
        onToggleManage={onToggleManage}
        onAccount={onAccount}
      />

      {isStub ? (
        <Text
          testID="tracked-lots-stub-notice"
          style={{
            color: C.outline,
            fontSize: 11,
            paddingHorizontal: 16,
            paddingTop: 10,
          }}
        >
          Preview data — tracking isn&apos;t connected yet, so these aren&apos;t your saved lots.
        </Text>
      ) : null}

      {isLoading ? (
        <View style={{ paddingTop: 48, alignItems: 'center' }}>
          <ActivityIndicator size="small" color={C.primary} accessibilityLabel="Loading your tracked lots" />
        </View>
      ) : error ? (
        <View testID="tracked-lots-error" style={{ paddingHorizontal: 16, paddingTop: 40, alignItems: 'center' }}>
          <AlertTriangle size={22} color={C.error} />
          <Text style={{ color: C.error, fontSize: 13, textAlign: 'center', marginTop: 10 }}>
            We couldn&apos;t load your tracked lots.
          </Text>
          <Text style={{ color: '#71717a', fontSize: 12, textAlign: 'center', marginTop: 6 }}>
            Check your connection and pull to refresh.
          </Text>
        </View>
      ) : view.lots.length === 0 ? (
        <View testID="tracked-lots-empty" style={{ paddingHorizontal: 24, paddingTop: 72, alignItems: 'center' }}>
          <Bookmark size={26} color={C.outline} />
          <Text style={{ color: '#a1a1aa', fontSize: 14, textAlign: 'center', marginTop: 12 }}>
            You haven&apos;t tracked any lots yet.
          </Text>
          <Text style={{ color: '#71717a', fontSize: 12, textAlign: 'center', marginTop: 6, lineHeight: 18 }}>
            Look up an address and track it to keep an eye on what can be built there.
          </Text>
        </View>
      ) : (
        <FlatList
          testID="tracked-lots-list"
          data={view.lots}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: PARCEL_SHELF_HEIGHT + 32,
          }}
        />
      )}

      {/* Undo toast — the removal is reversible until this is dismissed. */}
      {view.pending ? (
        <View
          testID="tracked-lots-undo-toast"
          style={{
            position: 'absolute',
            left: 16,
            right: 16,
            bottom: PARCEL_SHELF_HEIGHT + 16,
            backgroundColor: C.containerHigh,
            borderWidth: 1,
            borderColor: C.outlineVariant,
            borderRadius: 12,
            paddingHorizontal: 14,
            paddingVertical: 12,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <Text style={{ color: '#f4f4f5', fontSize: 13, flex: 1 }} numberOfLines={1}>
            {removalToastLabel(view.pending.lot)}
          </Text>
          <Pressable
            testID="tracked-lots-undo"
            onPress={onUndo}
            accessibilityRole="button"
            accessibilityLabel={`Undo removing ${view.pending.lot.address}`}
            style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 }}
          >
            <Text style={{ color: C.primary, fontSize: 13, fontWeight: '700' }}>UNDO</Text>
          </Pressable>
          <Pressable
            testID="tracked-lots-undo-dismiss"
            onPress={onDismissToast}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
            style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 }}
          >
            <Text style={{ color: '#a1a1aa', fontSize: 13 }}>Dismiss</Text>
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}
