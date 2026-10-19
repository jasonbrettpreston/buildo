# Phase 4 wave 4 — `compute_coa_cost_estimates` (scripts/compute-coa-cost-estimates.js) conversion assessment, commit ①

**Target standard:** McDonald's Airtight V3 (Spec 124 R-DF). That means zero purity findings with no ledger allowance (R-BZ), every gate hard from ① (R-BA), the seven admission questions including EXTERNALIZED, and admin visibility (R-DL).
**Archetype:** MATERIALIZER (ARCH-CENSUS wave-4 row, operator y 2026-10-18, Q8). This is the archetype of its twin compute_cost_estimates (census MATERIALIZER, `step-archetype-census.json:178-182`), so both writers of `cost_estimates` share one archetype.
**Commit form: full (Spec 123 §7, nine commits).** **Full form reason:** R-PACE-1 (Spec 124a:145) allows the compressed form only once two members of the archetype have landed in the full form and are in `converted.json`; MATERIALIZER has one (link_parcel_addresses), so fast invariant #23 COMPRESSED-FORM-ELIGIBLE refuses the compressed form, and R-AH (124a:149) leaves the full form as the only legal plan (operator Q5 y, 2026-10-19). An earlier version of this line claimed compressed eligibility from members still in flight; #23 counts converted members only. Rows 1–6 (PH-0, PH-3, PH-5, PH-6, the golden master, PH-7) are evidenced by commit ① (this report and the red suite) and the replay-night-N1 PRE (dedb7e90). Row 7 (descriptor + compute) lands at stage compute_ported (W4A-R6, Spec 124 R-EF) with the seeds migration (275); the legacy shell stays live. The row-8 peels' green differentials and row 9 (cutover, frozen shell, registration) need the POST, so they ride night P4 and ③.
**Library form landed.** The MATERIALIZER runner-built row form is Spec 124 R-EH (`execution.materialize_form: "rows"`, RE-FREEZE #37, operator y 2026-10-18 on Q-MZ); compute_coa_cost_estimates is one of its named members.
**Frozen legacy oracle:** `src/tests/steps/compute_coa_cost_estimates/fixtures/legacy-compute-coa-cost-estimates.js.txt`, byte-identical to the script (sha256 `801797aaf8d264a0…`, last changed by `fb593a9e`).
**Owner specs:** 42 (`42_chain_coa.md` §6.5 step 12, §6.6.D, §6.8 row 668) and 83 (`83_lead_cost_model.md` §3-ARCHETYPE, §Geometric-Only Path for CoA), per the SPEC LINK header at `:52-56`. Governing: 47, 48. **Target spec:** 42 (a census owner spec, R-DE (ii)).
**Chain:** `coa`, position 8 of 16 (`manifest.json:98`): after classify_coa_trades (its `lead_trades` and `trade_classified_at`), before link_coa.

---

## 1. PH-0 — Boundary freeze (G0)

### 1.1 Write class and transactions
- **Source:** one `pipeline.streamQuery`, a 6-table LEFT JOIN with three LATERALs (`:446-531`, pinned L5/L6):
  - primary parcel by `confidence DESC NULLS LAST, parcel_id ASC`;
  - primary building by `building_id ASC`;
  - active trade slugs aggregated from `lead_trades`.
- **Cursor:**
  - incremental: `cost_classified_at IS NULL OR cost_classified_at < trade_classified_at`;
  - `--full`: `trade_classified_at IS NOT NULL`;
  - always: `AND (trade_classified_at IS NULL OR trade_classified_at <= RUN_AT)`, then `ORDER BY ca.id ASC`, plus `LIMIT N` under `--limit` (L7).
- **Flush:** one `pipeline.withTransaction` per 1000 CoAs (`INSERT_BATCH_SIZE = Math.min(1000, floor(65534/16))` `:88`; pinned L14). Order inside the transaction (L12):
  1. **`cost_estimates`:** a 16-column VALUES upsert `ON CONFLICT (lead_id) DO UPDATE … WHERE` any of 12 columns `IS DISTINCT FROM` (computed_at excluded from the guard), `RETURNING (xmax = 0)` (`:358-404`, pinned L9/L10). Only non-NULL estimates are written.
  2. **`coa_applications`:** `UPDATE … SET modeled_gfa_sqm, estimated_cost, cost_source, cost_classified_at = RUN_AT FROM (VALUES …) v WHERE ca.id = v.id` for **every** processed CoA (`:410-430`).
- **Retraction:** none. A CoA whose estimate becomes NULL keeps its old cost_estimates row (CCCE-D1, pinned L11).
- **Post-run reads on the pool:** `PERCENTILE_CONT(0.25/0.50/0.75)` over `coa:` rows with `computed_at = RUN_AT` (`:653-669`), and the corpus priced/total counts (`:678-688`), pinned L17. Both are skipped in dry-run (L8).

### 1.2 Columns written
- `cost_estimates`: lead_id, permit_num (NULL), revision_num (NULL), estimated_cost, cost_source, cost_tier, cost_range_low, cost_range_high, premium_factor, complexity_score, model_version (`MODEL_VERSION`), is_geometric_override, modeled_gfa_sqm, effective_area_sqm, trade_contract_values (JSONB), computed_at (RUN_AT).
- `coa_applications`: modeled_gfa_sqm, estimated_cost, cost_source, cost_classified_at (RUN_AT).

### 1.3 Audit rows, verdict and `records_meta`
- **Audit table:** phase 42, "CoA Cost Estimation", 32 rows in a pinned order (L19, `:748-808`).
- **FAIL:** `cost_estimate_coverage_pct <= coa_cost_coverage_fail_pct` (threshold text `> 5%`).
- **WARN:** coverage below `coa_cost_coverage_threshold_pct` (text `>= 65%`); `archetype_map_nofit_residential_pct > archetype_nofit_residential_warn_pct`.
- **INFO:** 0 processed gives coverage `N/A` and `coa_eligible` INFO (L16).
- **`records_new` / `records_updated`:** cost_estimates RETURNING. `records_skipped` = rows the guard short-circuited (L13).

### 1.4 Config, guards and knobs
- **ConfigSchema:** 15 required/optional variables (`:93-117`), validated before the lock (L1).
- **Startup guards inside the lock:**
  - the migration-145 `pg_constraint` probe (`:160-170`, L3);
  - empty `trade_sqft_rates` and duplicate rate/matrix keys throw (`:191-219`, L4).
- **Knobs:** `--dry-run`, `--full`, `--limit=N` (`:122-132`); the `ARCHETYPE_COST_DISABLED=1` kill switch (`:241`, L18).
- **Lock:** 4204 (L2).

### 1.5 Live table facts (A.F-DB, from the wave-4 plan's read-only SELECTs; no DB query in this lane)
- RLS on for `cost_estimates` and `coa_applications`, so `rls_bypass_or_policy` (R-CT).
- `cost_estimates`: 20,486 `coa:` rows. The PK is `lead_id` (migration 145).

### 1.6 Consumers and co-writers (effective ledger)
- **`cost_estimates`:**
  - readers: assert_data_bounds, assert_global_coverage, refresh_snapshot, assert_entity_tracing, compute_opportunity_scores;
  - writers: this step and compute_cost_estimates (permits; wave 3). The two writers share the table and partition it by key prefix (`coa:` vs `permit:`), so every write here is scoped `lead_id LIKE 'coa:%'`.
- **`coa_applications` cost columns:** readers assert_data_bounds, assert_global_coverage, refresh_snapshot (and this step's self-read).
- **Reads the enrich_parcels max-build family on `coa_applications`** (`opt_aor_gfa_sqm … max_buildable_footprint_sqm`, `:473-482`; emitMeta `:864-866`). That family is written by enrich_coa_zoning from the enrich_parcels columns. **This behaviour is kept exactly** (pinned L6, D3):
  - Spec 78 O-11 keeps the enrich columns unchanged until the shadow classifier (`.cursor/mcbylaws-airtight-summary-2026-10-18.md:84`);
  - QUEUE `.cursor/QUEUE.md:1120` records this step as a consumer that must migrate before any enrich column switch.

### 1.7 Admin visibility (R-DL)
- `PIPELINE_REGISTRY` ✓ (`FreshnessTimeline.tsx:61`).
- `STEP_DESCRIPTIONS` exists (`funnel.ts:687`), but its text "Geometric-only cost estimator" is false (CCCE-D9).
- **`PIPELINE_TABLE_MAP` has no entry.** It is owed at ② (CCCE-D9; carved out at ① by R-DV).
- `telemetry_tables` = cost_estimates, coa_applications ✓.

## 2. Behaviour ledger
The legacy pins L1–L20 in `src/tests/steps/compute_coa_cost_estimates/violations.test.ts` (GREEN at ①) execute the frozen text with the REAL Brain (`src/features/leads/lib/cost-model-shared.js`) and `scripts/lib/coa-cost-model.js`.

## 3. Registry target review
| Field | Target |
|---|---|
| archetype / shape | MATERIALIZER / `materialize`, `materialize_form: "rows"` |
| lock | 4204 |
| writes (declared order) | e1 `cost_estimates` A guarded_upsert (12 guard columns; computed_at `source:"run_at"` outside the guard), `retract:"none"` + why CCCE-D1, `key_prefix {lead_id, "coa:"}`; e2 `coa_applications` G keyed update (modeled_gfa_sqm, estimated_cost, cost_source; cost_classified_at run_at), unguarded (parity: legacy updates every processed row) |
| lookups | trade_sqft_rates (unique_on trade_slug, on_empty fail), scope_intensity_matrix (unique_on permit_type, structure_type), archetype_cost_rates (unique_on archetype) |
| guards.requires | index `cost_estimates_pkey` (CCCE-D4); rls ×2 |
| overrides | force_full (`--full`), dry_run; `--limit` retired (declared deviation) |
| reads | coa_applications incl. the 10 max-build columns (pinned), lead_parcels, parcels, parcel_buildings, building_footprints, neighbourhoods, lead_trades, trades |
| recovery.reset | NULL `cost_classified_at` for the run's scope |

## 4. PH-3 — Intent ledger
1. **Price each CoA.** Archetype ladder first: `tryArchetypeCost` over `buildCoaArchetypeInput`, which is T2 or nothing. If that returns nothing, fall through to the legacy geometric `estimateCostShared`, i.e. T4 (`:543-551`).
2. **Persist.** Write the estimate when it is non-NULL, and always advance the CoA's cost columns and watermark.
3. **Telemetry.** Null-reason priority and additive tallies; archetype tier counts; coverage gates.

Each intent traced to the commit that introduced it (`git log -S … -- scripts/compute-coa-cost-estimates.js`, measured 2026-10-19 at full-form row 7). The disposition column is the agent's proposal; the operator adjudicated the open ones as Q-C3, Q-CE1..Q-CE3 (2026-10-18) (Spec 121 §12.5).

| Intent | Source (introducing commit) | Disposition at row 7 |
|---|---|---|
| Geometric T4 pricing per CoA | `c5899432` (WF1 R5.5) | preserved-in-compute (the Brain closure unchanged); why in notes.json read_this_way |
| Archetype ladder first (T2), T4 fallthrough | `4442fb75` (Spec 83) | preserved-in-compute; why in notes.json read_this_way |
| ARCHETYPE_COST_DISABLED kill switch | `4442fb75` | encoded-as-descriptor-field (shared `archetype_cost_enabled`, Q-CE1) |
| Guarded cost_estimates upsert | `c5899432` | preserved-in-runner (R-EH A, IS DISTINCT FROM guard kept) |
| Unconditional cost columns + watermark | `c5899432` | preserved-in-runner (R-EH G; `guard: "none"` grandfathered, Q-CE2) |
| Migration-145 PK probe | `c5899432` | preserved-in-validator (`guards.requires`, CCCE-D4) |
| Distribution percentiles | `c5899432` | preserved-in-runner (`buildPostSql`, pinned percentile variables, CCCE-D6) |
| Coverage WARN floor | `c5899432` | encoded-as-descriptor-field (`compute_coa_cost_estimates_coverage_threshold_pct`, copied) |
| Coverage FAIL floor | `4442fb75` | encoded-as-descriptor-field (`compute_coa_cost_estimates_coverage_fail_pct`, copied) |
| Advisory lock 4204 | `c5899432` | preserved-in-runner (`identity.lock`) |
| `--limit` debugging knob | `c5899432` | retired (declared deviation, Q-CE1) |

## 5. PH-5 — Seam map
| Seam | Legacy site | Converted owner |
|---|---|---|
| clock seam | `getDbTimestamp`, `Date.now` | runner RUN_AT / duration |
| db seam | zod ConfigSchema (`:93-117`) | `config.logic_variables` (R-CV); runner `failed_config_out_of_bounds` |
| argv/env seam | argv / env knobs (`:122-132`, `:241`) | `override.force_full`, `overrides.dry_run`, `archetype_cost_enabled` (shared); `--limit` retired (CCCE-D3, Q-CE1) |
| db seam | mig-145 probe (`:160-170`) | `guards.requires` index (CCCE-D4) |
| db seam | reference reads and guards (`:173-219`) | runner lookups (CCCE-D5) |
| db seam | `streamQuery` (`:446-531`) | `buildSourceSql(mode)`; runner keyset over `coa_applications.id` with `$3` = RUN_AT for the future guard |
| compute | per-row Brain call (`:533-645`) | pure `materializeRows` (the Brain closure unchanged) |
| db seam | `flushBatch` (`:313-436`) | runner ROWS arm: e1 A, e2 G, one txn per batch |
| db seam | percentile / corpus reads (`:653-688`) | `buildPostSql` (CCCE-D6) |
| verdict | coverage / nofit statuses (`:723-746`) | declared checks (CCCE-D7) |
| network seam | none (no outside call) | — |

**Parity notes:**
- **Keyset vs cursor:** this step is the only writer of `cost_classified_at`, and the future guard holds a later `trade_classified_at` out of both forms.
- **`--limit`:** retired. It is an operator debugging knob with no production caller (the manifest invocation passes none).

### 5.1 Risk class
**MEDIUM-HIGH.**

| Risk class | Chance | Impact | Mitigation |
|---|---|---|---|
| A write touches permit: rows of cost_estimates (sibling writer compute_cost_estimates) | low | high — permit leads lose or gain estimates | `key_prefix {lead_id, coa:}` refuses an out-of-family row before the batch transaction (R-EH (d)) |
| The 992-line Brain enters a gate-E G0 closure for the first time | medium | medium — a purity finding blocks wave 3 too | one scan result shared with the wave-3 twin (wave-4 plan §B.2.6 note 3); Brain constants are PIN EXT-CLOSURE (Q-C4) |
| The renamed range variables diverge from the legacy names in the copy window | low | low — an admin edit has no effect until cutover | R-EO badges the copies "Takes effect at cutover"; migration 275 carries the live values |

PH-2 (churn × complexity): ASSESSMENT-INCOMPLETE because the generated batch artifact `docs/reports/generated/122-churn-complexity.md` covers only the sources chain and `compute_coa_cost_estimates` is outside its scope; no hand-plotted quadrant is substituted.

## 6. PH-6 — Classification and defect ledger (rows CCCE-D1…CCCE-D10 in `docs/reports/defect-ledger.md`; prefix CCCE, the initials default, unique across all manifest slugs — fast invariant #42)

The rows are defined once, in `docs/reports/defect-ledger.md`; this list is the assessment-side summary.

- **CCCE-D1**: a stale cost_estimates row survives a NULL cost (legacy parity defect) — **declared deviation** (operator y, Q12); follow-up fix with its own capture
- **CCCE-D2**: batch / progress / percentile literals (EXTERNALIZED) — migration 275
- **CCCE-D3**: argv/env operator knobs (R-BD) — overrides plus a variable; Q-CE1
- **CCCE-D4**: catalog probe in the step (G3) — `guards.requires`
- **CCCE-D5**: reference reads and startup throws in the step (G2) — runner lookups
- **CCCE-D6**: post-run reads in the step; the percentile set excludes guard-skipped rows (parity) — `buildPostSql`
- **CCCE-D7**: the step decides coverage and nofit statuses (G7) — declared checks
- **CCCE-D8**: variable naming; two seeds missing from the JSON (R-DE (v), R-CV) — migration 275; shared family Q-C3
- **CCCE-D9**: false admin description; no table-map entry (R-DL) — ②
- **CCCE-D10**: constant `phase_h_gap_active: true` asserts a stale state (ACCURATE) — retired at ②

## 7. PH-6 — Literal ledger (Rule 3, R-DF EXTERNALIZED)
| Literal | Site | Converted |
|---|---|---|
| `Math.min(1000, …)` batch | `:88` | `compute_coa_cost_estimates_batch_size` = 1000 (R-DE (i)); 65534/16 is the R-CU protocol limit |
| `PERCENTILE_CONT(0.25/0.50/0.75)` | `:657-659` | `compute_coa_cost_estimates_distribution_p{25,50,75}` pinned min = max (R-CV definitional form: the metric name `cost_distribution_p25_p50_p75` defines them), bound as parameters |
| progress `5000` | `:638` | retired with the shell |
| `'en-CA'` money format, `toFixed(1)` | `:697`, `:707-746` | display formatting, not a tunable (no decision reads it); kept, with a notes `constants` entry |
| `coa_cost_coverage_threshold_pct` (65), `coa_cost_coverage_fail_pct` (5) | seeds | re-seeded as `compute_coa_cost_estimates_coverage_{threshold,fail}_pct` (R-DE (v)); the old names retire at ③ |
| `ARCHETYPE_COST_DISABLED` env | `:241` | `archetype_cost_enabled` 0/1, default 1, a SHARED variable: the runbook flips it for both cost Muscles (`runbooks/83_archetype_cost_rollback.md:21`), so it joins the Q-C3 shared list with compute_cost_estimates (Q-CE1) |
| the shared cost-model family: liar_gate_threshold, model_range_pct, fallback_range_pct, urban/suburban_coverage_ratio, archetype_nofit_residential_warn_pct, archetype_t1_fsi_min/max, archetype_t1_total_cap, archetype_t2_reno_line_cap, archetype_t2_build_line_cap/min, archetype_t3_total_cap, cost_escalation_index | read by both cost steps and the Brain | **Q-C3** (shared-model arm, agreed with wave 3); `model_range_pct` / `fallback_range_pct` gain seeds JSON rows (CCCE-D8) |
| the Brain's module constants (`cost-model-shared.js`, 992 lines, 8 module numeric consts per the wave-4 plan §B.2.6) | closure | **Q-C4** PIN EXT-CLOSURE (outside gate E's compute-file scan, `compute-literals.mjs:152`) |

## 8. Purity estimate (gate E G0–G13, 122a §A26), against the converted compute
- **G1, G3–G6, G8, G10–G13:** 0 expected. The `pg_constraint` probe, the clock, the transactions and the DML all move to the runner. G13: the converted compute has no catch.
- **G2:** the source and post `*_sql` read only declared relations: the 8 source tables plus `cost_estimates` (post) and `coa_applications` (corpus).
- **G7:** 0 once the statuses move to declared checks.
- **G9:** 0 once the literals are config.
- **G0 closure:** `coa-cost-model.js` and `cost-model-shared.js` (no SQL by inspection; to be measured with `compute-purity.mjs --list` at ②).

## 9. PRE goldens and forced-change proof — NOT YET CAPTURED
- PRE: night P3, after classify_coa_trades' PRE (chain order).
- POST and #38: night P4. The bracket NULLs `cost_classified_at` on a priced `coa:` cohort.
- R-DP: the cohort's `cost_estimates` rows are deleted and reinserted (no inbound FK, per the wave-4 plan §B.4).
- Downstream replay: refresh_snapshot, assert_data_bounds, assert_global_coverage, compute_opportunity_scores, link_coa.

## 10. Red suite (PH-7) — `src/tests/steps/compute_coa_cost_estimates/violations.test.ts`
- **29 tests:** L1–L20 GREEN and D1–D9 `it.fails`.
- **Gate-K red evidence:** `docs/reports/red-evidence/compute_coa_cost_estimates/pre2-artifacts-missing.json` (D flipped: 20 pass, 9 fail).
  - D1–D7 fail as ENOENT on the named descriptor and compute.
  - D8 fails on the scorecard.
  - D9 fails on `converted[]`.

## 11. Registry at ① and what is owed later
- **At ①:**
  - `converted.json` pending at `red_suite`;
  - census UNDECLARED/C6 → MATERIALIZER/pending, owner_specs 42 + 83 (plus the two fixtures);
  - roadmap regenerated; `conversion-roadmap.infra.test.ts` re-pinned (pendingBatch 4 → 5, C6 33 → 32);
  - ADOPTION `legacy_oracle_excluded` (19/7/8);
  - CCCE-D1…D10.
- **R-DU:** non-blocking (no descriptor).
- **At ②:** descriptor, compute, shell, notes, migration 275 plus seeds JSON, PIPELINE_TABLE_MAP, STEP_DESCRIPTIONS, and the rollback runbook. All of it waits on Q-MZ (and Q-C3 / Q-CE1).
- **At ③:** blocked by EP-PIN-D17 (R-EA).

## 12. Operator decisions
**RULED 2026-10-18 (wave-4 plan, all 15 y):**
- Q8 MATERIALIZER;
- Q12 CCCE-D1 as a declared deviation;
- Q13 nights P3/P4.

**UNRULED, drafted:**
- **Q-MZ:** the MATERIALIZER ROWS form. **Recommend y.**
- **Q-C3:** the R-DE (v) shared-model arm (the cost-model family keeps its names, listed once with both cost steps and the Brain named). **Recommend y.**
- **Q-C4:** PIN EXT-CLOSURE for Brain constants. **Recommend y.**
- **Q-CE1:** knobs. `--full` = force_full; `--dry-run` = dry_run; `--limit` retired (declared deviation); `ARCHETYPE_COST_DISABLED` becomes the shared logic variable `archetype_cost_enabled` (0/1, default 1; the runbook flips it for both cost Muscles, `:21`, so it is decided with wave 3), with `docs/specs/01-pipeline/runbooks/83_archetype_cost_rollback.md` updated in the ② commit. **Recommend y.**
- **Q-CE2:** keep the coa_applications cost-column update unguarded (parity: every processed row advances its watermark). **Recommend y.**

## 13. Compliance table (seven questions, R-DF)
| Question | Answer at ① |
|---|---|
| STANDARDIZED | MATERIALIZER, the same archetype as its twin; precedents link_parcel_addresses (form) and compute_parcel_cost_estimates (`d79191cf` → `01a07218`, the JS Brain) |
| OBSERVABLE | L1–L20 / D1–D9; `step-validate compute_coa_cost_estimates` (red at red_suite, non-blocking per R-DU) |
| RECORDED | converted.json pending, census, CCCE-D1…D10, this report |
| SCALABLE | the ROWS form serves 4 members |
| ACCURATE | file:line; the real Brain in the oracle; red evidence |
| SIMPLE | the Brain is unchanged; only I/O and status decisions move |
| EXTERNALIZED | §7: batch, percentiles, kill switch, coverage names; shared family Q-C3; closure Q-C4 |

## 14. V3 package (Spec 124 `:275`, six parts) — state at ①
| Part | State | Evidence |
|---|---|---|
| (1) STANDARDIZED GATES | **MET at row 7** (compute_ported) | The descriptor landed, so gates A–K run; the capture-derived gates (G8, #30, #38, #40) are stage-gated until the night-P4 POST (Spec 124 R-EF). Gate K evidence is the artifact cited in the red-suite section above. |
| (2) REGISTRY | **PARTIAL**: pending ✓, census ✓, slug-keyed R-DL arms ✓ (`FreshnessTimeline.tsx:61`, `funnel.ts:687`, text false = CCCE-D9); PIPELINE_TABLE_MAP **OWED** | `scripts/steps/_schema/converted.json` |
| (3) CROSS-STEP TRUTH | **OWED**: `coa:` partition declared against the sibling writer; #44 after captures | §1.6 |
| (4) COMPUTE PURITY | **OWED** (②): draft compute uncommitted | `scripts/lib/compute/compute-coa-cost-estimates.js` (draft) |
| (5) EXTERNALIZED | **OWED** (②): migration 275 drafted; Q-C3/Q-C4/Q-CE1 open | `migrations/275_compute_coa_cost_estimates_logic_variables.sql` (draft) |
| (6) REPRODUCIBLE CAPTURES | **OWED**: P3/P4 | §9 |

## R. Reflection (G9)
### LOW-CONFIDENCE
- **`--limit` retirement:** no caller was found in the manifest or chain invocation, but an operator runbook may use it. Check `runbooks/` at ②.
- **The percentile semantics (CCCE-D6)** look like an unnoticed legacy quirk. Kept for parity.

### RECURRING / STANDARD-SHAPING
- **Two writers of one table, partitioned by key prefix.** `key_prefix` (ruling §2 (d)) makes the partition a declared, runner-checked fact rather than a comment. compute_cost_estimates should declare `permit:`.

## A. Measurement log (2026-10-18)
- `shasum -a 256 scripts/compute-coa-cost-estimates.js` → `801797aaf8d264a0f55806fafa37223e5ac4c2bdc019b006dd6acf64403e9259`; last change `fb593a9e`.
- `defectPrefixFor`: CCCE → [compute_coa_cost_estimates] only.
- effective ledger: §1.6.
- Brain probe: the `priced()` fixture yields `archetype_parcel` 250000 (T2, `_archetypeTier` "t2"); `unpriced()` yields `cost_source` "none".
- `npx vitest run src/tests/steps/compute_coa_cost_estimates/violations.test.ts` → 29 passed; red evidence 20/9.

---

## Validation scorecard (generated)

> Generated by `node scripts/analysis/step-validate.mjs --step=compute_coa_cost_estimates --write` — Spec 123 §6, ruling R-R (2026-08-29).
> Regenerate with the same command; a stale block is a conformance-lock finding (`step-conformance.infra.test.ts`).

**Score: 13/17** · G9 Reflection: PASS · G4d fence-lock coverage: PASS · G-shape: PASS · **Hard stop: no**

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
| G1 | 1 | 1 | PH-3 section found=true sha-count=11 |
| G2 | 1 | 1 | no generated churn×complexity row; no PH-2 section; ASSESSMENT-INCOMPLETE claimed instead; why-stated=true |
| G3 | 1 | 2 | table rows=12 vocab-hit rows=10 |
| G4 | 2 | 2 | risk-class row with chance+impact found=true |
| G5 | 1 | 1 | db=true clock=true network=true argv/env=true |
| G6 | 3 | 3 | 10 ledger row(s), 0 without CLOSED/PIN () |
| G7 | 3 | 3 | file=true fences=1 it-count=32 red-evidence-claims=1 red-evidence-pass=true ledger-deferred=false |
| G8 | 0 | 3 | missing-invocations=2 missing-pre-invocations=0 stale-fingerprints=0 unexplained-diffs=0 — stage-gated (compute_ported) |
| G9 (binary) | PASS | — | heading=true low-confidence-table=true recurring-table=true |
| G4d (fence<=lock) | PASS | — | fences=1 lock-it-count=32 |
| G-shape | PASS | — | file-clean=null compute-clean=true |

### Fast invariants (always run — the fast descriptor gate)

| # | Scope | Pass | Detail |
|---|---|---|---|
| 1 | compute_coa_cost_estimates | PASS | min_migration=207 <= migrations count=267 |
| 2 | compute_coa_cost_estimates | PASS | 21 declared, missing from seeds: none |
| 3 | compute_coa_cost_estimates | PASS | retired=0 overlap-with-declared=none |
| 7 | compute_coa_cost_estimates | PASS | SPEC LINK header present=true |
| 8 | compute_coa_cost_estimates | PASS | G-4: 21 declared, 2 verdict-affecting, 0 violate on_invalid:fail with no deviations[] cover |
| 20 | compute_coa_cost_estimates | PASS | HB-1: execution.shape="materialize" — HB-1 applies_when execution.shape=="enrich" only (RS-D-STA); not applicable, never a pass-by-omission |
| 21 | compute_coa_cost_estimates | PASS | CEIL-1: execution.shape="materialize" — CEIL-1 applies_when execution.shape=="enrich" only (RS-D-STA); not applicable, never a pass-by-omission |
| 4 | (registry) | PASS | overlap: none |
| 5 | (registry) | PASS | clean (0 it.fails( call sites outside a declared pending slug) |
| 9 | (registry) | PASS | clean (0 converted slugs blocked by an unmet cutover_prereq item; blocks batching: 0) |
| 22 | (registry) | PASS | GOLD-PRE-FRESH: 83 PRE capture(s) across 27 converted step(s) all tracked + clean (git can restore every reference); net-new (R-DK): load_bylaw_map_areas, link_parcel_abutments |
| 23 | (registry) | PASS | COMPRESSED-FORM-ELIGIBLE: 4 compressed-form declaration(s), all eligible (proven archetype, >=2 converted members) |
| 24 | (registry) | PASS | COMPRESSED-FORM-DEFAULT: 4 eligible pending slug(s), all either compressed or carry a stated full-form reason |
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
| 36 | (registry) | PASS | DEFECT-ID-UNIQUENESS (gate I): 495 definition row(s) checked, 101 legal mirror(s), 0 disagreements |
| 38 | (registry) | PASS | CAPTURE-NONZERO (gate G): every declared write target is closed (0 ledger-allowed, 4 outputs:"none" vacuous) |
| 39 | (registry) | PASS | CAPTURE-FRESHNESS (gate G): 89 post capture(s) checked against scripts/lib/step/**, all fresh or ledger-allowed |
| 40 | (registry) | PASS | CAPTURE-EXPLAINED (gate G): 29 step(s) checked — every diff-explanation channel accounted for |
| 32 | (registry) | PASS | COMPUTE-LITERALS (gate E): 1 finding(s), all ledger-allowed (1); ESTATE-LITERALS (gate E estate arm, R-EB): 0 finding(s) in scripts/analysis/gates, scripts/lib/step; tooling ratchet (PIN EXT-2) 128 finding(s) over 6 files, at or below the marks |
| 41 | (registry) | PASS | RED-EVIDENCE (gate K): 0 step(s) without a committed red-evidence artifact; 0 orphan ledger row(s) |
| 42 | (registry) | PASS | DEFECT-PREFIX-UNIQUE: 43 slug(s), every defect prefix unique |
| 45 | (registry) | PASS | NOTES-CAP: 22 declaring notes file(s), every one <= 12 prose entries |
| 46 | (registry) | PASS | report-only (adoption); enforced by #44 (a)/(c) (R-DB; fold 9 C7-1/C7-2): checks[].reads declared by 3/29 step(s); write_inventory.by_mode declared by 0/29 |
| 52 | (registry) | PASS | PRECOMMIT-BUDGET (R-EC): docs-only 24.65 s <= 25.3 s; registry-input 24.41 s <= 27.5 s; measured 2026-10-18T18:40:16.223Z on Bretts-Mac-Mini.local (darwin arm64, 12 cpu), hook sha matches |
| 47 | (registry) | PASS | MODE-EMITS-TYPE (P2-C5): 29 step(s) mode_select per archetype; 531 emits.type check(s), 0 mismatches |
| 48 | (registry) | PASS | LOGIC-VERSION (P2-C3): 29 step(s) logic_version <=> code_version trigger; 35 fingerprint_inputs entr(y/ies) examined, 0 violations |
| 49 | (registry) | PASS | TERMINALS-RECORDS-META (#75): 29 step(s); 344 declared-key check(s), 0 violations; 168 terminal(s) unwitnessed (no capture) |
| 51 | (registry) | PASS | ADMIN-REGISTRATION (R-DL/R-DW): 43 converted/pending step(s) admin-verifiable (8 without a descriptor: slug arms only, R-DV); no hand-written range on a converted step |
| 53 | (registry) | PASS | VARIABLE-EFFECT (R-EO): 28 take effect at cutover, 9 not read; admin badges current |

### Captures (item iv)
- missing invocations (POST): coa::, none::
- missing invocations (PRE, GOLD-PRE): none
- stale fingerprints: none
- compare ran: false · diffs found: 0 · unexplained: 0

### Test suite (item iii)
- SKIPPED or failed to run: --fast: vitest spawn skipped

### Policy coverage matrix (item vi) — Spec 124 Rules 1-13

| Rule | Name | Status | Note |
|---|---|---|---|
| 1 | Nothing hidden | enforced-green | G-1 schema-baseline: schema-baseline clean |
| 2 | Compute is just compute | not-run | §5.5 describe not evaluated — vitest did not run (--fast); shape scan is NOT a substitute for the §5.5 suite |
| 3 | Tunables externalized | enforced-green | G-4: 21 declared, 2 verdict-affecting, 0 violate on_invalid:fail with no deviations[] cover · P4/LW-D10/R-A not evaluated (vitest did not run) |
| 4 | Compute rule declared | enforced-green | G-2: 2 preserved-in-compute row(s), 0 with no why/notes.json/checks[] grounding |
| 5 | checks >= 1 | enforced-green |  |
| 6 | Omission fails (20 categories) | enforced-green |  |
| 7 | Archetype gates categories | enforced-green |  |
| 8 | Per-target write discipline | enforced-green |  |
| 9 | Banned write needs ledger (+ V7 no_retraction) | enforced-green |  |
| 10 | Verdict row-derived | enforced-green | (a) OK — 11 corpus file(s) scanned, 0 unsanctioned second derivations, 2 sanctioned hit(s) matched SANCTIONED_VERDICT_SITES · (b) OK — SELF_SKIPPED audit table folds to verdict=WARN (!= PASS), row-derived off 1 non-INFO row(s) — VRD-SKIP closed |
| 11 | Phase-order re-derive (declared half, checkOrderGuaranteesCited) | vacuous | no when:"pre_write" checks — vacuously nothing to cite — G-3 completeness half stays open |
| 12 | Truthful crash posture (R-B reachability, static + R-M before-image) | enforced-green | R-B (checkInterruptedPostureTruthful): recovery.interrupted="none" — no reachability claim to verify · R-M: not-run (R-M/LG-17 not evaluated — vitest did not run (--fast)) |
| 13 | A step validates itself | enforced-green | this run of step:validate IS the mechanism |
| P3 | I/O cost adjudication (measured, not gated) | prose-only | descriptor=28995B notes=2001B checks=2 rows records_meta=(no capture) |

**Enforced-green: 11/14** · not-run: 1 · vacuous: 1

