# Spec 94 — Mobile Onboarding

**Status:** ACTIVE
**Cross-references:** Spec 77 (Flight Board), Spec 90 (Engineering Protocol), Spec 91 (Lead Feed), Spec 93 (Auth), Spec 95 (User Profiles), Spec 96 (Subscription)

## 1. Goal & User Story

**Goal:** Guide new users through a profession-aware setup flow that configures their feed or tracking experience in under 2 minutes, with zero dead ends and full recoverability from drop-off.
**User Story:** As a plumber downloading the app for the first time, I need to pick my trade, tell the app where I work, and immediately see relevant leads — without answering questions that don't apply to me.

## 2. Technical Architecture (Expo / NativeWind)

**Screen location:** `mobile/app/(onboarding)/` — separate route group, rendered before `(app)/` in the Expo Router `_layout.tsx` AuthGate.

**Onboarding gate:** After Firebase Auth sign-in (Spec 93), `_layout.tsx` checks `user_profiles.onboarding_complete`. If `false`, router redirects to `/(onboarding)/profession`. Onboarding cannot be bypassed.

**Drop-off recovery:** If a user exits mid-onboarding and returns, the app resumes at the last completed step. Step progress stored in MMKV under key `onboarding_step`. On completion, `onboarding_complete = true` is written to `user_profiles` and MMKV key is cleared.

**Incomplete profile banner (defensive):** The hard gate in `_layout.tsx` prevents unauthenticated users from reaching the feed. However, deep links, navigation state races, or future changes could theoretically deliver a user to a feed screen before onboarding completes. As a second-layer defence, if `onboarding_complete = false` AND the user reaches any `(app)` screen, a top banner renders: `bg-amber-500/20 border-b border-amber-500/40 py-2 px-4` — `"Complete your setup to see relevant leads →"` in `text-amber-400 text-sm font-mono`. Tapping resumes onboarding. This banner is intentionally defensive — it handles edge cases the gate should normally prevent.

## 3. Profession & Trade Selection

### 3.1 The Trade List

A single full-screen scrollable list — no profession picker screen. Grouped by category with sticky section headers. 32 trades + Realtor/Real Estate Agent.

```
SITE & STRUCTURE          MECHANICAL & ELECTRICAL
  Excavation                Plumbing
  Shoring                   Plumbing (Drains)
  Demolition                HVAC
  Concrete                  Electrical
  Structural Steel          Fire Protection
  Framing                   Elevator
  Masonry                   Security
  Temporary Fencing         Solar

ENVELOPE & EXTERIOR       INTERIOR FINISHING
  Roofing                   Drywall
  Waterproofing             Painting
  Glazing                   Flooring
  Insulation                Tiling
  Eavestrough & Siding      Trim Work
  Caulking                  Millwork & Cabinetry
                            Stone Countertops

OUTDOOR & SPECIALTY       PROPERTY
  Landscaping               Real Estate Agent
  Decking & Fences
  Pool Installation
```

**Selection:** Single select. Tapping a trade highlights it with an amber border (`border-amber-500`) and enables the "Continue" CTA. Before writing `trade_slug` to the server, the app shows a confirmation step:
> *"You selected [Trade]. This cannot be changed after setup without deleting your account. Continue?"*
> `[ Confirm ]` `[ Go Back ]`

Only after "Confirm" is tapped does the PATCH to `user_profiles.trade_slug` fire. Trade is then **locked permanently** — the API rejects further updates. A user who needs to change trade must delete their account and re-register.

### 3.2 Three Onboarding Paths

Selection routes to one of three paths based on chosen profession:

```
Real Estate Agent  → PATH R (Realtor)
Any trade          → "Leads or tracking?" → PATH L (Leads) or PATH T (Tracking)
```

**Manufacturer accounts:** Do not go through onboarding. They see a holding screen (§3.6) immediately after auth.

---

## 4. Path R — Realtor

**Screens:** Address input → ToS → Feed

**Step 1 — Territory address input**
Full-screen address search using `expo-location` geocoding + manual text input. Realtors always use a fixed location — Live GPS option is not shown.

**Toronto bounds validation:**
- Geocode the entered address
- If coordinates fall outside Toronto bounding box (lat 43.58–43.86, lng −79.64 to −79.12): show warning — *"That address is outside Toronto's permit coverage. Did you mean [nearest Toronto area]?"* — offer the nearest Toronto centroid as a suggestion
- If inside Toronto but imprecise: silently snap to nearest 500m grid point (same `snapCoord` logic as `useLocation.ts`)
- On confirm → write `{ home_base_lat, home_base_lng, location_mode: 'home_base_fixed' }` to `user_profiles`. **`location_mode` must be explicitly written here** — it is required by the Spec 95 server guard for `onboarding_complete: true` and by the DB CHECK constraint.

**Default radius:** Set by Buildo admin per the "realtor" preset — typically 3–5km. Written to `user_profiles.radius_km` from the admin-configured default. Not shown to user during onboarding.

**Step 2 — ToS + Privacy Policy**
Single screen. Two checkboxes (each required): Terms of Service and Privacy Policy. Links open in `expo-web-browser`. Confirmation writes `tos_accepted_at` timestamp to `user_profiles`. CTA: "Start Exploring →"

**Completion:** Write `{ default_tab: 'feed', onboarding_complete: true }` to `user_profiles` (server-side validation: all required fields must be present before server accepts `onboarding_complete = true`). Straight drop to Feed tab. No confirmation screen.

---

## 5. Path L — Tradesperson (Leads)

**Screens:** Leads/Tracking question → Location type → Supplier → ToS → Feed confirmation

**Progress indicator:** 4-dot step bar at top of screen. `bg-amber-500` for completed dots, `bg-zinc-700` for remaining.

**Step 1 — Leads or tracking?**
Two large card options:
```
[ 🎯 Find New Leads        ]   ← routes to Path L
[ 📋 Track Active Projects ]   ← routes to Path T
```

**Step 2 — Location type**
```
[ 📍 Fixed address  ]
[ 🔄 Live GPS feed  ]
```

- **Fixed address:** Address input screen with Toronto bounds validation (same as §4 Path R). Writes `{ home_base_lat, home_base_lng, location_mode: 'home_base_fixed' }` to `user_profiles`. `location_mode` must be written explicitly alongside coordinates (required by server guard and DB CHECK constraint — see Spec 95 §7).
- **Live GPS:** No address input. Writes `{ location_mode: 'gps_live' }` to `user_profiles`. Location resolved automatically on feed load via `useLocation.ts`.

**GPS permission denied (Live GPS path):**
If user denies iOS/Android location permission: show explainer — *"We need location access to show leads near you. Enable in Settings or switch to a fixed address."* — with a deep link to device Settings (`Linking.openSettings()`) and a secondary CTA to go back and choose fixed address instead. Does not apply to realtors (always fixed).

**Step 3 — Main supplier** (skippable)
Single-select list of 4–6 curated suppliers for the user's trade + "Other" text field. Supplier list is trade-specific (seeded in admin). Selection stored in `user_profiles.supplier_selection`. Skipping leaves field null — no consequence. "Skip for now →" link below CTA.

**Step 4 — ToS + Privacy Policy**
Same as §4 Path R Step 2.

**Completion:** One confirmation screen — `bg-zinc-950` full screen:
- Trade badge: `font-mono text-amber-400 text-xs tracking-widest uppercase`
- Copy: *"You're set up. These are active building permits matching your trade, updated daily."*
- CTA: `"See your leads →"` — `bg-amber-500 active:bg-amber-600 rounded-2xl`
- Lands on Feed tab with `default_tab = 'feed'` written to `user_profiles`

**Push notification prompt:** Fires after first lead card renders (not during onboarding). See Spec 97 §2.

---

## 6. Path T — Tradesperson (Tracking)

**Screens:** Leads/Tracking question → Supplier → ToS → Flight Board

**No progress indicator** — the non-linear path selection (Leads/Tracking question → optional first-permit → Supplier → ToS → Flight Board) makes a linear progress bar misleading. Omitted by design.

**Step 1 — Leads or tracking?**
Same card selection as Path L Step 1 → user selects "Track Active Projects."

**Step 2 — Main supplier** (prominent, not buried)
Same single-select supplier screen as Path L Step 3, but presented with more prominence — section header: *"Your supplier is important for project-based leads."* Still skippable.

**Step 3 — Optional: Add first permit**
After supplier, a soft prompt: *"Want to add your first active permit now?"*
- "Yes, search now →" → opens `SearchPermitsSheet` (FAB flow from Spec 77 §3.1) inline within onboarding
- "Skip, I'll do it later →" → continues to ToS

If they add a permit: they land on a populated Flight Board, not the radar empty state.

**Step 4 — ToS + Privacy Policy**
Same as §4 Path R Step 2.

**Completion:** Writes `{ default_tab: 'flight_board', onboarding_complete: true }` to `user_profiles` (server validates required fields present). Straight drop to Flight Board tab. No confirmation screen.

**Push notification prompt:** Fires after first permit is claimed to the flight board (not during onboarding). See Spec 97 §2.

---

## 7. Manufacturer Holding Screen

Manufacturers authenticate via Spec 93 but bypass onboarding entirely. The `_layout.tsx` gate distinguishes manufacturers by checking `account_preset = 'manufacturer'` (not just `onboarding_complete = false`) — a manufacturer without this flag would otherwise be routed into regular onboarding. On first login, if `user_profiles.account_preset = 'manufacturer'` AND `user_profiles.onboarding_complete = false`:

```
┌─────────────────────────────────────┐
│                                     │
│   Your account is being configured. │
│                                     │
│   We'll email you when your         │
│   custom feed is ready.             │
│                                     │
│   [  Contact Buildo  ]              │
│                                     │
└─────────────────────────────────────┘
```

`bg-zinc-950` full screen. When Buildo admin marks the account active, a **notification email** is sent. Push notification is not possible at this stage — the manufacturer has not yet registered a push token (they were firewalled to the holding screen before any token registration could occur). On next app open, the app detects `onboarding_complete = true` and bypasses this screen to land on the configured feed.

---

## 8. Toronto Address Validation

Applies to all fixed-address inputs across all paths.

```
Input address
  → expo-location geocodeAsync()
  → Check bounds: lat 43.58–43.86, lng −79.64 to −79.12
  → Outside bounds:
      Show: "That address is outside Toronto's permit coverage."
      Suggest: nearest Toronto neighbourhood centroid
      User confirms or re-enters
  → Inside bounds:
      snapCoord() to nearest 500m grid (lat/lng)
      Proceed silently — no warning
```

## 9. Design & Interface

### Design Language

Inherits the industrial-utilitarian dark-mode system from `74_lead_feed_design.md`. All surfaces use the shared token palette: `bg-zinc-950` screens · `bg-zinc-900` cards/inputs · `amber-500` primary actions · `zinc-100` primary text · `zinc-400` secondary text.

**Typography:** DM Sans 700 for titles and CTAs · IBM Plex Mono 500 (`font-mono`) for codes, labels, and data values.

**Touch targets:** All interactive elements `min-h-[52px]` (exceeds 44px minimum per Spec 90 §9).

**Motion:** `withTiming(1, { duration: 300, easing: Easing.out(Easing.ease) })` for entry reveals — first arg is the **target value** (1), not the duration · `withSpring({ damping: 20, stiffness: 400 })` for button presses · staggered delays drive multi-element screens.

---

### Screen Specifications

#### Progress Stepper (Path L, 4 steps — shown screens 2–5)

```
● ● ●̊ ○  ←  Complete · Active · Remaining
```

- Complete: `w-2.5 h-2.5 rounded-full bg-amber-500 mx-1.5`
- Active: Two nested Views — outer ring wrapper `w-[18px] h-[18px] rounded-full border border-amber-500/40 items-center justify-center mx-1.5` + inner dot `w-2.5 h-2.5 rounded-full bg-amber-500`. (NativeWind v4 does not support `ring-*` utilities — use a border on a wrapper View instead.)
- Remaining: `w-2.5 h-2.5 rounded-full bg-zinc-700 mx-1.5`
- Container: `flex-row items-center justify-center mt-4 mb-8`
- On step advance: scale pulse on newly-complete dot via `withSequence(withTiming(1.3, { duration: 100 }), withTiming(1.0, { duration: 100 }))` on a `useSharedValue(1)` driving `transform: [{ scale }]`

#### Trade Selection Screen — `profession.tsx`

**Component:** `SectionList` with `stickySectionHeadersEnabled={true}` (required for Android; iOS stickiness is default).

**Section header row:**
```
bg-zinc-900 px-4 py-2 border-b border-zinc-800
```
Label: `font-mono text-[11px] text-zinc-400 uppercase tracking-widest`

**Trade row — unselected:**
```
flex-row items-center justify-between px-4 min-h-[52px]
border-b border-zinc-800/40 active:bg-zinc-800
```

**Trade row — selected:**
```
border-l-[3px] border-amber-500 bg-amber-500/5 pl-3
```
Right slot: amber checkmark `text-amber-500 text-base` · `accessibilityState={{ selected: true }}`

**Trade row — unselected:** `accessibilityState={{ selected: false }}` (explicitly set for both states — VoiceOver reads "not selected" for clarity).

**Sticky "Continue" footer:**
```
absolute bottom-0 w-full bg-zinc-950/95 px-4 pb-safe pt-3 border-t border-zinc-800
```
- `pb-safe` requires the `tailwindcss-safe-area` plugin in `tailwind.config.js` — confirm plugin is installed before using this class (see §9 Component Library Decisions).
- Disabled (no selection): `opacity-40` on CTA button
- Enabled: `bg-amber-500 active:bg-amber-600 rounded-2xl py-4 w-full`
- Label: `text-zinc-950 font-bold text-base text-center`

**Accessibility:** `accessibilityRole="radio"` on each trade row (trade selection is a single-choice set — `radio` is semantically correct over `button`). `accessibilityState={{ selected: true/false }}` on every row (both states must be explicit).

#### Trade Lock Confirmation — `@gorhom/bottom-sheet` v5

`snapPoints={['42%']}` · background `bg-zinc-900 rounded-t-3xl`

- Drag handle: `w-10 h-1 rounded-full bg-zinc-700 self-center mt-3 mb-5`
- Trade name pill: `font-mono text-amber-400 text-xs tracking-widest uppercase bg-amber-500/10 px-3 py-1 rounded-full self-center`
- Warning copy: `text-zinc-400 text-sm text-center mt-3 leading-relaxed`
- Confirm: `bg-amber-500 active:bg-amber-600 rounded-2xl py-4 w-full mt-6` · label `text-zinc-950 font-bold text-base text-center`
- Go Back: `text-zinc-500 text-sm text-center mt-3 min-h-[44px]`

**Note:** Must use `<BottomSheetView>` (not raw `<View>`) as direct child of the sheet — required in `@gorhom/bottom-sheet` v5 for correct layout and keyboard handling. `BottomSheetModalProvider` required at app root (Spec 90 implementation note).

**Haptic on confirm:** Fire `Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)` (from `expo-haptics`) immediately after the user taps "Confirm" and the PATCH succeeds. No haptic on "Go Back".

#### Path Selection Screen — `path.tsx`

Two `Pressable` cards, `gap-4 mx-4`, full-width:

```
bg-zinc-900 border border-zinc-800 rounded-2xl p-6
active:border-amber-500 active:bg-amber-500/5
```

Selected (tap): `border-amber-500 bg-amber-500/5`

Card anatomy:
- Icon/Emoji: `text-4xl text-center mb-3`
- Title: `text-lg font-bold text-zinc-100 text-center`
- Description: `text-sm text-zinc-400 text-center mt-1 leading-relaxed`

#### Address Input Screen — `address.tsx`

Screen: `flex-1 bg-zinc-950`

**Layout:** `KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}` wrapping a `ScrollView`.

**Search field:**
```
bg-zinc-900 border border-zinc-700 rounded-2xl px-4 py-4
text-zinc-100 font-sans text-base
```
`font-sans` (DM Sans) — not `font-mono` — for address input. Address text is natural language, not data. Focused: `border-amber-500` · Placeholder: `text-zinc-600`

**Toronto bounds error:**
```
bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 mt-3
text-amber-400 text-sm leading-relaxed
```

**GPS Live button:**
```
bg-zinc-800 border border-zinc-700 rounded-2xl flex-row items-center
justify-center px-4 py-4 mt-3 gap-3 min-h-[52px]
```
Icon: `text-amber-500` · Label: `text-zinc-100 text-base`

**Permission denied explainer:**
```
bg-red-500/5 border border-red-500/20 rounded-xl px-4 py-3 mt-3
text-red-400 text-sm leading-relaxed
```
"Enable in Settings →": `text-red-400 font-mono text-sm`

#### Supplier Selection Screen — `supplier.tsx`

**Component:** `FlatList numColumns={2}` — FlashList v2 does not yet support `numColumns`.

`columnWrapperStyle={{ gap: 12, paddingHorizontal: 16 }}` — must be inline style object; NativeWind cannot reach `columnWrapperStyle`.

**Supplier card:**
```
bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex-1
active:border-amber-500
```
Selected: `border-amber-500 bg-amber-500/5`

**Skip link:**
```
text-zinc-500 font-mono text-xs text-center mt-6 min-h-[44px] items-center justify-center
```

#### Terms of Service Screen — `terms.tsx`

**Custom checkbox (no library):**
- Unchecked: `w-5 h-5 rounded-md border-2 border-zinc-600`
- Checked: `w-5 h-5 rounded-md bg-amber-500 border-2 border-amber-500` + white `✓` `text-white text-xs font-bold`

**Row:** `flex-row items-start gap-3 mt-4 min-h-[44px]`

**ToS/Privacy links:** `text-amber-400 text-sm underline` → `expo-web-browser`

CTA disabled until both checked: `opacity-40`

CTA enabled: `bg-amber-500 active:bg-amber-600 rounded-2xl py-4 w-full`
Label: `text-zinc-950 font-bold text-base text-center`

#### Completion Screen — Path L (`complete.tsx`)

`bg-zinc-950 flex-1 items-center justify-center px-8`

**Staggered entry** — four `useSharedValue(0)` instances, each driven by `withDelay(N, withTiming(1, { duration: 300, easing: Easing.out(Easing.ease) }))`. The shared value animates FROM 0 TO 1 and drives both `opacity` (0→1) and `transform: [{ translateY: interpolate(sv, [0, 1], [20, 0]) }]` via `useAnimatedStyle`. Note: `withTiming` first arg is the **target value**, not duration — duration is in the config object.

| Element | Delay | Transform |
|---------|-------|-----------|
| Trade badge | 0ms | opacity 0→1 + translateY 20→0 |
| Heading | 80ms | opacity 0→1 + translateY 20→0 |
| Body copy | 160ms | opacity 0→1 + translateY 20→0 |
| CTA | 240ms | opacity 0→1 + translateY 20→0 |

**Haptic on CTA tap:** Fire `Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)` when the CTA is tapped and the PATCH succeeds (`onboarding_complete: true`).

- Badge: `font-mono text-amber-400 text-xs tracking-widest uppercase bg-amber-500/10 px-3 py-1 rounded-full`
- Heading: `text-zinc-100 text-2xl font-bold text-center mt-6`
- Copy: `text-zinc-400 text-sm text-center mt-3 leading-relaxed`
- CTA: `bg-amber-500 active:bg-amber-600 rounded-2xl py-4 w-full mt-10`
- Label: `"See your leads →"` · `text-zinc-950 font-bold text-base text-center`

#### Manufacturer Holding Screen

`bg-zinc-950 flex-1 items-center justify-center px-8`

- Icon: `text-4xl text-zinc-600 text-center mb-6` (building/permit emoji)
- Title: `text-zinc-100 text-xl font-bold text-center`
- Sub-text: `text-zinc-400 text-sm text-center mt-2 leading-relaxed`
- Contact button: `bg-zinc-800 border border-zinc-700 rounded-2xl py-4 px-8 mt-10 min-h-[52px] flex-row items-center justify-center`
- Label: `text-zinc-100 font-bold text-base`

---

### Component Library Decisions

| Concern | Library | Notes |
|---------|---------|-------|
| Trade list sticky headers | `SectionList` (React Native built-in) | `stickySectionHeadersEnabled={true}` required for Android |
| Supplier grid | `FlatList numColumns={2}` | FlashList v2 does not support `numColumns` — use FlatList |
| Confirmation bottom sheet | `@gorhom/bottom-sheet` v5 | Requires `BottomSheetModalProvider` at app root; `BottomSheetView` as direct child |
| Address geocoding | `expo-location` `geocodeAsync()` | No third-party autocomplete — validation only |
| Keyboard handling | `KeyboardAvoidingView` (React Native) | Platform branch: `'padding'` iOS, `'height'` Android |
| Custom checkboxes | Custom `Pressable` | No library — NativeWind makes trivial |
| Entry animations | Reanimated `withTiming` / `withSpring` | `withTiming(targetValue, { duration, easing })` — first arg is target, not duration |
| Safe area insets | `tailwindcss-safe-area` (NW plugin) | Required for `pb-safe` class — must be listed in `tailwind.config.js` plugins array |
| Haptic feedback | `expo-haptics` | `Haptics.notificationAsync(NotificationFeedbackType.Success)` on trade confirm + completion |
| Icons | `lucide-react-native` | PascalCase named components: `<Lock size={N} />`, `<Check size={N} />` — NOT `@expo/vector-icons` Feather |

---

## 10. Implementation

### Cross-Spec Build Order

This spec is step 3 of 5. **Spec 93 AuthGate and Spec 95 PATCH endpoint must exist first** — the onboarding redirect is triggered by the AuthGate, and each step writes to `user_profiles` via PATCH.

```
Spec 95 (DB + API) → Spec 93 (Auth) → Spec 94 (Onboarding) → Spec 96 (Subscription gate) → Spec 97 (Settings)
```

### Build Sequence

**Step 1 — Route group layout**
- File: `mobile/app/(onboarding)/_layout.tsx`
- Stack navigator. On mount: if `onboarding_complete = true` → redirect `/(app)` immediately (handles deep-link edge case mid-onboarding).
- If `account_preset = 'manufacturer'` AND `onboarding_complete = false` → render holding screen (§7); do NOT render regular onboarding flow.
- If GET `/api/user-profile` fails on AuthGate: show full-screen retry — do not default to onboarding or full access (Spec 93 §4 Step 6).

**Step 2 — Coordinate utilities**
- File: `mobile/src/lib/onboarding/snapCoord.ts`
- `snapToGrid(lat, lng, gridMeters = 500)` rounds coordinates to nearest 500m grid point.
- `isInsideToronto(lat, lng)` checks bounds: lat 43.58–43.86, lng −79.64 to −79.12.
- **Post-snap re-validation:** after snapping, call `isInsideToronto` again. If the snap pushed the coordinate outside bounds (edge case near the boundary), fall back to the pre-snap validated coordinate rather than the out-of-bounds snapped result.
- Shared by `useLocation.ts` (extract if duplicated) and all onboarding address screens.

**Step 3 — Trade selection screen**
- File: `mobile/app/(onboarding)/profession.tsx`
- `<SectionList>` with 6 sticky category headers. 32 trades + Realtor. `stickySectionHeadersEnabled={true}` (required for Android). No `useEffect` for data — trade list is static JSON (Spec 90 §5).
- Section header: `bg-zinc-900 px-4 py-2 border-b border-zinc-800` · `font-mono text-[11px] text-zinc-400 uppercase tracking-widest`
- Row unselected: `flex-row items-center justify-between px-4 min-h-[52px] border-b border-zinc-800/40 active:bg-zinc-800` · `accessibilityRole="radio"` · `accessibilityState={{ selected: false }}`
- Row selected: add `border-l-[3px] border-amber-500 bg-amber-500/5 pl-3` · amber checkmark right (`<Check size={16} color="#f59e0b" />` from `lucide-react-native`) · `accessibilityState={{ selected: true }}`
- Sticky footer CTA: `absolute bottom-0 w-full bg-zinc-950/95 px-4 pb-safe pt-3 border-t border-zinc-800` · button `opacity-40` when disabled, `bg-amber-500 active:bg-amber-600 rounded-2xl py-4` when enabled. `pb-safe` requires `tailwindcss-safe-area` plugin.
- After selection, tapping "Continue" opens trade lock confirmation bottom sheet (`@gorhom/bottom-sheet` v5, `snapPoints={['42%']}`). PATCH fires only after user confirms. See §9 Design & Interface for full sheet spec.
- **PATCH idempotency:** If the `trade_slug` PATCH succeeds on the server but the client doesn't receive the success response (network drop), the user will retry and the PATCH will be rejected by the trade immutability guard with a 400. To prevent this dead end, the server must apply idempotency: if the incoming `trade_slug` value equals the existing value in `user_profiles`, return 200 (treat as success) rather than 400. This makes the retry safe without relaxing the guard for genuine change attempts.
- Realtor taps → confirm sheet → skip `path.tsx`, go directly to `address.tsx`. Tradesperson → confirm → `path.tsx`.

**Step 4 — Path selection screen**
- File: `mobile/app/(onboarding)/path.tsx`
- Two full-width `<Pressable>` cards: "Find New Leads" → Path L (`address.tsx`), "Track Active Projects" → Path T (`supplier.tsx`).
- Card: `bg-zinc-900 border border-zinc-800 rounded-2xl p-6 mx-4 active:border-amber-500 active:bg-amber-500/5`
- Card anatomy: emoji `text-4xl text-center mb-3` · title `text-lg font-bold text-zinc-100 text-center` · description `text-sm text-zinc-400 text-center mt-1 leading-relaxed`
- Cards separated by `gap-4`. Screen: `flex-1 bg-zinc-950 justify-center px-0`
- No "Continue" CTA — tapping the card navigates immediately.

**Step 5 — Address input screen**
- File: `mobile/app/(onboarding)/address.tsx`
- `expo-location` `geocodeAsync()` on submitted text. **Empty-array guard:** `geocodeAsync` returns `[]` (not null/error) when the address yields no results — check `results.length === 0` before accessing `results[0]` and show the user "Address not found — please try again." Run `snapCoord.ts`. Outside Toronto bounds → show warning + nearest neighbourhood centroid suggestion. Inside bounds → snap silently. On confirm: PATCH `{ home_base_lat, home_base_lng, location_mode: 'home_base_fixed' }`. **`location_mode` is required in this PATCH** — it satisfies both the Spec 95 server guard and the DB CHECK constraint.
- **Live GPS path:** On selection → PATCH `{ location_mode: 'gps_live' }` immediately before navigating to supplier step. This ensures `location_mode` is written even if the user drops off before reaching the completion screen.
- Layout: `KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}` wrapping `ScrollView`
- Text input: `bg-zinc-900 border border-zinc-700 rounded-2xl px-4 py-4 text-zinc-100 font-sans text-base` · focused `border-amber-500` · placeholder `text-zinc-600`. Use `font-sans` (DM Sans) — not `font-mono` — for address input.
- Toronto bounds error: `bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 mt-3 text-amber-400 text-sm leading-relaxed`
- GPS Live button: `bg-zinc-800 border border-zinc-700 rounded-2xl flex-row items-center justify-center px-4 py-4 mt-3 gap-3 min-h-[52px]`
- GPS permission denied (Live GPS path): `bg-red-500/5 border border-red-500/20 rounded-xl px-4 py-3 mt-3 text-red-400 text-sm` + `Linking.openSettings()` link + secondary CTA to switch to fixed address.

**Step 6 — Supplier selection screen**
- File: `mobile/app/(onboarding)/supplier.tsx`
- `GET /api/onboarding/suppliers?trade={slug}` — **requires authentication** (Bearer token). TanStack Query `useQuery` — no `useEffect` fetch (Spec 90 §5).
- **Empty list fallback:** if no suppliers seeded for the trade, screen auto-skips (treated as "Skip for now →"). Do not show an empty list.
- Layout: `FlatList numColumns={2}` — FlashList v2 does not support `numColumns`. `columnWrapperStyle={{ gap: 12, paddingHorizontal: 16 }}` (inline style — NativeWind cannot reach `columnWrapperStyle`).
- Supplier card: `bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex-1 active:border-amber-500` · selected `border-amber-500 bg-amber-500/5`
- "Other" text field: `bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-zinc-100 font-mono text-sm mt-3` below the grid
- Skip link: `text-zinc-500 font-mono text-xs text-center mt-6 min-h-[44px] items-center justify-center`
- "Skip for now →" leaves `supplier_selection` null. On confirm: PATCH `{ supplier_selection }`.

**Step 7 — Terms of Service screen**
- File: `mobile/app/(onboarding)/terms.tsx`
- Two required checkboxes (ToS + Privacy Policy). Links open `expo-web-browser`. CTA disabled until both checked. On confirm: PATCH `{ tos_accepted_at: new Date().toISOString() }`.
- Custom checkbox component (no library): unchecked `w-5 h-5 rounded-md border-2 border-zinc-600` · checked `bg-amber-500 border-amber-500` + white `✓` `text-white text-xs font-bold`
- Checkbox row: `flex-row items-start gap-3 mt-4 min-h-[44px]`
- Link text: `text-amber-400 text-sm underline`
- CTA disabled: `opacity-40` · enabled: `bg-amber-500 active:bg-amber-600 rounded-2xl py-4 w-full` · label `text-zinc-950 font-bold text-base text-center`

**Step 7b — GET /api/onboarding/suppliers endpoint**
- File: `src/app/api/onboarding/suppliers/route.ts`
- Authenticated route (Firebase Bearer token — same auth as all mobile API routes). Query param: `trade` (slug string).
- Returns `{ data: { suppliers: string[] } }` — an ordered list of supplier names for the given trade. List is seeded in the admin panel and fetched from a `trade_suppliers` config table (or similar admin-managed data store). If no suppliers are seeded for the trade, returns `{ data: { suppliers: [] } }` — the client auto-skips the supplier screen on empty array (Spec 94 §10 Step 6).
- No POST/PATCH — supplier list is admin-managed only.
- Try-catch + `logError`. Route guard: classify as `authenticated` (not admin-only).
- **Test:** `src/tests/onboarding-suppliers.infra.test.ts` — returns 200 with list for known trade; returns empty array for unknown trade (not 404); returns 401 for unauthenticated request.

**Step 8 — First permit screen (Path T only)**
- File: `mobile/app/(onboarding)/first-permit.tsx`
- Inline reuse of `SearchPermitsSheet` from Spec 77 §3.1. "Skip, I'll do it later →" navigates to `terms.tsx`. On successful claim: fire `successNotification()` haptic (Spec 92 §4.3).

**Step 9 — Completion screen (Path L only)**
- File: `mobile/app/(onboarding)/complete.tsx`
- Layout: `bg-zinc-950 flex-1 items-center justify-center px-8`
- Staggered entry: four `useSharedValue(0)` instances, each driven by `withDelay(N, withTiming(1, { duration: 300, easing: Easing.out(Easing.ease) }))` — delays 0ms, 80ms, 160ms, 240ms. `useAnimatedStyle` drives `opacity: [0→1]` + `transform: [{ translateY: interpolate(sv, [0, 1], [20, 0]) }]`. `withTiming` first arg = target value (1), not duration.
- Trade badge: `font-mono text-amber-400 text-xs tracking-widest uppercase bg-amber-500/10 px-3 py-1 rounded-full`
- Heading: `text-zinc-100 text-2xl font-bold text-center mt-6`
- Copy: `text-zinc-400 text-sm text-center mt-3 leading-relaxed`
- CTA: `bg-amber-500 active:bg-amber-600 rounded-2xl py-4 w-full mt-10` · label `"See your leads →"` `text-zinc-950 font-bold text-base text-center`
- On tap: PATCH `{ default_tab: 'feed', onboarding_complete: true }` → navigate `/(app)/(tabs)`.

**Step 10 — Path T completion (no screen)**
- In `terms.tsx` confirm handler for Path T: PATCH `{ default_tab: 'flight_board', location_mode: 'gps_live', onboarding_complete: true }` → navigate `/(app)/(tabs)/flight-board`.
- **Why `location_mode: 'gps_live'`:** Path T skips the address/GPS step entirely (§6). `location_mode` is required by the Spec 95 server guard for `onboarding_complete: true` and by the DB CHECK constraint. GPS Live is the correct default for tracking-path users — they follow active projects at job sites rather than scouting from a fixed territory. The server will also write `trial_started_at + subscription_status='trial'` atomically in this same PATCH (Spec 96 Step 4 preferred approach).

**Step 11 — Drop-off recovery**
- File: `mobile/src/store/onboardingStore.ts`
- Zustand store persisted to MMKV under key `onboarding_step`. **MMKV step key advances only after the PATCH for that step succeeds** — not on screen entry. This prevents the local state from getting ahead of the server if a network request fails mid-step. On PATCH failure: show a retry toast, keep the user on the current screen, do not advance MMKV.
- Cleared when `onboarding_complete = true` is confirmed by the server. On re-launch with `onboarding_complete = false`: AuthGate resumes at stored step. If MMKV is empty (new install or cleared): start from beginning (`/(onboarding)/profession`).

**Server-side `onboarding_complete` guard:** The PATCH endpoint accepts `onboarding_complete: true` only when all required fields (`trade_slug`, `location_mode`, `tos_accepted_at`) are present in the profile row. Clients cannot short-circuit the flow by sending `onboarding_complete: true` with an otherwise empty profile.

### Testing Gates

- **Unit:** `mobile/__tests__/onboarding.test.ts` — `snapToGrid` inside bounds snaps to 500m grid; `isInsideToronto` outside bounds returns false; trade selection enforces single-select; `onboardingStore` MMKV persistence writes correct step key.
- **Maestro:** `mobile/maestro/onboarding-leads.yaml` — Path L E2E: profession → path → GPS selection → supplier skip → ToS → confirm → feed visible with lead cards.
- **Maestro:** `mobile/maestro/onboarding-tracking.yaml` — Path T: profession → path → supplier → first-permit add → ToS → flight board visible.

---

## 11. Operating Boundaries

**Target files:**
- `mobile/app/(onboarding)/` — new route group
- `mobile/app/_layout.tsx` — onboarding gate check
- `mobile/src/store/filterStore.ts` — location mode + home base writes
- `mobile/src/components/onboarding/` — new components

**Out of scope:**
- Settings-based profile editing post-onboarding (Spec 97)
- Team/org join code flow — Phase 2
- Builder permit-sharing PIN — Phase 2

**Cross-spec dependencies:**
- Spec 77 §3.1 — `SearchPermitsSheet` reused in Path T optional permit step
- Spec 90 §4 — stack constraints apply throughout
- Spec 91 — lead feed is the destination for Paths L and R
- Spec 95 — all onboarding writes land in `user_profiles`
- Spec 96 — `subscription_status` check determines if manufacturer sees holding screen
