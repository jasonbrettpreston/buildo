// SPEC LINK: docs/specs/03-mobile/90_mobile_engineering_protocol.md §Phase7
// SPEC LINK: docs/specs/03-mobile/77_mobile_crm_flight_board.md §4.2 (copy + timestamp)
// Animated top banner shown when the device has no network connectivity.
// Renders inline (pushes content down) and animates via Reanimated height+opacity
// so the layout transition is smooth rather than a jarring jump.
//
// Copy is `"Offline · Updated {relative}"` per spec 77 §4.2 — the "when was
// this data last refreshed" context is critical for field users making
// real-money decisions from the cached feed.
//
// Design-audit decision (2026-04-23): banner appears on ALL FOUR pillars
// (Feed, Flight Board, Map, Settings) for cross-pillar consistency.
import { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useNetInfo } from '@react-native-community/netinfo';
import { getLastPersistedAt } from '@/lib/mmkvPersister';

const BANNER_HEIGHT = 36;
const TIMING = { duration: 250, easing: Easing.inOut(Easing.ease) };

// Returns null when no cache exists — caller chooses alternate copy in that case.
function formatRelative(ts: number | null, nowMs: number): string | null {
  if (ts === null) return null;
  const deltaMs = nowMs - ts;
  if (deltaMs < 0) return 'just now';
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function OfflineBanner() {
  const { isConnected } = useNetInfo();
  const offline = isConnected === false;

  const height = useSharedValue(0);
  const opacity = useSharedValue(0);
  // Read the MMKV timestamp on each offline transition so the copy reflects
  // the moment we went offline, not the moment the component mounted.
  const [lastUpdatedLabel, setLastUpdatedLabel] = useState<string | null>(() =>
    formatRelative(getLastPersistedAt(), Date.now()),
  );

  useEffect(() => {
    height.value = withTiming(offline ? BANNER_HEIGHT : 0, TIMING);
    opacity.value = withTiming(offline ? 1 : 0, TIMING);
    if (offline) {
      setLastUpdatedLabel(formatRelative(getLastPersistedAt(), Date.now()));
    }
  }, [offline, height, opacity]);

  const animStyle = useAnimatedStyle(() => ({
    height: height.value,
    opacity: opacity.value,
    overflow: 'hidden',
  }));

  return (
    <Animated.View style={animStyle}>
      <View
        style={{ height: BANNER_HEIGHT }}
        className="bg-zinc-800 border-b border-amber-500/30 flex-row items-center justify-center px-4"
      >
        <Text className="text-amber-400 text-xs font-mono tracking-wider">
          {lastUpdatedLabel
            ? `Offline mode. Last updated ${lastUpdatedLabel}.`
            : 'Offline mode. No cached data.'}
        </Text>
      </View>
    </Animated.View>
  );
}
