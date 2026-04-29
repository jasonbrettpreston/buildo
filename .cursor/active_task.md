# Active Task: Spec 95 Mobile User Profiles — API + Store Foundation
**Status:** Implementation
**Workflow:** WF1 — Genesis
**Domain Mode:** Cross-Domain — modifies `src/app/api/` Next.js routes AND `mobile/` Expo source. Read `.claude/domain-crossdomain.md` before implementation. ✓

---

## Context

* **Goal:** Build the canonical user data model that persists across sessions and devices. Deliver: (1) DB migration adding all mobile columns to `user_profiles` + 3 new tables; (2) GET + PATCH `/api/user-profile` authenticated routes; (3) POST deletion + reactivation endpoints; (4) Zod schemas (server + client); (5) `userProfileStore` for account-level fields; (6) `filterStore` hydration additions; (7) `useUserProfile` TanStack Query hook; (8) `TradeReadOnlyRow` settings component.

* **Target Spec:** `docs/specs/03-mobile/95_mobile_user_profiles.md`

* **Cross-spec dependencies:**
  - Spec 93 — Firebase UID is the `user_id` PK; `getUserIdFromSession` handles Bearer token auth for Expo
  - Spec 94 — onboarding PATCH calls all hit this route; they will 404 until this spec ships (documented in review_followups.md as CRITICAL)
  - Spec 96 — `subscription_status` written here when `onboarding_complete: true` is PATCHed
  - Spec 97 — Settings UI reads and writes editable fields via PATCH

* **Key Files:**

  NEW — server:
  - `migrations/114_user_profiles_mobile_columns.sql`
  - `src/lib/userProfile.schema.ts`
  - `src/app/api/user-profile/route.ts` (GET + PATCH)
  - `src/app/api/user-profile/delete/route.ts`
  - `src/app/api/user-profile/reactivate/route.ts`
  - `src/tests/user-profiles.infra.test.ts`
  - `src/tests/user-profiles.security.test.ts`

  NEW — mobile:
  - `mobile/src/lib/userProfile.schema.ts`
  - `mobile/src/store/userProfileStore.ts`
  - `mobile/src/hooks/useUserProfile.ts`
  - `mobile/src/components/settings/TradeReadOnlyRow.tsx`
  - `mobile/__tests__/filterStore.test.ts`

  MODIFY:
  - `mobile/src/store/filterStore.ts` — add `defaultTab`, `supplierSelection`, `hydrate()`, update `reset()`
  - `tasks/lessons.md` — update `radius_km` note (now server-side after migration 114)

---

## API Contract Note (Cross-Domain Scenario B)

**Endpoints:**
| Method | Path | Auth | Response |
|--------|------|------|----------|
| GET | `/api/user-profile` | Bearer / cookie | `{ data: UserProfile }` · 404 = new user · 403 = deleted account |
| PATCH | `/api/user-profile` | Bearer / cookie | `{ data: UserProfile }` updated row · 400 on `trade_slug` |
| POST | `/api/user-profile/delete` | Bearer / cookie | `{ data: { ok: true } }` |
| POST | `/api/user-profile/reactivate` | Bearer / cookie | `{ data: UserProfile }` restored |

**Client consumption:** `mobile/src/hooks/useUserProfile.ts` calls GET on app launch. Onboarding screens (Spec 94) call PATCH directly via `fetchWithAuth`. Spec 97 (Settings) will call PATCH for field edits.

---

## Technical Implementation

### New/Modified Components

| File | Purpose |
|------|---------|
| Migration 114 | ADD COLUMN on `user_profiles`; make `trade_slug` nullable; add location CHECK; create 3 new tables; FK CASCADE on `lead_view_events` |
| `src/lib/userProfile.schema.ts` | Zod `UserProfileUpdateSchema` — whitelist for PATCH; `UserProfileType` TypeScript type |
| `route.ts` GET + PATCH | Full user profile endpoint — trade immutability guard, deleted account 403, onboarding completion guard, JSONB merge, radius cap |
| `delete/route.ts` | Atomic deletion: mark account, cancel Stripe subscription (if any), revoke Firebase refresh tokens |
| `reactivate/route.ts` | 30-day recovery window, restore to `expired` or `admin_managed` |
| `mobile/src/lib/userProfile.schema.ts` | Zod `UserProfileSchema` for validating server responses in `useUserProfile` |
| `userProfileStore.ts` | Zustand + MMKV store for account-level display fields. Changes must NOT trigger lead feed re-renders |
| `filterStore.ts` (modify) | Add `defaultTab`, `supplierSelection`; add `hydrate(profile)` action; update `reset()` |
| `useUserProfile.ts` | TanStack Query hook — hydrates both stores, fast-path from MMKV, exposes skeleton loading state |
| `TradeReadOnlyRow.tsx` | Read-only settings row: trade label + `font-mono` value + Lock icon + sub-label |

### Data Hooks/Libs

- **filterStore** additions: `defaultTab: 'feed' | 'flight_board' | null`, `supplierSelection: string | null`, `hydrate(profile: UserProfile)` action (overwrites `locationMode`, `defaultTab`, `homeBaseLocation`, `homeBaseLat`, `homeBaseLng`, `supplierSelection`, `tradeSlug`, `radiusKm` from server profile — does NOT write userProfileStore fields). New actions: `setDefaultTab`, `setSupplierSelection`. Update `reset()`.
- **userProfileStore**: Zustand + MMKV key `user-profile`. Fields: `fullName`, `companyName`, `phoneNumber`, `backupEmail`, `notificationPrefs` (full JSONB object). Actions: `hydrate(profile)`, `reset()`. This store never triggers `queryClient.invalidateQueries(['leads'])`.
- **useUserProfile**: `staleTime: 300_000`. On success: calls BOTH `filterStore.hydrate(data)` AND `userProfileStore.hydrate(data)`. Parses response through `UserProfileSchema` — Zod failure triggers Sentry + MMKV fallback. Fast-path: synchronous `filterStore.hydrate(mmkvCache)` on mount before query resolves. Exposes `isLoading`, `isFetching`, `hasCachedData`.

### Database Impact

**YES — Migration 114. All new columns are nullable with safe defaults — no backfill required.**

**New columns on `user_profiles`:**
- Identity: `full_name TEXT`, `phone_number TEXT`, `company_name TEXT`, `email TEXT`, `backup_email TEXT`
- Profession: `default_tab TEXT CHECK (default_tab IN ('feed', 'flight_board'))`, `location_mode TEXT CHECK (location_mode IN ('gps_live', 'home_base_fixed'))`, `home_base_lat NUMERIC(9,6)`, `home_base_lng NUMERIC(9,6)`, `radius_km INTEGER`, `supplier_selection TEXT`, `lead_views_count INTEGER DEFAULT 0`
- Subscription: `subscription_status TEXT CHECK (subscription_status IN ('trial','active','past_due','expired','cancelled_pending_deletion','admin_managed'))`, `trial_started_at TIMESTAMPTZ`, `stripe_customer_id TEXT`
- Account state: `onboarding_complete BOOLEAN DEFAULT false`, `tos_accepted_at TIMESTAMPTZ`, `account_deleted_at TIMESTAMPTZ`
- Admin-configured: `account_preset TEXT CHECK (account_preset IN ('tradesperson','realtor','manufacturer'))`, `trade_slugs_override TEXT[]`, `radius_cap_km INTEGER`
- **Schema changes:** `ALTER COLUMN trade_slug DROP NOT NULL` (manufacturer accounts have NULL). Drop + replace `user_profiles_trade_slug_not_empty` CHECK with `CHECK (trade_slug IS NULL OR trim(trade_slug) <> '')`.
- **Location CHECK (§7):** `CHECK (location_mode IS NULL OR (location_mode = 'gps_live' AND home_base_lat IS NULL AND home_base_lng IS NULL) OR (location_mode = 'home_base_fixed' AND home_base_lat IS NOT NULL AND home_base_lng IS NOT NULL))`

**New tables (same migration file):**
- `lead_view_events(user_id TEXT, permit_num TEXT, revision_num TEXT, viewed_at TIMESTAMPTZ DEFAULT NOW(), PRIMARY KEY (user_id, permit_num, revision_num))`
- `subscribe_nonces(nonce TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '15 minutes')`
- `stripe_webhook_events(event_id TEXT PRIMARY KEY, processed_at TIMESTAMPTZ DEFAULT NOW())`

**FK CASCADE:** `ALTER TABLE lead_view_events ADD CONSTRAINT fk_lve_user FOREIGN KEY (user_id) REFERENCES user_profiles(user_id) ON DELETE CASCADE`

---

## Standards Compliance

* **Try-Catch Boundary:** All 4 route handlers wrapped with `withApiEnvelope`. Inner transaction logic uses try-catch with `logError` per §6.1.
* **Unhappy Path Tests:** infra tests cover 404 / 403 / 401 / 400 paths; DB error 500 with no raw message leak; NULL radius_cap_km applies no cap.
* **logError Mandate:** All server catch blocks use `logError`. Mobile stores use `console.error`. `useUserProfile` Zod parse failures use `Sentry.captureException` (Expo).
* **UI Layout:** `TradeReadOnlyRow` is mobile-first. Outer container `min-h-[52px]` meets touch target requirement (Spec 90 §9).
* **Security:** PATCH whitelist strips `subscription_status`, `account_deleted_at`, `account_preset`, `trade_slugs_override`, `lead_views_count` silently. `trade_slug` rejected with 400 (idempotency exception for same value). Atomic CTE for `lead_views_count` prevents double-increment (deferred to Spec 96 — this spec creates the table and column only).

---

## Execution Plan

- [ ] **Step 0 — Pre-flight:** `node scripts/ai-env-check.mjs`. Confirm last migration = 113. Confirm `src/app/api/user-profile/` does not exist.

- [ ] **Step 1 — Migration 114:** `migrations/114_user_profiles_mobile_columns.sql`. `-- UP` block: all ADD COLUMN statements; DROP CONSTRAINT + ADD CONSTRAINT for trade_slug check; ALTER COLUMN DROP NOT NULL; ADD CONSTRAINT chk_location_mode_coords; CREATE TABLE for 3 new tables; ALTER TABLE lead_view_events ADD FK. `-- DOWN` block: DROP TABLE + DROP COLUMN IF EXISTS + restore trade_slug NOT NULL + restore original check.

- [ ] **Step 2 — Server Zod schema:** `src/lib/userProfile.schema.ts`. `UserProfileUpdateSchema` (11 standard PATCH fields: `full_name`, `phone_number`, `company_name`, `backup_email`, `default_tab`, `location_mode`, `home_base_lat`, `home_base_lng`, `radius_km`, `supplier_selection`, `notification_prefs`) with `.strip()`. Export `UserProfileType` inferred from a broader schema covering all columns (used as return type for GET/PATCH responses).

- [ ] **Step 3 — GET `/api/user-profile`:** `src/app/api/user-profile/route.ts`. `withApiEnvelope`. `getUserIdFromSession` → 401. Query `user_profiles` by `user_id`. `account_deleted_at IS NOT NULL` → 403 with `days_remaining: CEIL(30 - days since account_deleted_at)`. No row → 404. Return full row as `{ data: row }`.

- [ ] **Step 4 — PATCH `/api/user-profile`:** Same file as Step 3. `withApiEnvelope`. Check deleted account → 403 first. Parse body through `UserProfileUpdateSchema.strip()`. Guard `trade_slug` in body → 400 (with idempotency exception: if incoming value === existing DB value, return 200). Guard `onboarding_complete: true` → verify `trade_slug IS NOT NULL`, `location_mode IS NOT NULL`, `tos_accepted_at IS NOT NULL`; if yes and `account_preset != 'manufacturer'`, write `trial_started_at = NOW()` and `subscription_status = 'trial'` in same UPDATE (single statement). `notification_prefs`: merge via SQL `notification_prefs || $N::jsonb`. Radius: `COALESCE(LEAST(requested, cap), requested)`. Build dynamic SET clause from provided fields only. Return updated row.

- [ ] **Step 5 — POST `/api/user-profile/delete`:** `src/app/api/user-profile/delete/route.ts`. `withApiEnvelope`. Auth → 401. Fetch profile; if already deleted → idempotency 200. DB transaction: (1) set `account_deleted_at = NOW()` + `subscription_status = 'cancelled_pending_deletion'`; (2) if `stripe_customer_id` set, `stripe.subscriptions.list({ customer, status: 'active', limit: 1 })` + cancel if found. Outside transaction: `admin.auth().revokeRefreshTokens(uid)`. Return `{ data: { ok: true } }`.

- [ ] **Step 6 — POST `/api/user-profile/reactivate`:** `src/app/api/user-profile/reactivate/route.ts`. `withApiEnvelope`. Auth → 401. Fetch profile; if not in deletion state → 400. If `account_deleted_at > NOW() - INTERVAL '30 days'` elapsed → 400. Determine `restored_status`: manufacturer → `admin_managed`; all others → `expired`. SET `account_deleted_at = NULL`, `subscription_status = restored_status`. Return updated row.

- [ ] **Step 7 — Client Zod schema:** `mobile/src/lib/userProfile.schema.ts`. `UserProfileSchema` — full shape matching all `user_profiles` columns with nullable fields. Used by `useUserProfile` to validate server responses before hydrating stores. Export `UserProfileType` type.

- [ ] **Step 8 — `userProfileStore.ts`:** `mobile/src/store/userProfileStore.ts`. Zustand + MMKV persist key `user-profile`. Interface: `fullName: string | null`, `companyName: string | null`, `phoneNumber: string | null`, `backupEmail: string | null`, `notificationPrefs: NotificationPrefs | null`. Actions: `hydrate(profile: UserProfileType)`, `reset()`. SPEC LINK: `docs/specs/03-mobile/95_mobile_user_profiles.md §9 Step 6`.

- [ ] **Step 9 — `filterStore.ts` modifications:** Add `defaultTab: 'feed' | 'flight_board' | null`, `supplierSelection: string | null`. Add `setDefaultTab` and `setSupplierSelection` actions. Add `hydrate(profile: UserProfileType)` action that sets `tradeSlug`, `radiusKm`, `locationMode`, `homeBaseLocation`, `defaultTab`, `supplierSelection` from profile (coercing nulls to defaults where needed). Update `reset()` to include `defaultTab: null, supplierSelection: null`.

- [ ] **Step 10 — `useUserProfile.ts`:** `mobile/src/hooks/useUserProfile.ts`. TanStack Query `useQuery({ queryKey: ['user-profile'], staleTime: 300_000, queryFn })`. `queryFn`: call `fetchWithAuth('/api/user-profile')`, parse through `UserProfileSchema`. On success: `filterStore.hydrate(data)` AND `userProfileStore.hydrate(data)`. Zod parse failure: `Sentry.captureException(parseError)` + return MMKV cached values. Fast-path on mount: if MMKV key `user-profile` exists, synchronously call `filterStore.hydrate(cachedProfile)` before query settles. Derive `hasCachedData` from MMKV key existence. Expose `{ data, isLoading, isFetching, hasCachedData }`.

- [ ] **Step 11 — `TradeReadOnlyRow.tsx`:** `mobile/src/components/settings/TradeReadOnlyRow.tsx`. Read `filterStore.tradeSlug`. Outer: `flex-row items-center justify-between px-4 min-h-[52px] border-b border-zinc-800/50` + `accessible={false}`. Right slot: `flex-row items-center gap-2` with `text-zinc-500 text-sm font-mono` + `<Lock size={14} color="#52525b" />`. `accessibilityLabel={\`Trade: ${tradeSlug}, locked\`}`. Sub-label: `text-zinc-600 text-xs mt-0.5 pb-3 px-4`.

- [ ] **Step 12 — `src/tests/user-profiles.infra.test.ts`:** SPEC LINK header required. GET 200 full row for valid UID; GET 404 unknown UID; GET 403 deleted account (body has `days_remaining`); PATCH valid fields returns updated row; PATCH 400 on `trade_slug` in body; PATCH 401 unauthenticated; NULL `radius_cap_km` → no cap applied; DB error → 500 without raw message. Pattern: `vi.mock` + `withApiEnvelope` passthrough (same as `onboarding-suppliers.infra.test.ts`).

- [ ] **Step 13 — `src/tests/user-profiles.security.test.ts`:** SPEC LINK header required. PATCH `subscription_status` → stripped silently (200, field unchanged); PATCH `account_deleted_at` → stripped silently; PATCH `trade_slugs_override` → 400 or stripped; PATCH on deleted account → 403; GET for own UID returns 200; 5xx responses contain no raw error text (test for absence of `err.message` strings in response body).

- [ ] **Step 14 — `mobile/__tests__/filterStore.test.ts`:** SPEC LINK header required. `hydrate()` overwrites all filter-scoped fields from a full profile object; `reset()` returns all null/default values; `supplierSelection` and `defaultTab` initialize to null and hydrate correctly; MMKV `storage.set` is called after hydration (mock `createMMKV`).

- [ ] **Step 15 — Update `tasks/lessons.md`:** Replace `radius_km is client-side MMKV only — no column in user_profiles` with `radius_km is now server-side (user_profiles column added migration 114) — MMKV is cache only; user_profiles is authoritative`.

- [ ] **Step 16 — Multi-agent review (WF6 gate):** Three parallel agents, `isolation: "worktree"`. Spec input: `docs/specs/03-mobile/95_mobile_user_profiles.md`. Code Reviewer + Spec Compliance Reviewer + Logic Reviewer. Triage → fix FAIL items. Deferred → `docs/reports/review_followups.md`.

- [ ] **Step 17 — Test + typecheck gate:**
  - `npm run typecheck` (root)
  - `cd mobile && npm run typecheck`
  - `npx vitest run src/tests/user-profiles.infra.test.ts`
  - `npx vitest run src/tests/user-profiles.security.test.ts`
  - `cd mobile && npx jest --testPathPattern="filterStore" --ci`
  - All must pass before commit.

- [ ] **Step 18 — Commit:** `feat(95_mobile_user_profiles): WF1 user profiles API + store foundation`

---

## Deferred / Out of Scope

- Stripe webhook handler (`/api/webhooks/stripe`) — Spec 96
- `/api/subscribe/session` — Spec 96
- `lead_views_count` atomic CTE increment in `/api/leads` — Spec 96
- `radius_km` one-time write-back guard on first launch — Spec 97
- `useLocation.ts` gating on `locationMode` — Spec 97
- Phone number change verification flow — Spec 97
- Location mode switch behavior (bottom sheet on toggle) — Spec 97
- Skeleton animation in consuming screens (SettingsScreen, ProfileScreen) — Spec 97
- Admin UI for managing user profiles — Spec 97
- Team/org membership tables — Phase 2
