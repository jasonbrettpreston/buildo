# The best-in-class MaxBLD admin, under the Spec 126 descriptor approach

**Date:** 2026-09-15 · **Domain:** Admin (report only — no `src/` change) · **Branch:** `wf2/deep-scrapes-restore-l0`
**Feeds:** Specs 126–128 (authored concurrently by another agent — this report touches no spec file)
**Inputs measured, not trusted:** `docs/reports/2026-09-15-spec126-surface-unit-and-schema-model.md` (the census), `docs/reports/2026-09-15-spec125-mobile-parcel-cost-tool-gap-analysis.md`, `docs/specs/02-web-admin/125_schema_driven_ui_engine.md` §7, `docs/specs/02-web-admin/26_admin_dashboard.md`, `docs/specs/00-architecture/116_multi_product_architecture.md`, `docs/specs/00-architecture/117_maxbld_brand.md`, `docs/specs/01-pipeline/122_pipeline_step_optimization.md` §1.8, the live `src/app/admin/**`, `src/components/admin/**`, `src/features/admin-*/**`, `src/lib/admin/**`, `src/lib/auth/route-guard.ts`, `migrations/226|227|230|231`.

---

## 0. One-paragraph answer

The admin is **not a product**; it is the **fifth projection of the same descriptor set** — and the one projection that is allowed to render the *descriptor itself* rather than only its output. Everything the operator asked for under "Unified Admin Operations" (Spec 125 §7) already has a working precedent in this repo at pipeline altitude: a generated, committed, drift-locked card (`logic-variable-groups.json` → `GlobalConfigCard.tsx`), a generated concern index (`docs/reports/generated/122-concern-homes.md`), a generated programme backlog with a *mechanical* evidence resolver, 496 externalised tunables in `logic_variables`, and an audit-row-derived verdict cascade. The admin's job is to stop being 4,322 lines of hand-built components and become **~6 generated pages plus a small set of hand-built operator consoles**. The measured case for that is blunt: **9 of the 15 admin routes that mutate state write no `admin_audit_log` row** — including the one that rewrites all four global-tunable tables — the app's only reaper runs only when a human loads `/admin` stats, and the admin's single biggest page family duplicates a consumer resolver (`src/lib/admin/parcel-lookup.ts` 326L vs `src/lib/parcels/consumer-lookup.ts` 159L). The pilot admin surface should be **`/admin/surfaces` — the surface registry — because it is 100% generated from descriptors and therefore fails loudly if the engine is wrong**, and it is the page on which the census's headline finding (`/api/leads/view`, a live metered route with zero callers) would have been a red row on day one instead of a months-long silence.

---

## 1. The admin surface catalogue as descriptors

### 1.0 Role vocabulary used in the tables below

Measured today: **three** route classes (`public | authenticated | admin`, `route-guard.ts:4`) and **one** authorisation bit (`profiles.is_admin BOOLEAN`, `migrations/226_profiles_admin_bootstrap.sql:27`). `agent` and `advertiser` **do not exist** in any table, CHECK, or enum (verified: `grep -rnE "account_type|'agent'" migrations/*.sql` returns only `suppliers.account_type` at `183_suppliers_schema.sql:15`, a different axis). They are net-new and §4 says how they land.

| Role token | Exists today? | Backing |
|---|---|---|
| `anon` | yes | Postgres/Supabase role; `PUBLIC_PATHS`/`PUBLIC_PREFIXES` |
| `user` | yes | `authenticated` role + `auth.uid()` self-row policies (`migrations/230`) |
| `agent` | **NO — new** | a realtor/agent who sends PDFs to clients; needs its own entitlement product, not a new DB role |
| `advertiser` | **NO — new** | builder/designer buying a `SponsorSlot` placement; scoped read of *their own* impressions only |
| `admin` | yes | `profiles.is_admin`, `classifyRoute` → `'admin'` for `/admin/*` and `/api/admin/*` |

### 1.1 The catalogue — 22 admin surfaces

Archetypes are the census's 9 (§2.1) + `STATIC`/`SHELL`. "Gen" = the page body is *generated* from descriptors/registries and hand-written only as a renderer.

| # | Admin surface (descriptor id) | Archetype | Gen? | Reads | Writes | Role | Today |
|---|---|---|---|---|---|---|---|
| **A. Operations — live user pipelines** |
| 1 | `admin_pipeline_dashboard` | DASHBOARD | no | `pipeline_runs`, `pipeline_schedules`, +18 tables via `/api/admin/stats` | — | admin | **exists** `src/app/admin/page.tsx` (165L, a links hub) + `src/components/DataQualityDashboard.tsx` |
| 2 | `admin_step_output` | REPORT | partial | `pg_class`/`pg_namespace` introspection + each step's declared write | — | admin | **exists** `src/app/admin/pipeline/step-output/page.tsx` + `StepOutputInspector.tsx` (190L) |
| 3 | `admin_data_quality` | DASHBOARD | no | `data_quality_snapshots`, `/api/quality` (11 curated tables) | — | admin | **exists** `src/app/admin/data-quality/page.tsx` (34L) |
| 4 | `admin_engine_health` | DASHBOARD | no | `engine_health_snapshots`, live `pg_stat_*`, 7 `engine_health_*` logic vars | — | admin | **exists** `src/app/admin/app-health/page.tsx` (234L) — the *one* page already on a single threshold source (`a8492c9b`) |
| 5 | `admin_run_ledger` | LIST | **yes** | `pipeline_runs` (incl. `records_meta`), `sync_runs` | — | admin | **NEW** — today only `FreshnessTimeline.tsx` reads `/api/admin/pipelines/history` |
| 6 | `admin_stale_run_reaper` | FORM (console) | no | `pipeline_runs` | `pipeline_runs.status` | admin | **exists but wrong shape** — `reapStaleRunningRows()` fires *only* inside `GET /api/admin/stats:189`; no page, no button, no job |
| **B. Recompute triggers** |
| 7 | `admin_recompute_console` | FORM | partial | `scripts/manifest.json` chains/steps, `pipeline_schedules` | GitHub `workflow_dispatch`; `pipeline_runs` | admin | **exists, fragmented** — `/api/admin/pipelines/[slug]` (POST/DELETE), `/api/admin/sync`, `/api/admin/control-panel/resync`, `/api/quality/refresh`; only `resync` has a UI caller (`useTriggerPipeline.ts`) |
| 8 | `admin_global_config` | FORM | **yes (precedent)** | `logic_variables` (496), `trade_configurations`, `trade_sqft_rates`, `scope_intensity_matrix` | all four | admin | **exists** `src/app/admin/control-panel/page.tsx` (51L) + `GlobalConfigCard.tsx` reading generated `logic-variable-groups.json` — **the canonical precedent** |
| **C. Usage metrics & entitlements** |
| 9 | `admin_usage_funnel` | DASHBOARD | partial | `usage_events` (**new**), `lead_view_events`, `notification_dispatches` | — | admin | **partly exists** `src/app/admin/market-metrics/page.tsx` (462L) + `src/lib/admin/funnel.ts` — but meters nothing a user does in the parcel tool |
| 10 | `admin_entitlements` | LIST + DETAIL | **yes** | `entitlements` (PK `user_id,product`), `stripe_webhook_events` | `entitlements` via reconcile only | admin | **partly exists** `admin/users/[uid]` + `SubscriptionOps.tsx`; no product-axis view |
| 11 | `admin_user_detail` | DETAIL | no | `user_profiles`, `profiles`, `entitlements`, `admin_audit_log` | `user_profiles`, `entitlements` | admin | **exists** `src/app/admin/users/[uid]/page.tsx` (231L) — the *only* page whose mutations are fully audited (9 audit hits) |
| 12 | `admin_user_list` | LIST | no | `user_profiles`, `entitlements` | — | admin | **exists** `src/app/admin/users/page.tsx` (262L) |
| **D. Advertiser layer** |
| 13 | `admin_advertiser_accounts` | LIST + DETAIL | **yes** | `advertisers` (**new**) | `advertisers` | admin | **NEW** — no `advertisers`/`offers`/`ad_slots` table exists (verified by `grep` over `migrations/`) |
| 14 | `admin_placements` | FORM | **yes** | `placements` (**new**), the closed `placement` enum from the SLOT archetype | `placements` | admin | **NEW** — `SponsorSlot.tsx` (21L) returns `null` on both branches today |
| 15 | `advertiser_self_metrics` | DASHBOARD | **yes** | `usage_events` filtered `event IN (offer_impression, offer_click)` AND own `advertiser_id` | — | **advertiser** | **NEW** — the first non-admin role ever admitted to an admin-shaped surface; RLS-scoped, not `is_admin`-gated |
| **E. Export / PDF** |
| 16 | `admin_export_audit` | LIST | **yes** | `usage_events` where `event='pdf_send'`, `exports` (**new**) | — | admin | **NEW** — `src/lib/export/pdf.ts` is a self-declared stub with no caller; `expo-sharing` declared and never imported |
| **F. Descriptor-native surfaces — the generated core** |
| 17 | `admin_surface_registry` | LIST | **yes — 100%** | SURFACE + CONTRACT + JOB descriptors, `usage_events` (7-day counts) | — | admin | **NEW — recommended pilot** (§5) |
| 18 | `admin_contract_fanout` | REPORT | **yes — 100%** | CONTRACT `consumers[]` × SURFACE `inputs.contract_ref[]` | — | admin | **NEW** — this is the census §3.4(1) graph; renders the `/api/user-profile` 11-surface / 2-idiom fan-out |
| 19 | `admin_orphan_panel` | LIST | **yes — 100%** | same join, inverted | — | admin | **NEW** — the 17 zero-call-site contracts + 13 no-contract surfaces; `/api/leads/view` is row 1 |
| 20 | `admin_drift_status` | DASHBOARD | **yes — 100%** | checker verdicts: `surface-validate`, `contracts.infra.test.ts`, `system-map.infra.test.ts`, `check-spec99-matrix.mjs`, golden freshness | — | admin | **NEW** — every checker exists; none has a reader |
| 21 | `admin_role_matrix` | REPORT | **yes — 100%** | `seeds/roles.json` (**new**) × `pg_policies` × `classifyRoute` re-execution | — | admin | **NEW** (§4) |
| 22 | `admin_ledger_visualiser` | REPORT | **yes — 100%** | `pipeline_runs` + descriptor `inputs.reads.steps[].version_pin` + `app_outputs` seam + `usage_events` | — | admin | **NEW** — Spec 125 §4's React Flow graph, scoped per §3.4 |

**Counts.** 22 surfaces: **11 exist today** (15 `page.tsx` under `src/app/admin/`, of which 4 collapse into the rows above and 1 — `admin/lead-feed/flight-center` — is a 13-line `permanentRedirect`), **11 are new**, and **11 of the 22 are 100%-or-mostly generated**. The lead-feed family (`admin/lead-feed`, `admin/lead-feed/inspector`, `admin/flight-center`, `admin/notifications`, `admin/security`) is deliberately *not* in this catalogue: it is Spec 36/91 lead-gen product admin, it is the bulk of the 4,322 hand-built lines, and it is the **last** thing to convert, not the first.

---

## 2. What "best in class" means here — 11 principles, each grounded

Each principle names a precedent that already ships in **this repo** (preferred) or a named industry pattern, and the measured anti-pattern it retires.

| # | Principle | Grounding precedent | Measured anti-pattern it retires |
|---|---|---|---|
| **P1** | **The admin is a projection, not a product.** An admin page is the same SURFACE/CONTRACT descriptor rendered with `render.audience: "admin"` — never a parallel data path. | Census §1.2c: `/api/parcels/lookup` already has a "near-superset admin twin" at `/api/admin/parcels/lookup`. One contract, N projections is the property the whole model rests on. | `src/lib/admin/parcel-lookup.ts` **326L** vs `src/lib/parcels/consumer-lookup.ts` **159L** — two resolvers over the same parcel, diverging independently. The admin twin is 2.1× the consumer's size for the *same subject*. |
| **P2** | **No admin-only business logic.** If the admin computes it, the product can too, and it belongs in the shared lib. The admin may *reveal* more fields; it may not *derive* differently. | Spec 122's whole thesis: "the compute is the only thing anyone writes twice" (§1.0). The pipeline enforces this with `step.schema.json`'s `outputs` category. | `src/lib/admin/funnel.ts:154-158` hardcodes five SLA thresholds (`48 / 8760 / 2160 / 744 / 192` hours) and `:166` an eight-slug `LOADER_SLUGS` literal — admin-only policy, invisible to the pipeline that produces the rows it judges. |
| **P3** | **Every admin mutation writes exactly one ledger row.** No exceptions, audit-failure fails the request. | `src/lib/admin/admin-audit.ts` already does this correctly: centralised `redactPii` (PII-FACT convention — records *that* a PII field changed, never the value), `scrubAdminAuditForTarget` for right-to-be-forgotten (migration 217), and a header that states outright *"an unaudited admin mutation is a compliance hole"*. | **Measured: 9 of the 15 admin routes exporting a mutating method write no audit row.** Unaudited: `control-panel/configs` **PUT** (rewrites `logic_variables` + 3 more tables — the global tunables), `pipelines/[slug]` POST/DELETE, `pipelines/schedules` PUT/PATCH, `sync` POST, `control-panel/resync` POST (dispatches a GitHub workflow), `leads/watchlist` POST/DELETE, `rules` POST/PATCH, `builders` POST, `notifications/test-send` POST. Audited: `users`, `users/[uid]`, both `subscription/*` ops, both `security/mfa` routes. |
| **P4** | **All tunables are data; zero thresholds in `src/`.** A number a human might argue about lives in `logic_variables` with a `description` naming its consumer. | `scripts/seeds/logic_variables.json` holds **496** variables; `a8492c9b` moved the admin engine-health page onto seven `engine_health_*` vars, Zod-bounded, with an aggregated `logWarn` on absence — the model to copy. Feedback memo: *"nothing hidden — ALL tunables externalized to admin logic vars"*. | `funnel.ts:154-158` (P2's row) and `SearchPermitsModal.tsx:34 DEBOUNCE_MS = 300` — the SEARCH archetype's census entry makes `config.debounce_ms` a *required declaration*, which turns this constant into a descriptor field. |
| **P5** | **Generated pages over hand-built ones, and the generator is locked by a RED canary.** A generated artifact is committed, imported, and `npm run verify` fails if stale. | `scripts/generate-logic-variable-groups.mjs` → `src/features/admin-controls/generated/logic-variable-groups.json` → imported at `GlobalConfigCard.tsx:20` → locked by `src/tests/logic-variable-groups.infra.test.ts` including a **tampered-file RED canary**. This is the exact mechanism, already shipping. | **4,322 lines across 13 files in `src/components/admin/`** — `LeadDetailInspector.tsx` 727, `CoaClassificationPanel.tsx` 586, `TestFeedTool.tsx` / `FlightCenterTool.tsx` 525 each, `ParcelCostTool.tsx` 425. `GenericFieldRenderer.tsx` (83L) is the one file that already knows the answer. |
| **P6** | **Drift is shown in-product, not only in CI.** A checker with no reader is a checker nobody acts on. | `docs/reports/generated/` holds nine generated artifacts (`122-concern-homes.md`, `122-programme-backlog.md`, `122-conversion-roadmap.md`, `122-churn-complexity.md`, …). `map-concerns.mjs` hard-fails on a concern with no home, two homes, or an orphan category — the Spec 122 §1.8 mechanism that found `emits` was nobody's home. | `mobile/scripts/check-spec99-matrix.mjs` **exists and is wired to nothing** (verified: no match in `.husky`, `.github`, either `package.json`). Nine generated reports; **zero** of them is rendered by an admin page. |
| **P7** | **Role and policy are data, checked against the live catalogue.** The matrix is a seed file; the assertion re-reads `pg_policies`, never the migration text. | `src/tests/contracts.infra.test.ts:620-631` already pins `docs/specs/_contracts.json` `schema.entitlement_products` / `entitlement_statuses` against `migrations/228`'s literal CHECK clauses *and* against `src/lib/entitlements/index.ts`'s `PRODUCTS` / `ENTITLEMENT_STATUSES`. Three sites, one vocabulary, mechanically locked. | Census §1.2c′: `/builders` and `/builders/[id]` are `authenticated` by fail-closed default while `/api/builders` is `public` via `PUBLIC_PREFIXES:71`. **The page is behind a login; the data it renders is not.** Nothing in the estate holds that join. |
| **P8** | **Orphans are a first-class rendered concept.** A contract with no surface and a surface with no contract are both red rows, not archaeology. | The census's own headline finding: `/api/leads/view` — 153L, a live atomic-CTE meter, whitelisted in `route-guard.ts:122`, **44 test cases across 9 `describe` blocks**, zero production callers, and a consequently unreachable paywall branch at `PaywallScreen.tsx:153`. Green tests, live route, months unnoticed. | Admin-side re-measurement for this report: **8 of the 29 `/api/admin/*` route files have no static caller** — `builders`, `leads/inspect/[id]`, `pipelines/runs`, `pipelines/[slug]`, `rules`, `suppliers/leads`, `sync`, plus `/api/quality/refresh`. (`leads/inspect/[id]` and `pipelines/[slug]` are template-literal calls from `useLeadInspect.ts` / the trigger hook; the other six are genuinely uncalled.) |
| **P9** | **Deep links by id, and a command palette over the registry.** Every descriptor has a stable id; every admin row links to `/admin/<kind>/<id>`; one palette searches ids across surfaces, contracts, jobs, steps, users and parcels. | Industry: Stripe Dashboard / Retool / Linear's ⌘K. Repo-side, the id vocabulary already exists — `scripts/manifest.json` step ids, `logic_variables` keys, `chk_entitlements_product`'s closed product list. | Today `src/app/admin/page.tsx` (165L) is a **hand-maintained hub of `<Link>`s that calls no API of its own** (census §2.1). A new admin page is invisible until someone edits that file — the same failure class as the four stale `schedule:` workflow headers. |
| **P10** | **Time-travel is the ledger, not a snapshot table.** "What did this look like on date D" is answered by replaying `pipeline_runs` + `usage_events` + `admin_audit_log`, all of which are append-only with PK-as-dedup. | Census §3.3: the `usage_events` design makes **the counter derived** (`COUNT(*)` over a `period` bucket) precisely because the denormalised `user_profiles.lead_views_count` drifted. Same lesson as `logic_variables`-as-source-of-truth. | `user_profiles.lead_views_count` — a denormalised counter that *never moves*, because its only writer has no caller. One table's PK would have made the drift impossible. |
| **P11** | **Architecture boundaries are enforced mechanically, not by review.** An admin component may not query Supabase directly or bypass the registry. | Spec 125 §0 item 8 maps `eslint-plugin-boundaries` 1:1 onto "the existing ESLint gates in the hook" — `.husky/pre-commit` already runs `npm run lint` with `no-empty` and a `process.exit()` ban in `src/` (CLAUDE.md PD #5). Adding a boundaries rule is a config line on a gate that already fires. | `src/components/DataQualityDashboard.tsx` fetches **four** different admin contracts (`/api/quality`, `/api/admin/stats`, `/api/admin/pipelines/status`, `/api/admin/pipelines/schedules`) from one component — a tile grid with no per-tile `degrade_independently`, which the DASHBOARD archetype makes a required declaration. |

### 2.1 The anti-pattern ledger, consolidated (all measured in this tree)

| Anti-pattern | Measurement | Where |
|---|---|---|
| Unaudited admin mutations | **9 of 15** mutating admin routes write no `admin_audit_log` row | §2 P3 |
| Hand-built admin components | **4,322 lines / 13 files**; largest 727L | `src/components/admin/` |
| Duplicated compute | admin parcel resolver 326L vs consumer 159L, same subject | `src/lib/admin/parcel-lookup.ts` |
| Hardcoded thresholds | 5 SLA constants + an 8-slug literal list in one file | `src/lib/admin/funnel.ts:154-166` |
| Reaper needs a human page load | `reapStaleRunningRows()` called from exactly one site: `GET /api/admin/stats:189` | `src/lib/admin/reap-stale-runs.ts` |
| Orphaned admin contracts | **8 of 29** `/api/admin/*` routes with no static caller | §2 P8 |
| Checker with no reader | `check-spec99-matrix.mjs` wired to nothing; 9 generated reports, 0 rendered | §2 P6 |
| Hand-maintained nav | `src/app/admin/page.tsx` 165L of literal `<Link>`s | §2 P9 |
| Admin/product auth mismatch | `/builders` gated, `/api/builders` public | census §1.2c′ |
| A surface that renders nothing | 13L `permanentRedirect` counted as a page | `admin/lead-feed/flight-center/page.tsx` |

---

## 3. The admin's observability contract

### 3.1 Tables and registries the admin must render **unmodified**

"Unmodified" = the admin reads the row as written and renders it; it adds no derived column the producer did not declare. This is the pipeline's own rule (`records_meta` producer/consumer contracts, Spec 48 §3.6/§3.7) applied to the UI estate.

| Artifact | Kind | Status | Rendered by |
|---|---|---|---|
| `pipeline_runs` (incl. `records_meta`) | ledger | exists | 1, 5, 22 |
| `admin_audit_log` | ledger | exists, **under-written** | 11, 16 |
| `usage_events` | ledger | **new** (census §3.3) | 9, 15, 16, 17 |
| `notification_dispatches` | ledger | exists | 9 |
| `lead_view_events` | ledger | exists, **dead** — adjudicate first | 9 |
| `entitlements` | registry | exists (PK `user_id,product`) | 10, 11 |
| `logic_variables` (496 rows) | registry | exists | 4, 8 |
| `engine_health_snapshots`, `data_quality_snapshots` | ledger | exists | 3, 4 |
| `stripe_webhook_events` | ledger (replay guard) | exists | 10 |
| SURFACE / CONTRACT / JOB descriptors | registry | **new** | 17–22 |
| `seeds/roles.json`, `seeds/usage-events.json`, `seeds/entitlements.json` | registry | **new** | 20, 21 |
| `advertisers`, `placements`, `exports`, `app_outputs` | registry/ledger | **all new** (verified absent from `migrations/`) | 13, 14, 16, 22 |

### 3.2 "Visualise everything", scoped to four things

The census (§3.4 item 4) **deferred** the React Flow pipeline node-graph on the grounds that `react-flow` is in neither `package.json` and `npm run lineage-docs` already emits the dependency data as text. That judgement is correct for the *pipeline step graph* and **wrong for the cross-surface graph**, because no text artifact renders the surface↔contract↔table join at all. The split:

| Visualisation | Verdict | Why |
|---|---|---|
| **Contract fan-out graph** (surfaces × contracts, edge labelled with the *idiom*) | **BUILD** | The measured 11-surface / 2-idiom `/api/user-profile` fan-out is invisible today; a bypassed canonical mutation hook (`usePatchProfile`, with rollback) vs a raw `fetchWithAuth` is exactly what an edge label makes visible. |
| **Orphan panel** (17 contracts × 13 surfaces, same join inverted) | **BUILD** | Same query, no new dependency. Would have surfaced `/api/leads/view` on day one. |
| **Pipeline ↔ `app_outputs` seam** (which step last wrote the row this surface renders, with `version_pin`) | **BUILD** | This is the one genuinely new join: it connects Spec 122's 27 governed steps to the 53 surfaces. Data already exists (`pipeline_runs` + descriptor `inputs.reads.steps[].version_pin`, per Spec 125 §0 item 6). |
| **Usage funnel** (`usage_events` → impression → click → view → pdf_send, by product and period) | **BUILD** | Replaces `funnel.ts`'s hand-rolled SLA logic with a `COUNT(*)` over a closed `event` vocabulary. |
| **React Flow node-graph of the 27 pipeline steps** | **DEFER** (census §3.4 item 4 stands) | `lineage-docs` already renders it as text; a new dependency for a redundant picture. |

**Dependency ruling.** The three graphs that *are* worth building are DAGs of ≤ 120 nodes with no layout interaction beyond pan/zoom. Recommend **inline SVG + a layered layout computed server-side** (the layer assignment is already the descriptor's dependency order) rather than adopting `react-flow`. If the operator prefers the library, it is one dependency serving four pages, which is defensible — but it is a decision, and it should be written down (Q6).

### 3.3 The smallest generated-page engine that yields all of this

Deliberately small. The generator is **not** a UI framework; it is a JSON emitter plus four renderers.

```
scripts/surfaces/generate-registry.mjs      # walks surfaces/**/*.descriptor.json + contracts/** + jobs/**
  → src/features/admin-registry/generated/registry.json          # the join, committed
  → src/features/admin-registry/generated/graph.json             # nodes + edges + layer assignment
  → src/features/admin-registry/generated/role-matrix.json       # §4
src/tests/admin-registry.infra.test.ts       # staleness lock + tampered-file RED canary
src/features/admin-registry/components/      # FOUR renderers, one per archetype:
  RegistryTable.tsx   (LIST)     RegistryDetail.tsx (DETAIL/REPORT)
  RegistryGraph.tsx   (SVG DAG)  RegistryMatrix.tsx (grid)
src/app/admin/(registry)/[kind]/page.tsx     # one dynamic route serves surfaces 17–22
```

**Budget and kill criterion.** The generator + four renderers + the lock should land under **~900 lines total** and must *delete* more than it adds by the end of phase 3 (the four renderers replace `HealthTile.tsx` 101L, `GenericFieldRenderer.tsx` 83L, `StepOutputInspector.tsx` 190L and the hand-written `admin/page.tsx` 165L = 539L on their own). **If the engine exceeds ~900 lines while rendering fewer than four of the six generated pages, the archetype profile design is wrong** — the same kill criterion the census set for the pilot descriptor at 250 lines (§4.1).

Two things the engine does **not** do: it does not generate migrations (census Q2 — `npm run db:generate` is `drizzle-kit introspect`, the arrow already runs DB→TS), and it does not generate the operator consoles (surfaces 6, 7, 8, 11 stay hand-built; a console with a destructive button deserves a human-authored confirmation path).

---

## 4. The RLS role matrix as descriptor data

### 4.1 Current state, measured

| Migration | What it did | Shape |
|---|---|---|
| `226_profiles_admin_bootstrap.sql` | `profiles(id, is_admin)` + `profiles_select_own` / `profiles_update_own` + a trigger `prevent_is_admin_self_escalation` that raises unless `request.jwt.claims->>'role' = 'service_role'` (`:68-83`) | Class C |
| `227_rls_class_b_default_deny.sql` | `ENABLE ROW LEVEL SECURITY` with **zero policies** on ~50 reference/pipeline tables (parcels, permits, `logic_variables`, `pipeline_runs`, …) — default-deny, reached only by service-role | Class B |
| `230_rls_class_a_entitlements.sql` | 11 user-owned tables enabled + `*_select_own` / `*_insert_own` / `*_update_own` policies keyed on `auth.uid() = user_id` | Class A |
| `231_admin_backup_codes.sql` | MFA backup codes | Class A |

Migration 226's own comment records the known gap: the trigger is bypassable by the table owner, and the proper fix — *"a dedicated non-owner elevated role with `REVOKE UPDATE(is_admin) FROM app_role`"* — is filed as post-launch **D5**. That is the hinge on which `agent`/`advertiser` turn.

### 4.2 The matrix as a seed file

`scripts/seeds/roles.json` — one closed list, the `logic_variables.json` model, mirrored into `docs/specs/_contracts.json` under `schema.roles` and grep-pinned exactly as `entitlement_products` already is (`contracts.infra.test.ts:620`).

```jsonc
{
  "roles": ["anon", "user", "agent", "advertiser", "admin"],
  "classes": {
    "A": { "rule": "auth.uid() = user_id",              "policies": "generated per table × per verb" },
    "B": { "rule": "default-deny, service-role only",    "policies": "none — RLS enabled, zero CREATE POLICY" },
    "C": { "rule": "self-read / self-update-minus-flag", "policies": "hand-written, trigger-guarded" },
    "D": { "rule": "owner-scoped by a non-user key",     "policies": "generated — NEW, advertiser only" }
  },
  "tables": {
    "usage_events":  { "class": "A", "owner_col": "user_id",
                       "grants": { "user": ["select"], "agent": ["select"], "admin": ["select"], "advertiser": "via class D view" } },
    "placements":    { "class": "D", "owner_col": "advertiser_id",
                       "grants": { "advertiser": ["select"], "admin": ["select","insert","update","delete"] } },
    "advertisers":   { "class": "D", "owner_col": "id",
                       "grants": { "advertiser": ["select"], "admin": ["select","insert","update"] } },
    "logic_variables": { "class": "B", "grants": { "admin": "service-role via /api/admin only" } }
  }
}
```

Two rulings this forces, both cheap and both better made now:

- **`agent` is an entitlement product, not a DB role.** An agent is a `user` holding the `agent_reports` product in `entitlements`. It needs **zero** new policies — it needs one widened `chk_entitlements_product` CHECK, one `stripe_price_product_map` entry, and one string in `_contracts.json`. That is the same three-site change the census costed for `parcel_tool` (§3.3), and all three sites are already mechanically locked.
- **`advertiser` IS a new role, and it is class D.** It is the first principal scoped by a key that is *not* `auth.uid()` (`advertiser_id` via a membership row). It gets a Postgres role, a `GRANT`, and generated `USING (advertiser_id = current_advertiser_id())` policies — and it is the reason class D has to exist at all.

### 4.3 Policy generation flow

```
seeds/roles.json  ──generate──▶  migrations/NNN_rls_<scope>.sql   (emitted, hand-REVIEWED, hand-committed)
        │                                    │
        │                                    ▼
        │                        scripts/migrate.js  (filename-keyed, unchanged)
        │                                    │
        ├──generate──▶ role-matrix.json ─────┼────▶ /admin/roles  (surface 21)
        │                                    ▼
        └──assert───▶ src/tests/db/rls-matrix.db.test.ts
                       reads LIVE pg_policies + pg_roles (never the migration text)
                       + re-executes classifyRoute() over all 61 route paths
                       + FAILS on: a table with RLS enabled and no declared class
                                   a policy live but not in the seed
                                   a seed row with no live policy
                                   surface.guards.session ≠ contract.guards.auth_class   ← census Q15
```

**Critical constraint, stated because it is the easy mistake:** this generator **emits a migration file for human review; it does not apply one.** Census Q2 ruled migrations stay hand-written and `migrate.js` stays filename-keyed; the generator writes a `.sql` into `migrations/` as a *draft*, and `validate-migrations.sh` / `check-migration-down-comments.sh` still gate it. The *assertion* runs against live `pg_policies` under `npm run test:db`, which is the direction that cannot rot. And the check that earns its keep on day one is the last line: the live `/builders` vs `/api/builders` mismatch (§2 P7) becomes a FAIL row rather than a reviewer's memory.

---

## 5. Build sequence — the admin inside the 126 phases

Mapped onto the census §6 nine-step sequence; admin work is **parallelisable onto the Admin/Cross-Domain slot** because nothing here touches `scripts/` (census Q11), so it cannot collide with the pipeline programme's active-task slot.

| Phase | Step | WF | Gated on | Deliverable |
|---|---|---|---|---|
| **0** | Close the 9 unaudited admin mutations — one `writeAdminAudit` call each, audit-failure fails the request | WF3 ×1 (one finding, nine sites) | **nothing — do now** | `admin_audit_log` covers 15/15; a lock asserting *every* `/api/admin/**` mutating export writes a row |
| **0b** | Wire `check-spec99-matrix.mjs` into `mobile-ci.yml`; fix the four stale `schedule:` headers | WF3 | none | census §6 step 3, unchanged |
| **1** | **Spec 126 lands**: SURFACE/CONTRACT/JOB schemas + archetype profiles + the checker set | WF1 (not this agent's) | census Q1–Q4 | schema + validator, no converted surface |
| **2** | **PILOT: `admin_surface_registry` → `/admin/surfaces`** (surface 17) | WF2 | phase 1 + the product pilot's descriptor existing | the generator, `registry.json`, `RegistryTable.tsx`, the staleness lock + RED canary |
| **3** | Surfaces 18–21 on the same engine (fan-out, orphans, drift, role matrix) | WF2 | phase 2 | four pages, ~zero new engine code — this is the phase that proves P5 |
| **4** | `seeds/roles.json` + class D + the generated-policy flow + `rls-matrix.db.test.ts` | WF1→WF2 | phase 3 (needs the matrix renderer) | `agent` as entitlement; `advertiser` as role |
| **5** | `usage_events` + the live meter + `admin_usage_funnel` rebuilt on it; retire `funnel.ts`'s hardcoded SLAs into `logic_variables` | WF2 | census Q5/Q6/step 2's adjudication of the dead meter | the estate's **first working meter** |
| **6** | Advertiser layer (13–15) + export audit (16) | WF1 (product spec) → WF2 | phase 5 | `advertisers`/`placements`/`exports`; `SponsorSlot` stops returning `null` on both branches |
| **7** | `admin_ledger_visualiser` (22) + the pipeline↔`app_outputs` seam | WF2 | phases 3, 5 + `app_outputs` existing | the cross-surface graph |
| **8** | Convert the lead-feed family; delete what the engine replaced | WF2 ×N | phases 2–3 | the 4,322-line number goes down, measured per commit |

### 5.1 Why the pilot is `/admin/surfaces` and not a lead-feed page

1. **It is 100% generated, so it cannot be faked.** Every other candidate can be shipped by hand and still look right. If the descriptor set is incomplete or the archetype profiles are wrong, this page is visibly empty or visibly wrong on commit 1. That is the *point* of a pilot — the pipeline programme picked `assert_schema` as pilot 1 for exactly this reason (the archetype that forces `outputs`/`recovery`/`counters` to `"none"`).
2. **It is read-only, writes nothing, touches no migration.** Same risk profile the census used to pick `parcel_detail` (§4.1): zero writes, zero Layer-3 store, zero pipeline change.
3. **It has a real defect to close on day one** — the orphan panel renders `/api/leads/view` and the eight orphaned admin routes as red rows. A pilot that finds nothing proves nothing.
4. **It is the precedent's direct descendant.** `logic-variable-groups.json` → `GlobalConfigCard.tsx` is generate → commit → import → lock. `/admin/surfaces` is the same four steps with a bigger JSON, so the review panel is arguing about content, not mechanism.
5. **It is the admin's own nav.** Once it exists, `src/app/admin/page.tsx`'s 165 hand-maintained lines become a query over the registry, which retires P9's anti-pattern as a side effect.

### 5.2 What the admin needs from the product pilot (`parcel_detail` / property preview) to close the loop

The census pilot must emit **five things** the admin registry cannot synthesise, and they should be treated as acceptance criteria on the product pilot rather than admin follow-ups:

| # | What the admin needs | Why the registry can't invent it | Renders on |
|---|---|---|---|
| 1 | A committed `surfaces/parcel_detail.surface.json` with a real `archetype: REPORT` and a real `inputs.contract_ref` | It is the first row. A registry with zero rows proves nothing. | 17 |
| 2 | `contracts/parcels_lookup.contract.json` with a populated **`consumers[]`** (3 known: mobile search, mobile detail, `admin/parcel-cost`) | The fan-out graph's edges *are* `consumers[]`. Without it there is no graph. | 18, 19 |
| 3 | `guards.entitlement: "parcel_tool"` + `metering: { event: "property_view", subject_kind: "parcel_ref" }` | The usage column and the entitlement column are joins onto declared values; a `"none"` here leaves both blank. | 17, 9, 10 |
| 4 | `render.targets: ["screen","pdf"]` + a golden capture of the screen projection | The PDF parity check (Spec 125 §7's *"100% data parity"*) is a golden equality, and the screen side of the pair must exist first. | 16 |
| 5 | A `checks[]` entry asserting `surface.guards.session` matches `contract.guards.auth_class` | This is census Q15 at `severity: FAIL`; the drift page renders its verdict, but the check must be declared on a real surface to have a verdict at all. | 20 |

Conversely the admin owes the product pilot exactly one thing: **surface 3 in the admin catalogue — `admin/parcel-cost` (`ParcelCostTool.tsx`, 425L) — is the product pilot's third projection.** It is the fastest available refutation of "one contract, N projections": if the admin tool cannot be re-expressed as `render.audience: "admin"` over the same contract with a wider `field_whitelist`, the model is wrong, and we learn it for 425 lines instead of for 4,322.

---

## 6. Open asks, with recommended defaults

| # | Ask | Recommended default | Why | Reversible? |
|---|---|---|---|---|
| **AQ1** | Is the admin a `render.audience` **field** on the shared SURFACE descriptor, or a separate `ADMIN_*` descriptor kind? | **A field.** One descriptor, `audience: ["product","admin"]`, with a per-audience `field_whitelist`. | A separate kind re-creates the admin/consumer parcel-resolver split (326L vs 159L) in the descriptor layer itself. | Hard — it shapes the schema |
| **AQ2** | Do the 9 unaudited admin mutations get fixed **before** or **inside** the 126 work? | **Before — phase 0, one WF3.** | It is a live compliance hole (`admin-audit.ts`'s own header calls it that), it is independent of every 126 decision, and it gets more expensive once the routes are regenerated. | Yes |
| **AQ3** | `agent` — DB role or entitlement product? | **Entitlement product** (`agent_reports`). Zero new policies; three grep-locked sites. | Precedent: `parcel_tool` costs the same three sites (census §3.3). A DB role for a billing distinction is a category error. | Data-reversible |
| **AQ4** | `advertiser` — same? | **No — a real role, RLS class D**, scoped by `advertiser_id`, not `auth.uid()`. | It is the first principal that must read rows it does not own on the `user_id` axis. Class D has to exist for it. | Hard once policies ship |
| **AQ5** | Does migration 226's post-launch **D5** (`REVOKE UPDATE(is_admin) FROM app_role`) block the role matrix? | **No — but it must be a declared `OPEN` row on `/admin/roles`, not an omission.** Do D5 in phase 4. | 226's own comment records the bypass; a matrix page that renders a guarantee the DB does not enforce is worse than no page. | Yes |
| **AQ6** | `react-flow` as a dependency, or server-computed SVG? | **Server-computed inline SVG.** Four pages, ≤120 nodes, pan/zoom only. | Census §3.4 item 4 already deferred the library once; the layer assignment is in the descriptor. Revisit if a graph needs drag-to-edit. | Yes |
| **AQ7** | Web SURFACE granularity — page, or component? (census Q14, unresolved) | **Page-with-`sections[]`**, except where a component is independently routable or independently gated. | Promoting all 13 `src/components/admin/` files roughly doubles the estate. But note this report's surfaces 13–22 are *pages*, so the default holds cleanly for the new work. | Yes — promote later |
| **AQ8** | Where does the reaper live, now that "a human loads `/admin`" is a known defect? | **A JOB descriptor** (`pg_cron`, class SCHEDULED) — and under census Q7's default it reuses `step.schema.json`, so it must be decided **before C3** freezes that schema. | Stranded `running` rows wedge the B3 gates under unattended cron; memory records 19 masked for months. | Hard after C3 |
| **AQ9** | Does `/admin/surfaces` render **usage** counts before `usage_events` exists (phase 5)? | **Yes — as a declared `"not_yet_metered"` cell, never a blank or a zero.** | A zero in a usage column is indistinguishable from a dead meter. That distinction is the entire `/api/leads/view` lesson. | Yes |
| **AQ10** | `app_outputs` — does it exist as its own table, or is it the union of the enriched tables the pipeline already writes? | **Defer to Spec 127/128.** Verified absent from `migrations/`; this report assumes only that surfaces 22 and 16 read *whatever* the seam turns out to be. | Inventing it here would front-run the spec being authored concurrently. | n/a — deferred |

---

## Appendix — what was measured, and what was not

**Measured and executed in this tree (main, `wf2/deep-scrapes-restore-l0`), 2026-09-15.** The 15 `src/app/admin/**/page.tsx`; the 13 files / 4,322 lines of `src/components/admin/` (`wc -l`); the 27 modules of `src/lib/admin/`; the caller map for all 29 `/api/admin/*` route files plus `/api/quality*` (literal and template-literal grep across `src/app`, `src/components`, `src/features`, `mobile/src`, `mobile/app`); the mutating-method × `admin_audit_log` cross-tab (15 routes, 6 audited); `migrations/226|227|230|231` policy text; `scripts/seeds/logic_variables.json` (496 keys, 7 `engine_health_*`); `docs/specs/_contracts.json` `schema.entitlement_products`/`entitlement_statuses` and their three grep-pins in `contracts.infra.test.ts:620-631`; the absence of `app_outputs`, `user_usage`, `offers`, `ad_slots`, `advertisers`, `placements` from `migrations/`; `reapStaleRunningRows` call sites (one, `stats/route.ts:189`); `funnel.ts:154-166`; `generate-logic-variable-groups.mjs` → `logic-variable-groups.json` → `GlobalConfigCard.tsx:20` → `logic-variable-groups.infra.test.ts`; the nine artifacts in `docs/reports/generated/`; `122-programme-backlog.md:145` (`POST-B1-12` Step Registry = NOT_STARTED).

**Taken from the census without re-measurement** (it states its own commands and they were re-run there): the 53/61/87 counts, the 9 SURFACE archetypes, the 17 orphaned contracts, the 13 contract-less surfaces, the `/api/user-profile` fan-out, the `/api/leads/view` finding, the `/builders` auth mismatch.

**Not measured.** Whether the six genuinely-uncalled admin routes are reachable from a bookmark or an operator's `curl` (a static grep cannot see that) — each needs an explicit keep/retire ruling, and this report recommends they be adjudicated as one WF3 alongside phase 0, by a different party than the one that wrote them (Spec 124 §4.2). Runtime cost of the generated pages. Whether any lead-feed component holds business logic the product needs — phase 8's precondition, deliberately left to a Regression Guardian pass on that diff.
