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
| `lead_views_count` | INTEGER DEFAULT 0 | Count of unique leads viewed during trial. Incremented server-side (see §2.2.1 below). Displayed on the paywall screen (Spec 96 §5). |

**§2.2.1 `lead_views_count` increment mechanism:** The `GET /api/leads` (or `GET /api/leads/[id]`) route increments this counter server-side when `subscription_status = 'trial'`. Deduplication is per `(user_id, permit_num, revision_num)` — viewing the same lead twice does not increment the counter.

**Implementation must use an atomic CTE** (not two separate statements) to prevent double-increment under concurrent requests:
```sql
WITH ins AS (
  INSERT INTO lead_view_events (user_id, permit_num, revision_num)
  VALUES ($1, $2, $3)
  ON CONFLICT (user_id, permit_num, revision_num) DO NOTHING
  RETURNING 1
)
UPDATE user_profiles
SET lead_views_count = lead_views_count + 1
WHERE user_id = $1
  AND EXISTS (SELECT 1 FROM ins)
```
The `EXISTS (SELECT 1 FROM ins)` clause ensures the UPDATE only fires when the INSERT actually landed a new row, not on conflict. Two concurrent requests for the same event will race on the INSERT; at most one will see the `RETURNING 1` row, and only that one will increment the counter. Counter is read-only from the client.

---

### 2.3 Subscription & Account State

| Column | Type | Notes |
|--------|------|-------|
| `subscription_status` | ENUM | `'trial' \| 'active' \| 'past_due' \| 'expired' \| 'cancelled_pending_deletion' \| 'admin_managed'` |
| `trial_started_at` | TIMESTAMPTZ | Written on first app launch post-onboarding |
| `stripe_customer_id` | TEXT | Written when user pays via Stripe (web path) |
| `onboarding_complete` | BOOLEAN DEFAULT false | Written true at end of onboarding flow |
| `tos_accepted_at` | TIMESTAMPTZ | Written at ToS acceptance step |
| `account_deleted_at` | TIMESTAMPTZ | Written on deletion request. Null = active account. |

### 2.4 Notification Preferences

| Column | Type | Default |
|--------|------|---------|
| `notification_prefs` | JSONB | `'{"new_lead_min_cost_tier":"medium","phase_changed":true,"lifecycle_stalled":true,"start_date_urgent":true,"notification_schedule":"anytime"}'` |

**JSONB schema (canonical — Spec 92 §2.3):**
```json
{
  "new_lead_min_cost_tier": "low" | "medium" | "high",
  "phase_changed": true,
  "lifecycle_stalled": true,
  "start_date_urgent": true,
  "notification_schedule": "morning" | "anytime" | "evening"
}
```

All five keys are required at write time; the column has a non-null JSONB default so existing rows are always valid. The backend dispatch engine (Spec 92 §6.3) reads `notification_prefs->>'notification_schedule'` and the individual boolean fields from this JSONB column. If OS permission is denied, these fields are irrelevant — no pushes are sent regardless of their value.

**Deprecation note:** Earlier drafts used two separate boolean columns (`notif_permit_status`, `notif_urgent_alerts`). These are superseded by `notification_prefs` JSONB, which covers the full Spec 92 preference surface. The migration must NOT create the boolean columns — only the JSONB column.

### 2.5 Admin-Configured Fields (Manufacturer accounts only)

| Column | Type | Notes |
|--------|------|-------|
| `account_preset` | TEXT | `'tradesperson' \| 'realtor' \| 'manufacturer'` |
| `trade_slugs_override` | TEXT[] | Manufacturer: multiple or all trades. Null for individual accounts. |
| `radius_cap_km` | INTEGER | Maximum radius enforced server-side. Null = no cap (manufacturers). |

**Manufacturer `trade_slug` note:** Manufacturer accounts have `trade_slug = NULL`. The `trade_slugs_override` array is their trade list. All API and client logic that reads `trade_slug` must handle `NULL` by checking `trade_slugs_override` when `account_preset = 'manufacturer'`. **Manufacturer accounts cannot update `trade_slug` via PATCH** — the 400 guard applies to ALL accounts. For manufacturers, `trade_slug` is permanently `NULL` and `trade_slugs_override` is their trade list.

**`trade_slugs_override` update path:** This field is NOT writable by manufacturers via `PATCH /api/user-profile` (it is in the server-only blocklist — client-controlled multi-trade selection creates a privilege escalation vector). Updates to `trade_slugs_override` are performed exclusively by Buildo admin via a dedicated admin endpoint (`PATCH /api/admin/user-profile/{uid}`) or direct DB write. This is intentional: manufacturer trade lists are configured by Buildo, not self-selected by the manufacturer.

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
| Notification preferences | ✅ | Full JSONB — all 5 keys editable in Settings; PATCH merges partial updates |
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

**DB constraint:** The migration adds a `CHECK` constraint to enforce data integrity:
```sql
CHECK (
  location_mode IS NULL  -- valid during mid-onboarding (before address/GPS step)
  OR (location_mode = 'gps_live' AND home_base_lat IS NULL AND home_base_lng IS NULL)
  OR (location_mode = 'home_base_fixed' AND home_base_lat IS NOT NULL AND home_base_lng IS NOT NULL)
)
```
`location_mode IS NULL` is explicitly a valid third state for users who have authenticated and chosen their trade but have not yet reached the location step (mid-onboarding). Path T (tracking) users also start with `location_mode IS NULL` and the completion PATCH writes `location_mode='gps_live'` as a default (Spec 94 §10 Step 10). Application logic is not sufficient to guarantee this invariant across all client versions — the constraint enforces it at the DB level.

**Email field staleness:** `email` in `user_profiles` is sourced from Firebase Auth at account creation. If the user later changes their email via Firebase (e.g., through account recovery), the `user_profiles.email` field will not auto-update. Syncing this via a Firebase Auth event trigger is deferred to Phase 2. Known limitation at launch.

## 8. Design & Interface

### Design Language

Spec 95 is primarily backend + store infrastructure. Its two visual surface contributions are the `TradeReadOnlyRow` component (used in Settings) and the hydration loading skeleton that drives initial loading states across every other spec that reads from `user_profiles`.

**Token reference:** `bg-zinc-900` rows · `zinc-400` labels · `zinc-500` locked/disabled values · `zinc-600` hint text · `<Lock size={14} />` from `lucide-react-native` for immutable fields.

---

### TradeReadOnlyRow Component

File: `mobile/src/components/settings/TradeReadOnlyRow.tsx`

```
flex-row items-center justify-between px-4 min-h-[52px] border-b border-zinc-800/50
```

| Slot | Classes |
|------|---------|
| Label "Trade" | `text-zinc-400 text-sm` |
| Trade value | `text-zinc-500 text-sm font-mono` |
| Lock icon (right) | `<Lock size={14} color="#52525b" />` from `lucide-react-native` |
| Sub-label (below) | `text-zinc-600 text-xs mt-0.5 pb-2` — "To change trade, delete and re-register." |

The lock icon signals immutability without requiring a tooltip or explanation beyond the sub-label.

**Accessibility:** `accessibilityLabel="Trade: {tradeSlug}, locked"` on the outer row. No `onPress` — it is not interactive.

---

### Hydration Loading Skeleton

**Trigger:** While `useUserProfile` `isLoading === true` on first fetch (no MMKV cache present).

**Skeleton pattern:** `bg-zinc-800` blocks at settings-row heights with shimmer animation.

**Animation:** `withRepeat(withTiming(1, { duration: 1000, easing: Easing.linear }), -1, true)` — first arg to `withTiming` is the **target value** (1.0), duration is in the config object. The `useSharedValue(0)` cycles `0 → 1 → 0 → 1...` via reverse repeat, which drives `interpolate(sv, [0, 1], [0.4, 0.8])` to produce `opacity: 0.4 → 0.8 → 0.4`. Loops indefinitely until data resolves.

**Skeleton row anatomy:**
- Full-width field rows: `h-5 rounded bg-zinc-800 w-3/5` for label + `h-5 rounded bg-zinc-800 w-2/5` for value
- Toggle rows: label block + `h-7 w-12 rounded-full bg-zinc-800` on right
- Section header placeholder: `h-4 rounded bg-zinc-800 w-1/4 mx-4 my-3`

**Fast-path:** `useUserProfile` calls `filterStore.hydrate(mmkvCache)` synchronously on mount from MMKV before the network request completes. This means skeleton is visible for <300ms on repeat launches and <1s on first launch. On network success, `hydrate(serverData)` overwrites the MMKV values silently — no flash, no toast.

---

### `filterStore` vs `userProfileStore` Visual Boundary

`filterStore` owns feed preferences (radius, location mode, trade) — changes trigger `queryClient.invalidateQueries(['leads'])`.

`userProfileStore` owns account-level display fields (name, company, notification toggles) — changes do NOT trigger feed re-renders.

This separation prevents a notification toggle save from causing the lead feed to re-fetch, which would be a jarring UX regression.

---

## 9. Implementation

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
- `notification_prefs`: add as JSONB with default `'{"new_lead_min_cost_tier":"medium","phase_changed":true,"lifecycle_stalled":true,"start_date_urgent":true,"notification_schedule":"anytime"}'::jsonb`. Do NOT add the deprecated boolean columns `notif_permit_status` / `notif_urgent_alerts`.
- Add `CHECK` constraint per §7: `ALTER TABLE user_profiles ADD CONSTRAINT chk_location_mode_coords CHECK (location_mode IS NULL OR (location_mode = 'gps_live' AND ...) OR (location_mode = 'home_base_fixed' AND ...))`.
- **New tables (same migration file):**
  ```sql
  CREATE TABLE IF NOT EXISTS lead_view_events (
    user_id TEXT NOT NULL,
    permit_num TEXT NOT NULL,
    revision_num TEXT NOT NULL,
    viewed_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, permit_num, revision_num)
  );

  CREATE TABLE IF NOT EXISTS subscribe_nonces (
    nonce TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '15 minutes'
  );

  CREATE TABLE IF NOT EXISTS stripe_webhook_events (
    event_id TEXT PRIMARY KEY,
    processed_at TIMESTAMPTZ DEFAULT NOW()
  );
  ```
- **ON DELETE CASCADE for hard delete (PIPEDA compliance):** The migration must add FK constraints with CASCADE on all tables that reference `user_profiles.user_id`. At minimum: `lead_view_events`, `lead_assignments` (if it exists), flight board claims table, and push token registration table. If these tables do not yet have FK constraints:
  ```sql
  ALTER TABLE lead_view_events
    ADD CONSTRAINT fk_lead_view_events_user
    FOREIGN KEY (user_id) REFERENCES user_profiles(user_id) ON DELETE CASCADE;
  -- Repeat pattern for lead_assignments, flight board claims, push tokens
  ```
  If the referenced child tables are created by earlier migrations, add the FK as a separate `ALTER TABLE` in this migration. This ensures Spec 97 §3.3 hard delete cascades automatically without relying on application-level DELETE chains (per Spec 97 §3.3: "Application code alone is not sufficient").
- Run `npm run db:generate` after migration to regenerate Drizzle types.

**Step 2 — GET /api/user-profile**
- File: `src/app/api/user-profile/route.ts`
- Authenticated route: extract Firebase UID from Bearer token header. Return full `user_profiles` row as `{ data: UserProfile }` envelope.
- If `account_deleted_at IS NOT NULL`: return 403 with the following exact body — `{ error: "Account scheduled for deletion.", account_deleted_at: "<ISO 8601 timestamp>", days_remaining: <integer: CEIL(30 - days since account_deleted_at)> }`. This is the authoritative contract that Spec 93 §3.6 (reactivation modal) and Spec 97 §3.2 (30-day recovery) both depend on. The `days_remaining` value is used in the reactivation modal copy ("X days left to reactivate"). Do not return profile data for deleted accounts.
- If no row found for UID: return 404. The client interprets 404 as "new user → redirect to onboarding" (§4 GET 404 behavior).
- Try-catch per §00 §2.2. `logError` per §00 §6.1. Never expose `err.message` to client.

**Step 3 — PATCH /api/user-profile**
- File: `src/app/api/user-profile/route.ts` (same file, add `PATCH` handler)
- **Check deleted account first:** If the authenticated UID has `account_deleted_at IS NOT NULL`, return 403 immediately (same body as GET 403). Do not apply any field updates to deleted accounts. **Idempotency exception for deletion retry:** if the body is the deletion payload (contains `account_deleted_at` that matches the existing DB value), return 200 rather than 403 — see Step 3a.
- **`UserProfileUpdateSchema` (whitelist — standard client-editable fields):** Validate against a Zod schema that allows the following 10 fields: `full_name`, `phone_number`, `company_name`, `backup_email`, `default_tab`, `location_mode`, `home_base_lat`, `home_base_lng`, `radius_km`, `supplier_selection`, `notification_prefs`. Strip all other fields silently (`.strip()`).
- **Guarded fields (writable via PATCH under server-enforced conditions — NOT in the standard whitelist above):**
  - `onboarding_complete: true` — accepted ONLY when all required fields are present in the resulting row: `trade_slug IS NOT NULL`, `location_mode IS NOT NULL`, `tos_accepted_at IS NOT NULL`. The server validates these preconditions and then also writes `trial_started_at = NOW()` and `subscription_status = 'trial'` in the same DB transaction (Spec 96 Step 4) when `account_preset != 'manufacturer'`. Reject with 400 if preconditions are not met: `{ error: "Profile incomplete — cannot complete onboarding." }`. Manufacturers skip trial write.
  - `tos_accepted_at` — accepted only from the onboarding sequence (present in body alongside valid onboarding step fields). Strip if sent independently post-onboarding.
- **Strictly server-only fields (strip silently or 400 if strict):** `subscription_status`, `trial_started_at`, `stripe_customer_id`, `account_deleted_at`, `account_preset`, `trade_slugs_override`, `radius_cap_km`, `lead_views_count`. These must NEVER be accepted via this PATCH endpoint. They are written only by: Step 3a (deletion endpoint), Step 3b (reactivation endpoint), Stripe webhook handler, or direct DB admin scripts.
- **`notification_prefs` validation:** If included, parse as a Zod object matching the §2.4 schema. Partial updates are merged server-side (spread existing prefs + incoming partial): `{ ...existingPrefs, ...incomingPrefs }`. This allows the client to update only `notification_schedule` without sending all 5 keys.
- The Zod schema strips `email` (`.strip()`). Reject any body containing `trade_slug` with 400: `{ error: "Trade cannot be changed after registration." }` (§3). Idempotency exception: if incoming `trade_slug` equals the existing DB value, return 200 (handles onboarding retry after network drop, per Spec 94 §10 Step 3). `trade_slug` immutability guard applies to ALL accounts including manufacturers.
- Enforce `effective_radius = COALESCE(LEAST(requested_radius, radius_cap_km), requested_radius)` (handles NULL cap per §7).
- Update only the fields present in the body. Try-catch + `logError`. Return updated row.

**Step 3a — POST /api/user-profile/delete (account deletion endpoint)**
- File: `src/app/api/user-profile/delete/route.ts`
- Authenticated route (Firebase Bearer token). Requires `account_deleted_at IS NULL` (cannot re-delete).
- **Atomic deletion transaction:**
  ```typescript
  await db.transaction(async (tx) => {
    // 1. Mark account for deletion
    await tx.update(userProfiles).set({
      account_deleted_at: new Date(),
      subscription_status: 'cancelled_pending_deletion',
    }).where(eq(userProfiles.user_id, uid));
    // 2. Cancel Stripe subscription if stripe_customer_id is set
    if (profile.stripe_customer_id) {
      await stripe.subscriptions.cancel(stripeSubscriptionId); // requires sub lookup
    }
  });
  // 3. Revoke all Firebase sessions server-side (outside DB transaction — Firebase Admin)
  await admin.auth().revokeRefreshTokens(uid);
  ```
- On success: return 200 `{ ok: true }`. Client then calls `firebase.auth().signOut()` and navigates to `/(auth)/sign-in` (Spec 93 §3.6, Spec 97 §5 Step 9).
- **Idempotency:** If `account_deleted_at IS NOT NULL` already (retry after network drop), return 200 immediately — do not call `revokeRefreshTokens` again (it is idempotent at Firebase level but avoids unnecessary Admin SDK calls).
- Try-catch + `logError`. Never expose raw error to client.

**Step 3b — POST /api/user-profile/reactivate (reactivation endpoint)**
- File: `src/app/api/user-profile/reactivate/route.ts`
- Authenticated route. Only valid when `account_deleted_at IS NOT NULL` AND `account_deleted_at > NOW() - INTERVAL '30 days'` (within recovery window).
- Determines `restored_status`:
  - `account_preset = 'manufacturer'` → `'admin_managed'`
  - All others (including prior `trial`) → `'expired'` (trial does not resume; user must subscribe at buildo.com)
- Sets `account_deleted_at = NULL`, `subscription_status = restored_status` atomically.
- Returns 200 with updated profile. Client receives `subscription_status = 'expired'` or `'admin_managed'` and the subscription gate handles routing.
- Returns 400 if recovery window has passed (> 30 days). Returns 400 if account is not in deletion state.
- Try-catch + `logError`.

**Step 4 — Route guard**
- File: `src/lib/auth/route-guard.ts`
- Classify `/api/user-profile` as `authenticated` (not admin-only). Mobile client authenticates via Firebase Bearer token, not admin session cookie.

**Step 5 — Shared Zod schema**
- File: `packages/shared-types/src/userProfile.ts`
- `UserProfileSchema` — Zod object covering all columns in §2. Used by Next.js PATCH validation and Expo TanStack Query response parsing (Spec 90 §7 monorepo contract). Prevents API drift from crashing the native app.

**Step 6 — Store field separation**
- `filterStore` owns feed-preference fields: `locationMode`, `defaultTab`, `homeBaseLat`, `homeBaseLng`, `supplierSelection`, `tradeSlug`, `radiusKm`.
- `userProfileStore` owns account/display fields: `fullName`, `companyName`, `phoneNumber`, `backupEmail`, `notificationPrefs` (the full JSONB object from §2.4). Changes to these fields must NOT trigger `queryClient.invalidateQueries(['leads'])` — notification preference saves must not cause the lead feed to re-fetch.
- `notificationPrefs` in the store is typed as the full JSONB shape: `{ new_lead_min_cost_tier: 'low'|'medium'|'high', phase_changed: boolean, lifecycle_stalled: boolean, start_date_urgent: boolean, notification_schedule: 'morning'|'anytime'|'evening' }`. Individual Settings controls read/write specific keys from this object; PATCH sends the merged full object (Step 3 merge logic).
- File `mobile/src/store/filterStore.ts`: add `locationMode`, `defaultTab`, `homeBaseLat`, `homeBaseLng`, `supplierSelection`. Add `hydrate(profile: UserProfile)` action that overwrites only the filter-scoped fields listed above. Add `reset()` action that clears all fields to null/default (called on sign-out per Spec 93 §5 Step 2).
- File `mobile/src/store/userProfileStore.ts` (new): Zustand store holding `fullName`, `companyName`, `phoneNumber`, `backupEmail`, `notifPermitStatus`, `notifUrgentAlerts`. Add `hydrate(profile: UserProfile)` action. Add `reset()` action. MMKV is cache; `user_profiles` wins on conflict.

**Step 7 — useUserProfile hook**
- File: `mobile/src/hooks/useUserProfile.ts`
- TanStack Query `useQuery({ queryKey: ['user-profile'], queryFn: ... })`. `staleTime: 300_000`. On success: calls **both** `filterStore.hydrate(data)` AND `userProfileStore.hydrate(data)` — both stores must be hydrated from the same server response. Missing either hydration call leaves a store empty on new device / reinstall, causing the Settings screen or feed to show stale/blank data. Response parsed through `UserProfileSchema` — Zod parse failure triggers a Sentry report and falls back to cached MMKV values (Spec 90 §13).
- **Loading state (skeleton):** Expose `isLoading` and `isFetching` from the hook. Consuming screens (`SettingsScreen`, `ProfileScreen`) check `isLoading && !hasCachedData` to decide whether to render skeleton rows instead of live content. `hasCachedData` is derived from the MMKV key `user_profile_cache` existing in the store.
- **Skeleton animation pattern:** Each skeleton block uses a `useSharedValue` animated `opacity` cycling `0.4 → 0.8 → 0.4` via `withRepeat(withTiming(1, { duration: 1000, easing: Easing.linear }), -1, true)`. **Critical:** `withTiming` first arg is the **target value** (1.0), not the duration — `withTiming(1000, { easing })` would animate opacity TO 1000 (not for 1000ms), producing a broken shimmer at maximum opacity. All skeleton blocks share the same shared value so they pulse in sync (one `useSharedValue` per screen, not one per row). NativeWind classes on skeleton blocks: field label `h-5 rounded bg-zinc-800 w-3/5`, field value `h-5 rounded bg-zinc-800 w-2/5`, toggle stub `h-7 w-12 rounded-full bg-zinc-800`, section header `h-4 rounded bg-zinc-800 w-1/4 mx-4 my-3`.
- **Fast-path:** On mount, before the query resolves, call `filterStore.hydrate(mmkvCache)` synchronously if the MMKV cache key exists. This collapses the skeleton to <300ms on repeat launches. On network success, `hydrate(serverData)` overwrites silently — no flash, no toast, no transition.

**Step 8 — TradeReadOnlyRow component**
- File: `mobile/src/components/settings/TradeReadOnlyRow.tsx`
- Read-only row: label "Trade", value from `filterStore.tradeSlug`, `text-zinc-500`, lock icon. No edit affordance. Sub-label: `"To change trade, delete and re-register your account."` (§3).
- **Outer container:** `flex-row items-center justify-between px-4 min-h-[52px] border-b border-zinc-800/50` — matches all settings rows for visual consistency.
- **Label:** `text-zinc-400 text-sm` — same as editable field labels so the row doesn't visually stand out as special until the user tries to tap it.
- **Value slot (right side):** `flex-row items-center gap-2` wrapping the trade value text (`text-zinc-500 text-sm font-mono`) and `<Lock size={14} color="#52525b" />` from `lucide-react-native`. The mono font echoes the data-field treatment from the lead feed design language.
- **Sub-label row (below the main row, same horizontal padding):** `text-zinc-600 text-xs mt-0.5 pb-3 px-4` — "To change trade, delete and re-register your account." Rendered as a separate `<Text>` outside the flex-row, not inside it, so it doesn't affect the row's min-height calculation.
- **No `onPress`:** Do not attach any touch handler. The component is purely display. `accessible={false}` on the outer container; individual elements carry their own roles so VoiceOver reads the meaningful parts without announcing the container.
- **Accessibility:** `accessibilityLabel={\`Trade: ${tradeSlug}, locked\`}` on the value+lock `View`. `accessibilityRole="text"`. The sub-label `Text` carries `accessibilityHint="To change your trade, delete your account and re-register."` for screen reader context.

### Testing Gates

- **Infra:** `src/tests/user-profiles.infra.test.ts` — GET returns full row for valid UID; GET returns 404 for unknown UID (new user); GET returns 403 for account with `account_deleted_at` set; PATCH updates valid fields and returns updated row; PATCH rejects `trade_slug` update with 400; PATCH rejects `email` field with 400; PATCH unauthenticated request returns 401; NULL `radius_cap_km` applies no cap; DB error returns 500 without leaking raw message (§00 §2.1 unhappy path mandate).
- **Infra:** `src/tests/user-profiles-schema.infra.test.ts` (existing) — confirm all new migration columns land with correct types and defaults.
- **Unit:** `mobile/__tests__/filterStore.test.ts` — `hydrate()` overwrites all fields; MMKV cache is written after hydration.

---

## 10. Operating Boundaries

**Target files:**
- `src/app/api/user-profile/route.ts` — GET + PATCH endpoint
- `mobile/src/store/filterStore.ts` — add `locationMode`, `defaultTab` fields
- DB migration — new columns on `user_profiles` table

**Schema evolution required (new columns on `user_profiles`):**
`full_name`, `phone_number`, `company_name`, `backup_email`, `default_tab`, `location_mode`, `home_base_lat`, `home_base_lng`, `radius_km`, `supplier_selection`, `lead_views_count`, `subscription_status`, `trial_started_at`, `stripe_customer_id`, `onboarding_complete`, `tos_accepted_at`, `account_deleted_at`, `notification_prefs` (JSONB — replaces deprecated boolean columns), `account_preset`, `trade_slugs_override`, `radius_cap_km`

**`subscription_status` ENUM values (all 6 must be in the migration):** `'trial'`, `'active'`, `'past_due'`, `'expired'`, `'cancelled_pending_deletion'`, `'admin_managed'`

**New tables (all created in this migration):**
- `lead_view_events(user_id TEXT, permit_num TEXT, revision_num TEXT, viewed_at TIMESTAMPTZ DEFAULT NOW(), PRIMARY KEY (user_id, permit_num, revision_num))` — drives `lead_views_count` deduplication per §2.2.1
- `subscribe_nonces(nonce TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '15 minutes')` — single-use nonces for Stripe checkout (Spec 96 §5)
- `stripe_webhook_events(event_id TEXT PRIMARY KEY, processed_at TIMESTAMPTZ DEFAULT NOW())` — Stripe webhook idempotency table (Spec 96 Step 5)

**New API files (new target files):**
- `src/app/api/user-profile/delete/route.ts` — account deletion endpoint (Step 3a)
- `src/app/api/user-profile/reactivate/route.ts` — 30-day recovery reactivation endpoint (Step 3b)

Note: `radius_km` currently exists in MMKV only (`tasks/lessons.md`). This migration promotes it to a server-side column — MMKV becomes cache only.

**Out of scope:**
- Team/org membership tables — Phase 2
- Builder PIN storage — Phase 2

**Cross-spec dependencies:**
- Spec 93 — Firebase UID is the `user_id` PK
- Spec 94 — onboarding writes all initial values
- Spec 96 — `subscription_status` read on every app launch
- Spec 97 — Settings UI reads and writes editable fields
