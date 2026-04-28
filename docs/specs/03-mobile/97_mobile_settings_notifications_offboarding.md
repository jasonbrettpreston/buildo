# Spec 97 — Mobile Settings, Notifications & Offboarding

**Status:** ACTIVE
**Cross-references:** Spec 77 (Flight Board), Spec 90 (Engineering Protocol), Spec 91 (Lead Feed), Spec 92 (Engagement Hardware), Spec 93 (Auth), Spec 95 (User Profiles), Spec 96 (Subscription)

## 1. Settings Screen

**Location:** `mobile/app/(app)/settings.tsx` — Tab 4 in the bottom tab bar (always visible — tab bar does not hide on scroll for this screen, per Spec 91 §2 and Spec 77 §2).

### 1.1 Screen Structure

Four sections rendered in a `<ScrollView>`. Section headers: `text-zinc-500 text-xs font-mono tracking-widest uppercase px-4 pt-6 pb-2`.

```
ACCOUNT
  Full name          [editable text field]
  Phone number       [editable — re-triggers SMS verification if changed]
  Company name       [editable text field]
  Email              [read-only — text-zinc-500]
  Trade              [read-only — text-zinc-500 + lock icon 🔒]
                     "To change trade, delete and re-register your account."

FEED PREFERENCES
  Location mode      [toggle: Fixed Address | Live GPS]
                     → Switching to Fixed opens address input bottom sheet
                     → Toast on switch: "Enter your home base address to continue"
  Home base address  [visible only when location_mode = 'home_base_fixed']
  Radius             [stepper or slider — bounded by radius_cap_km]
  Primary view       [toggle: Lead Feed | Flight Board]
  Main supplier      [single-select — same list as onboarding]

NOTIFICATIONS
  Permit status changes    [ toggle ]   default ON
  Urgent alerts (≤7 days) [ toggle ]   default ON

SUBSCRIPTION
  Status badge             (Trial X days left / Active / Expired)
  "Manage subscription at buildo.com →"   [opens expo-web-browser]
  [Hidden for admin_managed accounts]

ACCOUNT ACTIONS
  Sign Out                 [text-zinc-300]
  Delete Account           [text-red-400]
```

### 1.2 Row Component

Each editable row: `bg-zinc-900 border-b border-zinc-800 px-4 py-4 flex-row items-center justify-between`. Label: `text-zinc-300 text-sm`. Value / control: right-aligned. Touch target: `min-h-[44px]` (Spec 90 §9).

### 1.3 Saving Changes

All editable fields save on blur (text fields) or toggle (switches) — no explicit "Save" button. Changes fire `PATCH /api/user-profile` and update the local Zustand `filterStore` optimistically. On API error, revert local state and show Sonner-equivalent error toast: `"Couldn't save — try again."` in `bg-zinc-800 border border-red-500/40`.

---

## 2. Push Notifications

### 2.1 Permission Prompt Timing

iOS/Android require an explicit permission request. Prompting too early (before the user has seen value) results in high denial rates and no recovery path.

**Leads path (Path L):** Prompt fires after the first lead card finishes rendering on the feed. A contextual in-app pre-prompt appears first (native system dialog is shown only after user taps the in-app CTA):

```
┌──────────────────────────────────────────┐
│  Get notified when your tracked          │
│  jobs need attention.                    │
│                                          │
│  [ Turn on notifications ]               │
│  [ Not now ]                             │
└──────────────────────────────────────────┘
```

**Tracking path (Path T):** Prompt fires after the first permit is claimed to the flight board (Spec 77 §3.1 claim mutation success). Same pre-prompt copy.

**Pre-prompt:** `bg-zinc-900 border border-zinc-700 rounded-2xl p-4 mx-4` positioned above the tab bar. Not a modal — does not block the screen. Dismisses on tap of either option. If "Not now": system dialog is never shown. User can enable via Settings → Notifications → device Settings deep link.

### 2.2 Notification Types

Two types, each controlled by a toggle in Settings (§1.1):

**Permit status changes** (`notif_permit_status`):
- Fires when a permit on the user's flight board moves to a new lifecycle phase
- Payload: `{ title: "Permit update", body: "123 Main St — moved to Structural phase", data: { permitNum, revisionNum } }`
- Deep link target: Flight Board card for that permit (Spec 77 §3.3)
- Triggered by: backend pipeline phase-change detection → Cloud Functions → `expo-notifications`

**Urgent alerts** (`notif_urgent_alerts`):
- Fires when a tracked permit's `predicted_start` falls within 7 days
- Payload: `{ title: "⚡ Job starting soon", body: "123 Main St — estimated start in 5 days", data: { permitNum, revisionNum } }`
- Deep link target: Flight Board detail view for that permit
- Triggered by: daily Cloud Function sweep of tracked permits

**Notification hardware layer:** Per Spec 92 — `expo-notifications` token registration, foreground notification handling, and badge count management governed by Spec 92. This spec defines the notification types and triggers only.

### 2.3 Deep Link Handling

All push notification taps route via Expo Router:

```
notificationResponseReceived listener
  → read data.permitNum + data.revisionNum
  → router.push('/(app)/flight-board/[id]', { id: `${permitNum}--${revisionNum}` })
```

If the flight board item has been removed (user swipe-deleted it before tapping the notification): show a toast — *"This job is no longer on your board."* Do not crash or show a 404 screen.

---

## 3. Offboarding & Account Deletion

### 3.1 Deletion Flow

**Entry point:** Settings → Account Actions → Delete Account

**Step 1 — Data export offer:**
```
┌────────────────────────────────────────────┐
│  Before you go — export your data?         │
│                                            │
│  Download a CSV of your lead history       │
│  and flight board.                         │
│                                            │
│  [ Download my data ]                      │
│  [ Skip and continue ]                     │
└────────────────────────────────────────────┘
```

CSV download triggers `GET /api/user-profile/export` — returns a CSV attachment containing all personally identifiable fields from `user_profiles` and lead/flight board history. File opens in `expo-sharing`.

**Step 2 — Confirmation:**
```
┌────────────────────────────────────────────┐
│  Delete your account?                      │
│                                            │
│  Your account will be suspended            │
│  immediately. All data is permanently      │
│  deleted after 30 days.                    │
│                                            │
│  [ Yes, delete my account ]  ← text-red-400│
│  [ Cancel ]                                │
└────────────────────────────────────────────┘
```

**Step 3 — Immediate suspension:**
On confirm:
- `account_deleted_at` = now() written to `user_profiles`
- `subscription_status` = `'cancelled_pending_deletion'`
- Stripe subscription cancelled immediately (no refund for current period)
- Firebase Auth session revoked — user signed out
- Redirect to sign-in screen with message: *"Your account has been scheduled for deletion. Sign back in within 30 days to reactivate."*

### 3.2 30-Day Recovery Window

If user signs back in within 30 days:
- Auth succeeds
- App detects `account_deleted_at IS NOT NULL` AND within 30 days
- Show reactivation prompt: *"Welcome back. Reactivate your account?"*
- On confirm: `account_deleted_at` = null, `subscription_status` restored to previous state (or `'expired'` if previously on trial)
- User resumes normally

### 3.3 Hard Deletion (Day 30)

Cloud Function runs daily sweep:
```sql
DELETE FROM user_profiles
WHERE account_deleted_at IS NOT NULL
  AND account_deleted_at < NOW() - INTERVAL '30 days'
```

On hard delete:
- Firebase Auth record deleted (`admin.auth().deleteUser(uid)`)
- All associated `lead_assignments`, flight board claims, and notification tokens purged
- No recovery possible after this point

**PIPEDA compliance:** All personally identifiable data (name, phone, email, company, location, supplier selection) is included in the CSV export and fully purged on hard deletion. Anonymised aggregate data (permit views count) may be retained for analytics.

### 3.4 Subscription Cancellation (Non-Deletion)

Users who cancel their Stripe subscription but do not delete their account:
- `subscription_status` transitions to `'expired'` at end of billing period
- Account data fully preserved
- Paywall screen shown on next app open (Spec 96 §5)
- User can re-subscribe at any time via `buildo.com`

---

## 4. Implementation

### Cross-Spec Build Order

This spec is step 5 of 5. **All of specs 93, 94, 95, and 96 must be complete** — Settings reads and writes every field established by those specs.

```
Spec 95 (DB + API) → Spec 93 (Auth) → Spec 94 (Onboarding) → Spec 96 (Subscription gate) → Spec 97 (Settings)
```

### Build Sequence

**Step 1 — Shared row component**
- File: `mobile/src/components/settings/SettingsRow.tsx`
- `bg-zinc-900 border-b border-zinc-800 px-4 py-4 flex-row items-center justify-between`. `min-h-[44px]` touch target (Spec 90 §9). Props: `label`, `value`, `control` (right slot), `onPress`.

**Step 2 — Settings screen**
- File: `mobile/app/(app)/settings.tsx`
- `<ScrollView>` with 5 sections rendered via `<SettingsRow>`. Section headers: `text-zinc-500 text-xs font-mono tracking-widest uppercase px-4 pt-6 pb-2`.
- Subscription section hidden when `subscription_status === 'admin_managed'` (§1.1).
- Tab bar does not hide on scroll for this screen (Spec 91 §2 — settings always shows tab bar).

**Step 3 — Save-on-change logic**
- File: `mobile/app/(app)/settings.tsx`
- Text fields: save on `onBlur`. Toggles/switches: save on `onValueChange`. Each change: optimistic update to `filterStore` immediately, then PATCH `/api/user-profile`. On API error: revert `filterStore` to pre-change value + show toast: `"Couldn't save — try again."` (`bg-zinc-800 border border-red-500/40`).

**Step 4 — Location mode switch**
- File: `mobile/app/(app)/settings.tsx` (handler) + reuse `mobile/app/(onboarding)/address.tsx` UI
- On toggle from `gps_live` → `home_base_fixed`: toast `"Enter your home base address to continue"` → bottom sheet opens with address input. Feed suspends (shows last cached data) until address saved. On save: PATCH `{ location_mode: 'home_base_fixed', home_base_lat, home_base_lng }` → `queryClient.invalidateQueries(['leads'])`.
- Realtors: `location_mode` toggle not shown (always `home_base_fixed` per Spec 94 §4).

**Step 5 — Notification permission hook**
- File: `mobile/src/hooks/useNotificationSetup.ts`
- MMKV key `hasAskedPermission: boolean` — never show pre-prompt twice (Spec 92 §4.1).
- Leads path trigger: called from `mobile/app/(app)/(tabs)/index.tsx` after first lead card renders (`onViewableItemsChanged` with `viewableItems.length > 0` and `hasAskedPermission === false`).
- Tracking path trigger: called from flight board after first permit claimed (mutation `onSuccess` callback).
- Both paths: render in-app pre-prompt (`bg-zinc-900 border border-zinc-700 rounded-2xl p-4 mx-4`, positioned above tab bar, not a blocking modal). "Not now" → write `hasAskedPermission = true`, skip system dialog. "Turn on notifications" → `Notifications.requestPermissionsAsync()` → on grant, register token (Spec 92 §4.1 hardware layer).

**Step 6 — Notification deep-link handler**
- File: `mobile/app/_layout.tsx` (extend root layout)
- `Notifications.addNotificationResponseReceivedListener`: read `data.permitNum + data.revisionNum` → `router.push('/(app)/flight-board/[id]', { id: \`${permitNum}--${revisionNum}\` })`.
- If flight board item no longer exists: catch the navigation error → show toast `"This job is no longer on your board."` Do not crash or render a 404 screen (§2.3).
- Extends Spec 92 §3.2 deep-link routing (route domain `flight_board`).

**Step 7 — CSV export endpoint**
- File: `src/app/api/user-profile/export/route.ts`
- Authenticated `GET`. SELECT all PII columns from §2 (Spec 95): `full_name`, `phone_number`, `email`, `company_name`, `home_base_lat/lng`, `supplier_selection`, plus `lead_assignments` and flight board claims joined. Return `Content-Type: text/csv` with `Content-Disposition: attachment; filename="buildo-data-export.csv"`. PIPEDA compliant — all PII included.
- Try-catch per §00 §2.2. `logError` on error.

**Step 8 — Account deletion Step 1: export offer**
- File: `mobile/app/(app)/settings.tsx` (tapping "Delete Account")
- Opens `<DataExportSheet>` (`mobile/src/components/settings/DataExportSheet.tsx`) — bottom sheet, not a blocking dialog. "Download my data" → `GET /api/user-profile/export` → open file in `expo-sharing`. "Skip and continue" → opens `<DeleteConfirmModal>`.

**Step 9 — Account deletion Steps 2–3: confirmation + suspension**
- File: `mobile/src/components/settings/DeleteConfirmModal.tsx`
- Custom modal (not a JS alert — `window.alert` is banned per Spec 90 §5 DOM anti-patterns). Confirmation copy per §3.1. On "Yes, delete my account" tap: PATCH `{ account_deleted_at: new Date().toISOString(), subscription_status: 'cancelled_pending_deletion' }` → `firebase.auth().signOut()` (Spec 93 §3.6) → navigate `/(auth)/sign-in?deleted=true`.

**Step 10 — Cloud Function hard delete**
- **TODO: Phase 2** — Cloud Function daily sweep: `DELETE FROM user_profiles WHERE account_deleted_at IS NOT NULL AND account_deleted_at < NOW() - INTERVAL '30 days'`. Also deletes Firebase Auth record and all associated tokens. Cloud Functions infra not yet set up.
- 30-day recovery window (§3.2) implemented on the auth side: if `account_deleted_at IS NOT NULL` AND within 30 days, show reactivation prompt on sign-in.

### Testing Gates

- **Unit:** `mobile/__tests__/settings.test.ts` — all 5 sections render with correct row count; save-on-blur fires PATCH with correct field; toggle fires PATCH; optimistic revert fires on 500 response; subscription section hidden for `admin_managed`.
- **Unit:** `mobile/__tests__/notificationSetup.test.ts` — prompt not triggered on cold boot; triggered after first lead card enters viewport; triggered after first permit claim; MMKV gate prevents second prompt; "Not now" writes `hasAskedPermission = true` without calling `requestPermissionsAsync`.
- **Infra:** `src/tests/user-profile-export.infra.test.ts` — CSV response includes all PII column headers; returns 401 for unauthenticated request; empty flight board returns CSV with headers only (no crash).
- **Maestro:** `mobile/maestro/settings.yaml` — navigate to settings → toggle notification preference → navigate away → return → verify toggle persisted.

---

## 5. Operating Boundaries

**Target files:**
- `mobile/app/(app)/settings.tsx` — new screen
- `src/app/api/user-profile/route.ts` — PATCH for settings saves
- `src/app/api/user-profile/export/route.ts` — new CSV export endpoint
- `mobile/src/hooks/useNotificationSetup.ts` — permission prompt logic (extends Spec 92)

**Out of scope:**
- Team/org notification routing — Phase 2
- In-app subscription pricing display — web-only
- Builder team notification sharing — Phase 2

**Cross-spec dependencies:**
- Spec 77 §3.1 — permit claim event triggers tracking-path notification prompt
- Spec 91 — first lead render event triggers leads-path notification prompt
- Spec 92 — `expo-notifications` hardware layer, token registration, foreground handling
- Spec 93 §3.6 — account deletion initiated here, Firebase cleanup defined there
- Spec 95 — all settings writes update `user_profiles` via PATCH
- Spec 96 — subscription status badge rendered in Settings; cancellation flow referenced
