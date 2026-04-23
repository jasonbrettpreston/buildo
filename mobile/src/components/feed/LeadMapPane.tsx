// SPEC LINK: docs/specs/03-mobile/91_mobile_lead_feed.md §4.2 LeadMapPane
// Phase-color-coded circle markers. Amber = early phases P1-P7,
// green = mid P8-P14, zinc = late P15-P20 / unknown.
// V1: individual markers (capped at 50 to prevent native frame drops).
// V2 scope: react-native-maps-super-cluster for 1000+ permit datasets.
import React, { useRef, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Tab-bar height (kept in sync with (app)/_layout.tsx). Overflow pill sits above it.
const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 83 : 60;
import MapView, { Marker, Region, MapType } from 'react-native-maps';
import type { PermitLeadFeedItem } from '@/lib/schemas';

// Marker cap: individual markers beyond this count degrade frame rate
// in RN maps without clustering. V2 raises this with SuperCluster.
const MARKER_CAP = 50;

type PhaseColor = '#f59e0b' | '#22c55e' | '#71717a';

const EARLY_PHASES = new Set(['P1','P2','P3','P4','P5','P6','P7a','P7b','P7c','P7d']);
const MID_PHASES = new Set(['P8','P9','P10','P11','P12','P13','P14']);

function phaseColor(phase: string | null): PhaseColor {
  if (!phase) return '#71717a';
  if (EARLY_PHASES.has(phase)) return '#f59e0b'; // amber-500
  if (MID_PHASES.has(phase)) return '#22c55e';   // green-500
  return '#71717a'; // zinc-500 — late or terminal
}

// iOS dark map style — matches the Industrial Utilitarian zinc-950 background.
// Android uses mapType="standard" with custom JSON style applied via <MapView customMapStyle>.
const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#0a0a0a' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#71717a' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0a0a0a' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#27272a' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#3f3f46' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#52525b' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#18181b' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];

interface Props {
  permits: PermitLeadFeedItem[];
  initialRegion: Region;
  onRegionChangeComplete?: (region: Region) => void;
  onMarkerPress: (item: PermitLeadFeedItem) => void;
}

function LeadMapPaneInner({ permits, initialRegion, onRegionChangeComplete, onMarkerPress }: Props) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();

  // Clear pending debounce on unmount to prevent firing into an unmounted component.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleRegionChange = useCallback(
    (region: Region) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onRegionChangeComplete?.(region);
      }, 400);
    },
    [onRegionChangeComplete],
  );

  // Only markers with valid coordinates
  const mappableAll = permits.filter((p) => p.latitude !== null && p.longitude !== null);
  const mappablePermits = mappableAll.slice(0, MARKER_CAP);
  const overflowCount = mappableAll.length - mappablePermits.length;

  return (
    <View style={StyleSheet.absoluteFillObject}>
      <MapView
        style={StyleSheet.absoluteFillObject}
        initialRegion={initialRegion}
        customMapStyle={DARK_MAP_STYLE}
        mapType="standard"
        onRegionChangeComplete={handleRegionChange}
        showsUserLocation
        showsMyLocationButton={false}
      >
        {mappablePermits.map((item, index) => {
          const color = phaseColor(item.lifecycle_phase);
          return (
            <Marker
              key={item.lead_id}
              testID={`map-marker-${index}`}
              coordinate={{
                latitude: item.latitude as number,
                longitude: item.longitude as number,
              }}
              onPress={() => onMarkerPress(item)}
              tracksViewChanges={false}
            >
              <View style={[styles.markerOuter, { borderColor: color }]}>
                <View style={[styles.markerInner, { backgroundColor: color }]} />
              </View>
            </Marker>
          );
        })}
      </MapView>

      {/* Overflow indicator — honestly tells the user that the 50-marker cap
          is in play, and directs them to zoom in for the rest. Positioned
          above the (absolute-positioned) tab bar + home indicator, otherwise
          the pill would be invisible on the Map screen. */}
      {overflowCount > 0 && (
        <View
          pointerEvents="none"
          style={[
            styles.overflowPill,
            { bottom: TAB_BAR_HEIGHT + insets.bottom + 12 },
          ]}
          accessibilityRole="text"
          accessibilityLabel={`Showing ${MARKER_CAP} of ${mappableAll.length} permits. Zoom in to see more.`}
        >
          <Text style={styles.overflowText}>
            Showing {MARKER_CAP} of {mappableAll.length} · zoom in
          </Text>
        </View>
      )}
    </View>
  );
}

// React.memo bailout — 50 markers re-mounting on every filter-sheet toggle
// is the single biggest Android scroll-jank source we have.
export const LeadMapPane = React.memo(LeadMapPaneInner);

const styles = StyleSheet.create({
  markerOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  markerInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  overflowPill: {
    position: 'absolute',
    left: 16,
    backgroundColor: 'rgba(24,24,27,0.95)',
    borderColor: 'rgba(245,158,11,0.4)',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  overflowText: {
    color: '#fbbf24',
    fontSize: 11,
    fontFamily: 'Menlo',
    letterSpacing: 0.3,
  },
});
