# Active Task: WF3 — Top-6 Deferred Bug Sweep
**Status:** Implementation (authorized 2026-05-04)
**Workflow:** WF3 — multi-bundle bug sweep
**Domain Mode:** Cross-Domain (server auth + API + pipelines + mobile schema)
**Rollback Anchor:** `8ff5425`

## Context — deferred queue triage

`docs/reports/review_followups.md` after §9.16 close-out: **303 items** (19 CRITICAL · 100 HIGH · ~184 MED/LOW). 6 bundles selected below cover **10 of the 19 CRITICALs** plus several travelling HIGHs. Bundling rationale: each bundle attacks 1–3 items in the same file/route/path so a single read-modify-write touches the whole cluster. Pure single-line fixes with no commonality (Sentry version bump, lifecycle-phase classifyBldLed P18 misclassification, lifecycle-phase TRADE_TARGET_PHASE→DB) are **deferred** to standalone WFs because they don't bundle.

## Bundle Inventory

### Bundle 1 — Auth hardening (2 CRIT + 3 HIGH) → `src/lib/auth/verify-id-token.ts` + `src/lib/auth/get-firebase-admin.ts`
**File location source:** `review_followups.md:799-808` (WF3 — Auth resolution order, 2026-05-02)

| Sev | Item | Fix shape |
|---|---|---|
| **CRIT** | Timing attack on `cookie === DEV_SESSION_COOKIE` (`verifyIdTokenCookie:58`) | `crypto.timingSafeEqual` swap — 2-line change |
| **CRIT** | `verifyIdToken(cookie)` does NOT check revocation | Add `{ checkRevoked: true }` second arg — 1-line change. **Critical security**: revoked tokens currently work indefinitely. |
| HIGH | Silent 401 storm if firebase-admin not initialized in prod | Throw instead of return null at runtime call site (already partially fixed at boot in `403adcc`) |
| HIGH | Dev-mode bypass needs `NODE_ENV !== 'production'` guard | Defense-in-depth: dual-gate `isDevMode() && NODE_ENV !== 'production'` |
| MED | No length limit on Bearer/cookie token strings (1MB DoS) | Reject tokens > 8KB before Firebase parse — 3-line guard |

**Total fix surface:** ~30 lines across 2 files + a focused security test.

### Bundle 2 — `/api/user-profile` route hardening (2 CRIT + 1 HIGH + tests) → `src/app/api/user-profile/route.ts`
**File location source:** `review_followups.md:825-826` (WF2 §9.14 Phase D deferred)

| Sev | Item | Fix shape |
|---|---|---|
| **CRIT** | `SELECT *` / `RETURNING *` exposes internal fields (`stripe_customer_id`, `radius_cap_km`, `trade_slugs_override`) | Define `CLIENT_SAFE_COLUMNS` constant + share with notifications/preferences route. ~15-line refactor of GET + PATCH SELECT clauses. |
| **CRIT** | `trade_slug` first-write race | Atomic `UPDATE ... WHERE user_id = $1 AND trade_slug IS NULL` precondition + `rowCount === 1` check — 5-line change at the existing trade_slug branch |
| HIGH | `trade_slug` validation bypass — `typeof rawBody.trade_slug === 'string'` runs before `safeParse` | Move trade_slug handling AFTER `safeParse`; use `parsed.data.trade_slug` |

**Bonus item that travels in this commit (MED, free):** `applyFallback*`/`applyExpiration` write side-effects on GET — add `Cache-Control: no-store` header (1 line). Pure safety net; doesn't fix the architectural smell but prevents proxy-triggered writes.

**Total fix surface:** ~25 lines + update 2 existing test files (`user-profiles.{infra,security}.test.ts`) to assert against the SET-clause shape.

### Bundle 3 — `classify-lifecycle-phase.js` push dispatch (2 CRIT + 1 HIGH) → `scripts/classify-lifecycle-phase.js`
**File location source:** `review_followups.md:829-830`

| Sev | Item | Fix shape |
|---|---|---|
| **CRIT** | `dispatchPhaseChangePushes` N+1 query pattern (one query per transition × thousands daily) | Batch with `WHERE (permit_num, revision_num) = ANY($1::record[])` — replaces the inner `for` loop's `pool.query` call |
| **CRIT** | `dispatchStartDateUrgentPushes` `SELECT DISTINCT ON` without matching `ORDER BY` (PostgreSQL returns arbitrary row per group) | Add `ORDER BY tf.permit_num, tf.revision_num, dt.push_token, tf.predicted_start DESC` — 1 line |
| HIGH | `callExpoPushApi` resolves on any HTTP status (silent push-loss on 4xx/5xx) | Reject on `statusCode < 200 \|\| >= 300`; parse JSON body for per-ticket Expo errors — ~10 lines |

**Bonus (HIGH, partial-cluster):** push dispatch awaited inside `withAdvisoryLock` callback. Fix later (out of scope here — needs lock-architecture review).

**Total fix surface:** ~50 lines in one script + one infra test addition asserting batched query shape.

### Bundle 4 — `compute-trade-forecasts.js` atomicity (1 CRIT) → `scripts/compute-trade-forecasts.js`
**File location source:** `review_followups.md:378`

| Sev | Item | Fix shape |
|---|---|---|
| **CRIT** | DELETE + UPSERT in separate transactions — stale-purge `DELETE` commits before forecast `UPSERT` batches; a crash between them leaves `trade_forecasts` empty | Wrap both in a single `pipeline.withTransaction`. Pre-existing structural; per spec §7.1/§7.3 atomicity. |

**Total fix surface:** ~10 lines. Single-bundle but high-impact (every classifier run currently has a tiny crash window where the forecasts table briefly empties).

### Bundle 5 — Mobile `stripe_customer_id` MMKV PII leak (1 CRIT) → `mobile/src/lib/userProfile.schema.ts` + `mobile/src/lib/queryClient.ts` (or wherever the persister is)
**File location source:** `review_followups.md:839`

| Sev | Item | Fix shape |
|---|---|---|
| **CRIT** | `stripe_customer_id` in mobile schema → TanStack persister writes it to unencrypted MMKV. Direct Spec 99 §2.1 violation. | **Option A (preferred — simplest):** remove `stripe_customer_id` from `mobile/src/lib/userProfile.schema.ts` (only used server-side for portal redirect; mobile never reads it). **Option B (fallback if any mobile consumer found):** add `dehydrateOptions.shouldDehydrateQuery` filter to the persister that strips it before write. |

**Plus (HIGH, in same file):** schema validation gaps — `.datetime()` on timestamps, coordinate bounds on `home_base_lat/lng`, `lead_views_count` nullable. Free to bundle here since we're already touching the mobile schema.

**Total fix surface:** ~15 lines in mobile schema + run the §9.13 drift script.

### Bundle 6 — Builder lead_id lexicographic pagination break (1 CRIT) → `src/features/leads/lib/get-lead-feed.ts` (probably) or wherever the cursor is built
**File location source:** `review_followups.md:230`

| Sev | Item | Fix shape |
|---|---|---|
| **CRIT** | `e.id::text` sorts lexicographically — `'9' < '10'` breaks cursor pagination on relevance ties | Cast to `int` in the cursor SQL (or pad-zero in the cursor encoder). `entities.id` is `int8` so this is correctness-only. |

**Total fix surface:** ~3 lines + a behavioral cursor test.

## Bundles deliberately NOT selected (with reasoning)

| Item | Severity | Why deferred |
|---|---|---|
| Sentry @~7.2.0 broken on RN 0.81 New Architecture | CRIT | Version bump + v7→v8 migration; mechanical but risk of breaking other Sentry call sites. Standalone WF. |
| `lifecycle-phase.js` `classifyBldLed` returns P18 when `has_passed_inspection=true` | CRIT | Spec interpretation + dual-path TS+JS update. Needs spec author input. Standalone. |
| `lifecycle-phase.js` TRADE_TARGET_PHASE / stall thresholds hardcoded | 2× CRIT | DB migration to `trade_configurations` table + runtime config-loader integration. Significant scope; standalone. |
| `pipeline.js` `checkQueueAge` SQL injection vector | CRIT | Library-level fix; touches every pipeline script. Standalone. |
| Backup-email persistence bridge missing (`sign-up.tsx`) | CRIT | Cross-feature (auth + onboarding store + temp persistence). Standalone WF. |
| Auth-state reset on forced sign-out (PROMOTED) | CRIT | Already documented as Spec 99 followup; will fold into next mobile-state WF. |
| Lifecycle "Unstall cliff" (`predictedStart` reverts to expired on resume) | CRIT | Phase 2 classifier upgrade — substantial scope, single concern. Standalone. |

## Standards Compliance

* **Try-Catch Boundary:** Every modified API route already has top-level try/catch with `logError`. New auth guards in Bundle 1 inherit via the existing wrapper. Pipeline scripts (Bundles 3, 4) use the SDK's error handling.
* **Unhappy Path Tests:** Each bundle MUST have at least one new test covering its failure mode (revoked token rejected, race-loss returns 409, push 4xx rejected, transaction-crash leaves forecasts intact, dehydrate filter strips stripe_customer_id, cursor pagination correct on tied relevance).
* **logError Mandate:** No new catch blocks introduced; existing `logError` call sites unchanged.
* **UI Layout:** N/A — backend + mobile schema only.
* **§9.13 drift:** Bundle 5 changes the mobile schema field set; the §9.13 drift script must be re-run after Phase 5 and §3.1 updated to remove `stripe_customer_id` (it'll no longer be in the mobile schema).

## Execution Plan

**Phase 1 — Bundle 1 (Auth hardening): commit `fix(13_auth): WF3 timing-safe + revocation + 401 storm + dev-mode guard + token length`**
- [ ] 1a. Locate the actual file path for `verifyIdTokenCookie` (review_followups says line 58; confirm via grep)
- [ ] 1b. Replace `cookie === DEV_SESSION_COOKIE` with `crypto.timingSafeEqual(Buffer.from(cookie), Buffer.from(DEV_SESSION_COOKIE))` after equal-length pre-check
- [ ] 1c. Add `{ checkRevoked: true }` to the `verifyIdToken` call. Adversarial probe: confirm Firebase Admin actually throws `auth/id-token-revoked` and the catch correctly maps to a 401 response (does not 500).
- [ ] 1d. Make runtime `getFirebaseAdmin()` failure throw instead of returning null
- [ ] 1e. Dual-gate dev-mode: `isDevMode() && process.env.NODE_ENV !== 'production'`
- [ ] 1f. 8KB token length guard at function entry
- [ ] 1g. Add `mobile/__tests__` or `src/tests` cases: revoked-token rejected (401), oversized-token rejected (400 or 401, before Firebase parse), dev-mode bypass denied when NODE_ENV=production. Adversarial: also test the timingSafeEqual length-mismatch case (must short-circuit safely, not throw).
- [ ] 1h. Pre-commit gate.

**Phase 2 — Bundle 2 (`/api/user-profile` hardening): commit `fix(95_mobile_user_profiles): WF3 SELECT* whitelist + trade_slug atomic + Zod-before-validation + Cache-Control`**
- [ ] 2a. Define `CLIENT_SAFE_COLUMNS` constant in `src/lib/userProfile.schema.ts` (or a sibling lib file)
- [ ] 2b. Replace GET `SELECT *` and PATCH `RETURNING *` with the explicit list. Verify mobile consumer doesn't break (read schema-vs-mobile-consumer to confirm no field removal collateral).
- [ ] 2c. Move trade_slug rawBody check after `safeParse`; use `parsed.data.trade_slug`
- [ ] 2d. Wrap trade_slug first-write in atomic UPDATE with `WHERE trade_slug IS NULL` + rowCount check; on race-loss return 409 with friendly message
- [ ] 2e. Add `Cache-Control: no-store` to GET response (free safety net; adversarially flagged: doesn't change the underlying GET-with-side-effects smell, but prevents proxy-triggered duplicate writes)
- [ ] 2f. Update `user-profiles.security.test.ts` to assert against `mockQuery.mock.calls` SET-clause shape (parameterised over the 16 untested whitelist fields). This was a paired HIGH from §9.14 Phase D.
- [ ] 2g. Pre-commit gate.

**Phase 3 — Bundle 3 (push dispatch): commit `fix(92_mobile_engagement_hardware): WF3 batch push lookup + DISTINCT ON ORDER BY + Expo statusCode check`**
- [ ] 3a. Refactor `dispatchPhaseChangePushes` inner loop to a single `WHERE (permit_num, revision_num) = ANY($1::record[])` query before iteration. Adversarially: assert the result-set ordering still permits per-permit grouping (or sort client-side).
- [ ] 3b. Add `ORDER BY tf.permit_num, tf.revision_num, dt.push_token, tf.predicted_start DESC` to `dispatchStartDateUrgentPushes`. The `predicted_start DESC` tiebreaker is a guess — verify against the spec or pick a deterministic alternative.
- [ ] 3c. Wrap `callExpoPushApi` to check `statusCode` + parse Expo's per-ticket error array; fail loud on any non-2xx
- [ ] 3d. Update `classify-lifecycle-phase.infra.test.ts`: assert batched query shape, ORDER BY presence, and statusCode handling
- [ ] 3e. Pre-commit gate.

**Phase 4 — Bundle 4 (forecasts atomicity): commit `fix(85_trade_forecast_engine): WF3 wrap stale-purge DELETE + UPSERT in single withTransaction`**
- [ ] 4a. Locate the DELETE and UPSERT sites in `compute-trade-forecasts.js`. Verify they're currently in separate transactions.
- [ ] 4b. Wrap both in a single `pipeline.withTransaction(async (client) => { ... })`. Adversarial probe: does the existing batch-flush logic inside `flushForecastBatch` use the same client, or does it reach for a fresh pool connection? If the latter, the wrap won't work.
- [ ] 4c. Update `compute-trade-forecasts.infra.test.ts`: assert DELETE and UPSERT appear inside the same `withTransaction` block (positional regex test, similar to existing patterns in this file).
- [ ] 4d. Pre-commit gate.

**Phase 5 — Bundle 5 (mobile MMKV PII): commit `fix(99_mobile_state_architecture): WF3 strip stripe_customer_id from mobile schema + tighten Zod refinements`**
- [ ] 5a. Confirm `stripe_customer_id` is unused in mobile (`grep stripe_customer_id mobile/`). If unused, simply remove the field from the mobile `UserProfileSchema`.
- [ ] 5b. Add Zod refinements at the same time (free, since we're touching the file): `.datetime()` on timestamps, `.min(-90).max(90)` / `.min(-180).max(180)` on coords, `.nullable().default(0)` on `lead_views_count`.
- [ ] 5c. Remove the `stripe_customer_id` row from Spec 99 §3.1 (with a deprecation note pointing to the server schema).
- [ ] 5d. Run `node mobile/scripts/check-spec99-matrix.mjs` — expect 0 drift.
- [ ] 5e. Pre-commit gate.

**Phase 6 — Bundle 6 (builder pagination): commit `fix(70_lead_feed): WF3 cast entities.id to int in cursor sort`**
- [ ] 6a. Locate the cursor-pagination cast in `src/features/leads/lib/get-lead-feed.ts` (or wherever `e.id::text` lives — grep confirms)
- [ ] 6b. Replace the cast with `e.id::int8` (no text intermediate) OR pad in the cursor encoder
- [ ] 6c. Add a behavioral cursor test: 11 builders with sequentially-increasing IDs and identical relevance score, paginated 5+5+1, must return them in numeric order across all 3 pages
- [ ] 6d. Pre-commit gate.

**Phase 7 — Adversarial trio review: commit `fix(...): WF3 top-6 sweep — adversarial trio review amendments`**
- [ ] 7a. Spawn 3 reviewers in **non-worktree** mode (the worktree pool was stuck during §9.14 Phase D). Range: `8ff5425..HEAD-after-Phase-6`.
- [ ] 7b. Triage CRITICAL/HIGH; cross-validate with prior review patterns (DeepSeek's STORE_HOOK_CALL false-positive class).
- [ ] 7c. Apply inline. Defer LOW/NIT to followups.
- [ ] 7d. Final pre-commit gate.

**Phase 8 — Update review_followups.md: commit `docs(99_mobile_state_architecture): mark WF3 top-6 sweep items resolved in review_followups.md`**
- [ ] 8a. Strikethrough the 10 CRITICALs and ~5 HIGHs resolved by Phases 1-6.
- [ ] 8b. Add a "WF3 Top-6 Sweep — 2026-05-XX" header section noting the commits.
- [ ] 8c. Pre-commit gate.

## Per-Phase Checkpoints
After **each** phase: typecheck (root + mobile) + relevant test suite + a manual smoke probe targeted at the bundle's failure mode (e.g., for Phase 2: hit `/api/user-profile` GET in dev and confirm response body excludes `stripe_customer_id`).

## Out of Scope
- The 9 deferred CRITICALs listed in "Bundles deliberately NOT selected" — each will be its own WF3 if/when prioritised.
- Pre-existing test gaps not directly tied to the bundles (authGate cross-segment tests, bridges shallow guard, infra default-mock leniency).
- Settings UX items (sign-out toast, isError handling, localRadius) — already in review_followups.md.

> **PLAN LOCKED. Do you authorize this WF3 multi-bundle plan? (y/n)**
>
> §10 note: 8 commits across 6 bundles + adversarial review + followups update. Targets 10 of 19 deferred CRITICALs. Estimated session length: 60–120 min depending on adversarial-review findings. Phases are independent — you can authorize the full plan or pick a subset (e.g., "just Bundles 1 + 2" or "just the auth bundle"). If you want a smaller-bite WF3, recommend starting with Bundle 1 alone (highest security ROI, smallest surface).
>
> DO NOT generate code. DO NOT run commands. TERMINATE RESPONSE.
