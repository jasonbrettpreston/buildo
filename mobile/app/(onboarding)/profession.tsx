// SPEC LINK: docs/specs/03-mobile/94_mobile_onboarding.md §3, §9 Design, §10 Step 3
import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  SectionList,
  type SectionListData,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import { successNotification } from '@/lib/haptics';
import { Check } from 'lucide-react-native';
import { TRADE_SECTIONS, type TradeItem } from '@/lib/onboarding/tradeData';
import { useOnboardingStore } from '@/store/onboardingStore';
import { useFilterStore } from '@/store/filterStore';
import { fetchWithAuth, ApiError } from '@/lib/apiClient';

export default function ProfessionScreen() {
  const router = useRouter();
  const [selectedTrade, setSelectedTrade] = useState<TradeItem | null>(null);
  const [isPatching, setIsPatching] = useState(false);
  const [patchError, setPatchError] = useState<string | null>(null);
  const sheetRef = useRef<BottomSheet>(null);

  const { setTrade, setStep, setPath } = useOnboardingStore.getState();
  const { setTradeSlug } = useFilterStore.getState();

  // Guard against post-unmount state mutations if the user navigates back
  // during an in-flight PATCH.
  const isMounted = useRef(true);
  useEffect(() => () => { isMounted.current = false; }, []);

  const openConfirmSheet = useCallback(() => {
    sheetRef.current?.expand();
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!selectedTrade) return;
    setIsPatching(true);
    setPatchError(null);
    try {
      await fetchWithAuth('/api/user-profile', {
        method: 'PATCH',
        body: JSON.stringify({ trade_slug: selectedTrade.slug }),
      });
    } catch (err) {
      // Idempotency: if the server returns 400 indicating the trade is already
      // set to this same value, treat as success (safe retry on network drop).
      if (err instanceof ApiError && err.status === 400 && err.message.includes('already')) {
        // fall through to success path
      } else {
        setPatchError('Could not save trade. Please try again.');
        setIsPatching(false);
        return;
      }
    }

    // PATCH succeeded — guard against back-press during in-flight PATCH.
    if (!isMounted.current) return;
    successNotification();
    setTrade(selectedTrade.slug, selectedTrade.label);
    setTradeSlug(selectedTrade.slug);

    if (selectedTrade.slug === 'realtor') {
      setPath('realtor');
      setStep('address');
      sheetRef.current?.close();
      router.push('/(onboarding)/address');
    } else {
      setStep('path');
      sheetRef.current?.close();
      router.push('/(onboarding)/path');
    }
    setIsPatching(false);
  }, [selectedTrade, setTrade, setTradeSlug, setPath, setStep, router]);

  const renderSectionHeader = useCallback(
    ({ section }: { section: SectionListData<TradeItem> }) => (
      <View className="bg-zinc-900 px-4 py-2 border-b border-zinc-800">
        <Text className="font-mono text-[11px] text-zinc-400 uppercase tracking-widest">
          {section.title}
        </Text>
      </View>
    ),
    [],
  );

  const renderItem = useCallback(
    ({ item }: { item: TradeItem }) => {
      const isSelected = selectedTrade?.slug === item.slug;
      return (
        <Pressable
          onPress={() => setSelectedTrade(item)}
          className={
            isSelected
              ? 'flex-row items-center justify-between px-4 min-h-[52px] border-b border-zinc-800/40 border-l-[3px] border-l-amber-500 bg-amber-500/5 pl-3'
              : 'flex-row items-center justify-between px-4 min-h-[52px] border-b border-zinc-800/40 active:bg-zinc-800'
          }
          accessibilityRole="radio"
          accessibilityState={{ selected: isSelected }}
        >
          <Text className="text-zinc-100 text-base">{item.label}</Text>
          {isSelected && <Check size={16} color="#f59e0b" />}
        </Pressable>
      );
    },
    [selectedTrade],
  );

  return (
    <SafeAreaView className="flex-1 bg-zinc-950" edges={['top']}>
      <View className="px-4 pt-4 pb-2">
        <Text className="text-zinc-100 text-2xl font-bold">What's your trade?</Text>
        <Text className="text-zinc-400 text-sm mt-1">
          Select your primary trade to personalize your feed.
        </Text>
      </View>

      <SectionList
        sections={TRADE_SECTIONS}
        keyExtractor={(item) => item.slug}
        renderSectionHeader={renderSectionHeader}
        renderItem={renderItem}
        stickySectionHeadersEnabled={true}
        contentContainerStyle={{ paddingBottom: 100 }}
      />

      {/* Sticky footer CTA */}
      <View className="absolute bottom-0 w-full bg-zinc-950/95 px-4 pb-safe pt-3 border-t border-zinc-800">
        <Pressable
          onPress={openConfirmSheet}
          disabled={!selectedTrade}
          style={{ opacity: selectedTrade ? 1 : 0.4 }}
          className="bg-amber-500 active:bg-amber-600 rounded-2xl py-4 w-full items-center"
          accessibilityRole="button"
          accessibilityLabel="Continue with selected trade"
        >
          <Text className="text-zinc-950 font-bold text-base text-center">Continue</Text>
        </Pressable>
      </View>

      {/* Trade lock confirmation sheet */}
      <BottomSheet
        ref={sheetRef}
        index={-1}
        snapPoints={['42%']}
        enablePanDownToClose
        backgroundStyle={{ backgroundColor: '#18181b' }}
        handleIndicatorStyle={{ backgroundColor: '#3f3f46' }}
      >
        <BottomSheetView style={{ flex: 1, paddingHorizontal: 20, paddingTop: 8 }}>
          {selectedTrade && (
            <View className="self-center bg-amber-500/10 px-3 py-1 rounded-full mb-3">
              <Text className="font-mono text-amber-400 text-xs tracking-widest uppercase">
                {selectedTrade.label}
              </Text>
            </View>
          )}

          <Text className="text-zinc-400 text-sm text-center leading-relaxed mt-3">
            You selected{' '}
            <Text className="text-zinc-100 font-semibold">{selectedTrade?.label}</Text>. This
            cannot be changed after setup without deleting your account. Continue?
          </Text>

          {patchError && (
            <Text className="text-red-400 text-xs text-center mt-3">{patchError}</Text>
          )}

          <Pressable
            onPress={handleConfirm}
            disabled={isPatching}
            style={{ opacity: isPatching ? 0.7 : 1 }}
            className="bg-amber-500 active:bg-amber-600 rounded-2xl py-4 w-full mt-6 items-center min-h-[52px] justify-center"
            accessibilityRole="button"
          >
            {isPatching ? (
              <ActivityIndicator size="small" color="#09090b" />
            ) : (
              <Text className="text-zinc-950 font-bold text-base text-center">Confirm</Text>
            )}
          </Pressable>

          <Pressable
            onPress={() => {
              sheetRef.current?.close();
              setPatchError(null);
            }}
            className="items-center mt-3 min-h-[44px] justify-center"
          >
            <Text className="text-zinc-500 text-sm text-center">Go Back</Text>
          </Pressable>
        </BottomSheetView>
      </BottomSheet>
    </SafeAreaView>
  );
}
