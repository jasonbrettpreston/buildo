# SPEC 126 — MaxBLD Surface Standard (the surface descriptor as contract)

> **Status: DRAFT** — Authorized for McFrontend Phase 1 only (card answer Q-FE a: "A Spec 126-128 plan is authorized as documents only, named McFrontend. ... The build starts after McBylaws increment 2 closes"; scope mobile, web, admin and PDF). Phase 1 = the REPORT section (§11a) and the report-page conversion only. Every other phase stays "Not authorized for implementation" until touched for a product reason (card answer Q-MFS a: "Other screens convert only when touched for a product reason"). Companion specs, RULED 2026-11-04 (Q-MF1 a): 135 (decisions register) and 136 (generated handbook), in docs/specs/02-web-admin. Source of the rulings: `~/Buildo-scratch/mcfrontend/CARD-Q-FE.answered.md`.
>
> Dated note 2026-11-09 (McFrontend Phase 2 (expansion); prior text kept, M-246; operator, verbatim: "D-0-D-4 approved D-3 we should used our existing components and approach as detailed in the mobile build specs" and "1. confirmed 2. approved 4. D-7 yes Mb-86 yes if complaint and grounded 3. explain in more detail"; record `~/Buildo-scratch/mcfrontend/phase1/open-questions.md`, "Operator rulings 2026-11-09: programme card v2.1 Part A, D-9" and "Operator rulings 2026-11-09: Part B confirmed, Spec 126 standard section, MF-20 D-7"): authorized also for **McFrontend Phase 2 (expansion)**: every MaxBLD page on one standard (§11b; D-0). Phase 2 surfaces are those listed in §11b.3 (queue rows MF-35, MF-37..MF-50, MF-30). The 2026-11-02 infra freeze is lifted by name for Phase 2, including the library dependencies and the Spec 33 amendment (D-1). Web first; the separate mobile app, checkout and the maxbld.ca front door are LATER, triggered rows. Other screens stay convert-on-touch; scope D stays fenced (Spec 128 R-03).
>
> Prior status line (2026-09-15, kept, M-246): authored 2026-09-15 (WF1, Admin domain). Not authorized for implementation. A WF1 plan with PLAN LOCKED gates every phase below; `.cursor/wf1_spec126_128_active_task.md` is the authoring plan this spec was written under.
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

### 0a. The six principles (McFrontend, added 2026-11-04)

Operator verbatim, Q-MFP: "Q-MFP a". The card text of the six, adopted by that answer:

1. **Declared, not coded:** a screen is a descriptor; the only code is the shared archetype components; a new scenario reaches the report with no code.
2. **Proven, not reviewed (no errors):** every declaration is checked against the live contracts and the McBylaws catalogue, with golden render states and both-directions locks; observability (usage and drift in-product, Spec 126 P6/P8) sits inside this.
3. **Fast:** a performance budget per archetype (load, payload) for the user; for the team, a new field or scenario ships in hours.
4. **Single source:** the front end may show more, never derive differently (Spec 126 P2); every number comes from McBylaws; no maths in the UI.
5. **Honest display:** disclosures, confidence, "at least", not_evaluated and not_modelled always shown, never hidden; status words come from a closed list.
6. **Same everywhere:** mobile, web, admin and PDF render the same declaration; parity is a test (Spec 128 Rule 15).

Each principle has a Lock in Spec 135 (FE-02..FE-07). The principles table of §2.2.1 reads P2 = no derive differently, P6 = drift shown in-product and P8 = orphans (not "usage"); the operator's "P6/P8" is kept in the operator's words, with no gloss.

### 0b. How McFrontend work is done (the working standard, added 2026-11-11)

Operator, verbatim (2026-11-11): "just to be clear - we are using the queu rules/system, wiring the pages - using a standardized approach with minimal code - I just want to make sure we are not randomly making stuff up or doing it on the side - we dont want a mess at the end - complaince to a standard always - wiring - testing etc. this standrd needs to be written down and we make decisions which are sotres.. rulling and we cite the rulings alwsy." and "x-1 a of course, x-2 a x-3 a x-4 a - build this into McFront-end specs and rulings and handbook". Record: `~/Buildo-scratch/mcfrontend/phase1/open-questions.md`, the last two 2026-11-11 entries. M-246 form: nothing above is changed. This section gathers rules that already exist and points to each by spec and line (read at `e088bf072`); it restates none of them. Items 7 and 8 write down two working rules that until now lived only in the operator's words and the scratch logs. When this section and a cited rule disagree, the cited rule governs and the gap goes to the operator.

1. **Queue row first.** No McFrontend work starts without its row in `.cursor/MCFRONTEND-QUEUE.md` ("A task not listed here is not done", `.cursor/MCFRONTEND-QUEUE.md:3`). Wider scope than the row is a new row, not a longer brief (Spec 08 §11.9 TKT-1, `08_agents.md:494`).
2. **The Spec 08 lane process, per row.** Plan with its tests written in (`08_agents.md:464`, §11.4) → PLAN panel (`08_agents.md:299`, §6.4; §11b.5 below, "Spec 08 PLAN and OUTPUT panels per row") → one decision list to the operator, answers recorded verbatim (item 6) → pre-registration committed alone before the code (`prereg-MF-n-k.json`, Spec 128:171 and :183) → red first, each lock proven in both directions (`08_agents.md:461`, §11.3; Spec 127:124, PH-7) → build on the current tip through the real hooks → OUTPUT panel (`08_agents.md:471`, the lean pair; the frontend nuance `08_agents.md:472`, §11.5-FE) → one full suite on the current origin tip before "ready" (`08_agents.md:488`, MCINC-4) → the operator pushes (the pre-push "Approve this push? [y/N]", `scripts/analysis/mcbylaws/gate.mjs:543`).
3. **Screens are declared as data and drawn by the shared bindings; no page code.** Every page is descriptor + content + standard components configured by schema (§0a principle 1, :59; §11b.1, :880-882; Spec 135 FE-02, FE-24, FE-31). Every value binds through the closed binding set (§11a.1; FE-18, FE-27, FE-32). Operator, verbatim (2026-11-11): "just to understand for the McFrontend and the web pages we are still using schema's and no code. except all recommendations".
4. **Existing components only.** Every build reuses the existing components, bindings and patterns; nothing new is built where an existing one serves (operator, verbatim, 2026-11-11 morning: "also we should be building anything just using existing components"; §11b.1, :881; the import boundary of FE-31). The first use of an archetype on a platform pays only the §11b.5 costs; a new library, a new component kind or a new binding outside §11b.5 is an operator ruling before it is built.
5. **The server formats every value; the UI does no maths.** FE-05 (Spec 135:27); a page part is the server-formatted string as sent, and a number throws (FE-34). A display transform lives on the server or in content, never in a binding.
6. **Every operator ruling is recorded verbatim, dated, landed and cited.** The operator's own words with the date and the record path ("Operator verbatim" = the operator's own words, Spec 135:3); landed as a Spec 135 FE row with one lock (Spec 135 rules 2, 3 and 5) or as a dated note with the prior text kept (M-246, `69a_mcbylaw_register.md:141`); cited by every commit, prereg and lock that relies on it (the `McFrontend-Task:` trailer and the prereg `rules[]`, each RULED, Spec 128:170-171; the `Operator-Ruling:` line, as on the landed lane commits). A ruling does not stay only in a scratch file: it lands with its row's next docs commit or a lane R docs commit.
7. **Pre-approved decisions are logged and confirmed.** Operator, verbatim (2026-11-08): "I can pre-approve some decisions - that meet the folloowing conditions (1)  compliant (show citations),standardized (follows similar rules) observable, understandable - no scope creep and simple. Finally you have high level of confidence with the decision.  I need to see the decisions made and how they met the criteria in the morning". The orchestrator takes such a decision only when all six hold, each with its evidence, and logs it with a D-nn id in the dated pre-approval log (`~/Buildo-scratch/DECISIONS-PREAPPROVED-20261108.md`); never for a push, a DB job, a night go, a spec amendment, a protected-path change or the reversal of a ruling. The operator confirms the log (e.g. "2 y" for D-37..D-39, 2026-11-11), and a landing cites "pre-approved D-nn" (the form of the §11b.2 dated note 2026-11-10, :907).
8. **Scratch mocks are design inputs only.** Mocks, briefs, Stitch exports and research in `~/Buildo-scratch/` are references, never copied into the repo (§11b.7 report sub-note item 5, :1058). Anything in a Stitch export with no source (a ruling, a spec, a setting or a DB field) is left out and is not raised as a decision (operator, verbatim, 2026-11-11: "dont worry about things in the stitch screen that have no source - dont add them - its just an example - not law").
9. **No rule, no decision on the side.** Where no rule governs, the nearest related rules are cited and the question goes to the operator as a ruling (Spec 135 rule 1: a different party adjudicates).
10. **Testing.** Goldens per state per target and one render smoke per archetype per platform (FE-31, FE-33); the gate `surface-validate.mjs --check` (FE-13); the McFront proof canaries (FE-15). Dated note 2026-11-12 (M-246, prior text kept; McTest · McFrontend queue · lane R; MF-78..MF-82; operator, verbatim: "All recommendations accepted as long as they are complaint and are standardized, observable, scalable, accurate and understandable ie simple and understandable.  Ensure the least amount of code and use schema's", McTest D-1..D-14 all (a); Record `~/Buildo-scratch/mcfrontend/phase1/open-questions.md`, "McTest + MF-46 rulings (2026-11-12)"; plan `~/Buildo-scratch/mctest/PLAN.md`, `scenarios.yaml`, `DECISIONS.md`): testing also proves the real app is wired, end to end, by McTest (FE-40). The cases are rows of one catalogue, `tests/e2e/scenarios.json`; each names its owning task and a status, and a step whose task is not built shows as WAITS. The runs use a separate local test stack and seeded users, never the dev DB on 127.0.0.1:54322. Layers: API journeys and a dead-wire crawler (MF-79), the lot sweep (MF-80), stress and failure drills (MF-81), phone runs (MF-82). One results page and failure cards are written under `~/Buildo-scratch/mctest/runs/` for the orchestrator to route; McTest never edits a queue file. Lock: `src/tests/mctest/catalogue.infra.test.ts`.
11. **Navigation is a route.** Dated note 2026-11-11 (M-246, prior text kept; navigation lock · McFrontend queue · lanes G and R; MF-75). Operator, verbatim (2026-11-11): "with impeccable review - can we ensuring all novaigation buttons use actual components or router pushes rather than local state toggles", then "yes" to landing the lock now with the six known violations as named exceptions, each tied to the task that will fix it (MF-46, MF-48/MF-74, MF-49), and to writing this item. Record: `~/Buildo-scratch/mcfrontend/phase1/open-questions.md`, the two 2026-11-11 entries; audit `~/Buildo-scratch/mcfrontend/NAV-AUDIT-20261111.md` (70 controls: 6 violations, 13 flags). It extends §5.3 item 5 ("`expo-router` owns which route is mounted") to every MaxBLD screen, web and mobile. A control that takes the user to another screen or view uses the platform's router: web `<Link>` (or Mantine `Button component={Link}`), `redirect()`/`notFound()` on the server, `router.push/replace` after an action; mobile expo-router `router.push/replace/navigate`, with `router.canGoBack()` before `back()`. A view is never swapped by local state: if Back should undo it, or someone could link to it, it is a route (a path or a search param). Local state is for disclosure only: details panels, How?, sheets, dialogs, modals, selection and edit modes, and the result of a submit. A tab switch uses `navigate`, not `push`. Every pressable that navigates has a role and a name. Leaving the origin (Stripe) uses `window.location`. Lock: `src/tests/surfaces/nav-by-route.logic.test.ts` (rules NAV-1 state-as-route, NAV-2 non-semantic control, NAV-3 unnamed navigating pressable, NAV-4 location hack, NAV-5 back with no `canGoBack`, NAV-6 web button that navigates). Its allow-list is fail-closed both ways (an unexplained finding fails; an entry that no longer matches fails) and holds the six violations as exceptions, each "owed: <row>": audit #3 the report detail Back chevron (MF-48 Stage B / MF-74), #15 and #16 the mobile sign-in email form and its Back, #22 the sign-up "Sign in" link (MF-49), #29 and #30 the web `LoginForm` sign-in/sign-up swap (MF-46). It also lists the disclosure the rules reach (the report toggle wrapper, the phone sheets) and the audited flags they reach (#10 MF-53; #45, #46 MF-44/MF-52), each with its reason and owner. The owning row removes its entry in the commit that fixes the control. Two sentences above are convention, not checked by the lock: a tab switch uses `navigate` (the audit flags #1, #6, #12, owed by MF-49/MF-50, MF-35/MF-52, MF-51/MF-52), and the one origin exit (Stripe, `window.location.assign`) is an `ok` allow-list entry of NAV-4. Register row: owed, FE-36 (reserved; FE-35 is MF-62's, not yet in the register, and the Spec 136 generator refuses a gap in the FE numbering, `scripts/surfaces/generate-surface-handbook.mjs` `readFeRows`); until FE-35 lands this item is the row's home. Row text to land: "| FE-36 | Navigation is a route: a control that moves the user uses the platform router (web `<Link>`, `redirect()`, `router.push/replace` after an action; mobile expo-router with `canGoBack()` before `back()`); a view is never swapped by local state; local state is disclosure only; a navigating pressable has a role and a name; leaving the origin uses `window.location`. | 126 §0b item 11; 126 §5.3 item 5 | D pass, P pass, F n/a (no payload), S pass (one mechanism per platform), H n/a, E pass (web and mobile) | Operator, verbatim (2026-11-11): \"with impeccable review - can we ensuring all novaigation buttons use actual components or router pushes rather than local state toggles\" and \"yes\". Record `~/Buildo-scratch/mcfrontend/phase1/open-questions.md`. | RULED 2026-11-11, lock landed (MF-75). Lock: `src/tests/surfaces/nav-by-route.logic.test.ts` |".

Register row for this section: owed, FE-40 (reserved). It lands once FE-35..FE-39 are in the register, since the Spec 136 generator refuses a gap in the FE numbering (`scripts/surfaces/generate-surface-handbook.mjs` `readFeRows`); until then this section is the home and Spec 135 FE-02 and FE-31 carry dated notes pointing here.

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

> Dated note 2026-11-04 (McFrontend Phase 0; prior text kept, M-246): counts are the 2026-09-15 census; the generated registry is the live count (`docs/reports/generated/127-surface-registry.md:20` read 73 surfaces, 62 contracts, 6 jobs at `ac9200aa8`); do not restate a count in prose. The reconcile and generation work is deferred to convert-on-touch (MF-31, `.cursor/MCFRONTEND-QUEUE.md`).

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

> Dated note 2026-11-09 (M-246, prior text kept; spec review R-6 (i)-(ii), `~/Buildo-scratch/mcfrontend/PROGRAMME/SPEC-REVIEW-mobile-web.md`; operator, verbatim: "D-0-D-4 approved", D-2): (i) `login`, `subscribe*` (registry S-050..S-053) and `auth/callback` in the admin row are web-only customer pages in scope C (§2.0), not admin pages; `dashboard` is scope D (S-069). (ii) shadcn/ui is not installed (Spec 33:44); per D-2 the web and admin archetype set is Mantine 9 + `@rjsf/mantine` + `mantine-datatable` (§11b.4), which supersedes "Shadcn/Tailwind" in the admin row.

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

> Dated note 2026-11-09 (MF-42 · McFrontend queue · lane G; M-246, prior text kept; operator, verbatim: "P42 decisions approved" and "approved smaller version"; record `~/Buildo-scratch/mcfrontend/phase1/open-questions.md`, "Operator ruling 2026-11-09: MF-42 decisions"; Spec 128 §4 route, recorded under Spec 135 FE-31): the FORM and LIST profiles gain, in `scripts/surfaces/_schema/surface.schema.json`: a `status: "generated"` FORM MUST carry `render.form` (a contract `schema_ref` plus a closed field list; widgets text, textarea, number, select, checkbox, date, file, hidden); a generated LIST MUST carry `render.list` as an object, and with `render.projection: "list"` its `columns` (field, content-key label, display text/boolean/enum, optional sort_field); a generated surface has no golden `"none"` or `UNRESEARCHED`. The generated table above is NOT regenerated: its mirror `scripts/violations/generate-spec-mirror.mjs` throws at the tip ("an x-profile block names no archetype"), so this note carries the new MUST until the mirror is fixed (follow-up, `docs/reports/review_followups.md`). The closed render vocabulary grows only by the 128 §4 route; the FE-31 lock case C-7 is its lock.

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
5. **Navigation position** — `expo-router` owns which route is mounted. Dated note 2026-11-11 (M-246, prior text kept; MF-75): §0b item 11 ("Navigation is a route") extends this to every MaxBLD screen, web and mobile; lock `src/tests/surfaces/nav-by-route.logic.test.ts`.

### 5.4 Arrow 4 — descriptor → admin projection

Same descriptor, a different archetype component set (Shadcn/Tailwind, desktop-first `md:` breakpoints per `.claude/domain-admin.md`, vs RN/NativeWind mobile-first). The precedent is already in the tree and is smaller than expected: `src/components/admin/GenericFieldRenderer.tsx` (83 lines) is a type-aware renderer handling *"~120 heterogeneous DB fields (null / boolean / number / date / string / JSONB)"* without a per-field component — its own header calls it *"a deliberate renderer, not ad-hoc JSX"*. That is one archetype component, already written, already branch-tested. The admin twin of the pilot (`ParcelCostTool.tsx`, 425L) already consumes it.

> Dated note 2026-11-09 (M-246, prior text kept; spec review R-6 (ii); operator, verbatim: "D-0-D-4 approved", D-2): "Shadcn/Tailwind" above is superseded. shadcn/ui is not installed (Spec 33:44); the web and admin archetype set is Mantine 9 + `@rjsf/mantine` + `mantine-datatable` (§11b.4).

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

> Dated note 2026-11-09 (M-246, prior text kept; MF-37 · McFrontend queue · lane W1-MF37; operator, verbatim: "approved except for 9 - the report should still show with the google street view photo if its not available - just the photo space should not show" (batch item 1); record `~/Buildo-scratch/mcfrontend/phase1/open-questions.md`, "Operator ruling 2026-11-09: Wave 1 decision batch"; plan `~/Buildo-scratch/mcfrontend/MF-37/plan.v3.md`): rule 6 has one ruled, explicit departure until `scripts/seeds/roles.json` and its generator exist: `media_assets`, `offers` and `advertisers` carry a hand-written `ENABLE ROW LEVEL SECURITY` + one `<table>_select_admin` policy and no write policy (Spec 114 §2 dated note 2026-11-09). Their CONTRACT descriptors carry `guards.rls_class` B with the ruled pattern; the full `rls` block of this section (grants, `why_none`) is not representable in `surface.schema.json` yet and waits for the schema and `roles.json`. The db test reads the live catalog (rule 3).

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

> Dated note 2026-11-10 (M-246, prior text kept; MF-40 · McFrontend queue · lane MF-40 build; operator, verbatim: "Mf-D1 - we will just input the ads via the admin" and "Mf-40 agreed"; record `~/Buildo-scratch/mcfrontend/phase1/open-questions.md`, "Operator ruling 2026-11-10: MF-40 D-1" and "Operator ruling 2026-11-10: MF-40 D-3, D-6, D-7"; plan `~/Buildo-scratch/mcfrontend/MF-40/plan.md` section 12): rows 4, 5 and 6 as MF-40 builds them (migration `302_admin_ads_placements.sql`, written; the operator's DB job applies it).
> - Row 4 `advertisers`: the RLS posture is not Class D. Ads are entered by the admin only and no advertiser principal is planned, so the table carries the admin-read pattern (Spec 114 §2 dated notes 2026-11-09 and 2026-11-10): RLS on, `advertisers_select_admin`, no write policy; writes go through the admin API's owner connection. Minimal shape (D-3): `advertiser_id`, `name`, `contact_user_id` (nullable, unused for now, kept for this row's shape), `active`, `created_at`, `updated_at`. An advertiser is entered on the admin placements page; there is no advertiser LIST or DETAIL surface (`admin_advertiser_accounts` stays parked).
> - Row 5 `placements`: Class E (Spec 114 §2 amendment (b)). The migration seeds exactly the slots of `scripts/surfaces/_schema/ad-contract.json` (`detail_footer`, `renovation_section`, `scenario_card`), `surface_archetype` `REPORT`, `max_slots` equal to `report-presentation.json` `ad_placements[].max_slots`. `disclosure_required` carries `CHECK (disclosure_required)` (R-17, R-34 (i)). The table is seed-only: no admin route writes it, so "admin all" is served by the migration, not by a form. `max_slots` keeps its one home in `ad_placements`; a drift lock joins the seed to it, and a new slot is a contract change plus a placement migration.
> - Row 6 `offers`: the admin-read pattern, not Class D (as row 4). Added columns: `creative_text` (the text an offer shows; v1 creatives are text, `ad-contract.json`), a nullable `creative_asset_id` FK to `media_assets` (D-6; not rendered until ad contract v2), `created_at` and `updated_at` (the form's optimistic concurrency). `offer_id` is client-generated, so an upsert is idempotent. CHECKs: `flight_end >= flight_start` when both are set; `targeting` is a JSON object. The `user` / `anon` read of active, in-flight rows is not a policy: it belongs to the serving follow-up row (D-7), which also brings the targeting-read index. MF-40 is admin authoring and preview only.

> Dated note 2026-11-10 (M-246, prior text kept; MF-40 · McFrontend queue · lane MF-40 build; operator, verbatim: "y recommendation: C, with the four trims. approved"; record `~/Buildo-scratch/mcfrontend/phase1/open-questions.md`, "Operator ruling 2026-11-10: the shared binding standard"; plan `~/Buildo-scratch/mcfrontend/MF-40/plan.delta-1.md` sections 5 and 8): rows 4 and 6 as the MF-40 admin page writes them. `offers.targeting` holds at most `building_type` and `design_option`, the keys each placement accepts in `report-presentation.json` `ad_placements[].targeting`; a `scenario_card` offer needs both, and the pair must be a key of `ad-contract.json` `scenario_fields`. `zone_class` targeting is not written until the serving row (D-7). `offers.active` is false on create and changes only through the list-row toggle; `offers.creative_asset_id` is not written until ad contract v2. `advertisers.active` is true on create and is not changed in v1.

> Dated note 2026-11-10 (M-246, prior text kept; MF-40 OUTPUT panel · McFrontend queue · lane MF-40 build; operator, verbatim: "MF-40 - yes an ad can run without an end date, b teh admin? c. yes d. doesnt matter"; record `~/Buildo-scratch/mcfrontend/phase1/open-questions.md`, "Operator answers 2026-11-10: MF-40 OUTPUT panel questions"; security and compliance seat M1, M3): two corrections to the 2026-11-10 notes above. (1) The home of `max_slots` is the `placements` table (Spec 128 R-34 (i)), not `report-presentation.json` `ad_placements`: `ad_placements[].max_slots` is the joined copy, and the drift lock (`src/tests/admin-placements-seed.logic.test.ts`, the DB test arm (d)) keeps the two equal. The over_cap read uses the table (`src/lib/placements/over-cap.ts`). The row-5 sentence "`max_slots` keeps its one home in `ad_placements`" is superseded by this note; no admin route edits `placements` yet. (2) An offer may run without an end date (`flight_end` is optional); `admin_placement_max_horizon_days` bounds only a given end.

> Dated note 2026-11-11 (M-246, prior text kept; MF-45 · McFrontend queue · lane E; operator, verbatim: "a" (D-1), "all five a" (D-2..D-6) and "y" (the MB-44 wait dropped, build starts); record `~/Buildo-scratch/mcfrontend/MF-45/DECISIONS.md` and `~/Buildo-scratch/mcfrontend/phase1/open-questions.md`, "2026-11-11 MF-45: operator \"y\""; plan `~/Buildo-scratch/mcfrontend/MF-45/plan.md` with its section 12 folds): row 2 `usage_events` lands in the narrow form (D-1 a), in migration 303 (written by MF-45, applied by the operator's DB job): the section 7 shape verbatim, closed CHECKs on `product` (the four entitlement keys), `event` (the section 7 list) and `subject_kind` (R-04), the quota index `(user_id, product, event, subject_kind, occurred_at)`, RLS on with exactly one policy, `usage_events_select_own` (Class A, Spec 114 section 2 dated note 2026-11-11). The row's "plus **one** `anon` insert policy" is NOT built here: it lands with the row that serves offers (MF-61, section 7.1), the one row allowed to relax the no-anon lock. Rows are server-written through the owner connection (D1), so there is no insert policy for `authenticated` either. The one event written is `property_view` (product `parcel_tool`, subject_kind `parcel_ref`, subject_key the matched `parcels.parcel_id`, `meta` `{}`; the raw search text is never stored). Deletion follows the account: `user_id` cascades from `auth.users` (the migration 235 sweep). The quota read is `COUNT(DISTINCT subject_key)` over a period computed at query time (section 7); no partial unique index, because a per-period index needs a stored period, which section 7 forbids. The row text above is unchanged.

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

> Dated note 2026-11-09 (M-246, prior text kept; MF-37 · McFrontend queue · lane W1-MF37; operator, verbatim: "approved except for 9 - the report should still show with the google street view photo if its not available - just the photo space should not show" (batch items 2, 4); record `~/Buildo-scratch/mcfrontend/phase1/open-questions.md`, "Operator ruling 2026-11-09: Wave 1 decision batch"; plan `~/Buildo-scratch/mcfrontend/MF-37/plan.v3.md`): a second bucket, `surface-media` (admin media library, MF-37), follows the same private-by-migration rule with an `admin` scope instead of the owner path (on an instance without the Storage tables the migration's Storage half skips itself with a NOTICE, and the db test fails unless that gap is named): path `<kind>/<asset_id>.<ext>`, three `surface_media_*_admin` policies, signed URLs minted by the admin list call with the TTL as a `logic_variables` row (Spec 114 §6 dated note 2026-11-09). Uploads arrive as a data URL in the RJSF form, cap at most 3 MB (item 2), stored as `media_upload_max_bytes`. Its ledger is deferred; user-facing signing is owed by MF-38 (item 4).

> Dated note 2026-11-09 (M-246, prior text kept; spec review R-7, stale cites only, no rule change): at `0d90d92a7` Spec 114 §6 is 114:333-372. The 114 cites in this section map :310-344 → :333-372, :312 → :335, :320 → :343, :325-336 → :347-358, :482-487 → :505-510. R-31 is recorded on 114 §6 by its own dated note.

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

## 11a. REPORT: the generated report fields (McFrontend Phase 1, added 2026-11-04)

Why here: operator verbatim, doc-set answer 3: "generator lives in the spec". Scope: the REPORT archetype only (card answer Q-MFS a, lean McFrontend). Spec 128 Rules 16-18 apply to REPORT now. Line cites in this section were read at `ac9200aa8`, before this section landed. "(unverified)" marks a fact the drafting lane did not confirm; it is confirmed at build.

### 11a.1 The binding rule (Q-MF3, 2026-11-04)

Operator verbatim: "isnt that the point of the schema - there might be exceptions ie user input fields but overall teh databse fields are the key we also have ads as well. we just need to be aware of this."

- Every displayed field binds to a source. The schema references the field and nothing else: no old engine names, no older-rule text, no code. The CLOSED binding set (`source`):

  | source | what it binds to |
  |---|---|
  | `catalogue` | the Layer 3 output, keyed by catalogue row id (`scripts/seeds/bylaw/layer3-catalogue.json`, schema `layer3-catalogue-v1`; rows gated by `switchboard.json`, schema `switchboard-v1`) |
  | `content` | the label, help-text and legal-copy table (a seed or a DB content table). Labels, help text and legal copy are NOT an exception: they are content fields and bind like any field |
  | `user_input` | an id in the input contract (the form archetype), e.g. neighbour setbacks, the parking-space question |
  | `ad_slot` | an id in the ad contract (§11a.10) |
  | `external_embed` | a declared external embed: map tiles, payment checkout, analytics. Declared, never coded. RULED 2026-11-04 (Q-MF4 a; Spec 135 FE-21) |

- A field with any other source fails the check.
- The set lives in a PROTECTED file (proposed `scripts/surfaces/_schema/binding-sources.json`, path unverified; to be added to `protected-paths.json` at the freeze lift). Adding a source or a member needs a register row and a panel. The binding lock has a RED fixture: a node with an invented field (Spec 128 Rule 20, Spec 135 FE-18).
- Generation: scenario fields are GENERATED from the catalogue and switchboard into the SEED (`scripts/surfaces/_schema/report-v2-seed/` via `seed-report-v2.mjs`), never into the generated `report-v2.decl.json` (its header is re-checked at build, unverified). A row on in the switchboard yields a field set; off yields none; off beats on (the switchboard `$comment`).
- The retired lineage and `_sqm` names are removed from the report schema. Spec 78 needs no dated note for the report (card answer Q-MF3).

> Dated note 2026-11-06 (McFrontend MF-10; prior text kept, M-246; operator answer MF-10 D-1..D-7, verbatim "MF-10 all recommended provided they are complaint", D-5 b; register row Spec 135 FE-27, panel `docs/reports/panels/MF-10.json`): the closed binding set gains a sixth source, `parcels`: a column of the `parcels` table (a DB field; `catalogue` / `content` / `user_input` / `ad_slot` / `external_embed` / `parcels`). A member is a migration column that the consumer payload reads on the Spec 100 §3.2 whitelist. The set file is `scripts/surfaces/_schema/binding-sources.json` (D-4 a). Per D-3 b a field whose row or column does not exist is left out of the schema until it lands; the old `lineage:`, `consumer:`, `presentation:` and `pending:` source forms are retired (`presentation:` is now `content:`).

> Dated note 2026-11-09 (McFrontend MF-13; prior text kept, M-246; operator "Agreed and capture this as rulings", "yes - looks good now", "agreed", recorded in ~/Buildo-scratch/mcfrontend/phase1/open-questions.md; register row Spec 135 FE-30): the Generation bullet is built. The generator (`seed-report-v2.mjs --write | --check`) makes every effective-ON catalogue row (row switch ON and building type ON) a `catalogue` field in the generated seed file `report-v2-seed/catalogue-fields.json`; a row or building type with no switch row fails closed. Placement is presentation data in `report-v2-seed/row-presentation.json`: one ordered headline list per scenario, every unlisted row is detail in catalogue order, the lists ship empty. Retirement of a row is its switchboard row OFF. Labels are `content` (11a.7): a headline row with no authored label fails, a detail row shows its row id.

> Dated note 2026-11-11 (M-246, prior text kept; MF-38 · McFrontend queue · lane MF-38; operator, verbatim: "0-1 b"; record `~/Buildo-scratch/mcfrontend/phase1/open-questions.md`, "2026-11-11 MF-38 O-1"; plan `~/Buildo-scratch/mcfrontend/MF-38/plan.md` with `plan.delta-1.md`): `content` also covers the report illustrations. The one declared field `card_image` (source `content:illustrations`, generated by `seed-report-v2.mjs`, replacing the four per-asset `proposed` rows) carries, per scenario key, one image reference `{scenario, asset_id, alt, caption}`. The tree never carries a URL or image bytes: the bytes live in `media_assets` (MF-37) and reach the page through a signed URL issued by the server read; `caption` defaults to `illustrations.caption_default`.

### 11a.2 `variants[]` (RULED, operator verbatim "Q-MF2 a")

Card answer: one card per building type, with a `variants[]` list inside: one entry per roof form (flat, pitched A, pitched B) and unit class (houseplex 2-4 at 4; 6 `not_modelled` until its increment), generated from the catalogue. Each variant is a full field set, rendered. Ad slots stay outside the card list and outside `variants[]`.

Headline: the generator emits `headline: true` on exactly one variant per card, by the existing rule (largest permitted and buildable; ties flat, then A, then B per the increment-2 note; exact text unverified, resolved against McBylaws). The renderer reads the flag and never chooses.

### 11a.3 Closed status list and disclosure codes (Honest display)

`status` is one of: `permitted` | `not_permitted:<clause>` | `not_buildable` | `not_evaluated:<reason>` | `not_modelled` | `at_least` (a lower bound; the catalogue row carries the flag).

`coa_required:<clause>` is NOT in the list; it is added by amendment at the McBylaws increment that lands that route (no later-increment work pulled forward).

Disclosure codes are a closed list generated from the catalogue/content (a declared field set), extended only by an amendment to this section plus a lock. A status or code outside the list: the generator fails AND the renderer throws (never skips).

Rule: an `at_least` value renders "at least" beside the number on every target.

> Dated note 2026-11-08 (McFrontend MF-12; prior text kept, M-246; operator answer MF-12 L-1, verbatim "L-1C" (2026-11-08), recorded in ~/Buildo-scratch/mcfrontend/phase1/open-questions.md; register row Spec 135 FE-28, panel `docs/reports/panels/MF-12.json`): the closed status list gains one value, `none` = no reading on this node (the Spec 122 §1.2 per-field idiom that 126:295 inherits: omission is a build failure, `none` is valid per field). It is escalated through Spec 128 §4 (126:295: a surface that needs a value the menu lacks escalates, it does not add one) and follows the 126:743 pattern (MF-10 D-5 b). `none` is valid only on a node of a lifecycle tree, never on a reading node. The lock is `src/tests/surfaces/report-honest.logic.test.ts` (FE-06).
> Dated note 2026-11-12 (M-246, prior text kept; MB-94 part (c) · McBylaws queue · engine-inputs lane; Spec 135 FE-39 (EI-D2, EI-D8); plan §8 R-2; operator, verbatim: "D all as recommended - please ensure this is addedd to the McFrontend decisions"; record `~/Buildo-scratch/mcfrontend/phase1/open-questions.md`, "Engine inputs (cost / build bigger / neighbours) — rulings 2026-11-12"; plan `~/Buildo-scratch/mcbylaws/ENGINE-INPUTS-PLAN.md` v2 §4.0, §4a): the closed list gains one `not_evaluated` reason, `not_in_engine_population`, which displays as "Not yet evaluated". It is the state of every option on a lot that has no stored Layer 3 rows, i.e. one outside the golden 25 and the MB-35 cohort until MB-38 fills all lots. It refines MB-93's existing `not_stored/no_rows` state. The status words are unchanged (a reason, not a new status), and `coa_required:<clause>` is still added only at the increment that lands that route (EI-D4: "Can you build bigger?" reads `not_evaluated:coa_factor_unfitted:<form>` until the M-65 u fit at MB-38/MB-44). An empty field is never shown as 0 or $0. Lock owed with FE-39: `src/tests/surfaces/engine-inputs-bind.logic.test.ts`.

### 11a.4 Per-reading confidence and provenance

Every reading carries `confidence` (closed set `high | medium | medium-low | low`, the switchboard confidence row of McBylaws, M-378 dated amendment), an `evidence` pointer, and `source` provenance: `estimated` | `permit` | `plan` | `user` (exact source values against the McBylaws catalogue unverified). `entered_at` is present for `user`. Confidence by source (Q-MF4 a): estimated low, user medium, verified high. Shown beside each reading, never hidden.

> Dated note 2026-11-11 (M-246, prior text kept; MF-19 · McFrontend queue · lane E; operator, verbatim: "all as recommmended" (MF-19 D-1..D-8, 2026-11-11); record `~/Buildo-scratch/mcfrontend/MF-19/DECISIONS.md`; plan `~/Buildo-scratch/mcfrontend/MF-19/plan.v2.md`; ruling 2 of `open-questions.md:709` and `:732`, "a user entry shows as high"): a user lot-size entry is shown as confidence **high** (the line above read "user medium"); ranking user > City parcel > massing. "high" is the lot-size reading's own confidence only: card and option confidence and every number still come only from McBylaws' stored results, and nothing rises on screen at entry. `entered_at` is stamped by the database clock.

### 11a.5 Disclosures

Per reading and per variant, from the closed code set, with parameters. A disclosure the catalogue marks required that the render omits is a FAIL: the oracle is the catalogue flags, not the goldens (Spec 128 Rule 17).

### 11a.6 Fields that must exist (catalogue row ids; labels from `content`)

| Field | Source | Note |
|---|---|---|
| dual FSI reading | catalogue: capped and uncapped | headline = capped, uncapped beside it (M-397, 69a:538; cite unverified) |
| `gfa_max_m2` (counted GFA) | catalogue (exists) | label from `content` |
| mechanical outside GFA | catalogue mechanical rows | own labelled figure (M-472) |
| total floor area | computed by the CATALOGUE (GFA + mechanical), not the UI | Single source |
| `wall_storeys`, setback plate, free share, roof pitch, counted attic per arm | catalogue increment-2 rows | do not exist today (unverified that `wall_storeys`, `headline_lower_bound`, `units_at_least` are absent) |
| `headline_lower_bound`, `units_at_least` | catalogue | "at least" qualifiers |

The UI computes none of these. A sum in any file is a Rule 16 failure (Spec 128).

> Dated note 2026-11-09 (McFrontend MF-13; prior text kept, M-246; same operator answers, register row Spec 135 FE-30): "Fields that must exist" is met for every catalogue row by generation (11a.1 dated note 2026-11-09): the field set is the effective-ON catalogue rows, not this table. Which rows lead a card is the ordered headline list in `row-presentation.json`; which variant wins on a lot stays McBylaws' computed rule (126:749).

### 11a.7 Golden render states: structured render trees

A golden = the pair in Spec 127 §4.3 (API fixture + rendered tree; 126:435-439, 127:129-134). Rendered tree = nodes in declared order:

```
{ "field": "gfa_max_m2", "source": "catalogue", "label": "<from content>", "value": "212.4 m2", "status": "at_least", "confidence": "medium", "provenance": "estimated", "disclosures": ["..."] }
```

`value` is the formatted string; `label` includes any "at least". A screenshot is never a golden.

Render states (minimum): permitted, not_permitted, not_buildable, not_evaluated, not_modelled, at_least, at_least_with_disclosure, one per closed confidence value, variants (flat vs pitched), houseplex 4 and 6, dual FSI, exception lot, basement line, user_entry (§11a.9), no_user_entry, user_entry_outranked (a verified fact outranks a user entry, Q-MF4 a), ad_slot_present, ad_slot_absent (§11a.10), loading, miss, error. Derived from the catalogue plus the 25 golden lots (card answer Q-MFS a). The honest check scans every node of every golden for the required fields.

> Dated note 2026-11-08 (McFrontend MF-12; prior text kept, M-246; same operator answer, "L-1C"; D-1 a, D-2 a, D-3 a, D-4 a of the MF-12 answer "I approve all the recommendations on the condition you are highly confident in each"): (1) the states loading, miss and error are trees with a tree-level `lifecycle` key (closed: loading | miss | error) and one content message node whose `status` is `none`; every other tree has no `lifecycle` key. (2) The golden path is `src/tests/fixtures/surfaces/report/<state>.<target>.json` (Spec 127 §4.3 dated note 2026-11-08); the state and target list is its `states.json`. (3) "variants (flat vs pitched)" is read as FE-17's three: variant_flat, variant_pitched_a, variant_pitched_b, so the list is 27 states and 108 files; tranche 1 lands 10 states (40 files) and 17 are owed with named blockers. (4) Nodes bind only to existing declaration fields plus `content` (MF-10 D-3 b); `confidence` and `provenance` are `none` (closed value) until a bound field carries them. (5) S-parity: the four target files of a state agree. (6) An `at_least` node's label is the declared label plus ", at least". (7) The node contract (required keys and the closed sets of status, confidence, provenance and lifecycle) lives in one file, `scripts/surfaces/_schema/report-tree.schema.json` (126:552 R-27; operator "G-1 a, G-2 a", 2026-11-08; Spec 135 FE-29); every golden tree validates against it. Confidence takes `none` in addition to the 11a.4 set and provenance takes `none` in addition to the 11a.4 sources, on the same Spec 122 §1.2 per-field basis as `status: none`.

> Dated note 2026-11-09 (McFrontend MF-12; prior text kept, M-246; MF-12 second OUTPUT panel fold F-6; record ~/Buildo-scratch/mcfrontend/MF-12/panel-output-2.json, panel 2, verdict PASS-WITH-FOLDS; operator verbatim "agreed on your recommendations" (2026-11-09)): clarifying clause to item (7) and the 11a.3 `none` note: `none` for `confidence` and `provenance` is per field on any node (the Spec 122 §1.2 per-field idiom), meaning no bound source carries the value yet, and it is legal on a reading node until a field carries it. The lifecycle-only restriction ("valid only on a node of a lifecycle tree") applies to `status` alone. How a `none` renders stays with MF-14.

> Dated note 2026-11-09 (McFrontend MF-14; prior text kept, M-246; operator, verbatim: "approved 1. MF-14 T-1 to T-4 (the trimmed renderer decisions above): approve as recommended?"; record `~/Buildo-scratch/mcfrontend/phase1/open-questions.md`, "Operator ruling 2026-11-09: MF-14 trimmed decisions T-1..T-4"): (1) How a `none` renders: the one message node of a lifecycle tree keeps the field `status_text` (as MF-12 materialised it) and carries `status: none`; its value is the content text `states.lifecycle.<loading|miss|error>` in `report-presentation.json` (generated by `seed-report-v2.mjs`, never hand-edited): "Loading the report…", "No report for this lot yet.", "Could not load this report. Try again." It is never a blank or the null dash (Spec 33:130-131). (2) The four targets read ONE closed layout table, `scripts/surfaces/_schema/report-layout.json`: one row per target (mobile, web, admin, pdf) with `columns` (1, 2 or 3), `details` (collapsed or expanded), `meta` (when_set or always) and `page_break` (none or after_headline); no per-field or per-state entry. (3) Mobile is the server projection (126 §5.3: no client business logic): in MF-14 the mobile layout row is proven by the goldens through `viewOf`; the React Native component waits for MF-22. PDF is the same DOM component with the pdf row; the PDF route stays deferred. (4) Starter headline lists (`row-presentation.json`, T-1): flat card `gfa_flat_m2`, `storeys_max`, `height_max_m`; pitched card `gfa_pitched_m2`, `storeys_max`, `height_max_m`; the bare `detached_house` key is removed (a card is building type x design option); new labels "Storeys (max)" and "Height (max)". (5) A value is shown as the producer sent it: `String(n)` plus the declared unit; null shows the content dash; no rounding (Spec 128 Rule 16). (6) A headline row the tree lacks shows its label and the dash; a detail field the response lacks shows nothing.

> Dated note 2026-11-09 (McFrontend MF-12 tranche 2; prior text kept, M-246; operator verbatim "recommendations approved" (2026-11-09), plan decisions D-1..D-7 all (a), record ~/Buildo-scratch/mcfrontend/phase1/open-questions.md, "Operator rulings 2026-11-09: FE status flips and MF-12 tranche 2"): tranche 2 lands one state, `not_buildable`, as 4 goldens (one `status_text` content node, no figure node). Landed: 11 states / 44 files. Owed: 16 states / 64 files. `states.json` carries `tranche: 2`, `owed_states: 16`, `owed_files: 64`; no new key. The 16 owed state names and the blocker of each are in docs/reports/panels/MF-12.json (dated note 2026-11-09, tranche 2). MF-12 stays RUNNING until 108 files.

> Dated note 2026-11-09 (McFrontend MF-12 tranche 3; prior text kept, M-246; operator verbatim "b" (2026-11-09), plan decisions D-2..D-7 as recommended, record ~/Buildo-scratch/mcfrontend/phase1/open-questions.md, "Operator ruling 2026-11-09: not_modelled status text"): tranche 3 lands one state, `not_modelled`, as 4 goldens (one `status_text` content node, no figure node: a `not_modelled` result carries no cells, so no figure is shown). The content text `status_text.not_modelled` is "This option is not modelled yet, so no figure is shown." (generated into `report-presentation.json` by `seed-report-v2.mjs`, never hand-edited). It states no class, zone or roof form: the state stays real after the inc-3 ruling P1 (the six RM pitched rows now compute) because an unlisted option class still answers `not_modelled`. Landed: 12 states / 48 files. Owed: 15 states / 60 files. `states.json` carries `tranche: 3`, `owed_states: 15`, `owed_files: 60`; no new key. MF-12 stays RUNNING until 108 files.

> Dated note 2026-11-11 (M-246, prior text kept; MF-38 · McFrontend queue · lane MF-38; operator, verbatim: "0-1 b"; record `~/Buildo-scratch/mcfrontend/phase1/open-questions.md`, "2026-11-11 MF-38 O-1"; plan `~/Buildo-scratch/mcfrontend/MF-38/plan.md` with `plan.delta-1.md`): the node contract gains ONE closed node kind, the image node `{field, source, kind: "image", label, images: [{scenario, asset_id, alt, caption}]}` (`report-tree.schema.json` `$defs.image_node`, chosen by `if kind`). It carries no value, status, confidence, provenance or disclosures: an image is not a reading, so the sentence above that every node carries those fields holds for every node except the image node. At most one image node per tree and one item per scenario key; `alt` is required, non-blank and concrete (no `{placeholder}`). Single image per option (O-1 b, amending the "photos change in place with dots" ruling for v1): every target (mobile, web, admin, pdf) shows the same one image for the picked scenario as a plain `<img>` with its alt and caption; there is no carousel, no dots, no swipe and no per-target image key in the layout table. An empty list emits no node and renders nothing. New golden states: `images_present`, `images_empty` (4 targets each).

> Dated note 2026-11-11 (McFrontend MF-57; M-246, prior text kept; operator, verbatim: "y to all as built", answering the MF-57 decision list D-A..D-K with D-A (a) and D-B yes; record `~/Buildo-scratch/mcfrontend/MF-57/decisions.md` and `~/Buildo-scratch/mcfrontend/phase1/open-questions.md`, "Operator 2026-11-11 (verbatim): y to all as built"): the approved v21 report page is a PAGE tree with its own contract, `scripts/surfaces/_schema/report-page.schema.json`. The page did not change the node contract (an ad section reuses its `$defs/slot`); the node contract changed afterwards only by the MF-38 image node (note above), and the report-state goldens are 64 files (16 states x 4 targets, plus `states.json`). A page tree is the sections of the page table `report-page.json` in screen order; a part is one shown text bound to a declared field (the server-formatted string as sent, never a number; the MF-14 value rule "String(n) + declared unit" stays for the node tree only, D-B), a `content:page` text, or a ruled pending text (Q-G4 a: never a value). A hidden option is left out and anchored sections follow the shown options. A tile area value is two parts, the number and its unit, each server-formatted (D-J). A page-table section that names `details` is drawn only on layout rows (`report-layout.json`) with that `details` value, so the lot-size box and the Add lot size sheet show on collapsed rows only (D-K). The option picture is the MF-38 figure (one image per option; caption `content.illustrations.caption_default` "Illustrative — not this lot", in report-soft on the dark frame, WCAG 2.1 SC 1.4.3), drawn empty until the server read that signs image URLs lands (MF-44 / MF-22). Lock: `src/tests/surfaces/report-page.logic.test.ts`, `report-page.ui.test.tsx`. Register row: Spec 135 FE-34.

> Dated note 2026-11-11 (McFrontend MF-62; M-246, prior text kept; operator, verbatim: "Mf-62 - yes" and "x-1 a of course, x-2 a x-3 a x-4 a - build this into McFront-end specs and rulings and handbook"; record `~/Buildo-scratch/mcfrontend/MF-62/plan.md` and `build-plan.md`, `~/Buildo-scratch/mcfrontend/phase1/open-questions.md`; register FE-35): the loading state "What we checked". A `lifecycle: loading` response may carry `what_we_checked` and its tree then carries ONE root-only `checked` object (as `slots`: never a node; never on a miss, error or reading tree; the one-message-node rule unchanged): `title`, `log_label`, `groups[]` (`citywide`, `lot`; each line `{key, text, delay_ms}`), `dates`, `skip` and `min_ms`. Every text is a content template of `report-presentation.json` `states.checked` (no digits) filled with the server-formatted value the producer `src/lib/parcels/what-we-checked.ts` sent (FE-05); the pace (each line's delay, the skip delay, the minimum) is computed by the producer from `report_check_min_ms` and `report_check_skip_after_ms`, never in the renderer (Rule 16). Citywide counts come from the stored, dated `data_quality_snapshots` row (`refresh_snapshot`, X-1 a); a missing row or value omits the citywide group, never a literal. Per lot: lot area; the evaluated by-law limit count, "exception noted, not yet modelled" (`exception_not_authored`) or "By-law limits not yet evaluated" (X-3 a); ravine and heritage only when that enrichment ran ("Heritage designated" / "Not heritage designated", X-2 a); decided CoA applications in the lot's neighbourhood. Web: ReportView draws it on the report page colour with a CSS fade (opacity only), the skip revealed by `visibility` after its delay, and `prefers-reduced-motion` showing every line and the skip at once; the lines sit in one `role="log"` region; pdf and admin draw no skip and no delay. Holding the report for `min_ms` and opening it is the host's (the app binding, MF-48; a live web report route when one exists). A re-opened lot (`already_counted`, the lot already opened this billing month) gets no `checked` object. Goldens `loading_checked` and `loading_checked_gated` (four targets).

> Dated note 2026-11-11 (McFrontend MF-62 follow-up; M-246, prior text kept; operator, verbatim: "b just keep the bigger number for now and we can revisit" (N-1 b); the accessibility audit of 2026-11-11 (WCAG 2.2 SC 2.2.1 Timing Adjustable and SC 4.1.3 Status Messages), relayed by the coordinator; record `~/Buildo-scratch/mcfrontend/MF-62/plan.md` bottom; register FE-35): (1) the per-lot by-law line reads "{N} by-law checks across {M} house types": N is the evaluated limits counted per building type (as built), M the building types evaluated on that lot (distinct evaluated classes), both server-formatted; a checked template has two closed placeholders, `{value}` and `{types}`, each required exactly when its value is sent; the claims lock fails a limits line without "across {types} house types". (2) The tree's `checked` object carries `summary` (content `states.checked.summary`). When a screen reader or reduce motion is on, the host does NOT open the report by itself: every line shows at once (the reduce-motion state) with "Show report", and the app announces `summary` once with AccessibilityInfo.announceForAccessibility (iOS does not rely on role="log" or live regions). The web keeps one role="log" region; a web host opens the report by itself only when `prefers-reduced-motion` is off (a browser cannot tell that a screen reader is on, so the skip link is always shown on a paced row).

> Dated note 2026-11-11 (McFrontend MF-62 copy; M-246, prior text kept; operator, verbatim: "it shouldn't say why we checked -- thts dumb - it doesnt need a title... it should be processing"; relayed by the coordinator: remove the title and any section labels, keep the ruled resolved lines; register FE-35): the `checked` object carries no `title`, no `log_label` and no group `heading` (the contract refuses them); the screen draws the resolved lines, the dates and "Show report" only, inside one unnamed `role="log"` region. The name "What we checked" stays the row's internal name. The animated "thinking" sequence and its web and app motion are a later follow-up once the operator approves its mock; until then no live-progress wording is shown (the claims lock still refuses "processing", "checking" and the like: the screen shows work already done, Competition Act s.74.01(1)(a) general impression).

> Dated note 2026-11-11 (M-246, prior text kept; MF-48 · McFrontend queue · lane E; operator, verbatim: "just to understand for the McFrontend and the web pages we are still using schema's and no code. except all recommendations"; record `~/Buildo-scratch/mcfrontend/MF-48/DECISIONS.md`, D-1 (a) and D-6; plan `~/Buildo-scratch/mcfrontend/MF-48/plan.v2.md` §1): item (3) of the MF-14 note above ("the React Native component waits for MF-22") is narrowed. MF-22's own note (2026-11-09) says its mobile proof covers mobile only after MF-48, so the wait was circular. MF-48 Stage A builds the mobile REPORT binding now on synthetic goldens (the MF-57 precedent): the binding, the screen host, the props goldens and the tests, mounted nowhere. The live mount waits for MB-44 (a real per-lot page response), the MaxBLD app home for MF-49, and the device run for both; MF-22 then proves mobile through the mounted screen. The REPORT node goldens and MF-57's four page goldens are unchanged; the mobile props goldens are new. The mobile loading, miss and error states show the three texts of item (1) (`states.lifecycle`), with no new copy; offline shows the cached report when there is one, else the error state; a signed-out or unentitled user never reaches the screen (the MF-49 `parcel_tool` gate), so the page has no state for it.

> Dated note 2026-11-12 (M-246, prior text kept; MF-48 Stage B with MF-74 · McFrontend queue · lane E; operator, verbatim: "Ball y" (2026-11-12, B-1..B-7) and "S1 a" (2026-11-12); earlier "you can get rid of the old report it serves no purpose" and "Q1 a Q2 i" (2026-11-11); record `~/Buildo-scratch/mcfrontend/MF-48/DECISIONS.md` ("Ball y" B-1..B-7; "S1 a"); plan `~/Buildo-scratch/mcfrontend/MF-48/plan-stageB.md`; stop record `~/Buildo-scratch/mcfrontend/MF-48/stageB-build-stop.md`): **Stage B, the live mount.** The lot route `mobile/app/(app)/parcel-tool/[parcelId].tsx` mounts the REPORT host (B-2 a: MF-74 folded in). The layout is the built v21 binding (B-1 a); Daylight B is its own row for web and mobile together, and the report colours stay v21 until then (B-7 a). The page view comes from the lookup's nullable `page` (B-3 a; Spec 100 §3.2 dated note), built on the server by MF-57's core, null for every lot until MB-44, so customers see the approved miss text. The error state adds Retry with the approved text "Try again" (B-4 b; DECISIONS L-2); the screen adds one Back control (a labelled Button in a top safe area: `mapping.mobile.REPORT` gains `SafeAreaView`, the SEARCH and LIST form). The screen's texts reach the app through a generated slice (`emit-mobile-surfaces.mjs`: the three lifecycle texts from `report-presentation.json` and the new content file `mobile_parcel_detail.content.json`, "Try again" and "Back"). The picture slot stays bound to the image node `card_image` and its ruled empty state (no figure, no caption) while the fixed images wait for approval (R-IMG2). "What we checked" (MF-62 X-4) is Stage B2 (B-5 a). The MF-80 lot sweep (L3a) reads the fields the screen shows from the value parts of the served page; a lot with no page records `not_evaluated:no_page`, never a pass ("S1 a").

> Dated note 2026-11-11 (McFrontend MF-62 follow-up, the processing sequence; M-246, prior text kept; operator, verbatim: "the show report button shows before the animation is complete - also why do we need that button - after the each fact runs - we need to paude and then have somet the possibilities report for the address is ready and then transisiton.  Let's slow it down and make it more compelling."; "1. I like pulling by-law results.  2. Just your report is ready is sufficent"; Landing v9 R1 "1. y" (the name "The Building Possibilities Report"); record `~/Buildo-scratch/mcfrontend/phase1/open-questions.md`; plan `~/Buildo-scratch/mcfrontend/MF-62/followup-1111/plan.md`; register FE-35): amends MF-62 D-2 a. Each `checked` line carries its loading `verb` (content `states.checked.verbs`, "Loading / Pulling / Matching …" only; the claims lock allows a loading verb there and nowhere else) and its resolve time `done_ms`; the object carries `ready` ("The Building Possibilities Report for {address} is ready.", the address server-formatted from the lot's stored number and street, at `at_ms`) and `open` ("View report"). The producer paces one step s = floor((min - hold) / (facts + 1)): the fact shows its verb at i*s and resolves at (i+1)*s, the ready line one step after the last fact, the report opens at `min_ms`; the three times are admin logic variables (`report_check_min_ms` 23000, about 23 s (D-6), `report_check_skip_after_ms` 0, new `report_check_ready_hold_ms` 1500; migration 312). No "Show report" mid-sequence: a quiet "Skip" from the start (WCAG 2.2.2) that leaves when the ready line shows. The one announcement is `summary` = "Your report is ready.". The app opens the report by itself at `min_ms` except under a screen reader or reduce motion, where every fact, the ready line and "View report" show at once (MF-48). The web never opens it by itself (it cannot tell a screen reader is on; plan-panel RG-2): the ready line and "View report" show at the ready time. The processing illustration is generic, not lot-specific (operator, relayed: "this doesnt need to be the exact lot but just a simulated average lot.. process driven - not lot specific"), and is not built until its mock is approved. Then operator, verbatim: "3 y 4. keep what we have 2. y 1 acutally think it needs longer" (D-1 a, D-5, D-6): the web does not open the report by itself (D-5, as built); the total is about 23 s (D-6); the report page `legal.line` and the app search page `search.legal` read the short disclaimer "This is an estimate, not 100% accurate. Not legal advice. Confirm with a lot survey and the City." (D-1 a; Landing v9 R2), which supersedes the wording of ruling 2026-11-10 item 5 for both keys; the report footer line stays; the lawyer check (MF-72) now covers the short line.

### 11a.8 Performance budget (REPORT only; other archetypes on conversion)

Operator verbatim, Q-MF5: "QMf5 a". Card answer: measure first, then set. The first McFrontend build task times the current report screen and the 25 golden lots on mobile and web, then proposes budget numbers for the operator to rule. Ruled numbers go in a protected, tighten-only file. Spec 135 FE-04's lock stays OWED until the numbers are ruled.

| Archetype | First render | Payload (gz) | Measured by |
|---|---|---|---|
| REPORT | TBD (measured, then ruled) | TBD (measured, then ruled) | payload bytes on golden fixtures vs limit in protected archetype data (tighten-only) |

Load time and "a new field ships in hours" are PROSE-ONLY until there is an in-product measure (no mechanical lock; vitest on fixtures measures payload, not device load).

### 11a.9 User-input fields (shared, not private)

Operator verbatim: "I dont think these need to be private - I think it will update the database with higher confidence information that will stay - its not a secret."

Flow: form (declared in the descriptor, `source: user_input`, bound to the input contract) -> input contract -> McBylaws re-evaluates -> stored, shared results with provenance and confidence by source (estimated low, user medium, verified high) -> shown to every viewer.

- Each entered fact keeps provenance: `source: user`, `entered_at`.
- McFrontend declares the form and renders results only. The on-demand one-lot re-evaluation is a McBylaws increment-6 capability (card answer Q-MF4 a); it is not built by McFrontend.
- RULED 2026-11-04 (Q-MF4 a; Spec 135 FE-20): verified permit/plan facts outrank user entries; the newest user entry is shown; earlier entries are kept in history, so a bad entry can be reverted.
- Goldens: no_user_entry, user_entry (confidence medium, provenance user), user_entry_outranked.
- Targeting or sharing a user-entered input is not an ad matter except as §11a.10 states.

> Dated note 2026-11-11 (M-246, prior text kept; MF-19 · McFrontend queue · lane E; operator, verbatim: "all as recommmended" (MF-19 D-1..D-8, 2026-11-11); record `~/Buildo-scratch/mcfrontend/MF-19/DECISIONS.md`; plan `~/Buildo-scratch/mcfrontend/MF-19/plan.v2.md`): the first user input, the lot size, as built with the entry switch OFF. (1) D-1 a: the entry is its own record, `parcel_user_inputs` (migration 305), never a write to `parcels.lot_size_sqm` (the City loader would put the City value back); one server read gives a verified source (none is declared) > the active user entry > the City value, and the City value stays readable ("City lot record"). (2) Entered once: one ACTIVE row per lot (a partial unique index), so the bullet above "the newest user entry is shown" reads as "the active entry is shown"; history is kept and a bad entry is reverted by an audited admin FORM (D-4), which flips the row to reverted. (3) D-2/D-3: the range is two logic variables (46.45 and 4,645.15 m², "500 and 50,000 sq ft"), checked in the typed unit against the shown bound; an entry more than 3 times, or under a third of, the City record is refused (one setting); the server sends every message. (4) D-4: signed-in users with an active plan (the lookup's gate), 5 entries a day through the existing rate limiter (an admin setting). (5) D-5/D-6: the report page shows the lot-size box and sheet only while the switch is on and nothing is entered (hidden while off), and once entered one neutral line for every viewer, "Lot size … · from a survey, entered 10 Nov 2026."; "Every option is recalculated with it." shows only when the stored results carry the entry's stamp. (6) D-7: erasing an account keeps the entry and empties its author. (7) The input contract lands: `scripts/surfaces/_schema/lot-size-entry-contract.json` (binding-sources `user_input`), the FORM `report_lot_size_entry` is declared and goldened (mounted in the sheet at the flip). (8) The flip waits on MB-42 and McBylaws MB-89 (one-lot re-evaluation, added by the queue-owed commit; the stamp on its results, D-8; placed in increment order by the operator); the goldens of this section are the page states `entry_off`, `entered`, `entered_used` (with v21 as the on, not-entered state). Locks: FE-19 `src/tests/surfaces/user-input-provenance.logic.test.ts`, FE-20 `src/tests/surfaces/user-entry-precedence.logic.test.ts`, the switch lock `src/tests/parcels-lot-size-route.infra.test.ts`.

### 11a.10 Ad slots

- A slot is `source: ad_slot`, bound to the ad contract. Slots sit outside `variants[]` and outside the card list (Q-MF2 a).
- Spec 128 R-17 (disclosure) renders on every target for every slot; R-34 (never inside a card) is enforced by golden (the R-17/R-34 text at 128:139-172 is re-read at build).
- RULED 2026-11-04 (Q-MF4 a; Spec 135 FE-22): ads target only declared database keys (the generator fails otherwise), never user-entered facts without consent.
- Goldens: ad_slot_present, ad_slot_absent.

> Dated note 2026-11-09 (M-246, prior text kept; MF-20 · McFrontend queue · lane E; operator, verbatim: "all approved as recommended." and the rulings "scenario images and per-scenario ads"; record `~/Buildo-scratch/mcfrontend/phase1/open-questions.md`): the `ad_slot` source resolves in `scripts/surfaces/_schema/ad-contract.json` (slot ids, a map from each scenario key to its ad field, the declared targeting keys). Three slots: `detail_footer` and `renovation_section` (Q-8, after the card) and `scenario_card` (one per scenario, BESIDE that scenario's card, outside it, as a sibling element and a root `slots[]` entry, never a node). Targeting keys are database keys only: `zoning_class` (parcels column) and the scenario key parts `building_type`, `design_option` (catalogue rows); income-derived keys are denied pending a human-rights review. Every slot carries the "Sponsored" disclosure. v1 creatives are text; image creatives arrive with the media library (MF-37). The scenario image stays factual and inside the card.

## 11b. The MaxBLD page standard (McFrontend Phase 2, added 2026-11-09)

Why here: operator, verbatim: "1. confirmed 2. approved 4. D-7 yes Mb-86 yes if complaint and grounded 3. explain in more detail" (item 2: the standard is ONE new section of this spec, one home, Spec 128 R-27). Record: `~/Buildo-scratch/mcfrontend/phase1/open-questions.md`, "Operator rulings 2026-11-09: Part B confirmed, Spec 126 standard section, MF-20 D-7". Source text: the programme card v2.1, `~/Buildo-scratch/mcfrontend/PROGRAMME/CARD-mcfrontend-expansion.md` §1-§2 (panel record `PROGRAMME/panel/record.md`). Rules ruled elsewhere are pointed to, not restated. Line cites were read at `0d90d92a7`.

### 11b.1 The rule

Operator, verbatim: "MAxbld stays a seperate app - unless we can share some of the components with buildo than we build our own. We actually dont want to build anything - use existing standard components - we dont build any standard stuff ourselves - no code standardized approach". Confirmed for every MaxBLD page by D-0 ("D-0-D-4 approved").

- **Every MaxBLD page = descriptor + content + standard library components configured by schema.** MaxBLD is the parcel product (`parcel_tool`, Spec 128 R-01) and a separate app (Spec 116 §1 dated note 2026-11-09). "Every MaxBLD page" = the pages of §11b.3: the parcel product and parcel admin surfaces, plus the minimal web login, subscription and onboarding.
- **No hand-built standard component.** Archetypes (FORM, LIST, SEARCH, DASHBOARD, auth, subscription, onboarding) use the libraries of §11b.4 or hosted components, configured by descriptors, never written by us. REPORT keeps the landed renderer (§11a; Spec 135 FE-24). DETAIL is not used: the report's details section is REPORT (D-6).
- **Our code is limited to** the descriptor → library binding (one per archetype per platform, thin config), the generators, the gates and the landed web REPORT renderer. Per-feature code is named in its queue row: CONTRACT routes for writes, migrations, product gates, the entitlement read contract, the host allow-list.
- **Import boundary.** Library imports are allowed only in the declared binding modules. A wrapper component anywhere else (`src/app`, `mobile/app`, `src/lib`, the vendor folder) fails. Lock: Spec 135 FE-31.
- **Auth and checkout are existing or hosted, not converted.** Sign-in is the existing Buildo sign-in (web and mobile), shared and declared; the `(auth)` screens stay "never" in §12. Checkout and billing are Stripe-hosted (Checkout, Customer Portal).

> Dated note 2026-11-11 (M-246, prior text kept; MF-48 · McFrontend queue · lane E; operator, verbatim: "just to understand for the McFrontend and the web pages we are still using schema's and no code. except all recommendations"; record `~/Buildo-scratch/mcfrontend/MF-48/DECISIONS.md`, D-5 (b); plan `~/Buildo-scratch/mcfrontend/MF-48/plan.v2.md` §1): "use existing standard components" settles a part a library could also ship. The report's "See details" panels and "How?" steps on mobile are the vendored `Button` (with `accessibilityState.expanded`) and a plain `View` present only while open, not a vendored Collapsible (no new package, no manifest change). The same rule draws the small chips (confidence, option tag, Illustration, notes count) as `Text` in a `View`, not a new vendored Badge. A new component kind would be a new decision.

### 11b.2 The pipeline

descriptor → content → generator → standard library component (through ONE binding per archetype per platform) → goldens → gate → locks → canaries.

| Step | What it is | Ruled in |
|---|---|---|
| Descriptor | `surface.schema.json` gains `render.form` (a JSON Schema + uiSchema reference), `render.list.columns` and `render.wizard.steps` by one Spec 128 §4 escalation; the validator, types and registry regenerate. `UNRESEARCHED` fails the gate | Spec 128 §4; queue MF-42 |
| Content | every user-visible string comes from a content file; library default strings (e.g. "No records") are overridden from content | §11a.1 `content`; FE-18 |
| Generator | descriptor + content → the binding's input; regenerated, never hand-edited | FE-02 |
| Binding | one per archetype per platform. A value binds only through the closed binding set (§11a.1) plus `contract`: a field of a declared CONTRACT descriptor's response projection | FE-18, FE-27, FE-32 |
| Goldens | one props golden per reachable state per declared target at `src/tests/fixtures/surfaces/<surface_id>/<state>.<target>.json`, each `covers` a state; one render smoke per archetype per platform (web `renderToStaticMarkup` in root vitest; mobile jest-expo). Every declared state (error, unauthorized, offline, rate_limited) maps to a library state component. REPORT goldens are unchanged | FE-31 |
| Gate | `surface-validate.mjs --check` gains the generic arms SV-DESC, SV-SCREEN, SV-SBIND; the REPORT arms and the success line are unchanged | FE-13 dated note 2026-11-09 |
| Locks | conformance (FE-31), the `contract` binding kind (FE-32), generated-only incl. the vendored manifest (FE-02), no maths in bindings (FE-05), parity keyed by surface (FE-07) | Spec 135 |
| Canaries | one planted defect per archetype in use, incl. a planted wrapper component; the arms print "examined N" | FE-31 |

A converted-surfaces manifest has two-direction totality against the MaxBLD-scope descriptors marked converted; an empty manifest is a finding.

> Dated note 2026-11-09 (MF-42 · McFrontend queue · lane G; M-246, prior text kept; operator, verbatim: "P42 decisions approved" and "approved smaller version"; record `~/Buildo-scratch/mcfrontend/phase1/open-questions.md`, "Operator ruling 2026-11-09: MF-42 decisions"): as ruled (P42-D1 a, D2 a, D5 a, D8): (1) `render.form` is a contract schema reference plus a closed field list, and the binding GENERATES the library uiSchema (no uiSchema file); (2) `render.wizard.steps` is deferred (no consumer); (3) the manifest is `scripts/surfaces/_schema/converted-surfaces.json`; an empty `converted` list is a finding except while `waits` names an open queue row (checked by the FE-31 lock); (4) the parked and report lists are declared data in that manifest, never derived; (5) "one render smoke per archetype per platform" is its own row, Spec 135 FE-33 (MF-37 web, MF-35 mobile). (6) `status: "generated"` also covers a surface converted in place to be rendered from descriptors (the schema's description reads "from its first commit"; the schema and the generated registry are unchanged).

> Dated note 2026-11-10 (the binding standard; McFrontend MF-40 plan delta 1, option C, also unblocks MF-35; M-246, prior text kept; operator, verbatim: "y recommendation: C, with the four trims. approved"; record `~/Buildo-scratch/mcfrontend/phase1/open-questions.md`, "Operator ruling 2026-11-10: the shared binding standard (MF-40 plan delta 1, also unblocks MF-35)"; plan `~/Buildo-scratch/mcfrontend/MF-40/plan.delta-1.md` §3 with the §8 folds): one shared standard for binding array data and error details, built once before the MF-35 and MF-40 code. (1) **Contract paths (extends FE-32, same `contract` kind).** A ref is `<contract_id>.<seg>(.<seg>)*`: a name segment is the wire key as sent (letters, digits and `_`, not starting with a digit, so camelCase and a leading underscore such as `_debug` are kept; never mapped to snake case; one home, the response) and must be on that CONTRACT's `inputs.field_whitelist`; a numeric segment is an item index (`0` or a number without a leading zero; `01` is refused) and may only follow a name. The two-part form `<contract_id>.<field>` is unchanged. The whitelist is flat, so a path is checked by name only (accepted and stated). (2) **Error details.** The second segment `errors` is reserved: `<contract_id>.errors.<class>.<field>`, the class one of the contract's `errors.classes[]` and the field in that class's new optional `fields` list; the contract row says where each field comes from (for example the `Retry-After` header, in seconds). A field whitelist naming `errors` is an SV-DESC finding. (3) **Run-time select options.** A FORM select may carry `options_from {items, value, label}` (a contract path to an array and two item fields on the whitelist) in place of a static `enum`; the static-enum value rule `[a-z0-9_]+` stays; the option labels are data shown as sent, like LIST cells; the server still validates the value. (4) **The generic LIST.** `render.list` gains `id_field` (required by SV-DESC for a converted web LIST with columns), optional `rows` (a contract path to the row array; absent means the response is the rows, as for media), a column `display: "image"` with an `alt_field` (no sort), a column `values` list for `display: "enum"`, and `row_actions[]` of kind `delete`, `edit` or `toggle_active`, each with a content-key `label`. Keys are derived by convention from the surface id and the action kind (`<id>.col.actions`, `<id>.<kind>.title`, `<id>.<kind>.close`, `<id>.preview.unavailable`); boolean and enum cells show `<label>.option.<value>`; only `delete` is red; `delete` and `edit` open the Modal, `toggle_active` opens none. The default sort is the first column with a `sort_field` that is not an image, ascending; a LIST with no such column starts unsorted (for `admin_media` this is `kind`, the same column as before). A boolean or enum cell whose value is not a declared option throws at render and takes down the list, like a missing content key, so a column `values` list must track the DB enum; an image column without `alt_field` throws (SV-DESC already requires it on a converted descriptor). `admin_media` now declares its preview as the first column (image, alt `alt`), `id_field: asset_id` and one delete action, and its 7 goldens regenerate with identical props (fingerprint re-stamp only; evidence `docs/reports/red-evidence/MF-40/binding-standard-restamp-fingerprint-only.txt`). (5) **Component names** keep one home, `bindings.json mapping.<platform>.<archetype>` (D-23); the web bindings keep plain JSX and their names are unchanged by this note; the mobile table shape is MF-35's lock edit. (6) The golden builder covers every surface of the converted manifest (`src/tests/surfaces/surface-goldens.ts`). The descriptor schema grows by this ruling through the Spec 128 §4 route (Spec 135 FE-31 note (2)); locks: FE-31 (C-6 plant), FE-32 (path cases), with red evidence `docs/reports/red-evidence/MF-40/binding-standard-red.txt`.

> Dated note 2026-11-10 (M-246, prior text kept; MF-35 OUTPUT panel fold, APPROVE WITH FOLDS, `~/Buildo-scratch/mcfrontend/MF-35/panel-out/output-panel.md`; operator, verbatim: "MF-35 a"; pre-approved D-27, `~/Buildo-scratch/DECISIONS-PREAPPROVED-20261108.md`): MF-35 is the first mobile user of the note above. `bindings.json` `non_display_keys` is ONE list for every platform; MF-35 added the React Native prop names that carry no display text (edges, top, navigate, keyboardShouldPersistTaps, contentContainerStyle, style, maxWidth, paddingBottom, alignItems, returnKeyType, autoCapitalize, autoCorrect, placeholderTextColor, accessibilityRole, accessibilityState, checked, disabled, iconClassName, action, route, parcelId, onPress, onChangeText). A web golden that put display text under one of these names would not be judged by SV-SBIND, so a later web binding reuses a name only for non-display data. `ref_kinds` gains `derived` (P35-D14 a, a declared per-surface deviation with a closed name list, not a binding source). The promoted mobile binding entry `shared_mobile_surface_binding` is archetype SEARCH (operator "MF-35 a"), the archetype of the modules it owns.

> Dated note 2026-11-10 (MF-54 · McFrontend queue · lane G; M-246, prior text kept; operator, verbatim: "MF-40 - yes an ad can run without an end date, b teh admin? c. yes d. doesnt matter", answer c; record `~/Buildo-scratch/mcfrontend/phase1/open-questions.md`, "Operator answers 2026-11-10: MF-40 OUTPUT panel questions"; plan `~/Buildo-scratch/mcfrontend/MF-54/plan.md`): the closed error-class list `errors.classes[].class` in `surface.schema.json` gains `409`, a conflict the client must reload for (for example a stale `updated_at`). The binding standard's error-detail segment (item (2) of the note above) may therefore name it: `<contract_id>.errors.409.<field>`, with the field on that contract's 409 row. `contract_admin_offer_upsert` (STALE_OFFER) and `contract_admin_advertiser_upsert` (ADVERTISER_ID_TAKEN) now declare their 409 in a 409 row; their 400 rows no longer carry it. The list stays closed: no other class is added, and an unknown class still fails the generated validator and SV-DESC. The growth is recorded through the Spec 128 §4 route as Spec 128 §6 ASK-24 (the ASK-20 precedent for 404). Types regenerated; the validator reads the schema at run time. Test `src/tests/surfaces/error-class-409.logic.test.ts` (not an FE lock), red evidence `docs/reports/red-evidence/MF-54/error-class-409-red.txt`.

> Dated note 2026-11-11 (M-246, prior text kept; MF-48 · McFrontend queue · lane E; operator, verbatim: "just to understand for the McFrontend and the web pages we are still using schema's and no code. except all recommendations"; record `~/Buildo-scratch/mcfrontend/MF-48/DECISIONS.md`, D-2 (a) and D-4 (a); plan `~/Buildo-scratch/mcfrontend/MF-48/plan.v2.md` §1): (1) **The mobile REPORT binding.** A new promoted census entry `binding_mobile_report` (platform_shared, archetype REPORT) owns `mobile/src/components/surfaces/ReportBinding.tsx` (pure: the v21 page view to a props tree, refs only) and `ReportPageHost.tsx` (the screen-local UI state and the bottom sheet). The ONE shared renderer `SurfaceRenderer.tsx` lists the archetypes SEARCH and REPORT and keeps its owner `shared_mobile_surface_binding`; the operator's "MF-35 a" (a promoted entry carries the one archetype of the modules it owns) is amended for the render half only. This one ruling also answers MF-51 D-B. `mapping.mobile.REPORT` is the renderer's closed REPORT list (a subset of the SEARCH parts, so the COMPONENTS table is unchanged) and `mapping.mobile.REPORT_HOST` the host's. (2) **The `part` ref kind.** `ref_kinds` gains `part`: `{"part": "<section id>.<part index>.<role>"}` names one part of the page view built by MF-57's landed core (`pageViewOf(buildPage(response), {target: "mobile"})`, `src/lib/surfaces/report/core.ts`), and an ad section's two shown texts are `{"part": "<id>.ad.value"}` and `{"part": "<id>.ad.disclosure"}`. The phone only looks the ref up; a missing section, index or a role mismatch throws. There is no second page resolver: the page is built and checked by the core, on the server in Stage B and by the golden capture in Stage A. The props goldens therefore hold structure only and every shown text stays a ref (FE-18, FE-32). They sit at `src/tests/fixtures/report-page/props/<state>.mobile.json`, beside MF-57's page goldens and outside the gate root until MF-57 D-D is ruled.

> Dated note 2026-11-11 (M-246, prior text kept; MF-53 · McFrontend queue · lane E; operator, verbatim: ""choose your lot" and "address issues" screens should be built now and we should only be using the new report obviosuly"; plan `~/Buildo-scratch/mcfrontend/MF-53/plan.v4.md` §3 and §8 items 1-2): the first mobile LIST binding, for S-071 `mobile_parcel_disambiguation_map` (`render.projection: map`). The props half is `mobile/src/components/surfaces/LotMapBinding.tsx` (owner: the new promoted entry `binding_mobile_list`, S-083); the render half stays the one shared renderer `SurfaceRenderer.tsx`, which now lists SEARCH, REPORT (MF-48) and LIST (the render-half amendment of MF-48 D-2 a). `bindings.json` `mapping.mobile.LIST` adds react-native-maps' own `MapView`, `Polygon` and `Marker` (configured by props; no hand-built part); react-native-maps (already a dependency, 1.20.1; §11b.4) is a C-8m part source, not a `libraries.mobile` entry, because two Buildo-app files import it (the MF-48 L-1 precedent). The map is hidden from screen readers (the lot cards are the accessible list) and never animates (`initialRegion` only). Client reshapes (GeoJSON to map coordinates, the start view to a region, lot letters, the reused dark map style) bind as `derived` names under the P35-D14 a deviation form. The map tiles are declared as a `deviations[]` entry on S-071 until MF-39 lands the `external_embed` file (operator item 3: "c ... fallback b").

> Dated note 2026-11-11 (M-246, prior text kept; MF-76 · McFrontend queue · lane E; operator, verbatim: "Wow this looks great! 1. y 2. add not legal advice as well. 3. keep it 4. I think we need subscription boxes ..." (landing v9 rulings), "1 y 2 y 3 ? 4y 5 y 6 y 7 y - buildo doesnt exist - focus on MaxBLD 8. y" (D-1 a, D-2 a, D-5 a, D-6 a), "3 y" (D-3 a) and "you keep getting hung up on this... there will be more than 3 when we complete the increments we are building this for a future launch date - include all the build scenarios"; record `~/Buildo-scratch/mcfrontend/MF-46/DECISIONS.md` ("Operator round (2026-11-11 ~15:45)" and the rulings after it); plan `~/Buildo-scratch/mcfrontend/MF-46/plan.md` v3 (§3, §12, §13, §13a, §13b)). **The static page contract gains the landing kinds** (`scripts/surfaces/_schema/static-page.schema.json`, plan v3 §12 fold 18): `hero`, `figures`, `items` and `plans` join `prose` and `footer`, each with its closed roles. Still content keys only and never a number; a part may name `value`, a declared server read, whose content is then a template with one `{value}` slot filled on the server (Spec 128 §4 dated note of this date, FE-37); four roles carry no content key (`checked`: the report loading state's citywide lines; `demo`, `picture`, `scene`: the shared REPORT renderers); a link may carry one query parameter and one fragment. The binding (`src/components/surfaces/web/StaticBinding.tsx`) renders the new kinds with the same mapped Mantine parts and embeds the shared `ReportView`, its `Picture` and `ReportPage` by exact name and module (named exception of the FE-31 C-8 lock and of the MF-44 component fence; Spec 126 §11b.1 "REPORT keeps the landed renderer", FE-07). Goldens: `src/tests/fixtures/surfaces/web_landing/{static,degraded}.web.json`.

### 11b.3 The pages (card §1.1, §1.2)

| Descriptor | Archetype | Disposition | Queue |
|---|---|---|---|
| `mobile_parcel_detail` | REPORT | web: the landed renderer on a web route; mobile: a REPORT binding onto mobile library primitives | MF-44, MF-48 |
| `overlay_sponsor_slot` | SLOT | through MF-20 | MF-20 |
| `mobile_parcel_search`, `mobile_parcel_disambiguation_map` | SEARCH, LIST | mobile on the library; the `web` target is added later | MF-35, MF-44 |
| `admin_media` (new) + its upload FORM | LIST, FORM | upload through `@mantine/dropzone` (dated note 2026-11-09, MF-37, Wave 1 decision batch item 3: not installed; the upload uses RJSF's built-in file input) | MF-37 |
| `admin_placements` | FORM | on the library | MF-40 |
| `admin_surface_registry`, `admin_drift_status` (then orphan, fan-out, role matrix) | LIST, DASHBOARD | registry and drift first | MF-30 |
| `web_landing` | STATIC | the maxbld.ca landing, from content (D-9) | MF-46 |
| `web_login` | existing, shared | existing literals exempt by listed path; new MaxBLD strings from content; on the MaxBLD host the persona picker is hidden (Spec 116 N4) and the post-login target is the MaxBLD search page, never `/dashboard` | MF-46 |
| terms | FORM field | a checkbox in the sign-up form writing `tos_accepted_at` only, never `onboarding_complete` (D-10) | MF-46 |
| `web_subscribe*` | hosted | Stripe-hosted Checkout and Customer Portal for `parcel_tool` | MF-47 |

> Dated note 2026-11-09 (MF-42 · McFrontend queue · lane G; M-246, prior text kept; operator, verbatim: "P42 decisions approved" and "approved smaller version"; record `~/Buildo-scratch/mcfrontend/phase1/open-questions.md`, "Operator ruling 2026-11-09: MF-42 decisions"): measured at `ffb6b0610`, MF-20 is DONE (MF-20@7b152d7e1) and rendered the ad slots through the REPORT path, while the `overlay_sponsor_slot` descriptor stays `status: exists`. The converted manifest therefore lists it under `parked`, not under a DONE row, until a row converts it; operator confirmation owed (MF-42 hand-back). The manifest's parked list is therefore the eight non-REPORT surfaces of the list below plus `overlay_sponsor_slot`; `admin_ledger_visualiser`, parked below, is a REPORT archetype and sits in the manifest's `report` list (REPORT archetypes only), so the gate still counts 9 parked with different members.

> Dated note 2026-11-09 (MF-42, push 15 stacking; M-246, prior text kept; operator, verbatim: "yes"; record `~/Buildo-scratch/mcfrontend/phase1/open-questions.md`, "Operator answers 2026-11-09 (push 14/15 items)"): the "operator confirmation owed (MF-42 hand-back)" above is answered: the sponsor slot and the report ad slot are one slot. `overlay_sponsor_slot` stays parked. `mobile/src/components/parcel/SponsorSlot.tsx` (rendered at `mobile/app/(app)/parcel-tool/[parcelId].tsx:227`) is retired when the mobile parcel report screen converts to the report renderer, and the MF-20 ad slot replaces it there. No new row, no code.

- **Parked (9, "left out, not faked"):** `mobile_tracked_lots`, `mobile_parcel_account`, `shell_parcel_tool_stack` (move with MF-49, convert on touch), `admin_parcel_cost`, `admin_advertiser_accounts`, `advertiser_self_metrics`, `admin_export_audit`, `admin_run_ledger`, `admin_ledger_visualiser`.
- **OUT (fences unchanged):** scope D (§2.0; Spec 128 R-03); Buildo's onboarding, auth, paywall, tab shells and settings; the anonymous teaser, advertiser self-serve, PDF send, `usage_events`, `app_outputs`.

> Dated note 2026-11-11 (M-246, prior text kept; MF-44 · McFrontend queue · lane E; operator, verbatim: "Build Mf-44 on synthetic goldens" and "01-a 0-2 b as long as they are complaint"; record `~/Buildo-scratch/mcfrontend/phase1/open-questions.md` (bottom) and `~/Buildo-scratch/mcfrontend/MF-44/DECISIONS.md`): the `web` target of `mobile_parcel_search` is added by MF-44 through the one web SEARCH binding (`src/components/surfaces/web/SearchBinding.tsx`, owner `binding_web_search`, the §11b.5 first-use cost), on the installed Mantine parts. W4/W5 web route `/parcel-tool` (the app's route name, §11b.7 A2), W6 `/parcel-tool/<lot>` (A4), under `src/app/(maxbld)/parcel-tool/` with its own layout, error and not-found pages; on the existing host, no root-layout move, no middleware change. W5 on the web is the inline address list of the search's ambiguous state; the map page stays MF-53. Until the live switch (`MAXBLD_WEB_LIVE` in `src/lib/surfaces/maxbld-web.ts`, flipped when MB-44 lands), the web search makes no lookup request (no report is charged) and the report route answers not found after the sign-in and plan check; `mobile_parcel_detail` gains its `web` target with the live switch. Locks: `src/tests/surfaces/search-parity.golden.test.ts`, `src/tests/surfaces/search-web-binding.ui.test.tsx`, `src/tests/maxbld-web-pages.logic.test.ts`.

> Dated note 2026-11-11 (M-246, prior text kept; MF-45 · McFrontend queue · lane E; operator, verbatim: "a" (D-1), "all five a" (D-2..D-6) and "y" (the MB-44 wait dropped, build starts); record `~/Buildo-scratch/mcfrontend/MF-45/DECISIONS.md` and `~/Buildo-scratch/mcfrontend/phase1/open-questions.md`, "2026-11-11 MF-45: operator \"y\""; plan `~/Buildo-scratch/mcfrontend/MF-45/plan.md` with its section 12 folds): the OUT fence is lifted for `usage_events` for the report meter only (D-1 a): signed-in rows only, one select-own policy, no `anon` insert, one event in use (`property_view`). Every other section 7 event, the `anon` offer-impression insert (MF-61), the anonymous teaser, advertiser self-serve, PDF send and `app_outputs` stay OUT. The fence line above is unchanged.

> Dated note 2026-11-11 (M-246, prior text kept; MF-46 · McFrontend queue · lane E; operator, verbatim: "Teh web address will just be maxbld.ca - is that okay?", "5. yes and yes recommend", "1 y 2 y 3 ? 4y 5 y 6 y 7 y - buildo doesnt exist - focus on MaxBLD 8. y" and "3 y"; record `~/Buildo-scratch/mcfrontend/MF-46/DECISIONS.md` and `DECISIONS-v1.md`, `DECISIONS-v2.md`; plan `~/Buildo-scratch/mcfrontend/MF-46/plan.md` v3 with `plan.v1.md`): (1) **Host.** maxbld.ca (apex only) serves exactly the rows of the host table `src/lib/auth/host-policy.ts` (the "host allow-list" of §11b.1); `src/middleware.ts` runs the fence first, before dev mode and classification; every other path there, scope D included, is an empty 404, never a redirect; every other host refuses the internal prefix `/parcel-tool` (MF-44's pages are no longer reachable on the existing host) and is otherwise unchanged. Lock: `src/tests/host-policy.logic.test.ts`. (2) **`web_login`.** The MaxBLD sign-in, sign-up, reset and set-new-password screens are the shared `LoginForm` with an optional `variant` (strings from `scripts/surfaces/platform_shared/F16/surfaces/web_login.content.json`), one mode per route under `src/app/(maxbld)/parcel-tool/` (maxbld.ca `/login`, `/signup`, `/reset-password`, `/set-password`), every move between them a real link (§0b item 11); without the variant the Buildo screen is unchanged (D-7: no Buildo-side work). The post-login target on MaxBLD is the search page through the MaxBLD branch of `src/lib/auth/safe-redirect.ts`, never `/dashboard`. (3) **terms.** The row above ("a checkbox in the sign-up form") is read under DECISIONS-v1 D-2 (b): email sign-up has no session until the address is confirmed and Google sign-up never sees a form, so the one checkbox is a step once after the first MaxBLD sign-in (`/terms-accept`), the server stamps the time, writes only while `tos_accepted_at` is empty, never `onboarding_complete` (D-10 unchanged); the page gate sends an entitled user without a record there first. Lock: `src/tests/maxbld-auth.logic.test.ts`. (4) **`web_landing`** moves to MF-76 (D-1 a). (5) **STATIC on the web (§11b.2, §11b.5 first use).** One static page contract, `scripts/surfaces/_schema/static-page.schema.json` with its data `static-page.json` (the FE-34 precedent of closed section kinds and roles: `prose` and `footer` for MF-46; MF-76 adds the landing kinds), every part a content key, a number refused; the first web STATIC binding `src/components/surfaces/web/StaticBinding.tsx` (owner `binding_web_static`, installed Mantine parts only, links as Next `Link`); the plain pages `web_help`, `web_terms`, `web_privacy` and the MaxBLD error/not-found `web_maxbld_error` under `src/app/(maxbld)/parcel-tool/(static)/` (maxbld.ca `/help`, `/terms`, `/privacy`), public, footer Terms of Service · Privacy Policy · Help & Support with the short legal line. Help & Support shows no contact channel until the one admin support-inbox setting exists (ruled 2026-11-11 item 6; no setting on the tip: owed). Locks: `src/tests/surfaces/static-page.logic.test.ts`, `src/tests/surfaces/static-web-binding.ui.test.tsx`. The table above is unchanged.

> Dated note 2026-11-11 (M-246, prior text kept; MF-46 · McFrontend queue · lane E; plan v1 fold 4; record `~/Buildo-scratch/mcfrontend/MF-46/DECISIONS.md`; OUTPUT panel `~/Buildo-scratch/mcfrontend/MF-46/panel-out/`): item (1) of the note above reads: a refused maxbld.ca PAGE path is rewritten to `/parcel-tool/refused`, which calls `notFound()` (a 404 with the MaxBLD not-found text); an API path stays an empty 404; never a redirect. The Supabase allow-list entry is `https://maxbld.ca/auth/callback**` (GoTrue matches the whole URL); set-new-password needs a recovery entry within the link lifetime.

> Dated note 2026-11-11 (M-246, prior text kept; MF-76 · McFrontend queue · lane E; operator, verbatim: "Wow this looks great! 1. y 2. add not legal advice as well. 3. keep it 4. I think we need subscription boxes ..." (landing v9 rulings), "1 y 2 y 3 ? 4y 5 y 6 y 7 y - buildo doesnt exist - focus on MaxBLD 8. y" (D-1 a, D-2 a, D-5 a, D-6 a), "3 y" (D-3 a) and "you keep getting hung up on this... there will be more than 3 when we complete the increments we are building this for a future launch date - include all the build scenarios"; record `~/Buildo-scratch/mcfrontend/MF-46/DECISIONS.md` ("Operator round (2026-11-11 ~15:45)" and the rulings after it); plan `~/Buildo-scratch/mcfrontend/MF-46/plan.md` v3 (§3, §12, §13, §13a, §13b)). **`web_landing` is the MaxBLD landing (W1), converted.** (1) The descriptor keeps its id, its ref S-005 and its parcel_product scope and is repointed to the internal page `src/app/(maxbld)/parcel-tool/(static)/home/page.tsx`; maxbld.ca `/` is a public host-table row rewritten there (`src/lib/auth/host-policy.ts`); buildo.com `/` is unchanged. (2) `src/app/page.tsx` (the Buildo lead-gen page) is byte-identical and keeps its measured knowledge (the checks, the limitations, the divergence note) under its own scope-D descriptor `web_buildo_landing` (S-091, estate_other F92; plan v3 §12 fold 15). (3) The page is descriptor + content (`web_landing.content.json`) + the web STATIC binding with the landing kinds hero, figures, items and plans and the plain pages' footer; states `static` and `degraded` (no stored citywide row). (4) Its values are declared server reads (Spec 128 §4 dated note of this date; FE-37): the five citywide lines through MF-62's producer and its own templates (one content home), the scenario count and the hero list from `web_landing.scenarios.json` (every launch scenario type of McBylaws increments 1-6, each naming its increments-table row), the cost sources from `web_landing.cost-sources.json` (the named sources of Spec 88 §3), the trial and Basic allowances from migration 303. (5) The processing demo is the shared REPORT loading state (`ReportView` over a loading view of the citywide group, MF-62 pacing, Skip and View report links to `/#sample`) and the sample is the shared `ReportPage` over one committed synthetic tree (`web_landing.sample.json`, rebuilt by `scripts/surfaces/report-page-capture.ts`), in a named, keyboard-reachable region that fades in by opacity when the demo ends; both embedded in the binding by exact name and module (a named exception of the FE-31 C-8 lock). (6) Not shown until their sources exist (no typed value, no setting created): the plan prices and the post-trial line (MF-47's Stripe price reader, D-3 a), the trial length (MF-47 `parcel_tool_trial_months`), the Pro allowance (MF-45), the process scene image (a media-library asset; the operator is choosing the mock) and the report pictures (the image URL signer). Locks: `src/tests/surfaces/web-landing.logic.test.ts`, `src/tests/surfaces/web-landing.ui.test.tsx`, `src/tests/host-policy.logic.test.ts`. The launch list (plan v3 §7) is unchanged and is not a build gate.

> Dated note 2026-11-12 (M-246, prior text kept; MF-46 follow-up, Help & Support contact; operator, verbatim: "All recommendations accepted as long as they are complaint and are standardized, observable, scalable, accurate and understandable ie simple and understandable. Ensure the least amount of code and use schema's" (2026-11-12); record `~/Buildo-scratch/mcfrontend/MF-46/DECISIONS-v1.md` D-6 (a) and `plan.v1.md` fold 8; queue MF-35 note P35-D18 a): (1) **the inbox setting.** The support inbox is the one logic variable `maxbld_support_inbox` (migration 314, a JSONB string seeded empty, the migration 219 precedent; written, applied by the operator's DB job). The address is never typed into a page, a content file, a spec or a test. `src/lib/surfaces/maxbld-support.ts` `readSupportInbox` reads it per request; unset, not a plain address, or a failed read gives no value (logged), never a 500. (2) **the mailto role.** `static-page.schema.json` gains the `prose` role `mailto`: its `content` is the visible label (also the mail subject), its `topic` one of the closed list general, address_match, lot_match, billing, enterprise, and its `value` the declared server read `support_inbox` (FE-37), never an href in the data. `StaticBinding.tsx` renders it as a real link (a Mantine Button as `a`, `mailto:<inbox>?subject=<encoded label>`, `data-topic`). A part whose value is absent is left out by the one value rule `keepValued` (`maxbld-static.ts`, MF-76's rule, now shared with the landing). `web_help` lists one mailto part per topic; each label is a content key in the goldens. (3) **the prefill.** The topic, query and lot travel in the URL fragment (`/help#topic=address_match&q=...`), never a query string; the island `help/HelpPrefill.tsx` turns CR, LF and every control character into spaces, caps each value, URI-encodes it and adds it as the body of the fragment topic's link only; nothing is written as HTML. (4) **Report incorrect address match** (P35-D18 a): `mobile_parcel_search` state `ambiguous` gains the content key `list.report` and the action `open_help {topic: address_match, q: {derived: input}}` on both targets (FE-07 parity): the app leaves for `MAXBLD_HELP_URL` (`mobile/src/lib/maxbldHelp.ts`, `Linking.openURL`; pinned equal to `MAXBLD_ORIGIN` + `/help` because the app cannot import `host-policy.ts`), the web renders a real link to `/help#topic=address_match&q=...`. The map page's "Report incorrect lot match" (MF-53, topic lot_match with the parcel) is not on the page yet and is not added here.

### 11b.4 The libraries

Operator, verbatim: "D-0-D-4 approved D-3 we should used our existing components and approach as detailed in the mobile build specs" (record "Operator rulings 2026-11-09: programme card v2.1 Part A, D-9").

| Platform | Library | Ruled by |
|---|---|---|
| Web and admin | Mantine 9 + `@rjsf/mantine` (forms from JSON Schema + uiSchema, AJV 8) + `mantine-datatable` (+ `@mantine/dates`, `@mantine/carousel`, `@mantine/dropzone`; dated note 2026-11-09, MF-37, Wave 1 decision batch item 3: `@mantine/dropzone` not installed, the upload uses RJSF's built-in file input); Mantine CSS in `@layer mantine` beside Tailwind 4 (dated note 2026-11-09, MF-37; operator, verbatim: "a, 1-3 approved"; record `~/Buildo-scratch/mcfrontend/phase1/open-questions.md`, "Operator ruling 2026-11-09: MF-37 blocker and owed items", item (a): the web library is Mantine 8.3 (`@mantine/core`, `hooks`, `dates` 8.3.18; `mantine-datatable` 8.3.13; `@rjsf/mantine` 6.11.1 unchanged), amending D-2's "Mantine 9", because Next 15.5.15 bundles its own React for the app router (`next/dist/compiled/react` 19.2.0-canary-0bdb9206-20250818), which does not export `useEffectEvent` or `Activity`; Mantine 9.8.0 imports both, so `next build` failed at compile (the MF-37 provider spike, `~/Buildo-scratch/mcfrontend/MF-37/output-panel/provider-spike.txt`)) | D-2; Spec 33 dated note 2026-11-09 |
| Mobile | React Native Reusables per Spec 90 §6. The CLI output is vendored unmodified in `mobile/src/vendor/rnr/` under a closed, protected manifest that records the CLI version; an added or edited file fails (FE-02) | D-3; Spec 90 §6 dated note 2026-11-09 |
| Auth | the existing sign-in, shared and declared | §11b.1 |
| Subscription | Stripe-hosted Checkout and Customer Portal | D-0 (card §1.2); domain D-13 |

The library theme is generated from the brand token source (Spec 117 §7 dated note 2026-11-09). The libraries come in under the named freeze lift (D-1).

> Dated note 2026-11-10 (M-246, prior text kept; MF-35 · McFrontend queue · lane MF-35 build; P35-D8 a and P35-D9; operator, verbatim: "approved except for 9 - the report should still show with the google street view photo if its not available - just the photo space should not show"; record `~/Buildo-scratch/mcfrontend/phase1/open-questions.md`, "Operator ruling 2026-11-09: Wave 1 decision batch"; batch `~/Buildo-scratch/mcfrontend/PROGRAMME/BATCH-W1-20261109.md` :102, :106; plan `~/Buildo-scratch/mcfrontend/MF-35/plan.v3.md` §3): the vendored set in `mobile/src/vendor/rnr/` is the CLI output plus the documented `cn` helper. The CLI checks only that a `cn` helper exists; it is not a registry item. `lib/utils.ts` is copied verbatim from the Reusables manual-install page and listed in the manifest with `source: "docs"` and its sha256; it is never edited. The CLI pin does not pin the output (`@react-native-reusables/cli@0.7.1` runs `shadcn@latest`), so the manifest (`scripts/surfaces/_schema/vendor-rnr.manifest.json`) also records the resolved `shadcn_version` and each registry JSON's sha256; a re-run that yields other bytes is a manifest change with its own panel.

> Dated note 2026-11-11 (M-246, prior text kept; MF-48 · McFrontend queue · lane E; operator, verbatim: "just to understand for the McFrontend and the web pages we are still using schema's and no code. except all recommendations"; record `~/Buildo-scratch/mcfrontend/MF-48/DECISIONS.md`, D-3 (a); plan `~/Buildo-scratch/mcfrontend/MF-48/plan.v2.md` §1, §2 L-1): the report's "Add lot size" sheet uses the app's existing bottom sheet `@gorhom/bottom-sheet` (already a dependency, `mobile/package.json`; Specs 91, 93 and 94; the sign-in sheet pattern), not a vendored Reusables part and not a centred modal. It is held by the screen host `mobile/src/components/surfaces/ReportPageHost.tsx`, never by the shared renderer, so the SEARCH screens never load it. The FE-31 C-8m lock carries a host list: the host's COMPONENTS table may take parts from `@gorhom/bottom-sheet` and the shared renderer, and any other package fails. `bindings.json` `libraries.mobile` is NOT extended: `libraries` names the MaxBLD-new packages, and `@gorhom/bottom-sheet` is imported today by seven Buildo-app files (sign-in, sign-up, profession, AccountLinkingSheet, LeadFilterSheet, SearchPermitsSheet, NotificationPermissionModal), each of which would become a C-2 finding (measured, `docs/reports/red-evidence/MF-48/`). This is a lane finding against the decision's cost line and waits for the operator's nod; listing it would mean one entry plus seven exemptions.

### 11b.5 Per-archetype infrastructure on first use

The first consumer of an archetype on a platform adds its binding entry, golden shape, one planted-defect case, one render smoke and its `frontend` path globs; nothing else. The web binding lands with MF-37 (the first web FORM and LIST), the mobile binding with MF-35. R-PACE-1 applies per archetype (Spec 127 §4.4). The decision mechanism is unchanged: Spec 128 §4 rulings, Spec 08 PLAN and OUTPUT panels per row, McBylaws owner review on gate code.

### 11b.6 How it meets the five principles

| Principle | How |
|---|---|
| Standardization | one pipeline and one library per platform for every MaxBLD page; no hand-built component (import boundary) |
| Observability | every declared state maps to a library state component; render smoke per archetype; per-row in-product signals (error page from content, Sentry capture) are PROSE-ONLY until MF-21 |
| Scalability | a new page is a descriptor + content; an archetype pays its infrastructure once, on first use |
| Accuracy | values only through the closed binding set; no maths in bindings; conformance and parity locks |
| Understandability | one home: this section; rules in Spec 135 FE-31, FE-32; tasks in `.cursor/MCFRONTEND-QUEUE.md` |

The six McFrontend principles (§0a) are answered per row in the Spec 135 `Six` cells.

### 11b.7 MaxBLD page set (operator 2026-11-09)

> Dated addition 2026-11-09 (MaxBLD page set · McFrontend queue · lane R; M-246, prior text kept, nothing above changed; record `~/Buildo-scratch/mcfrontend/phase1/open-questions.md`, "Operator direction 2026-11-09: the MaxBLD page set" and the two operator lines below it; source: the master list the operator approved, `maxbld-pages.html`, and the page inventory `pages-inventory.json`, read at `67d47542f`). This subsection commits the page set, as the last message below asks. §11b.3 stays the descriptor table; this subsection is the page list, its connections and the rules the operator gave for it.

Operator, verbatim (four messages):

- "some of these pages are confused between the MaxBLd and Buildo. MaxBld for the appt (1) Search Page (2) Search Page if two parcels selected (3) Report Page (4) Report Detail Page Still Needed (1) Account Profile Info (2) Saved Reports (provide Notifications to these lots COA updates) Web Only (3) Login Web: (1) Landing Page (2) Login (3) all the mobile pages (4) check-out (ie buy / cancel subscription / trial (5) onboarding is option - builder/realtor (but not necessary. Can you think of another others?"
- "A. just expanded B. Im not sure but sometimes on a phone you get logged out - I dont know why - if you buy on the web - you would need to log in once on your phone. c. should come later. Let's get it working. your right we need 1-6 as well. Can you make a master list of all the MAxblf pages required and perhaps how they are connected as well. We need to add this to a spec. maybe even the McFront-end. also when should I provide the layout for these pages? Let's organize what we have here into a master list and how they connect and anything unique about them. however , it is normally done"
- "As part of the sunscriptions we want to offer a free trial"
- "Looks great! Commit the page set - we already have a brand spec - they should work together"

Reading (record, same section): A = the report detail is the expanded card; B = login in the app too, the app keeps the session; C = PDF/share later; "1-6" = sign-up and password reset, Terms and Privacy, delete account in Account, notification settings in Account, the report-limit state on the Report page, a support contact link.

**Ownership.** Spec 126 owns which pages exist and how they connect; Spec 117 owns how they look (colours, type, tokens). A page here takes its look only from 117 via the generated theme (Spec 117 §7 dated note 2026-11-09; §11b.4). Spec 117 §6 already holds per-page layout guidance: §6.1 the search page (S-002, incl. the suggestion chips), §6.2 the shelf (S-004: Lookup · Tracked Lots · Account) and §6.3 Tracked Lots (S-072, its tokens and layout). Per-page layouts live in Spec 117 §6; the page set lives here. The page name "Tracked Lots" follows the app (`mobile/app/(app)/parcel-tool/_layout.tsx:12`, `tracked.tsx:7`) and Spec 117 §6.2-§6.3.

**Phone app.** Routes are today's routes in the Buildo app's `parcel-tool` group and the shared `(auth)` group; the group moves to the MaxBLD app with MF-49.

| Id | Page | Route | What is special | Queue |
|---|---|---|---|---|
| A1 | Sign in, sign up, reset password | `/(auth)/sign-in`, `/(auth)/sign-up`, `/(auth)/confirm?code=`; reset: not set | shared with Buildo; a customer who bought on the web signs in once on the phone; the app keeps the session, and an unexpected sign-out is a bug | MF-49 |
| A2 | Search | `/(app)/parcel-tool` (index) | address entry, Toronto only; shows the reports left this month | MF-35 |
| A3 | Choose your parcel | `/(app)/parcel-tool/disambiguate?q=&kind=` | shown when an address matches two or more parcels; pick on a map or list; a stub today (Back button only) | MF-35 |
| A4 | Report | `/(app)/parcel-tool/[parcelId]` | scenario cards with headline numbers; each card expands to every field (no detail page); one Street View photo, the photo space collapses when none is available; per-scenario ad slot and report images from admin; each new report counts toward the monthly limit, with a "limit reached" state; a Save button; PDF and share later | MF-48 (also MF-20 ad slot, MF-38 images, MF-39 photo, MF-45 limit) |
| A5 | Tracked Lots (saved reports) | `/(app)/parcel-tool/tracked` | the lots the customer tracks (the Save button on the Report adds one); a CoA update on a tracked lot sends an alert and marks the lot; today example rows, no API | MF-51 |
| A6 | Account | `/(app)/parcel-tool/account` | profile, plan and reports used; notification settings for the CoA alerts; delete account (app-store rule); support, Terms, Privacy, sign out; plan changes link to the web, no purchase in the app | MF-52 |

> Dated note 2026-11-11 (M-246, prior text kept; MF-53 · McFrontend queue · lane E; operator, verbatim: ""choose your lot" and "address issues" screens should be built now and we should only be using the new report obviosuly"): row A3 is built by MF-53 (the stub is gone): one address over several lots shows the lots on a map with letters and cards (area, frontage, zoning) and opens the chosen lot through the same report route as a single match; an address found with no linked lot shows "No lot linked yet" with the pin and faint neighbouring lots; several such addresses the message only; more than 10 lots on one address "This address has many lots. Add a unit number or pick a nearby address."; an intersection "That looks like an intersection. Type a house number to see the lots." (the map version is MF-60). Nothing is selected at open. "Report incorrect lot match" arrives with MF-46. W5 stays MF-44 (a web map needs a web map library outside §11b.4).

**Web (maxbld.ca).**

| Id | Page | Route | What is special | Queue |
|---|---|---|---|---|
| W1 | Landing | `/` | the front door: what MaxBLD does, Sign in and Start trial; today it still sells Buildo ("Find Construction Leads") | MF-46 |
| W2 | Sign in, sign up, reset password | `/login`; `/signup` (listed public in `src/lib/auth/route-guard.ts:46`, no page); reset: not set | the same account as the app, MaxBLD wording | MF-46 |
| W3 | Checkout | `/subscribe`, `/subscribe/success`, `/subscribe/cancel` | buy, start a trial or cancel through Stripe-hosted Checkout and Customer Portal; sells Buildo lead-gen today | MF-47 |
| W4 | Search | not set (under the nested `(maxbld)` layout) | A2 rendered for the browser from the same descriptor | MF-44 |
| W5 | Choose your parcel | not set (same) | A3 for the browser | MF-44 |
| W6 | Report | not set (same) | A4 for the browser, same rules | MF-44 |
| W7 | Tracked Lots | not set | A5 for the browser | MF-51 |
| W8 | Account | not set | A6 for the browser; Manage plan opens the Stripe portal directly | MF-52 |
| W9 | Terms, Privacy | not set | plain pages; the app stores need a privacy link and Stripe needs terms | MF-46 |
| W10 | Onboarding: builder or realtor | not set | optional, later; not in the first version | none (later) |

**Admin pages that feed MaxBLD.**

| Id | Page | Route | What is special | Queue |
|---|---|---|---|---|
| D1 | Report preview | `/admin/report-preview` | shows the report exactly as customers see it; the only page already on the shared report renderer | none (exists) |
| D2 | Media library | not set | upload report images and advertiser creatives | MF-37 |
| D3 | Ads and placements | not set | which offer appears in each scenario's ad slot | MF-40 |
| D4 | Parcel cost | `/admin/parcel-cost` | checks the cost numbers the report shows | none (parked, §11b.3) |

**Connections** (solid = a link the customer follows; content = reaches the page from elsewhere):

- Landing -> Sign in / sign up / reset (front door)
- Sign in -> Checkout (no plan yet, web)
- Sign in -> "Subscribe at maxbld.ca" message (no plan yet, app; no purchase in the app)
- Checkout -> Search (plan bought)
- Sign in -> Search (has a plan)
- Search -> Report (one parcel matches)
- Search -> Choose your parcel (two or more match) -> Report
- Report -> Tracked Lots (Save) -> Report (open a tracked lot)
- CoA update on a tracked lot -> Tracked Lots (alert, content)
- Report -> "Limit reached: upgrade on the web" (monthly limit reached)
- Search -> Account (menu)
- Account -> Checkout (manage plan, web only)
- Account -> Terms / Privacy / Support
- Admin media library -> Report (report images, content)
- Admin ads and placements -> Report (ad slot, content)

**Rules from the rulings:**

1. The report detail is the expanded card; there is no separate detail page (A).
2. Login is on the phone too: buy on the web, sign in once on the phone, and the app keeps the session (B).
3. No purchase inside the app; plan changes link to the web (D-11, unchanged).
4. PDF and share come later (C).
5. The subscription offers a free trial (Stripe trial on the price, MF-47). Owed before MF-47 builds: the trial length, whether a card is required up front, and the report allowance during the trial.
6. The basic plan allows 15-20 reports a month; the exact number is owed (MF-45).
7. One Street View photo per report; when none is available the report still shows and the photo space collapses (operator, verbatim: "approved except for 9 - the report should still show with the google street view photo if its not available - just the photo space should not show"; MF-39).
8. Delete account and notification settings live in Account (MF-52).
9. Terms, Privacy and a support contact are required (MF-46 web; linked from Account).
10. Onboarding (builder or realtor) is optional and later; no row now.
11. Layouts are sent per page, just before its row builds, in this order: (1) Search and Choose your parcel (MF-35); (2) Report, the card order and highlights only, since the report schema sets its contents (MF-48, MF-44); (3) Landing, Sign in and Checkout (MF-46, MF-47; Stripe supplies the checkout screens); (4) Tracked Lots and Account, once their rows exist (MF-51, MF-52). A rough sketch or an annotated screenshot is enough; the standard components set the look.

> Dated note 2026-11-11 (M-246, prior text kept; MF-45 · McFrontend queue · lane E; operator, verbatim: "a" (D-1), "all five a" (D-2..D-6) and "y" (the MB-44 wait dropped, build starts); record `~/Buildo-scratch/mcfrontend/MF-45/DECISIONS.md` and `~/Buildo-scratch/mcfrontend/phase1/open-questions.md`, "2026-11-11 MF-45: operator \"y\""; plan `~/Buildo-scratch/mcfrontend/MF-45/plan.md` with its section 12 folds): rules 5 and 6 are answered for the report allowance. The basic plan allows 20 reports a month (record "Operator rulings 2026-11-10 (fourth message): report count, expo-linking") and the trial allows 20 (record "Operator rulings 2026-11-10 (second message): MF-53, free trial, report review"). Both numbers are logic variables, `parcel_tool_report_limit_plan` and `parcel_tool_report_limit_trial` (seed group "MaxBLD Plan", min 1, max 1000), listed and edited in the existing Admin Control Panel (operator, verbatim, 2026-11-11, relayed by the orchestrator: "we should be able to change the number of reports per month in the amdin"); the meter reads them and refuses to serve outside the seed bounds (fail closed). The count resets on the billing date, `entitlements.current_period_end`, else on the monthly date of `entitlements.created_at` (D-2 a). A lot counts once per period; re-opening it is free (D-3 a). A `parcel_tool` holder is metered everywhere; a `lead_gen`-only holder keeps the App A shelf unmetered until MF-50 removes that path (D-4 a). A trial takes the trial allowance; active, past due and admin-managed take the plan allowance; there is no unlimited state (D-5 a). Limit reached is the 403 class with code `REPORT_LIMIT_REACHED`, fields `reportsLimit` and `resetsOn`, and no report data (D-6 a). The server computes every count, the reports left and the limit-reached flag; pages bind to them (FE-05). These rulings also answer small-pages items 6 and 7. The trial length stays with MF-47. Rules 5 and 6 above are unchanged.

> Dated note 2026-11-11 (M-246, prior text kept, nothing above changed; rulings landing · McFrontend queue · lane R; record `~/Buildo-scratch/mcfrontend/phase1/open-questions.md`, the 2026-11-11 entries named per item; the working standard §0b items 6 and 8). The operator's 2026-11-11 rulings on the page set, each verbatim. The MF-65, MF-66, MF-70 and MF-72 rows are added by the queue docs commit b7cdf1e3c (not yet on origin):
>
> 1. **Rule 3 amended: in-app purchase.** Operator, verbatim: "a" (after the App Store Review Guidelines 3.1.1 / 3.1.3(b) were explained, the operator having asked "1. i dont understand - people will buy from our website and then dowload - is that okay? 2. that's fine"). The monthly plan is also offered as an Apple in-app purchase beside web checkout, on one account and the same `parcel_tool` entitlement; Google Play billing policy for Canada is checked first; an MF-49 decision list item, queued as MF-70. Conflict check: this replaces rule 3 "No purchase inside the app" (D-11) and the A6 cell "no purchase in the app" for the app's purchase path; the later operator ruling governs. Until MF-70 lands, the app shows the ruled MF-52 D-5 (a) text. Item 2 ("that's fine"): account deletion offers "delete now" beside the 30-day window, and deleting during the free trial never triggers the first charge (App Store 5.1.1(v)); queued as MF-65.
> 2. **Rule 5, the trial and checkout (MF-47).** Operator, verbatim: "all a - we should be able to change the number of reports per month in the amdin" (record `~/Buildo-scratch/mcfrontend/MF-47/DECISIONS.md`, bottom): D-2 yes (the D-8 trigger is met); D-3 (a) a trial only for an account that never had a MaxBLD plan; D-5 (a) the trial length lives in one admin-editable setting (`parcel_tool_trial_months` = 1) and each checkout sends the trial end to Stripe, so the Stripe price carries no trial (this amends rule 5 "Stripe trial on the price"); D-6 (a) Stripe "trialing" maps to `trial` in the one shared mapping, the row-claim rule unchanged; D-7 (a) a check for an existing subscription before checkout, with (b) as the follow-up MF-66; D-1: the operator sets the Stripe values in admin. The reports-per-month allowance is editable in admin. Small-pages item 4, operator "4 y": Stripe's trial-ending email is turned on, and the line "We'll email you before your trial ends" is shown once the Stripe documentation confirms that email fires for a per-checkout trial end.
> 3. **Rule 9: support, Terms and Privacy.** Operator, verbatim: "We haven't done the landing yet for MAxbld or can show it to me? 1 y 4 y 6 just use [the operator's own address, held out of the repo] for now 7 yes to both 8. you write and validate it with an agent" (record `~/Buildo-scratch/mcfrontend/small-pages-v2/DECISIONS.md`, bottom). Item 6: the Help & Support inbox is ONE admin-editable setting, set by the operator to the address given "for now"; no page, content file or spec types the address. Item 8: the orchestrator drafts Terms and Privacy and an independent agent validates them (`~/Buildo-scratch/mcfrontend/legal-v1`); a lawyer review before launch stays owed (MF-72; MF-58's lawyer check unchanged). Item 1: the tagline "Lot Intelligence" is signed off for every sign-in page and Search (Spec 117 §2.2, OD-B2 dated note of this date).
> 4. **A3 / W5 choose your lot, and the address-issue states.** Item 7, "yes to both": state (i), no lot linked, as drawn; state (ii), more than ten lots, reads "This address has many lots. Add a unit number or pick a nearby address." Operator, verbatim: "a) - as per where things stand \"choose your lot\" and \"address issues\" screens should be built now and we should only be using the new report obviosuly": both build now (MF-53).
> 5. **Only the new report.** Same words: the MaxBLD flow uses only the v21 report in the shared renderer (§11a.7, FE-34); the old hand-built report screen is not used in MaxBLD.
> 6. **Internal live preview (a).** Same words, option (a): an admin-only internal preview of the full flow on real lots, read from the stored Layer 3 results of increments 1-4, behind a switch that is off for customers. Customers see nothing live until MB-44. This pulls an internal admin-only slice of MB-44 forward by operator ruling; the customer-facing MB-44 stays where it is in increment order (McBylaws queue MB-44 dated note of this date).
> 7. **W1 Landing (MF-46).** Audience: real estate agents (operator, verbatim: "Let's turn our attenention to the landing page - We are targeting real estate agents." ...). The trust lines are ruled: four words or fewer, past tense, true (operator, verbatim: "1-9 these are incredibley long sentences - we need four words each or less"); labels are editable content and the numbers are read from data, changeable without code (operator, verbatim: "looks good we should be able to change these as we go."). The five lines as ruled: "496,536 lots scanned", "4,356 by-law rules searched", "427,077 buildings measured", "194,110 builds examined", "27,759 map areas checked" (operator, verbatim: "Pushing. 1. change review for scanned 2. ok 3. yes 4. builds doesn tmean new builds - it means something is built 5. 27759 map areas checked" and "id like to keep builds for now"; accuracy note kept: active permits and CoA applications include work not built yet). The headline and the line under it are NOT ruled: the operator rejected the draft ("This is the worst landing page ive ever seen. ...") and asked for research on each section and the layout; the options stay pending. The numbers follow FE-05 (read from data, never typed).
> 8. **One public address.** Operator, verbatim: "Teh web address will just be maxbld.ca - is that okay?" and "5. yes and yes recommend" (record `~/Buildo-scratch/mcfrontend/MF-46/DECISIONS-v2.md`): maxbld.ca (apex only) is the one address of the MaxBLD web product; buildo.com stays the Buildo product (card D-9). MF-46 D-8 is landed (a9f89373a, 0b2964a0c: one same-origin guard `src/lib/auth/safe-redirect.ts`); MF-46 adds only the MaxBLD branch (fallback the search page, §11b.3 `web_login`). D-9 is dropped: no preview host list; the pages are reviewed on maxbld.ca once attached, before announcement. D-3: `src/middleware.ts`, the new `src/lib/auth/host-policy.ts` and the landed `src/lib/auth/safe-redirect.ts` join the protected list in one MB-67 owner commit before the MF-46 middleware commit.
> 9. **Tracked Lots and Account (MF-51, MF-52).** MF-51, operator "D-A a": MF-51's migration adds only the `favourite_scenario_key` column (record `~/Buildo-scratch/mcfrontend/MF-51/DECISIONS-v2.md`); D-B is answered by MF-48 D-2 (a). MF-52, operator "D-1 a, D-3 y, D-4 y as long as they are complaint and we have grounded the claims" and "a" (D-2) (record `~/Buildo-scratch/mcfrontend/MF-52/DECISIONS.md`): D-1 (a) delete works for every account (the profile row is created if missing, with MF-47 D-4); D-2 (a) the Account form binding honours read-only fields, prefilled from the read contract; D-3 (a) a deleted account cannot open billing (403 `ACCOUNT_DELETED`); D-4 (a) no data-export step, access requests go through Help & Support (PIPEDA Principle 4.9).

**Outside the MaxBLD set.** Buildo's lead-gen pages are not MaxBLD pages and are not listed above: web `/dashboard`, `/builders`, `/builders/[id]`, `/permits/[id]`; mobile lead feed `/(app)/` (index), lead detail `/(app)/[lead]?id=`, `/(app)/map`, `/(app)/settings`, the flight board `/(app)/flight-board` and `/(app)/[flight-job]?id=`; the trade onboarding `/(onboarding)/` screens (`profession`, `path`, `address`, `supplier`, `first-permit`, `terms`, `complete`, `manufacturer-hold`). Admin pages other than D1-D4 are estate admin, not MaxBLD pages.

> Dated sub-note 2026-11-09 — **Report page (W6/A4)** (MaxBLD report page · McFrontend queue · push-17 lane; M-246, prior text kept, nothing above changed). Operator, verbatim: on the agreed brief, "This looks like it"; then "teh rear suite should be an add one to other scenarios". Record: `~/Buildo-scratch/mcfrontend/phase1/open-questions.md` (last entry); the agreed brief `~/Buildo-scratch/mcfrontend/REPORT-LAYOUT-v2.md` (2026-11-04) and the later rulings listed with it in `~/Buildo-scratch/mcfrontend/layouts/REPORT-STITCH-SUMMARY.md`.
>
> 1. **Page.** The lot card, then one card per scenario of the Spec 78 §P5.1 closed set, in catalogue order, as each scenario's rows land.
> 2. **Rear suite.** An add-on inside the other scenario cards, never its own card (Spec 78 §P5.1 "Rear-suite add-on (every row)"). This replaces "Rear suite (5)" in REPORT-LAYOUT-v2 §A.2; no Spec 78 change.
> 3. **Card frame** (REPORT-LAYOUT-v2 §C, same for every scenario): headline, confidence badge and reason, as-of-right per option, "+X m² with a CoA" (an estimate, after the as-of-right line, never the headline; §11a and the Q-MF7 a rules), photos, CoA decisions for this scenario, then More detail (collapsed).
> 4. **Placement** (D0 SIMPLIFIED, 2026-11-09, recorded in the same record): one ordered headline list per scenario in `scripts/surfaces/_schema/report-v2-seed/row-presentation.json`; a row not listed is detail, in catalogue order; no priority numbers and no groups. This replaces the six tiers of REPORT-LAYOUT-v2 §C ("Tier is data").
> 5. **Field names.** Taken from the field generator `~/Buildo-scratch/mcfrontend/fields/extract-fields.mjs` (read-only on origin) and its summary builder `build-stitch-summary.mjs`; every field binds to a DB field (§11a.1, Q-MF3). The brief and the summary are references, not copied into the repo.
>
> Dated note 2026-11-10 (MF-53, prior text kept, items 1-5 unchanged). Operator, verbatim: "they need the address but not a map - they already know where it is..".
>
> 6. **Lot card location.** The lot card shows the address and no map. This amends REPORT-LAYOUT-v2 §B row 2 "Address / map pin": the lot-card location fields (`parcel.lot.centroid_lat`, `parcel.lot.centroid_lng`, `parcel.lot.outline_geojson`) and the map embed (the FE-21 `external_embed` map tiles) are dropped from the lot card.
>
> Dated note 2026-11-11 (MF-57 page table, brief v4 open items 1-5; M-246, prior text kept, items 1-6 unchanged; rulings landing · McFrontend queue · lane R). Operator, verbatim: "push complete 1.a 2. a 3. did the neighbors build bigger - we can tell the difference between detached homes, houseplexes and rear suites correct? these should be allocated to the right scenario. your question is whether the summary answer should match the cards. We should always have something here correct - reach farther depending on the scenario (houseplexes we need to reach farther - because its relevant althought its farther away - becuas there are fewer of them.  4. yes 5. yes" and "as well as secndary suites". Record: `~/Buildo-scratch/mcfrontend/fields/REPORT-LAYOUT-BRIEF-v4.md`, "Open for the operator" and the two entries at its end; `~/Buildo-scratch/mcfrontend/phase1/open-questions.md`, the same two entries.
>
> 7. **Size panel rows with no stored field (item 1 a).** Lot coverage, floor space index, rear setback, side setbacks and main wall height stay pending parts (FE-34); McBylaws pass-through catalogue rows for them are queued after increment 4 (a McBylaws LATER row in the queue docs commit b7cdf1e3c, not yet on origin). No value is derived in the UI (FE-05).
> 8. **Houseplex units (item 2 a).** The title, the Units row and "(average of N units)" bind `unit_count`, not `units_max`.
> 9. **"Did the neighbours build bigger?" (item 3).** The summary answer and the cards use the same per-scenario set: detached, houseplex (2 Unit / 3+ Unit) and rear suite allocated by the stored CoA classification (`coa_applications.structure_type`, `rear_suite_type`), and the house with a secondary suite, found by a classification rule on the description in the existing `scope_tags` pattern, moved out of the detached set. Something is always shown: the server widens the search distance per scenario until the minimum sample is met (the houseplex and the suite reach farther) and the distance is shown. Server counts only (FE-05); queued as MF-71 (b7cdf1e3c).
> 10. **Lot-level notes (item 4, "yes").** Exception, ravine and heritage notes are shown once, under About this lot; each card's note count covers its card notes only.
> 11. **Wording set (item 5, "yes").** The unruled wording of brief v4 item 5 is confirmed as drawn; the How? steps keep the lawyer check (MF-58, MF-72). The picture caption is "Illustrative — not this lot" (MF-38, "y to all as built").
> Dated note 2026-11-12 (M-246, prior text kept, items 1-11 unchanged; MB-94 parts (d)-(e) · McBylaws queue · engine-inputs lane; Spec 135 FE-39 (EI-D5, EI-D7); plan §8 R-5; operator, verbatim: "D all as recommended - please ensure this is addedd to the McFrontend decisions"; record `~/Buildo-scratch/mcfrontend/phase1/open-questions.md`, "Engine inputs (cost / build bigger / neighbours) — rulings 2026-11-12"; plan `~/Buildo-scratch/mcbylaws/ENGINE-INPUTS-PLAN.md` v2 §3.4, §4c, §4d, §6 M-5/M-6, §11 D-5, D-7):
>
> 12. **Neighbour reach is a fixed admin setting per scenario (applies item 9).** New `logic_variables` keys, admin group "MaxBLD Report", seeded by one settings migration (an operator DB job):
>     - `nearby_coa_reach_m_detached` 400;
>     - `nearby_coa_reach_m_secondary_suite` 400;
>     - `nearby_coa_reach_m_rear_suite` (garden / laneway suite) 750;
>     - `nearby_coa_reach_m_houseplex` 1000;
>     - `nearby_coa_since_date` NULL (all years).
>
>     The defaults come from the measured CoA density (plan §3.4: within 25 m, 92-100 % of lots have no decided neighbour application). Item 9's "the server widens the search distance until the minimum sample is met" is replaced by the fixed reach as ruled (propose-minimum-first). The expanding ring stays a later option if testing shows too many empty answers. The reach, and any date window, is always printed. "Decided" is keyed on the classified decision text only (approved: `approv|conditional|condition|modified`; refused: `refus`), never on `decision_date`. Counts are server counts (FE-05).
> 13. **Copy (EI-D7).**
>     - Neighbours: "At least {approved} nearby applications to build bigger were approved within {reach} m, some with conditions. {refused} were refused."
>     - Zero case: "We found no decided {family} applications within {reach} m in the City records we could classify."
>     - "Can you build bigger?" (once filled): "Possibly. Similar homes nearby were approved by the Committee of Adjustment for up to about {size}. Approval is not guaranteed." It shows only after the M-70 fit passes a stated accuracy bar.
>     - The cost-scope line ("Building only. Excludes land, permits and design.") stays in See details (the 2026-11-11 report-face ruling) and goes to the lawyer list (MF-72).

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

> Dated note 2026-11-04 (McFrontend Phase 0; prior text kept, M-246): **P2-REPORT** = Phase 1 of McFrontend: the catalogue-to-report generator, one REPORT renderer, the goldens and their locks (§11a). It precedes P2b. The admin pilot (P2b) is convert-on-touch: operator verbatim, Q-MF6: "Q-Mf6 a"; card answer: no fixed admin pilot; admin screens convert when changed for a product reason, and `/admin/surfaces` is built when the admin next needs that view. Admin market-metrics stays DASHBOARD (P4 above); its descriptor's REPORT is an error, fixed at its conversion (operator doc-set answer 5).

> Dated note 2026-11-09 (McFrontend Phase 2; prior text kept, M-246; operator, verbatim: "D-0-D-4 approved", D-1; record `~/Buildo-scratch/mcfrontend/phase1/open-questions.md`, "Operator rulings 2026-11-09: programme card v2.1 Part A, D-9"): McFrontend Phase 2 pulls work forward from P2, P2b, P3 and P5-P7 for the pages of §11b.3 only; the other members of those phases keep their place. The order is in Spec 127 §4.4 (dated note 2026-11-09), the ONE sequence.

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
