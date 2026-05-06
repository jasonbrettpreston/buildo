# Active Task: WF1 — Cycle 4: Implement Spec 76 Cycle-3 amendment (Flight Center Tool + Lead Detail Inspector + Flight Job Detail Inspector)
**Status:** Implementation (authorized 2026-05-06; plan revised post-clarification — mobile-parity Flight Center with `<SearchPermitsModal>` mirroring mobile Spec 77 §3.1, NOT Test-Feed-driven saves)
**Workflow:** WF1 — New Feature Genesis (CODE — implements the spec amendment authored at commit `7b3289a`)
**Domain Mode:** Admin (web-admin only — modifies `src/components/admin/`, `src/app/admin/`, `src/lib/admin/`, `src/features/admin-flight-center/`)
**Rollback Anchor:** `345c429` (current HEAD — last Cycle 2 Phase 4 commit)

## Context

* **Goal:** ship the three admin tools defined by Spec 76 §3.4 / §3.5 / §3.6:
  1. **Flight Center Tool** (`/admin/lead-feed/flight-center`) — admin-scoped flight board UX mirroring mobile Spec 77 §3.2: 3 temporal sections (`action_required` / `departing_soon` / `on_the_horizon`), each card shows expected completion date (`predicted_start` + p25/p75 days), tap a card → opens §3.6 Flight Job Detail Inspector inline (drawer/modal, not a route nav). Uses `lead_views` + `flight-board` endpoint unmodified — no impersonation, admin's saves write `lead_views` rows under the admin's own session uid.
  2. **Lead Detail Inspector** (`/admin/lead-feed/inspector?tab=lead`) — paste a `lead_id`, see Spec 91 §4.3 `LeadDetail` payload (cost / neighbourhood / target_window / opportunity_score / competition_count / applicant / work_description / is_saved). JSON tree + structured render side-by-side. Catches schema drift via Zod parse error display.
  3. **Flight Job Detail Inspector** (`/admin/lead-feed/inspector?tab=flight`) — paste a `lead_id`, see Spec 77 §3.3.1 `FlightBoardDetail` payload (the list-item shape with `temporal_group` + `updated_at`). Same UI pattern as Lead Detail.
  4. **Cross-link:** Test Feed Tool result rows get an "Inspect" button → navigates to `/admin/lead-feed/inspector?id=...&tab=lead`. Flight Center cards open the Flight Job inspector as a drawer/modal.

* **Target Spec:** `docs/specs/02-web-admin/76_lead_feed_health_dashboard.md` §3.4 / §3.5 / §3.6 / §2.4 file map.
  Cross-spec: Spec 33 (engineering protocol) + Spec 35 (state architecture) + Spec 77 (mobile flight board contract) + Spec 91 (mobile lead feed `LeadDetail` contract).

* **Key Files:**
  * **NEW** — `src/lib/admin/admin-uid.ts` — exposes `getAdminUid()` returning the canonical admin sentinel (`'admin-test'`); single source for the synthetic `user_id` referenced by the test feed tool's `LeadFeedInput`.
  * **NEW** — `src/lib/admin/lead-schemas.ts` — web-admin-owned Zod copies of `LeadDetailSchema` / `FlightBoardItemSchema` / `FlightBoardDetailSchema`. Mobile `mobile/src/lib/schemas.ts` is excluded from the web tsconfig (`"exclude": ["mobile"]`); a wrapper module is the spec-deferred mechanism (§2.4 line 90 — "decided at implementation plan-lock"). Drift defended by a contract test that mounts BOTH schemas and asserts equivalent accept/reject on a shared fixture set.
  * **NEW** — `src/features/admin-flight-center/api/useAdminFlightBoard.ts` — TanStack Query hook for `GET /api/leads/flight-board` (Spec 33 §5 named-hook mandate).
  * **NEW** — `src/features/admin-flight-center/api/useFlightBoardDetail.ts` — TanStack Query hook for `GET /api/leads/flight-board/detail/:id`.
  * **NEW** — `src/features/admin-flight-center/api/useLeadDetail.ts` — TanStack Query hook for `GET /api/leads/detail/:id`.
  * **NEW** — `src/features/admin-flight-center/api/useSavePermit.ts` — TanStack Query mutation hook for `POST /api/leads/save` with optimistic update + rollback per Spec 35 §B3.
  * **NEW** — `src/components/admin/FlightCenterTool.tsx` — Flight Center UI.
  * **NEW** — `src/app/admin/lead-feed/flight-center/page.tsx` — Flight Center page shell.
  * **NEW** — `src/components/admin/LeadDetailInspector.tsx` — JSON-tree + structured-render probe for `LeadDetail`.
  * **NEW** — `src/components/admin/FlightJobDetailInspector.tsx` — JSON-tree + structured-render probe for `FlightBoardDetail`.
  * **NEW** — `src/app/admin/lead-feed/inspector/page.tsx` — paired-tab page mounting both inspectors; URL query state (`?id=...&tab=lead|flight`) is the source of truth so deep-links from the Test Feed Tool work.
  * **MODIFIED** — `src/components/admin/TestFeedTool.tsx` — add an "Inspect" link on each result row pointing at `/admin/lead-feed/inspector?id=<permit_num>--<revision_num>&tab=lead`. No fetch refactor (Spec 33 §13 "next-touch retrofit" applies to ENDPOINTS, not unrelated forms; the Test Feed Tool has been pre-existing pre-Spec-33 and stays as-is for this cycle).
  * **MODIFIED** — `src/app/admin/lead-feed/page.tsx` — add tile-style navigation links to the Flight Center + Inspector sub-pages.

## Technical Implementation

* **New/Modified Components:** `<FlightCenterTool>`, `<LeadDetailInspector>`, `<FlightJobDetailInspector>`, edits to `<TestFeedTool>` + `/admin/lead-feed/page.tsx`.
* **Data Hooks/Libs:**
  * `src/features/admin-flight-center/api/useAdminFlightBoard.ts` — `useQuery` against `/api/leads/flight-board`; Zod-parses response with `FlightBoardItemSchema[]`; staleTime 30s + refetchInterval 30s (mirrors mobile cadence). Spec 33 §13 mandate.
  * `src/features/admin-flight-center/api/useFlightBoardDetail.ts` — `useQuery(id)`; Zod-parses `FlightBoardDetailSchema`. `enabled: !!id` so the hook is inert until the user picks an id.
  * `src/features/admin-flight-center/api/useLeadDetail.ts` — same shape, parses `LeadDetailSchema`.
  * `src/features/admin-flight-center/api/useSavePermit.ts` — `useMutation` for `POST /api/leads/save` with optimistic update of the `['admin', 'flight-board']` query cache (Spec 35 §B3 pattern). On error: rollback + `logError`.
  * `src/lib/admin/admin-uid.ts` — `getAdminUid()`; defaults to `'admin-test'`. Env override via `ADMIN_TEST_UID` for test-DB seeding.
  * `src/lib/admin/lead-schemas.ts` — `LeadDetailSchema`, `FlightBoardItemSchema`, `FlightBoardDetailSchema` Zod definitions. TS types via `z.infer`.
* **Database Impact:** **NO** — Cycle 4 reuses 100% existing endpoints + tables (`lead_views`, `permits`, `cost_estimates`, `permit_trades`). No migration. No new DB-touching code.

## Standards Compliance

* **Try-Catch Boundary:** N/A — Cycle 4 adds NO new admin API routes. The new code is client-side only (hooks + components) reusing existing user-facing endpoints (`/api/leads/flight-board`, `/api/leads/flight-board/detail/:id`, `/api/leads/detail/:id`, `/api/leads/save`). Per Spec 76 §3.4 + §2.6, those endpoints are out-of-scope for modification.
* **Unhappy Path Tests:** schema drift (Zod parse failure shows raw response side-by-side), 404 (`lead_views` LATERAL gate per Spec 91 §4.3.1 — admin must save first; UI explains the "save it via Flight Center" recovery path), 400 (invalid `lead_id` shape — UI shows endpoint error verbatim), network failure (TanStack Query retry then error state), optimistic-save rollback on `POST /save` failure.
* **logError Mandate:** every catch block in the new hooks calls `logError('[admin/flight-center]', err, { stage })`. The mutation rollback path also `logError`s before reverting the optimistic cache.
* **UI Layout:** desktop-first `md:` breakpoints per Spec 33 §3 (admin = desktop-primary). Flight Center grid is `md:grid-cols-3` for the three temporal sections, stacking to a single column below `md`. Inspector tabs are `md:flex-row` / `flex-col`.

### Spec 33 + Spec 35 compliance baked into each phase
* **Spec 33 §3 (server-component-first):** pages (`/admin/lead-feed/flight-center/page.tsx`, `/admin/lead-feed/inspector/page.tsx`) are server-rendered shells; the interactive tools mount as client subtrees inside `QueryClientProvider`s scoped per-mount via `useState(() => new QueryClient(...))` (the Cycle 2 Phase 4 fix pattern).
* **Spec 33 §5 (named-hook mandate):** every server read goes through a named hook in `src/features/admin-flight-center/api/`. NO inline `fetch()` in `queryFn`.
* **Spec 33 §11 + §13 (Zod boundary):** every endpoint response is `safeParse`d via the schemas in `src/lib/admin/lead-schemas.ts`. Zod failure → `parse_error` UI state.
* **Spec 33 §13 (timing-safe / etc.):** N/A — no new auth surface.
* **Spec 35 §5.1 (one auth gate per route boundary):** the new pages live under `/admin/*` which is gated by middleware + the existing per-route admin checks for any admin-specific endpoints. Cycle 4 introduces no new auth gates because no new endpoints exist.
* **Spec 35 §B3 (optimistic mutation + rollback):** `useSavePermit` follows the Layer-3 pattern — optimistic write to the TanStack cache, on error rollback the previous snapshot + `logError`. Test asserts both the optimistic ON path and the rollback ON-error path.
* **Spec 35 §6.1 (atomic selectors):** N/A — no Zustand stores added (server state only).
* **Spec 35 §7.1 (admin action telemetry):** save / unsave / inspect actions emit `logAdminEvent` with the PII allowlist already defined in `src/lib/admin/analytics.ts` (Cycle 2 Phase 0 foundation).
* **Spec 35 §8.2 (auth-gate test):** UI tests assert that the page-level component renders only when admin auth context is mocked — the page-level guard in production is middleware + the page wrapper checking session.

## Execution Plan

### Phase 0 — Foundation
- [ ] **0.1** — `src/lib/admin/admin-uid.ts`: `getAdminUid()` returning `process.env.ADMIN_TEST_UID ?? 'admin-test'`. Single export, single concern.
- [ ] **0.2** — `src/lib/admin/lead-schemas.ts`: web-admin-owned Zod definitions for `LeadDetailSchema`, `FlightBoardItemSchema`, `FlightBoardDetailSchema` (= alias of `FlightBoardItemSchema` per Spec 77 §3.3.1 post-WF1-C). Source-of-truth comment with explicit field-by-field diff vs. the mobile copy.
- [ ] **0.3** — `src/tests/admin-lead-schemas.contract.test.ts`: contract drift test importing BOTH the web copy and `mobile/src/lib/schemas.ts` at test runtime; mounts a fixture-set of valid + invalid payloads and asserts both schemas produce identical accept/reject + same field-level error count. Vitest is happy with the relative import even though the web tsconfig excludes `mobile/`.
- [ ] **0.4** — Logic test for `admin-uid.ts` (env override, default sentinel). Commit Phase 0.

### Phase 1 — TanStack Query hooks
- [ ] **1.1** — `src/features/admin-flight-center/api/useAdminFlightBoard.ts`: `useQuery(['admin','flight-board'], fetchFlightBoard)`; `staleTime: 30_000` + `refetchInterval: 30_000` (mobile cadence). Returns `FlightBoardItem[]` already grouped by `temporal_group`. Zod parse with `FlightBoardResultSchema` envelope.
- [ ] **1.2** — `src/features/admin-flight-center/api/useFlightBoardDetail.ts`: parameterised by `id`; `enabled: !!id`. Zod-parses `FlightBoardDetailSchema`. Maps non-200 to typed error: `404 → 'NOT_SAVED'`, `400 → 'INVALID_ID'`, others → `'NETWORK'`.
- [ ] **1.3** — `src/features/admin-flight-center/api/useLeadDetail.ts`: same shape, parses `LeadDetailSchema`.
- [ ] **1.4** — `src/features/admin-flight-center/api/useSavePermit.ts`: `useMutation` for `POST /api/leads/save` with `{lead_id, lead_type:'permit', saved:true}`. Optimistic update of `['admin','flight-board']` cache via `queryClient.setQueryData` (Spec 35 §B3). `onError` rollback + `logError`. `onSuccess` invalidates `flight-board` query (mobile parity per `SearchPermitsSheet:52-57`).
- [ ] **1.5** — `src/features/admin-flight-center/api/useUnsavePermit.ts`: same shape but `saved:false`. Web admin's port of mobile swipe-to-remove. No undo snackbar in this cycle (Phase 5 followup if needed).
- [ ] **1.6** — `src/features/admin-flight-center/api/useSearchPermits.ts`: debounced `useQuery(['admin','search-permits', q], fetchSearch)` against `GET /api/leads/search?q=`; `enabled: q.trim().length >= 2`; Zod-parses `SearchResultsSchema`. Mirrors mobile `useSearchPermits.ts`.
- [ ] **1.7** — `src/tests/admin-flight-hooks.logic.test.ts`: 6 hooks × happy + Zod-parse-failure + (for save) optimistic-then-rollback + (for search) min-length gate. ~24 tests.
- [ ] **1.8** — Typecheck + targeted vitest run. Commit Phase 1.

### Phase 2 — Flight Center Tool (mobile-parity: search → claim → board)
- [ ] **2.1** — `src/components/admin/SearchPermitsModal.tsx`: web port of mobile `<SearchPermitsSheet>` (Spec 77 §3.1). Native `<dialog>` element with Tailwind, focus-trap-on-open. Search input (debounced 300ms) + result list + per-row "Save" button. On successful save: invalidates flight-board query + closes modal + brief success toast.
- [ ] **2.2** — `src/components/admin/FlightCenterTool.tsx`: header bar with "Search permits" button (opens §2.1 modal) + 3 temporal sections (`action_required` / `departing_soon` / `on_the_horizon`); each card renders address + lifecycle_phase + lifecycle_stalled badge + expected completion (`predicted_start ± p25/p75`) + per-card "Unsave" button + tap-the-card → opens `<FlightJobDetailInspector>` in inline drawer (no route nav per §3.4). Empty-state copy: "No permits saved yet. Use **Search Permits** above to find and claim a permit."
- [ ] **2.3** — `src/app/admin/lead-feed/flight-center/page.tsx`: server-component shell with header + `<Link href="/admin/lead-feed">← Lead Feed</Link>` + mounts `<FlightCenterTool>` inside `QueryClientProvider` (per-mount `useState(() => new QueryClient(...))`).
- [ ] **2.4** — `src/tests/admin-flight-center.ui.test.tsx`: render the 3 sections, render a card with the predicted-start string, open search modal → type query → click Save → optimistic add → close modal → board shows the new permit, click card → drawer opens. ~12 tests.
- [ ] **2.5** — Typecheck + targeted vitest. Commit Phase 2.

### Phase 3 — Detail Inspectors
- [ ] **3.1** — `src/components/admin/LeadDetailInspector.tsx`: text input for `lead_id` + Inspect button + JSON tree (one level expanded) + structured render of every field per Spec 91 §4.3 contract. Three explicit UI states: (a) idle, (b) loading, (c) result OR error. Error state distinguishes 404 (with "save first via Flight Center" recovery copy), 400 (validation error verbatim from endpoint), schema drift (parse error + raw response side-by-side).
- [ ] **3.2** — `src/components/admin/FlightJobDetailInspector.tsx`: parallel structure to §3.1, parses `FlightBoardDetailSchema`, structured render covers `temporal_group` + `updated_at` (which §3.5 LeadDetail does NOT expose).
- [ ] **3.3** — `src/app/admin/lead-feed/inspector/page.tsx`: paired-tab page reading `?id=` and `?tab=lead|flight` from `useSearchParams`; tab toggle preserves the `id`. Server-component shell with `<Suspense>` wrapping the client subtree (since `useSearchParams` requires it under App Router).
- [ ] **3.4** — `src/tests/admin-detail-inspectors.ui.test.tsx`: 3 states × 2 inspectors + tab toggle preserves id + URL-deep-link prefills the input. ~14 tests.
- [ ] **3.5** — Typecheck + targeted vitest. Commit Phase 3.

### Phase 4 — Cross-tool wiring + landing-page nav
- [ ] **4.1** — `src/components/admin/TestFeedTool.tsx`: add a small "Inspect →" link in each result row pointing at `/admin/lead-feed/inspector?id=<permit_num>--<revision_num>&tab=lead`. No "Save to Flight Board" button on Test Feed rows — saves are owned by the Search Permits modal (mobile parity, Phase 2.1). No fetch-path refactor (Spec 33 §13 "next-touch retrofit" applies to ENDPOINTS; this is a one-off non-polling form, exempt for this cycle).
- [ ] **4.2** — `src/app/admin/lead-feed/page.tsx`: add two tile-style navigation links — "Flight Center" + "Inspectors" — under the existing `<TestFeedTool>` mount, mirroring the `/admin` nav-hub tile pattern (Phase 3 of Cycle 2).
- [ ] **4.3** — UI test extension: verify the "Inspect →" link in `TestFeedTool.ui.test.tsx` if present (otherwise add a minimal smoke for the link href shape).
- [ ] **4.4** — Full pre-commit gauntlet (`npm run typecheck && npm run lint && npm run test`). Commit Phase 4.

### Phase 5 — Multi-Agent Review (per WF1 protocol + saved feedback memory)
- [ ] **5.1** — Gemini adversarial review of `useSavePermit.ts` (the only new state-mutating surface — optimistic update + rollback is the highest-risk seam) with context Spec 35.
- [ ] **5.2** — DeepSeek adversarial review of `lead-schemas.ts` + the contract drift test (the schema-mirror seam — drift here ships malformed payloads to the inspector silently) with context Spec 33.
- [ ] **5.3** — Worktree-isolated `feature-dev:code-reviewer` agent reviewing the full Phase-1-through-4 diff + the 6 new files for spec compliance, dead code, naming, type safety. Inputs: spec path + commit list + one-sentence summary.
- [ ] **5.4** — Triage findings into fix-now vs. followup. Fix-now applied. Deferred → `docs/reports/review_followups.md` (Spec 76 Cycle 4 section). Final pre-commit gauntlet. Commit Phase 5.

> **PLAN LOCKED. Do you authorize this WF1 Cycle 4 plan? (y/n)**
> §10 note: schema-import mechanism — chose web-admin-owned wrapper module (`src/lib/admin/lead-schemas.ts`) + contract drift test rather than relaxing the web tsconfig `exclude: ["mobile"]` boundary. The wrapper preserves bundle isolation; the drift test guards against silent schema divergence. Spec 76 §2.4 deferred this decision to plan-lock (this document).
> DO NOT generate code. DO NOT run commands. TERMINATE RESPONSE.
