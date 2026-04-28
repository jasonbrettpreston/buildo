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

**Incomplete profile banner:** If `onboarding_complete = false` AND the user somehow reaches the feed (edge case), a top banner renders: `bg-amber-500/20 border-b border-amber-500/40 py-2 px-4` — `"Complete your setup to see relevant leads →"` in `text-amber-400 text-sm font-mono`. Tapping resumes onboarding.

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

**Selection:** Single select. Tapping a trade highlights it with an amber border (`border-amber-500`) and enables the "Continue" CTA. Trade is written to `user_profiles.trade_slug` and **locked permanently** — cannot be changed post-onboarding. A user who needs to change trade must delete their account and re-register.

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
- On confirm → write `home_base_lat`, `home_base_lng` to `user_profiles`

**Default radius:** Set by Buildo admin per the "realtor" preset — typically 3–5km. Written to `user_profiles.radius_km` from the admin-configured default. Not shown to user during onboarding.

**Step 2 — ToS + Privacy Policy**
Single screen. Two checkboxes (each required): Terms of Service and Privacy Policy. Links open in `expo-web-browser`. Confirmation writes `tos_accepted_at` timestamp to `user_profiles`. CTA: "Start Exploring →"

**Completion:** Straight drop to Feed tab. No confirmation screen.

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

- **Fixed address:** Address input screen with Toronto bounds validation (same as §4 Path R). Writes `home_base_lat`, `home_base_lng` to `user_profiles`. Sets `location_mode = 'home_base_fixed'`.
- **Live GPS:** No address input. Sets `location_mode = 'gps_live'`. Location resolved automatically on feed load via `useLocation.ts`.

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

**No progress indicator** — only 2 steps, not long enough to warrant one.

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

**Completion:** Straight drop to Flight Board tab. No confirmation screen. Writes `default_tab = 'flight_board'` to `user_profiles`.

**Push notification prompt:** Fires after first permit is claimed to the flight board (not during onboarding). See Spec 97 §2.

---

## 7. Manufacturer Holding Screen

Manufacturers authenticate via Spec 93 but bypass onboarding entirely. On first login, if `user_profiles.subscription_status = 'admin_managed'` AND `user_profiles.onboarding_complete = false`:

```
┌─────────────────────────────────────┐
│                                     │
│   Your account is being configured. │
│                                     │
│   We'll notify you when your        │
│   custom feed is ready.             │
│                                     │
│   [  Contact Buildo  ]              │
│                                     │
└─────────────────────────────────────┘
```

`bg-zinc-950` full screen. When Buildo admin marks the account active, an email + push notification is sent. On next app open the user bypasses this screen and lands on their configured feed.

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

## 9. Operating Boundaries

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
