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
