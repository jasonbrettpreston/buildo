// SPEC LINK: docs/specs/03-mobile/94_mobile_onboarding.md §4 Step 1, §5 Step 2, §8, §9 Design, §10 Step 5
import { useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { useOnboardingStore } from '@/store/onboardingStore';
import { useFilterStore } from '@/store/filterStore';
import { fetchWithAuth } from '@/lib/apiClient';
import { isInsideToronto, snapToGrid, getNearestTorontoCentroid } from '@/lib/onboarding/snapCoord';
import { ProgressStepper } from '@/components/onboarding/ProgressStepper';

export default function AddressScreen() {
  const router = useRouter();
  const selectedPath = useOnboardingStore((s) => s.selectedPath);
  const isRealtor = selectedPath === 'realtor';

  const [inputText, setInputText] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [boundsError, setBoundsError] = useState<string | null>(null);
  const [nearestCentroid, setNearestCentroid] = useState<{
    name: string;
    lat: number;
    lng: number;
  } | null>(null);
  const [pendingCoord, setPendingCoord] = useState<{ lat: number; lng: number } | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [isPatching, setIsPatching] = useState(false);
  const [patchError, setPatchError] = useState<string | null>(null);

  const { setLocation, setStep } = useOnboardingStore.getState();
  const { setHomeBaseLocation, setLocationMode } = useFilterStore.getState();

  const patchFixedAddress = useCallback(
    async (lat: number, lng: number) => {
      setIsPatching(true);
      try {
        await fetchWithAuth('/api/user-profile', {
          method: 'PATCH',
          body: JSON.stringify({ home_base_lat: lat, home_base_lng: lng, location_mode: 'home_base_fixed' }),
        });
        setLocation({ mode: 'home_base_fixed', lat, lng });
        setHomeBaseLocation({ lat, lng });
        setLocationMode('home_base_fixed');
        setStep('supplier');
        router.push('/(onboarding)/supplier');
      } catch {
        setPatchError('Could not save location. Please try again.');
      } finally {
        setIsPatching(false);
      }
    },
    [setLocation, setHomeBaseLocation, setLocationMode, setStep, router],
  );

  const handleGeocodeSubmit = useCallback(async () => {
    if (!inputText.trim()) return;
    setIsGeocoding(true);
    setBoundsError(null);
    setNearestCentroid(null);
    setPendingCoord(null);
    try {
      const results = await Location.geocodeAsync(inputText);
      // Empty-array guard: geocodeAsync returns [] (not null/error) when the
      // address yields no results — check length before accessing results[0].
      if (results.length === 0) {
        setBoundsError('Address not found — please try again.');
        return;
      }
      const { latitude: lat, longitude: lng } = results[0];
      if (!isInsideToronto(lat, lng)) {
        setBoundsError("That address is outside Toronto's permit coverage.");
        setNearestCentroid(getNearestTorontoCentroid(lat, lng));
        return;
      }
      const snapped = snapToGrid(lat, lng);
      setPendingCoord(snapped);
    } finally {
      setIsGeocoding(false);
    }
  }, [inputText]);

  const handleConfirmAddress = useCallback(async () => {
    if (!pendingCoord) return;
    await patchFixedAddress(pendingCoord.lat, pendingCoord.lng);
  }, [pendingCoord, patchFixedAddress]);

  const handleUseCentroid = useCallback(async () => {
    if (!nearestCentroid) return;
    setBoundsError(null);
    setNearestCentroid(null);
    await patchFixedAddress(nearestCentroid.lat, nearestCentroid.lng);
  }, [nearestCentroid, patchFixedAddress]);

  const handleGpsLive = useCallback(async () => {
    setPermissionDenied(false);
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      setPermissionDenied(true);
      return;
    }
    setIsPatching(true);
    try {
      // PATCH location_mode BEFORE navigating — ensures it is written even on drop-off.
      await fetchWithAuth('/api/user-profile', {
        method: 'PATCH',
        body: JSON.stringify({ location_mode: 'gps_live' }),
      });
      setLocation({ mode: 'gps_live' });
      setLocationMode('gps_live');
      setStep('supplier');
      router.push('/(onboarding)/supplier');
    } catch {
      setPatchError('Could not save location preference. Please try again.');
    } finally {
      setIsPatching(false);
    }
  }, [setLocation, setLocationMode, setStep, router]);

  return (
    <SafeAreaView className="flex-1 bg-zinc-950" edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView
          className="flex-1 px-6"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 40 }}
        >
          {!isRealtor && <ProgressStepper currentStep={2} totalSteps={4} />}

          <Text className="text-zinc-100 text-2xl font-bold mb-2">
            {isRealtor ? 'Your territory' : 'Your home base'}
          </Text>
          <Text className="text-zinc-400 text-sm mb-6 leading-relaxed">
            {isRealtor
              ? 'Enter the address you work from. Leads will be found near this location.'
              : 'Enter your base address or use Live GPS to follow your current location.'}
          </Text>

          {/* Address text input — font-sans (DM Sans), NOT font-mono */}
          <TextInput
            className={`bg-zinc-900 rounded-2xl px-4 py-4 text-zinc-100 text-base ${
              isFocused ? 'border border-amber-500' : 'border border-zinc-700'
            }`}
            placeholder="123 Main St, Toronto, ON"
            placeholderTextColor="#52525b"
            value={inputText}
            onChangeText={(t) => {
              setInputText(t);
              setBoundsError(null);
              setPendingCoord(null);
            }}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onSubmitEditing={handleGeocodeSubmit}
            returnKeyType="search"
            autoCapitalize="words"
            autoCorrect={false}
            testID="address-input"
          />

          {/* Search CTA */}
          <Pressable
            onPress={handleGeocodeSubmit}
            disabled={isGeocoding || !inputText.trim()}
            style={{ opacity: !inputText.trim() ? 0.4 : 1 }}
            className="bg-zinc-800 border border-zinc-700 rounded-2xl py-4 mt-3 items-center min-h-[52px] justify-center"
          >
            {isGeocoding ? (
              <ActivityIndicator size="small" color="#f59e0b" />
            ) : (
              <Text className="text-zinc-100 text-base font-semibold">Search address</Text>
            )}
          </Pressable>

          {/* Toronto bounds error */}
          {boundsError && (
            <View className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 mt-3">
              <Text className="text-amber-400 text-sm leading-relaxed">{boundsError}</Text>
              {nearestCentroid && (
                <Pressable onPress={handleUseCentroid} className="mt-2 min-h-[44px] justify-center">
                  <Text className="text-amber-400 font-mono text-xs">
                    Use {nearestCentroid.name} instead →
                  </Text>
                </Pressable>
              )}
            </View>
          )}

          {/* Pending coord confirm */}
          {pendingCoord && !boundsError && (
            <View className="bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 mt-3">
              <Text className="text-zinc-400 text-sm mb-2">Address found. Confirm location?</Text>
              <Pressable
                onPress={handleConfirmAddress}
                disabled={isPatching}
                style={{ opacity: isPatching ? 0.7 : 1 }}
                className="bg-amber-500 active:bg-amber-600 rounded-xl py-3 items-center min-h-[44px] justify-center"
              >
                {isPatching ? (
                  <ActivityIndicator size="small" color="#09090b" />
                ) : (
                  <Text className="text-zinc-950 font-bold text-sm">Confirm</Text>
                )}
              </Pressable>
            </View>
          )}

          {/* GPS Live button — hidden for Realtor path */}
          {!isRealtor && (
            <Pressable
              onPress={handleGpsLive}
              disabled={isPatching}
              className="bg-zinc-800 border border-zinc-700 rounded-2xl flex-row items-center justify-center px-4 py-4 mt-3 gap-3 min-h-[52px]"
              accessibilityRole="button"
            >
              <Text className="text-amber-500 text-lg">📍</Text>
              <Text className="text-zinc-100 text-base">Use Live GPS</Text>
            </Pressable>
          )}

          {/* GPS permission denied explainer */}
          {permissionDenied && (
            <View className="bg-red-500/5 border border-red-500/20 rounded-xl px-4 py-3 mt-3">
              <Text className="text-red-400 text-sm leading-relaxed">
                We need location access to show leads near you. Enable in Settings or switch to a
                fixed address.
              </Text>
              <Pressable
                onPress={() => void Linking.openSettings()}
                className="mt-2 min-h-[44px] justify-center"
              >
                <Text className="text-red-400 font-mono text-sm">Enable in Settings →</Text>
              </Pressable>
              <Pressable
                onPress={() => setPermissionDenied(false)}
                className="mt-1 min-h-[44px] justify-center"
              >
                <Text className="text-zinc-500 text-sm">Use a fixed address instead</Text>
              </Pressable>
            </View>
          )}

          {patchError && (
            <Text className="text-red-400 text-xs text-center mt-4">{patchError}</Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
