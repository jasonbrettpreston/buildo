# Phase 3 Frontend Integration - Deep-Dive Review

**Evaluated By:** Antigravity (Google DeepMind Agentic IDE)
**Date:** April 2026

Following the Phase 1 and 2 backend evaluations, this module targets the React state layers, TanStack Query implementations, and the Geolocation bindings defined in Phase 3. 

Overall, the data structures are incredibly defensively coded. `Zustand`'s hydration logic properly falls back to mathematical certainty against localStorage manipulation, and `query-client.ts` enforces the strict `staleTime` and `gcTime` offline-first constraints beautifully.

However, there is an absolute UX-breaking trap inside the Geospatial `useLeadFeed` hook.

---

## 1. CRITICAL: Geospatial Infinite-Scroll Destruction (The "Grid Boundary" Flaw)
**Files Affected:** `useLeadFeed.ts`

**The Bug:**
The current implementation enforces query caching via a 3-decimal rounded precision mapping:
```typescript
function roundCoord(v: number): number {
  return Math.round(v * 1000) / 1000; // Grid blocks of ~110m
}
const queryKey = ['leadFeed', { lat: roundedLat, lng: roundedLng }] as const;
```
The intent was to prevent 1-meter GPS drift from killing the cache. But this creates a rigid coordinate grid overlay. If a user starts scrolling the feed while standing exactly at `lat: 43.1235`, `roundedLat` is `43.124`. If they take **two steps back** across the mathematical boundary to `43.1234`, `roundedLat` becomes `43.123`.

**The Threat:**
When `roundedLat` flips, the TanStack `queryKey` changes. Because `useInfiniteQuery` relies entirely on its `queryKey` to maintain state, crossing this imaginary 110m gridline instantly deletes the user's scroll state. If they were looking at Page 4 of the builder feed, the entire feed will suddenly wipe clean and reset them to the top of Page 1. 
This will happen sporadically just by walking around a construction site, making infinite scrolling fundamentally broken for mobile users.

**The Fix:**
You must detatch continuous device coordinates from the `queryKey`. 
1. The `useLeadFeedState` (Zustand) should manage an explicit "Snapped Cache Coordinate".
2. The `queryKey` simply reads that snapped Zustand coordinate.
3. The "500m Haversine" movement detector is solely responsible for determining when the device has moved far enough to warrant updating that Snapped Coordinate.
This completely removes arbitrary grid-line boundaries and ensures the cache only resets when the user explicitly covers 500 meters of physical real-world distance.

---

## 2. MEDIUM: Double-Execution Query Cancellation Race
**Files Affected:** `useLeadFeed.ts`

**The Bug:**
Inside the 500m movement detector effect:
```typescript
if (moved > FORCED_REFETCH_THRESHOLD_M) {
  void queryClient.cancelQueries({ queryKey: ['leadFeed'] });
  void queryClient.invalidateQueries({ queryKey: ['leadFeed'] });
}
```

**The Threat:**
Because the `queryKey` is fuzzy-matched `['leadFeed']`, `cancelQueries` kills *everything* broadly across the app. In a React 18 strict concurrent rendering (or simply during heavy tab switching), if multiple parameters update synchronously, you effectively cancel in-flight valid queries right as `invalidateQueries` tries to queue them, leading to TanStack getting stuck in a `"fetching"` state while the promise hangs aborted. 

**The Fix:**
Use exact query-key tracking for cancellation, or let TanStack's default `invalidateQueries` behavior handle in-flight abortion logically via the `{ cancelRefetch: true }` property instead of calling them sequentially.

```typescript
void queryClient.invalidateQueries({ 
  queryKey: ['leadFeed'], 
  cancelRefetch: true 
});
```

---

## 3. LOW/INFO: Geolocation Subscription Silencing 
**Files Affected:** `useGeolocation.ts`

**The Bug:**
You perfectly subscribe to the browser's Permission API via `perm.addEventListener('change', onChange)`. But inside the `onChange` event, you only respond to state changes (`granted`, `prompt`, `denied`). 

**The Threat:**
If the user's permission is already `granted` (the steady state), and they walk 5 kilometers, `useGeolocation` does absolutely nothing. The app entirely relies on some secondary mechanism to update the current latitude and longitude. Since you are not utilizing `navigator.geolocation.watchPosition()`, the app's coordinate system requires the user to physically hit the "Refresh Feed" button or force a component remount to ever re-trigger `getCurrentPosition`.

**Conclusion:** 
If the spec specifically mandates pull-to-refresh for location updates, this is fully compliant. But if the design expects the feed to smoothly update while the tradesperson drives around the city, Phase 3 needs to be upgraded to `watchPosition`.
