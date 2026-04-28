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
  Permission status        [status row]  "Enabled" | "Not enabled → Enable in Settings ↗"
  Permit status changes    [ toggle ]   default ON — disabled if OS permission denied
  Urgent alerts (≤7 days) [ toggle ]   default ON — disabled if OS permission denied

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
- App detects `account_deleted_at IS NOT NULL` AND within 30 days (via `GET /api/user-profile` returning 403 with reactivation metadata)
- Show reactivation prompt: *"Welcome back. Reactivate your account?"*
- On confirm: PATCH `{ account_deleted_at: null, subscription_status: 'expired' }` — status is always restored to `'expired'` regardless of previous state. The original Stripe subscription was cancelled immediately at deletion time; the user must re-subscribe via `buildo.com`. If the user was on `trial` prior to deletion, the trial does not resume — they are directed to subscribe.
- User resumes with `'expired'` status → paywall shown → directed to `buildo.com` to subscribe

### 3.3 Hard Deletion (Day 30)

Cloud Function runs daily sweep:
```sql
DELETE FROM user_profiles
WHERE account_deleted_at IS NOT NULL
  AND account_deleted_at < NOW() - INTERVAL '30 days'
```

On hard delete:
- Firebase Auth record deleted (`admin.auth().deleteUser(uid)`)
- All associated `lead_assignments`, flight board claims, and notification tokens purged — the migration must define explicit `ON DELETE CASCADE` or include these as explicit `DELETE` statements in the same transaction. Application code alone is not sufficient.
- `admin.auth().revokeRefreshTokens(uid)` called server-side on deletion initiation (Step 3.1 confirm) to immediately invalidate all active sessions across all devices — not deferred to hard delete.
- No recovery possible after this point

**Phase 2 note (hard delete Cloud Function):** Until the Cloud Function is operational, accounts with `account_deleted_at > 30 days` are not automatically purged. An interim admin script (`scripts/purge-expired-deletions.js`) runs manually on a weekly cadence to fulfill the 30-day promise. This script is a PIPEDA compliance interim measure, not a permanent solution.

**PIPEDA compliance:** All personally identifiable data (name, phone, email, company, location, supplier selection) is included in the CSV export and fully purged on hard deletion. Anonymised aggregate data (permit views count) may be retained for analytics.

### 3.4 Subscription Cancellation (Non-Deletion)

Users who cancel their Stripe subscription but do not delete their account:
- `subscription_status` transitions to `'expired'` at end of billing period
- Account data fully preserved
- Paywall screen shown on next app open (Spec 96 §5)
- User can re-subscribe at any time via `buildo.com`

---

## 4. Design & Interface

### Design Language

Settings is a utility screen — it must be legible, scannable, and fast. The aesthetic is controlled density: the same `bg-zinc-950` background as the rest of the app but with `bg-zinc-900` section cards giving visual grouping. No decorative elements. Typography is DM Sans for labels and IBM Plex Mono for values (status badges, numeric fields, locked read-only values). Transitions within Settings are instant or near-instant (100–150ms) — this is not an editorial screen; it's a controls panel.

---

### SettingsRow Component Variants

File: `mobile/src/components/settings/SettingsRow.tsx`

All row variants share the base container: `bg-zinc-900 border-b border-zinc-800/60 px-4 flex-row items-center justify-between min-h-[52px]`.

| Variant | Left | Right | Interaction |
|---------|------|-------|-------------|
| **display** | `text-zinc-400 text-sm` label | `text-zinc-500 text-sm font-mono` value | None (`accessible={false}`) |
| **tappable** | `text-zinc-300 text-sm` label | `text-zinc-600 text-xs` value + Feather `chevron-right` 16px `text-zinc-600` | `onPress` → sheet or navigation |
| **toggle** | `text-zinc-300 text-sm` label | `<Switch trackColor={{ true: '#f59e0b', false: '#3f3f46' }} thumbColor='#fafafa' />` | `onValueChange` → immediate save |
| **locked** | `text-zinc-400 text-sm` label | `text-zinc-500 text-sm font-mono` value + Feather `lock` 14px `text-zinc-600` | None — `accessibilityLabel="{label}: {value}, locked"` |
| **destructive** | `text-red-400 text-sm font-medium` label | None | `onPress` → confirmation sheet |

**Section headers:** `text-zinc-500 text-xs font-mono tracking-widest uppercase px-4 pt-6 pb-2`

**Section spacing:** Each section's rows are grouped inside a `rounded-2xl overflow-hidden mx-4 mb-4` wrapper so they form a card with shared rounded corners and no gap between rows. The last row in each card has no bottom border.

---

### Editable Field Sheets (Name, Company, Backup Email)

Text fields in ACCOUNT section: tapping the row opens a `@gorhom/bottom-sheet` sheet (50% height, `snapPoints={['50%']}`).

**Sheet layout:**
- Handle: `w-10 h-1 rounded-full bg-zinc-700 self-center mt-3 mb-6`
- Field label: `text-zinc-400 text-xs font-mono tracking-widest uppercase mb-2 px-4`
- `TextInput`: `bg-zinc-800 rounded-xl px-4 py-3.5 text-zinc-100 text-base` + `autoFocus` + `returnKeyType="done"`
- Save button: `bg-amber-500 active:bg-amber-600 rounded-2xl py-3.5 px-6 mx-4 mt-4 items-center` with `text-zinc-950 font-bold text-sm` label "Save"
- Dismiss closes sheet without saving; value reverts

**Autofocus:** Each sheet auto-focuses the text input on open (`ref.focus()` in `onChange` when sheet index becomes 0), which pulls up the keyboard immediately without a second tap.

---

### Radius Slider

When user taps the Radius row, a bottom sheet opens with `@react-native-community/slider`.

**Slider spec:**
```tsx
<Slider
  minimumValue={1}
  maximumValue={radiusCapKm ?? 100}
  step={1}
  value={currentRadius}
  minimumTrackTintColor="#f59e0b"   // amber-400
  maximumTrackTintColor="#3f3f46"   // zinc-700
  thumbTintColor="#f59e0b"
  onSlidingComplete={(value) => handleRadiusSave(value)}
/>
```

**Sheet layout:**
- Label: `text-zinc-400 text-sm` "Search radius"
- Value display: `text-amber-400 font-mono text-3xl font-bold text-center` + `text-zinc-500 text-sm text-center` "km" (below)
- Slider fills `px-4` horizontal insets
- `onSlidingComplete` fires PATCH immediately (not on every slide tick)
- If `radius_cap_km` is non-null: a `text-zinc-600 text-xs text-center mt-2` note "Maximum: {radiusCapKm}km" below the slider

---

### Notification Pre-Prompt Modal

**Container:** NOT a `Modal` — a custom sheet rendered above the tab bar (`position: 'absolute', bottom: tabBarHeight + 16, left: 16, right: 16`). This avoids JS-alert anti-pattern and allows the screen behind it to remain interactive.

**Layout:** `bg-zinc-900 border border-zinc-700 rounded-2xl p-5 shadow-2xl shadow-black/50`

**Entry animation:** `withSpring({ damping: 18, stiffness: 280 })` on `transform: [{ scale: 0.85 → 1.0 }]` + `opacity: 0 → 1`. The spring adds a subtle bounce that draws attention without being jarring.

**Content:**
- Icon: Feather `bell` 24px `text-amber-500` — `mb-3`
- Headline: `text-zinc-100 text-base font-bold mb-1` — "Get notified when your tracked jobs need attention."
- CTA: `bg-amber-500 active:bg-amber-600 rounded-xl py-3 px-5 w-full items-center mt-4` + `text-zinc-950 font-semibold text-sm` "Turn on notifications"
- Secondary: `text-zinc-500 text-sm text-center mt-3` "Not now"

**Exit animation:** `opacity: 1 → 0` + `scale: 1.0 → 0.92` `withTiming(150)` before unmount. Use a `useEffect` cleanup pattern: set `isVisible = false` → wait 150ms → unmount.

---

### Android 13 Notification Channel (Critical)

**Order of operations (Android only):**
```
1. await Notifications.setNotificationChannelAsync('default', { ... })
2. await Notifications.requestPermissionsAsync()
```

The channel MUST be created before `requestPermissionsAsync()` is called on Android 13+. If the permission dialog is requested before the channel exists, the dialog will not appear. This is a known Android 13 regression. The hook must check `Platform.OS === 'android'` and `Platform.Version >= 33` before creating the channel.

Channel spec:
```tsx
await Notifications.setNotificationChannelAsync('default', {
  name: 'Buildo Notifications',
  importance: Notifications.AndroidImportance.HIGH,
  vibrationPattern: [0, 250, 250, 250],
  lightColor: '#f59e0b',
})
```

---

### OS-Denied Notification Row

When `Notifications.getPermissionsAsync()` returns `status !== 'granted'`, the NOTIFICATIONS section renders differently:

**Permission row (denied state):**
- Container: standard `bg-zinc-900 border-b border-zinc-800/60 px-4 min-h-[52px] flex-row items-center justify-between`
- Left: `text-zinc-400 text-sm` "Notifications"
- Right: `flex-row items-center gap-2` — `text-zinc-500 text-xs` "Off" + Feather `external-link` 14px `text-zinc-600`
- `onPress`: `Linking.openSettings()` (deep links to app's iOS Settings or Android App Info)
- `accessibilityLabel`: "Notifications off, tap to open device Settings"

**Toggles disabled state:** `notif_permit_status` and `notif_urgent_alerts` toggle rows are still rendered but `Switch` prop `disabled={true}` + row opacity `opacity-50`. A `text-zinc-600 text-xs px-4 pb-3` row beneath them: "Enable notifications in your device settings to use these controls."

---

### Subscription Status Badge

In the SUBSCRIPTION section (hidden for `admin_managed`):

| Status | Badge style | Text |
|--------|-------------|------|
| `trial` | `bg-amber-500/15 border border-amber-500/30 rounded-full px-3 py-1` · `text-amber-400 text-xs font-mono` | "Trial — {N} days left" |
| `active` | `bg-green-500/15 border border-green-500/30 rounded-full px-3 py-1` · `text-green-400 text-xs font-mono` | "Active" |
| `past_due` | `bg-orange-500/15 border border-orange-500/30 rounded-full px-3 py-1` · `text-orange-400 text-xs font-mono` | "Payment retrying" |
| `expired` | `bg-red-500/15 border border-red-500/30 rounded-full px-3 py-1` · `text-red-400 text-xs font-mono` | "Expired" |

Days remaining for `trial`: computed from `trial_started_at + 14 days - NOW()`, rounded up. If 0 days, show "Expires today" in `text-red-400`.

---

### Deletion Sheets (DataExportSheet + DeleteConfirmModal)

**DataExportSheet** (Step 1): `@gorhom/bottom-sheet` at `snapPoints={['45%']}`.
- Handle + `bg-zinc-900` background
- Feather `download` 28px `text-amber-500` — centred, `mb-4`
- Headline: `text-zinc-100 text-lg font-bold text-center mb-2` "Before you go"
- Body: `text-zinc-400 text-sm text-center mb-6` "Download a copy of your lead history and flight board."
- Download CTA: full-width `bg-zinc-800 border border-zinc-700 rounded-2xl py-4 items-center mb-3` + `text-zinc-200 font-semibold text-sm` "Download my data"
- Skip: `text-zinc-500 text-sm text-center` "Skip and continue"
- Sheet dismisses on either action. On download: shows `ActivityIndicator size="small"` inside the download button while `expo-sharing` opens.

**DeleteConfirmModal** (Step 2): `@gorhom/bottom-sheet` at `snapPoints={['55%']}`.
- `bg-zinc-950` background (darker than DataExportSheet — signals severity)
- Feather `alert-triangle` 28px `text-red-500` — centred, `mb-4`
- Headline: `text-zinc-100 text-lg font-bold text-center mb-2` "Delete your account?"
- Body: `text-zinc-400 text-sm text-center leading-relaxed mb-8` "Your account will be suspended immediately. All data is permanently deleted after 30 days."
- Confirm: full-width `bg-red-500/20 border border-red-500/40 rounded-2xl py-4 items-center mb-3` + `text-red-400 font-semibold text-sm` "Yes, delete my account"
- Cancel: `bg-zinc-800 rounded-2xl py-4 items-center w-full` + `text-zinc-300 font-semibold text-sm` "Cancel"
- On confirm tap: show `ActivityIndicator` inline in the confirm button while PATCH is in-flight. Disable cancel during in-flight request.

---

## 5. Implementation

### Cross-Spec Build Order

This spec is step 5 of 5. **All of specs 93, 94, 95, and 96 must be complete** — Settings reads and writes every field established by those specs.

```
Spec 95 (DB + API) → Spec 93 (Auth) → Spec 94 (Onboarding) → Spec 96 (Subscription gate) → Spec 97 (Settings)
```

### Build Sequence

**Step 1 — Shared row component**
- File: `mobile/src/components/settings/SettingsRow.tsx`
- Base: `bg-zinc-900 border-b border-zinc-800/60 px-4 flex-row items-center justify-between min-h-[52px]`. Props: `label`, `value`, `control` (right slot), `onPress`, `variant: 'display' | 'tappable' | 'toggle' | 'locked' | 'destructive'`.
- Five variants per §4 SettingsRow Component Variants table. Variant determines label color, right-slot content, and interactivity.
- Section card wrapper: `rounded-2xl overflow-hidden mx-4 mb-4` around each section group so rows share rounded corners. Last row within a card: `border-b-0` to eliminate the trailing separator.
- All touch targets: `min-h-[52px]` (Spec 90 §9 — exceeds 44pt minimum).

**Step 2 — Settings screen**
- File: `mobile/app/(app)/settings.tsx`
- `<ScrollView contentContainerStyle={{ paddingBottom: 40 }}>` with 5 section groups. Section header: `text-zinc-500 text-xs font-mono tracking-widest uppercase px-4 pt-6 pb-2`. Each section's rows: section card wrapper `rounded-2xl overflow-hidden mx-4 mb-4`.
- Subscription section: hidden when `subscription_status === 'admin_managed'`. Status badge per §4 Subscription Status Badge table. "Manage subscription" row: `tappable` variant → `WebBrowser.openBrowserAsync('https://buildo.com/billing')` in `expo-web-browser`.
- Tab bar does not hide on scroll (Spec 91 §2 — `tabBarStyle: 'visible'` in screen `options`).
- `BottomSheetModalProvider` must wrap this screen (or the app root) for sheets to work — confirm it is present at the `(app)/_layout.tsx` level before building.

**Step 3 — Save-on-change logic and store separation**
- File: `mobile/app/(app)/settings.tsx`
- Account-level fields (full name, company name, notification toggles) are stored in a separate `mobile/src/store/userProfileStore.ts` Zustand store — not `filterStore`. `filterStore` remains scoped to feed preferences (radius, trade, location mode, defaultTab). This prevents notification toggle changes from triggering a feed re-render (§4 `filterStore` vs `userProfileStore` boundary).
- **Text fields (name, company, backup email):** Tapping the row opens an edit bottom sheet per §4 Editable Field Sheets spec (`@gorhom/bottom-sheet` 50%, autoFocus). Save button fires PATCH with optimistic update; on API error revert store value + show toast `"Couldn't save — try again."` (`bg-zinc-800 border border-red-500/40 rounded-xl px-4 py-3`). Each field independently tracks its pre-change value — one field's revert must not clobber another field's in-flight save.
- **Toggles (notification switches, primary view, location mode):** `onValueChange` fires PATCH immediately (no sheet). Show `ActivityIndicator size="small"` inside the toggle row's right slot while in-flight; replace with the `Switch` once the response returns. On error: revert toggle state + show toast.
- **Radius:** Tapping the Radius row opens a bottom sheet with `@react-native-community/slider` per §4 Radius Slider spec. `onSlidingComplete` fires PATCH. No save button.
- **Phone number exception:** phone number is NOT save-on-blur. Editing the phone field opens a dedicated SMS verification sheet. PATCH fires only after OTP verification succeeds. If the user cancels verification, the old number is preserved in both store and server.

**Step 4 — Location mode switch**
- File: `mobile/app/(app)/settings.tsx` (handler) + reuse `mobile/app/(onboarding)/address.tsx` UI
- On toggle from `gps_live` → `home_base_fixed`: toast `"Enter your home base address to continue"` → bottom sheet opens with address input. Feed suspends (shows last cached data) until address saved. On save: PATCH `{ location_mode: 'home_base_fixed', home_base_lat, home_base_lng }` → `queryClient.invalidateQueries(['leads'])`.
- **Cancellation:** if the user dismisses the address sheet without saving, the toggle reverts to `gps_live` in the store. No PATCH is sent. Feed resumes with live GPS. The suspended state is never left open indefinitely.
- Realtors: `location_mode` toggle not shown (always `home_base_fixed` per Spec 94 §4).

**Step 5 — Notification permission hook**
- File: `mobile/src/hooks/useNotificationSetup.ts`
- MMKV key `hasAskedPermission: boolean` — never show pre-prompt twice (Spec 92 §4.1).
- Leads path trigger: called from `mobile/app/(app)/(tabs)/index.tsx` after first lead card renders (`onViewableItemsChanged` with `viewableItems.length > 0` and `hasAskedPermission === false`).
- **Empty feed fallback:** if `hasAskedPermission = false` and the feed returns zero results after 24 hours (checked via a `trial_started_at + 24h < NOW()` guard), show the pre-prompt anyway with copy: *"Get notified when new leads arrive in your area."* This prevents the prompt from never firing for users in low-permit zones.
- Tracking path trigger: called from flight board after first permit claimed (mutation `onSuccess` callback).
- **Pre-prompt rendering (design per §4):** Rendered absolutely above the tab bar — `position: 'absolute', bottom: tabBarHeight + 16, left: 16, right: 16`. Entry: `withSpring` scale `0.85 → 1.0` + `opacity: 0 → 1`. Exit: `withTiming(150)` opacity + scale out. Not a blocking modal. Layout: `bg-zinc-900 border border-zinc-700 rounded-2xl p-5 shadow-2xl shadow-black/50` per §4 Notification Pre-Prompt Modal.
- **Android 13 channel-before-permissions (critical):** On `Platform.OS === 'android'` call `Notifications.setNotificationChannelAsync('default', { ... })` (per §4 Android 13 spec) BEFORE `Notifications.requestPermissionsAsync()`. Skipping this step causes the system permission dialog to silently not appear on Android 13+.
- "Not now" → write `hasAskedPermission = true`, skip system dialog. "Turn on notifications" → `Notifications.requestPermissionsAsync()` → on grant, register token (Spec 92 §4.1 hardware layer).
- **Settings NOTIFICATIONS section (OS denied state, design per §4):** When `status !== 'granted'`: render permission row as `tappable` variant — `Linking.openSettings()` on press, `external-link` icon, "Off" value label. Render toggle rows with `disabled={true}` + `opacity-50`. Render explanatory sub-label `text-zinc-600 text-xs px-4 pb-3` below the toggles.

**Step 6 — Notification deep-link handler**
- File: `mobile/app/_layout.tsx` (extend root layout)
- `Notifications.addNotificationResponseReceivedListener`: read `data.permitNum + data.revisionNum`.
- **Cold start race condition:** `router.push` must not fire until the app is fully mounted and TanStack Query flight board data is loaded. Implement a deferred navigation pattern: store the pending `{ permitNum, revisionNum }` in a ref on notification response, then execute `router.push` only after the flight board `useQuery` reports `status !== 'loading'`. This prevents navigating to a card before the query has fetched, which would incorrectly show the "no longer on board" toast for an item that does exist.
- If query resolves and the specific item is not in the response: show toast `"This job is no longer on your board."` Do not crash or render a 404 screen (§2.3).
- Extends Spec 92 §3.2 deep-link routing (route domain `flight_board`).

**Step 7 — CSV export endpoint**
- File: `src/app/api/user-profile/export/route.ts`
- Authenticated `GET`. SELECT all PII columns from §2 (Spec 95): `full_name`, `phone_number`, `email`, `company_name`, `home_base_lat/lng`, `supplier_selection`, plus `lead_assignments` and flight board claims joined. Return `Content-Type: text/csv` with `Content-Disposition: attachment; filename="buildo-data-export.csv"`. PIPEDA compliant — all PII included.
- Try-catch per §00 §2.2. `logError` on error.

**Step 8 — Account deletion Step 1: export offer**
- File: `mobile/app/(app)/settings.tsx` (tapping "Delete Account")
- Opens `<DataExportSheet>` (`mobile/src/components/settings/DataExportSheet.tsx`) — `@gorhom/bottom-sheet` at `snapPoints={['45%']}` per §4 Deletion Sheets spec. Not a JS alert. Background `bg-zinc-900`. Feather `download` 28px `text-amber-500`, centred.
- "Download my data": shows `ActivityIndicator size="small"` inside the button while `GET /api/user-profile/export` is in-flight. On success: opens CSV in `expo-sharing`. On error: toast `"Export failed — try again."`. Button re-enables after error.
- "Skip and continue" → sheet snaps closed → `DeleteConfirmModal` opens (500ms delay to let first sheet fully dismiss).

**Step 9 — Account deletion Steps 2–3: confirmation + suspension**
- File: `mobile/src/components/settings/DeleteConfirmModal.tsx`
- `@gorhom/bottom-sheet` at `snapPoints={['55%']}` per §4 Deletion Sheets spec. `bg-zinc-950` background (darker than DataExportSheet — signals severity). Not a JS alert (Spec 90 §5). Feather `alert-triangle` 28px `text-red-500`, centred.
- **"Cancel" button:** `bg-zinc-800 rounded-2xl py-4` — always rendered, disabled while PATCH is in-flight.
- **"Yes, delete my account" button:** `bg-red-500/20 border border-red-500/40 rounded-2xl py-4` — on tap:
  1. Show `ActivityIndicator size="small" color="#f87171"` inside button; disable both buttons.
  2. PATCH `{ account_deleted_at: new Date().toISOString(), subscription_status: 'cancelled_pending_deletion' }` — **must succeed** before proceeding.
  3. Server calls `admin.auth().revokeRefreshTokens(uid)` to immediately invalidate all sessions across all devices.
  4. On PATCH success: `firebase.auth().signOut()` (Spec 93 §3.6) → navigate `/(auth)/sign-in`.
  5. On PATCH failure: re-enable both buttons, show error toast `"Couldn't process deletion — try again."` (`bg-zinc-800 border border-red-500/40`). Do NOT sign out. User remains authenticated.

**Step 10 — Cloud Function hard delete**
- **TODO: Phase 2** — Cloud Function daily sweep: `DELETE FROM user_profiles WHERE account_deleted_at IS NOT NULL AND account_deleted_at < NOW() - INTERVAL '30 days'`. Also deletes Firebase Auth record and all associated tokens. Cloud Functions infra not yet set up.
- 30-day recovery window (§3.2) implemented on the auth side: if `account_deleted_at IS NOT NULL` AND within 30 days, show reactivation prompt on sign-in.

### Testing Gates

- **Unit:** `mobile/__tests__/settings.test.ts` — all 5 sections render with correct row count; save-on-blur fires PATCH with correct field; toggle fires PATCH; optimistic revert fires on 500 response; subscription section hidden for `admin_managed`.
- **Unit:** `mobile/__tests__/notificationSetup.test.ts` — prompt not triggered on cold boot; triggered after first lead card enters viewport; triggered after first permit claim; MMKV gate prevents second prompt; "Not now" writes `hasAskedPermission = true` without calling `requestPermissionsAsync`.
- **Infra:** `src/tests/user-profile-export.infra.test.ts` — CSV response includes all PII column headers; returns 401 for unauthenticated request; empty flight board returns CSV with headers only (no crash).
- **Maestro:** `mobile/maestro/settings.yaml` — navigate to settings → toggle notification preference → navigate away → return → verify toggle persisted.

---

## 6. Operating Boundaries

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
