# Two-Client Architecture

> ⚠ **Supabase migration in progress** (2026-07-18 program — Spec 113 `docs/specs/00-architecture/113_supabase_infrastructure.md`). Firebase/Cloud-SQL/GCS content in this doc reflects the **current implementation**; it is rewritten in **Phase 1** of `.cursor/active_task.md`.

> Dated note 2026-11-09 (McFrontend Phase 2, MF-41; M-246, prior text kept; spec review R-5, `~/Buildo-scratch/mcfrontend/PROGRAMME/SPEC-REVIEW-mobile-web.md`; operator, verbatim: "D-0-D-4 approved ... D-9 for sure" (D-1, D-9), record `~/Buildo-scratch/mcfrontend/phase1/open-questions.md`, "Operator rulings 2026-11-09: programme card v2.1 Part A, D-9"): the parcel product's (MaxBLD) web pages are planned in McFrontend Phase 2 (Spec 126 §11b.3): the web pages under a nested `(maxbld)` layout (MF-44) and the maxbld.ca landing and front door (MF-46, LATER); buildo.com is unchanged (D-9). The rule at :22 (no tradesperson-facing UI on Next.js) is unchanged for the lead-gen product. The live pages `/builders*` and `/permits/[id]` (registry §D) already depart from :22, and `/dashboard` is listed at :38.

**Spec ID:** `00-architecture/two_client_architecture`
**Status:** Active
**Decision date:** 2026-04-22

---

## 1. Decision

The Buildo product is now a **two-client architecture**:

| Client | Technology | Purpose |
|--------|-----------|---------|
| **Admin Control Panel** | Next.js (App Router) | Internal tooling — pipeline control, data quality, lead feed testing |
| **Tradesperson Mobile App** | Expo (React Native) | Lead discovery, saved leads, notifications — tradesperson-facing |

The Next.js app serves as the **API backend** for the mobile client. All tradesperson-facing UI previously in Next.js has been removed.

---

## 2. Rationale

- Native mobile delivers the UX fidelity required for tradesperson adoption (haptics, gestures, offline, push notifications)
- Separating admin and mobile clients eliminates accidental complexity in the Next.js bundle
- Backend API remains the single source of truth for both clients via a stable `{ data, error, meta }` envelope

---

## 3. Surviving Next.js Surface

### Admin pages (keep)
- `src/app/admin/` — full admin control panel (pipelines, data quality, lead feed test)
- `src/app/dashboard/` — authenticated user dashboard

### API routes (keep — now serve Expo)
- `src/app/api/leads/` — lead feed query endpoint for the mobile client
- `src/app/api/admin/` — admin-only pipeline triggers and quality tools
- `src/app/api/auth/` — Firebase session management
- All other `src/app/api/` routes

### Deleted (moved to Expo)
- `src/app/leads/`, `src/app/map/`, `src/app/search/`, `src/app/onboarding/`
- `src/features/leads/components/`, `src/features/leads/hooks/`

---

## 4. API Contract Rules for Multi-Client Consumption

Per `00_engineering_standards.md §4.4`:

1. **Stable envelope** — All routes return `{ data, error, meta }`. Never raw arrays.
2. **No client assumptions** — Routes return normalized data; each client transforms it.
3. **Token auth (future)** — Current cookie auth works for Next.js admin. When Expo connects, migrate to `Authorization: Bearer <firebase-id-token>` header auth.
4. **CORS** — When Expo connects from a non-browser runtime, configure explicit origins in `next.config.js`. Never `Access-Control-Allow-Origin: *` in production.
5. **Rate limiting** — Add middleware-level throttling to `/api/leads/` before Expo goes to production.

---

## 5. Mobile App Engineering Rules

See `mobile-rules.md` at project root for the full Expo engineering mandate.

---

## Operating Boundaries

| Boundary | Rule |
|----------|------|
| **In scope** | Next.js API routes, admin pages |
| **Out of scope** | Expo app source code (lives in a separate repo) |
| **Cross-spec dependencies** | `00_engineering_standards.md §4.4` (API for multi-app), `47_pipeline_script_protocol.md` (pipeline API) |
