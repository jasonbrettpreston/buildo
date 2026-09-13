# Batch 1 I2 Assessment — `assert_data_bounds` (ASSERT archetype, third ASSERT conversion after `assert_schema`, `assert_global_coverage`)

**Plan:** `.cursor/batch1_i2_assert_data_bounds_active_task.md` (AUTHORIZED 2026-09-12) — mirrors `.cursor/c4_batching_entry_active_task.md` §3.2 order 2, Execution Plan row **I2**.
**Governing procedure:** Spec 123 §6 (gates) + §7 (nine commits), instantiating Spec 121. This deliverable covers **commits 1-4 only** (PH-0 → PH-6); commits 5-9 (red suite, descriptor/compute, peels, cutover) are out of scope for this session per the executor brief.
**Domain Mode:** Cross-Domain (no admin file edited this session; `FreshnessTimeline.tsx`/`DataQualityDashboard.tsx`/`funnel.ts`/`quality/types.ts` are consumer-contract dependencies only — Scenario A handoff, plan §12).

---

## 1. PH-0 — Boundary freeze (commit 1 → G0)

### 1.0 Target Spec, in the ordering the executor brief requires

1. **Spec 44 §4** (`docs/specs/01-pipeline/44_chain_deep_scrapes.md:318-323`, "Data bounds (assert_data_bounds, deep_scrapes scope)") — read FIRST, per the task brief. This is the plan's own Target Spec line (plan §Context). Confirmed still current: 3 rows (`permit_inspections NULL status` FAIL, `Ancient inspection dates (>5 years)` WARN, `Ghost permits (not seen in 30+ days)` WARN) — all three exist in the live file (`:764-769` null_status via `checkInsp`, `:813-816` ancient_dates, `:935-957` ghost_permits_30d), though Spec 44's own wording ("ancient inspection dates >5 years") is imprecise against the live literal `'2020-01-01'` (a fixed date, not a rolling 5-year window — not corrected here, out of scope; noted as a Low-confidence follow-up).
2. **Spec 41** (`:66` step-table row 22, `:169` "Post-ingestion (assert_data_bounds)" quality table) — permits-chain owner.
3. **Spec 42** (`:38` step-table row 8, `:261` shared-steps note, `:759/:800/:848` Phase G Pre-Permit retirement — the `permits_pre_permit_count==0` gate this file carries in BOTH `runPermitChecks` and `runCoaChecks` blocks) — CoA-chain owner + the Phase-G fence.
4. **Spec 43** (`:57` step-table row 26, `:97` magnitude-floor prose) — sources-chain owner.
5. **Spec 30 §5.4.1** (`:283-322`) — the halt-classification architecture this file is the named exhibit for ("Case C, `assert-data-bounds` regression lock", `:322`).
6. Architecture specs, read last: **Spec 122** (§1.10 ASSERT profile), **Spec 123** (§6/§7), **Spec 124** (§2 Rules).

**⚠ Confirmed (re-measured, not copied from the plan): no system-map owner row exists for this file.** `grep -n "assert-data-bounds\|assert_data_bounds" docs/specs/00-architecture/00_system_map.md` = zero hits before this commit. **Fixed in this commit** — `scripts/quality/assert-data-bounds.js` added to Spec 44's `### Target Files` (`docs/specs/01-pipeline/44_chain_deep_scrapes.md:377`, Fold A item 4), then `npm run system-map` regenerated `docs/specs/00-architecture/00_system_map.md`. **No `--check` mode exists on the generator** (`scripts/generate-system-map.mjs` takes no argv at all — confirmed by reading the file top-to-bottom; `grep -n "argv"` finds zero hits) — stated here rather than silently assumed absent. The generated diff is exactly the expected row-44 change plus incidental drift already latent from other in-flight work on this branch (specs 115/122/122a/124 picking up test files added since the map was last regenerated) — 7 lines changed total, `git diff --stat`, not caused by this session's edit beyond the row-44 line; included in this commit because the map is a generated artifact and Prime Directive #2 gives it total authority (a half-regenerated map is its own drift). Confirmed row 44 now reads `+11 more` (was `+10 more`) — `grep -n "44_chain_deep_scrapes" docs/specs/00-architecture/00_system_map.md`.

### 1.1 Core facts, re-measured (every command run independently this session)

| # | Claim | Command | Measured value |
|---|---|---|---|
| 1 | Line count | `wc -l scripts/quality/assert-data-bounds.js` | **1,055** — confirmed, matches the plan's row 1. |
| 2 | HEAD / git history | `git rev-parse HEAD`; `git log -1 --format=%H -- scripts/quality/assert-data-bounds.js`; `git log --oneline -- scripts/quality/assert-data-bounds.js \| wc -l` | Session HEAD `d2fa03b1`; file last touched `f32b1485`; **58 commits** — confirmed, matches the plan's row 15 (the churn report's 59 is a window-end artifact, not reconciled by assumption). |
| 3 | Advisory lock | `grep -n "^| 103 " docs/specs/01-pipeline/47_pipeline_script_protocol.md` | **103**, row `docs/specs/01-pipeline/47_pipeline_script_protocol.md:1947` — category "6 — Quality", `writes-DB = NO — read-only probe`. `ADVISORY_LOCK_ID = 103` at `scripts/quality/assert-data-bounds.js:49`. |
| 4 | Chains + position | `node -e` over `scripts/manifest.json.chains`, `.indexOf('assert_data_bounds')` | **permits** 22 of 33 (last=`backup_db`) · **coa** 11 of 16 (last=`assert_global_coverage`) · **sources** 27 of 28 (last=`assert_engine_health`) · **deep_scrapes** 5 of 7 (last=`assert_staleness`). The step is absent from the `entities`/`wsib` chains (measured, `indexOf` returns 0/no-match on those — not a 5th/6th chain). All 4 confirmed exactly against the plan's row 3. |
| 5 | DML | `grep -niE "insert into\|update pipeline_runs\|delete from" scripts/quality/assert-data-bounds.js` | **Two hits, both the step's own ledger row**: `:91` `INSERT INTO pipeline_runs (...) RETURNING id`; `:1003` `UPDATE pipeline_runs SET completed_at=..., status=..., duration_ms=..., error_message=..., records_meta=... WHERE id=$4`. **Zero domain DML** — confirmed by full-file read (not grep alone), every other statement is a `SELECT`/`COUNT(*)`. |
| 6 | `pool.query(` sites | `grep -n "pool\.query("` | **9**: `:58` (the `count()` helper's own definition, not a call site), `:90` (ledger INSERT), `:130` (cost outliers), `:293` (CoA sub-0.85 share), `:860` (cost-tier `COUNT(DISTINCT)`), `:886`/`:892` (magnitude gates), `:935` (ghost records), `:1002` (ledger UPDATE). |
| 7 | `count()` helper call sites | `grep -c "await count("` | **50** — see §1.2 for the full per-site table. |
| 8 | Distinct tables read | full-file read, `FROM`/`JOIN` targets de-duplicated | **16**: `address_points`, `building_footprints`, `coa_applications`, `cost_estimates`, `entities`, `heritage_districts`, `heritage_properties`, `neighbourhoods`, `parcels`, `permit_inspections`, `permit_parcels`, `permit_trades`, `permits`, `ravines`, `toronto_centreline`, `wsib_registry` — confirmed exactly against the plan's row 5. |
| 9 | Distinct metrics (audit-row names) | `node -e` regex over `metric: '...'` literals + `checkInsp('...'` call sites | **38 static `metric:` literal call sites** (one name, `permits_pre_permit_count`, appears twice — once per chain-disjoint branch, `:250-255` permits / `:402-407` coa — so **37 distinct static metric names**) **+ 12 dynamic `checkInsp(...)` names** (all distinct) **= 49 distinct named metrics**, confirmed exactly against the plan's row 8. |
| 10 | Logic vars consumed | `grep -oE "logicVars\.[a-zA-Z0-9_]+"` + `node -e` lookup against `scripts/seeds/logic_variables.json` (471 total keys) | **9**, all present in the seed (see §1.7), **none currently carry a `CONSUMED by` annotation** in their `description` field (re-verified this session, `/CONSUMED by/.test(description)` false for all 9) — confirms the plan's row 7 gap; closure deferred to commit 7 per the plan's explicit ruling, not this session (see §1.9 note). |
| 11 | `${...}` non-parameterised interpolation | `grep -n '\${' \| grep -iE "select\|from\|where"` scoped to SQL bodies | **`:888`/`:894`**: `${Number(legacyCostCeiling)}` / `${Number(legacyGfaCeiling)}` interpolated directly into the SQL text (the accompanying `acceptClause` array param IS correctly bound via `$1`/`[COST_MAG_ACCEPT]`). Per the plan's own Fold A item 3 (Integration, binding): **this is NOT a Spec-violating defect** — no ast-grep/eslint rule fires on it, `scripts/CLAUDE.md`'s "parameterised queries only" rule is prose-only, and binding the two ceilings as query params at commit 7 is a behavioural no-op (identical predicate, `Number(...)` already coerces before interpolation — no injection surface, both values come from validated `logicVars`, never user input). Recorded here as a **mechanical style fix for commit 7**, not a G6 DEFECT. |
| 12 | 6 SDK-owned `pipeline_runs` writes, named per the brief | full-file read | The brief's "6 SDK-owned writes" resolves to: the **2 literal statements** (`:90` INSERT, `:1002` UPDATE) **× the 3 code paths that reach them** — (a) normal completion (both statements run, `runId` truthy), (b) `!CHAIN_ID` false (chain-invoked run — the INSERT is skipped entirely, `runId` stays `null`, the UPDATE's own `if (runId)` guard at `:1001` then also skips — **0 of 2 statements run**), (c) the `finalizeStrandedRun` window-close path (`scripts/lib/ledger-window.js`, `:1043-1050`) which performs its OWN conditional UPDATE on `pipeline_runs` when `ledgerFinalized` is false and `windowError` is set — a **3rd, LIBRARY-OWNED** write path, textually outside this file. All are **RETIRED under conversion** (Class L `verdict_only`, plan row 11) — the step library's own ledger (`scripts/lib/step/ledger.js`) replaces every one of them; none is a genuine declared step write. Recorded as 3 distinct code paths touching 2 literal statement sites, not literally "6" — the brief's count is reconciled here rather than silently forced to match (see G0 verdict). |

### 1.2 The 56 domain SQL sites (9 `pool.query(` + 50 `count()` helper calls, minus the 1 helper-definition line and the 2 ledger statements = 56 domain statement executions in a standalone all-chain run) — full statement-level table

**Ledger (excluded from the 56 domain count, listed separately per row 12 above):**

| Line | Statement | Table | Purpose |
|---|---|---|---|
| 90 | `INSERT INTO pipeline_runs (pipeline, started_at, status) VALUES ($1, NOW(), 'running') RETURNING id` | `pipeline_runs` | Own-run ledger open (standalone-only, `!CHAIN_ID` guarded) |
| 1002 | `UPDATE pipeline_runs SET completed_at=NOW(), status=$1, duration_ms=$2, error_message=$3, records_meta=$5 WHERE id=$4` | `pipeline_runs` | Own-run ledger close (`if (runId)` guarded) |

**Helper definition (not itself a call site):** `:58` `async function count(sql) { const res = await pool.query(sql); return parseInt(res.rows[0].count, 10); }` — every one of the 50 rows below invokes this.

**Permit-scoped (`runPermitChecks`, 9 statements):**

| # | Line | Var | Table(s) | Predicate columns | Purpose |
|---|---|---|---|---|---|
| 1 | 130 | `costOutliersRes` (direct `pool.query`) | `permits` | `est_const_cost` | Cost outlier count (`< 0 OR > $1` ceiling, param-bound) |
| 2 | 148 | `recentTotal` | `permits` | `last_seen_at` | Denominator: rows seen in the last 24h |
| 3 | 157 | `descNull` | `permits` | `last_seen_at`, `description` | Null-description count, 24h window |
| 4 | 168 | `builderNull` | `permits` | `last_seen_at`, `builder_name` | Null-builder count, 24h window |
| 5 | 179 | `statusNull` | `permits` | `last_seen_at`, `status` | Null-status count, 24h window |
| 6 | 193 | `orphanTrades` | `permit_trades` LEFT JOIN `permits` | `permit_num`, `revision_num` | Orphaned trade rows (composite-PK join miss) |
| 7 | 205 | `orphanParcels` | `permit_parcels` LEFT JOIN `permits` | `permit_num`, `revision_num` | Orphaned parcel-link rows |
| 8 | 218 | `dupes` | `permits` (subquery `GROUP BY`) | `permit_num`, `revision_num` | Duplicate composite-PK groups |
| 9 | 247 | `prePermitCount` | `permits` | `permit_type` | Phase G gate — Pre-Permit residue (permits branch, Spec 42 §6.11) |

**CoA-scoped (`runCoaChecks`, 10 statements):**

| # | Line | Var | Table(s) | Predicate columns | Purpose |
|---|---|---|---|---|---|
| 10 | 276 | `orphanCoa` | `coa_applications`, NOT EXISTS `permits` | `linked_permit_num` | Orphaned forward-link |
| 11 | 293 | `sub085Pct` (direct `pool.query`) | `coa_applications` | `linked_confidence`, `linked_permit_num` | Sub-0.85 forward-link share (P12-B2 regression watch) |
| 12 | 312 | `nullAddress` | `coa_applications` | `address` | Null/empty address |
| 13 | 323 | `nullAppNum` | `coa_applications` | `application_number` | Null/empty application number |
| 14 | 334 | `futureHearing` | `coa_applications` | `hearing_date` | Hearing date > 2 years in future |
| 15 | 345 | `ancientHearing` | `coa_applications` | `hearing_date` | Hearing date before 2010-01-01 |
| 16 | 362 | `coaCostGt10m` | `coa_applications` | `estimated_cost` | Estimated cost > $10M (P12-C2 watch) |
| 17 | 373 | `coaAppFsiGt5` | `coa_applications` | `coa_fsi` | FSI > 5 (model/propagation regression watch) |
| 18 | 384 | `coaGfaGt3Lot` | `coa_applications` | `lot_size_sqm`, `max_buildable_gfa_sqm` | Modeled GFA > 3× lot size |
| 19 | 399 | `coaPrePermitCount` | `permits` | `permit_type` | Phase G gate — Pre-Permit residue (CoA branch, **duplicate query** of #9 — disjoint chain guards preclude a shared variable, `adec1f68` comment `:395-398`) |

**Sources-scoped (`runSourceChecks`, 13 statements):**

| # | Line | Var | Table(s) | Predicate columns | Purpose |
|---|---|---|---|---|---|
| 20 | 439 | `apCount` | `address_points` | — | Catastrophic-load floor (≥500K) |
| 21 | 447 | `apDupes` | `address_points` (`GROUP BY`) | `address_point_id` | Duplicate IDs |
| 22 | 461 | `parcelCount` | `parcels` | — | Catastrophic-load floor (≥460K) |
| 23 | 469 | `parcelDupes` | `parcels` (`GROUP BY`) | `parcel_id` | Duplicate IDs |
| 24 | 482 | `lotOutliers` | `parcels` | `lot_size_sqm` | Lot size out of `(0, 1M]` sqm bounds |
| 25 | 493 | `bfCount` | `building_footprints` | — | Catastrophic-load floor (≥400K) |
| 26 | 501 | `heightOutliers` | `building_footprints` | `max_height_m` | Height out of `[0, 500]` m bounds |
| 27 | 512 | `nhoodCount` | `neighbourhoods` | — | Row-count floor (≥158) |
| 28 | 520 | `nhoodDupes` | `neighbourhoods` (`GROUP BY`) | `neighbourhood_id` | Duplicate IDs |
| 29 | 537 | `ravinesCount` | `ravines` | — | Row-count floor (≥500), try/catch `does not exist`-guarded (mig 167 ordering) |
| 30 | 558 | `heritagePropsCount` | `heritage_properties` | — | Row-count floor (≥8000), same guard pattern (mig 170) |
| 31 | 559 | `heritageDistrictsCount` | `heritage_districts` | — | Row-count floor (≥20), same guard/try block as #30 |
| 32 | 586 | `centrelineCount` | `toronto_centreline` | — | Row-count floor (≥40000), guarded (mig 173) |

**WSIB-scoped (`runPermitChecks \|\| runSourceChecks`, 5 statements — the cross-chain-injected block):**

| # | Line | Var | Table(s) | Predicate columns | Purpose |
|---|---|---|---|---|---|
| 33 | 641 | `wsibCount` | `wsib_registry` | — | Existence gate (block no-ops if 0) |
| 34 | 647 | `wsibNoName` | `wsib_registry` | `legal_name` | Null/empty legal name |
| 35 | 658 | `wsibNonG` | `wsib_registry` | `predominant_class`, `subclass` | No `G%`-prefixed classification |
| 36 | 671 | `wsibBadNaics` | `wsib_registry` | `naics_code` | Non-numeric NAICS code |
| 37 | 682 | `wsibOrphan` | `wsib_registry`, NOT EXISTS `entities` | `linked_entity_id` | Orphaned entity link |

**Inspection-scoped (`runInspectionChecks`, 13 statements):**

| # | Line | Var | Table(s) | Predicate columns | Purpose |
|---|---|---|---|---|---|
| 38 | 736 | `inspCount` | `permit_inspections` | — | Existence gate (block no-ops if 0) |
| 39 | 758 | `nullPermitNum` | `permit_inspections` | `permit_num` | Null/empty permit_num |
| 40 | 761 | `nullStageName` | `permit_inspections` | `stage_name` | Null/empty stage_name |
| 41 | 764 | `nullStatus` | `permit_inspections` | `status` | Null/empty status |
| 42 | 767 | `nullScrapedAt` | `permit_inspections` | `scraped_at` | Null scraped_at |
| 43 | 771 | `orphanInsp` | `permit_inspections`, NOT EXISTS `permits` | `permit_num` | Orphaned inspection rows |
| 44 | 778 | `badStatus` | `permit_inspections` | `status` | Value outside the 4-member enum |
| 45 | 785 | `outstandingWithDate` | `permit_inspections` | `status`, `inspection_date` | `Outstanding` with a non-null date (WARN) |
| 46 | 791 | `completedNoDate` | `permit_inspections` | `status`, `inspection_date` | Non-`Outstanding` with a null date (WARN) |
| 47 | 798 | `inspDupes` | `permit_inspections` (`GROUP BY`) | `permit_num`, `stage_name` | Duplicate composite key |
| 48 | 807 | `futureDates` | `permit_inspections` | `inspection_date` | Date after `CURRENT_DATE` |
| 49 | 813 | `ancientDates` | `permit_inspections` | `inspection_date` | Date before 2020-01-01 (WARN, `<= 5`) |
| 50 | 819 | `dateBeforePermit` | `permit_inspections` | `inspection_date`, `permit_num` | Inspection year precedes the permit-number year prefix |

**Cost-estimates + ghost-records (`runPermitChecks`, remaining 5 statements — 2 `count()` + 3 direct `pool.query`):**

| # | Line | Var | Table(s) | Predicate columns | Purpose |
|---|---|---|---|---|---|
| 51 | 858 | `ceTotal` | `cost_estimates` | — | Total row count |
| 52 | 859 | `ceNull` | `cost_estimates` | `estimated_cost` | Null estimated_cost count |
| 53 | 860 | `ceTiers` (direct `pool.query`) | `cost_estimates` | `cost_tier` | `COUNT(DISTINCT cost_tier)` |
| 54 | 886 | `costMagRes` (direct `pool.query`) | `cost_estimates` | `estimated_cost`, `permit_num` | Magnitude gate, `> ${legacyCostCeiling}` (interpolated, §1.1 row 11) `AND permit_num <> ALL($1)` (bound) |
| 55 | 892 | `gfaMagRes` (direct `pool.query`) | `cost_estimates` | `modeled_gfa_sqm`, `estimated_cost`, `permit_num` | Magnitude gate, `> ${legacyGfaCeiling}` (interpolated) `AND estimated_cost IS NOT NULL AND permit_num <> ALL($1)` |
| 56 | 935 | `ghostRes` (direct `pool.query`) | `permits` | `last_seen_at`, `lifecycle_phase` | Ghost-permit count (`ea087109` — excludes P19/P20 terminal phases) |

**Total: 56 domain statements.** Per block: permits 9 (1 direct `costOutliersRes` + 8 `count()`), coa 10 (1 direct `sub085Pct` + 9 `count()`), sources 13 (all `count()`), wsib 5 (all `count()`), inspection 13 (all `count()`), cost-estimates + ghost-records 6 (2 `count()`: `ceTotal`/`ceNull` + 4 direct: `ceTiers`/`costMagRes`/`gfaMagRes`/`ghostRes`). **9+10+13+5+13+6 = 56**, cross-checked against the two independent tallies: `count()` total 8+9+13+5+13+2 = **50** (matches §1.1 row 7's `grep -c` measurement exactly) and direct-call total 1+1+3+1 = **6** (`costOutliersRes, sub085Pct, ceTiers, costMagRes, gfaMagRes, ghostRes`, matching §1.1 row 11's context). 50 + 6 = 56, confirmed exactly against the plan's row 6.

### 1.3 Audit-row families — 49 metrics grouped by the 4 chain-scoped audit tables

| Audit table | Runtime `phase` | `name` | Static metric rows (base) | + WSIB cross-injection | Total metrics reachable |
|---|---|---|---|---|---|
| `permitsAuditTable` | **15** | `Data Quality Checks` | 8 (`cost_outliers`, `null_descriptions_24h`, `null_builders_24h`, `null_status_24h` [conditional, `recentTotal>0`], `orphaned_permit_trades`, `orphaned_permit_parcels`, `duplicate_pk_groups`, `permits_pre_permit_count`) + 2 (`cost_estimate_over_ceiling`, `modeled_gfa_over_ceiling`, conditional) + 1 (`ghost_permits_30d`, conditional) = **11 possible** | **+4** (`wsib_no_legal_name`, `wsib_no_g_class`, `wsib_invalid_naics`, `wsib_orphaned_links`) | **15** |
| `coaAuditTable` | **8** | `CoA Data Quality` | 9 (`orphan_link_count`, `coa_forward_link_sub085_pct`, `null_address`, `null_app_num`, `future_hearing`, `ancient_hearing`, `coa_estimated_cost_gt10m`, `coa_app_fsi_gt5`, `coa_maxbuild_gfa_gt3lot`) + 1 (`permits_pre_permit_count`) = **10** | none (WSIB gate is `runPermitChecks \|\| runSourceChecks` only — CoA branch never sees it) | **10** |
| `sourcesAuditTable` | **14** | `Sources Data Quality` | 9 always (`address_points_count`, `address_point_dupes`, `parcels_count`, `parcel_dupes`, `parcel_lot_outliers`, `building_footprints_count`, `building_height_outliers`, `neighbourhoods_count`, `neighbourhood_dupes`) + 4 conditional (`ravines_count`, `heritage_properties_count`, `heritage_districts_count`, `toronto_centreline_count`, each `!== null`-gated) = **13 possible** | **+4** (same 4 WSIB metrics) | **17** |
| `inspectionAuditTable` | **3** | `Data Quality` | 12 (`null_permit_num`, `null_stage_name`, `null_status`, `null_scraped_at`, `orphan_inspections`, `invalid_status`, `outstanding_with_date`, `completed_without_date`, `duplicate_stages`, `future_dates`, `ancient_dates`, `date_before_permit_year`) | n/a (`runInspectionChecks` is disjoint from `runPermitChecks`/`runSourceChecks`) | **12** |

**Distinct metric NAMES across all 4 tables = 49** (authoritative tally, §1.1 row 9: 37 static distinct names + 12 dynamic `checkInsp` names = 49). Two sharing mechanisms explain why the per-table "possible" column above sums to more than 49: **(a)** `permits_pre_permit_count` is one distinct NAME emitted from two SEPARATE literal call sites — one inside `runPermitChecks` (`:250-255`), one inside `runCoaChecks` (`:402-407`), each its own statement (§1.2 items 9 and 19) — counted once in the 49; **(b)** the 4 WSIB names are ONE literal array (`wsibAuditRows`, defined once at `:709-714`) injected by reference into both `permitsAuditTable` and `sourcesAuditTable` via two separate `.push(...wsibAuditRows)` spreads (`:718`, `:722`) — also counted once each in the 49, not twice. This per-audit-table table is a reachability/grouping view (how many rows each table CAN carry at runtime), not a second independent census; the §1.1 row 9 tally is authoritative and this view does not re-derive it.

### 1.4 Verdict derivation / exit paths / stdout markers

- **Verdict derivation** (×4, one per audit table, all row-derived, all hand-rolled per-table copies of the same pattern): `permitHasFails ? 'FAIL' : permitHasWarns ? 'WARN' : 'PASS'` (`:265`), `coaHasFails ? ... ` (`:418`), `sourceHasFails ? ...` (`:628`), `hasFails ? ...` (`:846`, inspection). All 4 are re-evaluated/escalated after WSIB injection (`:719`,`:723`: `if (wsibHasFails) table.verdict = 'FAIL'`) and again after the cost-magnitude gate (`:910-912`, permits only, WARN-only escalation) and the ghost-records gate (`:953`, permits only, WARN-only). **Rule 10 target**: `deriveVerdict(rows)` replaces all 4 hand-rolled ternaries — confirmed identical pattern to `assert_global_coverage`'s I1 finding (§1.5 of that report).
- **Two-tier failure channel** (Spec 30 §5.4.1, the file's own architectural exhibit): `errors[]`/`warnings[]` (full, feeds `pipeline_runs.error_message` + the per-table verdict rows) vs `fatalErrors[]` (exception-derived only, the sole throw gate, `:1035` `if (fatalErrors.length > 0) throw new Error('Data bounds validation failed')`). Exactly **3 push sites** into `fatalErrors`: `:702` (WSIB query threw, table-does-not-exist excluded), `:834` (inspection query threw, table-does-not-exist excluded), `:966` (outer catch-all). All 3 confirmed by direct read, not grep alone (a 4th grep hit at `:118` is the *declaration* `const fatalErrors = []`, not a push).
- **Standalone-run audit-table selection** (`:986-996`): chain-aware when `CHAIN_ID` is set (emits exactly the one matching table); when unset (standalone), a fixed preference order `permits → sources → coa → inspection` picks the FIRST non-null table — meaning a standalone run with data in more than one domain silently reports only ONE table's rows in `records_meta.audit_table`, even though `errors[]`/`warnings[]` (and thus `checks_failed`/`checks_warned`, §1.6) still reflect ALL domains checked. This is a genuine observability gap (the counts and the displayed rows can disagree in standalone mode) — flagged for G6 classification (commit 4), not fixed here.
- **stdout markers:** heavy direct `console.log`/`console.error`/`console.warn` use throughout (unlike `assert_global_coverage`, which has zero) — `PIPELINE_SUMMARY:`/`PIPELINE_META:` JSON lines still emitted once each via `pipeline.emitSummary`/`pipeline.emitMeta` (`:1014-1018`), the console lines are pure operator-facing narration, not a second machine-readable channel.
- **Lock-contention path:** `:1054` `if (!lockResult.acquired) return;` — a bare return, **no step-level emit at all** (not even the hand-rolled skip shape `assert_data_bounds`'s siblings use) — this is a genuine silent-skip gap (no `records_meta`, no `pipeline_runs` row on contention in chain mode), structurally the same class of gap `load_ravines`'s LR-D6 (CLOSED at 8b) and `assert_schema`'s AS-D9 (OPEN) already catalog. Filed as a G6 DEFECT candidate (commit 4).

### 1.5 Logic variables (9, all verdict-affecting) — seed defaults, re-read from `scripts/seeds/logic_variables.json`

| Key | Default | Min–Max | Group | Consumed at |
|---|---|---|---|---|
| `cost_outlier_ceiling_cad` | **2,000,000,000** | 1,000,000 – 10,000,000,000 | Data Quality Thresholds | `:131`, cost-outlier bound |
| `desc_null_rate_warn_pct` | **5** | 1 – 100 | Data Quality Thresholds | `:161`, description null-rate WARN |
| `builder_null_rate_warn_pct` | **95** | 1 – 100 | Data Quality Thresholds | `:172`, builder null-rate WARN |
| `cost_est_null_rate_warn_pct` | **80** | 1 – 100 | Data Quality Thresholds | `:868`, `cost_estimates` null-rate WARN |
| `cost_est_min_tiers` | **2** | 1 – 20 | Data Quality Thresholds | `:872`, minimum distinct `cost_tier` count |
| `calibration_freshness_warn_hours` | **48** | 1 – 720 | Data Quality Thresholds | declared in `LOGIC_VARS_SCHEMA` (`:30`) but **not read anywhere in the file body** — a dead-consumption var (V1 `timing_calibration` was dropped in migration 106, per the file's own comment `:927-928`); flagged as a Low-confidence item (§9), not a G6 defect (Zod schema requires it present but unused, which is a stricter-than-necessary validation, not a bug). |
| `coa_forward_link_sub085_warn_pct` | **59** | 1 – 100 | CoA Gates & Staleness | `:302`, CoA sub-0.85 link-share WARN |
| `cost_est_legacy_cost_ceiling_cad` | **50,000,000** | 1,000,000 – 2,000,000,000 | Cost Tuning | `:888`, magnitude gate (interpolated, §1.1 row 11) |
| `cost_est_legacy_gfa_ceiling_sqm` | **50,000** | 10,000 – 5,000,000 | Cost Tuning | `:894`, magnitude gate (interpolated) |

**Correction against the plan's row 7:** the plan states all 9 are verdict-affecting; re-measured, **8 of 9 are** — `calibration_freshness_warn_hours` is declared and Zod-validated but has zero runtime consumption (dead since the V1 `timing_calibration` table dropped in migration 106, predating this file's current form). This does not change Rule 3 applicability (the var still requires `on_invalid:"fail"` or a dated deviation regardless of whether it's *used*, since the Zod schema enforces its presence) but is recorded as a measured correction, not silently folded into "9 verdict-affecting."

**None of the 9 carry a `CONSUMED by` annotation today** (§1.1 row 10) — per the plan's explicit ruling (Ask A1 note 2 / §3 row 7), this closes at **commit 7**, not in this session's scope.

### 1.6 `records_meta` shape / counters (pre-conversion)

`:979-998`: `checks_passed` (`'all'` string literal or `undefined` — never a count, same AS-D7-class gap as `assert_schema` pre-conversion), `checks_failed: errors.length`, `checks_warned: warnings.length` — **already severity-separated** (the exact LPA-D6 precedent this file predates and is cited as the source-of-truth shape for, `tasks/lessons.md:137`: *"`scripts/quality/assert-data-bounds.js` (still hand-rolled, un-converted) already had the right shape... the fix brought the generic library to parity with that established precedent."*). `errors`/`warnings` arrays (undefined when empty, not `[]`) + the one selected `audit_table` (§1.4).

### 1.7 The ledger writes, reconciled (§1.1 row 12)

The brief's "6 SDK-owned `pipeline_runs` writes" is reconciled as: **2 literal SQL statements** (INSERT `:90`, UPDATE `:1002`) reachable through **3 distinct runtime paths** (normal completion, chain-invoked skip-own-ledger, and the library's `finalizeStrandedRun` window-close backstop) — not 6 separate statements. All retired under conversion (Class L `verdict_only`, WD-1 = BUILT per plan row 11) — the step library's `scripts/lib/step/ledger.js` replaces every path. Recorded as a reconciliation rather than silently adopting either number.

### G0 verdict

All boundary claims independently re-measured this session. **Two internal-consistency slips were found and resolved within this commit's own drafting** (§1.2's domain-statement-count arithmetic; §1.5's "9 vs 8 verdict-affecting" count) — both are recorded rather than silently smoothed over, per the Grounded Verification Protocol's no-unexecuted-claim rule. One genuine correction against the plan: `calibration_freshness_warn_hours` is declared/validated but has zero runtime consumption (dead since migration 106). Spec 44's Target Files gap is closed in this commit; the system map is regenerated and shows the new row. **G0: PASS.**

---

## 2. PH-3 — Intent Ledger (commit 2 → G3)

Per Spec 123 §7.1 role split: **a human adjudicates; the agent discovers and cites evidence only.** Every row below is `PROPOSED (adjudication pending — Spec 123 §7.1 discoverer ≠ adjudicator)`. Closed vocabulary: `preserved-in-runner` / `preserved-in-validator` / `preserved-in-compute` / `encoded-as-descriptor-field` / `encoded-as-deviation` / `knowingly-retired`. Top-right churn quadrant (commit 1's §0 claim 14, unchanged from the plan) ⇒ full ledger, no Class-C skip (C4 §3.3 row 2).

### 2.1 The six fences named by the executor brief — confirmed via `git log -1 --format="%H %s%n%b" <sha> -- scripts/quality/assert-data-bounds.js`

| # | Fence | Blame commit | Subject | Evidence in the current file | Disposition — PROPOSED |
|---|---|---|---|---|---|
| IL-1 | E7-E10 threshold externalization (6 of the file's 9 logic vars) | `4f6114ce` | `feat(40_pipeline_system): WF3-E7-E10 — externalize data-bounds thresholds to logic_variables` | `cost_outlier_ceiling_cad`, `desc_null_rate_warn_pct`, `builder_null_rate_warn_pct`, `cost_est_null_rate_warn_pct`, `cost_est_min_tiers`, `calibration_freshness_warn_hours` were all bare JS literals before this commit; now read from `logicVars` (§1.5). E7's cost ceiling is the only one of the 6 that is correctly `pool.query($1, ...)`-parameterised (`:131-133`); the other 5 are JS-side comparisons (`> pct`), not SQL literals, so no parameterisation question applies to them. | **RULED (§2.4, 2026-09-12) — ACCEPT: encoded-as-descriptor-field** (already registered logic vars, Rule 3-compliant as declared; commit 7 carries them into `config.logic_variables`) |
| IL-2 | `f238b814` false-WARN threshold corrections | `f238b814` | `fix(28_data_quality): adjust false WARN thresholds in CQA checks` | `cost_outliers: == 0 → < 20` (`:135-140`'s own comment names this commit + "C4 panel A1, 2026-08-13" re-review) and `builder_null_rate_warn_pct: 20% → 95%` (the SEED default, not a code literal — this commit's other half landed as the E8 seed value IL-1 already carries). The `cost_outliers` `< 20` threshold itself remains a **hardcoded JS literal** (`:140`, `if (costOutliers >= 20)`), not a logic var — it survived IL-1's externalization pass untouched. | **RULED (§2.4, 2026-09-12) — CHANGE-TO logic var**: promote to a registered `cost_outlier_count_warn_max` (default **20**); `why` cites `f238b814` + the 2026-08-13 C4 panel re-review verbatim. Supersedes this row's original `preserved-in-compute, stays hardcoded` proposal. |
| IL-3 | Phase G Pre-Permit retirement gate, duplicated across chains | `adec1f68` | `feat(42_chain_coa): WF1 Phase G — PRE-permit retirement shims + assert gate + lead-detail CoA branch` | `permits_pre_permit_count == 0` FAIL gate exists at `:250-258` (`runPermitChecks` block) AND `:399-410` (`runCoaChecks` block, same query text, same threshold) — the commit's own message states this is deliberate: "adds `permits_pre_permit_count==0` FAIL gate inside BOTH `runPermitChecks` AND `runCoaChecks` blocks (defense-in-depth per v2-Q2)". Spec 42 §6.11 (`:800`) confirms: "duplicated query — disjoint chain-scoped guards preclude shared variable; defense-in-depth per v2-Q2". | **RULED (§2.4, 2026-09-12) — ACCEPT: preserved-in-compute ×2** (one `checks[]` entry per chain, NOT collapsed into a single `chains:["permits","coa"]` row like the WSIB mechanism below) — the disjoint-guard reasoning is itself the `why`: `runPermitChecks`/`runCoaChecks` are independent booleans (both true only in a standalone run), so a single shared check risks silently not firing if one guard's branch is refactored away while the other survives. Preserving 2 independent checks is the intentional defense-in-depth the v2-Q2 decision named. |
| IL-4 | WSIB metrics dual-injection (permits ∧ sources) | `326bb847` | `fix(35_wsib_registry): add WSIB metrics to assert-data-bounds audit_table` | `wsibAuditRows` (`:709-714`) is ONE array literal, `.push(...wsibAuditRows)`'d by reference into `permitsAuditTable.rows` (`:718`) AND `sourcesAuditTable.rows` (`:722`) — genuinely one mechanism, two destinations, unlike IL-3's two independent queries. Commit message: "Build WSIB audit rows and append to whichever audit_table is active (permits or sources). Re-evaluate verdict if WSIB rows have FAILs." | **RULED (§2.4, 2026-09-12) — ACCEPT: preserved-in-compute, ONE check group, `checks[].chains: ["permits","sources"]`** (the multi-chain array shape `assert_global_coverage`'s own descriptor already uses — not a new mechanism, `step.schema.json:685-691`) — the 4 WSIB metric definitions are authored once and reused, mirroring the source's own single-array-two-destinations shape rather than IL-3's deliberate duplication. |
| IL-5 | `ghost_permits_30d` terminal-phase exclusion | `ea087109` | `fix(41_chain_permits): WF3 — exclude terminal permits from ghost_permits_30d assert` | `:938-940`: `AND lifecycle_phase IS NOT NULL AND lifecycle_phase NOT IN ('P19', 'P20')`. Commit message states the pre-fix behaviour ("already-vacuumed permits... accumulate unboundedly in the WARN count (8,683 today — all P19/P20)") and the corrected baseline ("True non-terminal ghost count in prod: 0"). This is the SAME exclusion class Fold A item 2 of the I1 plan names for `assert_global_coverage`'s own `enriched_status_status_scope_drift` pair — a sibling fence in a sibling file. | **RULED (§2.4, 2026-09-12) — CHANGE-TO guard**: a declared population-scope predicate, not a bare threshold — `why` cites `ea087109` + the "0 true ghosts, 8,683 false positives pre-fix" baseline verbatim; the `NOT IN ('P19','P20')` predicate must travel into the census (`scripts/lib/assert-data-bounds-fields.js`, commit 7) as literal SQL text, never re-derived from a lifecycle-phase enum lookup that could silently omit a future terminal phase. Its `== 0` comparison stays a **physical invariant** (a genuine non-terminal ghost is always a bug), not promoted to a numeric logic var. |
| IL-6 | P13-1 cost/GFA magnitude ceilings + `COST_MAG_ACCEPT` allowlist | `e99ae61a` | `fix(83_lead_cost_model): P13-1/P13-2 legacy cost-tail magnitude gates + clamp + Liar's-Gate upper sentinel` | `cost_est_legacy_cost_ceiling_cad`/`cost_est_legacy_gfa_ceiling_sqm` (logic vars, §1.5) gate `cost_estimate_over_ceiling`/`modeled_gfa_over_ceiling` (`:886-921`). The 3-entry `COST_MAG_ACCEPT` allowlist (`:46`, `'04 202812 BLD'`/`'07 129713 BLD'`/`'06 196930 BLD'`) is a **hardcoded array**, not a logic var — the file's own comment (`:38-45`) names the investigation date (2026-07-09), the exact per-permit developments, and the durable-clamp relationship ("the legacy... tail is nulled by compute's clamp — after that runs, only accepted rows remain > ceiling"). | **RULED (§2.4, 2026-09-12) — ACCEPT: preserved-in-compute** for both the 2 logic-var ceilings (already Rule-3-compliant, unchanged) AND the 3-entry accept-list (an audited exception list, not a tunable threshold — mirrors `parcel-sanity-audit.js`'s own `<> ALL(ARRAY[...])` precedent this file explicitly ported, `:36-37`) — `why` cites `e99ae61a` + the 2026-07-09 investigation + the 3 named permit_nums verbatim. The accept-list is a **declared `accept_list`** (a descriptor-declared array, not a logic var — Rule 3 exempts audited constant exception lists the same way I1's IL-1/C6 exempted a physical invariant). |
| IL-7 | LPA-D6 severity-separated counter precedent (`tasks/lessons.md:137`) | (no single commit — a standing structural property of this file, cited as precedent by the `link_parcel_addresses` lesson, filed 2026-09 during that step's own conversion) | — | `:981-982`: `checks_failed: errors.length`, `checks_warned: warnings.length` — TWO separate arrays feeding TWO separate counts, never one array double-counted. The lesson states verbatim: *"`scripts/quality/assert-data-bounds.js` (still hand-rolled, un-converted) already had the right shape... the fix brought the generic library to parity with that established precedent rather than inventing a new one."* This file is therefore the SOURCE precedent the shared library (`scripts/lib/step/verdict.js buildAuditTable`) was built to match — a reversed fence: not "preserve this file's odd shape," but "this file's shape is already the canonical target, confirm the conversion does not regress it to a single conflated counter." | **RULED (§2.4, 2026-09-12) — ACCEPT: preserved-in-runner** (the severity-separated shape moves INTO the shared library path this step now runs through, not re-implemented per-step) — `why` cites LPA-D6 + `tasks/lessons.md:137` verbatim; G4d (commit 6) must lock both directions: a FAIL-only run shows `checks_warned:0`, and a WARN-only run shows `checks_failed:0` (never derived from one shared `!== 'PASS'` count). |

### 2.2 Additional non-obvious constants found independently this session (`git log -S`, not named by the brief)

| # | Construct | Blame commit | Subject | Disposition — PROPOSED |
|---|---|---|---|---|
| IL-8 | GIS catastrophic-load floors: `ADDRESS_POINTS_FLOOR=500000`, `PARCELS_FLOOR=460000`, `BUILDING_FOOTPRINTS_FLOOR=400000` (`:434-436`) | `1f8ca38a` | `feat(43_chain_sources): sources-chain honesty gates — GIS floors, scoped max-build coverage, enrich --full, link-rate + order pins` | **RULED (§2.4, 2026-09-12) — CHANGE-TO 3 logic vars**: `sources_address_points_floor` (500000), `sources_parcels_floor` (460000), `sources_building_footprints_floor` (400000) — supersedes the original `preserved-in-compute, hardcoded` proposal (`why` cites `1f8ca38a`). |
| IL-9 | `neighbourhoods` floor (158) | `e3dad53d` (earlier: `b4e3d56e` first introduced the CQA-sources extension) | `fix(37_pipeline_system): restore schema circuit breaker, add missing audit metrics` | **RULED (§2.4, 2026-09-12) — CHANGE-TO logic var**: `sources_neighbourhoods_floor` (default 158) — despite being a fixed real-world cardinality, Rule 3 draws no exemption for "unlikely to change," only for `==0`/small-integer referential-integrity invariants and audited exception lists (IL-6's distinction). Supersedes the original `preserved-in-compute, hardcoded` proposal (`why` cites `e3dad53d`). |
| IL-10 | `ravines`(≥500) / `heritage_properties`(≥8000) / `heritage_districts`(≥20) / `toronto_centreline`(≥40000) floors, each `does not exist`-guarded for deploy ordering | `1ceebd17` (ravines, Spec 59 §8c), `169f22af` (heritage, Spec 61 §8c), `f6047e89` (centreline, Spec 62 §8c) | `feat(59/61/62_source_*): load-*.js + M-1 + sources chain wiring` | **RULED (§2.4, 2026-09-12) — SPLIT**: the numeric floors promote to `sources_ravines_floor` / `sources_heritage_properties_floor` / `sources_heritage_districts_floor` / `sources_centreline_floor`; the `does not exist` deploy-order try/catch (migrations 167/170/173) stays a **declared guard** on the check itself, never folded into the numeric bound — two independently-adjudicated halves of one fence. |
| IL-11 | CoA per-application magnitude watches: `estimated_cost > $10M` (WARN `<= 80`), `coa_fsi > 5` (WARN `== 0`), `max_buildable_gfa_sqm > 3× lot_size_sqm` (WARN `<= 45`) | `c53f60a8` | `fix(60_shared_steps): P12-B/C CoA link identity floor + coherence gates` | **RULED (§2.4, 2026-09-12) — CHANGE-TO 5 logic vars**: `coa_cost_gt_threshold_cad` (10000000), `coa_cost_gt_threshold_warn_max` (80), `coa_fsi_gt_threshold` (5), `coa_gfa_over_lot_multiple` (3), `coa_gfa_over_lot_warn_max` (45) — `why` cites `c53f60a8` + the archetype_parcel envelope-tail investigation baseline verbatim. Supersedes the original `preserved-in-compute, hardcoded` proposal. |

### 2.3 Row-builder census (all 49 distinct metrics), mechanically derived

**Command** (throwaway, NOT committed — `scripts/CLAUDE.md`/Spec 122 conventions keep one-off analysis scripts out of `scripts/`; regenerate with the equivalent snippet against `scripts/quality/assert-data-bounds.js` at any time):

```
node <<'JS'
const fs = require('fs');
const src = fs.readFileSync('scripts/quality/assert-data-bounds.js', 'utf8');
const staticMetrics = [...src.matchAll(/metric:\s*'([^']+)'/g)].map(m => m[1]);
const checkInsp = [...src.matchAll(/checkInsp\('([^']+)'/g)].map(m => m[1]);
const distinctStatic = [...new Set(staticMetrics)];
console.log('static call sites:', staticMetrics.length, '(distinct names:', distinctStatic.length + ')');
console.log('dynamic checkInsp names:', checkInsp.length);
console.log('total distinct metrics:', distinctStatic.length + checkInsp.length);
JS
```

Measured this session: 38 static call sites → 37 distinct names (one duplicate, `permits_pre_permit_count`, §1.3) + 12 dynamic `checkInsp` names = **49 total distinct metrics**, confirmed exactly against §1.1 row 9 and the plan's row 8.

<details>
<summary>49-row census (click to expand)</summary>

| # | Metric | Chain(s) | Severity levels reachable | Threshold source | Fence (if any, §2.1/§2.2) |
|---|---|---|---|---|---|
| 1 | `cost_outliers` | permits | WARN/PASS | hardcoded (`< 20`) | IL-2 (`f238b814`) |
| 2 | `null_descriptions_24h` | permits (conditional, `recentTotal>0`) | WARN/PASS | logic-var `desc_null_rate_warn_pct` | IL-1 (`4f6114ce`) |
| 3 | `null_builders_24h` | permits (conditional) | WARN/PASS | logic-var `builder_null_rate_warn_pct` | IL-1/IL-2 |
| 4 | `null_status_24h` | permits (conditional) | WARN/PASS | hardcoded (`== 0`) | — |
| 5 | `orphaned_permit_trades` | permits | FAIL/PASS | hardcoded (`== 0`) | — |
| 6 | `orphaned_permit_parcels` | permits | FAIL/PASS | hardcoded (`== 0`) | — |
| 7 | `duplicate_pk_groups` | permits | FAIL/PASS | hardcoded (`== 0`) | — |
| 8 | `permits_pre_permit_count` | permits AND coa (2 independent sites) | FAIL/PASS | hardcoded (`== 0`) | IL-3 (`adec1f68`) |
| 9 | `cost_estimate_over_ceiling` | permits | WARN/PASS | logic-var `cost_est_legacy_cost_ceiling_cad` + hardcoded accept-list | IL-6 (`e99ae61a`) |
| 10 | `modeled_gfa_over_ceiling` | permits | WARN/PASS | logic-var `cost_est_legacy_gfa_ceiling_sqm` + accept-list | IL-6 |
| 11 | `ghost_permits_30d` | permits (conditional) | WARN/PASS | hardcoded (`== 0`) | IL-5 (`ea087109`) |
| 12 | `orphan_link_count` | coa | FAIL/PASS | hardcoded (`== 0`) | — |
| 13 | `coa_forward_link_sub085_pct` | coa | WARN/PASS | logic-var `coa_forward_link_sub085_warn_pct` | `c53f60a8` (B2, §2.1 not separately listed — same commit family as IL-11) |
| 14 | `null_address` | coa | WARN/PASS | hardcoded (`< 10`) | — |
| 15 | `null_app_num` | coa | FAIL/PASS | hardcoded (`== 0`) | — |
| 16 | `future_hearing` | coa | FAIL/PASS | hardcoded (`== 0`, 2yr window) | — |
| 17 | `ancient_hearing` | coa | WARN/PASS | hardcoded (`< 5`) | — |
| 18 | `coa_estimated_cost_gt10m` | coa | WARN/PASS | hardcoded (`<= 80`) | IL-11 (`c53f60a8`) |
| 19 | `coa_app_fsi_gt5` | coa | WARN/PASS | hardcoded (`== 0`) | IL-11 |
| 20 | `coa_maxbuild_gfa_gt3lot` | coa | WARN/PASS | hardcoded (`<= 45`) | IL-11 |
| 21 | `address_points_count` | sources | FAIL/PASS | hardcoded (`ADDRESS_POINTS_FLOOR`) | IL-8 (`1f8ca38a`) |
| 22 | `address_point_dupes` | sources | FAIL/PASS | hardcoded (`== 0`) | — |
| 23 | `parcels_count` | sources | FAIL/PASS | hardcoded (`PARCELS_FLOOR`) | IL-8 |
| 24 | `parcel_dupes` | sources | FAIL/PASS | hardcoded (`== 0`) | — |
| 25 | `parcel_lot_outliers` | sources | WARN/PASS | hardcoded (`== 0`) | — |
| 26 | `building_footprints_count` | sources | FAIL/PASS | hardcoded (`BUILDING_FOOTPRINTS_FLOOR`) | IL-8 |
| 27 | `building_height_outliers` | sources | WARN/PASS | hardcoded (`== 0`) | — |
| 28 | `neighbourhoods_count` | sources | FAIL/PASS | hardcoded (`>= 158`) | IL-9 |
| 29 | `neighbourhood_dupes` | sources | FAIL/PASS | hardcoded (`== 0`) | — |
| 30 | `ravines_count` | sources (conditional, table-exists) | FAIL/PASS | hardcoded (`>= 500`) | IL-10 (`1ceebd17`) |
| 31 | `heritage_properties_count` | sources (conditional) | FAIL/PASS | hardcoded (`>= 8000`) | IL-10 (`169f22af`) |
| 32 | `heritage_districts_count` | sources (conditional) | FAIL/PASS | hardcoded (`>= 20`) | IL-10 |
| 33 | `toronto_centreline_count` | sources (conditional) | FAIL/PASS | hardcoded (`>= 40000`) | IL-10 (`f6047e89`) |
| 34 | `wsib_no_legal_name` | permits AND sources (1 shared check) | FAIL/PASS | hardcoded (`== 0`) | IL-4 (`326bb847`) |
| 35 | `wsib_no_g_class` | permits AND sources | FAIL/PASS | hardcoded (`== 0`) | IL-4 |
| 36 | `wsib_invalid_naics` | permits AND sources | WARN/PASS | hardcoded (`== 0`) | IL-4 |
| 37 | `wsib_orphaned_links` | permits AND sources | FAIL/PASS | hardcoded (`== 0`) | IL-4 |
| 38 | `null_permit_num` | deep_scrapes | FAIL/PASS | hardcoded (`== 0`) | — |
| 39 | `null_stage_name` | deep_scrapes | FAIL/PASS | hardcoded (`== 0`) | — |
| 40 | `null_status` | deep_scrapes | FAIL/PASS | hardcoded (`== 0`) | — |
| 41 | `null_scraped_at` | deep_scrapes | FAIL/PASS | hardcoded (`== 0`) | — |
| 42 | `orphan_inspections` | deep_scrapes | FAIL/PASS | hardcoded (`== 0`) | — |
| 43 | `invalid_status` | deep_scrapes | FAIL/PASS | hardcoded (4-member enum) | — |
| 44 | `outstanding_with_date` | deep_scrapes | WARN/PASS | hardcoded (`== 0`) | — |
| 45 | `completed_without_date` | deep_scrapes | WARN/PASS | hardcoded (`== 0`) | — |
| 46 | `duplicate_stages` | deep_scrapes | FAIL/PASS | hardcoded (`== 0`) | — |
| 47 | `future_dates` | deep_scrapes | FAIL/PASS | hardcoded (`== 0`) | — |
| 48 | `ancient_dates` | deep_scrapes | WARN/PASS | hardcoded (`<= 5`, fixed `2020-01-01`) | — |
| 49 | `date_before_permit_year` | deep_scrapes | FAIL/PASS | hardcoded (`== 0`, permit_num-derived year) | — |

</details>

**Rule 3 observation (Spec 124 §2, not yet adjudicated):** of the 49 metrics, only **6 use a registered logic var** as their threshold source (#2, #3, #9, #10, #13, and indirectly #1 via IL-2's "stays hardcoded per the false-positive rule"); the remaining **43 use hardcoded JS/SQL literals**. This is a materially different shape from `assert_global_coverage` (I1), where the large majority of `coverageRow`/`calibratedRow` thresholds were already logic vars. Per the IL-8/IL-9/IL-10/IL-11 dispositions above (all `PROPOSED — preserved-in-compute, hardcoded`), the working theory is that most of these 43 are **physical/catastrophic-load/audited-investigation constants** (the same carve-out the I1 report's IL-1/C6 established: "constant vs config" is a real distinction Spec 124 draws, not every FAIL/WARN threshold is a Rule-3 tunable) rather than an undiscovered Rule-3 gap — but this is a PROPOSED reading, not yet ruled, and the human adjudicator should confirm it item-by-item rather than accept the blanket theory. Distinguishing feature vs `assert_global_coverage`'s IL-3/IL-8/IL-9/IL-10/IL-11/IL-12 (all `CHANGE-TO: registered logic var`): those were percentage-based COVERAGE floors calibrated against a moving population (naturally tunable as the population's characteristics drift); the 43 hardcoded values here are mostly either (a) fixed real-world cardinalities (neighbourhoods=158), (b) ~95%-of-known-live-count catastrophic-load floors (address_points/parcels/building_footprints/ravines/heritage/centreline), or (c) `== 0`/small-integer referential-integrity invariants (orphans, duplicates, nulls) where "tunable" has no sensible meaning — a 0-tolerance FK invariant is not a coverage percentage that drifts with data growth.

### 2.4 Adjudication (Spec 123 §7.1 — separate party, 2026-09-12)

Per Spec 123 §7.1's discoverer ≠ adjudicator role split, the 11 `PROPOSED` dispositions in §2.1/§2.2 were ruled by a separate party (not this session's discoverer). Every ruling below is transcribed **verbatim** from the adjudicator's record; each cited line/commit was independently re-verified this session with `sed -n`/`git log` before the corresponding §2.1/§2.2 row was flipped `PROPOSED` → `RULED` (in place, below). Census rule and the 18-tunable list are the adjudicator's own words, re-verified against the live seed/source before being recorded.

**Verification log (this session, before flipping any row):**

| Ruling | Cited evidence | Re-verified |
|---|---|---|
| IL-2 | `f238b814` names the cost-outliers false-WARN fix | `git log -1 --format=%H\ %s f238b814 -- scripts/quality/assert-data-bounds.js` → present in this file's history (§2.1's own table, re-confirmed); `costOutliers >= 20` live at `:140`/`:233` | ✅ |
| IL-3 | `adec1f68` names the disjoint Phase-G duplication | live source `:246-258` (`permitAuditRows`, var `prePermitCount`) and `:399-410` (`coaAuditRows`, var `coaPrePermitCount`) — 2 independent `SELECT COUNT(*) FROM permits WHERE permit_type='Pre-Permit'` sites, each its own `metric: 'permits_pre_permit_count'` row and its own `errors.push` guard — re-read this session, matches §2.1's `adec1f68` citation | ✅ |
| IL-4 | `checks[].chains:["permits","sources"]` | live source `:707-724`: one `wsibAuditRows` array (`:709`), pushed by reference into `permitsAuditTable.rows` (`:718`) and `sourcesAuditTable.rows` (`:722`) — one mechanism, two destinations, re-confirmed | ✅ |
| IL-5 | `ea087109` names the P19/P20 terminal-phase exclusion | live source `:938-940`: `AND lifecycle_phase IS NOT NULL AND lifecycle_phase NOT IN ('P19', 'P20')` — re-confirmed | ✅ |
| IL-6 | `e99ae61a` names the `COST_MAG_ACCEPT` allowlist + investigation | live source `:38-46`: the 3-entry array with its 2026-07-09 investigation comment, re-confirmed byte-identical | ✅ |
| Dead var | `calibration_freshness_warn_hours` has zero runtime consumption | `grep -n "calibFreshnessHours" scripts/quality/assert-data-bounds.js` → exactly ONE hit (`:73`, the assignment itself) — re-confirmed this session, matches report §1.5/ADB-D5 | ✅ |
| 18 tunable defaults | every default below equals the live literal it externalizes | each cross-checked against its cited source line this session (table below) | ✅ |

**Rulings (verbatim, IL-1 through IL-11):**

- **IL-1 ACCEPT.** The 6 E7–E10 vars (`4f6114ce`) stay `encoded-as-descriptor-field` — already registered, Rule-3-compliant as declared; commit 7 carries them into `config.logic_variables` unchanged.
- **IL-2 CHANGE-TO logic var** — promote the `cost_outliers >= 20` threshold (`f238b814`) to a registered logic var `cost_outlier_count_warn_max` (default **20**). `why` cites `f238b814` verbatim ("adjust false WARN thresholds in CQA checks" + the 2026-08-13 C4 panel re-review). Supersedes §2.1's `preserved-in-compute, stays hardcoded` proposal — the adjudicator's reading is that a threshold a commit explicitly named as miscalibrated once is exactly the kind of value that should be operator-tunable, not re-hardcoded a second time.
- **IL-3 ACCEPT** — `==0` retirement invariant; the ×2 disjoint-guard duplication (`adec1f68`) is deliberate defense-in-depth (v2-Q2) and stays 2 independent `checks[]` entries, never collapsed to one `chains:["permits","coa"]` row.
- **IL-4 ACCEPT** — `checks[].chains:["permits","sources"]`, one WSIB check group of 4, authored once and reused (mirrors `assert_global_coverage`'s own multi-chain array shape, `step.schema.json:685-691`).
- **IL-5 CHANGE-TO guard** — the `NOT IN ('P19','P20')` exclusion (`ea087109`) is a **declared population-scope predicate**, not a bare threshold: the check's `why` must name `ea087109` and the terminal-phase exclusion verbatim, and the exclusion predicate itself travels as literal SQL text (never re-derived from a lifecycle-phase enum lookup). Its `== 0` comparison **stays a physical invariant** (a genuine non-terminal ghost is always a bug, never a tunable tolerance) — not promoted to a numeric logic var.
- **IL-6 ACCEPT** — the 2 ceiling vars (`cost_est_legacy_cost_ceiling_cad`/`cost_est_legacy_gfa_ceiling_sqm`) are already registered vars, unchanged. `COST_MAG_ACCEPT` (`e99ae61a`) is a **declared `accept_list`** (an audited exception list, not a threshold) — descriptor-declared, not a logic var; `why` cites `e99ae61a` + the 2026-07-09 investigation + the 3 named `permit_num`s verbatim.
- **IL-7 ACCEPT** — the severity-separated `checks_failed`/`checks_warned` shape (LPA-D6 precedent) is `preserved-in-runner`; commit 7's G2′ must show `checks_failed`/`checks_warned` in POST `records_meta` at parity with the PRE file's own per-chain counts (verify, never assume).
- **IL-8 CHANGE-TO 3 logic vars** — the 3 GIS catastrophic-load floors (`1f8ca38a`: `address_points`/`parcels`/`building_footprints`) promote to `sources_address_points_floor` (500000), `sources_parcels_floor` (460000), `sources_building_footprints_floor` (400000).
- **IL-9 CHANGE-TO logic var** — the `neighbourhoods` floor (`e3dad53d`/`b4e3d56e`, 158) promotes to `sources_neighbourhoods_floor` (158), despite being a fixed real-world cardinality — Rule 3 draws no exemption for "unlikely to change," only for `== 0`/small-integer referential-integrity invariants and audited exception lists (IL-6's distinction).
- **IL-10 SPLIT** — the 4 remaining GIS floors (`ravines` ≥500, `heritage_properties` ≥8000, `heritage_districts` ≥20, `toronto_centreline` ≥40000) promote to `sources_ravines_floor`, `sources_heritage_properties_floor`, `sources_heritage_districts_floor`, `sources_centreline_floor` — the numeric THRESHOLD half moves to a var; the `does not exist` deploy-order try/catch (migrations 167/170/173) stays a **declared guard** in the check's own conditional (`when`/`why`), never folded into the numeric bound itself. Two independently-adjudicated halves of one fence, hence SPLIT.
- **IL-11 CHANGE-TO 5 logic vars** — the CoA magnitude watches (`c53f60a8`) promote to `coa_cost_gt_threshold_cad` (10000000), `coa_cost_gt_threshold_warn_max` (80), `coa_fsi_gt_threshold` (5), `coa_gfa_over_lot_multiple` (3), `coa_gfa_over_lot_warn_max` (45) — `why` cites `c53f60a8` + the 64-row `estimated_cost>$10M` archetype_parcel investigation baseline verbatim.

**Census rule (adjudicator's words):** group (a) `==0` structural invariants stay literal (metrics #4,5,6,7,12,15,22,24,27,29,34–43,46,47,49 — referential-integrity/duplicate/null-count invariants where "tunable" has no sensible meaning); group (b) promotes to registered vars (#1,9-part,14,16-window,17,18,19-cutoff,20,21,23,26,28,30–33,48); group (c) is the `COST_MAG_ACCEPT` allowlist only (an audited exception list, never a threshold).

**Dead var, knowingly-retired:** `calibration_freshness_warn_hours` (ADB-D5) — zero runtime consumption (re-verified above), dropped from the schema key and the seed entry at commit 7 rather than wired into a real check.

**Tunables to declare at commit 7 (18 new, all `on_invalid:"fail"`, defaults = the current live literal, each verified against its source line this session):**

| # | Name | Default | Verified against |
|---|---|---|---|
| 1 | `cost_outlier_count_warn_max` | 20 | `:140` `if (costOutliers >= 20)` |
| 2 | `sources_address_points_floor` | 500000 | `ADDRESS_POINTS_FLOOR` constant, sources block |
| 3 | `sources_parcels_floor` | 460000 | `PARCELS_FLOOR` constant |
| 4 | `sources_building_footprints_floor` | 400000 | `BUILDING_FOOTPRINTS_FLOOR` constant |
| 5 | `sources_neighbourhoods_floor` | 158 | `neighbourhoods_count` gate, `>= 158` |
| 6 | `sources_ravines_floor` | 500 | `ravines_count` gate, `>= 500` |
| 7 | `sources_heritage_properties_floor` | 8000 | `heritage_properties_count` gate, `>= 8000` |
| 8 | `sources_heritage_districts_floor` | 20 | `:567-570` `heritageDistrictsCount`, `>= 20` |
| 9 | `sources_centreline_floor` | 40000 | `toronto_centreline_count` gate, `>= 40000` |
| 10 | `coa_null_address_count_warn_max` | 10 | `null_address` check, `< 10` |
| 11 | `coa_ancient_hearing_count_warn_max` | 5 | `ancient_hearing` check, `< 5` |
| 12 | `coa_future_hearing_window_years` | 2 | `:335` `CURRENT_DATE + INTERVAL '2 years'` |
| 13 | `coa_cost_gt_threshold_cad` | 10000000 | `coa_estimated_cost_gt10m`, `> $10M` |
| 14 | `coa_cost_gt_threshold_warn_max` | 80 | `coa_estimated_cost_gt10m` WARN, `<= 80` |
| 15 | `coa_fsi_gt_threshold` | 5 | `coa_app_fsi_gt5`, `> 5` |
| 16 | `coa_gfa_over_lot_multiple` | 3 | `coa_maxbuild_gfa_gt3lot`, `> 3×` |
| 17 | `coa_gfa_over_lot_warn_max` | 45 | `coa_maxbuild_gfa_gt3lot` WARN, `<= 45` |
| 18 | `inspection_ancient_dates_count_warn_max` | 5 | `:813-816` `ancientDates`, `<= 5` |

`+` the existing 8 (all of §1.5 except the retired `calibration_freshness_warn_hours`) `=` **26** `config.logic_variables` entries expected at commit 7.

**§2.1/§2.2 rows flipped `PROPOSED` → `RULED`, this commit:** IL-1 (ACCEPT), IL-2 (CHANGE-TO logic var), IL-3 (ACCEPT), IL-4 (ACCEPT), IL-5 (CHANGE-TO guard), IL-6 (ACCEPT), IL-7 (ACCEPT), IL-8 (CHANGE-TO 3 logic vars), IL-9 (CHANGE-TO logic var), IL-10 (SPLIT), IL-11 (CHANGE-TO 5 logic vars) — see the amended `Disposition` column in §2.1/§2.2 above (in-place edits, this commit).

### 2.5 Scope note — fields-module deferral

The plan's §3 commit-2 row proposes starting `scripts/lib/assert-data-bounds-fields.js` (the `CHECK_DEFS`/`LOGIC_VAR_DEFS` data module) at THIS commit, per I1's own RECURRING #1 obligation. **Superseded by the executor brief for this session**: `scripts/lib` is out of scope for commits 1-4 (executor brief: "No code under scripts/lib, scripts/quality, src/tests/steps (commits 5-9)"). The §2.3 census above is the complete input this module will be mechanically derived from at commit 7 — every row's `{id, table, metric, threshold, severity, chains}` shape is already present in the 49-row table, so commit 7 is a transcription-plus-generator exercise against this census, not new discovery. Recorded here so the deferral is explicit rather than a silent scope drop.

---

## 3. PH-5 — Seam map (commit 3 → G5)

### 3.1 DB seam

Single seam: the `pool` object `pipeline.run('assert-data-bounds', async (pool) => {...})` injects (`:54`) — every one of the 56 domain statements (§1.2) plus the 2 ledger statements plus `finalizeStrandedRun`'s own conditional UPDATE (§1.7) go through this one `pool`. No second connection, no raw client checkout, no `pg.Pool()` construction in this file (confirmed absent by the `require()` list, commit 1 §0).

### 3.2 Clock seam

**Elapsed-time only** (harness-standard volatile, `Date.now()` — 3 sites: `:78` `startMs`, `:970` `durationMs`, `:1047` inside `finalizeStrandedRun`'s call args) — not a real non-determinism seam for golden capture (elapsed ms is expected to vary run-to-run and is not asserted byte-for-byte by any existing test).

**Clock-relative SQL predicates — corrected count against the plan's row 3 ("6 distinct... classes"):** re-measured via `grep -n "INTERVAL\|CURRENT_DATE\|NOW()"` over the whole file, excluding the 2 ledger `NOW()` sites (`:92` INSERT, `:1004` UPDATE — DB-clock timestamps, not query predicates). **4 distinct predicate classes across 7 domain sites**, not 6:

| Class | SQL fragment | Sites | Count |
|---|---|---|---|
| 1 | `NOW() - INTERVAL '1 day'` | `:149`, `:158`, `:169`, `:180` (recentTotal, descNull, builderNull, statusNull — all permit-scoped, all identical) | 4 |
| 2 | `CURRENT_DATE + INTERVAL '2 years'` | `:335` (futureHearing, CoA) | 1 |
| 3 | `CURRENT_DATE - INTERVAL '30 days'` | `:938` (ghostRes, permits) | 1 |
| 4 | bare `CURRENT_DATE` | `:808` (futureDates, inspection) | 1 |

**Correction, recorded not silently reconciled:** the plan's row 3 states "`CURRENT_DATE - INTERVAL '2 years'`/`'30 days'`" (both MINUS) — the live `futureHearing` predicate is actually `CURRENT_DATE + INTERVAL '2 years'` (PLUS — a forward-looking future-date bound, not a lookback window; the code and its own semantics, "hearing_date > CURRENT_DATE + INTERVAL '2 years'" = flag hearings scheduled implausibly far in the future, require `+`). This does not change the golden-capture non-determinism inventory (still 4 predicate classes to declare as non-deterministic across chain-relative runs) but the plan's operator sign was wrong and is corrected here per the "never infer behaviour from a name" directive (CLAUDE.md PD #10).

**2 fixed-date literals (NOT clock-relative — do not add to the non-determinism inventory):** `ancientHearing`'s `hearing_date < '2010-01-01'` (`:346`) and `ancientDates`'s `inspection_date < '2020-01-01'` (`:815`) are static string literals, deterministic across all runs — flagged here only to distinguish them from the genuinely volatile class-1-4 predicates above (a golden-capture reviewer scanning for "date-shaped strings" could otherwise over-declare these as non-deterministic).

### 3.3 Network seam

**None.** Confirmed by full-file `require()` audit (commit 1 §0): `zod`, `../lib/pipeline`, `../lib/config-loader` (`loadMarketplaceConfigs`/`validateLogicVars`), `../lib/ledger-window` (`finalizeStrandedRun`) — no `fetch`/`axios`/`http`/`https` import, no external URL construction anywhere in the file. The plan's row 3 "network (none?)" uncertainty is resolved: **confirmed none**, not merely absent-by-omission.

### 3.4 argv/env seam

**One:** `process.env.PIPELINE_CHAIN` (`:52`) → `CHAIN_ID`, gating `runPermitChecks`/`runCoaChecks`/`runSourceChecks`/`runInspectionChecks` (`:107-110`) and the standalone-vs-chain audit-table selection (§1.4). No other `process.env.*` read in the file (confirmed by grep, commit-1-session re-run this commit). Becomes the library's chain-derived `ctx.checks` selection per the plan's own framing (§3 row 3) — the 4 boolean gates collapse into one `sharing.varies_by_chain` map (already declared in the plan §1, `{ permits: 22, coa: 11, sources: 27, deep_scrapes: 5 }`).

### 3.5 The one real design seam — the WSIB OR-guard

`if (runPermitChecks || runSourceChecks)` (`:639`) is the single non-mechanical branch condition in the file — every other `if (runXChecks)` gates exactly one audit table; this one gates a block whose OUTPUT (the `wsibAuditRows` array) is injected into up to TWO tables (§2.1 IL-4). Confirmed this commit: the guard is **inclusive-OR**, and in a standalone run (both `runPermitChecks` and `runSourceChecks` true) the block runs exactly ONCE (not twice) — `wsibCount`/`wsibNoName`/etc. are computed a single time (`:641-692`) and the SAME `wsibAuditRows` array is spread into both tables (§2.1 IL-4's "one mechanism, two destinations" finding) — no double-counting, no double-query. The generator (commit 7, Ask A1) must emit exactly 4 WSIB `checks[]` entries with `chains:["permits","sources"]`, never a 5th synthetic "wsib chain" branch and never 8 entries (4×2, wrongly treating the two destinations as separate checks).

### 3.6 Producer seams — which CONVERTED steps' outputs this file reads (measured against `scripts/steps/_schema/converted.json`)

`converted.json.converted` (10 entries, post-I1): `assert-schema.js`, `load-ravines.js`, `link-massing.js`, `link-wsib.js`, `link-parcel-addresses.js`, `compute-centroids.js`, `link-parcels.js`, `refresh-snapshot.js`, `enrich-parcels.js`, `assert-global-coverage.js`.

Of the 16 tables this file reads (§1.0 claim 8), **3 are written by an already-converted producer**:

| Table read here | Converted producer | Producer's `pending`/`converted` status |
|---|---|---|
| `parcels` | `enrich-parcels.js` | converted |
| `ravines` | `load-ravines.js` | converted |
| `permit_parcels` | `link-parcels.js` | converted |

The remaining 13 tables (`address_points`, `building_footprints`, `coa_applications`, `cost_estimates`, `entities`, `heritage_districts`, `heritage_properties`, `neighbourhoods`, `permit_inspections`, `permit_trades`, `permits`, `toronto_centreline`, `wsib_registry`) are written by NOT-yet-converted producers (`load-address-points.js`, `load-heritage.js`, `load-centreline.js`, `load-neighbourhoods.js`, `load-permits.js`, `load-coa.js`, `compute-cost-estimates.js`, the AIC scraper, `classify-permits.js`, `link-wsib.js`'s upstream `load-wsib.js`, etc. — this file's own upstream, not itself converted). **No wiring risk to this step's own conversion** (it reads via `pool.query`, not via another step's descriptor/compute exports — the SDK archetypes have no cross-step import contract, confirmed by the plan's own Integration finding, Fold A item 4), but recorded per the executor brief's "producer seams vs `converted.json`" requirement.

### 3.7 Audit-row consumers (`grep -rn "assert_data_bounds\|assert-data-bounds" src/ --include=*.ts --include=*.tsx | grep -v tests`)

**7 hits, 5 files** — one more file than the plan's §12 handoff note (Fold A item, `src/lib/quality/types.ts`) already names, plus `src/app/api/admin/control-panel/resync/route.ts` which the plan's §12 did NOT enumerate:

| File | Line | Contract |
|---|---|---|
| `src/app/api/admin/control-panel/resync/route.ts` | `:33` | Slug string in a resync-allowlist array — **not named in the plan's §12 handoff list**, a genuine gap found this session |
| `src/components/DataQualityDashboard.tsx` | `:45` | `assert_data_bounds: { label: 'Daily' }` — cadence label |
| `src/components/FreshnessTimeline.tsx` | `:90` | `{ name: 'Data Quality Checks', group: 'quality' }` — display metadata |
| `src/components/FreshnessTimeline.tsx` | `:195` | Slug string in a rendering-order array |
| `src/lib/admin/funnel.ts` | `:599` | Summary string + `table: 'pipeline_runs'` |
| `src/lib/admin/funnel.ts` | `:849` | `pipeline_runs` table-key map entry |
| `src/lib/quality/types.ts` | `:634` | `'Data Quality Checks'` label |

**Correction against the plan's §12:** the plan's handoff note names exactly 4 consumer files (`FreshnessTimeline.tsx`, `DataQualityDashboard.tsx`, `funnel.ts`, `quality/types.ts`). This session's grep finds a **5th**: `src/app/api/admin/control-panel/resync/route.ts:33`, a resync-allowlist entry that must also render unchanged post-conversion (the slug string itself doesn't change, so this is likely a zero-risk omission, not a live gap) — flagged for the human plan-owner to fold into §12's consumer count before commit 9's G8 gate, since G8 only checks what it's told to check.

---

## 4. PH-6 — Classification (commit 4 → G6)

Every behaviour below is CONTRACT (must survive conversion unchanged), INCIDENTAL (implementation detail, no assertion needed), or DEFECT (a real bug, pinned per Spec 123 §3.1 — fixed after conversion, never silently during it). Every DEFECT gets an `ADB-D<n>` row in `docs/reports/defect-ledger.md`, status `PIN`.

### 4.1 CONTRACT — must survive conversion

- The two-tier failure channel (Spec 30 §5.4.1, this file's own architectural exhibit): `errors[]`/`warnings[]` (full, feeds `error_message`) vs `fatalErrors[]` (exception-derived only, exactly 3 push sites — `:702` WSIB, `:834` inspection, `:966` outer catch — the sole throw gate, `:1035`). This split must survive byte-for-byte; it is the regression lock `db/assert-data-bounds-halt.db.test.ts` Case B exists to pin.
- The 4-chain scoping booleans (`runPermitChecks`/`runCoaChecks`/`runSourceChecks`/`runInspectionChecks`, §1.0 claim 4) and the WSIB OR-guard's single-computation/dual-injection mechanism (§3.5) — must not become 2 separate WSIB computations or an 8-entry `checks[]` split.
- All 8 verdict-affecting logic vars (§1.5, excludes the dead `calibration_freshness_warn_hours`) and their thresholds — `cost_outlier_ceiling_cad`'s SQL-side parameterisation (`:131-133`, the only one of the 9 that binds via `$1`) must stay parameterised.
- The `f238b814` cost-outliers `< 20` fence (IL-2), the Phase-G duplicated Pre-Permit gate (IL-3, 2 independent check sites, NOT collapsed), the WSIB dual-injection (IL-4, 1 mechanism → 2 destinations), the `ghost_permits_30d` terminal-phase exclusion (IL-5), and the `COST_MAG_ACCEPT` 3-entry allowlist + its 2026-07-09 investigation provenance (IL-6) — all 5 are load-bearing regression fences requiring both-directions G4d locks at commit 6.
- The 4 `does not exist`-guarded try/catch blocks (`ravines`/`heritage_properties`+`heritage_districts`/`toronto_centreline`, IL-10) — deploy-ordering guards for migrations 167/170/173; must travel as a declared `guards`/`when` condition, not just a bare threshold.
- The `{metric, value, threshold, status}` row shape and the 4 distinct `{phase, name, verdict, rows}` `audit_table` envelopes (phases 15/8/14/3) — the 5-consumer contract (§3.7: `FreshnessTimeline.tsx` ×2, `DataQualityDashboard.tsx`, `funnel.ts` ×2, `quality/types.ts`, plus the `resync/route.ts` allowlist entry found this session) — proven byte-identical by G8's zero-unexplained-diff gate.
- `checks_failed`/`checks_warned` as genuinely severity-separated counters (§2.1 IL-7, the LPA-D6 precedent this file predates and is the reference shape for) — must NOT regress to one shared `!== 'PASS'` count during library adoption.
- The 4 clock-relative SQL predicate classes (§3.2) and the standalone-run preference order `permits → sources → coa → inspection` (§1.4) — non-determinism-inventory items the golden master (commit 5) must declare, not eliminate or reorder.

### 4.2 INCIDENTAL — implementation detail, no assertion needed

- The `count(sql)` local helper (`:57-60`) — a thin `pool.query` + `parseInt` wrapper; the compute-shape conversion is free to inline or restructure this as long as the 50 call sites' predicates and thresholds (§1.2) are preserved.
- Variable naming (`ca`/`cx`/`pp`/`mbc`/etc. — actually this file uses descriptive names throughout, e.g. `costOutliersRes`/`orphanTrades`/`wsibNoName` — no terse single/double-letter variables exist here, unlike `assert_global_coverage`'s `ca`/`cx`/`pa` convention) — purely local, no external contract either way.
- The exact ordering of the 6 top-level `if` blocks (permits → coa → sources → wsib → inspection → cost/ghost) — no cross-block data dependency exists (confirmed by full-file read: each block's local `const`/`let` declarations are self-contained, only the 4 `*AuditTable` variables and the shared `errors`/`warnings`/`fatalErrors` arrays cross block boundaries) — free to reorder or parallelize in the compute shape.
- Heavy `console.log`/`console.error`/`console.warn` narration throughout (§1.4) — operator-facing only, not a second machine-readable channel; the compute-shape conversion may retain, reduce, or restructure this console output freely as long as `PIPELINE_SUMMARY`/`PIPELINE_META` (the real machine contract) are unaffected.
- The 2 fixed-date literals (`'2010-01-01'`, `'2020-01-01'`, §3.2) — deterministic, no non-determinism-inventory entry needed.

### 4.3 DEFECT — pin in current form, fix after (Spec 123 §3.1)

| Ledger ID | Anchor | One-line | Disposition |
|---|---|---|---|
| **ADB-D1** | `scripts/quality/assert-data-bounds.js:265`,`:418`,`:628`,`:846` | 4 hand-rolled verdict cascades (`permitHasFails ? 'FAIL' : permitHasWarns ? 'WARN' : 'PASS'` and 3 siblings) duplicate `scripts/lib/step/verdict.js`'s `deriveVerdict(rows)` — same class as `AS-D1`/`AGC-D6`. | Fix-after: commit 7's descriptor+compute conversion adopts `deriveVerdict` for all 4 tables directly, retiring the local copies. |
| **ADB-D2** | `scripts/quality/assert-data-bounds.js:1054` | Lock-contention skip is a **bare `return;`** with **zero step-level emit** — not even the hand-rolled skip shape this file's own siblings use, let alone the shared `skipRecordsMeta`/`RUN_STATUS.SELF_SKIPPED` shape (WD-1/A3 target state). Worse than `AS-D9`/`LR-D6`/`AGC-D7` (all of which at least emit SOMETHING on contention) — this file emits nothing at all on a chain-mode contended run: no `records_meta`, no `pipeline_runs` row. | Fix-after: commit 7 library adoption emits the declared `lock_held_elsewhere` terminal with a proper row-derived `audit_table`, mirroring `assert_schema`'s post-conversion shape. |
| **ADB-D3** | `scripts/quality/assert-data-bounds.js:980` | `checks_passed` is `'all'`/`undefined`, never a count — same class as `AS-D7`. | Fix-after: commit 7 declared diff — `checks_passed` becomes a real count derived from `rows`, mirroring the fleet-wide fix already landed for `assert_schema`. |
| **ADB-D4** | `scripts/quality/assert-data-bounds.js:986-996` | The standalone-run (no `CHAIN_ID`) audit-table selection picks the FIRST non-null table in a fixed preference order (permits → sources → coa → inspection, §1.4) and reports ONLY that table's rows in `records_meta.audit_table` — but `errors[]`/`warnings[]` (and thus `checks_failed`/`checks_warned`) still reflect ALL domains checked. A standalone run touching more than one domain can therefore show `checks_failed: 3` while the displayed `audit_table.rows` contains zero FAIL rows (the 3 failures live in a domain that lost the preference-order race). Genuine observability gap, not present in `assert_global_coverage` (which emits exactly one shared audit table regardless of chain). | Fix-after: commit 7's library conversion should emit all applicable per-chain audit tables in `records_meta` when running standalone (the archetype's multi-table shape already exists — 4 distinct `audit_table` keys, not a single shared one), or explicitly document the preference order as intentional in the descriptor's `why`. Human adjudicator to rule which. |
| **ADB-D5** | `scripts/quality/assert-data-bounds.js:24-34` (`LOGIC_VARS_SCHEMA`), `:73` | `calibration_freshness_warn_hours` is declared, Zod-validated, and required on every run, but has **zero runtime consumption** anywhere in the file body (confirmed by grep + full-file read, commit 1 §1.5) — dead since the V1 `timing_calibration` table was dropped in migration 106 (the file's own comment, `:927-928`, documents the V1→V2 migration but the schema entry was never pruned). An admin-configurable logic var that does nothing is a live footgun (an operator could "fix" a perceived staleness problem by tuning a value with zero effect). | Fix-after: either wire it into a real staleness check (if `phase_calibration`/V2 freshness genuinely wants this bound) or delete the schema key + seed entry — a trivial, behaviour-neutral peel correctly deferred out of this conversion. |
| **ADB-D6** | `docs/specs/01-pipeline/44_chain_deep_scrapes.md:322` (§4 quality table) vs `scripts/quality/assert-data-bounds.js:813` | Spec 44 §4 describes the ancient-inspection-date check as "(>5 years)" — a rolling window — but the live code uses a **fixed literal** `inspection_date < '2020-01-01'`. As of this session (2026-09-12), 5 years before today is 2021-09-12, not 2020-01-01 — the spec's rolling-window framing and the code's fixed-date implementation have already diverged by over a year and will keep diverging every year the fixed literal is not updated. | Fix-after: either correct Spec 44 §4 to describe the fixed 2020-01-01 cutoff accurately (matches this file's sibling `ancientHearing` pattern, `:346`, also a fixed literal), or convert the code to a genuine rolling `CURRENT_DATE - INTERVAL '5 years'` predicate — human adjudicator to rule which reading is the intended contract; recorded here rather than silently assumed either way. |

### 4.4 Defect ledger — recorded this commit

Appended to `docs/reports/defect-ledger.md` (6 rows, `ADB-D1`-`ADB-D6`, all `PIN`; ID scheme + column format matches the file's own header, mirrors the `AGC-D1`-`AGC-D7` precedent's row shape exactly).

### G6 verdict

Every notable behaviour in the file is classified CONTRACT, INCIDENTAL, or DEFECT (an exhaustive per-statement pass over all 105 statements — 56 domain SQL + 49 metrics — was judged disproportionate for a file whose CONTRACT surface is dominated by 5 already-named fences and whose remaining ~40 hardcoded thresholds are homogeneous referential-integrity/catastrophic-load invariants already covered by the §2.2 blanket disposition; any statement not explicitly named above defaults to CONTRACT — its exact threshold and predicate must survive per §2.3's census). 6 DEFECTs found, every one carries an `ADB-D<n>` ledger row with status `PIN` (fix deferred past conversion, per Spec 123 §3.1 — none silently fixed here). **G6: PASS** (every DEFECT has a ledger ID; `LEDGER_STATUS_VOCAB` — `CLOSED`/`PIN`/`OPEN` — satisfied by all 6 new rows, all `PIN`).

---

## 5. Non-determinism inventory (commit 5 → G1′; Spec 120 §14.2, claim #151/#151a)

Declared BEFORE the first capture, per Spec 122 §5.3's "non-determinism inventory declared before the first diff" and Spec 124 R-AC.

### 5.1 Harness volatiles (always masked/stripped by the normaliser, every step)

Confirmed against `scripts/analysis/capture-step-golden.js`'s own header comment (§(b)/(c)) and the `pipeline_runs` SELECT (`:762`):

- `duration_ms` — `pipeline_runs.duration_ms` column, and the step's own `durationMs` (`Date.now()` elapsed, §3.2) surfaced in `PIPELINE_META`.
- `sys_duration_ms` — the harness's own wall-clock measurement of the child process, recorded alongside the captured summary (never a step-emitted field).
- `chain_run_id` — `records_meta.chain_run_id` (R-U, the per-invocation chain-run correlation id).
- `pipeline_runs[].id` / `.started_at` / `.completed_at` — the ledger row's own PK and timestamps; **N/A for the 4 in-chain captures** (a step run under `PIPELINE_CHAIN` skips its own ledger row per run-chain's convention, confirmed by this file's own comment header §(c) — zero `pipeline_runs` rows expected for permits/coa/sources/deep_scrapes). Applies only to `standalone.json`, where this step owns its ledger row (`:92` INSERT / `:1004` UPDATE).
- resolve-db target stdout `migrations=N` — printed once per child-process boot by `scripts/lib/resolve-db.js:285`, not part of the captured JSON; recorded per-capture in §5.3 below as a live abort-check, not diffed.

### 5.2 The 4 clock-relative SQL predicate classes (§3.2), mapped to their metric names

| Class | SQL fragment | Metric(s) fed | Chain(s) |
|---|---|---|---|
| 1 | `NOW() - INTERVAL '1 day'` (4 sites, `:149/:158/:169/:180`) | `null_descriptions_24h`, `null_builders_24h`, `null_status_24h` (`recentTotal` itself is a denominator only, no standalone metric row) | permits |
| 2 | `CURRENT_DATE + INTERVAL '2 years'` (`:335`) | `future_hearing` | coa |
| 3 | `CURRENT_DATE - INTERVAL '30 days'` (`:938`) | `ghost_permits_30d` | permits |
| 4 | bare `CURRENT_DATE` (`:808`) | `future_dates` (inspection, via `checkInsp`) | deep_scrapes |

None of these 4 metrics' `value`/`status` fields are expected to be masked by the harness's normaliser (they are ordinary integers/percentages, not timestamps) — they are non-deterministic only in the sense that their VALUE can legitimately drift between the PRE and POST capture of the same chain if the underlying row population changes between runs (§5.3), not because the harness masks them structurally. Flagged here so a genuine future-diff on these 4 metrics is read as "the moving window rolled" or "a row count changed," not "the conversion broke something," before commit 5's PRE/POST pair is ever compared.

### 5.3 Rows depending on live table counts other chains mutate

This step reads 16 tables (§0 claim 5) on the shared local Docker DB — not a snapshot isolated per capture. The counts below are fed by scrape/ingest/link chains that run independently of this ASSERT step and can change between any two invocations if another chain runs in between:

`permits`, `coa_applications`, `permit_inspections`, `permit_trades`, `permit_parcels`, `entities`, `wsib_registry`, `cost_estimates` — all 8 are written by not-yet-converted producers or link steps (§3.6) that are not gated by this capture session. The remaining 8 read tables (`parcels`, `address_points`, `building_footprints`, `neighbourhoods`, `ravines`, `heritage_properties`, `heritage_districts`, `toronto_centreline`) are reference/batch-loaded tables not expected to mutate mid-session.

**Mitigation (pinned per the executor brief):** all 5 PRE captures (§5.4) run sequentially, back-to-back, with no intervening chain run — and the eventual POST captures (a later commit) must do the same relative to PRE, so any PRE/POST diff on these 8 tables' derived metrics is attributable to the conversion, not to an interleaved write from another process.

### 5.4 ASSERT specifics

- **Zero domain writes** — confirmed §0 claim 4 (the only 2 `pool.query` writes are the SDK-owned `pipeline_runs` ledger row, retired under conversion). The captures below read the DB; they write nothing new.
- **`table_state`, no descriptor yet:** `resolveTables({descriptor, tablesArg})` (`scripts/analysis/capture-step-golden.js:339-357`) returns `{tables:[], source:'none'}` whenever `descriptor` is `null` (no `assert-data-bounds.descriptor.json` exists — `fs.existsSync` false, `:930`) AND no `--tables=` CLI arg is passed. Neither capture below passes `--tables=`, so **no table snapshot is taken and no `table_state` entries appear in any of the 5 captures** — this is the ASSERT profile's expected shape (`outputs.writes` is forced `"none"` even post-conversion, §2, so `table_state` will never populate for this step by descriptor-derived means, not just pre-conversion). `source_fingerprint` is likewise expected `null`/SKIPPED for the same reason (`descriptorPathFor` doesn't exist yet, `:989` logs the SKIPPED line explicitly).

---

## 6. Session scope note (commits 1-4 only)

This deliverable covers PH-0 through PH-6 (G0, G3, G5, G6) of the nine-commit ledger (plan §3). **Commits 5-9 (golden master, red-first suite, descriptor+compute, peels, cutover+differential) are explicitly out of this session's scope** per the executor brief ("No code under scripts/lib, scripts/quality, src/tests/steps (commits 5-9)"; "No `converted.json` edit"). `step-validate --step=assert_data_bounds --fast` correctly reports "no step found" after every one of these 4 commits (re-run and confirmed after commits 1 and 2; the registry only gains an entry at commit 6's `pending` declaration) — this is expected, not a gap.

**Carried forward to whoever runs commits 5-9:**
- §2.1/§2.2's 11 `PROPOSED` Intent Ledger dispositions need a human adjudicator's ruling (Spec 123 §7.1) before commit 6/7 can cite them as `RULED`.
- §2.3's 49-row census is the direct input to `scripts/lib/assert-data-bounds-fields.js` (commit 7) — no further discovery needed, a transcription-plus-generator exercise.
- §8's Ask A1 (build `scripts/generate-assert-schema-probe-lists.js`, R-D 106→115 growth) is unresolved — still belongs to commit 9 per the plan.
- 6 `ADB-D` defects (§4.3) all target commit 7 for their fix, except ADB-D2/ADB-D4 which may warrant commit-6/7 test coverage first (both are library-adoption-shaped, not independent bugs).
- The plan's §12 handoff note should be amended to include `src/app/api/admin/control-panel/resync/route.ts:33` as a 5th consumer (§3.7 finding).

---

## 7. Commit 7 — descriptor + compute + shell + seeds + tests + G2′ golden diff (2026-09-12)

### 7.0 Risk class (chance × impact)

- **Chance:** HIGH. Top-right churn quadrant (commit 1 §0 claim 14: churn=58 commits, LOC 1,055, complexity high — `122-churn-complexity.md`), the widest fan-out of any batch-1 step (4 chains), and the file this session found a genuinely BROADER halt-classification surface than the plan's own "3 named push sites" framing (§7.3 below).
- **Impact:** HIGH. 16 tables read, feeds `FreshnessTimeline.tsx`/`DataQualityDashboard.tsx`/`funnel.ts`/`quality/types.ts`/`resync/route.ts` (5 consumers, §3.7), is Spec 30 §5.4.1's own named exhibit for the exception-vs-threshold halt architecture, and gates every downstream step in 4 chains on its own advisory lock (103).
- **Risk class: A** (chance HIGH × impact HIGH).

### 7.1 RED (commit 6, historical record — carried forward, not re-executed)

Commit 6 landed `src/tests/steps/assert_data_bounds/violations.test.ts` red-first: 8 `it.fails(...)` claims, every one genuinely RED against the not-yet-existing descriptor/compute (proven by the suite's own green run at commit 6 — a passing `it.fails()` IS the RED proof, per the file's own header mechanism). This commit (7) flips all 8 to plain `it(...)`, mechanical, body unchanged, and the suite is green again — now proving the claims are TRUE rather than merely "still RED."

### 7.2 Deliverables landed this commit

1. `scripts/lib/assert-data-bounds-fields.js` — CHECK_DEFS (52: 49 census metrics + 2 promoted warnings-only rows + 1 Pre-Permit id split) + LOGIC_VAR_DEFS (26: 8 existing + 18 new).
2. `scripts/generate-assert-data-bounds-descriptor.js` — pure `buildDescriptor()` + `--check` → `scripts/quality/assert-data-bounds.descriptor.json` (52 checks, 26 logic_variables, 16 read tables; AJV-valid; `database.min_migration` corrected to **244**, the measured live floor — the plan's placeholder 247 did not match the actual target DB and was caught by a live smoke-test run before any golden capture, not assumed).
3. `scripts/lib/compute/assert-data-bounds.js` — verbatim port, memoized per-branch loaders, the `:888`/`:894` `${...}` interpolations bound as query params (Fold A item 3, behavioural no-op).
4. `scripts/quality/assert-data-bounds.js` — the frozen 8-line shell.
5. Seeds: 18 new `scripts/seeds/logic_variables.json` rows + `CONSUMED by assert_data_bounds.` tags on all 26 (8 existing + 18 new); applied to the local DB (`node -r dotenv/config scripts/seeds/apply-logic-variables.js` → **18/489 inserted, 471 preserved**). `scripts/generate-logic-variable-groups.mjs` GROUP_ORDER updated (2 keys folded into "Data Quality Thresholds", 8 into "CoA Gates & Staleness", a new "Sources Catastrophic-Load Floors" group for 8 keys) and regenerated (29 groups, 490 keys).
6. R-D (Ask A1): `scripts/generate-assert-schema-probe-lists.js` — pure `buildProbeLists()`/`applyToText()` (surgical string-level splice, NOT a JSON.parse→stringify round trip — the latter was tried first and re-flowed ~90% of the file's unrelated formatting; reverted, replaced with a targeted regex splice touching only the two named arrays' own lines) + `--check`. **Measured result: 106 → 106 (no growth this commit)** — `collectDeclaredLogicVariableNames()` scans `converted.json.converted` only, and `assert_data_bounds` stays `pending` until commit 9's cutover per this session's explicit "do NOT touch converted.json.converted" instruction; the plan's own "106→124 expected" framing is corrected here, not silently met — the growth is deferred to commit 9, exactly as this report's own §6 "carried forward" note already flagged. Both-directions lock added to `src/tests/steps/assert_schema/violations.test.ts` (71 tests, all green): real-file `applyToText` is a byte-for-byte no-op; a mutated name list is detected as drift.
7. Tests: 8 `it.fails` → `it()` in `violations.test.ts` (30 tests, all green); the 6 G4d fences (IL-1..IL-6) REPOINTED from `src()` (the now-frozen shell) to `computeAndFieldsSource()` — a repoint this commit's own conversion made necessary (the shell no longer contains any of the domain logic the fences were written against), mirroring the SAME repoint Fold A item 1 already authorized for the sibling infra test. IL-1 narrowed to its 5 surviving vars (`calibration_freshness_warn_hours` is a POSITIVE-absence assertion now, not a preserved one). `src/tests/assert-data-bounds.infra.test.ts` repointed per Fold A item 1 (12 tests, all green): the 15 BEHAVIOUR assertions now read `COMPUTE`/`FIELDS`, the E10 assertion REMOVED (not repointed, per the plan's own prediction), the 3 SKELETON assertions replaced by a check that the old `LOGIC_VARS_SCHEMA`/`loadMarketplaceConfigs`/`validateLogicVars` convention is gone. `converted.json.pending[0].stage` advanced `red_suite` → `descriptor_only` (R-K.1 — the descriptor now exists and independently validates).
8. Defect ledger: **ADB-D7** added (OPEN · PIN) — `checkInsp()`'s displayed threshold parameter was found, re-reading the source this session, to be DISPLAY TEXT ONLY (every one of its 12 call sites evaluates purely `value > 0`); `ancient_dates`'s own `'<= 5'` label was never itself compared. `inspection_ancient_dates_count_warn_max` is declared (Rule 3) but not bound — a documented, not-fixed-here deviation (consequence 4, `assert-data-bounds-fields.js` header).

### 7.3 STOP finding — `calibration_freshness_warn_hours` NOT deleted (per the executor brief's own contingency)

Repo-wide grep found `scripts/compute-phase-calibration.js` (a DIFFERENT, unrelated step — timing_calibration/phase_stay_calibration staleness) genuinely consumes this same seed key via its own `LOGIC_VARS_SCHEMA`, locked by `src/tests/compute-phase-calibration.infra.test.ts:68`. Per the brief's explicit instruction ("if anything else consumes it, STOP and report instead of deleting"), the seed row **stays**, with its description amended to note the partial retirement. `assert_data_bounds`'s own descriptor/compute correctly declare/consume nothing named `calibration_freshness_warn_hours` (ADB-D5 retirement is real and complete FOR THIS STEP), locked both ways in `violations.test.ts` and the infra test.

### 7.4 STOP finding — `src/tests/db/assert-data-bounds-halt.db.test.ts` cannot currently execute against the converted shell

This regression lock (kept, unmodified, per the Operating Boundaries) **spawns the real script as a child process** against the `BUILDO_TEST_DB=1` testcontainer (database name `buildo_test`). Every converted step's descriptor declares `database.assert_current_database: "postgres"` (verified: all 10 prior conversions + this one), enforced unconditionally by `scripts/lib/resolve-db.js assertDbTarget`'s `expectDatabase` check (`scripts/lib/step/index.js:153 assertDatabaseTarget`) — so the frozen shell now REFUSES to run at all against `buildo_test` (`REFUSING: connected to database "buildo_test", expected one of "postgres"`), independent of anything this compute does. Confirmed this is a FLEET-WIDE, pre-existing structural gap, not specific to this conversion: `src/tests/db/link-wsib-token-overlap.db.test.ts` (link_wsib, already converted) invokes `scripts/lib/compute/link-wsib.js` DIRECTLY rather than spawning `scripts/link-wsib.js` — the established convention every prior converted step's own DB regression test already uses, for exactly this reason. `assert-data-bounds-halt.db.test.ts` was authored (2026-08-13, pre-dating this conversion) against the monolithic file, which had no `assertDatabaseTarget` check at all, and was never updated to anticipate one. A SECOND, independent break: its final `it('source assertion — the 3 exception-derived pushes...')` scans `SCRIPT` (the step file) for OLD literal JS text (`errors.push(wsibErr.message)` etc.) that no longer exists post-conversion — the same class of staleness this commit's own G4d/infra repoints fixed elsewhere, but this file's Operating Boundary said "kept, unmodified," so it was NOT touched. **Left exactly as committed** (5/5 tests fail when run under `BUILDO_TEST_DB=1`) — this needs a human ruling: (a) migrate to the fleet-standard compute-invocation pattern (~500-line rewrite, out of this commit's authorized scope), or (b) widen the DB-target allowlist fleet-wide, or (c) accept the gap for this commit and rely on the live-DB smoke runs below (§7.5) plus the code-level trace (§7.6) instead. The halt-classification BEHAVIOUR itself (Spec 30 §5.4.1) is implemented in `scripts/lib/compute/assert-data-bounds.js` (see its header) and traced against the live library's exception-propagation path (§7.6) — this STOP is about the TEST HARNESS's ability to prove it via THIS mechanism, not evidence the behaviour is wrong.

### 7.5 Live-DB smoke verification (127.0.0.1:54322/postgres, min_migration 244) — all 5 invocations, exit 0

| Chain | Verdict | checks_failed | checks_warned | Notable rows |
|---|---|---|---|---|
| permits | WARN | 0 | 1 | `ghost_permits_30d`=207632 (matches PRE exactly) |
| coa | PASS | 0 | 0 | `coa_forward_link_sub085_pct`=53.9, `null_address`=3, `ancient_hearing`=1, `coa_estimated_cost_gt10m`=66, `coa_maxbuild_gfa_gt3lot`=30 (ALL match PRE exactly) |
| sources | WARN | 0 | 1 | `parcel_lot_outliers`=4 (matches PRE); `address_points_count`=525346, `parcels_count`=486530, `building_footprints_count`=427077, `ravines_count`=854, `heritage_properties_count`=8824, `heritage_districts_count`=29, `toronto_centreline_count`=47363 (ALL match PRE exactly) |
| deep_scrapes | PASS | 0 | 0 | all-zero (matches PRE exactly) |
| standalone | WARN | 0 | 2 | both warnings present (`ghost_permits_30d`, `parcel_lot_outliers`); PRE also read `checks_warned:2` — ADB-D4's own finding (counts reflect all domains even though the OLD single-table preference-order display did not) is independently reproduced here |

Every non-INFO metric value/status this session compared BY NAME between PRE and this live run is byte-identical. **checks_failed/checks_warned parity holds exactly per chain** (LPA-D6/IL-7, Fold A item 2).

### 7.6 G2′ — formal golden capture, PRE vs POST, every diff leaf named

5 POST captures taken (`scripts/analysis/capture-step-golden.js`, back-to-back, no intervening chain run): `docs/reports/golden/assert_data_bounds/post/{permits,coa,sources,deep_scrapes,standalone}.json`, all exit 0, verdicts matching §7.5 exactly. `--compare` run for all 5 pairs: **107 / 79 / 103 / 86 / 269 differences** respectively (permits/coa/sources/deep_scrapes/standalone) — every one of them falls into one of these DECLARED, NAMED leaf-field buckets (none are a value/status/metric change on any real check row — confirmed by the per-metric table in §7.5 above):

- **`reads`** (`meta.reads.*`, all 16 table names: `address_points`, `building_footprints`, `coa_applications`, `cost_estimates`, `entities`, `heritage_districts`, `heritage_properties`, `neighbourhoods`, `parcels`, `permit_inspections`, `permit_parcels`, `permit_trades`, `permits`, `ravines`, `toronto_centreline`, `wsib_registry`) — PRE's hand-rolled `emitMeta` declared a coarse 7-table `"*"`-wildcard read set; POST's descriptor-derived `inputs.reads` declares the full, precise 16-table/per-column set. CONTRACT-correcting structural improvement (PH-6 §4 classification, not a Spec 123 §3 DEFECT — no computational change, only the declaration becomes complete).
- **`writes`** (`meta.writes.pipeline_runs`) — PRE incorrectly declared `pipeline_runs` as a write target even though the ASSERT profile forces `outputs:"none"`; POST's `writes:{}` is correct.
- **`name`** (`audit_table.name`) — the declared, cosmetic-only consequence (§ fields-module header consequence 1): one shared `"Data Quality Checks"` for all 4 chains, replacing the coa/sources/deep_scrapes chains' distinct pre-conversion names.
- **`phase`** (`audit_table.phase`) — permits 15→22, coa 8→11, sources 14→27, deep_scrapes 3→5, standalone 15→0. The library's `resolvePhase()` reads `sharing.varies_by_chain.phase`, which is the MANIFEST CHAIN POSITION (22/11/27/5, matching `assert_global_coverage`'s own precedent), not the old runtime `audit_table.phase` constant (15/8/14/3) — no second field exists in the schema to carry both meanings. Standalone resolves to 0 because the 4 per-chain values disagree (`resolvePhase`'s own documented fallback).
- **`rows`** (`audit_table.rows[N].source`, `.threshold`) — every row now carries a NEW `source:"check"` field (library instrumentation, absent pre-conversion) and a library-standardised `threshold` LABEL (e.g. `"< 20"` → `"viol == 0"`, `"== 0 (> $50M, 3 accepted)"` → `"viol == 0"`) — the underlying bound is unchanged (confirmed value/status-identical in §7.5); only the rendered STRING differs, the same "(a)" class of consequence I1's own report already named for this exact library-adoption pattern.
- **`rows[N].value`/`rows[N].status`** at specific array indices (permits rows[10]/[11], standalone rows[10]/[11] and the [12]-[51] range) — POSITIONAL reshuffling, not a semantic change: 2 new visible rows (`cost_estimates_null_rate`/`cost_estimates_min_tiers`, consequence 3) are inserted mid-array in POST, and standalone's row COUNT grows from 14 (PRE's single-preferred-table view) to 52 (POST's all-4-chains-combined view, the declared `limitations[]` entry / ADB-D4 resolution) — every metric NAME's own value/status is unchanged when compared by name (§7.5), only its array INDEX shifts.
- **`config`** — PRE had no `config` key at all (the old file never stamped its logicVars into records_meta); POST stamps all 26 resolved values (`records_meta.config`), a Nothing-Hidden addition.
- **`ledger_row`**, **`pool_errors`**, **`terminal`** — 3 NEW instrumentation keys the shared library stamps on every run (`ledger_row`: `"chain_owned"`/`"owned"`; `pool_errors`: `0`; `terminal`: `"all_checks_passed"`), absent from the pre-conversion hand-rolled `records_meta` entirely.
- **`warnings`** — message FORMAT changed from free-text sentences (`"4 parcels with lot_size_sqm out of bounds (0-1M sqm)"`) to structured `"<check.id>: <value>"` pairs (`"parcel_lot_outliers: 4"`) — same underlying facts, library-standard rendering (matches every other converted step).
- **`records_total`** (`summary.records_total`, `pipeline_runs[0].records_total`) — PRE emitted the literal `0`; POST emits `null`, the Spec 122 §1.10 ASSERT/Observer convention (`records_total: null for read-only/Observer scripts`) every converted ASSERT already follows — PRE's `0` was itself the contract-inconsistent value, corrected here.
- **`records_new`**, **`records_updated`** (standalone `pipeline_runs[0]` only) — both were already `null` in PRE; POST's normaliser reports them as differing only due to the surrounding `records_total` shape change, not an independent difference.
- **`error_message`** (standalone `pipeline_runs[0].error_message` only) — PRE carried the human-readable joined `errors`/`warnings` string; POST's is `null` because the run had zero FAIL rows (only WARN) — the library reserves `error_message` for a genuinely failed/errored run, consistent with `status` becoming the more precise `"completed_with_warnings"` (Spec 120 §3.2b vocabulary) rather than PRE's bare `"completed"` — an observability IMPROVEMENT, not a loss (the same facts are fully visible in `checks_warned`/`warnings[]`).
- **`status`** (`pipeline_runs[0].status`, standalone only) — `"completed"` → `"completed_with_warnings"`, the more precise status vocabulary, described immediately above.
- **`stdout_lines`** (permits 19, coa 14, sources 24, deep_scrapes 18, standalone 54 differences) — PRE's narration was raw `console.log`/`console.error` text; POST's is `ctx.log.info`/`.error` structured JSON lines (`pipeline.log`'s convention) — different text, same narrative content, purely a harness-visible operator-facing channel (Spec 122 §5.5, `pipeline.emitSummary`/`emitMeta` — the real machine contract — are unaffected). Confirmed: this bucket alone accounts for the bulk of each pair's raw difference COUNT (19/14/24/18/54 of the totals above).

**No diff leaf falls outside this named list.** Every per-chain verdict and `checks_failed`/`checks_warned` pair matches PRE exactly (§7.5 table) — the substantive behaviour is unchanged; every named difference above is either a structural CONTRACT-correction (declared PH-6 §4), a previously-declared conversion consequence (fields-module header, consequences 1-4), a Spec-122-standard library-adoption shape (matching I1's own precedent), or a pure narration-format change.

**Exact per-capture `stdout_lines` and `rows` difference counts** (the two purely-structural, no-own-field-name buckets — cited here explicitly by count, not merely by category, since an array-index diff has no leaf name of its own to cite): permits.json has 19 differences under `stdout_lines` and 5 differences under `rows` (the 2 newly-inserted `cost_estimates_null_rate`/`cost_estimates_min_tiers` rows, consequence 3, shift every row after index 11); coa.json has 14 differences under `stdout_lines`; sources.json has 24 differences under `stdout_lines`; deep_scrapes.json has 18 differences under `stdout_lines`; standalone.json has 54 differences under `stdout_lines` and 40 differences under `rows` (the all-4-chains-combined view, `limitations[]`/ADB-D4). Every one of these `stdout_lines`/`rows` differences is accounted for by the two mechanisms already named above (console→ctx.log narration format; the 2 promoted rows + the standalone combined-table structural change) — none is a metric value or status change (§7.5's per-metric table already proved that by name).

### 7.7 `step-validate --step=assert_data_bounds --fast` scorecard

Recorded (`node -r dotenv/config scripts/analysis/step-validate.mjs --step=assert_data_bounds --fast`): **8/17 at first run**, converging toward the target as this section's own G2′/G4/G7 grounding lands (G8's unexplained-diff count is resolved BY this section — §7.6 names every leaf the tool's own citation-matching logic scans for). `converted.json.pending[0].stage` advanced to `descriptor_only` this commit (R-K.1). Full cutover (G7 lock-coverage, G8 captures-complete, the remaining programme-registry items) is commit 9's, per the plan's own nine-commit ledger (§3).

### G7 verdict (RED, commit 6, re-affirmed) / this commit's own verdict

Commit 6's suite was fully RED for the right reason (§7.1). This commit (7) makes every one of those 8 claims TRUE, ports the file behaviour-neutrally (§7.5/§7.6 — zero verdict/count/value regressions found), and surfaces 2 genuine, previously-unknown findings this session (§7.3 the `calibration_freshness_warn_hours` second-consumer STOP, §7.4 the DB-halt-test harness STOP, and ADB-D7 the `checkInsp()` display-only-threshold finding) — all reported rather than silently resolved.

---

## §R. Reflection (written this commit — `converted.json.pending[0].stage` reached `shape_clean`, removing G9's stage-gate; commit 9 may append its own cutover addendum)

**Low-confidence table** — claims that needed correction during this commit, or that a future reader should re-verify rather than trust on first read:

| Claim | Where | What was wrong / what to re-check |
|---|---|---|
| `database.min_migration: 247` (copied from a sibling report's citation) | first descriptor draft, this commit | **WRONG.** A live smoke run against the actual target DB (`127.0.0.1:54322/postgres`) measured 244 applied migrations, not 247 — `assertDbTarget` refused with `REFUSING to run against a below-floor database`. Caught by RUNNING the step before any golden capture, not by assumption; corrected to 244 in the same commit. |
| The R-D probe-list generator could safely `JSON.parse` → mutate → `JSON.stringify(obj, null, 2)` | first `generate-assert-schema-probe-lists.js` draft | **WRONG.** `assert-schema.descriptor.json` mixes compact single-line and expanded multi-line JSON formatting by hand; a full parse/stringify round trip re-flowed ~90% of the file's unrelated bytes for a 0-name-count change. Replaced with a surgical string-level splice touching only the two named arrays' own lines — verified `--check` reports clean (byte-identical) against the real, unchanged 106-name derivation. |
| `checks[].why` is a plain string (the pre-existing `violations.test.ts` TS interface said `why?: string`) | flipping the 8 `it.fails` claims that read `check.why` | **WRONG.** `step.schema.json`'s `definitions.why` requires an object `{text, liveness}` — every I1/assert_schema precedent generator already emits that shape. The test's own interface and 3 `toMatch()` call sites were stale against the schema, not against my descriptor; repointed to `check.why?.text`. |
| The 6 G4d fences (IL-1..IL-6) and the halt-classification DB test would "survive the conversion unmodified" (the plan's own framing) | plan §Standards Compliance, this report's earlier commits | **PARTIALLY WRONG.** The G4d fences and the sibling infra test genuinely could not survive unmodified — `src()` reads the frozen shell, which no longer contains any of the text they scanned for; repointed to `computeAndFieldsSource()`, the SAME repoint class Fold A item 1 already authorized for the infra test. `db/assert-data-bounds-halt.db.test.ts`, which WAS required to stay "kept, unmodified," genuinely CANNOT execute against the converted shell under `BUILDO_TEST_DB=1` (§7.4) — a fleet-wide, pre-existing gap the plan's authors did not verify by running it. |
| `permits_pre_permit_count` and `calibration_freshness_warn_hours` could each be handled with a single declaration change | PH-3 adjudication (§2.4, prior session) / report §2.4 item 18 | **PARTIALLY WRONG, both.** IL-3's "2 independent checks" ruling requires 2 DIFFERENT descriptor ids (a `checks[]` id doubles as the compute dispatch key — 2 entries sharing one id silently collide), not 2 rows sharing one metric name as pre-conversion did — a cosmetic consequence (consequence 2) the ruling itself did not spell out. `calibration_freshness_warn_hours`'s seed row was assumed deletable ("retire the schema key + seed entry") — a repo-wide grep this session found a genuine second live consumer (`scripts/compute-phase-calibration.js`); STOPPED and reported rather than deleted (§7.3). |

**Recurring / standard-shaping table** — patterns this commit confirms or extends beyond this one step:

| Pattern | Instance this pass | Generalizes to |
|---|---|---|
| A hand-rolled `checkInsp()`-style helper's DISPLAY parameter can silently diverge from its actual comparison logic | `ancient_dates`'s `'<= 5'` label was never itself compared (ADB-D7) — every `checkInsp()` call site evaluates purely `value > 0` regardless of the displayed threshold | Before promoting a pre-conversion display string into a real config-driven bound, TRACE the comparison function's actual runtime logic, not the label text — a label is documentation, not a contract, until proven otherwise by reading the code (CLAUDE.md PD #10) |
| A step-library convention (a DB-target guard, a `--check`-locked generator, a `converted.json.pending` stage machine) that works for ONE converted step's own regression tests can silently fail for the NEXT one whose tests were authored before the convention existed | `assertDatabaseTarget`'s `expectDatabase` check breaks any DB test that spawns the real frozen shell against a differently-named testcontainer — every prior converted step's own DB test already avoided this by invoking `compute.js` directly; `assert-data-bounds-halt.db.test.ts` was authored before conversion and never updated | Before declaring a pre-existing test "kept, unmodified" as part of a conversion plan, RUN it against the converted artifact once, not merely cite its Operating-Boundary status — a plan-time assumption about test survivability is exactly the class of unexecuted claim the Grounded Verification Protocol exists to catch |
| A `converted.json.pending[].stage` advance has DOWNSTREAM gate consequences (G9's stage-gate lifts at `shape_clean`) that are not obvious from the R-K.1 rule text alone | advancing `red_suite` → `descriptor_only` → `shape_clean` in the same commit (required by two separate `step-conformance.infra.test.ts` locks, run in sequence) removed G9's exemption and required this very Reflection section to exist | When a stage machine's terminal states double as gate exemptions, advancing past one boundary should be immediately re-validated against the NEXT gate's requirements in the same commit, not assumed to be a purely mechanical bookkeeping change |
