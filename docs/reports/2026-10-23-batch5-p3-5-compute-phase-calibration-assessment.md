# C6-3 — `compute_phase_calibration` (scripts/compute-phase-calibration.js) conversion assessment, commit ①

**Target standard:** McDonald's Airtight V3 (Spec 124 R-DF). That is the whole six-part package (R-DT):
- zero purity findings, with no ledger allowance (R-BZ);
- every gate hard from ① (R-BA);
- the seven admission questions, including EXTERNALIZED;
- step-owned variable names (R-DE (v));
- admin visibility (R-DL).

**Archetype:** MATERIALIZER (census re-derived at PH-0 on 2026-10-19, R-AO; `Spec 132 §core.4 (R-AO)`). The step runs two aggregate SELECTs over the two transition ledgers, `permit_phase_transitions` and `lifecycle_transitions`, and rebuilds `phase_stay_calibration` from them: per-cohort median, p25 and p75 days in phase. The write is ONE whole-table replace in one transaction: a staging table, `TRUNCATE`, `INSERT … SELECT` (`:413-434`). It rebuilds a derived table from tables other steps own, which is the MATERIALIZER line (`Spec 132 §materializer.1 (R-EH)`).

**Commit form: compressed (R-PACE-1)**.
- Commit ① is this report plus the red suite.
- Commit ② adds the descriptor, compute, notes, frozen shell and the admin text.
- Commit ③ is the cutover.
- MATERIALIZER has converted members (link_parcel_addresses) and two runner_wired ones (classify_coa_trades, compute_coa_cost_estimates), so compressed is the default (`Spec 132 §x-tooling.2 (R-PACE-1)`, #24).

**Frozen legacy oracle:** `src/tests/steps/compute_phase_calibration/fixtures/legacy-compute-phase-calibration.js.txt`. It is byte-identical to `scripts/compute-phase-calibration.js` (sha256 `d7f018dc31a0bfc1…`, 530 lines), last changed by `0ba9f6b7`.

**Owner spec:** 84 (`84_lifecycle_phase_engine.md` §7 "Calibration Source", :1450).
- The step runs in TWO chains: permits (position 24 of 32) and coa (position 15 of 16). So the domain spec is the owner, as with assert_lifecycle_phase_distribution (C6-1).

**Target spec:** Spec 84 (`identity.spec` "84"). **Governing specs:**
- 122: the step library and the conversion process.
- 124: the policy register — R-BA, R-BZ, R-DE, R-DF, R-DL, R-DT, R-DU, R-ED, R-EH, R-EQ, R-HR.
- 132: the handbook lines cited below.

**Governing plan:** `.cursor/v3-c6-plan-2026-10-19.md`, wave C6-3.

**No database was read for this report** (lane V3-COA-G, 2026-10-23: the fleet night holds the DB). Every live fact in §1.4 is UNMEASURED and queued for the orchestrator (§9).

---

## 1. PH-0 — Boundary freeze (G0)

### 1.1 Reads, writes and transactions
**Eleven reads on the pool, in order** (pinned L2):
1. The DB clock, `SELECT NOW()` (`pipeline.getDbTimestamp`, `:127`).
2. information_schema: `lifecycle_transitions` exists, else THROW (`:141-150`).
3. information_schema: `phase_stay_calibration` exists, else THROW (`:158-167`).
4. COUNT of CoA rows in `lifecycle_transitions` (no seq filter), for a log line only (`:170-180`).
5. information_schema: `coa_applications` exists, else the two coverage reads are skipped (`:184-213`).
6. `coa_applications.project_type` coverage percent (`:191-196`).
7. `lifecycle_transitions` (CoA) `project_type` coverage percent (`:201-207`).
8. The permit aggregate over `permit_phase_transitions` (`:238-269`).
9. The CoA aggregate over `lifecycle_transitions` (`:290-327`).
10. coa_transition_count, CoA rows in the seq range (`:390-394`).
11. coa_type_class_null_transition_count (`:400-405`).

**Writes:** one transaction (`pipeline.withTransaction`, `:413-434`), pinned L4:
- `CREATE TEMP TABLE phase_stay_calibration_staging (LIKE phase_stay_calibration INCLUDING DEFAULTS) ON COMMIT DROP`;
- one bulk `INSERT` of every bucket into the staging table (11 columns, `computed_at` = the DB clock);
- `TRUNCATE phase_stay_calibration`;
- `INSERT INTO phase_stay_calibration SELECT * FROM phase_stay_calibration_staging`.
- With zero buckets the transaction issues only the `TRUNCATE` (`:414-416`): the table is emptied (CPC-D4, pinned L5).

**Lock:** advisory lock 93 wraps the body (`:60`, `:125`).

**Config:** `loadMarketplaceConfigs`, then a Zod schema with one key, `calibration_freshness_warn_hours` (`:62-64`, `:129-134`). It is validated and never read (CPC-D2, pinned L15).

**Module scope:** the body runs only as a CLI (`require.main === module`, `:123`). The module exports `ADVISORY_LOCK_ID`, `COHORT_INSERT_COLS`, `buildBulkInsertSQL`, `flattenBuckets`, `classifyTier` (`:524-530`, pinned L1).

### 1.2 The aggregate (what the conversion must reproduce exactly)
- **Permit side:** LAG over `(permit_num, revision_num)` ordered by `(transitioned_at, id)`; rows with a NULL `from_phase`, `permit_type` or duration are dropped; cohort `(permit_type, from_phase)`; percentiles `ROUND(PERCENTILE_CONT(p))::INTEGER` (round before the cast, never truncate) (pinned L3).
- **CoA side:** `lead_id LIKE 'coa:%' AND (from_seq BETWEEN 1 AND 22 OR to_seq BETWEEN 1 AND 22)`; LAG over `lead_id` ordered by `(transitioned_at, id)`; cohort the 5-tuple `(NULL, project_type, coa_type_class, from_seq, to_seq)`; `phase` = `MIN(from_phase)`; NO filter on `project_type` or `coa_type_class` (the v3 folds call both data-destructive) (pinned L3).
- **Cohort counting:** a bucket with `permit_type` is a permit cohort; else a bucket with `project_type` OR `coa_type_class` is a CoA cohort; else unknown. Tiers: ≥100 high, ≥30 mid, ≥10 low, else outlier; unreliable = sample < 30 = low + outlier (pinned L9).
- **Cap:** more than 5000 buckets THROWS before the write (CPC-D5, pinned L6).

### 1.3 Audit rows, verdict, `records_meta`
- **Audit table:** phase 84, "Phase Calibration", 15 rows in a fixed order (pinned L10). Six carry a non-INFO status: total_buckets (FAIL below 1), unreliable_buckets (WARN above 0), coa_cohort_presence (WARN below 1), coa_project_type_coverage_pct (WARN below 50, INFO when null), unknown_cohort_count (WARN above 0), coa_type_class_null_transition_count (WARN when the ratio to coa_transition_count is above 0.05; PASS when that count is 0) (pinned L10, L11).
- **Verdict:** derived in the step from the row statuses (`:472-474`, CPC-D1).
- **Summary:** `records_total` = the summed sample sizes; `records_new` = the bucket count; `records_updated` = 0 (CPC-D9). `records_meta` = `{audit_table, sample_size_distribution, cohort_dimension_coverage, coa_project_type_coverage_pct, coa_lt_project_type_coverage_pct}`; `cohort_dimension_coverage.coa_type_class_non_null` holds the CoA cohort count, not what its name says (CPC-D8, pinned L13).
- **emitMeta:** reads declare `to_phase` on both ledgers, which no SQL reads (CPC-D13, pinned L14).
- **Lock held elsewhere:** the pipeline helper's skip summary, no read, no write (pinned L16).

### 1.4 Live facts — UNMEASURED at ① (no DB access this lane)
Queued for the orchestrator's read-only pass (§9, item R1): row counts of both ledgers and of `phase_stay_calibration`; the live bucket count and the tier split (decides CPC-D12); the latest `compute_phase_calibration` runs per chain (verdict, records_total); the seed and live value of `calibration_freshness_warn_hours` (seed default 48, `scripts/seeds/logic_variables.json:652`); RLS on `phase_stay_calibration` (enabled by `migrations/227_rls_class_b_default_deny.sql:77`, documented, not measured).

### 1.5 Consumers
- `compute_trade_forecasts` reads the CoA rows (`scripts/compute-trade-forecasts.js:465-473`, `WHERE permit_type IS NULL AND from_seq IS NOT NULL AND median_days IS NOT NULL`).
- The lead inspector reads the permit rows (`src/lib/leads/lead-inspect-query.ts:383-388`, `WHERE permit_type = $1`).
- `assert_global_coverage` counts the CoA rows (`scripts/lib/compute/assert-global-coverage.js:203`).
- `scripts/steps/_schema/consumer-registry.json:4280-4320` lists the producer's contracts.
- An emptied table (CPC-D4) makes the first two fall back to their defaults silently.

### 1.6 Admin visibility (R-DL)
- **Registered today:** `PIPELINE_REGISTRY` (`src/components/FreshnessTimeline.tsx:81`), `STEP_DESCRIPTIONS` (`src/lib/admin/funnel.ts:701`) and `PIPELINE_TABLE_MAP` → `phase_stay_calibration` (`funnel.ts:896`).
- **Gap (CPC-D10):** the summary names only `permit_phase_transitions` and `(permit_type, phase)` cohorts; ② names both ledgers (pinned D5). `Spec 132 §core.16 (R-DL)`.

---

## 2. Behaviour ledger (what the conversion must reproduce)
The red suite pins these as L1–L16 (§10). Each one executes the frozen text.

## 3. Registry target review
- **(a) Files:**
  - `scripts/compute-phase-calibration.js` becomes the frozen shell. `src/tests/compute-phase-calibration.logic.test.ts` (it requires the script's exports) moves to the compute module at ②.
  - Added at ②: `scripts/compute-phase-calibration.descriptor.json`, `scripts/compute-phase-calibration.notes.json`, `scripts/lib/compute/compute-phase-calibration.js`.
- **(b) Tables:**
  - **Reads:** `permit_phase_transitions(permit_num, revision_num, permit_type, from_phase, transitioned_at, id)`, `lifecycle_transitions(lead_id, project_type, coa_type_class, from_seq, to_seq, from_phase, transitioned_at, id)`, `coa_applications(project_type)`. Upstream steps: classify_lifecycle_phase writes both ledgers (`scripts/classify-lifecycle-phase.js:395`, `:875`, `:1427`); classify_coa_scope writes `coa_applications.project_type`.
  - **Writes:** `phase_stay_calibration` (11 columns), whole-table replace.
- **(c) Consumers:** §1.5.
- **(d) Tests:** `src/tests/steps/compute_phase_calibration/violations.test.ts` lands in this commit. For the ② sweep: `src/tests/compute-phase-calibration.logic.test.ts`, `src/tests/compute-phase-calibration.infra.test.ts` (it reads the script text: TRUNCATE, temp-table swap, Zod), `src/tests/db/phase-calibration.db.test.ts`, `src/tests/migration-147-phase-stay-calibration-drop-legacy-pk.infra.test.ts`.

## 4. PH-3 — Intent ledger
Two commits ever touched the file (`git log -- scripts/compute-phase-calibration.js`): `ada49fb8` (WF1 #B, 2026-05-09, the permit side) and `0ba9f6b7` (Phase E.3, 2026-05-15, the CoA side and the atomic swap).

| Intent | Source (introducing commit) | Disposition at ② |
|---|---|---|
| Round percentiles before the integer cast | `:263-265` (`ada49fb8`) | preserved-in-compute (the aggregate SQL text; why in notes.json) |
| LAG with an `, id` tiebreak for idempotent ordering | `:246-248`, `:300-303` (`0ba9f6b7`) | preserved-in-compute (why in notes.json) |
| CoA cohort 5-tuple, no project_type / coa_type_class filter | `:290-327` (`0ba9f6b7`) | preserved-in-compute (why in notes.json) |
| Advisory lock 93 | `:60` (`ada49fb8`) | preserved-in-runner: `identity.lock` 93 |
| Readers never see an empty table (atomic swap) | `:407-434` (`0ba9f6b7`) | preserved-in-runner: the staging-replace executor (card CPC-Q1) |
| Sample-size tiers and the unreliable count | `:84-89`, `:375` (`0ba9f6b7`, `ada49fb8`) | encoded-as-descriptor-field: bounds from step-owned variables |
| Phase-D coverage observability (coverage, unknown cohorts, null ratio) | `:182-227`, `:460-464` (`0ba9f6b7`) | encoded-as-descriptor-field: declared WARN checks |
| Verdict derived from rows | `:472-474` (`0ba9f6b7`) | preserved-in-runner: the library derives it (CPC-D1) |
| Startup existence guards | `:141-213` (`0ba9f6b7`) | preserved-in-validator: `guards.requires` preconditions (CPC-D6) |
| 5000-bucket parameter cap | `:378-385` (`0ba9f6b7`) | knowingly-retired: the executor slices at `maxRowsPerInsert` (R-HR) |
| `calibration_freshness_warn_hours` | `:62-64` (`ada49fb8`) | knowingly-retired candidate (Q-CPC-2) |

## 5. PH-5 — Seam map
| Seam | Legacy effect | `file:line` | V3 seam |
|---|---|---|---|
| db seam | advisory lock 93 | `:60, :125` | `identity.lock` 93 |
| db seam | `loadMarketplaceConfigs` + Zod | `:130-134` | `config.logic_variables[]` resolved by the runner |
| db seam | eleven pool SELECTs | §1.1 | runner-owned reads of compute-authored SQL, declared in `inputs.reads` |
| db seam | one transaction: staging, TRUNCATE, INSERT … SELECT | `:413-434` | the runner's staging-replace executor (`write.executeStagingReplace`), card CPC-Q1 |
| clock seam | `pipeline.getDbTimestamp` once, stamped on `computed_at` | `:127`, `:119` | `run_at` column source, runner-stamped |
| network seam | none | — | — |
| argv/env seam | `require.main === module` CLI guard | `:123` | the frozen shell's `pipeline.step()` entry |

### 5.1 Risk class
| Risk class | Chance | Impact | Mitigation |
|---|---|---|---|
| The ② write form does not exist in the runner (CPC-Q1) | certain at ② | high: no descriptor can run until a materialize replace arm lands; the shell cannot swap | card CPC-Q1 drafted (§12); compute and descriptor built held; nothing registers past red_suite until the ruling |
| Zero buckets no longer empty the table (CPC-D4) | low (needs both ledgers empty) | medium: stale calibration instead of none | declared deviation at ②; total_buckets stays FAIL so the run still says so |
| Swap order (R-EQ, #54) | certain | medium: the swap waits for classify_lifecycle_phase (unconverted, package I) | the PRE can be taken now on the legacy shell; POST and swap ride after classify_lifecycle_phase ② (§9) |
| Two-chain PREs | medium | medium: the coa-chain run sits after the wave-4 coa steps | the coa-chain PRE rides after the A-swap POSTs (`ade0001e`), which have landed |

## 6. PH-6 — Classification and defect ledger (rows CPC-D1…CPC-D13 in `docs/reports/defect-ledger.md`; prefix CPC, unique — `defectPrefixFor` measured, no override)

PH-2 (churn × complexity) is ASSESSMENT-INCOMPLETE because the generated batch artifact `docs/reports/generated/122-churn-complexity.md` covers only the sources chain, and this step is outside its scope. No hand-plotted quadrant is substituted.

- **CPC-D1** (`:437-474`): statuses decided in code; verdict derived in the step (Rule 10) → ② declared checks (pinned L10, D3).
- **CPC-D2** (`:62-64`, `:129-134`): `calibration_freshness_warn_hours` validated, never read, not step-owned; assert_data_bounds retired it already (ADB-D5) → ② Q-CPC-2 (pinned L15).
- **CPC-D3** (§7): code literals → ② step-owned variables (pinned D2).
- **CPC-D4** (`:414-416`): zero buckets empty the table → ② declared deviation, the empty-set guard (pinned L5).
- **CPC-D5** (`:378-385`): a 5000-bucket throw → ② knowingly-retired, `Spec 132 §x-v3.3 (R-HR)`: the mechanism it guards (one bulk INSERT) is gone (pinned L6).
- **CPC-D6** (`:141-213`): existence probes in the body → ② `guards.requires` (pinned L7, L8).
- **CPC-D7** (`:169-180`, `:214-227`): log-only measurements → ② the lag becomes a WARN check; the zero-CoA probe and the duplicate floor log are retired under R-HR (pinned L12).
- **CPC-D8** (`:495-501`): mislabelled records_meta key → ② (pinned L13).
- **CPC-D9** (`:476-479`): replace counters → ② executor counters (pinned L13).
- **CPC-D10** (`funnel.ts:701`): admin summary misses the CoA cohorts → ② (pinned D5).
- **CPC-D11** (`:413-434`): TRUNCATE blocks readers; staging copies no constraints → ② declared deviation, the executor's DELETE (MVCC) and INCLUDING CONSTRAINTS (pinned L4).
- **CPC-D12** (`:444`): unreliable_buckets is WARN on any small cohort, likely every run (`Spec 132 §core.6 (R-H)`: a never-zero metric is WARN with a retighten condition, or INFO) → decided at ② on the PRE's measured value.
- **CPC-D13** (`:508-517`): emitMeta over-declares `to_phase` → ② `inputs.reads` lists only what is read, `Spec 132 §core.14 (R-BG)` (pinned L14).

## 7. PH-6 — Literal ledger (Rule 3, R-DF EXTERNALIZED)
| Literal | `file:line` | Disposition |
|---|---|---|
| tier boundaries 100 / 30 / 10 | `:84-89` | `compute_phase_calibration_tier_{high,mid,low}_min` variables |
| unreliable floor 30 | `:375`, `:444` | `compute_phase_calibration_reliable_sample_min` (a bucket below it is unreliable; equal to the mid floor today, kept as its own variable because the legacy keeps the two rules apart) |
| coverage floor 50 | `:214`, `:461` | `compute_phase_calibration_project_type_coverage_min_pct` |
| coverage lag 10 | `:221` | `compute_phase_calibration_coverage_lag_max_pct` |
| null ratio 0.05 | `:464` | `compute_phase_calibration_null_class_ratio_max` |
| CoA seq range 1..22 | `:306`, `:393`, `:404` | pinned min = max definitional window (Spec 84 §2.5.c, 22 CoA statuses), `Spec 132 §core.8 (R-A)` |
| 5000 | `:380` | retired (CPC-D5) |
| 93 | `:60` | `identity.lock` (not a tunable) |
| `phase: 84`, "Phase Calibration" | `:482-483` | `identity` declaration |

## 8. Purity estimate (gate E codes G0–G13, 122a §A26)
| Code | Legacy sites | Disposition at ② |
|---|---|---|
| G1 ledger SQL | config via `loadMarketplaceConfigs` `:130` | runner config |
| G4 txn/lock | advisory lock `:125`; `withTransaction` `:413` | runner |
| G5 direct write | staging INSERT, TRUNCATE, INSERT … SELECT `:418-432` | the runner's replace executor |
| G7 compute decides | the audit statuses and the verdict `:437-474` | declared check bounds (the library compares and derives) |
| G9 literal | §7 | config or a pinned definitional variable |
| clock | `getDbTimestamp` `:127` | `run_at` |

**Expected after ②:** 0 findings, no ledger allowance (R-BZ, R-DF).

## 9. PRE goldens and forced-change proof — NOT YET CAPTURED
**PRE:** taken on the legacy code at the ① tree, before any compute change (trap 7), under the DB lock, in three modes: `permits`-chain, `coa`-chain, standalone. The legacy write is a whole-table replace, so every run rewrites every row: the PRE itself is the forced-change proof (the rerun writes the same row set), but its rerun is NOT zero-write, so the ② descriptor declares `idempotent_rerun` honestly for a replace (to be fixed with the card).

**POST and the swap:** NOT on the next night. `Spec 132 §x-stages.2 (R-EQ)`: the shell may swap only once every declared upstream is converted or swapped; classify_lifecycle_phase (both ledgers) is unconverted and not even pending (package I), so #54 refuses the swap. ② lands at `compute_ported` with the legacy shell live (after CPC-Q1); POST + swap ride the night after classify_lifecycle_phase swaps.

**Queued for the orchestrator (no DB this lane):**
- R1 (read-only, any time): the §1.4 facts.
- P1-P3 (DB night, lock held): `node scripts/analysis/capture-step-golden.js` PRE for `compute_phase_calibration` in the permits, coa and standalone modes, on this branch's ① tree, plus their `recapture.json` entries (`Spec 132 §x-captures.1 (R-CZ)`).

## 10. Red suite (PH-7) — `src/tests/steps/compute_phase_calibration/violations.test.ts`
- **Size:** 24 tests.
  - L1–L16 are GREEN today (the legacy oracle).
  - D1–D5, D7 and D8 are `it.fails`, RED as named missing artifacts.
  - D6 is a plain `it` (R-R / Rule 13).
- Red evidence: docs/reports/red-evidence/compute_phase_calibration/pre2-artifacts-missing.json (vitest JSON reporter output, the D claims run as plain `it` calls): 17 pass / 7 fail.
  - D1–D4 and D8 fail as ENOENT on the named descriptor or compute.
  - D5 fails on the admin summary that names only one ledger.
  - D7 fails because converted[] does not hold the file.
- **Oracle harness:** `fixtures/legacy-harness.ts` fakes `./lib/pipeline` and `./lib/config-loader`; `zod` is real. The fake pool answers each SELECT by its shape; the fake transaction client records the write statements. The aggregate SQL is not evaluated (no database); its text is pinned by its tokens (L3).

| Pins | Behaviour |
|---|---|
| L1–L4 | CLI guard and exports; read order under lock 93; the aggregate SQL; the one-transaction replace |
| L5–L8 | zero buckets empty the table; the 5000 cap throw; the two guard throws; the missing coa_applications branch |
| L9–L12 | cohorts and tiers; the 15 rows and the derived verdict; coverage and null-ratio statuses; log-only measurements |
| L13–L16 | the summary and the mislabelled key; emitMeta's unread to_phase; the validated-unread variable; the lock-held lane |
| D1–D8 | descriptor and shell; step-owned variables; declared checks; compute purity; admin text; scorecard; registry (③); the replace write form |

## 11. Registry at ① (this commit) and what is owed later
- **Landed:**
  - `converted.json` `pending[]` at stage `red_suite` (`Spec 132 §x-stages.1 (R-K)`);
  - the census row moves from C6 to pending, archetype MATERIALIZER, owner spec 84 (plus the two census fixtures);
  - CPC-D1…D13;
  - ADOPTION `legacy_oracle_excluded`;
  - the roadmap regenerated.
- **Owed at ②:** descriptor, notes, shell, the variables migration, the admin text, a scorecard refresh; the write form waits on CPC-Q1. The pure compute is built and parity-locked (P1–P7 against this oracle) but HELD outside the tree: `src/tests/step-conformance.infra.test.ts:700` requires every `scripts/lib/compute/` module to export a `checks` dispatch equal to its descriptor's check ids, so it lands with the descriptor after CPC-Q1.
- **Owed at ③:** registration, blocked by EP-PIN-D17 under R-ED and by LDG-10 (`programme-items.json` already lists this slug in both `gate.blocks`).

## 12. Operator decisions
- **RULED 2026-10-19:** the C6 census is MATERIALIZER (`.cursor/v3-c6-plan-2026-10-19.md`).
- **Card CPC-Q1 (new register row needed; drafted, NOT decided here):** should `runMaterializePhase` gain a whole-table replace arm that runs the existing `write.executeStagingReplace`?
  - Evidence: `phase_stay_calibration` has no usable key (migration 147 dropped the primary key; the remaining `UNIQUE (permit_type, project_type, coa_type_class, from_seq, to_seq)` never matches a row with a NULL, and every row has one), so no keyed `guarded_upsert` or `replace_keys` pair (R-EH (d)) can express the write. `staging_full_replace` has an executor (`scripts/lib/step/write.js:2351`) but only `runIngestPhase` dispatches it (`index.js:2212`), and it is `x-banned-for-new` outside `load_centreline` (R-FW).
  - Recommendation: yes, the simplest form — `execution.materialize_form: "replace"`: the compute returns its aggregate SQL (`buildSourceSql`) and shapes the rows (`materializeRows`); the runner reads once and calls the existing executor in one transaction. One schema enum value, one dispatch branch, one grandfathered entry, no new executor. compute_storey_norms (a truncate-replace twin, census `scripts/compute-storey-norms.js:79-100`) would use the same arm.
- **Q-CPC-2 (decided at ②):** retire `calibration_freshness_warn_hours` (validated, never read here, already retired from assert_data_bounds). Recommend y, by `config.retired[]` (never deleted, `Spec 132 §core.8 (R-AW)`).

## 13. Compliance table (seven questions, R-DF)
| Planned change | Rule | Std | Obs | Rec | Scal | Acc | Simple | Ext |
|---|---|---|---|---|---|---|---|---|
| MATERIALIZER descriptor + frozen shell (D1) | Spec 122 §5.1; R-EH | classify_coa_trades form | step-validate gates A–K | this report | archetype | red-first D1 | precedent | — |
| Step-owned variables (D2) | R-DE (v), R-DF | `<slug>_*` | gate A | CPC-D2, CPC-D3 | every new step | measured keys | one migration | **yes** |
| Declared checks (D3) | R-BA, Rule 10 | link_parcel_addresses checks[] | verdict.js | CPC-D1 | all checks | L9–L12 pinned | one check per row | bounds from config |
| Compute purity (D4) | R-BZ | G-codes | gate E #32 | CPC-D5, CPC-D6 | fleet | red-first | seams only | — |
| Admin text (D5) | R-DL | STEP_DESCRIPTIONS | D5 lock | CPC-D10 | every step | read | one line | — |
| Replace write form (D8) | R-EH (amend, CPC-Q1) | executeStagingReplace | captures | CPC-D4, CPC-D11 | the truncate-replace twins | L4–L5 pinned | reuse | — |

## R. Reflection (G9)
### LOW-CONFIDENCE
- **No live numbers.** Every count in this report comes from the code, not the DB. CPC-D12 (is unreliable_buckets always WARN?) is a prediction until the PRE measures it.
- **Whether `idempotent_rerun` can be declared truthfully for a replace target** in the MATERIALIZER profile is checked with the card; the INGESTOR precedent (load_centreline) is the model.

### RECURRING / STANDARD-SHAPING
- **Validated-but-unread variables** now appear in three C6 steps: assert_staleness (1), assert_lifecycle_phase_distribution (36) and here (1). The C6-1 reflection's gate candidate holds.
- **Whole-table rebuilds with no usable key** (this step, compute_storey_norms) have no MATERIALIZER arm. One ruling (CPC-Q1) serves every such step.

## A. Measurement log (2026-10-23)
- **A.F-DB:** NOT RUN (no DB access this lane; queued as R1).
- **A.F-CODE:** `scripts/compute-phase-calibration.js` @ `0ba9f6b7`, 530 lines, sha256 `d7f018dc31a0bfc1…`.
- **A.F-ORACLE:** `npx vitest run src/tests/steps/compute_phase_calibration/` — 16 pins green, 7 claims red as expected, D6 green once the scorecard is written.

---

## Validation scorecard (generated)

> Generated by `node scripts/analysis/step-validate.mjs --step=compute_phase_calibration --write` — Spec 123 §6, ruling R-R (2026-08-29).
> Regenerate with the same command; a stale block is a conformance-lock finding (`step-conformance.infra.test.ts`).

**Score: 14/17** · G9 Reflection: PASS · G4d fence-lock coverage: PASS · G-shape: PASS · **Hard stop: YES (G8, Rule 1 (unpinned enforced-red), Rule 5 (unpinned enforced-red), Rule 6 (unpinned enforced-red), Rule 7 (unpinned enforced-red), Rule 8 (unpinned enforced-red), Rule 9 (unpinned enforced-red), Rule 13 (unpinned enforced-red))**

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
| G1 | 1 | 1 | PH-3 section found=true sha-count=14 |
| G2 | 1 | 1 | no generated churn×complexity row; no PH-2 section; ASSESSMENT-INCOMPLETE claimed instead; why-stated=true |
| G3 | 2 | 2 | ledger rows=11 vocab-hit rows=11; evidence rows=0 (not scored) |
| G4 | 2 | 2 | risk-class row with chance+impact found=true |
| G5 | 1 | 1 | db=true clock=true network=true argv/env=true |
| G6 | 3 | 3 | 13 ledger row(s), 0 without CLOSED/PIN () |
| G7 | 3 | 3 | file=true fences=0 it-count=26 red-evidence-claims=1 red-evidence-pass=true ledger-deferred=false |
| G8 | 0 | 3 | missing-invocations=3 missing-pre-invocations=3 stale-fingerprints=0 unexplained-diffs=0 |
| G9 (binary) | PASS | — | heading=true low-confidence-table=true recurring-table=true |
| G4d (fence<=lock) | PASS | — | fences=0 lock-it-count=26 |
| G-shape | PASS | — | file-clean=null compute-clean=null |

### Fast invariants (always run — the fast descriptor gate)

| # | Scope | Pass | Detail |
|---|---|---|---|
| 4 | (registry) | PASS | overlap: none |
| 5 | (registry) | PASS | clean (0 it.fails( call sites outside a declared pending slug) |
| 9 | (registry) | PASS | clean (0 converted slugs blocked by an unmet cutover_prereq item; blocks batching: 0) |
| 22 | (registry) | PASS | GOLD-PRE-FRESH: 83 PRE capture(s) across 27 converted step(s) all tracked + clean (git can restore every reference); net-new (R-DK): load_bylaw_map_areas, link_parcel_abutments |
| 23 | (registry) | PASS | COMPRESSED-FORM-ELIGIBLE: 9 compressed-form declaration(s), all eligible (proven archetype, >=2 converted members) |
| 24 | (registry) | PASS | COMPRESSED-FORM-DEFAULT: 9 eligible pending slug(s), all either compressed or carry a stated full-form reason |
| 25 | (registry) | PASS | ARCHETYPE-PARITY: 29 converted slug(s) — 29 compared against a retained census row (all agree), 0 with no retained row (census arm n/a, pre-R-AO cutovers); every archetype has a declared freeze profile |
| 26 | (registry) | PASS | COUNTER-ROOT: 74 declared counter source(s) across 25 descriptor(s) all root in their own shape's counterScope (+ records_meta) |
| 27 | (registry) | PASS | ROW-ERROR-GATE: 11 skip/quarantine declaration(s), all cite a real FAIL-severity, bound-carrying check in their own descriptor |
| 28 | (registry) | PASS | CLOSED-BOUNDS (gate A): 0 bound(s) checked, all closed (0 ledger-allowed, 0 from config/viol==0) |
| 29 | (registry) | PASS | ON-INVALID-CLOSED (gate B): 0 on_invalid(s) checked, all closed (0 ledger-allowed, 0 from fail/named-deviation) |
| 30 | (registry) | PASS | EMITS-EQUIV (gate C): 0 emits drift(s) checked, all closed (0 ledger-allowed, 0 from declared==emitted) |
| 31 | (registry) | PASS | CONSUMER-REGISTRY (gate D): 0 contract(s) checked, all closed (0 ledger-allowed, 0 present+typed/excluded); 42 unproduced src read(s) (hard until the FLEET-2 landing commit (.cursor/wf2_registry_truth_active_task.md, Fold 14 P1-C6)) [unproduced:src/app/api/admin/builders/route.ts:entities.google_place_id; unproduced:src/app/api/admin/stats/route.ts:notifications.is_sent; unproduced:src/app/api/admin/stats/route.ts:permits.first_seen_at; unproduced:src/app/api/leads/flight-board/detail/[id]/route.ts:permits.updated_at; unproduced:src/app/api/leads/flight-board/route.ts:permits.updated_at; unproduced:src/app/api/notifications/route.ts:notifications.id; unproduced:src/app/api/notifications/route.ts:notifications.is_read; unproduced:src/app/api/permits/[id]/route.ts:permit_inspections.created_at; unproduced:src/features/leads/lib/get-lead-feed.ts:entities.id; unproduced:src/features/leads/lib/get-lead-feed.ts:entities.photo_url; unproduced:src/features/leads/lib/get-lead-feed.ts:permits.location; unproduced:src/lib/admin/supplier-leads.ts:trade_forecasts.target_window; unproduced:src/lib/analytics/queries.ts:entities.id; unproduced:src/lib/builders/enrichment.ts:entities.first_seen_at; unproduced:src/lib/builders/enrichment.ts:entities.google_place_id; unproduced:src/lib/builders/enrichment.ts:entities.google_rating; unproduced:src/lib/builders/enrichment.ts:entities.google_review_count; unproduced:src/lib/builders/enrichment.ts:entities.id; unproduced:src/lib/builders/enrichment.ts:entities.linkedin_url; unproduced:src/lib/builders/enrichment.ts:entities.photo_url; unproduced:src/lib/builders/enrichment.ts:entities.photo_validated_at; unproduced:src/lib/builders/enrichment.ts:entities.trade_name; unproduced:src/lib/leads/lead-detail-query.ts:permits.updated_at; unproduced:src/lib/leads/lead-detail-query.ts:trade_forecasts.target_window; unproduced:src/lib/leads/lead-inspect-query.ts:coa_applications.lead_id; unproduced:src/lib/leads/lead-inspect-query.ts:lifecycle_status_history.id; unproduced:src/lib/leads/lead-inspect-query.ts:permits.first_seen_at; unproduced:src/lib/leads/lead-inspect-query.ts:permits.updated_at; unproduced:src/lib/leads/lead-inspect-query.ts:trade_forecasts.target_window; unproduced:src/lib/quality/metrics.ts:entities.google_place_id; unproduced:src/lib/quality/metrics.ts:permits.first_seen_at; unproduced:src/lib/sync/process.ts:permits.bid_value; unproduced:src/lib/sync/process.ts:permits.first_seen_at; unproduced:src/lib/sync/process.ts:permits.lead_id; unproduced:src/lib/sync/process.ts:permits.lifecycle_block; unproduced:src/lib/sync/process.ts:permits.lifecycle_group; unproduced:src/lib/sync/process.ts:permits.lifecycle_seq; unproduced:src/lib/sync/process.ts:permits.lifecycle_stage; unproduced:src/lib/sync/process.ts:permits.location; unproduced:src/lib/sync/process.ts:permits.photo_url; unproduced:src/lib/sync/process.ts:permits.trade_classified_at; unproduced:src/lib/sync/process.ts:permits.updated_at]; UNPRODUCED-UNWITNESSED: 42 (report-only until the table's inserter and its last unconverted writer convert, R-EE) [UNPRODUCED-UNWITNESSED:src/app/api/admin/builders/route.ts:entities.google_place_id; UNPRODUCED-UNWITNESSED:src/app/api/admin/stats/route.ts:notifications.is_sent; UNPRODUCED-UNWITNESSED:src/app/api/admin/stats/route.ts:permits.first_seen_at; UNPRODUCED-UNWITNESSED:src/app/api/leads/flight-board/detail/[id]/route.ts:permits.updated_at; UNPRODUCED-UNWITNESSED:src/app/api/leads/flight-board/route.ts:permits.updated_at; UNPRODUCED-UNWITNESSED:src/app/api/notifications/route.ts:notifications.id; UNPRODUCED-UNWITNESSED:src/app/api/notifications/route.ts:notifications.is_read; UNPRODUCED-UNWITNESSED:src/app/api/permits/[id]/route.ts:permit_inspections.created_at; UNPRODUCED-UNWITNESSED:src/features/leads/lib/get-lead-feed.ts:entities.id; UNPRODUCED-UNWITNESSED:src/features/leads/lib/get-lead-feed.ts:entities.photo_url; UNPRODUCED-UNWITNESSED:src/features/leads/lib/get-lead-feed.ts:permits.location; UNPRODUCED-UNWITNESSED:src/lib/admin/supplier-leads.ts:trade_forecasts.target_window; UNPRODUCED-UNWITNESSED:src/lib/analytics/queries.ts:entities.id; UNPRODUCED-UNWITNESSED:src/lib/builders/enrichment.ts:entities.first_seen_at; UNPRODUCED-UNWITNESSED:src/lib/builders/enrichment.ts:entities.google_place_id; UNPRODUCED-UNWITNESSED:src/lib/builders/enrichment.ts:entities.google_rating; UNPRODUCED-UNWITNESSED:src/lib/builders/enrichment.ts:entities.google_review_count; UNPRODUCED-UNWITNESSED:src/lib/builders/enrichment.ts:entities.id; UNPRODUCED-UNWITNESSED:src/lib/builders/enrichment.ts:entities.linkedin_url; UNPRODUCED-UNWITNESSED:src/lib/builders/enrichment.ts:entities.photo_url; UNPRODUCED-UNWITNESSED:src/lib/builders/enrichment.ts:entities.photo_validated_at; UNPRODUCED-UNWITNESSED:src/lib/builders/enrichment.ts:entities.trade_name; UNPRODUCED-UNWITNESSED:src/lib/leads/lead-detail-query.ts:permits.updated_at; UNPRODUCED-UNWITNESSED:src/lib/leads/lead-detail-query.ts:trade_forecasts.target_window; UNPRODUCED-UNWITNESSED:src/lib/leads/lead-inspect-query.ts:coa_applications.lead_id; UNPRODUCED-UNWITNESSED:src/lib/leads/lead-inspect-query.ts:lifecycle_status_history.id; UNPRODUCED-UNWITNESSED:src/lib/leads/lead-inspect-query.ts:permits.first_seen_at; UNPRODUCED-UNWITNESSED:src/lib/leads/lead-inspect-query.ts:permits.updated_at; UNPRODUCED-UNWITNESSED:src/lib/leads/lead-inspect-query.ts:trade_forecasts.target_window; UNPRODUCED-UNWITNESSED:src/lib/quality/metrics.ts:entities.google_place_id; UNPRODUCED-UNWITNESSED:src/lib/quality/metrics.ts:permits.first_seen_at; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.bid_value; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.first_seen_at; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.lead_id; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.lifecycle_block; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.lifecycle_group; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.lifecycle_seq; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.lifecycle_stage; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.location; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.photo_url; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.trade_classified_at; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.updated_at]; LDG-10 step readers: 0 hard, 25 UNPRODUCED-UNWITNESSED (unconverted inserter) [UNPRODUCED-UNWITNESSED:step:assert_lifecycle_phase_distribution:permits.lifecycle_seq; UNPRODUCED-UNWITNESSED:step:classify_coa_scope:coa_applications.id; UNPRODUCED-UNWITNESSED:step:classify_coa_trades:coa_applications.id; UNPRODUCED-UNWITNESSED:step:classify_coa_trades:coa_applications.lead_id; UNPRODUCED-UNWITNESSED:step:classify_lifecycle_phase:coa_applications.id; UNPRODUCED-UNWITNESSED:step:classify_lifecycle_phase:coa_applications.lead_id; UNPRODUCED-UNWITNESSED:step:classify_lifecycle_phase:coa_applications.permit_type; UNPRODUCED-UNWITNESSED:step:classify_lifecycle_phase:permits.lifecycle_seq; UNPRODUCED-UNWITNESSED:step:compute_coa_cost_estimates:coa_applications.id; UNPRODUCED-UNWITNESSED:step:compute_coa_cost_estimates:coa_applications.lead_id; UNPRODUCED-UNWITNESSED:step:compute_cost_estimates:permit_trades.trade_slug; UNPRODUCED-UNWITNESSED:step:compute_opportunity_scores:trade_forecasts.target_window; UNPRODUCED-UNWITNESSED:step:compute_phase_calibration:lifecycle_transitions.id; UNPRODUCED-UNWITNESSED:step:compute_phase_calibration:permit_phase_transitions.id; UNPRODUCED-UNWITNESSED:step:compute_trade_forecasts:coa_applications.lead_id; UNPRODUCED-UNWITNESSED:step:enrich_coa_zoning:coa_applications.id; UNPRODUCED-UNWITNESSED:step:enrich_coa_zoning:coa_applications.lead_id; UNPRODUCED-UNWITNESSED:step:enrich_named_builders:entities.id; UNPRODUCED-UNWITNESSED:step:enrich_wsib_builders:entities.id; UNPRODUCED-UNWITNESSED:step:link_coa:coa_applications.id; UNPRODUCED-UNWITNESSED:step:link_coa_to_parcels:coa_applications.id; UNPRODUCED-UNWITNESSED:step:link_coa_to_parcels:coa_applications.lead_id; UNPRODUCED-UNWITNESSED:step:update_tracked_projects:coa_applications.lead_id; UNPRODUCED-UNWITNESSED:step:update_tracked_projects:permits.lead_id; UNPRODUCED-UNWITNESSED:step:update_tracked_projects:tracked_projects.id]; 6 unconverted-producer read(s) listed (O3, red once the producer converts) [unconverted_producer:scripts/analysis/gates/captures.mjs:value; unconverted_producer:scripts/analysis/gates/witness.mjs:x; unconverted_producer:scripts/classify-lifecycle-phase.js:permit_classifier_extended; unconverted_producer:scripts/quality/assert-lifecycle-phase-distribution.js:seq_violations; unconverted_producer:scripts/quality/assert-lifecycle-phase-distribution.js:seq_violations_truncated_count; unconverted_producer:scripts/quality/assert-network-health.js:scraper_telemetry] |
| 37 | (registry) | PASS | LF-ONLY (gate F): 0 path(s) checked, all LF (0 ledger-allowed) |
| 33 | (registry) | PASS | BANNED-COVERAGE (gate I): all 2 x-banned-for-new path(s) enforced |
| 34 | (registry) | PASS | STALENESS-DISPOSITION (gate I): 35 declared fingerprint_inputs entries, all adjudicated (registry present=true) |
| 35 | (registry) | PASS | CENSUS-PARITY (gate I): every converted slug has a census row, an exemption, or a ledger-allowed gap |
| 36 | (registry) | PASS | DEFECT-ID-UNIQUENESS (gate I): 639 definition row(s) checked, 134 legal mirror(s), 0 disagreements |
| 38 | (registry) | PASS | CAPTURE-NONZERO (gate G): every declared write target is closed (0 ledger-allowed, 4 outputs:"none" vacuous) |
| 39 | (registry) | PASS | CAPTURE-FRESHNESS (gate G): 89 post capture(s) checked against scripts/lib/step/**, all fresh or ledger-allowed |
| 40 | (registry) | PASS | CAPTURE-EXPLAINED (gate G): 29 step(s) checked — every diff-explanation channel accounted for |
| 32 | (registry) | PASS | COMPUTE-LITERALS (gate E): 1 finding(s), all ledger-allowed (1); ESTATE-LITERALS (gate E estate arm, R-EB): 0 finding(s) in scripts/analysis/gates, scripts/lib/step; tooling ratchet (PIN EXT-2) 128 finding(s) over 6 files, at or below the marks |
| 41 | (registry) | PASS | RED-EVIDENCE (gate K): 0 step(s) without a committed red-evidence artifact; 0 orphan ledger row(s) |
| 42 | (registry) | PASS | DEFECT-PREFIX-UNIQUE: 48 slug(s), every defect prefix unique |
| 45 | (registry) | PASS | NOTES-CAP: 22 declaring notes file(s), every one <= 12 prose entries |
| 46 | (registry) | PASS | report-only (adoption); enforced by #44 (a)/(c) (R-DB; fold 9 C7-1/C7-2): checks[].reads declared by 3/29 step(s); write_inventory.by_mode declared by 0/29 |
| 52 | (registry) | PASS | PRECOMMIT-BUDGET (R-EC): docs-only 20.41 s <= 25.3 s; registry-input 25.91 s <= 27.5 s; measured 2026-10-21T21:10:54.484Z on Bretts-Mac-Mini.local (darwin arm64, 12 cpu), hook sha matches |
| 47 | (registry) | PASS | MODE-EMITS-TYPE (P2-C5): 29 step(s) mode_select per archetype; 538 emits.type check(s), 0 mismatches |
| 48 | (registry) | PASS | LOGIC-VERSION (P2-C3): 29 step(s) logic_version <=> code_version trigger; 35 fingerprint_inputs entr(y/ies) examined, 0 violations |
| 49 | (registry) | PASS | TERMINALS-RECORDS-META (#75): 29 step(s); 344 declared-key check(s), 0 violations; 170 terminal(s) unwitnessed (no capture) |
| 51 | (registry) | PASS | ADMIN-REGISTRATION (R-DL/R-DW): 48 converted/pending step(s) admin-verifiable (7 without a descriptor: slug arms only, R-DV); no hand-written range on a converted step |
| 53 | (registry) | FAIL | VARIABLE-EFFECT (R-EO): 197 admin badge(s) out of date — assert_lifecycle_phase_distribution_cross_active_inspection_threshold: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_cross_issued_threshold: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_cross_stalled_threshold: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_live_status_null_warn_count: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_max_detail_keys: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_100_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_100_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_101_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_101_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_102_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_102_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_103_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_103_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_104_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_104_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_105_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_105_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_106_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_106_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_107_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_107_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_108_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_108_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_109_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_109_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_10_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_10_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_110_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_110_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_11_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_11_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_12_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_12_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_13_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_13_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_14_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_14_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_15_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_15_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_16_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_16_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_17_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_17_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_18_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_18_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_19_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_19_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_1_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_1_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_20_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_20_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_21_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_21_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_22_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_23_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_23_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_24_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_24_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_25_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_25_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_26_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_26_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_27_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_27_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_28_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_29_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_29_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_2_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_2_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_30_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_31_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_31_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_32_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_32_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_33_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_33_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_34_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_35_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_35_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_36_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_36_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_37_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_38_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_38_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_39_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_39_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_3_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_3_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_40_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_40_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_41_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_41_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_42_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_42_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_43_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_43_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_44_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_45_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_45_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_46_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_46_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_47_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_48_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_49_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_49_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_4_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_4_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_50_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_51_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_51_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_52_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_52_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_53_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_54_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_55_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_56_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_57_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_57_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_58_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_59_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_59_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_5_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_5_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_60_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_60_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_61_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_61_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_62_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_62_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_63_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_63_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_64_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_64_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_65_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_66_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_67_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_68_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_68_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_69_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_69_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_6_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_6_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_70_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_71_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_72_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_72_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_73_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_73_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_74_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_75_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_76_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_77_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_78_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_79_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_7_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_7_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_80_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_81_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_82_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_83_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_84_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_84_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_85_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_85_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_86_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_86_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_87_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_87_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_88_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_89_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_89_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_8_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_8_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_90_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_90_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_91_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_92_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_92_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_93_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_93_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_94_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_95_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_95_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_96_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_97_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_97_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_98_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_98_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_99_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_99_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_9_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_9_min: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_promote_to_fail_band_violation: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_promote_to_fail_expected_data_missing: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_band_promote_to_fail_no_band_configured: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_seq_unclassified_max: missing badge (takes_effect_at_cutover); assert_lifecycle_phase_distribution_unclassified_max: missing badge (takes_effect_at_cutover) — run node scripts/generate-logic-variable-effect.mjs |
| 54 | (registry) | PASS | SWAP-ORDER (R-EQ): every swapped pending step's declared upstreams are converted or swapped (R-EQ) |

### Captures (item iv)
- missing invocations (POST): permits::, coa::, none::
- missing invocations (PRE, GOLD-PRE): permits::, coa::, none::
- stale fingerprints: none
- compare ran: false · diffs found: 0 · unexplained: 0

### Test suite (item iii)
- 3430/3459 passed (suite success=false)
- harvested: 138 file(s) from 3 FLEET-WIDE targets (src/tests/step-conformance.infra.test.ts, src/tests/golden-fingerprint.infra.test.ts, src/tests/steps/) — one spawn per run, so every step's report carries this same number, by design
- excluded (R-AG live-DB tier, owned by `npm run test:db`, derived from package.json `scripts.test`): 1 — **/*.db.test.ts
- skipped (declared but not run): 0
- failing (29):
  - src/tests/step-conformance.infra.test.ts > R-R / Rule 13 — the generated scorecard block is not stale (vitest-independent sections) > scripts/quality/assert-schema.js (slug "assert_schema") > the committed block's vitest-independent sections equal a fresh `step:validate --fast` run
  - src/tests/step-conformance.infra.test.ts > R-R / Rule 13 — the generated scorecard block is not stale (vitest-independent sections) > scripts/load-ravines.js (slug "load_ravines") > the committed block's vitest-independent sections equal a fresh `step:validate --fast` run
  - src/tests/step-conformance.infra.test.ts > R-R / Rule 13 — the generated scorecard block is not stale (vitest-independent sections) > scripts/link-massing.js (slug "link_massing") > the committed block's vitest-independent sections equal a fresh `step:validate --fast` run
  - src/tests/step-conformance.infra.test.ts > R-R / Rule 13 — the generated scorecard block is not stale (vitest-independent sections) > scripts/link-wsib.js (slug "link_wsib") > the committed block's vitest-independent sections equal a fresh `step:validate --fast` run
  - src/tests/step-conformance.infra.test.ts > R-R / Rule 13 — the generated scorecard block is not stale (vitest-independent sections) > scripts/link-parcel-addresses.js (slug "link_parcel_addresses") > the committed block's vitest-independent sections equal a fresh `step:validate --fast` run
  - src/tests/step-conformance.infra.test.ts > R-R / Rule 13 — the generated scorecard block is not stale (vitest-independent sections) > scripts/compute-centroids.js (slug "compute_centroids") > the committed block's vitest-independent sections equal a fresh `step:validate --fast` run
  - src/tests/step-conformance.infra.test.ts > R-R / Rule 13 — the generated scorecard block is not stale (vitest-independent sections) > scripts/link-parcels.js (slug "link_parcels") > the committed block's vitest-independent sections equal a fresh `step:validate --fast` run
  - src/tests/step-conformance.infra.test.ts > R-R / Rule 13 — the generated scorecard block is not stale (vitest-independent sections) > scripts/refresh-snapshot.js (slug "refresh_snapshot") > the committed block's vitest-independent sections equal a fresh `step:validate --fast` run
  - src/tests/step-conformance.infra.test.ts > R-R / Rule 13 — the generated scorecard block is not stale (vitest-independent sections) > scripts/enrich-parcels.js (slug "enrich_parcels") > the committed block's vitest-independent sections equal a fresh `step:validate --fast` run
  - src/tests/step-conformance.infra.test.ts > R-R / Rule 13 — the generated scorecard block is not stale (vitest-independent sections) > scripts/quality/assert-global-coverage.js (slug "assert_global_coverage") > the committed block's vitest-independent sections equal a fresh `step:validate --fast` run
  - src/tests/step-conformance.infra.test.ts > R-R / Rule 13 — the generated scorecard block is not stale (vitest-independent sections) > scripts/quality/assert-data-bounds.js (slug "assert_data_bounds") > the committed block's vitest-independent sections equal a fresh `step:validate --fast` run
  - src/tests/step-conformance.infra.test.ts > R-R / Rule 13 — the generated scorecard block is not stale (vitest-independent sections) > scripts/quality/assert-engine-health.js (slug "assert_engine_health") > the committed block's vitest-independent sections equal a fresh `step:validate --fast` run
  - src/tests/step-conformance.infra.test.ts > R-R / Rule 13 — the generated scorecard block is not stale (vitest-independent sections) > scripts/link-neighbourhoods.js (slug "link_neighbourhoods") > the committed block's vitest-independent sections equal a fresh `step:validate --fast` run
  - src/tests/step-conformance.infra.test.ts > R-R / Rule 13 — the generated scorecard block is not stale (vitest-independent sections) > scripts/geocode-permits.js (slug "geocode_permits") > the committed block's vitest-independent sections equal a fresh `step:validate --fast` run
  - src/tests/step-conformance.infra.test.ts > R-R / Rule 13 — the generated scorecard block is not stale (vitest-independent sections) > scripts/quality/assert-parcel-sanity.js (slug "assert_parcel_sanity") > the committed block's vitest-independent sections equal a fresh `step:validate --fast` run
  - src/tests/step-conformance.infra.test.ts > R-R / Rule 13 — the generated scorecard block is not stale (vitest-independent sections) > scripts/enrich-ravines.js (slug "enrich_ravines") > the committed block's vitest-independent sections equal a fresh `step:validate --fast` run
  - src/tests/step-conformance.infra.test.ts > R-R / Rule 13 — the generated scorecard block is not stale (vitest-independent sections) > scripts/enrich-heritage.js (slug "enrich_heritage") > the committed block's vitest-independent sections equal a fresh `step:validate --fast` run
  - src/tests/step-conformance.infra.test.ts > R-R / Rule 13 — the generated scorecard block is not stale (vitest-independent sections) > scripts/compute-parcel-cost-estimates.js (slug "compute_parcel_cost_estimates") > the committed block's vitest-independent sections equal a fresh `step:validate --fast` run
  - src/tests/step-conformance.infra.test.ts > R-R / Rule 13 — the generated scorecard block is not stale (vitest-independent sections) > scripts/load-address-points.js (slug "address_points") > the committed block's vitest-independent sections equal a fresh `step:validate --fast` run
  - src/tests/step-conformance.infra.test.ts > R-R / Rule 13 — the generated scorecard block is not stale (vitest-independent sections) > scripts/load-parcels.js (slug "parcels") > the committed block's vitest-independent sections equal a fresh `step:validate --fast` run
  - src/tests/step-conformance.infra.test.ts > R-R / Rule 13 — the generated scorecard block is not stale (vitest-independent sections) > scripts/load-centreline.js (slug "load_centreline") > the committed block's vitest-independent sections equal a fresh `step:validate --fast` run
  - src/tests/step-conformance.infra.test.ts > R-R / Rule 13 — the generated scorecard block is not stale (vitest-independent sections) > scripts/load-massing.js (slug "massing") > the committed block's vitest-independent sections equal a fresh `step:validate --fast` run
  - src/tests/step-conformance.infra.test.ts > R-R / Rule 13 — the generated scorecard block is not stale (vitest-independent sections) > scripts/load-neighbourhoods.js (slug "neighbourhoods") > the committed block's vitest-independent sections equal a fresh `step:validate --fast` run
  - src/tests/step-conformance.infra.test.ts > R-R / Rule 13 — the generated scorecard block is not stale (vitest-independent sections) > scripts/load-wsib.js (slug "load_wsib") > the committed block's vitest-independent sections equal a fresh `step:validate --fast` run
  - src/tests/step-conformance.infra.test.ts > R-R / Rule 13 — the generated scorecard block is not stale (vitest-independent sections) > scripts/load-heritage.js (slug "load_heritage") > the committed block's vitest-independent sections equal a fresh `step:validate --fast` run
  - src/tests/step-conformance.infra.test.ts > R-R / Rule 13 — the generated scorecard block is not stale (vitest-independent sections) > scripts/enrich-centreline.js (slug "enrich_centreline") > the committed block's vitest-independent sections equal a fresh `step:validate --fast` run
  - src/tests/step-conformance.infra.test.ts > R-R / Rule 13 — the generated scorecard block is not stale (vitest-independent sections) > scripts/load-zoning.js (slug "load_zoning") > the committed block's vitest-independent sections equal a fresh `step:validate --fast` run
  - src/tests/step-conformance.infra.test.ts > R-R / Rule 13 — the generated scorecard block is not stale (vitest-independent sections) > scripts/load-bylaw-map-areas.js (slug "load_bylaw_map_areas") > the committed block's vitest-independent sections equal a fresh `step:validate --fast` run
  - src/tests/step-conformance.infra.test.ts > R-R / Rule 13 — the generated scorecard block is not stale (vitest-independent sections) > scripts/link-parcel-abutments.js (slug "link_parcel_abutments") > the committed block's vitest-independent sections equal a fresh `step:validate --fast` run

### Policy coverage matrix (item vi) — Spec 124 Rules 1-13

| Rule | Name | Status | Note |
|---|---|---|---|
| 1 | Nothing hidden | enforced-red | G-1 schema-baseline: schema-baseline clean |
| 2 | Compute is just compute | enforced-green |  |
| 3 | Tunables externalized | enforced-green | G-4: no descriptor · P4/LW-D10/R-A not scoped to this step |
| 4 | Compute rule declared | enforced-green | G-2: 3 preserved-in-compute row(s), 0 with no why/notes.json/checks[] grounding |
| 5 | checks >= 1 | enforced-red |  |
| 6 | Omission fails (20 categories) | enforced-red |  |
| 7 | Archetype gates categories | enforced-red |  |
| 8 | Per-target write discipline | enforced-red |  |
| 9 | Banned write needs ledger (+ V7 no_retraction) | enforced-red |  |
| 10 | Verdict row-derived | enforced-green | (a) OK — 11 corpus file(s) scanned, 0 unsanctioned second derivations, 2 sanctioned hit(s) matched SANCTIONED_VERDICT_SITES · (b) OK — SELF_SKIPPED audit table folds to verdict=WARN (!= PASS), row-derived off 1 non-INFO row(s) — VRD-SKIP closed |
| 11 | Phase-order re-derive (declared half, checkOrderGuaranteesCited) | vacuous | no descriptor — G-3 completeness half stays open |
| 12 | Truthful crash posture (R-B reachability, static + R-M before-image) | enforced-green | R-B (checkInterruptedPostureTruthful): no descriptor · R-M: prose-only (R-M/LG-17 describe not scoped to this step (no before-image target)) |
| 13 | A step validates itself | enforced-red | this run of step:validate IS the mechanism |
| P3 | I/O cost adjudication (measured, not gated) | prose-only | descriptor=0B notes=0B checks=0 rows records_meta=(no capture) |

**Enforced-green: 5/14** · not-run: 0 · vacuous: 1

