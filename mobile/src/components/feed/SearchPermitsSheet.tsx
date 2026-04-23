// SPEC LINK: docs/specs/03-mobile/77_mobile_crm_flight_board.md §3.1 Global Search & Claim
// Bottom sheet for the FAB permit search. Claims a permit by setting saved=true
// and invalidating the flight board query. successNotification() on claim.
import React, { useState, useCallback, useRef } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator } from 'react-native';
import BottomSheet, { BottomSheetView, BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchPermits } from '@/hooks/useSearchPermits';
import { fetchWithAuth } from '@/lib/apiClient';
import { FLIGHT_BOARD_QUERY_KEY } from '@/hooks/useFlightBoard';
import { successNotification } from '@/lib/haptics';
import type { SearchResultItem } from '@/lib/schemas';

interface Props {
  visible: boolean;
  onClose: () => void;
}

const SNAP_POINTS = ['60%', '90%'];

export function SearchPermitsSheet({ visible, onClose }: Props) {
  const sheetRef = useRef<BottomSheet>(null);
  const [query, setQuery] = useState('');
  const [claimError, setClaimError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data, isFetching } = useSearchPermits(query);

  React.useEffect(() => {
    if (visible) {
      sheetRef.current?.expand();
    } else {
      sheetRef.current?.close();
      setQuery('');
      // Clear stale error so a prior failed claim isn't shown on next open.
      setClaimError(null);
    }
  }, [visible]);

  const claimMutation = useMutation({
    mutationFn: (item: SearchResultItem) =>
      fetchWithAuth('/api/leads/save', {
        method: 'POST',
        body: JSON.stringify({
          lead_id: `permit-${item.permit_num}-${item.revision_num}`,
          lead_type: 'permit',
          saved: true,
        }),
      }),
    onSuccess: () => {
      successNotification();
      void queryClient.invalidateQueries({ queryKey: FLIGHT_BOARD_QUERY_KEY });
      onClose();
    },
    onError: () => {
      setClaimError('Failed to claim job. Please try again.');
    },
  });

  const handleClaim = useCallback(
    (item: SearchResultItem) => {
      // Clear any previous attempt's error before kicking off a new mutation.
      setClaimError(null);
      claimMutation.mutate(item);
    },
    [claimMutation],
  );

  const results = data?.data ?? [];

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={SNAP_POINTS}
      enablePanDownToClose
      onClose={onClose}
      backgroundStyle={{ backgroundColor: '#18181b' }}
      handleIndicatorStyle={{ backgroundColor: '#52525b' }}
    >
      <BottomSheetView className="flex-1 px-4 pt-2">
        {/* Header */}
        <Text className="font-mono text-xs text-zinc-400 uppercase tracking-widest mb-3">
          Find a Job
        </Text>

        {/* Search input */}
        <View className="bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 flex-row items-center mb-4">
          <Text className="text-zinc-500 mr-2" style={{ fontSize: 16 }}>⌕</Text>
          <TextInput
            className="flex-1 text-zinc-100 text-sm font-mono"
            placeholder="Address or permit number..."
            placeholderTextColor="#52525b"
            value={query}
            onChangeText={setQuery}
            autoFocus
            autoCorrect={false}
            autoCapitalize="none"
          />
          {isFetching && (
            <ActivityIndicator size="small" color="#f59e0b" />
          )}
        </View>

        {claimError && (
          <View className="bg-red-950/40 border border-red-800/50 rounded-lg px-3 py-2 mb-3">
            <Text className="text-red-400 text-xs font-mono">{claimError}</Text>
          </View>
        )}

        {/* Results — BottomSheetFlatList delegates scroll gestures correctly to the sheet */}
        <BottomSheetFlatList
          data={results}
          keyExtractor={(item) => `${item.permit_num}-${item.revision_num}`}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable
              onPress={() => handleClaim(item)}
              className="py-3 border-b border-zinc-800 active:bg-zinc-800/50"
            >
              <View className="flex-row items-start justify-between">
                <Text className="text-zinc-100 text-sm font-semibold flex-1 mr-3" numberOfLines={1}>
                  {item.address || item.permit_num}
                </Text>
                <Text className="font-mono text-xs text-amber-400">Claim →</Text>
              </View>
              <View className="flex-row items-center gap-3 mt-0.5">
                <Text className="font-mono text-xs text-zinc-500">{item.permit_num}</Text>
                {item.lifecycle_phase && (
                  <Text className="text-xs text-zinc-600">{item.lifecycle_phase}</Text>
                )}
              </View>
            </Pressable>
          )}
          ListEmptyComponent={
            query.trim().length >= 2 && !isFetching ? (
              <Text className="text-zinc-600 text-sm text-center mt-8 font-mono">
                No permits found
              </Text>
            ) : query.trim().length < 2 ? (
              <Text className="text-zinc-600 text-xs text-center mt-8 font-mono">
                Type 2+ characters to search
              </Text>
            ) : null
          }
          contentContainerStyle={{ paddingBottom: 40 }}
        />
      </BottomSheetView>
    </BottomSheet>
  );
}
