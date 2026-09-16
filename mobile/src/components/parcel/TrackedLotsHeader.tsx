// SPEC LINK: docs/specs/00-architecture/117_maxbld_brand.md §6.1 (Tracked Lots tokens + layout)
//            Surface S-072 `mobile_tracked_lots`
//
// The sticky header and the meta row. Owned by S-072 and rendered nowhere else (R-13).
// It draws NO navigation of its own — the three-tab shelf is S-004's, and the account button here
// is a shortcut INTO that shelf's Account tab, not a second nav.
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Bookmark, SlidersHorizontal, User } from 'lucide-react-native';
import { trackedCountLabel } from '@/lib/trackedLots';
import { TRACKED_LOTS_HEX as C } from '@/constants/parcelSearch';

export function TrackedLotsHeader({
  count,
  jurisdiction,
  manageMode,
  onToggleManage,
  onAccount,
}: {
  count: number;
  jurisdiction: string;
  manageMode: boolean;
  onToggleManage: () => void;
  onAccount: () => void;
}) {
  return (
    <View
      testID="tracked-lots-header"
      style={{
        backgroundColor: C.surface,
        borderBottomWidth: 1,
        borderBottomColor: C.outlineVariant,
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 12,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Bookmark size={18} color={C.primary} fill={C.primary} />
        <Text
          style={{ color: '#f4f4f5', fontSize: 18, fontWeight: '700', flex: 1 }}
          accessibilityRole="header"
        >
          Tracked Lots
        </Text>

        <Pressable
          testID="tracked-lots-manage-toggle"
          onPress={onToggleManage}
          accessibilityRole="button"
          accessibilityState={{ selected: manageMode }}
          accessibilityLabel={manageMode ? 'Done managing tracked lots' : 'Manage tracked lots'}
          style={{
            minHeight: 44,
            paddingHorizontal: 12,
            justifyContent: 'center',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {manageMode ? null : <SlidersHorizontal size={14} color={C.primary} />}
          <Text style={{ color: C.primary, fontSize: 13, fontWeight: '600' }}>
            {manageMode ? 'Done' : 'Manage'}
          </Text>
        </Pressable>

        <Pressable
          testID="tracked-lots-account"
          onPress={onAccount}
          accessibilityRole="button"
          accessibilityLabel="Go to your account"
          style={{ minHeight: 44, width: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <User size={18} color={C.outline} />
        </Pressable>
      </View>

      {/* Meta row — the count, pluralised, and the jurisdiction in mono amber. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 }}>
        <Text testID="tracked-lots-count" style={{ color: '#a1a1aa', fontSize: 12 }}>
          {trackedCountLabel(count)}
        </Text>
        <Text
          testID="tracked-lots-jurisdiction"
          style={{
            color: C.primary,
            fontSize: 11,
            letterSpacing: 1.2,
            fontVariant: ['tabular-nums'],
          }}
          className="font-mono"
        >
          {jurisdiction}
        </Text>
      </View>
    </View>
  );
}
