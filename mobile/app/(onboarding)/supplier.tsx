// SPEC LINK: docs/specs/03-mobile/94_mobile_onboarding.md §5 Step 3, §6 Step 2, §9 Design, §10 Step 6
// FlatList numColumns={2} — FlashList v2 does not support numColumns (Spec 90 §4).
// columnWrapperStyle uses inline style — NativeWind cannot reach columnWrapperStyle.
import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useOnboardingStore } from '@/store/onboardingStore';
import { fetchWithAuth } from '@/lib/apiClient';
import { ProgressStepper } from '@/components/onboarding/ProgressStepper';

interface SuppliersResponse {
  data: { suppliers: string[] };
}

export default function SupplierScreen() {
  const router = useRouter();
  const selectedTrade = useOnboardingStore((s) => s.selectedTrade);
  const selectedPath = useOnboardingStore((s) => s.selectedPath);
  const isPathL = selectedPath === 'leads';

  const [selectedSupplier, setSelectedSupplier] = useState<string | null>(null);
  const [otherText, setOtherText] = useState('');
  const [isPatching, setIsPatching] = useState(false);
  const [patchError, setPatchError] = useState<string | null>(null);

  const { setSupplier, setStep } = useOnboardingStore.getState();

  const { data, isLoading } = useQuery({
    queryKey: ['onboarding-suppliers', selectedTrade],
    queryFn: () =>
      fetchWithAuth<SuppliersResponse>(
        `/api/onboarding/suppliers?trade=${selectedTrade ?? ''}`,
      ),
    enabled: !!selectedTrade,
  });

  const suppliers = data?.data?.suppliers ?? [];

  // Auto-skip when the query resolves with no suppliers.
  // Guard on selectedTrade: a disabled query (selectedTrade=null) returns isLoading=false +
  // empty data, which would trigger a premature skip before the store rehydrates.
  useEffect(() => {
    if (selectedTrade && !isLoading && suppliers.length === 0) {
      const next = selectedPath === 'tracking'
        ? '/(onboarding)/first-permit'
        : '/(onboarding)/terms';
      router.replace(next);
    }
  }, [selectedTrade, selectedPath, isLoading, suppliers.length, router]);

  const handleSkip = () => {
    // No PATCH on skip — step advances only after server confirmation.
    const next = selectedPath === 'tracking'
      ? '/(onboarding)/first-permit'
      : '/(onboarding)/terms';
    router.push(next);
  };

  const handleConfirm = async () => {
    const value = selectedSupplier ?? (otherText.trim() || null);
    setIsPatching(true);
    setPatchError(null);
    try {
      if (value) {
        await fetchWithAuth('/api/user-profile', {
          method: 'PATCH',
          body: JSON.stringify({ supplier_selection: value }),
        });
        setSupplier(value);
      }
      // Only advance to 'terms' if not inserting the first-permit step (Path T).
      // setStep must only reflect the step we're actually going to.
      if (selectedPath !== 'tracking') {
        setStep('terms');
      }
      const next = selectedPath === 'tracking'
        ? '/(onboarding)/first-permit'
        : '/(onboarding)/terms';
      router.push(next);
    } catch {
      setPatchError('Could not save. Please try again.');
    } finally {
      setIsPatching(false);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-zinc-950 items-center justify-center">
        <ActivityIndicator size="large" color="#f59e0b" />
      </SafeAreaView>
    );
  }

  // Extracted per Spec 90 §5 — inline renderItem recreates the function on every
  // render, forcing all visible cells to re-render unnecessarily.
  const renderSupplierItem = useCallback(({ item }: { item: string }) => {
    const isSelected = selectedSupplier === item;
    return (
      <Pressable
        onPress={() => {
          setSelectedSupplier(isSelected ? null : item);
          setOtherText('');
        }}
        className={`bg-zinc-900 rounded-2xl p-4 flex-1 min-h-[52px] justify-center ${
          isSelected
            ? 'border border-amber-500 bg-amber-500/5'
            : 'border border-zinc-800 active:border-amber-500'
        }`}
      >
        <Text className={`text-sm text-center ${isSelected ? 'text-amber-400 font-semibold' : 'text-zinc-100'}`}>
          {item}
        </Text>
      </Pressable>
    );
  }, [selectedSupplier]);

  return (
    <SafeAreaView className="flex-1 bg-zinc-950" edges={['top', 'bottom']}>
      {isPathL && <ProgressStepper currentStep={3} totalSteps={4} />}

      <View className="px-4 pb-4">
        {selectedPath === 'tracking' ? (
          <Text className="text-zinc-100 font-bold text-sm mb-4">
            Your supplier is important for project-based leads.
          </Text>
        ) : (
          <Text className="text-zinc-100 text-lg font-bold mb-1">Your main supplier</Text>
        )}
        <Text className="text-zinc-400 text-sm">Select your primary supplier (optional).</Text>
      </View>

      <FlatList
        data={suppliers}
        keyExtractor={(item) => item}
        numColumns={2}
        // columnWrapperStyle must be an inline style — NativeWind cannot target this prop.
        columnWrapperStyle={{ gap: 12, paddingHorizontal: 16 }}
        contentContainerStyle={{ paddingBottom: 16 }}
        renderItem={renderSupplierItem}
        ListFooterComponent={() => (
          <View className="px-4">
            <TextInput
              className="bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-zinc-100 font-mono text-sm mt-3"
              placeholder="Other supplier..."
              placeholderTextColor="#52525b"
              value={otherText}
              onChangeText={(t) => {
                setOtherText(t);
                if (t) setSelectedSupplier(null);
              }}
            />
          </View>
        )}
      />

      {patchError && (
        <Text className="text-red-400 text-xs text-center mt-2 px-4">{patchError}</Text>
      )}

      <View className="px-4 pb-safe pt-3">
        <Pressable
          onPress={handleConfirm}
          disabled={isPatching}
          style={{ opacity: isPatching ? 0.7 : 1 }}
          className="bg-amber-500 active:bg-amber-600 rounded-2xl py-4 w-full items-center min-h-[52px] justify-center"
          accessibilityRole="button"
        >
          {isPatching ? (
            <ActivityIndicator size="small" color="#09090b" />
          ) : (
            <Text className="text-zinc-950 font-bold text-base text-center">
              {selectedSupplier || otherText.trim() ? 'Confirm' : 'Continue'}
            </Text>
          )}
        </Pressable>

        <Pressable
          onPress={handleSkip}
          className="items-center justify-center mt-3 min-h-[44px]"
        >
          <Text className="text-zinc-500 font-mono text-xs text-center">Skip for now →</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
