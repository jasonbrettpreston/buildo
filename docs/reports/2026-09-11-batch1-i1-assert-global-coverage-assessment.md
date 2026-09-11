# Batch 1 I1 Assessment — `assert_global_coverage` (ASSERT archetype, second ASSERT conversion after `assert_schema`)

**Plan:** `.cursor/batch1_i1_assert_global_coverage_active_task.md` (AUTHORIZED 2026-09-11) — mirrors `.cursor/c4_batching_entry_active_task.md` §3.2 order 1, Execution Plan row **I1**.
**Governing procedure:** Spec 123 §6 (gates) + §7 (nine commits), instantiating Spec 121.
**Domain Mode:** Cross-Domain (no admin file edited this session; `FreshnessTimeline.tsx` is a consumer-contract dependency only — Scenario A handoff, §12 of the plan).

---

## 1. PH-0 — Boundary freeze (commit 1 → G0)

**Target Spec:** `docs/specs/00-architecture/00_system_map.md:49` → **Spec 49** (`docs/specs/01-pipeline/49_data_completeness_profiling.md`, "Global Data Completeness Profile") is the owning spec for `scripts/quality/assert-global-coverage.js`; the registered infra test is `src/tests/assert-global-coverage.infra.test.ts`. Governing architecture specs (read after the owner, per Spec 123 §6 G0): **Spec 122** (§1.10 ASSERT profile, §5.1/§5.3/§5.5, §8.1), **Spec 123** (§6 gates, §7 nine commits), **Spec 124** (§2 Rules, register). Cross-spec via the file's own `SPEC LINK` headers: **Spec 41** (`41_chain_permits.md`), **Spec 42** (`42_chain_coa.md`), **Spec 43** (`43_chain_sources.md`).

### 1.1 Core facts, re-measured (every command run independently this session, not copied from the plan)

| # | Claim | Command | Measured value |
|---|---|---|---|
| 1 | Line count | `wc -l scripts/quality/assert-global-coverage.js` | **1,464** |
| 2 | Advisory lock | `grep -n "^| 111 " docs/specs/01-pipeline/47_pipeline_script_protocol.md` | **111**, row `docs/specs/01-pipeline/47_pipeline_script_protocol.md:1955` — category "6 — Quality", `writes-DB = NO — read-only probe`. `ADVISORY_LOCK_ID = 111` at `scripts/quality/assert-global-coverage.js:39`. |
| 3 | Chains + position | `node -e "require('./scripts/manifest.json').chains…indexOf('assert_global_coverage')"` | **permits**: position 32 of 33 (last = `backup_db`) · **coa**: position 16 of 16 — **last step** · **sources**: position 24 of 28 (last = `assert_engine_health`). Matches the plan's row 3 exactly. |
| 4 | DML | `grep -niE "^\s*(insert into\|update \|delete from)" scripts/quality/assert-global-coverage.js` | **zero non-comment hits** — genuinely verdict-only. (A regex grep cannot see dynamically-composed SQL — every one of the 22 `pool.query(` bodies below was read directly, not grepped, and each is a static template literal; no string-built SQL exists in this file.) |
| 5 | `pool.query` call sites | `grep -n "pool\.query("` | **22** (list in §1.2). |
| 6 | Distinct tables/relations read | `grep -noE "\b(FROM\|JOIN)\s+[a-zA-Z_][a-zA-Z_.]*"` de-duplicated, two false positives excluded (`FROM added.` — comment prose at `:824`; `FROM NOW()` — the `EXTRACT(days FROM NOW() …)` date arithmetic at `:286`, not a table) | **23 distinct tables/relations**, not 22. **⚠️ Deviation from the plan (row 5): the plan's active_task.md lists exactly 22 tables and OMITS `trade_forecasts`**, which is read by the `tfa` query (`:943`, `FROM trade_forecasts`). Full corrected list: `building_footprints`, `coa_applications`, `cost_estimates`, `data_quality_snapshots`, `engine_health_snapshots`, `entities`, `information_schema.columns`, `lead_analytics`, `lead_parcels`, `lead_products`, `lead_trades`, `parcel_buildings`, `parcels`, `permit_parcels`, `permit_trades`, `permit_type_classifications`, `permits`, `phase_calibration`, `phase_stay_calibration`, `pipeline_runs`, `tracked_projects`, `trade_forecasts`, `wsib_registry`. (22 `pool.query` **statements** is still correct — one statement, the `misc` cross-table query at `:876`, and several others, touch more than one table via subselects/JOINs, which is how 22 statements read 23 distinct tables.) |
| 7 | Logic vars consumed | `grep -oE "logicVars\.[a-zA-Z_]+"` + `node -e` lookup against `scripts/seeds/logic_variables.json` | **6**, all verdict-affecting (§1.3 table below with seed defaults). |
| 8 | Row-builder call sites, raw grep (includes the 6 function *definitions*, one per builder) | `grep -c "<name>("` per builder | `coverageRow`: 97 · `infoRow`: 153 · `calibratedRow`: 17 · `externalRow`: 3 · `vocabRow`: 2 · `profileVocabTriple`: 3. **Matches the plan's row 8 exactly** (these are raw hit-counts, each one higher than the true call-site count by exactly 1 — the builder's own `function <name>(` definition line). |
| 9 | `rows.push(...)` total (the true audit-row-emitting call-site count) | `grep -c "rows\.push("` | **273** — confirmed exact match with the plan. Static-source classification of all 273 (node one-liner, `scratchpad/classify_pushes.js`, not committed): `infoRow` 152 direct + 1 via a named `coverageRow`-typed variable (`estCostRow`, pushed by name at `:483`) → **coverageRow effectively 96** (95 direct `rows.push(coverageRow(...))` + 1 `rows.push(estCostRow)`), **infoRow 152**, **calibratedRow 16**, **externalRow 2**, **profileVocabTriple 2** direct pushes (`:446`, `:1413`) — the `:1413` site sits inside `for (const t of VOCAB_COVERAGE)`, a single *source* call-site that fires **3 times at runtime** (`VOCAB_COVERAGE` has 3 entries, §1.4), so it is 1 static site but 3 dynamic rows — **1 `rows.push(...acceptedBaselineRows)`** spread (`:484`, 0–2 dynamic rows, self-retiring), **4 literal-object pushes** with no helper (`:1336`, `:1342` — the two C6 lead-id-integrity invariant rows; `:1380`, `:1393` — the two conditional C3 status-scope-drift rows). Sum: 96+152+16+2+2(static)+1(spread)+4(literal) = 273. ✅ |
| 10 | Existing (pre-conversion) test file | `wc -l src/tests/assert-global-coverage.infra.test.ts` | **927 L**. |
| 11 | Test-file stale claims — **located precisely, not just asserted** | `grep -n "28 steps\|12 steps\|toHaveLength" src/tests/assert-global-coverage.infra.test.ts` | **The docblock comment (`:8`) is stale**: `"(c) Chain count — permits chain = 28 steps, coa chain = 12 steps"` vs measured 33/16 (claim #3). **The narrative test-TITLE strings are also stale** (`:184` "step 29 post-Phase G", `:199` "step 15 post-Phase G") — both predate later chain-length changes. **But the live `expect(...).toHaveLength(...)` ASSERTIONS themselves are current and correct**: `:196` `toHaveLength(33)` (permits), `:211` `toHaveLength(16)` (coa), `:227` `toHaveLength(28)` (sources) — all three match the independently-measured chain lengths in claim #3. **This is a narrower finding than the plan's row 9**, which characterized the file as containing "two now-stale measured claims" without distinguishing comment-drift from assertion-drift; the assertions pass today, only the prose around them is wrong. |
| 12 | Do the stale `28`/`12` literals live in the SCRIPT or only the TEST? | `grep -n "28\|12" scripts/quality/assert-global-coverage.js` (manual read, no chain-length literal found) | **Only in the test** (docblock + 2 narrative strings). `scripts/quality/assert-global-coverage.js` contains **zero** hard-coded chain-length literals — it is chain-agnostic, branching only on `process.env.PIPELINE_CHAIN` (`isCoaChain`/`isSourcesChain`, `:97-98`). Classified in §4 (commit 4, G6) as a test-file-only INCIDENTAL finding, not a script defect. |
| 13 | Spec 49 §2 stale architecture text | `grep -n "step 26\|step 10" docs/specs/01-pipeline/49_data_completeness_profiling.md` | **Confirmed stale**, `docs/specs/01-pipeline/49_data_completeness_profiling.md:18-19`: *"Permits chain: step 26 (last step...)"* and *"CoA chain: step 10 (last step...)"* — both wrong per claim #3 (permits is position 32 of 33, NOT last; coa is position 16 of 16, which IS last, not position 10). Per the plan's Ask A3 (ruled): corrected in THIS report now (measured), the spec-file edit itself rides commit 9 alongside the conversion's own required spec-diff — not edited here (commits 1-4 make no `scripts/`/`src/`/spec edits per this session's Domain-Mode scope). |
| 14 | Git history (commit count) | `git log --oneline -- scripts/quality/assert-global-coverage.js \| wc -l` | **49 commits** since creation (`2c6efadb`, "WF1 — global field-level coverage profile"). **⚠️ Deviation from the plan (row 14): the plan states "28+ commits"** — a stale lower bound, not the measured figure. The churn-complexity batch report (`docs/reports/generated/122-churn-complexity.md:50`, window-end SHA, not HEAD) separately reports `commits=50`, consistent with 49 at HEAD plus normal window drift. |
| 15 | Fence-commit SHAs cited by Fold A item 4 | `git log -1 --format="%H %s" <sha> -- scripts/quality/assert-global-coverage.js` | All 4 confirmed to exist and touch this file: `5ef51de7` → `fix(42_chain_coa): C6 - trg_permits_lead_id was column-scoped to the wrong columns`; `5ec3523a` → `feat(44_chain_deep_scrapes): C3 - backfill smeared enriched_status + standing drift guard`; `50837ef4` → `feat(44_chain_deep_scrapes): C7 - status-writer invalidation for enriched_status (the root-cause fix)`; `3ab4fa83` → `fix(49_data_completeness): profile zoning enrichment coverage (#406)`. |
| 16 | Entry-gate readiness | `node -r dotenv/config scripts/analysis/step-validate.mjs --staged --fast` | re-run this session, unchanged from the plan's row 11: `programme: blocks batching: 0`. |

### 1.2 The 22 `pool.query` sites — table(s), purpose (statement-level, every site read directly)

| # | Line | Var | Branch | Table(s) read | Purpose / representative columns |
|---|---|---|---|---|---|
| 1 | 189 | `ca` | CoA | `coa_applications` | ~80-column aggregate: totals, unlinked/approved counts, and a `COUNT(*) FILTER` population column for every field written by CoA Steps 2-7 (`address`/`ward`/`decision`/`application_number`/`linked_permit_num`/`linked_confidence`/`lifecycle_phase`/`lifecycle_stalled`/`lifecycle_classified_at`/`parcel_linked_at`/`neighbourhood_id`/`scope_tags`/`structure_type`/`scope_classified_at`/`trade_classified_at`/`cost_classified_at`/`estimated_cost`), the zoning-feed columns (WF3 #406, 10 cols), ravine (#415, 2), heritage (#428, 3), centreline (§8e, 4), max-build (Spec 65, 11), existing-structure (Spec 65 Phase 1, 5), scenario-GFA (Spec 65 Phase 2 + WF3-A, 7), accessory-fit (Spec 65 Phase 3, 3), opt-config+comp (Spec 78 §4D, 2), rear-suite (3), the 15 `COST_PROP_FILTER_SQL` cost columns (Spec 88 §2.10), and `days_since_latest` (clock-relative, non-determinism inventory item). |
| 2 | 292 | `cx` | CoA | `lead_trades`, `lead_products`, `lead_parcels`, `cost_estimates` (each `WHERE lead_id LIKE 'coa:%'`), `phase_stay_calibration` (`WHERE permit_type IS NULL`, mig 147) | Cross-table CoA-side row counts for Phase D / E.3 steps. |
| 3 | 314 | `cm` | CoA | `permits` (PRE-% counts), subselects on `data_quality_snapshots`, `engine_health_snapshots`, `coa_applications` (duplicate PK groups) | Misc CoA-adjacent metrics. |
| 4 | 328 | `csSchema` | CoA | `information_schema.columns` | Column-count INFO row for `coa_applications` (CoA Step 1 — `assert_schema`). |
| 5 | 530 | `pp` | Sources | `parcels` | Zoning-enriched population counts: `zoning_class`, `bylaw_max_fsi`, `max_buildable_footprint_sqm`, `max_buildable_gfa_sqm`, `max_build_stories`, `opt_config_confidence`, `opt_aor_gfa_sqm`, `opt_coa_gfa_sqm`, `comp_count`, `neighbourhood_id`, `cost_fb_total`, `envelope_constrained`. |
| 6 | 556 | `mbc` | Sources | `parcels` (subquery scoped `WHERE zoning_class IS NOT NULL AND upper(zoning_class) LIKE 'R%'`), `EXISTS` against `parcel_buildings` | Max-build/opt-config coverage scoped to residential parcels **with a building** (`has_bldg`) — a health floor, not sparse-by-design. |
| 7 | 592 | `reasonDist` | Sources | `parcels` (`GROUP BY envelope_constraint_reason`) | Distribution-visibility loop — dynamic row count (Low-confidence item 1). |
| 8 | 604 | `pcm` | Sources | `parcels` (subquery), `EXISTS` against `parcel_buildings` | `parcel_cost_menu` coverage, residential-with-building scoped (Spec 88 §2.10). |
| 9 | 628 | `pa` | Permits | `permits` | ~60-column aggregate mirroring `ca` above but for the permits chain: base fields (Step 2), zoning/ravine/heritage/max-build/existing-structure/scenario/accessory/opt-config/cost-prop feeds, `zoning_enriched_pop`. |
| 10 | 775 | `ea` | Permits | `entities` | `legal_name`, `name_normalized`, `permit_count`, `entity_type`, `last_seen_at`, `is_wsib_registered` population counts. |
| 11 | 794 | `bnd` | Permits | `permits` LEFT JOIN `entities` | Builder-name → entity match counts (`p.permit_num NOT LIKE 'PRE-%'`). |
| 12 | 806 | `wa` | Permits | `wsib_registry` | `linked_entity_id`, `match_confidence` population counts. |
| 13 | 825 | `pb` | Permits | `parcel_buildings pb` JOIN `building_footprints bf` | `is_primary`, `structure_type`, `match_type`, `confidence`, `linked_at`, `footprint_area_sqm`, height population counts. |
| 14 | 841 | `pt` | Permits | `permit_trades` | `tier`, `confidence`, `is_active`, `phase`, `lead_score`, `classified_at` population counts. |
| 15 | 855 | `ce` | Permits | `cost_estimates` | `estimated_cost`, `cost_source`, `cost_tier`, `cost_range_low`/`high`, `premium_factor` population counts. |
| 16 | 876 | `misc` | Permits | Subselects: `permit_parcels`, `permit_trades`, `cost_estimates`, `permit_parcels JOIN permits`, `parcel_buildings`, `parcels` (×2), `phase_calibration`, `coa_applications` (×6 filtered variants), `tracked_projects` (×2), `lead_analytics`, `data_quality_snapshots`, `engine_health_snapshots`, `permits` (duplicate-PK self-check) | 18-subselect cross-table denominator batch. |
| 17 | 927 | `tfd` | Permits | `permits p` JOIN `permit_trades pt` | Forecast-eligible permit count — **mirrors `SOURCE_SQL` in `compute-trade-forecasts.js` exactly** (a cross-file duplication worth flagging at G6). |
| 18 | 943 | `tfa` | Permits | `trade_forecasts` | Forecast totals, `predicted_start`, `urgency`, `opportunity_score` population counts (permit-level DISTINCT, avoiding >100% on multi-trade permits). |
| 19 | 973 | `pSchema` | Permits | `information_schema.columns` | Column-count INFO row for `permits`. |
| 20 | 1303 | `etRuns` | Permits | `pipeline_runs` (`WHERE pipeline = 'assert_entity_tracing' ORDER BY started_at DESC LIMIT 1`) | Read-only last-verdict lookup — the ONLY query in the file that reads another step's own `records_meta`, not raw domain data. |
| 21 | 1323 | `leadIntegrity` | Permits | `permits` JOIN `permit_type_classifications` (admin drift), `permits` self-subselect (duplicate `lead_id` groups) | The C6 migration 138_a/241 standing invariant — feeds the two always-on FAIL rows. |
| 22 | 1374 | `scopeDrift` | Permits | `permits` (`WHERE enriched_status IS NOT NULL AND status IS DISTINCT FROM 'Inspection'`) | The C3 self-retiring status-scope-drift guard. |

### 1.3 Logic variables (6, all verdict-affecting) — seed defaults re-read from `scripts/seeds/logic_variables.json`

| Key | Default | Min–Max | Consumed at | Group |
|---|---|---|---|---|
| `profiling_coverage_pass_pct` | **90** | 0–100 | `:44`, `coverageRow`/PASS boundary | Coverage & Quality |
| `profiling_coverage_warn_pct` | **70** | 0–100 | `:45`, `coverageRow`/WARN boundary | Coverage & Quality |
| `vocab_coverage_pass_pct` | **90** | 0–100 | `:48`, `vocabRow`/PASS boundary | Coverage & Quality |
| `vocab_coverage_warn_pct` | **70** | 0–100 | `:49`, `vocabRow`/WARN boundary | Coverage & Quality |
| `cost_coverage_pass_pct` | **55** | 0–100 | `:53`, WF3 F4 scoped Step-14 floor (recalibrated off the global 90/70; ~62% is the structural ceiling) | Cost Audit Thresholds |
| `cost_coverage_warn_pct` | **50** | 0–100 | `:54`, pairs with the above | Cost Audit Thresholds |

All 6 feed PASS/WARN/FAIL boundaries directly (Rule 3, Spec 124 §2) — none is descriptive-only. `LOGIC_VARS_SCHEMA` (`:43-64`) Zod-validates all 6 plus 3 cross-field `.refine()` ordering invariants (`warn < pass` for profiling/vocab, `warn <= pass` for cost) before any query runs.

### 1.4 Audit-row families (273 `rows.push` sites — verified §1.1 claim 9) + the shared `VOCAB_COVERAGE` array

| Builder | Static call sites | Status rule | Runtime multiplicity |
|---|---|---|---|
| `coverageRow` | 96 (95 direct + 1 via `estCostRow`) | PASS ≥ `passPct`, WARN ≥ `warnPct`, FAIL below (global 90/70) | 1:1, static |
| `infoRow` | 152 | Always `INFO`, no threshold | 1:1 static, except the `reasonDist` loop (`:601`, 1 static site → N dynamic rows, N = distinct non-null `envelope_constraint_reason` values) and the `COST_PROP_COLS` loop (`:428`, 1 static site → 15 dynamic rows, one per `COST_PROP_COLS` entry, CoA branch only) |
| `calibratedRow` | 16 | PASS/WARN per explicit per-field thresholds (e.g. DEC-1 `zoning_class` 80/75) | 1:1 static |
| `externalRow` | 2 | PASS ≥10%, WARN ≥5% (scraper-sourced fields) | 1:1 static |
| `vocabRow` (called only from inside `profileVocabTriple`, never pushed directly) | 1 internal call (`:175`) | PASS ≥`vocabPassPct`, WARN ≥`vocabWarnPct` | n/a — wrapped |
| `profileVocabTriple` | 2 direct pushes (`:446` CoA-only `structure_type` triple; `:1413` the `VOCAB_COVERAGE` loop) | delegates to `vocabRow`/unresolved-WARN | `:1413` fires **3×** per run in permits/coa (once per `VOCAB_COVERAGE` array entry — Step 13 trades, Step 13 products, Step 10 neighbourhoods triple in permits; the CoA trades triple only in coa) — **skipped entirely in the sources branch** |
| literal-object (no helper) | 4 (`:1336`, `:1342` C6 lead-id invariants; `:1380`, `:1393` C3 scope-drift pair) | `:1336`/`:1342` always FAIL-capable (any nonzero = corruption); `:1380`/`:1393` WARN+INFO pair, self-retiring at 0 | `:1336`/`:1342` always-on (permits branch only); `:1380`/`:1393` **conditional** — emitted only `if (driftRows > 0)` |
| `acceptedBaselineRows` spread (`:484`) | 1 | producer-side accepted-WARN downgrade (Spec 48 §4.6/§4.9), self-retires at ≥`passPct` | 0–2 dynamic rows, CoA branch only |

**Mutual exclusivity (re-confirmed):** the three branches (`isCoaChain` / `isSourcesChain` / else-permits) are an `if/else if/else` — exactly one runs per invocation. The `VOCAB_COVERAGE` loop and the two C6 invariant rows run in the **permits and coa** branches only (both fall through to the shared tail after the `if/else if` — confirmed by re-reading `:1301-1413`, which sits textually after the CoA branch's closing brace and is NOT inside the `isSourcesChain` arm); the sources branch returns before reaching that tail. This matches the plan's §1 boundary claim.

### 1.5 Exit codes / verdict paths / stdout markers

- **Verdict derivation** (`:1418-1420`): `rows.some(FAIL) ? 'FAIL' : rows.some(WARN) ? 'WARN' : 'PASS'` — a **parallel-boolean-shaped, row-derived** cascade (it IS derived from `rows`, satisfying Rule 10's row-derivation requirement, but is a hand-rolled per-script copy of the pattern `scripts/lib/step/verdict.js`'s `deriveVerdict(rows)` already centralizes for every converted step — flagged for G6 classification, §4).
- **Success emit** (`:1429-1443`): `pipeline.emitSummary({ records_total: 1, records_new: 0, records_updated: 0, records_meta: { audit_table: { phase: 111, name: 'Global Data Completeness Profile', verdict, rows } } })` then `pipeline.emitMeta({}, {})` — empty reads/writes maps (Observer archetype, no `emitMeta` table declarations despite reading 23 tables — the SDK's declared-reads contract is not populated here; a G6/Rule-1 candidate).
- **Lock-contention emit** (`:1445-1463`): on `!lockResult.acquired`, a **bare custom emit** — `pipeline.emitSummary({ records_total: 0, records_new: 0, records_updated: 0, records_meta: { skipped: true, reason: 'lock_held', advisory_lock_id: ADVISORY_LOCK_ID } })` + `emitMeta({}, {})`. This is **NOT** the shared `skipRecordsMeta`/`RUN_STATUS.SELF_SKIPPED` shape the plan's row-10 WD-1 disposition and A3 (`sharing.on_contention: "self_skip"`) describe as the target-state precedent (`assert_schema`'s post-conversion library path) — pre-conversion, this step hand-rolls its own skip payload with **no `audit_table`** at all. Flagged for G6 (§4) as the precise gap the conversion's library adoption structurally closes.
- **Throw sites:** exactly **one** `throw new Error(...)` in the whole file (`:86`, logic-var Zod validation failure) — an infrastructure-class halt, consistent with "Non-halting: WARN/FAIL rows in the audit_table do not throw" (file's own header comment, `:13`). No other `throw`, no `process.exit()` (confirmed absent by grep, `:` — file-wide).
- **stdout markers:** **zero direct `console.*` calls** in this file (confirmed by grep). `PIPELINE_SUMMARY:`/`PIPELINE_META:`-prefixed JSON lines are emitted by the shared library (`scripts/lib/pipeline.js:523,537`) when `emitSummary`/`emitMeta` are called above — this step never touches stdout directly, only through the two declared emit call-sites per branch.

### 1.6 G4 — risk class (chance × impact, not just the total)

- **Chance:** HIGH. Churn=50 commits (measured §1.1 claim 14), quadrant top-right per `docs/reports/generated/122-churn-complexity.md:50` (churn≥21, complexity≥54 median split, both exceeded by a wide margin) — the highest-churn file in the 27-step population.
- **Impact:** HIGH. 23 tables read, feeds the admin `FreshnessTimeline.tsx` legacy metric-row renderer (§12 handoff, consumer contract), runs at the tail of all 3 chains (last-or-second-last), and is the **only** place two migration-era standing invariants (C6 lead-id integrity, mig 138_a/241; C3 status-scope drift) are asserted.
- **Risk class: A** (chance HIGH × impact HIGH) — consistent with the plan's §3 "full nine-commit form, no abbreviation" ruling (R-AA).

### G0 verdict

All boundary claims in the plan's §1/§0 are **re-measured and confirmed**, with two genuine corrections surfaced independently this session (not present in the plan): **(a)** the table count is 23, not 22 — `trade_forecasts` (`:943`) was omitted from the plan's list; **(b)** the commit-history figure is 49, not "28+". Both are recorded here as measured findings, not silently reconciled into the plan's numbers. The two stale-test-claim / stale-Spec-49-§2 findings are confirmed and precisely located (docblock + test-title prose only, not the live assertions; not the script). **G0: PASS.**

---

---

## 2. PH-3 — Intent Ledger (commit 2 → G3)

Per Spec 123 §7.1 role split: **a human adjudicates; the agent discovers and cites evidence only.** Every row below carries `PROPOSED (adjudication pending — Spec 123 §7.1 discoverer ≠ adjudicator)` — none is a ruling. Dispositions are drawn from the closed vocabulary: `preserved-in-runner` / `preserved-in-validator` / `preserved-in-compute` / `encoded-as-descriptor-field` / `encoded-as-deviation` / `knowingly-retired`.

### 2.1 The four fences named by Fold A item 4 — confirmed via `git log -1 --format="%H %s" <sha> -- scripts/quality/assert-global-coverage.js` this session (§1.1 claim 15)

| # | Fence | Blame commit | Subject | Evidence in the current file | PROPOSED disposition |
|---|---|---|---|---|---|
| IL-1 | **C6** — `lead_id_administrative_drift` + `lead_id_duplicate_groups` (`:1311-1342`) | `5ef51de7` | `fix(42_chain_coa): C6 - trg_permits_lead_id was column-scoped to the wrong columns` | The file's own comment block (`:1311-1320`) names migration 138_a's silent trigger-scope gap, migration 241's re-scope+repair, and the SECOND drift path (`permit_type_classifications` reclassification, invisible to any trigger) these two rows exist specifically to catch. Both are always-on, FAIL-on-nonzero, permits-branch-only. | **PROPOSED preserved-in-compute** — each row becomes its own declared `checks[]` entry, `why` citing migration 138_a/241 + commit `5ef51de7`; threshold `0`, `severity: FAIL`, `when: always` (no logic var — a schema invariant, not a coverage tunable, correctly excluded from Rule 3's logic-var requirement per the "constant vs config" distinction Spec 124 draws). |
| IL-2 | **C3/C7** — `enriched_status_status_scope_drift` + `_retighten` pair (`:1349-1401`) | `5ec3523a` (C3, backfill), `50837ef4` (C7, root-cause writer-invalidation fix) | `feat(44_chain_deep_scrapes): C3 - backfill smeared enriched_status + standing drift guard`; `feat(44_chain_deep_scrapes): C7 - status-writer invalidation for enriched_status (the root-cause fix)` | The comment block (`:1349-1373`) explains WHY this pair is WARN+self-retiring rather than C6's FAIL-on-nonzero: C7 closed the regeneration path at 4 named writer sites, so post-C7 the metric is *expected* to read 0 — a WARN shape lets a future 5th writer redden the count without hard-failing on a value that may still be draining historical residue. Modelled on `acceptedBaselineRows` shape but hand-rolled (COUNT retiring downward vs that helper's percentage retiring upward) — an explicit divergence the comment defends. | **PROPOSED preserved-in-compute** — conditional check pair (`emit only if driftRows > 0`), `why` citing Spec 48 §4.9 + the 4 named writer sites + commits `5ec3523a`/`50837ef4`; the retighten condition (`:1396-1400`) is itself machine-observable text that should become a structured `retighten_when` descriptor field (mirrors `link_massing`'s `LM-D6` precedent, `docs/reports/defect-ledger.md`), not free prose. |
| IL-3 | **DEC-1** — `zoning_class` calibrated 80/75 threshold (CoA `:360`, permits `:1102`) | `3ab4fa83` | `fix(49_data_completeness): profile zoning enrichment coverage (#406)` | Comment `:355-356` / `:1096-1098`: "gated headline (DEC-1: PASS >= 80 / WARN >= 75, restores the regression net F-H12 would otherwise be the only source of)". | **PROPOSED encoded-as-descriptor-field** — `checks[].limit` = 80/75 as a literal per-check bound (NOT a logic var — this is a per-field calibration, and Rule 3's `on_invalid:"fail"` applies to the field's *presence*, not to promoting every calibrated literal into `logic_variables`; flagged at G6 as a Rule-3 gray area worth an explicit ruling, not silently resolved here). |
| IL-4 | **DEC-2** — `Step 9b` / `CoA Step 4b` insert-after label convention, full renumber deferred as `#405` | same commit, `3ab4fa83` | (see IL-3) | `docs/specs/01-pipeline/49_data_completeness_profiling.md:170,194` confirms `#405` is a **separately-tracked cosmetic item**, not resolved by this or any later commit touching this file (re-confirmed live this session — no commit since `3ab4fa83` touches the label strings). | **PROPOSED preserved-in-compute, labels copied VERBATIM** (Fold A item 3, binding) — the row-builder census below (§2.2) carries every `Step 9b`/`CoA Step 4b` label unmodified; #405's full renumber stays out of scope for this conversion. |

### 2.2 Additional non-obvious constants/thresholds found independently this session (`git log -S`, not named by Fold A)

| # | Construct | Blame commit | Subject | PROPOSED disposition |
|---|---|---|---|---|
| IL-5 | `profiling_coverage_pass_pct`/`warn_pct` — the global 90/70 gate (114 `coverageRow` calls, §1.4) | `2c6efadb` (creation), `90a49329` (later realignment) | `feat(49_data_completeness_profiling): WF1 — global field-level coverage profile for permits + CoA chains`; `fix(49_data_completeness_profiling): WF3 — CQA threshold alignment post zombie-gate` | **PROPOSED encoded-as-descriptor-field** — already a registered logic var (§1.3); Rule 3 compliant as-is. |
| IL-6 | `vocab_coverage_pass_pct`/`warn_pct` + the `VOCAB_COVERAGE` static array (3 entries, `:71-79`) | `596d309b` | `feat(49_data_completeness_profiling): vocabulary-coverage profiling` | **PROPOSED encoded-as-descriptor-field** — already a registered logic var; the array's 3 entries become 3 named `checks[]` (or one parameterised check, `sharing.varies_by_chain` — Low-confidence item 3 in the plan, unresolved until this census exists). |
| IL-7 | `cost_coverage_pass_pct`/`warn_pct` — WF3 F4's scoped 55/50 floor for Step-14 `cost_estimates` rows (6 `calibratedRow` calls, corrected census §2.3) | `4442fb75` | `feat(83_lead_cost_model): archetype-based project cost for permits + CoA + WF3 hardening` | **PROPOSED encoded-as-descriptor-field** — already a registered logic var (§1.3); the WF3 F4 rationale comment (`:1212-1217`, "these rows use the recalibrated cost floor via calibratedRow, NOT the global 90% gate") should become the check's `why`. |
| IL-8 | `externalRow`'s hardcoded 10/5 threshold (2 calls: `is_wsib_registered`, `wsib_registry.linked_entity_id`) | `6e1b7df4` | `fix(49_data_completeness_profiling): WF3 — exhaustive 8-denominator field profile rewrite` | **PROPOSED encoded-as-descriptor-field** — not currently a logic var (Rule 3 gap: two scraper-sourced-field thresholds live only as JS literals `10`/`5`, `:127-128`). Flagged for G6 as the clearest Rule-3 violation in the file — no `deviations[]` entry exists to excuse it. |
| IL-9 | CoA `neighbourhood_id` calibrated 95/90 | `f319300a` | `feat(49_data_completeness): report coa_applications.neighbourhood_id coverage` | **PROPOSED encoded-as-descriptor-field** — per-field literal, same Rule-3 gray area as IL-3. |
| IL-10 | CoA `structure_type` calibrated 45/35 (description-classifier ceiling ~52%, `:436-438`) | `b02e2366` | `feat(42_chain_coa): CoA structure_type dwelling-use classifier (description → Spec 83 §3.A vocab)` | **PROPOSED encoded-as-descriptor-field** — comment explicitly defends the recalibration off a would-be-permanent-false-FAIL 80% target; `why` text already exists verbatim in source. |
| IL-11 | Sources-chain calibrated thresholds: `zoning_class` 90/85, `max_buildable_footprint_sqm`/`gfa_sqm`/`max_build_stories`/`opt_aor_gfa_sqm` 88/75 (residential-with-building scoped) | `d72ce2ff` (zoning_class), `1f8ca38a` (max-build block) | `feat(49_data_completeness_profiling): parcels-table coverage profile in the sources chain [WF3]`; `feat(43_chain_sources): sources-chain honesty gates — GIS floors, scoped max-build coverage, enrich --full, link-rate + order pins` | **PROPOSED encoded-as-descriptor-field** — the `has_bldg EXISTS` scoping pattern (§1.2 site 6) is itself load-bearing (excludes building-less lots from both numerator and denominator) and must travel with the check as a declared `guard`, not just the threshold. |
| IL-12 | `parcel_cost_menu` calibrated 85/80 (residential-with-building scoped) | `8a3a3644` | `feat(88_parcel_cost_model): P1 — parcel renovation cost model (engine + Mutator + §4D propagation + Spec 49)` | **PROPOSED encoded-as-descriptor-field**, same `has_bldg` guard note as IL-11. |
| IL-13 | `tfd` query (`:927-936`) **duplicates** `SOURCE_SQL` from `scripts/compute-trade-forecasts.js` — the file's own comment (`:929`) states this explicitly ("Mirrors SOURCE_SQL in compute-trade-forecasts.js exactly") | (comment is self-documenting; not independently blamed this session — low priority) | — | **PROPOSED knowingly-retired is NOT appropriate here** (the duplication is live and load-bearing) — flagged instead as a **G6 DEFECT candidate** (§4): a cross-file SQL duplication with no shared source of truth is exactly the drift class the WF2 #4 `fetchLeadInspect` bug (commit `73f3ae68`, cited at `:823`) already burned this file once — `pb`/`bf` JOIN columns drifted from the lead-inspector's own copy until a sibling fix caught it. |

### 2.3 Row-builder census (Ask A1) — all 273 `rows.push` sites, mechanically generated

**Command** (throwaway, NOT committed — `scripts/CLAUDE.md`/Spec 122 conventions keep one-off analysis scripts out of `scripts/`; regenerate with the equivalent snippet against `scripts/quality/assert-global-coverage.js` at any time):

```
node <<'JS'
// Bracket-matches every rows.push(...) call site (multi-line safe), classifies it by
// builder (coverageRow/infoRow/calibratedRow/externalRow/vocabRow/profileVocabTriple/
// literal-object/spread), extracts the first 1-2 quoted-string args (stepTarget, field)
// and the calibratedRow threshold args, and derives a threshold-source label per builder.
// Full source: this session's scratchpad census.js + census_md.js (not committed).
JS
```

**Coverage note (honesty over false precision):** the bracket-matching extractor pulls quoted-string literals reliably for the 4 direct-string builders (`coverageRow`/`infoRow`/`calibratedRow`/`externalRow` — 269 of 273 rows). It does **not** attempt object-literal destructuring for the 2 `profileVocabTriple` object-argument calls (`:446`, `:1413` — `stepTarget`/`field` columns blank below, verify at source) or the 2 dynamic loop-generated rows (`:429` `COST_PROP_COLS` loop — 15 dynamic rows/run from 1 static site — and `:598` `reasonDist` loop — N dynamic rows/run, N = distinct non-null `envelope_constraint_reason` values). Static-site count stays 273 regardless; **runtime row count is higher** (Low-confidence item 1, carried from the plan, still unresolved — needs a live DB read per chain).

**Full census (273 rows):**

<details>
<summary>273-row builder census (click to expand)</summary>

| # | Line | Builder | Step target | Field / metric | Threshold source | Severity |
|---|---|---|---|---|---|---|
| 1 | 332 | infoRow | CoA Step 1 — assert_schema | coa_applications.columns_present | none (INFO, no threshold) | INFO only |
| 2 | 335 | coverageRow | CoA Step 2 — load_coa | coa_applications.address | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 3 | 336 | coverageRow | CoA Step 2 — load_coa | coa_applications.ward | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 4 | 337 | coverageRow | CoA Step 2 — load_coa | coa_applications.decision | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 5 | 338 | coverageRow | CoA Step 2 — load_coa | coa_applications.application_number | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 6 | 342 | infoRow | CoA Step 3 — assert_coa_freshness | coa_applications.days_since_latest | none (INFO, no threshold) | INFO only |
| 7 | 345 | coverageRow | CoA Step 4 — link_coa_to_parcels | coa_applications.parcel_linked_at | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 8 | 346 | infoRow | CoA Step 4 — link_coa_to_parcels | lead_parcels.coa_rows | none (INFO, no threshold) | INFO only |
| 9 | 352 | calibratedRow | CoA Step 4 — link_coa_to_parcels | coa_applications.neighbourhood_id | hardcoded literal args (95/90, not a logic var) | PASS/WARN/FAIL |
| 10 | 360 | calibratedRow | CoA Step 4b — enrich_coa_zoning | coa_applications.zoning_class | hardcoded literal args (80/75, not a logic var) | PASS/WARN/FAIL |
| 11 | 361 | infoRow | CoA Step 4b — enrich_coa_zoning | coa_applications.zoning_enriched_at | none (INFO, no threshold) | INFO only |
| 12 | 362 | infoRow | CoA Step 4b — enrich_coa_zoning | coa_applications.bylaw_max_coverage_pct | none (INFO, no threshold) | INFO only |
| 13 | 363 | infoRow | CoA Step 4b — enrich_coa_zoning | coa_applications.bylaw_max_fsi | none (INFO, no threshold) | INFO only |
| 14 | 364 | infoRow | CoA Step 4b — enrich_coa_zoning | coa_applications.bylaw_max_height_m | none (INFO, no threshold) | INFO only |
| 15 | 365 | infoRow | CoA Step 4b — enrich_coa_zoning | coa_applications.exception_number | none (INFO, no threshold) | INFO only |
| 16 | 366 | infoRow | CoA Step 4b — enrich_coa_zoning | coa_applications.variance_context | none (INFO, no threshold) | INFO only |
| 17 | 367 | infoRow | CoA Step 4b — enrich_coa_zoning | coa_applications.zoning_parcel_count | none (INFO, no threshold) | INFO only |
| 18 | 368 | infoRow | CoA Step 4b — enrich_coa_zoning | coa_applications.zoning_dominant_parcel_id | none (INFO, no threshold) | INFO only |
| 19 | 369 | infoRow | CoA Step 4b — enrich_coa_zoning | coa_applications.zoning_dominant_parcel_method | none (INFO, no threshold) | INFO only |
| 20 | 374 | infoRow | CoA Step 4b — enrich_coa_zoning | coa_applications.is_in_ravine_protection_area | none (INFO, no threshold) | INFO only |
| 21 | 376 | infoRow | CoA Step 4b — enrich_coa_zoning | coa_applications.ravine_distance_m | none (INFO, no threshold) | INFO only |
| 22 | 380 | infoRow | CoA Step 4b — enrich_coa_zoning | coa_applications.is_heritage_designated | none (INFO, no threshold) | INFO only |
| 23 | 381 | infoRow | CoA Step 4b — enrich_coa_zoning | coa_applications.heritage_designation_type | none (INFO, no threshold) | INFO only |
| 24 | 382 | infoRow | CoA Step 4b — enrich_coa_zoning | coa_applications.heritage_designation_date | none (INFO, no threshold) | INFO only |
| 25 | 386 | infoRow | CoA Step 4b — enrich_coa_zoning | coa_applications.is_corner_lot | none (INFO, no threshold) | INFO only |
| 26 | 387 | infoRow | CoA Step 4b — enrich_coa_zoning | coa_applications.is_through_lot | none (INFO, no threshold) | INFO only |
| 27 | 388 | infoRow | CoA Step 4b — enrich_coa_zoning | coa_applications.abuts_laneway | none (INFO, no threshold) | INFO only |
| 28 | 389 | infoRow | CoA Step 4b — enrich_coa_zoning | coa_applications.primary_frontage_street_name | none (INFO, no threshold) | INFO only |
| 29 | 391 | infoRow | CoA Step 4b — enrich_coa_zoning | coa_applications.lot_size_confidence | none (INFO, no threshold) | INFO only |
| 30 | 392 | infoRow | CoA Step 4b — enrich_coa_zoning | coa_applications.max_buildable_footprint_sqm | none (INFO, no threshold) | INFO only |
| 31 | 393 | infoRow | CoA Step 4b — enrich_coa_zoning | coa_applications.max_buildable_gfa_sqm | none (INFO, no threshold) | INFO only |
| 32 | 394 | infoRow | CoA Step 4b — enrich_coa_zoning | coa_applications.max_buildable_gfa_basis_fsi | none (INFO, no threshold) | INFO only |
| 33 | 395 | infoRow | CoA Step 4b — enrich_coa_zoning | coa_applications.max_buildable_gfa_basis_coverage_box | none (INFO, no threshold) | INFO only |
| 34 | 397 | infoRow | CoA Step 4b — enrich_coa_zoning | coa_applications.max_buildable_gfa_basis_coverage_only | none (INFO, no threshold) | INFO only |
| 35 | 398 | infoRow | CoA Step 4b — enrich_coa_zoning | coa_applications.max_build_confidence_high | none (INFO, no threshold) | INFO only |
| 36 | 399 | infoRow | CoA Step 4b — enrich_coa_zoning | coa_applications.max_build_confidence_medium | none (INFO, no threshold) | INFO only |
| 37 | 400 | infoRow | CoA Step 4b — enrich_coa_zoning | coa_applications.max_build_confidence_low | none (INFO, no threshold) | INFO only |
| 38 | 401 | infoRow | CoA Step 4b — enrich_coa_zoning | coa_applications.garden_suite_fits | none (INFO, no threshold) | INFO only |
| 39 | 402 | infoRow | CoA Step 4b — enrich_coa_zoning | coa_applications.envelope_constrained | none (INFO, no threshold) | INFO only |
| 40 | 404 | infoRow | CoA Step 4b — enrich_coa_zoning | coa_applications.imagery_roof_footprint_sqm | none (INFO, no threshold) | INFO only |
| 41 | 405 | infoRow | CoA Step 4b — enrich_coa_zoning | coa_applications.imagery_roof_gfa_sqm | none (INFO, no threshold) | INFO only |
| 42 | 406 | infoRow | CoA Step 4b — enrich_coa_zoning | coa_applications.existing_structure_confidence_high | none (INFO, no threshold) | INFO only |
| 43 | 407 | infoRow | CoA Step 4b — enrich_coa_zoning | coa_applications.existing_structure_confidence_low | none (INFO, no threshold) | INFO only |
| 44 | 408 | infoRow | CoA Step 4b — enrich_coa_zoning | coa_applications.existing_greenspace_sqm | none (INFO, no threshold) | INFO only |
| 45 | 410 | infoRow | CoA Step 4b — enrich_coa_zoning | coa_applications.max_newbuild_coa_gfa_sqm | none (INFO, no threshold) | INFO only |
| 46 | 411 | infoRow | CoA Step 4b — enrich_coa_zoning | coa_applications.cur_floor_gfa_sqm | none (INFO, no threshold) | INFO only |
| 47 | 412 | infoRow | CoA Step 4b — enrich_coa_zoning | coa_applications.cur_pot_2story_gfa_sqm | none (INFO, no threshold) | INFO only |
| 48 | 413 | infoRow | CoA Step 4b — enrich_coa_zoning | coa_applications.cur_pot_3story_gfa_sqm | none (INFO, no threshold) | INFO only |
| 49 | 414 | infoRow | CoA Step 4b — enrich_coa_zoning | coa_applications.cur_gfa_range_basis | none (INFO, no threshold) | INFO only |
| 50 | 415 | infoRow | CoA Step 4b — enrich_coa_zoning | coa_applications.cur_est_kitchen_gfa_sqm | none (INFO, no threshold) | INFO only |
| 51 | 416 | infoRow | CoA Step 4b — enrich_coa_zoning | coa_applications.cur_est_bath_gfa_sqm | none (INFO, no threshold) | INFO only |
| 52 | 418 | infoRow | CoA Step 4b — enrich_coa_zoning | coa_applications.max_garage_gfa_sqm | none (INFO, no threshold) | INFO only |
| 53 | 419 | infoRow | CoA Step 4b — enrich_coa_zoning | coa_applications.garage_permission_as_of_right | none (INFO, no threshold) | INFO only |
| 54 | 420 | infoRow | CoA Step 4b — enrich_coa_zoning | coa_applications.garage_permission_coa_required | none (INFO, no threshold) | INFO only |
| 55 | 421 | infoRow | CoA Step 4b — enrich_coa_zoning | coa_applications.rear_suite_type | none (INFO, no threshold) | INFO only |
| 56 | 422 | infoRow | CoA Step 4b — enrich_coa_zoning | coa_applications.rear_suite_permission_as_of_right | none (INFO, no threshold) | INFO only |
| 57 | 423 | infoRow | CoA Step 4b — enrich_coa_zoning | coa_applications.rear_suite_permission_coa_required | none (INFO, no threshold) | INFO only |
| 58 | 425 | infoRow | CoA Step 4b — enrich_coa_zoning | coa_applications.opt_config_confidence | none (INFO, no threshold) | INFO only |
| 59 | 426 | infoRow | CoA Step 4b — enrich_coa_zoning | coa_applications.comp_count | none (INFO, no threshold) | INFO only |
| 60 | 429 | infoRow | CoA Step 4b — enrich_coa_zoning | coa_applications.`${c}` — `COST_PROP_COLS` loop, 15 dynamic rows/run (Spec 88 §2.10) | none (INFO, no threshold) | INFO only |
| 61 | 433 | coverageRow | CoA Step 5 — classify_coa_scope | coa_applications.scope_tags | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 62 | 434 | coverageRow | CoA Step 5 — classify_coa_scope | coa_applications.scope_classified_at | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 63 | 439 | calibratedRow | CoA Step 5 — classify_coa_scope | coa_applications.structure_type | hardcoded literal args (45/35, not a logic var) — IL-10 | PASS/WARN/FAIL |
| 64 | 446 | profileVocabTriple | CoA Step 5 — classify_coa_scope (object-literal arg, see `:447-450`) | coa_applications.structure_type vocab | logic-var (vocab_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL, or WARN-on-unresolved |
| 65 | 453 | coverageRow | CoA Step 6 — classify_coa_trades | coa_applications.trade_classified_at | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 66 | 454 | infoRow | CoA Step 6 — classify_coa_trades | lead_trades.coa_rows | none (INFO, no threshold) | INFO only |
| 67 | 455 | infoRow | CoA Step 6 — classify_coa_trades | lead_products.coa_rows | none (INFO, no threshold) | INFO only |
| 68 | 458 | coverageRow | CoA Step 7 — compute_coa_cost_estimates | coa_applications.cost_classified_at | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 69 | 483 | coverageRow | CoA Step 7 — compute_coa_cost_estimates | coa_applications.estimated_cost | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL (pushed via the named var `estCostRow`, `:471`) |
| 70 | 484 | spread(acceptedBaselineRows) | CoA Step 7 — compute_coa_cost_estimates | coa_cost_coverage_gate_accepted (0-2 dynamic rows) | derived (producer-side accepted-baseline downgrade of `estCostRow`, Spec 48 §4.6/§4.9) | WARN (self-retires at ≥ passPct) or absent |
| 71 | 485 | infoRow | CoA Step 7 — compute_coa_cost_estimates | cost_estimates.coa_rows | none (INFO, no threshold) | INFO only |
| 72 | 488 | coverageRow | CoA Step 8 — link_coa | coa_applications.linked_permit_num | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 73 | 489 | coverageRow | CoA Step 8 — link_coa | coa_applications.linked_confidence | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 74 | 499 | infoRow | CoA Step 9 — refresh_snapshot | data_quality_snapshots.today | none (INFO, no threshold) | INFO only |
| 75 | 502 | infoRow | CoA Step 10 — assert_data_bounds | coa_applications.duplicate_pks | none (INFO, no threshold) | INFO only |
| 76 | 505 | infoRow | CoA Step 11 — assert_engine_health | engine_health_snapshots.today | none (INFO, no threshold) | INFO only |
| 77 | 509 | coverageRow | CoA Step 12 — classify_lifecycle_phase | coa_applications.lifecycle_phase | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 78 | 512 | infoRow | CoA Step 12 — classify_lifecycle_phase | coa_applications.lifecycle_stalled | none (INFO, no threshold) | INFO only |
| 79 | 514 | coverageRow | CoA Step 12 — classify_lifecycle_phase | coa_applications.lifecycle_classified_at | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 80 | 517 | infoRow | CoA Step 13 — assert_lifecycle_phase_distribution | coa_applications.unclassified_count | none (INFO, no threshold) | INFO only |
| 81 | 521 | infoRow | CoA Step 14 — compute_phase_calibration | phase_stay_calibration.coa_rows | none (INFO, no threshold) | INFO only |
| 82 | 573 | calibratedRow | Sources Step — enrich_parcels | parcels.zoning_class | hardcoded literal args (90/85, not a logic var) — IL-11 | PASS/WARN/FAIL |
| 83 | 575 | calibratedRow | Sources Step — enrich_parcels | parcels.max_buildable_footprint_sqm (residential w/ building) | hardcoded literal args (88/75, not a logic var) — IL-11 | PASS/WARN/FAIL |
| 84 | 576 | calibratedRow | Sources Step — enrich_parcels | parcels.max_buildable_gfa_sqm (residential w/ building) | hardcoded literal args (88/75, not a logic var) — IL-11 | PASS/WARN/FAIL |
| 85 | 577 | calibratedRow | Sources Step — enrich_parcels | parcels.max_build_stories (residential w/ building) | hardcoded literal args (88/75, not a logic var) — IL-11 | PASS/WARN/FAIL |
| 86 | 578 | calibratedRow | Sources Step — enrich_parcels | parcels.opt_aor_gfa_sqm (residential w/ building) | hardcoded literal args (88/75, not a logic var) — IL-11 | PASS/WARN/FAIL |
| 87 | 580 | infoRow | Sources Step — enrich_parcels | parcels.bylaw_max_fsi | none (INFO, no threshold) | INFO only |
| 88 | 581 | infoRow | Sources Step — enrich_parcels | parcels.opt_config_confidence | none (INFO, no threshold) | INFO only |
| 89 | 582 | infoRow | Sources Step — enrich_parcels | parcels.opt_coa_gfa_sqm | none (INFO, no threshold) | INFO only |
| 90 | 583 | infoRow | Sources Step — enrich_parcels | parcels.comp_count | none (INFO, no threshold) | INFO only |
| 91 | 584 | infoRow | Sources Step — enrich_parcels | parcels.neighbourhood_id | none (INFO, no threshold) | INFO only |
| 92 | 585 | infoRow | Sources Step — enrich_parcels | parcels.cost_fb_total | none (INFO, no threshold) | INFO only |
| 93 | 586 | infoRow | Sources Step — enrich_parcels | parcels.envelope_constrained (TRUE) | none (INFO, no threshold) | INFO only |
| 94 | 598 | infoRow | Sources Step — enrich_parcels | parcels.envelope_constraint_reason='`${rr.reason}`' — `reasonDist` loop, N dynamic rows/run (Low-confidence item 1) | none (INFO, no threshold) | INFO only |
| 95 | 617 | calibratedRow | Sources Step — compute_parcel_cost_estimates | parcels.parcel_cost_menu (residential w/ building) | hardcoded literal args (85/80, not a logic var) — IL-12 | PASS/WARN/FAIL |
| 96 | 619 | infoRow | Sources Step — compute_parcel_cost_estimates | parcels.parcel_cost_menu (any residential) | none (INFO, no threshold) | INFO only |
| 97 | 983 | infoRow | Step 1 — assert_schema | permits.columns_present | none (INFO, no threshold) | INFO only |
| 98 | 986 | coverageRow | Step 2 — load_permits | permits.permit_type | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 99 | 987 | coverageRow | Step 2 — load_permits | permits.structure_type | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 100 | 988 | coverageRow | Step 2 — load_permits | permits.work | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 101 | 989 | coverageRow | Step 2 — load_permits | permits.street_num | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 102 | 990 | coverageRow | Step 2 — load_permits | permits.street_name | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 103 | 991 | coverageRow | Step 2 — load_permits | permits.street_name_normalized | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 104 | 992 | coverageRow | Step 2 — load_permits | permits.street_type | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 105 | 994 | infoRow | Step 2 — load_permits | permits.street_direction (Bug 2 — naturally sparse) | none (INFO, no threshold) | INFO only |
| 106 | 995 | coverageRow | Step 2 — load_permits | permits.city | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 107 | 996 | coverageRow | Step 2 — load_permits | permits.postal | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 108 | 997 | coverageRow | Step 2 — load_permits | permits.geo_id | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 109 | 999 | infoRow | Step 2 — load_permits | permits.building_type (Bug 2 — naturally sparse) | none (INFO, no threshold) | INFO only |
| 110 | 1000 | infoRow | Step 2 — load_permits | permits.category (Bug 2 — naturally sparse) | none (INFO, no threshold) | INFO only |
| 111 | 1001 | coverageRow | Step 2 — load_permits | permits.application_date | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 112 | 1002 | coverageRow | Step 2 — load_permits | permits.issued_date | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 113 | 1005 | infoRow | Step 2 — load_permits | permits.completed_date (Bug 1 — structural sparsity, active permits) | none (INFO, no threshold) | INFO only |
| 114 | 1006 | coverageRow | Step 2 — load_permits | permits.status | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 115 | 1007 | coverageRow | Step 2 — load_permits | permits.description | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 116 | 1009 | infoRow | Step 2 — load_permits | permits.est_const_cost | none (INFO, no threshold) | INFO only |
| 117 | 1011 | infoRow | Step 2 — load_permits | permits.builder_name (Bug 2 — naturally sparse) | none (INFO, no threshold) | INFO only |
| 118 | 1012 | infoRow | Step 2 — load_permits | permits.owner (Bug 2 — naturally sparse) | none (INFO, no threshold) | INFO only |
| 119 | 1013 | coverageRow | Step 2 — load_permits | permits.dwelling_units_created | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 120 | 1014 | coverageRow | Step 2 — load_permits | permits.dwelling_units_lost | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 121 | 1016 | infoRow | Step 2 — load_permits | permits.ward (Bug 2 — naturally sparse) | none (INFO, no threshold) | INFO only |
| 122 | 1017 | infoRow | Step 2 — load_permits | permits.council_district (Bug 2 — naturally sparse) | none (INFO, no threshold) | INFO only |
| 123 | 1018 | coverageRow | Step 2 — load_permits | permits.current_use | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 124 | 1019 | coverageRow | Step 2 — load_permits | permits.proposed_use | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 125 | 1020 | coverageRow | Step 2 — load_permits | permits.housing_units | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 126 | 1021 | coverageRow | Step 2 — load_permits | permits.storeys | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 127 | 1022 | coverageRow | Step 2 — load_permits | permits.data_hash | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 128 | 1023 | coverageRow | Step 2 — load_permits | permits.raw_json | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 129 | 1024 | coverageRow | Step 2 — load_permits | permits.last_seen_at | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 130 | 1027 | infoRow | Step 3 — close_stale_permits | permits.status (stale total) | none (INFO, no threshold) | INFO only |
| 131 | 1035 | infoRow | Step 3 — close_stale_permits | permits.completed_date | none (INFO, no threshold) | INFO only |
| 132 | 1041 | infoRow | Step 4 — classify_permit_phase | permits.enriched_status | none (INFO, no threshold) | INFO only |
| 133 | 1044 | coverageRow | Step 5 — classify_scope | permits.project_type | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 134 | 1045 | coverageRow | Step 5 — classify_scope | permits.scope_tags | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 135 | 1046 | coverageRow | Step 5 — classify_scope | permits.scope_classified_at | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 136 | 1047 | coverageRow | Step 5 — classify_scope | permits.scope_source | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 137 | 1051 | coverageRow | Step 6 — extract_builders | entities.name_normalized (permit builders) | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 138 | 1053 | coverageRow | Step 6 — extract_builders | entities.legal_name | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 139 | 1054 | coverageRow | Step 6 — extract_builders | entities.permit_count | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 140 | 1055 | coverageRow | Step 6 — extract_builders | entities.entity_type | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 141 | 1056 | coverageRow | Step 6 — extract_builders | entities.last_seen_at | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 142 | 1066 | infoRow | Step 6 — extract_builders | entities.primary_phone (via entities chain — Spec 45) | none (INFO, no threshold) | INFO only |
| 143 | 1067 | infoRow | Step 6 — extract_builders | entities.primary_email (via entities chain — Spec 45) | none (INFO, no threshold) | INFO only |
| 144 | 1068 | infoRow | Step 6 — extract_builders | entities.website (via entities chain — Spec 45) | none (INFO, no threshold) | INFO only |
| 145 | 1073 | externalRow | Step 7 — link_wsib | entities.is_wsib_registered | hardcoded literal (10/5, not a logic var) — IL-8 | PASS/WARN/FAIL |
| 146 | 1075 | externalRow | Step 7 — link_wsib | wsib_registry.linked_entity_id | hardcoded literal (10/5, not a logic var) — IL-8 | PASS/WARN/FAIL |
| 147 | 1076 | coverageRow | Step 7 — link_wsib | wsib_registry.match_confidence | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 148 | 1079 | coverageRow | Step 8 — geocode_permits | permits.latitude | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 149 | 1080 | coverageRow | Step 8 — geocode_permits | permits.longitude | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 150 | 1081 | coverageRow | Step 8 — geocode_permits | permits.location | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 151 | 1082 | coverageRow | Step 8 — geocode_permits | permits.geocoded_at | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 152 | 1086 | coverageRow | Step 9 — link_parcels | permit_parcels.permits_linked | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 153 | 1088 | coverageRow | Step 9 — link_parcels | permit_parcels.match_type (geocoded) | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 154 | 1089 | coverageRow | Step 9 — link_parcels | permit_parcels.confidence (geocoded) | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 155 | 1090 | coverageRow | Step 9 — link_parcels | permit_parcels.linked_at (geocoded) | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 156 | 1093 | coverageRow | Step 9 — link_parcels | parcels.lot_size_sqm (WF2 #4 Surgical Triangle input) | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 157 | 1102 | calibratedRow | Step 9b — enrich_permits | permits.zoning_class | hardcoded literal args (80/75, not a logic var) — IL-3 (DEC-1) | PASS/WARN/FAIL |
| 158 | 1103 | infoRow | Step 9b — enrich_permits | permits.zoning_enriched_at | none (INFO, no threshold) | INFO only |
| 159 | 1104 | infoRow | Step 9b — enrich_permits | permits.bylaw_max_coverage_pct | none (INFO, no threshold) | INFO only |
| 160 | 1105 | infoRow | Step 9b — enrich_permits | permits.bylaw_max_fsi | none (INFO, no threshold) | INFO only |
| 161 | 1106 | infoRow | Step 9b — enrich_permits | permits.bylaw_max_height_m | none (INFO, no threshold) | INFO only |
| 162 | 1107 | infoRow | Step 9b — enrich_permits | permits.exception_number | none (INFO, no threshold) | INFO only |
| 163 | 1108 | infoRow | Step 9b — enrich_permits | permits.applicable_bylaws | none (INFO, no threshold) | INFO only |
| 164 | 1109 | infoRow | Step 9b — enrich_permits | permits.overlay_summary | none (INFO, no threshold) | INFO only |
| 165 | 1110 | infoRow | Step 9b — enrich_permits | permits.zoning_parcel_count | none (INFO, no threshold) | INFO only |
| 166 | 1111 | infoRow | Step 9b — enrich_permits | permits.zoning_dominant_parcel_id | none (INFO, no threshold) | INFO only |
| 167 | 1112 | infoRow | Step 9b — enrich_permits | permits.zoning_dominant_parcel_method | none (INFO, no threshold) | INFO only |
| 168 | 1117 | infoRow | Step 9b — enrich_permits | permits.is_in_ravine_protection_area | none (INFO, no threshold) | INFO only |
| 169 | 1122 | infoRow | Step 9b — enrich_permits | permits.ravine_distance_m | none (INFO, no threshold) | INFO only |
| 170 | 1125 | infoRow | Step 9b — enrich_permits | permits.is_heritage_designated | none (INFO, no threshold) | INFO only |
| 171 | 1126 | infoRow | Step 9b — enrich_permits | permits.heritage_designation_type | none (INFO, no threshold) | INFO only |
| 172 | 1127 | infoRow | Step 9b — enrich_permits | permits.heritage_designation_date | none (INFO, no threshold) | INFO only |
| 173 | 1130 | infoRow | Step 9b — enrich_permits | permits.is_corner_lot | none (INFO, no threshold) | INFO only |
| 174 | 1131 | infoRow | Step 9b — enrich_permits | permits.is_through_lot | none (INFO, no threshold) | INFO only |
| 175 | 1132 | infoRow | Step 9b — enrich_permits | permits.abuts_laneway | none (INFO, no threshold) | INFO only |
| 176 | 1133 | infoRow | Step 9b — enrich_permits | permits.primary_frontage_street_name | none (INFO, no threshold) | INFO only |
| 177 | 1135 | infoRow | Step 9b — enrich_permits | permits.lot_size_confidence | none (INFO, no threshold) | INFO only |
| 178 | 1136 | infoRow | Step 9b — enrich_permits | permits.max_buildable_footprint_sqm | none (INFO, no threshold) | INFO only |
| 179 | 1137 | infoRow | Step 9b — enrich_permits | permits.max_buildable_gfa_sqm | none (INFO, no threshold) | INFO only |
| 180 | 1138 | infoRow | Step 9b — enrich_permits | permits.max_buildable_gfa_basis_fsi | none (INFO, no threshold) | INFO only |
| 181 | 1139 | infoRow | Step 9b — enrich_permits | permits.max_buildable_gfa_basis_coverage_box | none (INFO, no threshold) | INFO only |
| 182 | 1141 | infoRow | Step 9b — enrich_permits | permits.max_buildable_gfa_basis_coverage_only | none (INFO, no threshold) | INFO only |
| 183 | 1142 | infoRow | Step 9b — enrich_permits | permits.max_build_confidence_high | none (INFO, no threshold) | INFO only |
| 184 | 1143 | infoRow | Step 9b — enrich_permits | permits.max_build_confidence_medium | none (INFO, no threshold) | INFO only |
| 185 | 1144 | infoRow | Step 9b — enrich_permits | permits.max_build_confidence_low | none (INFO, no threshold) | INFO only |
| 186 | 1145 | infoRow | Step 9b — enrich_permits | permits.garden_suite_fits | none (INFO, no threshold) | INFO only |
| 187 | 1146 | infoRow | Step 9b — enrich_permits | permits.envelope_constrained | none (INFO, no threshold) | INFO only |
| 188 | 1148 | infoRow | Step 9b — enrich_permits | permits.imagery_roof_footprint_sqm | none (INFO, no threshold) | INFO only |
| 189 | 1149 | infoRow | Step 9b — enrich_permits | permits.imagery_roof_gfa_sqm | none (INFO, no threshold) | INFO only |
| 190 | 1150 | infoRow | Step 9b — enrich_permits | permits.existing_structure_confidence_high | none (INFO, no threshold) | INFO only |
| 191 | 1151 | infoRow | Step 9b — enrich_permits | permits.existing_structure_confidence_low | none (INFO, no threshold) | INFO only |
| 192 | 1152 | infoRow | Step 9b — enrich_permits | permits.existing_greenspace_sqm | none (INFO, no threshold) | INFO only |
| 193 | 1154 | infoRow | Step 9b — enrich_permits | permits.max_newbuild_coa_gfa_sqm | none (INFO, no threshold) | INFO only |
| 194 | 1155 | infoRow | Step 9b — enrich_permits | permits.cur_floor_gfa_sqm | none (INFO, no threshold) | INFO only |
| 195 | 1156 | infoRow | Step 9b — enrich_permits | permits.cur_pot_2story_gfa_sqm | none (INFO, no threshold) | INFO only |
| 196 | 1157 | infoRow | Step 9b — enrich_permits | permits.cur_pot_3story_gfa_sqm | none (INFO, no threshold) | INFO only |
| 197 | 1158 | infoRow | Step 9b — enrich_permits | permits.cur_gfa_range_basis | none (INFO, no threshold) | INFO only |
| 198 | 1159 | infoRow | Step 9b — enrich_permits | permits.cur_est_kitchen_gfa_sqm | none (INFO, no threshold) | INFO only |
| 199 | 1160 | infoRow | Step 9b — enrich_permits | permits.cur_est_bath_gfa_sqm | none (INFO, no threshold) | INFO only |
| 200 | 1162 | infoRow | Step 9b — enrich_permits | permits.max_garage_gfa_sqm | none (INFO, no threshold) | INFO only |
| 201 | 1163 | infoRow | Step 9b — enrich_permits | permits.garage_permission_as_of_right | none (INFO, no threshold) | INFO only |
| 202 | 1164 | infoRow | Step 9b — enrich_permits | permits.garage_permission_coa_required | none (INFO, no threshold) | INFO only |
| 203 | 1166 | infoRow | Step 9b — enrich_permits | permits.opt_config_confidence | none (INFO, no threshold) | INFO only |
| 204 | 1167 | infoRow | Step 9b — enrich_permits | permits.comp_count | none (INFO, no threshold) | INFO only |
| 205 | 1168 | infoRow | Step 9b — enrich_permits | permits.rear_suite_type | none (INFO, no threshold) | INFO only |
| 206 | 1169 | infoRow | Step 9b — enrich_permits | permits.rear_suite_permission_as_of_right | none (INFO, no threshold) | INFO only |
| 207 | 1170 | infoRow | Step 9b — enrich_permits | permits.rear_suite_permission_coa_required | none (INFO, no threshold) | INFO only |
| 208 | 1174 | infoRow | Step 9b — enrich_permits | permits.`${c}` — `COST_PROP_COLS` loop, 15 dynamic rows/run (Spec 88 §2.10, permits-branch twin of row 60) | none (INFO, no threshold) | INFO only |
| 209 | 1181 | coverageRow | Step 10 — link_neighbourhoods | permits.neighbourhood_id | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 210 | 1185 | infoRow | Step 11 — link_massing | parcels.with_centroid | none (INFO, no threshold) | INFO only |
| 211 | 1186 | infoRow | Step 11 — link_massing | parcel_buildings.linked_parcels | none (INFO, no threshold) | INFO only |
| 212 | 1187 | coverageRow | Step 11 — link_massing | parcel_buildings.is_primary | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 213 | 1188 | coverageRow | Step 11 — link_massing | parcel_buildings.structure_type | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 214 | 1189 | coverageRow | Step 11 — link_massing | parcel_buildings.match_type | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 215 | 1190 | coverageRow | Step 11 — link_massing | parcel_buildings.confidence | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 216 | 1191 | coverageRow | Step 11 — link_massing | parcel_buildings.linked_at | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 217 | 1195 | coverageRow | Step 11 — link_massing | building_footprints.footprint_area_sqm (WF2 #4 sibling of `73f3ae68`, IL-13) | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 218 | 1196 | coverageRow | Step 11 — link_massing | building_footprints.max_height_m | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 219 | 1199 | coverageRow | Step 12 — link_similar | permits.scope_tags (non-BLD) | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 220 | 1202 | coverageRow | Step 13 — classify_permits | permit_trades.permits_with_active_trade | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 221 | 1203 | coverageRow | Step 13 — classify_permits | permit_trades.tier | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 222 | 1204 | coverageRow | Step 13 — classify_permits | permit_trades.confidence | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 223 | 1205 | coverageRow | Step 13 — classify_permits | permit_trades.is_active | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 224 | 1206 | coverageRow | Step 13 — classify_permits | permit_trades.phase | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 225 | 1207 | coverageRow | Step 13 — classify_permits | permit_trades.lead_score | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 226 | 1208 | coverageRow | Step 13 — classify_permits | permit_trades.classified_at | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 227 | 1211 | coverageRow | Step 14 — compute_cost_estimates | cost_estimates.permits_covered | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 228 | 1218 | calibratedRow | Step 14 — compute_cost_estimates | cost_estimates.estimated_cost | logic-var (cost_coverage_pass_pct/warn_pct, WF3 F4) — IL-7 | PASS/WARN/FAIL |
| 229 | 1219 | coverageRow | Step 14 — compute_cost_estimates | cost_estimates.cost_source | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 230 | 1220 | calibratedRow | Step 14 — compute_cost_estimates | cost_estimates.cost_tier | logic-var (cost_coverage_pass_pct/warn_pct, WF3 F4) — IL-7 | PASS/WARN/FAIL |
| 231 | 1221 | calibratedRow | Step 14 — compute_cost_estimates | cost_estimates.cost_range_low | logic-var (cost_coverage_pass_pct/warn_pct, WF3 F4) — IL-7 | PASS/WARN/FAIL |
| 232 | 1222 | calibratedRow | Step 14 — compute_cost_estimates | cost_estimates.cost_range_high | logic-var (cost_coverage_pass_pct/warn_pct, WF3 F4) — IL-7 | PASS/WARN/FAIL |
| 233 | 1223 | coverageRow | Step 14 — compute_cost_estimates | cost_estimates.premium_factor | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 234 | 1224 | coverageRow | Step 14 — compute_cost_estimates | cost_estimates.complexity_score | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 235 | 1225 | coverageRow | Step 14 — compute_cost_estimates | cost_estimates.model_version | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 236 | 1226 | coverageRow | Step 14 — compute_cost_estimates | cost_estimates.is_geometric_override | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 237 | 1227 | calibratedRow | Step 14 — compute_cost_estimates | cost_estimates.modeled_gfa_sqm | logic-var (cost_coverage_pass_pct/warn_pct, WF3 F4) — IL-7 | PASS/WARN/FAIL |
| 238 | 1228 | calibratedRow | Step 14 — compute_cost_estimates | cost_estimates.effective_area_sqm | logic-var (cost_coverage_pass_pct/warn_pct, WF3 F4) — IL-7 | PASS/WARN/FAIL |
| 239 | 1229 | coverageRow | Step 14 — compute_cost_estimates | cost_estimates.trade_contract_values | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 240 | 1230 | coverageRow | Step 14 — compute_cost_estimates | cost_estimates.computed_at | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 241 | 1233 | infoRow | Step 15 — compute_timing_calibration_v2 | phase_calibration.rows_with_median | none (INFO, no threshold) | INFO only |
| 242 | 1237 | coverageRow | Step 16 — link_coa | coa_applications.linked_permit_num | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 243 | 1245 | infoRow | Step 18 — refresh_snapshot | data_quality_snapshots.today | none (INFO, no threshold) | INFO only |
| 244 | 1248 | infoRow | Step 19 — assert_data_bounds | permits.duplicate_pks | none (INFO, no threshold) | INFO only |
| 245 | 1251 | infoRow | Step 20 — assert_engine_health | engine_health_snapshots.today | none (INFO, no threshold) | INFO only |
| 246 | 1254 | coverageRow | Step 21 — classify_lifecycle_phase | permits.lifecycle_phase (Bug 3 — unlinked-only denom) | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 247 | 1255 | coverageRow | Step 21 — classify_lifecycle_phase | permits.phase_started_at | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 248 | 1257 | infoRow | Step 21 — classify_lifecycle_phase | permits.lifecycle_stalled | none (INFO, no threshold) | INFO only |
| 249 | 1258 | coverageRow | Step 21 — classify_lifecycle_phase | permits.lifecycle_classified_at | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 250 | 1260 | coverageRow | Step 21 — classify_lifecycle_phase | coa_applications.lifecycle_phase (Bug 3 — unlinked-only denom) | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 251 | 1263 | infoRow | Step 22 — assert_lifecycle_phase_distribution | permits.unclassified_count | none (INFO, no threshold) | INFO only |
| 252 | 1276 | infoRow | Step 23 — compute_trade_forecasts | trade_forecasts.permits_covered | none (INFO, no threshold) | INFO only |
| 253 | 1277 | infoRow | Step 23 — compute_trade_forecasts | trade_forecasts.predicted_start | none (INFO, no threshold) | INFO only |
| 254 | 1278 | infoRow | Step 23 — compute_trade_forecasts | trade_forecasts.urgency (classified) | none (INFO, no threshold) | INFO only |
| 255 | 1280 | coverageRow | Step 23 — compute_trade_forecasts | trade_forecasts.trade_slug | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 256 | 1281 | coverageRow | Step 23 — compute_trade_forecasts | trade_forecasts.target_window | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 257 | 1282 | coverageRow | Step 23 — compute_trade_forecasts | trade_forecasts.confidence | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 258 | 1283 | coverageRow | Step 23 — compute_trade_forecasts | trade_forecasts.calibration_method | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 259 | 1284 | coverageRow | Step 23 — compute_trade_forecasts | trade_forecasts.sample_size | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 260 | 1285 | coverageRow | Step 23 — compute_trade_forecasts | trade_forecasts.median_days | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 261 | 1286 | coverageRow | Step 23 — compute_trade_forecasts | trade_forecasts.p25_days | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 262 | 1287 | coverageRow | Step 23 — compute_trade_forecasts | trade_forecasts.p75_days | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 263 | 1290 | coverageRow | Step 23 — compute_trade_forecasts | trade_forecasts.opportunity_score | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 264 | 1291 | coverageRow | Step 23 — compute_trade_forecasts | trade_forecasts.computed_at | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 265 | 1294 | coverageRow | Step 24 — compute_opportunity_scores | trade_forecasts.opportunity_score (>0) | logic-var (profiling_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL |
| 266 | 1299 | infoRow | Step 25 — update_tracked_projects | tracked_projects.active | none (INFO, no threshold) | INFO only |
| 267 | 1300 | infoRow | Step 25 — update_tracked_projects | lead_analytics.rows | none (INFO, no threshold) | INFO only |
| 268 | 1309 | infoRow | Step 26 — assert_entity_tracing | entity_tracing.last_verdict | none (INFO, no threshold) | INFO only |
| 269 | 1336 | literal-object | — (C6, IL-1) | lead_id_administrative_drift | hardcoded literal (0, mig 138_a+241 invariant) | FAIL/PASS (binary invariant) |
| 270 | 1342 | literal-object | — (C6, IL-1) | lead_id_duplicate_groups | hardcoded literal (0, lead_id uniqueness invariant) | FAIL/PASS (binary invariant) |
| 271 | 1380 | literal-object | — (C3/C7, IL-2) | enriched_status_status_scope_drift | accepted-WARN while > 0 (self-retires at 0) | WARN/INFO conditional pair |
| 272 | 1393 | literal-object | — (C3/C7, IL-2) | enriched_status_status_scope_drift_retighten | machine-observable retighten condition (prose, not yet a structured field) | WARN/INFO conditional pair |
| 273 | 1413 | profileVocabTriple | permits+coa, `VOCAB_COVERAGE` loop (3 entries/run — IL-6) | Step 13 trades / Step 13 products / CoA Step 7 trades vocab (permits+coa only; Step 10 neighbourhoods triple is the 4th array entry but is object-literal-parsed, see `:78`) | logic-var (vocab_coverage_pass_pct/warn_pct) | PASS/WARN/FAIL, or WARN-on-unresolved |

</details>

### G3 verdict

All 4 Fold-A-named fences (C6, C3/C7, DEC-1, DEC-2) are confirmed against `git log`/`blame` with real, existing commits and PROPOSED dispositions from the closed vocabulary. 9 additional non-obvious constants are independently surfaced and blamed (IL-5 through IL-13), including one genuine Rule-3 gap (IL-8, `externalRow`'s 10/5 threshold has no logic var and no `deviations[]` entry) and one cross-file duplication risk (IL-13, `tfd`/`compute-trade-forecasts.js` `SOURCE_SQL`). The 273-row builder census (Ask A1) is generated, not hand-typed, per the plan's recommendation — every disposition and row is `PROPOSED`, awaiting human adjudication per Spec 123 §7.1. **G3: PASS** (every table row carries a disposition-vocabulary term).

---

---

## 3. PH-5 — Seam map (commit 3 → G5)

### 3.0 Correction to §1.4 / §2.2 (found during PH-5 seam mapping — re-measured, not silently fixed)

Two claims in the already-committed §1.4 and §2.2 sections are **wrong** and are corrected here rather than edited in place (Spec 123 conventions — a correction is a new, dated note, not a silent rewrite of a committed finding; mirrors the pattern already live in `docs/reports/defect-ledger.md`, e.g. LM-D6's "Amended 2026-08-28"):

1. **`VOCAB_COVERAGE` has 4 entries, not 3.** Re-counted this session: `node -e "…match(/stepTarget:/g)…"` → **4** — `Step 13 — classify_permits` (trades), `Step 13 — classify_permits (products)`, `CoA Step 7 — classify_coa_trades`, `Step 10 — link_neighbourhoods`. §1.4 ("`:1413` fires **3×**") and §2.2 IL-6 ("3 entries") both undercount by 1; census row 273 (§2.3) is likewise stated as "3 entries/run" and should read **4**. The runtime dynamic-row contribution of the `:1413` static site is **4 rows/run** in permits and coa (excluded from sources), not 3.
2. **The two C6 rows (`:1336`,`:1342`) and the two C3/C7 rows (`:1380`,`:1393`) run in the PERMITS branch only — never in coa.** §1.4's "Mutual exclusivity" paragraph states they run "in the permits and coa branches" — **wrong**. Traced the brace structure precisely this session (`awk` over `:975-985`, `:1298-1312`, `:1401-1416`): the C6/C3 code sits at the SAME 6-space indent as `rows.push(infoRow('Step 1 — assert_schema', …))` (permits branch content), and the `}` at `:1404` (4-space indent) closes the `else { … }` (permits) arm of the `if (isCoaChain) {…} else if (isSourcesChain) {…} else {…}` construct — the SAME brace that opened at the `else {` before "Step 1 — assert_schema". Only the `VOCAB_COVERAGE` loop that follows, textually outside all three branches and gated solely by `if (!isSourcesChain)`, is genuinely shared between permits and coa. The plan's own §1 boundary text (`.cursor/batch1_i1_assert_global_coverage_active_task.md:38`) had this right ("permits branch only" for both pairs) — this session's own §1.4 introduced the error, now corrected.

Both corrections are re-verified against the source directly (line numbers cited) and change no G-score already recorded (G0/G3 stand as PASS; neither correction touches a disposition or a re-measured count that fed a gate).

### 3.1 DB seam

**Two distinct DB access patterns, not one:**

1. **`ctx.pool` (direct):** the 22 `pool.query(...)` call sites enumerated in §1.2, using the step's own pool-borrowed connection per call (no explicit `BEGIN`/transaction — every query is a bare read).
2. **A second, nested DB seam inside the shared library `resolveAndCountTriple`** (`scripts/lib/vocab-coverage.js:38-90`, imported `:30`) — **not visible in the 22-query count above**, because it issues its own queries via a **dedicated borrowed client** (`pool.connect()`, `:52`), wrapped in `BEGIN` / `SET LOCAL statement_timeout = <15000ms default>` / `ROLLBACK` (`:54-55`, `:88`), running **up to 3 statements per triple** (2× `information_schema.columns` type lookups sequentially, `:60-65`, + 1× the intersection-count query, `:73-78`). Called via `profileVocabTriple` (`:170-176`) at 2 static sites: the CoA-only direct call (`:446`, 1 triple) and the shared `VOCAB_COVERAGE` loop (`:1413`, 4 triples per §3.0 correction 1). **Measured per-run DB-statement load from this seam alone:** CoA branch up to `(1+4) × 3 = 15` statements; permits branch up to `4 × 3 = 12` statements; sources branch **0** (loop skipped, `:446` unreachable outside the CoA branch). This sub-seam **never throws** (graceful `{unresolved: reason}` degradation, `:79-83`) — a property the compute conversion must preserve exactly (Spec 122 §5.5 pure-function shape: this library call must still be reachable through `ctx.pool`, not a second implicit pool reference).

### 3.2 Clock seam

**No JS-side clock read** — confirmed again this session (`grep -n "Date.now\|new Date("` → zero hits, matches §1.1 claim). **But 6 SQL-side `NOW()`/`CURRENT_DATE`-relative expressions exist**, all server-evaluated inside `pool.query()` calls (so the clock seam and the DB seam are the same call site here — there is no separate `ctx.clock` need, since nothing computes elapsed time in JS):

| Line | Branch | Expression | Feeds |
|---|---|---|---|
| 286 | CoA | `EXTRACT(days FROM NOW() - MAX(last_seen_at))::int` | `days_since_latest` INFO row (`:342`) |
| 317 | CoA | `issued_date < NOW() - INTERVAL '18 months'` | `aged_pre_permits` — **queried but never read or pushed anywhere** (confirmed by grep: `cm.aged_pre_permits` has zero further references in the file) — a dead SELECT column, flagged for G6 §4 |
| 318 | CoA | `snapshot_date = CURRENT_DATE` | `snapshot_today` INFO row (`:499`) |
| 319 | CoA | `captured_at > NOW() - INTERVAL '25 hours'` | `engine_health_today` INFO row (`:505`) |
| 916 | Permits (`misc`) | `snapshot_date = CURRENT_DATE` | `snapshot_today` INFO row (`:1245`) |
| 918 | Permits (`misc`) | `captured_at > NOW() - INTERVAL '25 hours'` | `engine_health_today` INFO row (`:1251`) |
| 936 | Permits (`tfd`) | `COALESCE(phase_started_at, issued_date, application_date) >= NOW() - INTERVAL '3 years'` | forecast-eligible-permit denominator (feeds `:1276-1294` rows) |

All 6 are **non-determinism inventory items** for the future golden-master capture (commit 5, G1′) — clock-relative, non-pinnable-to-an-exact-value, diff-tolerant by construction. This is a superset of the plan's implicit clock claim ("no `Date.now()`/`new Date(` — confirm at commit 1"), which was correct as far as it went but silent on the SQL-side clock reads; recorded here in full.

### 3.3 Network seam

**None.** Confirmed again (`grep -n "fetch(\|require('http\|axios\|got("` → zero hits). No HTTP egress anywhere in this file.

### 3.4 argv/env seam

**`process.env.PIPELINE_CHAIN`** (`:97-98`) — the sole argv/env input, read twice to derive `isCoaChain`/`isSourcesChain`. This is the ONE seam requiring real conversion design work (plan §3 row 3): today's `if/else if/else` branch selection must become the library's chain-derived `ctx.checks` scoping — three near-disjoint `checks[].chains` sets (permits/coa/sources), not `assert_schema`'s overlapping-subset precedent.

### 3.5 Producer/consumer seams — which converted steps' outputs this step reads (measured, not assumed)

**⚠️ Correction to the plan's own framing.** The plan's Low-confidence item 4 / this session's task brief both frame this as "likely none load-bearing." **That is wrong, measured against the 9 converted-step descriptors' own `outputs.writes[].table` declarations** (`node -e` reading each `scripts/*.descriptor.json` / `scripts/quality/assert-schema.descriptor.json` this session):

| Converted step | Declares writes to | Read by `assert_global_coverage`? |
|---|---|---|
| `assert_schema` | (none — Observer, ASSERT profile) | n/a |
| `load_ravines` | `ravines` | **No** — `ravines` is not among the 23 tables read (§1.1 claim 6) |
| `link_massing` | `parcel_buildings` | **Yes** — query site 13 (`pb`, `:825`) |
| `link_wsib` | `wsib_registry`, `entities` | **Yes** — query sites 10 (`ea`, `:775`) and 12 (`wa`, `:806`), plus the `bnd` join (site 11) |
| `link_parcel_addresses` | `parcel_address_points` | **No** — not among the 23 tables read |
| `compute_centroids` | `parcels` | **Yes** — query sites 5 (`pp`), 6 (`mbc`), 7 (`reasonDist`), 8 (`pcm`), plus the `misc` cross-table subselects |
| `link_parcels` | `permit_parcels`, `permits` | **Yes** — `permit_parcels` in `misc` (site 16); `permits` is the single most-read table in the file (sites 9, 11, 21, 22, plus `misc`'s duplicate-PK self-check) |
| `refresh_snapshot` | `data_quality_snapshots` | **Yes** — query site 3 (`cm`) and `misc` (site 16) |
| `enrich_parcels` | `parcels`, `enrich_parcels_pass3_scope` | **Yes** — same `parcels` sites as `compute_centroids` above (both write different `parcels` columns; `assert_global_coverage` reads the union) |

**6 of the 9 already-converted steps are load-bearing producers for this step's reads** — `link_massing`, `link_wsib`, `compute_centroids`, `link_parcels`, `refresh_snapshot`, `enrich_parcels`. This matters directly for the golden-master capture (commit 5): a re-run of any of those 6 steps between PRE and POST captures changes this step's own output, which is exactly the kind of cross-step coupling the differential gate (G8) must be able to attribute correctly rather than misreading as a behaviour regression in THIS conversion.

### 3.6 Downstream consumer — `src/components/FreshnessTimeline.tsx`

Confirmed this session (`grep -n "metric\|audit_table\|assert_global_coverage"`): the admin renderer keys this step by slug at `:98` (`assert_global_coverage: { name: 'Global Coverage Profile', group: 'quality' }`) and reads its `records_meta.audit_table` generically through the **legacy metric-row path** (`:1288-1310`, `:1196-1253`) — iterating `at.rows` by `r.metric`/`r.value`/`r.threshold`/`r.status`, with `at.phase`/`at.name`/`at.verdict` read at the table level. **No metric-string is hardcoded for this step** in the renderer (unlike `funnelSrc.auditMetric`-style special cases elsewhere in the same file for other steps) — the contract is purely structural: `{metric, value, threshold, status}` rows under `phase: 111, name: 'Global Data Completeness Profile'`. One naming nuance worth recording: a comment at `:1283` ("Columnar format (assert-global-coverage): has `columns` string[]") names this step as the HISTORICAL example of the branch condition (`'columns' in atRaw`), but the step's own emitted shape (`:1434-1440` in the source file) carries no `columns` key — it takes the "Legacy metric-row format" branch, confirmed by direct comparison of the two shapes. Not a defect; the comment is a stale label on a branch-check that still functions correctly for any step (this one included) whose payload lacks `columns`.

### Seam-map verdict (G5)

DB seam: 2 named (direct `ctx.pool` + the nested `resolveAndCountTriple` sub-seam). Clock seam: named (SQL-side only, 6 sites, folded into the DB seam call sites — no standalone JS clock). Network seam: named (none). argv/env seam: named (`PIPELINE_CHAIN`). All four required seam categories are present with a stated finding. **G5: PASS.**

---

*Report continues — PH-6 classification + defect ledger (commit 4).*
