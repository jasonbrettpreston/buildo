// SPEC LINK: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §2.6 (ambiguity is a 200 result,
//            not an error), §4 (screens)
//            docs/specs/02-web-admin/126_maxbld_surface_standard.md §3.1 (LIST archetype; a map is
//            a `render.projection`, NOT an archetype)
//            docs/specs/00-architecture/117_maxbld_brand.md §6.1
//
// Surface S-071 `mobile_parcel_disambiguation_map` — STUB.
//
// The operator's 2026-09-16 ruling gives this surface three jobs:
//   multi_parcel  — draw every parcel polygon linked to the address, tappable, with the address
//                   pin and one line of lot facts per polygon (frontage, area, zoning class)
//   unlinked      — the pin, surrounding parcels drawn faintly and tappable, and a VISIBLE
//                   "no lot is linked to this address" state. NEVER a silent nearest-polygon pick
//   intersection  — the corner lots highlighted, no list
//
// WHY THIS IS A STUB, measured rather than assumed:
//   1. No parcel-polygon map component exists to reuse. `grep -rn "Polygon" mobile/src mobile/app`
//      returns nothing; `LeadMapPane.tsx` renders `Marker` circles only.
//   2. The contract carries no geometry. `ConsumerParcelSchema` (src/app/api/parcels/lookup/
//      types.ts) is `.strict()` over costMenu + areas + neighbourhood — there is no polygon, no
//      centroid and no address-point id in the response, so there is nothing to draw.
//   3. Ruling §3: `src/app/api/**` is not changed in this pass.
//
// So this route exists to make the navigation real and the gap VISIBLE, rather than leaving the
// three map outcomes silently dead-ending on the search screen. It is the next surface to build.
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Map as MapIcon, ChevronLeft } from 'lucide-react-native';
import { PARCEL_SEARCH_HEX, PARCEL_SEARCH_TOKENS as T, SEARCH_MAX_WIDTH } from '@/constants/parcelSearch';
import { isParcelMatchType, type ParcelMatchType } from '@/lib/parcelSearchMatch';

const COPY: Record<ParcelMatchType, string> = {
  unique: 'This address resolves to a single lot.',
  text_candidates: 'Several addresses matched what you typed.',
  multi_parcel: 'This address is linked to more than one lot — a corner, severed or ranged property.',
  unlinked: 'We found this address, but no lot is linked to it.',
  intersection: 'That looks like an intersection rather than a street address.',
};

export default function ParcelDisambiguationScreen() {
  const router = useRouter();
  const { q, kind } = useLocalSearchParams<{ q?: string; kind?: string }>();
  const query = typeof q === 'string' ? q : '';
  // Narrowed with the SAME guard the search surface derives with — never a second copy.
  const matchType: ParcelMatchType | null = isParcelMatchType(kind) ? kind : null;

  return (
    <SafeAreaView className={`flex-1 ${T.screenBg}`} edges={['top']}>
      <View className="w-full self-center px-4 flex-1" style={{ maxWidth: SEARCH_MAX_WIDTH }}>
        <Pressable
          testID="parcel-disambiguate-back"
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back to search"
          className="flex-row items-center gap-1 mt-2"
          style={{ minHeight: 44 }}
        >
          <ChevronLeft size={20} color={PARCEL_SEARCH_HEX.textSecondary} />
          <Text className={`text-sm ${T.textSecondary}`}>Search</Text>
        </Pressable>

        <View className="items-center mt-16" testID="parcel-disambiguate-stub">
          <MapIcon size={28} color={PARCEL_SEARCH_HEX.primary} />
          <Text className="text-zinc-100 text-base text-center mt-3" accessibilityRole="header">
            {matchType ? COPY[matchType] : 'We need to narrow this address down.'}
          </Text>
          {query ? (
            <Text className={`font-mono text-xs mt-2 ${T.textSecondary}`} testID="parcel-disambiguate-query">
              {query}
            </Text>
          ) : null}
          <Text className="text-zinc-500 text-xs text-center mt-6 leading-5">
            The map view that shows you each lot is the next thing we&apos;re building. Until it
            lands, try searching with a house number.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
