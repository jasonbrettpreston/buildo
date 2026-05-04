# Spec 92 — Mobile Engagement & Hardware (Pillar 3)

## 1. Goal & User Story

**Goal:** Transform the mobile app from a passive database viewer into an active, intelligent assistant. Maximise tradesperson engagement through timely, actionable push notifications and utilise device hardware (haptics) to create a premium, tactile user experience.

**User Story:** As a tradesperson on a busy job site, I cannot stare at my phone all day. I want my phone to buzz immediately when a massive $500k permit drops in my radius, or when a job I'm tracking suddenly gets stalled by the city, so I can act before my competitors do.

**Design Benchmark:** Delta Air Lines (gate change alerts, urgency tiering), DoorDash/Uber Eats (best-case/worst-case framing, contextual permission), and Apple HIG (badge supplementation, foreground toast, contextual permission timing). Industry research: personalised behavioural notifications are 4× more likely to be opened than generic blasts; a push notification per week correlates with 10% of users disabling notifications and 6% uninstalling — frequency control is critical.

## 2. Notification Matrix (The Triggers)

The Next.js backend is responsible for evaluating rules and dispatching pushes. The mobile app receives two distinct categories of notifications:

### 2.1 Lead Feed (Discovery Engine)

* **Trigger:** `NEW_HIGH_VALUE_LEAD`
* **Condition:** A newly scraped permit matches the user's `trade_slug`, falls within their `radius_km`, and exceeds their defined `cost_tier` threshold.
* **UX Goal:** Drive the user to claim the job quickly — urgency framing.
* **Schedule gate:** Respects user's `notification_schedule` preference (see §2.3). Exception: this trigger is never bypassed by the schedule gate unless the user has explicitly set `"morning"` or `"evening"` windows.

### 2.2 Flight Board (Operational Tracking)

* **Trigger:** `LIFECYCLE_PHASE_CHANGED`
    * **Condition:** A permit the user has "Saved" or "Claimed" moves to the next phase (e.g., *Foundation* → *Framing*).
    * **Schedule gate:** Respects `notification_schedule`.
* **Trigger:** `LIFECYCLE_STALLED`
    * **Condition:** A tracked permit is flagged as delayed by the municipality.
    * **Schedule gate:** **Bypasses** `notification_schedule` — stall alerts are always delivered immediately regardless of time window. Urgency overrides preference.
* **Trigger:** `START_DATE_URGENT`
    * **Condition:** The `predicted_start` date is now ≤ 7 days away.
    * **Schedule gate:** **Bypasses** `notification_schedule` — urgency overrides.

### 2.3 User Controls & Thresholds (The Mute Switch)

Tradespeople must have granular control over what interrupts their day. The `settings.tsx` screen must include:

* **Minimum Value Threshold:** A slider to define what `cost_tier` triggers a `NEW_HIGH_VALUE_LEAD` push.
* **Phase Toggles:** Toggle switches for `LIFECYCLE_PHASE_CHANGED`, `LIFECYCLE_STALLED`, and `START_DATE_URGENT` independently. `LIFECYCLE_STALLED` and `START_DATE_URGENT` default to ON — these are the high-value alerts.
* **Notification Schedule:** A 3-option segmented control defining WHEN non-urgent notifications are delivered:
    * `"Morning"` — 6AM–9AM EST (pre-site window; tradespeople plan their day before arriving)
    * `"Anytime"` — no time restriction (default)
    * `"Evening"` — 5PM–8PM EST (end-of-day planning window)
    * Urgency overrides (`LIFECYCLE_STALLED`, `START_DATE_URGENT`) always bypass this gate.
    * *Rationale:* Consumer apps peak at 8PM. Tradespeople start work at 6–7AM. The morning window is the power window for this audience — validated by field use patterns. Default `"Anytime"` is non-breaking for existing users.
* **Settings UI:** `bg-zinc-800` segmented control container; amber highlight on selected option; `font-mono text-xs` labels.
* **Backend Sync:** All preferences sync to 5 sibling columns on `user_profiles` (flattened from a single `notification_prefs` JSONB column in migration 117 per Spec 99 §9.14). The Next.js dispatch engine reads the flat columns directly before calling the Expo Push API.

**`user_profiles` notification columns** (migration 117 — Spec 99 §9.14):

| Column | Type | Default |
|---|---|---|
| `new_lead_min_cost_tier` | `TEXT` (CHECK `'low' / 'medium' / 'high'`) | `'medium'` |
| `phase_changed` | `BOOLEAN` | `TRUE` |
| `lifecycle_stalled_pref` | `BOOLEAN` | `TRUE` |
| `start_date_urgent` | `BOOLEAN` | `TRUE` |
| `notification_schedule` | `TEXT` (CHECK `'morning' / 'anytime' / 'evening'`) | `'anytime'` |

The `lifecycle_stalled_pref` column is named with the `_pref` suffix to avoid silent ambiguity in pipeline SELECTs that join `permits` (where `lifecycle_stalled` is a derived classification of permit progress) with `user_profiles`. The mobile-side store field stays `lifecycleStalled` — no naming collision in the mobile bundle.

## 3. Payload Schema & Deep Linking

To maintain the "Dumb Glass" architecture and strictly protect PII, the backend MUST NOT send raw builder contact info in the push payload. The payload contains routing IDs only.

### 3.1 The Standardised Payload Fields

When the Next.js API calls the Expo Push Service, the `data` object must strictly adhere to:

```json
{
  "to": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]",
  "title": "Framing Phase Reached",
  "body": "123 Main St has passed foundation inspection.",
  "data": {
    "notification_type": "PHASE_CHANGED",
    "route_domain": "flight_board",
    "entity_id": "permit_12345abc",
    "urgency": "normal"
  }
}
```

* `route_domain`: Enum (`lead_feed` | `flight_board`). Determines which visual tab the user lands in.
* `entity_id`: The unique ID used to fetch full details via TanStack Query upon opening.
* `urgency`: Enum (`normal` | `urgent` | `stalled`). Used by the mobile app to determine local toast styling and type dot colour.

### 3.2 Deep Linking & State Hydration

* **Background Tap:** Tapping the lock-screen notification triggers `Notifications.addNotificationResponseReceivedListener`.
* **Routing Execution:** App reads the payload. It must first switch the bottom tab navigator to the correct `route_domain` (Feed or Flight Board), then push the detail sheet: `router.push('/(app)/[lead]?id=${entity_id}')`.
* **Fallback:** When the user dismisses the detail sheet, they remain on the correct contextual tab. This is the "fallback" pattern — validated by Apple HIG and Delta's own navigation model.

## 4. Elite Mobile-Native UX & Hardware

### 4.1 Permission Flow (Anti-Pattern Avoidance)

Never ask on cold boot. Users instantly deny push permissions if asked immediately after login. Industry consensus: contextual permission requests after a clear value demonstration achieve 50–80% higher acceptance than cold boot requests.

* **Contextual Prompting:** Only trigger `Notifications.requestPermissionsAsync` immediately after the user taps "Save" on their very first lead.
* **Pre-prompt (double permission pattern):** Before the system prompt, show an in-app modal: `"Want us to alert you when this job changes phases?"` with `"Allow"` and `"Maybe Later"` options. Only `"Allow"` triggers the system permission request. This soft-ask is the industry standard (Apple HIG, DoorDash, Uber Eats all use this pattern).
* **MMKV gate:** Store `hasAskedPermission: boolean` in MMKV. Never show the pre-prompt twice.
* **`Maybe Later` path:** User can enable notifications later via Settings screen toggle. Do not re-prompt automatically.

### 4.2 Foreground Handling (In-App Toast)

If the user is actively using the app when a notification fires, do not aggressively rip them to a new screen.

* Trigger `Notifications.addNotificationReceivedListener`.
* Render `<NotificationToast>` dropping from the safe-area top.
* Haptic pairing: Fire `successNotification()`.
* Toast auto-dismisses after 4 seconds. Does NOT auto-navigate (user must tap).

**`NotificationToast.tsx` — complete component spec:**

Entrance animation: `withSpring(-8, { stiffness: 400, damping: 28, mass: 1 })` — snappy, not floaty.
Auto-dismiss: `withTiming(-120, { duration: 220, easing: Easing.in(Easing.ease) })` after 4000ms.
User swipe-up to dismiss early: same `withTiming` dismissal.

NativeWind classes:
* Wrapper: `absolute top-0 left-4 right-4 z-50` (within SafeAreaView insets)
* Card: `bg-zinc-800 border border-amber-500/30 rounded-xl px-4 py-3 flex-row items-center gap-3`
* Type dot: `w-2.5 h-2.5 rounded-full`
    * `NEW_HIGH_VALUE_LEAD`: `bg-amber-500`
    * `LIFECYCLE_PHASE_CHANGED`: `bg-green-500`
    * `LIFECYCLE_STALLED`: `bg-red-500`
    * `START_DATE_URGENT`: `bg-amber-500`
* Title: `text-zinc-100 font-semibold text-sm flex-1`
* Body: `text-zinc-400 text-xs mt-0.5`
* Dismiss X: `text-zinc-600` icon in a 44×44 touch target

### 4.3 Tactile Feedback Architecture (Haptics)

Do not overuse haptics. Reserve them for state mutations to ground the "Industrial Utilitarian" aesthetic. All haptic calls must go through `mobile/src/lib/haptics.ts` typed wrappers — no raw `expo-haptics` calls in components.

| Trigger | Haptic Type | Rationale |
|---------|-------------|-----------|
| Changing tabs | `lightImpact()` | Acknowledges navigation without demanding attention |
| Opening filter sheet | `lightImpact()` | Sheet appearance confirmation |
| Pull-to-refresh activation | `mediumImpact()` | Physical gesture crossing a threshold |
| Saving / claiming a job | `successNotification()` | Successful state mutation — celebratory, not mechanical |
| Swiping to remove from Flight Board | `heavyImpact()` | Destructive action — heavier feedback signals finality |
| Foreground notification received | `successNotification()` | Pairs with toast entrance |

**Rule:** `mediumImpact` is for physical forces (pull-to-refresh threshold). `successNotification` is for completed positive state changes (save, claim). These are different sensations — do not conflate them.

### 4.4 In-App Badging (Unread States)

**Tab Bar Unread Dot**
If a push notification is delivered while the app is backgrounded, reflect the unread state on the tab bar:
* Position: absolute top-right of the Flight Board tab icon
* Size: `w-2.5 h-2.5` (10px — slightly larger than the 8px spec'd originally, for better sunlight visibility)
* Colour: `bg-red-500`
* Halo: `border border-zinc-900` (1px separation from the icon — visually distinct on dark backgrounds)
* Clears when the Flight Board tab becomes focused (`onTabFocus` → `notificationStore.clearUnread()`)
* Apple HIG: "Use badging to supplement notifications, not to denote critical information." The dot is supplementary — it is fine if the user turns off badges in iOS Settings.

**Card-Level Update Flash**
Inside the Flight Board, newly updated cards receive a 2-second amber tint fade:
* Reanimated `useSharedValue(0)` → `withSequence(withTiming(1, {duration: 0}), withDelay(500, withTiming(0, {duration: 1500, easing: Easing.out(Easing.ease)})))`
* AnimatedView `backgroundColor: rgba(245, 158, 11, opacity * 0.12)`, positioned `absolute inset-0 rounded-xl`, `pointerEvents="none"`
* The `isNewlyUpdated` prop is set when the card's `updated_at` is within the last 60 seconds on first board load after app foreground.

## 5. Behavior-Driven Design (Maestro Contract)

Before implementing the routing logic, write `maestro/notifications.yaml`:

```yaml
appId: com.buildo.app
---
- launchApp
- tapOn: "Save Lead"                      # Triggers the contextual permission
- assertVisible: "Want us to alert you"   # Pre-prompt modal visible
- tapOn: "Allow"                          # Triggers system permission request
- tapOn: "Allow"                          # System permission dialog
# Simulate incoming deep link payload
- openLink: "buildo://(app)/lead?id=permit_test_123"
- assertVisible: "Permit Details"         # Router successfully pushed the sheet
```

## 6. Design System Directives

### 6.1 Notification Type Colour Mapping

| Trigger | Dot Colour | Toast Border | Urgency Label |
|---------|-----------|--------------|---------------|
| `NEW_HIGH_VALUE_LEAD` | `bg-amber-500` | `border-amber-500/30` | `"New Lead"` |
| `LIFECYCLE_PHASE_CHANGED` | `bg-green-500` | `border-green-500/30` | `"Phase Update"` |
| `LIFECYCLE_STALLED` | `bg-red-500` | `border-red-500/30` | `"Delayed"` |
| `START_DATE_URGENT` | `bg-amber-500` | `border-amber-500/30` | `"Urgent"` |

### 6.2 Settings Screen Layout (Spec 92 §2.3 Visual)

The settings screen follows the same Industrial Utilitarian token set as Spec 91 §6.1. Notification section layout:

* Section header: `font-mono text-xs text-zinc-400 uppercase tracking-wider px-4 pt-6 pb-2 border-t border-zinc-800`
* Cost tier slider: full width, `tintColor="#f59e0b"`, `minimumTrackTintColor="#f59e0b"`, `maximumTrackTintColor="#3f3f46"`
* Toggle rows: `flex-row justify-between items-center py-3 px-4 border-b border-zinc-800/50`. Label: `text-zinc-100 text-sm`. Toggle: iOS system toggle with amber `onTintColor`.
* Schedule segmented control: `bg-zinc-800 rounded-lg p-1 flex-row`. Selected segment: `bg-amber-500 rounded-md`. Label: `font-mono text-xs`. Unselected: `text-zinc-400`. Selected: `text-zinc-950`.

### 6.3 `notification_schedule` Dispatch Logic (Backend)

When the Next.js dispatch engine evaluates whether to send a notification:

```typescript
const userTz = 'America/Toronto';
const now = toZonedTime(new Date(), userTz);
const hour = now.getHours();

const scheduleAllowed = (() => {
  if (prefs.notification_schedule === 'morning') return hour >= 6 && hour < 9;
  if (prefs.notification_schedule === 'evening') return hour >= 17 && hour < 20;
  return true; // 'anytime'
})();

// Urgency overrides: LIFECYCLE_STALLED and START_DATE_URGENT bypass schedule
const isUrgent = trigger === 'LIFECYCLE_STALLED' || trigger === 'START_DATE_URGENT';
if (!scheduleAllowed && !isUrgent) return; // skip dispatch
```
