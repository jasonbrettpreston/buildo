# Spec 33 — Web Admin Engineering Protocol & Architecture

> ⚠ **Supabase migration in progress** (2026-07-18 program — Spec 113 `docs/specs/00-architecture/113_supabase_infrastructure.md`). Firebase/Cloud-SQL/GCS content in this doc reflects the **current implementation**; it is rewritten in **Phase 1** of `.cursor/active_task.md`.

## 1. Goal & User Story

**Goal:** define the engineering foundation for the Buildo admin web app at `/admin/*` so customer-success operators, growth ops, and engineering can confidently run pipeline diagnostics, edit `logic_variables`, manage user accounts, and inspect mobile-side telemetry without each contributor re-deriving architectural conventions.

**User Story:** as an engineering or operations contributor opening this codebase for the first time, I need a single document I can read in 30 minutes that tells me what tech stack the admin uses, what NOT to do, where state lives, what the testing bar is, and which observability surfaces I'm expected to wire — so I can ship admin features that don't drift from the rest of the system.

**Authority precedence:** Spec 33 is the engineering-protocol authority for `src/app/admin/**`, `src/app/api/admin/**`, and `src/components/admin/**`. Where this spec contradicts the older Spec 26 (Admin Dashboard) or Spec 21 (User Management), Spec 33 wins; the feature spec must be amended to align.

**Numbering note (2026-05-06):** the web-admin engineering / testing / state-architecture trio uses Specs 33 / 34 / 35 in `docs/specs/02-web-admin/` rather than 90 / 98 / 99. The 90/98/99 slots are already occupied by the parallel mobile specs in `docs/specs/03-mobile/`. Reusing the same numbers across folders would cause "Spec 90" to be ambiguous in cross-references; 33/34/35 disambiguate while sitting in the natural numerical sequence after Spec 30 (App Health Dashboard).

## 2. Platform & Browser Matrix

The admin runs in modern browsers — desktop-first, responsive. Targets:

1. **Desktop browsers (primary):** Chrome / Edge / Firefox / Safari latest 2 versions. Standard 1280×800 minimum viewport.
2. **Tablet (iPad / Android):** UI must remain usable on 768px+ viewports. Use Tailwind `md:` breakpoints to adapt dense tables to scrollable cards. Touch targets ≥44px.
3. **Mobile (rare):** admin is NOT mobile-first. A phone-sized viewport (`< 768px`) renders a degraded but functional view — read-only where multi-column tables would cause horizontal scrolling. Most admin features assume a keyboard.

**Theme constraint:** the admin supports a single theme (light) at present. Adding dark mode requires a Spec 33 amendment to enumerate the token mapping; do NOT add `dark:` Tailwind variants ad-hoc.

## 3. The Prime Directive: Server-Component-First

The admin is **NOT** a "dumb glass" client (that mandate applies to mobile per `docs/specs/03-mobile/90_mobile_engineering_protocol.md` §3). Web admin tools are **information-dense, interactivity-rich**, and benefit from server-side rendering. The directive instead is:

> **Server Components by default. Client Components only when interactive.**

1. Pages and layouts are **React Server Components** (RSC) unless they have client-side state (form inputs, polling, animations).
2. Data fetching for initial paint happens **server-side** via direct database access in route handlers or server components — NOT via client-side `fetch` to our own API routes (round-trip waste).
3. Client Components are explicitly marked `"use client"` and isolated to the smallest interactive subtree (a form, a chart, a polling tile). The surrounding shell stays server-rendered.
4. **Admin tools that look like apps** (Spec 86 Control Panel, Spec 76 Test Feed Tool, Spec 30 App Health Dashboard) consume client-side TanStack Query for live data — but the page shell that mounts them is server-rendered.

**Why:** admin uses are bursty (operator opens a page, performs a task, closes). Aggressive SSR + cached server reads minimize TTFB; minimal client JS reduces bundle size and parser cost. The opposite tradeoff (SPA with heavy client routing) optimizes for app-like persistence which admin doesn't need.

## 4. The Tech Stack Constraints

The admin's tech stack is the Next.js half of this monorepo. Strict constraints:

- **Framework:** Next.js 15+ App Router. Pages live under `src/app/admin/**`; API routes under `src/app/api/admin/**`. **`pages/` directory is BANNED** — App Router only.
- **Server-side rendering:** React Server Components by default. Client Components only with `"use client"` and only when interactive state is needed.
- **UI primitives:** **Tailwind + native elements, hand-composed.** ⚠️ **CORRECTION (2026-07-10, P15):** shadcn/ui is **NOT initialized in this repo** — there is no `components.json`, and `src/components/ui/*` holds only `Badge.tsx` + `ScoreBadge.tsx`, not shadcn primitives. Earlier drafts of this spec (and `.claude/domain-admin.md`) mandated "compose from shadcn/ui primitives"; that misled the P15 Flight Center plan. The **actual** house convention: build admin UI from Tailwind-styled native elements. For a destructive confirm, hand-roll a modal with `role="alertdialog"` (precedent: `src/features/admin-controls/components/ConfirmSyncModal.tsx`; Flight Center's in-page delete confirm `src/components/admin/FlightCenterTool.tsx`) — **never** the browser `confirm()`/`alert()`. Skeletons/loading placeholders are hand-rolled `<div>`s. Do NOT install pre-styled UI libraries (`@tremor/react`, `chakra-ui`, `mui`, `@mantine/core`, `shadcn/ui`, `radix-ui`) without a Spec 33 amendment naming the dependency first; they conflict with Tailwind theming + bloat the bundle.
- **Toasts:** **`sonner`** (already a dependency; precedents: Spec 86 Control Panel, Spec 36 Flight Center). Never build custom alert banners or use `alert()`.
- **Styling:** Tailwind CSS only. No CSS modules, no styled-components, no inline `<style>` blocks. Design tokens live in `tailwind.config.ts`.
- **Icons:** **inline SVG** (no icon library is installed). ⚠️ `lucide-react` is **NOT** in the dependency tree — `src/components/admin/lead-inspector/LifecycleTimelinePanel.tsx` documents this and defines inline `<svg>` icons instead. Adding `lucide-react` is a future Spec-33-conformance WF (name the dependency in an amendment); until then, hand-write SVGs. (Mobile uses `lucide-react-native` per Spec 90 mobile §5 — separate toolchain.)
- **Server state (client-side reads):** `@tanstack/react-query` v5. Mirrors mobile Spec 90 §4 mandate. Every server fetch from a client component goes through TanStack Query — never raw `fetch()` in render.
- **Client state (admin draft / UI ephemeral):** `zustand` v5. Admin draft state (e.g., Spec 86 Control Panel unsaved edits) lives in dedicated stores per Spec 35 §3 Field Ownership Matrix.
- **Schema validation:** **Zod** at every boundary — request body, response payload, env vars, external API responses. See §13 Bug Prevention.
- **Database access (server only):** `pg` `Pool` singleton at `src/lib/db/client.ts`. Parameterized queries via numbered placeholders (`$1`, `$2`); template-literal string concatenation is BANNED (SQL injection class).
- **Auth (server-side):** Firebase Admin SDK on the server validates the `__session` cookie or `X-Admin-Key` header per Spec 21 §2 + Spec 76 §2.6. Admin gate at the route handler boundary, never inside a server component.
- **Testing:** Vitest (logic + infra), Playwright (E2E), React Testing Library (component). See Spec 34 for the testing protocol authority.
- **Observability:** Sentry (errors), PostHog (admin-side product analytics — minimal compared to mobile). Spec 30 App Health Dashboard cross-references both.

## 5. Strict Anti-Patterns (NEVER DO THESE)

If you do any of the following, you have failed:

- **NO `fetch()` from server components to our own API routes.** Server components access the DB directly via `pool.query` (or via shared lib functions). Round-tripping through `/api/*` from a server component wastes a network hop.
- **NO admin auth bypass.** Every `src/app/api/admin/**` route handler MUST call `verifyAdminAuth(request)` (or equivalent) before reading params or touching the database. The middleware-only pattern is insufficient — middleware can be bypassed by misconfigured Next.js rewrites; the per-route guard is defense-in-depth.
- **NO PII in logs.** `console.log(user)` where `user` includes email/phone/displayName is BANNED. Use structured logging via `src/lib/logger.ts` which strips PII fields before serialization. Sentry breadcrumb data MUST be sanitized — Spec 35 §7 codifies the allowlist.
- **NO unparameterized SQL.** Template-literal interpolation into a query string (`pool.query(\`SELECT * FROM users WHERE id = ${id}\`)`) is BANNED. Use `$1`/`$2` placeholders with the args array.
- **NO client-side fetch without TanStack Query.** Direct `fetch()` from a `"use client"` component bypasses caching, deduplication, retry, and error mapping. Wrap every server read in a hook (`useAdminMarketMetrics`, `useAppHealth`, etc.).
- **NO `useEffect` for data fetching.** Mirror of mobile Spec 90 §5. TanStack Query handles the lifecycle.
- **NO storing sensitive data in `localStorage`.** Admin session tokens, API keys, user PII, payment data — all BANNED in client storage. `localStorage` is restricted to non-sensitive UI preferences (theme, table column visibility) per Spec 35 §3.
- **NO direct mutation of TanStack Query cache without invalidation.** Use `queryClient.setQueryData` for optimistic updates ONLY when paired with a corresponding `invalidateQueries` on settle (Spec 35 §B3 mirrors the mobile bridge pattern).
- **NO admin actions without observability.** Every state-mutating admin action (config save, user edit, lead view, pipeline trigger) MUST emit an `admin_action` Sentry breadcrumb + an `admin_action_performed` PostHog event — via the correct helper for the side (server `track(...)` vs client `captureEvent(...)`; see §11 for the split). Closes the audit's "admin telemetry — when admin tweaks logic_variables, what fires?" gap.
- **NO mobile imports.** The web admin MUST NOT import from `mobile/src/**`. The `mobile/` directory is a separate Expo project with React Native runtime — its imports break Next.js builds. Schemas that BOTH consume (e.g., `LeadDetailSchema`, `FlightBoardItemSchema`) are duplicated via the `_contracts.json` boundary OR a shared package; final mechanism is a Spec 35 amendment when the Detail Inspectors (Spec 76 §3.5–§3.6) implementation lands.

## 6. The Component Philosophy: Tailwind + native elements

⚠️ **CORRECTED 2026-07-10 (P15).** This section previously described a shadcn/ui component kit that **does not exist in this repo** (no `components.json`; `src/components/ui/*` = `Badge` + `ScoreBadge` only). An AI operator who plans against "shadcn primitives" will emit `import`s that don't resolve. The real convention:

**We do not `npm install` pre-themed UI libraries, AND we have no primitives kit.** Admin UI is composed directly from Tailwind-styled native HTML elements. Modals, dialogs, checkboxes, skeletons, tables are hand-rolled. Ownership of theme + behavior is total precisely because there is no dependency to own.

**Named precedents to copy (verify they still exist from the MAIN tree — worktree reviewers can't see untracked files):**
- Destructive confirm → `role="alertdialog"` modal, `src/features/admin-controls/components/ConfirmSyncModal.tsx` / `src/components/admin/FlightCenterTool.tsx`. Never `confirm()`.
- Search / edit form → pending/applied `useState` pattern (`src/components/admin/ParcelCostTool.tsx`, `StepOutputInspector`); Zod validates the submitted value. React Hook Form is **NOT** a dependency.
- Toast → `sonner` (`import { Toaster, toast } from 'sonner'`).
- Icons → inline `<svg>` (no `lucide-react`).
- Read-only tool → Spec 89 `ParcelCostTool` (auth + observability + accordion + tiered field rendering).

**Decision tree:**
1. Need a primitive (button, dialog, table, checkbox)? → hand-compose from Tailwind + native elements, copying the nearest precedent above.
2. Need a domain composition (`FlightCenterTool`, `AppHealthTile`)? → build in `src/components/admin/` from those primitives.
3. Need a genuinely new dependency (charting, complex map widget, `lucide-react`, a shadcn init)? → propose a Spec 33 amendment naming it BEFORE adding it. No charting library (`recharts`, `@tremor/react`) is currently installed — evaluate SVG/CSS first.

## 7. State & Data Flow Protocol

- **API contract authority:** route handler types in `src/app/api/admin/**/types.ts` are the source of truth for request/response shapes. Frontend client code derives types from these via Zod schemas (NOT from manual interface duplication). Mobile-side equivalent: Spec 90 mobile §7 monorepo pattern — web admin doesn't need monorepo-level sharing because both ends compile in the same TypeScript project.
- **Zod boundary (mandatory):** see §13.
- **Admin draft state pattern (Spec 86 precedent):** when an admin starts editing a server-authoritative dataset (e.g., `logic_variables`), the unsaved changes live in a Zustand store. The store has explicit `commitDraft(serverData)` and `discardDraft()` actions — no implicit cross-contamination between server-fetched state and draft state. Spec 35 §3 Field Ownership Matrix enumerates each admin store's owned fields.
- **No global state singletons.** Each Zustand store is feature-scoped (`useAdminControlsStore`, `useFlightCenterStore`). A "kitchen sink" admin store is BANNED — it makes ownership opaque and causes `useStore` re-renders to cascade.
- **Server state lifecycle:** TanStack Query default `staleTime` for admin reads is 60s (admin data changes slowly); `gcTime` is 5 min. Live-polling pages (Spec 30 App Health Dashboard, Spec 76 Lead Feed Health) override `staleTime` to match their poll cadence.

## 8. Auth Boundary Protocol

(Mobile Spec 90 §8 covered hardware/geolocation — N/A for web.)

- **Admin gate is server-side only.** Every `src/app/api/admin/**` route handler calls `verifyAdminAuth(request)` as the first line of the handler, BEFORE reading params or accessing the pool. Returns 401 on failure with a sanitized envelope.
- **Two valid auth modes:**
  1. **Browser session:** Firebase `__session` cookie set by the web admin login flow. Admin claim verified server-side via Firebase Admin SDK.
  2. **Service / CI:** `X-Admin-Key` header. Used by GitHub Actions workflows that hit admin endpoints (e.g., scheduled refresh of pipeline schedules). Key lives in EAS Secrets and Vercel env vars.
- **Page-level auth:** `src/app/admin/layout.tsx` checks the admin claim server-side and redirects non-admins to `/sign-in?next=/admin`. This is convenience UX — the actual security boundary is the per-route guard above.
- **NO client-side admin gate.** A client component checking `useUser()?.isAdmin` is BANNED as a security boundary; it can be bypassed trivially. Use it only to hide UI affordances; never as the sole protection on a destructive action.

### 8.1 Admin identity is per-admin ONLY on the session path (named pattern, P15)

`verifyAdminAuth` (`src/lib/auth/verify-admin.ts`) returns `{ uid, authMethod }` where the uid's meaning **depends on the auth method**:
- **`authMethod: 'session'`** (Firebase `__session` cookie, uid in the `ADMIN_USER_IDS` allowlist) → a **stable, distinct per-admin Firebase uid**. This is the ONLY path that identifies *which* admin acted.
- **`authMethod: 'admin_key'`** (`X-Admin-Key`) → the **shared sentinel `'admin-key'`**.
- **`authMethod: 'dev_bypass'`** (local dev) → the **shared sentinel `'dev-user'`**.

**The `admin_key`/`dev_bypass` uids are NOT personal identities.** Any admin feature that writes **per-admin-scoped rows** (a personal watchlist, a per-admin draft, a saved view) MUST gate its mutations on `authMethod === 'session'` and return **403** on `admin_key` (CI/pipeline scripts have no personal state); `dev_bypass` writes are tolerated as dev-local artifacts under the `'dev-user'` sentinel. This is the **Spec 36 PF1 pattern** and is now the house precedent for per-admin-scoped writes (`src/app/api/admin/leads/watchlist/route.ts`). Read-only endpoints accept all three auth methods. When emitting per-admin telemetry, hash the uid (`sha256(uid).slice(0,16)`, §11 + Spec 35 §7.3) — never the raw uid to PostHog.

## 9. UI & Styling Rules

- Touch targets `≥44px` for any interactive element (admin is desktop-first but operators sometimes use tablets).
- Dense information display is the admin aesthetic — favor compact tables, tight rows, monospace for IDs and numeric data. Padding is `py-2 px-3` for table cells, NOT `py-4 px-6` (mobile aesthetic).
- Use design tokens from `tailwind.config.ts` (mirrors mobile Spec 74 token discipline — web has its own token set).
- **Tables MUST sort and filter client-side for ≤200 rows.** Above that, the route handler implements server-side pagination (cursor-based, mirror of `LeadFeedCursor` shape).
- **Loading states:** every async surface (TanStack Query, Suspense boundary) has an explicit `<Skeleton>` placeholder matching the dimensions of the resolved content — no layout shift on load.
- **Empty states:** every list/table that can be empty (zero results, no permits in radius) renders a deliberate empty-state component, NOT a blank canvas. Mirror of Spec 90 mobile §14.
- **Keyboard shortcuts:** admin power users expect `cmd+k` command palette, `cmd+s` save, `esc` close-dialog. ⚠️ **PENDING — not yet built.** `cmdk` is **NOT** a dependency (earlier drafts wrongly called it "already a shadcn/ui dependency"; shadcn isn't installed either). The command palette + `useAdminCommandStore` are unimplemented (Spec 35 §3.2 marks the store PENDING). When built, register shortcuts at the `src/app/admin/layout.tsx` level with a native `keydown` listener or name `cmdk` in a Spec 33 amendment.

## 10. Testing Mandate

Authority: **Spec 34 web-admin testing protocol** (sibling spec). Summary here:

- **E2E (Playwright):** smoke flow per major admin route. Login fixture authenticates as a test admin. CI runs against postgres testcontainer per `src/tests/db/setup-testcontainer.ts` pattern.
- **Unit / Integration (Vitest):** existing `src/tests/*.{logic,infra}.test.ts` pattern. Logic tests for pure functions; infra tests for route handlers with mocked `pool.query` + `getCurrentUserContext` (precedent: `src/tests/leads-detail.infra.test.ts`).
- **Component (RTL):** for non-trivial admin components only. (There are no third-party UI primitives to skip — everything is hand-rolled per §6; test admin compositions with non-trivial internal state, not trivial presentational wrappers.)
- **Coverage threshold:** 75% for new code in `src/app/admin/**`, `src/app/api/admin/**`, `src/components/admin/**`. Lower than mobile's 80% because admin has more end-to-end test surface in Playwright that's hard to count under unit-test coverage tools.

## 11. Best-in-Class: Observability

- **Crash reporting:** `@sentry/nextjs`. Server + client SDKs. Source maps uploaded automatically per `sentry.config.ts`.
- **Sentry user context:** the admin layout sets `Sentry.setUser({ id: adminUid })` on session establish; clears on logout. Mirrors mobile Spec 99 §7.5 — admin crashes MUST be attributable to the admin who hit them.
- **Sentry breadcrumb on every admin action:** Spec 33 §5 anti-patterns + this section codify: every state-mutating admin action emits `Sentry.addBreadcrumb({ category: 'admin_action', message: <action>, data: <target> })`. Read-only admin actions (page view, list render) do NOT emit — too noisy.
- **PostHog admin events:** minimal vs mobile. Required: `admin_session_started`, `admin_action_performed: { action, target }`, `admin_config_committed: { keys_changed }`. Spec 35 §7 enumerates the full set.
- **⚠️ Server vs client telemetry are TWO different helpers (P15 — get this right or events go nowhere):**
  - **Server-side (route handlers):** `track(distinctId, eventName, props)` from **`src/lib/admin/analytics.ts`**. It POSTs to PostHog directly; `distinctId` MUST be the **hashed** admin uid (`sha256(uid).slice(0,16)` — §8.1 + Spec 35 §7.3), never the raw uid. It strips non-whitelisted keys (`ALLOWED_KEYS`). Fire-and-forget (`void track(...)`); telemetry MUST NOT crash a route.
  - **Client-side (`"use client"` hooks/components):** `captureEvent(name, props)` from **`src/lib/observability/capture.ts`** (wraps `posthog-js`) **plus** a `Sentry.addBreadcrumb({ category: 'admin_action', ... })`. Both fire **BEFORE the network call** (intent capture) — see the Flight Center mutation hooks (`src/features/admin-flight-center/api/useBulkSaveToWatchlist.ts`, `useBulkDeleteFromWatchlist.ts`).
  - **Read-only surfaces** (no mutation) emit **`captureEvent` only** — NO `admin_action` breadcrumb (the breadcrumb is mutation-scoped). Precedent: Spec 89 §2.6 (`ParcelCostTool` emits `captureEvent` on search/expand, no breadcrumb).
- **App Health Dashboard:** Spec 30 (`docs/specs/02-web-admin/30_app_health_dashboard.md`) is the consumer surface — it aggregates Sentry + PostHog data into a triage page. This protocol mandates the EMISSION; Spec 30 mandates the CONSUMPTION.
- **Server-side request logging:** every admin route handler emits a structured log (level + tag + request_id + duration_ms) via `src/lib/logger.ts`. PII-stripped (per §5 anti-patterns). Logs flow to Vercel + Sentry.

## 12. Best-in-Class: Scaling & Performance

- **Cache aggressively:** admin reads are mostly slow-changing pipeline state. Every `src/app/api/admin/**` route that returns query results MUST set the response `Cache-Control` header per the data's freshness expectation (e.g., `s-maxage=60, stale-while-revalidate=300` for market metrics). Do NOT default to `no-cache`.
- **Server-render initial paint:** admin pages MUST render initial data on the server. A page that flashes a `<Skeleton>` then fetches client-side is doing it wrong — use RSC + direct DB access for the first paint, then optionally hand off to TanStack Query for live polling.
- **Bundle size budget:** main admin bundle (`/admin` shell) must stay under 250 KB gzipped. Each route should code-split (Next.js does this by default via App Router). If a charting library is ever added (none is installed today — `recharts`/`@tremor/react` are NOT deps), it loads lazily via `next/dynamic`.
- **Database query budget:** admin endpoints respond in `<200ms` p99. Slow queries (>500ms) are logged with `WARN` level and a `slow_query` Sentry breadcrumb. Add an index BEFORE shipping the query, not after the slow-query log fires.
- **External API rate limits:** when calling Sentry / PostHog REST APIs (Spec 30 App Health Dashboard aggregator), respect their rate limits. Per Spec 30 §2.2: 60s cache TTL minimum, exponential backoff on 429.

## 13. Best-in-Class: Bug Prevention

- **The Zod Boundary (mandatory):** every admin endpoint MUST:
  1. Parse the query params + request body via Zod **before** any DB access.
  2. Parse the response payload via Zod **before** returning. The TypeScript type of the response is `z.infer<typeof ResponseSchema>`, never a hand-written interface.
  3. Parse external-API responses (Sentry, PostHog, Stripe) via Zod before consuming.
  - **The audit's gap:** `/api/admin/market-metrics` and `/api/admin/leads/test-feed` (the two existing admin endpoints) are NOT Zod-validated at their response boundary today. New endpoints from this protocol date forward MUST be; existing endpoints get retrofitted in their next touch.
- **TypeScript strict mode:** `"strict": true`, `"noImplicitAny": true`, `"noUncheckedIndexedAccess": true` (the third is web-admin-specific — it catches the array-access foot-gun common in admin tables).
- **Never `// @ts-ignore`.** Use `// @ts-expect-error <one-line reason>` so the suppression breaks if the type ever stops failing.
- **CSRF protection:** state-mutating admin endpoints (POST/PATCH/PUT/DELETE) MUST verify the `Origin` header matches an allowed admin domain. Implemented INSIDE the shared per-route guard, NOT in Next.js middleware: `src/lib/auth/verify-admin.ts:62-74` short-circuits mutating methods (`MUTATING_METHODS`, `:38`) through `isOriginAllowed()` (`:151-157` — DEFAULT-DENY on missing/unlisted `Origin` against `ADMIN_ALLOWED_ORIGINS`) BEFORE any auth-mode check; suite at `src/tests/verify-admin.logic.test.ts:193-270`. Route handlers add NO Origin code — a CSRF failure surfaces as `verifyAdminAuth` returning null → **401** (403 is reserved for auth-method rejections, e.g. the Spec 36 `admin_key` session-write rule).
- **Idempotency:** mutation endpoints should accept an `idempotency_key` header where state changes are non-trivial (mirror of Stripe webhook handling). Spec 86 Control Panel save-config flow already does this; extend to other admin mutations.

## 14. Best-in-Class: Operator Experience

- **Command palette (`cmd+k`):** primary navigation for power users. Lists every admin route + dynamic actions ("save current config", "trigger pipeline X").
- **Confirm-on-destructive:** delete/reset actions MUST require a typed confirmation (e.g., type the user's email to confirm deletion). Mirror of Stripe + GitHub admin UX.
- **Diff before save:** when committing config changes (Spec 86), show the operator a side-by-side diff (current → proposed) BEFORE the save fires. Reduces fat-finger errors on production logic_variables.
- **Toast feedback:** every mutation result (success, failure, partial) emits a `sonner` toast with category. Failure toasts are persistent until dismissed.
- **Undo where safe:** save actions that are reversible (config edit, user trial extension) offer a 5-second undo affordance. Destructive actions (account deletion) do NOT — irreversible by design.
- **Keyboard navigation:** every list/table is keyboard-navigable (arrow keys + Enter to drill in). `tab` order follows visual order. No focus traps in dialogs.

## 15. Admin Building Blocks — reuse, don't reinvent (P15)

Named house helpers an operator MUST reuse rather than hand-roll. Verify each still exists **from the main tree** before planning against it — worktree-isolated reviewers cannot see untracked files.

- **API envelope — `withApiEnvelope`** (`src/lib/api/with-api-envelope.ts`). Wrap every admin `GET`/`POST`/`DELETE` handler: it catches uncaught exceptions, sanitizes PG errors to `DATABASE_ERROR`, and guarantees a `{ data, error, meta }` shape on the failure path. **Success envelopes are handler-constructed** — the handler returns `ok(data, meta)` with **free-form `meta`**. Pagination lives in `meta` (`{ total, limit, offset }` — precedent: `src/app/api/admin/leads/watchlist/route.ts`), NOT in `data`. Zod-parse the payload before returning it (§13).
- **Canonical lead keys — `buildLeadKey`** (`src/features/leads/lib/record-lead-view.ts`). Any admin surface that joins `trade_forecasts.lead_id`, `lead_views.lead_key`, or `admin_watchlist.lead_key` MUST format the key through this ONE builder — **never hand-format**. It carries load-bearing subtleties: the permit arm is `permit:<num>:<rev>` where `<rev>` is `padStart(2,'0').slice(-2)` (matches PostgreSQL `LPAD(...,2,'0')` which TRUNCATES — a hand-rolled `padStart` alone silently mismatches on `rev='000'`), and the P15 `coa:<application_number>` branch (verbatim, no padding). Getting this wrong breaks the forecast JOIN silently (blank expected-start).
- **Retired-page idiom — `permanentRedirect()` (308), not `redirect()` (307).** When an admin page permanently moves, the old route file calls `permanentRedirect('/admin/new-path')` from `next/navigation` (precedent: `src/app/admin/lead-feed/flight-center/page.tsx` → `/admin/flight-center`). AND you MUST repoint every nav card/link to the new URL — never leave a nav affordance dangling on a redirect hop (Guardian lesson).
- **Admin migrations — follow the pipeline migration protocol.** Admin tables (e.g. mig 215 `admin_watchlist`) use the same conventions as pipeline migrations; the authority is **`docs/specs/01-pipeline/47_pipeline_script_protocol.md`** (do not duplicate it here). The mig-215 conventions that worked: XOR `CHECK` per `lead_type`; `pg_trgm` GIN index for substring/leading-wildcard `ILIKE` search (extension pre-installed mig 053); `CREATE INDEX CONCURRENTLY ... IF NOT EXISTS` (`migrate.js` statement-splits); an all-comments DOWN block (`validate-migration.js` Rule 6); and a **fresh-staging replay before push** (`BUILDO_TEST_DB=1` or local replay — SQL-string tests miss `CHECK`/`NOT NULL`/FK errors). `db:generate` (drizzle) may stay DEFERRED under the documented drift — the columns are raw-SQL-only until the drift is resolved.

---

**Cross-spec dependencies:**
- **Authoritative for:** all `src/app/admin/**`, `src/app/api/admin/**`, `src/components/admin/**`.
- **Relies on:** Spec 34 (web-admin testing protocol), Spec 35 (web-admin state architecture). Spec 47 pipeline script protocol (for shared SQL discipline). Spec 30 App Health Dashboard (consumer of the observability mandates here).
- **Consumed by:** Spec 21, 26, 30, 36, 76, 86 (every web-admin feature spec must follow this protocol).

**Amendment process:** changes to this spec require a doc-only WF2 commit cross-referencing the impact on consumer specs (21/26/30/76/86) so they can be updated in lockstep. Three documented incidents (paywallStore.clear/reset rename, FlashList v1/v2 transition, Spec 92 §4.4 60s window — all caught by the 2026-05-06 mobile-spec audit) traced to the protocol-vs-feature drift this amendment process prevents.
