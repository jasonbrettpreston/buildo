# Spec 89 — Parcel Cost Model Tool (web-admin)

**Status:** Active (WF1 2026-07-06)
**Cross-references:** Spec 33 (admin engineering protocol — authority for `src/app/admin/**`), Spec 34 (testing), Spec 35 (state, §3.1 row `parcel_lookup`), Spec 88 (parcel cost model — cost-menu semantics), Spec 78 (optimal lot configuration), Spec 65 (enrich-parcels), Spec 58 (zoning), Spec 54 (address points + parcel bridge), Spec 26 (admin dashboard hub).

## 1. Goal & User Story

**Goal:** a read-only admin tool — the **admin prototype of the future consumer parcel screen**. An admin types any Toronto address into a search bar, presses Search, and sees THAT parcel with **all of its pipeline-derived fields**, organized by commercial importance: the proprietary renovation-cost menu first, the neighbourhood CoA picture second, everything else third.

**User story:** *As an admin acting as the future consumer, I search "26 Hurlingham Cres" and immediately see what every renovation would cost on that lot, what similar owners nearby have built and won at the CoA, and — on demand — every other fact the pipeline knows about the parcel.*

## 2. Behavioral Contract

1. **Presentation only.** The tool pulls existing `parcels` columns (+ a nearby `coa_applications` list) and organizes them. It creates, derives, and mutates **nothing**. Formatting (units, `$` formatting, group labels, date rendering) is presentation, not derivation. Zero writes; zero migrations.
2. **The three-tier organization is NORMATIVE** (order is contract, not cosmetics):
   - **Tier 1 — proprietary payload (always expanded, top):** the 13-line cost menu (`parcel_cost_menu`) + the 12 cost scalars + the headline GFA/area figures.
   - **Tier 2 — the neighbourhood:** `nearby_builds_summary` headline · **specific projects in front of the CoA** (nearby `coa_applications`, undecided-first, newest hearings first, LIMIT 20) · the parcel's `comparable_builds` + comp scalars.
   - **Tier 3 — everything else:** the remaining columns in collapsed groups (§4 mapping), rendered by a type-aware `GenericFieldRenderer`.
3. **Absent ≠ `fits:false` (Spec 88 §2.4).** A cost-menu line that is *absent* means "not computable for this parcel"; `fits:false` means "computed — does not fit this lot". The UI MUST render these distinctly (e.g. "n/a" vs a "doesn't fit" badge). Blurring them misrepresents the model.
4. **Degrade, don't blank (tier-stratified validation).** Each typed tier shape and each pass-through JSONB is `safeParse`d independently. A failing tier degrades to `null`, appends a human entry to `warnings[]`, and emits `logWarn('[api/parcel-lookup] jsonb-drift', {field, parcelId})`. The PRIMARY tier must never go blank because a SECONDARY blob drifted. A strict whole-payload parse (500 on any drift) is explicitly rejected.
5. **A miss is a result, not an error.** No match → HTTP 200 with `match: null, candidates: []`. Ambiguity → 200 with `candidates` (≤10). Errors are reserved for malformed input (400) and genuine failures (500).
6. **Read-only observability (Spec 33):** no `admin_action` Sentry breadcrumb (mutation-scoped mandate — this tool mutates nothing). Every successful lookup logs `{adminUid, q|parcelId, matchType, duration_ms}`; `duration_ms > 500` additionally logs WARN + a `slow_query` Sentry breadcrumb (§12). UI emits `captureEvent()` on search and group-expand (§13.1). Searched addresses are public cadastral data — logging them is the audit intent, not PII.

## 3. API

### `GET /api/admin/parcels/lookup?q=<address>` | `?parcelId=<id>`

Exactly one of `q` / `parcelId` (400 otherwise). `verifyAdminAuth` first line; `withApiEnvelope`; `{ data, error, meta }` envelope; **parameterized SQL only** (`$1…` — never interpolated input).

**Resolution (`q` path):**
1. Parse with `@/lib/parcels/address` (`normalizeAddressNumber` + `parseLinearName` — the EXISTING TS mirror of `scripts/lib/address-normalizers.js`; the two files carry cross-reference comments and a parity test pins them. Two deliberate rules are preserved, not fixed: *first-street-type-token-wins* and *trailing-directional-strip* — established JOIN-key behaviors).
2. Exact match: `parcels(addr_num_normalized, street_name_normalized)` via `idx_parcels_address`.
3. Miss/multi → typeahead on `address_points` **normalized columns** (prefix match on `addr_num_normalized` + `linear_name_normalized` — both btree-indexed; `address_full` is NOT indexed and MUST NOT be the filter) with the **production-correct status filter**:
   `(address_status IS NULL OR UPPER(address_status) IN ('CURRENT','NONE')) AND maint_stage = 'REGULAR'`
   (live data is 100% `'None'`/NULL — `address_status='CURRENT'` alone matches ZERO rows; this mirrors the link-parcels/link-coa WF3 hotfix) → `parcel_address_points` bridge → ≤10 `candidates`.
4. `parcelId` path bypasses resolution (candidates click through by id — re-querying by address text can re-ambiguate on corner lots/condos).

**Parcel read:** ONE row, **explicit projection of ALL columns except `geometry`/`geom`** (map blobs; `centroid_lat/lng` kept). Raw SQL via the `query()` helper (`@/lib/db/client`) — the Spec 88 cost columns are absent from drizzle `schema.ts` (known mig-206 drift). Exhaustiveness is **enforced by the schema-drift test** (§6), not by promise.

**Nearby CoA:** `SELECT application_number, address, status, decision, decision_date, hearing_date, description, project_type, modeled_gfa_sqm, estimated_cost FROM coa_applications WHERE neighbourhood_id = $1 ORDER BY (decision IS NULL) DESC, hearing_date DESC NULLS LAST LIMIT 20` (`idx_coa_neighbourhood`). `parcels.neighbourhood_id IS NULL` → skip the query, `coaProjects: []`.

**Response** (`src/app/api/admin/parcels/lookup/types.ts` — the frozen contract):
```ts
interface ParcelLookupResponse {
  match: { parcelId: string; matchType: 'exact' | 'typeahead' | 'direct'; address: string } | null;
  candidates: Array<{ parcelId: string; address: string }>;
  warnings: string[];                       // tier-degradation notices
  parcel: {
    costMenu: { menu: CostMenu | null; scalars: CostScalars };   // tier 1 (deep-validated)
    areas: AreaHeadlines;                                        // tier 1
    neighbourhood: { summary: NearbyBuildsSummary | null; coaProjects: CoaProject[];
                     comparableBuilds: unknown[] | null; compStats: CompStats };  // tier 2
    groups: Record<GroupKey, Record<string, unknown>>;           // tier 3 (values unknown BY DESIGN)
  } | null;
}
```
**§11 compliance decisions (recorded):** tier-3 field names are the raw DB column names — this is a data-transparency tool (precedent: Step-Output Inspector); the STABLE contract is the group keys + tier-1/2 typed shapes. Geometry excluded from "all fields" by design (map payload, not data), guarded by the drift test's exclusion list.

## 4. The column-to-group mapping (NORMATIVE)

Every `parcels` column appears in **exactly one** tier. The schema-drift test asserts: tier-1 ∪ tier-2 ∪ tier-3 ∪ exclusions = `information_schema.columns` for `parcels`. A future migration adding a column FAILS the test until it is mapped here.

| Tier / group | Columns |
|---|---|
| **EXCLUDED** | `geometry`, `geom` |
| **T1 `costMenu`** | `parcel_cost_menu` + `cost_fb_total, cost_coa_total, cost_solar_total, cost_garden_suite_total, cost_laneway_suite_total, cost_garage_total, cost_gut_total, cost_addition_total, cost_kitchen_per_sqm, cost_bath_per_sqm, cost_basement_per_sqm, cost_basement_underpin_per_sqm` |
| **T1 `areas`** | `lot_size_sqm, lot_size_sqft, opt_aor_gfa_sqm, opt_aor_storeys, opt_coa_gfa_sqm, opt_coa_storeys, max_buildable_gfa_sqm, max_buildable_footprint_sqm, imagery_roof_gfa_sqm, imagery_roof_footprint_sqm, cur_floor_gfa_sqm, max_newbuild_coa_gfa_sqm` |
| **T2 `neighbourhood`** | `nearby_builds_summary, comparable_builds, comp_count, comp_dominant_build, comp_build_ratio_p50, comp_fsi_p50, neighbourhood_id, neighbourhood_cost_premium` (+ the `coa_applications` list — not parcel columns) |
| **T3 `identity`** | `id, parcel_id, feature_type, date_effective, date_expiry, created_at, centroid_lat, centroid_lng, is_irregular` |
| **T3 `lot_address`** | `address_number, linear_name_full, addr_num_normalized, street_name_normalized, street_type_normalized, stated_area_raw, frontage_m, frontage_ft, depth_m, depth_ft, lot_size_confidence, lot_size_basis` |
| **T3 `zoning`** | `zoning_class, zoning_zn_string, zoning_gen_zone, zoning_holding, zone_status, bylaw_max_fsi, bylaw_max_coverage_pct, bylaw_max_height_m, bylaw_max_stories, bylaw_max_units, bylaw_max_density, bylaw_min_frontage_m, bylaw_min_area_sqm, bylaw_standard_setback_m, bylaw_pct_commercial_max, bylaw_pct_residential_max, bylaw_pct_employment_max, bylaw_pct_office_max, exception_number, exception_text, bylaw_chapter, bylaw_section, bylaw_exception_ref, in_policy_area, on_policy_road, in_rooming_house_overlay, in_parking_zone_overlay, in_building_setback_overlay, on_priority_retail, in_queenstw_eat_overlay, zoning_overlays, zoning_base_source_id, zoning_dominant_area_share, zoning_is_ambiguous, zoning_base_source_dataset_version, zoning_enriched_at` |
| **T3 `heritage_ravine_centreline`** | `is_in_ravine_protection_area, ravine_distance_m, ravine_dataset_version_when_enriched, is_heritage_designated, heritage_designation_type, heritage_designation_date, heritage_dataset_version_when_enriched, is_corner_lot, is_through_lot, primary_frontage_street_name, centreline_dataset_version_when_enriched, abuts_laneway` |
| **T3 `existing_structure`** | `existing_stories, existing_height_m, existing_width_m, existing_length_m, existing_structure_confidence, existing_other_structures_count, existing_other_structures_sqm, existing_greenspace_sqm, existing_data_quality_flag, cur_gfa_low_sqm, cur_gfa_high_sqm, cur_storeys_range, cur_gfa_band_basis` |
| **T3 `max_build`** | `max_build_setback_basis, max_build_width_m, max_build_length_m, max_build_height_m, max_build_stories, max_build_basis, max_buildable_gfa_basis, max_build_confidence, envelope_constrained, envelope_constraint_reason, max_build_stories_basis, max_build_stories_aggressive, market_exceeds_bylaw, max_build_fsi, coa_fsi, realized_fsi_p90` |
| **T3 `scenarios`** | `cur_basement_gfa_sqm, cur_storey_gfa_sqm, cur_interior_reno_gfa_sqm, cur_est_kitchen_gfa_sqm, cur_est_bath_gfa_sqm, cur_pot_2story_gfa_sqm, cur_pot_3story_gfa_sqm, cur_gfa_range_basis` |
| **T3 `accessory`** | `garden_suite_fits, max_garden_suite_gfa_sqm, max_garage_gfa_sqm, garage_capacity_cars, garage_constraint_reason, garage_permission, max_laneway_suite_gfa_sqm, max_rear_suite_gfa_sqm, rear_suite_type, rear_suite_permission` |
| **T3 `optimal_config`** | `opt_aor_units, opt_suite_type, opt_suite_fits_full, opt_binding_constraint, opt_config_confidence, optimal_config` |

`GroupKey = 'identity' | 'lot_address' | 'zoning' | 'heritage_ravine_centreline' | 'existing_structure' | 'max_build' | 'scenarios' | 'accessory' | 'optimal_config'` (9 groups).

## 5. §4 Edge Cases

| Case | Behavior |
|---|---|
| No match | 200 · `match:null, candidates:[], parcel:null` · UI: "no parcel found" |
| Ambiguous | 200 · `candidates` ≤10 · UI list; click → `?parcelId=` |
| Parcel with NO cost menu | tier 1 renders "not yet computed" — NOT an error (un-run pipeline / non-residential) |
| `fits:false` line | rendered distinctly from absent (§2.3) |
| NULL `neighbourhood_id` | CoA query skipped · `coaProjects:[]` · summary from the parcel JSONB if present |
| Un-enriched parcel | NULL-heavy tiers render honestly (dashes), no crash |
| Malformed/empty `q` · both/neither params | 400 `badRequestZod` |
| Injection attempt (`"; DROP TABLE…`) | parameterized SQL → safe miss (tested) |
| JSONB drift | tier degrades to null + `warnings[]` + logWarn (§2.4) |

## 6. Test Plan (Spec 34 triad + E2E)

- **`.logic`:** TS↔JS normalizer **parity** on shared fixtures incl. the two fence behaviors (closes `review_followups.md` row 317 — targets the EXISTING `@/lib/parcels/address`) · the grouping function (column → group assignment).
- **`.infra` (always-run):** route source-shape locks (verifyAdminAuth first, withApiEnvelope, parameterized) · Zod request behaviors (400s, both/neither params) · **schema-drift test via the COMMITTED SNAPSHOT** (`src/tests/fixtures/parcels-columns.snapshot.json` — the §4 mapping ∪ exclusions must equal it; a migration adding a `parcels` column must regenerate the snapshot AND extend the mapping, failing at pre-commit otherwise; the `.db` test then validates the snapshot against the live `information_schema`, so a stale snapshot cannot hide).
- **`.db` (BUILDO_TEST_DB-gated):** exact hit shape · ambiguous → candidates · `parcelId` direct · cost-menu-null parcel · NULL-neighbourhood parcel.
- **`.ui` (jsdom):** idle/loading/error/empty-neighbourhood states · 3-tier order · candidates flow · absent-vs-`fits:false` badges · `GenericFieldRenderer` value types (null/number/boolean/date/JSONB/long-string) · accordion toggle + `captureEvent` · 375px smoke.
- **E2E (Playwright, Spec 34 §3.2):** `tests/e2e/parcel-cost-tool.spec.ts` — page loads · auth gate · search → seeded result renders.

## Operating Boundaries

- **Target Files:** `src/app/api/admin/parcels/lookup/{route.ts,types.ts}` · `src/features/admin-flight-center/api/useParcelLookup.ts` · `src/app/admin/parcel-cost/{page.tsx,error.tsx}` · `src/components/admin/ParcelCostTool.tsx` (+ `GenericFieldRenderer`) · one nav card in `src/app/admin/page.tsx` · the §6 test files · cross-reference comments in `src/lib/parcels/address.ts` + `scripts/lib/address-normalizers.js`.
- **Out-of-Scope Files:** ALL of `scripts/` (except the comment), `migrations/` (zero migrations — incl. NO new indexes; pg_trgm contains-search is a deferred follow-up), `src/lib/db/generated/` (drizzle drift fixed elsewhere), the Expo app (`mobile/`), all pipeline specs' code.
- **Cross-Spec Dependencies:** Spec 88 (cost-menu shape §2.3–2.4 — consumed read-only), Spec 78 (`nearby_builds_summary`/`comparable_builds`/opt_*), Spec 65 (envelope/scenario/accessory fields), Spec 58 (zoning fields), Spec 54 (`address_points` + `parcel_address_points` + the normalizer rules), Spec 33 §5/§12/§13 (auth + observability), Spec 35 §3.1 (the `parcel_lookup` cache row), Spec 34 (test tiers).

## Known Failure Modes

- **`address_status='CURRENT'`-only filter** — matches 0 production rows (data is `'None'`/NULL). Guard: the §3 filter is normative; the `.infra` source-shape test pins it.
- **Typeahead on `address_full`** — no index; 525K-row seq-scan. Guard: normalized-column prefix match only.
- **Whole-payload strict Zod** — one drifted secondary JSONB blanks the PRIMARY tier. Guard: §2.4 tier-stratified safeParse (tested).
- **Third normalizer copy** — a new TS port would silently diverge from the JOIN keys. Guard: reuse `@/lib/parcels/address` + the parity test.
