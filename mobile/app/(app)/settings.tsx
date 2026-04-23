// SPEC LINK: docs/specs/03-mobile/92_mobile_engagement_hardware.md §2.3
//
// Settings screen — trade profile display, radius control, and notification
// preferences. All prefs sync to user_profiles.notification_prefs via PATCH.
import React, { useState } from 'react';
import {
  View,
  Text,
  Switch,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchWithAuth } from '@/lib/apiClient';
import { useFilterStore } from '@/store/filterStore';
import { lightImpact } from '@/lib/haptics';
import { OfflineBanner } from '@/components/shared/OfflineBanner';

type CostTier = 'small' | 'medium' | 'large' | 'major' | 'mega';
type Schedule = 'morning' | 'anytime' | 'evening';

interface NotificationPrefs {
  new_lead_min_cost_tier: CostTier;
  phase_changed: boolean;
  lifecycle_stalled: boolean;
  start_date_urgent: boolean;
  notification_schedule: Schedule;
}

const COST_TIERS: CostTier[] = ['small', 'medium', 'large', 'major', 'mega'];
const SCHEDULE_OPTIONS: { value: Schedule; label: string }[] = [
  { value: 'morning', label: 'Morning' },
  { value: 'anytime', label: 'Anytime' },
  { value: 'evening', label: 'Evening' },
];

const DEFAULT_PREFS: NotificationPrefs = {
  new_lead_min_cost_tier: 'medium',
  phase_changed: true,
  lifecycle_stalled: true,
  start_date_urgent: true,
  notification_schedule: 'anytime',
};

function usePatchPrefs() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<NotificationPrefs>) =>
      fetchWithAuth('/api/notifications/preferences', {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notification-prefs'] });
    },
  });
}

export default function SettingsScreen() {
  const tradeSlug = useFilterStore((s) => s.tradeSlug);
  const radiusKm = useFilterStore((s) => s.radiusKm);
  const setRadiusKm = useFilterStore((s) => s.setRadiusKm);

  const { data, isLoading } = useQuery({
    queryKey: ['notification-prefs'],
    queryFn: async () => {
      const res = await fetchWithAuth<{ prefs: NotificationPrefs }>(
        '/api/notifications/preferences',
      );
      return (res as { prefs: NotificationPrefs }).prefs;
    },
    staleTime: 60_000,
  });

  const prefs: NotificationPrefs = data ?? DEFAULT_PREFS;
  const { mutate: patchPrefs } = usePatchPrefs();

  const [localRadius, setLocalRadius] = useState(radiusKm);

  const costIndex = COST_TIERS.indexOf(prefs.new_lead_min_cost_tier);

  const updatePref = <K extends keyof NotificationPrefs>(key: K, value: NotificationPrefs[K]) => {
    lightImpact();
    patchPrefs({ [key]: value });
  };

  return (
    <SafeAreaView className="flex-1 bg-zinc-950" edges={['top']}>
      {/* Screen title — large, high-contrast so it's visually distinct from the
          monospace uppercase section headers below (spec 90 visual hierarchy). */}
      <View className="px-4 pt-4 pb-3 border-b border-zinc-800/50">
        <Text
          accessibilityRole="header"
          className="text-zinc-100 text-2xl font-bold"
        >
          Settings
        </Text>
      </View>

      <OfflineBanner />

      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 100 }}>

        {/* ── Trade Profile ───────────────────────────────────────── */}
        <Text className="font-mono text-xs text-zinc-400 uppercase tracking-wider px-4 pt-6 pb-2 border-t border-zinc-800">
          Trade Profile
        </Text>
        <View className="px-4 py-3 border-b border-zinc-800/50">
          <Text className="text-zinc-400 text-xs mb-0.5">Trade</Text>
          <Text className="text-zinc-100 text-sm font-semibold">{tradeSlug || '—'}</Text>
        </View>

        {/* ── Search Radius ────────────────────────────────────────── */}
        <Text className="font-mono text-xs text-zinc-400 uppercase tracking-wider px-4 pt-6 pb-2 border-t border-zinc-800">
          Search Radius
        </Text>
        <View className="px-4 py-3 border-b border-zinc-800/50">
          <View className="flex-row justify-between items-center mb-2">
            <Text className="text-zinc-100 text-sm">Radius</Text>
            <Text className="font-mono text-amber-500 text-sm">{localRadius} km</Text>
          </View>
          <Slider
            accessibilityLabel="Search radius in kilometers"
            accessibilityValue={{ min: 10, max: 50, now: localRadius, text: `${localRadius} kilometers` }}
            minimumValue={10}
            maximumValue={50}
            step={5}
            value={localRadius}
            onValueChange={setLocalRadius}
            onSlidingComplete={(val) => {
              setRadiusKm(val);
            }}
            minimumTrackTintColor="#f59e0b"
            maximumTrackTintColor="#3f3f46"
            thumbTintColor="#f59e0b"
          />
          <View className="flex-row justify-between mt-1">
            <Text className="font-mono text-xs text-zinc-600">10 km</Text>
            <Text className="font-mono text-xs text-zinc-600">50 km</Text>
          </View>
        </View>

        {/* ── Notifications ────────────────────────────────────────── */}
        {isLoading ? (
          <View className="px-4 pt-6 items-center">
            <ActivityIndicator color="#f59e0b" />
          </View>
        ) : (
          <>
            <Text className="font-mono text-xs text-zinc-400 uppercase tracking-wider px-4 pt-6 pb-2 border-t border-zinc-800">
              Notifications
            </Text>

            {/* Minimum value threshold */}
            <View className="px-4 py-3 border-b border-zinc-800/50">
              <View className="flex-row justify-between items-center mb-2">
                <Text className="text-zinc-100 text-sm">Minimum Job Value</Text>
                <Text className="font-mono text-amber-500 text-xs uppercase">
                  {prefs.new_lead_min_cost_tier}
                </Text>
              </View>
              <Slider
                accessibilityLabel="Minimum job value tier for new lead notifications"
                accessibilityValue={{
                  min: 0,
                  max: 4,
                  now: costIndex >= 0 ? costIndex : 1,
                  text: prefs.new_lead_min_cost_tier,
                }}
                minimumValue={0}
                maximumValue={4}
                step={1}
                value={costIndex >= 0 ? costIndex : 1}
                onSlidingComplete={(val) => {
                  updatePref('new_lead_min_cost_tier', COST_TIERS[Math.round(val)]);
                }}
                minimumTrackTintColor="#f59e0b"
                maximumTrackTintColor="#3f3f46"
                thumbTintColor="#f59e0b"
              />
              <View className="flex-row justify-between mt-1">
                <Text className="font-mono text-xs text-zinc-600">Small</Text>
                <Text className="font-mono text-xs text-zinc-600">Mega</Text>
              </View>
            </View>

            {/* Phase changed toggle */}
            <View className="flex-row justify-between items-center py-3 px-4 border-b border-zinc-800/50">
              <View className="flex-1 pr-4">
                <Text className="text-zinc-100 text-sm">Phase Updates</Text>
                <Text className="text-zinc-500 text-xs mt-0.5">When a saved job advances to next phase</Text>
              </View>
              <Switch
                value={prefs.phase_changed}
                onValueChange={(v) => updatePref('phase_changed', v)}
                trackColor={{ false: '#3f3f46', true: '#f59e0b' }}
                thumbColor="#ffffff"
              />
            </View>

            {/* Lifecycle stalled toggle */}
            <View className="flex-row justify-between items-center py-3 px-4 border-b border-zinc-800/50">
              <View className="flex-1 pr-4">
                <Text className="text-zinc-100 text-sm">Stall Alerts</Text>
                <Text className="text-zinc-500 text-xs mt-0.5">When a saved job is flagged as delayed</Text>
              </View>
              <Switch
                value={prefs.lifecycle_stalled}
                onValueChange={(v) => updatePref('lifecycle_stalled', v)}
                trackColor={{ false: '#3f3f46', true: '#f59e0b' }}
                thumbColor="#ffffff"
              />
            </View>

            {/* Start date urgent toggle */}
            <View className="flex-row justify-between items-center py-3 px-4 border-b border-zinc-800/50">
              <View className="flex-1 pr-4">
                <Text className="text-zinc-100 text-sm">Urgent Start</Text>
                <Text className="text-zinc-500 text-xs mt-0.5">When predicted start is ≤ 7 days away</Text>
              </View>
              <Switch
                value={prefs.start_date_urgent}
                onValueChange={(v) => updatePref('start_date_urgent', v)}
                trackColor={{ false: '#3f3f46', true: '#f59e0b' }}
                thumbColor="#ffffff"
              />
            </View>

            {/* Notification schedule segmented control */}
            <View className="px-4 py-3 border-b border-zinc-800/50">
              <Text className="text-zinc-400 text-xs mb-3 leading-4">
                Non-urgent alerts delivery window
              </Text>
              <View className="bg-zinc-800 rounded-lg p-1 flex-row">
                {SCHEDULE_OPTIONS.map(({ value, label }) => {
                  const isSelected = prefs.notification_schedule === value;
                  return (
                    <Pressable
                      key={value}
                      onPress={() => updatePref('notification_schedule', value)}
                      style={{ minHeight: 44, justifyContent: 'center' }}
                      className={`flex-1 rounded-md items-center ${
                        isSelected ? 'bg-amber-500' : ''
                      }`}
                    >
                      <Text
                        className={`font-mono text-xs ${
                          isSelected ? 'text-zinc-950' : 'text-zinc-400'
                        }`}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text className="text-zinc-600 text-xs mt-2 leading-4">
                Stall and urgent alerts always deliver immediately, regardless of schedule.
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
