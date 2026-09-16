# Spec 126 — the SURFACE unit, the archetype vocabulary, and how schemas work here

**Date:** 2026-09-15 · **Branch:** `wf2/deep-scrapes-restore-l0` (main tree, no commits) · **Author:** orchestrator, measured from the tree at this commit
**Question asked:** validate the operator's proposed unit of standardisation (the SURFACE) against a full census of the estate's screens, routes and tables; derive the archetype vocabulary from that census; and specify precisely how "schemas instead of specs" works in this repo.

> **Grounding rule.** Every count and claim below was produced by reading or executing against a file in this tree. Prior reports, memory and spec prose were treated as claims to verify. Where the prior report (`docs/reports/2026-09-15-spec125-mobile-parcel-cost-tool-gap-analysis.md`) disagrees with a re-measurement, the re-measurement is reported and the correction is named (§0.1). This report writes no code and changes nothing.

**Operator rulings taken as fixed inputs** (not re-litigated below):
1. The parcel tool is its **own metered product** — this *overrides* Spec 116 §5 OD5's recommended default ("fold into `lead_gen`"), which the spec itself flags as overridable.
2. **UI archetypes are LOAD-BEARING** — they gate *which descriptor fields must be answered*, exactly as `identity.archetype` does at `scripts/steps/_schema/step.schema.json:895-899` + the six `allOf` `x-profile` blocks at `:1737-1806`.
3. **Spec 100 stays fenced** — no linkage to LeadDetail / flight board / lead feed.
4. The unit of standardisation is the **SURFACE = screen + its API contract + its tables**. §1 tests that unit.
5. The target is **100%-standard, easy to understand, MAX-SERVER-SIDE, best-in-class** — we are not burdened by what exists. Everything observable and visualisable. Reduce complexity and scope.

---

## 0. One-paragraph answer

The SURFACE unit is **directionally right and arithmetically wrong**. Measured: 53 rendering surfaces, 61 API contracts, 87 tables — and the mapping between them is not 1:1 in either direction. **13 of 29 mobile surfaces call no API route at all** (3 onboarding screens, all 3 auth screens, 7 of 10 overlay components); **17 of 61 contracts have no static call site anywhere in `src/` or `mobile/`**; **one contract is reached from 11 surfaces + 2 shells by two different idioms** (`/api/user-profile`). Folding the contract into the screen therefore breaks at both ends and, worse, destroys the single property that makes MAX-SERVER-SIDE possible — *one contract, N projections*. The corrected unit set is **three descriptor kinds (SURFACE, CONTRACT, JOB) plus two registries (ENTITLEMENT, LEDGER)**; PROJECTION and EXPORT collapse into fields rather than becoming units, which is a net reduction. From the census, **9 SURFACE archetypes**, **5 CONTRACT archetypes**, **2 JOB archetypes** — derived, not intuited; `MAP` in particular is *not* an archetype, because `mobile/app/(app)/map.tsx` and `mobile/app/(app)/index.tsx` share one hook, one contract and one Zod schema and differ only in projection. On the schema question: five of the seven "descriptor → X" arrows already have a working, drift-locked precedent in this repo; the sixth (descriptor → migrations) **should not be built**, because `npm run db:generate` is `drizzle-kit introspect` — the arrow already runs DB→TS, and reversing it collides head-on with `scripts/migrate.js`'s filename-keyed, hand-reviewed migration discipline. And the census turned up the finding that most changes the metering plan: **the estate's only meter is dead code** (§1.2b). The pilot is the property preview page: 231 lines, zero writes, zero Layer-3 stores, an *already server-side* field whitelist, three existing projections of one payload, and one measured unguarded defect to close.

> ### The headline finding — the only meter in the estate never runs
> `POST /api/leads/view` (153 lines) holds the repo's sole usage meter: an atomic CTE inserting `lead_view_events` and incrementing `user_profiles.lead_views_count` (`route.ts:100-114`). It has **no production caller**. `useLeadView` exists at `src/features/leads/api/useLeadView.ts:77` and is referenced only by `src/tests/useLeadView.logic.test.tsx` and by prose comments; no page, component or mobile hook fetches `/api/leads/view` (verified: `grep -rn "leads/view" src mobile/src mobile/app` returns only the route itself, its two test files, `contracts.infra.test.ts` pins, and comments in `/api/leads/save`).
> **The user-visible consequence, measured:** `mobile/src/components/paywall/PaywallScreen.tsx:153` branches on `leadViewsCount > 0` to render *"{N} leads"* copy. Because nothing ever increments the counter, **that branch is unreachable in production** — every trial user sees the zero-state paywall.
> The endpoint has **9 `describe` blocks / 44 test cases of `.infra` coverage** (`src/tests/api-leads-view.infra.test.ts`) including a dedicated *"trial view counter (Spec 95 §2.2.1)"* suite. Green tests, live route, whitelisted in `route-guard.ts:122`, zero callers, and a dead paywall branch — for months, unnoticed. **This is the single best argument in the report for the surface/contract registry and its orphan panel (§3.4):** no test, no spec and no code review found this, because nothing in the estate holds the join between "a contract exists" and "a surface calls it". It also reframes the metering work — we are not extending a working meter, we are building the first live one.

### 0.1 Corrections to the prior report (re-measured, not trusted)

| Prior report claim | Re-measured | Evidence |
|---|---|---|
| "25 `track()` events exist in `mobile/`" (§4.3, §5.1) | **46 call sites** (47 `track(` matches minus the definition at `mobile/src/lib/analytics.ts:121`) | `grep -rn "track(" mobile/src mobile/app --include=*.ts --include=*.tsx \| grep -v __tests__ \| grep -v "export function track" \| wc -l` → 46 |
| "11 other flows exist in `mobile/maestro/`" (§3.1 row 16) | **12** flows | `ls mobile/maestro/*.yaml \| wc -l` → 12 |
| "23 pages, 15 under `/admin`" (§5.5) | **24** `page.tsx`, **15** under `src/app/admin/` | `find src/app -name page.tsx \| wc -l` → 24 |
| "six `/api` prefixes serving the Expo client" (§5.5) | **61** route files, **80** exported method handlers | `find src/app/api -name route.ts \| wc -l` → 61; method tally `{GET:46, POST:23, PATCH:6, DELETE:3, PUT:2}` |
| "no analytics on the screen a metered product would bill from" (§4.3) | **CONFIRMED** — `grep -rn "track(" "mobile/app/(app)/parcel-tool/"` → 0 | — |
| "`SponsorSlot` returns `null` on BOTH branches" (§5.3) | **CONFIRMED** | `mobile/src/components/parcel/SponsorSlot.tsx:17-20` |
| "`mobile/scripts/check-spec99-matrix.mjs` is wired to nothing" (§1.1) | **CONFIRMED** | `grep -rn "check-spec99-matrix" .husky .github mobile/package.json package.json` → no matches |
| "`.husky/pre-commit` filters staged files to `^(src\|scripts)/`" (§1.1) | **CONFIRMED** | `.husky/pre-commit:24` — `grep -E '^(src\|scripts)/.*\.(ts\|tsx\|js\|mjs)$'` |
| "the smallest real descriptor is 388" (Appendix) | **CONFIRMED** — `scripts/compute-centroids.descriptor.json` 388 lines; largest `scripts/quality/assert-global-coverage.descriptor.json` 8,225 | `find scripts -name '*.descriptor.json' \| xargs wc -l` |

### 0.2 Prose-vs-code drift found while measuring (each a PD #10 defect; filed, not fixed)

| Prose says | Code is | Where |
|---|---|---|
| `src/tests/admin-lead-schemas.contract.test.ts` "runs locally via `.husky/pre-commit`'s `npm run test`" | pre-commit no longer runs `npm run test` — **Spec 124 R-AG** (`c7964150`, 2026-09-14) moved the full suite to **pre-push**. The test still runs locally, one gate later. | `.github/workflows/test.yml:31-32` |
| "Inertness (P3-D6, Spec 115 §3): `schedule:` committed **COMMENTED OUT**. Phase 4.3 activation = one PR uncommenting it." | **All four chain crons are LIVE**: `chain-coa-permits.yml:15-16` `0 11 * * *` · `chain-entities.yml:13-14` `0 8 * * *` · `chain-deep-scrapes.yml:66-67` `0 15 * * 1-5` · `chain-sources.yml:13-14` `0 13 * * 0`. The header comments were never updated after Phase 4.3 activation. | the header of each of those four workflow files |
| Spec 90 §4: "Auth: Firebase Auth via `@react-native-firebase/auth`" | Supabase Auth — `@supabase/supabase-js 2.110.7` in `mobile/package.json`, **no `@react-native-firebase/*` dependency at all** | `docs/specs/03-mobile/90_mobile_engineering_protocol.md` §4 |
| Spec 90 §7: Zod schemas "shared via a `packages/shared-types` monorepo workspace" | no monorepo, no shared package — schemas are transcribed per tree (§3.2 arrow 2) | same |

The second row is exactly the argument this report makes for schemas over prose: the `pipeline-watchdog.yml` header carried the identical stale claim, was caught and corrected by a WF3 (its own header now says so), and **the same claim survived untouched in four sibling files** because prose has no `--check`.

---

## 1. Unit validation — the census, and what it refutes

### 1.1 The census, counted

| Thing | Count | How measured |
|---|---:|---|
| Mobile route files (`mobile/app/**/*.tsx`) | 24 | `find mobile/app -name "*.tsx"` |
| — of which navigation shells (`_layout.tsx`) | **5** | `(app)/_layout` · `(app)/parcel-tool/_layout` · `(auth)/_layout` · `(onboarding)/_layout` · `app/_layout` |
| — of which **screens** | **19** | 24 − 5 (8 under `(app)`, 3 under `(auth)`, 8 under `(onboarding)`) |
| Mobile non-route full-screen / overlay components | **10** | PaywallScreen · SubscriptionLoadingGuard · BlurredFeedPlaceholder · LeadFilterSheet · SearchPermitsSheet · AccountLinkingSheet · NotificationPermissionModal · ErrorBoundary · OfflineBanner · SponsorSlot |
| Web/admin pages (`page.tsx`) | **24** | `find src/app -name page.tsx` |
| — of which under `src/app/admin/` | 15 | same |
| Web root layout | 1 | `src/app/layout.tsx` (22L) |
| **Total rendering surfaces** | **53** | 19 + 10 + 24 — one of which (`admin/lead-feed/flight-center/page.tsx`, 13L) renders nothing and only redirects |
| **Total navigation shells** | **6** | 5 mobile `_layout.tsx` + 1 web `layout.tsx` |
| API route files | **61** | `find src/app/api -name route.ts` |
| Exported HTTP method handlers | **80** | GET 46 · POST 23 · PATCH 6 · DELETE 3 · PUT 2 |
| — routes exporting >1 method | 15 | node tally over the 61 files |
| Auth classes (`src/lib/auth/route-guard.ts:139-188`) | **3** — `public` \| `authenticated` \| `admin`, fail-closed default at `:186` | re-executed `classifyRoute` over all 61 paths: admin 29 · public 11 · authenticated 15 · authenticated-by-fail-closed 6 |
| Tables (`CREATE TABLE` across `migrations/`) | **87** | `grep -rhoiE "CREATE TABLE (IF NOT EXISTS )?[a-z_.]+" migrations/ \| sort -u \| wc -l` — agrees exactly with Spec 26 §3.4's "all 87 `public` tables" |
| Migrations on disk | 247 | `ls migrations/` |
| Admin components (`src/components/admin/`) | 13 files, **4,322** lines | `wc -l` — largest `LeadDetailInspector.tsx` 727, `lead-inspector/CoaClassificationPanel.tsx` 586, `FlightCenterTool.tsx`/`TestFeedTool.tsx` 525 each |
| Zustand stores | 7 (+1 non-store: `tabBarStore.ts` is two Reanimated `makeMutable` shared values) | `mobile/src/store/` |
| Mobile Jest test files / cases | 34 / ~402 | `mobile/__tests__/` |
| Maestro flows | 12 | `ls mobile/maestro/*.yaml` |
| `pg_cron` jobs | **4** | `mv_monthly_permit_stats_refresh` (`migrations/233:90`), `lead_views_retention_purge` (`233:96`, re-scheduled `235:134`), `offboarding_sweep_30day` (`233:105`), `permit_scrape_outcomes_prune` (`237:139`) — all four `pg_extension`-guarded with a NOTICE-skip, so they are inert on CI/Docker images without `pg_cron` |
| GitHub scheduled workflows | **6 live** + 1 dispatch-only | `chain-coa-permits` `0 11 * * *` · `chain-entities` `0 8 * * *` · `chain-deep-scrapes` `0 15 * * 1-5` · `chain-sources` `0 13 * * 0` · `pipeline-watchdog` `45 18 * * *` · `mutation` `0 12 * * 1`; `chain-wsib.yml` has no `schedule:` |
| Email-sending code | **0** | `grep` for nodemailer / sendEmail / resend / `@sendgrid` / SMTP across `src/` and `scripts/` → no hits |
| Stripe webhook event types handled | 6 | `src/app/api/webhooks/stripe/route.ts:179,203,204,224,241,254` |
| Pipeline steps (already Spec 122-governed) | 27, of which 12 have golden captures | `docs/reports/golden/` |

### 1.2 The four falsifiers of "surface = screen + its API contract + its tables"

**(a) Surfaces with no contract and no table — 13 of 29 mobile surfaces.**

Measured as the union of *(files containing a literal `'/api/…'`)* ∪ *(files importing a `@/hooks/use*` data hook)*:

| | touches a contract | touches none |
|---|---:|---:|
| mobile screens (19) | 13 | **6** — `(onboarding)/path` · `(onboarding)/first-permit` · `(onboarding)/manufacturer-hold` · `(auth)/sign-in` · `(auth)/sign-up` · `(auth)/confirm` |
| mobile overlays (10) | 3 | **7** — `SubscriptionLoadingGuard` · `BlurredFeedPlaceholder` · `AccountLinkingSheet` · `NotificationPermissionModal` · `ErrorBoundary` · `OfflineBanner` · `SponsorSlot` |
| **total (29)** | **16** | **13** |

The three auth screens (1,302 lines) call the Supabase Auth SDK directly (`mobile/src/lib/supabase.ts`, `confirmEmail.ts:65,120`), never our API. The 5 mobile `_layout.tsx` shells are outside the 29 and two of them *do* touch a contract — `(app)/_layout.tsx` and `app/_layout.tsx` both read `/api/user-profile`, which is how a shell ends up being the sole subscription gate.

> **Method note, and a correction to this report's own first pass.** A hook-only measurement returns "21 of 29" and is **wrong**: five `(onboarding)` screens call `fetchWithAuth('/api/user-profile', …)` *directly*, with no hook — `address.tsx:55,122`, `complete.tsx:71`, `profession.tsx:48`, `supplier.tsx`, `terms.tsx`. That is itself a finding: **the same contract is reached by two different idioms in the same tree**, one of which (`usePatchProfile`, the Spec 99 §9.16 canonical B3 mutation with rollback) carries rollback and cache invalidation and the other of which does not. A contract descriptor with a declared `consumers[]` list makes the second idiom visible; nothing today does.

These are not degenerate cases. The onboarding wizard is 1,165 lines and writes 6 `user_profiles` columns through a contract that no onboarding screen owns. A unit that *requires* a contract has nowhere to put the 13; a unit that lets a surface *reference* contracts by id puts all 29 in the same schema.

**(b) Contracts with no surface — 17 of 61, measured.**
Routes with **zero static call site** anywhere in `src/app`, `src/components`, `src/features`, `mobile/app` or `mobile/src`, outside their own file, the `route-guard.ts` whitelist and their tests:

`/api/admin/builders` · `/api/admin/pipelines/history` · `/api/admin/pipelines/runs` · `/api/admin/pipelines/schedules` · `/api/admin/rules` · `/api/admin/suppliers/leads` · `/api/admin/sync` · `/api/coa` · `/api/entities` · `/api/entities/[id]` · **`/api/leads/view`** · `/api/notifications` (GET/PATCH) · `/api/permits/geo` · `/api/products` · `/api/quality/refresh` · `/api/sync` · `/api/webhooks/stripe` (by design — a machine caller).

Three further contracts have a caller but **no screen**: `/api/notifications/register` (called by `mobile/src/lib/pushTokens.ts:54`), `/api/subscribe/exchange` (the browser mid-handoff whose credential is a single-use nonce, `route-guard.ts:87-100`), and `/api/admin/control-panel/resync` (dispatches a GitHub workflow). **Caveat, stated:** this is a static-grep result — a URL built entirely from variables would not be caught, so read it as "no literal call site found", not proof of dead code. `/api/leads/view` was independently re-verified and *is* genuinely orphaned (see §0's headline finding).

Whatever the residual false-positive rate, the structural point stands: **roughly a quarter of the contract estate has no screen**, and that is exactly where the revenue path (Stripe), the push channel, the ops triggers and the only meter live. A surface-only standard is blind to all of it.

**(c) One contract, many surfaces — the 1:N fan-out that the whole design depends on.**
Measured consumers: **`/api/user-profile` is reached from 11 surfaces and 2 shells** — `useUserProfile` is imported by 7 (`(app)/_layout`, `app/_layout`, `(app)/index`, `(app)/flight-board`, `(app)/settings`, `(onboarding)/supplier`, `IncompleteBanner`), `usePatchProfile` by 3 (`(app)/index:56`, `(app)/settings:227`, `LeadFilterSheet:27`), five `(onboarding)` screens call it directly via `fetchWithAuth`, and the web `subscribe/success` page fetches it too. `/api/leads/save` has **3** (`useSaveLead`, `useRemoveFromBoard`, `SearchPermitsSheet:47`). `/api/leads/feed` has **2** (`(app)/index.tsx` and `(app)/map.tsx` — *identical hook, identical schema*). `/api/parcels/lookup` has **2** mobile surfaces plus a near-superset admin twin at `/api/admin/parcels/lookup`. If the contract is a category inside one screen's descriptor, one of those N surfaces must arbitrarily own it and the other N−1 reference a foreign file — which is the transcription problem the programme exists to kill.

**(c′) Two measured auth/consistency defects the census exposed, both invisible to any per-file review.**
- **`/builders` and `/builders/[id]` are gated, their data route is not.** Neither page path appears in `PUBLIC_PATHS` or `PUBLIC_PREFIXES`, so `classifyRoute` falls through to the fail-closed default and returns `authenticated` (`route-guard.ts:182-191`) — while `/api/builders` *is* public via `PUBLIC_PREFIXES` (`:71`). The page is behind a login; the data it renders is not. Under a SURFACE/CONTRACT descriptor this is a one-line cross-check (`surface.guards.session` vs `contract.guards.auth_class`), and it is a `checks[]` entry, not a reviewer's memory.
- **A surface that renders nothing.** `src/app/admin/lead-feed/flight-center/page.tsx` is 13 lines and calls `permanentRedirect('/admin/flight-center')` — a page with no contract, no table and no render tree. It is real, deliberate and documented in its own header ([PF9], Spec 36), and it is a third shape the naive unit cannot hold. It lands as SHELL with `routing.redirect`.

**(d) Machinery that is neither screen nor contract — 9 files, all load-bearing.**
`mobile/app/_layout.tsx:88` **AuthGate** (530 lines; the sole routing authority, 9 branches per `decideAuthGateRoute.ts`) · `mobile/src/lib/apiClient.ts` (136; the single auth chokepoint) · `mobile/src/lib/queryClient.ts` (45; staleTime/gcTime/retry defaults for every screen) · `mobile/src/lib/mmkvPersister.ts` (75; the 24 h offline cache) · `mobile/src/lib/analytics.ts` (172; the `track()` event whitelist) · `mobile/src/lib/featureFlags.ts` (39) · `mobile/src/lib/pushTokens.ts` (71) · `src/lib/auth/route-guard.ts` (the web's 3-class classifier) · `src/middleware.ts`. Plus **4 `pg_cron` jobs**, **2 non-chain scheduled workflows** and **1 dispatch script** (`scripts/dispatch-notifications.js` → `scripts/lib/push-dispatch.js`, 138 lines) with no screen and no HTTP route at all.

### 1.3 The corrected unit set — 3 descriptor kinds + 2 registries

The pipeline standard is **one schema, one descriptor kind, archetype-gated** (`step.schema.json`, 1,808 lines, `additionalProperties:false`, 20 required categories, 8 archetypes). Copying that shape exactly would be cargo-culting; the census says the estate genuinely describes three *kinds* of thing. Three is the minimum that covers the census without orphans, and the two registries are deliberately **not** descriptors — they are small closed lists on the `scripts/seeds/logic_variables.json` model, which is the cheapest mechanism in the repo.

| # | Unit | What it declares | Measured count today | Schema artifact |
|---|---|---|---:|---|
| **1** | **SURFACE** | one thing that renders — its archetype, the contracts it reads/writes by reference, its states, its guards, its emitted events | **53** (19 mobile screens + 10 mobile overlays + 24 web pages) | `surfaces/_schema/surface.schema.json`, archetype-gated |
| **2** | **CONTRACT** | one API route — request, response projection, **tables**, auth class, rate buckets, consumers | **61** | `contracts/_schema/contract.schema.json` |
| **3** | **JOB** | server work with no screen and no request — schedule, target, idempotency, ledger rows | **6** non-pipeline (4 `pg_cron` + `pipeline-watchdog` + `mutation`); the 4 chain workflows and `dispatch_notifications` (`scripts/manifest.json:52`) are already Spec 122 scope | `jobs/_schema/job.schema.json` — or, preferably, `step.schema.json` reused (see §5 Q7) |
| **4** | *registry* **ENTITLEMENT** | the closed product vocabulary + per-product statuses + gate sites | **2** products today (`chk_entitlements_product`, `migrations/228_entitlements.sql:33`) → **3** under ruling 1 | `seeds/entitlements.json`, mirrored into `docs/specs/_contracts.json` (already carries `entitlement_products`/`entitlement_statuses`) |
| **5** | *registry* **LEDGER** | the closed event vocabulary the usage spine records | 4 existing event tables (`lead_view_events`, `notification_dispatches`, `admin_audit_log`, `pipeline_runs`); **1** new `usage_events` | `seeds/usage-events.json` |

**Two things that are deliberately NOT units** (this is the scope reduction):

- **PROJECTION** is a *field*, not a unit. `mobile/app/(app)/map.tsx` and `mobile/app/(app)/index.tsx` are one contract, one schema (`LeadFeedResultSchema`), one hook (`useLeadFeed`), two projections. Making projection a unit would have produced a phantom `MAP` archetype and a second descriptor for the same payload. It becomes `render.projection: list | map | grid | pdf`.
- **EXPORT** is a *render target*, not a unit. A PDF of the property preview is the same descriptor with `render.targets: ["screen","pdf"]`. This is the strongest single argument for the whole approach: "100% data parity between the web view and the exported document" (Spec 125 §7) stops being a discipline and becomes a golden-capture comparison. (The export *route* that emits the file is a CONTRACT with archetype `EXPORT` — §2.2.)

**SHELL** (the 6 navigation/layout containers + 1 redirect-only page) is folded into SURFACE as an archetype rather than a fourth unit, because a shell in this estate is not inert: `mobile/app/(app)/_layout.tsx:236-265` is the **sole subscription gate for all five tabs**, and `mobile/app/_layout.tsx:88` is the sole routing authority. Those are declarations, and they belong in a descriptor.

---

## 2. Archetype vocabulary — derived from the census

### 2.1 The 9 SURFACE archetypes

Every one of the 53 rendering surfaces is assigned exactly once; the column sums are stated and reconcile. Under operator ruling 2, `archetype` is load-bearing: it selects an AJV required-field profile, exactly as `step.schema.json`'s six `x-profile` `allOf` blocks do.

| # | Archetype | mob. screen | mob. overlay | web page | **n** | Real members (measured) | MUST answer (beyond the always-required core) | MUST be `"none"` |
|---|---|---:|---:|---:|---:|---|---|---|
| 1 | **LIST** | 3 | 0 | 4 | **7** | `(app)/index.tsx` 264L · `(app)/flight-board.tsx` 417L · `(app)/map.tsx` 119L · `builders` 169L · `admin/users` 262L · `admin/lead-feed` 70L · `admin/flight-center` 50L | `inputs.contract_ref` · `inputs.query_key` · `list.item_archetype` · `list.pagination` · `list.recycling` · `render.projection` · `states[]` **must include** `empty` and `offline` | — |
| 2 | **DETAIL** | 2 | 0 | 4 | **6** | `(app)/[lead].tsx` 401L · `(app)/[flight-job].tsx` 291L · `permits/[id]` 562L · `builders/[id]` 304L · `admin/users/[uid]` 231L · `admin/lead-feed/inspector` 127L | `inputs.query_key` **single-param** (Spec 99 §4 hygiene, as schema) · `sections[]` · `states[]` must include `error` · `outputs.optimistic` may be `"none"` | — |
| 3 | **REPORT** | 1 | 0 | 2 | **3** | `(app)/parcel-tool/[parcelId].tsx` 231L · `admin/parcel-cost` (`ParcelCostTool.tsx` 425L) · `admin/pipeline/step-output` (`StepOutputInspector.tsx` 190L) | `outputs.writes: "none"` **enforced** · `inputs.field_whitelist` (must equal the contract's) · `plausibility[]` ≥1 · `render.targets[]` · `offers` (may be `"none"`) · `metering` (may be `"none"`) | `outputs` · `state` |
| 4 | **SEARCH** | 1 | 1 | 0 | **2** | `(app)/parcel-tool/index.tsx` 115L · `SearchPermitsSheet.tsx` 161L *(plus `src/components/admin/SearchPermitsModal.tsx` 239L — a third instance living inside a page, see the granularity caveat below)* | `config.debounce_ms` · `config.min_query_len` · `guards.rate_bucket` · `candidate_item` · `states[]` must include `empty` · `log_hygiene` (Spec 100 §2.8 — never log `q`) | `outputs.writes` unless a claim action exists |
| 5 | **FORM** | 3 | 2 | 4 | **9** | `(app)/settings.tsx` 478L · `(auth)/sign-in.tsx` 713L · `(auth)/sign-up.tsx` 498L · `LeadFilterSheet.tsx` 94L · `AccountLinkingSheet.tsx` 89L · `login` 63L · `admin/control-panel` 51L · `admin/security` 293L · `admin/notifications` 12L | `fields[]` each carrying the **Spec 99 §3 row as data** (`owner_layer`, `canonical_writer`, `authorized_readers`, `bridge`, `persistence`, `signout_reset`) · `outputs.contract_ref` · `outputs.rollback` · `states[]` must include `error` | — |
| 6 | **WIZARD_STEP** | 7 | 0 | 3 | **10** | 7 of the 8 `(onboarding)/*.tsx` (`address` 270L · `complete` 138L · `first-permit` 54L · `path` 59L · `profession` 202L · `supplier` 213L · `terms` 195L) · `subscribe` 108L · `subscribe/success` 116L · `subscribe/cancel` 22L | `step_index` · `advances_on` · `resume_key` · `skip_when` · `terminal` (bool) | `inputs` may be `"none"` — measured: **2 of the 7** onboarding steps (`path`, `first-permit`) call no route; the other 5 call `/api/user-profile` directly, bypassing the canonical mutation hook |
| 7 | **DASHBOARD** | 0 | 0 | 4 | **4** | `dashboard` 123L · `admin/app-health` 234L · `admin/data-quality` 34L (+ `DataQualityDashboard.tsx`) · `admin/market-metrics` 462L | `tiles[]` each with its own `contract_ref` + `degrade_independently` · `refresh.poll_ms` · `states[]` per tile | `outputs.writes` unless a tile declares a COMMAND |
| 8 | **GATE** | 2 | 6 | 0 | **8** | `PaywallScreen.tsx` 237L · `SubscriptionLoadingGuard.tsx` 19L · `BlurredFeedPlaceholder.tsx` 57L · `NotificationPermissionModal.tsx` 96L · `ErrorBoundary.tsx` 76L · `OfflineBanner.tsx` 81L · `(onboarding)/manufacturer-hold.tsx` 34L · `(auth)/confirm.tsx` 91L | `statuses_handled[]` **must cover every value** of the governing closed set (for subscription: all 6 of `chk_entitlements_status`) · `fallthrough` · `on_unknown` | `outputs.writes` |
| 9 | **SLOT** | 0 | 1 | 0 | **1** | `SponsorSlot.tsx` 21L | `placement` (closed enum of named regions) · `inventory_source` (a table, never a literal) · `targeting[]` (closed axes) · `flag` · `null_when_off: true` · **`disclosure`** (a `checks[]` entry at `severity: FAIL` — the "sponsored" label is a legal requirement, not a preference) · `max_slots` | `outputs.writes` |
| — | **STATIC** | 0 | 0 | 2 | **2** | `src/app/page.tsx` 116L (marketing landing) · `src/app/admin/page.tsx` 165L (a nav/links hub — the census found it calls no API of its own) | `content_source` · `seo` | everything else |
| — | **SHELL** | 0 | 0 | 1 | **1** | `admin/lead-feed/flight-center/page.tsx` 13L — `permanentRedirect('/admin/flight-center')`, [PF9] | `routing.redirect` | everything else |
| | **Total** | **19** | **10** | **24** | **53** | | | |

Plus the **6 navigation shells** (`_layout.tsx` × 5 mobile + `src/app/layout.tsx`), which take the SHELL archetype and carry `routing.branches[]` (9 for AuthGate, per `decideAuthGateRoute.ts`), `guards[]`, `children_groups[]`, `emits.route_decision`. **SHELL total: 7.**

Three vocabulary decisions worth naming, all measured:
- **`MAP` is not an archetype.** `(app)/map.tsx` calls `useLeadFeed` and parses `LeadFeedResultSchema` — byte-identical inputs to `(app)/index.tsx`. It is `render.projection: "map"` on a LIST. Making it an archetype would have created a second descriptor for one payload.
- **`PREVIEW+OFFERS` (the operator's wording) is `REPORT` + the `offers` category**, not a tenth archetype. The offers block is required-and-may-be-`"none"` on REPORT, which is how the pipeline handles the same shape (`checks[]` may never be `"none"`; everything else may be, but must be written down).
- **`EXPORT` is not a SURFACE archetype** — it is `render.targets: ["screen","pdf"]` on a REPORT plus one CONTRACT of archetype EXPORT (§2.2).

> **⚠️ Granularity caveat, stated rather than smoothed over.** The mobile side is enumerated at *screen + full-screen-component* granularity; the web side at *page* granularity only. That asymmetry hides real surfaces: `src/components/admin/` holds **13 files / 4,322 lines** including `LeadDetailInspector.tsx` (727L), `lead-inspector/CoaClassificationPanel.tsx` (586L), `FlightCenterTool.tsx` and `TestFeedTool.tsx` (525L each) — each of which would be its own SURFACE under the mobile convention. Settling this is **Q14**; until it is settled the web surface count is a floor, not a total.

### 2.2 The 5 CONTRACT archetypes

| Archetype | n (of 61) | Members | MUST answer |
|---|---:|---|---|
| **QUERY** | ~40 | every read-only GET (`/api/leads/feed`, `/api/parcels/lookup`, `/api/quality`, `/api/admin/stats` — which alone reads **18 tables**, …) | `response.projection` (explicit pick-by-name whitelist) · `response.tiers[]` + per-tier degradation · `database.reads[]` · `guards.rate_bucket` · `staleness` · `outputs.writes: "none"` |
| **MUTATION** | ~17 | `/api/leads/save`, `/api/user-profile` (PATCH), `/api/notifications/register`, `/api/leads/view`, `/api/admin/users/[uid]/subscription/reconcile` | `database.writes[]` with `write_discipline` (reuse the Spec 122 §1.4 vocabulary verbatim) · `idempotency` · `optimistic_contract` · `rollback` |
| **WEBHOOK** | 1 | `/api/webhooks/stripe` (504L, 6 event types, `PUBLIC_EXACT_API_PATHS` at `route-guard.ts:87-100`) | `verification` (signature) · `events[]` (closed) · `replay_guard` (`stripe_webhook_events` PK) · `ordering_watermark` (`entitlements.last_stripe_event_at`) · `on_unknown_event` |
| **COMMAND** | 6 | `/api/admin/pipelines/[slug]`, `/api/admin/sync`, `/api/sync`, `/api/quality/refresh`, `/api/admin/control-panel/resync`, `/api/admin/notifications/test-send` | `job_ref` (which JOB it triggers) · `concurrency` · `audit_row` |
| **EXPORT** | **0 today** | *(net-new — the PDF route)* | `render_target` · `source_contract_ref` · `parity_check` (golden equality with the screen projection) · `storage` · `share_auth` · `ledger_event` |

`src/lib/export/pdf.ts` is a self-declared stub — its header says "TODO: Replace the HTML string generation with a proper PDF library", it returns `Buffer.from(html)`, it is scoped to permits, and it has **no production caller** (`grep` for the module across `src/app` and `src/lib` returns only itself). `expo-sharing@~14.0.8` is declared in `mobile/package.json` and never imported. EXPORT is therefore a genuinely empty archetype today, which is the honest place to put the operator's PDF requirement.

### 2.3 The 2 JOB archetypes

| Archetype | n | Members | MUST answer |
|---|---:|---|---|
| **SCHEDULED** | 5 | 4 `pg_cron` jobs + `pipeline-watchdog.yml` | `cron` · `target` (function/SQL) · `idempotency` · `on_missing_extension` (233/235/237 all `pg_extension`-guard the `cron.schedule` call) · `audit_row` |
| **DISPATCH** | 2 | `scripts/dispatch-notifications.js` → `scripts/lib/push-dispatch.js` (138L) · `classify-lifecycle-phase.js`'s push arm | `recipients_query` · `dedup_key` (`notification_dispatches`) · `rate` · `ledger_event` |

The 27 pipeline steps are already governed by `step.schema.json` and are **out of scope** — but they are the same unit, which is why §5 Q7 asks whether JOB should be a third schema at all or simply a reuse of `step.schema.json` with two added archetypes.

---

## 3. How schemas work in our context

### 3.0 The loop, stated once

The repo already runs the exact mechanism, once, in miniature. Measured end-to-end:

> `scripts/seeds/logic_variables.json` (`admin.group` field) → `scripts/generate-logic-variable-groups.mjs` (**throws in both directions**: a pinned key whose `admin.group` disagrees, *and* a seed key absent from its group — `:20-38`) → `src/features/admin-controls/generated/logic-variable-groups.json` → imported at `GlobalConfigCard.tsx:20` → `src/tests/logic-variable-groups.infra.test.ts` (3 tests, the third a **tampered-file RED canary**) → `npm run logic-var-groups -- --check` exits 1 when stale, and is wired into `npm run verify`.

**One declaration file → a `--check`-capable generator that throws on bidirectional mismatch → a committed generated artifact imported directly → an infra test that re-runs the generator, plus a RED canary proving the check itself fires.** Everything in §3.2 is that loop applied to a surface. Note the generator also carries a `BUILDO_LOGIC_VARS_SEED_PATH` test-only override so the RED fixture points at a temp file instead of mutating the committed seed — copy that too; it is the difference between a canary that can be written and one that cannot.

### 3.1 (a) The SURFACE descriptor schema — 20 categories, derived

Mirrored from Spec 122's 20 where the concern transfers, dropped where it does not, with the census's new demands added. The count landing on 20 is a coincidence, not a target — the derivation is below and each row states its provenance.

| # | Category | Declares | Provenance |
|---:|---|---|---|
| 1 | `identity` | route/path · **archetype** · `render.projection` · owner · spec · `spec_version` · `contract_version` · `gate_exempt` | ← `identity` |
| 2 | `inputs` | `contract_ref[]` (ids into the CONTRACT registry, **never an inline schema**) · params · `query_key` · `version_pin` · `field_whitelist` | ← `inputs` |
| 3 | `outputs` | mutation `contract_ref[]` · optimistic writes · `"none"` for REPORT/GATE/SLOT | ← `outputs` |
| 4 | **`state`** | the Spec 99 §3 row as data: `owner_layer` · `canonical_writer` · `authorized_readers` · `bridge` (B1–B6) · `persistence` (mmkv/securestore/none) · `signout_reset` | **NEW** — no pipeline analogue. The census's single biggest addition; see §3.1.1 |
| 5 | `staleness` | `stale_time_ms` · `gc_time_ms` · `refetch_on_*` | ← `staleness` |
| 6 | `guards` | `session` · `entitlement{product, statuses[], on_missing}` · `flag` · device permission (location/notification) · `rate_bucket` | ← `guards` |
| 7 | **`render`** | `targets[]` (screen \| pdf \| email) · `projection` (list \| map \| grid \| detail) · breakpoints (Admin `md:` desktop-first vs Expo mobile-first) · safe-area edges · header/tab-bar behaviour | **RESHAPED from `execution`** — `txn_scope`/`batch`/`budget`/`needs_disk_mb` have no surface analogue |
| 8 | `checks` | ⚠️ **never `"none"`** — see §3.4 | ← `checks` |
| 9 | `invariants` | declarative assertions over the *projected payload* (single-surface scoped) | ← `invariants` |
| 10 | `plausibility` | cross-field UI honesty (absent ≠ `fits:false`; "maximum envelope" ≠ "as-of-right") | ← `plausibility` |
| 11 | `states` | the enumerated render states, each pinned by a named golden | ← `terminals` (renamed; same "every exit path, `minItems: 1`" rule) |
| 12 | **`errors`** | error classes handled · `no_retry[]` · the UI per class (401/403/429/schema-drift/offline) | **RESHAPED from `recovery`** — `reset`/`resume`/`rollback`/`verify_clean` describe a run; a screen has no run |
| 13 | `emits` | analytics events (against the `analytics.ts` whitelist) · Sentry breadcrumbs · **ledger writes** · `counters{}` + the Spec 99 §7.7 ratio invariants | ← `emits` **merged with** `counters` |
| 14 | **`offers`** | `placements[]` · `inventory_source` · `targeting[]` (closed axes) · `disclosure` · `null_when_off` · `max_slots` · ad-policy as `plausibility[]` entries | **NEW** — the census demands it (SLOT archetype, operator requirement 3) |
| 15 | **`metering`** | `unit` · `product` · `ledger_event` · `dedup_key` · `quota_from_config` · `on_exceeded` (402 \| 403 \| paywall) | **NEW** — the census demands it (operator ruling 1) |
| 16 | `config` | tunables as registered logic variables with `min`/`max`/`on_invalid` (debounce, page size, stale time, rate limits) | ← `config` |
| 17 | `sharing` | which surfaces render this contract · what varies by surface · what varies by render target | ← `sharing` |
| 18 | **`a11y`** | touch-target floor (44×44) · labels · dark-mode tokens · safe-area · reduced-motion | **NEW** |
| 19 | `deviations` | `{from, why, adjudicated_by, date}` | ← `deviations` |
| 20 | `limitations` + `interpretation` | known honest gaps, each with its guarding check · → `<surface>.notes.json`, capped at 12 | ← both, kept |

**Dropped from the pipeline's 20, with the reason:**

| Dropped | Why |
|---|---|
| `override` | a force-full env var has no surface analogue. The nearest thing — a feature flag — is already `guards.flag`. |
| `database` | **moves to CONTRACT.** A screen does not touch a table; its contract does. This is the schema-level expression of MAX-SERVER-SIDE, and it is what makes "one contract, N projections" expressible. |
| `counters` | folded into `emits` (a surface counter is an emitted event, not a records_meta key). |
| `execution` | reshaped to `render` (see row 7). |
| `recovery` | reshaped to `errors` (see row 12). |
| `terminals` | renamed `states`, semantics preserved. |

**Not added, and why — `i18n`.** Measured: **zero** i18n machinery in the repo (`grep` for `i18n`, `react-intl`, `expo-localization`, `useTranslation` across both `package.json` files → no matches). Adding an `i18n` category today would be a field that every one of 53 descriptors answers `"none"` — 53 lines of noise for a capability nobody has. It is a *locale* sub-field of `a11y` when it arrives, not a category. (This is the §5 Q9 ask.)

#### 3.1.1 Why `state` is a category and not a footnote

Spec 99 §3 is already schema-shaped and says so in its own prose: *"This table is **normative**. Adding a field to the mobile app requires adding a row here."* The columns are literally `Field | Server Type | Local Mirror | Owner Layer | Canonical Writer | Authorized Readers | Bridge`. It has a drift checker (`mobile/scripts/check-spec99-matrix.mjs`) that **nothing runs** — re-verified: zero matches in `.husky/`, `.github/`, `mobile/package.json`, `package.json`. The category is one `JSON.parse` away from existing; what is missing is the wiring, not the design.

### 3.2 (b) The seven arrows

#### Arrow 1 — descriptor → DB schema. **Do not build this.**

Measured: `npm run db:generate` is `drizzle-kit introspect` (`package.json`; `drizzle.config.ts` `out: './src/lib/db/generated'`). The arrow **already runs DB → TS**: 87 tables → `src/lib/db/generated/schema.ts` (2,327 lines) + `relations.ts` (389). Migrations are hand-written SQL with an `-- UP` block and a **comment-only `-- DOWN`** (a `lessons.md` rule, enforced by `scripts/hooks/check-migration-down-comments.sh` in `.husky/pre-commit`), applied by `scripts/migrate.js` against a `schema_migrations` table keyed by **filename, not version**, and validated by `scripts/hooks/validate-migrations.sh`.

Generating migrations from descriptors would reverse a working arrow, collide with three live hook gates, and hand a generator authority over 247 files of hand-reviewed schema history. **Recommendation:** the descriptor's `database` block is a **declaration that is asserted**, not a generator input — exactly the posture Spec 122 §1.3 adopted for its own `database` category (*"a step pointed at a 222-migration database **refuses**"*), with `guards.requires` asserting extensions/indexes/columns at construction time. So:

- descriptor declares `database.reads[]` / `database.writes[]` with named columns;
- a checker asserts every named column exists in `src/lib/db/generated/schema.ts` (which is itself regenerated from the live DB) and that no column outside the declared set appears in the response;
- migrations stay hand-written and diff-reviewed.

This is strictly cheaper, strictly more truthful, and reuses two mechanisms that already work.

#### Arrow 2 — descriptor → API contract (Zod)

**This is the highest-value arrow and it closes a live defect class.** Today the parcel contract is declared **four** times and locked once:

| Site | Form | Locked to the engine? |
|---|---|---|
| `scripts/lib/parcel-cost.js:77` `PARCEL_COST_LINES` | the 13-id engine source | source |
| `src/components/admin/ParcelCostTool.tsx` `LINE_LABELS` | admin web | ✅ `src/tests/parcel-cost-line-keys.logic.test.ts` |
| `mobile/src/lib/parcelCostFormat.ts:14` `COST_LINE_ORDER` | mobile, same 13 ids, different order | ❌ **no lock** |
| `mobile/src/lib/schemas.ts:282` `ParcelCostMenuSchema` | `z.record(z.string(), …)` — accepts any key | ❌ by construction |

And the two Zod declarations disagree in strictness: the server type module uses `.strict()` **6 times** (`src/app/api/parcels/lookup/types.ts`), the mobile mirror uses `.passthrough()`/`z.record` **5 times** (`mobile/src/lib/schemas.ts`) — *the client is looser than the server it mirrors.* The one cross-tree lock that exists (`src/tests/admin-lead-schemas.contract.test.ts`) covers **lead** schemas, not parcel, and is **excluded from CI** (`.github/workflows/test.yml:24-32`, because it dynamically imports `mobile/src/lib/schemas.ts` and needs `mobile/node_modules`).

**Generating the mobile mirror from the contract descriptor kills all four problems at once** — the transcription, the strictness drift, the missing parcel lock, and the CI exclusion (there is nothing left to cross-import). Precedent for the weak form: `docs/specs/_contracts.json` (9,323 bytes) + `src/tests/contracts.infra.test.ts`, which **grep-asserts** a value appears in named consumer files. That is a real, live mechanism and it already carries `entitlement_products`/`entitlement_statuses`, but grep-assertion is weaker than regeneration. **Use the `logic-variable-groups` form (§3.0), not the `_contracts.json` form**, for anything new; keep `_contracts.json` as the cross-layer *numeric constant* registry it is.

#### Arrow 3 — descriptor → UI projection (the MAX-SERVER-SIDE design)

**The server returns the projected screen JSON; the client renders it through a small archetype component set; there is no client business logic.**

This is not a new posture — it is the existing one, finally enforced. Spec 90 §3 is titled *"The Prime Directive: 'Dumb Glass' Architecture"* and already mandates: *"This mobile application is a 'Dumb Glass' client. It **MUST NOT** perform complex data mutation, geographic PostGIS math, or algorithmic sorting… The mobile app's sole responsibility is: (1) capturing device state, (2) fetching pre-calculated JSON, (3) rendering at 60fps."* And it already carves out the one exception: *"Ephemeral optimistic UI state… is highly encouraged."*

**Consequences for Spec 99, measured.** Spec 99 §2 declares five layers. Max-server-side moves the boundary between Layer 2 and Layer 3:

| Layer | Today | Under max-server-side |
|---|---|---|
| 1 SERVER | canonical for account-scoped data | **grows** — also canonical for the *projection* (section order, labels, formatting decisions, which lines render) |
| 2 TanStack cache | canonical for cached server state | unchanged in role; the cached object is now a projected screen, not a raw payload |
| 3 Zustand | canonical for local UX state; **7 stores** | **shrinks to device + ephemeral only** |
| 4a MMKV / 4b SecureStore | persistence | unchanged |
| 5 Reanimated SharedValues | UI-only | unchanged |

Measured impact on the 7 stores: **4 are MMKV-persisted mirrors of server fields** — `filterStore` (139L) mirrors 6 `user_profiles` columns; `userProfileStore` (156L) mirrors 5 notification-preference columns; `authStore` (356L) persists only `{user:{uid}}` after `partialize`; `onboardingStore` (121L) holds 2 genuinely-local fields. Under max-server-side the two *mirror* stores collapse into server-owned projection state, which retires **bridges B2 (TanStack→Zustand) and B3 (Zustand→Server)** for those fields and shrinks the §3 matrix to the rows that are genuinely local.

**What must stay client-side, named so the design is honest** (these are the boundary, and the descriptor declares them per surface):
1. **Device state** — GPS (`expo-location`), push token (`pushTokens.ts`), permission status. The server cannot know these.
2. **Optimistic UI** — Spec 90 §3 explicitly encourages it; `useSaveLead` is the live example. Declared as `outputs.optimistic`, not improvised.
3. **Offline cache** — `mmkvPersister.ts` (24 h). A server-driven screen still has to render with no network; the projection is the cached artifact.
4. **Animation / gesture** — Layer 5, orthogonal by Spec 99 §2.1's hard rule.
5. **Navigation position** — which route is mounted. `expo-router` owns it.

**The one cost, stated up front.** Spec 125 §1 says "Server-Side Rendering… Next.js Server Components". **React Native has no Server Components.** So the mobile half of the arrow is not SSR — it is *a fetched projection* (the server returns JSON describing the screen; the client's archetype registry renders it) plus *build-time generation* of the archetype components and the Zod mirror. The web half **is** SSR, and it is the cheap one. Any Spec 125 mechanism that assumes SSR (single dynamic route, server-side descriptor parsing, server actions) must be re-specified for mobile before it is planned. This is the single largest unexamined assumption in Spec 125 and it is not in that spec's own §0 correction list.

#### Arrow 4 — descriptor → admin projection

Same descriptor, a different archetype component set (Shadcn/Tailwind vs RN/NativeWind). The precedent is already in the tree and is smaller than expected: `src/components/admin/GenericFieldRenderer.tsx` (83 lines) is a type-aware renderer that handles *"~120 heterogeneous DB fields (null / boolean / number / date / string / JSONB)"* without a per-field component, its own header calling it *"a deliberate renderer, not ad-hoc JSX"*. That is one archetype component, already written, already tested branch-by-branch. The admin twin of the pilot (`ParcelCostTool.tsx`, 425L) already consumes it.

#### Arrow 5 — descriptor → Supabase seeded projection

Per Spec 125 §0 item 2's recommended shape, which this report endorses without change: **git is the source, Supabase holds a projection.** The mechanism already exists for logic variables (`scripts/seeds/logic_variables.json` → `scripts/seeds/apply-logic-variables.js` → the `logic_variables` table), and the Spec 122 programme has already paid the operational lesson for it (LM-D15, `2ced0763`: a declared variable with no row now **throws**; the seed file is bootstrap only; cloud must run the apply script before cutover). A `surface_descriptors` table is seeded from git on deploy, with a drift check that the table equals the committed files. The admin engine reads the table; **nobody edits it by hand.**

Why this matters concretely, not as dogma: descriptors are AJV-validated *before compute runs* (`pipeline.step()` throws), fingerprinted into golden captures, and diff-reviewed. Moving the source into a table loses all three. `src/tests/golden-fingerprint.infra.test.ts` exists precisely because a descriptor edit after capture must force a recapture (ruling R-C) — a table row cannot participate in that.

#### Arrow 6 — descriptor → checkers and goldens

**What a checker looks like here, measured.** `scripts/analysis/step-validate.mjs` is 3,728 lines and does six things for one step: AJV + grandfathered + semantic descriptor validation · the shape gate · targeted vitest · golden-capture presence/freshness/comparison · the Spec 123 SS6 G0–G9 scorecard *from artifacts, never prose* · the Spec 124 policy-coverage matrix. Plus **13 "fast invariants"** (ids 1–5, 7–9, 20–24) that need no DB and no vitest — e.g. #2 *"every declared `config.logic_variables[].name` has a `scripts/seeds/logic_variables.json` entry"*, #7 *"the step file carries a `SPEC LINK:` header"*, #24 *"an archetype that has matured past two members must declare either the compressed marker or a literal `**Full form reason:**` line"*. Named predicates: `checkDescriptor`, `checkShapeBatch`, `checkCaptures`, `checkOnInvalidFail`, `checkVerdictSingleSource`, `checkHeartbeatWholeStep`, `checkStatementCeilingEveryPhase`, and seven more.

**The surface seed corpus already exists in embryo** — three mobile lint tests are exactly this shape and would port directly: `mobile/__tests__/routerHygiene.lint.test.ts` (209L, 5 cases — static analysis of router effects and atomic selectors), `mobile/__tests__/storeReset.coverage.test.ts` (194L, 5 — store enumeration vs `signOut()`), `mobile/__tests__/spec99.mandates.lint.test.ts` (540L, **31** — every §7/§8 mandate has implementation evidence). That is a 943-line, 41-case head start on `surfaces/surface-validate.mjs`.

**What a golden capture is, measured.** `docs/reports/golden/<slug>/{pre,post}/<chain>.json`, produced by `scripts/analysis/capture-step-golden.js`. A real one (`docs/reports/golden/compute_centroids/post/sources-full-forced-1.json`) carries **32 top-level keys**: `harness`, `spec`, `step`, `chain`, `git_head`, `exit_code`, `summary`, `meta`, `verdict`, `ledger_status`, `stdout`, `stderr`, `pipeline_runs`, `table_state`, `invariants` (7 entries), `db_target`, `nondeterminism` (**12** declared sources), `normalised` (the 11 fields the differential compares), `source_fingerprint` (sha256) and `fingerprint_files` (4 files). The **non-determinism inventory is declared before the first diff** (Spec 123 §7 row 5).

**The surface analogue, concretely:** `surfaces/__goldens__/<surface>/<state>.json` carrying `{ harness, spec, surface, archetype, state, git_head, request, response_fixture, projection, rendered_tree, a11y_tree, emitted_events, nondeterminism[], normalised[], source_fingerprint, fingerprint_files[] }`. Two artifacts per state, both required: **an API response fixture** (what the contract returned) and **a rendered-tree snapshot** (what the archetype renderer produced from it). The fingerprint spans descriptor + contract descriptor + the archetype component + the format helpers. For the pilot the named states are measurable today from Spec 100 §2.6: `loading`, `hit`, `miss` (200 + `match:null` — **not** 404), `ambiguous`, `cost_menu_null`, `tier2_degraded` (`warnings[]` surfaced, Tier 1 intact), `error_403`, `error_429`, `offline`, `schema_drift`.

#### Arrow 7 — descriptor → docs

Precedent measured: **10** generated files under `docs/reports/generated/` (`122-vocabulary.md`, `122-category-coverage.md`, `122-concern-homes.md`, `122-conversion-roadmap.md`, `122-programme-backlog.md`, `123-per-step-checklist.md`, …), generated from the schema by `scripts/violations/schema-to-vocab.mjs` and friends, plus `npm run system-map`, `npm run db:docs`, `npm run logic-vars-docs`, `npm run lineage-docs`. Ruling R2 is already in force for the pipeline (`step.schema.json:5`: *"This file — not prose — is the single source of truth… Spec 122's menu tables are GENERATED FROM THIS FILE"*).

Applied here: Spec 100 keeps §1 (goal / user story), §5 (the documented subscription exception) and §8 (futures) as human narrative. §2's numbered behavioural contract and §3.2's field lists become descriptor data and are **deleted from prose** — a value in two places is a drift source, which §3.2 above measured four times over.

### 3.3 (c) The usage ledger — the observability spine

**What exists — and does not run.** Exactly one meter, and it is permit-shaped: `src/app/api/leads/view/route.ts:100-114` runs an atomic CTE that inserts into `lead_view_events` and increments `user_profiles.lead_views_count` only when the insert lands a new row — **triple-gated** to `action='view'` AND `lead_type='permit'` AND `subscription_status='trial'`. Its table is `lead_view_events(user_id TEXT, permit_num TEXT, revision_num TEXT, viewed_at, PK(user_id, permit_num, revision_num))` (`migrations/114_user_profiles_mobile_columns.sql:75-81`). **It structurally cannot hold a parcel id**, and the route's own comment says so: *"lead_view_events has no entity_id column"*. `parcel_view_events` does not exist — two hits repo-wide, both prose in Spec 100.

**And it has no caller** (§0's headline finding). `useLeadView` is defined at `src/features/leads/api/useLeadView.ts:77` and referenced only by its own test; no page, component or mobile hook fetches `/api/leads/view`. So `lead_view_events` is empty, `user_profiles.lead_views_count` never moves, and `PaywallScreen.tsx:153`'s `leadViewsCount > 0` branch is unreachable. **Design consequence:** do not model the new meter on "the one that works", because there isn't one. Model it on the *shape* that was designed correctly (ledger + PK dedup + CTE) and add the two things the old one lacked — a live caller, and a surface-registry column that would have made its absence visible on day one.

**What the parcel gate actually is today.** Not a meter: `src/app/api/parcels/lookup/route.ts:46-59` is a boolean — `ctx.subscription_status ∉ {trial, active, past_due, admin_managed}` → 403, unlimited lookups otherwise. It reads the *global* status, not a per-product entitlement, so under operator ruling 1 it must become an entitlement lookup **and** gain a meter.

**Proposed shape — one generic ledger, not a second permit-shaped table.** The design generalises `lead_view_events`'s PK-as-dedup trick and adds a period bucket so a quota is a `COUNT(*)`, never a denormalised column (the `lead_views_count` drift is the lesson):

```sql
CREATE TABLE usage_events (
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product     TEXT        NOT NULL,   -- mirrors entitlements.product's CHECK vocabulary
  event       TEXT        NOT NULL,   -- closed: property_view | pdf_send | offer_impression | offer_click | export
  subject_kind TEXT       NOT NULL,   -- closed: parcel_ref | parcel_pk | permit_rev | offer_id
  subject_key TEXT        NOT NULL,   -- the metered subject, as text
  period      DATE        NOT NULL,   -- billing/dedup bucket
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  meta        JSONB       NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (user_id, product, event, subject_kind, subject_key, period)
);
```

Three properties earn their keep, each from a measured incident:
- **`subject_kind` is required and closed** because this estate has two different things named `parcel_id`: `parcels.id` is `SERIAL` (`migrations/011_parcels.sql:6`) and `parcels.parcel_id` is `VARCHAR(20) UNIQUE` (`:7`), the municipal id — and the consumer API's `parcelId` is the *second* while `lead_parcels.parcel_id INTEGER REFERENCES parcels(id)` (`migrations/125_create_lead_parcels.sql:22`) is the *first*. A bare `subject_key TEXT` would silently blend them. Recommended naming ruling: **`parcel_ref`** for the municipal string, **`parcel_pk`** for the serial.
- **The PK is the dedup**, so a replay writes zero rows — the `lead_view_events` mechanism, generalised.
- **The counter is derived**, so there is no second source of truth to drift.

Under operator ruling 3 (Spec 100 stays fenced), `lead_parcels` is **not** read by any surface and `subject_kind: parcel_pk` stays unused on the consumer path — it is declared so that a future non-fenced use cannot invent a fifth vocabulary.

**Entitlement side, measured:** `migrations/228_entitlements.sql:21-36` — `entitlements(user_id UUID, product TEXT, status TEXT, stripe_subscription_id, current_period_end, trial_started_at, last_stripe_event_at, PK(user_id, product))` with `CHECK product IN ('lead_gen','flight_center')` at `:33`. Operator ruling 1 needs: one migration widening that CHECK, one `stripe_price_product_map` entry (the JSONB logic variable seeded `'{}'` at `:47`), and the same string added to `docs/specs/_contracts.json`'s `entitlement_products` array — which `src/tests/contracts.infra.test.ts` grep-pins against `src/lib/entitlements/index.ts` `PRODUCTS`. **Three sites, all already locked.** That is the whole change.

### 3.4 (d) "Visualise everything", concretely

Not a slogan — a generated admin page on a precedent that already ships.

**The precedent, exactly:** `logic-variable-groups.json` is generated, committed, imported at `GlobalConfigCard.tsx:20`, and locked by three tests one of which is a tampered-file RED canary. Nobody hand-edits it; `npm run verify` fails if it is stale.

**The surface registry page — `/admin/surfaces`, generated from descriptors.** One row per surface, every column derived, nothing typed by hand:

| Column | Source |
|---|---|
| surface · archetype · projection | `identity` |
| contracts it reads/writes | `inputs.contract_ref[]` / `outputs.contract_ref[]` |
| tables (transitively) | the referenced CONTRACT descriptors' `database` |
| entitlement + statuses | `guards.entitlement` |
| declared states · golden freshness | `states[]` + `fingerprint_files` mtime vs `git cat-file -e` (fast invariant #22's mechanism, `GOLD-PRE-FRESH`) |
| checks pass/fail | last `surface-validate` run |
| events emitted | `emits` |
| **usage, last 7 d** | `SELECT count(*) FROM usage_events WHERE ...` — the ledger closing the loop |
| unconsumed? | a contract with zero `sharing.surfaces` entries renders red |

**Three visualisations the census says are worth building, and one that is not:**
1. **The contract fan-out graph** — 61 contracts × their consumers, with the *idiom* labelled per edge. Today this is invisible and the measured fan-out is real (`/api/user-profile` reached from 11 surfaces by two different idioms, `/api/leads/save` by 3). This is where a transcription — and a bypassed mutation hook — is *seen* rather than discovered.
2. **The orphan panel** — the 17 zero-call-site contracts and the 13 no-contract surfaces. Both lists are produced by the same join, neither exists today, and one row on it (`/api/leads/view`) is the report's headline finding.
3. **The state-ownership matrix, rendered** — Spec 99 §3 as data rather than a Markdown table, with the `check-spec99-matrix.mjs` verdict attached. It already has a checker; it has never had a reader.
4. **Not worth building: a React Flow node-graph of the pipeline** (Spec 125 §4). `react-flow` is not a dependency of either `package.json`, and the pipeline's dependency data already has a generated home (`npm run lineage-docs`, `docs/reports/generated/`). That is a new dependency decision for a picture of something already rendered as text. Defer.

---

## 4. Build-from-scratch vs re-project, per surface — measured

**Decision rule, derived from the census rather than taste:** a surface is *re-projectable* when (i) its contract already assembles an explicit server-side projection, (ii) it writes nothing, and (iii) it owns no Layer-3 store. It needs *rebuilding* when client code makes a decision the server could have made. Applied:

| Surface | LOC | Writes? | L3 store? | Server-side projection today? | Verdict |
|---|---:|---|---|---|---|
| `(app)/parcel-tool/[parcelId].tsx` | 231 | no | **no** (`:5` — "Read-only; NO Layer-3 store") | **yes** — `CONSUMER_HEADLINE_COLS`, 16 named columns, `src/lib/parcels/consumer-lookup.ts:33`; explicit pick-by-name assembler; tier-stratified degradation | **RE-PROJECT — the pilot** |
| `(app)/parcel-tool/index.tsx` | 115 | no | no | yes (same route, `q` path) | **RE-PROJECT — pilot 2** |
| `admin/parcel-cost` (`ParcelCostTool.tsx`) | 425 | no | n/a | yes (Spec 89 superset, same resolver internals) | **RE-PROJECT — pilot 3**, and the proof of `sharing` |
| `admin/pipeline/step-output` (`StepOutputInspector.tsx`) | 190 | no | n/a | yes — reads the pipeline's declared write via `pg_class`/`pg_namespace` introspection | RE-PROJECT (Spec 125 §0 nominates it) |
| `permits/[id]` · `builders/[id]` · `builders` | 562 / 304 / 169 | no | n/a | partial — `/api/permits/[id]` already assembles 13 tables into one payload | RE-PROJECT · **and close the auth mismatch at §1.2c′ first** |
| `admin/market-metrics` | 462 | no | n/a | yes — `/api/admin/market-metrics` returns 6 named sections | RE-PROJECT — the cleanest DASHBOARD member |
| `admin/lead-feed/inspector` (+ `LeadDetailInspector.tsx` 727L, `CoaClassificationPanel.tsx` 586L) | 127 + 1,313 | no | n/a | yes — `lead-inspect-query.ts` assembles ~20 tables server-side | RE-PROJECT, **but blocked on Q14** (granularity): 1,313 of its 1,440 lines live in components this census does not count as surfaces |
| `(app)/[lead].tsx`, `(app)/[flight-job].tsx` | 401/291 | optimistic save only | no | partial — `leadDetailFormat.ts` does client formatting | RE-PROJECT after the format helpers move server-side |
| `(app)/index.tsx`, `(app)/flight-board.tsx`, `(app)/map.tsx` | 264/417/119 | optimistic | **yes** (`filterStore`, `flightBoardSeenStore`) | partial | **REBUILD** — filter state and seen-tracking are client decisions that must be re-homed first |
| `(app)/settings.tsx` | 478 | yes (PATCH ×N) | yes | no | **REBUILD** — 6 mirrored fields, B3 rollback |
| the 8 `(onboarding)/*.tsx` | 1,165 total | yes (PATCH) | yes | **no** — and 6 of 8 call no route at all | **REBUILD** — resume/skip/advance logic is entirely client-side today (`getResumePath.ts`, `onboardingStore`); it is the purest example of business logic that max-server-side wants back |
| `(auth)/sign-in.tsx` · `sign-up.tsx` · `confirm.tsx` | 713 / 498 / 91 | n/a (Supabase Auth SDK) | yes | n/a | **NEITHER — leave alone.** These talk to a third-party SDK, not to our contracts; a descriptor would be describing someone else's protocol. 1,302 lines deliberately out of scope. |
| `admin/security` · `admin/control-panel` · `admin/notifications` · `login` | 293 / 51 / 293-equiv / 63 | yes | n/a | partial (`control-panel` reads `logic_variables` — already the generated-groups precedent) | REBUILD (`security`, backed by Supabase Auth MFA) · RE-PROJECT (`control-panel`, `notifications`) |

**Counted across the 53: 24 re-project · 13 rebuild · 3 leave alone · 13 unclassified** (the remaining GATE/STATIC/SHELL surfaces, which are too small to need a verdict, plus whatever Q14 promotes out of `src/components/admin/`).

### 4.1 The pilot — `parcel_detail` (REPORT), with the measured case

1. **Lowest risk in the estate.** 231 lines, `outputs: "none"`, no Layer-3 store, one query key with one param (`['parcel-lookup', parcelId]` — already satisfies Spec 99 §4 hygiene). Zero writes, zero migrations, zero pipeline change (Spec 100 §1: *"It derives nothing new"*). This is the same reason `assert_schema` — the archetype that forces `outputs`/`recovery`/`counters` to `"none"` — was pilot 1 on the pipeline side.
2. **The server-side projection already exists.** Max-server-side is a *short* move here: the whitelist is already assembled server-side by name; only the rendering is client-side.
3. **It proves `sharing` on day one** — three renderings of one payload already exist (mobile search 115L, mobile detail 231L, admin tool 425L = 771 hand-written lines), which is the fastest possible refutation of "one contract, N projections" if it is wrong.
4. **It is the operator's own metered product**, so `metering`, `offers` and the `usage_events` ledger land where they are needed rather than on a surface that will never bill.
5. **It has a real, unguarded defect to close, and the defect class has already shipped once.** `src/tests/parcel-cost-line-keys.logic.test.ts:4-13` records that the admin tool shipped broken from its first commit (`4b1712ff`): `full_build`/`basement_reno`/`addition_storey` never matched the engine's `max_build`/`basement`/`addition`, rendering three lines "n/a — not computable" on 100% of 486K parcels, with a green UI suite because the fixture was authored against the wrong keys. That test closed the admin side. **The mobile side is today in exactly the pre-fix state** — `COST_LINE_ORDER` appears only in `parcelCostFormat.ts`, its own test, and the screen.
6. **It is the only surface where the archetype is genuinely new.** REPORT does not exist in the pipeline's 8, so the pilot also proves the "UI-only archetype" ruling that Spec 125 §0 item 3 pre-authorised.

**Budget, stated up front (the P3 discipline).** No descriptor in this repo is under 200 lines; the smallest real one is **388** (`scripts/compute-centroids.descriptor.json`), the largest **8,225** (`assert-global-coverage`). Fifty-three surfaces at 388 lines is ~20,000 lines of declaration. **The archetype required-field profiles are the only mechanism that keeps that from being 53 × 400 lines of `"none"`** — a REPORT should answer perhaps 12 of the 20 categories in substance and `"none"` the rest in one line each. If the pilot's descriptor lands over ~250 lines, the profile design is wrong and that is a kill criterion worth declaring before commit 1.

---

## 5. Open questions for the operator — with recommended defaults

| # | Question | Recommended default | Why | Reversible? |
|---|---|---|---|---|
| **Q1** | Is **CONTRACT** its own descriptor kind, or a category inside SURFACE? | **Its own kind.** | Measured 1:N fan-out (`/api/user-profile` reached from 11 surfaces + 2 shells by two idioms; `/api/leads/save` by 3) and **17 contracts with no call site at all**. Folding it in forces one surface to own a shared artifact and leaves the orphans homeless — which is exactly how `/api/leads/view` stayed invisible. | Hard to reverse — it shapes both schemas |
| **Q2** | Do we **generate migrations** from descriptors? | **No.** Declare `database.reads/writes`, assert against `src/lib/db/generated/schema.ts`; migrations stay hand-written. | `npm run db:generate` is `drizzle-kit introspect` — the arrow already runs DB→TS. Reversing it collides with `migrate.js` (filename-keyed), `validate-migrations.sh` and `check-migration-down-comments.sh`. | Yes |
| **Q3** | What is the **max-server-side boundary** — what may stay client-side? | The five named in §3.2 arrow 3: device state · optimistic UI · offline cache · animation · nav position. Everything else is server-projected. | Spec 90 §3 already mandates "Dumb Glass" and already carves out optimistic UI by name. This makes the existing posture enforceable rather than inventing a new one. | Yes, per surface |
| **Q4** | Confirm the **9 SURFACE archetypes** (+ SHELL + STATIC), and that `MAP` is a projection not an archetype. | Confirm as listed in §2.1. | `map.tsx` and `index.tsx` share hook, contract and schema; the only difference is projection. | Yes, before freeze |
| **Q5** | **Product key** for the parcel tool (ruling 1 needs a literal). | **`parcel_tool`** — plain, matches the route and tab name; `maxbld` conflates a brand with a product and Spec 117's rename is still pending. | Three grep-locked sites change: `chk_entitlements_product`, `stripe_price_product_map`, `_contracts.json.entitlement_products`. | Data-reversible (Spec 116 N2's own claim) |
| **Q6** | **Usage ledger**: one generic `usage_events`, or per-product tables? | **One generic table** (§3.3). | A second permit-shaped table is how we got a meter that cannot hold a parcel. One table, closed `event` + `subject_kind` vocabularies, PK-as-dedup, derived counters. | Hard once rows exist |
| **Q7** | Is **JOB** a third schema, or `step.schema.json` reused with two added archetypes? | **Reuse `step.schema.json`.** | A `pg_cron` purge and a pipeline step are the same thing: scheduled server work with an idempotency posture and an audit row. A third schema is a third vocabulary to keep in sync. Cost: two new `x-frozen` archetype values in a schema that freezes at C3 — so this must be decided **before** C3. | Hard after C3 |
| **Q8** | **Naming ruling** for the two `parcel_id`s. | `parcel_ref` = `parcels.parcel_id` `VARCHAR(20)` (municipal); `parcel_pk` = `parcels.id` `SERIAL`. | Two different columns share one name across `parcels`, `lead_parcels`, the consumer API and the admin lib. Any ledger row or deep link must say which. | Yes (rename is doc + descriptor only) |
| **Q9** | Does the schema get an **`i18n` category** now? | **No** — a `locale` sub-field of `a11y` when i18n arrives. | Zero i18n machinery measured in either tree. A category every descriptor answers `"none"` is 53 lines of noise. | Yes |
| **Q10** | **Ad disclosure** severity on the SLOT archetype. | **`severity: FAIL`, blocking.** | "Sponsored" labelling is a legal obligation, not a design preference. Ad policy ("no slot above the cost menu", "one per screen", "never inside EXAMPLES") becomes `plausibility[]` entries with `why`, not a reviewer's memory. | Yes |
| **Q11** | **Placement in the programme.** | Run §6 steps 1–4 **in parallel** on the Admin/Cross-Domain slot; the engine (steps 5+) waits for C6. | Steps 1–4 touch no `scripts/` file, so they cannot collide with the pipeline programme's active-task slot; steps 1–2 are live defect fixes that gets more expensive after any cost-line change. `.cursor/active_task.md` already sequences Spec 125 after batch conversion. | Yes |
| **Q12** | `/api/quality` is **public and unauthenticated** (`route-guard.ts:74`) and serves a curated 11-table list; Spec 26 §3.4 says widening to all 87 is *"blocked on an auth/disclosure ruling"*. Under a surface standard, how does a public surface declare its guards? | `guards.session: "none"` with a **required `why`** carrying a liveness handle, plus a `disclosure` block naming the exact projected field set. Resolve the 11→87 ruling separately. | `"none"` must be *written down*, per the estate's own rule — and a public data surface is exactly where an unwritten `"none"` is dangerous. | Yes |
| **Q13** | Spec 125 §7 (product features) — split into its own spec before the engine plan locks? | **Yes**, and make it **one** spec covering offers + PDF + metering. | Spec 125 §0 item 7 already rules §7 out of the engine spec. All three are "same descriptor, different renderer/gate"; specifying them apart will produce three vocabularies. | Yes |
| **Q14** | **What granularity is a web SURFACE — the page, or the component?** Mobile is enumerated at screen + full-screen-component; web only at `page.tsx`. | **The page**, with a `sections[]`/`tiles[]` array naming its components — *except* where a component is independently routable or independently gated, which promotes it to its own surface. | `src/components/admin/` is 13 files / 4,322 lines; under the mobile convention `LeadDetailInspector.tsx` (727L) and `CoaClassificationPanel.tsx` (586L) are surfaces. Promoting all of them roughly doubles the estate and the descriptor budget (§4.1). The page-with-sections rule keeps the count at 53 while still making each component a declared, checkable thing. | Yes — a component can be promoted later without changing either schema |
| **Q15** | Does a surface's declared auth have to **match its contract's**? | **Yes, as a `checks[]` entry at `severity: FAIL`.** | Measured live mismatch: `/builders` and `/builders/[id]` are `authenticated` by fail-closed while `/api/builders` is `public` (§1.2c′). Nothing in the estate holds that join today. | Yes |

**Two things the operator has already ruled that this report did not re-open, recorded so nobody re-litigates them:** the parcel tool is its own metered product (which *overrides* Spec 116 OD5's stated default, legitimately — OD5 says "override if the parcel tool should gate separately from day one"); and Spec 100's scope fence holds, so `lead_parcels` stays unread by any surface and the `LeadDetailSchema`'s 20 fields gain no parcel reference.

---

## 6. Recommended sequence

| # | Step | WF | Domain | Gated on |
|---|---|---|---|---|
| **1** | **WF3 — close the cost-line transcription.** Extend `src/tests/parcel-cost-line-keys.logic.test.ts` to assert `mobile/src/lib/parcelCostFormat.ts#COST_LINE_ORDER` set-equals `scripts/lib/parcel-cost.js#PARCEL_COST_LINES`. One finding, one commit. This is the exact defect class that shipped broken to 486K parcels once already. | WF3 | Cross-Domain | **none — do now** |
| **2** | **WF3 — adjudicate the dead meter.** `/api/leads/view` + `useLeadView` + `lead_view_events` + `user_profiles.lead_views_count` + `PaywallScreen.tsx:153`'s unreachable branch are one finding with two legal dispositions: **revive** (wire `useLeadView` into `(app)/[lead].tsx`, restoring the trial counter the paywall copy assumes) or **knowingly retire** (delete the route, the hook, the 44 tests and the paywall branch, and file the retirement). Either is fine; *neither has been chosen*, which is the defect. **A different party must adjudicate** (Spec 124 §4.2). | WF3 | Cross-Domain | operator call |
| **3** | **WF3 — wire the Spec 99 §8.6 drift check.** `mobile/scripts/check-spec99-matrix.mjs` exists and nothing runs it. Add to `mobile-ci.yml`; decide whether mobile earns a local hook given `.husky/pre-commit`'s `^(src\|scripts)/` filter. Same commit: correct the four stale `schedule: committed COMMENTED OUT` headers (§0.2). | WF3 | Admin | none |
| **4** | **WF1 — ground Spec 125.** Absorb its own §0 list (20 categories, no FlutterFlow, real module paths, split §7, fix the §0 precedent sentence) **and add the missing finding: React Native has no Server Components** — the mobile projection is a fetched projection + build-time generation, not SSR. | WF1 | Cross-Domain | Q1–Q4 |
| **5** | **WF1 — Spec 126, the Surface Standard.** The three schemas (§3.1, §2.2, Q7), the archetype registry (§2), the checker set seeded from the three existing lint tests, the golden shape (§3.2 arrow 6), the conversion procedure, and a register with a **mechanical** BUILT-evidence resolver — `src/tests/programme-backlog.infra.test.ts:138-154`'s `evidenceResolves()` passes only if a token is a real path (`file:line` allowed) or a `git cat-file -e`-resolvable object, with a RED canary asserting `'trust me'` fails. Two commits on this branch (`fc08ff8d`, `b9e3ba8c`) exist solely because evidence strings failed that resolver at pre-push. **Adopt the resolver, not just the table.** Deliverable is the schema + validator, not a converted surface. | WF1 | Admin | step 4 |
| **6** | **WF2 — pilot: `parcel_detail` → REPORT** (§4.1). Full form. Generate the mobile Zod mirror from the contract descriptor, killing the transcription and the CI-excluded-lock problem together. | WF2 | Cross-Domain | step 5 |
| **7** | **WF2 — pilots 2–3: `parcel_search` → SEARCH and the admin `ParcelCostTool` as the third projection.** Two proven members of an archetype unlock the compressed form (the R-PACE-1 analogue) for the rest. | WF2 | Cross-Domain | step 6 |
| **8** | **WF1 — the product spec** split out of Spec 125 §7: `offers` + the `offers` table, EXPORT/PDF, and `metering` + `usage_events`, in **one** spec (Q13). Gated on Q5, Q6, Q10. | WF1 | Cross-Domain | steps 4, 6 |
| **9** | **WF1 — the web/MaxBLD projection.** The App Router renderer over the same descriptors + the public-route decision. This is the step Spec 125 §1's SSR assumption actually fits, and the first that makes "one contract, three surfaces" visible to a customer. | WF1 | Admin | steps 6–8, C6 |

---

## Appendix — what was measured, and what was not

**Measured and cited.** Every count in §1.1 was produced by executing the stated command against this tree. Every file named in §2–§4 was opened. Route classification was produced by re-implementing `classifyRoute`'s exact order of operations (`src/lib/auth/route-guard.ts:139-188`) over all 61 route paths, not by reading the arrays.

**Method, and one correction to this report's own working.** The census was gathered by two delegated read-only sweeps (mobile; web/admin/API/tables) whose outputs were then **re-verified, not adopted**. Three of their claims were corrected before they reached this report:
1. The mobile sweep reported "11 Maestro flows" — `ls mobile/maestro/*.yaml | wc -l` returns **12**.
2. The mobile sweep reported all 8 `(onboarding)` screens as "no API call at all" because it traced hooks only. **Five of them call `fetchWithAuth('/api/user-profile', …)` directly** (`address.tsx:55,122` · `complete.tsx:71` · `profession.tsx:48` · `supplier.tsx` · `terms.tsx`). That correction changed the headline §1.2(a) number from 21 to 13 — and became a finding in its own right (two idioms for one contract).
3. The web sweep reported the four `chain-*.yml` crons as inert on the strength of their header comments; re-reading the files shows all four `schedule:` blocks are **live** (§0.2).
   This is the Spec 123 §7.1 role split in miniature: a delegated pass extracts, a different pass adjudicates. Both sweeps' own self-flagged caveats are carried forward below rather than dropped.

**Not measured, named so silence is not read as a finding:**
- **No test suite was executed.** No claim asserts a test's current pass/fail state — only its existence and what it asserts.
- **No live DB was queried.** No row-count or data-plausibility claim is made. "486K parcels" is quoted from `src/tests/parcel-cost-line-keys.logic.test.ts:7`, not re-measured.
- **`src/components/admin/` was counted but not classified** (13 files, 4,322 lines). Until Q14 rules on granularity, the web surface count of 24 is a floor. §4's "13 unclassified" is that gap, stated rather than guessed.
- **The 17 zero-call-site contracts** were established by grep over `src/app`, `src/components`, `src/features`, `mobile/app`, `mobile/src`, excluding tests, the route files themselves and the route-guard whitelist. A caller constructed from a variable path fragment would not have been found. Treat the list as "no literal in-repo reference", which is what was measured — with the exception of `/api/leads/view`, which was independently re-verified.
- **Table→route attribution was regex-derived** (`(FROM|INTO|UPDATE|JOIN)\s+[a-z_]+`) and carries CTE-alias false positives. The 87-table total and the `CREATE TABLE` list are exact; the per-route table lists are indicative. No claim in this report turns on a per-route table list.
- **`src/lib/quality/**`, `src/app/api/quality/**` and `scripts/lib/step/**` were read but never written**, per the constraint that other agents hold those paths.
- **The Context7 MCP server failed to connect this session** (`CONNECT_TIMEOUT`), so no external library-version claim appears anywhere above, per CLAUDE.md PD #9. That is why no dependency-upgrade advice is offered for the Zod/Drizzle/Expo versions this design would touch.
