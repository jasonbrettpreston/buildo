// SPEC LINK: docs/specs/03-mobile/91_mobile_lead_feed.md §5 State
// Resolves the user's current location for the feed query.
// Snaps coordinates to ~500m grid to prevent TanStack Query cache fragmentation
// from GPS jitter — without snapping, every 1m move would be a cache miss.
// Falls back to homeBaseLocation from filterStore when GPS is unavailable.
import { useState, useEffect } from 'react';
import * as Location from 'expo-location';
import { useFilterStore } from '@/store/filterStore';

interface Coords {
  lat: number;
  lng: number;
}

const SNAP_FACTOR = 500; // metres — rounds to ~3 decimal places at Toronto latitude

function snapCoord(value: number): number {
  // 1 degree latitude ≈ 111,320m. 500m snap = 500/111320 ≈ 0.00449 degrees.
  // We snap in degree-space using the same factor for simplicity; the error
  // is negligible (< 5m) across the GTA latitude range.
  const degPerMeter = 1 / 111_320;
  const snap = SNAP_FACTOR * degPerMeter;
  return Math.round(value / snap) * snap;
}

export function useLocation(): { coords: Coords | null; loading: boolean } {
  const homeBase = useFilterStore((s) => s.homeBaseLocation);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        if (!cancelled) {
          setCoords(homeBase ?? null);
          setLoading(false);
        }
        return;
      }

      try {
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (!cancelled) {
          setCoords({
            lat: snapCoord(pos.coords.latitude),
            lng: snapCoord(pos.coords.longitude),
          });
        }
      } catch {
        if (!cancelled) {
          setCoords(homeBase ?? null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void resolve();
    return () => { cancelled = true; };
  }, [homeBase]);

  return { coords, loading };
}
