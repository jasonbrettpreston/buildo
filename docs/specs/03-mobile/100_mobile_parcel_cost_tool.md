# Spec 100 — Mobile Parcel Cost Tool

**Status:** Active (WF1 2026-07-11)
**Cross-references:** Spec 89 (web-admin Parcel Cost Model Tool — the precedent this mirrors; §3 resolver, §2.4 tier-stratified degradation, §5 miss contract), Spec 88 (parcel cost model — cost-menu semantics §2.3–2.5), Spec 78 (optimal lot configuration — `nearby_builds_summary`/`comparable_builds`/opt_*), Spec 65 (enrich-parcels — envelope headlines), Spec 54 (address points + parcel bridge + the normalizer rules), Spec 90 (mobile engineering protocol — Bearer auth §11, Zod boundary §13), Spec 96 (subscription gate §10), Spec 98 (mobile testing protocol), Spec 99 (mobile state architecture — §4 query keys), Spec 91 (mobile lead feed — screen + hook precedent).

## 1. Goal & User Story

**Goal:** a **standalone, read-only home-looker feature** on the mobile main menu. A user opens the *Parcels* tab, types any Toronto address, and sees THAT parcel's full story — what they can build on the lot (buildable-envelope headlines), what every renovation would cost (the proprietary 13-line cost menu), and what the neighbours have been doing (the existing summary + examples the pipeline already stores — comp stats, nearby CoA decisions, comparable builds — with **FSI and build type** made prominent so a lay reader can see what the CoA can actually deliver).

**User story:** *As a prospective buyer or owner, I open Parcels, search "26 Hurlingham Cres", and immediately see: what the lot can hold, what a new build / addition / suite / kitchen would cost me, and what similar owners nearby have won at the Committee of Adjustment.*

**What this is NOT (scope fence):**
- It is **not** coupled to the Lead Feed, Flight Center, or LeadDetail. It creates **no** permit/CoA lead objects, no saves, no board rows. The abandoned 23B "LeadDetail linkage" is explicitly dropped.
- It **derives nothing new.** Every value is an existing `parcels` column (or a nearby `coa_applications` row) re-organized for presentation. Formatting (units, `$`, labels, FSI rounding) is presentation, not derivation. Zero writes; zero migrations; zero pipeline changes.

**v1 rulings (user 2026-07-11):**
- **Access = existing app users** — session (Bearer) auth + the current subscription gate. The home-looker persona / pricing is revisited later (§8).
- **Examples = the existing schema data** — pull `nearby_builds_summary`, `comparable_builds`, comp scalars, and nearby `coa_applications`. Derive nothing.
- **Map = fast-follow** (Spec 100 §8 / a separate WF). v1 is search → detail.
- **Ad slots (architects / designers) = a RESERVED sponsor-slot region** in the layout + a Future section (§8). Zero code beyond a null-rendering placeholder (§6.8).

## 2. Behavioral Contract

1. **Presentation only.** Pulls existing `parcels` columns + a nearby `coa_applications` list and organizes them. Creates, derives, and mutates **nothing**.
2. **Two consumer tiers (the diagnostic Tier-3 groups of Spec 89 are EXCLUDED by design).** The consumer sees exactly:
   - **Tier 1 — the proprietary payload:** the 13-line cost menu (`parcel_cost_menu`), the 12 cost scalars, and the lot / envelope / optimal-config **headline** figures (§3.2 whitelist).
   - **Tier 2 — the neighbourhood:** `nearby_builds_summary` headline · comp stats · nearby `coa_applications` examples (undecided-first) · `comparable_builds` examples with **FSI + build type** prominent.
   - **NO Tier 3.** The Spec 89 diagnostic column groups (zoning internals, heritage/ravine/centreline, existing structure, raw scenarios, accessory internals, identity, lot-address normalization) are **never** in the consumer response. The response object carries **no `groups` key** (asserted by the whitelist infra test §6).
3. **Absent ≠ `fits:false` (Spec 88 §2.4).** A cost-menu line that is *absent* means "not computable for this parcel"; `fits:false` means "computed — does not fit this lot". The UI MUST render these distinctly (n/a vs a "doesn't fit" badge). Blurring them misrepresents the model.
4. **Envelope-fallback honesty (Spec 88 §2.5).** The `max_build` cost line prices `opt_aor_gfa_sqm` when present, else falls back to the maximum-build envelope (`max_buildable_gfa_sqm`). When the as-of-right optimal GFA is absent (`areas.opt_aor_gfa_sqm == null`) the UI MUST label that line **"maximum envelope"**, never "as-of-right" — the two are a real distinction the consumer now sees.
5. **Degrade, don't blank (tier-stratified validation).** Each typed tier shape and each pass-through JSONB is `safeParse`d independently. A failing tier degrades to `null`, appends a human entry to `warnings[]` (carried into the consumer response explicitly), and emits `logWarn('[api/parcel-lookup] jsonb-drift', {field, parcelId})`. The Tier-1 payload MUST never go blank because a Tier-2 blob drifted. A strict whole-payload parse (500 on any drift) is explicitly rejected (Spec 89 §2.4 verbatim).
6. **A miss is a result, not an error (Spec 89 §5 exact payloads).** No match → HTTP **200** with `match: null, candidates: [], parcel: null`. Ambiguity → 200 with `candidates` (≤10) and `parcel: null`. An **unknown `parcelId`** → 200 with `match: null, parcel: null` (NOT 404 — the shape drives the client state machine). Errors are reserved for malformed input (400), missing/expired auth (401/403), rate limit (429), and genuine failures (500).
7. **Server-side subscription gate (a deliberate first for a consumer route — §5).** The proprietary cost model is gated in the handler: `ctx.subscription_status ∉ {trial, active, past_due, admin_managed}` (i.e. expired / cancelled_pending_deletion / null / unknown) → **403**. This is an exception to the mobile client-gate pattern, justified by the value of the cost payload; see §5.
8. **Observability with log-hygiene (Spec 89 §2.6, adapted).** Every request logs `{uid, outcome, parcelId, matchType, duration_ms}` — and **never the raw search text `q`** (the admin tool logs `q`; the consumer route must not). `duration_ms > 500` additionally logs a WARN.
9. **Toronto scoping is data-inherent, not enforced by the client (§6).** The corpus IS Toronto; the client's `isInsideToronto` hint is UX, not a security boundary.

## 3. API

### `GET /api/parcels/lookup?q=<address>` | `?parcelId=<id>`

Exactly one of `q` / `parcelId` (400 otherwise). `getCurrentUserContext` is the FIRST await; the subscription gate (§2.7) follows; `withApiEnvelope`; `{ data, error, meta }` envelope; **parameterized SQL only**.

- **Auth + gate order:** `getCurrentUserContext` → 401 if null → subscription gate → 403 if inactive → Zod → 400 → rate limit → 429.
- **Rate buckets (per uid):** `parcels-search:${uid}` **60/min** on the `q` path (typeahead exploration is chatty; a 30/min bucket bites), `parcels-lookup:${uid}` **30/min** on the `parcelId` path. Detail fetches use the separate lookup bucket so heavy searching cannot exhaust the detail budget.
- **Route-guard:** `/api/parcels` is an explicit `AUTHENTICATED_API_ROUTES` entry (Bearer accepted, per the `/api/leads` precedent).

**Resolution.** Reuses the Spec 89 admin resolver **internals verbatim** (`resolveAddress`, `fetchParcelById`, `fetchCoaProjects` from `@/lib/admin/parcel-lookup`) — the normalizers (`@/lib/parcels/address`) are **not** forked (a third copy would silently diverge from the JOIN keys; Spec 89 Known Failure Modes). `q` path: exact match on `parcels(addr_num_normalized, street_name_normalized)`, else typeahead on the **indexed normalized** `address_points` columns with the production-correct status filter (`(address_status IS NULL OR UPPER(address_status) IN ('CURRENT','NONE')) AND UPPER(maint_stage) = 'REGULAR'`). `parcelId` path bypasses resolution.

**Response** (`src/app/api/parcels/lookup/types.ts` — the frozen contract; `ConsumerParcelLookupResponse`):
```ts
interface ConsumerParcelLookupResponse {
  match: { parcelId: string; matchType: 'exact' | 'typeahead' | 'direct'; address: string } | null;
  candidates: Array<{ parcelId: string; address: string }>;
  warnings: string[];                                   // tier-degradation notices
  parcel: {
    costMenu: { menu: CostMenu | null; scalars: CostScalars | null };  // Tier 1 (deep-validated)
    areas: AreaHeadlines;                                               // Tier 1 headlines
    neighbourhood: {                                                    // Tier 2
      summary: NearbyBuildsSummary | null;
      compStats: CompStats;
      coaProjects: CoaProject[];
      comparableBuilds: ComparableBuild[] | null;
    };
    // NO `groups`. Tier-3 diagnostic columns are excluded by design.
  } | null;
}
```

### 3.2 The WHITELIST (every exposed field named — §6 test enforces it)

The response is an **explicit allow-list**, not a deny-list. A future Tier-2 column MUST NOT leak by default; the assembler picks each field by name and the infra test fails on any unlisted key (and on the presence of `groups` or any Spec 89 Tier-3 diagnostic column name).

- **`match`** — `parcelId`, `matchType`, `address`.
- **`candidates[]`** — `parcelId`, `address`.
- **`warnings[]`** — human strings.
- **Tier 1 `costMenu.menu`** — the `parcel_cost_menu` JSONB verbatim (`CostMenuSchema` reused from Spec 89: `_schema_version` + per-line `{ total, per_sqm, area, area_confidence, norm_basis, trades, products, fits? }`), nullable-honest (absent line = not computable).
- **Tier 1 `costMenu.scalars`** — the 12 cost scalars, each nullable: `cost_fb_total, cost_coa_total, cost_solar_total, cost_garden_suite_total, cost_laneway_suite_total, cost_garage_total, cost_gut_total, cost_addition_total, cost_kitchen_per_sqm, cost_bath_per_sqm, cost_basement_per_sqm, cost_basement_underpin_per_sqm`.
- **Tier 1 `areas`** (the lot / envelope / optimal-config **headline** whitelist — `CONSUMER_HEADLINE_COLS`): `lot_size_sqm, lot_size_sqft, opt_aor_gfa_sqm, opt_aor_storeys, opt_coa_gfa_sqm, opt_coa_storeys, max_buildable_gfa_sqm, max_buildable_footprint_sqm, max_build_stories, max_build_fsi, coa_fsi, realized_fsi_p90, cur_floor_gfa_sqm, max_newbuild_coa_gfa_sqm, envelope_constrained, envelope_constraint_reason`. (These are consciously promoted to consumer headlines; the remaining `max_build_*` diagnostic columns stay excluded.)
- **Tier 2 `neighbourhood.summary`** — `nearby_builds_summary` JSONB (`NearbyBuildsSummarySchema`: `headline, basis`, + optional `coa_approval_rate, typical_fsi, comp_fsi_basis`).
- **Tier 2 `neighbourhood.compStats`** — `compCount, compDominantBuild, compBuildRatioP50, compFsiP50, neighbourhoodId, neighbourhoodCostPremium`.
- **Tier 2 `neighbourhood.coaProjects[]`** (nearby `coa_applications`, undecided-first, LIMIT 20) — `applicationNumber, address, status, decision, decisionDate, hearingDate, description, projectType, modeledGfaSqm, estimatedCost`.
- **Tier 2 `neighbourhood.comparableBuilds[]`** (from `comparable_builds` JSONB, first ≤12 examples, each field explicitly picked — NO passthrough): `address, lot_sqm, frontage_m, distance_m, work_type, permit_gfa_sqm, permit_fsi, storeys, coa_decision, build_ratio, structure_family`. **`permit_fsi` (FSI) and `structure_family` / `work_type` (build type) are the prominent presentation fields (§1).**

Everything else in `parcels` — zoning internals, bylaw fields, heritage/ravine/centreline, existing-structure, raw scenario GFAs, accessory internals, identity, lot-address normalization, `geometry`/`geom` — is **NOT exposed.**

## 4. Screens (23B — the working milestone)

- **Main-menu entry:** a `parcel-tool` tab in `mobile/app/(app)/_layout.tsx` (the tab bar is the app's main menu; Spec 91 §2 convention). The tab hosts a nested Stack (`mobile/app/(app)/parcel-tool/_layout.tsx`) with `index` (search) → `[parcelId]` (detail).
- **`ParcelSearchScreen`** (`parcel-tool/index.tsx`): debounced (≥400 ms) typeahead against `?q=`; candidate list; a static "Toronto addresses only" hint and, when device coords are available and outside Toronto bounds, an `isInsideToronto`-driven UX note (data-inherent scoping, §2.9); `RateLimitError` retry-after surfaced inline. Query key `['parcel-search', q]`.
- **`ParcelDetailScreen`** (`parcel-tool/[parcelId].tsx`): `useParcelLookup(parcelId)` — the detail depends **only** on `['parcel-lookup', parcelId]` (query-key hygiene, Spec 99 §4). NO Layer-3 store (read-only). Sections, top-to-bottom:
  1. **Lot + envelope headlines** (lot size, buildable GFA/footprint, max-build storeys, FSI, envelope-constrained reason).
  2. **Cost-menu cards** — absent lines render "n/a" (not a "doesn't fit" badge); `fits:false` lines render a distinct "doesn't fit this lot" badge; the `max_build` line labels its basis "maximum envelope" when `opt_aor_gfa_sqm` is null (§2.4).
  3. **Neighbours summary** (`nearby_builds_summary` headline + comp stats).
  4. **EXAMPLES list** — comparable builds + nearby CoA projects, **FSI + build type prominent**.
  5. **The RESERVED sponsor slot** — a named, empty `SponsorSlot` region (§6.8).
- **Zod mirror:** `mobile/src/lib/schemas.ts` gains `ConsumerParcelLookupResultSchema` mirroring the server contract; the hook parses `raw.data` through it (Spec 90 §13 Zod boundary).
- **Cross-contract lock:** a test pipes a **server-emitted** `parcelId` (from the search response) into the lookup path (the Spec 91 seam class — both sides validated against one shape).

## 5. Subscription-check exception (documented)

Consumer/mobile routes historically enforce subscription state at the **client** (the `AppLayout` gate, Spec 96 §10). This route additionally enforces it **server-side** because the response is the proprietary cost model — a value payload we will not serve to a lapsed or deleted account even if a stale client bypasses the UI gate. The gate reads the already-fetched `ctx.subscription_status`; the allowed set mirrors `AppLayout` app-content access (`trial | active | past_due | admin_managed`). The mobile `AppLayout` subscription gate remains the UX enforcement; the two are defense-in-depth, not redundancy. Parcel lookups do **not** touch the permit-shaped trial counter — a future `parcel_view_events` counter is a separate migration if ever wanted.

## 6. Test Plan (Spec 98 tiers)

- **`.infra` (always-run):** route source-shape locks — `getCurrentUserContext` FIRST await · subscription 403 branch present · `withApiEnvelope` + envelope helpers · both rate buckets present with the right limits · parameterized SQL only (reuses the admin lib) · **THE WHITELIST TEST** — the response type + a shape fixture prove the response is ⊆ the §3.2 named field set, carries **no `groups`**, and carries **no** Spec 89 Tier-3 diagnostic column name · Zod request behaviors (exactly one of q/parcelId; min length; 400 shapes) · the log-hygiene lock (`q` is never logged).
- **`.db` (BUILDO_TEST_DB=1):** exact hit → whitelist payload · ambiguous → candidates (+ `parcel: null`) · direct `parcelId` · **unknown `parcelId` → 200 `match:null, parcel:null`** (not 404) · cost-menu-null parcel → Tier 1 renders honestly · NULL-`neighbourhood_id` → `coaProjects: []`.
- **Mobile Jest (`mobile/__tests__/`, jest-node — no render tree per Spec 98):** `ConsumerParcelLookupResultSchema` parses a server-shaped fixture; rejects a drifted shape · the pure presentation helpers (`parcelCostFormat.ts` — envelope-fallback label, absent-vs-`fits:false`, FSI/area formatting) · the **cross-contract lock** (a server-emitted `parcelId` fixture piped search→lookup) · `SponsorSlot` renders null while flag-off.

## Operating Boundaries

- **Target Files:** `src/app/api/parcels/lookup/{route.ts,types.ts}` · `src/lib/parcels/consumer-lookup.ts` · `src/lib/auth/route-guard.ts` (one `AUTHENTICATED_API_ROUTES` entry) · `src/features/leads/api/error-mapping.ts` (one subscription-403 helper) · `mobile/src/lib/schemas.ts` (the consumer mirror) · `mobile/src/hooks/useParcelLookup.ts` · `mobile/src/lib/parcelCostFormat.ts` · `mobile/src/components/parcel/SponsorSlot.tsx` · `mobile/app/(app)/parcel-tool/{_layout.tsx,index.tsx,[parcelId].tsx}` · one tab entry in `mobile/app/(app)/_layout.tsx` · the §6 test files.
- **Out-of-Scope Files:** ALL of `scripts/`, `migrations/` (zero migrations, zero new indexes — the resolver reuses Spec 89 §3.3's indexed normalized columns), `src/lib/parcels/address.ts` (reused, never forked), the admin tool (`src/app/api/admin/parcels/**`, `src/app/admin/**`), the Lead Feed / Flight Center code.
- **Cross-Spec Dependencies:** Spec 89 (resolver internals + tier degradation, consumed read-only), Spec 88 (cost-menu §2.3–2.5), Spec 78 / 65 (headline + neighbourhood columns), Spec 54 (address bridge + normalizer rules), Spec 96 §10 (subscription statuses), Spec 99 §4 (query keys), Spec 90 §11/§13 (auth + Zod boundary).

## Known Failure Modes

- **Whitelist leak (NEW).** A future migration adds a Tier-2/Tier-3 `parcels` column and a naive assembler spreads it into the response. Guard: the §3.2 explicit pick-by-name assembler + the `.infra` whitelist test (no unlisted key; no `groups`; no Spec 89 Tier-3 column name).
- **`address_status='CURRENT'`-only filter** — matches 0 production rows (data is `'None'`/NULL). Guard: the resolver reuses the Spec 89 §3 filter (`NULL/CURRENT/NONE` + `maint_stage='REGULAR'`); the admin lib's own test pins it, and this route imports that lib.
- **Third normalizer copy** — a new TS/JS port would silently diverge from the JOIN keys. Guard: reuse `@/lib/parcels/address` via the admin lib; never fork.
- **No-match-is-a-result** — treating a miss or an unknown `parcelId` as a 404 breaks the client state machine. Guard: the §2.6 200-with-null contract + the `.db` unknown-`parcelId` case.
- **Tier-stratified degradation** — a whole-payload strict Zod would blank the Tier-1 cost menu when a Tier-2 blob drifts. Guard: independent `safeParse` per tier + `warnings[]` (Spec 89 §2.4), tested in `.db`.
- **Envelope-fallback mislabel (NEW).** Labeling a `max_build` line "as-of-right" when it was priced off the max envelope (`opt_aor` NULL) misrepresents the number. Guard: the §2.4 label rule + the `parcelCostFormat` helper test.
- **Sponsor-slot empty DOM (NEW).** The reserved region must render `null` (not an empty styled box) until flag-gated. Guard: `SponsorSlot` returns `null` while off + its Jest test.
- **Raw `q` in logs.** Search text is user input; logging it is a hygiene regression. Guard: the observability logs `outcome` + `parcelId` + `matchType` only; the `.infra` log-hygiene lock asserts `q` is never passed to `logInfo`.

## 8. Future (reserved — no v1 code beyond the null placeholder)

- **Sponsor slots** — architect / designer / trade sponsorships rendered in the reserved `SponsorSlot` region on the detail screen, flag-gated (`EXPO_PUBLIC_PARCEL_SPONSORS`). A future spec defines the slot inventory, targeting, and billing.
- **Map fast-follow (23C — own WF):** a map pane with the parcel + example pins, a map-search mode, and a Maestro `parcel-cost.yaml` battery. Requires exposing `centroid_lat/lng` in the response (a conscious whitelist extension) and is out of v1 scope.
- **Home-looker persona / pricing** — v1 access is existing subscribed app users; a distinct home-looker persona, entitlement, and pricing (and an optional `parcel_view_events` trial counter) are a later product decision.
