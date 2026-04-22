# Buildo Mobile Engineering Rules
**Version:** 1.0 — 2026-04-22
**Applies to:** Expo (React Native) tradesperson client

---

## 1. Architecture — "Dumb Glass" Pattern

The mobile app is a **display layer only**. It MUST NOT perform:
- Data mutation, aggregation, or sorting beyond UI-level reordering
- PostGIS math (ST_DWithin, distance calculations, radius filters)
- Business logic (lead scoring, phase classification, cost estimation)
- Write operations to the backend database directly

**All computation lives in the Next.js API backend.** The mobile app fetches pre-calculated, ranked, paginated results and renders them.

> If you find yourself calculating something complex on the phone, move it to an API route.

---

## 2. Stack — Required Libraries (No Substitutions)

| Concern | Library | Rule |
|---------|---------|------|
| Framework | **Expo (React Native)** | Managed workflow. No bare ejection without approval. |
| UI Styling | **NativeWind** | Tailwind-compatible utility classes for RN. Mobile-first only — no desktop breakpoints. |
| Server State / Data Fetching | **TanStack Query (`@tanstack/react-query`)** | NEVER use `useEffect` for API calls. All fetching goes through `useQuery`/`useMutation`. |
| Client / UI State | **Zustand** | Filter state, saved lead UI state, location preference. NEVER use React Context for global state. |
| Forms | **React Hook Form + Zod resolver** | NEVER use `useState` for form fields. Every user input form must have a Zod schema. |
| Offline persistence | **TanStack Query Persist Client + MMKV** | 24h cache. Key normalization on lat/lng to ~3 decimals to avoid cache fragmentation. |
| Notifications | **Expo Notifications** | Push token registered on auth. Background handler MUST not render UI. |
| Navigation | **Expo Router** | File-based routing. Type-safe `href` via generated types. |
| Haptics | **`expo-haptics`** | `impactAsync(Light)` on card tap. `notificationAsync(Success)` on save. No custom haptic loops. |
| Error tracking | **Sentry** (`@sentry/react-native`) | Wired into root `_layout.tsx`. Source maps uploaded on build. |
| Telemetry | **PostHog** | Every user interaction (`onPress`, `onSubmit`) MUST call `captureEvent()`. |

---

## 3. Data Fetching Rules

### 3.1 TanStack Query is mandatory
```ts
// ✅ Correct
const { data, isLoading } = useQuery({
  queryKey: ['lead-feed', tradeSlug, lat, lng, radiusKm],
  queryFn: () => fetchLeadFeed({ tradeSlug, lat, lng, radiusKm }),
});

// ❌ Never do this
useEffect(() => {
  fetch('/api/leads/feed').then(...);
}, [lat, lng]);
```

### 3.2 No prop-drilling or Context for server data
Components that need server data MUST call the relevant `useQuery` hook directly. Do not fetch in a parent and pass via props through more than one layer.

### 3.3 Coordinate debouncing
All queries that depend on device coordinates MUST debounce the lat/lng values before triggering a refetch:
- **Map pan/zoom:** 400ms debounce minimum
- **GPS update:** 500m movement threshold before refetch
- **Reason:** Raw GPS jitter causes 10-30 refetches/minute without this guard.

### 3.4 Query key normalization
Round lat/lng to 3 decimal places (~110m precision) in all query keys to maximize cache hit rate:
```ts
const normLat = Math.round(lat * 1000) / 1000;
const normLng = Math.round(lng * 1000) / 1000;
```

### 3.5 Rate-limit handling (HTTP 429)
The backend enforces per-minute rate limits on `/api/leads/feed` and `/api/leads/view` (see `_contracts.json → rate_limits`). When a request returns 429:
- **Read the `Retry-After` header** (value is seconds). Back off for exactly that duration before retrying.
- **Do NOT retry immediately** — a tight retry loop will exhaust the limit and extend the lockout window.
- **Surface a user-visible message** ("Too many requests — retrying in X seconds") rather than silently failing or showing a generic error.
```ts
// Example in queryFn
if (response.status === 429) {
  const retryAfter = Number(response.headers.get('Retry-After') ?? 60);
  throw new RateLimitError(retryAfter);
}
```
TanStack Query's `retry` callback receives the error — inspect the type and pass `retryDelay` accordingly.

### 3.6 CORS — production vs. Expo web preview
The Next.js API backend allows requests from the production Expo app bundle (native fetch uses the device HTTP stack, no CORS restrictions). **Expo web preview** (`npx expo start --web`) runs in a browser and IS subject to CORS. During local development against the Next.js dev server:
- The dev server (`localhost:3000`) already allows `localhost` origins.
- Do NOT add `Access-Control-Allow-Origin: *` to production API routes to fix a local web-preview CORS error — fix the local config instead.
- For CI or staging web-preview builds, set `EXPO_PUBLIC_API_BASE_URL` to the appropriate origin and configure CORS headers in `next.config.js` scoped to that origin only.

---

## 4. Performance Rules

### 4.1 No heavy map rendering loops
- Use `react-native-maps` cluster markers for groups of 5+ leads in view
- NEVER render raw `<Marker>` for each of 50+ leads simultaneously
- Viewport-cull leads outside the visible map region before rendering

### 4.2 List virtualization
Any list expected to exceed 20 items MUST use `FlashList` (`@shopify/flash-list`). NEVER `.map()` directly into a `ScrollView` for lead lists.

### 4.3 Image handling
All remote images MUST use `expo-image` (not `<Image>` from RN core). Set `contentFit="cover"` and specify explicit `width`/`height` to prevent layout shift.

### 4.4 Bundle size
- No client-side PostGIS or geospatial libraries (turf.js, etc.) — use the backend
- No lodash — use native JS methods
- Run `npx expo-bundle-analyzer` before each release

---

## 5. Authentication

- **Firebase Auth** — `signInWithEmailAndPassword` or Google OAuth via `expo-auth-session`
- **Token header** — Every authenticated API call MUST include `Authorization: Bearer <idToken>` (not cookies — mobile clients don't share browser cookie jars)
- **Token refresh** — Use `onIdTokenChanged()` listener to refresh automatically. NEVER cache the raw ID token for longer than 55 minutes.
- **Logout** — `signOut()` + clear TanStack Query cache + clear Zustand state

---

## 6. Offline Behaviour

- Lead feed is cached for 24 hours via TanStack Query Persist Client (MMKV backend)
- Cached leads are displayed with a "Last updated X ago" banner when offline
- Mutations (save lead, record view) MUST queue via TanStack Query `useMutation` with optimistic updates and background retry
- Never show an error screen for stale-cache reads — show data + staleness indicator

---

## 7. Security Rules

1. **No secrets in the app bundle** — Firebase public config only. Admin SDK keys, DB credentials stay server-side.
2. **No `dangerouslySetInnerHTML` equivalent** — Do not use `<WebView>` to render user-generated HTML.
3. **Certificate pinning** — Enforce for production API calls via `expo-build-properties`.
4. **Deep link validation** — All `expo-router` deep links MUST validate params with Zod before use.

---

## 8. Release Checklist

Before every TestFlight / internal track submission:
- [ ] `expo-updates` OTA channel set to `production`
- [ ] Sentry source maps uploaded (`npx sentry-expo-upload-sourcemaps`)
- [ ] PostHog `capture_pageview` on root layout
- [ ] `npx expo-bundle-analyzer` — main bundle < 2MB
- [ ] Lighthouse Mobile score ≥ 85 (via Expo web preview)
- [ ] All `useQuery` calls have `staleTime` and `gcTime` set explicitly
- [ ] No `console.log` in committed code
