// SPEC LINK: docs/specs/00-architecture/117_maxbld_brand.md §6.1 (Tracked Lots tokens + layout)
//            docs/specs/02-web-admin/126_maxbld_surface_standard.md §3.1 (LIST item archetype)
//            Surface S-072 `mobile_tracked_lots` — `render.list.item_archetype`
//
// One tracked lot. Owned by S-072 and rendered nowhere else (R-13).
//
// The three figures it shows are NOT equivalent in how much we know about them:
//   Max Build      — parcels.max_buildable_gfa_sqm      (real column)
//   MAX COA BUILD  — parcels.max_newbuild_coa_gfa_sqm   (real column)
//   New Nearby CoA Ruling — DERIVED, and nothing computes it yet. `null` renders "—", never "NO".
// `formatGfa` and `coaRulingLabel` are what enforce that; see mobile/src/lib/trackedLots.ts.
import React, { useCallback } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Gavel, Trash2, ChevronRight } from 'lucide-react-native';
import {
  coaRulingIsPositive,
  coaRulingLabel,
  formatGfa,
  type TrackedLot,
} from '@/lib/trackedLots';
import { TRACKED_LOTS_HEX as C } from '@/constants/parcelSearch';

export function TrackedLotRow({
  lot,
  manageMode,
  onOpen,
  onRemove,
}: {
  lot: TrackedLot;
  manageMode: boolean;
  onOpen: (parcelId: string) => void;
  onRemove: (parcelId: string) => void;
}) {
  const open = useCallback(() => onOpen(lot.parcelId), [onOpen, lot.parcelId]);
  const remove = useCallback(() => onRemove(lot.parcelId), [onRemove, lot.parcelId]);

  const ruling = coaRulingLabel(lot.newNearbyCoaRuling);
  const rulingPositive = coaRulingIsPositive(lot.newNearbyCoaRuling);

  return (
    <View
      testID={`tracked-lot-${lot.parcelId}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: C.containerLow,
        borderWidth: 1,
        borderColor: C.outlineVariant,
        borderRadius: 14,
        marginBottom: 10,
      }}
    >
      <Pressable
        testID={`tracked-lot-open-${lot.parcelId}`}
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={`Open the lot report for ${lot.address}`}
        style={{ flex: 1, paddingHorizontal: 14, paddingVertical: 14, minHeight: 44 }}
      >
        <Text style={{ color: '#f4f4f5', fontSize: 16, fontWeight: '600' }} numberOfLines={1}>
          {lot.address}
        </Text>

        <Text style={{ color: '#a1a1aa', fontSize: 12, marginTop: 6, fontVariant: ['tabular-nums'] }}>
          Max Build: {formatGfa(lot.maxBuildGfaSqm)}
        </Text>

        <Text
          style={{
            color: C.primary,
            fontSize: 12,
            marginTop: 2,
            letterSpacing: 0.6,
            fontVariant: ['tabular-nums'],
          }}
        >
          MAX COA BUILD: {formatGfa(lot.maxCoaBuildGfaSqm)}
        </Text>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
          <Gavel size={12} color={rulingPositive ? C.tertiary : C.outline} />
          <Text style={{ color: '#a1a1aa', fontSize: 11 }}>New Nearby CoA Ruling:</Text>
          <View
            testID={`tracked-lot-ruling-${lot.parcelId}`}
            style={{
              paddingHorizontal: 8,
              paddingVertical: 2,
              borderRadius: 999,
              backgroundColor: rulingPositive ? 'rgba(86,229,169,0.14)' : C.containerHigh,
              borderWidth: 1,
              borderColor: rulingPositive ? C.tertiary : C.outlineVariant,
            }}
          >
            <Text
              style={{
                color: rulingPositive ? C.tertiary : '#a1a1aa',
                fontSize: 11,
                fontWeight: '600',
              }}
            >
              {ruling}
            </Text>
          </View>
        </View>
      </Pressable>

      {manageMode ? (
        <Pressable
          testID={`tracked-lot-remove-${lot.parcelId}`}
          onPress={remove}
          accessibilityRole="button"
          accessibilityLabel={`Stop tracking ${lot.address}`}
          style={{
            width: 56,
            alignSelf: 'stretch',
            minHeight: 44,
            alignItems: 'center',
            justifyContent: 'center',
            borderLeftWidth: 1,
            borderLeftColor: C.outlineVariant,
          }}
        >
          <Trash2 size={18} color={C.error} />
        </Pressable>
      ) : (
        <View style={{ paddingRight: 12 }} accessibilityElementsHidden importantForAccessibility="no">
          <ChevronRight size={18} color={C.outline} />
        </View>
      )}
    </View>
  );
}
