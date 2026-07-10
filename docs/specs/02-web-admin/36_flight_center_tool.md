# Spec 36 — Flight Center Tool (Standalone Admin Watchlist)

**Status:** ACTIVE
**Cross-references:** Spec 33 (Web Admin Engineering Protocol), Spec 34 (Web Admin Testing Protocol), Spec 35 (Web Admin State Architecture), Spec 76 (Lead-Feed Health Dashboard — supersedes its §3.4 Flight Center prototype), Spec 89 (Parcel Cost Model Tool — the admin-guarded address-resolution precedent), Spec 81 (Opportunity Scores), Spec 84 (Lifecycle), Spec 85 (Trade Forecasts).

**Numbering note:** this spec uses **36** in `docs/specs/02-web-admin/`, NOT 90. Spec 33:11 is an explicit anti-ambiguity fence: the 90/98/99 slots are occupied by the parallel mobile specs in `docs/specs/03-mobile/`, and reusing those numbers across folders makes bare "Spec 90" cross-references ambiguous (40+ existing repo-wide references to a bare "Spec 90" ALL mean the mobile engineering protocol). 36 is globally free (zero prior references, verified 2026-07-09) and sits in the natural web-admin sequence after 33/34/35.

<requirements>
## 1. Goal & User Story

**Goal:** promote the flight board from a sub-tab of the Spec 76 Lead-Feed surface to its own standalone **Flight Center** admin tool with its own page (`/admin/flight-center`) and its own persistence (`admin_watchlist`), so an operator can curate a durable watchlist of the projects (permits AND CoAs) they care about and see the flight semantics — is it DELAYED, when does it EXPECTED-START — at a glance.

**User Story:** as an admin operator I want to (1) open a dedicated Flight Center tool; (2) type an address and find + save the project/permit at that address; (3) bulk-save many projects and bulk-delete many (curate the watchlist); (4) click a project and see ALL of its information with the key flight semantics (DELAYED badge, EXPECTED START DATE, urgency) prominent; (5) all built to the Spec 33/34/35 web-admin conventions.

Requirement traceability: R1 (own page + own spec) → §2 + §5. R2 (address search → find + save) → the `GET /watchlist/search` endpoint + the search box. R3 (bulk save + bulk delete) → the bulk routes + `admin_watchlist` + the multi-select table. R4 (click project → ALL info, DELAYED + EXPECTED-START prominent) → the detail drawer reusing `GET /api/admin/leads/inspect/:id` + a flight-semantics header. R5 (Spec 33/34/35 conventions) → §3 auth + the testing mandate + the Spec 35 §3.1/§3.2 registration.
</requirements>

---

<architecture>
## 2. Technical Architecture

### Database Schema — `admin_watchlist` (migration 215)

A dedicated per-admin watchlist table, deliberately DECOUPLED from `lead_views` (see §4 "Save semantics" for the rationale).

| Column | Type | Notes |
|---|---|---|
| `id` | `SERIAL PRIMARY KEY` | integer id; DELETE is `admin_uid`-scoped so a guessed id is inert. |
| `admin_uid` | `VARCHAR(128) NOT NULL` | the `verifyAdminAuth` uid (see §3 for the sentinel-uid behavior). |
| `lead_type` | `TEXT NOT NULL CHECK (lead_type IN ('permit','coa'))` | first-class CoA support. |
| `lead_key` | `TEXT NOT NULL` | canonical `permit:<num>:<rev2>` / `coa:<application_number>` key, produced by the ONE `buildLeadKey` builder. |
| `permit_num` | `TEXT` | XOR shape (permit arm). |
| `revision_num` | `TEXT` | XOR shape (permit arm). |
| `coa_application_number` | `TEXT` | XOR shape (coa arm). |
| `address_snapshot` | `TEXT` | address captured at save time; rendered in the list without a per-row JOIN. |
| `saved_at` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | |

- `UNIQUE (admin_uid, lead_key)` — idempotent bulk-save via `ON CONFLICT DO NOTHING`.
- XOR CHECK mirroring `lead_views` (mig 212): `(lead_type='permit' AND permit_num IS NOT NULL AND revision_num IS NOT NULL AND coa_application_number IS NULL) OR (lead_type='coa' AND coa_application_number IS NOT NULL AND permit_num IS NULL AND revision_num IS NULL)`.
- `pg_trgm` GIN indexes on the searched address expressions (permits street-concat and `coa_applications.address`) — the b-tree does not accelerate leading-wildcard `ILIKE`; cheap insurance (extension installed in mig 053).
- `db:generate` (drizzle) stays DEFERRED — documented drizzle drift; the columns are raw-SQL-only for now.

### API Endpoints

All under `src/app/api/admin/leads/watchlist/**`; all call `verifyAdminAuth` as the FIRST line; all responses are `{data, error, meta}`; all SQL is parameterized.

- **`GET /api/admin/leads/watchlist`** — the flight list. `admin_watchlist` JOIN `permits`/`coa_applications` LEFT JOIN `trade_forecasts` (UNION ALL of a permit arm and a coa arm, each producing the same column interface). Forecast join is ON `tf.lead_id = admin_watchlist.lead_key` (the ONE uniform key that works for permit AND coa rows), through `permit_trades` scoped `is_active = true` so demoted/inactive trades never supply the project's expected start. Project-level expected-start = `MIN(tf.predicted_start)` across the lead's active-trade forecast rows. `temporal_group` computed server-side via the shared `computeTemporalGroup` through a thin aggregation wrapper (see §4). Server-side paginated: `LIMIT 50` + offset; total count in `meta`.
- **`POST /api/admin/leads/watchlist`** — bulk save. Body `{ items: Array<{ lead_type, lead_key | permit_num/revision_num | coa_application_number, address? }> }`. Per-item `safeParse` (one bad item must not reject the batch); valid items → multi-row `INSERT ... ON CONFLICT (admin_uid, lead_key) DO NOTHING`; response `{added, skipped_existing, failed:[{index, reason}]}`.
- **`DELETE /api/admin/leads/watchlist`** — bulk delete. Body `{ ids: number[] }` → `DELETE WHERE admin_uid = $1 AND id = ANY($2)`.
- **`GET /api/admin/leads/watchlist/search?q=`** — address → permit/coa resolution. Ports the `permits` street-substring logic from the consumer `leads/search` route behind `verifyAdminAuth`, ADD a coa arm (`coa_applications.address ILIKE`). Returns enough to save (`lead_type, lead_key, permit_num, revision_num, coa_application_number, address, lifecycle_phase`).

### Implementation — key files

- Migration: `migrations/215_admin_watchlist.sql`; one-off backfill `scripts/analysis/backfill-admin-watchlist.js`.
- Routes: `src/app/api/admin/leads/watchlist/route.ts` (GET list / POST bulk-save / DELETE bulk-delete), `src/app/api/admin/leads/watchlist/search/route.ts`.
- Shared key builder: `buildLeadKey` (`src/features/leads/lib/record-lead-view.ts`) — extended with a `coa` branch.
- Temporal aggregation wrapper + schemas: `src/lib/admin/watchlist-schemas.ts`, reusing `computeTemporalGroup` (`src/lib/leads/flight-board-temporal.ts`, UNCHANGED).
- Page/components: `src/app/admin/flight-center/{page.tsx,error.tsx}`, `src/components/admin/FlightCenterTool.tsx`, `src/components/admin/SearchPermitsModal.tsx`.
- Store + hooks: `src/features/admin-flight-center/store/useFlightCenterStore.ts`; `useWatchlist`/`useBulkSaveToWatchlist`/`useBulkDeleteFromWatchlist`/`useWatchlistSearch` under `src/features/admin-flight-center/api/`.
</architecture>

---

<security>
## 3. Auth Matrix

| Role | Access |
|------|--------|
| Anonymous | — (401) |
| Authenticated non-admin | — (403 via `verifyAdminAuth`) |
| Admin | full read + write |

- `verifyAdminAuth` is the FIRST line of every route (Spec 33 §8, Spec 35 §5.1). CSRF `Origin` check on mutations is handled inside the guard.
- **Mutation auth-method guard:** watchlist MUTATIONS (`POST`/`DELETE`) require `authMethod === 'session'`. `admin_key` writes → **403** (CI / pipeline scripts have no personal watchlist). `dev_bypass` writes are permitted (local single-dev; rows land under the `'dev-user'` sentinel and are dev-local artifacts). READS are allowed on all three auth methods.
- **Sentinel-uid behavior (explicit):** `verifyAdminAuth` yields a stable per-admin Firebase uid ONLY on the `session` path (allowlist `ADMIN_USER_IDS` — multiple distinct admins supported). The `admin_key` / `dev_bypass` paths return the SHARED sentinels `'admin-key'` / `'dev-user'`. Watchlist rows key on the RETURNED uid as-is; sentinel rows are dev-local artifacts, acceptable in this single-operator deployment. The Flight Center does NOT use the `admin-test` sentinel (`src/lib/admin/admin-uid.ts`); that sentinel is reserved for the "no real user" Test-Feed code path.
</security>

---

<behavior>
## 4. Behavioral Contract

- **Inputs:** admin UI actions — address search, per-item / bulk save, multi-select bulk delete, card click → detail drawer.
- **Core Logic:**
  1. **Save semantics — dedicated `admin_watchlist`, NOT `lead_views`.** `lead_views` carries four constraints that make it wrong for an admin watchlist: (i) it requires a single-trade `user_profiles` row (the forecast join keys on a single `trade_slug`, so an admin's board would blank); (ii) the consumer flight-board AUTO-ARCHIVES saved rows past the trade's work_phase — silently evicting curated items; (iii) `POST /api/leads/save` rejects `lead_type:'coa'`; (iv) an admin `lead_views.saved=true` row is read by the P9a self-feed (`tracked_projects`) — a live CRM-alert coupling. `admin_watchlist` avoids all four: admin identity is `verifyAdminAuth` (no `trade_slug` fiction), no auto-archive, CoA is first-class, and it is fully decoupled from the self-feed.
  2. **Address search resolution.** v1 = the proven substring `ILIKE '%q%'` resolver ported behind `verifyAdminAuth`, extended with a coa arm. (The Spec 89 `address_points` normalized/fuzzy resolver is a filed follow-up — heavier, permits↔parcel link is lossy.)
  3. **Bulk contract.** Save is idempotent (`ON CONFLICT DO NOTHING`; re-saving is a no-op → `skipped_existing`). Delete is a HARD delete scoped to `admin_uid`. Bulk-save validates each item individually so one bad item never rejects the batch. Arrays are capped (`.max(1000)`).
  4. **Detail drill-down = the inspect endpoint + a flight-semantics header.** The drawer reuses `GET /api/admin/leads/inspect/:id` (the ~70-field / 8-panel all-info surface; the ≥0.85 identity-link floor is preserved — a sub-0.85 CoA link stays gated to null so the inspector never shows the WRONG permit). ABOVE the panels: a prominent header with the DELAYED badge + EXPECTED START DATE + `temporal_group` chip; the 8 diagnostic panels render below (secondary). The header takes `temporal_group`/aggregated `predicted_start`/p25/p75 from the already-fetched watchlist row as `initialData` (instant render), then RECONCILES from the `useLeadInspect` forecast/lifecycle panels once they resolve — header and body converge on the same snapshot.
  5. **DELAYED / EXPECTED-START derivation.** There is NO stored `delayed` column. DELAYED = `lifecycle_stalled` (present on BOTH `permits` and `coa_applications`, so the badge is uniform across lead types) OR a past-due aggregated `predicted_start`. EXPECTED START = the project-level aggregated `predicted_start` = `MIN(predicted_start)` across the lead's ACTIVE-trade forecast rows (earliest FUTURE-or-past-due; "when does ANYTHING start"), with p25/p75 as the window. `temporal_group` server-side via the shared `computeTemporalGroup`: the admin aggregation WRAPPER checks `lifecycle_stalled → action_required` FIRST, then delegates to the untouched shared function (the wrapper corrects the shared function's null-score `on_the_horizon`-before-stalled ordering for the new tool WITHOUT forking or editing the shared function — the consumer flight-board keeps its WF3-#13 demotion semantics).
- **Outputs:** the watchlist board (grouped action_required → departing_soon → on_the_horizon), the search results table, the detail drawer.
- **Edge Cases:** no-match search → 200 empty (a miss is a result, not an error); bad/empty `q` → 400; empty/invalid `ids` → 400; duplicate save → idempotent no-op; inspect 404/400 preserved; 401/403 on unauth.
</behavior>

---

<failure_modes>
## 4a. Known Failure Modes

- **No auto-eviction (retirement of the flight-board auto-archive).** The consumer `flight-board/route.ts` silently DROPS saved rows whose lifecycle advanced past the trade's `work_phase`. The Flight Center deliberately does NOT carry that behavior: a completed project persists on the watchlist until MANUALLY deleted — the admin's curation is authoritative, and manual bulk-delete is the replacement hygiene. Guard: the `GET /watchlist` query has no lifecycle-vs-work-phase filter; the no-eviction contract is pinned by the `.db` round-trip test (a saved+advanced row still returns).
- **competition_count / self-feed isolation drift.** Spec 76 §3.4 documented a sentinel-isolation assumption that no longer held: the prototype saved under the REAL admin uid into `lead_views`, reachable by the P9a self-feed / Spec 81 competition signal. Moving persistence to `admin_watchlist` restores that isolation structurally (admin curation never materializes a `tracked_projects` / competition row).
- **Sentinel-uid write behavior (PF1).** Mutations require `authMethod === 'session'`; `admin_key` writes 403; `dev_bypass` writes land under the shared `'dev-user'` sentinel (dev-local artifacts). Guard: the `.infra` test asserts the 403 on an `admin_key` mutation.
</failure_modes>

---

<testing>
## 5. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic:** `useFlightCenterStore` bulk-select add/remove/clear/selectAll idempotency (Spec 35 §8.1 B2); the delayed/expected-start aggregation wrapper (`lifecycle_stalled` precedence FIRST + shared-function pass-through); `buildLeadKey` coa-branch key format; store reset enumeration (Spec 35 §8.5).
- **UI:** `*.ui.test.tsx` — search idle/loading/empty/results; watchlist bulk-select → delete-confirm (hand-rolled `role="alertdialog"` modal — shadcn is NOT installed; never `confirm()`) flow; detail drawer delayed-badge + expected-start prominence; empty state; 768px responsive smoke.
- **Infra:** `*.infra.test.ts` — watchlist route auth-gate 401/403/200; the `authMethod` 403 on `admin_key` mutation; Zod request/response (bad body, empty `ids`, junk `lead_type` → 400); `verifyAdminAuth`-first + `withApiEnvelope` + parameterized-SQL source locks; action-telemetry breadcrumb + track fire BEFORE the network call.
- **DB (`*.db.test.ts`, `BUILDO_TEST_DB=1`):** bulk-save `ON CONFLICT` idempotency; bulk-delete by id array scoped to `admin_uid`; flight-list JOIN to permits + trade_forecasts; coa watch round-trip; the `admin_watchlist` XOR CHECK (permit vs coa shape) — a real-DB test because SQL-string tests miss CHECK/NOT-NULL.
- **E2E (Playwright):** DEFERRED — the repo has no Playwright harness yet (bootstrapping it is its own task). Filed to `docs/reports/review_followups.md`; the `.ui` suite carries the interaction coverage meanwhile.
<!-- TEST_INJECT_END -->
</testing>

---

<constraints>
## 6. Operating Boundaries

### Target Files
- `migrations/215_admin_watchlist.sql`, `scripts/analysis/backfill-admin-watchlist.js`
- `src/app/api/admin/leads/watchlist/**`
- `src/app/admin/flight-center/**`
- `src/components/admin/FlightCenterTool.tsx`, `src/components/admin/SearchPermitsModal.tsx`
- `src/features/admin-flight-center/**` (new `useWatchlist*` hooks + store; retired legacy hooks)
- `src/lib/admin/watchlist-schemas.ts`
- `src/features/leads/lib/record-lead-view.ts` (`buildLeadKey` coa branch only)

### Out-of-Scope Files
- `src/lib/leads/flight-board-temporal.ts` — the shared `computeTemporalGroup` is REUSED, never forked or edited (the consumer flight-board depends on its WF3-#13 demotion semantics).
- `src/app/api/leads/flight-board/route.ts`, `src/app/api/leads/save/route.ts`, `src/app/api/leads/search/route.ts` — the consumer routes stay unchanged; the Flight Center gets its own admin-guarded routes.
- `src/app/api/admin/leads/inspect/[id]/route.ts` — reused as-is; the ≥0.85 identity floor is NOT relaxed.
- `mobile/**` — no imports (Spec 33 §5).

### Cross-Spec Dependencies
- **Relies on:** Spec 33 (engineering), Spec 34 (testing), Spec 35 (state), Spec 89 (address-resolution precedent), Spec 81/84/85 (the forecast/lifecycle/score values the flight list reads).
- **Consumed by:** — (leaf admin tool). Spec 76 §3.4's Flight Center prototype is SUPERSEDED by this spec.
</constraints>
