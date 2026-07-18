# Spec 116 — Multi-Product Application Architecture

**Status:** DECIDED 2026-07-18 (4 enumerated open items carry recommended defaults; none block the migration critical path)
**SPEC LINK:** `docs/specs/00-architecture/116_multi_product_architecture.md`
**Numbering note:** referred to as "Spec 117" in the 2026-07-18 drafting conversation; landed as 116 (next free after 115, confirmed against the index).
**Cross-references:** Spec 113 (Supabase infra §5 connection strings, §8 pipeline-not-in-Vercel) · Spec 115 (pipeline compute on GitHub Actions) · Spec 114 (RLS catalog — §4 N5 keeps its posture unchanged) · Spec 93 (auth + AuthGate) · Spec 96 (subscription gate → entitlement) · Spec 99 (mobile state, §7.5 Sentry uid) · Spec 33/34/35 (web-admin) · `analytics.ts` (migration Phase 2.2 distinctId swap) · `.cursor/active_task.md` (Supabase migration program — consumes §4 as binding constraints)

<requirements>
## 1. Decision in one line

**Three products → TWO mobile apps + admin, over ONE shared backend.**

| Surface | Products | Primary audience | Form factor |
|---|---|---|---|
| **App A** (existing mobile) | Lead-gen + Flight-center, as entitlement-gated modules | Trades + suppliers (RE agents secondary) | Expo mobile |
| **App B** (new mobile) | Lot-optimization | Developers, RE agents, homebuyers (incl. B2C) | Expo mobile |
| **Admin** (existing web) | Ops / pipeline diagnostics | Internal | Next.js web (Spec 33, unchanged) |

**Shared across all surfaces:** one `auth.users` identity, one per-product `entitlements` table, the one enriched pipeline database.
**Not shared:** app binaries, navigation shells, store listings, onboarding flows.
</requirements>

<architecture>
## 2. Why this boundary (the test — so downstream calls stay consistent)

The binary boundary is decided by **runtime + workflow + market**, not by data-sharing (everything shares the DB) and not by form factor (all three are mobile). Apply this test to any future product to decide same-app vs new-app.

| Axis | (2) Lead-gen & (3) Flight-center | (1) Lot-optimization |
|---|---|---|
| Workflow | One motion: find the opportunity → track its timing to schedule around it. User crosses between them mid-task. | A distinct job: assess a parcel's development potential. |
| Audience | Trades, suppliers, RE — same B2B users | Developers, RE agents, homebuyers — different market, includes B2C consumer |
| Shell / runtime | Same Expo tab shell (lead feed + flight-board ship as tabs; flight-job is a detail screen within the flight-center module — Ground-truth correction 2026-07-18) | Own navigation, onboarding, session rhythm |
| Acquisition | Users are already in-app; a purchase lights up a tab | Cold App Store search by a buyer who does not have the app |
| Product identity | One B2B pipeline tool | Own store listing, pitch, screenshots; consumer-grade obligations |
| **Verdict** | **One binary, two entitlement-gated modules** | **Its own binary** |

The decisive fact for App B: lot-optimization is a **different product for a different market**, not a third feature for the existing audience. The homebuyer segment is B2C and shares nothing with a supplier tracking permit timing except the database underneath.

## 3. What is shared vs separate (by layer)

| Layer | Shared? | Detail |
|---|---|---|
| Database + pipeline | **Shared** | App B reads parcels / massing / centroids / zoning; App A reads trade_forecasts + lifecycle phase (classify-lifecycle-phase, compute-timing-calibration). One backend, two read-surfaces. |
| Identity | **Shared** | One `auth.users` per human. Load-bearing because RE agents are in the overlap — an agent may hold a lead-gen entitlement in App A and use App B. One identity across both apps or the agent fractures into two unlinked accounts. |
| Entitlement | **Shared** | One `entitlements` table, per-product shape (§4 N2). One `auth.users` row can hold a trades subscription and a lot-opt purchase side by side; neither app needs to know about the other's products. |
| Analytics | **Shared uid, product-scoped** | Shared Supabase uid as distinctId; add a product dimension so funnels are per-product, not blended across audiences that convert differently. |
| Codebase / shell | **NOT shared** | Two Expo apps, separate release trains, separate store listings. Share pure libraries via a monorepo local package (Supabase client setup, entitlement-check helpers, auth bridges, shared Zod schemas for common tables). Sharing the libraries is correct; sharing the shell is the mistake. |
</architecture>

<behavior>
## 4. Normative implications for the migration's auth + entitlement work (BINDING)

Each item is a constraint on the Supabase-migration Phase 1 (web auth + schema) and Phase 2 (mobile auth + gate) work in `.cursor/active_task.md`.

* **N1 — Identity is cross-app from day one.** `auth.users` serves both apps. The Spec 93 auth rewrite and the Spec 113 schema MUST NOT introduce any single-app / per-app-identity assumption. Both apps authenticate against the same Supabase project.
* **N2 — Entitlement is per-product from day one.** Replace the single `user_profiles.subscription_status` (Spec 96) with an `entitlements` table — **PK `(user_id, product)`**, columns `status`, `stripe_subscription_id`, `current_period_end`, `created_at`, `updated_at` (audit/debug timestamps — revision-panel fold 2026-07-18) — one row per user per product engaged. Existing subscribers backfill to a single `lead_gen` entitlement so no user's access changes at cutover (moot pre-launch at zero users, retained as the cutover rule regardless).
* **N3 — The Spec 96 gate becomes a per-product lookup.** The subscription gate reads the entitlement row for the product being opened, not a global status. App A gates lead-gen and flight-center independently. Same gate shape as today, one added dimension.
* **N4 — Persona ≠ entitlement (separate axes).** The `account_preset` persona axis (live values today: `tradesperson`/`realtor`/`manufacturer`/`supplier` per migration 217; `manufacturer` carries AuthGate Branch 4.5) describes who the user IS and shapes defaults/UX. Entitlement describes what they can OPEN. These are SEPARATE columns. A supplier persona holding a lead-gen entitlement is a valid, common combination. **Collapsing persona and entitlement into one enum is BANNED** — it will misgate cross-persona users.
* **N5 — RLS scope stays small even with three products.** The shared permit / parcel / forecast tables are read-only public municipal data — gate access to them at the app/API layer by entitlement, NOT via RLS policies. Reserve RLS (or the existing app-layer guard per Spec 33/35) for per-user private rows: watchlists, saved views, drafts. Product access is a feature gate, not row security. This keeps the RLS-vs-app-layer decision (Spec 113 D1 / Spec 114) unchanged by the multi-product structure.
* **N6 — Analytics identity swap is symmetric and product-scoped.** `analytics.ts` PostHog distinctId → Supabase uid (already migration Phase 2.2) AND gains a product dimension. `Sentry.setUser({ id })` takes the same Supabase-uid swap on both sides (mobile Spec 99 §7.5, admin Spec 33 §11) in the same phase — moving PostHog while leaving Sentry on the dead Firebase uid is a defect. Pre-launch there is no identity continuity to preserve, so no aliasing is required — change both together.
* **N7 — Push is unaffected and already resolved (migration O2 / G6).** Push is 100% Expo Push end-to-end (`pushTokens.ts` → `getExpoPushTokenAsync` → `/api/notifications/register`; dispatch via `scripts/lib/push-dispatch.js`). Both apps register through the same Expo path — no per-app push provider. The Firebase/GCP project is retained as the FCM Android transport underneath Expo push (keep `google-services.json` + Gradle wiring + FCM manifest metadata even after `@react-native-firebase/*` is removed; confirm the FCM v1 service-account credential is present in EAS). **Do not decommission the Firebase project** as part of "replace the Google stack."

## 5. Open decisions (recommended defaults — override to change)

| ID | Decision | Recommended default | Reversible? | Notes |
|---|---|---|---|---|
| OD1 | Phone / OTP sign-in at launch | **DEFER** | Config-reversible | Deletes the SMS-provider dependency (Twilio/MessageBird/Vonage) and per-message cost; avoids A2P 10DLC / toll-free carrier registration lead time. Email + Google + Apple remain a complete surface. Override if the beta cohort skews SMS-first sole-operator trades. Spec 93 keeps the phone-OTP flow in code, gated off. *(= migration plan D15.)* |
| OD2 | Lot-opt packaging | **SEPARATE app (App B)** | — | Resolved by the audience answer: distinct market, cold App Store acquisition channel, distinct product identity, consumer obligations that should not touch the B2B app. Supersedes the earlier "possibly a module" framing. |
| OD3 | Billing SKU shape | **RULED 2026-07-18 (operator): independent per-product subscriptions** | Layerable | One Stripe Price per product; webhook fan-out = price → product → upsert entitlement. Bundles/discounted tiers layerable later without table change. |
| OD4 | Lot-opt monetization | **OPEN — App-B-internal, LATER** | — | The homebuyer is B2C: likely per-lookup / freemium / low consumer subscription, distinct from the developer/agent pro tier. Potentially two motions inside App B. Lives entirely within App B; does not touch App A or the shared foundation. Defer until App B is built. |
| OD5 | Product key for the SHIPPED Spec 100 Parcel Cost Tool (Ground-truth 2026-07-18: App A already carries a third gated surface — `parcel-tool` tab + `parcels/lookup` route on the global subscription flag; §1's two-product framing missed it) | **Fold into `lead_gen`** at N2 cutover (zero access change; re-mappable to its own product or toward App B later — the entitlements shape makes re-mapping a data change, not a schema change) | Data-reversible | Decide-by: Phase 1.3. Override if the parcel tool should gate separately from day one. |

## 6. Out of scope / does not block

* This decision does not block the migration critical path. The migration's job is to get identity + entitlement + the database onto Supabase with the per-product entitlement shape in place (§4).
* App B does not need to exist for the migration. Only the shared foundation must be app-count-agnostic. App B is built against that foundation whenever lot-optimization is ready — launch-aligned or after.
* No codebase fork is required now. Monorepo shared-library extraction is a later, additive step, not a migration prerequisite.

## 7. The single must-not-forget

**Entitlement and identity are cross-app from day one.** Spec 113's `auth.users` and the `entitlements` table serve BOTH apps. Nothing in the schema or the auth rewrite may bake in a single-app assumption that a second front door would later have to unwind. Getting this right now costs one added dimension on two tables; getting it wrong turns every future packaging decision into a migration.
</behavior>

<constraints>
## Operating Boundaries

### Target Files
- None directly — this is an architecture-decision spec. Its §4 constraints bind work performed under: the Spec 13/93 auth rewrites, the migration plan's Phase 1.3/1.4 migrations (`entitlements` table, `profiles`), the Spec 96 gate rewrite, `analytics.ts`, and the Stripe webhook fan-out (`src/app/api/webhooks/stripe/`).

### Out-of-Scope Files
- App B itself (does not exist; built later against the shared foundation).
- Pipeline scripts / enrichment logic (`scripts/`) — read-surfaces only; no pipeline change follows from this spec.
- Spec 114 RLS policies — explicitly unchanged by N5.

### Cross-Spec Dependencies
- **Constrains:** Spec 13 + Spec 93 (N1), Spec 96 rewrite (N2/N3), Spec 99 §7.5 + Spec 33 §11 (N6), migration program plan Phases 1–2 (`.cursor/active_task.md`).
- **Relies on:** Spec 113 (identity/infra substrate), Spec 114 (per-user-row RLS posture), migration G6/O2 findings (N7).
</constraints>
