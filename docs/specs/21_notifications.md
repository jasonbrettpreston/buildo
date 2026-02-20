# 21 - Notifications

**Status:** Planned
**Last Updated:** 2026-02-14
**Depends On:** `01_database_schema.md`, `07_trade_taxonomy.md`, `13_auth.md`
**Blocks:** None

---

## 1. User Story

> "As a tradesperson, I want to be notified when new permits matching my trades appear so I don't miss opportunities."

**Acceptance Criteria:**
- Users receive notifications through 3 channels: in-app, email (SendGrid), and push (Firebase Cloud Messaging)
- Notification preferences are configurable per user: trade filters, postal codes, wards, cost range, and alert frequency
- Alert frequency supports instant, daily digest, and weekly digest modes
- Duplicate notifications for the same permit+user+type combination are suppressed within a 24-hour window
- Digest emails group notifications by trade for easy scanning
- Every email includes a one-click unsubscribe link that immediately disables that channel
- In-app notifications display a bell icon with unread badge count

---

## 2. Technical Logic

### Architecture

Pub/Sub fan-out pattern: permit data changes publish to a `permit-changes` topic. A `match-notifications` Cloud Function subscribes, evaluates each change against all user preferences, and fans out matching notifications to the appropriate channels.

```
[Sync Pipeline] -> [Pub/Sub: permit-changes] -> [Cloud Function: match-notifications]
                                                        |
                                                        ├── In-App: INSERT into notifications table
                                                        ├── Email: SendGrid transactional API
                                                        └── Push: Firebase Cloud Messaging
```

### Notification Channels

| Channel | Mechanism | Latency Target |
|---------|-----------|----------------|
| In-App | PostgreSQL `notifications` table, client polls every 30s | < 60s |
| Email | SendGrid transactional email via API | < 5 min (instant), scheduled (digest) |
| Push | Firebase Cloud Messaging (FCM) to registered devices | < 60s |

### User Preferences (Firestore)

Stored at `/users/{uid}/preferences/notifications`:

```typescript
interface NotificationPreferences {
  trade_filters: string[];          // trade slugs, e.g. ['plumbing', 'hvac']
  postal_codes: string[];           // e.g. ['M5V', 'M6H']
  wards: number[];                  // Toronto ward numbers
  cost_range: {
    min: number | null;             // minimum estimated cost ($)
    max: number | null;             // maximum estimated cost ($)
  };
  alert_frequency: 'instant' | 'daily_digest' | 'weekly_digest';
  channels: {
    in_app: boolean;
    email: boolean;
    push: boolean;
  };
  email_unsubscribed: boolean;      // set true via unsubscribe link
  fcm_tokens: string[];             // registered device tokens
}
```

### Matching Algorithm

```
matchPermitToUsers(permit):
  1. Load all user preferences (cached in memory, refreshed every 5 min)
  2. For each user:
     a. Check trade_filters: permit's classified trades INTERSECT user's trade_filters
     b. Check postal_codes: permit's postal_code prefix IN user's postal_codes (or empty = all)
     c. Check wards: permit's ward IN user's wards (or empty = all)
     d. Check cost_range: permit's est_cost >= min AND <= max (nulls = no bound)
     e. If ALL non-empty filters match -> queue notification
  3. For each matched user:
     a. Check deduplication: no existing notification for same permit_num + user_id + type within 24h
     b. Route to enabled channels based on user's channel preferences and alert_frequency
```

### Deduplication

```
isDuplicate(user_id, permit_num, type):
  SELECT COUNT(*) FROM notifications
  WHERE user_id = $1
    AND permit_num = $2
    AND type = $3
    AND created_at > NOW() - INTERVAL '24 hours'
  RETURN count > 0
```

### Digest Batching

- Daily digest: Cloud Scheduler triggers at 07:00 ET daily
- Weekly digest: Cloud Scheduler triggers Monday at 07:00 ET
- Digest query groups pending notifications by trade_slug, orders by lead_score DESC within each group
- Single SendGrid template with dynamic sections per trade group
- After sending, mark all included notifications as `is_sent = true`

### Unsubscribe Flow

- Each email contains an unsubscribe link: `https://app.buildo.ca/api/notifications/unsubscribe?token={jwt}`
- JWT contains: user_id, channel ('email'), expiry (30 days)
- Endpoint sets `email_unsubscribed = true` in user preferences
- Renders a confirmation page with option to re-subscribe
- Compliant with CASL (Canadian Anti-Spam Legislation)

---

## 3. Associated Files

| File | Purpose | Status |
|------|---------|--------|
| `src/lib/notifications/types.ts` | Notification and preference TypeScript interfaces | Planned |
| `src/lib/notifications/matcher.ts` | Preference matching algorithm | Planned |
| `src/lib/notifications/dedup.ts` | Deduplication check logic | Planned |
| `src/lib/notifications/digest.ts` | Digest grouping and scheduling | Planned |
| `functions/match-notifications/index.ts` | Cloud Function: Pub/Sub subscriber, fan-out | Planned |
| `migrations/010_notifications.sql` | Create notifications table | Planned |
| `src/app/api/notifications/route.ts` | GET user notifications, PATCH mark as read | Planned |
| `src/app/api/notifications/unsubscribe/route.ts` | GET unsubscribe handler | Planned |
| `src/components/notifications/NotificationBell.tsx` | Bell icon with unread badge | Planned |
| `src/components/notifications/NotificationList.tsx` | Dropdown list of notifications | Planned |
| `src/components/notifications/PreferencesForm.tsx` | Notification settings form | Planned |

---

## 4. Constraints & Edge Cases

- **Preference cold start:** New users with no preferences set receive no notifications. Onboarding must prompt for at least one trade filter.
- **Empty filter = match all:** If a user leaves postal_codes empty, all postal codes match. Same for wards. This is intentional for broad monitoring. Cost range nulls mean no bound on that side.
- **High fan-out:** A single permit change could match thousands of users. The Cloud Function must process in batches of 500 and use concurrent channel dispatching.
- **FCM token staleness:** Tokens expire or become invalid. On FCM error `messaging/registration-token-not-registered`, remove the token from the user's fcm_tokens array.
- **SendGrid rate limits:** SendGrid allows 600 emails/min on the Pro plan. Digest batching naturally stays within limits. Instant notifications must use a queue with rate limiting.
- **Dedup race condition:** Two near-simultaneous permit updates could create duplicate notifications. Use a unique constraint on (user_id, permit_num, type, DATE(created_at)) as a safety net.
- **Unsubscribe token expiry:** If the JWT in an unsubscribe link has expired, render a page asking the user to log in and manage preferences manually.
- **Timezone handling:** All digest schedules use Eastern Time (America/Toronto). Store user timezone preference for future per-user scheduling.
- **CASL compliance:** All commercial emails must include sender identification, unsubscribe mechanism, and physical mailing address.

---

## 5. Data Schema

### `notifications` Table

```sql
CREATE TABLE notifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       VARCHAR(128) NOT NULL,
  type          VARCHAR(50) NOT NULL,           -- 'new_permit', 'permit_update', 'status_change'
  title         VARCHAR(255) NOT NULL,
  body          TEXT NOT NULL,
  permit_num    VARCHAR(50),
  trade_slug    VARCHAR(50),
  channel       VARCHAR(20) NOT NULL,           -- 'in_app', 'email', 'push'
  is_read       BOOLEAN NOT NULL DEFAULT FALSE,
  is_sent       BOOLEAN NOT NULL DEFAULT FALSE,
  sent_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_unread ON notifications(user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX idx_notifications_user_created ON notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_digest ON notifications(channel, is_sent, created_at) WHERE is_sent = FALSE;
CREATE UNIQUE INDEX idx_notifications_dedup ON notifications(user_id, permit_num, type, (created_at::date));
```

### TypeScript Interface

```typescript
interface Notification {
  id: string;
  userId: string;
  type: 'new_permit' | 'permit_update' | 'status_change';
  title: string;
  body: string;
  permitNum: string | null;
  tradeSlug: string | null;
  channel: 'in_app' | 'email' | 'push';
  isRead: boolean;
  isSent: boolean;
  sentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
```

---

## 6. Integrations

| System | Direction | Purpose |
|--------|-----------|---------|
| Sync Pipeline (`02`, `03`) | Upstream | Publishes permit changes to Pub/Sub topic |
| Trade Taxonomy (`07`) | Reference | Trade slugs for preference matching and digest grouping |
| Authentication (`13`) | Reference | User ID for notification ownership, JWT for unsubscribe tokens |
| Onboarding (`14`) | Upstream | Captures initial notification preferences during signup |
| SendGrid | External | Transactional email delivery for instant and digest notifications |
| Firebase Cloud Messaging | External | Push notification delivery to mobile/web clients |
| Google Cloud Pub/Sub | External | Event bus for permit change fan-out |
| Google Cloud Scheduler | External | Triggers daily and weekly digest jobs |
| Subscription (`25`) | Reference | Channel availability gated by plan (Free = in-app only) |

---

## 7. Triad Test Criteria

### A. Logic Layer

| Test Case | Input | Expected Output |
|-----------|-------|-----------------|
| Trade filter match | Permit with trades ['plumbing'], user prefs trade_filters ['plumbing', 'hvac'] | Match = true |
| Trade filter miss | Permit with trades ['electrical'], user prefs trade_filters ['plumbing'] | Match = false |
| Empty trade filter | Permit with trades ['roofing'], user prefs trade_filters [] | Match = false (no trades selected = no notifications) |
| Postal code match | Permit postal 'M5V 2H1', user prefs postal_codes ['M5V'] | Match = true |
| Postal code wildcard | Permit postal 'M5V 2H1', user prefs postal_codes [] | Match = true (empty = all) |
| Ward match | Permit ward 10, user prefs wards [10, 11, 12] | Match = true |
| Cost range match | Permit cost $500K, user prefs min: $100K, max: $1M | Match = true |
| Cost range no upper bound | Permit cost $5M, user prefs min: $100K, max: null | Match = true |
| Dedup within 24h | Same permit_num + user_id + type, created 2h ago | Duplicate = true, skip |
| Dedup after 24h | Same permit_num + user_id + type, created 25h ago | Duplicate = false, send |
| Digest grouping | 5 plumbing + 3 hvac notifications | Grouped into 2 sections, ordered by trade |
| Unsubscribe token valid | Valid JWT with user_id, not expired | Sets email_unsubscribed = true |
| Unsubscribe token expired | Expired JWT | Returns error, prompts manual login |
| Multi-channel routing | User has in_app: true, email: true, push: false | Creates in_app + email notifications, no push |

### B. UI Layer

| Test Case | Verification |
|-----------|-------------|
| Bell icon badge | Unread count displays on notification bell; 0 unread = no badge |
| Badge count accuracy | Badge shows exact unread count up to 99, then "99+" |
| Notification list | Clicking bell opens dropdown with notifications sorted by date DESC |
| Mark as read | Clicking a notification marks it as read, decrements badge count |
| Mark all as read | "Mark all as read" button sets all in-app notifications to read |
| Empty state | No notifications shows friendly empty state message |
| Notification click-through | Clicking a permit notification navigates to permit detail page |
| Preferences form | All preference fields render and save correctly |
| Channel toggles | Toggling a channel on/off updates preferences in real time |
| Frequency selector | Dropdown shows instant / daily digest / weekly digest options |

### C. Infra Layer

| Test Case | Verification |
|-----------|-------------|
| Pub/Sub delivery | Message published to `permit-changes` triggers Cloud Function within 10s |
| Cloud Function execution | Function processes a permit change and creates notification rows |
| SendGrid API call | Email notification triggers SendGrid API with correct template and dynamic data |
| SendGrid error handling | SendGrid 429 (rate limit) retries with exponential backoff |
| FCM push delivery | Push notification delivered to registered FCM token |
| FCM invalid token cleanup | Invalid token error removes token from user preferences |
| Notifications table exists | Migration `010_notifications.sql` creates table with all columns and indexes |
| Dedup constraint | Inserting duplicate (user_id, permit_num, type, date) raises unique violation |
| Polling endpoint | `GET /api/notifications?unread=true` returns unread notifications within 200ms |
| Digest scheduler | Cloud Scheduler fires at 07:00 ET, triggers digest Cloud Function |
