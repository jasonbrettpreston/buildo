# HANDBOOK RULE LIST (verbatim copy; nothing trimmed): Mobile parcel cost tool (Spec 100, whole)
Source: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md:1-186
Generator: hand-written
Rules in the whole list: 7 (counted by pattern /^## \d+\./) · this is part 1 of 3

<<< Spec 100 whole (docs/specs/03-mobile/100_mobile_parcel_cost_tool.md:1-186) >>>
# Spec 100 — Mobile Parcel Cost Tool

**Status:** Active (WF1 2026-07-11)
**Cross-references:** Spec 89 (web-admin Parcel Cost Model Tool — the precedent this mirrors; §3 resolver, §2.4 tier-stratified degradation, §5 miss contract), Spec 88 (parcel cost model — cost-menu semantics §2.3–2.5), Spec 78 (optimal lot configuration — `nearby_builds_summary`/`comparable_builds`/opt_*), Spec 65 (enrich-parcels — envelope headlines), Spec 54 (address points + parcel bridge + the normalizer rules), Spec 90 (mobile engineering protocol — Bearer auth §11, Zod boundary §13), Spec 96 (subscription gate §10), Spec 98 (mobile testing protocol), Spec 99 (mobile state architecture — §4 query keys), Spec 91 (mobile lead feed — screen + hook precedent).

> ⚠️ **AMENDMENT 2026-09-15 (WF1 "Spec 126/127/128 surface standard") — Spec 126 impact. Additive: nothing below is rewritten, and the scope fence is UNCHANGED.**
>
> This tool is the **pilot surface** of the Spec 126 Surface Standard (`docs/specs/02-web-admin/126_maxbld_surface_standard.md` §11): `mobile/app/(app)/parcel-tool/[parcelId].tsx` becomes a descriptor of archetype **REPORT**, and `parcel-tool/index.tsx` a **SEARCH**. Three consequences worth knowing while reading this spec:
>
> 1. **The fence holds, and becomes mechanical.** §1's scope fence — *not coupled to the Lead Feed, Flight Center, or LeadDetail; the abandoned 23B "LeadDetail linkage" is explicitly dropped* — is **retained unchanged** (Spec 128 R-03). The one thing Spec 126 adds is a **declared id-translation seam**: a single CONTRACT, `parcel_id_translation` (Spec 126 §3.4), recording that `lead_parcels.parcel_id` is `parcels.id` (the SERIAL, named **`parcel_pk`**) while this spec's `parcelId` is `parcels.parcel_id` (the `VARCHAR(20)` municipal id, named **`parcel_ref`**). It has **no surface**, its `consumers[]` is `"none"`, and a `checks[]` entry at `severity: FAIL` asserts that it stays empty while the fence holds. Reversing the fence is an operator decision against Specs 77 and 91, not an edit here.
> 2. **The tool becomes its own metered product.** Spec 116 §5 OD5 is ruled (see that spec's 2026-09-15 amendment): product key **`parcel_tool`**. The current gate at `src/app/api/parcels/lookup/route.ts:46-59` is a boolean over the *global* `subscription_status`, not a per-product entitlement and not a meter; it becomes an entitlement lookup plus a `usage_events` ledger row.
>
> Dated note 2026-11-11 (M-246, prior text kept; MF-45 · McFrontend queue · lane E; operator, verbatim: "a" (D-1), "all five a" (D-2..D-6) and "y" (the MB-44 wait dropped, build starts); record `~/Buildo-scratch/mcfrontend/MF-45/DECISIONS.md` and `~/Buildo-scratch/mcfrontend/phase1/open-questions.md`, "2026-11-11 MF-45: operator \"y\""; plan `~/Buildo-scratch/mcfrontend/MF-45/plan.md` with its section 12 folds): item 2 lands. The lookup is an entitlement lookup (`parcel_tool`, or the `lead_gen` status on the transitional App A path until MF-50) plus a `usage_events` ledger row: a hit for a `parcel_tool` user writes one `property_view` row keyed on the matched `parcels.parcel_id` (`parcel_ref`), after the response has passed its `.strict()` parse; candidates, a miss, a dangling id, a refusal or an error write none. A new lot past the monthly allowance is a 403 `REPORT_LIMIT_REACHED` with `reportsLimit` and `resetsOn` and no parcel payload; re-opening a counted lot is free. The response whitelist (section 3.2) is unchanged. Item 2 above is unchanged.
>
> 3. **§2's numbered behavioural contract and §3.2's field whitelist become descriptor data.** Under Spec 126 §5.7 a value declared in two places is a drift source — measured four times over in this tool's own cost-line contract. §1 (goal / user story), §5 and §8 stay human narrative; §2 and §3.2 are deleted from prose **only at the conversion commit**, not before, and not by this amendment.
>
> **Measured defect this spec's readers should know about now:** `mobile/src/lib/parcelCostFormat.ts:14 COST_LINE_ORDER` transcribes `scripts/lib/parcel-cost.js:77 PARCEL_COST_LINES` with a different order and **no lock**. The admin twin of that constant shipped broken from its first commit (`4b1712ff`) — three cost lines rendering *"n/a — not computable"* on 100% of 486K parcels, with a green UI suite because the fixture was authored against the wrong keys (`src/tests/parcel-cost-line-keys.logic.test.ts:4-13`). That test closed the admin side; **the mobile side is today in exactly the pre-fix state.**

> Dated note 2026-11-14 (M-246, prior text kept; MF-47 · McFrontend queue · lane B1; operator, verbatim: "I'll accept the recommendation for both WF-83 and MF-47 - as long as it complaint and the new ruling if required is recorded" (2026-11-14); record `~/Buildo-scratch/mcfrontend/MF-47/DECISIONS.md`, "Ruled 2026-11-14 under the operator's acceptance", and the seat `~/Buildo-scratch/mcfrontend/MF-47/reality-check-1114.md`; build plan `~/Buildo-scratch/mcfrontend/MF-47/build-plan.md`): v1 ruling "Access = existing app users" (line 27) remains the App A path. MaxBLD users buy on the web (Stripe-hosted checkout, a card-up-front trial of 10 reports, then Basic or Pro) and hold a `parcel_tool` entitlement; the monthly allowance depends on its `plan_key` (Spec 116 OD4 note 2026-11-14). The lookup meter reads the allowance by status and plan, sets a transaction-local statement time limit from the setting `parcel_tool_meter_statement_timeout_ms` (5000), and stores `meta.extra = false` on each ledger row (decided at insert, never recomputed; always false while the cap is 0).

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

