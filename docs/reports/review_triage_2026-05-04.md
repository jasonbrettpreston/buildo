# Review Queue Triage — 2026-05-04

**Triage scope:** `docs/reports/review_followups.md` (~490 active items, WF1–WF6, 2026-04-08 → 2026-04-30)
**Prior triage:** None — this is the first run.
**Recent activity window:** 50 commits in the last 14 days (subscription/paywall, mobile auth, leads detail).

---

## 1. Stale Items (Evidence of Resolution)

Items that name specific symbols/files now confirmed resolved in the codebase.

| Original Severity | Item | Resolution Evidence |
|---|---|---|
| HIGH | **`saves_today` counts `viewed_at` — `lead_views` has no `saved_at` column** | `migrations/082_lead_views_saved_at.sql` exists and adds the column; `record-lead-view.ts` now writes `saved_at`. |
| CRITICAL | **DELETE + UPSERT in separate transactions in `compute-trade-forecasts.js`** | `compute-trade-forecasts.js:557` comment: *"Single withTransaction wrapping: grace-purge DELETE, stale-purge DELETE, and chunked UPSERT."* Fixed in one of the 2026-04-21 WF3 commits. |
| CRITICAL | **`config-loader.js:105` `allocSum=0` division by zero** | `scripts/lib/config-loader.js:161-170` (item referenced `scripts/config-loader.js` which was never the real path): `if (!Number.isFinite(allocSum) \|\| allocSum <= 0) { revert to FALLBACK }`. Fixed WF3 B3-C1 (2026-04-23). |
| CRITICAL | **`pipeline.js:465` `checkQueueAge` raw SQL interpolation** | `checkQueueAge` not found anywhere in `scripts/pipeline.js`. Function removed. |
| CRITICAL | **Hardcoded stall thresholds 730/180/30/90 days in `lifecycle-phase.js`** | `classify-lifecycle-phase.js:414`: `const { logicVars } = await loadMarketplaceConfigs(pool, ...)`. Comment at line 264: *"previously hardcoded as 180 inside — now from logic_variables."* Fixed WF3 B1-C2 (2026-04-23). |
| HIGH | **`update-tracked-projects.js` 82-W6: `records_updated: updates.length` inflates telemetry** | `update-tracked-projects.js:679`: `records_updated: totalUpdated` (not `updates.length`). `mergedUpdates` array present at line 392. Confirmed fixed. |
| LOW | **`O4` dead code in `lifecycle-phase-display.ts`** | File line 54: `// WF3-04 (H-W14 / 84-W10): O4 removed — phantom phase, no classifier produces it.` |
| HIGH | **PII: error logging includes precise `user_id + lat/lng`** | Marked ✅ RESOLVED in Phase 8.0 PII Adversarial: *"truncated to 3 decimals (~100m grid) in `src/app/api/leads/feed/route.ts:147-159`."* |

**9 items confirmed stale** (3 CRITICAL, 4 HIGH, 2 LOW). Recommend pruning these from `review_followups.md` in a housekeeping WF2.

---

## 2. Top 5 This Week

Ranked by: (a) severity, (b) items unblocked, (c) hot file in recent commits.

### #1 — CRITICAL: Unstall Cliff in Phase 2 Classifier
**Source:** WF3 2026-04-12 Adversarial (D1) · **File:** `scripts/classify-lifecycle-phase.js`

When `lifecycle_stalled` flips `true → false`, the Phase 2 classifier does NOT reset `phase_started_at` to `NOW()`. The flight tracker computes `predictedStart = phase_started_at + median_days`, which for a permit stalled for months gives a date deep in the past, instantly hitting `expired`. A permit that just resumed construction shows as dead data — the system punishes de-stalling.

**Fix:** In the batch UPDATE, add a `CASE WHEN old_stalled = true AND stalled = false THEN NOW() ELSE phase_started_at END` expression for `phase_started_at`. The `old_stalled` value is already captured in the dirty-read SELECT.

**Unblocks:** correct urgency tiers for all de-stalled permits in the mobile feed and flight board. No other item depends on this, but it is the highest-impact data-correctness gap in the live classifier.

---

### #2 — HIGH (Operational): `backup_db` Has Never Run
**Source:** WF5 prod backend OP4 (2026-04-25) · **File:** `scripts/backup-db.js` / manifest

`pipeline_runs` shows 0 rows for `backup_db`. The script and manifest entry both exist but the script has never been triggered. Production DB has no verified backup on record. Urgency grows with each schema migration.

**Action required (not a code fix):** Run `node scripts/backup-db.js` standalone, verify GCS upload, then schedule in the permits chain or a standalone cron. Should happen before the next schema migration.

---

### #3 — HIGH: `FUNNEL_SOURCE_BY_SLUG` Duplicate `classify_permits` Slug
**Source:** WF1 49 2026-04-19 DeepSeek · **File:** `src/lib/admin/funnel.ts:32-33`

Both `trades_residential` and `trades_commercial` declare `statusSlug: 'classify_permits'`. `Object.fromEntries()` silently overwrites residential with commercial. `FreshnessTimeline.tsx:786` uses this map for step lookups — any future differentiation between the two data flows applies only to the commercial config.

**Fix:** Rename to `'classify_permits_residential'` / `'classify_permits_commercial'` and update the one `FreshnessTimeline.tsx` lookup call site. One-liner change; no DB impact.

**Rationale for this week:** No merge conflicts (file untouched in 14-day window), minimal blast radius, high correctness value.

---

### #4 — HIGH: Subscription Funnel Has Zero PostHog Events
**Source:** WF5 Spec 96 Observability (2026-04-30) · **Files:** `mobile/src/lib/analytics.ts`, `PaywallScreen.tsx`, `useSubscribeCheckout.ts`

The subscription flow shipped 14 days ago (commits `7dfe1a1`, `2452bad`) and has zero telemetry. No `paywall_shown`, `paywall_dismissed`, `subscribe_session_requested`, `subscribe_session_failed`, `subscription_restored` events. `ALLOWED_KEYS` whitelist in `analytics.ts:34-41` also lacks `subscription_status`, `days_on_trial`, `refresh_count`, `checkout_error_kind`. Spec 90 §11 mandates funnel telemetry.

**Fix scope:** Add 7 event names + 4 property keys to `ALLOWED_KEYS`; add ~7 `track()` call sites in PaywallScreen, useSubscribeCheckout, and `_layout.tsx` (cancelled_pending_deletion sign-out).

**Rationale:** Subscription is the monetization funnel. Without telemetry, product cannot measure conversion or diagnose webhook failures.

---

### #5 — HIGH: `callExpoPushApi` Swallows Expo Delivery Errors
**Source:** Mobile Ph5/6 2026-04-22 Gemini+DeepSeek · **File:** `scripts/classify-lifecycle-phase.js` (`callExpoPushApi` + `dispatchPhaseChangePushes`)

Expo's push API returns HTTP 200 with per-ticket errors in the response body (`{ status: 'error', details: { error: 'DeviceNotRegistered' } }`). `callExpoPushApi` resolves the raw response string without parsing it — `DeviceNotRegistered` errors are silently dropped, stale tokens accumulate, and notification delivery degrades undetected.

**Fix:** Parse `JSON.parse(data).data[]` inside `callExpoPushApi`; on `DeviceNotRegistered` DELETE the stale token from `device_tokens`. Companion MED item (N+1 device-token lookup in `dispatchPhaseChangePushes`) should be co-fixed.

---

## 3. Proposed Sweep WFs

### Sweep A — `src/lib/permits/types.ts` Type Hardening (WF2)
**Scope:** 1 file only — `src/lib/permits/types.ts`. No DB migrations, no test changes.
**Estimated item count:** 7 LOW items from the WF1 Phase 1a 2026-04-12 adversarial block.

| # | Item |
|---|---|
| 1 | `PermitChange.old_value/new_value: string\|null` — loses numeric/date fidelity |
| 2 | `PermitFilter.sort_by: string` → `keyof Permit` (SQL injection defense) |
| 3 | `Inspection.inspection_date/scraped_at: string` → `Date` (parity with `Permit`) |
| 4 | `Permit.dwelling_units_created/lost/housing_units/storeys: number` — NaN on `"N/A"` input |
| 5 | `TradeMappingRule.match_field: string` → `keyof RawPermitRecord` |
| 6 | `Permit.location: unknown\|null` — no GeoJSON shape definition |
| 7 | `SyncRun.status: string` → literal union |

One WF2 session; review with `npx vitest related src/lib/permits/types.ts --run`.

---

### Sweep B — Admin Route Error Envelope Harmonization (WF2)
**Scope:** `src/app/api/admin/` routes. No migrations.
**Estimated item count:** 2 MED items + ~7 route files.

Apply `sanitizePgErrorMessage` + structured `{ data: null, error: { code, message }, meta: null }` envelope to: `market-metrics`, `rules`, `stats`, `pipelines/history`, `sync`, `builders`, and promote `/api/admin/leads/health` to the structured shape (it currently returns `{ error: message }` bare string while sibling `/test-feed` returns the structured form). Eliminates the class of opaque 500s that masked the pool-exhaustion bug for 3+ commits.

---

### Sweep C — Pipeline SDK Compliance (WF2)
**Scope:** `scripts/` only. No `src/` changes, no DB migrations.
**Estimated item count:** ~10 MED/LOW items from systemic pipeline patterns.

| Script | Gap |
|---|---|
| `assert-engine-health.js:150,158` | `CURRENT_DATE`/`NOW()` in snapshot loop violates §14.2 Midnight Cross |
| `assert-engine-health.js` early-exit | `emitSummary` lacks `audit_table` → SDK injects UNKNOWN |
| `classify-lifecycle-phase.js` transitions | Per-batch INSERT lacks `ON CONFLICT` |
| `compute-trade-forecasts.js` | No SIGTERM handler; advisory lock 85 orphaned on kill |
| `classify-permit-phase.js` | `verdict: 'PASS'` hardcoded; 0-row success still passes |
| `run-chain.js` | No SIGTERM on orchestrator — partial `pipeline_runs` can stick as `'running'` |

---

## 4. Queue Health

| Metric | Count | Notes |
|---|---|---|
| **Total items (estimated)** | ~490 | Raw severity grep: CRITICAL 9, HIGH 73, MED 135, LOW 259, NIT 18 |
| **Confirmed stale this run** | 9 | 3 CRITICAL, 4 HIGH, 2 LOW (see §1) |
| **Adjusted active CRITICAL** | ~6 | After removing 3 confirmed-stale |
| **Adjusted active HIGH** | ~65 | After removing 4 confirmed-stale |
| **Active MED** | ~130 | No stale confirmed in MED tier |
| **Active LOW + NIT** | ~270 | O4 confirmed stale; others not scanned |
| **Prior triage delta** | N/A | First triage run — no baseline |

**Hot zones by recent commit activity:**
- Subscription / paywall (`src/app/api/subscribe/`, `mobile/.../paywall/`) — 14 open items, 0 telemetry
- Mobile auth / auth gate (`mobile/app/_layout.tsx`) — 8 open items
- Leads detail / flight board (`src/app/api/leads/`) — 4 open items

**Recommendation for next triage:** If `backup_db` is not operational by the next session, escalate OP4 to CRITICAL. Consider running `npm run dead-code` to confirm the dead-code sweep items (haptics.ts, haversine.ts, useLeadView.ts, OnboardingWizard.tsx) are still live before scheduling that WF2.
