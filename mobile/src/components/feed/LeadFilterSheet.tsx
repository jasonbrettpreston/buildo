// SPEC LINK: docs/specs/03-mobile/91_mobile_lead_feed.md §4.2 Filter Sheet
// Bottom sheet filter UI. Uses @gorhom/bottom-sheet with snap points ['50%','85%'].
// Presents radius slider and trade selector. Calls filterStore setters on Apply.
import React, { useCallback, useRef } from 'react';
import { View, Text, Pressable } from 'react-native';
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import { useFilterStore } from '@/store/filterStore';
import { CONTRACTS } from '@/constants/contracts';

const SNAP_POINTS = ['50%', '85%'];

const RADIUS_OPTIONS = [2, 5, 10, 20, 50];

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function LeadFilterSheet({ visible, onClose }: Props) {
  const sheetRef = useRef<BottomSheet>(null);
  const radiusKm = useFilterStore((s) => s.radiusKm);
  const setRadiusKm = useFilterStore((s) => s.setRadiusKm);

  const handleClose = useCallback(() => {
    sheetRef.current?.close();
    onClose();
  }, [onClose]);

  if (!visible) return null;

  return (
    <BottomSheet
      ref={sheetRef}
      index={0}
      snapPoints={SNAP_POINTS}
      onClose={handleClose}
      enablePanDownToClose
      backgroundStyle={{ backgroundColor: '#18181b' }}
      handleIndicatorStyle={{ backgroundColor: '#3f3f46' }}
    >
      <BottomSheetView className="flex-1 px-4 pt-2 pb-8">
        {/* Header */}
        <View className="flex-row items-center justify-between mb-6">
          <Text className="font-mono text-xs text-zinc-400 uppercase tracking-widest">
            Filters
          </Text>
          <Pressable
            onPress={handleClose}
            hitSlop={{ top: 14, bottom: 14, left: 20, right: 20 }}
            style={{ minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' }}
            accessibilityRole="button"
            accessibilityLabel="Close filters"
          >
            <Text className="font-mono text-xs text-amber-400">Done</Text>
          </Pressable>
        </View>

        {/* Radius */}
        <Text className="text-zinc-400 text-xs font-mono uppercase tracking-wider mb-3">
          Radius
        </Text>
        <View className="flex-row gap-2 flex-wrap mb-6">
          {RADIUS_OPTIONS.map((km) => (
            <Pressable
              key={km}
              onPress={() => setRadiusKm(km)}
              style={{ minHeight: 44, justifyContent: 'center' }}
              className={[
                'rounded-lg px-4 border',
                radiusKm === km
                  ? 'bg-amber-500 border-amber-500'
                  : 'bg-zinc-800 border-zinc-700',
              ].join(' ')}
            >
              <Text
                className={[
                  'font-mono text-xs',
                  radiusKm === km ? 'text-zinc-950 font-bold' : 'text-zinc-300',
                ].join(' ')}
              >
                {km <= CONTRACTS.geo.default_radius_km ? `${km} km` : `${km} km`}
              </Text>
            </Pressable>
          ))}
        </View>
      </BottomSheetView>
    </BottomSheet>
  );
}
