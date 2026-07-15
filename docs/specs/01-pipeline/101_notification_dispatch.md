# 101 Notification Dispatch Engine

<requirements>
## 1. Goal & User Story

Deliver each push notification a saved-lead user should receive **exactly once per day per (user, lead, type)**, from a single gated pipeline step that reads one durable queue — replacing the two disconnected pre-P25 systems (a direct sender with no cross-run memory, and a queue nobody read).

**User Story:** A tradesperson who saved a permit gets one "phase advanced" push the morning it advances — not two (the classifier step runs in both daily chains), and not zero (the Spec 82 evaluator wrote a `notifications` row that no sender ever delivered).

> **Status:** IMPLEMENTED behind a kill-switch (`notifications_dispatch_enabled`, seeded **OFF**). The engine, ledger, and step ship inert; the gate is flipped ON last (the P16 pattern). Until the flip, production delivery is unchanged.
</requirements>

---

<architecture>
## 2. Technical Architecture

### The problem this replaces (verified 2026-07-11)

Two systems existed and neither worked end-to-end:

- **System A — the direct sender.** `scripts/classify-lifecycle-phase.js` (`callExpoPushApi`, `dispatchPhaseChangePushes`, `dispatchStartDateUrgentPushes`) is a hardened Expo HTTP sender wired into **both** daily chains. It fires three pref-gated types (`LIFECYCLE_PHASE_CHANGED`, `LIFECYCLE_STALLED`, `START_DATE_URGENT`) directly to Expo with **no cross-run memory** → `START_DATE_URGENT` double-sends every morning (the step runs twice).
- **System B — the queue nobody read.** `scripts/update-tracked-projects.js` (Spec 82) `INSERT`s rich alert rows into the `notifications` table (migration 010: `channel` / `is_sent` / `sent_at` — a queue built and never activated). **No process reads `notifications` and sends.** It is also unreachable for mobile savers (its evaluator short-circuits on `status='saved'`; only claim-states fire, and mobile has no claim flow).

### The consolidated architecture

```
  ┌─ classify-lifecycle-phase.js ─┐   (ENQUEUER 1: phase/stall/urgent — same-txn)
  │                               │
  ├─ update-tracked-projects.js ──┤   (ENQUEUER 2: Spec 82 claimed-state evaluator)
  │                               ▼
  │                        notifications (the durable queue, mig 010 + lead_id)
  │                               │
  └─ dispatch_notifications ──────┘   (THE ONE DISPATCHER — gated step, permits chain)
                                  │        · dedup against notification_dispatches ledger
                                  │        · pref gate + kill-switch + per-day throttle
                                  │        · quiet-hours defer (valid_until) / expiry
                                  ▼        · Expo send (scripts/lib/push-dispatch.js)
                          notification_dispatches (the once-per-day LEDGER)
```

- **Two enqueuers, one dispatcher.** Both scripts stop sending to Expo and instead **write intent rows into `notifications`**. The single new step `dispatch_notifications` is the *only* code that talks to Expo.
- **The ledger is the dedup + audit truth.** `notification_dispatches` records every actually-delivered (user, lead, type, Toronto-date) tuple and gives the admin tool (Spec 102) an authenticated delivery log. Its `UNIQUE` constraint blocks a *cross-run* double-send (a second chain run collides on the ledger key). It does **NOT** block a *same-run* double-send from two duplicate queue rows: the whole chunk is transmitted to Expo before any ledger row is written, so both duplicates would be pushed and only the second ledger INSERT would no-op. The same-run vector is closed separately by the dispatcher's **in-run dedup** (25E #1): duplicate `(user, lead, type, token)` rows collapse to one push and the losers are stamped `is_sent=true, sent_at=NULL` *before* the send loop (crash-safe). Enqueuer-side `DISTINCT ON` (multi-trade fan-out) is the belt; the in-run dedup is the suspenders that also catch the cross-chain URGENT re-insert.

### Database Schema

#### `notifications` (the queue — migration 010, extended by P25)
Existing columns: `id`, `user_id`, `type`, `title`, `body`, `permit_num`, `trade_slug`, `channel`, `is_read`, `is_sent`, `sent_at`, `created_at`. P25 adds:

| Column | Type | Notes |
|---|---|---|
| `lead_id` | `VARCHAR(120)` NULL | Canonical routing key (`permit:<num>:<rev>` or `coa:<application_number>`). Retires the CoA-in-`permit_num` polymorphism (Spec 82 §4 F.4 note). Enqueuers populate it; the dispatcher reads it for the deep-link `entity_id` and the ledger key. |

`is_sent` / `sent_at` remain the per-row "the dispatcher has processed this queue row" markers; the durable per-day fact lives in the ledger.

#### `notification_dispatches` (the LEDGER — new, migration 218)
| Column | Type | Constraints |
|---|---|---|
| `id` | `BIGSERIAL` | PK |
| `user_id` | `VARCHAR(100)` | NOT NULL |
| `lead_id` | `VARCHAR(120)` | NOT NULL (dedup key component; enqueuers must resolve it) |
| `type` | `VARCHAR(50)` | NOT NULL — one of the canonical constants (§ type constants) |
| `toronto_date` | `DATE` | NOT NULL — the America/Toronto calendar date of dispatch |
| `push_token` | `VARCHAR(200)` | NULL — the exact token targeted (for prune audit) |
| `expo_ticket_id` | `VARCHAR(200)` | NULL — Expo ticket id (feeds the receipt pass) |
| `status` | `VARCHAR(20)` | NOT NULL DEFAULT `'sent'` — `sent` / `error` / `deferred` / `deferred_expired` / `stale_dropped` (the 5th value, mig 222 — a URGENT row retired past the freshness bound) |
| `receipt_checked_at` | `TIMESTAMPTZ` NULL | Mig 222. Set once the receipt pass has examined this ticket, so the widened (5-day) lookback never re-fetches it. |
| `detail` | `TEXT` | NULL — error summary or defer reason |
| `dispatched_at` | `TIMESTAMPTZ` | NOT NULL DEFAULT NOW() |

**`UNIQUE (user_id, lead_id, type, toronto_date)`** — the once-per-day guarantee. The dispatcher writes the ledger row inside the same transaction as the send-intent and relies on `ON CONFLICT DO NOTHING` to skip a tuple already delivered today (across BOTH chain runs).

### Implementation

- **`scripts/lib/notification-types.js`** — the ONE canonical type-constants module. Exports the string literals the mobile parser actually routes on, plus the pref-column map and the deferrable/quiet-hours-gated set. Both enqueuers, the dispatcher, and the tests import from here (no scattered literals).
- **`scripts/lib/push-dispatch.js`** — the hardened `callExpoPushApi`, extracted from `classify-lifecycle-phase.js` and made **transport-injectable** (`createDispatcher({ transport })`) so the test battery drives a mock transport. Preserves the WF3 2026-05-04 hardening (non-2xx reject, per-ticket error parsing, `DeviceNotRegistered` surfacing) byte-for-behavior.
- **`scripts/dispatch-notifications.js`** — the new Spec 47 step (§R1–R12): advisory lock, config Zod, streamed read of un-dispatched `notifications` rows, per-row gate → send → ledger write, `emitSummary` audit rows, `emitMeta`.
- **Enqueuer edits:** `classify-lifecycle-phase.js` (System A) and `update-tracked-projects.js` (System B) stop calling Expo; they write `notifications` rows (same transaction as their existing state writes).

### Chain wiring
`dispatch_notifications` is registered in `manifest.json` `chains.permits` **immediately after `update_tracked_projects`** (so it sees the freshest enqueued intents from both enqueuers). It is NOT added to the CoA chain in v1 (CoA alert types are fenced — see §4). Advisory lock id **123** (Spec 47 §A.5 registry — spec number 101 was taken by `purge-lead-views.js` and 122 by a one-time backfill, so 123 is assigned from the free range per the compute-phase-calibration precedent; uniqueness enforced by `src/tests/pipeline-advisory-lock.infra.test.ts`).
</architecture>

---

<security>
## 3. Auth Matrix
| Surface | Access |
|------|--------|
| `GET /api/notifications` | **Authenticated** — user identity from the verified Firebase session (`getUserIdFromSession`), NEVER a `user_id` query param. (P25 25A fixed the pre-existing IDOR where any caller could read any user's history.) |
| `PATCH /api/notifications` | **Authenticated** — mutates only the session user's rows. |
| `dispatch_notifications` step | Pipeline-internal; no HTTP surface. |
| Admin dispatch log / test-send | **Admin** (Spec 102). |
</security>

---

<behavior>
## 4. Behavioral Contract

- **Inputs:** the `notifications` queue rows written by the two enqueuers during a permits-chain run; `logic_variables` (`notifications_dispatch_enabled`, `notifications_disabled_types`, `notifications_max_per_user_per_day`); `device_tokens`; `user_profiles` preference columns.
- **Core Logic (`dispatch_notifications`):**
  1. **Kill-switch.** If `notifications_dispatch_enabled = 0` → emit a SKIP-shaped summary (0 dispatched) and return. No sends. (Seeded OFF.)
  2. **Read.** Stream `notifications` rows not yet delivered today (LEFT JOIN the ledger on `(user_id, lead_id, type, toronto_date)`, `WHERE ledger.id IS NULL`), joined to `device_tokens` and the user's pref columns.
  3. **Type gate.** Skip rows whose `type` ∈ `notifications_disabled_types` (JSONB array) or whose per-type user preference is off. v1 delivers only the three canonical types; `COA_*` and `NEW_HIGH_VALUE_LEAD` are fenced.
  4. **Per-day throttle.** Count today's ledger rows for the user; if ≥ `notifications_max_per_user_per_day`, defer the row (do not send).
  5. **Quiet-hours under a once-daily cron (25E #3).** Only `LIFECYCLE_PHASE_CHANGED` is schedule-gated (on the user's `notification_schedule`). The dispatcher runs **once daily at ~6 AM ET** (`local-cron.js` `0 6 * * 1-5`), so a window that is *later today* (an `'evening'` 17-20 preference) is never reached by a subsequent run — deferring it would loop **forever**. PRODUCT RULING: an out-of-window row whose window has **not yet passed** is **delivered in the morning run** (not deferred); a window that **already passed** today writes `deferred_expired` (counted, dropped — no stale push). There is therefore no standing `deferred` state under the current single-cron cadence. **Reversal fence:** if an evening dispatch cron is ever added, restore the strict defer-into-the-reachable-window behavior. (The `deferred` status remains in the schema + code for that future cadence + the throttle path.)
  6. **Send.** `push-dispatch.callExpoPushApi` in chunks of ≤100. On success, `INSERT ... ON CONFLICT DO NOTHING` a `sent` ledger row (the dedup key). On `DeviceNotRegistered`, prune that **exact** token (§ two-stage pruning) and record `error`.
  7. **Toronto-date dedup.** The dedup calendar date is `America/Toronto`, stored in `notification_dispatches.toronto_date` (DST-aware; the product runs on Toronto time — cron 6 AM ET). This closes the UTC-boundary hole where two runs straddling midnight-UTC would look like different days.
- **URGENT freshness bound (25E #4).** Before the send loop, `START_DATE_URGENT` rows older than `notifications_max_stale_hours` (logic_variable, default 168h — the 6-7 day URGENT enqueue horizon; a URGENT row older than that has an elapsed predicted-start and a now-false "starts in N days" body) are swept: `is_sent=true, sent_at=NULL` + a per-tuple `stale_dropped` ledger row. **Scoped to URGENT only** — `LIFECYCLE_PHASE_CHANGED` / `LIFECYCLE_STALLED` bodies are not time-derived, so they keep the unconditional-retry contract (an Expo-outage-stuck send must not be silently dropped). The first-flip backlog for those types is handled by the runbook pre-flip check + a one-time operator sweep, not an automatic age-drop.
- **`sent_at` convention (25E).** `is_sent=true & sent_at=NULL` = "the dispatcher retired this row WITHOUT a push" (a suppressed duplicate or a stale-drop); `sent_at` non-null = a real delivery. The precise disposition lives in the ledger `status`.
- **Outputs:** Expo pushes; ledger rows; §R10 audit rows `dispatched` / `delivery_errors` / `tokens_pruned` / `deferred` / `deferred_expired` / `stale_dropped` / `duplicates_suppressed` / `eligible_ceiling_hit` (each a named row feeding the row-derived verdict cascade); `notifications.is_sent`/`sent_at` stamped.
- **Per-day throttle is enforced at chunk-build (25E #5).** The cap gates whether a row enters the outbound chunk (not a post-send check — a chunk is transmitted in one HTTP call before per-message results are known). The per-user count is seeded from today's `sent` ledger rows, provisionally incremented on admit, and rolled back on a send failure (so a failed push never consumes a slot).
- **Edge Cases:**
  - **No device token** → the row is a no-op (nothing to send); counted, not errored.
  - **Both chains run same morning** → the second run's rows collide on the ledger `UNIQUE` and are skipped (`ON CONFLICT DO NOTHING`).
  - **Kill-switch flipped mid-run** → config is read once at startup (§R5); the run finishes on the value it began with.
  - **Enqueuer wrote a row but user un-saved** → the enqueuers only write for currently-saved leads; a stale queue row for an unsaved lead still gets its pref/token gate and simply finds no token / no active save.

### Two-stage token pruning (exact token string only)
- **Ticket-time (this run):** an Expo `DeviceNotRegistered` per-ticket error → immediately `DELETE FROM device_tokens WHERE push_token = $exact` (the offending token only — NEVER a user's other devices). Catches most dead tokens.
- **Receipt-time (next run):** Expo receipts lag ~24 h. At the START of each run, the dispatcher fetches receipts for the prior run's `expo_ticket_id`s and prunes any that resolved to `DeviceNotRegistered`. No new cron; the two-phase Expo contract is honored honestly (the latency is documented, not hidden).
</behavior>

---

<failure_modes>
## 4a. Known Failure Modes

- **"The queue had no sender" (the originating defect, 2026-07-11).** Spec 82's evaluator wrote `notifications` rows that nothing delivered, while System A sent without a queue. Guard: this engine — the ledger-backed `dispatch_notifications` step is the single sender; a mock-transport battery (`dispatch-notifications.*.test`) asserts a queued row produces exactly one ledger row and one transport call. (Guard commit: P25 25A/25E.)
- **Double-send of `START_DATE_URGENT`.** Two vectors, two guards. **Cross-run** (a second chain run re-dispatches the same tuple): the ledger `UNIQUE(user_id, lead_id, type, toronto_date)` + `ON CONFLICT DO NOTHING`. **Same-run** (two duplicate queue rows in ONE dispatch run — the cross-chain URGENT re-insert, since `classify-lifecycle-phase.js` enqueues in both chains, and multi-trade `lead_views` fan-out): the ledger does NOT catch this (the whole chunk is sent before any ledger write), so the dispatcher's **in-run dedup** collapses `(user, lead, type, token)` duplicates to one push and stamps the losers `is_sent=true, sent_at=NULL` BEFORE the send loop (crash-safe — a crash after the winner sends must not leave a live duplicate to re-send next day), plus enqueuer `DISTINCT ON` at the source. (Guard commit: P25 25E.) Regression tests: `dispatch-notifications.db.test.ts` T3 (cross-run) + T11 (same-run dedup).
- **Freshness / first-flip backlog storm (25E #4).** The enqueuers write regardless of the gate, so a long inert period accumulates a backlog; on flip a naive drain would deliver stale content (a `START_DATE_URGENT` "starts in N days" body computed at enqueue). Guard: the URGENT freshness sweep (`notifications_max_stale_hours`, URGENT-scoped) + the runbook pre-flip backlog check/sweep. Non-URGENT types keep unconditional retry (their bodies are not time-derived). Regression test: T13.
- **UTC-boundary dedup hole.** A naive `DATE(now())` in UTC would treat two runs straddling 00:00 UTC (7 / 8 PM ET) as different days. Guard: the dedup date is `America/Toronto`, computed and stored explicitly.
- **CoA multi-user tracker residual (pre-existing, FENCED in v1).** `uniq_tracked_projects_lead_id` (mig 140) is GLOBAL on `lead_id`, so a `coa:` lead can have only ONE tracker across all users; a second user's save is silently dropped by the Spec 82 self-feed `DO NOTHING`. This engine does not fix it — `COA_*` alert types are fenced in v1 (they file to the CoA-launch WF). Documented here and in `docs/reports/review_followups.md`. When CoA alerts un-fence, this constraint must become per-user first.
- **Geographic-expansion timezone assumption.** The dedup + quiet-hours logic assumes a single `America/Toronto` timezone (the corpus IS Toronto). If the product ever serves a second timezone, the ledger `toronto_date` and the quiet-hours window become per-user-timezone concerns. Filed as a geographic-expansion note (rejected as v1 scope — per-user timezone is not built).
</failure_modes>

---

<testing>
## 5. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic:** `notification-types.logic.test.ts` — the canonical constants match the mobile parser's routed strings; the deferrable/pref-map sets are complete. `push-dispatch.logic.test.ts` — non-2xx reject, per-ticket `DeviceNotRegistered` surfacing, chunking.
- **Infra (`BUILDO_TEST_DB=1`):** `dispatch-notifications.infra.test.ts` (a `.db` battery, mock transport) — dispatch writes exactly one ledger row + one transport call; re-run of the same tuple is a no-op (dedup); disabled-type gate; per-day throttle defers; quiet-hours defer writes `valid_until`; expired defer → `deferred_expired` counted-and-dropped; ticket-time prune deletes only the exact token; receipt-time prune at next run; kill-switch OFF → zero sends.
<!-- TEST_INJECT_END -->
</testing>

---

<constraints>
## 6. Operating Boundaries

### Target Files
- `scripts/lib/notification-types.js`, `scripts/lib/push-dispatch.js`, `scripts/dispatch-notifications.js`
- `scripts/classify-lifecycle-phase.js` (sender → enqueuer, EXACTLY that flip — every existing gate/window/payload semantic preserved)
- `scripts/update-tracked-projects.js` (payload normalization to the queue + `lead_id`)
- `migrations/218_notification_dispatch_ledger.sql`
- `manifest.json` (`chains.permits` step insert + `scripts.dispatch_notifications`)
- `src/app/api/notifications/route.ts` (session-auth fix)

### Out-of-Scope Files
- `scripts/lib/lifecycle-phase.js` — the pure classifier logic is untouched; only the dispatch side moves.
- CoA chain wiring — v1 does not add `dispatch_notifications` to `chains.coa`.
- Mobile CoA card UI — `COA_*` types are fenced.

### Cross-Spec Dependencies
- **Relies on:** Spec 47 (script protocol), Spec 82 (the enqueuer semantics + queue table), Spec 84/85 (the lifecycle/forecast inputs the enqueuers read), Spec 86 (kill-switch/throttle logic_variables live in the Control Panel).
- **Consumed by:** Spec 102 (admin dispatch log + test-send), Spec 92 / 97 (mobile surface), Spec 76 (feed health).
</constraints>

### Prefs are per-account
Notification preferences are per-ACCOUNT (the `user_profiles` pref columns), NOT per-trade. A multi-trade account (Spec 21/95 P24) has one preference set; there is no per-trade notification surface in v1.
