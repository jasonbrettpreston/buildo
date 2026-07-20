// SPEC LINK: docs/specs/03-mobile/92_mobile_engagement_hardware.md §2.3
//             docs/specs/03-mobile/93_mobile_auth.md §3.4 Sign-Out, §5 Step 7
//
// Settings screen — trade profile display, radius control, notification
// preferences, and Sign Out. All prefs sync to user_profiles.notification_prefs.
//
// Spec 97 §3 will add Delete Account next to Sign Out. The deletion order is:
//   1. POST /api/user-profile/delete (must succeed before proceeding)
//   2. useAuthStore.getState().signOut()  (this spec — clears Firebase + stores)
//   3. AuthGate redirects to /(auth)/sign-in via onAuthStateChanged
// If step 1 fails, do NOT sign out — show error toast and abort.
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Switch,
  Pressable,
  ScrollView,
  ActivityIndicator,
  AppState,
  Linking,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import Slider from '@react-native-community/slider';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchWithAuth } from '@/lib/apiClient';
import { logQueryInvalidate } from '@/lib/queryTelemetry';
import { useFilterStore } from '@/store/filterStore';
import { usePatchProfile } from '@/hooks/usePatchProfile';
import { useAuthStore } from '@/store/authStore';
import { useUserProfile } from '@/hooks/useUserProfile';
import { usePortalSession } from '@/hooks/usePortalSession';
import { requestPermissionAndRegister } from '@/lib/pushTokens';
import { lightImpact, errorNotification } from '@/lib/haptics';
import * as Haptics from 'expo-haptics';
import { OfflineBanner } from '@/components/shared/OfflineBanner';

// Stripe Customer Portal entry — Spec 96 §7 (P26-26C). The row mints a real
// one-off portal session via usePortalSession (POST
// /api/subscribe/portal-session). The pre-P26 static billing-page link is
// gone — a static URL cannot authenticate the user into their portal.

// Spec 99 §9.14 (2026-05-04): cost-tier reconciled to canonical 3-value enum
// (was a divergent 5-value set unique to this screen); `lifecycle_stalled`
// renamed to `lifecycle_stalled_pref` to match the server column post-flatten.
type CostTier = 'low' | 'medium' | 'high';
type Schedule = 'morning' | 'anytime' | 'evening';

interface NotificationPrefs {
  new_lead_min_cost_tier: CostTier;
  phase_changed: boolean;
  lifecycle_stalled_pref: boolean;
  start_date_urgent: boolean;
  notification_schedule: Schedule;
}

const COST_TIERS: CostTier[] = ['low', 'medium', 'high'];
const SCHEDULE_OPTIONS: { value: Schedule; label: string }[] = [
  { value: 'morning', label: 'Morning' },
  { value: 'anytime', label: 'Anytime' },
  { value: 'evening', label: 'Evening' },
];

const DEFAULT_PREFS: NotificationPrefs = {
  new_lead_min_cost_tier: 'medium',
  phase_changed: true,
  lifecycle_stalled_pref: true,
  start_date_urgent: true,
  notification_schedule: 'anytime',
};

// Spec 96 §7 (P26-26C). Hidden when account_preset = 'manufacturer'
// (admin-managed accounts have no consumer billing UI — the hide is kept
// verbatim). Tapping mints a one-off Stripe Customer Portal session and
// opens it in the in-app browser; cancel / payment-method updates /
// past_due recovery all live in the portal. Status changes made there
// arrive via webhook + the AppState re-fetch.
function ManageSubscriptionRow() {
  const { data: profile } = useUserProfile();
  const { openPortal, isLoading, error } = usePortalSession();
  if (!profile || profile.account_preset === 'manufacturer') return null;
  return (
    <>
      <Text className="font-mono text-xs text-zinc-400 uppercase tracking-wider px-4 pt-6 pb-2 border-t border-zinc-800">
        Subscription
      </Text>
      <Pressable
        onPress={() => {
          lightImpact();
          void openPortal();
        }}
        disabled={isLoading}
        className="px-4 py-4 border-b border-zinc-800/50 active:bg-zinc-900"
        style={{ minHeight: 52 }}
        accessibilityRole="button"
        accessibilityLabel="Manage subscription"
        testID="manage-subscription"
      >
        <View className="flex-row items-center justify-between">
          <Text className="text-zinc-100 text-sm">Manage subscription →</Text>
          {isLoading ? <ActivityIndicator size="small" color="#f59e0b" /> : null}
        </View>
        <Text className="text-zinc-500 text-xs mt-0.5">
          Cancel, update payment, or change plan
        </Text>
        {error ? (
          <Text className="text-red-400 text-xs mt-1">
            {error.kind === 'no_customer'
              ? 'No billing to manage yet — subscribe first.'
              : 'Couldn’t open billing — try again.'}
          </Text>
        ) : null}
      </Pressable>
    </>
  );
}

// P25 25D — OS-level notification permission status row. Three states:
//   granted            → render nothing (the pref toggles below are the UI).
//   denied+canAskAgain → "Enable notifications" re-prompt (this is ALSO the
//                        Maybe-Later re-request path: a user who dismissed the
//                        SaveButton pre-prompt re-requests here — pre-P25 that
//                        dismissal was permanent, the only requester was the
//                        first-save modal).
//   denied+!canAskAgain→ the OS will silently ignore requestPermissionsAsync,
//                        so honest UX = say it is blocked + Linking.openSettings.
// Permission state re-checks when the app returns to foreground (the user may
// have just flipped the toggle in system settings).
function NotificationPermissionRow() {
  const queryClient = useQueryClient();
  const { data: perm } = useQuery({
    queryKey: ['notification-permission'],
    queryFn: () => Notifications.getPermissionsAsync(),
    staleTime: 0,
  });

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void queryClient.invalidateQueries({ queryKey: ['notification-permission'] });
      }
    });
    return () => sub.remove();
  }, [queryClient]);

  if (!perm || perm.status === 'granted') return null;

  const canAskAgain = perm.canAskAgain;
  return (
    <Pressable
      onPress={() => {
        lightImpact();
        if (canAskAgain) {
          void requestPermissionAndRegister().then(() => {
            void queryClient.invalidateQueries({ queryKey: ['notification-permission'] });
          });
        } else {
          void Linking.openSettings();
        }
      }}
      className="px-4 py-3 border-b border-zinc-800/50 bg-amber-500/10 active:bg-amber-500/20"
      style={{ minHeight: 52 }}
      accessibilityRole="button"
      accessibilityLabel={canAskAgain ? 'Enable notifications' : 'Open system settings to enable notifications'}
      testID="notification-permission-row"
    >
      <Text className="text-amber-500 text-sm font-semibold">
        {canAskAgain ? 'Enable notifications' : 'Notifications are blocked'}
      </Text>
      <Text className="text-zinc-400 text-xs mt-0.5">
        {canAskAgain
          ? 'Alerts are off. Tap to allow phase, stall, and start-date alerts.'
          : 'The OS is blocking alerts for MaxBLD. Tap to open system settings.'}
      </Text>
    </Pressable>
  );
}

// P25 25D — optimistic update WITH rollback. Pre-P25 the mutation had no
// onError/onMutate: the Switch flipped visually (its own internal state) but the
// PATCH ran silently in the background, and on failure NOTHING reverted or
// signalled — a "silent visual lie" (the toggle looked applied when it was not).
// Now the query cache is updated optimistically (so the bound Switch reflects the
// intent immediately AND consistently) and rolled back on error with the
// error-notification haptic (the mobile convention for "check the screen").
// `onError` lets the screen surface a transient error banner.
function usePatchPrefs(onErrorSignal?: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<NotificationPrefs>) =>
      fetchWithAuth('/api/notifications/preferences', {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    onMutate: async (patch: Partial<NotificationPrefs>) => {
      await queryClient.cancelQueries({ queryKey: ['notification-prefs'] });
      const previous = queryClient.getQueryData<NotificationPrefs>(['notification-prefs']);
      queryClient.setQueryData<NotificationPrefs>(['notification-prefs'], (old) => ({
        ...(old ?? DEFAULT_PREFS),
        ...patch,
      }));
      return { previous };
    },
    onError: (_err, _patch, context) => {
      // Revert to the pre-mutation snapshot — the toggle visibly snaps back.
      if (context?.previous) {
        queryClient.setQueryData<NotificationPrefs>(['notification-prefs'], context.previous);
      }
      errorNotification();
      onErrorSignal?.();
    },
    onSettled: () => {
      // Spec 99 §7.2 — reconcile with the server after the optimistic write.
      logQueryInvalidate('notification-prefs');
      void queryClient.invalidateQueries({ queryKey: ['notification-prefs'] });
    },
  });
}

export default function SettingsScreen() {
  const tradeSlug = useFilterStore((s) => s.tradeSlug);
  const radiusKm = useFilterStore((s) => s.radiusKm);
  // Spec 99 §9.16: writes go through `usePatchProfile` (canonical B3 mutation
  // with rollback + invalidate). Pre-§9.16 this called `setRadiusKm(val)`
  // alone, which lost the change on cold boot and drifted on shared devices.
  const { mutate: patchProfile } = usePatchProfile();

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
  // Re-sync the slider's local in-drag display to filterStore.radiusKm
  // whenever the canonical store value changes — covers two cases the
  // §9.16 review (#3) flagged:
  //  (a) `usePatchProfile` rolls back radiusKm on PATCH error, so the
  //      slider should snap back to the pre-mutation value.
  //  (b) `usePatchProfile` invalidates `['user-profile']` on settle and
  //      the server applies the admin `radius_cap_km` cap, so the
  //      slider should reflect any server-clamped value.
  // The local `useState` exists because the slider's `onValueChange`
  // fires on every drag tick (smooth visual updates without thrashing
  // the store), and `onSlidingComplete` commits the final value.
  useEffect(() => {
    setLocalRadius(radiusKm);
  }, [radiusKm]);

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
              patchProfile({ radius_km: val });
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

            {/* P25 25D — OS-permission state (re-prompt / open-settings). Also
                the Maybe-Later re-request path. Renders nothing when granted. */}
            <NotificationPermissionRow />

            {/* Minimum value threshold — P25 25D: DISABLED + "coming soon".
                The NEW_HIGH_VALUE_LEAD type this slider gates has zero server
                implementation in v1 (fenced to 25F/v1.1); an interactive slider
                that changes nothing is a silent lie, so it is visibly inert. */}
            <View className="px-4 py-3 border-b border-zinc-800/50 opacity-50">
              <View className="flex-row justify-between items-center mb-2">
                <Text className="text-zinc-100 text-sm">Minimum Job Value</Text>
                <Text className="font-mono text-zinc-500 text-xs uppercase">
                  Coming soon
                </Text>
              </View>
              <Slider
                accessibilityLabel="Minimum job value tier for new lead notifications (coming soon)"
                disabled
                accessibilityState={{ disabled: true }}
                minimumValue={0}
                maximumValue={2}
                step={1}
                value={costIndex >= 0 ? costIndex : 1}
                minimumTrackTintColor="#52525b"
                maximumTrackTintColor="#3f3f46"
                thumbTintColor="#52525b"
              />
              <View className="flex-row justify-between mt-1">
                <Text className="font-mono text-xs text-zinc-600">Low</Text>
                <Text className="font-mono text-xs text-zinc-600">High</Text>
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
                value={prefs.lifecycle_stalled_pref}
                onValueChange={(v) => updatePref('lifecycle_stalled_pref', v)}
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

        {/* ── Subscription ─────────────────────────────────────────────
            Spec 96 §7 (P26-26C). Hidden for manufacturer accounts
            (account_preset = 'manufacturer') because their access is
            admin-managed and they should never see consumer billing UI.
            Mints a one-off Stripe Customer Portal session per tap via
            usePortalSession. */}
        <ManageSubscriptionRow />

        {/* ── Account Actions ──────────────────────────────────────────
            Spec 93 §5 Step 7. Spec 97 §3 will add Delete Account to this group. */}
        <Text className="font-mono text-xs text-zinc-400 uppercase tracking-wider px-4 pt-6 pb-2 border-t border-zinc-800">
          Account
        </Text>
        <Pressable
          onPress={() => {
            lightImpact();
            void (async () => {
              try {
                await useAuthStore.getState().signOut();
                await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              } catch {
                await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              }
            })();
          }}
          className="px-4 py-4 border-b border-zinc-800/50 active:bg-zinc-900"
          accessibilityRole="button"
          accessibilityLabel="Sign Out"
          testID="sign-out-button"
        >
          <Text className="text-zinc-100 text-sm">Sign Out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
