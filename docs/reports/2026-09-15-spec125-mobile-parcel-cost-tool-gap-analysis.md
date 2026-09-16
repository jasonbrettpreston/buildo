# Spec 125 vs the mobile Parcel Cost Tool — measured gap analysis

**Date:** 2026-09-15 · **Branch:** `wf2/deep-scrapes-restore-l0` (main tree) · **Author:** orchestrator, measured from the tree
**Question asked:** how far is the mobile parcel cost tool from a Spec 122-style "descriptor = contract" standard, what would "schemas instead of specs" mean concretely, and where do the five business requirements (metered subscription, PDF to an agent, advertisers, Spec 77/91 integration, MaxBLD on Vercel) land?

> **Grounding rule applied.** Every claim below was read from a file in this tree at this commit and is cited by path (`file:line` where it matters). Prior memory, prior reports and spec prose were treated as claims to verify, not as truth. Where a spec's prose disagrees with the code, the code is reported and the drift is named. This report writes no code and changes nothing.

---

## 0. One-paragraph answer

The mobile Parcel Cost Tool (Spec 100) is **fully built and shipped** — 11 of 11 v1 deliverables exist in `mobile/` and `src/`, including the server whitelist, the tier-stratified degradation, the subscription 403 and the reserved sponsor slot. It is also **0% descriptor-driven**: the same 13 cost-line ids are transcribed by hand in three places, the mobile Zod mirror is a hand-written second declaration of the server contract with **no cross-tree drift lock**, and the mobile tree is outside every local gate the Spec 122 programme built. The distance to Spec 125 is therefore not "build the feature" — it is "make the contract the artifact". Spec 125 itself is a **Draft with zero grounded executable claims** (its §0 is grounded; §1–§13 are the operator's verbatim document, and its own §0 lists four factual corrections it has not yet absorbed). Separately: three of the five business requirements have **no owning spec at all**, and one of them (metered per-property subscription) is already half-decided in a spec nobody cited in the question — **Spec 116 §4 N2 / §5 OD4 / OD5**, which built the `entitlements` table in `migrations/228_entitlements.sql` and explicitly left the parcel tool's product key as an open operator decision.

---

## 1. Current approach vs Spec 125 approach

### 1.1 Side-by-side

| Concern | Today (measured) | Spec 125 approach | Distance |
|---|---|---|---|
| **Source of truth** | Spec prose. `docs/specs/03-mobile/100_mobile_parcel_cost_tool.md` §3.2 names the whitelist in Markdown; `src/lib/parcels/consumer-lookup.ts:33` re-declares it as `CONSUMER_HEADLINE_COLS`; `mobile/src/lib/schemas.ts:289` re-declares it a third time as `z.record(...)` | One machine-readable descriptor; prose generated from it. Ruling R2 (`scripts/steps/_schema/step.schema.json:5`): "This file — not prose — is the single source of truth" | 3 declarations → 1 |
| **How a screen is defined** | A hand-written `.tsx`. `mobile/app/(app)/parcel-tool/[parcelId].tsx` = 231 lines of JSX; `index.tsx` = 115; the admin twin `src/components/admin/ParcelCostTool.tsx` = 425. Three renderings of one payload | `descriptor.archetype` → registry → one generic renderer; §5 Rule 1 forbids bespoke page files | 771 hand-written lines → 1 descriptor + N registry archetypes |
| **How state is defined** | Spec 99 §3 Field Ownership Matrix — a **normative Markdown table**. Adding a field means adding a table row. Drift check `mobile/scripts/check-spec99-matrix.mjs` exists but is **wired to nothing** (not in `.husky/pre-commit`, `.husky/pre-push`, or any `.github/workflows/*.yml`; its own header says "manual / pre-commit") | The ownership matrix is descriptor data (owner layer, canonical writer, bridge, persistence, signOut-reset) validated by AJV; the markdown table is generated | the table is already schema-shaped — it is the wiring that is missing |
| **How validation is generated** | Hand-written Zod, twice. Server `src/app/api/parcels/lookup/types.ts` (`.strict()`, explicit field picks). Mobile `mobile/src/lib/schemas.ts:268-373` (`.passthrough()`, `z.record`) — **looser than the server it mirrors** | §5 Rule 4: validation declared once in the descriptor (`checks[]`/`invariants[]`/`plausibility[]` + `config.logic_variables[].min/max`), projected to Zod at build time | 2 hand declarations → 1 generated |
| **One contract across admin/web/mobile** | One server lib (`src/lib/parcels/consumer-lookup.ts`) feeding **three hand-written projections**. The only cross-tree lock in the repo (`src/tests/admin-lead-schemas.contract.test.ts`) covers **lead** schemas, not parcel, and is **excluded from CI** (`.github/workflows/test.yml:24-32` — it dynamically imports `mobile/src/lib/schemas.ts` and needs `mobile/node_modules`) | One descriptor, N registries, drift-locked by regeneration | the lock does not exist for parcel at all |
| **Release / gate process** | Spec 90 §10 + Spec 98: Jest + Maestro, enforced only by `.github/workflows/mobile-ci.yml` on `paths: mobile/**`. `.husky/pre-commit` filters staged files to `^(src\|scripts)/` — **a mobile-only commit passes every local gate trivially** | Spec 123 §7 nine-commit procedure + Spec 124 §4 ruling protocol: a rule without a both-directions lock is not a rule; BUILT evidence must resolve to a path or a git object (`src/tests/programme-backlog.infra.test.ts:138-154`) | mobile has CI but no *checkers*; zero fast invariants, zero golden captures |

### 1.2 The three transcriptions, measured

The 13 cost-line ids are declared four times and locked once:

| Site | Declaration | Locked to the engine? |
|---|---|---|
| `scripts/lib/parcel-cost.js` `PARCEL_COST_LINES` | the engine — 13 ids, measured: `max_build, coa_build, solar_max, solar_coa, garden_suite, laneway_suite, kitchen, bath, garage, basement_underpin, basement, gut, addition` | source |
| `src/components/admin/ParcelCostTool.tsx` `LINE_LABELS` | admin web | ✅ `src/tests/parcel-cost-line-keys.logic.test.ts` |
| `mobile/src/lib/parcelCostFormat.ts:14` `COST_LINE_ORDER` + `:20` `COST_LINE_LABELS` | mobile — same 13 ids, different order | ❌ **no lock** (grep: `COST_LINE_ORDER` appears only in `parcelCostFormat.ts`, its own test, and the screen) |
| `mobile/src/lib/schemas.ts:282` `ParcelCostMenuSchema` | `z.record(z.string(), …)` — accepts any key | ❌ by construction |

This is not hypothetical. `src/tests/parcel-cost-line-keys.logic.test.ts:4-13` records that the admin tool **shipped broken from its first commit** (`4b1712ff`): `full_build`/`basement_reno`/`addition_storey` never matched the engine's `max_build`/`basement`/`addition`, rendering three lines "n/a — not computable" on **100% of 486K parcels**, and the UI test suite stayed green because its fixture was authored against the wrong keys. That test closed the admin side. **The mobile side is today in exactly the pre-fix state.**

### 1.3 What Spec 125 has NOT grounded (it is a Draft)

`docs/specs/02-web-admin/125_schema_driven_ui_engine.md:3` — "§0 (review notes) is grounded against the repo as of `fcdc58ba`; §1–§13 are the operator's document verbatim."

| # | Ungrounded claim in §1–§13 | Measured reality | Must be grounded before adoption |
|---|---|---|---|
| G1 | "18 categories" (§4, §5 Rule 3, §6 Phase 1, §2) | **20**, `scripts/steps/_schema/step.schema.json:9-30` (`x-categories`) and `:142-163` (`required`), byte-identical lists. Root is `additionalProperties:false` (`:141`) | rewrite every "18" → 20; §0 item 1 already rules this |
| G2 | "The database record *is* the specification" (§6) | Descriptors are **files** AJV-validated by `pipeline.step()` before compute runs, fingerprinted into golden captures (`capture-step-golden.js` `source_fingerprint`), drift-locked by `src/tests/golden-fingerprint.infra.test.ts`. Moving the source into a table loses all of it | the **seeded-projection ruling** (git = source, Supabase = projection + drift check) |
| G3 | `archetypeRegistry = { FORM_INPUT, DATA_GRID }` (§12) | The real vocabulary is 8 `x-frozen` values at `step.schema.json:895-899`: `INGESTOR, MATERIALIZER, LINK, MATCHER, ENRICHER, BACKFILL, ASSERT, RECORDER`, and it is **load-bearing** — it selects an AJV required-field profile (`:1737`, `:1748`, `:1754`, `:1765`, `:1788`, `:1800`), not a component | the **archetype-vocabulary ruling**: does a UI archetype gate *which fields must be answered* or only *which component renders*? |
| G4 | "FlutterFlow or React Native" (§6 Phase 3) | Expo SDK 54 + expo-router 6 + NativeWind (`mobile/package.json`), Spec 90 §4 | delete FlutterFlow |
| G5 | `createClient` from `@/utils/supabase/server` (§12 Step 3) | That path **does not exist**; the repo uses `@supabase/ssr` and `src/lib/auth/route-guard.ts` classification with a fail-closed default (`:191`) | rewrite the code blueprints against real module paths, or delete them |
| G6 | "Sentry telemetry" on the engine (§3) | Mobile has `@sentry/react-native` wired; the **admin side has no Spec 48 §3.6 observability rows at all** (§0 item 8 calls this "a real gap") | name the admin observability rows the engine must emit |
| G7 | §7 product features (`app_outputs`, ad slots, PDF, subscriptions) inside the engine spec | `app_outputs` **does not exist** (no migration, no code). §0 item 7 already rules §7 is product scope and must split out | split §7 into its own spec before the engine plan can be locked |
| G8 | "eslint-plugin-boundaries", "dependency-cruiser", "React Flow" (§3, §4) | none are dependencies of `package.json` or `mobile/package.json` | each is a new dependency decision, not a given |
| G9 | The precedent sentence in §0 itself | §0 says logic-variable-groups is generated "from the step descriptors' `config.logic_variables`". Measured: the generator's input is `scripts/seeds/logic_variables.json`'s `admin.group` field (`scripts/generate-logic-variable-groups.mjs:52`); the descriptor↔seed↔admin tie is enforced *separately* by `step-conformance.infra.test.ts`'s four-surface battery | correct §0's own precedent description |

**Also ungrounded, and not in §0:** §1 says "Server-Side Rendering … Next.js Server Components". React Native has no Server Components. Every Spec 125 mechanism that assumes SSR (the single dynamic route, server-side descriptor parsing, server actions) **has no mobile equivalent** and must be re-specified as build-time generation or a fetched descriptor. This is the single largest unexamined assumption for the mobile half.

---

## 2. "McDonald's" standardisation for the mobile app

Spec 124's own §1 states the creed: *"Every step in this estate is the same step, except for its compute."* The mobile analogue: **every screen is the same screen, except for its projection.** Below, each Spec 122 piece and its proposed mobile equivalent, with the real artifact it would be modelled on.

| Spec 122 piece | As built (pipeline) | Proposed mobile equivalent | Modelled on |
|---|---|---|---|
| **Descriptor** | `<file-stem>.descriptor.json`, 20 categories, closed menus, `"none"` written down per field | `mobile/app/**/<route>.screen.json` — sibling of the route file, same stem, data only | §4.1 physical layout |
| **Schema** | `scripts/steps/_schema/step.schema.json` (139 KB, `additionalProperties:false`) | `mobile/screens/_schema/screen.schema.json` | same |
| **Archetype registry** | 8 `x-frozen` values selecting AJV required-field profiles | see §2.1 below — proposed from the actual screens | `step.schema.json:895-899` |
| **Execution shape** (orthogonal axis) | 9 runner lifecycles (`assert`, `ingest`, `link`, …) | **navigation shape**: `tab_root \| stack_child \| modal \| gate \| wizard_step` — orthogonal to archetype, drawn from the real router (`mobile/app/(app)/_layout.tsx:275-287`, `parcel-tool/_layout.tsx`) | `step.schema.json:1221` |
| **Checks** | `checks[]` — 10 `x-frozen` kinds, may never be `"none"` | `checks[]` per screen: `contract_parse`, `query_key_hygiene`, `empty_state`, `error_state`, `offline_state`, `touch_target`, `a11y_label`, `selector_atomicity` | §1.1 ⓷ |
| **Invariants / plausibility** | declarative SQL, executed generically | declarative **assertions over the parsed payload** (e.g. `cost_menu keys ⊆ engine PARCEL_COST_LINES`), executed generically — never hand-written per screen | `scripts/lib/step/plausibility.js` |
| **Checkers** | named predicates in `scripts/analysis/step-validate.mjs` (14 named `check*` functions; 13 fast invariants, ids 1–5,7–9,20–24) | `mobile/scripts/screen-validate.mjs`. **Three already exist in embryo and are the seed corpus**: `mobile/__tests__/routerHygiene.lint.test.ts` (router-effect + atomic-selector static analysis, 51 assertions), `mobile/__tests__/storeReset.coverage.test.ts` (store enumeration vs `signOut()`), `mobile/__tests__/spec99.mandates.lint.test.ts` (every §7/§8 mandate has implementation evidence) | §3 tooling |
| **Golden captures** | `docs/reports/golden/<slug>/{pre,post}/<chain>.json` + `source_fingerprint` sha256 over step+descriptor+notes+compute | `mobile/__goldens__/<screen>/<state>.json` — the **parsed payload + the rendered text tree** per named state (`hit`, `miss`, `ambiguous`, `cost_menu_null`, `no_neighbourhood`, `403`, `429`, `offline`), fingerprinted over screen+descriptor+format-helpers | `scripts/analysis/capture-step-golden.js` |
| **Conversion procedure** | Spec 123 §7 nine commits, compressed to 3 once an archetype has 2 proven members (R-PACE-1 / R-AH) | see §2.3 | Spec 123 §7 |
| **Policy register** | Spec 124 §5, ids `R-A…R-AI`, 5-field rule form, "a rule without a lock is not yet a rule" (§4.4) | a new Spec (proposed **126 — Mobile Screen Standard Policy**) with ids `M-A…`, register table header identical, plus `programme-items.json`-style BUILT evidence resolved mechanically | Spec 124 §4-§5 |

### 2.1 Proposed archetype vocabulary — derived from the ACTUAL screens

Measured inventory of every route file under `mobile/app/` (24 screens) plus the two non-route full-screen surfaces:

| Proposed archetype | Real screens | What the archetype would GATE (required fields) |
|---|---|---|
| **FEED** | `(app)/index.tsx` (Lead Feed), `(app)/flight-board.tsx` | `list.item_archetype`, `list.query_key`, `list.pagination`, `empty_state` **required**, `offline_state` **required**, `recycling.getItemType` |
| **DETAIL** | `(app)/[lead].tsx`, `(app)/[flight-job].tsx` | `reads.query_key` (single-param — the Spec 99 §4 hygiene rule), `sections[]`, `error_state` required, `optimistic_actions` may be `"none"` |
| **REPORT** | `(app)/parcel-tool/[parcelId].tsx` | read-only: `writes: "none"` **enforced**, `sections[]`, `field_whitelist` (must equal the server whitelist), `absent_vs_false` labelling rule required, `stores: "none"` |
| **SEARCH** | `(app)/parcel-tool/index.tsx` | `debounce_ms` (≥400 today), `min_query_len` (3), `rate_bucket`, `candidate_item`, `empty_state` required |
| **MAP** | `(app)/map.tsx` | `debounce_ms` (Spec 90 §8.3 = 500), `bounds_source`, `pin_archetype` |
| **FORM** | `(app)/settings.tsx`, `(auth)/sign-in.tsx`, `(auth)/sign-up.tsx`, `(auth)/confirm.tsx` | `fields[]` each with `owner_layer` + `canonical_writer` + `bridge` (the Spec 99 §3 row, as data), `patch_route`, `rollback` |
| **WIZARD_STEP** | the 8 `(onboarding)/*.tsx` | `step_index`, `advances_on`, `resume_key`, `skip_when` |
| **GATE** | `components/paywall/PaywallScreen.tsx`, `SubscriptionLoadingGuard.tsx` | `statuses_handled[]` (must cover all 6 `chk_entitlements_status` values), `fallthrough` |
| **AD_SLOT** *(UI-only, per Spec 125 §0 item 3)* | `components/parcel/SponsorSlot.tsx` | `placement`, `flag`, `null_when_off` **required**, `inventory_source` |

9 archetypes, 26 screens. Note §0 item 3's ruling makes `REPORT` and `AD_SLOT` explicitly legal as UI-only additions to the frozen 8 — the rest of this list is new vocabulary and needs the same ruling.

### 2.2 Screen descriptor schema — proposed categories

Modelled 1:1 on the 20 pipeline categories where the concern transfers; the mapping, and the three that do not transfer:

| # | Category | Mobile meaning | Pipeline analogue |
|---|---|---|---|
| 1 | `identity` | route path, archetype, nav shape, owner, spec link | same |
| 2 | `inputs` | query keys + the API route + the contract module it parses through + `version_pin` | `inputs.reads` |
| 3 | `outputs` | mutations / optimistic writes; `"none"` for a REPORT | `outputs.writes` |
| 4 | `state` | the Spec 99 §3 row, as data: owner layer, canonical writer, authorized readers, bridge, persistence, signOut-reset | *(new — no pipeline analogue)* |
| 5 | `staleness` | `staleTime` / `gcTime` / `refetchOn*` | `staleness` |
| 6 | `guards` | auth, entitlement product, feature flag, permission (location/notification) | `guards.requires` |
| 7 | `execution` | nav shape, header, safe-area edges, tab-bar behaviour | `execution.shape` |
| 8 | `checks` | see §2 table; never `"none"` | `checks[]` |
| 9 | `invariants` | assertions over the parsed payload | `invariants[]` |
| 10 | `plausibility` | cross-field UI honesty (absent ≠ `fits:false`; "maximum envelope" vs "as-of-right") | `plausibility[]` |
| 11 | `states` | the enumerated render states + which golden pins each | ≈ `terminals[]` |
| 12 | `errors` | error classes handled and their UI (401/403/429/schema-drift/offline) | ≈ `recovery` |
| 13 | `emits` | analytics events + Sentry breadcrumbs | `emits` |
| 14 | `deviations` | reviewed, dated exceptions | `deviations` |
| 15 | `limitations` | known honest gaps | `limitations` |
| 16 | `interpretation` | `<screen>.notes.json`, capped | `interpretation` |
| 17 | `config` | tunables (debounce, page size, limits) — externalized, admin-visible | `config.logic_variables` |
| 18 | `sharing` | which surfaces render this contract (mobile / admin / web) and what varies | `sharing` |
| 19 | `a11y` | touch target floor, labels, dark-mode tokens, safe-area | *(new)* |
| 20 | `telemetry` | funnel events + the ratio invariants (Spec 99 §7.7) | ≈ `counters` |

Not transferable: `database`, `terminals` (pipeline run-terminal semantics), `override` (force-full/dry-run).

### 2.3 Conversion procedure per screen

Compressed form from day one is **not** legal under the pipeline's own rule (R-PACE-1 needs 2 proven full-form members of an archetype). Proposed mirror:

| # | Commit | Gate |
|---|---|---|
| 1 | **Boundary freeze** — the screen's files, its contract module, its consumers; git-blame every hand-written constant | G0 |
| 2 | **Intent ledger** — every transcribed constant (`COST_LINE_ORDER`, labels, whitelists) classified `encoded-as-descriptor-field \| preserved-in-compute \| knowingly-retired`. **A different party adjudicates** (Spec 124 §4.2 — a policy rule, not a procedure step) | G3 |
| 3 | **Golden capture** — parsed payload + rendered text tree per named state, fingerprinted | G1′ |
| 4 | **Test design + prove red** | G7 |
| 5 | **Descriptor, verbatim no-op** — the descriptor must reproduce the current screen byte-for-byte in the goldens | G2′ |
| 6 | **Peel** — one policy concern per commit, green goldens after each | green per peel |
| 7 | **Cutover** — register in `converted.json`, delete the `pending` entry, retire the hand-written constants | G8 |

### 2.4 Policy register

A `mobile/screens/_schema/programme-items.json` with the identical contract to `scripts/steps/_schema/programme-items.json` (`id, spec, title, promised, status, evidence, owner, gate, last_reviewed`, status ∈ `NOT_STARTED|PARTIAL|BUILT|SUPERSEDED`), and the same **mechanical** evidence resolver — `src/tests/programme-backlog.infra.test.ts:138-154` `evidenceResolves()` passes only if a token is a real path (`file:line` allowed) or a `git cat-file -e`-resolvable object, with a RED canary asserting `'trust me'` fails. Two commits on this very branch (`fc08ff8d`, `b9e3ba8c`) exist solely because evidence strings failed that resolver at pre-push. **Adopt the resolver, not just the table.**

---

## 3. How far off are we — the measured gap table

### 3.1 Spec 100 v1 (§4 screens + §3 contract + §6 tests)

| # | Spec 100 deliverable | Exists in tree? | Backed by | Descriptor-able today? | Blocker |
|---|---|---|---|---|---|
| 1 | `parcel-tool` tab entry | ✅ `mobile/app/(app)/_layout.tsx:286` | — | ✅ trivial (nav shape) | none |
| 2 | Nested Stack layout | ✅ `parcel-tool/_layout.tsx` (15 lines) | — | ✅ trivial | none |
| 3 | `ParcelSearchScreen` | ✅ `parcel-tool/index.tsx` (115 lines) | `GET /api/parcels/lookup?q=` | ✅ SEARCH archetype | debounce/min-len are hard-coded (400/3) — must move to `config` |
| 4 | `ParcelDetailScreen` | ✅ `parcel-tool/[parcelId].tsx` (231 lines) | `?parcelId=` | ✅ REPORT archetype | 5 sections + 2 formatters are inline JSX |
| 5 | § Lot + envelope headlines | ✅ | `CONSUMER_HEADLINE_COLS` (16 cols, `consumer-lookup.ts:33`) | ✅ — the whitelist IS a descriptor field | headline **labels** are inline JSX strings |
| 6 | § Cost-menu cards | ✅ | `parcel_cost_menu` JSONB | ⚠️ partially | the 13 ids/labels are a 3rd transcription with **no lock** (§1.2) |
| 7 | § Neighbours summary | ✅ | `nearby_builds_summary` + compStats (6 fields) | ✅ | none |
| 8 | § Examples list | ✅ | `coaProjects[]` (10 fields) + `comparableBuilds[]` (11 fields) | ✅ | none |
| 9 | § Reserved sponsor slot | ✅ renders `null` | none | ✅ AD_SLOT archetype | **both branches return `null`** — the flag is inert (`SponsorSlot.tsx:17-20`) |
| 10 | Zod mirror | ✅ `mobile/src/lib/schemas.ts:268-373` | — | ✅ generated instead | **looser than the server**: mobile uses `z.record`/`.passthrough()`, server uses `.strict()` + explicit picks |
| 11 | Cross-contract lock | ⚠️ exists but is **not** cross-tree | `mobile/__tests__/useParcelLookup.test.ts:106-123` | ✅ | the "lock" pipes a **hand-written fixture**, not the server schema. No test ties mobile's parcel schema to `src/app/api/parcels/lookup/types.ts` |
| 12 | Server route + whitelist assembler | ✅ `route.ts` (129), `types.ts` (102), `consumer-lookup.ts` (159) | — | ✅ | none |
| 13 | `.infra` whitelist test | ✅ `src/tests/consumer-parcel-lookup.infra.test.ts` | — | ✅ | none |
| 14 | `.db` tier tests | ✅ `src/tests/db/consumer-parcel-lookup.db.test.ts` | — | ✅ | live-DB tier, runs only under `npm run test:db` |
| 15 | Mobile Jest tests | ✅ `parcelCostFormat.test.ts`, `useParcelLookup.test.ts` | — | ✅ | not in `npm run test`; only `mobile-ci.yml` |
| 16 | Maestro `parcel-cost.yaml` | ❌ **MISSING** | — | ✅ | explicitly deferred to 23C (Spec 100 §8) — 11 other flows exist in `mobile/maestro/` |

**Counted:** 15 of 16 rows built (**94%**); the one miss is the Maestro flow, explicitly deferred by the spec. **Descriptor-driven today: 0 of 16 (0%).**

### 3.2 Spec 100 §8 "Future" + the five business requirements

| # | Item | Exists | Owning spec today |
|---|---|---|---|
| 17 | Sponsor slot inventory / targeting / billing | ❌ (null placeholder only; **zero** `sponsor\|advertis\|ad_slot\|offers` hits in `migrations/`) | none |
| 18 | Map fast-follow (23C) — needs `centroid_lat/lng` in the whitelist | ❌ (not in `CONSUMER_HEADLINE_COLS`) | Spec 100 §8, unopened |
| 19 | Home-looker persona / pricing / `parcel_view_events` | ❌ — `parcel_view_events` has **2 hits in the whole repo, both prose** (`100_…md:101,134`) | Spec 116 §5 OD4/OD5 (open) |

**Counted across §3.1+§3.2: 15 of 19 = 79% of the feature surface exists; 0 of 19 is descriptor-driven.**

### 3.3 The state layer (Spec 99) against its own mandates

| Spec 99 mandate | Built? | Wired to a gate? |
|---|---|---|
| §8.1 bridge idempotency tests | ✅ `mobile/__tests__/bridges.test.ts`, `storeIdempotency.test.ts` | CI only |
| §8.2 router branch coverage | ✅ `authGate.test.ts` | CI only |
| §8.5 store-enumeration vs `signOut()` | ✅ `storeReset.coverage.test.ts` | CI only |
| §8.6 schema-vs-matrix drift check | ✅ `mobile/scripts/check-spec99-matrix.mjs` | ❌ **nothing runs it** |
| §5.4 + §6.1 router/selector lint | ✅ `routerHygiene.lint.test.ts` | CI only |
| §7.2 query-invalidation Sentry breadcrumbs | ⚠️ `it.skip` with `pendingReason` (§9.21 record) | — |

The parcel tool declares **NO Layer-3 store** (`[parcelId].tsx:5` — "Read-only; NO Layer-3 store"), so it adds no Spec 99 surface. Its two query keys (`['parcel-search', q]`, `['parcel-lookup', parcelId]`) satisfy §4 hygiene.

### 3.4 Spec-vs-code drift found while measuring (each is a defect under PD #10)

| Spec says | Code is | Where |
|---|---|---|
| Spec 90 §4: "Auth: Firebase Auth via `@react-native-firebase/auth`" | Supabase Auth, PKCE, AsyncStorage | `mobile/src/lib/supabase.ts:6-54`; `authStore.accessToken` renamed from `idToken` |
| Spec 90 §7: "Zod schemas shared via a `packages/shared-types` monorepo workspace" | **no monorepo, no shared package** — schemas are transcribed per tree | `mobile/src/lib/schemas.ts` vs `src/app/api/parcels/lookup/types.ts` |
| `route-guard.ts:124` "require Firebase session" | Supabase Bearer | `src/lib/auth/route-guard.ts:120-132` |
| Spec 96: `user_profiles.subscription_status` is the gate source | source **moved to `entitlements`** | `src/lib/auth/get-user-context.ts:26-28,99-100`; `src/lib/entitlements/index.ts:68` |

---

## 4. Specs → schemas: what it means concretely here

### 4.1 The mechanism, in one loop

Spec 125 §0 names the working precedent; measured, the loop is:

> **one declaration file → a `--check`-capable generator that THROWS on bidirectional mismatch → a committed generated artifact imported directly by the UI → an infra test that re-runs the generator, plus a RED canary proving the check itself fires.**

Concretely today: `scripts/seeds/logic_variables.json` (`admin.group`) → `scripts/generate-logic-variable-groups.mjs` (throws both directions; `npm run logic-var-groups -- --check` exits 1 when stale) → `src/features/admin-controls/generated/logic-variable-groups.json` → imported at `GlobalConfigCard.tsx:20` → `src/tests/logic-variable-groups.infra.test.ts` (3 tests, the third a tampered-file RED canary). **That is the whole "schema instead of spec" pattern, already running in this repo.** Everything below is that loop, applied to a screen.

### 4.2 What survives as prose

Spec 122's split: the descriptor **declares**, the notes file **interprets** (capped at 12 entries, each citing a check id), and policy text lives in `checks[].why` — never in comments (compute-shape rule 5). Applied here:

| Spec 100 prose | Becomes |
|---|---|
| §3.2 field lists | descriptor `inputs.contract.fields[]` — **data** |
| §2.3 "Absent ≠ `fits:false`" | a `plausibility[]` entry with `why` = the sentence |
| §2.4 envelope-fallback labelling | a `checks[]` entry with `why` = Spec 88 §2.5's rationale |
| §1 "what this is NOT" scope fence | `identity.description` + `outputs: "none"` |
| §5 subscription-exception rationale | `guards.requires[].why` |
| Known Failure Modes | `limitations[]` + the check that guards each |
| §1 user story, §8 futures | **stays prose** — the human narrative in Spec 100 |

### 4.3 Worked example — `ParcelDetailScreen` as a descriptor

Real field names throughout, taken from `mobile/app/(app)/parcel-tool/[parcelId].tsx`, `mobile/src/lib/parcelCostFormat.ts`, `src/lib/parcels/consumer-lookup.ts` and `src/app/api/parcels/lookup/types.ts`. Abridged to the load-bearing categories (a real one would answer all 20, `"none"` written down per field — note the measured cost: **no descriptor in this repo is under 200 lines; the smallest real one is 388**).

```jsonc
{
  "identity": {
    "name": "parcel_detail",
    "route": "mobile/app/(app)/parcel-tool/[parcelId].tsx",
    "archetype": "REPORT",
    "nav_shape": "stack_child",
    "spec_link": "docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §4",
    "description": "The full parcel story for one lot, read-only."
  },
  "inputs": {
    "query_key": ["parcel-lookup", "$parcelId"],
    "route": "GET /api/parcels/lookup?parcelId=",
    "contract_module": "src/app/api/parcels/lookup/types.ts#ConsumerParcelLookupResponse",
    "contract_version": 1,
    "params": [{ "name": "parcelId", "source": "useLocalSearchParams", "max_len": 32 }]
  },
  "outputs": { "writes": "none", "stores": "none",
    "why": { "text": "Spec 100 §1 — derives nothing, creates nothing, zero writes." } },
  "state": "none",
  "staleness": { "stale_time_ms": 60000, "gc_time_ms": "inherit", "refetch_on_reconnect": "inherit" },
  "guards": {
    "requires": [
      { "kind": "session", "on_missing": "401" },
      { "kind": "entitlement", "product": "lead_gen", "statuses": ["trial","active","past_due","admin_managed"],
        "on_missing": "403",
        "why": { "text": "Spec 100 §5 — server-side gate on the proprietary cost payload; defence in depth with the AppLayout client gate." } }
    ]
  },
  "sections": [
    { "id": "headlines", "archetype": "FIELD_GRID", "source": "parcel.areas",
      "fields": ["lot_size_sqm","lot_size_sqft","opt_aor_gfa_sqm","opt_aor_storeys",
                 "opt_coa_gfa_sqm","opt_coa_storeys","max_buildable_gfa_sqm",
                 "max_buildable_footprint_sqm","max_build_stories","max_build_fsi",
                 "coa_fsi","realized_fsi_p90","cur_floor_gfa_sqm","max_newbuild_coa_gfa_sqm",
                 "envelope_constrained","envelope_constraint_reason"],
      "formatters": { "*_sqm": "sqm", "*_sqft": "sqft", "*_fsi": "fsi" } },
    { "id": "cost_menu", "archetype": "PRICE_LIST", "source": "parcel.costMenu.menu",
      "line_ids_from": "scripts/lib/parcel-cost.js#PARCEL_COST_LINES",
      "order": ["max_build","coa_build","addition","gut","garden_suite","laneway_suite",
                "garage","solar_max","solar_coa","basement","basement_underpin","kitchen","bath"],
      "per_sqm_lines": ["kitchen","bath","basement","basement_underpin"],
      "states": { "absent": "n/a", "no_fit": "doesn't fit this lot", "available": "currency" } },
    { "id": "neighbours", "archetype": "SUMMARY", "source": "parcel.neighbourhood.summary",
      "fields": ["headline","basis","coa_approval_rate","typical_fsi","comp_fsi_basis"],
      "stats_source": "parcel.neighbourhood.compStats",
      "stats_fields": ["compCount","compDominantBuild","compBuildRatioP50","compFsiP50",
                       "neighbourhoodId","neighbourhoodCostPremium"] },
    { "id": "examples", "archetype": "EXAMPLE_LIST",
      "sources": ["parcel.neighbourhood.comparableBuilds","parcel.neighbourhood.coaProjects"],
      "prominent": ["permit_fsi","structure_family","work_type"],
      "why": { "text": "Spec 100 §1 — FSI and build type made prominent so a lay reader sees what the CoA can deliver." } },
    { "id": "sponsor", "archetype": "AD_SLOT", "placement": "detail_footer",
      "flag": "EXPO_PUBLIC_PARCEL_SPONSORS", "null_when_off": true, "inventory_source": "none" }
  ],
  "checks": [
    { "id": "contract_parse", "kind": "schema", "expect": "raw.data parses through the generated mirror",
      "severity": "FAIL", "blocking": true, "when": "runtime",
      "why": { "text": "Spec 90 §13 Zod boundary — API drift must not crash the native app." } },
    { "id": "whitelist_subset", "kind": "schema",
      "expect": "rendered field set ⊆ src/lib/parcels/consumer-lookup.ts#CONSUMER_HEADLINE_COLS ∪ the §3.2 names; no `groups` key",
      "severity": "FAIL", "blocking": true, "when": "build" },
    { "id": "cost_line_parity", "kind": "vocab_coverage",
      "expect": "sections.cost_menu.order set-equals PARCEL_COST_LINES ids",
      "severity": "FAIL", "blocking": true, "when": "build",
      "why": { "text": "4b1712ff shipped 3 mis-keyed lines as 'n/a' on 100% of 486K parcels; src/tests/parcel-cost-line-keys.logic.test.ts closed the admin side, mobile is unguarded." } },
    { "id": "query_key_hygiene", "kind": "invariant",
      "expect": "query_key depends only on parcelId", "severity": "FAIL", "blocking": true, "when": "build" },
    { "id": "touch_target", "kind": "bound", "expect": "every pressable ≥ 44x44", "limit": 44,
      "severity": "WARN", "blocking": false, "when": "build" }
  ],
  "plausibility": [
    { "id": "absent_vs_no_fit", "expect": "an absent menu line renders 'n/a', never the doesn't-fit badge",
      "severity": "FAIL", "blocking": true,
      "why": { "text": "Spec 88 §2.4 — absent means not computable; fits:false means computed and does not fit. Blurring them misrepresents the model." } },
    { "id": "envelope_fallback_label", "expect": "max_build basis reads 'maximum envelope' when areas.opt_aor_gfa_sqm is null, never 'as-of-right'",
      "severity": "FAIL", "blocking": true,
      "why": { "text": "Spec 88 §2.5 / Spec 100 §2.4 — labelling an envelope-priced line 'as-of-right' misrepresents the number." } }
  ],
  "states": [
    { "id": "loading",       "golden": "__goldens__/parcel_detail/loading.json" },
    { "id": "hit",           "golden": "__goldens__/parcel_detail/hit.json" },
    { "id": "miss",          "golden": "…/miss.json", "note": "200 + match:null, parcel:null — NOT 404" },
    { "id": "cost_menu_null","golden": "…/cost_menu_null.json" },
    { "id": "tier2_degraded","golden": "…/tier2_degraded.json", "note": "warnings[] surfaced, Tier 1 intact" },
    { "id": "error_403",     "golden": "…/error_403.json" },
    { "id": "error_429",     "golden": "…/error_429.json" },
    { "id": "schema_drift",  "golden": "…/schema_drift.json" }
  ],
  "errors": { "classes": ["ApiError:400","ApiError:403","RateLimitError","AccountDeletedError","ParcelLookupSchemaError","NetworkError"],
              "no_retry": ["400","403","RateLimitError","AccountDeletedError","ParcelLookupSchemaError"] },
  "emits": { "analytics": "none",
             "why": { "text": "MEASURED GAP 2026-09-15: 25 track() events exist in mobile/, none for the parcel tool. A metered product cannot be built on an unobserved screen." } },
  "config": { "tunables": [
    { "name": "parcel_detail_stale_time_ms", "value": 60000, "min": 0, "max": 3600000, "on_invalid": "fail" } ] },
  "sharing": { "surfaces": ["mobile"], "also_renders_this_contract": ["src/components/admin/ParcelCostTool.tsx (Spec 89 superset)"],
               "varies_by_surface": { "tier3_groups": "admin only" } },
  "limitations": [
    { "what": "No map pane; centroid_lat/lng are not in the consumer whitelist.", "spec": "Spec 100 §8 (23C)" },
    { "what": "Sponsor slot returns null on BOTH branches — the flag is inert.", "file": "mobile/src/components/parcel/SponsorSlot.tsx:17-20" }
  ]
}
```

**What this descriptor would have caught, measured, on day one:** `cost_line_parity` (the unguarded 3rd transcription), `whitelist_subset` (mobile's `z.record` accepting fields the server never sends), `emits: "none"` (no analytics on the screen a metered product would bill from).

### 4.4 Migration sequence

1. **Spec stays the human narrative.** Spec 100 keeps §1 (goal/user story), §5 (the documented exception) and §8 (futures). §3.2's field lists and §2's numbered contract move into the descriptor and are **deleted from prose** — a value in two places is a drift source, exactly what §1.2 measured.
2. **Schema is the contract.** `mobile/screens/_schema/screen.schema.json`, `additionalProperties:false`, archetype-gated required-field profiles via AJV `allOf`.
3. **Git is the source; Supabase holds a projection** (Spec 125 §0 item 2 ruling). Descriptors are files, diff-reviewed, fingerprinted. A `screen_descriptors` table is **seeded from git on deploy** — same mechanism as `scripts/seeds/logic_variables.json` → `logic_variables` — with a drift check that the table equals the committed files. The admin engine reads the table; **nobody edits it by hand.**
4. **Generated docs.** `npm run screen-docs` regenerates the Spec 100 §3/§4 tables from the descriptor; a `--check` mode fails when stale, locked by an infra test with a RED canary (the `logic-variable-groups.infra.test.ts` shape).
5. **Drift locks, in order of value measured:** (a) the mobile Zod mirror becomes **generated** from the server contract module — killing the transcription and the CI-excluded lock problem in one move; (b) `cost_line_parity` extends `parcel-cost-line-keys.logic.test.ts` to the mobile list; (c) goldens per named state; (d) `screen-validate.mjs` fast invariants, seeded from the three lint tests that already exist.

---

## 5. The five business requirements as descriptor/schema concerns

### 5.1 Subscription metered by properties viewed

| | |
|---|---|
| **Exists today** | A **boolean** gate, not a meter. `src/app/api/parcels/lookup/route.ts:56-58` — `subscription_status ∉ {trial,active,past_due,admin_managed}` → 403. Unlimited lookups otherwise. |
| **The only meter in the repo is permit-shaped** | `src/app/api/leads/view/route.ts:101-114` increments `user_profiles.lead_views_count` inside a CTE, deduped by `lead_view_events` PK `(user_id, permit_num, revision_num)` — and is triple-gated to `action='view'` AND `lead_type='permit'` AND `status='trial'`. **That table structurally cannot hold a parcel id.** |
| **`parcel_view_events`** | **DOES NOT EXIST** — 2 hits repo-wide, both prose in `100_…md:101,134`. |
| **Entitlement substrate exists** | `migrations/228_entitlements.sql:21-36` — `entitlements(user_id UUID, product TEXT, status, stripe_subscription_id, current_period_end, trial_started_at, last_stripe_event_at, PK(user_id,product))`, with `CHECK product IN ('lead_gen','flight_center')` at `:33`. Price→product via the `stripe_price_product_map` JSONB logic variable, **seeded empty `'{}'`** at `:47`. `get-user-context.ts:99-100` already reads status through the `lead_gen` join. |
| **Owning spec** | **Spec 116 §4 N2/N3** (binding), **§5 OD3** (per-product Stripe prices, ruled), **OD4** (lot-opt monetization — OPEN, "likely per-lookup / freemium"), **OD5** (product key for the *shipped* Spec 100 tool — recommended default "fold into `lead_gen`", decide-by Phase 1.3, **override if it should gate separately from day one**). Spec 96 owns the client gate. |
| **Descriptor needs** | `guards.requires[].kind: "entitlement"` with `product` + allowed `statuses`; a new `metering` block: `{ unit: "parcel", ledger_table, dedup_key, counter_column, quota_from_config, on_exceeded: 402\|403\|paywall }`; and the meter's **audit row** (the Spec 48 §3.6 concern the admin side lacks entirely). |
| **Overlap with Spec 91** | The lead feed's meter is the precedent for the *shape* (ledger + CTE + dedup), not the table. Reuse the pattern; do not extend `lead_view_events`. |
| **Smallest first step** | **Not a migration — a ruling.** Answer OD5 (is the parcel tool `lead_gen` or its own product?). If its own: one migration widening `chk_entitlements_product` + one `stripe_price_product_map` entry. Then a `parcel_view_events(user_id, parcel_id, viewed_at, PK(user_id,parcel_id))` ledger, which is the Spec 100 §5 wording made real. **Before either:** add a `parcel_viewed` analytics event — there are 25 `track()` events in `mobile/` and **none** for this screen; you cannot price what you do not count. |

### 5.2 Send a PDF report to a client / agent

| | |
|---|---|
| **Exists today** | **Nothing.** `src/lib/export/pdf.ts` is a self-declared stub (header L1-10, "TODO: Replace the HTML string generation with a proper PDF library") that returns `Buffer.from(html)` at `:130`, is scoped to **permits**, and has **no production caller** (only `src/tests/export.logic.test.ts`). No PDF library in either `package.json`. Mobile: `expo-sharing@~14.0.8` is declared (`mobile/package.json:40`) and **never imported**; no `expo-print`. |
| **Owning spec** | **None.** Spec 125 §7 mentions "Agent PDF Export" but §0 item 7 rules §7 out of the engine spec. |
| **Descriptor needs** | This is the strongest argument for the whole approach: a PDF is **the same descriptor, a different renderer**. `sharing.surfaces: ["mobile","web","pdf"]`, a `render_targets` block, and `parity` as a check — the PDF and the screen must project the **same** payload, so "100% data parity" is asserted by a golden comparison, not by discipline. |
| **Smallest first step** | One spec (WF1) that names: the render target, storage (Supabase Storage vs S3 — `@aws-sdk/client-s3` is already a dependency), the share link's auth model (signed URL vs authenticated route), and whether the recipient is a user. Then a server route rendering the **existing** `ConsumerParcelLookupResponse` through one archetype renderer. `expo-sharing` is already installed for the hand-off. |

### 5.3 Advertisers (builders, designers/architects) on the property preview

| | |
|---|---|
| **Exists today** | A 21-line placeholder. `mobile/src/components/parcel/SponsorSlot.tsx` returns `null` on **both** branches (`:17-20`) — the flag is inert even when set. **Zero** `sponsor\|advertis\|ad_slot\|offers\|placement` hits in `migrations/`. No web-side code. No flag registry, no logic variable, no admin toggle. |
| **Owning spec** | **None.** Spec 100 §8 reserves the layout position and explicitly defers "slot inventory, targeting, and billing" to a future spec. Spec 125 §7/§0 item 3 pre-authorizes `AD_SLOT` as a UI-only archetype key. |
| **Descriptor needs** | `AD_SLOT` archetype with required fields: `placement` (a closed enum of named regions), `inventory_source` (a table, not a literal), `targeting` (the closed axes — neighbourhood, zone, work type, cost band), `flag`, `null_when_off: true` (the Spec 100 Known-Failure-Mode guard, as schema), `disclosure` (the "sponsored" label — a legal requirement, so a `checks[]` entry with `severity: FAIL`), and `max_slots`. **Ad policy as descriptor data** — "no ad above the cost menu", "one slot per screen", "never inside the EXAMPLES list" become `plausibility[]` entries with `why`, not a reviewer's memory. |
| **Smallest first step** | A spec (WF1) defining the `offers` table and the placement vocabulary. **Do not build targeting first.** The one-line code change that unblocks everything else: make `SponsorSlot`'s enabled branch render its children, so the reserved region is actually testable. |

### 5.4 Future integration with Spec 77 (flight board) and Spec 91 (lead feed)

| | |
|---|---|
| **The join already exists in the DB** | `migrations/125_create_lead_parcels.sql:21-27` — `lead_parcels(lead_id TEXT CHECK ~'^(permit\|coa):.+$', parcel_id INTEGER REFERENCES parcels(id), match_type, confidence, matched_at, PK(lead_id,parcel_id))`. |
| **⚠️ But the ids do not match** | The consumer API's `parcelId` is **`parcels.parcel_id`** — `VARCHAR(20)`, the municipal id (`migrations/011_parcels.sql:7`; `src/lib/admin/parcel-lookup.ts:224` `WHERE parcel_id = $1`). `lead_parcels.parcel_id` is **`parcels.id`**, the `SERIAL` integer. Two different columns share the name "parcel_id". **Any lead↔parcel deep link must translate, and nothing today does.** |
| **The contract does not carry it** | `LeadDetailSchema` (`mobile/src/lib/schemas.ts:212-233`) has 20 fields and **no parcel id**. Spec 100 §1 explicitly fences the tool off from leads ("creates no permit/CoA lead objects… the abandoned 23B LeadDetail linkage is explicitly dropped") — so this integration is a **scope-fence reversal**, an operator decision, not an oversight. |
| **Owning spec** | **None** for the integration. Spec 77/91 own their surfaces; Spec 116 §3 owns the shared-identity/shared-DB posture. |
| **Descriptor needs** | An `entities` category naming the canonical key per screen (`lead_id` vs `parcels.id` vs `parcels.parcel_id`) and an `id_translations` declaration; cross-screen navigation as a declared **event contract** (`navigate_to: parcel_detail, with: { parcelId: translate(lead.parcel_id) }`) rather than an inline `router.push` string. |
| **Smallest first step** | Name the two parcel ids distinctly in a ruling (e.g. `parcel_ref` for the municipal string, `parcel_pk` for the serial) and add **one** field, `parcel_ref`, to the lead-detail contract — behind the scope-fence reversal decision. That is the whole integration surface; everything else is UI. |

### 5.5 The MaxBLD website on Vercel

| | |
|---|---|
| **What deploys today** | The Next.js app (15.1, React 19, **App Router only** — no `src/pages/`), `next.config.ts` = 5 lines (`output: 'standalone'`). **`vercel.json` does not exist** — deliberately deleted in `87301f92` ("remove vercel.json preview fence so production builds"). Spec 113:44: "Web (Next.js admin) deploys to Vercel, not Supabase"; pipeline compute stays on GitHub Actions (:317-322, the 800 s function cap). |
| **What is public** | 23 pages, **15 under `/admin`**. Public: `/`, `/login`, `/subscribe{,/success,/cancel}`, `/auth/callback`, `/permits/[id]`, and six `/api` prefixes serving the Expo client. Everything else fail-closed (`route-guard.ts:191`). |
| **The landing page** | `src/app/page.tsx` — 116 lines, real, unauthenticated, markets **lead-gen only** ("Find Construction Leads Before Your Competition", a hardcoded 20-trade chip list), and still says **"Buildo"** at `:13` and `:99`. **Zero parcel-cost / consumer messaging.** |
| **Brand** | MaxBLD **is** wired in the mobile binary (`mobile/app.json:3,4,6,18,31` — name/slug/scheme/`ca.maxbld.app`; Sentry org `maxbld`), the Supabase redirect allowlist (`supabase/config.toml:169`), `src/app/layout.tsx:6` and the login page. **Not** wired: `maxbld.ca` is purchased but unattached (`docs/reports/review_followups.md:2811`), `apiClient.ts:14` still falls back to `https://buildo.app`, and the landing page still reads "Buildo". |
| **Owning spec** | Spec 117 (brand tokens/naming) + Spec 116 (product boundary). **No spec owns a consumer web surface.** |
| **⚠️ The structural problem** | **Spec 116 §5 OD2 rules that lot-optimization is App B — its own Expo binary**, for a different market (developers/agents/homebuyers, incl. B2C), with cold App Store acquisition. The parcel tool shipped inside App A anyway; §5 OD5's own note records this ("Ground-truth 2026-07-18: App A already carries a third gated surface"). A MaxBLD consumer website is the **web front door for App B's audience**, and Spec 125's "one descriptor set → web + mobile" is the only proposal on the table that makes one contract serve both without a third transcription. |
| **What Vercel changes** | Very little, and that is the point: App Router + Server Components is exactly Spec 125's §10 substrate, and Spec 125 §1's SSR assumption is **true on web and false on mobile** — so the web projection is the cheap one. No `vercel.json` is needed; `next.config.ts` is bare; the only real work is (a) a public route group outside the fail-closed default, (b) an unauthenticated (or teaser-gated) parcel read path, since `/api/parcels` is currently in `AUTHENTICATED_API_ROUTES`. |
| **Smallest first step** | Decide whether the MaxBLD site is **marketing** (a static public page, days of work) or **the product's web surface** (a public parcel lookup with its own entitlement/teaser model — a spec). Then rebrand `src/app/page.tsx` and fix the `buildo.app` fallback residue, which is a 2-line change gated only on the domain being attached. |

### 5.6 Ownership summary

| Requirement | Owning spec today | Substrate exists? | Descriptor concern |
|---|---|---|---|
| 1 Metered subscription | Spec 116 §4 N2/N3 + §5 OD4/OD5 (open), Spec 96 | ✅ `entitlements`; ❌ no parcel meter | `guards.entitlement` + a new `metering` block |
| 2 PDF to an agent | **none** | ❌ (stub, unwired, permits-only) | `sharing.render_targets` + a parity check |
| 3 Advertisers | **none** (Spec 100 §8 reserves the slot) | ❌ (null placeholder) | `AD_SLOT` archetype + `offers` table + ad policy as `plausibility[]` |
| 4 Spec 77/91 integration | **none** | ✅ `lead_parcels`; ❌ id mismatch, not in contracts | `entities` + declared navigation events |
| 5 MaxBLD on Vercel | Spec 117 (brand only) | ✅ Vercel/App Router; ❌ no consumer surface | `sharing.surfaces: ["mobile","web","pdf"]` |

---

## 6. Recommended sequence

**Placement ruling first.** `.cursor/active_task.md` (the live programme index) already sequences Spec 125 as *"AFTER batch conversion … Draft — not authorized"*, with batch 2 (C5, 14 slugs) currently AUTHORIZED and C6 (36 files) behind it. **Recommendation: keep Spec 125's engine work after batch conversion, but run steps 1–3 below IN PARALLEL on the Admin/Cross-Domain slot**, because (a) they are doc + test work that touches no `scripts/` file and cannot collide with the pipeline programme's active-task slot, (b) step 2 is a real defect fix that is cheap now and expensive after any cost-line change, and (c) the operator rulings in step 1 have a long lead time and gate everything downstream. The *engine* (steps 4–8) waits for C6, per the index.

| # | Step | WF | Domain | Gated on |
|---|---|---|---|---|
| **1** | **WF1 — ground Spec 125.** Rewrite §1–§13 against the measured tree: 20 categories (G1), delete FlutterFlow (G4) and the fake module paths (G5), split §7 into its own product spec (G7), correct §0's own precedent sentence (G9), and add the missing §1 finding — **React Native has no Server Components**, so the mobile projection is build-time generation, not SSR. **Prerequisite rulings from §0, all three still open:** (i) the seeded-projection ruling (git source + Supabase projection + drift check); (ii) the archetype-vocabulary ruling (schema-canonical 8 + UI-only `REPORT`/`AD_SLOT` — and whether a UI archetype gates required fields or only rendering); (iii) which admin surface converts first (§0 nominates the data-quality engine-health view, since POST-B1-2 already requires it to read the pipeline's declared write). | WF1 | Cross-Domain | operator rulings |
| **2** | **WF3 — close the cost-line transcription.** Extend `src/tests/parcel-cost-line-keys.logic.test.ts` to assert `mobile/src/lib/parcelCostFormat.ts#COST_LINE_ORDER` set-equals the engine's `PARCEL_COST_LINES` ids. One finding, one commit (per the WF3 cadence). This is the exact defect class that shipped broken to 486K parcels once already. | WF3 | Cross-Domain | none — do now |
| **3** | **WF3 — wire the Spec 99 §8.6 drift check.** `mobile/scripts/check-spec99-matrix.mjs` exists and nothing runs it. Add it to `mobile-ci.yml` (and decide whether mobile earns a local hook at all, given `.husky/pre-commit` filters to `^(src\|scripts)/`). | WF3 | Admin (mobile) | none |
| **4** | **WF1 — Spec 126, Mobile Screen Standard Policy.** The screen descriptor schema (§2.2), the archetype registry (§2.1), the checker set, the golden shape, the 7-commit conversion procedure (§2.3), and the register with a **mechanical** BUILT-evidence resolver (§2.4). Deliverable is the schema + validator, not a converted screen. | WF1 | Admin | step 1 |
| **5** | **WF2 — pilot 1: `parcel_detail` → REPORT.** The §4.3 descriptor, full form. It is read-only (`outputs: "none"`, no Layer-3 store), which makes it the lowest-risk archetype to prove first — the same reason `assert-schema` was pilot 1 on the pipeline side. Generate the mobile Zod mirror from the server contract module, killing the transcription and the CI-excluded-lock problem together. | WF2 | Cross-Domain | step 4 |
| **6** | **WF2 — pilot 2: `parcel_search` → SEARCH**, plus the admin `ParcelCostTool.tsx` as the **third** projection of the same contract. Two proven members unlock the compressed form (R-PACE-1 analogue) for the remaining 24 screens. | WF2 | Cross-Domain | step 5 |
| **7** | **WF1 — the product spec split out of Spec 125 §7.** `offers`/AD_SLOT, PDF render target, and the metering block, in one spec, because all three are "same descriptor, different renderer/gate" and specifying them apart will produce three vocabularies. Gated on the operator answering OD5 (§5.1) and the ad-disclosure posture. | WF1 | Cross-Domain | steps 1, 5 |
| **8** | **WF1 — the web/MaxBLD projection.** The Next.js App Router renderer over the same descriptors + the public-route decision. This is the step Spec 125 §1's SSR assumption actually fits, and the first one that makes "one contract, three surfaces" visible to a customer. | WF1 | Admin | steps 5–7, C6 complete |

---

## Appendix — what was measured, and what was not

**Measured and cited:** every file named above was opened. Counts (13 cost lines, 16 headline cols, 26 screens, 23 web pages, 25 analytics events, 20 categories, 8 archetypes, 12 converted steps) were derived by reading the declaring file or by `wc`/`node -e` over it.

**Not measured (out of scope of this pass, and named so nobody treats silence as a finding):**
- No test suite was executed. No claim here asserts a test's current pass/fail state, only its existence and what it asserts.
- No live DB was queried. No claim about row counts or data plausibility is made (the "486K parcels" figure is quoted from `parcel-cost-line-keys.logic.test.ts:7`, not re-measured).
- `docs/specs/03-mobile/{92,93,94,95,97}` were surveyed by heading only.
- The Context7 MCP server failed to connect this session, so no external library-version claims are made (per CLAUDE.md PD #9, which is why no dependency-upgrade advice appears above).

**Effort note.** The single most expensive fact in this report: **no descriptor in this repo is under 200 lines; the smallest real one is 388 (`scripts/compute-centroids.descriptor.json`), the largest 8,225.** A 20-category closed-menu contract with "none written down per field" is not a lightweight artifact. Twenty-six screens at that weight is a real budget, and the archetype-required-field profiles (§2.1) are the only mechanism that keeps it from being 26 × 400 lines of `"none"`.
