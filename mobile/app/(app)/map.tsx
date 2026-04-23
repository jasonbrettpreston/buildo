// SPEC LINK: docs/specs/03-mobile/91_mobile_lead_feed.md §4.2 LeadMapPane
// Map pane — full-screen react-native-maps with phase-colored circle markers.
// Tab bar always visible on Map screen (no hide-on-scroll here).
import React, { useState, useCallback } from 'react';
import { View, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Region } from 'react-native-maps';
import { useRouter } from 'expo-router';
import { useLeadFeed } from '@/hooks/useLeadFeed';
import { useLocation } from '@/hooks/useLocation';
import { useFilterStore } from '@/store/filterStore';
import { useAuthStore } from '@/store/authStore';
import { LeadMapPane } from '@/components/feed/LeadMapPane';
import { LeadFilterSheet } from '@/components/feed/LeadFilterSheet';
import { OfflineBanner } from '@/components/shared/OfflineBanner';
import { lightImpact } from '@/lib/haptics';
import type { PermitLeadFeedItem } from '@/lib/schemas';

// Default to central Toronto when location is not yet available
const TORONTO_DEFAULT_REGION: Region = {
  latitude: 43.6532,
  longitude: -79.3832,
  latitudeDelta: 0.15,
  longitudeDelta: 0.15,
};

export default function MapScreen() {
  const router = useRouter();
  const { coords } = useLocation();
  const { radiusKm, tradeSlug } = useFilterStore();
  // Gate on idToken so the feed query doesn't fire before Firebase Auth resolves
  // on cold boot (matches the pattern in app/(app)/index.tsx).
  const idToken = useAuthStore((s) => s.idToken);
  const [filterOpen, setFilterOpen] = useState(false);

  const feedParams =
    coords && tradeSlug && idToken
      ? { lat: coords.lat, lng: coords.lng, tradeSlug, radiusKm }
      : null;

  const { data } = useLeadFeed(feedParams);

  // Flatten all pages and keep only permit leads with valid coordinates
  const allPermits = (data?.pages.flatMap((p) => p.data) ?? []).filter(
    (item): item is PermitLeadFeedItem =>
      item.lead_type === 'permit' &&
      item.latitude !== null &&
      item.longitude !== null,
  );

  const initialRegion: Region = coords
    ? {
        latitude: coords.lat,
        longitude: coords.lng,
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
      }
    : TORONTO_DEFAULT_REGION;

  const handleMarkerPress = useCallback(
    (item: PermitLeadFeedItem) => {
      router.push(`/(app)/[lead]?id=${item.lead_id}`);
    },
    [router],
  );

  return (
    <View className="flex-1 bg-zinc-950">
      {/* Full-screen map */}
      <LeadMapPane
        permits={allPermits}
        initialRegion={initialRegion}
        onMarkerPress={handleMarkerPress}
      />

      {/* Overlay: screen label (satisfies Maestro assertVisible: "Map View") */}
      <SafeAreaView
        className="absolute top-0 left-0 right-0"
        edges={['top']}
        pointerEvents="box-none"
      >
        <View className="mx-4 mt-2 flex-row items-center justify-between">
          <View className="bg-zinc-900/90 rounded-xl px-3 py-2 border border-zinc-800">
            <Text className="font-mono text-xs text-zinc-400 uppercase tracking-widest">
              Map View
            </Text>
          </View>

          {/* Filter FAB */}
          <Pressable
            onPress={() => {
              lightImpact();
              setFilterOpen(true);
            }}
            className="bg-amber-500 active:bg-amber-600 rounded-2xl items-center justify-center"
            style={{ width: 44, height: 44 }}
            accessibilityLabel="Open filters"
          >
            <Text style={{ fontSize: 18 }}>⚙</Text>
          </Pressable>
        </View>
        {/* Offline indicator — slides in when NetInfo reports offline. */}
        <OfflineBanner />
      </SafeAreaView>

      <LeadFilterSheet visible={filterOpen} onClose={() => setFilterOpen(false)} />
    </View>
  );
}
