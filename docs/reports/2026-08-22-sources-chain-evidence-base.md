# Sources Chain — Evidence Base for Spec 120

**Companion to:** `docs/reports/2026-08-21-draft-spec-step-runner-and-validator.md`
**Purpose:** the grounded record behind every decision in that spec. Reference document — not a narrative.

**Grounding tiers.** `[READ file:line]` verified in code · `[SOURCED url]` external · `[INFER]` reasoned from cited reads · `[DESIGN]` unverified.

---

# SECTION 1 — Framing

## 1a. Objective

**Chain goal** `[READ 43_chain_sources.md §1]`: *"refresh all foundational spatial reference tables … so that downstream permit-linking, geocoding, and builder verification remain accurate."*

**Eleven Core Logic objectives** `[READ §3]`: schema validation (1) · source loads (2,4,5,6,7,14,16,18,20) · address-point bridge (8) · centroids (9) · parcel linking (10) · parcel enrichment (11,12,13) · massing linking (15) · neighbourhood + WSIB linking (17,19) · zoning/max-build/cost cascade (21,22) · run-ledger gate (8,19,22) · quality assertions (23,24,26).

**Declared inputs:** Toronto Open Data GIS · Ontario WSIB CSV (**manual annual download, no URL exists**) · Google Maps Geocoding.

**Declared edge cases:** GIS 500 → chain halts · annual boundary changes shift permits · WSIB CSV absent → SKIP PASS, *"a truncated operator-supplied CSV could still drop previously matched builders (no rollback protection)"* · `link_neighbourhoods` + `compute_centroids` **N+1 hot spots, documented not batched**.

## 1b. Outputs and consumers

Every derived column checked has a live production consumer — no orphaned output column `[READ]`.

| Output | Written by | Consumed by |
|---|---|---|
| `address_points` | 2 `:184` | 8 `:174`, 10 `:296` |
| `parcels` (spine) | 4 `:298` | 8,9,10,11,12,13,15,17,21,22,23,24 |
| `parcel_address_points` | 8 `:170` | 10 `:309`, `link-coa-to-parcels.js` |
| `parcels.centroid_lat/lng` | 9 `:103` | 10 `:415-423`, 15 `:450`, `load-massing.js`, 23 |
| `permit_parcels` | 10 `:515` | `compute-cost-estimates.js`, `migrations/125`, 26 `:229` |
| `parcels.ravine_*` | 11 `:174` | `enrich-permits.js`, `lib/max-build.js`, 23 |
| `parcels.heritage_*` | 12 `:251` | `enrich-permits.js:35,378,414,444`, 21, `parcel-lookup.ts` |
| `parcels.is_corner_lot` etc. | 13 `:254-257` | 21, `lib/max-build.js`, `lib/optimal-config.js`, `funnel.ts` |
| `building_footprints` | 14 `:271` | 15 |
| `parcel_buildings` | 15 `:145` | 21, `analysis/massing-coverage-analysis.js` |

**Audit rows** consumed by `observe-chain.js:76-77` (WARN/FAIL only; `:234` *"skip routine INFO"*). Chain verdict re-read by `check-chain-verdict.js:29-46`. **`gated_skip`** stamped `source-version.js:463`, filtered `api/quality/route.ts:65`. **`emitMeta`** rendered by `FreshnessTimeline.tsx:1006` and `FunnelPanels.tsx:265-309`.

## 1c. Cadence — a live three-way contradiction `[READ]`

| Source | Says | Status |
|---|---|---|
| `chain-sources.yml:13-14` | `cron: '0 13 * * 0'` — **WEEKLY**, uncommented/ACTIVE | authoritative |
| `chain-sources.yml:6-7` | *"`schedule:` committed COMMENTED OUT"* | **STALE** — contradicted 7 lines below |
| `115_scheduling.md` §2 row 2 | WEEKLY, ~8 AM ET Sunday | matches workflow |
| `43_chain_sources.md` §1 + §2 | *"this **quarterly** chain"* | **STALE in both places** |

**Consequences** `[INFER]`: sources refresh quarterly but the chain runs weekly → ~12 of 13 runs face unchanged upstream, so **gates are the dominant path, not an optimization**. Spec 43's `enrich_parcels --full` safety argument (*"Safe because sources runs quarterly"*) **rests on the stale cadence**.

**Envelope** `[READ]`: job `timeout-minutes: 210` `:20`; chain step `180` `:72` (*"90 killed it mid-chain"*); GitHub ceiling **360** → **150 minutes unused**. Exactly **1 of 27** declares `step_timeout_minutes` (step 25 = 15).

## 1d. Database

- **Cloud Supabase.** `SUPABASE_DATABASE_URL` `:38`, hard-fail if empty `:41-44`; CA cert mandatory `:39`, guarded `:45-48`.
- **Precedence:** `PG_HOST` wins — *"the discrete vars winning is what keeps a local chain run from silently targeting the cloud DB"* `[READ pipeline.js:35-41]`.
- **`statement_timeout` default 0 = no cap** `[READ :63-70]`; applied per physical connection because Supavisor drops startup params `:53-59`.
- **`createPool()` sets NONE of** `max`, `connectionTimeoutMillis`, `idleTimeoutMillis`, `keepAlive`, `application_name` `[READ :99-145]`. `idle_in_transaction_session_timeout` and `client_connection_check_interval` appear **nowhere in the repo**.
- **Migrations:** `parcel_address_points` 162 · centroids 016 · `permit_parcels` 012/039/054 · ravine 168 (GIST 167) · heritage 171 (170) · centreline 174 (173/175) · `idx_parcels_geom_gist` 039.

---

# SECTION 2 — Master table, all 27 steps

**Legend:** OC = `ON CONFLICT` count · IDF = `IS DISTINCT FROM` count · Del = DELETE sites · Fin = `finally` blocks · Thr = throw count · HR = hand-rolls a `pipeline_runs` row

| # | Step | File | L | Lock | OC | IDF | Del | Fin | Thr | HR | Arch |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `assert_schema` | `quality/assert-schema.js` | 572 | 102 | 0 | 0 | 0 | **0** | 8 | **⚠`:270`** | AST |
| 2 | `address_points` | `load-address-points.js` | 498 | 96 | 1 | 16 | 0 | 0 | 0 | – | ING |
| 3 | `geocode_permits` | `geocode-permits.js` | 189 | 5 | 0 | 2 | 0 | 0 | 0 | – | ENR |
| 4 | `parcels` | `load-parcels.js` | 586 | 55 | 1 | 13 | 0 | 0 | 0 | – | ING |
| 5 | `load_ravines` | `load-ravines.js` | 606 | 59 | 3 | 2 | 1 `:496` | 4 | 5 | – | ING |
| 6 | `load_heritage` | `load-heritage.js` | 809 | 61 | 3 | 9 | 0 | 4 | 5 | – | ING |
| 7 | `load_centreline` | `load-centreline.js` | 726 | 63 | **0** | **0** | 1 `:621` | 4 | 8 | – | ING |
| 8 | `link_parcel_addresses` | `link-parcel-addresses.js` | 394 | 115 | 4 | **0** | **0** | **0** | **0** | – | MAT |
| 9 | `compute_centroids` | `compute-centroids.js` | 227 | 99 | 0 | **0** | 0 | **0** | **0** | – | BKF |
| 10 | `link_parcels` | `link-parcels.js` | 687 | 90 | 1 | 4 | 2 `:552,:569` | **0** | 1 | – | LNK |
| 11 | `enrich_ravines` | `enrich-ravines.js` | 311 | 60 | 0 | 6 | 0 | 0 | 13 | – | ENR |
| 12 | `enrich_heritage` | `enrich-heritage.js` | 430 | 62 | 0 | 5 | 0 | 0 | **20** | – | ENR |
| 13 | `enrich_centreline` | `enrich-centreline.js` | 628 | 64 | 0 | 10 | 0 | 0 | 11 | – | ENR |
| 14 | `massing` | `load-massing.js` | 489 | 56 | 3 | 5 | **4** `:208,209,222,223` | 0 | 1 | – | ING |
| 15 | `link_massing` | `link-massing.js` | 741 | 91 | 1 | 5 | 2 `:249,:450` | 0 | 2 | – | LNK |
| 16 | `neighbourhoods` | `load-neighbourhoods.js` | 720 | 57 | 1 | 2 | 0 | 0 | 1 | – | ING |
| 17 | `link_neighbourhoods` | `link-neighbourhoods.js` | 376 | 92 | 0 | 1 | 0 | 0 | **0** | – | LNK |
| 18 | `load_wsib` | `load-wsib.js` | 438 | 97 | 1 | 9 | 0 | **1** | 3 | **⚠`:146`** | ING |
| 19 | `link_wsib` | `link-wsib.js` | 548 | 94 | **0** | **0** | 0 | 0 | 1 | – | MCH |
| 20 | `load_zoning` | `load-zoning.js` | 740 | 58 | 2 | 2 | 0 | 0 | 3 | – | ING |
| 21 | `enrich_parcels` | `enrich-parcels.js` | **2154** | 65 | 2 | 13 | 0 | 0 | 8 | – | ENR |
| 22 | `compute_parcel_cost_estimates` | `compute-parcel-cost-estimates.js` | 745 | 117 | 0 | 3 | 0 | 0 | 3 | – | ENR |
| 23 | `assert_global_coverage` | `quality/assert-global-coverage.js` | 1465 | 111 | 0 | 2 | 0 | 0 | 1 | – | AST |
| 24 | `assert_parcel_sanity` | `quality/assert-parcel-sanity.js` | **90** | 107 | 0 | 0 | 0 | 0 | 0 | – | AST |
| 25 | `refresh_snapshot` | `refresh-snapshot.js` | 688 | 40 | 1 | 0 | 0 | 2 | 1 | – | REC |
| 26 | `assert_data_bounds` | `quality/assert-data-bounds.js` | 1024 | 103 | 0 | 0 | 0 | **0** | 2 | **⚠`:84`** | AST |
| 27 | `assert_engine_health` | `quality/assert-engine-health.js` | 316 | 104 | 1 | 6 | 0 | **0** | 1 | **⚠`:44`** | AST |

**Totals:** 14,378 lines · step 21 alone is 15% · all 27 lock IDs unique · all 27 carry `emitSummary` + `emitMeta`.

**Four hand-roll a ledger row** (1, 18, 26, 27); only 18 has `finally`. **1, 26, 27 strand a `running` row on throw** — step 1 with 8 throws and 0 finally.

**Archetypes** `[READ]`: ING 9 (2,4,5,6,7,14,16,18,20) · MAT 1 (**8**) · LNK 3 (10,15,17) · MCH 1 (**19**) · ENR 6 (3,11,12,13,21,22) · BKF 1 (**9**) · AST 5 (1,23,24,26,27) · REC 1 (25). Step 27 is an AST+REC hybrid but gets ASSERT runtime treatment because `run-chain.js:544-550` dispatches on **name prefix** — renaming a step changes its runtime behaviour.

---

# SECTION 3 — Per-category analysis

## 3a. Thresholds, all 27 `[READ]`

| # | Step | Verdict-driving thresholds |
|---|---|---|
| 1 | `assert_schema` | 4× `== 0` → FAIL/PASS (×2 blocks) `:474-477,:495-500`; `schema_errors == 0` `:528` |
| 2 | `address_points` | `rows_read >= 500000`→WARN `:413`; `skip_rate < 5%`→**FAIL** `:418`; `records_errors == 0`→FAIL `:419` |
| 3 | `geocode_permits` | `geocode_coverage >= 95%`→**WARN only** `:142,:166` |
| 4 | `parcels` | `rows_read >= 450000`→WARN; `skip_rate < 10%`→FAIL; `errors == 0`→FAIL; `IRREGULARITY_THRESHOLD=0.95` `:99` |
| 5 | `load_ravines` | `verdictCascade` `:563`; producer drift/mass-delete env-overridable |
| 6 | `load_heritage` | `verdictCascade` `:756` |
| 7 | `load_centreline` | `verdictCascade` `:663`; `VALIDATION_CHUNK=5000` `:536` |
| 8 | `link_parcel_addresses` | `address_points_with_null_geom == 0`→WARN `:275,:280`; `final_link_count > 0`→**FAIL** `:298`; `parcels_with_no_address_pct < 50%`→WARN `:329`; `address_points_with_no_parcel_pct < 5%`→WARN `:335`; `errors == 0`→FAIL `:344` |
| 9 | `compute_centroids` | `failed_geometries == 0`→WARN `:197`; `compute_rate >= 98%`→WARN `:198` |
| 10 | `link_parcels` | **`link_rate >= 75%` — the only one** `:638`; 9 other rows INFO |
| 11 | `enrich_ravines` | `parcels_with_ravine_distance_pct`: `>=95 PASS / >=90 WARN / else FAIL` `:25,:26,:219` |
| 12 | `enrich_heritage` | `designated_count === 0`→**FAIL** `:309`; `part_iv===0 && source>0`→WARN `:311`; `no_parcel_match > 0.30 FAIL / > 0.15 WARN` `:318` |
| 13 | `enrich_centreline` | `UNLINKED_WARN_PCT=10` `:31`, `UNLINKED_FAIL_PCT=40` `:32`, `NAME_COVERAGE_WARN_PCT=90` `:33`, `INTERSECTION_NULL_WARN_PCT=50` `:34`, `ADDRESS_NULL_WARN_PCT=10` `:35`; graded `:430-434` |
| 14 | `massing` | `features_read >= 400000`→WARN; `skip_rate < 5%`→FAIL; `batch_error_rate < 1%`→FAIL; `STORY_HEIGHT_M=3.0` |
| 15 | `link_massing` | `link_rate >= 50%` `:701`; `BATCH_SIZE=500`, `GRID_SIZE=0.003`, `PARAM_FLUSH=30000`, `MERCATOR_ORIGIN=20037508.342789244` |
| 16 | `neighbourhoods` | `boundaries_loaded >= 158`→PASS/**FAIL** `:689` |
| 17 | `link_neighbourhoods` | `neighbourhoods_loaded == 158` `:343`; `link_rate >= 95%` `:346` |
| 18 | `load_wsib` | `unique_class_g >= 110000`→WARN `:376`; `skip_no_name_rate < 1%`→WARN `:381` |
| 19 | `link_wsib` | `link_rate >= 5%` `:503,:528` |
| 20 | `load_zoning` | **12 consts** `:43-58`: `ORPHAN_INFO_PCT=0.5`, `ORPHAN_WARN_PCT=2.0`, `LOADED_PCT_PASS=95`, `LOADED_PCT_WARN=90`, `AGE_INFO_DAYS=450`, `AGE_FAIL_DAYS=730`, `FORCE_RELOAD_STALE_DAYS=730`, `NULL_COUNT_WARN_OVER_PCT=10`, `WITH_EXCEPTIONS_WARN_BELOW_PCT=50`, `DURATION_WARN_FACTOR=2`, `MAX_REDIRECTS=5`, `HTTP_TIMEOUT_MS=30000` |
| 21 | `enrich_parcels` | `DEFER_THRESHOLD_ROWS_DEFAULT=50000` `:61`; `zonePct >=95/>=90/else FAIL` `:1877`; ambiguity `>5%`→WARN; ghost `==0`→WARN; `opt_config_engine_errors ==0`→FAIL `:1998`; `optAorWithoutMaxGfa ==0`→**FAIL** `:2011`; comps consts `:1059-1069` |
| 22 | `compute_parcel_cost` | `engine_errors == 0`→**FAIL** `:429`; rates future=FAIL/stale=WARN `:449`; index WARN `:459`; unmapped `==0`→WARN `:474`; `PARCEL_UPDATE_COL_COUNT=17` |
| 23 | `assert_global_coverage` | parameterized floors `:117,:130,:145`; `adminDrift>0`→FAIL `:1339`; `dupeGroups>0`→FAIL `:1345` |
| 24 | `assert_parcel_sanity` | delegates to harness; `verdictCascade :59` |
| 25 | `refresh_snapshot` | **none** — all rows INFO |
| 26 | `assert_data_bounds` | **45 sites** incl. `orphaned_permit_parcels==0`→**FAIL** `:229`, `duplicate_pk_groups==0`→FAIL `:230`, `null_app_num==0`→FAIL `:315` |
| 27 | `assert_engine_health` | `DEAD_TUPLE_RATIO=0.10`, `SEQ_SCAN_RATIO=0.80`, `SEQ_SCAN_MIN_ROWS=10000`, **`PING_PONG_RATIO=10`** `:32` (*"spec says >2x but operational"*) |

**Step 13's block claims deliberateness, verbatim** `[READ]`:
- `:30` `// Thresholds (future-tunable via logic_variables; hardcoded per the enrich-ravines precedent).`
- `:38` `// p90 12.9 m, 97.1% within 20 m. Hardcoded — change here to tune (NOT via logic_variables).`
- `:47` `// Hardcoded/dev-tuned (enrich-ravines precedent). Tune here.`

Spatial consts: `CENTRELINE_PROXIMITY_M=20` `:39`, `CENTRELINE_ABUT_M=13` `:48`, `THROUGH_OPPOSITE_TOL_DEG=45` `:49`. **A 9th constant hides outside the block** — `cos(radians(15))` inline `:181`.

## 3b. Externalization, all 27 `[READ]`

**12 of 27 call `loadMarketplaceConfigs`; 15 externalize nothing.**

| Step | Key | ENV |
|---|---|---|
| 5 | `'source-ravines'` `:272` | `RAVINE_ACCEPT_FEATURE_COUNT_DRIFT`, `RAVINE_ACCEPT_MASS_DELETE` |
| 6 | `'source-heritage'` `:667` | `HERITAGE_ACCEPT_*` ×2 |
| 7 | `'source-centreline'` `:402` | `CENTRELINE_ACCEPT_FEATURE_COUNT_DRIFT`, `CENTRELINE_LOCAL_ZIP` |
| 8 | none | `LINK_PARCEL_ADDRESSES_FORCE_FULL` |
| 10 | `'link-parcels'` `:127` | `PIPELINE_CHAIN` |
| 12 | `'enrich-heritage'` `:362` | `ENRICH_HERITAGE_FORCE_FULL` |
| 15 | `'link-massing'` `:167` | `LINK_MASSING_FORCE_FULL` |
| 19 | `'link-wsib'` `:114` | `PIPELINE_CHAIN` |
| 21 | `'enrich_parcels'` `:1670` | `ENRICH_PARCELS_FORCE_FULL` |
| 22 | `'compute-parcel-cost-estimates'` `:528` | – |
| 23 | `'assert-global-coverage'` `:83` | `PIPELINE_CHAIN` |
| 25 | `'refresh-snapshot'` `:191` | `PIPELINE_CHAIN` |
| 26 | `'assert-data-bounds'` `:63` | `PIPELINE_CHAIN` |

**Steps 1,2,3,4,9,11,13,14,16,17,18,20,24,27 externalize nothing.**

**Step 12 is a tier-0 threshold in tier-2 clothing** `[READ]`: `heritageUnlinkedPointWarnPct`/`FailPct`/`heritageAddressLevenshteinThreshold` are Zod-declared `:42-48` and read via `loadMarketplaceConfigs` — but **`heritage` has zero hits in `seeds/logic_variables.json`**, so `.default(0.15)`/`.default(0.30)`/`.default(2)` always win. Contrast step 10, whose vars **do** have seed rows with min/max `logic_variables.json:639-650`.

**`logic_variables.json`'s `min`/`max` are documentation, not validation** `[READ]`: 400 records, all `type:"number"`; `apply-logic-variables.js:29-36` inserts only key/value/description; the **only** consumer is `generate-logic-vars-docs.mjs:195`, which renders them into a markdown table. Every actual enforcement is a hand-written per-script Zod schema.

**`docs/specs/_contracts.json` is read by none of the 27** `[READ, full-string scan]`.

## 3c. Verdict axes — the §19.0e census, verified `[READ]`

| # | Step | Reachable | Truncating line |
|---|---|---|---|
| 1 | `assert_schema` | **PASS/FAIL — no WARN ×3** | `verdict: permitHasFails ? 'FAIL' : 'PASS'` `:483,:506,:534` |
| 2 | `address_points` | ✓ 3-way `:443` | |
| 3 | `geocode_permits` | **PASS/WARN — no FAIL** | `verdict: geocodeCoverage < 95 ? 'WARN' : 'PASS'` `:166` |
| 4 | `parcels` | ✓ `:445` | |
| 5–7 | loaders | ✓ `verdictCascade` `:563,:756,:663` | |
| 8 | `link_parcel_addresses` | ✓ both paths `:365-367` | |
| 9 | `compute_centroids` | **no FAIL + hardcoded** | `verdict: 'PASS'` `:78`; `hasWarns ? 'WARN' : 'PASS'` `:214` — **parallel boolean** `:200` |
| 10 | `link_parcels` | **hardcoded + dead FAIL arm** | `verdict: 'PASS'` `:188`; cascade `:665` but no row emits FAIL |
| 11 | `enrich_ravines` | ✓ both paths `:240` | |
| 12 | `enrich_heritage` | ✓ both paths `:339` | |
| 13 | `enrich_centreline` | **`full`=✓; `skip`+`incremental`=PASS only** | `verdict: 'PASS'` `:463` |
| 14 | `massing` | ✓ `:475` | |
| 15 | `link_massing` | delegated `:729` | |
| 16 | `neighbourhoods` | **PASS/FAIL — no WARN** | `verdict: hasFails ? 'FAIL' : 'PASS'` `:707` |
| 17 | `link_neighbourhoods` | **hardcoded on skip** | `verdict: 'PASS'` `:112` |
| 18 | `load_wsib` | **hardcoded + no FAIL** | `:111`, `:400` |
| 19 | `link_wsib` | **hardcoded + no FAIL** | `:200`, `:528` |
| 20 | `load_zoning` | ✓ ×2 `:618,:690` | |
| 21 | `enrich_parcels` | ✓ ×2 `:1789,:2050` | |
| 22 | `compute_parcel_cost` | delegated `:667` | |
| 23 | `assert_global_coverage` | computed `:1423` | |
| 24 | `assert_parcel_sanity` | ✓ `:59` | |
| 25 | `refresh_snapshot` | **PASS only** | `verdict: 'PASS'` `:651` |
| 26 | `assert_data_bounds` | ✓ ×4 `:254,:407,:617,:835` | |
| 27 | `assert_engine_health` | **no WARN ×2; no FAIL ×1** | `:219,:252,:282` |

**Hardcoded `verdict: 'PASS'` = 7** (9,10,13,17,18,19,25) — matches the parent doc's count exactly. **Truncated cascades = 11** (1×3, 3, 9, 16, 18, 19, 27×3) — parent said 8; my census is higher. **Steps affected = 12 of 27** — matches.

**`PIPELINE_CHAIN`** read by 11 of 27. Only step 10 branches phase two different ways: `:186` `6 : 9` vs `:660` `6 : 7`.

## 3d. Gates, all 27 `[READ]`

| # | Step | Mechanism (§16.2 ID) | Shipped? | Code |
|---|---|---|---|---|
| 5,6,7,20 | loaders | **1** two-tier (metadata→hash) | main | `:168/:192/:251/:332` |
| 8 | `link_parcel_addresses` | **4** run-ledger | **BRANCH** | `:91-95`, skip `:96-119` |
| 9 | `compute_centroids` | **7** ad-hoc + hardcoded PASS | main | `:70`, `:78` |
| 10 | `link_parcels` | **7**; row watermark only | main | `:179`,`:188`; `:159-160` |
| 11 | `enrich_ravines` | **2 — origin of #418** | **main** | `:95-102`, `:274-278`, scope `:155` |
| 12 | `enrich_heritage` | **2** ported | **BRANCH** | `:141-149`, `:388-393` |
| 13 | `enrich_centreline` | **2** bespoke 3-mode | main | `:289`,`:305`,`:420-424` |
| 15 | `link_massing` | **3** veto | main | `:178`, `LINK_MASSING_CODE_VERSION :50` |
| 17 | `link_neighbourhoods` | **7** + hardcoded PASS | main | `:112` |
| 19 | `link_wsib` | **4** + bespoke 2nd signal | **BRANCH** | `:140`,`:160` |
| 21 | `enrich_parcels` | **8** scope-defer | main | `:61`,`:1770`,`:1789` |
| 22 | `compute_parcel_cost` | **4** + ISO key diff | **BRANCH** | `:588`,`:610` |
| all | | **6** lock self-skip | main | `pipeline.js:936-941` |
| all | | **5** orchestrator | main | `run-chain.js:499-509`; **`sources` has no chain gate** |

**Eight mechanisms, not seven.** Step 21's scope-defer is a pre-transaction gate with its own terminal status allowlisted green by `check-chain-verdict.js:36-40`. §4.3.2 said four, §16.2 raised it to seven, and it is *still* short — third consecutive undercount.

**Escape hatches: 5 of 27** (8ᴮ, 12ᴮ, 15, 21, 22ᴮ). **Steps 11 and 13 — the two enricher gates on main — have none.** All 4 gated INGESTORs lack one.

**Two documented gate traps:**
- **Wedge-open** `[READ enrich-heritage.js:128-140]`: a naive probe port would count 16 live-measured invalid-geom parcels as permanently stale, so `staleCount` could never reach 0 and *"this skip branch would be dead code behind a green suite (every hand-built fixture happens to use valid geometry)."*
- **String surgery** `[READ enrich-centreline.js:277-283]`: `BUILD_TEMP_SQL_SCOPED` is built by `.replace()` matching a comment-bearing literal **including interior whitespace**. Editing spacing makes it a no-op and the "scoped" path runs **unscoped**.

## 3e. Contracts, all 27 `[READ]`

| Step | Producer contract | Health propagation (C2) |
|---|---|---|
| 5 | own prior `:290` | emits `drift_check_passed`, `mass_delete_check_passed`, `delete_skipped_empty_guard`, `invalid_geometry_skipped` |
| 6 | own prior `:685` | per-dataset `feature_count`, `drift_check_passed` |
| 7 | own prior `:417` | `features_inserted` |
| 11 | `records_meta.ravine_load` `:32-37` | **4 checks** `:47`, `:50`×2, `:58` |
| 12 | `heritage_load`, 2 sub-blocks `:64-72` | `feature_count>0` `:74-79`, `drift_check_passed` `:81` |
| 13 | `centreline_load` `:319-326` | `features_inserted>0` `:330` |
| 15 | count + `LINK_MASSING_CODE_VERSION` | **code+data signal — the only G3 ✓** |
| 19,22 | ledger + bespoke 2nd signal | `:78`,`:97`; `:94-98` |
| 20 | own prior `:582` | per-layer |
| 8,9,10,1,3,14,16,17,18,23,24,25,26,27 | **none** | none |

**Correction to §17's C2 claim:** *"`enrich-ravines.js:50-51` is the only instance in 18 eligible steps"* — **undercount. 4 instances** (11, 12, 13, 15).

**Precondition ordering diverges:** 12 `:381` hoists `assertPreconditions` to **both** paths, stating the skip path previously left PostGIS/GIST/SRID unvalidated — *"a dropped extension or index would be silently masked behind a green SKIP."* 11 `:283` still calls it **only inside the transaction**. Never back-ported to the convergence standard.

## 3f. Update classes — thirteen `[READ]`

| Class | Steps | Pattern |
|---|---|---|
| A. Guarded upsert | 2,4,6,14,16,18,20 | `ON CONFLICT … WHERE IS DISTINCT FROM` |
| B. Upsert + scoped departure delete | 5 | `:479` + `DELETE … <> ALL($1)` `:496` |
| C. Staging full-replace | 7 | temp `:618` → `DELETE :621` → `INSERT…SELECT :623` |
| D. Insert-only, no retraction | 8 | `ON CONFLICT DO NOTHING :176` — **W3 breach** |
| E. Write-once backfill | 9 | `UPDATE … WHERE centroid_lat IS NULL :105` |
| F. Link + full retraction | 10,15 | upsert + DELETE stale + DELETE zero-match |
| G. Set-based, scope inside | **11** | one UPDATE, 3-disjunct guard, **scope predicate `:155`** |
| H. Set-based, no scope | 12 | 4-disjunct guard, **no scope predicate `:206`** |
| I. Temp-materialize | 13 | TEMP `:66` → UPDATE, 5-disjunct guard |
| J. Multi-pass + defer | 21 | 5 passes, `--full` pinned, defer at 50000 |
| K. Derived recompute | 3,17,19,22 | bulk UPDATE (3 has **two**: `:18-21` *"comment 'Single UPDATE is inherently atomic' was wrong — there are two"*) |
| L. Verdict-only | 1,23,24,26 | `pipeline_runs` only |
| M. Snapshot append | 25,27 | INSERT into snapshot tables |

## 3g. Partial-fill exposure `[READ]`

**ATOMIC 8 · BATCHED 13 · STAGED 1 · NONE 4 · MIXED 1.**

**Exactly one step has a real recovery ledger** — `enrich_parcels_pass3_scope` (mig 240): `(run_id, parcel_id, consumed_at, created_at)`, PK `(run_id, parcel_id)`, partial index on unconsumed, **LOGGED deliberately** (*"an UNLOGGED table is truncated on crash recovery, destroying the exact evidence it exists for"*), written inside the enrich transaction, and `consumePendingScope()` recovers **any prior run's** unconsumed rows.

**For the other twelve batched steps, nothing in the database can answer "is this table half-loaded?"**

**Two are worse than silent:** `load-address-points.js:372-378` and `load-parcels.js:548-553` **swallow flush failures** — `catch → log → errors++ → batch=[] → continue`. Silent partial fill with no crash, and the comment concedes *"if a batch flush fails, lost rows inflate this count slightly."*

**Largest exposure:** `link_massing` (deletes every link for geo-bearing parcels in one txn, then rebuilds across ~870 batches) · `massing` (`:208-223` two destructive DELETEs **outside any transaction**, VACUUM between) · `address_points` (~525K, 525 commits) · `parcels` (~486K, 486 commits, table 5,806 MB).

**`link-parcel-addresses.js`'s resumability claim is FALSE** — `lastParcelId` is a local initialized to `-1` `:148`, never persisted. It is *idempotent*, not resumable.

## 3h. Data reliability per step `[INFER, grounded]`

| Trust | Steps | Why |
|---|---|---|
| **HIGH** | 2, 4, 11, 12, 20, 23, 24 | `RETURNING` counters, 3-way verdict, safe ledger |
| **MED-HIGH** | 5, 6, 15 | estimates not `RETURNING`, otherwise clean |
| **MED** | 3, 7, 8, 14, 16, 22, 26 | one axis missing or a W2/W3 breach |
| **MED-LOW** | 10, 17, 18 | hardcoded skip verdicts |
| **LOW** | 1, 9, 13, 19, 21, 25, 27 | strand risk, truncated verdicts, or counter dishonesty |

**The compounding finding:** step 21 has **LOW** counter honesty (4 of 5 passes uncounted per Spec 119) **and is the upstream of step 22's counter-based gate.** §4.5 records this *"already caused a wrong skip."*

---

# SECTION 4 — Fence compliance

## 4a. Chain-wide verdict `[READ]`

| Fence | State |
|---|---|
| **E1** xact-lock + unique ID | **✓ 27/27 — the chain's ONE closed fence.** `pipeline.js:924` uses `pg_try_advisory_xact_lock`; `:911-918` *"zombie locks cannot form"* |
| **E2** finalize in `finally` | **✗ 3 breached** (1, 26, 27); 18 fixed |
| **E3** pool via factory | **✓ 27/27** — `createPool() :99`; both `new Pool(` sites inside it |
| **E4** escape hatch | **✗ 5 of 11 gated**; 11 and 13 (on main) lack one; all 4 gated ING lack one |
| **G1** unknown ⇒ RUN | ✓ `source-version.js:221-228,:364-365` |
| **G2** non-completed ⇒ RUN | **✗ defeated by the §16.3 hole** for 8, 19, 22 |
| **G3** CODE signal | **✗ 1 of 11** — only 15 |
| **G4** skip verdict row-derived | **✗ 5 breached** (9,10,13,17,18/19) |
| **G5** skip emits COMPLETED | ✓ everywhere gated |
| **G6** scope covers upstream reads | **✗ 8 breached** (3,8,9,10,12,17,19,21) |
| **G7** invalidate at every write | **✓★ 3 of 4 fields** (`load-parcels.js:353-361`); **✗ the centroid** |
| **W1** IDF type-matched | **✗ 2 structural** (7, 19) |
| **W2** destructive in one txn | **✗ 1** (14 `:208-223`) |
| **W3** retraction | **✗ 5** (8, 17, 19, 6, 16) |
| **W4** empty-source, dual-mode | **✓★ 11 and 12**; **✗ 18** |
| **W5/W6** mass-delete / drift census | ✓ 3 of 9 ING (5, 6, 20) |
| **C1** producer SPEC_VERSION | **✗ 6 of 27** |
| **C2** producer health | **✗ but §17 undercounts — 4 instances, not 1** |
| **C3** upstream set generated | **✗ 3 of 3 hand-written** |
| **O1** cascade, 3 axes | **✗ 12 of 27**; `verdictCascade` **absent from `pipeline.js module.exports`** |
| **O2** counters | **✗ 4+** (21, 5/6/7) |
| **O4** duration tripwire | **✗ 26 of 27** |
| **O6** `current_database()` | **✗ 27/27** — `rg -c` returns 0 |

## 4b. Two corrections to §17

1. **E1 should be marked CLOSED** — the only fence that can be. `pipeline.js:911-918` documents transaction-scoped locking: *"When the transaction ends — via COMMIT, ROLLBACK, or backend connection close (including SIGKILL) — PostgreSQL automatically releases the lock… zombie locks cannot form."* The `2dcc120a` failure mode is structurally impossible, not merely fixed.
2. **C2 undercounts by 4×** — 12`:81`, 13`:330`, 15 (a code version) also propagate.

## 4c. Why E1 is closed and O6 is not

Both are single-line fixes. **E1 lives in shared infrastructure every step calls; O6 does not.** Every fence that moved into the SDK is closed; every fence left in the scripts is breached. That is the entire argument for the runner, and E1 is the proof it works.

---

# SECTION 5 — Current state

## 5a. Issues, ranked

1. **`compute_centroids` has no invalidation and no gate.** `rg -n "centroid" scripts/load-parcels.js` = **zero matches**, while `:353-361` NULLs three sibling stamps. A moved parcel keeps a stale centroid used as a join key by 10 `:415-423` and 15 `:450`.
2. **Verdict truncation in 12 of 27.**
3. **Three steps strand a `running` row** (1, 26, 27).
4. **13's `incremental` mode cannot emit WARN/FAIL** `:463` while writing and re-stamping the authoritative version `:468`.
5. **12 has no scope predicate** `:206`.
6. **11's skip path skips its own preconditions** `:283`.
7. **8 never retracts.**
8. **14 deletes outside a transaction** `:208-223`.
9. **Zero escape hatches on 11, 13, and all gated INGESTORs.**
10. **21's `--full` pinned, ungated, 4-of-5 passes uncounted, gating 22.**
11. **Cadence contradiction** (§1c).
12. **12's thresholds present as externalized, have no seed rows.**
13. **27`:32` overrides its spec threshold in a comment.**
14. **Two undeclared telemetry writes** — 14→`parcel_buildings`, 21→`enrich_parcels_pass3_scope`.
15. **Only 1 of 27 has `step_timeout_minutes`.**
16. **Both chain budget env vars are inert for `sources`** — set in `chain-coa-permits.yml`, absent from `chain-sources.yml`. The 80% tripwire has never fired.

## 5b. Cloud failure history `[READ §10]`

| Date | Status | Min | Cause |
|---|---|---|---|
| 2026-08-07 | completed_with_warnings | 135.3 | many steps skipped, **null `skip_reason`** |
| 2026-08-03 | **failed** | 2535.4 | *"hit the **180-min step timeout**"* |
| 2026-08-03 | **failed** | 143.8 | *"Stopped at step: **massing**"* |
| 2026-08-02 | **failed** | 0.2 | *"Stopped at step: **address_points**"* |
| 2026-07-08 | completed_with_warnings | 147.0 | — |
| 2026-07-07 | completed_with_warnings | **181.9** | 1.9 min inside the ceiling |
| 2026-07-07 | **failed** | 101.5 | *"Orchestrator process killed at step 13/27"* |
| 2026-06-28/25/10 | completed_with_warnings | 105.8/105.4/97.4 | — |
| 2026-06-10 | **failed** | 118.3 | *"Stopped at step: **massing**"* |
| 2026-06-10 | **failed** | **56220.1** | *"interrupted: stale run auto-cleaned"* — **39-day strand** |

**Every failure is envelope, not data.** `chain-sources` is `disabled_manually`; last completed run 2026-08-07.

**A rebuild would make it worse:** all eight gate mechanisms fail-safe to RUN on an empty database `[READ source-version.js:364,:164,:181; enrich-centreline.js:421; countStale; massing-full-gate; enrich_parcels --full pinned]`. **Cold start is the chain's most expensive path**, so a from-scratch rebuild guarantees a 180-minute timeout on its first run.

**Irreplaceable data:** `permits` history (the daily feed shows current state only; disappearance is knowable only by having observed it — `link-parcels.js:147-152`) · `inspections` (scraped) · `coa` · `wsib_registry` (manual annual CSV, no URL). Everything else re-derives — **the chain IS the rebuild mechanism**.

## 5c. Incident history per step `[READ review_followups.md]`

| # | Step | Outcome |
|---|---|---|
| **#418** | 11 | ~77 min enriching **0** rows → two-layer skip → **77 min → 1.9 s** `:2485` |
| **#424** | 12 | `ST_DWithin(50m)` over-matched **4×** (6,217 vs 1,549) → containment; 17 s `:2474` |
| **#431 WF2** | 13 | `ST_Intersects` matched **0.05%** → `ST_DWithin(20m)`; **471,869 enriched (97%)** `:2481` |
| **#431 WF3** | 13 | abut-both 13 m: corner 24%→**14.8%**, through 16.7%→**11.3%** |
| **#431-FU** | 13 | laneway exclusion: through→**0.98%**, corner→**11.2%** `:2482` |
| **#409** | 11 | spec froze `source-ravines`; `run-chain.js:522` records `sources:load_ravines` `:2460` |
| **#419/#423** | 6,12 | lock/slug/version; *"recorded so a future reader doesn't re-litigate"* `:2477` |
| **#429/#430** | 7,13 | lock 63/64 vs stale 65/66; `'1.1'` vs `'1.0'` `:2479-2480` |
| **#430 fence** | 13 | **CLOSED, verified** — `load-parcels.js:359-361` |
| **#431-FU3** | 13 | **OPEN** — frontage P3 reads unfiltered `parcel_segments` `:225` |
| **WF3-S2** | 3 | *"'Single UPDATE is inherently atomic' was wrong — there are two"* |
| **hotfix #2** | 10 | `ADDRESS_STATUS` literally `'None'` for 525,346/525,346 |
| **rf:2334** | 2 | hand-built `$i+1`/`$i+2` placeholders → PG type unification failure → **every batch failed silently, 525K rows NULL, verdict PASS** |
| **P11-1/P11-2** | 13, 15 | unchanged paths **11.2 s** vs 87.1 min; **8.5 s vs 21.9 min** |

## 5d. Recurring defect classes `[READ, 2,917-line mining]`

| Class | Occurrences | Runner absorbs via |
|---|---|---|
| Pipeline-name drift (#409 trap) | **8**, 3 wasted reviewer cycles | producer-read resolution by identity |
| Lock ID ≠ spec number | **≥12 entries, 29 mentions** — *"highest re-litigation-per-line item"* | generated lock registry |
| Parallel-boolean verdict | 8 followups, **6 scripts still live** | row-derived cascade |
| Counter scoping | **≥13** | `RETURNING` scoped by `writes.key` |
| Incomplete IDF guard | **≥9** (one would have NULL-overwritten a 427K column every quarterly reload) | generated guard |
| Incremental scope blindness | **≥11** | `pending` + producer-newer tripwire |
| Threshold provenance / standing red | **≥10** | `limit` + `accept_until` |
| Zero-work runs emitting PASS | **≥8** — *"most live production damage in the file"* | `expect_nonempty` + did-work precondition |
| Hand-built SQL param templates | 5, one **525K-row outage** | generated upsert |
| `.passthrough()` config | **14 mentions** | `.strict()` + `??` |
| Audit-row omissions | **≥10** | checks co-located with the write |
| Stranded `running` rows | 4 entries, **19 measured occurrences**, one **39-day** | ledger in `finally` |

**Re-litigation:** ~30 entries exist solely to stop re-argument. `why` eliminates ~18 (the deviation class); it cannot fix the ~12 false-premise cases where a reviewer misreads live code. Measured CLI false-positive rate: **~40%** for both Gemini and DeepSeek on spec-sync work `[READ rf:801-826]`.

## 5e. Lessons

**Why corrections recur** `[INFER]`: this session produced ~20 corrections. Every one traces to (a) a **name** trusted instead of the code, (b) a **document** trusted instead of the artifact, or (c) a **count** trusted instead of a re-derivation. All three are one failure: *a claim inherited without re-executing it.*

From `tasks/lessons.md`:
1. `:29` — *"encode X as a predicate."* `compute-centroids.js:105` is safe only while geometry never changes; nothing enforces that.
2. `:30` — *"a guard on one pass is a latent bug on the other."* 12`:381` hoists preconditions; 11`:283` does not.
3. `:31` — *"a gate-on-X pass never revisits a row that loses X."* Step 9 is the purest case.
4. `:103` — *"bound every contributing term."* The 602 ravine slivers came through 11's output.
5. `:104` — pre-pin the expected number. Every #418/#424/#431 resolution quotes a before/after pair.
6. **L-2** — two local databases; O6 is the one-line fix, unimplemented 27/27.
7. **L-4** — inherited facts carry no grounding. ~20 more instances this session.

New:
8. **A threshold's home is where its value comes from, not where it's declared.** Grep the seed, not the schema.
9. **A justification can outlive the thing it justifies.** 10`:625-627` preserves a metric name for an `observe-chain` baseline that indexes on duration and drops INFO rows.
10. **A gate's probe and its work query must share one predicate**, or the skip branch is dead code behind a green suite (12`:128-140`).
11. **A hardcoded PASS on a path that WRITES is worse than no gate** — it re-stamps the authoritative version while unable to report failure (13`:463`+`:468`).
12. **The step with the worst counter honesty must never be the upstream of a counter-based gate** (21→22).
13. **Declared telemetry must include every table deleted from**, not only inserted into (14).
14. **Two steps citing the wrong chain spec is a governance signal** — nothing checks `SPEC LINK` against the manifest.
15. **A capability built but never connected is the dominant pattern here** — ⚠️ **RE-EXECUTED 2026-08-22; four of five figures were wrong. Corrected:** **`scripts/validation/run-step.mjs:279-301`** holds the stubs (~~`step-config.json`~~ *declares* all 12 in `tripwire_profiles`; the **runner delivers 3** — T2, T4–T11 are hardcoded `N/A-MANUAL`) · `logic_variables.json` = **400 entries carrying 798 bounds** (~~"400 unenforced bounds"~~); ⚠️ **112 files read the VALUES, ZERO read the bounds** (~~"consumed only by the docs generator"~~ — false) · `classifyError` 6 categories, **exactly one production call site** (`scripts/lib/pipeline.js:190`, setting a *persisted field*, not ~~a log line~~) · `supports_full`/`supports_dry_run` = **134 declarations** (~~67~~), **zero consumers confirmed** (2 refs: one comment, one test fixture) · `records_meta.skipped` = **23 producers, zero consumers**; `run-chain.js` reads `.deferred` but never `.skipped`, then writes literal `'completed'` at **`:721`**.

---

# SECTION 6 — Research findings

## 6a. Industry (declarative frameworks) `[SOURCED]`

**Seven corrections to the first design:**
1. `stale_when` as a boolean is wrong — **SQLMesh's interval ledger** is the only design where skip/incremental/full genuinely fall out of one mechanism. dbt's `max(updated_at)`-on-target is its documented footgun (late arrivals silently skipped, lookback-window guessing, mandatory periodic full refresh).
2. **Code-version staleness must be automatic** — SQLMesh fingerprints every model; without it a step whose logic you just fixed skips because the data is unchanged.
3. **`reads` should be derived, not declared** — the classic decay surface. Airflow's hand-declared `inlets`/`outlets` is the counter-example.
4. `requires` collapses into the check engine.
5. `compute` is the file, not a config key.
6. **Three actions + severity ⊥ blocking** — DLT's `expect` / `expect_or_drop` (count logged) / `expect_or_fail`; Dagster keeps severity and blocking orthogonal.
7. **Checks belong pre-publish** — SQLMesh blocks promotion; dbt's after-the-fact placement is its most-criticised property. Industry name: **Write-Audit-Publish** (Netflix).

**Anti-decay, sourced:** codify conventions as CI tests (`dbt_project_evaluator` converts the DAG to a queryable table) · **ration `fail` severity** (one team went 200+ ignored alerts/day → 15 actioned) · auto-derive defaults (100+ hours of manual test authoring for 100 tables) · escape hatches get abused (Jenkins' `script` step).

**Procedural units:** dbt Python models lose contracts, ephemeral, cross-model imports — a bifurcated framework. **SQLMesh's rule transfers:** *"the schema of the output DataFrame is a required argument"* — declare what the framework can't infer, keep the envelope identical. And: **run checks against the landed table, never the compute's internals** — that's how one vocabulary spans SQL and non-SQL.

## 6b. Postgres mechanics `[SOURCED]`

**WAP:** in-transaction validate-then-rollback, not staging swap. Swapping creates a new OID → every inbound FK dropped/recreated (full scan of the *referencing* table) + every GiST rebuilt. **Bloat is a wash** — an UPDATE writes a new row version regardless. The real cost is the **xmin horizon**: VACUUM can't clean database-wide while the transaction is open.

**Three implementation bugs:** validation must run on the same `PoolClient` (`pool.query()` sees pre-update state — **every check passes, silently**) · audit rows vanish with the rollback · deferred FK triggers fire at COMMIT (moot here — **zero deferrable constraints** `[READ]`).

**Table attribution:** `pg_stat_xact_user_tables` deltas, ~30 lines, **strictly more truthful than SQL parsing** because it sees through views, functions and triggers. **No observability library will give table names** — OTel semconv says the collection name *"SHOULD NOT be extracted from `db.query.text`"* for multi-collection systems.

**Interval ledger:** half-open `[start, end)`; **only completed intervals are rows, no `running` row** — a crash leaves no row, automatically correct. Maps to your `1ffa7478` orphan-row wedge. Inserted in the same transaction as the data write ⇒ exactly-once. Backfill = DELETE the rows.

## 6c. Operational failure modes `[SOURCED]`

**G1 heartbeat + reaper** — `finally` never runs on SIGKILL; GitHub sends SIGINT→7.5 s→SIGTERM→2.5 s→kill-tree, **children unsignalled**. Prefect distinguishes `CRASHED` from `FAILED`; Airflow uses a zombie sweep.
**G2 checkpointing** — Airbyte targets ≤30 min replay. **The Meltano trap:** a checkpoint is valid only if work order guarantees monotonic completeness.
**G3 publish barrier** — mature systems *"engineer 'mid-load' out of existence rather than name it."*
**G4 forensics** — `step_error` with `class`, `work_unit`, `pg_sqlstate`, stack.
**G5 budget manager** — global deadline propagated → checkpoint-and-stop.
**G6 quarantine** — Kimball's Subsystem 5 (Error Event Schema), 1998.
**G7 adaptive circuit breaker** — Z-score vs history, not static floors.
**G8 fencing token** — Kleppmann; `run_id` as the monotonic token.
**G9 schema drift** — Airbyte: non-breaking propagates, **breaking pauses**.
**G11 plan mode** — dbt `--empty`; answers *"why did step 14 skip?"* without a 90-minute run.

**The single highest-leverage idea:** make **step 0 of every run "reconcile the previous run."** Your runner is the orchestrator running inside the thing that dies; there is no external supervisor. That replaces a supervisor tier.

## 6d. Build vs adopt `[SOURCED]`

**Verdict: BUILD** — on a narrower premise than the first pass claimed.

**Correction (discovery sweep, 2026-08-22):** the first pass concluded *"no Node-native declarative framework targeting plain PostgreSQL exists."* **That is false as worded.** [SQLAnvil](https://github.com/SQLAnvil/sqlanvil) — Apache-2.0 TypeScript fork of Dataform OSS, retargeted at Postgres/Supabase, CLI with no daemon, SQLX + `ref()` + incremental tables + assertions, `@sqlanvil/core` v1.31.0 published 2026-08-20. The first pass rejected Dataform correctly (BigQuery-only) and **missed the downstream fork**.

**It still doesn't fit, for two reasons:** non-SQL work runs as **Python script actions** (*"file-staging and glue scripts"*, **no warehouse credentials injected**) — the exact foreign shell-out we're eliminating, and our procedural steps couldn't reach the DB through it; and it is **1 star, single maintainer, weeks old**.

**The ecosystem baseline is the stronger evidence:** GitHub search for `"data pipeline" language:TypeScript stars:>200 pushed:>2025-08-01` returns **exactly one repo** (Jitsu, event ingestion). The `elt` topic's top 20 is entirely Python/Go/Rust/Java. **Jayvee** (177★) — closed block vocabulary, *no roadmap plans for arbitrary custom code*. **MooseStack** — TS-native and declarative but ClickHouse-targeted, daemon-requiring, **explicitly EOL**.

The rest bifurcates — **job queues** (pg-boss, Graphile Worker, BullMQ) wrong shape; **durable-execution engines** (DBOS, Restate, Hatchet, Inngest, Trigger.dev, Windmill) right substrate, no staleness/incremental/validation semantics.

**Residual gap:** both sweeps hit an exhausted WebSearch budget and reached the ecosystem via GitHub/npm/HN APIs. **Reddit `r/dataengineering` was unreachable (403/CAPTCHA)** — one human-run *"dbt but for TypeScript?"* search closes it.

**Scorecard shape is the argument:** Dataform is the only row passing "batch-shaped"; DBOS is the only row passing "no daemon" + "partial adoption". **No row passes both.**

**DBOS Transact** is the one near-hit — a true library (*"no separate orchestration server and no infrastructure required besides Postgres"*), `DBOS.launch()`/`shutdown()` in your entrypoint, ten documented **directly queryable** tables, and *"recovery happens automatically at startup when DBOS scans for incomplete workflows"* — which is our Step 0. **Largest risk:** *"any PENDING workflow counts toward the limit, including workflows from previous application versions"* — hostile to a 64-step codebase redeploying weekly. **Resolution: copy the table shapes (free); treat adoption as an optional spike.**

**pgFlow disqualified** — tasks run in Supabase Edge Functions (Deno, short-lived, memory-capped). Category error for 2 h / 486K rows, and it inverts the architecture by making `pg_cron` the scheduler.

**Caveat:** the evaluation ran with an exhausted search budget — named candidates assessed by direct docs fetch, **no open-ended discovery queries**. "Nothing else exists" is strong but not search-verified.

## 6e. Orchestration durability `[SOURCED]`

**The "18-month / thirty pipelines" claim is folklore** — no source found. *"It has the shape of orchestration-vendor marketing."*

**The documented drivers are variance between steps and expressiveness of the config — not step count.** *"64 uniform steps with one obvious shape is more maintainable than 12 bespoke ones."*

**The distilled rule:** teams regret building an orchestration *platform*; they don't regret a thin topological runner over a step registry. **Regret is proportional to how much of the framework's behaviour is configurable rather than coded.**

**#1 risk: the Configuration Complexity Clock** (Hadlow) — hardcoded → config → structured config → rules engine → custom DSL → *"a crappier language than the one we started with."* **At 13 categories we are at 2 o'clock.**

**The exit ramp is real** — Dagster `airlift`: observe → federate → migrate, task-by-task, rollback-able, history retained. Migratable requires: step = a **process** (argv/env in, exit code + JSON manifest out) · declaration is **inert data** · state in our schema with **stable step IDs never renamed** · every step re-runnable for the same partition · **OpenLineage run events emitted** (no official JS client — POST the JSON).

---

# SECTION 7 — Blast radius

## 7a. Test coverage `[READ]`

**~1,345 cases touch the 27 steps: ~560 BREAK · ~85 REPLACED · ~700 PORTABLE.**

**~250 breaks in three files:** `pipeline-advisory-lock.infra` (81+3 — all 27 in a hardcoded `LOCK_ID_REGISTRY`, three generated `it()` each, plus a **bidirectional agreement test against Spec 47 §A.5 markdown**) · `pipeline-sdk.logic` (~108 — six SDK-adoption assertions × 12 scripts, plus per-script source-string checks) · `chain.logic` (~58).

**⚠️ The blocking constraint:** `pipeline-advisory-lock.infra.test.ts:291` asserts *"registry covers every JS script in the manifest."* **The first converted step reds the suite.** No incremental path exists under the current tests.

**Load-bearing intent that must survive:** the ban on a step defining its own `verdictCascade` (`assert-parcel-sanity.infra.test.ts:37-43`, `expect(src()).not.toMatch(/function verdictCascade/)`) · the **§11 Counter Semantic Contract** (which *variable* feeds `records_total` — 6 steps) · `load-massing`'s ON CONFLICT area-column exclusion (*"worktree BUG-2 regression-lock"*) · the `tier_1_exact_address` name freeze · **the frozen `records_meta` blocks (`ravine_load` 18 fields, `heritage_load`, `centreline_load`) — runtime contracts, not docs** · `RUN_AT` captured once (midnight-cross fence) · lock-ID uniqueness across manifest ∪ one-time ∪ backfill (a live 117 collision hid until the scan widened).

## 7b. Admin consumers `[READ]`

**No TS interface for `records_meta`** — `jsonb`, typed `Record<string, unknown>` at every consumer. **New keys are additive.**

**Two caveats:** 13 top-level keys are taken (`pipeline_meta`, `telemetry`, `audit_table`, `engine_health`, `warnings`, `errors`, `checks_failed`, `checks_warned`, `step_completeness`, `step_verdicts`, `pre_flight_audit`, `budget_stopped`, `gated_skip`) · `run-chain.js:886-889` does a **shallow merge**, so a collision clobbers.

**Status vocabulary — 8 consumer sites plus an exact-set test lock:** `check-pipeline-freshness.js:87` `RAN_STATUSES` (locked by `.sort()).toEqual([...])` at `check-pipeline-freshness.logic.test.ts:62`) · `check-chain-verdict.js:91` `OK_STATUSES` · `:289-294` deferred bidirectional tripwire · `stats/route.ts:327` · `pipelines/runs/route.ts:32` · `quality/route.ts:54` · `FreshnessTimeline.tsx` if-ladders ×4 · `DataQualityDashboard.tsx:125-134`. **No DB CHECK constraint** — which is how `deferred_to_full` became a known unpatched gap at `stats/route.ts:327`.

## 7c. Migration mechanics `[READ]`

Next free: **245–248** · UP+DOWN mandatory (`validate-migration.js:220-225`) · **DOWN must contain zero executable SQL** (`:283-306`; mig 118 broke CI for 2 days) · one transaction per file unless `CONCURRENTLY` · **RLS mandatory** (84 of 87 tables; Spec 114 Class B = `ENABLE ROW LEVEL SECURITY`, zero policies) · **Rule 5 FK warning fires on all four new tables** — use mig 240's `-- FK-EXEMPT` + rationale · `TIMESTAMPTZ`, partial indexes, `COMMENT ON` expected · **LOGGED, never UNLOGGED** · cloud apply is `workflow_dispatch`-only with 10 guards incl. a `:6543` port refusal.

## 7d. `scripts/**` path coupling `[READ]`

Moving files outside `scripts/` breaks, silently: **eslint scope** (`eslint.config.mjs:96` — the `new Pool()`/`process.exit()`/`new Date()`/`parseInt()` bans) · **`generate-logic-vars-docs.mjs:167` non-recursive scan** (empties the consumer map for 6 steps) · `amnesty.json` exact-path keys · `.grandfather.txt` · ~10 runbook `node scripts/x.js` recipes · **`massing-full-gate.js:43`'s literal slug IN-list in SQL**.

## 7e. Spec rot `[INFER, grounded]`

Of ~9,000 spec lines describing the 27 steps: **~2,000–2,500 generatable** (Spec 43's 27-row table, Spec 47 §A.5 — already machine-parsed — each source spec's §9 contract, and §4 Testing Mandate which is **already generated** via `TEST_INJECT` markers) · ~1,500 behaviour that stays · **~1,200 needing deliberate re-authoring**, concentrated in Spec 47 §2/§5/§7/§8.

**Spec 47 has duplicate section numbers** — two §11s, two §15s, two §16s, two §7.6s. Every cross-reference is ambiguous.

---

# SECTION 8 — Corrections log

| # | Was | Now | Source |
|---|---|---|---|
| 1 | `step.yaml` | **`step.json`** | no YAML parser `[READ]` |
| 2 | tripwire at 75% | **×3/×10 median + separate 80%-of-budget** | Spec 118 F3 `[READ]` |
| 3 | one record type | **93%** + vocab type + 3 modifiers | `[READ]` |
| 4 | contract tier −1 | **does not exist** | Spec 119 §4.6 `[READ]` |
| 5 | DB-client instrumentation | **`pg_stat_xact_user_tables`** | `[SOURCED]` |
| 6 | WAP unspecified | **in-txn validate-then-rollback** | `[SOURCED]` |
| 7 | `SET CONSTRAINTS ALL IMMEDIATE` | **cut** — zero deferrable constraints | `[READ]` |
| 8 | `step_metrics` table | **cut** — `pipeline_runs` already is it | `[READ]` |
| 9 | `writes.tier` declared | **derived** | Spec 47 §7.8 `[READ]` |
| 10 | `txn_scope` 10-min cap | **per-step budget + `chunked`** | 87.1 min measured `[READ]` |
| 11 | 21 behaviours | **~35** | seven research passes |
| 12 | 6 declarations | **13 categories** | |
| 13 | fence IDs in the step file | **analysis artifacts** → conformance test | |
| 14 | "regret at 30 pipelines" | **folklore** | `[SOURCED-by-absence]` |
| 15 | adopt SQLMesh/Dagster | **build**; adopt their designs | `[SOURCED]` |
| 16 | 26 sources steps | **27** | `[READ]` |
| 17 | §4.1b: `enrich_ravines` ungated | **gated on main** | `[READ]` |
| 18 | §17: C2 has 1 instance | **4** | `[READ]` |
| 19 | §17: E1 at risk | **closed — the only one** | `[READ]` |
| 20 | 7 gate mechanisms | **8** | `[READ]` |
| 21 | lineage seeds all 27 | **25 of 27** | `[READ]` |
| 22 | `criticality: best_effort` cheap | **40–60 lines, deferred** | `[READ]` |
| 23 | "no Node-native declarative Postgres framework exists" | **OVERTURNED — SQLAnvil exists.** Build stands on a narrower premise: the known field is SQL-modeling-shaped and treats Node as a foreign shell-out | `[SOURCED]` |

**Twenty-three corrections, all before implementation.** The durable fix is the grounding tier: no line arrives with more confidence than its evidence.

**Correction #23 is the one that validates the method.** The spec had already refused to tag that claim `[SOURCED]`, flagged it as the single load-bearing premise of §1, and priced closing it at *"~15 minutes of open-ended search."* Fifteen minutes later it was overturned. A universal negative reached from an incomplete search is not evidence — and the tier system caught it **before commissioning rather than after**, which is the entire purpose of the discipline.
