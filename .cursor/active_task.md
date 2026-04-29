# Active Task: Spec 94 Mobile Onboarding — Full Flow Implementation
**Status:** Implementation Complete
**Workflow:** WF1 — Genesis
**Domain Mode:** Cross-Domain — modifies `mobile/` Expo source AND `src/app/api/` Next.js route. Read `.claude/domain-crossdomain.md` before implementation.

---

## Context

* **Goal:** Implement the complete onboarding flow for Buildo mobile — trade selection with lock confirmation, path branching (Leads / Tracking / Realtor), location setup (fixed address or Live GPS), supplier selection, ToS acceptance, and completion routing. Includes drop-off recovery via MMKV, manufacturer holding screen, incomplete-profile defensive banner, the `GET /api/onboarding/suppliers` backend endpoint with migration, and the `_layout.tsx` AuthGate extension for onboarding routing.

* **Target Spec:** `docs/specs/03-mobile/94_mobile_onboarding.md`

* **Cross-spec dependencies:**
  - Spec 77 §3.1 — `SearchPermitsSheet` reused in Path T optional permit step (`first-permit.tsx`). If Spec 77 not yet built, stub with skip-only CTA and `// TODO Spec 77` comment.
  - Spec 90 §4 — stack constraints apply throughout (FlashList ban for numColumns, NativeWind ring limitation, pb-safe via NativeWind built-in)
  - Spec 91 — lead feed is the destination after Path L and Path R completion
  - Spec 92 §4.3 — `successNotification()` haptic from `mobile/src/lib/haptics.ts` on permit claim in `first-permit.tsx`
  - Spec 95 — all onboarding PATCH calls write to `user_profiles` via `/api/user-profile`. Spec 95 must own the endpoint; onboarding screens call it via `fetchWithAuth`. The AuthGate extension stubs the server check using local `onboardingStore.isComplete` (MMKV) — full GET /api/user-profile integration is Spec 95's job.
  - Spec 96 — `subscription_status` and `account_preset` fields come from Spec 95 user_profiles. Manufacturer gate stubs on `account_preset === 'manufacturer'`.

* **Key Files:**

  NEW — mobile screens:
  - `mobile/app/(onboarding)/_layout.tsx`
  - `mobile/app/(onboarding)/profession.tsx`
  - `mobile/app/(onboarding)/path.tsx`
  - `mobile/app/(onboarding)/address.tsx`
  - `mobile/app/(onboarding)/supplier.tsx`
  - `mobile/app/(onboarding)/terms.tsx`
  - `mobile/app/(onboarding)/complete.tsx`
  - `mobile/app/(onboarding)/first-permit.tsx`
  - `mobile/app/(onboarding)/manufacturer-hold.tsx`

  NEW — mobile stores and libs:
  - `mobile/src/store/onboardingStore.ts`
  - `mobile/src/lib/onboarding/snapCoord.ts`
  - `mobile/src/lib/onboarding/tradeData.ts`

  NEW — mobile components:
  - `mobile/src/components/onboarding/ProgressStepper.tsx`
  - `mobile/src/components/onboarding/IncompleteBanner.tsx`

  NEW — tests and E2E:
  - `mobile/__tests__/onboarding.test.ts`
  - `mobile/maestro/onboarding-leads.yaml`
  - `mobile/maestro/onboarding-tracking.yaml`

  NEW — backend:
  - `migrations/042_trade_suppliers.sql`
  - `src/app/api/onboarding/suppliers/route.ts`
  - `src/tests/onboarding-suppliers.infra.test.ts`

  MODIFY:
  - `mobile/app/_layout.tsx` — extend AuthGate with onboarding routing matrix
  - `mobile/src/store/filterStore.ts` — add `locationMode` field + `setLocationMode` action
  - `mobile/src/store/authStore.ts` — add `onboardingStore.reset()` to sign-out sequence
  - `mobile/package.json` — add `lucide-react-native` to `transformIgnorePatterns`
  - `mobile/__tests__/schemas.test.ts` — update AuthGate assertions after routing matrix change
  - `mobile/app/(app)/_layout.tsx` — inject `IncompleteBanner` (if file exists)

---

## Technical Implementation

### New/Modified Components

| Component | Purpose |
|-----------|---------|
| `(onboarding)/_layout.tsx` | Stack navigator; manufacturer gate; onboarding-complete redirect |
| `profession.tsx` | SectionList trade picker (33 items, 6 sticky categories); trade-lock BottomSheet v5; PATCH on confirm |
| `path.tsx` | Two Pressable cards (Leads / Tracking); immediate nav on tap; no Continue CTA |
| `address.tsx` | expo-location geocodeAsync + snapCoord bounds check; GPS Live path with permission-denied explainer; KeyboardAvoidingView |
| `supplier.tsx` | TanStack Query useQuery; FlatList numColumns={2} (NOT FlashList); auto-skip on empty list |
| `terms.tsx` | Custom Pressable checkboxes; expo-web-browser links; dual completion handler (Path L → complete.tsx; Path T → flight board) |
| `complete.tsx` | Staggered Reanimated entry (4 elements, 0/80/160/240ms); haptic on CTA; PATCH `onboarding_complete: true` |
| `first-permit.tsx` | Inline SearchPermitsSheet (Spec 77 §3.1 stub or live); successNotification() on claim |
| `manufacturer-hold.tsx` | bg-zinc-950 holding screen; mailto contact link |
| `ProgressStepper.tsx` | 4-dot stepper (complete/active/remaining); Reanimated scale pulse on dot advance |
| `IncompleteBanner.tsx` | Defensive banner for (app) screens; reads onboardingStore.isComplete |

### Data Hooks/Libs

- **`onboardingStore.ts`** — Zustand v5 + MMKV persist (key: `onboarding`). Fields: `currentStep`, `selectedTrade`, `selectedTradeName`, `selectedPath`, `locationMode`, `homeBaseLat`, `homeBaseLng`, `supplierSelection`, `isComplete`. Step key advances ONLY after PATCH succeeds — NOT on screen entry.
- **`snapCoord.ts`** — `isInsideToronto(lat, lng)`, `snapToGrid(lat, lng, gridMeters=500)` with post-snap re-validation, `getNearestTorontoCentroid(lat, lng)`. Extracts and refines the `snapCoord` logic already in `useLocation.ts` (shared utility, no duplication).
- **`tradeData.ts`** — Static `TRADE_SECTIONS` typed for SectionList. 6 categories, 33 items (32 canonical trade slugs + realtor).
- **`filterStore.ts`** — Add `locationMode: 'home_base_fixed' | 'gps_live' | null` + `setLocationMode` action + update `reset()`.

### Database Impact

YES — Migration 042: `trade_suppliers` table.

```sql
CREATE TABLE trade_suppliers (
  id           SERIAL PRIMARY KEY,
  trade_slug   VARCHAR(64) NOT NULL,
  name         TEXT NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  active       BOOLEAN NOT NULL DEFAULT true
);
CREATE INDEX idx_trade_suppliers_slug ON trade_suppliers(trade_slug) WHERE active = true;
```

Seed: 4–6 suppliers per trade slug (well-known Toronto/Ontario suppliers by category). No FK constraints — decoupled from Spec 95 `user_profiles` changes. Migration is non-destructive; no existing tables altered.

---

## Standards Compliance

* **Try-Catch Boundary:** `GET /api/onboarding/suppliers/route.ts` wraps handler body in try-catch → `{ error: 'Failed to load suppliers' }` + 500 on DB error. `logError('onboarding-suppliers', err, { trade })` in catch per §00 §6.1.
* **Unhappy Path Tests:** `onboarding-suppliers.infra.test.ts` — 200 with list; 200 with empty array on unknown trade (NOT 404); 401 for unauthenticated request; 400 for missing `trade` param. Unit tests: `snapToGrid` boundary + post-snap re-validation; `isInsideToronto` outside-bounds; MMKV step advancement only on PATCH success; single-select enforcement.
* **logError Mandate:** Catch block in suppliers route uses `logError`. Catch blocks in mobile PATCH calls use `console.error` (RN client — no server-side logError).
* **UI Layout:** Mobile-first. Expo NativeWind. All interactive elements `min-h-[52px]` (Spec 90 §9, exceeds 44px minimum). `pb-safe` via NativeWind built-in (safe-area context) — do NOT add `tailwindcss-safe-area` to plugins array (already reverted in Spec 93 Step 0; NativeWind v4 provides `pb-safe` natively).

---

## Execution Plan

### Step 0 — Pre-flight

- [ ] All required packages verified in `mobile/package.json`: `expo-location` ~19.0.8 ✅, `expo-web-browser` ~15.0.11 ✅, `lucide-react-native` ~1.8.0 ✅, `@gorhom/bottom-sheet` ^5.2.10 ✅, `react-native-reanimated` ~4.1.1 ✅, `expo-haptics` ~15.0.8 ✅, `@tanstack/react-query` ^5.99.2 ✅, `react-native-mmkv` ^4.3.1 ✅, `zustand` ^5.0.12 ✅
- [ ] **`lucide-react-native` missing from `transformIgnorePatterns`** — add to `mobile/package.json` jest config to prevent ESM failures. This is a prerequisite bug fix.
- [ ] No new `npm install` required.
- [ ] Read `.claude/domain-crossdomain.md` before writing any code.

---

### Step 1 — Migration 042: `trade_suppliers` table

- [ ] File: `migrations/042_trade_suppliers.sql`
- [ ] CREATE TABLE + index (schema above)
- [ ] Seed INSERT statements: 4–6 suppliers per trade slug for all 32 trade slugs. Use real Ontario-market suppliers per category: plumbing/drain-plumbing: Ferguson, Wolseley, Consolidated Pipe; hvac: Wesco, Lennox, York; electrical: Rexel, Anixter, Nedco; framing/structural-steel/concrete: Stella-Jones, Atlas, Lafarge; roofing: BP Canada, IKO, GAF; etc.
- [ ] Realtor ('realtor' slug): no suppliers — empty seed (auto-skip handled by client)

---

### Step 2 — `onboardingStore.ts`

- [ ] File: `mobile/src/store/onboardingStore.ts`
- [ ] SPEC LINK: `docs/specs/03-mobile/94_mobile_onboarding.md §10 Step 11`
- [ ] Interface `OnboardingState`:
  - `currentStep: 'profession' | 'path' | 'address' | 'supplier' | 'terms' | 'complete' | null`
  - `selectedTrade: string | null` (slug)
  - `selectedTradeName: string | null` (display label for completion screen)
  - `selectedPath: 'leads' | 'tracking' | 'realtor' | null`
  - `locationMode: 'home_base_fixed' | 'gps_live' | null`
  - `homeBaseLat: number | null`
  - `homeBaseLng: number | null`
  - `supplierSelection: string | null`
  - `isComplete: boolean`
- [ ] Actions: `setStep`, `setTrade(slug, name)`, `setPath`, `setLocation({ mode, lat?, lng? })`, `setSupplier(name | null)`, `markComplete()` (sets `isComplete: true`, clears `currentStep`), `reset()` (full clear to initial state)
- [ ] Zustand `persist` middleware → MMKV storage (same pattern as `filterStore.ts`, key: `onboarding`)
- [ ] **Invariant comment:** step key advances ONLY after the PATCH for that step returns 200. Not on screen mount.
- [ ] `reset()` is called by `authStore.signOut()` — wire in Step 22 of this plan.

---

### Step 3 — `snapCoord.ts` coordinate utilities

- [ ] File: `mobile/src/lib/onboarding/snapCoord.ts`
- [ ] SPEC LINK: `docs/specs/03-mobile/94_mobile_onboarding.md §8, §10 Step 2`
- [ ] `export const TORONTO_BOUNDS = { latMin: 43.58, latMax: 43.86, lngMin: -79.64, lngMax: -79.12 }`
- [ ] `export function isInsideToronto(lat: number, lng: number): boolean`
- [ ] `export function snapToGrid(lat: number, lng: number, gridMeters = 500): { lat: number; lng: number }`:
  - `degPerMeter = 1 / 111_320`, `snap = gridMeters * degPerMeter`
  - Round lat and lng independently: `Math.round(value / snap) * snap`
  - **Post-snap re-validation:** after snapping, call `isInsideToronto` on snapped result. If snapped coord falls outside bounds (edge case at boundary), return the pre-snap coordinate.
- [ ] `export function getNearestTorontoCentroid(lat: number, lng: number): { name: string; lat: number; lng: number }`:
  - 5 hardcoded centroids: Downtown (43.6532, -79.3832), North York (43.7615, -79.4111), Scarborough (43.7731, -79.2576), Etobicoke (43.6435, -79.5652), East York (43.6878, -79.3163)
  - Returns nearest centroid using Euclidean distance in degree-space (sufficient precision for Toronto)

---

### Step 4 — `tradeData.ts` static trade list

- [ ] File: `mobile/src/lib/onboarding/tradeData.ts`
- [ ] SPEC LINK: `docs/specs/03-mobile/94_mobile_onboarding.md §3.1`
- [ ] `export type TradeItem = { label: string; slug: string }`
- [ ] `export const TRADE_SECTIONS: Array<{ title: string; data: TradeItem[] }>` — 6 sections matching Spec 94 §3.1:
  - **SITE & STRUCTURE** (8): Excavation (excavation), Shoring (shoring), Demolition (demolition), Concrete (concrete), Structural Steel (structural-steel), Framing (framing), Masonry (masonry), Temporary Fencing (temporary-fencing)
  - **MECHANICAL & ELECTRICAL** (8): Plumbing (plumbing), Plumbing (Drains) (drain-plumbing), HVAC (hvac), Electrical (electrical), Fire Protection (fire-protection), Elevator (elevator), Security (security), Solar (solar)
  - **ENVELOPE & EXTERIOR** (6): Roofing (roofing), Waterproofing (waterproofing), Glazing (glazing), Insulation (insulation), Eavestrough & Siding (eavestrough-siding), Caulking (caulking)
  - **INTERIOR FINISHING** (7): Drywall (drywall), Painting (painting), Flooring (flooring), Tiling (tiling), Trim Work (trim-work), Millwork & Cabinetry (millwork-cabinetry), Stone Countertops (stone-countertops)
  - **OUTDOOR & SPECIALTY** (3): Landscaping (landscaping), Decking & Fences (decking-fences), Pool Installation (pool-installation)
  - **PROPERTY** (1): Real Estate Agent (realtor)
- [ ] Total: 33 items across 6 sections

---

### Step 5 — `filterStore.ts` — add `locationMode`

- [ ] MODIFY: `mobile/src/store/filterStore.ts`
- [ ] SPEC LINK: `docs/specs/03-mobile/94_mobile_onboarding.md §5 Step 2, §6 Step 4`
- [ ] Add `locationMode: 'home_base_fixed' | 'gps_live' | null` to `FilterState` interface
- [ ] Add `setLocationMode: (mode: 'home_base_fixed' | 'gps_live' | null) => void` action
- [ ] Update `reset()` to include `locationMode: null`
- [ ] Initialize `locationMode: null` in default state
- [ ] **Note:** `useLocation.ts` gating on `locationMode` (skipping GPS request when `home_base_fixed`) is deferred — `useLocation.ts` is out of scope for Spec 94.

---

### Step 6 — `(onboarding)/_layout.tsx` — route group layout

- [ ] File: `mobile/app/(onboarding)/_layout.tsx`
- [ ] SPEC LINK: `docs/specs/03-mobile/94_mobile_onboarding.md §10 Step 1`
- [ ] Stack navigator, all screens `headerShown: false`
- [ ] Stack screens: `profession`, `path`, `address`, `supplier`, `terms`, `complete`, `first-permit`, `manufacturer-hold`
- [ ] On mount guard (`useEffect`): read `onboardingStore.isComplete`. If `true` → `router.replace('/(app)/')` (deep-link safety)
- [ ] Read `authStore.user?.account_preset`. If `account_preset === 'manufacturer'` AND `!isComplete` → `router.replace('/(onboarding)/manufacturer-hold')` (stub: field is undefined until Spec 95 wires it)

---

### Step 7 — `_layout.tsx` AuthGate extension

- [ ] MODIFY: `mobile/app/_layout.tsx`
- [ ] SPEC LINK: `docs/specs/03-mobile/94_mobile_onboarding.md §2, §10 Step 1`
- [ ] Add `const isOnboardingComplete = useOnboardingStore((s) => s.isComplete)` per-field selector
- [ ] Add `const inOnboardingGroup = segments[0] === '(onboarding)'`
- [ ] **Full 5-branch routing matrix** (replaces binary signed-in/out):
  1. `!user && !inAuthGroup` → `router.replace('/(auth)/sign-in')`
  2. `user && inAuthGroup && !isOnboardingComplete` → `router.replace('/(onboarding)/profession')`
  3. `user && inAuthGroup && isOnboardingComplete` → `router.replace('/(app)/')` + `registerPushToken()`
  4. `user && inOnboardingGroup && isOnboardingComplete` → `router.replace('/(app)/')` (completed user deep-linked into onboarding)
  5. `user && !inAuthGroup && !inOnboardingGroup && !isOnboardingComplete` → `router.replace('/(onboarding)/profession')` (hard gate)
- [ ] **`registerPushToken()` call:** move exclusively to branch 3 (signed in AND onboarding complete). Do NOT register push tokens during onboarding — Spec 92 §4.1 requires contextual permission timing after first lead save.
- [ ] Add `isOnboardingComplete` to the effect dep array
- [ ] Update `TODO Spec 95` comment to reflect new stub approach
- [ ] After modifying: run `mobile/__tests__/schemas.test.ts` and fix any broken AuthGate assertions

---

### Step 8 — `profession.tsx` — trade selection screen

- [ ] File: `mobile/app/(onboarding)/profession.tsx`
- [ ] SPEC LINK: `docs/specs/03-mobile/94_mobile_onboarding.md §3, §9 Design, §10 Step 3`
- [ ] State: `selectedTrade: TradeItem | null`, `showConfirmSheet: boolean`, `isPatching: boolean`, `patchError: string | null`
- [ ] `<SectionList data={TRADE_SECTIONS} stickySectionHeadersEnabled={true}>`
- [ ] `renderSectionHeader`: `bg-zinc-900 px-4 py-2 border-b border-zinc-800` container, `font-mono text-[11px] text-zinc-400 uppercase tracking-widest` label
- [ ] `renderItem`: `Pressable` with `flex-row items-center justify-between px-4 min-h-[52px] border-b border-zinc-800/40 active:bg-zinc-800`, `accessibilityRole="radio"`, **`accessibilityState={{ selected: isSelected }}` explicit on BOTH selected AND unselected rows** (VoiceOver reads "not selected" for clarity)
  - Selected: additionally `border-l-[3px] border-amber-500 bg-amber-500/5 pl-3`; right slot: `<Check size={16} color="#f59e0b" />` from `lucide-react-native`
- [ ] Sticky footer: `absolute bottom-0 w-full bg-zinc-950/95 px-4 pb-safe pt-3 border-t border-zinc-800`
  - CTA disabled (no selection): button `opacity-40`; enabled: `bg-amber-500 active:bg-amber-600 rounded-2xl py-4 w-full`; label `text-zinc-950 font-bold text-base text-center` — "Continue"; tap opens confirmation BottomSheet
- [ ] Trade lock BottomSheet (v5): `snapPoints={['42%']}`, `enablePanDownToClose`, `backgroundStyle={{ backgroundColor: '#18181b' }}`, `<BottomSheetView>` as direct child (required in v5)
  - Drag handle: `w-10 h-1 rounded-full bg-zinc-700 self-center mt-3 mb-5`
  - Trade name pill: `font-mono text-amber-400 text-xs tracking-widest uppercase bg-amber-500/10 px-3 py-1 rounded-full self-center`
  - Warning copy: `text-zinc-400 text-sm text-center mt-3 leading-relaxed`
  - Confirm CTA: `bg-amber-500 active:bg-amber-600 rounded-2xl py-4 w-full mt-6` · label `text-zinc-950 font-bold text-base text-center`
  - Go Back: `text-zinc-500 text-sm text-center mt-3 min-h-[44px]` — no haptic
- [ ] **On Confirm tap:**
  1. `await fetchWithAuth('/api/user-profile', { method: 'PATCH', body: JSON.stringify({ trade_slug }) })`
  2. On ApiError 400 where body contains idempotency signal (trade already set to same value): treat as success
  3. On success: `Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)` → `onboardingStore.setTrade(slug, name)` → `onboardingStore.setStep('path' | 'address')` → `filterStore.setTradeSlug(slug)` → close sheet → navigate
  4. On other error: `setPatchError(message)` — keep user on sheet
- [ ] Navigation: `slug === 'realtor'` → `onboardingStore.setPath('realtor')` + `router.push('/(onboarding)/address')`; tradesperson → `router.push('/(onboarding)/path')`

---

### Step 9 — `path.tsx` — path selection screen

- [ ] File: `mobile/app/(onboarding)/path.tsx`
- [ ] SPEC LINK: `docs/specs/03-mobile/94_mobile_onboarding.md §5 Step 1, §6 Step 1, §9 Design, §10 Step 4`
- [ ] Screen: `flex-1 bg-zinc-950 justify-center px-0`
- [ ] Two full-width `Pressable` cards with `gap-4 mx-4`: `bg-zinc-900 border border-zinc-800 rounded-2xl p-6 active:border-amber-500 active:bg-amber-500/5`
- [ ] Card anatomy: emoji `text-4xl text-center mb-3`; title `text-lg font-bold text-zinc-100 text-center`; description `text-sm text-zinc-400 text-center mt-1 leading-relaxed`
- [ ] "🎯 Find New Leads" → `onboardingStore.setPath('leads')` → `router.push('/(onboarding)/address')`
- [ ] "📋 Track Active Projects" → `onboardingStore.setPath('tracking')` → `router.push('/(onboarding)/supplier')`
- [ ] No Continue CTA — card tap navigates immediately
- [ ] No PATCH — path selection is client-side only (server learns path via `default_tab` on completion)
- [ ] `<ProgressStepper currentStep={1} totalSteps={4} />` at top

---

### Step 10 — `address.tsx` — location input screen

- [ ] File: `mobile/app/(onboarding)/address.tsx`
- [ ] SPEC LINK: `docs/specs/03-mobile/94_mobile_onboarding.md §4 Step 1, §5 Step 2, §8, §9 Design, §10 Step 5`
- [ ] State: `inputText`, `isGeocoding`, `boundsError: string | null`, `nearestCentroid`, `permissionDenied`, `isPatching`
- [ ] Read `onboardingStore.selectedPath` — hide GPS Live button when `selectedPath === 'realtor'`
- [ ] Layout: `<KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>` wrapping `<ScrollView>`
- [ ] Address text input: `bg-zinc-900 border border-zinc-700 rounded-2xl px-4 py-4 text-zinc-100 text-base`; focused: `border-amber-500`; placeholder `text-zinc-600`. **`font-sans` (DM Sans) — NOT `font-mono`. Address text is natural language.**
- [ ] **Geocoding flow:**
  1. `const results = await Location.geocodeAsync(inputText)`
  2. **Empty-array guard:** `if (results.length === 0)` → show "Address not found — please try again." (do NOT access `results[0]`)
  3. Take `results[0].latitude / longitude`
  4. `if (!isInsideToronto(lat, lng))`: set `boundsError` + `nearestCentroid = getNearestTorontoCentroid(lat, lng)`
  5. Else: `const snapped = snapToGrid(lat, lng)` → on confirm → PATCH `{ home_base_lat: snapped.lat, home_base_lng: snapped.lng, location_mode: 'home_base_fixed' }`
- [ ] Toronto bounds error banner: `bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 mt-3 text-amber-400 text-sm leading-relaxed`; nearest centroid suggestion button below
- [ ] **On fixed address PATCH success:** `onboardingStore.setLocation({ mode: 'home_base_fixed', lat: snapped.lat, lng: snapped.lng })` → `filterStore.setHomeBaseLocation({ lat, lng })` → `filterStore.setLocationMode('home_base_fixed')` → `onboardingStore.setStep('supplier')` → `router.push('/(onboarding)/supplier')`
- [ ] GPS Live button (hidden for Realtor): `bg-zinc-800 border border-zinc-700 rounded-2xl flex-row items-center justify-center px-4 py-4 mt-3 gap-3 min-h-[52px]`; icon `text-amber-500`
- [ ] **GPS Live flow:** `requestForegroundPermissionsAsync()` → if denied: `setPermissionDenied(true)`; if granted: PATCH `{ location_mode: 'gps_live' }` (BEFORE navigating — ensures `location_mode` is written even on drop-off) → `onboardingStore.setLocation({ mode: 'gps_live' })` → `filterStore.setLocationMode('gps_live')` → `onboardingStore.setStep('supplier')` → `router.push('/(onboarding)/supplier')`
- [ ] GPS permission denied: `bg-red-500/5 border border-red-500/20 rounded-xl px-4 py-3 mt-3 text-red-400 text-sm`; "Enable in Settings →" → `Linking.openSettings()`; secondary "Use a fixed address instead" → `setPermissionDenied(false)`
- [ ] ProgressStepper: `currentStep={2} totalSteps={4}` for Path L only; Path R (Realtor) has no stepper

---

### Step 11 — `supplier.tsx` — supplier selection screen

- [ ] File: `mobile/app/(onboarding)/supplier.tsx`
- [ ] SPEC LINK: `docs/specs/03-mobile/94_mobile_onboarding.md §5 Step 3, §6 Step 2, §9 Design, §10 Step 6`
- [ ] TanStack Query: `useQuery({ queryKey: ['onboarding-suppliers', tradeSlug], queryFn: () => fetchWithAuth<{ data: { suppliers: string[] } }>('/api/onboarding/suppliers?trade=' + tradeSlug), enabled: !!tradeSlug })`
- [ ] **Empty list auto-skip:** `useEffect(() => { if (!isLoading && suppliers.length === 0) router.replace('/(onboarding)/terms'); }, [isLoading, suppliers])`
- [ ] `<FlatList numColumns={2}>` — NOT FlashList (FlashList v2 does not support `numColumns` per Spec 90 §4)
- [ ] `columnWrapperStyle={{ gap: 12, paddingHorizontal: 16 }}` — **inline style object, NOT NativeWind class** (NativeWind cannot reach `columnWrapperStyle`)
- [ ] Supplier card: `bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex-1 active:border-amber-500`; selected: `border-amber-500 bg-amber-500/5`
- [ ] "Other" text input below grid: `bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-zinc-100 font-mono text-sm mt-3`; typing clears card selection
- [ ] Skip link: `text-zinc-500 font-mono text-xs text-center mt-6 min-h-[44px] items-center justify-center`; tap → `onboardingStore.setStep('terms')` → `router.push('/(onboarding)/terms')` (no PATCH — `supplier_selection` remains null)
- [ ] Confirm CTA: `bg-amber-500 active:bg-amber-600 rounded-2xl py-4 w-full min-h-[52px]`; PATCH `{ supplier_selection }` → `onboardingStore.setSupplier(name)` → `onboardingStore.setStep('terms')` → `router.push('/(onboarding)/terms')`
- [ ] Path T section header: `text-zinc-100 font-bold text-sm mb-4` — *"Your supplier is important for project-based leads."* (more prominent than Path L)
- [ ] ProgressStepper: `currentStep={3} totalSteps={4}` for Path L only; Path T has no stepper

---

### Step 12 — `terms.tsx` — ToS + Privacy Policy screen

- [ ] File: `mobile/app/(onboarding)/terms.tsx`
- [ ] SPEC LINK: `docs/specs/03-mobile/94_mobile_onboarding.md §4 Step 2, §5 Step 4, §6 Step 4, §9 Design, §10 Step 7`
- [ ] State: `tosChecked`, `privacyChecked`, `isLoading`, `errorMessage`
- [ ] Custom checkbox (no library): unchecked `w-5 h-5 rounded-md border-2 border-zinc-600`; checked `w-5 h-5 rounded-md bg-amber-500 border-2 border-amber-500` + `<Text className="text-white text-xs font-bold text-center">✓</Text>`
- [ ] Checkbox row: `flex-row items-start gap-3 mt-4 min-h-[44px]`
- [ ] ToS/Privacy links: `text-amber-400 text-sm underline` → `WebBrowser.openBrowserAsync(URL)`
- [ ] CTA disabled until `tosChecked && privacyChecked`: `opacity-40`; enabled: `bg-amber-500 active:bg-amber-600 rounded-2xl py-4 w-full`; label `text-zinc-950 font-bold text-base text-center`
- [ ] **Confirm handler — dual completion path:**
  1. PATCH `{ tos_accepted_at: new Date().toISOString() }`
  2. Read `onboardingStore.selectedPath`
  3. **Path L / Path R:** on success → `router.push('/(onboarding)/complete')`
  4. **Path T:** on success → PATCH `{ default_tab: 'flight_board', location_mode: 'gps_live', onboarding_complete: true }` → on success: `onboardingStore.markComplete()` → `filterStore.setLocationMode('gps_live')` → `router.replace('/(app)/flight-board')`
  - **Why `location_mode: 'gps_live'` in Path T final PATCH:** Path T skips the address/GPS step (§6). `location_mode` is required by the Spec 95 server guard for `onboarding_complete: true` and by the DB CHECK constraint. GPS Live is the correct default for tracking-path users who follow active projects at job sites.
  5. On PATCH error: `setErrorMessage('Setup failed. Please try again.')` — do NOT advance step, do NOT call `markComplete()`
- [ ] ProgressStepper: `currentStep={4} totalSteps={4}` for Path L only

---

### Step 13 — `complete.tsx` — Path L / Path R completion screen

- [ ] File: `mobile/app/(onboarding)/complete.tsx`
- [ ] SPEC LINK: `docs/specs/03-mobile/94_mobile_onboarding.md §5 Completion, §9 Design, §10 Step 9`
- [ ] Layout: `bg-zinc-950 flex-1 items-center justify-center px-8`
- [ ] **Staggered Reanimated entry** — four `useSharedValue(0)` instances (sv0–sv3):
  - `sv0.value = withDelay(0,   withTiming(1, { duration: 300, easing: Easing.out(Easing.ease) }))`
  - `sv1.value = withDelay(80,  withTiming(1, { duration: 300, easing: Easing.out(Easing.ease) }))`
  - `sv2.value = withDelay(160, withTiming(1, { duration: 300, easing: Easing.out(Easing.ease) }))`
  - `sv3.value = withDelay(240, withTiming(1, { duration: 300, easing: Easing.out(Easing.ease) }))`
  - **CRITICAL:** `withTiming(1, { duration: 300 })` — first arg is TARGET VALUE (1), NOT duration. Duration is in config object.
  - Each `useAnimatedStyle`: `opacity: sv.value`, `transform: [{ translateY: interpolate(sv.value, [0, 1], [20, 0]) }]`
- [ ] Elements in delay order: (0ms) Trade badge pill; (80ms) Heading; (160ms) Body copy; (240ms) CTA button
  - Badge: `font-mono text-amber-400 text-xs tracking-widest uppercase bg-amber-500/10 px-3 py-1 rounded-full` — shows `onboardingStore.selectedTradeName`
  - Heading: `text-zinc-100 text-2xl font-bold text-center mt-6` — *"You're set up."*
  - Copy: `text-zinc-400 text-sm text-center mt-3 leading-relaxed`
  - CTA: `bg-amber-500 active:bg-amber-600 rounded-2xl py-4 w-full mt-10`; label `"See your leads →"` `text-zinc-950 font-bold text-base text-center`
- [ ] **On CTA tap:**
  1. PATCH `{ default_tab: 'feed', onboarding_complete: true }`
  2. On success: `Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)` → `onboardingStore.markComplete()` → `router.replace('/(app)/')`
  3. On error: show inline error message; do NOT call `markComplete()`

---

### Step 14 — `first-permit.tsx` — Path T optional permit step

- [ ] File: `mobile/app/(onboarding)/first-permit.tsx`
- [ ] SPEC LINK: `docs/specs/03-mobile/94_mobile_onboarding.md §6 Step 3, §10 Step 8; Spec 77 §3.1`
- [ ] Check if `SearchPermitsSheet` exists (Grep for `SearchPermitsSheet` in `mobile/src/`). If not built (Spec 77 not yet implemented): stub with skip-only path + `// TODO Spec 77: wire SearchPermitsSheet when built`
- [ ] "Skip, I'll do it later →": `text-zinc-500 font-mono text-xs text-center mt-6 min-h-[44px]` → `router.push('/(onboarding)/terms')`
- [ ] On successful claim: `successNotification()` from `@/lib/haptics` → `router.push('/(onboarding)/terms')`

---

### Step 15 — `manufacturer-hold.tsx`

- [ ] File: `mobile/app/(onboarding)/manufacturer-hold.tsx`
- [ ] SPEC LINK: `docs/specs/03-mobile/94_mobile_onboarding.md §7, §9 Design`
- [ ] `bg-zinc-950 flex-1 items-center justify-center px-8`
- [ ] Building emoji (style prop for color, not NativeWind — emoji color is not CSS-controllable), Title, Sub-text per §9 Design spec
- [ ] Contact button: `bg-zinc-800 border border-zinc-700 rounded-2xl py-4 px-8 mt-10 min-h-[52px]`; tap → `WebBrowser.openBrowserAsync('mailto:support@buildo.app')`

---

### Step 16 — `ProgressStepper.tsx` component

- [ ] File: `mobile/src/components/onboarding/ProgressStepper.tsx`
- [ ] SPEC LINK: `docs/specs/03-mobile/94_mobile_onboarding.md §9 Design — Progress Stepper`
- [ ] Props: `currentStep: number` (1-indexed), `totalSteps: number`
- [ ] Complete dot: `Animated.View` with `w-2.5 h-2.5 rounded-full bg-amber-500 mx-1.5`
- [ ] Active dot: outer `View` `w-[18px] h-[18px] rounded-full border border-amber-500/40 items-center justify-center mx-1.5` + inner `View` `w-2.5 h-2.5 rounded-full bg-amber-500` (**NativeWind v4 does not support `ring-*` — use border on wrapper View**)
- [ ] Remaining dot: `w-2.5 h-2.5 rounded-full bg-zinc-700 mx-1.5`
- [ ] Container: `flex-row items-center justify-center mt-4 mb-8`
- [ ] **Scale pulse on newly-complete dot:** one `useSharedValue(1)` per dot. On `currentStep` change: dot at `currentStep - 1` fires `withSequence(withTiming(1.3, { duration: 100 }), withTiming(1.0, { duration: 100 }))`. Drive `transform: [{ scale: sv }]` on `Animated.View`.

---

### Step 17 — `IncompleteBanner.tsx` component

- [ ] File: `mobile/src/components/onboarding/IncompleteBanner.tsx`
- [ ] SPEC LINK: `docs/specs/03-mobile/94_mobile_onboarding.md §2 Incomplete profile banner`
- [ ] Reads `useOnboardingStore((s) => s.isComplete)` — returns `null` if `isComplete === true`
- [ ] `<Pressable onPress={() => router.push('/(onboarding)/profession')} className="bg-amber-500/20 border-b border-amber-500/40 py-2 px-4">`
- [ ] `<Text className="text-amber-400 text-sm font-mono">Complete your setup to see relevant leads →</Text>`
- [ ] Inject at top of `mobile/app/(app)/_layout.tsx` if that file exists; otherwise note as deferred

---

### Step 18 — `GET /api/onboarding/suppliers` endpoint

- [ ] File: `src/app/api/onboarding/suppliers/route.ts`
- [ ] SPEC LINK: `docs/specs/03-mobile/94_mobile_onboarding.md §10 Step 7b`
- [ ] Handler body wrapped in try-catch (§00 §2.2)
- [ ] `getUserIdFromSession(request)` → 401 if null
- [ ] Query param: `trade` — 400 if missing or empty
- [ ] DB query (parameterized): `SELECT name FROM trade_suppliers WHERE trade_slug = $1 AND active = true ORDER BY display_order ASC`
- [ ] Returns `{ data: { suppliers: string[] } }` — empty array (not 404) for unknown trade
- [ ] Catch: `logError('onboarding-suppliers', err, { trade })` → `{ error: 'Failed to load suppliers' }` + 500
- [ ] Add `/api/onboarding/suppliers` to `AUTHENTICATED_API_ROUTES` in route-guard

---

### Step 19 — `onboarding-suppliers.infra.test.ts`

- [ ] File: `src/tests/onboarding-suppliers.infra.test.ts`
- [ ] SPEC LINK: `docs/specs/03-mobile/94_mobile_onboarding.md §10 Step 7b Testing Gates`
- [ ] 200 with non-empty supplier list for known trade (e.g., `plumbing`)
- [ ] 200 with empty array for unknown trade (not 404)
- [ ] 401 without auth header
- [ ] 400 for missing `trade` query param

---

### Step 20 — `mobile/__tests__/onboarding.test.ts` unit tests

- [ ] File: `mobile/__tests__/onboarding.test.ts`
- [ ] SPEC LINK: `docs/specs/03-mobile/94_mobile_onboarding.md §10 Testing Gates`
- [ ] Mock `react-native-mmkv`, `@/lib/apiClient`, `expo-location`
- [ ] `snapToGrid` tests: result passes `isInsideToronto`; coordinates are multiples of grid increment; boundary coord does not snap outside bounds (post-snap re-validation)
- [ ] `isInsideToronto` tests: `(43.6532, -79.3832)` → true; `(43.2, -79.3)` → false; `(43.8601, -79.3)` → false (just above latMax); `(43.58, -79.64)` → true (exact corner)
- [ ] `onboardingStore` tests: `setStep` stores correctly; `markComplete()` sets `isComplete: true` + `currentStep: null`; `reset()` returns all nulls + `isComplete: false`; `setTrade('plumbing', 'Plumbing')` sets both slug and name
- [ ] Trade single-select: selecting A then B → `selectedTrade === 'b'`

---

### Step 21 — Maestro E2E flows

- [ ] `mobile/maestro/onboarding-leads.yaml` — Path L: launchApp → tap Plumbing → Continue → Confirm → Find New Leads → address/GPS → skip supplier → check both ToS boxes → CTA → assert "See your leads →" → tap → assert feed visible
- [ ] `mobile/maestro/onboarding-tracking.yaml` — Path T: tap Structural Steel → Confirm → Track Active Projects → skip supplier → skip first-permit → check both ToS → CTA → assert flight board visible

---

### Step 22 — `authStore.ts` — add `onboardingStore.reset()` to sign-out

- [ ] MODIFY: `mobile/src/store/authStore.ts`
- [ ] In `signOut()`, after `filterStore.reset()` and `notificationStore.reset()`: call `useOnboardingStore.getState().reset()`
- [ ] Import `useOnboardingStore` from `@/store/onboardingStore`

---

### Step 23 — Multi-agent code review (WF6 gate)

Three parallel agents, `isolation: "worktree"`. Spec input: `docs/specs/03-mobile/94_mobile_onboarding.md`.

1. **Code Reviewer:** PII in PATCH payloads; `fetchWithAuth` generic types; missing try-catch in PATCH call sites; `accessibilityRole="radio"` + `accessibilityState` on ALL rows (both states explicit); `withTiming` first-arg is target not duration; `columnWrapperStyle` is inline style not NativeWind; `lucide-react-native` import pattern; dead code.

2. **Spec Compliance Reviewer:** All 3 paths (L/T/R) implemented; all edge cases: empty geocode array guard; post-snap re-validation; GPS permission denied + `Linking.openSettings()`; PATCH idempotency on trade slug; empty supplier list auto-skip; Path T `location_mode: 'gps_live'` in final PATCH from `terms.tsx`; manufacturer gate; `IncompleteBanner` injection; `registerPushToken` only in post-onboarding branch; `supplier.tsx` FlatList not FlashList; progress stepper Path L only (screens 2–5); no stepper Path T/R.

3. **Logic Reviewer:** `onboardingStore` step advances only on PATCH 200 (not screen mount, not skip); AuthGate 5-branch matrix complete; `onboardingStore.reset()` in `authStore.signOut()`; `registerPushToken` not called during onboarding; Path T `terms.tsx` writes correct fields; `complete.tsx` only calls `markComplete()` after PATCH success; `isInsideToronto` boundary conditions correct.

- [ ] Triage → fix FAIL items before commit
- [ ] Deferred items → `docs/reports/review_followups.md`

---

### Step 24 — Test + typecheck gate

- [ ] `cd mobile && npx jest --testPathPattern="onboarding|schemas" --ci`
- [ ] `npx jest --run src/tests/onboarding-suppliers.infra.test.ts` (root workspace)
- [ ] `cd mobile && npm run typecheck`
- [ ] `npm run typecheck` (root workspace)
- [ ] All must pass before commit

---

### Step 25 — Commit

- [ ] `feat(94_mobile_onboarding): WF1 full onboarding flow — trade selection, paths L/T/R, drop-off recovery`

---

## Deferred / Out of Scope

- `useLocation.ts` gating on `locationMode` (skip GPS request when `home_base_fixed`) — Spec 97
- Admin panel UI for managing `trade_suppliers` table — Phase 2
- Team/org join code flow — Phase 2
- Builder permit-sharing PIN — Phase 2
- Settings-based profile editing post-onboarding — Spec 97
- Full AuthGate GET `/api/user-profile` server check (5-outcome profile check) — Spec 95
- `account_preset` field from `authStore.user` (undefined until Spec 95 wires user_profiles hydration into auth store)
