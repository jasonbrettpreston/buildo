// SPEC LINK: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §4 (screens)
//            docs/specs/00-architecture/116_multi_product_architecture.md (OD5 — MaxBLD is its own
//            product; no lead-gen concepts in scope A)
//            docs/specs/00-architecture/117_maxbld_brand.md §6.1 (tokens)
//
// Surface S-073 `mobile_parcel_account` — PLACEHOLDER.
//
// The Account tab of the S-004 product shelf (operator ruling 2026-09-16 (c)). The census was
// checked for something to reuse: S-036 `mobile_settings` (mobile/app/(app)/settings.tsx) is the
// only account-shaped mobile surface, and it is a LEAD-GEN screen — it sits in the five-tab shell,
// and its content is trade selection, lead notification preferences and the lead-gen subscription.
// Reusing it would import lead-gen concepts straight into scope A, which OD5 forbids, so MaxBLD
// gets its own Account surface rather than a shared one.
//
// Deliberately shows NOTHING about the account yet. The entitlement this product actually runs on
// today is the lead-gen one (`chk_entitlements_product` admits only `lead_gen` and
// `flight_center`) — see S-002's `programme.leakage`. Rendering a subscription state here before
// MaxBLD has its own entitlement would be showing the user a lead-gen fact about themselves.
import React from 'react';
import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { User } from 'lucide-react-native';
import {
  PARCEL_SEARCH_HEX,
  PARCEL_SEARCH_TOKENS as T,
  PARCEL_SHELF_HEIGHT,
  SEARCH_MAX_WIDTH,
} from '@/constants/parcelSearch';

export default function ParcelAccountScreen() {
  return (
    <SafeAreaView className={`flex-1 ${T.screenBg}`} edges={['top']}>
      <View
        className="w-full self-center px-4 flex-1"
        style={{ maxWidth: SEARCH_MAX_WIDTH, paddingBottom: PARCEL_SHELF_HEIGHT }}
      >
        <Text className="text-zinc-100 text-xl font-bold mt-6" accessibilityRole="header">
          Account
        </Text>

        <View className="items-center mt-24" testID="parcel-account-empty">
          <User size={26} color={PARCEL_SEARCH_HEX.textMuted} />
          <Text className={`text-center mt-3 ${T.textSecondary}`}>
            Your MaxBLD account settings will live here.
          </Text>
          <Text className="text-zinc-500 text-xs text-center mt-2 leading-5">
            Nothing to manage yet.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
