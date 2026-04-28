# Spec 95 — Mobile User Profiles

**Status:** ACTIVE
**Cross-references:** Spec 90 (Engineering Protocol), Spec 93 (Auth), Spec 94 (Onboarding), Spec 96 (Subscription), Spec 97 (Settings)

## 1. Goal & User Story

**Goal:** Define the canonical user data model that persists across sessions, devices, and platforms — the single source of truth that every screen reads from and onboarding writes to.
**User Story:** As a tradesperson who just got a new phone, I need my trade, location, and notification preferences to be exactly as I left them the moment I sign back in — without re-doing setup.

## 2. Data Model — `user_profiles`

All fields stored server-side in `user_profiles` (PostgreSQL). Client hydrates Zustand `filterStore` from this on sign-in. MMKV is a local cache only — `user_profiles` is authoritative.

### 2.1 Identity Fields

| Column | Type | Notes |
|--------|------|-------|
| `user_id` | TEXT PK | Firebase UID |
| `full_name` | TEXT | Set during onboarding or Settings. Not required. |
| `phone_number` | TEXT | Set during onboarding (SMS path) or Settings |
| `company_name` | TEXT | Optional. Set during onboarding or Settings |
| `email` | TEXT | Read-only. Source: Firebase Auth. Never editable in-app. |
| `backup_email` | TEXT | Required for SMS sign-in users. Set during onboarding. Used for account recovery only. |

### 2.2 Profession & Feed Configuration

| Column | Type | Notes |
|--------|------|-------|
| `trade_slug` | TEXT | Set once during onboarding. **Immutable post-onboarding.** |
| `default_tab` | ENUM('feed', 'flight_board') | Set during onboarding based on path chosen. Editable in Settings. |
| `location_mode` | ENUM('gps_live', 'home_base_fixed') | Set during onboarding. Editable in Settings. |
| `home_base_lat` | NUMERIC(9,6) | Null if `location_mode = 'gps_live'` |
| `home_base_lng` | NUMERIC(9,6) | Null if `location_mode = 'gps_live'` |
| `radius_km` | INTEGER | Default set by Buildo admin per `trade_slug`. User-adjustable in Settings. |
| `supplier_selection` | TEXT | Single supplier name. Skippable — may be null. Market research only, no in-app consequence at launch. |

### 2.3 Subscription & Account State

| Column | Type | Notes |
|--------|------|-------|
| `subscription_status` | ENUM | `'trial' \| 'active' \| 'expired' \| 'admin_managed'` |
| `trial_started_at` | TIMESTAMPTZ | Written on first app launch post-onboarding |
| `stripe_customer_id` | TEXT | Written when user pays via Stripe (web path) |
| `onboarding_complete` | BOOLEAN DEFAULT false | Written true at end of onboarding flow |
| `tos_accepted_at` | TIMESTAMPTZ | Written at ToS acceptance step |
| `account_deleted_at` | TIMESTAMPTZ | Written on deletion request. Null = active account. |

### 2.4 Notification Preferences

| Column | Type | Default |
|--------|------|---------|
| `notif_permit_status` | BOOLEAN | true |
| `notif_urgent_alerts` | BOOLEAN | true |

Both governed by `expo-notifications` permission state (Spec 92). If OS permission is denied, these fields are irrelevant — no pushes are sent regardless of their value.

### 2.5 Admin-Configured Fields (Manufacturer accounts only)

| Column | Type | Notes |
|--------|------|-------|
| `account_preset` | TEXT | `'tradesperson' \| 'realtor' \| 'manufacturer'` |
| `trade_slugs_override` | TEXT[] | Manufacturer: multiple or all trades. Null for individual accounts. |
| `radius_cap_km` | INTEGER | Maximum radius enforced server-side. Null = no cap (manufacturers). |

**Manufacturer `trade_slug` note:** Manufacturer accounts have `trade_slug = NULL`. The `trade_slugs_override` array is their trade list. All API and client logic that reads `trade_slug` must handle `NULL` by checking `trade_slugs_override` when `account_preset = 'manufacturer'`. The trade immutability rule (§3) does not apply — the PATCH 400 guard only rejects `trade_slug` updates for non-manufacturer accounts.

## 3. Trade Immutability

`trade_slug` is written once at onboarding and cannot be changed via the app. This is enforced at two layers:

1. **API:** `PATCH /api/user-profile` rejects updates to `trade_slug` with a 400 error.
2. **UI:** Trade/profession field in Settings is rendered as read-only — `text-zinc-500` with a lock icon. No edit affordance.

If a user genuinely needs to change trade, the path is: Settings → Delete Account → Re-register. This is documented in Settings with a one-line note.

## 4. New Device / Reinstall Restoration

On sign-in to a new device or after reinstall:

```
1. Firebase Auth sign-in succeeds
2. App fetches GET /api/user-profile
3. Server returns full user_profiles row
4. filterStore.setTradeSlug(), setRadiusKm(), setHomeBaseLocation(),
   setLocationMode(), setDefaultTab() called with server values
5. MMKV is written from server values (not the other way around)
6. User lands on their correct default tab with correct settings
```

MMKV is the local cache. `user_profiles` is always the source of truth.

**GET 404 behavior:** If the server returns 404 for the authenticated UID (no profile row exists), the client treats this as a new user and redirects to `/(onboarding)/profession`. This is the normal state between Firebase sign-up and completion of onboarding step 1.

**Fetch failure behavior:** If the initial GET fails (network error, 5xx), the app shows a full-screen retry prompt — it does not default to onboarding or full access. Retry with exponential backoff (3 attempts). On MMKV cache hit, show the feed with a staleness banner while retrying in the background.

**`radius_km` write-back (existing users):** On first launch after the §8 migration lands, if the server row has `radius_km = NULL` but MMKV has a previously stored radius, the client performs a one-time PATCH to write the MMKV value to the server. This migration guard runs once and then clears the MMKV `radius_km_legacy` flag.

## 5. Settings-Editable Fields

The following fields may be updated via Settings post-onboarding (Spec 97 §1):

| Field | Editable | Notes |
|-------|----------|-------|
| Full name | ✅ | |
| Phone number | ✅ | Re-triggers SMS verification if changed |
| Company name | ✅ | |
| Email | ❌ | Read-only — source is Firebase Auth |
| Trade / profession | ❌ | Locked — see §3 |
| Location mode | ✅ | Switching to fixed triggers address input prompt |
| Home base address | ✅ | Only visible if `location_mode = 'home_base_fixed'` |
| Radius | ✅ | Bounded by `radius_cap_km` from admin config |
| Primary view | ✅ | Switches `default_tab` between feed and flight board |
| Supplier selection | ✅ | |
| Notification toggles | ✅ | See Spec 97 §2 |
| Backup email | ✅ | SMS users only — editable for account recovery purposes |

## 6. Location Mode Switch Behaviour

When a user switches from `gps_live` → `home_base_fixed` in Settings:

```
Toggle fires
  → Toast: "Enter your home base address to continue"
  → Address input sheet opens immediately (bottom sheet)
  → Feed suspends (shows last cached data) until address saved
  → On save: home_base_lat/lng written to user_profiles
  → location_mode updated to 'home_base_fixed'
  → Feed refetches with new fixed coordinates
```

**Cancellation behavior:** If the user dismisses the address sheet without saving, the toggle reverts to `gps_live` — no server write is made. Feed resumes with live GPS. The suspended state is never left open indefinitely.

**Phone number change:** Phone number saves via a dedicated verification sheet, not save-on-blur. Editing the phone field opens a verification flow (SMS OTP). The PATCH to `user_profiles` fires only after verification succeeds. If verification fails or the user cancels, the old number is preserved.

Applies to all tradespeople. Realtors are always `home_base_fixed` — toggle not shown.

## 7. Admin-Managed Radius Defaults

`radius_km` defaults are seeded in the Buildo admin panel per `trade_slug`. Individual users may adjust their radius within `radius_cap_km`. The API enforces: `effective_radius = MIN(requested_radius, radius_cap_km)`.

Realtor default: 3–5km. Tradesperson default: 10–15km (varies by trade). Manufacturer: no cap (null).

**NULL cap handling:** The SQL formula `MIN(requested_radius, radius_cap_km)` returns `NULL` when `radius_cap_km IS NULL`. The server must explicitly handle this: if `radius_cap_km IS NULL`, apply no cap and use `requested_radius` as-is. The API enforces: `effective_radius = COALESCE(LEAST(requested_radius, radius_cap_km), requested_radius)`.

**DB constraint:** The migration adds a `CHECK` constraint to enforce data integrity: `CHECK ((location_mode = 'gps_live' AND home_base_lat IS NULL AND home_base_lng IS NULL) OR (location_mode = 'home_base_fixed' AND home_base_lat IS NOT NULL AND home_base_lng IS NOT NULL))`. Application logic is not sufficient to guarantee this invariant across all client versions.

**Email field staleness:** `email` in `user_profiles` is sourced from Firebase Auth at account creation. If the user later changes their email via Firebase (e.g., through account recovery), the `user_profiles.email` field will not auto-update. Syncing this via a Firebase Auth event trigger is deferred to Phase 2. Known limitation at launch.

## 8. Implementation

### Cross-Spec Build Order

This spec is step 1 of 5 — the foundation. **No other mobile spec can be end-to-end tested without the DB migration and `/api/user-profile` route existing first.**

```
Spec 95 (DB + API) → Spec 93 (Auth) → Spec 94 (Onboarding) → Spec 96 (Subscription gate) → Spec 97 (Settings)
```

### Build Sequence

**Step 1 — DB migration**
- File: `migrations/XXX_user_profiles_mobile_columns.sql`
- `ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS` for every column listed in §2 that does not already exist. All new columns are nullable with safe defaults — no backfill required.
- Special note: `radius_km` is promoted from MMKV-only to a server-side column. After migration, MMKV stores it as cache only; `user_profiles` is authoritative. Client performs a one-time write-back on first launch (see §4 radius_km write-back note).
- Add `CHECK` constraint per §7: `ALTER TABLE user_profiles ADD CONSTRAINT chk_location_mode_coords CHECK (...)`.
- Run `npm run db:generate` after migration to regenerate Drizzle types.

**Step 2 — GET /api/user-profile**
- File: `src/app/api/user-profile/route.ts`
- Authenticated route: extract Firebase UID from Bearer token header. Return full `user_profiles` row as `{ data: UserProfile }` envelope.
- If `account_deleted_at IS NOT NULL`: return 403 `{ error: "Account scheduled for deletion." }` — do not return profile data for deleted accounts.
- If no row found for UID: return 404. The client interprets 404 as "new user → redirect to onboarding" (§4 GET 404 behavior).
- Try-catch per §00 §2.2. `logError` per §00 §6.1. Never expose `err.message` to client.

**Step 3 — PATCH /api/user-profile**
- File: `src/app/api/user-profile/route.ts` (same file, add `PATCH` handler)
- Zod-validate request body. The Zod schema explicitly forbids the `email` field (`.strip()` or reject with 400 if present). Reject any body containing `trade_slug` with 400: `{ error: "Trade cannot be changed after registration." }` (§3 — manufacturer accounts excepted when `account_preset = 'manufacturer'`).
- Enforce `effective_radius = COALESCE(LEAST(requested_radius, radius_cap_km), requested_radius)` (handles NULL cap per §7).
- Update only the fields present in the body. Try-catch + `logError`. Return updated row.

**Step 4 — Route guard**
- File: `src/lib/auth/route-guard.ts`
- Classify `/api/user-profile` as `authenticated` (not admin-only). Mobile client authenticates via Firebase Bearer token, not admin session cookie.

**Step 5 — Shared Zod schema**
- File: `packages/shared-types/src/userProfile.ts`
- `UserProfileSchema` — Zod object covering all columns in §2. Used by Next.js PATCH validation and Expo TanStack Query response parsing (Spec 90 §7 monorepo contract). Prevents API drift from crashing the native app.

**Step 6 — filterStore fields**
- File: `mobile/src/store/filterStore.ts`
- Add: `locationMode`, `defaultTab`, `homeBaseLat`, `homeBaseLng`, `supplierSelection`, `notifPermitStatus`, `notifUrgentAlerts`.
- Add `hydrate(profile: UserProfile)` action that overwrites all server-authoritative fields. MMKV is cache; `user_profiles` wins on conflict.

**Step 7 — useUserProfile hook**
- File: `mobile/src/hooks/useUserProfile.ts`
- TanStack Query `useQuery({ queryKey: ['user-profile'], queryFn: ... })`. `staleTime: 300_000`. On success: calls `filterStore.hydrate(data)`. Response parsed through `UserProfileSchema` — Zod parse failure triggers a Sentry report and falls back to cached MMKV values (Spec 90 §13).

**Step 8 — TradeReadOnlyRow component**
- File: `mobile/src/components/settings/TradeReadOnlyRow.tsx`
- Read-only row: label "Trade", value from `filterStore.tradeSlug`, `text-zinc-500`, lock icon. No edit affordance. Sub-label: `"To change trade, delete and re-register your account."` (§3).

### Testing Gates

- **Infra:** `src/tests/user-profiles.infra.test.ts` — GET returns full row for valid UID; GET returns 404 for unknown UID (new user); GET returns 403 for account with `account_deleted_at` set; PATCH updates valid fields and returns updated row; PATCH rejects `trade_slug` update with 400; PATCH rejects `email` field with 400; PATCH unauthenticated request returns 401; NULL `radius_cap_km` applies no cap; DB error returns 500 without leaking raw message (§00 §2.1 unhappy path mandate).
- **Infra:** `src/tests/user-profiles-schema.infra.test.ts` (existing) — confirm all new migration columns land with correct types and defaults.
- **Unit:** `mobile/__tests__/filterStore.test.ts` — `hydrate()` overwrites all fields; MMKV cache is written after hydration.

---

## 9. Operating Boundaries

**Target files:**
- `src/app/api/user-profile/route.ts` — GET + PATCH endpoint
- `mobile/src/store/filterStore.ts` — add `locationMode`, `defaultTab` fields
- DB migration — new columns on `user_profiles` table

**Schema evolution required (new columns):**
`full_name`, `phone_number`, `company_name`, `backup_email`, `default_tab`, `location_mode`, `home_base_lat`, `home_base_lng`, `radius_km`, `supplier_selection`, `subscription_status`, `trial_started_at`, `stripe_customer_id`, `onboarding_complete`, `tos_accepted_at`, `account_deleted_at`, `notif_permit_status`, `notif_urgent_alerts`, `account_preset`, `trade_slugs_override`, `radius_cap_km`

Note: `radius_km` currently exists in MMKV only (`tasks/lessons.md`). This migration promotes it to a server-side column — MMKV becomes cache only.

**Out of scope:**
- Team/org membership tables — Phase 2
- Builder PIN storage — Phase 2

**Cross-spec dependencies:**
- Spec 93 — Firebase UID is the `user_id` PK
- Spec 94 — onboarding writes all initial values
- Spec 96 — `subscription_status` read on every app launch
- Spec 97 — Settings UI reads and writes editable fields
