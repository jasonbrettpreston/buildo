# Queued Task: Spec 116 Multi-Product Workstream (beyond the Supabase/Vercel migration)
**Workflow:** WF1 (Genesis) per sub-epic — promote via WF8 or activate after the migration program closes.
**Authority:** `docs/specs/00-architecture/116_multi_product_architecture.md` (DECIDED 2026-07-18). The migration program (`.cursor/active_task.md` D16) already owns: entitlements TABLE + webhook re-point (Phase 1.3), per-product Spec 96 gate + analytics product dimension (Phase 2.2). THIS task owns everything Spec 116 implies BEYOND that migration-embedded foundation.

## Sub-epics (each gets its own WF1 plan-lock; roster per Spec 08 — Schema-Fidelity on any schema-touching epic, Security on entitlement/billing, UX+Compliance on App B)

- [ ] **E1 — OD3 billing SKU ruling (HUMAN, first):** bundle-with-line-items vs independent per-product subs vs all-product tier. Gates the webhook fan-out shape (migration 1.3) and E2. Technical default if undecided at Phase 1 start: independent per-product subscriptions (simplest price→product→upsert fan-out; bundle logic layerable later).
- [ ] **E2 — Entitlement service layer:** shared `checkEntitlement(uid, product)` helper (server-side, app-layer per N5) consumed by API routes + both app gates; admin surface for manual entitlement grants/revokes (support tool); pgTAP/unit locks. Spec 96 FULL rewrite rides here (banner already placed).
- [ ] **E3 — Per-product analytics:** PostHog dashboards/funnels split by the product dimension (N6); conversion baselines per audience; Sentry tags product-scoped.
- [ ] **E4 — Monorepo shared-library extraction (additive, not a fork):** `packages/` local packages — Supabase client factories, entitlement helpers, auth bridges, shared Zod schemas for common tables. App A imports them first (proves the seam) before App B exists.
- [ ] **E5 — App B (lot-optimization) scaffold:** new Expo app on the shared foundation — own navigation/onboarding/session rhythm, own bundle id + store identity, reads parcels/massing/zoning/optconfig via new read-surface API routes (Philosophy A — through the gateway, not PostgREST). Cross-app identity smoke: one account holding App-A entitlement signs into App B.
- [ ] **E6 — OD4 lot-opt monetization (HUMAN, App-B-internal, LAST):** B2C motion (per-lookup/freemium/consumer sub) vs developer/agent pro tier — decide when App B UX exists.
- [ ] **E7 — Store listings + consumer obligations for App B:** listing/pitch/screenshots; privacy/consumer-grade policy review (B2C audience).

## Constraints carried from Spec 116
N4 persona≠entitlement (never collapse) · N5 product access = app-layer gate, RLS only for per-user private rows · N1 no single-app assumptions anywhere in shared code · App B blocks nothing in the migration.

## Sequencing
E1 → (migration Phases 1–2 land the foundation) → E2 → E3/E4 in parallel → E5 → E6/E7. Nothing here blocks the migration critical path (Spec 116 §6).
