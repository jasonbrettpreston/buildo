# SPEC 126 — MaxBLD Surface Standard (the surface descriptor as contract)

> **Status: DRAFT** — authored 2026-09-15 (WF1, Admin domain). Not authorized for implementation. A WF1 plan with PLAN LOCKED gates every phase below; `.cursor/wf1_spec126_128_active_task.md` is the authoring plan this spec was written under.
>
> **Placement note (measured, not chosen).** These three specs span mobile, web and admin, so `docs/specs/04-platform/` was the natural home. It is **not supported today**: `scripts/generate-system-map.mjs:24-31` defines `SECTIONS` as a hard-coded directory allow-list (`00-architecture`, `01-pipeline`, `02-web-admin`, `03-mobile`, `archive`, `reference`) and a directory absent from it is **silently dropped** from the system map — no throw, `collectSpecs` is simply never called for it. `src/tests/system-map.infra.test.ts` hard-codes the same four sub-directories at `:49`, `:300` and `:325`. Creating `04-platform/` therefore means a code change to a generator and a test that are outside this spec's Target Files. **Specs 126/127/128 land in `docs/specs/02-web-admin/` next to Spec 125, and the folder question is filed as `ASK-06` in Spec 128 §6.**
>
> ⚠️ **System-map coupling.** These specs list `src/` and `scripts/` paths in their Operating Boundaries, and `src/tests/system-map.infra.test.ts:49` asserts every such path appears in the committed system-map row for the spec. **`docs/specs/00-architecture/00_system_map.md` has been regenerated** (`node scripts/generate-system-map.mjs`) and is part of this change; re-run it whenever a boundary list changes. The map is derived, never hand-edited (PD #2).

---

## 0. What this supersedes — Spec 125 is absorbed

**Spec 125 (`docs/specs/02-web-admin/125_schema_driven_ui_engine.md`) is SUPERSEDED by this spec and should be marked so at the commit that lands 126/127/128.** Spec 125 was an operator-supplied blueprint (§1–§13 verbatim) with an orchestrator correction block (§0). It was right about the *shape* — UI as a projection of a descriptor, an archetype registry, generated types, contract tests, one engine rather than N bespoke pages — and it is the reason this programme exists. It was written before the estate was censused, so its arithmetic and several of its mechanisms are wrong against the tree.

This spec is the grounded successor. It is written against **`docs/reports/2026-09-15-spec126-surface-unit-and-schema-model.md`** (the census: 53 rendering surfaces, 61 API contracts, 87 tables, every count executed against this tree) and **`docs/reports/2026-09-15-spec125-mobile-parcel-cost-tool-gap-analysis.md`**.

### 0.1 What carried over from Spec 125

| Spec 125 idea | Where it lives now |
|---|---|
| UI as a projection; zero hard-coded business logic in a page | §5 arrow 3 · §2 (the SURFACE unit) · Spec 128 rule 2 |
| Archetype registry mapping descriptor archetypes to components | §3 (derived from the census rather than proposed) |
| Server-side heavy lifting (Next.js Server Components) | §5 arrow 3 — **true on web, false on mobile**; see §0.2 |
| Contract versioning (`schema_version` per descriptor) | §4 `identity.contract_version` + `spec_version` |
| Fail-safe fallback for an unknown archetype | §3.4 (and it is a `checks[]` entry, not only a render branch) |
| Generated end-to-end types + runtime Zod parsing | §5 arrow 2 (the highest-value arrow) |
| `eslint-plugin-boundaries`-style architecture guardrails | §9 Phase 1 — guardrails move to the FIRST phase, not the last |
| Contract testing against live descriptors | §5 arrow 6 (goldens, as a PAIR) · Spec 127 §3 gate S8 |
| Centralized telemetry on contract breaks | §7 · §10 |
| The `app_outputs` materialised projection | §6.3 — now specified: written by a converted pipeline step at the end of chain `sources` |

### 0.2 What was DROPPED from Spec 125, and why

Each row is a deliberate retirement, not an oversight. Retiring it here is the Spec 128 §4 disposition `knowingly-retired`.

| Dropped | Spec 125 site | Why |
|---|---|---|
| **"18 categories"**, everywhere | §2, §4, §5 Rule 3, §6 Phase 1, §10 | **20.** `scripts/steps/_schema/step.schema.json` `required.length` → 20 (re-measured at authoring). The "18" was already stale in Spec 122 §1.3, whose own amendment block records the correction propagating to 13 prose sites. §4's mirror is GENERATED from the schema so this cannot recur. |
| **FlutterFlow** as a mobile option | §6 Phase 3 | The mobile client is Expo / React Native (Spec 90). `mobile/package.json` carries `@supabase/supabase-js`, `expo-router`, NativeWind; there is no Flutter anything in the tree. |
| **"The database record *is* the specification"** | §6 (Spec-to-Schema Mechanics) | Git is the source; Supabase holds a **projection** (§6.4). Descriptors in a table lose AJV-before-compute validation, golden fingerprinting and diff review — three mechanisms that exist and work. `src/tests/golden-fingerprint.infra.test.ts` exists precisely because a descriptor edit after capture must force a recapture; a table row cannot participate in that. |
| **Generating migrations from descriptors** | implied by §6 Phase 1 | `npm run db:generate` is `drizzle-kit introspect` — the arrow already runs DB→TS. Reversing it collides with `scripts/migrate.js` (filename-keyed `schema_migrations`), `scripts/hooks/validate-migrations.sh` and `scripts/hooks/check-migration-down-comments.sh`. Replaced by **declare-and-assert** (§6.1). |
| **`FORM_INPUT` / `DATA_GRID`** as archetype keys | §12 Step 1 | Placeholders. The real vocabulary is derived from the census in §3 and every member is a file in this tree. |
| **`StepEngine`** as the engine's name | §3, §12 Steps 2–3 | Renamed **`SurfaceEngine`**. "Step" is the pipeline's unit (Spec 122) and is not being renamed; a second meaning for it across the admin/web/mobile trees is exactly the vocabulary collision Spec 122 V1–V6 were ruled to prevent. |
| **`/workflow/[stepId]/page.tsx`** as the single dynamic route | §6 Phase 2, §11, §12 Step 3 | There is no `workflow` concept in the product. Routes stay where they are; what changes is that each route becomes a thin archetype projection. A single dynamic route would also defeat Next.js route-segment caching and the existing `route-guard.ts` path classification. |
| **The React Flow admin node-graph** | §4 | Deferred, not adopted. `react-flow` is in neither `package.json`; the pipeline's dependency data already has a generated home (`npm run lineage-docs`). A new dependency for a picture of something already rendered as text is not a Phase-1 spend. Re-opens as `ASK-05` (Spec 128 §6). |
| **`dependency-cruiser`** code-architecture mapping | §4 | Same reason; the estate already gates architecture with ESLint + ast-grep shape rules. Not a new tool in Phase 1. |
| **§7 as part of the engine spec** | §7 | Split, per Spec 125 §0 item 7 — but *not* into three specs. Offers + PDF/EXPORT + metering are "same descriptor, different renderer/gate" and are specified together (§7 here, and the product spec that follows). Specifying them apart produces three vocabularies. |
| **`supagen`** | §3 | Not a dependency and not needed; `drizzle-kit introspect` already generates the DB types. |
| **"Treat the engine as a one-time core infrastructure build"** | §8 | Retired as a mitigation. The estate's own evidence is that a one-time build is how `/api/leads/view` became a 153-line meter with 44 green tests and zero callers. The engine is built pilot-first, with a kill criterion (§8.3). |

---

<requirements>

## 1. Goal & User Story

**Every surface in this estate is the same surface, except for its projection.**

A *surface* (a mobile screen, a web page, an admin tool, an overlay, an exported PDF) declares what it is in a machine-readable descriptor — its archetype, the contracts it reads and writes by reference, its guards and entitlements, its render states, the events it emits, the tunables it consumes — and a small archetype component set renders it. Nothing about how a surface is gated, guarded, validated, metered or observed is a per-surface invention.

**User story.** As the operator, I can open one admin page and see every surface in the product, which contract it reads, which tables that contract touches, which entitlement gates it, which render states are pinned by a golden, whether its checks pass, and how many times it was used in the last 7 days — because all of it is derived from declarations, and none of it is typed by hand.

**The measured case for it, in one line:** the estate's only usage meter (`POST /api/leads/view`, 153 lines, 44 test cases) has **no production caller**, so `user_profiles.lead_views_count` never moves and `mobile/src/components/paywall/PaywallScreen.tsx:153`'s `leadViewsCount > 0` branch is unreachable in production. No test, no spec and no code review found it, because nothing in this estate holds the join between *"a contract exists"* and *"a surface calls it"*. That join is this spec.

</requirements>

---

<architecture>

## 2. The unit set — 3 descriptor kinds + 2 registries

> 📋 **The estate itself is rendered, not described here.** Every surface, contract and job named in this spec has a row — with a plain-language purpose, its gate, its edges, the tables and columns it touches, and its 21 category answers — in the generated **surface registry**: `docs/reports/generated/127-surface-registry.md` (source of record `scripts/surfaces/_schema/surface-census.json`, drift-locked by `src/tests/surface-registry.infra.test.ts`). Spec 127 §8 says how to read it. **Read the registry to review the estate; read this spec to review the standard.**

The operator's proposed unit was **SURFACE = screen + its API contract + its tables**. The census tested it and it breaks at both ends: **13 of 29 mobile surfaces call no API route at all**, **17 of 61 contracts have no static call site anywhere**, and **one contract (`/api/user-profile`) is reached from 11 surfaces + 2 shells by two different idioms**. Folding the contract into the screen destroys the one property that makes MAX-SERVER-SIDE possible: *one contract, N projections*.

| # | Unit | What it declares | Measured today | Schema artifact |
|---|---|---|---:|---|
| **1** | **SURFACE** | one thing that renders — archetype · `platforms[]` · the contracts it reads/writes **by reference** · states · guards · emitted events | **53** rendering surfaces (19 mobile screens + 10 mobile overlays + 24 web pages — the 13-line redirect page counted once among them, as STATIC) **+ 6** navigation shells = **59** descriptors | `surfaces/_schema/surface.schema.json`, archetype-gated |
| **2** | **CONTRACT** | one API route — request · response projection · **tables** · auth class · rate buckets · consumers | **61** route files / 80 method handlers | `contracts/_schema/contract.schema.json` |
| **3** | **JOB** | server work with no screen and no request — schedule · target · idempotency · ledger rows | **6** non-pipeline, all archetype `SCHEDULED` (4 `pg_cron` + `pipeline-watchdog.yml` + `mutation.yml`); `chain-wsib.yml` has no `schedule:` block and is not a JOB | `jobs/_schema/job.schema.json` — **its own schema; R-14** |
| **4** | *registry* **ENTITLEMENT** | the closed product vocabulary · per-product statuses · gate sites | **2** products today (`lead_gen`, `flight_center`) → **4** after a single CHECK widening that adds **`parcel_tool`** (R-01) **and `agent_reports`** (R-09) in the same statement | `seeds/entitlements.json`, mirrored into `docs/specs/_contracts.json` |
| **5** | *registry* **LEDGER** | the closed event vocabulary the usage spine records | 4 existing event tables; **exactly 1** new — `usage_events`. **There is no second ledger:** an earlier draft added a `surface_ledger` for the fan-out graph and it is deleted (R-25) — those edges are the CONTRACT's own `consumers[]`, and a table recording the same join would be a second source of truth for a fact the descriptor already declares | `seeds/usage-events.json` |

**Two things deliberately NOT units** — this is the scope reduction:

- **PROJECTION is a field, not a unit.** `mobile/app/(app)/map.tsx` and `mobile/app/(app)/index.tsx` are one contract, one Zod schema (`LeadFeedResultSchema`), one hook (`useLeadFeed`), two projections. It becomes `render.projection: list | map | grid | detail`. Making it a unit would have produced a phantom `MAP` archetype and a second descriptor for one payload.
- **EXPORT is a render target, not a unit.** A PDF of the property preview is the same descriptor with `render.targets: ["screen","pdf"]`. This is the strongest single argument for the approach: *"100% data parity between the web view and the exported document"* stops being a discipline and becomes a golden-capture comparison. (The route that emits the file is a CONTRACT of archetype `EXPORT`.)

**SHELL is an archetype on SURFACE, not a fourth unit** — and the 6 navigation shells sit alongside the 53, not inside them (§3.1) — a shell in this estate is not inert. `mobile/app/(app)/_layout.tsx:236-265` is the sole subscription gate for all five tabs and `mobile/app/_layout.tsx:88` is the sole routing authority (9 branches per `decideAuthGateRoute.ts`). Those are declarations.

### 2.0 What this spec governs — the programme partition

**The estate shares one repository. It does not share one programme.** Every descriptor declares `programme.scope` from a closed set of four, with a measured one-line reason, and the generated registry renders in that order:

| § | Scope | n | What it is | Governed by this spec? |
|---|---|---:|---|---|
| **A** | `parcel_product` | **6** | The MaxBLD parcel cost tool itself — the surfaces and contracts a customer touches, plus the five business requirements hanging off them: the metered lookup, the PDF sent to a client, the ad placements, and the Vercel web front door. | **Yes.** This is the programme. |
| **B** | `parcel_admin` | **13** | The admin surfaces that *operate* the parcel product: usage and entitlements, placements and advertiser accounts, the PDF audit, the `app_outputs` recompute, and the descriptor-native registry / fan-out / orphan / drift / roles pages. | **Yes** — and they convert **with** the product, not after it. An unobservable product is not shipped. |
| **C** | `platform_shared` | **72** | Auth, the user profile, the subscription and Stripe hand-off, entitlements, notifications, and the navigation shells. Used by both products, owned by neither. | **Yes** — and changing one changes both products, which is why it is its own scope rather than filed under whichever product noticed it first. |
| **D** | `estate_other` | **46** | The OTHER product: lead generation, the flight center, the lead feed, permit and job detail, builders and entities. | **No — inventory and seam only.** |

**Scope D is fenced, and the fence is Spec 128 R-03.** Spec 100 §1 states the parcel tool *"is **not** coupled to the Lead Feed, Flight Center, or LeadDetail"*, and this spec does not reverse that. Scope D is inventoried for exactly one reason: so that a contract it **shares** with scope C, or a contract with **no caller at all**, is visible rather than hidden — which is the whole argument for the registry (`/api/leads/view`: a live metered route with 44 passing tests and zero callers, unnoticed for months). Those surfaces convert under this same standard in a later programme. The registry renders them **one line each**, deliberately: expanding them would bury the programme it exists to review.

**Consequences, stated so they are not rediscovered:**

1. **Spec 127 §4.4 batches scopes A–C only.** A scope-D row carries `programme.phase: "not_scheduled"`, and that is an answer rather than an omission.
2. **The descriptor tree is partitioned by scope**, not merely tagged: `scripts/surfaces/<scope>/<kind>/<id>.descriptor.json`. The standard stays estate-wide — all 137 are emitted and all 137 are validated — but a reader, a checker and the SurfaceEngine each address one programme at a time.
3. **The pilot is exactly one surface.** `mobile_parcel_detail` carries `programme.pilot: true`; nothing else may.
4. **A scope-C change is a two-product change.** Its plan says so, and its review panel is sized for it.

### 2.1 `platforms[]` — one descriptor set, three renderers

Every SURFACE declares `platforms[]` from the closed set `web | mobile | pdf`:

| Surface class | `platforms` | Renderer |
|---|---|---|
| Admin surfaces (the 15 pages under `src/app/admin/` + `login`, `dashboard`, `subscribe*`, `auth/callback`) | `["web"]` | Next.js RSC + the admin archetype set (Shadcn/Tailwind) |
| Product surfaces (parcel preview, search, marketing/landing, `permits/[id]`, `builders*`) | `["web","mobile"]` | RSC on web · fetched projection + the RN archetype set on mobile |
| Export-bearing surfaces | adds `"pdf"` | the same descriptor, a PDF renderer, parity asserted by golden |

**Admin surfaces are descriptored in the SAME pass as the product ones** — one archetype vocabulary, one schema, one validator, one registry page. The admin web tree is where the estate's largest single-file surfaces live (`src/components/admin/` is 13 files / 4,322 lines, `LeadDetailInspector.tsx` alone 727L), and it is where `GenericFieldRenderer.tsx` (83 lines, a type-aware renderer for ~120 heterogeneous DB fields) already proves the archetype-renderer idea works in this repo. Splitting admin into a later pass would produce a second vocabulary; that is the exact failure Spec 122 V1–V6 were ruled to prevent.

### 2.2 The admin estate — catalogued in the same pass

**The admin is not a product; it is the fifth projection of the same descriptor set** — and the one projection allowed to render the *descriptor itself* rather than only its output. Source: `docs/reports/2026-09-15-spec126-admin-best-in-class.md`.

**22 admin surfaces**, assigned the same archetypes: **11 exist today** (the 15 `page.tsx` under `src/app/admin/`, of which 4 collapse into rows below and one — `admin/lead-feed/flight-center` — is a 13-line `permanentRedirect`), **11 are new**, and **11 of the 22 are 100%-or-mostly generated**.

| Group | Surfaces (descriptor id · archetype · Gen?) |
|---|---|
| **A. Operations** | `admin_pipeline_dashboard` DASHBOARD · `admin_step_output` REPORT (partial) · `admin_data_quality` DASHBOARD · `admin_engine_health` DASHBOARD · **`admin_run_ledger` LIST (gen, NEW)** · `admin_stale_run_reaper` FORM-console *(exists but wrong shape — `reapStaleRunningRows()` fires only inside `GET /api/admin/stats:189`; no page, no button, no job)* |
| **B. Recompute triggers** | `admin_recompute_console` FORM (partial; today fragmented across 4 routes, only `resync` has a UI caller) · `admin_global_config` FORM **(gen — the canonical precedent: `logic-variable-groups.json` → `GlobalConfigCard.tsx:20`)** |
| **C. Usage & entitlements** | `admin_usage_funnel` DASHBOARD (partial) · **`admin_entitlements` LIST+DETAIL (gen)** · `admin_user_detail` DETAIL *(the only page whose mutations are fully audited)* · `admin_user_list` LIST |
| **D. Advertiser layer** | **`admin_advertiser_accounts` LIST+DETAIL (gen, NEW)** · **`admin_placements` FORM (gen, NEW)** · **`advertiser_self_metrics` DASHBOARD (gen, NEW — role `advertiser`, RLS-scoped, NOT `is_admin`-gated: the first non-admin principal ever admitted to an admin-shaped surface)** |
| **E. Export / PDF** | **`admin_export_audit` LIST (gen, NEW)** |
| **F. Descriptor-native — the generated core** | **`admin_surface_registry` LIST (100% gen — the admin PILOT)** · **`admin_contract_fanout` REPORT (100% gen)** · **`admin_orphan_panel` LIST (100% gen)** · **`admin_drift_status` DASHBOARD (100% gen)** · **`admin_role_matrix` REPORT (100% gen)** · **`admin_ledger_visualiser` REPORT (100% gen)** |

**Deliberately NOT in this catalogue:** the lead-feed family (`admin/lead-feed`, `.../inspector`, `admin/flight-center`, `admin/notifications`, `admin/security`). It is Spec 36/91 lead-gen product admin, it is the bulk of the 4,322 hand-built lines, and it converts **last**, not first.

#### 2.2.1 The eleven admin principles

Each names a precedent that already ships **in this repo** and the measured anti-pattern it retires.

| # | Principle | Measured anti-pattern it retires |
|---|---|---|
| **P1** | **The admin is a projection, not a product.** An admin page is the same SURFACE/CONTRACT descriptor with an admin audience — never a parallel data path. | `src/lib/admin/parcel-lookup.ts` **326L** vs `src/lib/parcels/consumer-lookup.ts` **159L** — two resolvers over the same parcel, diverging independently; the admin twin is 2.1× the consumer's size for the same subject. |
| **P2** | **No admin-only business logic.** The admin may *reveal* more fields; it may not *derive* differently. | `src/lib/admin/funnel.ts:154-158` hardcodes five SLA thresholds (48 / 8760 / 2160 / 744 / 192 h) and `:166` an eight-slug `LOADER_SLUGS` literal — admin-only policy, invisible to the pipeline producing the rows it judges. |
| **P3** | **Every admin mutation writes exactly one ledger row**; an audit failure fails the request. `src/lib/admin/admin-audit.ts` already does this correctly (centralised `redactPii`, `scrubAdminAuditForTarget`, and a header that calls an unaudited mutation *"a compliance hole"*). | **9 of the 15 mutating admin routes write no `admin_audit_log` row** — including `control-panel/configs` **PUT**, which rewrites `logic_variables` + three more tunable tables. |
| **P4** | **All tunables are data; zero thresholds in `src/`.** | `funnel.ts:154-166` and `SearchPermitsModal.tsx:34 DEBOUNCE_MS = 300` — which the SEARCH archetype turns into a required `config.debounce_ms` declaration. |
| **P5** | **Generated pages over hand-built ones, and the generator is locked by a RED canary.** | **4,322 lines across 13 files** in `src/components/admin/`; `GenericFieldRenderer.tsx` (83L) is the one file that already knows the answer. |
| **P6** | **Drift is shown in-product, not only in CI.** A checker with no reader is a checker nobody acts on. | `check-spec99-matrix.mjs` wired to nothing; **nine** generated reports under `docs/reports/generated/`, **zero** rendered by an admin page. |
| **P7** | **Role and policy are data, checked against the live catalogue** (§6.2). | `/builders` gated, `/api/builders` public — nothing in the estate holds that join. |
| **P8** | **Orphans are a first-class rendered concept.** | `/api/leads/view` (153L, 44 tests, zero callers) **plus 5 of the 29 `/api/admin/*` routes with no call site of any kind** — `builders`, `pipelines/runs`, `rules`, `suppliers/leads`, `sync`. Scoped deliberately: two further routes first counted as orphans (`leads/inspect/[id]`, `pipelines/[slug]`) **are** called, via template literals, and `/api/quality/refresh` is excluded because it is not under `/api/admin/*`. The census's own 17-contract orphan list additionally names `/api/admin/pipelines/history` and `/api/admin/pipelines/schedules`; **that disagreement is not resolved here** — reconciling the two sweeps is part of `ASK-13`, and an orphan count that two passes disagree about is exactly why the panel is a rendered join rather than a remembered number. |
| **P9** | **Deep links by id, and a command palette over the registry.** | `src/app/admin/page.tsx` (165L) is a hand-maintained hub of `<Link>`s calling no API of its own — a new admin page is invisible until someone edits that file. |
| **P10** | **Time-travel is the ledger, not a snapshot table** — replay `pipeline_runs` + `usage_events` + `admin_audit_log`, all append-only with PK-as-dedup. | `user_profiles.lead_views_count` — a denormalised counter that never moves, because its only writer has no caller. |
| **P11** | **Architecture boundaries enforced mechanically, not by review.** A boundaries rule is a config line on a gate (`.husky/pre-commit` → `npm run lint`) that already fires. | `src/components/DataQualityDashboard.tsx` fetches **four** admin contracts from one component — a tile grid with no per-tile `degrade_independently`, which DASHBOARD makes a required declaration. |

#### 2.2.2 The admin pilot — `/admin/surfaces`, and why

`admin_surface_registry` is the admin pilot because **it is 100% generated, so it cannot be faked.** Every other candidate can be shipped by hand and still look right; if the descriptor set is incomplete or the archetype profiles are wrong, this page is visibly empty or visibly wrong on commit 1 — which is the point of a pilot, and the same reason `assert_schema` was pilot 1 on the pipeline side. It is read-only, writes nothing, touches no migration (the `parcel_detail` risk profile). It has a real defect to close on day one (the orphan panel's red rows). It is the direct descendant of the `logic-variable-groups` precedent — generate → commit → import → lock — so the review panel argues about content, not mechanism. And once it exists, `src/app/admin/page.tsx`'s 165 hand-maintained lines become a query over the registry, retiring P9 as a side effect.

**What the admin pilot needs FROM the product pilot** — these are acceptance criteria on `parcel_detail`, not admin follow-ups: (1) a committed `parcel_detail` surface descriptor with a real `archetype: REPORT`; (2) a `parcels_lookup` contract descriptor with a populated **`consumers[]`** — the fan-out graph's edges *are* `consumers[]`; (3) `guards.entitlement: "parcel_tool"` + `metering`; (4) `render.targets: ["screen","pdf"]` + a screen-side golden; (5) the `guards.session` ↔ `auth_class` check declared on a real surface. **What the admin owes the product pilot:** `admin/parcel-cost` (`ParcelCostTool.tsx`, 425L) as the third projection — the fastest available refutation of "one contract, N projections", learned for 425 lines instead of 4,322.

## 3. The archetype registry — derived from the census

Under the operator's load-bearing ruling, `archetype` is not a label: it **selects a required-field profile**, exactly as `identity.archetype` does at `scripts/steps/_schema/step.schema.json` with its `allOf` `x-profile` blocks. The precedent, mirrored from the schema:

<!-- generated:mirror:126-archetype-profiles -->
> **GENERATED — do not hand-edit between the markers.** Source of record: `scripts/steps/_schema/step.schema.json` `properties.identity.properties.archetype.enum` (8 values) + `allOf[].x-profile` (6 profile blocks), docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.10.

| Pipeline archetype | Source anchor | What its profile PROVES | Disposition | Surface analogue |
|---|---|---|---|---|
| `INGESTOR` | `scripts/steps/_schema/step.schema.json` `identity.archetype.enum[0]` · docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.10 | the write-side profile: a surface that writes may not declare `outputs: "none"`, and every declared write names its discipline. | ✅ applies | FORM / WIZARD_STEP |
| `MATERIALIZER` | `scripts/steps/_schema/step.schema.json` `identity.archetype.enum[1]` · docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.10 | its profile requires `replay` declared (globally) **plus `recovery.reset` may not be `"none"`** — a derived artifact must say how it is rebuilt. The surface analogue: a projection published to more than one render target declares how each target is regenerated, with the goldens proving parity. | ✅ applies | REPORT (`render.targets`) |
| `LINK` | `scripts/steps/_schema/step.schema.json` `identity.archetype.enum[2]` · docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.10 | the invalidates-is-non-empty rule becomes: a detail surface that mutates declares which query keys it invalidates. | ✅ applies | DETAIL |
| `MATCHER` | `scripts/steps/_schema/step.schema.json` `identity.archetype.enum[3]` · docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.10 | a matcher's accuracy is a sampled number against a before-image (R-O), never a predicate agreeing with itself; a SEARCH surface's candidate quality is measured the same way. | ✅ applies | SEARCH |
| `ENRICHER` | `scripts/steps/_schema/step.schema.json` `identity.archetype.enum[4]` · docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.10 | derivation happens server-side, in a CONTRACT or a pipeline step; a surface never enriches. `execution.phases[]` has no analogue. | ⛔ dropped | — |
| `BACKFILL` | `scripts/steps/_schema/step.schema.json` `identity.archetype.enum[5]` · docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.10 | no surface re-processes a corpus. | ⛔ dropped | — |
| `ASSERT` | `scripts/steps/_schema/step.schema.json` `identity.archetype.enum[6]` · docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.10 | the profile that forces three categories to `"none"` — which is exactly why `assert_schema` was pilot 1 on the pipeline side and why REPORT is the pilot here (census §4.1). | ✅ applies | REPORT / GATE |
| `RECORDER` | `scripts/steps/_schema/step.schema.json` `identity.archetype.enum[7]` · docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.10 | `outputs.publish` required becomes: a surface that records (an impression, a click, a view) declares its ledger event and its dedup key. | ✅ applies | SLOT / the `emits` contract |

**The mechanism being mirrored, stated once:** the archetype selects an AJV required-field profile — 6 `allOf` `x-profile` blocks covering all 8 archetypes, asserted in both directions by this generator.

**Coverage (derived):** 6 profile blocks · 8 archetypes covered · 0 uncovered · 0 double-covered.

Each block lives in `scripts/steps/_schema/step.schema.json`. That is what "UI archetypes are LOAD-BEARING" means here: an archetype gates which descriptor fields must be answered, it does not merely label a renderer.
<!-- /generated:mirror:126-archetype-profiles -->

### 3.1 The archetype registry — SURFACE, CONTRACT, JOB

**ONE home for the profiles.** The table below is GENERATED, and it is the register of record for which fields each archetype makes mandatory. `archetype_registry` (§6.3) therefore carries **no `required_fields` column** — a second copy of a profile is a second thing to keep in sync, which is the defect this whole spec exists to retire.

<!-- generated:mirror:126-surface-profiles -->
> **GENERATED — do not hand-edit between the markers.** Source of record: `scripts/surfaces/_schema/surface.schema.json` — **DRAFT** (`x-frozen: false`), checked against the generator's own profile map in BOTH directions on every run, and canonical for this table the moment it is ratified. Provenance for the counts and members: `docs/reports/2026-09-15-spec126-surface-unit-and-schema-model.md` §2 — a report, which is why it is not the source. Regenerate: `node scripts/violations/generate-spec-mirror.mjs`.

**SURFACE archetypes.** Every rendering surface is assigned exactly once; the column sums are asserted by the generator, not typed.

| # | Archetype | `platforms` typical | mob. screen | mob. overlay | web page | **n** | One real example | MUST answer (beyond the always-required core) | MUST be `"none"` |
|---:|---|---|---:|---:|---:|---:|---|---|---|
| 1 | **LIST** | web+mobile | 3 | 0 | 4 | **7** | `mobile/app/(app)/index.tsx` (264L) | `inputs.contract_ref` · `inputs.query_key` · `list.item_archetype` · `list.pagination` · `list.recycling` · `render.projection` · `states[]` **must include** `empty` and `offline` | — |
| 2 | **DETAIL** | web+mobile | 2 | 0 | 4 | **6** | `src/app/permits/[id]/page.tsx` (562L) | `inputs.query_key` **single-param** (Spec 99 §4 hygiene, as schema) · `sections[]` · `outputs.invalidates[]` when it mutates · `states[]` must include `error` | — |
| 3 | **REPORT** | web+mobile+pdf | 1 | 0 | 2 | **3** | `mobile/app/(app)/parcel-tool/[parcelId].tsx` (231L) | `outputs.writes: "none"` **enforced** · `inputs.field_whitelist` (must equal the contract's) · `plausibility[]` ≥1 · `render.targets[]` · `offers` (may be `"none"`) · `metering` (may be `"none"`) | `outputs` · `state` |
| 4 | **SEARCH** | web+mobile | 1 | 1 | 0 | **2** | `mobile/app/(app)/parcel-tool/index.tsx` (115L) | `config.debounce_ms` · `config.min_query_len` · `guards.rate_bucket` · `candidate_item` · `states[]` must include `empty` · `log_hygiene` (Spec 100 §2 item 8 — never log `q`) | `outputs.writes` unless a claim action exists |
| 5 | **FORM** | web+mobile | 3 | 2 | 4 | **9** | `src/app/admin/security/page.tsx` (293L) | `fields[]` each carrying the **Spec 99 §3 row as data** (`owner_layer`, `canonical_writer`, `authorized_readers`, `bridge`, `persistence`, `signout_reset`) · `outputs.contract_ref` · `outputs.rollback` · `states[]` must include `error` | — |
| 6 | **WIZARD_STEP** | web+mobile | 7 | 0 | 3 | **10** | `mobile/app/(onboarding)/address.tsx` (270L) | `step_index` · `advances_on` · `resume_key` · `skip_when` · `terminal` (bool) | `inputs` may be `"none"` — measured: 2 of the 7 onboarding steps call no route |
| 7 | **DASHBOARD** | web | 0 | 0 | 4 | **4** | `src/app/admin/market-metrics/page.tsx` (462L) | `tiles[]` each with its own `contract_ref` + `degrade_independently` · `refresh.poll_ms` · `states[]` per tile | `outputs.writes` unless a tile declares a COMMAND |
| 8 | **GATE** | mobile | 2 | 6 | 0 | **8** | `mobile/src/components/paywall/PaywallScreen.tsx` (237L) | `statuses_handled[]` **must cover every value** of the governing closed set (subscription: all 6 of `chk_entitlements_status`) · `fallthrough` · `on_unknown` | `outputs.writes` |
| 9 | **SLOT** | web+mobile | 0 | 1 | 0 | **1** | `mobile/src/components/parcel/SponsorSlot.tsx` (21L) | `placement` (closed enum) · `inventory_source` (a **table**, never a literal) · `targeting[]` (closed axes) · `flag` · `null_when_off: true` · **`disclosure`** (a `checks[]` entry at `severity: FAIL`) · `max_slots` | `outputs.writes` except the declared impression ledger event |
| 10 | **STATIC** | web | 0 | 0 | 3 | **3** | `src/app/page.tsx` (116L) | `content_source` · `seo` — **or** `routing.redirect` alone for a redirect-only page (`admin/lead-feed/flight-center/page.tsx`, 13L, `permanentRedirect`) | everything else |
| | **Rendering surfaces** | | **19** | **10** | **24** | **53** | | | |
| — | **SHELL** *(navigation shells — NOT among the 53)* | web+mobile | 5 | — | 1 | **6** | `mobile/app/_layout.tsx` (AuthGate, 530L) | `routing.branches[]` (9 for AuthGate, per `decideAuthGateRoute.ts`) · `guards[]` · `children_groups[]` · `emits.route_decision` | `inputs` unless the shell itself fetches — measured: 2 of the 6 read `/api/user-profile` |
| | **Total descriptors** | | | | | **59** | | | |

**CONTRACT archetypes.** Assigned per exported **method handler**, not per route file — 15 of the 61 route files export more than one method, so a per-file assignment cannot sum. Measured handler tally: GET 46 · POST 23 · PATCH 6 · DELETE 3 · PUT 2 = **80** handlers across **61** route files.

| Archetype | n (of 80 handlers) | Example member | MUST answer |
|---|---:|---|---|
| **QUERY** | 46 | `/api/admin/stats` (reads **18 tables**) | `response.projection` (explicit pick-by-name whitelist) · `response.tiers[]` + per-tier degradation · `database.reads[]` · `guards.rate_bucket` · `staleness` · `outputs.writes: "none"` |
| **MUTATION** | 27 | `/api/user-profile` (PATCH) | `database.writes[]` with `write_discipline` (the Spec 122 §1.4 vocabulary **verbatim**) · `idempotency` · `optimistic_contract` · `rollback` · `consumers[]` |
| **WEBHOOK** | 1 | `/api/webhooks/stripe` (504L, 6 event types) | `verification` · `events[]` (closed) · `replay_guard` (`stripe_webhook_events` PK) · `ordering_watermark` (`entitlements.last_stripe_event_at`) · `on_unknown_event` |
| **COMMAND** | 6 | `/api/admin/control-panel/resync` | `job_ref` (which JOB it triggers) · `concurrency` · `audit_row` |
| **EXPORT** | 0 | *(net-new — the PDF route)* | `render_target` · `source_contract_ref` · `parity_check` (golden equality with the screen projection) · `storage` (bucket + path template) · `share_auth` · `ledger_event` |
| **TRANSLATION** | 0 | *(net-new — `parcel_id_translation`, §3.4)* | `from_key` · `to_key` · `mapping_table` · `on_unmapped` · `ledger_event` · `consumers: "none"` while R-03 holds |
| | **80** | | |

**JOB archetypes.**

| Archetype | n | Example member | MUST answer |
|---|---:|---|---|
| **SCHEDULED** | 6 | all six, named: the 4 `pg_cron` jobs (`mv_monthly_permit_stats_refresh` `233:90` · `lead_views_retention_purge` `233:96`/`235:134` · `offboarding_sweep_30day` `233:105` · `permit_scrape_outcomes_prune` `237:139`) + `pipeline-watchdog.yml` (`45 18 * * *`) + **`mutation.yml`** (`0 12 * * 1`) | `cron` · `target` (function/SQL) · `idempotency` · `on_missing_extension` (all four `cron.schedule` calls are `pg_extension`-guarded) · `audit_row` |

*A second JOB archetype (`DISPATCH`) was drafted and removed: its only two candidate members — `scripts/dispatch-notifications.js` and `scripts/classify-lifecycle-phase.js` — are **chained pipeline steps** already governed by `step.schema.json`, so they are out of scope here (Spec 126 Operating Boundaries). An archetype with no member this spec owns is a vocabulary nobody uses.*
<!-- /generated:mirror:126-surface-profiles -->

**Three vocabulary decisions, each measured:**
- **`MAP` is not an archetype** — `map.tsx` and `index.tsx` share hook, contract and Zod schema; the difference is `render.projection: "map"` on a LIST. Making it an archetype would have created a second descriptor for one payload.
- **`PREVIEW+OFFERS` is `REPORT` + the `offers` category**, not a further archetype. `offers` is required-and-may-be-`"none"` on REPORT — the way `checks[]` may never be `"none"` but everything else may, provided it is written down.
- **`EXPORT` is not a SURFACE archetype** — it is `render.targets: ["screen","pdf"]` on a REPORT plus one CONTRACT of archetype `EXPORT`.

**The redirect-only page is STATIC, not SHELL.** `src/app/admin/lead-feed/flight-center/page.tsx` (13L, `permanentRedirect('/admin/flight-center')`, [PF9]) renders nothing and declares `routing.redirect` alone. Giving it SHELL's full profile — `routing.branches[]`, `guards[]`, `children_groups[]`, `emits.route_decision` — would force four `"none"` answers onto a page that has no children and makes no route decision. It is counted **once**, inside the 53, as STATIC; the 6 navigation shells are a separate set and keep the full SHELL profile.

### 3.2 On the EXPORT and TRANSLATION archetypes being empty today

`src/lib/export/pdf.ts` is a self-declared stub ("TODO: Replace the HTML string generation with a proper PDF library"), returns `Buffer.from(html)`, is scoped to permits and has **no production caller**. `expo-sharing@~14.0.8` is declared in `mobile/package.json` and never imported. EXPORT is a genuinely empty archetype — the honest place for the PDF requirement, rather than a field bolted onto QUERY.

`TRANSLATION` is empty for a different reason: the thing it describes exists in the database and has never been expressible. See §3.4.

### 3.3 JOB, and what is deliberately not a JOB

The **27 pipeline steps** stay governed by `step.schema.json` and are out of scope. So are the two candidates for a `DISPATCH` archetype — `scripts/dispatch-notifications.js` and `scripts/classify-lifecycle-phase.js` — because both are **chained pipeline steps** with slugs in `scripts/manifest.json`, already standardised by Spec 122. Removing that archetype is the simplification: an archetype whose only members belong to another spec is a vocabulary nobody here uses.

What remains is **6 JOB members under one archetype, `SCHEDULED`**, and that reconciles with §2's unit table exactly: 4 `pg_cron` jobs + `pipeline-watchdog.yml` + `mutation.yml`. `chain-wsib.yml` has no `schedule:` block and is dispatch-only, so it is not a JOB.

**JOB gets its own descriptor schema** (`R-14`, ratify before the pipeline programme's C3 freeze) rather than two new `x-frozen` archetype values inside `step.schema.json`: a `pg_cron` purge and a chain step share a posture but not a lifecycle, and adding archetypes to a schema about to freeze spends a freeze this programme does not own.

### 3.4 `parcel_id_translation` — the only declared seam to Specs 77 / 91

**The join exists in the database and is not expressible anywhere today.** `migrations/125_create_lead_parcels.sql` declares `lead_parcels(lead_id, parcel_id INTEGER REFERENCES parcels(id), …)` — so `lead_parcels.parcel_id` is `parcels.id`, the **SERIAL** (`parcel_pk`), while the consumer API's `parcelId` is `parcels.parcel_id`, the **`VARCHAR(20)` municipal id** (`parcel_ref`). Two different columns share one name across `parcels`, `lead_parcels`, the consumer API and the admin lib. **Any lead ↔ parcel deep link must translate, and nothing does.**

Under **R-03 the fence holds**: Spec 100 §1 states the tool *"is **not** coupled to the Lead Feed, Flight Center, or LeadDetail… The abandoned 23B 'LeadDetail linkage' is explicitly dropped."* This spec does not reverse that. What it adds is the *declaration* of the seam, so a future non-fenced use cannot invent a fifth vocabulary:

| | |
|---|---|
| **Unit** | one CONTRACT, archetype **`TRANSLATION`**, id `parcel_id_translation` |
| **Declares** | `from_key: parcel_ref` · `to_key: parcel_pk` · `mapping_table: lead_parcels` · `on_unmapped` (the ~14.5K-style tail is a legitimate outcome, not an error) · `ledger_event: parcel_id_translated` |
| **`consumers[]`** | **`"none"` — written down, not omitted**, and a `checks[]` entry at `severity: FAIL` asserts it stays empty while R-03 holds. That check *is* the fence, mechanically. |
| **No SURFACE** | nothing renders it. `LeadDetailSchema`'s 20 fields gain no parcel reference; `lead_parcels` is read by no surface descriptor. |
| **Cross-spec** | **Spec 77** (mobile CRM flight board) and **Spec 91** (mobile lead feed) own the surfaces that would consume it. Reversing the fence is an operator decision against those two specs, not an oversight here — and when it is taken, the translation contract already exists, already has a ledger event, and already has a lock proving when it went live. |

### 3.5 Unknown-archetype posture


An archetype key the registry does not know **renders a declared fallback card AND raises a `checks[]` FAIL** — Spec 125 §3's fail-safe is kept, but a silent yellow box is not the whole answer. The registry membership is itself a check: every `identity.archetype` value must resolve to a registered component on every declared platform, asserted at build time, not at render time.

## 4. The category contract — 20 in, mirrored

Spec 122 §1.2's rule is inherited whole: **the category list and the allowed responses are decided once, for all surfaces.** A surface that needs a value the menu lacks does not add one — it escalates through Spec 128 §4. **Omission is a build failure; `"none"` is a valid value, and it applies PER FIELD, not per category.**

The mirror below is **generated** from `scripts/steps/_schema/step.schema.json` (R2-canonical) plus an authored disposition map, by `node scripts/violations/generate-spec-mirror.mjs`. It cannot drift from the pipeline's schema without `--check` failing.

<!-- generated:mirror:126-categories -->
> **GENERATED — do not hand-edit between the markers.** Source of record: `scripts/steps/_schema/step.schema.json` `required[]` (20 categories, R2-canonical per docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.2) + the authored disposition map in `scripts/violations/generate-spec-mirror.mjs`. Regenerate: `node scripts/violations/generate-spec-mirror.mjs` (an `npm run spec-mirror` alias + `npm run verify` wiring lands in Phase 1).

| # | Spec 122 category | Source anchor | Disposition | SURFACE category | What it declares here / why it was dropped |
|---:|---|---|---|---|---|
| 1 | `identity` | `scripts/steps/_schema/step.schema.json` `required[0]` · docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.3 | ✅ applies | `identity` | route/path · **archetype** · `platforms[]` · `render.projection` · **`owns.components[]`** (required on a web SURFACE — R-13) · owner · spec · `spec_version` · `gate_exempt`. **ONE version axis** — `spec_version` only; the pipeline has no `contract_version` either, and two version fields on one descriptor is two things to forget to bump. |
| 2 | `inputs` | `scripts/steps/_schema/step.schema.json` `required[1]` · docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.3 | ✅ applies | `inputs` | `contract_ref[]` (ids into the CONTRACT registry, **never an inline schema**) · params · `query_key` · `version_pin` · `field_whitelist`. |
| 3 | `outputs` | `scripts/steps/_schema/step.schema.json` `required[2]` · docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.3 | ✅ applies | `outputs` | mutation `contract_ref[]` · `optimistic` · forced `"none"` on REPORT/GATE/SLOT/STATIC/SHELL. |
| 4 | `staleness` | `scripts/steps/_schema/step.schema.json` `required[3]` · docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.3 | ✅ applies | `staleness` | `stale_time_ms` · `gc_time_ms` · `refetch_on_*` — the TanStack defaults `mobile/src/lib/queryClient.ts` sets globally today, declared per surface. |
| 5 | `guards` | `scripts/steps/_schema/step.schema.json` `required[4]` · docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.3 | ✅ applies | `guards` | `session` · `entitlement{product, statuses[], on_missing}` · `flag` · device permission · `rate_bucket`. A `"none"` carries a required `why` (census Q12: `/api/quality` is public and unwritten-down). |
| 6 | `execution` | `scripts/steps/_schema/step.schema.json` `required[5]` · docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.3 | ♻️ reshaped | `render` | `txn_scope`/`batch`/`budget`/`needs_disk_mb` have no surface analogue; what survives is HOW it renders — `targets[]` (screen\|pdf\|email) · `projection` · breakpoints (Admin desktop-first `md:` vs Expo mobile-first) · safe-area edges · header/tab-bar behaviour. |
| 7 | `checks` | `scripts/steps/_schema/step.schema.json` `required[6]` · docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.3 | ✅ applies | `checks` | ⚠️ **never `"none"`** — inherited verbatim, including the severity vocabulary and the row-derived verdict cascade. |
| 8 | `invariants` | `scripts/steps/_schema/step.schema.json` `required[7]` · docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.3 | ✅ applies | `invariants` | declarative assertions over the **projected payload**, single-surface scoped. |
| 9 | `plausibility` | `scripts/steps/_schema/step.schema.json` `required[8]` · docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.3 | ✅ applies | `plausibility` | cross-field UI honesty — absent ≠ `fits:false`; "maximum envelope" ≠ "as-of-right". ⚠️ **Ad policy does NOT land here** (R-34): every `plausibility[]` entry requires a `sql` string and is executed as declarative SQL, and a layout rule has no SQL expression — ad policy is a `checks[]` entry, and placement inventory is the `placements` table. |
| 10 | `override` | `scripts/steps/_schema/step.schema.json` `required[9]` · docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.3 | ⛔ dropped | — | a force-full env var has no surface analogue; the nearest thing, a feature flag, is already `guards.flag`. |
| 11 | `emits` | `scripts/steps/_schema/step.schema.json` `required[10]` · docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.3 | ♻️ reshaped | `emits` (merged with `counters`) | analytics events against the `mobile/src/lib/analytics.ts` whitelist · Sentry breadcrumbs · **ledger writes** · `counters{}` + the Spec 99 §7.7 ratio invariants. A surface counter IS an emitted event, so the two pipeline categories collapse to one. |
| 12 | `deviations` | `scripts/steps/_schema/step.schema.json` `required[11]` · docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.3 | ✅ applies | `deviations` | `{from, why, adjudicated_by, date}` — unchanged shape. |
| 13 | `limitations` | `scripts/steps/_schema/step.schema.json` `required[12]` · docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.3 | ✅ applies | `limitations` | `{what, measured, check_id}` — unchanged shape. |
| 14 | `interpretation` | `scripts/steps/_schema/step.schema.json` `required[13]` · docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.3 | ✅ applies | `interpretation` | → `<surface>.notes.json`, capped at 12. Prose is capped; checks are uncapped. |
| 15 | `recovery` | `scripts/steps/_schema/step.schema.json` `required[14]` · docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.3 | ♻️ reshaped | `errors` | `reset`/`resume`/`rollback`/`verify_clean` describe a RUN; a screen has no run. What a screen has is error classes handled — 401/403/429/schema-drift/offline — each with its declared UI and `no_retry[]`. |
| 16 | `database` | `scripts/steps/_schema/step.schema.json` `required[15]` · docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.3 | ⛔ dropped | — (moves to CONTRACT) | a screen does not touch a table; its contract does. This is the schema-level expression of MAX-SERVER-SIDE and the single property that makes "one contract, N projections" expressible (census §1.2c: `/api/user-profile` is reached from 11 surfaces + 2 shells by two idioms). |
| 17 | `counters` | `scripts/steps/_schema/step.schema.json` `required[16]` · docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.3 | ⛔ dropped | — (folded into `emits`) | see `emits` above; a `records_meta` key has no surface analogue. |
| 18 | `config` | `scripts/steps/_schema/step.schema.json` `required[17]` · docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.3 | ✅ applies | `config` | tunables as registered logic variables with `min`/`max`/`on_invalid` — debounce, page size, stale time, rate limits. Same registry, same Rule 3. |
| 19 | `sharing` | `scripts/steps/_schema/step.schema.json` `required[18]` · docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.3 | ✅ applies | `sharing` | which surfaces render this contract · what varies by surface · what varies by render target. The category the census says earns its keep on day one (3 renderings of one payload already exist, 771 hand-written lines). |
| 20 | `terminals` | `scripts/steps/_schema/step.schema.json` `required[19]` · docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.3 | ♻️ reshaped | `states` | renamed; semantics preserved (every exit path, `minItems: 1`). A surface terminal is a render STATE, each pinned by a named golden. |
| 21 | — | *(no pipeline ancestor)* | 🆕 new | `state` | the Spec 99 §3 row as data: `owner_layer` · `canonical_writer` · `authorized_readers` · `bridge` (B1–B6) · `persistence` · `signout_reset`. Spec 99 §3 already says it is normative and already has a checker (`mobile/scripts/check-spec99-matrix.mjs`) that nothing runs. |
| 22 | — | *(no pipeline ancestor)* | 🆕 new | `offers` | `placements[]` · `inventory_source` (a table, never a literal) · `targeting[]` (closed axes) · `disclosure` · `null_when_off` · `max_slots`. Demanded by the SLOT archetype. Ad policy is `checks[]` + the `placements` table, never `plausibility[]` (R-34). |
| 23 | — | *(no pipeline ancestor)* | 🆕 new | `metering` | `unit` · `product` · `ledger_event` · `dedup_key` · `quota_from_config` · `on_exceeded` (402 \| 403 \| paywall). Demanded by the operator ruling that the parcel tool is its own metered product. |
| 24 | — | *(no pipeline ancestor)* | 🆕 new | `a11y` | touch-target floor (44×44) · labels · dark-mode tokens · safe-area · reduced-motion. No pipeline analogue and no existing home. |

**Counts (derived, not typed):** 20 pipeline categories in · 17 carried over · 3 dropped · 4 net-new · **21 SURFACE categories out.**
<!-- /generated:mirror:126-categories -->

**On the count.** The census hand-merged `limitations` + `interpretation` into one row and landed on 20; the generator keeps them separate because the schema does, and lands on 21. **The number is derived, never targeted** — if the count is the thing being managed, the categories are being chosen to hit it.

### 4.1 Why `state` is a category and not a footnote

Spec 99 §3 is already schema-shaped and says so in its own prose — *"This table is **normative**. Adding a field to the mobile app requires adding a row here."* Its columns are literally `Field | Server Type | Local Mirror | Owner Layer | Canonical Writer | Authorized Readers | Bridge`. It has a drift checker, `mobile/scripts/check-spec99-matrix.mjs`, that **nothing runs** (zero matches in `.husky/`, `.github/`, either `package.json`). The category is one `JSON.parse` away from existing; what is missing is the wiring, not the design.

### 4.2 The `"none"` that must be written down

Two live examples of why `"none"` is a required answer rather than an omission, both from the census:

- `/api/quality` is **public and unauthenticated** and serves a curated 11-table list; Spec 26 §3.4 records the widening to all 87 tables as *blocked on an auth/disclosure ruling*. Under this standard it declares `guards.session: "none"` with a **required `why`** and a `disclosure` block naming the exact projected field set.
- `/builders` and `/builders/[id]` are `authenticated` by fail-closed default while `/api/builders` is **public**. The page is behind a login; the data it renders is not. Under a SURFACE/CONTRACT pair this is a one-line cross-check (`surface.guards.session` vs `contract.guards.auth_class`) at `severity: FAIL` — a `checks[]` entry, not a reviewer's memory.

## 5. How schemas work here — the seven arrows

### 5.0 The ONE-SOURCE rule — added 2026-09-15

**There is one source, and everything else is emitted from it.**

```
  scripts/surfaces/_schema/surface.schema.json          THE SCHEMA — 21 categories, closed vocabularies,
            |                                            archetype profiles. Ratified once, then canonical.
            v
  scripts/surfaces/{surfaces,contracts,jobs}/<id>.descriptor.json     THE DESCRIPTOR — one per thing,
            |                                            AJV-validated against the schema on every run.
            |
            +--> src/lib/surfaces/generated/surface-descriptor.d.ts   TypeScript types
            +--> src/lib/surfaces/generated/validate-descriptor.mjs   the ONE runtime validator
            +--> the migration assertions (§6.1 step 4)               declared schema vs live catalog
            +--> the API contracts (§5.2)                             Zod / OpenAPI, both projections
            +--> the web / mobile / admin / pdf projections (§5.3-§5.4)
            +--> docs/reports/generated/127-surface-registry.md       the reviewable registry (Spec 127 §8)
            +--> the Supabase seeded projection (§6.4)                surface_descriptors, git-sourced
```

**The rule:** nothing in that fan-out is hand-written, and nothing in it is a *second declaration*. A type that disagrees with the schema is not a disagreement to reconcile — the type is regenerated. A validator in a test that re-implements the rules is banned; the test imports the same module the engine does.

**Why it is stated as a rule.** The measured defect this whole standard exists to retire is one contract declared at **four** sites and locked at **one**, with the two Zod copies disagreeing in strictness — *the client looser than the server it mirrors*. A fan-out with one source cannot produce that. A fan-out with two sources always eventually does.

**Three consequences worth naming:**

1. **A census row IS a descriptor.** The registry's source rows are not a reporting format that later gets converted — they are draft descriptors in the exact schema shape, validated by AJV on every generator run. There is **no re-keying step** between "reviewed in the registry" and "read by the engine".
2. **A draft may be honestly incomplete, and the incompleteness is counted.** A field the schema marks `x-draft-optional` may carry the literal `UNRESEARCHED`; nothing else may. The registry renders the count per row and in its summary, so an unresearched estate is a number rather than a vague feeling.
3. **The shards are temporary.** `scripts/surfaces/_schema/census/*.json` exists so researchers can work in parallel without collisions. Once every row is researched, the emitted descriptors become the source and the shards are retired — a hand-over Spec 127 §8.5 governs, with the generator's both-directions `--check` as the proof that the two are equal at the moment of the swap.

### 5.0a The loop, stated once

The repo already runs this exact mechanism, in miniature, end-to-end:

> `scripts/seeds/logic_variables.json` (`admin.group` field) → `scripts/generate-logic-variable-groups.mjs` (**throws in both directions**: a pinned key whose `admin.group` disagrees, *and* a seed key absent from its group) → `src/features/admin-controls/generated/logic-variable-groups.json` → imported at `GlobalConfigCard.tsx:20` → `src/tests/logic-variable-groups.infra.test.ts` (3 tests, the third a **tampered-file RED canary**) → `npm run logic-var-groups -- --check` exits 1 when stale, wired into `npm run verify`.

**One declaration file → a `--check`-capable generator that throws on bidirectional mismatch → a committed generated artifact imported directly → an infra test that re-runs the generator, plus a RED canary proving the check itself fires.** Every arrow below is that loop applied to a surface. Copy the `BUILDO_LOGIC_VARS_SEED_PATH` test-only override too — it is the difference between a canary that can be written and one that cannot. (`scripts/violations/generate-spec-mirror.mjs` already follows both conventions: `--check`, `--self-test`, and `BUILDO_SPEC_MIRROR_*_PATH` overrides.)

### 5.1 Arrow 1 — descriptor → DB schema. **Declare and assert. Do not generate migrations.**

Fully specified in §6. Summary: the descriptor's `database` block is a **declaration that is asserted**, never a generator input — the same posture Spec 122 §1.3 adopted for its own `database` category (*"a step pointed at a 222-migration database refuses"*).

### 5.2 Arrow 2 — descriptor → API contract (Zod / OpenAPI)

**The highest-value arrow; it closes a live defect class.** The parcel cost contract is declared **four** times and locked once:

| Site | Form | Locked to the engine? |
|---|---|---|
| `scripts/lib/parcel-cost.js:77` `PARCEL_COST_LINES` | the 13-id engine source | source |
| `src/components/admin/ParcelCostTool.tsx` `LINE_LABELS` | admin web | ✅ `src/tests/parcel-cost-line-keys.logic.test.ts` |
| `mobile/src/lib/parcelCostFormat.ts:14` `COST_LINE_ORDER` | mobile, same 13 ids, different order | ❌ **no lock** |
| `mobile/src/lib/schemas.ts:282` `ParcelCostMenuSchema` | `z.record(z.string(), …)` | ❌ by construction |

And the two Zod declarations disagree in strictness: `src/app/api/parcels/lookup/types.ts` uses `.strict()` **6 times**; `mobile/src/lib/schemas.ts` uses `.passthrough()`/`z.record` **5 times** — *the client is looser than the server it mirrors*. The one cross-tree lock that exists (`src/tests/admin-lead-schemas.contract.test.ts`) covers **lead** schemas, not parcel, and is **excluded from CI** because it dynamically imports `mobile/src/lib/schemas.ts`.

**Generating the mobile mirror from the CONTRACT descriptor kills all four problems at once** — the transcription, the strictness drift, the missing parcel lock, and the CI exclusion (there is nothing left to cross-import). Use the `logic-variable-groups` form (§5.0), **not** the `docs/specs/_contracts.json` grep-assertion form; keep `_contracts.json` as the cross-layer numeric/vocabulary constant registry it already is.

An OpenAPI document is a second projection of the same descriptor, generated, never authored.

### 5.3 Arrow 3 — descriptor → web projection (RSC) and mobile projection (fetched)

**The server returns the projected screen JSON; the client renders it through a small archetype component set; there is no client business logic.**

This is not a new posture — Spec 90 §3 is titled *"The Prime Directive: 'Dumb Glass' Architecture"* and already mandates it, and already carves out the exception (*"Ephemeral optimistic UI state… is highly encouraged"*).

**⚠️ The one cost, stated up front: React Native has no Server Components.** Spec 125 §1's "SSR via Next.js Server Components" is **true on web and false on mobile**, and it is not in Spec 125's own correction list. So:

| Platform | Mechanism |
|---|---|
| **web** (`platforms` includes `web`) | Next.js App Router **RSC on Vercel** — descriptor parsed server-side, projection assembled server-side, maximum server side. This is the cheap half. |
| **mobile** | a **fetched projection**: the server returns JSON describing the screen; the client's archetype registry renders it. Plus **build-time generation** of the archetype components and the Zod mirror. Not SSR. |
| **pdf** | a server route rendering the same projection through a PDF renderer; parity asserted by golden equality, not discipline. |

**Consequences for Spec 99, measured.** Max-server-side moves the Layer-2 / Layer-3 boundary:

| Layer | Today | Under max-server-side |
|---|---|---|
| 1 SERVER | canonical for account-scoped data | **grows** — also canonical for the *projection*: section order, labels, formatting decisions, which lines render |
| 2 TanStack cache | canonical for cached server state | unchanged in role; the cached object is now a projected screen, not a raw payload |
| 3 Zustand | canonical for local UX state; **7 stores** | **shrinks to device + ephemeral only** |
| 4a MMKV / 4b SecureStore | persistence | unchanged |
| 5 Reanimated SharedValues | UI-only | unchanged |

Measured impact: **4 of the 7 stores are MMKV-persisted mirrors of server fields** — `filterStore` (139L) mirrors 6 `user_profiles` columns; `userProfileStore` (156L) mirrors 5 notification-preference columns. Those two collapse into server-owned projection state, retiring bridges **B2** (TanStack→Zustand) and **B3** (Zustand→Server) for those fields.

**What must stay client-side, named so the design is honest** — these are the boundary, declared per surface (Spec 128 rule 2):
1. **Device state** — GPS (`expo-location`), push token, permission status. The server cannot know these.
2. **Optimistic UI** — declared as `outputs.optimistic`, not improvised.
3. **Offline cache** — `mobile/src/lib/mmkvPersister.ts` (24 h). A server-driven screen still renders with no network; the projection is the cached artifact.
4. **Animation / gesture** — Spec 99 §2.1's hard rule; orthogonal.
5. **Navigation position** — `expo-router` owns which route is mounted.

### 5.4 Arrow 4 — descriptor → admin projection

Same descriptor, a different archetype component set (Shadcn/Tailwind, desktop-first `md:` breakpoints per `.claude/domain-admin.md`, vs RN/NativeWind mobile-first). The precedent is already in the tree and is smaller than expected: `src/components/admin/GenericFieldRenderer.tsx` (83 lines) is a type-aware renderer handling *"~120 heterogeneous DB fields (null / boolean / number / date / string / JSONB)"* without a per-field component — its own header calls it *"a deliberate renderer, not ad-hoc JSX"*. That is one archetype component, already written, already branch-tested. The admin twin of the pilot (`ParcelCostTool.tsx`, 425L) already consumes it.

### 5.5 Arrow 5 — descriptor → Supabase seeded projection

**Git is the source; Supabase holds a projection.** Fully specified in §6.4.

### 5.6 Arrow 6 — descriptor → checkers and goldens

**What a checker looks like here, measured.** `scripts/analysis/step-validate.mjs` is 3,728 lines and does six things for one step: AJV + grandfathered + semantic descriptor validation · the shape gate · targeted vitest · golden-capture presence/freshness/comparison · the Spec 123 scorecard *from artifacts, never prose* · the Spec 124 policy-coverage matrix. Plus **13 "fast invariants"** needing no DB and no vitest.

**The surface seed corpus already exists in embryo** — three mobile lint tests port directly: `mobile/__tests__/routerHygiene.lint.test.ts` (209L, 5 cases), `mobile/__tests__/storeReset.coverage.test.ts` (194L, 5), `mobile/__tests__/spec99.mandates.lint.test.ts` (540L, **31**). That is a 943-line, 41-case head start on `surfaces/surface-validate.mjs`.

**The golden shape — a PAIR, both required.** `surfaces/__goldens__/<surface>/<state>.json` carrying `{ harness, spec, surface, archetype, platforms, state, git_head, request, response_fixture, projection, rendered_tree, a11y_tree, emitted_events, nondeterminism[], normalised[], source_fingerprint, fingerprint_files[] }`:

1. an **API response fixture** — what the contract returned;
2. a **rendered-tree snapshot** — what the archetype renderer produced from it.

The fingerprint spans descriptor + contract descriptor + the archetype component + the format helpers. The **non-determinism inventory is declared before the first diff** (Spec 123 §7 row 5, inherited). For the pilot the states are derivable today from **Spec 100 §2 item 6** (the miss contract — *"the shape drives the client state machine"*) plus items 3 and 5: `loading`, `hit`, `miss` (200 + `match:null` — **not** 404), `ambiguous` (200 + `candidates[]`), `unknown_parcel_id` (200 + nulls), `cost_menu_null`, `tier2_degraded` (`warnings[]` surfaced, Tier 1 intact), `error_400`, `error_403`, `error_429`, `error_500`, `offline`, `schema_drift`. (Spec 100 has no sub-section literally numbered §2.6 — §2 is a 9-item numbered Behavioral Contract; cited by item, not by a section number that does not exist.)

### 5.7 Arrow 7 — descriptor → generated docs

Precedent measured: **10** generated files under `docs/reports/generated/`, plus `npm run system-map`, `npm run db:docs`, `npm run logic-vars-docs`, `npm run lineage-docs`. Ruling R2 is already in force for the pipeline (`step.schema.json:5` — *"This file — not prose — is the single source of truth"*).

Applied here: Spec 100 keeps §1 (goal / user story), §5 (the documented subscription exception) and §8 (futures) as human narrative. §2's numbered behavioural contract and §3.2's field lists become descriptor data and are **deleted from prose** — a value in two places is a drift source, which §5.2 measured four times over.

## 6. Building the schemas directly in Supabase

> This section is the detailed answer to *"how do we build the schemas straight in Supabase?"* Every table the surfaces need is specified here as a **declare-and-assert** flow, not a generated migration. Spec 127 §2 turns it into PH-0/PH-1 procedure steps.

### 6.1 The declare-and-assert flow — the five steps, in order

For **every** table below, without exception:

| # | Step | Artifact | Gate |
|---:|---|---|---|
| **1** | **Declare** the table in git, as descriptor data — `database.tables[]` inside the owning CONTRACT (or JOB) descriptor: table name · every column with its SQL type, nullability and default · PK · FK targets · CHECK vocabularies as closed enums · the indexes, each with the declared read that justifies it · the RLS role matrix (§6.2) | `contracts/<slug>.descriptor.json` | AJV at construction; a descriptor that declares an unknown column type **refuses** |
| **2** | **Hand-author the SQL migration** under the existing `scripts/migrate.js` conventions — `NNN_[feature].sql` (the `schema_migrations` key is the **filename**, not a version; `migrate.js:44-49`), an `-- UP` marker, a **comment-only `-- DOWN`** (`-- UP`/`-- DOWN` are *comments*, not section directives — `migrate.js` runs the whole file as one transaction), a `WHY THIS EXISTS` header and `SPEC LINK:` lines; `-- ALLOW-DESTRUCTIVE` where Rule 1 demands it, `CONCURRENTLY` (or `-- CONCURRENTLY-EXEMPT`) for an index on a large table, and a `DEFAULT` on any `ADD COLUMN … NOT NULL`. The header **names the descriptor it implements** (`contracts/<slug>.descriptor.json#database.tables[i]`) — a path, not a hash | `migrations/NNN_*.sql` | `scripts/hooks/validate-migrations.sh` (marker existence, fail-closed on the **staged blob**) → `scripts/validate-migration.js` Rules 1/2/3/5/6 → `scripts/hooks/check-migration-down-comments.sh` (awk scan for uncommented DDL under `-- DOWN`). All three already run in `.husky/pre-commit` |
| **3** | **Apply and introspect** — `npm run migrate`, then `npm run db:generate` (which is `drizzle-kit introspect`, DB → TS, output `src/lib/db/generated/`) | `src/lib/db/generated/schema.ts` | migrate is idempotent and filename-keyed; re-running is safe |
| **4** | **Assert the round trip** — a `*.infra.test.ts` drift lock proving the **introspected TS types equal the declared schema**: every declared column exists with the declared type and nullability; every declared index exists; no column outside the declared set appears in the contract's response projection. Proven **both directions** with a RED canary (a fixture descriptor declaring a column that does not exist must fail) | `src/tests/surface-schema-drift.infra.test.ts` | `npm run verify` |
| **5** | **Seed the projection** — descriptor rows mirrored into Supabase by a seed script on the `apply-logic-variables.js` model, with a drift lock that the table equals the committed files (§6.4) | `scripts/seeds/apply-surface-descriptors.js` | run at deploy; drift-locked in CI |

**Why not generate the migration.** Measured: `npm run db:generate` is `drizzle-kit introspect` (`package.json:17`; `drizzle.config.ts:5` `out: './src/lib/db/generated'`) — the arrow already runs **DB → TS**, producing `schema.ts` (2,327 lines) + `relations.ts` (389). Reversing it would collide with three live hook gates and hand a generator authority over 244 files of hand-reviewed schema history whose `schema_migrations` key is the filename and whose integrity is a per-file SHA-256 (`migrate.js:60`, CRLF-normalised) surfaced by `migrate.js --verify`. Declare-and-assert is strictly cheaper, strictly more truthful, and reuses two mechanisms that already work. (`ASK-04` re-opens this only if a future table count makes hand-authoring the bottleneck.)

**⚠️ No new fingerprint is invented.** An earlier draft stamped a `DECLARED-SCHEMA-SHA256` into the migration header; it is dropped. This estate already has **two** integrity mechanisms and a third would be a third thing to keep in sync: `schema_migrations.checksum` (a per-file SHA-256, CRLF-normalised, `migrate.js:60`, surfaced by `migrate.js --verify` as DRIFT/MISSING) pins the **migration file**, and the golden `source_fingerprint` over `fingerprint_files[]` pins the **descriptor**. Between them, a migration that changed and a descriptor that changed are both already detectable. What was actually missing is the **assertion**, not another hash — which is why step 4 is the gate and the header comment is only a pointer.

The vocabulary half already has a strong precedent: `docs/specs/_contracts.json` mirrors SQL `CHECK` vocabularies (`entitlement_products`, `entitlement_statuses`, `scrape_outcomes`) and `src/tests/db/236_permit_scrape_outcomes.db.test.ts:117-130` already asserts *the live `pg_constraint` definition equals the JSON list*. Step 4 generalises that assertion from CHECK vocabularies to whole table shapes.

**⚠️ Migration numbering.** The highest migration on disk at authoring is **247** (`247_parcels_autovacuum_storage_params.sql`, 244 files total); the next free number is **248**. Spec 122 §7.5's reservation for the four pipeline state tables (`pipeline_intervals`, `published_batch`, `step_error`, `step_quarantine`) has been broken **three times** and its own text now says so — *"the next consumer should stop treating '245–248' (or '247–248') as license and instead run `ls migrations/ | tail -1` before claiming a number."* This spec inherits that instruction verbatim: every migration claims its number in the commit that writes it, after re-measuring.

### 6.2 RLS as descriptor data — classes, roles, and the role matrix

**Start from what Spec 114 actually says, not from an invented vocabulary.** Measured:

- Spec 114 is **class-based, not row-per-policy**. A table is **Class A** only if it is one of the **10** named user-owned tables the spec enumerates (§3.1's 8 + §3.2's 2), **Class C** only if it is `profiles`, and *"everything else is Class B by default — including tables added after this spec is written"* (§2, `:52`). Class B is `ENABLE ROW LEVEL SECURITY` with **zero policies** — deny-all — which is why *"Class B needs no per-table catalog entry beyond 'it's Class B'"* (`:189`).
- The Postgres role vocabulary is **`anon` · `authenticated` (owner / not-owner) · `service_role` · table owner** (§9 matrix, `:419-424`). **There is no `admin` Postgres role.** "Admin" is a *column flag* — `profiles.is_admin BOOLEAN` (`migrations/226_profiles_admin_bootstrap.sql:27`) — checked inside the policy predicate.
- Policy naming is fixed (§8, `:388`): `` `<table>_<operation>_<scope>` ``, lowercase snake_case, operation ∈ `select|insert|update|delete`, scope ∈ `own | own_admin | admin`.
- Live today: **26 `CREATE POLICY` statements** — **2** in `migrations/226` (`profiles_select_own`, `profiles_update_own`) and **24** in `migrations/230`; `231` declares **none** (it enables RLS on `admin_backup_codes` with zero policies, which is Class B by construction). **87** `ENABLE ROW LEVEL SECURITY` lines, 69 of them the Class-B default-deny sweep in `227` (whose own header records that its table list was **generated, not hand-authored** — *"Re-generate rather than hand-edit if the table list drifts"*: the precedent this spec's §4.3 flow extends).

**What is net-new, and it is exactly two things:**

| Role token | Exists today? | Disposition |
|---|---|---|
| `anon` | yes | unchanged |
| `user` (`authenticated` + `auth.uid()`) | yes | unchanged |
| **`agent`** | **no** | **NOT a DB role — an entitlement product** (`agent_reports`). A realtor sending a PDF to a client is a `user` holding one more product. It needs **zero** new policies: one widened `chk_entitlements_product` CHECK, one `stripe_price_product_map` entry, one string in `docs/specs/_contracts.json` — the same three grep-locked sites `parcel_tool` costs. A DB role for a billing distinction is a category error. (`R-09`) |
| **`advertiser`** | **no** | **A real role, and the reason a fourth class must exist.** It is the first principal scoped by a key that is *not* `auth.uid()` — `advertiser_id` via a membership row. **Class D** = *owner-scoped by a non-user key*, policies generated as `USING (advertiser_id = current_advertiser_id())`. (`R-10`) |
| `admin` | yes, as a flag | unchanged — `profiles.is_admin`, checked in-predicate, scope token `admin` / `own_admin` |

**The matrix is a seed file, on the `logic_variables.json` model** — `scripts/seeds/roles.json`, mirrored into `docs/specs/_contracts.json` under `schema.roles` and grep-pinned exactly as `entitlement_products` already is (`src/tests/contracts.infra.test.ts`). It declares, per table: its class (A/B/C/**D**), its owner column, and the per-role verb grants. Each new table in §6.3 carries its row.

**Per-table descriptor shape** (AJV-validated, and it names the class rather than re-deriving a predicate):

```
"rls": {
  "enabled": true,
  "class": "A",                       // A | B | C | D
  "owner_col": "user_id",
  "grants": { "user": ["select","insert"], "agent": ["select"], "admin": ["select"], "anon": "none" },
  "why_none": { "anon": "no unauthenticated read of usage" }
}
```

**Rules that are not negotiable:**
1. **`rls.enabled: false` is legal only with a stated `why`** plus a `checks[]` entry at `severity: FAIL` naming what protects the table instead. Silence is omission, and omission is a build failure (Spec 128 rule 6).
2. **Every role in the closed set appears**, including the ones whose answer is `none` — §4.2's rule applied to access control, where an unwritten `"none"` is most dangerous.
3. **The assertion reads the LIVE catalog, never the migration text** — `pg_policies` for the policy set, `pg_class.relrowsecurity` for the enable flag, `pg_roles` for the roles, plus a re-execution of `classifyRoute()` over all 61 route paths. It FAILS on: a table with RLS enabled and no declared class · a policy live but not in the seed · a seed row with no live policy · `surface.guards.session ≠ contract.guards.auth_class`. **Bidirectional**, like `generate-logic-variable-groups.mjs`.
4. **The generator EMITS a migration for human review; it does not apply one.** `seeds/roles.json` → a draft `migrations/NNN_rls_<scope>.sql` → the same hand review, the same `validate-migrations.sh` / down-comment gates, the same filename-keyed `migrate.js`. This is the easy mistake and the constraint that prevents it.
5. **The admin reads the same tables through RLS**, not around it — an `own_admin`/`admin`-scope policy per table, so the admin surface declares `guards.session: "admin"` and the *same* CONTRACT descriptor serves it. Admin-only columns are excluded by the contract's **response projection**, not by a second table. That is what makes "one contract, N projections" hold across the trust boundary and not merely across renderers.
6. **`docs/specs/00-architecture/114_rls_policy_catalog.md` stays the catalog of record.** New tables add rows there through the generated path, never by hand.

**⚠️ Two measured gaps this spec inherits rather than closes:**
- **The existing RLS suite is not wired to CI.** `supabase/tests/rls_class_{a,b,c}.test.sql` run under `supabase test db`, which appears in no `package.json` script and no workflow — the runbook records it as *release-gating, NOT per-commit*. The `rls-matrix.db.test.ts` lock above therefore lands as a **vitest `.db` test under `BUILDO_TEST_DB=1` / `npm run test:db`**, which does run, rather than as a pgTAP file that does not. (`ASK-08`)
- **`migrations/226`'s own comment records that the `prevent_is_admin_self_escalation` trigger is bypassable by the table owner**, with the proper fix (*"a dedicated non-owner elevated role with `REVOKE UPDATE(is_admin) FROM app_role`"*) filed as post-launch **D5**. A role-matrix page that renders a guarantee the DB does not enforce is worse than no page: D5 renders as a declared **`OPEN`** row on `/admin/roles`, never as an omission. (`R-11`)

### 6.3 The tables the surfaces need

Each row below is a **declaration to be authored**, not a schema shipped by this spec. Column lists are the recommended starting shape; the migration is written at the phase that needs it.

| # | Table | Why it exists | Key shape | RLS posture | Indexes justified by |
|---:|---|---|---|---|---|
| 1 | **`app_outputs`** | the materialised projection — the **ONLY** seam the app reads (§6.3.1) | `PK (subject_kind, subject_key, projection, version)`; `payload JSONB NOT NULL`; `built_at`; `source_fingerprint`; `pipeline_run_id` | writes are service-role only (the pipeline step writes it, **no client insert/update**); reads: `anon` select only where the public flag is set (the teaser path), `user` select, `admin` select | the REPORT surface's declared read: exact match on `(subject_kind, subject_key, projection)`; plus a partial index on the public flag for the anon teaser |
| 2 | **`usage_events`** | the one generic meter + observability spine (§7) | `PK (event_id)`; `user_id` **NULLABLE** alongside `session_id`; full shape and rationale in §7 | **Class A** on `user_id` for signed-in rows, plus **one** `anon` insert policy narrowed to `event = 'offer_impression'` (§7.1) | the quota read (`COUNT(*)` filtered by `user_id, product` over a computed period window) and the registry's 7-day usage column |
| 3 | **`entitlements`** *(widened, not new)* | the product gate | existing `PK (user_id, product)`; the change is **one migration widening `chk_entitlements_product`** to admit **both** new keys, `'parcel_tool'` (R-01) and `'agent_reports'` (R-09), in one statement | unchanged — Class A, `entitlements_select_own` | unchanged |
| 4 | **`advertisers`** | the advertiser principal — the membership row the `advertiser` role is scoped by | `PK (advertiser_id)`; `name`, `contact_user_id`, `active BOOLEAN` | **Class D** — `advertiser` select own (`advertiser_id = current_advertiser_id()`); `admin` select/insert/update; everyone else `none` | lookup by `advertiser_id` at policy-evaluation time |
| 5 | **`placements`** | the closed placement vocabulary — where a SLOT may render | `PK (placement_key)`; `surface_archetype`, `max_slots`, `disclosure_required BOOLEAN NOT NULL` | `anon` / `user` / `advertiser` select; `admin` all | read by placement key at projection time |
| 6 | **`offers`** | the inventory a SLOT renders — **a table, never a literal** | `PK (offer_id)`; `advertiser_id FK`, `placement_key FK`, `targeting JSONB`, `flight_start`, `flight_end`, `active BOOLEAN` | **Class D** — `advertiser` select/update own; `user` / `anon` select only active, in-flight rows; `admin` all | the targeting read declared by the SLOT surface: placement + active + flight window |
| 7 | **`pdf_exports`** | one row per generated export, and the share model | `PK (export_id)`; `user_id`, `subject_kind`, `subject_key`, `storage_path`, `bytes`, `parity_fingerprint`, `expires_at`, `recipient` | **Class A** — `user` select own; `agent` (a `user` holding `agent_reports`) select rows where they are `recipient`; `admin` all; `anon` `none` | lookup by `export_id` for the share route; `user_id + created_at` for the user's own list |
| 8 | **`surface_descriptors`** | the **seeded projection** of the git descriptors (§6.4) | `PK (surface_id)`; `archetype`, `platforms TEXT[]`, `descriptor JSONB`, `git_sha`, `seeded_at` | `admin` select; everyone else `none` — an admin registry, not product data | read by `surface_id`; listed by `archetype` for the registry page |
| 9 | **`contract_descriptors`** | same, for CONTRACT — and its `descriptor->'consumers'` is where the fan-out graph's edges live | `PK (contract_id)`; `archetype`, `descriptor JSONB`, `git_sha`, `seeded_at` | as above | the fan-out and orphan joins, both derived from `consumers[]` |
| 10 | **`archetype_registry`** | the closed archetype vocabulary, and which component renders it per platform | `PK (archetype, platform)`; `component_path` | `admin` select | the registry page; the unknown-archetype check (§3.5) |

**No `required_fields` column on `archetype_registry`** (R-27): the required-field profile has **one** home — the surface schema's `allOf` blocks, rendered into §3.1 by the generator. A copy in a table is a copy to keep in sync.

**Ten rows — and the count is that enumeration, not a number typed beside it.** Nine are net-new, each verified absent from `migrations/`, `src/` and `scripts/`: `app_outputs` · `usage_events` · `advertisers` · `placements` · `offers` · `pdf_exports` · `surface_descriptors` · `contract_descriptors` · `archetype_registry`. The tenth, `entitlements`, exists and changes by one widened CHECK. Every one follows §6.1's five steps: declared in git, hand-migrated, introspected, drift-asserted. **Names are fixed here, before the first migration** (`ASK-09` closed): `placements`, not `offer_placements`; `pdf_exports`, not `exports`. `migrate.js` is filename-keyed and DOWN blocks are comment-only, so renaming a table after it ships costs a new migration plus a data move.

#### 6.3.1 `app_outputs` — written by a converted pipeline step

`app_outputs` is **not** written by an API route. It is a **materialised projection written by a converted pipeline step at the end of chain `sources`** — a new step under the Spec 122 standard, with its own descriptor, its own `checks[]`, its own golden capture, and `outputs.write_discipline` declared per target. That gives the projection everything a route could not: an AJV-validated declaration, a run ledger row, a verdict derived from its own audit rows, and a golden differential when its shape changes.

Consequences, stated:
- The app reads **one** table for a projection, so a REPORT surface's contract is an exact-match lookup rather than a multi-table assembly at request time. That is the strongest form of MAX-SERVER-SIDE available.
- Freshness becomes a declared property: `app_outputs.built_at` plus the surface's `staleness` block, with a `checks[]` freshness entry — the pipeline's `checks[] { kind: "freshness" }`, reused.
- **The chain-position ruling is load-bearing**: the step runs at the END of `sources`, after enrichment, so the projection is never built from a half-enriched corpus. Registering it in `scripts/manifest.json` `chains.sources` is a Backend/Pipeline change and is **out of scope for this spec's Target Files** — it is Phase 2 work under the pipeline programme's own slot.
- Until that step exists, a REPORT surface reads its existing contract (`/api/parcels/lookup`) and declares `inputs.projection_source: "live"`; the cutover to `app_outputs` is a descriptor edit plus a recapture, which is exactly the property the golden fingerprint exists to force.

### 6.4 The seeded-projection tables and their drift lock

**Git is the source of truth; Supabase holds a projection. Nobody edits the table by hand.**

The mechanism exists: `scripts/seeds/logic_variables.json` → `scripts/seeds/apply-logic-variables.js` → the `logic_variables` table, invoked at the end of `npm run migrate`. Copy it, and copy the two lessons it paid for:

1. **LM-D15** (`2ced0763`) — a declared variable with no row now **throws**; the seed file is bootstrap only. Applied here: a descriptor with no `surface_descriptors` row fails the deploy gate.
2. **The DO-NOTHING blind spot** (WF3 cloud-parity FIX 1) — `ON CONFLICT DO NOTHING` can only ever INSERT a genuinely new key; a pre-existing row holding the wrong value survives silently with the same success line. **Therefore `apply-surface-descriptors.js` does NOT use `DO NOTHING`.** Descriptors are machine-owned, not operator-tuned, so the seed is `ON CONFLICT (surface_id) DO UPDATE` keyed on `git_sha`, and it **logs every row whose `git_sha` changed** — a value diff, not a count.

The drift lock is bidirectional, per §5.0: the table equals the committed files, and the committed files equal the table. A `surface_descriptors` row with no committed descriptor is as red as the reverse.

### 6.5 Supabase Storage — the PDF bucket

**Where the conventions live, measured:** Spec 113 (Supabase infrastructure) does **not** cover Storage — every occurrence is a service-name list, a topology sentence, a retired Firebase env var, or an off-Supabase backup target; the nearest thing to a convention is a *negative* (`:83`, "Supabase Storage bucket names are referenced per-call, not a global env var"). The conventions live in **Spec 114 §6** (`:310-344`), which states plainly at `:312`: *"**No Buildo feature uses Supabase Storage — or GCS signed URLs for user-facing file storage — today.**"* This spec is therefore the **first consumer** of Spec 114 §6, and it adopts that section's rules verbatim rather than inventing any:

| Aspect | Declaration | Source |
|---|---|---|
| Bucket | one bucket per render target, `surface-exports`, created **private** (`public: false` stated explicitly) | Spec 114 §6 `:320` — *"every bucket is created **private** (never `public: true`)"* |
| Creation | **via a tracked migration, never via the dashboard** — Spec 114 `:482-487` records dashboard creation as a named failure mode | Spec 114 §6 / D5 |
| Path template | `{auth.uid()}/{subject_kind}/{subject_key}/{export_id}.pdf` — **owner-namespaced first segment**, matching Spec 114's `<bucket>/<auth.uid()>/<filename>` shape; declared in the EXPORT contract's `storage` block, never string-built at the call site | Spec 114 §6 `:320` |
| Bucket policy | `bucket_id = 'surface-exports' AND (storage.foldername(name))[1] = auth.uid()::text` — Spec 114's template, unchanged | Spec 114 §6 `:325-336` |
| Access | **signed URLs with a declared TTL**, issued by the EXPORT contract; the `pdf_exports` row is the authority on who may request one. A bucket policy alone is not the gate — the route is, and the row is its record. The recipient is a `user` holding the `agent_reports` entitlement (R-09), not a new DB role |
| Retention | `expires_at` on the row + a SCHEDULED JOB that deletes expired objects and their rows; the JOB declares its `idempotency` and `audit_row` like any other |
| Ledger | every issue and every download writes a `usage_events` row (`event: pdf_send` / `export`), so the share path is metered and observable on day one — the opposite of the dead-meter defect |
| Parity | `pdf_exports.parity_fingerprint` is the golden fingerprint of the projection the PDF was rendered from. "100% data parity" is asserted by comparing it to the screen projection's fingerprint, not by discipline |

**Measured caveat:** `@aws-sdk/client-s3` is already a dependency of this repo, so S3 is an alternative substrate. Supabase Storage is recommended because the auth model (`auth.uid()` in a bucket policy) is the same one every other table uses, which keeps one role vocabulary rather than two. This is `ASK-07`.

### 6.6 Indexes — justified by a declared read, never by intuition

Every index in §6.3 names the surface-declared read it serves. The rule is the pipeline's P3 discipline (*disk I/O is adjudicated with numbers, never assumed*) applied to the surface estate, including EP-D17's extension to **read** cost: a declared check's scan cost is part of its price, and that price is stated against the target it actually runs on — production scale, production heap state — never a local sample. An index proposed with no declared read is rejected; a declared read with no index is a `checks[]` WARN with a measured `duration_ms` and a retighten condition.

## 7. The usage ledger — meter and observability spine

**There is no working meter to extend.** `POST /api/leads/view` holds the repo's only one — an atomic CTE inserting `lead_view_events` and incrementing `user_profiles.lead_views_count`, triple-gated to `action='view'` AND `lead_type='permit'` AND `subscription_status='trial'`. Its table is `lead_view_events(user_id, permit_num, revision_num, viewed_at, PK(user_id, permit_num, revision_num))` and **it structurally cannot hold a parcel id** — the route's own comment says so. And it has **no caller**. So model the new meter on the *shape* that was designed correctly (ledger + PK dedup + CTE) and add the two things the old one lacked: **a live caller, and a registry column that makes its absence visible on day one.**

**One generic table, not a second permit-shaped one:**

```sql
CREATE TABLE usage_events (
  event_id     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID            NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id   TEXT            NULL,   -- anonymous principal; exactly one of user_id / session_id
  product      TEXT        NOT NULL,   -- mirrors entitlements.product's CHECK vocabulary
  event        TEXT        NOT NULL,   -- closed: property_view | pdf_send | offer_impression | offer_click | export | parcel_id_translated
  subject_kind TEXT        NOT NULL,   -- closed: parcel_ref | parcel_pk | permit_rev | offer_id
  subject_key  TEXT        NOT NULL,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  meta         JSONB       NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT chk_usage_events_principal
    CHECK ((user_id IS NULL) <> (session_id IS NULL))
);
```

**Four properties earn their keep, each from a measured incident or a measured requirement:**

- **`user_id` is NULLABLE, paired with `session_id`.** A SLOT impression is the one event that happens before anyone signs in — the marketing landing page and the public teaser path both render offers to `anon`. A `NOT NULL user_id` would make anonymous impressions unrecordable, which is how an advertiser's impression count silently becomes "signed-in users only". The CHECK makes the principal **exactly one of the two**, so a row is never ambiguous about who it belongs to.
- **The PK is an event id, not a composite.** An earlier draft made the PK `(user_id, product, event, subject_kind, subject_key, period)` so a replay would write zero rows. That is right for a *view* and wrong for an *impression*: **impressions are counted per event**, and two impressions of the same offer by the same viewer in the same period are two facts, not one. A composite PK would silently collapse them and under-report what an advertiser is billed for. Dedup, where a given event needs it, is a **partial unique index scoped to that event kind**, declared per event in `seeds/usage-events.json` — not a property of the whole table.
- **`period` is derived at query time, never stored.** Storing a billing bucket in the PK bakes one billing calendar into every historical row; a quota read is `COUNT(*)` over a computed window on `occurred_at` (`date_trunc`, or the period the entitlement declares). This is the same lesson as the derived counter, one level up: a denormalised bucket is a second source of truth about *when*, exactly as `lead_views_count` was a second source of truth about *how many*.
- **`subject_kind` is required and closed** because this estate has two different things named `parcel_id`: `parcels.id` is `SERIAL` and `parcels.parcel_id` is `VARCHAR(20) UNIQUE` (the municipal id) — and the consumer API's `parcelId` is the *second* while `lead_parcels.parcel_id INTEGER REFERENCES parcels(id)` is the *first*. A bare `subject_key TEXT` would silently blend them. **R-04:** `parcel_ref` = the municipal string, `parcel_pk` = the serial.

**And the counter stays derived** — `COUNT(*)` over the window, never a column — which is the `lead_views_count` lesson and the reason R-23 exists.

### 7.1 The one `anon` write in the estate

`usage_events` carries exactly one insert policy for `anon`, and it is **narrowed to `event = 'offer_impression'` with `session_id IS NOT NULL`**. Nothing else may be written unauthenticated. This is stated here rather than left implicit because an `anon` INSERT is the kind of policy that, granted broadly, becomes a write endpoint nobody remembers granting — and §4.2's rule is that a permissive answer must be written down where it is most dangerous.

**Retire the dead meter.** `lead_view_events` / `user_profiles.lead_views_count` / `useLeadView` / `POST /api/leads/view` / the `PaywallScreen.tsx:153` branch are **one finding with two legal dispositions** — revive, or knowingly retire — and *neither has been chosen*, which is the defect. Under this spec the disposition is **knowingly-retired in favour of `usage_events`** (R-08), and per Spec 124 §4.2 a different party adjudicates it in its own WF3, with the paywall copy re-pointed at a `usage_events` count in the same commit.

**Entitlement side, measured:** `migrations/228_entitlements.sql:32-33` declares `CONSTRAINT chk_entitlements_product CHECK (product IN ('lead_gen', 'flight_center'))`. **One migration widens it to four, adding `'parcel_tool'` (R-01) and `'agent_reports'` (R-09) together** — they land in the same statement because they are the same change and splitting them would mean two migrations against one CHECK. Each key then needs its `stripe_price_product_map` entry (a JSONB logic variable seeded `'{}'` at `228:45-49`) and its string in `docs/specs/_contracts.json`'s `entitlement_products` array, which `src/tests/contracts.infra.test.ts` grep-pins against `src/lib/entitlements/index.ts:39` `PRODUCTS`. **Three sites, all already mechanically locked.** That is the whole change; `src/lib/entitlements/index.ts:42-43`'s `DEFAULT_PRODUCT = 'lead_gen'` comment, which records OD5's superseded default, is corrected in the same commit.

**The parcel gate today is not a meter:** `src/app/api/parcels/lookup/route.ts:46-59` is a boolean — `subscription_status ∉ {trial, active, past_due, admin_managed}` → 403, unlimited lookups otherwise, reading the *global* status rather than a per-product entitlement. Under R-01 it becomes an entitlement lookup **and** gains a meter.

</architecture>

---

<security>

## 8. Auth Matrix

| Role | Access |
|------|--------|
| Anonymous (`anon`) | May render only surfaces declaring `guards.session: "none"` **with a stated `why`** and a `disclosure` block. May read `app_outputs` rows flagged public (the teaser path) and active in-flight `offers`. **May INSERT into `usage_events` for `event = 'offer_impression'` only** (§7.1), keyed by `session_id`, because a SLOT impression can precede sign-in. No other `usage_events` write, no read of anyone's rows, no `pdf_exports`, no descriptor tables. |
| Authenticated (`user`) | Surfaces whose declared `guards.entitlement` matches a live `entitlements` row in an allowed status. Reads and inserts **own** `usage_events` rows; reads own `pdf_exports`. No descriptor tables. |
| Agent | **Not a DB role** (R-09) — a `user` holding the `agent_reports` entitlement product, plus read access to `pdf_exports` rows where they are the declared `recipient`, via a signed URL with a declared TTL. |
| Advertiser | **A real role, RLS class D** (R-10) — reads/updates own `offers`/`advertisers` rows scoped by `advertiser_id` (not `auth.uid()`); reads aggregate impression counts for own offers. No user-level `usage_events` rows. It is the first principal admitted to an admin-shaped surface (`advertiser_self_metrics`) **by RLS scope rather than by `is_admin`**. |
| Admin | All tables, **through an `own_admin`/`admin`-scope RLS policy rather than around RLS**. "Admin" is the `profiles.is_admin` column flag checked in-predicate, not a Postgres role. Admin-only fields are excluded by the CONTRACT's response projection, not by a second table. |

**The cross-check that does not exist today (§4.2):** `surface.guards.session` must agree with the auth class of every contract in `inputs.contract_ref[]`, as a `checks[]` entry at `severity: FAIL`. Measured live mismatch: `/builders` pages are `authenticated` by fail-closed while `/api/builders` is public.

</security>

---

<behavior>

## 9. Behavioral Contract

- **Inputs:** a SURFACE descriptor, its referenced CONTRACT descriptors, the archetype registry, and (at request time) the projected payload.
- **Core Logic:**
  1. AJV-validate the descriptor against `surface.schema.json` **before** anything renders — `additionalProperties: false`, all categories required, archetype profile applied. An invalid descriptor **refuses**, the way `pipeline.step()` does.
  2. Resolve `identity.archetype` in the registry for each declared platform; an unresolved archetype renders the declared fallback **and** raises a `checks[]` FAIL (§3.4).
  3. Evaluate `guards` — session, entitlement, flag, permission, rate bucket — before any projection is assembled.
  4. Assemble the projection **server-side** (RSC on web; a projection endpoint for mobile); apply `inputs.field_whitelist`, which must equal the contract's.
  5. Render through the archetype component set. No business logic executes client-side beyond the five named exceptions (§5.3).
  6. Write the declared `emits` — analytics events, breadcrumbs, and the `usage_events` ledger row where `metering` is declared.
  7. Run the declared `checks[]`; derive the verdict **from the resulting rows**, never a parallel boolean.
- **Outputs:** a rendered surface on each declared platform; a `usage_events` row where metered; a `surface_ledger` row; the golden PAIR when captured.
- **Edge Cases:**
  - *Unknown archetype* → fallback card + FAIL check (§3.4).
  - *Schema drift* (payload fails the generated Zod mirror) → declared `schema_drift` state, an error class in `errors`, and a FAIL check; never a blank screen.
  - *Entitlement missing* → the declared `on_missing` (402 \| 403 \| paywall), covering every value of the governing closed set.
  - *Offline* → the MMKV projection renders; `states[]` must include `offline` on LIST.
  - *Metered action replayed* → the `usage_events` PK absorbs it; zero rows written, no error.

## 10. Observability and visualisation

**The surface registry page — `/admin/surfaces`, generated from descriptors.** One row per surface, every column derived, nothing typed:

| Column | Source |
|---|---|
| surface · archetype · `platforms` · projection | `identity` |
| contracts read/written | `inputs.contract_ref[]` / `outputs.contract_ref[]` |
| tables (transitively) | the referenced CONTRACT descriptors' `database` |
| entitlement + statuses | `guards.entitlement` |
| declared states · golden freshness | `states[]` + fingerprint freshness |
| checks pass/fail | last `surface-validate` run |
| events emitted | `emits` |
| **usage, last 7 d** | `SELECT count(*) FROM usage_events WHERE …` |
| unconsumed? | a contract with zero `sharing.surfaces` entries renders **red** |

**Three visualisations the census says are worth building:**
1. **The contract fan-out graph** — 61 contracts × their consumers, with the *idiom* labelled per edge. This is where a transcription, or a bypassed mutation hook, is *seen* rather than discovered.
2. **The orphan panel** — the 17 zero-call-site contracts and the 13 no-contract surfaces, produced by one join. One row on it (`/api/leads/view`) is this programme's headline finding.
3. **The state-ownership matrix, rendered** — Spec 99 §3 as data with the `check-spec99-matrix.mjs` verdict attached. It has a checker; it has never had a reader.

**Deferred:** the React Flow node-graph (§0.2). Re-opens as `ASK-05`.

## 11. The pilot — `parcel_detail` (REPORT)

`mobile/app/(app)/parcel-tool/[parcelId].tsx` (231L), with its web and admin twins.

1. **Lowest risk in the estate** — `outputs: "none"`, no Layer-3 store (`:5` — *"Read-only; NO Layer-3 store"*), one query key with one param, zero writes, zero migrations, zero pipeline change. The same reason `assert_schema` — the archetype that forces three categories to `"none"` — was pilot 1 on the pipeline side.
2. **The server-side projection already exists** — `CONSUMER_HEADLINE_COLS`, 16 named columns, an explicit pick-by-name assembler at `src/lib/parcels/consumer-lookup.ts:33`, with tier-stratified degradation. Max-server-side is a *short* move here.
3. **It proves `sharing` on day one** — three renderings of one payload already exist (mobile search 115L, mobile detail 231L, admin tool 425L = **771 hand-written lines**), which is the fastest possible refutation of "one contract, N projections" if it is wrong.
4. **It is the operator's own metered product**, so `metering`, `offers` and `usage_events` land where they are needed rather than on a surface that will never bill.
5. **It has a real, unguarded defect to close** — `src/tests/parcel-cost-line-keys.logic.test.ts:4-13` records that the admin tool shipped broken from its first commit (`4b1712ff`): three cost lines rendered *"n/a — not computable"* on 100% of 486K parcels with a green UI suite, because the fixture was authored against the wrong keys. That test closed the admin side; **the mobile side is today in exactly the pre-fix state.**
6. **It is the only surface where the archetype is genuinely new** — REPORT does not exist in the pipeline's 8, so the pilot also proves the UI-only-archetype ruling.

**Pilot scope:** REPORT + SLOT + EXPORT + GATE — the property preview surface, its sponsor slot, its PDF render target, and the entitlement gate in front of it. Four archetypes, one screen, one contract.

**Budget, stated up front (the P3 discipline).** No descriptor in this repo is under 200 lines; the smallest real one is **388** (`scripts/compute-centroids.descriptor.json`), the largest **8,225**. Fifty-three surfaces at 388 lines is ~20,000 lines of declaration. **The archetype required-field profiles are the only mechanism that keeps that from being 53 × 400 lines of `"none"`.** A REPORT should answer perhaps 12 of the categories in substance and `"none"` the rest in one line each. **Kill criterion, declared before commit 1: if the pilot descriptor lands over ~250 lines, the profile design is wrong.**

## 12. Phases

**There is ONE sequence in this programme, and it lives in Spec 127 §4.4** (batching by archetype). The table below is that sequence rendered at spec altitude — same rows, same order, same ids. It is not a second plan: if a batch moves, it moves in Spec 127 and this table follows. The one thing stated *here* rather than there is the rule that reordered it.

**The rule: guardrails are Phase 1, not Phase 4.** Spec 125 §6 put them last. The estate's own evidence says a guardrail added after the fact guards nothing that already shipped — a 153-line meter with 44 green tests and no caller; a drift checker nothing runs; four workflow headers claiming a `schedule:` was commented out while all four were live.

| Phase | Spec 127 §4.4 id | Deliverable | Gate |
|---|---|---|---|
| **P0** | — (pre-batch) | Close the nine unaudited admin mutations: one `writeAdminAudit` call per site, audit-failure fails the request, plus a lock asserting *every* mutating `/api/admin/**` export writes a row. One WF3, nine sites. Adjudicate the six genuinely-uncalled `/api/admin/*` routes in the same pass (`ASK-13`) | `admin_audit_log` covers 15/15; the lock proven both directions |
| **P0b** | — (pre-batch) | Wire the checkers that already exist: `mobile/scripts/check-spec99-matrix.mjs` into `mobile-ci.yml`; correct the four stale `schedule: committed COMMENTED OUT` workflow headers (all four chain crons are live) | the checker runs somewhere |
| **P1** | — (foundation) | `surface.schema.json` + `contract.schema.json` + `job.schema.json` with the archetype `allOf` profiles; the archetype registry as data; `surface-validate.mjs` seeded from the three existing mobile lint tests; the golden-PAIR harness; **`seeds/roles.json` + RLS class D**; **the `surface-exports` Storage bucket per Spec 114 §6** (R-31); the boundary lint rules; `generate-spec-mirror.mjs --check` wired into `npm run verify`. **Deliverable is the schema + validator, not a converted surface** | Spec 127 §3 S0–S9 pass on a fixture surface; every RED canary fires |
| **P2** | **B1 — REPORT** | `parcel_detail` → REPORT (+ SLOT + EXPORT + GATE), full nine-commit form; the generated mobile Zod mirror replacing the four-site transcription; `usage_events`; the single `chk_entitlements_product` widening (`parcel_tool` + `agent_reports`); **`pdf_exports`** and the export parity golden; `app_outputs` declared (its pipeline step is the pipeline programme's slot); `parcel_id_translation` declared with `consumers: "none"` | the pilot's generated scorecard ≥14/17 with S6–S8 full; S-parity and S-schema green |
| **P2b** | **B1a — the admin generated core** | `admin_surface_registry` → `/admin/surfaces`, 100% generated, staleness lock + RED canary; then fan-out, orphans, drift, role matrix on the same engine | the page is visibly empty or wrong if the descriptor set is incomplete — that *is* the gate |
| **P3** | **B2 — SEARCH + DETAIL** | `parcel_search` → SEARCH; `admin/parcel-cost` as the third projection of the pilot's contract; `permits/[id]`, `builders/[id]` — **and close the `/builders` auth mismatch first** | per-archetype eligibility declared, not assumed (§12.1) |
| **P4** | **B3 — DASHBOARD + LIST** | `admin/market-metrics` (the cleanest DASHBOARD member), `admin/users`, `admin/lead-feed` | tiles and lists degrade independently by declaration |
| **P5** | **B4 — FORM + WIZARD_STEP (rebuild)** | `settings` and the 8 `(onboarding)` screens — resume/skip/advance logic is entirely client-side today, the purest example of business logic max-server-side wants back | S7 full; the rebuilt logic is server-projected |
| **P6** | **B5 — GATE / SLOT / STATIC / SHELL** | the paywall family, `SponsorSlot`'s remaining placements, the landing page, AuthGate | AuthGate is the sole routing authority and converts last |
| **P7** | **(web projection)** | the RSC renderer over the same descriptors; the public-route decision; the MaxBLD consumer surface | one contract, three surfaces, visible to a customer |
| **never** | **(fenced)** | `mobile/app/(auth)/{sign-in,sign-up,confirm}.tsx` (1,302 lines) — they talk to the Supabase Auth SDK, not to our contracts | — |

### 12.1 What the pilot must carry, because it cannot be deferred

Three things an earlier draft scheduled *after* the pilot and that have to move *with* it, because the pilot cannot be honestly gated without them:

1. **Roles, class D and `seeds/roles.json`** — the pilot ships a SLOT, a SLOT reads `offers`, and `offers` is the first Class-D table. Landing the role model afterwards would mean the pilot's own RLS is unasserted at the moment it is reviewed.
2. **The Storage bucket** (`ASK-07` ruled → R-31: Supabase Storage, private, created by migration, Spec 114 §6's conventions unchanged) — the pilot declares `render.targets: ["screen","pdf"]`, so S-parity has nowhere to write without it.
3. **`pdf_exports`** — the same reason: the parity fingerprint needs a row to live on.

**And the honest consequence for R-PACE-1.** The pilot converts `SponsorSlot`, which is the estate's **only** SLOT member today (n=1, §3.1). So after B1 the SLOT archetype has **one** proven member, not two, and the compressed 3-commit form is **not** unlocked for it — the remaining SLOT placements in B5 land in full form unless a second member appears first. The same applies to **SEARCH**: B1 contains no SEARCH member, so SEARCH is not eligible at B2 and `parcel_search` converts in full form. Eligibility is declared data per Spec 127 §4.4, and these two rows are the reason it is declared rather than assumed.

**Placement.** P0–P2b touch no `scripts/` step file and can run on the Admin / Cross-Domain slot in parallel with the pipeline programme's batch conversion. The `app_outputs` pipeline step (§6.3.1) and anything else under `scripts/` waits for the pipeline slot.

</behavior>

---

<testing>

## 13. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic:** `*.logic.test.ts` — archetype profile resolution (each archetype's required-field set, and that a missing required field throws); `platforms[]` gating; the `surface.guards.session` vs `contract.guards.auth_class` cross-check, proven both directions against the measured `/builders` mismatch; `usage_events` PK dedup (same input twice writes one row); the generated Zod mirror set-equalling the engine's `PARCEL_COST_LINES`.
- **UI:** `*.ui.test.tsx` — every archetype renderer against its golden rendered-tree snapshot, per declared state; the unknown-archetype fallback rendering **and** raising its FAIL check; the `schema_drift` state rendering rather than blanking.
- **Infra:** `*.infra.test.ts` — `generate-spec-mirror.mjs --check` clean (mirror drift); descriptor↔`surface_descriptors` bidirectional seed drift; the declared-schema ↔ introspected-types drift lock of §6.1 step 4 including the stamped `DECLARED-SCHEMA-SHA256`; declared RLS policies equalling `pg_policies` in both directions; **a RED canary per lock**, on the `logic-variable-groups.infra.test.ts` tampered-file model, proving each check fires.
<!-- TEST_INJECT_END -->
</testing>

---

<constraints>

## 14. Operating Boundaries

### Target Files
- `docs/specs/02-web-admin/126_maxbld_surface_standard.md` — this spec
- `docs/specs/02-web-admin/127_surface_conversion_procedure.md` — the procedure
- `docs/specs/02-web-admin/128_surface_standard_policy.md` — the policy register
- `scripts/violations/generate-spec-mirror.mjs` — the mirror generator (`--check`, `--self-test`)
- *(Phase 1, not yet authored)* `src/surfaces/_schema/surface.schema.json`, `src/surfaces/_schema/contract.schema.json`, `src/surfaces/_schema/job.schema.json`, `scripts/surfaces/surface-validate.mjs`, `scripts/seeds/apply-surface-descriptors.js`

### Out-of-Scope Files
- `scripts/steps/_schema/step.schema.json` — the pipeline's contract; this spec MIRRORS it and must never edit it. "Step" keeps its pipeline meaning; the engine is `SurfaceEngine`.
- `scripts/manifest.json` and every `scripts/**/*.descriptor.json` — the `app_outputs` step (§6.3.1) is Backend/Pipeline work on the pipeline programme's own slot.
- `scripts/dispatch-notifications.js` (and `scripts/lib/push-dispatch.js`) and `scripts/classify-lifecycle-phase.js` — named in §3.3 **only** as the two measured members of the JOB archetype `DISPATCH`, to show the archetype is not empty. Both are chained pipeline steps governed by Spec 101 / Spec 84 and the Spec 122 standard; this spec describes their shape and edits neither. A JOB descriptor for either is Backend/Pipeline work on the pipeline programme's slot, gated on `ASK-01`.
- `migrations/**` — no migration is authored by this spec; §6 specifies the flow, the phase that needs a table writes it.
- `mobile/app/(auth)/*.tsx` (1,302 lines) — these talk to the Supabase Auth SDK, not to our contracts; a descriptor would be describing someone else's protocol. Deliberately out of scope.
- `docs/specs/03-mobile/100_mobile_parcel_cost_tool.md`'s scope fence — Spec 100 stays fenced: **no linkage to LeadDetail, the flight board, or the lead feed.** `lead_parcels` is read by no surface. Only a declared **id-translation seam** exists (`lead_parcels.parcel_id` = `parcels.id` = `parcel_pk`; the consumer API's `parcelId` = `parcels.parcel_id` = `parcel_ref`), declared so a future non-fenced use cannot invent a fifth vocabulary.
- `src/app/api/quality/**`, `src/lib/quality/**` — held by another programme.

### Cross-Spec Dependencies
- **Relies on:** Spec 122 (+122a) §1.2/§1.3/§1.10 (the 20-category contract and the archetype-gating mechanism this spec mirrors) · Spec 123 §6/§7 (the gate ladder and commit form Spec 127 mirrors) · Spec 124 §2/§4/§5 (the rules, the ruling protocol and the register Spec 128 mirrors) · Spec 90 §3 (Dumb Glass — the posture this spec makes enforceable) · Spec 99 §2/§3/§4/§7.7/§8.6 (the state matrix that becomes the `state` category) · Spec 100 (the pilot surface and its fence) · Spec 116 §4 N2/N3/N5 + §5 OD3/OD5 (OD5's recommended default is *"fold into `lead_gen`"* with the stated override *"Override if the parcel tool should gate separately from day one"* — R-01 exercises that override, legitimately, and supersedes `DEFAULT_PRODUCT`'s OD5 comment at `src/lib/entitlements/index.ts:42-43`) · Spec 117 (brand; the rename is BREAKING and rides the migration, so the product key is `parcel_tool`, not a brand string) · Spec 26 §3.4 (the 87-table auth/disclosure ruling §4.2 cites) · Spec 113/114 (Supabase infrastructure and the RLS policy catalog §6.2 extends) · Spec 48 §3.6 (the observability rows the admin side lacks)
- **Consumed by:** Spec 127 (the conversion procedure) · Spec 128 (the policy register) · the product spec that will own offers + EXPORT + metering · Spec 125 (**superseded by this spec**)

</constraints>
