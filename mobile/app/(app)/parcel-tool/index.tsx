// SPEC LINK: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §4 (ParcelSearchScreen)
//
// Standalone home-looker search: debounced (≥400ms) typeahead against /api/parcels/lookup?q=,
// a candidate list that clicks through to the detail screen by parcelId, and a data-inherent
// Toronto hint (isInsideToronto is UX, not security — Spec 100 §2.9). NOT coupled to leads.
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Search } from 'lucide-react-native';
import { useParcelSearch } from '@/hooks/useParcelLookup';
import { useFilterStore } from '@/store/filterStore';
import { isInsideToronto } from '@/lib/onboarding/snapCoord';
import { RateLimitError } from '@/lib/errors';
import type { ParcelCandidate, ParcelMatch } from '@/lib/schemas';

export default function ParcelSearchScreen() {
  const router = useRouter();
  const [input, setInput] = useState('');
  const [debounced, setDebounced] = useState('');
  // Read the already-stored home base (set in onboarding) — no fresh GPS prompt just for a hint.
  const homeBase = useFilterStore((s) => s.homeBaseLocation);

  // ≥400ms debounce (Spec 100 fold #5) so typeahead exploration doesn't hammer the 60/min bucket.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(input), 400);
    return () => clearTimeout(t);
  }, [input]);

  const { data, isFetching, error } = useParcelSearch(debounced);

  // Data-inherent Toronto scoping (Spec 100 §2.9): the corpus IS Toronto. When the stored home
  // base is outside the bounds, show a UX hint — never a hard block.
  const outsideToronto = homeBase != null && !isInsideToronto(homeBase.lat, homeBase.lng);

  const results = useMemo<Array<ParcelMatch | ParcelCandidate>>(() => {
    if (!data) return [];
    if (data.match) return [data.match];
    return data.candidates;
  }, [data]);

  const goToParcel = (parcelId: string) => {
    router.push(`/(app)/parcel-tool/${encodeURIComponent(parcelId)}`);
  };

  const retryAfter = error instanceof RateLimitError ? error.retryAfterSeconds : null;
  const showEmpty =
    debounced.trim().length >= 3 && !isFetching && !error && results.length === 0;

  return (
    <SafeAreaView className="flex-1 bg-zinc-950" edges={['top']}>
      <View className="px-4 pt-4 pb-2 border-b border-zinc-800/50">
        <Text className="font-mono text-xs text-zinc-400 uppercase tracking-widest">
          Parcels
        </Text>
        <Text className="text-zinc-500 text-xs mt-1">Toronto addresses only</Text>
      </View>

      <View className="px-4 pt-3">
        <View className="flex-row items-center bg-zinc-900 rounded-xl px-3 border border-zinc-800">
          <Search size={18} color="#71717a" />
          <TextInput
            testID="parcel-search-input"
            value={input}
            onChangeText={setInput}
            placeholder="Search an address, e.g. 26 Hurlingham Cres"
            placeholderTextColor="#52525b"
            autoCapitalize="none"
            autoCorrect={false}
            className="flex-1 text-white py-3 px-2"
          />
          {isFetching ? <ActivityIndicator size="small" color="#f59e0b" /> : null}
        </View>

        {outsideToronto ? (
          <Text className="text-amber-500/80 text-xs mt-2">
            MaxBLD currently covers Toronto — results are limited to Toronto addresses.
          </Text>
        ) : null}

        {retryAfter != null ? (
          <Text testID="parcel-search-ratelimit" className="text-red-400 text-xs mt-2">
            Too many searches. Try again in {retryAfter}s.
          </Text>
        ) : null}
      </View>

      <ScrollView className="flex-1 px-4 mt-3" keyboardShouldPersistTaps="handled">
        {results.map((r) => (
          <Pressable
            key={r.parcelId}
            testID={`parcel-candidate-${r.parcelId}`}
            onPress={() => goToParcel(r.parcelId)}
            className="py-3 px-3 mb-2 bg-zinc-900 rounded-xl border border-zinc-800 active:opacity-70"
          >
            <Text className="text-white text-base">{r.address || r.parcelId}</Text>
            <Text className="text-zinc-500 text-xs mt-0.5">Parcel {r.parcelId}</Text>
          </Pressable>
        ))}

        {showEmpty ? (
          <Text testID="parcel-search-empty" className="text-zinc-500 text-center mt-8">
            No parcel found for that address.
          </Text>
        ) : null}

        {debounced.trim().length < 3 ? (
          <Text className="text-zinc-600 text-center mt-8">
            Type at least 3 characters to search.
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
