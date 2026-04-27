# Admin Mode — Full Rules

Read this file when declaring **Domain Mode: Admin**.
Applies to: `src/components/`, `src/app/` (pages), `src/hooks/`, admin-only `src/lib/` modules,
and `mobile/` (Expo source — non-Maestro changes).

Required reading before generating the active task:
- `docs/specs/00_engineering_standards.md` §1 (Architecture & UI), §4.3 (Frontend Security),
  §10 (Boundary), §13 (Observability Standards)

---

## Expo Note
`src/features/leads/` consumer UI has moved to the Expo repo (`mobile/`).
The only Next.js frontend is the admin panel — an internal desktop-first tool.
`mobile/` follows mobile-first conventions enforced by its own toolchain.

---

## Required Tooling Stack
*No substitutions without prior approval.*

| Concern | Tool | Why |
|---------|------|-----|
| Server state / data fetching | **TanStack Query** | NEVER use `useEffect` for API calls. Always handle loading/error states. |
| Global UI state | **Zustand** | Use for shared filter/selection state across admin views. |
| Local form state | **React Hook Form + Zod resolver** | NEVER use `useState` for form fields. |
| API input validation | **Zod** with differentiated 400 responses (NOT generic 500) | Field-level error messages. |
| UI primitives | **Shadcn UI** | Headless, accessible. Run `npx shadcn@latest add [component]`. |
| Animations | **Motion for React** (`motion` package) | Spring: `stiffness: 400, damping: 20, mass: 1` for button interactions. |
| Toast notifications | **Sonner** (via Shadcn) | NEVER build custom alert banners or use `alert()`/`confirm()`. |
| Error tracking | **Sentry** wired into `app/[...]/error.tsx` boundaries | Source maps uploaded on build. |
| Auth | **Firebase Auth** with `verifyIdToken` in middleware | Never swap for Clerk or other providers without architectural approval. |
| Dashboard primitives | **Tremor** (`@tremor/react`) | `<ProgressCircle>`, `<BarList>`, `<Tracker>` for data viz. |

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
