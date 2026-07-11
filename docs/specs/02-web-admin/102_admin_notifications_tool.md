# 102 Admin Notifications Tool

<requirements>
## 1. Goal & User Story

Give operators one authenticated place to see what the notification engine (Spec 101) actually delivered, send a real test push to a device, and reach the kill-switch/throttle — replacing the pre-P25 unauthenticated `GET /api/notifications` that leaked any user's history.

**User Story:** an operator opens `/admin/notifications`, sees the last N dispatches (who / what type / ticket / receipt / whether a token was pruned), fires a test push to their own device to confirm the pipe end-to-end, and clicks through to the Control Panel to flip the kill-switch when validation is done.

> **Status:** SPEC AUTHORED (P25 25C). The tool is desktop-first, read-mostly; the only write is the admin test-send (session-authed).
</requirements>

---

<architecture>
## 2. Technical Architecture

### API Endpoints

- **`GET /api/admin/notifications`** — the dispatch log. `verifyAdminAuth` first line; `withApiEnvelope`; returns `ok(data, meta)`. Joins `notification_dispatches` (the ledger) LEFT JOIN `notifications` (the queue, for title/body context), ordered `dispatched_at DESC`, paginated (`meta.page`/`limit`). **Tokens are MASKED** in the response (`ExponentPushToken[…abcd]` → last 4 only) — never return a full push token to the browser. Read-only; no session-method restriction.
- **`POST /api/admin/notifications/test-send`** — sends one real Expo push to a caller-supplied (or the admin's own registered) device token, via `scripts/lib/push-dispatch.js` `sendPushChunk`. **Requires `authMethod === 'session'`** (403 for `admin_key`/`dev_bypass` — it is a write/side-effecting action, per the Spec 33 §8.1 per-admin-identity rule). Returns the Expo ticket in `_debug` (the TestFeedTool convention): `{ data, error, meta, _debug: { ticket_id, status, error_message, platform } }`. Does NOT write a `notification_dispatches` row (test sends are out-of-band — they must not pollute the once-per-day ledger or the throttle count).

### Kill-switch / throttle — READ-ONLY status, deep-link to write
The tool READS `notifications_dispatch_enabled` / `notifications_max_per_user_per_day` / `notifications_disabled_types` and renders their current values with a status chip (ON/OFF). It does **not** write them — editing routes through the existing Spec 86 Control Panel (`/admin/control-panel`) via a deep link. One write path for logic_variables, not two.

### Implementation
- Page: `src/app/admin/notifications/page.tsx` (thin Suspense shell) → `src/components/admin/NotificationsTool.tsx` (TanStack Query for the log; Zustand store `useNotificationsStore` if any client filter state is needed, registered in `resetAdminStores()`).
- Nav card: the 9th card in `src/app/admin/page.tsx`.
- The read-only **Notifications card** for the user-detail page: `src/components/admin/NotificationsCard.tsx` — renders a user's device tokens (masked), their 5 notification prefs, and their last dispatch. Mounted on `/admin/users/[uid]` when that page exists (P24 owns it — coordinate; do NOT scaffold P24's page).
</architecture>

---

<security>
## 3. Auth Matrix
| Role | Access |
|------|--------|
| Anonymous | — |
| Authenticated (non-admin) | — |
| Admin (`session`) | Full: dispatch log + test-send + read-only kill-switch status |
| Admin (`admin_key` / `dev_bypass`) | Dispatch log (read) only; test-send returns 403 (per-admin identity required for a side-effecting send) |
</security>

---

<behavior>
## 4. Behavioral Contract
- **Inputs:** admin GET (dispatch log, paginated); admin POST (test-send with `{ push_token?, platform }`).
- **Core Logic:**
  1. Dispatch log = `notification_dispatches` LEFT JOIN `notifications ON (user_id, lead_id, type)` for context, newest first, tokens masked.
  2. Test-send composes a canonical message (a `LIFECYCLE_PHASE_CHANGED`-shaped payload with `route_domain='flight_board'` + a sample `entity_id`), calls `sendPushChunk`, returns the ticket in `_debug`.
  3. Kill-switch/throttle status read from `logic_variables`; the "edit" affordance is a link to `/admin/control-panel`.
- **Outputs:** the log table; the test-send ticket; a deep link.
- **Edge Cases:**
  - Empty ledger → the table renders an explicit empty state (the engine is inert until the gate flips — expected, not an error).
  - Test-send to a stale token → Expo returns `DeviceNotRegistered` in `_debug.error_message` (the admin sees the failure honestly; the test-send does NOT prune — only the chain dispatcher prunes).
  - `admin_key` caller hits test-send → 403 with a clear message.
</behavior>

---

<testing>
## 5. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic:** token-masking helper (last-4 only, never the full token).
- **UI:** `NotificationsTool.ui.test.tsx` — the log table renders masked tokens; the empty state; the test-send form; the deep-link to the Control Panel.
- **Infra:** `admin-notifications.infra.test.ts` — `GET` requires `verifyAdminAuth` (401 without); `POST /test-send` returns 403 for `admin_key`/`dev_bypass` and 200 with a `_debug.ticket_id` for `session`; the response never contains a full push token.
<!-- TEST_INJECT_END -->
</testing>

---

<constraints>
## 6. Operating Boundaries

### Target Files
- `src/app/admin/notifications/page.tsx`, `src/components/admin/NotificationsTool.tsx`, `src/components/admin/NotificationsCard.tsx`
- `src/app/api/admin/notifications/route.ts`, `src/app/api/admin/notifications/test-send/route.ts`
- `src/app/admin/page.tsx` (9th nav card), `src/lib/admin/session.ts` (store registration, if a store is added)

### Out-of-Scope Files
- `src/app/admin/control-panel/**` — the logic_variables write path stays there; this tool only READS + deep-links.
- `src/app/admin/users/[uid]/page.tsx` — owned by P24 (Spec 21); this spec contributes only the `NotificationsCard` component + the mount point.

### Cross-Spec Dependencies
- **Relies on:** Spec 101 (the engine, ledger, and `push-dispatch` transport), Spec 33/34/35/36/89 (admin conventions), Spec 86 (Control Panel — kill-switch write path).
- **Consumed by:** operators.
</constraints>
