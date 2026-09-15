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

Per Spec 123 §7.1 role split: **a human adjudicates; the agent discovers and cites evidence only.** Every row below originally carried `PROPOSED (adjudication pending — Spec 123 §7.1 discoverer ≠ adjudicator)`; **RULED (2026-09-11)** — see §2.4 Adjudication for the operator-delegated adjudicator's rulings, recorded verbatim, and the full disposition-cell updates below. Dispositions are drawn from the closed vocabulary: `preserved-in-runner` / `preserved-in-validator` / `preserved-in-compute` / `encoded-as-descriptor-field` / `encoded-as-deviation` / `knowingly-retired`.

### 2.1 The four fences named by Fold A item 4 — confirmed via `git log -1 --format="%H %s" <sha> -- scripts/quality/assert-global-coverage.js` this session (§1.1 claim 15)

| # | Fence | Blame commit | Subject | Evidence in the current file | Disposition — RULED 2026-09-11 (§2.4) |
|---|---|---|---|---|---|
| IL-1 | **C6** — `lead_id_administrative_drift` + `lead_id_duplicate_groups` (`:1311-1342`) | `5ef51de7` | `fix(42_chain_coa): C6 - trg_permits_lead_id was column-scoped to the wrong columns` | The file's own comment block (`:1311-1320`) names migration 138_a's silent trigger-scope gap, migration 241's re-scope+repair, and the SECOND drift path (`permit_type_classifications` reclassification, invisible to any trigger) these two rows exist specifically to catch. Both are always-on, FAIL-on-nonzero, permits-branch-only. | **RULED — ACCEPT: preserved-in-compute** — each row becomes its own declared `checks[]` entry, `why` citing migration 138_a/241 + commit `5ef51de7`; threshold `0`, `severity: FAIL`, `when: always` (no logic var — a schema invariant, not a coverage tunable, correctly excluded from Rule 3's logic-var requirement per the "constant vs config" distinction Spec 124 draws). IL-1 ACCEPT: C6 `0` = physical invariant, §8 carve-out; Rule 4 satisfied via `checks[].why` citing mig 138_a/241 + `5ef51de7`. |
| IL-2 | **C3/C7** — `enriched_status_status_scope_drift` + `_retighten` pair (`:1349-1401`) | `5ec3523a` (C3, backfill), `50837ef4` (C7, root-cause writer-invalidation fix) | `feat(44_chain_deep_scrapes): C3 - backfill smeared enriched_status + standing drift guard`; `feat(44_chain_deep_scrapes): C7 - status-writer invalidation for enriched_status (the root-cause fix)` | The comment block (`:1349-1373`) explains WHY this pair is WARN+self-retiring rather than C6's FAIL-on-nonzero: C7 closed the regeneration path at 4 named writer sites, so post-C7 the metric is *expected* to read 0 — a WARN shape lets a future 5th writer redden the count without hard-failing on a value that may still be draining historical residue. Modelled on `acceptedBaselineRows` shape but hand-rolled (COUNT retiring downward vs that helper's percentage retiring upward) — an explicit divergence the comment defends. | **RULED — ACCEPT: preserved-in-compute** — conditional check pair (`emit only if driftRows > 0`), `why` citing Spec 48 §4.9 + the 4 named writer sites + commits `5ec3523a`/`50837ef4`; the retighten condition (`:1396-1400`) is itself machine-observable text that should become a structured `retighten_when` descriptor field (mirrors `link_massing`'s `LM-D6` precedent, `docs/reports/defect-ledger.md`), not free prose. IL-2 ACCEPT. |
| IL-3 | **DEC-1** — `zoning_class` calibrated 80/75 threshold (CoA `:360`, permits `:1102`) | `3ab4fa83` | `fix(49_data_completeness): profile zoning enrichment coverage (#406)` | Comment `:355-356` / `:1096-1098`: "gated headline (DEC-1: PASS >= 80 / WARN >= 75, restores the regression net F-H12 would otherwise be the only source of)". | **RULED — CHANGE-TO: encoded-as-descriptor-field, value sourced from a NEW `logic_variables` pair** via `checks[].limit_from_config` — Rule 3 has no per-field exemption, so the 80/75 literal (2 call sites: CoA `:360`, permits `:1102`) is NOT a bare descriptor literal as originally proposed. IL-3 CHANGE-TO: new logic-var pair `zoning_class_coverage_pass_pct`/`zoning_class_coverage_warn_pct` = 80/75 (one pair, two call sites), declared at commit 7 (§2.4). |
| IL-4 | **DEC-2** — `Step 9b` / `CoA Step 4b` insert-after label convention, full renumber deferred as `#405` | same commit, `3ab4fa83` | (see IL-3) | `docs/specs/01-pipeline/49_data_completeness_profiling.md:170,194` confirms `#405` is a **separately-tracked cosmetic item**, not resolved by this or any later commit touching this file (re-confirmed live this session — no commit since `3ab4fa83` touches the label strings). | **RULED — ACCEPT: preserved-in-compute, labels copied VERBATIM** (Fold A item 3, binding) — the row-builder census below (§2.2) carries every `Step 9b`/`CoA Step 4b` label unmodified into `checks[].expect.step_target` (commit 7, `scripts/lib/assert-global-coverage-fields.js` `stepTarget` field); #405's full renumber stays out of scope for this conversion. IL-4 ACCEPT: labels verbatim in `checks[]`, #405 out of scope. |

### 2.2 Additional non-obvious constants/thresholds found independently this session (`git log -S`, not named by Fold A)

| # | Construct | Blame commit | Subject | Disposition — RULED 2026-09-11 (§2.4) |
|---|---|---|---|---|
| IL-5 | `profiling_coverage_pass_pct`/`warn_pct` — the global 90/70 gate (114 `coverageRow` calls, §1.4) | `2c6efadb` (creation), `90a49329` (later realignment) | `feat(49_data_completeness_profiling): WF1 — global field-level coverage profile for permits + CoA chains`; `fix(49_data_completeness_profiling): WF3 — CQA threshold alignment post zombie-gate` | **RULED — ACCEPT: encoded-as-descriptor-field** — already a registered logic var (§1.3); Rule 3 compliant as-is. IL-5 ACCEPT (already registered var). |
| IL-6 | `vocab_coverage_pass_pct`/`warn_pct` + the `VOCAB_COVERAGE` static array (3 entries, `:71-79`) | `596d309b` | `feat(49_data_completeness_profiling): vocabulary-coverage profiling` | **RULED — ACCEPT: encoded-as-descriptor-field** — already a registered logic var; the array's entries (corrected to 4, not 3 — §3.0 correction 1) become named `checks[]` (or one parameterised check, `sharing.varies_by_chain` — Low-confidence item 3 in the plan, unresolved until this census exists). IL-6 ACCEPT (already registered var). |
| IL-7 | `cost_coverage_pass_pct`/`warn_pct` — WF3 F4's scoped 55/50 floor for Step-14 `cost_estimates` rows (6 `calibratedRow` calls, corrected census §2.3) | `4442fb75` | `feat(83_lead_cost_model): archetype-based project cost for permits + CoA + WF3 hardening` | **RULED — ACCEPT: encoded-as-descriptor-field** — already a registered logic var (§1.3); the WF3 F4 rationale comment (`:1212-1217`, "these rows use the recalibrated cost floor via calibratedRow, NOT the global 90% gate") should become the check's `why`. IL-7 ACCEPT (already registered var). |
| IL-8 | `externalRow`'s hardcoded 10/5 threshold (2 calls: `is_wsib_registered`, `wsib_registry.linked_entity_id`) | `6e1b7df4` | `fix(49_data_completeness_profiling): WF3 — exhaustive 8-denominator field profile rewrite` | **RULED — CHANGE-TO: registered logic var** — not currently a logic var (Rule 3 gap: two scraper-sourced-field thresholds live only as JS literals `10`/`5`, `:127-128`); was the clearest Rule-3 violation in the file, no `deviations[]` entry existed to excuse it. IL-8 CHANGE-TO: new logic-var pair `external_coverage_pass_pct`/`external_coverage_warn_pct` = 10/5 (call sites `:1073`,`:1075`), declared at commit 7 (§2.4). |
| IL-9 | CoA `neighbourhood_id` calibrated 95/90 | `f319300a` | `feat(49_data_completeness): report coa_applications.neighbourhood_id coverage` | **RULED — CHANGE-TO: registered logic var** — per-field literal, same Rule-3 gap as IL-3, resolved the same way. IL-9 CHANGE-TO: new logic-var pair `coa_neighbourhood_coverage_pass_pct`/`coa_neighbourhood_coverage_warn_pct` = 95/90 (`:352`), declared at commit 7 (§2.4). |
| IL-10 | CoA `structure_type` calibrated 45/35 (description-classifier ceiling ~52%, `:436-438`) | `b02e2366` | `feat(42_chain_coa): CoA structure_type dwelling-use classifier (description → Spec 83 §3.A vocab)` | **RULED — CHANGE-TO: registered logic var** — comment explicitly defends the recalibration off a would-be-permanent-false-FAIL 80% target; `why` text already exists verbatim in source. IL-10 CHANGE-TO: new logic-var pair `coa_structure_type_coverage_pass_pct`/`coa_structure_type_coverage_warn_pct` = 45/35 (`:439`), declared at commit 7 (§2.4). |
| IL-11 | Sources-chain calibrated thresholds: `zoning_class` 90/85, `max_buildable_footprint_sqm`/`gfa_sqm`/`max_build_stories`/`opt_aor_gfa_sqm` 88/75 (residential-with-building scoped) | `d72ce2ff` (zoning_class), `1f8ca38a` (max-build block) | `feat(49_data_completeness_profiling): parcels-table coverage profile in the sources chain [WF3]`; `feat(43_chain_sources): sources-chain honesty gates — GIS floors, scoped max-build coverage, enrich --full, link-rate + order pins` | **RULED — CHANGE-TO: registered logic var for the thresholds; ACCEPT the `has_bldg EXISTS` scoping as a declared guard** — the guard pattern (§1.2 site 6) is load-bearing (excludes building-less lots from both numerator and denominator) and must travel with the check as a declared `guard`, not just the threshold. IL-11 CHANGE-TO: new logic-var pairs `sources_zoning_class_coverage_pass_pct`/`_warn_pct` = 90/85 (`:573`) and `sources_maxbuild_coverage_pass_pct`/`_warn_pct` = 88/75 (4 checks, `:575-578`, each keeping its own `has_bldg` guard), declared at commit 7 (§2.4). |
| IL-12 | `parcel_cost_menu` calibrated 85/80 (residential-with-building scoped) | `8a3a3644` | `feat(88_parcel_cost_model): P1 — parcel renovation cost model (engine + Mutator + §4D propagation + Spec 49)` | **RULED — CHANGE-TO: registered logic var**, same `has_bldg` guard note as IL-11 (guard preserved). IL-12 CHANGE-TO: new logic-var pair `parcel_cost_menu_coverage_pass_pct`/`parcel_cost_menu_coverage_warn_pct` = 85/80 (`:617`), declared at commit 7 (§2.4). |
| IL-13 | `tfd` query (`:927-936`) **duplicates** `SOURCE_SQL` from `scripts/compute-trade-forecasts.js` — the file's own comment (`:929`) states this explicitly ("Mirrors SOURCE_SQL in compute-trade-forecasts.js exactly") | (comment is self-documenting; not independently blamed this session — low priority) | — | **RULED — ACCEPT: knowingly-retired is NOT appropriate here** (the duplication is live and load-bearing) — flagged instead as a **G6 DEFECT candidate** (§4): a cross-file SQL duplication with no shared source of truth is exactly the drift class the WF2 #4 `fetchLeadInspect` bug (commit `73f3ae68`, cited at `:823`) already burned this file once — `pb`/`bf` JOIN columns drifted from the lead-inspector's own copy until a sibling fix caught it. IL-13 ACCEPT: this is a G6 defect (recorded as AGC-D4, §4.3), not a disposition. |

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

All 4 Fold-A-named fences (C6, C3/C7, DEC-1, DEC-2) are confirmed against `git log`/`blame` with real, existing commits and PROPOSED dispositions from the closed vocabulary. 9 additional non-obvious constants are independently surfaced and blamed (IL-5 through IL-13), including one genuine Rule-3 gap (IL-8, `externalRow`'s 10/5 threshold has no logic var and no `deviations[]` entry) and one cross-file duplication risk (IL-13, `tfd`/`compute-trade-forecasts.js` `SOURCE_SQL`). The 273-row builder census (Ask A1) is generated, not hand-typed, per the plan's recommendation — every disposition and row was `PROPOSED` at commit 4, awaiting human adjudication per Spec 123 §7.1; **adjudicated 2026-09-11, §2.4 below**. **G3: PASS** (every table row carries a disposition-vocabulary term).

### 2.4 Adjudication (Spec 123 §7.1 — separate party, 2026-09-11)

Per Spec 123 §7.1, the agent pass (commit 4, §2.1/§2.2 above) discovers and proposes only; a human adjudicates. The following rulings are the **operator-delegated adjudicator's**, not this session's — recorded here verbatim as delivered, and applied to the IL-1…IL-13 table rows above (§2.1, §2.2) by changing each row's disposition cell from `PROPOSED` to `RULED (2026-09-11)`, with the outcome inline.

**Rulings, verbatim:**

- **IL-1 ACCEPT** (C6 `0` = physical invariant, §8 carve-out; Rule 4 via `checks[].why` citing mig 138_a/241 + `5ef51de7`)
- **IL-2 ACCEPT**
- **IL-3 CHANGE-TO** encoded-as-descriptor-field with the value sourced from a NEW `logic_variables` pair via `checks[].limit_from_config` (Rule 3 has no per-field exemption)
- **IL-4 ACCEPT** (labels verbatim, #405 out of scope)
- **IL-5/6/7 ACCEPT** (already registered vars)
- **IL-8/9/10 CHANGE-TO** registered logic var
- **IL-11/12 CHANGE-TO** registered var for the thresholds, ACCEPT the `has_bldg EXISTS` scoping as a declared guard
- **IL-13 ACCEPT** (G6 defect, not a disposition)

**Tunables to declare at commit 7 (14 new `logic_variables`, 7 pairs)** — each cited line re-verified this session (`sed -n`, below) against `scripts/quality/assert-global-coverage.js` at the current HEAD, and each holds exactly as cited:

| # | Pair | Value (pass/warn) | Call site(s) | Re-verified |
|---|---|---|---|---|
| 1 | `zoning_class_coverage_pass_pct`/`_warn_pct` | 80/75 | CoA `:360` + permits `:1102` (one pair, two call sites — DEC-1/IL-3) | `sed -n '360p;1102p'` → both confirmed, literal args `80, 75` at each site |
| 2 | `coa_neighbourhood_coverage_pass_pct`/`_warn_pct` | 95/90 | CoA `:352` (IL-9) | `sed -n '352p'` → confirmed, literal args `95, 90` |
| 3 | `coa_structure_type_coverage_pass_pct`/`_warn_pct` | 45/35 | CoA `:439` (IL-10) | `sed -n '439p'` → confirmed, literal args `45, 35` |
| 4 | `sources_zoning_class_coverage_pass_pct`/`_warn_pct` | 90/85 | Sources `:573` (IL-11) | `sed -n '573p'` → confirmed, literal args `90, 85` |
| 5 | `sources_maxbuild_coverage_pass_pct`/`_warn_pct` | 88/75 | Sources `:575-578`, 4 checks, each keeping its own `has_bldg` guard (IL-11) | `sed -n '575,578p'` → all 4 confirmed, literal args `88, 75` at each |
| 6 | `parcel_cost_menu_coverage_pass_pct`/`_warn_pct` | 85/80 | Sources `:617`, guard preserved (IL-12) | `sed -n '617p'` → confirmed, literal args `85, 80` |
| 7 | `external_coverage_pass_pct`/`_warn_pct` | 10/5 | Permits `:1073`,`:1075` (IL-8) | `sed -n '1073p;1075p'` → both confirmed `externalRow(...)` call sites; the `10`/`5` thresholds themselves are the shared `externalRow` function body's literals (`:127-128`), not per-call args — re-verified: `grep -n "function externalRow" -A6` → `pct >= 10 ? 'PASS' : pct >= 5 ? 'WARN'` |

**Ledger row status:** every IL-1…IL-13 row in §2.1/§2.2 above is changed from `PROPOSED` to `RULED (2026-09-11)` in place, with the outcome (ACCEPT or CHANGE-TO + new var names) recorded inline in that row's disposition cell. No row remains `PROPOSED`.

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

---

## 4. PH-6 — Classification (commit 4 → G6)

Every behaviour below is CONTRACT (must survive conversion unchanged), INCIDENTAL (implementation detail, no assertion needed), or DEFECT (a real bug, pinned per Spec 123 §3.1 — fixed after conversion, never silently during it). Every DEFECT gets an `AGC-D<n>` row in `docs/reports/defect-ledger.md`, status `PIN`.

### 4.1 CONTRACT — must survive conversion

- Non-halting verdict semantics: WARN/FAIL rows never throw; only the single `:86` logic-var-validation `throw new Error` is infrastructure-halting (§1.5).
- The 3-branch chain scoping (`isCoaChain`/`isSourcesChain`/else-permits), including which rows are shared (`VOCAB_COVERAGE`, corrected to 4 entries — §3.0) vs branch-exclusive (C6/C3, permits-only — §3.0 correction 2).
- All 6 logic-var-backed thresholds (§1.3) and their 3 cross-field `.refine()` ordering invariants (`warn < pass` ×2, `warn <= pass` ×1).
- The C6 lead-id-integrity FAIL invariant (migration 138_a/241, IL-1) and the C3/C7 self-retiring WARN+INFO drift pair (Spec 48 §4.9, IL-2) — both load-bearing regression fences, both require both-directions G4d locks at commit 6.
- The `{metric, value, threshold, status}` row shape and the `{phase:111, name:'Global Data Completeness Profile', verdict, rows}` `audit_table` envelope — the `FreshnessTimeline.tsx` consumer contract (§3.6), proven byte-identical by the zero-unexplained-diff golden gate (G8), not by a separate UI test.
- The `has_bldg EXISTS(...)` residential-with-building scoping pattern behind 5 calibratedRow checks (IL-11/IL-12) — excludes building-less lots from BOTH numerator and denominator; must travel with its check as a declared `guard`, not just the raw threshold.
- `records_total: 1` (always, per the file's own header comment `:16`) on a successful run — the ASSERT-archetype "one audit pass, never an entity count" convention, forced `outputs:"none"` by the archetype profile (plan §2).
- All 6 SQL-side clock-relative expressions (§3.2) — non-determinism-inventory items the golden master (commit 5) must declare, not eliminate.

### 4.2 INCIDENTAL — implementation detail, no assertion needed

- The exact grouping into 6 named JS helper functions (`coverageRow`/`infoRow`/`calibratedRow`/`externalRow`/`vocabRow`/`profileVocabTriple`) — the compute-shape conversion is free to restructure these into a dispatch table (Spec 122 §5.5) as long as the PASS/WARN/FAIL math (§1.4) is preserved per check.
- Variable naming (`ca`/`cx`/`cm`/`pa`/`ea`/`bnd`/`wa`/`pb`/`pt`/`ce`/`misc`/`tfd`/`tfa`/`pSchema`/`pp`/`mbc`/`pcm`) — purely local, no external contract.
- The `mbc`/`pcm` queries each independently re-deriving the same "residential parcel with a building" `EXISTS` subquery (§3.6 sources-branch note) rather than sharing one CTE — a minor redundant-computation detail, not a correctness issue (two separate COUNT aggregates over the same predicate, same result either way).
- Comment-level citations (`Bug 1`-`4`, `F2`, `WF2 #4`, `WF2 #415`, `WF3 #406`/`#428`, `DEC-B`) that document denominator CHOICES already reflected correctly in the SQL — historical rationale, not independently testable behaviour beyond the denominator itself (which IS covered under the relevant CONTRACT row).

### 4.3 DEFECT — pin in current form, fix after (Spec 123 §3.1)

| Ledger ID | Anchor | One-line | Disposition |
|---|---|---|---|
| **AGC-D1** | `src/tests/assert-global-coverage.infra.test.ts:8` (docblock), `:184`, `:199` (test-title prose) | Stale chain-length claims — docblock says "permits chain = 28 steps, coa chain = 12 steps" and the two test titles say "step 29"/"step 15"; **all wrong** vs the measured 33/16/28 (§1.1 claim 3). **Lives ONLY in the test file, confirmed by direct read of the script** — `scripts/quality/assert-global-coverage.js` contains zero hard-coded chain-length literals (§1.1 claim 12). The live `toHaveLength(33)`/`toHaveLength(16)`/`toHaveLength(28)` assertions themselves are current and passing. | Test-file documentation drift, not a script defect — the two-way disposition is DEFECT-in-test / CONTRACT-in-script. |
| **AGC-D2** | `docs/specs/01-pipeline/49_data_completeness_profiling.md:18-19` | Spec 49 §2 architecture text says "Permits chain: step 26 (last step...)" / "CoA chain: step 10 (last step...)" — both wrong vs measured position 32-of-33 (permits, NOT last) / 16-of-16 (coa, IS last) (§1.1 claim 13). | Documentation-only, deferred to commit 9 per the plan's Ask A3 (ruled) — rides the conversion's own required spec-diff, not fixed here. |
| **AGC-D3** | `scripts/quality/assert-global-coverage.js:120-131` (`externalRow`), 2 call sites `:1073`,`:1075` | `externalRow`'s PASS≥10%/WARN≥5% threshold is a bare JS literal, never promoted to a `logic_variables` entry and carrying no `deviations[]` justification — the clearest live Rule 3 (Spec 124 §2) gap in the file (IL-8). | Fix-after: register `assert_global_coverage_external_field_pass_pct`/`_warn_pct` (or fold `externalRow` into `calibratedRow`'s per-check-declared-limit shape at conversion, since both are per-field literal thresholds structurally). |
| **AGC-D4** | `scripts/quality/assert-global-coverage.js:927-936` (`tfd`) vs `scripts/compute-trade-forecasts.js` `SOURCE_SQL` | The `tfd` query's own comment (`:929`) admits it "mirrors `SOURCE_SQL` in `compute-trade-forecasts.js` exactly" — a hand-maintained cross-file SQL duplication with no shared source of truth (IL-13). This is the SAME drift class that already bit this file once (the WF2 #4 `fetchLeadInspect` sibling-fix, commit `73f3ae68`, cited at `:823`, `:1195-1196`). | Fix-after: extract `SOURCE_SQL` into a shared `scripts/lib/` fragment both files import, or accept the duplication explicitly with a cross-reference test pinning both copies equal. |
| **AGC-D5** | `scripts/quality/assert-global-coverage.js:317` (`aged_pre_permits`) | The `cm` query computes `aged_pre_permits` (permits older than 18 months still `PRE-%`) but the value is **never read or pushed anywhere** — confirmed by grep, zero further references to `cm.aged_pre_permits` in the file. Dead SELECT column: wasted computation, zero behaviour impact. | Fix-after: either wire it into an `infoRow` (it reads as an intentional, still-useful metric per its own naming) or delete the SELECT expression — either is a trivial, behaviour-changing peel, correctly deferred out of this conversion. |
| **AGC-D6** | `scripts/quality/assert-global-coverage.js:1418-1420` | Hand-rolled verdict cascade (`rows.some(FAIL) ? 'FAIL' : rows.some(WARN) ? 'WARN' : 'PASS'`) duplicates `scripts/lib/step/verdict.js`'s `deriveVerdict(rows)`, already the shared, converted-fleet-wide implementation of the identical row-derived cascade (matches the `assert_schema` precedent, `AS-D1`/`AS-D1b`). | Fix-after: the descriptor+compute conversion (commit 7) adopts the library's `deriveVerdict` directly, retiring the local copy — mirrors `AS-D1`/`AS-D1b` exactly. |
| **AGC-D7** | `scripts/quality/assert-global-coverage.js:1447-1463` | Lock-contention skip hand-rolls its own `emitSummary({records_total:0, records_meta:{skipped:true, reason:'lock_held', advisory_lock_id}})` with **no `audit_table` at all** — not the shared `skipRecordsMeta`/`RUN_STATUS.SELF_SKIPPED` shape the plan's WD-1/A3 (`sharing.on_contention: "self_skip"`) ruling names as the target state (matches `AS-D9`/`LR-D6` precedent — both closed the identical gap for their own steps at conversion). | Fix-after: library adoption at commit 7 emits the declared `lock_held_elsewhere` terminal with a proper row-derived `audit_table`, mirroring `assert_schema`'s post-conversion shape. |

### 4.4 Defect ledger — recorded this commit

Appended to `docs/reports/defect-ledger.md` (7 rows, `AGC-D1`-`AGC-D7`, all `PIN`; ID scheme + column format matches the file's own header).

### G6 verdict

Every behaviour in the file is classified CONTRACT, INCIDENTAL, or DEFECT. 7 DEFECTs found, every one carries an `AGC-D<n>` ledger row with status `PIN` (fix deferred past conversion, per Spec 123 §3.1 — none silently fixed here). The two chain-length literals named by the task brief are confirmed to live only in the pre-existing test file (AGC-D1), never in the script — the script itself carries zero hard-coded chain-length literals. **G6: PASS** (every DEFECT has a ledger ID; `LEDGER_STATUS_VOCAB` — `CLOSED`/`PIN` — satisfied by all 7 new rows).

---

---

## 5. Non-determinism inventory (commit 5 → G1′; Spec 120 §14.2, claim #151/#151a)

Declared BEFORE any capture is taken, per Spec 120 §14.2 and the pilot 1 precedent (`docs/reports/2026-08-25-pilot1-assert-schema-assessment.md` §5). Closed vocabulary: `must-match-exactly | normalize-then-match | excluded-with-reason`.

### 5.1 Harness-standard volatiles (mirrors pilot 1 exactly — `VOLATILE_KEYS`/`VOLATILE_METRIC_PREFIXES`/`VOLATILE_PATTERNS`, `scripts/analysis/capture-step-golden.js:84-116`)

| Key/pattern | Disposition | Reason |
|---|---|---|
| `key:pipeline_runs[*].id` | `excluded-with-reason` | serial PK |
| `key:pipeline_runs[*].started_at` / `.completed_at` | `excluded-with-reason` | wall clock `NOW()` |
| `key:pipeline_runs[*].duration_ms` | `excluded-with-reason` | elapsed |
| `key:chain_run_id` | `excluded-with-reason` | per-invocation correlation key (R-U, `scripts/lib/step/index.js`) — this step is pre-conversion so it does not yet emit one itself, but the harness's own `VOLATILE_KEYS` list strips it wherever present (e.g. inside a `pipeline_runs` row read from another step) |
| `row:sys_duration_ms` / `row:sys_velocity_rows_sec` | `excluded-with-reason` | `VOLATILE_METRIC_PREFIXES` `sys_` — not emitted by this step's own rows (it has no `sys_*` metric), but the harness scrub is unconditional |
| `pattern:duration_literal` | `normalize-then-match` | banner "=== ... (Ns) ===" / any `Ns`/`Nms` text → `<DUR>` |
| `pattern:iso_timestamp` / `pattern:pg_timestamp` | `normalize-then-match` | harness-wide; not expected to hit (no raw ISO/pg timestamp is pushed as a row value in this file — dates feed only the 6 SQL-side expressions in §5.2 below, none of which emit a literal timestamp string) |
| `pattern:rows_per_sec` / `pattern:run_id_literal` / `pattern:pipeline_runs_id_literal` / `pattern:pid_literal` | `normalize-then-match` | harness-wide; not expected to hit |
| `exit_code` · `signal` · `verdict` · `summary_count` · `parse_errors` | `must-match-exactly` | the step's contract |
| `summary.records_meta.audit_table.{phase,name,verdict,rows[!sys_]}` | `must-match-exactly` | C11 (§4.1); `rows` order preserved, compared after the `sys_` strip (none expected) |
| `meta.reads` / `meta.writes` | `must-match-exactly` | pre-conversion `emitMeta({}, {})` — both empty maps (§1.5); a non-empty value post-conversion is a declared diff, not normalised away |
| `ledger_status` | `must-match-exactly` | `[]` in-chain, `['completed']` on the standalone capture |
| `stdout` (after patterns) · `stderr` | `must-match-exactly` | per-check console lines are INCIDENTAL (§4.2) but stable; a diff here is reviewed, not masked |

### 5.2 This step's own SQL-side clock reads — 6 sites (§3.2), grep-verified this session (`grep -noE "NOW\(\)|CURRENT_DATE|INTERVAL '"`)

None of these are `Date.now()`/`new Date(` (confirmed zero JS-side clock reads, §1.1/§3.2) — all 6 are server-evaluated inside a `pool.query()` call, so the volatility surfaces only in the resulting row **values**, not as a raw timestamp string (the harness's `pattern:iso_timestamp`/`pattern:pg_timestamp` masks would not even fire on these). Each is `excluded-with-reason` at the level of the metric it feeds:

| Line | Branch | Expression | Metric(s) it feeds | Disposition |
|---|---|---|---|---|
| `:286` | CoA | `EXTRACT(days FROM NOW() - MAX(last_seen_at))::int` | `days_since_latest` (INFO row, `:342`) | `excluded-with-reason` — value drifts by wall-clock day boundary between PRE and POST |
| `:317` | CoA | `issued_date < NOW() - INTERVAL '18 months'` | `aged_pre_permits` — **queried but never pushed as a row** (AGC-D5, dead SELECT column) | `excluded-with-reason` in principle; **not observable** in any captured row today, so it cannot actually cause a diff — recorded for completeness only |
| `:318` | CoA | `snapshot_date = CURRENT_DATE` | `snapshot_today` (INFO row, `:499`) | `excluded-with-reason` — flips at local midnight |
| `:319` | CoA | `captured_at > NOW() - INTERVAL '25 hours'` | `engine_health_today` (INFO row, `:505`) | `excluded-with-reason` — rolling 25h window |
| `:916` | Permits (`misc`) | `snapshot_date = CURRENT_DATE` | `snapshot_today` (INFO row, `:1245`) | `excluded-with-reason` — same as `:318`, permits-branch twin |
| `:918` | Permits (`misc`) | `captured_at > NOW() - INTERVAL '25 hours'` | `engine_health_today` (INFO row, `:1251`) | `excluded-with-reason` — same as `:319`, permits-branch twin |
| `:936` | Permits (`tfd`) | `COALESCE(phase_started_at, issued_date, application_date) >= NOW() - INTERVAL '3 years'` | forecast-eligible-permit denominator, feeds the 13 Step-23 `trade_forecasts` rows (`:1276-1294` — `permits_covered`, `trade_slug`, `target_window`, `confidence`, `calibration_method`, `sample_size`, `median_days`, `p25_days`, `p75_days`, `opportunity_score`, `computed_at`, plus the 2 INFO rows `predicted_start`/`urgency`) | `excluded-with-reason` — the 3-year rolling window's edge population changes daily; row **counts**/percentages compared `normalize-then-match`-style (tolerate small drift), row **presence/shape** `must-match-exactly` |

**Rule pinned:** capture PRE and POST **back-to-back with no intervening chain run** — this bounds the wall-clock drift above to sub-second/same-day, making all 7 rows (6 sites, `:318`/`:916` and `:319`/`:918` are duplicate expressions in different branches) effectively stable in practice even though they are declared `excluded-with-reason` rather than `must-match-exactly`. The declaration is honesty-over-convenience (Spec 120 §14.2): the value CAN drift given enough elapsed time, so it is not pinned as exact, even though this capture session's own PRE/POST pairing will not exercise that drift.

### 5.3 Cross-step table mutation — this step reads 6 already-converted steps' write targets (§3.5)

This step is read-only (zero DML, §1.1 claim 4) but its OWN audit-row values depend on the **live contents** of 23 tables, 6 of which are declared write targets of already-converted steps (§3.5): `parcel_buildings` (`link_massing`), `wsib_registry`+`entities` (`link_wsib`), `parcels` (`compute_centroids` + `enrich_parcels`), `permit_parcels`+`permits` (`link_parcels`), `data_quality_snapshots` (`refresh_snapshot`). **Any of these 6 steps running between the PRE and POST capture would change this step's own audit-row values without this conversion having changed anything** — a false positive in the G8 differential gate, not a real regression. The same rule as §5.2 applies and is the binding one for this entire commit: **capture PRE and POST back-to-back, with no intervening chain run of ANY kind** (not just the 3 chains this step itself belongs to — any of the 6 producer steps could run standalone or as part of an unrelated chain and still mutate a shared table). This is a stronger and more general statement of the same constraint than §5.2's clock-window framing; both point to the identical operational rule.

### 5.4 ASSERT-specifics — `table_state` (mirrors pilot 1, `docs/reports/golden/assert_schema/pre/sources.json`)

Zero writes (§1.1 claim 4, §4.4 Database Impact "NO"), so there is nothing this step's own conversion could regress in `table_state` at the WRITE level — but `table_state` in the golden-master harness is a **read-state snapshot**, not a write-state one, and its presence is gated entirely on whether a descriptor exists (`resolveTables`, `scripts/analysis/capture-step-golden.js:339-357`):

```js
function resolveTables({ descriptor, tablesArg }) {
  const writes = descriptor && descriptor.outputs && Array.isArray(descriptor.outputs.writes)
    ? descriptor.outputs.writes : null;
  // ... if (writes && writes.length > 0) → tables from descriptor.outputs.writes
  // ... else if (tablesArg) → tables from --tables=
  // ... else → { tables: [], source: 'none' }
}
```

`assert_global_coverage.descriptor.json` does not exist yet (this step is pre-conversion — the whole point of commits 1-9). No `--tables=` argument is passed in this commit's capture invocations (per the executing instruction). So `resolveTables` returns `{tables: [], source: 'none'}` for all 4 captures, and `normalised.table_state` will be the empty array `[]` (`stableCopy(capture.table_state ?? [])`, `:673`) — **not the 23 read tables' counts**, because the harness only ever snapshots a step's declared **write** targets, never its reads, and this step has neither a descriptor nor a `--tables=` override.

Re-read directly against pilot 1's own PRE capture this session (`node -e` over `docs/reports/golden/assert_schema/pre/sources.json`, 2026-08-25 vintage): `Object.keys(d)` = `harness, spec, step, chain, git_head, exit_code, signal, summary, summary_count, meta, parse_errors, verdict, ledger_status, stdout, stderr, pipeline_runs, pipeline_runs_max_id_before, db_target, runtime, args, nondeterminism, normalised` — **no top-level `table_state` key at all**, and `d.normalised.table_state` is `undefined` (not even `[]`). This is a harness-version artifact, not a behavioural difference from what this commit will produce: pilot 1's PRE captures predate the `table_state`/`invariants` fields being added to `normalise()` (confirmed by reading the current `normalise()` body, `:660-676` — both fields are unconditionally present today via `?? []`). **This commit's 4 captures will show `table_state: []` explicitly present** (not absent), which is the CURRENT harness's correct behaviour for a no-descriptor, no-`--tables=` step — not a regression from pilot 1, just a newer harness version. `source_fingerprint` will likewise be `null` with the stdout line `[capture-step-golden] source_fingerprint SKIPPED — scripts/quality/assert-global-coverage.descriptor.json does not exist yet (pre-conversion capture)` (`scripts/analysis/capture-step-golden.js:986,989`) — mirrors pilot 1's own PRE `source_fingerprint: undefined`/absent exactly in spirit (null vs. absent is the only harness-version difference).

### 5.5 Resolve-db target line

Every capture's stdout must carry the `resolve-db.js:285` target line naming `127.0.0.1:54322/postgres` and `migrations=<N>` — verified live against THIS session's DB before capturing (§0 below the captures, this commit's step 3).

---

---

## 7. Commit 7 — descriptor + compute + G2′ golden diff

### 7.0 RED evidence (G7) — the commit-6 suite genuinely failed before this commit's artifacts existed

Re-confirmed this session, BEFORE writing the descriptor or the compute module: `npx vitest run src/tests/steps/assert_global_coverage/violations.test.ts` against the commit-6 tree (descriptor/compute absent) reported **9 FAILED / 12 passed** — every failure was one of the 7 `it.fails()` blocks (each correctly reporting `Error: Expect test to fail` — i.e. the wrapped claim did NOT throw, because vitest could not even locate the not-yet-existing artifact it targeted) plus 2 genuinely-crashing assertions inside the (then-unrepointed) G4d fence suite. This is the RED baseline commit 7's descriptor+compute land against; after commit 7, the same file reports 21/21 passing (6 of the 7 `it.fails()` flipped to plain `it()`, §7.1).

### 7.1 Deliverables landed

`scripts/lib/assert-global-coverage-fields.js` (new, pure data — the single declared source of truth for descriptor generation AND the compute dispatch table): 305 `CHECK_DEFS` entries (the 273-row census, §2.3, mechanically unrolled — the two `COST_PROP_COLS` loop rows become 15+15=30 individually-declared checks, one per known column; the `VOCAB_COVERAGE` loop's 4 dynamic entries become 4 individually-declared checks; the `envelope_constraint_reason` distribution collapses to 1 declared `kind:"distribution"` check carrying the full breakdown in `detail`; +2 new checks for the accepted-baseline companion pair, `coa_cost_coverage_gate_accepted`/`_retighten`, per Spec 48 §4.9), 20 `LOGIC_VAR_DEFS` (6 pre-existing + 14 newly adjudicated, report §2.4). `scripts/generate-assert-global-coverage-descriptor.js` (new, one-time generator, not a step) emits `scripts/quality/assert-global-coverage.descriptor.json` from that data. `scripts/lib/compute/assert-global-coverage.js` (new): 3 memoized branch loaders (`loadCoaBranch`/`loadSourcesBranch`/`loadPermitsBranch`) carrying every one of the pre-conversion file's 22 `pool.query` statements **verbatim** (statement-for-statement), plus a generic per-builder-kind evaluator dispatched over the 305 declared checks (Ask A1's ruling generalized to the compute side — one evaluator per BUILDER KIND, not 305 hand-typed functions). `scripts/quality/assert-global-coverage.js` is now the frozen 8-line shell. 14 new `logic_variables` seeded (`scripts/seeds/logic_variables.json`, applied to the local DB: 14/471 inserted, 457 pre-existing preserved) and added to `GROUP_ORDER` (`scripts/generate-logic-variable-groups.mjs`) under "Coverage & Quality"/"Cost Audit Thresholds". `converted.json.pending[].stage` advanced `red_suite` → `runner_wired` (descriptor+compute landed and the shell is frozen onto `pipeline.step()` — G-shape: `compute-clean=true`, `file-clean=null`, `scripts/analysis/step-validate.mjs:624`, not a fail; `runner_wired` is the R-K.1 stage whose `STAGE_HARDSTOP_EXCLUSIONS` excludes exactly G9 — this step is NOT yet a genuine single-commit `shape_clean` jump: G9's `§R Reflection` section is a commit-9/post-cutover-only artifact, Spec 124 R-F, `docs/reports/2026-08-29-pilot6-compute-centroids-assessment.md:956` — writing it now, before the peels (commit 8) and differential (commit 9) exist to reflect ON, would be a fiction). 6 of 7 `it.fails()` claims flipped to plain `it()`; the 7th (`checks[].limit` literal `0`) stays red by design — `definitions.bound` has no bare-number form, only the string grammar, so `c.limit` is `"viol == 0"` (a string), never flips without a `step.schema.json` edit (out of scope). `src/tests/assert-global-coverage.infra.test.ts` (927 L pre-existing) rewritten per Fold A item 2: the ~150 assertions that pattern-matched the OLD `coverageRow('Step X', 'table.field', pop, denom)` call-site TEXT could not mechanically repoint (that call syntax no longer exists anywhere — 305 checks are DATA, per Ask A1) — repointed instead to direct `CHECK_DEFS` lookups (a table-driven `BUILDER_LOCKS` array replaces ~20 near-duplicate describe blocks) preserving every named bug/fix's INTENT; the ~20 assertions checking VERBATIM SQL fragments repointed cleanly to `computeSource()` with no shape change (the SQL is byte-identical). All 121 assertions pass.

### 7.2 A genuine bug caught by the G2′ capture itself (fixed before finalizing)

The first `coa` POST capture flipped the chain verdict from the PRE-golden's `WARN` to `FAIL`: `coa_cost_coverage_gate_accepted` (the accepted-baseline companion row, Spec 48 §4.9) was declared as a plain `'coverage'` builder, which defaults to `severity: FAIL` — at the live value (61.2%, below even the global 70% WARN floor), the row itself FAILed and dragged the whole chain's row-derived verdict to FAIL. The pre-conversion `acceptedBaselineRows()` helper is BY DESIGN a WARN-only signal (the very reason it exists is to downgrade a would-be FAIL); a companion row capable of independently re-escalating to FAIL defeats the mechanism's purpose. **Fix:** `severityOverride: 'WARN'` added to this one `CHECK_DEFS` entry (`scripts/lib/assert-global-coverage-fields.js`), respected by the generator's `severityFor()`. Re-captured: `coa` verdict returns to `WARN`, `checks_failed: 0`. This is exactly the kind of thing G2′ exists to catch — reported here, not silently absorbed.

### 7.3 Per-chain verdict parity (the STOP criterion, deliverable §5)

| Chain | PRE verdict | POST verdict | Match |
|---|---|---|---|
| permits | FAIL | FAIL | ✅ |
| coa | WARN | WARN | ✅ (after the 7.2 fix) |
| sources | PASS | PASS | ✅ |
| standalone | FAIL | FAIL | ✅ |

No unexplained verdict change on any chain. Zero STOP.

### 7.4 Leaf-diff census (every leaf named, by category — `--compare` raw counts: permits 716, coa ~400, sources ~140, standalone ~900 diff lines)

At this scale (196–307 rows × up to 5 fields), enumerating each of ~2,150 raw diff lines individually would bury the 3 genuine structural changes under 2,000+ mechanically-identical renames. Every leaf diff falls into exactly one of these named categories — verified by direct row-by-row inspection (`node -e` diffing `.metric` arrays per chain, §7.4.3), not asserted from the count alone:

**7.4.1 Per-row leaf categories (applies to every one of the ~640 surviving rows, all 4 chains) — DECLARED, pre-approved by this task's own deliverable #5 ("records_meta shape, source/threshold/warn_threshold row fields"):**
- `metric`: the old `` `${field} (${stepTarget})` `` template-literal label (e.g. `"permits.permit_type (Step 2 — load_permits)"`) → the declarative check id (e.g. `"p_step2_permit_type"`). A rename, not a value/judgment change — `stepTarget`/`field` are preserved verbatim in `CHECK_DEFS` and surfaced in the descriptor's `checks[].expect`. `FreshnessTimeline.tsx` renders rows generically (no per-step metric-string hardcoding, report §3.6) — unaffected.
- `threshold`: free-text (`">= 90%"`, `null` for INFO rows) → the declared bound grammar (`"pct >= 90"`, `"viol == 0"`). INFO rows moving from `threshold: null` to `threshold: "viol == 0"` is the SAME shape every other converted step's INFO checks already carry (`enrich_parcels` precedent, §2 of this report).
- `warn_threshold`: newly present (RE-FREEZE #7, absent pre-conversion) on every 3-tier PASS/WARN/FAIL row — the config-substituted WARN bound now rendered in the row itself, closing exactly the gap RE-FREEZE #7 was paid to close.
- `source: "check"`: newly present (Fold B-3 pass-through convention) on every ordinary `checks[]`-derived row.

**7.4.2 Top-level `records_meta` additions (one-time per capture, all 4 chains) — DECLARED, the SAME library-standard shape every one of the 9 previously-converted steps already carries:**
`records_total`/`records_new`/`records_updated`: `1`/`0`/`0` → `null`/`null`/`null` (ASSERT-archetype library convention, §1.10). New keys: `checks_failed`, `checks_warned`, `checks_passed`, `errors[]`, `warnings[]`, `config` (the resolved 20-var stamp), `ledger_row`, `pool_errors`, `terminal`.

**7.4.3 Structural (row-count) changes — the only genuinely NEW-SHAPE diffs, one per chain where applicable, each independently verified by diffing the full `.metric` list (not the generic `--compare`, which reports by array index and mis-attributes a shift as N wrong-content diffs):**
- **sources: 27 → 17 rows — 10 differences in the `rows[]` array (net), every one explained, none silent.** The live `envelope_constraint_reason` distribution grew to **11** distinct reasons since the plan's §1.4 estimate of 8 (`lot_too_narrow, lot_too_large, ravine_constrained, ravine, lot_too_small, heritage, heritage_footprint_exceeds_lot, setback_exceeds_lot, ambiguous_zone, low_lot_confidence, heritage_no_massing`) — collapsed into the ONE declared `src_envelope_constraint_reason_distribution` check (`kind:"distribution"`, `detail.by_reason` carries all 11 `{reason, count}` pairs; 27 − 11 + 1 = 17, confirmed exact). Named in advance in the compute file's own header (conversion consequence (b)) and the descriptor's `limitations[]`. The 2 `parcel_cost_menu` rows are NOT lost — confirmed present at shifted indices (`src_parcel_cost_menu_resid_bldg`/`src_parcel_cost_menu_any`).
- **standalone: 196 → 307 rows — 111 differences in the `rows[]` array (net), all rows explained below.** Pre-conversion, an unset `PIPELINE_CHAIN` fell through to the `else` (permits) branch incidentally — there was no distinct "standalone" code path, so a standalone run only ever saw the permits-branch subset (196 rows), silently missing every coa/sources-only check. Post-conversion, `scripts/lib/step/verdict.js selectChecks()`'s own documented rule — **"a standalone run (no chain) runs EVERYTHING... a chain filter that silently narrows an operator's manual run is how a check stops being run at all"** — returns all 305 declared checks unfiltered when `chainId` is null. This is the SAME pre-established library convention `assert_schema` (pilot 1) already follows, not something invented for this conversion; it is a correctness IMPROVEMENT (an operator's manual/diagnostic standalone run now sees the full profile, not an accidental subset) rather than a regression. Verdict unaffected (FAIL in both — the permits-branch `p_step7_wsib_linked_entity_id` FAIL is still present in the superset).
- **permits (196=196) and coa (102=102): row COUNTS match exactly** — the `COST_PROP_COLS` loops (15 dynamic rows/run each) and the shared `VOCAB_COVERAGE` loop (4 dynamic rows/run) were unrolled into fixed declared checks 1:1 with the live per-run dynamic row count, so no count drift on these two chains.

**7.4.4 Two more named categories, each independently verified (not covered by §7.4.1/§7.4.2's per-row/top-level sweep):**
- `meta.reads` gained 3 tables not read by any of the OTHER already-cited tables' checks: `permit_products`, `product_groups`, `scope_intensity_matrix` — all 3 are vocab-triple tables (`vocab_permit_products_product_id`'s `vocabTable`, `vocab_coa_structure_type`'s `dataTable`/`vocabTable`). Pre-conversion, `emitMeta({}, {})` declared an EMPTY reads/writes map unconditionally (the Observer archetype's own SDK contract was never populated, report §1.5); post-conversion, `deriveMeta(descriptor)` populates `reads` from the descriptor's own declared table list (28 tables, §1 corrected) — every one of the OTHER 25 is already discussed by name elsewhere in this report; these 3 are the only ones not otherwise mentioned, named here explicitly.
- 4 differences per capture appear in `stdout_lines`: the pre-conversion script's own `pipeline.log.info` calls (`"Loaded 35 trade configs from control panel"`, `"Loaded 477 logic variables from control panel"`, `"Chain mode: permits (full profile)"`) are retired — that narration belonged to the step's own `loadMarketplaceConfigs`/chain-branching code, both retired into the library (peel 8a; `ctx.config` resolution is now silent) — replaced by the library's own standard 2-line banner (`"[assert_global_coverage] target: ... migrations=..."`, `"=== Global Data Completeness Profile ==="`), the SAME banner shape `assert_schema`'s own post-conversion `stdout_lines` already carries.

### 7.5 Deviations/limitations recorded on the descriptor (not silent)

Recorded in `scripts/quality/assert-global-coverage.descriptor.json`'s `deviations[]`/`limitations[]` (§ generator, `boundFor`/`severityFor`): (1) WD-1 write-class precedent; (2) Rule 3 `on_invalid:"fail"` posture justification (config forbids a per-variable `why`); (3) the pre-conversion `LOGIC_VARS_SCHEMA`'s 3 cross-field `.refine()` ordering invariants (warn<pass ×2, warn<=pass ×1) are NOT reproduced as a startup throw — `config.logic_variables[]` validates per-variable min/max only, and a runner-level cross-field validator is out of this commit's scope (no `step.schema.json` edit authorized); (4) a zero/null denominator renders the check unevaluable (declared severity) rather than the pre-conversion's forced INFO — theoretically possible, not observed at this DB's live scale; (5) an unresolved/zero-vocab-size vocab check renders the declared severity (FAIL) rather than the pre-conversion's forced WARN/INFO — `resolveAndCountTriple()` itself is unchanged and still never throws.

### G2′ verdict

**PASS, no STOP.** All 4 per-chain verdicts match PRE exactly (§7.3, after the one genuine bug found and fixed in §7.2). Every leaf diff is either a named, pre-approved category (§7.4.1/§7.4.2) or one of 2 named, independently-verified structural changes (§7.4.3), each with its row-count arithmetic confirmed exactly. No unexplained diff.

---

## 8. Commit 8 — peels

### 8a — Defect ledger + test-lock accuracy (docs/test-assertion only, no descriptor/compute/fields touched, no recapture)

`git 21190e32`. Re-verified AGC-D1/D3/D6/D7 against the landed commit 6 (`272d8ae0`) / commit 7 (`22321cdb`) code before closing anything (grep + direct read, not asserted from the plan's prior disposition): AGC-D1 (stale test-title/docblock chain-length prose) was already corrected at commit 6 — the test titles at `src/tests/assert-global-coverage.infra.test.ts:175,182` already cite AGC-D1 with the measured 33/16/28, re-grepped this session for any remaining "28 steps"/"12 steps"/"step 29"/"step 15" text (found none outside an unrelated Spec-42-doc-text assertion). AGC-D3 (externalRow threshold as a bare literal) closed at commit 7 — `external_coverage_pass_pct`/`external_coverage_warn_pct` registered in `scripts/lib/assert-global-coverage-fields.js:85-86`, seeded (`scripts/seeds/logic_variables.json:4690,4700`), consumed by both `builder:'external'` check sites. AGC-D6/D7 (hand-rolled verdict cascade / lock-contention skip) both structurally retired at commit 7 — `scripts/lib/compute/assert-global-coverage.js` carries zero verdict-cascade or lock/skip text (grep-confirmed), both now owned by `scripts/lib/step/index.js` (`deriveVerdict`, `skipRecordsMeta`/`RUN_STATUS.SELF_SKIPPED`), mirroring the `AS-D1`/`AS-D9` precedent. The ledger itself had never been updated to reflect commits 6/7 — this peel is that bookkeeping fix, plus repointing the one `violations.test.ts` lock (`"all 7 OPEN · PIN, none fixed"`) that would otherwise have gone stale/false the moment the ledger was corrected, to a per-row disposition check instead. AGC-D2/D4/D5 verified to remain genuinely open (D2 rides commit 9 per Ask A3; D4/D5 fix-after, no ruling to fix now) — left untouched. Hook: full `npm run test` suite green, `21190e32`.

### 8b — refactor: remove the dead `CHECK_DEFS_BY_ID` export (commit-7 output-panel finding a)

Confirmed zero consumers repo-wide (`grep -rn CHECK_DEFS_BY_ID scripts/ src/`) before removing, and confirmed `DEFS_BY_ID` (the `Map` it exported) was ALSO never read internally — the whole construction was dead, not just the export — so both lines were removed together: `const DEFS_BY_ID = new Map(...)` and `module.exports.CHECK_DEFS_BY_ID = DEFS_BY_ID;` in `scripts/lib/compute/assert-global-coverage.js`.

**Recapture required and run** (compute.js edited): all 4 POST goldens regenerated `--overwrite` against `127.0.0.1:54322/postgres` (confirmed in each capture's own `[capture-step-golden] target:` line, migrations=244). Per-chain verdict parity (the STOP criterion): permits FAIL→FAIL, coa WARN→WARN, sources PASS→PASS, standalone FAIL→FAIL — all 4 unchanged from the pre-peel POST. `git diff` on the 4 committed capture files shows the ONLY leaves that moved: `git_head` (harness metadata, expected every capture), `row:sys_duration_ms` (declared volatile, §5.1), `pipeline_runs_max_id_before` (harness metadata, monotonic), one `pipeline_runs` row's `id`/`started_at`/`completed_at`/`duration_ms` inside standalone's read-only `assert_entity_tracing` lookup (declared volatile — the step reads, never writes, this table), and `source_fingerprint` (`30268b7c…`→`1a81c6ef…` on all 4) — the LAST one is the exact, intended effect of editing a fingerprinted input (`computeSourceFingerprint()` hashes `step.js + descriptor.json + compute.js` — R-C's "the golden capture is a lockfile"): compute.js changed, so the fingerprint moving IS the proof the recapture is honest, not a defect. No check id, value, severity, limit, or row shape changed on any chain. `src/tests/golden-fingerprint.infra.test.ts` (36 tests) confirms every POST capture's `source_fingerprint` matches the current tree post-peel. Related suites green: `violations.test.ts` (21), `assert-global-coverage.infra.test.ts` (121). `step-validate --fast`: unchanged 16/17, hard-stop=false. Hook: full suite green.

**AGC-D id:** none — this finding was flagged by the commit-7 output panel directly (not a numbered ledger row); no new ledger entry needed since it was a pure dead-code removal with zero behavioural surface.

### 8c — refactor: descriptor generator drift lock (commit-7 output-panel finding b)

`git 5e8ea373` (pre-peel baseline). Refactored `scripts/generate-assert-global-coverage-descriptor.js` from a top-level script (module-scoped `TABLE_COLUMNS`/`checks`/`configLogicVariables`/`descriptor`, unconditional `fs.writeFileSync`) into a pure exported `buildDescriptor(CHECK_DEFS, LOGIC_VAR_DEFS)` function — every helper (`why`/`boundFor`/`severityFor`/`kindFor`/`chainsFor`) stays module-level (pure, no shared state); `TABLE_COLUMNS`/`addCol` moved INSIDE the function so two calls in one process (real fields module, then a mutated test fixture) never leak state into each other. The CLI tail (`require.main === module`) now branches on `--check`: byte-compares the in-memory render against the committed file, `console.error` + `process.exitCode = 1` on drift (never `process.exit()`, matching the `process.exitCode` convention already used by `scripts/check-pipeline-freshness.js`/`scripts/violations/generate-programme-backlog.mjs`), else the original unconditional-write behaviour is preserved as the default (no-flag) path — confirmed identical byte-for-byte to the pre-peel generator's output (`--check` reports clean, `git diff --stat` on the committed descriptor is empty both before and after the refactor).

**Deliberately NOT wired into `.husky/pre-commit`** — out of this plan's Operating Boundaries (the plan names this exact scope limit explicitly). Followup line: `docs/reports/review_followups.md` should record wiring `node scripts/generate-assert-global-coverage-descriptor.js --check` into the pre-commit hook (or a `check-step-shape.mjs`-style aggregate drift gate) as a LOW/MED item for a future WF — today the lock only fires under `npm run test` / CI, not locally at commit time.

**Drift lock, both directions, wired into `src/tests/steps/assert_global_coverage/violations.test.ts`** (new describe block, 4 tests, none touching the committed descriptor file except the last, which restores in a `finally`): (1) `buildDescriptor(CHECK_DEFS, LOGIC_VAR_DEFS)` called in-memory against the REAL `scripts/lib/assert-global-coverage-fields.js` byte-matches the committed `descriptor.json` — proves "clean" is not a false negative. (2) The same call against a deliberately mutated `CHECK_DEFS` fixture (first entry's `id` suffixed) produces output that DIFFERS from the committed file — proves the lock is not vacuous (a generator that always reports "clean" would pass test 1 but wrongly also pass a naive version of test 2 only if it ignored its input; this explicitly exercises the input-sensitivity). (3) The CLI `--check` itself exits 0 against the current tree. (4) The CLI `--check` fires non-zero against a deliberately corrupted COMMITTED copy (`original + trailing corruption text`), restored in a `finally` — mirrors the `template-freeze.infra.test.ts`/`programme-backlog.infra.test.ts` mutate-committed-file-and-restore convention already established in this codebase for their own drift generators.

**Operational note (not a defect, filed for the record):** this exact "mutate the committed file, assert the checker fires, restore in `finally`" self-test pattern is what caused a same-session incident — an earlier commit-8b attempt was backgrounded with a stray trailing `&` that got its process killed mid-hook while `template-freeze.infra.test.ts`'s own identical-shape self-test had the COMMITTED `template-freeze.json` mid-mutation, leaving a `FIXTURE-STALE` artifact on disk that blocked 3 subsequent commit attempts (each failing the pre-commit hook's `generate-template-freeze --check` gate) until diagnosed and the file was regenerated clean. Root cause was purely operator process-management (never background a `git commit` with both `run_in_background: true` AND a redundant trailing `&`), not a defect in the mutate/restore pattern itself — `finally` blocks run correctly under a normal thrown assertion, only an abrupt SIGKILL/SIGTERM mid-test skips them. No code change from this; noted here because it directly explains an otherwise-mysterious multi-attempt commit delay in this session's history and because commit 8c's own new test (4) uses the identical pattern, now understood.

Related suites green: `violations.test.ts` (25, was 21), `assert-global-coverage.infra.test.ts` (121), `golden-fingerprint.infra.test.ts` (36) — 182 total. `step-validate --fast`: unchanged 16/17, hard-stop=false. No descriptor/compute/fields file content changed by this peel (the descriptor.json itself has zero diff before/after) — no golden recapture required or performed.

**AGC-D id:** none — commit-7 panel finding b, not a numbered ledger row.

---

## 9. Commit 9 — differential + cutover (2026-09-12, HEAD `fa960c48`, main tree)

**No recapture required for this step's own goldens.** Commit 9's edits (`converted.json`, `step-archetype-census.json`, docs/tests/spec) touch none of the 3 fingerprinted inputs (`scripts/quality/assert-global-coverage.js`, `.descriptor.json`, `scripts/lib/compute/assert-global-coverage.js`) — `step-validate --fast` read `stale-fingerprints=0 unexplained-diffs=0` both before and after this commit's edits, confirmed independently (`--step=assert_global_coverage --write`, this session).

**7th `it.fails()` resolved (R-K).** `src/tests/steps/assert_global_coverage/violations.test.ts`'s one remaining `it.fails()` (the C6 lead-id invariants' `limit` assertion) was never flippable as originally written — `checks[].limit` has no bare-number form, only the string grammar (`"viol == 0"`), confirmed against the live descriptor (`lead_id_administrative_drift`/`lead_id_duplicate_groups`, both `kind:"invariant"`, `severity:"FAIL"`, `limit:"viol == 0"`). Rewritten to assert the documented reality (`c.limit` toBe `'viol == 0'`, a string) rather than the never-true bare-`0` claim; now a plain, genuinely-passing `it()`. **0 `it.fails()` remain in this file** (fast invariant #5 stays clean).

**Cutover obligations (Spec 123 §7 row 9 / §7.2 A6, R-K) — all in THIS commit:** `converted.json` gains `scripts/quality/assert-global-coverage.js`, `pending` = `[]` · `scripts/steps/_schema/step-archetype-census.json`'s row for this slug RETIRED (deleted, not flagged — mirrors the pilot 9/`enrich_parcels` precedent `3c1f1923`: a converted slug carries no census row at all) → `npm run conversion-roadmap` (54 remaining files / 56 remaining slugs / 0 pending, unchanged — this slug was already excluded from "remaining" while pending, so only the pending counter moves 1→0) + `--check` clean · `npm run programme-backlog` (98 items, blocks batching: 0) · `generate-template-freeze.mjs` run with NO flag — `--check` clean, zero content diff (no RE-FREEZE owed; schema untouched since RE-FREEZE #7) · repinned count tests: `conversion-roadmap.infra.test.ts` (2 independently-re-derived-count tests + 1 rendered-table-agreement test, all corrected 9→10 converted / 1→0 pending, all green), `step-schema.logic.test.ts` ("nine steps are converted" → ten, `KNOWN_CHANGED_THIS_COMMIT` unchanged since `assert-schema.descriptor.json` is again the one known exception), `step-seam.logic.test.ts` (registry 9→10 descriptors; live pairs stay at 6 — `assert_global_coverage` declares `inputs.reads.steps: []`, contributing zero new seam edges since it reads 28 tables directly, never another step's declared output) · `step-conformance.infra.test.ts`'s `reportPathFor()` widened to accept the `batchN-iM` report-filename convention alongside the pre-existing `pilotN` one (this is the FIRST batch-labelled report in the fleet; the regex only ever matched `pilot\d+`) · `node -r dotenv/config scripts/analysis/step-validate.mjs --step=assert_global_coverage --write` then `--all --write` (full mode) — all 9 other scorecards regenerated to pick up the registry-wide GOLD-PRE-FRESH line (38→42 PRE captures, 9→10 converted steps).

**R-D three-way lock, exercised a third time.** `assert_global_coverage`'s 20 declared `config.logic_variables` (6 pre-existing + 14 new, report §2.4) join the converted fleet's union the moment this commit registers it in `converted.json.converted[]` — `scripts/lib/declared-logic-variables.js#collectDeclaredLogicVariableNames()` reads ONLY `converted[]`, never `pending[]`, so these 20 names were invisible to the union throughout commits 6-8 despite the descriptor existing since commit 7. `assert-schema.descriptor.json`'s `checks[0].expect` / `config.probe_presence` regenerated **86 → 106** names (+20, 0 removed — the exact `assert_global_coverage` set, verified programmatically against the live derivation; no other field touched). All four `assert_schema` POST goldens re-taken (`--overwrite`, local stack, migrations=244): fingerprint `2c7a2830…` on all four (was `37025a60…`), exit 0, verdict PASS, `declared_logic_variables_present` row reads `{"missing":[]}` on every chain — confirming all 106 names, the 20 new ones included, resolve against the live `logic_variables` table (seeded at this step's own commit 7). Full detail: `docs/reports/2026-08-25-pilot1-assert-schema-assessment.md` §Addendum 2.

**Seed-annotation gap found and closed (registration-surfaced, mirrors the pilot 9/pilot-7/8 commit-9 precedent — a conformance check that only runs over `CONVERTED[]` sees a step for the first time at cutover).** `step-conformance.infra.test.ts`'s both-directions canary (`RED — <file>: DROPPING a declared var reddens conformance`) failed on its second assertion for ALL 20 of this step's declared `config.logic_variables` — `scripts/seeds/logic_variables.json`'s entries lacked the `CONSUMED by <slug>` annotation every OTHER converted step's seed rows carry (`taggedToStep()`'s own cross-check). Because this loop is scoped to `CONVERTED`, it never ran against `assert_global_coverage` while pending (commits 6-8) — the gap was invisible until registration. Fixed: appended `CONSUMED by assert_global_coverage.` to all 20 descriptions (text-only; no name/bound/value/seed-key changed, no DB re-seed needed — the annotation is read from the JSON file directly by the conformance test, never from a live DB column).

**AGC-D2 closed (Ask A3).** Spec 49 §2's "Placement" text ("Permits chain: step 26 (last step...)", "CoA chain: step 10 (last step...)") replaced with the measured `manifest.json.chains` positions, re-verified live this commit: permits **32/33** (after `assert_entity_tracing`, NOT last — `backup_db` runs after it), coa **16/16** (last step), sources **24/28** (after `compute_parcel_cost_estimates`, before its own sibling `assert_parcel_sanity`, NOT last). `defect-ledger.md` AGC-D2 row flipped OPEN·PIN → CLOSED·commit 9; `violations.test.ts`'s defect-ledger-disposition test repinned to match.

**Scorecard at cutover (fast, pre-`--write`): 16/17, G0-G8 full per row, G9 PASS (this section + §R below), G4d PASS, G-shape PASS (`file-clean=true compute-clean=true`), hard-stop=false.** The one open point is G3 (297 table rows, 8 vocab-hit rows) — pre-existing since commit 1, unchanged by this commit (the census counts table-name mentions, not a completeness dimension this conversion touches).

**Spec diff (Spec 123 §7 row 9(b) / Spec 124 §R-8):** Spec 49 §2 (AGC-D2 fix, above) — the only spec touched by this commit. Specs 41/42/43/122/123/124: **N/A** — no chain step-list renumbering, no archetype-profile change, no register amendment owed (RE-FREEZE #7 already paid the schema cost at commit 7).

### §R Reflection (Spec 124 R-F, mandatory after cutover)

**LOW-CONFIDENCE** — findings this pilot could not fully resolve, carried forward with their own disposition rather than silently dropped:

| # | Finding | Why LOW-CONFIDENCE | Disposition |
|---|---|---|---|
| 1 | **Plan low-confidence item 1** — the exact runtime distinct-metric-row count per chain (permits/coa/sources), after accounting for the 2 dynamic loop sites (`reasonDist`, `COST_PROP_COLS`) and the 2 object-argument `profileVocabTriple` calls the bracket-matching census extractor could not destructure — was never closed with a live per-chain count across commits 1-9. The golden captures DO carry the true runtime row count per chain (permits 196, coa 102, sources 17, standalone 307 — report §7.4.3), which answers the question in practice, but no commit explicitly re-derived it from the static census the way the plan's own item 1 asked | The census (273 static sites) and the golden captures (real per-chain row counts) were never cross-tabulated site-by-site in one place — the arithmetic in §7.4.3 confirms the TOTALS reconcile, not that every individual dynamic site's contribution was independently counted | **Carried, not closeable by this pilot's remaining scope** — the golden captures are the practical answer; a future step needing the SAME census-generation approach at this scale (see RECURRING #1 below) should budget for this cross-tabulation up front rather than deferring it |
| 2 | **Plan low-confidence item 5 — measured, not resolved as expected.** The two conditional scope-drift rows (`enriched_status_status_scope_drift`/`_retighten`, IL-2, C3/C7) were expected to plausibly already read 0 (self-retired) in production. Measured this session against the live permits POST capture: **both read 5, not 0** — the WARN/INFO pair is still genuinely live, still draining historical residue through the 4 named writer sites C7 closed in 2026 | This is a live DB value that will change on its own as the residue drains — today's "5" is a snapshot, not a permanent fact, so neither "self-retired" nor "still needed" is provable as a lasting state from one measurement | **Carried as a fact, not a defect** — IL-2's own disposition (ACCEPT, preserved-in-compute) does not depend on the count reaching 0; recorded here so a future reader does not mistake the design's self-retiring INTENT for an already-retired STATE |
| 3 | **AGC-D4/D5 remain OPEN · PIN**, unchanged by this commit — AGC-D4 (hand-duplicated `tfd` SQL mirroring `compute-trade-forecasts.js` `SOURCE_SQL`, the same drift class that caused the WF2 #4 `fetchLeadInspect` bug once already in this file) and AGC-D5 (`aged_pre_permits`, a dead SELECT column, zero behaviour impact) both had no operator ruling authorizing a fix during this conversion (Spec 123 §3: a DEFECT fixed during conversion contaminates the differential) | Neither is closeable without either a cross-file shared-SQL extraction (D4) or a deliberate deletion/wiring decision (D5) — both are genuine code changes, not documentation corrections like AGC-D2 was | **fix-after**, per their own ledger rows — carried forward unchanged, not re-litigated here |

**RECURRING/STANDARD-SHAPING** — findings this pilot believes are likely to recur in a FUTURE step, feeding Spec 124 §4.6's promotion criterion:

| # | Finding | Named archetype match this is expected to recur against | Proposed lock |
|---|---|---|---|
| 1 | **The tool-generated `checks[]`-from-row-builder-census approach (Ask A1) is now the programme's scale-defining precedent** (305 declared checks, ≥9× the prior largest, `enrich_parcels`'s 31) — a hand-authored descriptor was never realistic at this count. The SAME shape (a large ASSERT step with dozens-to-hundreds of near-identical row-builder call sites) is a near-certainty for this batch's own remaining ASSERT members | **`assert_data_bounds` (I2) and `assert_engine_health` (I3) — the next two steps in THIS SAME batch 1**, both named in the C4 batching-entry plan as ASSERT-archetype siblings of this step | Already generalized as a reusable pattern in this commit's own `scripts/generate-assert-global-coverage-descriptor.js` (`buildDescriptor(CHECK_DEFS, LOGIC_VAR_DEFS)`, a pure function, peel 8c) — I2/I3's own plans should budget PH-0/PH-3 time for a row-builder census + generator from the start, not discover the need for one mid-commit the way this pilot did |
| 2 | **The R-D three-way lock's `assert-schema.descriptor.json` regeneration has now fired on 3 of this fleet's 10 cutovers** (pilot 9: 42→86, this commit: 86→106) — every time, by hand: locate the two arrays, compute the sorted union, splice. No drift yet (this commit's own regeneration matched `collectDeclaredLogicVariableNames()` byte-for-byte), but the manual process has zero guard against a future transcription slip | **Every future cutover that registers ANY new `config.logic_variables`** — i.e. most of the remaining 54 files, since Rule 3 (tunables externalized) makes a bare threshold non-conforming | **Proposed lock:** a small generator script (`scripts/generate-assert-schema-probe-lists.js` or similar) that reads `collectDeclaredLogicVariableNames()` and rewrites both arrays in place, with a `--check` drift mode mirroring peel 8c's own `buildDescriptor --check` convention — filed as a LOW/MED followup (`review_followups.md`), not built in this commit (out of this step's Operating Boundaries) |
| 3 | **A spec's own architecture/placement prose can drift silently from `manifest.json` for a long time with no conformance check catching it** (AGC-D2 — Spec 49 §2 named the wrong chain positions since before this fleet's conversion programme began, discovered only because THIS step's own G0 happened to re-measure chain position as part of `sharing.varies_by_chain.phase`). No other converted step's PH-0 has had a reason to re-derive its OWN chain position and cross-check it against the owning spec's prose | Any future step whose owning spec states a specific chain position/step-count in prose (grep for "step \d+" / "last step" across `docs/specs/01-pipeline/`) | **Not proposed as a new lock this commit** (a repo-wide spec-vs-manifest position scanner is a dedicated WF's worth of scope, not a one-line follow-on) — filed as a MED followup naming this exact recurrence count (1 so far) so a second occurrence promotes it per §4.6 |
| 4 | **A pre-existing (pre-conversion) logic_variable's seed row can silently lack the `CONSUMED by <slug>` annotation for the ENTIRE pending period** (commits 6-8, ~1 day) because `step-conformance.infra.test.ts`'s both-directions canary is scoped to `CONVERTED[]` — the same "invisible until registration" shape as RECURRING #2's R-D lock and the EP-D17-class conformance gaps pilot 9 found at ITS OWN cutover. This pilot's OWN 6 pre-existing vars (used by the legacy pre-conversion script for years) had never once been checked against this convention; all 20 (6 old + 14 new) were missing it | **Any future step converting PRE-EXISTING logic_variables that predate the seed-annotation convention** — `assert_data_bounds`/`assert_engine_health` (I2/I3, this batch) are the most likely next candidates, being long-lived legacy ASSERT scripts with their own pre-existing tunables | **Proposed:** a standing (not per-step-scoped) conformance test that greps EVERY seed entry named by ANY manifest slug's legacy script (not only `CONVERTED[]`) for the annotation — would have caught this the moment the 6 old vars were first written, not at cutover. Filed as a MED followup alongside RECURRING #2 (both are "the canary only fires once a step joins `CONVERTED[]`" shape) |

---

## Validation scorecard (generated)

> Generated by `node scripts/analysis/step-validate.mjs --step=assert_global_coverage --write` — Spec 123 §6, ruling R-R (2026-08-29).
> Regenerate with the same command; a stale block is a conformance-lock finding (`step-conformance.infra.test.ts`).

**Score: 16/17** · G9 Reflection: PASS · G4d fence-lock coverage: PASS · G-shape: PASS · **Hard stop: no**

| Gate | Score | Max | Detail |
|---|---:|---:|---|
| G0 | 1 | 1 | boundary-section=true spec-line=true |
| G1 | 1 | 1 | PH-3 section found=true sha-count=23 |
| G2 | 1 | 1 | 122-churn-complexity.md quadrant=top-right window=39313d9 |
| G3 | 1 | 2 | table rows=297 vocab-hit rows=8 |
| G4 | 2 | 2 | risk-class row with chance+impact found=true |
| G5 | 1 | 1 | db=true clock=true network=true argv/env=true |
| G6 | 3 | 3 | 7 ledger row(s), 0 without CLOSED/PIN () |
| G7 | 3 | 3 | file=true fences=0 it-count=27 RED-evidence=true |
| G8 | 3 | 3 | missing-invocations=0 missing-pre-invocations=0 stale-fingerprints=0 unexplained-diffs=0 |
| G9 (binary) | PASS | — | heading=true low-confidence-table=true recurring-table=true |
| G4d (fence<=lock) | PASS | — | fences=0 lock-it-count=27 |
| G-shape | PASS | — | file-clean=true compute-clean=true |

### Fast invariants (always run — the fast descriptor gate)

| # | Scope | Pass | Detail |
|---|---|---|---|
| 1 | assert_global_coverage | PASS | min_migration=241 <= migrations count=244 |
| 2 | assert_global_coverage | PASS | 20 declared, missing from seeds: none |
| 3 | assert_global_coverage | PASS | retired=0 overlap-with-declared=none |
| 7 | assert_global_coverage | PASS | SPEC LINK header present=true |
| 8 | assert_global_coverage | PASS | G-4: 20 declared, 10 verdict-affecting, 0 violate on_invalid:fail with no deviations[] cover |
| 20 | assert_global_coverage | PASS | HB-1: execution.shape=null — HB-1 applies_when execution.shape=="enrich" only (RS-D-STA); not applicable, never a pass-by-omission |
| 21 | assert_global_coverage | PASS | CEIL-1: execution.shape=null — CEIL-1 applies_when execution.shape=="enrich" only (RS-D-STA); not applicable, never a pass-by-omission |
| 4 | (registry) | PASS | overlap: none |
| 5 | (registry) | PASS | clean (0 it.fails( call sites outside a declared pending slug) |
| 9 | (registry) | PASS | clean (0 converted slugs blocked by an unmet cutover_prereq item; blocks batching: 0) |
| 22 | (registry) | PASS | GOLD-PRE-FRESH: 52 PRE capture(s) across 12 converted step(s) all tracked + clean (git can restore every reference) |
| 23 | (registry) | PASS | COMPRESSED-FORM-ELIGIBLE: not applicable (0 pending slugs declare the compressed form) |

### Captures (item iv)
- missing invocations (POST): none
- missing invocations (PRE, GOLD-PRE): none
- stale fingerprints: none
- compare ran: true · diffs found: 2287 · unexplained: 0

### Test suite (item iii)
- 1017/1037 passed (suite success=false)

### Policy coverage matrix (item vi) — Spec 124 Rules 1-13

| Rule | Name | Status | Note |
|---|---|---|---|
| 1 | Nothing hidden | enforced-green | G-1 schema-baseline: schema-baseline clean |
| 2 | Compute is just compute | enforced-green |  |
| 3 | Tunables externalized | enforced-green | G-4: 20 declared, 10 verdict-affecting, 0 violate on_invalid:fail with no deviations[] cover |
| 4 | Compute rule declared | enforced-green | G-2: 3 preserved-in-compute row(s), 0 with no why/notes.json/checks[] grounding |
| 5 | checks >= 1 | enforced-green |  |
| 6 | Omission fails (20 categories) | enforced-green |  |
| 7 | Archetype gates categories | enforced-green |  |
| 8 | Per-target write discipline | enforced-green |  |
| 9 | Banned write needs ledger (+ V7 no_retraction) | enforced-green |  |
| 10 | Verdict row-derived | enforced-green | (a) OK — 11 corpus file(s) scanned, 0 unsanctioned second derivations, 2 sanctioned hit(s) matched SANCTIONED_VERDICT_SITES · (b) OK — SELF_SKIPPED audit table folds to verdict=WARN (!= PASS), row-derived off 1 non-INFO row(s) — VRD-SKIP closed |
| 11 | Phase-order re-derive (declared half, checkOrderGuaranteesCited) | enforced-green | no when:"pre_write" checks — vacuously nothing to cite — G-3 completeness half stays open |
| 12 | Truthful crash posture (R-B reachability, static + R-M before-image) | enforced-green | R-B (checkInterruptedPostureTruthful): recovery.interrupted=null — no reachability claim to verify · R-M: prose-only (R-M/LG-17 describe not scoped to this step (vitest not run, or no before-image target)) |
| 13 | A step validates itself | enforced-green | this run of step:validate IS the mechanism |
| P3 | I/O cost adjudication (measured, not gated) | measured | descriptor=297274B notes=0B checks=305 rows records_meta=40039B (newest post/ capture) |

**Enforced-green: 13/14**

