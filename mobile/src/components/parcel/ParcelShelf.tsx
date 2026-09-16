// SPEC LINK: docs/specs/00-architecture/116_multi_product_architecture.md (OD5 — MaxBLD is its own
//            product; the parcel product shows no lead-gen navigation)
//            docs/specs/00-architecture/117_maxbld_brand.md §6.1 (tokens, 44px targets)
//            docs/specs/02-web-admin/126_maxbld_surface_standard.md §3.1 (SHELL archetype)
//
// The MaxBLD product shelf — the ONLY navigation a MaxBLD user sees: Lookup · Tracked Lots ·
// Account (operator ruling 2026-09-16 (c)). Owned by surface S-004 `shell_parcel_tool_stack`,
// which is the only thing that renders it (`identity.owns.components`, R-13).
//
// The five-tab lead-gen bar (S-046 `shell_app_tabs`) is hidden for every parcel-tool route — see
// `shouldHideAppTabBar` in mobile/src/lib/appShell.ts and the note in parcel-tool/_layout.tsx for
// why it is hidden rather than escaped.
//
// ICONS: the shelf was specified with @expo/vector-icons Ionicons (compass / bookmark-outline /
// person-outline). That package is not a declared dependency of mobile/ and has zero usages here;
// `lucide-react-native` is the established icon layer. Compass / Bookmark / User are its
// equivalents, and the active tab's icon is filled rather than outlined.
import React, { useCallback } from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Compass, Bookmark, User } from 'lucide-react-native';
import { PARCEL_TABS, PARCEL_TAB_LABEL, type ParcelTab } from '@/lib/parcelSearchMatch';
import {
  PARCEL_SEARCH_HEX,
  PARCEL_SHELF_HEIGHT,
  PARCEL_SHELF_HEX,
  PARCEL_SHELF_MIN_BOTTOM_PAD,
} from '@/constants/parcelSearch';

const TAB_ICON = { lookup: Compass, tracked: Bookmark, account: User } as const;

const ANDROID_RIPPLE = { color: 'rgba(245,158,11,0.12)', borderless: false } as const;

function ShelfTab({
  tab,
  active,
  onPress,
}: {
  tab: ParcelTab;
  active: boolean;
  onPress: (tab: ParcelTab) => void;
}) {
  const Icon = TAB_ICON[tab];
  const color = active ? PARCEL_SEARCH_HEX.primary : PARCEL_SHELF_HEX.inactive;
  const press = useCallback(() => onPress(tab), [onPress, tab]);
  return (
    <Pressable
      testID={`parcel-shelf-tab-${tab}`}
      onPress={press}
      android_ripple={Platform.OS === 'android' ? ANDROID_RIPPLE : undefined}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      // Spelled out rather than left to the role: the ruling asks for it verbatim, and screen
      // readers announce a custom label more reliably than a role + state pair.
      accessibilityLabel={`${PARCEL_TAB_LABEL[tab]} tab${active ? ', active' : ''}`}
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 44, gap: 4 }}
    >
      <Icon size={22} color={color} fill={active ? PARCEL_SEARCH_HEX.primary : 'transparent'} />
      <Text style={{ color, fontSize: 11, fontWeight: active ? '600' : '400' }}>
        {PARCEL_TAB_LABEL[tab]}
      </Text>
    </Pressable>
  );
}

/**
 * The persistent three-tab shelf. `active` is passed in already DERIVED FROM THE ROUTE by S-004 —
 * this component holds no navigation state of its own, so the highlight cannot drift out of step
 * with where the user actually is.
 */
export function ParcelShelf({
  active,
  onSelect,
}: {
  active: ParcelTab;
  onSelect: (tab: ParcelTab) => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      testID="parcel-shelf"
      accessibilityRole="tablist"
      style={{
        backgroundColor: PARCEL_SHELF_HEX.shelf,
        borderTopWidth: 1,
        borderTopColor: PARCEL_SHELF_HEX.border,
        paddingBottom: Math.max(PARCEL_SHELF_MIN_BOTTOM_PAD, insets.bottom),
      }}
    >
      <View style={{ height: PARCEL_SHELF_HEIGHT, flexDirection: 'row', alignItems: 'center' }}>
        {PARCEL_TABS.map((tab) => (
          <ShelfTab key={tab} tab={tab} active={tab === active} onPress={onSelect} />
        ))}
      </View>
    </View>
  );
}
