# Batch 2 Phase 3 row 3.10 — `enrich_centreline` conversion assessment

**Commit form: compressed (R-PACE-1)**

> **Status: commit ① — assessment + red suite + Defect Ledger rows. PRE goldens NOT captured** (a
> `load_wsib` capture holds the one heavy DB slot; ① is ready for captures — §9 lists the exact commands).
> **NOT converted.** ENRICHER has three converted members — `enrich_parcels`, `enrich_ravines`,
> `enrich_heritage` [READ `ls scripts/*.descriptor.json`] — so R-AH makes the compressed form the DEFAULT;
> no reason for the full form applies, so the marker above is present.

**Target slug:** `enrich_centreline` · **Script:** `scripts/enrich-centreline.js` — 627 lines [MEASURED `wc -l`]
· **Chain:** `sources`, position 14 [READ `scripts/manifest.json:105`] · **Lock:** 64 [READ legacy `:19`] ·
**Manifest** [READ `manifest.json:22`]: `supports_full:false, supports_dry_run:false, telemetry_tables:[parcels],
telemetry_null_cols:{parcels:[primary_frontage_street_name]}`.

**Target spec (governing spec):** `docs/specs/01-pipeline/62_source_centreline.md` — the ONLY census owner spec
[READ `step-archetype-census.json` row `enrich_centreline`: `owner_specs: ["docs/specs/01-pipeline/62_source_centreline.md"]`].
System-map rows 43 and 62 both name the script [READ `00_system_map.md:43`, `:62`]. Architecture: Spec 122
(§1.10 ENRICHER, §4.1 layout), procedure Spec 123 (§6 G0–G9, §7), policy Spec 124 (Rules 1–13, §5 R-BA, R-BD, R-BE).

**Governing plan:** `.cursor/batch2_enrich_centreline_active_task.md` (AUTHORIZED 2026-09-29; D1 = (a) port the
three-mode gate verbatim; D2 HEAD-first else FORCE_FULL over the perturbed cohort; D3 = 240 min; D4 WARN-only
plausibility; D5 EC-D1/D4/D5 as ④ commits). Cited "plan §N" / "Fold A<n>" / "RC-<n>". **Every plan claim below
was re-grounded in this worktree (`wf2/enrich-centreline` at `4a74da2d`) or against the local dev DB; §8 lists
every premise that did not survive.**

**Measurement environment:** read-only SELECTs on the local dev DB (`current_database()=postgres`,
`inet_server_addr()=172.20.0.5`), inside `BEGIN READ ONLY … ROLLBACK`, 2026-09-30. No DB write was made by ①.

**Spec 121 §4.3 governs method:** zero behaviour change; every carried defect is pinned by an `EC-D<n>` id and
fixed later in its own RED→GREEN commit (④, plan D5).

---

## 1. PH-0 — BOUNDARY FREEZE (G0)

The PH-0 boundary freeze is the legacy script's observable surface, enumerated from the source [READ full].

### 1.1 Writes — `parcels`, 5 columns, class N `set_based_join_update`
| Column | Type [MEASURED information_schema] | Written by |
|---|---|---|
| `is_corner_lot` | boolean NOT NULL DEFAULT false | UPDATE `:254` |
| `is_through_lot` | boolean NOT NULL DEFAULT false | UPDATE `:255` |
| `primary_frontage_street_name` | text NULL | UPDATE `:256` |
| `abuts_laneway` | boolean NOT NULL DEFAULT false | UPDATE `:257` (mig 191) |
| `centreline_dataset_version_when_enriched` | text NULL | UPDATE `:258` = `$1` |

Guard: 5-disjunct `IS DISTINCT FROM` including the stamp [READ `:261-265`] — so a same-version rerun writes 0
rows. One transaction: temp build + UPDATE + tally [READ `:510-513`]. No retraction: a parcel not in the temp
table keeps its values (EC-D4). No INSERT anywhere (class N).

### 1.2 Reads
`parcels(id, geom, address_number, street_name_normalized, centreline_dataset_version_when_enriched)`;
`toronto_centreline(id, geom, linear_name, linear_name_full, from/to_intersection_id, lo/hi_num_l/r,
parity_l/r, feature_code_desc)`; `pipeline_runs` twice — the producer contract (`sources:load_centreline`,
`status='completed'`, `:318-338`) and the self read (`sources:enrich_centreline`, `:289-301`, audit-row fallback
`:298-300`); catalogue probes `pg_extension`, `pg_indexes`, `information_schema.columns`, `pg_proc` (`:343-376`).

### 1.3 Modes (P11-1, `decideCentrelineMode` `:420-424`)
| Mode | When | SQL | Emit |
|---|---|---|---|
| full | producer version ≠ last enriched version, or no prior run | preconditions + unscoped build + UPDATE + tally + diagnostics | full shape `:571-588`, 16 audit rows, row-derived verdict |
| incremental | unchanged version, staleCount > 0 | preconditions + DROP + scoped build (`$1`) + UPDATE + tally | reduced shape `:466-474`, 6 INFO rows, verdict literal `PASS` |
| skip | unchanged version, staleCount = 0 | none (no preconditions, no txn) | reduced shape, `records_updated:0` |

### 1.4 Audit rows / verdict / `records_meta`
Full: 5 graded rows [READ `gradeDiagnosticRows :427-436`] + 11 INFO rows [READ `:548-558`], verdict
`verdictCascade(rows)` [READ `:405-408`]. Reduced: 6 INFO rows + verdict literal `'PASS'` [READ `:447-463`].
Counters: `records_total:null, records_new:null, records_updated:rowCount` [READ `:456-458`, `:561-563`].
`records_meta.centreline_enrich` — full 15 keys [READ `:571-588`], reduced 7 keys [READ `:466-474`];
`emitMeta` mode-dependent [READ `:477-483`, `:592-598`].

### 1.5 Exits and ledger
Exit 0 on every terminal; each contract/precondition throw exits non-zero through `pipeline.run`. Lock
contention: `withAdvisoryLock` SDK SKIP [READ `:487`, `:604`]. **Legacy writes NO `pipeline_runs` row of its
own**, chain or standalone — run-chain owns the chain row `sources:enrich_centreline` and writes
`status='completed'` for every successful step [READ `run-chain.js:965-973`].

### 1.6 Behaviour ledger (plan §2, re-grounded)
Plan §2 rows 1–21 were re-read line by line against the legacy source and the runner seams they name
[READ `scripts/lib/step/index.js` `runEnrichPhase :3872`, `contract_read` call `:3955`, `post_phase` call
`:4770-4772`, pass invocation `passSpec.run(client, passCtx, config)` `:4404`, `joinUpdate` `:4284-4299`,
`REQUIREMENT_PROBES :514-521`, `full` fold `:3887`]. Every legacy line maps onto an existing seam; no runner
rung is needed (plan §4 survives). Corrections to rows 16 and 21's "explained diff — standalone ledger" are in §8.

---

## 2. PH-2 churn × complexity, G1 archaeology, G4 risk class

**PH-2 (G2):** `docs/reports/generated/122-churn-complexity.md:40` — `enrich_centreline`: 5 commits, 647 lines
changed, LOC 288, branches 45, quadrant **bottom-left** (window `39313d92`). Not top-right, so PH-3 is driven by
the fences, not the quadrant.

**G1 archaeology** (`git log --follow -- scripts/enrich-centreline.js`, 5 commits):
`c1161f38` (feat, WF2 proximity, Severity CRITICAL) · `4b7f6eb0` (fix #431 abut-both) · `0ebda39a` (fix #431-FU
laneway) · `b0c01fe5` (feat Spec 65 Phase 3, `abuts_laneway`) · `b2d7dd4a` (feat P11-1 version-skip).
Fix density 2/5 = 40%; every constant in the §11 chain is a fence with a recovered commit (§4).

**G4 — risk class A** (Spec 123 §2.1: risk = chance × impact).
* **Chance: MEDIUM** — low churn (bottom-left), but 40% fix density and 8 fences on one SQL chain.
* **Impact: HIGH** — 5 derived columns on 496,510 parcels; read by `enrich_parcels`/`max-build`/`optimal-config`
  (setbacks, laneway suite) and propagated to permits/coa by `enrich_permits`, whose `assertCentrelineEnriched`
  is a cross-chain HALT. Impact multiplier present: *derived values with no invalidation path* (EC-D3, EC-D4).
* Class A ⇒ every class-A behaviour gets a both-directions lock (G7) — §10.

## 3. Registry target review (closed set — the step's own registry)

Reproduce (plan §1, with Fold A2's `':!scripts/surfaces'` exclusion dropped):
```
git grep -n -E "enrich_centreline|enrich-centreline|centreline_enrich\b" -- scripts src ':!src/tests'
git grep -l -E "is_corner_lot|is_through_lot|primary_frontage_street_name|abuts_laneway|centreline_dataset_version_when_enriched" -- scripts src ':!src/tests'
git grep -c -E "enrich_centreline|enrich-centreline|centreline_enrich\b|centreline_dataset_version_when_enriched|is_corner_lot|abuts_laneway" -- src/tests
```

### (a) §4.1 files (Spec 122 §4.1)
`scripts/enrich-centreline.js` (→ frozen shell at ②) · `scripts/enrich-centreline.descriptor.json` (new ②) ·
`scripts/enrich-centreline.notes.json` (new ②) · `scripts/lib/compute/enrich-centreline.js` (new ②) ·
`src/tests/steps/enrich_centreline/violations.test.ts` + `fixtures/legacy-enrich-centreline.js.txt` (new ①).
Spec 62 §5 `### Target Files` carries a GENERATED block (R-BE) whose `enrich_centreline` entry is regenerated by
`npm run target-files` in this commit (it now lists `src/tests/steps/enrich_centreline/violations.test.ts`).

### (b) Data — every table and migration
`parcels` (5 written columns: migs `174_parcels_centreline_columns.sql`, `191_parcels_accessory_columns.sql`);
`toronto_centreline` (read; mig 173, producer `load_centreline`, class C full replace); indexes 039/173/175;
functions `normalize_address_number`, `address_match_status` (173, search_path pinned 225); `pipeline_runs`.
The stale set is defined upstream by `load_parcels`' #418 fence [READ `scripts/load-parcels.descriptor.json:120-125`:
`set_null_on_change_of: "geom"` for `centreline_dataset_version_when_enriched`].

### (c) Consumers (declared + undeclared readers)
| Reader | Reads | Impact under byte-identical columns |
|---|---|---|
| `enrich_centreline` (next run) | `records_meta.centreline_enrich.source_dataset_version`, fallback audit row `centreline_source_dataset_version` [READ legacy `:289-301`] | the mode gate — both keys must survive every run |
| `scripts/enrich-permits.js` `assertCentrelineEnriched` [READ `:301-332`] | `max(completed_at)` over `pipeline IN ('sources:enrich_centreline','enrich_centreline') AND status='completed'` [READ `:307`] + stamp coverage ≥ `centreline_propagation_coverage_min` [READ `:320`] | load-bearing cross-chain HALT; reads no `records_meta` key |
| `scripts/enrich-permits.js` `CENTRELINE_COLS`, propagation SELECT (Fold A2) | the 4 parcel columns | none |
| `scripts/lib/compute/enrich-parcels.js`, `scripts/lib/max-build.js`, `scripts/lib/optimal-config.js` | corner/through/laneway | none |
| `scripts/lib/compute/assert-global-coverage.js`, `scripts/lib/assert-global-coverage-fields.js`, `scripts/quality/assert-global-coverage.descriptor.json` | propagated copies / field grid | none |
| `src/lib/admin/parcel-lookup.ts`, `src/lib/admin/funnel.ts`, `src/components/FreshnessTimeline.tsx` | display, freshness | none (funnel is gate-D corpus) |
| surfaces: `_schema/census/{contracts,admin-existing,mobile-product}.json`, F08 `contract_admin_parcels_lookup` + `admin_parcel_cost`, F02 `contract_parcels_lookup` + `mobile_parcel_detail`, F01 `mobile_parcel_search`, F90 ×2, F91, F92, F16 `contract_admin_stats` + `admin_data_quality` | slug / columns as a source | none |
| `scripts/analysis/*` (parcel-field-dump, wf3-* ×5, phase3-accessory-validation.sql) | read-only analysis | none |
| registries: `manifest.json:22,:105`; census row; `consumer-registry.json:50-57` (this step as CONSUMER of `load_centreline.centreline_load`); `programme-items.json` LC-4 `:528`; `seeds/lineage-meta-snapshot.json` | — | ③ via `npm run cutover` |

### (d) Tests naming the script / the columns
`src/tests/enrich-centreline.{logic,infra}.test.ts` (122 / 135 lines), `src/tests/db/migration-174-centreline-enrich.db.test.ts`
(298 lines, the only real-PostGIS §11 proof incl. the CE-CORNER / CE-THRU / CE-LANE fixtures),
`src/tests/enrich-parcels-accessory.logic.test.ts` — all re-pointed at ② (plan §1d). Consumer fences that stay
green UNEDITED: `db/enrich-permits-centreline.db.test.ts`, `enrich-permits-centreline.logic.test.ts`,
`pipeline-advisory-lock.infra.test.ts` (lock 64), `steps/load_centreline/violations.test.ts`, `step-seam.logic.test.ts`
(pair count moves at ③). **Unread rows: none.**

---

## 4. PH-3 — Intent ledger (G3)

Evidence per fence: `git log --follow -p -- scripts/enrich-centreline.js` and `git log -S` on each constant. A
human / separately-grounded reviewer adjudicates the dispositions (Spec 123 §7.1); the column is this seat's proposal.

| # | Fence (legacy anchor) | Why it exists (commit) | Disposition (closed set: preserved-in-runner · preserved-in-compute · encoded-as-descriptor-field · encoded-as-deviation · knowingly-retired) |
|---|---|---|---|
| F1 | lock 64 `:19` | L4b: the spec's 66 collided with enrich-permits; 64 is the free sibling of load = 63 (`c1161f38`) | preserved-in-runner (`identity.lock: 64`) |
| F2 | four contract HALTs + `'1.1'` pin, BEFORE any txn `:318-338` | §9 DEC-E consumer protocol — never enrich against an unversioned or empty producer (`c1161f38`) | preserved-in-compute (`contract_read`; why in notes.json) |
| F3 | producer name `sources:load_centreline`, not the spec literal `source-centreline` `:21-23` | the #409 trap: run-chain records chain-prefixed names (`c1161f38`) | preserved-in-compute (why in notes.json); EC-D10 carried |
| F4 | 20 m `ST_DWithin(::geography)` join `:86` | WF2 CRITICAL: `ST_Intersects` enriched 255 / 486,530 parcels (0.05%); p90 distance 12.9 m (`c1161f38`) | preserved-in-compute (value via `enrich_centreline_proximity_m`; why in notes.json) |
| F5 | `parcel_segments AS MATERIALIZED` + `geom IS NOT NULL AND ST_IsValid` `:68`, `:87` | read by 5 CTEs; geom-validity precedent F2 (`c1161f38`) | preserved-in-compute (why in notes.json) |
| F6 | both names NOT NULL for corner/through (DEC-C) `:131`, `:149` | unnamed laneways within range are not "a different street" (`c1161f38`) | preserved-in-compute (why in notes.json) |
| F7 | abut-both ≤ 13 m + opposite-side 45° from `ST_PointOnSurface` + degenerate CASE `:135`, `:184-202` | #431: the 20 m radius over-flagged corner 24% / through 16.7% (`4b7f6eb0`) | preserved-in-compute (13 / 45 via config; why in notes.json) |
| F8 | laneway exclusion `LOWER(feature_code_desc)='laneway'` `:83`, `:139`, `:205` | #431-FU: named rear lanes inflated through to 11.3% → 0.98% (`0ebda39a`) | preserved-in-compute (vocabulary, Rule 4; why in notes.json) |
| F9 | `abuts_laneway` = `bool_or(seg_is_lane)` + 5th guard disjunct `:96-102`, `:264` | #431-FU2 / Spec 65 Phase 3 laneway-suite gate (`b0c01fe5`) | encoded-as-descriptor-field (`guard_columns`) + preserved-in-compute (why in notes.json) |
| F10 | three-mode version-skip gate; reduced runs land `completed` `:420-424`, `:438-507` | P11-1: ~92 min full vs 11.2 s incremental; a SKIP payload would HALT `assertCentrelineEnriched` (`b2d7dd4a`; consumer `2b7bd46b`) | preserved-in-compute (D1 = (a); why in notes.json); EC-D1 carried |
| F11 | scoped build: DROP issued separately, one `$1` `:274-283`, `:381-383` | the extended protocol forbids multi-statement parameterized queries (`b2d7dd4a`) | preserved-in-compute (builder, LC-4 retired; why in notes.json) |
| F12 | #418 DEC-FENCE2: stamp NULLed on geom change (in `load_parcels`) | makes moved parcels stale for the P11-1 gate (`4b438c84`; as-built descriptor `1414cb73`) | encoded-as-descriptor-field (in `load_parcels`' descriptor, not this step); EC-D3 carried |
| F13 | L30 cap `rn <= 20` by `centreline_id` `:105-107` | Cartesian-explosion bound on per-parcel pairs (`c1161f38`) | preserved-in-compute (`enrich_centreline_pair_cap`; why in notes.json); EC-D9 carried |
| F14 | `assertPreconditions` inside the txn `:343-376` | DEC-E G2: refuse a seq-scan join / a missing migration (`c1161f38`) | encoded-as-descriptor-field (`guards.requires`); non-empty probe preserved-in-compute (why in notes.json); EC-D5 carried |
| F15 | frontage P1 name / P2 address range / P3 nearest `:211-232` | WF2 DEC-B (R2): proximity ⇒ no overlap, so P3 = nearest segment (`c1161f38`) | preserved-in-compute (why in notes.json) |
| F16 | `round1(1000·x/t)/10` percentages `:410-412`, `:539-542` | display rounding of the diagnostics (`c1161f38`) | preserved-in-compute (`enrich_centreline_round_scale`; why in notes.json) |

Every fence above has a recovered why; **no `INTENT-UNKNOWN` row**. F2/F4/F7–F11/F13/F14 have a both-directions
lock in the red suite (§10).

---

## 5. PH-5 — Seam map (G5)

| Seam | Legacy | Converted seat |
|---|---|---|
| **DB seam** | `pipeline.withAdvisoryLock(pool, 64)`, `pipeline.withTransaction`, raw `pool.query` / `client.query` [READ `:487`, `:510`] | runner pool + shared-txn `client`; `contract_read(pool)` pre-txn [READ index.js `:3955`]; the pass gets `client` + `ctx.joinUpdate` (class N refuses INSERT/ON CONFLICT [READ `write.js:1616-1626`]); `post_phase(pool, …)` after COMMIT [READ `:4770-4772`] |
| **Clock seam** | `RUN_AT = pipeline.getDbTimestamp(pool)` (DB clock) `:489`; `t0 = Date.now()` elapsed only `:488` | runner `runAt` / `clockNow` → `completed_at`; runner-owned `duration_ms` |
| **Network seam** | none — the step reads only the DB | `execution.network: "none"` |
| **argv/env seam** | no argv (manifest `supports_full:false`, `supports_dry_run:false`); `PIPELINE_CHAIN` set by run-chain | `invocation.sources.env.PIPELINE_CHAIN`; NEW additive `ENRICH_CENTRELINE_FORCE_FULL` (`override.force_full`, enrich_heritage precedent) — a declared deviation, needed by the D2 POST full-mode proof |

---

## 6. PH-6 — Classification + defect ledger (G6)

Every behaviour in §1 is CONTRACT except the rows below. CONTRACT = ported verbatim. INCIDENTAL = log
lines (`pipeline.log.info` text `:504`, `:516`, `:600`) — not preserved byte-for-byte; the runner logs its own.

### 6.1 Defect ledger — `EC-D1 … EC-D10` (prefix = slug initials [READ `step-validate.mjs` `defectPrefixFor`]; `git grep -E "\bEC-D[0-9]"` = 0 hits before this commit)
| Ledger id (defined in `docs/reports/defect-ledger.md`; cited here) | Finding [evidence] | Classification | Closes at |
|---|---|---|---|
| `EC-D1` | Reduced modes never grade: verdict literal `'PASS'` `:463`, 6 INFO rows `:447-454`; the L21 zero-intersection FAIL gate runs only in `full` | DEFECT · PIN | ④a: table-derived zero-pct every run (Rule 10) |
| `EC-D2` | `skip` is unreachable in steady state: out-of-range parcels are never stamped, so `countStaleParcels` `:305-313` always counts the tail (measured 24,426 stale today, 16,060 after one absorption run — §8) | DEFECT · PIN (observability only) | carried; the PRE golden runs `incremental` |
| `EC-D3` | The stale set is not "exactly {new, moved, never-linked}": the #418 fence NULLs the stamp only on `geom` change [READ `load-parcels.descriptor.json:120-125`]; a changed `address_number` / `street_name_normalized` never re-stales. Unmeasurable (no `parcels.updated_at`, RC-4) | DEFECT · PIN (declared limitation) | filed (D5) |
| `EC-D4` | No retraction: a parcel that leaves the 20 m range keeps its values and its NULL/old stamp, recomputed every run and never corrected. Residue measured: 6 parcels, all out of range, stale frontage names only (§8) | DEFECT · PIN | ④b: reset values, leave the stamp NULL, residue counter |
| `EC-D5` | `assertPreconditions` TARGET_COLS omits `abuts_laneway` `:357` (mig 191 postdates the check) | DEFECT · PIN | ④c: `guards.requires` gains the 5th column |
| `EC-D6` | The skip path bypasses every precondition `:503-507`: an emptied `toronto_centreline` under an unchanged version lands `completed` PASS | DEFECT · declared deviation (converted runs `guards.requires` + the non-empty probe every run) | ② (declared) |
| `EC-D7` | `.replace()` string surgery on comment-bearing anchors `:277-283` (programme item LC-4) | DEFECT · PIN | ② builder (byte-equal, red test B4); LC-4 → BUILT at ③ |
| `EC-D8` | Spec 62 drift: §12.3a names never-seeded `centreline_unlinked_parcel_{warn,fail}_pct` / `centreline_parallel_azimuth_threshold_degrees`; §12.2 promises `applyCentrelineEnrichment` / `validateConfig` (neither exists); §9 lacks `source_dataset_version`, `mode`, `parcels_abuts_laneway_true_count` and the reduced keys; §2 DDL lacks `abuts_laneway` and the stamp; the §11 UPDATE shows a 4-column guard; cadence DAILY `:144` vs QUARTERLY (§3.11); "8-CTE" is 9 CTEs | DEFECT · PIN (spec-only) | ② (Spec 62 corrected to the code) |
| `EC-D9` | L30 cap keeps the first 20 segments by `centreline_id`, not by distance `:105-107`; `parcels_truncated_pair_count` = 29 at run 1477 | DEFECT · PIN | carried, filed |
| `EC-D10` | **NEW at ①.** The producer contract reads only `pipeline='sources:load_centreline' AND status='completed'` `:320`. Since `load_centreline`'s conversion its STANDALONE runs are ledgered under the bare slug `load_centreline` [READ `index.js:5456` `openLedgerRow(pool, slug)`], status `completed_with_warnings`. Dev DB: the contract reads run 1471 (`80496e67…`, 2026-07-08) while `toronto_centreline` holds run 2132's 47,318 rows (`7b86fe74…`, 2026-09-29) — the stamp names a version that does not describe the table. In-chain runs are unaffected (run-chain writes `sources:` + `completed`). Sampled impact: 0 of 2,000 recomputed parcels differ (§8) | DEFECT · PIN (pinned known defect — operator ruling 2026-09-30: ported verbatim at ②) | descriptor-truth programme, not this conversion (descriptor `limitations[0]`) |
| `EC-D11` | **NEW at ②.** L21 boundary: legacy `gradeDiagnosticRows` `:430` grades WARN at `>= 10` and FAIL at `>= 40`; the converted check's `pct <=` grammar is inclusive (no strict comparator exists), so exactly 10.0 reads PASS and exactly 40.0 reads WARN — one tier lower at the two edges only (the load_wsib WS-D9 precedent). Run 1477: 2.99% | DEFECT · declared deviation (descriptor `deviations[1]`; pinned by `enrich-centreline.logic.test.ts`) | restored when the library gains a strict pct comparator (filed with WS-D9) |

### 6.2 Literal ledger (Rule 3) — plan §5, re-grounded
| Legacy literal [READ] | Variable (default = legacy value) | Consumer |
|---|---|---|
| `UNLINKED_WARN_PCT = 10` `:31` / `UNLINKED_FAIL_PCT = 40` `:32` | `enrich_centreline_unlinked_warn_pct` 10 / `_unlinked_fail_pct` 40 | L21 check |
| `NAME_COVERAGE_WARN_PCT = 90` `:33` | `enrich_centreline_name_coverage_warn_min_pct` 90 | F5b |
| `INTERSECTION_NULL_WARN_PCT = 50` `:34` | `enrich_centreline_intersection_null_warn_pct` 50 | F5c |
| `ADDRESS_NULL_WARN_PCT = 10` `:35` | `enrich_centreline_address_null_warn_pct` 10 | G4 |
| `CENTRELINE_PROXIMITY_M = 20` `:39` | `enrich_centreline_proximity_m` 20 | SQL `:86` |
| `CENTRELINE_ABUT_M = 13` `:48` | `enrich_centreline_abut_m` 13 | SQL `:135`, `:202` |
| `THROUGH_OPPOSITE_TOL_DEG = 45` `:49` | `enrich_centreline_through_opposite_tol_deg` 45 | SQL `:197` |
| `rn <= 20` `:107`, `seg_count > 20` `:398` | `enrich_centreline_pair_cap` 20 (caps SEGMENTS per parcel; pairs ≤ C(20,2)) | SQL + truncated tally |
| `cos(radians(15))` `:181` | `enrich_centreline_parallel_tol_deg` 15 | SQL |
| `10.0` m `:156`, `:163`, `:171`, `:178` | `enrich_centreline_azimuth_sample_m` 10 (renders `10.0` byte-exact, Fold A5) | SQL |
| `round1` / `1000` / `10` `:410-412`, `:539-542` | `enrich_centreline_round_scale` 10 — `round1(100·scale·x/t)/scale`; byte form pinned by red test A12 | pct rows |
| (none — runner) | `enrich_centreline_heartbeat_minutes` 5, `_lock_timeout_ms` 1800000, `_phase_timeout_minutes` 240 (D3) | runner |

15 variables (12 compute + 3 runner), all `on_invalid:"fail"`, admin group "Source Ingestion". SQL math guards
`GREATEST(ST_Length, 1.0)` / `LEAST(…, 1.0)` are a divisor floor and a fraction clamp, not tunables (notes.json at
②). `'laneway'`, the name and node rules are vocabulary (Rule 4).

---

## 7. Non-determinism inventory (declared BEFORE the first golden)

| Source | Where | Treatment |
|---|---|---|
| `completed_at` (DB clock `RUN_AT`) | `centreline_enrich.completed_at` `:473`, `:587` | masked by the harness; never in the table projection |
| `enrich_centreline_duration_ms` (`Date.now() - t0`) and ledger `duration_ms` | audit row `:453`, `:558` | masked |
| chain-appended `sys_velocity_rows_sec`, `sys_duration_ms` | run-chain audit rows (present on run 1477) | chain-only; absent from harness runs |
| `tmp_centreline_enrich` | temp table, `ON COMMIT DROP` `:66` | session-local; never observed |
| `toronto_centreline.id` order in the L30 cap | `ROW_NUMBER() … ORDER BY centreline_id` `:105` | deterministic for one table load; ids are reassigned by each `load_centreline` full replace (today 3,265,857 … 3,313,174) — no producer run may happen between PRE and POST |
| float form of the percentages | `round1(1000·x/t)/10` → e.g. `2.9899999999999998` (run 1477) | byte-pinned (red test A12) |
| `pipeline_runs.id` | ledger rows | masked |

The `parcels` projection hash (`id` + the 5 written columns, ORDER BY `id`) is deterministic on identical data.

---

## 8. Reality-Check re-measure (plan §7 + Fold RC-1…RC-7) and premises that did not survive

All values MEASURED 2026-09-30, read-only, local dev DB. Queries are in the scratch log of this seat; the
load-bearing ones are quoted.

### 8.1 Measured values
| Quantity | Query (abridged) | Value | Plan bound / claim |
|---|---|---|---|
| parcels total / `geom IS NULL` / valid geom / invalid geom | `count(*)`, `FILTER (WHERE geom IS NULL)`, `ST_IsValid` | 496,510 / 1 / 496,509 / 0 | run 1477 recorded 16 invalid |
| stamp distribution | `GROUP BY centreline_dataset_version_when_enriched` | `80496e67…` 472,083 · NULL 24,427 | RC-1 14,525 + 9,902 ✓ |
| stamp coverage (L24c) | 472,083 / 496,509 | **95.08%** | ≥ 0.9 ✓ (RC-2 95.1% ✓) |
| `is_corner_lot` share | `FILTER (WHERE is_corner_lot)` | 54,648 = 11.01% | ∈ [0.08, 0.14] ✓ |
| `is_through_lot` share | `FILTER (WHERE is_through_lot)` | 4,762 = 0.96% | ∈ [0.002, 0.03] ✓ |
| `abuts_laneway` share | `FILTER (WHERE abuts_laneway)` | 74,028 = 14.91% | first recorded value (run 1477 tally 74,071) |
| frontage resolved | `primary_frontage_street_name IS NOT NULL` | 472,089 = 95.08% of valid geom | ≥ 0.95 ✓ (borderline); run 1477: 472,002 of 486,530 = 97.01%, P1 429,884 = 91.08% of resolved (RC-5 bases) |
| zero-intersection (L21) | run 1477 audit row | 14,528 / 486,530 = 2.99% | < 10 ✓ |
| invariant (iv) corner∨through ⇒ frontage | `FILTER (WHERE (is_corner_lot OR is_through_lot) AND primary_frontage_street_name IS NULL)` | 0 | ✓ |
| stamped without frontage | `stamp IS NOT NULL AND frontage IS NULL` | 0 | — |
| EC-D4 residue | `stamp IS NULL AND (corner OR through OR laneway OR frontage NOT NULL)` + `ST_DWithin(…,20)` | **6**, all out of range: ids 26237, 29145, 56782, 242296, 291715, 318769 (stale frontage names only) | RC-3 6 ✓ |
| new parcels (`created_at ≥ 2026-09-24`) | | 9,980; 9,902 unstamped, all with NULL address + street | RC-1 ✓ |
| stale valid-geom vs `80496e67…` (= legacy `countStaleParcels`) | | 24,426 | EC-D2 ⇒ mode incremental |
| … of which within 20 m of a segment | `EXISTS (… ST_DWithin(p.geom::geography, c.geom::geography, 20))` | **8,366** (8,349 of them new) | RC-1 said ≈9,902 — see P1 |
| `parcels_truncated_pair_count` (EC-D9) | run 1477 `records_meta` | 29 | — |
| `toronto_centreline` rows / laneways / node-null | | 47,318 / 4,146 / 0 | — |
| last full run | run 1477 | 5,225,671 ms (87 min local), records_updated 472,002 | D3 240 min holds |

**Cadence (Fold A6).** 18 completed producer runs 2026-06-10 … 09-29 carry 8 distinct `source_dataset_version`
values; **7 of 17 consecutive transitions changed the version**, as close together as 1 day (runs 1393 → 1471)
and ~5 h (runs 2114 → 2132, 2026-09-29). The version is a content hash that moves every few days — neither
Spec 62's DAILY-stable nor its QUARTERLY (EC-D8). The two-versions-in-5-hours pair is flagged to the
`load_centreline` owner, not diagnosed here.

**Recompute check (supports the capture recipe).** The legacy `BUILD_TEMP_SQL` CTE, scoped to the 2,000-parcel
cohort (§9) and run as a plain SELECT against the CURRENT `toronto_centreline`, reproduced every stored value:
**0 of 2,000 differ**. So a legacy incremental run over the perturbed cohort is expected to restore the baseline
exactly, even though the stamp names an older producer version (EC-D10).

### 8.2 Premises that did not survive re-grounding
| # | Plan premise | Measured / read | Consequence |
|---|---|---|---|
| P1 | RC-1: "9,902 new in-range parcels", absorption run writes ≈9,902 | 9,902 new unstamped, only 8,349 within 20 m; the absorption run writes **8,366** (8,349 + 17 older) | capture expectation corrected (§9) |
| P2 | EC-D1: "quarterly source ⇒ unchanged-version runs are ~all runs" | 7 of 17 producer transitions changed version | EC-D1 stands; its impact is "reduced runs on unchanged days", not "~all runs" |
| P3 | Fold "Explained diff — standalone ledger": converted standalone writes `sources:enrich_centreline` [index.js:641-646] | the runner opens the standalone row under the BARE slug: `openLedgerRow(pool, slug)`, `slug = descriptor.identity.name` [READ `index.js:5377`, `:5456`; `ledger.js:48-50`]; `ledgerPipelineName` is used only for `readPriorEmit` reads | a converted standalone PASS lands `enrich_centreline` / `completed`, which `assertCentrelineEnriched` ACCEPTS [READ `enrich-permits.js:307`] — legacy standalone wrote no row. The explained diff at ② must say this |
| P4 | §8 capture step 4 command | with no descriptor the harness snapshots only `--tables=` [READ `capture-step-golden.js` `resolveTables :394-412`] and throws when `--table-columns` names an unsnapshotted table [READ `:1059-1061`]; the heritage PRE used `tables_source: "arg"` | `--tables=parcels` added (§9) |
| P5 | §8 step 6 / D2: "if a local load_centreline run brings a new version, capture PRE full naturally" | ten standalone producer runs since 09-25 already carry newer versions, but the legacy contract reads only `sources:load_centreline` (EC-D10) | PRE full cannot occur without a chain-named producer row; D2's fallback applies. CKAN HEAD not issued — the legacy gate reads the ledger, never CKAN |
| P6 | ③ "stages Specs 43 and 62, no N-A" (R-BB) | R-BE (2026-09-30): #43 reads census `owner_specs` = Spec 62 only; Spec 43 is no longer touched per sources cutover | ③ stages Spec 62 only |
| P7 | §1a "Spec 62 §5 Target Files lists only the script at :491" | a GENERATED block (R-BE) now lists the step [READ `62_source_centreline.md:495-500`] | regenerated in this commit by `npm run target-files` |
| P8 | Fold A2 consumer list complete | 4 more surface descriptors name the slug (F01 `mobile_parcel_search`, F02 `mobile_parcel_detail`, F16 `contract_admin_stats`, F16 `admin_data_quality`) + `scripts/lib/assert-global-coverage-fields.js` | added to §3(c); none changes under byte-identical columns |
| P9 | line anchors | Spec 62 anchors shifted by the R-BE block; LC-4 is `programme-items.json:528`; `assertCentrelineEnriched` is `enrich-permits.js:301-332`; `REQUIREMENT_PROBES` `:514-521` | facts unchanged, anchors re-cited |

---

## 9. PRE goldens — NOT captured at ①; the exact commands (re-verified)

① takes no capture and makes no DB write: a `load_wsib` capture holds the one heavy slot. Captures run when the
slot is free, in this order (plan §8 + Fold A9 + RC-1, corrected by §8.2 P1/P4/P5). Every command runs from the
worktree root with `DOTENV_CONFIG_PATH=C:/Users/User/Buildo/.env node -r dotenv/config …`.

0. **Slot check.** `SELECT pid, now()-query_start, left(query,80) FROM pg_stat_activity WHERE state <> 'idle'`
   shows no other capture; no producer (`load_centreline`) run may happen until POST is done (§7).
1. **Absorb the new-parcel delta (RC-1), legacy, standalone:** `node -r dotenv/config scripts/enrich-centreline.js`
   → expect `mode: incremental`, `records_updated` ≈ **8,366** (P1), then run it again → `records_updated: 0`
   (the two-run baseline, recorded in §9.1 at capture time). Legacy writes no ledger row, so neither run moves
   `lastVersion` (`80496e67…`).
2. **Back up** `parcels_centreline_bak_<YYYYMMDDTHHMMZ>` = `SELECT id, is_corner_lot, is_through_lot,
   primary_frontage_street_name, abuts_laneway, centreline_dataset_version_when_enriched FROM parcels`; record the
   baseline hash `md5(string_agg(ROW(<same 6 columns>)::text, '|' ORDER BY id))`.
3. **Cohort (Fold A9).** Seed `ec1-20260930`; strata over stamped (`= '80496e679ef7a2ae8b2e87eb986142a0'`) valid-geom
   parcels, each `ORDER BY md5(id::text || ':' || seed) LIMIT n`: corner (`is_corner_lot`) 500 · through
   (`is_through_lot AND NOT is_corner_lot`) 300 · laneway (`abuts_laneway AND NOT is_corner_lot AND NOT
   is_through_lot`) 500 · plain (none of the three) 700 = **2,000**. Selected read-only on 2026-09-30; the recompute
   check (§8.1) found 0 of 2,000 differing. **`docs/reports/golden/enrich_centreline/cohort.json` is NOT in this
   commit** — writing it was refused by the session's permission classifier (see the ① hand-off); it must hold
   the seed, the ids and the BASELINE literals, and must be committed before the first capture.
4. **Before EVERY capture:** restore the 5 columns from the backup ⇒ assert hash = baseline ⇒ apply the stored
   cohort UPDATE (literals derived from the cohort file's baseline values, never `NOT x` on current values:
   stamp NULL, the three booleans negated, frontage NULL) ⇒ assert hash ≠ baseline.
5. **PRE sources:** `node -r dotenv/config scripts/analysis/capture-step-golden.js --step=scripts/enrich-centreline.js
   --chain=sources --tables=parcels --table-columns="parcels:id,is_corner_lot,is_through_lot,primary_frontage_street_name,abuts_laneway,centreline_dataset_version_when_enriched"
   --table-order=parcels:id --out=docs/reports/golden/enrich_centreline/pre/sources.json` → expect exit 0,
   `mode: incremental`, `records_updated` = **2,000** exactly, table hash = baseline.
6. Step 4, then **PRE standalone:** the same command with `--chain=none --out=…/pre/standalone.json`.
7. Restore; keep the backup until the POST pair at ② matches (D2: POST `ENRICH_CENTRELINE_FORCE_FULL=1` over the
   perturbed cohort, hash = baseline).

**R-BD: not needed.** The legacy script takes no argv on either chain (`args: []`, manifest `supports_full:false`);
the POST full-mode proof uses an ENV variable, not a `[flag, path]` argv pair, and R-BD excludes mode flags anyway.

---

## 10. Red suite (PH-7, G7)

`src/tests/steps/enrich_centreline/violations.test.ts` (444 lines; SPEC LINK Spec 62) + the oracle
`fixtures/legacy-enrich-centreline.js.txt` — a byte copy of `scripts/enrich-centreline.js` at `4a74da2d`
(sha256 `24131dcf…c4c4`, `cp` by the orchestrator, verified equal), compiled in place of the live script so the
PART A pins keep answering after ② turns the script into a shell.

* **PART A — 13 oracle pins, plain `it`, green from ①:** A1 oracle sha; A2 identity; A3 the four contract HALTs;
  A4 **EC-D10** chain-prefixed-only read; A5 three-way mode; A6 5-disjunct guard; A7 **EC-D5** 4 precondition
  columns; A8 **EC-D1** reduced PASS literal; A9 **EC-D4** no retraction arm; A10 scoped = full − DROP + one `$1`
  (EC-D7); A11 the §5 literal inventory; A12 the pct byte form; A13 the grading edges.
* **PART B — 11 converted claims, `it.fails` (flips at: commit ②):** B1 identity; B2 class N write discipline;
  B3 15 variables, `fail`, seeds byte-equal; B4 builder byte-equal to the legacy full / scoped / UPDATE strings
  (EC-D7); B5 `contract_read` returns `{sourceDatasetVersion, lastVersion, staleCount, mode}`; B6 the pass —
  `mode = ctx.full ? 'full' : contract.mode` and the four hand-off keys in `passRaw` (Fold A1); B7 `post_phase`
  mode-shaped emit; B8 emits + staleness (Folds A3/A4); B9 `guards.requires` with EXACTLY 4 columns (EC-D5 carried);
  B10 override / recovery / timeouts (D3); B11 frozen shell.
* **PART C — 1 claim, `it.fails` (flips at: commit ③):** C1 `converted.json` registration.
* **PART D — 1 plain `it`:** this report exists with the compressed marker.

The API names B4–B7 bind (`buildTempSql({scoped}, config)`, `UPDATE_SQL`, `readCentrelineContract`,
`runCentrelineJoinPass(client, ctx)`, `computePostPhase(pool, {passRaw, full, runAt, config})`, phase
`centreline_join`) follow the enrich_heritage compute; ② may rename only by editing the test in the same commit.
The real-PostGIS corner / through / lane fixtures (CE-CORNER, CE-THRU, CE-LANE-*) stay in
`db/migration-174-centreline-enrich.db.test.ts` and are re-pointed at ②: B4's byte equality is what ties them to
the compute.

**RED evidence (gate K / G7):** `docs/reports/red-evidence/enrich_centreline/r1-artifacts-missing.json` — the ①
suite with every `it.fails(` temporarily un-inverted to `it(` (file restored afterwards, sha256 re-verified): 12
assertions failed, each on `MISSING ARTIFACT scripts/enrich-centreline.descriptor.json` or `MISSING ARTIFACT
scripts/lib/compute/enrich-centreline.js`, except C1, which fails on its registration assertion — e.g.
`B1 descriptor — identity enrich_centreline, lock 64, ENRICHER, spec_version 1.1, shape enrich, invocation sources (flips at: commit ②)` and `B6 compute — the pass: mode = ctx.full ? full : contract.mode; per-mode statements equal the legacy engine; passRaw carries the four hand-off keys (flips at: commit ②)`.

---

## 11. Registry consequences of ① (landed in this commit, orchestrator unless noted)

* `scripts/steps/_schema/converted.json` — `pending[]` gains `scripts/enrich-centreline.js`, `stage: "red_suite"`,
  `registers_at: "commit ③"` (CRLF kept).
* `scripts/steps/_schema/step-archetype-census.json` — the row's `batch` `"C5"` → `"pending"` (enrich_heritage
  commit-1 precedent `94cfe054`; the roadmap generator refuses a pending slug whose census batch is not
  `pending`). Archetype unchanged: ENRICHER (R-AO).
* `docs/reports/generated/122-conversion-roadmap.md` regenerated (remaining files 40 → 39, + 1 pending).
* `npm run target-files` (R-BE) regenerated Spec 62's block (`enrich_centreline — ENRICHER · pending`, + the test
  file); `npm run system-map` regenerated row 62. No hand edit to Spec 62 at ① (EC-D8 corrections land at ②).
* Engine (brief `ec1-f1`): `src/tests/conversion-roadmap.infra.test.ts` pending pin 0 → 1; both census fixtures
  (`bad-mismatched-archetype.json`, `missing-slug-totality.json`) re-synced to `batch: "pending"`.
* Engine (briefs `ec1-f2`/`f3`): `src/tests/gates-from-one.infra.test.ts` "live" case now picks the first pending
  entry that HAS a descriptor (R-BA overlays only such a slug); it threw ENOENT on a `red_suite` entry.

## R. Reflection (G9)

### LOW-CONFIDENCE table
| Item | Why low confidence | Resolution path |
|---|---|---|
| EC-D10 contract-name gap | a cross-step ledger-name contract; the fix could sit in either step | operator ruling before ② (the converted `contract_read` ports the read verbatim) |
| B4–B7 API names | chosen at ① from the enrich_heritage precedent, not by the plan | ② may rename in the same commit as the compute |
| Production reduced/full mix | measured on the dev ledger (18 producer runs), not the cloud | re-measure from the cloud ledger at batch close |

### RECURRING / STANDARD-SHAPING table
| Pattern | Seen before | Standard-shaping proposal |
|---|---|---|
| A consumer reads a producer's ledger row by a chain-prefixed name; converted standalone runs write the bare slug | EC-D10 (here); readPriorEmit keys on `ledgerPipelineName` | one resolver for "the producer's last completed run" across both names, owned by the runner |
| A plan's capture command omits `--tables` for a descriptor-less PRE | P4 (here) | the harness could derive `--tables` from `--table-columns` keys |
| Plan line anchors drift when a generated block lands | P7/P9 (R-BE) | cite greppable anchors, not line numbers, in plans |


---

## 12. Commit ② — READS EVIDENCE TABLE, declared reads/writes, and the ② record (2026-10-01)

**Rule (operator, 2026-09-30, new conversions):** `inputs.reads` is authored from this table — every table AND
column the legacy SQL touches (select-list, guard, predicate, WHERE, JOIN, ORDER, the scoped predicate), each with
its legacy `file:line`; descriptor reads/writes cover every row; an intentional omission is an explicit deviation.
Anchors are `scripts/enrich-centreline.js` at `4a74da2d` (byte-equal to the oracle
`src/tests/steps/enrich_centreline/fixtures/legacy-enrich-centreline.js.txt`, sha `24131dcf…`).

### 12.1 Reads evidence table

| # | Table.column (or object) | Legacy `file:line` — role | In legacy emitMeta? full `:592-598` / reduced `:477-483` | Descriptor coverage |
|---|---|---|---|---|
| R1 | `parcels.id` | `:70` select · `:260` UPDATE join `p.id = e.parcel_id` | full ✓ / reduced ✓ | `inputs.reads.tables[parcels]` + `outputs.writes[0].key` |
| R2 | `parcels.geom` | `:71-72` select + `ST_Centroid` · `:86` `ST_DWithin` JOIN · `:87` WHERE validity · `:308` stale count · `:526-529` diagnostics | full ✓ / reduced ✓ | reads `parcels` |
| R3 | `parcels.address_number` | `:73` select (P2 input `:223-224`) · `:529` addr_pop | full ✓ / reduced ✗ | reads `parcels` |
| R4 | `parcels.street_name_normalized` | `:74` select (P1 input `:221-222`) · `:528` name_pop | full ✓ / reduced ✗ | reads `parcels` |
| R5 | `parcels.centreline_dataset_version_when_enriched` | `:282` scoped predicate · `:265` guard · `:309` `countStaleParcels` | full ✗ / reduced ✓ | reads `parcels` + writes[0] |
| R6 | `parcels.is_corner_lot` | `:261` guard read | full ✗ / reduced ✗ | reads `parcels` + writes[0] |
| R7 | `parcels.is_through_lot` | `:262` guard read | full ✗ / reduced ✗ | reads `parcels` + writes[0] |
| R8 | `parcels.primary_frontage_street_name` | `:263` guard read | full ✗ / reduced ✗ | reads `parcels` + writes[0] |
| R9 | `parcels.abuts_laneway` | `:264` guard read | full ✗ / reduced ✗ | reads `parcels` + writes[0] |
| R10 | `toronto_centreline.id` | `:75` select → `centreline_id`: `:93` COUNT DISTINCT · `:105` cap ORDER BY · `:125` pair predicate · `:231` frontage ORDER BY | full ✗ / reduced ✗ | reads `toronto_centreline` |
| R11 | `toronto_centreline.geom` | `:76` select · `:86` `ST_DWithin` JOIN | full ✓ / reduced ✓ | reads `toronto_centreline` |
| R12 | `toronto_centreline.linear_name` | `:77` (corner/through name compare `:130`, `:148`; P1 `:222`) | full ✓ / reduced ✗ | reads `toronto_centreline` |
| R13 | `toronto_centreline.linear_name_full` | `:78` (frontage name `:214`) | full ✓ / reduced ✗ | reads `toronto_centreline` |
| R14 | `toronto_centreline.from_intersection_id` | `:79` (node share `:132-134`) · `:532` node_null | full ✓ / reduced ✗ | reads `toronto_centreline` |
| R15 | `toronto_centreline.to_intersection_id` | `:80` (node share `:132-134`) · `:532` node_null | full ✓ / reduced ✗ | reads `toronto_centreline` |
| R16 | `toronto_centreline.lo_num_l`, `hi_num_l`, `parity_l` | `:81` (P2 `:223`) | full ✓ / reduced ✗ | reads `toronto_centreline` |
| R17 | `toronto_centreline.lo_num_r`, `hi_num_r`, `parity_r` | `:82` (P2 `:224`) | full ✓ / reduced ✗ | reads `toronto_centreline` |
| R18 | `toronto_centreline.feature_code_desc` | `:83` `seg_is_lane` (laneway exclusion `:139`, `:205`; `abuts_laneway` `:100`) | full ✗ / reduced ✗ | reads `toronto_centreline` |
| R19 | `toronto_centreline` (row existence / count) | `:373` non-empty probe · `:533` `COUNT(*)` | — | reads `toronto_centreline` + compute `assertCentrelineNonEmpty` + `guards.empty_source` |
| R20 | `pipeline_runs.pipeline`, `.status`, `.completed_at`, `.records_meta` | `:291` self read (`sources:enrich_centreline`) · `:320` producer read (`sources:load_centreline`, EC-D10) — `records_meta.centreline_load.{spec_version,features_inserted,source_dataset_version}` `:326-333`; `records_meta.centreline_enrich.source_dataset_version` / `audit_table.rows[centreline_source_dataset_version]` `:296-299` | full ✗ / reduced ✗ | reads `pipeline_runs` (4 columns) + `inputs.reads.steps[load_centreline]` |
| R21 | `logic_variables` | — the legacy reads NONE (every tunable is a literal `:31-49`, `:107`, `:156-181`) | — | **deviation** (descriptor `deviations[4]`): the 19 knobs are resolved by the runner's `config.js`, not by compute SQL |
| R22 | catalog: `pg_extension.extname`, `pg_indexes.indexname`, `information_schema.columns(table_name, column_name)`, `pg_proc.proname` | `:344`, `:347-356`, `:357-365`, `:366-372` `assertPreconditions` | — | `guards.requires` (1 extension, 3 indexes, 2 functions, 4 columns — EC-D5) — **deviation** `deviations[4]` names the catalog as covered there, not in `inputs.reads` |
| R23 | functions `address_match_status`, `normalize_address_number`; ext `postgis` | `:223-224` calls; `:368` existence | — | `guards.requires` |
| R24 | `tmp_centreline_enrich` (own temp) | `:65-66` DROP/CREATE · `:259` UPDATE source · `:400` tally | — | **deviation** `deviations[4]`: session-local, `ON COMMIT DROP`, never a cross-step read |

**Writes:** `parcels.{is_corner_lot, is_through_lot, primary_frontage_street_name, abuts_laneway,
centreline_dataset_version_when_enriched}` `:254-258` → `outputs.writes[0].columns` (5) + `guard_columns` (5), class N.
Legacy emitMeta writes: full ✓ all 5 (`:597`); incremental ✓ all 5 (`:481`); skip `{}` (`:482`).

**Gaps vs legacy emitMeta (what the declared reads add):** full-mode emitMeta omitted R5–R10, R18 and R20 (the
stamp, the four guard-read columns, `toronto_centreline.id` and `feature_code_desc`, and `pipeline_runs`); reduced
emitMeta listed only `parcels.{id, geom, stamp}` + `toronto_centreline.geom` while the incremental SQL reads the same
22 columns as full. The descriptor declares the union (R1–R20), so the emitted lineage is mode-independent — an
explained diff at capture. **No row is uncovered;** R21, R22 and R24 are the three intentional omissions from
`inputs.reads`, each named in `deviations[4]`.

### 12.2 What ② landed (code only; no capture, no DB write)

* `scripts/enrich-centreline.descriptor.json` (19 checks, 1 invariant, 4 plausibility, 5 deviations, 8 limitations,
  7 terminals; schema-valid), `scripts/lib/compute/enrich-centreline.js` (SQL byte-equal to the legacy at the seeded
  defaults — B4), `scripts/enrich-centreline.notes.json` (9 prose categories, 14 fences = every preserved-in-compute
  intent row), the 7-statement frozen shell, 19 seeds + admin groups, staleness-disposition row, re-pointed §1d tests.
* **Deviations from the plan text, decided at ②:**
  1. **Non-empty probe position.** Plan §2 row 6 folded the `toronto_centreline` non-empty probe into `contract_read`.
     The red suite's B5 (exact call counts 3 / 2) refutes that seat, and it would also run the probe on skip. ② keeps
     it at the LEGACY position — first statement of the pass, full and incremental only — so EC-D6 shrinks to
     "`guards.requires` also runs on skip". B6 amended (the probe is the first call; asserted against the oracle text).
  2. **D4 plausibility ⇒ 19 logic variables, not 15.** The four corner/through share bounds are tunables (Rule 3,
     the enrich_heritage plausibility precedent), so B3's expected set gains them. Measured 2026-10-01 after chain
     run 2168: corner 55,893 = 11.26%, through 4,982 = 1.00% of 496,509 geom-bearing parcels (bands [8,14] / [0.2,3]).
  3. **EC-D11 (new, declared deviation):** the inclusive `pct <=` grammar grades exactly 10.0 / 40.0 one tier lower
     than the legacy `>=` (WS-D9 precedent); pinned in `enrich-centreline.logic.test.ts`.
  4. **B2 corrected:** `retract` lives on the write target (`definitions.write`), not inside
     `write_discipline` (`additionalProperties:false`); the claim is kept, asserted at its legal home.
  5. **Audit phase stays 64** (`sharing.varies_by_chain.phase`, the load_centreline precedent keeps its lock id),
     so the audit header's `phase` does not move.
* **EC-D10 ruling (operator, 2026-09-30):** ported verbatim and kept as a pinned known defect (descriptor
  `limitations[0]`); the fix belongs to the descriptor-truth programme. State after chain run 2168: the producer row
  2176 and the self row 2182 both carry `7b86fe74…`, which is what `toronto_centreline` holds (47,318 rows) — the gap
  is closed in the data today but the read is unchanged.

### 12.3 Capture baseline re-measured (read-only, 2026-10-01, after chain run 2168)

| Quantity | Value | Was (§8) |
|---|---|---|
| producer contract version (run 2176) | `7b86fe74c3fbee4f073e631e3b17dd91` | `80496e67…` (run 1471) |
| last `sources:enrich_centreline` (run 2182, legacy) | mode `full`, `records_updated` 480,449, version `7b86fe74…` | run 1477 |
| stamps | 480,449 = `7b86fe74…`; 16,061 NULL (16,060 valid-geom + 1 NULL geom) | 472,083 / 24,427 |
| stale valid-geom (legacy `countStaleParcels`) | 16,060 ⇒ next legacy run `incremental` | 24,426 |
| stale within 20 m (**the absorption count**) | **0** | 8,366 |
| invariant (iv) violations | 0 | 0 |

Consequence for the capture script: §9 step 1's absorption run is expected to write **0** (it becomes the two-run
baseline proof directly); the cohort must be re-selected over parcels stamped `7b86fe74…` (the `80496e67…` strata no
longer exist); and the chain run 2182 is a natural legacy FULL-mode run on this version (its `records_meta` is the
legacy full-shape reference for D2, though it is not a harness golden).

---

## Validation scorecard (generated)

> Generated by `node scripts/analysis/step-validate.mjs --step=enrich_centreline --write` — Spec 123 §6, ruling R-R (2026-08-29).
> Regenerate with the same command; a stale block is a conformance-lock finding (`step-conformance.infra.test.ts`).

**Score: 17/17** · G9 Reflection: PASS · G4d fence-lock coverage: PASS · G-shape: PASS · **Hard stop: no**

### Five-word verdict (Spec 124 §5 R-BA — "McDonald's Airtight")

| Word | Status | Detail |
|---|---|---|
| STANDARDIZED | PASS | PASS |
| OBSERVABLE | PASS | PASS |
| SCALABLE | PASS | PASS |
| UNDERSTANDABLE | PASS | PASS |
| ACCURATE | PASS | PASS |

| Gate | Score | Max | Detail |
|---|---:|---:|---|
| G0 | 1 | 1 | boundary-section=true spec-line=true |
| G1 | 1 | 1 | PH-3 section found=true sha-count=18 |
| G2 | 1 | 1 | 122-churn-complexity.md quadrant=bottom-left window=39313d9 |
| G3 | 2 | 2 | table rows=17 vocab-hit rows=17 |
| G4 | 2 | 2 | risk-class row with chance+impact found=true |
| G5 | 1 | 1 | db=true clock=true network=true argv/env=true |
| G6 | 3 | 3 | 11 ledger row(s), 0 without CLOSED/PIN () |
| G7 | 3 | 3 | file=true fences=14 it-count=27 red-evidence-claims=1 red-evidence-pass=true ledger-deferred=false |
| G8 | 3 | 3 | missing-invocations=0 missing-pre-invocations=0 stale-fingerprints=0 unexplained-diffs=0 |
| G9 (binary) | PASS | — | heading=true low-confidence-table=true recurring-table=true |
| G4d (fence<=lock) | PASS | — | fences=14 lock-it-count=27 |
| G-shape | PASS | — | file-clean=true compute-clean=true |

### Fast invariants (always run — the fast descriptor gate)

| # | Scope | Pass | Detail |
|---|---|---|---|
| 1 | enrich_centreline | PASS | min_migration=225 <= migrations count=245 |
| 2 | enrich_centreline | PASS | 19 declared, missing from seeds: none |
| 3 | enrich_centreline | PASS | retired=0 overlap-with-declared=none |
| 7 | enrich_centreline | PASS | SPEC LINK header present=true |
| 8 | enrich_centreline | PASS | G-4: 19 declared, 4 verdict-affecting, 0 violate on_invalid:fail with no deviations[] cover |
| 20 | enrich_centreline | PASS | HB-1: runner=runEnrichPhase: runner-level token presence (MED-6, not a per-phase proof): source contains an onProgress seam token AND a startHeartbeatTicker( call token — the periodic ticker covers every phase uniformly by construction once present, independent of any single phase's own boundary, but ticker start/stop lifecycle is not independently verified here |
| 21 | enrich_centreline | PASS | CEIL-1: runner=runEnrichPhase: runner-level token presence (MED-6, not a per-phase proof): source contains a SET LOCAL statement_timeout/lock_timeout token pair AND a postClient-scoped SET statement_timeout token (EP-D16) — the per-phase claim itself is filed as its own followup |
| 4 | (registry) | PASS | overlap: none |
| 5 | (registry) | PASS | clean (0 it.fails( call sites outside a declared pending slug) |
| 9 | (registry) | PASS | clean (0 converted slugs blocked by an unmet cutover_prereq item; blocks batching: 0) |
| 22 | (registry) | PASS | GOLD-PRE-FRESH: 83 PRE capture(s) across 26 converted step(s) all tracked + clean (git can restore every reference) |
| 23 | (registry) | PASS | COMPRESSED-FORM-ELIGIBLE: not applicable (0 pending slugs declare the compressed form) |
| 24 | (registry) | PASS | COMPRESSED-FORM-DEFAULT: not applicable (0 pending slugs whose archetype is eligible) |
| 25 | (registry) | PASS | ARCHETYPE-PARITY: 26 converted slug(s) — 26 compared against a retained census row (all agree), 0 with no retained row (census arm n/a, pre-R-AO cutovers); every archetype has a declared freeze profile |
| 26 | (registry) | PASS | COUNTER-ROOT: 65 declared counter source(s) across 22 descriptor(s) all root in their own shape's counterScope (+ records_meta) |
| 27 | (registry) | PASS | ROW-ERROR-GATE: 9 skip/quarantine declaration(s), all cite a real FAIL-severity, bound-carrying check in their own descriptor |
| 28 | (registry) | PASS | CLOSED-BOUNDS (gate A): 8 bound(s) checked, all closed (8 ledger-allowed, 0 from config/viol==0) |
| 29 | (registry) | PASS | ON-INVALID-CLOSED (gate B): 12 on_invalid(s) checked, all closed (12 ledger-allowed, 0 from fail/named-deviation) |
| 30 | (registry) | PASS | EMITS-EQUIV (gate C): 58 emits drift(s) checked, all closed (58 ledger-allowed, 0 from declared==emitted) |
| 31 | (registry) | PASS | CONSUMER-REGISTRY (gate D): 3 contract(s) checked, all closed (3 ledger-allowed, 0 present+typed/excluded); 56 unproduced src read(s) (report-only until the FLEET-2 landing commit (.cursor/wf2_registry_truth_active_task.md, Fold 14 P1-C6)) [unproduced:src/app/api/admin/builders/route.ts:entities.google_place_id; unproduced:src/app/api/admin/stats/route.ts:notifications.is_sent; unproduced:src/app/api/admin/stats/route.ts:permits.first_seen_at; unproduced:src/app/api/leads/flight-board/detail/[id]/route.ts:permits.updated_at; unproduced:src/app/api/leads/flight-board/route.ts:permits.updated_at; unproduced:src/app/api/notifications/route.ts:notifications.id; unproduced:src/app/api/notifications/route.ts:notifications.is_read; unproduced:src/app/api/permits/[id]/route.ts:building_footprints.id; unproduced:src/app/api/permits/[id]/route.ts:neighbourhoods.id; unproduced:src/app/api/permits/[id]/route.ts:neighbourhoods.top_mother_tongue; unproduced:src/features/leads/lib/get-lead-feed.ts:entities.id; unproduced:src/features/leads/lib/get-lead-feed.ts:entities.photo_url; unproduced:src/features/leads/lib/get-lead-feed.ts:neighbourhoods.id; unproduced:src/features/leads/lib/get-lead-feed.ts:permits.location; unproduced:src/features/leads/lib/get-lead-feed.ts:wsib_registry.last_enriched_at; unproduced:src/features/leads/lib/get-lead-feed.ts:wsib_registry.primary_phone; unproduced:src/features/leads/lib/get-lead-feed.ts:wsib_registry.website; unproduced:src/lib/admin/supplier-leads.ts:trade_forecasts.target_window; unproduced:src/lib/analytics/queries.ts:entities.id; unproduced:src/lib/builders/enrichment.ts:entities.first_seen_at; unproduced:src/lib/builders/enrichment.ts:entities.google_place_id; unproduced:src/lib/builders/enrichment.ts:entities.google_rating; unproduced:src/lib/builders/enrichment.ts:entities.google_review_count; unproduced:src/lib/builders/enrichment.ts:entities.id; unproduced:src/lib/builders/enrichment.ts:entities.linkedin_url; unproduced:src/lib/builders/enrichment.ts:entities.photo_url; unproduced:src/lib/builders/enrichment.ts:entities.photo_validated_at; unproduced:src/lib/builders/enrichment.ts:entities.trade_name; unproduced:src/lib/leads/lead-detail-query.ts:coa_applications.updated_at; unproduced:src/lib/leads/lead-detail-query.ts:neighbourhoods.id; unproduced:src/lib/leads/lead-detail-query.ts:permits.updated_at; unproduced:src/lib/leads/lead-detail-query.ts:trade_forecasts.target_window; unproduced:src/lib/leads/lead-inspect-query.ts:building_footprints.id; unproduced:src/lib/leads/lead-inspect-query.ts:coa_applications.lead_id; unproduced:src/lib/leads/lead-inspect-query.ts:neighbourhoods.id; unproduced:src/lib/leads/lead-inspect-query.ts:parcels.id; unproduced:src/lib/leads/lead-inspect-query.ts:permits.first_seen_at; unproduced:src/lib/leads/lead-inspect-query.ts:permits.updated_at; unproduced:src/lib/leads/lead-inspect-query.ts:trade_forecasts.target_window; unproduced:src/lib/market-metrics/queries.ts:neighbourhoods.id; unproduced:src/lib/quality/metrics.ts:data_quality_snapshots.created_at; unproduced:src/lib/quality/metrics.ts:data_quality_snapshots.id; unproduced:src/lib/quality/metrics.ts:data_quality_snapshots.snapshot_date; unproduced:src/lib/quality/metrics.ts:entities.google_place_id; unproduced:src/lib/quality/metrics.ts:permits.first_seen_at; unproduced:src/lib/sync/process.ts:permits.bid_value; unproduced:src/lib/sync/process.ts:permits.first_seen_at; unproduced:src/lib/sync/process.ts:permits.lead_id; unproduced:src/lib/sync/process.ts:permits.lifecycle_block; unproduced:src/lib/sync/process.ts:permits.lifecycle_group; unproduced:src/lib/sync/process.ts:permits.lifecycle_seq; unproduced:src/lib/sync/process.ts:permits.lifecycle_stage; unproduced:src/lib/sync/process.ts:permits.location; unproduced:src/lib/sync/process.ts:permits.photo_url; unproduced:src/lib/sync/process.ts:permits.trade_classified_at; unproduced:src/lib/sync/process.ts:permits.updated_at] |
| 37 | (registry) | PASS | LF-ONLY (gate F): 5 path(s) checked, all LF (5 ledger-allowed) |
| 33 | (registry) | PASS | BANNED-COVERAGE (gate I): all 4 x-banned-for-new path(s) enforced |
| 34 | (registry) | PASS | STALENESS-DISPOSITION (gate I): 33 declared fingerprint_inputs entries, all adjudicated (registry present=true) |
| 35 | (registry) | PASS | CENSUS-PARITY (gate I): every converted slug has a census row, an exemption, or a ledger-allowed gap |
| 36 | (registry) | PASS | DEFECT-ID-UNIQUENESS (gate I): 320 definition row(s) checked, 24 legal mirror(s), 0 disagreements |
| 38 | (registry) | PASS | CAPTURE-NONZERO (gate G): every declared write target is closed (14 ledger-allowed, 4 outputs:"none" vacuous) |
| 39 | (registry) | PASS | CAPTURE-FRESHNESS (gate G): 81 post capture(s) checked against scripts/lib/step/**, all fresh or ledger-allowed |
| 40 | (registry) | PASS | CAPTURE-EXPLAINED (gate G): 26 step(s) checked — every diff-explanation channel accounted for |
| 32 | (registry) | PASS | COMPUTE-LITERALS (gate E): 30 finding(s), all ledger-allowed (30) |
| 41 | (registry) | PASS | RED-EVIDENCE (gate K): 20 step(s) without a committed red-evidence artifact; 0 orphan ledger row(s) |
| 42 | (registry) | PASS | DEFECT-PREFIX-UNIQUE: 26 slug(s), every defect prefix unique |

### Captures (item iv)
- missing invocations (POST): none
- missing invocations (PRE, GOLD-PRE): none
- stale fingerprints: none
- compare ran: true · diffs found: 167 · unexplained: 0

### Test suite (item iii)
- 1948/1952 passed (suite success=false)
- harvested: 48 file(s) from 3 FLEET-WIDE targets (src/tests/step-conformance.infra.test.ts, src/tests/golden-fingerprint.infra.test.ts, src/tests/steps/) — one spawn per run, so every step's report carries this same number, by design
- excluded (R-AG live-DB tier, owned by `npm run test:db`, derived from package.json `scripts.test`): 5 — src/tests/steps/link_massing/metamorphic.test.ts, src/tests/steps/link_massing/nearest-determinism.test.ts, src/tests/steps/link_massing/rung1-inline-wkt.test.ts, src/tests/steps/link_parcel_addresses/metamorphic.test.ts, src/tests/steps/link_parcel_addresses/rung1-inline-wkt.test.ts
- skipped (declared but not run): 0
- failing (4):
  - src/tests/step-conformance.infra.test.ts > R-R / Rule 13 — the generated scorecard block is not stale (vitest-independent sections) > scripts/enrich-centreline.js (slug "enrich_centreline") > report carries exactly one generated scorecard block
  - src/tests/step-conformance.infra.test.ts > R-R / Rule 13 — the generated scorecard block is not stale (vitest-independent sections) > scripts/enrich-centreline.js (slug "enrich_centreline") > the committed block's vitest-independent sections equal a fresh `step:validate --fast` run
  - src/tests/step-conformance.infra.test.ts > R-R / Rule 13 — the generated scorecard block is not stale (vitest-independent sections) > scripts/enrich-centreline.js (slug "enrich_centreline") > the committed block also carries a Test-suite line and a 14-row Policy coverage matrix (presence only — content is `--all --write`'s job, not this lock's)
  - src/tests/steps/pct-checks-evaluate.logic.test.ts > class lock — every pct-bounded check reports a value, never a flag > no pct-bounded check reports violations() instead of value()

### Policy coverage matrix (item vi) — Spec 124 Rules 1-13

| Rule | Name | Status | Note |
|---|---|---|---|
| 1 | Nothing hidden | enforced-green | G-1 schema-baseline: schema-baseline clean |
| 2 | Compute is just compute | enforced-green |  |
| 3 | Tunables externalized | enforced-green | G-4: 19 declared, 4 verdict-affecting, 0 violate on_invalid:fail with no deviations[] cover |
| 4 | Compute rule declared | enforced-green | G-2: 15 preserved-in-compute row(s), 0 with no why/notes.json/checks[] grounding |
| 5 | checks >= 1 | enforced-green |  |
| 6 | Omission fails (20 categories) | enforced-green |  |
| 7 | Archetype gates categories | enforced-green |  |
| 8 | Per-target write discipline | enforced-green |  |
| 9 | Banned write needs ledger (+ V7 no_retraction) | enforced-green |  |
| 10 | Verdict row-derived | enforced-green | (a) OK — 11 corpus file(s) scanned, 0 unsanctioned second derivations, 2 sanctioned hit(s) matched SANCTIONED_VERDICT_SITES · (b) OK — SELF_SKIPPED audit table folds to verdict=WARN (!= PASS), row-derived off 1 non-INFO row(s) — VRD-SKIP closed |
| 11 | Phase-order re-derive (declared half, checkOrderGuaranteesCited) | vacuous | no when:"pre_write" checks — vacuously nothing to cite — G-3 completeness half stays open |
| 12 | Truthful crash posture (R-B reachability, static + R-M before-image) | enforced-green | R-B (checkInterruptedPostureTruthful): shape=enrich runner=runEnrichPhase: no staleness.ledgerGatedSkip/selectMode on this path (ENRICHER's own scope-defer archetype, Spec 122 §3.0b); calls staleness.detectInterruptedRetraction directly and folds interruptedRetraction.interrupted into the full/incremental decision before any pass runs · R-M: prose-only (R-M/LG-17 describe not scoped to this step (no before-image target)) |
| 13 | A step validates itself | enforced-green | this run of step:validate IS the mechanism |
| P3 | I/O cost adjudication (measured, not gated) | prose-only | descriptor=50442B notes=12253B checks=19 rows records_meta=5517B (newest post/ capture) |

**Enforced-green: 12/14** · not-run: 0 · vacuous: 1

