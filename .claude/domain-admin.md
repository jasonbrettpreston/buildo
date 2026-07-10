# Admin Mode — Full Rules

Read this file when declaring **Domain Mode: Admin**.
Applies to: `src/components/`, `src/app/` (pages), `src/hooks/`, admin-only `src/lib/` modules,
and `mobile/` (Expo source — non-Maestro changes).

Required reading before generating the active task:
- `docs/specs/00_engineering_standards.md` §1 (Architecture & UI), §4.3 (Frontend Security),
  §10 (Boundary), §13 (Observability Standards)

**Required reading order for any admin feature:** Spec 33 (engineering protocol) → Spec 35 (state architecture) → Spec 34 (testing) → the target tool's own spec (e.g. 36 / 86 / 89). Read them in that order; 33 sets the tooling reality, 35 the state/telemetry, 34 the test bar, then the tool spec.

---

## Before you write admin code — P15 pre-flight

Distilled from the Spec 36 Flight Center build, where several spec claims misled the plan. One line each; follow the pointer.

1. **UI kit: none.** shadcn/ui is NOT initialized (no `components.json`; `ui/` = `Badge`+`ScoreBadge`). Compose Tailwind + native elements; copy `ConfirmSyncModal.tsx`. Spec 33 §6.
2. **Destructive confirm = `role="alertdialog"` modal**, Sonner for toasts. NEVER `confirm()`/`alert()`. Spec 33 §14.
3. **Icons = inline `<svg>`** (`lucide-react` not installed); **forms = `useState` + Zod** (React Hook Form not installed).
4. **Telemetry is two helpers:** server `track(hashedUid, ...)` (`src/lib/admin/analytics.ts`); client `captureEvent(...)` + `Sentry.addBreadcrumb(...)` BEFORE the network call. Read-only surfaces = `captureEvent` only. Spec 33 §11 / Spec 35 §7.1.
5. **Per-admin identity ONLY on the `session` path.** `admin_key`→`'admin-key'`, `dev_bypass`→`'dev-user'` are SHARED sentinels. Per-admin writes MUST require `authMethod==='session'` (403 on `admin_key`). Spec 33 §8.1 (the Spec 36 PF1 pattern).
6. **Store fan-out:** the Control Panel store is `useAdminControlsStore` (action `resetStore()`), NOT `useControlPanelStore`/`discardDraft`. New admin stores register in `resetAdminStores()` (`src/lib/admin/session.ts`) or fail the §8.5 coverage test. The §B4 uid-change handler exists but its provider is UNMOUNTED (contract+test enforced, not runtime-invoked).
7. **Canonical lead keys:** join `trade_forecasts.lead_id` / `lead_views.lead_key` / `admin_watchlist.lead_key` ONLY via `buildLeadKey` (`record-lead-view.ts`) — has permit (`padStart(2).slice(-2)`) + coa branches. Never hand-format. Spec 33 §15.
8. **Retired page = `permanentRedirect()` (308)**, not `redirect()` (307); repoint every nav card/link — never leave one dangling on a redirect. Spec 33 §15.
9. **API envelope:** wrap handlers in `withApiEnvelope`; success is handler-built `ok(data, meta)` with free-form `meta` (pagination in `meta`). Spec 33 §15.
10. **Admin migrations** follow `docs/specs/01-pipeline/47_pipeline_script_protocol.md` (XOR CHECK, `pg_trgm` GIN, `CREATE INDEX CONCURRENTLY IF NOT EXISTS`, all-comments DOWN, fresh-staging replay before push). Spec 33 §15.
11. **E2E harness does NOT exist** (`playwright` installed, no `tests/e2e/`). Test bar = Vitest `.logic`/`.infra`/`.ui` (+ `.db` under `BUILDO_TEST_DB=1`). Do not plan an E2E flow. Spec 34 §3.

**Reviewer gotcha:** worktree-isolated reviewers (Gemini/DeepSeek/Code Reviewer spawned with `isolation: "worktree"`) **cannot see untracked files** — a brand-new store/hook/component you haven't committed is invisible to them. Verify inventories (does `session.ts` enumerate every store? does this precedent file exist?) from the **MAIN tree**, not from a worktree reviewer's report.

---

## Expo Note
`src/features/leads/` consumer UI has moved to the Expo repo (`mobile/`).
The only Next.js frontend is the admin panel — an internal desktop-first tool.
`mobile/` follows mobile-first conventions enforced by its own toolchain.

---

## Required Tooling Stack
*What is ACTUALLY installed (verified against `package.json`, 2026-07-10 / P15). No new dependency without a Spec 33 amendment naming it.*

| Concern | Tool | Why / precedent |
|---------|------|-----|
| Server state / data fetching | **TanStack Query v5** | NEVER use `useEffect` for API calls. Always handle loading/error states. |
| Global UI state | **Zustand v5** | Feature-scoped stores (`useAdminControlsStore`, `useFlightCenterStore`) per Spec 35 §3. No kitchen-sink store. |
| Form state | **`useState` pending/applied pattern + Zod on submit** | ⚠️ **React Hook Form is NOT installed.** Copy `ParcelCostTool.tsx` / `StepOutputInspector`; validate the submitted value with a Zod schema. |
| API input validation | **Zod** with differentiated 400 responses (NOT generic 500) | Field-level error messages; parse request AND response (Spec 33 §13). |
| UI primitives | **Tailwind + hand-rolled native elements** | ⚠️ **shadcn/ui is NOT initialized** (no `components.json`; `src/components/ui/` = `Badge`+`ScoreBadge` only). Destructive confirm = `role="alertdialog"` modal (`ConfirmSyncModal.tsx` / `FlightCenterTool.tsx`) — never `confirm()`/`alert()`. See Spec 33 §6. |
| Icons | **inline `<svg>`** | ⚠️ **`lucide-react` is NOT installed** (`LifecycleTimelinePanel.tsx` documents this). |
| Toast notifications | **Sonner** (`import { Toaster, toast } from 'sonner'`) | Standalone dep (NOT "via shadcn"). NEVER build custom alert banners or use `alert()`. |
| Error tracking | **Sentry** (`@sentry/nextjs`) wired into `app/[...]/error.tsx` boundaries | Source maps uploaded on build. |
| Product analytics | server: **`track()`** (`src/lib/admin/analytics.ts`, hashed uid) · client: **`captureEvent()`** (`src/lib/observability/capture.ts`) + Sentry breadcrumb | ⚠️ Two different helpers — see Spec 33 §11 / Spec 35 §7.1. Wrong side = event silently dropped. |
| Auth | **Firebase Admin SDK**, `verifyAdminAuth(request)` as the FIRST line of every `/api/admin/**` handler | ⚠️ **Per-route guard, NOT middleware** (Spec 33 §8 — middleware is bypassable). Per-admin identity ONLY on the `session` path (§8.1). |
| Animations / charts | **none installed** | ⚠️ `motion`/`framer-motion`, `recharts`, `@tremor/react` are NOT deps. Prefer CSS/SVG; adding any is a Spec 33 amendment. |

---

## Rules — Never Violate

1. **No floating promises** — every async call must be `await`-ed or chained with `.catch()`.
2. **No `useEffect` for data fetching** — use TanStack Query. Period.
3. **No secrets in `'use client'` components** — public Firebase config only.
4. **No `dangerouslySetInnerHTML` without DOMPurify** — XSS guard.
5. **No `console.log` in committed code** — use `Sentry.captureException()` for errors.
6. **API → Expo contract** — if an API route is consumed by the Expo app, treat as Cross-Domain.
   Do not change the response shape without a contract note.

---

## Pre-Commit Gauntlet (Admin UI Files)
1. TypeScript strict check: `npm run typecheck`
2. ESLint: `npm run lint`
3. Vitest related tests: `npx vitest related [changed files] --run`
