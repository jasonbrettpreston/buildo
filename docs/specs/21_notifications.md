# Spec 21 -- Notifications

## 1. Goal & User Story
As a tradesperson, I want to be notified when new permits matching my trades appear so I don't miss opportunities, via in-app alerts, email digests, and push notifications.

## 2. Auth Matrix
| Role | Access |
|------|--------|
| Anonymous | None |
| Authenticated | Read/Write (own) |
| Admin | None |

## 3. Behavioral Contract
- **Inputs:** Permit changes published to `permit-changes` Pub/Sub topic by sync pipeline; user notification preferences stored in Firestore at `/users/{uid}/preferences/notifications` (see `NotificationPreferences` in `src/lib/notifications/types.ts`): trade filters, postal codes, wards, cost range, alert frequency (instant/daily/weekly digest), and per-channel toggles (in-app, email, push).
- **Core Logic:**
  - Pub/Sub fan-out: `match-notifications` Cloud Function subscribes to permit changes, evaluates each against all user preferences (cached, refreshed every 5 min), and routes matches to enabled channels.
  - Matching algorithm (see `src/lib/notifications/matcher.ts`): permit trades INTERSECT user trade_filters (empty trades = no notifications), postal prefix IN user postal_codes (empty = all), ward IN user wards (empty = all), cost within min/max range (nulls = no bound). ALL non-empty filters must match.
  - Deduplication: same permit_num + user_id + type within 24-hour window is suppressed. Unique constraint on `(user_id, permit_num, type, DATE(created_at))` as safety net.
  - Three channels: in-app (PostgreSQL `notifications` table, client polls every 30s), email (SendGrid transactional API), push (Firebase Cloud Messaging).
  - Digest batching: daily at 07:00 ET, weekly Monday at 07:00 ET via Cloud Scheduler. Groups pending notifications by trade_slug, ordered by lead_score DESC within each group. Marks included notifications as `is_sent = true`.
  - Unsubscribe: one-click link in every email with JWT token (user_id, channel, 30-day expiry). Sets `email_unsubscribed = true`. CASL compliant.
  - Bell icon with unread badge count (up to "99+"). `GET /api/notifications` supports pagination and unread filter. `PATCH` for mark_read / mark_all_read.
- **Outputs:** In-app notification list (bell dropdown), email notifications (instant or digest), push notifications. Data in PostgreSQL `notifications` table (see migration 010). Note: columns are `is_read`/`is_sent` in DB, mapped to `read`/`sent` in TS interfaces.
- **Edge Cases:**
  - New user with no preferences: receives no notifications until onboarding sets at least one trade filter.
  - High fan-out (one permit matches thousands of users): Cloud Function batches in groups of 500 with concurrent channel dispatching.
  - Stale FCM token: on `messaging/registration-token-not-registered` error, remove token from user's array.
  - Expired unsubscribe JWT: render page prompting manual login to manage preferences.
  - Dedup race condition: unique constraint prevents duplicates from near-simultaneous updates.

## 4. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic** (`notifications.logic.test.ts`): Notification Matching Logic; Notification Email Templates; Alert Frequency Logic
<!-- TEST_INJECT_END -->

## 5. Operating Boundaries

### Target Files (Modify / Create)
- `src/lib/notifications/email.ts`
- `src/lib/notifications/matcher.ts`
- `src/lib/notifications/push.ts`
- `src/lib/notifications/repository.ts`
- `src/lib/notifications/types.ts`
- `src/app/api/notifications/route.ts`
- `src/components/notifications/NotificationBell.tsx`
- `src/tests/notifications.logic.test.ts`

### Out-of-Scope Files (DO NOT TOUCH)
- **`src/lib/classification/`**: Governed by Spec 08. Do not modify classification engine.
- **`src/lib/sync/`**: Governed by Spec 02/04. Do not modify ingestion pipeline.
- **`migrations/`**: Governed by Spec 01. Raise a query if schema must change.

### Cross-Spec Dependencies
- Relies on **Spec 01 (Database Schema)**: Uses `notifications` table.
- Relies on **Spec 07 (Trade Taxonomy)**: Matches notifications to user trade preferences.
- Relies on **Spec 13 (Auth)**: Reads user profile and notification preferences.
