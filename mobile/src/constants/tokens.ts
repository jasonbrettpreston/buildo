// Industrial Utilitarian design tokens
// Companion to tailwind.config.js — use these for programmatic style values
// (e.g., React Native StyleSheet, map styles, Reanimated color interpolations).

export const COLORS = {
  bgFeed: '#09090b',       // zinc-950 — primary background
  bgCard: '#18181b',       // zinc-900 — card surface
  bgElevated: '#27272a',   // zinc-800 — elevated surfaces
  borderSubtle: '#3f3f46', // zinc-700 — card/divider borders
  textPrimary: '#f4f4f5',  // zinc-100
  textSecondary: '#a1a1aa', // zinc-400
  textMuted: '#71717a',    // zinc-500
  amberHardhat: '#f59e0b', // amber-500 — primary accent
  amberGlow: '#fbbf24',    // amber-400
  redAlert: '#ef4444',     // red-500 — stalled/error
  greenGo: '#22c55e',      // green-500 — work window
} as const;

// Google Maps dark style JSON (used in react-native-maps mapStyleURL or customMapStyle)
export const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#212121' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#212121' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#373737' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3c3c3c' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#000000' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
] as const;
