// SPEC LINK: docs/specs/03-mobile/92_mobile_engagement_hardware.md §4.1
//
// Push token registration and contextual permission flow.
// NEVER calls requestPermissionsAsync on cold boot — only after the user's
// first save action (double-permission pattern per spec §4.1).
// MMKV gate: hasAskedPermission prevents re-showing the pre-prompt.
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { createMMKV } from 'react-native-mmkv';
import { fetchWithAuth } from '@/lib/apiClient';

const mmkv = createMMKV({ id: 'push-tokens' });

const PUSH_TOKEN_KEY = 'expo_push_token';
const HAS_ASKED_KEY = 'hasAskedPermission';

export function hasAskedPermission(): boolean {
  return mmkv.getBoolean(HAS_ASKED_KEY) ?? false;
}

export function markAskedPermission(): void {
  mmkv.set(HAS_ASKED_KEY, true);
}

export async function registerPushToken(): Promise<void> {
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  if (!projectId) return;

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;

  const stored = mmkv.getString(PUSH_TOKEN_KEY);
  if (stored === token) return; // no change — skip re-registration

  await fetchWithAuth('/api/notifications/register', {
    method: 'POST',
    body: JSON.stringify({ push_token: token, platform: getPlatform() }),
  });

  mmkv.set(PUSH_TOKEN_KEY, token);
}

export async function requestPermissionAndRegister(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return false;
  await registerPushToken();
  return true;
}

function getPlatform(): 'ios' | 'android' {
  return Platform.OS === 'ios' ? 'ios' : 'android';
}
